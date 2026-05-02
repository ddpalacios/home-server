// web/src/routes/inbox.js
//
// Instagram DMs Inbox: conversation list + thread view + reply box.
// Loaded lazily via window.__dashboardLoadRouteModule("inbox").
//
// What lives here:
//   - loadInboxSection()         — top-level entry, exposed on window
//   - loadConversations()        — GET /me/instagram/inbox
//   - loadThread(id)             — GET /me/instagram/inbox/:id
//   - renderConversationList()   — left rail: filter chips + conversation cards
//   - renderThread()             — right pane: bubbles + reply box
//   - renderEmptyState()         — no DM-scope accounts prompt
//   - tickWindowTimer()          — 24h countdown display
//   - submitReply()              — POST /me/instagram/inbox/:id/reply
//   - convertToLead()            — POST /me/instagram/inbox/:id/convert-to-lead
//   - archiveThread()            — POST /me/instagram/inbox/:id/archive
//
// What stays inline (index.html):
//   - SECTION_ON_ENTER.inbox shim
//   - Nav button (hidden until accounts with DM scopes exist)

// ─── Module state ─────────────────────────────────────────────────────────────

let _initialized    = false;
let _conversations  = [];        // raw list from GET /me/instagram/inbox
let _activeId       = null;      // currently-open conversation id
let _activeThread   = null;      // thread detail { conversation, messages }
let _filter         = "all";     // all | new | awaiting | converted | archived
let _windowTimer    = null;      // setInterval handle for 24h countdown
let _hasDmAccounts  = false;     // whether any account has DM scopes
let _needsReconnect = false;     // accounts exist but lack DM scopes

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtDuration(ms) {
  if (ms <= 0) return "0m";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Returns the latest inbound message timestamp (ms epoch) or null
function _latestInboundTs(messages) {
  if (!messages || !messages.length) return null;
  let latest = null;
  for (const msg of messages) {
    if (msg.direction === "inbound" || msg.from !== "me") {
      const t = new Date(msg.created_at).getTime();
      if (latest === null || t > latest) latest = t;
    }
  }
  return latest;
}

// ─── Data loaders ─────────────────────────────────────────────────────────────

async function loadConversations() {
  try {
    const r = await fetch("/me/instagram/inbox", { credentials: "include" });
    if (r.status === 404 || r.status === 403) {
      // No DM-enabled account or scope missing
      _hasDmAccounts  = false;
      _needsReconnect = false;
      // Detect reconnect hint: accounts exist but inbox unavailable
      // We'll check /me/instagram/accounts for accounts without DM scope
      _checkAccountsForReconnect();
      return;
    }
    if (!r.ok) return;
    const body = await r.json();
    _conversations = body.conversations || [];
    _hasDmAccounts = true;
  } catch (_) {}
}

async function _checkAccountsForReconnect() {
  try {
    const r = await fetch("/me/instagram/accounts", { credentials: "include" });
    if (!r.ok) return;
    const body = await r.json();
    const accounts = body.accounts || [];
    if (accounts.length > 0) {
      // Accounts exist but DM endpoint 404'd → scopes missing
      _needsReconnect = true;
    }
  } catch (_) {}
}

async function loadThread(id) {
  try {
    const r = await fetch(`/me/instagram/inbox/${encodeURIComponent(id)}`,
      { credentials: "include" });
    if (!r.ok) return null;
    return await r.json();
  } catch (_) {
    return null;
  }
}

// ─── Conversation list (left rail) ───────────────────────────────────────────

function _filterConversations() {
  return _conversations.filter(c => {
    if (_filter === "new")       return c.status === "new"       || c.unread_count > 0;
    if (_filter === "awaiting")  return c.status === "awaiting_reply";
    if (_filter === "converted") return c.status === "converted";
    if (_filter === "archived")  return c.status === "archived";
    // "all" — exclude archived unless explicitly viewing archived
    return c.status !== "archived";
  });
}

function renderConversationList() {
  const list = document.getElementById("inboxList");
  if (!list) return;

  const filtered = _filterConversations();

  if (!filtered.length) {
    list.innerHTML = `<div class="ibx-conv-empty">No conversations here.</div>`;
    return;
  }

  list.innerHTML = filtered.map(c => {
    const isActive  = c.conversation_id === _activeId;
    const isNew     = c.status === "new" || (c.unread_count || 0) > 0;
    const isArchived = c.status === "archived";

    const statusLabel =
      c.status === "converted"      ? "converted" :
      c.status === "archived"       ? "archived"  :
      c.status === "awaiting_reply" ? "awaiting reply" :
      isNew                         ? "new"        : "replied";

    const previewText = (c.last_message_preview || "").slice(0, 60);

    return `
      <div class="ibx-conv-card${isActive ? " is-active" : ""}${isArchived ? " ibx-conv-card--archived" : ""}"
           data-conv-id="${esc(c.conversation_id)}"
           role="button" tabindex="0" aria-label="${esc(c.contact_handle)}">
        <div class="ibx-conv-handle">
          <span class="ibx-conv-username">@${esc(c.contact_handle || "unknown")}</span>
          ${isNew ? `<span class="ibx-dot" aria-label="new"></span>` : ""}
        </div>
        <div class="ibx-conv-preview">${esc(previewText)}${previewText.length >= 60 ? "…" : ""}</div>
        <div class="ibx-conv-meta">
          <span class="ibx-conv-status ibx-conv-status--${esc(c.status || "new")}">${statusLabel}</span>
          <span class="ibx-conv-time">${fmtTime(c.last_message_at)}</span>
        </div>
      </div>`;
  }).join("");

  list.querySelectorAll(".ibx-conv-card").forEach(card => {
    const open = () => _openConversation(card.dataset.convId);
    card.addEventListener("click", open);
    card.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") open(); });
  });
}

// ─── Thread view (right pane) ─────────────────────────────────────────────────

async function _openConversation(id) {
  _activeId = id;

  // Highlight active card immediately
  document.querySelectorAll(".ibx-conv-card").forEach(el => {
    el.classList.toggle("is-active", el.dataset.convId === id);
  });

  // Show loading state in thread pane
  const thread = document.getElementById("inboxThread");
  if (thread) {
    thread.innerHTML = `<div class="ibx-thread-loading">Loading…</div>`;
  }

  // Mobile: switch to thread view
  const panel = document.getElementById("inbox");
  if (panel) panel.classList.add("ibx-thread-open");

  _activeThread = await loadThread(id);
  renderThread();
}

function renderThread() {
  const pane = document.getElementById("inboxThread");
  if (!pane) return;

  if (!_activeThread) {
    pane.innerHTML = `<div class="ibx-thread-empty">Could not load this conversation. Try again.</div>`;
    return;
  }

  const { conversation: conv, messages = [] } = _activeThread;
  if (!conv) {
    pane.innerHTML = `<div class="ibx-thread-empty">Conversation not found.</div>`;
    return;
  }

  const status = conv.status || "new";
  const isConverted = status === "converted";
  const isArchived  = status === "archived";

  const statusLabel =
    isConverted      ? "Converted to lead" :
    isArchived       ? "Archived"          :
    status === "awaiting_reply" ? "Awaiting reply" :
    status === "new" ? "New"               : "Active";

  const statusCls =
    isConverted ? "ibx-pill--converted" :
    isArchived  ? "ibx-pill--archived"  :
    status === "new" ? "ibx-pill--new"  : "ibx-pill--active";

  // 24h window
  const latestInbound = _latestInboundTs(messages);
  const windowExpiry  = latestInbound ? latestInbound + 24 * 60 * 60 * 1000 : null;
  const now           = Date.now();
  const msLeft        = windowExpiry ? windowExpiry - now : null;
  const windowOpen    = msLeft !== null && msLeft > 0;
  const windowWarning = windowOpen && msLeft < 60 * 60 * 1000;  // <1h
  const windowClosed  = msLeft !== null && msLeft <= 0;

  const bubbles = messages.map(msg => {
    const isOurs = msg.direction === "outbound" || msg.from === "me";
    return `
      <div class="ibx-bubble-wrap${isOurs ? " ibx-bubble-wrap--ours" : ""}">
        ${!isOurs ? `<span class="ibx-bubble-time">${fmtTime(msg.created_at)}</span>` : ""}
        <div class="ibx-bubble${isOurs ? " ibx-bubble--ours" : ""}">${esc(msg.text || "")}</div>
        ${isOurs ? `<span class="ibx-bubble-time ibx-bubble-time--ours">You · ${fmtTime(msg.created_at)}</span>` : ""}
      </div>`;
  }).join("");

  const windowBannerHtml = windowClosed
    ? `<div class="ibx-window-banner ibx-window-banner--closed" id="inboxWindowBanner">
         Reply window closed — Meta only allows free-form replies within 24h of the customer's last message.
       </div>`
    : windowWarning
    ? `<div class="ibx-window-banner ibx-window-banner--warn" id="inboxWindowBanner">
         <span id="inboxWindowCountdown"></span> left to reply
       </div>`
    : windowOpen
    ? `<div class="ibx-window-banner ibx-window-banner--ok" id="inboxWindowBanner">
         <span id="inboxWindowCountdown"></span> left to reply freely
       </div>`
    : "";

  pane.innerHTML = `
    <div class="ibx-thread-header">
      <div class="ibx-thread-title">
        <span class="ibx-thread-handle">@${esc(conv.contact_handle || "unknown")}</span>
        <span class="ibx-pill ${statusCls}">${statusLabel}</span>
        <span class="ibx-thread-msgcount">${messages.length} message${messages.length !== 1 ? "s" : ""}</span>
      </div>
      <div class="ibx-thread-actions">
        <button class="btn secondary ibx-convert-btn" id="inboxConvertBtn"
          ${isConverted ? "disabled title=\"Already converted\"" : ""}
          data-conv-id="${esc(conv.conversation_id)}">
          Convert to lead
        </button>
        <button class="btn secondary ibx-archive-btn" id="inboxArchiveBtn"
          ${isArchived ? "disabled title=\"Already archived\"" : ""}
          data-conv-id="${esc(conv.conversation_id)}">
          Archive
        </button>
      </div>
    </div>
    <div class="ibx-messages" id="inboxMessages">
      ${bubbles || `<div class="ibx-thread-empty">No messages yet.</div>`}
    </div>
    <div class="ibx-reply-wrap" id="inboxReplyWrap">
      ${windowBannerHtml}
      <div class="ibx-reply-box">
        <textarea id="inboxReplyText" class="ibx-reply-textarea${windowClosed ? " ibx-reply-textarea--disabled" : ""}"
          placeholder="${windowClosed ? "Reply window closed" : "Type a reply…"}"
          rows="3"
          ${windowClosed ? "disabled" : ""}></textarea>
        <div class="ibx-reply-footer">
          <span></span>
          <button class="btn shiny ibx-send-btn" id="inboxSendBtn"
            data-conv-id="${esc(conv.conversation_id)}"
            ${windowClosed ? "disabled" : ""}>&#9166; Send</button>
        </div>
      </div>
    </div>`;

  // Scroll messages to bottom
  const msgEl = document.getElementById("inboxMessages");
  if (msgEl) msgEl.scrollTop = msgEl.scrollHeight;

  // Wire reply button
  document.getElementById("inboxSendBtn")?.addEventListener("click", () =>
    submitReply(conv.conversation_id));
  document.getElementById("inboxReplyText")?.addEventListener("keydown", ev => {
    if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) {
      ev.preventDefault();
      if (!windowClosed) submitReply(conv.conversation_id);
    }
  });

  // Wire convert / archive buttons
  document.getElementById("inboxConvertBtn")?.addEventListener("click", () =>
    convertToLead(conv.conversation_id));
  document.getElementById("inboxArchiveBtn")?.addEventListener("click", () =>
    archiveThread(conv.conversation_id));

  // Start countdown timer
  _stopWindowTimer();
  if ((windowOpen || windowWarning) && windowExpiry) {
    _startWindowTimer(windowExpiry, windowWarning);
  }
}

