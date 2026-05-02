// web/src/routes/leads.js
//
// Leads route: unified table (all sources) + CSV import wizard.
// Loaded lazily via window.__dashboardLoadRouteModule.
//
// Public exports:
//   init()              — module entry point (called by the lazy loader)
//   loadUnifiedLeads()  — fetches /me/leads and renders the unified table
//
// Preserved helpers (used by imports pane — kept for backward compat):
//   loadImports(), removeImport(), viewImportedLeads(), initCsvImport()

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function _openDlg(dlg) {
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
}
function _closeDlg(dlg) {
  if (dlg.close) dlg.close(); else dlg.removeAttribute("open");
}

// ─── Unified table — constants ───────────────────────────────────────────────

const STAGE_ORDER = ["new","contacted","engaged","quoted","scheduled","won","lost"];
const STAGE_LABELS = {
  new:"New", contacted:"Contacted", engaged:"Engaged",
  quoted:"Quoted", scheduled:"Scheduled", won:"Won", lost:"Lost",
};

const SOURCE_ICONS = {
  phone_call:"📞", widget:"💬", csv_import:"📂",
  instagram_dm:"📷", email_reply:"✉️",
};
const SOURCE_LABELS = {
  phone_call:"Phone call", widget:"Website widget", csv_import:"Imported",
  instagram_dm:"Instagram DM", email_reply:"Email reply",
};

// ─── Unified table — module state ────────────────────────────────────────────

let _allLeads = [];
let _filteredLeads = [];
let _selectedIds = new Set();
let _selectModeOn = false;
let _sortBy = { key: "created_at", dir: "desc" };
let _filters = { source: null, stage: null, when: null, search: "" };
let _moreFilters = { hasPhone: false, hasEmail: false, replied: false, unsubscribed: false };
let _openMenuEl = null;

// ─── Unified table — utilities ───────────────────────────────────────────────

function avatarColor(name) {
  let h = 0;
  for (const c of (name || "")) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  const palette = ["#6366f1","#10b981","#f59e0b","#ef4444","#3b82f6","#8b5cf6","#ec4899"];
  return palette[Math.abs(h) % palette.length];
}

function relativeTime(unixSecs) {
  if (!unixSecs) return "—";
  const now = Math.floor(Date.now() / 1000);
  const diff = now - Number(unixSecs);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hour${diff >= 7200 ? "s" : ""} ago`;
  if (diff < 86400 * 14) {
    const d = Math.floor(diff / 86400);
    if (d === 1) return "yesterday";
    return `${d} days ago`;
  }
  const dt = new Date(unixSecs * 1000);
  return dt.toLocaleDateString();
}

function highlightMatch(text, query) {
  if (!query || !text) return escapeHtml(text || "");
  const lower = String(text).toLowerCase();
  const q = query.toLowerCase();
  const i = lower.indexOf(q);
  if (i < 0) return escapeHtml(text);
  return escapeHtml(text.slice(0, i)) +
    `<span class="match">${escapeHtml(text.slice(i, i + q.length))}</span>` +
    escapeHtml(text.slice(i + q.length));
}

function fullName(lead) {
  return ((lead.first_name || "") + " " + (lead.last_name || "")).trim() || lead.email || "Unknown";
}

function initials(name) {
  const parts = name.split(" ").filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name[0] || "?").toUpperCase();
}

function whenThreshold(filterVal) {
  const now = Math.floor(Date.now() / 1000);
  if (filterVal === "today") return now - 86400;
  if (filterVal === "week")  return now - 86400 * 7;
  if (filterVal === "month") return now - 86400 * 30;
  return 0;
}

function _showLeadsToast(msg, kind) {
  let host = document.getElementById("leadsToastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "leadsToastHost";
    host.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;pointer-events:none;";
    document.body.appendChild(host);
  }
  host.innerHTML = `<div style="
    padding:10px 18px;border-radius:10px;font-size:13px;font-weight:500;
    background:${kind === "error" ? "#b91c1c" : "#0a0a0a"};color:#fff;
    box-shadow:0 8px 24px rgba(0,0,0,0.18);
    animation:leadsToastIn 0.15s ease;
  ">${escapeHtml(msg)}</div>`;
  clearTimeout(host._timer);
  host._timer = setTimeout(() => { host.innerHTML = ""; }, 2600);
}

// ─── Unified table — filter + sort ──────────────────────────────────────────

function applyFilters() {
  let data = _allLeads.slice();

  // Search
  const q = (_filters.search || "").trim().toLowerCase();
  if (q) {
    data = data.filter(l => {
      const name = fullName(l).toLowerCase();
      const email = (l.email || "").toLowerCase();
      const phone = (l.phone || "").toLowerCase();
      return name.includes(q) || email.includes(q) || phone.includes(q);
    });
  }

  // Source filter
  if (_filters.source) {
    data = data.filter(l => l.source === _filters.source);
  }

  // Stage filter
  if (_filters.stage) {
    data = data.filter(l => (l.stage || "new") === _filters.stage);
  }

  // When filter
  if (_filters.when) {
    const cutoff = whenThreshold(_filters.when);
    data = data.filter(l => Number(l.created_at || 0) >= cutoff);
  }

  // More filters
  if (_moreFilters.hasPhone)      data = data.filter(l => l.phone && l.phone.trim());
  if (_moreFilters.hasEmail)      data = data.filter(l => l.email && l.email.trim());
  if (_moreFilters.replied)       data = data.filter(l => l.has_reply);
  if (_moreFilters.unsubscribed)  data = data.filter(l => l.unsubscribed);

  // Sort
  const { key, dir } = _sortBy;
  data.sort((a, b) => {
    let av = a[key], bv = b[key];
    if (key === "name") { av = fullName(a); bv = fullName(b); }
    if (key === "stage") {
      av = STAGE_ORDER.indexOf(a.stage || "new");
      bv = STAGE_ORDER.indexOf(b.stage || "new");
    }
    if (av == null) av = "";
    if (bv == null) bv = "";
    const mult = dir === "asc" ? 1 : -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * mult;
    return String(av).localeCompare(String(bv)) * mult;
  });

  _filteredLeads = data;
}

