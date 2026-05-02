// web/src/routes/replies.js
//
// Replies route: three-column unibox (sidebar + list + thread).
// Loaded lazily via window.__dashboardLoadRouteModule.
// NOTE: setNavBadge / refreshNavBadge remain here because they are
// called from boot() — which itself fires at module load time — so the
// badge stays live on every page visit, not just when Replies is active.

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
function escHtml(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function relTime(ts) {
  if (!ts) return "";
  const now = Date.now() / 1000;
  const d = Math.max(0, now - ts);
  if (d < 60) return Math.round(d) + "s";
  if (d < 3600) return Math.floor(d / 60) + "m";
  if (d < 86400) return Math.floor(d / 3600) + "h";
  if (d < 86400 * 7) return Math.floor(d / 86400) + "d";
  const dt = new Date(ts * 1000);
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function fmtDateTime(ts) {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleString(undefined,
    { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// ── State ──────────────────────────────────────────────
let allItems = [];
let allCampaigns = [];
let counts = { all: 0, unread: 0, needs_response: 0, resolved: 0 };
let statusFilter = "all";       // all | unread | needs_response | resolved
let campaignFilter = "";         // campaign_id or ""
let pillFilter = "all";          // mirror of statusFilter — pills only set status
let searchTerm = "";
let selectedId = "";
let activeThread = null;        // { reply, campaign, lead, messages, thread_id }
const threadCache = new Map();  // reply_id -> last fetched thread payload
let readDebounce = null;        // setTimeout id for the 1s read-mark
let menuOpen = false;
let noteOpen = false;
let pollTimer = null;

// ── DOM ────────────────────────────────────────────────
const sideEl  = document.getElementById("repSide");
const listEl  = document.getElementById("repList");
const rightEl = document.getElementById("repRight");
const subEl   = document.getElementById("repHeaderSub");
const searchEl = document.getElementById("repSearch");
const pillsEl  = document.getElementById("repPills");
const colsEl   = document.getElementById("repCols");
const shortcutModal = document.getElementById("repShortcutModal");
const navBadge = document.getElementById("appRepliesBadge");
const navTip = document.querySelector("[data-replies-tooltip]");

function setNavBadge(n) {
  if (!navBadge) return;
  if (n > 0) {
    navBadge.textContent = n > 99 ? "99+" : String(n);
    navBadge.hidden = false;
    if (navTip) navTip.textContent = `Replies (${n})`;
  } else {
    navBadge.hidden = true;
    if (navTip) navTip.textContent = "Replies";
  }
}

// ── Filtering ──────────────────────────────────────────
function visibleItems() {
  let items = allItems.slice();
  if (statusFilter === "unread") {
    items = items.filter(r => !r.read_at && !r.resolved_at && !r.auto_unsubscribed);
  } else if (statusFilter === "needs_response") {
    items = items.filter(r => r.needs_response && !r.resolved_at);
  } else if (statusFilter === "resolved") {
    items = items.filter(r => r.resolved_at);
  }
  if (campaignFilter) items = items.filter(r => r.campaign_id === campaignFilter);
  if (searchTerm) {
    const q = searchTerm.toLowerCase();
    items = items.filter(r => {
      const lead = r.lead || {};
      return (
        (r.from_name || "").toLowerCase().includes(q) ||
        (r.from_email || "").toLowerCase().includes(q) ||
        (r.subject || "").toLowerCase().includes(q) ||
        (r.snippet || "").toLowerCase().includes(q) ||
        ((lead.first_name || "") + " " + (lead.last_name || "")).toLowerCase().includes(q)
      );
    });
  }
  return items;
}

// ── Render: header + sidebar ───────────────────────────
function renderHeader() {
  const u = counts.unread || 0;
  const n = counts.needs_response || 0;
  subEl.textContent = `${u} unread · ${n} need response`;
}

function renderSidebar() {
  const filters = [
    { key: "all",            label: "All",          count: counts.all },
    { key: "unread",         label: "Unread",       count: counts.unread, dot: true },
    { key: "needs_response", label: "Needs response", count: counts.needs_response },
    { key: "resolved",       label: "Resolved",     count: counts.resolved },
  ];
  const filterRows = filters.map(f => `
    <div class="rep-filter-row ${statusFilter === f.key ? "is-active" : ""}" data-status="${f.key}">
      ${f.dot ? `<span class="rep-filter-dot"></span>` : ""}
      <span class="rep-filter-name">${escHtml(f.label)}</span>
      <span class="rep-filter-count">${f.count}</span>
    </div>
  `).join("");

  const campRows = allCampaigns.map(c => `
    <div class="rep-filter-row ${campaignFilter === c.id ? "is-active" : ""}" data-campaign-id="${escHtml(c.id)}">
      <span class="rep-filter-name">${escHtml(c.name)}</span>
      <span class="rep-filter-count">${c.count}</span>
    </div>
  `).join("") || `<div style="font-size:11.5px;color:#a1a1aa;padding:0 8px;">No replies yet.</div>`;

  const showClear = statusFilter !== "all" || campaignFilter || searchTerm;
  sideEl.innerHTML = `
    <div class="rep-side-section">${filterRows}</div>
    <div class="rep-side-section">
      <h5>Campaigns</h5>
      ${campRows}
    </div>
    ${showClear ? `<div class="rep-side-clear" id="repClearFilters">Clear filters</div>` : ""}
  `;
  sideEl.querySelectorAll("[data-status]").forEach(el => {
    el.addEventListener("click", () => {
      statusFilter = el.dataset.status;
      pillFilter = ["all","unread","needs_response"].includes(statusFilter) ? statusFilter : "all";
      renderAll();
    });
  });
  sideEl.querySelectorAll("[data-campaign-id]").forEach(el => {
    el.addEventListener("click", () => {
      campaignFilter = (campaignFilter === el.dataset.campaignId) ? "" : el.dataset.campaignId;
      renderAll();
    });
  });
  const clearBtn = document.getElementById("repClearFilters");
  if (clearBtn) clearBtn.addEventListener("click", () => {
    statusFilter = "all"; campaignFilter = ""; searchTerm = "";
    searchEl.value = ""; pillFilter = "all"; renderAll();
  });
}

// ── Render: list + pills ───────────────────────────────
function renderPills() {
  pillsEl.querySelectorAll("[data-pill]").forEach(p => {
    p.classList.toggle("is-active", p.dataset.pill === pillFilter);
  });
}

function renderList(prevIds) {
  const items = visibleItems();
  if (!items.length) {
    listEl.innerHTML = `<div class="rep-list-empty">${
      allItems.length === 0
        ? "Replies to your JustGotALead campaigns will appear here."
        : "No replies match this filter."}</div>`;
    return;
  }
  const html = items.map(r => {
    const lead = r.lead || {};
    const display = (lead.first_name || lead.last_name)
      ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim()
      : (r.from_name || r.from_email || "Customer");
    const isUnread = !r.read_at && !r.resolved_at && !r.auto_unsubscribed;
    const isResolved = !!r.resolved_at;
    const isUnsub = !!r.auto_unsubscribed;
    const isFresh = prevIds && !prevIds.has(r.id);
    const cls = [
      "rep-row",
      selectedId === r.id ? "is-selected" : "",
      isUnread ? "is-unread" : "",
      isResolved ? "is-resolved" : "",
      isUnsub ? "is-unsub" : "",
      isFresh ? "is-fresh" : "",
    ].filter(Boolean).join(" ");
    const ariaParts = [display, r.snippet || "", relTime(r.received_at), isUnread ? "unread" : "read"];
    return `<div class="${cls}" data-reply-id="${escHtml(r.id)}"
                 role="button" tabindex="0"
                 aria-label="${escHtml(ariaParts.join(", "))}">
      <div class="rep-row-dots">
        <span class="rep-row-unread ${isUnread ? "" : "is-empty"}"></span>
        <span class="rep-row-color" style="background:${colorFor(lead.id || r.from_email)}"></span>
      </div>
      <div class="rep-row-content">
        <div class="rep-row-top">
          <span class="rep-row-name">${escHtml(display)}</span>
          <span class="rep-row-time">${escHtml(relTime(r.received_at))}</span>
        </div>
        <div class="rep-row-snippet">${escHtml(r.snippet || "")}</div>
        <div class="rep-row-camp">${escHtml(r.campaign_name || "")}</div>
      </div>
      <button type="button" class="rep-row-kebab" data-row-kebab="${escHtml(r.id)}" aria-label="Row actions" title="Actions">⋮</button>
    </div>`;
  }).join("");
  listEl.innerHTML = html;
  listEl.querySelectorAll(".rep-row").forEach(row => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("[data-row-kebab]")) return;
      selectReply(row.dataset.replyId);
    });
  });
  listEl.querySelectorAll("[data-row-kebab]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openRowMenu(btn.dataset.rowKebab, btn);
    });
  });
}

