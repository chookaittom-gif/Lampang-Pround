const APP_NAME = "ระบบฐานข้อมูล Lampang Pround";
const ORG_NAME = "สำนักงานพัฒนาชุมชน";
const SHEET_NAME = "LamproundData";
const USERS_SHEET_NAME = 'Users';
const SESSION_TTL = 21600;
const GUEST_ACCESS_TTL = 21600;
const GUEST_ACCESS_CACHE_PREFIX = 'guest_access_';
const PDF_TEMP_MARKER_PREFIX = '[LP_TEMP_PDF]';
const PDF_IMAGE_CELL_SIZE = 180;
const PDF_PRODUCT_TABLE_IMAGE_MAX_SIZE = 96;
const pdfTemplateLayoutVersion = 'v13';
const pdfPageWidthPt = 595;
const pdfPageHeightPt = 842;
const pdfPageMarginPt = 36;
const pdfContentWidthPt = pdfPageWidthPt - (pdfPageMarginPt * 2);
const pdfTableBorderWidthPt = 0.75;
const pdfTableBorderColor = '#b4c2d2';
const pdfTableHeaderColor = '#dbeafe';
const pdfLabelBackgroundColor = '#f8fafc';
const pdfTitleFontSize = 18;
const pdfSubtitleFontSize = 14;
const pdfDateFontSize = 10.5;
const pdfSectionHeadingFontSize = 13.5;
const pdfTableFontSize = 10.5;
const pdfCaptionFontSize = 10;
const pdfCaptionColor = '#475569';
const pdfGalleryCellPaddingPt = 8;
const pdfLabelValueColumnWidthsPt = [180, 343];
const pdfProductColumnWidthsPt = [34, 108, 116, 78, 62, 125];
const SHOPS_SHEET_NAME = 'Shops';
const PRODUCTS_SHEET_NAME = 'Products';
const SHOP_GALLERY_SHEET_NAME = 'ShopGallery';
const DEFAULT_TIMEZONE = 'Asia/Bangkok';
const SESSION_INVALID_MESSAGE = 'Session หมดอายุหรือมีการ login จากเครื่องอื่น กรุณาเข้าสู่ระบบใหม่';
const SCRIPT_PROPERTY_KEYS = {
  spreadsheetId: 'SPREADSHEET_ID',
  assetFolderId: 'LP_ASSET_FOLDER_ID',
  templateDocId: 'LP_TEMPLATE_DOC_ID_V4',
  pdfFolderId: 'LP_PDF_FOLDER_ID',
  templateLayoutVersion: 'LP_TEMPLATE_LAYOUT_VERSION'
};

// ------------------------------------------------------------------
// ฟังก์ชันสำหรับเรียกใช้งานเพื่อ "บังคับขอสิทธิ์" (Authorization) 
// หากมีปัญหาเรื่องสิทธิ์ ให้เลือกรันฟังก์ชันนี้จากหน้าต่าง Editor
// ------------------------------------------------------------------
function forceAuthorizeAllPermissions() {
  try {
    var doc = DocumentApp.create("Test_Authorize_DocumentApp");
    doc.saveAndClose();
    DriveApp.getFileById(doc.getId()).setTrashed(true);
  } catch(e) {}
  try {
    ScriptApp.getProjectTriggers();
  } catch(e) {}
  Logger.log("✅ ขอสิทธิ์ DocumentApp, DriveApp และ ScriptApp สำเร็จแล้ว!");
}
function forceAuthorizeDocs() {
  return forceAuthorizeAllPermissions();
}
// ------------------------------------------------------------------
const SCALABLE_SHEETS = [
  {
    name: SHOPS_SHEET_NAME,
    headers: [
      'ShopID', 'LegacyBackendId', 'LegacyLamproundID', 'BusinessName', 'OwnerName', 'Phone',
      'LineID', 'Facebook', 'Website', 'LocationText', 'Latitude', 'Longitude',
      'BusinessType', 'ProductCategory', 'BusinessLevel', 'MainProducts',
      'ProductionCapacity', 'SalesChannel', 'AvgPrice', 'BusinessStatus',
      'PotentialLevel', 'Issues', 'SupportNeeded', 'Note', 'CreatedAt', 'CreatedBy',
      'UpdatedAt', 'UpdatedBy', 'IsDeleted', 'DeletedAt', 'DeletedBy', 'ShopHistory'
    ]
  },
  {
    name: PRODUCTS_SHEET_NAME,
    headers: [
      'ProductID', 'ShopID', 'ProductName', 'ProductCategory', 'Description',
      'Price', 'Unit', 'SortOrder', 'IsDeleted', 'CreatedAt', 'CreatedBy', 'UpdatedAt', 'UpdatedBy'
    ]
  },
  {
    name: SHOP_GALLERY_SHEET_NAME,
    headers: [
      'GalleryID', 'ShopID', 'ProductID', 'ImageRole', 'DisplayName', 'DriveFileId',
      'DriveUrl', 'ThumbnailUrl', 'MimeType', 'FileSize', 'Width', 'Height',
      'SortOrder', 'Status', 'CreatedAt', 'CreatedBy', 'UpdatedAt', 'UpdatedBy'
    ]
  }
];
const DATA_HEADERS = [
  "BackendId", "LamproundID", "BusinessName", "OwnerName", "Phone",
  "LineID", "Facebook", "Website", "LocationText", "Latitude", "Longitude",
  "BusinessType", "ProductCategory", "BusinessLevel", "MainProducts",
  "ProductionCapacity", "SalesChannel", "AvgPrice", "BusinessStatus",
  "PotentialLevel", "Issues", "SupportNeeded", "ImageShop", "ImageProduct",
  "ImageActivity", "Note", "CreatedAt", "CreatedBy", "IsDeleted", "DeletedAt", "DeletedBy", "ShopHistory"
];

// Setup System
function setupSystem() {
  const props = PropertiesService.getScriptProperties();
  let spreadsheetId = props.getProperty(SCRIPT_PROPERTY_KEYS.spreadsheetId);
  let ss;
  
  if (!spreadsheetId) {
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch(e) {
      // Not bound to a sheet, create new
      ss = SpreadsheetApp.create(APP_NAME + " - Database");
    }
    
    if(ss) {
      spreadsheetId = ss.getId();
      props.setProperty(SCRIPT_PROPERTY_KEYS.spreadsheetId, spreadsheetId);
    }
  } else {
    try {
      ss = SpreadsheetApp.openById(spreadsheetId);
    } catch(e) {
      ss = SpreadsheetApp.create(APP_NAME + " - Database");
      spreadsheetId = ss.getId();
      props.setProperty(SCRIPT_PROPERTY_KEYS.spreadsheetId, spreadsheetId);
    }
  }

  // Create sheet if not exists
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(DATA_HEADERS);
    sheet.getRange(1, 1, 1, DATA_HEADERS.length).setFontWeight("bold").setBackground("#f3f4f6");
    sheet.setFrozenRows(1);
  }
  ensureDataSheetSchema_(sheet);
  
  ensureUsersSheet_(ss);
  ensureScalableStorage_(ss);
  return spreadsheetId;
}

var _activeSpreadsheet_ = null;
function getActiveSpreadsheet_() {
  if (_activeSpreadsheet_) return _activeSpreadsheet_;
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPERTY_KEYS.spreadsheetId) || setupSystem();
  _activeSpreadsheet_ = SpreadsheetApp.openById(spreadsheetId);
  return _activeSpreadsheet_;
}

function getSheetByName(name) {
  return getActiveSpreadsheet_().getSheetByName(name);
}

function normalizePhoneValue(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';

  const digits = text.replace(/\D+/g, '');
  // เบอร์ไทย 10 หลักที่ขึ้นต้นด้วย 0 ─ ถูกต้องแล้ว
  if (digits.length === 10 && digits.startsWith('0')) {
    return digits;
  }
  // 9 หลัก ไม่มี 0 นำหน้า → เติม 0 (กรณี Google Sheets ตัด 0 ออก)
  if (digits.length === 9 && !digits.startsWith('0')) {
    return '0' + digits;
  }
  // 8 หลัก ไม่มี 0 นำหน้า → เติม 0 (กรณีตัด 0x2 ออก แต่ไม่น่าเกิด)
  if (digits.length === 8 && !digits.startsWith('0')) {
    return '0' + digits;
  }
  // กรณีอื่น ๆ คืน digits ทั้งหมดพร้อม 0 นำหน้า
  if (digits.length > 0 && !digits.startsWith('0')) {
    return '0' + digits;
  }
  return digits || text;
}

function ensureDataSheetSchema_(sheet) {
  let currentHeaderCount = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, currentHeaderCount).getValues()[0];

  let dirty = false;
  DATA_HEADERS.forEach(function(header) {
    if (headers.indexOf(header) !== -1) return;
    
    try {
      sheet.insertColumnAfter(currentHeaderCount);
    } catch(e) {
      // Ignore if cannot insert (e.g. out of bounds), we'll just write to the next cell anyway if space exists
    }
    currentHeaderCount++;
    
    sheet.getRange(1, currentHeaderCount).setValue(header);
    if (sheet.getLastRow() > 1) {
      const defaultValue = header === 'IsDeleted' ? 'FALSE' : '';
      sheet.getRange(2, currentHeaderCount, sheet.getLastRow() - 1, 1).setValue(defaultValue);
    }
    dirty = true;
  });

  if (dirty) {
    sheet.getRange(1, 1, 1, currentHeaderCount).setFontWeight("bold").setBackground("#f3f4f6");
    SpreadsheetApp.flush();
  }
}

function getHeaderIndexMap_(headers) {
  const map = {};
  headers.forEach(function(header, index) {
    map[header] = index;
  });
  return map;
}

function isRowDeleted_(row, headerIndexMap) {
  const deletedIndex = headerIndexMap.IsDeleted;
  if (deletedIndex === undefined || deletedIndex < 0) return false;
  const value = String(row[deletedIndex] ?? '').trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

function buildRecordFromRow_(headers, row, options) {
  const opts = options || {};
  const includeImages = opts.includeImages === true;
  const headerIndexMap = opts.headerIndexMap || getHeaderIndexMap_(headers);
  const imageFields = { ImageShop: true, ImageProduct: true, ImageActivity: true };
  const record = {};

  headers.forEach(function(header, index) {
    if (!includeImages && imageFields[header]) return;

    let value = row[index];
    if (value instanceof Date) {
      value = value.toLocaleDateString('th-TH-u-ca-buddhist', { year: 'numeric', month: 'short', day: 'numeric' });
    } else {
      value = String(value ?? '');
    }
    record[header] = value;
  });

  if (headerIndexMap.Phone !== undefined) {
    record.Phone = normalizePhoneValue(record.Phone);
  }

  return record;
}

function findRowByBackendId_(sheet, backendId) {
  const target = String(backendId || '').trim();
  if (!target) return null;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === target) {
      return i + 2;
    }
  }
  return null;
}

// Route function
function doGet(e) {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty(SCRIPT_PROPERTY_KEYS.spreadsheetId)) {
    setupSystem();
  }
  let template = HtmlService.createTemplateFromFile('index');
  template.appName = APP_NAME;
  template.orgName = ORG_NAME;
  try {
    template.webAppUrl = ScriptApp.getService().getUrl();
  } catch (err) {
    template.webAppUrl = '';
  }
  // Inject deep-link parameter from URL query string (e.parameter) into template.
  // This is the ONLY reliable way to pass QR scan params into the GAS HTML sandbox.
  try {
    var p = e && e.parameter ? e.parameter : {};
    template.deepLinkId = String(p['id'] || p['backendId'] || p['shopId'] || '').trim();
  } catch (err) {
    template.deepLinkId = '';
  }
  return template.evaluate()
      .setTitle(APP_NAME)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Include function for separate files
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// Generate ID (LR-YYMMDD-XXXX)
function generateLamproundId() {
  const date = new Date();
  const yy = date.getFullYear().toString().substr(-2);
  const mm = ('0' + (date.getMonth() + 1)).slice(-2);
  const dd = ('0' + date.getDate()).slice(-2);
  const prefix = `LR-${yy}${mm}${dd}-`;
  
  const sheet = getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  
  let maxSeq = 0;
  // start from 1 to skip header
  for (let i = 1; i < data.length; i++) {
    const currentId = data[i][1];
    if (currentId && currentId.toString().startsWith(prefix)) {
      const seq = parseInt(currentId.split('-')[2], 10);
      if (!isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
  }
  
  const nextSeq = ('0000' + (maxSeq + 1)).slice(-4);
  return prefix + nextSeq;
}

// Save Record
function saveRecord(payload) {
  try {
    var dataObj = (payload && payload.data !== undefined) ? payload.data : payload;
    var token = payload && payload.token ? payload.token : null;
    var authResult = getActiveSessionResult_(token);
    if (authResult.error) return authResult.error;
    var sess = authResult.session;
    var createdBy = sess && sess.username ? sess.username : 'Guest';
    const sheet = getSheetByName(SHEET_NAME);
    ensureDataSheetSchema_(sheet);
    const lamproundId = generateLamproundId();
    const backendId = Utilities.getUuid();
    const createdAt = new Date();
    const phoneValue = normalizePhoneValue(dataObj.phone);
    const hasProducts = Object.prototype.hasOwnProperty.call(dataObj || {}, 'products');
    const productSummary = hasProducts ? summarizeProductItems_(dataObj.products) : { mainProducts: '', avgPrice: '' };
    
    // Default image arrays (base64) might be too long to save directly into cell if it's very large, 
    // but typically Google Sheet cells support up to 50,000 chars. We'll store them directly.
    const row = [
      backendId,
      lamproundId,
      dataObj.business_name || '',
      dataObj.owner_name || '',
      phoneValue,
      dataObj.line_id || '',
      dataObj.facebook || '',
      dataObj.website || '',
      dataObj.location_text || '',
      dataObj.latitude || '',
      dataObj.longitude || '',
      dataObj.business_type || '',
      dataObj.product_category ? JSON.stringify(dataObj.product_category) : '',
      dataObj.business_level || '',
      hasProducts ? productSummary.mainProducts : (dataObj.main_products || ''),
      dataObj.production_capacity || '',
      dataObj.sales_channel ? JSON.stringify(dataObj.sales_channel) : '',
      hasProducts ? productSummary.avgPrice : (dataObj.avg_price || ''),
      dataObj.business_status || '',
      dataObj.potential_level || '',
      dataObj.issues || '',
      dataObj.support_needed || '',
      dataObj.image_shop || '',
      dataObj.image_product || '',
      dataObj.image_activity || '',
      dataObj.note || '',
      createdAt,
      createdBy,
      'FALSE',
      '',
      '',
      String(dataObj.shop_history || dataObj.shopHistory || '').trim()
    ];
    
    // Use lock to prevent concurrency issues
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    sheet.appendRow(row);
    const phoneColumn = 5;
    sheet.getRange(sheet.getLastRow(), phoneColumn).setNumberFormat('@');
    lock.releaseLock();

    if (hasProducts) {
      syncProductsByShopId_(backendId, dataObj.products, token);
    }
    
    var result = { success: true, message: 'บันทึกข้อมูลสำเร็จ', id: lamproundId, backendId: backendId };
    if (!sess || !sess.username) {
      result.guestAccessKey = issueGuestAccessKey_(backendId);
    }
    return result;
  } catch(e) {
    return { success: false, message: 'เกิดข้อผิดพลาด: ' + e.message };
  }
}

// Get Records
function getRecords() {
  try {
    const sheet = getSheetByName(SHEET_NAME);
    ensureDataSheetSchema_(sheet);
    const raw = sheet.getDataRange().getValues();
    if(raw.length <= 1) return [];
    
    const headers = raw[0];
    const headerIndexMap = getHeaderIndexMap_(headers);
    const records = [];
    
    for (let i = raw.length - 1; i >= 1; i--) {
      const row = raw[i];
      if (isRowDeleted_(row, headerIndexMap)) continue;
      let record = buildRecordFromRow_(headers, row, { includeImages: false, headerIndexMap: headerIndexMap });
      record._rowIndex = i + 1;
      records.push(record);
    }
    
    return records;
  } catch(e) {
    return [];
  }
}

function getRecordDetail(payload) {
  try {
    var backendId = (typeof payload === 'object' && payload !== null) ? payload.backendId : payload;
    if (!backendId) return { success: false, message: 'ไม่พบรายการ' };
    const sheet = getSheetByName(SHEET_NAME);
    ensureDataSheetSchema_(sheet);
    const rowIndex = findRowByBackendId_(sheet, backendId);
    if (!rowIndex) return { success: false, message: 'ไม่พบรายการในฐานข้อมูล' };

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const headerIndexMap = getHeaderIndexMap_(headers);
    const row = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (isRowDeleted_(row, headerIndexMap)) {
      return { success: false, message: 'รายการนี้ถูกลบออกจากรายการหลักแล้ว' };
    }

    return {
      success: true,
      record: (function() {
        var record = buildRecordFromRow_(headers, row, { includeImages: true, headerIndexMap: headerIndexMap });
        record.products = getProductsByShopId_(backendId);
        var gallery = getShopGallery({ backendId: backendId });
        // Read both legacy and scalable IDs so product uploads are never omitted.
        var scalableShop = getShopRecord({ backendId: backendId });
        if (scalableShop && Array.isArray(scalableShop.gallery) && scalableShop.gallery.length > 0) {
          var mergedGallery = Array.isArray(gallery) ? gallery.slice() : [];
          var existingGalleryKeys = {};
          mergedGallery.forEach(function(item) {
            var key = String(item && (item.GalleryID || item.galleryId || item.DriveFileId || '')).trim();
            if (key) existingGalleryKeys[key] = true;
          });
          scalableShop.gallery.forEach(function(item) {
            var key = String(item && (item.GalleryID || item.galleryId || item.DriveFileId || '')).trim();
            if (!key || !existingGalleryKeys[key]) {
              mergedGallery.push(item);
              if (key) existingGalleryKeys[key] = true;
            }
          });
          mergedGallery.sort(function(a, b) {
            return Number(a.SortOrder || 0) - Number(b.SortOrder || 0);
          });
          gallery = mergedGallery;
        }
        record.gallery = gallery;
        return record;
      })()
    };
  } catch(e) {
    return { success: false, message: 'เกิดข้อผิดพลาดในการโหลดรายละเอียด: ' + e.message };
  }
}

// Delete Record
function deleteRecord(payload) {
  try {
    var backendId = (typeof payload === 'object' && payload !== null) ? payload.backendId : payload;
    var token = (typeof payload === 'object' && payload !== null) ? payload.token : null;
    var guestAccessKey = (typeof payload === 'object' && payload !== null) ? payload.guestAccessKey : null;
    var authResult = getActiveSessionResult_(token);
    if (authResult.error) return authResult.error;
    var sess = authResult.session;
    var isGuestScoped = !sess || !sess.username;
    if (isGuestScoped) {
      return { success: false, message: 'กรุณาเข้าสู่ระบบก่อนลบข้อมูล (ผู้ใช้ทั่วไปไม่สามารถลบข้อมูลได้)' };
    }
    const sheet = getSheetByName(SHEET_NAME);
    ensureDataSheetSchema_(sheet);
    if (!backendId) {
      return { success: false, message: 'ไม่พบรายการ' };
    }
    var rowIndex = findRowByBackendId_(sheet, backendId);
    if (!rowIndex) {
      return { success: false, message: 'ไม่พบรายการในฐานข้อมูล' };
    }
    var hdr = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
    var headerIndexMap = getHeaderIndexMap_(hdr);
    var rowVals = sheet.getRange(rowIndex,1,1,sheet.getLastColumn()).getValues()[0];
    if (isRowDeleted_(rowVals, headerIndexMap)) {
      return { success: false, message: 'รายการนี้ถูกลบไปแล้ว' };
    }
    var userRole = String(sess.role || '').trim().toLowerCase();
    if (userRole !== 'admin') {
      if (userRole === 'user') {
        var recordCreatedBy = (headerIndexMap.CreatedBy !== undefined) ? String(rowVals[headerIndexMap.CreatedBy] || '').trim().toLowerCase() : '';
        var currentUsername = String(sess.username || '').trim().toLowerCase();
        if (!currentUsername || currentUsername !== recordCreatedBy) {
          return { success: false, message: 'คุณไม่มีสิทธิ์ลบรายการของผู้อื่น' };
        }
      } else {
        return { success: false, message: 'คุณไม่มีสิทธิ์ลบข้อมูลนี้' };
      }
    }
    if (headerIndexMap.IsDeleted === undefined || headerIndexMap.DeletedAt === undefined || headerIndexMap.DeletedBy === undefined) {
      return { success: false, message: 'โครงสร้างฐานข้อมูลไม่สมบูรณ์ (ไม่พบคอลัมน์ลบ) กรุณารีเฟรชตาราง' };
    }
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    sheet.getRange(rowIndex, headerIndexMap.IsDeleted + 1).setValue('TRUE');
    sheet.getRange(rowIndex, headerIndexMap.DeletedAt + 1).setValue(new Date());
    sheet.getRange(rowIndex, headerIndexMap.DeletedBy + 1).setValue(sess && sess.username ? sess.username : 'Guest');
    lock.releaseLock();
    return { success: true, message: 'ย้ายรายการไปยังข้อมูลที่ลบแล้ว' };
  } catch(e) {
    return { success: false, message: 'เกิดข้อผิดพลาดในการลบ: ' + e.message };
  }
}

// ─── Auth ───────────────────────────────────────────────
function getSession_(token) {
  if (!token) return null;
  try {
    var cached = CacheService.getScriptCache().get('sess_' + token);
    var session = cached ? JSON.parse(cached) : null;
    if (session && String(session.role || '').trim().toLowerCase() === 'user' && !isLatestUserSessionToken_(session.username, token)) {
      CacheService.getScriptCache().remove('sess_' + token);
      return null;
    }
    return session;
  } catch(e) { return null; }
}

function makeSessionInvalidResponse_() {
  return { success: false, sessionInvalid: true, message: SESSION_INVALID_MESSAGE };
}

function getActiveSessionResult_(token) {
  if (!token) return { session: null };
  var session = getSession_(token);
  if (!session || !session.username) return { error: makeSessionInvalidResponse_() };
  return { session: session };
}

function ensureUserSessionColumns_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 5);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  ['SessionToken', 'LastLoginAt'].forEach(function(header) {
    if (headers.indexOf(header) < 0) {
      sheet.getRange(1, headers.length + 1).setValue(header);
      headers.push(header);
    }
  });
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f3f4f6');
  return getHeaderIndexMap_(headers);
}

