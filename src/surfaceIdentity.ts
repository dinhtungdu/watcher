import type { TerminalBackend, TerminalTarget } from './model.js';

export interface EventSurfaceIdentity {
  backend: TerminalBackend;
  id: string;
}

export function canonicalSurfaceKey(surface: EventSurfaceIdentity): string {
  return `${surface.backend}:${surface.id}`;
}

export function surfaceFromTarget(target: TerminalTarget): EventSurfaceIdentity {
  return { backend: target.backend, id: target.id };
}

export function tmuxSurface(paneId: string): EventSurfaceIdentity {
  return { backend: 'tmux', id: paneId };
}
