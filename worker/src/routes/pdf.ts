import { PDFDocument, rgb, PDFFont, PDFPage, PDFImage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Env } from '../env';
import { parseJsonArray } from '../lib/format';

import sarabunRegular from '../assets/Sarabun-Regular.ttf';
import sarabunBold from '../assets/Sarabun-Bold.ttf';

/** ค่า layout คัดลอกจาก constants ของ Code.gs (บรรทัด 12–27) — layout version v13 */
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 36;
const CONTENT_W = PAGE_W - MARGIN * 2;
const LABEL_W = 180;
const VALUE_W = 343;
const PRODUCT_COL_WIDTHS = [34, 108, 116, 78, 62, 125];
const IMAGE_CELL_SIZE = 180;
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

function isProductGalleryItem(item: PdfGalleryItem): boolean {
  const role = String(item.ImageRole || '').trim().toLowerCase();
  return role === 'product' || role === 'gallery';
}

function isUnlinkedGalleryProductId(productId: string): boolean {
  const value = String(productId || '').trim().toLowerCase();
  return !value || value === 'null' || value === 'undefined';
}

/** คัดลอกลำดับจับคู่รูปกับสินค้าให้ตรงกับ frontend: ProductID → SortOrder → index */
function findProductGalleryItem(
  product: PdfProduct,
  gallery: PdfGalleryItem[],
  productIndex: number
): PdfGalleryItem | null {
  const productGallery = gallery.filter(isProductGalleryItem);
  const productId = String(product.ProductID || '').trim();
  if (productId) {
    const linked = productGallery.find(
      (item) => !isUnlinkedGalleryProductId(item.ProductID) && String(item.ProductID).trim() === productId
    );
    if (linked) return linked;
  }
  const loose = productGallery
    .filter((item) => isUnlinkedGalleryProductId(item.ProductID))
    .slice()
    .sort((a, b) => Number(a.SortOrder || 0) - Number(b.SortOrder || 0));
  const sortOrder = Number.isFinite(Number(product.SortOrder))
    ? Number(product.SortOrder)
    : productIndex + 1;
  const byOrder = loose.find((item) => Number(item.SortOrder || 0) === sortOrder);
  return byOrder || loose[productIndex] || null;
}

/** คัดลอกตรงจาก getGalleryGridConfig_: ≤3→1 แถว, ≤4→2×2, ≤6→2 คอลัมน์, อื่น ๆ 3×3 */
function galleryGridConfig(count: number): { rows: number; cols: number } {
  if (count <= 3) return { rows: 1, cols: Math.max(count, 1) };
  if (count <= 4) return { rows: 2, cols: 2 };
  if (count <= 6) return { rows: Math.ceil(count / 2), cols: 2 };
  return { rows: 3, cols: 3 };
}

