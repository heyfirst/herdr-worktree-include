const GLOBSTAR_PREFIX = "**/" as const;
const NO_FOLDER = "" as const;

export type PatternKind = "any-depth" | "path" | "name-only";

export function positivePatterns(lines: string[]): string[] {
  return lines
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#") && !line.startsWith("!"));
}

export function patternKind(pattern: string): PatternKind {
  if (pattern.startsWith(GLOBSTAR_PREFIX)) return "any-depth";
  // a trailing "/" only says "folder", so it does not make the pattern a path
  const slashBeforeEnd = pattern.slice(0, -1).includes("/");
  return slashBeforeEnd ? "path" : "name-only";
}

export function globstarNamesFolder(pattern: string, folder: string): boolean {
  const firstName = pattern.slice(GLOBSTAR_PREFIX.length).split("/")[0] ?? "";
  return firstName !== "" && folder.split("/").includes(firstName);
}

export type Split = { loose: string[]; inFolder: Map<string, string[]> };

// folders end in "/", so "a/" never matches a path under "ab/"
export function splitByFolder(paths: string[], folders: string[]): Split {
  const split: Split = { loose: [], inFolder: new Map() };
  for (const path of paths) {
    const folder = folders.find((candidate) => path.startsWith(candidate)) ?? NO_FOLDER;
    if (folder === NO_FOLDER) {
      split.loose.push(path);
      continue;
    }
    split.inFolder.set(folder, [...(split.inFolder.get(folder) ?? []), path]);
  }
  return split;
}