// ── Render: thread + composer ──────────────────────────
function renderEmptyRight() {
  rightEl.innerHTML = `<div class="rep-empty-right">Select a reply to view the thread.</div>`;
}

// ── Messenger-style thread rendering ───────────────────
function _msgGap(a, b) {
  if (!a || !b) return true;
  if (a.direction !== b.direction) return true;
  const da = (a.from_email || "").toLowerCase();
  const db = (b.from_email || "").toLowerCase();
  if (da && db && da !== db) return true;
  const dt = Math.abs((b.received_at || 0) - (a.received_at || 0));
  return dt > 5 * 60;
}
function _dayKey(ts) {
  const d = new Date((ts || 0) * 1000);
  return d.toISOString().slice(0, 10);
}
function _formatDayDivider(ts) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const today = new Date(); today.setHours(0,0,0,0);
  const yest  = new Date(today); yest.setDate(yest.getDate() - 1);
  const that  = new Date(d);     that.setHours(0,0,0,0);
  if (that.getTime() === today.getTime()) return "Today";
  if (that.getTime() === yest.getTime())  return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function _formatBubbleTime(ts) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const today = new Date(); today.setHours(0,0,0,0);
  const that  = new Date(d); that.setHours(0,0,0,0);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (that.getTime() === today.getTime()) return time;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " · " + time;
}
function _initials(name, email) {
  const src = (name || "").trim() || (email || "").split("@")[0] || "?";
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
function renderThreadMessages(messages, ctx) {
  if (!messages.length) return "";
  const lead = (ctx && ctx.lead) || {};
  const sorted = messages.slice().sort((a, b) => (a.received_at || 0) - (b.received_at || 0));
  const groups = [];
  for (const m of sorted) {
    const last = groups[groups.length - 1];
    if (last && !_msgGap(last.messages[last.messages.length - 1], m)) {
      last.messages.push(m);
    } else {
      groups.push({
        direction: m.direction === "outbound" ? "is-out"
                 : m.direction === "note"     ? "is-note"
                 : "is-in",
        messages: [m],
      });
    }
  }
  let lastDay = "";
  const html = [];
  groups.forEach((g, gi) => {
    const first = g.messages[0];
    const dk = _dayKey(first.received_at);
    if (dk && dk !== lastDay) {
      html.push(`<div class="rep-day-divider">${escHtml(_formatDayDivider(first.received_at))}</div>`);
      lastDay = dk;
    }
    const isOut  = g.direction === "is-out";
    const isNote = g.direction === "is-note";
    const isFirstFromSender = (gi === 0) || groups[gi - 1].direction !== g.direction;
    const groupCls = ["rep-msg-group", g.direction,
      isFirstFromSender ? "is-first" : "is-grouped",
      (gi === groups.length - 1) ? "is-last" : ""].filter(Boolean).join(" ");

    let avatar = "";
    if (!isNote) {
      const initials = isOut ? "Y"
        : _initials(first.from_name, first.from_email || (lead.email || ""));
      const colorSeed = isOut ? "you" : (lead.id || first.from_email || "x");
      const bg = isOut ? "#185FA5" : colorFor(colorSeed);
      avatar = `<div class="rep-avatar" style="background:${bg}">${escHtml(initials)}</div>`;
    }

    const senderLabel = (!isOut && !isNote && isFirstFromSender)
      ? (first.from_name || first.from_email || "Customer")
      : "";

    const lastMsg = g.messages[g.messages.length - 1];
    const timeLabel = _formatBubbleTime(lastMsg.received_at);

    const bubbles = g.messages.map((m, mi) => {
      let pos = "is-only";
      if (g.messages.length > 1) {
        if (mi === 0) pos = "is-first";
        else if (mi === g.messages.length - 1) pos = "is-last";
        else pos = "is-mid";
      }
      const cls = ["rep-msg", g.direction, pos].join(" ");
      const body = isNote
        ? "📝 " + (m.body_text || "")
        : (m.body_text || "");
      return `<div class="${cls}" data-msg-id="${escHtml(m.id || "")}">${escHtml(body)}</div>`;
    }).join("");

    html.push(`<div class="${groupCls}">
      ${avatar}
      <div class="rep-msg-stack">
        ${senderLabel ? `<div class="rep-msg-sender">${escHtml(senderLabel)}</div>` : ""}
        ${bubbles}
        <div class="rep-msg-time">${escHtml(timeLabel)}${isOut ? " · Sent" : ""}</div>
      </div>
    </div>`);
  });
  return html.join("");
}

function renderThread() {
  if (!activeThread) return renderEmptyRight();
  const { reply, campaign, lead, messages } = activeThread;
  const display = (lead.first_name || lead.last_name)
    ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim()
    : (reply.from_name || reply.from_email || "Customer");
  const dot = colorFor(lead.id || reply.from_email);
  const sourceBits = [];
  if (campaign.name) sourceBits.push(`From <strong>${escHtml(campaign.name)}</strong>`);
  if (lead.source) sourceBits.push(escHtml(lead.source) + " lead");
  if (lead.created_at) sourceBits.push(fmtDateTime(lead.created_at));
  const leadHref = lead.id ? `#leads&lead=${encodeURIComponent(lead.id)}` : "#leads";
  const showUnsubBanner = !!reply.auto_unsubscribed;

  const msgsHtml = renderThreadMessages(messages || [], { lead, reply });

  rightEl.innerHTML = `
    <div class="rep-context">
      <div class="rep-context-row1">
        <span class="rep-context-color" style="background:${dot}"></span>
        <span class="rep-context-name">${escHtml(display)}</span>
        <span class="rep-context-meta">${escHtml(lead.email || reply.from_email || "")}${lead.phone ? " · " + escHtml(lead.phone) : ""}</span>
      </div>
      <div class="rep-context-row2">
        ${sourceBits.join(" · ")}
        ${lead.id ? ` · <a href="${leadHref}" target="_blank">View full lead →</a>` : ""}
      </div>
    </div>
    ${showUnsubBanner ? `<div class="rep-unsub-banner">This customer was automatically unsubscribed because their reply contained "unsubscribe" or similar language. They will not receive future campaigns.</div>` : ""}
    <div class="rep-thread" id="repThread" role="log" aria-live="polite">
      ${msgsHtml || `<div class="rep-empty-right">No messages yet.</div>`}
      <div id="repApptSuggestion"></div>
    </div>
    <div class="rep-note-composer" id="repNoteComposer" ${noteOpen ? "" : "hidden"}>
      <h6>Add an internal note</h6>
      <textarea id="repNoteText" placeholder="Note for yourself or your team. Not sent to the customer."></textarea>
      <div class="rep-note-composer-actions">
        <button type="button" class="rep-btn-ghost" id="repNoteCancel">Cancel</button>
        <button type="button" class="rep-send-main" style="border-radius:6px;" id="repNoteSave">Save note</button>
      </div>
    </div>
    <div class="rep-composer">
      <textarea id="repComposer" placeholder="Type your reply…" aria-label="Reply to ${escHtml(display)}"></textarea>
      <div class="rep-composer-actions">
        <div></div>
        <div class="rep-action-row-right">
          <button type="button" class="rep-btn-ghost" id="repHeaderKebab" aria-label="More actions" title="Status & delete">⋯</button>
          <button type="button" class="rep-btn-ghost" id="repMarkResolved">${reply.resolved_at ? "Mark unresolved" : "Mark resolved"}</button>
          <div class="rep-send-split">
            <button type="button" class="rep-send-main" id="repSendBtn">Send</button>
            <button type="button" class="rep-send-caret" id="repSendCaret" aria-haspopup="menu">▾</button>
            <div class="rep-send-menu" id="repSendMenu" hidden role="menu">
              <div class="rep-send-menu-item" data-send-mode="send">Send</div>
              <div class="rep-send-menu-item" data-send-mode="send_resolve">Send and mark resolved</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  const threadEl = document.getElementById("repThread");
  if (threadEl) threadEl.scrollTop = threadEl.scrollHeight;

  const noteCancel = document.getElementById("repNoteCancel");
  const noteSave   = document.getElementById("repNoteSave");
  if (noteCancel) noteCancel.addEventListener("click", () => { noteOpen = false; renderThread(); });
  if (noteSave)   noteSave.addEventListener("click", saveNote);

  document.getElementById("repMarkResolved").addEventListener("click", toggleResolved);
  const headerKebab = document.getElementById("repHeaderKebab");
  if (headerKebab) headerKebab.addEventListener("click", (e) => {
    e.stopPropagation();
    openRowMenu(selectedId, headerKebab);
  });
  document.getElementById("repSendBtn").addEventListener("click", () => sendReply(false));
  const caret = document.getElementById("repSendCaret");
  const menu = document.getElementById("repSendMenu");
  caret.addEventListener("click", (e) => {
    e.stopPropagation();
    menuOpen = !menuOpen;
    menu.hidden = !menuOpen;
  });
  document.addEventListener("click", () => { if (menuOpen) { menuOpen = false; menu.hidden = true; } }, { once: true });
  menu.querySelectorAll("[data-send-mode]").forEach(item => {
    item.addEventListener("click", () => {
      menu.hidden = true; menuOpen = false;
      sendReply(item.dataset.sendMode === "send_resolve");
    });
  });

  if (selectedId && !reply.auto_unsubscribed) {
    maybeAnalyzeAndRenderAppt(selectedId);
  }
}

// ── Appointment suggestion (LLM) ───────────────────────
const apptCache = new Map();
const apptInflight = new Set();
const apptAttempted = new Map();

function _lastInboundId(messages) {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    const dir = m.direction || "inbound";
    if (dir === "inbound") return m.id || "";
  }
  return "";
}
function _renderApptCard(replyId, analysis) {
  const host = document.getElementById("repApptSuggestion");
  if (!host) return;
  if (selectedId !== replyId) return;
  host.innerHTML = "";
  if (!analysis) return;
  if (!analysis.is_appointment_confirmed) return;
  if ((analysis.confidence || 0) < 0.8) return;
  if (analysis.user_action === "dismissed") return;

  const isAdded = analysis.user_action === "added_to_calendar" && !!analysis.calendar_event_id;
  const apptDate = analysis.appointment_at
    ? new Date(analysis.appointment_at * 1000)
    : null;
  const whenLabel = apptDate
    ? apptDate.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "Time unknown";
  const dur = analysis.appointment_duration_minutes || 60;
  const summary = analysis.appointment_summary || "Appointment with this customer";

  const card = document.createElement("div");
  card.className = "rep-appt-card" + (isAdded ? " is-added" : "");
  card.innerHTML = `
    <div class="rep-appt-icon">${isAdded ? "✓" : "📅"}</div>
    <div class="rep-appt-body">
      <div class="rep-appt-title">${isAdded ? "Added to your calendar" : "Looks like an appointment"}</div>
      <div class="rep-appt-when">${escHtml(whenLabel)} · ${dur} min</div>
      <div class="rep-appt-summary">${escHtml(summary)}</div>
      <div class="rep-appt-actions"></div>
    </div>
  `;
  const actions = card.querySelector(".rep-appt-actions");
  if (!isAdded) {
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "rep-appt-btn";
    addBtn.textContent = "Add to Calendar";
    addBtn.addEventListener("click", () => addAppointment(replyId, addBtn));
    const dismissBtn = document.createElement("button");
    dismissBtn.type = "button";
    dismissBtn.className = "rep-appt-btn is-ghost";
    dismissBtn.textContent = "Dismiss";
    dismissBtn.addEventListener("click", () => dismissAppointment(replyId, card));
    actions.appendChild(addBtn);
    actions.appendChild(dismissBtn);
  }
  host.appendChild(card);
}

async function maybeAnalyzeAndRenderAppt(replyId) {
  if (apptInflight.has(replyId)) return;
  const messages = (activeThread && activeThread.messages) || [];
  const inboundId = _lastInboundId(messages);
  if (!inboundId) {
    _renderApptCard(replyId, null);
    return;
  }
  const cached = apptCache.get(replyId);
  const lastAttempted = apptAttempted.get(replyId);
  if (cached && lastAttempted === inboundId) {
    _renderApptCard(replyId, cached);
    return;
  }
  apptInflight.add(replyId);
  try {
    const res = await fetch(`/me/replies/${encodeURIComponent(replyId)}/analyze`,
      { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}) });
    if (!res.ok) return;
    const data = await res.json();
    apptCache.set(replyId, data);
    apptAttempted.set(replyId, inboundId);
    _renderApptCard(replyId, data);
  } catch (_) {
    /* silent — feature is best-effort */
  } finally {
    apptInflight.delete(replyId);
  }
}

async function dismissAppointment(replyId, cardEl) {
  if (cardEl) cardEl.classList.add("rep-appt-fadeout");
  setTimeout(() => { if (cardEl && cardEl.parentNode) cardEl.parentNode.removeChild(cardEl); }, 200);
  const cached = apptCache.get(replyId);
  if (cached) { cached.user_action = "dismissed"; apptCache.set(replyId, cached); }
  try {
    await fetch(`/me/replies/${encodeURIComponent(replyId)}/dismiss-appointment`,
      { method: "POST", credentials: "same-origin" });
  } catch (_) {}
}

async function addAppointment(replyId, btn) {
  const prev = btn.textContent;
  btn.disabled = true; btn.textContent = "Adding…";
  try {
    const res = await fetch(`/me/replies/${encodeURIComponent(replyId)}/add-to-calendar`,
      { method: "POST", credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      btn.disabled = false; btn.textContent = prev;
      const msg = data.error === "calendar_not_connected"
        ? "Connect Google Calendar in the Calendar tab first."
        : (data.error || "Couldn't add to calendar.");
      toast(msg, true);
      return;
    }
    const refreshed = apptCache.get(replyId) || {};
    refreshed.user_action = "added_to_calendar";
    refreshed.calendar_event_id = data.calendar_event_id;
    apptCache.set(replyId, refreshed);
    _renderApptCard(replyId, refreshed);
    toast("Added to your calendar.");
  } catch (_) {
    btn.disabled = false; btn.textContent = prev;
    toast("Network error.", true);
  }
}

function renderAll() {
  renderHeader();
  renderSidebar();
  renderPills();
  renderList();
  renderThread();
}

// ── Selection + read debounce ──────────────────────────
function selectReply(id, opts) {
  opts = opts || {};
  if (!id || id === "undefined") return;
  const prev = selectedId;
  selectedId = id;
  if (readDebounce) { clearTimeout(readDebounce); readDebounce = null; }
  listEl.querySelectorAll(".rep-row").forEach(row => {
    row.classList.toggle("is-selected", row.dataset.replyId === id);
  });
  const item = allItems.find(r => r.id === id);
  if (!item) return;

  const cached = threadCache.get(id);
  if (cached) {
    activeThread = cached;
    renderThread();
  } else {
    rightEl.innerHTML = `<div class="rep-empty-right">Loading thread…</div>`;
  }

  if (window.innerWidth <= 767) colsEl.dataset.mobilePane = "right";

  fetchThread(id).then(payload => {
    if (selectedId !== id) return;
    activeThread = payload;
    threadCache.set(id, payload);
    renderThread();
  }).catch(() => {
    if (selectedId === id) rightEl.innerHTML = `<div class="rep-empty-right">Couldn't load thread.</div>`;
  });

  if (!item.read_at && !item.auto_unsubscribed && !opts.skipReadMark) {
    readDebounce = setTimeout(() => {
      if (selectedId === id) markRead(id);
    }, 1000);
  }
}

