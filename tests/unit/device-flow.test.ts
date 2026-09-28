import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubDeviceFlowClient } from '../../src/server/auth/device-flow.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GitHubDeviceFlowClient', () => {
  it('starts a least-privilege device flow and maps GitHub fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          device_code: 'device-code-secret',
          user_code: 'ABCD-1234',
          verification_uri: 'https://github.com/login/device',
          expires_in: 600,
          interval: 5,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new GitHubDeviceFlowClient('oauth-client-id').start();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://github.com/login/device/code',
      expect.objectContaining({
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: expect.any(URLSearchParams),
      }),
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).toEqual(
      new URLSearchParams({ client_id: 'oauth-client-id', scope: 'read:user' }),
    );
    expect(result).toEqual({
      deviceCode: 'device-code-secret',
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
      expiresIn: 600,
      interval: 5,
    });
  });

  it.each([
    ['authorization_pending', 'pending'],
    ['slow_down', 'slow_down'],
    ['access_denied', 'denied'],
    ['expired_token', 'expired'],
  ] as const)('maps OAuth error %s to %s', async (oauthError, expectedStatus) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: oauthError }), { status: 200 }),
      ),
    );

    await expect(new GitHubDeviceFlowClient('oauth-client-id').poll('device-code')).resolves
      .toEqual({ status: expectedStatus });
  });

  it('returns the access token only for an authorized poll', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: 'access-token-secret',
            token_type: 'bearer',
            scope: 'read:user',
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      new GitHubDeviceFlowClient('oauth-client-id').poll('device-code'),
    ).resolves.toEqual({ status: 'authorized', accessToken: 'access-token-secret' });
  });

  it('fetches only the public GitHub identity fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          login: 'octo',
          name: 'Octo Cat',
          avatar_url: 'https://avatars.example/octo',
          email: 'private@example.test',
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const user = await new GitHubDeviceFlowClient('oauth-client-id').fetchUser(
      'access-token-secret',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/user',
      expect.objectContaining({
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer access-token-secret',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }),
    );
    expect(user).toEqual({
      login: 'octo',
      name: 'Octo Cat',
      avatarUrl: 'https://avatars.example/octo',
    });
    expect(JSON.stringify(user)).not.toContain('private@example.test');
  });

  it('normalizes provider and network failures without exposing details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('secret access-token-secret')),
    );

    await expect(
      new GitHubDeviceFlowClient('oauth-client-id').poll('device-code-secret'),
    ).rejects.toMatchObject({
      code: 'DEVICE_FLOW_ERROR',
      message: 'La connexion à GitHub a échoué. Veuillez réessayer.',
    });
  });
});