function isLatestUserSessionToken_(username, token) {
  var userName = String(username || '').trim().toLowerCase();
  var sessionToken = String(token || '').trim();
  if (!userName || !sessionToken) return false;
  try {
    var spreadsheetId = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPERTY_KEYS.spreadsheetId) || setupSystem();
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName(USERS_SHEET_NAME);
    if (!sheet) {
      ensureUsersSheet_(ss);
      sheet = ss.getSheetByName(USERS_SHEET_NAME);
    }
    var headerIndexMap = ensureUserSessionColumns_(sheet);
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][headerIndexMap.Username] || '').trim().toLowerCase() === userName) {
        return String(rows[i][headerIndexMap.SessionToken] || '').trim() === sessionToken;
      }
    }
  } catch (e) { }
  return false;
}

function issueGuestAccessKey_(backendId) {
  var id = String(backendId || '').trim();
  if (!id) return '';
  var accessKey = Utilities.getUuid();
  CacheService.getScriptCache().put(GUEST_ACCESS_CACHE_PREFIX + id, accessKey, GUEST_ACCESS_TTL);
  return accessKey;
}

function isValidGuestAccess_(backendId, guestAccessKey) {
  var id = String(backendId || '').trim();
  var key = String(guestAccessKey || '').trim();
  if (!id || !key) return false;
  try {
    var stored = CacheService.getScriptCache().get(GUEST_ACCESS_CACHE_PREFIX + id);
    return !!stored && stored === key;
  } catch (e) {
    return false;
  }
}

function ensureUsersSheet_(ss) {
  var sheet = ss.getSheetByName(USERS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(USERS_SHEET_NAME);
    sheet.appendRow(['Username','Password','Name','Role','Email']);
    sheet.getRange(1,1,1,5).setFontWeight('bold').setBackground('#f3f4f6');
    sheet.setFrozenRows(1);
    sheet.appendRow(['admin','admin1234','ผู้ดูแลระบบ','admin','']);
  } else {
    var lastCol = sheet.getLastColumn();
    if (lastCol > 0) {
      var headers = sheet.getRange(1, 1, 1, Math.max(lastCol, 5)).getValues()[0];
      if (headers[4] !== 'Email') {
        // If column E isn't Email, make sure it is set
        sheet.getRange(1, 5).setValue('Email');
        sheet.getRange(1, 1, 1, Math.max(lastCol, 5)).setFontWeight('bold').setBackground('#f3f4f6');
      }
    }
  }
  ensureUserSessionColumns_(sheet);
}

function loginUser(payload) {
  try {
    var username = String(payload.username || '').trim().toLowerCase();
    var password = String(payload.password || '').trim();
    if (!username || !password) return { success: false, message: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' };
    var spreadsheetId = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPERTY_KEYS.spreadsheetId) || setupSystem();
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName(USERS_SHEET_NAME);
    if (!sheet) { ensureUsersSheet_(ss); sheet = ss.getSheetByName(USERS_SHEET_NAME); }
    var rows = sheet.getDataRange().getValues();
    var headers = rows[0];
    var uIdx = headers.indexOf('Username');
    var pIdx = headers.indexOf('Password');
    var nIdx = headers.indexOf('Name');
    var rIdx = headers.indexOf('Role');
    var headerIndexMap = ensureUserSessionColumns_(sheet);
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][uIdx]||'').trim().toLowerCase() === username && String(rows[i][pIdx]||'').trim() === password) {
        var token = Utilities.getUuid();
        var user = { username: String(rows[i][uIdx]), name: String(rows[i][nIdx]||rows[i][uIdx]), role: String(rows[i][rIdx]||'user') };
        CacheService.getScriptCache().put('sess_'+token, JSON.stringify(user), SESSION_TTL);
        if (String(user.role || '').trim().toLowerCase() === 'user') {
          sheet.getRange(i + 1, headerIndexMap.SessionToken + 1).setValue(token);
          sheet.getRange(i + 1, headerIndexMap.LastLoginAt + 1).setValue(new Date());
        }
        return { success: true, token: token, user: user };
      }
    }
    return { success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
  } catch(e) {
    return { success: false, message: 'เกิดข้อผิดพลาด: ' + e.message };
  }
}

function logoutUser(payload) {
  try {
    if (payload && payload.token) CacheService.getScriptCache().remove('sess_'+payload.token);
    return { success: true };
  } catch(e) { return { success: true }; }
}

function registerUser(payload) {
  try {
    var name = String(payload.name || '').trim();
    var username = String(payload.username || '').trim().toLowerCase();
    var email = String(payload.email || '').trim();
    var password = String(payload.password || '').trim();
    if (!name || !username || !password) {
      return { success: false, message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' };
    }

    var spreadsheetId = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPERTY_KEYS.spreadsheetId) || setupSystem();
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName(USERS_SHEET_NAME);
    if (!sheet) {
      ensureUsersSheet_(ss);
      sheet = ss.getSheetByName(USERS_SHEET_NAME);
    } else {
      ensureUsersSheet_(ss);
    }

    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var maxWait = Math.max(lastRow - 1, 1);
      var rows = sheet.getRange(2, 1, maxWait, 5).getValues();
      for (var i = 0; i < rows.length; i++) {
        var existingUser = String(rows[i][0] || '').trim().toLowerCase();
        var existingEmail = String(rows[i][4] || '').trim().toLowerCase();
        if (existingUser === username) {
          return { success: false, message: 'ชื่อผู้ใช้นี้มีในระบบแล้ว กรุณาใช้ชื่ออื่น' };
        }
        if (email && existingEmail === email.toLowerCase()) {
          return { success: false, message: 'อีเมลนี้ถูกใช้งานแล้ว กรุณาใช้อีเมลอื่น' };
        }
      }
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    // Columns: Username, Password, Name, Role, Email
    sheet.appendRow([username, password, name, 'user', email]);
    lock.releaseLock();

    return { success: true, message: 'สมัครสมาชิกสำเร็จ' };
  } catch(e) {
    return { success: false, message: 'เกิดข้อผิดพลาด: ' + e.message };
  }
}

function updateRecord(payload) {
  try {
    var backendId = payload.backendId;
    var dataObj = payload.data || {};
    var token = payload.token;
    var guestAccessKey = payload.guestAccessKey;
    if (!backendId) return { success: false, message: 'ไม่พบรายการ' };
    var authResult = getActiveSessionResult_(token);
    if (authResult.error) return authResult.error;
    var sess = authResult.session;
    var isGuestScoped = !sess || !sess.username;
    if (isGuestScoped && !isValidGuestAccess_(backendId, guestAccessKey)) {
      return { success: false, message: 'กรุณาเข้าสู่ระบบก่อนแก้ไขข้อมูล' };
    }
    const sheet = getSheetByName(SHEET_NAME);
    ensureDataSheetSchema_(sheet);
    const ri = findRowByBackendId_(sheet, backendId);
    if (!ri) return { success: false, message: 'ไม่พบรายการในฐานข้อมูล' };
    var hdr = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
    var headerIndexMap = getHeaderIndexMap_(hdr);
    var rowVals = sheet.getRange(ri,1,1,sheet.getLastColumn()).getValues()[0];
    if (isRowDeleted_(rowVals, headerIndexMap)) {
      return { success: false, message: 'รายการนี้ถูกลบไปแล้ว ไม่สามารถแก้ไขได้' };
    }
    if (!isGuestScoped && sess && sess.username) {
      var userRole = String(sess.role || '').trim().toLowerCase();
      if (userRole !== 'admin') {
        if (userRole === 'user') {
          var recordCreatedBy = (headerIndexMap.CreatedBy !== undefined) ? String(rowVals[headerIndexMap.CreatedBy] || '').trim().toLowerCase() : '';
          var currentUsername = String(sess.username || '').trim().toLowerCase();
          if (!currentUsername || currentUsername !== recordCreatedBy) {
            return { success: false, message: 'คุณไม่มีสิทธิ์แก้ไขรายการของผู้อื่น' };
          }
        } else {
          return { success: false, message: 'คุณไม่มีสิทธิ์แก้ไขข้อมูลนี้' };
        }
      }
    }
    var phoneValue = normalizePhoneValue(dataObj.phone || String(rowVals[hdr.indexOf('Phone')]||''));
    var hasProducts = Object.prototype.hasOwnProperty.call(dataObj, 'products');
    var productSummary = hasProducts ? summarizeProductItems_(dataObj.products) : { mainProducts: '', avgPrice: '' };
    if (hasProducts) {
      dataObj.main_products = productSummary.mainProducts;
      dataObj.avg_price = productSummary.avgPrice;
    }
    var skipFields = ['BackendId','LamproundID','CreatedAt','CreatedBy','IsDeleted','DeletedAt','DeletedBy'];
    var fieldMap = {
      'BusinessName':'business_name','OwnerName':'owner_name','Phone':'phone',
      'LineID':'line_id','Facebook':'facebook','Website':'website',
      'LocationText':'location_text','Latitude':'latitude','Longitude':'longitude',
      'BusinessType':'business_type','ProductCategory':'product_category',
      'BusinessLevel':'business_level','MainProducts':'main_products',
      'ProductionCapacity':'production_capacity','SalesChannel':'sales_channel',
      'AvgPrice':'avg_price','BusinessStatus':'business_status',
      'PotentialLevel':'potential_level','Issues':'issues',
      'SupportNeeded':'support_needed','ImageShop':'image_shop',
      'ImageProduct':'image_product','ImageActivity':'image_activity','Note':'note',
      'ShopHistory':'shop_history'
    };
    var newRow = hdr.map(function(h, idx) {
      if (skipFields.indexOf(h) >= 0) return rowVals[idx];
      var key = fieldMap[h];
      if (!key) return rowVals[idx];
      if (h === 'Phone') return phoneValue;
      if (h === 'ProductCategory' || h === 'SalesChannel') {
        return dataObj[key] ? JSON.stringify(dataObj[key]) : rowVals[idx];
      }
      return dataObj[key] !== undefined ? (dataObj[key] || '') : rowVals[idx];
    });
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    sheet.getRange(ri,1,1,hdr.length).setValues([newRow]);
    var phoneCol = hdr.indexOf('Phone') + 1;
    if (phoneCol > 0) sheet.getRange(ri, phoneCol).setNumberFormat('@');
    lock.releaseLock();
    if (hasProducts) {
      var productSyncResult = syncProductsByShopId_(backendId, dataObj.products, token);
      if (productSyncResult && productSyncResult.success === false) {
        return { success: false, message: productSyncResult.message || 'ไม่สามารถบันทึกรายการสินค้าได้' };
      }
      var gallerySyncResult = syncProductGalleryFromItems_({
        shopId: backendId,
        products: dataObj.products,
        token: token,
        guestAccessKey: guestAccessKey
      });
      if (gallerySyncResult && gallerySyncResult.success === false) {
        return { success: false, message: gallerySyncResult.message || 'ไม่สามารถอัปเดตรูปสินค้าได้' };
      }
    }
    return { success: true, message: 'อัปเดตข้อมูลสำเร็จ' };
  } catch(e) {
    return { success: false, message: 'เกิดข้อผิดพลาด: ' + e.message };
  }
}
function ensureScalableStorage_(ss) {
  SCALABLE_SHEETS.forEach(function(definition) {
    ensureSheetWithHeaders_(ss, definition.name, definition.headers);
  });

  const props = PropertiesService.getScriptProperties();
  const userAssetFolderId = '1jyVy077Yo1bCYC2k8Qq7oE4hrE0TZ1Yd';
  if (props.getProperty(SCRIPT_PROPERTY_KEYS.assetFolderId) !== userAssetFolderId) {
    props.setProperty(SCRIPT_PROPERTY_KEYS.assetFolderId, userAssetFolderId);
  }
  // Setup User specific PDF folder
  const userPdfFolderId = '1WmLBAt_eRWZIBIJM3ezXpBmcjdwNt8Qp';
  if (props.getProperty(SCRIPT_PROPERTY_KEYS.pdfFolderId) !== userPdfFolderId) {
    props.setProperty(SCRIPT_PROPERTY_KEYS.pdfFolderId, userPdfFolderId);
  }
}

