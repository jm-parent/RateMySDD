import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Writable } from 'node:stream';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AppConfig } from './config.js';
import { STATUS_BY_CODE, toApiError } from './errors.js';
import type { AuditEngine } from './audit/engine.js';
import type { ApiError } from '../shared/schemas.js';
import {
  createDiagnosticSnapshot,
  extractBearerToken,
  isDiagnosticsAuthorized,
  recordDiagnosticEvent,
} from './diagnostics.js';
import { createOriginGuard } from './security/origin-guard.js';
import type { DeviceFlowClient } from './auth/device-flow.js';
import { authRoutes } from './auth/routes.js';
import type { SessionStore } from './auth/session-store.js';
import { auditRoutes } from './audit/routes.js';

export interface BuildAppOptions {
  config: AppConfig;
  engine: AuditEngine;
  deviceFlow: DeviceFlowClient;
  sessionStore: SessionStore;
  logStream?: Writable;
}

export async function buildApp({
  config,
  engine,
  deviceFlow,
  sessionStore,
  logStream,
}: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    requestIdHeader: 'x-diagnostic-id',
    logger: {
      level: 'info',
      stream: logStream,
      redact: [
        'req.headers.cookie',
        'req.headers.authorization',
        "res.headers['set-cookie']",
        'req.body',
        'body',
        'content',
        'token',
      ],
    },
    disableRequestLogging: true,
    bodyLimit: 1 * 1024 * 1024,
  });

  app.decorate('rateMySDD', { config, engine, deviceFlow, sessionStore });
  app.addHook(
    'onRequest',
    createOriginGuard({
      port: config.port,
      nodeEnv: process.env.NODE_ENV,
      publicOrigin: config.publicOrigin,
    }),
  );
  await app.register(cookie);

  app.addHook('onResponse', async (request, reply) => {
    app.log.info(
      {
        method: request.method,
        route: request.routeOptions.url ?? 'unmatched',
        statusCode: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
      },
      'request completed',
    );
  });

  app.setErrorHandler((error, request, reply) => {
    const code =
      error instanceof Error &&
      'statusCode' in error &&
      error.statusCode === 413 &&
      'code' in error &&
      typeof error.code === 'string' &&
      error.code === 'FST_ERR_CTP_BODY_TOO_LARGE'
        ? 'CONTENT_TOO_LARGE'
        : undefined;
    const publicError: ApiError = code
      ? {
          code,
          message: 'Le document dépasse la taille maximale de 200 Ko.',
        }
      : toApiError(error);
    const statusCode = code ? STATUS_BY_CODE[code] : STATUS_BY_CODE[publicError.code];
    if (statusCode >= 500) {
      const diagnosticId = request.id.slice(0, 128);
      const event = recordDiagnosticEvent({
        timestamp: new Date().toISOString(),
        requestId: diagnosticId,
        source: 'request',
        errorType: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : 'Erreur serveur.',
      });
      app.log.error(
        {
          diagnosticId,
          errorType: event.errorType,
          message: event.message,
        },
        'server request failed',
      );
      reply.header('X-Diagnostic-Id', diagnosticId);
      reply.status(statusCode).send({ ...publicError, diagnosticId });
      return;
    }
    reply.status(statusCode).send(publicError);
  });

  app.get('/api/diagnostics', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (
      !isDiagnosticsAuthorized(
        extractBearerToken(request.headers.authorization),
        process.env.DIAGNOSTICS_TOKEN,
      )
    ) {
      return reply.code(404).send({
        code: 'INTERNAL_ERROR',
        message: 'Diagnostic indisponible.',
      });
    }
    return createDiagnosticSnapshot('ready');
  });

  await app.register(authRoutes);
  await app.register(auditRoutes);

  const webRoot = resolve(process.cwd(), 'dist', 'web');
  if (!process.env.VERCEL && existsSync(webRoot)) {
    const { default: fastifyStatic } = await import('@fastify/static');
    await app.register(fastifyStatic, {
      root: webRoot,
      prefix: '/',
      wildcard: false,
      index: false,
    });

    const serveSpa = async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.url.startsWith('/api/')) {
        return reply.callNotFound();
      }
      return reply.sendFile('index.html');
    };
    app.get('/', serveSpa);
    app.get('/*', serveSpa);
  }

  return app;
}
