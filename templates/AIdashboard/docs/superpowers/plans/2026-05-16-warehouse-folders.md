# Warehouse Folders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let warehouse owners organize documents into folders — a `folder_path` string on each document, rendered as a tree — without changing how agents access documents, how retrieval works, or how visibility is classified.

**Architecture:** A folder is a `folder_path` string on the warehouse document blob; folders created before they hold documents live in an `empty_folder_paths` array on the per-account warehouse index blob. The UI parses `/`-separated paths into a tree. Backend helpers and a `/api/warehouse/folders` endpoint manage folders; the upload endpoint takes a `folder` parameter. Retrieval, agent `kb_document_ids`, and visibility never read `folder_path`.

**Tech Stack:** Python/Flask (`local-server/server/app.py`), vanilla JS templates (`home-server/templates/AIdashboard/warehouse.html` and `index.html`), GCS JSON blobs.

---

## Testing note

No pytest harness. Backend is verified with throwaway-account Python smoke scripts that import `app` directly. Frontend is verified manually in a browser. Each task carries its own verification.

## Honcho restart procedure (referenced by backend tasks)

```bash
cd /home/dpalacios
pkill -f "honcho start" 2>/dev/null; sleep 4
(nohup honcho start > /tmp/honcho.log 2>&1 < /dev/null &)
# The FIRST honcho start reliably exits 144. If after ~30s fewer than
# 3 ports listen, run the (nohup honcho start ...) line again.
sleep 28
ss -tlnp 2>/dev/null | grep -cE ':5000|:9030|:9000'   # expect 3
```

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `local-server/server/app.py` | Modify | Folder helpers, `/api/warehouse/folders` endpoint, `folder_path` on upload + `?folder=` param, `folder_path` in `update_meta` (move) and in the kb-documents response |
| `home-server/templates/AIdashboard/warehouse.html` | Modify | Sidebar folder tree, create/rename/delete folder UI, move dialog + drag-and-drop, folder column, upload folder picker |
| `home-server/templates/AIdashboard/index.html` | Modify | Folder column in the agent KB table; folder filter + "Add entire folder" in the warehouse picker |

No new files.

---

### Task 1: Backend — folder helpers, `/api/warehouse/folders`, upload `?folder=`

**Files:**
- Modify: `local-server/server/app.py`
- Test: `local-server/server/_smoke_folders.py` (temporary; removed in Task 7)

- [ ] **Step 1: Write the failing smoke script**

Create `local-server/server/_smoke_folders.py`:

```python
"""Smoke test: warehouse folder helpers. Run from the server dir."""
import os
os.environ.setdefault("FLASK_SECRET_KEY", "x")
import app

TCID = "test_whfolders_01"

def _clean():
    for b in app.get_storage_client().list_blobs(
            app.BUCKET_NAME, prefix=app.crm_base(TCID)):
        b.delete()

def _mkdoc(did, folder):
    doc = {"document_id": did, "account_id": TCID, "status": "ready",
           "visibility": "internal", "version": 1, "name": did,
           "filename": did + ".pdf", "format": "pdf",
           "associated_agent_ids": [], "folder_path": folder,
           "processing": {"chunk_count": 0}}
    app._whse_save_doc(TCID, doc)
    idx = app._whse_load_index(TCID)
    if did not in idx.get("document_ids", []):
        idx.setdefault("document_ids", []).append(did)
        app._whse_save_index(TCID, idx)

_clean()

# 1. validate_folder_path
assert app._whse_validate_folder_path("  Sales/2026  ") == "Sales/2026"
for bad in ["", "a/b/c/d/e", "bad*char", "/"]:
    try:
        app._whse_validate_folder_path(bad)
        raise AssertionError("FAIL: accepted bad path " + repr(bad))
    except ValueError:
        pass
print("1 PASS: path validation")

# 2. all_folder_paths includes ancestor prefixes + empty folders
_mkdoc("doc_a", "Sales/2026")
_mkdoc("doc_b", "")
idx = app._whse_load_index(TCID)
idx["empty_folder_paths"] = ["Templates"]
app._whse_save_index(TCID, idx)
paths = sorted(app._whse_all_folder_paths(TCID))
print("2. folder paths:", paths)
assert paths == ["Sales", "Sales/2026", "Templates"], f"FAIL: {paths}"
print("2 PASS: all_folder_paths")

# 3. folder tree groups docs
tree = app._whse_folder_tree(TCID)
assert any(d["document_id"] == "doc_b" for d in tree["documents"]), "FAIL root"
sub = tree["subfolders"]["Sales"]["subfolders"]["2026"]
assert any(d["document_id"] == "doc_a" for d in sub["documents"]), "FAIL nested"
assert "Templates" in tree["subfolders"], "FAIL empty folder in tree"
print("3 PASS: folder tree")

# 4. drop_empty_folder
app._whse_drop_empty_folder(TCID, "Templates")
assert "Templates" not in app._whse_load_index(TCID).get("empty_folder_paths", [])
print("4 PASS: drop_empty_folder")

_clean()
print("ALL PASS")
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /home/dpalacios/local-server/server && python3 _smoke_folders.py`
Expected: `AttributeError: module 'app' has no attribute '_whse_validate_folder_path'`.

- [ ] **Step 3: Add the folder helpers**

In `app.py`, find `_whse_save_index`:

```python
def _whse_save_index(account_id, index):
    save_blob_json(BUCKET_NAME, _whse_index_path(account_id), index)
```

Insert this block immediately after it:

```python


# ── Warehouse folders — a UI/organization layer. `folder_path` is a
# string on each document; folders with no documents yet live in the
# index's `empty_folder_paths`. Nothing here is read by retrieval,
# agent kb_document_ids, or visibility — folders are labels only.
_WHSE_FOLDER_MAX_DEPTH = 4
_WHSE_FOLDER_SEG_RE = re.compile(r"^[A-Za-z0-9 _\-]+$")


def _whse_validate_folder_path(path):
    """Normalize and validate a folder path. Returns the normalized
    path, or raises ValueError. An empty/blank path is invalid here —
    callers that allow root pass '' without calling this."""
    path = (path or "").strip().strip("/")
    if not path:
        raise ValueError("Folder name can't be empty.")
    if len(path) > 200:
        raise ValueError("Folder path is too long (max 200 characters).")
    segments = [s.strip() for s in path.split("/")]
    if len(segments) > _WHSE_FOLDER_MAX_DEPTH:
        raise ValueError("Folders can be at most 4 levels deep.")
    for seg in segments:
        if not seg:
            raise ValueError("Folder path has an empty segment.")
        if not _WHSE_FOLDER_SEG_RE.match(seg):
            raise ValueError(
                f"'{seg}' has invalid characters — use letters, numbers, "
                "spaces, hyphens, and underscores only.")
    return "/".join(segments)


def _whse_all_folder_paths(account_id):
    """Every folder path in use: each document's folder_path plus all
    its ancestor prefixes, unioned with the index's empty folders."""
    out = set(_whse_load_index(account_id).get("empty_folder_paths") or [])
    for d in _whse_all_docs(account_id):
        p = (d.get("folder_path") or "").strip("/")
        if not p:
            continue
        parts = p.split("/")
        for i in range(1, len(parts) + 1):
            out.add("/".join(parts[:i]))
    return sorted(out)


def _whse_folder_tree(account_id):
    """A nested {documents: [...], subfolders: {name: {...}}} tree
    built from document folder_paths plus empty-folder placeholders."""
    root = {"documents": [], "subfolders": {}}

    def _node_for(path):
        cur = root
        for part in [s for s in path.split("/") if s]:
            cur = cur["subfolders"].setdefault(
                part, {"documents": [], "subfolders": {}})
        return cur

    for d in _whse_all_docs(account_id):
        _node_for((d.get("folder_path") or "")).get(
            "documents").append(d)
    for p in (_whse_load_index(account_id).get("empty_folder_paths") or []):
        _node_for(p)
    return root


def _whse_drop_empty_folder(account_id, path):
    """Remove `path` (and any of its ancestors) from the index's
    empty_folder_paths — called when a document lands in that path."""
    path = (path or "").strip("/")
    if not path:
        return
    idx = _whse_load_index(account_id)
    empty = idx.get("empty_folder_paths") or []
    ancestors = set()
    parts = path.split("/")
    for i in range(1, len(parts) + 1):
        ancestors.add("/".join(parts[:i]))
    kept = [p for p in empty if p not in ancestors]
    if len(kept) != len(empty):
        idx["empty_folder_paths"] = kept
        _whse_save_index(account_id, idx)
```

