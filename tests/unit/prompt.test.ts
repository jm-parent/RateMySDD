import { afterEach, describe, expect, it, vi } from 'vitest';
import { PILLARS } from '../../src/shared/pillars.js';
import { SCORE_BANDS } from '../../src/shared/scoring.js';
import { buildPrompt } from '../../src/server/audit/prompt.js';

const { randomUUIDMock } = vi.hoisted(() => ({
  randomUUIDMock: vi.fn(() => globalThis.crypto.randomUUID()),
}));

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, randomUUID: randomUUIDMock };
});

afterEach(() => {
  vi.restoreAllMocks();
  randomUUIDMock.mockReset().mockImplementation(() => globalThis.crypto.randomUUID());
});

describe('buildPrompt', () => {
  it('includes the canonical six-pillar grid, barème and strict French JSON rules', () => {
    const { system } = buildPrompt('# Spécification');

    let previousIndex = -1;
    for (const pillar of PILLARS) {
      const currentIndex = system.indexOf(`${pillar.id}. ${pillar.title}`);
      expect(currentIndex).toBeGreaterThan(previousIndex);
      previousIndex = currentIndex;
      for (const question of pillar.guidingQuestions) {
        expect(system).toContain(question);
      }
    }
    for (const band of SCORE_BANDS) {
      expect(system).toContain(`${band.min}–${band.max}`);
      expect(system).toContain(band.label);
    }
    expect(system.toLowerCase()).toContain('pilier absent');
    expect(system).toContain('points de synthèse');
    expect(system).toContain('description complète');
    expect(system.toLowerCase()).toContain('uniquement');
    expect(system).toContain('JSON');
    expect(system).toContain('français');
    expect(system).not.toContain('globalScore');
  });

  it('wraps the document in a random boundary and uses a different boundary per call', () => {
    const content = '# Une spécification';
    const first = buildPrompt(content);
    const second = buildPrompt(content);

    expect(first.user).toContain(`<<<DOC-${first.boundary}>>>`);
    expect(first.user).toContain(`<<<END-DOC-${first.boundary}>>>`);
    expect(first.user).toContain(content);
    expect(first.boundary).not.toBe(second.boundary);
  });

  it('regenerates a boundary already present in the document', () => {
    const collision = '11111111-1111-4111-8111-111111111111';
    const replacement = '22222222-2222-4222-8222-222222222222';
    randomUUIDMock.mockReturnValueOnce(collision).mockReturnValueOnce(replacement);

    const prompt = buildPrompt(`Texte cité : <<<DOC-${collision}>>>`);

    expect(prompt.boundary).toBe(replacement);
    expect(prompt.user).toContain(`<<<DOC-${replacement}>>>`);
  });

  it('avoids reference delimiters that already appear in the primary document', () => {
    const collision = '11111111-1111-4111-8111-111111111111';
    const replacement = '22222222-2222-4222-8222-222222222222';
    randomUUIDMock.mockReturnValueOnce(collision).mockReturnValueOnce(replacement);

    const prompt = buildPrompt(`Cité : <<<REFERENCE-${collision}>>>`, {
      documentType: 'plan',
      referenceContent: '# Spec',
    });

    expect(prompt.boundary).toBe(replacement);
  });

  it('adds a schema reminder for a retry', () => {
    const { system } = buildPrompt('Texte', { reminder: true });

    expect(system).toContain("Ta réponse précédente n'était pas conforme.");
  });

  it('uses the plan criteria and separates the plan from its spec reference', () => {
    const { system, user, boundary } = buildPrompt('# Plan', {
      documentType: 'plan',
      referenceContent: '# Spec',
    });

    expect(system).toContain('Alignement et Couverture Fonctionnelle');
    expect(system).toContain('Architecture & Design Technique');
    expect(user).toContain(`<<<DOC-${boundary}>>>\n# Plan\n<<<END-DOC-${boundary}>>>`);
    expect(user).toContain(
      `<<<REFERENCE-${boundary}>>>\n# Spec\n<<<END-REFERENCE-${boundary}>>>`,
    );
  });
});
