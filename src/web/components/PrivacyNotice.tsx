import { useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';

interface PrivacyNoticeProps {
  hasReference?: boolean;
}

export function PrivacyNotice({ hasReference = false }: PrivacyNoticeProps) {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) {
    return null;
  }

  return (
    <aside className="privacy-notice">
      <span className="privacy-icon" aria-hidden="true">
        <ShieldCheck size={18} />
      </span>
      <p>
        <strong>Confidentialité garantie :</strong> Le contenu
        {hasReference ? ' et son document de référence' : ''} sera transmis à
        l’IA via votre compte GitHub Copilot pour être analysé. Aucun document
        n’est conservé par RateMySDD.
      </p>
      <button
        type="button"
        className="privacy-dismiss"
        aria-label="Masquer l’avis de confidentialité"
        title="Masquer l’avis de confidentialité"
        onClick={() => setIsVisible(false)}
      >
        <X aria-hidden="true" focusable="false" size={14} />
      </button>
    </aside>
  );
}
