import { useEffect, useRef } from 'react';
import type { AuditResult } from '../../shared/schemas.js';
import { AuditResultTable } from './AuditResultTable.js';
import { ResultActions } from './ResultActions.js';

interface AuditResultScreenProps {
  result: AuditResult;
  focusHeading: boolean;
}

export function AuditResultScreen({
  result,
  focusHeading,
}: AuditResultScreenProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusHeading) {
      titleRef.current?.focus();
    }
  }, [focusHeading]);

  return (
    <section
      className="audit-result-screen"
      aria-labelledby="audit-result-screen-title"
    >
      <h2 id="audit-result-screen-title" ref={titleRef} tabIndex={-1}>
        Résultat de l’audit
      </h2>
      <AuditResultTable result={result} />
      <ResultActions result={result} />
    </section>
  );
}
