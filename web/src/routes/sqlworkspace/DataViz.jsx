// Shared result renderer for the SQL workspace — table / bar / line /
// pie / area / KPI. Used by the builder's preview and by Phase-4
// result blocks so both surfaces render data identically.
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

function colList(columns, rows) {
  return columns && columns.length
    ? columns
    : (rows[0] ? Object.keys(rows[0]) : []);
}

// Label column = first non-numeric; value column = last numeric.
function pickCols(cols, rows) {
  let label = cols[0];
  let value = cols[cols.length - 1];
  for (const c of cols) {
    const numeric = rows.length > 0 && rows.every(
      (r) => r[c] == null || r[c] === "" || typeof r[c] === "number");
    if (numeric) value = c;
  }
  for (const c of cols) {
    const numeric = rows.length > 0 && rows.every(
      (r) => r[c] == null || r[c] === "" || typeof r[c] === "number");
    if (!numeric) { label = c; break; }
  }
  return { label, value };
}

export default function DataViz({ columns, rows, vizType }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const data = rows || [];
  const cols = colList(columns, data);

  useEffect(() => {
    if (vizType === "table" || vizType === "kpi") return undefined;
    if (!canvasRef.current) return undefined;
    const { label, value } = pickCols(cols, data);
    const labels = data.map((r) => String(r[label]));
    const values = data.map((r) => Number(r[value]) || 0);
    const isPie = vizType === "pie";
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: vizType === "area" ? "line" : vizType,
      data: {
        labels,
        datasets: [{
          label: value,
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
  }, [vizType, columns, rows]);

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
