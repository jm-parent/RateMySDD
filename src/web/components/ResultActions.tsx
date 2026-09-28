import { useEffect, useState } from 'react';
import type { AuditResult } from '../../shared/schemas.js';
import { renderReportMarkdown, reportFileName } from '../../shared/report.js';

interface ResultActionsProps {
  result: AuditResult;
}

export function ResultActions({ result }: ResultActionsProps) {
  const [status, setStatus] = useState('');

  useEffect(() => {
    setStatus('');
  }, [result]);

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(renderReportMarkdown(result));
      setStatus('Résultat copié dans le presse-papiers.');
    } catch {
      setStatus('La copie a échoué. Vérifiez les permissions du navigateur.');
    }
  }

  function downloadReport() {
    const report = renderReportMarkdown(result);
    const url = URL.createObjectURL(
      new Blob([report], { type: 'text/markdown;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = reportFileName(result);
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <div className="result-actions">
      <button type="button" onClick={() => void copyReport()}>
        Copier le résultat
      </button>
      <button type="button" onClick={downloadReport}>
        Télécharger le rapport
      </button>
      <p role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
