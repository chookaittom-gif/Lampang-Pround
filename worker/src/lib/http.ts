import type { Env } from '../env';

export type Json = Record<string, unknown>;

// ponytail: keep the existing inline handlers and external browser assets; tighten this allowlist only after refactoring them.
const SECURITY_HEADERS: Record<string, string> = {
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'geolocation=(self), microphone=(), camera=()',
  'content-security-policy': [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.googleusercontent.com https://drive.google.com https://quickchart.io",
    "connect-src 'self' https://quickchart.io",
    "frame-src 'self' https://maps.google.com https://www.google.com",
  ].join('; '),
};

export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  Object.entries(SECURITY_HEADERS).forEach(([name, value]) => headers.set(name, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function jsonResponse(data: unknown, status = 200, env?: Env): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' };
  if (env) applyCors(headers, env);
  return new Response(JSON.stringify(data), { status, headers });
}

function applyCors(headers: Record<string, string>, env: Env): void {
  const origin = env.DEV_ALLOWED_ORIGIN;
  if (!origin) return;
  headers['access-control-allow-origin'] = origin;
  headers['access-control-allow-headers'] = 'content-type';
  headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
}

export function preflightResponse(env: Env): Response {
  const headers: Record<string, string> = {
    'access-control-max-age': '86400',
  };
  applyCors(headers, env);
  return new Response(null, { status: 204, headers });
}

/** อ่าน body — รองรับทั้ง object, array และ scalar (parity กับ google.script.run
 *  ที่บาง call ส่ง scalar เช่น resolveMapLocationUrl) */
export async function readBody(request: Request): Promise<unknown> {
  try {
    const text = await request.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export function str(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

/** Error envelope แบบเดียวกับ catch ของ GAS: { success:false, message: 'เกิดข้อผิดพลาด: ...' } */
export function gasError(err: unknown, env?: Env): Response {
  const message = err instanceof Error ? err.message : String(err);
  return jsonResponse({ success: false, message: `เกิดข้อผิดพลาด: ${message}` }, 200, env);
}
