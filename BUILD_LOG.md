# BUILD_LOG — Blob Storage activity: drop upload, add Data Preview

End-to-end build executed in one session. Each slice committed independently
so it can be reverted without touching the others.

## Phase 1 — Discovery

### Stack reality (overrides parts of the brief)

The brief asks for "TS strict" types. This codebase has **no TypeScript and
no build step** — `templates/etl/*.js` files are loaded directly by
`<script defer>`. There is no bundler, no `tsconfig`, no `package.json` for
the app. The closest we get is **JSDoc type annotations**, which is what
the rest of the codebase already uses. All new JS in this build follows
that convention.

Frontend tests: there is no jest/vitest harness installed in
`templates/etl/`. Frontend "tests" therefore are: `node -c` syntax checks,
running `python -m pytest` for backend tests, and the manual checklist in
Phase 4. This matches every other JS file shipped in this repo.

### 1. The "Blob Storage" activity today

- **Origin**: there is no standalone class for it. Clicking
  `+ Import → Blob storage` on the canvas hits
  `home-ui.js → createIngestAtSlot("blob-storage")`
  (`templates/etl/home-ui.js:3183`), which:
  - creates an operator with `activityType: "import"`
  - sets the on-canvas title to `"Blob storage"`
  - pre-seeds `properties.settings = { import: { source: "blob-storage" } }`
  - instantiates `Import_Activity` (`templates/etl/import.js`)

So functionally the "Blob Storage activity" is an `Import_Activity` whose
settings happen to have `source: "blob-storage"`.

- **Settings tab UI** (`import.js → get_settings_element`):
  1. `<select id="..._source_select">` — Source: `Upload file` /
     `Blob storage`
  2. `<label class="file-dropzone">` (with hidden `<input type="file">`)
     — the **click-to-upload** affordance the brief asks us to remove
  3. `<div ..._blob_field>` containing the new shared
     `createPathPicker(...)` (built last session)
  - The source dropdown toggles fields 2 and 3 visible/hidden.

- **Click-to-upload code path**:
  - DOM: `dropzone.appendChild(file_input)` at `import.js:115`
  - Listener: `file_input.addEventListener("change", ...)` →
    `_inputFile_onchange(...)` (`import.js:171`), which:
    - reads the file in the **browser** via `file.text()`
    - parses CSV via the in-tree `csvToJson` helper, JSON via
      `JSON.parse`
    - calls `widget.flowchart('setinputVal', activityId, 'input',
      {datatypes: null, values: parsed_data})`
  - **There is no backend upload endpoint.** No `multipart/form-data`,
    no `XMLHttpRequest`, no progress UI. The uploaded data lives only
    on the client and is embedded into the dataflow JSON when saved.

  Implication: removing the click-to-upload affordance does NOT require
  removing any server-side endpoint. There's nothing to log in
  `SERVER_TODO.md` for an obsolete upload route — there isn't one.

- **Activity state fields tied to upload** (none persisted server-side):
  - `activity.inputs.input.value.values` — the parsed rows
  - `activity.inputs.input.value.datatypes`
  - `activity.outputs.output.value.values`/`datatypes`

### 2. PathPicker (built earlier)

Confirmed at `templates/etl/path_picker.js`. Public API:

```js
window.createPathPicker({
  value, onChange, selectMode, fileExtensions, rootZones,
  initialPath, label, placeholder, disabled, required, error,
}) → { element, getValue, setValue, setError, destroy }
```

- `value` shape: `{ zone: 'raw'|'processed', path: '<rel>' }`
- `selectMode`: `'file' | 'directory' | 'either'`
- `fileExtensions`: `['json', 'csv', 'jsonl']` is honored — leaves with
  other extensions render dim and are non-clickable.
- `rootZones`: `['raw', 'processed']` is honored.
- Lazy data fetch via `GET /blob-storage/<zone>/<path>`.

### 3. Results table component

- **Component**: `window.NB.renderDataFrame(value, allowDownload)` exposed
  from `notebook.js`.
- **Reusable outside notebooks**: yes — already reused by
  `templates/etl/sql_ui.js → renderResultCard`. CSS scope was widened to
  `:is(.nb-workspace, .sql-results-panel) .nb-df…` so the table styles
  apply outside the notebook canvas. The Blob Storage Data Preview tab
  will mount its results into a third selector that picks up the same
  styles.
- **Value shape**: `{ columns: [str], rows: [[any]], total_rows: int,
  truncated: bool, chartable: bool }`. We'll build this from the
  `/etl/preview` response.

