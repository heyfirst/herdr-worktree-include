import { constants as fsConstants } from "node:fs";
import { copyFile, lstat, mkdir, readFile, readlink, symlink } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { globstarNamesFolder, patternKind, positivePatterns, splitByFolder } from "../core/ignored-folders";
import { plan, type SkipReason } from "../core/skip-rules";
import { assertExhausted } from "../lib/assert";
import {
  filesMatching,
  gitTopLevel,
  ignoredFolders,
  onlyGitIgnored,
  patternMatchesFolderItself,
  patternMatchesInsideFolder,
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
  if (!(await pathExists(includePath))) return { tag: "no-manifest", source };

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
  // git lists the main checkout first
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
  return dropFilesInUntargetedFolders(source, includePath, ignored);
}

// why: matches Claude Code 2.1.281 as measured, not its docs; see CONTEXT.md
async function dropFilesInUntargetedFolders(
  source: string,
  includePath: string,
  candidates: string[],
): Promise<string[]> {
  const { loose, inFolder } = splitByFolder(candidates, await ignoredFolders(source));
  if (inFolder.size === 0) return loose;

  const patterns = positivePatterns((await readFile(includePath, "utf8")).split("\n"));
  return withEmptyRepo(async (emptyRepo) => {
    const kept = [...loose];
    for (const [path, files] of inFolder) {
      if (await anyPatternTargets({ source, emptyRepo, path }, patterns)) kept.push(...files);
    }
    return kept;
  });
}

type FolderCheck = { source: string; emptyRepo: string; path: string };

async function anyPatternTargets(folder: FolderCheck, patterns: string[]): Promise<boolean> {
  for (const pattern of patterns) {
    if (await patternTargetsFolder(pattern, folder)) return true;
  }
  return false;
}

// A folder gitignored as a whole (node_modules/) is only searched if a pattern targets it:
//   name-only  .env                 only if it matches the folder itself
//   any-depth  **/skills/*.md       if "skills" is a name in the folder's path
//   path       vendor/**/keep.json  if it matches the folder, or something inside it
async function patternTargetsFolder(pattern: string, folder: FolderCheck): Promise<boolean> {
  const kind = patternKind(pattern);
  switch (kind) {
    case "any-depth":
      return (
        globstarNamesFolder(pattern, folder.path) || patternMatchesFolderItself(folder.emptyRepo, folder.path, pattern)
      );
    case "path":
      return (
        (await patternMatchesFolderItself(folder.emptyRepo, folder.path, pattern)) ||
        (await patternMatchesInsideFolder(folder.source, folder.path, pattern))
      );
    case "name-only":
      return patternMatchesFolderItself(folder.emptyRepo, folder.path, pattern);
    default:
      return assertExhausted(kind);
  }
}

async function existingPaths(target: string, candidates: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  for (const path of candidates) {
    if (await pathExists(join(target, path))) existing.add(path);
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

function pathExists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false,
  );
}
