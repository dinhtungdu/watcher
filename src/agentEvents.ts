import path from 'node:path';
import type { AgentType } from './model.js';
import { isAgentType } from './agents/registry.js';
import { EventSurfaceIdentity, tmuxSurface } from './surfaceIdentity.js';

export const MAX_EVENT_TEXT = 16_000;

export const WATCHER_AGENT_EVENT_TYPES = [
  'session-started',
  'agent-started',
  'user-message',
  'assistant-delta',
  'assistant-message',
  'tool-started',
  'tool-updated',
  'tool-finished',
  'needs-input',
  'agent-finished',
  'error',
] as const;

export type WatcherAgentEventType = typeof WATCHER_AGENT_EVENT_TYPES[number];

export interface WatcherAgentEventPayload {
  cwd?: string;
  reason?: string;
  text?: string;
  messageId?: string;
  finalMessage?: string;
  id?: string;
  name?: string;
  input?: string;
  output?: string;
  error?: boolean;
}

export interface WatcherAgentEventInput {
  agent: AgentType;
  type: WatcherAgentEventType;
  surface: EventSurfaceIdentity;
  payload: WatcherAgentEventPayload;
  now?: number;
}

export class AgentEventValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentEventValidationError';
  }
}

export function isWatcherAgentEventType(value: string): value is WatcherAgentEventType {
  return WATCHER_AGENT_EVENT_TYPES.includes(value as WatcherAgentEventType);
}

export function readJsonObject(input: string): Record<string, unknown> {
  if (!input.trim()) return {};
  const parsed = JSON.parse(input) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AgentEventValidationError('event payload must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function requireString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new AgentEventValidationError(`event payload requires non-empty string field: ${key}`);
  }
  return capEventText(value.trim());
}

function optionalString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new AgentEventValidationError(`event payload field must be a string: ${key}`);
  const text = value.trim();
  return text ? capEventText(text) : undefined;
}

function optionalBoolean(payload: Record<string, unknown>, key: string): boolean | undefined {
  const value = payload[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') throw new AgentEventValidationError(`event payload field must be a boolean: ${key}`);
  return value;
}

export function capEventText(value: string): string {
  return value.length > MAX_EVENT_TEXT ? `${value.slice(0, MAX_EVENT_TEXT - 1)}…` : value;
}

export function compactEventValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  let text: string;
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  text = (text ?? '').replace(/\s+/g, ' ').trim();
  return text ? capEventText(text) : undefined;
}

function optionalCompactValue(payload: Record<string, unknown>, key: string): string | undefined {
  if (!(key in payload)) return undefined;
  return compactEventValue(payload[key]);
}

function optionalCwd(payload: Record<string, unknown>): string | undefined {
  const cwd = optionalString(payload, 'cwd');
  return cwd && path.isAbsolute(cwd) ? cwd : undefined;
}

function parseSurface(value: unknown): EventSurfaceIdentity | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.backend !== 'tmux') throw new AgentEventValidationError('event surface backend must be tmux');
  if (typeof record.id !== 'string' || !record.id.trim()) throw new AgentEventValidationError('event surface requires non-empty id');
  return { backend: 'tmux', id: record.id.trim() };
}

export function resolveEventSurface(payload: Record<string, unknown>, fallbackTmuxPaneId?: string): EventSurfaceIdentity {
  const explicit = parseSurface(payload.surface);
  if (explicit) return explicit;
  if (fallbackTmuxPaneId?.trim()) return tmuxSurface(fallbackTmuxPaneId.trim());
  throw new AgentEventValidationError('event requires surface identity or TMUX_PANE fallback');
}

export function normalizeWatcherAgentEventPayload(type: WatcherAgentEventType, payload: Record<string, unknown>): WatcherAgentEventPayload {
  const common: WatcherAgentEventPayload = { cwd: optionalCwd(payload) };
  switch (type) {
    case 'session-started':
      return { ...common, reason: optionalString(payload, 'reason') };
    case 'agent-started':
      return common;
    case 'user-message':
      return { ...common, text: requireString(payload, 'text') };
    case 'assistant-delta':
    case 'assistant-message':
      return { ...common, messageId: optionalString(payload, 'messageId'), text: requireString(payload, 'text') };
    case 'tool-started':
      return { ...common, id: requireString(payload, 'id'), name: requireString(payload, 'name'), input: optionalCompactValue(payload, 'input') };
    case 'tool-updated':
      return { ...common, id: requireString(payload, 'id'), name: optionalString(payload, 'name'), text: optionalString(payload, 'text') };
    case 'tool-finished':
      return {
        ...common,
        id: requireString(payload, 'id'),
        name: optionalString(payload, 'name'),
        output: optionalCompactValue(payload, 'output'),
        error: optionalBoolean(payload, 'error'),
      };
    case 'needs-input':
      return {
        ...common,
        reason: optionalString(payload, 'reason'),
        text: optionalString(payload, 'text'),
        id: optionalString(payload, 'id'),
        name: optionalString(payload, 'name'),
      };
    case 'agent-finished':
      return { ...common, finalMessage: optionalString(payload, 'finalMessage') };
    case 'error':
      return { ...common, reason: optionalString(payload, 'reason') };
  }
}

export interface BuildWatcherAgentEventOptions {
  fallbackTmuxPaneId?: string;
  now?: number;
}

export function buildWatcherAgentEventInput(
  agent: string | undefined,
  type: string | undefined,
  payload: Record<string, unknown>,
  options: BuildWatcherAgentEventOptions = {},
): WatcherAgentEventInput {
  if (!agent || !isAgentType(agent)) throw new AgentEventValidationError(`unknown agent integration: ${agent ?? '(missing)'}`);
  if (!type || !isWatcherAgentEventType(type)) throw new AgentEventValidationError(`unknown Watcher Agent Event: ${type ?? '(missing)'}`);
  return {
    agent,
    type,
    surface: resolveEventSurface(payload, options.fallbackTmuxPaneId),
    payload: normalizeWatcherAgentEventPayload(type, payload),
    now: options.now,
  };
}
