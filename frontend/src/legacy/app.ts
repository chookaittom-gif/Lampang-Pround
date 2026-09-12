/**
 * Port ตรงจาก Code/javascript.html (5,641 บรรทัด) — ห้ามแก้ logic ในไฟล์นี้
 * นอกจากบล็อก window bindings ท้ายไฟล์ (เพิ่มโดย migration)
 * สถานะ TS: verbatim port ภายใต้ @ts-nocheck — แผนยกระดับ type ทีละโมดูล (ดู README)
 */
// @ts-nocheck

  // State
  let currentStep = 1;
  const totalSteps = 4;
  let recordsData = [];
  let filteredRecordsData = [];
  let listSearchQuery = '';
  let listAmphoeFilter = '';
  let _listExcelExportBusy = false;
  let currentPage = 1;
  let currentPageSize = getItemsPerPage();
  let deleteTargetIndex = null;
  let detailTargetIndex = null;
  let editTargetIndex = null;
  let _session = null;
  let _token = null;
  const AUTH_SESSION_DURATION_MS = 6 * 60 * 60 * 1000;
  const AUTH_TOKEN_STORAGE_KEY = '_lp_token';
  const AUTH_USER_STORAGE_KEY = '_lp_user';
  const AUTH_EXPIRES_AT_STORAGE_KEY = '_lp_expires_at';
  const AUTH_LOGIN_AT_STORAGE_KEY = '_lp_login_at';
  let _autoLogoutTimer = null;
  let _loginBusy = false;
  let _isEditing = false;
  let _isSaving = false;
  let currentProducts = [];
  let isProductListExpanded = false;
  let productVisibleCount = 0;
  let isEditProductListExpanded = false;
  let editProductVisibleCount = 0;
  let _isProductEditing = false;
  let _currentProductEditIndex = null;
  let editProducts = [];
  let _isEditProductEditing = false;
  let _currentEditProductEditIndex = null;
  var _productImageData = '';
  var _editProductImageData = '';
  var _editGalleryQueue = [];
  var _editGalleryExistingItems = [];
  var _editGalleryPendingDeleteIds = [];
  var _editGalleryShopId = '';
  var _editGalleryRequestToken = 0;
  var _editGalleryUploadBusy = false;
  var _editGalleryUploadTotal = 0;
  var _editGalleryUploadCompleted = 0;
  const FORM_DRAFT_KEY = '_lp_form_draft';
  const GUEST_SESSION_ACCESS_KEY = '_lp_guest_session_access';
  let _listRequestToken = 0;
  let _detailRequestToken = 0;
  let _editRequestToken = 0;
  let _lastSavedBackendId = '';
  let _guestAccessMemory = {};
  var _chartJsLoadPromise = null;
  var _dashboardRenderToken = 0;

  // ── Client cache (sessionStorage + in-memory fallback, TTL) ──
  var _lpClientCacheMem = { records: null, detail: {} };
  var LP_CACHE_TTL_MS = { records: 120000, detail: 120000 };
  var LP_CACHE_KEYS = { records: '_lp_client_cache_records_v1' };

  function _lpCacheHashSegment_(s) {
    var str = String(s || '');
    var h = 5381;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) + h) + str.charCodeAt(i);
      h |= 0;
    }
    return ('0000000' + (h >>> 0).toString(16)).slice(-8);
  }

  function _lpDetailCacheStorageKey_(backendId) {
    var id = String(backendId || '').trim();
    var t = String(_token || '');
    var g = String(getGuestSessionAccessKey(id) || '');
    return '_lp_client_cache_detail_v2_' + id + '_' + _lpCacheHashSegment_(t + '|' + g);
  }

  function _lpCacheReadRaw_(storageKey) {
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem) {
        return sessionStorage.getItem(storageKey);
      }
    } catch (e) { }
    return null;
  }

  function _lpCacheWriteRaw_(storageKey, raw) {
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage.setItem) {
        sessionStorage.setItem(storageKey, raw);
        return true;
      }
    } catch (e) { }
    return false;
  }

  function _lpCacheRemoveRaw_(storageKey) {
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage.removeItem) {
        sessionStorage.removeItem(storageKey);
      }
    } catch (e) { }
  }

  function lpClientCacheReadRecords() {
    var raw = _lpCacheReadRaw_(LP_CACHE_KEYS.records);
    if (!raw && _lpClientCacheMem.records && _lpClientCacheMem.records.raw) {
      raw = _lpClientCacheMem.records.raw;
    }
    if (!raw) return null;
    try {
      var o = JSON.parse(raw);
      if (!o || typeof o.exp !== 'number' || Date.now() > o.exp) return null;
      return Array.isArray(o.data) ? o.data : null;
    } catch (e) {
      return null;
    }
  }

  function lpClientCacheWriteRecords(dataArr) {
    var payload = { exp: Date.now() + LP_CACHE_TTL_MS.records, data: Array.isArray(dataArr) ? dataArr : [] };
    var raw = JSON.stringify(payload);
    if (!_lpCacheWriteRaw_(LP_CACHE_KEYS.records, raw)) {
      try { _lpClientCacheMem.records = { raw: raw }; } catch (e2) { }
    } else {
      _lpClientCacheMem.records = null;
    }
  }

  function lpClientCacheClearRecords() {
    _lpCacheRemoveRaw_(LP_CACHE_KEYS.records);
    _lpClientCacheMem.records = null;
  }

  function lpClientCacheReadDetail(backendId) {
    var key = _lpDetailCacheStorageKey_(backendId);
    var raw = _lpCacheReadRaw_(key);
    if (!raw && _lpClientCacheMem.detail[key]) {
      raw = _lpClientCacheMem.detail[key].raw;
    }
    if (!raw) return null;
    try {
      var o = JSON.parse(raw);
      if (!o || typeof o.exp !== 'number' || Date.now() > o.exp) return null;
      return o.data && typeof o.data === 'object' ? o.data : null;
    } catch (e) {
      return null;
    }
  }


  function lpClientCacheWriteDetail(backendId, responseObj) {
    var key = _lpDetailCacheStorageKey_(backendId);
    var payload = { exp: Date.now() + LP_CACHE_TTL_MS.detail, data: responseObj };
    var raw = JSON.stringify(payload);
    if (!_lpCacheWriteRaw_(key, raw)) {
      try { _lpClientCacheMem.detail[key] = { raw: raw }; } catch (e2) { }
    } else {
      try { delete _lpClientCacheMem.detail[key]; } catch (e3) { }
    }
  }

  function lpClientCacheClearDetail(backendId) {
    var key = _lpDetailCacheStorageKey_(backendId);
    _lpCacheRemoveRaw_(key);
    try { delete _lpClientCacheMem.detail[key]; } catch (e) { }
  }

  function lpClientCacheClearAllDetails() {
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage.key) {
        var toRemove = [];
        for (var i = 0; i < sessionStorage.length; i++) {
          var k = sessionStorage.key(i);
          if (k && k.indexOf('_lp_client_cache_detail_v2_') === 0) toRemove.push(k);
        }
        toRemove.forEach(function(k) { _lpCacheRemoveRaw_(k); });
      }
    } catch (e) { }
    _lpClientCacheMem.detail = {};
  }

  // ── Catalog Modal State ──
  var _catalogProducts = [];
  var _catalogGallery = [];
  var _catalogShopName = '';
  var _catalogSearchQuery = '';
  var _catalogCategory = '';
  var _catalogSortKey = 'default';
  var _catalogPage = 1;
  var _catalogPageSize = 12;

  // Initialization
  document.addEventListener('DOMContentLoaded', () => {
    updateStepUI();
    bindFormPersistence();
    restoreFormDraft();
    renderProductList();
    initAuth();
    if (!getDeepLinkParam_()) {
      loadRecords();
    }
  });

  // ========== AUTH ==========
  function clearAuthStorage() {
    try {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      localStorage.removeItem(AUTH_USER_STORAGE_KEY);
      localStorage.removeItem(AUTH_EXPIRES_AT_STORAGE_KEY);
      localStorage.removeItem(AUTH_LOGIN_AT_STORAGE_KEY);
    } catch (e) { }
    try {
      sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      sessionStorage.removeItem(AUTH_USER_STORAGE_KEY);
    } catch (e) { }
  }

  function scheduleAutoLogoutTimer(remainingMs) {
    if (_autoLogoutTimer) {
      clearTimeout(_autoLogoutTimer);
      _autoLogoutTimer = null;
    }
    if (!isAuthenticated()) return;
    var waitMs = Math.max(0, Number(remainingMs) || 0);
    if (waitMs <= 0) {
      triggerSessionExpiryLogout();
      return;
    }
    _autoLogoutTimer = setTimeout(function() {
      triggerSessionExpiryLogout();
    }, waitMs);
  }

  function triggerSessionExpiryLogout() {
    if (!isAuthenticated()) return;
    if (_isSaving || _isUploading || _loginBusy || _registerBusy) {
      setTimeout(triggerSessionExpiryLogout, 3000);
      return;
    }
    doLogout({ expired: true });
  }

  function initAuth() {
    try {
      var t = null;
      var u = null;
      var expRaw = null;
      try {
        t = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
        u = localStorage.getItem(AUTH_USER_STORAGE_KEY);
        expRaw = localStorage.getItem(AUTH_EXPIRES_AT_STORAGE_KEY);
      } catch (e) { }
      if (!t) {
        try {
          t = sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
          u = sessionStorage.getItem(AUTH_USER_STORAGE_KEY);
        } catch (e) { }
      }
      var expiresAt = expRaw ? Number(expRaw) : 0;
      var now = Date.now();

      if (t && u) {
        if (expiresAt && now >= expiresAt) {
          clearAuthStorage();
          _token = null;
          _session = null;
        } else {
          _token = t;
          _session = JSON.parse(u);
          var remaining = expiresAt ? (expiresAt - now) : AUTH_SESSION_DURATION_MS;
          if (!expiresAt) {
            try {
              localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, _token);
              localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(_session));
              localStorage.setItem(AUTH_EXPIRES_AT_STORAGE_KEY, String(now + AUTH_SESSION_DURATION_MS));
              localStorage.setItem(AUTH_LOGIN_AT_STORAGE_KEY, String(now));
            } catch (e) { }
          }
          scheduleAutoLogoutTimer(remaining);
        }
      }
    } catch(e) { }
    showApp();
    try {
      if (getDeepLinkParam_()) {
        switchTab('list');
        // switchTab('list') loads records once when they are not already available.
      }
    } catch(e) { }
    var pwEl = document.getElementById('login-password');
    var unEl = document.getElementById('login-username');
    if (pwEl) pwEl.addEventListener('keypress', function(e){ if(e.key==='Enter') doLogin(); });
    if (unEl) unEl.addEventListener('keypress', function(e){ if(e.key==='Enter'){ var p=document.getElementById('login-password'); if(p) p.focus(); } });
  }

  function isAuthenticated() {
    return !!(_token && _session);
  }

  function readGuestSessionRecordMap() {
    try {
      var raw = sessionStorage.getItem(GUEST_SESSION_ACCESS_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function writeGuestSessionRecordMap(map) {
    try {
      sessionStorage.setItem(GUEST_SESSION_ACCESS_KEY, JSON.stringify(map || {}));
    } catch (e) { }
  }

  function rememberGuestSessionAccess(backendId, guestAccessKey) {
    var id = String(backendId || '').trim();
    var key = String(guestAccessKey || '').trim();
    if (!id || !key) return;
    var map = readGuestSessionRecordMap();
    map[id] = true;
    writeGuestSessionRecordMap(map);
    _guestAccessMemory[id] = key;
  }

  function getGuestSessionAccessKey(backendId) {
    var id = String(backendId || '').trim();
    if (!id) return '';
    return String(_guestAccessMemory[id] || '').trim();
  }

  function isGuestSessionOwnedRecord(backendId) {
    var id = String(backendId || '').trim();
    if (!id) return false;
    var map = readGuestSessionRecordMap();
    return !!map[id] && !!_guestAccessMemory[id];
  }

  function syncGuestActionControls() {
    var canManageEdit = canManageEditProducts();
    var editSelectors = [
      '#edit-submit-btn',
      'button[onclick*="triggerEditGalleryPicker("]'
    ];

    editSelectors.forEach(function(selector) {
      document.querySelectorAll(selector).forEach(function(el) {
        if (!el) return;
        el.disabled = !canManageEdit;
        el.classList.toggle('hidden', !canManageEdit);
        el.classList.toggle('pointer-events-none', !canManageEdit);
        el.classList.toggle('opacity-50', !canManageEdit);
      });
    });

    var fileInputs = [
      document.getElementById('file-edit-gallery-upload-shop'),
      document.getElementById('file-edit-gallery-upload-product'),
      document.getElementById('file-edit-gallery-upload-activity')
    ];
    fileInputs.forEach(function(input) {
      if (!input) return;
      input.disabled = !canManageEdit;
    });

    var editClearAll = document.getElementById('edit-gallery-clear-all');
    if (editClearAll) {
      editClearAll.disabled = !canManageEdit;
      editClearAll.classList.toggle('hidden', !canManageEdit);
    }

    var btnSubmit = document.getElementById('btn-submit');
    if (btnSubmit) {
      var isLastStep = currentStep === totalSteps;
      btnSubmit.classList.toggle('hidden', !isLastStep);
      if (!isLastStep) {
        btnSubmit.disabled = true;
      } else if (!_isSaving) {
        btnSubmit.disabled = false;
      }
    }

    var editSubmitBtn = document.getElementById('edit-submit-btn');
    if (editSubmitBtn) {
      editSubmitBtn.disabled = !canManageEdit;
      editSubmitBtn.classList.toggle('hidden', !canManageEdit);
      editSubmitBtn.classList.toggle('pointer-events-none', !canManageEdit);
      editSubmitBtn.classList.toggle('opacity-50', !canManageEdit);
    }
  }

  function showApp() {
    var overlay = document.getElementById('login-overlay');
    if (overlay) overlay.classList.add('hidden');
    var hu = document.getElementById('header-user');
    var hn = document.getElementById('header-user-name');
    var hr = document.getElementById('header-user-role');
    var ha = document.getElementById('header-user-avatar');
    var hLogin = document.getElementById('header-btn-login');
    
    if (_session) {
      var role = String(_session && _session.role || '').trim().toLowerCase();
      if (hu) { hu.classList.remove('hidden'); hu.classList.add('flex'); }
      if (hLogin) hLogin.classList.add('hidden');
      if (hn) hn.textContent = (_session.name || _session.username) || '';
      if (hr) hr.textContent = (role === 'admin') ? '\u2764\uFE0F ผู้ดูแลระบบ' : '\uD83D\uDC64 ผู้ใช้';
      if (ha) ha.textContent = ((_session.name || _session.username) || '?').charAt(0).toUpperCase();
    } else {
      if (hu) { hu.classList.add('hidden'); hu.classList.remove('flex'); }
      if (hLogin) hLogin.classList.remove('hidden');
    }
    if (window.lucide) lucide.createIcons();
    updateStepUI();
    if (typeof renderRecords === 'function' && Array.isArray(recordsData) && recordsData.length > 0) {
      renderRecords();
    }
  }

  function showLogin() {
    var overlay = document.getElementById('login-overlay');
    if (overlay) overlay.classList.remove('hidden');
    setTimeout(function(){ var un=document.getElementById('login-username'); if(un) un.focus(); }, 100);
    if (window.lucide) lucide.createIcons();
  }

  function resetAppToGuestState() {
    currentStep = 1;
    updateStepUI();
    currentPage = 1;
    currentPageSize = getItemsPerPage();
    listSearchQuery = '';
    listAmphoeFilter = '';
    _listExcelExportBusy = false;
    var amphoeEl = document.getElementById('list-amphoe-filter');
    if (amphoeEl) amphoeEl.value = '';
    var excelBtn = document.getElementById('btn-export-excel');
    if (excelBtn) {
      excelBtn.disabled = false;
      excelBtn.innerHTML = '<i data-lucide="download" class="w-4 h-4"></i><span class="hidden sm:inline">ดาวน์โหลด Excel</span><span class="sm:hidden">Excel</span>';
    }
    filteredRecordsData = recordsData.slice();
    editTargetIndex = null;
    deleteTargetIndex = null;
    detailTargetIndex = null;
    currentProducts = [];
    isProductListExpanded = false;
    productVisibleCount = 0;
    editProducts = [];
    clearUploadQueue();
    _isUploading = false;
    _uploadTotal = 0;
    _uploadCompleted = 0;
    resetEditGalleryState();
    _isSaving = false;
    _isEditing = false;
    _loginBusy = false;
    _listRequestToken++;
    _detailRequestToken++;
    _editRequestToken++;

    var form = document.getElementById('mainForm');
    if (form) form.reset();
    clearFormDraft();
    renderProductList();
    renderEditProductList();
    closeProductModal();
    closeEditProductModal();
    closeDetailModal();
    closeProductDetailModal();
    closeDeleteModal();
    var uploadContainer = document.getElementById('gallery-upload-container');
    var uploadStatus = document.getElementById('gallery-upload-status');
    var uploadProgressText = document.getElementById('gallery-upload-progress-text');
    var uploadProgressBar = document.getElementById('gallery-upload-progress-bar');
    var uploadProgressMeta = document.getElementById('gallery-upload-progress-meta');
    if (uploadContainer) uploadContainer.classList.add('hidden');
    if (uploadStatus) uploadStatus.textContent = 'ยังไม่เริ่มอัปโหลด';
    if (uploadProgressText) uploadProgressText.textContent = '0%';
    if (uploadProgressBar) uploadProgressBar.style.width = '0%';
    if (uploadProgressMeta) uploadProgressMeta.textContent = '0 / 0';

    var btnSubmit = document.getElementById('btn-submit');
    var submitContent = document.getElementById('submit-content');
    var submitSpinner = document.getElementById('submit-spinner');
    if (btnSubmit) btnSubmit.disabled = false;
    if (submitContent) submitContent.classList.remove('hidden');
    if (submitSpinner) submitSpinner.classList.add('hidden');

    var editSubmitBtn = document.getElementById('edit-submit-btn');
    var editSubmitText = document.getElementById('edit-submit-text');
    var editSubmitIcon = document.getElementById('edit-submit-icon');
    var editSpinner = document.getElementById('edit-spinner');
    if (editSubmitBtn) editSubmitBtn.disabled = false;
    if (editSubmitText) editSubmitText.textContent = 'บันทึกการแก้ไข';
    if (editSubmitIcon) editSubmitIcon.classList.remove('hidden');
    if (editSpinner) editSpinner.classList.add('hidden');

    syncGuestActionControls();
    _hasProcessedDeepLink = false;
    var hasDeepLink = false;
    try {
      if (getDeepLinkParam_()) hasDeepLink = true;
    } catch(e) { }

    if (hasDeepLink) {
      switchTab('list');
    } else {
      switchTab('form');
    }
  }

  function hideLogin() {
    var overlay = document.getElementById('login-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  function toggleLoginPasswordVisibility() {
    var input = document.getElementById('login-password');
    var btn = document.getElementById('login-password-toggle');
    var icon = document.getElementById('login-password-toggle-icon');
    if (!input) return;
    var isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    if (btn) {
      var label = isHidden ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน';
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
    }
    if (icon) icon.setAttribute('data-lucide', isHidden ? 'eye-off' : 'eye');
    if (window.lucide) lucide.createIcons();
    input.focus();
  }

  function showRegister() {
    hideLogin();
    var overlay = document.getElementById('register-overlay');
    if (overlay) overlay.classList.remove('hidden');
    setTimeout(function() {
      var nEl = document.getElementById('register-name');
      if (nEl) nEl.focus();
    }, 100);
    if (window.lucide) lucide.createIcons();
  }

  function hideRegister() {
    var overlay = document.getElementById('register-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  let _registerBusy = false;
  function doRegister() {
    if (_registerBusy) return;
    
    var nameEl = document.getElementById('register-name');
    var userEl = document.getElementById('register-username');
    var emailEl = document.getElementById('register-email');
    var passEl = document.getElementById('register-password');
    var confirmEl = document.getElementById('register-confirm-password');
    
    var btnEl = document.getElementById('register-btn');
    var btnText = document.getElementById('register-btn-text');
    var btnIcon = document.getElementById('register-btn-icon');
    var spinner = document.getElementById('register-spinner');
    
    var errEl = document.getElementById('register-error');
    var errText = document.getElementById('register-error-text');

    var nameVal = nameEl ? nameEl.value.trim() : '';
    var userVal = userEl ? userEl.value.trim() : '';
    var emailVal = emailEl ? emailEl.value.trim() : '';
    var passVal = passEl ? passEl.value : '';
    var confirmVal = confirmEl ? confirmEl.value : '';

    if (!nameVal || !userVal || !passVal || !confirmVal) {
      if (errEl) errEl.classList.remove('hidden');
      if (errText) errText.textContent = 'กรุณากรอกข้อมูลในช่องที่มีดอกจันให้ครบถ้วน';
      return;
    }

    if (passVal !== confirmVal) {
      if (errEl) errEl.classList.remove('hidden');
      if (errText) errText.textContent = 'รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน';
      return;
    }

    _registerBusy = true;
    if (errEl) errEl.classList.add('hidden');
    if (btnText) btnText.textContent = 'กำลังตรวจสอบ...';
    if (btnIcon) btnIcon.classList.add('hidden');
    if (spinner) spinner.classList.remove('hidden');
    if (btnEl) btnEl.disabled = true;

    google.script.run
      .withSuccessHandler(function(res) {
        _registerBusy = false;
        if (spinner) spinner.classList.add('hidden');
        if (btnIcon) btnIcon.classList.remove('hidden');
        if (btnText) btnText.textContent = 'ยืนยันการสมัคร';
        if (btnEl) btnEl.disabled = false;

        if (res && res.success) {
          hideRegister();
          if (typeof showToast === 'function') {
            showToast('สมัครสมาชิกสำเร็จแล้ว คุณสามารถเข้าสู่ระบบได้ทันที', 'success');
          } else {
            alert('สมัครสมาชิกสำเร็จแล้ว คุณสามารถเข้าสู่ระบบได้ทันที');
          }
          // Clear inputs
          if (nameEl) nameEl.value = '';
          if (userEl) userEl.value = '';
          if (emailEl) emailEl.value = '';
          if (passEl) passEl.value = '';
          if (confirmEl) confirmEl.value = '';
          setTimeout(function() { showLogin(); }, 300);
        } else {
          if (errEl) errEl.classList.remove('hidden');
          if (errText) errText.textContent = (res && res.message) || 'การสมัครสมาชิกมีปัญหา';
        }
      })
      .withFailureHandler(function(error) {
        _registerBusy = false;
        if (spinner) spinner.classList.add('hidden');
        if (btnIcon) btnIcon.classList.remove('hidden');
        if (btnText) btnText.textContent = 'ยืนยันการสมัคร';
        if (btnEl) btnEl.disabled = false;
        
        if (errEl) errEl.classList.remove('hidden');
        if (errText) errText.textContent = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
      })
      .registerUser({ name: nameVal, username: userVal, email: emailVal, password: passVal });
  }

  function doLogin() {
    if (_loginBusy) return;
    var unEl=document.getElementById('login-username'), pwEl=document.getElementById('login-password');
    var btnEl=document.getElementById('login-btn'), btnText=document.getElementById('login-btn-text');
    var btnIcon=document.getElementById('login-btn-icon'), spinner=document.getElementById('login-spinner');
    var errEl=document.getElementById('login-error'), errText=document.getElementById('login-error-text');
    var username = unEl ? unEl.value.trim() : '';
    var password = pwEl ? pwEl.value : '';
    if (!username || !password) {
      if (errEl) errEl.classList.remove('hidden');
      if (errText) errText.textContent = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน';
      return;
    }
    _loginBusy = true;
    if (errEl) errEl.classList.add('hidden');
    if (btnText) btnText.textContent = 'กำลังเข้าสู่ระบบ...';
    if (btnIcon) btnIcon.classList.add('hidden');
    if (spinner) spinner.classList.remove('hidden');
    if (btnEl) btnEl.disabled = true;
    google.script.run
      .withSuccessHandler(function(res) {
        _loginBusy = false;
        if (spinner) spinner.classList.add('hidden');
        if (btnIcon) btnIcon.classList.remove('hidden');
        if (btnText) btnText.textContent = 'เข้าสู่ระบบ';
        if (btnEl) btnEl.disabled = false;
        if (res && res.success) {
          _token = res.token; _session = res.user;
          var now = Date.now();
          var expiresAt = now + AUTH_SESSION_DURATION_MS;
          try {
            localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, _token);
            localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(_session));
            localStorage.setItem(AUTH_EXPIRES_AT_STORAGE_KEY, String(expiresAt));
            localStorage.setItem(AUTH_LOGIN_AT_STORAGE_KEY, String(now));
          } catch(e) { }
          try {
            sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
            sessionStorage.removeItem(AUTH_USER_STORAGE_KEY);
          } catch(e) { }
          scheduleAutoLogoutTimer(AUTH_SESSION_DURATION_MS);
          showApp();
        } else {
          if (errEl) errEl.classList.remove('hidden');
          if (errText) errText.textContent = (res && res.message) || 'เข้าสู่ระบบล้มเหลว';
          if (pwEl) { pwEl.value = ''; pwEl.focus(); }
        }
      })
      .withFailureHandler(function(error) {
        _loginBusy = false;
        if (spinner) spinner.classList.add('hidden');
        if (btnIcon) btnIcon.classList.remove('hidden');
        if (btnText) btnText.textContent = 'เข้าสู่ระบบ';
        if (btnEl) btnEl.disabled = false;
        if (errEl) errEl.classList.remove('hidden');
        if (errText) errText.textContent = 'เชื่อมต่อเซิร์ฟเวอร์ล้มเหลว';
      })
      .loginUser({ username: username, password: password });
  }

  function doLogout(options) {
    if (_autoLogoutTimer) {
      clearTimeout(_autoLogoutTimer);
      _autoLogoutTimer = null;
    }
    var t = _token;
    _token = null; _session = null;
    clearAuthStorage();
    resetAppToGuestState();
    if (t && window.google && google.script && google.script.run) {
      google.script.run.logoutUser({ token: t });
    }
    showApp();
    switchTab('form');
    window.scrollTo(0, 0);
    if (options && options.expired) {
      if (typeof showToast === 'function') {
        showToast('เซสชันหมดอายุแล้ว (ครบ 6 ชั่วโมง) กรุณาเข้าสู่ระบบใหม่', 'error');
      } else {
        alert('เซสชันหมดอายุแล้ว (ครบ 6 ชั่วโมง) กรุณาเข้าสู่ระบบใหม่');
      }
      showLogin();
    }
  }

  function canEditRecord(item) {
    if (!item) return false;
    if (isAuthenticated()) {
      var role = String(_session && _session.role || '').trim().toLowerCase();
      if (role === 'admin') return true;
      if (role === 'user') {
        var currentUsername = String(_session && _session.username || '').trim().toLowerCase();
        var recordCreatedBy = String(item.CreatedBy || '').trim().toLowerCase();
        return !!currentUsername && currentUsername === recordCreatedBy;
      }
      return false;
    }
    return isGuestSessionOwnedRecord(item.BackendId);
  }

  function canDeleteRecord(item) {
    if (!item) return false;
    if (isAuthenticated()) {
      var role = String(_session && _session.role || '').trim().toLowerCase();
      if (role === 'admin') return true;
      if (role === 'user') {
        var currentUsername = String(_session && _session.username || '').trim().toLowerCase();
        var recordCreatedBy = String(item.CreatedBy || '').trim().toLowerCase();
        return !!currentUsername && currentUsername === recordCreatedBy;
      }
      return false;
    }
    return false;
  }

  function canManageEditProducts() {
    if (editTargetIndex === null || editTargetIndex < 0) return false;
    return canEditRecord(recordsData[editTargetIndex]);
  }

  function buildGuestScopedPayload(backendId) {
    var key = getGuestSessionAccessKey(backendId);
    return key ? { guestAccessKey: key } : {};
  }

  function isSessionInvalidResponse(res) {
    return !!(res && res.sessionInvalid);
  }

  function handleSessionInvalidResponse(res) {
    if (!isSessionInvalidResponse(res)) return false;
    alert((res && res.message) || 'Session หมดอายุหรือมีการ login จากเครื่องอื่น กรุณาเข้าสู่ระบบใหม่');
    doLogout();
    showLogin();
    return true;
  }

  window.addEventListener('resize', () => {
    const nextPreviewLimit = getProductPreviewLimit();
    if (!isProductListExpanded && currentProducts.length && productVisibleCount !== Math.min(nextPreviewLimit, currentProducts.length)) {
      renderProductList();
    }
    if (!isEditProductListExpanded && editProducts.length && editProductVisibleCount !== Math.min(nextPreviewLimit, editProducts.length)) {
      renderEditProductList();
    }

    const sectionList = document.getElementById('section-list');
    if (!sectionList || sectionList.classList.contains('hidden')) return;

    const nextPageSize = getItemsPerPage();
    if (nextPageSize !== currentPageSize) {
      const firstVisibleIndex = (currentPage - 1) * currentPageSize;
      currentPageSize = nextPageSize;
      currentPage = Math.floor(firstVisibleIndex / currentPageSize) + 1;
      renderRecords();
    }
  });

  function getItemsPerPage() {
    return window.matchMedia('(max-width: 767px)').matches ? 6 : 12;
  }

  function getProductPreviewLimit() {
    return window.matchMedia('(max-width: 767px)').matches ? 3 : 6;
  }

  function cleanPhoneValue(value) {
    return String(value ?? '').replace(new RegExp('[^0-9]', 'g'), '').substring(0, 10);
  }

  function cleanPhone(el) {
    if (!el) return;
    el.value = cleanPhoneValue(el.value);
  }

  function formatPhoneDisplayValue(value) {
    const digits = cleanPhoneValue(value);
    if (!digits) return '';
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return digits.slice(0, 3) + '-' + digits.slice(3);
    return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
  }

  function formatPhoneDisplay(el) {
    if (!el) return;
    el.value = formatPhoneDisplayValue(el.value);
  }

  function restoreImagePreview(name, value) {
    const img = document.getElementById('img-' + name);
    const placeholder = document.querySelector('#preview-' + name + ' .placeholder');
    const b64 = document.getElementById('b64-' + name);
    const clearBtn = document.getElementById('clear-' + name);

    if (!value) {
      if (img) { img.src = ''; img.classList.add('hidden'); }
      if (placeholder) placeholder.style.display = '';
      if (b64) b64.value = '';
      if (clearBtn) clearBtn.classList.add('hidden');
      return;
    }

    if (img) { img.src = value; img.classList.remove('hidden'); }
    if (placeholder) placeholder.style.display = 'none';
    if (b64) b64.value = value;
    if (clearBtn) clearBtn.classList.remove('hidden');
  }

  function saveFormDraft() {
    const form = document.getElementById('mainForm');
    if (!form) return;

    const draft = { step: currentStep, fields: {} };
    for (let i = 0; i < form.elements.length; i++) {
      const el = form.elements[i];
      if (!el.name || el.disabled) continue;
      if (el.type === 'button' || el.type === 'submit' || el.type === 'file') continue;

      if (el.type === 'checkbox') {
        if (!draft.fields[el.name]) draft.fields[el.name] = [];
        if (el.checked) draft.fields[el.name].push(el.value);
        continue;
      }

      if (el.type === 'radio') {
        if (el.checked) draft.fields[el.name] = el.value;
        continue;
      }

      draft.fields[el.name] = el.value;
    }

    draft.products = Array.isArray(currentProducts) ? currentProducts.slice() : [];

    try {
      sessionStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(draft));
    } catch (e) { }
  }

  function clearFormDraft() {
    try {
      sessionStorage.removeItem(FORM_DRAFT_KEY);
    } catch (e) { }
  }

  function restoreFormDraft() {
    const form = document.getElementById('mainForm');
    if (!form) return;

    let draft = null;
    try {
      const raw = sessionStorage.getItem(FORM_DRAFT_KEY);
      if (!raw) return;
      draft = JSON.parse(raw);
    } catch (e) {
      clearFormDraft();
      return;
    }

    if (!draft || !draft.fields) return;

    Object.keys(draft.fields).forEach(function(name) {
      const elements = form.querySelectorAll('[name="' + name + '"]');
      if (!elements.length) return;
      const value = draft.fields[name];

      elements.forEach(function(el) {
        if (el.type === 'checkbox') {
          el.checked = Array.isArray(value) && value.indexOf(el.value) !== -1;
          return;
        }
        if (el.type === 'radio') {
          el.checked = String(value) === String(el.value);
          return;
        }
        el.value = value;
      });
    });

    currentProducts = Array.isArray(draft.products) ? draft.products.map(function(item, index) {
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
    }) : [];
    renderProductList();

    ['image_shop', 'image_product', 'image_activity'].forEach(function(name) {
      const hidden = form.querySelector('[name="' + name + '"]');
      restoreImagePreview(name, hidden ? hidden.value : '');
    });

    currentStep = Math.min(Math.max(parseInt(draft.step || 1, 10) || 1, 1), totalSteps);
    updateStepUI();
  }

  function bindFormPersistence() {
    const form = document.getElementById('mainForm');
    if (!form) return;

    form.addEventListener('input', function(event) {
      const target = event.target;
      if (!target || !target.name || target.type === 'file') return;
      saveFormDraft();
    });

    form.addEventListener('change', function(event) {
      const target = event.target;
      if (!target || !target.name || target.type === 'file') return;
      saveFormDraft();
    });

    window.addEventListener('beforeunload', saveFormDraft);
  }

  function formatProductPriceDisplay(value) {
    const text = String(value == null ? '' : value).trim();
    if (!text) return '-';
    const numeric = Number(String(text).replace(new RegExp('[^0-9.]', 'g'), ''));
    if (!Number.isNaN(numeric) && String(text).replace(new RegExp('[^0-9.]', 'g'), '')) {
      return '฿' + numeric.toLocaleString('th-TH');
    }
    return text;
  }

  function calculateAverageProductPrice(items) {
    const numbers = (Array.isArray(items) ? items : []).map(function(item) {
      const raw = String(item && item.price != null ? item.price : '').trim();
      if (!raw) return null;
      const numericText = raw.replace(new RegExp('[^0-9.]', 'g'), '');
      if (!numericText) return null;
      const numeric = Number(numericText);
      return Number.isNaN(numeric) ? null : numeric;
    }).filter(function(value) { return value !== null; });

    if (!numbers.length) return '-';
    const avg = numbers.reduce(function(sum, value) { return sum + value; }, 0) / numbers.length;
    return '฿' + Math.round(avg).toLocaleString('th-TH');
  }

  function syncProductSummaryFields() {
    const nameEl = document.getElementById('main_products_hidden');
    const avgEl = document.getElementById('avg_price_hidden');
    const countEl = document.getElementById('product-count');
    const avgDisplayEl = document.getElementById('product-average-display');
    const names = currentProducts.map(function(item) { return String(item.productName || '').trim(); }).filter(Boolean);
    const summary = names.join(', ');
    const avgDisplay = calculateAverageProductPrice(currentProducts);
    const avgNumeric = avgDisplay === '-' ? '' : String(avgDisplay).replace(new RegExp('[^0-9.]', 'g'), '');

    if (nameEl) nameEl.value = summary;
    if (avgEl) avgEl.value = avgNumeric;
    if (countEl) countEl.textContent = String(currentProducts.length);
    if (avgDisplayEl) avgDisplayEl.textContent = avgDisplay;
  }

  function renderProductList() {
    const emptyEl = document.getElementById('product-list-empty');
    const cardsEl = document.getElementById('product-list-cards');
    const controlsEl = document.getElementById('product-list-controls');
    const toggleBtn = document.getElementById('product-list-toggle-btn');
    const loadMoreBtn = document.getElementById('product-list-load-more-btn');
    const visibleInfoEl = document.getElementById('product-list-visible-info');
    if (!emptyEl || !cardsEl) return;

    syncProductSummaryFields();

    if (!currentProducts.length) {
      emptyEl.classList.remove('hidden');
      cardsEl.innerHTML = '';
      if (controlsEl) controlsEl.classList.add('hidden');
      isProductListExpanded = false;
      productVisibleCount = 0;
      if (window.lucide) lucide.createIcons();
      return;
    }

    const previewLimit = getProductPreviewLimit();
    const totalProducts = currentProducts.length;
    const isLargeList = totalProducts > 20;
    if (!isProductListExpanded) {
      productVisibleCount = Math.min(previewLimit, totalProducts);
    } else if (isLargeList) {
      const initialExpandedCount = Math.max(previewLimit, 10);
      if (!productVisibleCount || productVisibleCount < initialExpandedCount) {
        productVisibleCount = Math.min(initialExpandedCount, totalProducts);
      } else {
        productVisibleCount = Math.min(productVisibleCount, totalProducts);
      }
    } else {
      productVisibleCount = totalProducts;
    }

    const visibleProducts = currentProducts.slice(0, productVisibleCount);
    emptyEl.classList.add('hidden');
    cardsEl.innerHTML = visibleProducts.map(function(item, index) {
      var category = String(item.productCategory || '').trim() || 'ไม่ระบุ';
      var description = String(item.description || '').trim();
      var price = formatProductPriceDisplay(item.price);
      var imgSrc = normalizeDriveImageUrlString_(String(item.image || '').trim(), 'thumb');
      var thumbHtml = imgSrc
        ? '<img src="' + escapeHtml(imgSrc) + '" alt="รูปสินค้า" class="product-thumb">'
        : '<div class="product-thumb-placeholder"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg></div>';
      return ''
        + '<div class="product-card">'
        +   '<div class="product-card-header">'
        +     thumbHtml
        +     '<div class="min-w-0 flex-1">'
        +       '<div class="product-card-title">' + escapeHtml(item.productName || '-') + '</div>'
        +       '<div class="product-card-subtitle">' + escapeHtml(category) + '</div>'
        +     '</div>'
        +     '<div class="product-price-badge">' + escapeHtml(price) + '</div>'
        +   '</div>'
        +   (description ? '<div class="product-card-description">' + escapeHtml(description) + '</div>' : '')
        +   '<div class="product-card-footer">'
        +     '<span class="product-index-badge">รายการที่ ' + (index + 1) + '</span>'
        +     '<div class="flex gap-2">'
        +       '<button type="button" onclick="editProductItem(' + index + ')" class="product-edit-button">'
        +         '<i data-lucide="pencil" class="w-4 h-4"></i>'
        +         'แก้ไข'
        +       '</button>'
        +       '<button type="button" onclick="removeProductItem(' + index + ')" class="product-delete-button">'
        +         '<i data-lucide="trash-2" class="w-4 h-4"></i>'
        +         'ลบสินค้า'
        +       '</button>'
        +     '</div>'
        +   '</div>'
        + '</div>';
    }).join('');

    if (controlsEl && toggleBtn && loadMoreBtn && visibleInfoEl) {
      if (totalProducts > previewLimit) {
        controlsEl.classList.remove('hidden');
        toggleBtn.textContent = isProductListExpanded ? 'แสดงน้อยลง' : ('แสดงทั้งหมด (' + totalProducts + ' รายการ)');
        toggleBtn.setAttribute('aria-expanded', isProductListExpanded ? 'true' : 'false');

        if (isProductListExpanded && isLargeList) {
          visibleInfoEl.textContent = 'แสดง ' + productVisibleCount + ' จาก ' + totalProducts + ' รายการ';
          visibleInfoEl.classList.remove('hidden');
          if (productVisibleCount < totalProducts) {
            loadMoreBtn.textContent = 'โหลดเพิ่ม 10 รายการ';
            loadMoreBtn.classList.remove('hidden');
          } else {
            loadMoreBtn.classList.add('hidden');
          }
        } else {
          visibleInfoEl.textContent = '';
          visibleInfoEl.classList.add('hidden');
          loadMoreBtn.classList.add('hidden');
        }
      } else {
        controlsEl.classList.add('hidden');
      }
    }

    if (window.lucide) lucide.createIcons();
  }

  function toggleProductListExpand() {
    if (!currentProducts.length) return;
    const totalProducts = currentProducts.length;
    const previewLimit = getProductPreviewLimit();
    if (isProductListExpanded) {
      isProductListExpanded = false;
      productVisibleCount = Math.min(previewLimit, totalProducts);
    } else {
      isProductListExpanded = true;
      productVisibleCount = totalProducts > 20
        ? Math.min(totalProducts, Math.max(previewLimit, 10))
        : totalProducts;
    }
    renderProductList();
  }

  function loadMoreProducts() {
    if (!isProductListExpanded || !currentProducts.length) return;
    const totalProducts = currentProducts.length;
    if (productVisibleCount >= totalProducts) return;
    productVisibleCount = Math.min(totalProducts, productVisibleCount + 10);
    renderProductList();
  }

  function clearProductModal() {
    _isProductEditing = false;
    _currentProductEditIndex = null;
    const errEl = document.getElementById('product-modal-error');
    const errText = document.getElementById('product-modal-error-text');
    const nameEl = document.getElementById('product-name-input');
    const categoryEl = document.getElementById('product-category-input');
    const descEl = document.getElementById('product-description-input');
    const priceEl = document.getElementById('product-price-input');
    if (errEl) errEl.classList.add('hidden');
    if (errText) errText.textContent = '';
    if (nameEl) nameEl.value = '';
    if (categoryEl) categoryEl.value = '';
    if (descEl) descEl.value = '';
    if (priceEl) priceEl.value = '';
    clearProductImagePreview();
  }

  function openProductModal() {
    const modal = document.getElementById('modal-product');
    const content = document.getElementById('modal-product-content');
    if (!modal || !content) return;
    clearProductModal();
    modal.classList.remove('opacity-0', 'pointer-events-none');
    content.classList.remove('scale-95');
    document.body.style.overflow = 'hidden';
    setTimeout(function() {
      const nameEl = document.getElementById('product-name-input');
      if (nameEl) nameEl.focus();
    }, 50);
    if (window.lucide) lucide.createIcons();
  }

  function closeProductModal() {
    const modal = document.getElementById('modal-product');
    const content = document.getElementById('modal-product-content');
    if (!modal || !content) return;
    modal.classList.add('opacity-0', 'pointer-events-none');
    content.classList.add('scale-95');
    document.body.style.overflow = '';
    clearProductModal();
  }

  function handleProductBackdropClick(event) {
    if (event.target && event.target.id === 'modal-product') {
      closeProductModal();
    }
  }

  function saveProductFromModal() {
    const nameEl = document.getElementById('product-name-input');
    const categoryEl = document.getElementById('product-category-input');
    const descEl = document.getElementById('product-description-input');
    const priceEl = document.getElementById('product-price-input');
    const errEl = document.getElementById('product-modal-error');
    const errText = document.getElementById('product-modal-error-text');
    const productName = String(nameEl ? nameEl.value : '').trim();
    const productCategory = String(categoryEl ? categoryEl.value : '').trim();
    const description = String(descEl ? descEl.value : '').trim();
    const price = String(priceEl ? priceEl.value : '').trim();

    if (!productName) {
      if (errEl) errEl.classList.remove('hidden');
      if (errText) errText.textContent = 'กรุณากรอกชื่อสินค้า/ผลิตภัณฑ์';
      if (nameEl) nameEl.focus();
      return;
    }

    if (_isProductEditing && _currentProductEditIndex !== null && _currentProductEditIndex >= 0 && _currentProductEditIndex < currentProducts.length) {
      currentProducts[_currentProductEditIndex] = {
        productName: productName,
        productCategory: productCategory,
        description: description,
        price: price,
        unit: '',
        image: _productImageData || '',
        sortOrder: currentProducts[_currentProductEditIndex].sortOrder
      };
    } else {
      currentProducts.push({
        productName: productName,
        productCategory: productCategory,
        description: description,
        price: price,
        unit: '',
        image: _productImageData || '',
        sortOrder: currentProducts.length + 1
      });
    }

    renderProductList();
    saveFormDraft();
    closeProductModal();
  }

  function editProductItem(index) {
    if (index < 0 || index >= currentProducts.length) return;
    var item = currentProducts[index];
    
    openProductModal();
    
    _isProductEditing = true;
    _currentProductEditIndex = index;
    
    setTimeout(function() {
      var nameEl = document.getElementById('product-name-input');
      var categoryEl = document.getElementById('product-category-input');
      var descEl = document.getElementById('product-description-input');
      var priceEl = document.getElementById('product-price-input');
      
      if (nameEl) nameEl.value = item.productName || '';
      if (categoryEl) categoryEl.value = item.productCategory || '';
      if (descEl) descEl.value = item.description || '';
      if (priceEl) priceEl.value = item.price == null ? '' : item.price;
      
      if (item.image) {
        _productImageData = item.image;
        var preview = document.getElementById('product-image-preview');
        var wrap = document.getElementById('product-image-preview-wrap');
        var dropzone = document.getElementById('product-image-dropzone');
        if (preview) preview.src = _productImageData;
        if (wrap) wrap.classList.remove('hidden');
        if (dropzone) dropzone.classList.add('hidden');
      } else {
        clearProductImagePreview();
      }
    }, 100);
  }

  function removeProductItem(index) {
    if (index < 0 || index >= currentProducts.length) return;
    currentProducts.splice(index, 1);
    currentProducts = currentProducts.map(function(item, idx) {
      item.sortOrder = idx + 1;
      return item;
    });
    renderProductList();
    saveFormDraft();
  }

  // ===== Product Image Preview =====
  function handleProductImageSelect(event) {
    var input = event && event.target ? event.target : null;
    var file = input && input.files ? input.files[0] : null;
    if (!file) return;
    compressImageFileForUpload(file)
      .then(function(result) {
      _productImageData = result.dataUrl || '';
      var preview = document.getElementById('product-image-preview');
      var wrap = document.getElementById('product-image-preview-wrap');
      var dropzone = document.getElementById('product-image-dropzone');
      if (preview) preview.src = _productImageData;
      if (wrap) wrap.classList.remove('hidden');
      if (dropzone) dropzone.classList.add('hidden');
      if (window.lucide) lucide.createIcons();
    })
      .catch(function() {
        if (input) input.value = '';
        showToast('ไม่สามารถย่อรูปสินค้าได้ กรุณาลองใหม่', 'error');
      });
  }

  function clearProductImagePreview() {
    _productImageData = '';
    var preview = document.getElementById('product-image-preview');
    var wrap = document.getElementById('product-image-preview-wrap');
    var dropzone = document.getElementById('product-image-dropzone');
    var input = document.getElementById('product-image-input');
    if (preview) preview.src = '';
    if (wrap) wrap.classList.add('hidden');
    if (dropzone) dropzone.classList.remove('hidden');
    if (input) input.value = '';
  }

  function handleEditProductImageSelect(event) {
    var input = event && event.target ? event.target : null;
    var file = input && input.files ? input.files[0] : null;
    if (!file) return;
    compressImageFileForUpload(file)
      .then(function(result) {
      _editProductImageData = result.dataUrl || '';
      var preview = document.getElementById('edit-product-image-preview');
      var wrap = document.getElementById('edit-product-image-preview-wrap');
      var dropzone = document.getElementById('edit-product-image-dropzone');
      if (preview) preview.src = _editProductImageData;
      if (wrap) wrap.classList.remove('hidden');
      if (dropzone) dropzone.classList.add('hidden');
      if (window.lucide) lucide.createIcons();
    })
      .catch(function() {
        if (input) input.value = '';
        showToast('ไม่สามารถย่อรูปสินค้าได้ กรุณาลองใหม่', 'error');
      });
  }

  function clearEditProductImagePreview() {
    _editProductImageData = '';
    var preview = document.getElementById('edit-product-image-preview');
    var wrap = document.getElementById('edit-product-image-preview-wrap');
    var dropzone = document.getElementById('edit-product-image-dropzone');
    var input = document.getElementById('edit-product-image-input');
    if (preview) preview.src = '';
    if (wrap) wrap.classList.add('hidden');
    if (dropzone) dropzone.classList.remove('hidden');
    if (input) input.value = '';
  }

  function formatEditProductPriceDisplay(value) {
    return formatProductPriceDisplay(value);
  }

  function calculateEditAverageProductPrice(items) {
    return calculateAverageProductPrice(items);
  }

  function syncEditProductSummaryFields() {
    const nameEl = document.getElementById('edit_main_products_hidden');
    const avgEl = document.getElementById('edit_avg_price_hidden');
    const countEl = document.getElementById('edit-product-count');
    const avgDisplayEl = document.getElementById('edit-product-average-display');
    const names = editProducts.map(function(item) { return String(item.productName || '').trim(); }).filter(Boolean);
    const summary = names.join(', ');
    const avgDisplay = calculateEditAverageProductPrice(editProducts);
    const avgNumeric = avgDisplay === '-' ? '' : String(avgDisplay).replace(new RegExp('[^0-9.]', 'g'), '');

    if (nameEl) nameEl.value = summary;
    if (avgEl) avgEl.value = avgNumeric;
    if (countEl) countEl.textContent = String(editProducts.length);
    if (avgDisplayEl) avgDisplayEl.textContent = avgDisplay;
  }

  function renderEditProductList() {
    const emptyEl = document.getElementById('edit-product-list-empty');
    const cardsEl = document.getElementById('edit-product-list-cards');
    const controlsEl = document.getElementById('edit-product-list-controls');
    const toggleBtn = document.getElementById('edit-product-list-toggle-btn');
    const loadMoreBtn = document.getElementById('edit-product-list-load-more-btn');
    const visibleInfoEl = document.getElementById('edit-product-list-visible-info');
    if (!emptyEl || !cardsEl) return;

    syncEditProductSummaryFields();

    if (!editProducts.length) {
      emptyEl.classList.remove('hidden');
      cardsEl.innerHTML = '';
      if (controlsEl) controlsEl.classList.add('hidden');
      isEditProductListExpanded = false;
      editProductVisibleCount = 0;
      if (window.lucide) lucide.createIcons();
      return;
    }

    const previewLimit = getProductPreviewLimit();
    const totalProducts = editProducts.length;
    const isLargeList = totalProducts > 20;
    if (!isEditProductListExpanded) {
      editProductVisibleCount = Math.min(previewLimit, totalProducts);
    } else if (isLargeList) {
      const initialExpandedCount = Math.max(previewLimit, 10);
      if (!editProductVisibleCount || editProductVisibleCount < initialExpandedCount) {
        editProductVisibleCount = Math.min(initialExpandedCount, totalProducts);
      } else {
        editProductVisibleCount = Math.min(editProductVisibleCount, totalProducts);
      }
    } else {
      editProductVisibleCount = totalProducts;
    }

    const visibleProducts = editProducts.slice(0, editProductVisibleCount);
    emptyEl.classList.add('hidden');
    cardsEl.innerHTML = visibleProducts.map(function(item, index) {
      var category = String(item.productCategory || '').trim() || 'ไม่ระบุ';
      var description = String(item.description || '').trim();
      var price = formatEditProductPriceDisplay(item.price);
      var imgSrc = normalizeDriveImageUrlString_(String(item.image || '').trim(), 'thumb');
      var thumbHtml = imgSrc
        ? '<img src="' + escapeHtml(imgSrc) + '" alt="รูปสินค้า" class="product-thumb">'
        : '<div class="product-thumb-placeholder"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg></div>';
      return ''
        + '<div class="product-card">'
        +   '<div class="product-card-header">'
        +     thumbHtml
        +     '<div class="min-w-0 flex-1">'
        +       '<div class="product-card-title">' + escapeHtml(item.productName || '-') + '</div>'
        +       '<div class="product-card-subtitle">' + escapeHtml(category) + '</div>'
        +     '</div>'
        +     '<div class="product-price-badge">' + escapeHtml(price) + '</div>'
        +   '</div>'
        +   (description ? '<div class="product-card-description">' + escapeHtml(description) + '</div>' : '')
        +   '<div class="product-card-footer">'
        +     '<span class="product-index-badge">รายการที่ ' + (index + 1) + '</span>'
        +     '<div class="flex items-center gap-2">'
        +       '<button type="button" onclick="editEditProductItem(' + index + ')" class="product-edit-button">'
        +         '<i data-lucide="pencil" class="w-4 h-4"></i>'
        +         'แก้ไข'
        +       '</button>'
        +       '<button type="button" onclick="removeEditProductItem(' + index + ')" class="product-delete-button">'
        +         '<i data-lucide="trash-2" class="w-4 h-4"></i>'
        +         'ลบสินค้า'
        +       '</button>'
        +     '</div>'
        +   '</div>'
        + '</div>';
    }).join('');

    if (controlsEl && toggleBtn && loadMoreBtn && visibleInfoEl) {
      if (totalProducts > previewLimit) {
        controlsEl.classList.remove('hidden');
        toggleBtn.textContent = isEditProductListExpanded ? 'แสดงน้อยลง' : ('แสดงทั้งหมด (' + totalProducts + ' รายการ)');
        toggleBtn.setAttribute('aria-expanded', isEditProductListExpanded ? 'true' : 'false');

        if (isEditProductListExpanded && isLargeList) {
          visibleInfoEl.textContent = 'แสดง ' + editProductVisibleCount + ' จาก ' + totalProducts + ' รายการ';
          visibleInfoEl.classList.remove('hidden');
          if (editProductVisibleCount < totalProducts) {
            loadMoreBtn.textContent = 'โหลดเพิ่ม 10 รายการ';
            loadMoreBtn.classList.remove('hidden');
          } else {
            loadMoreBtn.classList.add('hidden');
          }
        } else {
          visibleInfoEl.textContent = '';
          visibleInfoEl.classList.add('hidden');
          loadMoreBtn.classList.add('hidden');
        }
      } else {
        controlsEl.classList.add('hidden');
      }
    }

    if (window.lucide) lucide.createIcons();
  }

  function toggleEditProductListExpand() {
    if (!editProducts.length) return;
    const totalProducts = editProducts.length;
    const previewLimit = getProductPreviewLimit();
    if (isEditProductListExpanded) {
      isEditProductListExpanded = false;
      editProductVisibleCount = Math.min(previewLimit, totalProducts);
    } else {
      isEditProductListExpanded = true;
      editProductVisibleCount = totalProducts > 20
        ? Math.min(totalProducts, Math.max(previewLimit, 10))
        : totalProducts;
    }
    renderEditProductList();
  }

  function loadMoreEditProducts() {
    if (!isEditProductListExpanded || !editProducts.length) return;
    const totalProducts = editProducts.length;
    if (editProductVisibleCount >= totalProducts) return;
    editProductVisibleCount = Math.min(totalProducts, editProductVisibleCount + 10);
    renderEditProductList();
  }

  function clearEditProductModal() {
    const errEl = document.getElementById('edit-product-modal-error');
    const errText = document.getElementById('edit-product-modal-error-text');
    const nameEl = document.getElementById('edit-product-name-input');
    const categoryEl = document.getElementById('edit-product-category-input');
    const descEl = document.getElementById('edit-product-description-input');
    const priceEl = document.getElementById('edit-product-price-input');
    if (errEl) errEl.classList.add('hidden');
    if (errText) errText.textContent = '';
    if (nameEl) nameEl.value = '';
    if (categoryEl) categoryEl.value = '';
    if (descEl) descEl.value = '';
    if (priceEl) priceEl.value = '';
    clearEditProductImagePreview();
    _isEditProductEditing = false;
    _currentEditProductEditIndex = null;
  }

  function openEditProductModal() {
    const modal = document.getElementById('modal-edit-product');
    const content = document.getElementById('modal-edit-product-content');
    if (!modal || !content) return;
    clearEditProductModal();
    modal.classList.remove('opacity-0', 'pointer-events-none');
    content.classList.remove('scale-95');
    document.body.style.overflow = 'hidden';
    setTimeout(function() {
      const nameEl = document.getElementById('edit-product-name-input');
      if (nameEl) nameEl.focus();
    }, 50);
    if (window.lucide) lucide.createIcons();
  }

  function closeEditProductModal() {
    const modal = document.getElementById('modal-edit-product');
    const content = document.getElementById('modal-edit-product-content');
    if (!modal || !content) return;
    modal.classList.add('opacity-0', 'pointer-events-none');
    content.classList.add('scale-95');
    document.body.style.overflow = '';
    clearEditProductModal();
  }

  function handleEditProductBackdropClick(event) {
    if (event.target && event.target.id === 'modal-edit-product') {
      closeEditProductModal();
    }
  }

  function saveEditProductFromModal() {
    const nameEl = document.getElementById('edit-product-name-input');
    const categoryEl = document.getElementById('edit-product-category-input');
    const descEl = document.getElementById('edit-product-description-input');
    const priceEl = document.getElementById('edit-product-price-input');
    const errEl = document.getElementById('edit-product-modal-error');
    const errText = document.getElementById('edit-product-modal-error-text');
    const productName = String(nameEl ? nameEl.value : '').trim();
    const productCategory = String(categoryEl ? categoryEl.value : '').trim();
    const description = String(descEl ? descEl.value : '').trim();
    const price = String(priceEl ? priceEl.value : '').trim();

    if (!productName) {
      if (errEl) errEl.classList.remove('hidden');
      if (errText) errText.textContent = 'กรุณากรอกชื่อสินค้า/ผลิตภัณฑ์';
      if (nameEl) nameEl.focus();
      return;
    }

    if (_isEditProductEditing && _currentEditProductEditIndex !== null && _currentEditProductEditIndex >= 0 && _currentEditProductEditIndex < editProducts.length) {
      editProducts[_currentEditProductEditIndex] = {
        ProductID: editProducts[_currentEditProductEditIndex].ProductID || '',
        productName: productName,
        productCategory: productCategory,
        description: description,
        price: price,
        unit: editProducts[_currentEditProductEditIndex].unit || '',
        image: _editProductImageData || editProducts[_currentEditProductEditIndex].image || '',
        sortOrder: editProducts[_currentEditProductEditIndex].sortOrder
      };
    } else {
      editProducts.push({
        productName: productName,
        productCategory: productCategory,
        description: description,
        price: price,
        unit: '',
        image: _editProductImageData || '',
        sortOrder: editProducts.length + 1
      });
    }

    renderEditProductList();
    closeEditProductModal();
  }

  function editEditProductItem(index) {
    if (index < 0 || index >= editProducts.length) return;
    var item = editProducts[index];
    
    openEditProductModal();
    
    _isEditProductEditing = true;
    _currentEditProductEditIndex = index;
    
    setTimeout(function() {
      var nameEl = document.getElementById('edit-product-name-input');
      var categoryEl = document.getElementById('edit-product-category-input');
      var descEl = document.getElementById('edit-product-description-input');
      var priceEl = document.getElementById('edit-product-price-input');
      
      if (nameEl) nameEl.value = item.productName || '';
      if (categoryEl) categoryEl.value = item.productCategory || '';
      if (descEl) descEl.value = item.description || '';
      if (priceEl) priceEl.value = item.price == null ? '' : item.price;
      
      if (item.image) {
        _editProductImageData = item.image;
        var preview = document.getElementById('edit-product-image-preview');
        var wrap = document.getElementById('edit-product-image-preview-wrap');
        var dropzone = document.getElementById('edit-product-image-dropzone');
        if (preview) preview.src = _editProductImageData;
        if (wrap) wrap.classList.remove('hidden');
        if (dropzone) dropzone.classList.add('hidden');
      } else {
        clearEditProductImagePreview();
      }
    }, 100);
  }

  function removeEditProductItem(index) {
    if (index < 0 || index >= editProducts.length) return;
    editProducts.splice(index, 1);
    editProducts = editProducts.map(function(item, idx) {
      item.sortOrder = idx + 1;
      return item;
    });
    renderEditProductList();
  }

  function normalizeEditProductItems(items) {
    if (!Array.isArray(items)) return [];
    return items.map(function(item, index) {
      return {
        ProductID: String(item && (item.ProductID || item.productId || '')).trim(),
        productName: String(item && (item.productName || item.ProductName || item.name || '')).trim(),
        productCategory: String(item && (item.productCategory || item.ProductCategory || item.category || '')).trim(),
        description: String(item && (item.description || item.Description || item.detail || '')).trim(),
        price: String(item && (item.price != null ? item.price : item.Price != null ? item.Price : '')).trim(),
        unit: String(item && (item.unit != null ? item.unit : item.Unit != null ? item.Unit : '')).trim(),
        image: String(item && (item.image || item.Image || '')).trim(),
        sortOrder: item && item.sortOrder != null ? item.sortOrder : (item && item.SortOrder != null ? item.SortOrder : (index + 1))
      };
    }).filter(function(item) {
      return item.productName || item.productCategory || item.description || item.price;
    });
  }

  // ===== Product Detail Modal (view-only, inside shop detail) =====
  var _pdProducts = [];
  var _pdShopItem = null;

  function openProductDetailModal(index) {
    if (index < 0 || index >= _pdProducts.length) return;
    var product = _pdProducts[index];
    var modal = document.getElementById('modal-product-detail');
    var content = document.getElementById('modal-product-detail-content');
    if (!modal || !content) return;

    var categoryText = String(product.productCategory || product.ProductCategory || '').trim() || 'ไม่ระบุ';
    var priceText = formatProductPriceDisplay(product.price || product.Price);
    var nameText = String(product.productName || product.ProductName || '-').trim();

    document.getElementById('pd-category').textContent = categoryText;
    document.getElementById('pd-name').textContent = nameText;
    document.getElementById('pd-price').textContent = priceText === '-' ? 'ไม่ระบุราคา' : priceText;

    var body = document.getElementById('pd-body');
    body.innerHTML = buildProductDetailBody(product, _pdShopItem ? _pdShopItem.gallery : []);

    modal.classList.remove('opacity-0', 'pointer-events-none');
    content.classList.remove('scale-95', 'translate-y-4');
    if (window.lucide) lucide.createIcons();
  }

  function closeProductDetailModal() {
    var modal = document.getElementById('modal-product-detail');
    var content = document.getElementById('modal-product-detail-content');
    if (!modal || !content) return;
    modal.classList.add('opacity-0', 'pointer-events-none');
    content.classList.add('scale-95', 'translate-y-4');
  }

  function buildProductDetailBody(product, gallery) {
    var desc = String(product.description || product.Description || '').trim();
    var unit = String(product.unit || product.Unit || '').trim();
    var category = String(product.productCategory || product.ProductCategory || '').trim();
    var pIdx = Array.isArray(_pdProducts) ? _pdProducts.indexOf(product) : -1;
    var imgSrc = findProductGalleryImageUrl(product, gallery, pIdx >= 0 ? pIdx : 0, 'gallery');
    var html = '';

    if (imgSrc) {
      html += '<div class="mb-3">'
        + '<img src="' + escapeHtml(imgSrc) + '" alt="รูปสินค้า" class="product-image-preview w-full" style="max-height:220px">'
        + '</div>';
    }

    if (desc) {
      html += '<section class="detail-section detail-section-sky">'
        + '<div class="mb-3"><h4 class="detail-section-title">รายละเอียดสินค้า</h4>'
        + '<p class="detail-section-subtitle">คำอธิบายสินค้า</p></div>'
        + '<p class="text-sm text-slate-700 leading-relaxed whitespace-pre-line">' + escapeHtml(desc) + '</p>'
        + '</section>';
    }

    var infoRows = '';
    if (category) {
      infoRows += '<div class="detail-field"><p class="detail-label">หมวดหมู่</p><p class="detail-value">' + escapeHtml(category) + '</p></div>';
    }
    if (unit) {
      infoRows += '<div class="detail-field"><p class="detail-label">หน่วย</p><p class="detail-value">' + escapeHtml(unit) + '</p></div>';
    }
    if (infoRows) {
      html += '<section class="detail-section detail-section-emerald">'
        + '<div class="mb-3"><h4 class="detail-section-title">ข้อมูลเพิ่มเติม</h4></div>'
        + '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' + infoRows + '</div>'
        + '</section>';
    }

    if (!html) {
      html = '<div class="py-8 text-center text-slate-500 text-sm">ไม่มีรายละเอียดเพิ่มเติม</div>';
    }

    return html;
  }

  function buildProductCardsSection(products, gallery) {
    if (!Array.isArray(products) || products.length === 0) return '';
    var PREVIEW_MAX = 4;
    var showAll = products.length > PREVIEW_MAX;
    var previewProducts = showAll ? products.slice(0, PREVIEW_MAX) : products;
    var cards = previewProducts.map(function(item, index) {
      var name = escapeHtml(String(item.productName || item.ProductName || '-').trim());
      var category = escapeHtml(String(item.productCategory || item.ProductCategory || '').trim() || 'ไม่ระบุ');
      var desc = String(item.description || item.Description || '').trim();
      var price = formatProductPriceDisplay(item.price || item.Price);
      var idxInAll = products.indexOf(item);
      var imgSrc = findProductGalleryImageUrl(item, gallery, idxInAll >= 0 ? idxInAll : index, 'thumb');
      var thumbHtml = imgSrc
        ? '<img src="' + escapeHtml(imgSrc) + '" alt="รูปสินค้า" class="product-thumb">'
        : '<div class="product-thumb-placeholder"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg></div>';
      var descriptionId = 'detail-product-description-' + (idxInAll >= 0 ? idxInAll : index);
      return '<div class="pd-product-card" onclick="openProductDetailModal(' + index + ')" role="button" tabindex="0">'
        + '<div class="flex items-start gap-2">'
        +   thumbHtml
        +   '<div class="min-w-0 flex-1">'
        +     '<div class="font-bold text-sm text-slate-800 leading-snug line-clamp-2">' + name + '</div>'
        +     '<div class="flex items-center gap-2 mt-1">'
        +       '<span class="pd-chip">' + category + '</span>'
        +       '<span class="pd-price">' + escapeHtml(price) + '</span>'
        +     '</div>'
        +   '</div>'
        + '</div>'
        + (desc ? '<div class="mt-2 text-xs text-slate-500">' + buildMobileCollapsibleText(desc, descriptionId, 'leading-relaxed') + '</div>' : '')
        + '<div class="mt-2 flex justify-end">'
        +   '<span class="pd-view-btn"><i data-lucide="eye" class="w-3.5 h-3.5"></i>ดูรายละเอียด</span>'
        + '</div>'
        + '</div>';
    }).join('');

    var seeAllBtn = showAll
      ? '<button type="button" onclick="openProductCatalogModal()"'
        + ' class="w-full mt-3 py-2.5 px-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition-colors flex items-center justify-center gap-2">'
        + '<i data-lucide="layout-grid" class="w-4 h-4"></i>'
        + 'ดูสินค้าทั้งหมด ' + products.length + ' รายการ'
        + '</button>'
      : '';

    return '<section class="detail-section detail-section-emerald">'
      + '<div class="flex items-center justify-between gap-3 mb-4">'
      +   '<div>'
      +     '<h4 class="detail-section-title">รายการสินค้า</h4>'
      +     '<p class="detail-section-subtitle">' + products.length + ' รายการ' + (showAll ? ' · แสดง ' + PREVIEW_MAX + ' รายการแรก' : ' · แตะเพื่อดูรายละเอียด') + '</p>'
      +   '</div>'
      +   '<span class="detail-pill detail-pill-emerald">Products</span>'
      + '</div>'
      + '<div class="pd-product-grid">' + cards + '</div>'
      + seeAllBtn
      + '</section>';
  }

  // ── PRODUCT CATALOG MODAL ──────────────────────────────────────────
  // ANCHOR: openProductCatalogModal / closeProductCatalogModal

  function openProductCatalogModal() {
    // Use _pdProducts / _pdShopItem set by renderDetailModalBody
    _catalogProducts = Array.isArray(_pdProducts) ? _pdProducts : [];
    _catalogGallery  = (_pdShopItem && Array.isArray(_pdShopItem.gallery)) ? _pdShopItem.gallery : [];
    _catalogShopName = (_pdShopItem && (_pdShopItem.BusinessName || '')) || '';
    _catalogSearchQuery = '';
    _catalogCategory    = '';
    _catalogSortKey     = 'default';
    _catalogPage        = 1;

    var modal = document.getElementById('modal-product-catalog');
    var panel = document.getElementById('modal-product-catalog-content');
    if (!modal || !panel) return;

    var titleEl = document.getElementById('pc-shop-name');
    var countEl = document.getElementById('pc-total-count');
    if (titleEl) titleEl.textContent = _catalogShopName || 'รายการสินค้า';
    if (countEl) countEl.textContent = _catalogProducts.length + ' รายการ';

    var searchEl = document.getElementById('pc-search-input');
    if (searchEl) { searchEl.value = ''; }

    _buildCatalogCategoryChips();
    renderCatalogProducts();

    document.body.style.overflow = 'hidden';
    modal.classList.remove('opacity-0', 'pointer-events-none');
    panel.classList.remove('scale-95', 'translate-y-4');
    if (window.lucide) lucide.createIcons();
  }

  function closeProductCatalogModal() {
    var modal = document.getElementById('modal-product-catalog');
    var panel = document.getElementById('modal-product-catalog-content');
    if (!modal || !panel) return;
    modal.classList.add('opacity-0', 'pointer-events-none');
    panel.classList.add('scale-95', 'translate-y-4');
    document.body.style.overflow = '';
    _catalogProducts = [];
    _catalogGallery  = [];
    _catalogSearchQuery = '';
    _catalogCategory    = '';
  }

  function _buildCatalogCategoryChips() {
    var bar = document.getElementById('pc-category-bar');
    if (!bar) return;
    var cats = {};
    _catalogProducts.forEach(function(p) {
      var c = getCatalogProductCategoryText(p);
      if (c) cats[c] = (cats[c] || 0) + 1;
    });
    var html = '<button type="button" onclick="setCatalogCategory(\'\')" class="pc-chip' + (_catalogCategory === '' ? ' pc-chip-active' : '') + '">\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14</button>';
    Object.keys(cats).forEach(function(c) {
      var active = _catalogCategory === c ? ' pc-chip-active' : '';
      html += '<button type="button" onclick="setCatalogCategory(\'' + escapeHtml(c).replace(/'/g, "\\'") + '\')" class="pc-chip' + active + '">' + escapeHtml(c) + '</button>';
    });
    bar.innerHTML = html;
  }

  function getCatalogProductNameText(product) {
    return String(product && (product.productName || product.ProductName || '')).trim();
  }

  function getCatalogProductDescriptionText(product) {
    return String(product && (product.description || product.Description || '')).trim();
  }

  function getCatalogProductCategoryText(product) {
    return String(product && (product.productCategory || product.ProductCategory || '')).trim();
  }

  function getCatalogProductPriceNumber(product) {
    var raw = String(product && (product.price != null ? product.price : (product.Price != null ? product.Price : ''))).trim();
    if (!raw) return null;
    var numericText = raw.replace(new RegExp('[^0-9.]', 'g'), '');
    if (!numericText) return null;
    var numeric = Number(numericText);
    return Number.isNaN(numeric) ? null : numeric;
  }

  // ANCHOR: renderCatalogProducts (filter+sort+paginate+render)
  function renderCatalogProducts() {
    var q = String(_catalogSearchQuery || '').trim().toLowerCase();
    var filtered = _catalogProducts.filter(function(p) {
      var name = getCatalogProductNameText(p).toLowerCase();
      var desc = getCatalogProductDescriptionText(p).toLowerCase();
      var cat  = getCatalogProductCategoryText(p).toLowerCase();
      if (_catalogCategory && cat !== _catalogCategory.toLowerCase()) return false;
      if (q && name.indexOf(q) === -1 && desc.indexOf(q) === -1 && cat.indexOf(q) === -1) return false;
      return true;
    });

    if (_catalogSortKey === 'name-asc') {
      filtered.sort(function(a, b) {
        return getCatalogProductNameText(a).localeCompare(getCatalogProductNameText(b), 'th', { sensitivity: 'base' });
      });
    } else if (_catalogSortKey === 'price-asc') {
      filtered.sort(function(a, b) { return (getCatalogProductPriceNumber(a) || 0) - (getCatalogProductPriceNumber(b) || 0); });
    } else if (_catalogSortKey === 'price-desc') {
      filtered.sort(function(a, b) { return (getCatalogProductPriceNumber(b) || 0) - (getCatalogProductPriceNumber(a) || 0); });
    }

    var total = filtered.length;
    var pageSize = _catalogPageSize;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (_catalogPage > totalPages) _catalogPage = 1;
    var start = (_catalogPage - 1) * pageSize;
    var pageItems = filtered.slice(start, start + pageSize);

    var resultEl = document.getElementById('pc-result-count');
    if (resultEl) {
      if (total === 0) {
        resultEl.textContent = '\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32';
      } else {
        resultEl.textContent = '\u0e41\u0e2a\u0e14\u0e07 ' + (start+1) + '-' + Math.min(start+pageSize, total) + ' \u0e08\u0e32\u0e01 ' + total + ' \u0e23\u0e32\u0e22\u0e01\u0e32\u0e23';
      }
    }

    var grid = document.getElementById('pc-product-grid');
    var emptyEl = document.getElementById('pc-empty');
    if (!grid) return;

    if (total === 0) {
      grid.innerHTML = '';
      if (emptyEl) emptyEl.classList.remove('hidden');
    } else {
      if (emptyEl) emptyEl.classList.add('hidden');
      grid.innerHTML = pageItems.map(function(item, i) {
        var realIndex = start + i;
        var name     = escapeHtml(String(item.productName || item.ProductName || '-').trim());
        var category = escapeHtml(String(item.productCategory || item.ProductCategory || '').trim() || '\u0e44\u0e21\u0e48\u0e23\u0e30\u0e1a\u0e38');
        var desc     = String(item.description || item.Description || '').trim();
        var price    = formatProductPriceDisplay(item.price || item.Price);
        var catIdx = _catalogProducts.indexOf(item);
        var imgSrc = findProductGalleryImageUrl(item, _catalogGallery, catIdx >= 0 ? catIdx : realIndex, 'thumb');
        var imgHtml = imgSrc
          ? '<img src="' + escapeHtml(imgSrc) + '" alt="\u0e23\u0e39\u0e1b\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32" class="pc-img" loading="eager">'
          : '<div class="pc-img-placeholder"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg></div>';
        return '<div class="pc-card">'
          +   '<div class="pc-card-image">' + imgHtml + '</div>'
          +   '<div class="pc-card-body">'
          +     '<div class="pc-card-category">' + category + '</div>'
          +     '<div class="pc-card-name">' + name + '</div>'
          +     (desc ? '<p class="pc-card-desc">' + escapeHtml(desc) + '</p>' : '')
          +     '<div class="pc-card-footer">'
          +       '<span class="pc-card-price">' + escapeHtml(price) + '</span>'
          +       '<button type="button" onclick="openCatalogProductDetail(' + realIndex + ')" class="pc-detail-btn">'
          +         '<i data-lucide="eye" class="w-3.5 h-3.5"></i>\u0e14\u0e39\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14'
          +       '</button>'
          +     '</div>'
          +   '</div>'
          + '</div>';
      }).join('');
    }

    _renderCatalogPagination(total, totalPages);
    if (window.lucide) lucide.createIcons();
  }

  function _renderCatalogPagination(total, totalPages) {
    var el = document.getElementById('pc-pagination');
    if (!el) return;
    if (total === 0 || totalPages <= 1) { el.innerHTML = ''; return; }
    var p = _catalogPage;
    el.innerHTML = '<div class="flex items-center justify-between gap-3 px-1">'
      + '<button type="button" onclick="catalogGoToPage(' + (p-1) + ')" ' + (p <= 1 ? 'disabled' : '') + ' class="pc-pag-btn">'
      +   '<i data-lucide="chevron-left" class="w-4 h-4"></i>'
      + '</button>'
      + '<span class="text-sm text-slate-600 font-medium">' + p + ' / ' + totalPages + '</span>'
      + '<button type="button" onclick="catalogGoToPage(' + (p+1) + ')" ' + (p >= totalPages ? 'disabled' : '') + ' class="pc-pag-btn">'
      +   '<i data-lucide="chevron-right" class="w-4 h-4"></i>'
      + '</button>'
      + '</div>';
    if (window.lucide) lucide.createIcons();
  }

  var _catalogSearchTimer = null;
  function handleCatalogSearch(value) {
    clearTimeout(_catalogSearchTimer);
    _catalogSearchTimer = setTimeout(function() {
      _catalogSearchQuery = String(value || '').trim();
      _catalogPage = 1;
      renderCatalogProducts();
    }, 250);
  }

  function setCatalogCategory(cat) {
    _catalogCategory = String(cat || '');
    _catalogPage = 1;
    _buildCatalogCategoryChips();
    renderCatalogProducts();
  }

  function setCatalogSort(key) {
    _catalogSortKey = String(key || 'default');
    _catalogPage = 1;
    renderCatalogProducts();
  }

  function catalogGoToPage(page) {
    var q = String(_catalogSearchQuery || '').trim().toLowerCase();
    var total = _catalogProducts.filter(function(p) {
      var name = getCatalogProductNameText(p).toLowerCase();
      var desc = getCatalogProductDescriptionText(p).toLowerCase();
      var cat  = getCatalogProductCategoryText(p).toLowerCase();
      if (_catalogCategory && cat !== _catalogCategory.toLowerCase()) return false;
      if (q && name.indexOf(q) === -1 && desc.indexOf(q) === -1 && cat.indexOf(q) === -1) return false;
      return true;
    }).length;
    var totalPages = Math.max(1, Math.ceil(total / _catalogPageSize));
    if (page < 1 || page > totalPages) return;
    _catalogPage = page;
    var grid = document.getElementById('pc-product-grid');
    if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    renderCatalogProducts();
  }

  function openCatalogProductDetail(index) {
    // Set _pdProducts to full catalog list so openProductDetailModal index maps correctly
    _pdProducts = _catalogProducts;
    openProductDetailModal(index);
  }

  // ─────────────────────────────────────────────────────────────────────

  function ensureToastHost() {
    let host = document.getElementById('toast-host');
    if (host) return host;

    host = document.createElement('div');
    host.id = 'toast-host';
    host.className = 'toast-host';
    document.body.appendChild(host);
    return host;
  }

  function showToast(message, tone) {
    const host = ensureToastHost();
    const toast = document.createElement('div');
    const isError = tone === 'error';
    const isInfo = tone === 'info';
    const icon = isError ? 'alert-circle' : (isInfo ? 'info' : 'check-circle-2');

    toast.className = 'toast-item ' + (isError ? 'toast-error' : (isInfo ? 'toast-info' : 'toast-success'));
    toast.innerHTML = '<div class="toast-shell">'
      + '<div class="toast-icon"><i data-lucide="' + icon + '" style="width:20px;height:20px;"></i></div>'
      + '<div class="toast-message">' + escapeHtml(message) + '</div>'
      + '</div>';

    host.appendChild(toast);
    if (window.lucide) lucide.createIcons();

    requestAnimationFrame(function() {
      toast.classList.add('toast-show');
    });

    setTimeout(function() {
      toast.classList.remove('toast-show');
      setTimeout(function() {
        if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
      }, 220);
    }, 3000);
  }

  // ========== STEP NAVIGATION ==========
  function updateStepUI() {
    for (let i = 1; i <= totalSteps; i++) {
      const stepEl = document.getElementById('step-' + i);
      const indEl = document.querySelector('[data-step="' + i + '"]');
      if (stepEl) {
        stepEl.classList.toggle('block', i === currentStep);
        stepEl.classList.toggle('hidden', i !== currentStep);
      }
      if (indEl) {
        indEl.classList.remove('active', 'completed');
        if (i === currentStep) indEl.classList.add('active');
        else if (i < currentStep) indEl.classList.add('completed');
      }
    }
    // Progress bar
    const progressBar = document.getElementById('progress-bar');
    if (progressBar) {
      const pct = ((currentStep - 1) / (totalSteps - 1)) * 100;
      progressBar.style.width = pct + '%';
    }
    // Buttons
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const btnSubmit = document.getElementById('btn-submit');
    if (btnPrev) btnPrev.classList.toggle('hidden', currentStep === 1);
    if (btnNext) btnNext.classList.toggle('hidden', currentStep === totalSteps);
    if (btnSubmit) {
      const showSubmit = currentStep === totalSteps;
      btnSubmit.classList.toggle('hidden', !showSubmit);
      btnSubmit.disabled = false;
    }
    syncGuestActionControls();
    if (window.lucide) lucide.createIcons();
  }

  function validateStep(step) {
    const stepEl = document.getElementById('step-' + step);
    if (!stepEl) return true;
    let valid = true;
    stepEl.querySelectorAll('[required]').forEach(function(input) {
      const errEl = input.nextElementSibling;
      if (!input.value.trim()) {
        input.classList.add('has-error');
        valid = false;
      } else {
        input.classList.remove('has-error');
        if (errEl && errEl.classList.contains('error-msg')) errEl.style.display = 'none';
      }
    });
    // Phone validation
    const phoneInput = stepEl.querySelector('[name="phone"]');
    if (phoneInput && phoneInput.value.trim()) {
      const digits = phoneInput.value.replace(new RegExp('[^0-9]', 'g'), '');
      if (digits.length < 9 || digits.length > 10) {
        phoneInput.classList.add('has-error');
        valid = false;
      }
    }
    return valid;
  }

  function nextStep() {
    if (!validateStep(currentStep)) return;
    if (currentStep < totalSteps) {
      saveFormDraft();
      currentStep++;
      updateStepUI();
      window.scrollTo(0, 0);
    }
  }

  function prevStep() {
    if (currentStep > 1) {
      saveFormDraft();
      currentStep--;
      updateStepUI();
      window.scrollTo(0, 0);
    }
  }

  // ========== IMAGE UPLOAD ==========
  function toJpegFileName(fileName) {
    var base = String(fileName || 'upload').trim().replace(/\.[^/.]+$/, '');
    if (!base) base = 'upload';
    return base + '.jpg';
  }

  function compressImageFileForUpload(file, options) {
    return new Promise(function(resolve, reject) {
      if (!file || !file.type || !file.type.match(/^image\//i)) {
        reject(new Error('ไฟล์ไม่ใช่รูปภาพ'));
        return;
      }
      var opts = options || {};
      var maxDimension = Number(opts.maxDimension || 1800);
      var quality = Number(opts.quality || 0.82);
      var reader = new FileReader();
      reader.onload = function(e) {
        var img = new Image();
        img.onload = function() {
          var width = img.width;
          var height = img.height;
          var longest = Math.max(width, height);
          if (longest > maxDimension) {
            var ratio = maxDimension / longest;
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          var canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          var ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('ไม่สามารถประมวลผลรูปภาพได้'));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          var dataUrl = canvas.toDataURL('image/jpeg', quality);
          var blob = null;
          try {
            blob = dataURLToBlob_(dataUrl, 'image/jpeg');
          } catch (err) {
            reject(err);
            return;
          }
          var normalizedName = toJpegFileName(file.name);
          var compressedFile = new File([blob], normalizedName, {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          resolve({
            dataUrl: dataUrl,
            blob: blob,
            file: compressedFile,
            width: width,
            height: height
          });
        };
        img.onerror = function() {
          reject(new Error('ไม่สามารถอ่านรูปภาพได้'));
        };
        img.src = e.target.result;
      };
      reader.onerror = function() {
        reject(new Error('ไม่สามารถอ่านไฟล์ได้'));
      };
      reader.readAsDataURL(file);
    });
  }

  function dataURLToBlob_(dataUrl, mimeType) {
    var parts = String(dataUrl || '').split(',');
    if (parts.length < 2) throw new Error('รูปภาพไม่ถูกต้อง');
    var binary = atob(parts[1]);
    var len = binary.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType || 'image/jpeg' });
  }

  function previewImage(input, name) {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];
    var maxSizeMB = 5; // Allow larger file, we compress it anyway
    if (file.size > maxSizeMB * 1024 * 1024) {
      alert('ไฟล์รูปภาพต้นฉบับต้องมีขนาดไม่เกิน ' + maxSizeMB + ' MB');
      input.value = '';
      return;
    }
    
    compressImageFileForUpload(file, { maxDimension: 1200, quality: 0.8 })
      .then(function(result) {
        var dataUrl = result.dataUrl || '';
        if (!dataUrl) throw new Error('ไม่สามารถประมวลผลรูปภาพได้');
        var imgEl = document.getElementById('img-' + name);
        var placeholder = document.querySelector('#preview-' + name + ' .placeholder');
        var b64 = document.getElementById('b64-' + name);
        var clearBtn = document.getElementById('clear-' + name);
        if (imgEl) { imgEl.src = dataUrl; imgEl.classList.remove('hidden'); }
        if (placeholder) placeholder.style.display = 'none';
        if (b64) b64.value = dataUrl;
        if (clearBtn) clearBtn.classList.remove('hidden');
        saveFormDraft();
      })
      .catch(function() {
        alert('ไม่สามารถย่อขนาดรูปภาพได้ กรุณาเลือกรูปใหม่');
        input.value = '';
      });
  }

  function clearImage(name) {
    var img = document.getElementById('img-' + name);
    var placeholder = document.querySelector('#preview-' + name + ' .placeholder');
    var b64 = document.getElementById('b64-' + name);
    var fileInput = document.getElementById('file-' + name);
    var clearBtn = document.getElementById('clear-' + name);
    if (img) { img.src = ''; img.classList.add('hidden'); }
    if (placeholder) placeholder.style.display = '';
    if (b64) b64.value = '';
    if (fileInput) fileInput.value = '';
    if (clearBtn) clearBtn.classList.add('hidden');
    saveFormDraft();
  }

  // ========== MAP URL PARSER & GPS ==========
  function parseCoordinatesFromUrl(input) {
    if (!input || typeof input !== 'string') return null;
    var str = input.trim();
    if (!str) return null;

    var atMatch = str.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
      return { lat: parseFloat(atMatch[1]).toFixed(6), lng: parseFloat(atMatch[2]).toFixed(6) };
    }

    var qMatch = str.match(/[?&](?:q|query|ll|loc|destination)=(-?\d+\.\d+)(?:%2C|,|%20|\+)(-?\d+\.\d+)/i);
    if (qMatch) {
      return { lat: parseFloat(qMatch[1]).toFixed(6), lng: parseFloat(qMatch[2]).toFixed(6) };
    }

    var placeMatch = str.match(/(?:place|dir)\/(-?\d+\.\d+)(?:%2C|,|%20|\+)(-?\d+\.\d+)/i);
    if (placeMatch) {
      return { lat: parseFloat(placeMatch[1]).toFixed(6), lng: parseFloat(placeMatch[2]).toFixed(6) };
    }

    var directMatch = str.match(/^(-?\d{1,2}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)$/);
    if (directMatch) {
      var latNum = parseFloat(directMatch[1]);
      var lngNum = parseFloat(directMatch[2]);
      if (!isNaN(latNum) && !isNaN(lngNum) && latNum >= -90 && latNum <= 90 && lngNum >= -180 && lngNum <= 180) {
        return { lat: latNum.toFixed(6), lng: lngNum.toFixed(6) };
      }
    }

    return null;
  }

  var mapUrlResolveDebounceTimer = null;
  function resolveMapUrlAsync(urlStr, isEdit) {
    if (mapUrlResolveDebounceTimer) {
      clearTimeout(mapUrlResolveDebounceTimer);
      mapUrlResolveDebounceTimer = null;
    }
    var cleanUrl = String(urlStr || '').trim();
    if (!cleanUrl) return;

    var preview = isEdit ? document.getElementById('edit-map-preview') : document.getElementById('gps-map-preview');
    var coordsEl = isEdit ? document.getElementById('edit-map-coords') : document.getElementById('gps-map-coords');
    if (coordsEl) coordsEl.textContent = 'กำลังดึงพิกัดจากลิงก์...';
    if (preview) preview.classList.remove('hidden');

    mapUrlResolveDebounceTimer = setTimeout(function() {
      if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run
          .withSuccessHandler(function(res) {
            if (res && res.success && res.lat && res.lng) {
              if (isEdit) {
                var form = document.getElementById('editForm');
                if (form) {
                  var latEl = form.querySelector('[name="latitude"]');
                  var lngEl = form.querySelector('[name="longitude"]');
                  if (latEl) latEl.value = res.lat;
                  if (lngEl) lngEl.value = res.lng;
                }
                updateEditMapPreview();
              } else {
                var lat = document.getElementById('latitude');
                var lon = document.getElementById('longitude');
                if (lat) lat.value = res.lat;
                if (lon) lon.value = res.lng;

                var mapPreview = document.getElementById('gps-map-preview');
                var mapCoords = document.getElementById('gps-map-coords');
                var mapLink = document.getElementById('gps-map-link');
                var mapIframe = document.getElementById('gps-map-iframe');
                if (mapCoords) mapCoords.textContent = res.lat + ', ' + res.lng;
                if (mapLink) mapLink.href = 'https://maps.google.com/?q=' + encodeURIComponent(res.lat + ',' + res.lng);
                if (mapIframe) mapIframe.src = 'https://maps.google.com/maps?q=' + encodeURIComponent(res.lat + ',' + res.lng) + '&z=15&output=embed';
                if (mapPreview) mapPreview.classList.remove('hidden');
                if (window.lucide) lucide.createIcons();
                saveFormDraft();
              }
            } else {
              if (coordsEl && coordsEl.textContent === 'กำลังดึงพิกัดจากลิงก์...') {
                if (preview) preview.classList.add('hidden');
              }
            }
          })
          .withFailureHandler(function() {
            if (coordsEl && coordsEl.textContent === 'กำลังดึงพิกัดจากลิงก์...') {
              if (preview) preview.classList.add('hidden');
            }
          })
          .resolveMapLocationUrl(cleanUrl);
      }
    }, 400);
  }

  function handleMapUrlInput(value, isEdit) {
    var coords = parseCoordinatesFromUrl(value);
    if (isEdit) {
      var form = document.getElementById('editForm');
      if (!form) return;
      var latEl = form.querySelector('[name="latitude"]');
      var lngEl = form.querySelector('[name="longitude"]');
      if (coords) {
        if (latEl) latEl.value = coords.lat;
        if (lngEl) lngEl.value = coords.lng;
        updateEditMapPreview();
      } else if (value && value.trim()) {
        resolveMapUrlAsync(value, true);
      } else {
        if (latEl) latEl.value = '';
        if (lngEl) lngEl.value = '';
        updateEditMapPreview();
      }
    } else {
      var lat = document.getElementById('latitude');
      var lon = document.getElementById('longitude');
      var clearBtn = document.getElementById('btn-clear-map-url');
      if (clearBtn) clearBtn.classList.toggle('hidden', !value);

      if (coords) {
        if (lat) lat.value = coords.lat;
        if (lon) lon.value = coords.lng;

        var mapPreview = document.getElementById('gps-map-preview');
        var mapCoords = document.getElementById('gps-map-coords');
        var mapLink = document.getElementById('gps-map-link');
        var mapIframe = document.getElementById('gps-map-iframe');
        if (mapCoords) mapCoords.textContent = coords.lat + ', ' + coords.lng;
        if (mapLink) mapLink.href = 'https://maps.google.com/?q=' + coords.lat + ',' + coords.lng;
        if (mapIframe) mapIframe.src = 'https://maps.google.com/maps?q=' + coords.lat + ',' + coords.lng + '&z=15&output=embed';
        if (mapPreview) mapPreview.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
        saveFormDraft();
      } else if (value && value.trim()) {
        resolveMapUrlAsync(value, false);
      } else if (!value.trim()) {
        if (lat) lat.value = '';
        if (lon) lon.value = '';
        var mapPreview2 = document.getElementById('gps-map-preview');
        if (mapPreview2) mapPreview2.classList.add('hidden');
        saveFormDraft();
      }
    }
  }

  function clearMapUrlInput(isEdit) {
    if (isEdit) {
      var input = document.getElementById('edit_map_url_input');
      if (input) input.value = '';
      handleMapUrlInput('', true);
    } else {
      var input2 = document.getElementById('map_url_input');
      if (input2) input2.value = '';
      var clearBtn = document.getElementById('btn-clear-map-url');
      if (clearBtn) clearBtn.classList.add('hidden');
      handleMapUrlInput('', false);
    }
  }

  function updateEditMapPreview() {
    var form = document.getElementById('editForm');
    if (!form) return;
    var latEl = form.querySelector('[name="latitude"]');
    var lngEl = form.querySelector('[name="longitude"]');
    var latVal = latEl ? latEl.value.trim() : '';
    var lngVal = lngEl ? lngEl.value.trim() : '';

    var preview = document.getElementById('edit-map-preview');
    var coordsEl = document.getElementById('edit-map-coords');
    var linkEl = document.getElementById('edit-map-link');
    var iframeEl = document.getElementById('edit-map-iframe');

    if (latVal && lngVal && latVal !== '-' && lngVal !== '-') {
      if (coordsEl) coordsEl.textContent = latVal + ', ' + lngVal;
      if (linkEl) linkEl.href = 'https://maps.google.com/?q=' + encodeURIComponent(latVal + ',' + lngVal);
      if (iframeEl) iframeEl.src = 'https://maps.google.com/maps?q=' + encodeURIComponent(latVal + ',' + lngVal) + '&z=15&output=embed';
      if (preview) preview.classList.remove('hidden');
      if (window.lucide) lucide.createIcons();
    } else {
      if (preview) preview.classList.add('hidden');
    }
  }

  function getEditLocation() {
    if (!navigator.geolocation) {
      alert('เบราว์เซอร์ไม่รองรับ GPS');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        var form = document.getElementById('editForm');
        if (!form) return;
        var latVal = pos.coords.latitude.toFixed(6);
        var lonVal = pos.coords.longitude.toFixed(6);
        var latEl = form.querySelector('[name="latitude"]');
        var lngEl = form.querySelector('[name="longitude"]');
        var urlInput = document.getElementById('edit_map_url_input');
        if (latEl) latEl.value = latVal;
        if (lngEl) lngEl.value = lonVal;
        if (urlInput) urlInput.value = latVal + ', ' + lonVal;
        updateEditMapPreview();
      },
      function() {
        alert('ไม่สามารถระบุตำแหน่งได้ กรุณาอนุญาตการเข้าถึง GPS');
      },
      { timeout: 15000 }
    );
  }

  function getLocation() {
    if (!navigator.geolocation) {
      alert('เบราว์เซอร์ไม่รองรับ GPS');
      return;
    }
    var btn = document.getElementById('btn-gps');
    var btnContent = document.getElementById('gps-btn-content');
    var btnSpinner = document.getElementById('gps-btn-spinner');
    if (btn) btn.disabled = true;
    if (btnContent) btnContent.classList.add('hidden');
    if (btnSpinner) btnSpinner.classList.remove('hidden');

    navigator.geolocation.getCurrentPosition(
      function(pos) {
        var lat = document.getElementById('latitude');
        var lon = document.getElementById('longitude');
        var latVal = pos.coords.latitude.toFixed(6);
        var lonVal = pos.coords.longitude.toFixed(6);
        if (lat) lat.value = latVal;
        if (lon) lon.value = lonVal;

        var urlInput = document.getElementById('map_url_input');
        if (urlInput) urlInput.value = latVal + ', ' + lonVal;
        var clearBtn = document.getElementById('btn-clear-map-url');
        if (clearBtn) clearBtn.classList.remove('hidden');

        var mapPreview = document.getElementById('gps-map-preview');
        var mapCoords = document.getElementById('gps-map-coords');
        var mapLink = document.getElementById('gps-map-link');
        var mapIframe = document.getElementById('gps-map-iframe');
        if (mapCoords) mapCoords.textContent = latVal + ', ' + lonVal;
        if (mapLink) mapLink.href = 'https://maps.google.com/?q=' + latVal + ',' + lonVal;
        if (mapIframe) mapIframe.src = 'https://maps.google.com/maps?q=' + latVal + ',' + lonVal + '&z=15&output=embed';
        if (mapPreview) mapPreview.classList.remove('hidden');

        if (btn) btn.disabled = false;
        if (btnContent) btnContent.classList.remove('hidden');
        if (btnSpinner) btnSpinner.classList.add('hidden');
        if (window.lucide) lucide.createIcons();
        saveFormDraft();
      },
      function() {
        alert('ไม่สามารถระบุตำแหน่งได้ กรุณาอนุญาตการเข้าถึง GPS');
        if (btn) btn.disabled = false;
        if (btnContent) btnContent.classList.remove('hidden');
        if (btnSpinner) btnSpinner.classList.add('hidden');
      },
      { timeout: 15000 }
    );
  }

  // ========== SPECIFIC GALLERY UPLOAD ==========
  var _uploadQueue = [];
  var _isUploading = false;
  var _uploadTotal = 0;
  var _uploadCompleted = 0;

  function triggerSpecificGalleryPicker(role) {
    var limit = getSpecificGalleryLimit(role);
    if (limit && getSpecificGalleryRoleCount(role) >= limit) {
      showToast('อัปโหลดรูปประเภทนี้ได้สูงสุด ' + limit + ' รูป', 'error');
      return;
    }
    var input = document.getElementById('file-gallery-' + role);
    if (input) input.click();
  }

  function getSpecificGalleryLimit(role) {
    if (role === 'product') return 100;
    if (role === 'shop' || role === 'activity') return 3;
    return 0;
  }

  function getSpecificGalleryRoleCount(role) {
    return _uploadQueue.filter(function(q) {
      return q.role === role;
    }).length;
  }

  function updateSpecificGalleryCountLabels() {
    var shopCount = getSpecificGalleryRoleCount('shop');
    var activityCount = getSpecificGalleryRoleCount('activity');
    var productCount = getSpecificGalleryRoleCount('product');
    var totalCount = _uploadQueue.length;
    var shopCountEl = document.getElementById('gallery-count-shop');
    var productCountEl = document.getElementById('gallery-count-product');
    var activityCountEl = document.getElementById('gallery-count-activity');
    var countEl = document.getElementById('gallery-upload-count');
    var shopBtn = document.querySelector('button[onclick="triggerSpecificGalleryPicker(\'shop\')"]');
    var activityBtn = document.querySelector('button[onclick="triggerSpecificGalleryPicker(\'activity\')"]');
    if (shopCountEl) shopCountEl.textContent = shopCount + ' / 3';
    if (productCountEl) productCountEl.textContent = productCount + ' / 100';
    if (activityCountEl) activityCountEl.textContent = activityCount + ' / 3';
    if (countEl) countEl.textContent = String(totalCount);
    if (shopBtn) {
      shopBtn.disabled = shopCount >= 3 || _isUploading;
      shopBtn.classList.toggle('opacity-50', shopCount >= 3 || _isUploading);
      shopBtn.classList.toggle('cursor-not-allowed', shopCount >= 3 || _isUploading);
    }
    if (activityBtn) {
      activityBtn.disabled = activityCount >= 3 || _isUploading;
      activityBtn.classList.toggle('opacity-50', activityCount >= 3 || _isUploading);
      activityBtn.classList.toggle('cursor-not-allowed', activityCount >= 3 || _isUploading);
    }
    return { shop: shopCount, activity: activityCount, product: productCount, total: totalCount };
  }

  function handleSpecificGalleryFileSelection(event, role) {
    var input = event && event.target ? event.target : null;
    var files = input ? input.files : null;
    if (!files || files.length === 0) return;

    var limit = getSpecificGalleryLimit(role);
    if (!limit) {
      if (event && event.target) event.target.value = '';
      return;
    }

    var currentRoleCount = getSpecificGalleryRoleCount(role);
    var seenKeys = {};
    _uploadQueue.forEach(function(q) {
      if (q && q.role === role) seenKeys[q.fileKey] = true;
    });
    var spaceLeft = limit - currentRoleCount;
    var added = 0;

    var list = Array.prototype.slice.call(files);
    var idx = 0;
    var hadError = false;

    function finalizeQueueSelection() {
      if (added === 0) {
        if (currentRoleCount >= limit) {
          showToast('อัปโหลดรูปประเภทนี้ได้สูงสุด ' + limit + ' รูป', 'error');
        } else if (!hadError) {
          showToast('ไม่มีรูปใหม่ที่สามารถเพิ่มได้', 'error');
        }
      }
      if (input) input.value = '';
      renderUploadPreviews();
      lucide.createIcons();
    }

    function processNextFile() {
      if (idx >= list.length) {
        finalizeQueueSelection();
        return;
      }
      if (spaceLeft <= 0) {
        showToast('อัปโหลดรูปประเภทนี้ได้สูงสุด ' + limit + ' รูป', 'error');
        finalizeQueueSelection();
        return;
      }
      var file = list[idx++];
      if (!file || !file.type || !file.type.match('image.*')) {
        processNextFile();
        return;
      }
      var fileKey = [role, file.name, file.size, file.lastModified].join('|');
      if (seenKeys[fileKey]) {
        processNextFile();
        return;
      }

      compressImageFileForUpload(file)
        .then(function(result) {
          _uploadQueue.push({
            id: Date.now() + '_' + idx + '_' + Math.random().toString(36).slice(2, 8),
            file: result.file,
            fileKey: fileKey,
            role: role,
            previewUrl: result.dataUrl,
            previewIsObjectUrl: false
          });
          seenKeys[fileKey] = true;
          spaceLeft--;
          added++;
        })
        .catch(function() {
          if (!hadError) {
            showToast('บางรูปไม่สามารถย่อขนาดได้และถูกข้าม', 'error');
            hadError = true;
          }
        })
        .finally(processNextFile);
    }

    processNextFile();
  }

  function clearUploadQueue() {
    _uploadQueue.forEach(function(item) {
      if (item && item.previewUrl && item.previewIsObjectUrl) URL.revokeObjectURL(item.previewUrl);
    });
    _uploadQueue = [];
    updateSpecificGalleryCountLabels();
    var countEl = document.getElementById('gallery-upload-count');
    if (countEl) countEl.textContent = '0';
    var uploadContainer = document.getElementById('gallery-upload-container');
    if (uploadContainer) uploadContainer.classList.add('hidden');
    var uploadStatus = document.getElementById('gallery-upload-status');
    if (uploadStatus) {
      uploadStatus.textContent = 'ยังไม่เริ่มอัปโหลด';
      uploadStatus.className = 'font-semibold text-slate-600';
    }
    var uploadProgressText = document.getElementById('gallery-upload-progress-text');
    var uploadProgressBar = document.getElementById('gallery-upload-progress-bar');
    var uploadProgressMeta = document.getElementById('gallery-upload-progress-meta');
    if (uploadProgressText) uploadProgressText.textContent = '0%';
    if (uploadProgressBar) uploadProgressBar.style.width = '0%';
    if (uploadProgressMeta) uploadProgressMeta.textContent = '0 / 0';
    ['shop', 'product', 'activity'].forEach(function(role) {
      var grid = document.getElementById('gallery-preview-' + role);
      if (grid) grid.innerHTML = '';
    });
  }

  function renderUploadPreviews() {
    ['shop', 'product', 'activity'].forEach(function(role) {
      var grid = document.getElementById('gallery-preview-' + role);
      if (!grid) return;
      var roleFiles = _uploadQueue.filter(function(q) { return q.role === role; });
      if (!roleFiles.length) {
        grid.innerHTML = '<div class="gallery-empty-state">ยังไม่มีรูปที่เลือก</div>';
        return;
      }
      grid.innerHTML = roleFiles.map(function(item) {
        return ''
          + '<div class="gallery-preview-card">'
          +   '<img src="' + item.previewUrl + '" alt="รูปที่เลือก" class="gallery-preview-image">'
          +   '<button type="button" onclick="removeQueuedImage(\'' + item.id + '\')" class="gallery-preview-remove-btn absolute top-2 right-2 z-10" aria-label="ลบรูปที่เลือก">'
          +     '<i data-lucide="x" class="w-4 h-4"></i>'
          +   '</button>'
          +   '<span class="gallery-preview-badge absolute top-2 left-2 z-10">รูปใหม่</span>'
          + '</div>';
      }).join('');
    });

    updateSpecificGalleryCountLabels();
    
    var uploadContainer = document.getElementById('gallery-upload-container');
    if (uploadContainer) {
      if (_isUploading || _uploadQueue.length > 0) {
        uploadContainer.classList.remove('hidden');
      } else {
        uploadContainer.classList.add('hidden');
      }
    }
  }

  function removeQueuedImage(id) {
    if (_isUploading) return;
    var nextQueue = [];
    _uploadQueue.forEach(function(q) {
      if (q.id === id) {
        if (q.previewUrl && q.previewIsObjectUrl) URL.revokeObjectURL(q.previewUrl);
        return;
      }
      nextQueue.push(q);
    });
    _uploadQueue = nextQueue;
    renderUploadPreviews();
    lucide.createIcons();
  }

  function startGalleryUpload(shopId) {
    if (_uploadQueue.length === 0) {
      finishFormSubmission();
      return;
    }
    _isUploading = true;
    _uploadTotal = _uploadQueue.length;
    _uploadCompleted = 0;
    
    document.getElementById('gallery-upload-status').textContent = 'กำลังอัปโหลด...';
    document.getElementById('gallery-upload-progress-text').textContent = '0%';
    document.getElementById('gallery-upload-progress-bar').style.width = '0%';
    document.getElementById('gallery-upload-progress-meta').textContent = '0 / ' + _uploadTotal;
    
    var btns = document.querySelectorAll('button[onclick^="triggerSpecificGalleryPicker"], button[onclick^="removeQueuedImage"]');
    btns.forEach(function(b) { b.disabled = true; b.style.opacity = '0.5'; });

    uploadNextImage(shopId);
  }

  function uploadNextImage(shopId) {
    if (_uploadQueue.length === 0) {
      finishGalleryUpload();
      return;
    }
    
    var item = _uploadQueue[0];
    var reader = new FileReader();
    reader.onload = function(e) {
      var base64Data = e.target.result.split(',')[1];
      google.script.run
        .withSuccessHandler(function(res) {
          if (res && res.success) {
            _uploadQueue.shift();
            if (item.previewUrl && item.previewIsObjectUrl) URL.revokeObjectURL(item.previewUrl);
            _uploadCompleted++;
            updateUploadProgress();
            uploadNextImage(shopId);
          } else {
            if (handleSessionInvalidResponse(res)) return;
            handleUploadError(shopId, res.message || 'Server error');
          }
        })
        .withFailureHandler(function(err) {
          handleUploadError(shopId, err.message || 'Network error');
        })
        .uploadGalleryImage({
          shopId: shopId,
          token: _token,
          guestAccessKey: getGuestSessionAccessKey(shopId),
          fileName: item.file && item.file.name ? item.file.name : 'upload.jpg',
          mimeType: item.file && item.file.type ? item.file.type : 'image/jpeg',
          imageRole: item.role,
          sortOrder: _uploadTotal - _uploadQueue.length + 1,
          idempotencyKey: item.id,
          base64: base64Data
        });
    };
    reader.readAsDataURL(item.file);
  }
  
  function updateUploadProgress() {
    var pct = Math.round((_uploadCompleted / _uploadTotal) * 100);
    document.getElementById('gallery-upload-progress-text').textContent = pct + '%';
    document.getElementById('gallery-upload-progress-bar').style.width = pct + '%';
    document.getElementById('gallery-upload-progress-meta').textContent = _uploadCompleted + ' / ' + _uploadTotal;
    renderUploadPreviews();
    lucide.createIcons();
  }

  function handleUploadError(shopId, msg) {
    _isUploading = false;
    _isSaving = false;
    showToast('อัปโหลดล้มเหลว: ' + msg, 'error');
    document.getElementById('gallery-upload-status').textContent = 'เกิดข้อผิดพลาด ให้กดบันทึกใหม่';
    document.getElementById('gallery-upload-status').classList.replace('text-blue-600', 'text-red-600');
    
    var btns = document.querySelectorAll('button[onclick^="triggerSpecificGalleryPicker"], button[onclick^="removeQueuedImage"]');
    btns.forEach(function(b) { b.disabled = false; b.style.opacity = '1'; });
    
    // Enable submit button to retry
    var btnSubmit = document.getElementById('btn-submit');
    var submitContent = document.getElementById('submit-content');
    var submitSpinner = document.getElementById('submit-spinner');
    if (btnSubmit) btnSubmit.disabled = false;
    if (submitContent) submitContent.classList.remove('hidden');
    if (submitSpinner) submitSpinner.classList.add('hidden');
  }

  function finishGalleryUpload() {
    _isUploading = false;
    document.getElementById('gallery-upload-status').textContent = 'อัปโหลดเสร็จสิ้น';
    document.getElementById('gallery-upload-status').className = 'font-semibold text-emerald-600';
    finishFormSubmission();
  }

  var _savedResponse = null;
  function finishFormSubmission() {
    var response = _savedResponse;
    _isSaving = false;
    var submitContent = document.getElementById('submit-content');
    var submitSpinner = document.getElementById('submit-spinner');
    var btnSubmit = document.getElementById('btn-submit');
    
    if (submitContent) submitContent.classList.remove('hidden');
    if (submitSpinner) submitSpinner.classList.add('hidden');
    if (btnSubmit) btnSubmit.disabled = false;
    var modal = document.getElementById('modal-success');
    var content = document.getElementById('modal-success-content');
    var idText = document.getElementById('success-id-text');
    if (idText) idText.textContent = 'รหัส: ' + String((response && response.id) || '-');
    if (modal) modal.classList.remove('opacity-0', 'pointer-events-none');
    if (content) content.classList.remove('scale-95');
    document.body.style.overflow = 'hidden';
    showToast('บันทึกข้อมูลและอัปโหลดรูปสำเร็จ' + (response && response.id ? ' · ' + response.id : ''), 'success');
    try {
      lpClientCacheClearRecords();
      lpClientCacheClearAllDetails();
    } catch (e) { }
    loadRecords();
  }

  // ========== FORM SUBMIT ==========
  function submitForm() {
    if (_isSaving) return;
    if (!validateStep(currentStep)) return;
    var form = document.getElementById('mainForm');
    if (!form) return;
    var submitContent = document.getElementById('submit-content');
    var submitSpinner = document.getElementById('submit-spinner');
    var btnSubmit = document.getElementById('btn-submit');
    _isSaving = true;
    if (submitContent) submitContent.classList.add('hidden');
    if (submitSpinner) submitSpinner.classList.remove('hidden');
    if (btnSubmit) btnSubmit.disabled = true;

    var data = {};
    var elements = form.elements;
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (!el.name) continue;
      if (el.type === 'checkbox') {
        if (!data[el.name]) data[el.name] = [];
        if (el.checked) data[el.name].push(el.value);
      } else if (el.type === 'radio') {
        if (el.checked) data[el.name] = el.value;
      } else {
        data[el.name] = el.value;
      }
    }
    data.phone = cleanPhoneValue(data.phone);
    data.products = currentProducts.map(function(item, index) {
      return {
        productName: String(item.productName || '').trim(),
        productCategory: String(item.productCategory || '').trim(),
        description: String(item.description || '').trim(),
        price: String(item.price || '').trim(),
        unit: String(item.unit || '').trim(),
        image: String(item.image || '').trim(),
        sortOrder: item.sortOrder != null ? item.sortOrder : (index + 1)
      };
    });
    data.main_products = currentProducts.map(function(item) {
      return String(item.productName || '').trim();
    }).filter(Boolean).join(', ');
    data.avg_price = calculateAverageProductPrice(currentProducts) === '-' ? '' : String(calculateAverageProductPrice(currentProducts)).replace(new RegExp('[^0-9.]', 'g'), '');

    try {
      google.script.run
        .withSuccessHandler(function(response) {
          if (response && response.success) {
            _savedResponse = response;
            _lastSavedBackendId = String(response.backendId || '');
            if (!isAuthenticated() && response.backendId && response.guestAccessKey) {
              rememberGuestSessionAccess(response.backendId, response.guestAccessKey);
            }
            if (_uploadQueue.length > 0) {
              if (response.backendId) {
                startGalleryUpload(response.backendId);
              } else {
                handleUploadError(null, 'ไม่สามารถระบุ ID ของร้านค้าเพื่ออัปโหลดรูปได้');
              }
            } else {
              finishFormSubmission();
            }
          } else {
            _isSaving = false;
            if (submitContent) submitContent.classList.remove('hidden');
            if (submitSpinner) submitSpinner.classList.add('hidden');
            if (btnSubmit) btnSubmit.disabled = false;
            if (handleSessionInvalidResponse(response)) return;
            alert('เกิดข้อผิดพลาด: ' + (response ? response.message : 'ไม่ทราบสาเหตุ'));
          }
        })
        .withFailureHandler(function(err) {
          _isSaving = false;
          if (submitContent) submitContent.classList.remove('hidden');
          if (submitSpinner) submitSpinner.classList.add('hidden');
          if (btnSubmit) btnSubmit.disabled = false;
          alert('เชื่อมต่อเซิร์ฟเวอร์ล้มเหลว: ' + (err ? err.message : 'ไม่ทราบสาเหตุ'));
        })
        .saveRecord({ data: data, token: _token });
    } catch (err) {
      _isSaving = false;
      if (submitContent) submitContent.classList.remove('hidden');
      if (submitSpinner) submitSpinner.classList.add('hidden');
      if (btnSubmit) btnSubmit.disabled = false;
      alert('เกิดข้อผิดพลาด: ' + (err && err.message ? err.message : 'ไม่ทราบสาเหตุ'));
    }
  }

  function closeSuccessModal(action) {
    var modal = document.getElementById('modal-success');
    var content = document.getElementById('modal-success-content');
    if (modal) modal.classList.add('opacity-0', 'pointer-events-none');
    if (content) content.classList.add('scale-95');
    document.body.style.overflow = '';
    if (action === 'new') {
      document.getElementById('mainForm').reset();
      currentStep = 1;
      updateStepUI();
      ['image_shop', 'image_product', 'image_activity'].forEach(function(n) { clearImage(n); });
      currentProducts = [];
      renderProductList();
      clearUploadQueue();
      clearFormDraft();
      _savedResponse = null;
      if (window.activateTab) window.activateTab('form');
      else switchTab('form');
    } else if (action === 'latest') {
      switchTab('list');
      loadRecords();
      setTimeout(function() {
        if (!_lastSavedBackendId) return;
        var latestIndex = recordsData.findIndex(function(record) {
          return String(record && record.BackendId || '') === _lastSavedBackendId;
        });
        if (latestIndex >= 0) openDetailModal(latestIndex);
      }, 450);
    } else {
      switchTab('list');
    }
  }

  window.nextStep = nextStep;
  window.prevStep = prevStep;
  window.updateStepUI = updateStepUI;
  window.previewImage = previewImage;
  window.clearImage = clearImage;
  window.getLocation = getLocation;
  window.submitForm = submitForm;
  window.closeSuccessModal = closeSuccessModal;

  function switchTab(tabName) {
    var tabIndicator = document.getElementById('tab-indicator');
    var tabs = {
      form: document.getElementById('tab-form'),
      list: document.getElementById('tab-list'),
      dashboard: document.getElementById('tab-dashboard')
    };
    var sections = {
      form: document.getElementById('section-form'),
      list: document.getElementById('section-list'),
      dashboard: document.getElementById('section-dashboard')
    };
    var positions = { form: 'translateX(0)', list: 'translateX(100%)', dashboard: 'translateX(200%)' };

    if (tabName !== 'form') saveFormDraft();

    tabIndicator.style.transform = positions[tabName] || positions.form;

    Object.keys(tabs).forEach(function(key) {
      if (!tabs[key]) return;
      if (key === tabName) {
        tabs[key].classList.remove('text-slate-500');
        tabs[key].classList.add('text-white');
      } else {
        tabs[key].classList.remove('text-white');
        tabs[key].classList.add('text-slate-500');
      }
    });

    Object.keys(sections).forEach(function(key) {
      if (!sections[key]) return;
      if (key === tabName) sections[key].classList.remove('hidden');
      else sections[key].classList.add('hidden');
    });

    if (tabName === 'list' && recordsData.length === 0) {
      loadRecords();
    }
    if (tabName === 'dashboard') {
      if (recordsData.length === 0) {
        loadRecords();
      }
      setTimeout(function() { renderDashboard(); }, 50);
    }
  }

  // ========== RECORDS MANAGEMENT ==========
  function loadRecords() {
    const loading = document.getElementById('list-loading');
    const empty = document.getElementById('list-empty');
    const list = document.getElementById('data-list');
    const sectionList = document.getElementById('section-list');
    const requestToken = ++_listRequestToken;

    var cachedRecords = lpClientCacheReadRecords();
    if (cachedRecords) {
      if (requestToken !== _listRequestToken) return;
      recordsData = cachedRecords;
      currentPage = 1;
      currentPageSize = getItemsPerPage();
      if (loading) loading.classList.add('hidden');
      if (empty) empty.classList.add('hidden');
      applySearchFilter(false);
      var dashSec = document.getElementById('section-dashboard');
      if (dashSec && !dashSec.classList.contains('hidden')) {
        renderDashboard();
      }
      checkDeepLinkRoute_();
      return;
    }

    if (sectionList && sectionList.classList.contains('hidden') === false) {
      loading.classList.remove('hidden');
      empty.classList.add('hidden');
      list.innerHTML = '';
    }
    
    google.script.run
      .withSuccessHandler((data) => {
        if (requestToken !== _listRequestToken) return;
        recordsData = Array.isArray(data) ? data : [];
        try { lpClientCacheWriteRecords(recordsData); } catch (e) { }
        currentPage = 1;
        currentPageSize = getItemsPerPage();
        applySearchFilter(false);
        var dashSec = document.getElementById('section-dashboard');
        if (dashSec && !dashSec.classList.contains('hidden')) {
          renderDashboard();
        }
        checkDeepLinkRoute_();
      })
      .withFailureHandler(() => {
        if (requestToken !== _listRequestToken) return;
        loading.classList.add('hidden');
        if(recordsData.length === 0) empty.classList.remove('hidden');
        updateSearchUi();
      })
      .getRecords();
  }

  // Returns the deep-link target ID from the GAS-injected template variable (primary)
  // or falls back to window.location.search (local dev / non-GAS environments).
  // Checks params: id, backendId, shopId — in that priority order.
  function getDeepLinkParam_() {
    try {
      var injected = String(window._DEEP_LINK_PARAM || '').trim();
      if (injected) return injected;
    } catch (e) { }
    try {
      var params = new URLSearchParams(window.location.search);
      return String(params.get('id') || params.get('backendId') || params.get('shopId') || '').trim();
    } catch (e) { }
    return '';
  }

  var _hasProcessedDeepLink = false;
  function checkDeepLinkRoute_() {
    if (_hasProcessedDeepLink || !Array.isArray(recordsData) || recordsData.length === 0) return;
    try {
      var targetId = getDeepLinkParam_();
      if (!targetId) return;
      _hasProcessedDeepLink = true;
      switchTab('list');
      var foundIndex = recordsData.findIndex(function(r) {
        return String(r && r.LamproundID || '').trim() === targetId ||
               String(r && r.BackendId || '').trim() === targetId ||
               String(r && r.ShopID || '').trim() === targetId;
      });
      if (foundIndex >= 0) {
        setTimeout(function() {
          openDetailModal(foundIndex);
        }, 120);
      } else {
        showToast('ไม่พบข้อมูลร้านค้าตามรหัสที่ระบุ (' + targetId + ')', 'error');
      }
    } catch (e) { }
  }

  var LAMPANG_AMPHOE_UNSPECIFIED = 'ไม่ระบุ';
  var LAMPANG_AMPHOE_ALIAS_ROWS = [
    { canonical: 'เมืองปาน', aliases: ['อำเภอเมืองปาน', 'อ.เมืองปาน', 'เมืองปาน'] },
    { canonical: 'เมืองลำปาง', aliases: ['อำเภอเมืองลำปาง', 'อ.เมืองลำปาง', 'เมืองลำปาง', 'อำเภอเมือง', 'อ.เมือง'] },
    { canonical: 'แม่เมาะ', aliases: ['อำเภอแม่เมาะ', 'อ.แม่เมาะ', 'แม่เมาะ'] },
    { canonical: 'เกาะคา', aliases: ['อำเภอเกาะคา', 'อ.เกาะคา', 'เกาะคา'] },
    { canonical: 'เสริมงาม', aliases: ['อำเภอเสริมงาม', 'อ.เสริมงาม', 'เสริมงาม'] },
    { canonical: 'งาว', aliases: ['อำเภองาว', 'อ.งาว', 'งาว'] },
    { canonical: 'แจ้ห่ม', aliases: ['อำเภอแจ้ห่ม', 'อ.แจ้ห่ม', 'แจ้ห่ม'] },
    { canonical: 'วังเหนือ', aliases: ['อำเภอวังเหนือ', 'อ.วังเหนือ', 'วังเหนือ'] },
    { canonical: 'เถิน', aliases: ['อำเภอเถิน', 'อ.เถิน', 'เถิน'] },
    { canonical: 'แม่พริก', aliases: ['อำเภอแม่พริก', 'อ.แม่พริก', 'แม่พริก'] },
    { canonical: 'แม่ทะ', aliases: ['อำเภอแม่ทะ', 'อ.แม่ทะ', 'แม่ทะ'] },
    { canonical: 'สบปราบ', aliases: ['อำเภอสบปราบ', 'อ.สบปราบ', 'สบปราบ'] },
    { canonical: 'ห้างฉัตร', aliases: ['อำเภอห้างฉัตร', 'อ.ห้างฉัตร', 'ห้างฉัตร'] }
  ];
  var LAMPANG_AMPHOE_ALIAS_INDEX = (function() {
    var pairs = [];
    LAMPANG_AMPHOE_ALIAS_ROWS.forEach(function(row) {
      (row.aliases || []).forEach(function(alias) {
        pairs.push({ alias: alias, canonical: row.canonical });
      });
    });
    pairs.sort(function(a, b) { return b.alias.length - a.alias.length; });
    return pairs;
  })();

  function normalizeLocationForAmphoe(text) {
    return String(text || '').replace(/\s+/g, ' ').replace(/อ\.\s+/g, 'อ.').trim();
  }

  function parseAmphoeFromLocation(locationText) {
    var normalized = normalizeLocationForAmphoe(locationText);
    if (!normalized) return LAMPANG_AMPHOE_UNSPECIFIED;
    for (var i = 0; i < LAMPANG_AMPHOE_ALIAS_INDEX.length; i++) {
      var entry = LAMPANG_AMPHOE_ALIAS_INDEX[i];
      if (normalized.indexOf(entry.alias) !== -1) return entry.canonical;
    }
    return LAMPANG_AMPHOE_UNSPECIFIED;
  }

  function getNormalizedSearchQuery() {
    return String(listSearchQuery || '').trim().toLowerCase();
  }

  function getNormalizedAmphoeFilter() {
    return String(listAmphoeFilter || '').trim();
  }

  function hasActiveListFilter() {
    return !!getNormalizedSearchQuery() || !!getNormalizedAmphoeFilter();
  }

  function matchesRecordSearch(item, normalizedQuery) {
    if (!normalizedQuery) return true;
    const businessName = String(item.BusinessName || '').toLowerCase();
    const ownerName = String(item.OwnerName || '').toLowerCase();
    const lamproundId = String(item.LamproundID || '').toLowerCase();
    const queryDigits = cleanPhoneValue(normalizedQuery);
    const phoneDigits = cleanPhoneValue(item.Phone || '');
    const phoneMatches = queryDigits.length > 0 && phoneDigits.indexOf(queryDigits) !== -1;
    return businessName.indexOf(normalizedQuery) !== -1 ||
           ownerName.indexOf(normalizedQuery) !== -1 ||
           lamproundId.indexOf(normalizedQuery) !== -1 ||
           phoneMatches;
  }

  function matchesRecordAmphoe(item, amphoeFilter) {
    if (!amphoeFilter) return true;
    return parseAmphoeFromLocation(item && item.LocationText) === amphoeFilter;
  }

  function updateSearchUi() {
    const input = document.getElementById('list-search-input');
    const clearBtn = document.getElementById('list-search-clear');
    const amphoeSelect = document.getElementById('list-amphoe-filter');
    const summary = document.getElementById('list-search-summary');
    const normalizedQuery = getNormalizedSearchQuery();
    const amphoeFilter = getNormalizedAmphoeFilter();
    const totalCount = recordsData.length;
    const filteredCount = filteredRecordsData.length;

    if (input && input.value !== listSearchQuery) input.value = listSearchQuery;
    if (amphoeSelect && amphoeSelect.value !== listAmphoeFilter) amphoeSelect.value = listAmphoeFilter;
    if (clearBtn) {
      if (normalizedQuery) {
        clearBtn.classList.remove('hidden');
        clearBtn.classList.add('flex');
      } else {
        clearBtn.classList.add('hidden');
        clearBtn.classList.remove('flex');
      }
    }

    if (summary) {
      if (!normalizedQuery && !amphoeFilter) {
        summary.textContent = 'แสดงข้อมูลทั้งหมด ' + totalCount + ' รายการ';
      } else {
        var parts = ['พบ ' + filteredCount + ' จาก ' + totalCount + ' รายการ'];
        if (normalizedQuery) parts.push('สำหรับ "' + listSearchQuery.trim() + '"');
        if (amphoeFilter) parts.push('ในอำเภอ ' + amphoeFilter);
        summary.textContent = parts.join(' ');
      }
    }
  }

  function applySearchFilter(resetPage) {
    const normalizedQuery = getNormalizedSearchQuery();
    const amphoeFilter = getNormalizedAmphoeFilter();
    filteredRecordsData = (!normalizedQuery && !amphoeFilter)
      ? recordsData.slice()
      : recordsData.filter(function(item) {
          return matchesRecordSearch(item, normalizedQuery) && matchesRecordAmphoe(item, amphoeFilter);
        });

    if (resetPage !== false) currentPage = 1;
    updateSearchUi();
    renderRecords();
  }

  function handleSearchInput(event) {
    listSearchQuery = event && event.target ? event.target.value : '';
    applySearchFilter(true);
  }

  function handleAmphoeFilterChange(event) {
    listAmphoeFilter = event && event.target ? event.target.value : '';
    applySearchFilter(true);
  }

  function clearSearchInput() {
    listSearchQuery = '';
    applySearchFilter(true);
  }

  function renderRecords() {
    const loading = document.getElementById('list-loading');
    const empty = document.getElementById('list-empty');
    const emptyMessage = empty ? empty.querySelector('p') : null;
    const emptyAction = empty ? empty.querySelector('button') : null;
    const list = document.getElementById('data-list');
    const count = document.getElementById('record-count');
    const pagination = document.getElementById('pagination-controls');
    const activeRecords = filteredRecordsData.slice();
    const hasFilter = hasActiveListFilter();
    
    currentPageSize = getItemsPerPage();
    loading.classList.add('hidden');
    count.innerText = hasFilter ? activeRecords.length : recordsData.length;
    updateSearchUi();
    
    if (activeRecords.length === 0) {
      empty.classList.remove('hidden');
      list.innerHTML = '';
      if (emptyMessage) emptyMessage.textContent = hasFilter ? 'ไม่พบรายการที่ตรงกับตัวกรอง' : 'ยังไม่มีข้อมูลในระบบ';
      if (emptyAction) emptyAction.classList.toggle('hidden', hasFilter);
      if (pagination) {
        pagination.classList.add('hidden');
        pagination.innerHTML = '';
      }
      return;
    }
    
    empty.classList.add('hidden');
    if (emptyAction) emptyAction.classList.remove('hidden');

    const totalPages = Math.max(1, Math.ceil(activeRecords.length / currentPageSize));
    currentPage = Math.min(Math.max(currentPage, 1), totalPages);
    const startIndex = (currentPage - 1) * currentPageSize;
    const endIndex = Math.min(startIndex + currentPageSize, activeRecords.length);
    const pageRecords = activeRecords.slice(startIndex, endIndex);
    
    let html = '';
    pageRecords.forEach((item) => {
      const index = recordsData.findIndex((record) => record.BackendId === item.BackendId);
      if (index === -1) return;
      let dateStr = item.CreatedAt || '';
      
      html += `
        <div class="record-card pl-5 group" onclick="openDetailModal(${index})">
          <div class="flex justify-between items-start mb-2">
            <div class="min-w-0 flex-1 mr-2">
              <span class="inline-flex items-center gap-1 px-2.5 py-1 bg-gradient-to-r from-blue-500 to-sky-400 text-white text-xs font-bold rounded-lg mb-2 shadow-sm shadow-blue-200">
                <i data-lucide="hash" class="w-3 h-3"></i>
                ${escapeHtml(item.LamproundID || 'ไม่มีรหัส')}
              </span>
              <h3 class="font-bold text-slate-800 line-clamp-1 text-base">${escapeHtml(item.BusinessName || '-')}</h3>
            </div>
            ${canEditRecord(item) ? `<button type="button" onclick="event.stopPropagation(); openEditModal(${index})" class="inline-flex items-center justify-center w-11 h-11 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors shrink-0" title="แก้ไข"><i data-lucide="pencil" class="w-4 h-4"></i></button>` : ''}
            ${canDeleteRecord(item) ? `<button type="button" onclick="event.stopPropagation(); confirmDeleteModal(${index})" class="inline-flex items-center justify-center w-11 h-11 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors shrink-0" title="ลบ"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : ''}
          </div>
          
          <div class="flex items-center text-sm text-slate-600 mb-2.5">
            <div class="w-6 h-6 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center mr-2 shrink-0">
              <i data-lucide="user" class="w-3.5 h-3.5"></i>
            </div>
            <span class="line-clamp-1 font-medium">${escapeHtml(item.OwnerName || '-')}</span>
          </div>
          
          <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between mt-3 pt-3 border-t border-slate-100 gap-3">
            <div class="flex items-center gap-2">
              <div class="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <i data-lucide="phone" class="w-3.5 h-3.5"></i>
              </div>
              <span class="text-sm font-semibold text-slate-700 tracking-wider">${escapeHtml(normalizePhoneDisplay(item.Phone))}</span>
            </div>
            <div class="flex flex-wrap items-center gap-2 justify-between sm:justify-end">
              <div class="text-xs text-slate-400 hidden sm:flex items-center gap-1 mr-1">
                <i data-lucide="calendar" class="w-3 h-3 opacity-60"></i>
                <span>${dateStr}</span>
              </div>
              <button type="button" onclick="event.stopPropagation(); downloadPdf('${item.BackendId}')" class="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-red-500 to-rose-400 text-white text-xs font-semibold shadow-sm shadow-red-200 hover:shadow-md hover:shadow-red-300 transition-all duration-200 hover:-translate-y-0.5" id="btn-pdf-${item.BackendId}">
                <i data-lucide="file-text" class="w-4 h-4"></i>
                โหลด PDF
              </button>
              <button type="button" onclick="event.stopPropagation(); openDetailModal(${index})" class="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-sky-400 text-white text-xs font-semibold shadow-sm shadow-blue-200 hover:shadow-md hover:shadow-blue-300 transition-all duration-200 hover:-translate-y-0.5">
                <i data-lucide="eye" class="w-4 h-4"></i>
                ดูรายละเอียด
              </button>
            </div>
          </div>
        </div>
      `;
    });
    
    list.innerHTML = html;

    if (pagination) {
      pagination.classList.toggle('hidden', totalPages <= 1);
      pagination.innerHTML = totalPages <= 1 ? '' : `
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div class="text-sm text-slate-500">
            แสดง ${startIndex + 1}-${endIndex} จาก ${activeRecords.length} รายการ
            <span class="hidden md:inline"> · คอมพิวเตอร์ 12 รายการ/หน้า</span>
            <span class="hidden md:inline"> · มือถือ 6 รายการ/หน้า</span>
          </div>
          <div class="flex items-center gap-2 self-start sm:self-auto">
            <button type="button" ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${currentPage - 1})" class="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50">
              ก่อนหน้า
            </button>
            <span class="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-700">${currentPage}/${totalPages}</span>
            <button type="button" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${currentPage + 1})" class="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50">
              ถัดไป
            </button>
          </div>
        </div>
      `;
    }
    lucide.createIcons();
  }

  function goToPage(pageNumber) {
    const totalPages = Math.max(1, Math.ceil(filteredRecordsData.length / currentPageSize));
    const nextPage = Math.min(Math.max(pageNumber, 1), totalPages);
    if (nextPage === currentPage) return;
    currentPage = nextPage;
    renderRecords();
  }

  function extractDriveFileIdFromUrlString_(s) {
    var u = String(s || '').trim();
    if (!u || u.indexOf('data:') === 0) return '';
    var m = u.match(/thumbnail\?id=([a-zA-Z0-9_-]+)/i);
    if (m) return m[1];
    m = u.match(/\/file\/d\/([a-zA-Z0-9_-]+)\//i);
    if (m) return m[1];
    m = u.match(/\/d\/([a-zA-Z0-9_-]+)/i);
    if (m && u.indexOf('googleusercontent.com') !== -1) return m[1];
    m = u.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m && u.indexOf('drive.google') !== -1) return m[1];
    return '';
  }

  var DRIVE_IMG_WIDTH_ = { thumb: 320, gallery: 800, full: 1600 };

  function driveFileIdToDisplayUrl_(id, width) {
    var clean = String(id || '').trim();
    if (!clean) return '';
    var w = Number(width);
    if (!w || w < 1) w = DRIVE_IMG_WIDTH_.full;
    return 'https://lh3.googleusercontent.com/d/' + clean + '=w' + w;
  }

  function normalizeDriveImageUrlString_(u, sizeKey) {
    var sk = sizeKey || 'full';
    var w = DRIVE_IMG_WIDTH_[sk] || DRIVE_IMG_WIDTH_.full;
    var s = String(u || '').trim();
    if (!s || s.indexOf('data:') === 0) return s;
    var extracted = extractDriveFileIdFromUrlString_(s);
    if (extracted) return driveFileIdToDisplayUrl_(extracted, w);
    return s;
  }

  function galleryImageUrlForDisplay(g, sizeKey) {
    if (!g) return '';
    var sk = sizeKey || 'full';
    var w = DRIVE_IMG_WIDTH_[sk] || DRIVE_IMG_WIDTH_.full;
    var id = String(g.DriveFileId || '').trim();
    if (id) return driveFileIdToDisplayUrl_(id, w);
    return normalizeDriveImageUrlString_(String(g.ThumbnailUrl || g.DriveUrl || '').trim(), sk);
  }

  function isGalleryRoleProductLike_(g) {
    var r = String(g && g.ImageRole || '').trim().toLowerCase();
    return r === 'product' || r === 'gallery';
  }

  function isUnlinkedGalleryProductId_(pid) {
    var p = String(pid || '').trim();
    if (!p) return true;
    var lower = p.toLowerCase();
    return lower === 'product' || lower === 'shop' || lower === 'activity' || lower === 'gallery';
  }

  function findProductGalleryImageUrl(product, gallery, productIndexInShopProducts, sizeKey) {
    if (!product || !Array.isArray(gallery)) return '';
    var sk = sizeKey || 'full';
    var direct = String(product.image || product.Image || '').trim();
    if (direct) return normalizeDriveImageUrlString_(direct, sk);
    var pId = String(product.ProductID || '').trim();
    var linked = gallery.find(function(g) {
      if (!isGalleryRoleProductLike_(g)) return false;
      var gid = String(g.ProductID || '').trim();
      if (isUnlinkedGalleryProductId_(gid)) return false;
      return gid === pId;
    });
    if (linked) return galleryImageUrlForDisplay(linked, sk);
    var sortVal = product.SortOrder != null ? Number(product.SortOrder) : (product.sortOrder != null ? Number(product.sortOrder) : (productIndexInShopProducts + 1));
    var loose = gallery.filter(function(g) {
      return isGalleryRoleProductLike_(g) && isUnlinkedGalleryProductId_(g.ProductID);
    }).sort(function(a, b) {
      return Number(a.SortOrder || 0) - Number(b.SortOrder || 0);
    });
    var byOrder = loose.find(function(g) { return Number(g.SortOrder || 0) === sortVal; });
    if (byOrder) return galleryImageUrlForDisplay(byOrder, sk);
    if (loose[productIndexInShopProducts]) return galleryImageUrlForDisplay(loose[productIndexInShopProducts], sk);
    return '';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(new RegExp('&', 'g'), '&amp;')
      .replace(new RegExp('<', 'g'), '&lt;')
      .replace(new RegExp('>', 'g'), '&gt;')
      .replace(new RegExp('"', 'g'), '&quot;')
      .replace(new RegExp("'", 'g'), '&#39;');
  }

  function formatDetailValue(value) {
    if (value === null || value === undefined || value === '') return '-';
    const text = String(value).trim();
    if (!text) return '-';

    if (text.startsWith('[') && text.endsWith(']')) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          return parsed.length ? parsed.join(', ') : '-';
        }
      } catch (e) {}
    }

    return text;
  }

  function normalizePhoneDisplay(value) {
    const text = formatDetailValue(value);
    if (text === '-') return text;

    const digits = text.replace(new RegExp('[^0-9]', 'g'), '');
    if (!digits) return text;

    // เบอร์โทร 10 หลัก ขึ้นต้น 0 → ถูกต้องแล้ว
    if (digits.length === 10 && digits.charAt(0) === '0') {
      return digits;
    }
    // 9 หลัก ไม่ขึ้น 0 → เติม 0 (Google Sheets ตัด 0 นำหน้าออก)
    if (digits.length === 9 && digits.charAt(0) !== '0') {
      return '0' + digits;
    }
    // 8 หลัก ไม่ขึ้น 0 → เติม 0 (กรณีพิเศษ)
    if (digits.length === 8 && digits.charAt(0) !== '0') {
      return '0' + digits;
    }
    // กรณีอื่น ๆ ที่ไม่ขึ้นต้น 0 → เติม 0 นำหน้าเสมอ
    if (digits.length > 0 && digits.charAt(0) !== '0') {
      return '0' + digits;
    }
    // คืน digits ที่สะอาดถ้ามี 0 นำหน้าอยู่แล้ว
    return digits || text;
  }

  function extractListItems(value) {
    if (Array.isArray(value)) {
      return value.map(item => String(item).trim()).filter(Boolean);
    }

    const text = String(value ?? '').trim();
    if (!text) return [];

    if (text.startsWith('[') && text.endsWith(']')) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          return parsed.map(item => String(item).trim()).filter(Boolean);
        }
      } catch (e) {}
    }

    return [];
  }

  function buildDetailCopyButton(text, successLabel) {
    const copyText = String(text || '').trim();
    if (!copyText || copyText === '-') return '';
    return '<button type="button" onclick="copyTextToClipboard(\'' + escapeHtml(copyText).replace(/'/g, "\\'") + '\', \'' + escapeHtml(successLabel) + '\')" class="detail-copy-button" title="คัดลอก" aria-label="' + escapeHtml(successLabel) + '">'
      + '<i data-lucide="copy" class="w-4 h-4"></i>'
      + '</button>';
  }

  function buildDetailField(label, value, accent = 'blue', copySuccessLabel) {
    const accentMap = {
      blue: 'detail-pill-blue',
      sky: 'detail-pill-sky',
      emerald: 'detail-pill-emerald',
      violet: 'detail-pill-violet',
      amber: 'detail-pill-amber',
      rose: 'detail-pill-rose'
    };

    const formattedValue = formatDetailValue(value);
    const copyButton = copySuccessLabel ? buildDetailCopyButton(formattedValue, copySuccessLabel) : '';

    return `
      <div class="detail-field">
        <p class="detail-label">${escapeHtml(label)}</p>
        <div class="detail-value-row">
          <p class="detail-value">${escapeHtml(formattedValue)}</p>
          ${copyButton}
        </div>
      </div>
    `;
  }

  function resolveFacebookLink(value) {
    const raw = String(value || '').trim();
    if (!raw || raw === '-') return { href: '#', isSearch: false };
    if (/^https?:\/\//i.test(raw)) return { href: raw, isSearch: false };
    if (/^(www\.)?facebook\.com\//i.test(raw) || /^fb\.com\//i.test(raw)) {
      return { href: 'https://' + raw, isSearch: false };
    }
    return {
      href: 'https://www.google.com/search?q=' + encodeURIComponent('site:facebook.com ' + raw),
      isSearch: true
    };
  }

  function copyTextToClipboard(text, successLabel) {
    const str = String(text || '').trim();
    if (!str) return;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(str).then(function() {
        showToast((successLabel || 'คัดลอก') + ' เรียบร้อยแล้ว', 'success');
      }).catch(function() {
        fallbackCopyText_(str, successLabel);
      });
    } else {
      fallbackCopyText_(str, successLabel);
    }
  }

  function fallbackCopyText_(str, successLabel) {
    try {
      const ta = document.createElement('textarea');
      ta.value = str;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) {
        showToast((successLabel || 'คัดลอก') + ' เรียบร้อยแล้ว', 'success');
      } else {
        showToast('ไม่สามารถคัดลอกได้', 'error');
      }
    } catch (e) {
      showToast('ไม่สามารถคัดลอกได้', 'error');
    }
  }

  function buildLinkField(label, value, icon) {
    icon = icon || 'link-2';
    const text = label === 'เบอร์โทรศัพท์' ? normalizePhoneDisplay(value) : formatDetailValue(value);
    if (text === '-') return buildDetailField(label, value, 'sky');

    let href = text;
    if (label === 'เบอร์โทรศัพท์') {
      href = 'tel:' + text.replace(new RegExp('\\s', 'g'), '');
      return '<div class="detail-field">'
        + '<p class="detail-label">' + escapeHtml(label) + '</p>'
        + '<div class="detail-value-row">'
        + '<p class="detail-phone-display">' + escapeHtml(text) + '</p>'
        + buildDetailCopyButton(text, 'คัดลอกเบอร์โทรศัพท์')
        + '</div>'
        + '<a href="' + escapeHtml(href) + '" class="detail-phone-cta">'
        + '<i data-lucide="phone-call" class="w-5 h-5"></i>'
        + 'โทรออก: ' + escapeHtml(text)
        + '</a>'
        + '</div>';
    }

    if (label === 'Facebook') {
      const fbInfo = resolveFacebookLink(text);
      const openBtnText = fbInfo.isSearch ? 'ค้นหา Facebook ใน Google' : 'เปิด Facebook';
      const actionIcon = fbInfo.isSearch ? 'search' : (icon || 'facebook');
      return '<div class="detail-field">'
        + '<p class="detail-label">' + escapeHtml(label) + '</p>'
        + '<p class="detail-value mb-3 truncate" title="' + escapeHtml(text) + '">' + escapeHtml(text) + '</p>'
        + '<div class="flex flex-wrap items-center gap-2">'
        + '<a href="' + escapeHtml(fbInfo.href) + '" target="_blank" rel="noreferrer" class="detail-link-button">'
        + '<i data-lucide="' + escapeHtml(actionIcon) + '" class="w-4 h-4"></i>'
        + escapeHtml(openBtnText)
        + '</a>'
        + '<button type="button" onclick="copyTextToClipboard(\'' + escapeHtml(text).replace(/'/g, "\\\'") + '\', \'คัดลอกข้อมูล Facebook\')" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors shadow-xs" title="คัดลอกข้อมูล">'
        + '<i data-lucide="copy" class="w-4 h-4 text-slate-500"></i>'
        + '<span>คัดลอก</span>'
        + '</button>'
        + '</div>'
        + '</div>';
    }

    const protoRe = new RegExp('^https?:', 'i');
    if (!protoRe.test(text)) {
      href = 'https://' + text;
    }

    return '<div class="detail-field">'
      + '<p class="detail-label">' + escapeHtml(label) + '</p>'
      + '<p class="detail-value mb-3 truncate" title="' + escapeHtml(text) + '">' + escapeHtml(text) + '</p>'
      + '<div class="flex flex-wrap items-center gap-2">'
      + '<a href="' + escapeHtml(href) + '" target="_blank" rel="noreferrer" class="detail-link-button">'
      + '<i data-lucide="' + escapeHtml(icon) + '" class="w-4 h-4"></i>'
      + 'เปิด' + escapeHtml(label)
      + '</a>'
      + '<button type="button" onclick="copyTextToClipboard(\'' + escapeHtml(text).replace(/'/g, "\\'") + '\', \'คัดลอก ' + escapeHtml(label) + '\')" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors shadow-xs" title="คัดลอกข้อมูล">'
      + '<i data-lucide="copy" class="w-4 h-4 text-slate-500"></i>'
      + '<span>คัดลอก</span>'
      + '</button>'
      + '</div>'
      + '</div>';
  }

  function buildChipGroup(label, value, accent = 'blue') {
    const items = extractListItems(value);
    const fallback = formatDetailValue(value);
    const accentMap = {
      blue: 'detail-pill-blue',
      sky: 'detail-pill-sky',
      emerald: 'detail-pill-emerald',
      violet: 'detail-pill-violet',
      amber: 'detail-pill-amber',
      rose: 'detail-pill-rose'
    };

    const chips = items.length
      ? items.map(item => `<span class="detail-pill ${accentMap[accent] || accentMap.blue}">${escapeHtml(item)}</span>`).join('')
      : `<span class="detail-pill ${accentMap[accent] || accentMap.blue}">${escapeHtml(fallback)}</span>`;

    return `
      <div class="detail-field">
        <p class="detail-label">${escapeHtml(label)}</p>
        <div class="flex flex-wrap gap-2">${chips}</div>
      </div>
    `;
  }

  function buildImagePlaceholder(title) {
    return '<div class="detail-image-placeholder">'
      + '<div class="text-center">'
      + '<div class="mx-auto mb-3 w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">'
      + '<i data-lucide="image-off" class="w-5 h-5"></i></div>'
      + '<p class="font-medium text-slate-500">ไม่มี' + escapeHtml(title) + '</p>'
      + '<p class="text-xs mt-1 text-slate-400">รายการนี้ยังไม่มีรูปภาพในส่วนนี้</p>'
      + '</div></div>';
  }

  function buildMobileCollapsibleText(text, contentId, className) {
    const safeText = String(text || '').trim();
    const needsCollapse = safeText.length > 180;
    const contentClass = (className || '') + (needsCollapse ? ' detail-mobile-collapsible' : '');
    return '<p id="' + escapeHtml(contentId) + '" class="' + contentClass + '">' + escapeHtml(safeText) + '</p>'
      + (needsCollapse
        ? '<button type="button" class="detail-mobile-collapse-button" aria-expanded="false" aria-controls="' + escapeHtml(contentId) + '" onclick="toggleMobileDetailCollapse(this)">ดูเพิ่มเติม</button>'
        : '');
  }

  function toggleMobileDetailCollapse(button) {
    const content = document.getElementById(button.getAttribute('aria-controls'));
    if (!content) return;
    const isExpanded = content.classList.toggle('is-expanded');
    button.setAttribute('aria-expanded', String(isExpanded));
    button.textContent = isExpanded ? 'ย่อ' : 'ดูเพิ่มเติม';
  }

  function buildImageCard(title, value, accent) {
    accent = accent || 'blue';
    const imageValue = formatDetailValue(value);
    if (imageValue === '-') {
      return buildImagePlaceholder(title);
    }
    const resolvedDisplay = normalizeDriveImageUrlString_(imageValue, 'gallery');
    const resolvedFull = normalizeDriveImageUrlString_(imageValue, 'full');

    const labelColors = {
      blue: 'background: rgba(37,99,235,0.85); color: #fff;',
      violet: 'background: rgba(124,58,237,0.85); color: #fff;',
      emerald: 'background: rgba(5,150,105,0.85); color: #fff;',
      amber: 'background: rgba(245,158,11,0.85); color: #fff;',
      rose: 'background: rgba(244,63,94,0.85); color: #fff;',
      sky: 'background: rgba(14,165,233,0.85); color: #fff;'
    };
    const labelStyle = labelColors[accent] || labelColors.blue;
    const safeTitle = escapeHtml(title);
    const safeImgDisplay = escapeHtml(resolvedDisplay);
    const safeImgFull = escapeHtml(resolvedFull);

    return '<div class="detail-image-card group" onclick="openLightbox(this)" data-img-src="' + safeImgFull + '" data-img-title="' + safeTitle + '" style="cursor: pointer; display: block;">'
      + '<div class="relative overflow-hidden" style="border-radius: 1rem;">'
      + '<img src="' + safeImgDisplay + '" alt="' + safeTitle + '" class="w-full h-52 object-cover transition-transform duration-300 group-hover:scale-105" loading="eager">'
      + '<div class="absolute inset-0 bg-gradient-to-t from-slate-900/45 via-transparent to-transparent"></div>'
      + '<div class="img-overlay-label" style="' + labelStyle + '">'
      + '<i data-lucide="camera" class="w-3 h-3"></i>'
      + '<span>' + safeTitle + '</span></div>'
      + '<div class="img-zoom-icon"><i data-lucide="zoom-in" class="w-4 h-4 text-slate-700"></i></div>'
      + '<div class="absolute bottom-0 left-0 right-0 p-3 text-white text-xs font-semibold" style="text-shadow: 0 1px 3px rgba(0,0,0,0.5);">'
      + 'แตะเพื่อดูรูปเต็ม'
      + '</div></div></div>';
  }

  function buildGalleryAlbumCard(img) {
    var thumb = galleryImageUrlForDisplay(img, 'gallery');
    var full  = galleryImageUrlForDisplay(img, 'full');
    var role  = img.ImageRole || img.DisplayName || '';
    if (!thumb) return '';
    return '<div class="relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-50 cursor-pointer h-28 shadow-sm" onclick="openLightbox(this)" data-img-src="' + escapeHtml(full) + '" data-img-title="' + escapeHtml(role) + '">'
      + '<img src="' + escapeHtml(thumb) + '" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="eager">'
      + '<div class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors"></div>'
      + '<div class="img-zoom-icon"><i data-lucide="zoom-in" class="w-4 h-4 text-slate-700"></i></div>'
      + '</div>';
  }

  function renderGalleryPhotos(gallery) {
    var items = Array.isArray(gallery) ? gallery.slice() : [];
    var shopImgs     = items.filter(function(g){ return String(g.ImageRole||'').trim().toLowerCase() === 'shop'; }).slice(0, 3);
    var productImgs  = items.filter(isGalleryRoleProductLike_);
    var activityImgs = items.filter(function(g){ return String(g.ImageRole||'').trim().toLowerCase() === 'activity'; }).slice(0, 3);

    function renderRolePhotoBlock(container, title, accent, roleItems) {
      if (!container) return;
      if (!roleItems.length) {
        container.innerHTML = buildImagePlaceholder(title);
        return;
      }
      if (roleItems.length === 1) {
        container.innerHTML = buildImageCard(title, galleryImageUrlForDisplay(roleItems[0]), accent);
        return;
      }
      container.innerHTML = '<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">' + roleItems.map(buildGalleryAlbumCard).join('') + '</div>';
    }

    // Shop photo (1 image) — only override if gallery has an image
    var shopCont = document.getElementById('detail-photo-shop-container');
    var shopBadge = document.getElementById('detail-photo-shop-badge');
    if (shopBadge) shopBadge.textContent = 'Photo ' + shopImgs.length;
    renderRolePhotoBlock(shopCont, 'รูปสถานประกอบการ', 'blue', shopImgs);

    // Product album (render every uploaded product image) — only override if gallery has images
    var productCont  = document.getElementById('detail-photo-product-container');
    var productBadge = document.getElementById('detail-photo-product-badge');
    if (productBadge) productBadge.textContent = 'Album (' + productImgs.length + ')';
    if (productCont && productImgs.length > 0) {
      productCont.innerHTML = '<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">' + productImgs.map(buildGalleryAlbumCard).join('') + '</div>';
    }

    // Activity photo (1 image) — only override if gallery has an image
    var actCont = document.getElementById('detail-photo-activity-container');
    if (actCont && activityImgs.length > 0) {
      var aImg = activityImgs[0];
      actCont.innerHTML = buildImageCard('รูปกิจกรรม/อื่นๆ', galleryImageUrlForDisplay(aImg), 'rose');
    }

    lucide.createIcons();
  }

  let currentLightboxImages = [];
  let currentLightboxIndex = -1;

  function openLightbox(el) {
    var src = el.getAttribute('data-img-src') || '';
    if (!src) return;

    var container = el.closest('#detail-body') || document.body;
    var list = Array.from(container.querySelectorAll('[data-img-src]'));
    if (list.length === 0) list = [el];

    currentLightboxImages = list.map(item => ({
      src: item.getAttribute('data-img-src') || '',
      title: item.getAttribute('data-img-title') || 'รูปภาพ'
    }));

    currentLightboxIndex = list.indexOf(el);
    if (currentLightboxIndex === -1) currentLightboxIndex = 0;

    renderLightboxImg();
  }

  function renderLightboxImg() {
    var imgData = currentLightboxImages[currentLightboxIndex];
    if (!imgData) return;

    var img = document.getElementById('lightbox-img');
    var label = document.getElementById('lightbox-label');
    var counter = document.getElementById('lightbox-counter');
    var lb = document.getElementById('modal-lightbox');
    if (!img || !lb) return;

    img.src = imgData.src;
    img.alt = imgData.title;
    if (label) label.textContent = imgData.title;

    if (counter) {
      if (currentLightboxImages.length > 1) {
        counter.textContent = (currentLightboxIndex + 1) + ' / ' + currentLightboxImages.length;
        counter.style.display = 'block';
      } else {
        counter.style.display = 'none';
      }
    }

    lb.classList.remove('opacity-0', 'pointer-events-none');
    document.body.style.overflow = 'hidden';
    if (window.lucide) lucide.createIcons();
  }

  function nextLightbox() {
    if (currentLightboxImages.length <= 1) return;
    currentLightboxIndex = (currentLightboxIndex + 1) % currentLightboxImages.length;
    renderLightboxImg();
  }

  function prevLightbox() {
    if (currentLightboxImages.length <= 1) return;
    currentLightboxIndex = (currentLightboxIndex - 1 + currentLightboxImages.length) % currentLightboxImages.length;
    renderLightboxImg();
  }

  function closeLightbox() {
    var lb = document.getElementById('modal-lightbox');
    var img = document.getElementById('lightbox-img');
    if (!lb) return;
    lb.classList.add('opacity-0', 'pointer-events-none');
    document.body.style.overflow = '';
    setTimeout(function() { if (img) img.src = ''; currentLightboxImages = []; }, 320);
  }

  window.openLightbox = openLightbox;
  window.closeLightbox = closeLightbox;
  window.nextLightbox = nextLightbox;
  window.prevLightbox = prevLightbox;

  function buildDashboardSummary(item) {
    var stats = [
      { icon: 'layers', label: 'ระดับธุรกิจ', value: item.BusinessLevel, bg: '#faf5ff', color: '#7c3aed' },
      { icon: 'activity', label: 'สถานะ', value: item.BusinessStatus, bg: '#ecfdf5', color: '#059669' },
      { icon: 'star', label: 'ศักยภาพ', value: item.PotentialLevel, bg: '#fffbeb', color: '#d97706' }
    ];
    var statsHtml = stats.map(function(s) {
      var val = formatDetailValue(s.value);
      return '<div class="dash-stat-card">'
        + '<div class="dash-stat-icon" style="background:' + s.bg + ';color:' + s.color + ';">'
        + '<i data-lucide="' + s.icon + '" class="w-4 h-4"></i></div>'
        + '<div class="dash-stat-value">' + escapeHtml(val) + '</div>'
        + '<div class="dash-stat-label">' + escapeHtml(s.label) + '</div>'
        + '</div>';
    }).join('');

    return '<div class="dash-summary">'
      + '<div class="dash-header">'
      + '<div class="dash-header-info">'
      + '<h3 class="dash-biz-name">' + escapeHtml(formatDetailValue(item.BusinessName)) + '</h3>'
      + '<p class="dash-owner">เจ้าของ: ' + escapeHtml(formatDetailValue(item.OwnerName)) + '</p>'
      + '</div>'
      + '</div>'
      + '<div class="dash-body">'
      + '<div class="dash-stats-grid">' + statsHtml + '</div>'
      + '</div>'
      + '</div>';
  }

  function buildSummaryPills(item) {
    return [
      { label: item.BusinessStatus || 'สถานะไม่ระบุ', tone: 'detail-pill-emerald', icon: 'badge-check' },
      { label: item.BusinessLevel || 'ระดับไม่ระบุ', tone: 'detail-pill-violet', icon: 'sparkles' },
      { label: item.PotentialLevel ? `${item.PotentialLevel} ดาว` : 'ยังไม่ประเมิน', tone: 'detail-pill-amber', icon: 'star' }
    ].map(({ label, tone, icon }) => `
      <span class="detail-modal-chip ${tone}">
        <i data-lucide="${icon}" class="w-3.5 h-3.5"></i>
        ${escapeHtml(label)}
      </span>
    `).join('');
  }

  function renderDetailModalBody(item) {
    _pdProducts = Array.isArray(item.products) ? item.products : [];
    _pdShopItem = item;
    var galleryItems = Array.isArray(item.gallery) ? item.gallery.slice() : [];
    var hasLegacyShopImage = formatDetailValue(item.ImageShop) !== '-';
    var hasLegacyProductImage = formatDetailValue(item.ImageProduct) !== '-';
    var hasLegacyActivityImage = formatDetailValue(item.ImageActivity) !== '-';
    var shopGalleryCount = galleryItems.filter(function(g) { return String(g.ImageRole || '').trim().toLowerCase() === 'shop'; }).length || (hasLegacyShopImage ? 1 : 0);
    var productGalleryCount = galleryItems.filter(isGalleryRoleProductLike_).length || (hasLegacyProductImage ? 1 : 0);
    var activityGalleryCount = galleryItems.filter(function(g) { return String(g.ImageRole || '').trim().toLowerCase() === 'activity'; }).length || (hasLegacyActivityImage ? 1 : 0);
    const body = document.getElementById('detail-body');
    
    var rawLat = String(item.Latitude || '').trim();
    var rawLng = String(item.Longitude || '').trim();
    var hasDirectCoords = rawLat && rawLng && formatDetailValue(rawLat) !== '-' && formatDetailValue(rawLng) !== '-';
    var parsedCoords = null;
    if (hasDirectCoords) {
      var numLat = parseFloat(rawLat);
      var numLng = parseFloat(rawLng);
      if (!isNaN(numLat) && !isNaN(numLng)) {
        parsedCoords = { lat: numLat.toFixed(6), lng: numLng.toFixed(6) };
      }
    } else {
      parsedCoords = parseCoordinatesFromUrl(item.LocationText) || parseCoordinatesFromUrl(item.Website) || parseCoordinatesFromUrl(item.Note);
    }
    var hasCoords = !!parsedCoords;
    var mapCoordsUrl = hasCoords ? ('https://maps.google.com/?q=' + encodeURIComponent(parsedCoords.lat + ',' + parsedCoords.lng)) : '#';
    var mapIframeSrc = hasCoords ? ('https://maps.google.com/maps?q=' + encodeURIComponent(parsedCoords.lat + ',' + parsedCoords.lng) + '&z=15&output=embed') : '';

    if (!hasCoords && item.LocationText && formatDetailValue(item.LocationText) !== '-') {
      var rawLocStr = String(item.LocationText).trim();
      if (/^https?:\/\//i.test(rawLocStr)) {
        mapCoordsUrl = rawLocStr;
        hasCoords = true;
        parsedCoords = { lat: 'ลิงก์แผนที่', lng: '' };
      } else {
        mapCoordsUrl = 'https://maps.google.com/?q=' + encodeURIComponent(rawLocStr);
        mapIframeSrc = 'https://maps.google.com/maps?q=' + encodeURIComponent(rawLocStr) + '&z=15&output=embed';
        hasCoords = true;
        parsedCoords = { lat: rawLocStr, lng: '' };
      }
    }

    var webAppBase = (window.WEB_APP_URL || (window.location.origin + window.location.pathname)).replace(/\/$/, '');
    var qrTargetId = item.LamproundID || item.BackendId || '';
    var qrDeepLink = webAppBase + (webAppBase.indexOf('?') >= 0 ? '&' : '?') + 'id=' + encodeURIComponent(qrTargetId);
    var qrImageSrc = 'https://quickchart.io/qr?text=' + encodeURIComponent(qrDeepLink) + '&size=300&margin=2';
    var qrDownloadUrl = 'https://quickchart.io/qr?text=' + encodeURIComponent(qrDeepLink) + '&size=400&margin=2';
    var qrDownloadFilename = 'QR_' + (item.LamproundID || 'shop') + '.png';
    var shopHistory = String(item.ShopHistory || '').trim();
    var hasShopHistory = shopHistory && shopHistory !== '-';
    var detailPhone = normalizePhoneDisplay(item.Phone);
    var mobileActions = '';
    if (detailPhone && detailPhone !== '-') {
      mobileActions += '<a href="tel:' + escapeHtml(detailPhone.replace(new RegExp('\\s', 'g'), '')) + '" class="detail-mobile-action detail-mobile-action-phone"><i data-lucide="phone" class="w-4 h-4"></i><span>โทร</span></a>';
    }
    if (hasCoords) {
      mobileActions += '<a href="' + escapeHtml(mapCoordsUrl) + '" target="_blank" rel="noreferrer" class="detail-mobile-action"><i data-lucide="map-pin" class="w-4 h-4"></i><span>แผนที่</span></a>';
    }
    mobileActions += '<a href="#detail-qr-section" class="detail-mobile-action"><i data-lucide="qr-code" class="w-4 h-4"></i><span>QR Code</span></a>';
    var mobileActionsEl = document.getElementById('detail-mobile-actions');
    if (mobileActionsEl) mobileActionsEl.innerHTML = mobileActions;

    body.innerHTML = buildDashboardSummary(item) + `
      <div class="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-5">
        <div class="xl:col-span-7 space-y-4">
          <section class="detail-section detail-section-blue">
            <div class="flex items-center justify-between gap-3 mb-4">
              <div>
                <h4 class="detail-section-title">ภาพรวมรายการ</h4>
                <p class="detail-section-subtitle">ข้อมูลหลักและการติดต่อ</p>
              </div>
              <span class="detail-pill detail-pill-blue">อัปเดตล่าสุด</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              ${buildDetailField('รหัสรายการ', item.LamproundID, 'blue', 'คัดลอกรหัสรายการ')}
              ${buildDetailField('ชื่อผู้ประกอบการ / ร้านค้า', item.BusinessName, 'sky')}
              ${buildDetailField('ชื่อเจ้าของ', item.OwnerName, 'violet')}
              ${buildDetailField('วันที่บันทึก', item.CreatedAt, 'amber')}
              ${formatDetailValue(item.LineID) !== '-' ? buildDetailField('Line ID', item.LineID, 'emerald', 'คัดลอก Line ID') : ''}
              ${formatDetailValue(item.Facebook) !== '-' ? buildLinkField('Facebook', item.Facebook, 'facebook') : ''}
              ${formatDetailValue(item.Website) !== '-' ? buildLinkField('Website', item.Website, 'globe') : ''}
            </div>
          </section>

          <section class="detail-section detail-section-sky">
            <div class="flex items-center justify-between gap-3 mb-4">
              <div>
                <h4 class="detail-section-title">ที่ตั้งและข้อมูลธุรกิจ</h4>
                <p class="detail-section-subtitle">ตำแหน่ง ประเภท และช่องทางจำหน่าย</p>
              </div>
              <span class="detail-pill detail-pill-sky">Business Info</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              ${buildDetailField('ที่อยู่', item.LocationText, 'sky')}
              ${buildDetailField('ประเภทธุรกิจ', item.BusinessType, 'emerald')}
              ${buildChipGroup('หมวดหมู่สินค้า/บริการ', item.ProductCategory, 'violet')}
              ${buildDetailField('ระดับของธุรกิจ', item.BusinessLevel, 'amber')}
              ${buildChipGroup('ช่องทางจำหน่าย', item.SalesChannel, 'emerald')}
              ${buildDetailField('ราคาเฉลี่ย', item.AvgPrice, 'rose')}
              ${hasCoords ? `
                <div class="sm:col-span-2 mt-1">
                  <div class="rounded-2xl overflow-hidden border border-sky-200 bg-white shadow-sm transition-all hover:shadow-md">
                    <div class="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-gradient-to-r from-sky-50 to-blue-50 border-b border-sky-100">
                      <div class="flex items-center gap-2 min-w-0">
                        <span class="p-1 rounded-lg bg-white shadow-xs text-emerald-600">
                          <i data-lucide="map-pin" class="w-4 h-4 text-emerald-500"></i>
                        </span>
                        <div class="min-w-0">
                          <p class="text-[11px] font-semibold text-slate-800 truncate">ตำแหน่งที่ตั้งบนแผนที่</p>
                          <p class="text-[10px] text-slate-500 truncate">${escapeHtml(parsedCoords.lat)}${parsedCoords.lng ? (', ' + escapeHtml(parsedCoords.lng)) : ''}</p>
                        </div>
                      </div>
                      <a href="${escapeHtml(mapCoordsUrl)}" target="_blank" rel="noreferrer" class="detail-map-cta inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium shadow-xs transition-colors shrink-0">
                        <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                        <span>เปิด Google Maps</span>
                      </a>
                    </div>
                    ${mapIframeSrc ? `
                    <div class="relative group">
                      <iframe src="${escapeHtml(mapIframeSrc)}" width="100%" height="150" style="border:0;display:block;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
                    </div>` : ''}
                  </div>
                </div>
              ` : ''}
            </div>
          </section>

          ${hasShopHistory ? `<section class="detail-section detail-section-amber">
            <div class="flex items-center justify-between gap-3 mb-4">
              <div>
                <h4 class="detail-section-title">ประวัติร้านค้า</h4>
                <p class="detail-section-subtitle">ความเป็นมาและความภาคภูมิใจ</p>
              </div>
              <span class="detail-pill detail-pill-amber">History</span>
            </div>
            ${buildMobileCollapsibleText(shopHistory, 'detail-shop-history', 'text-sm text-slate-700 leading-relaxed whitespace-pre-line')}
          </section>` : ''}

          ${buildProductCardsSection(_pdProducts, item.gallery) || '<div id="detail-products-section"></div>'}
        </div>

        <div class="xl:col-span-5 space-y-4">
          <section class="detail-section detail-section-amber">
            <div class="flex items-center justify-between gap-3 mb-4">
              <div>
                <h4 class="detail-section-title">สรุปด่วน</h4>
                <p class="detail-section-subtitle">แสดงข้อมูลสำคัญแบบอ่านเร็ว</p>
              </div>
              <span class="detail-pill detail-pill-amber">Quick View</span>
            </div>
            <div class="flex flex-wrap gap-2">
              ${buildSummaryPills(item)}
            </div>
          </section>

          <!-- แกลเลอรีสินค้า (อัลบั้ม สูงสุด 100 ภาพ) -->
          <section class="detail-section detail-section-blue" id="detail-photo-product-section">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h4 class="detail-section-title">แกลเลอรีสินค้า</h4>
                <p class="detail-section-subtitle flex items-center gap-2">
                  <span>ภาพสินค้าหรือชิ้นงานเด่น</span>
                  <span class="gallery-spinner text-blue-500 font-medium text-[11px] hidden items-center gap-1"><i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i>ดึงรูปจาก Drive...</span>
                </p>
              </div>
              <span class="detail-pill detail-pill-blue self-start sm:self-auto" id="detail-photo-product-badge">Album (${productGalleryCount})</span>
            </div>
            <div id="detail-photo-product-container">${buildImageCard('แกลเลอรีสินค้า', item.ImageProduct, 'violet')}</div>
          </section>

            <!-- QR Code Card ประจำร้านค้า -->
            <section class="detail-section detail-section-sky" id="detail-qr-section">
              <div class="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h4 class="detail-section-title">QR Code ประจำร้าน</h4>
                  <p class="detail-section-subtitle">สแกนเพื่อเปิดดูข้อมูลร้านนี้</p>
                </div>
                <span class="detail-pill detail-pill-sky">QR Code</span>
              </div>
              <div class="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col items-center justify-center text-center gap-3">
                <div class="p-2 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center">
                  <img src="${escapeHtml(qrImageSrc)}" alt="QR Code ${escapeHtml(formatDetailValue(item.BusinessName))}" class="w-36 h-36 object-contain rounded-lg">
                </div>
                <p class="text-xs text-slate-500 font-medium">${escapeHtml(formatDetailValue(item.LamproundID))}</p>
                <button type="button" onclick="downloadQrCodeImage('${encodeURI(qrDownloadUrl)}', '${escapeHtml(qrDownloadFilename)}')" class="detail-qr-download w-full py-2 px-3 rounded-xl bg-gradient-to-r from-blue-500 to-sky-400 text-white text-xs font-semibold shadow-sm hover:shadow transition-all flex items-center justify-center gap-1.5">
                  <i data-lucide="download" class="w-3.5 h-3.5"></i>
                  <span>ดาวน์โหลด QR Code</span>
                </button>
              </div>
            </section>
          </div>
        </div>
      `;
    }

    window.downloadQrCodeImage = function(qrUrl, filename) {
      if (!qrUrl) return;
      showToast('กำลังดาวน์โหลด QR Code...', 'info');
      fetch(qrUrl)
        .then(function(res) { return res.blob(); })
        .then(function(blob) {
          var blobUrl = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = blobUrl;
          a.download = filename || 'qrcode.png';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
          showToast('ดาวน์โหลด QR Code สำเร็จแล้ว', 'success');
        })
        .catch(function() {
          window.open(qrUrl, '_blank');
        });
    };

  function showDetailLoading(item) {
    document.getElementById('detail-id').innerText = item.LamproundID || 'ไม่มีรหัส';
    document.getElementById('detail-title').innerText = item.BusinessName || 'รายละเอียดรายการ';
    document.getElementById('detail-subtitle').innerText = item.OwnerName ? `เจ้าของ: ${item.OwnerName}` : 'กำลังโหลดรายละเอียดรายการ';

    const phoneEl = document.getElementById('detail-phone-hero');
    if (phoneEl) phoneEl.classList.add('hidden');

    const body = document.getElementById('detail-body');
    body.innerHTML = `
      <div class="py-24 flex flex-col items-center justify-center text-slate-500 gap-4">
        <i data-lucide="loader-2" class="w-10 h-10 animate-spin text-blue-500"></i>
        <p class="text-base font-semibold">กำลังโหลดข้อมูล...</p>
      </div>
    `;

    lucide.createIcons();

    const modal = document.getElementById('modal-detail');
    const content = document.getElementById('modal-detail-content');
    modal.classList.remove('opacity-0', 'pointer-events-none');
    content.classList.remove('scale-95', 'translate-y-4');
    document.body.style.overflow = 'hidden';
  }

  function openDetailModal(index) {
    detailTargetIndex = index;
    const summaryItem = recordsData[index];
    if (!summaryItem || !summaryItem.BackendId) return;

    // Instant optimistic render - opens immediately without waiting for server
    document.getElementById('detail-id').innerText = summaryItem.LamproundID || 'ไม่มีรหัส';
    document.getElementById('detail-title').innerText = summaryItem.BusinessName || 'รายละเอียดรายการ';
    document.getElementById('detail-subtitle').innerText = summaryItem.OwnerName ? `เจ้าของ: ${summaryItem.OwnerName}` : 'ข้อมูลรายละเอียดของรายการนี้';

    const phoneEl = document.getElementById('detail-phone-hero');
    const phoneLinkEl = document.getElementById('detail-phone-hero-link');
    const phoneTextEl = document.getElementById('detail-phone-hero-text');
    const phoneVal = normalizePhoneDisplay(summaryItem.Phone);
    if (phoneEl && phoneLinkEl && phoneTextEl && phoneVal && phoneVal !== '-') {
      phoneTextEl.innerText = phoneVal;
      phoneLinkEl.href = 'tel:' + phoneVal.replace(new RegExp('\\s', 'g'), '');
      phoneEl.classList.remove('hidden');
    } else if (phoneEl) {
      phoneEl.classList.add('hidden');
    }

    renderDetailModalBody(summaryItem);

    const modal = document.getElementById('modal-detail');
    const content = document.getElementById('modal-detail-content');
    modal.classList.remove('opacity-0', 'pointer-events-none');
    content.classList.remove('scale-95', 'translate-y-4');
    document.body.style.overflow = 'hidden';
    lucide.createIcons();

    const requestToken = ++_detailRequestToken;

    // Background fetch for extra details (Products & Gallery)
    var cachedDetail = lpClientCacheReadDetail(summaryItem.BackendId);
    if (cachedDetail && cachedDetail.success && cachedDetail.record) {
      applyDetailedRecordData(cachedDetail.record);
    } else {
      google.script.run
        .withSuccessHandler(function(response) {
          if (requestToken !== _detailRequestToken || detailTargetIndex !== index) return;
          if (response && response.success && response.record) {
            try { lpClientCacheWriteDetail(summaryItem.BackendId, response); } catch(e) {}
            applyDetailedRecordData(response.record);
          }
          const spinners = document.querySelectorAll('.gallery-spinner');
          spinners.forEach(s => { s.classList.add('hidden'); s.classList.remove('flex'); });
        })
        .withFailureHandler(function() {
          const spinners = document.querySelectorAll('.gallery-spinner');
          spinners.forEach(s => { s.classList.add('hidden'); s.classList.remove('flex'); });
        })
        .getRecordDetail({ backendId: summaryItem.BackendId, token: _token });
    }

    function applyDetailedRecordData(record) {
      _pdShopItem = record || _pdShopItem;
      _pdProducts = Array.isArray(record.products) ? record.products : [];
      if (Array.isArray(record.gallery) && record.gallery.length > 0) {
        renderGalleryPhotos(record.gallery);
      }
      var prodSection = document.getElementById('detail-products-section');
      if (prodSection) {
        prodSection.outerHTML = buildProductCardsSection(_pdProducts, record.gallery);
      }
      const spinners = document.querySelectorAll('.gallery-spinner');
      spinners.forEach(s => { s.classList.add('hidden'); s.classList.remove('flex'); });
      lucide.createIcons();
    }
  }

  function downloadExcelData() {
    showToast('กำลังเตรียมไฟล์ Excel (.xlsx)...', 'info');
    var activeIds = (Array.isArray(filteredRecordsData) && filteredRecordsData.length > 0)
      ? filteredRecordsData.map(function(r) { return r.BackendId; }).filter(Boolean)
      : [];

    google.script.run
      .withSuccessHandler(function(res) {
        if (res && res.success && res.url) {
          showToast('ดาวน์โหลด Excel สำเร็จ (' + (res.count || activeIds.length) + ' รายการ)', 'success');
          window.open(res.url, '_blank');
        } else {
          showToast('ไม่สามารถดาวน์โหลด Excel ได้: ' + ((res && res.message) || 'ไม่ทราบสาเหตุ'), 'error');
        }
      })
      .withFailureHandler(function(err) {
        showToast('เชื่อมต่อเซิร์ฟเวอร์ล้มเหลว: ' + ((err && err.message) || err), 'error');
      })
      .exportCleanExcelFile({ recordIds: activeIds });
  }

  function closeDetailModal() {
    const modal = document.getElementById('modal-detail');
    const content = document.getElementById('modal-detail-content');
    modal.classList.add('opacity-0', 'pointer-events-none');
    content.classList.add('scale-95', 'translate-y-4');
    document.body.style.overflow = '';
    detailTargetIndex = null;
    _detailRequestToken++;
    try {
      if (window.history && window.history.replaceState) {
        var cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState(null, document.title, cleanUrl);
      }
    } catch(e) { }
  }

  function handleDetailBackdropClick(event) {
    if (event.target.id === 'modal-detail') {
      closeDetailModal();
    }
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeDetailModal();
      closeDeleteModal();
      closeLightbox();
      closeEditModal();
      closeProductModal();
      closeEditProductModal();
    }
  });

  // ========== DELETE FUNCTION ==========
  function confirmDeleteModal(index) {
    if (isDeleting) return;
    const item = recordsData[index];
    if (!item) return;
    if (!canDeleteRecord(item)) {
      if (!isAuthenticated()) showLogin();
      return;
    }
    deleteTargetIndex = index;
    
    document.getElementById('delete-name').innerText = item.BusinessName || 'รายการนี้';
    setDeleteBusyState(false);
    const modal = document.getElementById('modal-delete');
    modal.classList.remove('opacity-0', 'pointer-events-none');
  }
  
  function closeDeleteModal() {
    if (isDeleting) return;
    const modal = document.getElementById('modal-delete');
    modal.classList.add('opacity-0', 'pointer-events-none');
    deleteTargetIndex = null;
  }

  let isDeleting = false;

  function setDeleteBusyState(isBusy) {
    const btnText = document.getElementById('delete-text');
    const btnSpinner = document.getElementById('delete-spinner');
    const confirmBtn = document.getElementById('btn-confirm-delete');
    const cancelBtn = document.getElementById('btn-cancel-delete');

    if (btnText) btnText.classList.toggle('hidden', isBusy);
    if (btnSpinner) btnSpinner.classList.toggle('hidden', !isBusy);
    if (confirmBtn) confirmBtn.disabled = isBusy;
    if (cancelBtn) cancelBtn.disabled = isBusy;
  }

  function confirmDelete() {
    if (deleteTargetIndex === null || isDeleting) return;
    
    const item = recordsData[deleteTargetIndex];
    if (!item || !item.BackendId || !canDeleteRecord(item)) return;
    
    isDeleting = true;
    setDeleteBusyState(true);
    
    google.script.run
      .withSuccessHandler((response) => {
        isDeleting = false;
        setDeleteBusyState(false);
        
        if (response && response.success) {
          const removedBackendId = item.BackendId;
          try {
            lpClientCacheClearRecords();
            lpClientCacheClearDetail(removedBackendId);
          } catch (e) { }
          recordsData = recordsData.filter((record) => record.BackendId !== removedBackendId);
          closeDeleteModal();
          applySearchFilter(false);
          showToast('ย้ายข้อมูลไปยังสถานะลบแล้ว', 'success');
        } else {
          if (handleSessionInvalidResponse(response)) return;
          alert('เกิดข้อผิดพลาด: ' + (response && response.message ? response.message : 'ไม่ทราบสาเหตุ'));
        }
      })
      .withFailureHandler((error) => {
        isDeleting = false;
        setDeleteBusyState(false);
        alert('เชื่อมต่อเซิร์ฟเวอร์ล้มเหลว: ' + error.message);
      })
      .deleteRecord(Object.assign({
        backendId: item.BackendId,
        token: _token
      }, buildGuestScopedPayload(item.BackendId)));
  }

  // ========== PDF EXPORT FUNCTION ==========
  window.downloadPdf = function(backendId) {
    if (!backendId) return;
    var btn = document.getElementById('btn-pdf-' + backendId);
    if (btn) {
      btn.disabled = true;
      var originalHtml = btn.innerHTML;
      btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>สร้าง PDF...';
      lucide.createIcons();
    }
    
    google.script.run
      .withSuccessHandler(function(res) {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalHtml;
          lucide.createIcons();
        }
        if (res && res.success && res.pdfUrl) {
          window.open(res.pdfUrl, '_blank');
          if (res.pdfFileId || res.docFileId) {
            setTimeout(function() {
              google.script.run.cleanupTemporaryPdfFiles({
                pdfFileId: res.pdfFileId || '',
                docFileId: res.docFileId || '',
                tempTag: res.tempTag || '',
                backendId: backendId || '',
                issuedAt: res.issuedAt || ''
              });
            }, 60000);
          }
          showToast('สร้าง PDF สำเร็จแล้ว', 'success');
        } else {
          showToast((res && res.message) || 'ไม่สามารถสร้าง PDF ได้', 'error');
        }
      })
      .withFailureHandler(function() {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalHtml;
          lucide.createIcons();
        }
        showToast('เชื่อมต่อเซิร์ฟเวอร์ล้มเหลว', 'error');
      })
      .exportShopPdf({ backendId: backendId, token: _token });
  };

  // ========== EXPORT EXCEL ==========
  function phoneForListExport_(value) {
    var digits = String(value || '').replace(/[^0-9]/g, '');
    if (!digits) return '';
    if (digits.charAt(0) !== '0') digits = '0' + digits;
    return digits;
  }

  function restoreExcelExportButton_(btn, originalHtml) {
    _listExcelExportBusy = false;
    if (!btn) return;
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    if (window.lucide) lucide.createIcons();
  }

  function exportFilteredListXlsx() {
    if (_listExcelExportBusy) return;
    var rows = filteredRecordsData.slice();
    if (rows.length === 0) {
      showToast('ไม่มีข้อมูลสำหรับดาวน์โหลด', 'error');
      return;
    }
    if (!window.XLSX || !XLSX.utils) {
      showToast('ไม่สามารถโหลดไลบรารี Excel ได้', 'error');
      return;
    }

    var btn = document.getElementById('btn-export-excel');
    var originalHtml = btn ? btn.innerHTML : '';
    _listExcelExportBusy = true;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span class="hidden sm:inline">กำลังสร้าง Excel...</span><span class="sm:hidden">...</span>';
      if (window.lucide) lucide.createIcons();
    }

    try {
      var headers = ['รหัส', 'ชื่อร้าน', 'เจ้าของ', 'โทร', 'อำเภอ', 'ที่อยู่', 'ประเภทธุรกิจ', 'สถานะ', 'วันที่', 'ประวัติร้านค้า'];
      var aoa = [headers];
      rows.forEach(function(item) {
        aoa.push([
          item.LamproundID || '',
          item.BusinessName || '',
          item.OwnerName || '',
          phoneForListExport_(item.Phone),
          parseAmphoeFromLocation(item.LocationText),
          item.LocationText || '',
          item.BusinessType || '',
          item.BusinessStatus || '',
          item.CreatedAt || '',
          item.ShopHistory || ''
        ]);
      });

      var thinBorder = {
        top: { style: 'thin', color: { rgb: '000000' } },
        bottom: { style: 'thin', color: { rgb: '000000' } },
        left: { style: 'thin', color: { rgb: '000000' } },
        right: { style: 'thin', color: { rgb: '000000' } }
      };
      var headerStyle = {
        font: { bold: true, sz: 8, name: 'Tahoma' },
        fill: { patternType: 'solid', fgColor: { rgb: 'F3F4F6' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: thinBorder
      };
      var dataStyle = {
        font: { sz: 8, name: 'Tahoma' },
        alignment: { horizontal: 'left', vertical: 'center', wrapText: true, indent: 1 },
        border: thinBorder
      };
      var centerStyle = {
        font: { sz: 8, name: 'Tahoma' },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: thinBorder
      };

      var ws = XLSX.utils.aoa_to_sheet(aoa);
      var range = XLSX.utils.decode_range(ws['!ref']);
      for (var r = range.s.r; r <= range.e.r; r++) {
        for (var c = range.s.c; c <= range.e.c; c++) {
          var addr = XLSX.utils.encode_cell({ r: r, c: c });
          if (!ws[addr]) continue;
          ws[addr].t = 's';
          ws[addr].z = '@';
          if (r === 0) {
            ws[addr].s = headerStyle;
          } else if (c === 0 || c === 3 || c === 4 || c === 8) {
            ws[addr].s = centerStyle;
          } else {
            ws[addr].s = dataStyle;
          }
        }
      }
      ws['!cols'] = [
        { wch: 15 }, { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
        { wch: 28 }, { wch: 12 }, { wch: 8 }, { wch: 11 }, { wch: 30 }
      ];
      ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
      ws['!views'] = [{ state: 'frozen', ySplit: 1, topLeftCell: 'A2' }];
      ws['!pageSetup'] = {
        orientation: 'landscape',
        paperSize: 9,
        paperHeight: '210mm',
        paperWidth: '297mm',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        scale: 100
      };
      ws['!margins'] = { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.3 };
      ws['!oddFooter'] = '&Cหน้า &P จาก &N';
      ws['!evenFooter'] = '&Cหน้า &P จาก &N';
      ws['!footer'] = '&Cหน้า &P จาก &N';

      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'รายการ');
      var date = new Date();
      var dateStr = date.getFullYear() + ('0' + (date.getMonth() + 1)).slice(-2) + ('0' + date.getDate()).slice(-2);
      XLSX.writeFile(wb, 'LampangProud_List_' + dateStr + '.xlsx');
      showToast('ดาวน์โหลด Excel สำเร็จแล้ว', 'success');
    } catch (e) {
      showToast('ไม่สามารถสร้าง Excel ได้', 'error');
    } finally {
      restoreExcelExportButton_(btn, originalHtml);
    }
  }

  function exportCSV() {
    if (recordsData.length === 0) {
      alert('ไม่มีข้อมูลสำหรับ Export');
      return;
    }
    
    // Get headers from first item, exclude _rowIndex
    const headers = Object.keys(recordsData[0]).filter(k => k !== '_rowIndex');
    
    let csvContent = '\uFEFF'; // BOM for UTF-8
    
    // Add headers row
    csvContent += headers.map(h => `"${h}"`).join(',') + '\r\n';
    
    // Add data rows
    recordsData.forEach(row => {
      const rowData = headers.map(header => {
        let cellData = row[header] === null || row[header] === undefined ? '' : String(row[header]);
        // Avoid base64 images breaking the CSV size and format
        if (header.startsWith('Image') && cellData.length > 100) {
          cellData = '[IMAGE DATA]';
        }
        // Escape quotes
        cellData = cellData.replace(new RegExp('"', 'g'), '""');
        return `"${cellData}"`;
      });
      csvContent += rowData.join(',') + '\r\n';
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const date = new Date();
    const dateStr = `${date.getFullYear()}${('0'+(date.getMonth()+1)).slice(-2)}${('0'+date.getDate()).slice(-2)}`;
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `LamproundData_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ========== DASHBOARD CHARTS ==========
  var _dashCharts = {};
  var DASH_COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#f97316','#14b8a6','#6366f1','#84cc16','#a855f7'];

  function ensureChartJsLoaded() {
    if (typeof window.Chart === 'function') return Promise.resolve(window.Chart);
    if (_chartJsLoadPromise) return _chartJsLoadPromise;

    _chartJsLoadPromise = new Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https:' + '/' + '/cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js';
      script.async = true;
      script.onload = function() {
        if (typeof window.Chart === 'function') {
          resolve(window.Chart);
        } else {
          _chartJsLoadPromise = null;
          reject(new Error('Chart.js ไม่พร้อมใช้งาน'));
        }
      };
      script.onerror = function() {
        _chartJsLoadPromise = null;
        reject(new Error('โหลด Chart.js ไม่สำเร็จ'));
      };
      document.head.appendChild(script);
    });

    return _chartJsLoadPromise;
  }

  function countByField(records, field) {
    var counts = {};
    records.forEach(function(item) {
      var val = formatDetailValue(item[field]);
      if (val === '-') val = 'ไม่ระบุ';
      counts[val] = (counts[val] || 0) + 1;
    });
    return counts;
  }

  function countByMultiField(records, field) {
    var counts = {};
    records.forEach(function(item) {
      var items = extractListItems(item[field]);
      if (items.length === 0) {
        counts['ไม่ระบุ'] = (counts['ไม่ระบุ'] || 0) + 1;
      } else {
        items.forEach(function(v) { counts[v] = (counts[v] || 0) + 1; });
      }
    });
    return counts;
  }

  function createDoughnutChart(canvasId, dataObj) {
    var ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    var labels = Object.keys(dataObj);
    var values = labels.map(function(k) { return dataObj[k]; });
    return new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{ data: values, backgroundColor: DASH_COLORS.slice(0, labels.length), borderWidth: 2, borderColor: '#fff' }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { family: 'Prompt', size: 11 }, padding: 12, usePointStyle: true, pointStyleWidth: 8 } }
        },
        cutout: '55%'
      }
    });
  }

  function createBarChart(canvasId, dataObj) {
    var ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    var labels = Object.keys(dataObj);
    var values = labels.map(function(k) { return dataObj[k]; });
    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{ data: values, backgroundColor: DASH_COLORS.slice(0, labels.length), borderRadius: 6, borderSkipped: false, maxBarThickness: 48 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { font: { family: 'Prompt', size: 11 }, stepSize: 1, precision: 0 }, grid: { color: '#f1f5f9' } },
          x: { ticks: { font: { family: 'Prompt', size: 10 }, maxRotation: 45 }, grid: { display: false } }
        }
      }
    });
  }

  function renderDashboard() {
    var chartsArea = document.getElementById('dash-charts-area');
    var emptyArea = document.getElementById('dash-empty');
    var loadingArea = document.getElementById('dash-loading');
    var errorArea = document.getElementById('dash-error');
    var renderToken = ++_dashboardRenderToken;

    if (recordsData.length === 0) {
      if (chartsArea) chartsArea.classList.add('hidden');
      if (loadingArea) loadingArea.classList.add('hidden');
      if (errorArea) errorArea.classList.add('hidden');
      if (emptyArea) emptyArea.classList.remove('hidden');
      if (window.lucide) lucide.createIcons();
      return;
    }

    if (typeof window.Chart !== 'function') {
      if (chartsArea) chartsArea.classList.add('hidden');
      if (emptyArea) emptyArea.classList.add('hidden');
      if (errorArea) errorArea.classList.add('hidden');
      if (loadingArea) loadingArea.classList.remove('hidden');
      ensureChartJsLoaded().then(function() {
        if (renderToken !== _dashboardRenderToken) return;
        var dashboardSection = document.getElementById('section-dashboard');
        if (dashboardSection && dashboardSection.classList.contains('hidden')) return;
        renderDashboard();
      }).catch(function() {
        if (renderToken !== _dashboardRenderToken) return;
        if (chartsArea) chartsArea.classList.add('hidden');
        if (loadingArea) loadingArea.classList.add('hidden');
        if (emptyArea) emptyArea.classList.add('hidden');
        if (errorArea) errorArea.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
      });
      return;
    }

    if (chartsArea) chartsArea.classList.remove('hidden');
    if (loadingArea) loadingArea.classList.add('hidden');
    if (errorArea) errorArea.classList.add('hidden');
    if (emptyArea) emptyArea.classList.add('hidden');

    Object.keys(_dashCharts).forEach(function(k) {
      if (_dashCharts[k]) { _dashCharts[k].destroy(); _dashCharts[k] = null; }
    });

    var typeCounts = countByField(recordsData, 'BusinessType');
    var statusCounts = countByField(recordsData, 'BusinessStatus');
    var levelCounts = countByField(recordsData, 'BusinessLevel');
    var potentialCounts = countByField(recordsData, 'PotentialLevel');
    var channelCounts = countByMultiField(recordsData, 'SalesChannel');
    var catCounts = countByMultiField(recordsData, 'ProductCategory');

    var kpiTotal = document.getElementById('kpi-total');
    var kpiTypes = document.getElementById('kpi-types');
    var kpiLevels = document.getElementById('kpi-levels');
    var kpiStatuses = document.getElementById('kpi-statuses');
    if (kpiTotal) kpiTotal.textContent = recordsData.length;
    if (kpiTypes) kpiTypes.textContent = Object.keys(typeCounts).length;
    if (kpiLevels) kpiLevels.textContent = Object.keys(levelCounts).length;
    if (kpiStatuses) kpiStatuses.textContent = Object.keys(statusCounts).length;

    _dashCharts.bizType = createDoughnutChart('chart-biz-type', typeCounts);
    _dashCharts.bizStatus = createBarChart('chart-biz-status', statusCounts);
    _dashCharts.bizLevel = createBarChart('chart-biz-level', levelCounts);
    _dashCharts.potential = createDoughnutChart('chart-potential', potentialCounts);
    _dashCharts.salesChannel = createBarChart('chart-sales-channel', channelCounts);
    _dashCharts.productCat = createBarChart('chart-product-cat', catCounts);

    if (window.lucide) lucide.createIcons();
  }

  window.renderDashboard = renderDashboard;
  window.switchTab = switchTab;
  window.goToPage = goToPage;
  window.handleSearchInput = handleSearchInput;
  window.handleAmphoeFilterChange = handleAmphoeFilterChange;
  window.clearSearchInput = clearSearchInput;
  window.exportFilteredListXlsx = exportFilteredListXlsx;
  window.openDetailModal = openDetailModal;
  window.closeDetailModal = closeDetailModal;
  window.handleDetailBackdropClick = handleDetailBackdropClick;
  window.confirmDeleteModal = confirmDeleteModal;
  window.closeDeleteModal = closeDeleteModal;
  window.confirmDelete = confirmDelete;
  window.exportCSV = exportCSV;
  window.doLogin = doLogin;
  window.toggleLoginPasswordVisibility = toggleLoginPasswordVisibility;
  window.doLogout = doLogout;
  window.activateTab = switchTab;
  window.openProductModal = openProductModal;
  window.closeProductModal = closeProductModal;
  window.handleProductBackdropClick = handleProductBackdropClick;
  window.saveProductFromModal = saveProductFromModal;
  window.editProductItem = editProductItem;
  window.editEditProductItem = editEditProductItem;
  window.removeProductItem = removeProductItem;
  window.openEditProductModal = openEditProductModal;
  window.closeEditProductModal = closeEditProductModal;
  window.handleEditProductBackdropClick = handleEditProductBackdropClick;
  window.saveEditProductFromModal = saveEditProductFromModal;
  window.removeEditProductItem = removeEditProductItem;
  window.openProductDetailModal = openProductDetailModal;
  window.closeProductDetailModal = closeProductDetailModal;
  window.handleProductImageSelect = handleProductImageSelect;
  window.clearProductImagePreview = clearProductImagePreview;
  window.handleEditProductImageSelect = handleEditProductImageSelect;
  window.clearEditProductImagePreview = clearEditProductImagePreview;
  window.openProductCatalogModal = openProductCatalogModal;
  window.closeProductCatalogModal = closeProductCatalogModal;
  window.handleCatalogSearch = handleCatalogSearch;
  window.setCatalogCategory = setCatalogCategory;
  window.setCatalogSort = setCatalogSort;
  window.catalogGoToPage = catalogGoToPage;
  window.openCatalogProductDetail = openCatalogProductDetail;
  window.renderCatalogProducts = renderCatalogProducts;


  // ========== EDIT MODAL ==========
  function setEditFormLoadingState(isBusy) {
    var form = document.getElementById('editForm');
    var sb = document.getElementById('edit-submit-btn');
    var st = document.getElementById('edit-submit-text');
    var si = document.getElementById('edit-submit-icon');
    var sp = document.getElementById('edit-spinner');
    if (form) form.classList.toggle('pointer-events-none', isBusy);
    if (form) form.classList.toggle('opacity-60', isBusy);
    if (sb) sb.disabled = isBusy;
    if (st) st.textContent = isBusy ? 'กำลังโหลด...' : 'บันทึกการแก้ไข';
    if (si) si.classList.toggle('hidden', isBusy);
    if (sp) sp.classList.toggle('hidden', !isBusy);
  }

  function populateEditForm(item) {
    var modalIdEl = document.getElementById('edit-modal-id');
    if (modalIdEl) modalIdEl.textContent = 'รหัส: ' + (item.LamproundID || '');
    var form = document.getElementById('editForm');
    if (!form) return;
    var keyMap = {
      'business_name':'BusinessName','owner_name':'OwnerName','phone':'Phone',
      'line_id':'LineID','facebook':'Facebook','website':'Website',
      'location_text':'LocationText','latitude':'Latitude','longitude':'Longitude',
      'business_type':'BusinessType','business_level':'BusinessLevel',
      'main_products':'MainProducts','production_capacity':'ProductionCapacity',
      'avg_price':'AvgPrice','business_status':'BusinessStatus',
      'potential_level':'PotentialLevel','issues':'Issues',
      'support_needed':'SupportNeeded','note':'Note',
      'shop_history':'ShopHistory'
    };
    Object.keys(keyMap).forEach(function(f) {
      var el = form.querySelector('[name="'+f+'"]');
      if (!el) return;
      var raw = item[keyMap[f]] || '';
      el.value = (raw === '-' || raw === null || raw === undefined) ? '' : raw;
    });
    var phoneEl = form.querySelector('[name="phone"]');
    if (phoneEl) phoneEl.value = formatPhoneDisplayValue(item.Phone || '');

    var mapUrlInput = document.getElementById('edit_map_url_input');
    if (mapUrlInput) {
      if (item.Latitude && item.Longitude && item.Latitude !== '-' && item.Longitude !== '-') {
        mapUrlInput.value = item.Latitude + ', ' + item.Longitude;
      } else {
        mapUrlInput.value = '';
      }
    }
    updateEditMapPreview();

    var epBase = normalizeEditProductItems(item.products || []);
    editProducts = epBase.map(function(p, ix) {
      if (!p.image && Array.isArray(item.gallery)) {
        p.image = findProductGalleryImageUrl(p, item.gallery, ix);
      }
      return p;
    });
    renderEditProductList();
    syncEditProductSummaryFields();

    resetEditGalleryState();
    _editGalleryShopId = item.BackendId || '';

    var imgSec = document.getElementById('edit-image-section');
    if (imgSec) imgSec.classList.remove('hidden');
    ['image_shop', 'image_product', 'image_activity'].forEach(function(k) {
      var itemKey = (k === 'image_shop') ? 'ImageShop' : (k === 'image_product') ? 'ImageProduct' : 'ImageActivity';
      var val = item[itemKey] || '';
      var img = document.getElementById('img-edit_' + k);
      var ph = document.querySelector('#preview-edit_' + k + ' .placeholder');
      var b64 = document.getElementById('b64-edit_' + k);
      var clr = document.getElementById('clear-edit_' + k);
      if (img && ph && b64 && clr) {
        if (val && val.length > 10) {
          img.src = val; img.classList.remove('hidden'); ph.style.display = 'none';
          b64.value = val; clr.classList.remove('hidden');
        } else {
          img.src = ''; img.classList.add('hidden'); ph.style.display = '';
          b64.value = ''; clr.classList.add('hidden');
        }
      }
    });

    loadEditGallery(item.BackendId);
  }

  var _galleryDeleteBusy = false;

  function normalizeEditGalleryRole(role) {
    var value = String(role || '').trim().toLowerCase();
    if (value === 'gallery') return 'product';
    if (value === 'shop' || value === 'product' || value === 'activity') return value;
    return value;
  }

  function getEditGalleryLimit(role) {
    var value = normalizeEditGalleryRole(role);
    if (value === 'product') return 100;
    if (value === 'shop' || value === 'activity') return 3;
    return 0;
  }

  function getEditGalleryPickerButton(role) {
    var target = "triggerEditGalleryPicker('" + normalizeEditGalleryRole(role) + "')";
    var buttons = document.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      var onclick = String(buttons[i].getAttribute('onclick') || '');
      if (onclick.indexOf(target) >= 0) return buttons[i];
    }
    return null;
  }

  function getEditGalleryRoleQueueCount(role) {
    var value = normalizeEditGalleryRole(role);
    return _editGalleryQueue.filter(function(item) {
      return normalizeEditGalleryRole(item && item.role) === value;
    }).length;
  }

  function getEditGalleryRoleVisibleExistingCount(role) {
    var value = normalizeEditGalleryRole(role);
    var pendingMap = {};
    _editGalleryPendingDeleteIds.forEach(function(id) {
      pendingMap[String(id)] = true;
    });
    return _editGalleryExistingItems.filter(function(img) {
      var itemRole = normalizeEditGalleryRole(img && img.ImageRole);
      var galleryId = String(img && img.GalleryID || '').trim();
      return itemRole === value && !pendingMap[galleryId];
    }).length;
  }

  function getEditGalleryRoleCount(role) {
    return getEditGalleryRoleVisibleExistingCount(role) + getEditGalleryRoleQueueCount(role);
  }

  function updateEditGalleryCountLabels() {
    ['shop', 'product', 'activity'].forEach(function(role) {
      var limit = getEditGalleryLimit(role);
      var count = getEditGalleryRoleCount(role);
      var countEl = document.getElementById('edit-gallery-count-' + role);
      var btn = getEditGalleryPickerButton(role);
      var locked = _editGalleryUploadBusy || (limit > 0 && count >= limit);
      if (countEl) countEl.textContent = count + ' / ' + limit;
      if (btn) {
        btn.disabled = locked;
        btn.classList.toggle('opacity-50', locked);
        btn.classList.toggle('cursor-not-allowed', locked);
      }
      var input = document.getElementById('file-edit-gallery-upload-' + role);
      if (input) input.disabled = _editGalleryUploadBusy;
    });

    var countEl = document.getElementById('edit-gallery-upload-count');
    if (countEl) countEl.textContent = String(_editGalleryQueue.length);

    var clearBtn = document.getElementById('edit-gallery-clear-all');
    if (clearBtn) {
      clearBtn.disabled = _editGalleryUploadBusy || _editGalleryQueue.length === 0;
      clearBtn.classList.toggle('hidden', _editGalleryQueue.length === 0);
    }
  }

  function buildEditGalleryCardHtml(options) {
    var src = String(options && options.src || '').trim();
    if (!src) return '';
    var title = String(options && options.title || 'รูปภาพ').trim();
    var badgeText = String(options && options.badgeText || '').trim();
    var badgeClass = String(options && options.badgeClass || '').trim();
    var cardClass = String(options && options.cardClass || '').trim();
    var actionHtml = String(options && options.actionHtml || '').trim();
    var pending = !!(options && options.pending);
    return ''
      + '<div class="' + (cardClass || 'gallery-preview-card') + (pending ? ' is-pending' : '') + '">'
      +   '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(title) + '" class="gallery-preview-image">'
      +   '<span class="gallery-preview-badge absolute top-2 left-2 z-10 ' + badgeClass + '">' + escapeHtml(badgeText) + '</span>'
      +   actionHtml
      + '</div>';
  }

  function renderEditGallerySection(role) {
    var value = normalizeEditGalleryRole(role);
    var grid = document.getElementById('edit-gallery-preview-grid-' + value);
    if (!grid) return;

    var cards = [];
    var pendingMap = {};
    _editGalleryPendingDeleteIds.forEach(function(id) {
      pendingMap[String(id)] = true;
    });

    _editGalleryExistingItems.forEach(function(img) {
      if (normalizeEditGalleryRole(img && img.ImageRole) !== value) return;
      var galleryId = String(img && img.GalleryID || '').trim();
      var thumb = galleryImageUrlForDisplay(img, 'thumb') || getGalleryFallbackDataUri();
      var pending = !!pendingMap[galleryId];
      var actionHtml = pending
        ? '<button type="button" onclick="restoreExistingGalleryImage(\'' + escapeHtml(galleryId) + '\')" class="gallery-preview-restore-btn absolute top-2 right-2 z-10" aria-label="คืนค่ารูปเดิม"><i data-lucide="rotate-ccw" class="w-4 h-4"></i><span>คืนค่า</span></button>'
        : '<button type="button" onclick="deleteExistingGalleryImage(\'' + escapeHtml(galleryId) + '\')" class="gallery-preview-remove-btn absolute top-2 right-2 z-10" aria-label="ลบรูป"><i data-lucide="trash-2" class="w-4 h-4"></i><span>ลบรูป</span></button>';
      cards.push(buildEditGalleryCardHtml({
        src: thumb,
        title: pending ? 'รูปเดิมที่รอลบ' : 'รูปเดิม',
        badgeText: pending ? 'รอลบ' : 'รูปเดิม',
        badgeClass: pending ? 'is-pending' : '',
        cardClass: 'gallery-existing-card',
        actionHtml: actionHtml,
        pending: pending
      }));
    });

    _editGalleryQueue.forEach(function(item) {
      if (normalizeEditGalleryRole(item && item.role) !== value) return;
      cards.push(buildEditGalleryCardHtml({
        src: item && item.previewUrl ? item.previewUrl : getGalleryFallbackDataUri(),
        title: 'รูปใหม่ที่เลือก',
        badgeText: 'รูปใหม่',
        badgeClass: '',
        cardClass: 'gallery-preview-card',
        actionHtml: '<button type="button" onclick="removeEditQueuedImage(\'' + escapeHtml(item.id) + '\')" class="gallery-preview-remove-btn absolute top-2 right-2 z-10" aria-label="ลบรูปที่เลือก"><i data-lucide="x" class="w-4 h-4"></i></button>',
        pending: false
      }));
    });

    if (!cards.length) {
      grid.innerHTML = '<div class="gallery-empty-state col-span-full">ยังไม่มีรูปในหมวดนี้</div>';
      return;
    }

    grid.innerHTML = cards.join('');
  }

  function renderEditGallerySections() {
    ['shop', 'product', 'activity'].forEach(function(role) {
      renderEditGallerySection(role);
    });
    updateEditGalleryCountLabels();
  }

  function setEditGalleryLoadingState(message) {
    var text = escapeHtml(message || 'กำลังโหลดรูปภาพ...');
    ['shop', 'product', 'activity'].forEach(function(role) {
      var grid = document.getElementById('edit-gallery-preview-grid-' + role);
      if (grid) {
        grid.innerHTML = '<div class="gallery-empty-state col-span-full">' + text + '</div>';
      }
    });
  }

  function resetEditGalleryState() {
    _editGalleryRequestToken++;
    _editGalleryExistingItems = [];
    _editGalleryPendingDeleteIds = [];
    _editGalleryShopId = '';
    _editGalleryUploadBusy = false;
    _editGalleryUploadTotal = 0;
    _editGalleryUploadCompleted = 0;
    _galleryDeleteBusy = false;
    _editGalleryQueue.forEach(function(item) {
      if (item && item.previewUrl && item.previewIsObjectUrl) URL.revokeObjectURL(item.previewUrl);
    });
    _editGalleryQueue = [];
    ['shop', 'product', 'activity'].forEach(function(role) {
      var input = document.getElementById('file-edit-gallery-upload-' + role);
      if (input) input.value = '';
    });
    renderEditGallerySections();
  }

  function syncEditGalleryUploadState(statusText, completed, total, metaText, toneClass) {
    var statusEl = document.getElementById('edit-gallery-upload-status');
    var countEl = document.getElementById('edit-gallery-upload-count');
    var textEl = document.getElementById('edit-gallery-upload-progress-text');
    var barEl = document.getElementById('edit-gallery-upload-progress-bar');
    var metaEl = document.getElementById('edit-gallery-upload-progress-meta');
    var pct = total > 0 ? Math.round((Math.max(0, completed) / total) * 100) : 0;
    if (statusEl) {
      statusEl.textContent = statusText || 'ยังไม่เริ่มอัปโหลด';
      statusEl.className = 'font-semibold ' + (toneClass || 'text-slate-600');
    }
    if (countEl) countEl.textContent = String(_editGalleryQueue.length);
    if (textEl) textEl.textContent = pct + '%';
    if (barEl) barEl.style.width = pct + '%';
    if (metaEl) metaEl.textContent = metaText || (total > 0 ? (completed + ' / ' + total) : '0 / 0');
    var clearBtn = document.getElementById('edit-gallery-clear-all');
    if (clearBtn) {
      clearBtn.disabled = _editGalleryUploadBusy || _editGalleryQueue.length === 0;
      clearBtn.classList.toggle('hidden', _editGalleryQueue.length === 0);
    }
    var pickerBtns = document.querySelectorAll('button[onclick*="triggerEditGalleryPicker("]');
    pickerBtns.forEach(function(btn) {
      btn.disabled = _editGalleryUploadBusy;
      btn.classList.toggle('opacity-50', _editGalleryUploadBusy);
      btn.classList.toggle('cursor-not-allowed', _editGalleryUploadBusy);
    });
    var fileInputs = document.querySelectorAll('input[id^="file-edit-gallery-upload-"]');
    fileInputs.forEach(function(inputEl) {
      inputEl.disabled = _editGalleryUploadBusy;
    });
  }

  function getGalleryFallbackDataUri() {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">' +
        '<rect width="100%" height="100%" fill="#f8fafc"/>' +
        '<text x="14" y="52" font-size="12" fill="#94a3b8">No img</text>' +
      '</svg>'
    );
  }

  function applyGalleryFallback(imgEl) {
    if (!imgEl) return;
    imgEl.onerror = function() {
      imgEl.onerror = null;
      imgEl.src = getGalleryFallbackDataUri();
    };
  }

  function renderEditGalleryQueue() {
    renderEditGallerySections();
    var hasQueue = _editGalleryQueue.length > 0;
    var hasPending = _editGalleryPendingDeleteIds.length > 0;
    var statusText = _editGalleryUploadBusy ? 'กำลังอัปโหลดรูปใหม่...' : (hasQueue ? 'รอการบันทึก' : (hasPending ? 'มีรูปที่รอการลบ' : 'ยังไม่เริ่มอัปโหลด'));
    var metaText = _editGalleryUploadBusy ? (_editGalleryUploadCompleted + ' / ' + _editGalleryUploadTotal) : (hasQueue ? (_editGalleryQueue.length + ' รูปรออัปโหลด') : (hasPending ? 'มีรูปที่รอการลบ' : '0 / 0'));
    syncEditGalleryUploadState(statusText, _editGalleryUploadCompleted, _editGalleryUploadBusy ? _editGalleryUploadTotal : _editGalleryQueue.length, metaText, _editGalleryUploadBusy ? 'text-blue-600' : (hasQueue ? 'text-amber-600' : 'text-slate-600'));
    if (window.lucide) lucide.createIcons();
  }

  function triggerEditGalleryPicker(role) {
    if (!canManageEditProducts() || _editGalleryUploadBusy) return;
    var value = normalizeEditGalleryRole(role);
    if (!value) return;
    var limit = getEditGalleryLimit(value);
    if (limit > 0 && getEditGalleryRoleCount(value) >= limit) {
      showToast('อัปโหลดรูปประเภทนี้ได้สูงสุด ' + limit + ' รูป', 'error');
      return;
    }
    var input = document.getElementById('file-edit-gallery-upload-' + value);
    if (input) input.click();
  }

  function handleEditGalleryFileSelection(event, role) {
    if (!canManageEditProducts() || _editGalleryUploadBusy) {
      if (event && event.target) event.target.value = '';
      return;
    }
    var value = normalizeEditGalleryRole(role);
    var input = event && event.target ? event.target : null;
    var files = input ? input.files : null;
    if (!files || files.length === 0) return;
    var limit = getEditGalleryLimit(value);
    var available = limit - getEditGalleryRoleCount(value);
    var seenKeys = {};
    _editGalleryQueue.forEach(function(item) {
      if (normalizeEditGalleryRole(item && item.role) === value) {
        seenKeys[String(item.fileKey || '')] = true;
      }
    });
    var list = Array.prototype.slice.call(files);
    var idx = 0;
    var hadError = false;

    function finalizeSelection() {
      if (input) input.value = '';
      renderEditGalleryQueue();
      lucide.createIcons();
    }

    function processNextFile() {
      if (idx >= list.length) {
        finalizeSelection();
        return;
      }
      if (available <= 0) {
        showToast('อัปโหลดรูปใหม่ได้สูงสุด ' + limit + ' รูป', 'error');
        finalizeSelection();
        return;
      }
      var file = list[idx++];
      if (!file || !file.type || !file.type.match('image.*')) {
        processNextFile();
        return;
      }
      var fileKey = [value, file.name, file.size, file.lastModified].join('|');
      if (seenKeys[fileKey]) {
        processNextFile();
        return;
      }
      compressImageFileForUpload(file)
        .then(function(result) {
          _editGalleryQueue.push({
            id: Date.now() + '_' + idx + '_' + Math.random().toString(36).slice(2, 7),
            file: result.file,
            previewUrl: result.dataUrl,
            previewIsObjectUrl: false,
            role: value,
            fileKey: fileKey
          });
          seenKeys[fileKey] = true;
          available--;
        })
        .catch(function() {
          if (!hadError) {
            showToast('บางรูปไม่สามารถย่อขนาดได้และถูกข้าม', 'error');
            hadError = true;
          }
        })
        .finally(processNextFile);
    }

    processNextFile();
  }

  function removeEditQueuedImage(id) {
    if (_editGalleryUploadBusy) return;
    var nextQueue = [];
    _editGalleryQueue.forEach(function(item) {
      if (item.id === id) {
        if (item.previewUrl && item.previewIsObjectUrl) URL.revokeObjectURL(item.previewUrl);
        return;
      }
      nextQueue.push(item);
    });
    _editGalleryQueue = nextQueue;
    renderEditGalleryQueue();
    lucide.createIcons();
  }

  function clearEditGalleryQueue() {
    if (_editGalleryUploadBusy) return;
    _editGalleryQueue.forEach(function(item) {
      if (item && item.previewUrl && item.previewIsObjectUrl) URL.revokeObjectURL(item.previewUrl);
    });
    _editGalleryQueue = [];
    renderEditGalleryQueue();
    lucide.createIcons();
  }

  function renderEditExistingGallery(items) {
    _editGalleryExistingItems = Array.isArray(items) ? items.slice() : [];
    renderEditGalleryQueue();
  }

  function deleteExistingGalleryImage(galleryId) {
    if (!canManageEditProducts() || _editGalleryUploadBusy) return;
    var id = String(galleryId || '').trim();
    if (!id) return;
    if (_editGalleryPendingDeleteIds.indexOf(id) === -1) {
      _editGalleryPendingDeleteIds.push(id);
    }
    renderEditExistingGallery(_editGalleryExistingItems);
  }

  function restoreExistingGalleryImage(galleryId) {
    if (!canManageEditProducts() || _editGalleryUploadBusy) return;
    var id = String(galleryId || '').trim();
    if (!id) return;
    _editGalleryPendingDeleteIds = _editGalleryPendingDeleteIds.filter(function(itemId) {
      return itemId !== id;
    });
    renderEditExistingGallery(_editGalleryExistingItems);
  }

  function loadEditGallery(backendId) {
    if (!isAuthenticated() && !isGuestSessionOwnedRecord(backendId)) return;
    _editGalleryShopId = String(backendId || '').trim();
    var requestToken = ++_editGalleryRequestToken;
    setEditGalleryLoadingState('กำลังโหลดรูปภาพ...');
    google.script.run
      .withSuccessHandler(function(res) {
        if (requestToken !== _editGalleryRequestToken || editTargetIndex === null) return;
        if (!res || !res.success) {
          setEditGalleryLoadingState('โหลดรูปไม่สำเร็จ');
          return;
        }
        renderEditExistingGallery(res.gallery || []);
      })
      .withFailureHandler(function() {
        if (requestToken !== _editGalleryRequestToken || editTargetIndex === null) return;
        setEditGalleryLoadingState('เชื่อมต่อเซิร์ฟเวอร์ล้มเหลว');
      })
      .getShopRecord({ backendId: backendId, token: _token });
  }

  function processEditGalleryDeletes(shopId, done, fail) {
    var ids = _editGalleryPendingDeleteIds.slice();
    if (!ids.length) {
      done();
      return;
    }
    var total = ids.length;
    var completed = 0;
    _galleryDeleteBusy = true;
    syncEditGalleryUploadState('กำลังลบรูปที่รออยู่...', completed, total, completed + ' / ' + total, 'text-rose-600');

    function nextDelete() {
      if (!ids.length) {
        _galleryDeleteBusy = false;
        done();
        return;
      }
      var galleryId = ids.shift();
      google.script.run
        .withSuccessHandler(function(res) {
          if (!res || !res.success) {
            _galleryDeleteBusy = false;
            if (handleSessionInvalidResponse(res)) return;
            fail((res && res.message) || 'ลบรูปไม่สำเร็จ');
            return;
          }
          completed++;
          _editGalleryPendingDeleteIds = _editGalleryPendingDeleteIds.filter(function(itemId) {
            return itemId !== galleryId;
          });
          renderEditExistingGallery(_editGalleryExistingItems);
          syncEditGalleryUploadState('กำลังลบรูปที่รออยู่...', completed, total, completed + ' / ' + total, 'text-rose-600');
          nextDelete();
        })
        .withFailureHandler(function() {
          _galleryDeleteBusy = false;
          fail('เชื่อมต่อเซิร์ฟเวอร์ล้มเหลว');
        })
        .softDeleteGalleryImage({
          galleryId: galleryId,
          backendId: shopId,
          token: _token,
          guestAccessKey: getGuestSessionAccessKey(shopId)
        });
    }

    nextDelete();
  }

  function processEditGalleryUploads(shopId, done, fail) {
    var queue = _editGalleryQueue.slice();
    if (!queue.length) {
      done();
      return;
    }
    var total = queue.length;
    _editGalleryUploadTotal = total;
    _editGalleryUploadCompleted = 0;
    syncEditGalleryUploadState('กำลังอัปโหลดรูปใหม่...', 0, total, '0 / ' + total, 'text-blue-600');

    function nextUpload() {
      if (!queue.length) {
        done();
        return;
      }
      var item = queue.shift();
      var reader = new FileReader();
      reader.onload = function(e) {
        var base64Data = String(e && e.target && e.target.result || '').split(',')[1] || '';
        if (!base64Data) {
          fail('ไม่สามารถอ่านไฟล์รูปได้');
          return;
        }
        google.script.run
          .withSuccessHandler(function(res) {
            if (!res || !res.success) {
              if (handleSessionInvalidResponse(res)) return;
              fail((res && res.message) || 'อัปโหลดรูปไม่สำเร็จ');
              return;
            }
            _editGalleryUploadCompleted++;
            if (item && item.previewUrl && item.previewIsObjectUrl) URL.revokeObjectURL(item.previewUrl);
            _editGalleryQueue = _editGalleryQueue.filter(function(queueItem) {
              return queueItem.id !== item.id;
            });
            renderEditGalleryQueue();
            syncEditGalleryUploadState('กำลังอัปโหลดรูปใหม่...', _editGalleryUploadCompleted, total, _editGalleryUploadCompleted + ' / ' + total, 'text-blue-600');
            nextUpload();
          })
          .withFailureHandler(function() {
            fail('เชื่อมต่อเซิร์ฟเวอร์ล้มเหลว');
          })
          .uploadGalleryImage({
            shopId: shopId,
            token: _token,
            guestAccessKey: getGuestSessionAccessKey(shopId),
            fileName: item.file && item.file.name ? item.file.name : 'upload.jpg',
            mimeType: item.file && item.file.type ? item.file.type : 'image/jpeg',
            imageRole: normalizeEditGalleryRole(item.role || 'product'),
            sortOrder: _editGalleryUploadCompleted + 1,
            base64: base64Data
          });
      };
      reader.readAsDataURL(item.file);
    }

    nextUpload();
  }

  function commitEditGalleryChanges(shopId, done, fail) {
    var targetShopId = String(shopId || _editGalleryShopId || '').trim();
    if (!targetShopId) {
      done();
      return;
    }
    var hasDeletes = _editGalleryPendingDeleteIds.length > 0;
    var hasUploads = _editGalleryQueue.length > 0;
    if (!hasDeletes && !hasUploads) {
      done();
      return;
    }
    _editGalleryUploadBusy = true;
    renderEditGalleryQueue();
    renderEditExistingGallery(_editGalleryExistingItems);

    processEditGalleryDeletes(targetShopId, function() {
      processEditGalleryUploads(targetShopId, function() {
        _editGalleryUploadBusy = false;
        _galleryDeleteBusy = false;
        syncEditGalleryUploadState('บันทึกการแก้ไขและจัดการรูปภาพเรียบร้อยแล้ว', _editGalleryUploadTotal, _editGalleryUploadTotal || 1, _editGalleryUploadTotal ? (_editGalleryUploadTotal + ' / ' + _editGalleryUploadTotal) : '0 / 0', 'text-emerald-600');
        done();
      }, function(message) {
        _editGalleryUploadBusy = false;
        _galleryDeleteBusy = false;
        _editGalleryUploadTotal = 0;
        _editGalleryUploadCompleted = 0;
        renderEditGalleryQueue();
        renderEditExistingGallery(_editGalleryExistingItems);
        syncEditGalleryUploadState('เกิดข้อผิดพลาดในการอัปโหลดรูป', 0, 0, '0 / 0', 'text-rose-600');
        fail(message || 'ไม่สามารถอัปโหลดรูปใหม่ได้');
      });
    }, function(message) {
      _editGalleryUploadBusy = false;
      _galleryDeleteBusy = false;
      _editGalleryUploadTotal = 0;
      _editGalleryUploadCompleted = 0;
      renderEditGalleryQueue();
      renderEditExistingGallery(_editGalleryExistingItems);
      syncEditGalleryUploadState('เกิดข้อผิดพลาดในการลบรูป', 0, 0, '0 / 0', 'text-rose-600');
      fail(message || 'ไม่สามารถลบรูปที่รออยู่ได้');
    });
  }

  function openEditModal(index) {
    var item = recordsData[index];
    if (!item || !item.BackendId) return;
    if (!canEditRecord(item)) {
      if (!isAuthenticated()) showLogin();
      return;
    }
    editTargetIndex = index;
    syncGuestActionControls();

    var editErr = document.getElementById('edit-error');
    if (editErr) editErr.classList.add('hidden');
    var modal = document.getElementById('modal-edit');
    var content = document.getElementById('modal-edit-content');
    if (modal) modal.classList.remove('opacity-0', 'pointer-events-none');
    if (content) content.classList.remove('scale-95');
    document.body.style.overflow = 'hidden';
    setEditFormLoadingState(true);
    resetEditGalleryState();
    _editGalleryShopId = item.BackendId || '';
    editProducts = [];
    isEditProductListExpanded = false;
    editProductVisibleCount = 0;
    renderEditProductList();
    lucide.createIcons();

    const requestToken = ++_editRequestToken;

    function handleEditGetRecordDetail(res) {
      if (requestToken !== _editRequestToken || editTargetIndex !== index) return;
      setEditFormLoadingState(false);
      if (res && res.success && res.record) {
        try {
          lpClientCacheWriteDetail(item.BackendId, res);
        } catch (e) { }
        populateEditForm(res.record);
        lucide.createIcons();
        return;
      }
      var e2=document.getElementById('edit-error'), t2=document.getElementById('edit-error-text');
      if (e2) e2.classList.remove('hidden');
      if (t2) t2.textContent = (res && res.message) || 'เกิดข้อผิดพลาดในการโหลดข้อมูล';
    }

    var cachedEditDetail = lpClientCacheReadDetail(item.BackendId);
    if (cachedEditDetail && cachedEditDetail.success && cachedEditDetail.record) {
      handleEditGetRecordDetail(cachedEditDetail);
    } else {
      google.script.run
        .withSuccessHandler(handleEditGetRecordDetail)
        .withFailureHandler(function() {
          if (requestToken !== _editRequestToken || editTargetIndex !== index) return;
          setEditFormLoadingState(false);
          var e2=document.getElementById('edit-error'), t2=document.getElementById('edit-error-text');
          if (e2) e2.classList.remove('hidden');
          if (t2) t2.textContent = 'เชื่อมต่อเซิร์ฟเวอร์ล้มเหลว';
        })
        .getRecordDetail(Object.assign({
          backendId: item.BackendId,
          token: _token
        }, buildGuestScopedPayload(item.BackendId)));
    }
  }

  function closeEditModal() {
    var modal = document.getElementById('modal-edit');
    var content = document.getElementById('modal-edit-content');
    if (modal) modal.classList.add('opacity-0', 'pointer-events-none');
    if (content) content.classList.add('scale-95');
    document.body.style.overflow = '';
    editTargetIndex = null;
    _editRequestToken++;
    editProducts = [];
    isEditProductListExpanded = false;
    editProductVisibleCount = 0;
    resetEditGalleryState();
    renderEditProductList();
    syncGuestActionControls();
    setEditFormLoadingState(false);
  }

  function handleEditBackdropClick(event) {
    if (event.target.id === 'modal-edit') closeEditModal();
  }

  function submitEdit() {
    if (editTargetIndex === null || _isEditing) return;
    var item = recordsData[editTargetIndex];
    if (!item || !item.BackendId || !canEditRecord(item)) {
      if (!isAuthenticated()) showLogin();
      return;
    }
    var form = document.getElementById('editForm');
    if (!form) return;
    var busName = form.querySelector('[name="business_name"]');
    if (!busName || !busName.value.trim()) {
      var ee=document.getElementById('edit-error'), et=document.getElementById('edit-error-text');
      if (ee) ee.classList.remove('hidden');
      if (et) et.textContent = 'กรุณากรอกชื่อผู้ประกอบการ';
      return;
    }
    var data = {};
    var els = form.elements;
    for (var i=0; i<els.length; i++) { if (els[i].name) data[els[i].name] = els[i].value; }
    data.phone = cleanPhoneValue(data.phone);
    data.products = editProducts.map(function(item, index) {
      return {
        productName: String(item.productName || '').trim(),
        productCategory: String(item.productCategory || '').trim(),
        description: String(item.description || '').trim(),
        price: String(item.price || '').trim(),
        unit: String(item.unit || '').trim(),
        image: String(item.image || '').trim(),
        sortOrder: item.sortOrder != null ? item.sortOrder : (index + 1)
      };
    });
    data.main_products = editProducts.map(function(item) { return String(item.productName || '').trim(); }).filter(Boolean).join(', ');
    data.avg_price = calculateAverageProductPrice(editProducts) === '-' ? '' : String(calculateAverageProductPrice(editProducts)).replace(new RegExp('[^0-9.]', 'g'), '');
    _isEditing = true;
    var sb=document.getElementById('edit-submit-btn'), st=document.getElementById('edit-submit-text');
    var si=document.getElementById('edit-submit-icon'), sp=document.getElementById('edit-spinner');
    var ee=document.getElementById('edit-error');
    if (ee) ee.classList.add('hidden');
    if (sb) sb.disabled = true;
    if (st) st.textContent = 'กำลังบันทึก...';
    if (si) si.classList.add('hidden');
    if (sp) sp.classList.remove('hidden');
    google.script.run
      .withSuccessHandler(function(res) {
        if (!res || !res.success) {
          _isEditing = false;
          if (sb) sb.disabled=false; if (st) st.textContent='บันทึกการแก้ไข';
          if (si) si.classList.remove('hidden'); if (sp) sp.classList.add('hidden');
          if (handleSessionInvalidResponse(res)) return;
          var e2=document.getElementById('edit-error'), t2=document.getElementById('edit-error-text');
          if (e2) e2.classList.remove('hidden');
          if (t2) t2.textContent = (res && res.message) || 'เกิดข้อผิดพลาด';
          return;
        }
        if (st) st.textContent = 'กำลังจัดการรูปภาพ...';
        commitEditGalleryChanges(item.BackendId, function() {
          _isEditing = false;
          if (sb) sb.disabled=false; if (st) st.textContent='บันทึกการแก้ไข';
          if (si) si.classList.remove('hidden'); if (sp) sp.classList.add('hidden');
          try {
            lpClientCacheClearRecords();
            lpClientCacheClearDetail(item.BackendId);
          } catch (e) { }
          closeEditModal();
          loadRecords();
          showToast('แก้ไขข้อมูลเรียบร้อยแล้ว', 'success');
        }, function(message) {
          _isEditing = false;
          if (sb) sb.disabled=false; if (st) st.textContent='บันทึกการแก้ไข';
          if (si) si.classList.remove('hidden'); if (sp) sp.classList.add('hidden');
          var e2=document.getElementById('edit-error'), t2=document.getElementById('edit-error-text');
          if (e2) e2.classList.remove('hidden');
          if (t2) t2.textContent = message || 'จัดการรูปภาพไม่สำเร็จ';
        });
      })
      .withFailureHandler(function() {
        _isEditing = false;
        if (sb) sb.disabled=false; if (st) st.textContent='บันทึกการแก้ไข';
        if (si) si.classList.remove('hidden'); if (sp) sp.classList.add('hidden');
        var e2=document.getElementById('edit-error'), t2=document.getElementById('edit-error-text');
        if (e2) e2.classList.remove('hidden');
        if (t2) t2.textContent = 'เชื่อมต่อเซิร์ฟเวอร์ล้มเหลว';
      })
      .updateRecord(Object.assign({
        backendId: item.BackendId,
        data: data,
        token: _token
      }, buildGuestScopedPayload(item.BackendId)));
  }

  window.openEditModal = openEditModal;
  window.closeEditModal = closeEditModal;
  window.toggleEditProductListExpand = toggleEditProductListExpand;
  window.loadMoreEditProducts = loadMoreEditProducts;
  window.handleEditBackdropClick = handleEditBackdropClick;
  window.submitEdit = submitEdit;
  window.cleanPhone = cleanPhone;
  window.formatPhoneDisplay = formatPhoneDisplay;
  window.deleteExistingGalleryImage = deleteExistingGalleryImage;
  window.restoreExistingGalleryImage = restoreExistingGalleryImage;
  window.triggerEditGalleryPicker = triggerEditGalleryPicker;
  window.handleEditGalleryFileSelection = handleEditGalleryFileSelection;
  window.removeEditQueuedImage = removeEditQueuedImage;
  window.clearEditGalleryQueue = clearEditGalleryQueue;
  window.resetEditGalleryState = resetEditGalleryState;
  window.commitEditGalleryChanges = commitEditGalleryChanges;
  window.renderEditExistingGallery = renderEditExistingGallery;
  window.renderEditGalleryQueue = renderEditGalleryQueue;
  window.parseCoordinatesFromUrl = parseCoordinatesFromUrl;
  window.resolveMapUrlAsync = resolveMapUrlAsync;
  window.handleMapUrlInput = handleMapUrlInput;
  window.clearMapUrlInput = clearMapUrlInput;
  window.updateEditMapPreview = updateEditMapPreview;
  window.getEditLocation = getEditLocation;
  window.downloadExcelData = downloadExcelData;
  window.handleAmphoeFilterChange = handleAmphoeFilterChange;
  window.copyTextToClipboard = copyTextToClipboard;
  window.toggleMobileDetailCollapse = toggleMobileDetailCollapse;
  window.triggerSpecificGalleryPicker = triggerSpecificGalleryPicker;
  window.handleSpecificGalleryFileSelection = handleSpecificGalleryFileSelection;
  window.removeQueuedImage = removeQueuedImage;

