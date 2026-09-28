import { ApiErrorSchema } from '../shared/schemas.js';
import type { ApiError, ErrorCode } from '../shared/schemas.js';
import type { ZodType } from 'zod';

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

let unauthenticatedHandler: (() => void) | undefined;
let sessionExpiryHandler: ((expiresAt: string) => void) | undefined;

const RFC3339_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/;

function isRfc3339Timestamp(value: string): boolean {
  const match = RFC3339_TIMESTAMP.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = Number(match[9] ?? 0);
  const offsetMinute = Number(match[10] ?? 0);
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthLengths = [
    31,
    isLeapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= (monthLengths[month - 1] ?? 0) &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59 &&
    Number.isFinite(Date.parse(value))
  );
}

function notifySessionExpiry(response: Response): void {
  const expiresAt = response.headers.get('X-Session-Expires-At');
  if (expiresAt === null) {
    return;
  }

  if (!isRfc3339Timestamp(expiresAt)) {
    throw new ApiClientError(
      502,
      'INTERNAL_ERROR',
      'Le serveur a fourni une date d’expiration de session invalide.',
    );
  }

  sessionExpiryHandler?.(expiresAt);
}

export function setUnauthenticatedHandler(handler: () => void): void {
  unauthenticatedHandler = handler;
}

export function setSessionExpiryHandler(
  handler: (expiresAt: string) => void,
): void {
  sessionExpiryHandler = handler;
}

async function request<T>(
  path: string,
  init: RequestInit,
  schema?: ZodType<T>,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  if (response.status === 204) {
    notifySessionExpiry(response);
    return undefined as T;
  }

  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(payload);
    const apiError: ApiError = parsed.success
      ? parsed.data
      : {
          code: 'INTERNAL_ERROR',
          message: 'Une erreur inattendue est survenue. Veuillez réessayer.',
        };
    if (response.status === 401) {
      unauthenticatedHandler?.();
    }
    notifySessionExpiry(response);
    throw new ApiClientError(response.status, apiError.code, apiError.message);
  }

  notifySessionExpiry(response);

  if (!schema) {
    return payload as T;
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiClientError(
      502,
      'INTERNAL_ERROR',
      'La réponse du serveur est invalide. Veuillez réessayer.',
    );
  }
  return parsed.data;
}

export function apiGet<T>(path: string, schema: ZodType<T>): Promise<T> {
  return request(path, { method: 'GET' }, schema);
}

export function apiPost<T>(
  path: string,
  body?: unknown,
  schema?: ZodType<T>,
): Promise<T> {
  return request(
    path,
    {
      method: 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    schema,
  );
}
