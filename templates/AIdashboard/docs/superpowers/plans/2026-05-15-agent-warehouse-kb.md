# Explicit Agent KB (Warehouse Refs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each agent an explicit `kb_document_ids` list of warehouse documents — seeded at creation, snapshot-migrated for existing agents, editable from the agent's KB tab — and make retrieval and the KB tab warehouse-only.

**Architecture:** A new `kb_document_ids` list on each agent record is the single source of truth for what the agent retrieves. New agents seed it by visibility/type; a one-time idempotent migration snapshots existing agents. Retrieval (`_whse_context_for_agent`, the ask path, SQL tables) filters by this list instead of by visibility. The agent KB tab hides the legacy article/website/Q&A host and shows a warehouse-documents panel with add/remove. `associated_agent_ids` on docs is kept as a derived mirror for the warehouse UI and deletion cascade.

**Tech Stack:** Python/Flask (`local-server/server/app.py`), vanilla JS template (`home-server/templates/AIdashboard/index.html`), GCS JSON blobs.

---

## Testing note

This codebase has no pytest harness. Backend behavior is verified with throwaway-account Python smoke scripts that import `app` directly, plus `curl`. Frontend is verified manually in a browser. Each task carries its own verification.

## Honcho restart procedure (referenced by several tasks)

```bash
cd /home/dpalacios
pkill -f "honcho start" 2>/dev/null; sleep 4
(nohup honcho start > /tmp/honcho.log 2>&1 < /dev/null &)
# The FIRST honcho start reliably exits 144. If after ~30s fewer than
# 3 ports are listening, run the (nohup honcho start ...) line again.
sleep 28
ss -tlnp 2>/dev/null | grep -cE ':5000|:9030|:9000'   # expect 3
```

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `local-server/server/app.py` | Modify | Snapshot helper, creation seeding, migration, kb-documents API, mirror sync, retrieval rewrite, deletion cascade, visibility-downgrade cleanup |
| `home-server/templates/AIdashboard/index.html` | Modify | Hide legacy KB host; warehouse-documents panel with list/remove; add-from-warehouse picker modal |

No new files.

---

### Task 1: `kb_document_ids` — snapshot helper, creation seeding, migration

**Files:**
- Modify: `local-server/server/app.py` — add `_whse_doc_ids_for_agent_snapshot` after `_whse_doc_accessible`; add `_ensure_kb_docs_migration` after `_find_agent`; seed in `me_agents_create`; call migration in `me_agents_list`
- Test: `local-server/server/_smoke_kbdocs.py` (temporary; deleted in Task 7)

- [ ] **Step 1: Write the failing smoke script**

Create `local-server/server/_smoke_kbdocs.py`:

```python
"""Smoke test: kb_document_ids snapshot + migration. Run from server dir."""
import os
os.environ.setdefault("FLASK_SECRET_KEY", "x")
import app

TCID = "test_kbdocs_smoke01"

def _mkdoc(did, visibility, status="ready"):
    """Write a minimal warehouse doc + index entry for the test account."""
    doc = {"document_id": did, "account_id": TCID, "status": status,
           "visibility": visibility, "version": 1,
           "name": did, "filename": did + ".pdf", "format": "pdf",
           "associated_agent_ids": [],
           "processing": {"chunk_count": 0}}
    app._whse_save_doc(TCID, doc)
    idx = app._whse_load_index(TCID)
    if did not in idx.get("document_ids", []):
        idx.setdefault("document_ids", []).append(did)
        app._whse_save_index(TCID, idx)

# clean slate
for b in app.get_storage_client().list_blobs(app.BUCKET_NAME,
                                             prefix=app.crm_base(TCID)):
    b.delete()

_mkdoc("doc_cust1", "customer_facing")
_mkdoc("doc_cust2", "customer_facing")
_mkdoc("doc_intl1", "internal")
_mkdoc("doc_proc1", "customer_facing", status="extracting")  # not ready

# 1. snapshot for a customer agent -> only ready customer_facing docs
cust = sorted(app._whse_doc_ids_for_agent_snapshot(TCID, "agent_x", "customer"))
print("1. customer snapshot:", cust)
assert cust == ["doc_cust1", "doc_cust2"], f"FAIL: {cust}"

# 2. snapshot for an internal agent -> all ready docs (both visibilities)
intl = sorted(app._whse_doc_ids_for_agent_snapshot(TCID, "agent_y", "internal"))
print("2. internal snapshot:", intl)
assert intl == ["doc_cust1", "doc_cust2", "doc_intl1"], f"FAIL: {intl}"
print("1-2 PASS: snapshot is visibility/type scoped, skips non-ready docs")

# 3. migration: a payload with 2 agents lacking kb_document_ids
payload = {"agents": [
    {"id": "agent_c", "type": "customer", "name": "C"},
    {"id": "agent_i", "type": "internal", "name": "I"},
]}
app._save_agents(TCID, payload)
app._ensure_kb_docs_migration(TCID)
after = app._load_agents(TCID)
ac = next(a for a in after["agents"] if a["id"] == "agent_c")
ai = next(a for a in after["agents"] if a["id"] == "agent_i")
print("3. migrated customer agent:", sorted(ac.get("kb_document_ids", [])))
print("3. migrated internal agent:", sorted(ai.get("kb_document_ids", [])))
assert sorted(ac["kb_document_ids"]) == ["doc_cust1", "doc_cust2"], "FAIL c"
assert sorted(ai["kb_document_ids"]) == ["doc_cust1", "doc_cust2", "doc_intl1"], "FAIL i"
assert after.get("kb_docs_migrated") is True, "FAIL: flag not set"
print("3 PASS: migration snapshots each agent by type, sets flag")

# 4. migration is idempotent — re-run does not change lists
ac["kb_document_ids"] = ["sentinel"]
app._save_agents(TCID, after)
app._ensure_kb_docs_migration(TCID)
after2 = app._load_agents(TCID)
ac2 = next(a for a in after2["agents"] if a["id"] == "agent_c")
assert ac2["kb_document_ids"] == ["sentinel"], f"FAIL: re-ran, {ac2['kb_document_ids']}"
print("4 PASS: migration is idempotent (flag short-circuits)")

# cleanup
for b in app.get_storage_client().list_blobs(app.BUCKET_NAME,
                                             prefix=app.crm_base(TCID)):
    b.delete()
print("ALL PASS - cleanup done")
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /home/dpalacios/local-server/server && python3 _smoke_kbdocs.py`
Expected: `AttributeError: module 'app' has no attribute '_whse_doc_ids_for_agent_snapshot'`.

- [ ] **Step 3: Add the snapshot helper**

In `app.py`, find `_whse_doc_accessible` and the line after its `return` (it ends with `return _whse_doc_visibility(doc) in (allowed_visibilities or set())`). Insert immediately after that function:

