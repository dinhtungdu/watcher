#!/usr/bin/env node

// PROTOTYPE — throwaway.
// Question: Does a repo > worktree/branch > sessions hierarchy make the Watcher
// Agent Switcher easier to scan?
// Run: node prototypes/watcher-tui-design/prototype.mjs

const QUESTION =
	'Does a repo > worktree/branch > sessions hierarchy make the Watcher Agent Switcher easier to scan?';

const USE_COLOR = Boolean(process.stdout.isTTY && !process.env.NO_COLOR && !process.env.WATCHER_TUI_SNAPSHOT);
const ANSI = {
	reset: '\x1b[0m',
	bold: '\x1b[1m',
	dim: '\x1b[2m',
	inverse: '\x1b[7m',
	// Theme-adaptive selection: reverse current fg/bg + bold. No hardcoded RGB/256-color background.
	selected: '\x1b[1;7m',
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m',
	green: '\x1b[32m',
	gray: '\x1b[90m',
};
const color = (code, value) => (USE_COLOR ? `${code}${value}${ANSI.reset}` : String(value));
const bold = (value) => color(ANSI.bold, value);
const dim = (value) => color(ANSI.dim, value);
const inverse = (value) => color(ANSI.inverse, value);
const selectedPaint = (value) => color(ANSI.selected, value);
const red = (value) => color(ANSI.red, value);
const yellow = (value) => color(ANSI.yellow, value);
const magenta = (value) => color(ANSI.magenta, value);
const cyan = (value) => color(ANSI.cyan, value);
const green = (value) => color(ANSI.green, value);
const gray = (value) => color(ANSI.gray, value);

const STATUS = {
	needs_input: { label: '●', full: 'needs_input', rank: 0, paint: yellow },
	stalled: { label: '●', full: 'stalled', rank: 1, paint: magenta },
	working: { label: '●', full: 'working', rank: 2, paint: cyan },
	unknown: { label: '●', full: 'unknown', rank: 3, paint: gray },
	idle: { label: '●', full: 'idle', rank: 4, paint: gray },
};
const STATUS_ORDER = ['needs_input', 'stalled', 'working', 'unknown', 'idle'];

