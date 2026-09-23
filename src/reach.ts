const GLOBSTAR_PREFIX = "**/";

export type PatternKind = "globstar" | "anchored" | "anywhere";

export function positivePatterns(lines: string[]): string[] {
  return lines
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#") && !line.startsWith("!"));
}

export function patternKind(line: string): PatternKind {
  if (line.startsWith(GLOBSTAR_PREFIX)) return "globstar";
  const slashBeforeEnd = line.slice(0, -1).includes("/");
  return slashBeforeEnd ? "anchored" : "anywhere";
}

export function namesDirectory(line: string, dir: string): boolean {
  const [firstName] = line.slice(GLOBSTAR_PREFIX.length).split("/");
  return firstName !== undefined && dir.split("/").includes(firstName);
}

export function ignoredDirOf(path: string, ignoredDirs: string[]): string | null {
  return ignoredDirs.find((dir) => path.startsWith(dir)) ?? null;
}

export function groupByIgnoredDir(paths: string[], ignoredDirs: string[]): Map<string | null, string[]> {
  const groups = new Map<string | null, string[]>();
  for (const path of paths) {
    const dir = ignoredDirOf(path, ignoredDirs);
    groups.set(dir, [...(groups.get(dir) ?? []), path]);
  }
  return groups;
}
