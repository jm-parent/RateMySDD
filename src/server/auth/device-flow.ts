import { AppError } from '../errors.js';

export interface DeviceFlowStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export type DeviceFlowPoll =
  | { status: 'pending' }
  | { status: 'slow_down' }
  | { status: 'denied' }
  | { status: 'expired' }
  | { status: 'authorized'; accessToken: string };

export interface DeviceFlowUser {
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface DeviceFlowClient {
  start(): Promise<DeviceFlowStart>;
  poll(deviceCode: string): Promise<DeviceFlowPoll>;
  fetchUser(token: string): Promise<DeviceFlowUser>;
}

interface GitHubDeviceStartResponse {
  device_code?: unknown;
  user_code?: unknown;
  verification_uri?: unknown;
  expires_in?: unknown;
  interval?: unknown;
}

interface GitHubTokenResponse {
  access_token?: unknown;
  error?: unknown;
}

interface GitHubUserResponse {
  login?: unknown;
  name?: unknown;
  avatar_url?: unknown;
}

export class GitHubDeviceFlowClient implements DeviceFlowClient {
  constructor(private readonly clientId: string) {}

  async start(): Promise<DeviceFlowStart> {
    try {
      const response = await fetch('https://github.com/login/device/code', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new URLSearchParams({
          client_id: this.clientId,
          scope: 'read:user',
        }),
      });
      const body = (await response.json()) as GitHubDeviceStartResponse;
      if (
        !response.ok ||
        typeof body.device_code !== 'string' ||
        typeof body.user_code !== 'string' ||
        typeof body.verification_uri !== 'string' ||
        typeof body.expires_in !== 'number' ||
        typeof body.interval !== 'number'
      ) {
        throw new Error('Invalid GitHub device-flow response.');
      }
      return {
        deviceCode: body.device_code,
        userCode: body.user_code,
        verificationUri: body.verification_uri,
        expiresIn: body.expires_in,
        interval: body.interval,
      };
    } catch (error) {
      throw new AppError('DEVICE_FLOW_ERROR', { cause: error });
    }
  }

  async poll(deviceCode: string): Promise<DeviceFlowPoll> {
    try {
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new URLSearchParams({
          client_id: this.clientId,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });
      const body = (await response.json()) as GitHubTokenResponse;
      if (body.error === 'authorization_pending') {
        return { status: 'pending' };
      }
      if (body.error === 'slow_down') {
        return { status: 'slow_down' };
      }
      if (body.error === 'access_denied') {
        return { status: 'denied' };
      }
      if (body.error === 'expired_token') {
        return { status: 'expired' };
      }
      if (response.ok && typeof body.access_token === 'string' && body.access_token) {
        return { status: 'authorized', accessToken: body.access_token };
      }
      throw new Error('Invalid GitHub device-flow poll response.');
    } catch (error) {
      throw new AppError('DEVICE_FLOW_ERROR', { cause: error });
    }
  }

  async fetchUser(token: string): Promise<DeviceFlowUser> {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      const body = (await response.json()) as GitHubUserResponse;
      if (
        !response.ok ||
        typeof body.login !== 'string' ||
        (body.name !== null && typeof body.name !== 'string') ||
        (body.avatar_url !== null && typeof body.avatar_url !== 'string')
      ) {
        throw new Error('Invalid GitHub user response.');
      }
      return {
        login: body.login,
        name: body.name as string | null,
        avatarUrl: body.avatar_url as string | null,
      };
    } catch (error) {
      throw new AppError('DEVICE_FLOW_ERROR', { cause: error });
    }
  }
}
