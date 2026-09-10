import type { Env } from './env';
import { jsonResponse, preflightResponse } from './lib/http';
import { handleLogin, handleLogout, handleRegister } from './routes/auth';
import {
  handleSaveRecord,
  handleGetRecords,
  handleGetRecordDetail,
  handleUpdateRecord,
  handleDeleteRecord,
} from './routes/records';
import {
  handleUpsertShopRecord,
  handleGetShopGallery,
  handleGetShopRecord,
  handleReplaceProducts,
} from './routes/shops';
import { handleUploadGalleryImage, handleSoftDeleteGalleryImage } from './routes/gallery';
import { handleResolveMapLocationUrl } from './routes/geo';
import {
  handleExportShopPdf,
  handleExportExcel,
  handleExcelDownload,
  handleCleanupPdf,
} from './routes/export';

const SESSION_INVALID = {
  success: false,
  sessionInvalid: false,
  message: 'Unknown RPC function',
};

/** RPC map — 1:1 กับ google.script.run (payload/response เหมือนเดิมทุกฟังก์ชัน) */
const RPC: Record<string, (request: Request, env: Env) => Promise<Response>> = {
  loginUser: handleLogin,
  logoutUser: handleLogout,
  registerUser: handleRegister,
  saveRecord: handleSaveRecord,
  getRecords: handleGetRecords,
  getRecordDetail: handleGetRecordDetail,
  updateRecord: handleUpdateRecord,
  deleteRecord: handleDeleteRecord,
  upsertShopRecord: handleUpsertShopRecord,
  getShopGallery: handleGetShopGallery,
  getShopRecord: handleGetShopRecord,
  replaceProductsByShopId: handleReplaceProducts,
  uploadGalleryImage: handleUploadGalleryImage,
  softDeleteGalleryImage: handleSoftDeleteGalleryImage,
  exportShopPdf: handleExportShopPdf,
  exportCleanExcelFile: handleExportExcel,
  getExcelExportUrl: handleExportExcel,
  cleanupTemporaryPdfFiles: handleCleanupPdf,
  resolveMapLocationUrl: handleResolveMapLocationUrl,
};

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') return preflightResponse(env);

  if (request.method === 'GET' && path === '/api/config') {
    return jsonResponse(
      { appName: env.APP_NAME, orgName: env.ORG_NAME },
      200,
      env
    );
  }

  if (request.method === 'GET' && path.startsWith('/api/export/excel/')) {
    return handleExcelDownload(request, env);
  }

  if (request.method === 'GET' && path.startsWith('/api/export/pdf/')) {
    return handleExcelDownload(request, env);
  }

  // รูปจาก R2 เมื่อ environment นั้นผูก ASSETS: GET /images/<key>
  if (request.method === 'GET' && path.startsWith('/images/')) {
    const key = decodeURIComponent(path.slice('/images/'.length));
    if (!env.ASSETS || !key || key.includes('..')) {
      return new Response('Not found', { status: 404 });
    }
    const object = await env.ASSETS.get(key);
    if (!object) return new Response('Not found', { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', 'public, max-age=31536000, immutable');
    return new Response(object.body, { headers });
  }

  if (request.method === 'POST' && path.startsWith('/api/rpc/')) {
    const fn = path.slice('/api/rpc/'.length);
    const handler = RPC[fn];
    if (!handler) {
      return jsonResponse(SESSION_INVALID, 404, env);
    }
    return handler(request, env);
  }

  return jsonResponse({ success: false, message: 'Not found' }, 404, env);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/images/')) {
      try {
        return await handleApi(request, env);
      } catch (err) {
        return jsonResponse(
          {
            success: false,
            message: `เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : String(err)}`,
          },
          500,
          env
        );
      }
    }
    if (request.method === 'GET' && url.pathname === '/favicon.ico' && env.STATIC) {
      return env.STATIC.fetch(new Request(new URL('/favicon.svg', request.url), request));
    }
    // หน้าเว็บ static (frontend build) — Workers Static Assets
    if (env.STATIC) return env.STATIC.fetch(request);
    return new Response('Frontend not deployed. Run: npm run build -w frontend', {
      status: 404,
    });
  },
};
