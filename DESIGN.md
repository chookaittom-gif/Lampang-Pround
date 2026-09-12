---
name: Lampang Pround
description: ระบบฐานข้อมูลผู้ผลิตและร้านค้าท้องถิ่นลำปาง โทนฟ้าสดใสเป็นมิตร อ่านง่ายบนมือถือ
colors:
  primary: "#2563eb"
  primary-deep: "#1d4ed8"
  header-deep: "#1e40af"
  sky: "#0ea5e9"
  cyan: "#06b6d4"
  primary-tint: "#eff6ff"
  primary-tint-deep: "#dbeafe"
  success: "#10b981"
  success-deep: "#059669"
  ink: "#0f172a"
  body-text: "#334155"
  muted: "#64748b"
  surface: "#ffffff"
  surface-tint: "#f8fafc"
  surface-tint-deep: "#f1f5f9"
  border: "#e2e8f0"
  amber-tint: "#fffbeb"
  rose-tint: "#fff1f2"
  violet-tint: "#f5f3ff"
  emerald-tint: "#ecfdf5"
typography:
  display:
    fontFamily: "Prompt, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
  headline:
    fontFamily: "Prompt, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.35
  title:
    fontFamily: "Prompt, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Prompt, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Prompt, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: "0.625rem"
  md: "0.75rem"
  lg: "1rem"
  modal: "1.75rem"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "10px 24px"
  button-primary-cta:
    backgroundColor: "{colors.sky}"
    textColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "12px 24px"
  button-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "12px 24px"
  chip:
    backgroundColor: "{colors.primary-tint}"
    textColor: "{colors.primary-deep}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.body-text}"
    rounded: "{rounded.lg}"
    padding: "16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
---

# Design System: Lampang Pround

## 1. Overview

**Creative North Star: "The Provincial Market Stall"**

ระบบนี้คือแผงตลาดท้องถิ่นที่ยกขึ้นจอ: สินค้าและเรื่องราวของผู้ผลิตเรียงเป็นระเบียบให้อ่านง่าย สีสันสดใสแบบผ้าใบตลาดแต่ไม่รกตา ทุกตารางนิ้วต้องตอบคำถามเดียวว่า "ร้านนี้คือใคร ติดต่ออย่างไร" ก่อน แล้วค่อยเล่ารายละเอียดที่เหลือ ความสดใสอยู่ในสีพื้นและป้ายสถานะ ไม่ใช่ในการตกแต่งที่แย่งสายตาไปจากข้อมูล

ความหนาแน่นข้อมูลสูงโดยเจตนา (รายการ 300+ ร้าน, กราฟ 6 ชุด, แกลเลอรีรูป) แต่จัดชั้นด้วยพื้นสีอ่อนและช่องไฟ ไม่ใช่ด้วยเส้นกรอบหนาหรือการ์ดซ้อนการ์ด มือถือคือจอหลัก: ตัวอักษรอ่านได้จริง ปุ่มแตะได้จริง ไม่มีอะไรล้นจอแนวนอน

ระบบนี้ปฏิเสธโดยชัดแจ้ง: หน้าตาองค์กรที่แข็งทื่อและทำให้ข้อมูลท้องถิ่นดูห่างเหิน, จอที่ใช้การ์ด สี หรือ gradient มากจนแยกลำดับความสำคัญของข้อมูลไม่ได้, modal ซ้อนที่ย้ำข้อมูลหรือ action เดิม, และฟอร์มหรือรายละเอียดที่แน่นจนอ่านและแตะบนมือถือได้ยาก

**Key Characteristics:**
- ฟอนต์ไทย Prompt ครอบครัวเดียว น้ำหนัก 300-700 พาลำดับชั้นทั้งหมด
- ฟ้าลำปาง (Lampang Sky) เป็นเสียงเดียวของแอคชัน: ปุ่ม ลิงก์ สถานะเลือก
- พื้น tint อ่อนหกตระกูล (ฟ้า/ม่วง/อำพัน/เขียว/กุหลาบ/เทา) แบ่งหมวดข้อมูลโดยไม่ใช้เส้นหนา
- ปุ่มและชิปมนเต็ม (pill) การ์ดมุนนุ่ม 12-16px แตะง่าย 44px ขึ้นไป
- เงาจางระดับกระดาษซ้อน ยกขึ้นเฉพาะตอนตอบสนองสถานะ

## 2. Colors: The Lampang Sky Palette

พาเลตต์ฟ้าเดี่ยวบนพื้นขาวสะอาด เสริมด้วย tint อ่อนหกตระกูลสำหรับแบ่งหมวด และเขียวสำหรับความสำเร็จ