async function fetchThread(id) {
  if (!id || id === "undefined") throw new Error("missing reply id");
  const res = await fetch(`/me/replies/${encodeURIComponent(id)}/thread`,
    { credentials: "same-origin" });
  if (!res.ok) throw new Error("thread fetch failed");
  return await res.json();
}

// ── Per-row + thread-header action menu ───────────────
function openRowMenu(replyId, anchorEl) {
  const item = allItems.find(r => r.id === replyId);
  if (!item) return;
  closeAnyMenu();
  const isResolved = !!item.resolved_at;
  const isRead = !!item.read_at;
  const menu = document.createElement("div");
  menu.className = "rep-row-menu";
  menu.dataset.menuFor = replyId;
  menu.innerHTML = `
    <div class="rep-send-menu-item" data-act="${isRead ? "unread" : "read"}">${isRead ? "Mark as unread" : "Mark as read"}</div>
    <div class="rep-send-menu-item" data-act="${isResolved ? "unresolve" : "resolve"}">${isResolved ? "Mark as open" : "Mark as resolved"}</div>
    <div class="rep-send-menu-item is-danger" data-act="delete">Delete</div>
  `;
  document.body.appendChild(menu);
  const rect = anchorEl.getBoundingClientRect();
  menu.style.position = "fixed";
  menu.style.top  = (rect.bottom + 4) + "px";
  menu.style.left = (rect.right - menu.offsetWidth) + "px";
  const mr = menu.getBoundingClientRect();
  menu.style.left = Math.max(8, rect.right - mr.width) + "px";
  menu.querySelectorAll("[data-act]").forEach(it => {
    it.addEventListener("click", (e) => {
      e.stopPropagation();
      handleRowAction(replyId, it.dataset.act);
      closeAnyMenu();
    });
  });
  setTimeout(() => {
    document.addEventListener("click", closeAnyMenu, { once: true });
  }, 0);
}
function closeAnyMenu() {
  document.querySelectorAll(".rep-row-menu").forEach(m => m.remove());
}

