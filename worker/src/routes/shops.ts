import type { Env } from '../env';
import { getActiveSessionResult, currentUserName, isValidGuestAccess, checkOwnership } from '../lib/auth';
import { jsonResponse, readBody, str } from '../lib/http';
import { normalizePhoneValue, parseJsonArray } from '../lib/format';
import { summarizeProductItems, nextSequenceId } from '../lib/products';
import { shopRowToApi, productRowToApi, galleryRowToApi } from '../lib/legacy';
import { replaceProductsByShopId, extractDriveFileIdFromUrl } from './records';

/** buildShopRow_ (บรรทัด 1261–1300): รับได้ทั้ง snake_case และ camelCase,
 *  ค่าเดิม (existing) ใช้เมื่อไม่ส่งมา */
function pick(payload: Record<string, unknown>, existing: Record<string, unknown> | null, ...keys: string[]): string {
  for (const key of keys) {
    const value = payload[key];
    if (value !== undefined && value !== null && String(value) !== '') return String(value);
  }
  for (const key of keys) {
    const value = existing?.[key];
    if (value !== undefined && value !== null && String(value) !== '') return String(value);
  }
  return '';
}

async function findShop(
  env: Env,
  shopId: string
): Promise<Record<string, unknown> | null> {
  return env.DB.prepare(`SELECT * FROM shops WHERE shop_id = ?`).bind(shopId).first();
}

/** upsertShopRecord — ตรงจาก Code.gs บรรทัด 1301–1353
 *  การตัดสินใจร่วม (Q1=ข/Q5=ข): เพิ่ม ownership check — ต้นฉบับไม่มี ถือเป็น security fix
 *  กติกา: admin → ทุกร้าน, user → เฉพาะร้านที่ created_by เป็นของตัวเอง,
 *  guest → ปฏิเสธทั้งหมด (ปิด path allowGuestPdf ของ route สาธารณะ —
 *  ใน Worker ไม่มี internal caller ใช้ path นี้แล้ว), สร้างร้านใหม่ต้องมี session */
