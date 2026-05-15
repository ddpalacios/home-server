# Warehouse API Token Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-account bearer token that lets a script write documents into one account's Warehouse (`upload` / `replace` / `reprocess`) and nothing else.

**Architecture:** A token (`wh_` + `secrets.token_urlsafe(32)`) is stored in two GCS blobs — a per-account blob for display, a per-token reverse-index blob for O(1) auth lookup. A new `_whse_resolve_account()` helper accepts either a Flask session or a valid `Authorization: Bearer` token, and replaces `_dbig_require_session()` on exactly the three write routes. The `:9030` C proxy is patched to forward the `Authorization` header (it currently strips it). The `#warehouse` page gets an "API access" panel to generate / view / regenerate / revoke the token.

**Tech Stack:** Python/Flask (`local-server/server/app.py`), C HTTP proxy (`home-server/routes/local-server/POST/post_local_server.c`, built with CMake), vanilla JS template (`home-server/templates/AIdashboard/warehouse.html`), GCS JSON blobs.

---

## Deviation from spec

The spec's Management Endpoints section listed a `DELETE` method for revoke. **The C proxy rewrites every non-POST `/api/warehouse/*` request as a `GET`** (see `route.c` warehouse branch: `if POST -> post_to_local else -> get_to_local`, and `get_to_local` emits a literal `GET` line). A `DELETE` would therefore never reach Flask as a DELETE. Revoke is implemented as `POST /api/warehouse/api-token` with body `{"op":"revoke"}`, mirroring the existing doc-delete convention (`POST {op:"delete"}` at `api_warehouse_delete`). The spec file has been updated to match.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `local-server/server/app.py` | Modify | Token helpers, `_whse_resolve_account()`, `/api/warehouse/api-token` endpoint, swap auth on 3 write routes |
| `home-server/routes/local-server/POST/post_local_server.c` | Modify | Forward the `Authorization` header to upstream Flask |
| `home-server/templates/AIdashboard/warehouse.html` | Modify | "API access" panel — generate / copy / regenerate / revoke UI |

No new files. All changes extend existing units.

## Testing note

This codebase has no pytest harness. Backend behavior is verified the same way the recent agent-delete fix was: a throwaway-account Python smoke script that imports `app` directly, plus `curl` against the running stack. Each task below carries its own smoke verification. "Tests fail first" here means: run the smoke check before the change and observe the failure it is designed to catch.

## Honcho restart procedure (referenced by several tasks)

```bash
cd /home/dpalacios
pkill -f "honcho start" 2>/dev/null; sleep 4
(nohup honcho start > /tmp/honcho.log 2>&1 < /dev/null &)
# The FIRST honcho start reliably exits 144. If after ~30s nothing is
# listening, run the (nohup honcho start ...) line again.
sleep 28
ss -tlnp 2>/dev/null | grep -E ":5000|:9030|:9000" | wc -l   # expect 3
```

---

### Task 1: Token storage helpers + auth resolver + management endpoint

**Files:**
- Modify: `local-server/server/app.py` — insert helpers after `_whse_raw_path` (the function ending `return f"{_whse_base(account_id)}/{document_id}/raw/v{version}/{filename}"`)
- Modify: `local-server/server/app.py` — insert the endpoint immediately after `api_warehouse_quota` (the route returning `used_bytes`/`quota_bytes`)
- Test: `local-server/server/_smoke_whse_token.py` (temporary; deleted in Task 5)

- [ ] **Step 1: Write the failing smoke script**

Create `local-server/server/_smoke_whse_token.py`:

```python
"""Smoke test: warehouse API token helpers. Run from the server dir."""
import os
os.environ.setdefault("FLASK_SECRET_KEY", "x")
import app

TCID = "test_whse_token_smoke01"

# Clean slate.
app._whse_delete_api_token(TCID)

# 1. No token yet -> _whse_load_api_token returns None.
assert app._whse_load_api_token(TCID) is None, "FAIL: expected no token"

# 2. Generate -> per-account blob + reverse-index blob both exist.
meta = app._whse_generate_api_token(TCID)
tok = meta["token"]
assert tok.startswith("wh_"), "FAIL: token missing wh_ prefix"
assert app._whse_load_api_token(TCID)["token"] == tok, "FAIL: account blob"
rev = app.load_blob_json(app.BUCKET_NAME,
                         app._whse_api_token_index_path(tok), None)
assert rev and rev["account_id"] == TCID, "FAIL: reverse-index blob"
print("1-2 PASS: generate writes both blobs")

# 3. Regenerate -> old reverse-index blob gone, new one resolves.
meta2 = app._whse_generate_api_token(TCID)
tok2 = meta2["token"]
assert tok2 != tok, "FAIL: regenerate produced same token"
old_rev = app.load_blob_json(app.BUCKET_NAME,
                             app._whse_api_token_index_path(tok), None)
assert old_rev is None, "FAIL: old reverse-index blob not deleted"
new_rev = app.load_blob_json(app.BUCKET_NAME,
                             app._whse_api_token_index_path(tok2), None)
assert new_rev and new_rev["account_id"] == TCID, "FAIL: new reverse blob"
print("3 PASS: regenerate kills old token, new one lives")

# 4. Delete -> both blobs gone.
app._whse_delete_api_token(TCID)
assert app._whse_load_api_token(TCID) is None, "FAIL: account blob remains"
assert app.load_blob_json(app.BUCKET_NAME,
        app._whse_api_token_index_path(tok2), None) is None, \
    "FAIL: reverse-index blob remains"
print("4 PASS: delete removes both blobs")
print("ALL PASS")
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /home/dpalacios/local-server/server && python3 _smoke_whse_token.py`
Expected: FAIL — `AttributeError: module 'app' has no attribute '_whse_delete_api_token'`.

