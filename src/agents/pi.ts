import { AgentIntegration, commandAliasDetector } from './types.js';

const commandAliases = ['pi'];

export const piIntegration: AgentIntegration = {
  type: 'pi',
  displayName: 'Pi',
  commandAliases,
  capabilities: {
    eventIngestion: 'supported',
    eventSourceInstall: 'supported',
    activityEvents: 'supported',
    assistantDeltas: 'not-implemented',
  },
  detectProcess: commandAliasDetector(commandAliases),
};
