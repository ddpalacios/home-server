# Hands-Off SMS-First Architecture — Design

**Status:** Draft for implementation. Owner: Pat (the small-business owner persona).
**Date:** 2026-05-06.
**Author:** brainstormed with Daniel Palacios.

---

## 1. Goal

Make JustGotALead a **set-once, run-forever** product. The owner configures the
system one time during onboarding (~15 minutes), then operates the entire
business through their existing tools (phone, email, Google Calendar). They
should never *need* to open the dashboard again. The dashboard becomes a
**setup and audit surface** — not the daily operating UI.

Critically, the owner does not have to learn a new tool or migrate to one.
The system slots in alongside what they already do: receive calls, read
texts, check email, look at their calendar.

---

## 2. The non-negotiables

1. **Owner-confirms-before-send** — the system never sends a customer-facing
   message without the owner's explicit OK. The "OK" can default to a setting
   ("auto-send during business hours") but the design must always preserve
   the owner's last-mile control. No silent autopilot of risky messages.

2. **No new tool to learn** — the operating channel for the owner is **SMS**,
   not the dashboard. Every flow event surfaces as a text. Every action the
   owner needs to take has a single-word reply. SMS-in, SMS-out, on the
   owner's existing phone.

3. **One number for everything** — the customer texts the owner's Twilio
   number; the owner sees that conversation; the system AI replies on the
   owner's behalf when the owner is busy; everything routes through the same
   number from the customer's perspective. The customer cannot tell whether
   they are talking to the owner or the AI.

4. **Use the AI voice we already have** — no new voice training, no new
   samples. The existing AI conversation responder (`sequences/ai_responder.py`)
   stays as-is. We can refine its tone later; the architecture doesn't depend
   on a particular voice fidelity.

---

## 3. Channels are the primary trigger dimension

A flow's entry point is determined by **which channel a lead arrived on**.
This is a meaningful architectural shift from the current design, where
flows are mostly tied to lifecycle events ("First hello," "Quote sent")
without a strong channel concept.

```
                           CHANNEL FAN-IN
                           ──────────────

  Customer fills out a web form
       │
       ▼
   ┌─────────────────────────┐
   │ Form-submission channel │ ──── fires the form's flow
   │  (per-form binding)     │      (each form can have its own
   └─────────────────────────┘       flow attached today via
                                     /me/forms/<form_id>/flow)


  Customer calls the Twilio number
       │
       ▼
   ┌─────────────────────────┐
   │ Phone-call channel      │ ──── fires the call-handling flow
   │  (one default per acct) │      Default: forward → if missed,
   └─────────────────────────┘       auto-text "couldn't catch you,
                                     I'll call back at..." + log
                                     a new lead from the caller's
                                     number.


  Customer texts the Twilio number
       │
       ▼
   ┌─────────────────────────┐
   │ Phone-text channel      │ ──── fires the text-handling flow
   │  (one default per acct) │      Default: AI auto-reply in the
   └─────────────────────────┘       owner's voice; escalate when
                                     the AI hits its rules (price,
                                     scheduling, tone).


  Customer emails the connected Gmail
       │
       ▼
   ┌─────────────────────────┐
   │ Email-inbound channel   │ ──── (not in v1; out of scope until
   │  (deferred)             │       inbox UX is built)
   └─────────────────────────┘


  Manual entry / import
       │
       ▼
   ┌─────────────────────────┐
   │ Manual channel          │ ──── fires the "First hello" or
   │  (CSV / dashboard)      │       whatever flow the owner picks
   └─────────────────────────┘       (today: manual Run-a-flow).


  Lifecycle event (existing pattern)
       │
       ▼
   ┌─────────────────────────┐
   │ Lifecycle triggers      │ ──── continue to fire as today
   │  (Quote sent, Job done) │      (independent of arrival channel)
   └─────────────────────────┘
```

### Why channels matter

The wording, tone, and pacing of the first response should differ by channel.
A customer who fills out a form expects a fast, structured email reply with
next-step. A customer who calls expects to be called back. A customer who
texts expects a text within minutes. Treating all of them the same is
exactly how owners lose leads.

