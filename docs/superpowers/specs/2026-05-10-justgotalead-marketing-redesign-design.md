---
title: justgotalead.com marketing redesign
date: 2026-05-10
status: approved-by-user
scope: templates/portfolio/home.html, templates/portfolio/privacy.html, templates/portfolio/terms.html
---

# justgotalead.com marketing redesign

## Goal

Rewrite the home page (and update privacy + terms to match) so a home-service
business owner — landscaper, contractor, roofer, HVAC, cleaning — can read the
first three seconds and know "this is exactly what I need." Pull all "AI"
language out and replace it with outcomes. Apply the MECLABS Conversion
Heuristic (`C = 4M + 3V + 2(I-F) - 2A`) by leading with motivation and value,
stripping noise (friction), and dropping the only required-checkbox on the
form (anxiety).

## Locked decisions (from brainstorming)

| Decision | Value |
|---|---|
| Audience | Home-service SMBs (landscapers, contractors, roofers, HVAC, cleaning) |
| Direction | B — Use-case showcase, evolved with B-pick headline |
| Headline | **Get every lead. Answer every customer. Stay in the field.** |
| Hero subhead | Calls, texts, web forms — captured and answered like you wrote them yourself. Estimates booked. Follow-ups sent. Without you at a desk. |
| Hero eyebrow | ⚡ Built for home-service owners |
| Primary CTA | Start free → |
| Secondary CTA | Watch 90-sec demo |
| Hero fineprint | No credit card · 14-day trial · Cancel anytime |
| Forbidden language | The word "AI" appears nowhere on the page |
| Social proof section | **Cut** (no real testimonials yet) |
| Inline pricing | **Cut** (removed from home; no separate /pricing page in this round) |
| ROI calculator | **Cut** |
| "Problem in a real day" section | **Cut** |
| Nav "Pricing" link | **Removed** (no pricing page exists in scope) |
| Nav "How it works" link | Anchors to the "Three things it does" strip |
| Logo | Keep current logo + gradient-text "Just Got A Lead" wordmark |
| SMS consent | Optional, never blocks submission |

## Page anatomy (top to bottom)

1. **Nav (sticky)**
   - Left: logo + "Just Got A Lead" wordmark
   - Right: "How it works" (anchor to `#three-things`) · "Start free" (anchor to `#start-free`)
   - No Pricing link, no Login link (login is on `/login`, the user reaches it through `/dashboard` if already a customer)

2. **Hero (`#hero`)**
   - Eyebrow chip: `⚡ Built for home-service owners`
   - H1: `Get every lead. Answer every customer.` (line break) `Stay in the field.`
   - Subhead: `Calls, texts, web forms — captured and answered like you wrote them yourself. Estimates booked. Follow-ups sent. Without you at a desk.`
   - Two CTAs: `Start free →` (anchor to `#start-free`) and `Watch 90-sec demo` (anchor to a `<dialog>` with embedded video, see "Demo modal" below)
   - Fineprint under CTAs: `No credit card · 14-day trial · Cancel anytime`
   - Background: light gradient (`#f8fafc` → `#eef2ff`), no hero image — the words ARE the hero

3. **Three things it does (`#three-things`)**
   - Eyebrow: `THE THREE THINGS IT DOES`
   - 3-column strip, no big section title:
     - 📞 **Captures every lead** — Phone, text, web form. Nothing slips through.
     - 💬 **Answers in your voice** — Trained on your business. Sounds like you.
     - 📅 **Books the next step** — Follow-up, estimate, appointment — done.
   - White background, separator lines between columns
   - This is the value-prop crash course for skimmers who don't read the headline

4. **9 jobs we handle for you (`#jobs`)**
   - Eyebrow: `WHAT YOU GET`
   - H2: `9 jobs we handle for you`
   - Subhead: `Every tile is a real pane in your dashboard. Set up once, then it runs.`
   - 3×3 grid of tiles. Each tile is icon + bold name + one-line description. No clicks, no links, no expanding interaction in v1 — just a quick visual scan.

   | # | Icon | Name | Description | Maps to dashboard |
   |---|---|---|---|---|
   | 1 | 📞 | Calls picked up | Even at 9pm on a Saturday. | voice bot |
   | 2 | 💬 | Texts answered | Two-way SMS, in your voice. | Inbox + Replies |
   | 3 | 🌐 | Web forms captured | Drops the form on any site. | Lead Intake widget |
   | 4 | ✉️ | Follow-ups sent | Nudge cold leads, automatically. | Outreach + sequence engine |
   | 5 | 📅 | Estimates booked | Right into your calendar. | Schedule |
   | 6 | 📱 | Socials posted | Instagram + LinkedIn on autopilot. | Social Pipeline |
   | 7 | 📚 | Your business knowledge | Train it once from your website. | KB / Train from URL |
   | 8 | 📣 | Email campaigns | Bulk send without spam flags. | Email Campaigns |
   | 9 | 📊 | What's working | One dashboard. Real numbers. | Activity |

   - Tile #9 gets the accent treatment (blue gradient background, white text) to anchor the grid

