import { basename } from './text.js';
import { CommandRunner, nodeCommandRunner } from './tmux.js';
import { GitMetadata } from './model.js';

async function git(args: string[], runner: CommandRunner, cwd: string): Promise<string | undefined> {
  try {
    const result = await runner.execFile('git', ['-C', cwd, ...args], { timeout: 1000 });
    return result.stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function discoverGitMetadata(cwd: string | undefined, runner: CommandRunner = nodeCommandRunner): Promise<GitMetadata | undefined> {
  if (!cwd) return undefined;
  const worktreePath = await git(['rev-parse', '--show-toplevel'], runner, cwd);
  if (!worktreePath) return undefined;
  const branch = await git(['branch', '--show-current'], runner, cwd)
    ?? await git(['rev-parse', '--short', 'HEAD'], runner, cwd)
    ?? 'unknown';
  const commonDir = await git(['rev-parse', '--path-format=absolute', '--git-common-dir'], runner, cwd);
  const repoFromCommonDir = commonDir?.endsWith('/.git') ? basename(commonDir.slice(0, -5)) : undefined;
  return {
    repo: repoFromCommonDir || basename(worktreePath),
    branch,
    worktreePath,
  };
}