By making channel the primary trigger dimension, the owner can configure
each channel once and the system honors the customer's chosen contact mode.

### Channel → flow binding

Each channel has a default flow attached at the account level. The owner
can override per-form (already supported via `/me/forms/<form_id>/flow`)
or per-channel (new, see Phase 1).

```
Channel              Default flow             Override
──────────────────   ──────────────────────   ────────────────
Form (default)       "First hello"            per-form flow id
Form (specific)      <as set on the form>     per-form flow id
Phone-call           "Missed-call → text"     account setting
Phone-text           "AI auto-reply"          account setting
Manual entry         <picked at entry time>   manual run-a-flow
Lifecycle            <existing triggers>      flow editor
```

---

## 4. The owner's day after onboarding

This is the operating model. The dashboard is not in this picture
except as a place Pat occasionally peeks at history.

```
6:00 AM   Pat wakes up, checks his phone.
          
          📲 SMS from his Twilio number (the system):
              "Yesterday: 3 new leads · 2 quote replies · 1 booking
                · 1 review request fired. Reply RECAP for the list."
          
          Pat ignores it. He's brushing his teeth.

7:30 AM   Pat is driving to the first job. New SMS:
          
          📲 "📥 Aaron Green just texted you (lead from your Google ad).
              His message: 'Hey, do you do gutter cleaning?'
              I replied: 'Hey! Yeah, gutters are a regular for us.
              Got photos of the trouble spot? — Pat'
              
              Reply TAKE OVER to handle it · STOP to silence me."
          
          Pat doesn't reply. He keeps driving.

10:15 AM  Pat is on a roof. AI escalation comes in:
          
          📲 "🚨 Aaron asked about price ($1,500ish?). Stepping out
              of the conversation. Last 3 messages:
              [transcript]
              Tap to call · or text Aaron back from this thread."
          
          Pat texts back from his phone (the same SMS thread):
          "I'd quote $400 for a one-time clean — happy to come look
          this week. What's your address?"
          
          The system relays this to Aaron from the Twilio number.
          Aaron sees a continuous conversation.

11:42 AM  Quote nudge fires for Bobby Mitchell from yesterday.
          The system asks Pat first (because it's a quote nudge —
          one of the "needs OK" categories from settings):
          
          📲 "Ready to send Bobby Mitchell:
              💬 'Hey Bobby, any thoughts on the quote? Happy to
                  answer questions or tweak it.'
              
              Reply YES to send · NO to cancel · EDIT [text] to change.
              Holds 4 hours if you don't reply."
          
          Pat replies "YES". Bobby gets the text 30 seconds later.

2:00 PM   Pat is finishing a job. A customer asks if Pat does decks.
          Pat says no but knows a guy. Pat texts the customer the
          referral from his personal phone — NOT the Twilio number.
          
          The system never sees this conversation. That's fine. The
          system only manages what flows through Twilio.

4:30 PM   Pat finishes Aaron's estimate visit (the gutters job).
          Standing in his truck, he opens the dashboard ONCE today:
          
          → Goes to Aaron's lead detail
          → Taps "They said yes on-site" → fills $400 → Send quote
          
          That's the only dashboard interaction Pat does all day.
          Everything else happens via SMS.

8:30 PM   The soft-confirm SMS for Aaron is due. Pat is at dinner.
          The system doesn't ping Pat for approval (the soft-confirm
          flow was set to auto-send during business hours — and 8:30
          is borderline; Pat's working-hours setting says "send
          before 9 PM is fine").
          
          📲 Pat gets the LOG (not a prompt) at 8:31 PM:
              "✓ Sent to Aaron Green: 'Hey Aaron, the paperwork is
              in your inbox. Sign when you have a chance — no rush.
              — Pat'"
          
          Pat reads it. Goes back to dinner.

10:00 PM  Daily wrap-up SMS:
              "Today: 2 new leads · 1 quote sent · 1 booking · 1 AI
              conversation that escalated. Reply RECAP for the full
              list."
          
          Pat doesn't reply. He's done.
```

