// web/src/routes/engagement.js
//
// Engagement page: customer-journey view of automations.
// Awareness / Interest / Decision / Action stages, color-coded.

const FUNNEL_STAGES = [
  {
    id: "awareness",
    number: 1,
    name: "Awareness",
    desc: "Getting noticed — attracting attention",
    bg: "#fef2f2",        // red-50
    bg2: "#fee2e2",       // red-100
    accent: "#dc2626",    // red-600
    accentDark: "#991b1b" // red-800
  },
  {
    id: "interest",
    number: 2,
    name: "Interest",
    desc: "Warming up — they know you exist",
    bg: "#fffbeb",        // amber-50
    bg2: "#fef3c7",       // amber-100
    accent: "#d97706",    // amber-600
    accentDark: "#92400e" // amber-800
  },
  {
    id: "decision",
    number: 3,
    name: "Decision",
    desc: "Evaluating — should they hire you?",
    bg: "#f0fdf4",        // green-50
    bg2: "#dcfce7",       // green-100
    accent: "#16a34a",    // green-600
    accentDark: "#166534" // green-800
  },
  {
    id: "action",
    number: 4,
    name: "Action",
    desc: "Converting and keeping — they hired you",
    bg: "#eff6ff",        // blue-50
    bg2: "#dbeafe",       // blue-100
    accent: "#2563eb",    // blue-600
    accentDark: "#1e40af" // blue-800
  },
];

const FUNNEL_MAP = {
  "first_contact":       "interest",
  "win_back":            "interest",
  "quote_followup":      "decision",
  "estimate_onboarding": "decision",
  "job_onboarding":      "action",
  "during_job":          "action",
  "after_job":           "action",
};

const AUTOMATION_DESCRIPTIONS = {
  "first_contact":       "Greets every new lead and pings you to follow up.",
  "win_back":            "Reaches back to leads who went cold.",
  "quote_followup":      "Chases quotes with friendly nudges over two weeks.",
  "estimate_onboarding": "Confirms estimates and reminds before the visit.",
  "job_onboarding":      "Confirms booking and sends prep reminders.",
  "during_job":          "Reminds you to log notes and capture photos.",
  "after_job":           "Says thanks and asks for a review.",
};

const AUTOMATION_ICONS = {
  "first_contact":       "📩",
  "win_back":            "🔄",
  "quote_followup":      "💬",
  "estimate_onboarding": "📋",
  "job_onboarding":      "🛠️",
  "during_job":          "📷",
  "after_job":           "⭐",
};

const STAGE_HELP = {
  awareness: "Awareness is the first time someone hears about you — through Google, social media, a friend, or an ad. Most small service businesses get awareness from word-of-mouth and reviews, not paid marketing. We don't help with this stage.",
  interest:  "Interest is when someone has reached out — they called, filled out your widget, or replied to something. They know you exist. Now you need to keep their attention warm so they don't forget about you.",
  decision:  "Decision is when they're actively choosing — comparing prices, weighing options, asking questions. The right follow-up here can make the difference between getting hired and being forgotten.",
  action:    "Action is once they've committed — they're booking, they're showing up, they're paying. The work here isn't selling, it's keeping things smooth and turning them into a repeat customer.",
};

const ENG_NUDGE_KEY = "dashboard.eng_nudge_dismissed";

let _automations = [];

async function loadEngagementSection() {
  // Pull the list of automations from the existing /me/sequences endpoint.
  try {
    const res = await fetch("/me/sequences", { credentials: "same-origin" });
    if (res.ok) {
      const body = await res.json();
      _automations = body.sequences || [];
    } else {
      _automations = [];
    }
  } catch (_) { _automations = []; }
  render();
  maybeShowNudge();
}

function render() {
  const root = document.getElementById("engFunnel");
  if (!root) return;
  root.innerHTML = FUNNEL_STAGES.map(stage => {
    const automationsHere = _automations.filter(a => FUNNEL_MAP[a.id] === stage.id);
    return renderStage(stage, automationsHere);
  }).join("");
  attachHandlers();
}

