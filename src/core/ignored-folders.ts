const GLOBSTAR_PREFIX = "**/" as const;

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
  const firstName = line.slice(GLOBSTAR_PREFIX.length).split("/")[0] ?? "";
  return firstName !== "" && dir.split("/").includes(firstName);
}

export type Grouped = { outside: string[]; byDir: Map<string, string[]> };

export function groupByIgnoredDir(paths: string[], ignoredDirs: string[]): Grouped {
  const grouped: Grouped = { outside: [], byDir: new Map() };
  for (const path of paths) {
    const dir = ignoredDirs.find((ignored) => path.startsWith(ignored)) ?? "";
    if (!dir) {
      grouped.outside.push(path);
      continue;
    }
    grouped.byDir.set(dir, [...(grouped.byDir.get(dir) ?? []), path]);
  }
  return grouped;
}
