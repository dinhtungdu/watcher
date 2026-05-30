# Watcher

A tmux-native switcher for local coding agents.

Built because I live in the terminal, already use tmux, and do not want to leave it or reinvent it. Watcher just shows which agent panes need attention, previews enough context, then jumps straight back into tmux.

![Watcher terminal preview](docs/assets/watcher-terminal-preview.png)

```sh
watcher
watcher integrations install pi
```

Tmux binding example:

```tmux
bind -n M-s new-window -n watcher "watcher"
```

This keeps Watcher one keystroke away: `Alt-s` opens the switcher in a tmux window, `j/k` picks an agent, and `Enter` jumps to it.
