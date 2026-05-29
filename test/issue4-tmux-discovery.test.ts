import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandRunner } from '../src/tmux.js';
import { discoverUnhookedPanes, mergeDaemonAndDiscovered } from '../src/discovery.js';
import { renderSwitcherFrame } from '../src/switcherLayout.js';
import { AgentPane } from '../src/model.js';

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
          ].join('\n') + '\n',
          stderr: '',
        };
      }
      if (file === 'pgrep') {
        if (args[1] === '102') return { stdout: '202\n', stderr: '' };
        if (args[1] === '103') return { stdout: '203\n', stderr: '' };
        throw new Error('no children');
      }
      if (file === 'ps') {
        if (args[1] === '202') return { stdout: 'claude\n', stderr: '' };
        if (args[1] === '203') return { stdout: 'aider\n', stderr: '' };
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
  const result = await discoverUnhookedPanes(discoveryRunner(), 1_700_000_000_000);
  assert.equal(result.tmuxAvailable, true);
  assert.deepEqual(result.panes.map((pane) => [pane.id, pane.agentType, pane.status]), [
    ['%1', 'pi', 'unknown'],
    ['%2', 'claude', 'unknown'],
    ['%3', 'aider', 'unknown'],
  ]);
  assert.equal(result.panes.some((pane) => pane.id === '%4'), false);
});

test('discovered panes carry grouping metadata and path fallback', async () => {
  const result = await discoverUnhookedPanes(discoveryRunner(), 1_700_000_000_000);
  const frame = renderSwitcherFrame({ panes: result.panes, daemonAvailable: false, tmuxAvailable: true, now: 1_700_000_010_000 }, 120, 24, { useColor: false, home: '/Users/tung' }).join('\n');
  assert.match(frame, /watcher/);
  assert.match(frame, /main ~\/work\/watcher/);
  assert.match(frame, /feature\/tui ~\/work\/watcher-feature/);
  assert.match(frame, /Path fallback/);
  assert.match(frame, /~\/tmp\/spike/);
  assert.match(frame, /● pi\s+Detected pi process/);
  assert.match(frame, /● claude\s+Detected claude process/);
  assert.match(frame, /● aider\s+Detected aider process/);
});

test('merge hides daemon ghost panes and keeps hooked status over discovery', async () => {
  const result = await discoverUnhookedPanes(discoveryRunner(), 1_700_000_000_000);
  const hooked: AgentPane = {
    id: '%1',
    agentType: 'pi',
    status: 'working',
    summary: 'Hook status wins',
    tmux: result.panes[0]!.tmux,
    cwd: result.panes[0]!.cwd,
    git: result.panes[0]!.git,
    updatedAt: 1_700_000_005_000,
  };
  const ghost: AgentPane = { ...hooked, id: '%99', summary: 'Ghost pane' };
  const merged = mergeDaemonAndDiscovered([hooked, ghost], result.panes, result.paneIds);
  assert.equal(merged.some((pane) => pane.id === '%99'), false);
  assert.equal(merged.find((pane) => pane.id === '%1')?.summary, 'Hook status wins');
  assert.equal(merged.find((pane) => pane.id === '%1')?.status, 'working');
});
