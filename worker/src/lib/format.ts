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

/** คัดลอกตรงจาก buildRecordFromRow_ — Date cell → ไทยพุทธศักราช
 *  toLocaleDateString('th-TH-u-ca-buddhist', { year:'numeric', month:'short', day:'numeric' }) */
export function thaiBuddhistDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return date.toLocaleDateString('th-TH-u-ca-buddhist', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
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
