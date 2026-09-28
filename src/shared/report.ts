import type { AuditResult } from './schemas.js';
import { SCORE_BANDS } from './scoring.js';

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

function dateParts(date: Date) {
  return {
    year: String(date.getFullYear()).padStart(4, '0'),
    month: twoDigits(date.getMonth() + 1),
    day: twoDigits(date.getDate()),
    hour: twoDigits(date.getHours()),
    minute: twoDigits(date.getMinutes()),
  };
}

function createSlug(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/g, '') || 'document'
  );
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function codeSpan(value: string): string {
  const singleLine = value.replace(/[\r\n]+/g, ' ');
  const longestBacktickRun = Math.max(
    0,
    ...Array.from(singleLine.matchAll(/`+/g), ([run]) => run.length),
  );
  const delimiter = '`'.repeat(longestBacktickRun + 1);
  return `${delimiter}${singleLine}${delimiter}`;
}

export function reportFileName(result: AuditResult, now?: Date): string {
  const date = dateParts(now ?? new Date(result.auditedAt));
  return `audit-${createSlug(result.documentName)}-${date.year}${date.month}${date.day}-${date.hour}${date.minute}.md`;
}

export function renderReportMarkdown(result: AuditResult): string {
  const auditedAt = dateParts(new Date(result.auditedAt));
  const documentName = result.documentName.replace(/[\r\n]+/g, ' ');
  const documentType = {
    spec: 'Spécification',
    plan: 'Plan',
    tasks: 'Tâches',
  }[result.documentType];
  const source =
    result.source === 'file' && result.fileName
      ? `Fichier ${codeSpan(result.fileName)}`
      : 'Texte collé';
  const date = `${auditedAt.day}/${auditedAt.month}/${auditedAt.year} ${auditedAt.hour}:${auditedAt.minute}`;
  const rows = result.evaluations.map((evaluation) => {
    const improvements = evaluation.improvements
      .map((improvement) => `• ${escapeCell(improvement)}`)
      .join('<br>');
    return `| ${evaluation.criterionId} | ${evaluation.title} | ${evaluation.score}/100 (${evaluation.band}) | ${escapeCell(evaluation.description)} | ${improvements} |`;
  });
  const scoreBands = SCORE_BANDS.map(
    ({ min, max, label }) => `| ${min}${min === max ? '' : `–${max}`} | ${label} |`,
  );

  return [
    `# Rapport d'audit — ${documentName}`,
    '',
    `- **Date de l'audit** : ${date}`,
    `- **Type de document** : ${documentType}`,
    `- **Source** : ${source}`,
    `- **Score global** : **${result.globalScore}/100** (${result.globalBand})`,
    '',
    "| # | Critère | Note | Description | Points d'amélioration |",
    '|---|--------|------|-------------|-----------------------|',
    ...rows,
    '',
    '## Barème',
    '',
    '| Note | Niveau |',
    '|------|--------|',
    ...scoreBands,
    '',
    "_Score global = moyenne simple des 6 critères, arrondie à l'entier le plus proche._",
    '_Rapport généré par RateMySDD via GitHub Copilot._',
  ].join('\n');
}
