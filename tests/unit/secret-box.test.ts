import { describe, expect, it } from 'vitest';
import { SecretBox } from '../../src/server/security/secret-box.js';

const key = '7b'.repeat(32);

describe('SecretBox', () => {
  it('encrypts secrets and decrypts them only with the same key', () => {
    const first = new SecretBox(key);
    const second = new SecretBox(key);
    const encrypted = first.encrypt('github-access-token');

    expect(encrypted).not.toContain('github-access-token');
    expect(second.decrypt(encrypted)).toBe('github-access-token');
  });

  it('rejects malformed keys and altered ciphertext', () => {
    expect(() => new SecretBox('too-short')).toThrow();

    const encrypted = new SecretBox(key).encrypt('device-code');
    const altered = `${encrypted.slice(0, -1)}${encrypted.endsWith('A') ? 'B' : 'A'}`;

    expect(() => new SecretBox('8b'.repeat(32)).decrypt(encrypted)).toThrow();
    expect(() => new SecretBox(key).decrypt(altered)).toThrow();
  });
});