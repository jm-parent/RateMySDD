import { describe, expect, it } from 'vitest';
import { AppError, STATUS_BY_CODE, toApiError } from '../../src/server/errors.js';

describe('API error mapping', () => {
  it('maps known application errors to stable French messages and statuses', () => {
    const error = toApiError(new AppError('EMPTY_CONTENT'));
    expect(error).toEqual({
      code: 'EMPTY_CONTENT',
      message: 'Veuillez fournir un contenu à auditer.',
    });
    expect(STATUS_BY_CODE[error.code]).toBe(400);
  });

  it('hides internal messages and causes from public errors', () => {
    const error = toApiError(new Error('CONFIDENTIEL-MARQUEUR-7f3a'));
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.message).not.toContain('CONFIDENTIEL-MARQUEUR-7f3a');
  });
});
