import { AgentPane, AgentStatus, STATUS_RANK, SwitcherSnapshot, isRunningAgentStatus } from './model.js';
import { activationTargetLabel } from './activation.js';
import { terminalTargetCommand, terminalTargetCwd, terminalTargetPid } from './terminalTarget.js';
import { basename, bold, dim, fit, formatAge, line, selected, shortPath, singleLine } from './text.js';

export type LayoutMode = 'narrow' | 'medium' | 'wide';

export interface SwitcherRenderState {
  selectedPaneId?: string;
  scroll?: number;
  useColor?: boolean;
  layoutOverride?: LayoutMode;
  home?: string;
  frameIndex?: number;
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

const DISCOVERY_FALLBACK_ACTION = 'tmux/process discovery fallback';

const WORKING_SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

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

function statusDot(status: AgentStatus, useColor: boolean, frameIndex = 0): string {
  const glyph = status === 'working' ? WORKING_SPINNER[frameIndex % WORKING_SPINNER.length]! : '●';
  return useColor ? `${statusColors[status]}${glyph}\x1b[0m` : glyph;
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
  const path = pane.cwd || terminalTargetCwd(pane.target) || '(unknown path)';
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
  for (const pane of panes.filter((candidate) => isRunningAgentStatus(candidate.status))) {
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
    fit(`${bold('Watcher', useColor)} ${dim(`${groups.length} repos · ${worktreeCount} worktrees · ${paneCount} running agents · repo > worktree/branch > sessions · ${layout}`, useColor)}`, width, useColor),
    fit(dim(line(width), useColor), width, useColor),
  ];
}

function emptyLines(snapshot: SwitcherSnapshot, width: number, height: number, useColor: boolean): string[] {
  const reason = !snapshot.tmuxAvailable
    ? 'tmux is not available or no tmux server is running.'
    : !snapshot.daemonAvailable
      ? 'No Watcher Daemon snapshot is available yet.'
      : 'No running Agent Panes found.';
  const help = !snapshot.tmuxAvailable
    ? 'Start tmux and run agent panes there; Watcher is local-tmux only.'
    : !snapshot.daemonAvailable
      ? 'Run watcher daemon or install integrations; unintegrated discovery arrives in the full switcher.'
      : 'Start pi, claude, codex, or opencode in a tmux pane and try again.';
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

function paneRow(pane: AgentPane, width: number, layout: LayoutMode, selectedPane: boolean, useColor: boolean, frameIndex: number): string {
  const dot = selectedPane ? statusDot(pane.status, false, frameIndex) : statusDot(pane.status, useColor, frameIndex);
  const summary = pane.summary || '(no summary yet)';
  const row = layout === 'narrow'
    ? `${dot} ${fit(summary, Math.max(8, width - 8), useColor)}`
    : `${dot} ${fit(pane.agentType, 7, useColor)} ${fit(summary, Math.max(18, width - 18), useColor)}`;
  const padded = fit(`    ${row}`, width, useColor);
  return selectedPane ? selected(padded, useColor) : padded;
}

function listLines(groups: RepoGroup[], width: number, layout: LayoutMode, selectedPaneId: string | undefined, useColor: boolean, home: string | undefined, frameIndex: number): { lines: string[]; selectedLineIndex: number } {
  const lines: string[] = [];
  let selectedLineIndex = 0;
  for (const repo of groups) {
    lines.push(repoHeader(repo, width, useColor));
    for (const worktree of repo.worktrees) {
      lines.push(worktreeHeader(worktree, width, useColor, home));
      for (const pane of worktree.panes) {
        if (pane.id === selectedPaneId) selectedLineIndex = lines.length;
        lines.push(paneRow(pane, width, layout, pane.id === selectedPaneId, useColor, frameIndex));
      }
    }
  }
  return { lines, selectedLineIndex };
}

function pagedList(groups: RepoGroup[], width: number, height: number, layout: LayoutMode, state: SwitcherRenderState, selectedPaneId: string | undefined): string[] {
  const useColor = state.useColor ?? false;
  const { lines, selectedLineIndex } = listLines(groups, width, layout, selectedPaneId, useColor, state.home, state.frameIndex ?? 0);
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

function comparableDetailText(value: string): string {
  return value.replace(/[.…]+$/u, '').trim();
}

function isDuplicateDetailText(candidate: string, existing: string[]): boolean {
  const comparable = comparableDetailText(candidate);
  return existing.some((value) => {
    const other = comparableDetailText(value);
    return comparable === other || comparable.startsWith(other) || other.startsWith(comparable);
  });
}

function uniqueDetailText(values: Array<string | undefined>): string[] {
  const lines: string[] = [];
  for (const value of values) {
    const text = singleLine(value ?? '').trim();
    if (!text || isDuplicateDetailText(text, lines)) continue;
    lines.push(text);
  }
  return lines;
}

function wrapText(value: string | undefined, width: number, maxLines = 4): string[] {
  const text = singleLine(value ?? '').trim();
  if (!text || width <= 0 || maxLines <= 0) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= width) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word.length > width ? `${word.slice(0, Math.max(1, width - 1))}…` : word;
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1]!.replace(/[.…]+$/u, '').slice(0, Math.max(1, width - 1))}…`;
  }
  return lines;
}

function labelledLine(label: string, value: string | undefined): string | undefined {
  const text = singleLine(value ?? '').trim();
  return text ? `${label.padEnd(10)}${text}` : undefined;
}

function detailSection(title: string, lines: Array<string | undefined>, useColor: boolean): string[] {
  const content = lines.filter((value): value is string => Boolean(value));
  return content.length > 0 ? [bold(title, useColor), ...content] : [];
}

function previewLines(value: string | undefined, width: number, maxLines = 6): string[] {
  if (!value || width <= 0 || maxLines <= 0) return [];
  const lines = value
    .split('\n')
    .map((line) => singleLine(line).trimEnd())
    .filter(Boolean);
  return lines.slice(Math.max(0, lines.length - maxLines)).map((line) => fit(line, width, false));
}

function spacedSections(sections: string[][]): string[] {
  return sections.filter((section) => section.length > 0).flatMap((section, index) => index === 0 ? section : ['', ...section]);
}

function detailContent(pane: AgentPane, now: number, home: string | undefined, width: number, useColor: boolean): string[] {
  const group = paneGroup(pane, home);
  const lastMessage = singleLine(pane.lastMessage ?? '').trim();
  const fallbackSummary = singleLine(pane.summary || '(no summary yet)').trim();
  const userMessage = singleLine(pane.userMessage ?? '').trim();
  const summary = userMessage || fallbackSummary;
  const placeholderSummary = !userMessage && (fallbackSummary === 'Waiting for first task' || fallbackSummary.startsWith('Detected ') || fallbackSummary === 'Finished');
  const showSummary = summary && !placeholderSummary && (userMessage || !isDuplicateDetailText(summary, lastMessage ? [lastMessage] : []));
  const messageWidth = Math.max(12, width - 4);
  const fallbackDiscovered = pane.currentAction === DISCOVERY_FALLBACK_ACTION;
  const taskLines = showSummary && !fallbackDiscovered ? wrapText(summary, messageWidth, 4).map((value) => `${bold('▸', useColor)} ${value}`) : [];
  const activityLines = (pane.status === 'working' || pane.status === 'needs_input')
    ? (pane.activityItems ?? []).flatMap((item) => {
      const marker = item.kind === 'tool' ? '⚙' : '▌';
      const state = item.state && item.kind === 'tool' ? ` ${item.state}` : '';
      const label = `${item.label}${state}`;
      const lines = wrapText(item.text || label, messageWidth, 2);
      return lines.length > 0
        ? lines.map((line, index) => index === 0 ? `${bold(marker, useColor)} ${label}  ${line}` : `  ${line}`)
        : [`${bold(marker, useColor)} ${label}`];
    })
    : [];
  const assistantValues = fallbackDiscovered ? [lastMessage] : activityLines.length > 0 ? [] : [lastMessage, pane.currentAction];
  const assistantLines = uniqueDetailText(assistantValues)
    .flatMap((value) => wrapText(value, messageWidth, 5).map((line) => `${bold('▌', useColor)} ${line}`));
  const terminalPreviewLines = previewLines(pane.terminalPreview, messageWidth, 6);
  const command = terminalTargetCommand(pane.target);
  const pid = terminalTargetPid(pane.target);
  const cwd = pane.cwd ? shortPath(pane.cwd, home) : undefined;
  const locationPath = shortPath(group.path, home);
  const cwdLine = cwd && cwd !== locationPath ? labelledLine('cwd', cwd) : undefined;
  return spacedSections([
    detailSection('Status', [
      `${statusDot(pane.status, useColor, now)} ${pane.agentType} · ${pane.status} · updated ${formatAge(ageSeconds(pane, now))} ago`,
      fallbackDiscovered ? 'discovered by tmux process scan; no integration events received yet' : undefined,
      pane.reportedStatus && pane.reportedStatus !== pane.status ? `reported  ${pane.reportedStatus}` : undefined,
    ], useColor),
    detailSection('User message', taskLines, useColor),
    detailSection('Activity', activityLines, useColor),
    detailSection('Assistant', assistantLines, useColor),
    detailSection(group.isGit ? 'Git worktree' : 'Path fallback', [
      group.isGit ? labelledLine('repo', group.repoTitle) : labelledLine('path', shortPath(group.path, home)),
      group.isGit ? labelledLine('branch', group.branch) : undefined,
      group.isGit ? labelledLine('worktree', locationPath) : undefined,
      cwdLine,
    ], useColor),
    detailSection('Terminal', [
      labelledLine('target', tmuxTarget(pane)),
      labelledLine('backend', pane.target.backend),
      labelledLine('command', command),
      pid === undefined ? undefined : labelledLine('pid', String(pid)),
    ], useColor),
    detailSection('Terminal preview', terminalPreviewLines, useColor),
    detailSection('Actions', ['enter     activate pane', 'q         quit'], useColor),
  ]);
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
  const rightWidth = Math.max(56, Math.floor((width - 3) / 2));
  const leftWidth = width - rightWidth - 3;
  const left = pagedList(groups, leftWidth, height, layout, state, selectedPaneId);
  const pane = selectablePanes(groups).find((candidate) => candidate.id === selectedPaneId) ?? selectablePanes(groups)[0]!;
  const right = boxed('details', detailContent(pane, now, state.home, rightWidth - 2, useColor), rightWidth, height, useColor);
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
  const selectedState = `${tmuxTarget(selectedPane)} · ${selectedPane.agentType} · ${selectedPane.status} · ${label} · ${mode}`;
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
