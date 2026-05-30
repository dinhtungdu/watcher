import { AgentPane, SwitcherSnapshot } from './model.js';
import { CommandRunner, hasTmuxServer, nodeCommandRunner } from './tmux.js';
import { sendDaemonRequest } from './ipc.js';
import { observeTerminalAgentPanes, TerminalAgentObservation } from './discovery.js';
import { captureTmuxPanePreview } from './tmuxContext.js';
import { deriveStalledStatuses, StallTracker } from './stalled.js';
import { normalizeAgentPaneTarget } from './terminalTarget.js';

export interface RunningAgentPaneSnapshotOptions {
  runner?: CommandRunner;
  now?: number;
  stallTracker?: StallTracker;
  stalledMs?: number;
  socketPath?: string;
}

async function readDaemonSnapshot(socketPath: string | undefined): Promise<SwitcherSnapshot | undefined> {
  try {
    const response = await sendDaemonRequest({ type: 'snapshot' }, { timeoutMs: 300, socketPath });
    if (!response.ok || !response.snapshot) return undefined;
    return {
      ...response.snapshot,
      panes: response.snapshot.panes
        .map((pane) => normalizeAgentPaneTarget(pane))
        .filter((pane): pane is AgentPane => pane !== undefined),
    };
  } catch {
    // No daemon yet; render an honest empty state instead of faceplanting like a fragile dashboard goblin.
    return undefined;
  }
}

function daemonPaneIsRunning(pane: AgentPane, observation: TerminalAgentObservation): boolean {
  if (!observation.tmuxAvailable) return true;
  if (!observation.livePaneIds.has(pane.id)) return false;
  return observation.liveAgentProcessPaneIds.has(pane.id);
}

function reconcileRunningAgentPanes(daemonPanes: AgentPane[], observation: TerminalAgentObservation): AgentPane[] {
  const result = new Map<string, AgentPane>();
  for (const pane of daemonPanes) {
    const normalized = normalizeAgentPaneTarget(pane);
    if (!normalized) continue;
    if (!daemonPaneIsRunning(normalized, observation)) continue;
    result.set(normalized.id, normalized);
  }
  for (const pane of observation.discoveredPanes) {
    const normalized = normalizeAgentPaneTarget(pane);
    if (normalized && !result.has(normalized.id)) result.set(normalized.id, normalized);
  }
  return [...result.values()];
}

async function attachTerminalPreviews(panes: AgentPane[], runner: CommandRunner): Promise<AgentPane[]> {
  return Promise.all(panes.map(async (pane) => {
    if (pane.terminalPreview || pane.target.backend !== 'tmux') return pane;
    const terminalPreview = await captureTmuxPanePreview(pane.target.paneId, runner);
    if (!terminalPreview) return pane;
    return {
      ...pane,
      terminalPreview,
      observation: {
        source: pane.observation?.source ?? 'mixed',
        semanticEvents: pane.observation?.semanticEvents ?? true,
        assistantDeltas: pane.observation?.assistantDeltas ?? false,
        terminalPreview: true,
      },
    };
  }));
}

export async function loadRunningAgentPaneSnapshot(options: RunningAgentPaneSnapshotOptions = {}): Promise<SwitcherSnapshot> {
  const runner = options.runner ?? nodeCommandRunner;
  const now = options.now ?? Date.now();
  const daemonSnapshot = await readDaemonSnapshot(options.socketPath);
  const observation = await observeTerminalAgentPanes(runner, now);

  if (observation.tmuxAvailable) {
    const runningPanes = reconcileRunningAgentPanes(daemonSnapshot?.panes ?? [], observation);
    const panesWithPreviews = await attachTerminalPreviews(runningPanes, runner);
    return {
      panes: await deriveStalledStatuses(panesWithPreviews, { now, runner, tracker: options.stallTracker, stalledMs: options.stalledMs }),
      daemonAvailable: daemonSnapshot?.daemonAvailable ?? false,
      tmuxAvailable: true,
      now,
    };
  }

  const tmuxAvailable = daemonSnapshot?.tmuxAvailable ?? await hasTmuxServer(runner);
  return {
    panes: daemonSnapshot?.panes ?? [],
    daemonAvailable: daemonSnapshot?.daemonAvailable ?? false,
    tmuxAvailable,
    now,
  };
}
