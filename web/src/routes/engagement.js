// web/src/routes/engagement.js
//
// Engagement page (modern redesign):
//   - Page header (title + subtitle).
//   - Status strip: 4 small cards, one per stage, showing per-stage coverage.
//   - Automations list: flat, scannable, filterable.
//   - "+ New" dropdown surfaces pre-built templates the user hasn't added yet.
//
// The funnel framing is preserved as METADATA (stage chips + status strip),
// not as the dominant visual.

// ─── Constants ──────────────────────────────────────────────────────────────

const STAGE_ORDER = ["interest", "decision", "action", "awareness"];
const STAGE_INFO = {
  interest:  { label: "Interest",  color: "#d97706", border: "#fde68a", chipBg: "#fffbeb" },
  decision:  { label: "Decision",  color: "#16a34a", border: "#bbf7d0", chipBg: "#f0fdf4" },
  action:    { label: "Action",    color: "#2563eb", border: "#bfdbfe", chipBg: "#eff6ff" },
  awareness: { label: "Awareness", color: "#9ca3af", border: "#e5e7eb", chipBg: "#f9fafb" },
};

const FUNNEL_MAP = {
  first_contact:       "interest",
  win_back:            "interest",
  quote_followup:      "decision",
  estimate_onboarding: "decision",
  job_onboarding:      "action",
  during_job:          "action",
  after_job:           "action",
};

const AUTOMATION_DESCRIPTIONS = {
  first_contact:       "Greets new leads and pings you to follow up.",
  win_back:            "Reaches back to leads who went cold.",
  quote_followup:      "Chases quotes with friendly nudges.",
  estimate_onboarding: "Confirms estimates and reminds before the visit.",
  job_onboarding:      "Confirms booking and sends prep reminders.",
  during_job:          "Reminds you to log notes and capture photos.",
  after_job:           "Says thanks and asks for a review.",
};

const STAGE_HELP = {
  awareness: "Awareness comes from ads, social, or word-of-mouth. We pick up after a lead reaches you.",
  interest:  "Interest is when someone has reached out. They know you exist — keep their attention warm so they don't forget about you.",
  decision:  "Decision is when they're actively choosing — comparing prices, weighing options. The right follow-up here can win the job.",
  action:    "Action is once they've committed. Keep things smooth and turn them into a repeat customer.",
};

const PAGE_HELP = "Each automation runs on its own. Click any one to see what it does or change the words.";
const LIST_HELP = "Each automation runs on its own. Click any one to see what it does or change the words.";

const ENG_CACHE_KEY = "dashboard.eng_automations";

// ─── Customer-journey timeline constants ──────────────────────────────────
// Re-rendered as a vertical timeline (lead's path through the business)
// instead of a flat filterable list. Order matches the actual customer
// journey so the structure teaches itself.
const JOURNEY_ORDER = [
  { id: "first_contact",       trigger: "When a new lead comes in" },
  { id: "estimate_onboarding", trigger: "When you book an estimate" },
  { id: "quote_followup",      trigger: "After you send a quote"     },
  { id: "job_onboarding",      trigger: "When the job is booked"     },
  { id: "during_job",          trigger: "While the work is happening" },
  { id: "after_job",           trigger: "When the job is done"        },
  { id: "win_back",             trigger: "When a lead has gone cold"   },
];

const AUTOMATION_ICONS = {
  first_contact:       "📥",
  job_onboarding:      "🛠️",
  estimate_onboarding: "📋",
  quote_followup:      "💬",
  during_job:          "📷",
  after_job:           "⭐",
  win_back:            "🔄",
};

// Headlines + summaries used in the first-run overlay only.
const AUTOMATION_HEADLINES = {
  first_contact:       "Greets new leads and pings you to follow up.",
  after_job:           "Says thanks and asks for a review.",
  job_onboarding:      "Confirms bookings and sends prep reminders.",
  estimate_onboarding: "Confirms estimates with a friendly reminder.",
  quote_followup:      "Chases quotes with a couple of nudges.",
  during_job:          "Reminds you to take notes and photos.",
  win_back:            "Reaches back to leads who went cold.",
};
const AUTOMATION_SUMMARIES = {
  first_contact: "When a new lead comes in, we send a quick 'we got your message' email and ping you so you can call back fast.",
  after_job:     "When the job's done, we send a thank-you and ask for a review while the customer is still happy.",
};

