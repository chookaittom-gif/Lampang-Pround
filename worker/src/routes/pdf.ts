import { PDFDocument, rgb, PDFFont, PDFPage, PDFImage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Env } from '../env';
import { parseJsonArray } from '../lib/format';

import sarabunRegular from '../assets/Sarabun-Regular.ttf';
import sarabunBold from '../assets/Sarabun-Bold.ttf';

/** ค่า layout คัดลอกจาก constants ของ Code.gs (บรรทัด 12–27) — layout version v13
 *  จานสีงานพิมพ์ผูกกับ DESIGN.md: TEXT_DARK/TEXT_BODY/TEXT_CAPTION = ink/body-text/muted,
 *  TABLE_HEADER_BG/LABEL_BG = primary-tint/surface-tint, ฟอนต์ Sarabun แทน Prompt
 *  (งานพิมพ์ราชการ) — เปลี่ยนจานสีเว็บให้กลับมาเทียบตรงนี้ด้วย */
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 36;
const CONTENT_W = PAGE_W - MARGIN * 2;
const LABEL_W = 180;
const VALUE_W = 343;
const PRODUCT_COL_WIDTHS = [34, 108, 116, 78, 62, 125];
const IMAGE_CELL_SIZE = 180;
/** ระยะเว้น 1 บรรทัดระหว่างหัวข้อหมวดรูปกับรูปภาพ */
const HEADING_IMAGE_GAP = 12;
/** ระยะเว้นเหนือหัวข้อหมวด (แยกหมวด ไม่นับตอนอยู่ต้นหน้า) */
const SECTION_HEAD_SPACE_ABOVE = 10;
// ── Layout tokens กลางไฟล์ (ห้าม hardcode ตัวเลขซ้ำใน logic ด้านล่าง) ──
/** ความสูงแถวตารางสินค้า (จุรูป + ข้อความ 2 บรรทัด) */
const PRODUCT_ROW_H = 56;
/** ความสูงแถวหัวตารางสินค้า */
const PRODUCT_HEADER_H = 24;
/** จำนวนแถวสินค้าสูงสุดต่อหน้า */
const PRODUCT_ROWS_PER_PAGE = 6;
/** ช่องว่างระหว่างรูปในกริดแกลเลอรี */
const GALLERY_GAP = 16;
/** ความสูงบรรทัดคำบรรยายใต้รูป */
const GALLERY_CAPTION_H = 18;
/** พื้นที่ขั้นต่ำก่อนหัวข้อหมวดรูป (กันหัวข้อชิดขอบล่างหน้า) */
const GALLERY_HEAD_RESERVE = 40;
/** ฟอนต์ข้อความในเซลตารางสินค้า */
const TABLE_CELL_FONT_SIZE = 10.5;
/** ระยะบรรทัดข้อความในเซลตารางสินค้า */
const CELL_LINE_H = 14;
/** จำนวนบรรทัดสูงสุดต่อเซล (เกินตัดด้วย …) */
const ROW_MAX_LINES = 4;
const TABLE_BORDER = rgb(0xb4 / 255, 0xc2 / 255, 0xd2 / 255);
const TABLE_HEADER_BG = rgb(0xdb / 255, 0xea / 255, 0xfe / 255);
const LABEL_BG = rgb(0xf8 / 255, 0xfa / 255, 0xfc / 255);
const TEXT_DARK = rgb(0x0f / 255, 0x17 / 255, 0x2a / 255);
const TEXT_BODY = rgb(0x33 / 255, 0x41 / 255, 0x55 / 255);
const TEXT_CAPTION = rgb(0x47 / 255, 0x55 / 255, 0x69 / 255);
const WHITE = rgb(1, 1, 1);

const NOT_SPECIFIED = 'ไม่ระบุ';
const NO_IMAGE = 'ไม่มีรูป';
const EMPTY_SECTION = 'ไม่มีรูปข้อมูล';

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

/** คัดลอกตรงจาก getThaiDateText_ (บรรทัด 2081–2088): ไทย พ.ศ. +543 */
function thaiDateText(input: string): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input || NOT_SPECIFIED;
  return `${date.getDate()} ${THAI_MONTHS[date.getMonth()]} ${date.getFullYear() + 543}`;
}

