import { SwitcherSnapshot } from './model.js';
import { CommandRunner, hasTmuxServer, nodeCommandRunner } from './tmux.js';
import { sendDaemonRequest } from './ipc.js';
import { discoverUnhookedPanes, mergeDaemonAndDiscovered } from './discovery.js';

export interface SnapshotOptions {
  runner?: CommandRunner;
  now?: number;
}

export async function loadSwitcherSnapshot(options: SnapshotOptions = {}): Promise<SwitcherSnapshot> {
  const runner = options.runner ?? nodeCommandRunner;
  const now = options.now ?? Date.now();
  let daemonSnapshot: SwitcherSnapshot | undefined;
  try {
    const response = await sendDaemonRequest({ type: 'snapshot' }, { timeoutMs: 300 });
    if (response.ok && response.snapshot) daemonSnapshot = response.snapshot;
  } catch {
    // No daemon yet; render an honest empty state instead of faceplanting like a fragile dashboard goblin.
  }

  const discovery = await discoverUnhookedPanes(runner, now);
  if (discovery.tmuxAvailable) {
    return {
      panes: mergeDaemonAndDiscovered(daemonSnapshot?.panes ?? [], discovery.panes, discovery.paneIds),
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
