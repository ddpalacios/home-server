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
const STAGE_COLORS = {
  new:"#888780", contacted:"#378ADD", engaged:"#7F77DD",
  quoted:"#BA7517", scheduled:"#1D9E75", won:"#639922", lost:"#A32D2D",
};
const BOARD_STAGES = ["new","contacted","engaged","quoted","scheduled","won"];
const FUNNEL_ORDER = ["new","contacted","engaged","quoted","scheduled","won","lost"];

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
let _selectModeOn = true;  // Phase 1: checkboxes always visible
let _expandedIds = new Set();  // Lead IDs whose inline detail panel is open
let _sortBy = { key: "created_at", dir: "desc" };
let _filters = { source: null, stage: null, when: null, search: "", advanced: [] };
let _moreFilters = { hasPhone: false, hasEmail: false, replied: false, unsubscribed: false };
let _openMenuEl = null;
let _view = "table";  // "table" | "funnel" | "board"
let _dragLeadId = "";

// ─── Unified table — utilities ───────────────────────────────────────────────

function avatarColor(name) {
  let h = 0;
  for (const c of (name || "")) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  const palette = ["#6366f1","#10b981","#f59e0b","#ef4444","#3b82f6","#8b5cf6","#ec4899"];
  return palette[Math.abs(h) % palette.length];
}

