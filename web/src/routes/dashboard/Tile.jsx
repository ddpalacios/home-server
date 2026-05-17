// A single dashboard tile: fetches its pin's data, renders one of six
// visualizations, and lets the owner pick / swap the chart type.
import React, { useState, useEffect, useRef } from "react";
import Chart from "chart.js/auto";

const VIZ_ICONS = {
  bar: "📊", line: "📈", pie: "🥧", area: "📉", table: "⊟", kpi: "🔢",
};
const PALETTE = [
  "#4f46e5", "#16a34a", "#ea580c", "#0891b2",
  "#db2777", "#ca8a04", "#7c3aed", "#dc2626",
];

// Contextual viz options — a single-row query can't be a bar/line/pie.
function vizOptionsForShape(shape) {
  if (shape === "single_value" || shape === "single_row") {
    return ["kpi", "table"];
  }
  return ["bar", "line", "pie", "area", "table", "kpi"];
}

// Pick a label column (first non-numeric) and value column (first
// numeric) from the result rows.
function pickColumns(columns, rows) {
  const cols = columns && columns.length
    ? columns
    : (rows[0] ? Object.keys(rows[0]) : []);
  let labelCol = cols[0];
  let valueCol = cols[cols.length - 1];
  for (const c of cols) {
    const numeric = rows.length > 0 && rows.every(
      (r) => r[c] == null || r[c] === "" || typeof r[c] === "number");
    if (numeric) { valueCol = c; }
  }
  for (const c of cols) {
    const numeric = rows.length > 0 && rows.every(
      (r) => r[c] == null || r[c] === "" || typeof r[c] === "number");
    if (!numeric) { labelCol = c; break; }
  }
  return { cols, labelCol, valueCol };
}

function VizPicker({ shape, current, onPick, onClose }) {
  const opts = vizOptionsForShape(shape);
  return (
    <div className="dash-picker-back" onClick={onClose}>
      <div className="dash-picker" onClick={(e) => e.stopPropagation()}>
        <div className="dash-picker-h">Choose how to show this data</div>
        <div className="dash-picker-grid">
          {opts.map((o) => (
            <button
              key={o}
              className={"dash-picker-opt" + (o === current ? " active" : "")}
              onClick={() => onPick(o)}
            >
              <span className="dash-picker-icon">{VIZ_ICONS[o]}</span>
              <span>{o}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TileViz({ vizType, data }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (vizType === "table" || vizType === "kpi") return;
    if (!data || data.error || !canvasRef.current) return;
    const rows = data.rows || [];
    const { labelCol, valueCol } = pickColumns(data.columns, rows);
    const labels = rows.map((r) => String(r[labelCol]));
    const values = rows.map((r) => Number(r[valueCol]) || 0);
    const isPie = vizType === "pie";
    if (chartRef.current) { chartRef.current.destroy(); }
    chartRef.current = new Chart(canvasRef.current, {
      type: vizType === "area" ? "line" : vizType,
      data: {
        labels,
        datasets: [{
          label: valueCol,
          data: values,
          backgroundColor: isPie
            ? labels.map((_, i) => PALETTE[i % PALETTE.length])
            : PALETTE[0],
          borderColor: PALETTE[0],
          borderWidth: vizType === "line" || vizType === "area" ? 2 : 1,
          fill: vizType === "area",
          tension: 0.25,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: isPie } },
        scales: isPie ? {} : { y: { beginAtZero: true } },
      },
    });
    return () => {
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    };
  }, [vizType, data]);

  if (!data) return <div className="dash-tile-msg">Loading…</div>;
  if (data.error) return <div className="dash-tile-msg err">{data.error}</div>;

  const rows = data.rows || [];
  const cols = data.columns && data.columns.length
    ? data.columns
    : (rows[0] ? Object.keys(rows[0]) : []);

  if (vizType === "kpi") {
    let v = "—";
    if (rows[0]) {
      const numCol = cols.find((c) => typeof rows[0][c] === "number");
      v = numCol != null ? rows[0][numCol] : rows[0][cols[0]];
    }
    return <div className="dash-kpi">{String(v)}</div>;
  }
  if (vizType === "table") {
    return (
      <div className="dash-tile-table-wrap">
        <table className="dash-tile-table">
          <thead>
            <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.slice(0, 100).map((r, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c}>{r[c] == null ? "" : String(r[c])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return <canvas ref={canvasRef} className="dash-tile-canvas" />;
}

export default function Tile({ tile, pin, onChange, onRemove }) {
  const [data, setData] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!pin) {
      setData({ error: "This pinned query no longer exists." });
      return;
    }
    let cancelled = false;
    setData(null);
    fetch("/api/warehouse/pins/" + encodeURIComponent(pin.pin_id) + "/run", {
      method: "POST", credentials: "same-origin",
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        setData(ok
          ? { columns: d.columns, rows: d.rows }
          : { error: d.detail || d.error || "Query failed" });
      })
      .catch(() => { if (!cancelled) setData({ error: "Network error" }); });
    return () => { cancelled = true; };
  }, [pin]);

  const rowCount = data && data.rows ? data.rows.length : null;

  return (
    <div className="dash-tile">
      <div className="dash-tile-head">
        <span>🗄️</span>
        <span className="dash-tile-title">{pin ? pin.title : "(missing pin)"}</span>
        {tile.viz_type && (
          <button
            className="dash-tile-pill"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setPickerOpen(true); }}
          >
            {tile.viz_type}
          </button>
        )}
        <button
          className="dash-tile-x"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label="Remove tile"
        >✕</button>
      </div>
      <div className="dash-tile-body">
        {!tile.viz_type ? (
          <button
            className="dash-tile-placeholder"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setPickerOpen(true); }}
          >
            <div className="dash-tile-ph-rows">
              {rowCount == null
                ? "Loading data…"
                : rowCount + " row" + (rowCount === 1 ? "" : "s") + " of data"}
            </div>
            <div className="dash-tile-ph-cta">Choose chart type →</div>
          </button>
        ) : (
          <TileViz vizType={tile.viz_type} data={data} />
        )}
      </div>
      {pickerOpen && (
        <VizPicker
          shape={pin ? pin.data_shape : "multi_row"}
          current={tile.viz_type}
          onPick={(v) => { onChange({ viz_type: v }); setPickerOpen(false); }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