The dashboard was opened once. Everything else was SMS. The customer-facing
side feels exactly like texting Pat directly.

---

## 5. The SMS command vocabulary

The owner only learns these. Every prompt the system sends to the owner
shows the relevant ones at the bottom — Pat doesn't have to memorize them.

```
COMMAND               WHAT IT DOES                                    CONTEXT
─────────────────     ─────────────────────────────────────────       ────────────
YES                   Approve and send the pending message            approval prompt
NO                    Cancel the pending message                      approval prompt
EDIT [new text]       Replace the body, then send                     approval prompt
LATER                 Hold this message 24 hours                      approval prompt
TAKE OVER             Pause AI on this conversation; route to me      AI conv notice
STOP                  Pause this entire flow on this lead             any prompt
RESUME                Un-pause a paused flow                          paused-state msg
PAUSE all             Pause every active flow on every lead           anytime
RESUME all            Un-pause everything                             anytime
AUTOPILOT all         Auto-send everything (no approvals)             anytime
APPROVE all           Pause-then-confirm everything (max safety)      anytime
BOOK [time]           Book the appointment (e.g. "BOOK Tue 9am")      reply-yes notice
CALL [name]           Call the lead (warm transfer via Twilio)        any lead notice
RESEND                Resend the last outbound to this lead           any lead notice
RECAP                 Get the full daily/weekly digest                digest prompt
HELP                  Get the command list                            anytime
```

The system parses these case-insensitively. Free-text replies that don't
match a command are NOT auto-sent to the customer — instead the system
replies "Didn't recognize 'asdfg'. Reply HELP for commands." This protects
against an owner accidentally relaying a private message.

---

## 6. AI Reply: a first-class canvas activity with three modes

The existing `execute_ai_reply` and `execute_ai_conversation` steps
(`server/sequences/steps.py`) are first-class **canvas activities** the
owner can drop into any flow. Like Wait, Send Text, and Send Email, AI
Reply has its own configuration. We use the existing voice as-is for v1
— no new training, no new samples.

### The three AI modes (per-flow setting, drop-in node)

Every flow that handles a conversation (inbound text, AI auto-response
to a form, recurring check-in) has an `ai_mode` setting on the AI Reply
node:

```
                    ┌──────────────────────┐
                    │ 🤖 AI Reply (node)   │
                    │  Mode: [ ai_first ▾ ] │
                    │  Max turns: [ 5 ]    │
                    │  Wait for owner: [ — ]│
                    │  Escalate on: ...    │
                    └──────────────────────┘

  Three modes the owner can pick from the dropdown:

  1. ai_first         AI replies immediately to the lead. Owner gets a
                      notification but is not blocking the response.
                      Best for: first-touch responses, off-hours
                      coverage, high-volume verticals where the lead
                      cannot wait. Default for: landscaping, HVAC.

  2. owner_first      Owner is nudged via SMS first. AI runs ONLY if
                      the owner doesn't reply within
                      `ai_fallback_after_min` (default 10 min,
                      configurable per node).
                      Best for: high-touch verticals where the owner is
                      the relationship. Default for: real-estate broker,
                      roofing.

  3. owner_only       Owner is nudged. AI never runs on this conversation.
                      The lead's message just sits until the owner replies.
                      Best for: time-sensitive routine confirms, sensitive
                      states (complaint leads, opted-out leads). Default
                      for: estimate-day reminders, payment confirmations.
```

### Where the AI Reply node fits in a flow

Because it's a canvas activity, the owner can place it anywhere — and
combine it with other nodes (Wait, Send Text, branch). Two common
patterns:

```
Pattern: ai_first (AI is the first responder)
─────────────────────────────────────────────

  📥 Inbound text → 🤖 AI Reply (ai_first, max 5 turns)
                          │
                          ▼
                    AI hits an escalation rule
                    (price / schedule / 5th turn)
                          │
                          ▼
                    📲 Notify owner (with transcript)


Pattern: owner_first with AI fallback
─────────────────────────────────────

  📥 Inbound text → 📲 Notify owner ("Reply within 10 min or AI handles")
                          │
                          ▼
                    ⏱️ Wait for owner reply (10 min)
                          │
                  ┌───────┴───────┐
                  ▼               ▼
              Pat replied      Timer fired
                  │               │
                  ▼               ▼
              Relay Pat's     🤖 AI Reply
              text to lead    (max 1 turn,
                              then notify)
```

