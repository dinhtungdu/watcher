import { AgentIntegration, commandAliasDetector } from './types.js';

const commandAliases = ['aider'];

export const aiderIntegration: AgentIntegration = {
  type: 'aider',
  displayName: 'Aider',
  commandAliases,
  capabilities: {
    eventIngestion: 'supported',
    eventSourceInstall: 'not-implemented',
    activityEvents: 'unknown',
    assistantDeltas: 'unknown',
  },
  detectProcess: commandAliasDetector(commandAliases),
};