async function handleRowAction(replyId, action) {
  const item = allItems.find(r => r.id === replyId);
  if (!item && action !== "delete") return;
  if (action === "read")      return markRead(replyId);
  if (action === "unread")    return markUnread(replyId);
  if (action === "resolve")   return setResolved(replyId, true);
  if (action === "unresolve") return setResolved(replyId, false);
  if (action === "delete")    return deleteReply(replyId);
}

async function setResolved(replyId, value) {
  const item = allItems.find(r => r.id === replyId);
  if (!item) return;
  const wasResolved = !!item.resolved_at;
  if (value === wasResolved) return;
  item.resolved_at = value ? Math.floor(Date.now() / 1000) : null;
  if (value) counts.resolved = (counts.resolved || 0) + 1;
  else       counts.resolved = Math.max(0, counts.resolved - 1);
  if (activeThread && activeThread.reply && activeThread.reply.id === replyId) {
    activeThread.reply.resolved_at = item.resolved_at;
  }
  renderHeader(); renderSidebar(); renderList(); renderThread();
  try {
    await fetch(`/me/replies/${encodeURIComponent(replyId)}/resolve`,
      { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: !value }) });
  } catch (_) {}
}

async function deleteReply(replyId) {
  const item = allItems.find(r => r.id === replyId);
  if (!item) return;
  const display = (item.lead && (item.lead.first_name || item.lead.last_name))
    ? `${item.lead.first_name || ""} ${item.lead.last_name || ""}`.trim()
    : (item.from_name || item.from_email || "this reply");
  if (!window.confirm(`Delete the reply from ${display}? The Gmail thread isn't touched — this just removes it from your inbox.`)) return;
  const wasUnread = !item.read_at && !item.resolved_at && !item.auto_unsubscribed;
  const wasResolved = !!item.resolved_at;
  const wasNeedsResp = !!item.needs_response && !wasResolved;
  allItems = allItems.filter(r => r.id !== replyId);
  threadCache.delete(replyId);
  counts.all = Math.max(0, counts.all - 1);
  if (wasUnread)    counts.unread        = Math.max(0, counts.unread - 1);
  if (wasResolved)  counts.resolved      = Math.max(0, counts.resolved - 1);
  if (wasNeedsResp) counts.needs_response = Math.max(0, counts.needs_response - 1);
  if (selectedId === replyId) {
    selectedId = "";
    activeThread = null;
    const ids = visibleItems().map(r => r.id);
    if (ids.length) selectReply(ids[0], { skipReadMark: true });
  }
  renderAll();
  try {
    const res = await fetch(`/me/replies/${encodeURIComponent(replyId)}`,
      { method: "DELETE", credentials: "same-origin" });
    if (!res.ok) {
      toast("Couldn't delete — refresh to recover.", true);
    } else {
      refreshNavBadge();
    }
  } catch (_) {
    toast("Network error.", true);
  }
}

