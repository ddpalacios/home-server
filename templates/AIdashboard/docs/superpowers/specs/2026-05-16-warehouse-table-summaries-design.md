# Warehouse Computed Table Summaries — Design

**Date:** 2026-05-16
**Status:** Approved design, pending implementation plan

## Problem

When a structured file (CSV, TSV, XLSX, JSON array) is uploaded to the
warehouse, it is currently embedded as raw row text — every row
flattened into `key: value` lines and char-chunked for semantic
search. This has three failures:

1. **No accurate summary.** Asking "what's in our sales data?" returns
   random row chunks, not a clean description. The only structured
   metadata stored is a thin `schema = {columns, row_count}`.
2. **JSON arrays are not queryable.** `_whse_register_tables` registers
   CSV/TSV/XLSX as Spark SQL tables but skips JSON entirely.
3. **Large files are expensive and noisy.** A big CSV produces
   thousands of low-value embedding chunks.

There is also a correctness symptom: the warehouse agent *does* write
Spark SQL against registered tables, but **writes it wrong** — bad
column, wrong filter, wrong aggregation — because the table context it
sees is thin (column names plus two sample values per column). It does
not know real column types, value formats, or the actual distinct
values.

## What already exists (and is NOT rebuilt)

The dual-path architecture — semantic summary + SQL computation — is
~80% built already:

- The app runs under Spark (`spark-submit`); a shared session exists.
- `_whse_register_tables` (`app.py:3379`) registers CSV/TSV/XLSX as
  Spark SQL tables via `save_kb_table(origin='warehouse')`, loaded as
  temp views `kb_<table_name>`.
- The warehouse agent (`_whse_answer` → `_run_kb_ask`) builds a
  "QUERYABLE TABLES (Spark SQL views)" prompt section (`app.py:4230`),
  writes SQL, executes it, and surfaces result tables as proof.
- `_whse_ensure_tables_registered` (`app.py:3456`) is an idempotent
  backfill gated by an index flag.

This design does **not** add per-account Spark session pooling — the
codebase has one shared session for the whole app; cross-account
isolation comes from table *naming*, not session isolation.

## Scope (locked)

v1 is exactly four gaps, all served by one new artifact:

| Gap | Fix |
|---|---|
| No computed summary | A `_whse_table_stats` artifact + a formatted summary embedded as the doc's chunk. |
| JSON not queryable | Extend `_whse_register_tables` to register JSON arrays of objects. |
| Row-dumping large files | For tabular docs, the embedded text becomes the summary, not the row dump. |
| Agent writes bad SQL | The stats artifact enriches the "QUERYABLE TABLES" prompt section. |

**Out of scope for v1:** PII detection/flagging, schema-override UI,
per-account Spark session pooling, versioning UI changes, joins,
write operations, charts.

## The Core Artifact — `_whse_table_stats(rows)`

A new pure-Python function. Input: parsed rows (`[[header...],
[row...], ...]`, already produced by `_whse_extract`). Output: a stats
dict computed purely by counting — **no LLM, no Spark**. Because it is
plain counting, "accurate, not made up" is true by construction.

```
{
  "row_count": 5000,                 # exact, or sampled (see Large Files)
  "stats_source": "full" | "sample",
  "sample_size": 50000,              # present when stats_source == "sample"
  "columns": [
    {"name": "order_id", "type": "text",
     "distinct_count": 5000, "top_values": [["ORD-001", 1], ...],
     "null_count": 0},
    {"name": "product", "type": "text",
     "distinct_count": 42,
     "top_values": [["Widget A", 880], ["Widget B", 612], ...],
     "null_count": 0},
    {"name": "revenue", "type": "number",
     "min": 12.0, "max": 9800.5, "mean": 431.2, "null_count": 3},
    {"name": "date", "type": "date",
     "earliest": "2026-07-01", "latest": "2026-09-30",
     "date_format": "YYYY-MM-DD", "null_count": 0}
  ],
  "sample_rows": [ {col: val, ...}, {...}, {...} ]   # first 3 rows
}
```

