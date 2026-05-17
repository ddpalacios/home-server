// SQL Workspace — direct, no-LLM querying of warehouse tables.
// Phase 1: the shell — entry, two-pane layout, Builder/SQL-editor mode
// toggle, and a warehouse tree where only structured files are
// clickable. Builder, editor, Run, and the side drawers are wired in
// later phases.
import React, { useState, useEffect, useRef } from "react";
import { format as formatSql } from "sql-formatter";
import "./sqlworkspace.css";
import Builder from "./Builder.jsx";
import Editor from "./Editor.jsx";
import ResultBlock from "./ResultBlock.jsx";
import PinDialog from "./PinDialog.jsx";

// Formats the warehouse registers as queryable Spark tables.
const STRUCTURED = new Set([
  "csv", "tsv", "json", "ndjson", "jsonl", "xlsx", "xls",
]);

// A file is queryable when it is a registered Spark table (qset). The
// format heuristic is only a fallback for before the table list loads
// (or if that endpoint is unavailable).
function isQueryable(doc, qset) {
  if (qset) return qset.has(doc.document_id);
  return STRUCTURED.has((doc.format || "").toLowerCase())
    && (doc.status || "").toLowerCase() === "ready";
}

// Build a nested folder tree from the flat document list.
function buildTree(docs) {
  const root = { name: "", folders: {}, files: [] };
  docs.forEach((d) => {
    const fp = (d.folder_path || "").replace(/^\/+|\/+$/g, "");
    const parts = fp ? fp.split("/") : [];
    let node = root;
    parts.forEach((p) => {
      if (!node.folders[p]) {
        node.folders[p] = { name: p, folders: {}, files: [] };
      }
      node = node.folders[p];
    });
    node.files.push(d);
  });
  return root;
}

