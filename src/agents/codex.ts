import { AgentIntegration, commandAliasDetector } from './types.js';

const commandAliases = ['codex'];

export const codexIntegration: AgentIntegration = {
  type: 'codex',
  displayName: 'Codex',
  commandAliases,
  capabilities: {
    eventIngestion: 'supported',
    eventSourceInstall: 'not-implemented',
    activityEvents: 'not-implemented',
    assistantDeltas: 'unknown',
  },
  detectProcess: commandAliasDetector(commandAliases),
};
