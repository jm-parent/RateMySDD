import type {
  DeviceFlowClient,
  DeviceFlowPoll,
} from '../../src/server/auth/device-flow.js';

export type FakeDevicePoll =
  | { status: 'pending' }
  | { status: 'slow_down' }
  | { status: 'denied' }
  | { status: 'expired' }
  | { status: 'authorized'; accessToken: string };

export class FakeDeviceFlowClient implements DeviceFlowClient {
  private readonly polls: FakeDevicePoll[];
  readonly polledDeviceCodes: string[] = [];

  constructor(
    polls: FakeDevicePoll[] = [
      { status: 'pending' },
      { status: 'authorized', accessToken: 'access-token-secret' },
    ],
  ) {
    this.polls = [...polls];
  }

  async start() {
    return {
      deviceCode: 'device-code-secret',
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
      expiresIn: 600,
      interval: 5,
    };
  }

  async poll(deviceCode: string): Promise<DeviceFlowPoll> {
    this.polledDeviceCodes.push(deviceCode);
    return this.polls.shift() ?? { status: 'expired' };
  }

  async fetchUser(_token: string) {
    void _token;
    return {
      login: 'octo',
      name: 'Octo Cat',
      avatarUrl: 'https://avatars.example/octo',
    };
  }
}