**Type inference:** per column, sample the non-null values and classify
as `number`, `date`, or `text`. A column is `number` only if every
sampled value parses as a number; `date` only if every sampled value
parses as a date in one consistent format (the recognised format is
recorded as `date_format`). Anything ambiguous falls back to `text`
— the conservative choice, matching the existing extractor's spirit.
Leading-zero strings like `"001"` stay `text` (they fail strict numeric
parsing only if a non-numeric appears; for v1, if all values are digit
strings the column is `number` — schema-override is deferred, and the
Spark table uses its own `inferSchema`).

**Per-column statistics:**
- `number`: `min`, `max`, `mean`, `null_count`.
- `date`: `earliest`, `latest`, `date_format`, `null_count`.
- `text`: `distinct_count`, `top_values` (top 5 `[value, count]`),
  `null_count`.

XLSX produces one stats dict per sheet.

The stats dict is stored on the document at
`doc["processing"]["table_stats"]` (for XLSX, a list — one per sheet).
For tabular formats this replaces today's thin `schema`.

## Summary Text — `_whse_format_table_summary(doc_name, label, stats)`

Turns a stats dict into factual summary text. Every line is traceable
to a counted number; no LLM is involved.

```
Data table from "Q3_sales.csv". 5,000 rows.
Columns (4):
- order_id (text): 5,000 distinct values
- product (text): 42 distinct values; most common: "Widget A" (880), "Widget B" (612)
- revenue (number): ranges 12.0 to 9800.5, mean 431.20
- date (date): from 2026-07-01 to 2026-09-30
First rows: order_id=ORD-001 · product=Widget A · revenue=49.99 · date=2026-07-01
            ...
This table can be queried with SQL for counts, sums, filters, and group-bys.
```

When `stats_source == "sample"` the text includes:
`(Statistics based on a 50,000-row sample; queries run on the full table.)`

## Processing Flow Changes — `_whse_process_document` (`app.py:3486`)

After `_whse_extract` produces rows:

1. **Tabular formats** (`csv`, `tsv`, `xlsx`, and JSON arrays of
   objects): compute `_whse_table_stats(rows)`. On success, format the
   summary text. The text passed to `_whse_embed_document` becomes
   **the summary**, not the flattened row dump. The full flattened text
   is still written to the processed-text blob (document preview is
   unchanged) — only what is *embedded* changes.
2. **Non-tabular formats** (`pdf`, `docx`, `txt`, `md`, `image`):
   unchanged — full-text embedding, no stats, no table.
3. If `_whse_table_stats` raises: log and fall back to today's behavior
   (thin schema + full-text embedding). The doc still reaches `ready`.

Result: one small, accurate summary chunk per table instead of
thousands of noisy row chunks.

## JSON Tables — `_whse_json_to_rows(recs)` and `_whse_register_tables`

`_whse_register_tables` (`app.py:3379`) currently builds `units` only
for CSV/TSV/XLSX. Extend it: for `json`/`ndjson`, parse the body and
pass the records through a new `_whse_json_to_rows(recs)`:

- Header = the union of all object keys, in first-seen order.
- Each object → one row; a missing key → an empty cell.
- Scalar values → cells; nested objects/arrays → their JSON string
  (lossy but honest; the summary notes "contains nested data").

The resulting rows flow through the existing `_rows_to_csv` →
`save_kb_table` path, identical to CSV.

**JSON not queryable** when records are not all objects, or shapes
barely overlap (a configurable minimum shared-key ratio; v1: require
that the most common key appears in ≥ 60% of records). Then table
registration is skipped. The doc still gets a summary-only embedding
describing it as "a JSON file with N records," and
`doc["processing"]["queryable"] = false` so the UI can label it.

For consistency, `doc["processing"]["queryable"]` is set on every
tabular doc: `true` when a Spark table was registered, `false`
otherwise.

## Agent SQL Prompt Enrichment (`app.py:4230`)

When `_whse_register_tables` calls `save_kb_table`, it passes the stats
dict in `extra`: `save_kb_table(..., extra={..., "table_stats": stats})`.