async function markRead(id) {
  const item = allItems.find(r => r.id === id);
  if (!item || item.read_at) return;
  item.read_at = Math.floor(Date.now() / 1000);
  counts.unread = Math.max(0, counts.unread - 1);
  renderHeader(); renderSidebar(); renderList();
  try {
    await fetch(`/me/replies/${encodeURIComponent(id)}/read`,
      { method: "POST", credentials: "same-origin" });
    refreshNavBadge();
  } catch (_) {}
}

async function markUnread(id) {
  const item = allItems.find(r => r.id === id);
  if (!item) return;
  item.read_at = null;
  counts.unread = (counts.unread || 0) + 1;
  renderHeader(); renderSidebar(); renderList();
  try {
    await fetch(`/me/replies/${encodeURIComponent(id)}/unread`,
      { method: "POST", credentials: "same-origin" });
    refreshNavBadge();
  } catch (_) {}
}

async function toggleResolved() {
  if (!selectedId || !activeThread) return;
  const item = allItems.find(r => r.id === selectedId);
  if (!item) return;
  const wasResolved = !!item.resolved_at;
  item.resolved_at = wasResolved ? null : Math.floor(Date.now() / 1000);
  if (wasResolved) counts.resolved = Math.max(0, counts.resolved - 1);
  else             counts.resolved = (counts.resolved || 0) + 1;
  if (activeThread.reply) activeThread.reply.resolved_at = item.resolved_at;
  renderHeader(); renderSidebar(); renderList(); renderThread();
  try {
    await fetch(`/me/replies/${encodeURIComponent(selectedId)}/resolve`,
      { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: wasResolved }) });
  } catch (_) {}
}

