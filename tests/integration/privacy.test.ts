import { Writable } from 'node:stream';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { parseConfig } from '../../src/server/config.js';
import { SessionStore } from '../../src/server/auth/session-store.js';
import { FakeAuditEngine } from '../helpers/fake-engine.js';
import { FakeDeviceFlowClient } from '../helpers/fake-device-flow.js';

const marker = 'CONFIDENTIEL-MARQUEUR-7f3a';
const token = 'access-token-secret';
const localHeaders = {
  host: '127.0.0.1:5178',
  origin: 'http://127.0.0.1:5178',
};
const validOutput = JSON.parse(
  readFileSync(
    join(process.cwd(), 'tests', 'fixtures', 'ai-outputs', 'valid.json'),
    'utf8',
  ),
) as { pillars: Array<Record<string, unknown>> };

describe('audit privacy', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let logs = '';

  afterEach(async () => {
    await app?.close();
    logs = '';
  });

  async function setup(responses: string[]) {
    const stream = new Writable({
      write(chunk: Buffer | string, _encoding, callback) {
        logs += chunk.toString();
        callback();
      },
    });
    const engine = new FakeAuditEngine(responses);
    const sessionStore = new SessionStore((accessToken) => engine.release(accessToken));
    const session = await sessionStore.create({
      login: 'octo',
      name: 'Octo Cat',
      avatarUrl: 'https://avatars.example/octo',
      copilotAccess: 'active',
      accessToken: token,
    });
    app = await buildApp({
      config: parseConfig({
        GITHUB_OAUTH_CLIENT_ID: 'test-client-id',
        NODE_ENV: 'test',
        RMSDD_TEST_MODE: '1',
      }),
      engine,
      deviceFlow: new FakeDeviceFlowClient(),
      sessionStore,
      logStream: stream,
    });
    await app.ready();
    return session;
  }

  it('logs only safe audit metadata on a successful analysis', async () => {
    const output = structuredClone(validOutput);
    output.pillars[0]!.description = marker;
    const session = await setup([JSON.stringify(output)]);
    const response = await app.inject({
      method: 'POST',
      url: '/api/audits',
      headers: { ...localHeaders, cookie: `rmsdd_sid=${session.sessionId}` },
      payload: { content: `# ${marker}`, source: 'paste' },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(logs).not.toContain(marker);
    expect(logs).not.toContain(token);
    const auditEntry = logs
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((entry) => entry.event === 'audit');
    const auditMetadata = Object.fromEntries(
      Object.entries(auditEntry ?? {}).filter(
        ([key]) => !['level', 'time', 'pid', 'hostname', 'msg'].includes(key),
      ),
    );
    expect(auditMetadata).toMatchObject({
      event: 'audit',
      bytes: Buffer.byteLength(`# ${marker}`, 'utf8'),
      attempts: 1,
      outcome: 'success',
    });
    expect(Object.keys(auditMetadata).sort()).toEqual(
      ['attempts', 'bytes', 'durationMs', 'event', 'outcome'].sort(),
    );
  });

  it('never logs or returns raw AI output when both responses are invalid', async () => {
    const session = await setup([marker, marker]);
    const response = await app.inject({
      method: 'POST',
      url: '/api/audits',
      headers: { ...localHeaders, cookie: `rmsdd_sid=${session.sessionId}` },
      payload: { content: '# Spécification', source: 'paste' },
    });
    await app.close();

    expect(response.statusCode).toBe(502);
    expect(JSON.stringify(response.json())).not.toContain(marker);
    expect(JSON.stringify(response.json())).not.toContain(token);
    expect(logs).not.toContain(marker);
    expect(logs).not.toContain(token);
  });

  it('does not log invalid document content rejected before analysis', async () => {
    const session = await setup([]);
    const response = await app.inject({
      method: 'POST',
      url: '/api/audits',
      headers: { ...localHeaders, cookie: `rmsdd_sid=${session.sessionId}` },
      payload: { content: `${marker}\u0000`, source: 'paste' },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(logs).not.toContain(marker);
    expect(logs).not.toContain(token);
  });
});