function deleteMigrationTriggers_() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'migrateAndCopyAssetsToNewFolder') {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
  } catch (e) {
    Logger.log('deleteMigrationTriggers_ error: ' + e.message);
  }
}

function startAutoAssetMigration() {
  deleteMigrationTriggers_();
  ScriptApp.newTrigger('migrateAndCopyAssetsToNewFolder')
    .timeBased()
    .after(5 * 1000)
    .create();
  Logger.log('🚀 สั่งเริ่มทำงานในเบื้องหลัง (Cloud Trigger) สำเร็จแล้ว! ปิดหน้าต่างหรือปิดคอมได้ทันทีครับ');
  return { success: true, message: 'ระบบเริ่มทำงานในเบื้องหลังบนคลาวด์แล้ว สามารถปิดหน้าต่างได้ทันที' };
}

function stopAutoAssetMigration() {
  deleteMigrationTriggers_();
  Logger.log('🛑 ยกเลิก Background Trigger การย้ายรูปภาพทั้งหมดเรียบร้อยแล้ว');
  return { success: true, message: 'ยกเลิก Background Trigger ทั้งหมดเรียบร้อยแล้ว' };
}

function migrateAndCopyAssetsToNewFolder() {
  try {
    setupSystem();
    const startTime = new Date().getTime();
    const MAX_EXECUTION_TIME_MS = 240000; // 4 นาที ป้องกัน GAS Execution Timeout 6 นาที
    const BATCH_COMMIT_SIZE = 20; // บันทึกลง Sheet ทุก 20 รายการ

    const props = PropertiesService.getScriptProperties();
    const targetFolderId = '1jyVy077Yo1bCYC2k8Qq7oE4hrE0TZ1Yd';
    props.setProperty(SCRIPT_PROPERTY_KEYS.assetFolderId, targetFolderId);

    const rootTargetFolder = DriveApp.getFolderById(targetFolderId);
    const gallerySheet = getScalableSheet_(SHOP_GALLERY_SHEET_NAME);
    const lastRow = gallerySheet.getLastRow();
    const lastCol = gallerySheet.getLastColumn();

    if (lastRow <= 1) {
      deleteMigrationTriggers_();
      return { success: true, message: 'ไม่มีข้อมูลรูปภาพใน ShopGallery', processed: 0, copied: 0, isComplete: true };
    }

    const headers = gallerySheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const headerMap = {};
    headers.forEach(function(h, i) { headerMap[String(h).trim()] = i; });

    const shopIdCol = headerMap['ShopID'];
    const fileIdCol = headerMap['DriveFileId'];
    const driveUrlCol = headerMap['DriveUrl'];
    const thumbUrlCol = headerMap['ThumbnailUrl'];
    const nameCol = headerMap['DisplayName'];
    const updateCol = headerMap['UpdatedAt'];

    const dataRange = gallerySheet.getRange(2, 1, lastRow - 1, lastCol);
    const data = dataRange.getValues();

    let processed = 0;
    let copied = 0;
    let alreadyCompleted = 0;
    let dirtyCount = 0;
    let reachedTimeLimit = false;
    const errors = [];

    const shopFolderMap = {};

    for (let i = 0; i < data.length; i++) {
      // ตรวจสอบเวลา หากใกล้ครบ 4 นาที ให้บันทึกแล้วออกเพื่อตั้ง Trigger รอบถัดไป
      if (new Date().getTime() - startTime > MAX_EXECUTION_TIME_MS) {
        reachedTimeLimit = true;
        break;
      }

      const row = data[i];
      const oldFileId = String(row[fileIdCol] || '').trim();
      const shopId = String(row[shopIdCol] || 'Unassigned').trim() || 'Unassigned';
      const displayName = String(row[nameCol] || '').trim();

      if (!oldFileId) continue;
      processed++;

      try {
        if (!shopFolderMap[shopId]) {
          const iter = rootTargetFolder.getFoldersByName(shopId);
          shopFolderMap[shopId] = iter.hasNext() ? iter.next() : rootTargetFolder.createFolder(shopId);
        }
        const shopFolder = shopFolderMap[shopId];

        const oldFile = DriveApp.getFileById(oldFileId);
        
        let alreadyInFolder = false;
        const parents = oldFile.getParents();
        while (parents.hasNext()) {
          if (parents.next().getId() === shopFolder.getId()) {
            alreadyInFolder = true;
            break;
          }
        }

        if (!alreadyInFolder) {
          const fileName = displayName || oldFile.getName() || ('image-' + (i + 1));
          const newCopy = oldFile.makeCopy(fileName, shopFolder);
          newCopy.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          const newFileId = newCopy.getId();

          row[fileIdCol] = newFileId;
          if (driveUrlCol !== undefined) row[driveUrlCol] = 'https://drive.google.com/file/d/' + newFileId + '/view';
          if (thumbUrlCol !== undefined) row[thumbUrlCol] = 'https://lh3.googleusercontent.com/d/' + newFileId + '=w800';
          if (updateCol !== undefined) row[updateCol] = new Date();
          copied++;
          dirtyCount++;
        } else {
          alreadyCompleted++;
        }
      } catch (err) {
        errors.push('Row ' + (i + 2) + ' (' + oldFileId + '): ' + err.message);
      }

      // บันทึกความคืบหน้าลง Sheet ทุกๆ BATCH_COMMIT_SIZE รายการ
      if (dirtyCount >= BATCH_COMMIT_SIZE) {
        dataRange.setValues(data);
        SpreadsheetApp.flush();
        dirtyCount = 0;
      }
    }

    // บันทึกข้อมูลคงเหลือหลังจบลูป
    if (dirtyCount > 0) {
      dataRange.setValues(data);
      SpreadsheetApp.flush();
    }

    const totalRows = data.length;
    const isComplete = !reachedTimeLimit && processed >= totalRows;

    let resultMessage = '';
    if (isComplete) {
      deleteMigrationTriggers_();
      resultMessage = '🎉 ย้ายและคัดลอกไฟล์รูปภาพทั้งหมดเสร็จสมบูรณ์ 100% (' + (alreadyCompleted + copied) + '/' + totalRows + ' ไฟล์)';
    } else {
      deleteMigrationTriggers_();
      // ตั้ง Background Trigger รันตัวเองรอบใหม่ในอีก 1 นาทีอัตโนมัติ
      try {
        ScriptApp.newTrigger('migrateAndCopyAssetsToNewFolder')
          .timeBased()
          .after(1 * 60 * 1000)
          .create();
      } catch (triggerErr) {
        Logger.log('Trigger create error: ' + triggerErr.message);
      }
      resultMessage = '⏱️ บันทึกความคืบหน้าแล้ว (' + processed + '/' + totalRows + ' ไฟล์, คัดลอกแล้ว ' + copied + ' ไฟล์) ⏳ ระบบได้ตั้ง Cloud Trigger เพื่อทำงานต่อในอีก 1 นาทีอัตโนมัติ (สามารถปิดหน้าต่างหรือปิดคอมได้เลย)';
    }

    Logger.log(resultMessage);
    return {
      success: true,
      isComplete: isComplete,
      message: resultMessage,
      processed: processed,
      copied: copied,
      alreadyCompleted: alreadyCompleted,
      remaining: Math.max(totalRows - processed, 0),
      errors: errors.slice(0, 10)
    };
  } catch (e) {
    Logger.log('Migration error: ' + e.message);
    return { success: false, message: 'เกิดข้อผิดพลาดในการคัดลอกไฟล์: ' + e.message };
  }
}

function updateShopGalleryThumbnailsToLh3() {
  try {
    setupSystem();
    const sheet = getScalableSheet_(SHOP_GALLERY_SHEET_NAME);
    if (!sheet) return { success: false, message: 'ShopGallery sheet not found' };

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow <= 1) return { success: true, count: 0, message: 'No data rows in ShopGallery' };

    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const fileIdCol = headers.indexOf('DriveFileId');
    const thumbUrlCol = headers.indexOf('ThumbnailUrl');
    const updateCol = headers.indexOf('UpdatedAt');

    if (fileIdCol === -1 || thumbUrlCol === -1) {
      return { success: false, message: 'Required columns not found in ShopGallery' };
    }

    const range = sheet.getRange(2, 1, lastRow - 1, lastCol);
    const data = range.getValues();
    let updatedCount = 0;

    for (let i = 0; i < data.length; i++) {
      const fileId = String(data[i][fileIdCol] || '').trim();
      if (fileId) {
        const currentThumb = String(data[i][thumbUrlCol] || '').trim();
        const newThumb = 'https://lh3.googleusercontent.com/d/' + fileId + '=w800';
        if (currentThumb !== newThumb) {
          data[i][thumbUrlCol] = newThumb;
          if (updateCol !== -1) data[i][updateCol] = new Date();
          updatedCount++;
        }
      }
    }

    if (updatedCount > 0) {
      range.setValues(data);
      SpreadsheetApp.flush();
    }

    const resultMsg = 'Updated ' + updatedCount + ' rows to lh3 thumbnail URLs in ShopGallery (Total: ' + data.length + ' rows)';
    Logger.log(resultMsg);
    return { success: true, updatedCount: updatedCount, totalRows: data.length, message: resultMsg };
  } catch (e) {
    Logger.log('Error updating thumbnails: ' + e.message);
    return { success: false, message: e.message };
  }
}

function ensureSheetWithHeaders_(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  let isNew = false;
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    isNew = true;
  }

  const lastColumn = sheet.getLastColumn();
  if (lastColumn === 0 || isNew) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f3f4f6');
    sheet.setFrozenRows(1);
    return sheet;
  }

  const existingHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  let missing = false;
  for (let i = 0; i < headers.length; i++) {
    if (existingHeaders.indexOf(headers[i]) === -1) {
      missing = true;
      break;
    }
  }

  if (missing) {
    let currentColumn = existingHeaders.filter(String).length;
    headers.forEach(function(header) {
      if (existingHeaders.indexOf(header) !== -1) return;
      currentColumn += 1;
      sheet.getRange(1, currentColumn).setValue(header);
    });
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f3f4f6');
  }

  return sheet;
}

function getScalableSheet_(sheetName) {
  const ss = getActiveSpreadsheet_();
  let sheet = ss.getSheetByName(sheetName);
  if (sheet && sheet.getLastColumn() > 0) {
    return sheet;
  }
  const definition = SCALABLE_SHEETS.filter(function(item) { return item.name === sheetName; })[0];
  if (!definition) throw new Error('Unknown scalable sheet: ' + sheetName);
  return ensureSheetWithHeaders_(ss, sheetName, definition.headers);
}

function nextSequenceId_(prefix, values) {
  let maxNumber = 0;
  values.forEach(function(value) {
    const text = String(value || '').trim();
    if (!text || text.indexOf(prefix) !== 0) return;
    const parts = text.split('-');
    const lastPart = parts[parts.length - 1];
    const parsed = parseInt(lastPart, 10);
    if (!isNaN(parsed) && parsed > maxNumber) maxNumber = parsed;
  });
  return prefix + ('000000' + (maxNumber + 1)).slice(-6);
}

function parseJsonArray_(value) {
  if (Array.isArray(value)) return value.slice();
  const text = String(value || '').trim();
  if (!text) return [];
  if (text.charAt(0) === '[') {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  return [text];
}

function createShopId_() {
  const sheet = getScalableSheet_(SHOPS_SHEET_NAME);
  const lastRow = sheet.getLastRow();
  const values = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1).getValues().map(function(row) { return row[0]; }) : [];
  return nextSequenceId_('SHOP-', values);
}

function createProductId_() {
  const sheet = getScalableSheet_(PRODUCTS_SHEET_NAME);
  const lastRow = sheet.getLastRow();
  const values = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1).getValues().map(function(row) { return row[0]; }) : [];
  return nextSequenceId_('PROD-', values);
}

function createGalleryId_() {
  const sheet = getScalableSheet_(SHOP_GALLERY_SHEET_NAME);
  const lastRow = sheet.getLastRow();
  const values = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1).getValues().map(function(row) { return row[0]; }) : [];
  return nextSequenceId_('GAL-', values);
}

function buildSequentialIds_(prefix, existingValues, count) {
  let maxNumber = 0;
  existingValues.forEach(function(value) {
    const text = String(value || '').trim();
    if (!text || text.indexOf(prefix) !== 0) return;
    const parts = text.split('-');
    const parsed = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(parsed) && parsed > maxNumber) maxNumber = parsed;
  });

  const ids = [];
  for (let i = 0; i < count; i++) {
    maxNumber += 1;
    ids.push(prefix + ('000000' + maxNumber).slice(-6));
  }
  return ids;
}

function getCurrentUserName_(token) {
  const session = getSession_(token);
  return session && session.username ? session.username : 'Guest';
}

function getOrCreateAssetFolder_(shopId) {
  const props = PropertiesService.getScriptProperties();
  const rootFolderId = props.getProperty(SCRIPT_PROPERTY_KEYS.assetFolderId);
  if (!rootFolderId) throw new Error('Asset folder is not configured.');

  const root = DriveApp.getFolderById(rootFolderId);
  const folderName = String(shopId || 'Unassigned').trim() || 'Unassigned';
  const iterator = root.getFoldersByName(folderName);
  return iterator.hasNext() ? iterator.next() : root.createFolder(folderName);
}

function findRowByValue_(sheet, columnName, value) {
  const target = String(value || '').trim();
  if (!target) return null;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const columnIndex = headers.indexOf(columnName);
  if (columnIndex === -1) return null;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const values = sheet.getRange(2, columnIndex + 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === target) return i + 2;
  }
  return null;
}

function mapRowToObject_(headers, row) {
  const result = {};
  headers.forEach(function(header, index) {
    const value = row[index];
    result[header] = value instanceof Date ? value.toISOString() : String(value == null ? '' : value);
  });
  return result;
}

function normalizeProductItems_(items) {
  if (!Array.isArray(items)) return [];
  return items.map(function(item, index) {
    return {
      productName: String(item && (item.productName || item.name || '')).trim(),
      productCategory: String(item && (item.productCategory || item.category || '')).trim(),
      description: String(item && (item.description || item.detail || '')).trim(),
      price: String(item && item.price != null ? item.price : '').trim(),
      unit: String(item && item.unit != null ? item.unit : '').trim(),
      sortOrder: item && item.sortOrder != null ? item.sortOrder : (index + 1)
    };
  }).filter(function(item) {
    return item.productName || item.productCategory || item.description || item.price;
  });
}

function summarizeProductItems_(items) {
  const normalized = normalizeProductItems_(items);
  const names = [];
  const numericPrices = [];
  let fallbackPrice = '';

  normalized.forEach(function(item) {
    if (item.productName) names.push(item.productName);
    if (!fallbackPrice && item.price) fallbackPrice = String(item.price).trim();
    const numericText = String(item.price || '').replace(new RegExp('[^0-9.]', 'g'), '');
    if (!numericText) return;
    const numeric = Number(numericText);
    if (!Number.isNaN(numeric)) numericPrices.push(numeric);
  });

  return {
    mainProducts: names.join(', '),
    avgPrice: numericPrices.length ? String(Math.round(numericPrices.reduce(function(sum, value) { return sum + value; }, 0) / numericPrices.length)) : fallbackPrice
  };
}

