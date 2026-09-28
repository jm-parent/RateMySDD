import { useState } from 'react';
import { ApiClientError, apiPost } from '../api.js';

interface NoCopilotAccessProps {
  onLoggedOut: () => void;
}

export function NoCopilotAccess({ onLoggedOut }: NoCopilotAccessProps) {
  const [error, setError] = useState<string>();

  async function logout() {
    setError(undefined);
    try {
      await apiPost<void>('/api/auth/logout');
      onLoggedOut();
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.status === 401) {
        onLoggedOut();
        return;
      }
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : 'La déconnexion a échoué. Veuillez réessayer.',
      );
    }
  }

  return (
    <section className="access-notice" aria-labelledby="copilot-access-title">
      <h2 id="copilot-access-title">Accès GitHub Copilot requis</h2>
      <p>L'audit nécessite un abonnement GitHub Copilot actif.</p>
      <button type="button" onClick={() => void logout()}>
        Se déconnecter
      </button>
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