- [ ] **Step 3: Add the token helpers**

In `local-server/server/app.py`, find `_whse_raw_path`:

```python
def _whse_raw_path(account_id, document_id, version, filename):
    return f"{_whse_base(account_id)}/{document_id}/raw/v{version}/{filename}"
```

Insert immediately after it:

```python


# ── Warehouse API token — programmatic bearer auth for write routes ──
_WHSE_API_TOKEN_PREFIX = "wh_"


def _whse_api_token_account_path(account_id):
    """Per-account blob — display source for the #warehouse page."""
    return f"{_whse_base(account_id)}/_api_token.json"


def _whse_api_token_index_path(token):
    """Per-token reverse-index blob — auth lookup keyed by the token
    value itself, so resolving a token is one O(1) blob read."""
    return f"_warehouse_api_tokens/{token}.json"


def _whse_load_api_token(account_id):
    """Return the account's token metadata dict, or None if no token
    has been generated."""
    return load_blob_json(BUCKET_NAME,
                          _whse_api_token_account_path(account_id), None)


def _whse_generate_api_token(account_id):
    """Generate (or regenerate) the account's warehouse API token.
    Writes the new reverse-index blob first, then the per-account
    blob, then deletes any prior reverse-index blob so the old token
    dies. Returns {token, created_at, last_used_at}."""
    prior = _whse_load_api_token(account_id)
    now = datetime.utcnow().isoformat() + "Z"
    token = _WHSE_API_TOKEN_PREFIX + secrets.token_urlsafe(32)
    save_blob_json(BUCKET_NAME, _whse_api_token_index_path(token),
                   {"account_id": account_id, "created_at": now})
    meta = {"token": token, "created_at": now, "last_used_at": None}
    save_blob_json(BUCKET_NAME,
                   _whse_api_token_account_path(account_id), meta)
    if prior and prior.get("token") and prior["token"] != token:
        try:
            get_storage_client().bucket(BUCKET_NAME).blob(
                _whse_api_token_index_path(prior["token"])).delete()
        except Exception:
            pass
    return meta


def _whse_delete_api_token(account_id):
    """Revoke — remove both the reverse-index and per-account blobs."""
    prior = _whse_load_api_token(account_id)
    bk = get_storage_client().bucket(BUCKET_NAME)
    if prior and prior.get("token"):
        try:
            bk.blob(_whse_api_token_index_path(prior["token"])).delete()
        except Exception:
            pass
    try:
        bk.blob(_whse_api_token_account_path(account_id)).delete()
    except Exception:
        pass


def _whse_resolve_account():
    """Auth for warehouse WRITE routes. Like _dbig_require_session(),
    but also accepts a warehouse API bearer token when there is no
    session. Returns (account_id, None) or (None, error_response)."""
    cid = (session.get("customer_id") or "").strip()
    if cid:
        return cid, None
    auth = (request.headers.get("Authorization") or "").strip()
    if not auth.lower().startswith("bearer "):
        return None, (jsonify({"error": "unauthenticated"}), 401)
    token = auth[7:].strip()
    if not token.startswith(_WHSE_API_TOKEN_PREFIX):
        return None, (jsonify({"error": "invalid_token"}), 401)
    rec = load_blob_json(BUCKET_NAME,
                         _whse_api_token_index_path(token), None)
    if not rec or not rec.get("account_id"):
        return None, (jsonify({"error": "invalid_token"}), 401)
    acct = rec["account_id"]
    # Best-effort last-used stamp; never fail the request on this.
    try:
        meta = _whse_load_api_token(acct)
        if meta and meta.get("token") == token:
            meta["last_used_at"] = datetime.utcnow().isoformat() + "Z"
            save_blob_json(BUCKET_NAME,
                           _whse_api_token_account_path(acct), meta)
    except Exception:
        pass
    return acct, None
```

