import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as v from "valibot";

const REPO_ROOT = resolve(import.meta.dir, "..");
const Manifest = v.object({
  events: v.array(v.object({ on: v.string(), command: v.array(v.string()) })),
});

let root: string;
let main: string;
let worktree: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "wti-e2e-"));
  main = join(root, "main");
  worktree = join(root, "feature");
  await mkdir(main);
  await git(["init", "-q"], main);
  await writeFile(join(main, ".gitignore"), ".env\nnode_modules/\n");
  await writeFile(join(main, ".worktreeinclude"), "**/.env\n");
  await git(["add", "."], main);
  await git(["-c", "user.email=test@example.com", "-c", "user.name=test", "commit", "-q", "-m", "init"], main);
  await git(["worktree", "add", "-q", "-b", "feature", worktree], main);
  await writeFile(join(main, ".env"), "SECRET=1\n");
  await mkdir(join(main, "node_modules/pkg"), { recursive: true });
  await writeFile(join(main, "node_modules/pkg/.env"), "THIRD_PARTY=1\n");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test.each([
  {
    name: "a real event copies .env and leaves node_modules alone",
    event: () => JSON.stringify({ event: "worktree.created", data: { worktree: { path: worktree } } }),
    tag: "applied",
    copied: true,
  },
  {
    name: "an event without a worktree path reports no-target",
    event: () => JSON.stringify({ event: "worktree.created", data: {} }),
    tag: "no-target",
    copied: false,
  },
  { name: "malformed JSON reports no-target", event: () => "not json", tag: "no-target", copied: false },
])("worktree.created, run as herdr runs it: $name", async ({ event, tag, copied }) => {
  const proc = Bun.spawn(await eventCommand(), {
    cwd: REPO_ROOT,
    env: { ...process.env, HERDR_PLUGIN_EVENT_JSON: event() },
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();

  expect(await proc.exited).toBe(0);
  expect(stdout).toContain(`"tag":"${tag}"`);
  expect(await Bun.file(join(worktree, ".env")).exists()).toBe(copied);
  expect(await Bun.file(join(worktree, "node_modules/pkg/.env")).exists()).toBe(false);
  if (copied) expect(await readFile(join(worktree, ".env"), "utf8")).toBe("SECRET=1\n");
});

async function eventCommand(): Promise<string[]> {
  const manifest = v.parse(Manifest, Bun.TOML.parse(await Bun.file(join(REPO_ROOT, "herdr-plugin.toml")).text()));
  const command = manifest.events.find((e) => e.on === "worktree.created")?.command;
  if (!command) throw new Error("herdr-plugin.toml has no worktree.created event");
  return command;
}

async function git(args: string[], cwd: string): Promise<void> {
  const code = await Bun.spawn(["git", ...args], { cwd, stdout: "ignore", stderr: "ignore" }).exited;
  if (code !== 0) throw new Error(`git ${args.join(" ")} failed`);
}
