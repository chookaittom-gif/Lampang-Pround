#!/usr/bin/env node
/**
 * export-source.mjs — ขั้นที่ 1 ของ migration (COPY ONLY)
 * อ่าน Google Sheets ทั้ง 5 แผ่น (read-only) แล้ว dump เป็น data/*.json
 * ไม่แตะต้นฉบับใด ๆ ทั้งสิ้น — รันซ้ำได้เสมอ (overwrites local dump เท่านั้น)
 */
import fs from 'node:fs';
import path from 'node:path';
import { getGoogleAccessToken, getSheetValues } from './lib/gsheets.mjs';

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^"|"$/g, '');
    }
  }
}

loadEnv();
const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
const spreadsheetId = process.env.SPREADSHEET_ID;
if (!email || !key || !spreadsheetId) {
  console.error('ต้องตั้ง GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY / SPREADSHEET_ID ใน migration/.env');
  process.exit(1);
}

const SHEETS = ['LamproundData', 'Users', 'Shops', 'Products', 'ShopGallery'];

console.log('── export-source (COPY ONLY) ──');
const token = await getGoogleAccessToken(email, key);
const outDir = path.join(process.cwd(), 'data');
fs.mkdirSync(outDir, { recursive: true });

const summary = { exportedAt: new Date().toISOString(), spreadsheetId, sheets: {} };
for (const sheetName of SHEETS) {
  const values = await getSheetValues(token, spreadsheetId, sheetName);
  if (values.length === 0) {
    summary.sheets[sheetName] = { headers: [], rows: 0 };
    continue;
  }
  const [headers, ...rows] = values;
  const records = rows.map((row) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[String(h).trim()] = row[i] ?? '';
    });
    return obj;
  });
  fs.writeFileSync(path.join(outDir, `${sheetName}.json`), JSON.stringify({ headers, records }, null, 1));
  summary.sheets[sheetName] = { headers: headers.length, rows: records.length };
  console.log(`✓ ${sheetName}: ${records.length} แถว (${headers.length} คอลัมน์)`);
}
fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(summary, null, 2));
console.log('เสร็จ → migration/data/');