function buildShopRow_(shopId, payload, existingRow, createdBy) {
  const now = new Date();
  const previous = existingRow || {};
  const hasProducts = Object.prototype.hasOwnProperty.call(payload || {}, 'products');
  const productSummary = hasProducts ? summarizeProductItems_(payload.products) : { mainProducts: '', avgPrice: '' };
  return [
    shopId,
    previous.LegacyBackendId || String(payload.legacyBackendId || payload.backendId || ''),
    previous.LegacyLamproundID || String(payload.legacyLamproundId || payload.lamproundId || ''),
    payload.business_name || payload.businessName || previous.BusinessName || '',
    payload.owner_name || payload.ownerName || previous.OwnerName || '',
    normalizePhoneValue(payload.phone || previous.Phone || ''),
    payload.line_id || payload.lineId || previous.LineID || '',
    payload.facebook || previous.Facebook || '',
    payload.website || previous.Website || '',
    payload.location_text || payload.locationText || previous.LocationText || '',
    payload.latitude || previous.Latitude || '',
    payload.longitude || previous.Longitude || '',
    payload.business_type || payload.businessType || previous.BusinessType || '',
    JSON.stringify(parseJsonArray_(payload.product_category || payload.productCategory || previous.ProductCategory)),
    payload.business_level || payload.businessLevel || previous.BusinessLevel || '',
    hasProducts ? productSummary.mainProducts : (payload.main_products || payload.mainProducts || previous.MainProducts || ''),
    payload.production_capacity || payload.productionCapacity || previous.ProductionCapacity || '',
    JSON.stringify(parseJsonArray_(payload.sales_channel || payload.salesChannel || previous.SalesChannel)),
    hasProducts ? productSummary.avgPrice : (payload.avg_price || payload.avgPrice || previous.AvgPrice || ''),
    payload.business_status || payload.businessStatus || previous.BusinessStatus || '',
    payload.potential_level || payload.potentialLevel || previous.PotentialLevel || '',
    payload.issues || previous.Issues || '',
    payload.support_needed || payload.supportNeeded || previous.SupportNeeded || '',
    payload.note || previous.Note || '',
    previous.CreatedAt ? new Date(previous.CreatedAt) : now,
    previous.CreatedBy || createdBy,
    now,
    createdBy,
    previous.IsDeleted || 'FALSE',
    previous.DeletedAt || '',
    previous.DeletedBy || '',
    String(payload.shop_history || payload.shopHistory || previous.ShopHistory || '').trim()
  ];
}
function upsertShopRecord(payload) {
  try {
    const data = payload && payload.data ? payload.data : payload || {};
    const token = payload && payload.token ? payload.token : null;
    const allowGuestPdf = !!(payload && payload.allowGuestPdf);
    const authResult = getActiveSessionResult_(token);
    if (authResult.error) return authResult.error;
    const session = authResult.session;
    if ((!session || !session.username) && !allowGuestPdf) {
      return { success: false, message: 'กรุณาเข้าสู่ระบบก่อนบันทึกข้อมูล' };
    }
    const shopSheet = getScalableSheet_(SHOPS_SHEET_NAME);
    const createdBy = session && session.username ? session.username : 'Guest';
    const headers = shopSheet.getRange(1, 1, 1, shopSheet.getLastColumn()).getValues()[0];
    let shopId = String(data.shopId || '').trim();
    let rowIndex = shopId ? findRowByValue_(shopSheet, 'ShopID', shopId) : null;
    let existing = {};

    if (rowIndex) {
      existing = mapRowToObject_(headers, shopSheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0]);
    } else {
      shopId = createShopId_();
    }

    const row = buildShopRow_(shopId, data, existing, createdBy);
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    if (rowIndex) {
      shopSheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
    } else {
      shopSheet.appendRow(row);
      rowIndex = shopSheet.getLastRow();
    }
    const phoneColumn = headers.indexOf('Phone') + 1;
    if (phoneColumn > 0) shopSheet.getRange(rowIndex, phoneColumn).setNumberFormat('@');
    lock.releaseLock();

    if (Object.prototype.hasOwnProperty.call(data, 'products')) {
      const result = replaceProductsByShopId({
        shopId: String(shopId || '').trim(),
        items: normalizeProductItems_(data.products),
        token: token
      });
      if (!result.success) {
        return { success: false, message: 'Failed to replace products: ' + result.message };
      }
    }

    return { success: true, shopId: shopId, rowIndex: rowIndex };
  } catch (e) {
    return { success: false, message: 'Failed to save shop record: ' + e.message };
  }
}

function syncProductsByShopId_(shopId, products, token) {
  if (typeof products === 'undefined') return { success: true, skipped: true };
  return replaceProductsByShopId({
    shopId: String(shopId || '').trim(),
    items: normalizeProductItems_(products),
    token: token
  });
}

function replaceProductsByShopId(payload) {
  try {
    const shopId = String(payload.shopId || '').trim();
    const items = normalizeProductItems_(payload.items);
    const token = payload.token || null;
    if (!shopId) return { success: false, message: 'shopId is required.' };
    const authResult = getActiveSessionResult_(token);
    if (authResult.error) return authResult.error;

    const userName = getCurrentUserName_(token);
    const sheet = getScalableSheet_(PRODUCTS_SHEET_NAME);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const allValues = sheet.getDataRange().getValues();
    const keptRows = [headers];
    const nextIds = buildSequentialIds_('PROD-', allValues.slice(1).map(function(row) { return row[0]; }), items.length);

    for (let i = 1; i < allValues.length; i++) {
      if (String(allValues[i][1] || '').trim() !== shopId) keptRows.push(allValues[i]);
    }

    items.forEach(function(item, index) {
      const now = new Date();
      keptRows.push([
        nextIds[index],
        shopId,
        item.productName || '',
        item.productCategory || '',
        item.description || '',
        item.price || '',
        item.unit || '',
        item.sortOrder != null ? item.sortOrder : (index + 1),
        'FALSE',
        now,
        userName,
        now,
        userName
      ]);
    });

    sheet.clearContents();
    sheet.getRange(1, 1, keptRows.length, headers.length).setValues(keptRows);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f3f4f6');
    sheet.setFrozenRows(1);
    return { success: true, count: items.length };
  } catch (e) {
    return { success: false, message: 'Failed to replace products: ' + e.message };
  }
}

function decodeBase64Payload_(rawContent) {
  const text = String(rawContent || '');
  const base64 = text.indexOf('base64,') >= 0 ? text.split('base64,')[1] : text;
  if (!base64) throw new Error('Image payload is empty.');
  return Utilities.base64Decode(base64);
}

function uploadGalleryImage(payload) {
  try {
    const token = payload && payload.token ? payload.token : null;
    const guestAccessKey = payload && payload.guestAccessKey ? payload.guestAccessKey : '';
    const authResult = getActiveSessionResult_(token);
    if (authResult.error) return authResult.error;
    const session = authResult.session;
    const userName = session && session.username ? session.username : 'Guest';
    const shopId = String(payload.shopId || '').trim();
    const productId = String(payload.productId || '').trim();
    const fileBaseName = String(payload.fileName || 'upload.jpg').trim().replace(/\.[^/.]+$/, '') || 'upload';
    const fileName = fileBaseName + '.jpg';
    const mimeType = 'image/jpeg';
    const imageRole = String(payload.imageRole || 'gallery').trim() || 'gallery';
    const sortOrder = payload.sortOrder != null ? payload.sortOrder : '';
    const status = String(payload.status || 'ACTIVE').trim() || 'ACTIVE';
    const bytes = decodeBase64Payload_(payload.base64 || payload.dataUrl || payload.content);

    if (!shopId) return { success: false, message: 'shopId is required.' };
    if ((!session || !session.username) && !isValidGuestAccess_(shopId, guestAccessKey)) {
      return { success: false, message: 'กรุณาเข้าสู่ระบบก่อนอัปโหลดรูป' };
    }

    const folder = getOrCreateAssetFolder_(shopId);
    const blob = Utilities.newBlob(bytes, mimeType, fileName);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const gallerySheet = getScalableSheet_(SHOP_GALLERY_SHEET_NAME);
    const galleryId = createGalleryId_();
    const now = new Date();
    const driveUrl = 'https://drive.google.com/file/d/' + file.getId() + '/view';
    const thumbnailUrl = 'https://lh3.googleusercontent.com/d/' + file.getId() + '=w800';

    gallerySheet.appendRow([
      galleryId,
      shopId,
      productId,
      imageRole,
      fileName,
      file.getId(),
      driveUrl,
      thumbnailUrl,
      mimeType,
      blob.getBytes().length,
      '',
      '',
      sortOrder,
      status,
      now,
      userName,
      now,
      userName
    ]);

    return {
      success: true,
      galleryId: galleryId,
      shopId: shopId,
      driveFileId: file.getId(),
      driveUrl: driveUrl,
      thumbnailUrl: thumbnailUrl
    };
  } catch (e) {
    return { success: false, message: 'Failed to upload image: ' + e.message };
  }
}

function extractDriveFileIdFromUrl_(url) {
  var text = String(url || '').trim();
  if (!text || text.indexOf('data:') === 0) return '';
  var match = text.match(/\/file\/d\/([a-zA-Z0-9_-]+)\//i);
  if (match && match[1]) return match[1];
  match = text.match(/\/d\/([a-zA-Z0-9_-]+)/i);
  if (match && match[1]) return match[1];
  match = text.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
  if (match && match[1]) return match[1];
  match = text.match(/thumbnail\?id=([a-zA-Z0-9_-]+)/i);
  if (match && match[1]) return match[1];
  return '';
}

function markGalleryRowsDeletedByIndexes_(sheet, headers, rowIndexes, userName) {
  if (!rowIndexes || !rowIndexes.length) return;
  var statusCol = headers.indexOf('Status') + 1;
  var updatedAtCol = headers.indexOf('UpdatedAt') + 1;
  var updatedByCol = headers.indexOf('UpdatedBy') + 1;
  if (statusCol < 1) return;
  rowIndexes.forEach(function(rowIndex) {
    sheet.getRange(rowIndex, statusCol).setValue('DELETED');
    if (updatedAtCol > 0) sheet.getRange(rowIndex, updatedAtCol).setValue(new Date());
    if (updatedByCol > 0) sheet.getRange(rowIndex, updatedByCol).setValue(userName || 'Guest');
  });
}

function appendGalleryRowFromDriveFile_(payload) {
  var data = payload || {};
  var sheet = data.sheet;
  var shopId = String(data.shopId || '').trim();
  var driveFileId = String(data.driveFileId || '').trim();
  var sortOrder = data.sortOrder != null ? data.sortOrder : '';
  var displayName = String(data.displayName || '').trim();
  var userName = String(data.userName || 'Guest').trim() || 'Guest';
  if (!sheet || !shopId || !driveFileId) return { success: false, message: 'Missing required gallery fields.' };

  var file = DriveApp.getFileById(driveFileId);
  var mimeType = String(file.getMimeType() || '').trim() || 'image/jpeg';
  var now = new Date();
  sheet.appendRow([
    createGalleryId_(),
    shopId,
    '',
    'product',
    displayName || ('product-' + sortOrder),
    driveFileId,
    'https://drive.google.com/file/d/' + driveFileId + '/view',
    'https://lh3.googleusercontent.com/d/' + driveFileId + '=w800',
    mimeType,
    '',
    '',
    '',
    sortOrder,
    'ACTIVE',
    now,
    userName,
    now,
    userName
  ]);
  return { success: true };
}

function syncProductGalleryFromItems_(payload) {
  try {
    var data = payload || {};
    var shopId = String(data.shopId || '').trim();
    var products = Array.isArray(data.products) ? data.products : [];
    var token = data.token || null;
    var guestAccessKey = data.guestAccessKey || '';
    if (!shopId) return { success: false, message: 'shopId is required.' };

    var gallerySheet = getScalableSheet_(SHOP_GALLERY_SHEET_NAME);
    var values = gallerySheet.getDataRange().getValues();
    if (!values.length) return { success: true };
    var headers = values[0];
    var shopIdx = headers.indexOf('ShopID');
    var roleIdx = headers.indexOf('ImageRole');
    var statusIdx = headers.indexOf('Status');
    if (shopIdx < 0 || roleIdx < 0 || statusIdx < 0) {
      return { success: false, message: 'Gallery schema is incomplete.' };
    }

    var userName = getCurrentUserName_(token);
    var deleteRows = [];
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      if (String(row[shopIdx] || '').trim() !== shopId) continue;
      if (String(row[statusIdx] || '').toUpperCase() === 'DELETED') continue;
      var role = String(row[roleIdx] || '').trim().toLowerCase();
      if (role === 'product' || role === 'gallery') deleteRows.push(i + 1);
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    markGalleryRowsDeletedByIndexes_(gallerySheet, headers, deleteRows, userName);
    lock.releaseLock();

    for (var p = 0; p < products.length; p++) {
      var item = products[p] || {};
      var imageValue = String(item.image || item.Image || '').trim();
      if (!imageValue) continue;
      var sortOrder = item.sortOrder != null ? item.sortOrder : (item.SortOrder != null ? item.SortOrder : (p + 1));
      var displayName = String(item.productName || item.ProductName || '').trim() || ('product-' + sortOrder);
      if (imageValue.indexOf('data:image/') === 0) {
        var uploadResult = uploadGalleryImage({
          shopId: shopId,
          token: token,
          guestAccessKey: guestAccessKey,
          fileName: displayName + '.jpg',
          mimeType: 'image/jpeg',
          imageRole: 'product',
          sortOrder: sortOrder,
          dataUrl: imageValue
        });
        if (!uploadResult || !uploadResult.success) {
          return { success: false, message: (uploadResult && uploadResult.message) || 'Failed to upload product image.' };
        }
        continue;
      }
      var driveFileId = extractDriveFileIdFromUrl_(imageValue);
      if (!driveFileId) continue;
      var appendResult = appendGalleryRowFromDriveFile_({
        sheet: gallerySheet,
        shopId: shopId,
        driveFileId: driveFileId,
        sortOrder: sortOrder,
        displayName: displayName,
        userName: userName
      });
      if (!appendResult.success) return appendResult;
    }

    return { success: true };
  } catch (e) {
    return { success: false, message: 'Failed to sync product gallery: ' + e.message };
  }
}

function softDeleteGalleryImage(payload) {
  try {
    var token = payload && payload.token ? payload.token : null;
    var galleryId = String((payload && payload.galleryId) || '').trim();
    var backendId = String((payload && (payload.backendId || payload.shopId)) || '').trim();
    var guestAccessKey = String((payload && payload.guestAccessKey) || '').trim();
    if (!galleryId) return { success: false, message: 'galleryId is required.' };
    var authResult = getActiveSessionResult_(token);
    if (authResult.error) return authResult.error;
    var session = authResult.session;
    var isGuestScoped = !session || !session.username;
    if (isGuestScoped && (!backendId || !isValidGuestAccess_(backendId, guestAccessKey))) {
      return { success: false, message: 'กรุณาเข้าสู่ระบบก่อนลบรูป' };
    }
    var userName = session && session.username ? session.username : 'Guest';
    var sheet = getScalableSheet_(SHOP_GALLERY_SHEET_NAME);
    var rowIndex = findRowByValue_(sheet, 'GalleryID', galleryId);
    if (!rowIndex) return { success: false, message: 'Gallery image not found.' };
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var shopIdCol = headers.indexOf('ShopID');
    var statusCol = headers.indexOf('Status') + 1;
    var updatedAtCol = headers.indexOf('UpdatedAt') + 1;
    var updatedByCol = headers.indexOf('UpdatedBy') + 1;
    if (statusCol < 1) return { success: false, message: 'Status column not found.' };
    if (isGuestScoped) {
      if (shopIdCol < 0) return { success: false, message: 'ShopID column not found.' };
      var rowValue = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
      var rowShopId = String(rowValue[shopIdCol] || '').trim();
      if (rowShopId !== backendId) {
        return { success: false, message: 'คุณไม่มีสิทธิ์ลบรูปนี้' };
      }
    }
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    sheet.getRange(rowIndex, statusCol).setValue('DELETED');
    if (updatedAtCol > 0) sheet.getRange(rowIndex, updatedAtCol).setValue(new Date());
    if (updatedByCol > 0) sheet.getRange(rowIndex, updatedByCol).setValue(userName);
    lock.releaseLock();
    return { success: true, galleryId: galleryId };
  } catch (e) {
    return { success: false, message: 'Failed to delete gallery image: ' + e.message };
  }
}

function getShopGallery(payload) {
  try {
    // Build a list of all possible ShopID values to match against.
    // Gallery images may have been stored with ShopID = UUID (backendId from LamproundData)
    // or ShopID = SHOP-XXXXXX (from Shops sheet). We must search for both.
    var lookupIds = [];
    if (typeof payload === 'string') {
      var trimmed = payload.trim();
      if (trimmed) lookupIds.push(trimmed);
    } else if (payload) {
      ['shopId', 'backendId', 'legacyBackendId'].forEach(function(key) {
        var v = String(payload[key] || '').trim();
        if (v && lookupIds.indexOf(v) === -1) lookupIds.push(v);
      });
    }
    if (lookupIds.length === 0) return [];

    const sheet = getScalableSheet_(SHOP_GALLERY_SHEET_NAME);
    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];
    const headers = values[0];
    const items = [];

    for (let i = 1; i < values.length; i++) {
      const row = mapRowToObject_(headers, values[i]);
      if (lookupIds.indexOf(String(row.ShopID || '').trim()) === -1) continue;
      if (String(row.Status || '').trim().toUpperCase() === 'DELETED') continue;
      items.push(row);
    }

    items.sort(function(a, b) {
      return Number(a.SortOrder || 0) - Number(b.SortOrder || 0);
    });

    return items;
  } catch (e) {
    return [];
  }
}
function getProductsByShopId_(shopId) {
  const targets = Array.isArray(shopId) ? shopId : [shopId];
  const normalizedTargets = targets.map(function(value) {
    return String(value || '').trim();
  }).filter(Boolean);
  if (!normalizedTargets.length) return [];

  const sheet = getScalableSheet_(PRODUCTS_SHEET_NAME);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  const headers = values[0];
  const products = [];

  for (let i = 1; i < values.length; i++) {
    const row = mapRowToObject_(headers, values[i]);
    if (normalizedTargets.indexOf(String(row.ShopID || '').trim()) === -1) continue;
    if (String(row.IsDeleted || '').toUpperCase() === 'TRUE') continue;
    products.push(row);
  }

  products.sort(function(a, b) {
    return Number(a.SortOrder || 0) - Number(b.SortOrder || 0);
  });

  return products;
}

