export type AgentStatus = 'working' | 'needs_input' | 'stalled' | 'unknown' | 'idle';

export type TerminalBackend = 'tmux';

export interface BaseTerminalTarget {
  backend: TerminalBackend;
  id: string;
  cwd?: string;
  title?: string;
  pid?: number;
  currentCommand?: string;
}

export interface TmuxTarget extends BaseTerminalTarget {
  backend: 'tmux';
  paneId: string;
  sessionName?: string;
  windowIndex?: string;
  paneIndex?: string;
  paneCurrentPath?: string;
  panePid?: number;
  paneCurrentCommand?: string;
  windowName?: string;
  paneTitle?: string;
}

export type TerminalTarget = TmuxTarget;

export interface GitMetadata {
  repo: string;
  branch: string;
  worktreePath: string;
}

export interface AgentActivityItem {
  id: string;
  kind: 'assistant' | 'tool';
  label: string;
  text?: string;
  state?: 'running' | 'done' | 'error';
  updatedAt: number;
}

export interface AgentPane {
  id: string;
  agentType: string;
  status: AgentStatus;
  summary: string;
  userMessage?: string;
  currentAction?: string;
  lastMessage?: string;
  activityItems?: AgentActivityItem[];
  target: TerminalTarget;
  cwd?: string;
  git?: GitMetadata;
  updatedAt: number;
  reportedStatus?: Exclude<AgentStatus, 'stalled'>;
  outputHash?: string;
  outputChangedAt?: number;
}

export interface SwitcherSnapshot {
  panes: AgentPane[];
  daemonAvailable: boolean;
  tmuxAvailable: boolean;
  message?: string;
  now?: number;
}

export const RUNNING_AGENT_STATUSES: AgentStatus[] = ['needs_input', 'stalled', 'working', 'unknown', 'idle'];

export const STATUS_RANK: Record<AgentStatus, number> = {
  needs_input: 0,
  stalled: 1,
  working: 2,
  unknown: 3,
  idle: 4,
};

export function isRunningAgentStatus(status: AgentStatus): boolean {
  return RUNNING_AGENT_STATUSES.includes(status);
}