(`secrets` is already imported at the top of `app.py`; `datetime`, `load_blob_json`, `save_blob_json`, `get_storage_client`, `BUCKET_NAME`, `session`, `request`, `jsonify` are all already in scope.)

- [ ] **Step 4: Run the smoke script to verify it passes**

Run: `cd /home/dpalacios/local-server/server && python3 _smoke_whse_token.py`
Expected: prints `1-2 PASS`, `3 PASS`, `4 PASS`, `ALL PASS`.

- [ ] **Step 5: Add the management endpoint**

In `app.py`, find `api_warehouse_quota` — the function ending:

```python
    return jsonify({
        "used_bytes":  used,
        "quota_bytes": WHSE_DEFAULT_QUOTA_BYTES,
    }), 200
```

Insert immediately after it (before `@app.route("/api/warehouse/documents", methods=["GET"])`):

```python


@app.route("/api/warehouse/api-token", methods=["GET", "POST"])
def api_warehouse_api_token():
    """Manage the account's warehouse API token. Session-gated only —
    a token can never mint or rotate itself.

    GET   -> {token, created_at, last_used_at} or {token: null}.
    POST  -> op="generate" (default) mints/rotates; op="revoke" deletes.
             Revoke rides on POST because the :9030 proxy rewrites every
             non-POST /api/warehouse/* request as GET."""
    cid, err = _dbig_require_session()
    if err:
        return err
    if request.method == "GET":
        meta = _whse_load_api_token(cid)
        if not meta:
            return jsonify({"token": None}), 200
        return jsonify({
            "token":        meta.get("token"),
            "created_at":   meta.get("created_at"),
            "last_used_at": meta.get("last_used_at"),
        }), 200
    data = request.get_json(silent=True) or {}
    op = (data.get("op") or "generate").strip().lower()
    if op == "revoke":
        _whse_delete_api_token(cid)
        return jsonify({"ok": True, "token": None}), 200
    meta = _whse_generate_api_token(cid)
    return jsonify(meta), 200
```

- [ ] **Step 6: Verify the file still parses**

Run: `cd /home/dpalacios/local-server/server && python3 -c "import ast; ast.parse(open('app.py').read()); print('OK')"`
Expected: `OK`.

- [ ] **Step 7: Commit**

```bash
cd /home/dpalacios/home-server
git add ../local-server/server/app.py 2>/dev/null || true
cd /home/dpalacios/local-server 2>/dev/null && git add server/app.py 2>/dev/null || true
git -C /home/dpalacios/local-server commit -m "feat: warehouse API token helpers + management endpoint" 2>/dev/null \
  || echo "NOTE: local-server may not be a git repo — skip commit, changes stay on disk"
```

(If `local-server` is not a git repo, the change simply stays on disk — that is expected for this project layout and is fine.)

---

### Task 2: Wire the three write routes to token auth

**Files:**
- Modify: `local-server/server/app.py` — `api_warehouse_upload`, `api_warehouse_reprocess`, `api_warehouse_replace`

- [ ] **Step 1: Swap auth on `api_warehouse_upload`**

Find:

```python
@app.route("/api/warehouse/upload", methods=["POST"])
def api_warehouse_upload():
    cid, err = _dbig_require_session()
    if err:
        return err
```

Replace the `cid, err` line with `_whse_resolve_account()`:

```python
@app.route("/api/warehouse/upload", methods=["POST"])
def api_warehouse_upload():
    cid, err = _whse_resolve_account()
    if err:
        return err
```

- [ ] **Step 2: Swap auth on `api_warehouse_reprocess`**

Find:

```python
def api_warehouse_reprocess(document_id):
    """Re-run extraction for a doc (the 'Try again' button after a
    failed status)."""
    cid, err = _dbig_require_session()
    if err:
        return err
```

Replace with:

```python
def api_warehouse_reprocess(document_id):
    """Re-run extraction for a doc (the 'Try again' button after a
    failed status)."""
    cid, err = _whse_resolve_account()
    if err:
        return err
```

- [ ] **Step 3: Swap auth on `api_warehouse_replace`**

Find:

```python
def api_warehouse_replace(document_id):
    """Phase 4: atomically replace a document's content. The new file
    is processed as version N+1 in the background; the live version
    stays searchable until the new version is fully ready."""
    cid, err = _dbig_require_session()
    if err:
        return err
```

Replace with:

```python
def api_warehouse_replace(document_id):
    """Phase 4: atomically replace a document's content. The new file
    is processed as version N+1 in the background; the live version
    stays searchable until the new version is fully ready."""
    cid, err = _whse_resolve_account()
    if err:
        return err
```

