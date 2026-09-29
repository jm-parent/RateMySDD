import { createServer as createHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { createServerRuntime } = vi.hoisted(() => ({
  createServerRuntime: vi.fn(),
}));

vi.mock('../../src/server/index.js', () => ({ createServerRuntime }));

import startHandler from '../../api/auth/device/start.js';
import pollHandler from '../../api/auth/device/poll.js';
import logoutHandler from '../../api/auth/logout.js';

let httpServer: ReturnType<typeof createHttpServer> | undefined;
let app: ReturnType<typeof Fastify> | undefined;

afterEach(async () => {
  const server = httpServer;
  httpServer = undefined;
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  const currentApp = app;
  app = undefined;
  await currentApp?.close();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('Vercel nested auth function routes', () => {
  it('dispatches each nested auth URL to the shared Fastify handler', async () => {
    vi.stubEnv('GITHUB_OAUTH_CLIENT_ID', 'test-client-id');
    app = Fastify();
    app.post('/api/auth/device/start', async () => ({ route: 'device-start' }));
    app.post('/api/auth/device/poll', async () => ({ route: 'device-poll' }));
    app.post('/api/auth/logout', async () => ({ route: 'logout' }));
    await app.ready();
    createServerRuntime.mockResolvedValue({ app } as never);

    const handlers = new Map([
      ['/api/auth/device/start', startHandler],
      ['/api/auth/device/poll', pollHandler],
      ['/api/auth/logout', logoutHandler],
    ]);
    httpServer = createHttpServer((request, response) => {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      const handler = handlers.get(path);
      if (!handler) {
        response.statusCode = 404;
        response.end();
        return;
      }
      void handler(request, response);
    });
    await new Promise<void>((resolve, reject) => {
      httpServer?.once('error', reject);
      httpServer?.listen(0, '127.0.0.1', resolve);
    });
    const address = httpServer.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    for (const [path, expectedRoute] of [
      ['/api/auth/device/start', 'device-start'],
      ['/api/auth/device/poll', 'device-poll'],
      ['/api/auth/logout', 'logout'],
    ]) {
      const response = await fetch(`${baseUrl}${path}`, { method: 'POST' });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ route: expectedRoute });
    }
  });
});