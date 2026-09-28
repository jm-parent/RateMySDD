import { describe, expect, it } from 'vitest';
import { readMarkdownFile } from '../../src/web/file-input.js';

describe('readMarkdownFile', () => {
  it('accepts Markdown files regardless of extension case and decodes their content', async () => {
    const lowerCase = await readMarkdownFile([
      new File(['# Spec'], 'spec.md', { type: 'text/markdown' }),
    ]);
    const upperCase = await readMarkdownFile([
      new File(['# Spec'], 'SPEC.MD', { type: 'text/markdown' }),
    ]);

    expect(lowerCase).toEqual({ content: '# Spec', fileName: 'spec.md' });
    expect(upperCase).toEqual({ content: '# Spec', fileName: 'SPEC.MD' });
  });

  it('rejects non-Markdown files', async () => {
    await expect(
      readMarkdownFile([new File(['binary'], 'doc.pdf', { type: 'application/pdf' })]),
    ).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE' });
  });

  it('requires exactly one file', async () => {
    await expect(readMarkdownFile([])).rejects.toMatchObject({
      code: 'MULTIPLE_FILES',
    });
    await expect(
      readMarkdownFile([
        new File(['one'], 'one.md'),
        new File(['two'], 'two.md'),
      ]),
    ).rejects.toMatchObject({ code: 'MULTIPLE_FILES' });
  });

  it('rejects files larger than 200 KiB', async () => {
    const content = 'a'.repeat(204_801);
    await expect(
      readMarkdownFile([new File([content], 'large.md')]),
    ).rejects.toMatchObject({ code: 'CONTENT_TOO_LARGE' });
  });

  it('rejects invalid UTF-8 and binary control characters', async () => {
    const invalidUtf8 = new File([Uint8Array.from([0xc3, 0x28])], 'invalid.md');
    const binary = new File(['\u0000# Spec'], 'binary.md');

    await expect(readMarkdownFile([invalidUtf8])).rejects.toMatchObject({
      code: 'INVALID_ENCODING',
    });
    await expect(readMarkdownFile([binary])).rejects.toMatchObject({
      code: 'INVALID_ENCODING',
    });
  });

  it('removes a UTF-8 byte-order mark', async () => {
    const file = new File(['\uFEFF# Spec'], 'bom.md');

    await expect(readMarkdownFile([file])).resolves.toEqual({
      content: '# Spec',
      fileName: 'bom.md',
    });
  });
});
