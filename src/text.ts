const ANSI_PATTERN = /\x1b\[[0-9;?]*[A-Za-z]/g;

export const ansi = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  inverse: '\x1b[7m',
  selected: '\x1b[1;7m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  gray: '\x1b[90m',
};

export function stripAnsi(value: string): string {
  return String(value).replace(ANSI_PATTERN, '');
}

export function visibleLength(value: string): number {
  return [...stripAnsi(value)].length;
}

export function paint(code: string, value: unknown, useColor: boolean): string {
  return useColor ? `${code}${String(value)}${ansi.reset}` : String(value);
}

export function bold(value: unknown, useColor: boolean): string {
  return paint(ansi.bold, value, useColor);
}

export function dim(value: unknown, useColor: boolean): string {
  return paint(ansi.dim, value, useColor);
}

export function selected(value: unknown, useColor: boolean): string {
  return paint(ansi.selected, value, useColor);
}

export function singleLine(value: unknown): string {
  return String(value).replace(/[\r\n\t]+/g, ' ');
}

export function clip(value: unknown, width: number, useColor = false): string {
  if (width <= 0) return '';
  const text = singleLine(value);
  if (visibleLength(text) <= width) return text;
  if (width === 1) return '…';
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
    const char = Array.from(text.slice(index))[0] ?? '';
    if (length >= width - 1) break;
    out += char;
    length += 1;
    index += char.length;
  }
  return useColor ? `${out}…${ansi.reset}` : `${out}…`;
}

export function fit(value: unknown, width: number, useColor = false): string {
  const clipped = clip(value, width, useColor);
  return clipped + ' '.repeat(Math.max(0, width - visibleLength(clipped)));
}

export function line(width: number): string {
  return '─'.repeat(Math.max(0, width));
}

export function basename(path: string): string {
  const cleaned = path.replace(/\/+$/, '');
  return cleaned.split('/').filter(Boolean).at(-1) || path;
}

export function shortPath(path: string, home = process.env.HOME): string {
  if (home && path.startsWith(home)) return `~${path.slice(home.length)}`;
  return path;
}

export function formatAge(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.floor(seconds))}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}