const panes = [
	{
		id: '%23',
		projectPath: '/Users/tung/workspace/watcher',
		agent: 'pi',
		status: 'needs_input',
		summary: 'Approve project-path grouping for the Agent Switcher',
		action: 'waiting for design decision',
		lastMessage: 'Group rows by cwd so related agent panes stay together; keep status priority inside each group.',
		tmux: 'watcher:1.1',
		ageSec: 95,
	},
	{
		id: '%28',
		projectPath: '/Users/tung/workspace/watcher-tui-redesign',
		agent: 'claude',
		status: 'working',
		summary: 'Spike OpenTUI renderer contract',
		action: 'reading @opentui/core docs',
		lastMessage: 'Renderer can own selection state; daemon should stay presentation-agnostic.',
		tmux: 'watcher:1.2',
		ageSec: 230,
	},
	{
		id: '%29',
		projectPath: '/Users/tung/workspace/watcher-tui-redesign',
		agent: 'pi',
		status: 'unknown',
		summary: 'Check branch-specific keyboard nav polish',
		action: 'same repo/worktree as %28; shown under the same group',
		lastMessage: 'Same branch can have more than one session; group them together and let the user pick one.',
		tmux: 'watcher:1.3',
		ageSec: 510,
	},
	{
		id: '%31',
		projectPath: '/Users/tung/workspace/watcher',
		agent: 'pi',
		status: 'unknown',
		summary: 'New pane found by tmux fallback, no hook event yet',
		action: 'capturing pane tail hash',
		lastMessage: 'No reliable status until hook emits or fallback sees activity.',
		tmux: 'watcher:2.1',
		ageSec: 415,
	},
	{
		id: '%41',
		projectPath: '/Users/tung/workspace/wordpress-develop/src',
		agent: 'pi',
		status: 'needs_input',
		summary: 'Decide whether REST controller query should batch authors',
		action: 'asking for architecture call',
		lastMessage: 'N+1 risk is real here; either preload authors or narrow the endpoint scope.',
		tmux: 'wp:3.2',
		ageSec: 42,
	},
	{
		id: '%44',
		projectPath: '/Users/tung/workspace/wordpress-develop/src',
		agent: 'codex',
		status: 'stalled',
		summary: 'Run PHPUnit group for REST autosaves',
		action: 'no output change for 6m',
		lastMessage: 'phpunit --group restapi-autosaves started; no new output since bootstrap.',
		tmux: 'wp:4.1',
		ageSec: 370,
	},
	{
		id: '%52',
		projectPath: '/Users/tung/workspace/gutenberggggg',
		agent: 'pi',
		status: 'working',
		summary: 'Refactor editor sidebar data dependencies',
		action: 'editing packages/editor/src',
		lastMessage: 'Moving selectors higher avoids repeating resolver waterfalls in nested panels.',
		tmux: 'gb:2.3',
		ageSec: 19,
	},
	{
		id: '%55',
		projectPath: '/Users/tung/workspace/gutenberggggg',
		agent: 'claude',
		status: 'idle',
		summary: 'Finished sketching block toolbar variants',
		action: 'hidden by default',
		lastMessage: 'Done. Left notes in the prototype folder.',
		tmux: 'gb:2.4',
		ageSec: 620,
	},
	{
		id: '%61',
		projectPath: '/Users/tung/workspace/pi-coding-agent',
		agent: 'pi',
		status: 'stalled',
		summary: 'Investigate MCP gateway reconnect delay',
		action: 'last output 9m ago',
		lastMessage: 'The retry loop may be waiting on a dead child process; verify before blaming MCP.',
		tmux: 'pi:5.1',
		ageSec: 545,
	},
	{
		id: '%70',
		projectPath: '/Users/tung/tmp/opentui-spike',
		agent: 'codex',
		status: 'working',
		summary: 'Fake dense rows for small terminal widths',
		action: 'rendering responsive row variants',
		lastMessage: 'Narrow mode should sacrifice secondary metadata before hiding the task summary.',
		tmux: 'lab:1.1',
		ageSec: 12,
	},
	{
		id: '%72',
		projectPath: '/Users/tung/tmp/opentui-spike',
		agent: 'pi',
		status: 'unknown',
		summary: 'Detected aider process without Watcher hook installed',
		action: 'one-level process scan',
		lastMessage: 'Pane command matches known agent; hook status is unavailable.',
		tmux: 'lab:1.2',
		ageSec: 770,
	},
];

const gitWorktrees = {
	'%23': { repo: 'watcher', branch: 'main', path: '/Users/tung/workspace/watcher' },
	'%28': { repo: 'watcher', branch: 'feature/tui-redesign', path: '/Users/tung/workspace/watcher-tui-redesign' },
	'%29': { repo: 'watcher', branch: 'feature/tui-redesign', path: '/Users/tung/workspace/watcher-tui-redesign' },
	'%31': { repo: 'watcher', branch: 'main', path: '/Users/tung/workspace/watcher' },
	'%41': { repo: 'wordpress-develop', branch: 'trunk', path: '/Users/tung/workspace/wordpress-develop/src' },
	'%44': { repo: 'wordpress-develop', branch: 'trunk', path: '/Users/tung/workspace/wordpress-develop/src' },
	'%52': { repo: 'gutenberg', branch: 'trunk', path: '/Users/tung/workspace/gutenberggggg' },
	'%55': { repo: 'gutenberg', branch: 'trunk', path: '/Users/tung/workspace/gutenberggggg' },
	'%61': { repo: 'pi-coding-agent', branch: 'main', path: '/Users/tung/workspace/pi-coding-agent' },
	// %70 and %72 intentionally have no git metadata: fallback grouping by path.
};

const startedAt = Date.now();
const state = {
	selectedPaneId: '%23',
	scroll: 0,
	hideIdle: true,
	layoutOverride: null,
	message: 'PROTOTYPE: all panes/statuses/tmux targets are fake.',
};

