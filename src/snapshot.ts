import { SwitcherSnapshot } from './model.js';
import { loadRunningAgentPaneSnapshot, RunningAgentPaneSnapshotOptions } from './runningAgentPanes.js';

export type SnapshotOptions = RunningAgentPaneSnapshotOptions;

export async function loadSwitcherSnapshot(options: SnapshotOptions = {}): Promise<SwitcherSnapshot> {
  return loadRunningAgentPaneSnapshot(options);
}