function getShopRecord(payload) {
  try {
    const requested = payload || {};
    const shopId = String(requested.shopId || '').trim();
    const legacyBackendId = String(requested.legacyBackendId || requested.backendId || '').trim();
    const legacyLamproundId = String(requested.legacyLamproundId || requested.lamproundId || '').trim();
    const shopSheet = getScalableSheet_(SHOPS_SHEET_NAME);
    const lastRow = shopSheet.getLastRow();
    let record = null;

    if (lastRow >= 2) {
      const headers = shopSheet.getRange(1, 1, 1, shopSheet.getLastColumn()).getValues()[0];
      const values = shopSheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

      for (let i = 0; i < values.length; i++) {
        const row = mapRowToObject_(headers, values[i]);
        if (shopId && String(row.ShopID || '').trim() === shopId) {
          record = row;
          break;
        }
        if (legacyBackendId && String(row.LegacyBackendId || '').trim() === legacyBackendId) {
          record = row;
          break;
        }
        if (legacyLamproundId && String(row.LegacyLamproundID || '').trim() === legacyLamproundId) {
          record = row;
          break;
        }
      }
    }

    // Build gallery lookup payload with ALL possible IDs so we find images
    // stored under either the SHOP-XXXXXX id or the legacy UUID backendId.
    var galleryLookup = {};
    if (record) galleryLookup.shopId = record.ShopID;
    if (legacyBackendId) galleryLookup.backendId = legacyBackendId;
    // Also include the Shops-sheet LegacyBackendId if it differs
    if (record && record.LegacyBackendId) galleryLookup.legacyBackendId = record.LegacyBackendId;

    var gallery = getShopGallery(galleryLookup);

    if (!record) {
      // No Shops record, but gallery images may still exist (uploaded with UUID as shopId)
      return {
        success: gallery.length > 0,
        message: gallery.length > 0 ? 'Gallery found via legacy ID' : 'Shop not found.',
        shop: null,
        gallery: gallery,
        products: []
      };
    }

    return {
      success: true,
      shop: record,
      gallery: gallery,
      products: getProductsByShopId_([
        record.ShopID,
        record.LegacyBackendId,
        legacyBackendId
      ])
    };
  } catch (e) {
    return { success: false, message: 'Failed to load shop record: ' + e.message };
  }
}

function getLegacyRecordForScalableFallback_(payload) {
  const requested = payload || {};
  const backendId = String(requested.legacyBackendId || requested.backendId || '').trim();
  const legacyLamproundId = String(requested.legacyLamproundId || requested.lamproundId || '').trim();

  if (backendId) {
    const detailResult = getRecordDetail({ backendId: backendId });
    if (detailResult && detailResult.success && detailResult.record) return detailResult.record;
  }

  if (!legacyLamproundId) return null;

  const sheet = getSheetByName(SHEET_NAME);
  ensureDataSheetSchema_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const headerIndexMap = getHeaderIndexMap_(headers);
  const lamproundIndex = headers.indexOf('LamproundID');
  if (lamproundIndex === -1) return null;

  const rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (isRowDeleted_(rows[i], headerIndexMap)) continue;
    if (String(rows[i][lamproundIndex] || '').trim() !== legacyLamproundId) continue;
    return buildRecordFromRow_(headers, rows[i], { includeImages: true, headerIndexMap: headerIndexMap });
  }

  return null;
}

function hasPdfShopMasterData_(shop) {
  const record = shop || {};
  return [
    'BusinessName', 'OwnerName', 'Phone', 'LineID', 'Facebook', 'Website',
    'LocationText', 'ShopHistory', 'BusinessType', 'ProductCategory',
    'BusinessLevel', 'SalesChannel', 'AvgPrice', 'BusinessStatus', 'PotentialLevel'
  ].some(function(key) {
    return String(record[key] == null ? '' : record[key]).trim() !== '';
  });
}

function mapLegacyRecordToShopPayload_(legacyRecord, payload) {
  const record = legacyRecord || {};
  const requested = payload || {};
  return {
    shopId: String(requested.shopId || '').trim(),
    legacyBackendId: String(requested.legacyBackendId || requested.backendId || record.BackendId || '').trim(),
    legacyLamproundId: String(requested.legacyLamproundId || requested.lamproundId || record.LamproundID || '').trim(),
    business_name: record.BusinessName || '',
    owner_name: record.OwnerName || '',
    phone: record.Phone || '',
    line_id: record.LineID || '',
    facebook: record.Facebook || '',
    website: record.Website || '',
    location_text: record.LocationText || '',
    latitude: record.Latitude || '',
    longitude: record.Longitude || '',
    business_type: record.BusinessType || '',
    product_category: record.ProductCategory || '',
    business_level: record.BusinessLevel || '',
    main_products: record.MainProducts || '',
    production_capacity: record.ProductionCapacity || '',
    sales_channel: record.SalesChannel || '',
    avg_price: record.AvgPrice || '',
    business_status: record.BusinessStatus || '',
    potential_level: record.PotentialLevel || '',
    issues: record.Issues || '',
    support_needed: record.SupportNeeded || '',
    note: record.Note || ''
  };
}

function importLegacyImagesToGallery_(shopId, legacyRecord, token) {
  const record = legacyRecord || {};
  const imageFields = [
    { field: 'ImageShop', role: 'shop', fileName: 'shop-cover' },
    { field: 'ImageProduct', role: 'product', fileName: 'product-cover' },
    { field: 'ImageActivity', role: 'activity', fileName: 'activity-cover' }
  ];
  let imported = 0;

  imageFields.forEach(function(item, index) {
    const rawValue = String(record[item.field] || '').trim();
    if (!rawValue) return;
    // --- fallback: URL / Blob import for non-base64 legacy images ---
    if (rawValue.indexOf('base64,') === -1) {
      try {
        var isUrl = /^https?:\/\//i.test(rawValue);
        if (!isUrl) return;
        var resp = UrlFetchApp.fetch(rawValue, { muteHttpExceptions: true });
        if (resp.getResponseCode() < 200 || resp.getResponseCode() >= 300) return;
        var blob = resp.getBlob();
        var urlMime = blob.getContentType() || 'image/jpeg';
        var urlExt = urlMime.indexOf('png') >= 0 ? '.png' : urlMime.indexOf('webp') >= 0 ? '.webp' : '.jpg';
        var folder = getOrCreateAssetFolder_(shopId);
        var file = folder.createFile(blob.setName(item.fileName + urlExt));
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        var galSheet = getScalableSheet_(SHOP_GALLERY_SHEET_NAME);
        var galId = createGalleryId_();
        var now = new Date();
        galSheet.appendRow([
          galId, shopId, '', item.role, item.fileName + urlExt, file.getId(),
          'https://drive.google.com/file/d/' + file.getId() + '/view',
          'https://lh3.googleusercontent.com/d/' + file.getId() + '=w800',
          urlMime, blob.getBytes().length, '', '', index + 1, 'ACTIVE', now,
          getCurrentUserName_(token), now, getCurrentUserName_(token)
        ]);
        imported += 1;
      } catch (urlErr) { /* skip non-fetchable URL */ }
      return;
    }
    const mimeMatch = rawValue.match(/^data:([^;]+);base64,/i);
    const mimeType = mimeMatch && mimeMatch[1] ? mimeMatch[1] : 'image/jpeg';
    const extension = mimeType.indexOf('png') >= 0 ? '.png' : mimeType.indexOf('webp') >= 0 ? '.webp' : '.jpg';
    const uploadResult = uploadGalleryImage({
      shopId: shopId,
      token: token || null,
      fileName: item.fileName + extension,
      mimeType: mimeType,
      imageRole: item.role,
      sortOrder: index + 1,
      dataUrl: rawValue
    });
    if (uploadResult && uploadResult.success) imported += 1;
  });

  return imported;
}

function ensureScalableShopRecordForPdf_(payload) {
  const requested = payload || {};
  const legacyBackendId = String(requested.legacyBackendId || requested.backendId || '').trim();
  let shopResult = getShopRecord(requested);

  // Case 1: Shops record found with gallery already populated
  if (shopResult.shop && (shopResult.gallery || []).length) {
    // A gallery can exist before the Shops row is fully populated. Preserve the
    // gallery, then hydrate an empty master record from the legacy source for PDF only.
    if (!hasPdfShopMasterData_(shopResult.shop)) {
      var legacyForPdf = getLegacyRecordForScalableFallback_({
        legacyBackendId: shopResult.shop.LegacyBackendId || legacyBackendId,
        legacyLamproundId: shopResult.shop.LegacyLamproundID || requested.legacyLamproundId || requested.lamproundId
      });
      if (legacyForPdf) {
        Object.keys(legacyForPdf).forEach(function(key) {
          if (String(shopResult.shop[key] == null ? '' : shopResult.shop[key]).trim() === '') {
            shopResult.shop[key] = legacyForPdf[key];
          }
        });
      }
    }
    return shopResult;
  }

  // Case 2: Shops record found but no gallery — try import legacy images
  if (shopResult.shop) {
    var legacyForGallery = getLegacyRecordForScalableFallback_({
      legacyBackendId: shopResult.shop.LegacyBackendId,
      legacyLamproundId: shopResult.shop.LegacyLamproundID
    });
    if (legacyForGallery) {
      importLegacyImagesToGallery_(shopResult.shop.ShopID, legacyForGallery, requested.token || null);
    }
    // Re-query with all IDs to pick up newly imported images + any existing UUID-keyed images
    var refreshPayload = { shopId: shopResult.shop.ShopID };
    if (legacyBackendId) refreshPayload.backendId = legacyBackendId;
    shopResult = getShopRecord(refreshPayload);
    return shopResult;
  }

  // Case 3: No Shops record — gallery may exist under the UUID key
  // If gallery already found via legacy ID, we can use it after upsert
  var existingGallery = shopResult.gallery || [];

  // Create a Shops record from legacy data
  var legacyRecord = getLegacyRecordForScalableFallback_(requested);
  if (!legacyRecord) {
    // No legacy data at all — return whatever we have
    if (existingGallery.length > 0) return shopResult;
    return { success: false, message: 'Shop not found and no legacy data available.' };
  }

  var upsertResult = upsertShopRecord({
    data: mapLegacyRecordToShopPayload_(legacyRecord, requested),
    token: requested.token || null,
    allowGuestPdf: true
  });
  if (!upsertResult || !upsertResult.success || !upsertResult.shopId) {
    return upsertResult || { success: false, message: 'Failed to create scalable shop record.' };
  }

  // Import legacy base64 images (if any) into gallery under the new SHOP-XXXXXX id
  importLegacyImagesToGallery_(upsertResult.shopId, legacyRecord, requested.token || null);

  // Re-query with BOTH the new shopId AND the legacy backendId so we find all gallery images
  var finalPayload = { shopId: upsertResult.shopId };
  if (legacyBackendId) finalPayload.backendId = legacyBackendId;
  return getShopRecord(finalPayload);
}

function isPdfSupportedImageBlob_(blob) {
  try {
    if (!blob || typeof blob.getBytes !== 'function') return false;

    const bytes = blob.getBytes();
    if (!bytes || bytes.length < 4) return false;
    const byteAt = function(index) {
      const value = Number(bytes[index]) || 0;
      return value < 0 ? value + 256 : value;
    };
    const isJpeg = byteAt(0) === 0xFF && byteAt(1) === 0xD8 && byteAt(2) === 0xFF;
    const isPng = bytes.length >= 8 && [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A].every(function(expected, index) {
      return byteAt(index) === expected;
    });
    const isGif = byteAt(0) === 0x47 && byteAt(1) === 0x49 && byteAt(2) === 0x46 && byteAt(3) === 0x38;
    return isJpeg || isPng || isGif;
  } catch (e) {
    return false;
  }
}