### 4. Spark execute endpoint + primitives

- **SQL execute**: `POST /etl/sql/execute` (`local-server/sql_routes.py`).
  Uses:
  - `_executor = ThreadPoolExecutor(max_workers=4)` (`sql_routes.py:402`)
  - `_get_spark()` → shared `SparkSession` (project-wide; lazy)
  - `setJobGroup(query_id, ...)` for cancelable execution
  - `cancelJobGroup(query_id)` via `POST /etl/sql/cancel`
- **FAIR scheduler**: `_ensure_fair_scheduler` in `local-server.py:2383`
  injects `spark.scheduler.mode=FAIR` into the SparkSession config when
  it's first built. We inherit this for free.
- **`spark.newSession()`** is used in the parallel-pipeline executor
  (`local-server.py:1975`) for catalog isolation per activity. We'll do
  the same for `/etl/preview` so a preview's transient temp views can't
  collide with the SQL workspace's.

### Decisions / non-blockers

1. **No TS** — JSDoc instead. Logged in this section.
2. **No backend upload to delete** — removing the dropzone is a pure
   frontend change.
3. **PathPicker exists and is correct shape**. ✓
4. **Results table is reusable**. ✓
5. **Spark execute endpoint exists with the right primitives**. ✓

No blockers. Proceeding to Phase 2.

---

## Phase 2 — Design

### A. What to remove

- `import.js → get_settings_element`: the source-select dropdown and the
  full `<label class="file-dropzone">` block (including `<input
  type="file">`, drag/drop handlers, filename display).
- `import.js → _inputFile_onchange`: dead once the dropzone is gone.
  Removed.
- The "Source" `<select>` (`#<id>_source_select`) and `_toggleSourceFields`,
  `_persistImportSettings({source})` plumbing tied to it.

What stays:
- The PathPicker integration in `import.js` (we extract it cleanly so
  uploaders that still need this class — i.e. classic CSV/JSON file
  drops — can keep it). Practically: we **fork** the Blob Storage
  variant into its own class `BlobStorage_Activity`, leaving
  `Import_Activity` untouched for the `+ Import → Import Data` ingest
  type. This lets us nuke upload UI from BS without breaking the upload
  flow that does still exist.

### B. New activity class + settings tab

`templates/etl/blob_storage_activity.js`: `BlobStorage_Activity extends
Activity`. `get_settings_element()` returns a div containing only:

- A short helper: "This activity reads from a file already in blob
  storage. Use another tool (sync, manual upload, separate pipeline)
  to populate files first."
- `createPathPicker({ label: "Target File", selectMode: "file",
  fileExtensions: ["json","csv","jsonl"], rootZones: ["raw","processed"],
  required: true, value: settings.blob_storage })`

Activity name + description fields are part of the existing General tab
(`#operator_title`, `#operator_description`) — they are the platform's
mechanism for naming any activity, so nothing to add for them.

`createIngestAtSlot("blob-storage")` is updated to instantiate
`BlobStorage_Activity`. The on-disk `activityType` switches from
`"import"` (with `settings.import.source = "blob-storage"`) to
`"blob_storage"` (with `settings.blob_storage = { zone, path }`).

Backwards compat on load: the new class checks both shapes when reading
settings. Old saves keep working until re-saved.

### C. Data Preview tab

The bottom panel already has a `#data_preview` tab (used by every
activity for its post-Refresh-Preview rows). We add an
**activity-type-specific override** for `blob_storage`:

- When the selected activity is a Blob Storage one and the user clicks
  the Data preview tab, hide `#activity_previews` (the per-operator
  table that runs the upstream chain) and show
  `#blob_storage_preview_panel`.
- Panel layout (Phase-2 wireframe in the brief mapped 1:1):
  - Header line: breadcrumb path (`raw / Eventbrite / events.json`)
  - `[↻ Refresh Preview]` button + "Last loaded …" label
  - Summary: `Rows: N of N | Columns: M | Format: json`
  - Body: results table mount via `NB.renderDataFrame`
- States:
  1. **No path selected** — placeholder + "Go to Settings" link
  2. **Path selected, never loaded** — "Click Refresh to load preview."
  3. **Loading** — skeleton table + cancel button + "Reading {path}…"
  4. **Loaded** — summary + table
  5. **Error** — inline error pre + "Try Again" (errors per the brief)

### D. Backend — POST /etl/preview

New endpoint, lives in `local-server/preview_routes.py` (Flask
blueprint, registered alongside `sql_bp` in `local-server.py`). Body:

