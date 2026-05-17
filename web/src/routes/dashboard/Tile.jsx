// A dashboard tile: fetches its pin's data, renders one of six
// visualizations, and carries its own refresh mode (Live / Manual /
// Snapshot). Live tiles self-refresh on a ticker that pauses on hidden
// tabs and when the dashboard is paused.
import React, { useState, useEffect, useRef, useCallback } from "react";
import Chart from "chart.js/auto";

const VIZ_ICONS = {
  bar: "📊", line: "📈", pie: "🥧", area: "📉", table: "⊟", kpi: "🔢",
};
const PALETTE = [
  "#4f46e5", "#16a34a", "#ea580c", "#0891b2",
  "#db2777", "#ca8a04", "#7c3aed", "#dc2626",
];
const INTERVALS = [
  [60, "1 minute"], [300, "5 minutes"], [900, "15 minutes"],
  [3600, "1 hour"], [21600, "6 hours"], [86400, "Daily"],
];

export function effMode(tile, pin) {
  return tile.refresh_mode_override
    || (pin && pin.default_refresh_mode) || "live";
}
export function effInterval(tile, pin) {
  return tile.refresh_interval_override
    || (pin && pin.default_refresh_interval_seconds) || 300;
}
export function modeLabel(mode, secs) {
  if (mode === "manual") return "Manual";
  if (mode === "snapshot") return "Snapshot";
  const found = INTERVALS.find((i) => i[0] === secs);
  return "Live · " + (found ? found[1] : secs + "s");
}

function vizOptionsForShape(shape) {
  if (shape === "single_value" || shape === "single_row") {
    return ["kpi", "table"];
  }
  return ["bar", "line", "pie", "area", "table", "kpi"];
}

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

