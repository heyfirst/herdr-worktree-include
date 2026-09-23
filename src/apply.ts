import { constants as fsConstants } from "node:fs";
import { copyFile, lstat, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { assertExhausted } from "./assert";
import { plan, type SkipReason } from "./plan";
import { groupByIgnoredDir, namesDirectory, patternKind, positivePatterns } from "./reach";

const INCLUDE_FILE = ".worktreeinclude" as const;
const EXIT_OK = 0;
const CHECK_IGNORE_NONE_IGNORED = 1;

export type FileOutcome =
  | { tag: "copied"; path: string }
  | { tag: "skipped"; path: string; reason: SkipReason }
  | { tag: "failed"; path: string; error: string };

export type Outcome =
  | { tag: "no-target"; reason: string }
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
        : await copyOne(source, target, item.path),
    );
  }
  return { tag: "applied", source, target, files };
}

export type MainWorktree = { tag: "found"; path: string } | { tag: "none" };

export async function mainWorktreeOf(path: string): Promise<MainWorktree> {
  const [first] = await worktreeRoots(path);
  return first ? { tag: "found", path: first } : { tag: "none" };
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
  const included = await runGit(["ls-files", "--others", "--ignored", "-z", `--exclude-from=${includePath}`], source);
  const ignored = await onlyGitIgnored(source, nulSeparated(included));
  return dropUnreachedIgnoredDirs(source, includePath, ignored);
}

// why: matches Claude Code 2.1.281 as measured, not its docs; see CONTEXT.md
async function dropUnreachedIgnoredDirs(source: string, includePath: string, candidates: string[]): Promise<string[]> {
  const { outside, byDir } = groupByIgnoredDir(candidates, await whollyIgnoredDirs(source));
  if (byDir.size === 0) return outside;

  const patterns = positivePatterns((await readFile(includePath, "utf8")).split("\n"));
  const emptyRepo = await mkdtemp(join(tmpdir(), "worktree-include-"));
  try {
    await runGit(["init", "-q"], emptyRepo);
    const kept = [...outside];
    for (const [dir, paths] of byDir) {
      if (await isReached({ source, emptyRepo, dir, patterns })) kept.push(...paths);
    }
    return kept;
  } finally {
    await rm(emptyRepo, { recursive: true, force: true });
  }
}

type Reach = { source: string; emptyRepo: string; dir: string; patterns: string[] };

async function isReached({ source, emptyRepo, dir, patterns }: Reach): Promise<boolean> {
  for (const line of patterns) {
    if (await reaches({ source, emptyRepo, dir, line })) return true;
  }
  return false;
}

async function reaches({ source, emptyRepo, dir, line }: Omit<Reach, "patterns"> & { line: string }): Promise<boolean> {
  const kind = patternKind(line);
  switch (kind) {
    case "globstar":
      return namesDirectory(line, dir) || dirMatches(emptyRepo, dir, line);
    case "anchored":
      return (await dirMatches(emptyRepo, dir, line)) || (await matchesInside(source, dir, line));
    case "anywhere":
      return dirMatches(emptyRepo, dir, line);
    default:
      return assertExhausted(kind);
  }
}

async function matchesInside(source: string, dir: string, line: string): Promise<boolean> {
  const listed = await runGit(["ls-files", "--others", "--ignored", "-z", `--exclude=${line}`, "--", dir], source);
  return nulSeparated(listed).length > 0;
}

// why: the source repo's .gitignore would match too; an empty repo tests this pattern alone
async function dirMatches(emptyRepo: string, dir: string, line: string): Promise<boolean> {
  const pattern = join(emptyRepo, "pattern");
  await writeFile(pattern, line);
  const code = await gitExitCode(
    ["-c", `core.excludesFile=${pattern}`, "check-ignore", "--no-index", "-q", dir],
    emptyRepo,
  );
  return code === EXIT_OK;
}

async function whollyIgnoredDirs(source: string): Promise<string[]> {
  const listed = await runGit(["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"], source);
  const untrackedOrIgnoredDirs = nulSeparated(listed).filter((entry) => entry.endsWith("/"));
  return onlyGitIgnored(source, untrackedOrIgnoredDirs);
}

async function onlyGitIgnored(source: string, paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const ignored = await runGit(["check-ignore", "-z", "--stdin"], source, {
    stdin: Buffer.from(paths.join("\0")),
    okCodes: [EXIT_OK, CHECK_IGNORE_NONE_IGNORED],
  });
  return nulSeparated(ignored);
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
  return textOf(out)
    .split("\n")
    .filter((line) => line.startsWith(prefix))
    .map((line) => line.slice(prefix.length));
}

async function gitTopLevel(path: string): Promise<string> {
  const out = await runGit(["rev-parse", "--show-toplevel"], path);
  return textOf(out).trim() || path;
}

function exists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false,
  );
}

type GitResult = { tag: "ok"; stdout: Buffer } | { tag: "failed"; code: number };

function textOf(result: GitResult): string {
  return result.tag === "ok" ? result.stdout.toString("utf8") : "";
}

function nulSeparated(result: GitResult): string[] {
  return textOf(result)
    .split("\0")
    .filter((s) => s.length > 0);
}

type GitOptions = { stdin: Buffer | "ignore"; okCodes: readonly number[] };

const PLAIN_GIT: GitOptions = { stdin: "ignore", okCodes: [EXIT_OK] };

async function runGit(args: string[], cwd: string, { stdin, okCodes }: GitOptions = PLAIN_GIT): Promise<GitResult> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdin,
    stdout: "pipe",
    stderr: "ignore",
  });
  const stdout = Buffer.from(await new Response(proc.stdout).arrayBuffer());
  const code = await proc.exited;
  return okCodes.includes(code) ? { tag: "ok", stdout } : { tag: "failed", code };
}

async function gitExitCode(args: string[], cwd: string): Promise<number> {
  return Bun.spawn(["git", ...args], { cwd, stdin: "ignore", stdout: "ignore", stderr: "ignore" }).exited;
}