- [ ] **Step 4: Verify only those three changed**

Run: `cd /home/dpalacios/local-server/server && grep -n "_whse_resolve_account()" app.py`
Expected: exactly 4 lines — the `def _whse_resolve_account` definition plus 3 call sites (`api_warehouse_upload`, `api_warehouse_reprocess`, `api_warehouse_replace`).

Run: `python3 -c "import ast; ast.parse(open('app.py').read()); print('OK')"`
Expected: `OK`.

- [ ] **Step 5: Restart honcho and smoke-test session-path upload still works**

Restart honcho (see "Honcho restart procedure" above). Then confirm the browser/session path is unbroken — open `https://<ngrok-host>/dashboard#warehouse` in a logged-in browser and upload a small file; it should still land as it did before (status `uploaded` → processing). This proves swapping the helper did not break the existing session path. The token path is exercised in Task 3.

- [ ] **Step 6: Commit**

```bash
git -C /home/dpalacios/local-server commit -am "feat: accept warehouse API token on upload/replace/reprocess" 2>/dev/null \
  || echo "NOTE: local-server not a git repo — change stays on disk"
```

---

### Task 3: C proxy — forward the Authorization header

**Files:**
- Modify: `home-server/routes/local-server/POST/post_local_server.c` — `post_to_local`

Only `post_to_local` needs the change: the three write routes are all POST. The `GET /api/warehouse/api-token` management call is session-gated (Cookie), which the proxy already forwards — so `get_to_local` is intentionally left untouched (YAGNI).

- [ ] **Step 1: Add the `auth_value` declaration**

Find:

```c
	char *cookie_value = NULL;
	char *content_type_value = NULL;
	char *fwd_host_value = NULL;
	char *hub_sig_value = NULL;  /* X-Hub-Signature-256 — Meta webhook HMAC */
```

Replace with:

```c
	char *cookie_value = NULL;
	char *content_type_value = NULL;
	char *fwd_host_value = NULL;
	char *hub_sig_value = NULL;  /* X-Hub-Signature-256 — Meta webhook HMAC */
	char *auth_value = NULL;     /* Authorization — warehouse API token */
```

- [ ] **Step 2: Add the Authorization extraction block**

Find the end of the X-Hub-Signature extraction block followed by the Content-Type comment:

```c
		if (sig_start) {
			sig_start += (sig_start == http_header) ? 20 : 22;
			while (*sig_start == ' ') sig_start++;
			const char *sig_end = strstr(sig_start, "\r\n");
			if (sig_end && sig_end > sig_start) {
				size_t len = (size_t)(sig_end - sig_start);
				hub_sig_value = malloc(len + 1);
				if (hub_sig_value) {
					memcpy(hub_sig_value, sig_start, len);
					hub_sig_value[len] = '\0';
				}
			}
		}

		/* Forward incoming Content-Type so form-urlencoded posts (e.g.
```

Insert the new block between the closing `}` of the sig block and the `/* Forward incoming Content-Type` comment:

```c
		if (sig_start) {
			sig_start += (sig_start == http_header) ? 20 : 22;
			while (*sig_start == ' ') sig_start++;
			const char *sig_end = strstr(sig_start, "\r\n");
			if (sig_end && sig_end > sig_start) {
				size_t len = (size_t)(sig_end - sig_start);
				hub_sig_value = malloc(len + 1);
				if (hub_sig_value) {
					memcpy(hub_sig_value, sig_start, len);
					hub_sig_value[len] = '\0';
				}
			}
		}

		/* Forward the Authorization header so warehouse API-token
		 * Bearer auth survives the proxy hop. Without this, a
		 * programmatic POST to /api/warehouse/* loses its credential
		 * and Flask 401s. */
		const char *auth_start = strstr(http_header, "\r\nAuthorization:");
		if (!auth_start && strncasecmp(http_header, "Authorization:", 14) == 0) {
			auth_start = http_header;
		}
		if (auth_start) {
			auth_start += (auth_start == http_header) ? 14 : 16;
			while (*auth_start == ' ') auth_start++;
			const char *auth_end = strstr(auth_start, "\r\n");
			if (auth_end && auth_end > auth_start) {
				size_t len = (size_t)(auth_end - auth_start);
				auth_value = malloc(len + 1);
				if (auth_value) {
					memcpy(auth_value, auth_start, len);
					auth_value[len] = '\0';
				}
			}
		}

		/* Forward incoming Content-Type so form-urlencoded posts (e.g.
```

- [ ] **Step 3: Build the `auth_line` string**

Find:

```c
	char hub_sig_line[1024];
	hub_sig_line[0] = '\0';
	if (hub_sig_value) {
		snprintf(hub_sig_line, sizeof(hub_sig_line),
			"X-Hub-Signature-256: %s\r\n", hub_sig_value);
	}
```

