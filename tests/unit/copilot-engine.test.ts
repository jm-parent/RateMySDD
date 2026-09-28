import { describe, expect, it } from 'vitest';
import type { CopilotClientOptions } from '@github/copilot-sdk';
import { CopilotSdkEngine } from '../../src/server/audit/copilot-engine.js';

function createEngine(listModels: () => Promise<unknown[]> = async () => [{ id: 'gpt-5' }]) {
  const options: CopilotClientOptions[] = [];
  const calls = { start: 0, listModels: 0, stop: 0 };
  const engine = new CopilotSdkEngine(
    {
      tmpDir: 'C:\\ratemysdd-temp',
      copilotModel: 'gpt-5',
      reasoningEffort: 'medium',
    },
    (clientOptions) => {
      options.push(clientOptions);
      return {
        async start() {
          calls.start += 1;
        },
        async listModels() {
          calls.listModels += 1;
          return listModels();
        },
        async createSession() {
          throw new Error('This test does not create audit sessions.');
        },
        async deleteSession() {},
        async stop() {
          calls.stop += 1;
        },
      };
    },
  );
  return { engine, options, calls };
}

describe('CopilotSdkEngine access lifecycle', () => {
  it('starts an isolated client for the supplied token and reuses it for model checks', async () => {
    const { engine, options, calls } = createEngine();

    await expect(engine.checkAccess('access-token-secret')).resolves.toBe(true);
    await expect(engine.checkAccess('access-token-secret')).resolves.toBe(true);

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      gitHubToken: 'access-token-secret',
      useLoggedInUser: false,
      mode: 'empty',
      baseDirectory: 'C:\\ratemysdd-temp\\copilot',
      logLevel: 'error',
    });
    expect(calls).toEqual({ start: 1, listModels: 2, stop: 0 });
  });

  it('reports an authorization failure as missing Copilot access and stops the client', async () => {
    const { engine, calls } = createEngine(async () => {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    });

    await expect(engine.checkAccess('access-token-secret')).resolves.toBe(false);
    expect(calls).toEqual({ start: 1, listModels: 1, stop: 1 });
  });

  it('maps network failures to an unavailable engine error and stops the client', async () => {
    const { engine, calls } = createEngine(async () => {
      throw new TypeError('fetch failed');
    });

    await expect(engine.checkAccess('access-token-secret')).rejects.toMatchObject({
      kind: 'unavailable',
    });
    expect(calls).toEqual({ start: 1, listModels: 1, stop: 1 });
  });

  it('releases a successfully checked client once', async () => {
    const { engine, calls } = createEngine();
    await engine.checkAccess('access-token-secret');

    await engine.release('access-token-secret');
    await engine.release('access-token-secret');

    expect(calls.stop).toBe(1);
  });

});
