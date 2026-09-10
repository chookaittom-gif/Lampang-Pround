/** คัดลอกตรงจาก Code.gs normalizePhoneValue (บรรทัด 154–176) */
export function normalizePhoneValue(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const digits = text.replace(/\D+/g, '');
  if (digits.length === 10 && digits.startsWith('0')) return digits;
  if (digits.length === 9 && !digits.startsWith('0')) return '0' + digits;
  if (digits.length === 8 && !digits.startsWith('0')) return '0' + digits;
  if (digits.length > 0 && !digits.startsWith('0')) return '0' + digits;
  return digits || text;
}

const thaiBuddhistDateOptions: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
};
let thaiBuddhistDateFormatter: Intl.DateTimeFormat | null = null;

/** คัดลอกตรงจาก buildRecordFromRow_ — Date cell → ไทยพุทธศักราช
 *  ใช้ formatter เดิมซ้ำเพื่อไม่สร้าง Intl formatter ใหม่ทุกแถว */
export function thaiBuddhistDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    if (!thaiBuddhistDateFormatter) {
      thaiBuddhistDateFormatter = new Intl.DateTimeFormat(
        'th-TH-u-ca-buddhist',
        thaiBuddhistDateOptions
      );
    }
    return thaiBuddhistDateFormatter.format(date);
  } catch {
    return iso;
  }
}

/** คัดลอกตรงจาก parseJsonArray_ (บรรทัด 1127–1140): scalar → array 1 ตัว */
export function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter((v) => v !== '');
  const text = String(value ?? '').trim();
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map((v) => String(v));
    return [String(parsed)];
  } catch {
    return [text];
  }
}
