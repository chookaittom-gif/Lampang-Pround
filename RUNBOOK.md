# Runbook — Production Cutover & Rollback (เฟส 8)

> หลักการ: GAS + Google Sheets + Google Drive คงอยู่ครบจนกว่า Production verification ผ่าน
> Rollback ได้ทุกจุดก่อน cutover สุดท้าย

## สถานะของระบบใหม่ (ตอนนี้)

| ส่วน | สถานะ | หมายเหตุ |
|---|---|---|
| Worker API (19 RPC routes) | ✅ Regression 48/48 ผ่าน | auth/CRUD/guest/permission/single-session/R2/Excel/PDF + concurrency |
| D1 schema | ✅ | `worker/migrations/0001_init.sql` (27 commands) |
| Frontend (Vite+TS+Tailwind) | ✅ build ผ่าน | verbatim port + fetch adapter (`src/api.ts`) |
| Migration scripts | ✅ เขียนแล้ว รอ credentials | `migration/` (COPY ONLY, resumable) |
| PDF (pdf-lib+Sarabun) | ✅ สร้างได้ + ฝัง Sarabun ยืนยันแล้ว | เทียบ visual parity กับ GAS ต้องทำใน staging (ขั้นที่ 3) |
| Regression suite (เฟส 7) | ✅ อัตโนมัติ 54/53 กรณี | `cd worker && npm run test:regression` |
| Drift guard (freeze Code/) | ✅ `tools/check-drift.mjs` ผูกกับ deploy | hard-fail 2 คู่ + soft-warn Code.gs/style.html |
| Deploy จริง | ⏳ ต้องมี Cloudflare account resources | ดูขั้นที่ 1 ด้านล่าง |

## บันทึกการตัดสินใจ (grilling session — อนุมัติแล้ว)

| เรื่อง | มติ | ผลในโค้ด |
|---|---|---|
| ช่องโหว่ `upsertShopRecord` (Q1/Q5) | เพิ่ม ownership check — ถือเป็น security fix ไม่ใช่ drift | `worker/src/routes/shops.ts`: admin → ทุกร้าน · user → เฉพาะ `created_by` ตัวเอง · แถว `created_by='Guest'` → admin เท่านั้น |
| `replaceProductsByShopId` (Q5) | เพิ่ม ownership ด้วย + ไม่พบร้าน → ปฏิเสธ | `handleReplaceProducts` (ค้นทั้ง shop_id และ legacy_backend_id) |
| Guest path `allowGuestPdf` (Q5) | ปิดสำหรับ route สาธารณะ | ใน Worker ไม่มี internal caller ใช้ path นี้แล้ว (frontend ไม่เรียก 2 ฟังก์ชันนี้เลย) |
| PDF data source (Q6) | Shops row เป็นหลัก + hydrate ช่องว่างจาก legacy (ตาม `ensureScalableShopRecordForPdf_` Code.gs:1935 / `hasPdfShopMasterData_` Code.gs:1836) | `loadPdfData` ใน `worker/src/routes/pdf.ts` — regression ยืนยันผ่าน PDF title (UTF-16BE hex) |
| Freeze ระบบเดิม (Q2) | ห้ามแก้ `Code/` จนกว่า cutover ผ่าน | drift guard ด้านล่าง |
| Drift-check (Q7) | hard-fail 2 คู่ + soft-warn 2 ไฟล์ + รันอัตโนมัติก่อน deploy | `tools/check-drift.mjs` + `tools/drift-baseline.json`; `deploy:staging`/`deploy:production` เรียก `check-drift` ก่อนเสมอ |
| Double-submit (Q3) | คง parity (ไม่เพิ่ม idempotency key) | ทบทวนหลัง production verification |
| โดเมน cutover (Q4) | เริ่มด้วย `*.workers.dev` | เปลี่ยน custom domain ทีหลังได้โดยแก้ redirect จุดเดียว |

### รัน drift guard มือ

```bash
node tools/check-drift.mjs            # จาก repo root — exit 1 ถ้ามี hard-fail
node tools/check-drift.mjs --init     # สร้าง baseline ใหม่หลัง re-port ที่ตั้งใจ
```

### รัน regression suite (เฟส 7)

```bash
cd worker
npm run db:migrate:local                  # สร้าง schema D1 local (ครั้งแรก)
npx wrangler dev &                        # หรือ Start-Process background
npm run test:regression                   # โหมดปกติ (PDF gate → 501)
# โหมด PDF native:
npx wrangler dev --port 8788 --var PDF_NATIVE:on &
$env:BASE='http://127.0.0.1:8788'; $env:PDF_NATIVE='1'; npm run test:regression
```

ครอบคลุม: config/CORS/static · register ครบ/ซ้ำ/ขนาน (race) · login ผิด/ถูก ·
single-session · logout · guest save/update ด้วย guestAccessKey (ผิดร้านปฏิเสธ) ·
ownership (ผู้อื่นแก้/ลบไม่ได้) · **ownership ร้าน (upsert/replace/allowGuestPdf/admin)** ·
soft delete parity · upload R2 + GET /images +
soft delete gallery · shops upsert/get/replaceProducts · Excel (ไฟล์จริง PK) ·
PDF gate และ PDF native (%PDF + Sarabun **+ Shops-row precedence**) ·
GPS resolve · double-submit ·
unknown RPC → 404 · token ตาย → sessionInvalid