function stripAnsi(value) {
	return String(value).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
}

function visibleLength(value) {
	return [...stripAnsi(value)].length;
}

function clip(value, width) {
	if (width <= 0) {
		return '';
	}
	const text = String(value);
	if (visibleLength(text) <= width) {
		return text;
	}
	if (width === 1) {
		return '…';
	}
	let out = '';
	let length = 0;
	for (let index = 0; index < text.length;) {
		if (text[index] === '\x1b') {
			const match = text.slice(index).match(/^\x1b\[[0-9;?]*[A-Za-z]/);
			if (match) {
				out += match[0];
				index += match[0].length;
				continue;
			}
		}
		const char = Array.from(text.slice(index))[0];
		if (length >= width - 1) {
			break;
		}
		out += char;
		length += 1;
		index += char.length;
	}
	return USE_COLOR ? `${out}…${ANSI.reset}` : `${out}…`;
}

function fit(value, width) {
	const clipped = clip(value, width);
	return clipped + ' '.repeat(Math.max(0, width - visibleLength(clipped)));
}

function line(width, char = '─') {
	return dim(char.repeat(Math.max(0, width)));
}

function shortPath(path) {
	return path.replace('/Users/tung', '~');
}

function basename(path) {
	return path.split('/').filter(Boolean).at(-1) || path;
}

function paneGroup(pane) {
	const git = gitWorktrees[pane.id];
	if (git?.repo && git?.path) {
		return {
			repoKey: `git:${git.repo}`,
			repoTitle: git.repo,
			worktreeKey: `git:${git.repo}:${git.path}`,
			worktreeTitle: `${git.branch || 'unknown'} ${shortPath(git.path)}`,
			branch: git.branch || 'unknown',
			path: git.path,
			isGit: true,
		};
	}
	return {
		repoKey: 'path-fallback',
		repoTitle: 'Path fallback',
		worktreeKey: `path:${pane.projectPath}`,
		worktreeTitle: shortPath(pane.projectPath),
		branch: null,
		path: pane.projectPath,
		isGit: false,
	};
}

function ageSeconds(pane) {
	return pane.ageSec + Math.floor((Date.now() - startedAt) / 1000);
}

function formatAge(seconds) {
	if (seconds < 60) {
		return `${seconds}s`;
	}
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) {
		return `${minutes}m`;
	}
	return `${Math.floor(minutes / 60)}h`;
}

function chip(status) {
	const meta = STATUS[status] || STATUS.unknown;
	return meta.paint(meta.label);
}

function visiblePanes() {
	const result = panes.filter((pane) => !state.hideIdle || pane.status !== 'idle');
	if (!result.some((pane) => pane.id === state.selectedPaneId)) {
		state.selectedPaneId = result[0]?.id || panes[0].id;
	}
	return result;
}

function selectedPane() {
	const selectable = ensureSelectedVisible();
	return selectable.find((pane) => pane.id === state.selectedPaneId) || selectable[0] || panes[0];
}

function paneSort(a, b) {
	const rank = STATUS[a.status].rank - STATUS[b.status].rank;
	return rank || ageSeconds(a) - ageSeconds(b);
}

function collectionRank(items) {
	return Math.min(...items.map((pane) => STATUS[pane.status].rank));
}

function collectionNewest(items) {
	return Math.min(...items.map(ageSeconds));
}