function relativeTime(v) {
  if (!v) return "—";
  const dt = _toDate(v);
  if (!dt) return "—";
  const diff = Math.floor((Date.now() - dt.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hour${diff >= 7200 ? "s" : ""} ago`;
  if (diff < 86400 * 14) {
    const d = Math.floor(diff / 86400);
    if (d === 1) return "yesterday";
    return `${d} days ago`;
  }
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

// ─── Stage-aware "Details" column ────────────────────────────────────────────

const CHANNEL_ICONS = { email: "📧", sms: "💬", call: "📞", phone: "📞", instagram: "📷" };
const CHANNEL_LABELS = { email: "Email", sms: "SMS", call: "Call", phone: "Phone", instagram: "Instagram" };

function _fmtMoney(amount) {
  const n = Number(amount);
  if (!isFinite(n)) return "";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

// Accepts ISO 8601 strings ("2026-05-12T09:00:00"), epoch seconds (number or
// numeric string up to ~10 digits), epoch milliseconds (>= 13 digits), or
// Date objects. Returns "" for anything unparseable so callers can branch.
function _toDate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v === "number") {
    const d = new Date(v < 1e12 ? v * 1000 : v);
    return isNaN(d) ? null : d;
  }
  const s = String(v).trim();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    const d = new Date(n < 1e12 ? n * 1000 : n);
    return isNaN(d) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function _fmtAppt(v) {
  const d = _toDate(v);
  if (!d) return "";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${months[d.getMonth()]} ${d.getDate()}, ${h}:${String(m).padStart(2,"0")} ${ampm}`;
}

function _fmtShortDate(v) {
  const d = _toDate(v);
  if (!d) return "";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function _truncate(s, n) {
  s = String(s || "");
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

function stageDetailsFor(lead) {
  // Returns { text, full } where text is short for the cell, full is the title attr.
  // Falls back to "—" gracefully for missing fields.
  const stage = lead.stage || "new";
  if (stage === "new") return { text: "", full: "" };

  if (stage === "contacted") {
    const ch = lead.last_contact_channel || lead.last_channel;
    const t  = lead.last_contacted_at || lead.last_activity_at;
    if (!ch && !t) return { text: "—", full: "" };
    const icon = CHANNEL_ICONS[ch] || "📧";
    const lbl  = CHANNEL_LABELS[ch] || (ch ? String(ch) : "Email");
    const when = t ? relativeTime(t) : "—";
    const text = `${icon} ${lbl} · ${when}`;
    return { text, full: text };
  }

  if (stage === "engaged") {
    const note = lead.last_response || lead.last_note || lead.last_reply || lead.notes;
    if (!note) return { text: "—", full: "" };
    const full = String(note);
    return { text: _truncate(full, 30), full };
  }

  if (stage === "quoted") {
    const amt = lead.quote_amount;
    const sent = lead.quote_sent_at;
    if (amt == null && !sent) return { text: "—", full: "" };
    const parts = [];
    if (amt != null) parts.push(_fmtMoney(amt));
    if (sent) parts.push("sent " + relativeTime(sent));
    if (!parts.length) return { text: "—", full: "" };
    const text = parts.join(" · ");
    return { text, full: text };
  }

  if (stage === "scheduled") {
    const t = lead.appointment_time || lead.appointment_at;
    if (!t) return { text: "—", full: "" };
    const formatted = _fmtAppt(t);
    if (!formatted) return { text: "—", full: "" };
    const text = "📅 " + formatted;
    return { text, full: text };
  }

  if (stage === "won") {
    const date = lead.job_complete_date || lead.won_at;
    const val  = lead.job_value || lead.quote_amount;
    if (!date && val == null) return { text: "—", full: "" };
    const parts = ["✓ Job done"];
    if (date) parts[0] = "✓ Job done " + _fmtShortDate(date);
    if (val != null) parts.push(_fmtMoney(val));
    const text = parts.join(" · ");
    return { text, full: text };
  }

  if (stage === "lost") {
    const reason = lead.lost_reason;
    const at = lead.lost_at;
    if (!reason && !at) return { text: "—", full: "" };
    const parts = [];
    if (reason) parts.push(String(reason));
    if (at) parts.push(_fmtShortDate(at));
    const text = parts.join(" · ");
    return { text, full: text };
  }

  return { text: "—", full: "" };
}

// ─── Advanced filter evaluation ──────────────────────────────────────────────

const ADV_FIELDS = {
  stage:            { type: "stage",  label: "Stage" },
  source:           { type: "text",   label: "Source", reader: (l) => l.source || "" },
  last_contacted:   { type: "date",   label: "Last contacted", reader: (l) => l.last_contacted_at || l.last_activity_at || 0 },
  last_activity:    { type: "date",   label: "Last activity",  reader: (l) => l.last_activity_at || l.updated_at || l.created_at || 0 },
  quote_amount:     { type: "number", label: "Quote amount",   reader: (l) => (l.quote_amount != null ? Number(l.quote_amount) : null) },
  appointment_time: { type: "date",   label: "Appointment time", reader: (l) => l.appointment_time || l.appointment_at || 0 },
  job_date:         { type: "date",   label: "Job date",       reader: (l) => l.job_complete_date || l.won_at || 0 },
};

const ADV_OPS_BY_TYPE = {
  text:   ["is","is not","contains","doesn't contain"],
  date:   ["is more than X days ago","is less than X days ago","is between X and Y","was today","was yesterday"],
  number: ["is greater than","is less than","equals"],
  stage:  ["is","is not","is one of"],
};

function _daysAgoUnix(days) {
  return Math.floor(Date.now() / 1000) - Number(days) * 86400;
}
function _startOfDayUnix(daysOffset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + (daysOffset || 0));
  return Math.floor(d.getTime() / 1000);
}
function _endOfDayUnix(daysOffset) {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  d.setDate(d.getDate() + (daysOffset || 0));
  return Math.floor(d.getTime() / 1000);
}

function _evalAdvCondition(lead, cond) {
  const f = ADV_FIELDS[cond.field];
  if (!f) return true;
  const op = cond.op;
  const v  = cond.value;

  if (f.type === "text") {
    const lv = String(f.reader(lead) || "").toLowerCase();
    const rv = String(v || "").toLowerCase();
    if (!rv) return true;
    if (op === "is")             return lv === rv;
    if (op === "is not")         return lv !== rv;
    if (op === "contains")       return lv.includes(rv);
    if (op === "doesn't contain")return !lv.includes(rv);
    return true;
  }

  if (f.type === "stage") {
    const lv = lead.stage || "new";
    if (op === "is")        return lv === v;
    if (op === "is not")    return lv !== v;
    if (op === "is one of") return Array.isArray(v) && v.includes(lv);
    return true;
  }

  if (f.type === "number") {
    const lv = f.reader(lead);
    const rv = Number(v);
    if (lv == null || isNaN(rv)) return false;
    if (op === "is greater than") return lv > rv;
    if (op === "is less than")    return lv < rv;
    if (op === "equals")          return lv === rv;
    return true;
  }

  if (f.type === "date") {
    const lv = Number(f.reader(lead) || 0);
    if (op === "is more than X days ago") {
      const days = Number(v); if (!isFinite(days)) return true;
      if (!lv) return false;
      return lv < _daysAgoUnix(days);
    }
    if (op === "is less than X days ago") {
      const days = Number(v); if (!isFinite(days)) return true;
      if (!lv) return false;
      const cutoff = _daysAgoUnix(days);
      return lv >= cutoff && lv <= Math.floor(Date.now()/1000);
    }
    if (op === "is between X and Y") {
      // value is { from, to } where from/to are day offsets relative to today,
      // OR ISO date strings. We accept both — saved views use offsets, manual UI uses dates.
      if (!v) return true;
      let fromTs, toTs;
      if (typeof v.fromOffset === "number" && typeof v.toOffset === "number") {
        fromTs = _startOfDayUnix(v.fromOffset);
        toTs   = _endOfDayUnix(v.toOffset);
      } else {
        const fd = v.from ? new Date(v.from) : null;
        const td = v.to   ? new Date(v.to)   : null;
        if (!fd || !td || isNaN(fd) || isNaN(td)) return true;
        fd.setHours(0,0,0,0); td.setHours(23,59,59,999);
        fromTs = Math.floor(fd.getTime()/1000);
        toTs   = Math.floor(td.getTime()/1000);
      }
      if (!lv) return false;
      return lv >= fromTs && lv <= toTs;
    }
    if (op === "was today") {
      if (!lv) return false;
      return lv >= _startOfDayUnix(0) && lv <= _endOfDayUnix(0);
    }
    if (op === "was yesterday") {
      if (!lv) return false;
      return lv >= _startOfDayUnix(-1) && lv <= _endOfDayUnix(-1);
    }
    return true;
  }

  return true;
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

  // Advanced conditions (combined with AND, AND-with primary filters)
  if (Array.isArray(_filters.advanced) && _filters.advanced.length) {
    data = data.filter(l => _filters.advanced.every(c => _evalAdvCondition(l, c)));
  }

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
  { key: "details",    label: "Details",        sortable: false, helpText: "What's happening with this lead right now — depends on the stage." },
  { key: "reach",      label: "Reach",          sortable: false, helpText: "Ways you can contact this person — email and/or phone." },
  { key: "created_at", label: "Added",          sortable: true },
  { key: "last_activity", label: "Last activity", sortable: true },
];

function renderTableHead() {
  const thead = document.getElementById("leadsTableHead");
  if (!thead) return;
  const { key: sortKey, dir: sortDir } = _sortBy;
  thead.innerHTML = `<tr>
    ${_selectModeOn ? `<th data-sortable="false" style="width:40px;"><input type="checkbox" id="leadsSelectAll" aria-label="Select all visible"></th>` : ""}
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
    const cbAll = thead.querySelector("#leadsSelectAll");
    if (cbAll) {
      // Compute checked / indeterminate state from current filtered set
      const visibleIds = _filteredLeads.map(l => l.id);
      const visibleSelected = visibleIds.filter(id => _selectedIds.has(id)).length;
      if (visibleSelected === 0) {
        cbAll.checked = false; cbAll.indeterminate = false;
      } else if (visibleSelected === visibleIds.length) {
        cbAll.checked = true;  cbAll.indeterminate = false;
      } else {
        cbAll.checked = false; cbAll.indeterminate = true;
      }
      cbAll.addEventListener("change", () => {
        if (cbAll.checked) {
          _filteredLeads.forEach(l => _selectedIds.add(l.id));
        } else {
          _filteredLeads.forEach(l => _selectedIds.delete(l.id));
        }
        renderTableBody();
        renderSelectAllAcrossLink();
        updateBulkBar();
        renderTableHead();
      });
    }
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
  const isExpanded = _expandedIds.has(lead.id);

  const reachHtml = `
    <span class="leads-reach-cell">
      <span class="leads-reach-icon ${lead.email ? "" : "muted"}" title="${lead.email ? escapeHtml(lead.email) : "No email"}">✉️</span>
      <span class="leads-reach-icon ${lead.phone ? "" : "muted"}" title="${lead.phone ? escapeHtml(lead.phone) : "No phone"}">📞</span>
    </span>`;

  const selectCell = _selectModeOn
    ? `<td style="width:40px;" data-no-expand="1"><input type="checkbox" class="leads-row-cb" data-id="${escapeHtml(lead.id)}" ${isSelected ? "checked" : ""}></td>`
    : "";

  const det = stageDetailsFor(lead);
  const detailsCell = `<td class="leads-details-cell" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#374151;font-size:13px;" title="${escapeHtml(det.full || "")}">${escapeHtml(det.text || "")}</td>`;

  const mainRow = `<tr data-lead-id="${escapeHtml(lead.id)}" class="${isSelected ? "is-selected" : ""} ${isExpanded ? "is-expanded" : ""}">
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
    ${detailsCell}
    <td data-no-expand="1">${reachHtml}</td>
    <td style="color:#6b7280;font-size:13px;">${relativeTime(lead.created_at)}</td>
    <td style="color:#6b7280;font-size:13px;">${relativeTime(lastActTime)}</td>
  </tr>`;

  const expandedRow = isExpanded ? renderExpandedPanelRow(lead) : "";
  return mainRow + expandedRow;
}

function renderExpandedPanelRow(lead) {
  const colSpan = COLUMNS.length + (_selectModeOn ? 1 : 0);
  const stage = lead.stage || "new";

  // Collect every interesting field, only show non-empty ones.
  const fields = [];
  const push = (label, value) => {
    if (value == null || value === "") return;
    fields.push({ label, value: String(value) });
  };
  push("Email", lead.email);
  push("Phone", lead.phone);
  push("Company", lead.company);
  push("Source", SOURCE_LABELS[lead.source] || lead.source);
  push("Stage", STAGE_LABELS[stage] || stage);
  push("Service type", lead.service_type);
  // Stage-specific
  if (stage === "contacted" || stage === "engaged") {
    push("Last contacted", lead.last_contacted_at ? relativeTime(lead.last_contacted_at) : null);
    push("Last channel", CHANNEL_LABELS[lead.last_contact_channel] || lead.last_contact_channel);
  }
  if (stage === "engaged") {
    push("Last response", lead.last_response || lead.last_reply);
  }
  if (stage === "quoted") {
    push("Quote amount", lead.quote_amount != null ? _fmtMoney(lead.quote_amount) : null);
    push("Quote sent", lead.quote_sent_at ? relativeTime(lead.quote_sent_at) : null);
  }
  if (stage === "scheduled") {
    push("Appointment", lead.appointment_time ? _fmtAppt(lead.appointment_time) : (lead.appointment_at ? _fmtAppt(lead.appointment_at) : null));
  }
  if (stage === "won") {
    push("Job complete", lead.job_complete_date ? _fmtShortDate(lead.job_complete_date) : null);
    push("Job value", (lead.job_value != null ? _fmtMoney(lead.job_value) : null));
  }
  if (stage === "lost") {
    push("Lost reason", lead.lost_reason);
    push("Lost on", lead.lost_at ? _fmtShortDate(lead.lost_at) : null);
  }
  push("Added", lead.created_at ? relativeTime(lead.created_at) : null);
  push("Last activity", lead.last_activity_at ? relativeTime(lead.last_activity_at) : null);
  push("Notes", lead.notes);
  push("Has reply", lead.has_reply ? "Yes" : null);
  push("Unsubscribed", lead.unsubscribed ? "Yes" : null);

  const fieldsHtml = fields.map(f => `
    <div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid #f1f5f9;">
      <span style="min-width:130px;color:#6b7280;font-size:12px;font-weight:500;">${escapeHtml(f.label)}</span>
      <span style="color:#111827;font-size:13px;flex:1;word-break:break-word;">${escapeHtml(f.value)}</span>
    </div>
  `).join("");

  // "Open full profile" wired to existing single-lead modal if present
  const hasProfile = (typeof window !== "undefined" && typeof window.openLeadDetailModal === "function");
  const openBtn = hasProfile
    ? `<button type="button" class="leads-expanded-btn primary" data-act="open-profile" data-lead-id="${escapeHtml(lead.id)}" style="padding:7px 14px;border-radius:8px;border:1px solid #0a0a0a;background:#0a0a0a;color:#fff;font-size:13px;cursor:pointer;">Open full profile</button>`
    : "";

  return `<tr class="leads-expanded-row" data-expanded-for="${escapeHtml(lead.id)}">
    <td colspan="${colSpan}" style="padding:0;background:#fafafa;border-top:1px solid #e5e7eb;">
      <div style="padding:14px 18px;display:flex;flex-direction:column;gap:12px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 24px;">${fieldsHtml || '<div style="color:#9ca3af;font-size:13px;">No additional details available for this lead.</div>'}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid #e5e7eb;padding-top:12px;">
          ${openBtn}
          <button type="button" class="leads-expanded-btn" data-act="send-email" data-lead-id="${escapeHtml(lead.id)}" style="padding:7px 14px;border-radius:8px;border:1px solid #d1d5db;background:#fff;color:#0a0a0a;font-size:13px;cursor:pointer;">Send single email</button>
          <button type="button" class="leads-expanded-btn" data-act="edit" data-lead-id="${escapeHtml(lead.id)}" style="padding:7px 14px;border-radius:8px;border:1px solid #d1d5db;background:#fff;color:#0a0a0a;font-size:13px;cursor:pointer;">Edit details</button>
        </div>
      </div>
    </td>
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

  // Row click → toggle expanded panel
  // Excludes the checkbox cell (data-no-expand), the reach cell (data-no-expand),
  // and any explicit links/buttons inside cells.
  tbody.querySelectorAll("tr[data-lead-id]").forEach(row => {
    row.addEventListener("click", (e) => {
      const t = e.target;
      if (!t) return;
      if (t.tagName === "INPUT" || t.tagName === "BUTTON" || t.tagName === "A") return;
      if (t.closest && t.closest("[data-no-expand]")) return;
      const id = row.dataset.leadId;
      if (_expandedIds.has(id)) _expandedIds.delete(id);
      else _expandedIds.add(id);
      renderTableBody();
    });
  });

  // Per-row checkbox change
  if (_selectModeOn) {
    tbody.querySelectorAll(".leads-row-cb").forEach(cb => {
      cb.addEventListener("change", (e) => {
        e.stopPropagation();
        if (cb.checked) _selectedIds.add(cb.dataset.id);
        else _selectedIds.delete(cb.dataset.id);
        const row = cb.closest("tr");
        if (row) row.classList.toggle("is-selected", cb.checked);
        renderTableHead();
        renderSelectAllAcrossLink();
        updateBulkBar();
      });
      // Also stop click bubbling so cell click on the checkbox cell doesn't toggle expand
      cb.addEventListener("click", (e) => e.stopPropagation());
    });
  }

  // Expanded-panel action buttons
  tbody.querySelectorAll(".leads-expanded-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const act = btn.dataset.act;
      const id = btn.dataset.leadId;
      const lead = _allLeads.find(l => l.id === id) || null;
      if (act === "open-profile") {
        if (typeof window.openLeadDetailModal === "function") {
          window.openLeadDetailModal(id, lead);
        }
      } else if (act === "send-email") {
        _showLeadsToast("Single-email sending lands in Phase 2.", "info");
      } else if (act === "edit") {
        _showLeadsToast("Inline editing lands in Phase 2.", "info");
      }
    });
  });
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
    renderSelectAllAcrossLink();
    updateBulkBar();
    if (showMoreEl) showMoreEl.hidden = true;
    return;
  }

  if (emptyEl) emptyEl.hidden = true;
  renderTableHead();
  renderTableBody();
  updateCountRow();
  renderSelectAllAcrossLink();
  updateBulkBar();

  if (showMoreEl) {
    showMoreEl.hidden = false;
    const shownEl = document.getElementById("leadsShown");
    const totalEl = document.getElementById("leadsTotal");
    if (shownEl) shownEl.textContent = _filteredLeads.length;
    if (totalEl) totalEl.textContent = _allLeads.length;
  }
}

function renderSelectAllAcrossLink() {
  const wrap = document.getElementById("leadsTableWrap");
  if (!wrap) return;
  let link = document.getElementById("leadsSelectAllAcross");
  const visibleIds = _filteredLeads.map(l => l.id);
  const visibleSelected = visibleIds.filter(id => _selectedIds.has(id)).length;
  const indeterminate = visibleSelected > 0 && visibleSelected < visibleIds.length;

  if (!indeterminate) {
    if (link && link.parentNode) link.parentNode.removeChild(link);
    return;
  }
  if (!link) {
    link = document.createElement("div");
    link.id = "leadsSelectAllAcross";
    link.style.cssText = "padding:8px 12px;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;margin-top:8px;font-size:13px;color:#374151;display:flex;align-items:center;gap:8px;";
    wrap.appendChild(link);
  }
  link.innerHTML = `<span>${visibleSelected} selected on this view.</span>
    <button type="button" id="leadsSelectAllAcrossBtn" style="background:none;border:none;color:#1d4ed8;font-weight:600;cursor:pointer;padding:0;font-size:13px;">
      Select all ${_filteredLeads.length} leads
    </button>`;
  const btn = link.querySelector("#leadsSelectAllAcrossBtn");
  if (btn) btn.addEventListener("click", () => {
    _filteredLeads.forEach(l => _selectedIds.add(l.id));
    renderTableHead();
    renderTableBody();
    renderSelectAllAcrossLink();
    updateBulkBar();
  });
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
  if (!bar) return;
  if (_selectedIds.size === 0) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  // Re-render bar contents so we control layout & button labels for Phase 1.
  bar.style.cssText = "position:sticky;top:0;z-index:20;display:flex;flex-direction:column;gap:10px;background:#0a0a0a;color:#fff;padding:12px 16px;border-radius:10px;margin:8px 0;box-shadow:0 6px 20px rgba(0,0,0,0.18);";
  bar.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
      <span class="leads-bulk-count" id="leadsBulkCount" style="font-size:14px;font-weight:600;">${_selectedIds.size} lead${_selectedIds.size !== 1 ? "s" : ""} selected</span>
      <button type="button" id="leadsBulkClearAll" style="background:none;border:none;color:#cbd5e1;font-size:13px;cursor:pointer;text-decoration:underline;padding:0;">Clear</button>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button type="button" class="leads-bulk-btn" data-bulk-act="email" style="padding:8px 14px;border-radius:8px;border:1px solid #fff;background:#fff;color:#0a0a0a;font-size:13px;font-weight:600;cursor:pointer;">✉️ Send email</button>
      <button type="button" class="leads-bulk-btn" data-bulk-act="schedule" style="padding:8px 14px;border-radius:8px;border:1px solid #475569;background:transparent;color:#fff;font-size:13px;font-weight:500;cursor:pointer;">📅 Schedule for later</button>
      <button type="button" class="leads-bulk-btn" data-bulk-act="stage" disabled title="Coming soon" style="padding:8px 14px;border-radius:8px;border:1px solid #475569;background:transparent;color:#94a3b8;font-size:13px;font-weight:500;cursor:not-allowed;">🏷️ Change stage</button>
    </div>
  `;
  const clearBtn = bar.querySelector("#leadsBulkClearAll");
  if (clearBtn) clearBtn.addEventListener("click", () => {
    _selectedIds.clear();
    renderTableHead();
    renderTableBody();
    renderSelectAllAcrossLink();
    updateBulkBar();
  });
  bar.querySelectorAll("[data-bulk-act]").forEach(btn => {
    btn.addEventListener("click", () => _handleBulkAction(btn.dataset.bulkAct));
  });
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

  // Advanced "More: N filters" chip — click chip to edit, ✕ to clear all
  const advCount = (_filters.advanced || []).length;
  const advChipHtml = advCount
    ? `<span class="leads-active-chip" data-adv-chip="1" style="cursor:pointer;">
         <span data-adv-edit="1">More: ${advCount} filter${advCount !== 1 ? "s" : ""}</span>
         <button type="button" data-adv-clear="1" aria-label="Clear advanced filters">×</button>
       </span>`
    : "";

  if (!chips.length && !advCount) {
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
  `).join("") + advChipHtml + `<button type="button" class="leads-active-clear-all" id="leadsActiveClearAll">Clear all</button>`;

  wrap.querySelectorAll("[data-remove-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      const k = btn.dataset.removeFilter;
      if (k.startsWith("more_")) _moreFilters[k.slice(5)] = false;
      else _filters[k] = null;
      _refreshFiltersAndRender();
    });
  });
  const advChip = wrap.querySelector('[data-adv-chip="1"]');
  if (advChip) {
    advChip.addEventListener("click", (e) => {
      if (e.target.closest("[data-adv-clear]")) return;
      openMoreFiltersModal();
    });
    const clearAdv = wrap.querySelector('[data-adv-clear="1"]');
    if (clearAdv) clearAdv.addEventListener("click", (e) => {
      e.stopPropagation();
      _filters.advanced = [];
      _refreshFiltersAndRender();
    });
  }
  const clearAllBtn = wrap.querySelector("#leadsActiveClearAll");
  if (clearAllBtn) clearAllBtn.addEventListener("click", clearAllFilters);
}

function clearAllFilters() {
  _filters.source = null;
  _filters.stage = null;
  _filters.when = null;
  _filters.search = "";
  _filters.advanced = [];
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
      // Phase 1: pill is now "+ More filters" — modal-driven advanced conditions
      pill.textContent = "+ More filters";
      const advCount = (_filters.advanced || []).length;
      pill.classList.toggle("is-active", advCount > 0);
    }
  });
}

function _refreshFiltersAndRender() {
  applyFilters();
  renderActiveView();
  updateFilterPills();
  renderActiveFilterChips();
}

// ─── View switching ──────────────────────────────────────────────────────────

function _setView(v) {
  if (!["table","funnel","board"].includes(v)) v = "table";
  _view = v;
  document.querySelectorAll("[data-leads-view]").forEach(btn => {
    btn.classList.toggle("is-active", btn.dataset.leadsView === v);
  });
  document.querySelectorAll("[data-leads-view-pane]").forEach(p => {
    p.hidden = p.dataset.leadsViewPane !== v;
  });
  renderActiveView();
}

function renderActiveView() {
  if (_view === "table") renderTable();
  else if (_view === "funnel") renderFunnel();
  else if (_view === "board") renderBoard();
}

// ─── Funnel view ─────────────────────────────────────────────────────────────

function renderFunnel() {
  const row = document.getElementById("leadsFunnelRow");
  if (!row) return;
  const counts = {};
  for (const s of FUNNEL_ORDER) counts[s] = 0;
  for (const l of _filteredLeads) {
    const s = l.stage || "new";
    if (counts[s] != null) counts[s]++;
  }
  row.innerHTML = FUNNEL_ORDER.map((s, idx) => {
    const isLost = s === "lost";
    const arrow = (idx > 0 && !isLost) ? `<div class="pl-stage-arrow">›</div>` : "";
    return `${arrow}<div class="pl-stage-card" data-stage="${s}" data-terminal="${isLost ? "true" : "false"}">
      <span class="pl-stage-name">${escapeHtml(STAGE_LABELS[s])}</span>
      <span class="pl-stage-count">${counts[s] || 0}</span>
    </div>`;
  }).join("");
  row.querySelectorAll("[data-stage]").forEach(el => {
    el.addEventListener("click", () => {
      _filters.stage = el.dataset.stage;
      _setView("board");
      _refreshFiltersAndRender();
    });
  });
}

// ─── Board view ──────────────────────────────────────────────────────────────

let _boardBuilt = false;

function renderBoard() {
  const board = document.getElementById("leadsBoard");
  if (!board) return;
  if (!_boardBuilt) {
    board.innerHTML = BOARD_STAGES.map(s =>
      `<div class="pl-col" data-stage="${s}">
        <div class="pl-col-head">
          <span>${escapeHtml(STAGE_LABELS[s])}</span>
          <span class="pl-col-count" data-col-count="${s}">0</span>
        </div>
        <div class="pl-col-body" data-drop-stage="${s}"></div>
      </div>`).join("");
    _wireBoardDropTargets(board);
    _boardBuilt = true;
  }
  const buckets = {};
  for (const s of BOARD_STAGES) buckets[s] = [];
  for (const l of _filteredLeads) {
    const s = l.stage || "new";
    if (buckets[s]) buckets[s].push(l);
  }
  for (const s of BOARD_STAGES) {
    _paintBoardColumn(board, s, buckets[s]);
    const c = board.querySelector(`[data-col-count="${s}"]`);
    if (c) c.textContent = buckets[s].length;
  }
}

function _paintBoardColumn(board, stage, rows) {
  const body = board.querySelector(`[data-drop-stage="${stage}"]`);
  if (!body) return;
  if (!rows || !rows.length) {
    body.innerHTML = `<div class="pl-col-empty">Drop a card here.</div>`;
    return;
  }
  body.innerHTML = rows.map(_renderBoardCardHtml).join("");
  _wireBoardCardEventsIn(body);
}

function _renderBoardCardHtml(l) {
  const name = fullName(l);
  const initStr = initials(name);
  const color = avatarColor(name);
  const sub = [
    SOURCE_LABELS[l.source] || (l.source || "").replace(/_/g, " "),
    l.last_activity_at ? relativeTime(l.last_activity_at) : (l.created_at ? relativeTime(l.created_at) : ""),
  ].filter(Boolean).join(" · ");
  const reach = `
    <span class="leads-reach-cell" style="margin-top:6px;display:inline-flex;gap:6px;font-size:11px;color:#6b7280;">
      ${l.email ? `<span title="${escapeHtml(l.email)}">✉️</span>` : ""}
      ${l.phone ? `<span title="${escapeHtml(l.phone)}">📞</span>` : ""}
    </span>`;
  return `<div class="pl-card" draggable="true" data-lead-id="${escapeHtml(l.id)}" style="--card-color:${color};">
    <div class="pl-card-head">
      <span class="pl-card-name" style="display:flex;align-items:center;gap:6px;">
        <span class="leads-avatar" style="background:${color};width:22px;height:22px;font-size:10px;">${escapeHtml(initStr)}</span>
        ${escapeHtml(name)}
      </span>
    </div>
    ${sub ? `<div class="pl-card-sub">${escapeHtml(sub)}</div>` : ""}
    ${reach}
  </div>`;
}

function _wireBoardDropTargets(board) {
  board.querySelectorAll(".pl-col").forEach(col => {
    const stage = col.dataset.stage;
    col.addEventListener("dragover", (e) => {
      if (!_dragLeadId) return;
      e.preventDefault();
      col.classList.add("is-drop-target");
    });
    col.addEventListener("dragleave", (e) => {
      if (!col.contains(e.relatedTarget)) col.classList.remove("is-drop-target");
    });
    col.addEventListener("drop", (e) => {
      e.preventDefault();
      col.classList.remove("is-drop-target");
      if (!_dragLeadId) return;
      _moveLeadStage(_dragLeadId, stage);
    });
  });
}

function _wireBoardCardEventsIn(scope) {
  scope.querySelectorAll(".pl-card").forEach(card => {
    card.addEventListener("dragstart", (e) => {
      _dragLeadId = card.dataset.leadId;
      card.classList.add("is-dragging");
      try {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", _dragLeadId);
      } catch (_) {}
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("is-dragging");
      _dragLeadId = "";
      document.querySelectorAll(".is-drop-target").forEach(c => c.classList.remove("is-drop-target"));
    });
    card.addEventListener("click", (e) => {
      const id = card.dataset.leadId;
      const lead = _allLeads.find(l => l.id === id) || null;
      if (typeof window.openLeadDetailModal === "function") {
        window.openLeadDetailModal(id, lead);
      }
    });
  });
}

async function _moveLeadStage(leadId, newStage) {
  const lead = _allLeads.find(l => l.id === leadId);
  if (!lead || lead.stage === newStage) return;
  const prev = lead.stage;
  lead.stage = newStage;
  applyFilters();
  renderBoard();
  try {
    const res = await fetch(`/me/leads/${encodeURIComponent(leadId)}/stage`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: newStage }),
    });
    if (!res.ok) {
      lead.stage = prev;
      applyFilters();
      renderBoard();
      _showLeadsToast("Couldn't move — try again.", "error");
    } else {
      _showLeadsToast(`Moved to ${STAGE_LABELS[newStage]}.`, "success");
    }
  } catch (_) {
    lead.stage = prev;
    applyFilters();
    renderBoard();
    _showLeadsToast("Network error.", "error");
  }
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
  // Phase 1: anchor unused — modal opens centered. Kept for call-site compat.
  openMoreFiltersModal();
}

// ─── "+ More filters" modal ──────────────────────────────────────────────────

const SAVED_VIEWS = [
  {
    id: "quoted-followup",
    label: "Quoted leads needing follow-up",
    conditions: [
      { field: "stage",          op: "is",                       value: "quoted" },
      { field: "last_contacted", op: "is more than X days ago",  value: 3 },
    ],
  },
  {
    id: "scheduled-week",
    label: "Scheduled this week",
    conditions: [
      { field: "stage",            op: "is",                value: "scheduled" },
      { field: "appointment_time", op: "is between X and Y",value: { fromOffset: 0, toOffset: 7 } },
    ],
  },
  {
    id: "won-last-month",
    label: "Won jobs from last month",
    conditions: [
      { field: "stage",    op: "is",                 value: "won" },
      { field: "job_date", op: "is between X and Y", value: { fromOffset: -30, toOffset: 0 } },
    ],
  },
  {
    id: "cold-leads",
    label: "Cold leads (90+ days)",
    conditions: [
      { field: "last_activity", op: "is more than X days ago", value: 90 },
      { field: "stage",         op: "is not",                  value: "won" },
      { field: "stage",         op: "is not",                  value: "lost" },
    ],
  },
];

let _moreModalDraft = null;  // working copy while modal is open

function _ensureMoreFiltersModal() {
  let dlg = document.getElementById("leadsMoreFiltersDlg");
  if (dlg) return dlg;
  dlg = document.createElement("dialog");
  dlg.id = "leadsMoreFiltersDlg";
  dlg.style.cssText = "padding:0;border:none;border-radius:14px;max-width:680px;width:92vw;box-shadow:0 30px 80px rgba(0,0,0,0.25);";
  dlg.innerHTML = `
    <style>
      #leadsMoreFiltersDlg::backdrop { background: rgba(15,23,42,0.45); }
      #leadsMoreFiltersDlg .lmf-wrap { display:flex;flex-direction:column;max-height:88vh; }
      #leadsMoreFiltersDlg .lmf-head { display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid #e5e7eb; }
      #leadsMoreFiltersDlg .lmf-head h2 { margin:0;font-size:17px;font-weight:700;color:#0a0a0a; }
      #leadsMoreFiltersDlg .lmf-close { background:none;border:none;font-size:22px;cursor:pointer;color:#6b7280;line-height:1;padding:0 4px; }
      #leadsMoreFiltersDlg .lmf-body { padding:18px 22px;overflow:auto;flex:1; }
      #leadsMoreFiltersDlg .lmf-section-h { font-size:13px;font-weight:600;color:#374151;margin:0 0 10px;text-transform:none;letter-spacing:0; }
      #leadsMoreFiltersDlg .lmf-cond-row { display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap; }
      #leadsMoreFiltersDlg .lmf-cond-row select,
      #leadsMoreFiltersDlg .lmf-cond-row input { padding:7px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;background:#fff;color:#0a0a0a; }
      #leadsMoreFiltersDlg .lmf-cond-row select { min-width:140px; }
      #leadsMoreFiltersDlg .lmf-cond-row input[type="text"] { min-width:160px; }
      #leadsMoreFiltersDlg .lmf-cond-row input[type="number"] { width:90px; }
      #leadsMoreFiltersDlg .lmf-cond-row .lmf-rm { background:none;border:none;color:#9ca3af;font-size:18px;cursor:pointer;padding:2px 6px;border-radius:6px; }
      #leadsMoreFiltersDlg .lmf-cond-row .lmf-rm:hover { color:#dc2626;background:#fee2e2; }
      #leadsMoreFiltersDlg .lmf-add { margin-top:6px;padding:7px 12px;border:1px dashed #94a3b8;background:transparent;border-radius:8px;color:#374151;font-size:13px;font-weight:500;cursor:pointer; }
      #leadsMoreFiltersDlg .lmf-add[disabled] { opacity:0.4;cursor:not-allowed; }
      #leadsMoreFiltersDlg .lmf-saved { display:flex;flex-direction:column;gap:6px;margin-top:18px;padding-top:18px;border-top:1px solid #e5e7eb; }
      #leadsMoreFiltersDlg .lmf-saved button { text-align:left;padding:10px 12px;border:1px solid #e5e7eb;background:#fff;border-radius:8px;cursor:pointer;font-size:13px;color:#0a0a0a; }
      #leadsMoreFiltersDlg .lmf-saved button:hover { background:#f9fafb;border-color:#94a3b8; }
      #leadsMoreFiltersDlg .lmf-foot { display:flex;justify-content:space-between;gap:8px;padding:14px 22px;border-top:1px solid #e5e7eb;background:#fafafa;border-radius:0 0 14px 14px; }
      #leadsMoreFiltersDlg .lmf-btn-primary { padding:9px 16px;background:#0a0a0a;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer; }
      #leadsMoreFiltersDlg .lmf-btn-secondary { padding:9px 16px;background:#fff;color:#0a0a0a;border:1px solid #d1d5db;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer; }
    </style>
    <form method="dialog" class="lmf-wrap">
      <div class="lmf-head">
        <h2>More filters</h2>
        <button type="button" class="lmf-close" id="leadsMoreFiltersClose" aria-label="Close">×</button>
      </div>
      <div class="lmf-body">
        <h3 class="lmf-section-h">Show me leads that match ALL of these:</h3>
        <div id="leadsMoreFiltersConds"></div>
        <button type="button" class="lmf-add" id="leadsMoreFiltersAdd">+ Add a filter</button>
        <div class="lmf-saved">
          <h3 class="lmf-section-h">Or pick a saved view:</h3>
          <div id="leadsMoreFiltersSaved"></div>
        </div>
      </div>
      <div class="lmf-foot">
        <button type="button" class="lmf-btn-secondary" id="leadsMoreFiltersClear">Clear</button>
        <button type="button" class="lmf-btn-primary" id="leadsMoreFiltersApply">Apply filters →</button>
      </div>
    </form>
  `;
  document.body.appendChild(dlg);

  dlg.querySelector("#leadsMoreFiltersClose").addEventListener("click", () => _closeDlg(dlg));
  dlg.querySelector("#leadsMoreFiltersAdd").addEventListener("click", () => {
    if (_moreModalDraft.length >= 5) return;
    _moreModalDraft.push({ field: "stage", op: "is", value: "new" });
    _renderMoreFiltersConds();
  });
  dlg.querySelector("#leadsMoreFiltersClear").addEventListener("click", () => {
    _moreModalDraft = [];
    _renderMoreFiltersConds();
  });
  dlg.querySelector("#leadsMoreFiltersApply").addEventListener("click", () => {
    _filters.advanced = _moreModalDraft.filter(c => c && c.field && c.op);
    _closeDlg(dlg);
    _refreshFiltersAndRender();
  });
  return dlg;
}

function _defaultValueFor(field, op) {
  const f = ADV_FIELDS[field];
  if (!f) return "";
  if (f.type === "stage") {
    if (op === "is one of") return ["new"];
    return "new";
  }
  if (f.type === "text")   return "";
  if (f.type === "number") return 0;
  if (f.type === "date") {
    if (op === "is more than X days ago" || op === "is less than X days ago") return 7;
    if (op === "is between X and Y") {
      const today = new Date(); today.setHours(0,0,0,0);
      const iso = today.toISOString().slice(0,10);
      return { from: iso, to: iso };
    }
    return null;
  }
  return "";
}

function _renderCondValueControl(idx, c) {
  const f = ADV_FIELDS[c.field];
  if (!f) return "";
  if (f.type === "stage") {
    if (c.op === "is one of") {
      const sel = Array.isArray(c.value) ? c.value : [];
      return `<select class="lmf-val" data-idx="${idx}" multiple style="min-width:160px;height:auto;">
        ${STAGE_ORDER.map(s => `<option value="${s}" ${sel.includes(s) ? "selected" : ""}>${escapeHtml(STAGE_LABELS[s])}</option>`).join("")}
      </select>`;
    }
    return `<select class="lmf-val" data-idx="${idx}">
      ${STAGE_ORDER.map(s => `<option value="${s}" ${c.value === s ? "selected" : ""}>${escapeHtml(STAGE_LABELS[s])}</option>`).join("")}
    </select>`;
  }
  if (f.type === "text") {
    return `<input class="lmf-val" data-idx="${idx}" type="text" value="${escapeHtml(c.value || "")}" placeholder="value">`;
  }
  if (f.type === "number") {
    return `<input class="lmf-val" data-idx="${idx}" type="number" value="${escapeHtml(String(c.value ?? 0))}">`;
  }
  if (f.type === "date") {
    if (c.op === "is between X and Y") {
      const v = c.value || {};
      // If saved view used offsets, render as derived ISO dates for display.
      let fromStr = v.from || "", toStr = v.to || "";
      if (typeof v.fromOffset === "number") {
        const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + v.fromOffset);
        fromStr = d.toISOString().slice(0,10);
      }
      if (typeof v.toOffset === "number") {
        const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + v.toOffset);
        toStr = d.toISOString().slice(0,10);
      }
      return `<input class="lmf-val lmf-val-from" data-idx="${idx}" type="date" value="${escapeHtml(fromStr)}">
              <span style="font-size:12px;color:#6b7280;">and</span>
              <input class="lmf-val lmf-val-to" data-idx="${idx}" type="date" value="${escapeHtml(toStr)}">`;
    }
    if (c.op === "was today" || c.op === "was yesterday") {
      return "";  // no value control
    }
    // X-days operators
    return `<input class="lmf-val" data-idx="${idx}" type="number" min="0" value="${escapeHtml(String(c.value ?? 7))}" style="width:80px;">
            <span style="font-size:12px;color:#6b7280;">days</span>`;
  }
  return "";
}

function _renderMoreFiltersConds() {
  const dlg = document.getElementById("leadsMoreFiltersDlg");
  if (!dlg) return;
  const root = dlg.querySelector("#leadsMoreFiltersConds");
  if (!_moreModalDraft.length) {
    root.innerHTML = `<div style="color:#9ca3af;font-size:13px;padding:8px 0;">No filters yet. Add one or pick a saved view below.</div>`;
  } else {
    root.innerHTML = _moreModalDraft.map((c, idx) => {
      const f = ADV_FIELDS[c.field];
      const ops = f ? ADV_OPS_BY_TYPE[f.type] : [];
      const fieldOpts = Object.entries(ADV_FIELDS).map(([k, v]) =>
        `<option value="${k}" ${k === c.field ? "selected" : ""}>${escapeHtml(v.label)}</option>`
      ).join("");
      const opOpts = ops.map(o =>
        `<option value="${escapeHtml(o)}" ${o === c.op ? "selected" : ""}>${escapeHtml(o)}</option>`
      ).join("");
      return `<div class="lmf-cond-row" data-idx="${idx}">
        <select class="lmf-field" data-idx="${idx}">${fieldOpts}</select>
        <select class="lmf-op" data-idx="${idx}">${opOpts}</select>
        ${_renderCondValueControl(idx, c)}
        <button type="button" class="lmf-rm" data-idx="${idx}" aria-label="Remove">×</button>
      </div>`;
    }).join("");
  }

  const addBtn = dlg.querySelector("#leadsMoreFiltersAdd");
  if (addBtn) addBtn.disabled = _moreModalDraft.length >= 5;

  // Wire control changes
  root.querySelectorAll(".lmf-field").forEach(sel => {
    sel.addEventListener("change", () => {
      const i = Number(sel.dataset.idx);
      const c = _moreModalDraft[i];
      const newField = sel.value;
      const newType = ADV_FIELDS[newField].type;
      // Reset op + value to first valid op for the new type
      c.field = newField;
      c.op    = ADV_OPS_BY_TYPE[newType][0];
      c.value = _defaultValueFor(newField, c.op);
      _renderMoreFiltersConds();
    });
  });
  root.querySelectorAll(".lmf-op").forEach(sel => {
    sel.addEventListener("change", () => {
      const i = Number(sel.dataset.idx);
      const c = _moreModalDraft[i];
      c.op = sel.value;
      c.value = _defaultValueFor(c.field, c.op);
      _renderMoreFiltersConds();
    });
  });
  root.querySelectorAll(".lmf-val").forEach(inp => {
    inp.addEventListener("change", () => {
      const i = Number(inp.dataset.idx);
      const c = _moreModalDraft[i];
      const f = ADV_FIELDS[c.field];
      if (!f) return;
      if (f.type === "stage" && c.op === "is one of") {
        c.value = Array.from(inp.selectedOptions).map(o => o.value);
      } else if (f.type === "date" && c.op === "is between X and Y") {
        // Read both date inputs in this row
        const row = inp.closest(".lmf-cond-row");
        const from = row.querySelector(".lmf-val-from").value;
        const to   = row.querySelector(".lmf-val-to").value;
        c.value = { from, to };
      } else if (f.type === "number" || (f.type === "date" && (c.op === "is more than X days ago" || c.op === "is less than X days ago"))) {
        c.value = Number(inp.value);
      } else {
        c.value = inp.value;
      }
    });
  });
  root.querySelectorAll(".lmf-rm").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.idx);
      _moreModalDraft.splice(i, 1);
      _renderMoreFiltersConds();
    });
  });
}

function _renderMoreFiltersSaved() {
  const dlg = document.getElementById("leadsMoreFiltersDlg");
  if (!dlg) return;
  const root = dlg.querySelector("#leadsMoreFiltersSaved");
  root.innerHTML = SAVED_VIEWS.map(v =>
    `<button type="button" data-saved-id="${escapeHtml(v.id)}">${escapeHtml(v.label)}</button>`
  ).join("");
  root.querySelectorAll("[data-saved-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const view = SAVED_VIEWS.find(v => v.id === btn.dataset.savedId);
      if (!view) return;
      // Deep clone the conditions so the modal can edit without mutating SAVED_VIEWS
      _moreModalDraft = view.conditions.map(c => ({
        field: c.field,
        op:    c.op,
        value: (c.value && typeof c.value === "object" && !Array.isArray(c.value))
                 ? { ...c.value }
                 : (Array.isArray(c.value) ? [...c.value] : c.value),
      }));
      // Apply immediately, close the modal
      _filters.advanced = _moreModalDraft.slice();
      _closeDlg(dlg);
      _refreshFiltersAndRender();
    });
  });
}

function openMoreFiltersModal() {
  const dlg = _ensureMoreFiltersModal();
  // Seed working draft from currently-applied advanced filters (deep clone)
  _moreModalDraft = (_filters.advanced || []).map(c => ({
    field: c.field,
    op:    c.op,
    value: (c.value && typeof c.value === "object" && !Array.isArray(c.value))
             ? { ...c.value }
             : (Array.isArray(c.value) ? [...c.value] : c.value),
  }));
  _renderMoreFiltersConds();
  _renderMoreFiltersSaved();
  _openDlg(dlg);
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

  // View switcher (Funnel / Board / Table)
  document.querySelectorAll("[data-leads-view]").forEach(btn => {
    btn.addEventListener("click", () => _setView(btn.dataset.leadsView));
  });

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

  // Phase 1: select-mode is always on (per-row checkboxes always visible).
  // Hide the legacy "Select" toggle so it doesn't confuse the new flow.
  const selectModeChk = document.getElementById("leadsSelectMode");
  if (selectModeChk) {
    const lbl = selectModeChk.closest("label");
    if (lbl) lbl.style.display = "none";
    selectModeChk.checked = true;
  }

  // The legacy "Cancel" button inside the bulk bar — bulk bar is re-rendered
  // by updateBulkBar() with its own Clear button, so the original is replaced.
  // We also wire bulk-act buttons via updateBulkBar(); no static wiring needed.
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
    openBulkEmailComposer();
    return;
  }

  if (act === "schedule") {
    sessionStorage.setItem("leadsSelectedIds", JSON.stringify(ids));
    openBulkEmailComposer({ openSchedulePicker: true });
    return;
  }

  if (act === "stage") {
    // Out of Phase 1 scope — kept disabled in the new bulk bar.
    _openBulkStageDropdown(ids);
    return;
  }

  if (act === "campaign" || act === "more") {
    _showLeadsToast("Coming soon.", "info");
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
      // _selectModeOn stays true in Phase 1 (checkboxes always visible).
      updateBulkBar();
      applyFilters();
      renderTable();
      _showLeadsToast(`Updated ${ok} lead${ok !== 1 ? "s" : ""} to ${STAGE_LABELS[stage]}.`, "success");
    });
  });
  _positionMenu(menu, stageBtn);
}

// ─── Main load ───────────────────────────────────────────────────────────────

const LEADS_CACHE_KEY = "dashboard.leads_unified";

async function loadUnifiedLeads() {
  const loadingEl = document.getElementById("leadsLoading");
  const emptyEl   = document.getElementById("leadsEmpty");
  const tbody     = document.getElementById("leadsTableBody");
  if (!tbody) return;

  // Cache-first paint
  const cached = (() => {
    try { return JSON.parse(localStorage.getItem(LEADS_CACHE_KEY) || "null"); }
    catch (_) { return null; }
  })();
  if (cached && Array.isArray(cached.leads)) {
    _allLeads = cached.leads;
    applyFilters();
    renderActiveView();
  } else {
    if (loadingEl) loadingEl.hidden = false;
    if (emptyEl)   emptyEl.hidden   = true;
  }

  // Background refresh
  try {
    const res = await fetch("/me/leads", { credentials: "same-origin" });
    if (res.ok) {
      const body = await res.json();
      _allLeads = body.leads || [];
      try {
        localStorage.setItem(LEADS_CACHE_KEY,
          JSON.stringify({ leads: _allLeads, ts: Date.now() }));
      } catch (_) {}
      applyFilters();
      renderActiveView();
    } else if (!cached) {
      _allLeads = [];
      applyFilters();
      renderActiveView();
    }
  } catch (_) {
    if (!cached) {
      if (loadingEl) loadingEl.hidden = true;
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.innerHTML = `<div class="leads-empty-text">Couldn't load leads — check your connection and try again.</div>`;
      }
    }
  }

  updateFilterPills();
  renderActiveFilterChips();
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

// ─── Bulk-email composer (Phase 2) ───────────────────────────────────────────
//
// Two-state slide-in panel. State A is the template grid; State B is the
// editor (subject + body + chips + preview). On Send Now we POST
// /me/leads/bulk-email and poll /me/leads/bulk-email/<batch_id> every 2s for
// progress. Schedule for later stays disabled here — Phase 3.

const _BE_DEFAULT_FALLBACKS = {
  first_name: "there",
  name: "there",
  service_type: "your service",
  quote_amount: "the quote",
  quote_date: "recently",
  appointment_date: "your scheduled time",
  job_date: "the work date",
  recommended_slot: "your scheduled time",
  recommended_slot_iso: "",
};

const _BE_TOKEN_RE = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

const _BE_VAR_CHIPS = [
  { token: "first_name",       label: "First name" },
  { token: "service_type",     label: "Service" },
  { token: "quote_amount",     label: "Quote amount" },
  { token: "quote_date",       label: "Quote date" },
  { token: "appointment_date", label: "Appointment" },
  { token: "recommended_slot", label: "Recommended slot" },
  { token: "your_name",        label: "Your name" },
  { token: "business_name",    label: "Business name" },
  { token: "phone",            label: "Phone" },
];

// Phase 4: window picker options for the find-times panel. Keys must match
// server/lead_bulk_email.py:_window_to_offsets.
const _BE_SLOT_WINDOWS = [
  { value: "tomorrow",    label: "Tomorrow only" },
  { value: "in_3_days",   label: "Within 3 days" },
  { value: "in_1_week",   label: "Within 1 week" },
  { value: "in_2_weeks",  label: "Within 2 weeks" },
  { value: "in_1_month",  label: "Within 1 month" },
];
const _BE_SLOT_DURATIONS = [
  { value: 30, label: "30 min" },
  { value: 60, label: "60 min" },
  { value: 90, label: "90 min" },
];

let _beState = {
  open: false,
  view: "grid",          // "grid" | "editor" | "sending" | "done" | "no-connection"
  templates: [],
  templateLoaded: null,
  subject: "",
  body: "",
  recipients: [],        // array of lead objects (snapshot at open time)
  senderProfile: null,
  connections: [],
  fromConnectionId: "",
  previewLeadId: "",
  fallbacks: { ...{}, ..._BE_DEFAULT_FALLBACKS },
  fallbackOverrides: {}, // user-supplied per-token replacements
  skipMissing: false,    // if true, skip leads with any missing token
  lastFocused: "body",
  batchId: "",
  pollTimer: null,
  lastBatch: null,
  // Phase 3:
  editingScheduledId: "",   // when set, "Schedule it" hits /update instead of POST
  scheduledForEpoch: 0,     // current intended schedule time (for editing flow)
  openSchedulePickerOnLoad: false,
  // Phase 4 — calendar slot recommendations:
  slotWindow: "in_1_week",       // dropdown value
  slotMinutes: 30,                // dropdown value
  slotsLoading: false,            // spinner state for the Find times button
  slotsError: "",                 // user-visible message ("", or reason key)
  slotsDiagnostics: null,         // { calendar_id, working_hours_keys, ... } from server when slots fail
  slotAssignments: {},            // { lead_id: { start_iso, end_iso, label, epoch } }
  slotTimeZone: "",               // working-hours tz from /find-slots response
  // Phase 5 — embedded mini-calendar (drag-drop) inside the slot panel:
  slotBusy: [],                   // [{start, end}] busy blocks the helper saw
  slotSearchStart: "",            // ISO string — first day shown by the mini-cal
  slotSearchEnd: "",              // ISO string — last day shown by the mini-cal
  slotCalDayOffset: 0,            // how many days forward from slotSearchStart the user has paginated
  slotCalDayCount: 7,             // full week visible at once
  hiddenByFilter: 0,              // # of selected leads excluded by current filter (visible+selected scope)
};

function _beFmtCurrency(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!isFinite(n)) return null;
  return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function _beCoerceDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    let v = value;
    if (v > 1e12) v = v / 1000;
    const dt = new Date(v * 1000);
    return isNaN(dt.getTime()) ? null : dt;
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) return _beCoerceDate(Number(s));
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

const _BE_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function _beFmtDate(value) {
  const dt = _beCoerceDate(value);
  if (!dt) return null;
  return `${_BE_MONTHS[dt.getMonth()]} ${dt.getDate()}`;
}
function _beFmtDateTime(value) {
  const dt = _beCoerceDate(value);
  if (!dt) return null;
  let h = dt.getHours();
  const m = String(dt.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${_BE_MONTHS[dt.getMonth()]} ${dt.getDate()}, ${h}:${m} ${ampm}`;
}

function _beResolveLeadValue(token, lead) {
  if (!lead) return null;
  if (token === "first_name") {
    const fn = (lead.first_name || "").trim();
    if (fn) return fn;
    const nm = (lead.name || "").trim();
    if (nm) return nm.split(/\s+/)[0];
    return null;
  }
  if (token === "name") {
    const nm = (lead.name || "").trim();
    if (nm) return nm;
    const both = [(lead.first_name || "").trim(), (lead.last_name || "").trim()]
      .filter(Boolean).join(" ");
    return both || null;
  }
  if (token === "service_type") return (lead.service_type || "").trim() || null;
  if (token === "quote_amount") return _beFmtCurrency(lead.quote_amount);
  if (token === "quote_date") return _beFmtDate(lead.quote_sent_at || lead.quote_date);
  if (token === "appointment_date")
    return _beFmtDateTime(lead.appointment_time || lead.appointment_date);
  if (token === "job_date") return _beFmtDate(lead.job_complete_date || lead.job_date);
  if (token === "email") return (lead.email || "").trim() || null;
  if (token === "phone") return (lead.phone || "").trim() || null;
  return null;
}

function _beResolveProfileValue(token, profile) {
  if (!profile) return null;
  if (token === "your_name")        return (profile.your_name || "").trim() || null;
  if (token === "business_name")    return (profile.business_name || "").trim() || null;
  if (token === "phone")            return (profile.business_phone || "").trim() || null;
  if (token === "business_address") return (profile.business_address || "").trim() || null;
  return null;
}

const _BE_LEAD_TOKEN_FIELDS = new Set([
  "first_name","name","service_type","quote_amount","quote_date",
  "appointment_date","job_date","email","phone",
  // Phase 4: orchestrator-injected, but we list them here so the chip-row
  // and substituteClientSide branches treat them as known tokens.
  "recommended_slot","recommended_slot_iso",
]);
const _BE_PROFILE_TOKEN_FIELDS = new Set([
  "your_name","business_name","phone","business_address",
]);

function substituteClientSide(template, lead, profile, fallbacks) {
  if (!template) return template || "";
  const fb = { ..._BE_DEFAULT_FALLBACKS, ...(fallbacks || {}) };
  return template.replace(_BE_TOKEN_RE, (full, token) => {
    // Phase 4: orchestrator-injected calendar slot tokens. The mirror in
    // the composer reads from _beState.slotAssignments using the lead.id.
    if (token === "recommended_slot") {
      const a = (lead && _beState.slotAssignments) ? _beState.slotAssignments[lead.id] : null;
      if (a && a.label) return a.label;
      return fb.recommended_slot || "your scheduled time";
    }
    if (token === "recommended_slot_iso") {
      const a = (lead && _beState.slotAssignments) ? _beState.slotAssignments[lead.id] : null;
      if (a && a.start_iso) return a.start_iso;
      return "";
    }
    if (_BE_LEAD_TOKEN_FIELDS.has(token)) {
      const v = _beResolveLeadValue(token, lead);
      if (v) return v;
    }
    if (_BE_PROFILE_TOKEN_FIELDS.has(token)) {
      const v = _beResolveProfileValue(token, profile);
      if (v) return v;
    }
    if (fb[token]) return fb[token];
    return full; // leave intact
  });
}

function _beTokensIn(text) {
  if (!text) return [];
  const seen = new Set();
  const out = [];
  let m;
  _BE_TOKEN_RE.lastIndex = 0;
  while ((m = _BE_TOKEN_RE.exec(text)) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); out.push(m[1]); }
  }
  return out;
}

// Phase 4: tokens the bulk-send orchestrator injects per recipient. These
// are ALWAYS considered satisfied at validate-time — the user supplies them
// via the find-times panel, not the lead record.
const _BE_ORCHESTRATOR_INJECTED = new Set(["recommended_slot", "recommended_slot_iso"]);

function _beValidate() {
  const tokens = Array.from(new Set([..._beTokensIn(_beState.subject),
                                     ..._beTokensIn(_beState.body)]));
  const missingByLead = {};
  for (const lead of _beState.recipients) {
    const missing = [];
    for (const tok of tokens) {
      // Orchestrator-injected tokens (recommended_slot*) are always OK.
      if (_BE_ORCHESTRATOR_INJECTED.has(tok)) continue;
      // Lead-sourced tokens
      if (_BE_LEAD_TOKEN_FIELDS.has(tok)) {
        if (_beResolveLeadValue(tok, lead)) continue;
      }
      if (_BE_PROFILE_TOKEN_FIELDS.has(tok)) {
        if (_beResolveProfileValue(tok, _beState.senderProfile)) continue;
      }
      // If the token has a default fallback we treat it as covered.
      if (_BE_DEFAULT_FALLBACKS.hasOwnProperty(tok)) continue;
      missing.push(tok);
    }
    if (missing.length) missingByLead[lead.id] = missing;
  }
  return {
    tokens,
    missingByLead,
    missingCount: Object.keys(missingByLead).length,
  };
}

// Phase 4: returns true if the user wrote {recommended_slot} into either
// the subject or body. Used to gate the find-times panel and the Send
// button until slots have been allocated.
function _beUsesRecommendedSlot() {
  const txt = (_beState.subject || "") + "\n" + (_beState.body || "");
  return /\{recommended_slot(_iso)?\}/.test(txt);
}

function _beAllRecipientsHaveSlots() {
  if (!_beState.recipients.length) return false;
  for (const l of _beState.recipients) {
    const a = _beState.slotAssignments[l.id];
    if (!a || !a.label) return false;
  }
  return true;
}

async function _beFetchSenderProfile() {
  // /me returns first_name + last_name + business_name. business_phone /
  // business_address are not in the user record today — fall through to
  // empty strings (the unsubscribe footer skips empty pieces).
  try {
    const r = await fetch("/me", { credentials: "same-origin" });
    if (!r.ok) return null;
    const d = await r.json();
    const yn = [(d.first_name || "").trim(), (d.last_name || "").trim()]
                 .filter(Boolean).join(" ");
    return {
      your_name:         yn,
      business_name:     d.business_name || "",
      business_phone:    d.business_phone || "",
      business_address:  d.business_address || "",
    };
  } catch (_) { return null; }
}

// Inline copy of the 8 ship-with templates. Kept in sync with
// server/lead_bulk_email.py:TEMPLATES so the composer works even when the
// API endpoint is unreachable (deploy lag, network blip, server restart in
// progress). The server response — when it arrives — overrides this.
const _BE_INLINE_TEMPLATES = [
  { id: "quote_followup", name: "Quote follow-up", icon: "📧",
    description: "Nudge leads who haven't responded to a quote.",
    subject: "Quick follow-up on your quote, {first_name}",
    body: "Hi {first_name},\n\nWanted to follow up on the quote we sent on {quote_date} for {service_type}.\n\nAny questions I can answer? Happy to walk through anything that's unclear or adjust the scope.\n\n— {your_name}" },
  { id: "reschedule_reminder", name: "Reschedule reminder", icon: "⏰",
    description: "Propose a new appointment time per lead from your calendar.",
    subject: "Let's find a new time, {first_name}",
    body: "Hi {first_name},\n\nWe need to move your appointment. Based on my calendar, would {recommended_slot} work?\n\nReply YES to confirm or suggest a different time and I'll lock it in.\n\n— {your_name}\n{business_name}" },
  { id: "winback", name: "Win-back", icon: "🔁",
    description: "Re-engage a lead who's gone quiet.",
    subject: "Still interested, {first_name}?",
    body: "Hi {first_name},\n\nIt's been a while — wanted to check in and see if you're still thinking about this.\n\nIf the timing isn't right, just say so and I'll stop pinging. If it is, I'd love to pick up where we left off.\n\n— {your_name}" },
  { id: "review_request", name: "Review request", icon: "⭐",
    description: "Ask a happy customer for a review.",
    subject: "Quick favor, {first_name}?",
    body: "Hi {first_name},\n\nHope everything's going well after the work we did on {job_date}. If you have a minute, a short review would mean the world to us.\n\nThanks for trusting us with the job.\n\n— {your_name}\n{business_name}" },
  { id: "first_hello", name: "First hello", icon: "✨",
    description: "Friendly first-touch when a lead just came in.",
    subject: "Hi {first_name} — quick intro",
    body: "Hi {first_name},\n\nThanks for reaching out about {service_type}. I'm {your_name} with {business_name} — happy to help.\n\nWhat's the best time to chat about what you're looking for?\n\n— {your_name}" },
  { id: "appointment_reminder", name: "Appointment reminder", icon: "📅",
    description: "Friendly reminder ahead of an upcoming appointment.",
    subject: "See you {appointment_date}, {first_name}",
    body: "Hi {first_name},\n\nQuick reminder that we're booked for {appointment_date}. If anything's changed, just reply and we'll move it.\n\n— {your_name}" },
  { id: "thank_you_after_job", name: "Thank you after job", icon: "💼",
    description: "Send a brief thank-you after the work is finished.",
    subject: "Thanks for the work, {first_name}",
    body: "Hi {first_name},\n\nThank you for letting us handle {service_type} — it was a pleasure working with you.\n\nIf anything comes up after the fact, you know where to find me.\n\n— {your_name}\n{business_name}" },
  { id: "blank", name: "Blank", icon: "➕",
    description: "Start from scratch.",
    subject: "",
    body: "" },
];

async function _beFetchTemplates() {
  try {
    const r = await fetch("/me/leads/email-templates", { credentials: "same-origin" });
    if (!r.ok) return _BE_INLINE_TEMPLATES.slice();
    const d = await r.json();
    const arr = Array.isArray(d.templates) ? d.templates : [];
    // If the API returns an empty list (server hasn't been restarted yet,
    // bug, etc.) fall back to inline so the user still sees options.
    return arr.length ? arr : _BE_INLINE_TEMPLATES.slice();
  } catch (_) { return _BE_INLINE_TEMPLATES.slice(); }
}

async function _beFetchConnections() {
  try {
    const r = await fetch("/me/email-connections", { credentials: "same-origin" });
    if (!r.ok) return [];
    const d = await r.json();
    const arr = d.connections || d || [];
    return Array.isArray(arr) ? arr.filter(c => (c.status || "active") === "active") : [];
  } catch (_) { return []; }
}

function _beEnsureDialog() {
  let dlg = document.getElementById("leadsBulkEmailDlg");
  if (dlg) return dlg;
  dlg = document.createElement("div");
  dlg.id = "leadsBulkEmailDlg";
  dlg.style.cssText = "display:none;position:fixed;inset:0;z-index:90;";
  dlg.innerHTML = `
    <style>
      #leadsBulkEmailDlg .be-backdrop { position:absolute;inset:0;background:rgba(15,23,42,0.45);transition:opacity 160ms ease; }
      #leadsBulkEmailDlg .be-panel {
        position:absolute;top:0;right:0;bottom:0;width:min(640px, 100vw);
        background:#fff;display:flex;flex-direction:column;
        box-shadow:-12px 0 36px rgba(0,0,0,0.16);
        animation: beSlideIn 180ms ease;
        transition: width 220ms ease;
      }
      #leadsBulkEmailDlg .be-panel.is-cal-wide { width:min(900px, 100vw); }
      @keyframes beSlideIn { from { transform: translateX(24px); opacity:0.6; } to { transform: translateX(0); opacity:1; } }
      #leadsBulkEmailDlg .be-head { display:flex;align-items:center;justify-content:space-between;padding:16px 22px;border-bottom:1px solid #e5e7eb;flex-shrink:0; }
      #leadsBulkEmailDlg .be-head h2 { margin:0;font-size:17px;font-weight:700;color:#0a0a0a; }
      #leadsBulkEmailDlg .be-close { background:none;border:none;font-size:22px;cursor:pointer;color:#6b7280;line-height:1;padding:0 4px; }
      #leadsBulkEmailDlg .be-body { flex:1;overflow:auto;padding:18px 22px; }
      #leadsBulkEmailDlg .be-foot { padding:14px 22px;border-top:1px solid #e5e7eb;background:#fafafa;flex-shrink:0;display:flex;gap:8px;justify-content:flex-end;align-items:center; }
      #leadsBulkEmailDlg .be-recip { font-size:13.5px;color:#374151;margin-bottom:14px; }
      #leadsBulkEmailDlg .be-recip-toggle { background:none;border:none;color:#0a0a0a;font-size:13px;cursor:pointer;text-decoration:underline;padding:0 0 0 6px; }
      #leadsBulkEmailDlg .be-recip-list { margin-top:6px;padding:8px 12px;background:#f9fafb;border-radius:8px;font-size:12.5px;color:#475569;max-height:160px;overflow:auto; }
      #leadsBulkEmailDlg .be-grid { display:grid;grid-template-columns:repeat(3, 1fr);gap:10px; }
      #leadsBulkEmailDlg .be-card { padding:14px 12px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;cursor:pointer;text-align:left;display:flex;flex-direction:column;gap:6px;transition:border-color 120ms; }
      #leadsBulkEmailDlg .be-card:hover { border-color:#0a0a0a; }
      #leadsBulkEmailDlg .be-card .be-icon { font-size:22px;line-height:1; }
      #leadsBulkEmailDlg .be-card .be-name { font-size:13.5px;font-weight:600;color:#0a0a0a; }
      #leadsBulkEmailDlg .be-card .be-desc { font-size:12px;color:#6b7280;line-height:1.4; }
      #leadsBulkEmailDlg .be-back { background:none;border:none;color:#0a0a0a;font-size:13px;cursor:pointer;padding:0;margin-bottom:12px;text-decoration:underline; }
      #leadsBulkEmailDlg .be-field { margin-bottom:12px; }
      #leadsBulkEmailDlg .be-label { display:block;font-size:12.5px;font-weight:600;color:#374151;margin-bottom:6px; }
      #leadsBulkEmailDlg .be-input { width:100%;padding:9px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13.5px;background:#fff;color:#0a0a0a;font-family:inherit;box-sizing:border-box; }
      #leadsBulkEmailDlg .be-textarea { width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13.5px;background:#fff;color:#0a0a0a;font-family:inherit;min-height:200px;resize:vertical;line-height:1.5;box-sizing:border-box; }
      #leadsBulkEmailDlg .be-chips { display:flex;flex-wrap:wrap;gap:6px;margin-top:8px; }
      #leadsBulkEmailDlg .be-chip { padding:5px 10px;border:1px solid #e5e7eb;background:#fff;border-radius:999px;font-size:12px;color:#0a0a0a;cursor:pointer; }
      #leadsBulkEmailDlg .be-chip:hover { border-color:#0a0a0a;background:#f3f4f6; }
      #leadsBulkEmailDlg .be-chip-help { font-size:11.5px;color:#6b7280;margin:6px 0 0; }
      #leadsBulkEmailDlg .be-warn { padding:10px 12px;border:1px solid #fcd34d;background:#fffbeb;border-radius:8px;font-size:12.5px;color:#78350f;margin:10px 0; }
      #leadsBulkEmailDlg .be-warn .be-warn-link { background:none;border:none;color:#78350f;text-decoration:underline;cursor:pointer;padding:0;font-weight:600;font-size:12.5px; }
      #leadsBulkEmailDlg .be-preview-pane { padding:12px 14px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;font-size:13px;color:#0a0a0a;white-space:pre-wrap;font-family:inherit;line-height:1.5;max-height:240px;overflow:auto; }
      #leadsBulkEmailDlg .be-preview-subj { font-weight:700;margin-bottom:8px;font-size:13.5px; }
      #leadsBulkEmailDlg .be-from { font-size:12.5px;color:#475569;margin:10px 0; }
      #leadsBulkEmailDlg .be-btn-primary { padding:9px 16px;background:#0a0a0a;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer; }
      #leadsBulkEmailDlg .be-btn-primary[disabled] { opacity:0.5;cursor:not-allowed; }
      #leadsBulkEmailDlg .be-btn-secondary { padding:9px 16px;background:#fff;color:#0a0a0a;border:1px solid #d1d5db;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer; }
      #leadsBulkEmailDlg .be-btn-secondary[disabled] { opacity:0.5;cursor:not-allowed; }
      #leadsBulkEmailDlg .be-progress { padding:14px 0; }
      #leadsBulkEmailDlg .be-progress-track { height:8px;background:#e5e7eb;border-radius:999px;overflow:hidden;margin:10px 0; }
      #leadsBulkEmailDlg .be-progress-bar { height:100%;background:#0a0a0a;width:0%;transition:width 160ms ease; }
      #leadsBulkEmailDlg .be-cta-empty { padding:24px;text-align:center;border:1px dashed #d1d5db;border-radius:10px;color:#374151; }
      #leadsBulkEmailDlg .be-mini-modal { position:absolute;inset:0;background:rgba(15,23,42,0.55);display:flex;align-items:center;justify-content:center;z-index:5; }
      #leadsBulkEmailDlg .be-mini-modal .be-mini-card { background:#fff;border-radius:12px;padding:18px 20px;width:min(420px,92%);box-shadow:0 30px 60px rgba(0,0,0,0.3); }
      #leadsBulkEmailDlg .be-mini-card h3 { margin:0 0 8px;font-size:15px;font-weight:700;color:#0a0a0a; }
      #leadsBulkEmailDlg .be-mini-card p { margin:0 0 12px;font-size:13px;color:#374151;line-height:1.5; }
      #leadsBulkEmailDlg .be-mini-list { font-size:12.5px;color:#475569;max-height:160px;overflow:auto;background:#f9fafb;border-radius:8px;padding:8px 12px;margin-bottom:12px; }
      #leadsBulkEmailDlg .be-mini-actions { display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap; }
    </style>
    <div class="be-backdrop" data-be-backdrop></div>
    <div class="be-panel" role="dialog" aria-label="Send email">
      <div class="be-head">
        <h2 id="beTitle">Send email</h2>
        <button type="button" class="be-close" id="beClose" aria-label="Close">×</button>
      </div>
      <div class="be-body" id="beBody"></div>
      <div class="be-foot" id="beFoot"></div>
    </div>
  `;
  document.body.appendChild(dlg);
  dlg.querySelector("#beClose").addEventListener("click", _beClose);
  dlg.querySelector("[data-be-backdrop]").addEventListener("click", _beClose);
  return dlg;
}

function _beClose() {
  if (_beState.pollTimer) {
    clearInterval(_beState.pollTimer);
    _beState.pollTimer = null;
  }
  const dlg = document.getElementById("leadsBulkEmailDlg");
  if (dlg) dlg.style.display = "none";
  _beState.open = false;
}

async function openBulkEmailComposer(opts) {
  opts = opts || {};
  if (!_selectedIds.size) return;
  const ids = Array.from(_selectedIds);
  // Bulk actions act on (selected ∩ currently-visible). The global
  // selection state stays intact across filter changes (so the user can
  // re-broaden the filter and the same leads come back), but the action
  // itself is scoped to what they can see — so a Select-All-then-Filter
  // doesn't silently broadcast to the entire dataset.
  const visibleIdSet = new Set((_filteredLeads || []).map(l => l && l.id));
  const byId = new Map(_allLeads.map(l => [l.id, l]));
  const recipients = [];
  let hiddenByFilter = 0;
  for (const id of ids) {
    if (visibleIdSet.size && !visibleIdSet.has(id)) {
      hiddenByFilter += 1;
      continue;
    }
    const l = byId.get(id);
    if (l) recipients.push(l);
  }

  if (!recipients.length) {
    // Edge case: every selected lead is hidden by the current filter.
    // Bail with a clear toast instead of opening an empty composer.
    _showLeadsToast(`All ${ids.length} selected lead${ids.length === 1 ? "" : "s"} are hidden by your current filter — clear it to include them.`, "warn");
    return;
  }

  _beEnsureDialog();
  const dlg = document.getElementById("leadsBulkEmailDlg");
  dlg.style.display = "block";
  _beState.open = true;
  _beState.recipients = recipients;
  _beState.hiddenByFilter = hiddenByFilter;
  _beState.previewLeadId = recipients[0] ? recipients[0].id : "";
  _beState.subject = "";
  _beState.body = "";
  _beState.templateLoaded = null;
  _beState.fallbackOverrides = {};
  _beState.skipMissing = false;
  _beState.batchId = "";
  _beState.lastBatch = null;
  _beState.editingScheduledId = "";
  _beState.scheduledForEpoch = 0;
  _beState.openSchedulePickerOnLoad = !!opts.openSchedulePicker;
  // Phase 4: reset slot recommendations.
  _beState.slotWindow = "in_1_week";
  _beState.slotMinutes = 30;
  _beState.slotsLoading = false;
  _beState.slotsError = "";
  _beState.slotAssignments = {};
  _beState.slotTimeZone = "";
  // Phase 5: mini-calendar state.
  _beState.slotBusy = [];
  _beState.slotSearchStart = "";
  _beState.slotSearchEnd = "";
  _beState.slotCalDayOffset = 0;
  // Make sure the panel resets to the narrow width whenever a fresh
  // composer opens (no calendar showing yet).
  const _existingPane = dlg.querySelector(".be-panel");
  if (_existingPane) _existingPane.classList.remove("is-cal-wide");

  _beRender({ loading: true });

  const [profile, templates, connections] = await Promise.all([
    _beFetchSenderProfile(),
    _beFetchTemplates(),
    _beFetchConnections(),
  ]);
  _beState.senderProfile = profile;
  _beState.templates = templates || [];
  _beState.connections = connections || [];

  if (!profile || !profile.your_name) {
    _beState.view = "no-profile";
    _beRender();
    return;
  }
  if (!_beState.connections.length) {
    _beState.view = "no-connection";
    _beRender();
    return;
  }
  // Default to most-recently-used.
  _beState.connections.sort((a, b) => (b.last_used_at || 0) - (a.last_used_at || 0));
  _beState.fromConnectionId = _beState.connections[0].id;

  _beState.view = "grid";
  _beRender();
}

function _beRender(opts) {
  const dlg = document.getElementById("leadsBulkEmailDlg");
  if (!dlg) return;
  const body = dlg.querySelector("#beBody");
  const foot = dlg.querySelector("#beFoot");
  const title = dlg.querySelector("#beTitle");
  if (opts && opts.loading) {
    title.textContent = "Send email";
    body.innerHTML = `<div style="padding:40px;text-align:center;color:#6b7280;font-size:13px;">Loading…</div>`;
    foot.innerHTML = "";
    return;
  }
  if (_beState.view === "no-profile") {
    title.textContent = "Set your profile first";
    body.innerHTML = `
      <div class="be-cta-empty">
        <p style="margin:0 0 12px;font-size:14px;font-weight:600;">We need your name before sending.</p>
        <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">Add your first and last name in Profile, then come back and pick a template.</p>
        <button type="button" id="beOpenProfileBtn" style="padding:9px 16px;background:#0a0a0a;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">Open Profile</button>
      </div>`;
    foot.innerHTML = `<button type="button" class="be-btn-secondary" data-be-act="close">Close</button>`;
    const btn = body.querySelector("#beOpenProfileBtn");
    btn.addEventListener("click", () => {
      // The dashboard owns the profile editor as a JS modal (no separate
      // /dashboard/settings page). Close the composer first so the modal
      // gets the foreground; reopen on save so the user can continue.
      _beClose();
      if (typeof window.openProfileModal === "function") {
        window.openProfileModal(() => {
          // Reopen the composer for the same selection.
          openBulkEmailComposer();
        });
      } else {
        // Fallback for any deploy where the modal isn't loaded yet.
        window.location.href = "/dashboard#home";
      }
    });
    _beWireFooter();
    return;
  }
  if (_beState.view === "no-connection") {
    title.textContent = "Connect Gmail to send";
    body.innerHTML = `
      <div class="be-cta-empty">
        <p style="margin:0 0 12px;font-size:14px;font-weight:600;">Connect Gmail to send these emails.</p>
        <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">We send through your own Gmail so replies land in your inbox and the From address is yours.</p>
        <a href="/auth/google/connect-email" style="display:inline-block;padding:9px 16px;background:#0a0a0a;color:#fff;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;">Connect Gmail</a>
      </div>`;
    foot.innerHTML = `<button type="button" class="be-btn-secondary" data-be-act="close">Close</button>`;
    _beWireFooter();
    return;
  }
  if (_beState.view === "grid")    return _beRenderGrid();
  if (_beState.view === "editor")  return _beRenderEditor();
  if (_beState.view === "sending") return _beRenderSending();
  if (_beState.view === "done")    return _beRenderDone();
}

function _beRecipientHeader() {
  const n = _beState.recipients.length;
  const first10 = _beState.recipients.slice(0, 10).map(l => fullName(l) || l.email || "(no name)");
  const more = Math.max(0, n - 10);
  // Phase 3: surface opt-out count so users aren't surprised at "skipped".
  const optedOut = _beState.recipients.filter(l => l && l.email_opted_out === true).length;
  const optHint = optedOut > 0
    ? `<div style="margin-top:6px;font-size:12px;color:#9a3412;">${optedOut} lead${optedOut !== 1 ? "s" : ""} opted out of email — they'll be skipped.</div>`
    : "";
  // When the user has selected leads that aren't in the current filter, we
  // act on visible+selected only and tell them why the count is what it is.
  const hidden = Number(_beState.hiddenByFilter || 0);
  const filterHint = hidden > 0
    ? `<div style="margin-top:6px;font-size:12px;color:#475569;">${hidden} other selected lead${hidden !== 1 ? "s are" : " is"} hidden by your current filter — clear filters to include ${hidden !== 1 ? "them" : "it"}.</div>`
    : "";
  return `
    <div class="be-recip">
      <strong>To:</strong> ${n} lead${n !== 1 ? "s" : ""}
      <button type="button" class="be-recip-toggle" data-be-act="toggle-recip">Show recipients ▾</button>
      <div class="be-recip-list" id="beRecipList" style="display:none;">
        ${first10.map(n => escapeHtml(n)).join("<br>")}
        ${more ? `<div style="margin-top:6px;color:#6b7280;">…and ${more} more</div>` : ""}
      </div>
      ${filterHint}
      ${optHint}
    </div>`;
}

function _beRenderGrid() {
  const dlg = document.getElementById("leadsBulkEmailDlg");
  dlg.querySelector("#beTitle").textContent = "Pick a template";
  const body = dlg.querySelector("#beBody");
  const foot = dlg.querySelector("#beFoot");
  body.innerHTML = `
    ${_beRecipientHeader()}
    <div class="be-grid">
      ${_beState.templates.map(t => `
        <button type="button" class="be-card" data-be-tpl="${escapeHtml(t.id)}">
          <span class="be-icon">${escapeHtml(t.icon || "✉️")}</span>
          <span class="be-name">${escapeHtml(t.name)}</span>
          <span class="be-desc">${escapeHtml(t.description || "")}</span>
        </button>`).join("")}
    </div>`;
  foot.innerHTML = `<button type="button" class="be-btn-secondary" data-be-act="close">Cancel</button>`;
  body.querySelectorAll(".be-card").forEach(c => {
    c.addEventListener("click", () => _bePickTemplate(c.dataset.beTpl));
  });
  _beWireRecipToggle();
  _beWireFooter();
}

function _bePickTemplate(id) {
  const tpl = _beState.templates.find(t => t.id === id);
  if (!tpl) return;
  _beState.templateLoaded = tpl;
  _beState.subject = tpl.subject || "";
  _beState.body = tpl.body || "";
  _beState.view = "editor";
  _beRender();
  // If this template needs proposed slots, fire Find Times automatically
  // so the calendar appears with cards instead of an empty button. The user
  // didn't ask to compose blind — they picked the reschedule template, so
  // the helpful default is to show them suggested times immediately.
  if (_beUsesRecommendedSlot()
      && !_beState.slotsLoading
      && Object.keys(_beState.slotAssignments).length === 0) {
    _beFindSlots();
  }
}

function _beRenderEditor() {
  const dlg = document.getElementById("leadsBulkEmailDlg");
  dlg.querySelector("#beTitle").textContent = "Send email";
  const body = dlg.querySelector("#beBody");
  const foot = dlg.querySelector("#beFoot");

  const valid = _beValidate();
  const previewLead = _beState.recipients.find(l => l.id === _beState.previewLeadId)
                     || _beState.recipients[0] || {};
  const fb = { ..._BE_DEFAULT_FALLBACKS, ..._beState.fallbackOverrides };
  const previewSubj = substituteClientSide(_beState.subject, previewLead, _beState.senderProfile, fb);
  const previewBody = substituteClientSide(_beState.body, previewLead, _beState.senderProfile, fb);

  const conn = _beState.connections.find(c => c.id === _beState.fromConnectionId)
             || _beState.connections[0];
  const fromBlock = _beState.connections.length > 1
    ? `<div class="be-from"><strong>Sending from:</strong>
         <select id="beFromSel" style="margin-left:6px;padding:4px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:12.5px;">
           ${_beState.connections.map(c => `<option value="${escapeHtml(c.id)}" ${c.id === _beState.fromConnectionId ? "selected" : ""}>${escapeHtml(c.email_address || c.id)}</option>`).join("")}
         </select> (Connected Gmail)
       </div>`
    : `<div class="be-from"><strong>Sending from:</strong> ${escapeHtml(conn ? (conn.email_address || "") : "")} (Connected Gmail)</div>`;

  const warnHtml = (valid.missingCount > 0)
    ? `<div class="be-warn">
         ⚠️ ${valid.missingCount} lead${valid.missingCount !== 1 ? "s are" : " is"} missing data.
         We'll skip ${valid.missingCount === 1 ? "it" : "them"} unless you fix this.
         <button type="button" class="be-warn-link" data-be-act="see-missing">See which leads</button>
       </div>`
    : "";

  body.innerHTML = `
    <button type="button" class="be-back" data-be-act="back-to-grid">← Back to templates</button>
    ${_beRecipientHeader()}
    <div class="be-field">
      <label class="be-label" for="beSubject">Subject</label>
      <input type="text" class="be-input" id="beSubject" value="${escapeHtml(_beState.subject)}" placeholder="Subject…" />
    </div>
    <div class="be-field">
      <label class="be-label" for="beBody">Body</label>
      <textarea class="be-textarea" id="beBodyEdit" placeholder="Write your message…">${escapeHtml(_beState.body)}</textarea>
      <div class="be-chips" id="beChips">
        ${_BE_VAR_CHIPS.map(c => `<button type="button" class="be-chip" data-be-token="${escapeHtml(c.token)}">${escapeHtml(c.label)}</button>`).join("")}
      </div>
      <p class="be-chip-help">Click any chip to add it. Each one fills with that lead's info when we send.</p>
    </div>
    ${_beRenderSlotPanel()}
    ${warnHtml}
    <div class="be-field">
      <label class="be-label" for="bePreviewLead">Preview as</label>
      <select id="bePreviewLead" class="be-input">
        ${_beState.recipients.map(l => `<option value="${escapeHtml(l.id)}" ${l.id === _beState.previewLeadId ? "selected" : ""}>${escapeHtml(fullName(l) || l.email || l.id)}</option>`).join("")}
      </select>
    </div>
    <div class="be-field">
      <label class="be-label">Preview</label>
      <div class="be-preview-pane">
        <div class="be-preview-subj">${escapeHtml(previewSubj || "(no subject)")}</div>
        <div>${escapeHtml(previewBody || "(no body)")}</div>
      </div>
    </div>
    ${fromBlock}
  `;

  const total = _beState.recipients.length;
  const eta = Math.max(1, total);
  // When editing an already-scheduled batch, the send-now button doesn't
  // make sense — just "Save changes" via /update. Otherwise show both.
  const editingExisting = !!_beState.editingScheduledId;
  // Phase 4: gate Send / Schedule when the template uses {recommended_slot}
  // but the user hasn't run "Find times" yet (or coverage isn't complete).
  const needsSlots = _beUsesRecommendedSlot();
  const haveSlots = _beAllRecipientsHaveSlots();
  const slotGateActive = needsSlots && !haveSlots;
  const slotGateAttr = slotGateActive ? `disabled title="Find available times first."` : "";
  const primaryBtn = editingExisting
    ? `<button type="button" class="be-btn-primary" data-be-act="open-schedule" ${slotGateAttr}>Update schedule</button>`
    : `<button type="button" class="be-btn-secondary" data-be-act="open-schedule" ${slotGateAttr}>Schedule for later →</button>
       <button type="button" class="be-btn-primary"   data-be-act="send-now"      ${slotGateAttr}>Send now</button>`;
  foot.innerHTML = `
    <span style="margin-right:auto;font-size:12px;color:#6b7280;">About ${eta} second${eta !== 1 ? "s" : ""} to send ${total} email${total !== 1 ? "s" : ""}</span>
    ${primaryBtn}
  `;

  // Wiring
  const subj = body.querySelector("#beSubject");
  const bod  = body.querySelector("#beBodyEdit");
  subj.addEventListener("focus", () => { _beState.lastFocused = "subject"; });
  bod.addEventListener("focus",  () => { _beState.lastFocused = "body"; });
  subj.addEventListener("input", () => {
    _beState.subject = subj.value;
    _beUpdatePreview();
    _beUpdateWarn();
    _beTogglePanelOnTokenChange();
  });
  bod.addEventListener("input", () => {
    _beState.body = bod.value;
    _beUpdatePreview();
    _beUpdateWarn();
    _beTogglePanelOnTokenChange();
  });
  body.querySelectorAll(".be-chip").forEach(c => {
    c.addEventListener("click", () => _beInsertToken(c.dataset.beToken));
  });
  body.querySelector("#bePreviewLead").addEventListener("change", (e) => {
    _beState.previewLeadId = e.target.value;
    _beUpdatePreview();
  });
  const fromSel = body.querySelector("#beFromSel");
  if (fromSel) fromSel.addEventListener("change", (e) => {
    _beState.fromConnectionId = e.target.value;
  });
  body.querySelectorAll("[data-be-act]").forEach(b => {
    b.addEventListener("click", () => _beHandleAct(b.dataset.beAct));
  });
  _beWireRecipToggle();
  _beWireFooter();
  _beWireSlotPanel();

  // If the user clicked "Schedule for later" on the bulk bar, OR we're
  // editing an existing scheduled batch, drop them straight into the
  // schedule picker once the editor has rendered.
  if (_beState.openSchedulePickerOnLoad) {
    _beState.openSchedulePickerOnLoad = false;
    setTimeout(() => _beOpenSchedulePicker(), 0);
  }
}

function _beUpdatePreview() {
  const dlg = document.getElementById("leadsBulkEmailDlg");
  if (!dlg) return;
  const pane = dlg.querySelector(".be-preview-pane");
  if (!pane) return;
  const previewLead = _beState.recipients.find(l => l.id === _beState.previewLeadId)
                     || _beState.recipients[0] || {};
  const fb = { ..._BE_DEFAULT_FALLBACKS, ..._beState.fallbackOverrides };
  const previewSubj = substituteClientSide(_beState.subject, previewLead, _beState.senderProfile, fb);
  const previewBody = substituteClientSide(_beState.body, previewLead, _beState.senderProfile, fb);
  pane.innerHTML = `
    <div class="be-preview-subj">${escapeHtml(previewSubj || "(no subject)")}</div>
    <div>${escapeHtml(previewBody || "(no body)")}</div>
  `;
}

function _beUpdateWarn() {
  // Re-render the editor body to refresh the warn strip — cheap, and keeps
  // the editor logic in one place.
  const dlg = document.getElementById("leadsBulkEmailDlg");
  if (!dlg) return;
  const valid = _beValidate();
  const existing = dlg.querySelector(".be-warn");
  if (valid.missingCount > 0) {
    const html = `⚠️ ${valid.missingCount} lead${valid.missingCount !== 1 ? "s are" : " is"} missing data. We'll skip ${valid.missingCount === 1 ? "it" : "them"} unless you fix this. <button type="button" class="be-warn-link" data-be-act="see-missing">See which leads</button>`;
    if (existing) {
      existing.innerHTML = html;
      existing.querySelector("[data-be-act]").addEventListener("click", () => _beHandleAct("see-missing"));
    } else {
      // Insert before the preview-as field — find chip help and insert after.
      const pane = dlg.querySelector(".be-chip-help");
      if (pane) {
        const div = document.createElement("div");
        div.className = "be-warn";
        div.innerHTML = html;
        pane.parentElement.insertAdjacentElement("afterend", div);
        div.querySelector("[data-be-act]").addEventListener("click", () => _beHandleAct("see-missing"));
      }
    }
  } else if (existing) {
    existing.remove();
  }
}

// ─── Phase 4: Find available times panel ─────────────────────────────────────
//
// Shows whenever the editor body or subject contains {recommended_slot}.
// User picks a window + slot duration, clicks Find times, and we POST to
// /me/leads/bulk-email/find-slots. The returned slots are matched 1:1 to
// the recipient list in chronological order. The [↺] button on each row
// rotates the assignment with the next lead (circular reassignment for v1
// — Phase 5 can add a per-lead picker).

// ─── Mini-calendar constants (mirror /dashboard#calendar's sched-* set,
//     scoped to the composer popup) ────────────────────────────────────────
const _BE_CAL_DAY_START_MIN = 8 * 60;        // 8 AM
const _BE_CAL_DAY_END_MIN   = 20 * 60;       // 8 PM
const _BE_CAL_SLOT_MIN      = 30;            // half-hour rows
const _BE_CAL_SLOT_PX       = 24;            // 24px per 30-min slot → 576px total
const _BE_CAL_NUM_SLOTS     = Math.round((_BE_CAL_DAY_END_MIN - _BE_CAL_DAY_START_MIN) / _BE_CAL_SLOT_MIN);

// Card colors — deterministic per lead_id, mirrors the existing palette
// strategy (hash → index). 8 colors keep the popup uncluttered.
// Kept for backward compat with any caller that wants per-id deterministic
// color; the mini-cal cards now derive color from stage instead (so colors
// carry meaning, matching the leads list / pipeline / dashboard calendar).
const _BE_CAL_PALETTE = [
  "#2563eb", "#16a34a", "#dc2626", "#ea580c",
  "#7c3aed", "#0891b2", "#be185d", "#65a30d",
];
function _beCalLeadColor(leadId) {
  const s = String(leadId || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i)) | 0;
  return _BE_CAL_PALETTE[Math.abs(h) % _BE_CAL_PALETTE.length];
}

