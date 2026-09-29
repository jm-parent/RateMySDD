import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AuditorSession } from '../../src/server/auth/session-store.js';
import {
  AppError,
} from '../../src/server/errors.js';
import {
  EngineError,
  type AuditEngine,
} from '../../src/server/audit/engine.js';
import { createAuditService } from '../../src/server/audit/audit-service.js';
import { parseConfig } from '../../src/server/config.js';
import { SessionStore } from '../../src/server/auth/session-store.js';
import { FakeAuditEngine } from '../helpers/fake-engine.js';

const validOutput = readFileSync(
  join(process.cwd(), 'tests', 'fixtures', 'ai-outputs', 'valid.json'),
  'utf8',
);

function auditor(): AuditorSession {
  return {
    sessionId: 'test-session',
    login: 'octo',
    name: 'Octo Cat',
    avatarUrl: 'https://avatars.example/octo',
    copilotAccess: 'active',
    accessToken: 'access-token-secret',
    expiresAt: Date.now() + 60_000,
    auditInProgress: false,
  };
}

function createService(
  engine: AuditEngine,
  logRecords: unknown[] = [],
  lockStore?: SessionStore,
): ReturnType<typeof createAuditService> {
  return createAuditService({
    engine,
    config: parseConfig({
      GITHUB_OAUTH_CLIENT_ID: 'test-client-id',
      NODE_ENV: 'test',
      RMSDD_TEST_MODE: '1',
    }),
    logger: {
      info(record: unknown) {
        logRecords.push(record);
      },
    },
    lockStore,
  });
}

