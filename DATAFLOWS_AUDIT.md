# Dataflows Audit — home-server

Read-only audit of the `/etl` feature in the **home-server** repo (C web server + frontend templates).
Branch: `fix/dataflows-ui-ux`. Scope: correctness, link integrity, UX polish.
The DAG implementation is preserved as-is; this report only flags issues — no fixes applied.

---

## 1. Map of the feature

### 1.1 Routing (`routes/route.c`)

`/etl` GET → `templates/etl/home.html` via `get_live_html` (line 409–410).

Static asset GETs (`get_gol_script`) registered at lines 411–504:
- HTML/CSS: `home.css`, `notebook.css`, `jquery.flowchart.css`
- JS modules: `activities`, `import`, `filter`, `run`, `select`, `sort`, `stream`, `home-ui`, `join`,
  `custom_column`, `replace`, `fill`, `clean`, `dedupe`, `cast`, `regex`, `pivot`, `window`,
  `flatten`, `group`, `split`, `combine`, `append`, `google_sheets`, `dataflow`, `pipeline`,
  `http_request`, `jquery.flowchart`, `notebook`

Dynamic POST/GET routes (forwarded to `local-server` on port 5000 via the C bridge):
| Route | Method | Handler | Bridge fn |
| --- | --- | --- | --- |
| `/etl/pipeline/order` | POST | DAG topological sort | `post_run_activity` |
| `/etl/run/` | POST | Activity execution | `post_run_activity` |
| `/etl/call` | POST | HTTP request activity | `post_run_activity` |
| `/etl/sparkclient/stream` | POST | Stream SQL exec | `post_to_local` |
| `/etl/sparkclient/stream/execute` | POST | Stream multi-SQL | `post_to_local` |
| `/etl/sparkclient/stream/start` | POST | Stream init | `post_to_local` |
| `/etl/sparkclient/stream/execute/result` | GET | Stream result fetch | `get_from_local` |
| `/etl/google/login` | POST | Google OAuth start | `post_to_local` |
| `/etl/google/callback` | GET | OAuth callback | `get_from_local` |
| `/etl/google/status` | GET | OAuth status | `get_from_local` |
| `/etl/trigger/cron` | POST | Create cron trigger | `post_to_local` |
| `/etl/trigger/cron/delete` | POST | Delete cron trigger | `post_to_local` |
| `/etl/trigger/runs` | GET | Trigger run history | `get_from_local` |
| `/etl/pipeline/runs` | GET | Pipeline run history | `get_from_local` |
| `/etl/notebook/*` | various | Notebook kernel ops | `post_to_local` / `get_from_local` |
| `/blob-storage/*` | GET/POST | Stored dataflows / pipelines / triggers | `get_blob_storage_files` / `post_blob` |

The DAG implementation lives in `local-server/DAG.py`. The frontend calls `/etl/pipeline/order`
(DAG topological sort) before `/etl/run/` (sequential or dep-aware execution).

---

## 2. Findings

### 2.1 High priority — correctness & link integrity

#### H1. Host-header / port mismatch in `post_to_local`
File: `routes/local-server/POST/post_local_server.c:93–112`
```c
int sfd  = connect_to_local_server("127.0.0.1", "5000");
...
"Host: %s:%s\r\n"
...
"127.0.0.1", "5001", strlen(safe_body), safe_body);
```
Connects to **port 5000** but advertises `Host: 127.0.0.1:5001`. Flask currently ignores the
mismatch, but this is a real correctness bug and will break the moment anything (proxy,
WSGI server, security middleware) actually reads the `Host` header. Should be `5000`.

#### H2. `connect_to_local_server` may fall off the end without returning
File: `post_local_server.c:20–58`
The `for` loop in `connect_to_local_server` `break`s on **both** success and failure of the
first `addrinfo`, so subsequent addresses are never tried. Worse, if the very first address
fails, the function completes the loop, calls `freeaddrinfo`, evaluates the
`if (sfd>=0 && connected==0)` guard, and **returns nothing** for the failure case. C
implicitly returns whatever's in the return register — undefined behavior. The function is
declared `int` but has a missing `return -1;` on the failure path.

