// web/src/routes/instagram.js
//
// Instagram content scheduling: calendar/list views of scheduled posts,
// composer modal for creating/editing posts, account picker, reconnect
// banner. Loaded lazily via window.__dashboardLoadRouteModule("instagram").
//
// What lives here:
//   - loadInstagramSection()  — top-level entry, exposed on window
//   - loadAccounts()          — GET /me/instagram/accounts
//   - loadPosts()             — GET /me/instagram/posts
//   - renderAccountFilter()   — populate <select id="igAccountFilter">
//   - renderReconnectBanner() — show banner if any account.needs_reconnect
//   - renderCalendar()        — 7-col month grid, Mon-start, post chips
//   - renderList()            — tabular list grouped by draft / scheduled
//   - openComposer()          — builds + mounts the composer modal
//   - submit(action)          — POST /me/instagram/posts or PATCH …/:post_id
//
// What stays inline (index.html):
//   - SECTION_ON_ENTER.instagram shim
//   - Feature-flag bootstrap (hides nav until accounts exist)

// ─── Module state ────────────────────────────────────────────────────────────

let _initialized = false;
let _accounts    = [];
let _posts       = [];
let _monthOffset = 0;
let _accountFilter = "";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtMonth(d) {
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}

function fmtTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function colorForAccount(igId) {
  const acc = _accounts.find(a => a.ig_account_id === igId);
  return (acc && acc.color) || "#0d6efd";
}

function emojiForType(type) {
  if (type === "carousel") return "🖼";
  if (type === "reel")     return "🎬";
  return "📷";
}

// ─── Data loaders ─────────────────────────────────────────────────────────────

async function loadAccounts() {
  try {
    const r = await fetch("/me/instagram/accounts", { credentials: "include" });
    if (!r.ok) return;
    const body = await r.json();
    _accounts = body.accounts || [];
    window.__igAccounts = _accounts;
  } catch (_) {}
}

async function loadPosts() {
  try {
    const r = await fetch("/me/instagram/posts", { credentials: "include" });
    if (!r.ok) return;
    const body = await r.json();
    _posts = body.posts || [];
    window.__igPosts = _posts;
  } catch (_) {}
}

// ─── Connection banner + disconnect ─────────────────────────────────────────

function renderConnectionBanner() {
  const banner = document.getElementById("igConnBanner");
  const sub    = document.getElementById("igConnSub");
  const btn    = document.getElementById("igDisconnectBtn");
  if (!banner || !_accounts.length) {
    if (banner) banner.style.display = "none";
    return;
  }
  banner.style.display = "";
  // Show all connected handles (typically just one).
  const handles = _accounts.map(a => {
    const h = a.ig_username || `ig_${a.ig_account_id}`;
    return h.startsWith("@") ? h : "@" + h;
  });
  if (sub) sub.textContent = handles.join(" · ");
  if (btn) {
    // Disconnect the first/only account if multiple — otherwise prompt.
    btn.onclick = async () => {
      if (_accounts.length === 0) return;
      const target = _accounts[0]; // single-account assumption for v1
      const handle = target.ig_username || `ig_${target.ig_account_id}`;
      if (!window.confirm(`Disconnect Instagram ${handle.startsWith("@") ? handle : "@" + handle}?\n\nYour stored token will be deleted. Scheduled posts won't be published until you reconnect.`)) {
        return;
      }
      try {
        const r = await fetch(`/me/instagram/accounts/${encodeURIComponent(target.ig_account_id)}`, {
          method: "DELETE", credentials: "include",
        });
        if (r.ok) {
          // Refresh state.
          await loadAccounts();
          _updateEmptyState();
          renderConnectionBanner();
          renderAccountFilter();
          renderCalendar();
        } else {
          alert("Couldn't disconnect — try again.");
        }
      } catch (_) {
        alert("Network error disconnecting Instagram.");
      }
    };
  }
}

// ─── Account filter + reconnect banner ────────────────────────────────────────

function renderAccountFilter() {
  const sel = document.getElementById("igAccountFilter");
  if (!sel) return;
  sel.innerHTML = '<option value="">All accounts</option>' +
    _accounts.map(a =>
      `<option value="${esc(a.ig_account_id)}">${esc(a.fb_page_name || a.ig_username)}</option>`
    ).join("");
}

