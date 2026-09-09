export interface Env {
  DB: D1Database;
  ASSETS: R2Bucket;
  /** Static assets ของ frontend (Workers Static Assets) */
  STATIC?: Fetcher;
  APP_NAME: string;
  ORG_NAME: string;
  SESSION_TTL_SECONDS: string;
  GUEST_ACCESS_TTL_SECONDS: string;
  /** Fallback: proxy PDF export ไป GAS จนกว่า pdf-lib parity จะผ่าน (Blocking Q1) */
  GAS_WEB_APP_URL: string;
  /** 'on' = ใช้ pdf-lib ใน Worker (หลังผ่านการเทียบ parity ใน staging เท่านั้น) */
  PDF_NATIVE: string;
  /** Origin ของ Vite dev server — production ปล่อยว่าง */
  DEV_ALLOWED_ORIGIN: string;
  /** Secret สำหรับ geocoding (resolveMapLocationUrl) */
  GEOCODING_API_KEY?: string;
}
