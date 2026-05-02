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

// Templates surfaced in the "+ New" dropdown. Plain-language labels —
// no "drip", "nurture", "lifecycle".
const TEMPLATE_LIBRARY = [
  { id: "first_contact",       icon: "📨", label: "Welcome new leads",        stage: "interest" },
  { id: "win_back",            icon: "🔄", label: "Bring back cold leads",    stage: "interest" },
  { id: "quote_followup",      icon: "💬", label: "Send a quote reminder",    stage: "decision" },
  { id: "estimate_onboarding", icon: "📋", label: "Confirm estimates",        stage: "decision" },
  { id: "job_onboarding",      icon: "🛠️", label: "Job kickoff prep",        stage: "action"   },
  { id: "during_job",          icon: "📷", label: "During the job",           stage: "action"   },
  { id: "after_job",           icon: "⭐", label: "Thank you after the job",  stage: "action"   },
];

const STAGE_HELP = {
  awareness: "Awareness comes from ads, social, or word-of-mouth. We pick up after a lead reaches you.",
  interest:  "Interest is when someone has reached out. They know you exist — keep their attention warm so they don't forget about you.",
  decision:  "Decision is when they're actively choosing — comparing prices, weighing options. The right follow-up here can win the job.",
  action:    "Action is once they've committed. Keep things smooth and turn them into a repeat customer.",
};

const PAGE_HELP = "Each automation runs on its own. Click any one to see what it does or change the words.";
const LIST_HELP = "Each automation runs on its own. Click any one to see what it does or change the words.";

const ENG_CACHE_KEY = "dashboard.eng_automations";

// ─── Module state ───────────────────────────────────────────────────────────

let _automations = [];
let _filters = { status: null, stage: null, search: "" };
let _openMenuEl = null;
let _searchDebounce = null;
let _initialized = false;

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function showToast(msg) {
  const old = document.querySelector(".eng-toast");
  if (old) old.remove();
  const el = document.createElement("div");
  el.className = "eng-toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
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

  if (_automations.length === 0) {
    root.innerHTML = `
      <div class="eng-empty">
        <div class="eng-empty-emoji" aria-hidden="true">📨</div>
        <div class="eng-empty-h">No automations yet.</div>
        <div class="eng-empty-text">
          Set up your first automation in 2 minutes. We'll pre-fill the words —
          you just review and turn it on.
        </div>
        <button type="button" class="eng-empty-cta" id="engEmptyCta">+ Set up your first automation</button>
      </div>
    `;
    const cta = document.getElementById("engEmptyCta");
    if (cta) cta.addEventListener("click", () => openNewMenu(document.getElementById("engNewBtn")));
    return;
  }

  const filtered = applyFiltersToList(_automations);
  if (filtered.length === 0) {
    root.innerHTML = `
      <div class="eng-no-match">
        No automations match those filters.
        <div><button type="button" id="engClearFilters">Clear filters</button></div>
      </div>
    `;
    const clr = document.getElementById("engClearFilters");
    if (clr) clr.addEventListener("click", clearAllFilters);
    return;
  }

  root.innerHTML = filtered.map(renderRow).join("");
  // Wire row click → edit; Edit button → edit (avoid double-trigger)
  root.querySelectorAll(".eng-row").forEach(row => {
    row.addEventListener("click", (e) => {
      if (e.target.closest(".eng-row-edit")) return;
      const id = row.dataset.automationId;
      if (id) navigateToEdit(id);
    });
  });
  root.querySelectorAll(".eng-row-edit").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.automationId;
      if (id) navigateToEdit(id);
    });
  });
  // Stage chip hover/click → tooltip
  root.querySelectorAll("[data-stage-chip]").forEach(chip => {
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      const stage = chip.dataset.stageChip;
      showPopover(chip, STAGE_HELP[stage] || "");
    });
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

// ─── "+ New" dropdown ───────────────────────────────────────────────────────

function openNewMenu(anchor, preferStage) {
  closeOpenMenu();
  const haveIds = new Set(_automations.map(a => a.id));
  let templates = TEMPLATE_LIBRARY.filter(t => !haveIds.has(t.id));
  if (preferStage) {
    // Preferred stage's templates first
    templates = templates.slice().sort((a, b) => {
      const ap = a.stage === preferStage ? 0 : 1;
      const bp = b.stage === preferStage ? 0 : 1;
      return ap - bp;
    });
  }

  const menu = document.createElement("div");
  menu.className = "eng-menu";

  let prebuiltSection;
  if (templates.length === 0) {
    prebuiltSection = `
      <div class="eng-menu-section">
        <div class="eng-menu-title">Pre-built</div>
        <div class="eng-menu-empty">
          All built-in automations are already added. Open them in the list below to edit.
        </div>
      </div>`;
  } else {
    prebuiltSection = `
      <div class="eng-menu-section">
        <div class="eng-menu-title">Pick what to set up</div>
        ${templates.map(t => {
          const stage = STAGE_INFO[t.stage];
          return `
            <button type="button" class="eng-menu-item" data-template="${escapeHtml(t.id)}">
              <span class="eng-menu-item-icon">${t.icon}</span>
              <span class="eng-menu-item-main">
                <div class="eng-menu-item-title">${escapeHtml(t.label)}</div>
                <div class="eng-menu-item-stage">→ ${escapeHtml(stage.label)}</div>
              </span>
            </button>
          `;
        }).join("")}
      </div>`;
  }

  const customSection = `
    <div class="eng-menu-section">
      <div class="eng-menu-title">Build from scratch</div>
      <button type="button" class="eng-menu-item" data-template="__custom__">
        <span class="eng-menu-item-icon">✨</span>
        <span class="eng-menu-item-main">
          <div class="eng-menu-item-title">Custom automation</div>
          <div class="eng-menu-item-stage">Coming soon</div>
        </span>
      </button>
    </div>`;

  menu.innerHTML = prebuiltSection + customSection;

  menu.querySelectorAll("[data-template]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.template;
      closeOpenMenu();
      if (id === "__custom__") {
        showToast("Custom automation — coming soon.");
        return;
      }
      navigateToEdit(id);
    });
  });

  positionMenu(menu, anchor, { alignRight: true });
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

  // + New
  const newBtn = document.getElementById("engNewBtn");
  if (newBtn) newBtn.addEventListener("click", (e) => { e.stopPropagation(); openNewMenu(newBtn); });

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
