import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { renderSwitcherFrame } from '../src/switcherLayout.js';
import { loadSwitcherSnapshot } from '../src/snapshot.js';
import { CommandRunner } from '../src/tmux.js';

const failingTmux: CommandRunner = {
  async execFile() {
    throw new Error('no tmux');
  },
};

const runningTmux: CommandRunner = {
  async execFile() {
    return { stdout: '', stderr: '' };
  },
};

test('empty switcher explains no tmux state', async () => {
  const snapshot = await loadSwitcherSnapshot({ runner: failingTmux, now: 1_700_000_000_000 });
  const frame = renderSwitcherFrame(snapshot, 80, 18, { useColor: false });
  const text = frame.join('\n');
  assert.match(text, /Watcher/);
  assert.match(text, /Nothing to activate/);
  assert.match(text, /tmux is not available/);
  assert.match(text, /q \/ Esc \/ Ctrl-C quits/);
});

test('empty switcher explains daemon snapshot absence when tmux exists', async () => {
  const snapshot = await loadSwitcherSnapshot({ runner: runningTmux, now: 1_700_000_000_000 });
  const frame = renderSwitcherFrame(snapshot, 90, 18, { useColor: false });
  const text = frame.join('\n');
  assert.match(text, /No Watcher Daemon snapshot is available yet/);
  assert.match(text, /Run watcher daemon or install hooks/);
});

test('empty switcher renders at least terminal-sized frame', () => {
  const frame = renderSwitcherFrame({ panes: [], daemonAvailable: true, tmuxAvailable: true, now: 1_700_000_000_000 }, 70, 5, { useColor: false });
  assert.equal(frame.length, 10);
  assert.ok(frame.every((line) => line.length >= 70));
  assert.match(frame.join('\n'), /No actionable Agent Panes found/);
});
