import * as v from "valibot";
import { assertExhausted } from "../lib/assert";

export type Input = { mode: string; argvPath: string; eventJson: string; contextJson: string };
export type Target = { tag: "found"; path: string } | { tag: "missing"; reason: string };

const EVENT_VAR = "HERDR_PLUGIN_EVENT_JSON" as const;
const CONTEXT_VAR = "HERDR_PLUGIN_CONTEXT_JSON" as const;

const Path = v.pipe(v.string(), v.minLength(1));
const WorktreeEvent = v.object({ data: v.object({ worktree: v.object({ path: Path }) }) });
const ApplyContext = v.object({ worktree: v.object({ checkout_path: Path }) });

type Mode = "event" | "apply" | "unknown";

export function readInput(argv: string[], env: NodeJS.ProcessEnv): Input {
  return {
    mode: argv[2] ?? "",
    argvPath: argv[3] ?? "",
    eventJson: env[EVENT_VAR] ?? "",
    contextJson: env[CONTEXT_VAR] ?? "",
  };
}

export function resolveTarget(input: Input): Target {
  const mode = parseMode(input.mode);
  switch (mode) {
    case "event":
      return parse(WorktreeEvent, EVENT_VAR, input.eventJson, (event) => event.data.worktree.path);
    case "apply": {
      const context = parse(ApplyContext, CONTEXT_VAR, input.contextJson, (scope) => scope.worktree.checkout_path);
      return context.tag === "missing" && input.argvPath ? found(input.argvPath) : context;
    }
    case "unknown":
      return missing(`unknown mode: ${input.mode || "(none)"}`);
    default:
      return assertExhausted(mode);
  }
}

function parseMode(arg: string): Mode {
  return arg === "event" || arg === "apply" ? arg : "unknown";
}

function parse<T>(schema: v.GenericSchema<T>, name: string, raw: string, pathOf: (value: T) => string): Target {
  if (!raw) return missing(`${name} is not set`);
  try {
    const result = v.safeParse(schema, JSON.parse(raw));
    return result.success ? found(pathOf(result.output)) : missing(`${name}: ${v.summarize(result.issues)}`);
  } catch {
    return missing(`${name}: not JSON`);
  }
}

function found(path: string): Target {
  return { tag: "found", path };
}

function missing(reason: string): Target {
  return { tag: "missing", reason };
}