(`re` is already imported in `app.py`.)

- [ ] **Step 4: Run the smoke script to verify it passes**

Run: `cd /home/dpalacios/local-server/server && python3 _smoke_folders.py`
Expected: `1 PASS` … `4 PASS`, `ALL PASS`.

- [ ] **Step 5: Set `folder_path` on uploaded documents**

In `app.py`, find this block in `api_warehouse_upload`:

```python
    document_id = "doc_" + uuid.uuid4().hex[:12]
    now = datetime.utcnow().isoformat() + "Z"
    # Friendly name = provided name, else filename without extension.
    name = (request.values.get("name") or "").strip()
    if not name:
        name = filename.rsplit(".", 1)[0] if "." in filename else filename
```

Replace with:

```python
    document_id = "doc_" + uuid.uuid4().hex[:12]
    now = datetime.utcnow().isoformat() + "Z"
    # Friendly name = provided name, else filename without extension.
    name = (request.values.get("name") or "").strip()
    if not name:
        name = filename.rsplit(".", 1)[0] if "." in filename else filename
    # Optional ?folder= — drop the document straight into a folder.
    folder_raw = (request.values.get("folder") or "").strip().strip("/")
    folder_path = ""
    if folder_raw:
        try:
            folder_path = _whse_validate_folder_path(folder_raw)
        except ValueError as exc:
            return jsonify({"error": "invalid_folder",
                            "message": str(exc)}), 400
```

- [ ] **Step 6: Store `folder_path` on the new-document dict**

In `app.py`, find this line inside the `doc = {` dict in `api_warehouse_upload`:

```python
        "tags":          [],
        "format":        fmt,
```

Replace with:

```python
        "tags":          [],
        "folder_path":   folder_path,
        "format":        fmt,
```

- [ ] **Step 7: Drop the empty-folder placeholder after the upload succeeds**

In `app.py`, find this block near the end of `api_warehouse_upload`:

```python
    _whse_save_doc(cid, doc)
    _whse_index_add_document(cid, document_id)
```

Replace with:

```python
    _whse_save_doc(cid, doc)
    _whse_index_add_document(cid, document_id)
    if folder_path:
        _whse_drop_empty_folder(cid, folder_path)
```

- [ ] **Step 8: Add the `/api/warehouse/folders` endpoint**

In `app.py`, find the end of `api_warehouse_copy_from_kb` — the line:

```python
    return ({"ok": True, "document_id": doc_id}), 200
```

immediately followed by `@app.route("/api/warehouse/upload", methods=["POST"])`. Insert this new route between them:

```python


@app.route("/api/warehouse/folders", methods=["GET", "POST", "OPTIONS"])
def api_warehouse_folders():
    """Manage warehouse folders — a UI organization layer.

    GET  -> {folders: [path, ...]}  every folder in use.
    POST -> body {op:"create"|"rename"|"delete", ...}:
      create: {op:"create", path}
      rename: {op:"rename", path, new_path}  (batch prefix rewrite)
      delete: {op:"delete", path, delete_documents?:bool}
    Folder operations only touch folder_path and empty_folder_paths."""
    if request.method == "OPTIONS":
        return ("", 204)
    cid, err = _dbig_require_session()
    if err:
        return err

    if request.method == "GET":
        return jsonify({"folders": _whse_all_folder_paths(cid)}), 200

    body = request.get_json(silent=True) or {}
    op = (body.get("op") or "").strip().lower()

    if op == "create":
        try:
            path = _whse_validate_folder_path(body.get("path"))
        except ValueError as exc:
            return jsonify({"error": "invalid_folder",
                            "message": str(exc)}), 400
        if path in _whse_all_folder_paths(cid):
            return jsonify({"error": "folder_exists",
                            "message": "That folder already exists."}), 409
        idx = _whse_load_index(cid)
        empty = idx.get("empty_folder_paths") or []
        if path not in empty:
            empty.append(path)
            idx["empty_folder_paths"] = sorted(empty)
            _whse_save_index(cid, idx)
        return jsonify({"ok": True, "path": path}), 200

    if op == "rename":
        old = (body.get("path") or "").strip().strip("/")
        try:
            new = _whse_validate_folder_path(body.get("new_path"))
        except ValueError as exc:
            return jsonify({"error": "invalid_folder",
                            "message": str(exc)}), 400
        if not old:
            return jsonify({"error": "invalid_folder",
                            "message": "Missing folder to rename."}), 400
        affected = 0
        for d in _whse_all_docs(cid):
            cur = (d.get("folder_path") or "").strip("/")
            if cur == old or cur.startswith(old + "/"):
                d["folder_path"] = new + cur[len(old):]
                d["updated_at"] = datetime.utcnow().isoformat() + "Z"
                _whse_save_doc(cid, d)
                affected += 1
        idx = _whse_load_index(cid)
        empty = idx.get("empty_folder_paths") or []
        idx["empty_folder_paths"] = sorted({
            (new + p[len(old):]) if (p == old or p.startswith(old + "/"))
            else p
            for p in empty})
        _whse_save_index(cid, idx)
        return jsonify({"ok": True, "affected": affected}), 200

    if op == "delete":
        path = (body.get("path") or "").strip().strip("/")
        if not path:
            return jsonify({"error": "invalid_folder",
                            "message": "Missing folder to delete."}), 400
        also_delete = bool(body.get("delete_documents"))
        victims = [d for d in _whse_all_docs(cid)
                   if (d.get("folder_path") or "").strip("/") == path
                   or (d.get("folder_path") or "").strip("/").startswith(
                       path + "/")]
        for d in victims:
            if also_delete:
                _whse_delete_document_fully(cid, d.get("document_id"))
            else:
                d["folder_path"] = ""
                d["updated_at"] = datetime.utcnow().isoformat() + "Z"
                _whse_save_doc(cid, d)
        idx = _whse_load_index(cid)
        empty = idx.get("empty_folder_paths") or []
        idx["empty_folder_paths"] = [
            p for p in empty
            if p != path and not p.startswith(path + "/")]
        _whse_save_index(cid, idx)
        return jsonify({"ok": True, "affected": len(victims),
                        "deleted_documents": also_delete}), 200

    return jsonify({"error": "unsupported_op"}), 400
```

