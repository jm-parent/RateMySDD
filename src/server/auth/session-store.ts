import { randomBytes } from 'node:crypto';
import type { User } from '../../shared/schemas.js';

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export interface AuditorSession {
  sessionId: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  copilotAccess: 'active' | 'none';
  accessToken: string;
  expiresAt: number;
  auditInProgress: boolean;
}

export interface NewAuditorSession {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  copilotAccess: 'active' | 'none';
  accessToken: string;
}

export interface PendingAuthorizationInput {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export interface PendingAuthorization extends PendingAuthorizationInput {
  preAuthId: string;
  expiresAt: number;
  lastPollAt: number;
}

export type PendingAuthorizationClaim =
  | { status: 'missing' }
  | { status: 'not_due'; interval: number }
  | { status: 'claimed'; authorization: PendingAuthorization };

export interface SessionRepository {
  readonly persistent: boolean;
  createSession(session: AuditorSession): Promise<void>;
  getSession(sessionId: string): Promise<AuditorSession | undefined>;
  updateSession(session: AuditorSession): Promise<boolean>;
  deleteSession(sessionId: string): Promise<AuditorSession | undefined>;
  listSessions(): Promise<AuditorSession[]>;
  createPendingAuthorization(authorization: PendingAuthorization): Promise<void>;
  getPendingAuthorization(preAuthId: string): Promise<PendingAuthorization | undefined>;
  claimPendingAuthorization(
    preAuthId: string,
    now: number,
  ): Promise<PendingAuthorizationClaim>;
  updatePendingAuthorization(authorization: PendingAuthorization): Promise<void>;
  deletePendingAuthorization(preAuthId: string): Promise<void>;
  acquireAuditLock(sessionId: string, ownerId: string, ttlMs: number): Promise<boolean>;
  releaseAuditLock(sessionId: string, ownerId: string): Promise<void>;
}

export class MemorySessionRepository implements SessionRepository {
  readonly persistent = false;
  private readonly auditors = new Map<string, AuditorSession>();
  private readonly pendingAuthorizations = new Map<string, PendingAuthorization>();
  private readonly auditLocks = new Map<string, { ownerId: string; expiresAt: number }>();

  async createSession(session: AuditorSession): Promise<void> {
    this.auditors.set(session.sessionId, session);
  }

  async getSession(sessionId: string): Promise<AuditorSession | undefined> {
    return this.auditors.get(sessionId);
  }

  async updateSession(session: AuditorSession): Promise<boolean> {
    const current = this.auditors.get(session.sessionId);
    if (!current) {
      return false;
    }
    Object.assign(current, session);
    return true;
  }

  async deleteSession(sessionId: string): Promise<AuditorSession | undefined> {
    const session = this.auditors.get(sessionId);
    this.auditors.delete(sessionId);
    return session;
  }

  async listSessions(): Promise<AuditorSession[]> {
    return [...this.auditors.values()];
  }

  async createPendingAuthorization(
    authorization: PendingAuthorization,
  ): Promise<void> {
    this.pendingAuthorizations.set(authorization.preAuthId, authorization);
  }

  async getPendingAuthorization(
    preAuthId: string,
  ): Promise<PendingAuthorization | undefined> {
    return this.pendingAuthorizations.get(preAuthId);
  }

  async claimPendingAuthorization(
    preAuthId: string,
    now: number,
  ): Promise<PendingAuthorizationClaim> {
    const authorization = this.pendingAuthorizations.get(preAuthId);
    if (!authorization || authorization.expiresAt <= now) {
      this.pendingAuthorizations.delete(preAuthId);
      return { status: 'missing' };
    }
    if (now - authorization.lastPollAt < authorization.interval * 1_000) {
      return { status: 'not_due', interval: authorization.interval };
    }
    authorization.lastPollAt = now;
    return { status: 'claimed', authorization: { ...authorization } };
  }

  async updatePendingAuthorization(
    authorization: PendingAuthorization,
  ): Promise<void> {
    if (this.pendingAuthorizations.has(authorization.preAuthId)) {
      this.pendingAuthorizations.set(authorization.preAuthId, authorization);
    }
  }

  async deletePendingAuthorization(preAuthId: string): Promise<void> {
    this.pendingAuthorizations.delete(preAuthId);
  }

  async acquireAuditLock(
    sessionId: string,
    ownerId: string,
    ttlMs: number,
  ): Promise<boolean> {
    const existing = this.auditLocks.get(sessionId);
    if (existing && existing.expiresAt > Date.now()) {
      return false;
    }
    this.auditLocks.set(sessionId, { ownerId, expiresAt: Date.now() + ttlMs });
    return true;
  }

