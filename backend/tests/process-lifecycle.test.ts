import { createServer, request } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { closeServer, createShutdown } from '../src/utils/processLifecycle.js';

const silent = () => ({ info: vi.fn(), error: vi.fn(), fatal: vi.fn() });

describe('graceful shutdown', () => {
  it('awaits the shutdown steps before exiting 0, and runs them once', async () => {
    const order: string[] = [];
    const exit = vi.fn((code: number) => { order.push(`exit:${code}`); });
    const stop = createShutdown({ name: 'test', exit, log: silent() as never, shutdown: async () => { await new Promise((r) => setTimeout(r, 20)); order.push('closed'); } });
    await Promise.all([stop('SIGTERM'), stop('SIGINT')]);
    expect(order).toEqual(['closed', 'exit:0']);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('exits 1 when shutdown hangs past the deadline', async () => {
    const exit = vi.fn();
    const log = silent();
    void createShutdown({ name: 'test', exit, log: log as never, deadlineMs: 30, shutdown: () => new Promise(() => undefined) })('SIGTERM');
    await new Promise((r) => setTimeout(r, 80));
    expect(exit).toHaveBeenCalledWith(1);
    expect(log.error).toHaveBeenCalled();
  });

  it('exits 1 when a shutdown step throws', async () => {
    const exit = vi.fn();
    await createShutdown({ name: 'test', exit, log: silent() as never, shutdown: async () => { throw new Error('boom'); } })('SIGTERM');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('lets an in-flight request finish before the server closes', async () => {
    const server = createServer((_req, res) => { setTimeout(() => res.end('done'), 100); });
    server.listen(0);
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    const response = new Promise<string>((resolve, reject) => {
      request({ port, path: '/' }, (res) => { let body = ''; res.on('data', (c) => { body += c; }); res.on('end', () => resolve(body)); }).on('error', reject).end();
    });
    await new Promise((r) => setTimeout(r, 20));
    const closed = closeServer(server, 2000);
    expect(await response).toBe('done');
    await closed;
    expect(server.listening).toBe(false);
  });
});