```python


def _whse_doc_ids_for_agent_snapshot(account_id, agent_id, agent_type):
    """Document IDs an agent should reference under the current
    warehouse state — the docs it can retrieve today via
    _whse_doc_accessible. Used both to seed kb_document_ids when an
    agent is created and to snapshot existing agents during the
    one-time migration. Only `status == 'ready'` docs qualify."""
    allowed = _whse_allowed_visibilities(agent_type)
    out = []
    for d in _whse_all_docs(account_id):
        if d.get("status") != "ready":
            continue
        if _whse_doc_accessible(d, agent_id, allowed):
            out.append(d.get("document_id"))
    return out
```

- [ ] **Step 4: Add the migration helper**

In `app.py`, find `_find_agent` (ends with `return None` after the agent loop). Insert immediately after it:

```python


def _ensure_kb_docs_migration(account_id: str) -> None:
    """One-time per account: give every agent a kb_document_ids list
    snapshotting the warehouse docs it can currently retrieve. Idempotent
    via the kb_docs_migrated flag on the agents payload. Agents that
    already have a kb_document_ids key are left untouched."""
    payload = _load_agents(account_id)
    if payload.get("kb_docs_migrated"):
        return
    agents = payload.get("agents") or []
    for a in agents:
        if "kb_document_ids" not in a:
            a["kb_document_ids"] = _whse_doc_ids_for_agent_snapshot(
                account_id, a.get("id"), a.get("type"))
    payload["kb_docs_migrated"] = True
    _save_agents(account_id, payload)
```

- [ ] **Step 5: Run the smoke script to verify it passes**

Run: `cd /home/dpalacios/local-server/server && python3 _smoke_kbdocs.py`
Expected: prints `1-2 PASS`, `3 PASS`, `4 PASS`, `ALL PASS`.

- [ ] **Step 6: Seed `kb_document_ids` on agent creation**

In `app.py`, find this block in `me_agents_create`:

```python
    new_agent["composed_prompt"] = compose_agent_prompt(new_agent)
    agents.append(new_agent)
```

Replace with:

```python
    new_agent["composed_prompt"] = compose_agent_prompt(new_agent)
    # Seed the agent's warehouse knowledge: every ready document it is
    # eligible for by type (customer agents → customer-facing docs;
    # internal agents → all). The owner edits this list afterward.
    new_agent["kb_document_ids"] = _whse_doc_ids_for_agent_snapshot(
        customer_id, new_id, a_type)
    agents.append(new_agent)
```

- [ ] **Step 7: Run the migration on every agents-list load**

In `app.py`, find this line in `me_agents_list`:

```python
    payload = _ensure_agents_migration(customer_id)
    out = []
```

Replace with:

```python
    payload = _ensure_agents_migration(customer_id)
    _ensure_kb_docs_migration(customer_id)
    out = []
```

- [ ] **Step 8: Verify the file parses**

Run: `cd /home/dpalacios/local-server/server && python3 -c "import ast; ast.parse(open('app.py').read()); print('OK')"`
Expected: `OK`.

- [ ] **Step 9: Commit**

```bash
git -C /home/dpalacios/local-server -c user.name="dpalacios" -c user.email="palaciosdanieldario@gmail.com" commit -am "feat: kb_document_ids — snapshot helper, creation seeding, migration"
```

---

### Task 2: kb-documents API endpoints + `associated_agent_ids` mirror

**Files:**
- Modify: `local-server/server/app.py` — add `_whse_sync_doc_agent_mirror` after `_ensure_kb_docs_migration`; add the `/me/agents/<agent_id>/kb-documents` route after `me_agents_list`

- [ ] **Step 1: Add the mirror-sync helper**

In `app.py`, find the `_ensure_kb_docs_migration` function added in Task 1 (ends `_save_agents(account_id, payload)`). Insert immediately after it:

```python


def _whse_sync_doc_agent_mirror(account_id, document_id, agent_id, present):
    """Keep a warehouse document's associated_agent_ids in sync with
    agents' kb_document_ids. `present=True` ensures agent_id is listed;
    `present=False` ensures it is removed. associated_agent_ids is a
    derived mirror — the warehouse UI reads it and deletion cascade
    uses it — retrieval no longer does."""
    doc = _whse_load_doc(account_id, document_id)
    if not doc:
        return
    assoc = list(doc.get("associated_agent_ids") or [])
    changed = False
    if present and agent_id not in assoc:
        assoc.append(agent_id)
        changed = True
    if not present and agent_id in assoc:
        assoc = [x for x in assoc if x != agent_id]
        changed = True
    if changed:
        doc["associated_agent_ids"] = assoc
        _whse_save_doc(account_id, doc)
```

- [ ] **Step 2: Add the kb-documents route**

In `app.py`, find the end of `me_agents_list` — the line `return ({"agents": out}), 200` followed by the `@app.route("/me/agents", methods=["POST", "OPTIONS"])` decorator. Insert this new route between them (after `return ({"agents": out}), 200`, before the POST decorator):

```python


@app.route("/me/agents/<agent_id>/kb-documents",
           methods=["GET", "POST", "OPTIONS"])
def me_agent_kb_documents(agent_id):
    """Manage the warehouse documents an agent references.

    GET  -> {documents: [{document_id, name, format, visibility,
            status, chunk_count}, ...]}
    POST -> body {op:"add"|"remove", document_ids:[...]} mutates the
            agent's kb_document_ids and syncs associated_agent_ids.
    Add is eligibility-checked: a customer agent cannot reference an
    internal-visibility document."""
    if request.method == "OPTIONS":
        return ("", 204)
    customer_id = (session.get("customer_id") or "").strip()
    if not customer_id:
        return ({"error": "unauthenticated"}), 401
    _ensure_kb_docs_migration(customer_id)
    payload = _ensure_agents_migration(customer_id)
    agent = None
    for a in payload.get("agents") or []:
        if a.get("id") == agent_id:
            agent = a
            break
    if not agent:
        return ({"error": "agent_not_found"}), 404

    if request.method == "GET":
        docs = []
        for did in agent.get("kb_document_ids") or []:
            d = _whse_load_doc(customer_id, did)
            if not d:
                continue
            docs.append({
                "document_id": d.get("document_id"),
                "name":        d.get("name") or d.get("filename"),
                "format":      d.get("format"),
                "visibility":  _whse_doc_visibility(d),
                "status":      d.get("status"),
                "chunk_count": (d.get("processing") or {}).get(
                    "chunk_count") or 0,
            })
        return ({"documents": docs}), 200

    data = request.get_json(silent=True) or {}
    op = (data.get("op") or "").strip().lower()
    doc_ids = data.get("document_ids")
    if op not in ("add", "remove") or not isinstance(doc_ids, list):
        return ({"error": "bad_request"}), 400
    cur = list(agent.get("kb_document_ids") or [])
    allowed = _whse_allowed_visibilities(agent.get("type"))
    for did in doc_ids:
        did = str(did)
        d = _whse_load_doc(customer_id, did)
        if not d:
            continue
        if op == "add":
            # Eligibility: a customer agent cannot reference an
            # internal-visibility document.
            if _whse_doc_visibility(d) not in allowed:
                continue
            if did not in cur:
                cur.append(did)
            _whse_sync_doc_agent_mirror(customer_id, did, agent_id, True)
        else:
            cur = [x for x in cur if x != did]
            _whse_sync_doc_agent_mirror(customer_id, did, agent_id, False)
    agent["kb_document_ids"] = cur
    agent["updated_at"] = datetime.utcnow().isoformat() + "Z"
    _save_agents(customer_id, payload)
    return ({"kb_document_ids": cur}), 200
```

