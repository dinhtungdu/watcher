# Agent Switcher architecture

Watcher uses explicit Status Hooks as the primary source for Agent Status, with tmux process/title/output heuristics as fallback while the Agent Switcher is open. Hooks call a small `watcher hook <agent> <event>` CLI shim, which reads tmux identity and forwards normalized events to the Watcher Daemon over a local Unix socket. The daemon stores snapshots keyed by tmux pane id; the Agent Switcher discovers current panes across all local tmux sessions, shows all running agent panes including idle panes, and activates the selected pane through tmux commands.

## Considered Options

- Scrape terminal output only: rejected because task/status inference from arbitrary TUI output is noisy and agent-specific.
- Require hooks only: rejected because unsupported or not-yet-restarted agents should still be discoverable best-effort.
- Poll tmux from the daemon continuously: rejected because capture polling is only needed while the switcher UI is open.
- Use Ink: rejected by product preference; use `@opentui/core` directly for MVP.

## Consequences

Supported agents need explicit `watcher hooks install` before rich status works. Existing running agents may need restart/reload before hooks emit events. Hook integrations stay small because they shell out to the Watcher CLI instead of embedding socket protocol code in every agent hook. Remote tmux sessions are out of scope for MVP; run Watcher on the remote host separately.
