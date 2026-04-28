/* SQL activity UI — sidebar list, editor workspace, execution, results.
 *
 * Mirrors the structure of notebook.js: a single IIFE that owns its own
 * state (`SQL.*`), wires up DOM listeners, and exposes a small public
 * surface on `window.SqlUI` so home-ui.js can call into it for mode
 * transitions (`view-sql`, `new-sql`).
 *
 * Persistence goes through window.SqlPersistence. Spark execution goes
 * through POST /etl/sql/execute (forwarded by the home-server to local-
 * server; see SERVER_TODO.md #1).
 *
 * Style: vanilla JS to match dataflow.js / pipeline.js / notebook.js.
 */
(function () {
  "use strict";

  if (!window.SqlPersistence) {
    /* sql_persistence.js failed to load. Don't disable the whole UI for
     * that — leave just enough state for click handlers to fail loudly
     * with a clear message instead of silently doing nothing. */
    console.error("[sql_ui] sql_persistence.js did not load — saves/loads will fail");
    window.SqlPersistence = {
      listSqlScripts: function () { return Promise.resolve([]); },
      loadSqlScript:  function () { return Promise.resolve(null); },
      saveSqlScript:  function () { return Promise.reject(new Error("sql_persistence.js missing")); },
      deleteSqlScript: function () { return Promise.reject(new Error("sql_persistence.js missing")); },
      newDoc: function (defaults) {
        return Object.assign({
          sql_id: "sql_" + Date.now().toString(16),
          name: "Untitled SQL", description: "", query: "",
          google_id: "unknown",
          created_at: Math.floor(Date.now() / 1000),
          updated_at: Math.floor(Date.now() / 1000),
          last_result_metadata: null,
        }, defaults || {});
      },
    };
  }

  // ---- Module state -------------------------------------------------------

  var SQL = {
    list: [],                   // [{sql_id, name, description, updated_at}]
    current: null,              // { sql_id, name, query, ... } (null when no doc open)
    dirty: false,
    cm: null,                   // CodeMirror instance, or null while textarea-only
    runningQueryId: null,
    lastResult: null,           // raw response payload (for export)
    tablesCache: null,          // last /etl/sql/tables payload
  };

  // ---- Tiny DOM helpers (match notebook.js's `el`) ------------------------

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "class") node.className = attrs[k];
      else if (k === "html") node.innerHTML = attrs[k];
      else if (k === "text") node.textContent = attrs[k];
      else if (k === "onclick") node.addEventListener("click", attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function fmtRelTime(secs) {
    if (!secs) return "";
    var diff = Math.max(0, Math.floor(Date.now() / 1000) - secs);
    if (diff < 60)   return diff + "s ago";
    if (diff < 3600) return Math.floor(diff / 60) + "m ago";
    if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
    return Math.floor(diff / 86400) + "d ago";
  }

  function setStatus(state, label) {
    var pill = document.getElementById("sql_status_pill");
    if (!pill) return;
    pill.dataset.state = state || "idle";
    var labelEl = pill.querySelector(".sql-status-label");
    if (labelEl) labelEl.textContent = label || "Ready";
  }

  function showToast(message) {
    // Reuse the simplest possible affordance: existing pages use alert()
    // for similar surface decisions (see dataflow run failure path).
    // A non-blocking toast would be nicer; leaving as a follow-up.
    alert(message);
  }

  // ---- Sidebar list -------------------------------------------------------

  var SQL_ICON_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M5 5h14v3H5z M5 11h14v3H5z M5 17h14v3H5z" fill="currentColor"/></svg>';

  function refreshList() {
    return SqlPersistence.listSqlScripts().then(function (items) {
      SQL.list = Array.isArray(items) ? items.slice() : [];
      renderList();
      var countEl = document.getElementById("sqlCount");
      if (countEl) countEl.textContent = String(SQL.list.length);
      return SQL.list;
    }).catch(function (err) {
      console.error("[sql_ui] refreshList failed", err);
      return [];
    });
  }

  function renderList() {
    var root = document.getElementById("sqlList");
    if (!root) return;
    root.innerHTML = "";
    SQL.list.forEach(function (item) {
      var isCurrent = SQL.current && SQL.current.sql_id === item.sql_id;
      var row = el("div", {
        class: "ds-sidebar-list-row" + (isCurrent ? " is-active" : ""),
        "data-sql-id": item.sql_id,
        role: "button",
        tabindex: "0",
        onclick: function () { openSql(item.sql_id); },
        onkeydown: function (ev) {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            openSql(item.sql_id);
          }
        },
      });
      row.appendChild(el("span", { class: "icon", "aria-hidden": "true", html: SQL_ICON_SVG }));
      row.appendChild(el("span", { class: "label", text: item.name || item.sql_id }));

      // X delete button — same shape, classes, and SVG as the notebook
      // sidebar so the visual is identical.
      var delBtn = el("button", {
        class: "btn btn-ghost btn-icon",
        type: "button",
        "aria-label": "Delete SQL script",
        title: "Delete",
        html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
        onclick: function (ev) {
          ev.stopPropagation();
          deleteSql(item);
        },
      });
      row.appendChild(delBtn);
      root.appendChild(row);
    });
    if (!SQL.list.length) {
      root.appendChild(el("div", { class: "ds-sidebar-empty", text: "No saved SQL scripts." }));
    }
  }

  function deleteSql(item) {
    if (!item || !item.sql_id) return;
    if (!confirm("Delete '" + (item.name || item.sql_id) + "'? This cannot be undone.")) return;
    SqlPersistence.deleteSqlScript(item.sql_id).then(function () {
      if (SQL.current && SQL.current.sql_id === item.sql_id) {
        closeSqlView();
      }
      return refreshList();
    }).catch(function (err) {
      // Fallback persistence has no delete — surface the message and
      // remove the row optimistically. Re-list on next load brings it
      // back if the file is still on disk.
      showToast(String(err && err.message || err));
      SQL.list = SQL.list.filter(function (it) { return it.sql_id !== item.sql_id; });
      renderList();
    });
  }

  // ---- View transitions ---------------------------------------------------

  function showSqlView() {
    document.body.classList.remove("home-mode", "notebook-mode");
    document.body.classList.add("sql-mode");
    var ws = document.getElementById("sql_workspace");
    if (ws) ws.hidden = false;
    var results = document.getElementById("sql_results_panel");
    if (results) results.hidden = false;
    // Ensure CodeMirror has been instantiated now that the textarea is
    // visible (CodeMirror needs the parent to have layout).
    ensureEditor();
    setTimeout(function () { if (SQL.cm) SQL.cm.refresh(); }, 0);
    // Load the files tree on first entry (and refresh on subsequent
    // entries — cheap because the backend caches against directory mtime).
    refreshTables(false);
  }

  function closeSqlView() {
    document.body.classList.remove("sql-mode");
    var ws = document.getElementById("sql_workspace");
    if (ws) ws.hidden = true;
    var results = document.getElementById("sql_results_panel");
    if (results) results.hidden = true;
    var tables = document.getElementById("sql_tables_panel");
    if (tables) tables.hidden = true;
    SQL.current = null;
    SQL.dirty = false;
  }

  function newSql() {
    SQL.current = SqlPersistence.newDoc();
    SQL.dirty = false;
    SQL.lastResult = null;
    showSqlView();
    var input = document.getElementById("sql_name");
    if (input) input.value = SQL.current.name;
    setEditorValue(SQL.current.query || "");
    renderResultsIdle();
    renderList();
  }

  function openSql(sqlId) {
    return SqlPersistence.loadSqlScript(sqlId).then(function (doc) {
      if (!doc) {
        showToast("Could not load SQL script.");
        return;
      }
      SQL.current = doc;
      SQL.dirty = false;
      SQL.lastResult = null;
      showSqlView();
      var input = document.getElementById("sql_name");
      if (input) input.value = doc.name || "";
      setEditorValue(doc.query || "");
      renderResultsIdle();
      renderList();
    });
  }

  function saveCurrent(asNew) {
    if (!SQL.current) return Promise.resolve();
    if (asNew) {
      var copy = Object.assign({}, SQL.current);
      delete copy.sql_id;
      delete copy.created_at;
      copy.name = (copy.name || "Untitled SQL") + " (copy)";
      copy.query = getEditorValue();
      SQL.current = SqlPersistence.newDoc(copy);
    } else {
      SQL.current.name = (document.getElementById("sql_name") || {}).value || SQL.current.name;
      SQL.current.query = getEditorValue();
    }
    return SqlPersistence.saveSqlScript(SQL.current).then(function (saved) {
      SQL.current = saved;
      SQL.dirty = false;
      var input = document.getElementById("sql_name");
      if (input) input.value = saved.name;
      return refreshList();
    }).catch(function (err) {
      showToast("Save failed: " + (err && err.message || err));
    });
  }

  // ---- CodeMirror editor --------------------------------------------------

  function ensureEditor() {
    if (SQL.cm) return SQL.cm;
    var textarea = document.getElementById("sql_editor");
    if (!textarea) return null;
    // Defer if CodeMirror script hasn't finished loading yet.
    if (typeof CodeMirror === "undefined") return null;

    SQL.cm = CodeMirror.fromTextArea(textarea, {
      mode: "text/x-sql",
      lineNumbers: true,
      lineWrapping: false,
      tabSize: 2,
      indentWithTabs: false,
      foldGutter: true,
      gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
      extraKeys: {
        "Ctrl-Enter": runQuery,
        "Cmd-Enter":  runQuery,
        "Ctrl-S":     function () { saveCurrent(false); },
        "Cmd-S":      function () { saveCurrent(false); },
        "Ctrl-Space": triggerAutocomplete,
        "Cmd-Space":  triggerAutocomplete,
      },
    });
    SQL.cm.on("change", function () { SQL.dirty = true; });
    return SQL.cm;
  }

  function getEditorValue() {
    if (SQL.cm) return SQL.cm.getValue();
    var ta = document.getElementById("sql_editor");
    return ta ? ta.value : "";
  }

  function setEditorValue(v) {
    if (SQL.cm) {
      SQL.cm.setValue(v || "");
      SQL.cm.clearHistory();
      return;
    }
    var ta = document.getElementById("sql_editor");
    if (ta) ta.value = v || "";
  }

  // ---- Autocomplete (Slice 6 polish) -------------------------------------

  var SQL_KEYWORDS = [
    "SELECT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "HAVING", "LIMIT",
    "JOIN", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "FULL OUTER JOIN", "ON",
    "AS", "AND", "OR", "NOT", "IN", "IS NULL", "IS NOT NULL", "DISTINCT",
    "WITH", "UNION", "UNION ALL", "INTERSECT", "EXCEPT",
    "CASE", "WHEN", "THEN", "ELSE", "END",
    "OVER", "PARTITION BY", "WINDOW",
    "EXPLAIN", "SHOW TABLES", "DESCRIBE",
    // Spark scalar/aggregate fns commonly used.
    "COUNT(", "SUM(", "AVG(", "MIN(", "MAX(", "COALESCE(", "CAST(",
    "DATE_TRUNC(", "TO_DATE(", "TO_TIMESTAMP(", "FROM_UNIXTIME(",
    "ROW_NUMBER()", "RANK()", "DENSE_RANK()",
    "EXPLODE(", "ARRAY(", "MAP(", "STRUCT(",
  ];

  function triggerAutocomplete(cm) {
    if (!cm) return;
    var hint = function () {
      var cur = cm.getCursor();
      var line = cm.getLine(cur.line) || "";
      var prefixMatch = line.slice(0, cur.ch).match(/[A-Za-z_][A-Za-z0-9_]*$/);
      var prefix = prefixMatch ? prefixMatch[0] : "";
      var prefixUpper = prefix.toUpperCase();

      var tableNames = (SQL.tablesCache && Array.isArray(SQL.tablesCache.tables))
        ? SQL.tablesCache.tables.map(function (t) { return t.table; })
        : [];
      var pool = SQL_KEYWORDS.concat(tableNames);
      var matches = pool.filter(function (w) {
        return !prefix || w.toUpperCase().indexOf(prefixUpper) === 0;
      }).slice(0, 50);

      return {
        list: matches,
        from: CodeMirror.Pos(cur.line, cur.ch - prefix.length),
        to: CodeMirror.Pos(cur.line, cur.ch),
      };
    };
    if (cm.showHint) cm.showHint({ hint: hint, completeSingle: false });
  }

  // ---- Execution ---------------------------------------------------------

  /* Split the editor contents into individual statements separated by
   * semicolons OR blank lines. Strings + comments are stripped to the
   * same length so byte positions stay aligned with the original query;
   * that lets us use the original (un-stripped) text for each piece. */
  function splitStatements(query) {
    if (!query || !query.trim()) return [];
    var stripped = query
      .replace(/\/\*[\s\S]*?\*\//g, function (m) { return new Array(m.length + 1).join(" "); })
      .replace(/--[^\n]*/g,         function (m) { return new Array(m.length + 1).join(" "); })
      .replace(/'(?:''|[^'])*'/g,   function (m) { return new Array(m.length + 1).join(" "); })
      .replace(/"(?:""|[^"])*"/g,   function (m) { return new Array(m.length + 1).join(" "); });

    var splits = [];
    for (var i = 0; i < stripped.length; i++) {
      if (stripped[i] === ";") splits.push({ idx: i, len: 1 });
    }
    var blankRe = /\n[ \t]*\n/g;
    var m;
    while ((m = blankRe.exec(stripped)) !== null) {
      splits.push({ idx: m.index, len: m[0].length });
    }
    splits.sort(function (a, b) { return a.idx - b.idx; });

    var pieces = [];
    var start = 0;
    splits.forEach(function (s) {
      var piece = query.slice(start, s.idx).trim();
      if (piece) pieces.push(piece);
      start = s.idx + s.len;
    });
    var tail = query.slice(start).trim();
    if (tail) pieces.push(tail);
    return pieces;
  }

  function runQuery() {
    if (!SQL.current) {
      showToast("Open or create a SQL script first.");
      return;
    }
    var raw = getEditorValue();
    var stmts = splitStatements(raw);
    if (!stmts.length) {
      showToast("Empty query.");
      return;
    }

    var runId = "sqlrun_" + Date.now().toString(16) + Math.random().toString(16).slice(2, 8);
    SQL.runningQueryId = runId;

    var runBtn    = document.getElementById("sql_run");
    var cancelBtn = document.getElementById("sql_cancel");
    if (runBtn)    runBtn.disabled = true;
    if (cancelBtn) cancelBtn.hidden = false;

    var mount = document.getElementById("sql_results_mount");
    if (mount) mount.innerHTML = "";
    if (SQL.cm && SQL._errorMarker) { SQL._errorMarker.clear(); SQL._errorMarker = null; }
    SQL.lastResult = null;

    var totalRows = 0;
    var totalMs   = 0;
    var firstError = null;

    setStatus("running", stmts.length === 1 ? "Running…" : "Running 1 of " + stmts.length + "…");

    function runOne(i) {
      if (SQL.runningQueryId !== runId) return Promise.resolve(); // cancelled
      if (i >= stmts.length) return Promise.resolve();
      setStatus("running",
        stmts.length === 1 ? "Running…" : "Running " + (i + 1) + " of " + stmts.length + "…");
      var stmt = stmts[i];
      var subId = runId + "_" + i;
      return fetch("/etl/sql/execute", {
        method: "POST",
        headers: new Headers({ "Content-Type": "application/json", "Accept": "application/json" }),
        body: JSON.stringify({ query: stmt, query_id: subId, limit: 1000, timeout: 60 }),
      }).then(function (r) {
        return r.json().catch(function () { return { status: "error", error_kind: "network", message: "Empty response" }; });
      }).catch(function (err) {
        return { status: "error", error_kind: "network", message: String(err && err.message || err) };
      }).then(function (body) {
        if (SQL.runningQueryId !== runId) return;
        if (mount) mount.appendChild(renderResultCard(stmt, body, i));
        if (body && body.status === "ok") {
          totalRows += body.row_count || 0;
          totalMs   += body.elapsed_ms || 0;
        } else if (!firstError) {
          firstError = body;
        }
        return runOne(i + 1);
      });
    }

    runOne(0).then(function () {
      if (SQL.runningQueryId !== runId) return;
      SQL.runningQueryId = null;
      if (runBtn)    runBtn.disabled = false;
      if (cancelBtn) cancelBtn.hidden = true;

      // Summary: one query → keep it terse; many → roll up.
      if (firstError && stmts.length === 1) {
        setStatus("error", firstError.error_kind || "error");
        // Single-statement parse-position highlight (preserves prior UX).
        if (SQL.cm && typeof firstError.line === "number") {
          try {
            var l = Math.max(0, firstError.line - 1);
            var c = Math.max(0, (firstError.column || 1) - 1);
            SQL._errorMarker = SQL.cm.markText(
              { line: l, ch: Math.max(0, c - 1) },
              { line: l, ch: c + 1 },
              { className: "sql-editor-error" });
          } catch (_) { /* ignore */ }
        }
      } else {
        setStatus(firstError ? "error" : "ok",
          stmts.length + " quer" + (stmts.length === 1 ? "y" : "ies") +
          " · " + totalRows + " rows · " + totalMs + " ms" +
          (firstError ? " (with errors)" : ""));
      }

      if (SQL.current && !firstError) {
        SQL.current.last_result_metadata = {
          row_count: totalRows,
          elapsed_ms: totalMs,
          ran_at: Math.floor(Date.now() / 1000),
        };
      }
    });
  }

  function cancelRunningQuery() {
    var qid = SQL.runningQueryId;
    if (!qid) return;
    SQL.runningQueryId = null;
    // The backend keys its job groups by the per-statement subId; cancel
    // doesn't know which sub is currently in-flight, so we just stop
    // queuing more and let Spark finish whatever's running. Best-effort
    // server-side hint:
    fetch("/etl/sql/cancel", {
      method: "POST",
      headers: new Headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ query_id: qid }),
    }).catch(function () { /* best-effort */ });
    var runBtn    = document.getElementById("sql_run");
    var cancelBtn = document.getElementById("sql_cancel");
    if (runBtn)    runBtn.disabled = false;
    if (cancelBtn) cancelBtn.hidden = true;
    setStatus("idle", "Cancelled");
  }

  // ---- Results rendering -------------------------------------------------

  function clearMount() {
    var mount = document.getElementById("sql_results_mount");
    if (mount) mount.innerHTML = "";
  }

  function renderResultsIdle() {
    var status = document.getElementById("sql_results_status");
    if (status) status.innerHTML = '<span class="pill">Ready</span>';
    clearMount();
  }

  /* Render one result card given its source statement and the response
   * body from /etl/sql/execute. Stacks below previous cards in
   * #sql_results_mount; the user can run several statements in one go
   * (separated by ; or blank lines) and see every result independently. */
  function renderResultCard(stmt, body, index) {
    var card = el("div", { class: "sql-result-card", "data-stmt-index": String(index) });

    var header = el("div", { class: "sql-result-card-header" });
    var stmtEl = el("pre", {
      class: "sql-result-card-stmt",
      title: "Click to expand / collapse",
      text: stmt,
    });
    stmtEl.addEventListener("click", function () {
      stmtEl.classList.toggle("is-expanded");
    });
    header.appendChild(stmtEl);

    var meta = el("span", { class: "sql-result-card-meta" });
    var actions = el("span", { class: "sql-result-card-actions" });

    if (body && body.status === "ok") {
      var pill = el("span", {
        class: "pill pill-ok",
        text: (body.row_count || 0) + " rows · " + (body.elapsed_ms || 0) + " ms",
      });
      meta.appendChild(pill);
      if (body.truncated) {
        meta.appendChild(el("span", {
          class: "sql-trunc-note",
          text: "(server-limited)",
        }));
      }
      var hasRows = !!(body.rows && body.rows.length);
      if (hasRows) {
        var csvBtn = el("button", { class: "buttons", type: "button", text: "CSV" });
        csvBtn.addEventListener("click", function () { downloadResultCsv(stmt, body, index); });
        var jsonBtn = el("button", { class: "buttons", type: "button", text: "JSON" });
        jsonBtn.addEventListener("click", function () { downloadResultJson(stmt, body, index); });
        actions.appendChild(csvBtn);
        actions.appendChild(jsonBtn);
      }
    } else {
      var kind = (body && body.error_kind) || "error";
      meta.appendChild(el("span", { class: "pill pill-error", text: kind }));
    }
    header.appendChild(meta);
    header.appendChild(actions);
    card.appendChild(header);

    if (body && body.status === "ok") {
      var bodyWrap = el("div", { class: "sql-result-card-body" });
      var dfValue = {
        columns: (body.columns || []).map(function (c) { return c.name; }),
        rows: (body.rows || []).map(function (r) { return r.slice(); }),
        total_rows: typeof body.row_count === "number" ? body.row_count : (body.rows || []).length,
        truncated: !!body.truncated,
        chartable: true,
      };
      if (window.NB && typeof window.NB.renderDataFrame === "function") {
        bodyWrap.appendChild(window.NB.renderDataFrame(dfValue, false));
      } else {
        var pre = el("pre", { text: JSON.stringify(dfValue, null, 2) });
        pre.style.fontSize = "12px";
        bodyWrap.appendChild(pre);
      }
      card.appendChild(bodyWrap);
    } else {
      card.appendChild(el("div", {
        class: "sql-result-card-error",
        text: (body && body.message) || "Unknown error",
      }));
    }
    return card;
  }

  function downloadResultCsv(stmt, body, index) {
    var cols = (body.columns || []).map(function (c) { return c.name; });
    var lines = [cols.map(csvEscape).join(",")];
    (body.rows || []).forEach(function (row) {
      lines.push(row.map(function (v) {
        if (v === null || v === undefined) return "";
        if (typeof v === "object") return csvEscape(JSON.stringify(v));
        return csvEscape(String(v));
      }).join(","));
    });
    download(filenameFor(stmt, index, "csv"), lines.join("\n"), "text/csv");
  }

  function downloadResultJson(stmt, body, index) {
    var cols = (body.columns || []).map(function (c) { return c.name; });
    var rows = (body.rows || []).map(function (row) {
      var o = {};
      cols.forEach(function (c, i) { o[c] = row[i]; });
      return o;
    });
    download(filenameFor(stmt, index, "json"), JSON.stringify(rows, null, 2), "application/json");
  }

  function filenameFor(stmt, index, ext) {
    var base = (SQL.current && SQL.current.name) || "results";
    var suffix = (typeof index === "number" && index >= 0) ? ("_" + (index + 1)) : "";
    return base + suffix + "." + ext;
  }

  // ---- Files panel (left side of the SQL workspace) -----------------------
  //
  // Pulls the path → table-name mapping from /etl/sql/tables and renders it
  // as a directory tree grouped by source (raw/processed). Clicking a leaf
  // node populates the editor with `SELECT * FROM <table> LIMIT 100;` and
  // auto-runs the query.

  function refreshTables(force) {
    var tree = document.getElementById("sql_files_tree");
    if (tree) tree.setAttribute("aria-busy", "true");
    return fetch("/etl/sql/tables" + (force ? "?refresh=true" : ""), {
      method: "GET",
      headers: new Headers({ "Accept": "application/json" }),
    }).then(function (r) { return r.ok ? r.json() : { tables: [] }; })
      .then(function (body) {
        SQL.tablesCache = body;
        renderFilesTree((body && body.tables) || [], readFileFilter());
      })
      .catch(function (err) {
        console.error("[sql_ui] refreshTables failed", err);
        renderFilesTree([], "");
      })
      .then(function () {
        if (tree) tree.removeAttribute("aria-busy");
      });
  }

  function readFileFilter() {
    var input = document.getElementById("sql_files_search");
    return input ? input.value : "";
  }

  function buildSectionTree(items) {
    /* Returns { raw: <node>, processed: <node> } where <node> is a
     * recursive structure { dirs: { name: <node> }, files: [{...}] }. */
    var sections = { raw: { dirs: {}, files: [] }, processed: { dirs: {}, files: [] } };
    items.forEach(function (it) {
      var bucket = sections[it.source];
      if (!bucket) {
        bucket = sections[it.source] = { dirs: {}, files: [] };
      }
      var parts = (it.path || "").split(/[\\/]/).filter(Boolean);
      if (!parts.length) return;
      var leaf = parts.pop();
      var node = bucket;
      parts.forEach(function (segment) {
        if (!node.dirs[segment]) {
          node.dirs[segment] = { dirs: {}, files: [] };
        }
        node = node.dirs[segment];
      });
      node.files.push({ filename: leaf, table: it.table, source: it.source, format: it.format, error: it.error, path: it.path });
    });
    return sections;
  }

  function nodeMatchesFilter(node, filterLower) {
    if (!filterLower) return true;
    if (node.files.some(function (f) {
      return (f.filename || "").toLowerCase().indexOf(filterLower) !== -1
          || (f.table || "").toLowerCase().indexOf(filterLower) !== -1
          || (f.path || "").toLowerCase().indexOf(filterLower) !== -1;
    })) return true;
    return Object.keys(node.dirs).some(function (k) {
      return k.toLowerCase().indexOf(filterLower) !== -1
          || nodeMatchesFilter(node.dirs[k], filterLower);
    });
  }

  function renderTreeNode(node, filterLower, expandAll) {
    /* Recursively render one node's children: directories first, then files. */
    var frag = document.createDocumentFragment();
    Object.keys(node.dirs).sort().forEach(function (dirName) {
      var child = node.dirs[dirName];
      if (filterLower && !(dirName.toLowerCase().indexOf(filterLower) !== -1 || nodeMatchesFilter(child, filterLower))) return;
      var expanded = expandAll || !!filterLower;
      var dirRow = el("div", {
        class: "sql-tree-dir",
        role: "button",
        "aria-expanded": expanded ? "true" : "false",
        title: dirName,
      });
      dirRow.appendChild(el("span", { class: "sql-tree-chevron" }));
      dirRow.appendChild(el("span", { class: "sql-tree-icon", text: "📁" }));
      dirRow.appendChild(el("span", { class: "sql-tree-name", text: dirName }));
      var children = el("div", { class: "sql-tree-children" });
      children.appendChild(renderTreeNode(child, filterLower, expandAll));
      dirRow.addEventListener("click", function () {
        var nowExpanded = dirRow.getAttribute("aria-expanded") === "true";
        dirRow.setAttribute("aria-expanded", nowExpanded ? "false" : "true");
      });
      frag.appendChild(dirRow);
      frag.appendChild(children);
    });
    node.files.slice().sort(function (a, b) {
      return a.filename.localeCompare(b.filename);
    }).forEach(function (f) {
      if (filterLower
          && (f.filename || "").toLowerCase().indexOf(filterLower) === -1
          && (f.table || "").toLowerCase().indexOf(filterLower) === -1
          && (f.path || "").toLowerCase().indexOf(filterLower) === -1) {
        return;
      }
      var fileRow = el("div", {
        class: "sql-tree-file" + (f.error ? " has-error" : ""),
        title: f.error ? f.error : (f.path + " → " + f.table),
        "data-table": f.table,
      });
      fileRow.appendChild(el("span", { class: "sql-tree-icon", text: f.format === "csv" ? "📊" : "{ }" }));
      fileRow.appendChild(el("span", { class: "sql-tree-name", text: f.filename }));
      fileRow.appendChild(el("span", { class: "sql-tree-tablename", text: f.table }));
      fileRow.addEventListener("click", function () {
        if (f.error) {
          showToast("This file failed to register: " + f.error);
          return;
        }
        runQueryForTable(f.table);
      });
      frag.appendChild(fileRow);
    });
    return frag;
  }

  function renderFilesTree(items, filterText) {
    var root = document.getElementById("sql_files_tree");
    if (!root) return;
    root.innerHTML = "";
    var filterLower = (filterText || "").trim().toLowerCase();
    if (!items.length) {
      root.appendChild(el("div", { class: "sql-files-empty", text: "No data files in raw/ or processed/." }));
      return;
    }
    var sections = buildSectionTree(items);
    /* Render in a stable order: raw first (it's where ingest dumps live),
     * processed second. Other sources (if a future change adds them) go
     * after, alphabetically. */
    var order = ["raw", "processed"].concat(
      Object.keys(sections).filter(function (k) { return k !== "raw" && k !== "processed"; }).sort()
    );
    var rendered = 0;
    order.forEach(function (key) {
      var node = sections[key];
      if (!node) return;
      if (filterLower && !nodeMatchesFilter(node, filterLower)) return;
      var section = el("div", { class: "sql-tree-section" });
      section.appendChild(el("div", { class: "sql-tree-section-header", text: key }));
      section.appendChild(renderTreeNode(node, filterLower, false));
      root.appendChild(section);
      rendered++;
    });
    if (!rendered) {
      root.appendChild(el("div", { class: "sql-files-empty", text: "No matches." }));
    }
  }

  function runQueryForTable(table) {
    if (!SQL.current) {
      newSql();
    }
    /* Backtick-quote the identifier so names that happen to be reserved
     * words (e.g. "order") still resolve. */
    var sql = "SELECT * FROM `" + table + "` LIMIT 100";
    setEditorValue(sql);
    SQL.dirty = true;
    runQuery();
  }

  function toggleFilesPanel(forceCollapsed) {
    var panel = document.getElementById("sql_files_panel");
    var showBtn = document.getElementById("sql_files_show");
    if (!panel) return;
    var willCollapse = (forceCollapsed === true || forceCollapsed === false)
      ? forceCollapsed
      : !panel.classList.contains("is-collapsed");
    panel.classList.toggle("is-collapsed", willCollapse);
    if (showBtn) showBtn.hidden = !willCollapse;
  }

  // ---- Export helpers (used by per-card download buttons) ---------------

  function csvEscape(s) {
    if (s == null) return "";
    var str = String(s);
    if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
    return str;
  }

  function download(filename, body, mime) {
    var blob = new Blob([body], { type: mime || "text/plain" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  // ---- Format (light SQL pretty-print) ----------------------------------

  function formatQuery() {
    var src = getEditorValue();
    if (!src.trim()) return;
    // Conservative: just normalize whitespace + uppercase the obvious
    // keywords + put major clauses on their own line. Anything fancier
    // would need a proper parser.
    var KW = /\b(select|from|where|group by|order by|having|join|left join|right join|inner join|full outer join|on|union all|union|with|limit|and|or)\b/gi;
    var formatted = src.replace(/\s+/g, " ").trim();
    formatted = formatted.replace(KW, function (m) { return "\n" + m.toUpperCase(); }).trim();
    setEditorValue(formatted);
    SQL.dirty = true;
  }

  // ---- Wire up ----------------------------------------------------------

  function wire() {
    console.log("[sql_ui] wiring listeners");
    var btn = document.getElementById("newSqlButton");
    if (!btn) console.warn("[sql_ui] #newSqlButton not found in DOM");
    if (btn) btn.addEventListener("click", function (ev) {
      console.log("[sql_ui] + New clicked");
      ev.preventDefault();
      ev.stopPropagation();
      newSql();
    });

    var run = document.getElementById("sql_run");
    if (run) run.addEventListener("click", runQuery);

    var cancelBtn = document.getElementById("sql_cancel");
    if (cancelBtn) cancelBtn.addEventListener("click", cancelRunningQuery);

    var save = document.getElementById("sql_save");
    if (save) save.addEventListener("click", function () { saveCurrent(false); });

    var saveAs = document.getElementById("sql_save_as");
    if (saveAs) saveAs.addEventListener("click", function () { saveCurrent(true); });

    var fmt = document.getElementById("sql_format");
    if (fmt) fmt.addEventListener("click", formatQuery);

    var clr = document.getElementById("sql_clear");
    if (clr) clr.addEventListener("click", function () {
      setEditorValue("");
      renderResultsIdle();
      SQL.dirty = true;
    });

    var filesToggle = document.getElementById("sql_files_toggle");
    if (filesToggle) filesToggle.addEventListener("click", function () { toggleFilesPanel(true); });
    var filesShow = document.getElementById("sql_files_show");
    if (filesShow) filesShow.addEventListener("click", function () { toggleFilesPanel(false); });
    var filesRefresh = document.getElementById("sql_files_refresh");
    if (filesRefresh) filesRefresh.addEventListener("click", function () { refreshTables(true); });
    var filesSearch = document.getElementById("sql_files_search");
    if (filesSearch) filesSearch.addEventListener("input", function () {
      var items = (SQL.tablesCache && SQL.tablesCache.tables) || [];
      renderFilesTree(items, filesSearch.value);
    });

    var nameInput = document.getElementById("sql_name");
    if (nameInput) nameInput.addEventListener("input", function () {
      if (SQL.current) {
        SQL.current.name = nameInput.value;
        SQL.dirty = true;
      }
    });

    refreshList();
    console.log("[sql_ui] wired");
  }

  function safeWire() {
    try { wire(); }
    catch (err) { console.error("[sql_ui] wire() threw:", err); }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", safeWire);
  } else {
    safeWire();
  }

  // ---- Public surface --------------------------------------------------

  window.SqlUI = {
    newSql: newSql,
    openSql: openSql,
    closeSqlView: closeSqlView,
    refreshList: refreshList,
    refreshTables: refreshTables,
  };
})();
