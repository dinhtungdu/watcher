import { AgentIntegration, commandAliasDetector } from './types.js';

const commandAliases = ['opencode'];

export const opencodeIntegration: AgentIntegration = {
  type: 'opencode',
  displayName: 'OpenCode',
  commandAliases,
  capabilities: {
    eventIngestion: 'supported',
    eventSourceInstall: 'not-implemented',
    activityEvents: 'not-implemented',
    assistantDeltas: 'not-implemented',
  },
  detectProcess: commandAliasDetector(commandAliases),
};
