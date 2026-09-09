import type { Env } from '../env';
import { uploadDriveImage } from './drive-adapter';

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
  storage: 'r2' | 'drive';
  key: string;
  size: number;
  mimeType: string;
  driveFileId: string;
  driveUrl: string;
  thumbnailUrl: string;
}

/** เก็บรูปใต้โฟลเดอร์ร้านตาม storage ที่ตั้งค่าไว้; R2 จะลงทะเบียนใน r2_objects
 *  key: shops/<shopId>/<galleryId>.<ext> */
export async function storeImage(
  env: Env,
  shopId: string,
  fileName: string,
  bytes: Uint8Array,
  source: 'legacy_base64' | 'drive' | 'upload',
  sourceRef = '',
  idempotencyKey = ''
): Promise<StoredImage> {
  const mime = sniffImageMime(bytes);
  if (!mime) throw new Error('Unsupported image format.');
  if (bytes.length === 0) throw new Error('Image payload is empty.');
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('Image is too large.');
  const ext = mime === 'image/png' ? 'png' : mime === 'image/gif' ? 'gif' : 'jpg';
  const safeShop = String(shopId || 'Unassigned').replace(/[^A-Za-z0-9._-]/g, '_');
  const safeName = String(fileName || 'upload').replace(/[^A-Za-z0-9._-]/g, '_');
  const key = `shops/${safeShop}/${safeName}.${ext}`;
  const storage = String(env.IMAGE_STORAGE || 'r2').trim().toLowerCase();
  if (storage === 'drive') {
    const stored = await uploadDriveImage(env, {
      shopId: safeShop,
      fileName: key.split('/').pop() || `upload.${ext}`,
      mimeType: mime,
      bytes,
      idempotencyKey,
    });
    return {
      storage: 'drive',
      key: '',
      size: stored.size,
      mimeType: stored.mimeType,
      driveFileId: stored.driveFileId,
      driveUrl: stored.driveUrl,
      thumbnailUrl: stored.thumbnailUrl,
    };
  }
  if (storage !== 'r2') throw new Error(`Unsupported image storage: ${storage}`);
  if (!env.ASSETS) throw new Error('R2 image storage is not configured.');
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
  return {
    storage: 'r2',
    key,
    size: bytes.length,
    mimeType: mime,
    driveFileId: '',
    driveUrl: '',
    thumbnailUrl: '',
  };
}
