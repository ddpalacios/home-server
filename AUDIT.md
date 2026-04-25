# home-server Pipeline Audit

**Scope:** /etl C-side proxy + browser frontend under `templates/etl/`.
**Goal:** correctness, link integrity, UX polish — preserve current DAG implementation.
**Date:** 2026-04-25
**Phase:** 1 (read-only). Awaiting approval before fixes.

Verified facts:
- Python backend listens on **port 5000** (`local-server.py:3817` → `serve(app, host="0.0.0.0", port=5000)`).
- All C proxy calls connect to `127.0.0.1:5000` (consistent).
- `#flowchart_data` DOM id is referenced in JS but does not exist in `home.html`.
- `home.html:377-378` literally contains `<button type="button" cl\n        ass=...` (attribute split across a newline).

Severity legend: **BUG** = wrong behavior · **LINK** = path/handler mismatch or broken anchor · **UX** = polish · **MINOR** = noise/dead code.

---

## 1. Endpoint inventory (C → Python)

`route.c` dispatches the following /etl paths to the Python backend on 127.0.0.1:5000:

| Method | Path                                      | C handler              | route.c |
|--------|-------------------------------------------|------------------------|---------|
| POST   | /etl/pipeline/order                       | `post_run_activity`    | 473     |
| POST   | /etl/run/                                 | `post_run_activity`    | 475     |
| POST   | /etl/call                                 | `post_run_activity`    | 477     |
| POST   | /etl/sparkclient/stream                   | `post_to_local`        | 479     |
| POST   | /etl/sparkclient/stream/execute           | `post_to_local`        | 481     |
| POST   | /etl/sparkclient/stream/start             | `post_to_local`        | 483     |
| GET    | /etl/sparkclient/stream/execute/result    | `get_from_local`       | 485     |
| POST   | /etl/google/login                         | `post_to_local`        | 487     |
| POST   | /etl/trigger/cron                         | `post_to_local`        | 489     |
| POST   | /etl/trigger/cron/delete                  | `post_to_local`        | 491     |
| GET    | /etl/trigger/runs                         | `get_from_local`       | 493     |
| GET    | /etl/pipeline/runs                        | `get_from_local`       | 495     |
| GET    | /etl/google/status                        | `get_from_local`       | 497     |
| GET    | /etl/google/callback                      | `get_from_local`       | 499     |
| POST   | /etl/notebook/{execute,cancel,restart,save,delete} | `post_to_local` | 505–513 |
| GET    | /etl/notebook/{load,list,variables,export,dataframe/csv,spark/status} | `get_from_local` | 515–525 |

Cross-check: every path the frontend calls (see §3) resolves on the C side, **except** the trigger-run path (frontend has no client for `/etl/trigger/run` — it only schedules cron, never runs synchronously). Acceptable.

Mismatch with Python (verified during local-server audit): Python exposes `/etl/sparkclient/process` — **no C route forwards this**. `/etl/sparkclient/stream/restart` exists in Python (1604) — also not forwarded. Severity LINK; see §4.

---

## 2. C-side findings (`route.c`, `HTTP.c`, `routes/local-server/POST/post_local_server.c`)

### Critical correctness

1. **BUG — uninitialized `sfd` / `connected` in `connect_to_local_server`**
   `post_local_server.c:29`. On `getaddrinfo` failure or empty `addrs_res`, both vars are read uninitialized at line 55, then returned. UB.
   *Fix:* `int sfd = -1, connected = -1;` and check `getaddrinfo` status (line 28).

2. **BUG — proxy functions never check `connect_to_local_server` for failure**
   `post_local_server.c:61, 76, 94, 161, 190, 343` — every caller proceeds to `send`/`recv` even when `sfd < 0`.
   *Fix:* `if (sfd < 0) return;` immediately after every call site.

3. **BUG — `connect_to_local_server` never advances past the first address**
   `post_local_server.c:30–53`. Unconditional `break`s on lines 43 and 51 prevent the loop from trying alternative `addrs_res` entries.
   *Fix:* break only on `connected == 0` (success) or fatal error.

4. ~~**BUG — function-signature mismatch for `send_response_code` / `send_JSON_response_code`**~~ **CORRECTION (Phase 3 verification): false alarm.**
   The relevant TUs (`route.c`, `post_local_server.c`) include `utilities/http_utilities.h`, whose signatures `send_response_code(SSL*, int)` and `send_JSON_response_code(SSL*, int, char*)` match every call site. The conflicting `routes/HTTP.h` / `routes/HTTP.c` are **not in `CMakeLists.txt`** and never linked — orphan code.
   *Action:* delete `routes/HTTP.c` and `routes/HTTP.h` in batch H7. Items §2.8–11 (HTTP.c memory bugs) are also dead code and removed by deletion.

