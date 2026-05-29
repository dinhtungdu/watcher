import { SwitcherSnapshot } from './model.js';
import { CommandRunner, hasTmuxServer, nodeCommandRunner } from './tmux.js';

export interface SnapshotOptions {
  runner?: CommandRunner;
  now?: number;
}

export async function loadSwitcherSnapshot(options: SnapshotOptions = {}): Promise<SwitcherSnapshot> {
  const tmuxAvailable = await hasTmuxServer(options.runner ?? nodeCommandRunner);
  return {
    panes: [],
    daemonAvailable: false,
    tmuxAvailable,
    now: options.now ?? Date.now(),
  };
}
