import { describe, expect, test } from "bun:test";
import { groupByIgnoredDir, namesDirectory, patternKind, positivePatterns } from "./ignored-folders";

describe("patternKind", () => {
  test.each([
    { line: "**/.env", kind: "globstar" },
    { line: ".env", kind: "anywhere" },
    { line: "vendor/", kind: "anywhere" },
    { line: "vendor/**/config.json", kind: "anchored" },
    { line: "/certs/", kind: "anchored" },
  ])("$line -> $kind", ({ line, kind }) => {
    expect(patternKind(line)).toBe(kind);
  });
});

describe("positivePatterns", () => {
  test("drops blanks, comments and negations", () => {
    expect(positivePatterns(["# env", ".env", "", "!.env.example", "  **/.dev.vars  "])).toEqual([
      ".env",
      "**/.dev.vars",
    ]);
  });
});

describe("namesDirectory", () => {
  test.each([
    { line: "**/.claude/skills/*.md", dir: ".claude/", expected: true },
    { line: "**/node_modules", dir: "apps/web/node_modules/", expected: true },
    { line: "**/config.json", dir: "vendor/", expected: false },
    { line: "**/*.md", dir: "docs/", expected: false },
  ])("$line in $dir -> $expected", ({ line, dir, expected }) => {
    expect(namesDirectory(line, dir)).toBe(expected);
  });
});

describe("groupByIgnoredDir", () => {
  test("groups paths under their ignored dir, the rest as outside", () => {
    const { outside, byDir } = groupByIgnoredDir(["vendor/a", ".env", "vendor/b/c"], ["vendor/"]);

    expect(outside).toEqual([".env"]);
    expect([...byDir]).toEqual([["vendor/", ["vendor/a", "vendor/b/c"]]]);
  });
});
