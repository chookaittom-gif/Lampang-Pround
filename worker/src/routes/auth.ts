import type { Env } from '../env';
import { hashPassword, verifyPassword, uuid } from '../lib/crypto';
import { createSession, destroySession } from '../lib/auth';
import { jsonResponse, readBody, str, gasError } from '../lib/http';

/** loginUser — คัดลอก payload/response ตรงจาก Code.gs บรรทัด 637–669
 *  ต่างเดียว: password เทียบกับ PBKDF2 hash (Users sheet เดิมเก็บ plaintext) */
export async function handleLogin(request: Request, env: Env): Promise<Response> {
  try {
    const payload = (await readBody(request)) as Record<string, unknown>;
    const username = str(payload.username).trim().toLowerCase();
    const password = str(payload.password).trim();
    if (!username || !password) {
      return jsonResponse({ success: false, message: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' }, 200, env);
    }
    const row = await env.DB.prepare(
      `SELECT username, password_hash, name, role FROM users WHERE username = ?`
    )
      .bind(username)
      .first<{ username: string; password_hash: string; name: string; role: string }>();
    if (!row || !(await verifyPassword(password, row.password_hash))) {
      return jsonResponse({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }, 200, env);
    }
    const user = {
      username: String(row.username),
      name: String(row.name || row.username),
      role: String(row.role || 'user'),
    };
    const token = uuid();
    await createSession(env, token, user);
    // single-session enforcement เฉพาะ role 'user' (parity กับ loginUser เดิม)
    if (String(user.role || '').trim().toLowerCase() === 'user') {
      await env.DB.prepare(
        `UPDATE users SET session_token = ?, last_login_at = ? WHERE username = ?`
      )
        .bind(token, new Date().toISOString(), user.username)
        .run();
    }
    return jsonResponse({ success: true, token, user }, 200, env);
  } catch (err) {
    return gasError(err, env);
  }
}

/** logoutUser — { token } → ลบ session (fire-and-forget ฝั่ง client เหมือนเดิม) */
export async function handleLogout(request: Request, env: Env): Promise<Response> {
  try {
    const payload = (await readBody(request)) as Record<string, unknown>;
    if (payload && payload.token) await destroySession(env, str(payload.token));
    return jsonResponse({ success: true }, 200, env);
  } catch {
    return jsonResponse({ success: true }, 200, env);
  }
}

/** registerUser — payload/response ตรงจาก Code.gs บรรทัด 678–724 */
export async function handleRegister(request: Request, env: Env): Promise<Response> {
  try {
    const payload = (await readBody(request)) as Record<string, unknown>;
    const name = str(payload.name).trim();
    const username = str(payload.username).trim().toLowerCase();
    const email = str(payload.email).trim();
    const password = str(payload.password).trim();
    if (!name || !username || !password) {
      return jsonResponse(
        { success: false, message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' },
        200,
        env
      );
    }
    const dupUser = await env.DB.prepare(
      `SELECT username, email FROM users WHERE username = ? OR
       (? != '' AND email != '' AND LOWER(email) = LOWER(?)) LIMIT 2`
    )
      .bind(username, email, email)
      .all<{ username: string; email: string }>();
    for (const row of dupUser.results) {
      if (String(row.username || '').trim().toLowerCase() === username) {
        return jsonResponse(
          { success: false, message: 'ชื่อผู้ใช้นี้มีในระบบแล้ว กรุณาใช้ชื่ออื่น' },
          200,
          env
        );
      }
      if (email && String(row.email || '').trim().toLowerCase() === email.toLowerCase()) {
        return jsonResponse(
          { success: false, message: 'อีเมลนี้ถูกใช้งานแล้ว กรุณาใช้อีเมลอื่น' },
          200,
          env
        );
      }
    }
    const passwordHash = await hashPassword(password);
    const result = await env.DB.prepare(
      `INSERT INTO users (username, password_hash, name, role, email) VALUES (?, ?, ?, 'user', ?)`
    )
      .bind(username, passwordHash, name, email)
      .run();
    if (!result.success) throw new Error('insert user failed');
    return jsonResponse({ success: true, message: 'สมัครสมาชิกสำเร็จ' }, 200, env);
  } catch (err) {
    return gasError(err, env);
  }
}
