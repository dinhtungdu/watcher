import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { DaemonRequest, DaemonResponse } from './daemon.js';
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

export interface HookDeliveryDeps {
  send?: (request: DaemonRequest) => Promise<DaemonResponse>;
  startDaemon?: () => void;
  sleep?: (ms: number) => Promise<void>;
}

export function startDetachedDaemon(): void {
  const cliPath = process.argv[1];
  if (!cliPath) return;
  const child = spawn(process.execPath, [cliPath, 'daemon', '--detach'], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();
}

export async function deliverHookEvent(agent: string, event: string, paneId: string, payload: Record<string, unknown>, deps: HookDeliveryDeps = {}): Promise<boolean> {
  const request: DaemonRequest = { type: 'hook', event: { agent, event, paneId, payload } };
  const send = deps.send ?? ((daemonRequest) => sendDaemonRequest(daemonRequest, { timeoutMs: 300 }));
  const nap = deps.sleep ?? sleep;
  try {
    const response = await send(request);
    if (response.ok) return true;
  } catch {
    // absent daemon; try to bring it up below
  }
  try {
    (deps.startDaemon ?? startDetachedDaemon)();
  } catch {
    return false;
  }
  const retryDelays = [50, 100, 200, 300];
  for (const delay of retryDelays) {
    await nap(delay);
    try {
      const response = await send(request);
      if (response.ok) return true;
    } catch {
      // keep the retry loop bounded; hook shims are not a place to cosplay systemd.
    }
  }
  return false;
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
