// web/src/routes/kb.js
//
// Knowledge Base route: URL training, source management, Drive integration,
// and Test-it chat. Loaded lazily via window.__dashboardLoadRouteModule.
// Both "kb" and "knowledge" route names map to this module.
//
// What lives here:
//   - loadSources()         — fetches /kb/sources and renders the list
//   - addSource()           — POST /kb/sources with the URL form value
//   - retrainSource(id)     — POST /kb/sources/:id/retrain
//   - removeSource(id)      — DELETE /kb/sources/:id
//   - openExtractedModal()  — view scraped text for a source
//   - sendTestMessage()     — chat test via /chat
//   - Google Drive/Sheets picker modal
//
// What stays inline:
//   - SECTION_ON_ENTER.knowledge / .kb shims (updated to load bundle first)
//   - pollKbStatus() (onboarding pill — belongs to boot chrome)

// ─── IIFE body (was inline) ───────────────────────────────────────────────────

let _initialized = false;

function _initKb() {
  if (_initialized) return;
  _initialized = true;

  const list = document.getElementById("kbsList");
  const quotaEl = document.getElementById("kbsQuota");
  const urlInput = document.getElementById("kbsUrlInput");
  const trainBtn = document.getElementById("kbsTrainButton");
  const addError = document.getElementById("kbsAddError");
  const sourcesPane = document.getElementById("kbsSourcesPane");
  const chatBox = document.getElementById("kbsChat");
  const chatForm = document.getElementById("kbsChatForm");
  const chatInput = document.getElementById("kbsChatInput");
  const chatSend = document.getElementById("kbsChatSend");
  const modal = document.getElementById("kbsExtractedModal");
  const modalTitle = document.getElementById("kbsModalTitle");
  const modalUrl = document.getElementById("kbsModalUrl");
  const modalBody = document.getElementById("kbsModalBody");
  const modalRetrain = document.getElementById("kbsModalRetrain");
  if (!list) return;

  let cachedSources = [];
  let pollTimer = null;
  let pollFast = false;
  let modalSourceId = "";

  function getAccountId() { return window.__accountId || ""; }

  function timeAgo(iso) {
    if (!iso) return "Not yet";
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return "—";
    const diff = Math.max(0, Date.now() - then);
    if (diff < 30 * 1000) return "Just now";
    const m = Math.floor(diff / 60000);
    if (m < 1) return "Just now";
    if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
    const d = Math.floor(h / 24);
    return `${d} day${d === 1 ? "" : "s"} ago`;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function statusLabel(src) {
    const s = src.status || "pending";
    if (s === "ready")     return `Trained ${timeAgo(src.last_trained_at)}`;
    if (s === "failed")    return "Failed";
    if (s === "crawling")  return "Reading website…";
    if (s === "embedding") return "Teaching your AI…";
    return "Getting started…";
  }
  function progressPct(status) {
    // Phase-mapped progress so users see motion even during long phases.
    if (status === "crawling")  return 35;
    if (status === "embedding") return 75;
    if (status === "ready")     return 100;
    if (status === "failed")    return 100;
    return 12; // pending
  }

  function renderQuota(total, max) {
    if (!quotaEl) return;
    quotaEl.textContent = `${total} / ${max}`;
    quotaEl.classList.toggle("is-warn", total >= Math.floor(max * 0.8));
  }

  function renderList(sources) {
    cachedSources = sources || [];
    if (!cachedSources.length) {
      list.innerHTML = `
        <div class="kbs-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
          <strong>No sources yet</strong>
          <p>Add your first URL above to start training your AI.</p>
        </div>`;
      return;
    }
    list.innerHTML = cachedSources.map((src) => {
      const status = src.status || "pending";
      const trained = statusLabel(src);
      const title = (src.title || "").trim() || (src.url || "");
      const isTraining = ["pending", "crawling", "embedding"].includes(status);
      const trainedHtml = isTraining
        ? `<span class="kbs-phase">${escapeHtml(trained)}</span>`
        : `<span class="kbs-source-trained">${escapeHtml(trained)}</span>`;
      return `
        <div class="kbs-source-row" data-status="${escapeHtml(status)}" data-id="${escapeHtml(src.id)}">
          <span class="kbs-status-dot" aria-hidden="true"></span>
          <div class="kbs-source-meta">
            <div class="kbs-source-title">${escapeHtml(title)}</div>
            <a class="kbs-source-url" href="${escapeHtml(src.url)}" target="_blank" rel="noopener">${escapeHtml(src.url)}</a>
            ${status === "failed" && src.error ? `<div class="kbs-source-error">${escapeHtml(src.error)} <a data-kbs-retrain="${escapeHtml(src.id)}">Re-train</a></div>` : ""}
          </div>
          ${trainedHtml}
          <button class="kbs-kebab" type="button" data-kbs-kebab="${escapeHtml(src.id)}" aria-label="Source actions">
            ⋯
            <span class="kbs-menu" role="menu">
              <button type="button" data-kbs-retrain="${escapeHtml(src.id)}">Re-train</button>
              <button type="button" data-kbs-view="${escapeHtml(src.id)}">View extracted content</button>
              <button type="button" class="is-destructive" data-kbs-remove="${escapeHtml(src.id)}">Remove</button>
            </span>
          </button>
          <div class="kbs-progress" aria-hidden="true"><div class="kbs-progress-fill" style="width:${progressPct(status)}%"></div></div>
        </div>
      `;
    }).join("");
  }

  function renderTestSourcesPane(citedIds) {
    if (!sourcesPane) return;
    if (!cachedSources.length) {
      sourcesPane.innerHTML = `<p style="font-size:13px;color:#71717a;margin:0;">Add a source in the Sources tab to start testing. <a href="#" data-kbs-tab-link="sources" style="color:#0a0a0a;">Go to Sources →</a></p>`;
      return;
    }
    const cited = new Set(citedIds || []);
    sourcesPane.innerHTML = cachedSources.map((src) => {
      const title = (src.title || "").trim() || (src.url || "");
      const isCited = cited.has(src.id);
      return `<button type="button" class="kbs-source-mini ${isCited ? "is-cited" : ""}" data-kbs-view="${escapeHtml(src.id)}" title="${escapeHtml(src.url)}">${escapeHtml(title)}</button>`;
    }).join("");
  }

  async function loadSources() {
    const aid = getAccountId();
    if (!aid) return;
    try {
      const res = await fetch(`/kb/sources?accountid=${encodeURIComponent(aid)}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      renderList(data.sources || []);
      renderQuota((data.sources || []).length, data.max_sources || 50);
      renderTestSourcesPane();
      schedulePoll();
    } catch (_) {}
  }

  function schedulePoll() {
    const anyPending = cachedSources.some((s) => ["pending", "crawling", "embedding"].includes(s.status));
    clearTimeout(pollTimer);
    if (!anyPending) {
      pollFast = false;
      return;
    }
    pollFast = true;
    pollTimer = setTimeout(loadSources, 2000);
  }

  // Skeleton loader on first open.
  list.innerHTML = `<div class="kbs-skel"><div class="kbs-skel-row"></div><div class="kbs-skel-row"></div><div class="kbs-skel-row"></div></div>`;

  // ─── Add URL ──────────────────────────────────────────────
  function showAddError(msg) {
    if (!addError) return;
    addError.textContent = msg || "";
    addError.style.display = msg ? "" : "none";
  }
  async function addSource() {
    const aid = getAccountId();
    if (!aid) return;
    const url = (urlInput.value || "").trim();
    if (!url) {
      showAddError("Paste a URL to train from.");
      urlInput.focus();
      return;
    }
    showAddError("");
    trainBtn.disabled = true;
    trainBtn.classList.add("is-loading");
    const labelEl = trainBtn.querySelector(".kbs-train-label");
    const prevLabel = labelEl ? labelEl.textContent : "Train AI";
    if (labelEl) labelEl.textContent = "Training…";
    try {
      const res = await fetch("/kb/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountid: aid, url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showAddError(data.error || "Couldn't add that URL.");
        return;
      }
      urlInput.value = "";
      // Optimistic insert for instant feedback, then real refresh.
      if (data.source) {
        cachedSources = [data.source, ...cachedSources];
        renderList(cachedSources);
        renderQuota(cachedSources.length, data.max_sources || 50);
      }
      // Adding a URL source dirties bronze — flip the publish pill.
      window.dispatchEvent(new CustomEvent("kb:saved"));
      schedulePoll();
    } catch (err) {
      showAddError("Something went wrong. Try again.");
    } finally {
      trainBtn.disabled = false;
      trainBtn.classList.remove("is-loading");
      if (labelEl) labelEl.textContent = prevLabel;
    }
  }
  trainBtn && trainBtn.addEventListener("click", addSource);
  urlInput && urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addSource(); }
  });

  // Suggest chips just focus the input with a hint suffix, they don't submit.
  document.querySelectorAll("[data-kbs-suggest]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const path = btn.dataset.kbsSuggest || "";
      if (urlInput) {
        const cur = (urlInput.value || "").trim();
        if (!cur) {
          urlInput.placeholder = path ? `https://yourbusiness.com${path}` : "https://yourbusiness.com";
        } else if (path && !cur.endsWith(path)) {
          urlInput.value = cur.replace(/\/$/, "") + path;
        }
        urlInput.focus();
      }
    });
  });

  // ─── List action delegation (kebab, retrain, view, remove) ────
  function closeAllMenus() {
    document.querySelectorAll(".kbs-kebab.is-open").forEach((k) => k.classList.remove("is-open"));
  }
  document.addEventListener("click", (e) => {
    const kebab = e.target.closest("[data-kbs-kebab]");
    if (kebab) {
      const wasOpen = kebab.classList.contains("is-open");
      closeAllMenus();
      if (!wasOpen) kebab.classList.add("is-open");
      e.stopPropagation();
      return;
    }
    closeAllMenus();
  });

  list.addEventListener("click", async (e) => {
    const aid = getAccountId();
    if (!aid) return;
    const retrainBtn = e.target.closest("[data-kbs-retrain]");
    const viewBtn = e.target.closest("[data-kbs-view]");
    const removeBtn = e.target.closest("[data-kbs-remove]");
    if (retrainBtn) {
      e.preventDefault();
      closeAllMenus();
      const id = retrainBtn.dataset.kbsRetrain;
      await retrainSource(id);
      return;
    }
    if (viewBtn) {
      e.preventDefault();
      closeAllMenus();
      openExtractedModal(viewBtn.dataset.kbsView);
      return;
    }
    if (removeBtn) {
      e.preventDefault();
      closeAllMenus();
      const id = removeBtn.dataset.kbsRemove;
      await removeSource(id);
      return;
    }
  });

  async function retrainSource(id) {
    const aid = getAccountId();
    if (!aid || !id) return;
    try {
      const res = await fetch(`/kb/sources/${encodeURIComponent(id)}/retrain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountid: aid }),
      });
      if (!res.ok) return;
      // Retrain dirties bronze — flip the publish pill.
      window.dispatchEvent(new CustomEvent("kb:saved"));
      await loadSources();
    } catch (_) {}
  }

  async function removeSource(id) {
    const aid = getAccountId();
    if (!aid || !id) return;
    if (!window.confirm("Remove this source? Its trained content will be deleted.")) return;
    try {
      const res = await fetch(`/kb/sources/${encodeURIComponent(id)}?accountid=${encodeURIComponent(aid)}`, {
        method: "DELETE",
      });
      if (!res.ok) return;
      cachedSources = cachedSources.filter((s) => s.id !== id);
      renderList(cachedSources);
      renderQuota(cachedSources.length, 50);
      renderTestSourcesPane();
      // Removal dirties bronze — flip the publish pill.
      window.dispatchEvent(new CustomEvent("kb:saved"));
    } catch (_) {}
  }

  // ─── Extracted-content modal ──────────────────────────────
  async function openExtractedModal(id) {
    const aid = getAccountId();
    if (!aid || !id || !modal) return;
    modalSourceId = id;
    modalBody.textContent = "Loading…";
    modal.classList.add("is-open");
    const src = cachedSources.find((s) => s.id === id) || {};
    modalTitle.textContent = src.title || "Extracted content";
    modalUrl.textContent = src.url || "";
    modalUrl.href = src.url || "#";
    try {
      const res = await fetch(`/kb/sources/${encodeURIComponent(id)}/extracted?accountid=${encodeURIComponent(aid)}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      modalBody.textContent = (data && data.text) || "";
    } catch (_) {
      modalBody.textContent = "";
    }
  }
  function closeExtractedModal() {
    modalSourceId = "";
    modal && modal.classList.remove("is-open");
  }
  modal && modal.querySelectorAll("[data-kbs-close]").forEach((b) => b.addEventListener("click", closeExtractedModal));
  modal && modal.addEventListener("click", (e) => {
    if (e.target === modal) closeExtractedModal();
  });
  modalRetrain && modalRetrain.addEventListener("click", async () => {
    if (!modalSourceId) return;
    const id = modalSourceId;
    closeExtractedModal();
    await retrainSource(id);
  });

  // ─── Tab switching ────────────────────────────────────────
  const tabs = document.querySelectorAll('#kbSources [data-kbs-tab]');
  const panes = document.querySelectorAll('#kbSources [data-kbs-pane]');
  function showTab(name) {
    tabs.forEach((t) => t.classList.toggle("is-active", t.dataset.kbsTab === name));
    panes.forEach((p) => { p.hidden = (p.dataset.kbsPane !== name); });
    if (name === "test") {
      renderTestSourcesPane();
      ensureChatPlaceholder();
    }
  }
  tabs.forEach((t) => t.addEventListener("click", () => showTab(t.dataset.kbsTab)));
  // Anchor inside the pane that switches tabs (for the empty-pane CTA).
  document.addEventListener("click", (e) => {
    const link = e.target.closest("[data-kbs-tab-link]");
    if (link) { e.preventDefault(); showTab(link.dataset.kbsTabLink); }
  });

  // The publish flow's button + click + status polling now live in a
  // single global IIFE at the end of <body> (search "Publish flow ·
  // global"). Refresh status on KB route entry so the badge state
  // is fresh whenever the user lands here.
  document.querySelectorAll('.app-nav-btn[data-route="kb"]').forEach(btn =>
    btn.addEventListener("click", () => {
      setTimeout(() => window.publishStatus && window.publishStatus.refresh(), 80);
    }));
  window.addEventListener("kb:saved", () => {
    window.publishStatus && window.publishStatus.refresh();
  });

  // ─── Test-it chat (uses the existing /chat endpoint) ──────
  function ensureChatPlaceholder() {
    if (!chatBox) return;
    if (chatBox.children.length > 0) return;
    const row = document.createElement("div");
    row.className = "insights-message bot";
    const avatar = document.createElement("div");
    avatar.className = "insights-agent";
    avatar.innerHTML = '<img src="/robot_icon.png" alt="" />';
    const bubble = document.createElement("div");
    bubble.className = "insights-bubble bot";
    bubble.textContent = "Ask anything to test your AI. Try one of the examples below.";
    row.appendChild(avatar);
    row.appendChild(bubble);
    chatBox.appendChild(row);
  }
  function clearChatPlaceholder() {
    if (!chatBox) return;
    const placeholder = chatBox.querySelector(".insights-bubble.bot");
    if (placeholder && /^Ask anything/.test(placeholder.textContent || "")) {
      placeholder.parentElement.remove();
    }
  }
  function appendMsg(role, text) {
    if (!chatBox) return;
    clearChatPlaceholder();
    const row = document.createElement("div");
    row.className = `insights-message ${role}`;
    if (role === "bot") {
      const avatar = document.createElement("div");
      avatar.className = "insights-agent";
      avatar.innerHTML = '<img src="/robot_icon.png" alt="" />';
      row.appendChild(avatar);
    }
    const bubble = document.createElement("div");
    bubble.className = `insights-bubble ${role}`;
    bubble.textContent = text;
    row.appendChild(bubble);
    chatBox.appendChild(row);
    const wrap = document.getElementById("kbsChatWrap");
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  }
  function inferCitations(answer) {
    // The existing /chat endpoint doesn't return source IDs. As a best-effort,
    // we infer "which sources were used" by string-overlap between the answer
    // and each source's title or URL host. Rough but good enough for a
    // confidence-builder; replace with backend-supplied citations later.
    const lower = String(answer || "").toLowerCase();
    const cited = [];
    for (const s of cachedSources) {
      const title = (s.title || "").toLowerCase();
      let host = "";
      try { host = new URL(s.url || "").hostname.replace(/^www\./, "").split(".")[0].toLowerCase(); } catch (_) {}
      if (title && lower.includes(title.slice(0, Math.min(20, title.length)))) cited.push(s.id);
      else if (host && lower.includes(host)) cited.push(s.id);
    }
    return cited.slice(0, 3);
  }
  function addTypingBubble() {
    if (!chatBox) return null;
    const row = document.createElement("div");
    row.className = "insights-message bot";
    const avatar = document.createElement("div");
    avatar.className = "insights-agent";
    avatar.innerHTML = '<img src="/robot_icon.png" alt="" />';
    const bubble = document.createElement("div");
    bubble.className = "insights-bubble bot is-typing";
    bubble.innerHTML = '<span class="typing-dots"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span>';
    row.appendChild(avatar);
    row.appendChild(bubble);
    chatBox.appendChild(row);
    const wrap = document.getElementById("kbsChatWrap");
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
    return row;
  }
  async function sendTestMessage(question) {
    const aid = getAccountId();
    if (!aid || !question) return;
    clearChatPlaceholder();
    appendMsg("user", question);
    const typing = addTypingBubble();
    chatSend.disabled = true;
    try {
      const res = await fetch(`/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          kb_type: "client",
          use_silver: false,
          accountid: aid,
        }),
      });
      const data = await res.json().catch(() => ({}));
      const answer = (data && data.response) ? String(data.response).trim() : "I couldn't find an answer in your KB. Try training more URLs.";
      if (typing) typing.remove();
      appendMsg("bot", answer);
      renderTestSourcesPane(inferCitations(answer));
    } catch (_) {
      if (typing) typing.remove();
      appendMsg("bot", "Network error. Try again.");
    } finally {
      chatSend.disabled = false;
    }
  }
  chatForm && chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = (chatInput.value || "").trim();
    if (!q) return;
    chatInput.value = "";
    sendTestMessage(q);
  });
  document.querySelectorAll("[data-kbs-example]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (chatInput) { chatInput.value = btn.dataset.kbsExample || ""; chatInput.focus(); }
    });
  });

  // ─── Google Drive / Sheets integration ──────────────────
  const driveBtn = document.getElementById("kbsGoogleDriveBtn");
  const sheetsBtn = document.getElementById("kbsGoogleSheetsBtn");
  const driveStatusBadge = document.getElementById("kbsDriveStatus");
  const driveModal = document.getElementById("kbsDriveModal");
  const driveModalBody = document.getElementById("kbsDriveModalBody");
  const driveImportBtn = document.getElementById("kbsDriveImport");
  const driveCountEl = document.getElementById("kbsDriveCount");
  let driveConnected = false;
  let driveFiles = [];
  let driveSelected = new Set();
  let driveActiveTab = "docs";

  async function checkDriveStatus() {
    try {
      const res = await fetch("/me/drive/status", { credentials: "same-origin", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      driveConnected = !!(data && data.connected);
    } catch (_) { driveConnected = false; }
    renderDriveButtons();
  }
  function renderDriveButtons() {
    if (!driveBtn || !sheetsBtn) return;
    const dt = driveBtn.querySelector(".kbs-gbtn-title");
    const ds = driveBtn.querySelector(".kbs-gbtn-sub");
    const st = sheetsBtn.querySelector(".kbs-gbtn-title");
    const ss = sheetsBtn.querySelector(".kbs-gbtn-sub");
    if (driveConnected) {
      driveBtn.classList.add("is-connected");
      sheetsBtn.classList.add("is-connected");
      if (dt) dt.textContent = "Browse Google Drive";
      if (ds) ds.textContent = "Pick documents to import into your KB";
      if (st) st.textContent = "Browse Google Sheets";
      if (ss) ss.textContent = "Pick spreadsheets to import";
      if (driveStatusBadge) driveStatusBadge.hidden = false;
    } else {
      driveBtn.classList.remove("is-connected");
      sheetsBtn.classList.remove("is-connected");
      if (dt) dt.textContent = "Connect Google Drive";
      if (ds) ds.textContent = "Import Docs, PDFs, and text files";
      if (st) st.textContent = "Connect Google Sheets";
      if (ss) ss.textContent = "Import customer lists, FAQs, and pricing";
      if (driveStatusBadge) driveStatusBadge.hidden = true;
    }
  }
  function handleGoogleClick(kind) {
    if (!driveConnected) {
      // Either button kicks off the same OAuth — Drive's read scope
      // covers both Docs and Sheets.
      window.location.href = "/auth/google/connect-drive";
      return;
    }
    driveActiveTab = kind === "sheets" ? "sheets" : "docs";
    openDriveModal();
  }
  driveBtn && driveBtn.addEventListener("click", () => handleGoogleClick("docs"));
  sheetsBtn && sheetsBtn.addEventListener("click", () => handleGoogleClick("sheets"));

  function openDriveModal() {
    if (!driveModal) return;
    driveSelected = new Set();
    updateDriveCount();
    driveModal.classList.add("is-open");
    document.querySelectorAll("#kbsDriveModal .kbs-drive-tab").forEach((t) => {
      t.classList.toggle("is-active", t.dataset.kbsDriveTab === driveActiveTab);
    });
    loadDriveFiles();
  }
  function closeDriveModal() {
    driveModal && driveModal.classList.remove("is-open");
  }
  driveModal && driveModal.querySelectorAll("[data-kbs-drive-close]").forEach((b) => {
    b.addEventListener("click", closeDriveModal);
  });
  driveModal && driveModal.addEventListener("click", (e) => {
    if (e.target === driveModal) closeDriveModal();
  });
  document.querySelectorAll("#kbsDriveModal .kbs-drive-tab").forEach((t) => {
    t.addEventListener("click", () => {
      driveActiveTab = t.dataset.kbsDriveTab;
      document.querySelectorAll("#kbsDriveModal .kbs-drive-tab").forEach((x) => {
        x.classList.toggle("is-active", x === t);
      });
      loadDriveFiles();
    });
  });
  function fmtDriveDate(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch (_) { return ""; }
  }
  function driveIcon(mime) {
    if (mime === "application/vnd.google-apps.document") return "📄";
    if (mime === "application/vnd.google-apps.spreadsheet") return "📊";
    if (mime === "application/pdf") return "📕";
    return "📃";
  }
  function updateDriveCount() {
    if (driveCountEl) driveCountEl.textContent = `${driveSelected.size} selected`;
    if (driveImportBtn) driveImportBtn.disabled = (driveSelected.size === 0);
  }
  async function loadDriveFiles() {
    if (!driveModalBody) return;
    driveModalBody.innerHTML = `<div class="kbs-drive-empty">Loading…</div>`;
    try {
      const res = await fetch(`/me/drive/files?type=${encodeURIComponent(driveActiveTab)}&limit=50`, { credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      driveFiles = (data && data.files) || [];
      if (!driveFiles.length) {
        driveModalBody.innerHTML = `<div class="kbs-drive-empty">No ${driveActiveTab === "sheets" ? "spreadsheets" : "documents"} found in your Drive.</div>`;
        return;
      }
      driveModalBody.innerHTML = `<div class="kbs-drive-list">${driveFiles.map((f) => `
        <label class="kbs-drive-item ${driveSelected.has(f.id) ? "is-selected" : ""}">
          <input type="checkbox" data-kbs-drive-id="${escapeHtml(f.id)}" ${driveSelected.has(f.id) ? "checked" : ""}>
          <span class="kbs-drive-item-icon" aria-hidden="true">${driveIcon(f.mimeType)}</span>
          <span style="min-width:0;">
            <span class="kbs-drive-item-name">${escapeHtml(f.name || "(untitled)")}</span>
            <span class="kbs-drive-item-meta">${escapeHtml(f.mimeType || "")}</span>
          </span>
          <span class="kbs-drive-item-date">${escapeHtml(fmtDriveDate(f.modifiedTime))}</span>
        </label>
      `).join("")}</div>`;
      driveModalBody.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener("change", () => {
          const id = cb.dataset.kbsDriveId;
          if (cb.checked) driveSelected.add(id); else driveSelected.delete(id);
          const row = cb.closest(".kbs-drive-item");
          if (row) row.classList.toggle("is-selected", cb.checked);
          updateDriveCount();
        });
      });
    } catch (_) {
      driveModalBody.innerHTML = `<div class="kbs-drive-empty">Couldn't load your files. Try reconnecting.</div>`;
    }
  }
  driveImportBtn && driveImportBtn.addEventListener("click", async () => {
    if (driveSelected.size === 0) return;
    const picked = driveFiles
      .filter((f) => driveSelected.has(f.id))
      .map((f) => ({ id: f.id, name: f.name, mime_type: f.mimeType }));
    driveImportBtn.disabled = true;
    // If the home page handed us off ("import to internal team brain"),
    // forward that intent so the source lands in the right dashboard
    // list. _train_drive_source writes the extracted content to BOTH
    // KBs regardless — kb_type just controls the home-page section.
    let driveKbType = "client";
    try {
      const saved = sessionStorage.getItem("kbsAutoOpenDrive");
      if (saved === "internal" || saved === "client") driveKbType = saved;
    } catch (_) {}
    try {
      const res = await fetch("/me/drive/import", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: picked, kb_type: driveKbType }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Import failed: ${data.error || res.status}`);
        driveImportBtn.disabled = false;
        return;
      }
      try { sessionStorage.removeItem("kbsAutoOpenDrive"); } catch (_) {}
      closeDriveModal();
      await loadSources();
      // Tell the home page (or any other surface that lists KB sources)
      // that something changed, so they refresh their own lists.
      window.dispatchEvent(new CustomEvent("kb:saved"));
    } catch (_) {
      alert("Network error.");
      driveImportBtn.disabled = false;
    }
  });

  // Auto-open the Drive picker when the home page jumped us here via
  // its "Import from Google Drive or Sheets" button. The flag is set
  // in sessionStorage as "client" or "internal"; we still open the
  // same picker but the eventual /me/drive/import call honors the mode.
  function maybeAutoOpenDrive() {
    let pending = null;
    try { pending = sessionStorage.getItem("kbsAutoOpenDrive"); } catch (_) {}
    if (!pending) return;
    // Always consume the flag — successful open OR failure. Without
    // this we'd loop: not connected → redirect to OAuth → callback
    // returns with the flag still set → redirect to OAuth → ...
    try { sessionStorage.removeItem("kbsAutoOpenDrive"); } catch (_) {}
    if (driveConnected) {
      driveActiveTab = "docs";
      openDriveModal();
      return;
    }
    // Not connected after the OAuth round-trip — silently no-op
    // here. The home button's click handler is the only entry point
    // that should ever initiate OAuth, and it does so explicitly.
    // Surfacing this as an alert would surprise users mid-page-load.
  }

  // Exposed so the home-page "Import from Google Drive or Sheets"
  // button can re-open the picker on every click. _initialized
  // prevents init() from re-running, so without this exposed
  // callable the picker would only open once per page load.
  window.__openDrivePicker = function () {
    if (!driveConnected) {
      // ONE-WAY: only the home click handler should kick off OAuth.
      // This function never redirects on its own — that's how we
      // ended up in the OAuth→callback→OAuth loop. Caller decides
      // whether to redirect.
      return false;
    }
    driveActiveTab = "docs";
    openDriveModal();
    return true;
  };

  // Force a fresh /me/drive/status check + re-render. Called by the
  // home button when the server says connected but kb.js's internal
  // flag still has the stale "not connected" from page load.
  window.__refreshDriveStatus = function () {
    return checkDriveStatus();
  };

  checkDriveStatus().then(maybeAutoOpenDrive);
  window.addEventListener("accountIdReady", checkDriveStatus);

  // Re-arm so the loader re-runs with the resolved accountId if the
  // KB section is already active (e.g. direct #kb hash on load).
  window.addEventListener("accountIdReady", () => {
    const kbSec = document.getElementById("kb");
    if (kbSec && kbSec.classList.contains("is-active")) {
      if (typeof window.invalidateSection === "function") {
        window.invalidateSection("knowledge");
        window.invalidateSection("kb");
      }
      loadSources();
    }
  });

  // Reload when the user navigates to this section, so freshly-saved
  // sources from another tab show up promptly.
  document.querySelectorAll('.app-nav-btn[data-route="kb"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      setTimeout(() => {
        if (typeof window.invalidateSection === "function") {
          window.invalidateSection("knowledge");
          window.invalidateSection("kb");
        }
        if (typeof window._runSectionLoader === "function") {
          window._runSectionLoader("knowledge");
        }
      }, 80);
    });
  });

  // Expose loadSources so the SECTION_ON_ENTER shim can call it.
  window._kbLoadSources = loadSources;
}

// ─── Module lifecycle ─────────────────────────────────────────────────────────

export function init() {
  _initKb();
}

// ─── Expose globals the inline router code expects ────────────────────────────

window.loadKbSection = function () {
  _initKb();
  if (typeof window._kbLoadSources === "function") window._kbLoadSources();
};
