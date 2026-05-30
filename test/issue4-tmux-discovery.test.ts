import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { CommandRunner } from '../src/tmux.js';
import { discoverUnintegratedPanes, mergeDaemonAndDiscovered } from '../src/discovery.js';
import { renderSwitcherFrame } from '../src/switcherLayout.js';
import { AgentPane } from '../src/model.js';
import { tmuxTarget } from '../src/terminalTarget.js';

function discoveryRunner(): CommandRunner {
  return {
    async execFile(file, args) {
      if (file === 'tmux' && args[0] === 'list-panes') {
        return {
          stdout: [
            '%1\twatcher\t0\t0\t/Users/tung/work/watcher\t101\tpi\tone',
            '%2\twatcher\t0\t1\t/Users/tung/work/watcher-feature\t102\tzsh\ttwo',
            '%3\tlab\t2\t0\t/Users/tung/tmp/spike\t103\tbash\tthree',
            '%4\tshell\t1\t0\t/Users/tung\t104\tzsh\tfour',
            '%5\topen\t0\t0\t/Users/tung/work/opencode\t105\topencode\tfive',
          ].join('\n') + '\n',
          stderr: '',
        };
      }
      if (file === 'tmux' && args[0] === 'capture-pane') {
        if (args[3] === '%2') throw new Error('preview unavailable');
        return { stdout: `recent output for ${args[3]}\nagent is doing useful work\n`, stderr: '' };
      }
      if (file === 'pgrep') {
        if (args[1] === '102') return { stdout: '202\n', stderr: '' };
        if (args[1] === '103') return { stdout: '203\n', stderr: '' };
        throw new Error('no children');
      }
      if (file === 'ps') {
        if (args[1] === '202') return { stdout: 'claude\n', stderr: '' };
        if (args[1] === '203') return { stdout: 'codex\n', stderr: '' };
      }
      if (file === 'git') {
        const cwd = args[1];
        const command = args.slice(2).join(' ');
        if (cwd === '/Users/tung/tmp/spike') throw new Error('not git');
        if (command === 'rev-parse --show-toplevel') return { stdout: `${cwd}\n`, stderr: '' };
        if (command === 'branch --show-current') return { stdout: cwd.endsWith('feature') ? 'feature/tui\n' : 'main\n', stderr: '' };
        if (command === 'rev-parse --path-format=absolute --git-common-dir') return { stdout: '/Users/tung/work/watcher/.git\n', stderr: '' };
      }
      throw new Error(`unexpected ${file} ${args.join(' ')}`);
    },
  };
}

test('tmux discovery detects direct and one-level child agent processes', async () => {
  const result = await discoverUnintegratedPanes(discoveryRunner(), 1_700_000_000_000);
  assert.equal(result.tmuxAvailable, true);
  assert.deepEqual(result.panes.map((pane) => [pane.id, pane.agentType, pane.status]), [
    ['tmux:%1', 'pi', 'unknown'],
    ['tmux:%2', 'claude', 'unknown'],
    ['tmux:%3', 'codex', 'unknown'],
    ['tmux:%5', 'opencode', 'unknown'],
  ]);
  assert.equal(result.panes.find((pane) => pane.id === 'tmux:%1')?.terminalPreview, 'recent output for %1\nagent is doing useful work');
  assert.equal(result.panes.find((pane) => pane.id === 'tmux:%2')?.terminalPreview, undefined);
  assert.equal(result.panes.find((pane) => pane.id === 'tmux:%1')?.observation?.terminalPreview, true);
  assert.equal(result.panes.find((pane) => pane.id === 'tmux:%2')?.observation?.terminalPreview, false);
  assert.equal(result.panes.some((pane) => pane.id === 'tmux:%4'), false);
});

