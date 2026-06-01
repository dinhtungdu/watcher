import path from 'node:path';
import type { AgentType } from '../model.js';
import type { AgentIntegration, AgentProcessInfo } from './types.js';
import { claudeIntegration } from './claude.js';
import { codexIntegration } from './codex.js';
import { opencodeIntegration } from './opencode.js';
import { piIntegration } from './pi.js';

export const AGENT_INTEGRATIONS = [
  piIntegration,
  claudeIntegration,
  codexIntegration,
  opencodeIntegration,
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

const JAVASCRIPT_INTERPRETERS = new Set(['node', 'bun', 'deno']);
const INTERPRETER_OPTIONS_WITH_VALUE = new Set([
  '-e',
  '-p',
  '-r',
  '--eval',
  '--experimental-loader',
  '--import',
  '--inspect-port',
  '--loader',
  '--max-old-space-size',
  '--max-semi-space-size',
  '--print',
  '--require',
  '--title',
]);

function processArgTokens(args: string | undefined): string[] {
  return args?.trim().split(/\s+/u).filter(Boolean) ?? [];
}

function uniqueCommands(commands: Array<string | undefined>): string[] {
  const unique: string[] = [];
  for (const command of commands) {
    if (command && !unique.includes(command)) unique.push(command);
  }
  return unique;
}

function interpreterScriptCommand(tokens: string[]): string | undefined {
  if (!JAVASCRIPT_INTERPRETERS.has(normalizeAgentCommand(tokens[0]) ?? '')) return undefined;
  for (let index = 1; index < tokens.length; index++) {
    const token = tokens[index];
    if (!token) continue;
    if (token === '--') return tokens[index + 1];
    const optionName = token.split('=', 1)[0];
    if (optionName && INTERPRETER_OPTIONS_WITH_VALUE.has(optionName)) {
      if (!token.includes('=')) index++;
      continue;
    }
    if (token.startsWith('-')) continue;
    return token;
  }
  return undefined;
}

function processCommandCandidates(process: AgentProcessInfo): string[] {
  const tokens = processArgTokens(process.args);
  return uniqueCommands([
    process.command,
    tokens[0],
    interpreterScriptCommand(tokens),
  ]);
}

function detectAgentFromCommandCandidate(command: string, args: string | undefined): AgentType | undefined {
  const normalizedCommand = normalizeAgentCommand(command);
  return AGENT_INTEGRATIONS.find((candidate) => candidate.detectProcess({ command: normalizedCommand, args }))?.type;
}

export function detectAgentFromProcess(process: AgentProcessInfo): AgentType | undefined {
  for (const command of processCommandCandidates(process)) {
    const agent = detectAgentFromCommandCandidate(command, process.args);
    if (agent) return agent;
  }
  return undefined;
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