- [ ] **Step 3: Verify the file parses**

Run: `cd /home/dpalacios/local-server/server && python3 -c "import ast; ast.parse(open('app.py').read()); print('OK')"`
Expected: `OK`.

- [ ] **Step 4: Restart honcho**

Restart honcho (see "Honcho restart procedure").

- [ ] **Step 5: Smoke-test the endpoint logic**

```bash
cd /home/dpalacios/local-server/server && python3 - <<'EOF'
import os
os.environ.setdefault("FLASK_SECRET_KEY", "x")
import app
TCID = "test_kbdocs_api01"
for b in app.get_storage_client().list_blobs(app.BUCKET_NAME, prefix=app.crm_base(TCID)):
    b.delete()
# two docs
for did, vis in [("doc_a", "customer_facing"), ("doc_b", "internal")]:
    app._whse_save_doc(TCID, {"document_id": did, "account_id": TCID,
        "status": "ready", "visibility": vis, "version": 1, "name": did,
        "filename": did + ".pdf", "format": "pdf",
        "associated_agent_ids": [], "processing": {"chunk_count": 3}})
    idx = app._whse_load_index(TCID)
    idx.setdefault("document_ids", []).append(did)
    app._whse_save_index(TCID, idx)
# a customer agent with empty kb list
app._save_agents(TCID, {"kb_docs_migrated": True, "agents": [
    {"id": "agent_c", "type": "customer", "name": "C", "kb_document_ids": []}]})
# add doc_a (eligible) and doc_b (internal -> should be rejected for customer)
app._whse_sync_doc_agent_mirror  # ensure attr exists
ag = app._load_agents(TCID)["agents"][0]
allowed = app._whse_allowed_visibilities("customer")
assert app._whse_doc_visibility(app._whse_load_doc(TCID,"doc_a")) in allowed
assert app._whse_doc_visibility(app._whse_load_doc(TCID,"doc_b")) not in allowed
app._whse_sync_doc_agent_mirror(TCID, "doc_a", "agent_c", True)
mirror = app._whse_load_doc(TCID, "doc_a").get("associated_agent_ids")
print("mirror after add:", mirror)
assert mirror == ["agent_c"], f"FAIL: {mirror}"
app._whse_sync_doc_agent_mirror(TCID, "doc_a", "agent_c", False)
mirror2 = app._whse_load_doc(TCID, "doc_a").get("associated_agent_ids")
assert mirror2 == [], f"FAIL: {mirror2}"
print("PASS: mirror sync add/remove works; customer-eligibility correct")
for b in app.get_storage_client().list_blobs(app.BUCKET_NAME, prefix=app.crm_base(TCID)):
    b.delete()
print("cleanup done")
EOF
```

Expected: `mirror after add: ['agent_c']`, `PASS: ...`, `cleanup done`.

- [ ] **Step 6: Commit**

```bash
git -C /home/dpalacios/local-server -c user.name="dpalacios" -c user.email="palaciosdanieldario@gmail.com" commit -am "feat: kb-documents API endpoints + associated_agent_ids mirror"
```

---

### Task 3: Retrieval rewrite — agents answer from `kb_document_ids` only

**Files:**
- Modify: `local-server/server/app.py` — rewrite `_whse_context_for_agent`; remove the legacy `kb_retrieve` block from the ask path; filter warehouse SQL tables by `kb_document_ids`

- [ ] **Step 1: Rewrite `_whse_context_for_agent`**

In `app.py`, find the current function:

```python
def _whse_context_for_agent(account_id, agent_id, agent_type, question,
                            top_k=6):
    """The warehouse → agent KB bridge. Returns a formatted context
    block of the most relevant warehouse-document chunks for
    `question`, enforcing the internal/customer-facing visibility
    boundary for `agent_type`, or '' if nothing relevant turned up."""
    allowed = _whse_allowed_visibilities(agent_type)
    try:
        hits = _whse_search(account_id, question, top_k=top_k,
                            agent_id=agent_id,
                            allowed_visibilities=allowed)
    except Exception as exc:
        print(f"[warehouse] agent retrieval failed: {exc!r}", flush=True)
        return ""
    print(f"[warehouse] retrieval agent={agent_id} type={agent_type} "
          f"allowed={sorted(allowed)} hits={len(hits)}", flush=True)
```

Replace that portion (down to and including the `print(...)` line shown) with:

```python
def _whse_context_for_agent(account_id, agent_id, agent_type, question,
                            top_k=6):
    """The warehouse → agent KB bridge. Returns a formatted context
    block of the most relevant chunks drawn from exactly the documents
    in the agent's explicit kb_document_ids list, or '' if nothing
    relevant turned up. agent_type is unused now that the explicit
    list is the boundary; kept in the signature for caller stability."""
    _ensure_kb_docs_migration(account_id)
    agent = _find_agent(account_id, agent_id) if agent_id else None
    doc_ids = (agent or {}).get("kb_document_ids") or []
    if not doc_ids:
        print(f"[warehouse] retrieval agent={agent_id} — empty kb list",
              flush=True)
        return ""
    try:
        hits = _whse_search(account_id, question, top_k=top_k,
                            document_ids=doc_ids)
    except Exception as exc:
        print(f"[warehouse] agent retrieval failed: {exc!r}", flush=True)
        return ""
    print(f"[warehouse] retrieval agent={agent_id} "
          f"kb_docs={len(doc_ids)} hits={len(hits)}", flush=True)
```

(Everything from the next line — `hits = [h for h in hits if h.get("score"...` — onward is unchanged.)

- [ ] **Step 2: Remove the legacy `kb_retrieve` block from the ask path**

In `app.py`, find this block in the ask handler:

```python
    # Pull top-K KB chunks for the question so the chat sees newly
    # saved FAQs and articles. Best-effort: failures fall through to
    # an empty context block — the persona still drives the reply.
    kb_context = ""
    try:
        openai_client_for_kb = get_openai_client()
        _ka_lap("kb_get_payload starting")
        # Cache the payload by (account, kb_type) — fetching it from
        # GCS was costing 1.3s on every query. KB rebuilds invalidate
        # via _kb_payload_cache_invalidate (called from save paths).
        cache_key = (customer_id, kb_type)
        import time as _kp_time
        cached = _KB_PAYLOAD_CACHE.get(cache_key)
        if cached and cached[1] > _kp_time.time():
            kb_payload = cached[0]
        else:
            kb_payload = _kb_get_payload(
                "text-embedding-3-small",
                account_id=customer_id, kb_type=kb_type, use_silver=False,
            )
            _KB_PAYLOAD_CACHE[cache_key] = (kb_payload,
                                             _kp_time.time() + _KB_PAYLOAD_TTL_SEC)
        _ka_lap("kb_payload loaded")
        kb_context = _kb_retrieve(
            openai_client_for_kb, question, kb_payload,
            top_k=8, faq_k=4,
        ) or ""
        _ka_lap("kb_retrieve done")
    except Exception as exc:
        print(f"[kb-ask] retrieval skipped: {exc}", flush=True)
        kb_context = ""
```