function renderReconnectBanner() {
  const banner = document.getElementById("igReconnectBanner");
  if (!banner) return;
  const stale = _accounts.filter(a => a.needs_reconnect);
  if (stale.length) {
    banner.textContent = `⚠ Reconnect needed: ${stale.map(a => a.ig_username).join(", ")}`;
    banner.removeAttribute("hidden");
  } else {
    banner.setAttribute("hidden", "");
  }
}

// ─── Calendar view ────────────────────────────────────────────────────────────

function _postsByDay(monthStart) {
  const out = {};
  for (const p of _posts) {
    if (_accountFilter && p.ig_account_id !== _accountFilter) continue;
    if (!p.scheduled_at) continue;
    const d = new Date(p.scheduled_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    (out[key] ||= []).push(p);
  }
  return out;
}

function renderCalendar() {
  const root = document.getElementById("igCalendar");
  if (!root) return;
  const today  = new Date();
  const cursor = new Date(today.getFullYear(), today.getMonth() + _monthOffset, 1);

  const monthLabel = document.getElementById("igMonthLabel");
  if (monthLabel) monthLabel.textContent = fmtMonth(cursor);

  // Monday-start grid: find Monday on or before the 1st
  const start = new Date(cursor);
  const dow = (cursor.getDay() + 6) % 7; // 0=Mon … 6=Sun
  start.setDate(1 - dow);

  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });

  const buckets = _postsByDay(cursor);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const headers = ["M", "T", "W", "T", "F", "S", "S"]
    .map(h => `<div class="ig-cal-hdr">${h}</div>`).join("");

  const cells = days.map(d => {
    const yr  = d.getFullYear();
    const mo  = String(d.getMonth() + 1).padStart(2, "0");
    const dy  = String(d.getDate()).padStart(2, "0");
    const key = `${yr}-${mo}-${dy}`;
    const posts   = buckets[key] || [];
    const outside = d.getMonth() !== cursor.getMonth();
    const isToday = key === todayStr;

    const chips = posts.map(p => {
      const cls   = "ig-chip" + (p.status === "errored" ? " ig-chip--err" : "");
      const color = colorForAccount(p.ig_account_id);
      const prefix = p.status === "errored" ? "⚠ " : `${emojiForType(p.post_type)} `;
      return `<span class="${cls}" style="background:${color}" data-post-id="${esc(p.post_id)}">${prefix}${esc(fmtTime(p.scheduled_at))}</span>`;
    }).join("");

    return (
      `<div class="ig-cal-day${outside ? " ig-cal-day--out" : ""}${isToday ? " ig-cal-day--today" : ""}" data-date="${key}">` +
      `<span class="ig-cal-num">${d.getDate()}</span>${chips}</div>`
    );
  }).join("");

  root.innerHTML = headers + cells;

  root.querySelectorAll(".ig-cal-day").forEach(el => {
    el.addEventListener("click", ev => {
      const chip = ev.target.closest(".ig-chip");
      if (chip) {
        openComposer({ post_id: chip.dataset.postId });
      } else {
        openComposer({ date: el.dataset.date });
      }
    });
  });
}

function _navigateMonth(delta) {
  _monthOffset += delta;
  renderCalendar();
}

// ─── List view ────────────────────────────────────────────────────────────────

function renderList() {
  const root = document.getElementById("igList");
  if (!root) return;

  const posts = _posts.slice().sort((a, b) =>
    (a.scheduled_at || "9999").localeCompare(b.scheduled_at || "9999")
  );

  if (!posts.length) {
    root.innerHTML = '<p class="ig-empty-msg">No posts yet.</p>';
    return;
  }

  const drafts = posts.filter(p => p.status === "draft");
  const others = posts.filter(p => p.status !== "draft");

  const statusBadge = (p) => {
    const cls = p.status === "errored" ? "ig-status ig-status--err" :
                p.status === "published" ? "ig-status ig-status--pub" :
                p.status === "scheduled" ? "ig-status ig-status--sched" : "ig-status";
    return `<span class="${cls}">${esc(p.status)}</span>`;
  };

  const row = (p) =>
    `<tr>
      <td>${statusBadge(p)}</td>
      <td>${esc(emojiForType(p.post_type))} ${esc(p.post_type)}</td>
      <td>${esc(p.ig_account_id)}</td>
      <td class="ig-list-caption">${esc((p.caption || "").slice(0, 80))}${(p.caption || "").length > 80 ? "…" : ""}</td>
      <td>${p.scheduled_at ? esc(new Date(p.scheduled_at).toLocaleString()) : "—"}</td>
      <td><button class="ig-list-open btn secondary" data-post-id="${esc(p.post_id)}">Open</button></td>
    </tr>`;

  root.innerHTML =
    (drafts.length
      ? `<h4 class="ig-list-group-hdr">Drafts</h4>
         <table class="ig-list-table"><thead><tr>
           <th>Status</th><th>Type</th><th>Account</th><th>Caption</th><th>Scheduled</th><th></th>
         </tr></thead><tbody>${drafts.map(row).join("")}</tbody></table>`
      : "") +
    `<h4 class="ig-list-group-hdr">Scheduled / Published</h4>
     <table class="ig-list-table"><thead><tr>
       <th>Status</th><th>Type</th><th>Account</th><th>Caption</th><th>Scheduled</th><th></th>
     </tr></thead><tbody>${others.map(row).join("")}</tbody></table>`;

  root.querySelectorAll(".ig-list-open").forEach(btn => {
    btn.addEventListener("click", () => openComposer({ post_id: btn.dataset.postId }));
  });
}