```
{ request_id, zone, path, limit (default 1000, max 1000), no_cache (bool) }
```

Implementation:

1. Validate path: rejects `..`, leading `/`, `\\`. Must end in
   `.json | .csv | .jsonl`.
2. Resolve absolute path: `~/home-server/blob-storage/<zone>/<path>`.
   404 if not file or not present.
3. **Cache lookup** keyed on `(zone, path, mtime_ns)`. LRU, 10 entries,
   600s TTL. `no_cache=true` bypasses + replaces. Cache hit → return
   immediately.
4. Submit to `_executor` (the same pool SQL uses) with a
   `setJobGroup(request_id, …, interruptOnCancel=True)`.
5. **Format detection**:
   - `.csv` → `spark.read.option("header","true").option("inferSchema","true").csv(path)`
   - `.jsonl` → `spark.read.json(path)` (newline-delimited)
   - `.json` → first try multiline=true; if `df.count() == 1` and the
     single row's columns look like the entire payload (heuristic:
     all values are array/struct types and total rows ≤ 1), fall back
     to `spark.read.json(path)` (default JSONL). Else keep multiline.
6. `df.cache(); total = df.count()`; `rows = df.take(limit)`. Convert to
   JSON-safe primitives (Decimal, datetime, Row, dicts/arrays).
7. Schema → `[{name, dtype}]`. Wrap in response, store in cache.
8. Hard server-side cap: `min(client_limit, 1000)`.

Cancellation: `POST /etl/preview/cancel` with `{request_id}` calls
`spark.sparkContext.cancelJobGroup(request_id)`. (Reusing
`/etl/sql/cancel` would also work but keeping it endpoint-specific so
log lines are unambiguous.)

### E. Frontend behavior

- Tab does NOT auto-load on first open.
- Switching tabs preserves rendered data; the panel keeps its last
  successful response in JS state.
- "Last loaded" timestamp lives in JS state, never in the activity
  JSON.
- Path change in Settings (PathPicker `onChange`) clears the panel
  cache, returns to "Click Refresh".
- Refresh debounced 500 ms; disabled while in-flight.
- AbortController on the fetch — switching activities or unloading
  the workspace cancels the request, frontend AND backend (via
  `/etl/preview/cancel`).
- All requests send `no_cache=true` when triggered by the Refresh
  button itself — Refresh always means "show me fresh." First load
  (path picked, click Refresh) sends no_cache=false the very first
  time so a recent server cache hit is reused.

  Wait — re-reading the brief: "Refresh button always sends this"
  (no_cache=true). OK — Refresh always bypasses. We'll respect that.
  First-ever-click counts as a Refresh.

### F. Row limit

- Server-enforced cap: 1000.
- If `total_rows > 1000`, response sets `truncated: true`. Frontend
  shows: "Showing first 1000 of N rows. Use a SQL Activity to query
  the full dataset."

### G. Column handling

- Reuse `NB.renderDataFrame`'s existing column rendering (column-name
  headers + sticky thead + click-to-sort).
- Type badges: notebook's renderer already shows `name (dtype)` in the
  header. We pass `name + " " + dtype` formatted that way.
- Nested data (struct/array): `NB.renderDataFrame` stringifies objects
  in cells. Polish slice 5 adds an "expand on click" action consistent
  with the SQL workspace's JSON-cell pattern.

### H. Downstream

- Helper text under PathPicker exactly as the brief says.
- No Sync/Upload activity exists. Logging in `PRODUCT_TODO.md` so it
  doesn't get lost.

---

(Phase 3 + 4 results appended below as each slice lands.)

---

## Phase 3 — Implementation results

