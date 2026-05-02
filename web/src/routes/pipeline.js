// web/src/routes/pipeline.js
//
// Pipeline route: funnel + kanban board + table view.
// Loaded lazily via window.__dashboardLoadRouteModule.

const PALETTE = [
  "#E57373","#F06292","#BA68C8","#9575CD","#7986CB","#64B5F6",
  "#4FC3F7","#4DD0E1","#4DB6AC","#81C784","#AED581","#DCE775",
  "#FFD54F","#FFB74D","#FF8A65","#A1887F","#90A4AE","#B39DDB",
  "#80CBC4","#C5E1A5","#FFE082","#FFCC80","#BCAAA4","#B0BEC5",
];
const STAGE_COLORS = {
  new: "#888780", contacted: "#378ADD", engaged: "#7F77DD",
  quoted: "#BA7517", scheduled: "#1D9E75", won: "#639922", lost: "#A32D2D",
};
const STAGE_LABEL = {
  new: "New", contacted: "Contacted", engaged: "Engaged",
  quoted: "Quoted", scheduled: "Scheduled", won: "Won", lost: "Lost",
};
const VISIBLE_STAGES = ["new","contacted","engaged","quoted","scheduled","won"];
const ALL_STAGES = [...VISIBLE_STAGES, "lost"];
const FUNNEL_ORDER = ["new","contacted","engaged","quoted","scheduled","won","lost"];

function colorFor(seed) {
  const s = String(seed || "x");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}