// ─── View-mode toggle (calendar ↔ list) ───────────────────────────────────────

function _activateView(mode) {
  const calEl  = document.getElementById("igCalendar");
  const lstEl  = document.getElementById("igList");
  const btnCal = document.getElementById("igViewCalendar");
  const btnLst = document.getElementById("igViewList");
  if (!calEl || !lstEl) return;

  if (mode === "list") {
    calEl.setAttribute("hidden", "");
    lstEl.removeAttribute("hidden");
    btnCal?.setAttribute("aria-selected", "false");
    btnLst?.setAttribute("aria-selected", "true");
    renderList();
  } else {
    lstEl.setAttribute("hidden", "");
    calEl.removeAttribute("hidden");
    btnCal?.setAttribute("aria-selected", "true");
    btnLst?.setAttribute("aria-selected", "false");
    renderCalendar();
  }
}

// ─── Composer modal ───────────────────────────────────────────────────────────

function openComposer({ date, post_id } = {}) {
  const modalRoot = document.getElementById("igModalRoot");
  if (!modalRoot) return;
  modalRoot.innerHTML = "";

  const initial = post_id
    ? fetch(`/me/instagram/posts/${post_id}`, { credentials: "include" })
        .then(r => (r.ok ? r.json() : null))
    : Promise.resolve(null);

  initial.then(rec => {
    const accounts    = _accounts;
    const types       = ["image", "carousel", "reel"];
    const initialType = (rec && rec.post_type) || "image";
    const initialIg   = (rec && rec.ig_account_id) || (accounts[0] && accounts[0].ig_account_id) || "";
    const initialDate = (rec && rec.scheduled_at)
      ? rec.scheduled_at.slice(0, 10)
      : (date || new Date().toISOString().slice(0, 10));
    const initialTime = (rec && rec.scheduled_at)
      ? new Date(rec.scheduled_at).toTimeString().slice(0, 5)
      : "10:00";

    modalRoot.innerHTML = `
      <div class="ig-modal-backdrop" id="igBackdrop">
        <div class="ig-modal" onclick="event.stopPropagation()">
          <h3 class="ig-modal-title">${rec ? "Edit post" : "New post"}</h3>

          <div class="ig-form-row">
            <label class="ig-label">Account</label>
            <select id="igAccount" class="ig-select">
              ${accounts.map(a =>
                `<option value="${esc(a.ig_account_id)}" ${a.ig_account_id === initialIg ? "selected" : ""}>
                  ${esc(a.fb_page_name || a.ig_username)}
                </option>`).join("")}
            </select>
          </div>

          <div class="ig-form-row ig-tabs" id="igTypeTabs">
            ${types.map(t =>
              `<button type="button" data-type="${t}" aria-selected="${t === initialType ? "true" : "false"}">${t}</button>`
            ).join("")}
          </div>

          <label class="ig-uploader" for="igFileInput" id="igUploader">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="24" height="24" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
            <span>Click to choose an image or video</span>
            <input id="igFileInput" type="file" accept="image/*,video/*"
                   style="position:absolute;left:-9999px;opacity:0;width:1px;height:1px;overflow:hidden;" />
          </label>
          <div class="ig-thumbs" id="igThumbs"></div>

          <textarea id="igCaption" rows="4" maxlength="2200" placeholder="Write a caption…"
            class="ig-textarea">${esc((rec && rec.caption) || "")}</textarea>
          <div class="ig-cap-count"><span id="igCapCount">0</span> / 2200</div>

          <div class="ig-form-row ig-tabs" id="igWhenTabs" role="tablist" aria-label="When to publish">
            <button type="button" data-when="now"  aria-selected="${rec ? "false" : "false"}">Publish now</button>
            <button type="button" data-when="later" aria-selected="${rec ? "true" : "true"}">Schedule for later</button>
          </div>

          <div class="ig-form-row" id="igScheduleRow">
            <label class="ig-label">Schedule</label>
            <input id="igDate" type="date" value="${esc(initialDate)}" class="ig-input">
            <input id="igTime" type="time" value="${esc(initialTime)}" class="ig-input">
          </div>

          <div class="ig-error" id="igError" hidden></div>

          <div class="ig-actions">
            <button id="igCancel" type="button" class="btn secondary">Cancel</button>
            <button id="igSaveDraft" type="button" class="btn secondary">Save draft</button>
            <button id="igSchedule" type="button" class="btn shiny">${rec ? "Save changes" : "Schedule post"}</button>
          </div>
        </div>
      </div>`;

    const state = {
      media:   (rec && rec.media)    || [],
      type:    initialType,
      post_id: rec ? rec.post_id : null,
      when:    "later",   // "now" | "later" — toggled by the When tabs
    };

    // Caption counter
    const capEl = document.getElementById("igCapCount");
    const ta    = document.getElementById("igCaption");
    const recount = () => { capEl.textContent = String(ta.value.length); };
    ta.addEventListener("input", recount);
    recount();

    // Type tabs
    document.getElementById("igTypeTabs").addEventListener("click", ev => {
      const btn = ev.target.closest("button[data-type]");
      if (!btn) return;
      state.type = btn.dataset.type;
      document.querySelectorAll("#igTypeTabs button").forEach(b =>
        b.setAttribute("aria-selected", b === btn ? "true" : "false"));
    });

    // When-to-publish toggle. "Now" hides the date/time inputs and
    // re-labels the primary action; "Later" restores both.
    const scheduleRow   = document.getElementById("igScheduleRow");
    const scheduleBtn   = document.getElementById("igSchedule");
    const _applyWhenUI = () => {
      const isNow = state.when === "now";
      if (scheduleRow) scheduleRow.style.display = isNow ? "none" : "";
      if (scheduleBtn) {
        scheduleBtn.textContent = state.post_id
          ? "Save changes"
          : (isNow ? "Post now" : "Schedule post");
      }
    };
    document.getElementById("igWhenTabs").addEventListener("click", ev => {
      const btn = ev.target.closest("button[data-when]");
      if (!btn) return;
      state.when = btn.dataset.when;
      document.querySelectorAll("#igWhenTabs button").forEach(b =>
        b.setAttribute("aria-selected", b === btn ? "true" : "false"));
      _applyWhenUI();
    });
    _applyWhenUI();

    // Media upload — the <label for="igFileInput"> wrapper triggers the
    // file picker natively when the user clicks the uploader area, so we
    // only need to handle the change event.
    const fileInput = document.getElementById("igFileInput");
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      console.log("[ig-upload] file picked:", file.name, file.type, file.size);
      const fd = new FormData();
      fd.append("file", file);
      try {
        const r = await fetch("/me/instagram/posts/upload",
          { method: "POST", body: fd, credentials: "include" });
        console.log("[ig-upload] response status:", r.status);
        if (!r.ok) {
          const err = await r.json().catch(() => ({ error: `upload failed (HTTP ${r.status})` }));
          _showModalError(err.error || "Upload failed");
          return;
        }
        const body = await r.json();
        state.media.push({ gcs_path: body.gcs_path, kind: body.kind, order: state.media.length });
        _renderThumbs(state.media);
        // Reset input so picking the same file twice still triggers change.
        fileInput.value = "";
      } catch (e) {
        console.error("[ig-upload] failed:", e);
        _showModalError("Upload failed — check your connection");
      }
    });

    _renderThumbs(state.media);

    function _renderThumbs(media) {
      document.getElementById("igThumbs").innerHTML = media.map((m, i) =>
        `<div class="ig-thumb" title="${m.kind || "media"} ${i + 1}">
           ${m.kind === "video" ? "🎬" : "📷"}
         </div>`).join("");
    }

    function _showModalError(msg) {
      const el = document.getElementById("igError");
      if (!el) return;
      el.textContent = msg;
      el.removeAttribute("hidden");
    }

    function isoFromInputs() {
      const d = document.getElementById("igDate").value;
      const t = document.getElementById("igTime").value;
      return new Date(`${d}T${t}:00`).toISOString();
    }

    async function _submit(action) {
      const payload = {
        ig_account_id: document.getElementById("igAccount").value,
        post_type:     state.type,
        media:         state.media,
        caption:       ta.value,
      };
      if (action === "draft") {
        payload.status = "draft";
      } else if (state.when === "now") {
        // Publish-now: schedule for ~60s out so the publisher daemon
        // (30s tick) picks it up immediately. Same shape as the
        // /publish-now endpoint applies server-side.
        const soon = new Date(Date.now() + 60 * 1000);
        soon.setMilliseconds(0);
        payload.scheduled_at = soon.toISOString();
      } else {
        payload.scheduled_at = isoFromInputs();
      }

      let url    = "/me/instagram/posts";
      let method = "POST";
      if (state.post_id) {
        url    = `/me/instagram/posts/${state.post_id}`;
        method = "PATCH";
        if (action === "schedule") payload.status = "scheduled";
      }

      try {
        const r = await fetch(url, {
          method,
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({ error: "save failed" }));
          _showModalError(err.error || "Save failed");
          return;
        }
      } catch (e) {
        _showModalError("Save failed — check your connection");
        return;
      }

      // Close + refresh
      document.getElementById("igBackdrop")?.remove();
      // Re-load posts and re-render the current view
      await loadPosts();
      const isListVisible = !document.getElementById("igList")?.hasAttribute("hidden");
      if (isListVisible) renderList(); else renderCalendar();
    }

    document.getElementById("igBackdrop").addEventListener("click", () =>
      document.getElementById("igBackdrop")?.remove());
    document.getElementById("igCancel").addEventListener("click", () =>
      document.getElementById("igBackdrop")?.remove());
    document.getElementById("igSaveDraft").addEventListener("click", () => _submit("draft"));
    document.getElementById("igSchedule").addEventListener("click", () => _submit("schedule"));
  }).catch(err => {
    console.warn("[instagram] openComposer failed:", err);
  });
}

