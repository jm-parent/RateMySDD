import type {
  AuditorSession,
  PendingAuthorization,
  PendingAuthorizationClaim,
  SessionRepository,
} from './session-store.js';
import { SESSION_TTL_MS } from './session-store.js';
import type { SecretBox } from '../security/secret-box.js';

export interface RedisSessionClient {
  get<TData>(key: string): Promise<TData | null>;
  set(
    key: string,
    value: string,
    options?: { ex?: number; nx?: boolean },
  ): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  eval<TData = unknown>(
    script: string,
    keys: string[],
    args: (string | number)[],
  ): Promise<TData>;
  scan(
    cursor: number | string,
    options?: { match?: string; count?: number },
  ): Promise<[number | string, string[]]>;
}

type StoredSession = Omit<AuditorSession, 'accessToken'> & {
  accessToken: string;
};

type StoredAuthorization = Omit<PendingAuthorization, 'deviceCode'> & {
  deviceCode: string;
};

const UPDATE_IF_PRESENT = `
  if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
  redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
  return 1
`;

const DELETE_AND_RETURN = `
  local value = redis.call('GET', KEYS[1])
  redis.call('DEL', KEYS[1])
  return value
`;

const RELEASE_AUDIT_LOCK = `
  if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
  return redis.call('DEL', KEYS[1])
`;

const CLAIM_PENDING_AUTHORIZATION = `
  local stored = redis.call('GET', KEYS[1])
  if not stored then return cjson.encode({ status = 'missing' }) end
  local authorization = cjson.decode(stored)
  local now = tonumber(ARGV[1])
  if tonumber(authorization.expiresAt) <= now then
    redis.call('DEL', KEYS[1])
    return cjson.encode({ status = 'missing' })
  end
  if now - tonumber(authorization.lastPollAt) < tonumber(authorization.interval) * 1000 then
    return cjson.encode({ status = 'not_due', interval = authorization.interval })
  end
  authorization.lastPollAt = now
  local ttl = math.max(1, math.ceil((tonumber(authorization.expiresAt) - now) / 1000))
  redis.call('SET', KEYS[1], cjson.encode(authorization), 'EX', ttl)
  return cjson.encode({ status = 'claimed', authorization = authorization })
`;

function ttlSeconds(expiresAt: number): number {
  return Math.max(1, Math.ceil((expiresAt - Date.now()) / 1_000));
}

function parseRecord<TRecord>(value: unknown): TRecord | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  return (typeof value === 'string' ? JSON.parse(value) : value) as TRecord;
}

export class RedisSessionRepository implements SessionRepository {
  readonly persistent = true;

  constructor(
    private readonly redis: RedisSessionClient,
    private readonly secretBox: SecretBox,
    private readonly prefix = 'ratemysdd:v1',
  ) {}

  async createSession(session: AuditorSession): Promise<void> {
    const stored: StoredSession = {
      ...session,
      accessToken: this.secretBox.encrypt(session.accessToken),
    };
    await this.redis.set(
      this.sessionKey(session.sessionId),
      JSON.stringify(stored),
      { ex: ttlSeconds(session.expiresAt) },
    );
  }

  async getSession(sessionId: string): Promise<AuditorSession | undefined> {
    const stored = parseRecord<StoredSession>(
      await this.redis.get<string | StoredSession>(this.sessionKey(sessionId)),
    );
    return stored
      ? { ...stored, accessToken: this.secretBox.decrypt(stored.accessToken) }
      : undefined;
  }

  async updateSession(session: AuditorSession): Promise<boolean> {
    const stored: StoredSession = {
      ...session,
      accessToken: this.secretBox.encrypt(session.accessToken),
    };
    const result = await this.redis.eval<number>(
      UPDATE_IF_PRESENT,
      [this.sessionKey(session.sessionId)],
      [JSON.stringify(stored), ttlSeconds(session.expiresAt)],
    );
    return result === 1;
  }

  async deleteSession(sessionId: string): Promise<AuditorSession | undefined> {
    const raw = await this.redis.eval<string | StoredSession | null>(
      DELETE_AND_RETURN,
      [this.sessionKey(sessionId)],
      [],
    );
    const stored = parseRecord<StoredSession>(raw);
    return stored
      ? { ...stored, accessToken: this.secretBox.decrypt(stored.accessToken) }
      : undefined;
  }

