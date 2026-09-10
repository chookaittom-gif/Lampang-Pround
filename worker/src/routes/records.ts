import type { Env } from '../env';
import {
  getActiveSessionResult,
  isValidGuestAccess,
  issueGuestAccessKey,
  checkOwnership,
  currentUserName,
  type Session,
} from '../lib/auth';
import { jsonResponse, readBody, str } from '../lib/http';
import { normalizePhoneValue, parseJsonArray } from '../lib/format';
import { normalizeProductItems, summarizeProductItems, nextSequenceId, generateLamproundId } from '../lib/products';
import { decodeBase64Payload, storeImage } from '../lib/images';
import {
  legacyRecordToApi,
  productRowToApi,
  galleryRowToApi,
  UPDATE_FIELD_MAP,
} from '../lib/legacy';

const LEGACY_COLS = `
  backend_id, lampround_id, business_name, owner_name, phone, line_id, facebook,
  website, location_text, latitude, longitude, business_type, product_category,
  business_level, main_products, production_capacity, sales_channel, avg_price,
  business_status, potential_level, issues, support_needed, image_shop_ref,
  image_product_ref, image_activity_ref, note, shop_history, created_at,
  created_by, is_deleted, deleted_at, deleted_by`;

interface LegacyRowRaw {
  [key: string]: unknown;
}

function isDeletedFlag(value: unknown): boolean {
  // คัดลอกตรงจาก isRowDeleted_: 'true' | '1' | 'yes' (case-insensitive)
  return ['true', '1', 'yes'].includes(String(value ?? '').trim().toLowerCase());
}

async function getLegacyByBackendId(
  env: Env,
  backendId: string
): Promise<LegacyRowRaw | null> {
  return env.DB.prepare(`SELECT ${LEGACY_COLS} FROM legacy_records WHERE backend_id = ?`)
    .bind(backendId)
    .first<LegacyRowRaw>();
}

/** ถ้าค่ารูปเป็น data URL → ย้ายไป storage ที่ตั้งค่าไว้, อื่น ๆ คืนตามเดิม (URL/empty) */
async function resolveImageRef(
  env: Env,
  shopId: string,
  value: unknown,
  name: string
): Promise<string> {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.startsWith('data:image/')) {
    const bytes = decodeBase64Payload(text);
    const stored = await storeImage(env, shopId, name, bytes, 'legacy_base64', name);
    return stored.storage === 'drive' ? stored.driveUrl : stored.key;
  }
  return text;
}

/** คัดลอกพฤติกรรม replaceProductsByShopId (บรรทัด 1364–1411):
 *  ลบรายการสินค้าเดิมทั้งหมดของร้าน แล้วใส่ใหม่ด้วย PROD- id ใหม่
 *  ต่างจากเดิม: ทำใน D1 batch เดียว — ไม่มี partial write (ชีตเดิมไม่มี lock) */
export async function replaceProductsByShopId(
  env: Env,
  shopId: string,
  products: unknown,
  userName: string
): Promise<{ success: boolean; message?: string }> {
  const normalized = normalizeProductItems(products);
  const now = new Date().toISOString();
  const ids: string[] = [];
  for (let i = 0; i < normalized.length; i++) {
    ids.push(await nextSequenceId(env.DB, 'PROD', 'PROD-'));
  }
  const statements = [
    env.DB.prepare(`DELETE FROM products WHERE shop_id = ?`).bind(shopId),
    ...normalized.map((item, i) =>
      env.DB.prepare(
        `INSERT INTO products (product_id, shop_id, product_name, product_category,
         description, price, unit, sort_order, is_deleted, created_at, created_by,
         updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'FALSE', ?, ?, ?, ?)`
      ).bind(
        ids[i],
        shopId,
        item.productName,
        item.productCategory,
        item.description,
        item.price,
        item.unit,
        item.sortOrder,
        now,
        userName,
        now,
        userName
      )
    ),
  ];
  const results = await env.DB.batch(statements);
  if (results.some((r) => !r.success)) {
    return { success: false, message: 'ไม่สามารถบันทึกรายการสินค้าได้' };
  }
  return { success: true };
}

