import { describe, expect, it } from 'vitest';
import { validateAuditRequest } from '../../src/server/audit/validate-request.js';

function thrownCode(operation: () => unknown): string | undefined {
  try {
    operation();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

describe('validateAuditRequest', () => {
  it('rejects whitespace-only content', () => {
    expect(thrownCode(() => validateAuditRequest({ content: ' \n\t', source: 'paste' })))
      .toBe('EMPTY_CONTENT');
  });

  it('reports a missing comparison document as empty content', () => {
    expect(
      thrownCode(() =>
        validateAuditRequest({
          content: '# Plan',
          source: 'paste',
          documentType: 'plan',
        }),
      ),
    ).toBe('EMPTY_CONTENT');
  });

  it('accepts content at the 204800-byte limit', () => {
    const content = 'é'.repeat(102_400);

    expect(Buffer.byteLength(content, 'utf8')).toBe(204_800);
    expect(validateAuditRequest({ content, source: 'paste' }).content).toBe(content);
  });

  it('rejects content over the byte limit, including multibyte text', () => {
    const content = 'é'.repeat(102_400) + 'a';

    expect(thrownCode(() => validateAuditRequest({ content, source: 'paste' })))
      .toBe('CONTENT_TOO_LARGE');
  });

  it('enforces the same byte limit independently on the reference document', () => {
    const referenceContent = 'a'.repeat(204_801);

    expect(
      thrownCode(() =>
        validateAuditRequest({
          content: '# Plan',
          source: 'paste',
          documentType: 'plan',
          referenceContent,
        }),
      ),
    ).toBe('CONTENT_TOO_LARGE');
  });

  it.each(['\u0000', '\u0007'])('rejects control character %s', (control) => {
    expect(
      thrownCode(() =>
        validateAuditRequest({ content: `Texte${control}invalide`, source: 'paste' }),
      ),
    ).toBe('INVALID_ENCODING');
  });

  it('allows tabs and line breaks', () => {
    expect(
      validateAuditRequest({ content: '# Titre\n\tTexte\r\n', source: 'paste' }).content,
    ).toBe('# Titre\n\tTexte\r\n');
  });

  it('rejects unknown request properties', () => {
    expect(
      thrownCode(() =>
        validateAuditRequest({
          content: 'Texte',
          source: 'paste',
          unexpected: true,
        }),
      ),
    ).toBeDefined();
  });
});