function groupPanes() {
	const repos = new Map();
	for (const pane of visiblePanes()) {
		const group = paneGroup(pane);
		if (!repos.has(group.repoKey)) {
			repos.set(group.repoKey, {
				key: group.repoKey,
				title: group.repoTitle,
				isGit: group.isGit,
				worktrees: new Map(),
			});
		}
		const repo = repos.get(group.repoKey);
		if (!repo.worktrees.has(group.worktreeKey)) {
			repo.worktrees.set(group.worktreeKey, {
				key: group.worktreeKey,
				title: group.worktreeTitle,
				branch: group.branch,
				path: group.path,
				isGit: group.isGit,
				panes: [],
			});
		}
		repo.worktrees.get(group.worktreeKey).panes.push(pane);
	}
	return [...repos.values()]
		.map((repo) => {
			const worktrees = [...repo.worktrees.values()]
				.map((worktree) => ({ ...worktree, panes: worktree.panes.sort(paneSort) }))
				.sort((a, b) => collectionRank(a.panes) - collectionRank(b.panes) || collectionNewest(a.panes) - collectionNewest(b.panes));
			return { ...repo, worktrees };
		})
		.sort((a, b) => {
			const aPanes = a.worktrees.flatMap((worktree) => worktree.panes);
			const bPanes = b.worktrees.flatMap((worktree) => worktree.panes);
			return collectionRank(aPanes) - collectionRank(bPanes) || collectionNewest(aPanes) - collectionNewest(bPanes);
		});
}

function selectablePanes() {
	return groupPanes().flatMap((repo) => repo.worktrees.flatMap((worktree) => worktree.panes));
}

function ensureSelectedVisible() {
	const selectable = selectablePanes();
	if (!selectable.some((pane) => pane.id === state.selectedPaneId)) {
		state.selectedPaneId = selectable[0]?.id || panes[0].id;
	}
	return selectable;
}

function chooseLayout(width) {
	if (state.layoutOverride) {
		return state.layoutOverride;
	}
	if (width < 78) {
		return 'narrow';
	}
	if (width < 116) {
		return 'medium';
	}
	return 'wide';
}

function headerLines(width, height, layout) {
	const title = `${bold('Watcher')} ${inverse(' PROTOTYPE ')}`;
	const mode = state.layoutOverride ? `${layout} forced` : `${layout} auto`;
	const repos = groupPanes();
	const worktrees = repos.reduce((count, repo) => count + repo.worktrees.length, 0);
	const sessions = selectablePanes().length;
	const sessionLabel = state.hideIdle ? 'non-terminated sessions' : 'sessions';
	return [
		fit(`${title} ${dim(`${repos.length} repos · ${worktrees} worktrees · ${sessions} ${sessionLabel} · repo > worktree/branch > sessions · ${mode}`)}`, width),
		line(width),
	];
}

function helpLines(width, layout) {
	const pane = selectedPane();
	const keys = width < 72
		? '↑/↓ select · enter activate · i idle · 1/2/3/a layout · q quit'
		: '↑/↓ or j/k select · enter activate · i idle · 1/2/3/a layout · q quit';
	if (layout === 'wide') {
		return [line(width), fit(dim(keys), width)];
	}
	const mode = state.layoutOverride ? `${layout}:forced` : `${layout}:auto`;
	const group = paneGroup(pane);
	const groupLabel = group.isGit ? `${group.repoTitle} · ${group.branch} · ${shortPath(group.path)}` : `${group.repoTitle} · ${shortPath(group.path)}`;
	const selectedState = `${pane.id} ${pane.tmux} · ${pane.agent} · ${pane.status} · ${groupLabel} · ${mode}`;
	return [line(width), fit(`${bold('selected')} ${selectedState}`, width), fit(dim(keys), width)];
}

function repoHeader(repo, width, layout) {
	return fit(bold(repo.title), width);
}

function worktreeHeader(worktree, width, layout) {
	if (worktree.isGit) {
		return fit(`  ${bold(worktree.branch)} ${dim(shortPath(worktree.path))}`, width);
	}
	return fit(`  ${bold(shortPath(worktree.path))}`, width);
}

function selectedStatusChip(status) {
	return '●';
}

function selectedRow(value, width) {
	return selectedPaint(fit(`    ${stripAnsi(value)}`, width));
}

