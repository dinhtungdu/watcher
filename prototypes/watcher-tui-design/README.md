# Watcher TUI design prototype

PROTOTYPE — throwaway.

Question: Does a `repo > worktree/branch > sessions` hierarchy make the Watcher Agent Switcher easier to scan while nudging users to activate one session at a time?

Design rule: group worktrees of the same repo together. Each worktree/branch shows all non-terminated Agent Panes. Idle/terminated panes are hidden by default.

Coverage: fake data includes one repo with multiple worktrees, branch labels, worktree paths, multiple sessions in one worktree/branch, and non-git path fallback.

Run:

```sh
node prototypes/watcher-tui-design/prototype.mjs
```

Controls:

- `↑/↓` or `j/k`: select Agent Pane
- `enter`: fake Agent Pane Activation
- `i`: show/hide idle panes
- `a`: auto responsive layout
- `1`, `2`, `3`: force narrow, medium, wide layouts
- `q`: quit

All Status Hook data, tmux targets, actions, messages, and project paths are fake.