const FIRST_RUN_DISMISS_KEY = "automations.firstRunDismissed";
const FIRST_RUN_RECOMMENDED = ["first_contact", "after_job"];

// ─── Module state ───────────────────────────────────────────────────────────

let _automations = [];
let _filters = { status: null, stage: null, search: "" };
let _openMenuEl = null;
let _searchDebounce = null;
let _initialized = false;

// History tab state
let _activeTab = "automations";
let _history = [];
let _historyLoaded = false;
let _historyLoading = false;
let _historyFilters = { sequence_id: "", search: "" };
let _historySearchDebounce = null;

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function closeOpenMenu() {
  if (_openMenuEl && _openMenuEl.parentNode) {
    _openMenuEl.parentNode.removeChild(_openMenuEl);
  }
  _openMenuEl = null;
}

function positionMenu(menu, anchor, opts) {
  opts = opts || {};
  const r = anchor.getBoundingClientRect();
  document.body.appendChild(menu);
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = opts.alignRight ? r.right - mw : r.left;
  if (left + mw > vw - 8) left = vw - mw - 8;
  if (left < 8) left = 8;
  let top = r.bottom + 6;
  if (top + mh > vh - 8) top = Math.max(8, r.top - mh - 6);
  menu.style.position = "fixed";
  menu.style.top = top + "px";
  menu.style.left = left + "px";
  _openMenuEl = menu;
}

// ─── Data load ──────────────────────────────────────────────────────────────

async function loadEngagementSection() {
  // Cache-first paint for instant revisit
  const cached = (() => {
    try { return JSON.parse(localStorage.getItem(ENG_CACHE_KEY) || "null"); }
    catch (_) { return null; }
  })();
  if (cached && Array.isArray(cached.automations)) {
    _automations = cached.automations;
    renderAll();
  }

  // Background refresh
  try {
    const res = await fetch("/me/sequences", { credentials: "same-origin" });
    if (res.ok) {
      const body = await res.json();
      _automations = body.sequences || [];
      try {
        localStorage.setItem(ENG_CACHE_KEY,
          JSON.stringify({ automations: _automations, ts: Date.now() }));
      } catch (_) {}
      renderAll();
    } else if (!cached) {
      _automations = [];
      renderAll();
    }
  } catch (_) {
    if (!cached) {
      _automations = [];
      renderAll();
    }
  }

  if (!_initialized) {
    attachStaticHandlers();
    _initialized = true;
  }
}

// ─── Render: list ───────────────────────────────────────────────────────────