Replace the entire block with:

```python
    # Knowledge comes solely from the agent's explicit warehouse
    # document list (folded in just below). The legacy per-agent KB
    # retrieval (articles / websites / Q&As via _kb_retrieve) is no
    # longer part of the answering path.
    kb_context = ""
```

- [ ] **Step 3: Filter warehouse SQL tables by `kb_document_ids`**

In `app.py`, find this block (the warehouse SQL-table merge):

```python
        _wh_atype = (agent.get("type") if agent else None) or (
            "internal" if kb_type == "internal" else "customer")
        _wh_allowed = _whse_allowed_visibilities(_wh_atype)
        _wh_added = 0
        for t in (registry.get("tables") or []):
            if t.get("origin") == "warehouse":
                tv = (t.get("whse_visibility") or "").strip().lower()
                if tv not in WHSE_VISIBILITIES:
                    tv = WHSE_DEFAULT_VISIBILITY
                if tv in _wh_allowed:
                    tables.append(t)
                    _wh_added += 1
        if _wh_added:
            print(f"[kb-ask-prep] +{_wh_added} warehouse table(s) "
                  f"(agent_type={_wh_atype})", flush=True)
```

Replace it with:

```python
        # Warehouse spreadsheets are SQL-queryable too — folded in only
        # when their source document is in the agent's explicit
        # kb_document_ids list (same boundary as text retrieval).
        _wh_kb_ids = set((agent or {}).get("kb_document_ids") or [])
        _wh_added = 0
        for t in (registry.get("tables") or []):
            if t.get("origin") == "warehouse":
                if t.get("whse_doc_id") in _wh_kb_ids:
                    tables.append(t)
                    _wh_added += 1
        if _wh_added:
            print(f"[kb-ask-prep] +{_wh_added} warehouse table(s) "
                  f"(from agent kb list)", flush=True)
```

- [ ] **Step 4: Verify the file parses**

Run: `cd /home/dpalacios/local-server/server && python3 -c "import ast; ast.parse(open('app.py').read()); print('OK')"`
Expected: `OK`.

- [ ] **Step 5: Restart honcho**

Restart honcho (see "Honcho restart procedure").

- [ ] **Step 6: Adversarial smoke test — explicit list controls retrieval**

This test proves an agent retrieves from a doc IN its `kb_document_ids` and NOT from a doc removed from it, regardless of visibility. It builds a real embedded warehouse doc for a throwaway account.

```bash
cd /home/dpalacios/local-server/server && python3 - <<'EOF'
import os
os.environ.setdefault("FLASK_SECRET_KEY", "x")
import app

TCID = "test_kbdocs_retr01"
for b in app.get_storage_client().list_blobs(app.BUCKET_NAME, prefix=app.crm_base(TCID)):
    b.delete()

# Build one ready warehouse doc with a real embedded chunk.
DID = "doc_zebra"
chunk_text = "The Zebra Protocol is our internal escalation runbook."
emb = app.get_openai_client().embeddings.create(
    model=app.EMBED_MODEL, input=[chunk_text], encoding_format="float"
).data[0].embedding
app._whse_save_doc(TCID, {"document_id": DID, "account_id": TCID,
    "status": "ready", "visibility": "internal", "version": 1,
    "name": "Zebra runbook", "filename": "zebra.pdf", "format": "pdf",
    "associated_agent_ids": [], "processing": {"chunk_count": 1}})
idx = app._whse_load_index(TCID)
idx.setdefault("document_ids", []).append(DID)
app._whse_save_index(TCID, idx)
# Write the embed bundle blob the retrieval reads. There is no
# _whse_save_embed_bundle helper — _whse_load_embed_bundle reads the
# blob at _whse_embed_path(account, document_id, version); write there
# directly. Bundle shape: {"chunks": [{"idx", "text", "embedding"}]}.
import json as _json
app.get_storage_client().bucket(app.BUCKET_NAME).blob(
    app._whse_embed_path(TCID, DID, 1)
).upload_from_string(
    _json.dumps({"chunks": [
        {"idx": 0, "text": chunk_text, "embedding": emb}]}),
    content_type="application/json")

q = "What is the Zebra Protocol?"

# Case A: agent HAS the doc in kb_document_ids -> retrieval returns it.
app._save_agents(TCID, {"kb_docs_migrated": True, "agents": [
    {"id": "agent_r", "type": "internal", "name": "R",
     "kb_document_ids": [DID]}]})
ctx_with = app._whse_context_for_agent(TCID, "agent_r", "internal", q)
print("A. with doc in kb list -> context len:", len(ctx_with))
assert "Zebra Protocol" in ctx_with, "FAIL A: doc in list not retrieved"

# Case B: same doc, removed from the list -> retrieval returns nothing.
app._save_agents(TCID, {"kb_docs_migrated": True, "agents": [
    {"id": "agent_r", "type": "internal", "name": "R",
     "kb_document_ids": []}]})
ctx_without = app._whse_context_for_agent(TCID, "agent_r", "internal", q)
print("B. with doc removed   -> context len:", len(ctx_without))
assert ctx_without == "", f"FAIL B: removed doc still retrieved: {ctx_without!r}"

print("PASS: retrieval is controlled by kb_document_ids, not visibility")
for b in app.get_storage_client().list_blobs(app.BUCKET_NAME, prefix=app.crm_base(TCID)):
    b.delete()
print("cleanup done")
EOF
```

Expected: case A context contains "Zebra Protocol"; case B context is empty; `PASS`.

- [ ] **Step 7: Commit**

```bash
git -C /home/dpalacios/local-server -c user.name="dpalacios" -c user.email="palaciosdanieldario@gmail.com" commit -am "feat: agents retrieve only from kb_document_ids; drop legacy KB from ask path"
```

---

### Task 4: Deletion cascade + visibility-downgrade cleanup

**Files:**
- Modify: `local-server/server/app.py` — add `_whse_cascade_remove_doc_from_agents`; call it on doc deletion; call a downgrade cleanup on visibility change

- [ ] **Step 1: Add the cascade helper**

In `app.py`, find `_whse_sync_doc_agent_mirror` (added in Task 2, ends `_whse_save_doc(account_id, doc)`). Insert immediately after it:

