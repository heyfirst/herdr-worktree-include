import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { copyIncludes } from "./include.js";

let root;
let main;
let worktree;

const run = (command, args, cwd) =>
  new Promise((resolve) => {
    execFile(command, args, { cwd }, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === "number" ? error.code : 1) : 0, stdout, stderr });
    });
  });
const readText = async (path) => (existsSync(path) ? readFileSync(path, "utf8") : null);
const git = async (args, cwd) => {
  const result = await run("git", args, cwd);
  if (result.code !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
};
const write = (path, text) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

async function setup({ gitignore, include, files = [] }) {
  write(join(main, ".gitignore"), gitignore);
  write(join(main, ".worktreeinclude"), include);
  write(join(main, "README.md"), "hi\n");
  await git(["add", "."], main);
  await git(["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init"], main);
  await git(["worktree", "add", "-q", "-b", "feature", worktree], main);
  for (const path of files) write(join(main, path), "x\n");
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "wti-"));
  main = join(root, "main");
  worktree = join(root, "feature");
  mkdirSync(main);
  await git(["init", "-q"], main);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const apply = () => copyIncludes({ run, readText }, worktree);
const present = (...paths) => paths.filter((path) => existsSync(join(worktree, path)));

describe("copyIncludes", () => {
  test("copies a gitignored file named in the manifest", async () => {
    await setup({ gitignore: ".env\nother\n", include: ".env\n", files: [".env", "other"] });
    expect(await apply()).toEqual({ tag: "applied", copied: 1, failures: [] });
    expect(readFileSync(join(worktree, ".env"), "utf8")).toBe("x\n");
    expect(present("other")).toEqual([]);
  });

  test("leaves an existing file alone", async () => {
    await setup({ gitignore: ".env\n", include: ".env\n", files: [".env"] });
    write(join(worktree, ".env"), "KEEP\n");
    expect(await apply()).toEqual({ tag: "applied", copied: 0, failures: [] });
    expect(readFileSync(join(worktree, ".env"), "utf8")).toBe("KEEP\n");
  });

  test("a second run changes nothing", async () => {
    await setup({ gitignore: ".env\n", include: ".env\n", files: [".env"] });
    await apply();
    expect(await apply()).toEqual({ tag: "applied", copied: 0, failures: [] });
  });

  test("honours negation", async () => {
    await setup({ gitignore: ".env*\n", include: ".env*\n!.env.example\n", files: [".env", ".env.example"] });
    await apply();
    expect(present(".env", ".env.example")).toEqual([".env"]);
  });

  test("makes parent folders and recreates symlinks as links", async () => {
    await setup({
      gitignore: "config/\nlink.env\n",
      include: "config/secrets.json\nlink.env\n",
      files: ["config/secrets.json"],
    });
    symlinkSync("../outside/.env", join(main, "link.env"));
    await apply();
    expect(present("config/secrets.json")).toEqual(["config/secrets.json"]);
    expect(lstatSync(join(worktree, "link.env")).isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(worktree, "link.env"))).toBe("../outside/.env");
  });

  test("a tracked or non-ignored file is not copied", async () => {
    await setup({ gitignore: "", include: "loose.txt\n", files: ["loose.txt"] });
    await apply();
    expect(present("loose.txt")).toEqual([]);
  });

  test("the main checkout is not linked", async () => {
    await setup({ gitignore: ".env\n", include: ".env\n", files: [".env"] });
    expect(await copyIncludes({ run, readText }, main)).toEqual({ tag: "not-linked" });
  });

  test("no manifest, nothing to do", async () => {
    await setup({ gitignore: "", include: "" });
    rmSync(join(main, ".worktreeinclude"));
    expect(await apply()).toEqual({ tag: "no-manifest" });
  });

  test("not a git folder is not ready", async () => {
    expect(await copyIncludes({ run, readText }, root)).toEqual({ tag: "not-ready" });
  });

  test.each([
    {
      name: "a no-slash name skips node_modules",
      gitignore: "node_modules/\n.env\n",
      include: ".env\n",
      paths: ["node_modules/pkg/.env", ".env"],
      copies: [".env"],
    },
    {
      name: "**/ not naming the folder skips it",
      gitignore: "vendor/\nconfig.json\n",
      include: "**/config.json\n",
      paths: ["vendor/lib/config.json", "config.json"],
      copies: ["config.json"],
    },
    {
      name: "**/ naming the folder targets it",
      gitignore: ".claude/\n",
      include: "**/.claude/skills/*.md\n",
      paths: [".claude/skills/a.md", ".claude/other.md"],
      copies: [".claude/skills/a.md"],
    },
    {
      name: "a glob matching the folder itself targets it",
      gitignore: "tmp/\n",
      include: "**/tm*\n",
      paths: ["tmp/a.txt", "tmp/deep/b.txt"],
      copies: ["tmp/a.txt", "tmp/deep/b.txt"],
    },
    {
      name: "a path pattern into the folder targets it",
      gitignore: "vendor/\n",
      include: "vendor/**/config.json\n",
      paths: ["vendor/lib/config.json"],
      copies: ["vendor/lib/config.json"],
    },
    {
      name: "a no-slash glob does not target it",
      gitignore: "docs-cache/\n",
      include: "*.md\n",
      paths: ["docs-cache/a.md"],
      copies: [],
    },
    {
      name: "naming the folder targets it",
      gitignore: "vendor/\n",
      include: "vendor/\n",
      paths: ["vendor/lib/x.json"],
      copies: ["vendor/lib/x.json"],
    },
    {
      name: "negation still applies inside",
      gitignore: ".claude/\n",
      include: "**/.claude/skills/*.md\n!**/.claude/skills/secret.md\n",
      paths: [".claude/skills/a.md", ".claude/skills/secret.md"],
      copies: [".claude/skills/a.md"],
    },
  ])("ignored folders, as Claude Code 2.1.281: $name", async ({ gitignore, include, paths, copies }) => {
    await setup({ gitignore, include, files: paths });
    await apply();
    expect(present(...paths).sort()).toEqual([...copies].sort());
  });
});
