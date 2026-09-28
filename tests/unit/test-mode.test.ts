import { describe, expect, it } from 'vitest';
import { createTestDependencies } from '../../src/server/testing/test-mode.js';

const request = {
  token: 'test-access-token',
  system: 'system',
  signal: new AbortController().signal,
  timeoutMs: 50_000,
};

describe('test-mode dependencies', () => {
  it('authorizes the test user on the first device-flow poll', async () => {
    const { deviceFlow } = createTestDependencies();
    const device = await deviceFlow.start();

    expect(device.interval).toBe(1);
    await expect(deviceFlow.poll(device.deviceCode)).resolves.toEqual({
      status: 'authorized',
      accessToken: 'test-access-token',
    });
    await expect(deviceFlow.fetchUser('test-access-token')).resolves.toMatchObject({
      login: 'testeur',
      name: 'Utilisateur de test',
      avatarUrl: null,
    });
  });

  it('returns the fixture output and marks absent non-functional requirements as zero', async () => {
    const { engine } = createTestDependencies();
    const completion = await engine.complete({
      ...request,
      user: '<<<DOC-test>>>\nUne spécification sans exigence.\n<<<END-DOC-test>>>',
    });
    const output = JSON.parse(completion.text) as {
      pillars: Array<{ score: number; description: string }>;
    };

    expect(output.pillars).toHaveLength(6);
    expect(output.pillars[5]).toMatchObject({
      score: 0,
      description: expect.stringContaining('Aucune exigence non fonctionnelle'),
    });
    expect(completion.model).toBe('test-model');
  });

  it('retains the fixture score when the document includes a non-functional requirement', async () => {
    const { engine } = createTestDependencies();
    const completion = await engine.complete({
      ...request,
      user: '<<<DOC-test>>>\nExigences non fonctionnelles : disponibilité.\n<<<END-DOC-test>>>',
    });
    const output = JSON.parse(completion.text) as {
      pillars: Array<{ score: number }>;
    };

    expect(output.pillars[5]?.score).toBeGreaterThan(0);
  });

  it('exposes the audit engine contract without a real Copilot runtime', async () => {
    const { engine } = createTestDependencies();

    await expect(engine.checkAccess('test-access-token')).resolves.toBe(true);
    await expect(engine.release('test-access-token')).resolves.toBeUndefined();
  });
});
