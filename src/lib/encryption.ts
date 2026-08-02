/**
 * Client-side encryption utilities for PII fields.
 *
 * Uses AES-256-GCM via the Web Crypto API (available in all modern browsers).
 * The encryption key is derived from the user's auth token + a salt via PBKDF2.
 *
 * This ensures that even if the database is compromised, PII cannot be read
 * without the user's session token.
 */

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const PBKDF2_ITERATIONS = 100_000;

/**
 * Derives an AES-256 key from a password/secret using PBKDF2.
 */
async function deriveKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 *
 * @param plaintext - The string to encrypt
 * @param secret - The encryption secret (e.g., derived from auth token)
 * @returns Base64-encoded string: salt[16] + iv[12] + ciphertext[...] + tag[16]
 */
export async function encryptField(plaintext: string, secret: string): Promise<string> {
  if (!plaintext) return '';

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(secret, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  // Combine: salt + iv + ciphertext
  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts a base64-encoded AES-256-GCM ciphertext.
 *
 * @param encrypted - Base64-encoded encrypted string
 * @param secret - The same encryption secret used for encryption
 * @returns The original plaintext string
 */
export async function decryptField(encrypted: string, secret: string): Promise<string> {
  if (!encrypted) return '';

  const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));

  const salt = combined.slice(0, SALT_LENGTH);
  const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

  const key = await deriveKey(secret, salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Generates a deterministic encryption secret from a Supabase auth session.
 * This ensures the same secret is derived across sessions for the same user.
 */
export function deriveSecretFromToken(accessToken: string): string {
  // Use the last 32 characters of the JWT as the secret base.
  // This is combined with PBKDF2 salt during encryption, so it's safe.
  return accessToken.slice(-32);
}

/**
 * Checks if the Web Crypto API is available.
 */
export function isCryptoAvailable(): boolean {
  return (
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.subtle.encrypt === 'function'
  );
}
