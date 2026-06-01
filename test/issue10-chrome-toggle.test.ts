import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { loadChromeHiddenPreference, saveChromeHiddenPreference } from '../src/tmuxPreferences.js';
import type { CommandRunner } from '../src/tmux.js';

function preferenceRunner(stdout: string): { runner: CommandRunner; commands: Array<{ file: string; args: string[] }> } {
  const commands: Array<{ file: string; args: string[] }> = [];
  return {
    commands,
    runner: {
      async execFile(file, args) {
        commands.push({ file, args });
        return { stdout, stderr: '' };
      },
    },
  };
}

test('chrome hidden preference is stored in a tmux global option', async () => {
  const { runner, commands } = preferenceRunner('1\n');
  assert.equal(await loadChromeHiddenPreference(runner), true);
  await saveChromeHiddenPreference(false, runner);

  assert.deepEqual(commands, [
    { file: 'tmux', args: ['show-option', '-gqv', '@watcher-hide-chrome'] },
    { file: 'tmux', args: ['set-option', '-gq', '@watcher-hide-chrome', '0'] },
  ]);
});

test('chrome hidden preference defaults to visible when tmux option is missing', async () => {
  const runner: CommandRunner = {
    async execFile() {
      throw new Error('tmux unavailable');
    },
  };

  assert.equal(await loadChromeHiddenPreference(runner), false);
  await saveChromeHiddenPreference(true, runner);
});
