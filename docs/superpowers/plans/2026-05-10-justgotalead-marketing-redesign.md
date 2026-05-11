# justgotalead.com marketing redesign — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Per-task review is DISABLED for this plan** (user's durable preference). Trust the implementer's `DONE` and move on. Phase checkpoints stay — the user reviews the rendered page in a browser at the end of each phase.

**Goal:** Replace `templates/portfolio/home.html` (~2,653 lines) with a focused ~700-line redesign that applies the MECLABS conversion heuristic, drops every "AI" reference in favor of outcome language, and makes the SMS consent checkbox optional. Update `privacy.html` and `terms.html` to match the opt-in SMS change.

**Architecture:** Static HTML/CSS — no framework. Single template per page, inline `<style>`, vanilla `<script>` for the form. Served by the C router via `get_live_html`. Reuses the existing Space Grotesk + Manrope Google Fonts already loaded by the old `home.html`.

**Tech Stack:** HTML5, CSS3 (custom-property palette), vanilla JS (form submit handler), `<dialog>` element for the demo modal.

**Reference spec:** `docs/superpowers/specs/2026-05-10-justgotalead-marketing-redesign-design.md`

---

## File map

| File | Action | Notes |
|---|---|---|
| `templates/portfolio/home.html` | Replace contents | ~2,653 → ~700 lines |
| `templates/portfolio/privacy.html` | Edit copy + date | 164 lines, mostly preserved |
| `templates/portfolio/terms.html` | Edit copy + date | 70 lines, mostly preserved |
| `templates/portfolio/home copy.html` | Untouched | (legacy artifact, leave alone) |

Logo asset already exists: `templates/portfolio/images/justgotalead.png`.

Form posts to `POST /blob-storage/email` with payload `{ values: [{...}] }` — same endpoint as today, schema-compatible (just adds the optional fields).

---

## Phase 1 — Privacy + Terms copy updates

Smallest changes first. These pages keep their visual style; we're only updating copy.

### Task 1.1: Update privacy.html for opt-in SMS

**Files:**
- Modify: `templates/portfolio/privacy.html`

- [ ] **Step 1: Read the current file**

Run: `cat templates/portfolio/privacy.html | head -80`

Expected: see the "last updated May 2, 2026" date and the "What we collect" SMS paragraph.

- [ ] **Step 2: Bump the last-updated date and rewrite the SMS paragraph**

In `templates/portfolio/privacy.html`, find:
```html
<p class="meta">Just Got a Lead — last updated May 2, 2026.</p>
```
Replace with:
```html
<p class="meta">Just Got a Lead — last updated May 10, 2026.</p>
```

Then find the paragraph that begins `When you submit our contact form we collect…` and rewrite the SMS portion. Replace:
```html
<p>
  When you submit our contact form we collect your name, email address,
  phone number, and the message you write. If you opt in to SMS
  communication we also record your consent (a true/false flag), the
  exact wording you agreed to, the timestamp the consent was given, and
  the IP address from which the form was submitted.
</p>
```
With:
```html
<p>
  When you submit our contact form we collect your name, email address,
  and the message you write. Phone number is optional — only collected
  if you choose to enter it. SMS consent is also opt-in: the checkbox is
  unchecked by default, and submission is not blocked if you leave it
  unchecked. <strong>If you do check it</strong>, we record your
  consent (a true/false flag), the exact wording you agreed to, the
  timestamp the consent was given, and the IP address from which the
  form was submitted. If you leave it unchecked, none of those four
  fields are stored.
</p>
```

- [ ] **Step 3: Add a sentence under "How we use it"**

Find the `<h2>How we use it</h2>` section. After its first paragraph, add:
```html
<p>
  You can submit the contact form without giving SMS consent. We'll
  only ever text you if you've checked the SMS consent box and
  provided a phone number.
</p>
```

- [ ] **Step 4: Verify the changes**

Run:
```bash
grep -n "May 10, 2026\|opt-in\|optional\|unchecked" templates/portfolio/privacy.html
```
Expected: at least 4 hits — the date line, and the new opt-in / optional / unchecked wording.

Run:
```bash
grep -nE "must|required" templates/portfolio/privacy.html
```
Expected: no occurrences of "must" or "required" applied to SMS.

### Task 1.2: Update terms.html for opt-in SMS program

**Files:**
- Modify: `templates/portfolio/terms.html`

- [ ] **Step 1: Read the current file**

Run: `cat templates/portfolio/terms.html`

Expected: 70-line page with the "Program description" section.

- [ ] **Step 2: Bump the date and prepend opt-in language**

