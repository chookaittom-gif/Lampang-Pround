#!/usr/bin/env node
/**
 * migrate.mjs — ขั้นที่ 2 ของ migration (COPY ONLY)
 * อ่าน migration/data/*.json → เขียน D1 + R2
 * หลักการ: Resume / Retry / Idempotent / Partial-Failure-safe
 *  - INSERT OR REPLACE ทุกตาราง (idempotent ตาม PK เดิม ทุก id คงค่าเดิม)
 *  - ข้ามแถว/ไฟล์ที่ migrate แล้ว (ทะเบียน r2_objects + PK check)
 *  - batch 20 แถว (BATCH_COMMIT_SIZE เดิมของ GAS), รันซ้ำได้ตลอด
 *  - ห้ามแก้/ลบข้อมูลต้นฉบับทุกชนิด
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { D1Client } from './lib/d1.mjs';
import { R2Client } from './lib/r2.mjs';

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^"|"$/g, '');
    }
  }
}

loadEnv();
const DRIVE_ONLY = process.env.DRIVE_ONLY === '1';
const required = ['CF_ACCOUNT_ID', 'CF_API_TOKEN', 'CF_D1_DATABASE_ID'];
if (!DRIVE_ONLY) {
  required.push('R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET');
}
for (const name of required) {
  if (!process.env[name]) {
    console.error(`ต้องตั้ง ${name} ใน migration/.env`);
    process.exit(1);
  }
}
const db = new D1Client({
  accountId: process.env.CF_ACCOUNT_ID,
  apiToken: process.env.CF_API_TOKEN,
  databaseId: process.env.CF_D1_DATABASE_ID,
});
const r2 = DRIVE_ONLY
  ? null
  : new R2Client({
      accountId: process.env.CF_ACCOUNT_ID,
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      bucket: process.env.R2_BUCKET,
    });

const dataDir = path.join(process.cwd(), 'data');
function readData(sheetName) {
  const file = path.join(dataDir, `${sheetName}.json`);
  if (!fs.existsSync(file)) return { headers: [], records: [] };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const BATCH_SIZE = 20; // BATCH_COMMIT_SIZE เดิม
const PBKDF2_ITERATIONS = 100_000;

/** hash รหัสผ่านด้วยรูปแบบเดียวกับ Worker (pbkdf2$iter$salt$hash) — plaintext ไม่เคยลง D1 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256');
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function sniffImageMime(bytes) {
  const startsWith = (magic) => magic.every((b, i) => bytes[i] === b);
  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith([0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  return null;
}

function extOf(mime) {
  return mime === 'image/png' ? 'png' : mime === 'image/gif' ? 'gif' : 'jpg';
}

function safeSegment(value) {
  return String(value || 'Unassigned').replace(/[^A-Za-z0-9._-]/g, '_');
}

async function fetchWithRetry(url, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const resp = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (migration; LampangPround)' },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length === 0) throw new Error('empty body');
      return buf;
    } catch (err) {
      lastErr = err;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}

/** อัปโหลดรูป 1 ไฟล์ (idempotent ผ่าน r2_objects) — คืน object key หรือ '' */
async function uploadImage({ key, bytes, shopId, source, sourceRef }) {
  if (!r2) throw new Error(`R2 is required for binary image migration (${sourceRef || key})`);
  const existing = await db.query(`SELECT object_key FROM r2_objects WHERE object_key = ?`, [key]);
  if (existing.length > 0) return key; // resume: ข้ามที่อัปโหลดแล้ว
  const mime = sniffImageMime(bytes);
  if (!mime) throw new Error(`unsupported image format (${sourceRef || key})`);
  await r2.put(key, bytes, mime);
  await db.execute(
    `INSERT OR REPLACE INTO r2_objects (object_key, source, source_ref, shop_id, mime_type, file_size)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [key, source, sourceRef, safeSegment(shopId), mime, bytes.length]
  );
  return key;
}

async function migrateUsers() {
  const { records } = readData('Users');
  let count = 0;
  for (const row of records) {
    const username = String(row.Username ?? '').trim().toLowerCase();
    if (!username) continue;
    const password = String(row.Password ?? '').trim();
    if (!password) {
      console.warn(`⚠ ข้ามผู้ใช้ "${username}" — ไม่มีรหัสผ่านในชีต`);
      continue;
    }
    await db.execute(
      `INSERT OR REPLACE INTO users (username, password_hash, name, role, email)
       VALUES (?, ?, ?, ?, ?)`,
      [username, hashPassword(password), String(row.Name ?? ''), String(row.Role ?? 'user') || 'user', String(row.Email ?? '')]
    );
    count++;
  }
  console.log(`✓ Users: ${count} (hash ด้วย PBKDF2 ตอน migrate — ไม่มี plaintext ลง D1)`);
  return count;
}

const LEGACY_HEADER_TO_COLUMN = {
  BackendId: 'backend_id',
  LamproundID: 'lampround_id',
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
  ImageShop: 'image_shop_ref',
  ImageProduct: 'image_product_ref',
  ImageActivity: 'image_activity_ref',
  Note: 'note',
  ShopHistory: 'shop_history',
  CreatedAt: 'created_at',
  CreatedBy: 'created_by',
  IsDeleted: 'is_deleted',
  DeletedAt: 'deleted_at',
  DeletedBy: 'deleted_by',
};

function normalizeTimestamp(value) {
  // ชีตเก็บวันที่เป็น Date → dump เป็น ISO หรือ formatted string; D1 เก็บ TEXT
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return text;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return text;
}

async function migrateLegacyRecords() {
  const { records } = readData('LamproundData');
  const existing = new Set(
    (await db.query(`SELECT backend_id FROM legacy_records`)).map((r) => r.backend_id)
  );
  const pending = records.filter((r) => String(r.BackendId ?? '').trim() && !existing.has(String(r.BackendId).trim()));
  console.log(`Legacy records: ทั้งหมด ${records.length}, เหลือให้ migrate ${pending.length} (resume)`);
  const stats = { migrated: 0, images: 0, errors: 0 };
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    for (const row of batch) {
      try {
        const backendId = String(row.BackendId).trim();
        const values = {};
        for (const [header, column] of Object.entries(LEGACY_HEADER_TO_COLUMN)) {
          values[column] = row[header] ?? '';
        }
        // รูป inline base64 → R2 (ห้ามเก็บ binary ใน D1); URL เก็บตามเดิม
        for (const [header, column, name] of [
          ['ImageShop', 'image_shop_ref', 'image_shop'],
          ['ImageProduct', 'image_product_ref', 'image_product'],
          ['ImageActivity', 'image_activity_ref', 'image_activity'],
        ]) {
          const raw = String(row[header] ?? '').trim();
          if (!raw) {
            values[column] = '';
          } else if (raw.startsWith('data:image/')) {
            if (DRIVE_ONLY) {
              throw new Error(`Inline image requires R2 in DRIVE_ONLY mode (${backendId}/${header})`);
            }
            const base64 = raw.split('base64,')[1] ?? '';
            const bytes = Buffer.from(base64, 'base64');
            const key = `legacy/${safeSegment(backendId)}/${name}.${extOf(sniffImageMime(bytes) ?? 'image/jpeg')}`;
            values[column] = await uploadImage({ key, bytes, shopId: backendId, source: 'legacy_base64', sourceRef: header });
            stats.images++;
          } else {
            values[column] = raw; // URL เดิม (ยังอ้าง Drive ได้ — ห้ามลบต้นฉบับ)
          }
        }
        await db.execute(
          `INSERT OR REPLACE INTO legacy_records (
            backend_id, lampround_id, business_name, owner_name, phone, line_id, facebook,
            website, location_text, latitude, longitude, business_type, product_category,
            business_level, main_products, production_capacity, sales_channel, avg_price,
            business_status, potential_level, issues, support_needed, image_shop_ref,
            image_product_ref, image_activity_ref, note, shop_history, created_at, created_by,
            is_deleted, deleted_at, deleted_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            backendId,
            String(values.lampround_id ?? '').trim() || null,
            String(values.business_name ?? ''),
            String(values.owner_name ?? ''),
            String(values.phone ?? ''),
            String(values.line_id ?? ''),
            String(values.facebook ?? ''),
            String(values.website ?? ''),
            String(values.location_text ?? ''),
            String(values.latitude ?? ''),
            String(values.longitude ?? ''),
            String(values.business_type ?? ''),
            String(values.product_category ?? ''),
            String(values.business_level ?? ''),
            String(values.main_products ?? ''),
            String(values.production_capacity ?? ''),
            String(values.sales_channel ?? ''),
            String(values.avg_price ?? ''),
            String(values.business_status ?? ''),
            String(values.potential_level ?? ''),
            String(values.issues ?? ''),
            String(values.support_needed ?? ''),
            String(values.image_shop_ref ?? ''),
            String(values.image_product_ref ?? ''),
            String(values.image_activity_ref ?? ''),
            String(values.note ?? ''),
            String(values.shop_history ?? ''),
            normalizeTimestamp(values.created_at) || new Date().toISOString(),
            String(values.created_by ?? '') || 'Guest',
            String(values.is_deleted ?? 'FALSE') || 'FALSE',
            normalizeTimestamp(values.deleted_at) || null,
            String(values.deleted_by ?? '') || null,
          ]
        );
        stats.migrated++;
      } catch (err) {
        stats.errors++;
        console.error(`✗ Legacy ${row.BackendId}: ${err.message}`);
      }
    }
    console.log(`  … legacy ${Math.min(i + BATCH_SIZE, pending.length)}/${pending.length}`);
  }
  console.log(`✓ Legacy records: ${stats.migrated} migrated, ${stats.images} รูปจาก base64 → R2, ${stats.errors} errors`);
  return stats;
}

