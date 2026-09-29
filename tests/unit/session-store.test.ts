import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SESSION_TTL_MS,
  MemorySessionRepository,
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

  it('keeps auditor sessions independent and releases only the destroyed token', async () => {
    const released: string[] = [];
    const store = new SessionStore((token) => {
      released.push(token);
    });
    const first = await store.create(auditor);
    const second = await store.create({
      ...auditor,
      login: 'another-user',
      accessToken: 'second-token',
    });

    expect(await store.get(first.sessionId)).toBe(first);
    expect(await store.get(second.sessionId)).toBe(second);

    await store.destroy(first.sessionId);

    expect(await store.get(first.sessionId)).toBeUndefined();
    expect(await store.get(second.sessionId)).toBe(second);
    expect(released).toEqual(['access-token-secret']);
  });

  it('shares independent sessions between store instances using the same repository', async () => {
    const repository = new MemorySessionRepository();
    const firstStore = new SessionStore(undefined, repository);
    const secondStore = new SessionStore(undefined, repository);
    const first = await firstStore.create(auditor);
    const second = await secondStore.create({
      ...auditor,
      login: 'another-user',
      accessToken: 'second-token',
    });

    await expect(secondStore.get(first.sessionId)).resolves.toEqual(first);
    await expect(firstStore.get(second.sessionId)).resolves.toEqual(second);
  });

  it('keeps pending device authorizations independent by pre-auth id', async () => {
    const store = new SessionStore();
    const first = await store.createPendingAuthorization({
      deviceCode: 'device-code-secret',
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
      expiresIn: 600,
      interval: 5,
    });
    const second = await store.createPendingAuthorization({
      deviceCode: 'another-device-code',
      userCode: 'EFGH-5678',
      verificationUri: 'https://github.com/login/device',
      expiresIn: 600,
      interval: 5,
    });

    expect(first.preAuthId).toMatch(/^[\w-]{43}$/);
    expect(second.preAuthId).toMatch(/^[\w-]{43}$/);
    await expect(store.getPendingAuthorization('another-session')).resolves.toBeUndefined();
    await expect(store.getPendingAuthorization(first.preAuthId)).resolves.toMatchObject({
      deviceCode: 'device-code-secret',
      interval: 5,
    });
    await expect(store.getPendingAuthorization(second.preAuthId)).resolves.toMatchObject({
      deviceCode: 'another-device-code',
      interval: 5,
    });
    await store.clearPendingAuthorization(first.preAuthId);
    await expect(store.getPendingAuthorization(first.preAuthId)).resolves.toBeUndefined();
    await expect(store.getPendingAuthorization(second.preAuthId)).resolves.toBeDefined();
  });

  it('expires a pending device authorization', async () => {
    const store = new SessionStore();
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const authorization = await store.createPendingAuthorization({
      deviceCode: 'device-code-secret',
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
      expiresIn: 1,
      interval: 5,
    });
    vi.spyOn(Date, 'now').mockReturnValue(now + 1_001);

    await expect(
      store.getPendingAuthorization(authorization.preAuthId),
    ).resolves.toBeUndefined();
  });
});