- [ ] **Step 9: Add the `_whse_delete_document_fully` helper used by folder-delete**

The folder-delete branch above calls `_whse_delete_document_fully`. The full delete logic currently lives inline in `api_warehouse_delete`. Extract it into a reusable helper.

In `app.py`, find this block at the end of `api_warehouse_delete`:

```python
    doc = _whse_load_doc(cid, document_id)
    if not doc:
        return jsonify({"error": "not_found"}), 404
    # Delete the raw file(s) + metadata + de-index.
    try:
        client = get_storage_client()
        bucket = client.bucket(BUCKET_NAME)
        for b in client.list_blobs(
                BUCKET_NAME, prefix=f"{_whse_base(cid)}/{document_id}/"):
            try:
                b.delete()
            except Exception:
                pass
        meta = bucket.blob(_whse_doc_path(cid, document_id))
        if meta.exists():
            meta.delete()
    except Exception as exc:
        print(f"[warehouse] delete cleanup failed doc={document_id}: "
              f"{exc!r}", flush=True)
    _whse_unregister_tables(cid, document_id)
    _whse_cascade_remove_doc_from_agents(cid, document_id)
    idx = _whse_load_index(cid)
    if document_id in idx.get("document_ids", []):
        idx["document_ids"] = [d for d in idx["document_ids"]
                               if d != document_id]
        _whse_save_index(cid, idx)
    return jsonify({"ok": True}), 200
```

Replace it with:

```python
    doc = _whse_load_doc(cid, document_id)
    if not doc:
        return jsonify({"error": "not_found"}), 404
    _whse_delete_document_fully(cid, document_id)
    return jsonify({"ok": True}), 200
```

Then, immediately BEFORE the `@app.route("/api/warehouse/documents/<document_id>",`
decorator that starts `api_warehouse_delete`, insert the helper:

```python
def _whse_delete_document_fully(cid, document_id):
    """Delete a warehouse document — raw files, metadata, SQL tables,
    de-index, and the per-agent kb_document_ids cascade. Shared by the
    delete endpoint and folder-delete."""
    try:
        client = get_storage_client()
        bucket = client.bucket(BUCKET_NAME)
        for b in client.list_blobs(
                BUCKET_NAME, prefix=f"{_whse_base(cid)}/{document_id}/"):
            try:
                b.delete()
            except Exception:
                pass
        meta = bucket.blob(_whse_doc_path(cid, document_id))
        if meta.exists():
            meta.delete()
    except Exception as exc:
        print(f"[warehouse] delete cleanup failed doc={document_id}: "
              f"{exc!r}", flush=True)
    _whse_unregister_tables(cid, document_id)
    _whse_cascade_remove_doc_from_agents(cid, document_id)
    idx = _whse_load_index(cid)
    if document_id in idx.get("document_ids", []):
        idx["document_ids"] = [d for d in idx["document_ids"]
                               if d != document_id]
        _whse_save_index(cid, idx)
```

- [ ] **Step 10: Verify the file parses**

Run: `cd /home/dpalacios/local-server/server && python3 -c "import ast; ast.parse(open('app.py').read()); print('OK')"`
Expected: `OK`.

- [ ] **Step 11: Restart honcho and confirm services**

Restart honcho (see procedure above). Expect `3`.

- [ ] **Step 12: Commit**

```bash
git -C /home/dpalacios/local-server -c user.name="dpalacios" -c user.email="palaciosdanieldario@gmail.com" commit -am "feat: warehouse folder helpers, /api/warehouse/folders, upload ?folder="
```

---

### Task 2: Backend — move a document into a folder; expose `folder_path` to the agent KB tab

**Files:**
- Modify: `local-server/server/app.py` — `update_meta` branch of `api_warehouse_delete`; the GET branch of `me_agent_kb_documents`

- [ ] **Step 1: Accept `folder_path` in the document `update_meta` op (this is "move")**

In `app.py`, find this block in the `update_meta` branch of `api_warehouse_delete`:

```python
            # Advanced agent scoping: a non-empty list restricts the doc
            # to exactly those agents, overriding the visibility class.
            if "associated_agent_ids" in body:
                ids = body.get("associated_agent_ids") or []
                if isinstance(ids, list):
                    valid = {a.get("id") for a in
                             (_load_agents(cid).get("agents") or [])}
                    doc["associated_agent_ids"] = [
                        str(x) for x in ids if str(x) in valid][:50]
            doc["updated_at"] = datetime.utcnow().isoformat() + "Z"
            _whse_save_doc(cid, doc)
            return jsonify(_whse_doc_public(doc)), 200
```

Replace with:

```python
            # Advanced agent scoping: a non-empty list restricts the doc
            # to exactly those agents, overriding the visibility class.
            if "associated_agent_ids" in body:
                ids = body.get("associated_agent_ids") or []
                if isinstance(ids, list):
                    valid = {a.get("id") for a in
                             (_load_agents(cid).get("agents") or [])}
                    doc["associated_agent_ids"] = [
                        str(x) for x in ids if str(x) in valid][:50]
            # Move the document into a folder. "" means root. Only
            # folder_path changes — content/agents/visibility untouched.
            if "folder_path" in body:
                raw = (body.get("folder_path") or "").strip().strip("/")
                if raw:
                    try:
                        doc["folder_path"] = _whse_validate_folder_path(raw)
                    except ValueError as exc:
                        return jsonify({"error": "invalid_folder",
                                        "message": str(exc)}), 400
                    _whse_drop_empty_folder(cid, doc["folder_path"])
                else:
                    doc["folder_path"] = ""
            doc["updated_at"] = datetime.utcnow().isoformat() + "Z"
            _whse_save_doc(cid, doc)
            return jsonify(_whse_doc_public(doc)), 200
```

- [ ] **Step 2: Include `folder_path` in the agent KB-documents response**

In `app.py`, find this block in the GET branch of `me_agent_kb_documents`:

```python
            docs.append({
                "document_id": d.get("document_id"),
                "name":        d.get("name") or d.get("filename"),
                "format":      d.get("format"),
                "visibility":  _whse_doc_visibility(d),
                "status":      d.get("status"),
                "chunk_count": (d.get("processing") or {}).get(
                    "chunk_count") or 0,
                "uploaded_at": d.get("uploaded_at"),
                "updated_at":  d.get("updated_at"),
            })
```

Replace with:

