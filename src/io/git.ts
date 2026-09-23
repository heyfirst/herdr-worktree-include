import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { splitNul } from "../lib/text";

const EXIT_OK = 0;
const CHECK_IGNORE_NONE_IGNORED = 1;

export async function gitTopLevel(path: string): Promise<string> {
  const out = await runGit(["rev-parse", "--show-toplevel"], path);
  return textOf(out).trim() || path;
}

export async function worktreeRoots(path: string): Promise<string[]> {
  const out = await runGit(["worktree", "list", "--porcelain"], path);
  const prefix = "worktree ";
  return textOf(out)
    .split("\n")
    .filter((line) => line.startsWith(prefix))
    .map((line) => line.slice(prefix.length));
}

export async function filesMatching(source: string, patternFile: string): Promise<string[]> {
  const listed = await runGit(["ls-files", "--others", "--ignored", "-z", `--exclude-from=${patternFile}`], source);
  return splitNul(textOf(listed));
}

export async function onlyGitIgnored(source: string, paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const ignored = await runGit(["check-ignore", "-z", "--stdin"], source, {
    stdin: Buffer.from(paths.join("\0")),
    okCodes: [EXIT_OK, CHECK_IGNORE_NONE_IGNORED],
  });
  return splitNul(textOf(ignored));
}

// folders gitignored as a whole, like node_modules/
export async function ignoredFolders(source: string): Promise<string[]> {
  const listed = await runGit(["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"], source);
  const folders = splitNul(textOf(listed)).filter((entry) => entry.endsWith("/"));
  return onlyGitIgnored(source, folders);
}

export async function patternMatchesInsideFolder(source: string, folder: string, pattern: string): Promise<boolean> {
  const listed = await runGit(
    ["ls-files", "--others", "--ignored", "-z", `--exclude=${pattern}`, "--", folder],
    source,
  );
  return splitNul(textOf(listed)).length > 0;
}

// why: the source repo's .gitignore would match too; an empty repo tests this pattern alone
export async function patternMatchesFolderItself(emptyRepo: string, folder: string, pattern: string): Promise<boolean> {
  const patternFile = join(emptyRepo, "pattern");
  await writeFile(patternFile, pattern);
  const matched = await runGit(
    ["-c", `core.excludesFile=${patternFile}`, "check-ignore", "--no-index", "-q", folder],
    emptyRepo,
  );
  return matched.tag === "ok";
}

export async function withEmptyRepo<T>(use: (emptyRepo: string) => Promise<T>): Promise<T> {
  const emptyRepo = await mkdtemp(join(tmpdir(), "worktree-include-"));
  try {
    await runGit(["init", "-q"], emptyRepo);
    return await use(emptyRepo);
  } finally {
    await rm(emptyRepo, { recursive: true, force: true });
  }
}

type GitResult = { tag: "ok"; stdout: Buffer } | { tag: "failed"; code: number };
type GitOptions = { stdin: Buffer | "ignore"; okCodes: readonly number[] };

const PLAIN_GIT: GitOptions = { stdin: "ignore", okCodes: [EXIT_OK] };

async function runGit(args: string[], cwd: string, { stdin, okCodes }: GitOptions = PLAIN_GIT): Promise<GitResult> {
  const proc = Bun.spawn(["git", ...args], { cwd, stdin, stdout: "pipe", stderr: "ignore" });
  const stdout = Buffer.from(await new Response(proc.stdout).arrayBuffer());
  const code = await proc.exited;
  return okCodes.includes(code) ? { tag: "ok", stdout } : { tag: "failed", code };
}

function textOf(result: GitResult): string {
  return result.tag === "ok" ? result.stdout.toString("utf8") : "";
}
