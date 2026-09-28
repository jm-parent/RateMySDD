import { createServer as createHttpServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createServer as createViteServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import viteConfig from '../../vite.config.js';

let apiServer: HttpServer | undefined;
let viteServer: ViteDevServer | undefined;

afterEach(async () => {
  const currentViteServer = viteServer;
  const currentApiServer = apiServer;
  viteServer = undefined;
  apiServer = undefined;

  const closing: Promise<void>[] = [];
  if (currentViteServer) {
    closing.push(currentViteServer.close());
  }
  if (currentApiServer?.listening) {
    closing.push(
      new Promise<void>((resolve, reject) => {
        currentApiServer.close((error) =>
          error ? reject(error) : resolve(),
        );
      }),
    );
  }
  await Promise.all(closing);
});

async function listen(server: HttpServer): Promise<AddressInfo> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Le serveur de test ne possède pas une adresse TCP.');
  }
  return address;
}

describe('Vite API proxy', () => {
  it('serves the api.ts module and still proxies API endpoints', async () => {
    apiServer = createHttpServer((request, response) => {
      if (request.url === '/api/session') {
        response
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify({ authenticated: false }));
        return;
      }

      response
        .writeHead(200, { 'content-type': 'text/html' })
        .end('<!doctype html><html></html>');
    });
    const apiAddress = await listen(apiServer);
    const apiTarget = `http://127.0.0.1:${apiAddress.port}`;
    const proxy = Object.fromEntries(
      Object.entries(viteConfig.server?.proxy ?? {}).map(
        ([context, options]) => [
          context,
          typeof options === 'string'
            ? { target: apiTarget }
            : { ...options, target: apiTarget },
        ],
      ),
    );

    viteServer = await createViteServer({
      ...viteConfig,
      configFile: false,
      logLevel: 'silent',
      server: {
        ...viteConfig.server,
        host: '127.0.0.1',
        port: 0,
        strictPort: false,
        proxy,
      },
    });
    await viteServer.listen();

    const httpServer = viteServer.httpServer;
    if (!httpServer) {
      throw new Error('Vite n’a pas créé de serveur HTTP.');
    }
    const address = httpServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('Vite n’a pas attribué une adresse TCP.');
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const moduleResponse = await fetch(`${baseUrl}/api.ts`);

    expect(moduleResponse.status).toBe(200);
    expect(moduleResponse.headers.get('content-type')).toContain('javascript');
    expect(await moduleResponse.text()).toContain('apiPost');

    const apiResponse = await fetch(`${baseUrl}/api/session`);
    expect(apiResponse.status).toBe(200);
    await expect(apiResponse.json()).resolves.toEqual({
      authenticated: false,
    });
  });
});
