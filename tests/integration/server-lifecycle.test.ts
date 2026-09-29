import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { Writable } from 'node:stream';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDiagnosticEvents } from '../../src/server/diagnostics.js';
import { buildApp } from '../../src/server/app.js';
import { SessionStore } from '../../src/server/auth/session-store.js';
import { parseConfig } from '../../src/server/config.js';
import { DiagnosticSnapshotSchema } from '../../src/shared/schemas.js';
import { AppError } from '../../src/server/errors.js';
import { createTestDependencies } from '../../src/server/testing/test-mode.js';
import {
  createServerRuntime,
  startServer,
} from '../../src/server/index.js';

const temporaryDirectories: string[] = [];
let closeRuntime: (() => Promise<void>) | undefined;

afterEach(async () => {
  await closeRuntime?.();
  closeRuntime = undefined;
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  vi.unstubAllEnvs();
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'ratemysdd-server-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as AddressInfo;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

function testConfig(tmpDir: string, port = 5178) {
  return parseConfig({
    GITHUB_OAUTH_CLIENT_ID: 'test-client-id',
    NODE_ENV: 'test',
    PORT: String(port),
    RMSDD_TEST_MODE: '1',
    TMP_DIR: tmpDir,
  });
}

describe('server lifecycle', () => {
  it('serves protected environment diagnostics from the local Fastify app', async () => {
    const tmpDir = await temporaryDirectory();
    const adminToken = 'local-diagnostics-secret';
    vi.stubEnv('DIAGNOSTICS_TOKEN', adminToken);
    const runtime = await createServerRuntime(testConfig(tmpDir));
    closeRuntime = () => runtime.close();

    const denied = await runtime.app.inject({
      method: 'GET',
      url: '/api/diagnostics',
      headers: { host: '127.0.0.1:5178' },
    });
    expect(denied.statusCode).toBe(404);
    expect(denied.json()).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Diagnostic indisponible.',
    });

    const response = await runtime.app.inject({
      method: 'GET',
      url: '/api/diagnostics',
      headers: {
        host: '127.0.0.1:5178',
        authorization: `Bearer ${adminToken}`,
      },
    });
    const parsedSnapshot = DiagnosticSnapshotSchema.safeParse(response.json());

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(parsedSnapshot.success).toBe(true);
    if (!parsedSnapshot.success) {
      return;
    }
    expect(parsedSnapshot.data.runtime).toBe('ready');
    expect(
      parsedSnapshot.data.environment.find(
        ({ key }) => key === 'DIAGNOSTICS_TOKEN',
      ),
    ).toEqual({ key: 'DIAGNOSTICS_TOKEN', status: 'valid' });
    expect(JSON.stringify(parsedSnapshot.data)).not.toContain(adminToken);
  });

  it('correlates Fastify 5xx responses with an expurgated event and log', async () => {
    const logLines: string[] = [];
    const logStream = new Writable({
      write(chunk, _encoding, callback) {
        logLines.push(chunk.toString());
        callback();
      },
    });
    const { engine, deviceFlow } = createTestDependencies();
    const app = await buildApp({
      config: testConfig(await temporaryDirectory()),
      engine,
      deviceFlow,
      sessionStore: new SessionStore((token) => engine.release(token)),
      logStream,
    });

    app.get('/api/test-failure', async () => {
      throw new Error('sensitive exception detail');
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/test-failure',
        headers: {
          host: '127.0.0.1:5178',
          'x-diagnostic-id': 'diagnostic-test-id',
        },
      });

      expect(response.statusCode).toBe(500);
      expect(response.headers['x-diagnostic-id']).toBe('diagnostic-test-id');
      expect(response.json()).toMatchObject({
        code: 'INTERNAL_ERROR',
        diagnosticId: 'diagnostic-test-id',
      });
      expect(getDiagnosticEvents().at(-1)).toMatchObject({
        requestId: 'diagnostic-test-id',
        source: 'request',
        errorType: 'Error',
        message: 'Une erreur serveur a été détectée.',
      });
      expect(logLines.join('')).toContain('diagnostic-test-id');
      expect(logLines.join('')).not.toContain('sensitive exception detail');
    } finally {
      await app.close();
    }
  });

  it('shows a sanitized Copilot availability cause only in the admin event', async () => {
    const logLines: string[] = [];
    const logStream = new Writable({
      write(chunk, _encoding, callback) {
        logLines.push(chunk.toString());
        callback();
      },
    });
    const redisToken = 'redis-secret-from-provider-error';
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', redisToken);
    const { engine, deviceFlow } = createTestDependencies();
    const app = await buildApp({
      config: testConfig(await temporaryDirectory()),
      engine,
      deviceFlow,
      sessionStore: new SessionStore((token) => engine.release(token)),
      logStream,
    });

    app.get('/api/test-copilot-failure', async () => {
      throw new AppError('COPILOT_UNAVAILABLE', {
        cause: new Error(`Copilot runtime startup failed: ${redisToken}`),
      });
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/test-copilot-failure',
        headers: {
          host: '127.0.0.1:5178',
          'x-diagnostic-id': 'copilot-diagnostic-id',
        },
      });
      const event = getDiagnosticEvents().at(-1);

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({
        code: 'COPILOT_UNAVAILABLE',
        message: 'Le service Copilot est momentanément indisponible.',
      });
      expect(JSON.stringify(response.json())).not.toContain('Copilot runtime startup failed');
      expect(event).toMatchObject({
        requestId: 'copilot-diagnostic-id',
        source: 'request',
        errorType: 'AppError',
        message: 'Error: Copilot runtime startup failed: [redacted]',
      });
      expect(logLines.join('')).toContain('Copilot runtime startup failed: [redacted]');
      expect(logLines.join('')).not.toContain(redisToken);
    } finally {
      await app.close();
    }
  });

  it('purges the temporary directory before building the application', async () => {
    const tmpDir = await temporaryDirectory();
    const staleFile = join(tmpDir, 'copilot', 'session-state', 'old-session.json');
    await mkdir(join(tmpDir, 'copilot', 'session-state'), { recursive: true });
    await writeFile(staleFile, 'confidential stale data');

    const runtime = await createServerRuntime(testConfig(tmpDir));
    closeRuntime = () => runtime.close();

    await expect(readFile(staleFile, 'utf8')).rejects.toThrow();
    const response = await runtime.app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { host: '127.0.0.1:5178' },
    });
    expect(response.json()).toEqual({ authenticated: false });
  });

  it('listens only on loopback and serves the local API', async () => {
    const tmpDir = await temporaryDirectory();
    const runtime = await startServer(testConfig(tmpDir, await availablePort()));
    closeRuntime = () => runtime.close();
    const address = runtime.app.server.address() as AddressInfo;

    expect(address.address).toBe('127.0.0.1');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/session`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authenticated: false });
  });
});
