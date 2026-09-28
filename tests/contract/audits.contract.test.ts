import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { buildApp } from '../../src/server/app.js';
import { parseConfig } from '../../src/server/config.js';
import { SessionStore } from '../../src/server/auth/session-store.js';
import { FakeAuditEngine } from '../helpers/fake-engine.js';
import { FakeDeviceFlowClient } from '../helpers/fake-device-flow.js';

const specification = parse(
  readFileSync(
    join(
      process.cwd(),
      'specs',
      '001-markdown-spec-audit',
      'contracts',
      'openapi.yaml',
    ),
    'utf8',
  ),
) as Record<string, unknown>;
const specificationId = 'https://ratemysdd.local/audits-openapi';
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema({ ...specification, $id: specificationId });

function matchesSchema(name: string, value: unknown): boolean {
  const validator = ajv.getSchema(`${specificationId}#/components/schemas/${name}`);
  return Boolean(validator?.(value));
}

const localHeaders = {
  host: '127.0.0.1:5178',
  origin: 'http://127.0.0.1:5178',
};
const validOutput = readFileSync(
  join(process.cwd(), 'tests', 'fixtures', 'ai-outputs', 'valid.json'),
  'utf8',
);

describe('audit API contract', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  afterEach(async () => {
    await app?.close();
  });

  async function setup(
    access: 'active' | 'none' = 'active',
    outputs: string[] = [validOutput],
  ) {
    const engine = new FakeAuditEngine(outputs);
    const sessionStore = new SessionStore((token) => engine.release(token));
    const session = await sessionStore.create({
      login: 'octo',
      name: 'Octo Cat',
      avatarUrl: 'https://avatars.example/octo',
      copilotAccess: access,
      accessToken: 'access-token-secret',
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
    });
    await app.ready();
    return { engine, session };
  }

  it('rejects unauthenticated audit requests with a schema-valid API error', async () => {
    await setup();
    const response = await app.inject({
      method: 'POST',
      url: '/api/audits',
      headers: localHeaders,
      payload: { content: '# Spec', source: 'paste' },
    });

    expect(response.statusCode).toBe(401);
    expect(matchesSchema('ApiError', response.json())).toBe(true);
    expect(response.json().code).toBe('UNAUTHENTICATED');
  });

  it('rejects authenticated users without Copilot access', async () => {
    const { session } = await setup('none');
    const response = await app.inject({
      method: 'POST',
      url: '/api/audits',
      headers: { ...localHeaders, cookie: `rmsdd_sid=${session.sessionId}` },
      payload: { content: '# Spec', source: 'paste' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('NO_COPILOT_ACCESS');
    expect(matchesSchema('ApiError', response.json())).toBe(true);
  });

  it('returns a schema-valid six-criterion result with every required evaluation', async () => {
    const { session } = await setup();
    const response = await app.inject({
      method: 'POST',
      url: '/api/audits',
      headers: { ...localHeaders, cookie: `rmsdd_sid=${session.sessionId}` },
      payload: { content: '# Spécification', source: 'paste' },
    });
    const result = response.json();

    expect(response.statusCode).toBe(200);
    const sessionExpiry = response.headers['x-session-expires-at'];
    expect(sessionExpiry).toBeDefined();
    if (typeof sessionExpiry !== 'string') {
      throw new Error('X-Session-Expires-At must be a string.');
    }
    expect(new Date(sessionExpiry).toISOString()).toBe(sessionExpiry);
    expect(matchesSchema('AuditResult', result)).toBe(true);
    expect(result.evaluations).toHaveLength(6);
    expect(result.evaluations.map((evaluation: { criterionId: string }) => evaluation.criterionId)).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
    ]);
    for (const evaluation of result.evaluations) {
      expect(evaluation.score).toEqual(expect.any(Number));
      expect(evaluation.description.length).toBeGreaterThan(0);
      expect(evaluation.improvements.length).toBeGreaterThan(0);
    }
    expect(JSON.stringify(result)).not.toContain('access-token-secret');
  });

  it('accepts a plan audit with its spec reference and returns typed evaluations', async () => {
    const planOutput = JSON.stringify({
      evaluations: Array.from({ length: 6 }, (_, index) => ({
        criterionId: `0${index + 1}`,
        score: 93,
        summary: [`Critère ${index + 1} couvert.`],
        description: `Description ${index + 1}.`,
        improvements: ['Préciser un cas limite.'],
      })),
    });
    const { session } = await setup('active', [planOutput]);
    const response = await app.inject({
      method: 'POST',
      url: '/api/audits',
      headers: { ...localHeaders, cookie: `rmsdd_sid=${session.sessionId}` },
      payload: {
        content: '# Plan',
        source: 'paste',
        documentType: 'plan',
        referenceContent: '# Spec',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(matchesSchema('AuditResult', response.json())).toBe(true);
    expect(response.json()).toMatchObject({
      documentType: 'plan',
      globalScore: 93,
      evaluations: expect.any(Array),
    });
    expect(response.json().evaluations).toHaveLength(6);
  });

  it('returns normalized validation errors without stack traces', async () => {
    const { session } = await setup();
    const response = await app.inject({
      method: 'POST',
      url: '/api/audits',
      headers: { ...localHeaders, cookie: `rmsdd_sid=${session.sessionId}` },
      payload: { content: ' \n', source: 'paste' },
    });

    expect(response.statusCode).toBe(400);
    expect(matchesSchema('ApiError', response.json())).toBe(true);
    expect(response.json().code).toBe('EMPTY_CONTENT');
    expect(JSON.stringify(response.json())).not.toContain('stack');
  });

  it('rejects a file audit without a Markdown filename', async () => {
    const { session } = await setup();
    const response = await app.inject({
      method: 'POST',
      url: '/api/audits',
      headers: { ...localHeaders, cookie: `rmsdd_sid=${session.sessionId}` },
      payload: { content: '# Spécification', source: 'file' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('INVALID_FILE_TYPE');
  });

  it('rejects non-Markdown and overlong file names', async () => {
    const { session } = await setup();
    const headers = {
      ...localHeaders,
      cookie: `rmsdd_sid=${session.sessionId}`,
    };
    const pdfResponse = await app.inject({
      method: 'POST',
      url: '/api/audits',
      headers,
      payload: { content: '# Spec', source: 'file', fileName: 'spec.pdf' },
    });
    const longNameResponse = await app.inject({
      method: 'POST',
      url: '/api/audits',
      headers,
      payload: {
        content: '# Spec',
        source: 'file',
        fileName: `${'a'.repeat(253)}.md`,
      },
    });

    expect(pdfResponse.statusCode).toBe(400);
    expect(pdfResponse.json().code).toBe('INVALID_FILE_TYPE');
    expect(longNameResponse.statusCode).toBe(400);
  });

  it('returns the document basename for a valid Markdown file', async () => {
    const { session } = await setup();
    const response = await app.inject({
      method: 'POST',
      url: '/api/audits',
      headers: { ...localHeaders, cookie: `rmsdd_sid=${session.sessionId}` },
      payload: {
        content: '# Spécification',
        source: 'file',
        fileName: 'spec-paiement.md',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      documentName: 'spec-paiement',
      source: 'file',
      fileName: 'spec-paiement.md',
    });
  });

  it('keeps the six-criterion result structure equivalent for paste and file audits', async () => {
    const { session } = await setup('active', [validOutput, validOutput]);
    const headers = {
      ...localHeaders,
      cookie: `rmsdd_sid=${session.sessionId}`,
    };
    const pasted = await app.inject({
      method: 'POST',
      url: '/api/audits',
      headers,
      payload: { content: '# Spécification', source: 'paste' },
    });
    const uploaded = await app.inject({
      method: 'POST',
      url: '/api/audits',
      headers,
      payload: {
        content: '# Spécification',
        source: 'file',
        fileName: 'spec.md',
      },
    });
    const pastedEvaluations = pasted.json().evaluations;
    const uploadedEvaluations = uploaded.json().evaluations;

    expect(pasted.statusCode).toBe(200);
    expect(uploaded.statusCode).toBe(200);
    expect(uploadedEvaluations.map((evaluation: { criterionId: string; title: string }) => ({
      criterionId: evaluation.criterionId,
      title: evaluation.title,
    }))).toEqual(
      pastedEvaluations.map((evaluation: { criterionId: string; title: string }) => ({
        criterionId: evaluation.criterionId,
        title: evaluation.title,
      })),
    );
  });
});
