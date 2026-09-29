import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigurationError, parseConfig } from '../../src/server/config.js';

describe('parseConfig', () => {
  it('requires a GitHub OAuth client ID and applies safe local defaults', () => {
    expect(
      parseConfig({ GITHUB_OAUTH_CLIENT_ID: 'public-client-id' }, resolve('test-root')),
    ).toMatchObject({
      githubOAuthClientId: 'public-client-id',
      copilotModel: 'gpt-5',
      reasoningEffort: 'medium',
      port: 5178,
      testMode: false,
      tmpDir: resolve('test-root', '.rmsdd-tmp'),
    });
  });

  it('uses the Vercel deployment URL unless an explicit public origin is configured', () => {
    expect(
      parseConfig({
        GITHUB_OAUTH_CLIENT_ID: 'client',
        NODE_ENV: 'production',
        VERCEL_ENV: 'preview',
        VERCEL_URL: 'rate-my-sdd-preview.vercel.app',
        UPSTASH_REDIS_REST_URL: 'https://redis.example.com',
        UPSTASH_REDIS_REST_TOKEN: 'redis-secret',
        SESSION_ENCRYPTION_KEY: '7b'.repeat(32),
      }).publicOrigin,
    ).toBe('https://rate-my-sdd-preview.vercel.app');

    expect(
      parseConfig({
        GITHUB_OAUTH_CLIENT_ID: 'client',
        NODE_ENV: 'production',
        VERCEL_ENV: 'preview',
        VERCEL_URL: 'rate-my-sdd-preview.vercel.app',
        APP_ORIGIN: 'https://rate-my-sdd.vercel.app',
        UPSTASH_REDIS_REST_URL: 'https://redis.example.com',
        UPSTASH_REDIS_REST_TOKEN: 'redis-secret',
        SESSION_ENCRYPTION_KEY: '7b'.repeat(32),
      }).publicOrigin,
    ).toBe('https://rate-my-sdd.vercel.app');
  });

  it('requires the stable canonical origin in production even when VERCEL_URL exists', () => {
    expect(() =>
      parseConfig({
        GITHUB_OAUTH_CLIENT_ID: 'client',
        NODE_ENV: 'production',
        VERCEL_ENV: 'production',
        VERCEL_URL: 'temporary-deployment.vercel.app',
        UPSTASH_REDIS_REST_URL: 'https://redis.example.com',
        UPSTASH_REDIS_REST_TOKEN: 'redis-secret',
        SESSION_ENCRYPTION_KEY: '7b'.repeat(32),
      }),
    ).toThrow(ConfigurationError);
  });

  it('requires shared Redis storage and a 256-bit encryption key in production', () => {
    expect(() =>
      parseConfig({
        GITHUB_OAUTH_CLIENT_ID: 'client',
        NODE_ENV: 'production',
        VERCEL_URL: 'rate-my-sdd.vercel.app',
      }),
    ).toThrow(ConfigurationError);
  });

  it('uses a writable temporary directory for Vercel runtime sessions', () => {
    expect(
      parseConfig(
        { GITHUB_OAUTH_CLIENT_ID: 'client', VERCEL: '1' },
        resolve('deployment-root'),
      ).tmpDir,
    ).toBe(resolve(tmpdir(), 'ratemysdd'));
  });

  it('loads the shared session storage settings without exposing their values in defaults', () => {
    expect(
      parseConfig({
        GITHUB_OAUTH_CLIENT_ID: 'client',
        NODE_ENV: 'production',
        APP_ORIGIN: 'https://rate-my-sdd.vercel.app',
        UPSTASH_REDIS_REST_URL: 'https://redis.example.com',
        UPSTASH_REDIS_REST_TOKEN: 'redis-secret',
        SESSION_ENCRYPTION_KEY: '7b'.repeat(32),
      }),
    ).toMatchObject({
      redisRestUrl: 'https://redis.example.com',
      redisRestToken: 'redis-secret',
      sessionEncryptionKey: '7b'.repeat(32),
    });
  });

  it('rejects a missing OAuth client ID without exposing environment values', () => {
    let message = '';
    try {
      parseConfig({ PRIVATE_VALUE: 'must-not-appear' });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      message = error instanceof Error ? error.message : '';
    }

    expect(message).toContain('GITHUB_OAUTH_CLIENT_ID');
    expect(message).not.toContain('must-not-appear');
  });

  it('rejects invalid ports and reasoning effort values', () => {
    expect(() =>
      parseConfig({ GITHUB_OAUTH_CLIENT_ID: 'client', PORT: '0' }),
    ).toThrow(ConfigurationError);
    expect(() =>
      parseConfig({
        GITHUB_OAUTH_CLIENT_ID: 'client',
        COPILOT_REASONING_EFFORT: 'extreme',
      }),
    ).toThrow(ConfigurationError);
  });

  it('allows the fake engine only in a test environment', () => {
    expect(
      parseConfig({
        GITHUB_OAUTH_CLIENT_ID: 'client',
        NODE_ENV: 'test',
        RMSDD_TEST_MODE: '1',
      }).testMode,
    ).toBe(true);

    expect(() =>
      parseConfig({
        GITHUB_OAUTH_CLIENT_ID: 'client',
        NODE_ENV: 'development',
        RMSDD_TEST_MODE: '1',
      }),
    ).toThrow(ConfigurationError);
  });
});
