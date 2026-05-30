import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { buildWatcherAgentEventInput } from '../src/agentEvents.js';
import { deliverAgentEvent, runEventCommand } from '../src/eventCommand.js';
import { DaemonRequest, DaemonResponse } from '../src/daemon.js';
import { canonicalSurfaceKey } from '../src/surfaceIdentity.js';

test('canonical surface keys combine backend and backend-local id', () => {
  assert.equal(canonicalSurfaceKey({ backend: 'tmux', id: '%7' }), 'tmux:%7');
});

function piEvent() {
  return buildWatcherAgentEventInput('pi', 'user-message', { surface: { backend: 'tmux', id: '%42' }, text: 'retry me' });
}

test('event delivery auto-starts daemon and retries successful delivery', async () => {
  const calls: DaemonRequest[] = [];
  let starts = 0;
  let sends = 0;
  const delivered = await deliverAgentEvent(piEvent(), {
    async send(request) {
      calls.push(request);
      sends += 1;
      if (sends === 1) throw new Error('absent daemon');
      return { ok: true } satisfies DaemonResponse;
    },
    startDaemon() {
      starts += 1;
    },
    async sleep() {},
  });
  assert.equal(delivered, true);
  assert.equal(starts, 1);
  assert.equal(sends, 2);
  assert.equal(calls[0]!.type, 'event');
});

test('event delivery fails open after daemon startup or delivery failure', async () => {
  let starts = 0;
  let sends = 0;
  const delivered = await deliverAgentEvent(piEvent(), {
    async send() {
      sends += 1;
      throw new Error('still dead');
    },
    startDaemon() {
      starts += 1;
    },
    async sleep() {},
  });
  assert.equal(delivered, false);
  assert.equal(starts, 1);
  assert.equal(sends, 5);
});

test('event delivery remains bounded when daemon process cannot be started', async () => {
  let sends = 0;
  const delivered = await deliverAgentEvent(piEvent(), {
    async send() {
      sends += 1;
      throw new Error('absent daemon');
    },
    startDaemon() {
      throw new Error('spawn failed');
    },
    async sleep() {},
  });
  assert.equal(delivered, false);
  assert.equal(sends, 1);
});

test('event command uses explicit surface before TMUX_PANE fallback', async () => {
  const calls: DaemonRequest[] = [];
  const code = await runEventCommand(['pi', 'user-message'], {
    env: { TMUX_PANE: '%99' },
    async readInput() {
      return JSON.stringify({ surface: { backend: 'tmux', id: '%42' }, text: 'surface wins' });
    },
    async send(request) {
      calls.push(request);
      return { ok: true };
    },
    async sleep() {},
  });
  assert.equal(code, 0);
  assert.equal(calls[0]!.type, 'event');
  assert.equal(calls[0]!.type === 'event' && calls[0]!.event.surface.id, '%42');
});

test('event command falls back to TMUX_PANE for tmux surface identity', async () => {
  const calls: DaemonRequest[] = [];
  const code = await runEventCommand(['pi', 'user-message'], {
    env: { TMUX_PANE: '%42' },
    async readInput() {
      return JSON.stringify({ text: 'fallback works' });
    },
    async send(request) {
      calls.push(request);
      return { ok: true };
    },
    async sleep() {},
  });
  assert.equal(code, 0);
  assert.equal(calls[0]!.type === 'event' && calls[0]!.event.surface.id, '%42');
});

test('event command rejects raw event names loudly unless quiet', async () => {
  const errors: string[] = [];
  const loud = await runEventCommand(['pi', 'prompt-submit'], {
    env: { TMUX_PANE: '%42' },
    async readInput() {
      return JSON.stringify({ text: 'nope' });
    },
    stderr(message) {
      errors.push(message);
    },
  });
  assert.equal(loud, 2);
  assert.match(errors.join(''), /unknown Watcher Agent Event/);

  errors.length = 0;
  const quiet = await runEventCommand(['--quiet', 'pi', 'prompt-submit'], {
    env: { TMUX_PANE: '%42' },
    async readInput() {
      return JSON.stringify({ text: 'nope' });
    },
    stderr(message) {
      errors.push(message);
    },
  });
  assert.equal(quiet, 0);
  assert.equal(errors.length, 0);
});
