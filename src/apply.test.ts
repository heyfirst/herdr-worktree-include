import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply, mainWorktreeOf, type FileOutcome, type Outcome } from "./apply";

let root: string;

function files(outcome: Outcome): FileOutcome[] {
  if (outcome.tag !== "applied") throw new Error(`expected applied, got ${outcome.tag}`);
  return outcome.files;
}

function copied(outcome: Outcome): string[] {
  return files(outcome)
    .flatMap((f) => (f.tag === "copied" ? [f.path] : []))
    .sort();
}
let main: string;
let worktree: string;

async function git(args: string[], cwd: string): Promise<void> {
  const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const code = await proc.exited;
  if (code !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`git ${args.join(" ")} failed: ${stderr}`);
  }
}

async function write(path: string, contents: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, contents);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "wti-test-"));
  main = join(root, "main");
  worktree = join(root, "feature");
  await mkdir(main, { recursive: true });
  await git(["init", "-q"], main);
  await git(["config", "user.email", "test@example.com"], main);
  await git(["config", "user.name", "test"], main);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function commitInitial(extraTracked: string[] = []) {
  await write(join(main, "README.md"), "hello\n");
  await git(["add", "README.md", ...extraTracked], main);
  await git(["commit", "-q", "-m", "init"], main);
}

async function addWorktree() {
  await git(["branch", "feature"], main);
  await git(["worktree", "add", "-q", worktree, "feature"], main);
}

