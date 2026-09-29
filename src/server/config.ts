import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { DiagnosticVariable } from '../shared/schemas.js';

const configurationSchema = z.object({
  githubOAuthClientId: z.string().trim().min(1, 'GITHUB_OAUTH_CLIENT_ID est requis.'),
  copilotModel: z.string().trim().min(1).default('gpt-5'),
  reasoningEffort: z.enum(['low', 'medium', 'high']).default('medium'),
  port: z.number().int().min(1024).max(65_535).default(5178),
  publicOrigin: z.string().url().optional(),
  redisRestUrl: z.string().trim().url().optional(),
  redisRestToken: z.string().trim().min(1).optional(),
  sessionEncryptionKey: z.string().trim().regex(/^[\da-f]{64}$/i).optional(),
});

export type AppConfig = z.infer<typeof configurationSchema> & {
  tmpDir: string;
  testMode: boolean;
  secureCookies: boolean;
};

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

function resolvePublicOrigin(env: NodeJS.ProcessEnv): string | undefined {
  const configuredPublicOrigin = env.APP_ORIGIN?.trim();
  const vercelHost = env.VERCEL_URL?.trim().replace(/^https?:\/\//, '');
  const vercelProductionHost = env.VERCEL_PROJECT_PRODUCTION_URL?.trim().replace(
    /^https?:\/\//,
    '',
  );

  return (
    configuredPublicOrigin ||
    (env.VERCEL_ENV === 'production' && vercelProductionHost
      ? `https://${vercelProductionHost}`
      : vercelHost
        ? `https://${vercelHost}`
        : undefined)
  );
}

function isHttpsOrigin(value: string): boolean {
  try {
    const parsedOrigin = new URL(value);
    return (
      parsedOrigin.protocol === 'https:' &&
      parsedOrigin.pathname === '/' &&
      !parsedOrigin.search &&
      !parsedOrigin.hash
    );
  } catch {
    return false;
  }
}

function inspectHostVariable(
  key: string,
  value: string | undefined,
): DiagnosticVariable {
  if (!value?.trim()) {
    return { key, status: 'optional' };
  }

  const rawHost = value.trim();
  try {
    const parsedHost = new URL(
      /^[a-z][a-z\d+.-]*:\/\//i.test(rawHost) ? rawHost : `https://${rawHost}`,
    );
    if (
      parsedHost.protocol !== 'https:' ||
      parsedHost.pathname !== '/' ||
      parsedHost.search ||
      parsedHost.hash
    ) {
      return { key, status: 'invalid' };
    }
    return { key, status: 'valid', value: parsedHost.host };
  } catch {
    return { key, status: 'invalid' };
  }
}

export function inspectEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): DiagnosticVariable[] {
  const publicOrigin = resolvePublicOrigin(env);
  const explicitOrigin = env.APP_ORIGIN?.trim();
  const productionHost = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const requiresStableOrigin =
    env.NODE_ENV === 'production' && env.VERCEL_ENV === 'production';
  const stableOriginMissing = requiresStableOrigin && !explicitOrigin && !productionHost;
  const effectiveOriginStatus = !publicOrigin || stableOriginMissing
    ? requiresStableOrigin
      ? 'missing'
      : 'optional'
    : isHttpsOrigin(publicOrigin)
      ? 'valid'
      : 'invalid';

  const explicitOriginCheck: DiagnosticVariable = !explicitOrigin
    ? { key: 'APP_ORIGIN', status: 'optional' }
    : isHttpsOrigin(explicitOrigin)
      ? { key: 'APP_ORIGIN', status: 'valid', value: new URL(explicitOrigin).origin }
      : { key: 'APP_ORIGIN', status: 'invalid' };
  const effectiveOriginCheck: DiagnosticVariable = {
    key: 'EFFECTIVE_PUBLIC_ORIGIN',
    status: effectiveOriginStatus,
    ...(effectiveOriginStatus === 'valid' && publicOrigin
      ? { value: new URL(publicOrigin).origin }
      : {}),
  };

  return [
    {
      key: 'NODE_ENV',
      status: env.NODE_ENV ? 'valid' : 'optional',
      ...(env.NODE_ENV ? { value: env.NODE_ENV } : {}),
    },
    {
      key: 'VERCEL_ENV',
      status:
        env.VERCEL_ENV === undefined
          ? 'optional'
          : ['production', 'preview', 'development'].includes(env.VERCEL_ENV)
            ? 'valid'
            : 'invalid',
      ...(env.VERCEL_ENV ? { value: env.VERCEL_ENV } : {}),
    },
    inspectHostVariable('VERCEL_URL', env.VERCEL_URL),
    inspectHostVariable(
      'VERCEL_PROJECT_PRODUCTION_URL',
      env.VERCEL_PROJECT_PRODUCTION_URL,
    ),
    explicitOriginCheck,
    effectiveOriginCheck,
    {
      key: 'GITHUB_OAUTH_CLIENT_ID',
      status: env.GITHUB_OAUTH_CLIENT_ID?.trim() ? 'valid' : 'missing',
    },
    (() => {
      const redisUrl = env.UPSTASH_REDIS_REST_URL?.trim();
      if (!redisUrl) {
        return { key: 'UPSTASH_REDIS_REST_URL', status: 'missing' };
      }
      try {
        const parsedUrl = new URL(redisUrl);
        return parsedUrl.protocol === 'https:'
          ? {
              key: 'UPSTASH_REDIS_REST_URL',
              status: 'valid',
              value: parsedUrl.host,
            }
          : { key: 'UPSTASH_REDIS_REST_URL', status: 'invalid' };
      } catch {
        return { key: 'UPSTASH_REDIS_REST_URL', status: 'invalid' };
      }
    })(),
    {
      key: 'UPSTASH_REDIS_REST_TOKEN',
      status: env.UPSTASH_REDIS_REST_TOKEN?.trim() ? 'valid' : 'missing',
    },
    {
      key: 'SESSION_ENCRYPTION_KEY',
      status: !env.SESSION_ENCRYPTION_KEY?.trim()
        ? 'missing'
        : /^[\da-f]{64}$/i.test(env.SESSION_ENCRYPTION_KEY.trim())
          ? 'valid'
          : 'invalid',
    },
    {
      key: 'DIAGNOSTICS_TOKEN',
      status: env.DIAGNOSTICS_TOKEN?.trim() ? 'valid' : 'missing',
    },
  ];
}