function escHtml(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function relTime(ts) {
  if (!ts) return "";
  const d = Math.max(0, Date.now()/1000 - ts);
  if (d < 60) return Math.round(d) + "s";
  if (d < 3600) return Math.floor(d/60) + "m";
  if (d < 86400) return Math.floor(d/3600) + "h";
  if (d < 86400*7) return Math.floor(d/86400) + "d";
  return new Date(ts*1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function fmtDateTime(ts) {
  if (!ts) return "";
  return new Date(ts*1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// ── State ──────────────────────────────────────────────
let view = "funnel";       // funnel | board | table
let summary = null;        // /me/pipeline payload
let allLeads = [];         // master list — every other view derives from this
let trendRange = 90;
let filters = { search: "", source: "", campaign: "", range: 90, stage: "" };
let debouncedSearch = "";  // separate from filters.search so typing stays instant
let tableSort = { key: "stage_changed_at", dir: "desc" };
let dragLeadId = "";
let pollTimer = null;
const pendingMoves = new Set();
let lastInteractionAt = 0;
function noteInteraction() { lastInteractionAt = Date.now(); }

let leads = [];  // re-assigned by render() below

// ── DOM ────────────────────────────────────────────────
const sec = () => document.querySelector('[data-route-section="pipeline"]');
const statRow = document.getElementById("plStatRow");
const totalEl = document.getElementById("plLeadTotal");
const funnelRow = document.getElementById("plFunnelRow");
const convStrip = document.getElementById("plConvStrip");
const trendChart = document.getElementById("plTrendChart");
const trendLegend = document.getElementById("plTrendLegend");
const trendRange30 = document.querySelector('[data-pl-range="30"]');
const trendRange90 = document.querySelector('[data-pl-range="90"]');
const board = document.getElementById("plBoard");
const tableHead = document.getElementById("plTableHead");
const tableBody = document.getElementById("plTableBody");
const lostPill = document.getElementById("plLostPill");
const lostCount = document.getElementById("plLostCount");
const lostPane = document.getElementById("plLostPane");
const lostBody = document.getElementById("plLostBody");
const lostClose = document.getElementById("plLostClose");
const confirmPill = document.getElementById("plConfirmPill");
const searchEl = document.getElementById("plSearch");
const sourceEl = document.getElementById("plSource");
const campaignEl = document.getElementById("plCampaign");
const rangeEl = document.getElementById("plRange");
const resetEl = document.getElementById("plReset");
const exportEl = document.getElementById("plExport");

// ── View switching ─────────────────────────────────────
document.querySelectorAll("[data-pl-view]").forEach(b => {
  b.addEventListener("click", () => {
    view = b.dataset.plView;
    document.querySelectorAll("[data-pl-view]").forEach(x =>
      x.classList.toggle("is-active", x.dataset.plView === view));
    document.querySelectorAll("[data-pl-pane]").forEach(p => {
      p.hidden = p.dataset.plPane !== view;
    });
    render();
  });
});

// ── Filters ────────────────────────────────────────────
function syncFilterControls() {
  searchEl.value = filters.search;
  sourceEl.value = filters.source;
  campaignEl.value = filters.campaign;
  rangeEl.value = String(filters.range);
  const isDirty = filters.search || filters.source || filters.campaign || filters.range !== 90 || filters.stage;
  resetEl.hidden = !isDirty;
}
let searchT = null;
searchEl.addEventListener("input", () => {
  filters.search = searchEl.value;
  noteInteraction();
  clearTimeout(searchT);
  searchT = setTimeout(() => {
    debouncedSearch = filters.search.trim();
    syncFilterControls();
    render();
  }, 150);
});
sourceEl.addEventListener("change",   () => { filters.source = sourceEl.value; noteInteraction(); syncFilterControls(); render(); });
campaignEl.addEventListener("change", () => { filters.campaign = campaignEl.value; noteInteraction(); syncFilterControls(); render(); });
rangeEl.addEventListener("change", () => {
  filters.range = parseInt(rangeEl.value, 10) || 0;
  noteInteraction();
  syncFilterControls();
  loadAll({ force: true });
});
resetEl.addEventListener("click", () => {
  const oldRange = filters.range;
  filters = { search: "", source: "", campaign: "", range: 90, stage: "" };
  debouncedSearch = "";
  syncFilterControls();
  if (oldRange !== 90) loadAll({ force: true }); else render();
});

// ── Pure filter function ──────────────────────────────
function visibleLeads() {
  const q = (debouncedSearch || "").toLowerCase();
  const src = filters.source;
  const camp = filters.campaign;
  const stage = filters.stage;
  const out = [];
  for (const r of allLeads) {
    if (src && (r.source || "").toLowerCase() !== src) continue;
    if (camp && r.campaign_id !== camp) continue;
    if (stage && r.stage !== stage) continue;
    if (q) {
      const blob = ((r.first_name || "") + " " + (r.last_name || "") + " " +
                    (r.email || "") + " " + (r.phone || "") + " " +
                    (r.company || "")).toLowerCase();
      if (blob.indexOf(q) === -1) continue;
    }
    out.push(r);
  }
  return out;
}

// ── Loading ────────────────────────────────────────────
async function loadAll(opts) {
  opts = opts || {};
  if (!opts.force) {
    if (pendingMoves.size > 0) return;
    if (Date.now() - lastInteractionAt < 10000) return;
  }
  try {
    const [s, l] = await Promise.all([
      fetch("/me/pipeline?range=" + (trendRange || 90), { credentials: "same-origin" }),
      fetch(buildLeadsUrl(), { credentials: "same-origin" }),
    ]);
    if (s.ok) summary = await s.json();
    if (l.ok) {
      const data = await l.json();
      const fresh = data.leads || [];
      const overrides = new Map();
      for (const r of allLeads) {
        if (r._pendingMutationId) overrides.set(r.id, r);
      }
      allLeads = fresh.map(r => overrides.has(r.id)
        ? Object.assign({}, r, {
            stage: overrides.get(r.id).stage,
            stage_locked: true,
            _pendingMutationId: overrides.get(r.id)._pendingMutationId,
          })
        : r);
    }
    const camps = new Map();
    for (const r of allLeads) {
      if (r.campaign_id) camps.set(r.campaign_id, r.campaign_name || r.campaign_id);
    }
    if (campaignEl.options.length <= 1 || campaignEl.options.length - 1 !== camps.size) {
      const cur = campaignEl.value;
      campaignEl.innerHTML = `<option value="">All campaigns</option>` +
        [...camps.entries()].map(([id, name]) =>
          `<option value="${escHtml(id)}">${escHtml(name)}</option>`).join("");
      campaignEl.value = cur;
    }
    render();
  } catch (_) { /* silent */ }
}
function buildLeadsUrl() {
  const p = new URLSearchParams();
  p.set("date_range", String(filters.range || 0));
  p.set("limit", "1000");
  return "/me/pipeline/leads?" + p.toString();
}
function reload() { syncFilterControls(); loadAll({ force: true }); }

// ── Render ─────────────────────────────────────────────
function render() {
  if (!summary) return;
  leads = visibleLeads();
  const counts = summary.counts || {};
  const hm = summary.header_metrics || {};
  const total = hm.total_captured || 0;
  totalEl.textContent = `${total} lead${total === 1 ? "" : "s"} tracked`;
  renderStatRow(hm, counts);
  if (view === "funnel") renderFunnel();
  if (view === "board")  renderBoard();
  if (view === "table")  renderTable();
  renderLostPill(counts.lost || 0);
}

function renderStatRow(hm, counts) {
  const upcomingPreview = (hm.upcoming_next || []).slice(0, 3)
    .map(u => `${escHtml((u.name || "").trim() || "Lead")} ${fmtDateTime(u.appointment_at)}`).join(" · ");
  statRow.innerHTML = `
    <div class="pl-stat" data-stat="paying" data-jump="won">
      <div class="pl-stat-label">Paying customers</div>
      <div class="pl-stat-num">${hm.paying_count || 0}</div>
      <div class="pl-stat-sub">${(hm.paying_percent || 0).toFixed(1)}% of all leads</div>
    </div>
    <div class="pl-stat" data-stat="upcoming" data-jump="upcoming">
      <div class="pl-stat-label">Upcoming appointments</div>
      <div class="pl-stat-num">${hm.upcoming_count || 0}</div>
      <div class="pl-stat-sub">${upcomingPreview ? escHtml(upcomingPreview) : "Next 7 days"}</div>
    </div>
    <div class="pl-stat" data-stat="open" data-jump="open">
      <div class="pl-stat-label">Still open</div>
      <div class="pl-stat-num">${hm.open_count || 0}</div>
      <div class="pl-stat-sub">${counts.contacted || 0} contacted · ${counts.engaged || 0} engaged · ${counts.quoted || 0} quoted</div>
    </div>
  `;
  statRow.querySelectorAll("[data-jump]").forEach(card => {
    card.addEventListener("click", () => jumpFromStat(card.dataset.jump));
  });
}

function jumpFromStat(kind) {
  if (kind === "won") { filters.stage = "won"; }
  else if (kind === "open") { filters.stage = ""; }
  else if (kind === "upcoming") { filters.stage = "scheduled"; }
  view = (view === "funnel") ? "board" : view;
  document.querySelectorAll("[data-pl-view]").forEach(x =>
    x.classList.toggle("is-active", x.dataset.plView === view));
  document.querySelectorAll("[data-pl-pane]").forEach(p => {
    p.hidden = p.dataset.plPane !== view;
  });
  reload();
}

// ── Funnel view ────────────────────────────────────────
function renderFunnel() {
  const counts = (summary && summary.counts) || {};
  const cards = FUNNEL_ORDER.map((s, idx) => {
    const isLost = s === "lost";
    const arrow = (idx > 0 && !isLost) ? `<div class="pl-stage-arrow">›</div>` : "";
    return `${arrow}<div class="pl-stage-card" data-stage="${s}" data-terminal="${isLost ? "true" : "false"}">
      <span class="pl-stage-name">${escHtml(STAGE_LABEL[s])}</span>
      <span class="pl-stage-count">${counts[s] || 0}</span>
    </div>`;
  }).join("");
  funnelRow.innerHTML = cards;
  funnelRow.querySelectorAll("[data-stage]").forEach(el => {
    el.addEventListener("click", () => {
      filters.stage = el.dataset.stage;
      view = "board";
      document.querySelectorAll("[data-pl-view]").forEach(x =>
        x.classList.toggle("is-active", x.dataset.plView === view));
      document.querySelectorAll("[data-pl-pane]").forEach(p => {
        p.hidden = p.dataset.plPane !== view;
      });
      reload();
    });
  });
  const cr = (summary && summary.conversion_rates) || {};
  convStrip.innerHTML = `
    <span><strong>${(cr.reply_rate||0).toFixed(0)}%</strong> reply rate</span>
    <span><strong>${(cr.engaged_to_quoted||0).toFixed(0)}%</strong> engaged → quoted</span>
    <span><strong>${(cr.quoted_to_scheduled||0).toFixed(0)}%</strong> quoted → scheduled</span>
    <span><strong>${(cr.scheduled_to_won||0).toFixed(0)}%</strong> scheduled → won</span>
  `;
  renderTrendChart();
}

function renderTrendChart() {
  const data = (summary && summary.trend) || [];
  const w = trendChart.clientWidth || 600;
  const h = 240, pad = { l: 36, r: 16, t: 14, b: 22 };
  const innerW = Math.max(50, w - pad.l - pad.r);
  const innerH = h - pad.t - pad.b;
  const stages = ["new","contacted","engaged","quoted","scheduled","won"];
  const running = stages.reduce((acc, s) => (acc[s] = 0, acc), {});
  const series = stages.map(s => []);
  let max = 1;
  data.forEach((d, i) => {
    stages.forEach(s => { running[s] += d[s] || 0; });
    stages.forEach((s, si) => series[si].push(running[s]));
    const stack = stages.reduce((a, s) => a + running[s], 0);
    if (stack > max) max = stack;
  });
  if (data.length < 2) {
    trendChart.innerHTML = `<div style="padding:30px;text-align:center;color:#94a3b8;font-size:12.5px;">Not enough history yet.</div>`;
    trendLegend.innerHTML = "";
    return;
  }
  const x = i => pad.l + (innerW * (i / (data.length - 1)));
  const y = v => pad.t + innerH - (innerH * (v / max));
  let cum = data.map(() => 0);
  const paths = [];
  stages.forEach((s, si) => {
    const top = data.map((_, i) => cum[i] + series[si][i]);
    let dStr = "";
    for (let i = 0; i < data.length; i++) dStr += (i === 0 ? "M" : "L") + x(i) + "," + y(top[i]) + " ";
    for (let i = data.length - 1; i >= 0; i--) dStr += "L" + x(i) + "," + y(cum[i]) + " ";
    dStr += "Z";
    paths.push(`<path d="${dStr}" fill="${STAGE_COLORS[s]}" fill-opacity="0.65" stroke="${STAGE_COLORS[s]}" stroke-width="0.5"/>`);
    cum = top;
  });
  const xLabels = (() => {
    const out = [];
    const step = Math.max(1, Math.floor(data.length / 6));
    for (let i = 0; i < data.length; i += step) {
      const d = new Date(data[i].date);
      out.push(`<text x="${x(i)}" y="${h - 6}" font-size="10" fill="#94a3b8" text-anchor="middle">${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</text>`);
    }
    return out.join("");
  })();
  const yLabels = (() => {
    const out = [];
    for (let f = 0; f <= 4; f++) {
      const v = Math.round(max * f / 4);
      out.push(`<text x="${pad.l - 6}" y="${y(v) + 3}" font-size="10" fill="#94a3b8" text-anchor="end">${v}</text>`);
      out.push(`<line x1="${pad.l}" y1="${y(v)}" x2="${w - pad.r}" y2="${y(v)}" stroke="#f1f5f9"/>`);
    }
    return out.join("");
  })();
  trendChart.innerHTML = `<svg class="pl-trend-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${yLabels}${paths.join("")}${xLabels}</svg>`;
  trendLegend.innerHTML = stages.map(s =>
    `<span><i style="background:${STAGE_COLORS[s]}"></i>${escHtml(STAGE_LABEL[s])}</span>`).join("");
}
document.querySelectorAll("[data-pl-range]").forEach(b => {
  b.addEventListener("click", () => {
    trendRange = parseInt(b.dataset.plRange, 10);
    document.querySelectorAll("[data-pl-range]").forEach(x =>
      x.classList.toggle("is-active", x === b));
    loadAll();
  });
});

// ── Board view ─────────────────────────────────────────
let boardBuilt = false;
function renderBoard() {
  if (!boardBuilt) {
    board.innerHTML = VISIBLE_STAGES.map(s =>
      `<div class="pl-col" data-stage="${s}">
        <div class="pl-col-head">
          <span>${escHtml(STAGE_LABEL[s])}</span>
          <span class="pl-col-count" data-col-count="${s}">0</span>
        </div>
        <div class="pl-col-body" data-drop-stage="${s}"></div>
      </div>`
    ).join("");
    wireColumnDropTargets();
    boardBuilt = true;
  }
  const buckets = {};
  VISIBLE_STAGES.forEach(s => buckets[s] = []);
  for (const r of leads) {
    if (r.stage === "lost") continue;
    if (filters.stage && r.stage !== filters.stage) continue;
    if (buckets[r.stage]) buckets[r.stage].push(r);
  }
  for (const s of VISIBLE_STAGES) {
    paintColumn(s, buckets[s]);
  }
  const counts = (summary && summary.counts) || {};
  for (const s of VISIBLE_STAGES) {
    const el = board.querySelector(`[data-col-count="${s}"]`);
    if (el) el.textContent = counts[s] || 0;
  }
  applyNarrowColumnFlags();
}

function paintColumn(stage, rows) {
  const body = board.querySelector(`[data-drop-stage="${stage}"]`);
  if (!body) return;
  if (!rows || !rows.length) {
    const filteredAway = leads.length === 0
      && allLeads.some(l => l.stage === stage)
      && (debouncedSearch || filters.source || filters.campaign || filters.stage);
    const msg = filteredAway
      ? "No leads match your filters."
      : emptyCopy(stage);
    body.innerHTML = `<div class="pl-col-empty">${escHtml(msg)}</div>`;
    return;
  }
  body.innerHTML = rows.map(renderCardHtml).join("");
  wireCardEventsIn(body);
}

function applyNarrowColumnFlags() {
  board.querySelectorAll(".pl-col").forEach(col => {
    const w = col.getBoundingClientRect().width;
    col.classList.toggle("is-narrow", w > 0 && w < 220);
  });
}
window.addEventListener("resize", () => {
  if (view === "board" && summary) applyNarrowColumnFlags();
  if (view === "funnel" && summary) renderTrendChart();
});
function emptyCopy(stage) {
  return ({
    new: "New leads land here.",
    contacted: "Drop a card to mark Contacted.",
    engaged: "Drop a card to mark Engaged.",
    quoted: "Drop a card to mark Quoted.",
    scheduled: "Drop a card to mark Scheduled.",
    won: "Drop a card to mark Won 🎉",
    lost: "Drop a card to mark Lost.",
  })[stage] || "Drop a card here.";
}
function _nextActionForCard(r) {
  const now = Math.floor(Date.now() / 1000);
  const FOLLOWUP_AFTER_S = 3 * 86400;
  const reminderSent  = r.last_reminder_sent_at && (now - r.last_reminder_sent_at) < 36 * 3600;
  const followupSent  = r.last_followup_sent_at && (now - r.last_followup_sent_at) < 7 * 86400;
  const reviewSent    = r.last_review_request_sent_at && (now - r.last_review_request_sent_at) < 14 * 86400;
  const stage = r.stage || "new";

  if (stage === "new") {
    return { kind: "first_touch", icon: "👋", label: "Send first email" };
  }
  if (stage === "contacted") {
    if (followupSent) {
      return { kind: null, icon: "✅", label: "Follow-up sent — wait for reply" };
    }
    if (r.last_send_at && (now - r.last_send_at) > FOLLOWUP_AFTER_S) {
      return { kind: "followup", icon: "🔔", label: "Send a follow-up" };
    }
    return null;
  }
  if (stage === "engaged") {
    if (r.has_reply && r.last_reply_at &&
        (r.last_reply_at > (r.last_send_at || 0))) {
      return { kind: "reply", icon: "✉️", label: "Reply now" };
    }
    return { kind: null, icon: "⏳", label: "Waiting on them" };
  }
  if (stage === "quoted") {
    return { kind: "quote_nudge", icon: "💵", label: "Send check-in on the quote" };
  }
  if (stage === "scheduled") {
    if (reminderSent) {
      return { kind: null, icon: "✅", label: "Reminder sent — you're set" };
    }
    return { kind: "reminder", icon: "📅", label: "Send reminder" };
  }
  if (stage === "won") {
    if (reviewSent) {
      return { kind: null, icon: "✅", label: "Review request sent" };
    }
    return { kind: "review_request", icon: "🌟", label: "Ask for a review" };
  }
  if (stage === "lost") {
    return { kind: null, icon: "🪦", label: "Marked as lost" };
  }
  return { kind: null, icon: "•", label: "No action needed" };
}

function renderCardHtml(r) {
  const display = ((r.first_name || "") + " " + (r.last_name || "")).trim()
    || r.email || r.phone || "Lead";
  const dot = colorFor(r.id);
  const sub = [
    r.source ? r.source.replace(/_/g, " ") : "",
    r.days_in_stage ? `${r.days_in_stage}d in stage` : "",
  ].filter(Boolean).join(" · ");
  const replyRow = r.has_reply
    ? `<div class="pl-card-row is-reply">🟢 replied ${escHtml(relTime(r.last_reply_at || r.last_inbound_at))}${r.last_send_at ? " · last sent " + escHtml(relTime(r.last_send_at)) : ""}</div>`
    : (r.last_send_at ? `<div class="pl-card-row">📤 sent ${escHtml(relTime(r.last_send_at))}</div>` : "");
  const apptRow = (r.stage === "scheduled" && r.appointment_date)
    ? `<div class="pl-card-row is-appt">📅 ${escHtml(r.appointment_date)} ${escHtml(r.appointment_time || "")}</div>`
    : "";
  let outreachRow = "";
  const _nowSec = Math.floor(Date.now() / 1000);
  function _elapsedHumanCard(secondsAgo) {
    if (secondsAgo < 60) return "a moment ago";
    if (secondsAgo < 3600) {
      const m = Math.floor(secondsAgo / 60);
      return m === 1 ? "1 minute ago" : `${m} minutes ago`;
    }
    if (secondsAgo < 86400) {
      const h = Math.floor(secondsAgo / 3600);
      return h === 1 ? "1 hour ago" : `${h} hours ago`;
    }
    const d = Math.floor(secondsAgo / 86400);
    return d === 1 ? "1 day ago" : `${d} days ago`;
  }
  if (r.stage === "scheduled" && r.last_reminder_sent_at) {
    outreachRow = `<div class="pl-card-row is-sent">✅ Reminder sent ${escHtml(_elapsedHumanCard(_nowSec - r.last_reminder_sent_at))}</div>`;
  } else if (r.stage === "contacted" && r.last_followup_sent_at) {
    outreachRow = `<div class="pl-card-row is-sent">✅ Follow-up sent ${escHtml(_elapsedHumanCard(_nowSec - r.last_followup_sent_at))}</div>`;
  } else if (r.stage === "won" && r.last_review_request_sent_at) {
    outreachRow = `<div class="pl-card-row is-sent">✅ Review request sent ${escHtml(_elapsedHumanCard(_nowSec - r.last_review_request_sent_at))}</div>`;
  } else if (r.stage === "contacted" && r.last_send_at && (_nowSec - r.last_send_at) > 3 * 86400) {
    outreachRow = `<div class="pl-card-row is-overdue">🔔 send a follow-up</div>`;
  }
  const snippet = (r.stage === "engaged" || r.stage === "quoted" || r.stage === "scheduled" || r.stage === "won") && r.last_reply_snippet
    ? `<div class="pl-card-snippet">"${escHtml(r.last_reply_snippet)}"</div>` : "";
  const stale = r.is_stale ? `<div style="margin-top:4px;"><span class="pl-card-stale">stale ${Math.floor((Date.now()/1000 - (r.last_touch_at || r.created_at)) / 86400)}d</span></div>` : "";
  const value = r.stage_value_cents ? `<div class="pl-card-value">$${(r.stage_value_cents / 100).toLocaleString()}</div>` : "";
  const next = _nextActionForCard(r);
  let nextRow = "";
  if (next) {
    if (next.kind) {
      nextRow = `
        <button type="button" class="pl-card-next" data-card-next="${escHtml(r.id)}" data-next-kind="${escHtml(next.kind)}">
          ${next.icon} ${escHtml(next.label)} →
        </button>`;
    } else {
      nextRow = `
        <div class="pl-card-next-passive">
          ${next.icon} ${escHtml(next.label)}
        </div>`;
    }
  }
  return `<div class="pl-card" draggable="true" data-lead-id="${escHtml(r.id)}" style="--card-color:${dot};">
    <div class="pl-card-head">
      <span class="pl-card-name">${escHtml(display)}</span>
      <button type="button" class="pl-card-kebab" data-card-kebab="${escHtml(r.id)}" aria-label="Card actions">⋮</button>
    </div>
    ${sub ? `<div class="pl-card-sub">${escHtml(sub)}</div>` : ""}
    ${replyRow}${apptRow}${outreachRow}${snippet}${stale}${value}
    ${nextRow}
  </div>`;
}
function wireColumnDropTargets() {
  board.querySelectorAll(".pl-col").forEach(col => {
    const stage = col.dataset.stage;
    col.addEventListener("dragover", (e) => {
      if (!dragLeadId) return;
      e.preventDefault();
      col.classList.add("is-drop-target");
    });
    col.addEventListener("dragleave", (e) => {
      if (!col.contains(e.relatedTarget)) col.classList.remove("is-drop-target");
    });
    col.addEventListener("drop", (e) => {
      e.preventDefault();
      col.classList.remove("is-drop-target");
      if (!dragLeadId) return;
      moveLead(dragLeadId, stage);
    });
  });
}

function wireCardEventsIn(scope) {
  scope.querySelectorAll(".pl-card").forEach(card => {
    card.addEventListener("dragstart", (e) => {
      dragLeadId = card.dataset.leadId;
      card.classList.add("is-dragging");
      try {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", dragLeadId);
      } catch (_) {}
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("is-dragging");
      dragLeadId = "";
      board.querySelectorAll(".is-drop-target").forEach(c => c.classList.remove("is-drop-target"));
    });
    card.addEventListener("click", (e) => {
      if (e.target.closest("[data-card-kebab]")) return;
      if (e.target.closest("[data-card-next]")) return;
      openLeadDetail(card.dataset.leadId);
    });
    const kebab = card.querySelector("[data-card-kebab]");
    if (kebab) kebab.addEventListener("click", (e) => {
      e.stopPropagation();
      openCardMenu(kebab.dataset.cardKebab, kebab);
    });
    const nextBtn = card.querySelector("[data-card-next]");
    if (nextBtn) nextBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = nextBtn.dataset.cardNext;
      const kind = nextBtn.dataset.nextKind;
      if (typeof window.openLeadDetailModal === "function") {
        window.openLeadDetailModal(id, allLeads.find(l => l.id === id) || null, { autoDraft: kind });
      }
    });
  });
}

function moveLead(leadId, newStage) {
  const lead = allLeads.find(l => l.id === leadId);
  if (!lead) return;
  const prevStage = lead.stage;
  if (prevStage === newStage) return;
  const mutationId = "mv_" + Date.now().toString(36) + "_" +
                     Math.random().toString(36).slice(2, 8);
  noteInteraction();
  pendingMoves.add(mutationId);
  lead._pendingMutationId = mutationId;
  lead.stage = newStage;
  lead.stage_locked = true;
  lead.stage_changed_at = Math.floor(Date.now() / 1000);
  if (summary && summary.counts) {
    summary.counts[prevStage] = Math.max(0, (summary.counts[prevStage] || 0) - 1);
    summary.counts[newStage]  = (summary.counts[newStage] || 0) + 1;
    const c = summary.counts;
    if (summary.header_metrics) {
      summary.header_metrics.paying_count = c.won || 0;
      summary.header_metrics.open_count =
        (c.new || 0) + (c.contacted || 0) + (c.engaged || 0) + (c.quoted || 0);
    }
  }
  leads = visibleLeads();
  for (const s of [prevStage, newStage]) {
    const el = board.querySelector(`[data-col-count="${s}"]`);
    if (el) el.textContent = (summary && summary.counts && summary.counts[s]) || 0;
  }
  const visibleStages = new Set(VISIBLE_STAGES);
  const buckets = {};
  VISIBLE_STAGES.forEach(s => buckets[s] = []);
  for (const r of leads) {
    if (!visibleStages.has(r.stage)) continue;
    buckets[r.stage].push(r);
  }
  if (visibleStages.has(prevStage)) paintColumn(prevStage, buckets[prevStage]);
  if (visibleStages.has(newStage))  paintColumn(newStage,  buckets[newStage]);
  if (summary) renderStatRow(summary.header_metrics || {}, summary.counts || {});
  if (prevStage === "lost" || newStage === "lost") {
    renderLostPill((summary && summary.counts && summary.counts.lost) || 0);
    if (lostPane && lostPane.classList.contains("is-open")) {
      paintLostPane();
    }
  }
  flashConfirm(`${displayName(lead)} moved to ${STAGE_LABEL[newStage]}`,
               STAGE_COLORS[newStage]);
  fetch(`/me/leads/${encodeURIComponent(leadId)}/stage`, {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage: newStage }),
  }).then(res => {
    pendingMoves.delete(mutationId);
    if (lead._pendingMutationId !== mutationId) return;
    if (res.ok) {
      lead._pendingMutationId = null;
      return;
    }
    rollbackMove(lead, prevStage, newStage, mutationId, "Couldn't move — try again.");
  }).catch(() => {
    pendingMoves.delete(mutationId);
    if (lead._pendingMutationId !== mutationId) return;
    rollbackMove(lead, prevStage, newStage, mutationId, "Network error.");
  });
}

function rollbackMove(lead, prevStage, newStage, mutationId, message) {
  if (lead._pendingMutationId !== mutationId) return;
  lead.stage = prevStage;
  lead.stage_locked = false;
  lead._pendingMutationId = null;
  if (summary && summary.counts) {
    summary.counts[newStage]  = Math.max(0, (summary.counts[newStage] || 0) - 1);
    summary.counts[prevStage] = (summary.counts[prevStage] || 0) + 1;
  }
  leads = visibleLeads();
  const buckets = {};
  VISIBLE_STAGES.forEach(s => buckets[s] = []);
  for (const r of leads) {
    if (buckets[r.stage]) buckets[r.stage].push(r);
  }
  for (const s of [prevStage, newStage]) {
    if (VISIBLE_STAGES.includes(s)) paintColumn(s, buckets[s]);
    const el = board.querySelector(`[data-col-count="${s}"]`);
    if (el) el.textContent = (summary && summary.counts && summary.counts[s]) || 0;
  }
  if (summary) renderStatRow(summary.header_metrics || {}, summary.counts || {});
  flashConfirm(message, "#b91c1c");
}
function displayName(l) {
  return ((l.first_name || "") + " " + (l.last_name || "")).trim() || l.email || "Lead";
}
function flashConfirm(msg, color) {
  confirmPill.textContent = msg;
  confirmPill.style.background = color || "#15803d";
  confirmPill.classList.remove("is-error");
  if (color === "#b91c1c") confirmPill.classList.add("is-error");
  confirmPill.classList.add("is-open");
  clearTimeout(confirmPill._t);
  confirmPill._t = setTimeout(() => confirmPill.classList.remove("is-open"), 2000);
}

function openCardMenu(leadId, anchorEl) {
  document.querySelectorAll(".pl-card-menu").forEach(m => m.remove());
  const lead = leads.find(l => l.id === leadId);
  if (!lead) return;
  const menu = document.createElement("div");
  menu.className = "pl-card-menu";
  const items = [
    { act: "view",   label: "View lead →" },
    { act: "quoted", label: "Mark as Quoted",  hidden: lead.stage === "quoted" },
    { act: "won",    label: "Mark as Won",     hidden: lead.stage === "won" },
    { act: "lost",   label: "Mark as Lost",    hidden: lead.stage === "lost", danger: true },
    { act: "unlock", label: "Reset to auto",   hidden: !lead.stage_locked },
    { act: "value",  label: "Set value…" },
  ].filter(i => !i.hidden);
  menu.innerHTML = items.map(i =>
    `<div class="rep-send-menu-item${i.danger ? " is-danger" : ""}" data-act="${i.act}">${escHtml(i.label)}</div>`
  ).join("");
  menu.style.position   = "fixed";
  menu.style.top        = "-9999px";
  menu.style.left       = "-9999px";
  menu.style.visibility = "hidden";
  document.body.appendChild(menu);
  const rect = anchorEl.getBoundingClientRect();
  const mr = menu.getBoundingClientRect();
  const desiredLeft = rect.right - mr.width;
  const maxLeft = window.innerWidth - mr.width - 8;
  const left = Math.max(8, Math.min(maxLeft, desiredLeft));
  const desiredTop = rect.bottom + 4;
  const maxTop = window.innerHeight - mr.height - 8;
  const top = Math.max(8, Math.min(maxTop, desiredTop));
  menu.style.top  = top  + "px";
  menu.style.left = left + "px";
  menu.style.visibility = "visible";
  menu.querySelectorAll("[data-act]").forEach(it => {
    it.addEventListener("click", (e) => {
      e.stopPropagation();
      handleCardAction(leadId, it.dataset.act);
      menu.remove();
    });
  });
  setTimeout(() => document.addEventListener("click", () => menu.remove(), { once: true }), 0);
}
function handleCardAction(leadId, act) {
  if (act === "view") return openLeadDetail(leadId);
  if (act === "unlock") return unlockLead(leadId);
  if (act === "value")  return promptValue(leadId);
  if (["quoted","won","lost"].includes(act)) return moveLead(leadId, act);
}
async function unlockLead(leadId) {
  try {
    const res = await fetch(`/me/leads/${encodeURIComponent(leadId)}/stage/unlock`,
      { method: "POST", credentials: "same-origin" });
    if (res.ok) { flashConfirm("Reset to auto.", "#15803d"); loadAll({ force: true }); }
  } catch(_) {}
}
async function promptValue(leadId) {
  const lead = allLeads.find(l => l.id === leadId);
  if (!lead) return;
  const cur = lead.stage_value_cents ? (lead.stage_value_cents / 100).toFixed(2) : "";
  const v = window.prompt(`Set value (USD) for ${displayName(lead)}:`, cur);
  if (v === null) return;
  const cents = Math.max(0, Math.round(parseFloat(v || "0") * 100)) || 0;
  try {
    const res = await fetch(`/me/leads/${encodeURIComponent(leadId)}/stage`,
      { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: lead.stage, value_cents: cents }) });
    if (res.ok) { lead.stage_value_cents = cents; render(); flashConfirm("Value updated."); }
  } catch(_) {}
}