function applyFiltersToList(list) {
  let out = list.slice();
  if (_filters.status === "running") out = out.filter(a => a.active);
  if (_filters.status === "paused")  out = out.filter(a => !a.active);
  if (_filters.stage) out = out.filter(a => FUNNEL_MAP[a.id] === _filters.stage);
  const q = (_filters.search || "").trim().toLowerCase();
  if (q) {
    out = out.filter(a => {
      const name = (a.name || a.id || "").toLowerCase();
      const desc = (AUTOMATION_DESCRIPTIONS[a.id] || "").toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  }
  // Sort: by stage in funnel order, then by name
  const stageRank = {};
  STAGE_ORDER.forEach((s, i) => stageRank[s] = i);
  out.sort((a, b) => {
    const sa = stageRank[FUNNEL_MAP[a.id]] ?? 99;
    const sb = stageRank[FUNNEL_MAP[b.id]] ?? 99;
    if (sa !== sb) return sa - sb;
    return (a.name || a.id || "").localeCompare(b.name || b.id || "");
  });
  return out;
}

function renderList() {
  const root = document.getElementById("engList");
  if (!root) return;

  // Customer-journey timeline replaces the flat filterable list. The
  // existing filter pills + search box are hidden because the journey
  // is a fixed sequence — there's nothing to filter.
  hideLegacyFilterRow();

  if (_automations.length === 0) {
    root.innerHTML = `
      <div class="eng-empty">
        <div class="eng-empty-emoji" aria-hidden="true">📨</div>
        <div class="eng-empty-h">No automations yet.</div>
        <div class="eng-empty-text">
          Once your account has built-in automations, they'll show up here.
        </div>
      </div>
    `;
    return;
  }

  renderTimeline(root);
}

function hideLegacyFilterRow() {
  // Old flat-list chrome — irrelevant for the journey timeline.
  const filterRow = document.querySelector(
    "[data-eng-pane='automations'] .eng-filter-row");
  if (filterRow) filterRow.style.display = "none";
  const activeFilters = document.getElementById("engActiveFilters");
  if (activeFilters) activeFilters.style.display = "none";
  // Card title becomes redundant — the timeline header carries it.
  const cardHead = document.querySelector(
    "[data-eng-pane='automations'] .eng-list-head");
  if (cardHead) cardHead.style.display = "none";
}

function renderTimeline(root) {
  const byId = Object.fromEntries(_automations.map(a => [a.id, a]));
  const stations = JOURNEY_ORDER
    .map(j => ({ ...j, seq: byId[j.id] }))
    .filter(j => !!j.seq);
  const onCount = stations.filter(j => j.seq.active).length;

  const headerHtml = `
    <div class="seq-tl-head">
      <div class="seq-tl-head-text">
        <h2 class="seq-tl-title">Your customer's path</h2>
        <p class="seq-tl-sub">Each step turns on automatically when something happens with a lead. Flip on the ones you want.</p>
      </div>
      <div class="seq-tl-head-meta">
        <div class="seq-tl-count" id="seqTlCount">
          <strong>${onCount}</strong> of ${stations.length} on
        </div>
        ${onCount === 0
            ? `<button type="button" class="seq-tl-quick" id="seqTlQuickStart">Quick setup →</button>`
            : ""}
      </div>
    </div>`;

  const stationsHtml = stations.map((j, i) => {
    const s = j.seq;
    const desc = AUTOMATION_DESCRIPTIONS[s.id]
      || (s.step_count + " steps in this automation.");
    const ico = AUTOMATION_ICONS[s.id] || "📩";
    const isOn = !!s.active;
    return `
      <div class="seq-tl-row${isOn ? " is-on" : ""}" data-station="${escapeHtml(s.id)}">
        <div class="seq-tl-rail">
          <div class="seq-tl-bullet">${i + 1}</div>
          ${i < stations.length - 1 ? `<div class="seq-tl-line"></div>` : ""}
        </div>
        <div class="seq-tl-card">
          <div class="seq-tl-trigger">${escapeHtml(j.trigger)}</div>
          <div class="seq-tl-card-body">
            <span class="seq-tl-ico" aria-hidden="true">${ico}</span>
            <div class="seq-tl-card-text">
              <p class="seq-tl-card-name">${escapeHtml(s.name)}</p>
              <p class="seq-tl-card-desc">${escapeHtml(desc)}</p>
            </div>
            <label class="seq-tl-toggle" title="${isOn ? "Turn off" : "Turn on"}">
              <input type="checkbox" data-seq-toggle="${escapeHtml(s.id)}"
                     ${isOn ? "checked" : ""}>
              <span class="seq-tl-toggle-track"></span>
            </label>
          </div>
          <div class="seq-tl-card-foot">
            <span class="seq-tl-state">${isOn ? "On" : "Off"}</span>
            <button type="button" class="seq-tl-edit"
                    data-seq-edit="${escapeHtml(s.id)}">Edit the words →</button>
          </div>
        </div>
      </div>`;
  }).join("");

  root.innerHTML = `<div class="seq-timeline">${headerHtml}${stationsHtml}</div>`;

  // Edit → wizard.
  root.querySelectorAll("[data-seq-edit]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      navigateToEdit(btn.dataset.seqEdit);
    });
  });
  // Toggle → POST /toggle, optimistic flip + revert on failure.
  root.querySelectorAll("[data-seq-toggle]").forEach(input => {
    input.addEventListener("change", () => toggleAutomation(input));
  });
  // Quick-setup pill (only visible when 0 are on).
  const quick = root.querySelector("#seqTlQuickStart");
  if (quick) quick.addEventListener("click", showFirstRunOverlay);

  // First-run overlay: show on a true blank slate AND only once.
  let dismissed = false;
  try { dismissed = localStorage.getItem(FIRST_RUN_DISMISS_KEY) === "1"; }
  catch (_) {}
  if (onCount === 0 && !dismissed) {
    setTimeout(showFirstRunOverlay, 250);
  }
}

