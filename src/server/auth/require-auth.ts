import type { preHandlerHookHandler } from 'fastify';
import { AppError } from '../errors.js';

export function requireAuth(options: { requireCopilot?: boolean } = {}): preHandlerHookHandler {
  return async (request, reply) => {
    const sessionStore = request.server.rateMySDD.sessionStore;
    const session = await sessionStore.get(request.cookies.rmsdd_sid);
    if (!session) {
      throw new AppError('UNAUTHENTICATED');
    }

    await sessionStore.touch(session);
    reply.header(
      'X-Session-Expires-At',
      new Date(session.expiresAt).toISOString(),
    );
    request.auditor = session;

    if (options.requireCopilot && session.copilotAccess !== 'active') {
      throw new AppError('NO_COPILOT_ACCESS');
    }
  };
}
