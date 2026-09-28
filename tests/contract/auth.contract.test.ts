import { afterEach, describe, expect, it, vi } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { buildApp } from '../../src/server/app.js';
import { parseConfig } from '../../src/server/config.js';
import { FakeAuditEngine } from '../helpers/fake-engine.js';
import { FakeDeviceFlowClient } from '../helpers/fake-device-flow.js';
import { SessionStore } from '../../src/server/auth/session-store.js';

const specification = parse(
  readFileSync(
    join(
      process.cwd(),
      'specs',
      '001-markdown-spec-audit',
      'contracts',
      'openapi.yaml',
    ),
    'utf8',
  ),
) as Record<string, unknown>;
const specificationId = 'https://ratemysdd.local/openapi';
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema({ ...specification, $id: specificationId });

type OpenApiResponse = {
  description?: string;
  headers?: Record<string, unknown>;
};

type OpenApiOperation = {
  responses?: Record<string, OpenApiResponse>;
};

const openApiPaths = specification.paths as Record<
  string,
  Record<string, OpenApiOperation>
>;
const openApiHeaders = (
  specification.components as { headers?: Record<string, unknown> }
).headers;

function matchesSchema(name: string, value: unknown): boolean {
  const validator = ajv.getSchema(`${specificationId}#/components/schemas/${name}`);
  return Boolean(validator?.(value));
}

function responseFor(path: string, method: string): OpenApiResponse | undefined {
  return openApiPaths[path]?.[method]?.responses?.['200'];
}

function sessionExpiryHeader(path: string, method: string): unknown {
  const reference =
    responseFor(path, method)?.headers?.['X-Session-Expires-At'];
  if (typeof reference !== 'object' || reference === null) {
    return reference;
  }
  const pathReference = (reference as Record<string, unknown>)['$ref'];
  if (typeof pathReference !== 'string') {
    return reference;
  }
  const name = pathReference.split('/').at(-1);
  return name ? openApiHeaders?.[name] : undefined;
}

function cookieValue(
  header: string | string[] | undefined,
  name: string,
): string | undefined {
  const values = Array.isArray(header) ? header : [header];
  const value =
    values.find((entry) => entry?.startsWith(`${name}=`)) ??
    values.find((entry) => entry?.includes(`${name}=`));
  return value?.split(';')[0];
}

function headerText(header: string | string[] | undefined): string {
  return Array.isArray(header) ? header.join('\n') : (header ?? '');
}

describe('authentication API contract', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  afterEach(async () => {
    await app?.close();
    vi.restoreAllMocks();
  });

  async function setup(polls?: ConstructorParameters<typeof FakeDeviceFlowClient>[0]) {
    const engine = new FakeAuditEngine([], true);
    const appConfig = parseConfig({
      GITHUB_OAUTH_CLIENT_ID: 'test-client-id',
      NODE_ENV: 'test',
      RMSDD_TEST_MODE: '1',
    });
    app = await buildApp({
      config: appConfig,
      engine,
      deviceFlow: new FakeDeviceFlowClient(polls),
      sessionStore: new SessionStore((token: string) => engine.release(token)),
    });
    await app.ready();
    return { engine };
  }

  const localHeaders = {
    host: '127.0.0.1:5178',
    origin: 'http://127.0.0.1:5178',
  };

  it('documents the conditional session-expiry response header', () => {
    const sessionResponse = responseFor('/api/session', 'get');
    const devicePollResponse = responseFor('/api/auth/device/poll', 'post');
    const expectedHeader = {
      description: expect.stringContaining('RFC 3339'),
      schema: { type: 'string', format: 'date-time' },
    };

    expect(sessionResponse?.description).toContain('authenticated');
    expect(devicePollResponse?.description).toContain('authorized');
    expect(sessionExpiryHeader('/api/session', 'get')).toMatchObject(
      expectedHeader,
    );
    expect(
      sessionExpiryHeader('/api/auth/device/poll', 'post'),
    ).toMatchObject(expectedHeader);
  });

  it('returns an unauthenticated session that matches the OpenAPI schema', async () => {
    await setup();
    const response = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { host: localHeaders.host },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ authenticated: false });
    expect(matchesSchema('SessionState', response.json())).toBe(true);
  });

  it('starts and polls device authorization without exposing codes or tokens', async () => {
    const { engine } = await setup();
    const started = await app.inject({
      method: 'POST',
      url: '/api/auth/device/start',
      headers: localHeaders,
    });
    const startBody = started.json();
    expect(started.statusCode).toBe(200);
    expect(matchesSchema('DeviceStart', startBody)).toBe(true);
    expect(startBody.deviceCode).toBeUndefined();
    expect(JSON.stringify(startBody)).not.toContain('device-code-secret');

    const preAuthCookie = cookieValue(started.headers['set-cookie'], 'rmsdd_pre');
    expect(preAuthCookie).toContain('rmsdd_pre=');
    const pending = await app.inject({
      method: 'POST',
      url: '/api/auth/device/poll',
      headers: { ...localHeaders, cookie: preAuthCookie },
    });
    expect(pending.statusCode).toBe(200);
    expect(matchesSchema('DevicePoll', pending.json())).toBe(true);
    expect(pending.json().status).toBe('pending');

    const initialTime = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(initialTime + 5_000);
    const authorized = await app.inject({
      method: 'POST',
      url: '/api/auth/device/poll',
      headers: { ...localHeaders, cookie: preAuthCookie },
    });
    const authorizedBody = authorized.json();
    const sessionHeader = authorized.headers['set-cookie'];
    const sessionCookie = cookieValue(sessionHeader, 'rmsdd_sid');
    expect(authorized.statusCode).toBe(200);
    expect(matchesSchema('DevicePoll', authorizedBody)).toBe(true);
    expect(authorizedBody.status).toBe('authorized');
    expect(authorizedBody.user).toMatchObject({ login: 'octo', copilotAccess: 'active' });
    expect(JSON.stringify(authorizedBody)).not.toContain('access-token-secret');
    expect(headerText(sessionHeader)).toContain('HttpOnly');
    expect(headerText(sessionHeader)).toContain('SameSite=Strict');
    expect(headerText(sessionHeader)).toContain('Path=/');
    expect(JSON.stringify(authorizedBody)).not.toContain('accessToken');

    const session = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: {
        host: localHeaders.host,
        cookie: sessionCookie,
      },
    });
    expect(session.statusCode).toBe(200);
    expect(matchesSchema('SessionState', session.json())).toBe(true);
    expect(session.json()).toMatchObject({
      authenticated: true,
      user: { login: 'octo', copilotAccess: 'active' },
    });
    expect(JSON.stringify(session.json())).not.toContain('accessToken');

    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { ...localHeaders, cookie: sessionCookie },
    });
    expect(logout.statusCode).toBe(204);
    expect(headerText(logout.headers['set-cookie'])).toContain('Max-Age=0');
    expect(engine.releasedTokens).toContain('access-token-secret');
  });

  it('rejects a state-changing request without an Origin header', async () => {
    await setup();
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/device/start',
      headers: { host: localHeaders.host },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('FORBIDDEN_ORIGIN');
  });

  it('requires authentication for logout', async () => {
    await setup();
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: localHeaders,
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('UNAUTHENTICATED');
  });
});