async function toggleAutomation(input) {
  const id = input.dataset.seqToggle;
  const want = input.checked;
  const row = input.closest(".seq-tl-row");
  const stateLabel = row && row.querySelector(".seq-tl-state");
  if (row) row.classList.toggle("is-on", want);
  if (stateLabel) stateLabel.textContent = want ? "On" : "Off";
  // Optimistically reflect in cached _automations so updateOnCount works.
  const cached = _automations.find(a => a.id === id);
  if (cached) cached.active = want;
  try {
    const res = await fetch(
      `/me/sequences/${encodeURIComponent(id)}/toggle`,
      { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: want }) });
    if (!res.ok) throw new Error("toggle_failed");
    updateOnCount();
  } catch (_) {
    input.checked = !want;
    if (row) row.classList.toggle("is-on", !want);
    if (stateLabel) stateLabel.textContent = !want ? "On" : "Off";
    if (cached) cached.active = !want;
  }
}

function updateOnCount() {
  const root = document.getElementById("engList");
  if (!root) return;
  const total = root.querySelectorAll(".seq-tl-row").length;
  const on    = root.querySelectorAll(".seq-tl-row.is-on").length;
  const el = document.getElementById("seqTlCount");
  if (el) el.innerHTML = `<strong>${on}</strong> of ${total} on`;
  const head = root.querySelector(".seq-tl-head-meta");
  let quick = root.querySelector("#seqTlQuickStart");
  if (on === 0 && !quick && head) {
    quick = document.createElement("button");
    quick.type = "button";
    quick.className = "seq-tl-quick";
    quick.id = "seqTlQuickStart";
    quick.textContent = "Quick setup →";
    quick.addEventListener("click", showFirstRunOverlay);
    head.appendChild(quick);
  } else if (on > 0 && quick) {
    quick.remove();
  }
}

