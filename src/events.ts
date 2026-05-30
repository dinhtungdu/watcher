import { AgentPane, AgentStatus } from './model.js';
import { CommandRunner, nodeCommandRunner } from './tmux.js';
import { getTmuxPane } from './tmuxContext.js';
import { discoverGitMetadata } from './git.js';
import { terminalTargetCwd } from './terminalTarget.js';

export interface HookEventInput {
  agent: string;
  event: string;
  paneId: string;
  payload: Record<string, unknown>;
  now?: number;
}

export function mapEventToStatus(event: string): AgentStatus {
  switch (event) {
    case 'session-start':
      return 'unknown';
    case 'prompt-submit':
    case 'agent-start':
      return 'working';
    case 'needs-input':
    case 'permission':
    case 'question':
      return 'needs_input';
    case 'stop':
    case 'agent-end':
      return 'idle';
    case 'error':
      return 'needs_input';
    default:
      return 'unknown';
  }
}

function payloadString(payload: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function summarize(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const oneLine = value.replace(/\s+/g, ' ').trim();
  return oneLine.length > 140 ? `${oneLine.slice(0, 139)}…` : oneLine;
}

export async function normalizeHookEvent(input: HookEventInput, runner: CommandRunner = nodeCommandRunner): Promise<AgentPane> {
  const status = mapEventToStatus(input.event);
  const tmux = await getTmuxPane(input.paneId, runner);
  const cwd = payloadString(input.payload, ['cwd']) ?? terminalTargetCwd(tmux);
  const git = await discoverGitMetadata(cwd, runner);
  const prompt = payloadString(input.payload, ['prompt', 'message', 'summary']);
  const lastMessage = payloadString(input.payload, ['lastAssistantMessage', 'last_message', 'lastMessage']);
  const action = input.event === 'error'
    ? payloadString(input.payload, ['reason', 'error']) ?? 'error'
    : payloadString(input.payload, ['currentAction', 'action', 'tool']);
  const summary = status === 'idle'
    ? summarize(lastMessage ?? prompt, 'Finished')
    : summarize(prompt ?? action ?? lastMessage, status === 'unknown' ? 'Known agent pane' : input.event.replaceAll('-', ' '));
  return {
    id: input.paneId,
    agentType: input.agent,
    status,
    reportedStatus: status === 'stalled' ? 'working' : status,
    summary,
    userMessage: prompt,
    currentAction: action,
    lastMessage,
    target: tmux,
    cwd,
    git,
    updatedAt: input.now ?? Date.now(),
  };
}