export function parseConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): AppConfig {
  const rawPort =
    env.PORT === undefined || env.PORT.trim() === '' ? undefined : Number(env.PORT);
  const configuredPublicOrigin = env.APP_ORIGIN?.trim();
  const vercelProductionHost = env.VERCEL_PROJECT_PRODUCTION_URL?.trim().replace(
    /^https?:\/\//,
    '',
  );
  const rawPublicOrigin = resolvePublicOrigin(env);
  const redisRestUrl = env.UPSTASH_REDIS_REST_URL?.trim() || undefined;
  const redisRestToken = env.UPSTASH_REDIS_REST_TOKEN?.trim() || undefined;
  const sessionEncryptionKey = env.SESSION_ENCRYPTION_KEY?.trim() || undefined;
  const configuredTmpDir = env.TMP_DIR?.trim();
  const tmpDir = configuredTmpDir
    ? resolve(cwd, configuredTmpDir)
    : env.VERCEL
      ? resolve(tmpdir(), 'ratemysdd')
      : resolve(cwd, '.rmsdd-tmp');
  const sessionStorageSettings = [redisRestUrl, redisRestToken, sessionEncryptionKey];
  const hasAnySessionStorageSetting = sessionStorageSettings.some(Boolean);
  const hasAllSessionStorageSettings = sessionStorageSettings.every(Boolean);
  const testModeValue = env.RMSDD_TEST_MODE?.toLowerCase();

  if (
    env.NODE_ENV === 'production' &&
    env.VERCEL_ENV === 'production' &&
    !configuredPublicOrigin &&
    !vercelProductionHost
  ) {
    throw new ConfigurationError(
      'Configuration invalide. Vérifiez APP_ORIGIN ou VERCEL_PROJECT_PRODUCTION_URL.',
    );
  }

  if (env.NODE_ENV === 'production' && !rawPublicOrigin) {
    throw new ConfigurationError(
      'Configuration invalide. Vérifiez APP_ORIGIN, VERCEL_PROJECT_PRODUCTION_URL ou VERCEL_URL.',
    );
  }

  if (rawPublicOrigin) {
    if (!isHttpsOrigin(rawPublicOrigin)) {
      throw new ConfigurationError('Configuration invalide : APP_ORIGIN doit être une origine HTTPS.');
    }
  }

  if (
    (env.NODE_ENV === 'production' && !hasAllSessionStorageSettings) ||
    (hasAnySessionStorageSetting && !hasAllSessionStorageSettings)
  ) {
    throw new ConfigurationError(
      'Configuration invalide. Vérifiez les paramètres : UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, SESSION_ENCRYPTION_KEY.',
    );
  }

  if (redisRestUrl && new URL(redisRestUrl).protocol !== 'https:') {
    throw new ConfigurationError('Configuration invalide : UPSTASH_REDIS_REST_URL doit utiliser HTTPS.');
  }

  if (
    testModeValue !== undefined &&
    !['1', '0', 'true', 'false'].includes(testModeValue)
  ) {
    throw new ConfigurationError('Configuration invalide : RMSDD_TEST_MODE doit être booléen.');
  }

  const testMode = testModeValue === '1' || testModeValue === 'true';
  if (testMode && env.NODE_ENV !== 'test') {
    throw new ConfigurationError(
      'Configuration invalide : le mode de test est réservé à NODE_ENV=test.',
    );
  }

  const parsed = configurationSchema.safeParse({
    githubOAuthClientId: env.GITHUB_OAUTH_CLIENT_ID,
    copilotModel: env.COPILOT_MODEL,
    reasoningEffort: env.COPILOT_REASONING_EFFORT,
    port: rawPort,
    publicOrigin: rawPublicOrigin,
    redisRestUrl,
    redisRestToken,
    sessionEncryptionKey,
  });

  if (!parsed.success) {
    const labels: Record<string, string> = {
      githubOAuthClientId: 'GITHUB_OAUTH_CLIENT_ID',
      copilotModel: 'COPILOT_MODEL',
      reasoningEffort: 'COPILOT_REASONING_EFFORT',
      port: 'PORT',
      publicOrigin: 'APP_ORIGIN',
      redisRestUrl: 'UPSTASH_REDIS_REST_URL',
      redisRestToken: 'UPSTASH_REDIS_REST_TOKEN',
      sessionEncryptionKey: 'SESSION_ENCRYPTION_KEY',
    };
    const fields = [
      ...new Set(
        parsed.error.issues.map(({ path }) => labels[path.join('.')] ?? path.join('.')),
      ),
    ];
    throw new ConfigurationError(
      `Configuration invalide. Vérifiez les paramètres : ${fields.join(', ')}.`,
    );
  }

  return {
    ...parsed.data,
    publicOrigin: rawPublicOrigin,
    testMode,
    secureCookies: env.NODE_ENV === 'production',
    tmpDir,
  };
}

export function loadConfig(): AppConfig {
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }

  return parseConfig(process.env);
}
