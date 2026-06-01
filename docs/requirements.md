# Watcher MVP Requirements

Watcher is a tmux-wide Agent Switcher. It lists running agent panes across all local tmux sessions and activates the selected pane.

## Scope

- Local tmux only.
- tmux is the supported backend for discovery, Event Surface Identity, stalled detection, and activation.
- Native Ghostty support is not part of the MVP.
- Bun/TypeScript CLI named `watcher`.
- Prototype-aligned terminal switcher UI rendered by the Bun CLI.
- In-memory Watcher Daemon.
- Explicit Agent Event Sources where supported; backend/process/title/output fallback while the TUI is open.

## Commands

- `watcher`: open Agent Switcher.
- `watcher daemon`: run Watcher Daemon.
- `watcher event <agent> <event>`: CLI shim called by Agent Integrations; reads JSON from stdin and `$TMUX_PANE`.
- `watcher integrations install <agents...>`: install supported Agent Event Sources.
- `watcher integrations status`: show Agent Event Source install status.

## Statuses

Agent Status describes priority and context for a running Agent Pane. It does not decide visibility; all running Agent Panes are shown.

- `working`: agent is handling a prompt.
- `needs_input`: agent needs human input, permission, or decision.
- `stalled`: agent appears working but has no output, title, or Watcher Agent Event change for 5 minutes.
- `unknown`: known agent process exists but no reliable status yet.
- `idle`: agent finished or is inactive; still shown while the agent pane exists so the switcher can activate it.

## Switcher Layout

Show all running Agent Panes with statuses `needs_input`, `stalled`, `working`, `unknown`, and `idle`. Hide only panes whose tmux pane no longer exists.

Use the final prototype layout: `repo > worktree/branch > sessions`.

Group the list as:

1. Repo Group
2. Worktree Group
3. Agent Pane rows

Repo and worktree rules:

- Group all worktrees from the same repository under one Repo Group.
- Key Worktree Groups by Git worktree path, not branch name alone.
- Show branch and worktree path in each Worktree Group header.
- If repository/worktree metadata is unavailable, use a Path Fallback Group keyed by pane path.
- Show all running Agent Panes within each Worktree Group, including `idle` panes.

Each session row should show only:

- colored status dot
- agent type
- task/prompt summary

Do not show status text badges, time columns, tmux target, cwd, current action, or message previews inline in rows.

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

- `?` toggles the top summary and bottom keyboard help; the preference is stored in tmux option `@watcher-hide-chrome`
- wide terminals: list on the left with a large details pane on the right
- medium/narrow terminals: list-first layout with selected summary at the bottom
- selected row: full-width, theme-adaptive reverse highlight; no hardcoded colors and no selection triangle

Ordering applies at Repo Group, Worktree Group, and Agent Pane row levels:

1. Repo Groups by highest-priority running Agent Pane, then newest update.
2. Worktree Groups by highest-priority running Agent Pane, then newest update.
3. Agent Pane rows within a Worktree Group by status priority, then newest update.

Status priority:

1. `needs_input`
2. `stalled`
3. `working`
4. `unknown`
5. `idle`

Within the same highest-priority status, newest update first.

## Backend Discovery

While the switcher is open, tmux discovery should:

- poll `tmux list-panes -a` every 2 seconds
- detect known agent processes by pane command, `pane_pid` process metadata, and one-level process tree scan from `pane_pid`
- capture pane tail/hash for candidate agent panes only
- derive `stalled` when status is `working` and no Watcher Agent Event, title, or output change occurs for 5 minutes

Native Ghostty discovery, Event Surface Identity, and activation are out of MVP. tmux sessions running inside Ghostty remain supported through the tmux backend.

No ghost panes: if a tmux pane no longer exists, hide it.

## Activation

- After activating an Agent Pane, save its canonical id in tmux option `@watcher-last-activated-pane`; the next switcher open should initially avoid that pane when any other Agent Pane exists, selecting the next non-idle Agent Pane after it and falling back to another idle pane when it is the only non-idle pane.
- tmux inside tmux: switch client to target session, select target window, select target pane.
- tmux outside tmux: select target window/pane first, then attach to target session.
- Use tmux pane ids like `%42`.
- Exit TUI before activation/attach/focus.

## Agent Event Sources

Agent Integrations shell out to `watcher event <agent> <event>` rather than embedding daemon protocol code.

`watcher event`:

- accepts only known Agent Integrations and normalized Watcher Agent Event names
- accepts `--quiet` only as `watcher event --quiet <agent> <event>` for generated Agent Event Sources
- reads Event Surface Identity from the event payload when present
- falls back to `$TMUX_PANE` as a tmux Event Surface Identity
- reads normalized Watcher Agent Event JSON from stdin; empty stdin is treated as `{}`
- validates the canonical payload schema; schema/agent/event errors are loud outside quiet mode and silent in quiet mode
- starts daemon if absent, retries briefly
- exits 0 silently if daemon unavailable
- never breaks the agent
- must not be called once per token; high-frequency streaming events should be coalesced by the Agent Integration before shelling out

Watcher Agent Event mapping:

- `session-started` -> `unknown`
- `user-message` / `assistant-delta` / `assistant-message` / `tool-started` / `tool-updated` / `tool-finished` -> `working`
- `needs-input` -> `needs_input`
- `agent-finished` -> `idle`
- `error` -> `needs_input` with reason `error`

Watcher Agent Event payload rules:

- event payload identity uses `surface`, not `target`
- message `text` fields must be strings
- `assistant-delta.text` is the current accumulated partial assistant text, not an incremental token chunk
- `tool-updated.text` is the current summarized tool state, not an append-only chunk
- tool `input` and `output` may be JSON values and are compacted centrally
- unknown extra fields are ignored, but required canonical fields are strict
- large text fields are capped centrally at ingestion; normal truncation and wrapping belong to display code

Agent Pane state rules:

- `AgentPane.id` is an internal canonical Event Surface Identity key such as `tmux:%42`; user-facing terminal labels come from the Terminal Target
- `user-message` sets `userMessage` and row `summary`
- assistant/tool events never replace `summary` once `userMessage` exists
- `assistant-delta` updates running activity and `currentAction = "Responding"`, but does not update `lastMessage`
- `assistant-message` stores a Pending Assistant Message and updates activity, but does not update `lastMessage` until completion
- `agent-finished` clears activity/current action and sets `lastMessage` from non-empty `finalMessage`, else Pending Assistant Message, else previous `lastMessage`
- activity items merge by id, are kept newest-first, and are limited to 3 while non-idle
- `needs-input` preserves recent activity context and may mark referenced activity as waiting

## Pi MVP Agent Event Source

Install global extension:

`~/.pi/agent/extensions/watcher-status.ts`

Behavior:

- `session_start` -> `watcher event pi session-started`
- `before_agent_start` -> `watcher event pi user-message` with prompt
- `message_end` -> `watcher event pi assistant-message` with last completed assistant message
- `tool_execution_start/update/end` -> `watcher event pi tool-started/tool-updated/tool-finished`
- `agent_end` -> `watcher event pi agent-finished` with last assistant message when available

Installer:

- overwrite only files with current or legacy Watcher markers
- report legacy Watcher-managed files as `outdated` until reinstalled
- refuse to overwrite non-Watcher file
- after install, tell user to `/reload` existing Pi panes or restart them

## Non-goals MVP

- remote SSH/tmux relay
- native Ghostty support before stable foreground PID/TTY support and cross-platform activation control
- session resume/restore
- history database
- unread/dismiss workflow
- parsing arbitrary terminal output for task text
- automatic silent global config mutation
