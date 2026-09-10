import { PDFDocument, rgb, PDFFont, PDFPage, PDFImage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Env } from '../env';
import { parseJsonArray } from '../lib/format';

import sarabunRegular from '../assets/Sarabun-Regular.ttf';
import sarabunBold from '../assets/Sarabun-Bold.ttf';

/** ค่า layout A4 สำหรับ native PDF ใช้ palette เดิมและปรับการไหลของเนื้อหา — layout version v14 */
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 36;
const CONTENT_W = PAGE_W - MARGIN * 2;
const LABEL_W = 128;
const PRODUCT_COL_WIDTHS = [34, 150, 108, 165, 66];
const IMAGE_CELL_SIZE = 220;
const GALLERY_FRAME_MAX_HEIGHT = 190;
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

/** PDF gallery: ใช้ 2 คอลัมน์เพื่อให้ภาพและคำบรรยายอ่านได้ชัดบน A4 */
function galleryGridConfig(count: number): { rows: number; cols: number } {
  if (count <= 1) return { rows: 1, cols: 1 };
  if (count <= 4) return { rows: Math.ceil(count / 2), cols: 2 };
  return { rows: Math.ceil(count / 3), cols: 3 };
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

  const drawLabelValueTable = (
    rows: [string, string][],
    options: {
      x?: number;
      width?: number;
      labelWidth?: number;
      maxLines?: number;
      fontSize?: number;
    } = {}
  ): void => {
    const x = options.x ?? MARGIN;
    const width = options.width ?? CONTENT_W;
    const labelWidth = options.labelWidth ?? LABEL_W;
    const maxLines = options.maxLines ?? 4;
    const fontSize = options.fontSize ?? 10.5;
    const lineHeight = fontSize + 1.5;
    const valueWidth = width - labelWidth;

    for (const [label, value] of rows) {
      const lines = wrapText(value, regular, fontSize, valueWidth - 10, maxLines);
      const rowH = Math.max(25, lines.length * lineHeight + 11);
      ensureSpace(rowH);
      const top = y;
      page.drawRectangle({ x, y: top - rowH, width: labelWidth, height: rowH, borderColor: TABLE_BORDER, borderWidth: 0.75, color: LABEL_BG });
      page.drawRectangle({ x: x + labelWidth, y: top - rowH, width: valueWidth, height: rowH, borderColor: TABLE_BORDER, borderWidth: 0.75, color: WHITE });
      text(truncate(label, bold, fontSize, labelWidth - 10), x + 6, top - 10, fontSize, bold, TEXT_BODY);
      lines.forEach((line, index) => {
        text(line, x + labelWidth + 6, top - 10 - index * lineHeight, fontSize, regular, TEXT_BODY);
      });
      y -= rowH;
    }
  };

  const drawInfoColumns = (
    leftTitle: string,
    leftRows: [string, string][],
    rightTitle: string,
    rightRows: [string, string][]
  ): void => {
    const gap = 14;
    const columnWidth = (CONTENT_W - gap) / 2;
    const labelWidth = 82;
    const valueWidth = columnWidth - labelWidth;
    const fontSize = 9.5;
    const lineHeight = 10.5;
    const headerHeight = 25;
    const rowHeight = (row: [string, string] | undefined): number => {
      if (!row) return 23;
      const lines = wrapText(row[1], regular, fontSize, valueWidth - 10, 2);
      return Math.max(23, lines.length * lineHeight + 10);
    };
    const rowCount = Math.max(leftRows.length, rightRows.length);
    const rowHeights = Array.from({ length: rowCount }, (_, index) =>
      Math.max(rowHeight(leftRows[index]), rowHeight(rightRows[index]))
    );
    const totalHeight = headerHeight + rowHeights.reduce((sum, height) => sum + height, 0);
    if (y - totalHeight < MARGIN) newPage();

    const rightX = MARGIN + columnWidth + gap;
    page.drawRectangle({ x: MARGIN, y: y - headerHeight, width: columnWidth, height: headerHeight, borderColor: TABLE_BORDER, borderWidth: 0.75, color: TABLE_HEADER_BG });
    page.drawRectangle({ x: rightX, y: y - headerHeight, width: columnWidth, height: headerHeight, borderColor: TABLE_BORDER, borderWidth: 0.75, color: TABLE_HEADER_BG });
    text(leftTitle, MARGIN + 8, y - 16, 12, bold, TEXT_BODY);
    text(rightTitle, rightX + 8, y - 16, 12, bold, TEXT_BODY);
    y -= headerHeight;

    const drawRow = (
      row: [string, string] | undefined,
      x: number,
      top: number,
      height: number
    ): void => {
      const labelColor = row ? LABEL_BG : WHITE;
      page.drawRectangle({ x, y: top - height, width: labelWidth, height, borderColor: TABLE_BORDER, borderWidth: 0.75, color: labelColor });
      page.drawRectangle({ x: x + labelWidth, y: top - height, width: valueWidth, height, borderColor: TABLE_BORDER, borderWidth: 0.75, color: WHITE });
      if (!row) return;
      const lines = wrapText(row[1], regular, fontSize, valueWidth - 10, 2);
      text(truncate(row[0], bold, fontSize, labelWidth - 10), x + 5, top - 9, fontSize, bold, TEXT_BODY);
      lines.forEach((line, index) => {
        text(line, x + labelWidth + 5, top - 9 - index * lineHeight, fontSize, regular, TEXT_BODY);
      });
    };

    rowHeights.forEach((height, index) => {
      const top = y;
      drawRow(leftRows[index], MARGIN, top, height);
      drawRow(rightRows[index], rightX, top, height);
      y -= height;
    });
  };

  const drawSummaryMetrics = (items: [string, string][]): void => {
    const gap = 14;
    const cellWidth = (CONTENT_W - gap * 2) / 3;
    const cellHeight = 44;
    if (y - cellHeight < MARGIN) newPage();
    const top = y;
    items.forEach(([label, value], index) => {
      const x = MARGIN + index * (cellWidth + gap);
      page.drawRectangle({ x, y: top - cellHeight, width: cellWidth, height: cellHeight, borderColor: TABLE_BORDER, borderWidth: 0.75, color: LABEL_BG });
      text(label, x + 8, top - 15, 8.5, regular, TEXT_CAPTION);
      text(value, x + 8, top - 34, 13, bold, TEXT_DARK);
    });
    y -= cellHeight + 12;
  };

  const productCategory = parseJsonArray(shop.ProductCategory).join(', ');
  const salesChannel = parseJsonArray(shop.SalesChannel).join(', ');
  drawInfoColumns('ข้อมูลร้านค้า', [
    ['ชื่อร้านค้า', display(shop.BusinessName)],
    ['ชื่อเจ้าของ', display(shop.OwnerName)],
    ['เบอร์โทร', display(shop.Phone)],
    ['Line ID', display(shop.LineID)],
    ['Facebook', display(shop.Facebook)],
    ['เว็บไซต์', display(shop.Website)],
  ], 'ข้อมูลธุรกิจ', [
    ['ประเภทธุรกิจ', display(shop.BusinessType)],
    ['หมวดหมู่สินค้า', display(productCategory)],
    ['ระดับธุรกิจ', display(shop.BusinessLevel)],
    ['ช่องทางจำหน่าย', display(salesChannel)],
    ['ราคาเฉลี่ย', display(shop.AvgPrice)],
    ['สถานะธุรกิจ', display(shop.BusinessStatus)],
  ]);

  drawSummaryMetrics([
    ['ระดับศักยภาพ', display(shop.PotentialLevel)],
    ['จำนวนสินค้า', String(data.products.length)],
    ['จำนวนรูปภาพ', String(data.gallery.length)],
  ]);

  drawSectionHeading('ที่ตั้งและประวัติ');
  drawLabelValueTable([
    ['ที่ตั้ง', display(shop.LocationText)],
    ['ประวัติร้านค้า', display(shop.ShopHistory)],
  ], { maxLines: 8 });

  // ── Products table (ข้อความอ่านง่าย แล้วแสดงภาพใน gallery ด้านล่าง) ──
  // ลำดับคอลัมน์: ลำดับ | ชื่อสินค้า | หมวดหมู่ | รายละเอียด | ราคา
  const productGallery = data.gallery.filter(isProductGalleryItem);
  const productTableHeaderHeight = 24;
  const productTableMinRowHeight = 26;
  const productTableFontSize = 9.5;
  const productTableLineHeight = 11;
  const productTableMaxLines = 5;
  const cols = PRODUCT_COL_WIDTHS;
  const total = cols.reduce((a, b) => a + b, 0);
  const startX = MARGIN + (CONTENT_W - total) / 2;
  const headerRow = ['ลำดับ', 'ชื่อสินค้า', 'หมวดหมู่', 'รายละเอียด', 'ราคา'];

  const measureProductRow = (
    item: PdfProduct,
    productIndex: number
  ): { wrappedCells: string[][]; rowHeight: number } => {
    const cells = [
      String(productIndex + 1),
      item.ProductName || NOT_SPECIFIED,
      item.ProductCategory || NOT_SPECIFIED,
      item.Description || NOT_SPECIFIED,
      item.Price || NOT_SPECIFIED,
    ];
    const wrappedCells = cells.map((cell, cellIndex) =>
      wrapText(
        cell,
        regular,
        productTableFontSize,
        cols[cellIndex] - 8,
        cellIndex === 3 ? productTableMaxLines : 3
      )
    );
    const textRowHeight = Math.max(
      ...wrappedCells.map((lines) => lines.length * productTableLineHeight + 11),
      productTableMinRowHeight
    );
    return { wrappedCells, rowHeight: textRowHeight };
  };

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

  if (data.products.length === 0) {
    drawSectionHeading('สรุปรายการสินค้า');
    text('ไม่มีสินค้า', MARGIN, y - 12, 10.5, regular, TEXT_CAPTION);
    y -= 24;
  } else {
    for (let productIndex = 0; productIndex < data.products.length; productIndex++) {
      const item = data.products[productIndex];
      const metrics = measureProductRow(item, productIndex);
      const headingAndHeaderHeight = 34 + productTableHeaderHeight;
      if (productIndex === 0 || y - metrics.rowHeight < MARGIN) {
        if (productIndex > 0) newPage();
        if (y - headingAndHeaderHeight - metrics.rowHeight < MARGIN) newPage();
        drawProductTableHeader(productIndex > 0);
      }

      const rowTop = y;
      let x = startX;
      for (let i = 0; i < cols.length; i++) {
        page.drawRectangle({
          x,
          y: rowTop - metrics.rowHeight,
          width: cols[i],
          height: metrics.rowHeight,
          borderColor: TABLE_BORDER,
          borderWidth: 0.75,
          color: WHITE,
        });
        metrics.wrappedCells[i].forEach((line, lineIndex) => {
          text(
            line,
            x + 4,
            rowTop - 10 - lineIndex * productTableLineHeight,
            productTableFontSize,
            regular,
            TEXT_BODY
          );
        });
        x += cols[i];
      }
      y -= metrics.rowHeight;
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
    const gridWidth = cellSize * config.cols + gap * (config.cols - 1);
    const gridX = MARGIN + (CONTENT_W - gridWidth) / 2;
    const frameHeight = Math.min(GALLERY_FRAME_MAX_HEIGHT, Math.max(110, cellSize * 0.86));
    const captionLineHeight = 11;
    const captionH = captionLineHeight * 2 + 5;
    const galleryRowH = frameHeight + captionH + 8;
    const galleryHeadingHeight = 34;
    const drawGalleryHeading = (continuation = false): void => {
      y -= 6;
      text(continuation ? 'รูปสินค้า/ผลิตภัณฑ์ (ต่อ)' : 'รูปสินค้า/ผลิตภัณฑ์', MARGIN, y - 14, 13.5, bold, TEXT_DARK);
      y -= 28;
    };

    ensureSpace(galleryHeadingHeight + galleryRowH);
    drawGalleryHeading();
    let index = 0;
    while (index < productGallery.length) {
      if (index > 0 && y - galleryRowH < MARGIN) {
        newPage();
        ensureSpace(galleryHeadingHeight + galleryRowH);
        drawGalleryHeading(true);
      }
      const rowItems = productGallery.slice(index, index + config.cols);
      const rowTop = y;
      for (let col = 0; col < rowItems.length; col++) {
        const item = rowItems[col];
        const cellX = gridX + col * (cellSize + gap);
        const cellTop = rowTop;
        const image = await embedCachedImage(item.Url);
        page.drawRectangle({
          x: cellX,
          y: cellTop - frameHeight,
          width: cellSize,
          height: frameHeight,
          borderColor: TABLE_BORDER,
          borderWidth: 0.75,
          color: LABEL_BG,
        });
        if (image) {
          const scale = Math.min((cellSize - 12) / image.width, (frameHeight - 12) / image.height);
          const w = image.width * scale;
          const h = image.height * scale;
          page.drawImage(image, {
            x: cellX + (cellSize - w) / 2,
            y: cellTop - frameHeight + (frameHeight - h) / 2,
            width: w,
            height: h,
          });
        } else {
          text(NO_IMAGE, cellX + 8, cellTop - frameHeight / 2, 10, regular, TEXT_CAPTION);
        }
        const caption = galleryCaption(item, data.products, index + col);
        const captionLines = wrapText(caption, regular, 9.5, cellSize - 8, 2);
        captionLines.forEach((line, lineIndex) => {
          text(line, cellX + 4, cellTop - frameHeight - 12 - lineIndex * captionLineHeight, 9.5, regular, TEXT_CAPTION);
        });
      }
      y -= galleryRowH;
      index += rowItems.length;
    }
  }

  const bytes = await pdf.save();
  return { success: true, bytes, pdfName: baseName };
}