// ─── Unified table — render ──────────────────────────────────────────────────

const COLUMNS = [
  { key: "name",       label: "Name",          sortable: true },
  { key: "source",     label: "How",            sortable: true, helpText: "How this lead first reached out — phone call, website widget, or imported list." },
  { key: "stage",      label: "Stage",          sortable: true, helpText: "Where this lead is in your sales process." },
  { key: "reach",      label: "Reach",          sortable: false, helpText: "Ways you can contact this person — email and/or phone." },
  { key: "created_at", label: "Added",          sortable: true },
  { key: "last_activity", label: "Last activity", sortable: true },
];

function renderTableHead() {
  const thead = document.getElementById("leadsTableHead");
  if (!thead) return;
  const { key: sortKey, dir: sortDir } = _sortBy;
  thead.innerHTML = `<tr>
    ${_selectModeOn ? `<th data-sortable="false" style="width:40px;"><input type="checkbox" id="leadsSelectAll" aria-label="Select all"></th>` : ""}
    ${COLUMNS.map(col => {
      const isSorted = sortKey === col.key;
      const arrow = col.sortable
        ? `<span class="sort-arrow">${isSorted ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}</span>`
        : "";
      const help = col.helpText
        ? `<span class="leads-th-help" title="${escapeHtml(col.helpText)}" aria-label="${escapeHtml(col.helpText)}">?</span>`
        : "";
      return `<th data-col="${col.key}" data-sortable="${col.sortable}" class="${isSorted ? "is-sorted" : ""}">${escapeHtml(col.label)}${help}${arrow}</th>`;
    }).join("")}
  </tr>`;

  if (_selectModeOn) {
    thead.querySelector("#leadsSelectAll").addEventListener("change", (e) => {
      if (e.target.checked) {
        _filteredLeads.forEach(l => _selectedIds.add(l.id));
      } else {
        _selectedIds.clear();
      }
      renderTableBody();
      updateBulkBar();
    });
  }

  thead.querySelectorAll("th[data-sortable='true']").forEach(th => {
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      const col = th.dataset.col;
      if (_sortBy.key === col) {
        if (_sortBy.dir === "desc") _sortBy.dir = "asc";
        else if (_sortBy.dir === "asc") { _sortBy = { key: "created_at", dir: "desc" }; }
        else _sortBy = { key: col, dir: "desc" };
      } else {
        _sortBy = { key: col, dir: "desc" };
      }
      applyFilters();
      renderTable();
    });
  });
}

function renderRow(lead) {
  const name = fullName(lead);
  const initStr = initials(name);
  const color = avatarColor(name);
  const q = (_filters.search || "").trim();
  const stage = lead.stage || "new";
  const stageLabel = STAGE_LABELS[stage] || stage;
  const stageClass = "leads-stage-chip s-" + stage;
  const sourceIcon = SOURCE_ICONS[lead.source] || "❓";
  const sourceLabel = SOURCE_LABELS[lead.source] || (lead.source || "Unknown");
  const lastActTime = lead.last_activity_at || lead.updated_at || lead.created_at;
  const isSelected = _selectedIds.has(lead.id);

  const reachHtml = `
    <span class="leads-reach-cell">
      <span class="leads-reach-icon ${lead.email ? "" : "muted"}" title="${lead.email ? escapeHtml(lead.email) : "No email"}">✉️</span>
      <span class="leads-reach-icon ${lead.phone ? "" : "muted"}" title="${lead.phone ? escapeHtml(lead.phone) : "No phone"}">📞</span>
    </span>`;

  const selectCell = _selectModeOn
    ? `<td style="width:40px;"><input type="checkbox" class="leads-row-cb" data-id="${escapeHtml(lead.id)}" ${isSelected ? "checked" : ""}></td>`
    : "";

  return `<tr data-lead-id="${escapeHtml(lead.id)}" class="${isSelected ? "is-selected" : ""}">
    ${selectCell}
    <td>
      <div class="leads-name-cell">
        <div class="leads-avatar" style="background:${color}">${escapeHtml(initStr)}</div>
        <div>
          <div class="leads-name">${highlightMatch(name, q)}</div>
          <div class="leads-name-secondary">${highlightMatch(lead.email || lead.phone || "", q)}</div>
        </div>
      </div>
    </td>
    <td class="leads-source-cell" title="${escapeHtml(sourceLabel)}">${sourceIcon}</td>
    <td><span class="${stageClass}">${escapeHtml(stageLabel)}</span></td>
    <td>${reachHtml}</td>
    <td style="color:#6b7280;font-size:13px;">${relativeTime(lead.created_at)}</td>
    <td style="color:#6b7280;font-size:13px;">${relativeTime(lastActTime)}</td>
  </tr>`;
}

