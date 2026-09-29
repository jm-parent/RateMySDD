import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Redis } from '@upstash/redis';
import { buildApp } from './app.js';
import { CopilotSdkEngine } from './audit/copilot-engine.js';
import { GitHubDeviceFlowClient } from './auth/device-flow.js';
import { MemorySessionRepository, SessionStore } from './auth/session-store.js';
import { RedisSessionRepository } from './auth/redis-session-repository.js';
import { SecretBox } from './security/secret-box.js';
import type { AppConfig } from './config.js';
import { ConfigurationError, loadConfig } from './config.js';
import type { AuditEngine } from './audit/engine.js';
import type { DeviceFlowClient } from './auth/device-flow.js';
import { createTestDependencies } from './testing/test-mode.js';

export interface ServerRuntime {
  app: Awaited<ReturnType<typeof buildApp>>;
  engine: AuditEngine;
  sessionStore: SessionStore;
  close(): Promise<void>;
}

export async function createServerRuntime(config: AppConfig): Promise<ServerRuntime> {
  await rm(config.tmpDir, { recursive: true, force: true });
  await mkdir(config.tmpDir, { recursive: true });

  let engine: AuditEngine;
  let deviceFlow: DeviceFlowClient;
  if (config.testMode) {
    ({ engine, deviceFlow } = createTestDependencies());
  } else {
    engine = new CopilotSdkEngine(config);
    deviceFlow = new GitHubDeviceFlowClient(config.githubOAuthClientId);
  }

  const sessionRepository =
    config.redisRestUrl && config.redisRestToken && config.sessionEncryptionKey
      ? new RedisSessionRepository(
          new Redis({
            url: config.redisRestUrl,
            token: config.redisRestToken,
          }),
          new SecretBox(config.sessionEncryptionKey),
        )
      : new MemorySessionRepository();
  const sessionStore = new SessionStore(
    (token) => engine.release(token),
    sessionRepository,
  );
  let app: Awaited<ReturnType<typeof buildApp>>;
  try {
    app = await buildApp({ config, engine, deviceFlow, sessionStore });
    await app.ready();
  } catch (error) {
    if (!sessionStore.persistent) {
      for (const session of await sessionStore.all()) {
        await sessionStore.destroy(session.sessionId);
      }
    }
    await rm(config.tmpDir, { recursive: true, force: true });
    throw error;
  }

  let closed = false;
  return {
    app,
    engine,
    sessionStore,
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      try {
        await app.close();
      } finally {
        try {
          if (!sessionStore.persistent) {
            const sessions = await sessionStore.all();
            await Promise.all(
              sessions.map((session) => sessionStore.destroy(session.sessionId)),
            );
          }
        } finally {
          await rm(config.tmpDir, { recursive: true, force: true });
        }
      }
    },
  };
}

export async function startServer(
  config: AppConfig,
  options: { host?: string } = {},
): Promise<ServerRuntime> {
  const runtime = await createServerRuntime(config);
  try {
    await runtime.app.listen({
      host: options.host ?? '127.0.0.1',
      port: config.port,
    });
  } catch (error) {
    await runtime.close();
    throw error;
  }
  process.stdout.write(`RateMySDD disponible sur http://127.0.0.1:${config.port}\n`);
  return runtime;
}

async function main(): Promise<void> {
  let runtime: ServerRuntime | undefined;
  let shutdownRequested = false;
  let shutdownStarted = false;

  const shutdown = async () => {
    if (shutdownStarted) {
      return;
    }
    shutdownStarted = true;
    if (runtime) {
      await runtime.close();
    } else {
      shutdownRequested = true;
    }
  };
  const onSignal = () => {
    void shutdown().catch(() => {
      process.stderr.write('La fermeture de RateMySDD a rencontré une erreur.\n');
      process.exitCode = 1;
    });
  };

  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    runtime = await startServer(loadConfig());
    if (shutdownRequested) {
      await runtime.close();
    }
  } catch (error) {
    const message =
      error instanceof ConfigurationError
        ? error.message
        : 'RateMySDD n’a pas pu démarrer. Vérifiez sa configuration et réessayez.';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  } finally {
    if (shutdownStarted) {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
    }
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  void main();
}
