# Agent Integrations and normalized Watcher Agent Events

Watcher observes existing agent sessions running in terminal panes. It will model agent-specific support as Agent Integrations that emit normalized Watcher Agent Events, rather than centering the architecture on ACP or raw agent-specific hook events.

## Considered Options

- Use ACP as the primary integration path: rejected because Watcher's core workflow is observing and activating already-running terminal sessions, while ACP is best suited to sessions launched and owned by an ACP client.
- Let the Watcher Daemon understand raw events from each agent: rejected because Pi, Codex, OpenCode, and other agents expose different hook/plugin/event names and payloads; putting every dialect in the daemon would make it the integration junk drawer.
- Keep the hook model named around status: rejected because integrations now report user messages, assistant messages, tool activity, assistant deltas, input needs, and completion, not only Agent Status.
- Model terminal preview as an Agent Integration capability: rejected because terminal preview comes from the Terminal Backend, not from a specific agent program.

## Decision

Watcher will use **Agent Integrations** as the agent-specific abstraction. An Agent Integration owns detection, install/status behavior for its Agent Event Source, capability metadata, and translation from agent-specific hooks/plugins/events into normalized **Watcher Agent Events**.

Agent Event Sources call:

```sh
watcher event <agent> <event>
```

The event name and payload at this CLI boundary are normalized Watcher Agent Events, not raw Pi/Codex/OpenCode event names. The legacy `watcher hook` command is not retained because Watcher does not yet have external users.

Watcher will use `watcher integrations install` and `watcher integrations status` as the user-facing commands for installing and inspecting Agent Event Sources.

Watcher Agent Events include semantic activity such as user messages, assistant messages, optional assistant deltas, tool activity, input needs, completion, and errors. High-frequency assistant deltas must be coalesced by the Agent Integration before shelling out to `watcher event`; integrations must not spawn one process per token.

Agent Integrations and Terminal Backends remain separate axes. Terminal Backends own discovery, activation, and terminal preview capabilities. Agent Integrations own semantic agent events and assistant delta support. Per-pane Observation Capability describes what is actually active for a specific Agent Pane.

Event routing uses backend-aware Event Surface Identity. Event payloads may provide a `surface` identity; otherwise `watcher event` may fall back to `$TMUX_PANE` as a tmux Event Surface Identity. `AgentPane.id` is an internal canonical Event Surface Identity key such as `tmux:%7`; user-facing terminal labels come from the Terminal Target.

## Consequences

The daemon can stay focused on applying normalized Watcher Agent Events to Agent Pane state instead of learning every agent's native event dialect.

Pi remains the first fully functional Agent Integration during the refactor. OpenCode, Codex, and Claude can be added to the integration registry for detection/capability metadata before their installers are implemented.

Terminal preview is intentionally left as a separate implementation slice after the Agent Integration/event refactor.

Existing generated Pi hooks and CLI command names will be broken by the refactor and must be reinstalled, which is acceptable before public adoption.
