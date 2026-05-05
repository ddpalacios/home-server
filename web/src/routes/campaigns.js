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

// Per-template playbook content shown at the top of Step 1 ("Looking
// at it"). Plain language, 2nd-grade reading level. Each entry has:
//   when     – one short sentence describing exactly when it fires
//   triggers – list of {ico, h, sub} cards: places leads come from
//   why      – the case for using this template
//   bestFor  – who should turn it on
//   skipIf   – be honest about who shouldn't
//   integrate (optional) – a tiny "how do I connect…?" hint card
const AUTOMATION_PLAYBOOKS = {
  "first_contact": {
    when: "It runs the second a new lead shows up — before they wonder if you saw them.",
    triggers: [
      { ico: "📝", h: "Someone fills out your form",
        sub: "Like a 'Get a quote' form on your website." },
      { ico: "💬", h: "Someone DMs your Instagram",
        sub: "If your IG is connected to JustGotALead." },
      { ico: "📞", h: "A missed call comes in",
        sub: "We turn the missed call into a lead." },
      { ico: "✋", h: "You add a lead by hand",
        sub: "When you tap 'New lead' yourself." },
    ],
    why: "Most people who reach out cool off if they don't hear back fast. This sends a quick 'we got it!' so they feel heard, then pings you so you can call back before they go shop someone else.",
    bestFor: "Turn this on if leads come in faster than you can answer, or you want to look super responsive without lifting a finger.",
    skipIf: "Skip it if you only get a couple of leads a week and like to write each first message yourself.",
    integrate: {
      h: "Connect your form",
      sub: "Most users paste a link to their form and we listen for new submissions automatically. You can also drop our small snippet onto your site so the form sends leads straight into JustGotALead.",
      cta: "Show me how to hook it up →",
      cta_id: "wiz-pb-form-help",
    },
  },
  "job_onboarding": {
    when: "It runs when you book a job with a customer.",
    triggers: [
      { ico: "📅", h: "You move a lead to 'Booked'",
        sub: "Either by hand or after a 'Yes' reply." },
      { ico: "🗓️", h: "A calendar invite is accepted",
        sub: "If your calendar is connected." },
    ],
    why: "Customers worry between 'yes' and the day of the visit. A confirmation right away and a friendly reminder the day before keeps them excited and cuts no-shows.",
    bestFor: "Turn this on if you ever have customers no-show or call to ask 'are we still on?' the day before.",
    skipIf: "Skip it if every booking is same-day or your customers already get reminders from another tool.",
  },
  "estimate_onboarding": {
    when: "It runs when you book an estimate / site visit.",
    triggers: [
      { ico: "📅", h: "You schedule the estimate",
        sub: "From a lead's profile or your calendar." },
    ],
    why: "Estimates fall through when the customer forgets you're coming. One confirmation and one day-before reminder fixes most of that.",
    bestFor: "Turn this on if you do site visits or in-person estimates and want fewer wasted trips.",
    skipIf: "Skip it if your estimates happen over the phone with no scheduled visit.",
  },
  "quote_followup": {
    when: "It runs after you send a quote and the customer hasn't replied.",
    triggers: [
      { ico: "💲", h: "You mark a lead as 'Quoted'",
        sub: "Either by hand or after sending a quote." },
    ],
    why: "Most customers forget to reply, not because they said no. Two friendly nudges over two weeks brings back about one in three deals you'd have lost.",
    bestFor: "Turn this on if you send written quotes and ever wonder 'did they ever get back to me?'",
    skipIf: "Skip it if you handle every follow-up by phone yourself and don't want auto-texts going out.",
  },
  "during_job": {
    when: "It runs while a job is happening.",
    triggers: [
      { ico: "🏗️", h: "A lead's stage is 'In progress'",
        sub: "Set this when work actually starts." },
    ],
    why: "Notes and photos taken during the job make answering the customer later (or asking for a review) so much easier. This nudges you so you don't forget while you're busy.",
    bestFor: "Turn this on if you'd love better notes and pictures but never remember in the moment.",
    skipIf: "Skip it if you already document jobs in another app or don't need this kind of reminder.",
  },
  "after_job": {
    when: "It runs the moment a job is marked done.",
    triggers: [
      { ico: "✅", h: "You mark a job as 'Done'",
        sub: "From a lead's profile." },
    ],
    why: "A thank-you within a day, plus a review request when the customer's still happy, is the best time to ask. Six months later we check back in to see if they need anything else.",
    bestFor: "Turn this on if you want more reviews on Google or repeat business — it's basically free reviews.",
    skipIf: "Skip it if you'd rather ask for reviews face-to-face or already use a review tool.",
  },
  "win_back": {
    when: "It runs about a month after a lead has gone cold.",
    triggers: [
      { ico: "❄️", h: "A lead goes 'Lost' or stops replying",
        sub: "We wait, then check back in once." },
    ],
    why: "About one in five cold leads will reply if you send a soft check-in a few weeks later. Cheap money — they already know who you are.",
    bestFor: "Turn this on if you have leads that ghost you and you'd rather not chase them by hand.",
    skipIf: "Skip it if the cold leads on your list aren't really potential customers anymore.",
  },
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
    // Render the customer-journey timeline (top → bottom). The order is
    // the lead's actual path through the business, so the structure
    // teaches itself: New lead → Estimate → Quote → Booked → Working →
    // Done → Cold. Each station has a clear ON/OFF toggle that flips
    // the automation in one click without entering the wizard.
    _renderSequencesTimeline(list, seqs);
  } catch (_) {
    list.innerHTML = `
      <div class="seq-empty-card">
        <div class="seq-empty-icon">⚠️</div>
        <p class="seq-empty-title">Couldn't load automations</p>
        <p class="seq-empty-sub">Check your connection and try refreshing.</p>
      </div>`;
  }
}

