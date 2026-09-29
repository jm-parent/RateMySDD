import { describe, expect, it } from 'vitest';
import {
  RedisSessionRepository,
  type RedisSessionClient,
} from '../../src/server/auth/redis-session-repository.js';
import { SESSION_TTL_MS, SessionStore } from '../../src/server/auth/session-store.js';
import { SecretBox } from '../../src/server/security/secret-box.js';

class MemoryRedis implements RedisSessionClient {
  readonly values = new Map<string, string>();
  readonly expirations = new Map<string, number>();

  async get<TData>(key: string): Promise<TData | null> {
    const value = this.values.get(key);
    if (value === undefined) {
      return null;
    }
    try {
      return JSON.parse(value) as TData;
    } catch {
      return value as TData;
    }
  }

  async set(
    key: string,
    value: string,
    options?: { ex?: number; nx?: boolean },
  ): Promise<'OK' | null> {
    if (options?.nx && this.values.has(key)) {
      return null;
    }
    this.values.set(key, value);
    if (options?.ex) {
      this.expirations.set(key, options.ex);
    }
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      deleted += Number(this.values.delete(key));
      this.expirations.delete(key);
    }
    return deleted;
  }

  async eval<TData>(
    script: string,
    keys: string[],
    args: (string | number)[],
  ): Promise<TData> {
    const key = keys[0]!;
    if (script.includes('local value =')) {
      const value = this.values.get(key) ?? null;
      await this.del(key);
      return (value === null ? null : JSON.parse(value)) as TData;
    }
    if (script.includes("redis.call('GET', KEYS[1]) ~= ARGV[1]")) {
      if (this.values.get(key) !== String(args[0])) {
        return 0 as TData;
      }
      await this.del(key);
      return 1 as TData;
    }
    if (script.includes("local stored = redis.call('GET', KEYS[1])")) {
      const raw = this.values.get(key);
      if (!raw) {
        return JSON.stringify({ status: 'missing' }) as TData;
      }
      const authorization = JSON.parse(raw) as {
        expiresAt: number;
        interval: number;
        lastPollAt: number;
      };
      const now = Number(args[0]);
      if (authorization.expiresAt <= now) {
        await this.del(key);
        return JSON.stringify({ status: 'missing' }) as TData;
      }
      if (now - authorization.lastPollAt < authorization.interval * 1_000) {
        return JSON.stringify({
          status: 'not_due',
          interval: authorization.interval,
        }) as TData;
      }
      authorization.lastPollAt = now;
      const claimed = { ...JSON.parse(raw), lastPollAt: now };
      this.values.set(key, JSON.stringify(claimed));
      return { status: 'claimed', authorization: claimed } as TData;
    }
    if (!this.values.has(key)) {
      return 0 as TData;
    }
    this.values.set(key, String(args[0]));
    this.expirations.set(key, Number(args[1]));
    return 1 as TData;
  }

  async scan(
    _cursor: number | string,
    options?: { match?: string; count?: number },
  ): Promise<[number | string, string[]]> {
    const prefix = options?.match?.replace(/\*$/, '') ?? '';
    return [0, [...this.values.keys()].filter((key) => key.startsWith(prefix))];
  }
}

const user = {
  login: 'octo',
  name: 'Octo Cat',
  avatarUrl: null,
  copilotAccess: 'active' as const,
  accessToken: 'github-access-token-secret',
};

describe('RedisSessionRepository', () => {
  it('shares sessions and device flows without storing their secrets in plaintext', async () => {
    const redis = new MemoryRedis();
    const secretBox = new SecretBox('7b'.repeat(32));
    const firstStore = new SessionStore(
      undefined,
      new RedisSessionRepository(redis, secretBox),
    );
    const secondStore = new SessionStore(
      undefined,
      new RedisSessionRepository(redis, secretBox),
    );
    const session = await firstStore.create(user);
    const pending = await firstStore.createPendingAuthorization({
      deviceCode: 'device-code-secret',
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
      expiresIn: 600,
      interval: 5,
    });

    await expect(secondStore.get(session.sessionId)).resolves.toEqual(session);
    await expect(
      secondStore.getPendingAuthorization(pending.preAuthId),
    ).resolves.toMatchObject({ deviceCode: 'device-code-secret' });
    expect([...redis.values.values()].join('\n')).not.toContain(user.accessToken);
    expect([...redis.values.values()].join('\n')).not.toContain('device-code-secret');
    expect([...redis.expirations.values()]).toContain(Math.ceil(SESSION_TTL_MS / 1_000));
    expect([...redis.expirations.values()]).toContain(600);

    await firstStore.destroy(session.sessionId);
    await expect(secondStore.get(session.sessionId)).resolves.toBeUndefined();
  });

  it('locks one session across instances without blocking another session', async () => {
    const redis = new MemoryRedis();
    const firstStore = new SessionStore(
      undefined,
      new RedisSessionRepository(redis, new SecretBox('7b'.repeat(32))),
    );
    const secondStore = new SessionStore(
      undefined,
      new RedisSessionRepository(redis, new SecretBox('7b'.repeat(32))),
    );
    const firstSession = await firstStore.create(user);
    const secondSession = await firstStore.create({
      ...user,
      login: 'another-user',
      accessToken: 'another-token',
    });

    await expect(
      firstStore.acquireAuditLock(firstSession.sessionId, 'first-audit', 60_000),
    ).resolves.toBe(true);
    await expect(
      secondStore.acquireAuditLock(firstSession.sessionId, 'second-audit', 60_000),
    ).resolves.toBe(false);
    await expect(
      secondStore.acquireAuditLock(secondSession.sessionId, 'other-user-audit', 60_000),
    ).resolves.toBe(true);

    await secondStore.releaseAuditLock(firstSession.sessionId, 'not-the-owner');
    await expect(
      secondStore.acquireAuditLock(firstSession.sessionId, 'third-audit', 60_000),
    ).resolves.toBe(false);
    await firstStore.releaseAuditLock(firstSession.sessionId, 'first-audit');
    await expect(
      secondStore.acquireAuditLock(firstSession.sessionId, 'third-audit', 60_000),
    ).resolves.toBe(true);
  });

  it('allows only one instance to claim the next Device Flow poll interval', async () => {
    const redis = new MemoryRedis();
    const firstStore = new SessionStore(
      undefined,
      new RedisSessionRepository(redis, new SecretBox('7b'.repeat(32))),
    );
    const secondStore = new SessionStore(
      undefined,
      new RedisSessionRepository(redis, new SecretBox('7b'.repeat(32))),
    );
    const pending = await firstStore.createPendingAuthorization({
      deviceCode: 'device-code-secret',
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
      expiresIn: 600,
      interval: 5,
    });
    const now = Date.now();
    const claims = await Promise.all([
      firstStore.claimPendingAuthorization(pending.preAuthId, now),
      secondStore.claimPendingAuthorization(pending.preAuthId, now),
    ]);

    expect(claims.filter((claim) => claim.status === 'claimed')).toHaveLength(1);
    expect(claims.filter((claim) => claim.status === 'not_due')).toHaveLength(1);
  });
});