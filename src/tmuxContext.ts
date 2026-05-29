import { TmuxTarget } from './model.js';
import { CommandRunner, nodeCommandRunner } from './tmux.js';

const PANE_FORMAT = [
  '#{pane_id}',
  '#{session_name}',
  '#{window_index}',
  '#{pane_index}',
  '#{pane_current_path}',
  '#{pane_pid}',
  '#{pane_current_command}',
  '#{window_name}',
].join('\t');

export async function listTmuxPanes(runner: CommandRunner = nodeCommandRunner): Promise<TmuxTarget[]> {
  const result = await runner.execFile('tmux', ['list-panes', '-a', '-F', PANE_FORMAT], { timeout: 1000 });
  return result.stdout.split('\n').filter(Boolean).map(parsePaneLine);
}

export async function getTmuxPane(paneId: string, runner: CommandRunner = nodeCommandRunner): Promise<TmuxTarget> {
  try {
    const panes = await listTmuxPanes(runner);
    return panes.find((pane) => pane.paneId === paneId) ?? { paneId };
  } catch {
    return { paneId };
  }
}

function parsePaneLine(line: string): TmuxTarget {
  const [paneId, sessionName, windowIndex, paneIndex, paneCurrentPath, panePid, paneCurrentCommand, windowName] = line.split('\t');
  return {
    paneId,
    sessionName,
    windowIndex,
    paneIndex,
    paneCurrentPath,
    panePid: panePid ? Number(panePid) : undefined,
    paneCurrentCommand,
    windowName,
  };
}
