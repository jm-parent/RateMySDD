import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AuditResult } from '../../src/shared/schemas.js';
import { AUDIT_CRITERIA } from '../../src/shared/audit-criteria.js';
import { bandFor } from '../../src/shared/scoring.js';
import { AuditPage, INITIAL_AUDIT_PAGE_STATE } from '../../src/web/components/AuditPage.js';
import { AuditResultTable } from '../../src/web/components/AuditResultTable.js';
import { DocumentInput } from '../../src/web/components/DocumentInput.js';
import { PrivacyNotice } from '../../src/web/components/PrivacyNotice.js';
import { AuditProgressHeader } from '../../src/web/components/AuditProgressHeader.js';
import { INITIAL_AUDIT_WORKFLOW_STATE } from '../../src/web/audit-workflow.js';

const result: AuditResult = {
  auditedAt: '2026-09-24T14:05:00.000Z',
  documentName: 'spec-test',
  documentType: 'spec',
  source: 'paste',
  fileName: null,
  globalScore: 80,
  globalBand: bandFor(80),
  model: 'test-model',
  evaluations: AUDIT_CRITERIA.spec.map((criterion, index) => ({
    criterionId: criterion.id,
    title: criterion.title,
    score: 80 + index,
    band: bandFor(80 + index),
    summary: [`Résumé du critère ${index + 1}`, `Constat complémentaire ${index + 1}`],
    description: `Description ${index + 1}`,
    improvements: [`Amélioration ${index + 1}`, 'Ajouter un scénario.'],
  })),
};

