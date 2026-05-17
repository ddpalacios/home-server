// Shared result renderer for the SQL workspace — table / bar / line /
// pie / area / KPI. Charts are multi-series: every numeric column
// becomes its own series with its own colour and a legend. The
// `layout` prop flexes how series sit together — grouped, stacked, or
// overlapping.
import React, { useRef, useEffect } from "react";
import Chart from "chart.js/auto";

const PALETTE = [
  "#4f46e5", "#16a34a", "#ea580c", "#0891b2",
  "#db2777", "#ca8a04", "#7c3aed", "#dc2626",
];

export const VIZ_TYPES = ["table", "bar", "line", "pie", "area", "kpi"];
export const VIZ_ICON = {
  table: "⊟", bar: "📊", line: "📈", pie: "🥧", area: "📉", kpi: "🔢",
};
// Which viz types support a multi-series layout control, and the
// layout options each offers.
export const LAYOUTS = {
  bar:  [["grouped", "Side by side"], ["stacked", "Stacked"]],
  line: [["overlap", "Overlap"], ["stacked", "Stacked"]],
  area: [["overlap", "Overlap"], ["stacked", "Stacked"]],
};

function colList(columns, rows) {
  return columns && columns.length
    ? columns
    : (rows[0] ? Object.keys(rows[0]) : []);
}

function isNumericCol(rows, c) {
  return rows.length > 0 && rows.every(
    (r) => r[c] == null || r[c] === "" || typeof r[c] === "number");
}

// Label = first non-numeric column; series = every numeric column.
function pickSeries(cols, rows) {
  const numeric = cols.filter((c) => isNumericCol(rows, c));
  let label = cols.find((c) => !isNumericCol(rows, c)) || cols[0];
  let series = numeric.filter((c) => c !== label);
  if (series.length === 0) {
    series = cols.filter((c) => c !== label).slice(0, 1);
    if (series.length === 0) series = [label];
  }
  return { label, series };
}

export default function DataViz({ columns, rows, vizType, layout }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const data = rows || [];
  const cols = colList(columns, data);

  useEffect(() => {
    if (vizType === "table" || vizType === "kpi") return undefined;
    if (!canvasRef.current) return undefined;
    const { label, series } = pickSeries(cols, data);
    const labels = data.map((r) => String(r[label]));
    const isPie = vizType === "pie";

    let datasets;
    if (isPie) {
      // Pie is single-series — use the first numeric series.
      const s = series[0];
      datasets = [{
        label: s,
        data: data.map((r) => Number(r[s]) || 0),
        backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]),
      }];
    } else {
      datasets = series.map((s, i) => ({
        label: s,
        data: data.map((r) => Number(r[s]) || 0),
        backgroundColor: PALETTE[i % PALETTE.length],
        borderColor: PALETTE[i % PALETTE.length],
        borderWidth: vizType === "line" || vizType === "area" ? 2 : 1,
        fill: vizType === "area",
        tension: 0.25,
      }));
    }

    const stacked = layout === "stacked";
    const scales = isPie ? {} : {
      x: { stacked },
      y: { stacked, beginAtZero: true },
    };
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: vizType === "area" ? "line" : vizType,
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: isPie || datasets.length > 1, position: "bottom" },
        },
        scales,
      },
    });
    return () => {
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    };
  }, [vizType, layout, columns, rows]);

  if (vizType === "kpi") {
    let v = "—";
    if (data[0]) {
      const numCol = cols.find((c) => typeof data[0][c] === "number");
      v = numCol != null ? data[0][numCol] : data[0][cols[0]];
    }
    return <div className="sqlw-kpi">{String(v)}</div>;
  }
  if (vizType === "table") {
    return (
      <div className="sqlw-dv-table-wrap">
        <table className="sqlw-dv-table">
          <thead>
            <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
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
  return (
    <div className="sqlw-dv-chart">
      <canvas ref={canvasRef} />
    </div>
  );
}
