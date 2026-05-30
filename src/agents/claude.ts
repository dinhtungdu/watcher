import { AgentIntegration, commandAliasDetector } from './types.js';

const commandAliases = ['claude', 'claude-code'];

export const claudeIntegration: AgentIntegration = {
  type: 'claude',
  displayName: 'Claude',
  commandAliases,
  capabilities: {
    eventIngestion: 'supported',
    eventSourceInstall: 'not-implemented',
    activityEvents: 'unknown',
    assistantDeltas: 'unknown',
  },
  detectProcess: commandAliasDetector(commandAliases),
};
