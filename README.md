# herdr-worktree-include

A [herdr](https://herdr.dev) plugin that copies your gitignored local files --
`.env`, local config, secrets -- into every new herdr worktree, using the same
`.worktreeinclude` file [Claude Code](https://code.claude.com/docs/en/worktrees)
reads.

Git worktrees check out tracked files only, so a new worktree starts without
the files that make the project run. One `.worktreeinclude` now covers both
herdr and Claude Code worktrees.

## Install

Requires herdr 0.9.0 or later and [Bun](https://bun.sh) on `PATH`.

```bash
herdr plugin install heyfirst/herdr-worktree-include
```

No build step and no runtime dependencies: herdr runs `bun src/main.ts`
directly.

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

Tracked files are never copied -- the worktree already has them. This is the
same rule Claude Code applies, and git decides both halves, so negation,
directory patterns and nested `.gitignore` files behave exactly as git says.

It runs on herdr's `worktree.created` event. To run it by hand on the focused
workspace, use the **Apply worktree include** action, or:

```bash
bun src/main.ts apply /path/to/worktree
```

## Safety

- Never overwrites a file that already exists in the worktree.
- Never copies tracked files.
- Rejects absolute paths and paths containing `..`.
- Skips files inside other linked worktrees nested in the main checkout.
- Symlinks are recreated as symlinks, never followed.
- Always exits 0, so it can never break worktree creation.
- No `.worktreeinclude` means it does nothing.

## Logs

Every run prints one JSON outcome, readable with:

```bash
herdr plugin log list --plugin heyfirst.worktree-include --limit 5
```

| `tag` | Means |
|---|---|
| `applied` | Ran. `files` lists each path as `copied`, `skipped` (with a reason) or `failed` |
| `no-manifest` | The main checkout has no `.worktreeinclude` |
| `is-main` | The target is the main checkout itself |
| `no-source` | Could not find the main checkout |
| `no-target` | Could not find the new worktree in the event |

## Develop

```bash
bun install
bun run check        # tsc, oxlint (type-aware), bun test
herdr plugin link .  # run your checkout instead of the installed copy
```

Tests build real git repositories in a temp directory. Lint bans `any`,
`unknown` and unsafe access.

## Prior art

- [eightHundreds/herdr-worktreeinclude](https://github.com/eightHundreds/herdr-worktreeinclude)
  -- the same idea in Rust, shipped as a prebuilt binary. Its safety rules
  shaped the list above.
- [crexi/herdr-worktree-copy](https://github.com/crexi/herdr-worktree-copy)
  -- a shell plugin with its own manifest format.

## License

[MIT](LICENSE)
