import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import {
  ConfigurationError,
  loadConfig,
} from '../src/server/config.js';
import { MESSAGE_BY_CODE } from '../src/server/errors.js';
import { createServerRuntime } from '../src/server/index.js';
import {
  createDiagnosticSnapshot,
  extractBearerToken,
  isDiagnosticsAuthorized,
  recordDiagnosticEvent,
} from '../src/server/diagnostics.js';

let runtimePromise: ReturnType<typeof createServerRuntime> | undefined;
let runtimeStatus: 'not_started' | 'starting' | 'ready' | 'failed' = 'not_started';

async function getRuntime() {
  if (!runtimePromise) {
    runtimeStatus = 'starting';
    try {
      runtimePromise = createServerRuntime(loadConfig())
        .then((runtime) => {
          runtimeStatus = 'ready';
          return runtime;
        })
        .catch((error: unknown) => {
          runtimeStatus = 'failed';
          runtimePromise = undefined;
          throw error;
        });
    } catch (error) {
      runtimeStatus = 'failed';
      throw error;
    }
  }
  return runtimePromise;
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}

function requestPath(request: IncomingMessage): string | undefined {
  try {
    return new URL(request.url ?? '/', 'http://localhost').pathname;
  } catch {
    return undefined;
  }
}

function sendDiagnosticSnapshot(response: ServerResponse): void {
  response.setHeader('Cache-Control', 'no-store');
  sendJson(response, 200, createDiagnosticSnapshot(runtimeStatus));
}

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const diagnosticId = randomUUID();
  response.setHeader('X-Diagnostic-Id', diagnosticId);

  if (request.method === 'GET' && requestPath(request) === '/api/diagnostics') {
    response.setHeader('Cache-Control', 'no-store');
    const unavailable = () =>
      sendJson(response, 404, {
        code: 'INTERNAL_ERROR',
        message: 'Diagnostic indisponible.',
      });
    if (
      !isDiagnosticsAuthorized(
        extractBearerToken(request.headers.authorization),
        process.env.DIAGNOSTICS_TOKEN,
      )
    ) {
      unavailable();
      return;
    }
    sendDiagnosticSnapshot(response);
    return;
  }

  request.headers['x-diagnostic-id'] = diagnosticId;
  try {
    const runtime = await getRuntime();
    runtime.app.server.emit('request', request, response);
  } catch (error) {
    const configurationFailure = error instanceof ConfigurationError;
    const event = recordDiagnosticEvent({
      timestamp: new Date().toISOString(),
      requestId: diagnosticId,
      source: 'startup',
      errorType:
        error instanceof Error ? error.name : 'UnknownError',
      message: configurationFailure
        ? error.message
        : 'Échec de l’initialisation du runtime.',
    });
    console.error(JSON.stringify({ level: 'error', event: 'runtime_startup_failed', ...event }));
    response.setHeader('Cache-Control', 'no-store');
    sendJson(response, 500, {
      code: 'INTERNAL_ERROR',
      message: MESSAGE_BY_CODE.INTERNAL_ERROR,
      diagnosticId,
    });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};