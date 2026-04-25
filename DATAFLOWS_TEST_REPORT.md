# Dataflows Test Report — home-server

Phase-4 verification of the audit fixes landed on `fix/dataflows-ui-ux`.
Companion file in local-server.

Environment: WSL2 / Ubuntu, gcc/cmake build, Node v23.3.0 (for JS
syntax checks). The home-server binary requires SSL certs and an
established websocket session to fully exercise; this report covers
what's verifiable without a live deployment, plus the manual gates
needed for the live smoke.

---

## 1. Headline result

| Check | Result |
|-------|--------|
| `cmake --build build/` (full incremental rebuild after each C edit) | clean, exit 0 |
| Linker | clean, no unresolved symbols |
| `node --check` on **all 29** `.js` files in `templates/etl/` | clean |
| Output binary `build/home-server` | 180 KB, ELF 64-bit, not stripped |

No regressions in the build. The CMakeLists.txt globs `routes/local-server/POST/*.c`
and `utilities/*.c`, so the new `body_has_preview_true` helper and the
new `send_javascript_response_code` helper are picked up automatically.

---

## 2. Verified statically

### 2.1 C bridge (`routes/local-server/POST/post_local_server.c`)
- `connect_to_local_server` now returns `-1` on every failure path
  (compiler can verify, and we manually traced each branch).
- All five callers (`post_to_local`, `post_to_local_no_reply`,
  `get_from_local`, `post_run_activity`, `post_ctabustracker_getpredictions`,
  `post_generate_phrase`) guard on `sfd < 0` before any `send` /
  `recv`. Verified via grep of the file.
- `LOCAL_SERVER_HOST` / `LOCAL_SERVER_PORT` macros used uniformly; no
  remaining `127.0.0.1` / `5000` / `5001` literals in the file other
  than the macro definitions themselves. Verified via grep:
  ```
  $ grep -n '"5001"' routes/local-server/POST/post_local_server.c
  (no output — fixed)
  ```
- `body_has_preview_true` parses the body as cJSON; both `null` body
  and parse failure return 0 (i.e., treat as non-preview = fire-and-forget).

### 2.2 HTTP utility (`utilities/http_utilities.c` and `.h`)
- `send_javascript_response_code` declared in `.h`, defined in `.c`,
  emits `Content-Type: application/javascript` for 200 and 404 codes.
- `get_gol_script` (`routes/life-of-sounds/GET/get_game_of_life_script.c`)
  now dispatches in this order: `.css` → CSS, `.js` → JS, fallback HTML.
  CSS and JS no longer share the HTML content type.

### 2.3 Frontend (`templates/etl/`)
- `home.html` Cancel button now has a single intact `class` attribute
  on one line. Verified via grep:
  ```
  $ grep -n 'cl$\|^ *ass=' templates/etl/home.html
  (no output — fixed)
  ```
- `run.js` no longer contains `=== []` literal-array equality
  (always-false dead clause). Verified via grep across all three
  former sites.
- `pipeline.js` `_get_dataflows` renamed to `_get_pipelines`. No
  stale references remain.
- `run.js` no longer contains the dead `execute_activity` /
  `execute(widget)` bodies (each was a comment block plus an
  unused stub).
- All 29 frontend JS files pass `node --check`.

### 2.4 Dead-asset cleanup
| File | Status | Confirmed unreferenced |
|------|--------|------------------------|
| `templates/etl/__home.html` | deleted | grep across `*.c`, `*.h`, `*.html`, `*.js` |
| `templates/etl/t.html` | deleted | grep |
| `templates/etl/export.js` | deleted | grep |
| `templates/etl/panzoom.js` | deleted | grep |
| `templates/etl/jquery.flowchart.min.js` (0 bytes) | deleted | grep |
| `templates/etl/jquery.flowchart.min.css` | deleted | grep |
| `templates/etl/panzoom.js:Zone.Identifier` | deleted | Windows ADS leakage |
| `templates/etl/demo.html:Zone.Identifier` | deleted | Windows ADS leakage |

`home.html` still references the live `jquery.flowchart.js` (86 KB)
and `jquery.flowchart.css` (7 KB). No regression on the flowchart UI
library.

---

## 3. Activity matrix (manual gates)

The C-side fixes change wire-level behavior (status codes, MIME types,
host headers, fire-and-forget conditions). The full surface should be
re-tested with a live home-server + local-server pair and a browser.

| Activity | Routing | Preview | Run | Save→Reload | Notes |
|----------|---------|---------|-----|-------------|-------|
| import | `/etl/run/` | manual | manual | manual | hits `post_run_activity` |
| http_request | `/etl/call` | manual | manual | manual | bypasses fire-and-forget |
| sheets_read | `/etl/run/` | manual | manual | manual | OAuth required |
| sheets_write | `/etl/run/` | manual | manual | manual | OAuth required |
| filter / sort / select / dedupe | `/etl/run/` | manual | manual | manual | |
| join | `/etl/run/` | manual | manual | manual | input_1/input_2 ordering |
| append / combine / split | `/etl/run/` | manual | manual | manual | |
| custom / replace / fill / clean | `/etl/run/` | manual | manual | manual | |
| cast / regex / pivot / window / flatten | `/etl/run/` | manual | manual | manual | |
| group ("Aggregate") | `/etl/run/` | manual | manual | manual | empty op now passes through (F12) |
| http_sink | `/etl/run/` + browser POST | manual | manual | manual | |
| dataflow / pipeline (nested) | `/etl/run/` | manual | manual | manual | |
| stream | `/etl/sparkclient/stream*` | manual | manual | n/a | |
| trigger | `/etl/trigger/cron*` | manual | manual | manual | |