The bug then propagates: every caller (`post_to_local`, `get_from_local`,
`post_run_activity`, `post_to_local_no_reply`, `post_ctabustracker_getpredictions`,
`post_generate_phrase`) uses the returned `sfd` in `send/recv` without checking
`sfd >= 0` first. Only `post_to_local_no_reply` checks. A failed connection therefore
either silently corrupts memory or crashes.

#### H3. `post_run_activity` returns 202 immediately for non-preview runs
File: `post_local_server.c:342–371`
```c
if (strstr(route, "/etl/run") != NULL && strstr(body, "\"preview\":true") == NULL) {
    char response_body[] = "{\"status\":\"accepted\"}";
    send_JSON_response_code(socket->cSSL, 200, response_body);
    close(sfd);
    return;
}
```
This is a deliberate fire-and-forget for non-preview runs (UI shouldn't block on long Spark
jobs). Two issues:
1. The substring check `strstr(route, "/etl/run")` matches `/etl/run/`, but it would also
   match an unrelated future route containing `/etl/run` as a prefix. Tighten the check.
2. The body substring `"\"preview\":true"` is brittle: it misses `"preview" : true`,
   `"preview":1`, capitalized JSON, escaped variants, or chunked bodies. Should parse JSON.
3. The 202 status is sent as `200 OK` (`send_JSON_response_code(... 200, ...)`) but the
   client (`run.js` line 551) checks for `data.status === "accepted"`. The status code in
   the C call is misleading — RFC suggests 202 here.
4. After the early return, the data still streams from local-server but is **discarded**:
   the buf-loop in lines 373–410 is skipped. That's the intent, but `recv` on a closed
   socket where `local-server` is mid-write may yield ECONNRESET on the local side —
   non-fatal, but check `local-server` logs noise.

#### H4. `connect_to_local_server` always uses 5000, but `route.c` callers expect different services
The bridge functions hardcode `127.0.0.1:5000`. The Python entry is `local-server.py`. Any
local-server port change requires editing C source. Consider reading from an env var or a
config string analogous to `ETL_SERVER_ADDR` on the Python side (`local-server.py:38`).

#### H5. `home.css`, `notebook.css`, `jquery.flowchart.css` served via `get_gol_script`
File: `routes/route.c:427, 471, 503`
The `get_gol_script` handler is named for serving JS — if it sets `Content-Type` to
`application/javascript`, browsers may reject the CSS (or accept with a console warning).
**Verify Content-Type** in `get_gol_script`. If it's a generic file handler, this is fine;
if it's JS-specific, CSS routes need a CSS-aware variant (`get_gol_style` or similar).

#### H6. Truncated/broken HTML attribute on Cancel button
File: `templates/etl/home.html:377–378`
```html
<button type="button" cl
ass="trigger-modal__btn trigger-modal__btn--ghost" data-trigger-close>Cancel</button>
```
Newline injected mid-attribute — browser parses `cl` as one attribute and `ass=...` as the
next. The Cancel button does close the modal (because `data-trigger-close` is intact), but
the styling is broken (no class applied). Visual regression in the trigger modal footer.

#### H7. `jquery.flowchart.min.js` is empty
File: `templates/etl/jquery.flowchart.min.js` is **0 bytes** while the non-min file
(`jquery.flowchart.js`) is 86 KB. `home.html:22` loads the non-min one, so this is currently
unused — but the empty stub is misleading and should be either populated or deleted.
Same risk for `jquery.flowchart.min.css` (3.6 KB stub, unused).

#### H8. `panzoom.js` exists in the templates directory but is not registered in `route.c`
File: `templates/etl/panzoom.js` (12 KB) and `panzoom.js:Zone.Identifier` (a Windows ADS
file leakage). `panzoom.js` is not loaded by `home.html` and not registered in `route.c`.
Either remove it or register and use it. The `Zone.Identifier` file is debris from a Windows
download and should be deleted.

#### H9. `export.js` and `__home.html` exist but are not registered
- `export.js` (1.8 KB) — not in `route.c`, not loaded by `home.html`. Dead code or broken link.
- `__home.html` (9.9 KB) — looks like a stale draft.
- `t.html` (2.3 KB) — scratch file.
- `demo.html:Zone.Identifier` — ADS leakage.

These should be removed unless they're intentional.

---

### 2.2 Medium priority — UX & consistency

