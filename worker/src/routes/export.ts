import type { Env } from '../env';
import { jsonResponse, readBody } from '../lib/http';
import { parseJsonArray } from '../lib/format';

/** exportShopPdf — Blocking Q1:
 *  1) PDF_NATIVE='on' → สร้างใน Worker ด้วย pdf-lib + Sarabun (หลังผ่านการเทียบ parity ใน staging)
 *  2) GAS_WEB_APP_URL ตั้งไว้ → proxy ไป GAS (GAS ฝั่ง doGet จะเพิ่ม action API ในเฟส 8)
 *  3) ไม่มีทั้งสอง → 501 พร้อมข้อความชัดเจน
 *  ห้ามเปลี่ยน behavior ก่อนผ่านการเทียบ parity รายร้าน */
export async function handleExportShopPdf(request: Request, env: Env): Promise<Response> {
  const payload = (await readBody(request)) as Record<string, unknown>;

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
    await caches.default.put(
      downloadUrl,
      new Response(result.bytes as unknown as ArrayBuffer, {
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': `attachment; filename="[TEMP] ${result.pdfName ?? 'shop-report'}_${stamp}.pdf"`,
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

function buildContactCell(row: ExportRow): string {
  // คัดลอกจาก exportCleanExcelFile: Line:/FB:/Web: บรรทัดละช่อง หรือ '-'
  const lines: string[] = [];
  if (row.line_id) lines.push(`Line: ${row.line_id}`);
  if (row.facebook) lines.push(`FB: ${row.facebook}`);
  if (row.website) lines.push(`Web: ${row.website}`);
  return lines.length ? lines.join('\n') : '-';
}

async function buildExcelWorkbook(
  env: Env,
  recordIds: string[]
): Promise<{ buffer: ArrayBuffer; count: number }> {
  const exceljs = await import('exceljs');
  const workbook = new exceljs.Workbook();
  const sheet = workbook.addWorksheet('ข้อมูลผู้ประกอบการ');

  let rows: ExportRow[];
  if (recordIds.length) {
    const placeholders = recordIds.map(() => '?').join(', ');
    rows = await env.DB.prepare(
      `SELECT business_name, owner_name, phone, line_id, facebook, website,
       location_text, avg_price, sales_channel FROM legacy_records
       WHERE is_deleted = 'FALSE' AND backend_id IN (${placeholders}) ORDER BY rowid`
    )
      .bind(...recordIds)
      .all<ExportRow>()
      .then((r) => r.results);
  } else {
    rows = await env.DB.prepare(
      `SELECT business_name, owner_name, phone, line_id, facebook, website,
       location_text, avg_price, sales_channel FROM legacy_records
       WHERE is_deleted = 'FALSE' ORDER BY rowid`
    )
      .all<ExportRow>()
      .then((r) => r.results);
  }

  const headerRow = sheet.addRow(EXCEL_HEADERS);
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Sarabun', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });
  [48, 150, 110, 90, 125, 172, 75, 105].forEach((width, i) => {
    sheet.getColumn(i + 1).width = width;
  });

  rows.forEach((row, index) => {
    const salesChannels = parseJsonArray(row.sales_channel).join(', ');
    const added = sheet.addRow([
      index + 1,
      row.business_name || '',
      row.owner_name || '',
      row.phone || '',
      buildContactCell(row),
      row.location_text || '',
      row.avg_price || '',
      salesChannels || '-',
    ]);
    added.eachCell((cell) => {
      cell.font = { name: 'Sarabun', size: 10 };
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
    const recordIds = Array.isArray(payload.recordIds)
      ? (payload.recordIds as unknown[]).map((v) => String(v)).filter(Boolean)
      : [];
    const { buffer, count } = await buildExcelWorkbook(env, recordIds);
    const token = crypto.randomUUID();
    const url = new URL(request.url);
    const downloadUrl = `${url.origin}/api/export/excel/${token}`;
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