// Stage-derived color for mini-cal cards. Reuses STAGE_COLORS (the same
// palette the leads list uses) so the calendar reads as the same product
// surface — Quoted=amber, Scheduled=green, Won=lime, Lost=red, etc.
// Falls back to "scheduled" since most leads on the calendar are booked.
function _beCalStageColor(lead) {
  const stage = String((lead && lead.stage) || "scheduled").toLowerCase();
  return STAGE_COLORS[stage] || STAGE_COLORS.scheduled || "#1D9E75";
}

// Type icon mirroring the main dashboard calendar's set.
const _BE_CAL_TYPE_ICONS = {
  call: "📞", estimate: "📋", visit: "🏠",
  meeting: "🤝", job: "🔧", other: "⚙️",
};
function _beCalTypeIcon(lead) {
  const t = String((lead && lead.appointment_type) || "other").toLowerCase();
  return _BE_CAL_TYPE_ICONS[t] || _BE_CAL_TYPE_ICONS.other;
}

// Pretty duration for the card's second row: "30 min", "1 hour",
// "1 hr 30 min", etc. Matches the main calendar's vocabulary.
function _beCalDurationLabel(minutes) {
  const m = Number(minutes);
  if (!isFinite(m) || m <= 0) return "";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (rem === 0) return h === 1 ? "1 hour" : `${h} hours`;
  return `${h} hr ${rem} min`;
}