function renderTableBody() {
  const tbody = document.getElementById("leadsTableBody");
  if (!tbody) return;
  if (!_filteredLeads.length) {
    tbody.innerHTML = "";
    return;
  }
  tbody.innerHTML = _filteredLeads.map(renderRow).join("");

  // Row click → open lead detail
  tbody.querySelectorAll("tr[data-lead-id]").forEach(row => {
    row.addEventListener("click", (e) => {
      if (e.target.type === "checkbox") return;
      if (_selectModeOn) {
        const id = row.dataset.leadId;
        if (_selectedIds.has(id)) _selectedIds.delete(id);
        else _selectedIds.add(id);
        row.classList.toggle("is-selected", _selectedIds.has(id));
        updateBulkBar();
        return;
      }
      const id = row.dataset.leadId;
      const lead = _allLeads.find(l => l.id === id) || null;
      if (typeof window.openLeadDetailModal === "function") {
        window.openLeadDetailModal(id, lead);
      }
    });
  });

  // Checkbox clicks in select mode
  if (_selectModeOn) {
    tbody.querySelectorAll(".leads-row-cb").forEach(cb => {
      cb.addEventListener("change", () => {
        if (cb.checked) _selectedIds.add(cb.dataset.id);
        else _selectedIds.delete(cb.dataset.id);
        cb.closest("tr").classList.toggle("is-selected", cb.checked);
        updateBulkBar();
      });
    });
  }
}

function renderTable() {
  const loadingEl = document.getElementById("leadsLoading");
  const emptyEl   = document.getElementById("leadsEmpty");
  const showMoreEl = document.getElementById("leadsShowMore");
  const tbody = document.getElementById("leadsTableBody");
  if (!tbody) return;

  if (loadingEl) loadingEl.hidden = true;

  if (!_filteredLeads.length) {
    if (emptyEl) {
      emptyEl.hidden = false;
      emptyEl.innerHTML = renderEmptyState();
      // Wire empty-state CTAs
      const emptyImport = emptyEl.querySelector("#leadsEmptyImport");
      if (emptyImport) emptyImport.addEventListener("click", _openImport);
      const clearFilters = emptyEl.querySelector("#leadsClearFilters");
      if (clearFilters) clearFilters.addEventListener("click", clearAllFilters);
    }
    renderTableHead();
    renderTableBody();
    updateCountRow();
    if (showMoreEl) showMoreEl.hidden = true;
    return;
  }

  if (emptyEl) emptyEl.hidden = true;
  renderTableHead();
  renderTableBody();
  updateCountRow();

  if (showMoreEl) {
    showMoreEl.hidden = false;
    const shownEl = document.getElementById("leadsShown");
    const totalEl = document.getElementById("leadsTotal");
    if (shownEl) shownEl.textContent = _filteredLeads.length;
    if (totalEl) totalEl.textContent = _allLeads.length;
  }
}

function renderEmptyState() {
  const hasActiveFilters = _filters.source || _filters.stage || _filters.when ||
    (_filters.search || "").trim() ||
    _moreFilters.hasPhone || _moreFilters.hasEmail ||
    _moreFilters.replied || _moreFilters.unsubscribed;

  if (_allLeads.length === 0) {
    return `
      <div class="leads-empty-emoji">✨</div>
      <div class="leads-empty-headline">No leads yet — that's okay.</div>
      <div class="leads-empty-text">
        Leads show up here automatically when someone calls your AI or chats on your widget.
        You can also import a list from a spreadsheet.
      </div>
      <button class="leads-empty-cta" id="leadsEmptyImport">+ Import a list</button>
    `;
  }
  return `
    <div class="leads-empty-text">No leads match those filters.</div>
    <button class="leads-empty-cta" id="leadsClearFilters">Clear filters</button>
  `;
}

function updateCountRow() {
  const countEl = document.getElementById("leadsCount");
  if (countEl) {
    const n = _filteredLeads.length;
    countEl.textContent = n === _allLeads.length
      ? `${n} lead${n !== 1 ? "s" : ""}`
      : `${n} of ${_allLeads.length} leads`;
  }
}

function updateBulkBar() {
  const bar = document.getElementById("leadsBulkBar");
  const countEl = document.getElementById("leadsBulkCount");
  if (!bar) return;
  if (_selectedIds.size > 0 && _selectModeOn) {
    bar.hidden = false;
    if (countEl) countEl.textContent = `${_selectedIds.size} lead${_selectedIds.size !== 1 ? "s" : ""} selected`;
  } else {
    bar.hidden = true;
  }
}

function renderActiveFilterChips() {
  const wrap = document.getElementById("leadsActiveFilters");
  if (!wrap) return;
  const chips = [];
  if (_filters.source) chips.push({ key: "source", label: `How: ${SOURCE_LABELS[_filters.source] || _filters.source}` });
  if (_filters.stage)  chips.push({ key: "stage",  label: `Stage: ${STAGE_LABELS[_filters.stage] || _filters.stage}` });
  if (_filters.when) {
    const whenLabels = { today: "Today", week: "This week", month: "This month" };
    chips.push({ key: "when", label: `When: ${whenLabels[_filters.when] || _filters.when}` });
  }
  if (_moreFilters.hasPhone)     chips.push({ key: "more_hasPhone",     label: "Has phone" });
  if (_moreFilters.hasEmail)     chips.push({ key: "more_hasEmail",     label: "Has email" });
  if (_moreFilters.replied)      chips.push({ key: "more_replied",      label: "Replied" });
  if (_moreFilters.unsubscribed) chips.push({ key: "more_unsubscribed", label: "Unsubscribed" });

  if (!chips.length) {
    wrap.hidden = true;
    wrap.innerHTML = "";
    return;
  }
  wrap.hidden = false;
  wrap.innerHTML = chips.map(chip => `
    <span class="leads-active-chip">
      ${escapeHtml(chip.label)}
      <button type="button" data-remove-filter="${escapeHtml(chip.key)}" aria-label="Remove filter">×</button>
    </span>
  `).join("") + `<button type="button" class="leads-active-clear-all" id="leadsActiveClearAll">Clear all</button>`;

  wrap.querySelectorAll("[data-remove-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      const k = btn.dataset.removeFilter;
      if (k.startsWith("more_")) _moreFilters[k.slice(5)] = false;
      else _filters[k] = null;
      _refreshFiltersAndRender();
    });
  });
  const clearAllBtn = wrap.querySelector("#leadsActiveClearAll");
  if (clearAllBtn) clearAllBtn.addEventListener("click", clearAllFilters);
}

