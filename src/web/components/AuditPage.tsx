import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Zap } from 'lucide-react';
import { MAX_CONTENT_BYTES, AuditResultSchema } from '../../shared/schemas.js';
import type { AuditDocumentType } from '../../shared/audit-criteria.js';
import type { AuditResult } from '../../shared/schemas.js';
import {
  canEnterAuditStep,
  INITIAL_AUDIT_WORKFLOW_STATE,
  invalidateAuditStepAndFollowing,
} from '../audit-workflow.js';
import type { AuditWorkflowState } from '../audit-workflow.js';
import { ApiClientError, apiPost } from '../api.js';
import { AuditResultScreen } from './AuditResultScreen.js';
import { DocumentInput } from './DocumentInput.js';
import { PrivacyNotice } from './PrivacyNotice.js';

export type AuditPageState = AuditWorkflowState;
export const INITIAL_AUDIT_PAGE_STATE = INITIAL_AUDIT_WORKFLOW_STATE;

interface AuditPageProps {
  state: AuditPageState;
  onStateChange: (state: AuditPageState) => void;
}

export function AuditPage({ state, onStateChange }: AuditPageProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [focusNewResult, setFocusNewResult] = useState(false);
  const inputTabRef = useRef<HTMLButtonElement>(null);
  const resultTabRef = useRef<HTMLButtonElement>(null);
  const step = state.steps[state.activeStep];
  const referenceStep: AuditDocumentType | null =
    state.activeStep === 'plan'
      ? 'spec'
      : state.activeStep === 'tasks'
        ? 'plan'
        : null;
  const referenceContent = referenceStep
    ? state.steps[referenceStep].content
    : undefined;
  const contentBytes = new TextEncoder().encode(step.content).length;
  const isOverLimit = contentBytes > MAX_CONTENT_BYTES;
  const isSubmitDisabled =
    step.content.trim() === '' ||
    isOverLimit ||
    isRunning ||
    !canEnterAuditStep(state, state.activeStep);
  const isResultTabDisabled =
    step.result === null || isRunning || step.status === 'running';

  function selectScreen(screen: AuditPageState['screen']) {
    if (screen === 'result' && isResultTabDisabled) {
      return;
    }

    setFocusNewResult(false);
    onStateChange({ ...state, screen });
  }

  function focusTab(screen: AuditPageState['screen']) {
    const tab = screen === 'input' ? inputTabRef.current : resultTabRef.current;
    tab?.focus();
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const enabledTabs: AuditPageState['screen'][] = isResultTabDisabled
      ? ['input']
      : ['input', 'result'];
    const focusedScreen =
      event.currentTarget.id === 'audit-result-tab' ? 'result' : 'input';
    const currentIndex = enabledTabs.indexOf(focusedScreen);
    let nextScreen: AuditPageState['screen'] | null = null;

    if (event.key === 'ArrowLeft') {
      nextScreen =
        enabledTabs[
          (currentIndex - 1 + enabledTabs.length) % enabledTabs.length
        ] ?? 'input';
    } else if (event.key === 'ArrowRight') {
      nextScreen = enabledTabs[(currentIndex + 1) % enabledTabs.length] ?? 'input';
    } else if (event.key === 'Home') {
      nextScreen = enabledTabs[0] ?? 'input';
    } else if (event.key === 'End') {
      nextScreen = enabledTabs[enabledTabs.length - 1] ?? 'input';
    }

    if (nextScreen === null) {
      return;
    }

    event.preventDefault();
    selectScreen(nextScreen);
    window.requestAnimationFrame(() => focusTab(nextScreen));
  }

  function handleContentChange(content: string) {
    setFocusNewResult(false);
    const invalidated = invalidateAuditStepAndFollowing(state, state.activeStep);
    onStateChange({
      ...invalidated,
      steps: {
        ...invalidated.steps,
        [state.activeStep]: { ...invalidated.steps[state.activeStep], content },
      },
    });
  }

  function replaceContent(content: string) {
    setFocusNewResult(false);
    const invalidated = invalidateAuditStepAndFollowing(state, state.activeStep);
    onStateChange({
      ...invalidated,
      steps: {
        ...invalidated.steps,
        [state.activeStep]: {
          ...invalidated.steps[state.activeStep],
          content,
          source: 'paste',
          fileName: null,
        },
      },
    });
  }

  async function runAudit() {
    if (isSubmitDisabled) {
      return;
    }

    setIsRunning(true);
    setFocusNewResult(false);
    onStateChange({
      ...state,
      steps: {
        ...state.steps,
        [state.activeStep]: { ...step, status: 'running', error: null },
      },
    });

    try {
      const result = await apiPost<AuditResult>(
        '/api/audits',
        {
          content: step.content,
          source: step.source,
          fileName: step.fileName,
          documentType: state.activeStep,
          ...(referenceContent ? { referenceContent } : {}),
        },
        AuditResultSchema,
      );
      const nextStep =
        state.activeStep === 'spec'
          ? 'plan'
          : state.activeStep === 'plan'
            ? 'tasks'
            : null;
      const advance = result.globalScore > 90 && nextStep !== null;
      setFocusNewResult(!advance);
      onStateChange({
        ...state,
        activeStep: advance ? nextStep : state.activeStep,
        screen: advance ? 'input' : 'result',
        steps: {
          ...state.steps,
          [state.activeStep]: { ...step, status: 'done', result, error: null },
        },
      });
    } catch (cause) {
      setFocusNewResult(false);
      onStateChange({
        ...state,
        screen: 'input',
        steps: {
          ...state.steps,
          [state.activeStep]: {
            ...step,
            status: 'error',
            error:
              cause instanceof ApiClientError
                ? cause.message
                : 'L’audit a échoué. Veuillez réessayer.',
          },
        },
      });
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section className="audit-page" aria-labelledby="audit-page-title">
      <PrivacyNotice hasReference={Boolean(referenceContent)} />
      {referenceStep && referenceContent !== undefined && (
        <aside className="audit-reference" aria-label="Document de référence">
          <p>
            Lié à <strong>{referenceStep}.md</strong> — l’audit comparera le document courant à cette référence.
          </p>
          <details>
            <summary>Afficher le contenu de référence envoyé</summary>
            <pre>{referenceContent}</pre>
          </details>
        </aside>
      )}
      <div className="audit-workspace">
        <div
          className="audit-tabs"
          role="tablist"
          aria-label="Navigation de l’audit"
        >
          <button
            id="audit-input-tab"
            ref={inputTabRef}
            type="button"
            role="tab"
            aria-selected={state.screen === 'input'}
            aria-controls="audit-input-panel"
            tabIndex={state.screen === 'input' ? 0 : -1}
            onClick={() => selectScreen('input')}
            onKeyDown={handleTabKeyDown}
          >
            <span className="tab-step" aria-hidden="true">
              1
            </span>
            <span>Mettre le MD</span>
          </button>
          <button
            id="audit-result-tab"
            ref={resultTabRef}
            type="button"
            role="tab"
            aria-selected={state.screen === 'result'}
            aria-controls="audit-result-panel"
            tabIndex={state.screen === 'result' ? 0 : -1}
            disabled={isResultTabDisabled}
            onClick={() => selectScreen('result')}
            onKeyDown={handleTabKeyDown}
          >
            <span className="tab-step" aria-hidden="true">
              2
            </span>
            <span>Le résultat</span>
            {step.result === null && (
              <span className="tab-status" aria-hidden="true">
                EN ATTENTE
              </span>
            )}
          </button>
        </div>
        <div
          id="audit-input-panel"
          className="audit-panel"
          role="tabpanel"
          aria-labelledby="audit-input-tab"
          hidden={state.screen !== 'input'}
        >
          {state.screen === 'input' && (
            <>
              <DocumentInput
                value={step.content}
                documentType={state.activeStep}
                onChange={handleContentChange}
                onContentReplaced={replaceContent}
                fileName={step.source === 'file' ? step.fileName : null}
                onFileLoaded={({ content, fileName }) => {
                  setFocusNewResult(false);
                  const invalidated = invalidateAuditStepAndFollowing(
                    state,
                    state.activeStep,
                  );
                  onStateChange({
                    ...invalidated,
                    steps: {
                      ...invalidated.steps,
                      [state.activeStep]: {
                        ...invalidated.steps[state.activeStep],
                        content,
                        source: 'file',
                        fileName,
                      },
                    },
                  });
                }}
                disabled={isRunning}
              />
              <div className="audit-controls">
                <button
                  type="button"
                  className="button-primary"
                  disabled={isSubmitDisabled}
                  onClick={() => void runAudit()}
                >
                  {isRunning ? (
                    <>
                      <span className="audit-spinner" aria-hidden="true" />
                      Analyse en cours… (jusqu’à 1 à 2 minutes)
                    </>
                  ) : step.status === 'error' ? (
                    "Relancer l'audit"
                  ) : (
                    <>
                      <Zap aria-hidden="true" focusable="false" size={16} />
                      Lancer l'audit
                    </>
                  )}
                </button>
              </div>
              {isRunning && (
                <span className="visually-hidden" role="status" aria-live="polite">
                  Analyse en cours… (jusqu’à 1 à 2 minutes)
                </span>
              )}
              {step.error && (
                <div className="audit-error" role="alert">
                  {step.error}
                </div>
              )}
            </>
          )}
        </div>
        <div
          id="audit-result-panel"
          className="audit-panel"
          role="tabpanel"
          aria-labelledby="audit-result-tab"
          hidden={state.screen !== 'result'}
        >
          {state.screen === 'result' && step.result && (
            <AuditResultScreen
              result={step.result}
              focusHeading={focusNewResult}
            />
          )}
        </div>
      </div>
    </section>
  );
}