function fetchDriveImageBlob_(fileId) {
  const normalizedFileId = String(fileId || '').trim();
  if (!normalizedFileId) throw new Error('ไม่พบรหัสไฟล์ภาพ');

  try {
    const token = ScriptApp.getOAuthToken();
    const mediaUrl = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(normalizedFileId) + '?alt=media';
    const mediaRes = UrlFetchApp.fetch(mediaUrl, {
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });

    if (mediaRes.getResponseCode() === 200) {
      const mediaBlob = mediaRes.getBlob();
      if (isPdfSupportedImageBlob_(mediaBlob)) return mediaBlob;
    }

    const apiUrl = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(normalizedFileId) + '?fields=thumbnailLink';
    const res = UrlFetchApp.fetch(apiUrl, {
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      const metadata = JSON.parse(res.getContentText());
      if (metadata.thumbnailLink) {
        const thumbUrl = metadata.thumbnailLink.replace(/=s\d+$/, '=s1200');
        const thumbRes = UrlFetchApp.fetch(thumbUrl, { muteHttpExceptions: true });
        if (thumbRes.getResponseCode() === 200) {
          const thumbBlob = thumbRes.getBlob();
          if (isPdfSupportedImageBlob_(thumbBlob)) return thumbBlob;
        }
      }
    }
  } catch (e) {
    // Ignore completely and fallback
  }
  
  // Fallback: ดึงจากไฟล์ตรงๆ (อาจจะเกิดปัญหาขนาดใหญ่เกินหรือ WebP แล้วฝังใน PDF ไม่ได้)
  try {
    const file = DriveApp.getFileById(normalizedFileId);
    const fileBlob = file.getBlob();
    if (isPdfSupportedImageBlob_(fileBlob)) return fileBlob;
    try {
      const fileThumbnail = file.getThumbnail();
      if (isPdfSupportedImageBlob_(fileThumbnail)) return fileThumbnail;
    } catch (thumbnailError) {
      // Ignore thumbnail fallback errors and return the actionable error below.
    }
    throw new Error('ไฟล์ไม่ใช่รูปภาพที่รองรับสำหรับ PDF');
  } catch (e) {
    throw new Error('ไม่สามารถดึงภาพ (Fallback failed): ' + e.message);
  }
}

function getThaiDateText_(dateInput) {
  const date = dateInput ? new Date(dateInput) : new Date();
  const day = parseInt(Utilities.formatDate(date, DEFAULT_TIMEZONE, 'd'), 10);
  const monthIndex = parseInt(Utilities.formatDate(date, DEFAULT_TIMEZONE, 'M'), 10) - 1;
  const year = parseInt(Utilities.formatDate(date, DEFAULT_TIMEZONE, 'yyyy'), 10) + 543;
  const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'  ];
  return day + ' ' + months[monthIndex] + ' ' + year;
}

function chunkArray_(items, size) {
  const source = Array.isArray(items) ? items.slice() : [];
  const chunkSize = Math.max(1, Number(size) || 1);
  const chunks = [];
  for (let i = 0; i < source.length; i += chunkSize) {
    chunks.push(source.slice(i, i + chunkSize));
  }
  return chunks;
}

function styleText_(textElement, options) {
  if (!textElement) return;
  const opts = options || {};
  textElement.setFontFamily(opts.fontFamily || 'Sarabun');
  if (opts.fontSize) textElement.setFontSize(opts.fontSize);
  if (opts.bold != null) textElement.setBold(!!opts.bold);
  if (opts.color) textElement.setForegroundColor(opts.color);
}

function pdfDisplayValue_(value) {
  if (value == null) return 'ไม่ระบุ';
  const text = String(value).trim();
  return text || 'ไม่ระบุ';
}

function appendUniformPdfImage_(cell, blob, size) {
  if (!cell || !blob) return null;
  const pixel = Math.max(1, Number(size) || PDF_IMAGE_CELL_SIZE || 120);
  const image = cell.appendImage(blob);
  try {
    const sourceWidth = Number(image.getWidth()) || 0;
    const sourceHeight = Number(image.getHeight()) || 0;
    if (sourceWidth > 0 && sourceHeight > 0) {
      const scale = Math.min(pixel / sourceWidth, pixel / sourceHeight);
      image.setWidth(Math.max(1, Math.round(sourceWidth * scale)));
      image.setHeight(Math.max(1, Math.round(sourceHeight * scale)));
    } else {
      image.setWidth(pixel);
      image.setHeight(pixel);
    }
  } catch (e) {
    image.setWidth(pixel);
    image.setHeight(pixel);
  }
  return image;
}

function setPdfImageAltText_(image, title, description) {
  if (!image) return;
  const safeTitle = String(title || '').trim();
  const safeDescription = String(description || safeTitle).trim();
  if (!safeTitle && !safeDescription) return;
  try {
    if (typeof image.setAltTitle === 'function') {
      image.setAltTitle(safeTitle || safeDescription);
    }
    if (typeof image.setAltDescription === 'function') {
      image.setAltDescription(safeDescription || safeTitle);
    }
  } catch (e) {
    Logger.log('PDF image alt text skipped: ' + (e && e.message ? e.message : e));
  }
}

function setPdfMissingImageCell_(cell) {
  if (!cell) return;
  try {
    cell.setText('ไม่มีรูป');
    styleText_(cell.editAsText(), {
      fontSize: pdfCaptionFontSize,
      bold: false,
      color: pdfCaptionColor
    });
    const firstChild = cell.getNumChildren() > 0 ? cell.getChild(0) : null;
    if (firstChild && firstChild.getType && firstChild.getType() === DocumentApp.ElementType.PARAGRAPH) {
      firstChild.asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    }
  } catch (e) {
    Logger.log('PDF missing-image placeholder failed: ' + (e && e.message ? e.message : e));
  }
}

function getPdfGalleryImageSize_(columnCount) {
  const cols = Math.max(1, Number(columnCount) || 1);
  const cellWidth = pdfContentWidthPt / cols;
  const maxFit = Math.floor(cellWidth - (pdfGalleryCellPaddingPt * 2));
  return Math.max(96, Math.min(PDF_IMAGE_CELL_SIZE, maxFit));
}

function getPdfGalleryCaption_(item, products, fallbackIndex) {
  const galleryItem = item || {};
  const productList = Array.isArray(products) ? products : [];
  const productId = String(galleryItem.ProductID || galleryItem.productId || '').trim();
  const sortOrder = Number(galleryItem.SortOrder || galleryItem.sortOrder || 0) || 0;
  let matchedProduct = null;

  if (productId) {
    matchedProduct = productList.find(function(product) {
      return String(product && (product.ProductID || product.productId || '')).trim() === productId;
    }) || null;
  }
  if (!matchedProduct && sortOrder > 0) {
    matchedProduct = productList.find(function(product) {
      return (Number(product && (product.SortOrder || product.sortOrder || 0)) || 0) === sortOrder;
    }) || null;
  }
  if (!matchedProduct && productList.length === 1) {
    matchedProduct = productList[0];
  }

  const productName = String(matchedProduct && (matchedProduct.ProductName || matchedProduct.productName || matchedProduct.name) || '').trim();
  const productOrder = Number(matchedProduct && (matchedProduct.SortOrder || matchedProduct.sortOrder || 0)) || sortOrder || (Number(fallbackIndex) + 1);
  if (productName) return 'สินค้า ' + productOrder + ': ' + productName;

  const displayName = String(galleryItem.DisplayName || '').trim().replace(/\.[^.]+$/, '');
  if (displayName && !/^product-\d+$/i.test(displayName) && !/^\d{6,}$/.test(displayName) && !/^[A-Za-z0-9_-]{24,}$/.test(displayName)) {
    return displayName;
  }
  return 'รูปสินค้า ลำดับที่ ' + productOrder;
}

function trimUnusedPdfGalleryCells_(table, rowCount, columnCount, itemCount) {
  if (!table || !rowCount || !columnCount || !itemCount) return;
  const usedInLastRow = itemCount % columnCount || columnCount;
  if (usedInLastRow >= columnCount) return;
  const lastRow = table.getRow(rowCount - 1);
  for (let colIndex = columnCount - 1; colIndex >= usedInLastRow; colIndex--) {
    if (lastRow.getNumCells() > usedInLastRow) lastRow.removeCell(colIndex);
  }
}

function appendSectionHeading_(body, title, backgroundColor) {
  const heading = body.appendParagraph(title);
  heading.setAlignment(DocumentApp.HorizontalAlignment.LEFT);
  heading.setSpacingBefore(9);
  heading.setSpacingAfter(4);
  styleText_(heading.editAsText(), {
    fontSize: pdfSectionHeadingFontSize,
    bold: true,
    color: '#0f172a'
  });
  return heading;
}

function styleLabelValueTable_(table, labelBgColor) {
  if (!table) return;
  table.setBorderWidth(pdfTableBorderWidthPt);
  table.setBorderColor(pdfTableBorderColor);
  pdfLabelValueColumnWidthsPt.forEach(function(width, columnIndex) {
    table.setColumnWidth(columnIndex, width);
  });
  for (let rowIndex = 0; rowIndex < table.getNumRows(); rowIndex++) {
    const labelCell = table.getCell(rowIndex, 0);
    const valueCell = table.getCell(rowIndex, 1);
    if (labelCell) {
      labelCell.setBackgroundColor(labelBgColor || pdfLabelBackgroundColor);
      labelCell.setVerticalAlignment(DocumentApp.VerticalAlignment.TOP);
      labelCell.setPaddingTop(4.5);
      labelCell.setPaddingBottom(4.5);
      labelCell.setPaddingLeft(6);
      labelCell.setPaddingRight(6);
      styleText_(labelCell.editAsText(), {
        fontSize: pdfTableFontSize,
        bold: true,
        color: '#334155'
      });
      const labelParagraph = labelCell.getNumChildren() > 0 ? labelCell.getChild(0) : null;
      if (labelParagraph && labelParagraph.getType && labelParagraph.getType() === DocumentApp.ElementType.PARAGRAPH) {
        labelParagraph.asParagraph().setAlignment(DocumentApp.HorizontalAlignment.LEFT);
      }
    }
    if (valueCell) {
      valueCell.setBackgroundColor('#ffffff');
      valueCell.setVerticalAlignment(DocumentApp.VerticalAlignment.TOP);
      valueCell.setPaddingTop(4.5);
      valueCell.setPaddingBottom(4.5);
      valueCell.setPaddingLeft(6);
      valueCell.setPaddingRight(6);
      styleText_(valueCell.editAsText(), {
        fontSize: pdfTableFontSize,
        bold: false,
        color: '#111827'
      });
      const valueParagraph = valueCell.getNumChildren() > 0 ? valueCell.getChild(0) : null;
      if (valueParagraph && valueParagraph.getType && valueParagraph.getType() === DocumentApp.ElementType.PARAGRAPH) {
        valueParagraph.asParagraph().setAlignment(DocumentApp.HorizontalAlignment.LEFT);
      }
    }
  }
}

function styleProductTable_(table) {
  if (!table) return;
  table.setBorderWidth(pdfTableBorderWidthPt);
  table.setBorderColor(pdfTableBorderColor);
  pdfProductColumnWidthsPt.forEach(function(width, columnIndex) {
    table.setColumnWidth(columnIndex, width);
  });
  for (let rowIndex = 0; rowIndex < table.getNumRows(); rowIndex++) {
    for (let colIndex = 0; colIndex < table.getRow(rowIndex).getNumCells(); colIndex++) {
      const cell = table.getCell(rowIndex, colIndex);
      if (!cell) continue;
      cell.setBackgroundColor(rowIndex === 0 ? pdfTableHeaderColor : '#ffffff');
      cell.setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
      cell.setPaddingTop(4);
      cell.setPaddingBottom(4);
      cell.setPaddingLeft(5);
      cell.setPaddingRight(5);
      styleText_(cell.editAsText(), {
        fontSize: pdfTableFontSize,
        bold: rowIndex === 0,
        color: '#111827'
      });
      const child = cell.getNumChildren() > 0 ? cell.getChild(0) : null;
      if (child && child.getType && child.getType() === DocumentApp.ElementType.PARAGRAPH) {
        const paragraph = child.asParagraph();
        if (rowIndex === 0 || colIndex === 0 || colIndex === 1) {
          paragraph.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
        } else if (colIndex === 4) {
          paragraph.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
        }
      }
    }
  }
}

function getGalleryGridConfig_(count) {
  const safeCount = Math.max(1, Number(count) || 1);
  if (safeCount <= 3) return { rows: 1, cols: safeCount, slots: safeCount };
  if (safeCount <= 4) return { rows: 2, cols: 2, slots: 4 };
  if (safeCount <= 6) {
    const rows = Math.ceil(safeCount / 2);
    return { rows: rows, cols: 2, slots: rows * 2 };
  }
  return { rows: 3, cols: 3, slots: 9 };
}

function normalizeGalleryRoleForPdf_(role) {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'gallery') return 'product';
  if (normalized === 'shop' || normalized === 'product' || normalized === 'activity') return normalized;
  return 'activity';
}

function groupGalleryByRoleForPdf_(gallery) {
  const grouped = {
    shop: [],
    product: [],
    activity: []
  };
  const items = Array.isArray(gallery) ? gallery : [];
  items.forEach(function(item) {
    if (!item) return;
    const role = normalizeGalleryRoleForPdf_(item.ImageRole || item.imageRole);
    grouped[role].push(item);
  });
  return grouped;
}

function styleGalleryTable_(table, rows, cols) {
  if (!table) return;
  table.setBorderWidth(pdfTableBorderWidthPt);
  table.setBorderColor(pdfTableBorderColor);
  const safeCols = Math.max(1, Number(cols) || 1);
  const columnWidth = pdfContentWidthPt / safeCols;
  for (let colIndex = 0; colIndex < safeCols; colIndex++) {
    table.setColumnWidth(colIndex, columnWidth);
  }
  for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
    for (let colIndex = 0; colIndex < cols; colIndex++) {
      const cell = table.getCell(rowIndex, colIndex);
      if (!cell) continue;
      cell.setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
      cell.setBackgroundColor('#ffffff');
      cell.setPaddingTop(pdfGalleryCellPaddingPt);
      cell.setPaddingBottom(pdfGalleryCellPaddingPt);
      cell.setPaddingLeft(pdfGalleryCellPaddingPt);
      cell.setPaddingRight(pdfGalleryCellPaddingPt);
      styleText_(cell.editAsText(), {
        fontSize: pdfCaptionFontSize,
        bold: false,
        color: pdfCaptionColor
      });
      const child = cell.getNumChildren() > 0 ? cell.getChild(0) : null;
      if (child && child.getType && child.getType() === DocumentApp.ElementType.PARAGRAPH) {
        child.asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      }
    }
  }
}

function insertGalleryGridPage_(parent, insertIndex, sectionTitle, pageItems, config, isContinuation) {
  appendSectionHeading_(parent, isContinuation ? (sectionTitle + ' (ต่อ)') : sectionTitle);
  insertIndex += 1;

  const cols = config.cols || 2;
  const neededRows = Math.max(1, Math.ceil(pageItems.length / cols));
  const rows = [];
  for (let r = 0; r < neededRows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) row.push('');
    rows.push(row);
  }

  const pageTable = parent.insertTable(insertIndex, rows);
  styleGalleryTable_(pageTable, neededRows, cols);
  trimUnusedPdfGalleryCells_(pageTable, neededRows, cols, pageItems.length);
  insertIndex += 1;

  for (let slot = 0; slot < pageItems.length; slot++) {
    const rowIndex = Math.floor(slot / cols);
    const colIndex = slot % cols;
    const cell = pageTable.getCell(rowIndex, colIndex);
    const validObj = pageItems[slot];
    if (!validObj) {
      cell.setText('');
      continue;
    }

    try {
      cell.setText('');
      const image = appendUniformPdfImage_(cell, validObj.blob, getPdfGalleryImageSize_(cols));
      const imageParent = image.getParent();
      if (imageParent && imageParent.getType() === DocumentApp.ElementType.PARAGRAPH) {
        imageParent.asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      }
      const captionText = getPdfGalleryCaption_(validObj.item, [], slot);
      setPdfImageAltText_(image, captionText, captionText);
      const caption = cell.appendParagraph(captionText);
      caption.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      styleText_(caption.editAsText(), {
        fontSize: pdfCaptionFontSize,
        bold: false,
        color: pdfCaptionColor
      });
    } catch (e) {
      cell.setText('');
    }
  }

  return insertIndex;
}

function insertGallerySection_(parent, insertIndex, sectionTitle, items) {
  const safeItems = Array.isArray(items) ? items : [];
  appendSectionHeading_(parent, sectionTitle);
  insertIndex += 1;

  if (!safeItems.length) {
    const emptyNote = parent.insertParagraph(insertIndex, 'ไม่มีรูปข้อมูล');
    emptyNote.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    emptyNote.setSpacingBefore(6);
    emptyNote.setSpacingAfter(6);
    styleText_(emptyNote.editAsText(), {
      fontSize: 10,
      bold: false,
      color: pdfCaptionColor
    });
    return insertIndex + 1;
  }

  const config = getGalleryGridConfig_(safeItems.length);
  const pages = chunkArray_(safeItems, config.slots);
  let nextIndex = insertIndex;

  pages.forEach(function(pageItems, pageIndex) {
    if (pageIndex === 0) {
      const cols = config.cols || 2;
      const neededRows = Math.max(1, Math.ceil(pageItems.length / cols));
      const rows = [];
      for (let r = 0; r < neededRows; r++) {
        const row = [];
        for (let c = 0; c < cols; c++) row.push('');
        rows.push(row);
      }
      const pageTable = parent.insertTable(nextIndex, rows);
      styleGalleryTable_(pageTable, neededRows, cols);
      trimUnusedPdfGalleryCells_(pageTable, neededRows, cols, pageItems.length);
      nextIndex += 1;

      for (let slot = 0; slot < pageItems.length; slot++) {
        const rowIndex = Math.floor(slot / cols);
        const colIndex = slot % cols;
        const cell = pageTable.getCell(rowIndex, colIndex);
        const validObj = pageItems[slot];
        if (!validObj) {
          cell.setText('');
          continue;
        }

        try {
          cell.setText('');
          const image = appendUniformPdfImage_(cell, validObj.blob, getPdfGalleryImageSize_(cols));
          const imageParent = image.getParent();
          if (imageParent && imageParent.getType() === DocumentApp.ElementType.PARAGRAPH) {
            imageParent.asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
          }
          const captionText = getPdfGalleryCaption_(validObj.item, [], slot);
          setPdfImageAltText_(image, captionText, captionText);
          const caption = cell.appendParagraph(captionText);
          caption.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
          styleText_(caption.editAsText(), {
            fontSize: pdfCaptionFontSize,
            bold: false,
            color: pdfCaptionColor
          });
        } catch (e) {
          cell.setText('');
        }
      }
      return;
    }

    parent.insertPageBreak(nextIndex);
    nextIndex += 1;
    nextIndex = insertGalleryGridPage_(parent, nextIndex, sectionTitle, pageItems, config, true);
  });

  return nextIndex;
}