// Tinted background for the stage color — produces a pale fill matching
// the spine. Hex → rgba with the given alpha (0..1).
function _beCalTint(hex, alpha) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return `rgba(29, 158, 117, ${alpha})`;  // scheduled fallback
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Add N days to a Date (returns a new Date). Stays in local-clock time.
function _beCalAddDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
// YYYY-MM-DD for the calendar-day a Date sits on (in the browser's local
// time — same convention as the dashboard calendar's data-date attribute).
function _beCalIsoDate(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;
}
// Pull YYYY-MM-DD straight out of an ISO that already carries the working-tz
// offset (e.g. "2026-05-06T09:00:00-04:00"). Bypasses browser-local date
// math, which would shift the day for users whose browser tz differs from
// the working tz — that mismatch is what blanked the calendar before.
function _beCalIsoDayPart(isoStr) {
  if (!isoStr || typeof isoStr !== "string") return "";
  return isoStr.slice(0, 10);
}
// Pull minute-of-day (0..1439) straight out of the same ISO format.
function _beCalIsoMinutesPart(isoStr) {
  if (!isoStr || typeof isoStr !== "string" || isoStr.length < 16) return -1;
  const hh = parseInt(isoStr.slice(11, 13), 10);
  const mm = parseInt(isoStr.slice(14, 16), 10);
  if (!isFinite(hh) || !isFinite(mm)) return -1;
  return hh * 60 + mm;
}
// "9:00a"-style label from working-tz ISO without crossing browser-local.
function _beCalIsoTimeLabel(isoStr) {
  const m = _beCalIsoMinutesPart(isoStr);
  if (m < 0) return "";
  let h = Math.floor(m / 60);
  const mm = m % 60;
  const ampm = h >= 12 ? "p" : "a";
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${String(mm).padStart(2,"0")}${ampm}`;
}
// "Wed May 12, 9:00 AM" label from working-tz ISO (mirrors backend label).
function _beCalIsoBackendLabel(isoStr) {
  const day = _beCalIsoDayPart(isoStr);
  if (!day || day.length !== 10) return "";
  const [y, mo, d] = day.split("-").map(Number);
  // Anchor at noon to dodge DST edge cases when picking a weekday.
  const dt = new Date(y, mo - 1, d, 12, 0, 0);
  const ds = dt.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const m = _beCalIsoMinutesPart(isoStr);
  if (m < 0) return ds;
  let h = Math.floor(m / 60);
  const mm = m % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${ds}, ${h}:${String(mm).padStart(2,"0")} ${ampm}`;
}
// Add N days to a YYYY-MM-DD string, returning a YYYY-MM-DD string.
function _beCalAddIsoDay(dayStr, n) {
  if (!dayStr || dayStr.length !== 10) return dayStr;
  const [y, m, d] = dayStr.split("-").map(Number);
  const x = new Date(y, m - 1, d, 12, 0, 0);
  x.setDate(x.getDate() + n);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;
}
// Days between two YYYY-MM-DD strings (inclusive of start, exclusive of end).
function _beCalDaysBetween(startStr, endStr) {
  if (!startStr || !endStr) return 0;
  const [ys, ms, ds] = startStr.split("-").map(Number);
  const [ye, me, de] = endStr.split("-").map(Number);
  const a = new Date(ys, ms - 1, ds, 12, 0, 0).getTime();
  const b = new Date(ye, me - 1, de, 12, 0, 0).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}
