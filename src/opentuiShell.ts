import { loadSwitcherSnapshot } from './snapshot.js';
import { groupPanes, moveSelection, renderSwitcherFrame, selectablePanes, SwitcherRenderState } from './switcherLayout.js';
import { createStallTracker } from './stalled.js';
import { activateAgentPane } from './activation.js';
import { AgentPane } from './model.js';

function terminalSize(): { width: number; height: number } {
  return {
    width: process.stdout.columns || Number(process.env.COLUMNS) || 100,
    height: process.stdout.rows || Number(process.env.ROWS) || 30,
  };
}

export async function runOpenTuiSwitcher(): Promise<void> {
  // OpenTUI's current Node path faceplants on bun-ffi-structs/node:ffi. So the
  // production shell intentionally renders the accepted prototype-style ANSI
  // frame directly under Bun. Yes, the name is now historical. Naming things:
  // still cursed.
  let state: SwitcherRenderState = {
    useColor: Boolean(process.stdout.isTTY && !process.env.NO_COLOR),
    home: process.env.HOME,
  };
  const stallTracker = createStallTracker();
  let currentPanes = [] as ReturnType<typeof selectablePanes>;
  let pendingActivation: AgentPane | undefined;
  let closed = false;
  let redrawInFlight = false;

  async function redraw(): Promise<void> {
    if (closed || redrawInFlight) return;
    redrawInFlight = true;
    try {
      const snapshot = await loadSwitcherSnapshot({ stallTracker });
      currentPanes = selectablePanes(groupPanes(snapshot.panes, snapshot.now, state.home));
      const { width, height } = terminalSize();
      const frame = renderSwitcherFrame(snapshot, width, height, state).join('\n');
      process.stdout.write(`\x1b[2J\x1b[H${frame}`);
    } finally {
      redrawInFlight = false;
    }
  }

  function restoreTerminal(): void {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdout.write('\x1b[?25h\x1b[?1049l');
  }

  function shutdown(): void {
    if (closed) return;
    closed = true;
    clearInterval(interval);
    process.stdout.off('resize', resizeHandler);
    process.stdin.off('data', inputHandler);
    process.off('SIGINT', sigintHandler);
    restoreTerminal();
  }

  function sigintHandler(): void {
    shutdown();
  }

  function resizeHandler(): void {
    void redraw();
  }

  function inputHandler(buffer: Buffer): void {
    const input = buffer.toString('utf8');
    if (input === '\u0003' || input === 'q' || input === '\x1b') {
      shutdown();
      return;
    }
    if (input === '\x1b[A' || input === 'k') {
      state.selectedPaneId = moveSelection(currentPanes, state.selectedPaneId, -1);
      void redraw();
      return;
    }
    if (input === '\x1b[B' || input === 'j') {
      state.selectedPaneId = moveSelection(currentPanes, state.selectedPaneId, 1);
      void redraw();
      return;
    }
    if (input === '\r' || input === '\n') {
      pendingActivation = currentPanes.find((pane) => pane.id === state.selectedPaneId) ?? currentPanes[0];
      shutdown();
    }
  }

  process.stdout.write('\x1b[?1049h\x1b[?25l');
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', inputHandler);
  process.stdout.on('resize', resizeHandler);
  process.once('SIGINT', sigintHandler);
  const interval = setInterval(() => void redraw(), 2000);
  await redraw();

  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      if (closed) {
        clearInterval(check);
        resolve();
      }
    }, 25);
  });

  if (pendingActivation) await activateAgentPane(pendingActivation);
}
