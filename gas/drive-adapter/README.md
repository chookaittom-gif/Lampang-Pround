# Lampang Pround — GAS Drive adapter

ตัว adapter นี้เป็น Google Apps Script Web App ขนาดเล็กสำหรับรับรูปจาก Cloudflare Worker แล้วเก็บใน Google Drive โฟลเดอร์ของร้าน โดยไม่เขียน Sheet และไม่เปิดเผย credential ใน repository

## ตั้งค่าครั้งแรก

1. สร้าง Apps Script project แยก แล้วเพิ่ม `Code.gs` และ `appsscript.json` ในโฟลเดอร์นี้
2. ตั้ง Script properties:
   - `LP_ASSET_FOLDER_ID` = ID ของโฟลเดอร์แม่ใน Google Drive
   - `GAS_DRIVE_ADAPTER_TOKEN` = random token ยาวอย่างน้อย 32 ตัวอักษร
3. Deploy → New deployment → Web app:
   - Execute as: **Me**
   - Who has access: **Anyone**
4. เก็บ URL `/exec` ไว้เป็น `GAS_DRIVE_ADAPTER_URL` ของ Worker และใส่ token เป็น secret:

```text
npx wrangler secret put GAS_DRIVE_ADAPTER_TOKEN --env staging
npx wrangler secret put GAS_DRIVE_ADAPTER_TOKEN --env production
```

ตั้ง `IMAGE_STORAGE = "drive"` ใน environment ที่ต้องการใช้ Drive

## API

`POST /exec` รับ JSON:

```json
{
  "action": "upload",
  "token": "ไม่ใส่ token จริงในเอกสาร",
  "shopId": "SHOP-000001",
  "fileName": "product.jpg",
  "mimeType": "image/jpeg",
  "base64": "..."
}
```

ตอบ `{ success, driveFileId, driveUrl, thumbnailUrl, mimeType, fileSize, displayName }` โดยจำกัด JPEG/PNG/GIF ไม่เกิน 8 MB และตั้งสิทธิ์ `Anyone with the link → Viewer` เพื่อให้หน้าเว็บแสดงรูปได้โดยไม่ต้อง login; ส่ง `idempotencyKey` เดิมซ้ำได้ภายใน 6 ชั่วโมงเพื่อกันไฟล์ซ้ำจากการ retry

`GET /exec` ใช้ตรวจ health เบื้องต้น ไม่ใช่การตรวจสิทธิ์ Drive แบบเต็ม

## ความปลอดภัยและขอบเขต

- token อยู่ใน Script Properties และ Cloudflare Secret เท่านั้น
- adapter ไม่รองรับการลบไฟล์; `softDeleteGalleryImage` เปลี่ยนสถานะใน D1 ตาม flow เดิม
- หากองค์กรปิดการแชร์ public การอัปโหลดจะล้มเหลวพร้อมลบไฟล์ที่เพิ่งสร้างเพื่อไม่ทิ้ง orphan
- การใช้งานจริงยังขึ้นกับ Apps Script/Drive quota และนโยบายผู้ดูแลโดเมน