// ── Lost slide-over ────────────────────────────────────
function renderLostPill(n) {
  if (n > 0) { lostPill.hidden = false; lostCount.textContent = n; }
  else lostPill.hidden = true;
}
function paintLostPane() {
  const lostLeads = leads.filter(l => l.stage === "lost");
  lostBody.innerHTML = lostLeads.length
    ? lostLeads.map(renderCardHtml).join("")
    : `<div class="pl-col-empty">No lost leads.</div>`;
  lostBody.querySelectorAll(".pl-card").forEach(card => {
    card.addEventListener("dragstart", (e) => {
      dragLeadId = card.dataset.leadId;
      try { e.dataTransfer.effectAllowed = "move"; } catch(_){}
    });
    card.addEventListener("dragend", () => { dragLeadId = ""; });
  });
}
lostPill.addEventListener("click", () => {
  paintLostPane();
  lostPane.classList.add("is-open");
});
lostClose.addEventListener("click", () => lostPane.classList.remove("is-open"));

// ── Table view ─────────────────────────────────────────
function renderTable() {
  const cols = [
    { key: "name",            label: "Name",           sortable: true },
    { key: "contact",         label: "Contact",        sortable: false },
    { key: "source",          label: "Source",         sortable: true },
    { key: "stage",           label: "Stage",          sortable: true },
    { key: "last_touch_at",   label: "Last touch",     sortable: true },
    { key: "days_in_stage",   label: "Days in stage",  sortable: true },
    { key: "campaign_name",   label: "Campaign",       sortable: false },
    { key: "stage_value_cents", label: "Value",        sortable: true },
  ];
  tableHead.innerHTML = cols.map(c =>
    `<th data-col="${c.key}" class="${c.sortable ? "is-sortable" : ""}">${escHtml(c.label)}${c.sortable && tableSort.key === c.key ? (tableSort.dir === "desc" ? " ↓" : " ↑") : ""}</th>`
  ).join("");
  tableHead.querySelectorAll(".is-sortable").forEach(th => {
    th.addEventListener("click", () => {
      const k = th.dataset.col === "name" ? "first_name" : th.dataset.col;
      if (tableSort.key === k) tableSort.dir = tableSort.dir === "desc" ? "asc" : "desc";
      else { tableSort.key = k; tableSort.dir = "desc"; }
      renderTable();
    });
  });
  const sorted = leads.slice()
    .filter(l => l.stage !== "lost" || filters.stage === "lost")
    .sort((a, b) => {
      const ka = a[tableSort.key], kb = b[tableSort.key];
      const av = (typeof ka === "string") ? ka.toLowerCase() : (ka || 0);
      const bv = (typeof kb === "string") ? kb.toLowerCase() : (kb || 0);
      if (av < bv) return tableSort.dir === "desc" ? 1 : -1;
      if (av > bv) return tableSort.dir === "desc" ? -1 : 1;
      return 0;
    });
  tableBody.innerHTML = sorted.length ? sorted.map(r => {
    const display = displayName(r);
    const dot = colorFor(r.id);
    const value = r.stage_value_cents ? `$${(r.stage_value_cents/100).toLocaleString()}` : "—";
    return `<tr data-lead-id="${escHtml(r.id)}">
      <td><span class="pl-table-name"><span class="dot" style="background:${dot}"></span>${escHtml(display)}</span></td>
      <td><div>${escHtml(r.email || "")}</div><div class="pl-table-cell-sub">${escHtml(r.phone || "")}</div></td>
      <td>${escHtml((r.source || "").replace(/_/g, " "))}</td>
      <td><span class="pl-stage-pill" data-stage="${r.stage}" data-stage-pill="${escHtml(r.id)}">${escHtml(STAGE_LABEL[r.stage] || r.stage)}</span></td>
      <td>${escHtml(relTime(r.last_touch_at))}</td>
      <td>${r.days_in_stage}</td>
      <td>${escHtml(r.campaign_name || "—")}</td>
      <td>${value}</td>
    </tr>`;
  }).join("") : `<tr><td colspan="8"><div class="pl-empty" style="border:0;">No leads match these filters.</div></td></tr>`;
  tableBody.querySelectorAll("tr[data-lead-id]").forEach(row => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("[data-stage-pill]")) return;
      openLeadDetail(row.dataset.leadId);
    });
  });
  tableBody.querySelectorAll("[data-stage-pill]").forEach(p => {
    p.addEventListener("click", (e) => {
      e.stopPropagation();
      openTableStageMenu(p.dataset.stagePill, p);
    });
  });
}
function openTableStageMenu(leadId, anchorEl) {
  document.querySelectorAll(".pl-card-menu").forEach(m => m.remove());
  const menu = document.createElement("div");
  menu.className = "pl-card-menu";
  menu.innerHTML = ALL_STAGES.map(s =>
    `<div class="rep-send-menu-item" data-stage="${s}"><span class="pl-stage-pill" data-stage="${s}" style="margin-right:6px;">${escHtml(STAGE_LABEL[s])}</span></div>`
  ).join("");
  document.body.appendChild(menu);
  const rect = anchorEl.getBoundingClientRect();
  menu.style.position = "fixed";
  menu.style.top  = (rect.bottom + 4) + "px";
  menu.style.left = rect.left + "px";
  menu.querySelectorAll("[data-stage]").forEach(it => {
    it.addEventListener("click", (e) => {
      e.stopPropagation();
      moveLead(leadId, it.dataset.stage);
      menu.remove();
    });
  });
  setTimeout(() => document.addEventListener("click", () => menu.remove(), { once: true }), 0);
}
exportEl.addEventListener("click", () => {
  const cols = ["first_name","last_name","email","phone","source","stage","days_in_stage","campaign_name","last_touch_at","stage_value_cents"];
  const csv = [cols.join(",")].concat(leads.map(r => cols.map(c => {
    let v = r[c];
    if (c === "last_touch_at" && v) v = new Date(v*1000).toISOString();
    if (c === "stage_value_cents" && v) v = (v/100).toFixed(2);
    if (v == null) v = "";
    v = String(v).replace(/"/g, '""');
    return /[,"\n]/.test(v) ? `"${v}"` : v;
  }).join(","))).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `pipeline-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
});

// ── Lead detail ────────────────────────────────────────
function openLeadDetail(leadId) {
  if (typeof window.openLeadDetailModal === "function") {
    window.openLeadDetailModal(leadId, allLeads.find(l => l.id === leadId) || null);
  }
}

// ── Polling ────────────────────────────────────────────
function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (sec()?.classList.contains("is-active")) loadAll();
  }, 30000);
}
function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

// ── Boot ───────────────────────────────────────────────
function boot() {
  startPolling();
}
window.addEventListener("accountIdReady", () => {
  if (typeof window.invalidateSection === "function") window.invalidateSection("pipeline");
  loadAll();
});
const _plNavBtn = document.getElementById("appPipelineNavBtn");
if (_plNavBtn) _plNavBtn.addEventListener("click", () => setTimeout(() => {
  if (typeof window.invalidateSection === "function") window.invalidateSection("pipeline");
  if (typeof window._runSectionLoader === "function") window._runSectionLoader("pipeline");
  loadAll();
}, 50));

window.addEventListener("lead:stage-changed", (ev) => {
  const detail = (ev && ev.detail) || {};
  const id = detail.lead_id;
  const newStage = detail.new_stage;
  if (!id || !newStage) {
    loadAll({ force: true });
    return;
  }
  const lead = allLeads.find(l => l.id === id);
  if (lead && lead.stage !== newStage) {
    const prev = lead.stage;
    lead.stage = newStage;
    lead.stage_changed_at = Math.floor(Date.now() / 1000);
    if (summary && summary.counts) {
      summary.counts[prev] = Math.max(0, (summary.counts[prev] || 0) - 1);
      summary.counts[newStage] = (summary.counts[newStage] || 0) + 1;
      const c = summary.counts;
      if (summary.header_metrics) {
        summary.header_metrics.paying_count = c.won || 0;
        summary.header_metrics.open_count =
          (c.new || 0) + (c.contacted || 0) + (c.engaged || 0) + (c.quoted || 0);
      }
    }
    if (typeof renderBoard === "function" && view === "board") renderBoard();
    if (typeof render === "function") render();
  }
  setTimeout(() => loadAll({ force: true }), 600);
});

// ─── Module init ────────────────────────────────────────────────────────────

let _initialized = false;

export function init() {
  if (_initialized) return;
  _initialized = true;
  boot();
}

// ─── Expose globals the inline router code expects ──────────────────────────

window.loadPipelineSection = function () {
  loadAll();
};

window.__pipelineRoute = {
  loadAll,
  init,
};
