import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { SafeError } from './safe-error.js';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const KEY_BYTES = 32;
/** 96 bits: the nonce size GCM is specified for. A fresh random one is drawn per encryption. */
const IV_BYTES = 12;
const TAG_BYTES = 16;
const SEPARATOR = '.';

export type FieldCipher = {
  /**
   * Encrypts one field. `context` names where the value lives (for example
   * `visit:<id>:note`). It is authenticated but not stored, so a ciphertext
   * copied into another row or column fails to decrypt.
   */
  encrypt: (plaintext: string, context: string) => string;
  /** Reverses `encrypt`. Throws `DecryptionError` on any mismatch or tampering. */
  decrypt: (envelope: string, context: string) => string;
};

/** Carries no detail on purpose: the cause must never surface in a log or an API response. */
export class DecryptionError extends SafeError {
  constructor() {
    super('Unable to decrypt field');
    this.name = 'DecryptionError';
  }
}

/**
 * AES-256-GCM encryption for individual database fields.
 *
 * Envelope: `v1.<iv>.<auth tag>.<ciphertext>`, each part base64url. The version
 * prefix leaves room to change the algorithm or rotate the key without guessing
 * how an old value was written.
 */
export function createFieldCipher(key: Buffer): FieldCipher {
  if (key.length !== KEY_BYTES) {
    throw new Error(`Field encryption key must be exactly ${String(KEY_BYTES)} bytes`);
  }

  return {
    encrypt: (plaintext, context) => {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
      cipher.setAAD(Buffer.from(context, 'utf8'));
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

      return [VERSION, ...[iv, cipher.getAuthTag(), ciphertext].map(toBase64Url)].join(SEPARATOR);
    },

    decrypt: (envelope, context) => {
      const [version, iv, tag, ciphertext, ...rest] = envelope.split(SEPARATOR);
      if (
        version !== VERSION ||
        iv === undefined ||
        tag === undefined ||
        ciphertext === undefined ||
        rest.length > 0
      ) {
        throw new DecryptionError();
      }

      try {
        const decipher = createDecipheriv(ALGORITHM, key, fromBase64Url(iv), {
          authTagLength: TAG_BYTES,
        });
        decipher.setAAD(Buffer.from(context, 'utf8'));
        decipher.setAuthTag(fromBase64Url(tag));

        return Buffer.concat([
          decipher.update(fromBase64Url(ciphertext)),
          decipher.final(),
        ]).toString('utf8');
      } catch {
        throw new DecryptionError();
      }
    },
  };
}

function toBase64Url(bytes: Buffer): string {
  return bytes.toString('base64url');
}

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}
