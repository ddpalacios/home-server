// web/src/routes/activity.js
//
// Home/Activity route: dashboard KPI tiles, pipeline funnel, services
// breakdown, stacked-bar trend chart, TODOs panel, all-leads table,
// and phone activity stats.
//
// Loaded lazily via window.__dashboardLoadRouteModule("activity").
//
// What lives here:
//   - loadActivitySection()  — top-level entry point, exposed on window
//   - load()                 — fetches /me/pipeline, /me/pipeline/leads,
//                              /me/home/todos; renders everything
//   - loadPhoneActivity()    — fetches /me/insights/phone-activity
//   - render()               — KPI tiles, funnel, conversion rates,
//                              services breakdown, stacked-bar Chart.js
//   - renderTodos()          — TODOs panel + snooze handler
//   - renderTable()          — all-leads paginated table + sort + CSV export
//   - .home-chip click handler
//   - "View on Pipeline" + "See all leads" deep-links
//   - accountIdReady listener
//   - nav-btn click → invalidate + reload
//
// What stays inline:
//   - SECTION_ON_ENTER.activity shim (delegates to window.loadActivitySection)

// ─── Stage metadata ──────────────────────────────────────────────────────────

const STAGE_LABEL = {
  new: "New", contacted: "Contacted", engaged: "Engaged",
  quoted: "Quoted", scheduled: "Scheduled", won: "Won", lost: "Lost",
};
const FUNNEL_ORDER = ["new","contacted","engaged","quoted","scheduled","won","lost"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g,
    c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}