Find:
```html
<p class="meta">Just Got a Lead — last updated April 29, 2026.</p>
```
Replace with:
```html
<p class="meta">Just Got a Lead — last updated May 10, 2026.</p>
```

Then find:
```html
<h2>Program description</h2>
<p>
  By checking the SMS consent box on our contact form, you agree to
  receive SMS text messages from Just Got a Lead at the phone number
  provided regarding your inquiry, including responses, follow-ups, and
  appointment scheduling.
</p>
```
Replace with:
```html
<h2>Program description</h2>
<p>
  <strong>Our SMS program is opt-in only.</strong> You do not need to
  enroll to use Just Got a Lead. If you choose to enroll by checking
  the SMS consent box on our contact form, you agree to receive SMS
  text messages from Just Got a Lead at the phone number provided
  regarding your inquiry, including responses, follow-ups, and
  appointment scheduling.
</p>
```

- [ ] **Step 3: Verify**

Run:
```bash
grep -n "opt-in only\|May 10, 2026" templates/portfolio/terms.html
```
Expected: 2 hits.

### Task 1.3: Commit Phase 1

- [ ] **Step 1: Stage and commit**

Run:
```bash
cd /home/dpalacios/home-server
git add templates/portfolio/privacy.html templates/portfolio/terms.html
git commit -m "$(cat <<'EOF'
portfolio: privacy + terms now reflect opt-in SMS

SMS consent is moving from required to optional on the contact form.
Mirror that in the legal pages:
- privacy.html: rewrite the "what we collect" SMS paragraph to make
  clear consent + its proof fields are only recorded when the box is
  checked; add a sentence under "how we use it" clarifying submission
  is not blocked.
- terms.html: open "Program description" with "Our SMS program is
  opt-in only. You do not need to enroll to use Just Got a Lead."
- Bump both last-updated dates to 2026-05-10.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

**▶ Phase 1 checkpoint:** open `https://127.0.0.1:9030/privacy` and `https://127.0.0.1:9030/terms` in a browser, confirm the new dates and SMS-optional language are visible. Then continue.

---

## Phase 2 — Home page rewrite

This is the big task. We replace `home.html` in one atomic write to avoid an intermediate state where the file is broken.

### Task 2.1: Replace home.html with the new design

**Files:**
- Replace: `templates/portfolio/home.html`

- [ ] **Step 1: Back up the old file** (one-time safety net)

Run:
```bash
cp templates/portfolio/home.html templates/portfolio/home.legacy.html
```

(This file is **not** committed — it's in `.gitignore` from the moment it's created. Verify next step.)

- [ ] **Step 2: Add backup to gitignore**

Append to `.gitignore`:
```
templates/portfolio/home.legacy.html
```

Run:
```bash
echo "templates/portfolio/home.legacy.html" >> .gitignore
```

- [ ] **Step 3: Write the new home.html**