```python
            docs.append({
                "document_id": d.get("document_id"),
                "name":        d.get("name") or d.get("filename"),
                "format":      d.get("format"),
                "visibility":  _whse_doc_visibility(d),
                "status":      d.get("status"),
                "chunk_count": (d.get("processing") or {}).get(
                    "chunk_count") or 0,
                "uploaded_at": d.get("uploaded_at"),
                "updated_at":  d.get("updated_at"),
                "folder_path": d.get("folder_path") or "",
            })
```

- [ ] **Step 3: Verify the file parses**

Run: `cd /home/dpalacios/local-server/server && python3 -c "import ast; ast.parse(open('app.py').read()); print('OK')"`
Expected: `OK`.

- [ ] **Step 4: Restart honcho**

Restart honcho (see procedure). Expect `3`.

- [ ] **Step 5: End-to-end smoke test of the folder backend**

```bash
cd /home/dpalacios/local-server/server && python3 - <<'EOF'
import os, subprocess, json
os.environ.setdefault("FLASK_SECRET_KEY", "x")
import app
TCID = "test_whfolders_e2e"
H = "https://infallibly-nonbrutal-soila.ngrok-free.dev"
for b in app.get_storage_client().list_blobs(app.BUCKET_NAME, prefix=app.crm_base(TCID)):
    b.delete()
tok = app._whse_generate_api_token(TCID)["token"]

def upload(folder):
    open("/tmp/wf.csv", "w").write("a,b\n1,2\n")
    out = subprocess.run([
        "curl", "-sS", "-o", "/tmp/wf.json", "-w", "%{http_code}",
        "-X", "POST", H + "/api/warehouse/upload?folder=" + folder,
        "-H", "Authorization: Bearer " + tok,
        "-F", "file=@/tmp/wf.csv"], capture_output=True, text=True)
    return out.stdout.strip(), json.load(open("/tmp/wf.json"))

c, d = upload("Sales/2026")
print("1. upload ?folder=Sales/2026 ->", c, "folder_path=" + repr(d.get("folder_path")))
assert c == "202" and d.get("folder_path") == "Sales/2026", f"FAIL: {d}"

c2, d2 = upload("bad*name")
print("2. upload ?folder=bad*name ->", c2, d2.get("error"))
assert c2 == "400" and d2.get("error") == "invalid_folder", f"FAIL: {d2}"
print("ALL PASS")

for b in app.get_storage_client().list_blobs(app.BUCKET_NAME, prefix=app.crm_base(TCID)):
    b.delete()
print("cleanup done")
EOF
```

Expected: `1.` → `202`, `folder_path='Sales/2026'`; `2.` → `400 invalid_folder`; `ALL PASS`.

- [ ] **Step 6: Commit**

```bash
git -C /home/dpalacios/local-server -c user.name="dpalacios" -c user.email="palaciosdanieldario@gmail.com" commit -am "feat: move documents between folders via update_meta; folder_path in kb-documents"
```

---

### Task 3: Warehouse UI — sidebar folder tree, folder filter, create-folder, folder column

**Files:**
- Modify: `home-server/templates/AIdashboard/warehouse.html`

This task makes `warehouse.html`'s list view a two-pane layout: a folder sidebar on the left, the document table on the right. Clicking a folder filters the table.

- [ ] **Step 1: Add the sidebar + folder CSS**

In `warehouse.html`, find the line `.doc-table-wrap { border:1px solid var(--line); border-radius:12px; overflow:hidden; }`. Insert this CSS block immediately before it:

```css
  .wh-list-layout { display:flex; gap:16px; align-items:flex-start; }
  .wh-folder-pane {
    flex:0 0 220px; border:1px solid var(--line); border-radius:12px;
    padding:8px; background:var(--soft);
  }
  .wh-folder-main { flex:1; min-width:0; }
  .wh-folder-item {
    display:flex; align-items:center; gap:6px; padding:7px 9px;
    border-radius:8px; cursor:pointer; font-size:13px;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }
  .wh-folder-item:hover { background:var(--line); }
  .wh-folder-item.active { background:var(--accent); color:#fff; }
  .wh-folder-item .wh-folder-menu {
    margin-left:auto; opacity:0; border:0; background:transparent;
    cursor:pointer; font-size:14px; color:inherit; padding:0 4px;
  }
  .wh-folder-item:hover .wh-folder-menu { opacity:.7; }
  .wh-folder-children { margin-left:14px; }
  .wh-folder-new {
    margin-top:8px; width:100%; border:1px dashed var(--line);
    background:transparent; border-radius:8px; padding:7px;
    font:inherit; font-size:12.5px; color:var(--sub); cursor:pointer;
  }
  .wh-folder-new:hover { color:var(--accent); border-color:var(--accent); }
  .wh-folder-drop { outline:2px dashed var(--accent); outline-offset:-2px; }
  .doc-folder-cell { color:var(--sub); font-size:12.5px; }
  [data-theme="dark"] .wh-folder-pane { background:#161a22; }
  [data-theme="dark"] .wh-folder-item:hover { background:#26303d; }
```

- [ ] **Step 2: Wrap the document table in the sidebar layout**

In `warehouse.html`, find `<div class="doc-table-wrap">` (the opening of the document table). Replace it with:

```html
    <div class="wh-list-layout">
      <div class="wh-folder-pane" id="whFolderPane"></div>
      <div class="wh-folder-main">
    <div class="doc-table-wrap">
```

Then find the matching `</div>` that closes `doc-table-wrap` — it is the `</div>` on the line right after `</table>`:

```html
        </tbody>
      </table>
    </div>
```

Replace that with:

```html
        </tbody>
      </table>
    </div>
      </div><!-- /wh-folder-main -->
    </div><!-- /wh-list-layout -->
```

- [ ] **Step 3: Add the Folder column to the table header**

In `warehouse.html`, find the table header row:

```html
          <tr>
            <th class="th-check"><input type="checkbox" id="docCheckAll" aria-label="Select all documents"></th>
            <th>Name</th><th>Format</th><th>Size</th><th>Added</th><th>Status</th>
            <th>Access</th>
            <th class="th-act">Preview</th>
          </tr>
```

Replace with:

```html
          <tr>
            <th class="th-check"><input type="checkbox" id="docCheckAll" aria-label="Select all documents"></th>
            <th>Name</th><th>Folder</th><th>Format</th><th>Size</th><th>Added</th><th>Status</th>
            <th>Access</th>
            <th class="th-act">Preview</th>
          </tr>
```

The table now has 9 columns. Update the empty-state colspans: run
`sed -i 's/colspan="8"/colspan="9"/g'` on `warehouse.html`.

- [ ] **Step 4: Add the Folder cell to both row renderers in `renderList`**

In `warehouse.html`, find the live-source row return and add a folder cell. Find:

```html
          '<td class="td-check"></td>' +
          '<td><span class="doc-name">📅 ' + esc(d.name) +
```

Replace with:

```html
          '<td class="td-check"></td>' +
          '<td><span class="doc-name">📅 ' + esc(d.name) +
          ' <span class="live-badge">Live</span></span></td>' +
          '<td class="doc-folder-cell">—</td>' +
```

