# Watcher

Watcher helps a user observe active agent sessions and jump to the relevant workspace.

## Language

**Agent Pane**:
An interactive workspace running an agent session that Watcher can surface and activate. Agent Panes can be discovered across all tmux sessions and are identified by the tmux pane id.
_Avoid_: Agent activity, agent shell, bot pane

**Agent Status**:
The current condition of an Agent Pane: working, needs input, idle, unknown, or stalled. Idle panes are hidden from the default switcher because they are not actionable.
_Avoid_: Activity, state, health

**Needs Input Agent**:
An Agent Pane that explicitly needs human input, permission, or a decision before continuing.
_Avoid_: Blocked agent, waiting agent, stuck agent

**Stalled Agent**:
An Agent Pane that appears to be working but has had no output or status change for a configured time window.
_Avoid_: Stuck agent

**Status Hook**:
An explicit integration installed into a supported agent so it can report Agent Status for the current tmux pane.
_Avoid_: Silent hook, auto hook

**Agent Pane Activation**:
The user action of jumping from Watcher to the selected Agent Pane.
_Avoid_: Switch, attach, focus

**Watcher Daemon**:
The background process that receives Status Hook events and serves the current Agent Pane snapshot to the TUI.
_Avoid_: Server, backend, monitor

**Agent Switcher**:
The OpenTUI-based interface that lists actionable Agent Panes and activates the selected pane.
_Avoid_: Dashboard, monitor, agent list