function showFirstRunOverlay() {
  if (document.getElementById("seqFirstRunBg")) return;
  const stationIds = JOURNEY_ORDER.map(j => j.id);
  const presentIds = new Set(_automations.map(a => a.id));
  const recommended = FIRST_RUN_RECOMMENDED
    .filter(id => stationIds.includes(id) && presentIds.has(id));
  if (!recommended.length) return;

  const cardsHtml = recommended.map(id => {
    const ico = AUTOMATION_ICONS[id] || "📩";
    const headline = AUTOMATION_HEADLINES[id] || "";
    const summary  = AUTOMATION_SUMMARIES[id] || AUTOMATION_DESCRIPTIONS[id] || "";
    return `
      <label class="seq-fr-pick">
        <input type="checkbox" data-seq-fr="${escapeHtml(id)}" checked>
        <div class="seq-fr-pick-body">
          <div class="seq-fr-pick-h">
            <span class="seq-fr-pick-ico" aria-hidden="true">${ico}</span>
            <span>${escapeHtml(headline)}</span>
            <span class="seq-fr-pick-rec">Recommended</span>
          </div>
          <p class="seq-fr-pick-sub">${escapeHtml(summary)}</p>
        </div>
        <span class="seq-fr-pick-check">✓</span>
      </label>`;
  }).join("");

  const bg = document.createElement("div");
  bg.id = "seqFirstRunBg";
  bg.className = "seq-fr-bg";
  bg.innerHTML = `
    <div class="seq-fr-card" role="dialog" aria-modal="true">
      <div class="seq-fr-h">
        <div>
          <h2 class="seq-fr-title">Let's get the basics on</h2>
          <p class="seq-fr-sub">We picked the two automations that help every business. Tap "Turn these on" — you can change the words later.</p>
        </div>
        <button type="button" class="seq-fr-x" aria-label="Close">×</button>
      </div>
      <div class="seq-fr-body">${cardsHtml}</div>
      <div class="seq-fr-foot">
        <button type="button" class="seq-fr-skip">I'll pick later</button>
        <button type="button" class="seq-fr-go">Turn these on →</button>
      </div>
    </div>`;
  document.body.appendChild(bg);

  function close() {
    if (bg.parentNode) bg.parentNode.removeChild(bg);
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", onKey);
  bg.addEventListener("click", e => { if (e.target === bg) close(); });
  bg.querySelector(".seq-fr-x").addEventListener("click", close);
  bg.querySelector(".seq-fr-skip").addEventListener("click", () => {
    try { localStorage.setItem(FIRST_RUN_DISMISS_KEY, "1"); } catch (_) {}
    close();
  });
  bg.querySelector(".seq-fr-go").addEventListener("click", async () => {
    const picks = Array.from(bg.querySelectorAll("[data-seq-fr]"))
                      .filter(c => c.checked)
                      .map(c => c.dataset.seqFr);
    const goBtn = bg.querySelector(".seq-fr-go");
    goBtn.disabled = true;
    goBtn.textContent = "Turning on…";
    await Promise.all(picks.map(id => fetch(
      `/me/sequences/${encodeURIComponent(id)}/toggle`,
      { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }) })
    ));
    try { localStorage.setItem(FIRST_RUN_DISMISS_KEY, "1"); } catch (_) {}
    // Reflect the new on-state in the cached list, then re-render.
    picks.forEach(id => {
      const a = _automations.find(x => x.id === id);
      if (a) a.active = true;
    });
    close();
    renderList();
  });
}

function renderRow(a) {
  const stageId = FUNNEL_MAP[a.id] || "interest";
  const stage = STAGE_INFO[stageId];
  const desc = AUTOMATION_DESCRIPTIONS[a.id] || "";
  const status = a.active ? "running" : "paused";
  const name = a.name || a.id || "Automation";
  return `
    <div class="eng-row" data-automation-id="${escapeHtml(a.id)}">
      <div class="eng-row-main">
        <div class="eng-row-name-line">
          <span class="eng-row-status-dot is-${status}" aria-label="${a.active ? 'Running' : 'Paused'}"></span>
          <span class="eng-row-name">${escapeHtml(name)}</span>
        </div>
        <div class="eng-row-meta">
          <span class="eng-stage-chip" data-stage-chip="${stageId}"
                style="border-color:${stage.border};color:${stage.color};background:${stage.chipBg};">
            <span class="eng-stage-chip-dot" style="background:${stage.color}"></span>
            ${escapeHtml(stage.label)}
          </span>
          <span style="color:#cbd5e1;">·</span>
          <span class="eng-row-desc">${escapeHtml(desc)}</span>
        </div>
      </div>
      <button type="button" class="eng-row-edit" data-automation-id="${escapeHtml(a.id)}">Edit</button>
    </div>
  `;
}

function navigateToEdit(automationId) {
  // Reuses the existing edit wizard wired via the campaigns route bundle
  // (#sequence-edit-<id> → appShowRoute → loadAutomationWizard).
  window.location.hash = "sequence-edit-" + automationId;
}

// ─── Filters ────────────────────────────────────────────────────────────────

function refreshFilters() {
  updateFilterPills();
  renderActiveFilters();
  renderList();
}

