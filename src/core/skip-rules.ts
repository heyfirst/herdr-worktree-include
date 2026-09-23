export type SkipReason = "unsafe-path" | "exists" | "other-worktree";

export type Planned = { step: "copy"; path: string } | { step: "skip"; path: string; reason: SkipReason };

export type Facts = {
  candidates: string[];
  existingInTarget: Set<string>;
  otherWorktrees: string[];
};

export function plan(facts: Facts): Planned[] {
  return facts.candidates.map((path) => planOne(path, facts));
}

function planOne(path: string, facts: Facts): Planned {
  if (!isSafeRelativePath(path)) return { step: "skip", path, reason: "unsafe-path" };
  if (isUnderOtherWorktree(path, facts.otherWorktrees)) return { step: "skip", path, reason: "other-worktree" };
  if (facts.existingInTarget.has(path)) return { step: "skip", path, reason: "exists" };
  return { step: "copy", path };
}

function isSafeRelativePath(path: string): boolean {
  if (path.length === 0) return false;
  if (path.startsWith("/")) return false;
  if (path.includes("\0")) return false;
  return !path.split("/").includes("..");
}

function isUnderOtherWorktree(path: string, otherWorktrees: string[]): boolean {
  return otherWorktrees.some((root) => path === root || path.startsWith(`${root}/`));
}