function TreeNode({ node, depth, activeId, onPick, qset }) {
  const [open, setOpen] = useState(depth < 2);
  const folderNames = Object.keys(node.folders).sort();
  const files = node.files.slice().sort(
    (a, b) => (a.name || "").localeCompare(b.name || ""));
  return (
    <div>
      {depth > 0 && (
        <div
          className="sqlw-tree-folder"
          style={{ paddingLeft: depth * 12 }}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="sqlw-tree-caret">{open ? "▾" : "▸"}</span>
          📁 {node.name}
        </div>
      )}
      {(open || depth === 0) && (
        <>
          {folderNames.map((fn) => (
            <TreeNode
              key={fn}
              node={node.folders[fn]}
              depth={depth + 1}
              activeId={activeId}
              onPick={onPick}
              qset={qset}
            />
          ))}
          {files.map((f) => {
            const q = isQueryable(f, qset);
            const cls = "sqlw-tree-file"
              + (q ? "" : " disabled")
              + (f.document_id === activeId ? " active" : "");
            return (
              <div
                key={f.document_id}
                className={cls}
                style={{ paddingLeft: (depth + 1) * 12 + 6 }}
                onClick={q ? () => onPick(f) : undefined}
                title={q ? "Click to query" : "Not queryable"}
              >
                📄 {f.name}
                {!q && <span className="sqlw-nq"> · not queryable</span>}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

export default function SqlWorkspace() {
  const [mode, setMode] = useState("builder");
  const [docs, setDocs] = useState(null);
  const [queryableIds, setQueryableIds] = useState(null);
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [activeFile, setActiveFile] = useState(null);
  const [activeFileInfo, setActiveFileInfo] = useState(null);
  const [builderSql, setBuilderSql] = useState("");
  const [editorSql, setEditorSql] = useState("");
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [pinTarget, setPinTarget] = useState(null);
  const editorApiRef = useRef(null);
  const modeRef = useRef("builder");
  modeRef.current = mode;

  useEffect(() => {
    fetch("/api/warehouse/documents", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setDocs((d && d.documents) || []))
      .catch(() => setDocs([]));
    fetch("/api/warehouse/sql-workspace/tables", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setQueryableIds(d ? new Set(d.queryable || []) : null))
      .catch(() => setQueryableIds(null));
  }, []);

  const goBack = () => { window.location.hash = "#warehouse"; };
  const tree = docs ? buildTree(docs) : null;

  // Pick a file from the tree. Always fetches the table info; in
  // editor mode it also appends a SELECT for that table.
  const pickFile = (doc) => {
    setActiveFile(doc);
    setActiveFileInfo(null);
    fetch("/api/warehouse/sql-workspace/sample?document_id="
          + encodeURIComponent(doc.document_id),
          { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || d.error) return;
        setActiveFileInfo({
          spark_table_name: d.spark_table_name, columns: d.columns,
        });
        if (modeRef.current === "editor" && editorApiRef.current) {
          editorApiRef.current.append(
            "SELECT * FROM " + d.spark_table_name + "\nLIMIT 100;\n\n");
        }
      })
      .catch(() => {});
  };

  // Mode toggle — Builder→Editor loads the generated SQL; Editor→
  // Builder warns if the editor text has diverged.
  const switchMode = (next) => {
    if (next === mode) return;
    if (next === "editor") {
      if (editorApiRef.current) {
        editorApiRef.current.setText(builderSql || "");
      }
      setMode("editor");
    } else {
      const txt = editorApiRef.current ? editorApiRef.current.getText() : "";
      if (txt.trim() && txt.trim() !== (builderSql || "").trim()) {
        if (!window.confirm(
          "Switching to Builder will discard your SQL edits. Continue?")) {
          return;
        }
      }
      setMode("builder");
    }
  };

  const fmtSql = () => {
    if (!editorApiRef.current) return;
    try {
      editorApiRef.current.setText(formatSql(editorApiRef.current.getText(), {
        language: "spark", keywordCase: "upper", linesBetweenQueries: 1,
      }));
    } catch (e) { /* leave text as-is on a parse error */ }
  };
  const copySql = () => {
    if (editorApiRef.current && navigator.clipboard) {
      navigator.clipboard.writeText(editorApiRef.current.getText())
        .catch(() => {});
    }
  };
  const exportSql = () => {
    const txt = editorApiRef.current ? editorApiRef.current.getText() : "";
    const blob = new Blob([txt], { type: "text/sql" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "workspace-query.sql";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Run the current SQL — builder-generated in builder mode, the
  // editor text in editor mode. Multi-statement results stack below.
  const runQuery = () => {
    if (running) return;
    const sqlText = modeRef.current === "editor"
      ? (editorApiRef.current ? editorApiRef.current.getText() : "")
      : builderSql;
    if (!sqlText || !sqlText.trim()
        || sqlText.trim().startsWith("--")) return;
    setRunning(true);
    setResults(null);
    fetch("/api/warehouse/sql-workspace/run", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: sqlText }),
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        setResults(ok && d.results
          ? d.results
          : [{ index: 0, sql: sqlText,
               error: (d && (d.detail || d.error)) || "Run failed." }]);
      })
      .catch(() => setResults(
        [{ index: 0, sql: sqlText, error: "Network error." }]))
      .finally(() => setRunning(false));
  };

  const stmtCount = editorSql.split(";").filter((s) => s.trim()).length;
  const hasDdl = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|MERGE)\b/i
    .test(editorSql);

  return (
    <div className="sqlw">
      <div className="sqlw-top">
        <button className="sqlw-btn" onClick={goBack}>← Back</button>
        <span className="sqlw-title">SQL workspace</span>
        <div className="sqlw-modes">
          <button
            className={"sqlw-mode" + (mode === "builder" ? " active" : "")}
            onClick={() => switchMode("builder")}
          >Builder</button>
          <button
            className={"sqlw-mode" + (mode === "editor" ? " active" : "")}
            onClick={() => switchMode("editor")}
          >SQL editor</button>
        </div>
        <div className="sqlw-top-spacer" />
        <button className="sqlw-icon" title="Saved queries" disabled>💾</button>
        <button className="sqlw-icon" title="History" disabled>🕑</button>
        <button className="sqlw-icon" title="Templates" disabled>📑</button>
        <button className="sqlw-icon" title="Scheduled queries" disabled>
          ⏰
        </button>
        <button
          className="sqlw-run"
          onClick={runQuery}
          disabled={running}
          title="Run the query (Cmd/Ctrl-Enter)"
        >{running ? "Running…" : "▶ Run"}</button>
      </div>

      <div className="sqlw-body">
        {treeCollapsed ? (
          <button
            className="sqlw-tree-expand"
            onClick={() => setTreeCollapsed(false)}
            title="Show warehouse tree"
          >»</button>
        ) : (
          <aside className="sqlw-tree">
            <div className="sqlw-tree-h">
              <span>Warehouse</span>
              <button
                className="sqlw-tree-collapse"
                onClick={() => setTreeCollapsed(true)}
                title="Collapse"
              >«</button>
            </div>
            {docs === null && (
              <div className="sqlw-tree-msg">Loading…</div>
            )}
            {docs && docs.length === 0 && (
              <div className="sqlw-tree-msg">
                No files in the warehouse yet.
              </div>
            )}
            {tree && (
              <TreeNode
                node={tree}
                depth={0}
                activeId={activeFile && activeFile.document_id}
                onPick={pickFile}
                qset={queryableIds}
              />
            )}
          </aside>
        )}

        <main className="sqlw-main">
          {/* Builder — kept mounted so its state survives a mode
              toggle; hidden (not unmounted) in editor mode. */}
          <div
            className="sqlw-pane"
            style={{ display: mode === "builder" ? "block" : "none" }}
          >
            {activeFile ? (
              <Builder
                key={activeFile.document_id}
                file={activeFile}
                onSqlChange={setBuilderSql}
              />
            ) : (
              <div className="sqlw-empty">
                <div className="sqlw-empty-icon">🗂</div>
                <div className="sqlw-empty-h">
                  Click a file in the warehouse to start
                </div>
                <div className="sqlw-empty-sub">
                  The table preview will appear here.
                </div>
              </div>
            )}
          </div>

          {/* SQL editor — always mounted. */}
          <div
            className="sqlw-editor-pane"
            style={{ display: mode === "editor" ? "flex" : "none" }}
          >
            <div className="sqlw-editor-bar">
              <button className="sqlw-sm-btn" onClick={fmtSql}>Format</button>
              <button className="sqlw-sm-btn" onClick={copySql}>Copy</button>
              <button className="sqlw-sm-btn" onClick={exportSql}>Export</button>
              <span className="sqlw-editor-status">
                Spark SQL · {stmtCount} statement{stmtCount === 1 ? "" : "s"}
                {hasDdl
                  ? " · ⚠ only SELECT is allowed"
                  : " · ✓ no blocked statements"}
              </span>
            </div>
            {activeFileInfo && activeFileInfo.columns
              && activeFileInfo.columns.length > 0 && (
              <div className="sqlw-col-chips">
                <span className="sqlw-col-chips-label">Insert column:</span>
                {activeFileInfo.columns.map((c) => (
                  <button
                    key={c}
                    className="sqlw-col-chip"
                    onClick={() => editorApiRef.current
                      && editorApiRef.current.insertAtCursor(c)}
                  >{c}</button>
                ))}
              </div>
            )}
            <Editor
              initialDoc=""
              onChange={setEditorSql}
              onRun={runQuery}
              apiRef={editorApiRef}
            />
          </div>
        </main>
      </div>

      {(running || results) && (
        <div className="sqlw-results">
          <div className="sqlw-results-h">
            {running ? "Running…"
              : "Results · " + (results ? results.length : 0)
                + " statement" + (results && results.length === 1 ? "" : "s")}
          </div>
          {results && results.map((r, i) => (
            <ResultBlock
              key={i}
              result={r}
              index={i}
              onPin={(res) => setPinTarget(res)}
            />
          ))}
        </div>
      )}

      {pinTarget && (
        <PinDialog
          result={pinTarget}
          onClose={() => setPinTarget(null)}
        />
      )}
    </div>
  );
}