function clearAllFilters() {
  _filters = { status: null, stage: null, search: "" };
  const inp = document.getElementById("engSearch");
  if (inp) inp.value = "";
  refreshFilters();
}

function updateFilterPills() {
  const map = {
    status: { all: "All",   running: "Running", paused: "Paused" },
    stage:  { all: "All",   interest: "Interest", decision: "Decision",
              action: "Action", awareness: "Awareness" },
  };
  document.querySelectorAll(".eng-filter-pill[data-eng-filter]").forEach(pill => {
    const f = pill.dataset.engFilter;
    const v = _filters[f];
    const valEl = pill.querySelector(".eng-filter-value");
    pill.classList.toggle("is-active", !!v);
    if (valEl) valEl.textContent = v ? (map[f][v] || v) : map[f].all;
  });
}

function renderActiveFilters() {
  const wrap = document.getElementById("engActiveFilters");
  if (!wrap) return;
  const chips = [];
  if (_filters.status) chips.push({ k: "status", label: `Status: ${_filters.status === "running" ? "Running" : "Paused"}` });
  if (_filters.stage)  chips.push({ k: "stage",  label: `Stage: ${STAGE_INFO[_filters.stage]?.label || _filters.stage}` });
  if (!chips.length) {
    wrap.hidden = true;
    wrap.innerHTML = "";
    return;
  }
  wrap.hidden = false;
  wrap.innerHTML = chips.map(c => `
    <span class="eng-active-chip">${escapeHtml(c.label)}
      <button type="button" data-remove="${c.k}" aria-label="Remove filter">×</button>
    </span>
  `).join("") + `<button type="button" class="eng-active-clear-all" id="engActiveClear">Clear all</button>`;
  wrap.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      _filters[btn.dataset.remove] = null;
      refreshFilters();
    });
  });
  const clr = document.getElementById("engActiveClear");
  if (clr) clr.addEventListener("click", clearAllFilters);
}

// ─── Filter dropdown menus ──────────────────────────────────────────────────

function openStatusMenu(anchor) {
  closeOpenMenu();
  const opts = [
    { v: null,      label: "All" },
    { v: "running", label: "Running" },
    { v: "paused",  label: "Paused" },
  ];
  const menu = document.createElement("div");
  menu.className = "eng-menu";
  menu.style.minWidth = "180px";
  menu.innerHTML = opts.map(o => `
    <button type="button" class="eng-menu-item ${_filters.status === o.v ? "is-active" : ""}" data-val="${o.v == null ? "" : escapeHtml(o.v)}">
      <span class="eng-menu-item-main">${escapeHtml(o.label)}</span>
    </button>
  `).join("");
  menu.querySelectorAll(".eng-menu-item").forEach(btn => {
    btn.addEventListener("click", () => {
      _filters.status = btn.dataset.val || null;
      closeOpenMenu();
      refreshFilters();
    });
  });
  positionMenu(menu, anchor);
}

function openStageMenu(anchor) {
  closeOpenMenu();
  const opts = [
    { v: null, label: "All" },
    { v: "interest",  label: "Interest" },
    { v: "decision",  label: "Decision" },
    { v: "action",    label: "Action" },
    { v: "awareness", label: "Awareness" },
  ];
  const menu = document.createElement("div");
  menu.className = "eng-menu";
  menu.style.minWidth = "180px";
  menu.innerHTML = opts.map(o => `
    <button type="button" class="eng-menu-item ${_filters.stage === o.v ? "is-active" : ""}" data-val="${o.v == null ? "" : escapeHtml(o.v)}">
      <span class="eng-menu-item-main">${escapeHtml(o.label)}</span>
    </button>
  `).join("");
  menu.querySelectorAll(".eng-menu-item").forEach(btn => {
    btn.addEventListener("click", () => {
      _filters.stage = btn.dataset.val || null;
      closeOpenMenu();
      refreshFilters();
    });
  });
  positionMenu(menu, anchor);
}

// ─── Help popovers ──────────────────────────────────────────────────────────

