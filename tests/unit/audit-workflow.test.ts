import { describe, expect, it } from 'vitest';
import { bandFor } from '../../src/shared/scoring.js';
import type { AuditResult } from '../../src/shared/schemas.js';
import {
  INITIAL_AUDIT_WORKFLOW_STATE,
  canEnterAuditStep,
  invalidateAuditStepAndFollowing,
} from '../../src/web/audit-workflow.js';

function result(documentType: AuditResult['documentType'], score: number): AuditResult {
  return {
    auditedAt: '2026-09-28T14:05:00.000Z',
    documentName: documentType,
    documentType,
    source: 'paste',
    fileName: null,
    globalScore: score,
    globalBand: bandFor(score),
    evaluations: Array.from({ length: 6 }, (_, index) => ({
      criterionId: (['01', '02', '03', '04', '05', '06'] as const)[index]!,
      title: `Critère ${index + 1}`,
      score,
      band: bandFor(score),
      summary: ['Couvert.'],
      description: 'Description.',
      improvements: ['Préciser un cas.'],
    })),
    model: 'test-model',
  };
}

describe('audit workflow', () => {
  it('keeps later steps locked until the previous score is greater than 90', () => {
    const at90 = {
      ...INITIAL_AUDIT_WORKFLOW_STATE,
      steps: {
        ...INITIAL_AUDIT_WORKFLOW_STATE.steps,
        spec: { ...INITIAL_AUDIT_WORKFLOW_STATE.steps.spec, result: result('spec', 90) },
      },
    };
    const at91 = {
      ...at90,
      steps: {
        ...at90.steps,
        spec: { ...at90.steps.spec, result: result('spec', 91) },
      },
    };

    expect(canEnterAuditStep(INITIAL_AUDIT_WORKFLOW_STATE, 'spec')).toBe(true);
    expect(canEnterAuditStep(at90, 'plan')).toBe(false);
    expect(canEnterAuditStep(at91, 'plan')).toBe(true);
    expect(canEnterAuditStep(at91, 'tasks')).toBe(false);
  });

  it('unlocks tasks only after a passing plan result', () => {
    const state = {
      ...INITIAL_AUDIT_WORKFLOW_STATE,
      steps: {
        ...INITIAL_AUDIT_WORKFLOW_STATE.steps,
        spec: { ...INITIAL_AUDIT_WORKFLOW_STATE.steps.spec, result: result('spec', 95) },
        plan: { ...INITIAL_AUDIT_WORKFLOW_STATE.steps.plan, result: result('plan', 91) },
      },
    };

    expect(canEnterAuditStep(state, 'tasks')).toBe(true);
  });

  it('invalidates the edited step and its dependents without erasing their drafts', () => {
    const state = {
      ...INITIAL_AUDIT_WORKFLOW_STATE,
      activeStep: 'tasks' as const,
      screen: 'result' as const,
      steps: {
        spec: { ...INITIAL_AUDIT_WORKFLOW_STATE.steps.spec, content: '# Spec', result: result('spec', 95) },
        plan: { ...INITIAL_AUDIT_WORKFLOW_STATE.steps.plan, content: '# Plan', result: result('plan', 94) },
        tasks: { ...INITIAL_AUDIT_WORKFLOW_STATE.steps.tasks, content: '# Tasks', result: result('tasks', 93) },
      },
    };

    const updated = invalidateAuditStepAndFollowing(state, 'plan');

    expect(updated.steps.spec.result?.globalScore).toBe(95);
    expect(updated.steps.plan).toMatchObject({ content: '# Plan', result: null, status: 'idle' });
    expect(updated.steps.tasks).toMatchObject({ content: '# Tasks', result: null, status: 'idle' });
    expect(updated.activeStep).toBe('plan');
    expect(updated.screen).toBe('input');
  });
});