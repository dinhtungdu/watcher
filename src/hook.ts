import { sendDaemonRequest } from './ipc.js';

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function parseHookPayload(input: string): Record<string, unknown> {
  if (!input.trim()) return {};
  const parsed = JSON.parse(input) as unknown;
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
}

export async function deliverHookEvent(agent: string, event: string, paneId: string, payload: Record<string, unknown>): Promise<boolean> {
  const response = await sendDaemonRequest({ type: 'hook', event: { agent, event, paneId, payload } });
  return response.ok;
}

export async function runHookCommand(args: string[]): Promise<number> {
  const [agent, event] = args;
  if (!agent || !event) return 2;
  const paneId = process.env.TMUX_PANE;
  if (!paneId) return 0;
  let payload: Record<string, unknown> = {};
  try {
    payload = parseHookPayload(await readStdin());
  } catch {
    payload = {};
  }
  try {
    await deliverHookEvent(agent, event, paneId, payload);
  } catch {
    // Hooks must never break the agent. Auto-start arrives in issue #3; for now fail open.
  }
  return 0;
}
