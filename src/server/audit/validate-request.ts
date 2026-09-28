import { MAX_CONTENT_BYTES, AuditRequestSchema } from '../../shared/schemas.js';
import type { AuditRequest } from '../../shared/schemas.js';
import { AppError } from '../errors.js';

export function validateAuditRequest(body: unknown): AuditRequest {
  const parsed = AuditRequestSchema.safeParse(body);
  if (!parsed.success) {
    if (
      typeof body === 'object' &&
      body !== null &&
      'source' in body &&
      body.source === 'file'
    ) {
      throw new AppError('INVALID_FILE_TYPE', { cause: parsed.error });
    }
    if (parsed.error.issues.some(({ path }) => path[0] === 'referenceContent')) {
      throw new AppError('EMPTY_CONTENT', { cause: parsed.error });
    }
    throw new AppError('INVALID_ENCODING', { cause: parsed.error });
  }

  const { content, source, fileName, referenceContent } = parsed.data;
  if (source === 'file' && (!fileName || !/\.md$/i.test(fileName))) {
    throw new AppError('INVALID_FILE_TYPE');
  }
  if (content.trim() === '') {
    throw new AppError('EMPTY_CONTENT');
  }
  const documents = [content, ...(referenceContent ? [referenceContent] : [])];
  if (documents.some((document) => Buffer.byteLength(document, 'utf8') > MAX_CONTENT_BYTES)) {
    throw new AppError('CONTENT_TOO_LARGE');
  }
  if (
    documents.some((document) =>
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/u.test(document),
    )
  ) {
    throw new AppError('INVALID_ENCODING');
  }

  return source === 'paste'
    ? { ...parsed.data, fileName: null }
    : parsed.data;
}
