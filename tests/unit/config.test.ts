import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
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
