import { describe, expect, test } from "bun:test";
import { globstarNamesFolder, patternKind, positivePatterns, splitByFolder } from "./ignored-folders";

describe("patternKind", () => {
  test.each([
    { line: "**/.env", kind: "any-depth" },
    { line: ".env", kind: "name-only" },
    { line: "vendor/", kind: "name-only" },
    { line: "vendor/**/config.json", kind: "path" },
    { line: "/certs/", kind: "path" },
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

describe("globstarNamesFolder", () => {
  test.each([
    { line: "**/.claude/skills/*.md", folder: ".claude/", expected: true },
    { line: "**/node_modules", folder: "apps/web/node_modules/", expected: true },
    { line: "**/config.json", folder: "vendor/", expected: false },
    { line: "**/*.md", folder: "docs/", expected: false },
  ])("$line in $folder -> $expected", ({ line, folder, expected }) => {
    expect(globstarNamesFolder(line, folder)).toBe(expected);
  });
});

describe("splitByFolder", () => {
  test("groups paths under their ignored folder, the rest as loose", () => {
    const { loose, inFolder } = splitByFolder(["vendor/a", ".env", "vendor/b/c"], ["vendor/"]);

    expect(loose).toEqual([".env"]);
    expect([...inFolder]).toEqual([["vendor/", ["vendor/a", "vendor/b/c"]]]);
  });
});
