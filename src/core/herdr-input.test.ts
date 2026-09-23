import { describe, expect, test } from "bun:test";
import { readInput, resolveTarget, type Input, type Target } from "./herdr-input";

const EVENT = JSON.stringify({ data: { worktree: { path: "/code/app-fix" } } });
const CONTEXT = JSON.stringify({ worktree: { checkout_path: "/code/app-ctx" } });
const none: Input = { mode: "", argvPath: "", eventJson: "", contextJson: "" };

describe("resolveTarget", () => {
  test.each<{ name: string; input: Input; target: Target }>([
    {
      name: "event with a worktree path",
      input: { ...none, mode: "event", eventJson: EVENT },
      target: { tag: "found", path: "/code/app-fix" },
    },
    {
      name: "event not set",
      input: { ...none, mode: "event" },
      target: { tag: "missing", reason: "HERDR_PLUGIN_EVENT_JSON is not set" },
    },
    {
      name: "event not JSON",
      input: { ...none, mode: "event", eventJson: "nope" },
      target: { tag: "missing", reason: "HERDR_PLUGIN_EVENT_JSON: not JSON" },
    },
    {
      name: "apply reads the context",
      input: { ...none, mode: "apply", contextJson: CONTEXT, argvPath: "/ignored" },
      target: { tag: "found", path: "/code/app-ctx" },
    },
    {
      name: "apply falls back to the argument",
      input: { ...none, mode: "apply", argvPath: "/code/by-hand" },
      target: { tag: "found", path: "/code/by-hand" },
    },
    {
      name: "unknown mode",
      input: { ...none, mode: "bogus" },
      target: { tag: "missing", reason: "unknown mode: bogus" },
    },
  ])("$name", ({ input, target }) => {
    expect(resolveTarget(input)).toEqual(target);
  });

  test("a wrong event shape names the missing key", () => {
    const target = resolveTarget({ ...none, mode: "event", eventJson: JSON.stringify({ data: { worktree: {} } }) });

    expect(target.tag === "missing" && target.reason).toContain("data.worktree.path");
  });
});

describe("readInput", () => {
  test("turns missing argv and env into empty strings", () => {
    expect(readInput(["bun", "main.js"], {})).toEqual(none);
  });
});
