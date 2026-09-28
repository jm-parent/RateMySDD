import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../errors.js';
import { EngineError } from '../audit/engine.js';
import { requireAuth } from './require-auth.js';
import { toPublicUser } from './session-store.js';

const authRoutes: FastifyPluginAsync = async (app) => {
  const { deviceFlow, engine, sessionStore } = app.rateMySDD;

  app.get('/api/session', async (request, reply) => {
    const session = await sessionStore.get(request.cookies.rmsdd_sid);
    if (!session) {
      return { authenticated: false };
    }
    reply.header(
      'X-Session-Expires-At',
      new Date(session.expiresAt).toISOString(),
    );
    return { authenticated: true, user: toPublicUser(session) };
  });

  app.post('/api/auth/device/start', async (_request, reply) => {
    const device = await deviceFlow.start();
    const pending = sessionStore.createPendingAuthorization(device);
    reply.setCookie('rmsdd_pre', pending.preAuthId, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: device.expiresIn,
    });
    return {
      userCode: device.userCode,
      verificationUri: device.verificationUri,
      expiresIn: device.expiresIn,
      interval: device.interval,
    };
  });

  app.post('/api/auth/device/poll', async (request, reply) => {
    const preAuthId = request.cookies.rmsdd_pre;
    const pending = sessionStore.getPendingAuthorization(preAuthId);
    if (!pending) {
      reply.clearCookie('rmsdd_pre', { path: '/api/auth' });
      return { status: 'expired' };
    }

    const now = Date.now();
    if (now - pending.lastPollAt < pending.interval * 1_000) {
      return { status: 'pending', interval: pending.interval };
    }
    pending.lastPollAt = now;

    const result = await deviceFlow.poll(pending.deviceCode);
    if (result.status === 'pending') {
      return { status: 'pending', interval: pending.interval };
    }
    if (result.status === 'slow_down') {
      pending.interval += 5;
      return { status: 'slow_down', interval: pending.interval };
    }
    if (result.status === 'denied' || result.status === 'expired') {
      sessionStore.clearPendingAuthorization(preAuthId);
      reply.clearCookie('rmsdd_pre', { path: '/api/auth' });
      return { status: result.status };
    }

    try {
      const user = await deviceFlow.fetchUser(result.accessToken);
      const copilotAccess = (await engine.checkAccess(result.accessToken))
        ? 'active'
        : 'none';
      const session = await sessionStore.create({
        ...user,
        copilotAccess,
        accessToken: result.accessToken,
      });
      sessionStore.clearPendingAuthorization(preAuthId);
      reply.clearCookie('rmsdd_pre', { path: '/api/auth' });
      reply.header(
        'X-Session-Expires-At',
        new Date(session.expiresAt).toISOString(),
      );
      reply.setCookie('rmsdd_sid', session.sessionId, {
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
      });
      return { status: 'authorized', user: toPublicUser(session) };
    } catch (error) {
      sessionStore.clearPendingAuthorization(preAuthId);
      reply.clearCookie('rmsdd_pre', { path: '/api/auth' });
      try {
        await engine.release(result.accessToken);
      } catch {
        // Preserve the original provider error while making a best-effort cleanup.
      }
      if (error instanceof AppError) {
        throw error;
      }
      if (error instanceof EngineError) {
        throw new AppError(
          error.kind === 'unauthorized' ? 'NO_COPILOT_ACCESS' : 'COPILOT_UNAVAILABLE',
          { cause: error },
        );
      }
      throw new AppError('COPILOT_UNAVAILABLE', { cause: error });
    }
  });

  app.post(
    '/api/auth/logout',
    { preHandler: requireAuth() },
    async (request, reply) => {
      await sessionStore.destroy(request.auditor?.sessionId);
      reply.clearCookie('rmsdd_sid', { path: '/' });
      return reply.code(204).send();
    },
  );
};

export { authRoutes };
