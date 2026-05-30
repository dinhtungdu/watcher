import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { AgentPane } from '../src/model.js';
import { groupPanes, moveSelection, renderSwitcherFrame, selectablePanes } from '../src/switcherLayout.js';
import { tmuxTarget } from '../src/terminalTarget.js';
import { stripAnsi, visibleLength } from '../src/text.js';

const now = 1_700_000_000_000;

function pane(overrides: Partial<AgentPane> & Pick<AgentPane, 'id' | 'status' | 'summary'>): AgentPane {
  return {
    agentType: 'pi',
    target: tmuxTarget({ paneId: overrides.id, sessionName: 's', windowIndex: '1', paneIndex: '1', paneCurrentPath: '/repo' }),
    cwd: '/repo',
    updatedAt: now,
    ...overrides,
  };
}

const panes: AgentPane[] = [
  pane({ id: '%1', status: 'working', summary: 'Working in main', git: { repo: 'watcher', branch: 'main', worktreePath: '/Users/tung/work/watcher' }, updatedAt: now - 10_000 }),
  pane({ id: '%2', status: 'needs_input', summary: 'Needs decision', git: { repo: 'watcher', branch: 'feature/tui', worktreePath: '/Users/tung/work/watcher-feature' }, updatedAt: now - 5_000, currentAction: 'waiting for approval', lastMessage: 'Please pick one.' }),
  pane({ id: '%3', status: 'unknown', summary: 'Fallback pane', cwd: '/Users/tung/tmp/spike', updatedAt: now - 1_000 }),
  pane({ id: '%4', status: 'idle', summary: 'Visible idle', git: { repo: 'watcher', branch: 'main', worktreePath: '/Users/tung/work/watcher' }, updatedAt: now }),
];

test('groups panes as repo > worktree path > rows and shows idle running agents', () => {
  const groups = groupPanes(panes, now, '/Users/tung');
  assert.equal(groups[0]!.title, 'watcher');
  assert.deepEqual(groups[0]!.worktrees.map((worktree) => worktree.path), ['/Users/tung/work/watcher-feature', '/Users/tung/work/watcher']);
  assert.equal(groups[1]!.title, 'Path fallback');
  assert.equal(groups[1]!.worktrees[0]!.key, 'path:/Users/tung/tmp/spike');
  assert.equal(selectablePanes(groups).some((candidate) => candidate.id === '%4'), true);
});

test('prototype row shape stays minimal without status badges or time columns', () => {
  const frame = renderSwitcherFrame({ panes, daemonAvailable: true, tmuxAvailable: true, now }, 100, 22, { useColor: false, home: '/Users/tung', selectedPaneId: '%2' }).join('\n');
  const row = frame.split('\n').find((line) => line.includes('Needs decision')) ?? '';
  assert.match(row, /●\s+pi\s+Needs decision/);
  assert.doesNotMatch(row, /needs_input/);
  assert.doesNotMatch(row, /\b\d+[smh]\b/);
  assert.doesNotMatch(row, /▶|▸|>/);
});

