import { AgentPane, AgentStatus, STATUS_RANK, SwitcherSnapshot, isActionable } from './model.js';
import { activationTargetLabel } from './activation.js';
import { basename, bold, dim, fit, formatAge, line, selected, shortPath } from './text.js';

export type LayoutMode = 'narrow' | 'medium' | 'wide';

export interface SwitcherRenderState {
  selectedPaneId?: string;
  scroll?: number;
  useColor?: boolean;
  layoutOverride?: LayoutMode;
  home?: string;
}

interface PaneGroupInfo {
  repoKey: string;
  repoTitle: string;
  worktreeKey: string;
  worktreeTitle: string;
  branch?: string;
  path: string;
  isGit: boolean;
}

export interface WorktreeGroup {
  key: string;
  title: string;
  branch?: string;
  path: string;
  isGit: boolean;
  panes: AgentPane[];
}

export interface RepoGroup {
  key: string;
  title: string;
  isGit: boolean;
  worktrees: WorktreeGroup[];
}

const statusColors: Record<AgentStatus, string> = {
  needs_input: '\x1b[33m',
  stalled: '\x1b[35m',
  working: '\x1b[36m',
  unknown: '\x1b[90m',
  idle: '\x1b[90m',
};

export function chooseLayout(width: number, override?: LayoutMode): LayoutMode {
  if (override) return override;
  if (width < 78) return 'narrow';
  if (width < 116) return 'medium';
  return 'wide';
}

function statusDot(status: AgentStatus, useColor: boolean): string {
  return useColor ? `${statusColors[status]}●\x1b[0m` : '●';
}

function paneGroup(pane: AgentPane, home?: string): PaneGroupInfo {
  if (pane.git?.repo && pane.git.worktreePath) {
    return {
      repoKey: `git:${pane.git.repo}`,
      repoTitle: pane.git.repo,
      worktreeKey: `git:${pane.git.repo}:${pane.git.worktreePath}`,
      worktreeTitle: `${pane.git.branch || 'unknown'} ${shortPath(pane.git.worktreePath, home)}`,
      branch: pane.git.branch || 'unknown',
      path: pane.git.worktreePath,
      isGit: true,
    };
  }
  const path = pane.cwd || pane.tmux.paneCurrentPath || '(unknown path)';
  return {
    repoKey: 'path-fallback',
    repoTitle: 'Path fallback',
    worktreeKey: `path:${path}`,
    worktreeTitle: shortPath(path, home),
    path,
    isGit: false,
  };
}

function ageSeconds(pane: AgentPane, now: number): number {
  return Math.max(0, Math.floor((now - pane.updatedAt) / 1000));
}

