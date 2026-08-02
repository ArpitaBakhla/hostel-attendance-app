/**
 * Server-side encryption utilities for PII fields.
 *
 * Uses AES-256-GCM via the Web Crypto API (available in Deno).
 * The encryption key is derived from an environment variable (ENCRYPTION_MASTER_KEY)
 * which should be a 64-character hex string (32 bytes).
 *
 * In production, this key should be stored in Supabase Vault or a KMS.
 */

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12; // 96 bits for AES-GCM

/**
 * Derives the encryption key from the master key environment variable.
 * Returns a CryptoKey suitable for AES-256-GCM operations.
 */
async function getMasterKey(): Promise<CryptoKey> {
  const hexKey = Deno.env.get('ENCRYPTION_MASTER_KEY');
  if (!hexKey || hexKey.length !== 64) {
    throw new Error(
      'ENCRYPTION_MASTER_KEY must be a 64-character hex string (32 bytes). ' +
      'Generate one with: openssl rand -hex 32',
    );
  }

  const keyBytes = new Uint8Array(
    hexKey.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)),
  );

  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: ALGORITHM, length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 *
 * Returns a base64-encoded string containing the IV + ciphertext.
 * Format: base64(iv[12] + ciphertext[...] + tag[16])
 */
export async function encryptField(plaintext: string): Promise<string> {
  if (!plaintext) return '';

  const key = await getMasterKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded,
  );

  // Prepend IV to ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts a base64-encoded AES-256-GCM ciphertext back to plaintext.
 */
export async function decryptField(encrypted: string): Promise<string> {
  if (!encrypted) return '';

  const key = await getMasterKey();
  const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));

  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Encrypts multiple PII fields in a record.
 * Returns the original record with encrypted versions of specified fields.
 */
export async function encryptPiiFields<T extends Record<string, unknown>>(
  record: T,
  fields: (keyof T)[],
): Promise<T & Record<string, string>> {
  const result = { ...record } as T & Record<string, string>;

  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value) {
      result[`encrypted_${String(field)}`] = await encryptField(value);
    }
  }

  return result;
}

/**
 * Decrypts multiple PII fields from their encrypted counterparts.
 */
export async function decryptPiiFields<T extends Record<string, unknown>>(
  record: T,
  fields: string[],
): Promise<T> {
  const result = { ...record };

  for (const field of fields) {
    const encryptedKey = `encrypted_${field}` as keyof T;
    const encryptedValue = record[encryptedKey];
    if (typeof encryptedValue === 'string' && encryptedValue) {
      (result as Record<string, unknown>)[field] = await decryptField(encryptedValue);
    }
  }

  return result;
}

/**
 * Generates a timing-safe comparison of two strings.
 * Prevents timing attacks on sensitive comparisons (OTP codes, etc.).
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);

  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}