```python


def _whse_cascade_remove_doc_from_agents(account_id, document_id):
    """Remove `document_id` from every agent's kb_document_ids. Called
    when a warehouse document is deleted so no agent keeps a dangling
    reference. Returns the list of affected agent ids."""
    payload = _load_agents(account_id)
    affected = []
    for a in payload.get("agents") or []:
        ids = a.get("kb_document_ids") or []
        if document_id in ids:
            a["kb_document_ids"] = [x for x in ids if x != document_id]
            a["updated_at"] = datetime.utcnow().isoformat() + "Z"
            affected.append(a.get("id"))
    if affected:
        _save_agents(account_id, payload)
    return affected


def _whse_cleanup_visibility_downgrade(account_id, document_id):
    """When a document becomes internal-only, drop it from every
    customer agent's kb_document_ids — a customer-facing agent must
    not retain an internal document. Internal agents keep it."""
    payload = _load_agents(account_id)
    changed = False
    for a in payload.get("agents") or []:
        if (a.get("type") or "").strip().lower() != "customer":
            continue
        ids = a.get("kb_document_ids") or []
        if document_id in ids:
            a["kb_document_ids"] = [x for x in ids if x != document_id]
            a["updated_at"] = datetime.utcnow().isoformat() + "Z"
            changed = True
            _whse_sync_doc_agent_mirror(
                account_id, document_id, a.get("id"), False)
    if changed:
        _save_agents(account_id, payload)
```

- [ ] **Step 2: Call the cascade on document deletion**

In `app.py`, find this block at the end of `api_warehouse_delete`:

```python
    _whse_unregister_tables(cid, document_id)
    idx = _whse_load_index(cid)
    if document_id in idx.get("document_ids", []):
        idx["document_ids"] = [d for d in idx["document_ids"]
                               if d != document_id]
        _whse_save_index(cid, idx)
    return jsonify({"ok": True}), 200
```

Replace with:

```python
    _whse_unregister_tables(cid, document_id)
    _whse_cascade_remove_doc_from_agents(cid, document_id)
    idx = _whse_load_index(cid)
    if document_id in idx.get("document_ids", []):
        idx["document_ids"] = [d for d in idx["document_ids"]
                               if d != document_id]
        _whse_save_index(cid, idx)
    return jsonify({"ok": True}), 200
```

- [ ] **Step 3: Call the downgrade cleanup on a visibility change to internal**

In `app.py`, find this block in `api_warehouse_delete`'s `update_meta` branch:

```python
                if vis != _whse_doc_visibility(doc):
                    doc["visibility"] = vis
                    doc["visibility_set_at"] = (
                        datetime.utcnow().isoformat() + "Z")
                    doc["visibility_set_by"] = (
                        session.get("user_email") or "owner")
```

Replace with:

```python
                if vis != _whse_doc_visibility(doc):
                    doc["visibility"] = vis
                    doc["visibility_set_at"] = (
                        datetime.utcnow().isoformat() + "Z")
                    doc["visibility_set_by"] = (
                        session.get("user_email") or "owner")
                    # A downgrade to internal must not leave the doc in
                    # any customer agent's KB list. Saved below; the
                    # cleanup re-loads/saves the agents payload only.
                    if vis == WHSE_VISIBILITY_INTERNAL:
                        _whse_cleanup_visibility_downgrade(
                            cid, document_id)
```

- [ ] **Step 4: Verify the file parses**

Run: `cd /home/dpalacios/local-server/server && python3 -c "import ast; ast.parse(open('app.py').read()); print('OK')"`
Expected: `OK`.

- [ ] **Step 5: Smoke-test cascade + downgrade**

```bash
cd /home/dpalacios/local-server/server && python3 - <<'EOF'
import os
os.environ.setdefault("FLASK_SECRET_KEY", "x")
import app
TCID = "test_kbdocs_casc01"
for b in app.get_storage_client().list_blobs(app.BUCKET_NAME, prefix=app.crm_base(TCID)):
    b.delete()
# two agents referencing doc_x
app._save_agents(TCID, {"kb_docs_migrated": True, "agents": [
    {"id": "agent_c", "type": "customer", "name": "C", "kb_document_ids": ["doc_x", "doc_y"]},
    {"id": "agent_i", "type": "internal", "name": "I", "kb_document_ids": ["doc_x"]}]})
# cascade delete doc_x
aff = sorted(app._whse_cascade_remove_doc_from_agents(TCID, "doc_x"))
print("cascade affected:", aff)
assert aff == ["agent_c", "agent_i"], f"FAIL: {aff}"
after = app._load_agents(TCID)
for a in after["agents"]:
    assert "doc_x" not in (a.get("kb_document_ids") or []), f"FAIL: doc_x left in {a['id']}"
assert next(a for a in after["agents"] if a["id"]=="agent_c")["kb_document_ids"] == ["doc_y"]
print("1 PASS: deletion cascade clears doc from every agent")
# downgrade cleanup: doc_y becomes internal -> drop from customer agent only
app._whse_cleanup_visibility_downgrade(TCID, "doc_y")
after2 = app._load_agents(TCID)
ac = next(a for a in after2["agents"] if a["id"]=="agent_c")
assert "doc_y" not in (ac.get("kb_document_ids") or []), "FAIL: doc_y left in customer agent"
print("2 PASS: visibility downgrade drops doc from customer agents")
for b in app.get_storage_client().list_blobs(app.BUCKET_NAME, prefix=app.crm_base(TCID)):
    b.delete()
print("ALL PASS - cleanup done")
EOF
```

Expected: `1 PASS`, `2 PASS`, `ALL PASS`.

- [ ] **Step 6: Restart honcho**

Restart honcho (see "Honcho restart procedure").

- [ ] **Step 7: Commit**

```bash
git -C /home/dpalacios/local-server -c user.name="dpalacios" -c user.email="palaciosdanieldario@gmail.com" commit -am "feat: cascade kb_document_ids cleanup on doc delete + visibility downgrade"
```

---

### Task 5: Agent KB tab — hide legacy host, show warehouse-documents panel

**Files:**
- Modify: `home-server/templates/AIdashboard/index.html` — hide both `kb-table-host` divs; add a warehouse-documents panel before each; add CSS and the panel JS

- [ ] **Step 1: Hide the legacy KB host and insert the panel — customer card**

In `index.html`, find (line ~12603):

```html
          <!-- Unified KB table for this mode. The table loads its
               own data via /kb/sources + /knowledege and renders rows
               for every type. -->
          <div class="kb-table-host" data-kb-table-mode="client">
```

Replace with:

```html
          <!-- Warehouse-document KB. The agent answers from exactly
               the documents listed here. Legacy per-agent articles/
               websites/Q&As (the kb-table-host below) are hidden. -->
          <div class="whse-kb-host" data-whse-kb-mode="client"></div>

          <!-- Legacy KB table — hidden; retained in the DOM so the
               ~700-line wireKbTableHost component and its ID bindings
               don't error. Retired in a later legacy-KB project. -->
          <div class="kb-table-host" data-kb-table-mode="client" style="display:none;">
```