Replace with:

```c
	char hub_sig_line[1024];
	hub_sig_line[0] = '\0';
	if (hub_sig_value) {
		snprintf(hub_sig_line, sizeof(hub_sig_line),
			"X-Hub-Signature-256: %s\r\n", hub_sig_value);
	}

	char auth_line[2048];
	auth_line[0] = '\0';
	if (auth_value) {
		snprintf(auth_line, sizeof(auth_line),
			"Authorization: %s\r\n", auth_value);
	}
```

- [ ] **Step 4: Include `auth_line` in the header buffer size**

Find:

```c
	size_t header_size = 2048
		+ (cookie_value ? strlen(cookie_value) : 0)
		+ strlen(content_type)
		+ strlen(fwd_host_line)
		+ strlen(hub_sig_line)
		+ strlen(route);
```

Replace with:

```c
	size_t header_size = 2048
		+ (cookie_value ? strlen(cookie_value) : 0)
		+ strlen(content_type)
		+ strlen(fwd_host_line)
		+ strlen(hub_sig_line)
		+ strlen(auth_line)
		+ strlen(route);
```

- [ ] **Step 5: Free `auth_value` on the malloc-failure path**

Find:

```c
	char *header_buf = malloc(header_size);
	if (!header_buf) {
		perror("malloc failed");
		if (cookie_value) free(cookie_value);
		if (content_type_value) free(content_type_value);
		if (fwd_host_value) free(fwd_host_value);
		if (hub_sig_value) free(hub_sig_value);
		close(sfd);
		return;
	}
```

Replace with:

```c
	char *header_buf = malloc(header_size);
	if (!header_buf) {
		perror("malloc failed");
		if (cookie_value) free(cookie_value);
		if (content_type_value) free(content_type_value);
		if (fwd_host_value) free(fwd_host_value);
		if (hub_sig_value) free(hub_sig_value);
		if (auth_value) free(auth_value);
		close(sfd);
		return;
	}
```

- [ ] **Step 6: Emit `auth_line` in both snprintf branches**

Find the cookie branch:

```c
	if (cookie_value) {
		header_written = snprintf(header_buf, header_size,
			"POST %s HTTP/1.1\r\n"
			"Host: %s:%s\r\n"
			"%s"
			"%s"
			"Content-Type: %s\r\n"
			"Content-Length: %zu\r\n"
			"Cookie: %s\r\n"
			"Connection: close\r\n"
			"\r\n",
			route,
			"127.0.0.1", port, fwd_host_line, hub_sig_line,
			content_type, body_len, cookie_value);
		free(cookie_value);
	} else {
		header_written = snprintf(header_buf, header_size,
			"POST %s HTTP/1.1\r\n"
			"Host: %s:%s\r\n"
			"%s"
			"%s"
			"Content-Type: %s\r\n"
			"Content-Length: %zu\r\n"
			"Connection: close\r\n"
			"\r\n",
			route,
			"127.0.0.1", port, fwd_host_line, hub_sig_line,
			content_type, body_len);
	}
```

Replace with (adds a third `"%s"` for `auth_line` after `hub_sig_line`, and `auth_line` in the arg list):

```c
	if (cookie_value) {
		header_written = snprintf(header_buf, header_size,
			"POST %s HTTP/1.1\r\n"
			"Host: %s:%s\r\n"
			"%s"
			"%s"
			"%s"
			"Content-Type: %s\r\n"
			"Content-Length: %zu\r\n"
			"Cookie: %s\r\n"
			"Connection: close\r\n"
			"\r\n",
			route,
			"127.0.0.1", port, fwd_host_line, hub_sig_line,
			auth_line, content_type, body_len, cookie_value);
		free(cookie_value);
	} else {
		header_written = snprintf(header_buf, header_size,
			"POST %s HTTP/1.1\r\n"
			"Host: %s:%s\r\n"
			"%s"
			"%s"
			"%s"
			"Content-Type: %s\r\n"
			"Content-Length: %zu\r\n"
			"Connection: close\r\n"
			"\r\n",
			route,
			"127.0.0.1", port, fwd_host_line, hub_sig_line,
			auth_line, content_type, body_len);
	}
```

- [ ] **Step 7: Free `auth_value` after the header is built**

Find:

```c
	if (content_type_value) free(content_type_value);
	if (fwd_host_value) free(fwd_host_value);
	if (hub_sig_value) free(hub_sig_value);
```

Replace with:

```c
	if (content_type_value) free(content_type_value);
	if (fwd_host_value) free(fwd_host_value);
	if (hub_sig_value) free(hub_sig_value);
	if (auth_value) free(auth_value);
```

- [ ] **Step 8: Recompile the proxy**

