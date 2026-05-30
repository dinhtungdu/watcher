import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { AgentPane } from '../src/model.js';
import { groupPanes, moveSelection, renderSwitcherFrame, selectablePanes } from '../src/switcherLayout.js';
import { stripAnsi, visibleLength } from '../src/text.js';

const now = 1_700_000_000_000;

function pane(overrides: Partial<AgentPane> & Pick<AgentPane, 'id' | 'status' | 'summary'>): AgentPane {
  return {
    agentType: 'pi',
    tmux: { paneId: overrides.id, sessionName: 's', windowIndex: '1', paneIndex: '1', paneCurrentPath: '/repo' },
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
  assert.match(frame, /● pi · needs_input · 5s/);
  assert.match(frame, /repo\s+watcher/);
  assert.match(frame, /branch\s+feature\/tui/);
  assert.match(frame, /worktree\s+~\/work\/watcher-feature/);
  assert.match(frame, /Needs decision/);
  assert.match(frame, /waiting for approval/);
  assert.match(frame, /Please pick one\./);
  assert.match(frame, /s:1\.1 \(%2\)/);
  assert.match(frame, /needs_input · 5s/);
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