function display(value: unknown): string {
  // pdfDisplayValue_: ค่าว่าง → 'ไม่ระบุ'
  const text = String(value ?? '').trim();
  return text || NOT_SPECIFIED;
}

interface PdfGalleryItem {
  ProductID: string;
  ImageRole: string;
  SortOrder: number;
  Url: string;
}

interface PdfProduct {
  ProductID: string;
  ProductName: string;
  ProductCategory: string;
  Price: string;
  Description: string;
  SortOrder: number;
}

interface PdfShopData {
  shop: Record<string, unknown>;
  products: PdfProduct[];
  gallery: PdfGalleryItem[];
  createdAtIso: string;
}

async function loadPdfData(env: Env, backendId: string): Promise<PdfShopData | null> {
  // logic รวมเดียวกับ getRecordDetail: legacy record + products + gallery (merge 2 ระบบ id)
  const legacy = await env.DB.prepare(
    `SELECT * FROM legacy_records WHERE backend_id = ? AND UPPER(is_deleted) != 'TRUE'`
  )
    .bind(backendId)
    .first<Record<string, unknown>>();
  if (!legacy) return null;
  const shopRow = await env.DB.prepare(`SELECT * FROM shops WHERE legacy_backend_id = ? LIMIT 1`)
    .bind(backendId)
    .first<Record<string, unknown>>();

  // ข้อมูลร้านจาก legacy (fallback เมื่อยังไม่มี Shops row — เทียบเท่า Case 3 ของ
  // ensureScalableShopRecordForPdf_)
  const legacyShop: Record<string, unknown> = {
    BusinessName: legacy.business_name,
    OwnerName: legacy.owner_name,
    Phone: legacy.phone,
    LineID: legacy.line_id,
    Facebook: legacy.facebook,
    Website: legacy.website,
    LocationText: legacy.location_text,
    ShopHistory: legacy.shop_history,
    BusinessType: legacy.business_type,
    ProductCategory: legacy.product_category,
    BusinessLevel: legacy.business_level,
    SalesChannel: legacy.sales_channel,
    AvgPrice: legacy.avg_price,
    BusinessStatus: legacy.business_status,
    PotentialLevel: legacy.potential_level,
  };

  // การตัดสินใจร่วม (Q6=ก): Shops row เป็นหลักเหมือน GAS — ถ้า row มี master data
  // ใช้ค่าของ Shops row ทั้งหมด, ถ้า row ว่างเปล่าทั้งชุด (ไม่มี master data)
  // ให้เติมเฉพาะช่องว่างจาก legacy (เทียบเท่า hasPdfShopMasterData_ Code.gs:1836)
  let shop = legacyShop;
  if (shopRow) {
    const rowShop: Record<string, unknown> = {
      BusinessName: shopRow.business_name,
      OwnerName: shopRow.owner_name,
      Phone: shopRow.phone,
      LineID: shopRow.line_id,
      Facebook: shopRow.facebook,
      Website: shopRow.website,
      LocationText: shopRow.location_text,
      ShopHistory: shopRow.shop_history,
      BusinessType: shopRow.business_type,
      ProductCategory: shopRow.product_category,
      BusinessLevel: shopRow.business_level,
      SalesChannel: shopRow.sales_channel,
      AvgPrice: shopRow.avg_price,
      BusinessStatus: shopRow.business_status,
      PotentialLevel: shopRow.potential_level,
    };
    const hasMasterData = Object.values(rowShop).some(
      (v) => String(v ?? '').trim() !== ''
    );
    if (!hasMasterData) {
      for (const key of Object.keys(rowShop)) {
        if (String(rowShop[key] ?? '').trim() === '') {
          rowShop[key] = legacyShop[key];
        }
      }
    }
    shop = rowShop;
  }
  const galleryIds = [backendId, shopRow?.shop_id].filter(Boolean) as string[];
  const galleryRows = await env.DB.prepare(
    `SELECT g.*, ro.object_key AS r2_key FROM shop_gallery g
     LEFT JOIN r2_objects ro ON ro.source = 'drive' AND ro.source_ref = g.drive_file_id
     WHERE g.shop_id IN (${galleryIds.map(() => '?').join(', ')}) AND UPPER(g.status) != 'DELETED'
     ORDER BY g.sort_order`
  )
    .bind(...galleryIds)
    .all<Record<string, unknown>>()
    .then((r) => r.results);
  const productTargets = [backendId, shopRow?.shop_id].filter(Boolean) as string[];
  const products = await env.DB.prepare(
    `SELECT * FROM products WHERE shop_id IN (${productTargets.map(() => '?').join(', ')})
     AND UPPER(is_deleted) != 'TRUE' ORDER BY sort_order`
  )
    .bind(...productTargets)
    .all<Record<string, unknown>>()
    .then((r) => r.results);

  return {
    shop,
    products: products.map((p) => ({
      ProductID: String(p.product_id ?? ''),
      ProductName: String(p.product_name ?? ''),
      ProductCategory: String(p.product_category ?? ''),
      Price: String(p.price ?? ''),
      Description: String(p.description ?? ''),
      SortOrder: Number(p.sort_order ?? 0),
    })),
    gallery: galleryRows.map((g) => {
      const r2Key = String(g.r2_key ?? '').trim();
      const thumbnailUrl = String(g.thumbnail_url ?? '').trim();
      const driveUrl = String(g.drive_url ?? '').trim();
      const driveFileId = String(g.drive_file_id ?? '').trim();
      const driveFileUrl = /^[A-Za-z0-9_-]+$/.test(driveFileId)
        ? `https://lh3.googleusercontent.com/d/${driveFileId}=w1600`
        : '';
      return {
        ProductID: String(g.product_id ?? ''),
        ImageRole: String(g.image_role ?? 'gallery'),
        SortOrder: Number(g.sort_order ?? 0),
        Url: r2Key ? `r2:${r2Key}` : thumbnailUrl || driveFileUrl || driveUrl,
      };
    }),
    createdAtIso: String(legacy.created_at ?? ''),
  };
}

