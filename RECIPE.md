# Recipe: worktree-include

Copies the files named in `.worktreeinclude` from the main checkout into a new linked worktree.

## What it does

- `render` diffs `spaces()` against a seen-set. The spaces present at start are seeded, so only new ones are touched.
- For a new space it runs `git` and `cp -n` with `exec`, `on: space.machine`, so a remote space runs on its own machine.
- A space that is not a linked worktree (`git worktree list --porcelain`) is ignored. No path is assumed: the app's `~/.herdr/worktrees/<repo>/<branch>` and a plain `git worktree add` both work.
- A space whose folder is not ready yet is retried on the next render, up to 5 times.
- Nothing is overwritten. Failures go to `notify`.

## Files

| File         | Job                                                     |
| ------------ | ------------------------------------------------------- |
| `main.js`    | the view: seen-set, `exec`, `notify`                    |
| `include.js` | git and copy steps, with `run` and `readText` passed in |
| `core.js`    | pure rules: linked worktree, skip rules, patterns       |
| `mod.json`   | `place: "none"`                                         |

## Install

Copy the four files into `~/.config/herdr-app/mods/worktree-include/` (not links), then add a 0px block to the layout:

```json
{ "id": "worktree-include", "type": "block", "content": { "mod": "worktree-include" }, "size": { "px": 0 } }
```

`place: "none"` mods only run where a layout puts them. The block is what starts it.

## Check

```bash
bun run check    # tsc, oxlint, oxfmt, bun test, herdr-app check
```
