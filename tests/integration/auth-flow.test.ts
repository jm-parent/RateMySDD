import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { parseConfig } from '../../src/server/config.js';
import { SessionStore } from '../../src/server/auth/session-store.js';
import { FakeAuditEngine } from '../helpers/fake-engine.js';
import { FakeDeviceFlowClient } from '../helpers/fake-device-flow.js';

const localHeaders = {
  host: '127.0.0.1:5178',
  origin: 'http://127.0.0.1:5178',
};

function firstCookie(
  header: string | string[] | undefined,
  name: string,
): string | undefined {
  const values = Array.isArray(header) ? header : [header];
  const value =
    values.find((entry) => entry?.startsWith(`${name}=`)) ??
    values.find((entry) => entry?.includes(`${name}=`));
  return value?.split(';')[0];
}

describe('GitHub Copilot authentication flow', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  afterEach(async () => {
    await app?.close();
    vi.restoreAllMocks();
  });

  async function setup(
    polls: ConstructorParameters<typeof FakeDeviceFlowClient>[0],
    hasCopilotAccess = true,
  ) {
    const engine = new FakeAuditEngine([], hasCopilotAccess);
    const deviceFlow = new FakeDeviceFlowClient(polls);
    const sessionStore = new SessionStore((token: string) => engine.release(token));
    app = await buildApp({
      config: parseConfig({
        GITHUB_OAUTH_CLIENT_ID: 'test-client-id',
        NODE_ENV: 'test',
        RMSDD_TEST_MODE: '1',
      }),
      engine,
      deviceFlow,
      sessionStore,
    });
    await app.ready();
    return { engine, deviceFlow };
  }

  async function authorize(): Promise<{ sessionCookie: string; preAuthCookie: string }> {
    const start = await app.inject({
      method: 'POST',
      url: '/api/auth/device/start',
      headers: localHeaders,
    });
    const preAuthCookie = firstCookie(start.headers['set-cookie'], 'rmsdd_pre')!;
    const authorized = await app.inject({
      method: 'POST',
      url: '/api/auth/device/poll',
      headers: { ...localHeaders, cookie: preAuthCookie },
    });
    return {
      sessionCookie: firstCookie(authorized.headers['set-cookie'], 'rmsdd_sid')!,
      preAuthCookie,
    };
  }

  it('allows login without Copilot but marks the account as unable to audit', async () => {
    await setup([{ status: 'authorized', accessToken: 'no-copilot-token' }], false);
    const { sessionCookie } = await authorize();
    const session = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { host: localHeaders.host, cookie: sessionCookie },
    });

    expect(session.json()).toMatchObject({
      authenticated: true,
      user: { login: 'octo', copilotAccess: 'none' },
    });
  });

  it('increases polling interval by five seconds after GitHub returns slow_down', async () => {
    const { deviceFlow } = await setup([
      { status: 'slow_down' },
      { status: 'pending' },
    ]);
    const start = await app.inject({
      method: 'POST',
      url: '/api/auth/device/start',
      headers: localHeaders,
    });
    const preAuthCookie = firstCookie(start.headers['set-cookie'], 'rmsdd_pre')!;
    const firstPollTime = Date.now();
    const slowed = await app.inject({
      method: 'POST',
      url: '/api/auth/device/poll',
      headers: { ...localHeaders, cookie: preAuthCookie },
    });
    expect(slowed.json()).toMatchObject({ status: 'slow_down', interval: 10 });
    expect(deviceFlow.polledDeviceCodes).toHaveLength(1);

    const tooSoon = await app.inject({
      method: 'POST',
      url: '/api/auth/device/poll',
      headers: { ...localHeaders, cookie: preAuthCookie },
    });
    expect(tooSoon.json()).toMatchObject({ status: 'pending', interval: 10 });
    expect(deviceFlow.polledDeviceCodes).toHaveLength(1);

    vi.spyOn(Date, 'now').mockReturnValue(firstPollTime + 15_000);
    const due = await app.inject({
      method: 'POST',
      url: '/api/auth/device/poll',
      headers: { ...localHeaders, cookie: preAuthCookie },
    });
    expect(due.json().status).toBe('pending');
    expect(deviceFlow.polledDeviceCodes).toHaveLength(2);
  });

  it.each(['denied', 'expired'] as const)(
    'does not create a session when authorization is %s',
    async (status) => {
      await setup([{ status }]);
      const { preAuthCookie } = await authorize();
      const session = await app.inject({
        method: 'GET',
        url: '/api/session',
        headers: { host: localHeaders.host, cookie: preAuthCookie },
      });
      expect(session.json()).toEqual({ authenticated: false });
    },
  );

  it('expires an idle session after eight hours and releases its Copilot client', async () => {
    const { engine } = await setup([
      { status: 'authorized', accessToken: 'expired-session-token' },
    ]);
    const initialTime = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(initialTime);
    const { sessionCookie } = await authorize();
    vi.spyOn(Date, 'now').mockReturnValue(initialTime + 8 * 60 * 60 * 1000 + 1);

    const session = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { host: localHeaders.host, cookie: sessionCookie },
    });
    expect(session.json()).toEqual({ authenticated: false });
    expect(engine.releasedTokens).toContain('expired-session-token');
  });

  it('publishes the session deadline without renewing it during a status read', async () => {
    const initialTime = Date.now();
    const sessionTtlMs = 8 * 60 * 60 * 1000;
    vi.spyOn(Date, 'now').mockReturnValue(initialTime);
    await setup([{ status: 'authorized', accessToken: 'deadline-session-token' }]);

    const start = await app.inject({
      method: 'POST',
      url: '/api/auth/device/start',
      headers: localHeaders,
    });
    const preAuthCookie = firstCookie(start.headers['set-cookie'], 'rmsdd_pre')!;
    const authorized = await app.inject({
      method: 'POST',
      url: '/api/auth/device/poll',
      headers: { ...localHeaders, cookie: preAuthCookie },
    });
    const sessionCookie = firstCookie(authorized.headers['set-cookie'], 'rmsdd_sid')!;
    const expectedExpiry = new Date(initialTime + sessionTtlMs).toISOString();

    expect(authorized.headers['x-session-expires-at']).toBe(expectedExpiry);

    vi.spyOn(Date, 'now').mockReturnValue(initialTime + sessionTtlMs / 2);
    const status = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { host: localHeaders.host, cookie: sessionCookie },
    });
    expect(status.json().authenticated).toBe(true);
    expect(status.headers['x-session-expires-at']).toBe(expectedExpiry);

    vi.spyOn(Date, 'now').mockReturnValue(initialTime + sessionTtlMs + 1);
    const expired = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { host: localHeaders.host, cookie: sessionCookie },
    });
    expect(expired.json()).toEqual({ authenticated: false });
    expect(expired.headers['x-session-expires-at']).toBeUndefined();
  });

  it('invalidates the old session and releases its client when a new user signs in', async () => {
    const { engine } = await setup([
      { status: 'authorized', accessToken: 'first-token' },
      { status: 'authorized', accessToken: 'second-token' },
    ]);
    const first = await authorize();
    const firstTime = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(firstTime + 5_000);
    const second = await authorize();

    const oldSession = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { host: localHeaders.host, cookie: first.sessionCookie },
    });
    const newSession = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { host: localHeaders.host, cookie: second.sessionCookie },
    });
    expect(oldSession.json()).toEqual({ authenticated: false });
    expect(newSession.json().authenticated).toBe(true);
    expect(engine.releasedTokens).toContain('first-token');
  });

  it('rejects a stale session cookie after logout', async () => {
    await setup([{ status: 'authorized', accessToken: 'logout-token' }]);
    const { sessionCookie } = await authorize();
    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { ...localHeaders, cookie: sessionCookie },
    });
    const secondLogout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { ...localHeaders, cookie: sessionCookie },
    });

    expect(logout.statusCode).toBe(204);
    expect(secondLogout.statusCode).toBe(401);
    expect(secondLogout.json().code).toBe('UNAUTHENTICATED');
  });
});
