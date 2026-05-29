#!/usr/bin/env node
import { runOpenTuiSwitcher } from './opentuiShell.js';
import { loadSwitcherSnapshot } from './snapshot.js';
import { renderSwitcherFrame } from './switcherLayout.js';
import { stripAnsi } from './text.js';

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const [command] = argv;
  if (command && command !== 'help' && command !== '--help' && command !== '-h') {
    process.stderr.write(`Unknown command: ${command}\n`);
    return 2;
  }
  if (command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write('watcher - open the Watcher Agent Switcher\n');
    return 0;
  }

  if (process.env.WATCHER_TUI_SNAPSHOT || !process.stdin.isTTY || !process.stdout.isTTY) {
    const snapshot = await loadSwitcherSnapshot();
    const width = Number(process.env.COLUMNS) || process.stdout.columns || 100;
    const height = Number(process.env.ROWS) || process.stdout.rows || 28;
    const frame = renderSwitcherFrame(snapshot, width, height, { useColor: false, home: process.env.HOME });
    process.stdout.write(`${frame.map(stripAnsi).join('\n')}\n`);
    return 0;
  }

  await runOpenTuiSwitcher();
  return 0;
}

main().then((code) => {
  process.exitCode = code;
}, (error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
