import type { Env } from '../env';

/** คัดลอกพฤติกรรม decodeBase64Payload_: ตัด prefix ก่อน 'base64,' แล้ว decode */
export function decodeBase64Payload(rawContent: string): Uint8Array {
  const text = String(rawContent || '');
  const base64 = text.indexOf('base64,') >= 0 ? text.split('base64,')[1] : text;
  if (!base64) throw new Error('Image payload is empty.');
  const binary = atob(base64.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const MAGIC_JPEG = [0xff, 0xd8, 0xff];
const MAGIC_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAGIC_GIF = [0x47, 0x49, 0x46, 0x38];

/** magic-byte check ตาม isPdfSupportedImageBlob_ — ป้องกัน invalid upload */
export function sniffImageMime(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/gif' | null {
  const startsWith = (magic: number[]): boolean => magic.every((b, i) => bytes[i] === b);
  if (startsWith(MAGIC_JPEG)) return 'image/jpeg';
  if (startsWith(MAGIC_PNG)) return 'image/png';
  if (startsWith(MAGIC_GIF)) return 'image/gif';
  return null;
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export interface StoredImage {
  key: string;
  size: number;
  mimeType: string;
  driveFileId?: string;
  driveUrl?: string;
  thumbnailUrl?: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

async function storeImageInDriveAdapter(
  env: Env,
  shopId: string,
  fileName: string,
  bytes: Uint8Array,
  mime: string,
  ext: string,
  source: string,
  sourceRef: string
): Promise<StoredImage> {
  const adapterUrl = String(env.GAS_DRIVE_ADAPTER_URL || '').trim();
  const adapterToken = String(env.GAS_DRIVE_ADAPTER_TOKEN || '').trim();
  if (!adapterToken) throw new Error('Drive adapter token is not configured.');

  let endpoint: URL;
  try {
    endpoint = new URL(adapterUrl);
  } catch {
    throw new Error('Drive adapter URL is invalid.');
  }
  if (endpoint.protocol !== 'https:') throw new Error('Drive adapter URL must use HTTPS.');

  const contentHash = await sha256Hex(bytes);
  const idempotencyBase = String(sourceRef || '').trim() || `${source}:${safeShopId(shopId)}:${fileName}`;
  const idempotencyKey = `${idempotencyBase}:${contentHash}`.slice(0, 220);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'upload',
        token: adapterToken,
        shopId,
        fileName: `${fileName}.${ext}`,
        mimeType: mime,
        idempotencyKey,
        base64: bytesToBase64(bytes),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Drive adapter request timed out.');
    }
    throw new Error('Drive adapter request failed.');
  } finally {
    clearTimeout(timeout);
  }

  let result: Record<string, unknown> | null = null;
  try {
    result = (await response.json()) as Record<string, unknown>;
  } catch {
    result = null;
  }
  if (!response.ok || !result || result.success !== true) {
    const message = result && typeof result.message === 'string' ? result.message : `Drive adapter request failed (${response.status}).`;
    throw new Error(message.slice(0, 240));
  }

  const driveFileId = String(result.driveFileId || '').trim();
  const driveUrl = String(result.driveUrl || '').trim();
  const thumbnailUrl = String(result.thumbnailUrl || '').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(driveFileId) || !/^https:\/\//.test(driveUrl)) {
    throw new Error('Drive adapter returned an invalid file reference.');
  }
  return {
    key: driveFileId,
    size: bytes.length,
    mimeType: mime,
    driveFileId,
    driveUrl,
    thumbnailUrl: /^https:\/\//.test(thumbnailUrl)
      ? thumbnailUrl
      : `https://lh3.googleusercontent.com/d/${driveFileId}=w800`,
  };
}

function safeShopId(value: string): string {
  return String(value || 'Unassigned').replace(/[^A-Za-z0-9._-]/g, '_');
}

/** เก็บรูปผ่าน Drive Adapter ใน production หรือใช้ R2 สำหรับ local/staging legacy mode.
 *  key ยังคงคืนค่าไว้เพื่อ compatibility กับโค้ดที่ยังอ่านรูปจาก R2 */
export async function storeImage(
  env: Env,
  shopId: string,
  fileName: string,
  bytes: Uint8Array,
  source: 'legacy_base64' | 'drive' | 'upload',
  sourceRef = ''
): Promise<StoredImage> {
  const mime = sniffImageMime(bytes);
  if (!mime) throw new Error('Unsupported image format.');
  if (bytes.length === 0) throw new Error('Image payload is empty.');
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('Image is too large.');
  const ext = mime === 'image/png' ? 'png' : mime === 'image/gif' ? 'gif' : 'jpg';
  const safeShop = safeShopId(shopId);
  const safeName = String(fileName || 'upload')
    .trim()
    .replace(/\.[^/.]+$/, '')
    .replace(/[^A-Za-z0-9._-]/g, '_') || 'upload';
  const key = `shops/${safeShop}/${safeName}.${ext}`;

  if (String(env.GAS_DRIVE_ADAPTER_URL || '').trim()) {
    return storeImageInDriveAdapter(env, shopId, safeName, bytes, mime, ext, source, sourceRef);
  }
  if (!env.ASSETS) throw new Error('Image storage is not configured.');
  await env.ASSETS.put(key, bytes, {
    httpMetadata: { contentType: mime },
  });
  await env.DB.prepare(
    `INSERT INTO r2_objects (object_key, source, source_ref, shop_id, mime_type, file_size)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(object_key) DO UPDATE SET source = excluded.source,
       source_ref = excluded.source_ref, mime_type = excluded.mime_type,
       file_size = excluded.file_size`
  )
    .bind(key, source, sourceRef, safeShop, mime, bytes.length)
    .run();
  return { key, size: bytes.length, mimeType: mime };
}
