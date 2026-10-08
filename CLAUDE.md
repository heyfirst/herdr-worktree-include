## Agent setup

Written by `/heyfirst:setup`. Rerun it to change a row; do not guess around it.

| Row          | Value                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Base branch  | `origin/main`                                                                                                                  |
| Verify       | typecheck `bun run typecheck`, lint `bun run lint`, format `bun run format:check`, one file `bun test <file>`, full `bun test` |
| Destination  | `home` -- `<frames>/<slug>/` (`~/Workspace/obsidian/ai/herdr-worktree-include/frames/<slug>/`)                                 |
| LoC budget   | 600                                                                                                                            |
| Feature gate | `none`                                                                                                                         |
| Deploy order | `none` -- release: `bun run check`, commit `dist/` with the source, push                                                       |