function renderStage(stage, automations) {
  const cards = automations.length === 0 && stage.id === "awareness"
    ? renderEmptyAwarenessCard()
    : automations.map(a => renderAutomationCard(a, stage)).join("");

  return `
    <div class="eng-stage" style="background: linear-gradient(180deg, ${stage.bg} 0%, ${stage.bg2} 100%); border: 1px solid ${stage.bg2};">
      <div class="eng-stage-head">
        <div class="eng-stage-num" style="background:${stage.accent};">${stage.number}</div>
        <div class="eng-stage-meta">
          <div class="eng-stage-name" style="color:${stage.accentDark};">
            ${stage.number}. ${stage.name}
            <button type="button" class="eng-stage-help" data-stage="${stage.id}" aria-label="What is ${stage.name}?">?</button>
          </div>
          <div class="eng-stage-desc">${stage.desc}</div>
        </div>
      </div>
      <div class="eng-stage-cards">${cards}</div>
    </div>
  `;
}

function renderAutomationCard(a, stage) {
  const desc = AUTOMATION_DESCRIPTIONS[a.id] || "";
  const icon = AUTOMATION_ICONS[a.id] || "⚙️";
  const status = a.active ? "Running" : "Paused";
  const statusClass = a.active ? "eng-card-status-running" : "eng-card-status-paused";
  return `
    <a class="eng-card" href="#sequence-edit-${a.id}"
       style="border-color:${stage.bg2};"
       data-stage-accent="${stage.accent}">
      <div class="eng-card-head">
        <span class="eng-card-icon">${icon}</span>
        <span class="eng-card-name">${a.name || a.id}</span>
      </div>
      <div class="eng-card-desc">${desc}</div>
      <div class="eng-card-status ${statusClass}">● ${status}</div>
    </a>
  `;
}

function renderEmptyAwarenessCard() {
  return `
    <div class="eng-empty-card">
      <div class="eng-empty-h">We don't handle this part.</div>
      <div class="eng-empty-text">
        Awareness usually comes from ads, social media, Google reviews, or
        word-of-mouth. We pick up the moment someone calls you or fills out
        your widget.
      </div>
    </div>
  `;
}

function attachHandlers() {
  document.querySelectorAll(".eng-stage-help").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const stageId = btn.dataset.stage;
      showStageHelp(stageId, btn);
    });
  });

  // Hover border accent on cards
  document.querySelectorAll(".eng-card").forEach(card => {
    const accent = card.dataset.stageAccent;
    const origBorder = card.style.borderColor;
    card.addEventListener("mouseenter", () => {
      if (accent) card.style.borderColor = accent;
    });
    card.addEventListener("mouseleave", () => {
      card.style.borderColor = origBorder;
    });
  });

  // Page-level help button
  const helpBtn = document.getElementById("engHelpBtn");
  if (helpBtn) {
    helpBtn.addEventListener("click", () => {
      showPageHelp(helpBtn);
    });
  }
}

function showStageHelp(stageId, anchor) {
  const text = STAGE_HELP[stageId] || "";
  showPopover(anchor, text);
}

function showPageHelp(anchor) {
  showPopover(anchor, "This is the journey every customer takes — from never having heard of you, to becoming a paying client. We've set up automations for the parts we handle. You can change the words, look around, or just feel good about the work happening on its own.");
}

function showPopover(anchor, text) {
  // Remove any existing popover
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
  pop.style.left = Math.max(12, r.left - 100) + "px";
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

function maybeShowNudge() {
  if (localStorage.getItem(ENG_NUDGE_KEY) === "true") return;
  const nudge = document.createElement("div");
  nudge.className = "eng-nudge";
  nudge.innerHTML = `
    <div class="eng-nudge-emoji">✨</div>
    <div class="eng-nudge-content">
      <div class="eng-nudge-h">This is your customer's journey.</div>
      <div class="eng-nudge-text">See where your AI is helping — and where it isn't. Click any automation to look at it or change the words.</div>
      <button class="eng-nudge-dismiss" id="engNudgeDismiss">Got it, dismiss</button>
    </div>
  `;
  const root = document.getElementById("engFunnel");
  if (root && root.parentNode) {
    root.parentNode.insertBefore(nudge, root);
  }
  const dismissBtn = document.getElementById("engNudgeDismiss");
  if (dismissBtn) {
    dismissBtn.addEventListener("click", () => {
      localStorage.setItem(ENG_NUDGE_KEY, "true");
      nudge.remove();
    });
  }
}

export function init() {}

window.loadEngagementSection = loadEngagementSection;