WAIT — that duplicates the name cell. Instead, find the live row's
name cell line precisely:

```html
          '<td><span class="doc-name">📅 ' + esc(d.name) +
            ' <span class="live-badge">Live</span></span></td>' +
          '<td><span class="doc-fmt">Live source</span></td>' +
```

Replace with:

```html
          '<td><span class="doc-name">📅 ' + esc(d.name) +
            ' <span class="live-badge">Live</span></span></td>' +
          '<td class="doc-folder-cell">—</td>' +
          '<td><span class="doc-fmt">Live source</span></td>' +
```

Then find the normal document row's name cell:

```html
        '<td><span class="doc-name">' + esc(d.name) + "</span></td>" +
        '<td><span class="doc-fmt">' + esc(d.format) + "</span></td>" +
```

Replace with:

```html
        '<td><span class="doc-name">' + esc(d.name) + "</span></td>" +
        '<td class="doc-folder-cell">' +
          esc((d.folder_path || "").split("/").join(" / ") || "(root)") +
        "</td>" +
        '<td><span class="doc-fmt">' + esc(d.format) + "</span></td>" +
```

- [ ] **Step 5: Add folder state + filter to `renderList`**

In `warehouse.html`, find the start of `renderList`:

```javascript
  function renderList() {
    var q = ($("searchInput").value || "").trim().toLowerCase();
    var fmtF = $("formatFilter").value;
    var sort = $("sortSel").value;
    var rows = allDocs.filter(function (d) {
      if (fmtF && d.format !== fmtF) return false;
      if (q && (d.name || "").toLowerCase().indexOf(q) < 0 &&
               (d.filename || "").toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
```

Replace with:

```javascript
  function renderList() {
    var q = ($("searchInput").value || "").trim().toLowerCase();
    var fmtF = $("formatFilter").value;
    var sort = $("sortSel").value;
    var rows = allDocs.filter(function (d) {
      if (fmtF && d.format !== fmtF) return false;
      if (q && (d.name || "").toLowerCase().indexOf(q) < 0 &&
               (d.filename || "").toLowerCase().indexOf(q) < 0) return false;
      // Folder filter — activeFolder "" means "All docs" (show all);
      // a folder shows that folder and everything nested under it.
      if (activeFolder) {
        var fp = d.folder_path || "";
        if (fp !== activeFolder && fp.indexOf(activeFolder + "/") !== 0)
          return false;
      }
      return true;
    });
```

- [ ] **Step 6: Add folder state var + the sidebar renderer**

In `warehouse.html`, find `var selectedDocs = new Set();` and insert after it:

```javascript
  var activeFolder = "";          // "" = All docs
  var folderPaths = [];           // every folder path, from /folders
```

Then find the `function loadList()` definition and insert this complete
folder-sidebar block immediately before it:

```javascript
  function loadFolders() {
    fetch("/api/warehouse/folders", { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        folderPaths = (d && d.folders) || [];
        renderFolderPane();
      })
      .catch(function () { folderPaths = []; renderFolderPane(); });
  }
  function renderFolderPane() {
    var pane = $("whFolderPane");
    if (!pane) return;
    // Build a nested tree from the flat path list.
    var tree = {};
    folderPaths.forEach(function (p) {
      var cur = tree;
      p.split("/").forEach(function (seg) {
        cur[seg] = cur[seg] || { __children: {} };
        cur = cur[seg].__children;
      });
    });
    pane.innerHTML = "";
    var allItem = document.createElement("div");
    allItem.className = "wh-folder-item" + (activeFolder ? "" : " active");
    allItem.textContent = "📁 All docs";
    allItem.addEventListener("click", function () {
      activeFolder = ""; renderFolderPane(); renderList();
    });
    pane.appendChild(allItem);

    function renderLevel(node, prefix, container) {
      Object.keys(node).sort().forEach(function (seg) {
        var path = prefix ? prefix + "/" + seg : seg;
        var item = document.createElement("div");
        item.className = "wh-folder-item" +
          (activeFolder === path ? " active" : "");
        item.dataset.folder = path;
        var label = document.createElement("span");
        label.textContent = "📁 " + seg;
        label.style.flex = "1";
        label.style.overflow = "hidden";
        label.style.textOverflow = "ellipsis";
        item.appendChild(label);
        var menu = document.createElement("button");
        menu.type = "button";
        menu.className = "wh-folder-menu";
        menu.textContent = "⋯";
        menu.addEventListener("click", function (e) {
          e.stopPropagation();
          window.__whFolderMenu(menu, path);
        });
        item.appendChild(menu);
        item.addEventListener("click", function () {
          activeFolder = path; renderFolderPane(); renderList();
        });
        // Drag-and-drop target — a document row dropped here moves it.
        item.addEventListener("dragover", function (e) {
          e.preventDefault(); item.classList.add("wh-folder-drop");
        });
        item.addEventListener("dragleave", function () {
          item.classList.remove("wh-folder-drop");
        });
        item.addEventListener("drop", function (e) {
          e.preventDefault(); item.classList.remove("wh-folder-drop");
          var docId = e.dataTransfer.getData("text/document-id");
          if (docId) window.__whMoveDoc(docId, path);
        });
        container.appendChild(item);
        var kids = node[seg].__children;
        if (Object.keys(kids).length) {
          var sub = document.createElement("div");
          sub.className = "wh-folder-children";
          container.appendChild(sub);
          renderLevel(kids, path, sub);
        }
      });
    }
    renderLevel(tree, "", pane);

    var newBtn = document.createElement("button");
    newBtn.type = "button";
    newBtn.className = "wh-folder-new";
    newBtn.textContent = "+ New folder";
    newBtn.addEventListener("click", window.__whNewFolder);
    pane.appendChild(newBtn);
  }
  // Stubs replaced in Task 4. Defined now so Task 3 is testable.
  window.__whFolderMenu = window.__whFolderMenu || function () {
    alert("Folder actions arrive in the next update.");
  };
  window.__whMoveDoc = window.__whMoveDoc || function () {};
  window.__whNewFolder = function () {
    var name = (prompt("New folder name (use / for nesting):") || "").trim();
    if (!name) return;
    fetch("/api/warehouse/folders", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "create", path: name }),
    }).then(function (r) {
        return r.json().catch(function () { return {}; })
          .then(function (j) { return { ok: r.ok, j: j }; });
      })
      .then(function (res) {
        if (res.ok) { loadFolders(); }
        else { alert("Couldn't create folder: " +
          ((res.j && res.j.message) || (res.j && res.j.error) || "error")); }
      })
      .catch(function () { alert("Network error."); });
  };
```

- [ ] **Step 7: Call `loadFolders()` whenever the list loads**

In `warehouse.html`, find `function loadList()` and the `.then` where it
calls `renderList()`. Find:

```javascript
        renderQuota(d.used_bytes || 0, d.quota_bytes || 0);
        refreshFormatFilter();
        renderList();
```

Replace with:

