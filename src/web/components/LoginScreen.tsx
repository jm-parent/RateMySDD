import { useEffect, useRef, useState } from 'react';
import {
  DevicePollSchema,
  DeviceStartSchema,
} from '../../shared/schemas.js';
import type { DevicePoll, DeviceStart, User } from '../../shared/schemas.js';
import { ApiClientError, apiPost } from '../api.js';

type LoginStatus = 'idle' | 'starting' | 'pending' | 'denied' | 'expired';

const COPY_TOAST_DURATION_MS = 3_000;
const COPY_TOAST_FADE_DURATION_MS = 350;

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
