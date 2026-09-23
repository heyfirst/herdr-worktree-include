import { apply, mainWorktreeOf, type Outcome } from "./apply";
import { field, parseJson, type Json } from "./json";

type Mode = "event" | "apply";

await run().then(
  (outcome) => console.log(JSON.stringify(outcome)),
  (error) => console.error(`worktree-include: ${error instanceof Error ? error.stack : String(error)}`)
);
process.exit(0);

async function run(): Promise<Outcome> {
  const target = resolveTarget(parseMode(process.argv[2]), process.argv[3]);
  if (!target) return { tag: "no-target" };

  const source = await mainWorktreeOf(target);
  if (!source) return { tag: "no-source", target };

  return apply(source, target);
}

function parseMode(arg: string | undefined): Mode | null {
  return arg === "event" || arg === "apply" ? arg : null;
}

function resolveTarget(mode: Mode | null, argvPath: string | undefined): string | null {
  switch (mode) {
    case "event":
      return nonEmpty(field(field(field(parseJson(process.env.HERDR_PLUGIN_EVENT_JSON), "data"), "worktree"), "path"));
    case "apply":
      return checkoutPath(parseJson(process.env.HERDR_PLUGIN_CONTEXT_JSON)) ?? argvPath ?? null;
    case null:
      return null;
  }
}

function checkoutPath(scope: Json | undefined): string | null {
  return nonEmpty(field(field(scope, "worktree"), "checkout_path"));
}

function nonEmpty(value: Json | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
