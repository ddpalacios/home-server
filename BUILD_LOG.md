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
