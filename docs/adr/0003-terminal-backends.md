# Terminal Backend abstraction

Watcher keeps a Terminal Target seam so core Agent Switcher logic does not depend directly on tmux field names. tmux remains the only supported backend. Native Ghostty support was investigated and postponed because current stable Ghostty does not provide both reliable cross-platform surface identity and cross-platform activation control.

## Considered Options

- Keep tmux fields in the core Agent Pane model: rejected because it spreads tmux vocabulary through grouping, rendering, stalled detection, and activation code.
- Add Ghostty as a runtime backend now: rejected because support would be partial or platform-specific.
- Use macOS AppleScript for Ghostty activation: rejected because Watcher should support every platform Ghostty supports, and macOS-only automation would turn Terminal Backend into a platform-specific footgun.

## Consequences

Core switcher code should depend on Terminal Target helpers instead of tmux-specific fields. Runtime support remains tmux-only until another terminal backend can provide identity, discovery, stalled-signal inputs, and activation without platform-specific hacks.
