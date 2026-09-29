import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadConfig } from '../src/server/config.js';
import { createServerRuntime } from '../src/server/index.js';

let runtimePromise: ReturnType<typeof createServerRuntime> | undefined;

async function getRuntime() {
  runtimePromise ??= createServerRuntime(loadConfig()).catch((error: unknown) => {
    runtimePromise = undefined;
    throw error;
  });
  return runtimePromise;
}

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const runtime = await getRuntime();
  runtime.app.server.emit('request', request, response);
}

export const config = {
  api: {
    bodyParser: false,
  },
};