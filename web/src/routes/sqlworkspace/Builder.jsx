// SQL Workspace — visual builder. The clicked file's data IS the main
// body: a large table (or a chart, via the viz switcher). Columns are
// added through a searchable "+ Column" dropdown and removed with the
// × on each header. Filters and the generated SQL are tucked into
// collapsible strips so the data stays the focus.
import React, { useState, useEffect, useMemo } from "react";
import DataViz, { VIZ_ICON } from "./DataViz.jsx";

const OPS = [
  ["=", "equals"], ["!=", "not equal"], [">", "greater than"],
  ["<", "less than"], ["LIKE", "contains"],
  ["IS NULL", "is empty"], ["IS NOT NULL", "is not empty"],
];
const BUILDER_VIZ = ["table", "bar", "line", "pie", "area"];

function sqlEsc(v) { return String(v).replace(/'/g, "''"); }

function whereClause(f) {
  if (f.op === "IS NULL" || f.op === "IS NOT NULL") return `${f.col} ${f.op}`;
  if (f.op === "LIKE") return `${f.col} LIKE '%${sqlEsc(f.value)}%'`;
  const num = f.value !== ""
    && !isNaN(parseFloat(f.value)) && isFinite(f.value);
  return `${f.col} ${f.op} ${num ? f.value : "'" + sqlEsc(f.value) + "'"}`;
}

export function generateSQL(sample, selected, filters, limit) {
  if (!sample) return "-- Click a file to begin";
  if (!selected.length) return "-- No columns selected";
  let sql = `SELECT ${selected.join(", ")}\nFROM ${sample.spark_table_name}`;
  const active = filters.filter((f) => f.col && (
    f.op === "IS NULL" || f.op === "IS NOT NULL"
    || String(f.value).length > 0));
  if (active.length) {
    sql += "\nWHERE " + active.map(whereClause).join("\n  AND ");
  }
  if (limit) sql += `\nLIMIT ${limit}`;
  return sql + ";";
}

function rowMatches(row, filters) {
  for (const f of filters) {
    if (!f.col) continue;
    const val = row[f.col];
    if (f.op === "IS NULL") {
      if (val != null && val !== "") return false;
      continue;
    }
    if (f.op === "IS NOT NULL") {
      if (val == null || val === "") return false;
      continue;
    }
    if (f.value === "" || f.value == null) continue;
    const s = String(val);
    const fv = String(f.value);
    if (f.op === "=" && s !== fv) return false;
    if (f.op === "!=" && s === fv) return false;
    if (f.op === ">" && !(parseFloat(val) > parseFloat(f.value))) return false;
    if (f.op === "<" && !(parseFloat(val) < parseFloat(f.value))) return false;
    if (f.op === "LIKE"
        && !s.toLowerCase().includes(fv.toLowerCase())) return false;
  }
  return true;
}

export default function Builder({ file, onSqlChange }) {
  const [sample, setSample] = useState(null);
  const [selected, setSelected] = useState([]);
  const [filters, setFilters] = useState([]);
  const [limit, setLimit] = useState(100);
  const [viz, setViz] = useState("table");
  const [showSql, setShowSql] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState("");

  useEffect(() => {
    setSample(null);
    fetch("/api/warehouse/sql-workspace/sample?document_id="
          + encodeURIComponent(file.document_id),
          { credentials: "same-origin" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (ok) {
          setSample(d);
          setSelected((d.columns || []).slice());
        } else {
          setSample({ error: d.message || d.error || "Could not load file." });
        }
      })
      .catch(() => setSample({ error: "Network error." }));
  }, [file.document_id]);

  const sql = useMemo(
    () => generateSQL(sample && !sample.error ? sample : null,
                      selected, filters, limit),
    [sample, selected, filters, limit]);
  useEffect(() => { if (onSqlChange) onSqlChange(sql); }, [sql, onSqlChange]);

  if (!sample) {
    return (
      <div className="sqlw-empty">
        <div className="sqlw-empty-sub">Loading table preview…</div>
      </div>
    );
  }
  if (sample.error) {
    return (
      <div className="sqlw-empty">
        <div className="sqlw-empty-icon">⚠️</div>
        <div className="sqlw-empty-h">{sample.error}</div>
      </div>
    );
  }

  const allCols = sample.columns || [];
  const rows = sample.rows || [];
  const unselected = allCols.filter((c) => !selected.includes(c));
  const searchHits = unselected.filter(
    (c) => c.toLowerCase().includes(addSearch.toLowerCase()));
  const matchingRows = rows.filter((r) => rowMatches(r, filters));
  const activeFilterCount = filters.filter((f) => f.col).length;

  const removeCol = (c) => setSelected((s) => s.filter((x) => x !== c));
  const addCol = (c) => {
    setSelected((s) => (s.includes(c) ? s : [...s, c]));
    setAddSearch("");
  };
  const addFilter = (col) => {
    setFilters((f) => [...f, { col: col || allCols[0], op: "=", value: "" }]);
    setShowFilters(true);
  };
  const updFilter = (i, patch) => setFilters(
    (f) => f.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const rmFilter = (i) => setFilters((f) => f.filter((_, j) => j !== i));
  const reset = () => {
    setSelected(allCols.slice()); setFilters([]); setLimit(100);
    setViz("table");
  };

  return (
    <div className="sqlw-builder">
      {/* Compact header + toolbar */}
      <div className="sqlw-b-head">
        <div className="sqlw-b-title">{file.name}</div>
        <div className="sqlw-b-meta">
          {sample.total_rows} rows · {sample.spark_table_name}
        </div>
        <button className="sqlw-sm-btn sqlw-b-reset" onClick={reset}>
          Reset
        </button>
      </div>
      <div className="sqlw-b-toolbar">
        <div className="sqlw-viz-switch">
          {BUILDER_VIZ.map((v) => (
            <button
              key={v}
              className={"sqlw-viz-btn" + (viz === v ? " active" : "")}
              onClick={() => setViz(v)}
              title={v}
            >{VIZ_ICON[v]}</button>
          ))}
        </div>
        <div className="sqlw-add-wrap">
          <button
            className="sqlw-sm-btn"
            onClick={() => setAddOpen((o) => !o)}
          >+ Column</button>
          {addOpen && (
            <>
              <div className="sqlw-add-backdrop"
                onClick={() => setAddOpen(false)} />
              <div className="sqlw-add-pop">
                <input
                  className="sqlw-add-search"
                  autoFocus
                  placeholder="Search columns…"
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                />
                <div className="sqlw-add-list">
                  {searchHits.length === 0 && (
                    <div className="sqlw-add-empty">
                      {unselected.length === 0
                        ? "All columns added."
                        : "No match."}
                    </div>
                  )}
                  {searchHits.map((c) => (
                    <button key={c} className="sqlw-add-item"
                      onClick={() => addCol(c)}>
                      <span>{c}</span>
                      <span className="sqlw-add-type">
                        {(sample.column_types[c] || "").toUpperCase()}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        <button
          className={"sqlw-sm-btn" + (showFilters ? " on" : "")}
          onClick={() => setShowFilters((s) => !s)}
        >
          Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
        </button>
        <button
          className={"sqlw-sm-btn" + (showSql ? " on" : "")}
          onClick={() => setShowSql((s) => !s)}
        >&lt;/&gt; SQL</button>
        <div className="sqlw-b-spacer" />
        <label className="sqlw-b-limit">
          Limit
          <input type="number" min="1" max="1000" value={limit}
            onChange={(e) => setLimit(Math.max(1, Math.min(1000,
              parseInt(e.target.value, 10) || 1)))} />
        </label>
      </div>

      {/* Main body — the data */}
      <div className="sqlw-b-body">
        {selected.length === 0 ? (
          <div className="sqlw-empty">
            <div className="sqlw-empty-sub">
              No columns. Use "+ Column" to add one.
            </div>
          </div>
        ) : viz === "table" ? (
          <div className="sqlw-b-table-wrap">
            <table className="sqlw-b-table">
              <thead>
                <tr>
                  <th className="sqlw-th-num">#</th>
                  {selected.map((c) => (
                    <th key={c} className="sqlw-b-th">
                      <div className="sqlw-b-th-row">
                        <span className="sqlw-b-th-name">{c}</span>
                        <button className="sqlw-b-th-x"
                          title="Remove column"
                          onClick={() => removeCol(c)}>×</button>
                      </div>
                      <div className="sqlw-b-th-sub">
                        <span className="sqlw-b-th-type">
                          {(sample.column_types[c] || "").toUpperCase()}
                        </span>
                        <button className="sqlw-b-th-filter"
                          onClick={() => addFilter(c)}>filter</button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri}
                    className={rowMatches(row, filters) ? "" : "sqlw-row-faded"}>
                    <td className="sqlw-td-num">{ri + 1}</td>
                    {selected.map((c) => (
                      <td key={c}>
                        {row[c] == null ? "" : String(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="sqlw-table-foot">
              Showing {rows.length} of {sample.total_rows} rows · sample
            </div>
          </div>
        ) : (
          <DataViz vizType={viz} columns={selected} rows={matchingRows} />
        )}
      </div>

      {/* Filters strip */}
      {showFilters && (
        <div className="sqlw-b-strip">
          {filters.length === 0 && (
            <span className="sqlw-hint">
              No filters — add one, or click "filter" on a column.
            </span>
          )}
          {filters.map((f, i) => {
            const needsValue = f.op !== "IS NULL" && f.op !== "IS NOT NULL";
            return (
              <div key={i} className="sqlw-filter">
                <select value={f.col}
                  onChange={(e) => updFilter(i, { col: e.target.value })}>
                  {allCols.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={f.op}
                  onChange={(e) => updFilter(i, { op: e.target.value })}>
                  {OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                {needsValue && (
                  <input value={f.value} placeholder="value"
                    onChange={(e) => updFilter(i, { value: e.target.value })} />
                )}
                <button className="sqlw-th-btn"
                  onClick={() => rmFilter(i)}>×</button>
              </div>
            );
          })}
          <button className="sqlw-sm-btn"
            onClick={() => addFilter()}>+ Add filter</button>
        </div>
      )}

      {/* Generated SQL — collapsed by default */}
      {showSql && (
        <div className="sqlw-b-strip">
          <pre className="sqlw-sql">{sql}</pre>
        </div>
      )}
    </div>
  );
}
