import type { AuditDocumentType } from '../shared/audit-criteria.js';
import type { AuditResult } from '../shared/schemas.js';

export type AuditStatus = 'idle' | 'running' | 'done' | 'error';
export type AuditSource = 'paste' | 'file';
export type AuditScreen = 'input' | 'result';

export interface AuditStepState {
  content: string;
  source: AuditSource;
  fileName: string | null;
  status: AuditStatus;
  result: AuditResult | null;
  error: string | null;
}

export interface AuditWorkflowState {
  activeStep: AuditDocumentType;
  screen: AuditScreen;
  steps: Record<AuditDocumentType, AuditStepState>;
}

function createStepState(): AuditStepState {
  return {
    content: '',
    source: 'paste',
    fileName: null,
    status: 'idle',
    result: null,
    error: null,
  };
}

export const INITIAL_AUDIT_WORKFLOW_STATE: AuditWorkflowState = {
  activeStep: 'spec',
  screen: 'input',
  steps: {
    spec: createStepState(),
    plan: createStepState(),
    tasks: createStepState(),
  },
};

const STEP_ORDER: readonly AuditDocumentType[] = ['spec', 'plan', 'tasks'];

export function canEnterAuditStep(
  state: AuditWorkflowState,
  documentType: AuditDocumentType,
): boolean {
  const stepIndex = STEP_ORDER.indexOf(documentType);
  if (stepIndex === 0) {
    return true;
  }

  const previousStep = STEP_ORDER[stepIndex - 1];
  const previousResult = previousStep ? state.steps[previousStep].result : null;
  return previousResult !== null && previousResult.globalScore > 90;
}

export function invalidateAuditStepAndFollowing(
  state: AuditWorkflowState,
  documentType: AuditDocumentType,
): AuditWorkflowState {
  const stepIndex = STEP_ORDER.indexOf(documentType);
  const steps = { ...state.steps };

  for (const affectedStep of STEP_ORDER.slice(stepIndex)) {
    const current = steps[affectedStep];
    steps[affectedStep] = {
      ...current,
      status: 'idle',
      result: null,
      error: null,
    };
  }

  return {
    ...state,
    activeStep: documentType,
    screen: 'input',
    steps,
  };
}