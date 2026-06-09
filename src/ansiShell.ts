import { loadSwitcherSnapshot } from './snapshot.js';
import { filterPanesByMode, groupPanes, initialSelectionAfterLastActivated, moveSelection, renderSwitcherFrame, selectablePanes, SwitcherRenderState } from './switcherLayout.js';
import { createStallTracker } from './stalled.js';
import { activateAgentPane } from './activation.js';
import { AgentPane, SwitcherSnapshot } from './model.js';
import { loadChromeHiddenPreference, loadLastActivatedPanePreference, saveChromeHiddenPreference, saveLastActivatedPanePreference } from './tmuxPreferences.js';

const SNAPSHOT_REFRESH_MS = 2000;
const FRAME_REPAINT_MS = 250;

function terminalSize(): { width: number; height: number } {
  return {
    width: process.stdout.columns || Number(process.env.COLUMNS) || 100,
    height: process.stdout.rows || Number(process.env.ROWS) || 30,
  };
}

export async function runAnsiSwitcher(): Promise<void> {
  // Render the accepted prototype-style ANSI frame directly under Bun.
  const [chromeHidden, lastActivatedPaneId] = await Promise.all([
    loadChromeHiddenPreference(),
    loadLastActivatedPanePreference(),
  ]);
  let initialSelectionApplied = false;
  let state: SwitcherRenderState = {
    useColor: Boolean(process.stdout.isTTY && !process.env.NO_COLOR),
    home: process.env.HOME,
    chromeHidden,
    paneFilter: 'agents',
  };
  const stallTracker = createStallTracker();
  let currentSnapshot: SwitcherSnapshot | undefined;
  let currentPanes = [] as ReturnType<typeof selectablePanes>;
  let pendingActivation: AgentPane | undefined;
  let closed = false;
  let resolveClosed: (() => void) | undefined;
  const closedPromise = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  let refreshInFlight = false;
  const pendingPreferenceSaves: Promise<void>[] = [];
  let refreshInterval: ReturnType<typeof setInterval> | undefined;
  let repaintInterval: ReturnType<typeof setInterval> | undefined;

  function queuePreferenceSave(save: Promise<void>): void {
    pendingPreferenceSaves.push(save);
    void save;
  }

  function renderCachedFrame(): void {
    if (closed || !currentSnapshot) return;
    state.frameIndex = (state.frameIndex ?? 0) + 1;
    currentPanes = selectablePanes(groupPanes(filterPanesByMode(currentSnapshot.panes, state.paneFilter), currentSnapshot.now, state.home));
    if (currentPanes.length > 0 && !currentPanes.some((pane) => pane.id === state.selectedPaneId)) {
      state.selectedPaneId = initialSelectionApplied ? currentPanes[0]?.id : initialSelectionAfterLastActivated(currentPanes, lastActivatedPaneId);
      initialSelectionApplied = true;
    }
    const { width, height } = terminalSize();
    const frame = renderSwitcherFrame(currentSnapshot, width, height, state).join('\n');
    process.stdout.write(`\x1b[2J\x1b[H${frame}`);
  }

  async function refreshSnapshot(): Promise<void> {
    if (closed || refreshInFlight) return;
    refreshInFlight = true;
    try {
      currentSnapshot = await loadSwitcherSnapshot({ stallTracker });
      renderCachedFrame();
    } finally {
      refreshInFlight = false;
    }
  }

  function restoreTerminal(): void {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdout.write('\x1b[?25h\x1b[?1049l');
  }

  function shutdown(): void {
    if (closed) return;
    closed = true;
    if (refreshInterval) clearInterval(refreshInterval);
    if (repaintInterval) clearInterval(repaintInterval);
    process.stdout.off('resize', resizeHandler);
    process.stdin.off('data', inputHandler);
    process.stdin.pause();
    process.off('SIGINT', sigintHandler);
    restoreTerminal();
    resolveClosed?.();
  }

  function sigintHandler(): void {
    shutdown();
  }

  function resizeHandler(): void {
    renderCachedFrame();
  }

  function toggleChrome(): void {
    state.chromeHidden = !state.chromeHidden;
    queuePreferenceSave(saveChromeHiddenPreference(Boolean(state.chromeHidden)));
    renderCachedFrame();
  }

  function togglePaneFilter(): void {
    state.paneFilter = state.paneFilter === 'all' ? 'agents' : 'all';
    renderCachedFrame();
  }

  function inputHandler(buffer: Buffer): void {
    const input = buffer.toString('utf8');
    if (input === '\u0003' || input === 'q' || input === '\x1b') {
      shutdown();
      return;
    }
    if (input === '\x1b[A' || input === 'k') {
      state.selectedPaneId = moveSelection(currentPanes, state.selectedPaneId, -1);
      renderCachedFrame();
      return;
    }
    if (input === '\x1b[B' || input === 'j') {
      state.selectedPaneId = moveSelection(currentPanes, state.selectedPaneId, 1);
      renderCachedFrame();
      return;
    }
    if (input === '?') {
      toggleChrome();
      return;
    }
    if (input === 'a') {
      togglePaneFilter();
      return;
    }
    if (input === '\r' || input === '\n') {
      pendingActivation = currentPanes.find((pane) => pane.id === state.selectedPaneId) ?? currentPanes[0];
      if (pendingActivation) queuePreferenceSave(saveLastActivatedPanePreference(pendingActivation.id));
      shutdown();
    }
  }

  process.stdout.write('\x1b[?1049h\x1b[?25l');
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', inputHandler);
  process.stdout.on('resize', resizeHandler);
  process.once('SIGINT', sigintHandler);
  refreshInterval = setInterval(() => void refreshSnapshot(), SNAPSHOT_REFRESH_MS);
  repaintInterval = setInterval(() => renderCachedFrame(), FRAME_REPAINT_MS);
  await refreshSnapshot();

  await closedPromise;
  await Promise.all(pendingPreferenceSaves);

  if (pendingActivation) await activateAgentPane(pendingActivation);
}