function _beCalFmtTime(d) {
  // "9:00a", "10:30a", "1:30p" — matches the popup's compact style.
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "p" : "a";
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2,"0")}${ampm}`;
}
function _beCalFmtDayShort(d) {
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}
// Backend label format mirrors `recommend_slots` → "Wed May 12, 9:00 AM".
function _beCalFmtBackendLabel(d) {
  const day = d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${day}, ${h}:${String(m).padStart(2,"0")} ${ampm}`;
}

// The visible 3-day window — returns YYYY-MM-DD strings in the WORKING tz
// (parsed straight off the search-window ISOs, not via Date math). This is
// what makes cards line up with day columns regardless of browser tz.
function _beCalVisibleDays() {
  const startStr = _beCalIsoDayPart(_beState.slotSearchStart);
  if (!startStr) return [];
  const endStr = _beCalIsoDayPart(_beState.slotSearchEnd);
  const days = [];
  for (let i = 0; i < _beState.slotCalDayCount; i++) {
    const dStr = _beCalAddIsoDay(startStr, _beState.slotCalDayOffset + i);
    if (endStr && dStr >= endStr) break;   // ISO date strings sort lexicographically
    days.push(dStr);
  }
  return days;
}
// Can the user page forward? True if slotCalDayOffset + slotCalDayCount < total
// available days in the search window.
function _beCalCanPageForward() {
  const startStr = _beCalIsoDayPart(_beState.slotSearchStart);
  const endStr   = _beCalIsoDayPart(_beState.slotSearchEnd);
  if (!startStr || !endStr) return false;
  return (_beState.slotCalDayOffset + _beState.slotCalDayCount)
       < _beCalDaysBetween(startStr, endStr);
}
function _beCalCanPageBack() {
  return _beState.slotCalDayOffset > 0;
}
// Convert an ISO/epoch to a Date — same resilience as _toDate. The mini-cal
// uses the browser's local clock for placement; the working tz from the
// backend (slotTimeZone) influences which wall-clock the iso represents,
// but since the iso has its own offset suffix the browser correctly resolves
// it to the right instant. We then position by getHours/getMinutes which
// reflect the user's local tz — for users whose browser tz != working tz
// this would mis-position cards, but the backend always returns isos with
// the working-tz offset and the user is almost always in that same tz.
// (DST: handled because Date math advances by 24h while getHours/getMinutes
// resolve in the local tz, which absorbs spring-forward / fall-back.)
function _beCalDateOf(v) { return _toDate(v); }

// Time-slot layout in pixels relative to the day column's top.
function _beCalSlotLayout(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const startMin = startDate.getHours() * 60 + startDate.getMinutes();
  const endMin   = endDate.getHours() * 60 + endDate.getMinutes()
                   + (_beCalIsoDate(endDate) !== _beCalIsoDate(startDate) ? 24 * 60 : 0);
  const visStart = Math.max(_BE_CAL_DAY_START_MIN, startMin);
  const visEnd   = Math.min(_BE_CAL_DAY_END_MIN,   endMin);
  if (visEnd <= visStart) return null;
  const top    = ((visStart - _BE_CAL_DAY_START_MIN) / _BE_CAL_SLOT_MIN) * _BE_CAL_SLOT_PX;
  const height = Math.max(_BE_CAL_SLOT_PX,
                          ((visEnd - visStart) / _BE_CAL_SLOT_MIN) * _BE_CAL_SLOT_PX);
  return { top, height };
}

// Build a Date for (dateIso=YYYY-MM-DD, minutesFromMidnight). Uses the local
// clock — matches the placement logic in _beCalSlotLayout.
function _beCalLocalDate(dateIso, minOfDay) {
  const [yy, mm, dd] = dateIso.split("-").map(n => parseInt(n, 10));
  const d = new Date(yy, (mm || 1) - 1, dd || 1, 0, 0, 0, 0);
  d.setMinutes(minOfDay);
  return d;
}

// Conflict check on drop: would placing (lead_id, start, end) overlap a
// busy block or another lead's card? Returns true if conflict.
function _beCalWouldConflict(leadId, startMs, endMs) {
  const overlaps = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;
  // Busy events
  for (const b of _beState.slotBusy || []) {
    const bs = _beCalDateOf(b.start);
    const be = _beCalDateOf(b.end);
    if (!bs || !be) continue;
    if (overlaps(startMs, endMs, bs.getTime(), be.getTime())) return true;
  }
  // Other leads' cards
  for (const [otherId, a] of Object.entries(_beState.slotAssignments || {})) {
    if (otherId === leadId) continue;
    if (!a || !a.start_iso) continue;
    const os = _beCalDateOf(a.start_iso);
    const oe = a.end_iso ? _beCalDateOf(a.end_iso)
               : (os ? new Date(os.getTime() + _beState.slotMinutes * 60000) : null);
    if (!os || !oe) continue;
    if (overlaps(startMs, endMs, os.getTime(), oe.getTime())) return true;
  }
  return false;
}

