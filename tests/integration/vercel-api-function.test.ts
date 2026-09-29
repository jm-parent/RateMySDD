import { createServer as createHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { createServerRuntime } = vi.hoisted(() => ({
  createServerRuntime: vi.fn(),
}));

vi.mock('../../src/server/index.js', () => ({ createServerRuntime }));

import handler from '../../api/[...path].js';

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

describe('Vercel API function', () => {
  it('dispatches /api/session to the Fastify application', async () => {
    vi.stubEnv('GITHUB_OAUTH_CLIENT_ID', 'test-client-id');
    app = Fastify();
    app.get('/api/session', async () => ({ authenticated: false }));
    await app.ready();
    createServerRuntime.mockResolvedValue({ app } as never);

    httpServer = createHttpServer((request, response) => {
      void handler(request, response);
    });
    await new Promise<void>((resolve, reject) => {
      httpServer?.once('error', reject);
      httpServer?.listen(0, '127.0.0.1', resolve);
    });
    const address = httpServer.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${address.port}/api/session`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authenticated: false });
  });
});