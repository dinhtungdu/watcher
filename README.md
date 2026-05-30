# Watcher

Watcher is a tmux-wide Agent Switcher for local coding agents. It lists running agent panes across tmux sessions, groups them by `repo > worktree/branch > sessions`, shows semantic agent status when integrations are installed, and activates the selected pane.

It exists because I live in the terminal. I already know how to use tmux, and I do not want a second dashboard trying to reinvent window management with worse keybindings and another place to babysit. Watcher is the missing switchboard: keep agents running where they already are, see which ones need attention, preview enough context to pick the right one, then jump straight back into tmux.

![Watcher terminal preview](docs/assets/watcher-terminal-preview.png)

## Highlights

- Lists running agent panes across local tmux.
- Groups panes by repository and worktree/branch.
- Shows all running panes, including idle agents.
- Prioritizes panes by status: `needs_input`, `stalled`, `working`, `unknown`, `idle`.
- Shows selected-pane details, recent assistant context, tmux target, and terminal preview.
- Activates the selected pane with Enter.

## Usage

```sh
watcher
```

Useful commands:

```sh
watcher daemon
watcher integrations status
watcher integrations install pi
```

Existing Pi panes need `/reload` or a restart after installing the Pi integration.

## Development

```sh
bun install
bun run test
bun run build
```