function showPopover(anchor, text) {
  const old = document.getElementById("engPopover");
  if (old) old.remove();
  const pop = document.createElement("div");
  pop.id = "engPopover";
  pop.className = "eng-popover";
  pop.textContent = text;
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.position = "fixed";
  pop.style.top = (r.bottom + 8) + "px";
  pop.style.left = Math.max(12, Math.min(window.innerWidth - 360, r.left - 100)) + "px";
  pop.style.zIndex = "10000";
  setTimeout(() => {
    document.addEventListener("click", function dismiss(e) {
      if (!pop.contains(e.target)) {
        pop.remove();
        document.removeEventListener("click", dismiss);
      }
    });
  }, 0);
}

// ─── History tab ────────────────────────────────────────────────────────────

const STEP_TYPE_LABELS = {
  send_email:               "sent email",
  send_sms:                 "sent SMS",
  owner_alert:              "alerted owner",
  ai_conversation:          "handed off to AI",
  wait:                     "waited",
  wait_until_appointment:   "waited until appointment",
};

function formatHistoryTime(ts) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return diffMin + "m ago";
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return diffHr + "h ago";
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return diffDay + "d ago";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function classifyHistoryStatus(rec) {
  if (rec.kind === "step_deferred") return { cls: "is-deferred", label: "Skipped (cap)" };
  if (rec.kind === "tick_error")    return { cls: "is-failed",   label: "Error" };
  if (rec.error)                    return { cls: "is-failed",   label: "Failed" };
  if (rec.sent)                     return { cls: "is-sent",     label: "Sent" };
  // step_fired but not sent: a non-customer step (wait, ai_conversation)
  // — show as "Ran" without a status pill class
  return { cls: "is-skipped", label: "Ran" };
}

async function loadHistory(force) {
  if (_historyLoading) return;
  if (_historyLoaded && !force) return;
  _historyLoading = true;
  const root = document.getElementById("engHistory");
  if (root && !_historyLoaded) {
    root.innerHTML = `<div class="eng-hist-empty">Loading…</div>`;
  }
  try {
    const params = new URLSearchParams();
    params.set("limit", "200");
    if (_historyFilters.sequence_id) {
      params.set("sequence_id", _historyFilters.sequence_id);
    }
    const res = await fetch("/me/sequences/history?" + params.toString(),
      { credentials: "same-origin" });
    if (res.ok) {
      const body = await res.json();
      _history = body.history || [];
      _historyLoaded = true;
    } else {
      _history = [];
    }
  } catch (_) {
    _history = [];
  } finally {
    _historyLoading = false;
    renderHistory();
  }
}

function applyHistoryFilters(list) {
  let out = list.slice();
  const q = (_historyFilters.search || "").trim().toLowerCase();
  if (q) {
    out = out.filter(r => {
      const lead = (r.lead_name || r.lead_id || "").toLowerCase();
      return lead.includes(q);
    });
  }
  return out;
}

function renderHistory() {
  const root = document.getElementById("engHistory");
  if (!root) return;
  if (!_historyLoaded && _historyLoading) return;
  if (!_history.length) {
    root.innerHTML = `
      <div class="eng-hist-empty">
        No activity yet. Once your automations start sending, the events will show up here.
      </div>`;
    return;
  }
  const filtered = applyHistoryFilters(_history);
  if (!filtered.length) {
    root.innerHTML = `<div class="eng-hist-empty">No activity matches that filter.</div>`;
    return;
  }
  root.innerHTML = filtered.map(renderHistoryRow).join("");
}

