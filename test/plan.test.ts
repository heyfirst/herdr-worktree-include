import { describe, expect, test } from "bun:test";
import { plan, type Facts, type Skip } from "../src/plan";

const baseFacts: Facts = {
  candidates: [],
  existingInTarget: new Set(),
  otherWorktrees: [],
};

describe("plan", () => {
  const cases: { name: string; facts: Facts; copy: string[]; skipped: Skip[] }[] = [
    {
      name: "happy path: single candidate copied",
      facts: { ...baseFacts, candidates: [".env"] },
      copy: [".env"],
      skipped: [],
    },
    {
      name: "happy path: nested dir candidate copied",
      facts: { ...baseFacts, candidates: ["config/secrets.json"] },
      copy: ["config/secrets.json"],
      skipped: [],
    },
    {
      name: "existing in target is skipped",
      facts: { ...baseFacts, candidates: [".env"], existingInTarget: new Set([".env"]) },
      copy: [],
      skipped: [{ path: ".env", reason: "exists" }],
    },
    {
      name: "candidate under another worktree is skipped",
      facts: { ...baseFacts, candidates: ["sibling/.env"], otherWorktrees: ["sibling"] },
      copy: [],
      skipped: [{ path: "sibling/.env", reason: "other-worktree" }],
    },
    {
      name: "candidate exactly at another worktree root is skipped",
      facts: { ...baseFacts, candidates: ["sibling"], otherWorktrees: ["sibling"] },
      copy: [],
      skipped: [{ path: "sibling", reason: "other-worktree" }],
    },
    {
      name: "absolute path is unsafe",
      facts: { ...baseFacts, candidates: ["/etc/passwd"] },
      copy: [],
      skipped: [{ path: "/etc/passwd", reason: "unsafe-path" }],
    },
    {
      name: "parent-traversal path is unsafe",
      facts: { ...baseFacts, candidates: ["../outside"] },
      copy: [],
      skipped: [{ path: "../outside", reason: "unsafe-path" }],
    },
    {
      name: "embedded traversal segment is unsafe",
      facts: { ...baseFacts, candidates: ["config/../../outside"] },
      copy: [],
      skipped: [{ path: "config/../../outside", reason: "unsafe-path" }],
    },
    {
      name: "empty candidates yields empty plan",
      facts: { ...baseFacts },
      copy: [],
      skipped: [],
    },
    {
      name: "mixed candidates partition correctly",
      facts: {
        candidates: [".env", ".env.local", "/abs", "sibling/x"],
        existingInTarget: new Set([".env.local"]),
        otherWorktrees: ["sibling"],
      },
      copy: [".env"],
      skipped: [
        { path: ".env.local", reason: "exists" },
        { path: "/abs", reason: "unsafe-path" },
        { path: "sibling/x", reason: "other-worktree" },
      ],
    },
  ];

  for (const { name, facts, copy, skipped } of cases) {
    test(name, () => {
      const result = plan(facts);
      expect(result.copy.sort()).toEqual([...copy].sort());
      const actualSkipped = result.skipped.map((s) => ({ path: s.path, reason: s.reason }));
      expect(actualSkipped.sort((a, b) => a.path.localeCompare(b.path))).toEqual(
        [...skipped].sort((a, b) => a.path.localeCompare(b.path))
      );
    });
  }
});
