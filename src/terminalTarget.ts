import { AgentPane, GhosttyTarget, TerminalTarget, TmuxTarget } from './model.js';

export function terminalTargetId(target: TerminalTarget): string {
  return target.id;
}

export function terminalTargetCwd(target: TerminalTarget): string | undefined {
  return target.cwd ?? (target.backend === 'tmux' ? target.paneCurrentPath : undefined);
}

export function terminalTargetTitle(target: TerminalTarget): string | undefined {
  if (target.title) return target.title;
  if (target.backend === 'tmux') return target.paneTitle || target.windowName;
  return target.terminalTitle || target.tabName || target.windowName;
}

export function terminalTargetPid(target: TerminalTarget): number | undefined {
  return target.pid ?? (target.backend === 'tmux' ? target.panePid : undefined);
}

export function terminalTargetCommand(target: TerminalTarget): string | undefined {
  return target.currentCommand ?? (target.backend === 'tmux' ? target.paneCurrentCommand : undefined);
}

export function terminalTargetLabel(target: TerminalTarget): string {
  if (target.backend === 'tmux') {
    const session = target.sessionName ?? '?';
    const window = target.windowIndex ?? '?';
    const pane = target.paneIndex ?? '?';
    return `${session}:${window}.${pane} (${target.paneId})`;
  }
  const window = target.windowName ?? target.windowId ?? '?';
  const tab = target.tabName ?? target.tabId ?? '?';
  return `ghostty ${window}/${tab}/${target.terminalId}`;
}

export function tmuxTarget(fields: Omit<TmuxTarget, 'backend' | 'id'> & { id?: string }): TmuxTarget {
  return {
    backend: 'tmux',
    id: fields.id ?? fields.paneId,
    cwd: fields.cwd ?? fields.paneCurrentPath,
    title: fields.title ?? fields.paneTitle ?? fields.windowName,
    pid: fields.pid ?? fields.panePid,
    currentCommand: fields.currentCommand ?? fields.paneCurrentCommand,
    ...fields,
  };
}

export function ghosttyTarget(fields: Omit<GhosttyTarget, 'backend' | 'id'> & { id?: string }): GhosttyTarget {
  return {
    backend: 'ghostty',
    id: fields.id ?? fields.terminalId,
    cwd: fields.cwd,
    title: fields.title ?? fields.terminalTitle ?? fields.tabName ?? fields.windowName,
    pid: fields.pid,
    ...fields,
  };
}

export function paneTargetLabel(pane: AgentPane): string {
  return terminalTargetLabel(pane.target);
}
