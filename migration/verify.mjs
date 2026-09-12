#!/usr/bin/env node
/**
 * verify.mjs — ตรวจ parity หลัง migration (Master Prompt: ห้ามประกาศสำเร็จจนกว่าจะตรวจจริง)
 * ตรวจ: counts, duplicate IDs, orphan relations, missing images, soft-delete parity
 * ออกรายงาน migration/verification-report.json + console
 */
import fs from 'node:fs';
import path from 'node:path';
import { D1Client } from './lib/d1.mjs';

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
for (const name of ['CF_ACCOUNT_ID', 'CF_API_TOKEN', 'CF_D1_DATABASE_ID']) {
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

function readSource(name) {
  const file = path.join(process.cwd(), 'data', `${name}.json`);
  if (!fs.existsSync(file)) return { records: [] };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const report = { checkedAt: new Date().toISOString(), checks: [], pass: true };

function check(name, ok, detail) {
  report.checks.push({ name, ok, detail });
  if (!ok) report.pass = false;
  console.log(`${ok ? '✓' : '✗'} ${name}: ${detail}`);
}

async function count(sql, params = []) {
  const rows = await db.query(sql, params);
  return Number(rows[0]?.n ?? 0);
}

// 1. Source count = Target count
const sourceLegacy = readSource('LamproundData').records.filter((r) => String(r.BackendId ?? '').trim());
const sourceUsers = readSource('Users').records.filter((r) => String(r.Username ?? '').trim());
const sourceShops = readSource('Shops').records.filter((r) => String(r.ShopID ?? '').trim());
const sourceProducts = readSource('Products').records.filter((r) => String(r.ProductID ?? '').trim());
const sourceGallery = readSource('ShopGallery').records.filter((r) => String(r.GalleryID ?? '').trim());
const sourceRelationIds = new Set([
  ...sourceLegacy.map((r) => String(r.BackendId ?? '').trim()),
  ...sourceShops.map((r) => String(r.ShopID ?? '').trim()),
  ...sourceShops.map((r) => String(r.LegacyBackendId ?? '').trim()),
]);
const sourceOrphanProducts = sourceProducts.filter(
  (r) => String(r.ShopID ?? '').trim() && !sourceRelationIds.has(String(r.ShopID).trim())
).length;
const sourceOrphanGallery = sourceGallery.filter(
  (r) => String(r.ShopID ?? '').trim() && !sourceRelationIds.has(String(r.ShopID).trim())
).length;

const targetLegacy = await count(`SELECT COUNT(*) AS n FROM legacy_records`);
const targetUsers = await count(`SELECT COUNT(*) AS n FROM users`);
const targetShops = await count(`SELECT COUNT(*) AS n FROM shops`);
const targetProducts = await count(`SELECT COUNT(*) AS n FROM products`);
const targetGallery = await count(`SELECT COUNT(*) AS n FROM shop_gallery`);

check('Legacy count', targetLegacy >= sourceLegacy.length, `source ${sourceLegacy.length} / target ${targetLegacy} (target ≥ source เพราะระบบใหม่มีข้อมูลที่ผู้ใช้เพิ่มหลัง export)`);
check('Users count', targetUsers >= sourceUsers.length, `source ${sourceUsers.length} / target ${targetUsers}`);
check('Shops count', targetShops >= sourceShops.length, `source ${sourceShops.length} / target ${targetShops}`);
check('Products count', targetProducts >= sourceProducts.length, `source ${sourceProducts.length} / target ${targetProducts}`);
check('Gallery count', targetGallery >= sourceGallery.length, `source ${sourceGallery.length} / target ${targetGallery}`);

// 2. Duplicate IDs (UNIQUE ต้องการันตี แต่ตรวจซ้ำเชิง logic ด้วย)
const dupLegacy = await db.query(
  `SELECT lampround_id, COUNT(*) AS c FROM legacy_records WHERE lampround_id IS NOT NULL AND lampround_id != '' GROUP BY lampround_id HAVING c > 1`
);
check('Duplicate LamproundID', dupLegacy.length === 0, dupLegacy.length ? JSON.stringify(dupLegacy) : 'none');

// 3. Missing migrated rows (ทุก source PK ต้องมีใน target)
const missing = { legacy: [], shops: [], products: [], gallery: [] };
const targetLegacyIds = new Set((await db.query(`SELECT backend_id FROM legacy_records`)).map((r) => r.backend_id));
for (const row of sourceLegacy) {
  const id = String(row.BackendId ?? '').trim();
  if (id && !targetLegacyIds.has(id)) missing.legacy.push(id);
}
const targetShopIds = new Set((await db.query(`SELECT shop_id FROM shops`)).map((r) => r.shop_id));
for (const row of sourceShops) {
  const id = String(row.ShopID ?? '').trim();
  if (id && !targetShopIds.has(id)) missing.shops.push(id);
}
const targetProductIds = new Set((await db.query(`SELECT product_id FROM products`)).map((r) => r.product_id));
for (const row of sourceProducts) {
  const id = String(row.ProductID ?? '').trim();
  if (id && !targetProductIds.has(id)) missing.products.push(id);
}
const targetGalleryIds = new Set((await db.query(`SELECT gallery_id FROM shop_gallery`)).map((r) => r.gallery_id));
for (const row of sourceGallery) {
  const id = String(row.GalleryID ?? '').trim();
  if (id && !targetGalleryIds.has(id)) missing.gallery.push(id);
}
check('Missing legacy rows', missing.legacy.length === 0, missing.legacy.length ? `${missing.legacy.length} แถว: ${missing.legacy.slice(0, 5).join(', ')}…` : 'none');
check('Missing shops', missing.shops.length === 0, missing.shops.length ? `${missing.shops.length}: ${missing.shops.slice(0, 5).join(', ')}` : 'none');
check('Missing products', missing.products.length === 0, missing.products.length ? `${missing.products.length}` : 'none');
check('Missing gallery', missing.gallery.length === 0, missing.gallery.length ? `${missing.gallery.length}` : 'none');

// 4. Orphan relations
const orphansProducts = await count(
  `SELECT COUNT(*) AS n FROM products p WHERE p.shop_id != '' AND p.shop_id NOT IN
   (SELECT backend_id FROM legacy_records UNION SELECT shop_id FROM shops UNION
    SELECT legacy_backend_id FROM shops WHERE legacy_backend_id != '')`
);
check('Orphan products', orphansProducts <= sourceOrphanProducts, `source ${sourceOrphanProducts} / target ${orphansProducts} แถว`);

const orphansGallery = await count(
  `SELECT COUNT(*) AS n FROM shop_gallery g WHERE g.shop_id != '' AND g.shop_id NOT IN
   (SELECT backend_id FROM legacy_records UNION SELECT shop_id FROM shops UNION
    SELECT legacy_backend_id FROM shops WHERE legacy_backend_id != '')`
);
check('Orphan gallery', orphansGallery <= sourceOrphanGallery, `source ${sourceOrphanGallery} / target ${orphansGallery} แถว`);

// 5. Missing images — gallery ที่ไม่มีทั้ง R2 key และ Drive URL
const missingImages = await count(
  `SELECT COUNT(*) AS n FROM shop_gallery g WHERE UPPER(g.status) != 'DELETED'
   AND g.drive_file_id != '' AND g.drive_url = '' AND g.thumbnail_url = ''
   AND NOT EXISTS (SELECT 1 FROM r2_objects ro WHERE ro.source = 'drive' AND ro.source_ref = g.drive_file_id)`
);
check('Missing images', missingImages === 0, `${missingImages} รูป`);

// 6. Soft delete parity
const srcDeleted = sourceLegacy.filter(
  (r) => ['true', '1', 'yes'].includes(String(r.IsDeleted ?? '').trim().toLowerCase())
).length;
const tgtDeleted = await count(`SELECT COUNT(*) AS n FROM legacy_records WHERE UPPER(is_deleted) = 'TRUE'`);
check('Soft delete parity (legacy)', tgtDeleted >= srcDeleted, `source ${srcDeleted} / target ${tgtDeleted}`);

const srcGalleryDeleted = sourceGallery.filter(
  (r) => String(r.Status ?? '').trim().toUpperCase() === 'DELETED'
).length;
const tgtGalleryDeleted = await count(`SELECT COUNT(*) AS n FROM shop_gallery WHERE UPPER(status) = 'DELETED'`);
check('Soft delete parity (gallery)', tgtGalleryDeleted >= srcGalleryDeleted, `source ${srcGalleryDeleted} / target ${tgtGalleryDeleted}`);

// 7. r2_objects registry sanity
const r2Count = await count(`SELECT COUNT(*) AS n FROM r2_objects`);
check('R2 registry', r2Count > 0 || sourceGallery.length === 0 || missingImages === 0, `${r2Count} objects (Drive-only is valid when URLs are present)`);

fs.writeFileSync(path.join(process.cwd(), 'verification-report.json'), JSON.stringify(report, null, 2));
console.log(report.pass ? '── ผ่านทุกข้อ ✓ ──' : '── มีข้อไม่ผ่าน ✗ (ดู verification-report.json) ──');
process.exit(report.pass ? 0 : 1);
