import type { D1Database } from '@cloudflare/workers-types';

/** คัดลอกตรงจาก normalizeProductItems_ (บรรทัด 1224–1238) */
export interface ProductItem {
  productName: string;
  productCategory: string;
  description: string;
  price: string;
  unit: string;
  sortOrder: number;
  image?: string;
}

export function normalizeProductItems(items: unknown): ProductItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((raw, index) => {
      const item = (raw ?? {}) as Record<string, unknown>;
      return {
        productName: String(item.productName ?? item.name ?? '').trim(),
        productCategory: String(item.productCategory ?? item.category ?? '').trim(),
        description: String(item.description ?? item.detail ?? '').trim(),
        price: String(item.price ?? '').trim(),
        unit: String(item.unit ?? '').trim(),
        sortOrder:
          item.sortOrder !== null && item.sortOrder !== undefined
            ? Number(item.sortOrder)
            : index + 1,
        image: String(item.image ?? item.Image ?? '').trim() || undefined,
      };
    })
    .filter(
      (item) => item.productName || item.productCategory || item.description || item.price
    );
}

/** คัดลอกตรงจาก summarizeProductItems_ (บรรทัด 1240–1259) */
export function summarizeProductItems(items: unknown): {
  mainProducts: string;
  avgPrice: string;
} {
  const normalized = normalizeProductItems(items);
  const names: string[] = [];
  const numericPrices: number[] = [];
  let fallbackPrice = '';

  normalized.forEach((item) => {
    if (item.productName) names.push(item.productName);
    if (!fallbackPrice && item.price) fallbackPrice = String(item.price).trim();
    const numericText = String(item.price || '').replace(new RegExp('[^0-9.]', 'g'), '');
    if (!numericText) return;
    const numeric = Number(numericText);
    if (!Number.isNaN(numeric)) numericPrices.push(numeric);
  });

  return {
    mainProducts: names.join(', '),
    avgPrice: numericPrices.length
      ? String(
          Math.round(
            numericPrices.reduce((sum, value) => sum + value, 0) / numericPrices.length
          )
        )
      : fallbackPrice,
  };
}

/** คัดลอกตรงจาก nextSequenceId_ (บรรทัด 1114–1125) — ใช้ตาราง id_counters แทนการ scan,
 *  atomic ผ่าน UPDATE ... RETURNING (ไม่มี partial write เหมือนชีตเดิม) */
export async function nextSequenceId(
  db: D1Database,
  counterName: 'SHOP' | 'PROD' | 'GAL',
  prefix: string,
  width = 6
): Promise<string> {
  const result = await db
    .prepare(
      `UPDATE id_counters SET next_value = next_value + 1 WHERE name = ? RETURNING next_value - 1 AS value`
    )
    .bind(counterName)
    .first<{ value: number }>();
  const value = result?.value ?? 1;
  return prefix + String(value).padStart(width, '0');
}

/** คัดลอกตรงจาก generateLamproundId (บรรทัด 298–322): LR-YYMMDD-XXXX */
export async function generateLamproundId(db: D1Database, now = new Date()): Promise<string> {
  const yy = String(now.getFullYear()).slice(-2);
  const mm = ('0' + (now.getMonth() + 1)).slice(-2);
  const dd = ('0' + now.getDate()).slice(-2);
  const prefix = `LR-${yy}${mm}${dd}-`;
  const row = await db
    .prepare(
      `SELECT MAX(CAST(SUBSTR(lampround_id, LENGTH(?) + 1) AS INTEGER)) AS max_seq
       FROM legacy_records WHERE lampround_id LIKE ?`
    )
    .bind(prefix, prefix + '%')
    .first<{ max_seq: number | null }>();
  const maxSeq = row?.max_seq ?? 0;
  const nextSeq = ('0000' + (maxSeq + 1)).slice(-4);
  return prefix + nextSeq;
}
