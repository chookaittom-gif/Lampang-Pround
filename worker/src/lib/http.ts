import type { Env } from '../env';

export type Json = Record<string, unknown>;

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