### Default escalation rules (apply to all modes)

The AI hands back to the owner via SMS prompt when ANY of the following:

- Pricing is mentioned, asked, or hinted at ("how much?", "is that with
  parts?", "any discount for cash?").
- Scheduling is requested ("can you come Tuesday?", "what's your soonest?").
- Tone shifts to negative (frustrated, angry, urgent).
- The lead's message contains an address (we treat addresses as a sign
  of "the customer wants me to come there" → owner decides).
- After the **5th message** in a thread (default; configurable per node),
  regardless of content. This is a "the AI has done enough; let the
  human read."
- The customer explicitly asks for the owner ("can I talk to Pat directly?").

The escalation list is editable per AI Reply node — vertical packs ship
sensible defaults (e.g. landscaping adds "chemical / pesticide / HOA"
to the list).

### Escalation prompt the owner receives

```
🚨 Aaron asked about price ($1,500ish?). Stepping out of the conversation.

Last 3 messages:
Aaron: "How much would the gutter clean cost?"
You (AI): "Great question — let me grab the boss for the number."
Aaron: "Sure, thanks."

Tap to call · or text Aaron back from this thread.
```

The owner can respond from the same SMS thread; the system relays the
response to the lead from the Twilio number. Aaron sees one continuous
conversation.

### When the AI is silent (regardless of mode)

- Inbound from leads that are NOT in active flow state (cold leads, opted-out
  leads, manual-only leads). The owner gets the message forwarded but the
  AI does not engage.
- After `STOP` or `TAKE OVER` on this conversation (owner SMS commands).
- Outside business hours, if owner setting is "AI silent outside hours."
  The lead's message queues; AI replies at start of next business hour OR
  the owner responds first.

### Mixing modes within one flow

Different stages of a flow can use different modes. Example for
landscaping:

```
First-touch flow              Active-conversation flow      Recurring confirm
─────────────────             ────────────────────────       ─────────────────
🤖 ai_first                    🤖 owner_first                 🤖 owner_only
Cold lead arriving;           Pat already knows this lead;   No AI needed —
fast response wins;           Pat is the voice, AI fills    just confirm with
AI handles small talk;        in if Pat is on a roof.       the customer.
escalates on hard cases.
```

This is the entire point of having AI Reply as a configurable node:
the owner picks the right mode per situation rather than the system
imposing one global pattern.

---

## 7. The personal-phone reconcile problem

This is the messiest part of the design. Pat already texts customers from
his personal phone today. If the system is sending automated messages from
the Twilio number AND Pat is texting from his personal phone, the customer
receives messages from TWO numbers. That breaks the "one continuous
conversation" promise.

There are two approaches; we recommend Option B for new accounts and
Option A as a fallback for owners who already have established
personal-phone relationships with customers.

### Option A: Personal-phone reconciliation

Pat keeps texting from his personal phone. The system intercepts via:

1. Pat's iPhone has Twilio number forwarding configured (or a small
   companion app), so the system can detect when Pat sends a manual
   text to a known lead.
2. When detected, the system suppresses any conflicting auto-message
   that was scheduled to fire in the next N hours (default 4 hours).

**Cons:** requires either a phone OS hook (hard) or Pat to BCC the
Twilio number on every manual text (annoying). In practice this option
ships as: "if you reply to a lead from your personal phone, we MIGHT
double-message — keep the auto-flows light if you do this."

### Option B: All outbound through Twilio

Pat ALWAYS texts customers from the Twilio number, even from his phone.
This is achieved via:

