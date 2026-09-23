import { constants as fsConstants } from "node:fs";
import { copyFile, lstat, mkdir, readFile, readlink, symlink } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { plan, type CopyPlan } from "./plan";

const INCLUDE_FILE = ".worktreeinclude";

export type Report = CopyPlan & {
  source: string;
  target: string;
  failed: { path: string; error: string }[];
};

export async function apply(sourceRoot: string, targetRoot: string): Promise<Report> {
  const source = await gitTopLevel(sourceRoot);
  const target = await gitTopLevel(targetRoot);
  const empty: Report = { source, target, copy: [], skipped: [], failed: [] };

  if (source === target) return empty;

  const includePath = join(source, INCLUDE_FILE);
  const hasInclude = await readFile(includePath, "utf8").then(
    () => true,
    () => false
  );
  if (!hasInclude) return empty;

  const candidates = await matchedCandidates(source, includePath);
  const existingInTarget = await existingPaths(target, candidates);
  const otherWorktrees = await otherWorktreeRelativePaths(source);

  const { copy, skipped } = plan({ candidates, existingInTarget, otherWorktrees });

  const failed: { path: string; error: string }[] = [];
  const copied: string[] = [];
  for (const path of copy) {
    try {
      await copyOne(source, target, path);
      copied.push(path);
    } catch (err) {
      failed.push({ path, error: String(err instanceof Error ? err.message : err) });
    }
  }

  return { source, target, copy: copied, skipped, failed };
}

export async function mainWorktreeOf(path: string): Promise<string | null> {
  const out = await runGit(["worktree", "list", "--porcelain"], path);
  if (out === null) return null;
  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) return line.slice("worktree ".length);
  }
  return null;
}

async function gitTopLevel(path: string): Promise<string> {
  const out = await runGit(["rev-parse", "--show-toplevel"], path);
  return out?.trim() ?? path;
}

async function matchedCandidates(source: string, includePath: string): Promise<string[]> {
  const included = await runGitRaw(
    ["ls-files", "--others", "--ignored", "-z", `--exclude-from=${includePath}`],
    source
  );
  if (included === null || included.length === 0) return [];

  const ignored = await runGitRaw(["check-ignore", "-z", "--stdin"], source, included);
  return splitNull(ignored ?? Buffer.alloc(0));
}

async function existingPaths(target: string, candidates: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  for (const path of candidates) {
    const exists = await lstat(join(target, path)).then(
      () => true,
      () => false
    );
    if (exists) existing.add(path);
  }
  return existing;
}

async function otherWorktreeRelativePaths(source: string): Promise<string[]> {
  const out = await runGit(["worktree", "list", "--porcelain"], source);
  if (out === null) return [];
  const roots: string[] = [];
  for (const line of out.split("\n")) {
    if (!line.startsWith("worktree ")) continue;
    const abs = line.slice("worktree ".length);
    const resolved = resolve(abs);
    if (resolved === resolve(source)) continue;
    const rel = relative(source, resolved);
    if (rel && !rel.startsWith("..")) roots.push(rel);
  }
  return roots;
}

async function copyOne(source: string, target: string, path: string): Promise<void> {
  const from = join(source, path);
  const to = join(target, path);
  const stat = await lstat(from);

  await mkdir(dirname(to), { recursive: true });

  if (stat.isSymbolicLink()) {
    const linkTarget = await readlink(from);
    await symlink(linkTarget, to);
    return;
  }
  await copyFile(from, to, fsConstants.COPYFILE_EXCL);
}

function splitNull(buf: Buffer): string[] {
  return buf
    .toString("utf8")
    .split("\0")
    .filter((s) => s.length > 0);
}

async function runGit(args: string[], cwd: string): Promise<string | null> {
  const out = await runGitRaw(args, cwd);
  return out === null ? null : out.toString("utf8");
}

async function runGitRaw(args: string[], cwd: string, stdin?: Buffer): Promise<Buffer | null> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdin: stdin ? "pipe" : "ignore",
    stdout: "pipe",
    stderr: "ignore",
  });
  if (stdin && proc.stdin && typeof proc.stdin !== "number") {
    proc.stdin.write(stdin);
    proc.stdin.end();
  }
  const stdout = await new Response(proc.stdout).arrayBuffer();
  const exitCode = await proc.exited;
  if (exitCode !== 0 && exitCode !== 1) return null;
  return Buffer.from(stdout);
}
