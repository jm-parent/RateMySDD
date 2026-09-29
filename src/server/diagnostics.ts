import { timingSafeEqual } from 'node:crypto';
import { inspectEnvironment } from './config.js';
import {
  DiagnosticEventSchema,
  DiagnosticSnapshotSchema,
} from '../shared/schemas.js';
import type {
  DiagnosticEvent,
  DiagnosticSnapshot,
} from '../shared/schemas.js';

const MAX_DIAGNOSTIC_EVENTS = 20;
export type DiagnosticRuntimeStatus =
  | 'not_started'
  | 'starting'
  | 'ready'
  | 'failed';
const SENSITIVE_ENVIRONMENT_KEYS = [
  'GITHUB_OAUTH_CLIENT_ID',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'SESSION_ENCRYPTION_KEY',
  'DIAGNOSTICS_TOKEN',
] as const;
const GENERIC_ERROR_MESSAGE = 'Une erreur serveur a été détectée.';

const diagnosticEvents: DiagnosticEvent[] = [];

function sanitizeMessage(
  message: string,
  source: DiagnosticEvent['source'],
  includeRequestMessage: boolean,
): string {
  let sanitized =
    source === 'startup' || includeRequestMessage
      ? message
      : GENERIC_ERROR_MESSAGE;

  for (const key of SENSITIVE_ENVIRONMENT_KEYS) {
    const secret = process.env[key]?.trim();
    if (secret) {
      sanitized = sanitized.split(secret).join('[redacted]');
    }
  }

  return sanitized.replace(/[\r\n\t]/g, ' ').slice(0, 300) || GENERIC_ERROR_MESSAGE;
}

export function isDiagnosticsAuthorized(
  candidate: string | undefined,
  configured: string | undefined,
): boolean {
  if (!candidate || !configured) {
    return false;
  }

  const candidateBytes = Buffer.from(candidate, 'utf8');
  const configuredBytes = Buffer.from(configured, 'utf8');
  return (
    candidateBytes.length === configuredBytes.length &&
    timingSafeEqual(candidateBytes, configuredBytes)
  );
}

export function extractBearerToken(
  authorization: string | string[] | undefined,
): string | undefined {
  const value = Array.isArray(authorization) ? authorization[0] : authorization;
  return value ? /^Bearer (.+)$/i.exec(value)?.[1] : undefined;
}

export function createDiagnosticSnapshot(
  runtime: DiagnosticRuntimeStatus,
): DiagnosticSnapshot {
  return DiagnosticSnapshotSchema.parse({
    runtime,
    environment: inspectEnvironment(process.env),
    events: getDiagnosticEvents(),
  });
}

export function summarizeDiagnosticCause(error: unknown): string {
  const causes: string[] = [];
  let current = error;
  while (current instanceof Error && causes.length < 4) {
    const candidate = current as Error & {
      code?: unknown;
      status?: unknown;
      statusCode?: unknown;
    };
    const metadata = [candidate.code, candidate.status, candidate.statusCode]
      .filter(
        (value): value is string | number =>
          typeof value === 'string' || typeof value === 'number',
      )
      .join(' ');
    causes.push(
      `${current.name}${metadata ? ` [${metadata}]` : ''}: ${current.message}`,
    );
    current = current.cause;
  }
  return causes.join(' <- ') || GENERIC_ERROR_MESSAGE;
}

export function recordDiagnosticEvent(
  event: DiagnosticEvent,
  options: { includeRequestMessage?: boolean } = {},
): DiagnosticEvent {
  const sanitizedEvent = DiagnosticEventSchema.parse({
    ...event,
    errorType: event.errorType.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80) || 'Error',
    message: sanitizeMessage(
      event.message,
      event.source,
      options.includeRequestMessage === true,
    ),
  });
  diagnosticEvents.push(sanitizedEvent);
  if (diagnosticEvents.length > MAX_DIAGNOSTIC_EVENTS) {
    diagnosticEvents.splice(0, diagnosticEvents.length - MAX_DIAGNOSTIC_EVENTS);
  }
  return sanitizedEvent;
}

export function getDiagnosticEvents(): DiagnosticEvent[] {
  return diagnosticEvents.map((event) => ({ ...event }));
}