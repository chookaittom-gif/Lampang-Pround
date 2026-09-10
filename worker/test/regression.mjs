/**
 * Regression suite (Phase 7) — รันกับ wrangler dev ที่ http://127.0.0.1:8787
 *   npm run test:regression            (default env: PDF_NATIVE off → ต้องได้ 501 gate)
 *   PDF_NATIVE=1 npm run test:regression  (รันบน server ที่สั่ง --var PDF_NATIVE:on)
 * ครอบคลุม: Auth/Session/Guest/Permission · CRUD · Products/Gallery/R2 ·
 *  Shops · Search-list parity · Excel/PDF · GPS · Duplicate/Concurrent · Unauthorized
 */

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const PDF_NATIVE = process.env.PDF_NATIVE === '1';

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function eq(actual, expected, msg) {
  assert(
    actual === expected,
    `${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

async function rpc(fn, payload) {
  const resp = await fetch(`${BASE}/api/rpc/${encodeURIComponent(fn)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  let data = null;
  try {
    data = await resp.json();
  } catch {
    data = null;
  }
  return { status: resp.status, data };
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed++;
    failures.push([name, err.message]);
    console.log(`FAIL  ${name} — ${err.message}`);
  }
}

async function countPdfImageDrawOperations(buffer) {
  const { inflateSync } = await import('node:zlib');
  const raw = Buffer.from(buffer);
  const latin = raw.toString('latin1');
  let content = '';
  let cursor = 0;
  while ((cursor = latin.indexOf('stream', cursor)) >= 0) {
    let start = cursor + 6;
    if (latin[start] === '\r') start++;
    if (latin[start] === '\n') start++;
    const end = latin.indexOf('endstream', start);
    if (end < 0) break;
    try {
      content += inflateSync(raw.subarray(start, end)).toString('latin1');
    } catch {
      /* skip non-deflate streams and embedded image bytes */
    }
    cursor = end + 9;
  }
  return (content.match(/(?:^|\r?\n)\/Image-[0-9]+ Do(?:\r?\n|$)/g) || []).length;
}

const TINY_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

const runId = String(Date.now()).slice(-8);
const OWNER = `testowner_${runId}`;
const OTHER = `testother_${runId}`;

const recordData = (suffix) => ({
  business_name: `ร้านทดสอบ ${suffix}`,
  owner_name: 'สมชาย ทดสอบ',
  phone: '0812345678',
  line_id: 'testline',
  facebook: 'fb.com/test',
  website: 'test.com',
  location_text: '123 ถ.ทดสอบ ต.ในเมือง อ.เมือง จ.ลำปาง 42000',
  latitude: '18.2923',
  longitude: '99.5078',
  business_type: 'แปรรูป',
  product_category: ['ผลไม้แปรรูป'],
  business_level: 'ระดับ 1',
  production_capacity: '100 ชิ้น/วัน',
  sales_channel: ['หน้าร้าน', 'ออนไลน์'],
  business_status: 'เปิดใช้งาน',
  potential_level: 'ปานกลาง',
  issues: 'ทุนหมุนเวียน',
  support_needed: 'ตลาด',
  note: 'บันทึกทดสอบ',
  shop_history: 'ก่อตั้ง 2563',
  image_shop: `data:image/jpeg;base64,${TINY_JPEG_B64}`,
  products: [
    { productName: 'กล้วยตาก', productCategory: 'ขนมแห้ง', price: '35', unit: 'ถุง' },
    { productName: 'มะม่วงแช่อิ่ม', productCategory: 'ผลไม้แปรรูป', price: '50', unit: 'โหล' },
  ],
});

let ownerToken;
let otherToken;
let savedBackendId;
let savedLamproundId;
let guestKey;
let guestBackendId;
let galleryId;
let galleryUrl;
let shopId;

async function main() {
  console.log(`Regression suite → ${BASE}${PDF_NATIVE ? ' (PDF_NATIVE mode)' : ''}`);
  console.log('='.repeat(70));

  await test('GET /api/config → appName/orgName', async () => {
    const resp = await fetch(`${BASE}/api/config`);
    eq(resp.status, 200, 'status');
    const data = await resp.json();
    assert(typeof data.appName === 'string' && data.appName.includes('Lampang Pround'), 'appName');
  });

  await test('CORS preflight → 204 + allow-origin', async () => {
    const resp = await fetch(`${BASE}/api/rpc/loginUser`, {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5173' },
    });
    eq(resp.status, 204, 'status');
    assert(resp.headers.get('access-control-allow-origin') !== null, 'allow-origin present');
  });

  await test('Static frontend (GET /) → 200 HTML', async () => {
    const resp = await fetch(`${BASE}/`);
    eq(resp.status, 200, 'status');
    const html = await resp.text();
    assert(html.toLowerCase().includes('<html'), 'html body');
  });

  await test('Unknown RPC → 404', async () => {
    const { status, data } = await rpc('noSuchFunction', {});
    eq(status, 404, 'status');
    eq(data.success, false, 'success=false');
  });

  await test('registerUser: ข้อมูลไม่ครบ → ปฏิเสธ', async () => {
    const { data } = await rpc('registerUser', { name: '', username: '', password: '' });
    eq(data.success, false, 'success');
    assert(String(data.message).includes('กรุณากรอก'), 'message');
  });

  await test('registerUser: concurrent สมัครชื่อซ้ำ → สำเร็จคนเดียว (duplicate guard)', async () => {
    const results = await Promise.all([
      rpc('registerUser', { name: 'ซ้อน', username: `dup_${runId}`, password: 'x' }),
      rpc('registerUser', { name: 'ซ้อน', username: `dup_${runId}`, password: 'x' }),
    ]);
    const okCount = results.filter((r) => r.data && r.data.success === true).length;
    eq(okCount, 1, 'exactly one success');
  });

  await test('registerUser: owner สมัครสำเร็จ', async () => {
    const { data } = await rpc('registerUser', {
      name: 'เจ้าของร้าน',
      username: OWNER,
      email: `${OWNER}@test.local`,
      password: 'pass1234',
    });
    eq(data.success, true, 'success');
  });

  await test('registerUser: สมัครชื่อซ้ำกับ owner → ปฏิเสธ', async () => {
    const { data } = await rpc('registerUser', {
      name: 'อื่น',
      username: OWNER,
      password: 'pass1234',
    });
    eq(data.success, false, 'success');
    assert(String(data.message).includes('มีในระบบแล้ว'), 'message');
  });

  await test('registerUser: อีเมลซ้ำ → ปฏิเสธ', async () => {
    const { data } = await rpc('registerUser', {
      name: 'อื่น',
      username: `x_${runId}`,
      email: `${OWNER}@test.local`,
      password: 'pass1234',
    });
    eq(data.success, false, 'success');
    assert(String(data.message).includes('อีเมลนี้ถูกใช้งานแล้ว'), 'message');
  });

  await test('registerUser: other สมัครสำเร็จ', async () => {
    const { data } = await rpc('registerUser', {
      name: 'ผู้ใช้อื่น',
      username: OTHER,
      password: 'pass1234',
    });
    eq(data.success, true, 'success');
  });

  await test('loginUser: ไม่กรอก → ปฏิเสธ', async () => {
    const { data } = await rpc('loginUser', { username: '', password: '' });
    eq(data.success, false, 'success');
  });

  await test('loginUser: รหัสผิด → ปฏิเสธ', async () => {
    const { data } = await rpc('loginUser', { username: OWNER, password: 'wrong' });
    eq(data.success, false, 'success');
    assert(String(data.message).includes('ไม่ถูกต้อง'), 'message');
  });

  await test('loginUser: owner สำเร็จ → token + user', async () => {
    const { data } = await rpc('loginUser', { username: OWNER, password: 'pass1234' });
    eq(data.success, true, 'success');
    assert(typeof data.token === 'string' && data.token.length > 0, 'token');
    eq(data.user.role, 'user', 'role');
    eq(String(data.user.username).toLowerCase(), OWNER, 'username');
    ownerToken = data.token;
  });

  await test('loginUser: login ซ้ำ → single-session ทำให้ token เก่าตาย', async () => {
    const { data } = await rpc('loginUser', { username: OWNER, password: 'pass1234' });
    eq(data.success, true, 're-login success');
    const stale = ownerToken;
    ownerToken = data.token;
    const check = await rpc('updateRecord', { token: stale, backendId: 'x', data: {} });
    eq(check.data.sessionInvalid, true, 'stale token → sessionInvalid');
  });

  await test('getRecords (guest) → array', async () => {
    const { status, data } = await rpc('getRecords', {});
    eq(status, 200, 'status');
    assert(Array.isArray(data), 'array');
  });

  await test('saveRecord (owner + products + dataURL รูป) → สำเร็จ', async () => {
    const { data } = await rpc('saveRecord', { token: ownerToken, data: recordData('A') });
    eq(data.success, true, 'success');
    assert(typeof data.id === 'string' && /^LR-\d{6}-\d{4}$/.test(data.id), 'LamproundID LR-YYMMDD-XXXX');
    assert(typeof data.backendId === 'string' && data.backendId, 'backendId');
    assert(data.guestAccessKey === undefined, 'auth ต้องไม่ได้ guest key');
    savedLamproundId = data.id;
    savedBackendId = data.backendId;
  });

  await test('getRecordDetail → ข้อมูล+สินค้า+รูป R2 URL', async () => {
    const { data } = await rpc('getRecordDetail', { backendId: savedBackendId });
    eq(data.success, true, 'success');
    const rec = data.record;
    eq(String(rec.BusinessName), 'ร้านทดสอบ A', 'BusinessName parity key');
    eq(rec.LamproundID, savedLamproundId, 'LamproundID');
    assert(Array.isArray(rec.products) && rec.products.length === 2, 'products.length=2');
    assert(String(rec.ImageShop || '').startsWith(`${BASE}/images/`), 'ImageShop URL');
  });

  await test('getRecords → พบ record ใหม่ (list parity)', async () => {
    const { data } = await rpc('getRecords', {});
    const found = data.find((r) => r.BackendId === savedBackendId);
    assert(found, 'record appears in list');
    eq(found.BusinessName, 'ร้านทดสอบ A', 'list field parity');
    assert(typeof found.CreatedAt === 'string' && found.CreatedAt.length > 0, 'CreatedAt remains formatted');
  });

  await test('updateRecord โดยผู้อื่น → ไม่มีสิทธิ์', async () => {
    const { data: login } = await rpc('loginUser', { username: OTHER, password: 'pass1234' });
    otherToken = login.token;
    const { data } = await rpc('updateRecord', {
      token: otherToken,
      backendId: savedBackendId,
      data: { business_name: 'ถูกแก้' },
    });
    eq(data.success, false, 'success');
    assert(String(data.message).includes('ไม่มีสิทธิ์'), 'message');
  });

  await test('updateRecord เจ้าของ → สำเร็จและค่าเปลี่ยนจริง', async () => {
    const { data } = await rpc('updateRecord', {
      token: ownerToken,
      backendId: savedBackendId,
      data: { business_name: 'ร้านทดสอบ A (แก้ไข)', phone: '0898765432' },
    });
    eq(data.success, true, 'success');
    const detail = await rpc('getRecordDetail', { backendId: savedBackendId });
    eq(String(detail.data.record.BusinessName), 'ร้านทดสอบ A (แก้ไข)', 'name updated');
    eq(String(detail.data.record.Phone), '0898765432', 'phone normalized (digits-only parity)');
  });

  await test('saveRecord (guest) → ได้ guestAccessKey', async () => {
    const { data } = await rpc('saveRecord', { data: recordData('G') });
    eq(data.success, true, 'success');
    assert(typeof data.guestAccessKey === 'string' && data.guestAccessKey, 'guestAccessKey');
    guestBackendId = data.backendId;
    guestKey = data.guestAccessKey;
  });

  await test('updateRecord guest ไม่มี key → ปฏิเสธ', async () => {
    const { data } = await rpc('updateRecord', {
      backendId: guestBackendId,
      data: { business_name: 'แก้โดย guest' },
    });
    eq(data.success, false, 'success');
    assert(String(data.message).includes('เข้าสู่ระบบ'), 'message');
  });

  await test('updateRecord guest มี guestAccessKey → สำเร็จ', async () => {
    const { data } = await rpc('updateRecord', {
      backendId: guestBackendId,
      guestAccessKey: guestKey,
      data: { business_name: 'แก้โดย guest' },
    });
    eq(data.success, true, 'success');
  });

  await test('updateRecord guest ใช้ key ผิดร้าน → ปฏิเสธ', async () => {
    const { data } = await rpc('updateRecord', {
      backendId: savedBackendId,
      guestAccessKey: guestKey,
      data: { business_name: 'แอบแก้' },
    });
    eq(data.success, false, 'success');
  });

  await test('deleteRecord guest → ปฏิเสธ', async () => {
    const { data } = await rpc('deleteRecord', { backendId: guestBackendId });
    eq(data.success, false, 'success');
    assert(String(data.message).includes('เข้าสู่ระบบ'), 'message');
  });

  await test('deleteRecord ผู้อื่น → ไม่มีสิทธิ์', async () => {
    const { data } = await rpc('deleteRecord', {
      token: otherToken,
      backendId: savedBackendId,
    });
    eq(data.success, false, 'success');
    assert(String(data.message).includes('ไม่มีสิทธิ์'), 'message');
  });

  await test('deleteRecord เจ้าของ → soft delete สำเร็จ', async () => {
    const { data } = await rpc('deleteRecord', {
      token: ownerToken,
      backendId: savedBackendId,
    });
    eq(data.success, true, 'success');
    assert(String(data.message).includes('ย้ายรายการ'), 'message');
  });

  await test('soft delete parity: หายจาก getRecords, หลักฐานอยู่ใน detail', async () => {
    const list = await rpc('getRecords', {});
    assert(!list.data.some((r) => r.BackendId === savedBackendId), 'gone from list');
    const detail = await rpc('getRecordDetail', { backendId: savedBackendId });
    eq(detail.data.success, false, 'detail success=false');
    assert(String(detail.data.message).includes('ถูกลบ'), 'deleted message');
  });

  await test('uploadGalleryImage guest ไม่มี key → ปฏิเสธ', async () => {
    const { data } = await rpc('uploadGalleryImage', {
      shopId: guestBackendId,
      fileName: 'test.jpg',
      base64: TINY_JPEG_B64,
    });
    eq(data.success, false, 'success');
    assert(String(data.message).includes('เข้าสู่ระบบ'), 'message');
  });

  await test('uploadGalleryImage guest + key → สำเร็จ ลง R2', async () => {
    const { data } = await rpc('uploadGalleryImage', {
      shopId: guestBackendId,
      guestAccessKey: guestKey,
      fileName: 'gallery.jpg',
      base64: TINY_JPEG_B64,
      imageRole: 'gallery',
    });
    eq(data.success, true, 'success');
    assert(typeof data.galleryId === 'string' && data.galleryId.startsWith('GAL-'), 'galleryId');
    assert(String(data.driveUrl).startsWith(`${BASE}/images/`), 'driveUrl');
    galleryId = data.galleryId;
    galleryUrl = data.driveUrl;
  });

  await test('GET /images/<key> → ไฟล์ JPEG จริงจาก R2', async () => {
    const resp = await fetch(galleryUrl);
    eq(resp.status, 200, 'status');
    const buf = new Uint8Array(await resp.arrayBuffer());
    assert(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff, 'JPEG magic bytes');
  });

  await test('getShopGallery (backendId) → เห็นรูปที่อัปโหลด', async () => {
    const { data } = await rpc('getShopGallery', { backendId: guestBackendId });
    assert(Array.isArray(data) && data.some((g) => g.GalleryID === galleryId), 'gallery listed');
  });

  await test('softDeleteGalleryImage guest ไม่มี key → ปฏิเสธ', async () => {
    const { data } = await rpc('softDeleteGalleryImage', {
      galleryId,
      backendId: guestBackendId,
    });
    eq(data.success, false, 'success');
  });

  await test('softDeleteGalleryImage guest + key → สำเร็จ, หายจาก gallery', async () => {
    const { data } = await rpc('softDeleteGalleryImage', {
      galleryId,
      backendId: guestBackendId,
      guestAccessKey: guestKey,
    });
    eq(data.success, true, 'success');
    const gallery = await rpc('getShopGallery', { backendId: guestBackendId });
    assert(!gallery.data.some((g) => g.GalleryID === galleryId), 'gone from gallery');
  });

  await test('uploadGalleryImage ด้วย token เจ้าของ → สำเร็จ', async () => {
    const { data } = await rpc('uploadGalleryImage', {
      token: ownerToken,
      shopId: guestBackendId,
      fileName: 'owner.jpg',
      base64: TINY_JPEG_B64,
    });
    eq(data.success, true, 'success');
  });

  await test('upsertShopRecord guest → ปฏิเสธ', async () => {
    const { data } = await rpc('upsertShopRecord', { business_name: 'ร้านซ่อน' });
    eq(data.success, false, 'success');
    eq(data.sessionInvalid, true, 'sessionInvalid flag');
  });

  await test('upsertShopRecord (owner) → สร้าง SHOP-xxx สำเร็จ', async () => {
    const { data } = await rpc('upsertShopRecord', {
      token: ownerToken,
      legacyBackendId: guestBackendId,
      business_name: 'ร้านข้อมูลเต็ม',
      owner_name: 'เจ้าของ',
      phone: '0812345678',
      products: [{ productName: 'สินค้าร้าน', price: '100', unit: 'ชิ้น' }],
    });
    eq(data.success, true, 'success');
    assert(typeof data.shopId === 'string' && data.shopId.startsWith('SHOP-'), 'shopId');
    shopId = data.shopId;
  });

  await test('getShopRecord → shop + products + gallery (รวม legacy parity)', async () => {
    const { data } = await rpc('getShopRecord', { shopId });
    eq(data.success, true, 'success');
    assert(data.shop && String(data.shop.ShopID || data.shop.shop_id || '') !== '', 'shop');
    assert(Array.isArray(data.products) && data.products.length === 3, 'products = SHOP(1) + legacy(2)');
    assert(Array.isArray(data.gallery), 'gallery array');
  });

  await test('getShopRecord ด้วย legacyBackendId → หาร้านเดิมได้', async () => {
    const { data } = await rpc('getShopRecord', { legacyBackendId: guestBackendId });
    eq(data.success, true, 'success');
  });

  await test('replaceProductsByShopId → สำเร็จ สินค้าถูกแทนที่', async () => {
    const { data } = await rpc('replaceProductsByShopId', {
      token: ownerToken,
      shopId,
      products: [
        { productName: 'สินค้าใหม่ 1', price: '10', unit: 'ชิ้น' },
        { productName: 'สินค้าใหม่ 2', price: '20', unit: 'ชิ้น' },
        { productName: 'สินค้าใหม่ 3', price: '30', unit: 'ชิ้น' },
      ],
    });
    eq(data.success, true, 'success');
    const shop = await rpc('getShopRecord', { shopId });
    eq(shop.data.products.length, 5, 'products = SHOP(3 แทนที่) + legacy(2) parity');
  });

  await test('replaceProductsByShopId guest → ปฏิเสธ', async () => {
    const { data } = await rpc('replaceProductsByShopId', { shopId, products: [] });
    eq(data.success, false, 'success');
  });

  await test('upsertShopRecord ผู้อื่นแก้ร้านของ owner → ไม่มีสิทธิ์ (Q1/Q5)', async () => {
    const { data } = await rpc('upsertShopRecord', {
      token: otherToken,
      shopId,
      business_name: 'แอบแก้ร้าน',
    });
    eq(data.success, false, 'success');
    assert(String(data.message).includes('ไม่มีสิทธิ์'), 'message');
  });

  await test('upsertShopRecord guest + allowGuestPdf → ปฏิเสธ (ปิด path Q5)', async () => {
    const { data } = await rpc('upsertShopRecord', {
      allowGuestPdf: true,
      legacyBackendId: guestBackendId,
      business_name: 'มุดสร้างร้าน',
    });
    eq(data.success, false, 'success');
    eq(data.sessionInvalid, true, 'sessionInvalid flag');
  });

  await test('replaceProductsByShopId ผู้อื่น → ไม่มีสิทธิ์ (Q5)', async () => {
    const { data } = await rpc('replaceProductsByShopId', {
      token: otherToken,
      shopId,
      products: [{ productName: 'แอบใส่', price: '1' }],
    });
    eq(data.success, false, 'success');
    assert(String(data.message).includes('ไม่มีสิทธิ์'), 'message');
  });

  await test('replaceProductsByShopId ร้านไม่มีในระบบ → ปฏิเสธ', async () => {
    const { data } = await rpc('replaceProductsByShopId', {
      token: ownerToken,
      shopId: 'SHOP-NOEXIST',
      products: [],
    });
    eq(data.success, false, 'success');
    assert(String(data.message).includes('ไม่พบร้านค้า'), 'message');
  });

  await test('admin แก้ร้านของคนอื่นได้ (กติกา admin → ทุกร้าน)', async () => {
    const { spawnSync } = await import('node:child_process');
    const promote = spawnSync(
      `npx wrangler d1 execute lampang-pround --local --command "UPDATE users SET role='admin' WHERE username='${OTHER}'"`,
      { cwd: process.cwd(), stdio: 'ignore', shell: true }
    );
    assert(promote.status === 0, 'promote admin via d1');
    const { data: login } = await rpc('loginUser', { username: OTHER, password: 'pass1234' });
    eq(login.success, true, 'admin login');
    eq(login.user.role, 'admin', 'role=admin');
    otherToken = login.token;
    const { data } = await rpc('upsertShopRecord', {
      token: otherToken,
      shopId,
      note: 'แก้โดย admin',
    });
    eq(data.success, true, 'admin edits any shop');
  });

  await test('resolveMapLocationUrl: พิกัดตรง → lat/lng', async () => {
    const { data } = await rpc('resolveMapLocationUrl', {
      url: 'https://maps.google.com/?q=18.2923,99.5078',
    });
    eq(data.success, true, 'success');
    eq(data.lat, '18.292300', 'lat');
    eq(data.lng, '99.507800', 'lng');
  });

  await test('resolveMapLocationUrl: ว่าง → ปฏิเสธ', async () => {
    const { data } = await rpc('resolveMapLocationUrl', { url: '' });
    eq(data.success, false, 'success');
  });

  await test('exportCleanExcelFile → url + count, ดาวน์โหลดได้ไฟล์ xlsx จริง', async () => {
    const { data } = await rpc('exportCleanExcelFile', {
      token: otherToken,
      recordIds: [guestBackendId],
    });
    eq(data.success, true, 'success');
    eq(data.count, 1, 'count');
    const resp = await fetch(data.url);
    eq(resp.status, 200, 'download status');
    assert(
      String(resp.headers.get('content-type') || '').includes('spreadsheetml'),
      'xlsx content-type'
    );
    const buf = new Uint8Array(await resp.arrayBuffer());
    assert(buf[0] === 0x50 && buf[1] === 0x4b, 'PK magic');
  });

  await test('exportCleanExcelFile guest → สำเร็จ', async () => {
    const { data } = await rpc('exportCleanExcelFile', { recordIds: [guestBackendId] });
    eq(data.success, true, 'success');
    eq(data.count, 1, 'count');
    const resp = await fetch(data.url);
    eq(resp.status, 200, 'download status');
    assert(
      String(resp.headers.get('content-type') || '').includes('spreadsheetml'),
      'xlsx content-type'
    );
    const buf = new Uint8Array(await resp.arrayBuffer());
    assert(buf[0] === 0x50 && buf[1] === 0x4b, 'PK magic');
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf);
    const sheet = workbook.getWorksheet('ข้อมูลผู้ประกอบการ');
    assert(sheet, 'export worksheet');
    eq(sheet.pageSetup.paperSize, 9, 'A4 paper size');
    eq(sheet.pageSetup.orientation, 'landscape', 'landscape orientation');
    eq(sheet.pageSetup.fitToPage, true, 'fit to page');
    eq(sheet.pageSetup.fitToWidth, 1, 'one page wide');
    eq(sheet.pageSetup.fitToHeight, 0, 'unlimited page height');
    eq(sheet.pageSetup.printTitlesRow, '1:1', 'repeat header row');
    assert(sheet.getCell('F2').alignment.wrapText === true, 'long text wrap');
    assert(Number(sheet.getRow(2).height) > 24, 'long text row height');
  });

  await test('exportCleanExcelFile 300 IDs → batching avoids SQLite variable limit', async () => {
    const recordIds = [
      guestBackendId,
      ...Array.from({ length: 299 }, (_, index) => `SMOKE-NOT-FOUND-${runId}-${index}`),
    ];
    const { data } = await rpc('exportCleanExcelFile', { recordIds });
    eq(data.success, true, 'success');
    eq(data.count, 1, 'count');
    const resp = await fetch(data.url);
    eq(resp.status, 200, 'download status');
    const buf = new Uint8Array(await resp.arrayBuffer());
    assert(buf[0] === 0x50 && buf[1] === 0x4b, 'PK magic');
  });

  await test('exportCleanExcelFile user → ห้าม export รายการของผู้อื่น', async () => {
    const { data } = await rpc('exportCleanExcelFile', {
      token: ownerToken,
      recordIds: [guestBackendId],
    });
    eq(data.success, false, 'success');
    assert(String(data.message).includes('มีสิทธิ์'), 'user export ownership message');
  });

  await test('exportShopPdf user → ห้าม export รายการของผู้อื่น', async () => {
    const { data } = await rpc('exportShopPdf', {
      token: ownerToken,
      backendId: guestBackendId,
    });
    eq(data.success, false, 'success');
    assert(String(data.message).includes('ไม่มีสิทธิ์'), 'user PDF ownership message');
  });

  await test('cleanupTemporaryPdfFiles → parity success', async () => {
    const { data } = await rpc('cleanupTemporaryPdfFiles', {});
    eq(data.success, true, 'success');
  });

  await test('logoutUser → token ตายทันที', async () => {
    const { data: login } = await rpc('loginUser', { username: OTHER, password: 'pass1234' });
    const tok = login.token;
    const out = await rpc('logoutUser', { token: tok });
    eq(out.data.success, true, 'logout success');
    const after = await rpc('updateRecord', { token: tok, backendId: guestBackendId, data: {} });
    eq(after.data.sessionInvalid, true, 'token dead → sessionInvalid');
  });

  await test('Double-submit saveRecord ขนาน → สองรายการ (parity กับ GAS)', async () => {
    const [a, b] = await Promise.all([
      rpc('saveRecord', { token: ownerToken, data: recordData('D1') }),
      rpc('saveRecord', { token: ownerToken, data: recordData('D1') }),
    ]);
    eq(a.data.success, true, 'first success');
    eq(b.data.success, true, 'second success');
    assert(a.data.backendId !== b.data.backendId, 'distinct backendIds, no corruption');
    assert(a.data.id !== b.data.id, 'distinct LamproundIDs (counter atomic)');
  });

  if (PDF_NATIVE) {
    await test('exportShopPdf guest → ได้ PDF จริง + รูปภาพ', async () => {
      const { data } = await rpc('exportShopPdf', { backendId: guestBackendId });
      eq(data.success, true, `success (message: ${data && data.message})`);
      const resp = await fetch(data.pdfUrl);
      eq(resp.status, 200, 'download status');
      const buf = new Uint8Array(await resp.arrayBuffer());
      assert(buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46, '%PDF magic');
      assert(Buffer.from(buf).toString('latin1').includes('/Subtype /Image'), 'PDF embeds gallery image');
      assert(await countPdfImageDrawOperations(buf) >= 2, 'PDF draws image in product table and gallery');
    });

    await test('exportShopPdf (PDF_NATIVE=on) → ได้ PDF จริง + Sarabun', async () => {
      const { data } = await rpc('exportShopPdf', {
        token: otherToken,
        backendId: guestBackendId,
      });
      eq(data.success, true, `success (message: ${data && data.message})`);
      const resp = await fetch(data.pdfUrl);
      eq(resp.status, 200, 'download status');
      const buf = new Uint8Array(await resp.arrayBuffer());
      assert(buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46, '%PDF magic');
      assert(buf.length > 3000, 'PDF has real content');
      assert(Buffer.from(buf).toString('latin1').includes('/Subtype /Image'), 'PDF embeds gallery image');
      assert(
        String(resp.headers.get('content-disposition') || '').includes('.pdf'),
        'filename parity'
      );
    });

    await test('PDF ใช้ข้อมูล Shops row เป็นหลัก ไม่ใช่ legacy (Q6)', async () => {
      const { data } = await rpc('exportShopPdf', {
        token: otherToken,
        backendId: guestBackendId,
      });
      eq(data.success, true, 'success');
      const resp = await fetch(data.pdfUrl);
      const raw = Buffer.from(await resp.arrayBuffer());
      const latin = raw.toString('latin1');
      let searchable = latin;
      const { inflateSync } = await import('node:zlib');
      const re = /stream\r?\n/g;
      let m;
      while ((m = re.exec(latin)) !== null) {
        const start = m.index + m[0].length;
        const end = latin.indexOf('endstream', start);
        if (end < 0) continue;
        try {
          searchable += inflateSync(raw.subarray(start, end)).toString('latin1');
        } catch {
          /* ไม่ใช่ deflate — ข้าม */
        }
      }
      const nameHex = Buffer.from('ร้านข้อมูลเต็ม', 'utf16le')
        .swap16()
        .toString('hex')
        .toUpperCase();
      assert(
        searchable.toUpperCase().includes(nameHex),
        'PDF title มีชื่อร้านจาก Shops row (UTF-16BE hex)'
      );
    });
  } else {
    await test('exportShopPdf (gate ปิด) → 501 + ข้อความ parity gate', async () => {
      const { status, data } = await rpc('exportShopPdf', {
        token: otherToken,
        backendId: guestBackendId,
      });
      eq(status, 501, 'status 501');
      eq(data.success, false, 'success=false');
      assert(String(data.message).includes('รอพิสูจน์ parity'), 'gate message');
    });
  }

  console.log('='.repeat(70));
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const [name, msg] of failures) console.log(`  ✗ ${name}: ${msg}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('SUITE ERROR:', err);
  process.exit(1);
});