| Slice | Commit | Tests | Notes |
|---|---|---|---|
| 1 — `/etl/preview` backend | local-server `6d1d94a`, home-server `a7f8d13` | 15 new + 222 existing → 237 ✅ | Format detection (json/jsonl/csv), LRU+TTL+mtime cache, hard 1000-row server cap, `setJobGroup`/`cancelJobGroup`, AbortController-friendly cancel route. Reuses `_executor` and `_get_spark` from `sql_routes.py` so SQL + preview share concurrency caps + FAIR scheduler. |
| 2 — `BlobStorage_Activity` class | home-server `4c499b6` | 237 still ✅ + JS `node -c` clean | New `templates/etl/blob_storage_activity.js`. `createIngestAtSlot("blob-storage")` instantiates this instead of aliasing to `Import_Activity`. Activity persists `settings.blob_storage = {zone, path}`; reads legacy `settings.import.{source_root|zone, path}` for forwards-compat. Click-to-upload UI deleted from this code path. |
| 3 — Data Preview tab shell | home-server `7dd8145` | JS `node -c` clean | New `templates/etl/blob_storage_preview.js` with the full state machine (`no-path`, `ready`, `loading`, `loaded`, `error`). Shell DOM in `home.html`, full styling in `home.css` (skeleton shimmer, status pill, summary line, error inline). `refreshPreview` is a stub in this commit — the visual states can be exercised on the canvas without a backend round-trip. |
| 4 — Wire refresh to `/etl/preview` | home-server `3519b81` | 237 still ✅ | Real fetch with `AbortController`. `no_cache=true` on every refresh per the brief. `request_id` round-trips so server-side cancellation can target one specific run. Stale-response guard: when the user switches activities mid-flight, the response is dropped. Inline error rendering driven off `error_kind` (not toast). |
| 5 — Polish | home-server `56876dc` | 237 still ✅ | 500ms debounce on `refreshPreview` (Try Again retries bypass with `force=true`). Tab-away cancellation: switching to General/Settings/Activities/Scheduled triggers calls `cancelInFlight`. Auto-tick "Last loaded" every 30s. Click-to-expand modal for nested cell values (Esc / overlay click / Close button to dismiss). Type badges were already folded into Slice 4's `mountTable`. |

Total commits: 5 home-server, 1 local-server. Each is its own commit
so any single slice can be reverted independently.

### Files

- `local-server/preview_routes.py` (new, ~265 LOC)
- `local-server/local-server.py` (added blueprint registration, ~5 LOC)
- `local-server/tests/test_preview_routes.py` (new, ~250 LOC, 15 tests)
- `home-server/templates/etl/blob_storage_activity.js` (new, ~110 LOC)
- `home-server/templates/etl/blob_storage_preview.js` (new, ~430 LOC)
- `home-server/templates/etl/home.html` (panel DOM, script tag)
- `home-server/templates/etl/home-ui.js` (`createIngestAtSlot` + activity dispatcher)
- `home-server/templates/etl/home.css` (panel + skeleton + modal styles)
- `home-server/routes/route.c` (3 new static-asset routes + 2 new proxy routes)

### What was deliberately NOT done

- **Backend upload endpoint**: there isn't one. The pre-existing
  upload was 100% client-side (CSV/JSON parsed in the browser via the
  Import activity dropzone). Nothing to remove server-side. Logged
  here in lieu of a SERVER_TODO entry — there's nothing to track.
- **TS strict types**: project has no TS, no tsconfig, no build step.
  JSDoc-style annotations match the convention of every other JS file
  in `templates/etl/`. Calling out so a later reviewer doesn't expect
  `.ts` files.
- **Frontend test harness**: no jest/vitest installed. Frontend
  "tests" are `node -c` syntax checks + the manual checklist below.
- **Sync/Upload activity for backfilling files**: doesn't exist;
  recorded in `PRODUCT_TODO.md`.

---

## Phase 4 — Verification

### Automated

- `cd ~/local-server && python3 -m pytest -q` → **237 passed, 1 warning**
  (15 new preview tests + 222 pre-existing).
- `node -c` clean on every new JS file: `path_picker.js`,
  `blob_storage_activity.js`, `blob_storage_preview.js`.
- `home-server/build/home-server` rebuilt cleanly with the new
  static-asset + proxy routes.

### Manual checklist (run after restarting both servers)

- [ ] `python3 ~/local-server/local-server.py` — restart so `preview_bp`
      is registered.
- [ ] `~/home-server/build/home-server` — restart so the new route
      entries are live.
- [ ] Hard-reload browser. DevTools open.
- [ ] On the canvas, click `+ Import → Blob storage`. The new operator
      appears with title "Blob storage".
- [ ] Click the operator. Bottom panel → Settings tab. **Confirm: no
      "click to upload" affordance is present**, no Source dropdown,
      no `<input type="file">`. Just the helper line + the path
      picker.
- [ ] Click the picker. Pick a small `.json` file under `raw/`.
      Trigger collapses to the breadcrumb.
- [ ] Switch to the **Data preview** tab. **Tab does NOT auto-load.**
      Status reads "Click Refresh to load preview." Refresh button is
      enabled.
- [ ] Click `↻ Refresh Preview`. Skeleton shimmer appears. Status
      reads "Reading raw/…". Cancel button appears. Within ~5–15s
      (Spark cold-start), table renders. Header summary shows the row
      count, column count, and `json`. "Last loaded: …" appears.
