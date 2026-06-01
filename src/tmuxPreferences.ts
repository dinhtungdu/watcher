import { nodeCommandRunner } from './tmux.js';
import type { CommandRunner } from './tmux.js';

const HIDE_CHROME_OPTION = '@watcher-hide-chrome';

export async function loadChromeHiddenPreference(runner: CommandRunner = nodeCommandRunner): Promise<boolean> {
  try {
    const result = await runner.execFile('tmux', ['show-option', '-gqv', HIDE_CHROME_OPTION], { timeout: 1000 });
    return result.stdout.trim() === '1';
  } catch {
    return false;
  }
}

export async function saveChromeHiddenPreference(hidden: boolean, runner: CommandRunner = nodeCommandRunner): Promise<void> {
  try {
    await runner.execFile('tmux', ['set-option', '-gq', HIDE_CHROME_OPTION, hidden ? '1' : '0'], { timeout: 1000 });
  } catch {
    // The switcher still works without a tmux server; only persistence is unavailable.
  }
}