### Primary
- **Lampang Sky** (#2563eb): สีแอคชันหลัก ปุ่มหลัก ลิงก์ สถานะเลือก และเส้นกราฟหลัก หายากพอที่จะมีความหมายทุกครั้งที่ใช้
- **Sky Deep** (#1d4ed8): สถานะ hover/active ของแอคชันหลัก และข้อความบนพื้น tint ฟ้า
- **Header Indigo** (#1e40af): ต้นทาง gradient ของแถบหัวระบบ ให้น้ำหนักสถาบันโดยไม่เข้มทั้งจอ
- **Morning Sky** (#0ea5e9): ปลาย gradient หัวระบบและปุ่ม CTA ไล่จากฟ้าสดไปน้ำเงิน
- **River Cyan** (#06b6d4): ปลายสุดของ gradient หัวระบบ ใช้เฉพาะใน gradient นั้น ห้ามใช้เดี่ยว

### Secondary
- **Market Green** (#10b981): ปุ่มบันทึกสำเร็จและสถานะบวก ไล่ไป #059669 ตอน hover

### Neutral
- **Ink** (#0f172a): หัวข้อและข้อความเน้นสุด
- **Slate Body** (#334155): ข้อความเนื้อหาหลัก ทุกบรรทัดต้องอ่านได้บนพื้นขาว
- **Muted Slate** (#64748b): คำอธิบายรองและ meta เท่านั้น ห้ามใช้กับข้อความเนื้อหา
- **Paper** (#ffffff): พื้นการ์ดและพื้นฟอร์ม
- **Paper Tint** (#f8fafc): พื้นจอและพื้นบล็อกย่อย
- **Paper Deep** (#f1f5f9): พื้นแถบเครื่องมือและแถวตารางสลับ
- **Hairline** (#e2e8f0): เส้นขอบการ์ดและช่องกรอก บางที่สุดที่มองเห็นได้

### Named Rules
**The One Sky Rule.** ฟ้า Lampang Sky ใช้กับแอคชันและสถานะเลือกเท่านั้น รวมแล้วไม่เกิน 10% ของจอ ความหายากคือเหตุผลที่มันนำสายตา
**The Tint-Not-Line Rule.** แบ่งหมวดข้อมูลด้วยพื้น tint อ่อน (เช่น #eff6ff, #f5f3ff, #fffbeb, #ecfdf5, #fff1f2) ไม่ใช่เส้นขอบสีหนาหรือแถบสีข้างการ์ด

## 3. Typography

**Display Font:** Prompt (with sans-serif fallback)
**Body Font:** Prompt (with sans-serif fallback)

**Character:** ครอบครัวไทยครอบครัวเดียว พาลำดับชั้นด้วยน้ำหนักและขนาดเท่านั้น อ่านนุ่มบนมือถือและสุภาพพอสำหรับเอกสารราชการ

### Hierarchy
- **Display** (700, 1.5rem, 1.25): ชื่อร้านและหัวโมดัล รายละเอียดรายการ
- **Headline** (700, 1.125rem, 1.35): หัวหมวดในหน้าและการ์ดสรุป
- **Title** (600, 0.95rem, 1.4): ป้ายการ์ด ชื่อบล็อก หัวตาราง
- **Body** (400, 0.875rem, 1.6): ข้อความเนื้อหาทั้งหมด ความยาวบรรทัดไม่เกิน 75ch
- **Label** (500, 0.75rem, 1.4): ป้ายชิป ป้ายสถานะ คำอธิบายฟิลด์

### Named Rules
**The Single Family Rule.** ห้ามเพิ่มฟอนต์ครอบครัวที่สอง ลำดับชั้นทั้งหมดมาจากน้ำหนัก 300-700 ของ Prompt
**The Readable Floor Rule.** ข้อความเนื้อหาไม่เล็กกว่า 0.875rem และคอนทราสต์ไม่ต่ำกว่า 4.5:1 บนพื้นของมันเอง

## 4. Elevation

ระบบยกตัวแบบกระดาษซ้อน: ตอนพักแทบแบนด้วยเงาจางมาก (0 1px 2px rgba(15,23,42,0.04)) เงาปรากฏชัดขึ้นเฉพาะเมื่อองค์ประกอบตอบสนองผู้ใช้ (hover, เปิดโมดัล) และปุ่ม CTA มี glow สีของตัวเองจางๆ เป็นสัญญาณว่ากดได้

### Shadow Vocabulary
- **Paper Rest** (`box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04)`): การ์ดและบล็อกตอนพัก
- **Paper Hover** (`box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08)`): การ์ดและชิปตอน hover
- **CTA Glow** (`box-shadow: 0 4px 14px rgba(14, 165, 233, 0.5)`): ปุ่ม gradient ฟ้าตอน hover เท่านั้น
- **Modal Lift** (`box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.25)`): โมดัลรายละเอียดและ popover

### Named Rules
**The Flat-By-Default Rule.** พื้นที่พักแบน เงาคือคำตอบต่อสถานะ ไม่ใช่เครื่องประดับ ถ้าเงาเข้มจนเห็นเป็นปื้นบนพื้นขาว แสดงว่าผิดสเกล

## 5. Components

### Buttons
- **Shape:** มนเต็ม pill (9999px) สำหรับปุ่มทั่วไปและชิปแอคชัน, มนนุ่ม 1rem สำหรับปุ่ม CTA กว้าง
- **Primary:** พื้น Lampang Sky (#2563eb) ข้อความขาว padding 10px 24px, hover เป็น Sky Deep (#1d4ed8)
- **CTA gradient:** ไล่ Morning Sky ไป Lampang Sky (135deg) พร้อม CTA Glow ตอน hover ใช้กับแอคชันหลักของจอเดียวเท่านั้น
- **Success:** ไล่ Market Green ไป #059669 สำหรับปุ่มบันทึก
- **Focus:** วงแหวนฟ้าจาง 2px (0 0 0 2px rgba(59,130,246,0.2)) ทุกปุ่มที่โฟกัสได้

### Chips
- **Style:** pill มนเต็ม พื้น tint ตามหมวด (เช่น #eff6ff ข้อความ #1d4ed8) ไม่มีเส้นขอบ
- **State:** เลือกแล้วเติม tint เข้มขึ้นหนึ่งขั้น ไม่เปลี่ยนขนาด

### Cards / Containers
- **Corner Style:** มนนุ่ม 1rem (การ์ดข้อมูล) และ 0.75rem (บล็อกย่อย)
- **Background:** Paper (#ffffff) บนพื้นจอ Paper Tint (#f8fafc)
- **Shadow Strategy:** Paper Rest ตอนพัก, Paper Hover ตอน hover
- **Border:** Hairline (#e2e8f0) 1px เฉพาะเมื่อการ์ดวางบนพื้นขาวเดียวกัน
- **Internal Padding:** 16px เป็นฐาน 24px สำหรับการ์ดสรุป

### Inputs / Fields
- **Style:** พื้นขาว เส้น Hairline 1px มน 0.75rem padding 10px 14px
- **Focus:** เส้นขอบฟ้า + วงแหวน rgba(59,130,246,0.2) 2px
- **Error:** ข้อความแดงใต้ฟิลด์พร้อมเส้นขอบแดง ห้ามใช้สีอย่างเดียวโดยไม่มีการ์ดข้อความ

### Navigation
- **Style:** แถบหัว gradient Header Indigo ไป River Cyan ข้อความขาว Prompt 600, แท็บหลักเป็น pill สามสถานะ (กรอกข้อมูล / รายการ / แดชบอร์ด) ตัวเลือกเติมขาวพื้นฟ้า

### Detail Modal (signature)
- โมดัลรายละเอียดร้าน มน 1.75rem หัวโมดัล gradient เดียวกับแถบหัว ข้อมูลจัดเป็นบล็อก tint ตามหมวด ช่องทางติดต่อรวมอยู่ที่หัวโมดัลจุดเดียว แกลเลอรีและ QR อยู่คอลัมน์ขวา

## 6. Do's and Don'ts

### Do:
- **Do** ใช้ Prompt ครอบครัวเดียว น้ำหนัก 300-700 พาลำดับชั้นทั้งหมด
- **Do** เก็บช่องทางติดต่อของร้านไว้ในจุดหลักเดียว (หัวโมดัล/การ์ดสรุป) ตามหลักการของ PRODUCT.md
- **Do** ทำให้เป้าหมายแตะทั้งหมดสูงอย่างน้อย 44px และทดสอบที่ความกว้างมือถือว่าไม่มี horizontal overflow
- **Do** แบ่งหมวดด้วยพื้น tint อ่อนหกตระกูล และเว้นช่องไฟ 16-24px ระหว่างบล็อก
- **Do** ให้ทุกองค์ประกอบโต้ตอบมีครบ default, hover, focus, active, disabled, loading, error

### Don't:
- **Don't** ทำหน้าตาองค์กรที่แข็งทื่อและทำให้ข้อมูลท้องถิ่นดูห่างเหิน (anti-reference จาก PRODUCT.md)
- **Don't** ใช้การ์ด สี หรือ gradient มากจนแยกลำดับความสำคัญของข้อมูลไม่ได้ (anti-reference จาก PRODUCT.md)
- **Don't** เปิด modal ซ้อนที่ย้ำข้อมูลหรือ action เดิมหลายจุด โดยเฉพาะช่องทางติดต่อร้านค้า (anti-reference จาก PRODUCT.md)
- **Don't** ทำฟอร์มหรือรายละเอียดที่แน่นจนอ่านและแตะบนมือถือได้ยาก (anti-reference จาก PRODUCT.md)
- **Don't** ใช้แถบสีข้างการ์ด (border-left/right หนากว่า 1px) เป็นแอคเซนต์ แบ่งหมวดด้วยพื้น tint เท่านั้น
- **Don't** ใส่ gradient บนตัวอักษร หรือ glassmorphism เป็นค่าเริ่มต้น
- **Don't** ใช้เงาเข้มblur น้อยแบบแอปปี 2014 ถ้าเงาดูเป็นปื้นบนพื้นขาว ให้จางลงและเบลอขึ้น
