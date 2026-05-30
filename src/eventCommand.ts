import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import type { DaemonRequest, DaemonResponse } from './daemon.js';
import { sendDaemonRequest } from './ipc.js';
import { AgentEventValidationError, buildWatcherAgentEventInput, readJsonObject, WatcherAgentEventInput } from './agentEvents.js';

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export interface EventDeliveryDeps {
  send?: (request: DaemonRequest) => Promise<DaemonResponse>;
  startDaemon?: () => void;
  sleep?: (ms: number) => Promise<void>;
}

export interface EventCommandDeps extends EventDeliveryDeps {
  readInput?: () => Promise<string>;
  env?: NodeJS.ProcessEnv;
  stderr?: (message: string) => void;
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

export async function deliverAgentEvent(event: WatcherAgentEventInput, deps: EventDeliveryDeps = {}): Promise<boolean> {
  const request: DaemonRequest = { type: 'event', event };
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
      // keep the retry loop bounded; event shims are not a place to cosplay systemd.
    }
  }
  return false;
}

interface ParsedEventArgs {
  quiet: boolean;
  agent?: string;
  event?: string;
  validShape: boolean;
}

function parseEventArgs(args: string[]): ParsedEventArgs {
  if (args[0] === '--quiet') {
    return { quiet: true, agent: args[1], event: args[2], validShape: args.length === 3 };
  }
  return { quiet: false, agent: args[0], event: args[1], validShape: args.length === 2 };
}

function reportError(quiet: boolean, stderr: (message: string) => void, message: string): number {
  if (!quiet) stderr(`${message}\n`);
  return quiet ? 0 : 2;
}

export async function runEventCommand(args: string[], deps: EventCommandDeps = {}): Promise<number> {
  const parsed = parseEventArgs(args);
  const stderr = deps.stderr ?? ((message) => process.stderr.write(message));
  if (!parsed.validShape) {
    return reportError(parsed.quiet, stderr, 'Usage: watcher event [--quiet] <agent> <event>');
  }

  let payload: Record<string, unknown>;
  try {
    payload = readJsonObject(await (deps.readInput ?? readStdin)());
  } catch (error) {
    return reportError(parsed.quiet, stderr, error instanceof Error ? error.message : String(error));
  }

  let event: WatcherAgentEventInput;
  try {
    const env = deps.env ?? process.env;
    event = buildWatcherAgentEventInput(parsed.agent, parsed.event, payload, { fallbackTmuxPaneId: env.TMUX_PANE });
  } catch (error) {
    if (error instanceof AgentEventValidationError) return reportError(parsed.quiet, stderr, error.message);
    return reportError(parsed.quiet, stderr, error instanceof Error ? error.message : String(error));
  }

  try {
    await deliverAgentEvent(event, deps);
  } catch {
    // Agent Event Sources must never break the agent. Fail open like a polite little gremlin.
  }
  return 0;
}