5. **One dashboard (`#one-dashboard`)**
   - Eyebrow: `ONE DASHBOARD`
   - H2: `Everything in one place`
   - Single product screenshot below: a real screen capture of the dashboard showing Leads + Inbox + Schedule. Image is sized at 700×420 in a dark-bordered "device frame" (rounded corners, `#0f172a` outer, `#1e293b` inner).
   - No copy beyond the headline — let the image carry the meaning

6. **Start free (`#start-free`)**
   - Eyebrow: `START FREE`
   - H2: `Try it on your next lead`
   - Subhead: `Set it up in 15 minutes. The first lead pays for the year.`
   - Form (single column, max-width 380px, centered):
     - Your name (text, required)
     - Email (email, required)
     - Phone (tel, **optional**)
     - What do you want help with? (textarea, required, 3 rows)
     - SMS consent checkbox (UNREQUIRED — see "Contact form rewrite" below)
     - Submit button: `Start free →`
   - Background: light blue gradient (`#eef2ff` → `#e0e7ff`)

7. **Footer**
   - Single line, centered, on dark background (`#0f172a`):
     `© 2026 Just Got A Lead · Privacy · Terms`
   - Privacy + Terms are real links to `/privacy` and `/terms`

## Contact form rewrite (lives inside `#start-free`)

### Behaviour changes from the current form

| Field | Old behaviour | New behaviour |
|---|---|---|
| Name | Required | Required (unchanged) |
| Email | Required | Required (unchanged) |
| Phone | Required | **Optional** — only collected if visitor enters it |
| Message | Required | Required (unchanged) |
| SMS consent checkbox | **Required** — form errors with "You must agree to receive SMS messages to submit this form." | **Optional** — label reads "(Optional) OK to text me about my inquiry. Reply STOP anytime." Submission proceeds whether the box is checked or not. |

### Submission payload to backend (POST `/landscaping/contact-business` or its dashboard equivalent — same endpoint as today)

```json
{
  "name": "...",
  "email": "...",
  "phone": "..."          // empty string if not provided
  "message": "...",
  "sms_consent": true,     // false if box unchecked
  "sms_consent_text": "(Optional) OK to text me about my inquiry. Reply STOP anytime. See Privacy and SMS Terms.",
  "sms_consent_at": "<ISO8601>",  // only sent when sms_consent == true
  "consent_ip": "<request_ip>"     // only sent when sms_consent == true
}
```

- The consent text + timestamp + IP are still recorded — but **only when the box is checked**. Compliance-wise, this is the standard pattern: capture proof when consent is given, store nothing when it isn't.
- The JS that gates the submit on the consent checkbox (line ~2603, `CONSENT_ERROR`) is removed.
- The visible "consent error" element is removed from the form.

## Privacy + Terms updates

The current `privacy.html` and `terms.html` describe SMS as a **mandatory** part of the form. That's no longer true. Update both:

### `templates/portfolio/privacy.html`

- "What we collect" section: change the SMS paragraph from "If you opt in to SMS communication we also record your consent" → "**If you opt in** to SMS communication (the SMS box is now optional), we record your consent."
- Add a line under "How we use it": "You can submit the contact form without giving SMS consent. We'll only ever text you if you've checked the SMS consent box."
- Update the "last updated" meta date to **2026-05-10**.

### `templates/portfolio/terms.html`

- "Program description" section: change "By checking the SMS consent box on our contact form, you agree to receive SMS text messages…" — keep the consent language but add an opening sentence: "**Our SMS program is opt-in only.** You do not need to enroll to use Just Got A Lead. If you choose to enroll by checking the SMS consent box on our contact form, the following terms apply."
- Update the "last updated" meta date to **2026-05-10**.
- Both pages keep their current minimal style (single-column, max-width 760px, Manrope) — no visual redesign in this round. Only copy changes.

## Demo modal (`Watch 90-sec demo` CTA)

