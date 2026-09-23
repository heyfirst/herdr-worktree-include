export type SkipReason = "unsafe-path" | "exists" | "other-worktree";

export type Planned = { step: "copy"; path: string } | { step: "skip"; path: string; reason: SkipReason };

export type Facts = {
  candidates: string[];
  existingInTarget: Set<string>;
  otherWorktrees: string[];
};

export function plan(facts: Facts): Planned[] {
  return facts.candidates.map((path): Planned => {
    const reason = skipReason(path, facts);
    return reason ? { step: "skip", path, reason } : { step: "copy", path };
  });
}

function skipReason(path: string, facts: Facts): SkipReason | null {
  if (!isSafeRelativePath(path)) return "unsafe-path";
  if (isUnderOtherWorktree(path, facts.otherWorktrees)) return "other-worktree";
  if (facts.existingInTarget.has(path)) return "exists";
  return null;
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
