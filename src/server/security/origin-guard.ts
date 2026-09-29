import type { FastifyRequest } from 'fastify';
import { AppError } from '../errors.js';

export interface OriginGuardOptions {
  port: number;
  nodeEnv?: string;
  publicOrigin?: string;
}

export function createOriginGuard({
  port,
  nodeEnv = process.env.NODE_ENV,
  publicOrigin,
}: OriginGuardOptions) {
  const hostPorts = nodeEnv === 'production' ? [] : [port];
  if (nodeEnv !== 'production') {
    hostPorts.push(5173);
  }

  const allowedHosts = new Set(
    hostPorts.flatMap((allowedPort) => [
      `127.0.0.1:${allowedPort}`,
      `localhost:${allowedPort}`,
    ]).map((host) => host.toLowerCase()),
  );
  const allowedOrigins = new Set(
    [...allowedHosts].map((host) => `http://${host}`),
  );
  if (publicOrigin) {
    const parsedOrigin = new URL(publicOrigin);
    allowedHosts.add(parsedOrigin.host.toLowerCase());
    allowedOrigins.add(parsedOrigin.origin.toLowerCase());
  }

  return async (request: FastifyRequest): Promise<void> => {
    const host = request.headers.host?.toLowerCase();
    if (!host || !allowedHosts.has(host)) {
      throw new AppError('FORBIDDEN_ORIGIN');
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
      return;
    }

    const origin = request.headers.origin;
  if (!origin || !allowedOrigins.has(origin.toLowerCase())) {
      throw new AppError('FORBIDDEN_ORIGIN');
    }
  };
}