- Opens a centered `<dialog>` (native HTML, no JS framework) with backdrop blur.
- Embeds a Loom or YouTube iframe — placeholder URL until the user records the demo: `https://www.loom.com/embed/<TODO>`.
- "Close" button top-right + ESC + click-outside all dismiss.
- v1 acceptable to ship with a "Demo coming soon" placeholder card if the video isn't recorded yet (button still opens, modal shows a stand-in).

## Visual system

Reuse the existing CSS-variable palette from the current `home.html` — but tighten it. Specifically:

```css
:root {
  --bg:         #f8fafc;
  --bg-soft:    #eef2ff;
  --bg-accent:  #e0e7ff;
  --surface:    #ffffff;
  --border:     #e2e8f0;
  --text:       #0f172a;
  --text-soft:  #475569;
  --text-muted: #64748b;
  --accent:     #2563eb;
  --accent-deep:#1e3a8a;
  --dark:       #0f172a;
  --radius:     14px;
  --radius-sm:  10px;
  --shadow:     0 12px 32px rgba(15,23,42,0.06);
}
```

- Typography: keep Space Grotesk (display) + Manrope (body) — already loaded
- Buttons: solid dark (`--dark`) for primary, white-with-border for secondary
- Section padding: `48px 28px` (mobile) / `60px 32px` (desktop)
- Max content width: `780px` for grids, `560px` for hero text, `380px` for forms

## MECLABS rationale (the why behind the structure)

| Section | Lever | What it does |
|---|---|---|
| Hero headline | **M (motivation × 4)** + **V (value × 3)** | Three concrete promises that name the visitor's pain ("missed leads", "lost customers", "stuck at the desk"). 7 words, easy to scan. |
| Three things strip | **V × 3** | Re-states value in icons + 1-liners so skimmers get the offer even if they don't read the hero. |
| 9 jobs grid | **V × 3** | Concrete deliverables ("calls picked up", "estimates booked"). Each tile is something the visitor can mentally bill against a problem they already have. |
| One-dashboard screenshot | **(I-F)** | "Everything in one place" reduces perceived complexity (friction). |
| Start-free CTA + fineprint | **I × 2 - F × 2** | "No credit card · 14-day trial · Cancel anytime" is pure incentive minus friction. |
| Optional SMS consent | **-A × 2** | Anxiety reduction: visitor no longer fears being spammed if they submit the form. Highest-leverage single change on the page. |
| Cut social proof | _intentional null_ | Empty space beats fake proof. Trust > variety. |

## Files to change

| File | Change | Lines (current) |
|---|---|---|
| `templates/portfolio/home.html` | Rewrite. The new file is dramatically smaller (~700 lines vs current 2,653) because the deleted sections (problem, ROI calc, pricing) are gone. | 2,653 → ~700 |
| `templates/portfolio/privacy.html` | Copy-only update for SMS-optional language; date bump. | 164 (mostly preserved) |
| `templates/portfolio/terms.html` | Copy-only update for opt-in opening; date bump. | 70 (mostly preserved) |

## Out of scope (explicitly)

- Pricing page (no `/pricing` route exists in scope; nav link removed)
- The `/try` free-trial flow (the page CTAs link to the same `#start-free` form anchor on home for now; later we can route directly to `/try`)
- Dashboard redesign
- Mobile app
- Email styling
- `customer-privacy.html`, `customer-terms.html`, `palacios.html`, `prospect_database.html`, `twiliobot.html`, `tst.html`, `home copy.html` — untouched

## Acceptance criteria

A visitor on `https://justgotalead.com/`:
- Sees the new headline and the three CTAs above the fold
- Can scroll, see the 9 tiles, and click "Start free" without ever encountering the word "AI"
- Can submit the contact form **without** checking the SMS consent box (no error, success message returned)
- Sees an updated last-modified date on `/privacy` and `/terms` reflecting the optional-SMS change
- Reaches all CTAs via keyboard (tab order is correct, focus rings visible)
- Renders without horizontal scroll on a 360px viewport (Pixel 5 / iPhone SE)
- Lighthouse Performance score ≥ 90 on mobile (the dropped ROI calculator JS + image-heavy sections help here)

## Open questions for implementation

1. **Demo video URL** — the `Watch 90-sec demo` button needs a real Loom/YouTube embed. Until provided, use a placeholder modal that says "Demo coming soon".
2. **Product screenshot for "One dashboard" section** — need a real screen capture of the dashboard. Until provided, ship a stylized SVG mockup.
3. **Should the primary CTA `Start free →` link to `/try` instead of `#start-free`?** If yes, we ship without the inline form and the page is even shorter. Defaulting to "anchor to `#start-free` for now" because `/try` is out of scope this round.