```javascript
        renderQuota(d.used_bytes || 0, d.quota_bytes || 0);
        refreshFormatFilter();
        renderList();
        loadFolders();
```

- [ ] **Step 8: Manual smoke test**

`warehouse.html` is a Jinja template served directly — no build. Hard-refresh
`#warehouse`:
1. A folder sidebar appears left of the document table with "📁 All docs".
2. Click "+ New folder", name it `Contracts` → it appears in the sidebar.
3. Create `Contracts/2026` → it nests under Contracts.
4. The table has a "Folder" column showing `(root)` for unfiled docs.
5. Click a folder → table filters to that folder (empty for a new folder).
6. Click "All docs" → all documents show again.

State explicitly if you cannot drive a browser.

- [ ] **Step 9: Commit**

```bash
cd /home/dpalacios/home-server
git add templates/AIdashboard/warehouse.html
git -c user.name="dpalacios" -c user.email="palaciosdanieldario@gmail.com" commit -m "feat: warehouse folder sidebar tree, folder filter, create folder, folder column"
```

---

### Task 4: Warehouse UI — move documents, rename/delete folders, drag-and-drop

**Files:**
- Modify: `home-server/templates/AIdashboard/warehouse.html`

- [ ] **Step 1: Make document rows draggable**

In `warehouse.html`, find the non-live document row return in `renderList`:

```javascript
      return '<tr class="doc-row" data-id="' + esc(d.document_id) + '">' +
```

Replace with:

```javascript
      return '<tr class="doc-row" draggable="true" data-id="' +
        esc(d.document_id) + '">' +
```

Then find the `.doc-row` click-wiring block:

```javascript
    Array.prototype.forEach.call(body.querySelectorAll(".doc-row"), function (tr) {
      // The live-source (calendar) row has no document detail view.
      if (tr.dataset.live) return;
      tr.addEventListener("click", function () { openDetail(tr.dataset.id); });
    });
```

Replace with:

```javascript
    Array.prototype.forEach.call(body.querySelectorAll(".doc-row"), function (tr) {
      // The live-source (calendar) row has no document detail view.
      if (tr.dataset.live) return;
      tr.addEventListener("click", function () { openDetail(tr.dataset.id); });
      tr.addEventListener("dragstart", function (e) {
        e.dataTransfer.setData("text/document-id", tr.dataset.id);
        e.dataTransfer.effectAllowed = "move";
      });
    });
```

- [ ] **Step 2: Implement `__whMoveDoc` (used by drag-and-drop and the move action)**

In `warehouse.html`, find this stub line:

```javascript
  window.__whMoveDoc = window.__whMoveDoc || function () {};
```

Replace it with:

```javascript
  window.__whMoveDoc = function (docId, folderPath) {
    fetch("/api/warehouse/documents/" + encodeURIComponent(docId), {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "update_meta",
                             folder_path: folderPath || "" }),
    }).then(function (r) {
        return r.json().catch(function () { return {}; })
          .then(function (j) { return { ok: r.ok, j: j }; });
      })
      .then(function (res) {
        if (res.ok) {
          toast("Moved to " + (folderPath || "root") + ".");
          loadList();
        } else {
          alert("Couldn't move: " + ((res.j && res.j.message) ||
            (res.j && res.j.error) || "error"));
        }
      })
      .catch(function () { alert("Network error."); });
  };
```

- [ ] **Step 3: Implement the folder `⋯` menu (rename / delete)**

In `warehouse.html`, find this stub:

```javascript
  window.__whFolderMenu = window.__whFolderMenu || function () {
    alert("Folder actions arrive in the next update.");
  };
```

Replace it with:

```javascript
  window.__whFolderMenu = function (anchor, path) {
    var leaf = path.split("/").pop();
    var choice = prompt(
      'Folder "' + path + '"\n\n' +
      'Type "rename" to rename it, or "delete" to delete it ' +
      "(documents move to root):");
    choice = (choice || "").trim().toLowerCase();
    if (choice === "rename") {
      var nn = (prompt("New name for this folder:", leaf) || "").trim();
      if (!nn) return;
      var parts = path.split("/"); parts[parts.length - 1] = nn;
      fetch("/api/warehouse/folders", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "rename", path: path,
                               new_path: parts.join("/") }),
      }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (j) {
            toast("Folder renamed (" + (j.affected || 0) + " documents).");
            if (activeFolder === path || activeFolder.indexOf(path + "/") === 0)
              activeFolder = "";
            loadList();
          } else { alert("Couldn't rename the folder."); }
        })
        .catch(function () { alert("Network error."); });
    } else if (choice === "delete") {
      var alsoDel = confirm(
        'Delete folder "' + path + '".\n\n' +
        "OK = also DELETE the documents in it (permanent).\n" +
        "Cancel = keep the documents (they move to root).");
      fetch("/api/warehouse/folders", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "delete", path: path,
                               delete_documents: alsoDel }),
      }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (j) {
            toast(alsoDel
              ? ((j.affected || 0) + " documents deleted.")
              : "Folder removed; documents moved to root.");
            if (activeFolder === path || activeFolder.indexOf(path + "/") === 0)
              activeFolder = "";
            loadList();
          } else { alert("Couldn't delete the folder."); }
        })
        .catch(function () { alert("Network error."); });
    }
  };
```

- [ ] **Step 4: Add a "Move to folder" action on the document detail view**

In `warehouse.html`, find the detail-view action buttons — the line with
`id="dDelete"`:

```html
      <button type="button" class="btn btn-danger" id="dDelete">Delete</button>
```

Replace with:

```html
      <button type="button" class="btn" id="dMove">Move to folder</button>
      <button type="button" class="btn btn-danger" id="dDelete">Delete</button>
```

Then find where `dDelete` is wired (`$("dDelete").onclick = ...`) and add,
immediately after that line:

```javascript
    $("dMove").onclick = function () {
      var dest = (prompt("Move to folder (blank = root, / to nest):",
                          d.folder_path || "") || "").trim();
      window.__whMoveDoc(d.document_id, dest);
    };
```

- [ ] **Step 5: Manual smoke test**

Hard-refresh `#warehouse`:
1. Drag a document row onto a folder in the sidebar → it moves (toast),
   the table reflects the new folder.
2. Open a document → "Move to folder" → type a folder → it moves.
3. Folder `⋯` → "rename" → the folder and its docs update.
4. Folder `⋯` → "delete", Cancel → documents move to root, folder gone.
5. **Adversarial:** before moving a document, note an agent that
   references it still answers from it; after the move, confirm the
   agent's answer is unchanged (folders don't touch retrieval).

State explicitly if you cannot drive a browser.

- [ ] **Step 6: Commit**

```bash
cd /home/dpalacios/home-server
git add templates/AIdashboard/warehouse.html
git -c user.name="dpalacios" -c user.email="palaciosdanieldario@gmail.com" commit -m "feat: move documents between folders (drag-and-drop + action); rename/delete folders"
```

---

### Task 5: Warehouse UI — folder picker on upload

**Files:**
- Modify: `home-server/templates/AIdashboard/warehouse.html`