- [ ] **Step 2: Hide the legacy KB host and insert the panel — internal card**

In `index.html`, find (line ~12761):

```html
          <div class="kb-table-host" data-kb-table-mode="internal">
```

Replace with:

```html
          <div class="whse-kb-host" data-whse-kb-mode="internal"></div>

          <div class="kb-table-host" data-kb-table-mode="internal" style="display:none;">
```

- [ ] **Step 3: Add panel CSS**

In `index.html`, find the dark-theme rule `[data-theme="dark"] .kb-table-host {` (line ~2330). Insert this CSS block immediately before that line:

```css
    .whse-kb-host { margin: 8px 0 4px; }
    .whse-kb-head { display:flex; align-items:center; justify-content:space-between;
      gap:12px; margin-bottom:10px; flex-wrap:wrap; }
    .whse-kb-title { font-size:14px; font-weight:600; }
    .whse-kb-add { padding:7px 12px; font-size:12.5px; border-radius:8px;
      border:1px solid var(--border,#e5e7eb); background:var(--accent,#2563eb);
      color:#fff; cursor:pointer; }
    .whse-kb-list { display:flex; flex-direction:column; gap:6px; }
    .whse-kb-row { display:flex; align-items:center; gap:10px; padding:9px 12px;
      border:1px solid var(--border,#e5e7eb); border-radius:8px;
      background:var(--bg,#fff); }
    .whse-kb-row-main { flex:1; min-width:0; }
    .whse-kb-row-name { font-size:13px; font-weight:500; white-space:nowrap;
      overflow:hidden; text-overflow:ellipsis; }
    .whse-kb-row-meta { font-size:11px; color:var(--sub,#6b7280); margin-top:2px; }
    .whse-kb-badge { font-size:10px; padding:2px 7px; border-radius:99px;
      background:var(--code-bg,#f4f4f5); color:var(--sub,#6b7280); }
    .whse-kb-remove { padding:5px 10px; font-size:12px; border-radius:7px;
      border:1px solid var(--border,#e5e7eb); background:transparent;
      color:var(--err,#dc2626); cursor:pointer; }
    .whse-kb-empty { font-size:12.5px; color:var(--sub,#6b7280);
      padding:14px 0; }
    [data-theme="dark"] .whse-kb-row { background:#1f2430; border-color:#2b3240; }
    [data-theme="dark"] .whse-kb-badge { background:#262d38; }
```

- [ ] **Step 4: Add the panel JS**

In `index.html`, find the line `function initKbTables() {` (line ~34559). Insert this complete component immediately before that line:

```javascript
    // ─── Agent warehouse-KB panel ───
    // One host per answers-card (client / internal). Each renders the
    // ACTIVE agent's warehouse-document references via
    // /me/agents/<id>/kb-documents, with remove + add-from-warehouse.
    function initWhseKbHosts() {
      document.querySelectorAll("[data-whse-kb-mode]").forEach(wireWhseKbHost);
      window.addEventListener("agent:opened", function () {
        document.querySelectorAll("[data-whse-kb-mode]").forEach(function (h) {
          if (h.__whseKbRefresh) h.__whseKbRefresh();
        });
      });
    }
    function wireWhseKbHost(host) {
      function activeAgent() { return window.__activeAgent || null; }
      function fmtBadge(v) {
        return v === "customer_facing" ? "Customer-facing" : "Internal";
      }
      async function load() {
        var a = activeAgent();
        if (!a || !a.id) { host.innerHTML = ""; return; }
        host.innerHTML = '<div class="whse-kb-empty">Loading…</div>';
        var docs = [];
        try {
          var r = await fetch("/me/agents/" + encodeURIComponent(a.id) +
                              "/kb-documents", { credentials: "same-origin" });
          if (r.ok) {
            var d = await r.json();
            docs = (d && Array.isArray(d.documents)) ? d.documents : [];
          }
        } catch (_) { docs = []; }
        render(a, docs);
      }
      function render(a, docs) {
        host.innerHTML = "";
        var head = document.createElement("div");
        head.className = "whse-kb-head";
        var title = document.createElement("div");
        title.className = "whse-kb-title";
        title.textContent = "Warehouse documents (" + docs.length + ")";
        var addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "whse-kb-add";
        addBtn.textContent = "+ Add from warehouse";
        addBtn.addEventListener("click", function () {
          window.__openWhseKbPicker(a, function () { load(); });
        });
        head.appendChild(title);
        head.appendChild(addBtn);
        host.appendChild(head);
        if (!docs.length) {
          var empty = document.createElement("div");
          empty.className = "whse-kb-empty";
          empty.textContent = "No documents yet — add from your warehouse.";
          host.appendChild(empty);
          return;
        }
        var list = document.createElement("div");
        list.className = "whse-kb-list";
        docs.forEach(function (doc) {
          var row = document.createElement("div");
          row.className = "whse-kb-row";
          var main = document.createElement("div");
          main.className = "whse-kb-row-main";
          var nm = document.createElement("div");
          nm.className = "whse-kb-row-name";
          nm.textContent = doc.name || doc.document_id;
          var meta = document.createElement("div");
          meta.className = "whse-kb-row-meta";
          meta.textContent = (doc.format || "") + " · " + (doc.status || "") +
            " · " + (doc.chunk_count || 0) + " chunks";
          main.appendChild(nm);
          main.appendChild(meta);
          var badge = document.createElement("span");
          badge.className = "whse-kb-badge";
          badge.textContent = fmtBadge(doc.visibility);
          var rm = document.createElement("button");
          rm.type = "button";
          rm.className = "whse-kb-remove";
          rm.textContent = "Remove";
          rm.addEventListener("click", function () {
            if (!confirm('Remove "' + (doc.name || doc.document_id) +
                '" from this agent?\n\nIt stays in your warehouse and ' +
                'other agents keep it.')) return;
            rm.disabled = true;
            fetch("/me/agents/" + encodeURIComponent(a.id) + "/kb-documents", {
              method: "POST", credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ op: "remove",
                                     document_ids: [doc.document_id] }),
            }).then(function (r) { return r.ok ? r.json() : null; })
              .then(function (res) {
                if (res) load();
                else { rm.disabled = false; alert("Couldn't remove."); }
              })
              .catch(function () { rm.disabled = false; alert("Network error."); });
          });
          row.appendChild(main);
          row.appendChild(badge);
          row.appendChild(rm);
          list.appendChild(row);
        });
        host.appendChild(list);
      }
      host.__whseKbRefresh = load;
      load();
    }
```

- [ ] **Step 5: Call the initializer on boot**

In `index.html`, find the line `defer(function () { initKbTables(); });` (line ~36161, near the end of the main script). Replace with:

```javascript
      defer(function () { initKbTables(); });
      defer(function () { initWhseKbHosts(); });
```

- [ ] **Step 6: Add a no-op picker stub (replaced in Task 6)**

The panel calls `window.__openWhseKbPicker`, which Task 6 implements. To keep Task 5 independently testable, add a temporary stub. In `index.html`, immediately before `function initWhseKbHosts() {` (added in Step 4), insert:

