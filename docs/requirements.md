# Watcher MVP Requirements

Watcher is a tmux-wide Agent Switcher. It lists actionable agent panes across all local tmux sessions and activates the selected pane.

## Scope

- Local tmux only.
- Node/TypeScript CLI named `watcher`.
- OpenTUI core for the switcher UI.
- In-memory Watcher Daemon.
- Explicit hooks where supported; tmux/process/title/output fallback while the TUI is open.

## Commands

- `watcher`: open Agent Switcher.
- `watcher daemon`: run Watcher Daemon.
- `watcher hook <agent> <event>`: CLI shim called by agent hooks; reads JSON from stdin and `$TMUX_PANE`.
- `watcher hooks install [agents...]`: install supported hooks.
- `watcher hooks status`: show hook install status.

## Statuses

- `working`: agent is handling a prompt.
- `needs_input`: agent needs human input, permission, or decision.
- `stalled`: agent appears working but has no output/status/title change for 5 minutes.
- `unknown`: known agent process exists but no reliable status yet.
- `idle`: agent finished or is inactive; hidden by default.

## Switcher Layout

Show Non-Terminated Agent Panes with statuses `needs_input`, `stalled`, `working`, and `unknown`. Hide `idle` by default.

Group the list as:

1. Repo Group
2. Worktree Group
3. Agent Pane rows

Repo and worktree rules:

- Group all worktrees from the same repository under one Repo Group.
- Key Worktree Groups by Git worktree path, not branch name alone.
- Show branch and worktree path in each Worktree Group header.
- If repository/worktree metadata is unavailable, use a Path Fallback Group keyed by pane path.
- Show all Non-Terminated Agent Panes within each Worktree Group.

Agent Pane rows should stay minimal:

- colored status dot
- agent type
- task/prompt summary

Do not show status words like `WORK`, `STALL`, or `UNKNOWN` in the row. Do not show a time column in the row.

Selected Agent Pane details should show:

- exact Agent Status
- agent type
- repo, branch, and worktree path, or path fallback
- task/prompt summary
- current tool/action when available
- last assistant message preview when available
- tmux session/window/pane
- last update age

Responsive layout:

- wide terminals: list on the left with a large details pane on the right
- medium/narrow terminals: list-first layout with selected summary at the bottom
- selected row: full-width, theme-adaptive reverse highlight; no hardcoded colors and no selection triangle

Ordering:

1. Repo Groups by highest-priority Non-Terminated Agent Pane, then newest update.
2. Worktree Groups by highest-priority Non-Terminated Agent Pane, then newest update.
3. Agent Pane rows within a Worktree Group by status priority, then newest update.

Status priority:

1. `needs_input`
2. `stalled`
3. `working`
4. `unknown`

## Tmux Discovery

While the switcher is open:

- poll `tmux list-panes -a` every 2 seconds
- detect known agent processes by pane command and one-level process tree scan from `pane_pid`
- capture pane tail/hash for candidate agent panes only
- derive `stalled` when status is `working` and no hook/title/output change for 5 minutes

No ghost panes: if tmux pane no longer exists, hide it.

## Activation

- Inside tmux: switch client to target session, select target window, select target pane.
- Outside tmux: select target window/pane first, then attach to target session.
- Use tmux pane ids like `%42`.
- Exit TUI before activation/attach.

## Hooks

Hooks shell out to `watcher hook <agent> <event>` rather than embedding daemon protocol code.

`watcher hook`:

- reads `$TMUX_PANE` as pane id
- reads JSON payload from stdin
- starts daemon if absent, retries briefly
- exits 0 silently if daemon unavailable
- never breaks the agent

Event mapping:

- `session-start` -> `unknown`
- `prompt-submit` / `agent-start` -> `working`
- `needs-input` / `permission` / `question` -> `needs_input`
- `stop` / `agent-end` -> `idle`
- `error` -> `needs_input` with reason `error`

## Pi MVP Hook

Install global extension:

`~/.pi/agent/extensions/watcher-status.ts`

Behavior:

- `session_start` -> `watcher hook pi session-start`
- `before_agent_start` -> `watcher hook pi prompt-submit` with prompt
- `agent_end` -> `watcher hook pi stop` with last assistant message when available

Installer:

- overwrite only files with Watcher marker
- refuse to overwrite non-Watcher file
- after install, tell user to `/reload` existing Pi panes or restart them

## Non-goals MVP

- remote SSH/tmux relay
- session resume/restore
- history database
- unread/dismiss workflow
- parsing arbitrary terminal output for task text
- automatic silent global config mutation
