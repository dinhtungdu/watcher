import crypto from 'node:crypto';
import { AgentPane } from './model.js';
import { terminalTargetTitle } from './terminalTarget.js';
import { CommandRunner, nodeCommandRunner } from './tmux.js';

export const DEFAULT_STALLED_MS = 5 * 60 * 1000;

export interface StallEntry {
  lastActivityAt: number;
  eventUpdatedAt: number;
  outputHash?: string;
  title?: string;
}

export interface StallTracker {
  entries: Map<string, StallEntry>;
}

export function createStallTracker(): StallTracker {
  return { entries: new Map() };
}

export async function capturePaneTailHash(paneId: string, runner: CommandRunner = nodeCommandRunner): Promise<string | undefined> {
  try {
    const result = await runner.execFile('tmux', ['capture-pane', '-p', '-t', paneId, '-S', '-200'], { timeout: 1000 });
    return crypto.createHash('sha1').update(result.stdout).digest('hex');
  } catch {
    return undefined;
  }
}

export interface StalledOptions {
  now?: number;
  stalledMs?: number;
  runner?: CommandRunner;
  tracker?: StallTracker;
}

function observedTitle(pane: AgentPane): string | undefined {
  return terminalTargetTitle(pane.target);
}

export async function deriveStalledStatuses(panes: AgentPane[], options: StalledOptions = {}): Promise<AgentPane[]> {
  const now = options.now ?? Date.now();
  const stalledMs = options.stalledMs ?? DEFAULT_STALLED_MS;
  const runner = options.runner ?? nodeCommandRunner;
  const tracker = options.tracker ?? createStallTracker();
  const liveIds = new Set(panes.map((pane) => pane.id));
  for (const id of tracker.entries.keys()) {
    if (!liveIds.has(id)) tracker.entries.delete(id);
  }

  const result: AgentPane[] = [];
  for (const pane of panes) {
    if (pane.status !== 'working') {
      if (pane.status === 'idle') tracker.entries.delete(pane.id);
      else tracker.entries.set(pane.id, {
        lastActivityAt: pane.updatedAt,
        eventUpdatedAt: pane.updatedAt,
        outputHash: pane.outputHash,
        title: observedTitle(pane),
      });
      result.push(pane);
      continue;
    }

    const outputHash = await capturePaneTailHash(pane.target.paneId, runner);
    const title = observedTitle(pane);
    const previous = tracker.entries.get(pane.id);
    let entry: StallEntry = previous ?? {
      lastActivityAt: pane.updatedAt,
      eventUpdatedAt: pane.updatedAt,
      outputHash,
      title,
    };

    const eventChanged = pane.updatedAt > entry.eventUpdatedAt;
    const outputChanged = outputHash !== undefined && entry.outputHash !== undefined && outputHash !== entry.outputHash;
    const titleChanged = title !== undefined && entry.title !== undefined && title !== entry.title;
    if (eventChanged) {
      entry = { lastActivityAt: pane.updatedAt, eventUpdatedAt: pane.updatedAt, outputHash, title };
    } else if (outputChanged || titleChanged) {
      entry = { ...entry, lastActivityAt: now, outputHash, title };
    } else {
      entry = { ...entry, outputHash: outputHash ?? entry.outputHash, title: title ?? entry.title };
    }
    tracker.entries.set(pane.id, entry);

    const stalled = now - entry.lastActivityAt >= stalledMs;
    result.push(stalled ? { ...pane, status: 'stalled', reportedStatus: 'working', outputHash: outputHash ?? pane.outputHash } : { ...pane, outputHash: outputHash ?? pane.outputHash });
  }
  return result;
}
