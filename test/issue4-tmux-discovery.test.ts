import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { CommandRunner } from '../src/tmux.js';
import { observeTerminalAgentPanes } from '../src/discovery.js';
import { detectAgentFromProcess } from '../src/agents/registry.js';
import { renderSwitcherFrame } from '../src/switcherLayout.js';

export function discoveryRunner(): CommandRunner {
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
            '%6\twatcher\t0\t2\t/Users/tung/work/watcher-sidekick\t106\tnode\tsix',
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
        const pid = args[1];
        const field = args[3];
        const processes: Record<string, Record<string, string>> = {
          '106': { 'comm=': 'pi\n', 'args=': 'pi\n' },
          '202': { 'comm=': 'claude\n', 'args=': 'claude\n' },
          '203': { 'comm=': 'codex\n', 'args=': 'codex\n' },
        };
        const stdout = processes[pid]?.[field];
        if (stdout) return { stdout, stderr: '' };
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

test('process detection supports direct commands and Linux JavaScript shebang wrappers without matching random node apps', () => {
  assert.equal(detectAgentFromProcess({ command: 'pi' }), 'pi');
  assert.equal(detectAgentFromProcess({ command: 'node', args: 'node /usr/local/bin/pi' }), 'pi');
  assert.equal(detectAgentFromProcess({ command: 'node', args: 'node --max-old-space-size=8192 /usr/local/bin/codex' }), 'codex');
  assert.equal(detectAgentFromProcess({ command: 'node', args: 'node /tmp/app.js' }), undefined);
  assert.equal(detectAgentFromProcess({ command: 'node', args: 'node --require pi /tmp/app.js' }), undefined);
});

test('tmux observation detects agent processes and idle shell panes', async () => {
  const result = await observeTerminalAgentPanes(discoveryRunner(), 1_700_000_000_000);
  assert.equal(result.tmuxAvailable, true);
  assert.deepEqual(result.discoveredPanes.map((pane) => [pane.id, pane.agentType, pane.status, pane.summary]), [
    ['tmux:%1', 'pi', 'unknown', 'Waiting for first Watcher event'],
    ['tmux:%2', 'claude', 'unknown', 'Detected claude process'],
    ['tmux:%3', 'codex', 'unknown', 'Detected codex process'],
    ['tmux:%4', undefined, 'idle', 'four'],
    ['tmux:%5', 'opencode', 'unknown', 'Detected opencode process'],
    ['tmux:%6', 'pi', 'unknown', 'Waiting for first Watcher event'],
  ]);
  assert.equal(result.discoveredPanes.find((pane) => pane.id === 'tmux:%1')?.terminalPreview, 'recent output for %1\nagent is doing useful work');
  assert.equal(result.discoveredPanes.find((pane) => pane.id === 'tmux:%2')?.terminalPreview, undefined);
  assert.equal(result.discoveredPanes.find((pane) => pane.id === 'tmux:%1')?.observation?.terminalPreview, true);
  assert.equal(result.discoveredPanes.find((pane) => pane.id === 'tmux:%2')?.observation?.terminalPreview, false);
  assert.deepEqual([...result.livePaneIds].sort(), ['tmux:%1', 'tmux:%2', 'tmux:%3', 'tmux:%4', 'tmux:%5', 'tmux:%6']);
  assert.deepEqual([...result.liveAgentProcessPaneIds].sort(), ['tmux:%1', 'tmux:%2', 'tmux:%3', 'tmux:%5', 'tmux:%6']);
});

test('terminal-observed panes carry grouping metadata and default to agent-only rendering', async () => {
  const result = await observeTerminalAgentPanes(discoveryRunner(), 1_700_000_000_000);
  const frame = renderSwitcherFrame({ panes: result.discoveredPanes, daemonAvailable: false, tmuxAvailable: true, now: 1_700_000_010_000 }, 120, 24, { useColor: false, home: '/Users/tung' }).join('\n');
  assert.match(frame, /agents/);
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
  assert.doesNotMatch(frame, /● zsh\s+four/);
  assert.match(frame, /terminal preview/);
  assert.match(frame, /agent is doing useful work/);

  const allFrame = renderSwitcherFrame({ panes: result.discoveredPanes, daemonAvailable: false, tmuxAvailable: true, now: 1_700_000_010_000 }, 120, 24, { useColor: false, home: '/Users/tung', paneFilter: 'all' }).join('\n');
  assert.match(allFrame, /all/);
  assert.match(allFrame, /● zsh\s+four/);
});
