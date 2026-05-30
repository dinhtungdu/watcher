import { test } from 'bun:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { SnapshotStore, startDaemon } from '../src/daemon.js';
import { loadSwitcherSnapshot } from '../src/snapshot.js';
import { CommandRunner } from '../src/tmux.js';
import { buildWatcherAgentEventInput, WatcherAgentEventType } from '../src/agentEvents.js';
import { AgentPane } from '../src/model.js';
import { tmuxTarget } from '../src/terminalTarget.js';

function piEvent(type: WatcherAgentEventType, payload: Record<string, unknown>, now: number, paneId = '%1') {
  return buildWatcherAgentEventInput('pi', type, { surface: { backend: 'tmux', id: paneId }, ...payload }, { now });
}

function lifecycleRunner(lines: string[]): CommandRunner {
  return {
    async execFile(file, args) {
      if (file === 'tmux' && args[0] === 'list-panes') {
        return { stdout: `${lines.join('\n')}\n`, stderr: '' };
      }
      if (file === 'tmux' && args[0] === 'capture-pane') {
        return { stdout: `recent output for ${args[3]}\n`, stderr: '' };
      }
      if (file === 'pgrep') {
        throw new Error('no children');
      }
      if (file === 'git') {
        const cwd = args[1];
        const command = args.slice(2).join(' ');
        if (command === 'rev-parse --show-toplevel') return { stdout: `${cwd}\n`, stderr: '' };
        if (command === 'branch --show-current') return { stdout: 'main\n', stderr: '' };
        if (command === 'rev-parse --path-format=absolute --git-common-dir') return { stdout: `${cwd}/.git\n`, stderr: '' };
      }
      throw new Error(`unexpected ${file} ${args.join(' ')}`);
    },
  };
}

function failingTmuxRunner(): CommandRunner {
  return {
    async execFile(file, args) {
      if (file === 'tmux') throw new Error('tmux unavailable');
      throw new Error(`unexpected ${file} ${args.join(' ')}`);
    },
  };
}

async function withDaemon<T>(store: SnapshotStore, runner: CommandRunner, fn: (socketPath: string) => Promise<T>): Promise<T> {
  const socketPath = path.join(os.tmpdir(), `watcher-lifecycle-${process.pid}-${Date.now()}-${Math.random()}.sock`);
  const server = await startDaemon({ socketPath, runner, store });
  try {
    return await fn(socketPath);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('running Agent Pane lifecycle lets event-sourced state win while the agent process is live', async () => {
  const runner = lifecycleRunner(['%1\twatcher\t0\t0\t/Users/tung/work/watcher\t101\tpi\tone']);
  const store = new SnapshotStore();
  await store.recordAgentEvent(piEvent('user-message', { text: 'Event source status wins' }, 1_700_000_000_000), runner);

  await withDaemon(store, runner, async (socketPath) => {
    const snapshot = await loadSwitcherSnapshot({ runner, socketPath, now: 1_700_000_001_000 });
    assert.equal(snapshot.panes.length, 1);
    assert.equal(snapshot.panes[0]!.id, 'tmux:%1');
    assert.equal(snapshot.panes[0]!.status, 'working');
    assert.equal(snapshot.panes[0]!.summary, 'Event source status wins');
    assert.equal(snapshot.panes[0]!.terminalPreview, 'recent output for %1');
  });
});

test('running Agent Pane lifecycle drops daemon panes whose terminal surface vanished', async () => {
  const runner = lifecycleRunner(['%1\twatcher\t0\t0\t/Users/tung/work/watcher\t101\tpi\tone']);
  const store = new SnapshotStore();
  await store.recordAgentEvent(piEvent('user-message', { text: 'Ghost pane' }, 1_700_000_000_000, '%99'), runner);

  await withDaemon(store, runner, async (socketPath) => {
    const snapshot = await loadSwitcherSnapshot({ runner, socketPath, now: 1_700_000_001_000 });
    assert.equal(snapshot.panes.some((pane) => pane.id === 'tmux:%99'), false);
  });
});

test('running Agent Pane lifecycle drops event-sourced panes when the agent process exits but the shell pane remains', async () => {
  const runner = lifecycleRunner(['%4\tshell\t1\t0\t/Users/tung\t104\tzsh\tfour']);
  const store = new SnapshotStore();
  await store.recordAgentEvent(piEvent('user-message', { text: 'This process has exited' }, 1_700_000_000_000, '%4'), runner);

  await withDaemon(store, runner, async (socketPath) => {
    const snapshot = await loadSwitcherSnapshot({ runner, socketPath, now: 1_700_000_001_000 });
    assert.equal(snapshot.panes.some((pane) => pane.id === 'tmux:%4'), false);
  });
});

test('running Agent Pane lifecycle keeps daemon panes when tmux liveness is unavailable', async () => {
  const liveRunner = lifecycleRunner(['%1\twatcher\t0\t0\t/Users/tung/work/watcher\t101\tpi\tone']);
  const store = new SnapshotStore();
  await store.recordAgentEvent(piEvent('user-message', { text: 'Keep without tmux liveness' }, 1_700_000_000_000), liveRunner);

  await withDaemon(store, failingTmuxRunner(), async (socketPath) => {
    const snapshot = await loadSwitcherSnapshot({ runner: failingTmuxRunner(), socketPath, now: 1_700_000_001_000 });
    assert.equal(snapshot.tmuxAvailable, false);
    assert.equal(snapshot.panes[0]?.summary, 'Keep without tmux liveness');
  });
});

test('running Agent Pane lifecycle normalizes legacy daemon panes before applying liveness', async () => {
  const runner = lifecycleRunner(['%1\twatcher\t0\t0\t/Users/tung/work/watcher\t101\tpi\tone']);
  const legacyPane = {
    id: '%1',
    agentType: 'pi',
    status: 'working',
    summary: 'Legacy daemon snapshot',
    tmux: tmuxTarget({ paneId: '%1', paneCurrentPath: '/Users/tung/work/watcher', paneCurrentCommand: 'pi', panePid: 101 }),
    updatedAt: 1_700_000_000_000,
  } as unknown as AgentPane;
  const legacyStore = {
    async recordAgentEvent() {
      throw new Error('not used');
    },
    snapshot() {
      return { panes: [legacyPane], daemonAvailable: true, tmuxAvailable: true };
    },
  } as unknown as SnapshotStore;

  await withDaemon(legacyStore, runner, async (socketPath) => {
    const snapshot = await loadSwitcherSnapshot({ runner, socketPath, now: 1_700_000_001_000 });
    assert.equal(snapshot.panes[0]?.id, 'tmux:%1');
    assert.equal(snapshot.panes[0]?.target.paneId, '%1');
    assert.equal(snapshot.panes[0]?.summary, 'Legacy daemon snapshot');
  });
});