async function migrateShops() {
  const { records } = readData('Shops');
  const existing = new Set((await db.query(`SELECT shop_id FROM shops`)).map((r) => r.shop_id));
  const pending = records.filter((r) => String(r.ShopID ?? '').trim() && !existing.has(String(r.ShopID).trim()));
  console.log(`Shops: ทั้งหมด ${records.length}, เหลือ ${pending.length}`);
  let migrated = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    for (const row of pending.slice(i, i + BATCH_SIZE)) {
      await db.execute(
        `INSERT OR REPLACE INTO shops (
          shop_id, legacy_backend_id, legacy_lampround_id, business_name, owner_name, phone,
          line_id, facebook, website, location_text, latitude, longitude, business_type,
          product_category, business_level, main_products, production_capacity, sales_channel,
          avg_price, business_status, potential_level, issues, support_needed, note, shop_history,
          created_at, created_by, updated_at, updated_by, is_deleted, deleted_at, deleted_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(row.ShopID).trim(),
          String(row.LegacyBackendId ?? ''),
          String(row.LegacyLamproundID ?? ''),
          String(row.BusinessName ?? ''),
          String(row.OwnerName ?? ''),
          String(row.Phone ?? ''),
          String(row.LineID ?? ''),
          String(row.Facebook ?? ''),
          String(row.Website ?? ''),
          String(row.LocationText ?? ''),
          String(row.Latitude ?? ''),
          String(row.Longitude ?? ''),
          String(row.BusinessType ?? ''),
          String(row.ProductCategory ?? '[]'),
          String(row.BusinessLevel ?? ''),
          String(row.MainProducts ?? ''),
          String(row.ProductionCapacity ?? ''),
          String(row.SalesChannel ?? '[]'),
          String(row.AvgPrice ?? ''),
          String(row.BusinessStatus ?? ''),
          String(row.PotentialLevel ?? ''),
          String(row.Issues ?? ''),
          String(row.SupportNeeded ?? ''),
          String(row.Note ?? ''),
          String(row.ShopHistory ?? ''),
          normalizeTimestamp(row.CreatedAt) || new Date().toISOString(),
          String(row.CreatedBy ?? '') || 'Guest',
          normalizeTimestamp(row.UpdatedAt) || normalizeTimestamp(row.CreatedAt) || new Date().toISOString(),
          String(row.UpdatedBy ?? '') || 'Guest',
          String(row.IsDeleted ?? 'FALSE') || 'FALSE',
          normalizeTimestamp(row.DeletedAt) || null,
          String(row.DeletedBy ?? '') || null,
        ]
      );
      migrated++;
    }
    console.log(`  … shops ${Math.min(i + BATCH_SIZE, pending.length)}/${pending.length}`);
  }
  console.log(`✓ Shops: ${migrated}`);
  return migrated;
}

async function migrateProducts() {
  const { records } = readData('Products');
  const existing = new Set((await db.query(`SELECT product_id FROM products`)).map((r) => r.product_id));
  const pending = records.filter((r) => String(r.ProductID ?? '').trim() && !existing.has(String(r.ProductID).trim()));
  console.log(`Products: ทั้งหมด ${records.length}, เหลือ ${pending.length}`);
  let migrated = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    for (const row of pending.slice(i, i + BATCH_SIZE)) {
      await db.execute(
        `INSERT OR REPLACE INTO products (
          product_id, shop_id, product_name, product_category, description, price, unit,
          sort_order, is_deleted, created_at, created_by, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(row.ProductID).trim(),
          String(row.ShopID ?? ''),
          String(row.ProductName ?? ''),
          String(row.ProductCategory ?? ''),
          String(row.Description ?? ''),
          String(row.Price ?? ''),
          String(row.Unit ?? ''),
          Number(row.SortOrder ?? 0) || 0,
          String(row.IsDeleted ?? 'FALSE') || 'FALSE',
          normalizeTimestamp(row.CreatedAt) || new Date().toISOString(),
          String(row.CreatedBy ?? '') || 'Guest',
          normalizeTimestamp(row.UpdatedAt) || new Date().toISOString(),
          String(row.UpdatedBy ?? '') || 'Guest',
        ]
      );
      migrated++;
    }
    console.log(`  … products ${Math.min(i + BATCH_SIZE, pending.length)}/${pending.length}`);
  }
  console.log(`✓ Products: ${migrated}`);
  return migrated;
}

