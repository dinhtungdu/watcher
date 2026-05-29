#!/usr/bin/env bun
import { runOpenTuiSwitcher } from './opentuiShell.js';
import { loadSwitcherSnapshot } from './snapshot.js';
import { renderSwitcherFrame } from './switcherLayout.js';
import { stripAnsi } from './text.js';
import { startDaemon } from './daemon.js';
import { defaultSocketPath } from './ipc.js';
import { runHookCommand } from './hook.js';
import { runHooksInstall, runHooksStatus } from './hooksInstaller.js';

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const [command, ...rest] = argv;
  if (command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write('watcher - open the Watcher Agent Switcher\n\nCommands:\n  watcher\n  watcher daemon\n  watcher hook <agent> <event>\n  watcher hooks install [agents...]\n  watcher hooks status\n');
    return 0;
  }
  if (command === 'daemon') {
    const detached = rest.includes('--detach');
    const server = await startDaemon({ socketPath: defaultSocketPath() });
    if (!detached) process.stdout.write(`watcher daemon listening on ${defaultSocketPath()}\n`);
    await new Promise<void>((resolve) => {
      const close = () => server.close(() => resolve());
      process.once('SIGINT', close);
      process.once('SIGTERM', close);
    });
    return 0;
  }
  if (command === 'hook') {
    return runHookCommand(rest);
  }
  if (command === 'hooks') {
    const [subcommand, ...agents] = rest;
    if (subcommand === 'install') {
      try {
        const result = await runHooksInstall(agents);
        process.stdout.write(result.output);
        return result.code;
      } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        return 1;
      }
    }
    if (subcommand === 'status') {
      process.stdout.write(await runHooksStatus());
      return 0;
    }
    process.stderr.write('Usage: watcher hooks install [agents...] | watcher hooks status\n');
    return 2;
  }
  if (command) {
    process.stderr.write(`Unknown command: ${command}\n`);
    return 2;
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
