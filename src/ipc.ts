import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DaemonRequest, DaemonResponse } from './daemon.js';

export function defaultSocketPath(): string {
  return process.env.WATCHER_SOCKET || path.join(os.tmpdir(), `watcher-${process.getuid?.() ?? 'user'}.sock`);
}

export interface SendOptions {
  socketPath?: string;
  timeoutMs?: number;
}

export async function sendDaemonRequest(request: DaemonRequest, options: SendOptions = {}): Promise<DaemonResponse> {
  const socketPath = options.socketPath ?? defaultSocketPath();
  const timeoutMs = options.timeoutMs ?? 500;
  return new Promise<DaemonResponse>((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let settled = false;
    let body = '';
    const timer = setTimeout(() => {
      finish(() => reject(new Error('daemon request timed out')));
    }, timeoutMs);
    function finish(callback: () => void): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      callback();
    }
    socket.setEncoding('utf8');
    socket.on('connect', () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });
    socket.on('data', (chunk) => {
      body += chunk;
    });
    socket.on('end', () => {
      finish(() => {
        try {
          resolve(JSON.parse(body) as DaemonResponse);
        } catch (error) {
          reject(error);
        }
      });
    });
    socket.on('error', (error) => {
      finish(() => reject(error));
    });
  });
}
