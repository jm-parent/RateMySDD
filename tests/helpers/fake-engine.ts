import { EngineError } from '../../src/server/audit/engine.js';
import type { AuditEngine } from '../../src/server/audit/engine.js';

export type FakeEngineResponse = string | EngineError;

export class FakeAuditEngine implements AuditEngine {
  readonly calls: Array<{
    token: string;
    system: string;
    user: string;
    signal: AbortSignal;
    timeoutMs: number;
  }> = [];
  readonly releasedTokens: string[] = [];
  readonly checkedTokens: string[] = [];

  constructor(
    private readonly responses: FakeEngineResponse[] = [],
    private readonly access = true,
  ) {}

  async checkAccess(token: string): Promise<boolean> {
    this.checkedTokens.push(token);
    return this.access;
  }

  async complete(input: {
    token: string;
    system: string;
    user: string;
    signal: AbortSignal;
    timeoutMs: number;
  }): Promise<{ text: string; model: string }> {
    this.calls.push(input);
    const next = this.responses.shift();
    if (next === undefined) {
      throw new Error('FakeAuditEngine has no scripted response.');
    }
    if (next instanceof EngineError) {
      throw next;
    }
    return { text: next, model: 'test-model' };
  }

  async release(token: string): Promise<void> {
    this.releasedTokens.push(token);
  }
}
