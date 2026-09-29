import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiErrorSchema, DiagnosticSnapshotSchema } from '../../src/shared/schemas.js';

const { createServerRuntime } = vi.hoisted(() => ({
  createServerRuntime: vi.fn(),
}));

vi.mock('../../src/server/index.js', () => ({ createServerRuntime }));

import handler from '../../api/[...path].js';

let httpServer: ReturnType<typeof createHttpServer> | undefined;
let app: ReturnType<typeof Fastify> | undefined;

async function startHandlerServer(): Promise<string> {
  httpServer = createHttpServer((request, response) => {
    void handler(request, response);
  });
  await new Promise<void>((resolve, reject) => {
    httpServer?.once('error', reject);
    httpServer?.listen(0, '127.0.0.1', resolve);
  });
  const address = httpServer.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

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
  it('includes the Copilot Linux runtime package in every API function bundle', async () => {
    const vercelConfig = JSON.parse(
      await readFile(resolve(process.cwd(), 'vercel.json'), 'utf8'),
    ) as {
      functions?: Record<string, { includeFiles?: string }>;
    };

    expect(vercelConfig.functions?.['api/**/*.ts']).toMatchObject({
      includeFiles: 'node_modules/@github/copilot-sdk-linux-x64/**',
    });
  });

  it('returns a diagnostic snapshot after startup fails without initializing the runtime', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'rate-my-sdd.vercel.app');
    vi.stubEnv('GITHUB_OAUTH_CLIENT_ID', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'redis-secret');
    vi.stubEnv('SESSION_ENCRYPTION_KEY', '7b'.repeat(32));
    vi.stubEnv('DIAGNOSTICS_TOKEN', 'admin-diagnostics-token');
    const baseUrl = await startHandlerServer();

    const failedSession = await fetch(`${baseUrl}/api/session`);
    const failureBody: unknown = await failedSession.json();
    const parsedFailure = ApiErrorSchema.safeParse(failureBody);

    expect(failedSession.status).toBe(500);
    expect(parsedFailure.success).toBe(true);
    if (!parsedFailure.success) {
      return;
    }
    expect(parsedFailure.data.diagnosticId).toBe(
      failedSession.headers.get('x-diagnostic-id'),
    );
    expect(createServerRuntime).not.toHaveBeenCalled();

    const diagnosticResponse = await fetch(`${baseUrl}/api/diagnostics`, {
      headers: { Authorization: 'Bearer admin-diagnostics-token' },
    });
    const snapshot: unknown = await diagnosticResponse.json();

    expect(diagnosticResponse.status).toBe(200);
    expect(diagnosticResponse.headers.get('cache-control')).toBe('no-store');
    const parsedSnapshot = DiagnosticSnapshotSchema.safeParse(snapshot);
    expect(parsedSnapshot.success).toBe(true);
    if (!parsedSnapshot.success) {
      return;
    }
    expect(parsedSnapshot.data.runtime).toBe('failed');
    expect(
      parsedSnapshot.data.environment.find(
        ({ key }) => key === 'GITHUB_OAUTH_CLIENT_ID',
      )?.status,
    ).toBe('missing');
    expect(parsedSnapshot.data.events.at(-1)).toMatchObject({
      requestId: parsedFailure.data.diagnosticId,
      source: 'startup',
      errorType: 'ConfigurationError',
    });
    expect(JSON.stringify(snapshot)).not.toContain('redis-secret');
    expect(JSON.stringify(snapshot)).not.toContain('7b'.repeat(32));
  });

  it('does not return diagnostics or initialize the runtime for an invalid token', async () => {
    vi.stubEnv('DIAGNOSTICS_TOKEN', 'admin-diagnostics-token');
    const baseUrl = await startHandlerServer();

    const response = await fetch(`${baseUrl}/api/diagnostics`, {
      headers: { Authorization: 'Bearer wrong-token' },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Diagnostic indisponible.',
    });
    expect(createServerRuntime).not.toHaveBeenCalled();
  });

  it('dispatches /api/session to the Fastify application', async () => {
    vi.stubEnv('GITHUB_OAUTH_CLIENT_ID', 'test-client-id');
    app = Fastify();
    app.get('/api/session', async () => ({ authenticated: false }));
    await app.ready();
    createServerRuntime.mockResolvedValue({ app } as never);
    const baseUrl = await startHandlerServer();

    const response = await fetch(`${baseUrl}/api/session`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authenticated: false });
  });
});