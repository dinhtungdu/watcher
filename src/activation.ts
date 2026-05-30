import { AgentPane, GhosttyTarget, TmuxTarget } from './model.js';
import { paneTargetLabel } from './terminalTarget.js';
import { CommandRunner, nodeCommandRunner } from './tmux.js';

export interface TerminalCommand {
  file: string;
  args: string[];
}

export interface ActivationOptions {
  insideTmux?: boolean;
  runner?: CommandRunner;
  env?: NodeJS.ProcessEnv;
}

function requireTmuxTarget(target: TmuxTarget): { paneId: string; session: string; window: string } {
  const paneId = target.paneId;
  const session = target.sessionName;
  const window = target.windowIndex;
  if (!paneId || !session || window === undefined) {
    throw new Error(`Cannot activate ${target.id}: missing tmux session/window/pane target`);
  }
  return { paneId, session, window };
}

function escapeAppleScriptString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

export function activationTargetLabel(pane: AgentPane): string {
  return paneTargetLabel(pane);
}

export function buildTmuxActivationCommands(target: TmuxTarget, insideTmux: boolean): TerminalCommand[] {
  const required = requireTmuxTarget(target);
  const windowTarget = `${required.session}:${required.window}`;
  if (insideTmux) {
    return [
      { file: 'tmux', args: ['switch-client', '-t', required.session] },
      { file: 'tmux', args: ['select-window', '-t', windowTarget] },
      { file: 'tmux', args: ['select-pane', '-t', required.paneId] },
    ];
  }
  return [
    { file: 'tmux', args: ['select-window', '-t', windowTarget] },
    { file: 'tmux', args: ['select-pane', '-t', required.paneId] },
    { file: 'tmux', args: ['attach-session', '-t', required.session] },
  ];
}

export function buildGhosttyActivationScript(target: GhosttyTarget): string {
  const terminalId = escapeAppleScriptString(target.terminalId);
  const lines = [
    'tell application "Ghostty"',
    `  set targetTerminal to first terminal whose id is "${terminalId}"`,
    '  focus targetTerminal',
    'end tell',
  ];
  return lines.join('\n');
}

export function buildGhosttyActivationCommands(target: GhosttyTarget): TerminalCommand[] {
  return [{ file: 'osascript', args: ['-e', buildGhosttyActivationScript(target)] }];
}

export function buildActivationCommands(pane: AgentPane, insideTmux: boolean): TerminalCommand[] {
  switch (pane.target.backend) {
    case 'tmux':
      return buildTmuxActivationCommands(pane.target, insideTmux);
    case 'ghostty':
      return buildGhosttyActivationCommands(pane.target);
  }
}

export async function activateAgentPane(pane: AgentPane, options: ActivationOptions = {}): Promise<void> {
  const runner = options.runner ?? nodeCommandRunner;
  const env = options.env ?? process.env;
  const insideTmux = options.insideTmux ?? Boolean(env.TMUX);
  for (const command of buildActivationCommands(pane, insideTmux)) {
    await runner.execFile(command.file, command.args, { timeout: 5000, env });
  }
}
