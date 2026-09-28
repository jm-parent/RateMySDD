import { z } from 'zod';
import { PILLAR_IDS } from './pillars.js';
import type { PillarId } from './pillars.js';
import { SCORE_BANDS } from './scoring.js';
import type { BandLabel } from './scoring.js';

export const MAX_CONTENT_BYTES = 204_800;

export const ErrorCodeSchema = z.enum([
  'UNAUTHENTICATED',
  'NO_COPILOT_ACCESS',
  'FORBIDDEN_ORIGIN',
  'EMPTY_CONTENT',
  'INVALID_FILE_TYPE',
  'INVALID_ENCODING',
  'CONTENT_TOO_LARGE',
  'AUDIT_IN_PROGRESS',
  'AI_OUTPUT_INVALID',
  'COPILOT_RATE_LIMITED',
  'COPILOT_UNAVAILABLE',
  'COPILOT_TIMEOUT',
  'DEVICE_FLOW_ERROR',
  'INTERNAL_ERROR',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ApiErrorSchema = z
  .object({
    code: ErrorCodeSchema,
    message: z.string().min(1),
  })
  .strict();
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const UserSchema = z
  .object({
    login: z.string().min(1),
    name: z.string().nullable(),
    avatarUrl: z.string().url().nullable(),
    copilotAccess: z.enum(['active', 'none']),
  })
  .strict();
export type User = z.infer<typeof UserSchema>;

export const SessionStateSchema = z
  .object({
    authenticated: z.boolean(),
    user: UserSchema.optional(),
  })
  .strict();
export type SessionState = z.infer<typeof SessionStateSchema>;

export const DeviceStartSchema = z
  .object({
    userCode: z.string().min(1),
    verificationUri: z.string().url(),
    expiresIn: z.number().int().positive(),
    interval: z.number().int().positive(),
  })
  .strict();
export type DeviceStart = z.infer<typeof DeviceStartSchema>;

export const DevicePollSchema = z
  .object({
    status: z.enum(['pending', 'slow_down', 'authorized', 'denied', 'expired']),
    interval: z.number().int().positive().optional(),
    user: UserSchema.optional(),
  })
  .strict();
export type DevicePoll = z.infer<typeof DevicePollSchema>;

export const AuditRequestSchema = z
  .object({
    content: z.string(),
    source: z.enum(['paste', 'file']),
    fileName: z.string().max(255).nullable().optional(),
    documentType: z.enum(['spec', 'plan', 'tasks']).default('spec'),
    referenceContent: z.string().optional(),
  })
  .strict()
  .superRefine(({ documentType, referenceContent }, context) => {
    if (documentType !== 'spec' && !referenceContent?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Le document de référence est requis pour cet audit.',
        path: ['referenceContent'],
      });
    }
  });
export type AuditRequest = z.infer<typeof AuditRequestSchema>;

const BandLabelSchema = z.enum(
  SCORE_BANDS.map(({ label }) => label) as [BandLabel, ...BandLabel[]],
);

const CRITERION_IDS = ['01', '02', '03', '04', '05', '06'] as const;
const CriterionIdSchema = z.enum(CRITERION_IDS);

export const AiCriterionEvaluationSchema = z
  .object({
    criterionId: CriterionIdSchema,
    score: z.number().int().min(0).max(100),
    summary: z.array(z.string().trim().min(1).max(180)).min(1).max(3),
    description: z.string().trim().min(1).max(2_000),
    improvements: z.array(z.string().trim().min(1).max(500)).min(1),
  })
  .strict();
export type AiCriterionEvaluation = z.infer<typeof AiCriterionEvaluationSchema>;

export const AiTypedAuditOutputSchema = z
  .object({
    evaluations: z.array(AiCriterionEvaluationSchema).length(6),
  })
  .strict()
  .superRefine(({ evaluations }, context) => {
    evaluations.forEach(({ criterionId }, index) => {
      if (criterionId !== CRITERION_IDS[index]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Le critère ${index + 1} n'est pas dans l'ordre canonique.`,
          path: ['evaluations', index, 'criterionId'],
        });
      }
    });
  });
export type AiTypedAuditOutput = z.infer<typeof AiTypedAuditOutputSchema>;

export const CriterionEvaluationSchema = AiCriterionEvaluationSchema.extend({
  title: z.string().trim().min(1),
  band: BandLabelSchema,
}).strict();
export type CriterionEvaluation = z.infer<typeof CriterionEvaluationSchema>;

export const TypedAuditResultSchema = z
  .object({
    auditedAt: z.string().datetime({ offset: true }),
    documentName: z.string().min(1),
    documentType: z.enum(['spec', 'plan', 'tasks']),
    source: z.enum(['paste', 'file']),
    fileName: z.string().max(255).nullable(),
    globalScore: z.number().int().min(0).max(100),
    globalBand: BandLabelSchema,
    evaluations: z.array(CriterionEvaluationSchema).length(6),
    model: z.string().min(1),
  })
  .strict()
  .superRefine(({ evaluations }, context) => {
    evaluations.forEach(({ criterionId }, index) => {
      if (criterionId !== CRITERION_IDS[index]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Le critère ${index + 1} n'est pas dans l'ordre canonique.`,
          path: ['evaluations', index, 'criterionId'],
        });
      }
    });
  });
export type TypedAuditResult = z.infer<typeof TypedAuditResultSchema>;

export const AiPillarEvaluationSchema = z
  .object({
    pillarId: z.enum(PILLAR_IDS),
    score: z.number().int().min(0).max(100),
    summary: z.array(z.string().trim().min(1).max(180)).min(1).max(3),
    description: z.string().trim().min(1).max(2_000),
    improvements: z.array(z.string().trim().min(1).max(500)).min(1),
  })
  .strict();
export type AiPillarEvaluation = z.infer<typeof AiPillarEvaluationSchema>;

export const AiAuditOutputSchema = z
  .object({
    pillars: z.array(AiPillarEvaluationSchema).length(6),
  })
  .strict()
  .superRefine(({ pillars }, context) => {
    pillars.forEach((pillar, index) => {
      if (pillar.pillarId !== PILLAR_IDS[index]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Le pilier ${index + 1} n'est pas dans l'ordre canonique.`,
          path: ['pillars', index, 'pillarId'],
        });
      }
    });
  });
export type AiAuditOutput = z.infer<typeof AiAuditOutputSchema>;

export const AuditResultSchema = TypedAuditResultSchema;
export type AuditResult = TypedAuditResult;

export type { BandLabel, PillarId };
