# Explicit Agent KB — Warehouse Document References — Design

**Date:** 2026-05-15
**Status:** Approved design, pending implementation plan

## Problem

Today an agent retrieves from the warehouse implicitly: at answer time,
`_whse_doc_accessible` filters documents by the agent's type/visibility
(`_whse_context_for_agent` → `_whse_search`). The owner never picks
which documents an agent uses — it is automatic. A newly created agent
therefore appears to already "have" every visibility-matching document.

The owner wants explicit control: each agent has its own list of
warehouse documents, seeded at creation, then editable independently.
Removing a document from an agent removes only that agent's reference —
the document stays in the warehouse and other agents keep it.

## Decisions (locked)

| Dimension | Decision |
|---|---|
| Storage model | Agent-side. Each agent record gains a `kb_document_ids` list. |
| Existing agents | One-time snapshot migration — each agent's current effective docs become its `kb_document_ids`. |
| KB tab scope | Warehouse documents only. Legacy article/website/Q&A sections are removed from the agent tab. |
| v1 retrieval | Warehouse refs only. Legacy `kb_retrieve` is removed from the answering path. |

## Scope note

"Warehouse docs only" is two projects. **v1 (this spec)** builds the
warehouse-reference feature and makes the agent tab + answering
warehouse-only. **Retiring the legacy KB plumbing** — `/kb/sources`
website trainer, `/knowledege` articles/FAQs, legacy embed bundles,
`kb_retrieve`, Drive-import-to-KB — is a separate later project. In v1
that code is left in place but orphaned (no agent UI points at it, the
answer path no longer calls it).

## Data Model

The agent record gains one field:

```
kb_document_ids: ["doc_ab12...", "doc_cd34...", ...]
```

This list is the single source of truth for what a warehouse-knowledge
the agent retrieves from.

`associated_agent_ids` on each warehouse document is retained but
changes role: it becomes a **derived mirror** of `kb_document_ids`.
Whenever an agent's list changes, the affected documents'
`associated_agent_ids` are updated to match. Retrieval no longer reads
it; it exists so the warehouse UI can show "used by N agents" and so
deletion cascade is a fast lookup.

## Agent Creation

When a new agent is created (`me_agents_create`), `kb_document_ids` is
seeded from the warehouse by agent type:

- **customer** agent → every document with `status: ready` and
  `visibility == customer_facing`
- **internal** agent → every document with `status: ready` (both
  `internal` and `customer_facing`)

The two default agents (Customer bot, Internal team bot) are ordinary
agents here — no special-casing.

## Migration

One-time per account, idempotent, hooked into the existing
`_ensure_agents_migration` path with a `kb_docs_migrated` flag on the
agents payload.

For each existing agent, the migration snapshots the set of documents
that agent can currently retrieve — the documents for which today's
`_whse_doc_accessible(doc, agent_id, _whse_allowed_visibilities(type))`
returns `True` — and writes their ids into `kb_document_ids`. The
affected documents' `associated_agent_ids` mirrors are updated to
match.

After migration, every agent retrieves from the same documents it did
before; the list is now editable.

## Retrieval

`_whse_search` already accepts a `document_ids=` parameter.

- **`_whse_context_for_agent`** loads the agent and calls
  `_whse_search(account_id, question, document_ids=agent["kb_document_ids"])`.
  The `allowed_visibilities` argument is dropped — the explicit list is
  the boundary.
- **The ask path** (`app.py` ~28947) removes the legacy `kb_retrieve`
  call. `kb_context` becomes purely the warehouse context.
- **Warehouse SQL tables** (`app.py` ~28665): a warehouse spreadsheet's
  table is folded into the agent's SQL context only when its source
  `document_id` is in `kb_document_ids`. Same explicit rule, applied to
  structured data.

Net effect: an agent retrieves from exactly its `kb_document_ids` —
text chunks and SQL tables alike. Remove a document → it cannot be
retrieved; add one → it can.

## API

**`GET /me/agents/<agent_id>/kb-documents`** — returns the agent's
referenced documents, each with display metadata: `document_id`,
`name`, `format`, `visibility`, `status`, `chunk_count`.

**`POST /me/agents/<agent_id>/kb-documents`** — body
`{"op": "add" | "remove", "document_ids": [...]}`. Mutates
`kb_document_ids` and synchronizes the `associated_agent_ids` mirror on
the affected documents. POST-with-op (not DELETE) for proxy safety.

Both endpoints are session-gated and scoped to the owner's account.

The "Add from warehouse" picker reuses `GET /api/warehouse/documents`
(the full account list) and filters client-side: excludes
already-referenced documents and, for a customer agent, excludes
`internal` documents.

## KB Tab UI

The `kb-table-host` content in the agent workspace is replaced:

- A **"Warehouse documents (N)"** list. Each row shows the document
  name, format, a visibility badge, processing status, and a **Remove**
  control.
- A **"+ Add from warehouse"** button opens the picker modal. The
  picker lists eligible documents not already referenced. A customer
  agent can only add `customer_facing` documents; an internal agent can
  add any. (This is where the visibility boundary is enforced.)
- **Remove** shows a confirm: "Removes this document from the agent. It
  stays in your warehouse and other agents keep it."
- The legacy **Train a website / Add article / Add Q&A** buttons and
  the article/website/Q&A rows are removed from the agent tab.
- Empty state: "No documents yet — add from your warehouse."

## Cascades and Edge Cases

**Deletion cascade** — when a warehouse document is deleted
(`api_warehouse_delete`), its `document_id` is removed from every
agent's `kb_document_ids`. The document's `associated_agent_ids` mirror
identifies which agents to update.

**Visibility downgrade** — when a document's visibility is changed to
`internal`, it is removed from the `kb_document_ids` of every customer
agent that referenced it, preventing a customer-facing agent from
silently retaining internal content. A change to `customer_facing`
triggers no automatic action — the document simply becomes addable.

**New document uploaded after agents exist** — does not auto-add to any
agent. The owner adds it through the picker.

## Out of Scope (v1)

- Notification/bell subsystem (new-doc alerts, visibility-change alerts)
- Removal of legacy KB plumbing (endpoints, trainer, storage) — left
  orphaned, retired in a separate project
- Per-conversation KB overrides
- Bulk multi-agent KB management
- Auto-include mode for non-default agents
- Visibility-override flag (referencing an internal doc from a customer
  agent on purpose)

## Testing (smoke)

1. New customer agent → `kb_document_ids` contains exactly the ready
   `customer_facing` documents. New internal agent → contains all ready
   documents.
2. Migration → an existing agent's post-migration `kb_document_ids`
   equals the documents it could retrieve pre-migration; re-running the
   migration is a no-op.
3. Remove a document from an agent → a query that previously hit that
   document returns nothing from it; other referenced documents still
   return.
4. Add a document to an agent → a query for its content now retrieves
   it.
5. A customer agent's picker cannot add an `internal` document.
6. Delete a warehouse document → its id is gone from every agent's
   `kb_document_ids`.
7. Regression: warehouse upload/replace/processing, the API-token
   feature, and per-agent direct sources are unaffected.