/** คัดลอกพฤติกรรม syncProductGalleryFromItems_ (บรรทัด 1551–1625):
 *  soft-delete รูป role product/gallery ของร้าน แล้ว re-upload รูปจาก product items
 *  อัปโหลดทั้งหมดก่อน แล้วจึงเขียน D1 ครั้งเดียว — ไม่มี partial write */
async function syncProductGalleryFromItems(
  env: Env,
  shopId: string,
  products: unknown,
  session: Session | null,
  _guestAccessKey: string,
  origin: string
): Promise<{ success: boolean; message?: string }> {
  const userName = currentUserName(session);
  const items = Array.isArray(products) ? (products as Record<string, unknown>[]) : [];
  // รวบรวมรูปที่ต้องอัปโหลดก่อนแตะฐานข้อมูล
  const uploads: {
    bytes?: Uint8Array;
    fileName: string;
    sortOrder: number;
    displayName: string;
    driveFileId?: string;
  }[] = [];
  for (let p = 0; p < items.length; p++) {
    const item = items[p] || {};
    const imageValue = String(item.image ?? item.Image ?? '').trim();
    if (!imageValue) continue;
    const sortOrder =
      item.sortOrder !== null && item.sortOrder !== undefined
        ? Number(item.sortOrder)
        : p + 1;
    const displayName = String(item.productName ?? item.ProductName ?? '').trim() || `product-${sortOrder}`;
    if (imageValue.startsWith('data:image/')) {
      uploads.push({ bytes: decodeBase64Payload(imageValue), fileName: displayName, sortOrder, displayName });
      continue;
    }
    const driveFileId = extractDriveFileIdFromUrl(imageValue);
    if (!driveFileId) continue;
    uploads.push({ fileName: displayName, sortOrder, displayName, driveFileId });
  }

  const now = new Date().toISOString();
  const statements = [
    // markGalleryRowsDeletedByIndexes_ — soft delete role product|gallery
    env.DB.prepare(
      `UPDATE shop_gallery SET status = 'DELETED', updated_at = ?, updated_by = ?
       WHERE shop_id = ? AND status != 'DELETED'
         AND LOWER(image_role) IN ('product', 'gallery')`
    ).bind(now, userName, shopId),
  ];

  for (const upload of uploads) {
    let driveFileId = '';
    let driveUrl = '';
    let thumbnailUrl = '';
    let mimeType = 'image/jpeg';
    let fileSize: number | '' = '';
    if (upload.bytes) {
      const stored = await storeImage(
        env,
        shopId,
        upload.fileName || 'product',
        upload.bytes,
        'upload'
      );
      mimeType = stored.mimeType;
      fileSize = stored.size;
      if (stored.storage === 'drive') {
        driveFileId = stored.driveFileId;
        driveUrl = stored.driveUrl;
        thumbnailUrl = stored.thumbnailUrl;
      } else {
        driveUrl = `${origin}/images/${stored.key}`;
        thumbnailUrl = driveUrl;
      }
    } else if (upload.driveFileId) {
      driveFileId = upload.driveFileId;
      // คัดลอกพฤติกรรม appendGalleryRowFromDriveFile_: อ้างไฟล์เดิมของ Drive
      // (ถ้า migrate ไป R2 แล้ว ใช้ object key เดิมจากทะเบียน)
      const existing = await env.DB.prepare(
        `SELECT object_key FROM r2_objects WHERE source = 'drive' AND source_ref = ? LIMIT 1`
      )
        .bind(driveFileId)
        .first<{ object_key: string }>();
      if (existing) {
        const key = existing.object_key;
        driveUrl = `${origin}/images/${key}`;
        thumbnailUrl = driveUrl;
      } else {
        driveUrl = `https://drive.google.com/file/d/${driveFileId}/view`;
        thumbnailUrl = `https://lh3.googleusercontent.com/d/${driveFileId}=w800`;
      }
    } else {
      continue;
    }
    const galleryId = await nextSequenceId(env.DB, 'GAL', 'GAL-');
    statements.push(
      env.DB.prepare(
        `INSERT INTO shop_gallery (gallery_id, shop_id, product_id, image_role,
         display_name, drive_file_id, drive_url, thumbnail_url, mime_type, file_size,
         width, height, sort_order, status, created_at, created_by, updated_at, updated_by)
         VALUES (?, ?, '', 'product', ?, ?, ?, ?, ?, ?, '', '', ?, 'ACTIVE', ?, ?, ?, ?)`
      ).bind(
        galleryId,
        shopId,
        upload.displayName || `product-${upload.sortOrder}`,
        driveFileId,
        driveUrl,
        thumbnailUrl,
        mimeType,
        fileSize,
        upload.sortOrder,
        now,
        userName,
        now,
        userName
      )
    );
  }

  const results = await env.DB.batch(statements);
  if (results.some((r) => !r.success)) {
    return { success: false, message: 'ไม่สามารถอัปเดตรูปสินค้าได้' };
  }
  return { success: true };
}