function paneSort(now: number): (a: AgentPane, b: AgentPane) => number {
  return (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.updatedAt - a.updatedAt || a.id.localeCompare(b.id);
}

function collectionRank(items: AgentPane[]): number {
  return Math.min(...items.map((pane) => STATUS_RANK[pane.status]));
}

function collectionNewest(items: AgentPane[]): number {
  return Math.max(...items.map((pane) => pane.updatedAt));
}

export function groupPanes(panes: AgentPane[], now: number = Date.now(), home?: string): RepoGroup[] {
  const repos = new Map<string, Omit<RepoGroup, 'worktrees'> & { worktrees: Map<string, WorktreeGroup> }>();
  for (const pane of panes.filter((candidate) => isActionable(candidate.status))) {
    const group = paneGroup(pane, home);
    let repo = repos.get(group.repoKey);
    if (!repo) {
      repo = { key: group.repoKey, title: group.repoTitle, isGit: group.isGit, worktrees: new Map() };
      repos.set(group.repoKey, repo);
    }
    let worktree = repo.worktrees.get(group.worktreeKey);
    if (!worktree) {
      worktree = { key: group.worktreeKey, title: group.worktreeTitle, branch: group.branch, path: group.path, isGit: group.isGit, panes: [] };
      repo.worktrees.set(group.worktreeKey, worktree);
    }
    worktree.panes.push(pane);
  }

  return [...repos.values()]
    .map((repo) => {
      const worktrees = [...repo.worktrees.values()]
        .map((worktree) => ({ ...worktree, panes: [...worktree.panes].sort(paneSort(now)) }))
        .sort((a, b) => collectionRank(a.panes) - collectionRank(b.panes) || collectionNewest(b.panes) - collectionNewest(a.panes));
      return { key: repo.key, title: repo.title, isGit: repo.isGit, worktrees };
    })
    .sort((a, b) => {
      const aPanes = a.worktrees.flatMap((worktree) => worktree.panes);
      const bPanes = b.worktrees.flatMap((worktree) => worktree.panes);
      return collectionRank(aPanes) - collectionRank(bPanes) || collectionNewest(bPanes) - collectionNewest(aPanes);
    });
}

export function selectablePanes(groups: RepoGroup[]): AgentPane[] {
  return groups.flatMap((repo) => repo.worktrees.flatMap((worktree) => worktree.panes));
}

export function moveSelection(panes: AgentPane[], currentPaneId: string | undefined, delta: number): string | undefined {
  if (panes.length === 0) return undefined;
  const index = Math.max(0, panes.findIndex((pane) => pane.id === currentPaneId));
  return panes[(index + delta + panes.length) % panes.length]?.id;
}

function headerLines(width: number, groups: RepoGroup[], layout: LayoutMode, useColor: boolean): string[] {
  const worktreeCount = groups.reduce((count, repo) => count + repo.worktrees.length, 0);
  const paneCount = selectablePanes(groups).length;
  return [
    fit(`${bold('Watcher', useColor)} ${dim(`${groups.length} repos · ${worktreeCount} worktrees · ${paneCount} non-terminated sessions · repo > worktree/branch > sessions · ${layout}`, useColor)}`, width, useColor),
    fit(dim(line(width), useColor), width, useColor),
  ];
}

function emptyLines(snapshot: SwitcherSnapshot, width: number, height: number, useColor: boolean): string[] {
  const reason = !snapshot.tmuxAvailable
    ? 'tmux is not available or no tmux server is running.'
    : !snapshot.daemonAvailable
      ? 'No Watcher Daemon snapshot is available yet.'
      : 'No actionable Agent Panes found.';
  const help = !snapshot.tmuxAvailable
    ? 'Start tmux and run agent panes there; Watcher is local-tmux only.'
    : !snapshot.daemonAvailable
      ? 'Run watcher daemon or install hooks; unhooked discovery arrives in the full switcher.'
      : 'Idle Agent Panes are hidden by default. Submit work in an agent pane and try again.';
  const body = [
    '',
    bold('Nothing to activate', useColor),
    reason,
    help,
    '',
  ];
  const topPad = Math.max(0, Math.floor((height - body.length) / 2));
  return [...Array.from({ length: topPad }, () => ''), ...body].slice(0, height).map((value) => fit(value, width, useColor));
}

function repoHeader(repo: RepoGroup, width: number, useColor: boolean): string {
  return fit(bold(repo.title, useColor), width, useColor);
}

function worktreeHeader(worktree: WorktreeGroup, width: number, useColor: boolean, home?: string): string {
  if (worktree.isGit) {
    return fit(`  ${bold(worktree.branch || 'unknown', useColor)} ${dim(shortPath(worktree.path, home), useColor)}`, width, useColor);
  }
  return fit(`  ${bold(shortPath(worktree.path, home), useColor)}`, width, useColor);
}

function paneRow(pane: AgentPane, width: number, layout: LayoutMode, selectedPane: boolean, useColor: boolean): string {
  const dot = selectedPane ? '●' : statusDot(pane.status, useColor);
  const summary = pane.summary || '(no summary yet)';
  const row = layout === 'narrow'
    ? `${dot} ${fit(summary, Math.max(8, width - 8), useColor)}`
    : `${dot} ${fit(pane.agentType, 7, useColor)} ${fit(summary, Math.max(18, width - 18), useColor)}`;
  const padded = fit(`    ${row}`, width, useColor);
  return selectedPane ? selected(padded, useColor) : padded;
}

function listLines(groups: RepoGroup[], width: number, layout: LayoutMode, selectedPaneId: string | undefined, useColor: boolean, home?: string): { lines: string[]; selectedLineIndex: number } {
  const lines: string[] = [];
  let selectedLineIndex = 0;
  for (const repo of groups) {
    lines.push(repoHeader(repo, width, useColor));
    for (const worktree of repo.worktrees) {
      lines.push(worktreeHeader(worktree, width, useColor, home));
      for (const pane of worktree.panes) {
        if (pane.id === selectedPaneId) selectedLineIndex = lines.length;
        lines.push(paneRow(pane, width, layout, pane.id === selectedPaneId, useColor));
      }
    }
  }
  return { lines, selectedLineIndex };
}

function pagedList(groups: RepoGroup[], width: number, height: number, layout: LayoutMode, state: SwitcherRenderState, selectedPaneId: string | undefined): string[] {
  const useColor = state.useColor ?? false;
  const { lines, selectedLineIndex } = listLines(groups, width, layout, selectedPaneId, useColor, state.home);
  let scroll = state.scroll ?? 0;
  if (selectedLineIndex < scroll) scroll = selectedLineIndex;
  if (selectedLineIndex >= scroll + height) scroll = selectedLineIndex - height + 1;
  scroll = Math.max(0, Math.min(scroll, Math.max(0, lines.length - height)));
  state.scroll = scroll;
  const visible = lines.slice(scroll, scroll + height);
  if (scroll > 0 && visible.length > 0) visible[0] = fit(dim(`↑ ${scroll} rows hidden`, useColor), width, useColor);
  const hiddenBelow = lines.length - (scroll + height);
  if (hiddenBelow > 0 && visible.length > 1) visible[visible.length - 1] = fit(dim(`↓ ${hiddenBelow} rows hidden`, useColor), width, useColor);
  while (visible.length < height) visible.push(' '.repeat(width));
  return visible.map((value) => fit(value, width, useColor));
}

function tmuxTarget(pane: AgentPane): string {
  return activationTargetLabel(pane);
}

function detailContent(pane: AgentPane, now: number, home?: string): string[] {
  const group = paneGroup(pane, home);
  return [
    'Now',
    `${statusDot(pane.status, false)} ${pane.agentType} · ${pane.status} · ${formatAge(ageSeconds(pane, now))}`,
    '',
    group.isGit ? 'Git worktree' : 'Path fallback',
    group.isGit ? `repo      ${group.repoTitle}` : `path      ${shortPath(group.path, home)}`,
    group.isGit ? `branch    ${group.branch}` : 'no repo/branch metadata',
    group.isGit ? `worktree  ${shortPath(group.path, home)}` : '',
    '',
    pane.summary || '(no summary yet)',
    pane.currentAction || pane.lastMessage || '',
    pane.currentAction && pane.lastMessage ? pane.lastMessage : '',
    '',
    'Open',
    tmuxTarget(pane),
    'Watcher exits after activation',
  ].filter((value) => value !== '');
}

function boxed(title: string, content: string[], width: number, height: number, useColor: boolean): string[] {
  if (height <= 0) return [];
  if (width < 24 || height < 3) return content.slice(0, height).map((value) => fit(value, width, useColor));
  const topLabel = ` ${title} `;
  const top = `┌${topLabel}${'─'.repeat(Math.max(0, width - topLabel.length - 2))}┐`;
  const bottom = `└${'─'.repeat(Math.max(0, width - 2))}┘`;
  const innerWidth = width - 2;
  const body = content.slice(0, height - 2).map((value) => `│${fit(value, innerWidth, useColor)}│`);
  while (body.length < height - 2) body.push(`│${' '.repeat(innerWidth)}│`);
  return [fit(dim(top, useColor), width, useColor), ...body, fit(dim(bottom, useColor), width, useColor)];
}

function renderWide(groups: RepoGroup[], width: number, height: number, layout: LayoutMode, state: SwitcherRenderState, selectedPaneId: string, now: number): string[] {
  const useColor = state.useColor ?? false;
  const rightWidth = Math.min(72, Math.max(56, Math.floor(width * 0.52)));
  const leftWidth = width - rightWidth - 3;
  const left = pagedList(groups, leftWidth, height, layout, state, selectedPaneId);
  const pane = selectablePanes(groups).find((candidate) => candidate.id === selectedPaneId) ?? selectablePanes(groups)[0]!;
  const right = boxed('details', detailContent(pane, now, state.home), rightWidth, height, useColor);
  return Array.from({ length: height }, (_, index) => `${fit(left[index] || '', leftWidth, useColor)} ${dim('│', useColor)} ${fit(right[index] || '', rightWidth, useColor)}`);
}

function stateModeLabel(layout: LayoutMode): string {
  return `${layout}:auto`;
}

function helpLines(width: number, layout: LayoutMode, selectedPane: AgentPane | undefined, useColor: boolean, home?: string): string[] {
  const keys = width < 72 ? '↑/↓ select · enter activate · q quit' : '↑/↓ or j/k select · enter activate · q quit';
  if (layout === 'wide' || !selectedPane) return [fit(dim(line(width), useColor), width, useColor), fit(dim(keys, useColor), width, useColor)];
  const group = paneGroup(selectedPane, home);
  const label = group.isGit ? `${group.repoTitle} · ${group.branch} · ${shortPath(group.path, home)}` : `${shortPath(group.path, home)}`;
  const mode = stateModeLabel(layout);
  const selectedState = `${selectedPane.id} ${tmuxTarget(selectedPane)} · ${selectedPane.agentType} · ${selectedPane.status} · ${label} · ${mode}`;
  return [
    fit(dim(line(width), useColor), width, useColor),
    fit(`${bold('selected', useColor)} ${selectedState}`, width, useColor),
    fit(dim(keys, useColor), width, useColor),
  ];
}

function finalizeFrame(lines: string[], width: number, height: number, useColor: boolean): string[] {
  const frame = lines.slice(0, height).map((value) => fit(value, width, useColor));
  while (frame.length < height) frame.push(' '.repeat(width));
  return frame;
}

export function renderSwitcherFrame(snapshot: SwitcherSnapshot, width: number, height: number, state: SwitcherRenderState = {}): string[] {
  width = Math.max(24, width);
  height = Math.max(10, height);
  const useColor = state.useColor ?? false;
  const now = snapshot.now ?? Date.now();
  const layout = chooseLayout(width, state.layoutOverride);
  const groups = groupPanes(snapshot.panes, now, state.home);
  const header = headerLines(width, groups, layout, useColor);
  if (groups.length === 0) {
    const help = [fit(dim(line(width), useColor), width, useColor), fit(dim('q / Esc / Ctrl-C quits', useColor), width, useColor)];
    const body = emptyLines(snapshot, width, Math.max(1, height - header.length - help.length), useColor);
    return finalizeFrame([...header, ...body, ...help], width, height, useColor);
  }
  const panes = selectablePanes(groups);
  const selectedPaneId = panes.some((pane) => pane.id === state.selectedPaneId) ? state.selectedPaneId! : panes[0]!.id;
  state.selectedPaneId = selectedPaneId;
  const selectedPane = panes.find((pane) => pane.id === selectedPaneId);
  const help = helpLines(width, layout, selectedPane, useColor, state.home);
  const bodyHeight = Math.max(1, height - header.length - help.length);
  const body = layout === 'wide'
    ? renderWide(groups, width, bodyHeight, layout, state, selectedPaneId, now)
    : pagedList(groups, width, bodyHeight, layout, state, selectedPaneId);
  return finalizeFrame([...header, ...body, ...help], width, height, useColor);
}
