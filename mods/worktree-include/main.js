import { View, div } from "gpui-kit";
import { exec, notify, panes, readTextFile, spaces } from "herdr";
import { copyIncludes } from "./include.js";

const MAX_TRIES = 5;

const whereIs = (space) =>
  panes().find((p) => p.cwd && (space.tabs ?? []).some((t) => t.id === p.tab))?.cwd || space.folder;

export default class WorktreeInclude extends View {
  init() {
    this.seen = new Set(spaces().map((s) => s.id));
    this.tries = {};
  }

  async handle(space) {
    const folder = whereIs(space);
    this.tries[space.id] = (this.tries[space.id] ?? 0) + 1;
    const retry = () => {
      if (this.tries[space.id] < MAX_TRIES) this.seen.delete(space.id);
    };
    if (!folder) return retry();
    const on = space.machine ?? undefined;
    const io = {
      run: (command, args, cwd) => exec(command, args, { cwd, on }),
      readText: (path) => readTextFile(path, { on }),
    };
    try {
      const outcome = await copyIncludes(io, folder);
      if (outcome.tag === "not-ready") retry();
      if (outcome.tag === "applied" && outcome.failures.length > 0) {
        notify({
          title: "worktree-include: some files were not copied",
          body: outcome.failures.join("\n"),
          level: "error",
        });
      }
    } catch (error) {
      notify({ title: "worktree-include failed", body: String(error?.message ?? error), level: "error" });
    }
  }

  render() {
    for (const space of spaces()) {
      if (this.seen.has(space.id)) continue;
      this.seen.add(space.id);
      void this.handle(space);
    }
    return div();
  }
}
