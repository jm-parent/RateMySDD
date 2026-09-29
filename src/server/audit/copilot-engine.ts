import { CopilotClient } from '@github/copilot-sdk';
import type {
  CopilotClientOptions,
  CopilotSession,
  SessionConfig,
} from '@github/copilot-sdk';
import { createHash, randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { AppConfig } from '../config.js';
import { EngineError } from './engine.js';
import type { AuditEngine } from './engine.js';

type CopilotSessionLike = Pick<
  CopilotSession,
  'sessionId' | 'on' | 'send' | 'disconnect'
>;

interface CopilotClientLike {
  start(): Promise<void>;
  listModels(): Promise<unknown[]>;
  createSession(config: SessionConfig): Promise<CopilotSessionLike>;
  deleteSession(sessionId: string): Promise<void>;
  stop(): Promise<unknown>;
}

type ClientFactory = (options: CopilotClientOptions) => CopilotClientLike;

function errorDetails(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return { status: undefined, code: '', message: String(error) };
  }
  const candidate = error as Error & {
    status?: number;
    statusCode?: number;
    code?: string;
    response?: { status?: number };
  };
  const status =
    candidate.status ?? candidate.statusCode ?? candidate.response?.status;
  return {
    status,
    code: candidate.code ?? '',
    message: candidate.message ?? '',
  };
}

function isAuthorizationFailure(error: unknown): boolean {
  const candidate = errorDetails(error);
  const status = candidate.status;
  if (status === 401 || status === 403) {
    return true;
  }
  return /\b(unauthorized|unauthorised|forbidden|not authorized|not authorised)\b/i.test(
    `${candidate.message} ${candidate.code}`,
  );
}

function mapCompletionError(error: unknown): EngineError {
  if (error instanceof EngineError) {
    return error;
  }
  const details = errorDetails(error);
  if (
    details.status === 429 ||
    /\b(rate.?limit|quota|too many requests)\b/i.test(
      `${details.message} ${details.code}`,
    )
  ) {
    return new EngineError('rate_limited', { cause: error });
  }
  if (isAuthorizationFailure(error)) {
    return new EngineError('unauthorized', { cause: error });
  }
  if (
    (error instanceof Error && error.name === 'AbortError') ||
    /\b(timed? ?out|timeout|etimedout)\b/i.test(
      `${details.message} ${details.code}`,
    )
  ) {
    return new EngineError('timeout', { cause: error });
  }
  return new EngineError('unavailable', { cause: error });
}

export class CopilotSdkEngine implements AuditEngine {
  constructor(
    private readonly config: Pick<
      AppConfig,
      'tmpDir' | 'copilotModel' | 'reasoningEffort'
    >,
    private readonly clientFactory: ClientFactory = (options) => new CopilotClient(options),
  ) {}

  async checkAccess(token: string): Promise<boolean> {
    const baseDirectory = this.baseDirectoryForOperation(token);
    let client: CopilotClientLike | undefined;
    try {
      client = await this.startClient(token, baseDirectory);
      await client.listModels();
      return true;
    } catch (error) {
      if (isAuthorizationFailure(error)) {
        return false;
      }
      throw new EngineError('unavailable', { cause: error });
    } finally {
      if (client) {
        try {
          await client.stop();
        } catch {
          // Access-check cleanup is best-effort; no session state is retained.
        }
      }
      try {
        await rm(baseDirectory, { recursive: true, force: true });
      } catch {
        // Preserve the provider result when temporary-file cleanup fails.
      }
    }
  }