- [ ] **Step 1: Add a folder `<select>` to the upload visibility row**

In `warehouse.html`, find the `up-vis-row` block (the "New uploads:"
visibility selector). Find the line:

```html
      <span class="up-vis-note">Internal is the safe default — customer
        bots can't read internal files. Change it per document
        anytime.</span>
```

Insert immediately AFTER it (still inside `up-vis-row`):

```html
      <label class="up-folder-label">Folder:
        <select id="upFolderSelect"><option value="">Root</option></select>
      </label>
```

- [ ] **Step 2: Populate the upload folder `<select>` from the folder list**

In `warehouse.html`, find `function renderFolderPane()` and, at its very
end (after `pane.appendChild(newBtn);`), insert:

```javascript
    var upSel = document.getElementById("upFolderSelect");
    if (upSel) {
      var prev = upSel.value;
      upSel.innerHTML = '<option value="">Root</option>';
      folderPaths.forEach(function (p) {
        var o = document.createElement("option");
        o.value = p;
        o.textContent = p.split("/").join(" / ");
        upSel.appendChild(o);
      });
      // Keep the previous choice, else default to the active folder.
      upSel.value = (folderPaths.indexOf(prev) >= 0) ? prev
                  : (folderPaths.indexOf(activeFolder) >= 0 ? activeFolder : "");
    }
```

- [ ] **Step 3: Send the chosen folder with each upload**

In `warehouse.html`, find this block in `uploadOne`:

```javascript
    var upVis = document.querySelector('input[name="upVis"]:checked');
    fd.append("visibility", upVis ? upVis.value : "internal");
```

Replace with:

```javascript
    var upVis = document.querySelector('input[name="upVis"]:checked');
    fd.append("visibility", upVis ? upVis.value : "internal");
    var upFolder = document.getElementById("upFolderSelect");
    if (upFolder && upFolder.value) fd.append("folder", upFolder.value);
```

(The `/api/warehouse/upload` endpoint reads `folder` from `request.values`,
so a multipart form field works exactly like the `?folder=` query param.)

- [ ] **Step 4: Manual smoke test**

