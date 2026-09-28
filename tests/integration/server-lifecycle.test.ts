import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/server/config.js';
import {
  createServerRuntime,
  startServer,
} from '../../src/server/index.js';

const temporaryDirectories: string[] = [];
let closeRuntime: (() => Promise<void>) | undefined;

afterEach(async () => {
  await closeRuntime?.();
  closeRuntime = undefined;
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'ratemysdd-server-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as AddressInfo;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

function testConfig(tmpDir: string, port = 5178) {
  return parseConfig({
    GITHUB_OAUTH_CLIENT_ID: 'test-client-id',
    NODE_ENV: 'test',
    PORT: String(port),
    RMSDD_TEST_MODE: '1',
    TMP_DIR: tmpDir,
  });
}

describe('server lifecycle', () => {
  it('purges the temporary directory before building the application', async () => {
    const tmpDir = await temporaryDirectory();
    const staleFile = join(tmpDir, 'copilot', 'session-state', 'old-session.json');
    await mkdir(join(tmpDir, 'copilot', 'session-state'), { recursive: true });
    await writeFile(staleFile, 'confidential stale data');

    const runtime = await createServerRuntime(testConfig(tmpDir));
    closeRuntime = () => runtime.close();

    await expect(readFile(staleFile, 'utf8')).rejects.toThrow();
    const response = await runtime.app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { host: '127.0.0.1:5178' },
    });
    expect(response.json()).toEqual({ authenticated: false });
  });

  it('listens only on loopback and serves the local API', async () => {
    const tmpDir = await temporaryDirectory();
    const runtime = await startServer(testConfig(tmpDir, await availablePort()));
    closeRuntime = () => runtime.close();
    const address = runtime.app.server.address() as AddressInfo;

    expect(address.address).toBe('127.0.0.1');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/session`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authenticated: false });
  });
});
