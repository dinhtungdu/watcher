# Agent Switcher architecture

Watcher uses explicit Agent Integrations as the primary source for Agent Status and activity, with terminal-backend process/title/output heuristics as fallback while the Agent Switcher is open. Integrations call a small `watcher event <agent> <event>` CLI shim, which reads backend identity and forwards normalized Watcher Agent Events to the Watcher Daemon over a local Unix socket. Agent Event Sources are installed with `watcher integrations install`. The daemon stores snapshots keyed by backend-local surface id; the Agent Switcher discovers current panes across supported local Terminal Backends, shows all running agent panes including idle panes, uses Agent Status for priority/context rather than visibility, and activates the selected pane through backend-specific commands.

## Considered Options

- Scrape terminal output only: rejected because task/status inference from arbitrary TUI output is noisy and agent-specific.
- Require hooks only: rejected because unsupported or not-yet-restarted agents should still be discoverable best-effort.
- Poll terminal backends from the daemon continuously: rejected because capture polling is only needed while the switcher UI is open.
- Use Ink: rejected by product preference.
- Use `@opentui/core`: rejected after Bun/runtime compatibility issues and prototype mismatch; render the accepted prototype-style ANSI terminal frame directly for MVP.

## Consequences

Supported agents need explicit `watcher integrations install` before rich status works. Existing running agents may need restart/reload before integrations emit events. Integrations stay small because they shell out to the Watcher CLI instead of embedding socket protocol code in every agent hook/plugin. Remote terminal backends are out of scope for MVP; run Watcher on the remote host separately.
