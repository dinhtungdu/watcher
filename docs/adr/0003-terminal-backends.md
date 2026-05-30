# Terminal Backend abstraction

Watcher generalizes Agent Pane identity and activation behind Terminal Backends instead of treating tmux panes as the universal model. tmux remains the first full backend, while Ghostty on macOS can use its AppleScript scripting dictionary for terminal-surface activation; Ghostty process discovery remains hook-first until stable Ghostty exposes enough target metadata such as foreground PID/TTY outside AppleScript.

## Considered Options

- Keep tmux fields in the core model: rejected because Ghostty windows, tabs, and terminal surfaces do not fit tmux session/window/pane identity without lying in field names.
- Use Ghostty's `ghostty` binary as a control CLI: rejected because current CLI IPC is not a targetable focus/select API for existing terminal surfaces on macOS.
- Use macOS AppleScript for Ghostty activation: accepted because Ghostty's supported scripting dictionary exposes stable window/tab/terminal ids and `focus`, `select tab`, and `activate window` commands.

## Consequences

Core switcher code should depend on Terminal Target helpers instead of tmux-specific fields. Backend-specific discovery, capture, and activation live at the edges. Ghostty support is macOS-first unless a non-AppleScript control API becomes available.
