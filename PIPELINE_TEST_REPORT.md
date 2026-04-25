# home-server — Pipeline Test Report

**Date:** 2026-04-25
**Environment:** Linux (WSL2), `cmake/make`, OpenSSL.

## How to reproduce

- `cd home-server/build && make` — builds `home-server` from the same `CMakeLists.txt` checked in (no changes there).
- The binary needs SSL certs and a MySQL connection to start a live listener; those are out of scope for this audit. The build verifies that the source compiles after the H1–H7 fixes.

## Build

```
[100%] Built target home-server
```

No warnings, no errors after H1–H7. Verified that:

- `routes/local-server/POST/post_local_server.c` compiles after the H1 (`connect_to_local_server` initialization + error handling), H3 (status passthrough + new `send_proxy_response`), H4 (two new routes), and H7 (socket timeouts + `ETL_BACKEND_HOST/PORT` macros) edits.
- `utilities/http_utilities.c` / `.h` compiles after adding 500/502/503 codes plus the `send_proxy_response` helper.
- `routes/route.c` compiles after H4 (new `/etl/sparkclient/process` and `/etl/sparkclient/stream/restart` cases).
- `routes/HTTP.c` / `.h` deletion (H7) leaves the build clean — confirmed they were not in the CMake glob.

## Static verification (code review)

| Item                                                              | Status |
|-------------------------------------------------------------------|--------|
| `connect_to_local_server` returns `-1` on `getaddrinfo` failure   | ✅      |
| `connect_to_local_server` no longer breaks on first failed address | ✅      |
| Every proxy caller checks `sfd < 0` and returns 502                | ✅      |
| `recv` loop distinguishes `0` (EOF) from `<0` (error)              | ✅      |
| `realloc` failure frees `response`, closes socket, returns 500     | ✅      |
| Upstream HTTP status code parsed (`HTTP/1.x NNN Reason`)           | ✅      |
| Upstream `Content-Type` header forwarded to the browser            | ✅      |
| Upstream `Set-Cookie` header forwarded (Google OAuth callback fix) | ✅      |
| `Host:` header in `post_to_local` matches the actual port (5000)   | ✅      |
| `/etl/sparkclient/process` and `/etl/sparkclient/stream/restart` reachable via the C router | ✅ |
| 120s recv / 10s send `setsockopt` timeouts on each connection      | ✅      |
| `ETL_BACKEND_HOST` / `ETL_BACKEND_PORT` macros used everywhere     | ✅      |
| Orphan `routes/HTTP.c` / `routes/HTTP.h` deleted                   | ✅      |

## Frontend (browser)

The HTML/JS edits were applied to `templates/etl/`. Browser sessions were not launched during this audit (the C server can't start without certs in this environment), so the changes are verified by code review and quick HTML lint:

| Item                                                    | Status |
|---------------------------------------------------------|--------|
| `home.html:377` — broken `<button type="button" cl\n…ass="…">` joined onto one line | ✅ |
| `home.html` — duplicate jQuery / jQueryUI / `<meta>` tags removed | ✅ |
| `home.html` — `<script src="/etl/split.js" defer>` malformed tag fixed | ✅ |
| `home-ui.js` — `Text2Flow`, `SaveToLocalStorage`, `LoadFromLocalStorage` null-guard `JSON.parse` (the orphaned `#flowchart_data`/`user_json` paths now no-op rather than throwing) | ✅ |
| `home-ui.js` — `#run_pipeline` click guards on empty canvas | ✅ |
| `home-ui.js` — trigger modal closes on `Escape`         | ✅ |
| `home-ui.js` — drop noisy `console.log("ACTIVITIES", …)` from the run handler | ✅ |
| `run.js` — dead `execute(widget)` "Not yet implemented" stub removed | ✅ |
| Activity scripts — leftover top-level `console.log`s stripped (filter, group, combine, export, import, panzoom, dataflow, run, activities) | ✅ |

## Cross-side path matrix (post-fix)

| Frontend call                         | route.c | local-server.py |
|---------------------------------------|---------|-----------------|
| POST `/etl/run/`                      | 475     | 3451            |
| POST `/etl/call`                      | 477     | 3573 (now 3642 after L1 edits) |
| POST `/etl/pipeline/order`            | 473     | 3658 (now 3675) |
| POST `/etl/sparkclient/stream/start`  | 483     | 1596 (now 1601) |
| POST `/etl/sparkclient/stream`        | 479     | 1617 (now 1622) |
| POST `/etl/sparkclient/stream/execute`| 481     | 1639 (now 1644) |
| POST `/etl/sparkclient/stream/restart`| **481b (new)** | 1604 (now 1609) — gap closed by H4 |
| POST `/etl/sparkclient/process`       | **481c (new)** | 3674 (now 3691) — gap closed by H4 |
| GET  `/etl/pipeline/runs`             | 495     | 3563 (now 3632) |
| GET  `/etl/trigger/runs`              | 493     | 3553 (now 3622) |
| POST `/etl/trigger/cron`              | 489     | 3499 (now 3505) |
| POST `/etl/trigger/cron/delete`       | 491     | 3513 (now 3519) |
| POST `/etl/google/login`              | 487     | 3582 (now 3653) |
| GET  `/etl/google/status`             | 497     | 3642 (now 3711) |
| GET  `/etl/google/callback`           | 499     | 3599 (now 3670) — Set-Cookie now passes through C proxy |
| `/etl/notebook/*`                     | 505–525 | unchanged       |

(Line numbers on the Python side shift because `_execute_run_synchronous` and `_safe_id` were inserted earlier in the file.)

## What was NOT exercised here

- **Live HTTPS sessions** — the C `home-server` binary needs SSL certificates and a running MySQL backend to bind. The build is clean; runtime smoke testing must happen on a configured host.
- **Browser sessions** — required the running stack. Frontend changes verified by code review.
- **OAuth round-trip** — Google client config not present in this environment.
- **Activity end-to-end** — relies on a running Python backend (which itself needs JDK 17+ for Spark, see `local-server/PIPELINE_TEST_REPORT.md`).

## Summary

- Build is green after H1–H7. No new warnings.
- Static review confirms every audit-listed C-side correctness, link-integrity, and UX item is addressed.
- Frontend HTML hygiene is fixed; UX polish lands without breaking the existing wiring (button id selectors and event handlers preserved).
- End-to-end live tests deferred to an environment with SSL certs + MySQL + JDK 17+.
