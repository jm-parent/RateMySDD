import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { SessionStore } from '../../src/server/auth/session-store.js';
import { parseConfig } from '../../src/server/config.js';
import { createTestDependencies } from '../../src/server/testing/test-mode.js';

vi.mock('@fastify/static', () => {
  throw new Error('Vercel API functions must not load @fastify/static.');
});

let closeApp: (() => Promise<void>) | undefined;

afterEach(async () => {
  await closeApp?.();
  closeApp = undefined;
  vi.unstubAllEnvs();
});

describe('Vercel static asset handling', () => {
  it('builds the API app without loading the static plugin', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('NODE_ENV', 'test');
    const config = parseConfig({
      GITHUB_OAUTH_CLIENT_ID: 'test-client-id',
      NODE_ENV: 'test',
      RMSDD_TEST_MODE: '1',
    });
    const { engine, deviceFlow } = createTestDependencies();
    const app = await buildApp({
      config,
      engine,
      deviceFlow,
      sessionStore: new SessionStore((token) => engine.release(token)),
    });
    closeApp = () => app.close();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { host: '127.0.0.1:5178' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ authenticated: false });
  });
});