// Customer-journey order: the lead walks through these stations
// top-to-bottom. When a sequence isn't returned by the server (newly
// added template not yet exposed) it's skipped silently.
const JOURNEY_ORDER = [
  { id: "first_contact",       trigger: "When a new lead comes in" },
  { id: "estimate_onboarding", trigger: "When you book an estimate" },
  { id: "quote_followup",      trigger: "After you send a quote"     },
  { id: "job_onboarding",      trigger: "When the job is booked"     },
  { id: "during_job",          trigger: "While the work is happening" },
  { id: "after_job",           trigger: "When the job is done"        },
  { id: "win_back",             trigger: "When a lead has gone cold"   },
];

const FIRST_RUN_DISMISS_KEY = "automations.firstRunDismissed";
const FIRST_RUN_RECOMMENDED = ["first_contact", "after_job"];

// "After you save / turn on X, you might want Y next." Pure
// suggestion — drives the wizard step-4 link only.
const NEXT_UP_BY_SEQUENCE = {
  first_contact:       "after_job",
  estimate_onboarding: "quote_followup",
  quote_followup:      "job_onboarding",
  job_onboarding:      "during_job",
  during_job:          "after_job",
  after_job:           "win_back",
  win_back:             "first_contact",
};

function _renderSequencesTimeline(root, seqs) {
  const byId = Object.fromEntries(seqs.map(s => [s.id, s]));
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
    const desc = SEQ_DESCRIPTIONS[s.id]
      || (s.step_count + " steps in this automation.");
    const ico = AUTOMATION_ICONS[s.id] || "📩";
    const isOn = !!s.active;
    return `
      <div class="seq-tl-row${isOn ? " is-on" : ""}" data-station="${_escHtml(s.id)}">
        <div class="seq-tl-rail">
          <div class="seq-tl-bullet">${i + 1}</div>
          ${i < stations.length - 1 ? `<div class="seq-tl-line"></div>` : ""}
        </div>
        <div class="seq-tl-card">
          <div class="seq-tl-trigger">${_escHtml(j.trigger)}</div>
          <div class="seq-tl-card-body">
            <span class="seq-tl-ico" aria-hidden="true">${ico}</span>
            <div class="seq-tl-card-text">
              <p class="seq-tl-card-name">${_escHtml(s.name)}</p>
              <p class="seq-tl-card-desc">${_escHtml(desc)}</p>
            </div>
            <label class="seq-tl-toggle" title="${isOn ? "Turn off" : "Turn on"}">
              <input type="checkbox" data-seq-toggle="${_escHtml(s.id)}"
                     ${isOn ? "checked" : ""}>
              <span class="seq-tl-toggle-track"></span>
            </label>
          </div>
          <div class="seq-tl-card-foot">
            <span class="seq-tl-state">${isOn ? "On" : "Off"}</span>
            <button type="button" class="seq-tl-edit"
                    data-seq-edit="${_escHtml(s.id)}">Edit the words →</button>
          </div>
        </div>
      </div>`;
  }).join("");

  root.innerHTML = `
    <div class="seq-timeline">
      ${headerHtml}
      ${stationsHtml}
    </div>`;

  // Edit → wizard.
  root.querySelectorAll("[data-seq-edit]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      window.location.hash = "sequence-edit-" + btn.dataset.seqEdit;
    });
  });
  // Toggle → POST /toggle, optimistic flip + revert on failure.
  root.querySelectorAll("[data-seq-toggle]").forEach(input => {
    input.addEventListener("change", () => _toggleSequence(input));
  });
  // Quick setup pill (visible only when zero are on).
  const quick = root.querySelector("#seqTlQuickStart");
  if (quick) quick.addEventListener("click", _showFirstRunOverlay);

  // First-run overlay: only show on a true blank slate AND only once.
  // "Blank slate" = zero automations on. Dismiss flag in localStorage.
  let dismissed = false;
  try { dismissed = localStorage.getItem(FIRST_RUN_DISMISS_KEY) === "1"; }
  catch (_) {}
  if (onCount === 0 && !dismissed) {
    setTimeout(_showFirstRunOverlay, 250);
  }
}

