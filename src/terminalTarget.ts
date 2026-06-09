import { AgentPane, TerminalTarget, TmuxTarget } from './model.js';
import { canonicalSurfaceKey, surfaceFromTarget } from './surfaceIdentity.js';

export function terminalTargetId(target: TerminalTarget): string {
  return target.id;
}

export function terminalTargetCwd(target: TerminalTarget): string | undefined {
  return target.cwd ?? target.paneCurrentPath;
}

export function terminalTargetTitle(target: TerminalTarget): string | undefined {
  return target.title || target.paneTitle || target.windowName;
}

export function terminalTargetPid(target: TerminalTarget): number | undefined {
  return target.pid ?? target.panePid;
}

export function terminalTargetCommand(target: TerminalTarget): string | undefined {
  return target.currentCommand ?? target.paneCurrentCommand;
}

export function terminalTargetLabel(target: TerminalTarget): string {
  const session = target.sessionName ?? '?';
  const window = target.windowIndex ?? '?';
  const pane = target.paneIndex ?? '?';
  return `${session}:${window}.${pane} (${target.paneId})`;
}

export function tmuxTarget(fields: Omit<TmuxTarget, 'backend' | 'id'> & { id?: string }): TmuxTarget {
  return {
    backend: 'tmux',
    id: fields.id ?? fields.paneId,
    cwd: fields.cwd ?? fields.paneCurrentPath,
    title: fields.title || fields.paneTitle || fields.windowName,
    pid: fields.pid ?? fields.panePid,
    currentCommand: fields.currentCommand ?? fields.paneCurrentCommand,
    ...fields,
  };
}

type LegacyAgentPane = Omit<AgentPane, 'target'> & { target?: TerminalTarget; tmux?: TmuxTarget };

function paneWithCanonicalTarget(pane: AgentPane | LegacyAgentPane, target: TerminalTarget): AgentPane {
  return { ...pane, id: canonicalSurfaceKey(surfaceFromTarget(target)), target } as AgentPane;
}

export function normalizeAgentPaneTarget(pane: AgentPane | LegacyAgentPane): AgentPane | undefined {
  const candidate = pane as LegacyAgentPane;
  if (candidate.target) return paneWithCanonicalTarget(candidate, candidate.target);
  if (candidate.tmux) return paneWithCanonicalTarget(candidate, tmuxTarget(candidate.tmux));
  return undefined;
}

export function paneTargetLabel(pane: AgentPane): string {
  return terminalTargetLabel(pane.target);
}
