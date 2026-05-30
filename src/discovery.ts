import { AgentPane, TmuxTarget } from './model.js';
import { detectAgentFromProcess, getAgentIntegration } from './agents/registry.js';
import { canonicalSurfaceKey, surfaceFromTarget } from './surfaceIdentity.js';
import { normalizeAgentPaneTarget, terminalTargetCommand, terminalTargetCwd, terminalTargetPid } from './terminalTarget.js';
import { CommandRunner, nodeCommandRunner } from './tmux.js';
import { captureTmuxPanePreview, listTmuxPanes } from './tmuxContext.js';
import { discoverGitMetadata } from './git.js';

export interface DiscoveryResult {
  tmuxAvailable: boolean;
  paneIds: Set<string>;
  agentPaneIds: Set<string>;
  panes: AgentPane[];
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

export async function detectKnownAgent(pane: TmuxTarget, runner: CommandRunner = nodeCommandRunner): Promise<AgentPane['agentType'] | undefined> {
  const direct = detectAgentFromProcess({ command: terminalTargetCommand(pane) });
  if (direct) return direct;
  for (const command of await childProcessCommands(terminalTargetPid(pane), runner)) {
    const child = detectAgentFromProcess({ command });
    if (child) return child;
  }
  return undefined;
}

export async function discoverUnintegratedPanes(runner: CommandRunner = nodeCommandRunner, now = Date.now()): Promise<DiscoveryResult> {
  let panes: TmuxTarget[];
  try {
    panes = await listTmuxPanes(runner);
  } catch {
    return { tmuxAvailable: false, paneIds: new Set(), agentPaneIds: new Set(), panes: [] };
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
    paneIds: new Set(panes.map((pane) => canonicalSurfaceKey(surfaceFromTarget(pane)))),
    agentPaneIds: new Set(discovered.map((pane) => pane.id)),
    panes: discovered,
  };
}

export function mergeDaemonAndDiscovered(
  daemonPanes: AgentPane[],
  discovered: AgentPane[],
  livePaneIds: Set<string>,
  tmuxAvailable: boolean,
  liveAgentPaneIds: Set<string> = new Set(discovered.map((pane) => pane.id)),
): AgentPane[] {
  const result = new Map<string, AgentPane>();
  for (const pane of daemonPanes) {
    const normalized = normalizeAgentPaneTarget(pane);
    if (!normalized) continue;
    if (tmuxAvailable && !livePaneIds.has(normalized.id)) continue;
    if (tmuxAvailable && normalized.status === 'idle' && !liveAgentPaneIds.has(normalized.id)) continue;
    result.set(normalized.id, normalized);
  }
  for (const pane of discovered) {
    const normalized = normalizeAgentPaneTarget(pane);
    if (normalized && !result.has(normalized.id)) result.set(normalized.id, normalized);
  }
  return [...result.values()];
}