async function _toggleSequence(input) {
  const id = input.dataset.seqToggle;
  const want = input.checked;
  const row = input.closest(".seq-tl-row");
  const stateLabel = row && row.querySelector(".seq-tl-state");
  // Optimistic UI.
  if (row) row.classList.toggle("is-on", want);
  if (stateLabel) stateLabel.textContent = want ? "On" : "Off";
  try {
    const res = await fetch(
      `/me/sequences/${encodeURIComponent(id)}/toggle`,
      { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: want }) });
    if (!res.ok) throw new Error("toggle_failed");
    _updateOnCount();
  } catch (_) {
    input.checked = !want;
    if (row) row.classList.toggle("is-on", !want);
    if (stateLabel) stateLabel.textContent = !want ? "On" : "Off";
  }
}

function _updateOnCount() {
  const root = document.getElementById("sequencesList");
  if (!root) return;
  const total = root.querySelectorAll(".seq-tl-row").length;
  const on    = root.querySelectorAll(".seq-tl-row.is-on").length;
  const el = document.getElementById("seqTlCount");
  if (el) el.innerHTML = `<strong>${on}</strong> of ${total} on`;
  // Show / hide the Quick setup pill on the fly.
  const head = root.querySelector(".seq-tl-head-meta");
  let quick = root.querySelector("#seqTlQuickStart");
  if (on === 0 && !quick && head) {
    quick = document.createElement("button");
    quick.type = "button";
    quick.className = "seq-tl-quick";
    quick.id = "seqTlQuickStart";
    quick.textContent = "Quick setup →";
    quick.addEventListener("click", _showFirstRunOverlay);
    head.appendChild(quick);
  } else if (on > 0 && quick) {
    quick.remove();
  }
}

