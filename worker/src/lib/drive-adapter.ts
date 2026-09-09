import type { Env } from '../env';

const DRIVE_FILE_ID = /^[A-Za-z0-9_-]+$/;
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif']);
const ADAPTER_TIMEOUT_MS = 15_000;

export interface DriveUploadResult {
  driveFileId: string;
  driveUrl: string;
  thumbnailUrl: string;
  mimeType: string;
  size: number;
}

export interface DriveUploadInput {
  shopId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  idempotencyKey?: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

/** Validate the untrusted adapter response before it becomes a public image URL. */
export function parseDriveAdapterResponse(body: unknown): DriveUploadResult {
  if (!body || typeof body !== 'object') throw new Error('Drive adapter returned invalid JSON.');
  const data = body as Record<string, unknown>;
  if (data.success !== true) {
    throw new Error(String(data.message || 'Drive adapter rejected the upload.'));
  }
  const driveFileId = String(data.driveFileId || '').trim();
  const mimeType = String(data.mimeType || '').trim().toLowerCase();
  const size = Number(data.fileSize);
  if (!DRIVE_FILE_ID.test(driveFileId)) throw new Error('Drive adapter returned an invalid file ID.');
  if (!IMAGE_MIME_TYPES.has(mimeType)) throw new Error('Drive adapter returned an invalid image MIME type.');
  if (!Number.isSafeInteger(size) || size <= 0) throw new Error('Drive adapter returned an invalid file size.');
  return {
    driveFileId,
    driveUrl: `https://drive.google.com/file/d/${driveFileId}/view`,
    thumbnailUrl: `https://lh3.googleusercontent.com/d/${driveFileId}=w800`,
    mimeType,
    size,
  };
}

export async function uploadDriveImage(env: Env, input: DriveUploadInput): Promise<DriveUploadResult> {
  const adapterUrl = String(env.GAS_DRIVE_ADAPTER_URL || '').trim();
  const adapterToken = String(env.GAS_DRIVE_ADAPTER_TOKEN || '').trim();
  if (!adapterUrl || !adapterToken) {
    throw new Error('Drive image storage is not configured.');
  }
  let endpoint: URL;
  try {
    endpoint = new URL(adapterUrl);
  } catch {
    throw new Error('Drive adapter URL is invalid.');
  }
  if (endpoint.protocol !== 'https:' && endpoint.hostname !== 'localhost' && endpoint.hostname !== '127.0.0.1') {
    throw new Error('Drive adapter URL must use HTTPS.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ADAPTER_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'upload',
        token: adapterToken,
        shopId: input.shopId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        base64: bytesToBase64(input.bytes),
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      }),
      signal: controller.signal,
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error('Drive adapter returned a non-JSON response.');
    }
    if (!response.ok) throw new Error(`Drive adapter HTTP ${response.status}.`);
    const result = parseDriveAdapterResponse(body);
    if (result.size !== input.bytes.length) throw new Error('Drive adapter returned a mismatched file size.');
    return result;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Drive adapter timed out.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
