import { AgentPane, TmuxTarget } from './model.js';
import type { AgentProcessInfo } from './agents/types.js';
import { detectAgentFromProcess, getAgentIntegration } from './agents/registry.js';
import { canonicalSurfaceKey, surfaceFromTarget } from './surfaceIdentity.js';
import { terminalTargetCommand, terminalTargetCwd, terminalTargetPid } from './terminalTarget.js';
import { CommandRunner, nodeCommandRunner } from './tmux.js';
import { captureTmuxPanePreview, listTmuxPanes } from './tmuxContext.js';
import { discoverGitMetadata } from './git.js';

export interface TerminalAgentObservation {
  tmuxAvailable: boolean;
  livePaneIds: Set<string>;
  liveAgentProcessPaneIds: Set<string>;
  discoveredPanes: AgentPane[];
}

async function psField(pid: string, field: string, runner: CommandRunner): Promise<string | undefined> {
  try {
    const value = (await runner.execFile('ps', ['-p', pid, '-o', `${field}=`], { timeout: 1000 })).stdout.trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

async function processInfo(pid: string | number | undefined, runner: CommandRunner): Promise<AgentProcessInfo | undefined> {
  if (!pid || Number.isNaN(Number(pid))) return undefined;
  const pidString = String(pid);
  const [command, args] = await Promise.all([
    psField(pidString, 'comm', runner),
    psField(pidString, 'args', runner),
  ]);
  if (!command && !args) return undefined;
  return { command, args };
}

function isProcessInfo(value: AgentProcessInfo | undefined): value is AgentProcessInfo {
  return Boolean(value);
}

async function childProcesses(parentPid: number | undefined, runner: CommandRunner): Promise<AgentProcessInfo[]> {
  if (!parentPid || Number.isNaN(parentPid)) return [];
  try {
    const pids = (await runner.execFile('pgrep', ['-P', String(parentPid)], { timeout: 1000 })).stdout.split(/\s+/).filter(Boolean);
    return (await Promise.all(pids.map((pid) => processInfo(pid, runner)))).filter(isProcessInfo);
  } catch {
    return [];
  }
}

export async function detectKnownAgent(pane: TmuxTarget, runner: CommandRunner = nodeCommandRunner): Promise<AgentPane['agentType'] | undefined> {
  const tmuxReported = detectAgentFromProcess({ command: terminalTargetCommand(pane) });
  if (tmuxReported) return tmuxReported;

  const paneProcess = await processInfo(terminalTargetPid(pane), runner);
  const directProcess = paneProcess ? detectAgentFromProcess(paneProcess) : undefined;
  if (directProcess) return directProcess;

  for (const childProcess of await childProcesses(terminalTargetPid(pane), runner)) {
    const child = detectAgentFromProcess(childProcess);
    if (child) return child;
  }
  return undefined;
}

export async function observeTerminalAgentPanes(runner: CommandRunner = nodeCommandRunner, now = Date.now()): Promise<TerminalAgentObservation> {
  let panes: TmuxTarget[];
  try {
    panes = await listTmuxPanes(runner);
  } catch {
    return { tmuxAvailable: false, livePaneIds: new Set(), liveAgentProcessPaneIds: new Set(), discoveredPanes: [] };
  }
  const discovered: AgentPane[] = [];
  for (const tmux of panes) {
    const agentType = await detectKnownAgent(tmux, runner);
    if (!agentType) continue;
    const cwd = terminalTargetCwd(tmux);
    const integration = getAgentIntegration(agentType);
    const waitsForEvents = integration.capabilities.eventSourceInstall === 'supported';
    const terminalPreview = await captureTmuxPanePreview(tmux.paneId, runner);
    discovered.push({
      id: canonicalSurfaceKey(surfaceFromTarget(tmux)),
      agentType,
      status: 'unknown',
      summary: waitsForEvents ? 'Waiting for first Watcher event' : `Detected ${agentType} process`,
      currentAction: 'tmux/process discovery fallback',
      observation: {
        source: 'terminal',
        semanticEvents: false,
        assistantDeltas: false,
        terminalPreview: Boolean(terminalPreview),
      },
      terminalPreview,
      target: tmux,
      cwd,
      git: await discoverGitMetadata(cwd, runner),
      updatedAt: now,
    });
  }
  return {
    tmuxAvailable: true,
    livePaneIds: new Set(panes.map((pane) => canonicalSurfaceKey(surfaceFromTarget(pane)))),
    liveAgentProcessPaneIds: new Set(discovered.map((pane) => pane.id)),
    discoveredPanes: discovered,
  };
}