function clearAllFilters() {
  _filters.source = null;
  _filters.stage = null;
  _filters.when = null;
  _filters.search = "";
  _moreFilters = { hasPhone: false, hasEmail: false, replied: false, unsubscribed: false };
  const search = document.getElementById("leadsSearch");
  if (search) search.value = "";
  const clearBtn = document.getElementById("leadsSearchClear");
  if (clearBtn) clearBtn.hidden = true;
  _refreshFiltersAndRender();
}

function updateFilterPills() {
  const pills = document.querySelectorAll(".leads-filter-pill[data-filter]");
  pills.forEach(pill => {
    const f = pill.dataset.filter;
    const valEl = pill.querySelector(".leads-filter-value");
    const whenLabels = { today: "Today", week: "This week", month: "This month" };
    if (f === "source") {
      const isActive = !!_filters.source;
      pill.classList.toggle("is-active", isActive);
      if (valEl) valEl.textContent = isActive ? (SOURCE_LABELS[_filters.source] || _filters.source) : "All";
    } else if (f === "stage") {
      const isActive = !!_filters.stage;
      pill.classList.toggle("is-active", isActive);
      if (valEl) valEl.textContent = isActive ? (STAGE_LABELS[_filters.stage] || _filters.stage) : "All";
    } else if (f === "when") {
      const isActive = !!_filters.when;
      pill.classList.toggle("is-active", isActive);
      if (valEl) valEl.textContent = isActive ? (whenLabels[_filters.when] || _filters.when) : "All time";
    } else if (f === "more") {
      const hasMore = _moreFilters.hasPhone || _moreFilters.hasEmail || _moreFilters.replied || _moreFilters.unsubscribed;
      pill.classList.toggle("is-active", hasMore);
    }
  });
}

function _refreshFiltersAndRender() {
  applyFilters();
  renderTable();
  updateFilterPills();
  renderActiveFilterChips();
}

// ─── Filter dropdown menus ───────────────────────────────────────────────────

function _closeOpenMenu() {
  if (_openMenuEl && _openMenuEl.parentNode) {
    _openMenuEl.parentNode.removeChild(_openMenuEl);
  }
  _openMenuEl = null;
}

function _positionMenu(menu, anchor) {
  const r = anchor.getBoundingClientRect();
  const scrollY = window.scrollY || document.documentElement.scrollTop;
  menu.style.position = "fixed";
  menu.style.top = (r.bottom + 6) + "px";
  menu.style.left = r.left + "px";
  // Clamp to viewport
  document.body.appendChild(menu);
  const mw = menu.offsetWidth;
  const vw = window.innerWidth;
  if (r.left + mw > vw - 8) {
    menu.style.left = Math.max(8, vw - mw - 8) + "px";
  }
  _openMenuEl = menu;
}

function openSourceMenu(anchor) {
  _closeOpenMenu();
  const sources = [
    { v: null, label: "All sources" },
    { v: "phone_call", label: "📞 Phone call" },
    { v: "widget", label: "💬 Website widget" },
    { v: "csv_import", label: "📂 Imported" },
    { v: "instagram_dm", label: "📷 Instagram DM" },
    { v: "email_reply", label: "✉️ Email reply" },
  ];
  const menu = document.createElement("div");
  menu.className = "leads-filter-menu";
  menu.innerHTML = sources.map(s => `
    <button type="button" class="leads-filter-opt ${_filters.source === s.v ? "is-active" : ""}" data-val="${s.v === null ? "" : escapeHtml(s.v)}">
      ${escapeHtml(s.label)}
    </button>`).join("");
  menu.querySelectorAll(".leads-filter-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      _filters.source = btn.dataset.val || null;
      _closeOpenMenu();
      _refreshFiltersAndRender();
    });
  });
  _positionMenu(menu, anchor);
}

function openStageMenu(anchor) {
  _closeOpenMenu();
  const stages = [{ v: null, label: "All stages" }, ...STAGE_ORDER.map(v => ({ v, label: STAGE_LABELS[v] }))];
  const menu = document.createElement("div");
  menu.className = "leads-filter-menu";
  menu.innerHTML = stages.map(s => `
    <button type="button" class="leads-filter-opt ${_filters.stage === s.v ? "is-active" : ""}" data-val="${s.v === null ? "" : escapeHtml(s.v)}">
      ${escapeHtml(s.label)}
    </button>`).join("");
  menu.querySelectorAll(".leads-filter-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      _filters.stage = btn.dataset.val || null;
      _closeOpenMenu();
      _refreshFiltersAndRender();
    });
  });
  _positionMenu(menu, anchor);
}

function openWhenMenu(anchor) {
  _closeOpenMenu();
  const whens = [
    { v: null, label: "All time" },
    { v: "today", label: "Today" },
    { v: "week", label: "This week" },
    { v: "month", label: "This month" },
  ];
  const menu = document.createElement("div");
  menu.className = "leads-filter-menu";
  menu.innerHTML = whens.map(w => `
    <button type="button" class="leads-filter-opt ${_filters.when === w.v ? "is-active" : ""}" data-val="${w.v === null ? "" : escapeHtml(w.v)}">
      ${escapeHtml(w.label)}
    </button>`).join("");
  menu.querySelectorAll(".leads-filter-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      _filters.when = btn.dataset.val || null;
      _closeOpenMenu();
      _refreshFiltersAndRender();
    });
  });
  _positionMenu(menu, anchor);
}

