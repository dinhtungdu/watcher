import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentPane } from '../src/model.js';
import { CommandRunner } from '../src/tmux.js';
import { createStallTracker, deriveStalledStatuses } from '../src/stalled.js';
import { renderSwitcherFrame } from '../src/switcherLayout.js';

function pane(id: string, status: AgentPane['status'], updatedAt: number, summary = id): AgentPane {
  return {
    id,
    agentType: 'pi',
    status,
    summary,
    tmux: { paneId: id, sessionName: 's', windowIndex: '0', paneIndex: id.slice(1), paneCurrentPath: '/repo', paneTitle: 'title' },
    cwd: '/repo',
    git: { repo: 'repo', branch: 'main', worktreePath: '/repo' },
    updatedAt,
  };
}

function captureRunner(outputs: Record<string, string>): CommandRunner {
  return {
    async execFile(file, args) {
      if (file === 'tmux' && args[0] === 'capture-pane') {
        return { stdout: outputs[String(args[3])] ?? '', stderr: '' };
      }
      throw new Error(`unexpected ${file} ${args.join(' ')}`);
    },
  };
}

test('working pane becomes stalled after five minutes with no hook/title/output change', async () => {
  const tracker = createStallTracker();
  const runner = captureRunner({ '%1': 'same output' });
  const first = await deriveStalledStatuses([pane('%1', 'working', 1_000, 'Long build')], { now: 1_000, runner, tracker });
  assert.equal(first[0]!.status, 'working');
  const second = await deriveStalledStatuses([pane('%1', 'working', 1_000, 'Long build')], { now: 301_000, runner, tracker });
  assert.equal(second[0]!.status, 'stalled');
  assert.equal(second[0]!.reportedStatus, 'working');
});

test('new output clears stalled back to the reported working status', async () => {
  const tracker = createStallTracker();
  const outputs = { '%1': 'old output' };
  const runner = captureRunner(outputs);
  await deriveStalledStatuses([pane('%1', 'working', 1_000, 'Build')], { now: 1_000, runner, tracker });
  assert.equal((await deriveStalledStatuses([pane('%1', 'working', 1_000, 'Build')], { now: 301_000, runner, tracker }))[0]!.status, 'stalled');
  outputs['%1'] = 'new output';
  const cleared = await deriveStalledStatuses([pane('%1', 'working', 1_000, 'Build')], { now: 302_000, runner, tracker });
  assert.equal(cleared[0]!.status, 'working');
});

test('new hook event clears stalled back to working', async () => {
  const tracker = createStallTracker();
  const runner = captureRunner({ '%1': 'same output' });
  await deriveStalledStatuses([pane('%1', 'working', 1_000, 'Build')], { now: 1_000, runner, tracker });
  assert.equal((await deriveStalledStatuses([pane('%1', 'working', 1_000, 'Build')], { now: 301_000, runner, tracker }))[0]!.status, 'stalled');
  const cleared = await deriveStalledStatuses([pane('%1', 'working', 302_000, 'Build')], { now: 302_000, runner, tracker });
  assert.equal(cleared[0]!.status, 'working');
});

test('stalled panes remain grouped and sort between needs_input and working', () => {
  const now = 1_000;
  const panes = [
    pane('%3', 'working', now, 'working row'),
    pane('%2', 'stalled', now + 1, 'stalled row'),
    pane('%1', 'needs_input', now + 2, 'needs row'),
  ];
  const frame = renderSwitcherFrame({ panes, daemonAvailable: true, tmuxAvailable: true, now }, 100, 18, { useColor: false }).join('\n');
  const needs = frame.indexOf('needs row');
  const stalled = frame.indexOf('stalled row');
  const working = frame.indexOf('working row');
  assert.ok(needs !== -1 && stalled !== -1 && working !== -1);
  assert.ok(needs < stalled && stalled < working);
  assert.match(frame, /repo/);
});
