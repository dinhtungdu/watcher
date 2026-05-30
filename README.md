# Watcher

A tmux-native switcher for local coding agents. See which agent panes need attention, preview context, then jump straight back into tmux.

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
