import { AgentActivityItem, AgentPane, AgentStatus, GitMetadata, ObservationCapability, TerminalTarget } from './model.js';
import { WatcherAgentEventInput, WatcherAgentEventPayload } from './agentEvents.js';
import { canonicalSurfaceKey } from './surfaceIdentity.js';

export interface AgentEventContext {
  target: TerminalTarget;
  cwd?: string;
  git?: GitMetadata;
  now: number;
}

export function mapAgentEventToStatus(type: WatcherAgentEventInput['type']): AgentStatus {
  switch (type) {
    case 'session-started':
      return 'unknown';
    case 'agent-started':
      return 'working';
    case 'user-message':
    case 'assistant-delta':
    case 'assistant-message':
    case 'tool-started':
    case 'tool-updated':
    case 'tool-finished':
      return 'working';
    case 'needs-input':
    case 'error':
      return 'needs_input';
    case 'agent-finished':
      return 'idle';
  }
}

function summarize(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const oneLine = value.replace(/\s+/g, ' ').trim();
  return oneLine.length > 140 ? `${oneLine.slice(0, 139)}…` : oneLine;
}

function isPlaceholderSummary(value: string | undefined): boolean {
  return !value
    || value === 'Waiting for first task'
    || value === 'Finished'
    || value.startsWith('Detected ');
}

function eventObservation(previous: AgentPane | undefined, type: WatcherAgentEventInput['type']): ObservationCapability {
  const terminalPreview = previous?.observation?.terminalPreview ?? false;
  const assistantDeltas = (previous?.observation?.assistantDeltas ?? false) || type === 'assistant-delta';
  return {
    source: terminalPreview ? 'mixed' : 'event-source',
    semanticEvents: true,
    assistantDeltas,
    terminalPreview,
  };
}

function basePane(previous: AgentPane | undefined, input: WatcherAgentEventInput, context: AgentEventContext, status: AgentStatus): AgentPane {
  return {
    ...previous,
    id: canonicalSurfaceKey(input.surface),
    agentType: input.agent,
    status,
    reportedStatus: status === 'stalled' ? 'working' : status,
    summary: previous?.summary ?? 'Waiting for first task',
    target: context.target,
    cwd: context.cwd,
    git: context.git,
    updatedAt: input.now ?? context.now,
    observation: eventObservation(previous, input.type),
  };
}

function assistantActivityId(payload: WatcherAgentEventPayload): string {
  return `assistant:${payload.messageId ?? 'current'}`;
}

function toolActivityId(payload: WatcherAgentEventPayload): string | undefined {
  return payload.id ? `tool:${payload.id}` : undefined;
}

function mergeActivityItems(previous: AgentActivityItem[] | undefined, updates: AgentActivityItem[], maxItems = 3): AgentActivityItem[] | undefined {
  if (!previous?.length && updates.length === 0) return undefined;
  const byId = new Map<string, AgentActivityItem>();
  for (const item of previous ?? []) byId.set(item.id, item);
  for (const item of updates) {
    const existing = byId.get(item.id);
    byId.set(item.id, existing ? { ...existing, ...item } : item);
  }
  const items = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, maxItems);
  return items.length > 0 ? items : undefined;
}

function summaryAfterNonUserEvent(previous: AgentPane | undefined, fallbackText: string | undefined, fallbackSummary: string): string {
  if (previous?.userMessage) return previous.summary;
  if (previous?.summary && !isPlaceholderSummary(previous.summary) && !fallbackText) return previous.summary;
  return summarize(fallbackText, fallbackSummary);
}

function nonEmpty(value: string | undefined): string | undefined {
  return value?.trim() ? value : undefined;
}

function finalAssistantMessage(previous: AgentPane | undefined, payload: WatcherAgentEventPayload): string | undefined {
  return nonEmpty(payload.finalMessage) ?? nonEmpty(previous?.pendingAssistantMessage) ?? nonEmpty(previous?.lastMessage);
}

