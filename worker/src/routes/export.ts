import type { Env } from '../env';
import { getActiveSessionResult, type Session } from '../lib/auth';
import { jsonResponse, readBody } from '../lib/http';
import { parseJsonArray } from '../lib/format';

/** exportShopPdf — Blocking Q1:
 *  1) PDF_NATIVE='on' → สร้างใน Worker ด้วย pdf-lib + Sarabun (หลังผ่านการเทียบ parity ใน staging)
 *  2) GAS_WEB_APP_URL ตั้งไว้ → proxy ไป GAS (GAS ฝั่ง doGet จะเพิ่ม action API ในเฟส 8)
 *  3) ไม่มีทั้งสอง → 501 พร้อมข้อความชัดเจน
 *  ห้ามเปลี่ยน layout/ข้อมูลก่อนผ่านการเทียบ parity รายร้าน */
export async function handleExportShopPdf(request: Request, env: Env): Promise<Response> {
  const payload = (await readBody(request)) as Record<string, unknown>;
  const token = String(payload.token ?? '').trim();
  const authResult = await getActiveSessionResult(env, token);
  if (authResult.error) return jsonResponse(authResult.error, 200, env);
  const session = authResult.session;
  const role = String(session?.role || '').trim().toLowerCase();
  if (session && role !== 'admin' && role !== 'user') {
    return jsonResponse({ success: false, message: 'คุณไม่มีสิทธิ์ดาวน์โหลดไฟล์นี้' }, 200, env);
  }
  const backendId = String(payload.backendId ?? '').trim();
  if (role === 'user' || !session) {
    const row = await env.DB.prepare(
      `SELECT created_by FROM legacy_records
       WHERE backend_id = ? AND UPPER(TRIM(COALESCE(is_deleted, ''))) != 'TRUE'`
    )
      .bind(backendId)
      .first<{ created_by: string }>();
    if (!row) return jsonResponse({ success: false, message: 'ไม่พบรายการในฐานข้อมูล' }, 200, env);
    if (
      role === 'user' &&
      session &&
      String(row.created_by || '').trim().toLowerCase() !== String(session.username).trim().toLowerCase()
    ) {
      return jsonResponse(
        { success: false, message: 'คุณไม่มีสิทธิ์ดาวน์โหลดรายการของผู้อื่น' },
        200,
        env
      );
    }
  }

  if (String(env.PDF_NATIVE || '').trim().toLowerCase() === 'on') {
    const { exportShopPdfNative } = await import('./pdf');
    const result = await exportShopPdfNative(env, payload);
    if (!result.success || !result.bytes) {
      return jsonResponse({ success: false, message: result.message ?? 'สร้าง PDF ไม่สำเร็จ' }, 200, env);
    }
    const token = crypto.randomUUID();
    const url = new URL(request.url);
    const downloadUrl = `${url.origin}/api/export/pdf/${token}`;
    const stamp = thaiTimestamp();
    const pdfFileName = `[TEMP] ${result.pdfName ?? 'shop-report'}_${stamp}.pdf`;
    const asciiPdfFileName = pdfFileName.replace(/[^A-Za-z0-9._ -]/g, '_');
    await caches.default.put(
      downloadUrl,
      new Response(result.bytes as unknown as ArrayBuffer, {
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': `attachment; filename="${asciiPdfFileName}"; filename*=UTF-8''${encodeURIComponent(pdfFileName)}`,
          'cache-control': 'public, max-age=600',
        },
      })
    );
    return jsonResponse(
      {
        success: true,
        pdfUrl: downloadUrl,
        pdfViewUrl: downloadUrl,
        pdfName: result.pdfName ?? 'shop-report',
        pdfFileId: '',
        docFileId: '',
        tempTag: '',
        issuedAt: new Date().toISOString(),
      },
      200,
      env
    );
  }

  const gasUrl = String(env.GAS_WEB_APP_URL || '').trim();
  if (!gasUrl) {
    return jsonResponse(
      {
        success: false,
        message:
          'ยังไม่เปิดใช้งาน PDF export บน Workers (รอพิสูจน์ parity) — ตั้งค่า GAS_WEB_APP_URL หรือ PDF_NATIVE=on',
      },
      501,
      env
    );
  }
  const target = `${gasUrl}${gasUrl.includes('?') ? '&' : '?'}action=exportShopPdf`;
  const resp = await fetch(target, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await resp.text();
  return new Response(data, {
    status: resp.status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/** cleanupTemporaryPdfFiles — Worker path ไม่สร้างไฟล์ชั่วคราว; คืน success เพื่อ parity
 *  (frontend เรียก fire-and-forget หลังดาวน์โหลด PDF) */
export async function handleCleanupPdf(request: Request, env: Env): Promise<Response> {
  await readBody(request);
  return jsonResponse({ success: true }, 200, env);
}

const EXCEL_HEADERS = [
  'ลำดับ',
  'ชื่อร้านค้า',
  'ชื่อเจ้าของ',
  'เบอร์โทร',
  'ช่องทางติดต่อ',
  'ที่อยู่',
  'ราคาเฉลี่ย',
  'ช่องทางจำหน่าย',
];
const EXCEL_ID_BATCH_SIZE = 90;
const EXCEL_COLUMN_WIDTHS = [8, 24, 18, 14, 24, 30, 14, 22];
const EXCEL_DATA_ROW_MIN_HEIGHT = 24;
const EXCEL_LINE_HEIGHT = 14;

interface ExportRow {
  business_name: string;
  owner_name: string;
  phone: string;
  line_id: string;
  facebook: string;
  website: string;
  location_text: string;
  avg_price: string;
  sales_channel: string;
}

type ExportQueryRow = ExportRow & { __rowid: number };

function buildContactCell(row: ExportRow): string {
  // คัดลอกจาก exportCleanExcelFile: Line:/FB:/Web: บรรทัดละช่อง หรือ '-'
  const lines: string[] = [];
  if (row.line_id) lines.push(`Line: ${row.line_id}`);
  if (row.facebook) lines.push(`FB: ${row.facebook}`);
  if (row.website) lines.push(`Web: ${row.website}`);
  return lines.length ? lines.join('\n') : '-';
}

function estimateExcelWrappedLines(value: unknown, width: number): number {
  const charsPerLine = Math.max(1, Math.floor(width * 1.05));
  return String(value ?? '')
    .split(/\r?\n/)
    .reduce((total, line) => total + Math.max(1, Math.ceil(Array.from(line).length / charsPerLine)), 0);
}

function estimateExcelRowHeight(values: unknown[]): number {
  const lines = Math.max(
    ...values.map((value, index) => estimateExcelWrappedLines(value, EXCEL_COLUMN_WIDTHS[index] || 12)),
    1
  );
  return Math.max(EXCEL_DATA_ROW_MIN_HEIGHT, lines * EXCEL_LINE_HEIGHT + 6);
}

async function buildExcelWorkbook(
  env: Env,
  recordIds: string[],
  session: Session | null
): Promise<{ buffer: ArrayBuffer; count: number }> {
  const exceljs = await import('exceljs');
  const workbook = new exceljs.Workbook();
  const sheet = workbook.addWorksheet('ข้อมูลผู้ประกอบการ');
  sheet.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    showGridLines: false,
    margins: { top: 0.45, left: 0.25, bottom: 0.45, right: 0.25, header: 0.2, footer: 0.2 },
    printTitlesRow: '1:1',
  };
  sheet.properties.showGridLines = false;
  sheet.views = [{ state: 'frozen', ySplit: 1, showGridLines: false }];
  const isUser = String(session?.role || '').trim().toLowerCase() === 'user';
  const ownershipClause = isUser
    ? ` AND LOWER(TRIM(COALESCE(created_by, ''))) = LOWER(TRIM(?))`
    : '';
  const ownershipParam = isUser ? [session?.username ?? ''] : [];

  let rows: ExportRow[];
  if (recordIds.length) {
    const queryRows: ExportQueryRow[] = [];
    for (let start = 0; start < recordIds.length; start += EXCEL_ID_BATCH_SIZE) {
      const batchIds = recordIds.slice(start, start + EXCEL_ID_BATCH_SIZE);
      const placeholders = batchIds.map(() => '?').join(', ');
      const batchRows = await env.DB.prepare(
        `SELECT rowid AS __rowid, business_name, owner_name, phone, line_id, facebook, website,
         location_text, avg_price, sales_channel FROM legacy_records
         WHERE UPPER(TRIM(is_deleted)) != 'TRUE' AND backend_id IN (${placeholders})${ownershipClause} ORDER BY rowid`
      )
        .bind(...batchIds, ...ownershipParam)
        .all<ExportQueryRow>()
        .then((r) => r.results);
      queryRows.push(...batchRows);
    }
    queryRows.sort((a, b) => a.__rowid - b.__rowid);
    rows = queryRows.map(({ __rowid: _rowid, ...row }) => row);
  } else {
    rows = await env.DB.prepare(
      `SELECT business_name, owner_name, phone, line_id, facebook, website,
       location_text, avg_price, sales_channel FROM legacy_records
       WHERE UPPER(TRIM(is_deleted)) != 'TRUE'${ownershipClause} ORDER BY rowid`
    )
      .bind(...ownershipParam)
      .all<ExportRow>()
      .then((r) => r.results);
  }

  const headerRow = sheet.addRow(EXCEL_HEADERS);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Sarabun', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });
  EXCEL_COLUMN_WIDTHS.forEach((width, i) => {
    sheet.getColumn(i + 1).width = width;
  });

  rows.forEach((row, index) => {
    const salesChannels = parseJsonArray(row.sales_channel).join(', ');
    const values = [
      index + 1,
      row.business_name || '',
      row.owner_name || '',
      row.phone || '',
      buildContactCell(row),
      row.location_text || '',
      row.avg_price || '',
      salesChannels || '-',
    ];
    const added = sheet.addRow(values);
    added.height = estimateExcelRowHeight(values);
    added.eachCell((cell, columnNumber) => {
      cell.font = { name: 'Sarabun', size: 10 };
      cell.alignment = {
        vertical: 'top',
        horizontal: columnNumber === 1 || columnNumber === 4 ? 'center' : 'left',
        wrapText: true,
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer: buffer as ArrayBuffer, count: rows.length };
}

/** exportCleanExcelFile — สร้าง .xlsx แล้วเก็บใน Cache API 10 นาที
 *  คืน { success, url: '/api/export/excel/<token>', count } — frontend window.open(url)
 *  ชื่อไฟล์: Lampang_Pround_Export_<yyyyMMdd_HHmmss>.xlsx (parity กับเดิม) */
export async function handleExportExcel(request: Request, env: Env): Promise<Response> {
  try {
    const payload = (await readBody(request)) as Record<string, unknown>;
    const token = String(payload.token ?? '').trim();
    const authResult = await getActiveSessionResult(env, token);
    if (authResult.error) return jsonResponse(authResult.error, 200, env);
    const session = authResult.session;
    const role = String(session?.role || '').trim().toLowerCase();
    if (session && role !== 'admin' && role !== 'user') {
      return jsonResponse({ success: false, message: 'คุณไม่มีสิทธิ์ดาวน์โหลดไฟล์นี้' }, 200, env);
    }
    const recordIds = Array.isArray(payload.recordIds)
      ? Array.from(new Set((payload.recordIds as unknown[]).map((v) => String(v)).filter(Boolean)))
      : [];
    const { buffer, count } = await buildExcelWorkbook(env, recordIds, session);
    if (count === 0) {
      return jsonResponse(
        { success: false, message: 'ไม่พบรายการที่มีสิทธิ์ส่งออก' },
        200,
        env
      );
    }
    const downloadToken = crypto.randomUUID();
    const url = new URL(request.url);
    const downloadUrl = `${url.origin}/api/export/excel/${downloadToken}`;
    const stamp = thaiTimestamp();
    await caches.default.put(
      downloadUrl,
      new Response(buffer, {
        headers: {
          'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'content-disposition': `attachment; filename="Lampang_Pround_Export_${stamp}.xlsx"`,
          'cache-control': 'public, max-age=600',
        },
      })
    );
    return jsonResponse({ success: true, url: downloadUrl, count }, 200, env);
  } catch (err) {
    return jsonResponse(
      { success: false, message: `เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : String(err)}` },
      200,
      env
    );
  }
}

function thaiTimestamp(): string {
  // yyyyMMdd_HHmmss ตาม timezone Asia/Bangkok (parity กับ Utilities.formatDate เดิม)
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `_${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`
  );
}

export async function handleExcelDownload(request: Request, env: Env): Promise<Response> {
  const cached = await caches.default.match(request);
  if (cached) return cached;
  return jsonResponse({ success: false, message: 'ไฟล์หมดอายุ กรุณาสร้างใหม่อีกครั้ง' }, 404, env);
}