export async function handleUpsertShopRecord(request: Request, env: Env): Promise<Response> {
  try {
    const payload = (await readBody(request)) as Record<string, unknown>;
    const token = payload.token ? str(payload.token) : null;
    const authResult = await getActiveSessionResult(env, token);
    if (authResult.error) return jsonResponse(authResult.error, 200, env);
    const session = authResult.session;
    if (!session || !session.username) {
      return jsonResponse(
        { success: false, sessionInvalid: true, message: 'กรุณาเข้าสู่ระบบก่อนบันทึกข้อมูลร้านค้า' },
        200,
        env
      );
    }
    const createdBy = currentUserName(session);
    const now = new Date().toISOString();
    const existingShopId = str(payload.shopId || payload.ShopID).trim();
    const existing = existingShopId ? await findShop(env, existingShopId) : null;
    if (existing) {
      const check = checkOwnership(session, str(existing.created_by), 'แก้ไข');
      if (!check.ok) return jsonResponse({ success: false, message: check.message }, 200, env);
    }
    let shopId = existingShopId;
    if (!shopId && existing?.shop_id) shopId = String(existing.shop_id);
    if (!shopId) shopId = await nextSequenceId(env.DB, 'SHOP', 'SHOP-');
    if (!shopId) return jsonResponse({ success: false, message: 'ShopID is required.' }, 200, env);

    const hasProducts = Object.prototype.hasOwnProperty.call(payload, 'products');
    const productSummary = hasProducts
      ? summarizeProductItems(payload.products)
      : { mainProducts: '', avgPrice: '' };

    const values = {
      shop_id: shopId,
      legacy_backend_id:
        existing?.legacy_backend_id ||
        str(payload.legacyBackendId || payload.backendId),
      legacy_lampround_id:
        existing?.legacy_lampround_id ||
        str(payload.legacyLamproundId || payload.lamproundId),
      business_name: pick(payload, existing, 'business_name', 'businessName', 'BusinessName'),
      owner_name: pick(payload, existing, 'owner_name', 'ownerName', 'OwnerName'),
      phone: normalizePhoneValue(
        str(payload.phone) || str(existing?.phone)
      ),
      line_id: pick(payload, existing, 'line_id', 'lineId', 'LineID'),
      facebook: pick(payload, existing, 'facebook', 'Facebook'),
      website: pick(payload, existing, 'website', 'Website'),
      location_text: pick(payload, existing, 'location_text', 'locationText', 'LocationText'),
      latitude: pick(payload, existing, 'latitude', 'Latitude'),
      longitude: pick(payload, existing, 'longitude', 'Longitude'),
      business_type: pick(payload, existing, 'business_type', 'businessType', 'BusinessType'),
      product_category: JSON.stringify(
        parseJsonArray(
          payload.product_category ?? payload.productCategory ?? existing?.product_category
        )
      ),
      business_level: pick(payload, existing, 'business_level', 'businessLevel', 'BusinessLevel'),
      main_products: hasProducts
        ? productSummary.mainProducts
        : pick(payload, existing, 'main_products', 'mainProducts', 'MainProducts'),
      production_capacity: pick(
        payload,
        existing,
        'production_capacity',
        'productionCapacity',
        'ProductionCapacity'
      ),
      sales_channel: JSON.stringify(
        parseJsonArray(payload.sales_channel ?? payload.salesChannel ?? existing?.sales_channel)
      ),
      avg_price: hasProducts
        ? productSummary.avgPrice
        : pick(payload, existing, 'avg_price', 'avgPrice', 'AvgPrice'),
      business_status: pick(payload, existing, 'business_status', 'businessStatus', 'BusinessStatus'),
      potential_level: pick(payload, existing, 'potential_level', 'potentialLevel', 'PotentialLevel'),
      issues: pick(payload, existing, 'issues', 'Issues'),
      support_needed: pick(payload, existing, 'support_needed', 'supportNeeded', 'SupportNeeded'),
      note: pick(payload, existing, 'note', 'Note'),
      shop_history: pick(payload, existing, 'shop_history', 'shopHistory', 'ShopHistory').trim(),
    };

    const statement = existing
      ? env.DB.prepare(
          `UPDATE shops SET legacy_backend_id = ?, legacy_lampround_id = ?,
           business_name = ?, owner_name = ?, phone = ?, line_id = ?, facebook = ?,
           website = ?, location_text = ?, latitude = ?, longitude = ?, business_type = ?,
           product_category = ?, business_level = ?, main_products = ?,
           production_capacity = ?, sales_channel = ?, avg_price = ?, business_status = ?,
           potential_level = ?, issues = ?, support_needed = ?, note = ?, shop_history = ?,
           updated_at = ?, updated_by = ? WHERE shop_id = ?`
        ).bind(
          values.legacy_backend_id,
          values.legacy_lampround_id,
          values.business_name,
          values.owner_name,
          values.phone,
          values.line_id,
          values.facebook,
          values.website,
          values.location_text,
          values.latitude,
          values.longitude,
          values.business_type,
          values.product_category,
          values.business_level,
          values.main_products,
          values.production_capacity,
          values.sales_channel,
          values.avg_price,
          values.business_status,
          values.potential_level,
          values.issues,
          values.support_needed,
          values.note,
          values.shop_history,
          now,
          createdBy,
          shopId
        )
      : env.DB.prepare(
          `INSERT INTO shops (shop_id, legacy_backend_id, legacy_lampround_id,
           business_name, owner_name, phone, line_id, facebook, website, location_text,
           latitude, longitude, business_type, product_category, business_level,
           main_products, production_capacity, sales_channel, avg_price, business_status,
           potential_level, issues, support_needed, note, shop_history,
           created_at, created_by, updated_at, updated_by, is_deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FALSE')`
        ).bind(
          values.shop_id,
          values.legacy_backend_id,
          values.legacy_lampround_id,
          values.business_name,
          values.owner_name,
          values.phone,
          values.line_id,
          values.facebook,
          values.website,
          values.location_text,
          values.latitude,
          values.longitude,
          values.business_type,
          values.product_category,
          values.business_level,
          values.main_products,
          values.production_capacity,
          values.sales_channel,
          values.avg_price,
          values.business_status,
          values.potential_level,
          values.issues,
          values.support_needed,
          values.note,
          values.shop_history,
          now,
          createdBy,
          now,
          createdBy
        );
    const result = await statement.run();
    if (!result.success) throw new Error('upsert shop failed');

    if (hasProducts) {
      const sync = await replaceProductsByShopId(env, shopId, payload.products, createdBy);
      if (sync.success === false) {
        return jsonResponse(
          { success: false, message: sync.message || 'ไม่สามารถบันทึกรายการสินค้าได้' },
          200,
          env
        );
      }
    }
    return jsonResponse({ success: true, message: 'บันทึกข้อมูลร้านค้าสำเร็จ', shopId }, 200, env);
  } catch (err) {
    return jsonResponse(
      { success: false, message: `เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : String(err)}` },
      200,
      env
    );
  }
}

