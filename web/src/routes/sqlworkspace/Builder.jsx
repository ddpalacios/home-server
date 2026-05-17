// SQL Workspace — visual builder. Shows a live sample of the clicked
// file as a real table; column headers carry rename / drop / filter
// controls; filter rows fade non-matching preview rows; the generated
// SELECT/FROM/WHERE/LIMIT is always shown at the bottom.
import React, { useState, useEffect, useMemo } from "react";

const OPS = [
  ["=", "equals"], ["!=", "not equal"], [">", "greater than"],
  ["<", "less than"], ["LIKE", "contains"],
  ["IS NULL", "is empty"], ["IS NOT NULL", "is not empty"],
];

function sqlEsc(v) { return String(v).replace(/'/g, "''"); }

function whereClause(f) {
  if (f.op === "IS NULL" || f.op === "IS NOT NULL") {
    return `${f.col} ${f.op}`;
  }
  if (f.op === "LIKE") {
    return `${f.col} LIKE '%${sqlEsc(f.value)}%'`;
  }
  const num = f.value !== ""
    && !isNaN(parseFloat(f.value)) && isFinite(f.value);
  return `${f.col} ${f.op} ${num ? f.value : "'" + sqlEsc(f.value) + "'"}`;
}

export function generateSQL(sample, st) {
  if (!sample) return "-- Click a file to begin";
  const visible = sample.columns.filter((c) => !st.hidden.has(c));
  if (!visible.length) return "-- No columns selected";
  const cols = visible.map((c) => {
    const a = (st.aliases[c] || "").trim();
    return a ? `${c} AS ${a}` : c;
  }).join(", ");
  let sql = `SELECT ${cols}\nFROM ${sample.spark_table_name}`;
  const active = st.filters.filter((f) => f.col && (
    f.op === "IS NULL" || f.op === "IS NOT NULL"
    || String(f.value).length > 0));
  if (active.length) {
    sql += "\nWHERE " + active.map(whereClause).join("\n  AND ");
  }
  if (st.limit) sql += `\nLIMIT ${st.limit}`;
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
  const [hidden, setHidden] = useState(() => new Set());
  const [aliases, setAliases] = useState({});
  const [filters, setFilters] = useState([]);
  const [limit, setLimit] = useState(100);

  useEffect(() => {
    setSample(null);
    fetch("/api/warehouse/sql-workspace/sample?document_id="
          + encodeURIComponent(file.document_id),
          { credentials: "same-origin" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => setSample(
        ok ? d : { error: d.message || d.error || "Could not load file." }))
      .catch(() => setSample({ error: "Network error." }));
  }, [file.document_id]);

  const sql = useMemo(() => generateSQL(
    sample && !sample.error ? sample : null,
    { hidden, aliases, filters, limit }),
  [sample, hidden, aliases, filters, limit]);

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

  const cols = sample.columns || [];
  const rows = sample.rows || [];

  const drop = (c) => setHidden((h) => new Set(h).add(c));
  const addBack = (c) => setHidden((h) => {
    const n = new Set(h); n.delete(c); return n;
  });
  const addFilter = (col) => setFilters((f) => [
    ...f, { col: col || cols[0], op: "=", value: "" },
  ]);
  const updFilter = (i, patch) => setFilters(
    (f) => f.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const rmFilter = (i) => setFilters((f) => f.filter((_, j) => j !== i));
  const reset = () => {
    setHidden(new Set()); setAliases({}); setFilters([]); setLimit(100);
  };

  return (
    <div className="sqlw-builder">
      <div className="sqlw-builder-head">
        <div>
          <div className="sqlw-builder-title">{file.name}</div>
          <div className="sqlw-builder-meta">
            {sample.spark_table_name} · {sample.total_rows} rows total
          </div>
        </div>
        <div className="sqlw-builder-actions">
          {hidden.size > 0 && (
            <button className="sqlw-sm-btn"
              onClick={() => setHidden(new Set())}>Show all hidden</button>
          )}
          <button className="sqlw-sm-btn" onClick={reset}>Reset</button>
        </div>
      </div>

      <div className="sqlw-table-wrap">
        <table className="sqlw-table">
          <thead>
            <tr>
              <th className="sqlw-th-num">#</th>
              {cols.map((c) => {
                const isHidden = hidden.has(c);
                return (
                  <th key={c}
                      className={"sqlw-th" + (isHidden ? " hidden" : "")}>
                    <div className="sqlw-th-name">{c}</div>
                    <div className="sqlw-th-type">
                      {(sample.column_types[c] || "").toUpperCase()}
                    </div>
                    {isHidden ? (
                      <button className="sqlw-th-btn"
                        onClick={() => addBack(c)}>Add back</button>
                    ) : (
                      <>
                        <input
                          className="sqlw-th-rename"
                          placeholder="rename…"
                          value={aliases[c] || ""}
                          onChange={(e) => setAliases(
                            (a) => ({ ...a, [c]: e.target.value }))}
                        />
                        <div className="sqlw-th-btns">
                          <button className="sqlw-th-btn"
                            onClick={() => drop(c)}>Drop</button>
                          <button className="sqlw-th-btn"
                            onClick={() => addFilter(c)}>Filter</button>
                        </div>
                      </>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const matches = rowMatches(row, filters);
              return (
                <tr key={ri} className={matches ? "" : "sqlw-row-faded"}>
                  <td className="sqlw-td-num">{ri + 1}</td>
                  {cols.map((c) => (
                    <td key={c}
                        className={hidden.has(c) ? "sqlw-td-hidden" : ""}>
                      {row[c] == null ? "" : String(row[c])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="sqlw-table-foot">
          Showing {rows.length} of {sample.total_rows} rows · sample preview
        </div>
      </div>

      <div className="sqlw-section">
        <div className="sqlw-section-h">Filters</div>
        {filters.length === 0 && (
          <div className="sqlw-hint">
            No filters yet — click "Filter" on a column header, or add one.
          </div>
        )}
        {filters.map((f, i) => {
          const needsValue = f.op !== "IS NULL" && f.op !== "IS NOT NULL";
          return (
            <div key={i} className="sqlw-filter">
              <select value={f.col}
                onChange={(e) => updFilter(i, { col: e.target.value })}>
                {cols.map((c) => <option key={c} value={c}>{c}</option>)}
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

      <div className="sqlw-section sqlw-limit-row">
        <span className="sqlw-section-h">Limit rows</span>
        <input type="number" className="sqlw-limit-input"
          value={limit} min="1" max="1000"
          onChange={(e) => setLimit(Math.max(1, Math.min(1000,
            parseInt(e.target.value, 10) || 1)))} />
      </div>

      <div className="sqlw-section">
        <div className="sqlw-section-h">Generated SQL</div>
        <pre className="sqlw-sql">{sql}</pre>
      </div>
    </div>
  );
}
