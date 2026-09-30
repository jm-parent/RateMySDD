import {
  Bug,
  Check,
  Copy,
  ExternalLink,
  Lock,
  ShieldCheck,
} from 'lucide-react';
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
import { AuthPreview } from './AuthPreview.js';

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

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

interface LoginScreenProps {
  onAuthenticated: (user: User) => void;
}

export function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [device, setDevice] = useState<DeviceStart>();
  const [pollInterval, setPollInterval] = useState(5);
  const [pollVersion, setPollVersion] = useState(0);
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
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
      setNow(Date.now());
      setExpiresAt(Date.now() + authorization.expiresIn * 1_000);
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
    if (status !== 'pending') {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [status]);

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
      <section className="auth-hero" aria-labelledby="login-title">
        <p className="auth-badge">
          <span aria-hidden="true" />
          Méthodologie Spec-Driven Development (SDD)
        </p>
        <h1 id="login-title">
          Auditez vos spécifications avant d’écrire la moindre ligne de code.
        </h1>
        <p className="auth-lead">
          RateMySDD valide automatiquement la clarté technique, la testabilité et
          l’exhaustivité de vos documents de cadrage grâce à l’intelligence
          contextuelle de Copilot.
        </p>

        <AuthPreview />

        <ul className="auth-benefits">
          <li>
            <Check aria-hidden="true" size={12} />
            <span>
              <strong>Détection proactive</strong> des angles morts et failles
              d’architecture
            </span>
          </li>
          <li>
            <Check aria-hidden="true" size={12} />
            <span>
              <strong>Alignement strict</strong> entre exigences métier, specs et
              plan d’exécution
            </span>
          </li>
          <li>
            <Check aria-hidden="true" size={12} />
            <span>
              <strong>Intégration transparente</strong> et instantanée avec
              GitHub Copilot
            </span>
          </li>
        </ul>
      </section>

      <section className="auth-panel" aria-labelledby="login-panel-title">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">
            R
          </span>
          <span className="brand-name">RateMySDD</span>
        </div>

        <div className="auth-body">
          <h2 id="login-panel-title">Connexion à votre espace</h2>
          <p className="auth-body-lead">
            {device && status === 'pending'
              ? 'Authentification via votre compte GitHub pour activer l’analyse contextuelle sécurisée Copilot.'
              : 'Connectez-vous avec votre compte GitHub pour autoriser l’analyse sécurisée via Copilot.'}
          </p>

          {!device && (
            <button
              type="button"
              className="button-primary auth-github-button"
              onClick={() => void beginLogin()}
              disabled={status === 'starting'}
            >
              <svg
                aria-hidden="true"
                focusable="false"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
              </svg>
              {status === 'starting'
                ? 'Connexion à GitHub…'
                : 'Se connecter avec GitHub Copilot'}
            </button>
          )}

          {device && status === 'pending' && (
            <div className="device-instructions">
              <div className="device-card-header">
                <span>Code d’autorisation temporaire</span>
                <span className="device-expiry">
                  Expire dans{' '}
                  {formatCountdown(Math.max(0, Math.ceil((expiresAt - now) / 1_000)))}
                </span>
              </div>
              <div className="device-code-row">
                <p className="device-code" aria-label="Code de connexion">
                  {device.userCode}
                </p>
                <button
                  type="button"
                  className="device-copy-button"
                  aria-label="Copier le code"
                  onClick={() => void copyUserCode()}
                >
                  <Copy aria-hidden="true" size={14} />
                  Copier
                </button>
              </div>
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
                className="device-open-link"
                href={device.verificationUri}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ouvrir github.com/login/device
                <ExternalLink aria-hidden="true" size={14} />
              </a>
              <p className="device-waiting" aria-live="polite">
                <span aria-hidden="true" />
                En attente de votre autorisation dans le navigateur…
              </p>
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

          {device && status === 'pending' ? (
            <div className="auth-privacy auth-privacy--list">
              <strong>
                <ShieldCheck aria-hidden="true" size={14} />
                Sécurité &amp; Transparence des données
              </strong>
              <ul>
                <li>
                  <b>Licence Copilot existante :</b> utilise votre quota GitHub
                  habituel sans surcoût.
                </li>
                <li>
                  <b>Zéro persistance :</b> vos fichiers et spécifications ne
                  sont jamais stockés ni réutilisés.
                </li>
                <li>
                  <b>Chiffrement de bout en bout :</b> flux sécurisé par jetons
                  OAuth restreints et connexion chiffrée.
                </li>
              </ul>
            </div>
          ) : (
            <>
              <p className="auth-privacy">
                <strong>Abonnement &amp; Confidentialité :</strong>
                Utilise votre abonnement Copilot existant sans surcoût. Vos
                fichiers ne quittent jamais votre périmètre.
              </p>
              <p className="auth-secure">
                <Lock aria-hidden="true" size={12} />
                Authentification OAuth chiffrée bout-en-bout
              </p>
            </>
          )}
        </div>

        <footer className="diagnostics-entry">
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
        </footer>
      </section>
    </main>
  );
}