export function applyAgentEvent(previous: AgentPane | undefined, input: WatcherAgentEventInput, context: AgentEventContext): AgentPane {
  const now = input.now ?? context.now;
  const status = mapAgentEventToStatus(input.type);
  const pane = basePane(previous, input, context, status);
  const payload = input.payload;

  if (previous?.status === 'idle') {
    if (input.type === 'assistant-message') {
      const text = payload.text!;
      return {
        ...pane,
        status: 'idle',
        reportedStatus: 'idle',
        summary: previous.summary,
        userMessage: previous.userMessage,
        lastMessage: text,
        pendingAssistantMessage: undefined,
        activityItems: undefined,
        currentAction: undefined,
      };
    }
    if (input.type !== 'session-started' && input.type !== 'agent-started' && input.type !== 'user-message' && input.type !== 'needs-input' && input.type !== 'error') {
      return {
        ...pane,
        status: 'idle',
        reportedStatus: 'idle',
        summary: previous.summary,
        userMessage: previous.userMessage,
        lastMessage: previous.lastMessage,
        pendingAssistantMessage: undefined,
        activityItems: undefined,
        currentAction: undefined,
      };
    }
  }

  switch (input.type) {
    case 'session-started':
      return {
        ...pane,
        summary: 'Waiting for first task',
        userMessage: undefined,
        lastMessage: undefined,
        pendingAssistantMessage: undefined,
        activityItems: undefined,
        currentAction: undefined,
      };

    case 'agent-started':
      return {
        ...pane,
        summary: previous?.summary ?? 'Working',
        userMessage: previous?.userMessage,
        lastMessage: undefined,
        pendingAssistantMessage: undefined,
        activityItems: undefined,
        currentAction: 'Working',
      };

    case 'user-message': {
      const text = payload.text!;
      return {
        ...pane,
        summary: summarize(text, 'User message'),
        userMessage: text,
        lastMessage: undefined,
        pendingAssistantMessage: undefined,
        activityItems: undefined,
        currentAction: undefined,
      };
    }

    case 'assistant-delta': {
      const text = payload.text!;
      return {
        ...pane,
        summary: summaryAfterNonUserEvent(previous, text, 'Responding'),
        userMessage: previous?.userMessage,
        lastMessage: previous?.lastMessage,
        pendingAssistantMessage: previous?.pendingAssistantMessage,
        currentAction: 'Responding',
        activityItems: mergeActivityItems(previous?.activityItems, [{
          id: assistantActivityId(payload),
          kind: 'assistant',
          label: 'assistant',
          text,
          state: 'running',
          updatedAt: now,
        }]),
      };
    }

    case 'assistant-message': {
      const text = payload.text!;
      return {
        ...pane,
        summary: summaryAfterNonUserEvent(previous, text, 'Assistant message'),
        userMessage: previous?.userMessage,
        lastMessage: previous?.lastMessage,
        pendingAssistantMessage: text,
        currentAction: undefined,
        activityItems: mergeActivityItems(previous?.activityItems, [{
          id: assistantActivityId(payload),
          kind: 'assistant',
          label: 'assistant',
          text,
          state: 'done',
          updatedAt: now,
        }]),
      };
    }

    case 'tool-started': {
      const name = payload.name!;
      return {
        ...pane,
        summary: previous?.userMessage ? previous.summary : summarize(`Running ${name}`, `Running ${name}`),
        userMessage: previous?.userMessage,
        lastMessage: previous?.lastMessage,
        pendingAssistantMessage: previous?.pendingAssistantMessage,
        currentAction: name,
        activityItems: mergeActivityItems(previous?.activityItems, [{
          id: toolActivityId(payload)!,
          kind: 'tool',
          label: name,
          text: payload.input,
          state: 'running',
          updatedAt: now,
        }]),
      };
    }

    case 'tool-updated': {
      const activityId = toolActivityId(payload)!;
      const previousItem = previous?.activityItems?.find((item) => item.id === activityId);
      const name = payload.name ?? previousItem?.label ?? previous?.currentAction ?? 'tool';
      return {
        ...pane,
        summary: previous?.userMessage ? previous.summary : (previous?.summary ?? `Running ${name}`),
        userMessage: previous?.userMessage,
        lastMessage: previous?.lastMessage,
        pendingAssistantMessage: previous?.pendingAssistantMessage,
        currentAction: name,
        activityItems: mergeActivityItems(previous?.activityItems, [{
          id: activityId,
          kind: 'tool',
          label: name,
          text: payload.text ?? previousItem?.text,
          state: 'running',
          updatedAt: now,
        }]),
      };
    }

    case 'tool-finished': {
      const activityId = toolActivityId(payload)!;
      const previousItem = previous?.activityItems?.find((item) => item.id === activityId);
      const name = payload.name ?? previousItem?.label ?? 'tool';
      return {
        ...pane,
        summary: previous?.userMessage ? previous.summary : (previous?.summary ?? `Finished ${name}`),
        userMessage: previous?.userMessage,
        lastMessage: previous?.lastMessage,
        pendingAssistantMessage: previous?.pendingAssistantMessage,
        currentAction: undefined,
        activityItems: mergeActivityItems(previous?.activityItems, [{
          id: activityId,
          kind: 'tool',
          label: name,
          text: payload.output ?? previousItem?.text,
          state: payload.error ? 'error' : 'done',
          updatedAt: now,
        }]),
      };
    }

    case 'needs-input': {
      const activityId = toolActivityId(payload);
      const previousItem = activityId ? previous?.activityItems?.find((item) => item.id === activityId) : undefined;
      const updates: AgentActivityItem[] = activityId ? [{
        id: activityId,
        kind: 'tool',
        label: payload.name ?? previousItem?.label ?? 'tool',
        text: payload.text ?? payload.reason ?? previousItem?.text,
        state: 'waiting',
        updatedAt: now,
      }] : [];
      const currentAction = payload.text ?? payload.reason ?? 'Needs input';
      return {
        ...pane,
        summary: previous?.userMessage ? previous.summary : summarize(currentAction, 'Needs input'),
        userMessage: previous?.userMessage,
        lastMessage: previous?.lastMessage,
        pendingAssistantMessage: previous?.pendingAssistantMessage,
        currentAction,
        activityItems: mergeActivityItems(previous?.activityItems, updates),
      };
    }

    case 'error': {
      const currentAction = payload.reason ?? 'error';
      return {
        ...pane,
        summary: previous?.userMessage ? previous.summary : summarize(currentAction, 'error'),
        userMessage: previous?.userMessage,
        lastMessage: previous?.lastMessage,
        pendingAssistantMessage: previous?.pendingAssistantMessage,
        currentAction,
        activityItems: previous?.activityItems,
      };
    }

    case 'agent-finished': {
      const finalMessage = finalAssistantMessage(previous, payload);
      return {
        ...pane,
        summary: previous?.userMessage
          ? previous.summary
          : previous?.summary && !isPlaceholderSummary(previous.summary)
            ? previous.summary
            : summarize(finalMessage, 'Finished'),
        userMessage: previous?.userMessage,
        lastMessage: finalMessage,
        pendingAssistantMessage: undefined,
        activityItems: undefined,
        currentAction: undefined,
      };
    }
  }
}
