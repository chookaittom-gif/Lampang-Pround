import type { Env } from '../env';

export interface Session {
  username: string;
  name: string;
  role: string;
}

export const SESSION_INVALID_MESSAGE =
  'Session หมดอายุหรือมีการ login จากเครื่องอื่น กรุณาเข้าสู่ระบบใหม่';

export function makeSessionInvalidResponse(): Record<string, unknown> {
  return { success: false, sessionInvalid: true, message: SESSION_INVALID_MESSAGE };
}

/** คัดลอกพฤติกรรม getActiveSessionResult_: token ไม่ส่งมา = guest, token ส่งมาแต่ไม่ถูก = error */
export async function getActiveSessionResult(
  env: Env,
  token: string | null | undefined
): Promise<{ session: Session | null; error?: Record<string, unknown> }> {
  if (!token) return { session: null };
  const session = await getSession(env, token);
  if (!session || !session.username) return { session: null, error: makeSessionInvalidResponse() };
  return { session };
}

/** คัดลอกพฤติกรรม getSession_: role 'user' ต้องเป็น session ล่าสุดเท่านั้น (single-session) */
export async function getSession(env: Env, token: string): Promise<Session | null> {
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT username, name, role, expires_at FROM sessions WHERE token = ?`
  )
    .bind(token)
    .first<{ username: string; name: string; role: string; expires_at: number }>();
  if (!row) return null;
  if (row.expires_at <= Date.now()) {
    await env.DB.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
    return null;
  }
  const session: Session = { username: row.username, name: row.name, role: row.role };
  if (String(session.role || '').trim().toLowerCase() === 'user') {
    const user = await env.DB.prepare(
      `SELECT session_token FROM users WHERE username = ?`
    )
      .bind(session.username)
      .first<{ session_token: string | null }>();
    if (!user || String(user.session_token || '').trim() !== token) return null;
  }
  return session;
}

export async function createSession(
  env: Env,
  token: string,
  user: Session
): Promise<void> {
  const now = Date.now();
  const ttl = parseInt(env.SESSION_TTL_SECONDS || '21600', 10) || 21600;
  await env.DB.prepare(
    `INSERT INTO sessions (token, username, name, role, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(token, user.username, user.name, user.role, now, now + ttl * 1000)
    .run();
}

export async function destroySession(env: Env, token: string): Promise<void> {
  if (!token) return;
  await env.DB.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
}

/** คัดลอกพฤติกรรม issueGuestAccessKey_ (TTL 6 ชม. เหมือน CacheService เดิม) */
export async function issueGuestAccessKey(env: Env, backendId: string): Promise<string> {
  const id = String(backendId || '').trim();
  if (!id) return '';
  const accessKey = crypto.randomUUID();
  const ttl = parseInt(env.GUEST_ACCESS_TTL_SECONDS || '21600', 10) || 21600;
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO guest_access_keys (backend_id, access_key, created_at, expires_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(backend_id) DO UPDATE SET access_key = excluded.access_key,
       created_at = excluded.created_at, expires_at = excluded.expires_at`
  )
    .bind(id, accessKey, now, now + ttl * 1000)
    .run();
  return accessKey;
}

export async function isValidGuestAccess(
  env: Env,
  backendId: string,
  guestAccessKey: string
): Promise<boolean> {
  const id = String(backendId || '').trim();
  const key = String(guestAccessKey || '').trim();
  if (!id || !key) return false;
  const row = await env.DB.prepare(
    `SELECT access_key, expires_at FROM guest_access_keys WHERE backend_id = ?`
  )
    .bind(id)
    .first<{ access_key: string; expires_at: number }>();
  return !!row && row.expires_at > Date.now() && row.access_key === key;
}

/** getCurrentUserName_: session → username, ไม่มี → 'Guest' */
export function currentUserName(session: Session | null): string {
  return session && session.username ? session.username : 'Guest';
}

/** สิทธิ์แก้ไข/ลบ legacy record — คัดลอกเงื่อนไขจาก updateRecord/deleteRecord:
 *  admin → ทุกแถว, user → เฉพาะ CreatedBy ตัวเอง, role อื่น → ปฏิเสธ */
export function checkOwnership(
  session: Session,
  recordCreatedBy: string,
  action: 'แก้ไข' | 'ลบ'
): { ok: true } | { ok: false; message: string } {
  const userRole = String(session.role || '').trim().toLowerCase();
  if (userRole === 'admin') return { ok: true };
  if (userRole === 'user') {
    const createdBy = String(recordCreatedBy || '').trim().toLowerCase();
    const username = String(session.username || '').trim().toLowerCase();
    if (!username || username !== createdBy) {
      return { ok: false, message: `คุณไม่มีสิทธิ์${action}รายการของผู้อื่น` };
    }
    return { ok: true };
  }
  return { ok: false, message: `คุณไม่มีสิทธิ์${action}ข้อมูลนี้` };
}
