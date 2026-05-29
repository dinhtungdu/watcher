import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverHookEvent } from '../src/hook.js';
import { DaemonRequest, DaemonResponse } from '../src/daemon.js';

test('hook auto-starts daemon and retries successful delivery', async () => {
  const calls: DaemonRequest[] = [];
  let starts = 0;
  let sends = 0;
  const delivered = await deliverHookEvent('pi', 'prompt-submit', '%42', { prompt: 'retry me' }, {
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
  assert.equal(calls[0]!.type, 'hook');
});

test('hook fails open after daemon startup or delivery failure', async () => {
  let starts = 0;
  let sends = 0;
  const delivered = await deliverHookEvent('pi', 'prompt-submit', '%42', { prompt: 'do not break agent' }, {
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

test('hook remains bounded when daemon process cannot be started', async () => {
  let sends = 0;
  const delivered = await deliverHookEvent('pi', 'prompt-submit', '%42', {}, {
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