  async releaseAuditLock(sessionId: string, ownerId: string): Promise<void> {
    if (this.auditLocks.get(sessionId)?.ownerId === ownerId) {
      this.auditLocks.delete(sessionId);
    }
  }
}

export function toPublicUser(session: AuditorSession): User {
  return {
    login: session.login,
    name: session.name,
    avatarUrl: session.avatarUrl,
    copilotAccess: session.copilotAccess,
  };
}

export class SessionStore {
  constructor(
    private readonly releaseToken?: (token: string) => Promise<void> | void,
    private readonly repository: SessionRepository = new MemorySessionRepository(),
  ) {}

  get persistent(): boolean {
    return this.repository.persistent;
  }

  async create(input: NewAuditorSession): Promise<AuditorSession> {
    const session: AuditorSession = {
      ...input,
      sessionId: randomBytes(32).toString('base64url'),
      expiresAt: Date.now() + SESSION_TTL_MS,
      auditInProgress: false,
    };
    await this.repository.createSession(session);
    return session;
  }

  async get(sessionId: string | undefined): Promise<AuditorSession | undefined> {
    if (!sessionId) {
      return undefined;
    }
    const session = await this.repository.getSession(sessionId);
    if (!session) {
      return undefined;
    }
    if (session.expiresAt <= Date.now()) {
      await this.destroy(session.sessionId);
      return undefined;
    }
    return session;
  }

  async touch(session: AuditorSession): Promise<void> {
    const updated = { ...session, expiresAt: Date.now() + SESSION_TTL_MS };
    if (await this.repository.updateSession(updated)) {
      session.expiresAt = updated.expiresAt;
    }
  }

  async destroy(sessionId: string | undefined): Promise<void> {
    if (!sessionId) {
      return;
    }

    const session = await this.repository.deleteSession(sessionId);
    if (!session) {
      return;
    }
    try {
      await this.releaseToken?.(session.accessToken);
    } catch {
      // The in-memory session stays revoked even when runtime cleanup fails.
    }
  }

  async all(): Promise<AuditorSession[]> {
    const sessions: AuditorSession[] = [];
    for (const session of await this.repository.listSessions()) {
      if (session.expiresAt <= Date.now()) {
        await this.destroy(session.sessionId);
      } else {
        sessions.push(session);
      }
    }
    return sessions;
  }

  async createPendingAuthorization(
    input: PendingAuthorizationInput,
  ): Promise<PendingAuthorization> {
    const now = Date.now();
    const authorization: PendingAuthorization = {
      ...input,
      preAuthId: randomBytes(32).toString('base64url'),
      expiresAt: now + input.expiresIn * 1000,
      lastPollAt: now - input.interval * 1000,
    };
    await this.repository.createPendingAuthorization(authorization);
    return authorization;
  }

  async getPendingAuthorization(
    preAuthId: string | undefined,
  ): Promise<PendingAuthorization | undefined> {
    if (!preAuthId) {
      return undefined;
    }
    const pending = await this.repository.getPendingAuthorization(preAuthId);
    if (!pending) {
      return undefined;
    }
    if (pending.expiresAt <= Date.now()) {
      await this.repository.deletePendingAuthorization(preAuthId);
      return undefined;
    }
    return pending;
  }

  async claimPendingAuthorization(
    preAuthId: string | undefined,
    now = Date.now(),
  ): Promise<PendingAuthorizationClaim> {
    if (!preAuthId) {
      return { status: 'missing' };
    }
    return this.repository.claimPendingAuthorization(preAuthId, now);
  }

  async updatePendingAuthorization(
    authorization: PendingAuthorization,
  ): Promise<void> {
    await this.repository.updatePendingAuthorization(authorization);
  }

  async clearPendingAuthorization(preAuthId: string | undefined): Promise<void> {
    if (preAuthId) {
      await this.repository.deletePendingAuthorization(preAuthId);
    }
  }

  async acquireAuditLock(
    sessionId: string,
    ownerId: string,
    ttlMs: number,
  ): Promise<boolean> {
    return this.repository.acquireAuditLock(sessionId, ownerId, ttlMs);
  }

  async releaseAuditLock(sessionId: string, ownerId: string): Promise<void> {
    await this.repository.releaseAuditLock(sessionId, ownerId);
  }
}