async function sendReply(markResolved) {
  if (!selectedId || !activeThread) return;
  const ta = document.getElementById("repComposer");
  if (!ta) return;
  const body = ta.value.trim();
  if (!body) return;
  const sendBtn = document.getElementById("repSendBtn");
  const caret   = document.getElementById("repSendCaret");
  const now = Math.floor(Date.now() / 1000);
  const optimistic = {
    id: `pending_${now}`,
    direction: "outbound",
    from_name: "You",
    from_email: activeThread.campaign.from_address || "",
    body_text: body,
    received_at: now,
  };
  activeThread.messages = (activeThread.messages || []).concat([optimistic]);
  const savedTextarea = ta.value;
  ta.value = "";
  renderThread();
  sendBtn.disabled = true; caret.disabled = true;
  try {
    const res = await fetch(`/me/replies/${encodeURIComponent(selectedId)}/send`,
      { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, mark_resolved: !!markResolved }) });
    if (!res.ok) {
      activeThread.messages = activeThread.messages.filter(m => m.id !== optimistic.id);
      const data = await res.json().catch(() => ({}));
      renderThread();
      const restored = document.getElementById("repComposer");
      if (restored) restored.value = savedTextarea;
      toast("Couldn't send — try again.", true);
      return;
    }
    const data = await res.json();
    activeThread.messages = activeThread.messages.map(m => m.id === optimistic.id ? Object.assign({}, m, data.message, { id: data.message.id }) : m);
    threadCache.set(selectedId, activeThread);
    if (markResolved) {
      const item = allItems.find(r => r.id === selectedId);
      if (item) item.resolved_at = now;
      if (activeThread.reply) activeThread.reply.resolved_at = now;
      counts.resolved = (counts.resolved || 0) + 1;
    }
    renderAll();
  } catch (_) {
    activeThread.messages = activeThread.messages.filter(m => m.id !== optimistic.id);
    renderThread();
    const restored = document.getElementById("repComposer");
    if (restored) restored.value = savedTextarea;
    toast("Network error.", true);
  } finally {
    sendBtn.disabled = false; caret.disabled = false;
  }
}

