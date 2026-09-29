import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class SecretBox {
  private readonly key: Buffer;

  constructor(hexKey: string) {
    if (!/^[\da-f]{64}$/i.test(hexKey)) {
      throw new Error('SESSION_ENCRYPTION_KEY must be 64 hexadecimal characters.');
    }
    this.key = Buffer.from(hexKey, 'hex');
  }

  encrypt(value: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.');
  }

  decrypt(envelope: string): string {
    const parts = envelope.split('.');
    if (parts.length !== 3) {
      throw new Error('Stored secret is invalid.');
    }
    const [encodedIv, encodedTag, encodedCiphertext] = parts;
    const iv = Buffer.from(encodedIv!, 'base64url');
    const tag = Buffer.from(encodedTag!, 'base64url');
    const ciphertext = Buffer.from(encodedCiphertext!, 'base64url');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new Error('Stored secret is invalid.');
    }

    try {
      const decipher = createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error('Stored secret could not be decrypted.');
    }
  }
}