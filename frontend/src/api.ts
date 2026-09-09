/**
 * Fetch adapter — แทน google.script.run ด้วย fetch() โดยรักษา calling convention เดิม
 * ทุก call site ใน legacy code ใช้รูปแบบ:
 *   google.script.run.withSuccessHandler(cb).withFailureHandler(cb).fnName(payload)
 * ฝั่ง Worker: POST /api/rpc/<fnName> body = payload (object หรือ scalar)
 * ผลลัพธ์: JSON เดิมที่ GAS คืน (รวม {success:false, sessionInvalid:true, ...})
 */

type SuccessHandler = (result: unknown) => void;
type FailureHandler = (error: Error) => void;

interface RpcHandlers {
  success?: SuccessHandler;
  failure?: FailureHandler;
}

const FAILURE_MESSAGE = 'เชื่อมต่อเซิร์ฟเวอร์ล้มเหลว';

export async function callGas(fnName: string, args: unknown[]): Promise<unknown> {
  const body = args.length <= 1 ? (args[0] ?? {}) : args;
  let resp: Response;
  try {
    resp = await fetch(`/api/rpc/${encodeURIComponent(fnName)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw new Error(FAILURE_MESSAGE);
  }
  if (resp.status === 404) {
    throw new Error(`ไม่พบ API: ${fnName}`);
  }
  try {
    return await resp.json();
  } catch {
    throw new Error(FAILURE_MESSAGE);
  }
}

function makeRunner(handlers: RpcHandlers): unknown {
  return new Proxy(
    {},
    {
      get(_target, prop: string | symbol) {
        if (typeof prop !== 'string') return undefined;
        if (prop === 'withSuccessHandler') {
          return (cb: SuccessHandler) => makeRunner({ ...handlers, success: cb });
        }
        if (prop === 'withFailureHandler') {
          return (cb: FailureHandler) => makeRunner({ ...handlers, failure: cb });
        }
        if (prop === 'withUserObject') {
          // GAS API ที่ legacy code ไม่ใช้ — ใส่ไว้ให้ครบ interface
          return (_obj: unknown) => makeRunner(handlers);
        }
        return (...args: unknown[]) => {
          void callGas(prop, args).then(
            (result) => {
              handlers.success?.(result);
            },
            (err: unknown) => {
              const error = err instanceof Error ? err : new Error(String(err));
              if (handlers.failure) handlers.failure(error);
              else console.error('[rpc]', prop, error);
            }
          );
        };
      },
    }
  );
}

/** ติดตั้ง window.google.script.run shim — ต้องเรียกก่อน import legacy app */
export function installGoogleScriptRunShim(): void {
  const w = window as unknown as { google?: { script?: { run?: unknown } } };
  w.google = w.google ?? {};
  w.google.script = w.google.script ?? {};
  w.google.script.run = makeRunner({});
}

/** ค่าที่ GAS เคย inject ผ่าน template scriptlets (index.html 1225–1226)
 *  - WEB_APP_URL: ใช้สร้าง deep link สำหรับ QR → origin นี้
 *  - _DEEP_LINK_PARAM: doGet อ่านจาก ?id|backendId|shopId → ทำแบบเดิมที่ client */
export function bootstrapWindowVars(): void {
  const w = window as unknown as { WEB_APP_URL?: string; _DEEP_LINK_PARAM?: string };
  w.WEB_APP_URL = w.WEB_APP_URL || `${window.location.origin}/`;
  const params = new URLSearchParams(window.location.search);
  w._DEEP_LINK_PARAM =
    params.get('id') ?? params.get('backendId') ?? params.get('shopId') ?? '';
}

// ---- ติดตั้งทันทีตอน import (ลำดับ module evaluation การันตีว่ามาก่อน legacy app) ----
bootstrapWindowVars();
installGoogleScriptRunShim();
