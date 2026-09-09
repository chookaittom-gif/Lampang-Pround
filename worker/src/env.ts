export interface Env {
  DB: D1Database;
  /** Local/rollback image storage. Staging and production use Drive when IMAGE_STORAGE=drive. */
  ASSETS?: R2Bucket;
  /** Static assets ของ frontend (Workers Static Assets) */
  STATIC?: Fetcher;
  APP_NAME: string;
  ORG_NAME: string;
  SESSION_TTL_SECONDS: string;
  GUEST_ACCESS_TTL_SECONDS: string;
  /** Fallback: proxy PDF export ไป GAS จนกว่า pdf-lib parity จะผ่าน (Blocking Q1) */
  GAS_WEB_APP_URL: string;
  /** GAS Drive adapter web-app URL (ไม่เก็บ token ใน vars) */
  GAS_DRIVE_ADAPTER_URL?: string;
  /** Secret สำหรับ GAS Drive adapter */
  GAS_DRIVE_ADAPTER_TOKEN?: string;
  /** 'drive' สำหรับ staging/production, 'r2' สำหรับ local/rollback */
  IMAGE_STORAGE?: string;
  /** 'on' = ใช้ pdf-lib ใน Worker (หลังผ่านการเทียบ parity ใน staging เท่านั้น) */
  PDF_NATIVE: string;
  /** Origin ของ Vite dev server — production ปล่อยว่าง */
  DEV_ALLOWED_ORIGIN: string;
  /** Secret สำหรับ geocoding (resolveMapLocationUrl) */
  GEOCODING_API_KEY?: string;
}
