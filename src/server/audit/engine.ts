export type EngineErrorKind =
  | 'rate_limited'
  | 'unavailable'
  | 'timeout'
  | 'unauthorized';

export class EngineError extends Error {
  constructor(
    readonly kind: EngineErrorKind,
    options?: ErrorOptions,
  ) {
    super(`Copilot engine error: ${kind}`, options);
    this.name = 'EngineError';
  }
}

export interface AuditEngine {
  checkAccess(token: string): Promise<boolean>;
  complete(input: {
    token: string;
    system: string;
    user: string;
    signal: AbortSignal;
    timeoutMs: number;
  }): Promise<{ text: string; model: string }>;
  release(token: string): Promise<void>;
}
