// SQL Workspace — one query result, rendered as a stacked block.
// Carries its own viz switcher, a CSV download, and a Pin button.
// A failed statement renders as a red error block.
import React, { useState } from "react";
import DataViz, { VIZ_TYPES, VIZ_ICON, LAYOUTS } from "./DataViz.jsx";

function csvDownload(result) {
  const cols = result.columns || [];
  const esc = (v) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [cols.join(",")];
  (result.rows || []).forEach(
    (r) => lines.push(cols.map((c) => esc(r[c])).join(",")));
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "query-result-" + Date.now() + ".csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function initialViz(result) {
  const rows = result.rows || [];
  const cols = result.columns || [];
  if (rows.length === 1 && cols.length === 1) return "kpi";
  return "table";
}

export default function ResultBlock({ result, index, onPin }) {
  const [viz, setViz] = useState(() => initialViz(result));
  const [layout, setLayout] = useState("grouped");

  if (result.error) {
    return (
      <div className="sqlw-rb sqlw-rb-err">
        <div className="sqlw-rb-head">
          <span className="sqlw-rb-idx">{index + 1}</span>
          <span className="sqlw-rb-erricon">⚠</span>
          <span>Query failed</span>
          <span className="sqlw-rb-sql">{result.sql}</span>
        </div>
        <div className="sqlw-rb-errmsg">{result.error}</div>
      </div>
    );
  }

  const rc = result.row_count != null
    ? result.row_count : (result.rows || []).length;
  return (
    <div className="sqlw-rb">
      <div className="sqlw-rb-head">
        <span className="sqlw-rb-idx">{index + 1}</span>
        <span className="sqlw-rb-rows">{rc} row{rc === 1 ? "" : "s"}</span>
        <span className="sqlw-rb-sql">{result.sql}</span>
        {result.duration_ms != null && (
          <span className="sqlw-rb-dur">{result.duration_ms}ms</span>
        )}
        <div className="sqlw-viz-switch">
          {VIZ_TYPES.map((v) => (
            <button
              key={v}
              className={"sqlw-viz-btn" + (viz === v ? " active" : "")}
              onClick={() => setViz(v)}
              title={v}
            >{VIZ_ICON[v]}</button>
          ))}
        </div>
        {LAYOUTS[viz] && (
          <select
            className="sqlw-b-layout"
            value={layout}
            onChange={(e) => setLayout(e.target.value)}
            title="How series sit together"
          >
            {LAYOUTS[viz].map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        )}
        <button className="sqlw-sm-btn" onClick={() => csvDownload(result)}>
          CSV
        </button>
        <button className="sqlw-sm-btn" onClick={() => onPin(result)}>
          Pin
        </button>
      </div>
      <div className="sqlw-rb-body">
        <DataViz vizType={viz} layout={layout}
          columns={result.columns} rows={result.rows} />
      </div>
    </div>
  );
}
