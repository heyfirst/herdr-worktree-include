# herdr-worktree-include

A [herdr](https://herdr.dev) plugin that copies gitignored local files, like
`.env` and local config, into every new herdr worktree.

Git worktrees check out tracked files only, so a new worktree starts without
the files that make the project run. This plugin reads the same
`.worktreeinclude` file as [Claude Code](https://code.claude.com/docs/en/worktrees),
so one file covers both.

## Install

Requires herdr 0.9.0 or later and [Bun](https://bun.sh) on `PATH`.

```bash
herdr plugin install heyfirst/herdr-worktree-include
```

No install step: herdr runs the prebuilt `dist/main.js`, which bundles its one
dependency, [valibot](https://valibot.dev).

## Use

Add a `.worktreeinclude` to the root of the repo, in `.gitignore` syntax:

```gitignore
.env
.env.*
!.env.example
config/local/
```

A file is copied into a new worktree only if it:

- matches `.worktreeinclude`, **and**
- is ignored by git in the main checkout.

Tracked files are never copied, because the worktree already has them. This
is the same rule Claude Code uses.

Git does the matching for both checks. Negation, directory patterns and nested
`.gitignore` files work exactly as they do in git.

The plugin runs on herdr's `worktree.created` event. To run it by hand on the
focused workspace, use the **Apply worktree include** action, or run this from
a checkout of this repo:

```bash
bun dist/main.js apply /path/to/worktree
```

## Safety

- Never overwrites a file that already exists in the worktree.
- Never copies tracked files.
- Never copies a path that is absolute or contains `..`.
- Skips files inside other linked worktrees nested in the main checkout.
- Recreates symlinks as symlinks, never follows them.
- Always exits 0, so it can never break worktree creation.
- Does nothing when there is no `.worktreeinclude`.

## Logs

Every run prints one JSON outcome, readable with:

```bash
herdr plugin log list --plugin heyfirst.worktree-include --limit 5
```

| `tag`         | Means                                                                           |
| ------------- | ------------------------------------------------------------------------------- |
| `applied`     | Ran. `files` lists each path as `copied`, `skipped` (with a reason) or `failed` |
| `no-manifest` | The main checkout has no `.worktreeinclude`                                     |
| `is-main`     | The target is the main checkout itself                                          |
| `no-source`   | Could not find the main checkout                                                |
| `no-target`   | Could not find the new worktree in the event                                    |

## Develop

```bash
bun install
bun run check        # tsc, oxlint (type-aware), oxfmt, bun test, then build
herdr plugin link .  # run your checkout instead of the installed copy
```

herdr runs `dist/main.js`, so rebuild after every change and commit `dist/`
with the source. `bun run check` rebuilds it.

Tests build real git repositories in a temp directory. Lint bans `any`,
`unknown` and unsafe access.

## Prior art

- [eightHundreds/herdr-worktreeinclude](https://github.com/eightHundreds/herdr-worktreeinclude):
  the same idea in Rust, shipped as a prebuilt binary. Its safety rules shaped
  the list above.
- [crexi/herdr-worktree-copy](https://github.com/crexi/herdr-worktree-copy):
  a shell plugin with its own manifest format.

## License

[MIT](LICENSE)