function replaceProductsTable_(body, products, gallery) {
  const found = body.findText('{{ProductsTable}}');
  if (!found) return;
  const element = found.getElement();
  element.setText('');
  const paragraph = element.getParent().asParagraph();
  const parent = paragraph.getParent();
  const childIndex = parent.getChildIndex(paragraph);
  const normalizedProducts = Array.isArray(products) ? products.map(function(product) {
    return {
      id: String(product && (product.ProductID || product.productId || '')).trim(),
      order: Number(product && (product.SortOrder || product.sortOrder || 0)) || 0,
      name: String(product && (product.ProductName || product.productName || '')).trim(),
      category: String(product && (product.ProductCategory || product.productCategory || '')).trim(),
      description: String(product && (product.Description || product.description || '')).trim(),
      price: String(product && (product.Price || product.price || '')).trim(),
      unit: String(product && (product.Unit || product.unit || '')).trim()
    };
  }).filter(function(product) {
    return product.name || product.category || product.description || product.price;
  }).sort(function(a, b) {
    return (a.order || 0) - (b.order || 0);
  }) : [];

  if (!normalizedProducts.length) {
    const emptyNote = parent.insertParagraph(childIndex, 'ไม่มีข้อมูลสินค้า');
    emptyNote.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    emptyNote.setSpacingBefore(4);
    emptyNote.setSpacingAfter(4);
    styleText_(emptyNote.editAsText(), {
      fontSize: 10,
      bold: false,
      color: pdfCaptionColor
    });
    paragraph.removeFromParent();
    return;
  }

  paragraph.removeFromParent();

  // If products exist, insert page break before product section to start on a clean page and prevent table rows/images splitting across pages
  let insertIndex = childIndex;
  let pageBreakIndex = childIndex;
  if (childIndex > 0) {
    const prevChild = parent.getChild(childIndex - 1);
    if (prevChild && prevChild.asText) {
      const prevText = prevChild.asText().getText();
      if (prevText.indexOf('สรุปรายการสินค้า') !== -1 || prevText.indexOf('\u0e2a\u0e23\u0e38\u0e1b\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32') !== -1) {
        pageBreakIndex = childIndex - 1;
      }
    }
  }
  parent.insertPageBreak(pageBreakIndex);
  insertIndex = childIndex + 1;

  // Build product image map: first by ProductID, then collect unmatched product-role items as fallback
  const productImages = {};
  const fallbackProductFileIds = [];
  if (Array.isArray(gallery)) {
    gallery.forEach(function(g) {
      if (!g.DriveFileId) return;
      if (g.ProductID) {
        var key = String(g.ProductID || '').trim();
        if (key && !productImages[key]) {
          try {
            productImages[key] = fetchDriveImageBlob_(g.DriveFileId);
          } catch (e) {
            Logger.log('PDF product image fetch: ' + JSON.stringify({
              productId: key,
              matchedDriveFileId: String(g.DriveFileId || '').trim(),
              hasBlob: false,
              renderStatus: 'ERROR',
              error: e && e.message ? e.message : String(e)
            }));
          }
        }
      } else {
        const role = String(g.ImageRole || '').toLowerCase();
        if (role === 'product' || role === 'gallery') {
          fallbackProductFileIds.push(g.DriveFileId);
        }
      }
    });
  }

  // Pre-resolve blobs per product (by index) using fallback if no ProductID match
  var fallbackCursor = 0;
  const productBlobArray = normalizedProducts.map(function(p, productIndex) {
    var productKey = String(p.id || '').trim();
    if (productKey && productImages[productKey]) return productImages[productKey];
    if (fallbackCursor < fallbackProductFileIds.length) {
      var blob = null;
      var fallbackFileId = String(fallbackProductFileIds[fallbackCursor] || '').trim();
      try {
        blob = fetchDriveImageBlob_(fallbackFileId);
      } catch (e) {
        Logger.log('PDF product image fetch: ' + JSON.stringify({
          productIndex: productIndex,
          productId: p.id,
          productName: p.name,
          matchedDriveFileId: fallbackFileId,
          hasBlob: false,
          renderStatus: 'ERROR',
          error: e && e.message ? e.message : String(e)
        }));
      }
      fallbackCursor++;
      return blob;
    }
    return null;
  });

  const maxRowsPerTable = 6;
  const chunks = chunkArray_(normalizedProducts, maxRowsPerTable);

  chunks.forEach(function(chunk, chunkIndex) {
    if (chunkIndex > 0) {
      parent.insertPageBreak(insertIndex);
      insertIndex += 1;
    }

    const rows = [['ลำดับ', 'รูปภาพ', 'ชื่อสินค้า', 'หมวดหมู่', 'ราคา', 'รายละเอียด']];
    chunk.forEach(function(product, index) {
      rows.push([
        String(product.order || (chunkIndex * maxRowsPerTable + index + 1)),
        '',
        pdfDisplayValue_(product.name),
        pdfDisplayValue_(product.category),
        pdfDisplayValue_(product.price ? product.price + (product.unit ? ' ' + product.unit : '') : ''),
        pdfDisplayValue_(product.description)
      ]);
    });

    const table = parent.insertTable(insertIndex, rows);
    styleProductTable_(table);

    // Insert images into column 1, one row per product
    for (let r = 1; r <= chunk.length; r++) {
      const globalIdx = chunkIndex * maxRowsPerTable + (r - 1);
      const product = chunk[r - 1];
      const cell = table.getCell(r, 1);
      cell.setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
      cell.setPaddingTop(6);
      cell.setPaddingBottom(6);
      cell.setPaddingLeft(6);
      cell.setPaddingRight(6);
      table.getRow(r).setMinimumHeight(PDF_PRODUCT_TABLE_IMAGE_MAX_SIZE + 12);
      const imgBlob = productBlobArray[globalIdx] || null;
      if (imgBlob) {
        let image = null;
        try {
          cell.setText('');
          image = appendUniformPdfImage_(cell, imgBlob, PDF_PRODUCT_TABLE_IMAGE_MAX_SIZE);
          if (!image) throw new Error('PDF image append returned no image');
        } catch (e) {
          Logger.log('PDF product image: ' + JSON.stringify({
            productIndex: globalIdx,
            productId: product.id,
            productName: product.name,
            hasBlob: true,
            renderStatus: 'ERROR',
            error: e && e.message ? e.message : String(e)
          }));
          setPdfMissingImageCell_(cell);
          continue;
        }

        try {
          const imageLabel = product.name
            ? 'ภาพสินค้า: ' + product.name
            : 'ภาพสินค้า ลำดับที่ ' + (product.order || (chunkIndex * maxRowsPerTable + r));
          setPdfImageAltText_(image, imageLabel, imageLabel);
          const imageParent = image.getParent();
          if (imageParent && imageParent.getType && imageParent.getType() === DocumentApp.ElementType.PARAGRAPH) {
            imageParent.asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
          }
          Logger.log('PDF product image: ' + JSON.stringify({
            productIndex: globalIdx,
            productId: product.id,
            productName: product.name,
            hasBlob: true,
            renderStatus: 'IMAGE'
          }));
        } catch (e) {
          Logger.log('PDF product image metadata skipped: ' + (e && e.message ? e.message : e));
        }
      } else {
        Logger.log('PDF product image: ' + JSON.stringify({
          productIndex: globalIdx,
          productId: product.id,
          productName: product.name,
          hasBlob: false,
          renderStatus: 'MISSING'
        }));
        setPdfMissingImageCell_(cell);
      }
    }

    insertIndex += 1;
  });
}

function buildTemplatePlaceholders_(shop, products, gallery) {
  return {
    '{{BusinessName}}': pdfDisplayValue_(shop.BusinessName),
    '{{OwnerName}}': pdfDisplayValue_(shop.OwnerName),
    '{{Phone}}': pdfDisplayValue_(normalizePhoneValue(shop.Phone || '')),
    '{{LineID}}': pdfDisplayValue_(shop.LineID),
    '{{Facebook}}': pdfDisplayValue_(shop.Facebook),
    '{{Website}}': pdfDisplayValue_(shop.Website),
    '{{LocationText}}': pdfDisplayValue_(shop.LocationText),
    '{{ShopHistory}}': pdfDisplayValue_(shop.ShopHistory || shop.shop_history),
    '{{BusinessType}}': pdfDisplayValue_(shop.BusinessType),
    '{{ProductCategory}}': pdfDisplayValue_(parseJsonArray_(shop.ProductCategory).join(', ')),
    '{{BusinessLevel}}': pdfDisplayValue_(shop.BusinessLevel),
    '{{SalesChannel}}': pdfDisplayValue_(parseJsonArray_(shop.SalesChannel).join(', ')),
    '{{AvgPrice}}': pdfDisplayValue_(shop.AvgPrice),
    '{{BusinessStatus}}': pdfDisplayValue_(shop.BusinessStatus),
    '{{PotentialLevel}}': pdfDisplayValue_(shop.PotentialLevel),
    '{{ProductCount}}': String(products.length),
    '{{GalleryCount}}': String(gallery.length),
    '{{ReportDateTH}}': pdfDisplayValue_(getThaiDateText_(new Date())),
    '{{CreatedAtTH}}': pdfDisplayValue_(shop.CreatedAt ? getThaiDateText_(shop.CreatedAt) : '')
  };
}

function exportCleanExcelFile(payload) {
  try {
    setupSystem();
    const props = PropertiesService.getScriptProperties();
    const spreadsheetId = props.getProperty(SCRIPT_PROPERTY_KEYS.spreadsheetId);
    if (!spreadsheetId) {
      return { success: false, message: 'ไม่พบ Spreadsheet ฐานข้อมูล' };
    }

    const ss = SpreadsheetApp.openById(spreadsheetId);
    const dataSheet = ss.getSheetByName(SHEET_NAME);
    if (!dataSheet) {
      return { success: false, message: 'ไม่พบชีตข้อมูล' };
    }

    const data = dataSheet.getDataRange().getValues();
    if (data.length <= 1) {
      return { success: false, message: 'ไม่มีข้อมูลสำหรับส่งออก' };
    }

    const headers = data[0];
    const headerMap = {};
    headers.forEach((h, i) => { headerMap[String(h).trim()] = i; });

    const filterIds = (payload && Array.isArray(payload.recordIds) && payload.recordIds.length > 0)
      ? new Set(payload.recordIds.map(String))
      : null;

    const rowsToExport = [];
    let seq = 1;

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const isDeleted = headerMap['IsDeleted'] !== undefined ? row[headerMap['IsDeleted']] : false;
      if (isDeleted === true || isDeleted === 'TRUE' || isDeleted === 'true' || isDeleted === 1) {
        continue;
      }

      const backendId = String(row[headerMap['BackendId']] || row[headerMap['ShopID']] || '');
      if (filterIds && !filterIds.has(backendId)) {
        continue;
      }

      const lamproundId = String(row[headerMap['LamproundID']] || row[headerMap['ShopID']] || '');
      const businessName = String(row[headerMap['BusinessName']] || '');
      const ownerName = String(row[headerMap['OwnerName']] || '');
      
      let rawPhone = row[headerMap['Phone']] !== undefined ? String(row[headerMap['Phone']]).trim() : '';
      let phone = normalizePhoneValue(rawPhone) || rawPhone || '-';

      const lineId = row[headerMap['LineID']] ? String(row[headerMap['LineID']]).trim() : '';
      const facebook = row[headerMap['Facebook']] ? String(row[headerMap['Facebook']]).trim() : '';
      const website = row[headerMap['Website']] ? String(row[headerMap['Website']]).trim() : '';

      const socialParts = [];
      if (lineId && lineId !== '-') socialParts.push('Line: ' + lineId);
      if (facebook && facebook !== '-') socialParts.push('FB: ' + facebook);
      if (website && website !== '-') socialParts.push('Web: ' + website);
      const contactInfo = socialParts.length > 0 ? socialParts.join('\n') : '-';

      const locationText = String(row[headerMap['LocationText']] || '-');
      const businessType = String(row[headerMap['BusinessType']] || '-');
      
      let avgPrice = row[headerMap['AvgPrice']] !== undefined && row[headerMap['AvgPrice']] !== null ? String(row[headerMap['AvgPrice']]).trim() : '';
      if (!avgPrice) avgPrice = '-';

      let salesChannel = row[headerMap['SalesChannel']] || '';
      try {
        if (typeof salesChannel === 'string' && salesChannel.startsWith('[')) {
          salesChannel = JSON.parse(salesChannel).join(', ');
        }
      } catch(e) {}
      if (!salesChannel) salesChannel = '-';

      rowsToExport.push([
        seq++,
        businessName,
        ownerName,
        phone,
        contactInfo,
        locationText,
        avgPrice,
        salesChannel
      ]);
    }

    if (rowsToExport.length === 0) {
      return { success: false, message: 'ไม่พบรายการข้อมูลที่ตรงกับเงื่อนไข' };
    }

    // Create a clean temporary spreadsheet
    const tempFileName = 'Lampang_Pround_Export_' + Utilities.formatDate(new Date(), DEFAULT_TIMEZONE, 'yyyyMMdd_HHmmss');
    const tempSS = SpreadsheetApp.create(tempFileName);
    const tempSheet = tempSS.getActiveSheet();
    tempSheet.setName('ข้อมูลผู้ประกอบการ');

    const cleanHeaders = [
      'ลำดับ',
      'ชื่อร้านค้า',
      'ชื่อเจ้าของ',
      'เบอร์โทร',
      'ช่องทางติดต่อ',
      'ที่อยู่',
      'ราคาเฉลี่ย',
      'ช่องทางจำหน่าย'
    ];

    const allSheetData = [cleanHeaders, ...rowsToExport];
    const range = tempSheet.getRange(1, 1, allSheetData.length, cleanHeaders.length);
    
    // Set text format on Phone to prevent formatting issues
    tempSheet.getRange(2, 4, rowsToExport.length, 1).setNumberFormat('@');

    range.setValues(allSheetData);

    // Style Header Row
    const headerRange = tempSheet.getRange(1, 1, 1, cleanHeaders.length);
    headerRange.setBackground('#1e40af');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');
    headerRange.setVerticalAlignment('middle');
    headerRange.setFontFamily('Sarabun');
    headerRange.setFontSize(10);
    headerRange.setWrap(true);
    tempSheet.setRowHeight(1, 30);

    // Style Data Rows
    const dataRange = tempSheet.getRange(2, 1, rowsToExport.length, cleanHeaders.length);
    dataRange.setFontFamily('Sarabun');
    dataRange.setFontSize(9);
    dataRange.setVerticalAlignment('middle');
    dataRange.setWrap(true);

    // Set borders
    range.setBorder(true, true, true, true, true, true, '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID);

    // Alignment
    tempSheet.getRange(2, 1, rowsToExport.length, 1).setHorizontalAlignment('center'); // ลำดับ
    tempSheet.getRange(2, 4, rowsToExport.length, 1).setHorizontalAlignment('center'); // เบอร์โทร
    tempSheet.getRange(2, 7, rowsToExport.length, 1).setHorizontalAlignment('center'); // ราคาเฉลี่ย

    // Column widths tailored for 1-page A4 Landscape (Total ~875px)
    const colWidths = [48, 150, 110, 90, 125, 172, 75, 105];
    colWidths.forEach((w, colIdx) => {
      tempSheet.setColumnWidth(colIdx + 1, w);
    });

    SpreadsheetApp.flush();

    const tempFileId = tempSS.getId();
    const exportUrl = 'https://docs.google.com/spreadsheets/d/' + tempFileId + '/export?format=xlsx';

    return {
      success: true,
      url: exportUrl,
      fileName: tempFileName + '.xlsx',
      count: rowsToExport.length
    };
  } catch (e) {
    Logger.log('Excel export error: ' + e.message);
    return { success: false, message: 'ส่งออก Excel ไม่สำเร็จ: ' + e.message };
  }
}

