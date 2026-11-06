import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env'; // adjust to your env module

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1'; // lets you rotate keys later without breaking old rows

const key = Buffer.from(env.ENCRYPTION_KEY, 'base64');
if (key.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes (base64)');

// `context` ties the ciphertext to its owner, e.g. `${userId}:bvn`,
// so a value copied into another row or field fails to decrypt.
export function encryptField(plaintext: string, context: string): string {
  const iv = randomBytes(12); // fresh for every encryption, never reused
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decryptField(payload: string, context: string): string {
  const [version, iv, tag, ciphertext] = payload.split(':');
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new Error('Unsupported encrypted payload');
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

// What API responses may show: *******1234
export const maskIdNumber = (value: string) =>
  `${'*'.repeat(Math.max(value.length - 4, 0))}${value.slice(-4)}`;