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
  };

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
    } else {
      var pre = document.createElement("pre");
      pre.style.fontSize = "11px";
      pre.textContent = JSON.stringify(body, null, 2);
      mount.appendChild(pre);
    }
  }

  /* -------- Refresh (stubbed in this slice) -------------------------- */

  function refreshPreview(force) {
    var s = getActiveState();
    if (!s) return;
    if (!s.value || !s.value.zone || !s.value.path) {
      s.status = "no-path"; render(); return;
    }
    /* TODO(slice 4): real fetch to /etl/preview. For now, this stub
     * exists so the state machine + button wiring can be inspected on
     * the canvas without a backend round-trip. */
    s.status = "loading";
    render();
  }

  function cancelInFlight() {
    var s = getActiveState();
    if (!s) return;
    /* TODO(slice 4): real cancel via AbortController + /etl/preview/cancel. */
    if (s.status === "loading") {
      s.status = "ready";
      render();
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
    /* Hide the panel when a non-blob_storage activity is selected. */
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
            BS.activeId = null;
            hide();
          }
        }, 0);
      });
    }
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