/** คัดลอกตรงจาก extractDriveFileIdFromUrl_ (บรรทัด 1488–1500) */
export function extractDriveFileIdFromUrl(url: string): string {
  const text = String(url || '');
  if (text.startsWith('data:')) return '';
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /thumbnail\?id=([a-zA-Z0-9_-]+)/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return '';
}

/** saveRecord — payload/response ตรงจาก Code.gs บรรทัด 325–399 */
export async function handleSaveRecord(request: Request, env: Env): Promise<Response> {
  try {
    const payload = (await readBody(request)) as Record<string, unknown>;
    const dataObj = (payload.data !== undefined ? payload.data : payload) as Record<string, unknown>;
    const token = payload.token ? str(payload.token) : null;
    const authResult = await getActiveSessionResult(env, token);
    if (authResult.error) return jsonResponse(authResult.error, 200, env);
    const session = authResult.session;
    const createdBy = currentUserName(session);

    const lamproundId = await generateLamproundId(env.DB);
    const backendId = crypto.randomUUID();
    const now = new Date().toISOString();
    const phoneValue = normalizePhoneValue(dataObj.phone);
    const hasProducts = Object.prototype.hasOwnProperty.call(dataObj, 'products');
    const productSummary = hasProducts
      ? summarizeProductItems(dataObj.products)
      : { mainProducts: '', avgPrice: '' };

    const imageShop = await resolveImageRef(env, backendId, dataObj.image_shop, 'image_shop');
    const imageProduct = await resolveImageRef(env, backendId, dataObj.image_product, 'image_product');
    const imageActivity = await resolveImageRef(env, backendId, dataObj.image_activity, 'image_activity');

    const insertRecord = env.DB.prepare(
      `INSERT INTO legacy_records (
        backend_id, lampround_id, business_name, owner_name, phone, line_id, facebook,
        website, location_text, latitude, longitude, business_type, product_category,
        business_level, main_products, production_capacity, sales_channel, avg_price,
        business_status, potential_level, issues, support_needed, image_shop_ref,
        image_product_ref, image_activity_ref, note, shop_history, created_at, created_by,
        is_deleted, deleted_at, deleted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FALSE', '', '')`
    ).bind(
      backendId,
      lamproundId,
      str(dataObj.business_name),
      str(dataObj.owner_name),
      phoneValue,
      str(dataObj.line_id),
      str(dataObj.facebook),
      str(dataObj.website),
      str(dataObj.location_text),
      str(dataObj.latitude),
      str(dataObj.longitude),
      str(dataObj.business_type),
      dataObj.product_category ? JSON.stringify(dataObj.product_category) : '',
      str(dataObj.business_level),
      hasProducts ? productSummary.mainProducts : str(dataObj.main_products),
      str(dataObj.production_capacity),
      dataObj.sales_channel ? JSON.stringify(dataObj.sales_channel) : '',
      hasProducts ? productSummary.avgPrice : str(dataObj.avg_price),
      str(dataObj.business_status),
      str(dataObj.potential_level),
      str(dataObj.issues),
      str(dataObj.support_needed),
      imageShop,
      imageProduct,
      imageActivity,
      str(dataObj.note),
      str(dataObj.shop_history ?? dataObj.shopHistory).trim(),
      now,
      createdBy
    );

    const statements = [insertRecord];
    if (hasProducts) {
      const normalized = normalizeProductItems(dataObj.products);
      const ids: string[] = [];
      for (let i = 0; i < normalized.length; i++) {
        ids.push(await nextSequenceId(env.DB, 'PROD', 'PROD-'));
      }
      normalized.forEach((item, i) => {
        statements.push(
          env.DB.prepare(
            `INSERT INTO products (product_id, shop_id, product_name, product_category,
             description, price, unit, sort_order, is_deleted, created_at, created_by,
             updated_at, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'FALSE', ?, ?, ?, ?)`
          ).bind(
            ids[i],
            backendId,
            item.productName,
            item.productCategory,
            item.description,
            item.price,
            item.unit,
            item.sortOrder,
            now,
            createdBy,
            now,
            createdBy
          )
        );
      });
    }
    const results = await env.DB.batch(statements);
    if (results.some((r) => !r.success)) throw new Error('insert failed');

    const result: Record<string, unknown> = {
      success: true,
      message: 'บันทึกข้อมูลสำเร็จ',
      id: lamproundId,
      backendId,
    };
    if (!session || !session.username) {
      result.guestAccessKey = await issueGuestAccessKey(env, backendId);
    }
    return jsonResponse(result, 200, env);
  } catch (err) {
    return jsonResponse(
      { success: false, message: `เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : String(err)}` },
      200,
      env
    );
  }
}