Run: `cd /home/dpalacios/home-server/build && cmake --build . 2>&1 | tail -5`
Expected: `[100%] Built target home-server`, no errors or warnings about `post_local_server.c`.

- [ ] **Step 9: Restart honcho and run the end-to-end token smoke test**

Restart honcho (see "Honcho restart procedure"). Then:

```bash
cd /home/dpalacios/local-server/server && python3 - <<'EOF'
# Mint a real token for a throwaway account, then prove the proxy
# forwards Authorization end-to-end.
import os, subprocess, json
os.environ.setdefault("FLASK_SECRET_KEY", "x")
import app
TCID = "test_whse_token_e2e01"
app._whse_delete_api_token(TCID)
meta = app._whse_generate_api_token(TCID)
tok = meta["token"]
open("/tmp/whse_tok.txt", "w").write(tok)
open("/tmp/whse_sample.csv", "w").write("name,email\nAda,ada@x.com\n")
print("token:", tok)
EOF
TOK=$(cat /tmp/whse_tok.txt)
echo "--- valid token (expect 202) ---"
curl -sS -o /tmp/r1.json -w "%{http_code}\n" -X POST \
  https://infallibly-nonbrutal-soila.ngrok-free.dev/api/warehouse/upload \
  -H "Authorization: Bearer $TOK" \
  -F "file=@/tmp/whse_sample.csv"
echo "--- bogus token (expect 401 invalid_token) ---"
curl -sS -o /tmp/r2.json -w "%{http_code}\n" -X POST \
  https://infallibly-nonbrutal-soila.ngrok-free.dev/api/warehouse/upload \
  -H "Authorization: Bearer wh_bogusbogusbogus" \
  -F "file=@/tmp/whse_sample.csv"
echo "--- no auth (expect 401 unauthenticated) ---"
curl -sS -o /tmp/r3.json -w "%{http_code}\n" -X POST \
  https://infallibly-nonbrutal-soila.ngrok-free.dev/api/warehouse/upload \
  -F "file=@/tmp/whse_sample.csv"
echo "--- token against a READ route (expect 401) ---"
curl -sS -o /tmp/r4.json -w "%{http_code}\n" \
  "https://infallibly-nonbrutal-soila.ngrok-free.dev/api/warehouse/documents" \
  -H "Authorization: Bearer $TOK"
cat /tmp/r1.json /tmp/r2.json
```

Expected:
- valid token → `202`, `/tmp/r1.json` is the new document JSON
- bogus token → `401`, body `{"error":"invalid_token"}`
- no auth → `401`, body `{"error":"unauthenticated"}`
- read route with token → `401` (the C proxy sends it as GET → session-gated → no session → unauthenticated; proves a token cannot read)

If the valid-token call returns `401`, the proxy is not forwarding `Authorization` — re-check Steps 2/6 and rebuild.

- [ ] **Step 10: Clean up the throwaway account**

```bash
cd /home/dpalacios/local-server/server && python3 - <<'EOF'
import os
os.environ.setdefault("FLASK_SECRET_KEY", "x")
import app
TCID = "test_whse_token_e2e01"
app._whse_delete_api_token(TCID)
# Remove any docs the smoke upload created under the test account.
try:
    for d in app._whse_all_docs(TCID):
        app.get_storage_client().bucket(app.BUCKET_NAME)
        idx = app._whse_load_index(TCID)
    cl = app.get_storage_client()
    for b in cl.list_blobs(app.BUCKET_NAME, prefix=app._whse_base(TCID)):
        b.delete()
except Exception as e:
    print("cleanup note:", e)
print("cleanup done")
EOF
```

- [ ] **Step 11: Commit**

```bash
cd /home/dpalacios/home-server
git add routes/local-server/POST/post_local_server.c
git -c user.name="dpalacios" -c user.email="palaciosdanieldario@gmail.com" \
  commit -m "feat: forward Authorization header through the :9030 proxy"
```

---

### Task 4: `#warehouse` API access panel

**Files:**
- Modify: `home-server/templates/AIdashboard/warehouse.html` — CSS block, `listView` HTML, the boot `<script>`

- [ ] **Step 1: Add panel CSS**

In `warehouse.html`, find the quota CSS line:

```css
  .quota-row { margin:18px 0 8px; font-size:13px; color:var(--sub); }
```

Insert immediately after it:

