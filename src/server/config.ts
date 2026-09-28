import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const configurationSchema = z.object({
  githubOAuthClientId: z.string().trim().min(1, 'GITHUB_OAUTH_CLIENT_ID est requis.'),
  copilotModel: z.string().trim().min(1).default('gpt-5'),
  reasoningEffort: z.enum(['low', 'medium', 'high']).default('medium'),
  port: z.number().int().min(1024).max(65_535).default(5178),
});

export type AppConfig = z.infer<typeof configurationSchema> & {
  tmpDir: string;
  testMode: boolean;
};

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export function parseConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): AppConfig {
  const rawPort =
    env.PORT === undefined || env.PORT.trim() === '' ? undefined : Number(env.PORT);
  const testModeValue = env.RMSDD_TEST_MODE?.toLowerCase();

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
  });

  if (!parsed.success) {
    const labels: Record<string, string> = {
      githubOAuthClientId: 'GITHUB_OAUTH_CLIENT_ID',
      copilotModel: 'COPILOT_MODEL',
      reasoningEffort: 'COPILOT_REASONING_EFFORT',
      port: 'PORT',
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
    testMode,
    tmpDir: resolve(cwd, env.TMP_DIR?.trim() || '.rmsdd-tmp'),
  };
}

export function loadConfig(): AppConfig {
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }

  return parseConfig(process.env);
}
