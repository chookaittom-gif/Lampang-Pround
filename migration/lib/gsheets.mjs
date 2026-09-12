import crypto from 'node:crypto';

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

/** OAuth2 JWT flow — service account, read-only scopes เท่านั้น (COPY ONLY) */
export async function getGoogleAccessToken(email, privateKeyRaw) {
  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(
    JSON.stringify({
      iss: email,
      scope:
        'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    })
  );
  const input = `${header}.${claim}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(input), privateKey);
  const assertion = `${input}.${signature.toString('base64url')}`;
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error(`Google auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

/** อ่านค่าทั้ง sheet (values only) — เทียบเท่า sheet.getDataRange().getValues() */
export async function getSheetValues(token, spreadsheetId, sheetName) {
  const range = encodeURIComponent(sheetName);
  const resp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  const data = await resp.json();
  if (data.error) throw new Error(`Sheets read failed (${sheetName}): ${JSON.stringify(data.error)}`);
  return data.values ?? [];
}

/** header row → {header: index} เหมือน getHeaderIndex_ ของ GAS */
export function headerIndexMap(headers) {
  const map = {};
  headers.forEach((h, i) => {
    map[String(h).trim()] = i;
  });
  return map;
}

/** cell → string (Sheets API UNFORMATTED_VALUE คืน number/bool/object สำหรับ date) */
export function cellToString(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value) && value.length >= 3) {
    // date object รูปแบบของ Sheets API: {numberFormat..., } หรือ [year, month, day, ...]
    const [y, m, d] = value;
    return new Date(Date.UTC(y, (m || 1) - 1, d || 1, value[3] || 0, value[4] || 0)).toISOString();
  }
  return String(value);
}
