import { describe, expect, it } from 'vitest';
import {
  AiAuditOutputSchema,
  AuditRequestSchema,
  TypedAuditResultSchema,
} from '../../src/shared/schemas.js';

const validOutput = {
  pillars: [
    {
      pillarId: '01',
      score: 60,
      summary: ['Le problème est identifié.', 'La valeur attendue est décrite.'],
      description: 'Le contexte est décrit.',
      improvements: ['Ajouter des indicateurs de succès.'],
    },
    {
      pillarId: '02',
      score: 60,
      summary: ['Les utilisateurs sont identifiés.', 'Les exclusions sont précisées.'],
      description: 'Le périmètre est décrit.',
      improvements: ['Préciser les utilisateurs.'],
    },
    {
      pillarId: '03',
      score: 60,
      summary: ['Les besoins sont présentés.', 'Des règles métier sont précisées.'],
      description: 'Les besoins sont décrits.',
      improvements: ['Détailler les règles métier.'],
    },
    {
      pillarId: '04',
      score: 60,
      summary: ['Les données sont identifiées.', 'Les interfaces sont précisées.'],
      description: 'Les données sont décrites.',
      improvements: ['Préciser les interfaces.'],
    },
    {
      pillarId: '05',
      score: 60,
      summary: ['Les critères sont observables.', 'Les cas d’erreur sont abordés.'],
      description: 'Les critères sont décrits.',
      improvements: ['Ajouter des cas d’erreur.'],
    },
    {
      pillarId: '06',
      score: 60,
      summary: ['Les exigences sont présentées.', 'La disponibilité est précisée.'],
      description: 'Les exigences sont décrites.',
      improvements: ['Préciser la disponibilité.'],
    },
  ],
};

describe('AiAuditOutputSchema', () => {
  it('accepts six complete pillar evaluations in canonical order', () => {
    expect(AiAuditOutputSchema.safeParse(validOutput).success).toBe(true);
  });

  it('requires one to three non-empty summary points of at most 180 characters', () => {
    const emptySummary = structuredClone(validOutput);
    emptySummary.pillars[0]!.summary = [];
    expect(AiAuditOutputSchema.safeParse(emptySummary).success).toBe(false);

    const tooManyPoints = structuredClone(validOutput);
    tooManyPoints.pillars[0]!.summary = ['Un.', 'Deux.', 'Trois.', 'Quatre.'];
    expect(AiAuditOutputSchema.safeParse(tooManyPoints).success).toBe(false);

    const blankPoint = structuredClone(validOutput);
    blankPoint.pillars[0]!.summary = ['   '];
    expect(AiAuditOutputSchema.safeParse(blankPoint).success).toBe(false);

    const longPoint = structuredClone(validOutput);
    longPoint.pillars[0]!.summary = ['x'.repeat(181)];
    expect(AiAuditOutputSchema.safeParse(longPoint).success).toBe(false);
  });

  it.each([5, 7])('rejects an output containing %i pillars', (count) => {
    const output = structuredClone(validOutput);
    const pillars = output.pillars.slice(0, count);
    while (pillars.length < count) pillars.push(structuredClone(validOutput.pillars[5]!));
    output.pillars = pillars;
    expect(AiAuditOutputSchema.safeParse(output).success).toBe(false);
  });

  it('rejects pillars that are out of order or duplicated', () => {
    const outOfOrder = structuredClone(validOutput);
    [outOfOrder.pillars[0], outOfOrder.pillars[1]] = [
      outOfOrder.pillars[1]!,
      outOfOrder.pillars[0]!,
    ];
    expect(AiAuditOutputSchema.safeParse(outOfOrder).success).toBe(false);

    const duplicated = structuredClone(validOutput);
    duplicated.pillars[1]!.pillarId = '01';
    expect(AiAuditOutputSchema.safeParse(duplicated).success).toBe(false);
  });

  it.each([101, -1, 42.5])('rejects score %s outside the integer range 0–100', (score) => {
    const output = structuredClone(validOutput);
    output.pillars[0]!.score = score;
    expect(AiAuditOutputSchema.safeParse(output).success).toBe(false);
  });

  it('rejects blank descriptions, blank improvements, and extra properties', () => {
    const blankDescription = structuredClone(validOutput);
    blankDescription.pillars[0]!.description = '   ';
    expect(AiAuditOutputSchema.safeParse(blankDescription).success).toBe(false);

    const noImprovements = structuredClone(validOutput);
    noImprovements.pillars[0]!.improvements = [];
    expect(AiAuditOutputSchema.safeParse(noImprovements).success).toBe(false);

    const blankImprovement = structuredClone(validOutput);
    blankImprovement.pillars[0]!.improvements = [''];
    expect(AiAuditOutputSchema.safeParse(blankImprovement).success).toBe(false);

    expect(
      AiAuditOutputSchema.safeParse({
        ...validOutput,
        globalScore: 60,
      }).success,
    ).toBe(false);
  });
});

describe('AuditRequestSchema', () => {
  it('requires a reference for plan and tasks audits while keeping spec as the default', () => {
    expect(
      AuditRequestSchema.safeParse({
        content: '# Plan',
        source: 'paste',
        documentType: 'plan',
        referenceContent: '# Spec',
      }).success,
    ).toBe(true);
    expect(
      AuditRequestSchema.safeParse({
        content: '# Tasks',
        source: 'paste',
        documentType: 'tasks',
      }).success,
    ).toBe(false);
    expect(
      AuditRequestSchema.safeParse({ content: '# Spec', source: 'paste' }),
    ).toMatchObject({ success: true, data: { documentType: 'spec' } });
  });
});

describe('AuditResultSchema', () => {
  it('accepts a typed result with six generic criterion evaluations', () => {
    const result = {
      auditedAt: '2026-09-28T14:05:00.000Z',
      documentName: 'plan-paiement',
      documentType: 'plan',
      source: 'paste',
      fileName: null,
      globalScore: 91,
      globalBand: 'excellent',
      evaluations: Array.from({ length: 6 }, (_, index) => ({
        criterionId: `0${index + 1}`,
        title: `Critère ${index + 1}`,
        score: 91,
        band: 'excellent',
        summary: ['Évaluation complète.'],
        description: 'Description factuelle.',
        improvements: ['Aucune amélioration nécessaire.'],
      })),
      model: 'test-model',
    };

    expect(TypedAuditResultSchema.safeParse(result).success).toBe(true);
  });
});
