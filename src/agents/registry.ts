import path from 'node:path';
import type { AgentType } from '../model.js';
import type { AgentIntegration, AgentProcessInfo } from './types.js';
import { aiderIntegration } from './aider.js';
import { claudeIntegration } from './claude.js';
import { codexIntegration } from './codex.js';
import { opencodeIntegration } from './opencode.js';
import { piIntegration } from './pi.js';

export const AGENT_INTEGRATIONS = [
  piIntegration,
  claudeIntegration,
  codexIntegration,
  opencodeIntegration,
  aiderIntegration,
] as const satisfies readonly AgentIntegration[];

export const AGENT_TYPES = AGENT_INTEGRATIONS.map((integration) => integration.type) as AgentType[];

export function isAgentType(value: string): value is AgentType {
  return AGENT_TYPES.includes(value as AgentType);
}

export function getAgentIntegration(agent: AgentType): AgentIntegration {
  const integration = AGENT_INTEGRATIONS.find((candidate) => candidate.type === agent);
  if (!integration) throw new Error(`unknown agent integration: ${agent}`);
  return integration;
}

export function normalizeAgentCommand(command: string | undefined): string | undefined {
  if (!command) return undefined;
  const base = path.basename(command).toLowerCase();
  return base.replace(/\.(js|mjs|cjs|ts|tsx)$/u, '');
}

export function detectAgentFromProcess(process: AgentProcessInfo): AgentType | undefined {
  const normalized: AgentProcessInfo = {
    ...process,
    command: normalizeAgentCommand(process.command),
  };
  return AGENT_INTEGRATIONS.find((integration) => integration.detectProcess(normalized))?.type;
}

export function commandAliasCollisions(): string[] {
  const seen = new Map<string, AgentType>();
  const collisions: string[] = [];
  for (const integration of AGENT_INTEGRATIONS) {
    for (const alias of integration.commandAliases) {
      const normalized = normalizeAgentCommand(alias) ?? alias;
      const previous = seen.get(normalized);
      if (previous && previous !== integration.type) collisions.push(`${normalized}:${previous}/${integration.type}`);
      seen.set(normalized, integration.type);
    }
  }
  return collisions;
}