function paneRow(pane, width, layout) {
	const selected = pane.id === state.selectedPaneId;
	const status = selected ? selectedStatusChip(pane.status) : chip(pane.status);
	if (layout === 'narrow') {
		const row = `${status} ${fit(pane.summary, Math.max(8, width - 8))}`;
		return selected ? selectedRow(row, width) : fit(`    ${row}`, width);
	}
	const summaryWidth = Math.max(18, width - 18);
	const row = `${status} ${fit(pane.agent, 7)} ${fit(pane.summary, summaryWidth)}`;
	return selected ? selectedRow(row, width) : fit(`    ${row}`, width);
}

function listLines(width, layout) {
	ensureSelectedVisible();
	const lines = [];
	let selectedLineIndex = 0;
	for (const repo of groupPanes()) {
		lines.push(repoHeader(repo, width, layout));
		for (const worktree of repo.worktrees) {
			lines.push(worktreeHeader(worktree, width, layout));
			for (const pane of worktree.panes) {
				if (pane.id === state.selectedPaneId) {
					selectedLineIndex = lines.length;
				}
				lines.push(paneRow(pane, width, layout));
			}
		}
	}
	return { lines, selectedLineIndex };
}

function pagedList(width, height, layout) {
	const { lines, selectedLineIndex } = listLines(width, layout);
	if (height <= 0) {
		return [];
	}
	if (selectedLineIndex < state.scroll) {
		state.scroll = selectedLineIndex;
	}
	if (selectedLineIndex >= state.scroll + height) {
		state.scroll = selectedLineIndex - height + 1;
	}
	state.scroll = Math.max(0, Math.min(state.scroll, Math.max(0, lines.length - height)));
	const visible = lines.slice(state.scroll, state.scroll + height);
	if (state.scroll > 0 && visible.length > 0) {
		visible[0] = fit(dim(`↑ ${state.scroll} rows hidden`), width);
	}
	const hiddenBelow = lines.length - (state.scroll + height);
	if (hiddenBelow > 0 && visible.length > 1) {
		visible[visible.length - 1] = fit(dim(`↓ ${hiddenBelow} rows hidden`), width);
	}
	while (visible.length < height) {
		visible.push(' '.repeat(width));
	}
	return visible.map((value) => fit(value, width));
}

function detailContent(layout) {
	const pane = selectedPane();
	const group = paneGroup(pane);
	return [
		bold('Now'),
		`${chip(pane.status)} ${pane.status} · ${pane.agent} · ${formatAge(ageSeconds(pane))}`,
		'',
		bold(group.isGit ? 'Git worktree' : 'Path fallback'),
		group.isGit ? `repo      ${group.repoTitle}` : `path      ${shortPath(group.path)}`,
		group.isGit ? `branch    ${group.branch}` : dim('no repo/branch metadata'),
		group.isGit ? `worktree  ${shortPath(group.path)}` : '',
		'',
		pane.summary,
		dim(pane.action),
		'',
		bold('Open'),
		pane.tmux,
		dim('Watcher exits after activation'),
	];
}

function boxed(title, content, width, height) {
	if (height <= 0) {
		return [];
	}
	if (width < 24 || height < 3) {
		return content.slice(0, height).map((value) => fit(value, width));
	}
	const topLabel = ` ${title} `;
	const top = `┌${topLabel}${'─'.repeat(Math.max(0, width - visibleLength(topLabel) - 2))}┐`;
	const bottom = `└${'─'.repeat(Math.max(0, width - 2))}┘`;
	const innerWidth = width - 2;
	const body = content.slice(0, height - 2).map((value) => `│${fit(value, innerWidth)}│`);
	while (body.length < height - 2) {
		body.push(`│${' '.repeat(innerWidth)}│`);
	}
	return [fit(dim(top), width), ...body, fit(dim(bottom), width)];
}

function renderDetails(width, height, layout) {
	return boxed('details', detailContent(layout), width, height);
}

function renderWide(width, height, layout) {
	const rightWidth = Math.min(72, Math.max(56, Math.floor(width * 0.52)));
	const leftWidth = width - rightWidth - 3;
	const left = pagedList(leftWidth, height, layout);
	const right = renderDetails(rightWidth, height, layout);
	const rows = [];
	for (let index = 0; index < height; index += 1) {
		rows.push(`${fit(left[index] || '', leftWidth)} ${dim('│')} ${fit(right[index] || '', rightWidth)}`);
	}
	return rows;
}

