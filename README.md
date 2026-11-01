# herdr-worktree-include 🥟

Claude Code's `.worktreeinclude`, now for [herdr](https://herdr.dev) worktrees too.

## The problem 😩

I use Claude Code as my main driver, at work and at home. And I always run a few agents at once, in multiple worktrees of one monorepo. Of course, herdr makes it much easier to manage them and see the state of each worktree's agent.

But every new worktree comes without gitignored files. So all the time, the agent can't even run the tests because there's no local env file, and all the time I just tell it: copy it from the main worktree, please.

Claude Code fixed this a long time ago with [`.worktreeinclude`](https://code.claude.com/docs/en/worktrees). herdr worktrees just don't use it tho.

## The fix ✨

A small [Herdr app](https://herdr.dev) mod. When a new linked-worktree space appears, it reads the same `.worktreeinclude` and copies the files, so it works the same as `claude -w <name>` does. No more copy-pasta 🍝

## Install 📦

Requirements: the Herdr app and Git. No Bun, no build.

```bash
git clone https://github.com/heyfirst/herdr-worktree-include
mkdir -p ~/.config/herdr-app/mods/worktree-include
cp herdr-worktree-include/mods/worktree-include/{main,core,include}.js \
   herdr-worktree-include/mods/worktree-include/mod.json \
   ~/.config/herdr-app/mods/worktree-include/
```

The files are copied, not linked: the app refuses an import that resolves outside the mod folder.

The mod has no window. Add it to your layout as a 0px block so the app runs it:

```json
{ "id": "worktree-include", "type": "block", "content": { "mod": "worktree-include" }, "size": { "px": 0 } }
```

See [RECIPE.md](RECIPE.md) for the details.

## Use 🛠️

1. Create a file named `.worktreeinclude` in your repo root. If you use Claude
   Code, you might have one already.

   List the gitignored files each new worktree should get, one per line, in
   `.gitignore` syntax. For example:

   ```gitignore
   # .worktreeinclude

   # Bun / Node: every app's env files in the monorepo, but not the template
   **/.env
   **/.env.*
   !**/.env.example
   .npmrc

   # Cloudflare Wrangler: one .dev.vars per worker
   **/.dev.vars

   # Terraform: one tfvars per environment
   **/terraform.tfvars
   **/*.auto.tfvars

   # Docker, direnv, local certs
   docker-compose.override.yml
   .envrc
   /certs/

   # CI secrets for running GitHub Actions locally with act
   .secrets

   # your agent's local notes and settings
   CLAUDE.local.md
   .claude/settings.local.json
   ```

2. Create a new worktree in the app, or with `git worktree add`. Any new linked worktree works.
3. That's it. Your `.env` is already there. 🎉

`**/` means "at any depth", so one line covers a whole monorepo:

| Pattern               | Copies                                                                    | Leaves alone                              |
| --------------------- | ------------------------------------------------------------------------- | ----------------------------------------- |
| `**/.env`             | `.env`, `apps/web/.env`, `apps/api/.env`                                  | `node_modules/some-pkg/.env`              |
| `**/.dev.vars`        | `workers/auth/.dev.vars`, `workers/billing/.dev.vars`                     | `node_modules/wrangler/.dev.vars`         |
| `**/terraform.tfvars` | `infra/envs/staging/terraform.tfvars`, `infra/envs/prod/terraform.tfvars` | `.terraform/modules/vpc/terraform.tfvars` |

It never digs into a folder that's ignored as a whole, like `node_modules/` or
`.terraform/`, unless a pattern names that folder. Same rule as Claude Code.

Only gitignored files are copied, and nothing already in the worktree gets
overwritten. Leave out `node_modules/` and build output. They're
big, and your package manager rebuilds them anyway.

## Why plain JavaScript 🥟

The app loads a mod as-is, so there is nothing to build or install. It is a few small files, and git is _load-bearing_ here anyway (😉😏) hehe. Tests run with `bun test`.

## Not working? 🔍

A failed run raises a notification: "worktree-include failed" or "some files were not copied", with the reason. A run that finds nothing to do (no `.worktreeinclude`, not a linked worktree) is silent.

## Prior art 🙏

- [eightHundreds/herdr-worktreeinclude](https://github.com/eightHundreds/herdr-worktreeinclude):
  the same idea in Rust, shipped as a prebuilt binary. Its safety rules shaped
  ours.
- [crexi/herdr-worktree-copy](https://github.com/crexi/herdr-worktree-copy):
  a shell plugin with its own manifest format.

## License

[MIT](LICENSE)
