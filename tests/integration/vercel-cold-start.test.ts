import { createServer as createHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiErrorSchema,
  DiagnosticSnapshotSchema,
} from '../../src/shared/schemas.js';

vi.mock('../../src/server/index.js', () => {
  throw new Error('Copilot runtime module failed to load');
});

import handler from '../../api/[...path].js';

let httpServer: ReturnType<typeof createHttpServer> | undefined;

afterEach(async () => {
  const server = httpServer;
  httpServer = undefined;
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  vi.unstubAllEnvs();
});

describe('Vercel cold-start diagnostics', () => {
  it('keeps diagnostics available when the Copilot runtime module fails to load', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'rate-my-sdd.vercel.app');
    vi.stubEnv('GITHUB_OAUTH_CLIENT_ID', 'client-id');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'redis-secret');
    vi.stubEnv('SESSION_ENCRYPTION_KEY', '7b'.repeat(32));
    vi.stubEnv('DIAGNOSTICS_TOKEN', 'admin-diagnostics-token');

    httpServer = createHttpServer((request, response) => {
      void handler(request, response);
    });
    await new Promise<void>((resolve, reject) => {
      httpServer?.once('error', reject);
      httpServer?.listen(0, '127.0.0.1', resolve);
    });
    const address = httpServer.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const sessionResponse = await fetch(`${baseUrl}/api/session`);
    const sessionError = ApiErrorSchema.safeParse(await sessionResponse.json());
    expect(sessionResponse.status).toBe(500);
    expect(sessionError.success).toBe(true);
    if (!sessionError.success) {
      return;
    }

    const diagnosticResponse = await fetch(`${baseUrl}/api/diagnostics`, {
      headers: { Authorization: 'Bearer admin-diagnostics-token' },
    });
    const snapshot = DiagnosticSnapshotSchema.safeParse(
      await diagnosticResponse.json(),
    );

    expect(diagnosticResponse.status).toBe(200);
    expect(diagnosticResponse.headers.get('cache-control')).toBe('no-store');
    expect(snapshot.success).toBe(true);
    if (!snapshot.success) {
      return;
    }
    expect(snapshot.data.runtime).toBe('failed');
    expect(snapshot.data.events.at(-1)).toMatchObject({
      requestId: sessionError.data.diagnosticId,
      source: 'startup',
      errorType: 'Error',
      message: 'Une erreur serveur a été détectée.',
    });
    expect(JSON.stringify(snapshot.data)).not.toContain('redis-secret');
    expect(JSON.stringify(snapshot.data)).not.toContain('7b'.repeat(32));
  });
});