async function saveNote() {
  const ta = document.getElementById("repNoteText");
  if (!ta || !selectedId) return;
  const text = ta.value.trim();
  if (!text) return;
  try {
    const res = await fetch(`/me/replies/${encodeURIComponent(selectedId)}/note`,
      { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }) });
    if (!res.ok) { toast("Couldn't save note.", true); return; }
    const now = Math.floor(Date.now() / 1000);
    if (activeThread) {
      activeThread.messages = (activeThread.messages || []).concat([{
        id: `note_${now}`, direction: "note", from_name: "You",
        body_text: "📝 " + text, received_at: now,
      }]);
    }
    noteOpen = false;
    renderThread();
    const thread = document.getElementById("repThread");
    if (thread && thread.lastElementChild) {
      thread.lastElementChild.classList.remove("is-out", "is-in");
      thread.lastElementChild.classList.add("is-note");
    }
    toast("Note saved.");
  } catch (_) { toast("Network error.", true); }
}

function toast(msg, isError) {
  let host = document.getElementById("repToast");
  if (!host) {
    host = document.createElement("div");
    host.id = "repToast";
    host.className = "rep-toast";
    document.body.appendChild(host);
  }
  host.textContent = msg;
  host.classList.toggle("is-error", !!isError);
  host.style.opacity = "1";
  clearTimeout(host._t);
  host._t = setTimeout(() => { host.style.opacity = "0"; host.style.transition = "opacity 250ms"; setTimeout(() => host.remove(), 300); }, 2000);
}

// ── Loading ────────────────────────────────────────────
async function _fetchListOnce() {
  const res = await fetch("/me/replies", { credentials: "same-origin" });
  if (!res.ok) return null;
  return await res.json();
}
function _applyListPayload(data) {
  const prevIds = new Set(allItems.map(r => r.id));
  allItems = (data.items || []).filter(r => r && r.id && r.id !== "undefined");
  allCampaigns = data.campaigns || [];
  counts = data.counts || counts;
  if (!selectedId && allItems.length && allItems[0].id) {
    selectedId = allItems[0].id;
    selectReply(selectedId, { skipReadMark: true });
  }
  return prevIds;
}
async function loadAll(opts) {
  opts = opts || {};
  try {
    const data = await _fetchListOnce();
    if (data) {
      const prevIds = _applyListPayload(data);
      setNavBadge(counts.unread || 0);
      renderHeader(); renderSidebar(); renderPills();
      renderList(prevIds);
    }
  } catch (_) { /* silent */ }
  if (opts.skipPoll) return;
  try {
    const pollPromise = fetch("/me/replies/poll",
      { method: "POST", credentials: "same-origin" });
    await pollPromise;
    const data2 = await _fetchListOnce();
    if (!data2) return;
    const newIds = (data2.items || []).map(r => r.id);
    const oldIds = allItems.map(r => r.id);
    const same = newIds.length === oldIds.length
      && newIds.every((id, i) => id === oldIds[i]);
    if (same && (data2.counts || {}).unread === counts.unread) return;
    const prevIds = _applyListPayload(data2);
    setNavBadge(counts.unread || 0);
    renderHeader(); renderSidebar(); renderPills();
    renderList(prevIds);
  } catch (_) { /* silent */ }
  return;
}
async function refreshNavBadge() {
  try {
    const res = await fetch("/me/replies/unread-count", { credentials: "same-origin" });
    if (!res.ok) return;
    const data = await res.json();
    setNavBadge(data.count || 0);
  } catch (_) {}
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (document.querySelector('[data-route-section="replies"]')?.classList.contains("is-active")) {
      loadAll({ skipPoll: true });
    } else {
      refreshNavBadge();
    }
  }, 30000);
}
// Manual "Check now" button — runs a synchronous Gmail sync.
const checkNowBtn = document.getElementById("repCheckNow");
if (checkNowBtn) {
  checkNowBtn.addEventListener("click", async () => {
    const label = checkNowBtn.querySelector("[data-check-label]");
    const prev  = label ? label.textContent : "";
    if (label) label.textContent = "Checking…";
    checkNowBtn.disabled = true;
    await loadAll();
    if (label) label.textContent = prev || "Check now";
    checkNowBtn.disabled = false;
  });
}
function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

