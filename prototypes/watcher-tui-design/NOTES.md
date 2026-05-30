# Watcher TUI design prototype notes

Question: Does a `repo > worktree/branch > sessions` hierarchy make the Watcher Agent Switcher easier to scan while nudging users to activate one session at a time?

Decision to test: Watcher should group worktrees of the same repo together, display branch + worktree path under the repo, and show all running agent sessions in each worktree, including idle panes. Activation still exits the switcher so the user works one session at a time.

Coverage: fake data includes one repo with multiple worktree paths (`watcher > main ~/workspace/watcher`, `watcher > feature/tui-redesign ~/workspace/watcher-tui-redesign`), multiple sessions in the same worktree/branch, and non-git panes grouped by path fallback.

Verdict: Accepted as the final MVP switcher design, with the later product decision to show all running agents including idle panes. Implement the Agent Switcher as `repo > worktree/branch > sessions`, show all running agent sessions inside each worktree, keep rows minimal, and put richer selected-session context in the detail pane. Production code should absorb the grouping, row shape, selection, detail-pane, and responsive layout decisions without importing this throwaway prototype.

Run: `node prototypes/watcher-tui-design/prototype.mjs`
