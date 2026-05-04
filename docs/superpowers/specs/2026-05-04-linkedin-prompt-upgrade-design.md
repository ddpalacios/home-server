# LinkedIn Post Prompt Upgrade — Design Doc

**Date**: 2026-05-04
**Owner**: Daniel Palacios
**Status**: Approved for implementation, phased

## Problem

The existing LinkedIn batch generator produces posts that are correctly
structured but feel AI-flavored. Three gaps:

1. **The brief is hard to fill.** Topic, audience, role-perspective, and
   key-points each need their own paragraph, written by hand for every batch.
2. **The generator has no real audience voice.** It reasons from the brief
   and the user's voice rules, but it never sees what real people in the
   audience are actually saying about the problem.
3. **Variety is structural but invisible.** The 4-mix system samples hook /
   tone / format / CTA per post, but the result is uniformly "smart and
   useful." It misses the emotional registers that drive saves on LinkedIn
   (validate / inspire / provoke curiosity), and it doesn't bake in the
   2026 best-practice rules a real practitioner would follow.

## Goals

- Cut the per-batch typing cost without losing user control over the brief.
- Ground every batch in real audience-voice from Reddit so posts echo the
  pain people actually have, not a paraphrase of the user's hypothesis.
- Bake explicit LinkedIn 2026 algorithm rules into the system prompt so
  posts respect the platform's current dynamics by default.
- Add an emotional-register dimension so posts vary on a fifth axis the
  algorithm rewards.

## Non-goals (out of scope for this design)

- A/B testing two batches side by side. (In the original spec; deferred to
  a later phase once the upgraded baseline ships.)
- Metrics-logging UI for impressions / comments / saves. (Deferred.)
- Multi-language support. (Single-language English assumed.)
- LinkedIn-side scraping of analytics data. (Manual entry from a future
  metrics UI is the path.)

## High-level flow (after this design ships)

```
1. User clicks "Plan the month" → existing modal
2. User clicks Continue → AI drafts them
3. NEW: Strategy wizard modal — three textareas:
       - Target audience
       - The problem you solve
       - Your offer
   Pre-filled from saved strategy_profile if present.
   Save & continue / Continue without saving / Cancel.

4. NEW: Auto-fill step (cheap LLM call)
   - Takes the three inputs, returns the four brief fields
     (main_topic, audience, role_perspective, key_points).
   - User lands on the existing "Make posts" screen, BRIEF pre-filled.
   - User can edit anything before generating.

5. User clicks Generate batch → existing endpoint, with new flow:
   a. NEW: extract 3-5 reddit search queries from the brief
      (cheap LLM call).
   b. NEW: fetch reddit threads matching those queries via the public
      JSON endpoints. ~20-30 candidates.
   c. NEW: distill candidates into 8-12 paraphrased pain statements
      (cheap LLM call).
   d. Existing chunked LLM call to gpt-4o, but now with:
      - System prompt has new bucket-2 rules baked in.
      - User prompt has a new Layer D (audience voice) injected
        between voice rules and assignments.
      - Per-post assignments now include a fifth dimension:
        emotional_register (validate / inspire / provoke_curiosity).
   e. Existing review grid shows posts; cards now display the new
      emotional_register stamp and tag_suggestion if any.
```

The user sees one extra step (the strategy wizard) and an extra few
seconds of "fetching insights..." between brief approval and posts
appearing. Everything else is the same flow.

---

## Phase 1 — System prompt + per-post schema upgrades

**Goal:** strengthen the LLM's instructions and add the new fields to the
output schema, with no UI changes. After this phase, the existing form
still works the same way; output quality goes up; new fields appear
on each post for downstream phases to use.

### Files