function openMoreMenu(anchor) {
  _closeOpenMenu();
  const opts = [
    { key: "hasPhone",    label: "Has phone number" },
    { key: "hasEmail",    label: "Has email address" },
    { key: "replied",     label: "Has replied" },
    { key: "unsubscribed",label: "Unsubscribed" },
  ];
  const menu = document.createElement("div");
  menu.className = "leads-filter-menu";
  menu.innerHTML = opts.map(o => `
    <button type="button" class="leads-filter-opt ${_moreFilters[o.key] ? "is-active" : ""}" data-key="${escapeHtml(o.key)}">
      ${escapeHtml(o.label)}
    </button>`).join("");
  menu.querySelectorAll(".leads-filter-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      _moreFilters[btn.dataset.key] = !_moreFilters[btn.dataset.key];
      btn.classList.toggle("is-active", _moreFilters[btn.dataset.key]);
      _refreshFiltersAndRender();
    });
  });
  _positionMenu(menu, anchor);
}

// ─── Event handlers ──────────────────────────────────────────────────────────

let _searchDebounceTimer = null;

function attachEventHandlers() {
  // Search
  const search = document.getElementById("leadsSearch");
  const clearBtn = document.getElementById("leadsSearchClear");
  if (search) {
    search.addEventListener("input", () => {
      clearTimeout(_searchDebounceTimer);
      _searchDebounceTimer = setTimeout(() => {
        _filters.search = search.value;
        if (clearBtn) clearBtn.hidden = !search.value;
        _refreshFiltersAndRender();
      }, 150);
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (search) search.value = "";
      clearBtn.hidden = true;
      _filters.search = "";
      _refreshFiltersAndRender();
    });
  }

  // Keyboard shortcut / or Cmd+K → focus search
  document.addEventListener("keydown", (e) => {
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    if (["INPUT","TEXTAREA","SELECT"].includes(tag)) return;
    if (e.key === "/" || (e.metaKey && e.key === "k")) {
      e.preventDefault();
      if (search) { search.focus(); search.select(); }
    }
  });

  // Filter pills
  const pillSource = document.getElementById("leadsFilterSource");
  const pillStage  = document.getElementById("leadsFilterStage");
  const pillWhen   = document.getElementById("leadsFilterWhen");
  const pillMore   = document.getElementById("leadsFilterMore");
  if (pillSource) pillSource.addEventListener("click", () => openSourceMenu(pillSource));
  if (pillStage)  pillStage.addEventListener("click",  () => openStageMenu(pillStage));
  if (pillWhen)   pillWhen.addEventListener("click",   () => openWhenMenu(pillWhen));
  if (pillMore)   pillMore.addEventListener("click",   () => openMoreMenu(pillMore));

  // Close menus on outside click
  document.addEventListener("click", (e) => {
    if (_openMenuEl && !_openMenuEl.contains(e.target)) {
      _closeOpenMenu();
    }
  }, true);

  // Import button
  const importBtn = document.getElementById("leadsImportBtn");
  if (importBtn) {
    // Override: remove old listener and re-add
    const freshBtn = importBtn.cloneNode(true);
    importBtn.parentNode.replaceChild(freshBtn, importBtn);
    freshBtn.addEventListener("click", _openImport);
  }

  // Select-mode toggle
  const selectModeChk = document.getElementById("leadsSelectMode");
  if (selectModeChk) {
    selectModeChk.addEventListener("change", () => {
      _selectModeOn = selectModeChk.checked;
      if (!_selectModeOn) {
        _selectedIds.clear();
        updateBulkBar();
      }
      renderTable();
    });
  }

  // Bulk actions
  const bulkCancel = document.getElementById("leadsBulkCancel");
  if (bulkCancel) {
    bulkCancel.addEventListener("click", () => {
      _selectModeOn = false;
      _selectedIds.clear();
      const selectModeEl = document.getElementById("leadsSelectMode");
      if (selectModeEl) selectModeEl.checked = false;
      updateBulkBar();
      renderTable();
    });
  }

  document.querySelectorAll("[data-bulk-act]").forEach(btn => {
    btn.addEventListener("click", () => _handleBulkAction(btn.dataset.bulkAct));
  });
}

function _openImport() {
  const dlg = document.getElementById("csvImportDialog");
  if (dlg) { setCsvStep(1); _openDlg(dlg); }
}

async function _handleBulkAction(act) {
  if (!_selectedIds.size) return;
  const ids = Array.from(_selectedIds);

  if (act === "email") {
    sessionStorage.setItem("leadsSelectedIds", JSON.stringify(ids));
    _showLeadsToast("Campaigns: Select leads from your imported lists. (Full bulk-email wiring coming in v1.5)", "info");
    return;
  }

  if (act === "stage") {
    _openBulkStageDropdown(ids);
    return;
  }

  if (act === "campaign" || act === "more") {
    _showLeadsToast("Coming soon — bulk campaign enroll and more actions landing in v1.5.", "info");
    return;
  }
}