// ─── 24h window countdown ─────────────────────────────────────────────────────

function _stopWindowTimer() {
  if (_windowTimer) {
    clearInterval(_windowTimer);
    _windowTimer = null;
  }
}

function _startWindowTimer(expiryMs, initiallyWarning) {
  function tick() {
    const el = document.getElementById("inboxWindowCountdown");
    const banner = document.getElementById("inboxWindowBanner");
    if (!el || !banner) { _stopWindowTimer(); return; }

    const remaining = expiryMs - Date.now();
    if (remaining <= 0) {
      _stopWindowTimer();
      // Replace with closed state — re-render reply area
      const replyWrap = document.getElementById("inboxReplyWrap");
      if (replyWrap) {
        const ta   = document.getElementById("inboxReplyText");
        const btn  = document.getElementById("inboxSendBtn");
        if (ta)  { ta.disabled = true; ta.placeholder = "Reply window closed"; ta.classList.add("ibx-reply-textarea--disabled"); }
        if (btn) { btn.disabled = true; }
        banner.className = "ibx-window-banner ibx-window-banner--closed";
        banner.textContent = "Reply window closed — Meta only allows free-form replies within 24h of the customer's last message.";
      }
      return;
    }

    const isWarning = remaining < 60 * 60 * 1000;
    if (isWarning && !banner.classList.contains("ibx-window-banner--warn")) {
      banner.className = "ibx-window-banner ibx-window-banner--warn";
    }
    el.textContent = fmtDuration(remaining);
  }

  tick();
  _windowTimer = setInterval(tick, 30000);
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function submitReply(id) {
  const ta  = document.getElementById("inboxReplyText");
  const btn = document.getElementById("inboxSendBtn");
  if (!ta || !btn) return;
  const text = ta.value.trim();
  if (!text) return;

  btn.disabled = true;
  btn.textContent = "Sending…";

  try {
    const r = await fetch(`/me/instagram/inbox/${encodeURIComponent(id)}/reply`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });

    if (r.status === 409) {
      // Window expired server-side
      const replyWrap = document.getElementById("inboxReplyWrap");
      if (replyWrap) {
        const banner = document.getElementById("inboxWindowBanner");
        if (banner) {
          banner.className = "ibx-window-banner ibx-window-banner--closed";
          banner.textContent = "Reply window closed — Meta only allows free-form replies within 24h of the customer's last message.";
          banner.removeAttribute("hidden");
        }
        ta.disabled = true;
        ta.classList.add("ibx-reply-textarea--disabled");
        btn.disabled = true;
        btn.textContent = "&#9166; Send";
      }
      return;
    }

    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: "send failed" }));
      _showThreadError(err.error || "Send failed — try again");
      btn.disabled = false;
      btn.textContent = "&#9166; Send";
      return;
    }

    // Success: clear input, reload thread
    ta.value = "";
    btn.textContent = "&#9166; Send";
    _stopWindowTimer();
    _activeThread = await loadThread(id);
    renderThread();

    // Update conversation list preview
    await loadConversations();
    renderConversationList();

  } catch (e) {
    _showThreadError("Send failed — check your connection");
    btn.disabled = false;
    btn.innerHTML = "&#9166; Send";
  }
}