// ─── Empty-state guard ────────────────────────────────────────────────────────

function _updateEmptyState() {
  const empty     = document.getElementById("igEmpty");
  const connected = document.getElementById("igConnected");
  if (!empty || !connected) return;
  if (!_accounts.length) {
    empty.removeAttribute("hidden");
    connected.setAttribute("hidden", "");
  } else {
    empty.setAttribute("hidden", "");
    connected.removeAttribute("hidden");
  }
}

// ─── Section entry ────────────────────────────────────────────────────────────

async function loadInstagramSection() {
  await loadAccounts();
  await loadPosts();
  renderAccountFilter();
  renderReconnectBanner();
  renderConnectionBanner();
  _updateEmptyState();
  if (_accounts.length) {
    renderCalendar();
  }
}

// ─── Module init — wire event handlers once ───────────────────────────────────

export function init() {
  if (_initialized) return;
  _initialized = true;

  // Month navigation
  document.querySelector(".ig-prev")?.addEventListener("click", () => _navigateMonth(-1));
  document.querySelector(".ig-next")?.addEventListener("click", () => _navigateMonth(1));
  document.querySelector(".ig-today")?.addEventListener("click", () => { _monthOffset = 0; renderCalendar(); });

  // Account filter
  document.getElementById("igAccountFilter")?.addEventListener("change", ev => {
    _accountFilter = ev.target.value || "";
    renderCalendar();
  });

  // View toggle
  document.getElementById("igViewCalendar")?.addEventListener("click", () => _activateView("calendar"));
  document.getElementById("igViewList")?.addEventListener("click",     () => _activateView("list"));

  // New post button
  document.getElementById("igNewPostBtn")?.addEventListener("click", () => openComposer({}));

  // Reconnect banner click → OAuth
  document.getElementById("igReconnectBanner")?.addEventListener("click", () => {
    window.location.href = "/me/instagram/oauth/start";
  });
}

// ─── Globals the inline router calls ─────────────────────────────────────────

window.loadInstagramSection = loadInstagramSection;
window.__instagramRoute     = { openComposer };