// ── Pills + search ─────────────────────────────────────
pillsEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-pill]");
  if (!btn) return;
  pillFilter = btn.dataset.pill;
  statusFilter = pillFilter;
  renderAll();
});
let searchT = null;
searchEl.addEventListener("input", () => {
  clearTimeout(searchT);
  searchT = setTimeout(() => { searchTerm = searchEl.value.trim(); renderList(); renderSidebar(); }, 200);
});

// ── Keyboard shortcuts ─────────────────────────────────
function visibleIds() { return visibleItems().map(r => r.id); }
function nudge(delta) {
  const ids = visibleIds();
  if (!ids.length) return;
  const idx = Math.max(0, ids.indexOf(selectedId));
  const next = ids[Math.min(ids.length - 1, Math.max(0, idx + delta))];
  if (next && next !== selectedId) selectReply(next);
}

document.addEventListener("keydown", (e) => {
  const sec = document.querySelector('[data-route-section="replies"]');
  if (!sec || !sec.classList.contains("is-active")) return;
  const tag = (e.target && e.target.tagName) || "";
  const inField = tag === "INPUT" || tag === "TEXTAREA";
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    if (selectedId) { e.preventDefault(); sendReply(false); }
    return;
  }
  if (e.key === "Escape") {
    if (menuOpen) { menuOpen = false; document.getElementById("repSendMenu")?.setAttribute("hidden",""); }
    if (shortcutModal.classList.contains("is-open")) { shortcutModal.classList.remove("is-open"); return; }
    if (inField) e.target.blur();
    return;
  }
  if (inField) return;
  switch (e.key) {
    case "ArrowDown": case "j": e.preventDefault(); nudge(1); break;
    case "ArrowUp":   case "k": e.preventDefault(); nudge(-1); break;
    case "Enter": e.preventDefault();
      if (selectedId) {
        const ta = document.getElementById("repComposer");
        if (ta) ta.focus();
      } break;
    case "r": e.preventDefault();
      { const ta = document.getElementById("repComposer"); if (ta) ta.focus(); } break;
    case "e": e.preventDefault(); if (selectedId) toggleResolved(); break;
    case "u": e.preventDefault(); if (selectedId) markUnread(selectedId); break;
    case "/": e.preventDefault(); searchEl.focus(); break;
    case "?": e.preventDefault(); shortcutModal.classList.toggle("is-open"); break;
    case "1": statusFilter = "all";            pillFilter = "all";            renderAll(); break;
    case "2": statusFilter = "unread";         pillFilter = "unread";         renderAll(); break;
    case "3": statusFilter = "needs_response"; pillFilter = "needs_response"; renderAll(); break;
    case "4": statusFilter = "resolved";       pillFilter = "all";            renderAll(); break;
  }
});
shortcutModal.addEventListener("click", (e) => {
  if (e.target === shortcutModal) shortcutModal.classList.remove("is-open");
});

// ── Boot ───────────────────────────────────────────────
function boot() {
  // Data load deferred via SECTION_ON_ENTER.replies; always refresh
  // the nav badge at boot since it shows on every page.
  refreshNavBadge();
  startPolling();
}
window.addEventListener("accountIdReady", () => {
  if (typeof window.invalidateSection === "function") window.invalidateSection("replies");
  loadAll();
  refreshNavBadge();
});
const repNavBtn = document.getElementById("appRepliesNavBtn");
if (repNavBtn) repNavBtn.addEventListener("click", () => setTimeout(() => {
  if (typeof window.invalidateSection === "function") window.invalidateSection("replies");
  if (typeof window._runSectionLoader === "function") window._runSectionLoader("replies");
  loadAll();
}, 50));

// Public deep-link entry: navigate to Replies AND select the
// thread for a specific lead.
let pendingSelectLeadId = "";
function _selectByLeadId(leadId) {
  if (!leadId) return false;
  const item = allItems.find(r => (r.lead || {}).id === leadId)
            || allItems.find(r => (r.campaign_recipient_lead_id || "") === leadId);
  if (!item || !item.id) return false;
  statusFilter = "all"; pillFilter = "all";
  campaignFilter = ""; searchTerm = ""; searchEl.value = "";
  renderSidebar(); renderPills();
  renderList();
  selectReply(item.id);
  return true;
}
window.openLeadInReplies = function (leadId) {
  if (!leadId) return;
  // Navigate to the Replies route. appShowRoute is a closure variable in
  // index.html — use window.location.hash to trigger the router via
  // the hashchange listener wired in initAppRouter.
  if (window.location.hash !== "#replies") {
    window.location.hash = "replies";
  }
  if (_selectByLeadId(leadId)) return;
  pendingSelectLeadId = leadId;
  loadAll({ skipPoll: true });
};
// Hook into the existing list-render flow so a deferred selection
// fires automatically once items show up.
const _origRenderList = renderList;
renderList = function (...args) {
  _origRenderList.apply(this, args);
  if (pendingSelectLeadId) {
    const ok = _selectByLeadId(pendingSelectLeadId);
    if (ok) pendingSelectLeadId = "";
  }
};

// ─── Module init ────────────────────────────────────────────────────────────

let _initialized = false;

export function init() {
  if (_initialized) return;
  _initialized = true;
  boot();
}

// ─── Expose globals the inline router code expects ──────────────────────────

window.loadRepliesSection = function () {
  loadAll();
};

window.__repliesRoute = {
  loadAll,
  init,
};
