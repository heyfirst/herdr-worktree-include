## Agent setup

Written by an agent setup skill. Rerun it to change a row; do not guess around it.

| Row          | Value                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Base branch  | `origin/main`                                                                                                                  |
| Verify       | typecheck `bun run typecheck`, lint `bun run lint`, format `bun run format:check`, one file `bun test <file>`, full `bun test` |
| Destination  | `home` -- `<frames>/<slug>/` (`<notes>/herdr-worktree-include/frames/<slug>/`)                                                 |
| LoC budget   | 600                                                                                                                            |
| Feature gate | `none`                                                                                                                         |
| Deploy order | `none` -- release: `bun run check`, copy `mods/worktree-include` into `~/.config/herdr-app/mods/`, push                        |
