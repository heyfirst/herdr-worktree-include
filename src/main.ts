export {};

await main().catch((err) => {
  console.error(String(err instanceof Error ? err.stack ?? err.message : err));
});
process.exit(0);

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode !== "event" && mode !== "apply") {
    console.error(`worktree-include: unknown mode "${mode ?? ""}"`);
    return;
  }
  const target = mode === "event" ? eventTarget() : applyTarget(process.argv[3]);
  if (!target) {
    console.error("worktree-include: could not resolve target path");
    return;
  }

  const { apply, mainWorktreeOf } = await import("./apply");
  const source = await mainWorktreeOf(target);
  if (!source) {
    console.error(`worktree-include: could not resolve main worktree for ${target}`);
    return;
  }

  const report = await apply(source, target);
  console.log(JSON.stringify(report));
}

function eventTarget(): string | null {
  return checkoutPath(parseJson(process.env.HERDR_PLUGIN_EVENT_JSON)?.data);
}

function applyTarget(argvPath: string | undefined): string | null {
  return checkoutPath(parseJson(process.env.HERDR_PLUGIN_CONTEXT_JSON)) ?? argvPath ?? null;
}

function checkoutPath(scope: any): string | null {
  const path = scope?.worktree?.checkout_path;
  return typeof path === "string" && path.length > 0 ? path : null;
}

function parseJson(raw: string | undefined): any {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
