import { AgentPane } from './model.js';
import { CommandRunner, nodeCommandRunner } from './tmux.js';

export interface TmuxCommand {
  file: 'tmux';
  args: string[];
}

export interface ActivationOptions {
  insideTmux?: boolean;
  runner?: CommandRunner;
  env?: NodeJS.ProcessEnv;
}

function requireTarget(pane: AgentPane): { paneId: string; session: string; window: string } {
  const paneId = pane.tmux.paneId || pane.id;
  const session = pane.tmux.sessionName;
  const window = pane.tmux.windowIndex;
  if (!paneId || !session || window === undefined) {
    throw new Error(`Cannot activate ${pane.id}: missing tmux session/window/pane target`);
  }
  return { paneId, session, window };
}

export function activationTargetLabel(pane: AgentPane): string {
  const paneId = pane.tmux.paneId || pane.id;
  const session = pane.tmux.sessionName ?? '?';
  const window = pane.tmux.windowIndex ?? '?';
  const paneIndex = pane.tmux.paneIndex ?? '?';
  return `${session}:${window}.${paneIndex} (${paneId})`;
}

export function buildActivationCommands(pane: AgentPane, insideTmux: boolean): TmuxCommand[] {
  const target = requireTarget(pane);
  const windowTarget = `${target.session}:${target.window}`;
  if (insideTmux) {
    return [
      { file: 'tmux', args: ['switch-client', '-t', target.session] },
      { file: 'tmux', args: ['select-window', '-t', windowTarget] },
      { file: 'tmux', args: ['select-pane', '-t', target.paneId] },
    ];
  }
  return [
    { file: 'tmux', args: ['select-window', '-t', windowTarget] },
    { file: 'tmux', args: ['select-pane', '-t', target.paneId] },
    { file: 'tmux', args: ['attach-session', '-t', target.session] },
  ];
}

export async function activateAgentPane(pane: AgentPane, options: ActivationOptions = {}): Promise<void> {
  const runner = options.runner ?? nodeCommandRunner;
  const env = options.env ?? process.env;
  const insideTmux = options.insideTmux ?? Boolean(env.TMUX);
  for (const command of buildActivationCommands(pane, insideTmux)) {
    await runner.execFile(command.file, command.args, { timeout: 5000, env });
  }
}
