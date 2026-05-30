# Watcher

Watcher helps a user observe running agent sessions and jump to the relevant workspace.

## Language

**Agent Pane**:
An interactive workspace running an agent session that Watcher can surface and activate. Agent Panes are identified by a Terminal Backend and that backend's local surface identity.
_Avoid_: Agent activity, agent shell, bot pane

**Agent Status**:
The current condition of an Agent Pane: working, needs input, idle, unknown, or stalled. Agent Status is used for priority, visual attention, and detail context; it does not decide whether a running Agent Pane appears in the Agent Switcher.
_Avoid_: Activity, state, health

**Pending Assistant Message**:
A completed assistant message observed before the agent turn has finished. It may be promoted to the final assistant message when the Agent Pane becomes idle, but it is not itself the final assistant result.
_Avoid_: Last message, final answer, assistant summary

**Needs Input Agent**:
An Agent Pane that explicitly needs human input, permission, or a decision before continuing. Recent activity may remain visible as context for what needs the input.
_Avoid_: Blocked agent, waiting agent, stuck agent

**Stalled Agent**:
An Agent Pane that appears to be working but has had no output, title, or Watcher Agent Event change for a configured time window.
_Avoid_: Stuck agent

**Agent Integration**:
Watcher’s knowledge of how to detect, install support for, and interpret events from a specific agent program. Capability metadata describes what Watcher currently supports, not every upstream feature the agent may theoretically expose.
_Avoid_: Agent provider, agent backend, agent plugin, agent abstraction

**Watcher Agent Event**:
A normalized event describing agent progress, such as a user message, assistant message, tool activity, need for input, or completion. Agent Integrations translate agent-specific hooks and plugins into Watcher Agent Events before sending them to Watcher.
_Avoid_: Raw hook event, agent callback, daemon event

**Observation Capability**:
The currently active way Watcher can observe a specific Agent Pane, such as integration events, assistant deltas, or terminal preview. Observation Capability describes what is true for one running Agent Pane, not what an Agent Integration or Terminal Backend could theoretically support.
_Avoid_: Integration capability, supported feature, provider capability

**Agent Event Source**:
An installed hook, plugin, extension, or stream connection that emits Watcher Agent Events for an Agent Pane.
_Avoid_: Status hook, silent hook, auto hook

**Event Surface Identity**:
The backend-aware identity an Agent Event Source reports so Watcher can associate a Watcher Agent Event with the correct Agent Pane. Its canonical key combines Terminal Backend and backend-local surface id, such as `tmux:%7`.
_Avoid_: Pane id, hook target, routing metadata

**Repo Group**:
A collection of Agent Panes that belong to the same source repository. Repo Groups contain one or more Worktree Groups.
_Avoid_: Project group, repo bucket

**Worktree Group**:
A collection of Agent Panes that share the same Git worktree path within a Repo Group. The branch is displayed as context, but the worktree path is the identity.
_Avoid_: Branch group, session group

**Path Fallback Group**:
A collection of Agent Panes grouped by path when Watcher cannot determine repository and worktree identity.
_Avoid_: Unknown repo, ungrouped panes

**Terminal Backend**:
A local terminal environment that can discover, identify, and activate Agent Panes. tmux is Watcher's current Terminal Backend.
_Avoid_: Provider, terminal type, transport

**Running Agent Pane**:
An Agent Pane whose Terminal Backend surface still exists and is running a known agent process or has reported through an Agent Event Source. Running Agent Panes are shown regardless of Agent Status, including `idle`.
_Avoid_: Non-terminated agent pane, active-only session, actionable-only pane

**Agent Pane Activation**:
The user action of jumping from Watcher to the selected Agent Pane.
_Avoid_: Switch, attach, focus

**Watcher Daemon**:
The background process that receives Watcher Agent Events and serves the current Agent Pane snapshot to the TUI.
_Avoid_: Server, backend, monitor

**Agent Switcher**:
The terminal interface that lists running Agent Panes and activates the selected pane.
_Avoid_: Dashboard, monitor, agent list