/** getShopGallery — คืน array ตรงจาก Code.gs บรรทัด 1671–1709
 *  ค้นด้วย shopId/backendId/legacyBackendId ทั้งสองระบบ id, ข้าม Status='DELETED' */
export async function handleGetShopGallery(request: Request, env: Env): Promise<Response> {
  try {
    const origin = new URL(request.url).origin;
    const payload = (await readBody(request)) as Record<string, unknown> | string;
    const lookupIds: string[] = [];
    if (typeof payload === 'string') {
      const trimmed = payload.trim();
      if (trimmed) lookupIds.push(trimmed);
    } else if (payload) {
      for (const key of ['shopId', 'backendId', 'legacyBackendId']) {
        const v = str(payload[key]).trim();
        if (v && !lookupIds.includes(v)) lookupIds.push(v);
      }
    }
    if (lookupIds.length === 0) return jsonResponse([], 200, env);
    const placeholders = lookupIds.map(() => '?').join(', ');
    const rows = await env.DB.prepare(
      `SELECT g.*, ro.object_key AS r2_key FROM shop_gallery g LEFT JOIN r2_objects ro ON ro.source = 'drive' AND ro.source_ref = g.drive_file_id WHERE g.shop_id IN (${placeholders})
       AND UPPER(g.status) != 'DELETED' ORDER BY g.sort_order`
    )
      .bind(...lookupIds)
      .all<Record<string, unknown>>()
      .then((r) => r.results);
    return jsonResponse(rows.map((row) => galleryRowToApi(row, origin)), 200, env);
  } catch {
    return jsonResponse([], 200, env);
  }
}