```css
  .api-access { margin:16px 0 4px; border:1px solid var(--border,#e5e7eb);
    border-radius:10px; padding:0 14px; }
  .api-access > summary { cursor:pointer; padding:12px 0; font-size:13.5px;
    font-weight:600; list-style:none; }
  .api-access > summary::-webkit-details-marker { display:none; }
  .api-access-body { padding:0 0 14px; }
  .api-access-intro { margin:0 0 12px; font-size:12.5px; color:var(--sub);
    line-height:1.5; }
  .api-token-row { display:flex; gap:8px; margin-bottom:8px; }
  .api-token-input { flex:1; font-family:monospace; font-size:12px;
    padding:8px 10px; border:1px solid var(--border,#e5e7eb);
    border-radius:8px; background:var(--bg,#fff); color:var(--fg,#111); }
  .api-token-meta { font-size:11.5px; color:var(--sub); margin-bottom:10px; }
  .api-token-actions { display:flex; gap:8px; margin-bottom:10px; }
  .api-token-curl { font-family:monospace; font-size:11.5px;
    background:var(--code-bg,#f4f4f5); border-radius:8px; padding:10px 12px;
    white-space:pre-wrap; word-break:break-all; margin:0; color:var(--fg,#111); }
```

- [ ] **Step 2: Add the panel HTML**

Find the add-sources block inside `listView`:

```html
    <div class="add-sources">
      <button type="button" class="btn" id="trainSiteBtn">🌐 Train a website</button>
      <button type="button" class="btn" id="driveBtn">📄 Import from Google Drive</button>
    </div>
```

Insert immediately after it:

```html
    <details class="api-access" id="apiAccessPanel">
      <summary>🔑 Programmatic API access</summary>
      <div class="api-access-body">
        <p class="api-access-intro">
          Generate a token to upload documents to this warehouse from a
          script or another app. The token works only for uploads — it
          cannot read, list, or delete anything.</p>
        <div id="apiTokenNone">
          <button type="button" class="btn btn-primary" id="apiTokenGen">
            Generate token</button>
        </div>
        <div id="apiTokenHave" style="display:none;">
          <div class="api-token-row">
            <input type="text" id="apiTokenValue" class="api-token-input" readonly>
            <button type="button" class="btn" id="apiTokenCopy">Copy</button>
          </div>
          <div class="api-token-meta" id="apiTokenMeta"></div>
          <div class="api-token-actions">
            <button type="button" class="btn" id="apiTokenRegen">Regenerate</button>
            <button type="button" class="btn btn-danger" id="apiTokenRevoke">Revoke</button>
          </div>
          <pre class="api-token-curl" id="apiTokenCurl"></pre>
        </div>
      </div>
    </details>
```

- [ ] **Step 3: Add the panel JS**

In `warehouse.html`, find the boot tail of the main `<script>`:

```javascript
  // ─── Wire toolbar ───
  $("searchInput").addEventListener("input", renderList);
  $("formatFilter").addEventListener("change", renderList);
  $("sortSel").addEventListener("change", renderList);

  loadAgents();
  loadList();
})();
```

Replace with:

```javascript
  // ─── Wire toolbar ───
  $("searchInput").addEventListener("input", renderList);
  $("formatFilter").addEventListener("change", renderList);
  $("sortSel").addEventListener("change", renderList);

  // ─── API access panel ───
  function fmtTokenDate(iso) {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleDateString(); }
    catch (e) { return iso; }
  }
  function renderApiToken(d) {
    var have = !!(d && d.token);
    $("apiTokenNone").style.display = have ? "none" : "";
    $("apiTokenHave").style.display = have ? "" : "none";
    if (!have) return;
    $("apiTokenValue").value = d.token;
    $("apiTokenMeta").textContent =
      "Created " + fmtTokenDate(d.created_at) + " · " +
      (d.last_used_at ? "last used " + fmtTokenDate(d.last_used_at)
                      : "never used");
    $("apiTokenCurl").textContent =
      "curl -X POST https://" + location.host + "/api/warehouse/upload \\\n" +
      "  -H \"Authorization: Bearer " + d.token + "\" \\\n" +
      "  -F \"file=@data.csv\"";
  }
  function loadApiToken() {
    fetch("/api/warehouse/api-token", { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d) renderApiToken(d); })
      .catch(function () {});
  }
  function postApiToken(op, okMsg) {
    fetch("/api/warehouse/api-token", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: op }),
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) { toast("Couldn't update token."); return; }
        renderApiToken(op === "revoke" ? { token: null } : d);
        toast(okMsg);
      })
      .catch(function () { toast("Network error."); });
  }
  $("apiTokenGen").addEventListener("click", function () {
    postApiToken("generate", "Token generated.");
  });
  $("apiTokenRegen").addEventListener("click", function () {
    if (!confirm("Regenerate the token? The current token stops " +
                 "working immediately.")) return;
    postApiToken("generate", "Token regenerated.");
  });
  $("apiTokenRevoke").addEventListener("click", function () {
    if (!confirm("Revoke the token? Programmatic uploads will stop " +
                 "working until you generate a new one.")) return;
    postApiToken("revoke", "Token revoked.");
  });
  $("apiTokenCopy").addEventListener("click", function () {
    var inp = $("apiTokenValue");
    inp.select();
    try { navigator.clipboard.writeText(inp.value); }
    catch (e) { try { document.execCommand("copy"); } catch (e2) {} }
    toast("Token copied.");
  });

  loadAgents();
  loadList();
  loadApiToken();
})();
```

