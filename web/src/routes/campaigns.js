// web/src/routes/campaigns.js
//
// Campaigns route: the "One-time blasts" + "Automations" sub-tabs and
// the Automation Wizard. Loaded lazily via window.__dashboardLoadRouteModule.

// ─── Constants ──────────────────────────────────────────────────────────────

const TOKEN_DISPLAY_MAP = [
  ["{first_name}",     "[first name]"],
  ["{last_name}",      "[last name]"],
  ["{service_type}",   "[their service]"],
  ["{appointment_at}", "[appointment time]"],
  ["{phone}",          "[their phone]"],
  ["{address}",        "[their address]"],
  ["{owner_name}",     "[your name]"],
  ["{reschedule_link}","[reschedule link]"],
  ["{review_link}",    "[review link]"],
];

const AUTOMATION_HEADLINES = {
  "first_contact":       "Greets new leads and pings you to follow up.",
  "job_onboarding":      "Confirms bookings and sends prep reminders.",
  "estimate_onboarding": "Confirms estimates with a friendly reminder.",
  "quote_followup":      "Chases quotes with a couple of nudges.",
  "during_job":          "Reminds you to take notes and photos.",
  "after_job":           "Says thanks and asks for a review.",
  "win_back":            "Reaches back to leads who went cold.",
};

const AUTOMATION_SUMMARIES = {
  "first_contact": "When a new lead comes in, we wait 30 seconds, then send them a quick 'we got your message' email. After that, if you haven't responded yourself within 5 minutes, we text you a reminder so you don't miss it.",
  "job_onboarding": "When you book a job with a customer, we send them a confirmation right away. The day before the job, we send a friendly reminder. The morning of, we ping you with the day's appointments so you know what to prep for.",
  "estimate_onboarding": "When you book an estimate, we send a confirmation email to the customer. The day before, we send them a reminder so they remember you're coming.",
  "quote_followup": "After you send a quote, we follow up with the customer twice over the next two weeks. First a friendly check-in, then a softer nudge if they still haven't replied.",
  "during_job": "While the work is happening, we ping you periodically to remind you to write down notes and snap a few photos. This helps when the customer asks questions later or wants to leave a review.",
  "after_job": "When the job's done, we send a thank-you email and ask the customer to leave you a review. Six months later, we reach back out to see if they need anything else.",
  "win_back": "When a lead has gone cold, we reach back out about a month later with a soft check-in. About one in five replies."
};

const AUTOMATION_ICONS = {
  "first_contact":       "📥",
  "job_onboarding":      "🛠️",
  "estimate_onboarding": "📋",
  "quote_followup":      "💬",
  "during_job":          "📷",
  "after_job":           "⭐",
  "win_back":            "🔄",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function toFriendly(text) {
  let out = String(text || "");
  for (const [a, b] of TOKEN_DISPLAY_MAP) out = out.split(a).join(b);
  return out;
}

function toInternal(text) {
  let out = String(text || "");
  for (const [a, b] of TOKEN_DISPLAY_MAP) out = out.split(b).join(a);
  return out;
}

function friendlyTime(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s === 0)    return "right away";
  if (s < 60)    { const n = s;               return `${n} second${n === 1 ? "" : "s"}`; }
  if (s < 3600)  { const m = Math.round(s/60);  return `${m} minute${m === 1 ? "" : "s"}`; }
  if (s < 86400) { const h = Math.round(s/3600); return `${h} hour${h === 1 ? "" : "s"}`; }
  const d = Math.round(s/86400); return `${d} day${d === 1 ? "" : "s"}`;
}

function pickUnit(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  if (s === 0)    return { unit: "now",     value: 0 };
  if (s < 60)    return { unit: "seconds", value: s };
  if (s < 3600)  return { unit: "minutes", value: Math.round(s/60) };
  if (s < 86400) return { unit: "hours",   value: Math.round(s/3600) };
  return { unit: "days", value: Math.round(s/86400) };
}

function unitToSeconds(unit, value) {
  const v = Math.max(0, Number(value) || 0);
  if (unit === "now")     return 0;
  if (unit === "seconds") return v;
  if (unit === "minutes") return v * 60;
  if (unit === "hours")   return v * 3600;
  if (unit === "days")    return v * 86400;
  return v;
}