Hard-refresh `#warehouse`:
1. The upload row has a "Folder" dropdown listing every folder.
2. Select a folder, drop a file → it uploads into that folder (shows in
   that folder's view, with the folder in the Folder column).
3. With a folder selected in the sidebar, the dropdown defaults to it.

State explicitly if you cannot drive a browser.

- [ ] **Step 5: Commit**

```bash
cd /home/dpalacios/home-server
git add templates/AIdashboard/warehouse.html
git -c user.name="dpalacios" -c user.email="palaciosdanieldario@gmail.com" commit -m "feat: folder picker on warehouse upload"
```

---

### Task 6: Agent KB tab — folder column + folder filter + "Add entire folder"

**Files:**
- Modify: `home-server/templates/AIdashboard/index.html`

- [ ] **Step 1: Show the folder in the agent KB warehouse rows**

In `index.html`, find `rowFromWarehouseDoc` and its `description` line:

```javascript
          description: (d.format || "file").toUpperCase() + " · " + vis +
            " · " + (d.chunk_count || 0) + " chunks · shared",
```

Replace with:

```javascript
          description: (d.format || "file").toUpperCase() + " · " + vis +
            " · " + (d.chunk_count || 0) + " chunks · 📁 " +
            ((d.folder_path || "").split("/").join(" / ") || "root"),
```

(The `kb-documents` endpoint already returns `folder_path` — added in
Task 2. `rowFromWarehouseDoc`'s `description` is rendered in the KB
table's description column, so the folder shows there with no new
column needed.)

- [ ] **Step 2: Add a folder filter + "Add entire folder" to the picker**

In `index.html`, find the picker's sub-text line in `__openWhseKbPicker`:

```javascript
        subEl.textContent = isCustomer
          ? "This is a customer-facing agent — only customer-facing documents can be added."
          : "Internal agent — any document can be added.";
```

Replace with:

```javascript
        subEl.textContent = isCustomer
          ? "This is a customer-facing agent — only customer-facing documents can be added."
          : "Internal agent — any document can be added.";
        // Folder filter row — built once the documents load (below).
        ctx.folderFilter = "";
```

Then find where the picker renders the document list — the line
`all.forEach(function (doc) {`. Insert immediately BEFORE it:

```javascript
        // Folder filter dropdown — distinct folders among the docs.
        var folderSet = {};
        all.forEach(function (dd) {
          var fp = dd.folder_path || "";
          if (fp) folderSet[fp] = true;
        });
        var folderList = Object.keys(folderSet).sort();
        if (folderList.length) {
          var fbar = document.createElement("div");
          fbar.className = "whse-pick-item-meta";
          fbar.style.padding = "6px 0";
          var fsel = document.createElement("select");
          fsel.innerHTML = '<option value="">All folders</option>';
          folderList.forEach(function (fp) {
            var o = document.createElement("option");
            o.value = fp; o.textContent = fp.split("/").join(" / ");
            fsel.appendChild(o);
          });
          fsel.value = ctx.folderFilter || "";
          fsel.addEventListener("change", function () {
            ctx.folderFilter = fsel.value;
            window.__openWhseKbPicker(agent, onAdded);  // re-render
          });
          fbar.appendChild(document.createTextNode("Folder: "));
          fbar.appendChild(fsel);
          // "Add entire folder" — ticks every eligible, not-already-
          // added document currently shown, then the normal Add N
          // button commits them.
          var addAllBtn = document.createElement("button");
          addAllBtn.type = "button";
          addAllBtn.className = "whse-pick-btn";
          addAllBtn.style.marginLeft = "8px";
          addAllBtn.textContent = "Add entire folder";
          addAllBtn.addEventListener("click", function () {
            listEl.querySelectorAll(
              ".whse-pick-item:not(.is-disabled) input[type=checkbox]"
            ).forEach(function (cb) {
              if (!cb.checked) { cb.checked = true;
                cb.dispatchEvent(new Event("change")); }
            });
          });
          fbar.appendChild(addAllBtn);
          listEl.appendChild(fbar);
        }
```

Then in the per-document loop, find the `var ready = doc.status === "ready";`
line inside `all.forEach` and insert immediately before it:

```javascript
          if (ctx.folderFilter) {
            var dfp = doc.folder_path || "";
            if (dfp !== ctx.folderFilter &&
                dfp.indexOf(ctx.folderFilter + "/") !== 0) return;
          }
```

- [ ] **Step 3: Verify `rowFromWarehouseDoc` / picker reference `folder_path`**

Run: `grep -n "folder_path" /home/dpalacios/home-server/templates/AIdashboard/index.html`
Expected: hits in `rowFromWarehouseDoc` and the picker folder filter.

The `/api/warehouse/documents` list (used by the picker's `all`) returns
the whole document via `_whse_doc_public`, so `doc.folder_path` is already
present — no further endpoint change is needed for the picker.

- [ ] **Step 4: Manual smoke test**

Hard-refresh, open an agent → Knowledge tab:
1. Warehouse-document rows show `📁 <folder>` (or `📁 root`) in their
   description.
2. "+ Add from warehouse" → a "Folder" dropdown filters the picker list
   to a chosen folder; "All folders" shows everything.
3. Filtering by folder then adding documents adds exactly those — the
   agent's KB is still per-document; the folder is only a filter.

State explicitly if you cannot drive a browser.

- [ ] **Step 5: Commit**

```bash
cd /home/dpalacios/home-server
git add templates/AIdashboard/index.html
git -c user.name="dpalacios" -c user.email="palaciosdanieldario@gmail.com" commit -m "feat: folder shown in agent KB rows; folder filter in the add-from-warehouse picker"
```

---

### Task 7: End-to-end verification + adversarial retrieval test + cleanup

**Files:**
- Delete: `local-server/server/_smoke_folders.py`

- [ ] **Step 1: Confirm services healthy**

Run: `ss -tlnp 2>/dev/null | grep -cE ':5000|:9030|:9000'`
Expected: `3`.

- [ ] **Step 2: Adversarial — folders never change retrieval**

```bash
cd /home/dpalacios/local-server/server && python3 - <<'EOF'
import os, json
os.environ.setdefault("FLASK_SECRET_KEY", "x")
import app

TCID = "test_folders_adv01"
for b in app.get_storage_client().list_blobs(app.BUCKET_NAME, prefix=app.crm_base(TCID)):
    b.delete()

# A ready, embedded warehouse doc at root.
DID = "doc_folderadv"
chunk = "The Falcon Clause covers warranty escalation."
emb = app.get_openai_client().embeddings.create(
    model=app.EMBED_MODEL, input=[chunk], encoding_format="float"
).data[0].embedding
app._whse_save_doc(TCID, {"document_id": DID, "account_id": TCID,
    "status": "ready", "visibility": "internal", "version": 1,
    "name": "Falcon doc", "filename": "falcon.pdf", "format": "pdf",
    "folder_path": "", "associated_agent_ids": [],
    "processing": {"chunk_count": 1}})
idx = app._whse_load_index(TCID)
idx.setdefault("document_ids", []).append(DID)
app._whse_save_index(TCID, idx)
import json as _j
app.get_storage_client().bucket(app.BUCKET_NAME).blob(
    app._whse_embed_path(TCID, DID, 1)).upload_from_string(
    _j.dumps({"chunks": [{"idx": 0, "text": chunk, "embedding": emb}]}),
    content_type="application/json")
app._save_agents(TCID, {"kb_docs_migrated": True, "agents": [
    {"id": "agent_f", "type": "internal", "name": "F",
     "kb_document_ids": [DID]}]})

q = "What is the Falcon Clause?"
before = app._whse_context_for_agent(TCID, "agent_f", "internal", q)
print("retrieval at root        -> hit:", "Falcon Clause" in before)

# Move the doc into a deep folder, then rename the folder.
d = app._whse_load_doc(TCID, DID)
d["folder_path"] = "Legal/Contracts/2026"
app._whse_save_doc(TCID, d)
after_move = app._whse_context_for_agent(TCID, "agent_f", "internal", q)
print("retrieval after folder move -> hit:", "Falcon Clause" in after_move)

assert before == after_move, "FAIL: folder move changed retrieval output"
assert "Falcon Clause" in after_move, "FAIL: doc no longer retrievable"
print("PASS: folders do not affect retrieval")

for b in app.get_storage_client().list_blobs(app.BUCKET_NAME, prefix=app.crm_base(TCID)):
    b.delete()
print("cleanup done")
EOF
```

Expected: `hit: True` both times; `before == after_move`; `PASS`.

- [ ] **Step 3: Browser end-to-end**

In a logged-in browser: create folders, move documents (drag + action),
rename a folder, delete a folder (keep-docs and delete-docs), upload into
a folder, and check the agent KB tab shows folders + the picker folder
filter works. State explicitly if you cannot drive a browser — Tasks 1–2
and Step 2 above prove the backend non-visually.

- [ ] **Step 4: Regression check**

Run: `cd /home/dpalacios/local-server/server && python3 -c "import ast; ast.parse(open('app.py').read()); print('app.py OK')"`
Confirm in a browser that warehouse upload, the API token, bulk delete,
and per-agent KB management still work.

- [ ] **Step 5: Delete the temporary smoke script**

```bash
rm -f /home/dpalacios/local-server/server/_smoke_folders.py
echo cleaned
```

- [ ] **Step 6: Final commit**

```bash
cd /home/dpalacios/home-server
git -c user.name="dpalacios" -c user.email="palaciosdanieldario@gmail.com" commit --allow-empty -m "chore: warehouse folders feature complete"
```

---

## Self-Review

**Spec coverage:**
- `folder_path` string on documents → Task 1 (helpers, upload), Task 2 (move). ✓
- `empty_folder_paths` on the index blob → Task 1 (`create`, `_whse_drop_empty_folder`). ✓
- Validation (chars, ≤ 4 levels, ≤ 200 chars) → `_whse_validate_folder_path`, Task 1. ✓
- Folder helpers (`_whse_all_folder_paths`, `_whse_folder_tree`, `_whse_drop_empty_folder`) → Task 1. ✓
- Create / rename / delete folder → `/api/warehouse/folders`, Task 1. ✓
- Move document (dialog + drag-and-drop) → Task 2 (backend `update_meta`), Task 4 (UI). ✓
- API upload `?folder=` → Task 1. ✓
- Sidebar folder tree + filter → Task 3. ✓
- Folder column in the warehouse table → Task 3. ✓
- Folder picker on upload → Task 5. ✓
- Folder in agent KB rows + picker folder filter → Task 6. ✓
- "Add entire folder" to an agent's KB → Task 6 Step 2 (the "Add entire folder" button ticks every eligible doc in the filtered folder, then the existing Add N commits them — visibility-aware and skip-already-added are already enforced by the picker's per-row disabling). ✓
- Adversarial "folders never change retrieval" → Task 4 Step 5 (manual), Task 7 Step 2 (automated). ✓
- Out-of-scope items (folder permissions, folder-level retrieval, etc.) → not built. ✓

**Placeholder scan:** No TBD/TODO. Task 3 Step 4 contains a deliberate
"WAIT —" correction that points the engineer at the precise anchor; the
real edit follows it. Task 3's `__whFolderMenu` / `__whMoveDoc` stubs are
explicitly temporary and replaced in Task 4 Steps 2–3.

**Type/name consistency:** `folder_path` (doc field), `empty_folder_paths`
(index field), `_whse_validate_folder_path` / `_whse_all_folder_paths` /
`_whse_folder_tree` / `_whse_drop_empty_folder` / `_whse_delete_document_fully`,
route `/api/warehouse/folders` with ops `create`/`rename`/`delete`,
`update_meta` + `folder_path` for moves, JS `activeFolder` / `folderPaths` /
`loadFolders` / `renderFolderPane` / `__whMoveDoc` / `__whFolderMenu` /
`__whNewFolder`, `upFolderSelect`, `whFolderPane` — used consistently
across tasks. ✓

All spec requirements map to a task.