function _showFirstRunOverlay() {
  // No-op if it's already up.
  if (document.getElementById("seqFirstRunBg")) return;
  const root = document.getElementById("sequencesList");
  const seqs = root ? Array.from(root.querySelectorAll(".seq-tl-row"))
                          .map(r => r.dataset.station) : [];
  const recommended = FIRST_RUN_RECOMMENDED.filter(id => seqs.includes(id));
  if (!recommended.length) return; // shouldn't happen, but guard.

  const cardsHtml = recommended.map(id => {
    const ico = AUTOMATION_ICONS[id] || "📩";
    const headline = AUTOMATION_HEADLINES[id] || "";
    const summary  = AUTOMATION_SUMMARIES[id] || "";
    return `
      <label class="seq-fr-pick">
        <input type="checkbox" data-seq-fr="${_escHtml(id)}" checked>
        <div class="seq-fr-pick-body">
          <div class="seq-fr-pick-h">
            <span class="seq-fr-pick-ico" aria-hidden="true">${ico}</span>
            <span>${_escHtml(headline)}</span>
            <span class="seq-fr-pick-rec">Recommended</span>
          </div>
          <p class="seq-fr-pick-sub">${_escHtml(summary)}</p>
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
      <div class="seq-fr-body">
        ${cardsHtml}
      </div>
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
    close();
    loadSequences();
  });
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
  // Plain-language playbook (when it runs / why use it / how to plug
  // into your existing workflow). Rendered at the top of Step 1 so the
  // user sees the "why" before the "how" of the flow diagram below.
  const pb = AUTOMATION_PLAYBOOKS[def.id];

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

  // Playbook (plain-language "what is this and should I use it" card).
  let playbookHtml = "";
  if (pb) {
    const triggersHtml = (pb.triggers || []).map(t => `
      <div class="wiz-pb-trig">
        <span class="wiz-pb-trig-ico" aria-hidden="true">${escHtmlWiz(t.ico)}</span>
        <div class="wiz-pb-trig-body">
          <div class="wiz-pb-trig-h">${escHtmlWiz(t.h)}</div>
          <div class="wiz-pb-trig-sub">${escHtmlWiz(t.sub)}</div>
        </div>
      </div>`).join("");
    const integrateHtml = pb.integrate ? `
      <div class="wiz-pb-integrate">
        <div class="wiz-pb-integrate-ico" aria-hidden="true">🔌</div>
        <div class="wiz-pb-integrate-body">
          <div class="wiz-pb-integrate-h">${escHtmlWiz(pb.integrate.h)}</div>
          <div class="wiz-pb-integrate-sub">${escHtmlWiz(pb.integrate.sub)}</div>
          <button type="button" class="wiz-pb-integrate-cta"
                  id="${escAttrWiz(pb.integrate.cta_id || "wiz-pb-help")}">
            ${escHtmlWiz(pb.integrate.cta)}
          </button>
        </div>
      </div>` : "";
    playbookHtml = `
      <div class="wiz-pb">
        <div class="wiz-pb-when">
          <span class="wiz-pb-when-ico" aria-hidden="true">⏱️</span>
          <span>${escHtmlWiz(pb.when)}</span>
        </div>
        <div class="wiz-pb-section-h">It kicks off when…</div>
        <div class="wiz-pb-trigs">${triggersHtml}</div>
        <div class="wiz-pb-why">
          <div class="wiz-pb-why-h">Why this helps</div>
          <p>${escHtmlWiz(pb.why)}</p>
        </div>
        <div class="wiz-pb-fit">
          <div class="wiz-pb-fit-row is-good">
            <span class="wiz-pb-fit-ico" aria-hidden="true">✅</span>
            <div><div class="wiz-pb-fit-h">Good fit if…</div>
              <p>${escHtmlWiz(pb.bestFor)}</p></div>
          </div>
          <div class="wiz-pb-fit-row is-skip">
            <span class="wiz-pb-fit-ico" aria-hidden="true">⏭️</span>
            <div><div class="wiz-pb-fit-h">You can skip it if…</div>
              <p>${escHtmlWiz(pb.skipIf)}</p></div>
          </div>
        </div>
        ${integrateHtml}
      </div>
      <div class="wiz-pb-divider">
        <span class="wiz-pb-divider-l">Here's what happens, step by step</span>
      </div>
    `;
  }

  return `${playbookHtml}<div class="wiz-flow">${html}</div>`;
}

// Plain-language modal explaining how to wire up a contact form so the
// First-contact automation captures every submission. Triggered by the
// "Show me how to hook it up →" CTA inside the playbook card.
function _wizShowFormHookHelp() {
  const html = `
    <div class="wiz-help-bg" id="wizHelpBg">
      <div class="wiz-help-card" role="dialog" aria-modal="true">
        <div class="wiz-help-h">
          <span>🔌 Hook your form into JustGotALead</span>
          <button type="button" class="wiz-help-x" aria-label="Close">×</button>
        </div>
        <div class="wiz-help-body">
          <p class="wiz-help-lead">Pick the way you already collect leads. We'll show you what to do.</p>
          <details open class="wiz-help-step">
            <summary>📝 I already have a form on my website</summary>
            <ol>
              <li>Open your form's settings (Wix, Squarespace, WordPress, etc.).</li>
              <li>Look for "<b>Send submissions to</b>" or "<b>Webhook</b>" or "<b>Email notifications</b>".</li>
              <li>Paste this address: <code class="wiz-help-code" data-wiz-copy>https://your-account.justgotalead.com/lead-in</code></li>
              <li>Save. Send yourself a test submission and watch a new lead pop into your Leads tab.</li>
            </ol>
          </details>
          <details class="wiz-help-step">
            <summary>📨 I'd rather forward emails</summary>
            <ol>
              <li>Set your form to email leads to <code class="wiz-help-code" data-wiz-copy>leads@your-account.justgotalead.com</code>.</li>
              <li>Most form builders let you add this in 2 clicks.</li>
              <li>We'll parse the email and create a new lead automatically.</li>
            </ol>
          </details>
          <details class="wiz-help-step">
            <summary>💬 My leads come from Instagram DMs</summary>
            <p>Connect your IG account on the <b>Instagram</b> page. Every new DM becomes a lead and triggers this automation.</p>
          </details>
          <details class="wiz-help-step">
            <summary>📞 My leads come from missed calls</summary>
            <p>Set up forwarding on the <b>Phone</b> page. Missed calls turn into leads and fire this automation.</p>
          </details>
          <details class="wiz-help-step">
            <summary>✋ I just want to add leads by hand</summary>
            <p>You're already set. Tap the <b>+ New lead</b> button in the Leads tab — this automation runs every time.</p>
          </details>
          <p class="wiz-help-foot">Not sure which one fits? Pick the first option — it works for almost any form builder.</p>
        </div>
      </div>
    </div>`;
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  const node = wrap.firstElementChild;
  document.body.appendChild(node);
  function close() {
    if (node.parentNode) node.parentNode.removeChild(node);
    document.removeEventListener("keydown", onEsc);
  }
  function onEsc(e) { if (e.key === "Escape") close(); }
  node.addEventListener("click", e => { if (e.target === node) close(); });
  node.querySelector(".wiz-help-x").addEventListener("click", close);
  document.addEventListener("keydown", onEsc);
  // Click-to-copy on the code blocks.
  node.querySelectorAll("[data-wiz-copy]").forEach(el => {
    el.style.cursor = "pointer";
    el.title = "Click to copy";
    el.addEventListener("click", () => {
      const t = el.textContent;
      try { navigator.clipboard.writeText(t); } catch (_) {}
      const orig = el.textContent;
      el.textContent = "Copied!";
      setTimeout(() => { el.textContent = orig; }, 1200);
    });
  });
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
  // "Once this is set, here's the next one most people turn on."
  // Hardcoded mapping per template; the link routes the user straight
  // into the next wizard so they keep moving through the journey.
  const def = WIZARD_STATE.def || {};
  const nextId = NEXT_UP_BY_SEQUENCE[def.id];
  const nextHeadline = nextId ? AUTOMATION_HEADLINES[nextId] : "";
  const nextIco = nextId ? (AUTOMATION_ICONS[nextId] || "📩") : "";
  const nextHtml = (nextId && nextHeadline) ? `
    <div class="wiz-next-card">
      <div class="wiz-next-row">
        <span class="wiz-next-ico" aria-hidden="true">${nextIco}</span>
        <div class="wiz-next-body">
          <div class="wiz-next-eyebrow">After you save this…</div>
          <div class="wiz-next-h">${escHtmlWiz(nextHeadline)}</div>
        </div>
        <button type="button" class="wiz-next-go" data-wiz-next="${escAttrWiz(nextId)}">
          Set it up →
        </button>
      </div>
    </div>` : "";

  return `
    <h3 class="wiz-section-h">Try it before you save</h3>
    <p class="wiz-helper-p">Send a test email to yourself. You'll get every customer-facing message in this automation, prefixed with [TEST] in the subject.</p>

    <div class="wiz-conn-card" id="wizConnCard" hidden>
      <div class="wiz-conn-row">
        <span class="wiz-conn-ico">📬</span>
        <div class="wiz-conn-body">
          <div class="wiz-conn-h" id="wizConnH">Connect a Gmail account</div>
          <div class="wiz-conn-sub" id="wizConnSub">
            We send your test (and your real campaigns) from your own Gmail.
            Connect it once and you're set.
          </div>
        </div>
        <button type="button" class="wiz-btn wiz-btn-primary" id="wizConnBtn">
          Connect Gmail
        </button>
      </div>
    </div>

    <div class="wiz-test-card">
      <label class="wiz-input-label" for="wizTestEmail">Send test to</label>
      <input class="wiz-input" id="wizTestEmail" placeholder="you@yourbusiness.com" type="email" autocomplete="email">
      <button type="button" class="wiz-btn wiz-btn-secondary" id="wizTestSend">Send a test to me</button>
      <div class="wiz-test-status" id="wizTestStatus"></div>
    </div>
    <p class="wiz-helper-p" style="margin-top:24px;">When you're happy, click <strong>Save changes</strong> below to make these updates live for new leads.</p>
    ${nextHtml}`;
}

// Probe /me/email-connections and show the Connect-Gmail card if the
// user has none. Returns the list (so other code can react too).
async function loadEmailConnectionsForWizard() {
  const card    = document.getElementById("wizConnCard");
  const headEl  = document.getElementById("wizConnH");
  const subEl   = document.getElementById("wizConnSub");
  const sendBtn = document.getElementById("wizTestSend");
  if (!card) return [];
  try {
    const r = await fetch("/me/email-connections", { credentials: "same-origin" });
    if (!r.ok) {
      card.hidden = false;
      headEl.textContent = "Connect a Gmail account";
      return [];
    }
    const d = await r.json().catch(() => ({}));
    const conns = d.connections || [];
    if (!d.ready) {
      card.hidden = false;
      headEl.textContent = "Email outreach not configured";
      subEl.textContent = "Ask the admin to set EMAIL_TOKEN_ENCRYPTION_KEY on the server.";
      const btn = document.getElementById("wizConnBtn");
      if (btn) btn.hidden = true;
      if (sendBtn) sendBtn.disabled = true;
      return [];
    }
    if (conns.length === 0) {
      card.hidden = false;
      headEl.textContent = "Connect a Gmail account";
      subEl.textContent = "We send your test (and your real campaigns) from your own Gmail. Connect it once and you're set.";
      if (sendBtn) sendBtn.disabled = true;
    } else {
      // Already connected — show a tiny confirmation row instead of hiding.
      card.hidden = false;
      card.classList.add("is-ok");
      headEl.textContent = "✓ Connected as " + (conns[0].email_address || "your Gmail");
      subEl.textContent = "Tests will send from this address. To swap accounts, disconnect from Settings.";
      const btn = document.getElementById("wizConnBtn");
      if (btn) btn.hidden = true;
      if (sendBtn) sendBtn.disabled = false;
    }
    return conns;
  } catch (_) {
    card.hidden = false;
    headEl.textContent = "Couldn't check your Gmail connection";
    subEl.textContent = "Try refreshing the page.";
    return [];
  }
}

function attachWizStep4Handlers() {
  const btn    = document.getElementById("wizTestSend");
  const status = document.getElementById("wizTestStatus");
  if (!btn) return;

  // Probe + render the Gmail connection state up top.
  loadEmailConnectionsForWizard();

  // "Connect Gmail" — opens the Google OAuth start URL in a popup.
  // When the popup closes, we re-probe; if connected, the card flips
  // to the "✓ Connected as X" state and the test-send button enables.
  const connBtn = document.getElementById("wizConnBtn");
  if (connBtn) {
    connBtn.onclick = () => {
      const w = 520, h = 640;
      const dx = (window.screen.availWidth  - w) / 2;
      const dy = (window.screen.availHeight - h) / 2;
      const popup = window.open(
        "/auth/google/connect-email",
        "gmail_connect",
        "width=" + w + ",height=" + h
        + ",left=" + Math.max(0, Math.round(dx))
        + ",top="  + Math.max(0, Math.round(dy))
        + ",resizable,scrollbars,status,toolbar=no,menubar=no");
      if (!popup) {
        // Popup blocked — fall back to a same-tab redirect.
        window.location.href = "/auth/google/connect-email";
        return;
      }
      // Re-probe every 2s until the popup closes (the OAuth callback
      // redirects to /dashboard?email_connect=ok inside the popup).
      const pollClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(pollClosed);
          loadEmailConnectionsForWizard();
        }
      }, 1000);
    };
  }

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
      } else if (body.error === "connection_not_found"
                  || body.error === "no_email_connection") {
        status.textContent = "Connect a Gmail account first (Settings → Email).";
        status.className   = "wiz-test-status err";
      } else if ((body.error || "").startsWith("token_refresh_failed")) {
        status.textContent = "Your Gmail connection expired — reconnect it (Settings → Email).";
        status.className   = "wiz-test-status err";
      } else if (body.error || body.reason) {
        // Surface the real backend reason instead of the generic toast.
        status.textContent = "Couldn't send: " + (body.error || body.reason);
        status.className   = "wiz-test-status err";
      } else {
        status.textContent = "Couldn't send the test. Try again in a moment.";
        status.className   = "wiz-test-status err";
      }
    } catch (e) {
      status.textContent = "Couldn't send the test: "
        + (e && e.message ? e.message : "network error");
      status.className   = "wiz-test-status err";
    } finally {
      btn.disabled = false; btn.textContent = "Send a test to me";
    }
  };
}

function attachWizardBodyHandlers(n) {
  if (n === 1) attachWizStep1Handlers();
  if (n === 2) attachWizStep2Handlers();
  if (n === 3) attachWizStep3Handlers();
  if (n === 4) { attachWizStep4Handlers(); _wireWizStep4NextUp(); }
}

function attachWizStep1Handlers() {
  // Wire the "Show me how to hook it up →" link inside the playbook
  // card. Only present for templates whose AUTOMATION_PLAYBOOKS entry
  // includes an `integrate` block (e.g. first_contact).
  const helpBtn = document.getElementById("wiz-pb-form-help");
  if (helpBtn) helpBtn.addEventListener("click", _wizShowFormHookHelp);
  const helpBtn2 = document.getElementById("wiz-pb-help");
  if (helpBtn2) helpBtn2.addEventListener("click", _wizShowFormHookHelp);
}

function _wireWizStep4NextUp() {
  // "Set it up →" jumps straight to the next sequence's wizard via the
  // existing hash-based router.
  document.querySelectorAll("[data-wiz-next]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.wizNext;
      if (id) window.location.hash = "sequence-edit-" + id;
    });
  });
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