function _beRenderSlotPanel() {
  if (!_beUsesRecommendedSlot()) return "";
  const total = _beState.recipients.length;
  const haveSlots = Object.keys(_beState.slotAssignments).length > 0;
  const haveBusy  = (_beState.slotBusy || []).length > 0;
  const showCal   = haveSlots || haveBusy;
  const winOpts = _BE_SLOT_WINDOWS.map(w =>
    `<option value="${escapeHtml(w.value)}" ${w.value === _beState.slotWindow ? "selected" : ""}>${escapeHtml(w.label)}</option>`
  ).join("");
  const durOpts = _BE_SLOT_DURATIONS.map(d =>
    `<option value="${d.value}" ${Number(d.value) === Number(_beState.slotMinutes) ? "selected" : ""}>${escapeHtml(d.label)}</option>`
  ).join("");

  // ── Mini-calendar HTML (rendered when we have slots OR busy data) ──
  let calHtml = "";
  if (showCal) {
    const days = _beCalVisibleDays();
    const slotMin = Number(_beState.slotMinutes) || 30;
    const slotHeightPx = (slotMin / _BE_CAL_SLOT_MIN) * _BE_CAL_SLOT_PX;
    const today = new Date(); today.setHours(0, 0, 0, 0);

    // Day-header row. `days` is now an array of YYYY-MM-DD strings in the
    // working tz; render labels by parsing the string at noon-local so the
    // weekday/day-num come out right regardless of browser tz.
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
    const dayHeaderHtml = `
      <div class="be-cal-day-header" style="grid-template-columns: 48px repeat(${days.length}, minmax(0, 1fr));">
        <div class="be-cal-time-spacer"></div>
        ${days.map(dStr => {
          const [yy, mm, dd] = dStr.split("-").map(Number);
          const dt = new Date(yy, mm - 1, dd, 12, 0, 0);
          const isToday = dStr === todayStr;
          return `<div class="${isToday ? "is-today" : ""}">
            <span>${escapeHtml(dt.toLocaleDateString([], { weekday: "short" }))}</span>
            <span class="be-cal-day-num">${dd}</span>
          </div>`;
        }).join("")}
      </div>
    `;

    // Time column — labels every hour, blank on the half.
    let timeCellsHtml = "";
    for (let i = 0; i < _BE_CAL_NUM_SLOTS; i++) {
      const m = _BE_CAL_DAY_START_MIN + i * _BE_CAL_SLOT_MIN;
      const isHour = (m % 60) === 0;
      let label = "";
      if (isHour) {
        const h = Math.floor(m / 60);
        const ampm = h >= 12 ? "p" : "a";
        const h12 = ((h + 11) % 12) + 1;
        label = `${h12}${ampm}`;
      }
      timeCellsHtml += `<div class="be-cal-time-cell ${isHour ? "" : "half"}">${label}</div>`;
    }

    // Per-day cells + busy + cards. Cards are stacked HORIZONTALLY on the
    // same slot (split width by N), so multiple leads at the same time
    // stay readable instead of disappearing under a vertical stack.
    // Day matching is done on the YYYY-MM-DD string parsed straight from
    // the working-tz ISO — never via JS Date round-trip — so cards always
    // land on the column the backend intended, regardless of browser tz.
    const dayColsHtml = days.map(dStr => {
      const dateIso = dStr;
      let cells = "";
      for (let i = 0; i < _BE_CAL_NUM_SLOTS; i++) {
        const m = _BE_CAL_DAY_START_MIN + i * _BE_CAL_SLOT_MIN;
        const isHour = (m % 60) === 0;
        cells += `<div class="be-cal-cell ${isHour ? "is-hour" : ""}" data-date="${dateIso}" data-min="${m}"></div>`;
      }

      // Busy overlays for this day. The backend's busy items have
      // start/end as ISO strings. We compare day strings directly.
      const busyHtml = [];
      for (const b of _beState.slotBusy || []) {
        const bsDay = _beCalIsoDayPart(b.start);
        const beDay = _beCalIsoDayPart(b.end);
        if (!bsDay || !beDay) continue;
        // Render the block on this day if it starts here OR ends here OR
        // strictly straddles it.
        const touchesDay = (bsDay === dateIso) || (beDay === dateIso)
                        || (bsDay < dateIso && beDay > dateIso);
        if (!touchesDay) continue;
        // Layout from minute-of-day, clipped to the visible 8a-8p window.
        const startMin = (bsDay === dateIso) ? _beCalIsoMinutesPart(b.start) : 0;
        const endMin   = (beDay === dateIso) ? _beCalIsoMinutesPart(b.end)   : 24 * 60;
        const visStart = Math.max(_BE_CAL_DAY_START_MIN, startMin);
        const visEnd   = Math.min(_BE_CAL_DAY_END_MIN,   endMin);
        if (visEnd <= visStart) continue;
        const top = ((visStart - _BE_CAL_DAY_START_MIN) / _BE_CAL_SLOT_MIN) * _BE_CAL_SLOT_PX;
        const height = ((visEnd - visStart) / _BE_CAL_SLOT_MIN) * _BE_CAL_SLOT_PX;
        busyHtml.push(`<div class="be-cal-busy" style="top:${top}px; height:${height}px;" aria-hidden="true">
          <div class="be-cal-busy-title">Busy</div>
          <div class="be-cal-busy-time">${escapeHtml(_beCalIsoTimeLabel(b.start))}-${escapeHtml(_beCalIsoTimeLabel(b.end))}</div>
        </div>`);
      }

      // Cards for this day, grouped by start-minute so co-located cards
      // can split the column horizontally (1/N width each).
      const cardsByMin = new Map();
      for (const lead of _beState.recipients) {
        const a = _beState.slotAssignments[lead.id];
        if (!a || !a.start_iso) continue;
        const slotDay = _beCalIsoDayPart(a.start_iso);
        if (slotDay !== dateIso) continue;
        const startMin = _beCalIsoMinutesPart(a.start_iso);
        if (startMin < _BE_CAL_DAY_START_MIN || startMin >= _BE_CAL_DAY_END_MIN) continue;
        const key = String(startMin);
        if (!cardsByMin.has(key)) cardsByMin.set(key, []);
        cardsByMin.get(key).push({ lead, assignment: a, startMin });
      }
      const cardsHtml = [];
      for (const [, group] of cardsByMin) {
        const n = group.length;
        group.forEach((entry, idx) => {
          const { lead, assignment, startMin } = entry;
          const top = ((startMin - _BE_CAL_DAY_START_MIN) / _BE_CAL_SLOT_MIN) * _BE_CAL_SLOT_PX;
          const widthPct = 100 / n;
          const leftPct  = idx * widthPct;
          // Per-lead color (deterministic hash of lead.id) — easier to scan
          // a packed week and tell two booked leads apart. Stage info still
          // shows up in the type-icon + name; the color carries identity.
          const color = _beCalLeadColor(lead.id);
          const fill  = _beCalTint(color, 0.14);
          const icon  = _beCalTypeIcon(lead);
          const nm = fullName(lead) || lead.email || lead.id;
          const tLabel = _beCalIsoTimeLabel(assignment.start_iso);
          const durLabel = _beCalDurationLabel(slotMin);
          // Compressed (≤24px) → icon + name only. Mid (≤48px) adds time.
          // Full (>48px) adds duration. Always uses stage palette so the
          // color carries meaning, not random per-id rainbow.
          let sizeClass = "is-full";
          if (slotHeightPx <= 26) sizeClass = "is-compressed";
          else if (slotHeightPx <= 50) sizeClass = "is-mid";
          const timeLine = sizeClass === "is-full"
            ? `${tLabel} · ${durLabel}`
            : tLabel;
          cardsHtml.push(`<div class="be-cal-card ${sizeClass}" draggable="true"
            data-be-lead-id="${escapeHtml(lead.id)}"
            title="${escapeHtml(nm + " — " + tLabel + " · " + durLabel)}"
            style="top:${top}px; height:${slotHeightPx}px; left:calc(${leftPct}% + 2px); width:calc(${widthPct}% - 4px); --be-card-color:${color}; --be-card-fill:${fill};">
            <div class="be-cal-card-row1">
              <span class="be-cal-card-icon" aria-hidden="true">${icon}</span>
              <span class="be-cal-card-name">${escapeHtml(nm)}</span>
            </div>
            <div class="be-cal-card-time">${escapeHtml(timeLine)}</div>
          </div>`);
        });
      }

      return `<div class="be-cal-day-col" data-date="${dateIso}">
        ${cells}
        ${busyHtml.join("")}
        ${cardsHtml.join("")}
      </div>`;
    }).join("");

    // Day-nav toolbar — `days` is YYYY-MM-DD strings; render labels by
    // parsing each at noon-local so the weekday/day are stable.
    const _navLabel = (dStr) => {
      if (!dStr || dStr.length !== 10) return "—";
      const [y, m, d] = dStr.split("-").map(Number);
      const dt = new Date(y, m - 1, d, 12, 0, 0);
      return dt.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    };
    const first = days[0];
    const last  = days[days.length - 1];
    const navLabel = (first && last)
      ? (days.length === 1
          ? _navLabel(first)
          : `${_navLabel(first)} → ${_navLabel(last)}`)
      : "—";
    const prevDis = _beCalCanPageBack() ? "" : "disabled";
    const nextDis = _beCalCanPageForward() ? "" : "disabled";

    // Empty-slots hint when busy data exists but no cards landed.
    const emptyHint = (!haveSlots && haveBusy)
      ? `<p class="be-cal-empty-hint">No open slots in this window — try a longer one (busy times shown above).</p>`
      : "";

    calHtml = `
      <div class="be-cal-toolbar">
        <button type="button" class="be-cal-nav-btn" data-be-cal-nav="prev" ${prevDis} aria-label="Previous days">◀</button>
        <span class="be-cal-nav-label">${escapeHtml(navLabel)}</span>
        <button type="button" class="be-cal-today-btn" data-be-cal-nav="today">Today</button>
        <button type="button" class="be-cal-nav-btn" data-be-cal-nav="next" ${nextDis} aria-label="Next days">▶</button>
      </div>
      <div class="be-cal-grid-wrap">
        ${dayHeaderHtml}
        <div class="be-cal-grid" style="grid-template-columns: 48px repeat(${days.length}, minmax(0, 1fr));">
          <div class="be-cal-time-col">${timeCellsHtml}</div>
          ${dayColsHtml}
        </div>
      </div>
      ${emptyHint}
      <p class="be-cal-help">Drag any card to move that lead's appointment time.</p>
    `;
  }

  let errHtml = "";
  if (_beState.slotsError === "no_calendar") {
    errHtml = `<div class="be-slot-err">Connect Google Calendar first. <a href="/auth/google/connect-calendar" class="be-slot-err-link">Connect calendar →</a></div>`;
  } else if (_beState.slotsError === "no_working_hours") {
    errHtml = `<div class="be-slot-err">Set your working hours first. <a href="/try/setup" class="be-slot-err-link">Open setup →</a></div>`;
  } else if (_beState.slotsError === "no_slots_available" && !showCal) {
    errHtml = `<div class="be-slot-err">No open slots in that window. Try a longer one.</div>`;
  } else if (_beState.slotsError === "network") {
    errHtml = `<div class="be-slot-err">Couldn't reach the server. Try again.</div>`;
  } else if (_beState.slotsError === "partial") {
    const found = Object.keys(_beState.slotAssignments).length;
    errHtml = `<div class="be-slot-warn">Only found ${found} open time${found !== 1 ? "s" : ""} — ${total - found} lead${(total - found) !== 1 ? "s" : ""} still need a slot. Try a longer window.</div>`;
  }

  // When the helper can't find slots, surface diagnostics so the user can
  // see what was actually checked (calendar id, weekday keys it found in
  // working hours, freebusy result). Plain English, no code-jargon.
  if (errHtml && _beState.slotsDiagnostics) {
    const d = _beState.slotsDiagnostics;
    const lines = [];
    if (d.calendar_id) lines.push(`Calendar checked: ${escapeHtml(d.calendar_id)}`);
    if (d.calendar_time_zone) lines.push(`Calendar time zone: ${escapeHtml(d.calendar_time_zone)}`);
    if (d.working_hours_time_zone) lines.push(`Working-hours time zone: ${escapeHtml(d.working_hours_time_zone)}`);
    if (d.working_hours_used_default) lines.push(`Working hours: using Mon-Fri 9-5 default (yours weren't readable)`);
    else if (Array.isArray(d.working_hours_keys)) lines.push(`Working-hours days configured: ${d.working_hours_keys.join(", ") || "(none)"}`);
    if (d.search_start_local) lines.push(`Window starts: ${escapeHtml(String(d.search_start_local))}`);
    if (typeof d.horizon_days === "number") lines.push(`Window length: ${d.horizon_days} day${d.horizon_days === 1 ? "" : "s"}`);
    if (typeof d.freebusy_busy_count === "number") lines.push(`Busy events found in window: ${d.freebusy_busy_count}`);
    if (d.freebusy_ok === false) lines.push(`Calendar lookup failed: ${escapeHtml(String(d.freebusy_error || "unknown"))}`);
    if (typeof d.slot_minutes === "number") lines.push(`Slot length: ${d.slot_minutes} minutes`);
    if (lines.length) {
      errHtml += `<details class="be-slot-diag"><summary>Why?</summary><div>${lines.map(l => `<div>${l}</div>`).join("")}</div></details>`;
    }
  }

  const btnLabel = _beState.slotsLoading
    ? "Finding times…"
    : `Find times for these ${total} lead${total !== 1 ? "s" : ""}`;
  const btnDisabled = _beState.slotsLoading ? "disabled" : "";

  return `
    <style>
      #leadsBulkEmailDlg .be-slot-panel { padding:14px;border:1px solid #e5e7eb;border-radius:10px;background:#fafafa;margin:14px 0; }
      #leadsBulkEmailDlg .be-slot-title { font-size:13.5px;font-weight:600;color:#0a0a0a;margin-bottom:10px;display:flex;align-items:center;gap:6px; }
      #leadsBulkEmailDlg .be-slot-controls { display:flex;gap:10px;margin-bottom:10px;flex-wrap:wrap; }
      #leadsBulkEmailDlg .be-slot-control { display:flex;flex-direction:column;gap:4px;font-size:11.5px;color:#475569;flex:1;min-width:130px; }
      #leadsBulkEmailDlg .be-slot-control select { padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;background:#fff;color:#0a0a0a; }
      #leadsBulkEmailDlg .be-slot-find-btn { width:100%;padding:9px 14px;background:#0a0a0a;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer; }
      #leadsBulkEmailDlg .be-slot-find-btn[disabled] { opacity:0.6;cursor:not-allowed; }
      #leadsBulkEmailDlg .be-slot-err { padding:9px 12px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:8px;font-size:12.5px;margin-top:10px; }
      #leadsBulkEmailDlg .be-slot-warn { padding:9px 12px;background:#fffbeb;border:1px solid #fcd34d;color:#78350f;border-radius:8px;font-size:12.5px;margin-top:10px; }
      #leadsBulkEmailDlg .be-slot-err-link { color:#991b1b;text-decoration:underline;font-weight:600;margin-left:6px; }
      #leadsBulkEmailDlg .be-slot-diag { margin-top:8px;font-size:11.5px;color:#475569; }
      #leadsBulkEmailDlg .be-slot-diag summary { cursor:pointer;color:#64748b;text-decoration:underline;font-weight:500;font-size:11.5px;list-style:none;padding:2px 0; }
      #leadsBulkEmailDlg .be-slot-diag summary::-webkit-details-marker { display:none; }
      #leadsBulkEmailDlg .be-slot-diag div div { padding:2px 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px; }

      /* ── Mini-calendar inside the slot panel (mirrors /dashboard#calendar) ── */
      #leadsBulkEmailDlg .be-cal-toolbar { display:flex;align-items:center;gap:8px;margin:14px 0 8px; }
      #leadsBulkEmailDlg .be-cal-nav-btn { background:#fff;border:1px solid #d1d5db;border-radius:6px;padding:4px 10px;font-size:13px;color:#0a0a0a;cursor:pointer;line-height:1; }
      #leadsBulkEmailDlg .be-cal-nav-btn:hover { background:#f3f4f6;border-color:#0a0a0a; }
      #leadsBulkEmailDlg .be-cal-nav-btn[disabled] { opacity:0.4;cursor:not-allowed; }
      #leadsBulkEmailDlg .be-cal-today-btn { background:#fff;border:1px solid #d1d5db;border-radius:6px;padding:4px 10px;font-size:12px;color:#475569;cursor:pointer;line-height:1.4; }
      #leadsBulkEmailDlg .be-cal-today-btn:hover { background:#f3f4f6;border-color:#0a0a0a;color:#0a0a0a; }
      #leadsBulkEmailDlg .be-cal-nav-label { flex:1;text-align:center;font-size:13px;font-weight:600;color:#0a0a0a;font-variant-numeric:tabular-nums; }
      #leadsBulkEmailDlg .be-cal-grid-wrap { background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,0.04); }
      #leadsBulkEmailDlg .be-cal-day-header { display:grid;grid-template-columns:48px repeat(auto-fit, minmax(0, 1fr));background:#fafafa;border-bottom:1px solid #e5e7eb; }
      #leadsBulkEmailDlg .be-cal-day-header > div { padding:8px 6px;font-size:11px;font-weight:600;color:#525252;text-align:center;border-left:1px solid #f4f4f5; }
      #leadsBulkEmailDlg .be-cal-day-header > div:first-child { border-left:0; }
      #leadsBulkEmailDlg .be-cal-day-header .be-cal-day-num { display:block;font-size:16px;font-weight:700;color:#0a0a0a;margin-top:2px;font-variant-numeric:tabular-nums; }
      #leadsBulkEmailDlg .be-cal-day-header .is-today { color:#2563eb; }
      #leadsBulkEmailDlg .be-cal-day-header .is-today .be-cal-day-num { color:#2563eb; }
      #leadsBulkEmailDlg .be-cal-day-header > .be-cal-time-spacer { background:transparent; }
      #leadsBulkEmailDlg .be-cal-grid { display:grid;position:relative;max-height:480px;overflow-y:auto; }
      #leadsBulkEmailDlg .be-cal-time-col { display:flex;flex-direction:column;background:#fff;border-right:1px solid #e5e7eb; }
      #leadsBulkEmailDlg .be-cal-time-cell { height:24px;padding:0 5px;font-size:10px;color:#a1a1aa;text-align:right;border-bottom:1px solid #f4f4f5;font-variant-numeric:tabular-nums;line-height:24px; }
      #leadsBulkEmailDlg .be-cal-time-cell.half { color:transparent; }
      #leadsBulkEmailDlg .be-cal-day-col { position:relative;border-left:1px solid #f4f4f5; }
      #leadsBulkEmailDlg .be-cal-day-col:first-of-type { border-left:0; }
      #leadsBulkEmailDlg .be-cal-cell { height:24px;border-bottom:1px solid #f4f4f5; }
      #leadsBulkEmailDlg .be-cal-cell.is-hour { border-bottom-color:#e5e7eb; }
      #leadsBulkEmailDlg .be-cal-cell.is-active-drop { background:rgba(37,99,235,0.10);outline:1px dashed #2563eb;outline-offset:-1px; }
      #leadsBulkEmailDlg .be-cal-cell.is-conflict-drop { background:rgba(239,68,68,0.10);outline:1px dashed #ef4444;outline-offset:-1px; }
      @keyframes beCalCellReject { 0% { background:rgba(239,68,68,0.40); } 100% { background:transparent; } }
      #leadsBulkEmailDlg .be-cal-cell.is-rejected { animation: beCalCellReject 320ms ease-out; }
      #leadsBulkEmailDlg .be-cal-busy { position:absolute;left:3px;right:3px;background:repeating-linear-gradient(-45deg,#f1f5f9 0,#f1f5f9 4px,#e2e8f0 4px,#e2e8f0 8px);border:1px solid #cbd5e1;border-radius:5px;font-size:10px;color:#64748b;padding:2px 5px;line-height:1.2;overflow:hidden;pointer-events:none;font-style:italic;z-index:1; }
      #leadsBulkEmailDlg .be-cal-busy-title { font-weight:600;font-style:normal;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
      #leadsBulkEmailDlg .be-cal-busy-time { opacity:0.85; }
      /* Mini-cal card mirrors Phase 1's main-calendar pill: stage-tinted
         fill, 3px stage-color spine on the left, dark text. Compressed /
         mid / full size classes hide rows progressively as height shrinks
         (≤26px = icon + name only; ≤50px = adds time; >50px = adds duration). */
      #leadsBulkEmailDlg .be-cal-card {
        position:absolute;background:var(--be-card-fill, rgba(29,158,117,0.14));
        color:#0a0a0a;border-radius:6px;
        padding:3px 5px 3px 7px;
        border:1px solid var(--be-card-color, #1D9E75);
        border-left:3px solid var(--be-card-color, #1D9E75);
        font-size:11px;line-height:1.2;overflow:hidden;cursor:grab;
        box-shadow:0 1px 2px rgba(0,0,0,0.06);z-index:2;user-select:none;
        transition:box-shadow 120ms ease,border-width 120ms ease;
      }
      #leadsBulkEmailDlg .be-cal-card:hover { box-shadow:0 2px 6px rgba(0,0,0,0.16); }
      #leadsBulkEmailDlg .be-cal-card.is-dragging { opacity:0.55;cursor:grabbing; }
      #leadsBulkEmailDlg .be-cal-card-row1 { display:flex;align-items:flex-start;gap:4px;min-width:0; }
      #leadsBulkEmailDlg .be-cal-card-icon { font-size:11px;line-height:1.2;flex-shrink:0; }
      #leadsBulkEmailDlg .be-cal-card-name { font-weight:600;color:#0a0a0a;min-width:0;flex:1;
        white-space:normal;word-break:break-word;overflow:hidden; }
      #leadsBulkEmailDlg .be-cal-card-time { color:#475569;font-size:10px;margin-top:1px; }
      #leadsBulkEmailDlg .be-cal-card.is-compressed { padding:2px 5px 2px 7px;font-size:10.5px; }
      #leadsBulkEmailDlg .be-cal-card.is-compressed .be-cal-card-name {
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
      #leadsBulkEmailDlg .be-cal-card.is-compressed .be-cal-card-time { display:none; }
      #leadsBulkEmailDlg .be-cal-empty-hint { margin:10px 0 0;padding:10px 12px;background:#fffbeb;border:1px solid #fcd34d;color:#78350f;border-radius:8px;font-size:12.5px;text-align:center; }
      #leadsBulkEmailDlg .be-cal-help { margin:8px 0 0;font-size:11.5px;color:#6b7280;text-align:center; }
    </style>
    <div class="be-slot-panel" id="beSlotPanel">
      <div class="be-slot-title">Find available times</div>
      <div class="be-slot-controls">
        <label class="be-slot-control">
          <span>Look in</span>
          <select id="beSlotWindow">${winOpts}</select>
        </label>
        <label class="be-slot-control">
          <span>Per slot</span>
          <select id="beSlotMinutes">${durOpts}</select>
        </label>
      </div>
      <button type="button" class="be-slot-find-btn" id="beSlotFindBtn" ${btnDisabled}>${escapeHtml(btnLabel)}</button>
      ${errHtml}
      ${calHtml}
    </div>
  `;
}

function _beWireSlotPanel() {
  const dlg = document.getElementById("leadsBulkEmailDlg");
  if (!dlg) return;
  const panel = dlg.querySelector("#beSlotPanel");
  if (!panel) return;
  const winSel = panel.querySelector("#beSlotWindow");
  const durSel = panel.querySelector("#beSlotMinutes");
  if (winSel) winSel.addEventListener("change", (e) => { _beState.slotWindow = e.target.value; });
  if (durSel) durSel.addEventListener("change", (e) => { _beState.slotMinutes = Number(e.target.value) || 30; });
  const findBtn = panel.querySelector("#beSlotFindBtn");
  if (findBtn) findBtn.addEventListener("click", () => _beFindSlots());

  // Day-nav buttons (only present when the calendar is rendered).
  panel.querySelectorAll("[data-be-cal-nav]").forEach(btn => {
    btn.addEventListener("click", () => {
      const dir = btn.dataset.beCalNav;
      if (dir === "prev") {
        _beState.slotCalDayOffset = Math.max(0, _beState.slotCalDayOffset - _beState.slotCalDayCount);
      } else if (dir === "next") {
        if (_beCalCanPageForward()) _beState.slotCalDayOffset += _beState.slotCalDayCount;
      } else if (dir === "today") {
        _beState.slotCalDayOffset = 0;
      }
      _beRefreshSlotPanel();
    });
  });

  _beWireCalDragDrop();
  // Toggle the wider-popup class whenever the slot panel re-renders.
  _beUpdatePanelWidthClass();
}

