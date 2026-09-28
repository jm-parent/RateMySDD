import type { FastifyRequest } from 'fastify';
import { AppError } from '../errors.js';

export interface OriginGuardOptions {
  port: number;
  nodeEnv?: string;
}

export function createOriginGuard({
  port,
  nodeEnv = process.env.NODE_ENV,
}: OriginGuardOptions) {
  const hostPorts = [port];
  if (nodeEnv !== 'production') {
    hostPorts.push(5173);
  }

  const allowedHosts = new Set(
    hostPorts.flatMap((allowedPort) => [
      `127.0.0.1:${allowedPort}`,
      `localhost:${allowedPort}`,
    ]),
  );
  const allowedOrigins = new Set(
    [...allowedHosts].map((host) => `http://${host}`),
  );

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
