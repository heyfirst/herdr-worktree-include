# Contributing

## Develop

```bash
bun install
bun run check        # tsc, oxlint (type-aware), oxfmt, build, then bun test
herdr plugin link .  # run your checkout instead of the installed copy
```

herdr runs `dist/main.js`, so rebuild after every change and commit `dist/`
with the source. `bun run check` rebuilds it.

How the pieces fit is in [CONTEXT.md](CONTEXT.md).

Tests build real git repositories in a temp directory. `src/e2e.test.ts` runs
the exact command from `herdr-plugin.toml` with a real event payload, so the
build runs first. Lint bans `any`,
`unknown` and unsafe access.

## What gets copied

A file is copied only when **both** are true:

| Check                               | Why                                       |
| ----------------------------------- | ----------------------------------------- |
| It matches `.worktreeinclude`       | You asked for it                          |
| git ignores it in the main checkout | Tracked files are already in the worktree |

This is the same rule Claude Code uses. git does both checks itself, so
negation, directory patterns and nested `.gitignore` files work exactly as they
do in git.

## Safety rules

- Never overwrites a file that already exists in the worktree.
- Never copies tracked files.
- Never copies a path that is absolute or contains `..`.
- Skips files inside other linked worktrees nested in the main checkout.
- Recreates symlinks as symlinks, never follows them.
- Always exits 0, so it can never break worktree creation.
- Does nothing when there is no `.worktreeinclude`.

Tests in `src/apply.test.ts` and `src/plan.test.ts` cover all of these except
two: symlinks and the exit code. A change that loosens a rule needs a reason in
the commit body.

## Logs

Every run logs one JSON line:

```bash
herdr plugin log list --plugin heyfirst.worktree-include --limit 5
```

```json
{
  "tag": "applied",
  "source": "/code/app",
  "target": "/code/app-fix-login",
  "files": [{ "tag": "copied", "path": ".env" }]
}
```

| `tag`         | Means                                                             |
| ------------- | ----------------------------------------------------------------- |
| `applied`     | Ran. Each file is `copied`, `skipped` (with a reason) or `failed` |
| `no-manifest` | The main checkout has no `.worktreeinclude`                       |
| `is-main`     | The target is the main checkout itself                            |
| `no-source`   | Could not find the main checkout                                  |
| `no-target`   | Could not find the new worktree in the event                      |

A skipped file says why: `exists`, `unsafe-path` or `other-worktree`.