function _beUpdatePanelWidthClass() {
  const dlg = document.getElementById("leadsBulkEmailDlg");
  if (!dlg) return;
  const pane = dlg.querySelector(".be-panel");
  if (!pane) return;
  const showCal = (Object.keys(_beState.slotAssignments || {}).length > 0)
                  || ((_beState.slotBusy || []).length > 0);
  pane.classList.toggle("is-cal-wide", _beUsesRecommendedSlot() && showCal);
}

// Mini-calendar drag-drop: cards drag to cells. Mirrors the dashboard
// calendar's pattern (dragstart/dragover/drop + transient classes), but
// scoped to the composer popup. Conflict guard rejects drops that would
// overlap busy events or another lead's card.
function _beWireCalDragDrop() {
  const dlg = document.getElementById("leadsBulkEmailDlg");
  if (!dlg) return;
  const panel = dlg.querySelector("#beSlotPanel");
  if (!panel) return;

  panel.querySelectorAll(".be-cal-card").forEach(card => {
    card.addEventListener("dragstart", (e) => {
      const lid = card.dataset.beLeadId || "";
      card.classList.add("is-dragging");
      try {
        e.dataTransfer.setData("text/plain", lid);
        e.dataTransfer.effectAllowed = "move";
      } catch (_) {}
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("is-dragging");
      panel.querySelectorAll(".be-cal-cell.is-active-drop, .be-cal-cell.is-conflict-drop")
        .forEach(c => c.classList.remove("is-active-drop", "is-conflict-drop"));
    });
  });

  let activeCell = null;
  panel.querySelectorAll(".be-cal-cell").forEach(cell => {
    cell.addEventListener("dragenter", (e) => {
      e.preventDefault();
      if (activeCell && activeCell !== cell) {
        activeCell.classList.remove("is-active-drop", "is-conflict-drop");
      }
      const lid = (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.length)
        ? "" : "";
      // We can't read the lead-id during dragover (browsers block it for
      // privacy); just preview the highlight, conflict-check on drop.
      cell.classList.add("is-active-drop");
      activeCell = cell;
    });
    cell.addEventListener("dragover", (e) => {
      e.preventDefault();
      try { e.dataTransfer.dropEffect = "move"; } catch (_) {}
    });
    cell.addEventListener("dragleave", () => {
      if (cell === activeCell) {
        cell.classList.remove("is-active-drop", "is-conflict-drop");
        activeCell = null;
      }
    });
    cell.addEventListener("drop", (e) => {
      e.preventDefault();
      cell.classList.remove("is-active-drop", "is-conflict-drop");
      activeCell = null;
      let leadId = "";
      try { leadId = e.dataTransfer.getData("text/plain") || ""; } catch (_) {}
      if (!leadId) return;
      const dateIso = cell.dataset.date;
      const minOfDay = parseInt(cell.dataset.min, 10);
      if (!dateIso || !Number.isFinite(minOfDay)) return;

      const slotMin = Number(_beState.slotMinutes) || 30;
      const startDate = _beCalLocalDate(dateIso, minOfDay);
      const endDate   = new Date(startDate.getTime() + slotMin * 60000);

      // Conflict check: vs busy and vs other leads' cards.
      if (_beCalWouldConflict(leadId, startDate.getTime(), endDate.getTime())) {
        cell.classList.add("is-rejected");
        setTimeout(() => cell.classList.remove("is-rejected"), 360);
        return;
      }

      // Update the assignment and refresh.
      _beState.slotAssignments[leadId] = {
        start_iso: _beCalToOffsetIso(startDate),
        end_iso:   _beCalToOffsetIso(endDate),
        label:     _beCalFmtBackendLabel(startDate),
        epoch:     Math.floor(startDate.getTime() / 1000),
      };
      _beRefreshSlotPanel();
      _beUpdatePreview();
    });
  });
}

// Build an ISO 8601 string with the local timezone offset (so the backend
// stores the same wall-clock the user dropped on, instead of a UTC instant
// that would shift across DST). Output looks like 2026-05-12T09:00:00-04:00.
function _beCalToOffsetIso(d) {
  const pad = (n, w) => String(n).padStart(w || 2, "0");
  const offMin = -d.getTimezoneOffset();      // minutes east of UTC
  const sign = offMin >= 0 ? "+" : "-";
  const offH = pad(Math.floor(Math.abs(offMin) / 60));
  const offM = pad(Math.abs(offMin) % 60);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
       + `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
       + `${sign}${offH}:${offM}`;
}

function _beRefreshSlotPanel() {
  // Re-render JUST the slot panel area (and the footer button gating).
  const dlg = document.getElementById("leadsBulkEmailDlg");
  if (!dlg) return;
  const old = dlg.querySelector("#beSlotPanel");
  if (!old) {
    // Editor isn't showing the panel yet — full render.
    _beRender();
    return;
  }
  const tmp = document.createElement("div");
  tmp.innerHTML = _beRenderSlotPanel();
  const fresh = tmp.querySelector("#beSlotPanel");
  if (fresh) {
    old.replaceWith(fresh);
    _beWireSlotPanel();
  }
  // Re-render the footer so the gate state stays in sync.
  _beRefreshFooterGate();
  _beUpdatePreview();
}

function _beTogglePanelOnTokenChange() {
  // The find-times panel only shows when {recommended_slot} is in subject
  // or body. When the user adds or removes the token, swap the panel in/out
  // without re-rendering the whole editor (which would lose textarea focus).
  const dlg = document.getElementById("leadsBulkEmailDlg");
  if (!dlg) return;
  const existing = dlg.querySelector("#beSlotPanel");
  const wantPanel = _beUsesRecommendedSlot();
  if (wantPanel && !existing) {
    // Insert before the warn / preview-as field — find the chip-help para.
    const chipHelp = dlg.querySelector(".be-chip-help");
    if (chipHelp) {
      const tmp = document.createElement("div");
      tmp.innerHTML = _beRenderSlotPanel();
      const fresh = tmp.querySelector("#beSlotPanel");
      if (fresh) {
        chipHelp.parentElement.insertAdjacentElement("afterend", fresh);
        _beWireSlotPanel();
      }
    }
  } else if (!wantPanel && existing) {
    existing.remove();
  }
  _beRefreshFooterGate();
  _beUpdatePanelWidthClass();
}

function _beRefreshFooterGate() {
  const dlg = document.getElementById("leadsBulkEmailDlg");
  if (!dlg) return;
  const foot = dlg.querySelector("#beFoot");
  if (!foot) return;
  const needsSlots = _beUsesRecommendedSlot();
  const haveSlots = _beAllRecipientsHaveSlots();
  const gate = needsSlots && !haveSlots;
  foot.querySelectorAll("[data-be-act='send-now'], [data-be-act='open-schedule']").forEach(b => {
    if (gate) {
      b.setAttribute("disabled", "");
      b.setAttribute("title", "Find available times first.");
    } else {
      b.removeAttribute("disabled");
      b.removeAttribute("title");
    }
  });
}

async function _beFindSlots() {
  const total = _beState.recipients.length;
  if (!total) return;
  _beState.slotsLoading = true;
  _beState.slotsError = "";
  _beRefreshSlotPanel();

  let res;
  try {
    res = await fetch("/me/leads/bulk-email/find-slots", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_count:   total,
        window:       _beState.slotWindow,
        slot_minutes: _beState.slotMinutes,
      }),
    });
  } catch (_) {
    _beState.slotsLoading = false;
    _beState.slotsError = "network";
    _beRefreshSlotPanel();
    return;
  }
  let data = {};
  try { data = await res.json(); } catch (_) { data = {}; }
  _beState.slotsLoading = false;
  // Stash diagnostics so the user can expand them when the helper can't
  // find slots — debugging in the wild without server logs.
  _beState.slotsDiagnostics = data.diagnostics || null;

  // Capture the search window + busy blocks for the mini-calendar even when
  // the backend reports no_slots_available — the calendar still renders so
  // the user can see WHY their window came back empty (covered in busy).
  const sw = data.search_window || {};
  _beState.slotSearchStart = sw.start_iso || "";
  _beState.slotSearchEnd   = sw.end_iso   || "";
  _beState.slotCalDayOffset = 0;
  _beState.slotBusy = Array.isArray(data.busy) ? data.busy : [];
  _beState.slotTimeZone = data.time_zone || "";

  if (!res.ok) {
    _beState.slotsError = data.reason || "no_slots_available";
    _beState.slotAssignments = {};
    _beRefreshSlotPanel();
    return;
  }
  if (!data.ok) {
    _beState.slotsError = data.reason || "no_slots_available";
    _beState.slotAssignments = {};
    _beRefreshSlotPanel();
    return;
  }
  const slots = Array.isArray(data.slots) ? data.slots : [];
  // Match each slot 1:1 with a recipient, in order. If the server returned
  // fewer slots than recipients, the trailing recipients have no assignment
  // and the partial-warning surfaces.
  const assignments = {};
  for (let i = 0; i < _beState.recipients.length && i < slots.length; i++) {
    const lead = _beState.recipients[i];
    const s = slots[i] || {};
    assignments[lead.id] = {
      start_iso: s.start_iso || "",
      end_iso:   s.end_iso   || "",
      label:     s.label     || "",
      epoch:     s.epoch     || 0,
    };
  }
  _beState.slotAssignments = assignments;
  if (slots.length < _beState.recipients.length) {
    _beState.slotsError = "partial";
  } else {
    _beState.slotsError = "";
  }
  _beRefreshSlotPanel();
}

function _beRotateSlot(leadId) {
  // Circular reassignment for v1: swap this lead's slot with the next
  // lead's slot in recipient order. Phase 5 can add a per-lead picker.
  const ids = _beState.recipients.map(l => l.id);
  const idx = ids.indexOf(leadId);
  if (idx < 0) return;
  const nextIdx = (idx + 1) % ids.length;
  const a = _beState.slotAssignments[ids[idx]];
  const b = _beState.slotAssignments[ids[nextIdx]];
  if (!a && !b) return;
  _beState.slotAssignments[ids[idx]]     = b || null;
  _beState.slotAssignments[ids[nextIdx]] = a || null;
  // Drop nulls so _beAllRecipientsHaveSlots checks correctly.
  if (!_beState.slotAssignments[ids[idx]])     delete _beState.slotAssignments[ids[idx]];
  if (!_beState.slotAssignments[ids[nextIdx]]) delete _beState.slotAssignments[ids[nextIdx]];
  _beRefreshSlotPanel();
}

function _beInsertToken(token) {
  const dlg = document.getElementById("leadsBulkEmailDlg");
  const target = (_beState.lastFocused === "subject")
    ? dlg.querySelector("#beSubject")
    : dlg.querySelector("#beBodyEdit");
  if (!target) return;
  const tok = `{${token}}`;
  const start = target.selectionStart != null ? target.selectionStart : target.value.length;
  const end   = target.selectionEnd   != null ? target.selectionEnd   : target.value.length;
  const v = target.value;
  target.value = v.slice(0, start) + tok + v.slice(end);
  const pos = start + tok.length;
  target.focus();
  if (target.setSelectionRange) target.setSelectionRange(pos, pos);
  if (target.id === "beSubject") _beState.subject = target.value;
  else _beState.body = target.value;
  _beUpdatePreview();
  _beUpdateWarn();
  _beTogglePanelOnTokenChange();
}

function _beWireRecipToggle() {
  const dlg = document.getElementById("leadsBulkEmailDlg");
  if (!dlg) return;
  const btn = dlg.querySelector("[data-be-act='toggle-recip']");
  const list = dlg.querySelector("#beRecipList");
  if (!btn || !list) return;
  btn.addEventListener("click", () => {
    const open = list.style.display !== "none";
    list.style.display = open ? "none" : "block";
    btn.textContent = open ? "Show recipients ▾" : "Hide recipients ▴";
  });
}

function _beWireFooter() {
  const dlg = document.getElementById("leadsBulkEmailDlg");
  if (!dlg) return;
  dlg.querySelector("#beFoot").querySelectorAll("[data-be-act]").forEach(b => {
    b.addEventListener("click", () => _beHandleAct(b.dataset.beAct));
  });
}

function _beHandleAct(act) {
  if (act === "close")           return _beClose();
  if (act === "back-to-grid")    { _beState.view = "grid"; _beRender(); return; }
  if (act === "send-now")        return _beSendNow();
  if (act === "see-missing")     return _beShowMissingModal();
  if (act === "open-schedule")   return _beOpenSchedulePicker();
}

function _beShowMissingModal() {
  const dlg = document.getElementById("leadsBulkEmailDlg");
  if (!dlg) return;
  const valid = _beValidate();
  const ids = Object.keys(valid.missingByLead);
  const byId = new Map(_allLeads.map(l => [l.id, l]));
  const lines = ids.slice(0, 50).map(id => {
    const l = byId.get(id) || {};
    const nm = fullName(l) || l.email || id;
    const tokens = (valid.missingByLead[id] || []).join(", ");
    return `${escapeHtml(nm)} <span style="color:#9ca3af;">— missing ${escapeHtml(tokens)}</span>`;
  }).join("<br>");
  const more = ids.length > 50 ? `<br><span style="color:#6b7280;">…and ${ids.length - 50} more</span>` : "";

  const overlay = document.createElement("div");
  overlay.className = "be-mini-modal";
  overlay.innerHTML = `
    <div class="be-mini-card">
      <h3>${ids.length} lead${ids.length !== 1 ? "s" : ""} missing data</h3>
      <p>Pick how to handle these:</p>
      <div class="be-mini-list">${lines}${more}</div>
      <div class="be-mini-actions">
        <button type="button" class="be-btn-secondary" data-mini="cancel">Cancel</button>
        <button type="button" class="be-btn-secondary" data-mini="fallback">Use fallback</button>
        <button type="button" class="be-btn-primary"   data-mini="skip">Skip them</button>
      </div>
    </div>`;
  dlg.appendChild(overlay);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelector("[data-mini='cancel']").addEventListener("click", () => overlay.remove());
  overlay.querySelector("[data-mini='fallback']").addEventListener("click", () => {
    _beState.skipMissing = false;
    overlay.remove();
    _beUpdatePreview();
    _beUpdateWarn();
  });
  overlay.querySelector("[data-mini='skip']").addEventListener("click", () => {
    _beState.skipMissing = true;
    overlay.remove();
    _beUpdatePreview();
    _beUpdateWarn();
  });
}

async function _beSendNow(opts) {
  opts = opts || {};
  if (!_beState.subject.trim() || !_beState.body.trim()) {
    _showLeadsToast("Add a subject and body first.", "error");
    return;
  }
  let lead_ids = _beState.recipients.map(l => l.id);
  if (_beState.skipMissing) {
    const valid = _beValidate();
    lead_ids = lead_ids.filter(id => !valid.missingByLead[id]);
  }
  if (!lead_ids.length) {
    _showLeadsToast("No leads to send to after skipping.", "error");
    return;
  }
  _beState.view = "sending";
  _beState.lastBatch = { sent_count: 0, failed_count: 0, skipped_count: 0,
                         total_count: lead_ids.length, status: "queued" };
  _beRender();
  let res;
  try {
    res = await fetch("/me/leads/bulk-email", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_ids,
        subject:             _beState.subject,
        body:                _beState.body,
        from_connection_id:  _beState.fromConnectionId,
        fallbacks:           _beState.fallbackOverrides,
        template_id:         _beState.templateLoaded ? _beState.templateLoaded.id : null,
        send_now:            true,
        override_duplicate:  !!opts.overrideDuplicate,
        // Phase 4: per-lead calendar slot assignments (omit when empty so
        // pre-Phase-4 batches send identical payloads).
        lead_slot_assignments:
          (Object.keys(_beState.slotAssignments).length ? _beState.slotAssignments : undefined),
      }),
    });
  } catch (_) {
    _showLeadsToast("Network error.", "error");
    _beState.view = "editor";
    _beRender();
    return;
  }
  if (res.status === 409) {
    const err = await res.json().catch(() => ({}));
    _beState.view = "editor";
    _beRender();
    _beShowDuplicateConfirm(err.details || {}, () => _beSendNow({ overrideDuplicate: true }));
    return;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    _showLeadsToast(err.hint || err.error || "Couldn't start sending.", "error");
    _beState.view = "editor";
    _beRender();
    return;
  }
  const data = await res.json();
  _beState.batchId = data.batch_id;
  _beState.lastBatch.total_count = data.total_count;
  _bePollProgress();
}

// ─── Schedule picker (Phase 3) ───────────────────────────────────────────────

function _beDefaultScheduleEpoch() {
  // Tomorrow 9:00 AM in user's local timezone.
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function _beEpochToLocalDateTimeParts(epochSec) {
  const d = new Date((epochSec || _beDefaultScheduleEpoch()) * 1000);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mn = String(d.getMinutes()).padStart(2, "0");
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mn}` };
}

