# Warehouse API Token — Design

**Date:** 2026-05-15
**Status:** Approved design, pending implementation plan

## Problem

The Warehouse (`#warehouse`) stores business documents as GCS blobs under
`crm_base(account_id)/warehouse/`. Today every `/api/warehouse/*` route is
gated solely by the Flask session cookie via `_dbig_require_session()`
(reads `session["customer_id"]`). There is no programmatic credential.

To add data to the warehouse from a script — and to keep that safe if the
endpoint is exposed publicly — the owner needs a per-account bearer token.
A request carrying a valid token can ingest documents into exactly one
account's warehouse and nothing else.

## Decisions (locked)

| Dimension | Decision |
|---|---|
| Token scope | **Warehouse write only** — `upload`, `replace`, `reprocess`. No read, no delete, no `ask`. |
| Token model | **One token per account.** Regenerate replaces it. |
| Delivery | **`Authorization: Bearer wh_…`**, standard header. Requires a C proxy change. |
| Storage | **Plaintext, always viewable** in the `#warehouse` page. |
| Lifecycle | **Created on demand** — no token exists until the user clicks Generate. |
| Lookup | **Per-token reverse-index blob** — O(1), no hot global file. |

## Components

1. **Token generator** — value is `wh_` + `secrets.token_urlsafe(32)`. The
   `wh_` prefix identifies the credential in logs and lets the auth layer
   fast-reject anything that is not a warehouse token.
2. **Storage** — two blobs per token (see Storage Layout).
3. **Management endpoints** — `GET/POST/DELETE /api/warehouse/api-token`,
   session-gated only.
4. **Auth layer** — `_whse_resolve_account()` accepts either a Flask
   session or a valid bearer token; used only on the three write routes.
5. **C proxy change** — forward the `Authorization` header for
   `/api/warehouse/*`.

## Token Lifecycle

- **None** — no token blobs exist. The `#warehouse` page shows a Generate
  button. API write calls return `401`.
- **Generate** — write both blobs; the page shows the full token.
- **Regenerate** — delete the old reverse-index blob (old token dies
  immediately), write a new reverse-index blob, overwrite the per-account
  blob.
- **Revoke (Delete)** — remove both blobs. API access is off until the
  user generates again.

## Storage Layout

Both blobs live in the existing `BUCKET_NAME`.

**Per-account blob** — display source for the `#warehouse` page, keyed by
account:
```
crm_base(<account_id>)/warehouse/_api_token.json
  { "token": "wh_<random>", "created_at": "<iso>", "last_used_at": "<iso>|null" }
```

**Per-token reverse-index blob** — auth source of truth, keyed by the
token value itself:
```
<bucket>/_warehouse_api_tokens/<token>.json
  { "account_id": "<cid>", "created_at": "<iso>" }
```

Auth reads one exact key — no scanning, no global file that grows
unbounded. The reverse-index blob is authoritative for "is this token
live": deleting it instantly revokes access even if the per-account blob
briefly lags.

`last_used_at` is updated best-effort (one extra write, failures ignored)
on a successful authenticated call so the UI can show recency.

## Auth Flow

New helper alongside `_dbig_require_session()`:

```
_whse_resolve_account() -> (account_id, None) | (None, error_response)
  1. session has customer_id            -> return it (browser path)
  2. else read Authorization header:
       - missing / not "Bearer wh_..."  -> 401 unauthenticated
       - read _warehouse_api_tokens/<token>.json
           - not found                  -> 401 invalid_token
           - found                      -> stamp last_used_at, return account_id
```

Applied **only** to `api_warehouse_upload`, `api_warehouse_replace`,
`api_warehouse_reprocess` — swap `_dbig_require_session()` for
`_whse_resolve_account()`. Every other warehouse route keeps
`_dbig_require_session()`, so a token cannot list, read, delete, or `ask`.

The resolved `account_id` becomes the GCS path prefix — a token can never
touch another account's warehouse, the same isolation the session cookie
gives today.

## Request Path (public call)

```
client --Authorization: Bearer wh_...--> :9030 C proxy
  proxy: route matches /api/warehouse/, forwards body + Cookie +
         Content-Type + (NEW) Authorization
  --> :5000 Flask
  Flask: _whse_resolve_account() reads reverse-index blob -> cid
  --> existing upload/replace/reprocess logic, scoped to cid
```

## C Proxy Change

In `home-server/routes/local-server/POST/post_local_server.c` (and the GET
equivalent), `post_to_local` / `get_to_local` rebuild the upstream request
and copy only a header whitelist (`Cookie`, `Content-Type`, `Host`,
`X-Hub-Signature-256`, `X-Forwarded-Host`).

Add an **`Authorization` passthrough block** mirroring the existing
`Cookie` extraction: find `\r\nAuthorization:` in the incoming header,
copy the value, append it to the rebuilt upstream request. Additive,
touches nothing else. The proxy must be recompiled and restarted via
honcho.

## Management Endpoints

`/api/warehouse/api-token`, **session-gated only**
(`_dbig_require_session()`) — a token can never mint or rotate itself.

| Method | Behavior |
|---|---|
| `GET` | Return `{token, created_at, last_used_at}` or `{token: null}`. |
| `POST` | Body `{"op":"generate"}` (default) generates or regenerates and returns the new token. Body `{"op":"revoke"}` deletes both blobs. |

Revoke rides on `POST` rather than `DELETE`: the `:9030` C proxy
rewrites every non-`POST` `/api/warehouse/*` request as a `GET`, so a
`DELETE` would never reach Flask as a delete. This mirrors the existing
doc-delete route, which uses `POST {op:"delete"}` for the same reason.

## UI — `#warehouse` Page

An **"API access"** panel in `warehouse.html`, two states:

- **No token:** short blurb + **Generate token** button.
- **Token exists:** read-only field with the full token + **Copy**,
  `created_at` / `last_used_at` text, **Regenerate** (confirm dialog —
  "old token stops working immediately"), **Revoke**. Below: a collapsed
  `curl` example pre-filled with the token and ngrok host.

The field shows the full token on every load (plaintext in the blob).

## Error Handling

All JSON, consistent with existing warehouse routes:

- No / garbled auth → `401 unauthenticated`
- `Bearer` value not a known token → `401 invalid_token`
- Existing upload validations (`415` unsupported, `413` too large, `507`
  quota, `409` duplicate) are unchanged — token auth runs first, then the
  same logic.

## Testing (smoke)

1. Generate → both blobs exist.
2. `curl` upload through `:9030` with `Authorization: Bearer` → `202`,
   doc lands under the right account.
3. Same `curl` with a bogus token → `401 invalid_token`.
4. Regenerate → old token `401`, new token `202`.
5. Token against a read route (`GET /documents`) → `401` (scope
   containment).
6. Revoke → token `401`; session-based browser upload still `202`
   (browser path untouched).
7. Confirm the recompiled proxy forwards `Authorization` — without the C
   change, test 2 would `401`.

## Security Notes

- Plaintext storage was an explicit owner choice for convenience. Anyone
  with GCS read access to the bucket, or viewing a screen-share of the
  `#warehouse` page, sees a live credential. Regenerate is the mitigation
  if a token is believed exposed.
- Scope containment is the primary safety property: a leaked token can
  add/replace documents in one account's warehouse but cannot read,
  delete, or reach any other route or account.
