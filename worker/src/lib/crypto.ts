const PBKDF2_ITERATIONS = 100_000;
const HASH_ALGO = 'PBKDF2';
const HASH_BITS = 256;

function bytesToB64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** รูปแบบ: pbkdf2$<iterations>$<salt_b64>$<hash_b64> — ใช้ทั้ง Worker และ migration script */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await importKey(password);
  const hash = await crypto.subtle.deriveBits(
    { name: HASH_ALGO, salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    HASH_BITS
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToB64(salt)}$${bytesToB64(new Uint8Array(hash))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  const salt = b64ToBytes(parts[2]);
  const expected = b64ToBytes(parts[3]);
  const key = await importKey(password);
  const hash = await crypto.subtle.deriveBits(
    { name: HASH_ALGO, salt, iterations, hash: 'SHA-256' },
    key,
    expected.length * 8
  );
  return timingSafeEqual(new Uint8Array(hash), expected);
}

function importKey(password: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(password), HASH_ALGO, false, [
    'deriveBits',
  ]);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function uuid(): string {
  return crypto.randomUUID();
}
