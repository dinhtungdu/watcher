import { test } from 'bun:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { SnapshotStore, startDaemon } from '../src/daemon.js';
import { CommandRunner } from '../src/tmux.js';
import { renderSwitcherFrame } from '../src/switcherLayout.js';
import { sendDaemonRequest } from '../src/ipc.js';

function fixtureRunner(git = true): CommandRunner {
  return {
    async execFile(file, args) {
      if (file === 'tmux' && args[0] === 'list-panes') {
        return { stdout: '%42\tmain\t1\t2\t/Users/tung/work/watcher\t1234\tpi\tagents\n', stderr: '' };
      }
      if (file === 'git' && git) {
        const command = args.slice(2).join(' ');
        if (command === 'rev-parse --show-toplevel') return { stdout: '/Users/tung/work/watcher\n', stderr: '' };
        if (command === 'branch --show-current') return { stdout: 'main\n', stderr: '' };
        if (command === 'rev-parse --path-format=absolute --git-common-dir') return { stdout: '/Users/tung/work/watcher/.git\n', stderr: '' };
      }
      throw new Error(`unexpected command ${file} ${args.join(' ')}`);
    },
  };
}

test('prompt-submit records a working Pi Agent Pane with git/tmux context', async () => {
  const store = new SnapshotStore();
  await store.recordHookEvent({ agent: 'pi', event: 'prompt-submit', paneId: '%42', payload: { prompt: 'Implement the daemon snapshot API' }, now: 1_700_000_000_000 }, fixtureRunner());
  const snapshot = store.snapshot(true, 1_700_000_010_000);
  assert.equal(snapshot.panes.length, 1);
  const pane = snapshot.panes[0]!;
  assert.equal(pane.status, 'working');
  assert.equal(pane.agentType, 'pi');
  assert.equal(pane.summary, 'Implement the daemon snapshot API');
  assert.equal(pane.target.backend, 'tmux');
  assert.equal(pane.target.backend === 'tmux' && pane.target.sessionName, 'main');
  assert.equal(pane.cwd, '/Users/tung/work/watcher');
  assert.deepEqual(pane.git, { repo: 'watcher', branch: 'main', worktreePath: '/Users/tung/work/watcher' });

  const frame = renderSwitcherFrame(snapshot, 120, 20, { useColor: false, home: '/Users/tung' }).join('\n');
  assert.match(frame, /watcher/);
  assert.match(frame, /main ~\/work\/watcher/);
  assert.match(frame, /● pi\s+Implement the daemon snapshot API/);
  assert.match(frame, /● pi · working · 10s/);
  assert.match(frame, /main:1\.2 \(%42\)/);
});

test('non-git reported panes render under path fallback', async () => {
  const store = new SnapshotStore();
  await store.recordHookEvent({ agent: 'pi', event: 'prompt-submit', paneId: '%42', payload: { prompt: 'Non git task' }, now: 1_700_000_000_000 }, fixtureRunner(false));
  const frame = renderSwitcherFrame(store.snapshot(true, 1_700_000_000_000), 100, 16, { useColor: false, home: '/Users/tung' }).join('\n');
  assert.match(frame, /Path fallback/);
  assert.match(frame, /~\/work\/watcher/);
  assert.match(frame, /Non git task/);
});

test('stop event changes pane to idle and keeps the running agent visible', async () => {
  const store = new SnapshotStore();
  await store.recordHookEvent({ agent: 'pi', event: 'prompt-submit', paneId: '%42', payload: { prompt: 'Visible task' }, now: 1_700_000_000_000 }, fixtureRunner());
  await store.recordHookEvent({ agent: 'pi', event: 'stop', paneId: '%42', payload: { lastAssistantMessage: 'Done' }, now: 1_700_000_010_000 }, fixtureRunner());
  const snapshot = store.snapshot(true, 1_700_000_010_000);
  assert.equal(snapshot.panes[0]!.status, 'idle');
  const frame = renderSwitcherFrame(snapshot, 90, 14, { useColor: false }).join('\n');
  assert.match(frame, /Done/);
  assert.match(frame, /idle/);
});

test('daemon exposes local snapshot API', async () => {
  const socketPath = path.join(os.tmpdir(), `watcher-test-${process.pid}-${Date.now()}.sock`);
  const store = new SnapshotStore();
  const server = await startDaemon({ socketPath, runner: fixtureRunner(), store });
  try {
    const hookResponse = await sendDaemonRequest({ type: 'hook', event: { agent: 'pi', event: 'prompt-submit', paneId: '%42', payload: { prompt: 'Socket path works' }, now: 1_700_000_000_000 } }, { socketPath });
    assert.deepEqual(hookResponse, { ok: true });
    const snapshotResponse = await sendDaemonRequest({ type: 'snapshot' }, { socketPath });
    assert.equal(snapshotResponse.ok, true);
    assert.equal(snapshotResponse.ok && snapshotResponse.snapshot?.panes[0]?.summary, 'Socket path works');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
