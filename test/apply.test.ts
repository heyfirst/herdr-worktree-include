import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply, mainWorktreeOf } from "../src/apply";

let root: string;
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

    const report = await apply(main, worktree);

    expect(report.copy).toEqual([]);
    expect(report.skipped).toEqual([]);
    expect(report.failed).toEqual([]);
  });

  test("tracked file matching pattern is not copied", async () => {
    await write(join(main, ".gitignore"), "");
    await write(join(main, ".worktreeinclude"), "tracked.txt\n");
    await write(join(main, "tracked.txt"), "tracked\n");
    await commitInitial([".gitignore", ".worktreeinclude", "tracked.txt"]);
    await addWorktree();

    const report = await apply(main, worktree);

    expect(report.copy).toEqual([]);
  });

  test("untracked but not ignored is not copied", async () => {
    await write(join(main, ".worktreeinclude"), "loose.txt\n");
    await commitInitial([".worktreeinclude"]);
    await addWorktree();
    await write(join(main, "loose.txt"), "loose\n");

    const report = await apply(main, worktree);

    expect(report.copy).toEqual([]);
  });

  test("ignored but not listed in .worktreeinclude is not copied", async () => {
    await write(join(main, ".gitignore"), ".env\nother.secret\n");
    await write(join(main, ".worktreeinclude"), ".env\n");
    await commitInitial([".gitignore", ".worktreeinclude"]);
    await addWorktree();
    await write(join(main, ".env"), "SECRET=1\n");
    await write(join(main, "other.secret"), "nope\n");

    const report = await apply(main, worktree);

    expect(report.copy).toEqual([".env"]);
    await expect(readFile(join(worktree, "other.secret"), "utf8")).rejects.toThrow();
  });

  test("listed and ignored is copied, including nested dir", async () => {
    await write(join(main, ".gitignore"), ".env\nconfig/secrets.json\n");
    await write(join(main, ".worktreeinclude"), ".env\nconfig/secrets.json\n");
    await commitInitial([".gitignore", ".worktreeinclude"]);
    await addWorktree();
    await write(join(main, ".env"), "SECRET=1\n");
    await write(join(main, "config/secrets.json"), '{"k":1}\n');

    const report = await apply(main, worktree);

    expect(report.copy.sort()).toEqual([".env", "config/secrets.json"]);
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

    const report = await apply(main, worktree);

    expect(report.copy).toEqual([".env"]);
  });

  test("existing target file is untouched", async () => {
    await write(join(main, ".gitignore"), ".env\n");
    await write(join(main, ".worktreeinclude"), ".env\n");
    await commitInitial([".gitignore", ".worktreeinclude"]);
    await addWorktree();
    await write(join(main, ".env"), "SECRET=1\n");
    await write(join(worktree, ".env"), "ALREADY=1\n");

    const report = await apply(main, worktree);

    expect(report.copy).toEqual([]);
    expect(report.skipped).toEqual([{ path: ".env", reason: "exists" }]);
    expect(await readFile(join(worktree, ".env"), "utf8")).toBe("ALREADY=1\n");
  });

  test("target == source is a no-op", async () => {
    await write(join(main, ".gitignore"), ".env\n");
    await write(join(main, ".worktreeinclude"), ".env\n");
    await commitInitial([".gitignore", ".worktreeinclude"]);
    await write(join(main, ".env"), "SECRET=1\n");

    const report = await apply(main, main);

    expect(report.copy).toEqual([]);
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
