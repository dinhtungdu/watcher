# Watcher

Watcher helps a user observe running agent sessions and jump to the relevant workspace.

## Language

**Agent Pane**:
An interactive workspace running an agent session that Watcher can surface and activate. Agent Panes are identified by a Terminal Backend and that backend's local surface identity.
_Avoid_: Agent activity, agent shell, bot pane

**Agent Status**:
The current condition of an Agent Pane: working, needs input, idle, unknown, or stalled. Agent Status is used for priority, visual attention, and detail context; it does not decide whether a running Agent Pane appears in the Agent Switcher.
_Avoid_: Activity, state, health

**Needs Input Agent**:
An Agent Pane that explicitly needs human input, permission, or a decision before continuing.
_Avoid_: Blocked agent, waiting agent, stuck agent

**Stalled Agent**:
An Agent Pane that appears to be working but has had no output or status change for a configured time window.
_Avoid_: Stuck agent

**Status Hook**:
An explicit integration installed into a supported agent so it can report Agent Status for the current Agent Pane.
_Avoid_: Silent hook, auto hook

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
A local terminal environment that can discover, identify, and activate Agent Panes. tmux and Ghostty are Terminal Backends.
_Avoid_: Provider, terminal type, transport

**Running Agent Pane**:
An Agent Pane whose Terminal Backend surface still exists and is running a known or hooked agent process. Running Agent Panes are shown regardless of Agent Status, including `idle`.
_Avoid_: Non-terminated agent pane, active-only session, actionable-only pane

**Agent Pane Activation**:
The user action of jumping from Watcher to the selected Agent Pane.
_Avoid_: Switch, attach, focus

**Watcher Daemon**:
The background process that receives Status Hook events and serves the current Agent Pane snapshot to the TUI.
_Avoid_: Server, backend, monitor

**Agent Switcher**:
The terminal interface that lists running Agent Panes and activates the selected pane.
_Avoid_: Dashboard, monitor, agent list