async function migrateGallery() {
  const { records } = readData('ShopGallery');
  const existing = new Set((await db.query(`SELECT gallery_id FROM shop_gallery`)).map((r) => r.gallery_id));
  const sourceIdCounts = new Map();
  for (const row of records) {
    const id = String(row.GalleryID ?? '').trim();
    if (id) sourceIdCounts.set(id, (sourceIdCounts.get(id) || 0) + 1);
  }
  const sourceIdOccurrences = new Map();
  const normalizedRecords = records
    .map((row) => {
      const sourceId = String(row.GalleryID ?? '').trim();
      if (!sourceId) return null;
      const occurrence = sourceIdOccurrences.get(sourceId) || 0;
      sourceIdOccurrences.set(sourceId, occurrence + 1);
      const count = sourceIdCounts.get(sourceId) || 0;
      // Keep the final occurrence on the original PK for backward compatibility;
      // assign deterministic import IDs to earlier duplicate source rows.
      const galleryId = count > 1 && occurrence < count - 1
        ? `GAL-IMPORT-${safeSegment(sourceId)}-${occurrence + 1}`
        : sourceId;
      return { ...row, _migrationGalleryId: galleryId };
    })
    .filter(Boolean);
  const pending = normalizedRecords.filter((r) => !existing.has(r._migrationGalleryId));
  console.log(`ShopGallery: ทั้งหมด ${records.length}, เหลือ ${pending.length} (รวมดึงรูปจาก Drive)`);
  const stats = { migrated: 0, images: 0, driveFailed: 0 };
  let done = 0;
  for (const row of pending) {
    const galleryId = String(row._migrationGalleryId).trim();
    const shopId = String(row.ShopID ?? '').trim();
    const driveFileId = String(row.DriveFileId ?? '').trim();
    let objectKey = '';
    if (!DRIVE_ONLY && driveFileId) {
      // รูป Drive → R2 (COPY ONLY — ไม่ลบไฟล์ต้นฉบับ)
      const registered = await db.query(
        `SELECT object_key FROM r2_objects WHERE source = 'drive' AND source_ref = ? LIMIT 1`,
        [driveFileId]
      );
      if (registered.length > 0) {
        objectKey = registered[0].object_key;
      } else {
        const key = `shops/${safeSegment(shopId)}/${safeSegment(galleryId)}`;
        try {
          const bytes =
            (await fetchWithRetry(`https://lh3.googleusercontent.com/d/${driveFileId}=w800`).catch(() => null)) ??
            (await fetchWithRetry(`https://drive.google.com/uc?export=download&id=${driveFileId}`));
          objectKey = await uploadImage({
            key: `${key}.${extOf(sniffImageMime(bytes) ?? 'image/jpeg')}`,
            bytes,
            shopId,
            source: 'drive',
            sourceRef: driveFileId,
          });
          stats.images++;
        } catch (err) {
          stats.driveFailed++;
          console.error(`✗ Drive ${driveFileId} (${galleryId}): ${err.message} — เก็บ URL เดิมไว้ก่อน`);
        }
      }
    }
    await db.execute(
      `INSERT OR REPLACE INTO shop_gallery (
        gallery_id, shop_id, product_id, image_role, display_name, drive_file_id, drive_url,
        thumbnail_url, mime_type, file_size, width, height, sort_order, status,
        created_at, created_by, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        galleryId,
        shopId,
        String(row.ProductID ?? ''),
        String(row.ImageRole ?? 'gallery') || 'gallery',
        String(row.DisplayName ?? ''),
        driveFileId,
        // ถ้า migrate ขึ้น R2 แล้ว ปล่อยว่าง — Worker resolve จาก r2_objects (source_ref = DriveFileId)
        objectKey ? '' : String(row.DriveUrl ?? ''),
        objectKey ? '' : String(row.ThumbnailUrl ?? ''),
        String(row.MimeType ?? 'image/jpeg') || 'image/jpeg',
        Number(row.FileSize ?? 0) || 0,
        String(row.Width ?? ''),
        String(row.Height ?? ''),
        Number(row.SortOrder ?? 0) || 0,
        String(row.Status ?? 'ACTIVE') || 'ACTIVE',
        normalizeTimestamp(row.CreatedAt) || new Date().toISOString(),
        String(row.CreatedBy ?? '') || 'Guest',
        normalizeTimestamp(row.UpdatedAt) || new Date().toISOString(),
        String(row.UpdatedBy ?? '') || 'Guest',
      ]
    );
    stats.migrated++;
    done++;
    if (done % BATCH_SIZE === 0) console.log(`  … gallery ${done}/${pending.length}`);
  }
  console.log(`✓ ShopGallery: ${stats.migrated}, รูป Drive → R2: ${stats.images}, fetch ไม่ผ่าน: ${stats.driveFailed}`);
  return stats;
}

async function syncIdCounters() {
  const updates = [
    ['SHOP', `SELECT MAX(CAST(SUBSTR(shop_id, 6) AS INTEGER)) AS m FROM shops`],
    ['PROD', `SELECT MAX(CAST(SUBSTR(product_id, 6) AS INTEGER)) AS m FROM products`],
    ['GAL', `SELECT MAX(CAST(SUBSTR(gallery_id, 5) AS INTEGER)) AS m FROM shop_gallery`],
  ];
  for (const [name, sql] of updates) {
    const rows = await db.query(sql);
    const max = Number(rows[0]?.m ?? 0) || 0;
    await db.execute(`UPDATE id_counters SET next_value = ? WHERE name = ?`, [max + 1, name]);
    console.log(`✓ counter ${name} → next ${max + 1}`);
  }
}

console.log('── migrate (COPY ONLY) ──');
await migrateUsers();
await migrateLegacyRecords();
await migrateShops();
await migrateProducts();
await migrateGallery();
await syncIdCounters();
console.log('เสร็จ — รัน `npm run verify` เพื่อตรวจ parity');
