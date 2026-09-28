import { useCallback, useEffect, useRef, useState } from 'react';
import { SessionStateSchema } from '../shared/schemas.js';
import type { User } from '../shared/schemas.js';
import {
  ApiClientError,
  apiGet,
  setSessionExpiryHandler,
  setUnauthenticatedHandler,
} from './api.js';
import {
  AuditPage,
} from './components/AuditPage.js';
import { AuditProgressHeader } from './components/AuditProgressHeader.js';
import {
  canEnterAuditStep,
  INITIAL_AUDIT_WORKFLOW_STATE,
} from './audit-workflow.js';
import type { AuditWorkflowState } from './audit-workflow.js';
import type { AuditDocumentType } from '../shared/audit-criteria.js';
import { LoginScreen } from './components/LoginScreen.js';
import { NoCopilotAccess } from './components/NoCopilotAccess.js';
import { UserBar } from './components/UserBar.js';

const SESSION_STATUS_INTERVAL_MS = 60_000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const SESSION_EXPIRED_MESSAGE = 'Votre session a expiré. Veuillez vous reconnecter.';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string>();
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
  const auditOwnerLogin = useRef<string | null>(null);
  const auditGenerationRef = useRef(0);
  const sessionExpiresAtRef = useRef<string | null>(null);
  const [auditGeneration, setAuditGeneration] = useState(0);
  const [auditState, setAuditState] = useState<AuditWorkflowState>(
    INITIAL_AUDIT_WORKFLOW_STATE,
  );

  const advanceAuditGeneration = useCallback(() => {
    const nextGeneration = auditGenerationRef.current + 1;
    auditGenerationRef.current = nextGeneration;
    setAuditGeneration(nextGeneration);
  }, []);

  const handleAuditStateChange = useCallback(
    (nextState: AuditWorkflowState) => {
      if (auditGenerationRef.current === auditGeneration) {
        setAuditState(nextState);
      }
    },
    [auditGeneration],
  );

  const lockSession = useCallback((message?: string) => {
    advanceAuditGeneration();
    setAuditState((currentState) => {
      const activeStep = currentState.steps[currentState.activeStep];
      if (activeStep.status !== 'running') {
        return currentState;
      }
      return {
        ...currentState,
        screen: 'input',
        steps: {
          ...currentState.steps,
          [currentState.activeStep]: {
            ...activeStep,
            status: 'error',
            error: message ?? SESSION_EXPIRED_MESSAGE,
          },
        },
      };
    });
    setUser(null);
    setLoading(false);
    setSessionError(message);
    sessionExpiresAtRef.current = null;
    setSessionExpiresAt(null);
  }, [advanceAuditGeneration]);

  const updateSessionExpiry = useCallback((expiresAt: string) => {
    sessionExpiresAtRef.current = expiresAt;
    setSessionExpiresAt(expiresAt);
  }, []);

  const handleAuthenticated = useCallback((authenticatedUser: User) => {
    const expiresAt = sessionExpiresAtRef.current;
    if (!expiresAt || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) {
      lockSession('Le serveur n’a pas fourni une échéance de session valide.');
      return;
    }

    const previousLogin = auditOwnerLogin.current;
    if (previousLogin !== null && previousLogin !== authenticatedUser.login) {
      advanceAuditGeneration();
      setAuditState(INITIAL_AUDIT_WORKFLOW_STATE);
    }
    auditOwnerLogin.current = authenticatedUser.login;
    setUser(authenticatedUser);
    setSessionError(undefined);
    setLoading(false);
  }, [advanceAuditGeneration, lockSession]);

  const handleLoggedOut = useCallback(() => {
    advanceAuditGeneration();
    setUser(null);
    setSessionError(undefined);
    setAuditState(INITIAL_AUDIT_WORKFLOW_STATE);
    auditOwnerLogin.current = null;
    sessionExpiresAtRef.current = null;
    setSessionExpiresAt(null);
  }, [advanceAuditGeneration]);

  useEffect(() => {
    let mounted = true;
    setUnauthenticatedHandler(() => {
      if (mounted) {
        lockSession();
      }
    });
    setSessionExpiryHandler((expiresAt) => {
      if (mounted) {
        updateSessionExpiry(expiresAt);
      }
    });
    void apiGet('/api/session', SessionStateSchema)
      .then((session) => {
        if (!mounted) {
          return;
        }
        if (!session.authenticated) {
          lockSession();
          return;
        }
        if (!session.user) {
          lockSession('La réponse de session est invalide.');
          return;
        }
        handleAuthenticated(session.user);
      })
      .catch((cause: unknown) => {
        if (mounted) {
          lockSession(
            cause instanceof ApiClientError
              ? cause.message
              : 'Impossible de contacter le serveur local.',
          );
        }
      });

    return () => {
      mounted = false;
      setUnauthenticatedHandler(() => undefined);
      setSessionExpiryHandler(() => undefined);
    };
  }, [handleAuthenticated, lockSession, updateSessionExpiry]);

  useEffect(() => {
    if (!user || !sessionExpiresAt) {
      return;
    }

    const deadline = Date.parse(sessionExpiresAt);
    if (!Number.isFinite(deadline)) {
      lockSession('Le serveur a fourni une date d’expiration de session invalide.');
      return;
    }

    let cancelled = false;
    let checkingSession = false;
    let deadlineTimer = 0;

    function lockIfExpired(): boolean {
      if (Date.now() < deadline) {
        return false;
      }
      lockSession(SESSION_EXPIRED_MESSAGE);
      return true;
    }

    async function checkSession(checkAfterDeadline = false) {
      if (cancelled || checkingSession) {
        return;
      }

      const deadlinePassed = lockIfExpired();
      if (deadlinePassed && !checkAfterDeadline) {
        return;
      }

      checkingSession = true;
      try {
        const session = await apiGet('/api/session', SessionStateSchema);
        if (cancelled || deadlinePassed) {
          return;
        }
        if (!session.authenticated || !session.user) {
          lockSession('Votre session n’est plus valide. Veuillez vous reconnecter.');
          return;
        }

        const sessionUser = session.user;
        if (
          auditOwnerLogin.current !== null &&
          auditOwnerLogin.current !== sessionUser.login
        ) {
          advanceAuditGeneration();
          auditOwnerLogin.current = sessionUser.login;
          setAuditState(INITIAL_AUDIT_WORKFLOW_STATE);
        } else if (auditOwnerLogin.current === null) {
          auditOwnerLogin.current = sessionUser.login;
        }
        setUser((currentUser) =>
          currentUser?.login === sessionUser.login ? currentUser : sessionUser,
        );
      } catch (cause) {
        if (!cancelled) {
          lockSession(
            cause instanceof ApiClientError
              ? cause.message
              : 'Impossible de vérifier votre session. Veuillez vous reconnecter.',
          );
        }
      } finally {
        checkingSession = false;
      }
    }

    function armDeadlineTimer() {
      if (cancelled) {
        return;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        lockSession(SESSION_EXPIRED_MESSAGE);
        return;
      }
      deadlineTimer = window.setTimeout(
        armDeadlineTimer,
        Math.min(remaining, MAX_TIMER_DELAY_MS),
      );
    }

    function checkOnVisibility() {
      if (document.visibilityState !== 'visible') {
        return;
      }
      const deadlinePassed = Date.now() >= deadline;
      if (deadlinePassed) {
        lockSession(SESSION_EXPIRED_MESSAGE);
      }
      void checkSession(deadlinePassed);
    }

    armDeadlineTimer();
    const statusTimer = window.setInterval(
      () => void checkSession(),
      SESSION_STATUS_INTERVAL_MS,
    );
    document.addEventListener('visibilitychange', checkOnVisibility);

    return () => {
      cancelled = true;
      window.clearTimeout(deadlineTimer);
      window.clearInterval(statusTimer);
      document.removeEventListener('visibilitychange', checkOnVisibility);
    };
  }, [advanceAuditGeneration, lockSession, sessionExpiresAt, user]);

  if (loading) {
    return (
      <main className="app-shell">
        <p aria-live="polite">Chargement de votre session…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <>
        {sessionError && (
          <div className="app-shell login-error" role="alert">
            {sessionError}
          </div>
        )}
        <LoginScreen onAuthenticated={handleAuthenticated} />
      </>
    );
  }

  if (user.copilotAccess === 'none') {
    return (
      <main className="app-shell">
        <UserBar user={user} onLoggedOut={handleLoggedOut} showLogout={false} />
        <NoCopilotAccess onLoggedOut={handleLoggedOut} />
      </main>
    );
  }

  function selectAuditStep(documentType: AuditDocumentType) {
    setAuditState((currentState) => {
      if (!canEnterAuditStep(currentState, documentType)) {
        return currentState;
      }
      return {
        ...currentState,
        activeStep: documentType,
        screen: currentState.steps[documentType].result ? 'result' : 'input',
      };
    });
  }

  return (
    <main className="app-shell">
      <UserBar
        user={user}
        onLoggedOut={handleLoggedOut}
        showBrandHeading
      />
      <AuditProgressHeader state={auditState} onStepSelect={selectAuditStep} />
      <AuditPage state={auditState} onStateChange={handleAuditStateChange} />
    </main>
  );
}