The "QUERYABLE TABLES" prompt builder (`app.py:4230`) reads
`t.get("table_stats")` and renders rich per-column lines instead of the
current two-sample-value hint:

```
view `kb_sales` (from "Q3_sales.csv") · 5,000 rows
  - order_id   text    5,000 distinct
  - product    text    42 distinct; values: "Widget A","Widget B","Widget C"…
  - revenue    number  range 12.0–9800.5
  - date       date    2026-07-01 … 2026-09-30   (format: YYYY-MM-DD)
```

Real distinct values and the date format are what fix "writes SQL but
gets it wrong" — the agent writes `WHERE date >= '2026-07-01'` rather
than `WHERE date >= 'July 2026'`, and `WHERE product = 'Widget A'`
matching real casing. When `table_stats` is absent (a doc not yet
backfilled), the builder falls back to today's rendering.

## Large Files

`_whse_table_stats` computes over a capped sample — the first ~50,000
rows. When the row count exceeds the cap, `stats_source = "sample"`,
`sample_size` is recorded, and the summary text says so. The registered
Spark table always holds the **full** data (`_whse_register_tables`
already passes full rows). So *describe is sampled, compute is exact*.
Because the row-dump embedding is replaced by the summary, embedding
cost is bounded regardless of file size.

## Error Handling

Failures degrade one level down; a tabular doc always reaches `ready`:

- `_whse_table_stats` raises → fall back to thin schema + full-text
  embedding (today's behavior).
- `_whse_register_tables` fails → already wrapped in try/except; the
  doc keeps its summary embedding, `queryable` is `false`.
- Nothing is orphaned; no doc is left in a failed state because of this
  feature alone.

## Backfill

Tabular documents processed before this feature have no summary chunk
and no stats. A one-time idempotent pass — mirroring
`_whse_ensure_tables_registered` — gated by a new warehouse index flag
`summaries_backfill_done`: for each `ready` tabular doc, recompute
stats, re-embed the summary, and attach stats to its table registry
entry. After the first run the flag makes it a free no-op.

## File Structure

All changes are in `app.py` (single-file codebase).

**New functions:**
- `_whse_table_stats(rows)` — compute the stats dict.
- `_whse_format_table_summary(doc_name, label, stats)` — stats → text.
- `_whse_json_to_rows(recs)` — JSON array of objects → tabular rows.

**Modified functions:**
- `_whse_process_document` (`app.py:3486`) — compute stats, embed the
  summary for tabular docs, set `queryable`.
- `_whse_register_tables` (`app.py:3379`) — handle JSON; attach
  `table_stats` to the registry entry.
- The "QUERYABLE TABLES" prompt builder (`app.py:4230`) — render rich
  per-column lines from `table_stats`.
- A backfill helper alongside `_whse_ensure_tables_registered`.

## Testing (smoke)

1. Upload a CSV with known content → `table_stats` has the exact row
   count, correct column types, and min/max matching a hand
   calculation.
2. The embedded chunk is the summary text, not a row dump; the doc has
   roughly one chunk, not thousands.
3. Ask "what's in this data?" → the summary chunk is retrieved; the
   agent describes the table correctly.
4. Ask an aggregation ("total revenue?") → the agent writes SQL, Spark
   executes it, the result matches a hand-calculated value. Capture the
   actual SQL and result.
5. Upload a JSON array of consistent objects → it registers as a
   queryable table; an aggregation against it works.
6. Upload inconsistent/nested JSON → summary-only fallback,
   `queryable: false`, no crash.
7. Upload an XLSX with two sheets → two stats dicts, two summary
   chunks, two queryable tables.
8. Upload a large CSV (> 50k rows) → `stats_source: "sample"`, the
   summary notes the sample; a `SELECT COUNT(*)` returns the exact full
   count.
9. Force a stats-computation error → the doc falls back to full-text
   embedding and still reaches `ready`.
10. **Regression:** upload a PDF → unchanged full-text embedding, no
    stats, no table; existing warehouse upload, replace, retrieval,
    agent KB, and visibility all still work.
11. Backfill: a pre-existing tabular doc gains a summary chunk and
    stats after the one-time pass; a second call is a no-op.