  async complete(
    input: Parameters<AuditEngine['complete']>[0],
  ): Promise<{ text: string; model: string }> {
    if (input.signal.aborted) {
      throw new EngineError('timeout');
    }

    const baseDirectory = this.baseDirectoryForOperation(input.token);
    let client: CopilotClientLike;
    try {
      client = await this.startClient(input.token, baseDirectory);
    } catch (error) {
      throw mapCompletionError(error);
    }
    let session: CopilotSessionLike | undefined;
    let unsubscribeAssistant: (() => void) | undefined;
    let unsubscribeIdle: (() => void) | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let removeAbortListener: (() => void) | undefined;
    let result: { text: string; model: string } | undefined;
    let operationError: EngineError | undefined;
    let cleanupError: unknown;

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => reject(new EngineError('timeout')), input.timeoutMs);
    });
    const abortPromise = new Promise<never>((_resolve, reject) => {
      const onAbort = () => reject(new EngineError('timeout'));
      if (input.signal.aborted) {
        onAbort();
      } else {
        input.signal.addEventListener('abort', onAbort, { once: true });
        removeAbortListener = () => input.signal.removeEventListener('abort', onAbort);
      }
    });

    try {
      session = await Promise.race([
        client.createSession({
          model: this.config.copilotModel,
          reasoningEffort: this.config.reasoningEffort,
          systemMessage: { mode: 'replace', content: input.system },
          availableTools: [],
          enableSessionStore: false,
          onPermissionRequest: () => ({
            kind: 'reject',
            feedback: 'RateMySDD n’autorise aucun outil.',
          }),
        }),
        timeoutPromise,
        abortPromise,
      ]);

      let assistantText: string | undefined;
      let resolveIdle: (() => void) | undefined;
      const idlePromise = new Promise<void>((resolveIdlePromise) => {
        resolveIdle = resolveIdlePromise;
      });
      unsubscribeAssistant = session.on('assistant.message', (event) => {
        assistantText = event.data.content;
      });
      unsubscribeIdle = session.on('session.idle', () => resolveIdle?.());

      const completionPromise = (async () => {
        await session!.send({ prompt: input.user });
        await idlePromise;
        if (assistantText === undefined) {
          throw new EngineError('unavailable');
        }
        return assistantText;
      })();
      const text = await Promise.race([
        completionPromise,
        timeoutPromise,
        abortPromise,
      ]);
      result = { text, model: this.config.copilotModel };
    } catch (error) {
      operationError = mapCompletionError(error);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
      removeAbortListener?.();
      unsubscribeAssistant?.();
      unsubscribeIdle?.();
      if (session) {
        try {
          await session.disconnect();
        } catch (error) {
          cleanupError ??= error;
        }
        try {
          await client.deleteSession(session.sessionId);
        } catch (error) {
          cleanupError ??= error;
        }
      }
      try {
        await client.stop();
      } catch (error) {
        cleanupError ??= error;
      }
      try {
        await rm(baseDirectory, { recursive: true, force: true });
      } catch (error) {
        cleanupError ??= error;
      }
    }

    if (cleanupError) {
      throw new EngineError('unavailable', { cause: cleanupError });
    }
    if (operationError) {
      throw operationError;
    }
    if (!result) {
      throw new EngineError('unavailable');
    }
    return result;
  }

  async release(token: string): Promise<void> {
    void token;
  }

  private async startClient(
    token: string,
    baseDirectory: string,
  ): Promise<CopilotClientLike> {
    const client = this.clientFactory({
      gitHubToken: token,
      useLoggedInUser: false,
      mode: 'empty',
      baseDirectory,
      logLevel: 'error',
    });
    try {
      await client.start();
      return client;
    } catch (error) {
      try {
        await client.stop();
      } catch {
        // Preserve the startup failure as the actionable error.
      }
      try {
        await rm(baseDirectory, { recursive: true, force: true });
      } catch {
        // Preserve the startup failure as the actionable error.
      }
      throw error;
    }
  }

  private baseDirectoryForOperation(token: string): string {
    const tokenId = createHash('sha256').update(token).digest('hex');
    return resolve(this.config.tmpDir, 'copilot', tokenId, randomUUID());
  }
}

export type { ClientFactory, CopilotClientLike };