5. **BUG — hard-coded `200` status on every proxied response**
   `post_local_server.c:147, 271, 368, 403`. Errors from the Python backend (400/401/500/502) are swallowed and returned as 200 to the browser — frontend cannot detect failures.
   *Fix:* Parse `HTTP/1.x NNN ` from the first line of the upstream response and pass `NNN` to `send_*_response_code`.

6. **BUG — `recv` errors indistinguishable from clean close**
   `post_local_server.c:121–123, 213–215, 378–380`. `<= 0` lumps EOF and `EINTR/ECONNRESET` together.
   *Fix:* on `< 0` call `perror("recv")` and abort the response (don't send a partial body as 200).

7. **BUG — unbounded response buffer on `realloc` failure**
   `post_local_server.c:124, 216, 381`. If `realloc` returns NULL, `tmp` is NULL but `response` leaks. No max cap → OOM risk on very large notebook outputs.
   *Fix:* `if (!tmp) { free(response); /*close socket*/ return; }`. Add a sane cap (e.g., 64 MB).

8. **BUG — `cJSON_Parse` results never freed in `HTTP.c`**
   `HTTP.c:64–70, 74–80, 85–91` (`get_*_value_from_json`). Each call leaks the parsed tree.
   *Fix:* `cJSON_Delete(json);` before each return.

9. **BUG — null deref in `retrieve_request_body`**
   `HTTP.c:52`. `strchr(requestBody, '}')` may return NULL; line 53 dereferences without check.
   *Fix:* `if (!end) return NULL;`.

10. **BUG — fixed 100-byte buffer + `strcpy` in `retrieve_request_body`**
    `HTTP.c:57–58`. Any JSON body ≥ 100 bytes overflows.
    *Fix:* dynamic alloc based on `end - start`, or hard cap with truncation.

11. **BUG — `get_cookie` 32-byte static buffer with bare `strncpy`**
    `HTTP.c:40`. Cookie values >31 bytes overflow; `end+1` used without checking `end != NULL`.
    *Fix:* validate `end`; bounds-check `end - start` against buffer size.

### Routing & integration

12. **LINK — Host header on `post_to_local` says `5001`, connection is to `5000`**
    `post_local_server.c:94 → connect "5000"`, line 105–112 → `Host: 127.0.0.1:5001`. Cosmetic in single-vhost Flask but confusing and a real risk if Python ever adds vhost routing or moves behind a reverse proxy.
    *Fix:* change format-string arg on line 112 from `"5001"` to `"5000"`.

13. **LINK — `/etl/sparkclient/process` exposed by Python is not proxied**
    Python serves it at `local-server.py:3674`; no entry in `route.c`. Frontend's stream UX paths through `start`/`execute` so impact is unclear, but the asymmetry is a footgun.
    *Fix:* add `route.c` dispatch (if any browser code is meant to call it) **or** confirm it is internal-only and remove from the Python side later.

14. **LINK — `/etl/sparkclient/stream/restart` not proxied**
    Python: `local-server.py:1604`. No C route → cannot be called from the browser via the public surface.
    *Fix:* add to `route.c` next to `/etl/sparkclient/stream/start`.

15. **LINK — `/etl/run/` only matches with trailing slash**
    `route.c:475`. A request for `/etl/run` falls through to 404. Frontend always sends the slash today, but the inconsistency vs `/etl/call` invites future bugs.
    *Fix:* normalize match (strip trailing slash) **or** alias both forms.

16. **LINK — non-preview `/etl/run/` returns `{"status":"accepted"}` but no run id**
    `post_local_server.c:365–370`. The frontend has no handle to correlate with `/etl/pipeline/runs`. Today the UI polls the entire run list and assumes the newest is "this one" (race in multi-tab).
    *Fix:* read upstream response, forward `run_id` from it; or have Python issue the id eagerly. Coordinate with local-server fix (linked).

17. **LINK — `/etl/google/callback` proxied as JSON but is really an OAuth redirect**
    `route.c:499`. `get_from_local` does have 302-Location forwarding logic, so this works today; but the callback also writes a session cookie that may be stripped by the proxy (see #18).
    *Fix:* verify `Set-Cookie` headers are preserved in `get_from_local`'s response builder. None of the current `send_*_response_code` helpers accept `Set-Cookie`.

### Hygiene / quality

18. **MINOR — IPs and ports hardcoded everywhere**
    `post_local_server.c` (every proxy fn). Define `#define ETL_BACKEND_HOST "127.0.0.1"` / `ETL_BACKEND_PORT "5000"` at top of file.

19. **MINOR — no socket timeouts**
    Any backend hang stalls a server thread forever. Add `setsockopt(SO_RCVTIMEO/SO_SNDTIMEO)` after connect (e.g., 60s recv, 10s send).

20. **MINOR — dead code: commented-out `post_run_pipeline`**
    `post_local_server.c:280–340`. Delete or move to a `dead/` archive.

21. **MINOR — `post_ctabustracker_getpredictions` has no caller**
    `post_local_server.c:60–73`. Either wire up or drop. Adds maintenance noise.

22. **MINOR — `post_generate_phrase` is fire-and-forget (no recv)**
    `post_local_server.c:75–90`. Different from every other proxy. If frontend cares about the response this is a silent break; if it doesn't, document.

---

## 3. Frontend findings (`templates/etl/`)

### Activity inventory

All 22 visual activities are wired to a backend operation: import, filter, select, join, append, group, replace, fill, clean, dedupe, cast, regex, pivot, window, split, combine, flatten, custom (column), export (client-only), sheets_read/write, http_request/sink. Plus stream, dataflow (nested flow), pipeline. Every browser-side activity has a Python handler (verified in local-server audit).

One naming inconsistency, not a break:
- **group** activity: button id is `aggregate_activity` but the on-wire activity-type string is `group` (filed as UX in #34).

### HTML / DOM integrity

23. **BUG — broken HTML attribute split across a newline**
    `home.html:377-378`:
    ```
    <button type="button" cl
            ass="trigger-modal__btn trigger-modal__btn--ghost" data-trigger-close>Cancel</button>
    ```
    Browser parsers tolerate this loosely (whitespace inside an unquoted attribute name is invalid; behavior varies). Trigger-modal cancel button is unreliable.
    *Fix:* join the line — `<button type="button" class="trigger-modal__btn trigger-modal__btn--ghost" data-trigger-close>Cancel</button>`.

24. **LINK — `#flowchart_data` element does not exist in `home.html`**
    Referenced by `home-ui.js:7300` (`JSON.parse($("#flowchart_data").val())`) and `:7311` (`localStorage.setItem(... .val())`). `.val()` returns undefined → `JSON.parse(undefined)` throws.
    *Fix:* add hidden `<textarea id="flowchart_data" hidden></textarea>` near the import-flow modal **or** rip out the dead Text2Flow path.

25. **BUG — no null guard around `JSON.parse($("#flowchart_data").val())`**
    Same lines as #24. Even after element exists, an empty value will throw.
    *Fix:* guard with `if (!val) return;` before parse.

26. **BUG — no null guard parsing `sessionStorage.getItem("user_json")`**
    `home-ui.js:7317–7319`. If user has not logged in `getItem` returns `null`, `JSON.parse(null)` returns `null` (does not throw), but next line `user["pipelines"]["values"]` crashes.
    *Fix:* `if (!parsed?.pipelines?.values) return;`.

27. **UX — duplicate jQuery, jQuery UI, `<meta charset>`, `<meta viewport>` includes**
    `home.html:4–7` and `:15–19`. Two full copies of the same CDN scripts and metas. Two jQuery loads can also re-bind handlers.
    *Fix:* remove the second block (`:15–19`).

28. **LINK — malformed script tag**
    `home.html:392`: `<script src="/etl/split.js"defer></script>` — missing space; `defer` is parsed as part of the URL on strict parsers.
    *Fix:* `<script src="/etl/split.js" defer></script>`.

29. **UX — modal lacks focus trap and ESC-to-close**
    `home.html:301–382` (`#triggerModal`). `aria-modal="true"` is set but no JS implements the trap. Tab leaks to underlying flowchart.
    *Fix:* small focus-trap helper in `home-ui.js`; bind `keydown.Escape` on open.

30. **UX — focus is not restored to the opener after modal close**
    Same modal. After OK/Cancel, focus lands on `<body>`. Keyboard users get lost.
    *Fix:* save `document.activeElement` on open, restore on close.

### Run / pipeline UX

31. **UX — Run button has no in-flight state**
    `home-ui.js:5675–5710`. No spinner, no `disabled` while `/etl/run/` is in flight; double-click can dispatch two runs.
    *Fix:* disable button + swap label/icon between "Run" and "Running…".

32. **UX — preview silently skips http_sink with no toast**
    `run.js:269` sets `skip_http_sink: true` for previews. Users wonder why a sink "did nothing".
    *Fix:* small inline note on the run dialog ("Preview: HTTP sink steps skipped").

33. **BUG — dead "Not yet implemented" alert behind a button**
    `run.js:640–641`: `async function execute(widget){ alert("Not yet implemented") …}`. Reachable from somewhere — bouncing the user with a native alert is the worst UX.
    *Fix:* either delete `execute()` and the calling button, or implement (decision needed).

34. **UX — activity button labelled "aggregate" but dispatches `group`**
    `home-ui.js` selector map and `group.js` activity name. Either rename the visible label to "Group" or rename the activity type to `aggregate` (not viable without backend change — prefer label).
    *Fix:* change label; keep wire format `group`.

35. **UX — no error toast on failed AJAX**
    `home-ui.js` request paths — failures only `console.error`. Users see nothing.
    *Fix:* small toast helper invoked from a shared `fail` callback.

36. **UX — Run is enabled when canvas is empty**
    No client-side validation that ≥1 activity exists.
    *Fix:* gate run button; show inline hint.

37. **LINK — `home-ui.js:2172` references `pipeline_id` which may be out of scope**
    Code: `if (response.ok && pipeline_id === pipelineId …)`. Worth verifying — likely a typo for `pipelineId`.
    *Fix:* rename to consistent local var.

### Cleanup

38. **MINOR — production console.logs**
    `activities.js:35,101,106,129,137,614,939,942,948,994,1002,1065,1106,1113,1173`; `filter.js:33`; `group.js:28` (typo "GROUPNG"); `combine.js:13`; `export.js:41`; `import.js:306`; `panzoom.js:69`; `run.js:436,443,539`; `dataflow.js:30`.
    *Fix:* delete or wrap with `if (window.DEBUG)`. Drop the typo'd "GROUPNG" outright.

39. **MINOR — unused `<script>` tags / orphan icons**
    Triage during fix phase; not blocking.

---

## 4. Cross-side path matrix (frontend ↔ C ↔ Python)

| Frontend call                       | route.c | local-server.py | Status |
|-------------------------------------|---------|-----------------|--------|
| POST /etl/run/                      | 475     | 3451            | OK     |
| POST /etl/call                      | 477     | 3573            | OK     |
| POST /etl/pipeline/order            | 473     | 3658            | OK     |
| POST /etl/sparkclient/stream/start  | 483     | 1596            | OK     |
| POST /etl/sparkclient/stream        | 479     | 1617            | OK     |
| POST /etl/sparkclient/stream/execute| 481     | 1639            | OK     |
| GET  /etl/pipeline/runs             | 495     | 3563            | OK     |
| GET  /etl/trigger/runs              | 493     | 3553            | OK     |
| POST /etl/trigger/cron              | 489     | 3499            | OK     |
| POST /etl/trigger/cron/delete       | 491     | 3513            | OK     |
| POST /etl/google/login              | 487     | 3582            | OK     |
| GET  /etl/google/status             | 497     | 3642            | OK     |
| GET  /etl/google/callback           | 499     | 3599            | OK (cookie forwarding caveat — §2.17) |
| —                                   | —       | 3674 `/etl/sparkclient/process`         | LINK gap §2.13 |
| —                                   | —       | 1604 `/etl/sparkclient/stream/restart`  | LINK gap §2.14 |
| —                                   | —       | 3527 `/etl/trigger/run`                 | not used by frontend; safe to leave |

`/blob-storage/etl/{dataflow,pipeline,trigger}/{save,load,list,delete}` calls hit a separate (non-/etl) route family and are not in scope for this audit; spot-checked OK.

---

## 5. Open questions before fixing

1. **Run-id contract.** Should non-preview `/etl/run/` return `{run_id}` synchronously, or is the "tail-of-`/etl/pipeline/runs`" pattern intentional? Affects #16 (C) and matching item in local-server AUDIT.
2. **Cookie forwarding via the C proxy.** `Set-Cookie` from `/etl/google/callback` — is it currently making it to the browser? (Worth a manual `curl -v`.)
3. **Status-code propagation.** Are any clients today actively relying on the all-200 behavior? If so, we'll need a one-shot review of every client-side `.fail` handler.
4. **Text2Flow / `#flowchart_data`.** Is the import-from-text feature wanted? If yes we add the textarea + UX; if no we delete the JS.
5. **`execute()` stub in `run.js:640`.** Future feature or vestigial? If vestigial, remove the calling button at the same time.

---

## 6. Suggested fix batches (Phase 3 plan — for approval)

Each batch is a single commit on `home-server`.

- **Batch H1 — C correctness foundations**
  Items 1, 2, 3, 4, 6, 7 (init vars, error checks, signature fix). Smallest blast radius first.
- **Batch H2 — Memory safety**
  Items 8, 9, 10, 11 (HTTP.c buffer/leaks).
- **Batch H3 — Status-code & header passthrough**
  Items 5, 17, 12. Touches every proxy fn but mechanically.
- **Batch H4 — New routes for proxy gaps**
  Items 13, 14, 15. (Confirm decision on §5.1 first.)
- **Batch H5 — Frontend HTML hygiene**
  Items 23, 24, 25, 26, 27, 28.
- **Batch H6 — Frontend UX polish**
  Items 29–37.
- **Batch H7 — Cleanup**
  Items 18, 19, 20, 21, 22, 38.

Each batch ships with one targeted manual test from Phase 4's per-activity matrix.