- `/home/dpalacios/local-server/server/app.py`
  - Update `_AI_BATCH_SYSTEM_PROMPT` (line ~3905) — see "New system
    prompt sections" below.
  - Add `_AI_EMOTIONAL_OPTIONS = ("validate", "inspire", "provoke_curiosity")`.
  - Update `_AI_EMOTIONAL_PRESETS` with default mix.
  - Update `_sample_assignments` to include emotional dimension.
  - Update `_format_assignments_block` to include `emotional` per post.
  - Update `_ai_validate_post` to allow new optional fields.
  - Update post-construction in `dashboard_linkedin_ai_draft_generate`
    to extract emotional_register and tag_suggestion from the LLM
    response and stamp them on the saved post.

### New system prompt sections

Add or modify the following blocks in `_AI_BATCH_SYSTEM_PROMPT`:

**Voice rules (bucket-2 item #5)**

```
PERSONAL VOICE (every post)
- Write in first person from the user's vantage. Never write as if a
  company is speaking. "I" and "my team" beat "we at Acme."
- Conversational, not corporate. Banned words: leverage, synergize,
  optimize, ecosystem, stakeholder, value-add, holistic, mission-critical,
  game-changer, paradigm. If a phrase would fit in a McKinsey slide,
  rewrite it as something you'd say in a coffee shop.
```

**Emotional register (bucket-2 item #2)**

```
EMOTIONAL REGISTER (every post)
- Every post must do one of three things to the reader:
  - validate: name a feeling or experience the reader knows is theirs
    but rarely sees admitted out loud. ("If you've ever sat in a quote
    review knowing you were going to lose the deal, you know.")
  - inspire: paint a specific, modest, believable better state and a
    concrete first step toward it.
  - provoke_curiosity: open an information gap the reader has to
    resolve. The hook promises a reveal; the body delivers it.
- The per-post assignment specifies which register applies to each post.
- A post can use multiple registers but its dominant register must
  match the assignment.
```

**Length constraints diverge by media (bucket-2 item #1)**

```
LENGTH BY POST FORMAT
- If the post will have an image, video, or carousel attached:
  meat 800-2000 chars (existing rule).
- If the post is text-only:
  total composed caption (hook + meat + cta) under 1200 chars.
  meat shrinks to 500-900 chars.
- The per-post assignment includes a "media_planned" flag the user
  set; respect it.
```

**Tag suggestion (bucket-2 item #4)**

```
TAG SUGGESTIONS
- For each post, identify ONE company name or one well-known
  individual whose mention would be relevant to the post's content
  AND a real connection (collaboration, customer, mentor, public
  figure they discuss). Surface as `tag_suggestion`. Never invent
  fake names. Empty string is allowed and preferred when no real
  connection exists.
- Do NOT inject @ tags into the post body. Tag suggestions are
  metadata for the user to act on at publish time.
```

**Output schema additions**

```
OUTPUT FORMAT (JSON only)
{
  "posts": [
    {
      "hook": "...",
      "hook_type": "problem|negative|curiosity|benefit|us_vs_them|urgency",
      "meat": "...",
      "tone": "conversational|authoritative|contrarian|reflective",
      "format": "personal_story|list_with_payoff|contrarian_take|data_point",
      "cta": "...",
      "cta_style": "open_question|save_this|direct_invitation|bold_statement",
      "angle": "...",
      "emotional_register": "validate|inspire|provoke_curiosity",  ← NEW
      "tag_suggestion": "string or empty string",                  ← NEW
      "media_suggestion": { "type": "...", "concept": "..." }
    }
  ]
}
```

### Per-post assignment matrix

The current matrix samples 4 dimensions per post. Phase 1 adds a 5th:

```
Post 1: hook=problem, tone=conversational, format=personal_story,
        cta=save_this, emotional=validate
Post 2: hook=curiosity, tone=authoritative, format=list_with_payoff,
        cta=open_question, emotional=provoke_curiosity
...
```

Default emotional preset: `{validate: 40, inspire: 30, provoke_curiosity: 30}`.
The user can override via a new slider section in the Advanced panel
(Phase 2 ships the slider).

### Acceptance for Phase 1

- `_AI_BATCH_SYSTEM_PROMPT` contains the four new sections above.
- Generated posts return `emotional_register` and `tag_suggestion`.
- Posts persist with the new fields on the AI-draft JSON.
- Validation does not reject posts that include the new fields.
- Existing UI continues to work; new fields are passively stored.

---

## Phase 2 — Strategy wizard + brief auto-fill

**Goal:** the user types three high-level textareas instead of four
specific ones; an LLM call fills the four-field brief from those three.

### Storage

- `strategy_profile.json` per LinkedIn account.
- Path: `CRMAssistBot/{cid}/connected_accounts/{platform}/{account_id}/strategy_profile.json`
- Schema:
  ```json
  {
    "audience": "string",
    "problem": "string",
    "offer": "string",
    "last_edited": 1714000000
  }
  ```
- Loader: returns `{audience: "", problem: "", offer: ""}` if missing.

### New endpoints

```
GET  /dashboard/linkedin/api/strategy-profile
     → 200 {profile: {audience, problem, offer, last_edited}}

POST /dashboard/linkedin/api/strategy-profile
     body: {audience, problem, offer}
     → 200 {profile: {...}}

POST /dashboard/linkedin/api/ai-draft/auto-brief
     body: {audience, problem, offer, num_posts}
     → 200 {brief: {main_topic, audience, role_perspective, key_points: [...]}}
```

### Meta-prompt for `_ai_generate_brief`

Cheap model: `gpt-4o-mini`. Returns JSON with the four brief fields.
Full template lives in `app.py` as `_AI_BRIEF_META_PROMPT`. See spec
"FIELD GUIDANCE" block in the original prompt.

### Frontend changes

- New modal `aiOpenStrategyWizard()` in `dashboard_linkedin.html`.
- Triggered after the user picks "AI drafts them" from the planner OR
  from the "Make posts" overview if no plan is active.
- Three textareas (audience / problem / offer), pre-filled from saved
  profile via the GET endpoint.
- Three buttons: Save & continue (POST + advance), Continue without
  saving (advance only), Cancel.
- On Save & continue or Continue without saving:
  - Show a "Filling in the details..." loading state.
  - POST `/auto-brief` to get the four brief fields.
  - Pre-fill the existing AI form (`ai-topic`, `ai-audience`, `ai-role`,
    `ai-points`) with the returned values.
  - Show the existing AI form so user can review/edit/generate.

### Acceptance for Phase 2

- Strategy modal renders with saved profile values pre-filled.
- Save & continue persists to GCS at the right path.
- Continue without saving doesn't write.
- After auto-brief completes, the four AI form fields are populated.
- User can edit any field before generation.
- Generation flow itself is unchanged.

---

## Phase 3 — Reddit insight engine

**Goal:** every batch grounds itself in real audience voice pulled from
Reddit at generation time.

### Pipeline

```
brief (4 fields) → search-query extractor → reddit fetch → distiller → 8-12 insights
```

### Components

**`_ai_extract_search_queries(brief)` (cheap LLM call)**

Prompt: "Given this LinkedIn batch brief, list 3-5 Reddit search queries
a researcher would use to find people complaining about this exact
problem. Return JSON `{queries: [...]}`. Each query is 3-7 words. Avoid
brand-names of products the user sells."

**`_li_reddit_search(queries)` (HTTP, no LLM)**

For each query, hit:
```
https://www.reddit.com/search.json?q=<query>&sort=top&t=month&limit=15
```

Reddit's public JSON endpoint accepts unauthenticated requests at a
generous rate (~60/min). Headers: User-Agent identifying the app.

Returns a flat list of candidate threads with `{subreddit, title, body,
top_comments[]}`. We pull top 3 comments per thread via:
```
https://www.reddit.com/r/<sub>/comments/<id>.json?limit=20
```

Filter:
- Subreddits with member count under 5000 dropped (low-signal).
- Threads with score under 20 dropped.
- NSFW / locked threads dropped.
- Dedupe by thread ID across queries.
- Cap at 20 candidates total per batch (prevents distill cost blowup).

**`_li_distill_reddit_insights(candidates)` (cheap LLM call)**

Prompt: "Given these Reddit threads, extract 8-12 PARAPHRASED pain
statements that capture what real people are saying about this problem.
Each insight is one sentence. Specific over generic. Real numbers and
real moments preferred. Do not quote any text verbatim. Do not name
Reddit, subreddit names, or any usernames. Return JSON
`{insights: [...]}`."

**Layer D in `_ai_build_user_prompt`**

```
RECENT AUDIENCE VOICE (paraphrased from real conversations):
- {insight 1}
- {insight 2}
- ...

Use these as raw material. Reference the SPECIFIC pain in your hook
when it fits a post's assignment. Do not quote verbatim. Do not name
Reddit or any other source. The audience-voice insights are shared
across all posts in this batch; you choose which ones fit which post.
```

### Storage

Insights are batch-scoped: the array is saved on the AI-draft JSON
under `audience_insights` so the user can see what the LLM was working
with later.

### Frontend changes

After "Generate batch" click but before posts arrive:
- Show a step indicator: "Listening to your audience..." (Reddit fetch)
  and "Reading what they said..." (distill).
- Total budget: 8-12 seconds typical, 25 second hard timeout. If timeout
  hits, skip the layer and proceed without insights (toast: "Couldn't
  reach Reddit; generated without external context.").

### Failure modes

- Reddit returns 429 → retry once with 2s backoff, then skip.
- Reddit returns empty → skip the layer, generate without it. The
  failure is silent on the post-generation side; the user sees a notice
  in the review screen ("No external insights this batch — Reddit had
  nothing on this topic").
- Distiller returns malformed JSON → retry once stripped of fences,
  then skip the layer.

### Acceptance for Phase 3

- Brief auto-fill flow proceeds → reddit fetch fires automatically.
- 8-12 distilled insights surface on the AI-draft record under
  `audience_insights`.
- The system prompt's Layer D includes them when posts generate.
- Failure paths degrade gracefully; the user always gets posts.
- Posts visibly reference specific Reddit pain points (we'll
  validate this manually on a few batches before declaring done).

---

## Risks

1. **Reddit ToS gray area.** Public JSON endpoints are documented for
   read-only access. We're not republishing Reddit content — we're
   distilling paraphrased patterns into our own LLM prompt. Low risk
   but worth watching. If Reddit ever requires API keys for this
   endpoint, we'll move to PRAW with OAuth credentials.

2. **Cost creep.** Each batch now fires 3-4 cheap calls (auto-brief,
   query extract, distill, possibly a retry) plus the existing chunked
   gpt-4o calls. A 47-post batch goes from 4 calls to ~7-8. With
   gpt-4o-mini for the cheap ones, total cost-per-batch goes from
   ~$0.40 to ~$0.55. Acceptable.

3. **Latency.** End-to-end batch time goes from ~30s to ~45-50s with
   Reddit pulls. The Reddit pull is the slowest 5-15s segment. We'll
   surface a clear progress step so the user sees motion.

4. **Insight quality drift.** The distiller is cheap-model. If insights
   are noisy, posts will be noisy. We'll log every distilled insight set
   so we can sample-review and tune the distiller prompt.

5. **Prompt fattening.** Layer D adds 8-12 lines to every batch prompt.
   gpt-4o has plenty of context. Not a concern.

## Implementation order

- **Phase 1** (this commit): system prompt rules + emotional dimension
  + tag suggestion + length-by-format. Backend only. Existing UI
  passes through.
- **Phase 2**: strategy wizard + auto-brief. UI changes; backend
  endpoints added.
- **Phase 3**: Reddit fetch + distill. Backend pipeline + UI progress
  indicators on the existing review flow.

Each phase is shippable on its own. Phase 1 alone improves output
quality; Phase 2 alone speeds brief authoring; Phase 3 alone grounds
posts. Combined, they hit all three goals.

## Open question to revisit later

After Phase 3 runs in production for two weeks: do users want the
A/B testing flow (relevance-emphasis vs problem-specificity emphasis)
on top of the Reddit baseline? That's a separate phase if so.