async function convertToLead(id) {
  const btn = document.getElementById("inboxConvertBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Converting…"; }

  try {
    const r = await fetch(`/me/instagram/inbox/${encodeURIComponent(id)}/convert-to-lead`, {
      method: "POST",
      credentials: "include",
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: "conversion failed" }));
      _showThreadError(err.error || "Conversion failed — try again");
      if (btn) { btn.disabled = false; btn.textContent = "Convert to lead"; }
      return;
    }

    // Reload thread + list
    _activeThread = await loadThread(id);
    renderThread();
    await loadConversations();
    renderConversationList();

  } catch (e) {
    _showThreadError("Conversion failed — check your connection");
    if (btn) { btn.disabled = false; btn.textContent = "Convert to lead"; }
  }
}

async function archiveThread(id) {
  const btn = document.getElementById("inboxArchiveBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Archiving…"; }

  try {
    const r = await fetch(`/me/instagram/inbox/${encodeURIComponent(id)}/archive`, {
      method: "POST",
      credentials: "include",
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: "archive failed" }));
      _showThreadError(err.error || "Archive failed — try again");
      if (btn) { btn.disabled = false; btn.textContent = "Archive"; }
      return;
    }

    // Reload thread + list
    _activeThread = await loadThread(id);
    renderThread();
    await loadConversations();
    renderConversationList();

  } catch (e) {
    _showThreadError("Archive failed — check your connection");
    if (btn) { btn.disabled = false; btn.textContent = "Archive"; }
  }
}

