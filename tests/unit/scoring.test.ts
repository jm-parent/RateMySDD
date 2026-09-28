import { describe, expect, it } from 'vitest';
import { bandFor, computeGlobalScore } from '../../src/shared/scoring.js';

describe('bandFor', () => {
  it.each([
    [0, 'absent'],
    [1, 'très insuffisant'],
    [24, 'très insuffisant'],
    [25, 'insuffisant'],
    [49, 'insuffisant'],
    [50, 'acceptable'],
    [69, 'acceptable'],
    [70, 'bon'],
    [89, 'bon'],
    [90, 'excellent'],
    [100, 'excellent'],
  ] as const)('maps score %i to %s', (score, expected) => {
    expect(bandFor(score)).toBe(expected);
  });

  it.each([-1, 101, 50.5])('rejects invalid score %s', (score) => {
    expect(() => bandFor(score)).toThrow(RangeError);
  });
});

describe('computeGlobalScore', () => {
  it('rounds the mean of exactly six pillar scores to the nearest integer', () => {
    expect(computeGlobalScore([70, 70, 70, 70, 70, 71])).toBe(70);
    expect(computeGlobalScore([0, 0, 0, 0, 0, 3])).toBe(1);
  });

  it.each([{ scores: [] }, { scores: [0, 0, 0, 0, 0] }])(
    'rejects a score list that does not contain six pillars',
    ({ scores }) => {
      expect(() => computeGlobalScore(scores)).toThrow(RangeError);
    },
  );
});
