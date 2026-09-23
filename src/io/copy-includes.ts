import { constants as fsConstants } from "node:fs";
import { copyFile, lstat, mkdir, readFile, readlink, symlink } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { groupByIgnoredDir, namesDirectory, patternKind, positivePatterns } from "../core/ignored-folders";
import { plan, type SkipReason } from "../core/skip-rules";
import { assertExhausted } from "../lib/assert";
import {
  filesMatching,
  gitTopLevel,
  onlyGitIgnored,
  patternMatchesDir,
  patternMatchesInside,
  whollyIgnoredDirs,
  withEmptyRepo,
  worktreeRoots,
} from "./git";

const INCLUDE_FILE = ".worktreeinclude" as const;

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

export async function copyIncludes(sourceRoot: string, targetRoot: string): Promise<Outcome> {
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
  const ignored = await onlyGitIgnored(source, await filesMatching(source, includePath));
  return dropUnreachedIgnoredDirs(source, includePath, ignored);
}

// why: matches Claude Code 2.1.281 as measured, not its docs; see CONTEXT.md
async function dropUnreachedIgnoredDirs(source: string, includePath: string, candidates: string[]): Promise<string[]> {
  const { outside, byDir } = groupByIgnoredDir(candidates, await whollyIgnoredDirs(source));
  if (byDir.size === 0) return outside;

  const patterns = positivePatterns((await readFile(includePath, "utf8")).split("\n"));
  return withEmptyRepo(async (emptyRepo) => {
    const kept = [...outside];
    for (const [dir, paths] of byDir) {
      if (await isReached({ source, emptyRepo, dir }, patterns)) kept.push(...paths);
    }
    return kept;
  });
}

type Reach = { source: string; emptyRepo: string; dir: string };

async function isReached(reach: Reach, patterns: string[]): Promise<boolean> {
  for (const line of patterns) {
    if (await reaches(reach, line)) return true;
  }
  return false;
}

async function reaches(reach: Reach, line: string): Promise<boolean> {
  const kind = patternKind(line);
  switch (kind) {
    case "globstar":
      return namesDirectory(line, reach.dir) || patternMatchesDir(reach.emptyRepo, reach.dir, line);
    case "anchored":
      return (
        (await patternMatchesDir(reach.emptyRepo, reach.dir, line)) ||
        (await patternMatchesInside(reach.source, reach.dir, line))
      );
    case "anywhere":
      return patternMatchesDir(reach.emptyRepo, reach.dir, line);
    default:
      return assertExhausted(kind);
  }
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

function exists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false,
  );
}