function renderHistoryRow(r) {
  const stat = classifyHistoryStatus(r);
  const seq = r.sequence_name || r.sequence_id || "(unknown automation)";
  const lead = r.lead_name || r.lead_id || "";
  const stepDesc = STEP_TYPE_LABELS[r.step_type] || r.step_type || r.kind || "ran";
  const reason = r.error || r.reason || "";
  return `
    <div class="eng-hist-row">
      <span class="eng-hist-time">${escapeHtml(formatHistoryTime(r.ts))}</span>
      <div class="eng-hist-body">
        <div class="eng-hist-body-line">
          <span class="eng-hist-seq">${escapeHtml(seq)}</span>
          ${lead ? `<span style="color:#cbd5e1;">·</span><span class="eng-hist-lead">${escapeHtml(lead)}</span>` : ""}
        </div>
        <div class="eng-hist-step">${escapeHtml(stepDesc)}${reason ? " · " + escapeHtml(reason) : ""}</div>
      </div>
      <span class="eng-hist-status ${stat.cls}">${escapeHtml(stat.label)}</span>
    </div>
  `;
}

function populateHistorySequenceFilter() {
  const sel = document.getElementById("engHistorySeq");
  if (!sel) return;
  // Preserve current selection
  const current = sel.value;
  const opts = [`<option value="">All automations</option>`].concat(
    _automations.map(a =>
      `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name || a.id)}</option>`)
  );
  sel.innerHTML = opts.join("");
  if (current) sel.value = current;
}

// ─── Tab switching ──────────────────────────────────────────────────────────

function switchTab(tab) {
  if (tab !== "automations" && tab !== "history") return;
  _activeTab = tab;
  document.querySelectorAll(".eng-tab[data-eng-tab]").forEach(btn => {
    const isActive = btn.dataset.engTab === tab;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  document.querySelectorAll(".eng-tab-pane[data-eng-pane]").forEach(p => {
    p.hidden = p.dataset.engPane !== tab;
  });
  if (tab === "history") {
    populateHistorySequenceFilter();
    loadHistory(false);
  }
}

// ─── Static (one-time) handlers ─────────────────────────────────────────────

function attachStaticHandlers() {
  // Page-level help
  const helpBtn = document.getElementById("engHelpBtn");
  if (helpBtn) helpBtn.addEventListener("click", () => showPopover(helpBtn, PAGE_HELP));

  const listHelp = document.getElementById("engListHelpBtn");
  if (listHelp) listHelp.addEventListener("click", (e) => { e.stopPropagation(); showPopover(listHelp, LIST_HELP); });

  // Filter pills
  const sBtn = document.getElementById("engFilterStatus");
  const stBtn = document.getElementById("engFilterStage");
  if (sBtn)  sBtn.addEventListener("click", (e) => { e.stopPropagation(); openStatusMenu(sBtn); });
  if (stBtn) stBtn.addEventListener("click", (e) => { e.stopPropagation(); openStageMenu(stBtn); });

  // Search (debounced 150ms)
  const search = document.getElementById("engSearch");
  if (search) {
    search.addEventListener("input", () => {
      clearTimeout(_searchDebounce);
      _searchDebounce = setTimeout(() => {
        _filters.search = search.value;
        renderList();
      }, 150);
    });
  }

  // Tab buttons
  document.querySelectorAll(".eng-tab[data-eng-tab]").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.engTab));
  });

  // History sequence filter
  const histSeq = document.getElementById("engHistorySeq");
  if (histSeq) {
    histSeq.addEventListener("change", () => {
      _historyFilters.sequence_id = histSeq.value;
      _historyLoaded = false;
      loadHistory(true);
    });
  }

  // History lead-name search (client-side; debounced)
  const histSearch = document.getElementById("engHistorySearch");
  if (histSearch) {
    histSearch.addEventListener("input", () => {
      clearTimeout(_historySearchDebounce);
      _historySearchDebounce = setTimeout(() => {
        _historyFilters.search = histSearch.value;
        renderHistory();
      }, 150);
    });
  }

  // Close any open menu on outside click
  document.addEventListener("click", (e) => {
    if (_openMenuEl && !_openMenuEl.contains(e.target)) closeOpenMenu();
  }, true);
}

// ─── Top-level render ───────────────────────────────────────────────────────

function renderAll() {
  renderList();
  updateFilterPills();
  renderActiveFilters();
}

// ─── Module init / public exports ───────────────────────────────────────────

export function init() {}

window.loadEngagementSection = loadEngagementSection;
