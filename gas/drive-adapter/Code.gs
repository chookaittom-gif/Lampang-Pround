var MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function doGet() {
  return json_({ success: true, service: 'lampang-pround-drive-adapter' });
}

function doPost(e) {
  try {
    var payload = parsePayload_(e);
    requireToken_(payload);
    if (String(payload.action || '').trim() !== 'upload') {
      throw new Error('Unsupported adapter action.');
    }
    return json_(upload_(payload));
  } catch (error) {
    return json_({
      success: false,
      message: error && error.message ? String(error.message) : 'Drive adapter request failed.'
    });
  }
}

function parsePayload_(e) {
  var raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
  var payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error('Request body must be valid JSON.');
  }
  if (!payload || typeof payload !== 'object') throw new Error('Request body must be an object.');
  return payload;
}

function requireToken_(payload) {
  var expected = PropertiesService.getScriptProperties().getProperty('GAS_DRIVE_ADAPTER_TOKEN');
  var supplied = String(payload.token || '');
  if (!expected || !supplied || supplied !== expected) throw new Error('Unauthorized.');
}

function upload_(payload) {
  var idempotencyKey = String(payload.idempotencyKey || '').trim();
  if (idempotencyKey) {
    var cached = CacheService.getScriptCache().get(idempotencyCacheKey_(payload.shopId, idempotencyKey));
    if (cached) return JSON.parse(cached);
  }
  var raw = String(payload.base64 || payload.dataUrl || payload.content || '');
  var marker = raw.indexOf('base64,');
  if (marker >= 0) raw = raw.slice(marker + 7);
  raw = raw.replace(/\s/g, '');
  if (!raw) throw new Error('Image payload is empty.');
  if (raw.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 4) throw new Error('Image is too large.');

  var bytes;
  try {
    bytes = Utilities.base64Decode(raw);
  } catch (error) {
    throw new Error('Image payload is not valid base64.');
  }
  if (!bytes.length) throw new Error('Image payload is empty.');
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('Image is too large.');

  var mimeType = sniffMime_(bytes);
  var requestedMime = String(payload.mimeType || '').trim().toLowerCase();
  if (!mimeType || (requestedMime && requestedMime !== mimeType)) {
    throw new Error('Unsupported image format.');
  }

  var fileName = safeFileName_(payload.fileName, mimeType);
  var folder = getShopFolder_(payload.shopId);
  var file;
  try {
    file = folder.createFile(Utilities.newBlob(bytes, mimeType, fileName));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (error) {
    if (file) {
      try { file.setTrashed(true); } catch (ignored) {}
    }
    throw new Error('Drive upload or public sharing failed.');
  }

  var id = file.getId();
  var result = {
    success: true,
    driveFileId: id,
    driveUrl: 'https://drive.google.com/file/d/' + id + '/view',
    thumbnailUrl: 'https://lh3.googleusercontent.com/d/' + id + '=w800',
    mimeType: mimeType,
    fileSize: bytes.length,
    displayName: fileName
  };

  if (idempotencyKey) {
    CacheService.getScriptCache().put(idempotencyCacheKey_(payload.shopId, idempotencyKey), JSON.stringify(result), 21600);
  }
  return result;
}

function idempotencyCacheKey_(shopId, idempotencyKey) {
  var shop = String(shopId || 'Unassigned').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
  return 'drive-upload:' + shop + ':' + idempotencyKey.slice(0, 120);
}

function getShopFolder_(shopId) {
  var rootId = PropertiesService.getScriptProperties().getProperty('LP_ASSET_FOLDER_ID');
  if (!rootId) throw new Error('LP_ASSET_FOLDER_ID is not configured.');
  var folderName = String(shopId || 'Unassigned').trim().replace(/[\\/:*?"<>|]/g, '_') || 'Unassigned';
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var root = DriveApp.getFolderById(rootId);
    var folders = root.getFoldersByName(folderName);
    return folders.hasNext() ? folders.next() : root.createFolder(folderName);
  } finally {
    lock.releaseLock();
  }
}

function safeFileName_(rawName, mimeType) {
  var name = String(rawName || 'upload').trim().replace(/[\\/:*?"<>|]/g, '_') || 'upload';
  name = name.slice(0, 120);
  var ext = mimeType === 'image/png' ? '.png' : mimeType === 'image/gif' ? '.gif' : '.jpg';
  name = name.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  return (name || 'upload') + ext;
}

function sniffMime_(bytes) {
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10') return 'image/png';
  if (bytes.length >= 4 && bytes.slice(0, 4).join(',') === '71,73,70,56') return 'image/gif';
  return '';
}

function json_(body) {
  return ContentService.createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
