export type Facts = {
  candidates: string[];
  existingInTarget: Set<string>;
  otherWorktrees: string[];
};

export type Skip = { path: string; reason: "unsafe-path" | "exists" | "other-worktree" };

export type CopyPlan = { copy: string[]; skipped: Skip[] };

export function plan(facts: Facts): CopyPlan {
  const copy: string[] = [];
  const skipped: Skip[] = [];

  for (const path of facts.candidates) {
    if (!isSafeRelativePath(path)) {
      skipped.push({ path, reason: "unsafe-path" });
      continue;
    }
    if (isUnderOtherWorktree(path, facts.otherWorktrees)) {
      skipped.push({ path, reason: "other-worktree" });
      continue;
    }
    if (facts.existingInTarget.has(path)) {
      skipped.push({ path, reason: "exists" });
      continue;
    }
    copy.push(path);
  }

  return { copy, skipped };
}

function isSafeRelativePath(path: string): boolean {
  if (path.length === 0) return false;
  if (path.startsWith("/")) return false;
  if (path.includes("\0")) return false;
  const segments = path.split("/");
  if (segments.includes("..")) return false;
  return true;
}

function isUnderOtherWorktree(path: string, otherWorktrees: string[]): boolean {
  return otherWorktrees.some((root) => path === root || path.startsWith(`${root}/`));
}
