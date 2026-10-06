import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createFieldCipher, DecryptionError } from './field-cipher.js';

const key = randomBytes(32);
const cipher = createFieldCipher(key);
const context = 'visit:0199a8f2-0000-7000-8000-000000000001:note';
// Synthetic text only.
const plaintext = 'Patient reports a dry cough for three days. No fever. Température: 36,8 °C ✓';

/** Replaces one dot-separated part of an envelope (0 version, 1 iv, 2 tag, 3 ciphertext). */
function withPart(envelope: string, index: number, change: (part: string) => string): string {
  return envelope
    .split('.')
    .map((part, i) => (i === index ? change(part) : part))
    .join('.');
}

/** Flips the first character, which always changes the decoded bytes. */
const corrupt = (part: string): string => (part.startsWith('A') ? 'B' : 'A') + part.slice(1);

describe('field cipher', () => {
  it('round-trips text, including non-ASCII characters', () => {
    expect(cipher.decrypt(cipher.encrypt(plaintext, context), context)).toBe(plaintext);
  });

  it('round-trips an empty string', () => {
    expect(cipher.decrypt(cipher.encrypt('', context), context)).toBe('');
  });

  it('writes a versioned envelope that does not contain the plaintext', () => {
    const envelope = cipher.encrypt(plaintext, context);

    expect(envelope).toMatch(/^v1\.[\w-]{16}\.[\w-]{22}\.[\w-]+$/);
    expect(envelope).not.toContain('cough');
    expect(Buffer.from(envelope.split('.')[3] ?? '', 'base64url').toString('utf8')).not.toContain(
      'cough',
    );
  });

  it('uses a fresh nonce, so equal plaintexts produce different envelopes', () => {
    expect(cipher.encrypt(plaintext, context)).not.toBe(cipher.encrypt(plaintext, context));
  });

  it('rejects a modified ciphertext', () => {
    const tampered = withPart(cipher.encrypt(plaintext, context), 3, corrupt);

    expect(() => cipher.decrypt(tampered, context)).toThrow(DecryptionError);
  });

  it('rejects a modified auth tag', () => {
    const tampered = withPart(cipher.encrypt(plaintext, context), 2, corrupt);

    expect(() => cipher.decrypt(tampered, context)).toThrow(DecryptionError);
  });

  it('rejects a truncated auth tag', () => {
    const tampered = withPart(cipher.encrypt(plaintext, context), 2, (tag) => tag.slice(0, 6));

    expect(() => cipher.decrypt(tampered, context)).toThrow(DecryptionError);
  });

  it('rejects a modified nonce', () => {
    const tampered = withPart(cipher.encrypt(plaintext, context), 1, corrupt);

    expect(() => cipher.decrypt(tampered, context)).toThrow(DecryptionError);
  });

  it('rejects a value moved to another row or field', () => {
    const envelope = cipher.encrypt(plaintext, context);

    expect(() => cipher.decrypt(envelope, context.replace(':note', ':transcript'))).toThrow(
      DecryptionError,
    );
  });

  it('rejects a value encrypted under another key', () => {
    const envelope = createFieldCipher(randomBytes(32)).encrypt(plaintext, context);

    expect(() => cipher.decrypt(envelope, context)).toThrow(DecryptionError);
  });

  it.each([
    ['an unknown version', (envelope: string) => withPart(envelope, 0, () => 'v2')],
    ['a missing part', (envelope: string) => envelope.split('.').slice(0, 3).join('.')],
    ['an extra part', (envelope: string) => `${envelope}.AAAA`],
    ['plain text', () => plaintext],
    ['an empty string', () => ''],
  ])('rejects %s', (_label, mangle) => {
    const mangled = mangle(cipher.encrypt(plaintext, context));

    expect(() => cipher.decrypt(mangled, context)).toThrow(DecryptionError);
  });

  it('reveals nothing about the value or the cause when decryption fails', () => {
    const tampered = withPart(cipher.encrypt(plaintext, context), 3, corrupt);

    try {
      cipher.decrypt(tampered, context);
      expect.unreachable('decrypt should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DecryptionError);
      expect((error as Error).message).toBe('Unable to decrypt field');
      expect((error as Error).cause).toBeUndefined();
    }
  });

  it.each([16, 31, 33])('refuses a %i-byte key', (length) => {
    expect(() => createFieldCipher(randomBytes(length))).toThrow(/exactly 32 bytes/);
  });
});
