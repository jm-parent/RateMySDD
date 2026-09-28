import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SESSION_TTL_MS,
  SessionStore,
  toPublicUser,
} from '../../src/server/auth/session-store.js';

afterEach(() => {
  vi.restoreAllMocks();
});

const auditor = {
  login: 'octo',
  name: 'Octo Cat',
  avatarUrl: 'https://avatars.example/octo',
  copilotAccess: 'active' as const,
  accessToken: 'access-token-secret',
};

describe('SessionStore', () => {
  it('keeps the access token private and creates an opaque session id', async () => {
    const store = new SessionStore();
    const session = await store.create(auditor);

    expect(session.sessionId).toMatch(/^[\w-]{43}$/);
    expect(session.accessToken).toBe('access-token-secret');
    expect(toPublicUser(session)).toEqual({
      login: 'octo',
      name: 'Octo Cat',
      avatarUrl: 'https://avatars.example/octo',
      copilotAccess: 'active',
    });
    expect(JSON.stringify(toPublicUser(session))).not.toContain('access-token-secret');
  });

  it('expires sessions after inactivity and releases the associated token', async () => {
    const released: string[] = [];
    const store = new SessionStore((token) => {
      released.push(token);
    });
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const session = await store.create(auditor);

    vi.spyOn(Date, 'now').mockReturnValue(now + SESSION_TTL_MS + 1);
    await expect(store.get(session.sessionId)).resolves.toBeUndefined();
    expect(released).toEqual(['access-token-secret']);
    await expect(store.all()).resolves.toEqual([]);
  });

  it('extends inactivity expiry when a session is touched', async () => {
    const store = new SessionStore();
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const session = await store.create(auditor);

    vi.spyOn(Date, 'now').mockReturnValue(now + SESSION_TTL_MS - 1);
    await store.touch(session);
    vi.spyOn(Date, 'now').mockReturnValue(now + SESSION_TTL_MS + 1);

    await expect(store.get(session.sessionId)).resolves.toBe(session);
  });

  it('replaces the previous auditor and releases the previous token', async () => {
    const released: string[] = [];
    const store = new SessionStore((token) => {
      released.push(token);
    });
    const first = await store.create(auditor);
    const second = await store.create({ ...auditor, accessToken: 'second-token' });

    expect(await store.get(first.sessionId)).toBeUndefined();
    expect(await store.get(second.sessionId)).toBe(second);
    expect(released).toEqual(['access-token-secret']);
  });

  it('stores a single pending device authorization bound to its pre-auth id', async () => {
    const store = new SessionStore();
    const authorization = store.createPendingAuthorization({
      deviceCode: 'device-code-secret',
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
      expiresIn: 600,
      interval: 5,
    });

    expect(authorization.preAuthId).toMatch(/^[\w-]{43}$/);
    expect(store.getPendingAuthorization('another-session')).toBeUndefined();
    expect(store.getPendingAuthorization(authorization.preAuthId)).toMatchObject({
      deviceCode: 'device-code-secret',
      interval: 5,
    });
    store.clearPendingAuthorization(authorization.preAuthId);
    expect(store.getPendingAuthorization(authorization.preAuthId)).toBeUndefined();
  });

  it('expires a pending device authorization', () => {
    const store = new SessionStore();
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const authorization = store.createPendingAuthorization({
      deviceCode: 'device-code-secret',
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
      expiresIn: 1,
      interval: 5,
    });
    vi.spyOn(Date, 'now').mockReturnValue(now + 1_001);

    expect(store.getPendingAuthorization(authorization.preAuthId)).toBeUndefined();
  });
});