function _showThreadError(msg) {
  const existing = document.getElementById("inboxThreadError");
  if (existing) existing.remove();

  const el = document.createElement("div");
  el.id = "inboxThreadError";
  el.className = "ibx-error";
  el.textContent = msg;

  const replyWrap = document.getElementById("inboxReplyWrap");
  if (replyWrap) replyWrap.prepend(el);

  setTimeout(() => el.remove(), 5000);
}

// ─── Empty / reconnect state ─────────────────────────────────────────────────

function renderEmptyState() {
  const layout = document.getElementById("inboxLayout");
  const empty  = document.getElementById("inboxEmpty");
  const reconnect = document.getElementById("inboxReconnect");

  if (_hasDmAccounts) {
    // Normal state: show two-column layout
    empty?.setAttribute("hidden", "");
    reconnect?.setAttribute("hidden", "");
    layout?.removeAttribute("hidden");
    return;
  }

  layout?.setAttribute("hidden", "");

  if (_needsReconnect) {
    empty?.setAttribute("hidden", "");
    reconnect?.removeAttribute("hidden");
  } else {
    reconnect?.setAttribute("hidden", "");
    empty?.removeAttribute("hidden");
  }
}

// ─── Filter chips ─────────────────────────────────────────────────────────────

function _setFilter(f) {
  _filter = f;

  document.querySelectorAll(".ibx-filter-chip").forEach(chip => {
    chip.setAttribute("aria-selected", chip.dataset.filter === f ? "true" : "false");
  });

  renderConversationList();
}