Replace `templates/portfolio/home.html` entirely with the following content. **Do not paraphrase — copy verbatim.**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Just Got A Lead — Get every lead. Answer every customer.</title>
    <meta name="description" content="Calls, texts, and web forms — captured and answered like you wrote them yourself. Estimates booked. Follow-ups sent. Built for home-service owners." />
    <link rel="icon" type="image/png" href="/portfolio/images/justgotalead.png" />
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700;800&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <style>
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
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html { scroll-behavior: smooth; }
      body {
        font-family: "Manrope", system-ui, -apple-system, sans-serif;
        background: var(--bg);
        color: var(--text);
        line-height: 1.5;
        -webkit-font-smoothing: antialiased;
      }
      a { color: inherit; text-decoration: none; }
      img { max-width: 100%; display: block; }
      h1, h2, h3 { font-family: "Space Grotesk", sans-serif; letter-spacing: -0.01em; }

      .container { width: min(1100px, 92%); margin: 0 auto; }

      /* ─── NAV ─────────────────────────────────────────── */
      header {
        position: sticky; top: 0; z-index: 30;
        background: rgba(255,255,255,0.92);
        backdrop-filter: saturate(140%) blur(10px);
        border-bottom: 1px solid var(--border);
      }
      .nav { display: flex; align-items: center; justify-content: space-between; padding: 14px 0; }
      .logo { display: flex; align-items: center; gap: 10px; font-weight: 800; }
      .logo-mark { width: 32px; height: 32px; border-radius: 8px; }
      .logo-text {
        font-family: "Space Grotesk", sans-serif;
        font-size: 1.05rem;
        background: linear-gradient(90deg, #0f172a, #2563eb);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }
      .nav-links { display: flex; align-items: center; gap: 18px; font-size: 0.92rem; color: var(--text-soft); font-weight: 500; }
      .nav-links a:hover { color: var(--text); }
      .nav-cta {
        background: var(--dark); color: #fff !important;
        padding: 8px 16px; border-radius: var(--radius-sm);
        font-weight: 600; font-size: 0.88rem;
      }
      .nav-cta:hover { background: #1e293b; }

      /* ─── HERO ────────────────────────────────────────── */
      .hero {
        text-align: center;
        padding: 72px 0 64px;
        background: linear-gradient(180deg, var(--bg) 0%, var(--bg-soft) 100%);
      }
      .hero .eyebrow {
        display: inline-block;
        background: #dbeafe; color: var(--accent-deep);
        padding: 6px 14px; border-radius: 999px;
        font-size: 0.74rem; font-weight: 600; letter-spacing: 0.4px;
        margin-bottom: 22px;
      }
      .hero h1 {
        font-size: clamp(1.9rem, 4.6vw, 2.9rem);
        line-height: 1.1; font-weight: 800; color: var(--text);
        max-width: 760px; margin: 0 auto 18px;
      }
      .hero .sub {
        color: var(--text-soft);
        font-size: clamp(1rem, 1.6vw, 1.12rem);
        max-width: 580px; margin: 0 auto 28px;
        line-height: 1.55;
      }
      .hero-ctas { display: inline-flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
      .btn {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 13px 22px; border-radius: var(--radius-sm);
        font-weight: 700; font-size: 0.95rem;
        border: 1px solid transparent; cursor: pointer;
        transition: transform 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
      }
      .btn:hover { transform: translateY(-1px); }
      .btn-primary { background: var(--dark); color: #fff; box-shadow: 0 8px 24px rgba(15,23,42,0.18); }
      .btn-primary:hover { background: #1e293b; }
      .btn-secondary { background: #fff; color: var(--text); border-color: #cbd5e1; }
      .btn-secondary:hover { border-color: #94a3b8; }
      .hero .fine { color: var(--text-muted); font-size: 0.78rem; margin-top: 16px; }

      /* ─── THREE THINGS STRIP ──────────────────────────── */
      .three {
        background: #fff;
        padding: 44px 0;
        border-bottom: 1px solid var(--border);
      }
      .three .label {
        text-align: center;
        font-size: 0.72rem; letter-spacing: 1.6px; text-transform: uppercase;
        color: var(--text-muted); font-weight: 600; margin-bottom: 8px;
      }
      .three-grid {
        display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0;
        max-width: 820px; margin: 18px auto 0;
      }
      .three-item { text-align: center; padding: 14px 18px; }
      .three-item + .three-item { border-left: 1px solid var(--border); }
      .three-icon { font-size: 1.8rem; margin-bottom: 8px; }
      .three-title { font-weight: 800; font-size: 1rem; color: var(--text); }
      .three-desc { font-size: 0.84rem; color: var(--text-muted); margin-top: 6px; line-height: 1.45; }

      /* ─── JOBS GRID ───────────────────────────────────── */
      .jobs { padding: 56px 0; background: #fff; }
      .jobs-head { text-align: center; margin-bottom: 28px; }
      .jobs-eyebrow {
        font-size: 0.72rem; letter-spacing: 1.6px; text-transform: uppercase;
        color: var(--text-muted); font-weight: 600; margin-bottom: 8px;
      }
      .jobs h2 { font-size: clamp(1.5rem, 2.6vw, 1.85rem); font-weight: 800; }
      .jobs .sub { color: var(--text-muted); font-size: 0.95rem; margin-top: 8px; }
      .jobs-grid {
        display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
        max-width: 820px; margin: 0 auto;
      }
      .job-tile {
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 20px 16px;
        background: #fafbfc;
        transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
      }
      .job-tile:hover { transform: translateY(-2px); box-shadow: var(--shadow); border-color: #cbd5e1; }
      .job-icon { font-size: 1.7rem; }
      .job-name { font-weight: 700; font-size: 0.92rem; color: var(--text); margin-top: 10px; }
      .job-desc { font-size: 0.78rem; color: var(--text-muted); margin-top: 4px; line-height: 1.42; }
      .job-tile.accent {
        background: linear-gradient(135deg, var(--accent), var(--accent-deep));
        color: #fff; border-color: var(--accent);
      }
      .job-tile.accent .job-name { color: #fff; }
      .job-tile.accent .job-desc { color: rgba(255,255,255,0.86); }
      .job-tile.accent:hover { box-shadow: 0 14px 36px rgba(37,99,235,0.32); border-color: transparent; }

      /* ─── ONE DASHBOARD ───────────────────────────────── */
      .one { padding: 56px 0; background: var(--bg); border-top: 1px solid var(--border); }
      .one-head { text-align: center; margin-bottom: 28px; }
      .one h2 { font-size: clamp(1.5rem, 2.6vw, 1.85rem); font-weight: 800; }
      .one-frame {
        max-width: 720px; margin: 0 auto;
        background: var(--dark); border-radius: 18px; padding: 14px;
        box-shadow: 0 30px 70px rgba(15,23,42,0.22);
      }
      .one-shot {
        background: #1e293b; border-radius: 12px; min-height: 360px;
        display: flex; align-items: center; justify-content: center;
        color: #94a3b8; font-family: ui-monospace, monospace; font-size: 0.78rem;
        background-image:
          radial-gradient(circle at 20% 30%, rgba(37,99,235,0.18), transparent 40%),
          radial-gradient(circle at 80% 70%, rgba(99,102,241,0.18), transparent 40%);
      }

      /* ─── START FREE / FORM ───────────────────────────── */
      .start {
        padding: 64px 0;
        background: linear-gradient(180deg, var(--bg-soft) 0%, var(--bg-accent) 100%);
        text-align: center;
      }
      .start-eyebrow {
        font-size: 0.72rem; letter-spacing: 1.6px; text-transform: uppercase;
        color: var(--accent-deep); font-weight: 700; margin-bottom: 10px;
      }
      .start h2 { font-size: clamp(1.5rem, 2.6vw, 1.85rem); font-weight: 800; }
      .start .sub { color: var(--text-soft); font-size: 0.97rem; margin: 8px auto 26px; max-width: 460px; }
      .form {
        max-width: 380px; margin: 0 auto;
        background: #fff;
        border: 1px solid #c7d2fe;
        border-radius: var(--radius);
        padding: 22px;
        text-align: left;
        box-shadow: 0 18px 50px rgba(30,58,138,0.10);
      }
      .form .field { margin-bottom: 10px; }
      .form label { display: block; font-size: 0.78rem; color: var(--text-soft); margin-bottom: 5px; font-weight: 600; }
      .form input, .form textarea {
        width: 100%;
        background: #f8fafc;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        padding: 11px 12px;
        font-family: inherit; font-size: 0.92rem; color: var(--text);
        outline: none;
      }
      .form input:focus, .form textarea:focus { border-color: var(--accent); background: #fff; box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }
      .form textarea { min-height: 76px; resize: vertical; }
      .form .consent {
        display: flex; align-items: flex-start; gap: 9px;
        margin: 14px 0;
        font-size: 0.74rem; color: var(--text-muted); line-height: 1.45;
      }
      .form .consent input[type="checkbox"] {
        width: 15px; height: 15px; margin-top: 2px;
        accent-color: var(--accent); flex-shrink: 0;
      }
      .form .consent a { color: var(--accent); text-decoration: underline; }
      .form-error { color: #b91c1c; font-size: 0.82rem; min-height: 1.2em; margin-bottom: 8px; }
      .form button[type="submit"] {
        width: 100%;
        background: var(--dark); color: #fff;
        border: none; border-radius: var(--radius-sm);
        padding: 12px; font-weight: 700; font-size: 0.95rem;
        cursor: pointer; transition: background 0.12s;
      }
      .form button[type="submit"]:hover:not(:disabled) { background: #1e293b; }
      .form button[type="submit"]:disabled { opacity: 0.6; cursor: not-allowed; }

      /* ─── FOOTER ──────────────────────────────────────── */
      footer {
        background: var(--dark); color: #94a3b8;
        padding: 30px 0; text-align: center;
        font-size: 0.78rem;
      }
      footer a { color: #cbd5e1; }
      footer a:hover { color: #fff; }
      .footer-sep { margin: 0 8px; color: #475569; }

      /* ─── DEMO MODAL ──────────────────────────────────── */
      dialog#demoModal {
        border: none; border-radius: 18px; padding: 0;
        background: var(--dark); color: #fff;
        max-width: 720px; width: 92%;
        box-shadow: 0 30px 90px rgba(0,0,0,0.5);
      }
      dialog#demoModal::backdrop {
        background: rgba(15,23,42,0.6);
        backdrop-filter: blur(6px);
      }
      .demo-head { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #1e293b; }
      .demo-head h3 { font-size: 1rem; font-weight: 700; }
      .demo-close { background: transparent; border: none; color: #94a3b8; font-size: 1.4rem; cursor: pointer; line-height: 1; }
      .demo-close:hover { color: #fff; }
      .demo-body { padding: 20px; }
      .demo-placeholder {
        background: #1e293b; border-radius: 12px;
        aspect-ratio: 16 / 9;
        display: flex; align-items: center; justify-content: center;
        color: #cbd5e1; font-size: 0.95rem; text-align: center; padding: 20px;
      }

      /* ─── MOBILE ──────────────────────────────────────── */
      @media (max-width: 640px) {
        .nav-links { gap: 12px; font-size: 0.85rem; }
        .nav-links a:not(.nav-cta) { display: none; }
        .three-grid { grid-template-columns: 1fr; }
        .three-item + .three-item { border-left: none; border-top: 1px solid var(--border); }
        .jobs-grid { grid-template-columns: 1fr 1fr; }
        .jobs-grid .job-tile.accent { grid-column: 1 / -1; }
        .hero { padding: 56px 0 48px; }
        .start { padding: 48px 0; }
      }
      @media (max-width: 380px) {
        .jobs-grid { grid-template-columns: 1fr; }
        .jobs-grid .job-tile.accent { grid-column: auto; }
      }
    </style>
  </head>
  <body>

    <header>
      <div class="container nav">
        <a class="logo" href="#hero" aria-label="Just Got A Lead home">
          <img class="logo-mark" src="/portfolio/images/justgotalead.png" alt="Just Got A Lead" />
          <span class="logo-text">Just Got A Lead</span>
        </a>
        <nav class="nav-links" aria-label="Primary">
          <a href="#three-things">How it works</a>
          <a class="nav-cta" href="#start-free">Start free</a>
        </nav>
      </div>
    </header>

    <section class="hero" id="hero">
      <div class="container">
        <span class="eyebrow">⚡ Built for home-service owners</span>
        <h1>Get every lead. Answer every customer.<br />Stay in the field.</h1>
        <p class="sub">Calls, texts, web forms — captured and answered like you wrote them yourself. Estimates booked. Follow-ups sent. Without you at a desk.</p>
        <div class="hero-ctas">
          <a class="btn btn-primary" href="#start-free">Start free →</a>
          <button class="btn btn-secondary" type="button" id="openDemo">Watch 90-sec demo</button>
        </div>
        <p class="fine">No credit card · 14-day trial · Cancel anytime</p>
      </div>
    </section>

    <section class="three" id="three-things">
      <div class="container">
        <div class="label">The three things it does</div>
        <div class="three-grid">
          <div class="three-item">
            <div class="three-icon" aria-hidden="true">📞</div>
            <div class="three-title">Captures every lead</div>
            <div class="three-desc">Phone, text, web form. Nothing slips through.</div>
          </div>
          <div class="three-item">
            <div class="three-icon" aria-hidden="true">💬</div>
            <div class="three-title">Answers in your voice</div>
            <div class="three-desc">Trained on your business. Sounds like you.</div>
          </div>
          <div class="three-item">
            <div class="three-icon" aria-hidden="true">📅</div>
            <div class="three-title">Books the next step</div>
            <div class="three-desc">Follow-up, estimate, appointment — done.</div>
          </div>
        </div>
      </div>
    </section>

    <section class="jobs" id="jobs">
      <div class="container">
        <div class="jobs-head">
          <div class="jobs-eyebrow">What you get</div>
          <h2>9 jobs we handle for you</h2>
          <p class="sub">Every tile is a real pane in your dashboard. Set up once, then it runs.</p>
        </div>
        <div class="jobs-grid">
          <div class="job-tile"><div class="job-icon" aria-hidden="true">📞</div><div class="job-name">Calls picked up</div><div class="job-desc">Even at 9pm on a Saturday.</div></div>
          <div class="job-tile"><div class="job-icon" aria-hidden="true">💬</div><div class="job-name">Texts answered</div><div class="job-desc">Two-way SMS, in your voice.</div></div>
          <div class="job-tile"><div class="job-icon" aria-hidden="true">🌐</div><div class="job-name">Web forms captured</div><div class="job-desc">Drops the form on any site.</div></div>
          <div class="job-tile"><div class="job-icon" aria-hidden="true">✉️</div><div class="job-name">Follow-ups sent</div><div class="job-desc">Nudge cold leads, automatically.</div></div>
          <div class="job-tile"><div class="job-icon" aria-hidden="true">📅</div><div class="job-name">Estimates booked</div><div class="job-desc">Right into your calendar.</div></div>
          <div class="job-tile"><div class="job-icon" aria-hidden="true">📱</div><div class="job-name">Socials posted</div><div class="job-desc">Instagram + LinkedIn on autopilot.</div></div>
          <div class="job-tile"><div class="job-icon" aria-hidden="true">📚</div><div class="job-name">Your business knowledge</div><div class="job-desc">Train it once from your website.</div></div>
          <div class="job-tile"><div class="job-icon" aria-hidden="true">📣</div><div class="job-name">Email campaigns</div><div class="job-desc">Bulk send without spam flags.</div></div>
          <div class="job-tile accent"><div class="job-icon" aria-hidden="true">📊</div><div class="job-name">What's working</div><div class="job-desc">One dashboard. Real numbers.</div></div>
        </div>
      </div>
    </section>

    <section class="one">
      <div class="container">
        <div class="one-head">
          <h2>Everything in one place</h2>
        </div>
        <div class="one-frame">
          <div class="one-shot" id="dashShot">Dashboard preview — replace with a real screenshot when ready</div>
        </div>
      </div>
    </section>

    <section class="start" id="start-free">
      <div class="container">
        <div class="start-eyebrow">Start free</div>
        <h2>Try it on your next lead</h2>
        <p class="sub">Set it up in 15 minutes. The first lead pays for the year.</p>

        <form class="form" id="contactForm" novalidate>
          <div class="field">
            <label for="name">Your name</label>
            <input id="name" name="name" type="text" required autocomplete="name" />
          </div>
          <div class="field">
            <label for="email">Email</label>
            <input id="email" name="email" type="email" required autocomplete="email" />
          </div>
          <div class="field">
            <label for="phone">Phone <span style="color:var(--text-muted);font-weight:500;">(optional)</span></label>
            <input id="phone" name="phone" type="tel" autocomplete="tel" />
          </div>
          <div class="field">
            <label for="message">What do you want help with?</label>
            <textarea id="message" name="message" required rows="3"></textarea>
          </div>
          <label class="consent" for="sms_consent">
            <input type="checkbox" id="sms_consent" name="sms_consent" />
            <span id="sms_consent_text">
              <strong>(Optional)</strong> OK to text me about my inquiry. Reply STOP anytime.
              See our <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>
              and <a href="/terms" target="_blank" rel="noopener">SMS Terms</a>.
            </span>
          </label>
          <div class="form-error" id="formError" role="alert" aria-live="polite"></div>
          <button type="submit" id="submitBtn">Start free →</button>
        </form>
      </div>
    </section>

    <footer>
      <div class="container">
        © 2026 Just Got A Lead
        <span class="footer-sep">·</span>
        <a href="/privacy">Privacy</a>
        <span class="footer-sep">·</span>
        <a href="/terms">SMS Terms</a>
      </div>
    </footer>

    <dialog id="demoModal" aria-labelledby="demoTitle">
      <div class="demo-head">
        <h3 id="demoTitle">90-second demo</h3>
        <button class="demo-close" type="button" aria-label="Close" id="closeDemo">×</button>
      </div>
      <div class="demo-body">
        <div class="demo-placeholder">Demo video coming soon. Email <a style="color:#bfdbfe;text-decoration:underline;" href="mailto:hello@justgotalead.com">hello@justgotalead.com</a> for an invite.</div>
      </div>
    </dialog>

    <script>
      (function () {
        // ─── Demo modal ─────────────────────────────────────
        var dlg = document.getElementById("demoModal");
        var openBtn = document.getElementById("openDemo");
        var closeBtn = document.getElementById("closeDemo");
        if (openBtn && dlg) openBtn.addEventListener("click", function () { dlg.showModal(); });
        if (closeBtn && dlg) closeBtn.addEventListener("click", function () { dlg.close(); });
        if (dlg) dlg.addEventListener("click", function (e) {
          // close on backdrop click
          var r = dlg.getBoundingClientRect();
          if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
        });

        // ─── Contact form ───────────────────────────────────
        var form = document.getElementById("contactForm");
        if (!form) return;
        var errorEl = document.getElementById("formError");
        var submitBtn = document.getElementById("submitBtn");
        var consentEl = document.getElementById("sms_consent");
        var consentTextEl = document.getElementById("sms_consent_text");

        form.addEventListener("submit", async function (event) {
          event.preventDefault();
          errorEl.textContent = "";

          var fd = new FormData(form);
          var consentChecked = !!(consentEl && consentEl.checked);
          var consentText = "";
          if (consentChecked && consentTextEl) {
            consentText = (consentTextEl.innerText || consentTextEl.textContent || "")
              .replace(/\s+/g, " ")
              .trim();
          }

          var entry = {
            name:    (fd.get("name")    || "").toString().trim(),
            email:   (fd.get("email")   || "").toString().trim(),
            phone:   (fd.get("phone")   || "").toString().trim(),
            message: (fd.get("message") || "").toString().trim(),
            submit_date: new Date().toISOString(),
            sms_consent: consentChecked,
          };
          if (consentChecked) {
            entry.sms_consent_text = consentText;
            entry.sms_consent_at   = entry.submit_date;
          }

          submitBtn.disabled = true;
          var originalLabel = submitBtn.textContent;
          submitBtn.textContent = "Sending…";
          try {
            var res = await fetch("/blob-storage/email", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Accept": "application/json" },
              body: JSON.stringify({ values: [entry] }),
            });
            if (!res.ok) throw new Error("HTTP " + res.status);
            submitBtn.textContent = "Sent ✓";
            form.reset();
          } catch (err) {
            errorEl.textContent = "Could not submit right now. Please try again or email hello@justgotalead.com.";
            submitBtn.disabled = false;
            submitBtn.textContent = originalLabel;
          }
        });
      })();
    </script>
  </body>
</html>
```

- [ ] **Step 4: Verify no leftover "AI" text and rough line count**

Run:
```bash
grep -iE "\bAI\b|artificial intelligence" templates/portfolio/home.html
```
Expected: zero matches.

Run:
```bash
wc -l templates/portfolio/home.html
```
Expected: roughly 500–800 lines (target was ~700).

- [ ] **Step 5: Verify HTML is well-formed**

Run:
```bash
python3 -c "from html.parser import HTMLParser
import sys
class P(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.errors = []
    def handle_starttag(self, tag, attrs):
        if tag not in ('br','img','input','meta','link','hr'):
            self.stack.append(tag)
    def handle_endtag(self, tag):
        if not self.stack:
            self.errors.append('unexpected /'+tag)
            return
        if self.stack[-1] != tag:
            self.errors.append('mismatch open=' + self.stack[-1] + ' close=' + tag)
        else:
            self.stack.pop()
p = P()
p.feed(open('templates/portfolio/home.html').read())
print('open tags left:', p.stack[-5:] if p.stack else 'none')
print('errors:', p.errors[:5] if p.errors else 'none')"
```
Expected: `open tags left: none` and `errors: none`.

If anything is reported, re-read step 3 and look for a typo where you broke the tag balance.

### Task 2.2: Commit the rewrite

- [ ] **Step 1: Stage and commit**

Run:
```bash
cd /home/dpalacios/home-server
git add templates/portfolio/home.html .gitignore
git commit -m "$(cat <<'EOF'
portfolio: home.html redesigned around MECLABS heuristic

Replaces the 2,653-line home with a focused ~700-line page driven by
the spec at docs/superpowers/specs/2026-05-10-justgotalead-marketing-redesign-design.md.

What's new:
- Headline locked at "Get every lead. Answer every customer. Stay in
  the field." — three concrete owner-operator promises, no jargon.
- "Three things it does" strip under the hero gives skimmers the value
  prop in icons + one-liners (captures · answers in your voice · books).
- "9 jobs we handle for you" 3x3 grid; each tile maps to a real
  dashboard pane (Inbox, Replies, Lead Intake, Outreach, Schedule,
  Social Pipeline, KB, Campaigns, Activity).
- "One dashboard" section with a stylized placeholder until a real
  product screenshot is available.
- Contact form: phone is now optional, SMS consent checkbox is opt-in
  (form submission no longer blocked when unchecked), and the consent
  proof fields (timestamp, exact wording) are only included in the
  POST payload when the box is checked.
- Native <dialog> demo modal stubbed for the secondary CTA.

What's cut:
- "Problem in a real day" section
- Inline ROI calculator
- Inline pricing table (Pricing nav link removed; no /pricing page in
  scope this round)
- The word "AI" appears nowhere on the page

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

**▶ Phase 2 checkpoint:** restart the local stack (`~/run-all.sh` or honcho) so the C router picks up the new HTML. Open `https://127.0.0.1:9030/` in a browser. Confirm:
- New headline visible above the fold
- Both CTAs work (Start free anchors to `#start-free`, demo opens the modal)
- 9 tiles render in a 3×3 grid on desktop, 2×1 on mobile (resize the window or use devtools mobile preview)
- Form: phone field shows "(optional)", SMS checkbox is unchecked by default
- No console errors
- Footer links to `/privacy` and `/terms` work

If anything is off, edit `home.html` and commit a fix-up before continuing.

---

## Phase 3 — End-to-end verification

Quick sanity passes before declaring DONE.

### Task 3.1: Submit the contact form without SMS consent

- [ ] **Step 1: From a separate terminal, post to the form endpoint**

Run:
```bash
curl -k -i -X POST https://127.0.0.1:9030/blob-storage/email \
  -H "Content-Type: application/json" \
  -d '{"values":[{"name":"Test","email":"test@example.com","phone":"","message":"plan smoke test, SMS unchecked","submit_date":"2026-05-10T00:00:00Z","sms_consent":false}]}'
```
Expected: HTTP 200 (or whatever the existing endpoint returns on success — not a 4xx).

- [ ] **Step 2: Submit with SMS consent**

Run:
```bash
curl -k -i -X POST https://127.0.0.1:9030/blob-storage/email \
  -H "Content-Type: application/json" \
  -d '{"values":[{"name":"Test","email":"test@example.com","phone":"+15551234567","message":"plan smoke test, SMS checked","submit_date":"2026-05-10T00:00:00Z","sms_consent":true,"sms_consent_text":"(Optional) OK to text me...","sms_consent_at":"2026-05-10T00:00:00Z"}]}'
```
Expected: HTTP 200.

Both calls must succeed. If one fails, check the dashboard's `/blob-storage/email` Flask handler to confirm it accepts both shapes (the new optional-SMS shape should be a strict subset of the old, so it should "just work" — but verify).

### Task 3.2: Mobile viewport sanity check

- [ ] **Step 1: Open `https://127.0.0.1:9030/` in Chrome devtools**

In devtools → toggle device toolbar → set viewport to 360×800 (Pixel 5 baseline).

Walk the page top to bottom. Confirm:
- No horizontal scroll
- Hero text wraps cleanly
- 9-jobs grid is 2 columns (or 1 column on the narrowest breakpoint) — never a broken 3-column layout
- Form is full width inside its 380px max-width frame

If you see horizontal scroll, the most likely culprit is a long unbreakable word in the hero — wrap it with `<wbr>` or shorten.

### Task 3.3: Lighthouse pass

- [ ] **Step 1: Chrome devtools → Lighthouse → Performance + Accessibility, mobile preset, run audit**

Expected: Performance ≥ 90, Accessibility ≥ 95.

The page has no images aside from the logo and no JS framework, so this should be easy. If Performance < 90 the most likely cause is the Google Fonts request — preconnect is already in the spec but not added; you can add `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` to the `<head>` if needed.

If Accessibility < 95, the most likely cause is contrast on `.three-desc` or `.job-desc` against the cards. The plan's colors clear AA but verify.

### Task 3.4: Final visual sign-off (user-driven)

This task is a checkpoint, not a code change. Tell the user:

```
DONE. Open https://127.0.0.1:9030/ and click through:
  - Hero CTAs (Start free → form, Watch 90-sec demo → modal)
  - All 9 tiles render
  - Privacy + Terms links in footer
  - Submit the form with and without the SMS box checked
Tell me if anything needs tweaking. Once you say so I'll push and we
ship to prod.
```

Wait for user feedback. If they want changes, apply them inline and commit fix-up. When they say ship, you're done — they take it from here for the push + prod deploy.

---

## Acceptance criteria (from the spec)

A visitor on `https://justgotalead.com/`:
- [ ] Sees the new headline and the three CTAs above the fold
- [ ] Can scroll, see the 9 tiles, and click "Start free" without ever encountering the word "AI"
- [ ] Can submit the contact form **without** checking the SMS consent box (no error, success message returned)
- [ ] Sees an updated last-modified date on `/privacy` and `/terms` reflecting the optional-SMS change
- [ ] Reaches all CTAs via keyboard (tab order is correct, focus rings visible)
- [ ] Renders without horizontal scroll on a 360px viewport
- [ ] Lighthouse Performance score ≥ 90 on mobile

## Out of scope (will not be done in this plan)

- `/pricing` page — no plan task creates it
- `/try` redesign — the home page's primary CTA anchors to the inline `#start-free` form, not `/try`
- Dashboard or any other portfolio page (`customer-privacy.html`, `customer-terms.html`, `palacios.html`, `prospect_database.html`, `twiliobot.html`, `tst.html`, `home copy.html` — all untouched)
- Real demo video (placeholder modal ships)
- Real dashboard screenshot (stylized placeholder ships)
