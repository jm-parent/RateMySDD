import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { createOriginGuard } from '../../src/server/security/origin-guard.js';
import { STATUS_BY_CODE, toApiError } from '../../src/server/errors.js';

describe('local origin guard', () => {
  let app: ReturnType<typeof Fastify>;

  afterEach(async () => {
    await app?.close();
  });

  function makeApp(publicOrigin?: string, nodeEnv = 'test') {
    app = Fastify();
    app.addHook(
      'onRequest',
      createOriginGuard({ port: 5178, nodeEnv, publicOrigin }),
    );
    app.setErrorHandler(
      (error: FastifyError, _request: FastifyRequest, reply: FastifyReply) => {
      const apiError = toApiError(error);
      reply.status(STATUS_BY_CODE[apiError.code]).send(apiError);
      },
    );
    app.post('/write', async () => ({ ok: true }));
    app.get('/read', async () => ({ ok: true }));
    return app;
  }

  it('allows a same-origin local POST and the Vite dev-server origin', async () => {
    const server = makeApp();
    const sameOrigin = await server.inject({
      method: 'POST',
      url: '/write',
      headers: {
        host: '127.0.0.1:5178',
        origin: 'http://127.0.0.1:5178',
      },
    });
    expect(sameOrigin.statusCode).toBe(200);

    const viteOrigin = await server.inject({
      method: 'POST',
      url: '/write',
      headers: {
        host: '127.0.0.1:5178',
        origin: 'http://127.0.0.1:5173',
      },
    });
    expect(viteOrigin.statusCode).toBe(200);
  });

  it('rejects a foreign host, a missing POST Origin, and a foreign Origin', async () => {
    const server = makeApp();
    const foreignHost = await server.inject({
      method: 'POST',
      url: '/write',
      headers: {
        host: 'evil.example',
        origin: 'http://127.0.0.1:5178',
      },
    });
    expect(foreignHost.statusCode).toBe(403);
    expect(foreignHost.json().code).toBe('FORBIDDEN_ORIGIN');

    const missingOrigin = await server.inject({
      method: 'POST',
      url: '/write',
      headers: { host: '127.0.0.1:5178' },
    });
    expect(missingOrigin.statusCode).toBe(403);

    const foreignOrigin = await server.inject({
      method: 'POST',
      url: '/write',
      headers: {
        host: '127.0.0.1:5178',
        origin: 'https://evil.example',
      },
    });
    expect(foreignOrigin.statusCode).toBe(403);
  });

  it('allows local GET requests without an Origin header', async () => {
    const response = await makeApp().inject({
      method: 'GET',
      url: '/read',
      headers: { host: 'localhost:5178' },
    });
    expect(response.statusCode).toBe(200);
  });

  it('allows the configured HTTPS production origin and rejects origin spoofing', async () => {
    const server = makeApp('https://rate-my-sdd.vercel.app', 'production');
    const productionOrigin = await server.inject({
      method: 'POST',
      url: '/write',
      headers: {
        host: 'rate-my-sdd.vercel.app',
        origin: 'https://rate-my-sdd.vercel.app',
      },
    });
    expect(productionOrigin.statusCode).toBe(200);

    const spoofedOrigin = await server.inject({
      method: 'POST',
      url: '/write',
      headers: {
        host: 'rate-my-sdd.vercel.app',
        origin: 'https://evil.example',
      },
    });
    expect(spoofedOrigin.statusCode).toBe(403);
  });
});