function resolveMapLocationUrl(payloadOrUrl) {
  try {
    var rawUrl = '';
    if (typeof payloadOrUrl === 'string') {
      rawUrl = payloadOrUrl.trim();
    } else if (payloadOrUrl && typeof payloadOrUrl === 'object') {
      rawUrl = String(payloadOrUrl.url || payloadOrUrl.map_url || payloadOrUrl.location || '').trim();
    }
    if (!rawUrl) {
      return { success: false, message: 'URL หรือข้อมูลตำแหน่งว่างเปล่า' };
    }

    // 1. Direct coordinates check
    var directAt = rawUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (directAt) {
      return { success: true, lat: parseFloat(directAt[1]).toFixed(6), lng: parseFloat(directAt[2]).toFixed(6) };
    }
    var directQ = rawUrl.match(/[?&](?:q|query|ll|loc|destination)=(-?\d+\.\d+)(?:%2C|,|%20|\+)(-?\d+\.\d+)/i);
    if (directQ) {
      return { success: true, lat: parseFloat(directQ[1]).toFixed(6), lng: parseFloat(directQ[2]).toFixed(6) };
    }
    var directCoords = rawUrl.match(/^(-?\d{1,2}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)$/);
    if (directCoords) {
      var latNum = parseFloat(directCoords[1]);
      var lngNum = parseFloat(directCoords[2]);
      if (!isNaN(latNum) && !isNaN(lngNum) && latNum >= -90 && latNum <= 90 && lngNum >= -180 && lngNum <= 180) {
        return { success: true, lat: latNum.toFixed(6), lng: lngNum.toFixed(6) };
      }
    }

    if (!/^https?:\/\//i.test(rawUrl)) {
      var geo = Maps.newGeocoder().geocode(rawUrl);
      if (geo && geo.status === 'OK' && geo.results && geo.results.length > 0) {
        var loc = geo.results[0].geometry.location;
        return {
          success: true,
          lat: loc.lat.toFixed(6),
          lng: loc.lng.toFixed(6),
          address: geo.results[0].formatted_address || rawUrl
        };
      }
      return { success: false, message: 'ไม่พบพิกัดจากข้อมูลที่ระบุ' };
    }

    // 2. Fetch redirect / short URL
    var resp = UrlFetchApp.fetch(rawUrl, {
      followRedirects: true,
      muteHttpExceptions: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    var headers = resp.getAllHeaders() || {};
    var finalLocation = headers['Location'] || headers['location'] || '';
    var contentText = resp.getContentText() || '';

    if (finalLocation) {
      var locAt = finalLocation.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (locAt) return { success: true, lat: parseFloat(locAt[1]).toFixed(6), lng: parseFloat(locAt[2]).toFixed(6) };
      var locQ = finalLocation.match(/[?&](?:q|query|ll|loc|destination)=(-?\d+\.\d+)(?:%2C|,|%20|\+)(-?\d+\.\d+)/i);
      if (locQ) return { success: true, lat: parseFloat(locQ[1]).toFixed(6), lng: parseFloat(locQ[2]).toFixed(6) };
    }

    var textAt = contentText.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (textAt) {
      return { success: true, lat: parseFloat(textAt[1]).toFixed(6), lng: parseFloat(textAt[2]).toFixed(6) };
    }

    var textPlace = contentText.match(/(?:place|dir)\/(-?\d+\.\d+)(?:%2C|,|%20|\+)(-?\d+\.\d+)/i);
    if (textPlace) {
      return { success: true, lat: parseFloat(textPlace[1]).toFixed(6), lng: parseFloat(textPlace[2]).toFixed(6) };
    }

    var jsonCoords = contentText.match(/\[null,null,(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)\]/);
    if (jsonCoords) {
      return { success: true, lat: parseFloat(jsonCoords[1]).toFixed(6), lng: parseFloat(jsonCoords[2]).toFixed(6) };
    }

    var searchQ = contentText.match(/href="\/search\?q=([^"&]+)/i) || contentText.match(/search\?q=([^"&]+)/i);
    var queryText = '';
    if (searchQ && searchQ[1]) {
      try { queryText = decodeURIComponent(searchQ[1].replace(/\+/g, ' ')); } catch (e) { queryText = searchQ[1]; }
    }

    if (queryText) {
      var geoRes = Maps.newGeocoder().geocode(queryText);
      if (geoRes && geoRes.status === 'OK' && geoRes.results && geoRes.results.length > 0) {
        var location = geoRes.results[0].geometry.location;
        return {
          success: true,
          lat: location.lat.toFixed(6),
          lng: location.lng.toFixed(6),
          address: geoRes.results[0].formatted_address || queryText
        };
      }
    }

    return { success: false, message: 'ไม่สามารถดึงพิกัดจากลิงก์นี้ได้ กรุณาระบุพิกัดหรือใช้ปุ่มดึงพิกัด GPS' };
  } catch (err) {
    return { success: false, message: 'เกิดข้อผิดพลาดในการดึงพิกัด: ' + err.message };
  }
}

function getExcelExportUrl(payload) {
  return exportCleanExcelFile(payload);
}
function setupTemplate() {
  try {
    setupSystem();
    const props = PropertiesService.getScriptProperties();
    const existingTemplateId = props.getProperty(SCRIPT_PROPERTY_KEYS.templateDocId);
    const layoutVersion = props.getProperty(SCRIPT_PROPERTY_KEYS.templateLayoutVersion);
    if (existingTemplateId && layoutVersion === pdfTemplateLayoutVersion) {
      return {
        success: true,
        templateDocId: existingTemplateId,
        templateUrl: 'https://docs.google.com/document/d/' + existingTemplateId + '/edit'
      };
    }

    const doc = DocumentApp.create(APP_NAME + ' Template');
    const body = doc.getBody();
    body.clear();
    body.setPageWidth(pdfPageWidthPt);
    body.setPageHeight(pdfPageHeightPt);
    body.setMarginTop(pdfPageMarginPt);
    body.setMarginBottom(pdfPageMarginPt);
    body.setMarginLeft(pdfPageMarginPt);
    body.setMarginRight(pdfPageMarginPt);
    body.setAttributes({
      [DocumentApp.Attribute.FONT_FAMILY]: 'Sarabun',
      [DocumentApp.Attribute.FONT_SIZE]: pdfTableFontSize
    });

    const headerTable = body.appendTable([
      ['\u0e23\u0e30\u0e1a\u0e1a\u0e10\u0e32\u0e19\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25 Lampang Pround'],
      ['\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e23\u0e49\u0e32\u0e19\u0e04\u0e49\u0e32'],
      ['\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48\u0e2d\u0e2d\u0e01\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19: {{ReportDateTH}}']
    ]);
    headerTable.setBorderWidth(0);
    for (let i = 0; i < headerTable.getNumRows(); i++) {
      const cell = headerTable.getCell(i, 0);
      cell.setBackgroundColor('#ffffff');
      cell.setPaddingTop(2);
      cell.setPaddingBottom(2);
      cell.setPaddingLeft(6);
      cell.setPaddingRight(6);
      const cellParagraph = cell.getNumChildren() > 0 ? cell.getChild(0) : null;
      if (cellParagraph && cellParagraph.getType && cellParagraph.getType() === DocumentApp.ElementType.PARAGRAPH) {
        cellParagraph.asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      }
      styleText_(cell.editAsText(), {
        fontSize: i === 0 ? pdfTitleFontSize : i === 1 ? pdfSubtitleFontSize : pdfDateFontSize,
        bold: true,
        color: '#111827'
      });
    }

    appendSectionHeading_(body, '\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e23\u0e49\u0e32\u0e19\u0e04\u0e49\u0e32\u0e41\u0e25\u0e30\u0e1b\u0e23\u0e30\u0e27\u0e31\u0e15\u0e34');
    const shopInfoTable = body.appendTable([
      ['\u0e0a\u0e37\u0e48\u0e2d\u0e23\u0e49\u0e32\u0e19', '{{BusinessName}}'],
      ['\u0e40\u0e08\u0e49\u0e32\u0e02\u0e2d\u0e07', '{{OwnerName}}'],
      ['\u0e40\u0e1a\u0e2d\u0e23\u0e4c\u0e42\u0e17\u0e23', '{{Phone}}'],
      ['Line ID', '{{LineID}}'],
      ['Facebook', '{{Facebook}}'],
      ['Website', '{{Website}}'],
      ['\u0e17\u0e35\u0e48\u0e2d\u0e22\u0e39\u0e48', '{{LocationText}}'],
      ['\u0e1b\u0e23\u0e30\u0e27\u0e31\u0e15\u0e34\u0e23\u0e49\u0e32\u0e19\u0e04\u0e49\u0e32', '{{ShopHistory}}']
    ]);
    styleLabelValueTable_(shopInfoTable);

    appendSectionHeading_(body, '\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e18\u0e38\u0e23\u0e01\u0e34\u0e08');
    const businessInfoTable = body.appendTable([
      ['\u0e1b\u0e23\u0e30\u0e40\u0e20\u0e17\u0e18\u0e38\u0e23\u0e01\u0e34\u0e08', '{{BusinessType}}'],
      ['\u0e2b\u0e21\u0e27\u0e14\u0e2b\u0e21\u0e39\u0e48\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32', '{{ProductCategory}}'],
      ['\u0e23\u0e30\u0e14\u0e31\u0e1a\u0e18\u0e38\u0e23\u0e01\u0e34\u0e08', '{{BusinessLevel}}'],
      ['\u0e2a\u0e16\u0e32\u0e19\u0e30\u0e18\u0e38\u0e23\u0e01\u0e34\u0e08', '{{BusinessStatus}}'],
      ['\u0e28\u0e31\u0e01\u0e22\u0e20\u0e32\u0e1e', '{{PotentialLevel}}'],
      ['\u0e0a\u0e48\u0e2d\u0e07\u0e17\u0e32\u0e07\u0e01\u0e32\u0e23\u0e02\u0e32\u0e22', '{{SalesChannel}}']
    ]);
    styleLabelValueTable_(businessInfoTable);

    appendSectionHeading_(body, '\u0e2a\u0e23\u0e38\u0e1b\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32');
    body.appendParagraph('{{ProductsTable}}');
    body.appendParagraph('{{GallerySections}}');

    props.setProperty(SCRIPT_PROPERTY_KEYS.templateDocId, doc.getId());
    props.setProperty(SCRIPT_PROPERTY_KEYS.templateLayoutVersion, pdfTemplateLayoutVersion);

    try {
      const targetFolder = DriveApp.getFolderById('1jcxn-PqwVH7PZuPkCtYZdUVtThG-LI07');
      const file = DriveApp.getFileById(doc.getId());
      file.moveTo(targetFolder);
    } catch (e) {
      Logger.log('Template move skipped: ' + e.message);
    }

    return {
      success: true,
      templateDocId: doc.getId(),
      templateUrl: doc.getUrl()
    };
  } catch (e) {
    var errMsg = e.message;
    Logger.log('PDF export failed in setupTemplate: ' + errMsg + '\n' + (e && e.stack ? e.stack : ''));
    if (errMsg.indexOf('DocumentApp') > -1 || errMsg.indexOf('https://www.googleapis.com/auth/documents') > -1) {
      return {
        success: false,
        message: 'ระบบต้องการสิทธิ์เพิ่มเติมเพื่อสร้าง PDF กรุณา Run setupTemplate อีกครั้ง'
      };
    }
    return { success: false, message: 'Failed to setup template: ' + errMsg };
  }
}

function renderGallerySectionsForPdf_(body, gallery, products) {
  const found = body.findText('{{GallerySections}}');
  if (found) {
    const element = found.getElement();
    element.setText('');
  }

  const normalizedGallery = Array.isArray(gallery) ? gallery.filter(function(item) {
    return item && item.DriveFileId;
  }) : [];
  const validGalleryItems = [];
  let skippedGalleryImageCount = 0;

  for (let index = 0; index < normalizedGallery.length; index++) {
    const item = normalizedGallery[index];
    try {
      validGalleryItems.push({
        item: item,
        blob: fetchDriveImageBlob_(item.DriveFileId)
      });
    } catch (e) {
      skippedGalleryImageCount++;
    }
  }

  if (skippedGalleryImageCount > 0) {
    Logger.log('PDF render-gallery skipped ' + skippedGalleryImageCount + ' of ' + normalizedGallery.length + ' unreadable image(s).');
  }

  const grouped = {
    shop: [],
    product: [],
    activity: []
  };
  validGalleryItems.forEach(function(entry) {
    const role = normalizeGalleryRoleForPdf_(entry.item && entry.item.ImageRole);
    grouped[role].push(entry);
  });

  [
    { key: 'product', title: 'รูปสินค้า/ผลิตภัณฑ์' }
  ].forEach(function(section, sectionIndex) {
    const items = grouped[section.key];
    if (!items || !items.length) return; // Do not create empty pages if no product photos

    const productCount = Array.isArray(products) ? products.length : 0;
    const needsDedicatedGalleryPage = !productCount || productCount > 6 || items.length > 4;
    if (needsDedicatedGalleryPage) body.appendPageBreak();
    appendSectionHeading_(body, section.title);

    const config = getGalleryGridConfig_(items.length);
    const pages = chunkArray_(items, config.slots);

    pages.forEach(function(pageItems, pageIndex) {
      if (pageIndex > 0) {
        body.appendPageBreak();
        appendSectionHeading_(body, section.title + ' (ต่อ)');
      }

      const cols = config.cols || 2;
      const neededRows = Math.max(1, Math.ceil(pageItems.length / cols));
      const rows = [];
      for (let r = 0; r < neededRows; r++) {
        const row = [];
        for (let c = 0; c < cols; c++) row.push('');
        rows.push(row);
      }

      const pageTable = body.appendTable(rows);
      styleGalleryTable_(pageTable, neededRows, cols);
      trimUnusedPdfGalleryCells_(pageTable, neededRows, cols, pageItems.length);

      for (let slot = 0; slot < pageItems.length; slot++) {
        const rowIndex = Math.floor(slot / cols);
        const colIndex = slot % cols;
        const cell = pageTable.getCell(rowIndex, colIndex);
        const validObj = pageItems[slot];
        if (!validObj) {
          cell.setText('');
          continue;
        }

        try {
          cell.setText('');
          const image = appendUniformPdfImage_(cell, validObj.blob, getPdfGalleryImageSize_(cols));
          const imageParent = image.getParent();
          if (imageParent && imageParent.getType() === DocumentApp.ElementType.PARAGRAPH) {
            imageParent.asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
          }
          const captionText = getPdfGalleryCaption_(validObj.item, products, (pageIndex * config.slots) + slot);
          setPdfImageAltText_(image, captionText, captionText);
          const caption = cell.appendParagraph(captionText);
          caption.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
          styleText_(caption.editAsText(), {
            fontSize: pdfCaptionFontSize,
            bold: false,
            color: pdfCaptionColor
          });
        } catch (e) {
          cell.setText('');
        }
      }
    });
  });
}

function markPdfTempFile_(file, tempTag) {
  if (!file) return;
  try {
    var tag = String(tempTag || '').trim();
    file.setDescription(PDF_TEMP_MARKER_PREFIX + (tag ? ':' + tag : ''));
  } catch (e) {
    // ignore marker error
  }
}

function isPdfTempFileSafeForCleanup_(file, tempTag) {
  if (!file) return false;
  var requiredTag = String(tempTag || '').trim();
  var desc = '';
  try {
    desc = String(file.getDescription() || '');
  } catch (e) {
    desc = '';
  }
  if (desc.indexOf(PDF_TEMP_MARKER_PREFIX) !== 0) return false;
  if (requiredTag && desc.indexOf(PDF_TEMP_MARKER_PREFIX + ':' + requiredTag) !== 0) return false;
  return true;
}

function trashPdfTempFileById_(fileId, tempTag) {
  var id = String(fileId || '').trim();
  if (!id) return false;
  try {
    var file = DriveApp.getFileById(id);
    if (!isPdfTempFileSafeForCleanup_(file, tempTag)) return false;
    file.setTrashed(true);
    return true;
  } catch (e) {
    return false;
  }
}

function cleanupTemporaryPdfFiles(payload) {
  try {
    const data = payload || {};
    ['pdfFileId', 'docFileId'].forEach(function(key) {
      const fileId = String(data[key] || '').trim();
      if (!fileId) return;
      trashPdfTempFileById_(fileId, data.tempTag || '');
    });
    return { success: true };
  } catch (e) {
    return { success: false, message: 'Failed to cleanup temporary files: ' + e.message };
  }
}

function exportShopPdf(payload) {
  var tempDocId = '';
  var tempPdfId = '';
  var tempTag = Utilities.getUuid();
  try {
    var stage = 'init';
    setupSystem();
    stage = 'setup-template';
    const templateResult = setupTemplate();
    if (!templateResult.success) return templateResult;
    const templateId = templateResult.templateDocId;
    const props = PropertiesService.getScriptProperties();

    var pdfPayload = Object.assign({}, payload || {});
    if (pdfPayload.backendId && !pdfPayload.legacyBackendId) {
      pdfPayload.legacyBackendId = pdfPayload.backendId;
    }

    stage = 'load-shop';
    const shopResult = ensureScalableShopRecordForPdf_(pdfPayload);
    // Only fail if there's an explicit error AND no shop was found
    if (!shopResult.success && !shopResult.shop) return shopResult;

    var shop = shopResult.shop;
    var products = shopResult.products || [];
    var gallery = shopResult.gallery || [];

    if (!shop) {
      var legacyForPdf = getLegacyRecordForScalableFallback_(pdfPayload);
      if (!legacyForPdf) {
        return { success: false, message: 'ไม่พบข้อมูลร้านค้าสำหรับสร้าง PDF' };
      }
      shop = legacyForPdf;
    }

    stage = 'prepare-folder';
    const pdfFolderId = props.getProperty(SCRIPT_PROPERTY_KEYS.pdfFolderId) || '1WmLBAt_eRWZIBIJM3ezXpBmcjdwNt8Qp';
    const pdfFolder = DriveApp.getFolderById(pdfFolderId);
    var tempFolderIter = pdfFolder.getFoldersByName('temp');
    var tempFolder = tempFolderIter.hasNext() ? tempFolderIter.next() : pdfFolder.createFolder('temp');
    const exportName = ((shop.BusinessName || shop.ShopID || 'shop-report') + ' - Report');
    stage = 'copy-template';
    const tempCopy = DriveApp.getFileById(templateId).makeCopy('[TEMP] ' + exportName + ' (Doc)', tempFolder);
    tempDocId = tempCopy.getId();
    markPdfTempFile_(tempCopy, tempTag);
    stage = 'open-doc';
    const doc = DocumentApp.openById(tempCopy.getId());
    const body = doc.getBody();
    const placeholders = buildTemplatePlaceholders_(shop, products, gallery);

    stage = 'replace-placeholders';
    Object.keys(placeholders).forEach(function(key) {
      body.replaceText(key.replace(/[{}]/g, '\\$&'), pdfDisplayValue_(placeholders[key]));
    });

    stage = 'render-products';
    replaceProductsTable_(body, products, gallery);
    stage = 'render-gallery';
    renderGallerySectionsForPdf_(body, gallery, products);
    stage = 'save-doc';
    doc.saveAndClose();

    stage = 'create-pdf';
    const pdfFile = tempFolder.createFile(tempCopy.getAs(MimeType.PDF).setName('[TEMP] ' + exportName + '.pdf'));
    tempPdfId = pdfFile.getId();
    markPdfTempFile_(pdfFile, tempTag);
    pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return {
      success: true,
      shopId: shop.ShopID || shop.BackendId || '',
      docFileId: tempDocId,
      pdfFileId: tempPdfId,
      tempTag: tempTag,
      pdfUrl: 'https://drive.google.com/uc?export=download&id=' + pdfFile.getId(),
      pdfViewUrl: pdfFile.getUrl(),
      pdfName: pdfFile.getName(),
      issuedAt: new Date().toISOString()
    };
  } catch (e) {
    if (tempPdfId) trashPdfTempFileById_(tempPdfId, tempTag);
    if (tempDocId) trashPdfTempFileById_(tempDocId, tempTag);
    var errMsg = e.message;
    if (errMsg.indexOf('DocumentApp') > -1 || errMsg.indexOf('https://www.googleapis.com/auth/documents') > -1) {
      return {
        success: false,
        message: 'ระบบปิดกั้นการสร้าง PDF เนื่องจากต้องการสิทธิ์ — กรุณากลับไปที่หน้าแก้ไขโค้ด Apps Script เลือกฟังก์ชัน "exportShopPdf" แล้วกด "เรียกใช้" (Run) เพื่ออนุญาต'
      };
    }
    return { success: false, message: 'Failed to export PDF [' + stage + ']: ' + errMsg };
  }
}

function getScalableArchitectureSummary() {
  return {
    architecture: {
      server: [
        'Apps Script handles sheet schema, Drive upload, Docs template merge, and PDF export.',
        'Each image upload is processed one file per request to avoid script timeout and stale UI state.'
      ],
      client: [
        'Frontend should create one upload queue per active view and call uploadGalleryImage() sequentially.',
        'Progress bar should reflect uploadedCount / totalCount, not sheet write completion of the main form.'
      ],
      storage: [
        'Shops stores business master data.',
        'Products stores repeatable product rows linked by ShopID.',
        'ShopGallery stores one row per image linked by ShopID and optional ProductID.'
      ]
    },
    workflow: [
      'User saves shop form -> upsertShopRecord() returns ShopID.',
      'Frontend uploads images asynchronously one file at a time -> uploadGalleryImage() stores file in Drive and metadata in ShopGallery.',
      'Detail modal loads shop + products + gallery via getShopRecord().',
      'PDF export loads template -> replaces placeholders -> fetches image blobs from Drive -> exports a final PDF file.'
    ],
    boundaries: {
      preservedLegacyFlow: 'Existing LamproundData / saveRecord / updateRecord / getRecordDetail remain unchanged.',
      newFlow: 'Scalable sheets and Drive-backed gallery run in parallel until frontend migration is complete.'
    }
  };
}
