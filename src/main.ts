import { copyIncludes, mainWorktreeOf, type Outcome } from "./io/copy-includes";
import { readInput, resolveTarget } from "./core/herdr-input";

await run().then(
  (outcome) => console.log(JSON.stringify(outcome)),
  (error) => console.error(`worktree-include: ${error instanceof Error ? error.stack : String(error)}`),
);
process.exit(0);

async function run(): Promise<Outcome> {
  const target = resolveTarget(readInput(process.argv, process.env));
  if (target.tag === "missing") return { tag: "no-target", reason: target.reason };

  const source = await mainWorktreeOf(target.path);
  if (source.tag === "none") return { tag: "no-source", target: target.path };

  return copyIncludes(source.path, target.path);
}