function escHtmlWiz(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function escAttrWiz(s) { return escHtmlWiz(s); }

// ─── Sequences list ─────────────────────────────────────────────────────────

const SEQ_DESCRIPTIONS = {
  "first_contact":      "Greets every new lead automatically and pings you to follow up.",
  "job_onboarding":     "Confirms the booking, sends prep reminders, and pings before the appointment.",
  "estimate_onboarding":"Confirms the estimate, sends a reminder before the visit.",
  "quote_followup":     "Chases a quote with friendly nudges over two weeks.",
  "during_job":         "Reminds you to log notes and capture photos while the work is happening.",
  "after_job":          "Says thanks, asks for a review, and reaches back out 6 months later.",
  "win_back":           "Reaches back out to leads that went cold.",
};

function _escHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

async function loadSequences() {
  const list = document.getElementById("sequencesList");
  if (!list) return;
  // Show shimmer while loading
  list.innerHTML = `
    <div class="seq-skeleton"></div>
    <div class="seq-skeleton" style="opacity:0.6;"></div>`;
  try {
    const res = await fetch("/me/sequences", { credentials: "same-origin" });
    if (!res.ok) { list.innerHTML = ""; return; }
    const data = await res.json();
    const seqs = data.sequences || [];
    if (!seqs.length) {
      list.innerHTML = `
        <div class="seq-empty-card">
          <div class="seq-empty-icon">📭</div>
          <p class="seq-empty-title">No automations running yet</p>
          <p class="seq-empty-sub">Once you turn on an automation it will show up here, ready to go.</p>
        </div>`;
      return;
    }
    list.innerHTML = seqs.map(s => {
      const isRunning = s.active;
      const desc = SEQ_DESCRIPTIONS[s.id] || (s.step_count + " steps in this automation.");
      const statusClass = isRunning ? "is-running" : "is-paused";
      const statusLabel = isRunning ? "● Running" : "Paused";
      return `
        <div class="seq-row-card">
          <div class="seq-row-icon" aria-hidden="true">📩</div>
          <div>
            <p class="seq-row-name">${_escHtml(s.name)}</p>
            <p class="seq-row-desc">${_escHtml(desc)}</p>
          </div>
          <span class="seq-status-pill ${statusClass}">${statusLabel}</span>
          <button type="button" class="seq-edit-btn"
                  data-seq-edit="${_escHtml(s.id)}">Edit</button>
        </div>`;
    }).join("");
    // wire edit buttons
    list.querySelectorAll("[data-seq-edit]").forEach(btn => {
      btn.addEventListener("click", () => {
        const sid = btn.dataset.seqEdit;
        // use the same routing mechanism as hash links
        window.location.hash = "sequence-edit-" + sid;
      });
    });
  } catch (_) {
    list.innerHTML = `
      <div class="seq-empty-card">
        <div class="seq-empty-icon">⚠️</div>
        <p class="seq-empty-title">Couldn't load automations</p>
        <p class="seq-empty-sub">Check your connection and try refreshing.</p>
      </div>`;
  }
}

// ─── Campaigns sub-tabs ──────────────────────────────────────────────────────

let _campaignsSubtabsInitialized = false;

function initCampaignsSubtabs() {
  if (_campaignsSubtabsInitialized) return;
  _campaignsSubtabsInitialized = true;

  const subtabs = document.querySelectorAll(".camp-subtab");
  const panes = document.querySelectorAll(".camp-tab-pane");
  if (!subtabs.length) return;

  subtabs.forEach(b => b.addEventListener("click", () => {
    const target = b.dataset.campTab;
    subtabs.forEach(x => x.classList.toggle("is-active", x === b));
    panes.forEach(p => p.hidden = p.dataset.campPane !== target);
    if (target === "sequences") loadSequences();
  }));
}

// ─── Wizard state ────────────────────────────────────────────────────────────

let WIZARD_STATE = {
  sequenceId: null,
  def: null,
  emailEdits: [],
  smsEdits: [],
  ownerEdits: [],
  waitEdits: [],
  step: 1,
  hasEmailSteps: false,
  hasWaits: false,
};

// ─── Wizard helpers ──────────────────────────────────────────────────────────

function pillRowHtml() {
  const visible = ["[first name]","[their service]","[their phone]","[appointment time]"];
  return TOKEN_DISPLAY_MAP
    .filter(([, friendly]) => visible.includes(friendly))
    .map(([, friendly]) =>
      `<button type="button" class="wiz-pill" data-insert="${escAttrWiz(friendly)}">${escHtmlWiz(friendly)}</button>`)
    .join("");
}

function emailEditCardHtml(stepIdx, num, when, e) {
  const subjectId = `wizEmailSubject-${stepIdx}`;
  const bodyId    = `wizEmailBody-${stepIdx}`;
  return `<div class="wiz-mail-edit-card" data-step="${stepIdx}" data-kind="email">
    <div class="wiz-mail-badge-head">📧 Email #${num}</div>
    <div class="wiz-mail-badge-sub">${escHtmlWiz(when)}</div>
    <label class="wiz-input-label" for="${subjectId}">Subject line</label>
    <input class="wiz-input" id="${subjectId}" data-field="subject" value="${escAttrWiz(e.subject)}" placeholder="What appears in the inbox">
    <div class="wiz-pill-row" data-target-id="${subjectId}">${pillRowHtml()}</div>
    <div class="wiz-tap-to-add">Tap to add.</div>
    <label class="wiz-input-label" for="${bodyId}">Email body</label>
    <textarea class="wiz-textarea" id="${bodyId}" data-field="body" rows="7" placeholder="What you want to say">${escHtmlWiz(e.body)}</textarea>
    <div class="wiz-pill-row" data-target-id="${bodyId}">${pillRowHtml()}</div>
    <div class="wiz-tap-to-add">Tap to add.</div>
  </div>`;
}

function smsEditCardHtml(stepIdx, num, when, e) {
  const bodyId = `wizSmsBody-${stepIdx}`;
  return `<div class="wiz-mail-edit-card" data-step="${stepIdx}" data-kind="sms">
    <div class="wiz-mail-badge-head">📱 Text #${num}</div>
    <div class="wiz-mail-badge-sub">${escHtmlWiz(when)}</div>
    <label class="wiz-input-label" for="${bodyId}">Message</label>
    <textarea class="wiz-textarea" id="${bodyId}" data-field="body" rows="3" placeholder="Keep it short — texts are read fast">${escHtmlWiz(e.body)}</textarea>
    <div class="wiz-pill-row" data-target-id="${bodyId}">${pillRowHtml()}</div>
    <div class="wiz-tap-to-add">Tap to add.</div>
  </div>`;
}

function nextSendStepFrom(steps, fromIdx) {
  for (let j = fromIdx + 1; j < steps.length; j++) {
    if (["send_email","send_sms","owner_alert","ai_conversation"].includes(steps[j].type)) return steps[j];
  }
  return null;
}

// ─── Wizard entry point ──────────────────────────────────────────────────────

async function loadAutomationWizard(sequenceId) {
  WIZARD_STATE = {
    sequenceId,
    def: null,
    emailEdits: [],
    smsEdits: [],
    ownerEdits: [],
    waitEdits: [],
    step: 1,
    hasEmailSteps: false,
    hasWaits: false,
  };
  try {
    const res = await fetch(`/me/sequences/${encodeURIComponent(sequenceId)}`,
                            { credentials: "same-origin" });
    if (!res.ok) return;
    WIZARD_STATE.def = await res.json();
  } catch (_) { return; }

  (WIZARD_STATE.def.steps || []).forEach((s, i) => {
    if (s.type === "send_email") {
      WIZARD_STATE.emailEdits[i] = {
        subject: toFriendly(s.subject || ""),
        body:    toFriendly(s.body    || ""),
      };
      WIZARD_STATE.hasEmailSteps = true;
    } else if (s.type === "send_sms") {
      WIZARD_STATE.smsEdits[i] = { body: toFriendly(s.body || "") };
      WIZARD_STATE.hasEmailSteps = true;
    } else if (s.type === "owner_alert") {
      WIZARD_STATE.ownerEdits[i] = { body: toFriendly(s.body || "") };
    } else if (s.type === "wait") {
      WIZARD_STATE.waitEdits[i] = { kind: "elapsed", seconds: Number(s.seconds || 0) };
      WIZARD_STATE.hasWaits = true;
    } else if (s.type === "wait_until_appointment") {
      WIZARD_STATE.waitEdits[i] = { kind: "appt", offset: Number(s.offset_seconds_before || 0) };
      WIZARD_STATE.hasWaits = true;
    }
  });

  renderWizardHeader();
  goToWizardStep(1);
}

// ─── Wizard render ───────────────────────────────────────────────────────────

function renderWizardHeader() {
  const def = WIZARD_STATE.def;
  document.getElementById("wizIcon").textContent    = AUTOMATION_ICONS[def.id] || "⚙️";
  document.getElementById("wizTitle").textContent   = def.name || def.id;
  document.getElementById("wizSubtitle").textContent =
    AUTOMATION_HEADLINES[def.id] || "An automation that runs for new leads.";
}

function goToWizardStep(n) {
  WIZARD_STATE.step = n;
  // Skip timing screen when nothing to adjust
  if (n === 3 && !WIZARD_STATE.hasWaits) { goToWizardStep(4); return; }

  // Progress dots
  document.querySelectorAll(".wiz-dot").forEach(d => {
    const sn = Number(d.dataset.wizStep);
    d.classList.toggle("is-active", sn === n);
    d.classList.toggle("is-done",   sn < n);
    if (sn === n) d.setAttribute("aria-current", "step");
    else          d.removeAttribute("aria-current");
  });

  const labels = { 1: "Looking at it", 2: "Edit the words",
                   3: "Change the timing", 4: "Test it" };
  document.getElementById("wizStepLabel").textContent = labels[n] || "";
  document.getElementById("wizBody").innerHTML = renderWizardBody(n);
  attachWizardBodyHandlers(n);
  renderWizardFooter(n);
}

function renderWizardBody(n) {
  if (n === 1) return renderWizStep1();
  if (n === 2) return renderWizStep2();
  if (n === 3) return renderWizStep3();
  if (n === 4) return renderWizStep4();
  return "";
}

function renderWizardFooter(n) {
  const back = document.getElementById("wizBackBtn");
  const next = document.getElementById("wizNextBtn");
  back.hidden = (n === 1);
  back.onclick = () => {
    // If no waits, skip from 4 back to 2
    const prev = (n === 4 && !WIZARD_STATE.hasWaits) ? 2 : Math.max(1, n - 1);
    goToWizardStep(prev);
  };
  if (n === 1) {
    next.textContent = "Looks good, let me edit it";
    next.onclick = () => goToWizardStep(2);
  } else if (n === 2) {
    next.textContent = WIZARD_STATE.hasWaits ? "Continue to timing" : "Continue to test";
    next.onclick = () => goToWizardStep(3);
  } else if (n === 3) {
    next.textContent = "Continue to test";
    next.onclick = () => goToWizardStep(4);
  } else if (n === 4) {
    next.textContent = "Save changes";
    next.onclick = saveWizardChanges;
  }
}

// ── Step 1: visual card flow ──
function renderWizStep1() {
  const def = WIZARD_STATE.def;
  const steps = def.steps || [];

  // Build raw items list: { type, seconds (for waits), subject, body (for messages) }
  // Then apply owner_alert collapse logic
  const rawItems = steps.map((s) => {
    if (s.type === "wait")
      return { type: "wait", seconds: Number(s.seconds || 0) };
    if (s.type === "wait_until_appointment")
      return { type: "wait_until_appointment", seconds: Number(s.offset_seconds_before || 0) };
    if (s.type === "send_email")
      return { type: "send_email", subject: toFriendly(s.subject || ""), body: toFriendly(s.body || "") };
    if (s.type === "send_sms")
      return { type: "send_sms", body: toFriendly(s.body || "") };
    if (s.type === "owner_alert")
      return { type: "owner_alert" };
    if (s.type === "ai_conversation")
      return { type: "ai_conversation" };
    return null;
  }).filter(Boolean);

  // Collapse repeated owner_alert patterns:
  // N>=2 owner_alerts interleaved with N-1 waits of the same duration → single collapsed card
  function collapseOwnerAlerts(items) {
    const out = [];
    let i = 0;
    while (i < items.length) {
      const item = items[i];
      if (item.type !== "owner_alert") { out.push(item); i++; continue; }
      // Look ahead for pattern: owner_alert (wait owner_alert)+ where all waits equal
      let j = i + 1;
      let repeatWait = null;
      let count = 1;
      while (j < items.length) {
        const w = items[j];
        const oa = items[j + 1];
        if (w && w.type === "wait" && oa && oa.type === "owner_alert") {
          if (repeatWait === null) repeatWait = w.seconds;
          if (w.seconds !== repeatWait) break;
          count++;
          j += 2;
        } else {
          break;
        }
      }
      if (count >= 2 && repeatWait !== null) {
        out.push({ type: "owner_alert_collapsed", repeatEvery: repeatWait });
        i = j;
      } else {
        out.push(item);
        i++;
      }
    }
    return out;
  }

  const collapsed = collapseOwnerAlerts(rawItems);

  // Now build flow items: alternating connector pills and cards
  const flowItems = [];
  let pendingWait = null;

  collapsed.forEach((item) => {
    if (item.type === "wait" || item.type === "wait_until_appointment") {
      pendingWait = item;
      return;
    }
    // Emit connector before this card if there was a wait
    if (pendingWait) {
      let pillText;
      if (pendingWait.type === "wait_until_appointment") {
        pillText = `${friendlyTime(pendingWait.seconds)} before the appointment`;
      } else {
        pillText = friendlyTime(pendingWait.seconds) === "right away"
          ? "right away"
          : friendlyTime(pendingWait.seconds);
      }
      flowItems.push({ kind: "connector", pill: pillText });
      pendingWait = null;
    }
    // Emit card
    const hadPrecedingConnector = flowItems.length > 0 && flowItems[flowItems.length - 1].kind === "connector";
    if (item.type === "send_email") {
      const firstSentence = item.subject || item.body.split(/[.\n]/)[0];
      flowItems.push({
        kind: "card",
        dataKind: "email",
        icon: "📧",
        label: "Email to your customer",
        headline: `"${firstSentence}"`,
        timing: hadPrecedingConnector ? null : "Sent right away",
      });
    } else if (item.type === "send_sms") {
      const firstSentence = (item.body || "").split(/[.\n]/)[0].trim();
      flowItems.push({
        kind: "card",
        dataKind: "sms",
        icon: "📱",
        label: "Text to your customer",
        headline: `"${firstSentence}"`,
        timing: hadPrecedingConnector ? null : "Sent right away",
      });
    } else if (item.type === "owner_alert") {
      flowItems.push({
        kind: "card",
        dataKind: "owner",
        icon: "🔔",
        label: "Reminder to you",
        headline: "We text you that the lead is waiting.",
        timing: "Customers don't see this.",
      });
    } else if (item.type === "owner_alert_collapsed") {
      flowItems.push({
        kind: "card",
        dataKind: "owner",
        icon: "🔔",
        label: "Reminder to you",
        headline: `We'll keep reminding you every ${friendlyTime(item.repeatEvery)} until you reply.`,
        timing: "Customers don't see this.",
      });
    } else if (item.type === "ai_conversation") {
      flowItems.push({
        kind: "card",
        dataKind: "ai",
        icon: "🤖",
        label: "AI takes over",
        headline: "AI replies for you when you can't.",
        timing: "Only when you've gone silent.",
      });
    }
  });

  const html = flowItems.map((fi) => {
    if (fi.kind === "connector") {
      return `<div class="wiz-flow-connector">
        <span class="wiz-flow-pill">${escHtmlWiz(fi.pill)}</span>
      </div>`;
    }
    // card
    const timingLine = fi.timing
      ? `<div class="wiz-flow-timing">${escHtmlWiz(fi.timing)}</div>`
      : "";
    return `<div class="wiz-flow-card" data-kind="${fi.dataKind}">
      <div class="wiz-flow-row">
        <span class="wiz-flow-icon">${fi.icon}</span>
        <span class="wiz-flow-label">${escHtmlWiz(fi.label)}</span>
      </div>
      <div class="wiz-flow-headline">${escHtmlWiz(fi.headline)}</div>
      ${timingLine}
    </div>`;
  }).join("");

  return `<div class="wiz-flow">${html}</div>`;
}

// ── Step 2: editable email/SMS cards ──
function renderWizStep2() {
  const def = WIZARD_STATE.def;
  if (!WIZARD_STATE.hasEmailSteps) {
    return `<div class="wiz-empty-card">
      <div class="wiz-empty-emoji">✏️</div>
      <p class="wiz-empty-text">There's nothing to edit here — this automation just sends you reminders, not customer emails.</p>
    </div>`;
  }
  const cards = [];
  let lastWait = null;
  let emailNum = 0, smsNum = 0;
  (def.steps || []).forEach((s, i) => {
    if (s.type === "wait") {
      lastWait = friendlyTime(Number(s.seconds || 0));
    } else if (s.type === "wait_until_appointment") {
      lastWait = friendlyTime(Number(s.offset_seconds_before || 0)) + " before the appointment";
    } else if (s.type === "send_email") {
      emailNum += 1;
      const e = WIZARD_STATE.emailEdits[i];
      const when = lastWait ? `Sent ${lastWait} after` : "Sent right away";
      cards.push(emailEditCardHtml(i, emailNum, when, e));
      lastWait = null;
    } else if (s.type === "send_sms") {
      smsNum += 1;
      const e = WIZARD_STATE.smsEdits[i];
      const when = lastWait ? `Sent ${lastWait} after` : "Sent right away";
      cards.push(smsEditCardHtml(i, smsNum, when, e));
      lastWait = null;
    } else if (s.type === "owner_alert" || s.type === "ai_conversation") {
      lastWait = null;
    }
  });
  return `${cards.join("")}`;
}

function attachWizStep2Handlers() {
  document.querySelectorAll(".wiz-mail-edit-card").forEach(card => {
    const stepIdx = Number(card.dataset.step);
    const kind    = card.dataset.kind;

    // Live-update WIZARD_STATE on every keystroke
    card.querySelectorAll("[data-field]").forEach(input => {
      input.addEventListener("input", () => {
        const field = input.dataset.field;
        if (kind === "email" && WIZARD_STATE.emailEdits[stepIdx]) {
          WIZARD_STATE.emailEdits[stepIdx][field] = input.value;
        } else if (kind === "sms" && WIZARD_STATE.smsEdits[stepIdx]) {
          WIZARD_STATE.smsEdits[stepIdx][field] = input.value;
        }
      });
    });

    // Pill insertion — inserts at cursor or appends
    card.querySelectorAll(".wiz-pill").forEach(pill => {
      pill.addEventListener("click", () => {
        const insert   = pill.dataset.insert;
        const pillRow  = pill.closest(".wiz-pill-row");
        const targetId = pillRow && pillRow.dataset.targetId;
        const target   = (targetId && document.getElementById(targetId)) ||
                         card.querySelector(":focus") ||
                         card.querySelector("textarea[data-field='body']");
        if (!target) return;
        const start = target.selectionStart != null ? target.selectionStart : target.value.length;
        const end   = target.selectionEnd   != null ? target.selectionEnd   : target.value.length;
        target.value = target.value.slice(0, start) + insert + target.value.slice(end);
        target.focus();
        target.selectionStart = target.selectionEnd = start + insert.length;
        target.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
  });
}

// ── Step 3: timing ──
function renderWizStep3() {
  const def = WIZARD_STATE.def;
  const rows = [];
  let emailNum = 0, smsNum = 0;
  (def.steps || []).forEach((s, i) => {
    if (s.type !== "wait" && s.type !== "wait_until_appointment") {
      if (s.type === "send_email") emailNum++;
      if (s.type === "send_sms") smsNum++;
      return;
    }
    const w = WIZARD_STATE.waitEdits[i];
    const seconds = w.kind === "appt" ? w.offset : w.seconds;
    const { unit, value } = pickUnit(seconds);
    const nextSend = nextSendStepFrom(def.steps, i);
    // Build plain-language heading based on what comes next
    let headIcon = "⏱️", headTitle = "Wait before sending the next one", headSub = "";
    if (nextSend) {
      if (nextSend.type === "send_email") {
        emailNum++;
        headIcon = "📧";
        headTitle = `Email #${emailNum}`;
        headSub = `"${toFriendly(nextSend.subject || nextSend.body || "").slice(0, 60)}"`;
      } else if (nextSend.type === "send_sms") {
        smsNum++;
        headIcon = "📱";
        headTitle = `Text #${smsNum}`;
        headSub = `"${toFriendly(nextSend.body || "").split(/[.\n]/)[0].trim().slice(0, 60)}"`;
      } else if (nextSend.type === "owner_alert") {
        headIcon = "🔔";
        headTitle = "Reminder to you (text or email)";
        headSub = "We ping your phone";
      } else if (nextSend.type === "ai_conversation") {
        headIcon = "🤖";
        headTitle = "AI takes over";
        headSub = "Only after you've gone silent";
      }
    }
    const numericHidden = unit === "now" ? " hidden" : "";
    const unitLabel = unit === "now" ? "minutes" : unit;
    rows.push(`<div class="wiz-time-row" data-step="${i}">
      <div class="wiz-time-card-head">
        <span class="wiz-flow-icon">${headIcon}</span>
        <span class="wiz-time-card-title">${escHtmlWiz(headTitle)}</span>
      </div>
      <div class="wiz-time-card-sub">${escHtmlWiz(headSub)}</div>
      <div class="wiz-time-segments" role="radiogroup">
        <button type="button" class="wiz-seg${unit==="now"?" is-active":""}" data-step="${i}" data-unit="now">Right away</button>
        <button type="button" class="wiz-seg${unit==="seconds"?" is-active":""}" data-step="${i}" data-unit="seconds">A few seconds</button>
        <button type="button" class="wiz-seg${unit==="minutes"?" is-active":""}" data-step="${i}" data-unit="minutes">A few minutes</button>
        <button type="button" class="wiz-seg${unit==="hours"?" is-active":""}" data-step="${i}" data-unit="hours">A few hours</button>
        <button type="button" class="wiz-seg${unit==="days"?" is-active":""}" data-step="${i}" data-unit="days">A few days</button>
      </div>
      <div class="wiz-time-numeric" data-step="${i}"${numericHidden}>
        <input class="wiz-input wiz-time-input-inline" type="number" min="0" max="999" value="${value}" data-step="${i}">
        <span class="wiz-time-unit-label">${escHtmlWiz(unitLabel)}</span>
      </div>
    </div>`);
  });
  return `<div class="wiz-edit-tip">Most people leave these alone.</div>
          ${rows.join("")}`;
}

function attachWizStep3Handlers() {
  // Segmented button click handler
  document.querySelectorAll(".wiz-seg").forEach(btn => {
    btn.addEventListener("click", () => {
      const stepIdx = Number(btn.dataset.step);
      const unit    = btn.dataset.unit;
      const w       = WIZARD_STATE.waitEdits[stepIdx];

      // Toggle active state
      document.querySelectorAll(`.wiz-seg[data-step="${stepIdx}"]`).forEach(b => {
        b.classList.toggle("is-active", b === btn);
      });

      // Show/hide numeric input and update unit label
      const numericDiv = document.querySelector(`.wiz-time-numeric[data-step="${stepIdx}"]`);
      if (numericDiv) {
        if (unit === "now") {
          numericDiv.hidden = true;
        } else {
          numericDiv.hidden = false;
          const unitLabelEl = numericDiv.querySelector(".wiz-time-unit-label");
          if (unitLabelEl) unitLabelEl.textContent = unit;
          const numInput = numericDiv.querySelector("input[type='number']");
          const value = numInput ? Number(numInput.value || 0) : 0;
          const seconds = unitToSeconds(unit, value);
          if (w.kind === "appt") w.offset = seconds; else w.seconds = seconds;
        }
        if (unit === "now") {
          if (w.kind === "appt") w.offset = 0; else w.seconds = 0;
        }
      }
    });
  });

  // Numeric input handler
  document.querySelectorAll(".wiz-time-input-inline").forEach(inp => {
    inp.addEventListener("input", () => {
      const stepIdx = Number(inp.dataset.step);
      const w       = WIZARD_STATE.waitEdits[stepIdx];
      const activeBtn = document.querySelector(`.wiz-seg.is-active[data-step="${stepIdx}"]`);
      const unit = activeBtn ? activeBtn.dataset.unit : "minutes";
      const seconds = unitToSeconds(unit, Number(inp.value || 0));
      if (w.kind === "appt") w.offset = seconds; else w.seconds = seconds;
    });
  });
}

// ── Step 4: send-test ──
function renderWizStep4() {
  return `
    <h3 class="wiz-section-h">Try it before you save</h3>
    <p class="wiz-helper-p">Send a test email to yourself. You'll get every customer-facing message in this automation, prefixed with [TEST] in the subject.</p>
    <div class="wiz-test-card">
      <label class="wiz-input-label" for="wizTestEmail">Send test to</label>
      <input class="wiz-input" id="wizTestEmail" placeholder="you@yourbusiness.com" type="email" autocomplete="email">
      <button type="button" class="wiz-btn wiz-btn-secondary" id="wizTestSend">Send a test to me</button>
      <div class="wiz-test-status" id="wizTestStatus"></div>
    </div>
    <p class="wiz-helper-p" style="margin-top:24px;">When you're happy, click <strong>Save changes</strong> below to make these updates live for new leads.</p>`;
}

function attachWizStep4Handlers() {
  const btn    = document.getElementById("wizTestSend");
  const status = document.getElementById("wizTestStatus");
  if (!btn) return;
  btn.onclick = async () => {
    const to = (document.getElementById("wizTestEmail").value || "").trim();
    if (!to) {
      status.textContent = "Type your email above first.";
      status.className   = "wiz-test-status err";
      return;
    }
    btn.disabled = true; btn.textContent = "Sending…";
    status.textContent = ""; status.className = "wiz-test-status";
    try {
      await persistWizardEdits();
      const res = await fetch(`/me/sequences/${encodeURIComponent(WIZARD_STATE.sequenceId)}/test`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        status.textContent = "✅ Test sent! Check your inbox.";
        status.className   = "wiz-test-status ok";
      } else if (body.error === "no_send_email_step") {
        status.textContent = "This automation has no email parts to test.";
        status.className   = "wiz-test-status err";
      } else {
        status.textContent = "Couldn't send the test. Try again in a moment.";
        status.className   = "wiz-test-status err";
      }
    } catch (_) {
      status.textContent = "Couldn't send the test. Try again in a moment.";
      status.className   = "wiz-test-status err";
    } finally {
      btn.disabled = false; btn.textContent = "Send a test to me";
    }
  };
}

function attachWizardBodyHandlers(n) {
  if (n === 2) attachWizStep2Handlers();
  if (n === 3) attachWizStep3Handlers();
  if (n === 4) attachWizStep4Handlers();
}

// ── Save ──
async function persistWizardEdits() {
  const def = JSON.parse(JSON.stringify(WIZARD_STATE.def));
  (def.steps || []).forEach((s, i) => {
    if (s.type === "send_email" && WIZARD_STATE.emailEdits[i]) {
      s.subject = toInternal(WIZARD_STATE.emailEdits[i].subject);
      s.body    = toInternal(WIZARD_STATE.emailEdits[i].body);
    } else if (s.type === "send_sms" && WIZARD_STATE.smsEdits[i]) {
      s.body = toInternal(WIZARD_STATE.smsEdits[i].body);
    } else if (s.type === "owner_alert" && WIZARD_STATE.ownerEdits[i]) {
      s.body = toInternal(WIZARD_STATE.ownerEdits[i].body);
    } else if (s.type === "wait" && WIZARD_STATE.waitEdits[i]) {
      s.seconds = WIZARD_STATE.waitEdits[i].seconds;
    } else if (s.type === "wait_until_appointment" && WIZARD_STATE.waitEdits[i]) {
      s.offset_seconds_before = WIZARD_STATE.waitEdits[i].offset;
    }
  });
  const res = await fetch(`/me/sequences/${encodeURIComponent(def.id)}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(def),
  });
  if (!res.ok) throw new Error("save_failed");
  WIZARD_STATE.def = def;
  return def;
}

async function saveWizardChanges() {
  const next = document.getElementById("wizNextBtn");
  next.disabled = true;
  next.textContent = "Saving…";
  try {
    await persistWizardEdits();
    // Invalidate so the Campaigns list re-fetches sequences on next visit.
    if (typeof window.invalidateSection === "function") window.invalidateSection("campaigns");
    const toast = document.getElementById("wizToast");
    toast.textContent = "Saved! Your customers will get the updated version starting now.";
    toast.hidden = false;
    setTimeout(() => { window.location.hash = "campaigns"; }, 1800);
  } catch (_) {
    next.textContent  = "Couldn't save — try again";
    next.style.background = "#b91c1c";
    setTimeout(() => {
      next.disabled = false;
      next.textContent = "Save changes";
      next.style.background = "";
    }, 2400);
  }
}

// ─── Module init ────────────────────────────────────────────────────────────

let _initialized = false;

export function init() {
  if (_initialized) return;
  _initialized = true;
  initCampaignsSubtabs();
}

// ─── Expose globals the inline router code expects ──────────────────────────

window.loadAutomationWizard = loadAutomationWizard;
window.loadSequenceEdit     = loadAutomationWizard;  // back-compat alias
window.loadSequences        = loadSequences;

// Expose to a namespace for debugging.
window.__campaignsRoute = {
  loadAutomationWizard,
  loadSequences,
  init,
  WIZARD_STATE: () => WIZARD_STATE,
};
