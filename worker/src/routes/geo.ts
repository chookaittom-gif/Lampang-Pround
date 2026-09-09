import type { Env } from '../env';
import { jsonResponse, readBody, str } from '../lib/http';

interface GeoPoint {
  success: boolean;
  lat?: string;
  lng?: string;
  address?: string;
  message?: string;
}

async function geocode(env: Env, query: string): Promise<GeoPoint | null> {
  const key = env.GEOCODING_API_KEY;
  if (!key) return null;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${key}`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const data = (await resp.json()) as {
    status?: string;
    results?: { geometry?: { location?: { lat: number; lng: number } }; formatted_address?: string }[];
  };
  if (data.status === 'OK' && data.results && data.results.length > 0) {
    const loc = data.results[0].geometry?.location;
    if (loc) {
      return {
        success: true,
        lat: loc.lat.toFixed(6),
        lng: loc.lng.toFixed(6),
        address: data.results[0].formatted_address || query,
      };
    }
  }
  return null;
}

/** resolveMapLocationUrl — คัดลอก logic ตรงจาก Code.gs บรรทัด 2902–3004
 *  Maps.newGeocoder() → Google Geocoding API (GEOCODING_API_KEY) */
export async function handleResolveMapLocationUrl(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = await readBody(request);
    let rawUrl = '';
    if (typeof body === 'string') {
      rawUrl = body.trim();
    } else if (body && typeof body === 'object') {
      const payload = body as Record<string, unknown>;
      rawUrl = str(payload.url || payload.map_url || payload.location || payload[0] || '').trim();
    }
    if (!rawUrl) {
      return jsonResponse({ success: false, message: 'URL หรือข้อมูลตำแหน่งว่างเปล่า' }, 200, env);
    }

    // 1. Direct coordinates check
    const directAt = rawUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (directAt) {
      return jsonResponse(
        { success: true, lat: Number(directAt[1]).toFixed(6), lng: Number(directAt[2]).toFixed(6) },
        200,
        env
      );
    }
    const directQ = rawUrl.match(
      /[?&](?:q|query|ll|loc|destination)=(-?\d+\.\d+)(?:%2C|,|%20|\+)(-?\d+\.\d+)/i
    );
    if (directQ) {
      return jsonResponse(
        { success: true, lat: Number(directQ[1]).toFixed(6), lng: Number(directQ[2]).toFixed(6) },
        200,
        env
      );
    }
    const directCoords = rawUrl.match(/^(-?\d{1,2}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)$/);
    if (directCoords) {
      const latNum = Number(directCoords[1]);
      const lngNum = Number(directCoords[2]);
      if (
        !Number.isNaN(latNum) &&
        !Number.isNaN(lngNum) &&
        latNum >= -90 &&
        latNum <= 90 &&
        lngNum >= -180 &&
        lngNum <= 180
      ) {
        return jsonResponse(
          { success: true, lat: latNum.toFixed(6), lng: lngNum.toFixed(6) },
          200,
          env
        );
      }
    }

    if (!/^https?:\/\//i.test(rawUrl)) {
      const geo = await geocode(env, rawUrl);
      if (geo) return jsonResponse(geo, 200, env);
      return jsonResponse({ success: false, message: 'ไม่พบพิกัดจากข้อมูลที่ระบุ' }, 200, env);
    }

    // 2. Fetch redirect / short URL (followRedirects: true เหมือนเดิม)
    const resp = await fetch(rawUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    const contentText = await resp.text();

    // คัดลอกลำดับ regex จากต้นฉบับ: finalLocation → contentText (@, place|dir, JSON, search q)
    const textAt = contentText.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (textAt) {
      return jsonResponse(
        { success: true, lat: Number(textAt[1]).toFixed(6), lng: Number(textAt[2]).toFixed(6) },
        200,
        env
      );
    }
    const textPlace = contentText.match(
      /(?:place|dir)\/(-?\d+\.\d+)(?:%2C|,|%20|\+)(-?\d+\.\d+)/i
    );
    if (textPlace) {
      return jsonResponse(
        { success: true, lat: Number(textPlace[1]).toFixed(6), lng: Number(textPlace[2]).toFixed(6) },
        200,
        env
      );
    }
    const jsonCoords = contentText.match(/\[null,null,(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)\]/);
    if (jsonCoords) {
      return jsonResponse(
        { success: true, lat: Number(jsonCoords[1]).toFixed(6), lng: Number(jsonCoords[2]).toFixed(6) },
        200,
        env
      );
    }
    const searchQ =
      contentText.match(/href="\/search\?q=([^"&]+)/i) ||
      contentText.match(/search\?q=([^"&]+)/i);
    let queryText = '';
    if (searchQ && searchQ[1]) {
      try {
        queryText = decodeURIComponent(searchQ[1].replace(/\+/g, ' '));
      } catch {
        queryText = searchQ[1];
      }
    }
    if (queryText) {
      const geo = await geocode(env, queryText);
      if (geo) return jsonResponse(geo, 200, env);
    }
    return jsonResponse(
      {
        success: false,
        message: 'ไม่สามารถดึงพิกัดจากลิงก์นี้ได้ กรุณาระบุพิกัดหรือใช้ปุ่มดึงพิกัด GPS',
      },
      200,
      env
    );
  } catch (err) {
    return jsonResponse(
      {
        success: false,
        message: `เกิดข้อผิดพลาดในการดึงพิกัด: ${err instanceof Error ? err.message : String(err)}`,
      },
      200,
      env
    );
  }
}
