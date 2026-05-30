import { TmuxTarget } from './model.js';
import { tmuxTarget } from './terminalTarget.js';
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
  '#{pane_title}',
].join('\t');

export async function listTmuxPanes(runner: CommandRunner = nodeCommandRunner): Promise<TmuxTarget[]> {
  const result = await runner.execFile('tmux', ['list-panes', '-a', '-F', PANE_FORMAT], { timeout: 1000 });
  return result.stdout.split('\n').filter(Boolean).map(parsePaneLine);
}

export async function getTmuxPane(paneId: string, runner: CommandRunner = nodeCommandRunner): Promise<TmuxTarget> {
  try {
    const panes = await listTmuxPanes(runner);
    return panes.find((pane) => pane.paneId === paneId) ?? tmuxTarget({ paneId });
  } catch {
    return tmuxTarget({ paneId });
  }
}

export async function captureTmuxPanePreview(paneId: string, runner: CommandRunner = nodeCommandRunner, lines = 40): Promise<string | undefined> {
  try {
    const result = await runner.execFile('tmux', ['capture-pane', '-p', '-t', paneId, '-S', `-${lines}`], { timeout: 1000 });
    const preview = result.stdout
      .split('\n')
      .map((line) => line.replace(/\s+$/u, ''))
      .join('\n')
      .trim();
    return preview ? preview.slice(-8000) : undefined;
  } catch {
    return undefined;
  }
}

function parsePaneLine(line: string): TmuxTarget {
  const [paneId, sessionName, windowIndex, paneIndex, paneCurrentPath, panePid, paneCurrentCommand, windowName, paneTitle] = line.split('\t');
  return tmuxTarget({
    paneId,
    sessionName,
    windowIndex,
    paneIndex,
    paneCurrentPath,
    panePid: panePid ? Number(panePid) : undefined,
    paneCurrentCommand,
    windowName,
    paneTitle,
  });
}
