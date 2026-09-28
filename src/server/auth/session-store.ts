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

export function toPublicUser(session: AuditorSession): User {
  return {
    login: session.login,
    name: session.name,
    avatarUrl: session.avatarUrl,
    copilotAccess: session.copilotAccess,
  };
}

export class SessionStore {
  private auditor?: AuditorSession;
  private pendingAuthorization?: PendingAuthorization;

  constructor(private readonly releaseToken?: (token: string) => Promise<void> | void) {}

  async create(input: NewAuditorSession): Promise<AuditorSession> {
    if (this.auditor) {
      await this.destroy(this.auditor.sessionId);
    }

    const session: AuditorSession = {
      ...input,
      sessionId: randomBytes(32).toString('base64url'),
      expiresAt: Date.now() + SESSION_TTL_MS,
      auditInProgress: false,
    };
    this.auditor = session;
    return session;
  }

  async get(sessionId: string | undefined): Promise<AuditorSession | undefined> {
    const session = this.auditor;
    if (!session || session.sessionId !== sessionId) {
      return undefined;
    }
    if (session.expiresAt <= Date.now()) {
      await this.destroy(session.sessionId);
      return undefined;
    }
    return session;
  }

  async touch(session: AuditorSession): Promise<void> {
    if (this.auditor?.sessionId === session.sessionId) {
      session.expiresAt = Date.now() + SESSION_TTL_MS;
    }
  }

  async destroy(sessionId: string | undefined): Promise<void> {
    const session = this.auditor;
    if (!session || !sessionId || session.sessionId !== sessionId) {
      return;
    }

    this.auditor = undefined;
    try {
      await this.releaseToken?.(session.accessToken);
    } catch {
      // The in-memory session stays revoked even when runtime cleanup fails.
    }
  }

  async all(): Promise<AuditorSession[]> {
    const session = this.auditor;
    if (!session) {
      return [];
    }
    if (session.expiresAt <= Date.now()) {
      await this.destroy(session.sessionId);
      return [];
    }
    return [session];
  }

  createPendingAuthorization(input: PendingAuthorizationInput): PendingAuthorization {
    const now = Date.now();
    const authorization: PendingAuthorization = {
      ...input,
      preAuthId: randomBytes(32).toString('base64url'),
      expiresAt: now + input.expiresIn * 1000,
      lastPollAt: now - input.interval * 1000,
    };
    this.pendingAuthorization = authorization;
    return authorization;
  }

  getPendingAuthorization(preAuthId: string | undefined): PendingAuthorization | undefined {
    const pending = this.pendingAuthorization;
    if (!pending || pending.preAuthId !== preAuthId) {
      return undefined;
    }
    if (pending.expiresAt <= Date.now()) {
      this.pendingAuthorization = undefined;
      return undefined;
    }
    return pending;
  }

  clearPendingAuthorization(preAuthId: string | undefined): void {
    if (this.pendingAuthorization?.preAuthId === preAuthId) {
      this.pendingAuthorization = undefined;
    }
  }
}
