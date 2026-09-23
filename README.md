# herdr-worktree-include 🥟

Claude Code's `.worktreeinclude`, now for [herdr](https://herdr.dev) worktrees too.

## The problem 😩

I use Claude Code as my main driver, at work and at home. And I always run a few agents at once, in multiple worktrees of one monorepo. Of course, herdr makes it much easier to manage them and see the state of each worktree's agent.

But every new worktree comes without gitignored files. So all the time, the agent can't even run the tests because there's no local env file, and all the time I just tell it: copy it from the main worktree, please.

Claude Code fixed this a long time ago with [`.worktreeinclude`](https://code.claude.com/docs/en/worktrees). herdr worktrees just don't use it tho.

## The fix ✨

I wrote a small plugin that makes herdr read the same `.worktreeinclude`, and now it works the same as `claude -w <name>` does. No more copy-pasta 🍝

## Install 📦

Requirements:

- [herdr](https://herdr.dev) >= 0.9.1
- Git
- [Bun](https://bun.sh) on `PATH`

```bash
herdr plugin install heyfirst/herdr-worktree-include
herdr plugin list    # heyfirst.worktree-include should be listed
```

That's it. No install step: herdr runs the prebuilt `dist/main.js`, which
already bundles its one dependency, [valibot](https://valibot.dev).

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

2. Create a new worktree in herdr, like you always do.
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

## Why Bun 🥟

It's just that Bun is always on my machine, personal laptop and work laptop, and TypeScript is my go-to language. So it was a no-brainer here.

TypeScript is also easier to read, understand and reason about than a shell script or Rust. This plugin copies files into my repository, so I should be able to explain it when something goes south. It's about 380 lines of code, and git is _load-bearing_ here anyway (😉😏) hehe.

## Not working? 🔍

Every run logs one JSON line saying what it did, or why it did nothing:

```bash
herdr plugin log list --plugin heyfirst.worktree-include --limit 5
```

What each result means is in [CONTRIBUTING.md](CONTRIBUTING.md#logs).

## Prior art 🙏

- [eightHundreds/herdr-worktreeinclude](https://github.com/eightHundreds/herdr-worktreeinclude):
  the same idea in Rust, shipped as a prebuilt binary. Its safety rules shaped
  ours.
- [crexi/herdr-worktree-copy](https://github.com/crexi/herdr-worktree-copy):
  a shell plugin with its own manifest format.

## License

[MIT](LICENSE)