function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && font.widthOfTextAtSize(out + '…', size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return out + '…';
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
  maxLines = 2
): string[] {
  const lines = [''];
  for (const char of Array.from(text)) {
    const last = lines.length - 1;
    const candidate = lines[last] + char;
    if (!lines[last] || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      lines[last] = candidate;
      continue;
    }
    if (lines.length >= maxLines) {
      lines[last] = truncate(lines[last] + '…', font, size, maxWidth);
      break;
    }
    lines.push(char);
  }
  return lines;
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

  const embeddedImageCache = new Map<string, Promise<PDFImage | null>>();
  const embedCachedImage = (url: string): Promise<PDFImage | null> => {
    const key = String(url || '').trim();
    if (!key) return Promise.resolve(null);
    const cached = embeddedImageCache.get(key);
    if (cached) return cached;
    const pending = embedImage(env, pdf, key);
    embeddedImageCache.set(key, pending);
    return pending;
  };

  // ── Header (v13) ──
  text(display(shop.BusinessName), MARGIN, y - 18, 18, bold, TEXT_DARK);
  y -= 30;
  text('สำนักงานพัฒนาชุมชน', MARGIN, y - 14, 14, regular, TEXT_BODY);
  y -= 24;
  text(`วันที่พิมพ์รายงาน: ${thaiDateText(new Date().toISOString())}`, MARGIN, y - 12, 10.5, regular, TEXT_CAPTION);
  y -= 26;

  const drawSectionHeading = (title: string): void => {
    ensureSpace(42);
    y -= 6;
    text(title, MARGIN, y - 14, 13.5, bold, TEXT_DARK);
    y -= 28;
  };

  const drawLabelValueTable = (rows: [string, string][]): void => {
    for (const [label, value] of rows) {
      const lines = wrapText(value, regular, 10.5, VALUE_W - 10, 3);
      const rowH = Math.max(26, lines.length * 11 + 12);
      ensureSpace(rowH);
      const top = y;
      page.drawRectangle({ x: MARGIN, y: top - rowH, width: LABEL_W, height: rowH, borderColor: TABLE_BORDER, borderWidth: 0.75, color: LABEL_BG });
      page.drawRectangle({ x: MARGIN + LABEL_W, y: top - rowH, width: VALUE_W, height: rowH, borderColor: TABLE_BORDER, borderWidth: 0.75, color: WHITE });
      text(truncate(label, bold, 10.5, LABEL_W - 10), MARGIN + 6, top - 10, 10.5, bold, TEXT_BODY);
      lines.forEach((line, index) => {
        text(line, MARGIN + LABEL_W + 6, top - 10 - index * 11, 10.5, regular, TEXT_BODY);
      });
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

  // ── Products table (รูปสินค้าอยู่ในแถวเดียวกับข้อมูล และแบ่งหน้าอย่างปลอดภัย) ──
  // ลำดับคอลัมน์: ลำดับ | รูปภาพ | ชื่อสินค้า | หมวดหมู่ | รายละเอียด | ราคา
  const productGallery = data.gallery.filter(isProductGalleryItem);
  const productTableHeaderHeight = 24;
  const productTableImageSize = 54;
  const productTableMinRowHeight = 66;
  const productTableFontSize = 9.5;
  const productTableLineHeight = 11;
  const productTablePageSize = 6;
  const cols = PRODUCT_COL_WIDTHS;
  const total = cols.reduce((a, b) => a + b, 0);
  const startX = MARGIN + (CONTENT_W - total) / 2;
  const headerRow = ['ลำดับ', 'รูปภาพ', 'ชื่อสินค้า', 'หมวดหมู่', 'รายละเอียด', 'ราคา'];

  const drawProductTableHeader = (continuation: boolean): void => {
    drawSectionHeading(continuation ? 'สรุปรายการสินค้า (ต่อ)' : 'สรุปรายการสินค้า');
    let x = startX;
    const rowTop = y;
    for (let i = 0; i < cols.length; i++) {
      page.drawRectangle({
        x,
        y: rowTop - productTableHeaderHeight,
        width: cols[i],
        height: productTableHeaderHeight,
        borderColor: TABLE_BORDER,
        borderWidth: 0.75,
        color: TABLE_HEADER_BG,
      });
      text(headerRow[i], x + 4, rowTop - 16, 10, bold, TEXT_BODY);
      x += cols[i];
    }
    y -= productTableHeaderHeight;
  };

  for (let start = 0; start < data.products.length; start += productTablePageSize) {
    if (start > 0) newPage();
    const pageProducts = data.products.slice(start, start + productTablePageSize);
    ensureSpace(22 + productTableHeaderHeight + productTableMinRowHeight * pageProducts.length);
    drawProductTableHeader(start > 0);

    for (let idx = 0; idx < pageProducts.length; idx++) {
      const item = pageProducts[idx];
      const productIndex = start + idx;
      const cells = [
        String(productIndex + 1),
        '',
        item.ProductName || NOT_SPECIFIED,
        item.ProductCategory || NOT_SPECIFIED,
        item.Description || NOT_SPECIFIED,
        item.Price || NOT_SPECIFIED,
      ];
      const wrappedCells = cells.map((cell, cellIndex) =>
        cellIndex === 1
          ? []
          : wrapText(cell, regular, productTableFontSize, cols[cellIndex] - 8, 4)
      );
      const textRowHeight = Math.max(
        ...wrappedCells
          .filter((lines) => lines.length > 0)
          .map((lines) => lines.length * productTableLineHeight + 12),
        productTableMinRowHeight
      );
      const rowHeight = Math.max(productTableImageSize + 12, textRowHeight);
      if (y - rowHeight < MARGIN) {
        newPage();
        drawProductTableHeader(true);
      }

      const rowTop = y;
      const imageItem = findProductGalleryItem(item, productGallery, productIndex);
      const image = imageItem ? await embedCachedImage(imageItem.Url) : null;
      let x = startX;
      for (let i = 0; i < cols.length; i++) {
        page.drawRectangle({
          x,
          y: rowTop - rowHeight,
          width: cols[i],
          height: rowHeight,
          borderColor: TABLE_BORDER,
          borderWidth: 0.75,
          color: WHITE,
        });
        if (i === 1) {
          if (image) {
            const scale = Math.min(
              (cols[i] - 8) / image.width,
              (rowHeight - 8) / image.height
            );
            const imageWidth = image.width * scale;
            const imageHeight = image.height * scale;
            page.drawImage(image, {
              x: x + (cols[i] - imageWidth) / 2,
              y: rowTop - (rowHeight + imageHeight) / 2,
              width: imageWidth,
              height: imageHeight,
            });
          } else {
            text(NO_IMAGE, x + 4, rowTop - rowHeight / 2 + 3, 8.5, regular, TEXT_CAPTION);
          }
        } else {
          wrappedCells[i].forEach((line, lineIndex) => {
            text(
              line,
              x + 4,
              rowTop - 10 - lineIndex * productTableLineHeight,
              productTableFontSize,
              regular,
              TEXT_BODY
            );
          });
        }
        x += cols[i];
      }
      y -= rowHeight;
    }
  }

  // ── Gallery grid ('รูปสินค้า/ผลิตภัณฑ์' เท่านั้น — renderGallerySectionsForPdf_) ──
  if (productGallery.length === 0) {
    // คัดลอกพฤติกรรม insert/append renderer: หมวดว่าง → 'ไม่มีรูปข้อมูล'
    drawSectionHeading('รูปสินค้า/ผลิตภัณฑ์');
    text(EMPTY_SECTION, MARGIN, y - 12, 10.5, regular, TEXT_CAPTION);
    y -= 22;
  } else {
    const config = galleryGridConfig(productGallery.length);
    const gap = 16;
    const cellSize = Math.min(IMAGE_CELL_SIZE, (CONTENT_W - gap * (config.cols - 1)) / config.cols);
    const captionH = 18;
    const galleryRowH = cellSize + captionH + 8;
    const drawGalleryHeading = (continuation = false): void => {
      y -= 6;
      text(continuation ? 'รูปสินค้า/ผลิตภัณฑ์ (ต่อ)' : 'รูปสินค้า/ผลิตภัณฑ์', MARGIN, y - 14, 13.5, bold, TEXT_DARK);
      y -= 28;
    };

    ensureSpace(28 + galleryRowH);
    drawGalleryHeading();
    let index = 0;
    while (index < productGallery.length) {
      if (index > 0 && y - galleryRowH < MARGIN) {
        newPage();
        ensureSpace(28 + galleryRowH);
        drawGalleryHeading(true);
      }
      const rowItems = productGallery.slice(index, index + config.cols);
      const rowTop = y;
      for (let col = 0; col < rowItems.length; col++) {
        const item = rowItems[col];
        const cellX = MARGIN + col * (cellSize + gap);
        const cellTop = rowTop;
        const image = await embedCachedImage(item.Url);
        if (image) {
          const scale = Math.min(cellSize / image.width, cellSize / image.height);
          const w = image.width * scale;
          const h = image.height * scale;
          page.drawImage(image, {
            x: cellX + (cellSize - w) / 2,
            y: cellTop - cellSize + (cellSize - h) / 2,
            width: w,
            height: h,
          });
        } else {
          text(NO_IMAGE, cellX + 4, cellTop - cellSize / 2, 10, regular, TEXT_CAPTION);
        }
        const caption = galleryCaption(item, data.products, index + col);
        text(truncate(caption, regular, 10, cellSize), cellX, cellTop - cellSize - captionH + 8, 10, regular, TEXT_CAPTION);
      }
      y -= galleryRowH;
      index += rowItems.length;
    }
  }

  const bytes = await pdf.save();
  return { success: true, bytes, pdfName: baseName };
}