function _beFormatLocalEpoch(epochSec) {
  const d = new Date((epochSec || 0) * 1000);
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${days[d.getDay()]} ${_BE_MONTHS[d.getMonth()]} ${d.getDate()}, ${h}:${m} ${ampm}`;
}

function _beOpenSchedulePicker() {
  if (!_beState.subject.trim() || !_beState.body.trim()) {
    _showLeadsToast("Add a subject and body first.", "error");
    return;
  }
  const dlg = document.getElementById("leadsBulkEmailDlg");
  if (!dlg) return;
  const initEpoch = _beState.scheduledForEpoch || _beDefaultScheduleEpoch();
  const parts = _beEpochToLocalDateTimeParts(initEpoch);
  const total = _beState.recipients.length;
  const conn = _beState.connections.find(c => c.id === _beState.fromConnectionId)
             || _beState.connections[0] || {};
  const senderEmail = conn.email_address || "";
  const isEditing = !!_beState.editingScheduledId;

  const overlay = document.createElement("div");
  overlay.className = "be-mini-modal";
  overlay.id = "beSchedulePicker";
  overlay.innerHTML = `
    <div class="be-mini-card" style="max-width:420px;">
      <h3 style="margin:0 0 12px;font-size:15px;">${isEditing ? "Update schedule" : "When should we send this?"}</h3>
      <div style="display:flex;gap:10px;margin-bottom:14px;">
        <div style="flex:1;">
          <label style="display:block;font-size:12px;color:#475569;margin-bottom:4px;">Date</label>
          <input type="date" id="beSchedDate" value="${parts.date}" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;" />
        </div>
        <div style="flex:1;">
          <label style="display:block;font-size:12px;color:#475569;margin-bottom:4px;">Time</label>
          <input type="time" id="beSchedTime" value="${parts.time}" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;" />
        </div>
      </div>
      <div style="font-size:12.5px;color:#475569;line-height:1.6;margin-bottom:14px;">
        We'll send all ${total} email${total !== 1 ? "s" : ""} starting then.<br>
        Sending takes about ${total} second${total !== 1 ? "s" : ""}.<br>
        Sending from: <strong>${escapeHtml(senderEmail)}</strong>
      </div>
      <div id="beSchedError" style="display:none;color:#b91c1c;font-size:12.5px;margin-bottom:10px;"></div>
      <div class="be-mini-actions">
        <button type="button" class="be-btn-secondary" data-sched="cancel">Cancel</button>
        <button type="button" class="be-btn-primary"   data-sched="confirm">${isEditing ? "Save changes" : "Schedule it"}</button>
      </div>
    </div>`;
  dlg.appendChild(overlay);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector("[data-sched='cancel']").addEventListener("click", () => overlay.remove());
  overlay.querySelector("[data-sched='confirm']").addEventListener("click", async () => {
    const dateVal = overlay.querySelector("#beSchedDate").value;
    const timeVal = overlay.querySelector("#beSchedTime").value;
    const errEl   = overlay.querySelector("#beSchedError");
    if (!dateVal || !timeVal) {
      errEl.textContent = "Pick a date and time.";
      errEl.style.display = "block";
      return;
    }
    // Build a local Date and convert to UTC epoch.
    const local = new Date(`${dateVal}T${timeVal}:00`);
    const epoch = Math.floor(local.getTime() / 1000);
    const minFuture = Math.floor(Date.now() / 1000) + 5 * 60;
    if (epoch < minFuture) {
      errEl.textContent = "Pick a time at least 5 minutes from now.";
      errEl.style.display = "block";
      return;
    }
    overlay.remove();
    _beState.scheduledForEpoch = epoch;
    if (isEditing) {
      await _beSubmitScheduleUpdate(epoch);
    } else {
      await _beSubmitNewSchedule(epoch, { overrideDuplicate: false });
    }
  });
}

async function _beSubmitNewSchedule(epoch, opts) {
  opts = opts || {};
  let lead_ids = _beState.recipients.map(l => l.id);
  if (_beState.skipMissing) {
    const valid = _beValidate();
    lead_ids = lead_ids.filter(id => !valid.missingByLead[id]);
  }
  if (!lead_ids.length) {
    _showLeadsToast("No leads to send to after skipping.", "error");
    return;
  }
  let res;
  try {
    res = await fetch("/me/leads/bulk-email", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_ids,
        subject:             _beState.subject,
        body:                _beState.body,
        from_connection_id:  _beState.fromConnectionId,
        fallbacks:           _beState.fallbackOverrides,
        template_id:         _beState.templateLoaded ? _beState.templateLoaded.id : null,
        send_now:            false,
        scheduled_for:       epoch,
        override_duplicate:  !!opts.overrideDuplicate,
        // Phase 4: per-lead calendar slot assignments.
        lead_slot_assignments:
          (Object.keys(_beState.slotAssignments).length ? _beState.slotAssignments : undefined),
      }),
    });
  } catch (_) {
    _showLeadsToast("Network error.", "error");
    return;
  }
  if (res.status === 409) {
    const err = await res.json().catch(() => ({}));
    _beShowDuplicateConfirm(err.details || {},
      () => _beSubmitNewSchedule(epoch, { overrideDuplicate: true }));
    return;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    _showLeadsToast(err.hint || err.error || "Couldn't schedule.", "error");
    return;
  }
  _beClose();
  _showLeadsToast(`Scheduled for ${_beFormatLocalEpoch(epoch)}.`, "success");
  if (typeof _leadsRefreshHistory === "function") _leadsRefreshHistory();
}

async function _beSubmitScheduleUpdate(epoch) {
  const sid = _beState.editingScheduledId;
  if (!sid) return;
  let res;
  try {
    res = await fetch(`/me/leads/bulk-email/${encodeURIComponent(sid)}/update`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject:       _beState.subject,
        body:          _beState.body,
        scheduled_for: epoch,
        fallbacks:     _beState.fallbackOverrides,
      }),
    });
  } catch (_) {
    _showLeadsToast("Network error.", "error");
    return;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    _showLeadsToast(err.hint || err.error || "Couldn't save.", "error");
    return;
  }
  _beClose();
  _showLeadsToast(`Updated schedule for ${_beFormatLocalEpoch(epoch)}.`, "success");
  if (typeof _leadsRefreshHistory === "function") _leadsRefreshHistory();
}

function _beShowDuplicateConfirm(details, onConfirm) {
  const dlg = document.getElementById("leadsBulkEmailDlg");
  if (!dlg) return;
  const overlay = document.createElement("div");
  overlay.className = "be-mini-modal";
  const overlapPct = (details && details.overlap_pct != null) ? `${details.overlap_pct}%` : "most";
  overlay.innerHTML = `
    <div class="be-mini-card" style="max-width:420px;">
      <h3 style="margin:0 0 10px;font-size:15px;">Send the same email again?</h3>
      <p style="margin:0 0 14px;font-size:13px;color:#475569;line-height:1.5;">
        You sent or scheduled this same template to ${escapeHtml(overlapPct)} of these leads in the last hour. Send it again anyway?
      </p>
      <div class="be-mini-actions">
        <button type="button" class="be-btn-secondary" data-dup="cancel">Cancel</button>
        <button type="button" class="be-btn-primary"   data-dup="confirm">Send again</button>
      </div>
    </div>`;
  dlg.appendChild(overlay);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector("[data-dup='cancel']").addEventListener("click", () => overlay.remove());
  overlay.querySelector("[data-dup='confirm']").addEventListener("click", () => {
    overlay.remove();
    onConfirm();
  });
}

function _bePollProgress() {
  if (_beState.pollTimer) clearInterval(_beState.pollTimer);
  _beState.pollTimer = setInterval(async () => {
    if (!_beState.batchId || !_beState.open) {
      clearInterval(_beState.pollTimer);
      _beState.pollTimer = null;
      return;
    }
    try {
      const r = await fetch(`/me/leads/bulk-email/${encodeURIComponent(_beState.batchId)}`,
                            { credentials: "same-origin" });
      if (!r.ok) return;
      const d = await r.json();
      _beState.lastBatch = d;
      if (d.status === "completed" || d.status === "failed") {
        clearInterval(_beState.pollTimer);
        _beState.pollTimer = null;
        _beState.view = "done";
        _beRender();
      } else {
        _beRenderSending();
      }
    } catch (_) { /* keep polling */ }
  }, 2000);
}

function _beRenderSending() {
  const dlg = document.getElementById("leadsBulkEmailDlg");
  dlg.querySelector("#beTitle").textContent = "Sending…";
  const body = dlg.querySelector("#beBody");
  const foot = dlg.querySelector("#beFoot");
  const b = _beState.lastBatch || {};
  const total = b.total_count || 0;
  const done = (b.sent_count || 0) + (b.failed_count || 0) + (b.skipped_count || 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  body.innerHTML = `
    <div class="be-progress">
      <div style="font-size:14px;font-weight:600;color:#0a0a0a;">Sending email ${done} of ${total}…</div>
      <div class="be-progress-track"><div class="be-progress-bar" style="width:${pct}%;"></div></div>
      <div style="font-size:12.5px;color:#6b7280;">
        ${b.sent_count || 0} sent · ${b.failed_count || 0} failed · ${b.skipped_count || 0} skipped
      </div>
    </div>
  `;
  foot.innerHTML = `<button type="button" class="be-btn-secondary" data-be-act="close">Close</button>`;
  _beWireFooter();
}

function _beRenderDone() {
  const dlg = document.getElementById("leadsBulkEmailDlg");
  dlg.querySelector("#beTitle").textContent = "All done";
  const body = dlg.querySelector("#beBody");
  const foot = dlg.querySelector("#beFoot");
  const b = _beState.lastBatch || {};
  const sent = b.sent_count || 0;
  const failed = b.failed_count || 0;
  const skipped = b.skipped_count || 0;
  body.innerHTML = `
    <div style="padding:18px 0;">
      <div style="font-size:18px;font-weight:700;color:#0a0a0a;margin-bottom:6px;">${sent} sent${failed ? `, ${failed} failed` : ""}${skipped ? `, ${skipped} skipped` : ""}.</div>
      ${b.status === "failed" ? `<div style="color:#b91c1c;font-size:13px;">Send stopped early.</div>` : ""}
      ${(failed || skipped)
         ? `<div style="margin-top:10px;font-size:12.5px;color:#475569;">${failed ? `${failed} couldn't be sent — check those addresses.` : ""}${failed && skipped ? " " : ""}${skipped ? `${skipped} were skipped (missing email or unsubscribed).` : ""}</div>`
         : ""}
    </div>`;
  foot.innerHTML = `<button type="button" class="be-btn-primary" data-be-act="close">Close</button>`;
  _beWireFooter();
}

// Expose for debugging / tests.
window.openBulkEmailComposer = openBulkEmailComposer;

// ─── Email history view (Phase 3) ────────────────────────────────────────────
//
// A dedicated panel shown above the leads table that lists scheduled,
// in-flight, completed, canceled and failed bulk-email batches. Polls
// /me/leads/bulk-email/history every 30s while visible. Cancel and Edit
// actions are surfaced inline for scheduled rows; live progress updates
// for sending rows. Details modal opens via /history/<id>.

let _historyState = {
  injected: false,
  visible: true,
  timer: null,
  loading: false,
  batches: [],
  detail: null,        // { id, rec } when details modal open
};

function _leadsEnsureHistoryPanel() {
  if (_historyState.injected) return;
  const tableWrap = document.getElementById("leadsTableWrap");
  if (!tableWrap) return;
  // Insert AFTER the table wrap so the table stays the primary element.
  const panel = document.createElement("section");
  panel.id = "leadsEmailHistoryPanel";
  panel.style.cssText = "margin-top:24px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;overflow:hidden;";
  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #e5e7eb;background:#f9fafb;">
      <strong style="font-size:14px;color:#0f172a;">Email history</strong>
      <span id="lehCount" style="font-size:12px;color:#6b7280;"></span>
      <span style="margin-left:auto;display:flex;gap:8px;">
        <button type="button" id="lehRefresh" style="padding:5px 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;font-size:12px;cursor:pointer;">Refresh</button>
        <button type="button" id="lehToggle"  style="padding:5px 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;font-size:12px;cursor:pointer;">Hide</button>
      </span>
    </div>
    <div id="lehList" style="padding:8px 0;"></div>`;
  tableWrap.parentElement.insertAdjacentElement("afterend", panel);
  _historyState.injected = true;

  document.getElementById("lehRefresh").addEventListener("click", () => _leadsRefreshHistory());
  document.getElementById("lehToggle").addEventListener("click", () => {
    _historyState.visible = !_historyState.visible;
    document.getElementById("lehList").style.display = _historyState.visible ? "" : "none";
    document.getElementById("lehToggle").textContent = _historyState.visible ? "Hide" : "Show";
    if (_historyState.visible) {
      _leadsRefreshHistory();
      _leadsStartHistoryPolling();
    } else {
      _leadsStopHistoryPolling();
    }
  });
}

function _leadsStartHistoryPolling() {
  _leadsStopHistoryPolling();
  _historyState.timer = setInterval(() => {
    if (!_historyState.visible) return;
    _leadsRefreshHistory();
  }, 30000);
}

function _leadsStopHistoryPolling() {
  if (_historyState.timer) {
    clearInterval(_historyState.timer);
    _historyState.timer = null;
  }
}

async function _leadsRefreshHistory() {
  if (_historyState.loading) return;
  _historyState.loading = true;
  try {
    const res = await fetch("/me/leads/bulk-email/history", { credentials: "same-origin" });
    if (!res.ok) {
      _historyState.batches = [];
    } else {
      const data = await res.json();
      _historyState.batches = data.batches || [];
    }
  } catch (_) {
    _historyState.batches = [];
  } finally {
    _historyState.loading = false;
  }
  _leadsRenderHistory();
}

function _leadsHistoryStatusLabel(b) {
  const s = b.status || "";
  if (s === "scheduled") return `Scheduled ${_beFormatLocalEpoch(b.scheduled_for || 0)}`;
  if (s === "sending")   return `Sending ${b.sent_count || 0} of ${b.total_count || 0}…`;
  if (s === "completed") {
    const ts = b.completed_at || b.created_at || 0;
    const sent = b.sent_count || 0;
    const failed = b.failed_count || 0;
    const skipped = b.skipped_count || 0;
    const extras = [];
    if (failed)  extras.push(`${failed} failed`);
    if (skipped) extras.push(`${skipped} skipped`);
    return `${sent} sent${extras.length ? ", " + extras.join(", ") : ""} · ${_beFormatLocalEpoch(ts)}`;
  }
  if (s === "canceled")  return `Canceled · ${_beFormatLocalEpoch(b.created_at || 0)}`;
  if (s === "failed")    return `Failed · ${_beFormatLocalEpoch(b.completed_at || b.created_at || 0)}`;
  if (s === "queued")    return `Starting…`;
  return s || "—";
}

function _leadsHistoryActions(b) {
  const id = b.id || "";
  const s = b.status || "";
  const parts = [];
  if (s === "scheduled") {
    parts.push(`<button type="button" class="leh-act" data-leh-edit="${escapeHtml(id)}"   style="padding:5px 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;font-size:12px;cursor:pointer;">Edit</button>`);
    parts.push(`<button type="button" class="leh-act" data-leh-cancel="${escapeHtml(id)}" style="padding:5px 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;color:#b91c1c;font-size:12px;cursor:pointer;">Cancel</button>`);
  }
  parts.push(`<button type="button" class="leh-act" data-leh-detail="${escapeHtml(id)}" style="padding:5px 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;font-size:12px;cursor:pointer;">See details</button>`);
  return parts.join(" ");
}

function _leadsTemplateLabel(tplId) {
  if (!tplId) return "Custom email";
  const map = {
    quote_followup:        "Quote follow-up",
    reschedule_reminder:   "Reschedule reminder",
    winback:               "Win-back",
    review_request:        "Review request",
    first_hello:           "First hello",
    appointment_reminder:  "Appointment reminder",
    thank_you_after_job:   "Thank you after job",
    blank:                 "Custom email",
  };
  return map[tplId] || tplId;
}

function _leadsRenderHistory() {
  const list = document.getElementById("lehList");
  const countEl = document.getElementById("lehCount");
  if (!list) return;
  const batches = _historyState.batches || [];
  if (countEl) countEl.textContent = batches.length ? `· ${batches.length} recent` : "";
  if (!batches.length) {
    list.innerHTML = `<div style="padding:18px 16px;font-size:13px;color:#6b7280;">No bulk emails sent yet.</div>`;
    return;
  }
  list.innerHTML = batches.map(b => {
    const tpl = _leadsTemplateLabel(b.template_id);
    const total = b.total_count || 0;
    const subj = b.subject_template || "";
    const status = _leadsHistoryStatusLabel(b);
    const error = (b.status === "failed" && b.error_message) ? `<div style="margin-top:4px;font-size:12px;color:#b91c1c;">${escapeHtml(b.error_message)}</div>` : "";
    return `
      <div style="display:flex;align-items:flex-start;gap:14px;padding:10px 16px;border-bottom:1px solid #f1f5f9;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:13.5px;color:#0f172a;font-weight:600;">${escapeHtml(tpl)} <span style="font-weight:400;color:#6b7280;">· ${total} lead${total !== 1 ? "s" : ""}</span></div>
          <div style="margin-top:2px;font-size:12.5px;color:#475569;">${escapeHtml(status)}</div>
          ${subj ? `<div style="margin-top:2px;font-size:12px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:560px;">${escapeHtml(subj)}</div>` : ""}
          ${error}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          ${_leadsHistoryActions(b)}
        </div>
      </div>`;
  }).join("");
  list.querySelectorAll("[data-leh-detail]").forEach(b =>
    b.addEventListener("click", () => _leadsHistoryShowDetail(b.getAttribute("data-leh-detail"))));
  list.querySelectorAll("[data-leh-cancel]").forEach(b =>
    b.addEventListener("click", () => _leadsHistoryCancel(b.getAttribute("data-leh-cancel"))));
  list.querySelectorAll("[data-leh-edit]").forEach(b =>
    b.addEventListener("click", () => _leadsHistoryEdit(b.getAttribute("data-leh-edit"))));
}

async function _leadsHistoryShowDetail(sendId) {
  if (!sendId) return;
  let rec;
  try {
    const res = await fetch(`/me/leads/bulk-email/history/${encodeURIComponent(sendId)}`,
                            { credentials: "same-origin" });
    if (!res.ok) {
      _showLeadsToast("Couldn't load details.", "error");
      return;
    }
    rec = await res.json();
  } catch (_) {
    _showLeadsToast("Network error.", "error");
    return;
  }
  // Build a modal directly in the document body — independent of composer dlg.
  let modal = document.getElementById("lehDetailModal");
  if (modal) modal.remove();
  modal = document.createElement("div");
  modal.id = "lehDetailModal";
  modal.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,0.4);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;";
  const tpl = _leadsTemplateLabel(rec.template_id);
  const sent = rec.sent_count || 0;
  const failed = rec.failed_count || 0;
  const skipped = rec.skipped_count || 0;
  const total = rec.total_count || 0;
  const status = _leadsHistoryStatusLabel({
    status: rec.status, scheduled_for: rec.scheduled_for,
    sent_count: sent, total_count: total,
    completed_at: rec.completed_at, created_at: rec.created_at,
    failed_count: failed, skipped_count: skipped,
  });
  const subj = rec.subject_template || "";
  const body = rec.body_template || "";
  const results = rec.lead_results || [];
  const byId = new Map((window._allLeads || []).map(l => [l.id, l]));
  // Use _allLeads if exposed; otherwise fall back to id-only.
  const allLeads = (typeof _allLeads !== "undefined") ? _allLeads : [];
  const lookup = new Map(allLeads.map(l => [l.id, l]));
  const rows = results.slice(0, 200).map(r => {
    const lead = lookup.get(r.lead_id) || {};
    const nm = (typeof fullName === "function" ? fullName(lead) : "") || lead.email || r.lead_id;
    let badge;
    if (r.status === "sent")     badge = `<span style="color:#15803d;">sent</span>`;
    else if (r.status === "failed")  badge = `<span style="color:#b91c1c;">failed</span>`;
    else if (r.status === "skipped") badge = `<span style="color:#6b7280;">skipped (${escapeHtml(r.reason || "n/a")})</span>`;
    else badge = `<span style="color:#6b7280;">${escapeHtml(r.status || "—")}</span>`;
    const why = r.error ? ` <span style="color:#9ca3af;">— ${escapeHtml(r.error)}</span>` : "";
    return `<tr><td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;">${escapeHtml(nm)}</td><td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:12px;">${badge}${why}</td></tr>`;
  }).join("");
  const more = results.length > 200 ? `<div style="padding:8px;color:#6b7280;font-size:12px;">…and ${results.length - 200} more</div>` : "";
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;max-width:680px;width:100%;max-height:85vh;overflow:hidden;display:flex;flex-direction:column;">
      <div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid #e5e7eb;">
        <strong style="font-size:15px;">${escapeHtml(tpl)}</strong>
        <span style="margin-left:auto;color:#6b7280;font-size:12px;">${escapeHtml(status)}</span>
        <button type="button" id="lehDetailClose" style="margin-left:8px;background:transparent;border:0;font-size:18px;cursor:pointer;color:#6b7280;">×</button>
      </div>
      <div style="padding:14px 18px;overflow:auto;">
        <div style="font-size:12px;color:#475569;margin-bottom:4px;">Subject</div>
        <div style="font-size:13.5px;color:#0f172a;margin-bottom:14px;">${escapeHtml(subj || "(no subject)")}</div>
        <div style="font-size:12px;color:#475569;margin-bottom:4px;">Body</div>
        <pre style="font-family:inherit;white-space:pre-wrap;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;font-size:13px;color:#0f172a;margin:0 0 14px;max-height:220px;overflow:auto;">${escapeHtml(body || "(empty)")}</pre>
        <div style="font-size:12px;color:#475569;margin-bottom:6px;">Per-lead results — ${sent} sent, ${failed} failed, ${skipped} skipped</div>
        <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
          <thead><tr><th style="text-align:left;padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#475569;font-weight:500;">Lead</th><th style="text-align:left;padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#475569;font-weight:500;">Status</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="2" style="padding:14px 8px;color:#9ca3af;">No per-lead results yet.</td></tr>`}</tbody>
        </table>
        ${more}
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
  modal.querySelector("#lehDetailClose").addEventListener("click", () => modal.remove());
}

async function _leadsHistoryCancel(sendId) {
  if (!sendId) return;
  if (!window.confirm("Cancel this scheduled email?")) return;
  let res;
  try {
    res = await fetch(`/me/leads/bulk-email/${encodeURIComponent(sendId)}/cancel`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
    });
  } catch (_) {
    _showLeadsToast("Network error.", "error");
    return;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    _showLeadsToast(err.error || "Couldn't cancel.", "error");
    return;
  }
  _showLeadsToast("Canceled.", "success");
  _leadsRefreshHistory();
}

async function _leadsHistoryEdit(sendId) {
  if (!sendId) return;
  let rec;
  try {
    const res = await fetch(`/me/leads/bulk-email/history/${encodeURIComponent(sendId)}`,
                            { credentials: "same-origin" });
    if (!res.ok) {
      _showLeadsToast("Couldn't load that scheduled email.", "error");
      return;
    }
    rec = await res.json();
  } catch (_) {
    _showLeadsToast("Network error.", "error");
    return;
  }
  if ((rec.status || "") !== "scheduled") {
    _showLeadsToast("This batch already started — it can't be edited.", "info");
    return;
  }
  // Pre-load selection from the snapshot lead_ids so the composer's
  // recipient list shows the same set the user originally picked.
  const ids = rec.lead_ids || [];
  if (typeof _selectedIds !== "undefined") {
    _selectedIds.clear();
    for (const id of ids) _selectedIds.add(id);
  }
  // Open composer in editor view directly with the existing values.
  await openBulkEmailComposer({ openSchedulePicker: false });
  _beState.subject = rec.subject_template || "";
  _beState.body = rec.body_template || "";
  _beState.fallbackOverrides = rec.fallbacks || {};
  _beState.editingScheduledId = rec.id || "";
  _beState.scheduledForEpoch = rec.scheduled_for || 0;
  if (rec.template_id) {
    _beState.templateLoaded = (_beState.templates || []).find(t => t.id === rec.template_id) || null;
  }
  if (rec.from_connection_id) _beState.fromConnectionId = rec.from_connection_id;
  _beState.view = "editor";
  _beRender();
}

// ─── Module init ─────────────────────────────────────────────────────────────

let _initialized = false;

export function init() {
  if (_initialized) return;
  _initialized = true;
  attachEventHandlers();
  initCsvImport();
  _wireImportedBack();
  // Inject the email history panel and start polling. The panel hides
  // itself if the table view isn't currently visible (Funnel/Board don't
  // need it cluttering the screen) — for v1 we keep it visible and let
  // the user toggle.
  setTimeout(() => {
    _leadsEnsureHistoryPanel();
    _leadsRefreshHistory();
    _leadsStartHistoryPolling();
  }, 0);
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
