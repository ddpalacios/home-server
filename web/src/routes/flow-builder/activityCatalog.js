// The catalog of activity types the user can drop onto the canvas.
// Three kinds:
//   - trigger : entry points keyed off a real lead lifecycle event
//   - action  : building blocks (wait, send text, send email)
//   - logic   : branching (if/then) — wired in a later milestone
//
// `oneOfAKind: true` means the canvas refuses a duplicate of that
// activity (useful for triggers — you don't have two "First hello"s).
// Actions can repeat freely.
export const ACTIVITY_CATALOG = [
  // ── Triggers ─────────────────────────────────────────────────────────
  // Every flow starts with a single trigger card — the "input" — so
  // the user can see at a glance what kicks the flow off and how each
  // downstream action connects back to it. The other triggers below
  // are lifecycle-specific entry points the user can pick INSTEAD of
  // (or in addition to) the generic Input.
  {
    id: "input", kind: "trigger", oneOfAKind: true,
    icon: "🟢", title: "Input",
    cardSub: "Where this flow starts",
    description: "The starting point of the flow. Connect every other step back to this card. Auto-added when you build a flow from a form, ad, or other lead source.",
    trigger: "WHEN A LEAD ENTERS THIS FLOW",
    defaultMode: "noop",
    defaultSubject: "",
    defaultBody: "",
    isInput: true,
  },
  {
    id: "first_contact", kind: "trigger", oneOfAKind: true,
    icon: "📥", title: "First hello",
    cardSub: "Greet new leads",
    description: "Greets new leads and pings you to follow up.",
    trigger: "WHEN A NEW LEAD COMES IN",
    defaultMode: "email",
    defaultSubject: "We got your message, {first_name}",
    defaultBody: "Hey {first_name} — got your note about {service_type}. I'll reach back out personally in a few minutes.\n\n— {owner_name}",
    canBeSms: true,
  },
  {
    id: "estimate_onboarding", kind: "trigger", oneOfAKind: true,
    icon: "📋", title: "Estimate booked",
    cardSub: "Confirm the visit",
    description: "Confirms the estimate and reminds before the visit.",
    trigger: "WHEN AN ESTIMATE IS SCHEDULED",
    defaultMode: "email",
    defaultSubject: "Your estimate is booked, {first_name}",
    defaultBody: "Hi {first_name}, just confirming we're on for {appointment_at}. I'll come take a look at {service_type} and walk you through pricing.\n\nIf anything changes, reply here.\n\n— {owner_name}",
    canBeSms: true,
  },
  {
    id: "quote_followup", kind: "trigger", oneOfAKind: true,
    icon: "💬", title: "Quote nudge",
    cardSub: "Chase the reply",
    description: "Chases a quote with a couple of friendly nudges.",
    trigger: "AFTER YOU SEND A QUOTE",
    defaultMode: "email",
    defaultSubject: "Any thoughts on the quote?",
    defaultBody: "Hey {first_name}, just checking in on the quote I sent over. Happy to answer any questions or tweak it if you'd like.\n\n— {owner_name}",
    canBeSms: true,
  },
  {
    id: "job_onboarding", kind: "trigger", oneOfAKind: true,
    icon: "🛠️", title: "Job booked",
    cardSub: "Confirm the booking",
    description: "Confirms the booking and sends prep reminders.",
    trigger: "WHEN THE JOB IS BOOKED",
    defaultMode: "email",
    defaultSubject: "You're booked for {appointment_at}",
    defaultBody: "Thanks {first_name}! We'll see you on {appointment_at}. I'll send a reminder the day before.\n\n— {owner_name}",
    canBeSms: true,
  },
  {
    id: "during_job", kind: "trigger", oneOfAKind: true,
    icon: "📷", title: "During the job",
    cardSub: "Notes and photos",
    description: "Pings you to take notes and snap photos.",
    trigger: "WHILE WORK IS HAPPENING",
    defaultMode: "sms",
    defaultBody: "Quick reminder: snap a few photos and jot a note about what you're doing. Future-you will thank present-you.",
  },
  {
    id: "after_job", kind: "trigger", oneOfAKind: true,
    icon: "⭐", title: "Job done",
    cardSub: "Ask for a review",
    description: "Says thanks and asks for a review.",
    trigger: "WHEN THE JOB IS DONE",
    defaultMode: "email",
    defaultSubject: "Thanks for the work, {first_name}",
    defaultBody: "Really enjoyed working on this one. If you have a minute, a quick review means the world: {review_link}\n\n— {owner_name}",
    canBeSms: true,
  },
  {
    id: "win_back", kind: "trigger", oneOfAKind: true,
    icon: "🔄", title: "Win back",
    cardSub: "Cold leads",
    description: "Reaches back to leads who went cold.",
    trigger: "WHEN A LEAD HAS GONE COLD",
    defaultMode: "email",
    defaultSubject: "Still thinking about {service_type}?",
    defaultBody: "Hey {first_name}, just circling back. If now's a good time to talk about {service_type}, I'm here. If not, no worries.\n\n— {owner_name}",
    canBeSms: true,
  },

  // ── Actions ──────────────────────────────────────────────────────────
  {
    id: "wait", kind: "action",
    icon: "⏱️", title: "Wait",
    cardSub: "Pause",
    description: "Pause for a bit before the next step.",
    trigger: "WAIT",
    defaultMode: "wait",
    defaultDurationDays: 2,
  },
  {
    id: "send_text", kind: "action",
    icon: "💬", title: "Text",
    cardSub: "Send a quick note",
    description: "Message your customer with a quick note.",
    trigger: "SEND A TEXT",
    defaultMode: "sms",
    defaultBody: "Hey {first_name}, quick note from {owner_name}.",
  },
  {
    id: "send_email", kind: "action",
    icon: "📧", title: "Email",
    cardSub: "Send a longer note",
    description: "Email your customer a longer message.",
    trigger: "SEND AN EMAIL",
    defaultMode: "email",
    defaultSubject: "Quick update for you",
    defaultBody: "Hi {first_name},\n\n— {owner_name}",
    canBeSms: true,
  },

  // ── Reply Widget ─────────────────────────────────────────────────────
  // The owner-controlled escalation step: ping me a few times, then
  // either let AI take over (using the global "AI replies" mode in
  // the top-right) OR send a custom message I wrote with merge tags.
  // Cadence defaults come from the account's policy and can be
  // overridden per step in the drawer.
  {
    id: "reply", kind: "action",
    icon: "🔁", title: "Reply",
    cardSub: "Nudge me, then reply",
    description: "Nudges you. If you don't reply, AI or your message goes out.",
    trigger: "REPLY",
    defaultMode: "reply",
    // Cadence is always driven by the global reminder_cadence in the
    // account's AI policy — no per-step override. See ReplyWidgetEditor.
    defaultFallback: "ai",   // 'ai' or 'custom'
    defaultBody: "Hey {first_name}, sorry I missed you — just following up about {service_type}. I'll be in touch shortly.\n— {owner_name}",
  },

  // ── Logic ────────────────────────────────────────────────────────────
  {
    id: "branch", kind: "logic",
    icon: "🔀", title: "If / then",
    cardSub: "Pick a path",
    description: "Take different paths based on what the customer does.",
    trigger: "IF / THEN",
    defaultMode: "branch",
    defaultConditionId: "replied_yes",
  },
];

export const ACTIVITY_BY_ID =
  Object.fromEntries(ACTIVITY_CATALOG.map(a => [a.id, a]));

// Branch conditions — each defines the question shown on the node and
// the labels for the Yes / No paths. Plain language, second-grade
// readable. Add to this list to expose new questions in the picker.
export const BRANCH_CONDITIONS = [
  {
    id: "replied_yes",
    question: "Did they reply yes?",
    yesLabel: "They said yes",
    noLabel:  "They said no",
  },
  {
    id: "booked_job",
    question: "Did they book the job?",
    yesLabel: "They booked",
    noLabel:  "They didn't book",
  },
  {
    id: "left_review",
    question: "Did they leave a review?",
    yesLabel: "Yes — review left",
    noLabel:  "Not yet",
  },
  {
    id: "opened_email",
    question: "Did they open the last email?",
    yesLabel: "Yes — they opened it",
    noLabel:  "No — they didn't",
  },
];

export const BRANCH_CONDITION_BY_ID =
  Object.fromEntries(BRANCH_CONDITIONS.map(c => [c.id, c]));