  async listSessions(): Promise<AuditorSession[]> {
    const sessions: AuditorSession[] = [];
    let cursor: number | string = 0;
    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, {
        match: `${this.prefix}:session:*`,
        count: 100,
      });
      const stored = await Promise.all(
        keys.map((key) => this.redis.get<string | StoredSession>(key)),
      );
      for (const value of stored) {
        const session = parseRecord<StoredSession>(value);
        if (session) {
          sessions.push({
            ...session,
            accessToken: this.secretBox.decrypt(session.accessToken),
          });
        }
      }
      cursor = nextCursor;
    } while (String(cursor) !== '0');
    return sessions;
  }

  async createPendingAuthorization(
    authorization: PendingAuthorization,
  ): Promise<void> {
    const stored: StoredAuthorization = {
      ...authorization,
      deviceCode: this.secretBox.encrypt(authorization.deviceCode),
    };
    await this.redis.set(
      this.authorizationKey(authorization.preAuthId),
      JSON.stringify(stored),
      { ex: ttlSeconds(authorization.expiresAt) },
    );
  }

  async getPendingAuthorization(
    preAuthId: string,
  ): Promise<PendingAuthorization | undefined> {
    const stored = parseRecord<StoredAuthorization>(
      await this.redis.get<string | StoredAuthorization>(
        this.authorizationKey(preAuthId),
      ),
    );
    return stored
      ? { ...stored, deviceCode: this.secretBox.decrypt(stored.deviceCode) }
      : undefined;
  }

  async claimPendingAuthorization(
    preAuthId: string,
    now: number,
  ): Promise<PendingAuthorizationClaim> {
    const raw = await this.redis.eval<
      | string
      | { status: 'missing' }
      | { status: 'not_due'; interval: number }
      | { status: 'claimed'; authorization: StoredAuthorization }
    >(
      CLAIM_PENDING_AUTHORIZATION,
      [this.authorizationKey(preAuthId)],
      [now],
    );
    const result = (typeof raw === 'string' ? JSON.parse(raw) : raw) as
      | { status: 'missing' }
      | { status: 'not_due'; interval: number }
      | { status: 'claimed'; authorization: StoredAuthorization };
    if (result.status !== 'claimed') {
      return result;
    }
    return {
      status: 'claimed',
      authorization: {
        ...result.authorization,
        deviceCode: this.secretBox.decrypt(result.authorization.deviceCode),
      },
    };
  }

  async updatePendingAuthorization(
    authorization: PendingAuthorization,
  ): Promise<void> {
    const stored: StoredAuthorization = {
      ...authorization,
      deviceCode: this.secretBox.encrypt(authorization.deviceCode),
    };
    await this.redis.eval<number>(
      UPDATE_IF_PRESENT,
      [this.authorizationKey(authorization.preAuthId)],
      [JSON.stringify(stored), ttlSeconds(authorization.expiresAt)],
    );
  }

  async deletePendingAuthorization(preAuthId: string): Promise<void> {
    await this.redis.del(this.authorizationKey(preAuthId));
  }

  async acquireAuditLock(
    sessionId: string,
    ownerId: string,
    ttlMs: number,
  ): Promise<boolean> {
    const result = await this.redis.set(
      this.auditLockKey(sessionId),
      ownerId,
      { ex: ttlSeconds(Date.now() + ttlMs), nx: true },
    );
    return result === 'OK';
  }

  async releaseAuditLock(sessionId: string, ownerId: string): Promise<void> {
    await this.redis.eval<number>(
      RELEASE_AUDIT_LOCK,
      [this.auditLockKey(sessionId)],
      [ownerId],
    );
  }

  private sessionKey(sessionId: string): string {
    return `${this.prefix}:session:${sessionId}`;
  }

  private authorizationKey(preAuthId: string): string {
    return `${this.prefix}:authorization:${preAuthId}`;
  }

  private auditLockKey(sessionId: string): string {
    return `${this.prefix}:audit-lock:${sessionId}`;
  }
}

export { SESSION_TTL_MS };