describe('audit service', () => {
  it('builds a normalized result and computes the global score on the server', async () => {
    const engine = new FakeAuditEngine([validOutput]);
    const logs: unknown[] = [];
    const service = createService(engine, logs);
    const session = auditor();

    const result = await service.run(
      session,
      { content: '# Spécification', source: 'paste' },
      new AbortController().signal,
    );

    expect(result).toMatchObject({
      documentName: 'Texte collé',
      source: 'paste',
      fileName: null,
      globalScore: 87,
      globalBand: 'bon',
      model: 'test-model',
    });
    expect(result.evaluations.map(({ criterionId, title }) => [criterionId, title])).toEqual([
      ['01', 'Contexte & Objectif'],
      ['02', 'Périmètre'],
      ['03', 'Besoins Fonctionnels'],
      ['04', 'Données & Intégrations'],
      ['05', "Critères d'Acceptation"],
      ['06', 'Exigences Non Fonctionnelles'],
    ]);
    expect(engine.calls).toHaveLength(1);
    expect(engine.calls[0]?.token).toBe('access-token-secret');
    expect(engine.calls[0]?.timeoutMs).toBe(50_000);
    expect(session.auditInProgress).toBe(false);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      event: 'audit',
      bytes: Buffer.byteLength('# Spécification', 'utf8'),
      attempts: 1,
      outcome: 'success',
    });
  });

  it('audits a plan against its spec reference with plan-specific criteria', async () => {
    const planOutput = JSON.stringify({
      evaluations: [91, 92, 93, 94, 95, 96].map((score, index) => ({
        criterionId: `0${index + 1}`,
        score,
        summary: [`Critère ${index + 1} couvert.`],
        description: `Description du critère ${index + 1}.`,
        improvements: ['Préciser un cas limite.'],
      })),
    });
    const engine = new FakeAuditEngine([planOutput]);
    const service = createService(engine);
    const result = await service.run(
      auditor(),
      {
        content: '# Plan',
        source: 'paste',
        documentType: 'plan',
        referenceContent: '# Spec',
      },
      new AbortController().signal,
    );

    expect(result.documentType).toBe('plan');
    expect(result.globalScore).toBe(94);
    expect(result.evaluations[0]).toMatchObject({
      criterionId: '01',
      title: 'Alignement et Couverture Fonctionnelle',
    });
    expect(result.evaluations[5]).toMatchObject({
      criterionId: '06',
      title: 'Faisabilité, Risques & Découpage',
    });
    expect(engine.calls[0]?.system).toContain('Alignement et Couverture Fonctionnelle');
    expect(engine.calls[0]?.user).toContain('# Plan');
    expect(engine.calls[0]?.user).toContain('# Spec');
  });

  it('audits tasks against the plan with task-specific criteria', async () => {
    const tasksOutput = JSON.stringify({
      evaluations: Array.from({ length: 6 }, (_, index) => ({
        criterionId: `0${index + 1}`,
        score: 92,
        summary: [`Critère ${index + 1} couvert.`],
        description: `Description ${index + 1}.`,
        improvements: ['Préciser un cas limite.'],
      })),
    });
    const engine = new FakeAuditEngine([tasksOutput]);
    const service = createService(engine);
    const result = await service.run(
      auditor(),
      {
        content: '# Tasks',
        source: 'paste',
        documentType: 'tasks',
        referenceContent: '# Plan',
      },
      new AbortController().signal,
    );

    expect(result.documentType).toBe('tasks');
    expect(result.evaluations[0]).toMatchObject({
      criterionId: '01',
      title: 'Granularité & Taille des Tâches',
    });
    expect(engine.calls[0]?.system).toContain('Traçabilité avec le Plan');
    expect(engine.calls[0]?.user).toContain('# Tasks');
    expect(engine.calls[0]?.user).toContain('# Plan');
  });

  it('retries exactly once when the AI output is invalid and reminds the model of the format', async () => {
    const engine = new FakeAuditEngine(['invalid output', validOutput]);
    const service = createService(engine);

    const result = await service.run(
      auditor(),
      { content: 'Texte', source: 'paste' },
      new AbortController().signal,
    );

    expect(result.evaluations).toHaveLength(6);
    expect(engine.calls).toHaveLength(2);
    expect(engine.calls[1]?.system).toContain("Ta réponse précédente n'était pas conforme.");
  });

  it('fails with AI_OUTPUT_INVALID after two invalid model responses', async () => {
    const engine = new FakeAuditEngine(['private raw response', 'another invalid response']);
    const session = auditor();
    const service = createService(engine);

    await expect(
      service.run(session, { content: 'Texte', source: 'paste' }, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'AI_OUTPUT_INVALID' });

    expect(engine.calls).toHaveLength(2);
    expect(session.auditInProgress).toBe(false);
  });

  it.each([
    ['timeout', 'COPILOT_TIMEOUT'],
    ['rate_limited', 'COPILOT_RATE_LIMITED'],
    ['unavailable', 'COPILOT_UNAVAILABLE'],
    ['unauthorized', 'UNAUTHENTICATED'],
  ] as const)('maps engine error %s to %s', async (kind, code) => {
    const service = createService(new FakeAuditEngine([new EngineError(kind)]));

    await expect(
      service.run(
        auditor(),
        { content: 'Texte', source: 'paste' },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code });
  });

  it('rejects a second concurrent audit for the same session', async () => {
    let resolveCompletion: ((result: { text: string; model: string }) => void) | undefined;
    const engine: AuditEngine = {
      async checkAccess() {
        return true;
      },
      complete() {
        return new Promise((resolve) => {
          resolveCompletion = resolve;
        });
      },
      async release() {},
    };
    const session = auditor();
    const service = createService(engine);
    const first = service.run(
      session,
      { content: 'Texte', source: 'paste' },
      new AbortController().signal,
    );

    await expect(
      service.run(
        session,
        { content: 'Autre texte', source: 'paste' },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'AUDIT_IN_PROGRESS' });
    resolveCompletion?.({ text: validOutput, model: 'test-model' });
    await expect(first).resolves.toMatchObject({ evaluations: expect.any(Array) });
    expect(session.auditInProgress).toBe(false);
  });

  it('allows different users to audit concurrently while locking one user across requests', async () => {
    const completions: Array<(result: { text: string; model: string }) => void> = [];
    const engine: AuditEngine = {
      async checkAccess() {
        return true;
      },
      complete() {
        return new Promise((resolve) => {
          completions.push(resolve);
        });
      },
      async release() {},
    };
    const service = createService(engine, [], new SessionStore());
    const firstUser = auditor();
    const secondUser = { ...auditor(), sessionId: 'second-user-session' };
    const request = { content: '# Spécification', source: 'paste' as const };
    const firstAudit = service.run(firstUser, request, new AbortController().signal);

    await new Promise((resolve) => setTimeout(resolve, 0));
    const duplicateAudit = service.run(
      firstUser,
      request,
      new AbortController().signal,
    );
    await expect(duplicateAudit).rejects.toMatchObject({
      code: 'AUDIT_IN_PROGRESS',
    });

    const secondAudit = service.run(
      secondUser,
      request,
      new AbortController().signal,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(completions).toHaveLength(2);
    for (const complete of completions) {
      complete({ text: validOutput, model: 'gpt-5' });
    }

    await expect(Promise.all([firstAudit, secondAudit])).resolves.toHaveLength(2);
  });

  it('resets the in-progress flag after request validation fails', async () => {
    const session = auditor();
    const service = createService(new FakeAuditEngine([]));

    await expect(
      service.run(
        session,
        { content: ' \n', source: 'paste' },
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(AppError);
    expect(session.auditInProgress).toBe(false);
  });
});