describe('audit interface components', () => {
  it('shows the current step, previous score, and locked future step', () => {
    const state = {
      ...INITIAL_AUDIT_WORKFLOW_STATE,
      activeStep: 'plan' as const,
      steps: {
        ...INITIAL_AUDIT_WORKFLOW_STATE.steps,
        spec: { ...INITIAL_AUDIT_WORKFLOW_STATE.steps.spec, result: { ...result, globalScore: 85 } },
      },
    };
    const html = renderToStaticMarkup(
      createElement(AuditProgressHeader, { state, onStepSelect: () => undefined }),
    );

    expect(html).toContain('aria-label="Progression des audits"');
    expect(html).toContain('85%');
    expect(html).toContain('Validé');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('En cours');
    expect(html).toContain('Verrouillé');
  });

  it('states how audit content is transmitted and retained', () => {
    const html = renderToStaticMarkup(createElement(PrivacyNotice));

    expect(html).toContain('Confidentialité garantie');
    expect(html).toContain('Le contenu sera transmis à l’IA via votre compte GitHub Copilot');
    expect(html).toContain('Aucun document n’est conservé par RateMySDD.');
    expect(html).toContain('aria-label="Masquer l’avis de confidentialité"');

    const comparativeHtml = renderToStaticMarkup(
      createElement(PrivacyNotice, { hasReference: true }),
    );
    expect(comparativeHtml).toContain('et son document de référence sera transmis');
  });

  it('renders a labelled Markdown text area with a live byte-size indicator', () => {
    const html = renderToStaticMarkup(
      createElement(DocumentInput, {
        value: 'Texte',
        onChange: () => undefined,
        onContentReplaced: () => undefined,
        fileName: null,
        onFileLoaded: () => undefined,
      }),
    );

    expect(html).toContain('Spécification Markdown à auditer');
    expect(html).toContain('Collez ou rédigez votre spécification Markdown…');
    expect(html).toContain('rows="20"');
    expect(html).toContain('Ko / 200 Ko');
  });

  it('labels a plan document and keeps its reference visible in the workflow', () => {
    const html = renderToStaticMarkup(
      createElement(DocumentInput, {
        value: '# Plan',
        documentType: 'plan',
        onChange: () => undefined,
        onContentReplaced: () => undefined,
        fileName: null,
        onFileLoaded: () => undefined,
      }),
    );

    expect(html).toContain('Plan Markdown à auditer');
    expect(html).toContain('Collez ou rédigez votre plan Markdown…');
  });

  it('keeps file upload separate from the editor and offers sample and clear actions', () => {
    const html = renderToStaticMarkup(
      createElement(DocumentInput, {
        value: '',
        onChange: () => undefined,
        fileName: null,
        onFileLoaded: () => undefined,
        onContentReplaced: () => undefined,
      }),
    );
    const dropZoneStart = html.indexOf('class="file-drop-zone');
    const editorStart = html.indexOf('id="markdown-content"');
    const dropZoneMarkup = html.slice(
      dropZoneStart,
      html.indexOf('class="document-input-heading"'),
    );

    expect(dropZoneStart).toBeGreaterThanOrEqual(0);
    expect(editorStart).toBeGreaterThan(dropZoneStart);
    expect(dropZoneMarkup.match(/<\/div>/g)).toHaveLength(1);
    expect(html).toContain('Charger un exemple');
    expect(html).toContain('Effacer');
  });

  it('renders all six criteria and escaped text in the audit result table', () => {
    const html = renderToStaticMarkup(createElement(AuditResultTable, { result }));

    const table = html.match(/<table class="audit-table">[\s\S]*?<\/table>/)?.[0] ?? '';
    expect((table.match(/<tr/g) ?? []).length).toBe(7);
    expect(html).toContain('Score global : 80/100 — bon');
    expect(html).toContain('<th scope="col">Résumé</th>');
    expect(html).not.toContain('<th scope="col">Description détaillée</th>');
    expect(html).toContain('Points d’amélioration');
    expect(html).toContain('Contexte &amp; Objectif');
    expect(html).toContain('<th scope="col">Critère</th>');
    expect(html).toContain('Résumé du critère 1');
    expect(html).toContain('Voir le détail');
    expect(html).toContain('Amélioration 6');
    expect(html).not.toContain('dangerouslySetInnerHTML');
  });

  it('renders the audit tabs with a disabled result tab before any audit', () => {
    const html = renderToStaticMarkup(
      createElement(AuditPage, {
        state: INITIAL_AUDIT_PAGE_STATE,
        onStateChange: () => undefined,
      }),
    );
    const inputTab = html.match(/<button[^>]*id="audit-input-tab"[^>]*>/)?.[0] ?? '';
    const resultTab = html.match(/<button[^>]*id="audit-result-tab"[^>]*>/)?.[0] ?? '';

    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Navigation de l’audit"');
    expect(html).toContain('aria-controls="audit-input-panel"');
    expect(html).toContain('aria-controls="audit-result-panel"');
    expect(html).toContain('id="audit-input-panel"');
    expect(html).toContain('id="audit-result-panel"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('class="tab-step" aria-hidden="true">1</span>');
    expect(html).toContain('class="tab-step" aria-hidden="true">2</span>');
    expect(html).toContain('EN ATTENTE');
    expect(inputTab).toContain('aria-selected="true"');
    expect(resultTab).toContain('disabled=""');
  });

  it('renders the result as a dedicated screen without the document input', () => {
    const state = {
      ...INITIAL_AUDIT_PAGE_STATE,
      screen: 'result' as const,
      steps: {
        ...INITIAL_AUDIT_PAGE_STATE.steps,
        spec: {
          ...INITIAL_AUDIT_PAGE_STATE.steps.spec,
          content: '# Draft retained while viewing the result',
          result,
        },
      },
    };
    const html = renderToStaticMarkup(
      createElement(AuditPage, { state, onStateChange: () => undefined }),
    );
    const table = html.match(/<table class="audit-table">[\s\S]*?<\/table>/)?.[0] ?? '';
    const rows = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].slice(1);

    expect(html).not.toContain('Spécification Markdown à auditer');
    expect(html).toContain('<h2 id="audit-result-screen-title"');
    expect(html).toContain('Résultat de l’audit');
    expect(html).toContain('Score global : 80/100 — bon');
    expect(html).toContain('Date de l’analyse');
    expect(html).toContain('Modèle utilisé');
    expect(html).toContain('test-model');
    expect(html).toMatch(/<time[^>]*datetime="2026-09-24T14:05:00.000Z"[^>]*>/i);
    expect(html).not.toContain('Barème de notation');
    expect(html).toContain('Copier le résultat');
    expect(html).toContain('Télécharger le rapport');
    expect(rows).toHaveLength(6);
    for (const [index, evaluation] of result.evaluations.entries()) {
      const row = rows[index]?.[1] ?? '';
      expect(row).toContain(evaluation.criterionId);
      expect(row).toContain(`${evaluation.score}/100`);
      expect(row).toContain(evaluation.summary[0] ?? '');
      expect(row).not.toContain(evaluation.description);
      expect(row).toContain(evaluation.improvements[0] ?? '');
      expect(row).toContain(AUDIT_CRITERIA.spec[index]?.id ?? '');
      expect(row).toContain(
        AUDIT_CRITERIA.spec[index]?.title
          .replace(/&/g, '&amp;')
          .replace(/'/g, '&#x27;') ?? '',
      );
      expect(evaluation.score).toBeGreaterThanOrEqual(0);
      expect(evaluation.score).toBeLessThanOrEqual(100);
      expect(evaluation.description.trim()).not.toBe('');
      expect(evaluation.improvements.length).toBeGreaterThan(0);
    }
  });
});
