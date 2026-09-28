import { useEffect, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import type { User } from '../../shared/schemas.js';
import { ApiClientError, apiPost } from '../api.js';

interface UserBarProps {
  user: User;
  onLoggedOut: () => void;
  showLogout?: boolean;
  showBrandHeading?: boolean;
}

export function UserBar({
  user,
  onLoggedOut,
  showLogout = true,
  showBrandHeading = false,
}: UserBarProps) {
  const [error, setError] = useState<string>();
  const pageTitleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (showBrandHeading) {
      pageTitleRef.current?.focus();
    }
  }, [showBrandHeading]);

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
    <header className="user-bar">
      <div className="user-brand">
        <span className="brand-mark" aria-hidden="true">
          R
        </span>
        {showBrandHeading && (
          <h1
            id="audit-page-title"
            ref={pageTitleRef}
            className="user-bar-title"
            tabIndex={-1}
          >
            RateMySDD
          </h1>
        )}
        {!showBrandHeading && <span className="brand-name">RateMySDD</span>}
      </div>
      <div className="user-account">
        <div className="user-identity">
          {user.avatarUrl ? (
            <img className="user-avatar" src={user.avatarUrl} alt={user.login} />
          ) : (
            <span className="user-avatar avatar-placeholder" aria-hidden="true">
              {user.login.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="user-identity-copy">
            <span>{user.name || user.login}</span>
            <span className="user-provider">
              <span className="user-provider-status" aria-hidden="true" />
              GitHub Copilot
            </span>
          </div>
        </div>
        {showLogout && (
          <button
            type="button"
            className="user-bar-logout"
            aria-label="Se déconnecter"
            title="Se déconnecter"
            onClick={() => void logout()}
          >
            <LogOut aria-hidden="true" focusable="false" size={16} />
            <span>Se déconnecter</span>
          </button>
        )}
      </div>
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
    </header>
  );
}
