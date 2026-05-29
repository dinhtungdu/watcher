import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { activateAgentPane, activationTargetLabel, buildActivationCommands } from '../src/activation.js';
import { AgentPane } from '../src/model.js';
import { CommandRunner } from '../src/tmux.js';
import { renderSwitcherFrame } from '../src/switcherLayout.js';

function pane(overrides: Partial<AgentPane> = {}): AgentPane {
  return {
    id: '%42',
    agentType: 'pi',
    status: 'needs_input',
    summary: 'Pick an architecture',
    tmux: { paneId: '%42', sessionName: 'agents', windowIndex: '3', paneIndex: '2', paneCurrentPath: '/repo' },
    cwd: '/repo',
    git: { repo: 'repo', branch: 'main', worktreePath: '/repo' },
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

test('inside tmux activation switches client, selects window, then pane', () => {
  assert.deepEqual(buildActivationCommands(pane(), true).map((command) => command.args), [
    ['switch-client', '-t', 'agents'],
    ['select-window', '-t', 'agents:3'],
    ['select-pane', '-t', '%42'],
  ]);
});

test('outside tmux activation selects target before attaching to session', () => {
  assert.deepEqual(buildActivationCommands(pane(), false).map((command) => command.args), [
    ['select-window', '-t', 'agents:3'],
    ['select-pane', '-t', '%42'],
    ['attach-session', '-t', 'agents'],
  ]);
});

test('activation executor detects inside/outside tmux and runs commands in order', async () => {
  const calls: string[][] = [];
  const runner: CommandRunner = {
    async execFile(file, args) {
      calls.push([file, ...args]);
      return { stdout: '', stderr: '' };
    },
  };
  await activateAgentPane(pane(), { runner, env: { TMUX: '/tmp/tmux' } });
  assert.deepEqual(calls, [
    ['tmux', 'switch-client', '-t', 'agents'],
    ['tmux', 'select-window', '-t', 'agents:3'],
    ['tmux', 'select-pane', '-t', '%42'],
  ]);

  calls.length = 0;
  await activateAgentPane(pane(), { runner, env: {} });
  assert.deepEqual(calls, [
    ['tmux', 'select-window', '-t', 'agents:3'],
    ['tmux', 'select-pane', '-t', '%42'],
    ['tmux', 'attach-session', '-t', 'agents'],
  ]);
});

test('activation works for grouped repo and path fallback rows', () => {
  const gitPane = pane({ id: '%10', tmux: { ...pane().tmux, paneId: '%10', sessionName: 'repo', windowIndex: '1', paneIndex: '0' } });
  const fallbackPane = pane({ id: '%11', tmux: { ...pane().tmux, paneId: '%11', sessionName: 'tmp', windowIndex: '2', paneIndex: '1' }, git: undefined, cwd: '/tmp/spike' });
  assert.deepEqual(buildActivationCommands(gitPane, true).at(-1)?.args, ['select-pane', '-t', '%10']);
  assert.deepEqual(buildActivationCommands(fallbackPane, true).at(-1)?.args, ['select-pane', '-t', '%11']);
});

test('selected-pane detail shows the tmux target activation will use', () => {
  const targetPane = pane();
  const frame = renderSwitcherFrame({ panes: [targetPane], daemonAvailable: true, tmuxAvailable: true, now: 1_700_000_000_000 }, 120, 20, { useColor: false, selectedPaneId: '%42' }).join('\n');
  assert.equal(activationTargetLabel(targetPane), 'agents:3.2 (%42)');
  assert.match(frame, /agents:3\.2 \(%42\)/);
});

test('missing tmux target fails loudly before running half-baked activation soup', () => {
  assert.throws(() => buildActivationCommands(pane({ tmux: { paneId: '%42' } }), true), /missing tmux session\/window\/pane target/);
});
