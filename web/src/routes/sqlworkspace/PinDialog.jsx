// SQL Workspace — pin a result to the shared library. Posts to the
// same /api/warehouse/pins endpoint that chat-pinned results use, so
// a workspace pin behaves identically on dashboards.
import React, { useState } from "react";

const REFRESH = [
  ["live:300", "Live · every 5 minutes"],
  ["live:3600", "Live · every hour"],
  ["live:86400", "Live · daily"],
  ["manual:0", "Manual only"],
  ["snapshot:0", "Snapshot (freeze now)"],
];

export default function PinDialog({ result, onClose }) {
  const [title, setTitle] = useState("Query result");
  const [refresh, setRefresh] = useState("live:300");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const save = () => {
    const t = title.trim();
    if (!t) { setErr("Give the pin a title."); return; }
    const [mode, secs] = refresh.split(":");
    setBusy(true);
    setErr("");
    fetch("/api/warehouse/pins", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: t,
        sql_query: result.sql,
        refresh_mode: mode,
        refresh_interval_seconds: parseInt(secs, 10) || 300,
        columns: result.columns || [],
        rows: result.rows || [],
      }),
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (ok && d.ok) {
          setDone(true);
          setTimeout(onClose, 900);
        } else {
          setErr((d && (d.error || d.message)) || "Couldn't pin that.");
          setBusy(false);
        }
      })
      .catch(() => { setErr("Network error."); setBusy(false); });
  };

  return (
    <div className="sqlw-modal-back" onClick={busy ? undefined : onClose}>
      <div className="sqlw-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sqlw-modal-h">Pin to library</div>
        <div className="sqlw-modal-sub">
          Saves the query so you can drop it on any dashboard.
        </div>
        <label className="sqlw-modal-label">Title</label>
        <input
          className="sqlw-modal-input"
          value={title}
          maxLength={200}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
        />
        <label className="sqlw-modal-label">Refresh</label>
        <select
          className="sqlw-modal-input"
          value={refresh}
          onChange={(e) => setRefresh(e.target.value)}
        >
          {REFRESH.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {err && <div className="sqlw-modal-err">{err}</div>}
        {done && <div className="sqlw-modal-ok">Pinned ✓</div>}
        <div className="sqlw-modal-actions">
          <button className="sqlw-sm-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="sqlw-sm-btn sqlw-modal-save"
            onClick={save}
            disabled={busy || done}
          >{busy ? "Pinning…" : "Pin"}</button>
        </div>
      </div>
    </div>
  );
}
