import { SwitcherRenderState } from './switcherLayout.js';
import { loadSwitcherSnapshot } from './snapshot.js';
import { renderSwitcherFrame } from './switcherLayout.js';

export async function runOpenTuiSwitcher(): Promise<void> {
  const { createCliRenderer, TextRenderable } = await import('@opentui/core');

  let state: SwitcherRenderState = { useColor: true, home: process.env.HOME };
  let closed = false;
  const renderer = await createCliRenderer({ exitOnCtrlC: false, screenMode: 'alternate-screen', consoleMode: 'disabled' });
  const text = new TextRenderable(renderer, { content: '', width: '100%', height: '100%' });
  renderer.root.add(text);

  async function redraw(): Promise<void> {
    if (closed) return;
    const snapshot = await loadSwitcherSnapshot();
    const frame = renderSwitcherFrame(snapshot, renderer.width, renderer.height, state).join('\n');
    text.content = frame;
    renderer.requestLive();
  }

  function shutdown(): void {
    if (closed) return;
    closed = true;
    clearInterval(interval);
    renderer.destroy();
  }

  renderer.addInputHandler((sequence) => {
    if (sequence === 'q' || sequence === '\u001b' || sequence === '\u0003') {
      shutdown();
      return true;
    }
    return false;
  });
  renderer.on('resize', () => void redraw());
  const interval = setInterval(() => void redraw(), 1000);
  await redraw();
  renderer.start();
  await new Promise<void>((resolve) => {
    renderer.on('destroy', () => resolve());
  });
}