function _openBulkStageDropdown(ids) {
  const bar = document.getElementById("leadsBulkBar");
  const stageBtn = bar && bar.querySelector("[data-bulk-act='stage']");
  if (!stageBtn) return;
  _closeOpenMenu();
  const menu = document.createElement("div");
  menu.className = "leads-filter-menu";
  menu.innerHTML = STAGE_ORDER.map(s => `
    <button type="button" class="leads-filter-opt" data-stage="${escapeHtml(s)}">${escapeHtml(STAGE_LABELS[s])}</button>`).join("");
  menu.querySelectorAll(".leads-filter-opt").forEach(btn => {
    btn.addEventListener("click", async () => {
      _closeOpenMenu();
      const stage = btn.dataset.stage;
      let ok = 0;
      await Promise.all(ids.map(async id => {
        try {
          const res = await fetch(`/me/leads/${encodeURIComponent(id)}/stage`, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stage }),
          });
          if (res.ok) { ok++; const l = _allLeads.find(x => x.id === id); if (l) l.stage = stage; }
        } catch (_) {}
      }));
      _selectedIds.clear();
      _selectModeOn = false;
      const selectModeEl = document.getElementById("leadsSelectMode");
      if (selectModeEl) selectModeEl.checked = false;
      updateBulkBar();
      applyFilters();
      renderTable();
      _showLeadsToast(`Updated ${ok} lead${ok !== 1 ? "s" : ""} to ${STAGE_LABELS[stage]}.`, "success");
    });
  });
  _positionMenu(menu, stageBtn);
}

// ─── Main load ───────────────────────────────────────────────────────────────

async function loadUnifiedLeads() {
  const loadingEl = document.getElementById("leadsLoading");
  const emptyEl   = document.getElementById("leadsEmpty");
  const tbody     = document.getElementById("leadsTableBody");
  if (!tbody) return;

  if (loadingEl) loadingEl.hidden = false;
  if (emptyEl)   emptyEl.hidden   = true;

  try {
    const res = await fetch("/me/leads", { credentials: "same-origin" });
    if (!res.ok) throw new Error("fetch failed " + res.status);
    const body = await res.json();
    _allLeads = body.leads || [];
    applyFilters();
    renderTable();
    updateFilterPills();
    renderActiveFilterChips();
  } catch (e) {
    if (loadingEl) loadingEl.hidden = true;
    if (emptyEl) {
      emptyEl.hidden = false;
      emptyEl.innerHTML = `<div class="leads-empty-text">Couldn't load leads — check your connection and try again.</div>`;
    }
  }
}

// ─── Imports list ────────────────────────────────────────────────────────────

async function loadImports() {
  const list = document.getElementById("leadsImportsList");
  if (!list) return;
  try {
    const res = await fetch("/me/leads/imports", { credentials: "same-origin" });
    if (!res.ok) return;
    const body = await res.json();
    const imports = (body.imports || []).slice().reverse();
    if (!imports.length) {
      list.innerHTML = `<div class="leads-empty"><span class="leads-empty-icon">📥</span><span>No imports yet — upload a CSV to start your first campaign.</span></div>`;
      return;
    }
    list.innerHTML = imports.map(imp => `
      <div class="leads-import-row" data-import-id="${imp.id}">
        <div class="li-meta-wrap">
          <div class="li-title">${escapeHtml(imp.import_purpose || imp.filename)}</div>
          <div class="li-meta">${imp.row_count} recipients · uploaded ${new Date(imp.created_at*1000).toLocaleDateString()}</div>
        </div>
        <div class="leads-import-actions">
          <button type="button" data-import-view="${imp.id}">View leads</button>
          <button type="button" data-import-remove="${imp.id}" aria-label="Remove import" title="Remove this import and its leads"></button>
        </div>
      </div>
    `).join("");
    list.querySelectorAll("[data-import-view]").forEach(b =>
      b.addEventListener("click", () => viewImportedLeads(b.dataset.importView)));
    list.querySelectorAll("[data-import-remove]").forEach(b =>
      b.addEventListener("click", () => removeImport(b.dataset.importRemove, imports.find(i => i.id === b.dataset.importRemove))));
  } catch (e) { /* network */ }
}

