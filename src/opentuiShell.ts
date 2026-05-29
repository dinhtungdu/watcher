import { SwitcherRenderState } from './switcherLayout.js';
import { loadSwitcherSnapshot } from './snapshot.js';
import { groupPanes, moveSelection, renderSwitcherFrame, selectablePanes } from './switcherLayout.js';
import { createStallTracker } from './stalled.js';
import { activateAgentPane } from './activation.js';
import { AgentPane } from './model.js';

export async function runOpenTuiSwitcher(): Promise<void> {
  const { createCliRenderer, TextRenderable } = await import('@opentui/core');

  let state: SwitcherRenderState = { useColor: true, home: process.env.HOME };
  const stallTracker = createStallTracker();
  let currentPanes = [] as ReturnType<typeof selectablePanes>;
  let pendingActivation: AgentPane | undefined;
  let closed = false;
  const renderer = await createCliRenderer({ exitOnCtrlC: false, screenMode: 'alternate-screen', consoleMode: 'disabled' });
  const text = new TextRenderable(renderer, { content: '', width: '100%', height: '100%' });
  renderer.root.add(text);

  async function redraw(): Promise<void> {
    if (closed) return;
    const snapshot = await loadSwitcherSnapshot({ stallTracker });
    currentPanes = selectablePanes(groupPanes(snapshot.panes, snapshot.now, state.home));
    const frame = renderSwitcherFrame(snapshot, renderer.width, renderer.height, state).join('\n');
    text.content = frame;
    renderer.requestLive();
  }

  function shutdown(): void {
    if (closed) return;
    closed = true;
    clearInterval(interval);
    renderer.destroy();
  }

  renderer.addInputHandler((sequence) => {
    if (sequence === 'q' || sequence === '\u001b' || sequence === '\u0003') {
      shutdown();
      return true;
    }
    if (sequence === 'k' || sequence === '\u001b[A') {
      state.selectedPaneId = moveSelection(currentPanes, state.selectedPaneId, -1);
      void redraw();
      return true;
    }
    if (sequence === 'j' || sequence === '\u001b[B') {
      state.selectedPaneId = moveSelection(currentPanes, state.selectedPaneId, 1);
      void redraw();
      return true;
    }
    if (sequence === '\r' || sequence === '\n') {
      pendingActivation = currentPanes.find((pane) => pane.id === state.selectedPaneId) ?? currentPanes[0];
      shutdown();
      return true;
    }
    return false;
  });
  renderer.on('resize', () => void redraw());
  const interval = setInterval(() => void redraw(), 2000);
  await redraw();
  renderer.start();
  await new Promise<void>((resolve) => {
    renderer.on('destroy', () => resolve());
  });
  if (pendingActivation) {
    await activateAgentPane(pendingActivation);
  }
}
