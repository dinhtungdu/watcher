import { SwitcherSnapshot } from './model.js';
import { CommandRunner, hasTmuxServer, nodeCommandRunner } from './tmux.js';
import { sendDaemonRequest } from './ipc.js';
import { discoverUnintegratedPanes, mergeDaemonAndDiscovered } from './discovery.js';
import { captureTmuxPanePreview } from './tmuxContext.js';
import { deriveStalledStatuses, StallTracker } from './stalled.js';
import { normalizeAgentPaneTarget } from './terminalTarget.js';

export interface SnapshotOptions {
  runner?: CommandRunner;
  now?: number;
  stallTracker?: StallTracker;
  stalledMs?: number;
  socketPath?: string;
}

async function attachTerminalPreviews(panes: SwitcherSnapshot['panes'], runner: CommandRunner): Promise<SwitcherSnapshot['panes']> {
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

export async function loadSwitcherSnapshot(options: SnapshotOptions = {}): Promise<SwitcherSnapshot> {
  const runner = options.runner ?? nodeCommandRunner;
  const now = options.now ?? Date.now();
  let daemonSnapshot: SwitcherSnapshot | undefined;
  try {
    const response = await sendDaemonRequest({ type: 'snapshot' }, { timeoutMs: 300, socketPath: options.socketPath });
    if (response.ok && response.snapshot) {
      daemonSnapshot = {
        ...response.snapshot,
        panes: response.snapshot.panes.map((pane) => normalizeAgentPaneTarget(pane)).filter((pane) => pane !== undefined),
      };
    }
  } catch {
    // No daemon yet; render an honest empty state instead of faceplanting like a fragile dashboard goblin.
  }

  const discovery = await discoverUnintegratedPanes(runner, now);
  if (discovery.tmuxAvailable) {
    const panes = await attachTerminalPreviews(mergeDaemonAndDiscovered(daemonSnapshot?.panes ?? [], discovery.panes, discovery.paneIds, true, discovery.agentPaneIds), runner);
    return {
      panes: await deriveStalledStatuses(panes, { now, runner, tracker: options.stallTracker, stalledMs: options.stalledMs }),
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
