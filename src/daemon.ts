import net from 'node:net';
import fs from 'node:fs/promises';
import { AgentPane, SwitcherSnapshot } from './model.js';
import { normalizeHookEvent, HookEventInput } from './events.js';
import { CommandRunner, hasTmuxServer, nodeCommandRunner } from './tmux.js';

export type DaemonRequest =
  | { type: 'hook'; event: HookEventInput }
  | { type: 'snapshot' };

export type DaemonResponse =
  | { ok: true; snapshot?: SwitcherSnapshot }
  | { ok: false; error: string };

function mergePaneEvent(previous: AgentPane | undefined, pane: AgentPane): AgentPane {
  const preserveTaskSummary = previous?.summary && pane.status === 'idle' && !pane.currentAction;
  return {
    ...previous,
    ...pane,
    summary: preserveTaskSummary ? previous.summary : pane.summary,
  };
}

export class SnapshotStore {
  private panes = new Map<string, AgentPane>();

  async recordHookEvent(event: HookEventInput, runner: CommandRunner = nodeCommandRunner): Promise<AgentPane> {
    const pane = await normalizeHookEvent(event, runner);
    const previous = this.panes.get(pane.id);
    const merged = mergePaneEvent(previous, pane);
    this.panes.set(pane.id, merged);
    return merged;
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
    if (request.type === 'hook') {
      await store.recordHookEvent(request.event, runner);
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
