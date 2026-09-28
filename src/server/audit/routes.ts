import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../errors.js';
import { requireAuth } from '../auth/require-auth.js';
import { createAuditService } from './audit-service.js';

const auditRoutes: FastifyPluginAsync = async (app) => {
  const service = createAuditService({
    engine: app.rateMySDD.engine,
    config: app.rateMySDD.config,
    logger: app.log,
  });

  app.post(
    '/api/audits',
    { preHandler: requireAuth({ requireCopilot: true }) },
    async (request, reply) => {
      if (!request.auditor) {
        throw new AppError('UNAUTHENTICATED');
      }

      const controller = new AbortController();
      const onRequestClose = () => {
        if (request.raw.aborted) {
          controller.abort();
        }
      };
      const onResponseClose = () => {
        if (!reply.raw.writableEnded) {
          controller.abort();
        }
      };
      request.raw.on('close', onRequestClose);
      reply.raw.on('close', onResponseClose);
      try {
        return await service.run(request.auditor, request.body, controller.signal);
      } finally {
        request.raw.off('close', onRequestClose);
        reply.raw.off('close', onResponseClose);
      }
    },
  );
};

export { auditRoutes };