describe("apply", () => {
  test("no manifest -> nothing copied", async () => {
    await commitInitial();
    await addWorktree();

    const outcome = await apply(main, worktree);

    expect(outcome.tag).toBe("no-manifest");
  });

  test("tracked file matching pattern is not copied", async () => {
    await write(join(main, ".gitignore"), "");
    await write(join(main, ".worktreeinclude"), "tracked.txt\n");
    await write(join(main, "tracked.txt"), "tracked\n");
    await commitInitial([".gitignore", ".worktreeinclude", "tracked.txt"]);
    await addWorktree();

    const outcome = await apply(main, worktree);

    expect(copied(outcome)).toEqual([]);
  });

  test("untracked but not ignored is not copied", async () => {
    await write(join(main, ".worktreeinclude"), "loose.txt\n");
    await commitInitial([".worktreeinclude"]);
    await addWorktree();
    await write(join(main, "loose.txt"), "loose\n");

    const outcome = await apply(main, worktree);

    expect(copied(outcome)).toEqual([]);
  });

  test("ignored but not listed in .worktreeinclude is not copied", async () => {
    await write(join(main, ".gitignore"), ".env\nother.secret\n");
    await write(join(main, ".worktreeinclude"), ".env\n");
    await commitInitial([".gitignore", ".worktreeinclude"]);
    await addWorktree();
    await write(join(main, ".env"), "SECRET=1\n");
    await write(join(main, "other.secret"), "nope\n");

    const outcome = await apply(main, worktree);

    expect(copied(outcome)).toEqual([".env"]);
    expect(await Bun.file(join(worktree, "other.secret")).exists()).toBe(false);
  });

  test("listed and ignored is copied, including nested dir", async () => {
    await write(join(main, ".gitignore"), ".env\nconfig/secrets.json\n");
    await write(join(main, ".worktreeinclude"), ".env\nconfig/secrets.json\n");
    await commitInitial([".gitignore", ".worktreeinclude"]);
    await addWorktree();
    await write(join(main, ".env"), "SECRET=1\n");
    await write(join(main, "config/secrets.json"), '{"k":1}\n');

    const outcome = await apply(main, worktree);

    expect(copied(outcome)).toEqual([".env", "config/secrets.json"]);
    expect(await readFile(join(worktree, ".env"), "utf8")).toBe("SECRET=1\n");
    expect(await readFile(join(worktree, "config/secrets.json"), "utf8")).toBe('{"k":1}\n');
  });

  test("negation in .worktreeinclude is honoured", async () => {
    await write(join(main, ".gitignore"), ".env*\n");
    await write(join(main, ".worktreeinclude"), ".env*\n!.env.example\n");
    await commitInitial([".gitignore", ".worktreeinclude"]);
    await addWorktree();
    await write(join(main, ".env"), "SECRET=1\n");
    await write(join(main, ".env.example"), "EXAMPLE=1\n");

    const outcome = await apply(main, worktree);

    expect(copied(outcome)).toEqual([".env"]);
  });

  type ReachCase = { name: string; gitignore: string; include: string; paths: string[]; copies: string[] };

  test.each<ReachCase>([
    {
      name: "does not reach in when the pattern does not name the directory",
      gitignore: "vendor/\nconfig.json\n",
      include: "**/config.json\n",
      paths: ["vendor/lib/config.json", "config.json"],
      copies: ["config.json"],
    },
    {
      name: "reaches in when the first name after **/ is in the directory path",
      gitignore: ".claude/\n",
      include: "**/.claude/skills/*.md\n",
      paths: [".claude/skills/a.md", ".claude/other.md"],
      copies: [".claude/skills/a.md"],
    },
    {
      name: "reaches in when the directory itself matches the pattern",
      gitignore: "tmp/\n",
      include: "**/tm*\n",
      paths: ["tmp/a.txt", "tmp/deep/b.txt"],
      copies: ["tmp/a.txt", "tmp/deep/b.txt"],
    },
    {
      name: "a pattern without **/ still reaches in",
      gitignore: "vendor/\n",
      include: "vendor/**/config.json\n",
      paths: ["vendor/lib/config.json"],
      copies: ["vendor/lib/config.json"],
    },
    {
      name: "negation still applies inside the directory",
      gitignore: ".claude/\n",
      include: "**/.claude/skills/*.md\n!**/.claude/skills/secret.md\n",
      paths: [".claude/skills/a.md", ".claude/skills/secret.md"],
      copies: [".claude/skills/a.md"],
    },
    {
      name: "a pattern with no slash does not reach in",
      gitignore: "node_modules/\n.env\n",
      include: ".env\n",
      paths: ["node_modules/pkg/.env", ".env"],
      copies: [".env"],
    },
    {
      name: "a no-slash glob does not reach in",
      gitignore: "docs-cache/\n",
      include: "*.md\n",
      paths: ["docs-cache/a.md"],
      copies: [],
    },
    {
      name: "a pattern naming the directory itself reaches in",
      gitignore: "vendor/\n",
      include: "vendor/\n",
      paths: ["vendor/lib/x.json"],
      copies: ["vendor/lib/x.json"],
    },
    {
      name: "a root path reaches in",
      gitignore: ".claude/local/\n",
      include: ".claude/local/settings.json\n",
      paths: [".claude/local/settings.json"],
      copies: [".claude/local/settings.json"],
    },
    {
      name: "once reached, every pattern applies inside",
      gitignore: "vendor/\n",
      include: "vendor/**/keep.json\n**/config.json\n",
      paths: ["vendor/lib/keep.json", "vendor/lib/config.json"],
      copies: ["vendor/lib/config.json", "vendor/lib/keep.json"],
    },
    {
      name: "a nested ignored directory is held to the same rule",
      gitignore: "node_modules/\n.env\n",
      include: "**/.env\n",
      paths: ["apps/web/node_modules/pkg/.env", "apps/web/.env"],
      copies: ["apps/web/.env"],
    },
  ])("wholly ignored directory, as Claude Code 2.1.281 does: $name", async ({ gitignore, include, paths, copies }) => {
    await write(join(main, ".gitignore"), gitignore);
    await write(join(main, ".worktreeinclude"), include);
    await commitInitial([".gitignore", ".worktreeinclude"]);
    await addWorktree();
    for (const path of paths) await write(join(main, path), "x\n");

    expect(copied(await apply(main, worktree))).toEqual(copies);
  });

  test("existing target file is untouched", async () => {
    await write(join(main, ".gitignore"), ".env\n");
    await write(join(main, ".worktreeinclude"), ".env\n");
    await commitInitial([".gitignore", ".worktreeinclude"]);
    await addWorktree();
    await write(join(main, ".env"), "SECRET=1\n");
    await write(join(worktree, ".env"), "ALREADY=1\n");

    const outcome = await apply(main, worktree);

    expect(files(outcome)).toEqual([{ tag: "skipped", path: ".env", reason: "exists" }]);
    expect(await readFile(join(worktree, ".env"), "utf8")).toBe("ALREADY=1\n");
  });

  test("target == source is a no-op", async () => {
    await write(join(main, ".gitignore"), ".env\n");
    await write(join(main, ".worktreeinclude"), ".env\n");
    await commitInitial([".gitignore", ".worktreeinclude"]);
    await write(join(main, ".env"), "SECRET=1\n");

    const outcome = await apply(main, main);

    expect(outcome.tag).toBe("is-main");
  });

  test("mainWorktreeOf resolves the main checkout from a linked worktree", async () => {
    await commitInitial();
    await addWorktree();

    const resolved = await mainWorktreeOf(worktree);

    expect(resolved).not.toBeNull();
    const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], { cwd: main, stdout: "pipe" });
    const canonicalMain = (await new Response(proc.stdout).text()).trim();
    expect(resolved).toBe(canonicalMain);
  });
});
