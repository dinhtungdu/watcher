import { nodeCommandRunner } from './tmux.js';
import type { CommandRunner } from './tmux.js';

const HIDE_CHROME_OPTION = '@watcher-hide-chrome';
const LAST_ACTIVATED_PANE_OPTION = '@watcher-last-activated-pane';

async function loadTmuxOption(option: string, runner: CommandRunner): Promise<string | undefined> {
  try {
    const result = await runner.execFile('tmux', ['show-option', '-gqv', option], { timeout: 1000 });
    const value = result.stdout.trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

async function saveTmuxOption(option: string, value: string, runner: CommandRunner): Promise<void> {
  try {
    await runner.execFile('tmux', ['set-option', '-gq', option, value], { timeout: 1000 });
  } catch {
    // The switcher still works without a tmux server; only tmux-option persistence is unavailable.
  }
}

export async function loadChromeHiddenPreference(runner: CommandRunner = nodeCommandRunner): Promise<boolean> {
  return await loadTmuxOption(HIDE_CHROME_OPTION, runner) === '1';
}

export async function saveChromeHiddenPreference(hidden: boolean, runner: CommandRunner = nodeCommandRunner): Promise<void> {
  await saveTmuxOption(HIDE_CHROME_OPTION, hidden ? '1' : '0', runner);
}

export async function loadLastActivatedPanePreference(runner: CommandRunner = nodeCommandRunner): Promise<string | undefined> {
  return loadTmuxOption(LAST_ACTIVATED_PANE_OPTION, runner);
}

export async function saveLastActivatedPanePreference(paneId: string, runner: CommandRunner = nodeCommandRunner): Promise<void> {
  await saveTmuxOption(LAST_ACTIVATED_PANE_OPTION, paneId, runner);
}
