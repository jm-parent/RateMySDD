import type { AuditEngine } from './audit/engine.js';
import type { AppConfig } from './config.js';
import type { DeviceFlowClient } from './auth/device-flow.js';
import type { AuditorSession, SessionStore } from './auth/session-store.js';

declare module 'fastify' {
  interface FastifyInstance {
    rateMySDD: {
      config: AppConfig;
      engine: AuditEngine;
      deviceFlow: DeviceFlowClient;
      sessionStore: SessionStore;
    };
  }

  interface FastifyRequest {
    auditor?: AuditorSession;
  }
}

export {};