- [ ] **Step 4: Manual UI smoke test**

`warehouse.html` is a Jinja template served directly — no build step. Hard-refresh `https://<ngrok-host>/dashboard#warehouse` in a logged-in browser and verify, in order:
1. The "🔑 Programmatic API access" panel appears below the Train/Import row.
2. Expand it → "Generate token" button shows.
3. Click Generate → token field fills, meta line shows "Created … · never used", `curl` example shows the real token + host.
4. Click Copy → toast "Token copied", clipboard holds the token.
5. Click Regenerate → confirm → token value changes.
6. Reload the page, expand the panel → the same (regenerated) token is still shown (proves `GET` persistence).
7. Click Revoke → confirm → panel returns to the "Generate token" state.

If you cannot drive a browser, state that explicitly rather than marking this step passed.

- [ ] **Step 5: Commit**

```bash
cd /home/dpalacios/home-server
git add templates/AIdashboard/warehouse.html
git -c user.name="dpalacios" -c user.email="palaciosdanieldario@gmail.com" \
  commit -m "feat: warehouse #warehouse API access token panel"
```

---

### Task 5: Full end-to-end verification + cleanup

**Files:**
- Delete: `local-server/server/_smoke_whse_token.py` (temporary test artifact)

- [ ] **Step 1: Confirm services are healthy**

Run: `ss -tlnp 2>/dev/null | grep -E ":5000|:9030|:9000" | wc -l`
Expected: `3`.

- [ ] **Step 2: Full lifecycle through the real stack**

In a logged-in browser at `#warehouse`: Generate a token, copy it. From a terminal, run an upload with that token through the public host (the Task 3 Step 9 `curl` form). Expect `202` and the document appearing in the warehouse list on browser reload. Then Regenerate in the browser and re-run the same `curl` with the OLD token → expect `401 invalid_token`; re-run with the NEW token → expect `202`. This proves regenerate revokes instantly end-to-end.

- [ ] **Step 3: Delete the temporary smoke script**

```bash
rm -f /home/dpalacios/local-server/server/_smoke_whse_token.py /tmp/whse_tok.txt /tmp/whse_sample.csv /tmp/r1.json /tmp/r2.json /tmp/r3.json /tmp/r4.json
echo "cleaned"
```

- [ ] **Step 4: Final commit**

```bash
cd /home/dpalacios/home-server
git -c user.name="dpalacios" -c user.email="palaciosdanieldario@gmail.com" \
  commit --allow-empty -m "chore: warehouse API token feature complete"
```

---

## Self-Review

**Spec coverage:**
- Token scope = warehouse write only → Task 2 swaps auth on exactly upload/replace/reprocess; Task 1 Step 5 leaves all other routes session-gated. ✓
- One token per account → `_whse_api_token_account_path` is one blob per account; generate overwrites. ✓
- `Authorization: Bearer` delivery + proxy change → Task 3. ✓
- Plaintext / always-viewable storage → token stored verbatim in both blobs; `GET` returns it; panel re-displays on every load (Task 4 Step 4.6). ✓
- Created on demand → no blob until `POST op=generate`; panel shows Generate button first. ✓
- Per-token reverse-index lookup → `_whse_api_token_index_path` + `_whse_resolve_account`. ✓
- Storage layout (two blobs), auth flow, request path, management endpoints, UI panel, error handling (`401 unauthenticated` / `401 invalid_token`), all 7 spec smoke tests → covered across Tasks 1, 3, 5. ✓
- Spec said `DELETE` for revoke → deliberately changed to `POST {op:"revoke"}`; reason documented in "Deviation from spec" and the spec file is updated to match.

**Placeholder scan:** No TBD/TODO. Every code step shows full code; every command shows expected output.

**Type/name consistency:** `_whse_api_token_account_path`, `_whse_api_token_index_path`, `_whse_load_api_token`, `_whse_generate_api_token`, `_whse_delete_api_token`, `_whse_resolve_account`, `_WHSE_API_TOKEN_PREFIX` — used identically in every task. Endpoint `/api/warehouse/api-token`, ops `generate`/`revoke`, JS ids `apiTokenGen`/`apiTokenRegen`/`apiTokenRevoke`/`apiTokenCopy`/`apiTokenValue`/`apiTokenMeta`/`apiTokenCurl`/`apiTokenNone`/`apiTokenHave` — consistent between HTML (Task 4 Step 2) and JS (Task 4 Step 3). ✓
