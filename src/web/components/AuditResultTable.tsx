import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { AuditResult } from '../../shared/schemas.js';
import { ScoreLegend } from './ScoreLegend.js';

interface AuditResultTableProps {
  result: AuditResult;
}

export function AuditResultTable({ result }: AuditResultTableProps) {
  const [selectedEvaluation, setSelectedEvaluation] = useState<
    AuditResult['evaluations'][number] | null
  >(null);
  const descriptionDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = descriptionDialogRef.current;
    if (selectedEvaluation && dialog && !dialog.open) {
      dialog.showModal();
    }
  }, [selectedEvaluation]);

  return (
    <section className="audit-results" aria-labelledby="audit-result-title">
      <h2 id="audit-result-title">
        Score global : {result.globalScore}/100 — {result.globalBand}
      </h2>
      <p className="global-score-caption">Moyenne des six critères</p>
      <div className="audit-table-wrap">
        <table className="audit-table">
          <caption>Résultat de l’audit : {result.documentName}</caption>
          <thead>
            <tr>
              <th scope="col">Critère</th>
              <th scope="col">Note</th>
              <th scope="col">Résumé</th>
              <th scope="col">Points d’amélioration</th>
            </tr>
          </thead>
          <tbody>
            {result.evaluations.map((evaluation) => (
              <tr key={evaluation.criterionId}>
                <th scope="row">
                  <span
                    className={`pillar-badge pillar-${evaluation.criterionId}`}
                    aria-label={`Critère ${evaluation.criterionId}`}
                  >
                    {evaluation.criterionId}
                  </span>
                  <span className="pillar-title">{evaluation.title}</span>
                </th>
                <td>
                  <strong>{evaluation.score}/100</strong>
                  <span className="score-band">{evaluation.band}</span>
                </td>
                <td className="description-cell">
                  <ul className="description-summary">
                    {evaluation.summary.map((point, index) => (
                      <li key={`${evaluation.criterionId}-summary-${index}`}>{point}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="description-details-button"
                    onClick={() => setSelectedEvaluation(evaluation)}
                  >
                    Voir le détail
                  </button>
                </td>
                <td>
                  <ul className="improvement-list">
                    {evaluation.improvements.map((improvement, index) => (
                      <li key={`${evaluation.criterionId}-${index}`}>{improvement}</li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ScoreLegend />
      <dialog
        ref={descriptionDialogRef}
        className="description-dialog"
        aria-labelledby="description-dialog-title"
        onClose={() => setSelectedEvaluation(null)}
      >
        <div className="description-dialog-header">
          <div>
            {selectedEvaluation && (
              <p className="description-dialog-pillar">
                {selectedEvaluation.criterionId} · {selectedEvaluation.title}
              </p>
            )}
            <h2 id="description-dialog-title">
              Description complète
              {selectedEvaluation ? ` — ${selectedEvaluation.title}` : ''}
            </h2>
          </div>
          <button
            type="button"
            className="description-dialog-close"
            aria-label="Fermer le détail"
            title="Fermer le détail"
            onClick={() => descriptionDialogRef.current?.close()}
          >
            <X aria-hidden="true" focusable="false" size={16} />
          </button>
        </div>
        <div className="description-dialog-body">
          <p>{selectedEvaluation?.description}</p>
        </div>
      </dialog>
    </section>
  );
}