### Manual server-pair smoke (browser + curl)

With both servers running:

1. **Browser DevTools — Content-Type for JS** (audit H5):
   - Network tab → load `/etl` → inspect a `.js` request →
     `Content-Type: application/javascript`. Pre-fix: `text/html`.
2. **Browser — Cancel button styling** (audit H6):
   - Click "+ New Trigger" → modal opens → Cancel button is now
     visibly styled as a ghost button. Pre-fix: was unstyled.
3. **curl — fire-and-forget on non-preview run** (audit H3):
   ```
   curl -k -X POST https://127.0.0.1:9030/etl/run/ \
     -H 'Content-Type: application/json' \
     -d '{"activities":[],"preview":false}'
   ```
   Should return `{"status":"accepted"}` immediately. Repeat with
   `"preview":true` — should return the actual run result.
4. **curl — preview detection robust to whitespace** (audit H3):
   ```
   curl -k -X POST https://127.0.0.1:9030/etl/run/ \
     -H 'Content-Type: application/json' \
     -d '{"activities":[],"preview" : true}'
   ```
   Pre-fix the literal substring `"preview":true` would not match
   (no space). Post-fix the cJSON parser handles any valid JSON.
5. **curl — connect failure on local-server down** (audit H2):
   - Stop local-server. Hit any `/etl/*` POST.
   - Pre-fix: home-server could segfault or return garbage from
     uninitialized `sfd`. Post-fix: home-server logs the failure and
     returns no body (the C handler returns early on `sfd < 0`).
   - **Manual verification recommended**: stop local-server, exercise
     each `post_to_local` / `post_run_activity` / `get_from_local`
     consumer, and confirm home-server stays up.
6. **Browser — frontend script load order**:
   - `home.html` script tags load `activities.js` → `run.js` →
     activity classes → `home-ui.js`. With `_get_dataflows` →
     `_get_pipelines` rename, verify no console errors when adding
     a Pipeline activity onto the canvas.

---

## 4. Phase-4 findings

### Phase-4 Finding #1 — `from DAG import *` regression (local-server only)
Documented in the local-server companion. Caught by the new pytest
suite, fixed in commit `b0749e9`. No equivalent regression in
home-server.

### Phase-4 Finding #2 — pre-existing DAG recursion bug (local-server only)
Documented in the local-server companion. Not introduced by this
branch and not fixed (audit scope: preserve DAG).

### Phase-4 Finding #3 — `build/` is git-tracked
The `build/` directory contains tracked compiler artifacts (`.o.d`
files, the binary). Touching these via cmake produces a noisy git
status. None of the Phase-3 commits include build artifacts; they
remain in the worktree as locally modified. The user/team should
decide whether to add `build/` to `.gitignore` — out of audit scope.

---

## 5. Static checks performed

```
$ cmake --build build/                                 # clean
$ for f in templates/etl/*.js; do node --check "$f"; done   # all 29 OK
$ grep -n '"5001"' routes/local-server/POST/post_local_server.c
(no output)
$ grep -n '_get_dataflows' templates/etl/pipeline.js
(no output — renamed)
$ grep -rn 'cl$' templates/etl/home.html | grep -v cle | grep -v cla
(no output — Cancel button repaired)
```

---

## 6. Phase-3 fix verification per audit ref

| Audit ref | Fix commit | Verification |
|-----------|------------|--------------|
| H1 — host port mismatch in `post_to_local` | `55ae5f6` | source inspection + macro-only port refs |
| H2 — `connect_to_local_server` return -1; sfd guards | `55ae5f6` | manual smoke #5 |
| H3 — fire-and-forget tightened, JSON-aware preview | `55ae5f6` | manual smoke #3 + #4 |
| H5 — `.js` MIME type | `478e3bf` | manual smoke #1 |
| H6 — broken Cancel button class | `9f70efb` | manual smoke #2 |
| H8/H9 — dead-file cleanup | `9f70efb` | grep table in §2.4 |
| M2 — `_get_dataflows` rename in `pipeline.js` | `063bff5` | grep |
| M3 — dead `execute*` bodies removed | `063bff5` | grep |
| M5 — `=== []` dead clause repaired | `063bff5` | grep |

---

## 7. Out-of-scope

- The C-server's response-helper memory hygiene (the malloc'd
  `code_text` is overwritten by string literals in
  `send_*_response_code` — preserved).
- The `home-ui.js` size / structure (~5K lines) — preserved.
- External libraries loaded in `home.html` (CodeMirror, marked,
  Chart.js) — preserved; defer/guard recommended in audit but not
  applied here.
