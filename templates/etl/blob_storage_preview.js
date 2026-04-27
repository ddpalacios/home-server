/* blob_storage_preview.js — Data Preview tab controller for the
 * BlobStorage activity. State machine + DOM rendering only in this
 * slice; the actual /etl/preview fetch lands in Slice 4 and the polish
 * bits (debounce, tab-away cancel, expand modal) land in Slice 5.
 *
 * State machine per active activityId:
 *   no-path  → trigger needs a Settings selection
 *   ready    → path picked, never loaded → "Click Refresh"
 *   loading  → fetch in flight (skeleton shown)
 *   loaded   → table mounted (summary + truncation banner)
 *   error    → inline message + Try Again
 */
(function () {
  "use strict";

  var BS = {
    /* activityId → { value, status, body, lastError, loadedAt,
       requestId, abortCtrl } */
    states: Object.create(null),
    activeId: null,
    /* Slice 5 polish: monotonic clock for the 500ms refresh debounce. */
    _lastRefreshAt: 0,
  };

  var REFRESH_DEBOUNCE_MS = 500;

  function getActiveState() {
    return BS.activeId ? (BS.states[BS.activeId] || null) : null;
  }

  function ensureState(activityId, value) {
    var s = BS.states[activityId];
    if (!s) {
      s = BS.states[activityId] = {
        value: value || null,
        status: value ? "ready" : "no-path",
        body: null,
        lastError: null,
        loadedAt: null,
        requestId: null,
        abortCtrl: null,
      };
    }
    return s;
  }

  /* -------- DOM helpers ---------------------------------------------- */

  function $(id) { return document.getElementById(id); }
  function setHidden(el, hidden) {
    if (!el) return;
    if (hidden) el.setAttribute("hidden", ""); else el.removeAttribute("hidden");
  }
  function fmtRelative(secs) {
    if (!secs) return "";
    var diff = Math.max(0, Math.floor(Date.now() / 1000) - secs);
    if (diff < 60)   return diff + "s ago";
    if (diff < 3600) return Math.floor(diff / 60) + "m ago";
    if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
    return Math.floor(diff / 86400) + "d ago";
  }
  function fmtBreadcrumb(zone, path) {
    if (!zone) return "No file selected";
    var parts = (path || "").split("/").filter(Boolean);
    return [zone].concat(parts).join(" / ");
  }

  /* -------- Show / hide / render ------------------------------------- */

  function show() {
    var panel = $("blob_storage_preview_panel");
    var actPrev = $("activity_previews");
    if (!panel) return;
    setHidden(panel, false);
    if (actPrev) actPrev.style.display = "none";
    render();
  }

  function hide() {
    var panel = $("blob_storage_preview_panel");
    var actPrev = $("activity_previews");
    if (panel) setHidden(panel, true);
    if (actPrev) actPrev.style.display = "";
  }

  function render() {
    var s = getActiveState();
    var path = $("bs_preview_path");
    var summary = $("bs_preview_summary");
    var status = $("bs_preview_status");
    var error = $("bs_preview_error");
    var skel = $("bs_preview_skeleton");
    var trunc = $("bs_preview_truncation");
    var mount = $("bs_preview_mount");
    var refresh = $("bs_preview_refresh");
    var cancel = $("bs_preview_cancel");
    var toSettings = $("bs_preview_to_settings");
    var loaded = $("bs_preview_loaded");

    if (!s) {
      if (path) path.textContent = "No file selected";
      [summary, error, status, loaded].forEach(function (n) { if (n) n.textContent = ""; });
      setHidden(skel, true); setHidden(trunc, true); setHidden(error, true);
      if (mount) mount.innerHTML = "";
      setHidden(toSettings, false);
      if (refresh) refresh.disabled = true;
      if (cancel) setHidden(cancel, true);
      return;
    }

    if (path) path.textContent = fmtBreadcrumb(s.value && s.value.zone, s.value && s.value.path);

    /* Reset transient surfaces; each branch below re-shows what it needs. */
    setHidden(error, true);
    setHidden(skel, true);
    setHidden(trunc, true);
    if (cancel) setHidden(cancel, true);

    if (s.status === "no-path") {
      setHidden(toSettings, false);
      if (refresh) refresh.disabled = true;
      if (status) status.textContent = "Select a file in the Settings tab to preview its data.";
      if (summary) summary.textContent = "";
      if (mount) mount.innerHTML = "";
      if (loaded) loaded.textContent = "";
      return;
    }

    setHidden(toSettings, true);

    if (s.status === "ready") {
      if (refresh) refresh.disabled = false;
      if (status) status.textContent = "Click Refresh to load preview.";
      if (summary) summary.textContent = "";
      if (mount) mount.innerHTML = "";
      if (loaded) loaded.textContent = "";
      return;
    }

    if (s.status === "loading") {
      if (refresh) refresh.disabled = true;
      if (status) status.textContent = "Reading "
        + fmtBreadcrumb(s.value.zone, s.value.path)
        + "… (Spark cold-start can take 5–15s)";
      setHidden(skel, false);
      if (cancel) setHidden(cancel, false);
      if (summary) summary.textContent = "";
      if (mount) mount.innerHTML = "";
      if (loaded) loaded.textContent = "";
      return;
    }

    if (s.status === "error") {
      if (refresh) refresh.disabled = false;
      if (status) status.textContent = "";
      var msg = (s.lastError && s.lastError.message) || "Unknown error";
      var kind = (s.lastError && s.lastError.kind) || "error";
      if (error) {
        error.innerHTML = "";
        var label = document.createElement("strong");
        label.textContent = friendlyErrorLabel(kind, s.value) + " ";
        error.appendChild(label);
        error.appendChild(document.createTextNode(msg));
        error.appendChild(document.createElement("br"));
        var retry = document.createElement("button");
        retry.type = "button";
        retry.className = "buttons";
        retry.textContent = "Try Again";
        retry.addEventListener("click", function () { refreshPreview(true); });
        error.appendChild(retry);
        setHidden(error, false);
      }
      if (summary) summary.textContent = "";
      if (mount) mount.innerHTML = "";
      if (loaded) loaded.textContent = "";
      return;
    }

    if (s.status === "loaded") {
      if (refresh) refresh.disabled = false;
      if (status) status.textContent = "";
      var b = s.body || { columns: [], rows: [], total_rows: 0, format: "" };
      if (summary) {
        summary.textContent = "Rows: " + (b.rows || []).length + " of " + (b.total_rows || 0)
          + "  |  Columns: " + (b.columns || []).length
          + "  |  Format: " + (b.format || "");
      }
      if (loaded) loaded.textContent = s.loadedAt ? "Last loaded: " + fmtRelative(s.loadedAt) : "";
      if (b.truncated) {
        if (trunc) {
          trunc.textContent = "Showing first " + b.rows.length + " of " + b.total_rows
            + " rows. Use a SQL Activity to query the full dataset.";
          setHidden(trunc, false);
        }
      }
      mountTable(mount, b);
      return;
    }
  }

  function friendlyErrorLabel(kind, value) {
    switch (kind) {
      case "not_found":
        return "This file no longer exists at "
          + (value ? (value.zone + "/" + value.path) : "the selected path") + ".";
      case "parse_error":
        return "Could not parse this file as "
          + (value && value.path && value.path.toLowerCase().endsWith(".csv") ? "CSV" : "JSON") + ":";
      case "schema_inference":
        return "Spark couldn't infer a schema. The file may be empty or have inconsistent records.";
      case "empty_file":
        return "This file is empty (0 bytes).";
      case "timeout":
        return "Preview timed out:";
      case "cancelled":
        return "Preview cancelled.";
      case "forbidden":
        return "Invalid path:";
      default:
        return "Failed to read file:";
    }
  }

  function mountTable(mount, body) {
    if (!mount) return;
    mount.innerHTML = "";
    if (!body || !body.columns) return;
    if (!body.rows || !body.rows.length) {
      var empty = document.createElement("div");
      empty.className = "bs-preview-empty";
      empty.textContent = "File parsed but contains 0 rows.";
      mount.appendChild(empty);
      return;
    }
    if (window.NB && typeof window.NB.renderDataFrame === "function") {
      var dfValue = {
        columns: body.columns.map(function (c) { return c.name + " (" + (c.dtype || "?") + ")"; }),
        rows: body.rows.map(function (r) { return r.slice(); }),
        total_rows: body.total_rows,
        truncated: !!body.truncated,
        chartable: true,
      };
      mount.appendChild(window.NB.renderDataFrame(dfValue, false));
      /* Polish: scan rendered cells for stringified arrays/objects and
       * make them click-to-expand into a modal. NB.renderDataFrame
       * stringifies these inline; we offer the full structured view
       * without modifying the shared component. */
      enhanceNestedCells(mount);
    } else {
      var pre = document.createElement("pre");
      pre.style.fontSize = "11px";
      pre.textContent = JSON.stringify(body, null, 2);
      mount.appendChild(pre);
    }
  }

  /* -------- Nested-cell click-to-expand modal (Slice 5) ------------- */

  function enhanceNestedCells(mount) {
    if (!mount) return;
    var cells = mount.querySelectorAll("td");
    Array.prototype.forEach.call(cells, function (td) {
      var t = (td.textContent || "").trim();
      if (!t) return;
      if ((t[0] === "{" && t[t.length - 1] === "}")
       || (t[0] === "[" && t[t.length - 1] === "]")) {
        td.classList.add("bs-cell-nested");
        td.title = "Click to expand";
        td.addEventListener("click", function (ev) {
          ev.stopPropagation();
          openExpandModal(t);
        });
      }
    });
  }

  function openExpandModal(text) {
    var overlay = document.createElement("div");
    overlay.className = "bs-modal-overlay";
    overlay.addEventListener("click", function () { closeExpandModal(overlay); });
    var dialog = document.createElement("div");
    dialog.className = "bs-modal-dialog";
    dialog.addEventListener("click", function (ev) { ev.stopPropagation(); });
    var pre = document.createElement("pre");
    pre.className = "bs-modal-pre";
    try { pre.textContent = JSON.stringify(JSON.parse(text), null, 2); }
    catch (_) { pre.textContent = text; }
    var close = document.createElement("button");
    close.type = "button";
    close.className = "buttons";
    close.textContent = "Close";
    close.addEventListener("click", function () { closeExpandModal(overlay); });
    dialog.appendChild(pre);
    dialog.appendChild(close);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    var onKey = function (ev) {
      if (ev.key === "Escape") { closeExpandModal(overlay); }
    };
    overlay._onKey = onKey;
    document.addEventListener("keydown", onKey);
  }

  function closeExpandModal(overlay) {
    if (!overlay) return;
    if (overlay._onKey) document.removeEventListener("keydown", overlay._onKey);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  /* -------- Refresh + cancel (live fetch) ---------------------------- */

  function refreshPreview(force) {
    var s = getActiveState();
    if (!s) return;
    if (!s.value || !s.value.zone || !s.value.path) {
      s.status = "no-path"; render(); return;
    }
    if (s.status === "loading") return;
    /* 500ms debounce on rapid clicks, except when a Try Again retry
     * comes in (force=true) — that flow should always go through. */
    if (!force) {
      var now = Date.now();
      if (now - BS._lastRefreshAt < REFRESH_DEBOUNCE_MS) return;
      BS._lastRefreshAt = now;
    }

    var requestId = "prev_" + Date.now().toString(16) + Math.random().toString(16).slice(2, 8);
    var abortCtrl = ("AbortController" in window) ? new AbortController() : null;
    s.requestId = requestId;
    s.abortCtrl = abortCtrl;
    s.status = "loading";
    s.lastError = null;
    s.body = null;
    render();

    fetch("/etl/preview", {
      method: "POST",
      headers: new Headers({
        "Content-Type": "application/json",
        "Accept": "application/json",
      }),
      body: JSON.stringify({
        request_id: requestId,
        zone: s.value.zone,
        path: s.value.path,
        limit: 1000,
        /* The brief makes Refresh always mean "show me fresh". */
        no_cache: true,
      }),
      signal: abortCtrl ? abortCtrl.signal : undefined,
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; })
        .catch(function () { return { ok: r.ok, status: r.status, body: null }; });
    }).then(function (resp) {
      /* The user may have switched activities while we were in flight;
       * drop the response on the floor in that case so we don't paint
       * over the wrong state. */
      if (BS.states[BS.activeId] !== s || s.requestId !== requestId) return;
      if (resp.body && resp.body.status === "ok") {
        s.status = "loaded";
        s.body = resp.body;
        s.loadedAt = Math.floor(Date.now() / 1000);
        s.lastError = null;
      } else {
        s.status = "error";
        s.lastError = {
          kind: (resp.body && resp.body.error_kind) || "runtime",
          message: (resp.body && resp.body.message) || ("HTTP " + resp.status),
        };
      }
      s.requestId = null;
      s.abortCtrl = null;
      render();
    }).catch(function (err) {
      if (s.requestId !== requestId) return;
      if (err && err.name === "AbortError") {
        s.status = "error";
        s.lastError = { kind: "cancelled", message: "Preview cancelled." };
      } else {
        s.status = "error";
        s.lastError = { kind: "network", message: String(err && err.message || err) };
      }
      s.requestId = null;
      s.abortCtrl = null;
      render();
    });
  }

  function cancelInFlight() {
    var s = getActiveState();
    if (!s) return;
    var rid = s.requestId;
    if (s.abortCtrl) {
      try { s.abortCtrl.abort(); } catch (e) { /* */ }
    }
    if (rid) {
      /* Best-effort server-side cancellation. */
      fetch("/etl/preview/cancel", {
        method: "POST",
        headers: new Headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ request_id: rid }),
      }).catch(function () { /* */ });
    }
  }

  /* -------- Wiring --------------------------------------------------- */

  function readSavedFromActivity(activity) {
    var s = activity && (activity.settings
      || (activity.internal && activity.internal.properties && activity.internal.properties.settings));
    if (!s) return null;
    if (s.blob_storage && s.blob_storage.zone && s.blob_storage.path) {
      return { zone: s.blob_storage.zone, path: s.blob_storage.path };
    }
    if (s.import && (s.import.zone || s.import.source_root) && s.import.path) {
      return { zone: s.import.zone || s.import.source_root, path: s.import.path };
    }
    return null;
  }

  function onActivitySelected(detail) {
    BS.activeId = detail.activityId;
    var saved = readSavedFromActivity(detail.activity);
    var s = ensureState(BS.activeId, saved);
    s.value = saved;
    if (!saved) {
      s.status = "no-path";
    } else if (s.status === "loaded" && s.body
        && (s.body.zone !== saved.zone || s.body.path !== saved.path)) {
      s.status = "ready";
      s.body = null;
    } else if (s.status === "loading") {
      /* keep */
    } else if (!s.body) {
      s.status = "ready";
    }
    show();
  }

  function onPathChanged(detail) {
    var s = BS.states[detail.activityId];
    if (!s) return;
    s.value = detail.value || null;
    s.status = s.value ? "ready" : "no-path";
    s.body = null;
    s.lastError = null;
    s.loadedAt = null;
    if (BS.activeId === detail.activityId) render();
  }

  function bindOnce() {
    if (BS._bound) return;
    BS._bound = true;
    window.addEventListener("blob-storage:activity-selected", function (ev) {
      onActivitySelected(ev.detail || {});
    });
    window.addEventListener("blob-storage:path-changed", function (ev) {
      onPathChanged(ev.detail || {});
    });
    var refresh = $("bs_preview_refresh");
    if (refresh) refresh.addEventListener("click", function () { refreshPreview(false); });
    var cancel = $("bs_preview_cancel");
    if (cancel) cancel.addEventListener("click", cancelInFlight);
    var toSettings = $("bs_preview_to_settings");
    if (toSettings) toSettings.addEventListener("click", function () {
      var tabSettings = document.getElementById("tabSettings");
      if (tabSettings) tabSettings.click();
    });
    /* Hide the panel when a non-blob_storage activity is selected.
     * Also cancel any in-flight preview — the user is leaving this
     * tab/activity and a stale response would confuse the UI. */
    var canvas = document.getElementById("flowchartworkspace");
    if (canvas) {
      canvas.addEventListener("click", function () {
        setTimeout(function () {
          var sel = window.$flowchart && window.$flowchart.flowchart
            ? window.$flowchart.flowchart("getSelectedOperatorId") : null;
          if (sel == null) return;
          var act = window.$flowchart.flowchart("getOperatorActivity", sel);
          if (!act) return;
          if (act.activityType !== "blob_storage") {
            cancelInFlight();
            BS.activeId = null;
            hide();
          }
        }, 0);
      });
    }

    /* Tab navigation away: when the user switches to General /
     * Settings / Activities / Scheduled triggers, cancel any in-flight
     * preview. They can come back and click Refresh again. */
    var tabStrip = document.querySelector(".navbar.ds-bottom-tab-strip");
    if (tabStrip) {
      tabStrip.addEventListener("click", function (ev) {
        var btn = ev.target.closest(".tablinks");
        if (!btn) return;
        if (btn.id !== "tabDataPreview") {
          cancelInFlight();
        }
      });
    }

    /* Auto-tick the "Last loaded" relative timestamp every 30s while
     * the user is sitting on the tab. */
    setInterval(function () {
      var s = getActiveState();
      if (!s || s.status !== "loaded" || !s.loadedAt) return;
      var loaded = $("bs_preview_loaded");
      if (loaded) loaded.textContent = "Last loaded: " + fmtRelative(s.loadedAt);
    }, 30 * 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindOnce);
  } else {
    bindOnce();
  }

  window.BlobStoragePreview = {
    refresh: function () { refreshPreview(false); },
    cancel:  cancelInFlight,
    _state:  function () { return BS; },
  };
})();