function ModePicker({ mode, interval, onPick, onClose }) {
  return (
    <div className="dash-picker-back" onClick={onClose}>
      <div className="dash-picker" onClick={(e) => e.stopPropagation()}>
        <div className="dash-picker-h">Refresh mode</div>
        <div className="dash-mode-list">
          {INTERVALS.map(([secs, label]) => (
            <label key={secs} className="dash-mode-opt">
              <input
                type="radio"
                checked={mode === "live" && interval === secs}
                onChange={() => onPick("live", secs)}
              />
              <span>Live · {label}</span>
            </label>
          ))}
          <label className="dash-mode-opt">
            <input
              type="radio"
              checked={mode === "manual"}
              onChange={() => onPick("manual", 0)}
            />
            <span>Manual only</span>
          </label>
          <label className="dash-mode-opt">
            <input
              type="radio"
              checked={mode === "snapshot"}
              onChange={() => onPick("snapshot", 0)}
            />
            <span>Snapshot (freeze now)</span>
          </label>
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
        animation: { duration: 250 },
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

export default function Tile({
  tile, pin, onChange, onRemove, paused, refreshNonce, tileIndex,
}) {
  const mode = effMode(tile, pin);
  const interval = effInterval(tile, pin);
  const [data, setData] = useState(null);
  const [vizPicker, setVizPicker] = useState(false);
  const [modePicker, setModePicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastAt, setLastAt] = useState(0);
  const [flag, setFlag] = useState("");      // "", "cached", "throttled", "over_budget"
  const lastAtRef = useRef(0);
  const busyRef = useRef(false);

  // Run the pin's query (Live + Manual). Snapshot tiles never call this.
  const runQuery = useCallback(() => {
    if (!pin || busyRef.current) return;
    busyRef.current = true;
    setRefreshing(true);
    fetch("/api/warehouse/pins/" + encodeURIComponent(pin.pin_id) + "/run", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_interval_seconds: interval }),
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (ok) {
          setData({ columns: d.columns, rows: d.rows });
          setFlag(d.throttled ? "throttled"
            : d.over_budget ? "over_budget"
            : d.cached ? "cached" : "");
        } else {
          setData({ error: d.detail || d.error || "Query failed" });
        }
        const t = Date.now();
        setLastAt(t); lastAtRef.current = t;
      })
      .catch(() => setData({ error: "Network error" }))
      .finally(() => { busyRef.current = false; setRefreshing(false); });
  }, [pin, interval]);

  // Snapshot tiles render frozen data; everything else fetches once on
  // mount / when the pin or mode changes.
  useEffect(() => {
    if (!pin) { setData({ error: "This pinned query no longer exists." }); return; }
    if (mode === "snapshot") {
      setData({
        columns: tile.snapshot_columns || [],
        rows: tile.snapshot_data || [],
      });
      return;
    }
    runQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, mode]);

  // Live ticker — pauses on hidden tabs and when the dashboard is
  // paused. A small per-tile offset staggers simultaneous refreshes.
  useEffect(() => {
    if (mode !== "live" || paused) return undefined;
    const stagger = (tileIndex % 8) * 1500;
    const iv = setInterval(() => {
      if (document.hidden) return;
      const age = Date.now() - (lastAtRef.current || 0);
      if (age >= interval * 1000 + stagger) runQuery();
    }, 1000);
    const onVis = () => {
      if (!document.hidden) {
        const age = Date.now() - (lastAtRef.current || 0);
        if (age >= interval * 1000) runQuery();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [mode, paused, interval, tileIndex, runQuery]);

  // Dashboard "Refresh all" — bump of refreshNonce forces a run
  // (snapshot tiles are intentionally skipped).
  useEffect(() => {
    if (refreshNonce > 0 && mode !== "snapshot") runQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshNonce]);

  const onPickMode = (m, secs) => {
    setModePicker(false);
    if (m === "snapshot") {
      // Capture current rows and freeze them onto the tile.
      const rows = (data && data.rows) || [];
      const cols = (data && data.columns) || [];
      onChange({
        refresh_mode_override: "snapshot",
        snapshot_data: rows,
        snapshot_columns: cols,
        snapshot_captured_at: new Date().toISOString(),
      });
    } else {
      onChange({
        refresh_mode_override: m,
        refresh_interval_override: m === "live" ? secs : null,
        snapshot_data: null,
        snapshot_columns: null,
        snapshot_captured_at: null,
      });
    }
  };

  // Status dot.
  let dot = "fresh";
  if (refreshing) dot = "refreshing";
  else if (data && data.error) dot = "error";
  else if (mode === "snapshot") dot = "snapshot";
  else if (flag === "cached" || flag === "over_budget") dot = "cached";

  let foot = "";
  if (mode === "snapshot") {
    foot = "Snapshot" + (tile.snapshot_captured_at
      ? " from " + new Date(tile.snapshot_captured_at).toLocaleDateString()
      : "");
  } else if (refreshing) {
    foot = "Refreshing…";
  } else if (lastAt) {
    const s = Math.floor((Date.now() - lastAt) / 1000);
    foot = s < 5 ? "Updated just now"
      : s < 60 ? "Updated " + s + "s ago"
      : "Updated " + Math.floor(s / 60) + "m ago";
  }

  return (
    <div className="dash-tile">
      <div className="dash-tile-head">
        <span className={"dash-dot dash-dot-" + dot} />
        <span className="dash-tile-title">{pin ? pin.title : "(missing pin)"}</span>
        {tile.viz_type && (
          <button
            className="dash-tile-pill"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setVizPicker(true); }}
          >
            {tile.viz_type}
          </button>
        )}
        <button
          className="dash-tile-pill"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setModePicker(true); }}
        >
          {modeLabel(mode, interval)}
        </button>
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
            onClick={(e) => { e.stopPropagation(); setVizPicker(true); }}
          >
            <div className="dash-tile-ph-rows">
              {data && data.rows
                ? data.rows.length + " row"
                  + (data.rows.length === 1 ? "" : "s") + " of data"
                : "Loading data…"}
            </div>
            <div className="dash-tile-ph-cta">Choose chart type →</div>
          </button>
        ) : (
          <TileViz vizType={tile.viz_type} data={data} />
        )}
      </div>
      <div className="dash-tile-foot">
        <span>{foot}</span>
        {mode !== "snapshot" && (
          <button
            className="dash-tile-refresh"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); runQuery(); }}
            disabled={refreshing}
            title="Refresh now"
          >🔄</button>
        )}
      </div>
      {vizPicker && (
        <VizPicker
          shape={pin ? pin.data_shape : "multi_row"}
          current={tile.viz_type}
          onPick={(v) => { onChange({ viz_type: v }); setVizPicker(false); }}
          onClose={() => setVizPicker(false)}
        />
      )}
      {modePicker && (
        <ModePicker
          mode={mode}
          interval={interval}
          onPick={onPickMode}
          onClose={() => setModePicker(false)}
        />
      )}
    </div>
  );
}
