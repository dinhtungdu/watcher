import { test } from 'bun:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { SnapshotStore, startDaemon } from '../src/daemon.js';
import { CommandRunner } from '../src/tmux.js';
import { renderSwitcherFrame } from '../src/switcherLayout.js';
import { sendDaemonRequest } from '../src/ipc.js';
import { buildWatcherAgentEventInput, WatcherAgentEventType } from '../src/agentEvents.js';

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

function piEvent(type: WatcherAgentEventType, payload: Record<string, unknown>, now: number, paneId = '%42') {
  return buildWatcherAgentEventInput('pi', type, { surface: { backend: 'tmux', id: paneId }, ...payload }, { now });
}

test('user-message records a working Pi Agent Pane with git/tmux context', async () => {
  const store = new SnapshotStore();
  await store.recordAgentEvent(piEvent('user-message', { text: 'Implement the daemon snapshot API' }, 1_700_000_000_000), fixtureRunner());
  const snapshot = store.snapshot(true, 1_700_000_010_000);
  assert.equal(snapshot.panes.length, 1);
  const pane = snapshot.panes[0]!;
  assert.equal(pane.id, 'tmux:%42');
  assert.equal(pane.status, 'working');
  assert.equal(pane.agentType, 'pi');
  assert.equal(pane.summary, 'Implement the daemon snapshot API');
  assert.equal(pane.userMessage, 'Implement the daemon snapshot API');
  assert.equal(pane.target.backend, 'tmux');
  assert.equal(pane.target.backend === 'tmux' && pane.target.sessionName, 'main');
  assert.equal(pane.cwd, '/Users/tung/work/watcher');
  assert.deepEqual(pane.git, { repo: 'watcher', branch: 'main', worktreePath: '/Users/tung/work/watcher' });
  assert.deepEqual(pane.observation, { source: 'event-source', semanticEvents: true, assistantDeltas: false, terminalPreview: false });

  const frame = renderSwitcherFrame(snapshot, 120, 20, { useColor: false, home: '/Users/tung' }).join('\n');
  assert.match(frame, /watcher/);
  assert.match(frame, /main ~\/work\/watcher/);
  assert.match(frame, /[●⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] pi\s+Implement the daemon snapshot API/);
  assert.match(frame, /[●⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] pi · working · updated 10s ago/);
  assert.match(frame, /main:1\.2 \(%42\)/);
});

test('non-git reported panes render under path fallback', async () => {
  const store = new SnapshotStore();
  await store.recordAgentEvent(piEvent('user-message', { text: 'Non git task' }, 1_700_000_000_000), fixtureRunner(false));
  const frame = renderSwitcherFrame(store.snapshot(true, 1_700_000_000_000), 100, 16, { useColor: false, home: '/Users/tung' }).join('\n');
  assert.match(frame, /Path fallback/);
  assert.match(frame, /~\/work\/watcher/);
  assert.match(frame, /Non git task/);
});

test('agent-finished changes pane to idle and keeps the running agent visible', async () => {
  const store = new SnapshotStore();
  await store.recordAgentEvent(piEvent('user-message', { text: 'Visible task' }, 1_700_000_000_000), fixtureRunner());
  await store.recordAgentEvent(piEvent('agent-finished', { finalMessage: 'Done' }, 1_700_000_010_000), fixtureRunner());
  const snapshot = store.snapshot(true, 1_700_000_010_000);
  const pane = snapshot.panes[0]!;
  assert.equal(pane.status, 'idle');
  assert.equal(pane.summary, 'Visible task');
  assert.equal(pane.userMessage, 'Visible task');
  assert.equal(pane.lastMessage, 'Done');
  assert.equal(pane.currentAction, undefined);
  const frame = renderSwitcherFrame(snapshot, 130, 18, { useColor: false }).join('\n');
  assert.match(frame, /▸ Visible task/);
  assert.match(frame, /▌ Done/);
  assert.match(frame, /idle/);
});

test('working pane can show latest assistant narration below the user task as activity', async () => {
  const store = new SnapshotStore();
  await store.recordAgentEvent(piEvent('user-message', { text: 'Refactor the detail pane' }, 1_700_000_000_000), fixtureRunner());
  await store.recordAgentEvent(piEvent('assistant-message', { text: 'I am inspecting the layout now.' }, 1_700_000_005_000), fixtureRunner());
  const frame = renderSwitcherFrame(store.snapshot(true, 1_700_000_005_000), 130, 20, { useColor: false }).join('\n');
  assert.match(frame, /▸ Refactor the detail pane/);
  assert.match(frame, /Activity/);
  assert.match(frame, /▌ assistant\s+I am inspecting the layout now\./);
});

