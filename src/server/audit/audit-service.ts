import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import { criteriaForDocumentType } from '../../shared/audit-criteria.js';
import { TypedAuditResultSchema } from '../../shared/schemas.js';
import type { AuditRequest, TypedAuditResult } from '../../shared/schemas.js';
import { bandFor, computeGlobalScore } from '../../shared/scoring.js';
import type { AppConfig } from '../config.js';
import { AppError } from '../errors.js';
import type { AuditorSession } from '../auth/session-store.js';
import { EngineError } from './engine.js';
import type { AuditEngine } from './engine.js';
import { AiOutputInvalidError, parseAiOutput } from './parse-output.js';
import { buildPrompt } from './prompt.js';
import { validateAuditRequest } from './validate-request.js';

interface AuditServiceOptions {
  engine: AuditEngine;
  config: AppConfig;
  logger: Pick<FastifyBaseLogger, 'info'>;
  lockStore?: {
    acquireAuditLock(sessionId: string, ownerId: string, ttlMs: number): Promise<boolean>;
    releaseAuditLock(sessionId: string, ownerId: string): Promise<void>;
  };
}

const AUDIT_LOCK_TTL_MS = 240_000;

function mapEngineError(error: EngineError): AppError {
  switch (error.kind) {
    case 'timeout':
      return new AppError('COPILOT_TIMEOUT', { cause: error });
    case 'rate_limited':
      return new AppError('COPILOT_RATE_LIMITED', { cause: error });
    case 'unavailable':
      return new AppError('COPILOT_UNAVAILABLE', { cause: error });
    case 'unauthorized':
      return new AppError('UNAUTHENTICATED', { cause: error });
  }
}

function untrustedContent(body: unknown): string {
  if (
    typeof body === 'object' &&
    body !== null &&
    'content' in body &&
    typeof body.content === 'string'
  ) {
    return body.content;
  }
  return '';
}

export function createAuditService({ engine, config, logger, lockStore }: AuditServiceOptions) {
  return {
    async run(
      auditor: AuditorSession,
      body: unknown,
      signal: AbortSignal,
    ): Promise<TypedAuditResult> {
      const startedAt = Date.now();
      const requestBytes =
        Buffer.byteLength(untrustedContent(body), 'utf8') +
        (typeof body === 'object' && body !== null && 'referenceContent' in body &&
        typeof body.referenceContent === 'string'
          ? Buffer.byteLength(body.referenceContent, 'utf8')
          : 0);
      let attempts = 0;
      let outcome = 'error';
      let lockOwnerId: string | undefined;

      try {
        const request = validateAuditRequest(body);
        if (lockStore) {
          lockOwnerId = randomUUID();
          if (
            !(await lockStore.acquireAuditLock(
              auditor.sessionId,
              lockOwnerId,
              AUDIT_LOCK_TTL_MS,
            ))
          ) {
            lockOwnerId = undefined;
            throw new AppError('AUDIT_IN_PROGRESS');
          }
        } else {
          if (auditor.auditInProgress) {
            throw new AppError('AUDIT_IN_PROGRESS');
          }
          auditor.auditInProgress = true;
        }

        for (let attempt = 1; attempt <= 2; attempt += 1) {
          attempts = attempt;
          try {
            const prompt = buildPrompt(request.content, {
              documentType: request.documentType,
              referenceContent: request.referenceContent,
              reminder: attempt === 2,
            });
            const completion = await engine.complete({
              token: auditor.accessToken,
              ...prompt,
              signal,
              timeoutMs: 50_000,
            });
            const aiOutput = parseAiOutput(completion.text, request.documentType);
            const globalScore = computeGlobalScore(
              aiOutput.evaluations.map(({ score }) => score),
            );
            const criteria = criteriaForDocumentType(request.documentType);
            const fileName =
              request.source === 'file' ? request.fileName! : null;
            const result = TypedAuditResultSchema.parse({
              auditedAt: new Date().toISOString(),
              documentName: fileName
                ? fileName.replace(/\.md$/i, '')
                : 'Texte collé',
              documentType: request.documentType,
              source: request.source,
              fileName,
              globalScore,
              globalBand: bandFor(globalScore),
              evaluations: aiOutput.evaluations.map((evaluation, index) => ({
                ...evaluation,
                title: criteria[index]!.title,
                band: bandFor(evaluation.score),
              })),
              model: completion.model || config.copilotModel,
            });
            outcome = 'success';
            return result;
          } catch (error) {
            if (error instanceof AiOutputInvalidError) {
              if (attempt < 2) {
                continue;
              }
              throw new AppError('AI_OUTPUT_INVALID', { cause: error });
            }
            if (error instanceof EngineError) {
              throw mapEngineError(error);
            }
            throw error;
          }
        }

        throw new AppError('AI_OUTPUT_INVALID');
      } finally {
        if (lockStore && lockOwnerId) {
          try {
            await lockStore.releaseAuditLock(auditor.sessionId, lockOwnerId);
          } catch {
            logger.info({ event: 'audit_lock_release_failed' }, 'audit lock cleanup failed');
          }
        } else if (!lockStore && auditor.auditInProgress) {
          auditor.auditInProgress = false;
        }
        logger.info(
          {
            event: 'audit',
            bytes: requestBytes,
            durationMs: Math.max(0, Date.now() - startedAt),
            attempts,
            outcome,
          },
          'audit completed',
        );
      }
    },
  };
}

export type { AuditRequest };
