# Contributing

## Develop

```bash
bun install
bun run check        # tsc, oxlint, oxfmt, bun test, herdr-app check
```

The mod is plain JavaScript in `mods/worktree-include/`. There is no build. Copy the files to `~/.config/herdr-app/mods/worktree-include/` to run your checkout (the app refuses links). How the pieces fit is in [CONTEXT.md](CONTEXT.md).

Tests build real git repositories in a temp directory: `core.test.js` for the rules, `include.test.js` for the git and copy steps.

## What gets copied

A file is copied only when **both** are true:

| Check                               | Why                                       |
| ----------------------------------- | ----------------------------------------- |
| It matches `.worktreeinclude`       | You asked for it                          |
| git ignores it in the main checkout | Tracked files are already in the worktree |

This is the same rule Claude Code uses. git does both checks itself, so negation, directory patterns and nested `.gitignore` files work exactly as they do in git.

## Safety rules

- Never overwrites a file that already exists in the worktree.
- Never copies tracked files.
- Never copies a path that is absolute or contains `..`.
- Skips files inside other linked worktrees nested in the main checkout.
- Recreates symlinks as symlinks, never follows them.
- Does nothing when there is no `.worktreeinclude`.

Every rule has a test. A change that loosens a rule needs a reason in the commit body.

## Failures

A failure raises a Herdr notification. A skipped file is silent: `exists`, `unsafe-path` or `other-worktree`.