test('assistant-only completion preserves existing user task identity', async () => {
  const store = new SnapshotStore();
  await store.recordAgentEvent(piEvent('user-message', { text: 'Keep this user prompt' }, 1_700_000_000_000), fixtureRunner());
  await store.recordAgentEvent(piEvent('agent-finished', { finalMessage: 'Assistant final answer should not replace it' }, 1_700_000_010_000), fixtureRunner());
  const pane = store.snapshot(true, 1_700_000_010_000).panes[0]!;
  assert.equal(pane.summary, 'Keep this user prompt');
  assert.equal(pane.userMessage, 'Keep this user prompt');
  assert.equal(pane.lastMessage, 'Assistant final answer should not replace it');
  const frame = renderSwitcherFrame({ panes: [pane], daemonAvailable: true, tmuxAvailable: true, now: 1_700_000_010_000 }, 130, 20, { useColor: false }).join('\n');
  assert.match(frame, /User message/);
  assert.match(frame, /▸ Keep this user prompt/);
  assert.match(frame, /Assistant/);
  assert.match(frame, /▌ Assistant final answer should not replace it/);
});

test('assistant message event updates working pane narration without replacing user task or final assistant', async () => {
  const store = new SnapshotStore();
  await store.recordAgentEvent(piEvent('user-message', { text: 'Watch working narration' }, 1_700_000_000_000), fixtureRunner());
  await store.recordAgentEvent(piEvent('assistant-message', { text: 'I finished the first reasoning turn.' }, 1_700_000_005_000), fixtureRunner());
  const pane = store.snapshot(true, 1_700_000_005_000).panes[0]!;
  assert.equal(pane.status, 'working');
  assert.equal(pane.summary, 'Watch working narration');
  assert.equal(pane.userMessage, 'Watch working narration');
  assert.equal(pane.lastMessage, undefined);
  assert.equal(pane.pendingAssistantMessage, 'I finished the first reasoning turn.');
  assert.equal(pane.activityItems?.[0]?.text, 'I finished the first reasoning turn.');
  const frame = renderSwitcherFrame({ panes: [pane], daemonAvailable: true, tmuxAvailable: true, now: 1_700_000_005_000 }, 130, 20, { useColor: false }).join('\n');
  assert.match(frame, /▸ Watch working narration/);
  assert.match(frame, /Activity/);
  assert.match(frame, /▌ assistant\s+I finished the first reasoning turn\./);
  assert.doesNotMatch(frame, /Assistant/);
});

test('assistant deltas update running activity without becoming final assistant text', async () => {
  const store = new SnapshotStore();
  await store.recordAgentEvent(piEvent('user-message', { text: 'Stream this' }, 1_700_000_000_000), fixtureRunner());
  await store.recordAgentEvent(piEvent('assistant-delta', { text: 'I am halfway there' }, 1_700_000_001_000), fixtureRunner());
  const pane = store.snapshot(true, 1_700_000_001_000).panes[0]!;
  assert.equal(pane.lastMessage, undefined);
  assert.equal(pane.currentAction, 'Responding');
  assert.equal(pane.observation?.assistantDeltas, true);
  assert.deepEqual(pane.activityItems?.map((item) => [item.kind, item.state, item.text]), [['assistant', 'running', 'I am halfway there']]);
});

