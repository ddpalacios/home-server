# PRODUCT_TODO

Future features captured during builds so the work isn't forgotten.

## 1. Sync / Upload activity for backfilling files into blob storage

**Context**: the Blob Storage activity now reads from `raw/` and
`processed/` only — the click-to-upload affordance was removed because
mixing client-parsed payloads with Spark-read paths was confusing and
fragile (1 MB of JSON dumped into the dataflow JSON on every save).

**Gap**: there is no first-class way to populate files into blob
storage from the UI. Today the user has to either:
- save a Notebook cell that writes to a path, or
- manually drop files into `~/home-server/blob-storage/raw/...`.

**Proposal**: a new activity type "Sync to Blob Storage" that takes
upstream rows + a target `{zone, path}` from a `<PathPicker
selectMode='file'>` with mode `'directory'` for the parent and a
filename input. The backend writes the rows out via
`spark.write.json/csv` (or a streaming variant). Reuses the executor
and concurrency cap from `sql_routes`.

Not blocking the current build — Blob Storage is an explicit *reader*,
and its helper text already directs users elsewhere when they need to
populate files first.