## ขั้นที่ 1 — เตรียมทรัพยากร Cloudflare (ครั้งเดียว)

```bash
cd worker
npx wrangler login
npx wrangler d1 create lampang-pround-staging          # → database_id ใส่ wrangler.toml
npx wrangler d1 create lampang-pround                  # (production)
npx wrangler r2 bucket create lampang-pround-assets-staging
npx wrangler r2 bucket create lampang-pround-assets
# แก้ TODO_*_D1_ID ใน worker/wrangler.toml
npx wrangler secret put GEOCODING_API_KEY --env staging
npx wrangler d1 migrations apply lampang-pround-staging --env staging --remote
npm run build -w frontend   # ต้องมี frontend/dist ก่อน deploy
npm run deploy:staging -w worker
```

## ขั้นที่ 2 — Migration ข้อมูล (COPY ONLY)

```bash
cd migration && cp .env.example .env   # กรอกค่า
npm run export-source                  # Sheets → data/*.json (read-only)
npm run migrate                        # → D1 + R2 (resumable/idempotent)
npm run verify                         # → verification-report.json (ต้องผ่านทุกข้อ)
```

## ขั้นที่ 3 — เทียบ PDF parity ใน staging (Q1)

1. ส่งออก PDF จากระบบ GAS เดิม 3–5 ร้าน (แต่ละร้านมีสินค้า/รูปต่างกัน)
2. ส่งออก PDF จาก staging (`PDF_NATIVE=on`) ด้วยร้านเดียวกัน
3. เทียบ: เนื้อหา, ข้อความไทย (Sarabun), คอลัมน์/ลำดับ, รูป, ชื่อไฟล์
4. ถ้าไม่ผ่าน → ปิด `PDF_NATIVE` (ใช้ proxy ไป GAS ชั่วคราวผ่าน `GAS_WEB_APP_URL`) แล้วรายงานก่อนแก้
5. ถ้าผ่าน → คง `PDF_NATIVE=on` ใน staging และ production

## ขั้นที่ 4 — Regression test ใน staging

ตาม checklist ของ Master Prompt: Login/Register/Logout · Session/Guest/Permission ·
CRUD · Products/Gallery · Search/Filter/Pagination · Dashboard · GPS · Upload ·
PDF/Excel · Duplicate/Concurrent · Unauthorized · Mobile 375/390/430/768 ·
No horizontal overflow · Touch target ≥44px

(เก็บผลไว้ใน `verification-report.json` + จดบันทึกการทดสอบ)

## ขั้นที่ 5 — Cutover

1. Deploy production: `npm run deploy:production -w worker` (หลัง migrate production D1)
2. แก้ GAS `doGet` ให้ redirect QR/deep link เก่า → โดเมนใหม่ (โค้ดด้านล่าง)
3. คง GAS + Sheets + Drive ตามเดิม **อย่างน้อย 2 สัปดาห์** (rollback window)

### โค้ด GAS redirect (แก้ 5 บรรทัดใน Code.gs doGet)

```javascript
function doGet(e) {
  // Cutover: redirect deep link ทั้งหมดไป Workers (QR เก่ายังใช้ได้)
  var NEW_URL = 'https://<โดเมน-workers-ใหม่>/';
  var params = (e && e.parameter) || {};
  var qs = params.id ? ('?id=' + encodeURIComponent(params.id))
    : params.backendId ? ('?backendId=' + encodeURIComponent(params.backendId))
    : params.shopId ? ('?shopId=' + encodeURIComponent(params.shopId)) : '';
  return HtmlService.createHtmlOutput(
    '<script>window.location.replace(' + JSON.stringify(NEW_URL + qs) + ');</script>'
  );
  // ...โค้ด doGet เดิมย้ายไว้ล่างคอมเมนต์ (rollback = ลบบล็อกนี้ออก)
}
```

## Rollback

| สถานการณ์ | วิธี |
|---|---|
| ก่อน cutover (ยังใช้ GAS เป็นหลัก) | ไม่ต้องทำอะไร — ต้นฉบับไม่เคยถูกแตะ (COPY ONLY) |
| หลัง cutover ต้องการกลับ | ลบบล็อก redirect ใน `doGet` → deploy GAS ใหม่ (clasp push) — QR/ลิงก์เดิมกลับมาทำงานทันที; ข้อมูลที่กรอกหลัง cutover อยู่ใน D1 → export กลับด้วย `migration/verify.mjs` pattern (reverse sync — แจ้งเพื่อให้ผมเขียนเพิ่ม) |
| PDF parity ไม่ผ่านหลัง deploy | ตั้ง `PDF_NATIVE=""` + `GAS_WEB_APP_URL=<GAS URL>` → `/api/export/pdf` proxy กลับ GAS ทันที |
| ข้อมูลต้นฉบับ | Google Sheets/Drive ไม่ถูกแก้/ลบเลยตลอดกระบวนการ |
