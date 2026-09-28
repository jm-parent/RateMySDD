import { describe, expect, it } from 'vitest';
import { AUDIT_CRITERIA } from '../../src/shared/audit-criteria.js';
import type { AuditResult } from '../../src/shared/schemas.js';
import { bandFor, computeGlobalScore } from '../../src/shared/scoring.js';
import { renderReportMarkdown, reportFileName } from '../../src/shared/report.js';

function makeResult(
  overrides: Partial<AuditResult> = {},
): AuditResult {
  const scores = [70, 75, 80, 85, 90, 95];
  const evaluations = AUDIT_CRITERIA.spec.map((criterion, index) => ({
    criterionId: criterion.id,
    title: criterion.title,
    score: scores[index]!,
    band: bandFor(scores[index]!),
    summary: [`Résumé du critère ${index + 1}`, `Point complémentaire ${index + 1}`],
    description: `Description ${index + 1}`,
    improvements: [`Amélioration ${index + 1}`, 'Ajouter un scénario.'],
  }));

  return {
    auditedAt: new Date(2026, 8, 24, 14, 5).toISOString(),
    documentName: 'spec-paiement',
    documentType: 'spec',
    source: 'paste',
    fileName: null,
    globalScore: computeGlobalScore(scores),
    globalBand: bandFor(computeGlobalScore(scores)),
    evaluations,
    model: 'test-model',
    ...overrides,
  };
}

describe('audit report', () => {
  it('creates a filename from the slug and local audit date', () => {
    expect(reportFileName(makeResult())).toBe(
      'audit-spec-paiement-20260924-1405.md',
    );
    expect(
      reportFileName(makeResult({ documentName: 'Texte collé' })),
    ).toBe('audit-texte-colle-20260924-1405.md');
  });

  it('normalizes accents, punctuation, repeated separators, length, and empty slugs', () => {
    const auditedAt = new Date(2026, 8, 24, 14, 5);
    expect(
      reportFileName(
        makeResult({ documentName: '  Équipes / Paiement : test !!  ' }),
        auditedAt,
      ),
    ).toBe('audit-equipes-paiement-test-20260924-1405.md');
    expect(
      reportFileName(makeResult({ documentName: 'x'.repeat(61) }), auditedAt),
    ).toBe(`audit-${'x'.repeat(60)}-20260924-1405.md`);
    expect(
      reportFileName(makeResult({ documentName: '!!!' }), auditedAt),
    ).toBe('audit-document-20260924-1405.md');
  });

  it('renders a complete six-criterion Markdown report with escaped table cells', () => {
    const base = makeResult();
    const evaluations = base.evaluations.map((evaluation, index) =>
      index === 0
        ? {
            ...evaluation,
            description: 'Description | première ligne\nseconde ligne',
            improvements: ['Vérifier | le résultat\nattendu', 'Ajouter un test.'],
          }
        : evaluation,
    );
    const result = makeResult({
      source: 'file',
      fileName: 'spec.md',
      documentName: 'spec',
      evaluations,
    });
    const report = renderReportMarkdown(result);
    const criterionRows = report.match(/^\| 0[1-6] \|/gm) ?? [];
    const expectedDate = [
      String(new Date(result.auditedAt).getDate()).padStart(2, '0'),
      String(new Date(result.auditedAt).getMonth() + 1).padStart(2, '0'),
      new Date(result.auditedAt).getFullYear(),
      String(new Date(result.auditedAt).getHours()).padStart(2, '0'),
      String(new Date(result.auditedAt).getMinutes()).padStart(2, '0'),
    ];

    expect(report).toContain("# Rapport d'audit — spec");
    expect(report).toContain(
      `- **Date de l'audit** : ${expectedDate[0]}/${expectedDate[1]}/${expectedDate[2]} ${expectedDate[3]}:${expectedDate[4]}`,
    );
    expect(report).toContain('- **Source** : Fichier `spec.md`');
    expect(report).toContain('**Score global** : **83/100** (bon)');
    expect(report).toContain(
      "| # | Critère | Note | Description | Points d'amélioration |",
    );
    expect(criterionRows).toHaveLength(6);
    expect(report).toContain(
      '| 01 | Contexte & Objectif | 70/100 (bon) | Description \\| première ligne<br>seconde ligne | • Vérifier \\| le résultat<br>attendu<br>• Ajouter un test. |',
    );
    expect(report).toContain('## Barème');
    expect(report).toContain('| 90–100 | excellent |');
    expect(report).toContain(
      "_Score global = moyenne simple des 6 critères, arrondie à l'entier le plus proche._",
    );
    expect(report).toContain(
      '_Rapport généré par RateMySDD via GitHub Copilot._',
    );
    expect(report).not.toContain('CONFIDENTIEL-MARQUEUR');
  });

  it('uses the pasted-text source label', () => {
    expect(renderReportMarkdown(makeResult())).toContain(
      '- **Source** : Texte collé',
    );
  });
});
