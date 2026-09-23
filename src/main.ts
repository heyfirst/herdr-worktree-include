import * as v from "valibot";
import { apply, mainWorktreeOf, type Outcome } from "./apply";

type Mode = "event" | "apply";

const Path = v.pipe(v.string(), v.minLength(1));
const WorktreeEvent = v.object({ data: v.object({ worktree: v.object({ path: Path }) }) });
const ApplyContext = v.object({ worktree: v.object({ checkout_path: Path }) });

await run().then(
  (outcome) => console.log(JSON.stringify(outcome)),
  (error) => console.error(`worktree-include: ${error instanceof Error ? error.stack : String(error)}`),
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
      return parseEnv(WorktreeEvent, process.env.HERDR_PLUGIN_EVENT_JSON)?.data.worktree.path ?? null;
    case "apply":
      return parseEnv(ApplyContext, process.env.HERDR_PLUGIN_CONTEXT_JSON)?.worktree.checkout_path ?? argvPath ?? null;
    case null:
      return null;
  }
}

function parseEnv<T>(schema: v.GenericSchema<T>, raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    const result = v.safeParse(schema, JSON.parse(raw));
    return result.success ? result.output : null;
  } catch {
    return null;
  }
}