function fmtDateTime(ts) {
  if (!ts) return "";
  return new Date(ts*1000).toLocaleString(undefined,
    { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const PALETTE = [
  "#E57373","#F06292","#BA68C8","#9575CD","#7986CB","#64B5F6",
  "#4FC3F7","#4DD0E1","#4DB6AC","#81C784","#AED581","#DCE775",
  "#FFD54F","#FFB74D","#FF8A65","#A1887F","#90A4AE","#B39DDB",
  "#80CBC4","#C5E1A5","#FFE082","#FFCC80","#BCAAA4","#B0BEC5",
];
function colorFor(seed) {
  const s = String(seed || "x");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}
function relTime(ts) {
  if (!ts) return "—";
  const d = Math.max(0, Date.now()/1000 - ts);
  if (d < 60) return Math.round(d) + "s";
  if (d < 3600) return Math.floor(d/60) + "m";
  if (d < 86400) return Math.floor(d/3600) + "h";
  if (d < 86400*7) return Math.floor(d/86400) + "d";
  return new Date(ts*1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ─── DOM refs ────────────────────────────────────────────────────────────────

const sec = () => document.querySelector('[data-route-section="activity"]');
const statsEl       = document.getElementById("actPipelineStats");
const funnelEl      = document.getElementById("actPipelineFunnel");
const convEl        = document.getElementById("actPipelineConv");
const tableHeadEl   = document.getElementById("actLeadTableHead");
const tableBodyEl   = document.getElementById("actLeadTableBody");
const tableSummaryEl = document.getElementById("actTableSummary");
const tablePrevEl   = document.getElementById("actTablePrev");
const tableNextEl   = document.getElementById("actTableNext");
const tableExportEl = document.getElementById("actExportCsv");

// ─── State ───────────────────────────────────────────────────────────────────

let lastLoadedAt = 0;
let leads = [];
let sort = { key: "stage_changed_at", dir: "desc" };
let pageIdx = 0;
const PAGE_SIZE = 5;

// ─── Date-range chip handler ─────────────────────────────────────────────────

const HOME_CHIPS = document.querySelectorAll(".home-chip");
let homeRange = localStorage.getItem("home.range") || "30d";
HOME_CHIPS.forEach(btn => {
  btn.classList.toggle("is-active", btn.dataset.range === homeRange);
  btn.addEventListener("click", () => {
    homeRange = btn.dataset.range;
    localStorage.setItem("home.range", homeRange);
    HOME_CHIPS.forEach(b => b.classList.toggle("is-active", b === btn));
    load();
  });
});

// ─── Data loaders ────────────────────────────────────────────────────────────

async function load() {
  if (!statsEl || !funnelEl) return;
  try {
    const [pipeRes, leadsRes] = await Promise.all([
      fetch("/me/pipeline?range=" + encodeURIComponent(homeRange), { credentials: "same-origin" }),
      fetch("/me/pipeline/leads?date_range=90&limit=1000", { credentials: "same-origin" }),
    ]);
    if (pipeRes.ok) {
      const data = await pipeRes.json();
      render(data);
    }
    if (leadsRes.ok) {
      const ld = await leadsRes.json();
      leads = ld.leads || [];
      renderTable();
    }
    lastLoadedAt = Date.now();
  } catch (_) {}
  try {
    const todosRes = await fetch(
      "/me/home/todos?range=" + encodeURIComponent(homeRange),
      { credentials: "same-origin" });
    if (todosRes.ok) renderTodos(await todosRes.json());
  } catch (_) {}
}

// ─── TODOs panel ─────────────────────────────────────────────────────────────

function renderTodos(data) {
  const list = document.getElementById("homeTodosList");
  const more = document.getElementById("homeTodosMore");
  if (!list) return;
  const todos = data.todos || [];
  list.innerHTML = todos.map(t => `
    <div class="todo-row" data-lead="${esc(t.lead_id)}" data-rule="${esc(t.rule_id)}">
      <div class="todo-msg"><span class="todo-name">${esc(t.lead_name)}</span> — ${esc(t.message)}</div>
      <button class="todo-action" data-route="${esc(t.action_route)}">${esc(t.action_label)}</button>
      <button class="todo-snooze" aria-label="Snooze 7 days">×</button>
    </div>`).join("") || `<div style="color:#71717a;font-size:12px;">Nothing to push right now.</div>`;
  if (more) {
    more.hidden = !data.more_count;
    more.textContent = data.more_count ? `+${data.more_count} more not shown` : "";
  }

  list.querySelectorAll(".todo-action").forEach(btn => {
    btn.addEventListener("click", () => {
      const r = btn.dataset.route || "";
      const hash = r.split("#")[1] || "";
      if (hash) window.location.hash = hash;
    });
  });
  list.querySelectorAll(".todo-snooze").forEach(btn => {
    btn.addEventListener("click", async () => {
      const row = btn.closest(".todo-row");
      const lead_id = row.dataset.lead;
      const rule_id = row.dataset.rule;
      row.style.opacity = "0.4";
      try {
        const res = await fetch("/me/home/todos/snooze", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lead_id, rule_id }),
        });
        if (res.ok) row.remove();
        else row.style.opacity = "";
      } catch (_) { row.style.opacity = ""; }
    });
  });
}

// ─── Pipeline render (KPI tiles, funnel, services, stacked-bar chart) ────────

function render(data) {
  const counts = data.counts || {};
  const hm = data.header_metrics || {};
  const cr = data.conversion_rates || {};
  const fmt$ = n => "$" + (n || 0).toLocaleString("en-US");
  statsEl.innerHTML = `
    <div class="pl-stat" data-stat="leads">
      <div class="pl-stat-label">Total leads</div>
      <div class="pl-stat-num">${hm.leads_total || 0}</div>
      <div class="pl-stat-sub">${hm.leads_captured || 0} captured · ${hm.leads_imported || 0} imported</div>
    </div>
    <div class="pl-stat" data-stat="phone">
      <div class="pl-stat-label">Phone</div>
      <div class="pl-stat-num">${hm.leads_phone || 0}</div>
      <div class="pl-stat-sub">From phone calls</div>
    </div>
    <div class="pl-stat" data-stat="web">
      <div class="pl-stat-label">Website</div>
      <div class="pl-stat-num">${hm.leads_web || 0}</div>
      <div class="pl-stat-sub">From the chat widget</div>
    </div>
    <div class="pl-stat" data-stat="imported">
      <div class="pl-stat-label">Imported</div>
      <div class="pl-stat-num">${hm.leads_imported || 0}</div>
      <div class="pl-stat-sub">From CSV uploads</div>
    </div>
    <div class="pl-stat" data-stat="they-owe">
      <div class="pl-stat-label">They owe you</div>
      <div class="pl-stat-num">${hm.awaiting_their_reply || 0}</div>
      <div class="pl-stat-sub">No reply from them yet</div>
    </div>
    <div class="pl-stat" data-stat="you-owe">
      <div class="pl-stat-label">You owe them</div>
      <div class="pl-stat-num">${hm.awaiting_your_reply || 0}</div>
      <div class="pl-stat-sub">Their last message is unanswered</div>
    </div>
    <div class="pl-stat" data-stat="predicted">
      <div class="pl-stat-label">Predicted revenue</div>
      <div class="pl-stat-num">${fmt$(hm.revenue_predicted_usd)}</div>
      <div class="pl-stat-sub">Open pipeline × avg job</div>
    </div>
    <div class="pl-stat" data-stat="actual">
      <div class="pl-stat-label">Actual revenue</div>
      <div class="pl-stat-num">${fmt$(hm.revenue_actual_usd)}</div>
      <div class="pl-stat-sub">Won × avg job</div>
    </div>
  `;
  const STAT_ROUTES = {
    "leads":     "leads",
    "phone":     "leads",
    "web":       "leads",
    "imported":  "leads",
    "they-owe":  "replies",
    "you-owe":   "replies",
    "predicted": null,
    "actual":    null,
  };
  statsEl.querySelectorAll("[data-stat]").forEach(card => {
    const route = STAT_ROUTES[card.dataset.stat];
    if (!route) return;
    card.style.cursor = "pointer";
    card.addEventListener("click", () => {
      if (typeof appShowRoute === "function") appShowRoute(route);
    });
  });
  // Funnel row
  funnelEl.innerHTML = FUNNEL_ORDER.map((s, idx) => {
    const isLost = s === "lost";
    const arrow = (idx > 0 && !isLost) ? `<div class="pl-stage-arrow">›</div>` : "";
    return `${arrow}<div class="pl-stage-card" data-stage="${s}" data-terminal="${isLost ? "true" : "false"}">
      <span class="pl-stage-name">${esc(STAGE_LABEL[s])}</span>
      <span class="pl-stage-count">${counts[s] || 0}</span>
    </div>`;
  }).join("");
  funnelEl.querySelectorAll("[data-stage]").forEach(el => {
    el.addEventListener("click", () => {
      if (typeof appShowRoute === "function") appShowRoute("pipeline");
    });
  });
  if (convEl) {
    convEl.innerHTML = `
      <span><strong>${(cr.reply_rate||0).toFixed(0)}%</strong> reply rate</span>
      <span><strong>${(cr.engaged_to_quoted||0).toFixed(0)}%</strong> engaged → quoted</span>
      <span><strong>${(cr.quoted_to_scheduled||0).toFixed(0)}%</strong> quoted → scheduled</span>
      <span><strong>${(cr.scheduled_to_won||0).toFixed(0)}%</strong> scheduled → won</span>
    `;
  }
  // Services breakdown
  const svcEl = document.getElementById("homeServicesList");
  if (svcEl) {
    const svcRows = (hm.services_breakdown || []);
    const max = Math.max(1, ...svcRows.map(r => r.count));
    svcEl.innerHTML = svcRows.map(r => `
      <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;font-size:12px;">
        <div>
          <div style="font-weight:500;color:#0a0a0a;">${esc(r.service_type)}</div>
          <div style="height:4px;background:#e5e7eb;border-radius:2px;margin-top:4px;">
            <div style="height:100%;background:#185FA5;border-radius:2px;width:${(r.count / max * 100).toFixed(0)}%;"></div>
          </div>
        </div>
        <div style="color:#71717a;">${r.count}</div>
      </div>`).join("") || `<div style="color:#71717a;font-size:12px;">No services yet.</div>`;
  }

  // Stacked-bar Chart.js trend chart
  const STAGES = ["new","contacted","engaged","quoted","scheduled","won","lost"];
  const STAGE_COLORS = {
    new: "#cbd5e1", contacted: "#93c5fd", engaged: "#60a5fa",
    quoted: "#3b82f6", scheduled: "#22c55e", won: "#15803d", lost: "#fca5a5",
  };
  const trend = data.trend || [];
  const homeChartCanvas = document.getElementById("homeStatusChart");
  const homeChartEmpty = document.getElementById("homeStatusChartEmpty");
  if (window._homeStatusChart) window._homeStatusChart.destroy();
  const homeLabels = trend.map(t => t.date);
  const homeDatasets = STAGES.map(s => ({
    label: s, data: trend.map(t => t[s] || 0), backgroundColor: STAGE_COLORS[s],
    stack: "stack-1", borderWidth: 0,
  }));
  const homeTotal = trend.reduce((a, t) => a + STAGES.reduce((b, s) => b + (t[s] || 0), 0), 0);
  if (homeChartEmpty) homeChartEmpty.hidden = homeTotal > 0;
  if (homeChartCanvas) homeChartCanvas.style.display = homeTotal > 0 ? "" : "none";
  if (homeTotal > 0 && homeChartCanvas && typeof Chart !== "undefined") {
    window._homeStatusChart = new Chart(homeChartCanvas, {
      type: "bar",
      data: { labels: homeLabels, datasets: homeDatasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
        plugins: { legend: { position: "bottom" } },
      },
    });
  }
}

// ─── All-leads table ──────────────────────────────────────────────────────────

function renderTable() {
  if (!tableHeadEl || !tableBodyEl) return;
  const cols = [
    { key: "first_name",        label: "Name" },
    { key: "contact",           label: "Contact",       sortable: false },
    { key: "source",            label: "Source" },
    { key: "stage",             label: "Stage" },
    { key: "last_touch_at",     label: "Last touch" },
    { key: "days_in_stage",     label: "Days in stage" },
    { key: "campaign_name",     label: "Campaign",      sortable: false },
    { key: "stage_value_cents", label: "Value" },
  ];
  tableHeadEl.innerHTML = cols.map(c => {
    const arrow = (sort.key === c.key)
      ? (sort.dir === "desc" ? " ↓" : " ↑")
      : "";
    const sortable = c.sortable !== false;
    return `<th data-col="${c.key}" class="${sortable ? "is-sortable" : ""}">${esc(c.label)}${arrow}</th>`;
  }).join("");
  tableHeadEl.querySelectorAll(".is-sortable").forEach(th => {
    th.addEventListener("click", () => {
      const k = th.dataset.col;
      if (sort.key === k) sort.dir = sort.dir === "desc" ? "asc" : "desc";
      else { sort.key = k; sort.dir = "desc"; }
      pageIdx = 0;
      renderTable();
    });
  });
  const sorted = _sortedLeads();
  if (!sorted.length) {
    tableBodyEl.innerHTML = `<tr><td colspan="8"><div style="padding:18px;text-align:center;color:#94a3b8;font-size:13px;">No leads in the last 90 days yet.</div></td></tr>`;
    if (tableSummaryEl) tableSummaryEl.textContent = "No leads.";
    if (tablePrevEl) tablePrevEl.disabled = true;
    if (tableNextEl) tableNextEl.disabled = true;
    return;
  }
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  if (pageIdx >= totalPages) pageIdx = totalPages - 1;
  if (pageIdx < 0) pageIdx = 0;
  const start = pageIdx * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, sorted.length);
  const visible = sorted.slice(start, end);
  if (tableSummaryEl) {
    tableSummaryEl.textContent = `Showing ${start + 1}–${end} of ${sorted.length}`;
  }
  if (tablePrevEl) tablePrevEl.disabled = (pageIdx === 0);
  if (tableNextEl) tableNextEl.disabled = (end >= sorted.length);
  tableBodyEl.innerHTML = visible.map(r => {
    const display = (((r.first_name || "") + " " + (r.last_name || "")).trim()
      || r.email || r.phone || "Lead");
    const dot = colorFor(r.id);
    const value = r.stage_value_cents ? `$${(r.stage_value_cents / 100).toLocaleString()}` : "—";
    const stage = r.stage || "new";
    return `<tr data-lead-id="${esc(r.id)}">
      <td><span class="pl-table-name"><span class="dot" style="background:${dot}"></span>${esc(display)}</span></td>
      <td><div>${esc(r.email || "")}</div><div class="pl-table-cell-sub">${esc(r.phone || "")}</div></td>
      <td>${esc((r.source || "").replace(/_/g, " "))}</td>
      <td><span class="pl-stage-pill" data-stage="${esc(stage)}">${esc(STAGE_LABEL[stage] || stage)}</span></td>
      <td>${esc(relTime(r.last_touch_at))}</td>
      <td>${r.days_in_stage}</td>
      <td>${esc(r.campaign_name || "—")}</td>
      <td>${value}</td>
    </tr>`;
  }).join("");
  tableBodyEl.querySelectorAll("tr[data-lead-id]").forEach(row => {
    row.addEventListener("click", () => {
      const id = row.dataset.leadId;
      const lead = leads.find(l => l.id === id) || null;
      if (typeof window.openLeadDetailModal === "function") {
        window.openLeadDetailModal(id, lead);
      }
    });
    row.style.cursor = "pointer";
  });
}

function _sortedLeads() {
  return leads.slice().sort((a, b) => {
    const ka = a[sort.key], kb = b[sort.key];
    const av = (typeof ka === "string") ? ka.toLowerCase() : (ka || 0);
    const bv = (typeof kb === "string") ? kb.toLowerCase() : (kb || 0);
    if (av < bv) return sort.dir === "desc" ? 1 : -1;
    if (av > bv) return sort.dir === "desc" ? -1 : 1;
    return 0;
  });
}

// Page nav + export wiring
if (tablePrevEl) tablePrevEl.addEventListener("click", () => {
  if (pageIdx > 0) { pageIdx -= 1; renderTable(); }
});
if (tableNextEl) tableNextEl.addEventListener("click", () => {
  const total = leads.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pageIdx < totalPages - 1) { pageIdx += 1; renderTable(); }
});
if (tableExportEl) tableExportEl.addEventListener("click", () => {
  const sorted = _sortedLeads();
  if (!sorted.length) return;
  const cols = ["first_name", "last_name", "email", "phone",
                "source", "stage", "days_in_stage",
                "campaign_name", "last_touch_at", "stage_value_cents"];
  const csvLines = [cols.join(",")];
  for (const r of sorted) {
    csvLines.push(cols.map(c => {
      let v = r[c];
      if (c === "last_touch_at" && v) v = new Date(v * 1000).toISOString();
      if (c === "stage_value_cents" && v) v = (v / 100).toFixed(2);
      if (v == null) v = "";
      v = String(v).replace(/"/g, '""');
      return /[,"\n]/.test(v) ? `"${v}"` : v;
    }).join(","));
  }
  const csv = csvLines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ─── Phone activity ───────────────────────────────────────────────────────────

let phoneLoadedAt = 0;
async function loadPhoneActivity() {
  const statsWrap  = document.getElementById("phoneActivityStats");
  const recentWrap = document.getElementById("phoneActivityRecent");
  if (!statsWrap || !recentWrap) return;
  try {
    const res = await fetch("/me/insights/phone-activity", { credentials: "same-origin" });
    if (!res.ok) return;
    const data = await res.json();
    const calls = (data && data.calls) || {};
    const setStat = (key, val) => {
      const el = statsWrap.querySelector(`[data-pa-stat="${key}"] .phone-stat-num`);
      if (el) el.textContent = val;
    };
    const fmtSecs = (s) => {
      const n = Number(s) || 0;
      if (n < 60) return Math.round(n) + "s";
      const m = Math.floor(n / 60);
      const r = Math.round(n % 60);
      return r ? `${m}m ${r}s` : `${m}m`;
    };
    setStat("week",     String(calls.last_7_days || 0));
    setStat("avg",      calls.avg_seconds ? fmtSecs(calls.avg_seconds) : "—");
    setStat("captured", String(calls.leads_captured || 0));
    setStat("booked",   String(calls.appointments_booked || 0));
    const recent = Array.isArray(calls.recent) ? calls.recent : [];
    if (!recent.length) {
      recentWrap.innerHTML = `<div class="phone-recent-empty">No calls yet.</div>`;
    } else {
      recentWrap.innerHTML = recent.slice(0, 8).map(c => {
        const name    = (c.from || c.caller_name || "Unknown").toString().trim() || "Unknown";
        const summary = (c.summary || "").trim();
        const dur     = c.duration_sec ? fmtSecs(c.duration_sec) : "";
        const when    = c.started_at ? relTime(c.started_at) : "";
        const leadId  = c.lead_id || "";
        return `<div class="phone-recent-row" data-call-lead="${esc(leadId)}">
          <div class="pr-name">${esc(name)}</div>
          <div class="pr-summary">${esc(summary || "(no summary)")}</div>
          <div class="pr-dur">${esc(dur)}</div>
          <div class="pr-when">${esc(when)}</div>
        </div>`;
      }).join("");
      recentWrap.querySelectorAll("[data-call-lead]").forEach(row => {
        row.addEventListener("click", () => {
          const lid = row.getAttribute("data-call-lead");
          if (lid && typeof window.openLeadDetail === "function") {
            window.openLeadDetail(lid);
          }
        });
      });
    }
    phoneLoadedAt = Date.now();
  } catch (_) {}
}

// ─── Deep-links ───────────────────────────────────────────────────────────────

document.querySelectorAll("[data-go-pipeline]").forEach(a =>
  a.addEventListener("click", (e) => {
    e.preventDefault();
    if (typeof appShowRoute === "function") appShowRoute("pipeline");
  }));
document.querySelectorAll("[data-go-leads]").forEach(a =>
  a.addEventListener("click", (e) => {
    e.preventDefault();
    if (typeof appShowRoute === "function") appShowRoute("leads");
  }));

// ─── accountIdReady listener ──────────────────────────────────────────────────

window.addEventListener("accountIdReady", () => {
  load();
  loadPhoneActivity();
});

// ─── Nav-btn click → invalidate + reload ─────────────────────────────────────

document.querySelectorAll('.app-nav-btn[data-route="activity"]').forEach(btn =>
  btn.addEventListener("click", () => setTimeout(() => {
    if (typeof window.invalidateSection === "function") window.invalidateSection("activity");
    if (typeof window._runSectionLoader === "function") window._runSectionLoader("activity");
  }, 80)));

// ─── Module lifecycle ─────────────────────────────────────────────────────────

let _initialized = false;

export function init() {
  // init() is called by __dashboardLoadRouteModule after the module loads.
  // For activity, loadActivitySection() is the entry point — init() is a
  // no-op kept for API consistency.
  _initialized = true;
}

// ─── Expose globals ───────────────────────────────────────────────────────────

// loadActivitySection() is the public entry point. SECTION_ON_ENTER.activity
// (in the inline JS) is updated to lazy-load this bundle and call it.
window.loadActivitySection = function loadActivitySection() {
  load();
  loadPhoneActivity();
};

// Also keep the legacy names so any other inline code referencing them works.
window._activityLoad      = load;
window._activityLoadPhone = loadPhoneActivity;