1. Twilio number is set up with Twilio's Voice + SMS capability.
2. Pat's phone has a small contact saved as the Twilio number with
   click-to-text functionality (or Pat uses a forwarding service like
   Burner / Sideline / Twilio's own iOS app).
3. The customer ALWAYS sees the Twilio number, regardless of whether
   the message originated from the AI, the system, or Pat's manual reply.

**Pros:** clean. One conversation, one number.

**Cons:** Pat has to start using the Twilio number for outbound. Existing
customers who have his personal cell already need to be migrated (e.g.
the system sends the customer "going forward, please text this number
for faster response").

For v1, we ship Option B as the default and recommended path. Option A
becomes a Tier 3 feature when we have time to do it right.

---

## 8. Approvals + Working Hours collapse into one prompt

In an earlier brainstorm we proposed Working Hours Gate as a separate node.
With the SMS-first design, **Working Hours is just a default on the
approval prompt**. Specifically:

- If the step is scheduled to fire DURING business hours and the trigger
  is on the auto-send list → the system fires it without asking, logs
  the send.
- If the step is scheduled to fire OUTSIDE business hours OR the trigger
  is on the ask-first list → the system sends the approval prompt to
  the owner. The prompt's hold timer (default 4 hours) ensures it doesn't
  rot if the owner is asleep.

Auto-send list defaults (configurable in setup):

```
AUTO-SEND (no approval needed):
  • AI auto-reply to inbound (first 5 messages in thread)
  • Day-of-job reminder
  • Estimate visit confirmation
  • Review request after job-done (if customer is a "Won" lead)

ASK-FIRST (approval required):
  • Quote nudges (any flow that chases a quote)
  • Win-back blasts (cold-lead reactivation)
  • Anything outside business hours
  • Anything to a lead in "verbal yes" state (soft-confirm tone)
  • Anything in a flow that hasn't fired before for this account
    (the first time a flow runs, the owner approves the first send to
    feel out the tone)
```

Owner can flip any of these in setup or via SMS:

- `AUTOPILOT all` → everything auto-sends
- `APPROVE all` → everything pauses for approval
- `AUTOPILOT [trigger]` / `APPROVE [trigger]` → per-trigger toggle

---

## 9. The dashboard's role

The dashboard is the **setup and audit surface**. It does NOT need to be
opened to operate the system. Things the dashboard is for:

1. **First-time wizard** (one-time, ~15 min):
   - Connect Twilio number
   - Connect Gmail
   - Connect Google Calendar
   - Pick industry vertical (drops in templates)
   - Set business hours
   - Set approval defaults (auto-send vs ask-first per trigger)
   - Set daily-digest preferences
2. **Tune flow wording** in the Flow Builder canvas (occasional).
3. **Audit history** — pipeline, per-lead activity log (occasional).
4. **Calendar view** for appointments (occasional, mostly handled by Google
   Calendar integration).
5. **Templates library** — owner can add new flow templates (rare).

Things the dashboard is NOT for in steady-state:
- Approving messages (SMS does it)
- Reading lead replies (SMS forwards it)
- Booking appointments (SMS replies BOOK [time])
- Pausing/resuming flows (SMS commands)
- Triggering bulk runs (SMS: `RUN [flow] ON [filter]`)

---

## 10. What's already built

Reusable pieces from the current codebase:

| Piece | Where | Status |
|---|---|---|
| Sequence engine (steps + scheduling) | `server/sequences/engine.py`, `steps.py` | ✓ ready |
| Manual enroll API | `server/sequences/triggers.py:manual_enroll` | ✓ ready |
| Twilio outbound SMS | `server/app.py:_send_twilio_sms` | ✓ ready |
| TCPA / consent guard | `server/app.py:_send_twilio_sms_to_lead` | ✓ ready |
| Gmail send | `server/email_outreach.py:send_email` | ✓ ready |
| Google Calendar (read + book) | `server/google_calendar.py` | ✓ ready |
| AI responder | `server/sequences/ai_responder.py` | ✓ ready |
| Per-form flow binding | `/me/forms/<form_id>/flow` | ✓ ready |
| Working-hours data | `_normalize_working_hours()` (lead_bulk_email.py) | ✓ ready |
| Flow Builder canvas | `web/src/routes/flow-builder/` | ✓ ready |
| Lead detail modal | `index.html:openLeadDetailModal` | ✓ ready |
| Run-a-flow (manual trigger) | `/me/flows/<id>/run` + UI | ✓ shipped |

The engine is in place. The work is the SMS-first front door and the
channel routing layer.

---

## 11. What's missing

Components that need to be built for this design:

### 11.1 SMS command parser
- New `server/sms_command_parser.py` (~200 lines).
- Inbound webhook from Twilio routes through the parser BEFORE it routes
  to the AI responder. If the inbound is from the OWNER's phone number
  (matched against the account's owner_phone), parse as a command. If
  from a LEAD, route to the AI responder as today.
- Commands map to engine actions: `YES → approve_step(id)`, `BOOK Tue 9am →
  book_appointment(lead_id, time)`, etc.
- Unknown owner commands reply with "Didn't recognize. Reply HELP." — never
  silently relayed to a lead.

### 11.2 SMS prompt formatter
- New `server/sms_prompt_formatter.py` (~150 lines).
- Whenever a sequence step is staged for owner approval, instead of writing
  to a dashboard banner only, the formatter builds an SMS prompt with:
  - The action being proposed (lead name, channel, body preview)
  - The reply codes (YES / NO / EDIT / LATER)
  - A short URL to the dashboard for full context (optional)
- Sends via existing `_send_twilio_sms` to the owner's phone.

### 11.3 Approval state in the engine
- Augment the existing `enrollment` state machine to support a new step
  state: `pending_owner_approval`. The engine's `tick_account` skips
  these until they flip to `approved` or `canceled` (via the parser).
- Add `approval_holder_id` (owner's phone) and `approval_expires_at` so a
  step that waits too long auto-cancels and the flow pauses on this lead.

### 11.4 Channel-driven trigger dispatch
- New `server/channels.py` (~250 lines, may already exist as a stub —
  check `server/sequences/channels.py`).
- Single entry point `dispatch_inbound(channel, payload)`:
  - `channel="form"` → look up the form's flow, fire it
  - `channel="phone_call"` → fire account's call-handling flow
  - `channel="phone_text"` → if first message, fire account's text flow;
    else route to AI responder
  - `channel="manual"` → use the manual-trigger codepath we already have
- Existing form-submission, missed-call, and inbound-SMS handlers all
  funnel through `dispatch_inbound` so the channel routing is centralized.

### 11.5 Daily digest engine
- New `server/digest.py` (~150 lines).
- Cron-style trigger (reuse the existing scheduler thread pattern) at
  6 PM in the owner's timezone (read from working_hours).
- Composes a one-SMS digest of the day's activity:
  new leads, quote replies, bookings, AI escalations, flow approvals
  pending. Sends to the owner's phone.

### 11.6 AI escalation rules
- Augment `sequences/ai_responder.py` with classifier hooks:
  - Price detection (regex + small-LLM hint)
  - Schedule detection
  - Tone shift detection
  - Address detection
  - Message-count threshold (configurable, default 5)
- When a hook fires, the AI's response is NOT sent. Instead, the system
  composes the escalation prompt to the owner. The owner's reply (via SMS
  thread) is what reaches the lead.

### 11.7 Industry vertical templates
- Five packs:
  - HVAC / appliance repair
  - Plumbing / electrical
  - Roofing
  - Landscaping (lawn care, recurring)
  - Real-estate broker
- Each pack contains:
  - Default flows for first-hello, quote-nudge, win-back, after-job
  - AI voice tuning (system prompt with vertical-specific rules)
  - **Per-flow `ai_mode`** picked from `ai_first` / `owner_first` /
    `owner_only` (see section 6). Each AI Reply node in the pack ships
    with the right mode for its situation.
  - Default approval settings (e.g. HVAC: ask-first on diagnostic-fee
    quotes; landscaping: auto-send on weekly-check-in)
- Stored as JSON under `server/sequences/vertical_packs/`. Selected during
  the setup wizard.

#### Landscaping pack — example shape

```json
{
  "id": "landscaping",
  "name": "Landscaping",
  "default_flows": [
    {
      "id": "first_hello_landscaping",
      "trigger_type": "channel",
      "channels": ["form", "phone_text", "phone_call_missed"],
      "ai_node": {
        "ai_mode": "ai_first",
        "max_turns": 5,
        "escalate_on": [
          "price_question", "schedule_request",
          "chemical_or_hoa_mention", "address_provided",
          "explicit_owner_request", "message_count >= 5"
        ]
      },
      "auto_send": true
    },
    {
      "id": "active_conversation_landscaping",
      "trigger_type": "inbound_to_active_lead",
      "ai_node": {
        "ai_mode": "owner_first",
        "ai_fallback_after_min": 15,
        "max_turns": 1
      },
      "auto_send": true
    },
    {
      "id": "recurring_service_confirm",
      "trigger_type": "recurring_schedule",
      "ai_node": {
        "ai_mode": "owner_only"
      },
      "auto_send_in_hours": true
    }
  ],
  "ai_voice": {
    "system_prompt": "You're an assistant for a small landscaping company. Friendly, casual, practical. Knows mowing, trimming, mulch, sod, tree work, fall cleanup, spring cleanup, snow removal. Always asks for photos when describing the work."
  }
}
```

The owner can flip any `ai_mode` from the flow editor canvas without
touching the JSON.

### 11.8 Dashboard slimming
- Add a first-time-wizard route and a "you're done with setup; SMS will
  take it from here" landing screen.
- Move per-step preview, approval, and audit panels to be **read-only**
  in the dashboard (writes happen via SMS; dashboard shows the timeline).

### 11.9 Reconcile-with-personal-phone (Phase 3 only)
- Detection of out-of-band sends (owner texted from personal phone)
- Suppression of conflicting auto-flow steps for N hours after detection
- Optional: Twilio number used as primary contact for new accounts (just
  documentation + onboarding nudge, not a code feature)

---

## 12. The phase plan

```
PHASE 1 — Make the dashboard a setup tool, not an operating tool   ~1.5 weeks
─────────────────────────────────────────────────────────────────────
  • SMS command parser (YES / NO / EDIT / STOP / TAKE OVER / BOOK / CALL)
  • SMS prompt formatter for approvals (every staged step)
  • Approval state in the engine + auto-cancel timer
  • Daily digest SMS at 6 PM
  
  Acceptance: Pat can run a full week without opening the dashboard
  except to check the calendar.

PHASE 2 — AI does the talking by default                            ~1.5 weeks
─────────────────────────────────────────────────────────────────────
  • AI auto-reply for inbound SMS from leads (using existing voice)
  • AI escalation rules (price, schedule, tone, address, message-count)
  • SMS escalation prompt: owner replies via the same SMS thread
  • Owner's reply relays to the lead from Twilio
  
  Acceptance: New leads talk to the AI on Pat's number all day. Pat
  sees what was said, only steps in when escalated.

PHASE 3 — Channels are the trigger dimension                        ~1 week
─────────────────────────────────────────────────────────────────────
  • dispatch_inbound(channel, payload) entry point
  • Phone-call channel: missed-call → text bridge
  • Phone-text channel: AI auto-reply default
  • Form channel: existing per-form flow (already wired)
  • Manual channel: existing run-a-flow (already wired)
  
  Acceptance: every lead arrival routes to the right flow based on
  how they came in. Owner sees the channel in every notification.

PHASE 4 — Industry vertical templates + onboarding wizard           ~1.5 weeks
─────────────────────────────────────────────────────────────────────
  • Five vertical packs (HVAC / Plumbing / Roofing / Landscaping / Broker)
  • 15-minute setup wizard
  • "You're done" landing page after setup
  • Per-vertical default approval rules
  
  Acceptance: Pat signs up Tuesday afternoon, runs Wednesday's leads
  entirely through the system. Never opens the dashboard except for
  the wizard.

DEFERRED — Phase 5 candidates
─────────────────────────────────────────────────────────────────────
  • Personal-phone reconciliation (the messy Option A)
  • Working hours as a hard gate (currently absorbed into approval
    prompt defaults)
  • Inbound email channel
  • Two-way SMS inbox in dashboard (low priority once SMS-first works)
  • Outbound voice action (Twilio voice; Phase 6+)
  • Voicemail drops
```

Total Phases 1–4: **~5.5 weeks** for a complete hands-off SMS-first system
on top of what we already have.

---

## 13. Risks + open questions

1. **Twilio cost per account.** SMS costs add up: every approval prompt,
   every escalation, every digest. For a busy account with 50 leads/week,
   this could be 200–300 owner-bound SMS/week. Need a cost model. Could
   we batch some (digest = 1 SMS, not 10)?

2. **Twilio rate limits.** Fast-fire flows could hit Twilio's per-second
   limits. The engine already paces at 1/sec for bulk; per-account pacing
   for owner-bound SMS may need similar.

3. **A2P 10DLC registration.** Per-customer brand registration may be
   required for high-volume SMS to leads. The TCPA guard handles consent;
   compliance may require campaign registration before scale.

4. **What if the owner ignores the approval prompt?** Default 4-hour
   hold, then auto-cancel. Configurable. But a never-replying owner means
   flows die quietly. Phase 4 wizard should set expectations.

5. **What if the AI "voice" feels wrong for a vertical?** Phase 2 ships
   with the existing voice. Phase 4 adds vertical packs that pre-tune the
   AI's system prompt. If still wrong, manual editing of the vertical
   pack JSON is the v1 escape hatch.

6. **Personal-phone reconciliation (Phase 5).** Option B (everything
   through Twilio) is the recommended path. Option A is technically hard
   without OS hooks. Big customer-segment question: how many existing
   small-biz owners will switch their outbound to Twilio? If <50%, we
   need Option A.

7. **Email-channel parity.** v1 has email send + Gmail connect. Email
   is NOT the operating channel for the owner (SMS is). But the owner
   may want email digests AS WELL AS SMS. Easy add in Phase 1 if needed.

8. **Calendar-event creation on appointment booking.** Today the dashboard
   books into Google Calendar via the calendar API. The SMS `BOOK Tue 9am`
   command needs to do the same. Reuse `_book_appointment_in_calendar`
   from app.py.

9. **What does the owner see vs the lead?** The lead sees a normal
   conversation from the Twilio number. The owner sees structured prompts.
   Two different UX skins on one underlying conversation. Worth a small
   end-to-end test before declaring Phase 2 done.

10. **Approval prompt fatigue.** If every step asks for approval, the owner
    will turn it all off. Phase 1 settings must default to a safe-but-quiet
    set: ask-first on quote nudges and outside-hours sends; auto-send on
    everything else. Tunable later.

---

## 14. Out of scope for this design

- AI voice retraining or new sample collection (we use the existing voice).
- Outbound voice action node (Twilio voice; Tier 3+).
- Pricing engine / quote builder.
- Multi-user / team coordination (v1 = solo + small team where one phone
  is "the owner").
- Stripe / payment-link integration in flows.
- Multi-step branching beyond what the existing engine supports.
- Inbox-style web UI for SMS threads (low priority once SMS-first works).
- Public unsubscribe portal beyond the existing `/u/<cid>/<lid>/<token>`.

---

## 15. Acceptance criteria for v1 ship

A new account can be set up in ≤15 minutes via the wizard (Phase 4).
After setup, the owner does not open the dashboard for 7 consecutive
days. During those 7 days:

- Every new lead lands in a flow matching the channel they arrived on.
- The AI auto-replies to inbound texts in the owner's voice and escalates
  per the rules.
- Every customer-facing message that the owner has marked "ask first"
  prompts the owner via SMS before sending.
- The owner can pause, resume, edit, send, cancel, and book — all via
  SMS commands.
- Daily digest SMS arrives every evening with the day's activity.
- No customer receives a duplicate message from the system + owner's
  personal phone (Option B path).
- The dashboard, when finally opened on day 8, shows a complete and
  accurate audit trail of everything that happened during the week.

---

## 16. Next step

Phase 1, starting with **the SMS command parser + approval prompt formatter**.
Working Hours Gate as a separate node is dropped — its functionality
collapses into the approval prompt's default behavior.