/** getRecords — array ของ record (ไม่มี image fields) เรียงใหม่→เก่า + _rowIndex
 *  ตรงจาก Code.gs บรรทัด 402–425 */
export async function handleGetRecords(request: Request, env: Env): Promise<Response> {
  try {
    const origin = new URL(request.url).origin;
    const rows = await env.DB.prepare(
      `SELECT rowid AS sheet_row, ${LEGACY_COLS} FROM legacy_records
       WHERE UPPER(TRIM(is_deleted)) != 'TRUE' ORDER BY rowid DESC`
    )
      .all<LegacyRowRaw>()
      .then((r) => r.results);
    const records = rows.map((row) =>
      legacyRecordToApi(row as never, {
        includeImages: false,
        rowIndex: Number(row.sheet_row) + 1,
        imageBaseUrl: origin,
      })
    );
    return jsonResponse(records, 200, env);
  } catch {
    // GAS เดิม catch แล้วคืน [] เสมอ
    return jsonResponse([], 200, env);
  }
}

/** getRecordDetail — ตรงจาก Code.gs บรรทัด 427–477 (รวม merge gallery 2 ระบบ id) */
export async function handleGetRecordDetail(request: Request, env: Env): Promise<Response> {
  try {
    const origin = new URL(request.url).origin;
    const payload = (await readBody(request)) as Record<string, unknown>;
    const backendId = typeof payload === 'object' && payload !== null ? str(payload.backendId) : str(payload);
    if (!backendId) return jsonResponse({ success: false, message: 'ไม่พบรายการ' }, 200, env);
    const row = await getLegacyByBackendId(env, backendId);
    if (!row) return jsonResponse({ success: false, message: 'ไม่พบรายการในฐานข้อมูล' }, 200, env);
    if (isDeletedFlag(row.is_deleted)) {
      return jsonResponse(
        { success: false, message: 'รายการนี้ถูกลบออกจากรายการหลักแล้ว' },
        200,
        env
      );
    }
    const record = legacyRecordToApi(row as never, { includeImages: true, imageBaseUrl: origin });

    // products: getProductsByShopId_([backendId, ShopID ของ scalable ถ้ามี])
    const shopRow = await env.DB.prepare(
      `SELECT shop_id FROM shops WHERE legacy_backend_id = ? LIMIT 1`
    )
      .bind(backendId)
      .first<{ shop_id: string }>();
    const productTargets = [backendId, shopRow?.shop_id].filter(Boolean) as string[];
    const placeholders = productTargets.map(() => '?').join(', ');
    const products = await env.DB.prepare(
      `SELECT * FROM products WHERE shop_id IN (${placeholders}) AND UPPER(is_deleted) != 'TRUE'
       ORDER BY sort_order`
    )
      .bind(...productTargets)
      .all<Record<string, unknown>>()
      .then((r) => r.results.map((p) => productRowToApi(p)));
    record.products = products;

    // gallery: รวมทั้งที่เก็บด้วย legacy backendId และ SHOP-XXXXXX (dedup ตาม GalleryID)
    const galleryIds = [backendId, shopRow?.shop_id].filter(Boolean) as string[];
    const galleryRows = await env.DB.prepare(
      `SELECT g.*, ro.object_key AS r2_key FROM shop_gallery g LEFT JOIN r2_objects ro ON ro.source = 'drive' AND ro.source_ref = g.drive_file_id WHERE g.shop_id IN (${galleryIds.map(() => '?').join(', ')})
       AND UPPER(g.status) != 'DELETED' ORDER BY g.sort_order`
    )
      .bind(...galleryIds)
      .all<Record<string, unknown>>()
      .then((r) => r.results.map((g) => galleryRowToApi(g, origin)));
    record.gallery = galleryRows;
    return jsonResponse({ success: true, record }, 200, env);
  } catch (err) {
    return jsonResponse(
      {
        success: false,
        message: `เกิดข้อผิดพลาดในการโหลดรายละเอียด: ${err instanceof Error ? err.message : String(err)}`,
      },
      200,
      env
    );
  }
}