// ─── Section entry ─────────────────────────────────────────────────────────────

export async function loadInboxSection() {
  await loadConversations();
  renderEmptyState();

  if (_hasDmAccounts) {
    renderConversationList();

    // Open first conversation automatically if any
    if (_conversations.length && !_activeId) {
      const first = _filterConversations()[0];
      if (first) await _openConversation(first.conversation_id);
    }
  }
}

// ─── Module init — wire event handlers once ──────────────────────────────────

export function init() {
  if (_initialized) return;
  _initialized = true;

  // Filter chips
  document.querySelectorAll(".ibx-filter-chip").forEach(chip => {
    chip.addEventListener("click", () => _setFilter(chip.dataset.filter));
  });

  // Mobile back button
  document.getElementById("inboxBackBtn")?.addEventListener("click", () => {
    _activeId = null;
    _stopWindowTimer();
    const panel = document.getElementById("inbox");
    if (panel) panel.classList.remove("ibx-thread-open");
    // Clear thread pane
    const thread = document.getElementById("inboxThread");
    if (thread) thread.innerHTML = `<div class="ibx-thread-placeholder">Select a conversation to start.</div>`;
  });

  // Reconnect banner → reuse existing OAuth start
  document.getElementById("inboxReconnectBtn")?.addEventListener("click", () => {
    window.location.href = "/me/instagram/oauth/start";
  });

  // Connect button in empty state → same OAuth
  document.getElementById("inboxConnectBtn")?.addEventListener("click", () => {
    window.location.href = "/me/instagram/oauth/start";
  });
}

// ─── Global exposed to inline router ─────────────────────────────────────────

window.loadInboxSection = loadInboxSection;
