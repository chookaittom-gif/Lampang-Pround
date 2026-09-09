/**
 * Port ตรงจาก inline bootstrap script ใน Code/index.html (บรรทัด 1229-1426) — verbatim
 * ทำหน้าที่เดิม: tab indicator + fallback list rendering (ถ้า window.loadRecords ไม่มา)
 * รันหลัง app.ts เสมอ (ลำดับ import ใน main.ts)
 */
// @ts-nocheck
    (function () {
      const tabIndicator = document.getElementById('tab-indicator');
      const tabForm = document.getElementById('tab-form');
      const tabList = document.getElementById('tab-list');
      const tabDashboard = document.getElementById('tab-dashboard');
      const secForm = document.getElementById('section-form');
      const secList = document.getElementById('section-list');
      const secDashboard = document.getElementById('section-dashboard');
      const dataList = document.getElementById('data-list');
      const listLoading = document.getElementById('list-loading');
      const listEmpty = document.getElementById('list-empty');
      const recordCount = document.getElementById('record-count');

      var fallbackRecords = [];
      var fallbackPage = 1;

      function fallbackPageSize() {
        return window.matchMedia('(max-width: 767px)').matches ? 6 : 12;
      }

      function fallbackEscape(value) {
        return String(value == null ? '' : value)
          .replace(new RegExp('&', 'g'), '&amp;')
          .replace(new RegExp('<', 'g'), '&lt;')
          .replace(new RegExp('>', 'g'), '&gt;')
          .replace(new RegExp('"', 'g'), '&quot;')
          .replace(new RegExp("'", 'g'), '&#39;');
      }

      function fallbackFormatPhone(value) {
        var text = String(value == null ? '' : value).trim();
        if (!text) return '-';
        var digits = text.replace(new RegExp('[^0-9]', 'g'), '');
        if (!digits) return text;
        // 10 หลัก ขึ้นต้น 0 → ถูกต้อง
        if (digits.length === 10 && digits.charAt(0) === '0') {
          return digits;
        }
        // ไม่ขึ้นต้น 0 → เติม 0 เสมอ
        if (digits.charAt(0) !== '0') {
          return '0' + digits;
        }
        return digits || text;
      }

      function fallbackRenderRecords() {
        if (!dataList) return;

        var total = fallbackRecords.length;
        if (recordCount) recordCount.textContent = total;

        if (!total) {
          if (listLoading) listLoading.classList.add('hidden');
          if (listEmpty) listEmpty.classList.remove('hidden');
          dataList.innerHTML = '';
          if (window.paginationControls) window.paginationControls.innerHTML = '';
          return;
        }

        if (listLoading) listLoading.classList.add('hidden');
        if (listEmpty) listEmpty.classList.add('hidden');

        var pageSize = fallbackPageSize();
        var totalPages = Math.max(1, Math.ceil(total / pageSize));
        if (fallbackPage < 1) fallbackPage = 1;
        if (fallbackPage > totalPages) fallbackPage = totalPages;

        var startIndex = (fallbackPage - 1) * pageSize;
        var endIndex = Math.min(startIndex + pageSize, total);
        var html = '';

        for (var i = startIndex; i < endIndex; i++) {
          var item = fallbackRecords[i] || {};
          html += '<div class="bg-white p-4 rounded-xl border border-slate-200 hover:shadow-md transition-shadow">' +
            '<div class="flex justify-between items-start mb-2 gap-3">' +
              '<div class="min-w-0">' +
                '<span class="inline-block px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-lg mb-2">' + fallbackEscape(item.LamproundID || 'ไม่มีรหัส') + '</span>' +
                '<h3 class="font-bold text-slate-800 line-clamp-1">' + fallbackEscape(item.BusinessName || '-') + '</h3>' +
              '</div>' +
            '</div>' +
            '<div class="flex items-center text-sm text-slate-500 mb-1">' +
              '<i data-lucide="user" class="w-4 h-4 mr-1.5 opacity-70"></i>' +
              '<span class="line-clamp-1">' + fallbackEscape(item.OwnerName || '-') + '</span>' +
            '</div>' +
            '<div class="flex items-center text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100 gap-1">' +
              '<i data-lucide="phone" class="w-3 h-3 opacity-70"></i>' +
              '<span>' + fallbackEscape(fallbackFormatPhone(item.Phone)) + '</span>' +
            '</div>' +
          '</div>';
        }

        dataList.innerHTML = html;

        var pagination = document.getElementById('pagination-controls');
        if (pagination) {
          pagination.classList.remove('hidden');
          pagination.innerHTML = '' +
            '<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">' +
              '<div class="text-sm text-slate-500">แสดง ' + (startIndex + 1) + '-' + endIndex + ' จาก ' + total + ' รายการ</div>' +
              '<div class="flex items-center gap-2 self-start sm:self-auto">' +
                '<button type="button" ' + (fallbackPage === 1 ? 'disabled' : '') + ' data-fallback-page="prev" class="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">ก่อนหน้า</button>' +
                '<span class="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-700">' + fallbackPage + '/' + totalPages + '</span>' +
                '<button type="button" ' + (fallbackPage === totalPages ? 'disabled' : '') + ' data-fallback-page="next" class="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">ถัดไป</button>' +
              '</div>' +
            '</div>';

          pagination.querySelectorAll('[data-fallback-page]').forEach(function (btn) {
            btn.addEventListener('click', function () {
              var dir = this.getAttribute('data-fallback-page');
              if (dir === 'prev' && fallbackPage > 1) fallbackPage--;
              if (dir === 'next' && fallbackPage < totalPages) fallbackPage++;
              fallbackRenderRecords();
            });
          });
        }

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons();
        }
      }

      function fallbackLoadRecords() {
        if (!window.google || !google.script || !google.script.run) {
          return;
        }

        if (listLoading) listLoading.classList.remove('hidden');
        if (listEmpty) listEmpty.classList.add('hidden');

        google.script.run
          .withSuccessHandler(function (data) {
            fallbackRecords = Array.isArray(data) ? data : [];
            fallbackPage = 1;
            fallbackRenderRecords();
          })
          .withFailureHandler(function () {
            fallbackRecords = [];
            fallbackRenderRecords();
          })
          .getRecords();
      }

      function activateTab(tabName) {
        if (!tabIndicator || !tabForm || !tabList || !tabDashboard || !secForm || !secList || !secDashboard) return;

        if (tabName === 'form') {
          tabIndicator.style.transform = 'translateX(0)';
          tabForm.classList.replace('text-slate-500', 'text-white');
          tabList.classList.replace('text-white', 'text-slate-500');
          tabDashboard.classList.replace('text-white', 'text-slate-500');
          secList.classList.add('hidden');
          secDashboard.classList.add('hidden');
          secForm.classList.remove('hidden');
        } else if (tabName === 'dashboard') {
          tabIndicator.style.transform = 'translateX(200%)';
          tabDashboard.classList.replace('text-slate-500', 'text-white');
          tabForm.classList.replace('text-white', 'text-slate-500');
          tabList.classList.replace('text-white', 'text-slate-500');
          secForm.classList.add('hidden');
          secList.classList.add('hidden');
          secDashboard.classList.remove('hidden');
          if (typeof window.renderDashboard === 'function') {
            setTimeout(function () { window.renderDashboard(); }, 30);
          }
        } else {
          tabIndicator.style.transform = 'translateX(100%)';
          tabList.classList.replace('text-slate-500', 'text-white');
          tabForm.classList.replace('text-white', 'text-slate-500');
          tabDashboard.classList.replace('text-white', 'text-slate-500');
          secForm.classList.add('hidden');
          secDashboard.classList.add('hidden');
          secList.classList.remove('hidden');
          if (typeof window.loadRecords === 'function') {
            window.loadRecords();
          } else {
            fallbackLoadRecords();
          }
        }
      }

      if (tabForm && !tabForm.getAttribute('onclick')) tabForm.addEventListener('click', () => activateTab('form'));
      if (tabList && !tabList.getAttribute('onclick')) tabList.addEventListener('click', () => activateTab('list'));
      if (tabDashboard && !tabDashboard.getAttribute('onclick')) tabDashboard.addEventListener('click', () => activateTab('dashboard'));

      if (typeof window.loadRecords !== 'function') {
        window.loadRecords = fallbackLoadRecords;
      }
      if (typeof window.renderRecords !== 'function') {
        window.renderRecords = fallbackRenderRecords;
      }

      window.activateTab = activateTab;
    })();

    // Initialize Lucide Icons
    lucide.createIcons();
