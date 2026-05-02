// web/src/routes/voice.js
//
// Voice route: voice personality + script settings panel.
// Loaded lazily via window.__dashboardLoadRouteModule.
//
// What lives here:
//   - VOICE_FIRST_TEMPLATES / VOICE_MISSED_TEMPLATES
//   - renderBusinessTemplate()
//   - renderVoicePreview()
//   - loadVoiceSettings()   — fetches /me, /me/voice-settings, /voices,
//                              /me/customization; wires all controls
//
// What stays inline:
//   - SECTION_ON_ENTER.voice shim (now updated to load this bundle first)

// ─── Voice script templates ──────────────────────────────────────────────────

const VOICE_FIRST_TEMPLATES = {
  "default":  "Hi, thanks for calling {business_name}. How can I help you today?",
  "warm":     "Hey there — thanks for reaching out to {business_name}. What can I help you with?",
  "concise":  "{business_name} — how can we help?",
};
const VOICE_MISSED_TEMPLATES = {
  "default":    "Hi, this is the assistant at {business_name} returning your call. How can I help?",
  "apologetic": "Hi — sorry we missed you. This is {business_name}. How can I help?",
  "concise":    "Returning your call to {business_name}. How can I help?",
};

// Replace {business_name} with the user's value if they have one, or
// with empty string + clean up the resulting double-spaces / orphaned
// punctuation if they don't. We never substitute "your business" — an
// unset field means "drop the variable entirely."
function renderBusinessTemplate(raw, businessName) {
  const value = (businessName || "").trim();
  let out = String(raw || "").replace(/\{business_name\}/g, value);
  if (!value) {
    // Tidy up: remove extra spaces, orphan commas/periods, leading
    // junk like "calling , how can I help" → "calling, how can I help".
    out = out
      .replace(/\s+,/g, ",")
      .replace(/\s+\./g, ".")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  return out;
}

function renderVoicePreview(textareaId, previewId, businessName) {
  const ta = document.getElementById(textareaId);
  const preview = document.getElementById(previewId);
  if (!ta || !preview) return;
  const rendered = renderBusinessTemplate(ta.value || "", businessName);
  preview.textContent = rendered ? `"${rendered}"` : "";
}

// ─── Main loader ─────────────────────────────────────────────────────────────

async function loadVoiceSettings() {
  const personality = document.getElementById("voicePersonality");
  const intentSel = document.getElementById("voiceIntent");
  const intentHelp = document.getElementById("voiceIntentHelp");
  const script = document.getElementById("voiceScript");
  const resetBtn = document.getElementById("voiceResetBtn");
  const saveBtn = document.getElementById("voiceSaveBtn");
  const status = document.getElementById("voiceSaveStatus");
  if (!personality || !intentSel || !script) return;

  // Local state of both scripts; the visible textarea reflects the
  // currently-picked intent and writes back into this object on edit.
  // businessName starts as empty string — preview keeps the {business_name}
  // token visible (or drops it cleanly if the user hasn't set one) until
  // we hear back from /me.
  const state = {
    first_call_script: VOICE_FIRST_TEMPLATES["default"],
    missed_call_script: VOICE_MISSED_TEMPLATES["default"],
    first_call_intent: "default",
    missed_call_intent: "default",
    businessName: "",
  };

  function helpText(intent) {
    return intent === "missed_call"
      ? "Said when the customer is calling back after a missed connection."
      : "Said when a customer calls for the first time.";
  }

  function defaultScript(intent) {
    return intent === "missed_call"
      ? VOICE_MISSED_TEMPLATES["default"]
      : VOICE_FIRST_TEMPLATES["default"];
  }

  function renderPreview() {
    const preview = document.getElementById("voicePreview");
    if (!preview) return;
    const raw = (script.value || "").trim();
    const rendered = renderBusinessTemplate(raw, state.businessName);
    preview.textContent = rendered ? `"${rendered}"` : "";
    const listenBtn = document.getElementById("voiceListenBtn");
    if (listenBtn) {
      listenBtn.dataset.text = rendered;
      // Only enable while not generating; in-flight requests hold the
      // button busy until the audio is ready or the request fails.
      if (listenBtn.dataset.busy !== "1") {
        listenBtn.disabled = !rendered;
      }
    }
  }

  function showCurrent() {
    const intent = intentSel.value;
    if (intentHelp) intentHelp.textContent = helpText(intent);
    script.value = (intent === "missed_call" ? state.missed_call_script : state.first_call_script) || "";
    renderPreview();
  }

  try {
    const [meRes, vRes, voicesRes, custRes] = await Promise.all([
      fetch("/me", { credentials: "same-origin" }),
      fetch("/me/voice-settings", { credentials: "same-origin" }),
      fetch("/voices", { credentials: "same-origin" }),
      fetch("/me/customization", { credentials: "same-origin" }),
    ]);
    if (meRes.ok) {
      const me = await meRes.json();
      // Cache for any later module (placeholder picker, etc.) that
      // needs the account profile without re-fetching /me.
      window.__appMe = me;
      if (me.business_name) state.businessName = me.business_name;
    }
    if (vRes.ok) {
      const data = await vRes.json();
      personality.value = data.personality || "professional";
      state.first_call_intent = data.first_call_intent || "default";
      state.missed_call_intent = data.missed_call_intent || "default";
      state.first_call_script = (data.first_call_script || "").trim() || VOICE_FIRST_TEMPLATES[state.first_call_intent] || VOICE_FIRST_TEMPLATES["default"];
      state.missed_call_script = (data.missed_call_script || "").trim() || VOICE_MISSED_TEMPLATES[state.missed_call_intent] || VOICE_MISSED_TEMPLATES["default"];
      if (data.active_intent === "missed_call") intentSel.value = "missed_call";
      else intentSel.value = "first_call";
    }
    // Populate the AI Voice dropdown from /voices, then highlight the
    // user's currently-selected voice from /me/customization.
    const voiceSel = document.getElementById("voiceVoiceId");
    if (voiceSel) {
      let voicesList = [];
      let defaultVoice = "marin";
      if (voicesRes.ok) {
        const data = await voicesRes.json().catch(() => ({}));
        voicesList = (data && data.voices) || [];
        defaultVoice = (data && data.default) || defaultVoice;
      }
      let currentVoice = defaultVoice;
      if (custRes.ok) {
        const cdata = await custRes.json().catch(() => ({}));
        const c = cdata && cdata.customization;
        if (c && c.voice && c.voice.voice_id) currentVoice = c.voice.voice_id;
      }
      // Pretty labels for the OpenAI Realtime voices — fall back to the
      // raw id if a new voice ships before we update this map.
      const VOICE_LABELS = {
        marin:   "Marin — warm, neutral",
        cedar:   "Cedar — calm, grounded",
        alloy:   "Alloy — neutral, versatile",
        ash:     "Ash — dry, articulate",
        ballad:  "Ballad — soft, expressive",
        coral:   "Coral — friendly, upbeat",
        echo:    "Echo — measured, clear",
        sage:    "Sage — composed, advisory",
        shimmer: "Shimmer — bright, energetic",
        verse:   "Verse — youthful, conversational",
      };
      const opts = voicesList.map((v) => {
        const id = v.voice_id;
        const label = VOICE_LABELS[id] || id;
        const sel = (id === currentVoice) ? " selected" : "";
        return `<option value="${id}"${sel}>${label}</option>`;
      }).join("");
      voiceSel.innerHTML = opts || '<option value="" disabled>No voices available</option>';
      voiceSel.addEventListener("change", async () => {
        const newId = voiceSel.value;
        voiceSel.disabled = true;
        try {
          const res = await fetch("/me/customization", {
            method: "POST",  // proxy doesn't forward PATCH — see route.c
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ voice: { voice_id: newId } }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            alert(`Couldn't save voice: ${data.error || res.status}`);
            // Reset to whatever was previously selected.
            voiceSel.value = currentVoice;
            return;
          }
          currentVoice = newId;
          // Voice ID change is part of the publish gate — fire the
          // widget:saved event so the floating Publish pill refreshes
          // and lights up immediately.
          window.dispatchEvent(new CustomEvent("widget:saved"));
        } catch (e) {
          alert("Network error saving voice.");
          voiceSel.value = currentVoice;
        } finally {
          voiceSel.disabled = false;
        }
      });
    }
  } catch (e) { /* silent */ }

  showCurrent();

  // Switching intent updates the visible textarea + help line.
  intentSel.addEventListener("change", () => showCurrent());

  // Edits write back into state for the currently-picked intent.
  script.addEventListener("input", () => {
    if (intentSel.value === "missed_call") state.missed_call_script = script.value;
    else state.first_call_script = script.value;
    renderPreview();
  });

  if (resetBtn) resetBtn.addEventListener("click", () => {
    const def = defaultScript(intentSel.value);
    script.value = def;
    if (intentSel.value === "missed_call") state.missed_call_script = def;
    else state.first_call_script = def;
    renderPreview();
  });

  // ── Listen button: synthesize the rendered opener in the bot's voice. ──
  const listenBtn = document.getElementById("voiceListenBtn");
  const listenIcon = document.getElementById("voiceListenIcon");
  const listenLabel = document.getElementById("voiceListenLabel");
  const listenStatus = document.getElementById("voiceListenStatus");
  const listenPlayer = document.getElementById("voiceListenPlayer");
  let listenBlobUrl = null;

  function setListenStatus(msg, kind) {
    if (!listenStatus) return;
    listenStatus.textContent = msg || "";
    listenStatus.className = "voice-listen-status" + (kind ? " " + kind : "");
  }

  function setListenIdle() {
    if (!listenBtn) return;
    listenBtn.dataset.busy = "0";
    listenBtn.classList.remove("is-playing");
    if (listenIcon) listenIcon.textContent = "▶";
    if (listenLabel) listenLabel.textContent = "Listen";
    listenBtn.disabled = !((listenBtn.dataset.text || "").trim());
  }

  function setListenPlaying() {
    if (!listenBtn) return;
    listenBtn.classList.add("is-playing");
    if (listenIcon) listenIcon.textContent = "■";
    if (listenLabel) listenLabel.textContent = "Stop";
    listenBtn.disabled = false;
  }

  function setListenLoading() {
    if (!listenBtn) return;
    listenBtn.dataset.busy = "1";
    listenBtn.classList.remove("is-playing");
    if (listenIcon) listenIcon.textContent = "⏳";
    if (listenLabel) listenLabel.textContent = "Generating…";
    listenBtn.disabled = true;
  }

  if (listenPlayer) {
    listenPlayer.addEventListener("ended", () => setListenIdle());
    listenPlayer.addEventListener("pause", () => {
      // Pause without an end-of-stream means the user/code stopped it —
      // reset so the next click re-plays from the beginning.
      if (!listenPlayer.ended) setListenIdle();
    });
    listenPlayer.addEventListener("error", () => {
      setListenIdle();
      setListenStatus("Could not play audio.", "error");
    });
  }

  if (listenBtn) {
    listenBtn.addEventListener("click", async () => {
      // Stop in-progress playback first so the button toggles cleanly.
      if (listenBtn.classList.contains("is-playing") && listenPlayer) {
        listenPlayer.pause();
        listenPlayer.currentTime = 0;
        setListenIdle();
        return;
      }
      const text = (listenBtn.dataset.text || "").trim();
      if (!text) return;
      setListenStatus("");
      setListenLoading();
      try {
        const res = await fetch("/me/voice-settings/preview", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: text,
            personality: personality.value || "professional",
          }),
        });
        if (!res.ok) {
          let msg = "Preview failed (" + res.status + ")";
          try {
            const err = await res.json();
            if (err && err.error) msg = err.error;
          } catch (_) { /* not JSON */ }
          setListenIdle();
          setListenStatus(msg, "error");
          return;
        }
        const blob = await res.blob();
        if (listenBlobUrl) URL.revokeObjectURL(listenBlobUrl);
        listenBlobUrl = URL.createObjectURL(blob);
        listenPlayer.src = listenBlobUrl;
        setListenPlaying();
        try {
          await listenPlayer.play();
        } catch (_) {
          setListenIdle();
          setListenStatus("Playback blocked — click Listen again.", "error");
        }
      } catch (e) {
        setListenIdle();
        setListenStatus("Network error.", "error");
      }
    });
  }

  function setStatus(msg, kind) {
    if (!status) return;
    status.textContent = msg || "";
    status.className = "voice-save-status" + (kind ? " " + kind : "");
  }

  // Auto-save: every change to personality / intent / script writes
  // to bronze immediately so the floating Publish pill picks it up
  // and the user never has to hunt for a "Save" button. Publish is
  // what makes it live; saving here just persists the draft.
  let voiceSaveT = null;
  let voiceLastSave = null;
  function autoSaveVoice() {
    clearTimeout(voiceSaveT);
    voiceSaveT = setTimeout(async () => {
      const body = {
        personality: personality.value,
        first_call_intent: state.first_call_intent,
        missed_call_intent: state.missed_call_intent,
        first_call_script: state.first_call_script || "",
        missed_call_script: state.missed_call_script || "",
        active_intent: intentSel.value === "missed_call" ? "missed_call" : "first_call",
      };
      // Skip if nothing actually changed since the last write — prevents
      // a refresh of the page from churning a meaningless write that
      // would dirty the publish pill without a real change.
      const sig = JSON.stringify(body);
      if (sig === voiceLastSave) return;
      setStatus("Saving…");
      try {
        const res = await fetch("/me/voice-settings", {
          method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: sig,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setStatus(err.error || ("Save failed (" + res.status + ")"), "error");
          return;
        }
        voiceLastSave = sig;
        setStatus("Saved — hit Publish to make it live.", "ok");
        // Tell the global publish pill to re-fetch status NOW so it
        // can light up immediately instead of waiting on the 60s poll.
        window.dispatchEvent(new CustomEvent("widget:saved"));
      } catch (e) {
        setStatus("Network error", "error");
      } finally {
        setTimeout(() => setStatus(""), 4000);
      }
    }, 500);
  }
  // Wire every editable control to the autosave debouncer.
  if (personality) personality.addEventListener("change", autoSaveVoice);
  if (intentSel)   intentSel.addEventListener("change",   autoSaveVoice);
  if (script)      script.addEventListener("input",       autoSaveVoice);
  // The legacy explicit Save button is now redundant. Hide it but
  // leave the markup so existing wiring (status, etc.) doesn't break.
  if (saveBtn) saveBtn.style.display = "none";
}

// ─── Module lifecycle ─────────────────────────────────────────────────────────

let _initialized = false;

export function init() {
  // init() is a no-op for voice — loadVoiceSettings is called directly
  // by the SECTION_ON_ENTER shim. This exists for API consistency.
  _initialized = true;
}

// ─── Expose globals the inline router code expects ────────────────────────────

window.loadVoiceSettings = loadVoiceSettings;
