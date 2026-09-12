# Migration — Sheets → D1 / Drive(base64) → R2 (COPY ONLY)

## หลักการ
- **COPY ONLY** — สคริปต์อ่านต้นฉบับแบบ read-only เท่านั้น ห้ามแก้/ลบ Google Sheets หรือ Drive
- **Idempotent** — รันซ้ำได้ (INSERT OR REPLACE ตาม PK เดิม + ทะเบียน r2_objects)
- **Resumable** — ถ้าโดนตัดกลางทาง รันใหม่แล้วข้ามส่วนที่ทำแล้วอัตโนมัติ
- **Partial failure safe** — error รายแถวไม่ทำให้ทั้งชุดพัง (log แล้วไปต่อ, รันซ้ำเพื่อเก็บงานที่เหลือ)
- รหัสผ่านถูก hash ด้วย PBKDF2 (รูปแบบเดียวกับ Worker) **ตอน migrate** — plaintext จากชีตไม่เคยถูกเขียนลง D1

## ขั้นตอน

```bash
cp .env.example .env        # กรอกค่าตามไฟล์ตัวอย่าง
npm run export-source       # 1) Sheets → data/*.json (read-only)
npm run migrate             # 2) data → D1 + R2
npm run verify              # 3) ตรวจ parity → verification-report.json
```

## ข้อกำหนดก่อนรัน
1. สร้าง Service Account ใน Google Cloud + เปิดใช้ Sheets API แล้วส่ง email ของ SA
   ให้เป็น **Viewer** ของ Spreadsheet (read-only พอ)
2. `wrangler d1 create lampang-pround` → เอา database_id มาใส่ `CF_D1_DATABASE_ID`
   (และรัน migrations ก่อน: `cd worker && npx wrangler d1 migrations apply lampang-pround --env staging --remote`)
3. R2 API token (Object Read & Write) + Access Key จาก Cloudflare dashboard → ใส่ใน .env

## ไฟล์
| ไฟล์ | หน้าที่ |
|---|---|
| `lib/gsheets.mjs` | Service-account JWT + Sheets REST (readonly scope) |
| `lib/d1.mjs` | D1 HTTP query client |
| `lib/r2.mjs` | R2 S3 PUT/HEAD พร้อม SigV4 (ไม่ใช้ dependency) |
| `export-source.mjs` | dump 5 แผ่น → `data/*.json` |
| `migrate.mjs` | data → D1 (+base64→R2, Drive→R2) + sync id_counters |
| `verify.mjs` | ตรวจ counts/missing/orphan/duplicate/soft-delete/image parity |

## หมายเหตุ
- รูป legacy ในเซลล์ (ImageShop/ImageProduct/ImageActivity) ถูกแตกเป็นไฟล์ R2
  ที่ key `legacy/<BackendId>/<name>.<ext>`
- รูป Drive ถูกคัดลอกไป `shops/<ShopID>/<GalleryID>.<ext>` — **ไฟล์ Drive ต้นฉบับไม่ถูกลบ**
  (ผ่าน lh3 `=w800` เหมือนที่แอปเดิมแสดง, fallback `uc?export=download`)
- `id_counters` ถูก set ต่อจาก MAX ของข้อมูลจริงหลัง migrate เสมอ
