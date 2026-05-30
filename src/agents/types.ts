import type { AgentType } from '../model.js';

export type CapabilitySupport = 'supported' | 'not-implemented' | 'unsupported' | 'unknown';

export interface AgentIntegrationCapabilities {
  eventIngestion: CapabilitySupport;
  eventSourceInstall: CapabilitySupport;
  activityEvents: CapabilitySupport;
  assistantDeltas: CapabilitySupport;
}

export interface AgentProcessInfo {
  command?: string;
  args?: string;
}

export interface AgentIntegration {
  type: AgentType;
  displayName: string;
  commandAliases: string[];
  capabilities: AgentIntegrationCapabilities;
  detectProcess(process: AgentProcessInfo): boolean;
}

export function commandAliasDetector(commandAliases: string[]): (process: AgentProcessInfo) => boolean {
  const aliases = new Set(commandAliases);
  return (process) => Boolean(process.command && aliases.has(process.command));
}
