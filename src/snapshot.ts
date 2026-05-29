import { SwitcherSnapshot } from './model.js';
import { CommandRunner, hasTmuxServer, nodeCommandRunner } from './tmux.js';
import { sendDaemonRequest } from './ipc.js';

export interface SnapshotOptions {
  runner?: CommandRunner;
  now?: number;
}

export async function loadSwitcherSnapshot(options: SnapshotOptions = {}): Promise<SwitcherSnapshot> {
  try {
    const response = await sendDaemonRequest({ type: 'snapshot' }, { timeoutMs: 300 });
    if (response.ok && response.snapshot) {
      return { ...response.snapshot, now: options.now ?? response.snapshot.now ?? Date.now() };
    }
  } catch {
    // No daemon yet; render an honest empty state instead of faceplanting like a fragile dashboard goblin.
  }
  const tmuxAvailable = await hasTmuxServer(options.runner ?? nodeCommandRunner);
  return {
    panes: [],
    daemonAvailable: false,
    tmuxAvailable,
    now: options.now ?? Date.now(),
  };
}
