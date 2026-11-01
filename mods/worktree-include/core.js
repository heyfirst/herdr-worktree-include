const GLOBSTAR = "**/";

const trimSlash = (path) => path.replace(/\/+$/, "");

export function worktreePaths(porcelain) {
  return porcelain
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => trimSlash(line.slice("worktree ".length)));
}

export function mainWorktree(porcelain) {
  return worktreePaths(porcelain)[0] ?? "";
}

export function isLinkedWorktree(porcelain, folder) {
  return worktreePaths(porcelain).slice(1).includes(trimSlash(folder));
}

export function otherWorktreePaths(porcelain) {
  const [main, ...rest] = worktreePaths(porcelain);
  if (!main) return [];
  return rest.filter((root) => root.startsWith(`${main}/`)).map((root) => root.slice(main.length + 1));
}

export function planIncludes({ candidates, existing, otherWorktrees }) {
  return candidates.map((path) => {
    if (!isSafeRelativePath(path)) return { step: "skip", path, reason: "unsafe-path" };
    if (otherWorktrees.some((root) => path === root || path.startsWith(`${root}/`))) {
      return { step: "skip", path, reason: "other-worktree" };
    }
    if (existing.has(path)) return { step: "skip", path, reason: "exists" };
    return { step: "copy", path };
  });
}

function isSafeRelativePath(path) {
  if (path.length === 0 || path.startsWith("/") || path.includes("\0")) return false;
  return !path.split("/").includes("..");
}

export function positivePatterns(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#") && !line.startsWith("!"));
}

export function patternKind(pattern) {
  if (pattern.startsWith(GLOBSTAR)) return "any-depth";
  return pattern.slice(0, -1).includes("/") ? "path" : "name-only";
}

export function globstarNamesFolder(pattern, folder) {
  const firstName = pattern.slice(GLOBSTAR.length).split("/")[0] ?? "";
  return firstName !== "" && folder.split("/").includes(firstName);
}

export function splitByFolder(paths, folders) {
  const loose = [];
  const inFolder = new Map();
  for (const path of paths) {
    const folder = folders.find((candidate) => path.startsWith(candidate));
    if (folder === undefined) loose.push(path);
    else inFolder.set(folder, [...(inFolder.get(folder) ?? []), path]);
  }
  return { loose, inFolder };
}
