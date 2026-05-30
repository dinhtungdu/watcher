import path from 'node:path';
import { AgentPane, TmuxTarget } from './model.js';
import { terminalTargetCommand, terminalTargetCwd, terminalTargetPid } from './terminalTarget.js';
import { CommandRunner, nodeCommandRunner } from './tmux.js';
import { listTmuxPanes } from './tmuxContext.js';
import { discoverGitMetadata } from './git.js';

const KNOWN_AGENTS = new Set(['pi', 'claude', 'codex', 'aider']);

export interface DiscoveryResult {
  tmuxAvailable: boolean;
  paneIds: Set<string>;
  panes: AgentPane[];
}

function normalizeCommand(command: string | undefined): string | undefined {
  if (!command) return undefined;
  const base = path.basename(command).toLowerCase();
  return base.replace(/\.js$/, '');
}

function knownAgentFromCommand(command: string | undefined): string | undefined {
  const normalized = normalizeCommand(command);
  if (!normalized) return undefined;
  return KNOWN_AGENTS.has(normalized) ? normalized : undefined;
}

async function childProcessCommands(parentPid: number | undefined, runner: CommandRunner): Promise<string[]> {
  if (!parentPid || Number.isNaN(parentPid)) return [];
  try {
    const pids = (await runner.execFile('pgrep', ['-P', String(parentPid)], { timeout: 1000 })).stdout.split(/\s+/).filter(Boolean);
    const commands: string[] = [];
    for (const pid of pids) {
      try {
        const command = (await runner.execFile('ps', ['-p', pid, '-o', 'comm='], { timeout: 1000 })).stdout.trim();
        if (command) commands.push(command);
      } catch {
        // One rude child process should not tank discovery. Tiny process gremlins happen.
      }
    }
    return commands;
  } catch {
    return [];
  }
}

export async function detectKnownAgent(pane: TmuxTarget, runner: CommandRunner = nodeCommandRunner): Promise<string | undefined> {
  const direct = knownAgentFromCommand(terminalTargetCommand(pane));
  if (direct) return direct;
  for (const command of await childProcessCommands(terminalTargetPid(pane), runner)) {
    const child = knownAgentFromCommand(command);
    if (child) return child;
  }
  return undefined;
}

export async function discoverUnhookedPanes(runner: CommandRunner = nodeCommandRunner, now = Date.now()): Promise<DiscoveryResult> {
  let panes: TmuxTarget[];
  try {
    panes = await listTmuxPanes(runner);
  } catch {
    return { tmuxAvailable: false, paneIds: new Set(), panes: [] };
  }
  const discovered: AgentPane[] = [];
  for (const tmux of panes) {
    const agentType = await detectKnownAgent(tmux, runner);
    if (!agentType) continue;
    const cwd = terminalTargetCwd(tmux);
    discovered.push({
      id: tmux.paneId,
      agentType,
      status: 'unknown',
      summary: `Detected ${agentType} process without Watcher hook status`,
      currentAction: 'tmux/process discovery fallback',
      target: tmux,
      cwd,
      git: await discoverGitMetadata(cwd, runner),
      updatedAt: now,
    });
  }
  return { tmuxAvailable: true, paneIds: new Set(panes.map((pane) => pane.paneId)), panes: discovered };
}

export function mergeDaemonAndDiscovered(daemonPanes: AgentPane[], discovered: AgentPane[], livePaneIds: Set<string>): AgentPane[] {
  const result = new Map<string, AgentPane>();
  for (const pane of daemonPanes) {
    if (livePaneIds.size > 0 && !livePaneIds.has(pane.id)) continue;
    result.set(pane.id, pane);
  }
  for (const pane of discovered) {
    if (!result.has(pane.id)) result.set(pane.id, pane);
  }
  return [...result.values()];
}