```javascript
    // Picker is implemented in Task 6. Temporary stub so the panel's
    // Add button does not throw before that task lands.
    if (typeof window.__openWhseKbPicker !== "function") {
      window.__openWhseKbPicker = function () {
        alert("The warehouse picker is not wired yet.");
      };
    }
```

- [ ] **Step 7: Manual smoke test**

`index.html` is a Jinja template served directly — no build step. Hard-refresh `https://<ngrok-host>/dashboard#activity`, open an agent's workspace, go to the Manage tab. Verify:
1. The "Warehouse documents (N)" panel renders above where the old KB table was.
2. The legacy "Add website / Add article / Add Q&A" table is gone (hidden).
3. For a migrated agent, the panel lists its warehouse docs with format/status/chunks and a visibility badge.
4. Clicking "Remove" on a doc, confirming, makes it disappear and the count decrements.
5. Switching to a different agent re-renders the panel for that agent.
6. "+ Add from warehouse" shows the stub alert (Task 6 replaces it).

If you cannot drive a browser, say so explicitly rather than marking this passed.

- [ ] **Step 8: Commit**

```bash
cd /home/dpalacios/home-server
git add templates/AIdashboard/index.html
git -c user.name="dpalacios" -c user.email="palaciosdanieldario@gmail.com" commit -m "feat: agent KB tab shows warehouse documents; legacy KB host hidden"
```

---

### Task 6: Add-from-warehouse picker modal

**Files:**
- Modify: `home-server/templates/AIdashboard/index.html` — add the picker modal CSS, markup, and JS; remove the Task 5 stub

- [ ] **Step 1: Remove the Task 5 stub**

In `index.html`, find and delete this block (added in Task 5 Step 6):

```javascript
    // Picker is implemented in Task 6. Temporary stub so the panel's
    // Add button does not throw before that task lands.
    if (typeof window.__openWhseKbPicker !== "function") {
      window.__openWhseKbPicker = function () {
        alert("The warehouse picker is not wired yet.");
      };
    }
```

- [ ] **Step 2: Add picker modal CSS**

In `index.html`, find the CSS block added in Task 5 (`.whse-kb-host { margin: 8px 0 4px; }`). Insert immediately before it:

```css
    .whse-pick-bg { position:fixed; inset:0; background:rgba(0,0,0,.45);
      display:none; align-items:center; justify-content:center; z-index:9999; }
    .whse-pick-bg.is-open { display:flex; }
    .whse-pick { background:var(--bg,#fff); color:var(--fg,#111);
      border-radius:12px; width:min(560px,92vw); max-height:82vh;
      display:flex; flex-direction:column; overflow:hidden; }
    .whse-pick-h { padding:16px 18px 8px; font-size:15px; font-weight:600; }
    .whse-pick-sub { padding:0 18px 10px; font-size:12px; color:var(--sub,#6b7280); }
    .whse-pick-list { overflow-y:auto; padding:4px 18px; flex:1; }
    .whse-pick-item { display:flex; align-items:center; gap:10px;
      padding:9px 0; border-bottom:1px solid var(--border,#eee); }
    .whse-pick-item.is-disabled { opacity:.5; }
    .whse-pick-item-main { flex:1; min-width:0; }
    .whse-pick-item-name { font-size:13px; }
    .whse-pick-item-meta { font-size:11px; color:var(--sub,#6b7280); }
    .whse-pick-foot { padding:12px 18px; display:flex; justify-content:flex-end;
      gap:8px; border-top:1px solid var(--border,#eee); }
    .whse-pick-btn { padding:8px 14px; font-size:13px; border-radius:8px;
      border:1px solid var(--border,#e5e7eb); background:transparent;
      color:var(--fg,#111); cursor:pointer; }
    .whse-pick-btn.is-primary { background:var(--accent,#2563eb); color:#fff;
      border-color:var(--accent,#2563eb); }
```

- [ ] **Step 3: Add picker modal markup**

In `index.html`, find the closing `</body>` tag. Insert this immediately before it:

```html
<div class="whse-pick-bg" id="whsePickBg">
  <div class="whse-pick" role="dialog" aria-modal="true">
    <div class="whse-pick-h">Add documents from your warehouse</div>
    <div class="whse-pick-sub" id="whsePickSub"></div>
    <div class="whse-pick-list" id="whsePickList"></div>
    <div class="whse-pick-foot">
      <button type="button" class="whse-pick-btn" id="whsePickCancel">Cancel</button>
      <button type="button" class="whse-pick-btn is-primary" id="whsePickAdd">Add</button>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Add the picker JS**

In `index.html`, find `function initWhseKbHosts() {` (from Task 5). Insert this complete component immediately before that line:

```javascript
    // ─── Add-from-warehouse picker ───
    // window.__openWhseKbPicker(agent, onAdded) — lists warehouse docs
    // the agent can still add (eligible by visibility, not already
    // referenced) and POSTs the selection to /me/agents/<id>/kb-documents.
    (function () {
      var bg = document.getElementById("whsePickBg");
      if (!bg) return;
      var listEl = document.getElementById("whsePickList");
      var subEl = document.getElementById("whsePickSub");
      var addBtn = document.getElementById("whsePickAdd");
      var cancelBtn = document.getElementById("whsePickCancel");
      var ctx = { agent: null, onAdded: null, selected: new Set() };

      function close() {
        bg.classList.remove("is-open");
        ctx = { agent: null, onAdded: null, selected: new Set() };
        listEl.innerHTML = "";
      }
      cancelBtn.addEventListener("click", close);
      bg.addEventListener("click", function (e) { if (e.target === bg) close(); });

      function syncAddBtn() {
        addBtn.textContent = ctx.selected.size
          ? "Add " + ctx.selected.size : "Add";
        addBtn.disabled = ctx.selected.size === 0;
      }

      window.__openWhseKbPicker = async function (agent, onAdded) {
        ctx.agent = agent;
        ctx.onAdded = onAdded;
        ctx.selected = new Set();
        var isCustomer = (agent.type !== "internal");
        subEl.textContent = isCustomer
          ? "This is a customer-facing agent — only customer-facing documents can be added."
          : "Internal agent — any document can be added.";
        listEl.innerHTML = '<div class="whse-pick-item-meta">Loading…</div>';
        bg.classList.add("is-open");
        syncAddBtn();

        var all = [];
        var have = [];
        try {
          var r1 = await fetch("/api/warehouse/documents",
                               { credentials: "same-origin" });
          if (r1.ok) {
            var d1 = await r1.json();
            all = (d1 && Array.isArray(d1.documents)) ? d1.documents : [];
          }
          var r2 = await fetch("/me/agents/" + encodeURIComponent(agent.id) +
                               "/kb-documents", { credentials: "same-origin" });
          if (r2.ok) {
            var d2 = await r2.json();
            have = ((d2 && d2.documents) || []).map(function (x) {
              return x.document_id;
            });
          }
        } catch (_) {}

        var haveSet = new Set(have);
        listEl.innerHTML = "";
        var shown = 0;
        all.forEach(function (doc) {
          var vis = doc.visibility || "internal";
          var already = haveSet.has(doc.document_id);
          var blocked = isCustomer && vis !== "customer_facing";
          var ready = doc.status === "ready";
          var item = document.createElement("div");
          item.className = "whse-pick-item" +
            ((already || blocked || !ready) ? " is-disabled" : "");
          var cb = document.createElement("input");
          cb.type = "checkbox";
          cb.disabled = already || blocked || !ready;
          cb.addEventListener("change", function () {
            if (cb.checked) ctx.selected.add(doc.document_id);
            else ctx.selected.delete(doc.document_id);
            syncAddBtn();
          });
          var main = document.createElement("div");
          main.className = "whse-pick-item-main";
          var nm = document.createElement("div");
          nm.className = "whse-pick-item-name";
          nm.textContent = doc.name || doc.filename || doc.document_id;
          var meta = document.createElement("div");
          meta.className = "whse-pick-item-meta";
          var note = already ? " · already added"
            : blocked ? " · not available — internal-only"
            : !ready ? " · still processing" : "";
          meta.textContent = (doc.format || "") + " · " +
            (vis === "customer_facing" ? "Customer-facing" : "Internal") + note;
          main.appendChild(nm);
          main.appendChild(meta);
          item.appendChild(cb);
          item.appendChild(main);
          listEl.appendChild(item);
          shown++;
        });
        if (!shown) {
          listEl.innerHTML =
            '<div class="whse-pick-item-meta">Your warehouse is empty.</div>';
        }
      };

      addBtn.addEventListener("click", function () {
        if (!ctx.agent || !ctx.selected.size) return;
        var ids = Array.from(ctx.selected);
        var ag = ctx.agent;
        var cb = ctx.onAdded;
        addBtn.disabled = true;
        fetch("/me/agents/" + encodeURIComponent(ag.id) + "/kb-documents", {
          method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ op: "add", document_ids: ids }),
        }).then(function (r) { return r.ok ? r.json() : null; })
          .then(function (res) {
            if (res) { close(); if (cb) cb(); }
            else { addBtn.disabled = false; alert("Couldn't add documents."); }
          })
          .catch(function () { addBtn.disabled = false; alert("Network error."); });
      });
    })();
