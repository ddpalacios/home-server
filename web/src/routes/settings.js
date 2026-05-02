// web/src/routes/settings.js
//
// Settings route: widget appearance, position, starter questions, live
// preview, copy-embed button, and autosave. Loaded lazily via
// window.__dashboardLoadRouteModule.
//
// What lives here:
//   - Color swatch + custom color picker
//   - Icon picker
//   - Position picker (localStorage)
//   - Starter-questions row editor (drag-and-drop)
//   - Live preview rendering (color, header, text, chips, icon, position)
//   - Character counters
//   - Preview-state + viewport toggles
//   - Email notification toggle
//   - Autosave debounce (calls window.saveBotConfig)
//   - Copy-embed button re-wire
//   - Overrides window.getSettingsPayload / window.applySettingsPayload / window.addChip
//
// What stays inline:
//   - saveBotConfig(), getSettingsPayload() base, setDirty(),
//     syncPreviewChips() — defined as globals in the main <script> block
//   - ensureAuthenticated() embed-snippet update
//   - loadBotConfig(), loadDomains() — boot globals

let _initialized = false;

function _initSettings() {
  if (_initialized) return;
  _initialized = true;

  const PRESETS = ["#0a0a0a","#2563eb","#16a34a","#dc2626","#ea580c","#9333ea","#0891b2","#64748b"];

  // Tab navigation between Install / Settings
  document.querySelectorAll(".wgt-tab[data-wgt-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const route = tab.dataset.wgtTab;
      if (typeof window.appShowRoute === "function") window.appShowRoute(route);
    });
  });

  const primaryColor = document.getElementById("primaryColor");
  const accentColor = document.getElementById("accentColor");
  const iconSelect = document.getElementById("iconSelect");
  const chipEditor = document.getElementById("chipEditor");
  const livePreview = document.getElementById("wgtLivePreview");
  const liveBubble = document.getElementById("wgtLiveBubble");
  const liveAvatar = document.getElementById("wgtLiveAvatar");
  const liveAgent = document.getElementById("wgtLiveAgent");
  const liveName = document.getElementById("wgtLiveName");
  const liveSub = document.getElementById("wgtLiveSub");
  const liveGreeting = document.getElementById("wgtLiveGreeting");
  const liveChips = document.getElementById("wgtLiveChips");
  const browser = document.getElementById("wgtBrowser");
  const savedPill = document.getElementById("wgtSavedPill");
  const contrastWarn = document.getElementById("wgtContrastWarn");
  const swatchHost = document.getElementById("wgtSwatches");
  const headerSwatchHost = document.getElementById("wgtHeaderSwatches");
  const iconHost = document.getElementById("wgtIcons");
  const positionHost = document.getElementById("wgtPosition");
  const customColorInput = document.getElementById("wgtCustomColorInput");
  const headerCustomColorInput = document.getElementById("wgtHeaderCustomColorInput");
  const headerStartInput = document.getElementById("headerGradientStart");
  const headerEndInput   = document.getElementById("headerGradientEnd");
  const greetingInput = document.getElementById("greetingMessage");
  const subtitleInput = document.getElementById("subtitleMessage");
  const nameInput = document.getElementById("agentName");
  const addChipButton = document.getElementById("addChipButton");
  const newChipInput = document.getElementById("newChipInput");
  const emailNotifyToggle = document.getElementById("wgtEmailNotify");
  const emailField = document.getElementById("wgtEmailNotifyField");

  // ─── Color swatches ───────────────────────────────────────
  function fireInput(el) {
    el && el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function setPrimary(color) {
    if (!primaryColor) return;
    primaryColor.value = color;
    if (accentColor) accentColor.value = color;
    fireInput(primaryColor);
    if (accentColor) fireInput(accentColor);
    renderSwatchActive();
    renderContrastWarn();
  }
  function renderSwatchActive() {
    if (!swatchHost || !primaryColor) return;
    const current = (primaryColor.value || "").toLowerCase();
    swatchHost.querySelectorAll(".wgt-swatch[data-color]").forEach((sw) => {
      sw.classList.toggle("is-active", sw.dataset.color.toLowerCase() === current);
    });
  }
  function relativeLuminance(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    if (!m) return 1;
    const toLin = (v) => {
      const c = parseInt(v, 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLin(m[1]) + 0.7152 * toLin(m[2]) + 0.0722 * toLin(m[3]);
  }
  function renderContrastWarn() {
    if (!contrastWarn || !primaryColor) return;
    const ratio = (relativeLuminance("#ffffff") + 0.05) / (relativeLuminance(primaryColor.value) + 0.05);
    contrastWarn.hidden = ratio >= 3.0;
  }
  if (swatchHost) {
    swatchHost.addEventListener("click", (e) => {
      const sw = e.target.closest(".wgt-swatch[data-color]");
      if (!sw) return;
      setPrimary(sw.dataset.color);
    });
  }
  if (customColorInput) {
    customColorInput.addEventListener("input", () => {
      setPrimary(customColorInput.value);
    });
  }

  // ─── Icon picker ──────────────────────────────────────────
  function setIcon(value) {
    if (!iconSelect) return;
    iconSelect.value = value;
    fireInput(iconSelect);
    renderIconActive();
    renderLiveIcon();
  }
  function renderIconActive() {
    if (!iconHost || !iconSelect) return;
    iconHost.querySelectorAll(".wgt-icon-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.icon === iconSelect.value);
    });
  }
  function robotIconUrl() {
    const aid = window.__accountId || "";
    const origin = window.location.origin || "";
    return aid ? `${origin}/${aid}/robot_icon.png` : `${origin}/robot_icon.png`;
  }
  function renderLiveIcon() {
    // Toggle bubble shows the chosen widget icon (chat / spark / bolt / etc).
    if (!iconHost) return;
    const active = iconHost.querySelector(`.wgt-icon-btn[data-icon="${iconSelect.value}"]`);
    const svg = active ? active.querySelector("svg") : iconHost.querySelector("svg");
    if (svg && liveBubble) liveBubble.innerHTML = svg.outerHTML;
    renderLiveAvatar();
  }
  function renderLiveAvatar() {
    // Header avatar + bot agent square use the robot.png — same as the
    // deployed widget. If the image 404s, fall back to a neutral block.
    const url = robotIconUrl();
    const imgHtml = `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block" onerror="this.style.visibility='hidden'" />`;
    if (liveAvatar) {
      const dot = liveAvatar.querySelector(".chatbot-status-dot");
      liveAvatar.innerHTML = imgHtml;
      if (dot) liveAvatar.appendChild(dot);
    }
    if (liveAgent) liveAgent.innerHTML = imgHtml;
  }
  window.addEventListener("accountIdReady", renderLiveAvatar);
  if (iconHost) {
    iconHost.addEventListener("click", (e) => {
      const btn = e.target.closest(".wgt-icon-btn");
      if (!btn) return;
      setIcon(btn.dataset.icon);
    });
  }

  // ─── Position picker (UI-only; persisted in localStorage) ─
  function getPosition() {
    return localStorage.getItem("wgt_position") || "bottom-right";
  }
  function setPosition(pos) {
    localStorage.setItem("wgt_position", pos);
    renderPositionActive();
    renderLivePosition();
  }
  function renderPositionActive() {
    if (!positionHost) return;
    const current = getPosition();
    positionHost.querySelectorAll(".wgt-pos-card").forEach((card) => {
      card.classList.toggle("is-active", card.dataset.position === current);
    });
  }
  function renderLivePosition() {
    if (livePreview) livePreview.dataset.position = getPosition();
  }
  if (positionHost) {
    positionHost.addEventListener("click", (e) => {
      const card = e.target.closest(".wgt-pos-card");
      if (!card) return;
      setPosition(card.dataset.position);
    });
  }

  // ─── Starter questions: row-based editor ──────────────────
  function buildRow(value) {
    const row = document.createElement("div");
    row.className = "chip wgt-q-row";
    row.dataset.value = value || "";
    row.draggable = true;
    row.innerHTML = [
      '<button type="button" class="wgt-q-handle" aria-label="Drag to reorder" tabindex="0">',
      '  <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>',
      '</button>',
      '<input type="text" class="wgt-q-input" placeholder="Type a question…" />',
      '<button type="button" class="wgt-q-remove" aria-label="Remove">×</button>'
    ].join("");
    const input = row.querySelector(".wgt-q-input");
    input.value = value || "";
    input.addEventListener("input", () => {
      row.dataset.value = input.value;
      if (typeof window.setDirty === "function") window.setDirty("settings");
      if (typeof window.syncPreviewChips === "function") window.syncPreviewChips();
      renderLiveChips();
      scheduleAutosave();
    });
    // Keyboard reorder when drag handle is focused
    row.querySelector(".wgt-q-handle").addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp" && row.previousElementSibling) {
        e.preventDefault();
        chipEditor.insertBefore(row, row.previousElementSibling);
        row.querySelector(".wgt-q-handle").focus();
        afterReorder();
      } else if (e.key === "ArrowDown" && row.nextElementSibling) {
        e.preventDefault();
        chipEditor.insertBefore(row.nextElementSibling, row);
        row.querySelector(".wgt-q-handle").focus();
        afterReorder();
      }
    });
    // Drag-and-drop reorder
    row.addEventListener("dragstart", (e) => {
      row.classList.add("is-dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", "row"); } catch (_) {}
      }
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("is-dragging");
      chipEditor.querySelectorAll(".is-drag-over").forEach((r) => r.classList.remove("is-drag-over"));
      afterReorder();
    });
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      const dragging = chipEditor.querySelector(".is-dragging");
      if (!dragging || dragging === row) return;
      row.classList.add("is-drag-over");
      const rect = row.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      chipEditor.insertBefore(dragging, before ? row : row.nextSibling);
    });
    row.addEventListener("dragleave", () => row.classList.remove("is-drag-over"));
    return row;
  }
  function afterReorder() {
    if (typeof window.setDirty === "function") window.setDirty("settings");
    if (typeof window.syncPreviewChips === "function") window.syncPreviewChips();
    renderLiveChips();
    scheduleAutosave();
  }
  function renderQuestionsFromArray(list) {
    if (!chipEditor) return;
    chipEditor.innerHTML = "";
    (list || []).forEach((q) => chipEditor.appendChild(buildRow(q)));
  }
  function questionsArray() {
    if (!chipEditor) return [];
    return Array.from(chipEditor.querySelectorAll(".wgt-q-row")).map((row) => {
      const input = row.querySelector(".wgt-q-input");
      return (input ? input.value : row.dataset.value || "").trim();
    }).filter(Boolean);
  }

  // Override the existing payload helpers to read from rows.
  const _origGet = window.getSettingsPayload;
  window.getSettingsPayload = function () {
    const base = (typeof _origGet === "function") ? _origGet() : {};
    base.default_start_questions = questionsArray();
    base.widget_position = getPosition();
    return base;
  };
  const _origApply = window.applySettingsPayload;
  window.applySettingsPayload = function (cfg) {
    if (typeof _origApply === "function") _origApply(cfg);
    if (cfg && Array.isArray(cfg.default_start_questions)) {
      renderQuestionsFromArray(cfg.default_start_questions);
    }
    if (cfg && cfg.widget_position) {
      localStorage.setItem("wgt_position", cfg.widget_position);
    }
    // Sync swatch/icon/position visual state to current values.
    renderSwatchActive();
    renderIconActive();
    renderPositionActive();
    renderLivePosition();
    renderLiveIcon();
    renderLive();
    renderCounters();
    renderContrastWarn();
  };
  const _origAddChip = window.addChip;
  window.addChip = function (text) {
    if (!chipEditor) return;
    const row = buildRow((text || "").trim());
    chipEditor.appendChild(row);
    const input = row.querySelector(".wgt-q-input");
    if (input) input.focus();
    if (typeof window.setDirty === "function") window.setDirty("settings");
    if (typeof window.syncPreviewChips === "function") window.syncPreviewChips();
    renderLiveChips();
    scheduleAutosave();
  };
  // Add-question button: append empty row, focus its input.
  if (addChipButton) {
    // Replace the legacy click handler so it doesn't try to read newChipInput.
    const fresh = addChipButton.cloneNode(true);
    addChipButton.parentNode.replaceChild(fresh, addChipButton);
    fresh.addEventListener("click", () => window.addChip(""));
  }

  // ─── Live preview rendering ───────────────────────────────
  function lighten(hex, amount) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    if (!m) return hex;
    const mix = (c) => {
      const v = parseInt(c, 16);
      return Math.min(255, Math.round(v + (255 - v) * amount)).toString(16).padStart(2, "0");
    };
    return "#" + mix(m[1]) + mix(m[2]) + mix(m[3]);
  }
  function relLum(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    if (!m) return 1;
    return (0.2126 * parseInt(m[1],16) + 0.7152 * parseInt(m[2],16) + 0.0722 * parseInt(m[3],16)) / 255;
  }
  function renderLiveColor() {
    if (!livePreview || !primaryColor) return;
    const c = primaryColor.value;
    const lighter = lighten(c, 0.18);
    // Drive the same CSS variables the deployed widget uses.
    livePreview.style.setProperty("--forest", c);
    livePreview.style.setProperty("--earth",  c);
    livePreview.style.setProperty("--leaf",   lighter);
    livePreview.style.setProperty("--cream",  "#f7faff");
    document.querySelectorAll(".wgt-pulse-dot").forEach((d) => {
      d.style.background = c;
    });
  }
  function renderLiveHeader() {
    if (!livePreview) return;
    const c = (headerStartInput && headerStartInput.value) || "#2f80ed";
    const cEnd = (headerEndInput && headerEndInput.value) || lighten(c, 0.18);
    livePreview.style.setProperty("--header-gradient-start", c);
    livePreview.style.setProperty("--header-gradient-end",   cEnd);
    livePreview.style.setProperty("--header-text", relLum(c) < 0.6 ? "#ffffff" : "#0b1f33");
    renderHeaderSwatchActive();
  }
  function renderHeaderSwatchActive() {
    if (!headerSwatchHost || !headerStartInput) return;
    const current = (headerStartInput.value || "").toLowerCase();
    headerSwatchHost.querySelectorAll(".wgt-swatch[data-color]").forEach((sw) => {
      sw.classList.toggle("is-active", sw.dataset.color.toLowerCase() === current);
    });
  }
  function setHeaderColor(c) {
    if (!headerStartInput || !headerEndInput) return;
    headerStartInput.value = c;
    headerEndInput.value = lighten(c, 0.18);
    fireInput(headerStartInput);
    fireInput(headerEndInput);
    renderLiveHeader();
  }
  if (headerSwatchHost) {
    headerSwatchHost.addEventListener("click", (e) => {
      const sw = e.target.closest(".wgt-swatch[data-color]");
      if (!sw) return;
      setHeaderColor(sw.dataset.color);
    });
  }
  if (headerCustomColorInput) {
    headerCustomColorInput.addEventListener("input", () => setHeaderColor(headerCustomColorInput.value));
  }
  function renderLiveText() {
    if (liveName) liveName.textContent = (nameInput && nameInput.value.trim()) || "A.I Assistant";
    if (liveSub) liveSub.textContent = (subtitleInput && subtitleInput.value.trim()) || "Ask about services, pricing, or scheduling";
    if (liveGreeting) liveGreeting.textContent = (greetingInput && greetingInput.value.trim()) || "Hi! How can I help you today?";
  }
  function renderLiveChips() {
    if (!liveChips) return;
    liveChips.innerHTML = "";
    questionsArray().slice(0, 4).forEach((q) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chatbot-chip";
      btn.textContent = q;
      btn.tabIndex = -1;
      liveChips.appendChild(btn);
    });
  }
  function renderLive() {
    renderLiveColor();
    renderLiveHeader();
    renderLiveText();
    renderLiveChips();
    renderLiveIcon();
    renderLivePosition();
  }

  // Re-render preview on any input change.
  [nameInput, greetingInput, subtitleInput, primaryColor, accentColor, iconSelect].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", () => {
      renderLive();
      renderCounters();
      renderContrastWarn();
      renderSwatchActive();
      renderIconActive();
      scheduleAutosave();
    });
  });

  // ─── Character counters ───────────────────────────────────
  function renderCounters() {
    document.querySelectorAll(".wgt-counter[data-counter-for]").forEach((el) => {
      const target = document.getElementById(el.dataset.counterFor);
      if (!target) return;
      const max = target.getAttribute("maxlength") || "60";
      el.textContent = `${(target.value || "").length} / ${max}`;
    });
  }

  // ─── Preview state + viewport toggles ─────────────────────
  const stateBar = document.getElementById("wgtPreviewStates");
  if (stateBar && livePreview) {
    stateBar.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-preview-state]");
      if (!btn) return;
      stateBar.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b === btn));
      livePreview.dataset.state = btn.dataset.previewState;
    });
  }
  const viewportBar = document.getElementById("wgtViewport");
  if (viewportBar && browser) {
    viewportBar.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-viewport]");
      if (!btn) return;
      viewportBar.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b === btn));
      browser.dataset.viewport = btn.dataset.viewport;
    });
  }
  if (liveBubble) {
    liveBubble.addEventListener("click", () => {
      livePreview.dataset.state = "open";
      if (stateBar) {
        stateBar.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b.dataset.previewState === "open"));
      }
    });
  }
  // Header has no close button in this layout; the preview-state pills above
  // the browser frame are the way to flip between closed/open/submitted.

  // ─── Email notification toggle: collapse field when off ───
  function renderEmailField() {
    if (!emailField || !emailNotifyToggle) return;
    emailField.style.display = emailNotifyToggle.checked ? "" : "none";
  }
  if (emailNotifyToggle) {
    emailNotifyToggle.addEventListener("change", () => {
      renderEmailField();
      scheduleAutosave();
    });
    renderEmailField();
  }
  const emailAddressInput = document.getElementById("wgtEmailAddress");
  if (emailAddressInput) {
    emailAddressInput.addEventListener("input", () => scheduleAutosave());
  }

  // ─── Autosave debounce ────────────────────────────────────
  let saveTimer = null;
  function showSaved() {
    if (!savedPill) return;
    savedPill.classList.add("is-visible");
    clearTimeout(showSaved._t);
    showSaved._t = setTimeout(() => savedPill.classList.remove("is-visible"), 2000);
  }
  function scheduleAutosave() {
    if (typeof window.saveBotConfig !== "function") return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await window.saveBotConfig();
        showSaved();
      } catch (_) {}
    }, 800);
  }

  // ─── Copy button (Embed code) ─────────────────────────────
  const copyBtn = document.getElementById("copyEmbedButton");
  const codeBox = document.getElementById("embedScriptBox");
  if (copyBtn && codeBox) {
    // Replace any legacy listeners by cloning the node.
    const fresh = copyBtn.cloneNode(true);
    copyBtn.parentNode.replaceChild(fresh, copyBtn);
    const label = fresh.querySelector(".wgt-copy-label");
    fresh.addEventListener("click", async () => {
      const text = codeBox.textContent || "";
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
        fresh.classList.add("is-copied");
        if (label) label.textContent = "Copied";
        clearTimeout(fresh._t);
        fresh._t = setTimeout(() => {
          fresh.classList.remove("is-copied");
          if (label) label.textContent = "Copy";
        }, 2000);
      } catch (_) {}
    });
  }

  // ─── Initial paint ────────────────────────────────────────
  function initPaint() {
    // If no preset matches the current primary color, leave the swatch row alone
    // (the custom color picker still represents the current value).
    if (primaryColor && !PRESETS.includes((primaryColor.value || "").toLowerCase())) {
      // Keep current value; nothing to do.
    }
    renderSwatchActive();
    renderIconActive();
    renderPositionActive();
    renderLive();
    renderCounters();
    renderContrastWarn();
  }
  // Defer one frame so any earlier init code that sets default values has run.
  requestAnimationFrame(initPaint);
  // Also re-init when the route becomes the settings tab, in case values
  // arrived asynchronously from /bot-config after this script loaded.
  document.addEventListener("visibilitychange", () => { if (!document.hidden) initPaint(); });
}

// ─── Module lifecycle ─────────────────────────────────────────────────────────

export function init() {
  _initSettings();
}