test('discovered panes carry grouping metadata and path fallback', async () => {
  const result = await discoverUnintegratedPanes(discoveryRunner(), 1_700_000_000_000);
  const frame = renderSwitcherFrame({ panes: result.panes, daemonAvailable: false, tmuxAvailable: true, now: 1_700_000_010_000 }, 120, 24, { useColor: false, home: '/Users/tung' }).join('\n');
  assert.match(frame, /watcher/);
  assert.match(frame, /main ~\/work\/watcher/);
  assert.match(frame, /feature\/tui ~\/work\/watcher-feature/);
  assert.match(frame, /Path fallback/);
  assert.match(frame, /~\/tmp\/spike/);
  assert.match(frame, /● pi\s+Waiting for first Watcher event/);
  assert.match(frame, /● claude\s+Detected claude process/);
  assert.match(frame, /● codex\s+Detected codex process/);
  assert.doesNotMatch(frame, /aider/);
  assert.match(frame, /Detected opencode process/);
  assert.match(frame, /Terminal preview/);
  assert.match(frame, /agent is doing useful work/);
});

test('merge hides daemon ghost panes and keeps event-source status over discovery', async () => {
  const result = await discoverUnintegratedPanes(discoveryRunner(), 1_700_000_000_000);
  const eventSourced: AgentPane = {
    id: 'tmux:%1',
    agentType: 'pi',
    status: 'working',
    summary: 'Event source status wins',
    target: result.panes[0]!.target,
    cwd: result.panes[0]!.cwd,
    git: result.panes[0]!.git,
    updatedAt: 1_700_000_005_000,
  };
  const ghost: AgentPane = { ...eventSourced, id: 'tmux:%99', target: tmuxTarget({ paneId: '%99' }), summary: 'Ghost pane' };
  const merged = mergeDaemonAndDiscovered([eventSourced, ghost], result.panes, result.paneIds, true);
  assert.equal(merged.some((pane) => pane.id === 'tmux:%99'), false);
  assert.equal(merged.find((pane) => pane.id === 'tmux:%1')?.summary, 'Event source status wins');
  assert.equal(merged.find((pane) => pane.id === 'tmux:%1')?.status, 'working');
});

test('merge keeps daemon panes when tmux is unavailable but drops ghosts when tmux is available', async () => {
  const result = await discoverUnintegratedPanes(discoveryRunner(), 1_700_000_000_000);
  const stale: AgentPane = {
    id: 'tmux:%99',
    agentType: 'pi',
    status: 'working',
    summary: 'Keep only when tmux unavailable',
    target: tmuxTarget({ paneId: '%99' }),
    updatedAt: 1_700_000_005_000,
  };
  assert.equal(mergeDaemonAndDiscovered([stale], [], new Set(), false).some((pane) => pane.id === 'tmux:%99'), true);
  assert.equal(mergeDaemonAndDiscovered([stale], result.panes, result.paneIds, true).some((pane) => pane.id === 'tmux:%99'), false);
});

test('merge tolerates legacy daemon panes that still use tmux field or backend-local ids', async () => {
  const result = await discoverUnintegratedPanes(discoveryRunner(), 1_700_000_000_000);
  const legacyEventPane = {
    id: '%1',
    agentType: 'pi',
    status: 'working',
    summary: 'Legacy daemon snapshot',
    tmux: result.panes[0]!.target,
    cwd: result.panes[0]!.cwd,
    git: result.panes[0]!.git,
    updatedAt: 1_700_000_005_000,
  } as unknown as AgentPane;
  const merged = mergeDaemonAndDiscovered([legacyEventPane], result.panes, result.paneIds, true);
  assert.equal(merged[0]!.id, 'tmux:%1');
  assert.equal(merged[0]!.target.paneId, '%1');
  const frame = renderSwitcherFrame({ panes: merged, daemonAvailable: true, tmuxAvailable: true, now: 1_700_000_010_000 }, 120, 24, { useColor: false, home: '/Users/tung' }).join('\n');
  assert.match(frame, /Legacy daemon snapshot/);
});
