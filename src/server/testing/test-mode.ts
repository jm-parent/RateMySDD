import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DeviceFlowClient } from '../auth/device-flow.js';
import type { AuditEngine } from '../audit/engine.js';

interface FixtureAuditOutput {
  pillars: Array<{
    pillarId: string;
    score: number;
    summary: string[];
    description: string;
    improvements: string[];
  }>;
}

class TestDeviceFlowClient implements DeviceFlowClient {
  private readonly activeCodes = new Set<string>();

  async start() {
    const deviceCode = randomUUID();
    this.activeCodes.add(deviceCode);
    return {
      deviceCode,
      userCode: 'TEST-1234',
      verificationUri: 'https://github.com/login/device',
      expiresIn: 600,
      interval: 1,
    };
  }

  async poll(deviceCode: string) {
    if (!this.activeCodes.delete(deviceCode)) {
      return { status: 'expired' as const };
    }
    return { status: 'authorized' as const, accessToken: 'test-access-token' };
  }

  async fetchUser() {
    return {
      login: 'testeur',
      name: 'Utilisateur de test',
      avatarUrl: null,
    };
  }
}

class TestAuditEngine implements AuditEngine {
  private readonly fixture: FixtureAuditOutput;

  constructor() {
    this.fixture = JSON.parse(
      readFileSync(
        join(
          process.cwd(),
          'tests',
          'fixtures',
          'ai-outputs',
          'valid.json',
        ),
        'utf8',
      ),
    ) as FixtureAuditOutput;
  }

  async checkAccess(): Promise<boolean> {
    return true;
  }

  async complete(input: {
    token: string;
    system: string;
    user: string;
    signal: AbortSignal;
    timeoutMs: number;
  }): Promise<{ text: string; model: string }> {
    const output = structuredClone(this.fixture);
    const documentStart = input.user.indexOf('>>>\n');
    const documentEnd = input.user.lastIndexOf('\n<<<END-DOC-');
    const content =
      documentStart >= 0 && documentEnd > documentStart
        ? input.user.slice(documentStart + 4, documentEnd)
        : input.user;

    if (!/non[\s-]?fonctionnel/i.test(content)) {
      const lastPillar = output.pillars[5];
      if (lastPillar) {
        lastPillar.score = 0;
        lastPillar.description =
          'Aucune exigence non fonctionnelle n’apparaît dans le document fourni.';
      }
    }

    return { text: JSON.stringify(output), model: 'test-model' };
  }

  async release(): Promise<void> {}
}

export function createTestDependencies(): {
  deviceFlow: DeviceFlowClient;
  engine: AuditEngine;
} {
  return {
    deviceFlow: new TestDeviceFlowClient(),
    engine: new TestAuditEngine(),
  };
}
