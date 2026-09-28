import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AiOutputInvalidError,
  parseAiOutput,
} from '../../src/server/audit/parse-output.js';

function fixture(name: string): string {
  return readFileSync(
    join(process.cwd(), 'tests', 'fixtures', 'ai-outputs', name),
    'utf8',
  );
}

describe('parseAiOutput', () => {
  it('normalizes valid spec JSON to six canonical criterion evaluations', () => {
    const result = parseAiOutput(fixture('valid.json'));

    expect(result.evaluations).toHaveLength(6);
    expect(result.evaluations.map(({ criterionId }) => criterionId)).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
    ]);
  });

  it('extracts valid JSON from a fenced response with surrounding prose', () => {
    const result = parseAiOutput(fixture('valid-in-code-fence.txt'));

    expect(result.evaluations).toHaveLength(6);
  });

  it('parses six ordered generic evaluations for a plan audit', () => {
    const output = JSON.stringify({
      evaluations: Array.from({ length: 6 }, (_, index) => ({
        criterionId: `0${index + 1}`,
        score: 80,
        summary: ['Le critère est couvert.'],
        description: 'La couverture est décrite.',
        improvements: ['Préciser un cas limite.'],
      })),
    });

    const result = parseAiOutput(output, 'plan');

    expect(result.evaluations.map(({ criterionId }) => criterionId)).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
    ]);
  });

  it.each(['invalid-5-pillars.json', 'invalid-order.json', 'invalid-score.json'])(
    'rejects invalid output fixture %s',
    (name) => {
      expect(() => parseAiOutput(fixture(name))).toThrow(AiOutputInvalidError);
    },
  );

  it('rejects non-JSON output without retaining raw response text in the error', () => {
    const raw = 'CONFIDENTIEL-MARQUEUR-7f3a non JSON';

    expect(() => parseAiOutput(raw)).toThrow(AiOutputInvalidError);
    try {
      parseAiOutput(raw);
    } catch (error) {
      expect((error as Error).message).not.toContain('CONFIDENTIEL-MARQUEUR-7f3a');
    }
  });
});
