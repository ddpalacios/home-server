# Pending C home-server changes

This file tracks changes to the C home-server that the SQL-activities and
parallel-pipelines work depends on. Sections that have been applied to
`routes/route.c` are removed from this file once landed; what remains below
is still pending.

## 1. Dedicated `/blob-storage/etl/sql/*` handlers

**Where:** `routes/blob-storage/POST/post_blob.c` and
`routes/blob-storage/GET/get_blob_storage_files.c`.

**Why:** today the frontend can save/load SQL docs through the generic
`POST/GET /blob-storage/raw/etl/sql/<id>.json` handler, but there is no
list endpoint that returns one summary per file (id, name, description,
updated_at) filtered by `google_id` — and there is no `delete` for raw
blob paths. The SQL frontend ships with a fallback (multi-fetch list +
soft-delete), but that's wasteful and doesn't survive a page reload for
deletes. The proper fix is to mirror the pipeline/dataflow handler set:

| Op     | Route                                       | Mirror of                      |
|--------|---------------------------------------------|--------------------------------|
| Save   | `POST /blob-storage/etl/sql/save?googleId=&sqlId=` | `…/etl/dataflow/save`     |
| Load   | `GET  /blob-storage/etl/sql/load?sqlId=`    | `…/etl/dataflow/load`          |
| List   | `GET  /blob-storage/etl/sql/list?googleId=` | `…/etl/dataflow/list`          |
| Delete | `POST /blob-storage/etl/sql/delete?sqlId=`  | `…/etl/dataflow/delete`        |

Backing dir: `~/home-server/blob-storage/raw/etl/sql/`. The list response
must mirror the existing pipeline list shape — `{values: [{sql_id, name,
description}]}` — so the frontend's primary code path works without
modification (`templates/etl/sql_persistence.js` already prefers this
shape, and `templates/etl/sql_activity.js` from the parallel-pipelines
work also reads from this endpoint via `fetchSavedSqlList`).

JSON body shape on disk:

```json
{
  "sql_id": "sql_xxxx",
  "name": "Recent Eventbrite signups",
  "description": "",
  "query": "SELECT ...",
  "google_id": "102399790568261391947",
  "created_at": 1714000000,
  "updated_at": 1714000000,
  "last_result_metadata": {
    "row_count": 123,
    "elapsed_ms": 412,
    "ran_at": 1714000000
  }
}
```

## 2. Optional follow-up: SSE for query progress

`POST /etl/sql/execute` is currently a synchronous request/response pair
with a server-side timeout (default 60s). For long-running interactive
sessions a SSE-style progress stream — analogous to
`/etl/notebook/events/<job_id>` — would let the UI show "scanning N
files… stage K/M" instead of a spinner. This is **not a blocker** for
the current feature; record it here so it doesn't get lost.

If we add it, the C side already has `proxy_sse_to_local`; the only
work is a new `/etl/sql/events/<query_id>` route that calls it.

## Changelog (sections that have been applied)

- **Serve SQL static assets** (`/etl/sql_persistence.js`, `/etl/sql_ui.js`,
  `/etl/sql.css`) — `routes/route.c:173–178`.
- **Serve Notebook + SQL pipeline-activity assets**
  (`/etl/notebook_activity.js`, `/etl/sql_activity.js`) —
  `routes/route.c:119–122`.
- **Forward `/etl/sql/*`** (execute, cancel, tables) —
  `routes/route.c:179–184`.
- **Forward `/etl/pipeline/events/<run_id>` (SSE)** —
  `routes/route.c` near the `/etl/pipeline/runs` block.
- **Forward `GET /etl/pipeline/run?…`** (per-run history detail) —
  same area.
- **Forward `/etl/pipeline/cancel` + `/etl/pipeline/cancel_activity`** —
  same area.

## Admin Phone Assignment (added 2026-04-27)

These are **optional** follow-ups for the admin phone-assignment feature
landed on `feature/admin-phone-assignment`. The feature works without
them today because the dashboard backend (local-server, Python) handles
the heavy lifting and treats /demo-kb-ingest as synchronous.

1. **Optional `phone_number` arg on `/demo-kb-ingest`.** Today the
   admin worker injects `phone_number` and `phone_display` into the
   profile saved by `save_demo_profile`, then the dashboard reads
   them back via `_find_phone_by_account` in `/demo-kb-profile`. If
   `/demo-kb-ingest` accepted an explicit `phone_number` field in its
   POST body (and the user-facing "Build Their Demo" form passed one),
   we could phase out the post-hoc lookup. Not a blocker.

2. **Async ingest callback.** Today `/demo-kb-ingest` is synchronous,
   so the admin worker dispatches it inline in a thread. If the ingest
   becomes async (job queue + status endpoint), add:
   - `POST /admin/twiliobot/callback` on local-server, accepting
     `{phone_id, demo_url, status, error?}` with HMAC-style signature
     in a header, OR
   - `GET /twiliobot/<job_id>/status` on home-server (or wherever the
     queue lives) for the dashboard to poll directly.
   Either keeps the admin flow non-blocking.

3. **No changes required to `routes/route.c` for v1.** The existing
   `/twiliobot` static-HTML route is unchanged; the demo-page CTA
   markup was added in `templates/portfolio/twiliobot.html`.
