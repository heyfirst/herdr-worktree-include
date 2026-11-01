# How it works

What happens between "a new worktree space appears" and "`.env` is there".

```
main.js      render(): new space id? -> handle(space)
 └─▶ include.js   copyIncludes(io, folder)
      ├─▶ git rev-parse / worktree list     is this a linked worktree? where is the main one?
      ├─▶ git ls-files + check-ignore       match .worktreeinclude AND gitignored?
      ├─▶ core.js                           isLinkedWorktree, planIncludes, pattern rules (pure)
      └─▶ cp -n                             copy, never overwrite
```

| Piece        | Job                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| the app      | Creates the space, then re-renders every mod                                                                   |
| `main.js`    | Diffs `spaces()` against a seen-set seeded at start. Runs `copyIncludes` once per new space on `space.machine` |
| `include.js` | Asks git, decides with `core.js`, copies. `run` and `readText` are injected                                    |
| `core.js`    | Pure rules. No effects                                                                                         |
| layout block | A 0px block puts the mod on screen so `render` runs (`place: "none"` mods never start alone)                   |

A folder that is not ready (no cwd yet, or git cannot see it) is retried on the next render, up to 5 times.
