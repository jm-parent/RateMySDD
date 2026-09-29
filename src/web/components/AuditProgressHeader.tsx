import { Check, LockKeyhole } from 'lucide-react';
import { AUDIT_DOCUMENT_TYPES } from '../../shared/audit-criteria.js';
import type { AuditDocumentType } from '../../shared/audit-criteria.js';
import { AUDIT_PASSING_SCORE, canEnterAuditStep } from '../audit-workflow.js';
import type { AuditWorkflowState } from '../audit-workflow.js';

const STEP_COPY: Record<AuditDocumentType, { label: string; description: string }> = {
  spec: { label: 'spec.md', description: 'Spécification fonctionnelle' },
  plan: { label: 'plan.md', description: 'Architecture & Composants' },
  tasks: { label: 'tasks.md', description: 'Découpage opérationnel' },
};

interface AuditProgressHeaderProps {
  state: AuditWorkflowState;
  onStepSelect: (documentType: AuditDocumentType) => void;
}

export function AuditProgressHeader({
  state,
  onStepSelect,
}: AuditProgressHeaderProps) {
  const isRunning = Object.values(state.steps).some(
    ({ status }) => status === 'running',
  );

  return (
    <nav className="audit-progress" aria-label="Progression des audits">
      <ol className="audit-progress-list">
        {AUDIT_DOCUMENT_TYPES.map((documentType, index) => {
          const step = state.steps[documentType];
          const score = step.result?.globalScore ?? null;
          const isComplete = score !== null && score >= AUDIT_PASSING_SCORE;
          const isCurrent = state.activeStep === documentType;
          const isUnlocked = canEnterAuditStep(state, documentType);
          const status = isComplete
            ? 'Validé'
            : isCurrent && score !== null
              ? 'Seuil non atteint'
              : isCurrent
                ? 'En cours'
                : 'Verrouillé';
          const copy = STEP_COPY[documentType];

          return (
            <li
              key={documentType}
              className={`audit-progress-item${isCurrent ? ' is-current' : ''}${isComplete ? ' is-complete' : ''}${!isUnlocked ? ' is-locked' : ''}`}
            >
              <button
                type="button"
                className="audit-progress-step"
                aria-current={isCurrent ? 'step' : undefined}
                disabled={!isUnlocked || isRunning}
                onClick={() => onStepSelect(documentType)}
              >
                <span className="audit-progress-marker" aria-hidden="true">
                  {isComplete ? (
                    <Check size={16} />
                  ) : !isUnlocked ? (
                    <LockKeyhole size={14} />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="audit-progress-copy">
                  <span className="audit-progress-heading">
                    <strong>{index + 1}.&nbsp; {copy.label}</strong>
                    {score !== null && (
                      <span className="audit-progress-score">{score}%</span>
                    )}
                  </span>
                  <span className="audit-progress-description">{copy.description}</span>
                </span>
                <span className="audit-progress-status">{status}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}