- [ ] Click Refresh again rapidly (multiple clicks within 500ms): only
      one fetch fires (debounce).
- [ ] Switch to **Settings**, change to a `.csv` file. Switch back to
      Data preview. **Status returns to "Click Refresh to load
      preview."** Old data is gone.
- [ ] Refresh. CSV renders with type-inferred columns (`int`, `string`,
      etc.) shown in the header.
- [ ] Pick a non-existent path (rename a file in storage to simulate).
      Refresh. **Inline error**: "This file no longer exists at
      raw/…" + Try Again button. No toast.
- [ ] Pick a JSON file with nested arrays/objects. Cells render as
      truncated JSON strings. Click one — modal opens with the full
      pretty-printed value. Esc closes it.
- [ ] Pick a file >1000 rows (or any file; `total_rows` will reflect
      reality). When `total_rows > 1000`, the orange truncation banner
      appears: "Showing first 1000 of N rows. Use a SQL Activity to
      query the full dataset."
- [ ] Click Refresh, then immediately click another non-blob_storage
      activity on the canvas. **In-flight request is cancelled** (panel
      hides, `/etl/preview/cancel` POST appears in DevTools network).
- [ ] DevTools → Network → click Refresh. Confirm: `POST /etl/preview`
      with body `{request_id, zone, path, limit:1000, no_cache:true}`,
      response body matches `{status:"ok", columns, rows, total_rows,
      truncated, elapsed_ms, format, zone, path, request_id, from_cache}`.

### Build artifacts

```
$ git -C ~/home-server log --oneline -5
56876dc Slice 5: Polish — debounce, tab-away cancel, expand modal
3519b81 Slice 4: wire Data Preview refresh to POST /etl/preview
7dd8145 Slice 3: Data Preview tab shell with all 5 states (no fetch yet)
4c499b6 Slice 2: BlobStorage_Activity class — no upload UI
a7f8d13 Slice 1: proxy /etl/preview + /etl/preview/cancel to local-server

$ git -C ~/local-server log --oneline -1
6d1d94a Add /etl/preview endpoint with caching, format detection, and cancellation
```

To roll back any single slice without touching the others:
`git revert <commit_hash>` in the appropriate repo, then `make` the
home-server and restart both processes.

# BUILD_LOG — HTTP Request settings overhaul

End-to-end build, 7 slices, commits per slice.

## Phase 1 — Discovery

### Stack reality (matches every prior log entry)

- Plain JS, no TypeScript, no bundler. JSDoc types are the convention.
- jQuery 3.2 + jQuery UI + jquery.flowchart + CodeMirror 5 + Chart.js.
  No formik / no Material / no Ant. Form primitives are plain `<input>`
  / `<select>` / `<textarea>` styled with `.input`, `.select`,
  `.buttons`, `.field`, `.label` classes from `etl-design-system.css`.