test('selected row uses full-width reverse highlight without hardcoded color', () => {
  const frame = renderSwitcherFrame({ panes, daemonAvailable: true, tmuxAvailable: true, now }, 90, 18, { useColor: true, home: '/Users/tung', selectedPaneId: '%2' });
  const selected = frame.find((line) => stripAnsi(line).includes('Needs decision')) ?? '';
  assert.match(selected, /\x1b\[1;7m/);
  assert.doesNotMatch(selected, /\x1b\[(?:3[0-7]|9[0-7]|4[0-7]|10[0-7])m/);
  assert.equal(visibleLength(selected), 90);
});

test('wide layout has rich right detail pane', () => {
  const frame = renderSwitcherFrame({ panes, daemonAvailable: true, tmuxAvailable: true, now }, 130, 24, { useColor: false, home: '/Users/tung', selectedPaneId: '%2' }).join('\n');
  assert.match(frame, /details/);
  assert.match(frame, /● pi · needs_input · updated 5s ago/);
  assert.match(frame, /repo\s+watcher/);
  assert.match(frame, /branch\s+feature\/tui/);
  assert.match(frame, /worktree\s+~\/work\/watcher-feature/);
  assert.match(frame, /Needs decision/);
  assert.match(frame, /waiting for approval/);
  assert.match(frame, /Please pick one\./);
  assert.match(frame, /s:1\.1 \(%2\)/);
  assert.match(frame, /needs_input · updated 5s ago/);
});

test('renderer never emits embedded newlines from pane text', () => {
  const noisy = [pane({
    id: '%9',
    status: 'idle',
    summary: 'first line\nsecond line',
    lastMessage: 'assistant said\nway too much',
    currentAction: 'tool\ninput',
  })];
  const frame = renderSwitcherFrame({ panes: noisy, daemonAvailable: true, tmuxAvailable: true, now }, 100, 18, { useColor: false, selectedPaneId: '%9' });
  assert.equal(frame.length, 18);
  assert.equal(frame.every((line) => !line.includes('\n') && visibleLength(line) === 100), true);
  assert.match(frame.join('\n'), /first line second line/);
});

test('details pane does not repeat identical summary and last message', () => {
  const repeated = [pane({
    id: '%9',
    status: 'idle',
    summary: 'same assistant final answer',
    lastMessage: 'same assistant final answer',
  })];
  const frame = renderSwitcherFrame({ panes: repeated, daemonAvailable: true, tmuxAvailable: true, now }, 120, 18, { useColor: false, selectedPaneId: '%9' }).join('\n');
  assert.equal(frame.match(/same assistant final answer/g)?.length, 2);
});

test('details pane does not repeat truncated summary and full last message', () => {
  const full = 'This is a very long assistant final answer that should only appear once in details even when the idle summary was made from a truncated version of the same text.';
  const repeated = [pane({
    id: '%9',
    status: 'idle',
    summary: `${full.slice(0, 80)}…`,
    lastMessage: full,
  })];
  const frame = renderSwitcherFrame({ panes: repeated, daemonAvailable: true, tmuxAvailable: true, now }, 120, 18, { useColor: false, selectedPaneId: '%9' }).join('\n');
  assert.equal(frame.match(/This is a very long assistant final answer/g)?.length, 1);
});

test('details pane wraps and marks task text separately from assistant message', () => {
  const longTask = 'Implement the detail pane so the user prompt wraps across multiple lines and is visually distinct from the assistant response.';
  const frame = renderSwitcherFrame({ panes: [pane({ id: '%9', status: 'needs_input', summary: longTask, lastMessage: 'Please approve the layout.' })], daemonAvailable: true, tmuxAvailable: true, now }, 130, 22, { useColor: false, selectedPaneId: '%9' }).join('\n');
  assert.match(frame, /Task/);
  assert.match(frame, /▸ Implement the detail pane/);
  assert.match(frame, /▌ Please approve the layout\./);
});

test('details pane leaves breathing room between sections', () => {
  const frame = renderSwitcherFrame({ panes: [pane({ id: '%9', status: 'working', summary: 'Make details readable' })], daemonAvailable: true, tmuxAvailable: true, now }, 130, 22, { useColor: false, selectedPaneId: '%9' }).map(stripAnsi);
  const statusIndex = frame.findIndex((line) => line.includes('Status'));
  const taskIndex = frame.findIndex((line) => line.includes('Task'));
  assert.equal(taskIndex, statusIndex + 3);
});

test('medium and narrow layouts collapse to list-first selected summary', () => {
  const medium = renderSwitcherFrame({ panes, daemonAvailable: true, tmuxAvailable: true, now }, 90, 18, { useColor: false, home: '/Users/tung', selectedPaneId: '%2' }).join('\n');
  const narrow = renderSwitcherFrame({ panes, daemonAvailable: true, tmuxAvailable: true, now }, 60, 18, { useColor: false, home: '/Users/tung', selectedPaneId: '%2' }).join('\n');
  assert.doesNotMatch(medium, /details/);
  assert.match(medium, /selected %2 s:1\.1 \(%2\) · pi · needs_input/);
  assert.doesNotMatch(narrow, /details/);
  assert.match(narrow, /selected %2 s:1\.1 \(%2\) · pi · needs_input/);
});

test('keyboard selection helper supports j/k style movement over rows only', () => {
  const rows = selectablePanes(groupPanes(panes, now, '/Users/tung'));
  assert.equal(moveSelection(rows, '%2', 1), '%1');
  assert.equal(moveSelection(rows, '%1', -1), '%2');
});
