// SQL Workspace — direct, no-LLM querying of warehouse tables.
// Phase 1: the shell — entry, two-pane layout, Builder/SQL-editor mode
// toggle, and a warehouse tree where only structured files are
// clickable. Builder, editor, Run, and the side drawers are wired in
// later phases.
import React, { useState, useEffect } from "react";
import "./sqlworkspace.css";
import Builder from "./Builder.jsx";

// Formats the warehouse registers as queryable Spark tables.
const STRUCTURED = new Set([
  "csv", "tsv", "json", "ndjson", "jsonl", "xlsx", "xls",
]);

function isQueryable(doc) {
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

function TreeNode({ node, depth, activeId, onPick }) {
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
            />
          ))}
          {files.map((f) => {
            const q = isQueryable(f);
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
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [activeFile, setActiveFile] = useState(null);
  const [builderSql, setBuilderSql] = useState("");

  useEffect(() => {
    fetch("/api/warehouse/documents", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setDocs((d && d.documents) || []))
      .catch(() => setDocs([]));
  }, []);

  const goBack = () => { window.location.hash = "#warehouse"; };
  const tree = docs ? buildTree(docs) : null;

  return (
    <div className="sqlw">
      <div className="sqlw-top">
        <button className="sqlw-btn" onClick={goBack}>← Back</button>
        <span className="sqlw-title">SQL workspace</span>
        <div className="sqlw-modes">
          <button
            className={"sqlw-mode" + (mode === "builder" ? " active" : "")}
            onClick={() => setMode("builder")}
          >Builder</button>
          <button
            className={"sqlw-mode" + (mode === "editor" ? " active" : "")}
            onClick={() => setMode("editor")}
          >SQL editor</button>
        </div>
        <div className="sqlw-top-spacer" />
        <button className="sqlw-icon" title="Saved queries" disabled>💾</button>
        <button className="sqlw-icon" title="History" disabled>🕑</button>
        <button className="sqlw-icon" title="Templates" disabled>📑</button>
        <button className="sqlw-icon" title="Scheduled queries" disabled>
          ⏰
        </button>
        <button className="sqlw-run" disabled title="Coming in a later phase">
          ▶ Run
        </button>
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
                onPick={setActiveFile}
              />
            )}
          </aside>
        )}

        <main className="sqlw-main">
          {mode === "builder" ? (
            activeFile ? (
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
            )
          ) : (
            <div className="sqlw-empty">
              <div className="sqlw-empty-icon">⌨️</div>
              <div className="sqlw-empty-h">SQL editor</div>
              <div className="sqlw-empty-sub">
                Write Spark SQL directly. The editor loads here.
              </div>
            </div>
          )}
        </main>
      </div>

      <div className="sqlw-results" />
    </div>
  );
}