- Code editor: **CodeMirror 5** (Monaco isn't loaded). The SQL workspace
  uses CM5 with sql + sparksql; same convention applies here. JSON
  editing needs the javascript mode — adding it to `home.html`.
- Tooltip: native `title=""` attribute. No library.
- Collapsible sections: `<details>` / `<summary>` (HTML-native), already
  used by the sidebar panels. No accordion library.
- PathPicker: `window.createPathPicker` (built earlier). Reused for
  multipart File rows + output destination.

### 1. HTTP Request activity today

- File: `templates/etl/http_request.js` (~815 LOC).
- DOM: `#<activityId>_column_edit` flat list of `.select-column-row`
  rows: URL+method, body, then a series of pagination input rows whose
  visibility is toggled by a `pagination_mode` `<select>` with values
  `none | next_url | continuation | offset`. Headers added by
  `_add_column` using the framework's generic header-row template.
- **Saved shape**: `settings.call = [ {fields...} ]` — flat object on
  the first array entry. Headers are flattened into separate
  `{header_key, header_value}` entries appended to the same array.
  Fields persisted today:
  ```
  url, request_type, body,
  headers: { name: value },
  pagination_mode: 'none' | 'next_url' | 'continuation' | 'offset',
  unroll_by,
  next_page_property,
  continuation_property, continuation_query_param,
  offset_param, limit_param, limit_value, total_rows_property
  ```
- **Runtime executor**: `perform_http_call` in `local-server/local-server.py`
  (line ~3510). Reads `settings.call` and dispatches based on
  `pagination_mode`. Currently supports the four modes above.

### 2. Other activity settings panels

- Pattern is very simple: each activity class extends `Activity` and
  builds a flat list of `.field` rows. No tabs, no accordions used
  elsewhere — collapsible sections will be a NEW pattern, but
  `<details>` is HTML-native so it's not a library addition.
- Filter, Cast, Sort, Pivot, etc. all use the same `<select>` +
  `<input>` + per-row delete pattern. Visual style is consistent.

### 3. Form primitives

| Brief asks | What's available | Plan |
|---|---|---|
| Tooltip / popover for help | native `title=""` only | Add a small reusable `infoTip(text)` helper that renders an `(?)` icon with `title=""` — sufficient for our needs. |
| Tabs / accordions | none in use | `<details>` / `<summary>` for sections (HTML-native, no dep). |
| Code editor (Monaco) | CodeMirror 5 (sql, python modes loaded) | Use CM5 with `mode/javascript` (added to `home.html`) for JSON + GraphQL. |
| Validation pattern | inline border/text per-field | Same — a small `.field-error` helper line under each input. |
| Switch / Toggle | none | `<input type="checkbox">` with `.toggle` styling (small CSS addition). |
| Drag-to-reorder | jQuery UI sortable is loaded | Use `.sortable()` for the headers list. |

### 4. Existing pagination support

The existing executor already handles three of the brief's five
strategies:
- `next_url` → close to "Custom field" (next-page URL is in a
  response field).
- `continuation` → "Cursor" (token + query param).
- `offset` → "Offset / Limit" (with total-rows JSON path).

Missing:
- Page-number strategy.
- RFC 5988 Link-header strategy.

Slice 6 adds those two and renames the existing three to match the
brief's vocabulary. Old saved activities are migrated on load by
mapping `pagination_mode` to the new `pagination.strategy`.

### 5. Decisions

- **No new deps.** Sections via `<details>`. Tooltips via `(?)` + `title`.
  Switch via a styled `<input type="checkbox">`. Sortable via the
  already-loaded jQuery UI `.sortable()`.
- **CodeMirror 5** for body editors. New: `mode/javascript` for JSON.
- **Saved shape** keeps `settings.call = [{...}]` for backwards compat
  but adds new sub-fields. Old fields stay readable; new ones are
  written with the brief's `pagination` nested shape *via* the same
  flat array (one entry: `{call: [{ method, url, body, body_format,
  headers, pagination: {...}, timeout, ...}]}`).
- **Variable highlighting.** Use a single style: the field has a
  small "supports {{name}} variables" hint underneath; live highlighting
  inside the `<input>` requires an overlay or contenteditable shim that
  is more code than warranted. Decision: skip live highlighting; show
  the hint + reference. Power users will recognize their own tokens.
- **Test Request** endpoint: new `POST /etl/http_request/test` in
  local-server, proxied via `post_to_local`. One-shot, no pagination,
  size-capped response preview.

## Phase 2 — Design (locked)

Saved JSON shape (one row in `settings.call`):

```json
{
  "url": "https://api.example.com/v1/users",
  "request_type": "GET",
  "body_format": "json|form|multipart|raw|graphql|none",
  "body": "...",
  "body_extras": { "content_type": "...", "graphql_variables": "...",
                   "multipart_files": [{name, path: {zone, path}}] },
  "headers": { "Authorization": "Bearer ...", ... },
  "pagination": {
    "enabled": true,
    "strategy": "offset|page|cursor|link|custom",
    "max_pages": 100,
    "delay_ms": 0,
    "records_path": "data.items",
    /* per-strategy fields */
    "offset_param": "offset", "limit_param": "limit", "limit_value": 100,
    "stop_when": "empty|short_page|total",
    "total_field": "meta.total",
    "page_param": "page", "page_size_param": "per_page", "first_page": 1,
    "has_more_field": "has_more", "total_pages_field": "meta.total_pages",
    "cursor_param": "cursor", "next_cursor_field": "next_cursor",
    "first_request": "no_param|empty|custom",
    "first_cursor_value": "",
    "link_header": "Link", "link_rel": "next",
    "next_url_field": "meta.next_url"
  },
  "timeout_seconds": 30,
  "follow_redirects": true,
  "verify_ssl": true,
  "retry": "none|3|5",
  "output_path": { "zone": "raw", "path": "..." }
}
```

Old fields (`pagination_mode`, `unroll_by`, etc.) are migrated to the
new `pagination.*` shape on load via `_migrateLegacyPagination`.