function renderMedium(width, height, layout) {
	return pagedList(width, height, layout);
}

function renderNarrow(width, height, layout) {
	return pagedList(width, height, layout);
}

function buildFrame(width, height) {
	width = Math.max(24, width);
	height = Math.max(10, height);
	const layout = chooseLayout(width);
	const header = headerLines(width, height, layout);
	const help = helpLines(width, layout);
	const bodyHeight = Math.max(1, height - header.length - help.length);
	let body;
	if (layout === 'wide') {
		body = renderWide(width, bodyHeight, layout);
	} else if (layout === 'medium') {
		body = renderMedium(width, bodyHeight, layout);
	} else {
		body = renderNarrow(width, bodyHeight, layout);
	}
	return [...header, ...body, ...help].slice(0, height).map((value) => fit(value, width));
}

function render() {
	const width = process.stdout.columns || Number(process.env.COLUMNS) || 100;
	const height = process.stdout.rows || Number(process.env.ROWS) || 30;
	const frame = buildFrame(width, height);
	process.stdout.write(`\x1b[2J\x1b[H${frame.join('\n')}`);
}

function moveSelection(delta) {
	const ids = ensureSelectedVisible().map((pane) => pane.id);
	if (ids.length === 0) {
		return;
	}
	const index = ids.indexOf(state.selectedPaneId);
	const next = (index + delta + ids.length) % ids.length;
	state.selectedPaneId = ids[next];
	state.message = `selected ${state.selectedPaneId}`;
}

function activateSelected() {
	const pane = selectedPane();
	state.message = `fake activation: open ${pane.tmux}; Watcher exits so you work one session at a time`;
}

function setLayoutOverride(value) {
	state.layoutOverride = value;
	state.scroll = 0;
	state.message = value ? `forced ${value} layout; press a for auto` : 'auto layout; resize terminal to watch collapse rules';
}

function toggleIdle() {
	state.hideIdle = !state.hideIdle;
	state.scroll = 0;
	ensureSelectedVisible();
	state.message = state.hideIdle ? 'terminated/idle Agent Panes hidden' : 'terminated/idle Agent Panes visible';
}

let terminalRestored = false;

function restoreTerminal() {
	if (terminalRestored) {
		return;
	}
	terminalRestored = true;
	if (process.stdin.isTTY) {
		process.stdin.setRawMode(false);
	}
	process.stdout.write('\x1b[?25h\x1b[?1049l');
}

function exit() {
	restoreTerminal();
	process.exit(0);
}

function handleInput(buffer) {
	const input = buffer.toString('utf8');
	if (input === '\u0003' || input === 'q') {
		exit();
	}
	if (input === '\x1b[A' || input === 'k') {
		moveSelection(-1);
	} else if (input === '\x1b[B' || input === 'j') {
		moveSelection(1);
	} else if (input === '\r' || input === '\n') {
		activateSelected();
	} else if (input === 'i') {
		toggleIdle();
	} else if (input === 'a') {
		setLayoutOverride(null);
	} else if (input === '1') {
		setLayoutOverride('narrow');
	} else if (input === '2') {
		setLayoutOverride('medium');
	} else if (input === '3') {
		setLayoutOverride('wide');
	}
	render();
}

if (process.env.WATCHER_TUI_SNAPSHOT || !process.stdin.isTTY || !process.stdout.isTTY) {
	const width = Number(process.env.COLUMNS) || 120;
	const height = Number(process.env.ROWS) || 32;
	console.log(buildFrame(width, height).map(stripAnsi).join('\n'));
	process.exit(0);
}

process.stdout.write('\x1b[?1049h\x1b[?25l');
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on('data', handleInput);
process.stdout.on('resize', render);
process.on('SIGINT', exit);
process.on('exit', restoreTerminal);
setInterval(render, 1000).unref();
render();
