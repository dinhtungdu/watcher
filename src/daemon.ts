import net from 'node:net';
import fs from 'node:fs/promises';
import { AgentPane, SwitcherSnapshot } from './model.js';
import { WatcherAgentEventInput } from './agentEvents.js';
import { applyAgentEvent } from './agentEventReducer.js';
import { CommandRunner, hasTmuxServer, nodeCommandRunner } from './tmux.js';
import { getTmuxPane } from './tmuxContext.js';
import { terminalTargetCwd } from './terminalTarget.js';
import { discoverGitMetadata } from './git.js';
import { canonicalSurfaceKey } from './surfaceIdentity.js';

export type DaemonRequest =
  | { type: 'event'; event: WatcherAgentEventInput }
  | { type: 'snapshot' };

export type DaemonResponse =
  | { ok: true; snapshot?: SwitcherSnapshot }
  | { ok: false; error: string };

export class SnapshotStore {
  private panes = new Map<string, AgentPane>();

  async recordAgentEvent(event: WatcherAgentEventInput, runner: CommandRunner = nodeCommandRunner): Promise<AgentPane> {
    const target = await getTmuxPane(event.surface.id, runner);
    const cwd = event.payload.cwd ?? terminalTargetCwd(target);
    const git = await discoverGitMetadata(cwd, runner);
    const key = canonicalSurfaceKey(event.surface);
    const previous = this.panes.get(key);
    const pane = applyAgentEvent(previous, event, { target, cwd, git, now: event.now ?? Date.now() });
    this.panes.set(pane.id, pane);
    return pane;
  }

  snapshot(tmuxAvailable = true, now = Date.now()): SwitcherSnapshot {
    return {
      panes: [...this.panes.values()],
      daemonAvailable: true,
      tmuxAvailable,
      now,
    };
  }
}

export interface DaemonOptions {
  socketPath: string;
  runner?: CommandRunner;
  store?: SnapshotStore;
}

export async function startDaemon(options: DaemonOptions): Promise<net.Server> {
  const runner = options.runner ?? nodeCommandRunner;
  const store = options.store ?? new SnapshotStore();
  await fs.rm(options.socketPath, { force: true }).catch(() => undefined);
  const server = net.createServer((socket) => {
    let body = '';
    let handled = false;
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      body += chunk;
      if (!handled && body.includes('\n')) {
        handled = true;
        const [line] = body.split('\n');
        void handleRequest(line ?? body, store, runner).then((response) => {
          socket.end(`${JSON.stringify(response)}\n`);
        });
      }
    });
    socket.on('end', () => {
      if (handled) return;
      handled = true;
      void handleRequest(body, store, runner).then((response) => {
        socket.end(`${JSON.stringify(response)}\n`);
      });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.socketPath, () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server;
}

async function handleRequest(body: string, store: SnapshotStore, runner: CommandRunner): Promise<DaemonResponse> {
  try {
    const request = JSON.parse(body) as DaemonRequest;
    if (request.type === 'event') {
      await store.recordAgentEvent(request.event, runner);
      return { ok: true };
    }
    if (request.type === 'snapshot') {
      const tmuxAvailable = await hasTmuxServer(runner);
      return { ok: true, snapshot: store.snapshot(tmuxAvailable) };
    }
    return { ok: false, error: 'unknown request type' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
