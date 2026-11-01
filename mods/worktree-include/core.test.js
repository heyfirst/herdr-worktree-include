import { describe, expect, test } from "bun:test";
import {
  globstarNamesFolder,
  isLinkedWorktree,
  mainWorktree,
  otherWorktreePaths,
  patternKind,
  planIncludes,
  positivePatterns,
  splitByFolder,
} from "./core.js";

const PORCELAIN = [
  "worktree /w/repo",
  "HEAD aaa",
  "branch refs/heads/main",
  "",
  "worktree /home/me/.herdr/worktrees/repo/feat",
  "HEAD bbb",
  "branch refs/heads/feat",
  "",
  "worktree /w/.herdr/repo/other",
  "HEAD ccc",
  "detached",
  "",
].join("\n");

describe("isLinkedWorktree", () => {
  test.each([
    { folder: "/w/repo", expected: false },
    { folder: "/home/me/.herdr/worktrees/repo/feat", expected: true },
    { folder: "/w/.herdr/repo/other", expected: true },
    { folder: "/elsewhere", expected: false },
    { folder: "/w/repo/", expected: false },
  ])("$folder -> $expected", ({ folder, expected }) => {
    expect(isLinkedWorktree(PORCELAIN, folder)).toBe(expected);
  });

  test("empty output is not linked", () => {
    expect(isLinkedWorktree("", "/w/repo")).toBe(false);
  });
});

describe("mainWorktree", () => {
  test("is the first listed", () => {
    expect(mainWorktree(PORCELAIN)).toBe("/w/repo");
  });
  test("is empty for no output", () => {
    expect(mainWorktree("")).toBe("");
  });
});

describe("otherWorktreePaths", () => {
  test("keeps linked worktrees nested in the main one, relative", () => {
    const porcelain = "worktree /w/repo\n\nworktree /w/repo/.claude/worktrees/a\n\nworktree /w/other\n";
    expect(otherWorktreePaths(porcelain)).toEqual([".claude/worktrees/a"]);
  });
});

const baseFacts = { candidates: [], existing: new Set(), otherWorktrees: [] };

describe("planIncludes", () => {
  test("copies a plain candidate", () => {
    expect(planIncludes({ ...baseFacts, candidates: [".env", "a/b.json"] })).toEqual([
      { step: "copy", path: ".env" },
      { step: "copy", path: "a/b.json" },
    ]);
  });

  test("never overwrites an existing file", () => {
    expect(planIncludes({ ...baseFacts, candidates: [".env"], existing: new Set([".env"]) })).toEqual([
      { step: "skip", path: ".env", reason: "exists" },
    ]);
  });

  test("skips paths under another worktree, and the root itself", () => {
    const plan = planIncludes({
      ...baseFacts,
      candidates: ["sib/.env", "sib", "sibling/.env"],
      otherWorktrees: ["sib"],
    });
    expect(plan.map((p) => p.reason)).toEqual(["other-worktree", "other-worktree", undefined]);
  });

  test.each(["/etc/passwd", "../x", "a/../b", "", "a\0b"])("unsafe path %j", (path) => {
    expect(planIncludes({ ...baseFacts, candidates: [path] })).toEqual([{ step: "skip", path, reason: "unsafe-path" }]);
  });
});

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
    expect(positivePatterns("# env\n.env\n\n!.env.example\n  **/.dev.vars  \n")).toEqual([".env", "**/.dev.vars"]);
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
    const { loose, inFolder } = splitByFolder(["vendor/a", ".env", "vendor/b/c", "vendors/x"], ["vendor/"]);
    expect(loose).toEqual([".env", "vendors/x"]);
    expect([...inFolder]).toEqual([["vendor/", ["vendor/a", "vendor/b/c"]]]);
  });
});
