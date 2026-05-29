import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface CommandRunner {
  execFile(file: string, args: string[], options?: { timeout?: number; env?: NodeJS.ProcessEnv }): Promise<{ stdout: string; stderr: string }>;
}

export const nodeCommandRunner: CommandRunner = {
  async execFile(file, args, options) {
    const result = await execFileAsync(file, args, { timeout: options?.timeout ?? 2000, env: options?.env, encoding: 'utf8' });
    return { stdout: String(result.stdout), stderr: String(result.stderr) };
  },
};

export async function hasTmuxServer(runner: CommandRunner = nodeCommandRunner): Promise<boolean> {
  try {
    await runner.execFile('tmux', ['list-panes', '-a', '-F', '#{pane_id}'], { timeout: 1000 });
    return true;
  } catch {
    return false;
  }
}