/** updateRecord — ตรงจาก Code.gs บรรทัด 726–820 (fieldMap, skipFields, ownership, guest key) */
export async function handleUpdateRecord(request: Request, env: Env): Promise<Response> {
  try {
    const origin = new URL(request.url).origin;
    const payload = (await readBody(request)) as Record<string, unknown>;
    const backendId = str(payload.backendId);
    const dataObj = (payload.data || {}) as Record<string, unknown>;
    const token = payload.token ? str(payload.token) : null;
    const guestAccessKey = payload.guestAccessKey ? str(payload.guestAccessKey) : '';
    if (!backendId) return jsonResponse({ success: false, message: 'ไม่พบรายการ' }, 200, env);
    const authResult = await getActiveSessionResult(env, token);
    if (authResult.error) return jsonResponse(authResult.error, 200, env);
    const session = authResult.session;
    const isGuestScoped = !session || !session.username;
    if (isGuestScoped && !(await isValidGuestAccess(env, backendId, guestAccessKey))) {
      return jsonResponse(
        { success: false, message: 'กรุณาเข้าสู่ระบบก่อนแก้ไขข้อมูล' },
        200,
        env
      );
    }
    const existing = await getLegacyByBackendId(env, backendId);
    if (!existing) return jsonResponse({ success: false, message: 'ไม่พบรายการในฐานข้อมูล' }, 200, env);
    if (isDeletedFlag(existing.is_deleted)) {
      return jsonResponse(
        { success: false, message: 'รายการนี้ถูกลบไปแล้ว ไม่สามารถแก้ไขได้' },
        200,
        env
      );
    }
    if (session && session.username) {
      const check = checkOwnership(session, str(existing.created_by), 'แก้ไข');
      if (!check.ok) return jsonResponse({ success: false, message: check.message }, 200, env);
    }

    const phoneValue = normalizePhoneValue(dataObj.phone || str(existing.phone));
    const hasProducts = Object.prototype.hasOwnProperty.call(dataObj, 'products');
    const productSummary = hasProducts
      ? summarizeProductItems(dataObj.products)
      : { mainProducts: '', avgPrice: '' };

    // คัดลอกเงื่อนไข fieldMap: ค่าที่ส่งมา (หรือค่าเดิมถ้าไม่ส่ง) — ProductCategory/
    // SalesChannel stringify, Image* ถ้าเป็น data URL ย้ายลง R2
    const updates: Record<string, string> = {};
    for (const [header, key] of Object.entries(UPDATE_FIELD_MAP)) {
      let next: string;
      if (header === 'Phone') {
        next = phoneValue;
      } else if (header === 'ProductCategory' || header === 'SalesChannel') {
        next = dataObj[key] ? JSON.stringify(dataObj[key]) : str(existing[columnOf(header)]);
      } else if (header === 'ImageShop' || header === 'ImageProduct' || header === 'ImageActivity') {
        const incoming = dataObj[key];
        next = incoming !== undefined ? await resolveImageRef(env, backendId, incoming, key) : str(existing[columnOf(header)]);
      } else {
        next = dataObj[key] !== undefined ? str(dataObj[key] || '') : str(existing[columnOf(header)]);
      }
      updates[header] = next;
    }
    if (hasProducts) {
      updates.MainProducts = productSummary.mainProducts;
      updates.AvgPrice = productSummary.avgPrice;
    }

    const statements = [
      env.DB.prepare(
        `UPDATE legacy_records SET
         business_name = ?, owner_name = ?, phone = ?, line_id = ?, facebook = ?,
         website = ?, location_text = ?, latitude = ?, longitude = ?, business_type = ?,
         product_category = ?, business_level = ?, main_products = ?,
         production_capacity = ?, sales_channel = ?, avg_price = ?, business_status = ?,
         potential_level = ?, issues = ?, support_needed = ?, image_shop_ref = ?,
         image_product_ref = ?, image_activity_ref = ?, note = ?, shop_history = ?
         WHERE backend_id = ?`
      ).bind(
        updates.BusinessName,
        updates.OwnerName,
        updates.Phone,
        updates.LineID,
        updates.Facebook,
        updates.Website,
        updates.LocationText,
        updates.Latitude,
        updates.Longitude,
        updates.BusinessType,
        updates.ProductCategory,
        updates.BusinessLevel,
        updates.MainProducts,
        updates.ProductionCapacity,
        updates.SalesChannel,
        updates.AvgPrice,
        updates.BusinessStatus,
        updates.PotentialLevel,
        updates.Issues,
        updates.SupportNeeded,
        updates.ImageShop,
        updates.ImageProduct,
        updates.ImageActivity,
        updates.Note,
        updates.ShopHistory,
        backendId
      ),
    ];

    if (hasProducts) {
      const productSync = await replaceProductsByShopId(env, backendId, dataObj.products, currentUserName(session));
      if (productSync.success === false) {
        return jsonResponse(
          { success: false, message: productSync.message || 'ไม่สามารถบันทึกรายการสินค้าได้' },
          200,
          env
        );
      }
      const gallerySync = await syncProductGalleryFromItems(
        env,
        backendId,
        dataObj.products,
        session,
        guestAccessKey,
        origin
      );
      if (gallerySync.success === false) {
        return jsonResponse(
          { success: false, message: gallerySync.message || 'ไม่สามารถอัปเดตรูปสินค้าได้' },
          200,
          env
        );
      }
    }
    const results = await env.DB.batch(statements);
    if (results.some((r) => !r.success)) throw new Error('update failed');
    return jsonResponse({ success: true, message: 'อัปเดตข้อมูลสำเร็จ' }, 200, env);
  } catch (err) {
    return jsonResponse(
      { success: false, message: `เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : String(err)}` },
      200,
      env
    );
  }
}