```

- [ ] **Step 5: Manual smoke test**

Hard-refresh the dashboard, open an agent's Manage tab, click "+ Add from warehouse". Verify:
1. The modal lists warehouse documents.
2. For a **customer** agent, internal-visibility docs show "not available — internal-only" and their checkbox is disabled.
3. Docs already in the agent's KB show "already added", disabled.
4. Selecting docs updates the "Add N" button; clicking it closes the modal and the new docs appear in the panel.
5. For an **internal** agent, both visibilities are selectable.

State explicitly if you cannot drive a browser.

- [ ] **Step 6: Commit**

```bash
cd /home/dpalacios/home-server
git add templates/AIdashboard/index.html
git -c user.name="dpalacios" -c user.email="palaciosdanieldario@gmail.com" commit -m "feat: add-from-warehouse picker modal for the agent KB tab"
```

---

### Task 7: End-to-end verification + cleanup

**Files:**
- Delete: `local-server/server/_smoke_kbdocs.py`

- [ ] **Step 1: Confirm services healthy**

Run: `ss -tlnp 2>/dev/null | grep -cE ':5000|:9030|:9000'`
Expected: `3`. If not, restart honcho.

- [ ] **Step 2: Full end-to-end check in a browser**

Logged into the dashboard:
1. Create a new **customer** agent → open its Manage tab → the warehouse panel lists exactly the customer-facing warehouse docs (the seed).
2. Create a new **internal** agent → its panel lists all warehouse docs.
3. On the customer agent, remove a doc; in the agent's tester (Prompt tab), ask a question whose answer is only in that doc → the agent should NOT use it.
4. Add the doc back via the picker; ask again → the agent should now use it.
5. Delete a warehouse document from `#warehouse`; reopen an agent that referenced it → it's gone from the panel.

State explicitly if you cannot drive a browser; the Task 1–4 smoke scripts already prove the backend behavior non-visually.

- [ ] **Step 3: Regression check**

```bash
cd /home/dpalacios/local-server/server && python3 -c "import ast; ast.parse(open('app.py').read()); print('app.py OK')"
```
Confirm in a browser that warehouse upload still works (`#warehouse` drag-drop → `202`) and the API-token panel still loads. These share no code with this change but exercise the same file.

- [ ] **Step 4: Delete the temporary smoke script**

```bash
rm -f /home/dpalacios/local-server/server/_smoke_kbdocs.py
echo "cleaned"
```

- [ ] **Step 5: Final commit**

```bash
cd /home/dpalacios/local-server && git -c user.name="dpalacios" -c user.email="palaciosdanieldario@gmail.com" commit --allow-empty -m "chore: explicit agent KB (warehouse refs) feature complete"
```

---

## Self-Review

**Spec coverage:**
- `kb_document_ids` data model → Task 1. ✓
- Seed new agents by type → Task 1 Step 6. ✓
- `associated_agent_ids` as derived mirror → Task 2 (`_whse_sync_doc_agent_mirror`). ✓
- Snapshot migration, idempotent → Task 1 (`_ensure_kb_docs_migration`). ✓
- Retrieval filters by `kb_document_ids`; legacy `kb_retrieve` removed; SQL tables filtered → Task 3. ✓
- API GET/POST kb-documents → Task 2. ✓
- KB tab warehouse-only, legacy host hidden, list + remove → Task 5. ✓
- Add-from-warehouse picker with visibility eligibility → Task 6. ✓
- Deletion cascade → Task 4. ✓
- Visibility-downgrade cleanup → Task 4. ✓
- Out-of-scope items (notifications, legacy plumbing removal) → not built. ✓
- Smoke tests → Tasks 1–4 (Python), 5–7 (browser). ✓

**Placeholder scan:** No TBD/TODO. Every code step shows complete code; every command shows expected output. Task 5's picker stub is explicitly temporary and removed in Task 6 Step 1.

**Type/name consistency:** `kb_document_ids` (agent field), `kb_docs_migrated` (payload flag), `_whse_doc_ids_for_agent_snapshot`, `_ensure_kb_docs_migration`, `_whse_sync_doc_agent_mirror`, `_whse_cascade_remove_doc_from_agents`, `_whse_cleanup_visibility_downgrade`, route `/me/agents/<agent_id>/kb-documents`, ops `add`/`remove`, JS `wireWhseKbHost`/`initWhseKbHosts`/`__openWhseKbPicker`, host attr `data-whse-kb-mode`, modal ids `whsePickBg`/`whsePickList`/`whsePickAdd`/`whsePickCancel`/`whsePickSub` — used consistently across tasks. ✓