/** คัดลอกตรงจาก isPdfSupportedImageBlob_: รับเฉพาะ JPEG/PNG (magic bytes) */
function sniffImage(bytes: Uint8Array): 'image/jpeg' | 'image/png' | null {
  const startsWith = (magic: number[]): boolean => magic.every((b, i) => bytes[i] === b);
  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  return null;
}

async function embedImage(env: Env, pdf: PDFDocument, url: string): Promise<PDFImage | null> {
  try {
    let bytes: Uint8Array | null = null;
    if (url.startsWith('r2:')) {
      if (!env.ASSETS) return null;
      const object = await env.ASSETS.get(url.slice(3));
      if (!object) return null;
      bytes = new Uint8Array(await object.arrayBuffer());
    } else if (/^https?:\/\//.test(url)) {
      const resp = await fetch(url, { redirect: 'follow' });
      if (!resp.ok) return null;
      bytes = new Uint8Array(await resp.arrayBuffer());
    } else {
      return null;
    }
    const mime = sniffImage(bytes);
    if (!mime) return null;
    return mime === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
}

/** คัดลอกตรงจาก getPdfGalleryCaption_: ProductID → SortOrder/สินค้าเดียว → fallback */
function galleryCaption(item: PdfGalleryItem, products: PdfProduct[], fallbackIndex: number): string {
  const label = (product: PdfProduct): string => `สินค้า ${fallbackIndex + 1}: ${product.ProductName || NOT_SPECIFIED}`;
  if (item.ProductID) {
    const product = products.find((p) => p.ProductID === item.ProductID);
    if (product) return label(product);
  } else if (products.length === 1) {
    return label(products[0]);
  }
  return `รูปสินค้า ลำดับที่ ${fallbackIndex + 1}`;
}

/** คัดลอกตรงจาก getGalleryGridConfig_: ≤3→1 แถว, ≤4→2×2, ≤6→2 คอลัมน์, อื่น ๆ 3×3 */
function galleryGridConfig(count: number): { rows: number; cols: number } {
  if (count <= 3) return { rows: 1, cols: Math.max(count, 1) };
  if (count <= 4) return { rows: 2, cols: 2 };
  if (count <= 6) return { rows: Math.ceil(count / 2), cols: 2 };
  return { rows: 3, cols: 3 };
}

/** ตัดคำขึ้นบรรทัดใหม่แบบรายอักขระ (ภาษาไทยไม่มีช่องว่างคั่นคำ)
 *  คืนไม่เกิน maxLines บรรทัด — เกินตัดด้วย … ที่บรรทัดสุดท้าย */
function wrapLines(value: string, font: PDFFont, size: number, maxWidth: number, maxLines: number): string[] {
  const rawLines: string[] = [];
  let current = '';
  for (const ch of String(value ?? '')) {
    const trial = current + ch;
    if (current !== '' && font.widthOfTextAtSize(trial, size) > maxWidth) {
      rawLines.push(current);
      current = ch;
    } else {
      current = trial;
    }
  }
  if (current !== '' || rawLines.length === 0) rawLines.push(current);
  if (rawLines.length <= maxLines) return rawLines;
  const out = rawLines.slice(0, maxLines);
  let last = out[maxLines - 1];
  while (last.length > 1 && font.widthOfTextAtSize(last + '…', size) > maxWidth) {
    last = last.slice(0, -1);
  }
  out[maxLines - 1] = last + '…';
  return out;
}

function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && font.widthOfTextAtSize(out + '…', size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return out + '…';
}

/** เรียงรูป gallery ตาม SortOrder สำหรับจับคู่กับสินค้า (mirror ฝั่ง frontend) */
function productGallerySorted(items: PdfGalleryItem[]): PdfGalleryItem[] {
  return items.slice().sort((a, b) => a.SortOrder - b.SortOrder);
}

export async function exportShopPdfNative(
  env: Env,
  payload: Record<string, unknown>
): Promise<{ success: boolean; bytes?: Uint8Array; pdfName?: string; message?: string }> {
  const backendId = String(payload.backendId ?? '').trim();
  if (!backendId) return { success: false, message: 'ไม่พบรายการ' };
  const data = await loadPdfData(env, backendId);
  if (!data) return { success: false, message: 'ไม่พบรายการในฐานข้อมูล' };

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(sarabunRegular, { subset: true });
  const bold = await pdf.embedFont(sarabunBold, { subset: true });
  const shop = data.shop;
  const baseName = `${display(shop.BusinessName)} - Report`;
  pdf.setTitle(`[TEMP] ${baseName}`);
  pdf.setCreator('Lampang Pround');

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const text = (value: string, x: number, yy: number, size: number, font: PDFFont, color = TEXT_BODY): void => {
    page.drawText(value, { x, y: yy, size, font, color });
  };
  const newPage = (): void => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };
  const ensureSpace = (height: number): void => {
    if (y - height < MARGIN) newPage();
  };

  // ── Header (v13) ──
  text(display(shop.BusinessName), MARGIN, y - 18, 18, bold, TEXT_DARK);
  y -= 30;
  text('สำนักงานพัฒนาชุมชน', MARGIN, y - 14, 14, regular, TEXT_BODY);
  y -= 24;
  text(`วันที่พิมพ์รายงาน: ${thaiDateText(new Date().toISOString())}`, MARGIN, y - 12, 10.5, regular, TEXT_CAPTION);
  y -= 26;

  const drawSectionHeading = (title: string): void => {
    ensureSpace(34);
    // เว้นวรรคเหนือหัวข้อเพื่อแยกหมวด (ไม่เว้นตอนอยู่ต้นหน้าพอดี)
    if (y < PAGE_H - MARGIN - 1) y -= SECTION_HEAD_SPACE_ABOVE;
    text(title, MARGIN, y - 14, 13.5, bold, TEXT_DARK);
    y -= 22;
  };

  const drawLabelValueTable = (rows: [string, string][]): void => {
    const rowH = 20;
    for (const [label, value] of rows) {
      ensureSpace(rowH);
      const top = y;
      page.drawRectangle({ x: MARGIN, y: top - rowH, width: LABEL_W, height: rowH, borderColor: TABLE_BORDER, borderWidth: 0.75, color: LABEL_BG });
      page.drawRectangle({ x: MARGIN + LABEL_W, y: top - rowH, width: VALUE_W, height: rowH, borderColor: TABLE_BORDER, borderWidth: 0.75, color: WHITE });
      text(label, MARGIN + 6, top - rowH + 6, 10.5, bold, TEXT_BODY);
      text(truncate(value, regular, 10.5, VALUE_W - 10), MARGIN + LABEL_W + 6, top - rowH + 6, 10.5, regular, TEXT_BODY);
      y -= rowH;
    }
  };

  const productCategory = parseJsonArray(shop.ProductCategory).join(', ');
  const salesChannel = parseJsonArray(shop.SalesChannel).join(', ');
  drawSectionHeading('ข้อมูลร้านค้าและประวัติ');
  drawLabelValueTable([
    ['ชื่อร้านค้า', display(shop.BusinessName)],
    ['ชื่อเจ้าของ', display(shop.OwnerName)],
    ['เบอร์โทร', display(shop.Phone)],
    ['Line ID', display(shop.LineID)],
    ['Facebook', display(shop.Facebook)],
    ['เว็บไซต์', display(shop.Website)],
    ['ที่ตั้ง', display(shop.LocationText)],
    ['ประวัติร้านค้า', display(shop.ShopHistory)],
  ]);

  drawSectionHeading('ข้อมูลธุรกิจ');
  drawLabelValueTable([
    ['ประเภทธุรกิจ', display(shop.BusinessType)],
    ['หมวดหมู่สินค้า', display(productCategory)],
    ['ระดับธุรกิจ', display(shop.BusinessLevel)],
    ['ช่องทางจำหน่าย', display(salesChannel)],
    ['ราคาเฉลี่ย', display(shop.AvgPrice)],
    ['สถานะธุรกิจ', display(shop.BusinessStatus)],
    ['ระดับศักยภาพ', display(shop.PotentialLevel)],
    ['จำนวนสินค้า', String(data.products.length)],
    ['จำนวนรูปภาพ', String(data.gallery.length)],
  ]);

  // ── Products table (replaceProductsTable_: 6 แถว/หน้า, header ตรงบรรทัด 2632) ──
  // ลำดับคอลัมน์: ลำดับ | รูปภาพ | ชื่อสินค้า | หมวดหมู่ | รายละเอียด | ราคา
  // จับคู่รูปกับสินค้าตาม SortOrder (logic เดียวกับ findProductGalleryImageUrl ฝั่ง frontend)
  const looseGallery = productGallerySorted(data.gallery.filter((g) => g.ImageRole === 'product' || g.ImageRole === 'gallery'));
  const galleryForProduct = (globalIndex: number, sortOrder: number): PdfGalleryItem | null => {
    const byOrder = looseGallery.find((g) => g.SortOrder === sortOrder);
    if (byOrder) return byOrder;
    return looseGallery[globalIndex] ?? null;
  };
  for (let start = 0; start < data.products.length; start += PRODUCT_ROWS_PER_PAGE) {
    // [polish] วางแผนแถวล่วงหน้า: wrap ข้อความสูงสุด ROW_MAX_LINES บรรทัด
    // แถวสูงตามเนื้อหาจริง (ขั้นต่ำ PRODUCT_ROW_H) — ไม่ตัดข้อมูลทิ้งแบบ ellipsis
    const cols = PRODUCT_COL_WIDTHS;
    const total = cols.reduce((a, b) => a + b, 0);
    const startX = MARGIN + (CONTENT_W - total) / 2;
    const headerH = PRODUCT_HEADER_H;
    const pageItems = data.products.slice(start, start + PRODUCT_ROWS_PER_PAGE);
    const rowPlans = pageItems.map((item, k) => {
      const raw = [String(start + k + 1), '', item.ProductName || NOT_SPECIFIED, item.ProductCategory || NOT_SPECIFIED, item.Description || NOT_SPECIFIED, item.Price || NOT_SPECIFIED];
      const wrapped = raw.map((c, i) =>
        i === 1 ? [c] : wrapLines(c, regular, TABLE_CELL_FONT_SIZE, cols[i] - 8, ROW_MAX_LINES)
      );
      const maxLines = Math.max(...wrapped.map((w) => w.length));
      return { item, wrapped, rowH: Math.max(PRODUCT_ROW_H, maxLines * CELL_LINE_H + 16) };
    });
    const bodyH = rowPlans.reduce((sum, p) => sum + p.rowH, 0);
    // [P1] จองพื้นที่ตามจำนวนแถวจริงของหน้านี้ (ไม่ใช่เหมา 6 แถว) กันหน้าว่างครึ่งหน้า
    // กันหัวข้อค้างท้ายหน้า: เช็คที่ทั้งก้อนก่อนวาดหัวข้อ (ไม่ใช่หลังวาด)
    if (start > 0) newPage();
    else ensureSpace(SECTION_HEAD_SPACE_ABOVE + 22 + headerH + bodyH + 8);
    drawSectionHeading('สรุปรายการสินค้า');
    const headerRow = ['ลำดับ', 'รูปภาพ', 'ชื่อสินค้า', 'หมวดหมู่', 'รายละเอียด', 'ราคา'];
    let x = startX;
    let rowTop = y;
    for (let i = 0; i < cols.length; i++) {
      page.drawRectangle({ x, y: rowTop - headerH, width: cols[i], height: headerH, borderColor: TABLE_BORDER, borderWidth: 0.75, color: TABLE_HEADER_BG });
      text(headerRow[i], x + 4, rowTop - headerH + 7, TABLE_CELL_FONT_SIZE, bold, TEXT_BODY);
      x += cols[i];
    }
    y -= headerH;
    // [P2 optimize] ฝังรูปทั้งหน้าพร้อมกัน ไม่รอทีละใบ
    const thumbs = await Promise.all(
      rowPlans.map(async (plan, k) => {
        const gItem = galleryForProduct(start + k, Number(plan.item.SortOrder ?? 0));
        return gItem ? embedImage(env, pdf, gItem.Url) : null;
      })
    );
    for (let idx = 0; idx < rowPlans.length; idx++) {
      const plan = rowPlans[idx];
      const rowH = plan.rowH;
      rowTop = y;
      x = startX;
      const thumb = thumbs[idx];
      for (let i = 0; i < cols.length; i++) {
        page.drawRectangle({ x, y: rowTop - rowH, width: cols[i], height: rowH, borderColor: TABLE_BORDER, borderWidth: 0.75, color: WHITE });
        if (i === 1) {
          if (thumb) {
            const maxW = cols[i] - 8;
            const maxH = rowH - 4;
            const scale = Math.min(maxW / thumb.width, maxH / thumb.height);
            const w = thumb.width * scale;
            const h = thumb.height * scale;
            page.drawImage(thumb, {
              x: x + (cols[i] - w) / 2,
              y: rowTop - rowH + (rowH - h) / 2,
              width: w,
              height: h,
            });
          } else {
            // [P3] สินค้าไม่มีรูป: พิมพ์กำกับจางกลางเซลแทนช่องว่างเปล่า
            const t = NO_IMAGE;
            const tw = regular.widthOfTextAtSize(t, 9);
            text(t, x + (cols[i] - tw) / 2, rowTop - rowH / 2 - 3, 9, regular, TEXT_CAPTION);
          }
        } else {
          // ข้อความหลายบรรทัดจัดกลางแนวตั้ง (จุดศูนย์เดียวกับบรรทัดเดี่ยวเดิม)
          const lines = plan.wrapped[i];
          const firstBase = rowTop - rowH / 2 + ((lines.length - 1) * CELL_LINE_H) / 2 - 3;
          lines.forEach((line, li) => {
            text(line, x + 4, firstBase - li * CELL_LINE_H, TABLE_CELL_FONT_SIZE, regular, TEXT_BODY);
          });
        }
        x += cols[i];
      }
      y -= rowH;
    }
  }

  // ── Gallery grid ('รูปสินค้า/ผลิตภัณฑ์' เท่านั้น — renderGallerySectionsForPdf_) ──
  // ระยะแยกหมวดอยู่ใน drawSectionHeading แล้ว (SECTION_HEAD_SPACE_ABOVE) ไม่ต้องเว้นซ้ำ
  const productGallery = data.gallery.filter((g) => g.ImageRole === 'product' || g.ImageRole === 'gallery');
  ensureSpace(GALLERY_HEAD_RESERVE);
  if (productGallery.length === 0) {
    // คัดลอกพฤติกรรม insert/append renderer: หมวดว่าง → 'ไม่มีรูปข้อมูล'
    drawSectionHeading('รูปสินค้า/ผลิตภัณฑ์');
    text(EMPTY_SECTION, MARGIN, y - 12, 10.5, regular, TEXT_CAPTION);
    y -= 22;
  } else {
    // มีรูป → ต่อหน้าเดียวกับตารางสินค้าถ้าที่พอ (ไม่บังคับขึ้นหน้าใหม่)
    const config = galleryGridConfig(productGallery.length);
    const gap = GALLERY_GAP;
    const captionH = GALLERY_CAPTION_H;
    // รูปเดี่ยวขยายให้เต็มพื้นที่หน้าที่เหลือ (ไม่เกินความกว้างเนื้อหา)
    // หลายรูปคงขนาดเดิม 180px
    const fitSingle = (upper: number): number => {
      const availH = y - upper - MARGIN - captionH - 8;
      return Math.max(0, Math.min(CONTENT_W, availH));
    };
    let cellSize: number;
    if (productGallery.length === 1) {
      cellSize = Math.min(340, (CONTENT_W - gap * (config.cols - 1)) / config.cols);
      cellSize = Math.max(cellSize, fitSingle(SECTION_HEAD_SPACE_ABOVE + 22 + HEADING_IMAGE_GAP));
    } else {
      cellSize = Math.min(IMAGE_CELL_SIZE, (CONTENT_W - gap * (config.cols - 1)) / config.cols);
    }
    // ที่เหลือไม่พอแถวแรก → ขึ้นหน้าใหม่ก่อนวาดหัวข้อ แล้วขยายรูปเดี่ยวใหม่
    // (หลังขึ้นหน้า หัวข้ออยู่ต้นหน้าพอดี ไม่นับ above-gap)
    if (y - SECTION_HEAD_SPACE_ABOVE - 22 - HEADING_IMAGE_GAP - (cellSize + captionH + 8) < MARGIN) {
      newPage();
      if (productGallery.length === 1) {
        cellSize = Math.max(cellSize, fitSingle(22 + HEADING_IMAGE_GAP));
      }
    }
    drawSectionHeading('รูปสินค้า/ผลิตภัณฑ์');
    y -= HEADING_IMAGE_GAP; // เว้น 1 บรรทัดระหว่างหัวข้อกับรูป
    let index = 0;
    let continuation = false;
    while (index < productGallery.length) {
      const pageItems = productGallery.slice(index, index + config.rows * config.cols);
      if (continuation) {
        newPage();
        text('รูปสินค้า/ผลิตภัณฑ์ (ต่อ)', MARGIN, y - 14, 13.5, bold, TEXT_DARK);
        y -= 22 + HEADING_IMAGE_GAP;
      }
      continuation = true;
      let col = 0;
      let row = 0;
      const rowsUsed = Math.ceil(pageItems.length / config.cols);
      // [P2 optimize] ฝังรูปทั้งหน้าพร้อมกัน ไม่รอทีละใบ
      const embedded = await Promise.all(pageItems.map((item) => embedImage(env, pdf, item.Url)));
      for (let k = 0; k < pageItems.length; k++) {
        const item = pageItems[k];
        const cellX = MARGIN + col * (cellSize + gap);
        const cellTop = y - row * (cellSize + captionH + 8);
        const image = embedded[k];
        if (image) {
          const scale = Math.min(cellSize / image.width, cellSize / image.height);
          const w = image.width * scale;
          const h = image.height * scale;
          page.drawImage(image, {
            x: cellX + (cellSize - w) / 2,
            // [P1] รูปชิดล่างเซล: ท้องรูปเสมอกันทุกช่อง caption อยู่ระยะคงที่
            y: cellTop - cellSize,
            width: w,
            height: h,
          });
        } else {
          text(NO_IMAGE, cellX + 4, cellTop - cellSize / 2, 10, regular, TEXT_CAPTION);
        }
        const caption = galleryCaption(item, data.products, index);
        // คำบรรยายใต้รูปจัดกึ่งกลาง
        const capSize = 10;
        const capText = truncate(caption, regular, capSize, cellSize);
        const capW = regular.widthOfTextAtSize(capText, capSize);
        text(capText, cellX + Math.max(0, (cellSize - capW) / 2), cellTop - cellSize - captionH + 8, capSize, regular, TEXT_CAPTION);
        col++;
        if (col >= config.cols) {
          col = 0;
          row++;
        }
        index++;
      }
      y -= rowsUsed * (cellSize + captionH + 8);
    }
  }

  const bytes = await pdf.save();
  return { success: true, bytes, pdfName: baseName };
}
