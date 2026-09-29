import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CopilotClientOptions, SessionConfig } from '@github/copilot-sdk';
import { afterEach, describe, expect, it } from 'vitest';
import type { CopilotClientLike } from '../../src/server/audit/copilot-engine.js';
import { CopilotSdkEngine } from '../../src/server/audit/copilot-engine.js';

type EventType = 'assistant.message' | 'session.idle';
type EventHandler = (event: unknown) => void;

interface TestRuntime {
  engine: CopilotSdkEngine;
  tmpDir: string;
  clientOptions: CopilotClientOptions[];
  sessionConfigs: SessionConfig[];
  listeners: Map<EventType, EventHandler>;
  calls: { start: number; send: number; disconnect: number; deleteSession: number; stop: number };
}

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function createRuntime(
  send: (prompt: string, listeners: Map<EventType, EventHandler>) => Promise<void> =
    async (prompt, listeners) => {
      void prompt;
      listeners.get('assistant.message')?.({ data: { content: 'Réponse finale.' } });
      listeners.get('session.idle')?.({});
    },
): Promise<TestRuntime> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'ratemysdd-copilot-'));
  temporaryDirectories.push(tmpDir);
  const tokenId = createHash('sha256').update('access-token-secret').digest('hex');
  await mkdir(join(tmpDir, 'copilot', tokenId, 'session-state'), { recursive: true });
  const clientOptions: CopilotClientOptions[] = [];
  const sessionConfigs: SessionConfig[] = [];
  const listeners = new Map<EventType, EventHandler>();
  const calls = { start: 0, send: 0, disconnect: 0, deleteSession: 0, stop: 0 };
  const fakeSession = {
    sessionId: 'test-session-id',
    on(event: EventType, handler: EventHandler) {
      listeners.set(event, handler);
      return () => {
        listeners.delete(event);
      };
    },
    async send(options: { prompt: string }) {
      calls.send += 1;
      await send(options.prompt, listeners);
    },
    async disconnect() {
      calls.disconnect += 1;
    },
  };
  const fakeClient = {
    async start() {
      calls.start += 1;
    },
    async listModels() {
      return [{ id: 'gpt-5' }];
    },
    async createSession(config: SessionConfig) {
      sessionConfigs.push(config);
      return fakeSession;
    },
    async deleteSession() {
      calls.deleteSession += 1;
    },
    async stop() {
      calls.stop += 1;
      return [];
    },
  } as unknown as CopilotClientLike;
  const engine = new CopilotSdkEngine(
    {
      tmpDir,
      copilotModel: 'gpt-5',
      reasoningEffort: 'medium',
    },
    (options) => {
      clientOptions.push(options);
      return fakeClient;
    },
  );
  return { engine, tmpDir, clientOptions, sessionConfigs, listeners, calls };
}

const input = (signal = new AbortController().signal) => ({
  token: 'access-token-secret',
  system: 'Règles système.',
  user: 'Document à auditer.',
  signal,
  timeoutMs: 2_000,
});

describe('CopilotSdkEngine completion', () => {
  it('uses an isolated session, waits for idle and returns its final assistant message', async () => {
    const runtime = await createRuntime(async (_prompt, listeners) => {
      listeners.get('assistant.message')?.({ data: { content: 'Réponse intermédiaire.' } });
      listeners.get('assistant.message')?.({ data: { content: 'Réponse finale.' } });
      listeners.get('session.idle')?.({});
    });

    await expect(runtime.engine.complete(input())).resolves.toEqual({
      text: 'Réponse finale.',
      model: 'gpt-5',
    });

    expect(runtime.clientOptions[0]).toMatchObject({
      gitHubToken: 'access-token-secret',
      useLoggedInUser: false,
      mode: 'empty',
    });
    expect(runtime.sessionConfigs[0]).toMatchObject({
      model: 'gpt-5',
      reasoningEffort: 'medium',
      systemMessage: { mode: 'replace', content: 'Règles système.' },
      availableTools: [],
      enableSessionStore: false,
    });
    expect(runtime.sessionConfigs[0]?.onPermissionRequest).toEqual(expect.any(Function));
    expect(runtime.calls).toMatchObject({ start: 1, send: 1, disconnect: 1, deleteSession: 1 });
  });

  it('starts and stops a fresh CLI client for every completion', async () => {
    const runtime = await createRuntime();

    await runtime.engine.complete(input());
    await runtime.engine.complete(input());

    expect(runtime.clientOptions).toHaveLength(2);
    expect(runtime.calls.start).toBe(2);
    expect(runtime.calls.stop).toBe(2);
  });

  it('disconnects and deletes the session when the requested completion times out', async () => {
    const runtime = await createRuntime(() => new Promise<void>(() => undefined));

    await expect(runtime.engine.complete({ ...input(), timeoutMs: 10 })).rejects
      .toMatchObject({ kind: 'timeout' });
    expect(runtime.calls.disconnect).toBe(1);
    expect(runtime.calls.deleteSession).toBe(1);
  });

  it('disconnects and deletes the session when the request is aborted', async () => {
    const runtime = await createRuntime(() => new Promise<void>(() => undefined));
    const controller = new AbortController();
    const completion = runtime.engine.complete(input(controller.signal));
    const rejectedCompletion = expect(completion).rejects.toMatchObject({
      kind: 'timeout',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();

    await rejectedCompletion;
    expect(runtime.calls.disconnect).toBe(1);
    expect(runtime.calls.deleteSession).toBe(1);
  });

  it.each([
    [{ status: 429 }, 'rate_limited'],
    [{ status: 401 }, 'unauthorized'],
    [{ status: 500 }, 'unavailable'],
  ] as const)('maps SDK status %s to engine error %s', async (details, kind) => {
    const runtime = await createRuntime(async () => {
      throw Object.assign(new Error('provider failure'), details);
    });

    await expect(runtime.engine.complete(input())).rejects.toMatchObject({ kind });
    expect(runtime.calls.disconnect).toBe(1);
    expect(runtime.calls.deleteSession).toBe(1);
  });

  it('removes temporary Copilot session state after completion', async () => {
    const runtime = await createRuntime();

    await runtime.engine.complete(input());
    const stateDirectory = join(
      runtime.clientOptions[0]!.baseDirectory as string,
      'session-state',
    );
    await expect(
      import('node:fs/promises').then(({ access }) => access(stateDirectory)),
    ).rejects.toThrow();
  });
});
