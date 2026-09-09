import type { Env } from '../env';
import {
  getActiveSessionResult,
  isValidGuestAccess,
  currentUserName,
} from '../lib/auth';
import { jsonResponse, readBody, str } from '../lib/http';
import { nextSequenceId } from '../lib/products';
import { decodeBase64Payload, storeImage } from '../lib/images';

/** uploadGalleryImage — ตรงจาก Code.gs บรรทัด 1420–1486
 *  MIME เดิมถูก force เป็น image/jpeg; ที่นี่ sniff จาก magic bytes แทน
 *  (ค่าที่บันทึกลง gallery ยังอยู่ในเซ็ตเดิม image/jpeg|png|gif) */
export async function handleUploadGalleryImage(request: Request, env: Env): Promise<Response> {
  try {
    const origin = new URL(request.url).origin;
    const payload = (await readBody(request)) as Record<string, unknown>;
    const token = payload && payload.token ? str(payload.token) : null;
    const guestAccessKey = payload && payload.guestAccessKey ? str(payload.guestAccessKey) : '';
    const authResult = await getActiveSessionResult(env, token);
    if (authResult.error) return jsonResponse(authResult.error, 200, env);
    const session = authResult.session;
    const userName = currentUserName(session);
    const shopId = str(payload.shopId).trim();
    const productId = str(payload.productId).trim();
    const fileBaseName =
      str(payload.fileName || 'upload.jpg')
        .trim()
        .replace(/\.[^/.]+$/, '') || 'upload';
    const imageRole = str(payload.imageRole || 'gallery').trim() || 'gallery';
    const sortOrder = payload.sortOrder !== null && payload.sortOrder !== undefined ? payload.sortOrder : '';
    const status = str(payload.status || 'ACTIVE').trim() || 'ACTIVE';
    const bytes = decodeBase64Payload(
      str(payload.base64 || payload.dataUrl || payload.content)
    );

    if (!shopId) return jsonResponse({ success: false, message: 'shopId is required.' }, 200, env);
    if ((!session || !session.username) && !(await isValidGuestAccess(env, shopId, guestAccessKey))) {
      return jsonResponse({ success: false, message: 'กรุณาเข้าสู่ระบบก่อนอัปโหลดรูป' }, 200, env);
    }

    const idempotencyKey = str(payload.idempotencyKey).trim();
    const stored = await storeImage(env, shopId, fileBaseName, bytes, 'upload', '', idempotencyKey);
    if (stored.storage === 'drive' && idempotencyKey) {
      const existing = await env.DB.prepare(
        `SELECT gallery_id, drive_url, thumbnail_url FROM shop_gallery
         WHERE shop_id = ? AND drive_file_id = ? LIMIT 1`
      )
        .bind(shopId, stored.driveFileId)
        .first<{ gallery_id: string; drive_url: string; thumbnail_url: string }>();
      if (existing) {
        return jsonResponse(
          {
            success: true,
            galleryId: existing.gallery_id,
            shopId,
            driveFileId: stored.driveFileId,
            driveUrl: existing.drive_url || stored.driveUrl,
            thumbnailUrl: existing.thumbnail_url || stored.thumbnailUrl,
          },
          200,
          env
        );
      }
    }
    const galleryId = await nextSequenceId(env.DB, 'GAL', 'GAL-');
    const now = new Date().toISOString();
    const extension = stored.mimeType === 'image/png' ? 'png' : stored.mimeType === 'image/gif' ? 'gif' : 'jpg';
    const displayName = `${fileBaseName}.${extension}`;
    const driveUrl = stored.storage === 'drive' ? stored.driveUrl : `${origin}/images/${stored.key}`;
    const thumbnailUrl = stored.storage === 'drive' ? stored.thumbnailUrl : driveUrl;
    const driveFileId = stored.storage === 'drive' ? stored.driveFileId : '';
    const result = await env.DB.prepare(
      `INSERT INTO shop_gallery (gallery_id, shop_id, product_id, image_role, display_name,
       drive_file_id, drive_url, thumbnail_url, mime_type, file_size, width, height,
       sort_order, status, created_at, created_by, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        galleryId,
        shopId,
        productId,
        imageRole,
        displayName,
        driveFileId,
        driveUrl,
        thumbnailUrl,
        stored.mimeType,
        stored.size,
        sortOrder,
        status,
        now,
        userName,
        now,
        userName
      )
      .run();
    if (!result.success) throw new Error('insert gallery row failed');
    return jsonResponse(
      {
        success: true,
        galleryId,
        shopId,
        driveFileId: stored.storage === 'drive' ? stored.driveFileId : stored.key,
        driveUrl,
        thumbnailUrl,
      },
      200,
      env
    );
  } catch (err) {
    return jsonResponse(
      {
        success: false,
        message: `Failed to upload image: ${err instanceof Error ? err.message : String(err)}`,
      },
      200,
      env
    );
  }
}

/** softDeleteGalleryImage — ตรงจาก Code.gs บรรทัด 1627–1669
 *  guest ต้องมี guestAccessKey ของร้านนั้นและ ShopID ของรูปต้องตรง */
export async function handleSoftDeleteGalleryImage(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const payload = (await readBody(request)) as Record<string, unknown>;
    const token = payload && payload.token ? str(payload.token) : null;
    const guestAccessKey = payload && payload.guestAccessKey ? str(payload.guestAccessKey) : '';
    const galleryId = str(payload.galleryId).trim();
    const shopScope = str(payload.backendId || payload.shopId).trim();
    const authResult = await getActiveSessionResult(env, token);
    if (authResult.error) return jsonResponse(authResult.error, 200, env);
    const session = authResult.session;
    if (!galleryId) {
      return jsonResponse({ success: false, message: 'galleryId is required.' }, 200, env);
    }
    const row = await env.DB.prepare(
      `SELECT shop_id, status FROM shop_gallery WHERE gallery_id = ?`
    )
      .bind(galleryId)
      .first<{ shop_id: string; status: string }>();
    if (!row) {
      return jsonResponse({ success: false, message: 'ไม่พบรูปภาพในระบบ' }, 200, env);
    }
    const isGuestScoped = !session || !session.username;
    if (isGuestScoped) {
      const validGuest =
        !!shopScope &&
        (await isValidGuestAccess(env, shopScope, guestAccessKey)) &&
        row.shop_id === shopScope;
      if (!validGuest) {
        return jsonResponse({ success: false, message: 'กรุณาเข้าสู่ระบบก่อนลบรูป' }, 200, env);
      }
    }
    const now = new Date().toISOString();
    const result = await env.DB.prepare(
      `UPDATE shop_gallery SET status = 'DELETED', updated_at = ?, updated_by = ?
       WHERE gallery_id = ?`
    )
      .bind(now, currentUserName(session), galleryId)
      .run();
    if (!result.success) throw new Error('soft delete failed');
    return jsonResponse({ success: true, message: 'ลบรูปภาพสำเร็จ' }, 200, env);
  } catch (err) {
    return jsonResponse(
      {
        success: false,
        message: `Failed to delete image: ${err instanceof Error ? err.message : String(err)}`,
      },
      200,
      env
    );
  }
}