/** getShopRecord — ตรงจาก Code.gs บรรทัด 1737–1802 */
export async function handleGetShopRecord(request: Request, env: Env): Promise<Response> {
  try {
    const origin = new URL(request.url).origin;
    const payload = (await readBody(request)) as Record<string, unknown>;
    const shopId = str(payload.shopId).trim();
    const legacyBackendId = str(payload.legacyBackendId || payload.backendId).trim();
    const legacyLamproundId = str(payload.legacyLamproundId || payload.lamproundId).trim();

    let record: Record<string, unknown> | null = null;
    if (shopId) record = await findShop(env, shopId);
    if (!record && legacyBackendId) {
      record = await env.DB.prepare(`SELECT * FROM shops WHERE legacy_backend_id = ? LIMIT 1`)
        .bind(legacyBackendId)
        .first();
    }
    if (!record && legacyLamproundId) {
      record = await env.DB.prepare(`SELECT * FROM shops WHERE legacy_lampround_id = ? LIMIT 1`)
        .bind(legacyLamproundId)
        .first();
    }

    // gallery lookup ครบทุก id เหมือนเดิม (ShopID + LegacyBackendId + requested legacy)
    const galleryLookupIds: string[] = [];
    if (record?.shop_id) galleryLookupIds.push(String(record.shop_id));
    if (legacyBackendId && !galleryLookupIds.includes(legacyBackendId)) {
      galleryLookupIds.push(legacyBackendId);
    }
    const recordLegacy = record?.legacy_backend_id ? String(record.legacy_backend_id) : '';
    if (recordLegacy && !galleryLookupIds.includes(recordLegacy)) {
      galleryLookupIds.push(recordLegacy);
    }
    const gallery = galleryLookupIds.length
      ? await env.DB.prepare(
          `SELECT g.*, ro.object_key AS r2_key FROM shop_gallery g LEFT JOIN r2_objects ro ON ro.source = 'drive' AND ro.source_ref = g.drive_file_id WHERE g.shop_id IN (${galleryLookupIds.map(() => '?').join(', ')})
           AND UPPER(g.status) != 'DELETED' ORDER BY g.sort_order`
        )
          .bind(...galleryLookupIds)
          .all<Record<string, unknown>>()
          .then((r) => r.results.map((g) => galleryRowToApi(g, origin)))
      : [];

    if (!record) {
      return jsonResponse(
        {
          success: gallery.length > 0,
          message: gallery.length > 0 ? 'Gallery found via legacy ID' : 'Shop not found.',
          shop: null,
          gallery,
          products: [],
        },
        200,
        env
      );
    }

    const productTargets = [
      String(record.shop_id),
      String(record.legacy_backend_id ?? ''),
      legacyBackendId,
    ].filter(Boolean);
    const placeholders = productTargets.map(() => '?').join(', ');
    const products = await env.DB.prepare(
      `SELECT * FROM products WHERE shop_id IN (${placeholders})
       AND UPPER(is_deleted) != 'TRUE' ORDER BY sort_order`
    )
      .bind(...productTargets)
      .all<Record<string, unknown>>()
      .then((r) => r.results.map((p) => productRowToApi(p)));

    return jsonResponse(
      { success: true, shop: shopRowToApi(record), gallery, products },
      200,
      env
    );
  } catch (err) {
    return jsonResponse(
      {
        success: false,
        message: `Failed to load shop record: ${err instanceof Error ? err.message : String(err)}`,
      },
      200,
      env
    );
  }
}

/** replaceProductsByShopId (public route) — payload {shopId|backendId, products, token}
 *  การตัดสินใจร่วม (Q5=ข): เพิ่ม ownership check เช่นเดียวกับ upsert
 *  (admin → ทุกร้าน, user → เฉพาะของตัวเอง, ไม่พบร้าน → ปฏิเสธ) */
export async function handleReplaceProducts(request: Request, env: Env): Promise<Response> {
  try {
    const payload = (await readBody(request)) as Record<string, unknown>;
    const token = payload.token ? str(payload.token) : null;
    const authResult = await getActiveSessionResult(env, token);
    if (authResult.error) return jsonResponse(authResult.error, 200, env);
    const session = authResult.session;
    if (!session || !session.username) {
      return jsonResponse({ success: false, message: 'Session ไม่ถูกต้อง' }, 200, env);
    }
    const shopId = str(payload.shopId || payload.backendId).trim();
    if (!shopId) return jsonResponse({ success: false, message: 'shopId is required.' }, 200, env);
    const shop =
      (await findShop(env, shopId)) ??
      (await env.DB.prepare(`SELECT * FROM shops WHERE legacy_backend_id = ? LIMIT 1`)
        .bind(shopId)
        .first<Record<string, unknown>>());
    if (!shop) {
      return jsonResponse({ success: false, message: 'ไม่พบร้านค้าในระบบ' }, 200, env);
    }
    const check = checkOwnership(session, str(shop.created_by), 'แก้ไข');
    if (!check.ok) return jsonResponse({ success: false, message: check.message }, 200, env);
    const sync = await replaceProductsByShopId(env, shopId, payload.products, currentUserName(session));
    return jsonResponse(sync, 200, env);
  } catch (err) {
    return jsonResponse(
      { success: false, message: `เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : String(err)}` },
      200,
      env
    );
  }
}

export { extractDriveFileIdFromUrl, isValidGuestAccess };