test('working activity keeps latest three items newest-first and clears on completion', async () => {
  const store = new SnapshotStore();
  await store.recordAgentEvent(piEvent('user-message', { text: 'Show live activity' }, 1_700_000_000_000), fixtureRunner());
  await store.recordAgentEvent(piEvent('tool-started', { id: 'read-1', name: 'read', input: 'src/model.ts' }, 1_700_000_001_000), fixtureRunner());
  await store.recordAgentEvent(piEvent('tool-finished', { id: 'read-1', name: 'read', output: 'read complete' }, 1_700_000_002_000), fixtureRunner());
  await store.recordAgentEvent(piEvent('assistant-message', { text: 'I checked the model.' }, 1_700_000_003_000), fixtureRunner());
  await store.recordAgentEvent(piEvent('tool-started', { id: 'test-1', name: 'bash', input: 'bun test' }, 1_700_000_004_000), fixtureRunner());
  const working = store.snapshot(true, 1_700_000_004_000).panes[0]!;
  assert.deepEqual(working.activityItems?.map((item) => [item.kind, item.label, item.state, item.text]), [
    ['tool', 'bash', 'running', 'bun test'],
    ['assistant', 'assistant', 'done', 'I checked the model.'],
    ['tool', 'read', 'done', 'read complete'],
  ]);
  const frame = renderSwitcherFrame({ panes: [working], daemonAvailable: true, tmuxAvailable: true, now: 1_700_000_004_000 }, 130, 22, { useColor: false }).join('\n');
  assert.match(frame, /Activity/);
  assert.match(frame, /⚙ bash running\s+bun test/);
  assert.match(frame, /▌ assistant\s+I checked the model\./);

  await store.recordAgentEvent(piEvent('agent-finished', { finalMessage: 'Final result.' }, 1_700_000_005_000), fixtureRunner());
  const idle = store.snapshot(true, 1_700_000_005_000).panes[0]!;
  assert.equal(idle.activityItems, undefined);
  assert.equal(idle.currentAction, undefined);
  const idleFrame = renderSwitcherFrame({ panes: [idle], daemonAvailable: true, tmuxAvailable: true, now: 1_700_000_005_000 }, 130, 22, { useColor: false }).join('\n');
  assert.doesNotMatch(idleFrame, /Activity/);
  assert.match(idleFrame, /Assistant/);
  assert.match(idleFrame, /▌ Final result\./);
});

test('needs-input preserves recent activity and can mark a tool waiting', async () => {
  const store = new SnapshotStore();
  await store.recordAgentEvent(piEvent('user-message', { text: 'Need approval' }, 1_700_000_000_000), fixtureRunner());
  await store.recordAgentEvent(piEvent('tool-started', { id: 'shell-1', name: 'bash', input: 'rm -rf node_modules' }, 1_700_000_001_000), fixtureRunner());
  await store.recordAgentEvent(piEvent('needs-input', { id: 'shell-1', name: 'bash', reason: 'permission', text: 'Approve command?' }, 1_700_000_002_000), fixtureRunner());
  const pane = store.snapshot(true, 1_700_000_002_000).panes[0]!;
  assert.equal(pane.status, 'needs_input');
  assert.equal(pane.currentAction, 'Approve command?');
  assert.deepEqual(pane.activityItems?.map((item) => [item.label, item.state, item.text]), [['bash', 'waiting', 'Approve command?']]);
});

test('session-started placeholder is not rendered as a user message and resets stale turn state', async () => {
  const store = new SnapshotStore();
  await store.recordAgentEvent(piEvent('user-message', { text: 'Old task' }, 1_700_000_000_000), fixtureRunner());
  await store.recordAgentEvent(piEvent('session-started', {}, 1_700_000_001_000), fixtureRunner());
  const pane = store.snapshot(true, 1_700_000_001_000).panes[0]!;
  assert.equal(pane.summary, 'Waiting for first task');
  assert.equal(pane.userMessage, undefined);
  const frame = renderSwitcherFrame({ panes: [pane], daemonAvailable: true, tmuxAvailable: true, now: 1_700_000_001_000 }, 130, 20, { useColor: false }).join('\n');
  assert.match(frame, /Waiting for first task/);
  assert.doesNotMatch(frame, /User message/);
});

test('daemon exposes local snapshot API', async () => {
  const socketPath = path.join(os.tmpdir(), `watcher-test-${process.pid}-${Date.now()}.sock`);
  const store = new SnapshotStore();
  const server = await startDaemon({ socketPath, runner: fixtureRunner(), store });
  try {
    const eventResponse = await sendDaemonRequest({ type: 'event', event: piEvent('user-message', { text: 'Socket path works' }, 1_700_000_000_000) }, { socketPath });
    assert.deepEqual(eventResponse, { ok: true });
    const snapshotResponse = await sendDaemonRequest({ type: 'snapshot' }, { socketPath });
    assert.equal(snapshotResponse.ok, true);
    assert.equal(snapshotResponse.ok && snapshotResponse.snapshot?.panes[0]?.summary, 'Socket path works');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