function columnOf(header: string): string {
  // header (Sheet) → คอลัมน์ D1 ของ legacy_records
  const map: Record<string, string> = {
    ImageShop: 'image_shop_ref',
    ImageProduct: 'image_product_ref',
    ImageActivity: 'image_activity_ref',
    BusinessName: 'business_name',
    OwnerName: 'owner_name',
    Phone: 'phone',
    LineID: 'line_id',
    Facebook: 'facebook',
    Website: 'website',
    LocationText: 'location_text',
    Latitude: 'latitude',
    Longitude: 'longitude',
    BusinessType: 'business_type',
    ProductCategory: 'product_category',
    BusinessLevel: 'business_level',
    MainProducts: 'main_products',
    ProductionCapacity: 'production_capacity',
    SalesChannel: 'sales_channel',
    AvgPrice: 'avg_price',
    BusinessStatus: 'business_status',
    PotentialLevel: 'potential_level',
    Issues: 'issues',
    SupportNeeded: 'support_needed',
    Note: 'note',
    ShopHistory: 'shop_history',
  };
  return map[header];
}

/** deleteRecord — ตรงจาก Code.gs บรรทัด 480–532 (guest ห้ามลบ, ownership, soft delete) */
export async function handleDeleteRecord(request: Request, env: Env): Promise<Response> {
  try {
    const payload = (await readBody(request)) as Record<string, unknown>;
    const backendId = str(payload.backendId);
    const token = payload.token ? str(payload.token) : null;
    void payload.guestAccessKey; // GAS เดิมรับไว้แต่ไม่ใช้ (guest ถูกบล็อกก่อนเสมอ)
    const authResult = await getActiveSessionResult(env, token);
    if (authResult.error) return jsonResponse(authResult.error, 200, env);
    const session = authResult.session;
    const isGuestScoped = !session || !session.username;
    if (isGuestScoped) {
      return jsonResponse(
        {
          success: false,
          message: 'กรุณาเข้าสู่ระบบก่อนลบข้อมูล (ผู้ใช้ทั่วไปไม่สามารถลบข้อมูลได้)',
        },
        200,
        env
      );
    }
    if (!backendId) return jsonResponse({ success: false, message: 'ไม่พบรายการ' }, 200, env);
    const existing = await getLegacyByBackendId(env, backendId);
    if (!existing) return jsonResponse({ success: false, message: 'ไม่พบรายการในฐานข้อมูล' }, 200, env);
    if (isDeletedFlag(existing.is_deleted)) {
      return jsonResponse({ success: false, message: 'รายการนี้ถูกลบไปแล้ว' }, 200, env);
    }
    const check = checkOwnership(session!, str(existing.created_by), 'ลบ');
    if (!check.ok) return jsonResponse({ success: false, message: check.message }, 200, env);
    const result = await env.DB.prepare(
      `UPDATE legacy_records SET is_deleted = 'TRUE', deleted_at = ?, deleted_by = ?
       WHERE backend_id = ?`
    )
      .bind(new Date().toISOString(), currentUserName(session), backendId)
      .run();
    if (!result.success) throw new Error('delete failed');
    return jsonResponse({ success: true, message: 'ย้ายรายการไปยังข้อมูลที่ลบแล้ว' }, 200, env);
  } catch (err) {
    return jsonResponse(
      {
        success: false,
        message: `เกิดข้อผิดพลาดในการลบ: ${err instanceof Error ? err.message : String(err)}`,
      },
      200,
      env
    );
  }
}

/** ใช้โดย PDF flow: parseJsonArray re-export เพื่อไม่ให้ import หายตอน tree-shake */
export const _jsonArray = parseJsonArray;