// ---- Global bindings (แทน global scope เดิมของ <script> คลาสสิก: inline onclick อ้าง global) ----
export const __legacyGlobals = ["_lpCacheHashSegment_", "_lpDetailCacheStorageKey_", "_lpCacheReadRaw_", "_lpCacheWriteRaw_", "_lpCacheRemoveRaw_", "lpClientCacheReadRecords", "lpClientCacheWriteRecords", "lpClientCacheClearRecords", "lpClientCacheReadDetail", "lpClientCacheWriteDetail", "lpClientCacheClearDetail", "lpClientCacheClearAllDetails", "clearAuthStorage", "scheduleAutoLogoutTimer", "triggerSessionExpiryLogout", "initAuth", "isAuthenticated", "readGuestSessionRecordMap", "writeGuestSessionRecordMap", "rememberGuestSessionAccess", "getGuestSessionAccessKey", "isGuestSessionOwnedRecord", "syncGuestActionControls", "showApp", "showLogin", "resetAppToGuestState", "hideLogin", "showRegister", "hideRegister", "doRegister", "canEditRecord", "canDeleteRecord", "canManageEditProducts", "buildGuestScopedPayload", "isSessionInvalidResponse", "handleSessionInvalidResponse", "getItemsPerPage", "getProductPreviewLimit", "cleanPhoneValue", "formatPhoneDisplayValue", "restoreImagePreview", "saveFormDraft", "clearFormDraft", "restoreFormDraft", "bindFormPersistence", "formatProductPriceDisplay", "calculateAverageProductPrice", "syncProductSummaryFields", "renderProductList", "toggleProductListExpand", "loadMoreProducts", "clearProductModal", "formatEditProductPriceDisplay", "calculateEditAverageProductPrice", "syncEditProductSummaryFields", "renderEditProductList", "clearEditProductModal", "normalizeEditProductItems", "buildProductDetailBody", "buildProductCardsSection", "_buildCatalogCategoryChips", "getCatalogProductNameText", "getCatalogProductDescriptionText", "getCatalogProductCategoryText", "getCatalogProductPriceNumber", "_renderCatalogPagination", "ensureToastHost", "showToast", "validateStep", "toJpegFileName", "compressImageFileForUpload", "dataURLToBlob_", "triggerSpecificGalleryPicker", "getSpecificGalleryLimit", "getSpecificGalleryRoleCount", "updateSpecificGalleryCountLabels", "handleSpecificGalleryFileSelection", "finalizeQueueSelection", "processNextFile", "clearUploadQueue", "renderUploadPreviews", "removeQueuedImage", "startGalleryUpload", "uploadNextImage", "updateUploadProgress", "handleUploadError", "finishGalleryUpload", "finishFormSubmission", "loadRecords", "getDeepLinkParam_", "checkDeepLinkRoute_", "normalizeLocationForAmphoe", "parseAmphoeFromLocation", "getNormalizedSearchQuery", "getNormalizedAmphoeFilter", "hasActiveListFilter", "matchesRecordSearch", "matchesRecordAmphoe", "updateSearchUi", "applySearchFilter", "renderRecords", "extractDriveFileIdFromUrlString_", "driveFileIdToDisplayUrl_", "normalizeDriveImageUrlString_", "galleryImageUrlForDisplay", "isGalleryRoleProductLike_", "isUnlinkedGalleryProductId_", "findProductGalleryImageUrl", "escapeHtml", "formatDetailValue", "normalizePhoneDisplay", "extractListItems", "buildDetailCopyButton", "buildDetailField", "resolveFacebookLink", "fallbackCopyText_", "buildLinkField", "buildChipGroup", "buildImagePlaceholder", "buildMobileCollapsibleText", "buildImageCard", "buildGalleryAlbumCard", "renderGalleryPhotos", "renderRolePhotoBlock", "renderLightboxImg", "buildDashboardSummary", "buildSummaryPills", "renderDetailModalBody", "showDetailLoading", "applyDetailedRecordData", "setDeleteBusyState", "phoneForListExport_", "restoreExcelExportButton_", "ensureChartJsLoaded", "countByField", "countByMultiField", "createDoughnutChart", "createBarChart", "setEditFormLoadingState", "populateEditForm", "normalizeEditGalleryRole", "getEditGalleryLimit", "getEditGalleryPickerButton", "getEditGalleryRoleQueueCount", "getEditGalleryRoleVisibleExistingCount", "getEditGalleryRoleCount", "updateEditGalleryCountLabels", "buildEditGalleryCardHtml", "renderEditGallerySection", "renderEditGallerySections", "setEditGalleryLoadingState", "syncEditGalleryUploadState", "getGalleryFallbackDataUri", "applyGalleryFallback", "finalizeSelection", "loadEditGallery", "processEditGalleryDeletes", "nextDelete", "processEditGalleryUploads", "nextUpload", "handleEditGetRecordDetail"];
for (const name of __legacyGlobals) {
  try {
    const value = (0, eval)('typeof ' + name + " !== 'undefined' ? " + name + ' : undefined');
    if (typeof value === 'function') (window as any)[name] = value;
  } catch {
    /* ไม่มีชื่อนี้ — ข้าม */
  }
}
