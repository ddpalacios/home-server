# Warehouse Folders — Design

**Date:** 2026-05-16
**Status:** Approved design, pending implementation plan

## Problem

The warehouse document list is flat. Owners with many documents want to
organize them into folders for their own visual sanity. Folders must be
a pure UI/organization layer: how agents access documents, how
retrieval works, how visibility classification works — all unchanged. A
folder is just a label (a path string) on a document.

The owner also needs the upload API to target a folder, so programmatic
uploads land in the right place.

## Decisions (locked)

| Dimension | Decision |
|---|---|
| Folder representation | A `folder_path` string field on each warehouse document. No folders table, no folder IDs. |
| Empty folders | An `empty_folder_paths` string array on the per-account warehouse index blob. |
| Nesting | Forward-slash convention (`Sales/2026/Q3`); ≤ 4 levels; the UI parses the tree. |
| Scope | All three phases: data model + API; sidebar tree + create; move/rename/delete + drag-and-drop; folder-aware upload + agent-KB folder column + bulk-add-folder. |
| Invariant | Folder operations touch only `folder_path` and `empty_folder_paths`. Retrieval, agent `kb_document_ids`, visibility, embeddings never read folders. |

## Data Model

**Warehouse document** (the `_whse_doc_path` blob) gains one field:

```
folder_path: "Sales/2026"     # "" or absent = root
```

- Forward-slash separated; no leading/trailing slash.
- Per segment: letters, numbers, spaces, hyphens, underscores only.
- Maximum 4 levels deep; maximum 200 characters total.
- Path segments match case-insensitively; display preserves case.
- Existing documents read as root when the field is absent — no
  migration pass required.

**Warehouse index blob** (`_index/all.json`, loaded via
`_whse_load_index` — already holds `document_ids` and migration flags)
gains one field:

```
empty_folder_paths: ["Contracts/2026", "Templates"]
```

A string array of folders the owner created before placing any
document in them. When a document is uploaded or moved into such a
path, the path is removed from this list automatically.

A folder **exists** when any document carries its path, or the path is
in `empty_folder_paths`. Folders are emergent from strings.

## Helpers (in `app.py`, alongside the `_whse_*` family)

- `_whse_validate_folder_path(path)` — normalize and validate; raise
  `ValueError` on bad input (empty segment, bad characters, > 4
  levels, > 200 chars). Returns the normalized path.
- `_whse_all_folder_paths(account_id)` — every folder in use: each
  document's `folder_path` plus all its ancestor prefixes, unioned
  with `empty_folder_paths`.
- `_whse_folder_tree(account_id)` — a nested
  `{documents: [...], subfolders: {name: {...}}}` structure for the UI.
- `_whse_drop_empty_folder(account_id, path)` — remove `path` from the
  index's `empty_folder_paths`; called whenever a document lands in a
  path.

## Folder Operations

All operations are account-scoped (paths matched within
`_whse_all_docs(account_id)`).

**Create folder** — `POST` endpoint validates the path and adds it to
`empty_folder_paths`. Rejected (`folder_exists`) if a document already
uses that path. Appears in the sidebar immediately, empty.

**Move a document** — set the document's `folder_path`; call
`_whse_drop_empty_folder` for the target. Only `folder_path` changes —
content, embeddings, agent references, and visibility are untouched.
The move dialog and drag-and-drop both call the same endpoint. Typing
a brand-new path in the dialog creates that folder implicitly.

**Rename a folder** — a batch prefix rewrite: every document whose
`folder_path` equals `old` or starts with `old + "/"` has that prefix
swapped to the new path; matching `empty_folder_paths` entries are
rewritten the same way. Sub-folders are carried along.

**Delete a folder** — two modes:
- *Keep documents (default):* every document under the path gets
  `folder_path = ""` (back to root); the path is removed from
  `empty_folder_paths`.
- *Also delete documents (opt-in):* each document runs through the
  existing `api_warehouse_delete` flow (agent-KB cascade + table
  unregister included).

Dragging a folder onto another folder is a rename that re-parents the
prefix (`"2026"` dropped on `"Contracts"` → `"Contracts/2026"`).

## API — Upload Into a Folder

`POST /api/warehouse/upload?folder=Sales/2026` sets the new document's
`folder_path` to the validated `folder` query parameter. Works for
both multipart and raw-body uploads — a query parameter, consistent
with the existing `?store_as`, `?name`, `?visibility`. An invalid
path returns `400`. The folder need not pre-exist; once the document
carries the path the folder exists, and the path is dropped from
`empty_folder_paths` if it was a placeholder. `/replace` keeps a
document's current folder — replacing content does not move it.

## UI

**Warehouse page (`warehouse.html`):**
- A left **sidebar folder tree** beside the document table. "All docs"
  shows everything; clicking a folder filters the table to that
  folder's documents; nested folders expand/collapse.
- **"+ New folder"** — dialog with a name field and a parent-folder
  dropdown.
- **Move** — a "Move to folder" row action (and detail view), plus
  drag-and-drop of a document row onto a sidebar folder. Dragging a
  folder onto another re-parents it.
- **Rename / Delete** — a small menu on each sidebar folder.
- A **Folder column** in the document table.
- The **upload modal** gets a folder picker, defaulting to the
  currently-focused folder (else root).

**Agent KB tab (`index.html`):**
- The warehouse-document rows in the agent KB table show a **Folder**
  column — purely informational. `GET /me/agents/<id>/kb-documents`
  adds `folder_path` to each document in its response; the row
  renderer displays it.
- The **"Add from warehouse" picker** gets a folder filter and an
  **"Add entire folder"** action — expands a folder to its eligible
  document ids and adds each (visibility-aware for customer agents,
  skips already-referenced documents; it loops the existing per-doc
  add).

## Out of Scope

Folder-level permissions/sharing/visibility; folder-based retrieval
filtering; color/icons; folder descriptions; smart folders;
auto-organization; folder templates; a trash folder; per-folder
quotas; cross-account moves; mobile-optimized folder UI.

## Testing (smoke)

1. Create an empty folder → it appears in `empty_folder_paths` and the
   sidebar; clicking it shows an empty table.
2. Upload into an empty-folder path → the path is dropped from
   `empty_folder_paths`; the folder still shows (now has a document).
3. Move a document between folders → only `folder_path` changes.
4. Rename a folder containing nested sub-folders → every affected
   document's `folder_path` prefix is rewritten; sub-folders preserved.
5. Delete a folder, keep-documents → documents move to root. Delete a
   folder, also-delete-documents → documents removed via the existing
   delete flow.
6. `POST /api/warehouse/upload?folder=...` (multipart and raw-body) →
   the document lands with that `folder_path`; an invalid path → 400.
7. Path validation rejects bad characters, > 4 levels, empty segments.
8. **Adversarial:** capture an agent's retrieval result for a query;
   move / rename / delete the folder its documents live in; re-run the
   query — the retrieved chunks are byte-identical. Folders never
   affect retrieval.
9. Regression: warehouse upload/replace/processing, the API token,
   per-agent KB, bulk delete — all unaffected.
