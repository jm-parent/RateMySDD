import type { ApiError, ErrorCode } from '../shared/schemas.js';

export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  NO_COPILOT_ACCESS: 403,
  FORBIDDEN_ORIGIN: 403,
  EMPTY_CONTENT: 400,
  INVALID_FILE_TYPE: 400,
  INVALID_ENCODING: 400,
  CONTENT_TOO_LARGE: 413,
  AUDIT_IN_PROGRESS: 409,
  AI_OUTPUT_INVALID: 502,
  COPILOT_RATE_LIMITED: 429,
  COPILOT_UNAVAILABLE: 503,
  COPILOT_TIMEOUT: 504,
  DEVICE_FLOW_ERROR: 502,
  INTERNAL_ERROR: 500,
};

export const MESSAGE_BY_CODE: Record<ErrorCode, string> = {
  UNAUTHENTICATED: 'Veuillez vous connecter pour continuer.',
  NO_COPILOT_ACCESS: "L'audit nécessite un abonnement GitHub Copilot actif.",
  FORBIDDEN_ORIGIN: "Cette origine n'est pas autorisée.",
  EMPTY_CONTENT: 'Veuillez fournir un contenu à auditer.',
  INVALID_FILE_TYPE: 'Seuls les fichiers .md sont acceptés.',
  INVALID_ENCODING: 'Le fichier doit être un texte encodé en UTF-8.',
  CONTENT_TOO_LARGE: 'Le document dépasse la taille maximale de 200 Ko.',
  AUDIT_IN_PROGRESS: 'Un audit est déjà en cours.',
  AI_OUTPUT_INVALID:
    "L'analyse n'a pas produit un résultat conforme. Veuillez relancer l'audit.",
  COPILOT_RATE_LIMITED: 'Votre quota Copilot est atteint. Réessayez plus tard.',
  COPILOT_UNAVAILABLE: 'Le service Copilot est momentanément indisponible.',
  COPILOT_TIMEOUT: "L'analyse a dépassé le délai autorisé. Veuillez relancer.",
  DEVICE_FLOW_ERROR: 'La connexion à GitHub a échoué. Veuillez réessayer.',
  INTERNAL_ERROR: 'Une erreur inattendue est survenue. Veuillez réessayer.',
};

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    options?: ErrorOptions,
  ) {
    super(MESSAGE_BY_CODE[code], options);
    this.name = 'AppError';
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof AppError) {
    return { code: error.code, message: MESSAGE_BY_CODE[error.code] };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: MESSAGE_BY_CODE.INTERNAL_ERROR,
  };
}
