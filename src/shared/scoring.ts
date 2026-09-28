export const SCORE_BANDS = [
  { min: 0, max: 0, label: 'absent' },
  { min: 1, max: 24, label: 'très insuffisant' },
  { min: 25, max: 49, label: 'insuffisant' },
  { min: 50, max: 69, label: 'acceptable' },
  { min: 70, max: 89, label: 'bon' },
  { min: 90, max: 100, label: 'excellent' },
] as const;

export type BandLabel = (typeof SCORE_BANDS)[number]['label'];

export function bandFor(score: number): BandLabel {
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new RangeError('Le score doit être un entier compris entre 0 et 100.');
  }

  const band = SCORE_BANDS.find(({ min, max }) => score >= min && score <= max);
  if (!band) {
    throw new RangeError('Aucune tranche ne correspond au score fourni.');
  }

  return band.label;
}

export function computeGlobalScore(scores: number[]): number {
  if (scores.length !== 6) {
    throw new RangeError('Le score global exige exactement six notes de pilier.');
  }
  if (scores.some((score) => !Number.isInteger(score) || score < 0 || score > 100)) {
    throw new RangeError('Chaque note doit être un entier compris entre 0 et 100.');
  }

  return Math.round(scores.reduce((total, score) => total + score, 0) / scores.length);
}
