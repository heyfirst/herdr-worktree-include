import { constants as fsConstants } from "node:fs";
import { copyFile, lstat, mkdir, readlink, symlink } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { plan, type SkipReason } from "./plan";

const INCLUDE_FILE = ".worktreeinclude";
const EXIT_OK = 0;
const CHECK_IGNORE_NONE_IGNORED = 1;

export type FileOutcome =
  | { tag: "copied"; path: string }
  | { tag: "skipped"; path: string; reason: SkipReason }
  | { tag: "failed"; path: string; error: string };

export type Outcome =
  | { tag: "no-target" }
  | { tag: "no-source"; target: string }
  | { tag: "is-main"; path: string }
  | { tag: "no-manifest"; source: string }
  | { tag: "applied"; source: string; target: string; files: FileOutcome[] };

export async function apply(sourceRoot: string, targetRoot: string): Promise<Outcome> {
  const source = await gitTopLevel(sourceRoot);
  const target = await gitTopLevel(targetRoot);
  if (source === target) return { tag: "is-main", path: source };

  const includePath = join(source, INCLUDE_FILE);
  if (!(await exists(includePath))) return { tag: "no-manifest", source };

  const candidates = await matchedCandidates(source, includePath);
  const existingInTarget = await existingPaths(target, candidates);
  const otherWorktrees = await otherWorktreeRelativePaths(source);
  const planned = plan({ candidates, existingInTarget, otherWorktrees });

  const files: FileOutcome[] = [];
  for (const item of planned) {
    files.push(
      item.step === "skip"
        ? { tag: "skipped", path: item.path, reason: item.reason }
        : await copyOne(source, target, item.path)
    );
  }
  return { tag: "applied", source, target, files };
}

export async function mainWorktreeOf(path: string): Promise<string | null> {
  const [first] = await worktreeRoots(path);
  return first ?? null;
}

async function copyOne(source: string, target: string, path: string): Promise<FileOutcome> {
  const from = join(source, path);
  const to = join(target, path);
  try {
    await mkdir(dirname(to), { recursive: true });
    const stat = await lstat(from);
    if (stat.isSymbolicLink()) {
      await symlink(await readlink(from), to);
    } else {
      await copyFile(from, to, fsConstants.COPYFILE_EXCL);
    }
    return { tag: "copied", path };
  } catch (error) {
    return { tag: "failed", path, error: error instanceof Error ? error.message : String(error) };
  }
}

async function matchedCandidates(source: string, includePath: string): Promise<string[]> {
  const included = await runGit(
    ["ls-files", "--others", "--ignored", "-z", `--exclude-from=${includePath}`],
    source
  );
  if (!included || included.length === 0) return [];

  const ignored = await runGit(["check-ignore", "-z", "--stdin"], source, included, [
    EXIT_OK,
    CHECK_IGNORE_NONE_IGNORED,
  ]);
  return splitNull(ignored);
}

async function existingPaths(target: string, candidates: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  for (const path of candidates) {
    if (await exists(join(target, path))) existing.add(path);
  }
  return existing;
}

async function otherWorktreeRelativePaths(source: string): Promise<string[]> {
  const main = resolve(source);
  return (await worktreeRoots(source))
    .map((root) => resolve(root))
    .filter((root) => root !== main)
    .map((root) => relative(main, root))
    .filter((rel) => rel.length > 0 && !rel.startsWith(".."));
}

async function worktreeRoots(path: string): Promise<string[]> {
  const out = await runGit(["worktree", "list", "--porcelain"], path);
  const prefix = "worktree ";
  return (out?.toString("utf8") ?? "")
    .split("\n")
    .filter((line) => line.startsWith(prefix))
    .map((line) => line.slice(prefix.length));
}

async function gitTopLevel(path: string): Promise<string> {
  const out = await runGit(["rev-parse", "--show-toplevel"], path);
  return out?.toString("utf8").trim() || path;
}

function exists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false
  );
}

function splitNull(buf: Buffer | null): string[] {
  return (buf?.toString("utf8") ?? "").split("\0").filter((s) => s.length > 0);
}

async function runGit(
  args: string[],
  cwd: string,
  input?: Buffer,
  okCodes: readonly number[] = [EXIT_OK]
): Promise<Buffer | null> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdin: input ?? "ignore",
    stdout: "pipe",
    stderr: "ignore",
  });
  const stdout = Buffer.from(await new Response(proc.stdout).arrayBuffer());
  return okCodes.includes(await proc.exited) ? stdout : null;
}
