# Agent Switcher focus layout

Watcher organizes the Agent Switcher as `repo > worktree/branch > sessions`, with worktrees from the same repository grouped together and all running Agent Panes shown under each worktree, including idle panes. The worktree path is the grouping identity because branch names alone are ambiguous; branch names are displayed as context, and panes without Git metadata fall back to path grouping.

## Considered Options

- Flat status-first list: rejected because it scatters related work across the switcher and makes multi-worktree repositories harder to scan.
- Repo-only grouping: rejected because multiple worktrees in the same repository represent separate task contexts.
- Showing only one pane per worktree: rejected because users still need to choose between multiple running sessions in the same branch/worktree.
- Text status badges in rows: rejected because they add noise; rows use a colored status dot and the details pane carries exact status.
- Status-gated visibility: rejected because Watcher is a switcher, not only an alert queue. Agent Status affects sort priority and context; all running agents remain visible, including idle panes.

## Consequences

The switcher needs best-effort Git metadata for repo, branch, and worktree path, plus a path fallback when Git metadata is unavailable. It also needs Agent Status for priority sorting and selected-pane context even though status no longer gates visibility. Activation continues to exit the TUI before jumping to the selected Agent Pane, so Watcher remains a focus switcher rather than a dashboard to keep open.
