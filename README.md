# herdr-worktree-include 🥟

Your `.env` follows you into every new [herdr](https://herdr.dev) worktree.

## The problem 😩

You know git worktrees, right? One repo, many checkouts, one per branch. herdr
makes them one keystroke away, which is great when a few agents work on the same
repo at once.

But a new worktree only gets **tracked** files. Your `.env`, your local config,
the secrets that make the app actually run? All gitignored, so none of them come
along.

[Claude Code](https://code.claude.com/docs/en/worktrees) already solved this
with a `.worktreeinclude` file: list what to copy, and every Claude Code
worktree gets it. herdr worktrees don't read that file. So if Claude is your
main driver, like it is at my company, every new herdr worktree starts the same
way:

```diff
  $ herdr worktree create --branch fix-login
- agent: tests fail, DATABASE_URL is not set
- you:   cp ../main/.env .env   (again)
+ agent: tests pass
```

Copy-pasta, every single time. Annoying.

## The fix ✨

This plugin is a small helper that makes herdr read the same
`.worktreeinclude`. One file, both tools.

> Create a worktree in herdr or in Claude Code. Either way, `.env` is already
> there.

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

   # Bun / Node: env files and the private registry token
   .env
   .env.*
   !.env.example
   .npmrc

   # Cloudflare Wrangler
   .dev.vars

   # Terraform
   terraform.tfvars
   *.auto.tfvars

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

Only gitignored files are copied, and nothing already in the worktree gets
overwritten. Leave out `node_modules/` and build output. They're
big, and your package manager rebuilds them anyway.

## Why Bun 🥟

Bun is always on my machine, both my personal and my work laptop. So the choice
was a no-brainer.

> I'd rather read TypeScript than a shell script, or Rust, or Go.

This plugin copies files into your repo. You should be able to open it and see
exactly what it does. The whole thing is about 200 lines of TypeScript in
[`src/`](src), and git does the hard part.

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