#### M1. Confusing terminology: "Aggregate" vs "Group"
- Sidebar HTML hidden button id: `aggregate_activity` (`home.html:112`)
- Click handler: `home-ui.js:6421` (`#aggregate_activity`)
- `activityType: "group"` (set inline at `home-ui.js:6430`)
- File: `templates/etl/group.js` → class `Group_Activity`
- Backend op: `local-server.py` → `handle_group`
- Title shown in operator: `"Aggregate"`
- Pivot.js refers to it as `"Aggregate"` in its config too (`pivot.js:95`)

The chain works because every translation step is consistent, but the trail mixes
terminology and is hard to follow. Pick one ("Group" or "Aggregate") and use it everywhere
or document the mapping.

#### M2. Heavy duplication between `dataflow.js` and `pipeline.js`
The `Pipeline_Activity._get_dataflows` method in `pipeline.js:9–14` is named after the
dataflow case but actually returns pipelines. Both classes are ~95% the same — only
labels and storage path keys differ. Risk: changes to one drift from the other.
Suggest a common base class once you're past audit, or at minimum rename
`Pipeline_Activity._get_dataflows` → `_get_pipelines` for clarity.

#### M3. `run.js`: large blocks of commented-out code
- `execute_activity` (~lines 580–635) has the entire body commented out except
  for a `get_ordered_nodes` call.
- `execute` (~lines 640–689) is just `alert("Not yet implemented")` with the rest commented out.

Either delete these or finish them. They're reachable from the UI? — `run_pipeline` button
calls a different function, but `execute*` are easy to wire up by mistake.

#### M4. Hardcoded Google OAuth client ID and `127.0.0.1:5000` redirect
File: `templates/etl/home.html:412–417`
```js
window.GOOGLE_OAUTH_CONFIG = {
  client_id: "639323802562-…",
  redirect_uri: "http://127.0.0.1:5000/etl/google/callback",
  ...
};
```
For a localhost demo, fine — but flag it: anyone deploying this to a non-loopback host
gets a redirect_uri mismatch. Externalize before public exposure. Verify that the client
secret is **not** shipped with the page (only public `client_id` should be).

#### M5. `run.js`: `(sinkData == null || sinkData === [])` is always truthy on the second clause
File: `run.js:292, 367, 563` (three identical sites). `sinkData === []` is always `false`
because each `[]` is a fresh array reference. Intent appears to be "is empty array"; should
be `(Array.isArray(sinkData) && sinkData.length === 0)`. As-is, the second clause is dead
code, but the first `sinkData == null` covers both `null` and `undefined`, which is the
common path — so the bug rarely manifests. Still wrong.

#### M6. `run.js:496–500`: target_ids selection logic is subtle
```js
if (activityType == 'sheets_write' || activityType == 'http_sink'){
    target_ids.push(key)
}
...
if (target_ids.length === 0) {
    target_ids = Object.keys(dependencies);
}
if (Array.isArray(targetIds) && targetIds.length > 0) {
    target_ids = targetIds.map(id => id.toString())
}
```
The fallback "no sinks → all nodes" makes sense for runs with no terminal sink, but should
be documented or named. Also: when `targetIds` is explicitly passed, it overrides the sink
detection; that ordering deserves a comment.

#### M7. Inconsistent naming: `activity_type` vs `activityType`
The frontend uses `activityType` throughout (camelCase) while the run payload uses
`activity_type` in some places and `activityType` in others
(`run.js:432, 439`). The backend accepts both
(`local-server.py:3125, 3225, 3310, 3351`), but the asymmetry is fragile. Pick one and stick
with it (recommended: keep `activityType` for the in-memory operator object; use
`activity_type` only on the wire for legacy compat).

#### M8. `run.js:529`: `post_ordered_activities` ignores `httpSinkActivities` when accepted
The path returns immediately on `data.status === "accepted"` (line 552–553), so the
`for (const sink of httpSinkActivities)` loop in lines 561–573 never runs for non-preview
runs. That's by design (server triggers sinks), but means the http-sink retry logic on the
client only fires for preview, where it shouldn't be needed. Confirm this matches intent.

