import { Bug } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  DevicePollSchema,
  DeviceStartSchema,
} from '../../shared/schemas.js';
import type {
  DiagnosticSnapshot,
  DiagnosticVariable,
  DevicePoll,
  DeviceStart,
  User,
} from '../../shared/schemas.js';
import { ApiClientError, apiGetDiagnostics, apiPost } from '../api.js';

type LoginStatus = 'idle' | 'starting' | 'pending' | 'denied' | 'expired';

const COPY_TOAST_DURATION_MS = 3_000;
const COPY_TOAST_FADE_DURATION_MS = 350;
const DIAGNOSTIC_STATUS_LABELS: Record<DiagnosticVariable['status'], string> = {
  valid: 'Valide',
  missing: 'Manquante',
  invalid: 'Invalide',
  optional: 'Optionnelle',
};
const RUNTIME_STATUS_LABELS: Record<DiagnosticSnapshot['runtime'], string> = {
  not_started: 'Non démarré',
  starting: 'Démarrage',
  ready: 'Prêt',
  failed: 'Échec',
};

interface LoginScreenProps {
  onAuthenticated: (user: User) => void;
}

export function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [device, setDevice] = useState<DeviceStart>();
  const [pollInterval, setPollInterval] = useState(5);
  const [pollVersion, setPollVersion] = useState(0);
  const [status, setStatus] = useState<LoginStatus>('idle');
  const [error, setError] = useState<string>();
  const [copyStatus, setCopyStatus] = useState('');
  const [copyStatusFading, setCopyStatusFading] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [diagnosticsToken, setDiagnosticsToken] = useState('');
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState<string>();
  const [diagnosticSnapshot, setDiagnosticSnapshot] =
    useState<DiagnosticSnapshot>();
  const copyStatusTimeout = useRef<number | undefined>(undefined);
  const copyStatusFadeTimeout = useRef<number | undefined>(undefined);
  const copyAttempt = useRef(0);

  function clearCopyStatusTimers() {
    if (copyStatusTimeout.current !== undefined) {
      window.clearTimeout(copyStatusTimeout.current);
      copyStatusTimeout.current = undefined;
    }
    if (copyStatusFadeTimeout.current !== undefined) {
      window.clearTimeout(copyStatusFadeTimeout.current);
      copyStatusFadeTimeout.current = undefined;
    }
  }

  async function beginLogin() {
    copyAttempt.current += 1;
    clearCopyStatusTimers();
    setStatus('starting');
    setDevice(undefined);
    setError(undefined);
    setCopyStatus('');
    setCopyStatusFading(false);
    try {
      const authorization = await apiPost<DeviceStart>(
        '/api/auth/device/start',
        undefined,
        DeviceStartSchema,
      );
      setDevice(authorization);
      setPollInterval(authorization.interval);
      setStatus('pending');
    } catch (cause) {
      setStatus('idle');
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : 'La connexion à GitHub a échoué. Veuillez réessayer.',
      );
    }
  }

  useEffect(() => {
    if (status !== 'pending' || !device) {
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void apiPost<DevicePoll>('/api/auth/device/poll', undefined, DevicePollSchema)
        .then((result) => {
          if (cancelled) {
            return;
          }
          if (result.status === 'authorized' && result.user) {
            onAuthenticated(result.user);
          } else if (result.status === 'authorized') {
            setStatus('idle');
            setError('La réponse de connexion est invalide. Veuillez recommencer.');
          } else if (result.status === 'denied') {
            setStatus('denied');
          } else if (result.status === 'expired') {
            setStatus('expired');
          } else {
            if (result.interval) {
              setPollInterval(result.interval);
            }
            setPollVersion((version) => version + 1);
          }
        })
        .catch((cause: unknown) => {
          if (!cancelled) {
            setStatus('idle');
            setError(
              cause instanceof ApiClientError
                ? cause.message
                : 'La connexion à GitHub a échoué. Veuillez réessayer.',
            );
          }
        });
    }, Math.max(1, pollInterval) * 1_000);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [device, onAuthenticated, pollInterval, pollVersion, status]);

  useEffect(() => {
    return () => {
      copyAttempt.current += 1;
      window.clearTimeout(copyStatusTimeout.current);
      window.clearTimeout(copyStatusFadeTimeout.current);
    };
  }, []);

  async function copyUserCode() {
    if (!device) {
      return;
    }
    const attempt = ++copyAttempt.current;
    clearCopyStatusTimers();
    setCopyStatus('');
    setCopyStatusFading(false);
    try {
      await navigator.clipboard.writeText(device.userCode);
      if (attempt !== copyAttempt.current) {
        return;
      }
      setCopyStatus('Code copié.');
      copyStatusTimeout.current = window.setTimeout(() => {
        setCopyStatusFading(true);
        copyStatusTimeout.current = undefined;
        copyStatusFadeTimeout.current = window.setTimeout(() => {
          setCopyStatus('');
          setCopyStatusFading(false);
          copyStatusFadeTimeout.current = undefined;
        }, COPY_TOAST_FADE_DURATION_MS);
      }, COPY_TOAST_DURATION_MS);
    } catch {
      if (attempt !== copyAttempt.current) {
        return;
      }
      setCopyStatus('La copie automatique est indisponible.');
      setCopyStatusFading(false);
    }
  }

  function closeDiagnostics() {
    setDiagnosticsOpen(false);
    setDiagnosticsToken('');
    setDiagnosticsError(undefined);
    setDiagnosticSnapshot(undefined);
  }

  async function verifyDiagnostics(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!diagnosticsToken || diagnosticsLoading) {
      return;
    }
    setDiagnosticsLoading(true);
    setDiagnosticsError(undefined);
    setDiagnosticSnapshot(undefined);
    try {
      setDiagnosticSnapshot(await apiGetDiagnostics(diagnosticsToken));
    } catch (cause) {
      setDiagnosticsError(
        cause instanceof ApiClientError
          ? cause.message
          : 'Impossible de récupérer le diagnostic.',
      );
    } finally {
      setDiagnosticsLoading(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-panel" aria-labelledby="login-title">
        <h1 id="login-title">RateMySDD — Audit de spécifications</h1>
        <p>
          Connectez-vous avec GitHub pour utiliser votre compte Copilot lors de
          l’analyse.
        </p>

        {!device && (
          <button
            type="button"
            className="button-primary"
            onClick={() => void beginLogin()}
            disabled={status === 'starting'}
          >
            {status === 'starting'
              ? 'Connexion à GitHub…'
              : 'Se connecter avec GitHub Copilot'}
          </button>
        )}

        <div className="diagnostics-entry">
          <button
            type="button"
            className="diagnostics-toggle"
            aria-expanded={diagnosticsOpen}
            aria-controls="runtime-diagnostics-panel"
            onClick={() => {
              if (diagnosticsOpen) {
                closeDiagnostics();
              } else {
                setDiagnosticsOpen(true);
              }
            }}
          >
            <Bug aria-hidden="true" focusable="false" size={16} />
            Diagnostic administrateur
          </button>
          {diagnosticsOpen && (
            <section
              id="runtime-diagnostics-panel"
              className="diagnostics-panel"
              aria-labelledby="runtime-diagnostics-title"
            >
              <h2 id="runtime-diagnostics-title">Diagnostic du serveur</h2>
              <form className="diagnostics-form" onSubmit={verifyDiagnostics}>
                <label htmlFor="diagnostics-token">Code administrateur</label>
                <input
                  id="diagnostics-token"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={diagnosticsToken}
                  onChange={(inputEvent) => {
                    setDiagnosticsToken(inputEvent.currentTarget.value);
                    setDiagnosticsError(undefined);
                  }}
                />
                <div className="diagnostics-actions">
                  <button
                    type="submit"
                    className="button-primary"
                    disabled={!diagnosticsToken || diagnosticsLoading}
                  >
                    {diagnosticsLoading
                      ? 'Vérification…'
                      : diagnosticSnapshot
                        ? 'Actualiser'
                        : 'Vérifier'}
                  </button>
                  <button type="button" onClick={closeDiagnostics}>
                    Fermer
                  </button>
                </div>
              </form>
              {diagnosticsError && (
                <p className="diagnostics-error" role="alert">
                  {diagnosticsError}
                </p>
              )}
              {diagnosticSnapshot && (
                <div className="diagnostics-results" aria-live="polite">
                  <p className="diagnostics-runtime">
                    Runtime : <strong>{RUNTIME_STATUS_LABELS[diagnosticSnapshot.runtime]}</strong>
                  </p>
                  <h3>Variables d’environnement</h3>
                  <ul className="diagnostics-checks">
                    {diagnosticSnapshot.environment.map((check) => (
                      <li key={check.key} data-status={check.status}>
                        <code>{check.key}</code>
                        <span>{DIAGNOSTIC_STATUS_LABELS[check.status]}</span>
                        {check.value && <span className="diagnostics-value">{check.value}</span>}
                      </li>
                    ))}
                  </ul>
                  <h3>Erreurs récentes</h3>
                  {diagnosticSnapshot.events.length > 0 ? (
                    <ol className="diagnostics-events">
                      {diagnosticSnapshot.events.map((diagnosticEvent) => (
                        <li key={diagnosticEvent.requestId}>
                          <time dateTime={diagnosticEvent.timestamp}>
                            {new Date(diagnosticEvent.timestamp).toLocaleString('fr-FR')}
                          </time>
                          <code>{diagnosticEvent.requestId}</code>
                          <span>{diagnosticEvent.errorType}</span>
                          <p>{diagnosticEvent.message}</p>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p>Aucune erreur récente mémorisée sur cette instance.</p>
                  )}
                  <p className="diagnostics-note">
                    Historique limité à cette instance Vercel et à son dernier démarrage.
                  </p>
                </div>
              )}
            </section>
          )}
        </div>

        {device && status === 'pending' && (
          <div className="device-instructions">
            <p>Ouvrez GitHub et saisissez ce code :</p>
            <p className="device-code" aria-label="Code de connexion">
              {device.userCode}
            </p>
            <button type="button" onClick={() => void copyUserCode()}>
              Copier le code
            </button>
            <p
              className="copy-status-announcement"
              role="status"
              aria-live="polite"
            >
              {copyStatus}
            </p>
            {copyStatus && (
              <div
                className={`copy-toast${
                  copyStatus === 'Code copié.' ? '' : ' copy-toast--error'
                }${copyStatusFading ? ' copy-toast--fading' : ''}`}
                aria-hidden="true"
              >
                {copyStatus}
              </div>
            )}
            <a
              href={device.verificationUri}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ouvrir github.com/login/device
            </a>
            <p aria-live="polite">En attente de votre autorisation…</p>
          </div>
        )}

        {(status === 'denied' || status === 'expired' || (error && device)) && (
          <div className="login-error" role="alert">
            {error ??
              (status === 'denied' ? 'Connexion refusée.' : 'Code expiré.')}
          </div>
        )}

        {(status === 'denied' || status === 'expired' || error) && (
          <button
            type="button"
            className="button-primary"
            onClick={() => void beginLogin()}
            disabled={status === 'starting'}
          >
            Recommencer
          </button>
        )}
      </section>
    </main>
  );
}