async function removeImport(importId, imp) {
  if (!importId) return;
  const label = (imp && (imp.import_purpose || imp.filename)) || "this import";
  const count = imp && imp.row_count ? ` and its ${imp.row_count} leads` : " and its leads";
  if (!window.confirm(`Remove "${label}"${count}? This can't be undone.`)) return;
  try {
    const res = await fetch(`/me/leads/imports/${encodeURIComponent(importId)}`, {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Couldn't remove that import. Try again.");
      return;
    }
    const wrap = document.getElementById("leadsImportedLeadsWrap");
    if (wrap && !wrap.hidden) {
      wrap.hidden = true;
      const importsList = document.getElementById("leadsImportsList");
      if (importsList) importsList.style.display = "";
    }
    await loadImports();
    // Also refresh unified table
    await loadUnifiedLeads();
  } catch (e) {
    alert("Network error. Try again.");
  }
}

let _importedLeadsCache = [];

async function removeImportedLead(leadId, rowEl) {
  if (!leadId) return;
  if (!window.confirm("Remove this lead?")) return;
  try {
    const res = await fetch(`/me/leads/${encodeURIComponent(leadId)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Couldn't remove that lead.");
      return;
    }
    if (rowEl && rowEl.parentNode) rowEl.parentNode.removeChild(rowEl);
    _importedLeadsCache = _importedLeadsCache.filter((l) => l.id !== leadId);
    const title = document.getElementById("leadsImportedTitle");
    if (title) title.textContent = `${_importedLeadsCache.length} imported leads`;
  } catch (e) {
    alert("Network error. Try again.");
  }
}

async function viewImportedLeads(importId) {
  try {
    const res = await fetch(`/me/leads?source=csv_import&import_id=${encodeURIComponent(importId)}`, { credentials: "same-origin" });
    if (!res.ok) return;
    const body = await res.json();
    _importedLeadsCache = body.leads || [];
    const wrap = document.getElementById("leadsImportedLeadsWrap");
    const tbody = document.getElementById("leadsImportedTableBody");
    const title = document.getElementById("leadsImportedTitle");
    if (title) title.textContent = `${_importedLeadsCache.length} imported leads`;
    if (wrap) wrap.hidden = false;
    const importsList = document.getElementById("leadsImportsList");
    if (importsList) importsList.style.display = "none";
    if (tbody) {
      tbody.innerHTML = _importedLeadsCache.map(l => `
        <tr data-lead-row="${l.id}">
          <td><input type="checkbox" data-lead-id="${l.id}" checked></td>
          <td>${escapeHtml((l.first_name || "") + " " + (l.last_name || ""))}</td>
          <td>${escapeHtml(l.email || "")}</td>
          <td>${escapeHtml(l.phone || "")}</td>
          <td>${escapeHtml(l.service_type || "")}</td>
          <td>${l.has_reply ? "Replied" : "—"}</td>
          <td style="text-align:right;"><button type="button" class="leads-row-remove" data-lead-remove="${l.id}" aria-label="Remove lead" title="Remove this lead"></button></td>
        </tr>
      `).join("");
      tbody.querySelectorAll("[data-lead-remove]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          const id = btn.dataset.leadRemove;
          const row = btn.closest("tr");
          removeImportedLead(id, row);
        });
      });
      const checkAll = document.getElementById("leadsImportedCheckAll");
      const sel = document.getElementById("leadsImportedSelected");
      function updateCount() {
        const n = tbody.querySelectorAll("input[type='checkbox']:checked").length;
        if (sel) sel.textContent = `${n} selected`;
      }
      if (checkAll) {
        checkAll.addEventListener("change", () => {
          tbody.querySelectorAll("input[type='checkbox']").forEach(c => c.checked = checkAll.checked);
          updateCount();
        });
      }
      tbody.addEventListener("change", updateCount);
      updateCount();
    }
  } catch (e) {}
}

// ─── Back button (delegated) ──────────────────────────────────────────────────

function _wireImportedBack() {
  document.addEventListener("click", (ev) => {
    if (ev.target && ev.target.id === "leadsImportedBack") {
      const wrap = document.getElementById("leadsImportedLeadsWrap");
      if (wrap) wrap.hidden = true;
      const importsList = document.getElementById("leadsImportsList");
      if (importsList) importsList.style.display = "";
    }
  });
}

// ─── CSV import wizard ────────────────────────────────────────────────────────

function setCsvStep(n) {
  document.querySelectorAll("#csvImportDialog .pn-step").forEach(s => {
    s.hidden = String(s.dataset.csvStep) !== String(n);
  });
  document.querySelectorAll("#csvImportDialog .pn-dot").forEach(d => {
    const s = parseInt(d.dataset.csvStep, 10);
    d.classList.toggle("is-active", s === n);
    d.classList.toggle("is-done", s < n);
  });
}

function initCsvImport() {
  const dlg = document.getElementById("csvImportDialog");
  if (!dlg) return;
  let parsedRows = [];
  let parsedHeaders = [];

  document.getElementById("csvImportClose").addEventListener("click", () => _closeDlg(dlg));
  document.getElementById("csvCancel").addEventListener("click", () => _closeDlg(dlg));

  const fileInp = document.getElementById("csvFile");
  const next1 = document.getElementById("csvNext1");
  fileInp.addEventListener("change", () => {
    next1.disabled = !fileInp.files || !fileInp.files[0];
  });
  next1.addEventListener("click", () => {
    const f = fileInp.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (!lines.length) { alert("Empty file."); return; }
      parsedHeaders = lines[0].split(",").map(s => s.trim().replace(/^"|"$/g, ""));
      parsedRows = lines.slice(1, 4).map(l => l.split(",").map(s => s.trim().replace(/^"|"$/g, "")));
      _csvUserMap = {};
      renderMapper();
      setCsvStep(2);
    };
    reader.readAsText(f);
  });

  const _csvCanonical = ["first_name","last_name","email","phone","company",
                         "appointment_date","appointment_time","service_type"];
  const _csvAliases = {
    "name": "first_name", "fullname": "first_name", "firstname": "first_name", "first": "first_name", "givenname": "first_name",
    "lastname": "last_name", "last": "last_name", "surname": "last_name", "familyname": "last_name",
    "emailaddress": "email", "email": "email", "mail": "email", "e_mail": "email",
    "phonenumber": "phone", "mobile": "phone", "cell": "phone", "tel": "phone", "telephone": "phone", "phone": "phone",
    "businessname": "company", "organization": "company", "org": "company", "company": "company",
    "service": "service_type", "servicetype": "service_type", "service_type": "service_type",
    "date": "appointment_date", "apptdate": "appointment_date", "appointmentdate": "appointment_date", "appointment_date": "appointment_date",
    "time": "appointment_time", "appttime": "appointment_time", "appointmenttime": "appointment_time", "appointment_time": "appointment_time",
  };
  function _csvSlug(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }
  function _csvAutoTarget(header) {
    const slug = _csvSlug(header);
    if (_csvCanonical.includes(slug)) return slug;
    if (_csvAliases[slug]) return _csvAliases[slug];
    return "custom";
  }

  let _csvUserMap = {};

  function renderMapper() {
    const root = document.getElementById("csvMapper");
    if (!parsedHeaders.length) {
      root.innerHTML = '<div class="csv-empty">No columns detected. Make sure the first row of your CSV is the header row.</div>';
      return;
    }
    const targetOptions = [
      { v: "first_name",       label: "First name" },
      { v: "last_name",        label: "Last name"  },
      { v: "email",            label: "Email"      },
      { v: "phone",            label: "Phone"      },
      { v: "company",          label: "Company"    },
      { v: "appointment_date", label: "Appointment date" },
      { v: "appointment_time", label: "Appointment time" },
      { v: "custom",           label: "Custom field (passes through)" },
    ];
    const sample = parsedRows[0] || [];
    let emailMapped = false;
    const rowsHtml = parsedHeaders.map((h, idx) => {
      const userChoice = _csvUserMap[h];
      const dropped = userChoice === "drop";
      const target = dropped ? "drop" : (userChoice || _csvAutoTarget(h));
      if (target === "email") emailMapped = true;
      const sampleVal = (sample[idx] || "").trim();
      const opts = targetOptions.map(o => {
        const sel = (o.v === target) ? " selected" : "";
        return `<option value="${escapeHtml(o.v)}"${sel}>${escapeHtml(o.label)}</option>`;
      }).join("");
      return `
        <div class="csv-map-row ${dropped ? "is-dropped" : ""}" data-csv-header="${escapeHtml(h)}">
          <div class="csv-map-meta">
            <div class="csv-map-name">${escapeHtml(h || "(unnamed)")}</div>
            <div class="csv-map-sample">${sampleVal ? "e.g. " + escapeHtml(sampleVal.slice(0, 60)) : "(empty in first row)"}</div>
          </div>
          <select class="csv-map-select" data-csv-header="${escapeHtml(h)}" ${dropped ? "disabled" : ""}>${opts}</select>
          <button type="button" class="csv-map-remove" data-csv-drop="${escapeHtml(h)}" aria-label="${dropped ? "Restore column" : "Drop column"}" title="${dropped ? "Restore" : "Drop this column"}"></button>
        </div>
      `;
    }).join("");
    const warn = emailMapped ? "" : `
      <div class="csv-warn">
        <strong>One column needs to be Email.</strong>
        We couldn't auto-detect an email column. Pick the column that holds email addresses below — without it, no row can be imported.
      </div>`;
    const total = parsedHeaders.length;
    const dropped = parsedHeaders.filter(h => _csvUserMap[h] === "drop").length;
    const counter = `<div class="csv-map-counter">${total - dropped} of ${total} columns will be imported${dropped ? ` · ${dropped} dropped` : ""}</div>`;
    root.innerHTML = warn + counter + `<div class="csv-map-list">${rowsHtml}</div>`;

    root.querySelectorAll(".csv-map-select").forEach(sel => {
      sel.addEventListener("change", () => {
        _csvUserMap[sel.dataset.csvHeader] = sel.value;
        renderMapper();
      });
    });
    root.querySelectorAll("[data-csv-drop]").forEach(btn => {
      btn.addEventListener("click", () => {
        const h = btn.dataset.csvDrop;
        _csvUserMap[h] = (_csvUserMap[h] === "drop") ? null : "drop";
        renderMapper();
      });
    });
  }

  document.getElementById("csvBack2").addEventListener("click", () => setCsvStep(1));
  document.getElementById("csvNext2").addEventListener("click", async () => {
    const map = {};
    parsedHeaders.forEach((h) => {
      const choice = _csvUserMap[h];
      map[h] = (choice === "drop") ? "drop"
             : (choice || _csvAutoTarget(h));
    });
    const hasEmail = Object.values(map).includes("email");
    if (!hasEmail) {
      alert("Pick a column for Email. Without it, no rows can be imported.");
      return;
    }
    const fd = new FormData();
    fd.append("file", fileInp.files[0]);
    fd.append("import_purpose", document.getElementById("csvPurpose").value || "");
    fd.append("column_map", JSON.stringify(map));
    fd.append("dedupe_strategy", "skip");
    try {
      const res = await fetch("/me/leads/import", { method: "POST", credentials: "same-origin", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body.message || (
          body.error === "no_email_column" ? "Pick the column that contains email addresses, then upload again." :
          body.error === "no_valid_rows" ? "We read your file but couldn't find any rows with a valid email address." :
          `Import failed: ${body.error || res.status}`
        );
        alert(msg);
        return;
      }
      const body = await res.json();
      document.getElementById("csvSummary").innerHTML = `
        <div style="font-size:18px;font-weight:800;margin-bottom:6px;">${body.row_count} rows processed</div>
        <div style="color:#475569;font-size:13.5px;">${body.inserted} new · ${body.updated} updated · ${body.skipped} skipped</div>`;
      window._lastImportId = body.import_id;
      setCsvStep(3);
      if (typeof window.invalidateSection === "function") {
        window.invalidateSection("leads");
        window.invalidateSection("campaigns");
      }
      loadImports();
      // Refresh unified table so new leads appear immediately
      await loadUnifiedLeads();
    } catch (e) { alert("Network error."); }
  });

  document.getElementById("csvDoneAnother").addEventListener("click", () => {
    fileInp.value = ""; next1.disabled = true; setCsvStep(1);
  });
  document.getElementById("csvStartCampaign").addEventListener("click", () => {
    _closeDlg(dlg);
    if (window._lastImportId && typeof window.openCampaignWizard === "function") {
      window.openCampaignWizard({ importId: window._lastImportId });
    }
  });
}

// ─── Module init ─────────────────────────────────────────────────────────────

let _initialized = false;

export function init() {
  if (_initialized) return;
  _initialized = true;
  attachEventHandlers();
  initCsvImport();
  _wireImportedBack();
}

// ─── Expose globals ───────────────────────────────────────────────────────────

window.loadUnifiedLeads = loadUnifiedLeads;

window.loadLeadsSection = function () {
  // Legacy shim — kept so any stray callers don't throw.
  loadUnifiedLeads();
};

window.__leadsRoute = {
  loadImports,
  loadUnifiedLeads,
  init,
};