#### M9. UX: "Run Flow" button has no progress / no way to know the run finished
With `H3`'s fire-and-forget behavior, the user clicks Run Flow → gets 200 → and has nothing
visible until they tab to "Test Runs". Recommend a toast / status pill that tracks the
ID returned in `payload.run_id` (already supported in `local-server.py:3461`).

---

### 2.3 Low priority — code health

#### L1. `home-ui.js` is **276 KB** (5+ thousand lines)
Hard to maintain. Many activity click handlers (`#X_activity`) are near-identical — the
sequence at lines 6304–7100 is heavy duplication. Consider a registry pattern post-audit.

#### L2. Magic numbers and inline styling in `home.html`
Lines 204+ have inline `style="..."` blobs that override `home.css`. Particularly the navbar
gradient, padding, and z-index at line 204.

#### L3. CodeMirror, marked, Chart.js loaded but only used in `notebook.js`
`home.html:11–28` always loads ~1 MB of external resources for non-notebook users. Defer or
guard behind notebook-first navigation.

#### L4. SVG icons in `home.html` are inline copies — many duplicates
The dataflow / pipeline / stream icons in `tab_activities` (lines 247–264) are visually
identical. Use a single sprite.

---

## 3. Frontend ↔ backend contract summary

| Frontend call | Backend handler | Status |
| --- | --- | --- |
| POST `/etl/pipeline/order` | `local-server.py:get_ordered_nodes` (3658) | Works; uses DAG.py |
| POST `/etl/run/` | `local-server.py:run` (3451) | Works; fire-and-forget for non-preview |
| POST `/etl/call` | `local-server.py:call_api` (3573) | Wraps `perform_http_call` |
| POST `/etl/sparkclient/process` | `local-server.py:process` (3674) | Registered in Python but **not registered in C `route.c`** — frontend cannot reach it directly. |
| POST `/etl/sparkclient/stream/restart` | `local-server.py:1604` | **Not registered in C `route.c`** — frontend cannot reach. |
| POST `/etl/trigger/run` | `local-server.py:run_trigger` (3527) | **Not registered in C `route.c`** — only invoked by cron itself, so OK. |

These three Python-only routes are reachable only from `local-server` itself or a direct
caller. Confirm whether the frontend is supposed to call any of them; if so, add to
`route.c`.

---

## 4. Recommended fix batches (Phase 3 plan)

Ordered by risk & dependency:

1. **Bridge correctness (C)** — H1, H2, H4: fix host-header port, return -1 on connect
   failure, gate all callers on `sfd >= 0`. Pull `127.0.0.1:5000` into a config constant.
2. **Static asset MIME (C)** — H5: verify/fix Content-Type for CSS routes.
3. **HTML correctness (frontend)** — H6 (Cancel button), H8 / H9 (delete dead files,
   `Zone.Identifier` files, empty `.min.js`).
4. **Run flow correctness (C + JS)** — H3: tighten substring checks, switch 200→202 with
   matching client logic; M5 (`=== []` dead clause); M8 (sink retry flow).
5. **UX polish** — M9 (run progress toast); L2/L3 (defer external libs).
6. **Naming & cleanup** — M1 (Group/Aggregate), M2 (rename Pipeline_Activity helper),
   M3 (delete dead `execute*`), L1 (registry pattern, optional).

Each batch should be a separate commit per repo.

---

## 5. Out of scope (explicitly preserved)

- DAG topological sort algorithm in `local-server/DAG.py` — not modified.
- Activity processing pipeline in `local-server.py` (`apply_operations`,
  `execute_activity_list`) — not modified.
- The flowchart UI library (`jquery.flowchart.js`) — vendored, leave alone.
- Spark session lifecycle.

---

## 6. Test plan (Phase 4 preview)

For each activity in `home.html` activity buttons, a smoke test:
1. Drag onto canvas → properties panel opens, no console errors.
2. Configure sample settings → click Run Flow → see results in Data Preview.
3. Connect two activities → Run Flow → DAG ordering correct.
4. Save dataflow → reload → settings persist.
5. Trigger schedule → cron writes to `/etl/trigger/runs`.

Activities to cover (24): import, http_request, google_sheets (read+write), filter, sort,
select, custom_column, replace, fill, clean, dedupe, cast, regex, pivot, window, flatten,
group/aggregate, split, combine, append, join, http_sink, dataflow (nested), pipeline (nested),
stream.
