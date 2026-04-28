/* SQL-activity persistence layer.
 *
 * Primary path: /blob-storage/etl/sql/{save,load,list,delete}, modeled on
 * the existing pipeline + dataflow handlers in the C server.
 *
 * Fallback path: until those C handlers ship (see SERVER_TODO.md), we use
 * the generic /blob-storage/raw/etl/sql/<id>.json file CRUD already exposed
 * by the home-server, plus a directory listing for `list`. The fallback
 * does NOT support delete; until SERVER_TODO #2 lands, the UI will report
 * the failure and remove the row optimistically (re-list on next load
 * brings it back if the file is still on disk).
 *
 * Code style: vanilla JS, plain functions on `window`, matches
 * pipeline.js/dataflow.js convention. */

(function () {
  "use strict";

  var SQL_API_PRIMARY = {
    save: "/blob-storage/etl/sql/save",
    load: "/blob-storage/etl/sql/load",
    list: "/blob-storage/etl/sql/list",
    del:  "/blob-storage/etl/sql/delete",
  };
  var SQL_RAW_DIR = "/blob-storage/raw/etl/sql/";

  function safeGoogleId() {
    var raw = "unknown";
    if (window.googleLoginProfile && (window.googleLoginProfile.google_id || window.googleLoginProfile.email)) {
      raw = window.googleLoginProfile.google_id || window.googleLoginProfile.email;
    }
    return String(raw).toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "");
  }

  function uid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return "sql_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    }
    return "sql_" + Date.now().toString(16) + Math.random().toString(16).slice(2, 8);
  }

  /* The primary endpoints (SERVER_TODO.md #2) may or may not be deployed
   * — we cache the probe result for the page's lifetime so we don't pay
   * a round-trip per call. Cache an in-flight Promise too so concurrent
   * `listSqlScripts()` calls share a single probe instead of stampeding. */
  var _primaryAvailable = null;     // null = unknown, true/false = decided
  var _primaryProbeInFlight = null; // Promise<boolean> while probing

  function probePrimary() {
    if (_primaryAvailable !== null) return Promise.resolve(_primaryAvailable);
    if (_primaryProbeInFlight) return _primaryProbeInFlight;
    _primaryProbeInFlight = fetch(SQL_API_PRIMARY.list + "?googleId=" + encodeURIComponent(safeGoogleId()), {
      method: "GET",
      headers: new Headers({ "Accept": "application/json" }),
    }).then(function (r) {
      // 200 (with JSON `values`) means primary is live. Anything else =
      // fall back. We treat 4xx/5xx the same; the dedicated handler will
      // surface its own errors once it exists.
      if (!r.ok) { _primaryAvailable = false; return false; }
      return r.json().then(function (j) {
        _primaryAvailable = !!(j && Array.isArray(j.values));
        return _primaryAvailable;
      }).catch(function () { _primaryAvailable = false; return false; });
    }).catch(function () { _primaryAvailable = false; return false; })
      .then(function (result) {
        _primaryProbeInFlight = null;
        return result;
      });
    return _primaryProbeInFlight;
  }

  function listSqlScripts() {
    var googleId = safeGoogleId();
    return probePrimary().then(function (primary) {
      if (primary) {
        return fetch(SQL_API_PRIMARY.list + "?googleId=" + encodeURIComponent(googleId), {
          method: "GET",
          headers: new Headers({ "Accept": "application/json" }),
        }).then(function (r) { return r.ok ? r.json() : { values: [] }; })
         .then(function (j) { return Array.isArray(j.values) ? j.values : []; });
      }
      // Fallback: directory listing from the generic raw handler, then
      // hydrate each .json so we can filter by google_id and surface the
      // human-readable name. This is not free, but the SQL list is
      // expected to stay small (< 100 docs).
      return fetch(SQL_RAW_DIR, {
        method: "GET",
        headers: new Headers({ "Accept": "application/json" }),
      }).then(function (r) {
        if (!r.ok) return { entries: [] };
        return r.json();
      }).then(function (dir) {
        var entries = (dir && Array.isArray(dir.entries)) ? dir.entries : [];
        var jsons = entries.filter(function (e) {
          return e && e.type === "file" && /\.json$/i.test(e.name);
        });
        return Promise.all(jsons.map(function (e) {
          var sqlId = e.name.replace(/\.json$/i, "");
          return loadSqlScript(sqlId).then(function (doc) { return doc || null; })
                                     .catch(function () { return null; });
        })).then(function (docs) {
          return docs
            .filter(Boolean)
            .filter(function (d) { return !d.google_id || d.google_id === googleId; })
            .map(function (d) {
              // Mirror the primary list shape so callers don't branch.
              return {
                sql_id: d.sql_id,
                name: d.name || "Untitled SQL",
                description: d.description || "",
                updated_at: d.updated_at || 0,
              };
            })
            .sort(function (a, b) { return (b.updated_at || 0) - (a.updated_at || 0); });
        });
      });
    });
  }

  function loadSqlScript(sqlId) {
    if (!sqlId) return Promise.resolve(null);
    return probePrimary().then(function (primary) {
      var url = primary
        ? SQL_API_PRIMARY.load + "?sqlId=" + encodeURIComponent(sqlId)
        : SQL_RAW_DIR + encodeURIComponent(sqlId) + ".json";
      return fetch(url, {
        method: "GET",
        headers: new Headers({ "Accept": "application/json" }),
      }).then(function (r) {
        if (!r.ok) return null;
        return r.json();
      }).then(function (doc) {
        if (!doc) return null;
        // Normalize: guarantee sql_id even if the file was hand-edited.
        if (!doc.sql_id) doc.sql_id = sqlId;
        return doc;
      });
    });
  }

  function saveSqlScript(doc) {
    if (!doc) return Promise.reject(new Error("doc required"));
    if (!doc.sql_id) doc.sql_id = uid();
    if (!doc.created_at) doc.created_at = Math.floor(Date.now() / 1000);
    doc.updated_at = Math.floor(Date.now() / 1000);
    if (!doc.google_id) doc.google_id = safeGoogleId();
    return probePrimary().then(function (primary) {
      var url = primary
        ? SQL_API_PRIMARY.save + "?googleId=" + encodeURIComponent(doc.google_id) +
                                   "&sqlId=" + encodeURIComponent(doc.sql_id)
        : SQL_RAW_DIR + encodeURIComponent(doc.sql_id) + ".json";
      return fetch(url, {
        method: "POST",
        headers: new Headers({
          "Accept": "application/json",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(doc),
      }).then(function (r) {
        if (!r.ok) throw new Error("Save failed: " + r.status);
        return doc;
      });
    });
  }

  function deleteSqlScript(sqlId) {
    if (!sqlId) return Promise.reject(new Error("sql_id required"));
    /* Always hit the primary endpoint regardless of the cached probe
     * result. Reasons:
     *   1. The probe can be stale — if `list` was probed before the C
     *      handler was deployed, _primaryAvailable=false sticks for the
     *      tab's lifetime even after the server is restarted.
     *   2. The fallback for delete is a non-fix ("can't actually
     *      delete"), so an extra round-trip is cheap insurance.
     * If primary works we also flip the cache to true so subsequent
     * list/load calls take the fast path. */
    return fetch(SQL_API_PRIMARY.del + "?sqlId=" + encodeURIComponent(sqlId), {
      method: "POST",
      headers: new Headers({ "Accept": "application/json" }),
    }).then(function (r) {
      if (r.ok || r.status === 404) {
        // 404 = file already gone → idempotent success.
        _primaryAvailable = true;
        return true;
      }
      throw new Error("Delete failed: HTTP " + r.status);
    }).catch(function (err) {
      // Network error / empty response → primary is genuinely missing.
      // Surface the limitation; the UI will soft-delete locally.
      if (err && err.message && err.message.indexOf("Delete failed: HTTP") === 0) {
        throw err;
      }
      _primaryAvailable = false;
      throw new Error("Delete is not yet supported on this server. Restart the home-server (it has new SQL handlers) and hard-reload the browser, then try again.");
    });
  }

  console.log("[sql_persistence] loaded");
  window.SqlPersistence = {
    listSqlScripts: listSqlScripts,
    loadSqlScript: loadSqlScript,
    saveSqlScript: saveSqlScript,
    deleteSqlScript: deleteSqlScript,
    newDoc: function (defaults) {
      var now = Math.floor(Date.now() / 1000);
      return Object.assign({
        sql_id: uid(),
        name: "Untitled SQL",
        description: "",
        query: "",
        google_id: safeGoogleId(),
        created_at: now,
        updated_at: now,
        last_result_metadata: null,
      }, defaults || {});
    },
    /* Visible for tests + the polish slice's "available tables" panel. */
    _safeGoogleId: safeGoogleId,
  };
})();
