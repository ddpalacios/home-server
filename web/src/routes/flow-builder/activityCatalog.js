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
  // ── Unified Notify activity ──────────────────────────────────────────
  // Replaces the legacy send_text + send_email blocks. One step that
  // can fan out via SMS, email, or both. The drawer shows a 3-way mode
  // picker; when mode="both" the saved step runs both branches at fire
  // time (see server/sequences/steps.py:execute_notify).
  {
    id: "notify", kind: "action",
    icon: "🔔", title: "Notify Me",
    cardSub: "Ping you about the lead",
    description: "Sends a text, an email, a phone call — or any combination — to you (and any extra phones / emails you add) so you know a new lead came in.",
    trigger: "NOTIFY ME",
    // Multi-select: pick one or more of "sms", "email", "call". The
    // drawer renders the matching message editors as you toggle each.
    // Default ALL channels checked on first add so the user discovers
    // every option; they can uncheck to narrow down.
    defaultModes: ["sms", "email", "call"],
    defaultMode: "both",                 // legacy single-string mode for back-compat
    // Default OFF for include_customer. Notify-Me is internal lead-
    // routing — the homeowner doesn't need a copy of "here's the
    // landscaper's specialties / certifications / AI summary." Operator
    // can flip it back on via the new drawer toggle if they want.
    defaultIncludeCustomer: false,
    defaultSubject: "🌿 New lead: {name} → picked {landscape_name}",
    defaultBody:
      "A new homeowner just submitted on McHenry County Landscapers.\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "CUSTOMER (the homeowner)\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "Name:     {name}\n" +
      "Email:    {email}\n" +
      "Phone:    {phone}\n" +
      "Wants by: {date_needed}\n" +
      "Project:  {project_description}\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "LANDSCAPER THEY PICKED\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "Business:         {landscape_name}\n" +
      "Phone:            {landscape_phonenumber}\n" +
      "Email:            {landscape_email}\n" +
      "Website:          {landscape_website}\n" +
      "Address:          {landscape_address}\n" +
      "City:             {landscape_city}\n" +
      "Rating:           {landscape_rating} ({landscape_reviews} reviews)\n" +
      "Years in biz:     {landscape_years_in_business}\n" +
      "Specialties:      {landscape_specialties}\n" +
      "Services offered: {landscape_services_offered}\n" +
      "Service area:     {landscape_service_area}\n" +
      "Licensed:         {landscape_licensed}\n" +
      "Insured:          {landscape_insured}\n" +
      "Certifications:   {landscape_certifications}\n" +
      "Warranty:         {landscape_warranty}\n" +
      "Google Maps:      {landscape_google_maps_uri}\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "AI summary of this landscaper\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "{landscape_summary}\n\n" +
      "—\n" +
      "Forward the lead to the landscaper, or reach the customer directly at the phone/email above.",
    canBeSms: true,
    canBeBoth: true,
    canBeCall: true,
    defaultSpokenMessage: "New homeowner lead from {name}. They picked {landscape_name}. Project: {project_description}. Phone: {phone}.",
  },
  // ── Reach out to the customer ────────────────────────────────────────
  // Mirror image of Notify Me, but customer-facing. Multi-select
  // sms/email/call channels; ALL go to the lead's contact info from
  // their form submission. No "extras" because the audience is always
  // the lead — there's no reason to CC the owner. The engine picks the
  // values automatically from the lead record (lead.email for email,
  // lead.phone for sms+call) so the user doesn't type anything beyond
  // the message body.
  {
    id: "reach_out", kind: "action",
    icon: "📤", title: "Reach out to customer",
    cardSub: "Email, text, or call the lead",
    description: "Reaches the customer who filled out the form. Pick any combination of email, text, and call — each one auto-uses the contact info they typed in.",
    trigger: "REACH OUT TO CUSTOMER",
    // Default email-only on first add. SMS / call are off so the user
    // opts in deliberately (text needs Twilio, calls cost minutes).
    defaultModes: ["email"],
    defaultMode: "email",
    defaultSubject: "Thanks for reaching out, {first_name}",
    defaultBody: "Hi {first_name},\n\nThanks for getting in touch about {service_type}. I'll get back to you shortly with next steps.\n\n— {owner_name}",
    defaultSpokenMessage: "Hi {first_name}, this is {owner_name} from {business_name} returning your form submission.",
    canBeSms: true,
    canBeBoth: true,
    canBeCall: true,
  },
  // Standalone Email — sends to ANY address you pick. Distinct from
  // `reach_out` (which always emails the lead): this one lets the
  // user route the email to a custom address OR to a site_field
  // value from the form payload. Useful for fan-out (forward the
  // lead to a partner, route to the chosen vendor, etc.).
  {
    id: "send_email", kind: "action",
    icon: "📧", title: "Email",
    cardSub: "Email any address",
    description: "Send an email to any address — you pick the recipient: the lead, an address you type in, or a value from a 'From your site' field.",
    trigger: "SEND AN EMAIL",
    defaultMode: "email",
    defaultRecipientSource: "lead",  // "lead" | "custom" | "site_field"
    defaultRecipientValue:  "",       // email address (custom) or site_field key
    defaultSubject: "Thanks for reaching out, {first_name}",
    defaultBody: "Hi {first_name},\n\nThanks for getting in touch about {service_type}. I'll get back to you shortly with next steps.\n\n— {owner_name}",
    canBeSms: false,
  },
  // Legacy send_text — kept hidden so saved flows still render and run.
  {
    id: "send_text", kind: "action", hidden: true,
    icon: "💬", title: "Text",
    cardSub: "Send a quick note",
    description: "Message your customer with a quick note.",
    trigger: "SEND A TEXT",
    defaultMode: "sms",
    defaultBody: "Hey {first_name}, quick note from {owner_name}.",
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

  // ── Call (Tier C) ────────────────────────────────────────────────────
  // Two modes:
  //   warm_transfer   — backend dials the OWNER first, bridges the lead
  //                     in when the owner answers (same flow as the
  //                     "📞 Call now" button on the lead detail modal).
  //   voicemail_drop  — backend places a call with answering-machine
  //                     detection; if the lead's voicemail picks up we
  //                     play the chosen recording. If a human picks up
  //                     we hang up immediately so we never surprise
  //                     anyone with a recorded blast.
  // The drawer UI is intentionally minimal in v1 — full editor wiring
  // (mode toggle, recording picker, business-hours toggle) ships in a
  // follow-up. The engine already handles every option here.
  // Standalone Call — like Email above, but for outbound calls.
  // Recipient picker: the lead, a custom phone number, or a value
  // from a 'From your site' field. Engine bridges the call to your
  // AI voice agent once the recipient picks up.
  {
    id: "call", kind: "action",
    icon: "📞", title: "Call",
    cardSub: "Call any number",
    description: "Place an outbound call via your connected Twilio number — pick the recipient: the lead, a number you type in, or a value from a 'From your site' field.",
    trigger: "PLACE A CALL",
    defaultMode: "warm_transfer",
    defaultCallTarget: "lead",           // "lead" | "custom" | "site_field"
    defaultPhoneNumber: "",              // custom phone number OR site_field key
    defaultSpokenMessage: "Hi, this is your CRM. I have a quick update for you.",
    defaultRecordingId: "",
    defaultRespectBusinessHours: true,
  },

  // ── Google Sheets logger ─────────────────────────────────────────────
  // Appends a row to a Google Sheet for every lead that hits this
  // step. Useful as a durable, sortable record that lives outside the
  // CRM. The drawer collects:
  //   - Sheet URL or ID
  //   - Worksheet (tab) name (default "Sheet1")
  //   - Columns: ordered list of {header, source} where source is a
  //     {merge_tag} (e.g. {name}, {landscape_name}, {landscape_summary})
  // Auto-writes the header row if the sheet's A1 is empty so the user
  // doesn't have to set up the sheet manually. The service account
  // backing the app needs Editor access on the target sheet.
  {
    id: "append_sheet", kind: "action",
    icon: "📊", title: "Google Sheet",
    cardSub: "Log lead to a sheet",
    description: "Appends one row per lead to a Google Sheet. Map any form field or picked-pro variable to a column.",
    trigger: "LOG TO SHEET",
    defaultMode: "sheet",
    defaultSpreadsheetId: "",
    defaultWorksheetName: "Sheet1",
    defaultEnsureHeaderRow: true,
    // Default schema. Captures the lead + the picked-landscaper
    // variables the contact form attaches. The drawer lets the
    // operator add/remove/reorder columns.
    defaultColumns: [
      { header: "Timestamp",            source: "{timestamp}" },
      { header: "Lead ID",              source: "{lead_id}" },
      { header: "Customer name",        source: "{name}" },
      { header: "Customer email",       source: "{email}" },
      { header: "Customer phone",       source: "{phone}" },
      { header: "When",                 source: "{date_needed}" },
      { header: "Project description",  source: "{project_description}" },
      { header: "Picked landscaper",    source: "{landscape_name}" },
      { header: "Landscaper email",     source: "{landscape_email}" },
      { header: "Landscaper phone",     source: "{landscape_phonenumber}" },
      { header: "Landscaper website",   source: "{landscape_website}" },
      { header: "Services",             source: "{landscape_services}" },
      { header: "Specialties",          source: "{landscape_specialties}" },
      { header: "Years in business",    source: "{landscape_years_in_business}" },
      { header: "Summary",              source: "{landscape_summary}" },
    ],
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
