// Dashboard editor — a React island in the dashboard SPA.
//   list  → cards of the account's dashboards, "+ New dashboard"
//   editor→ react-grid-layout 12-col canvas + library sidebar
// A pin can be dropped on many dashboards; each tile keeps its own
// viz_type, so the same query renders differently per dashboard.
import React, { useState, useEffect, useCallback, useRef } from "react";
import GridLayout, { WidthProvider } from "react-grid-layout/legacy";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "./dashboard.css";
import Tile, { effMode } from "./Tile.jsx";

const RGL = WidthProvider(GridLayout);
const JSON_HDR = { "Content-Type": "application/json" };

async function api(path, opts) {
  const r = await fetch(path, { credentials: "same-origin", ...(opts || {}) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}
const listDashboards = () => api("/api/warehouse/dashboards");
const getDashboard = (id) =>
  api("/api/warehouse/dashboards/" + encodeURIComponent(id));
const createDashboard = (name) =>
  api("/api/warehouse/dashboards", {
    method: "POST", headers: JSON_HDR, body: JSON.stringify({ name }),
  });
const saveDashboard = (id, patch) =>
  api("/api/warehouse/dashboards/" + encodeURIComponent(id), {
    method: "POST", headers: JSON_HDR, body: JSON.stringify(patch),
  });
const deleteDashboard = (id) =>
  api("/api/warehouse/dashboards/" + encodeURIComponent(id),
      { method: "DELETE" });
const listPins = () => api("/api/warehouse/pins");

function agoLabel(iso) {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return days + " days ago";
  return new Date(iso).toLocaleDateString();
}

function defaultSize(shape) {
  if (shape === "single_value") return { w: 3, h: 2 };
  if (shape === "single_row") return { w: 4, h: 3 };
  return { w: 6, h: 3 };
}

// ── Dashboards list ──────────────────────────────────────────────
function DashboardList({ onOpen }) {
  const [dashes, setDashes] = useState(null);

  const reload = useCallback(() => {
    listDashboards()
      .then((d) => setDashes(d.dashboards || []))
      .catch(() => setDashes([]));
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const onNew = async () => {
    const name = window.prompt("Name this dashboard:", "Untitled dashboard");
    if (!name || !name.trim()) return;
    try {
      const d = await createDashboard(name.trim());
      if (d && d.dashboard) onOpen(d.dashboard.dashboard_id);
    } catch (e) { window.alert("Couldn't create the dashboard."); }
  };

  const onDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("Delete this dashboard? Pins it uses are kept.")) return;
    try { await deleteDashboard(id); reload(); }
    catch (err) { window.alert("Couldn't delete."); }
  };

  if (dashes === null) {
    return <div className="dash-loading">Loading dashboards…</div>;
  }
  return (
    <div className="dash-list-wrap">
      <h2>Dashboards</h2>
      <p className="dash-sub">
        {dashes.length} total · build them from your pinned library
      </p>
      <div className="dash-grid">
        {dashes.map((d) => (
          <div
            key={d.dashboard_id}
            className="dash-card"
            onClick={() => onOpen(d.dashboard_id)}
          >
            <div className="dash-card-name">{d.name}</div>
            <div className="dash-card-meta">
              {d.tile_count} tile{d.tile_count === 1 ? "" : "s"}
            </div>
            <div className="dash-card-meta">
              edited {agoLabel(d.last_edited_at)}
            </div>
            <button
              className="dash-card-meta"
              style={{
                marginTop: "auto", border: 0, background: "none",
                color: "#dc2626", cursor: "pointer", textAlign: "left",
                padding: 0,
              }}
              onClick={(e) => onDelete(e, d.dashboard_id)}
            >Delete</button>
          </div>
        ))}
        <button className="dash-card dash-card-new" onClick={onNew}>
          <div className="dash-card-new-plus">+</div>
          <div>New dashboard</div>
        </button>
      </div>
    </div>
  );
}

// ── Editor ───────────────────────────────────────────────────────
function DashboardEditor({ dashboardId, onBack }) {
  const [dash, setDash] = useState(null);
  const [pins, setPins] = useState([]);
  const [tiles, setTiles] = useState([]);
  const [saveState, setSaveState] = useState("saved");
  const [paused, setPaused] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const saveTimer = useRef(null);
  const savingRef = useRef(false);
  const dirtyRef = useRef(null);
  const tilesRef = useRef([]);
  tilesRef.current = tiles;

  useEffect(() => {
    Promise.all([getDashboard(dashboardId), listPins()])
      .then(([d, p]) => {
        setDash(d.dashboard);
        setTiles((d.dashboard.layout || []).slice());
        setPins(p.pins || []);
      })
      .catch(() => setDash({ name: "(could not load)", layout: [] }));
  }, [dashboardId]);

  // Auto-save with an in-flight guard: never more than one POST in
  // flight. A save requested while one is running is coalesced into a
  // single follow-up — so rapid edits can't flood the network.
  const flushSave = useCallback((nextTiles) => {
    if (savingRef.current) { dirtyRef.current = nextTiles; return; }
    savingRef.current = true;
    setSaveState("saving");
    saveDashboard(dashboardId, { layout: nextTiles })
      .then(() => setSaveState("saved"))
      .catch(() => setSaveState("error"))
      .finally(() => {
        savingRef.current = false;
        if (dirtyRef.current) {
          const pending = dirtyRef.current;
          dirtyRef.current = null;
          flushSave(pending);
        }
      });
  }, [dashboardId]);

  const queueSave = useCallback((nextTiles) => {
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => flushSave(nextTiles), 800);
  }, [flushSave]);

  // Belt-and-suspenders: a 30s tick that flushes any pending save.
  useEffect(() => {
    const iv = setInterval(() => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        flushSave(tilesRef.current);
      }
    }, 30000);
    return () => clearInterval(iv);
  }, [flushSave]);

  const commitTiles = useCallback((nextTiles) => {
    setTiles(nextTiles);
    queueSave(nextTiles);
  }, [queueSave]);

  const onLayoutChange = useCallback((layout) => {
    const byId = {};
    layout.forEach((l) => { byId[l.i] = l; });
    setTiles((prev) => {
      let changed = false;
      const next = prev.map((t) => {
        const l = byId[t.tile_id];
        if (!l) return t;
        const gp = t.grid_position;
        if (gp.x === l.x && gp.y === l.y && gp.w === l.w && gp.h === l.h) {
          return t;
        }
        changed = true;
        return { ...t, grid_position: { x: l.x, y: l.y, w: l.w, h: l.h } };
      });
      if (changed) queueSave(next);
      return changed ? next : prev;
    });
  }, [queueSave]);

  // Drop a library pin onto the canvas. We handle the HTML5 drop
  // ourselves rather than relying on react-grid-layout's external-drop
  // (finicky, and unreliable through the v2 /legacy wrapper). The grid
  // cell is derived from the cursor position over the grid element.
  const onCanvasDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onCanvasDrop = useCallback((e) => {
    e.preventDefault();
    let pinId = "";
    try { pinId = e.dataTransfer.getData("text/plain"); } catch (err) {}
    if (!pinId) return;
    const pin = pins.find((p) => p.pin_id === pinId);
    const size = defaultSize(pin ? pin.data_shape : "multi_row");
    const gridEl = e.currentTarget.querySelector(".react-grid-layout")
      || e.currentTarget;
    const rect = gridEl.getBoundingClientRect();
    const colW = rect.width / 12 || 1;
    let gx = Math.floor((e.clientX - rect.left) / colW);
    gx = Math.max(0, Math.min(12 - size.w, gx));
    let gy = Math.floor((e.clientY - rect.top) / 68);   // rowHeight 60 + margin 8
    gy = Math.max(0, gy);
    const newTile = {
      tile_id: "tile_" + Math.random().toString(36).slice(2, 12),
      pin_id: pinId,
      grid_position: { x: gx, y: gy, w: size.w, h: size.h },
      viz_type: null,
      viz_config: {},
      refresh_mode_override: null,
      refresh_interval_override: null,
    };
    commitTiles([...tilesRef.current, newTile]);
  }, [pins, commitTiles]);

  const updateTile = useCallback((tileId, patch) => {
    commitTiles(tilesRef.current.map(
      (t) => (t.tile_id === tileId ? { ...t, ...patch } : t)));
  }, [commitTiles]);

  const removeTile = useCallback((tileId) => {
    commitTiles(tilesRef.current.filter((t) => t.tile_id !== tileId));
  }, [commitTiles]);

  if (!dash) return <div className="dash-loading">Loading…</div>;

  const layout = tiles.map((t) => ({
    i: t.tile_id,
    x: t.grid_position.x, y: t.grid_position.y,
    w: t.grid_position.w, h: t.grid_position.h,
  }));
  const saveLabel = saveState === "saving" ? "Saving…"
    : saveState === "error" ? "Error saving — will retry"
    : "All changes saved";

  // Refresh-mode summary for the header.
  let nLive = 0, nManual = 0, nSnapshot = 0;
  tiles.forEach((t) => {
    const m = effMode(t, pins.find((p) => p.pin_id === t.pin_id));
    if (m === "manual") nManual += 1;
    else if (m === "snapshot") nSnapshot += 1;
    else nLive += 1;
  });

  return (
    <div className="dash-editor">
      <div className="dash-editor-head">
        <button className="dash-btn" onClick={onBack}>← Back</button>
        <span className="dash-editor-name">{dash.name}</span>
        <span className="dash-mode-summary">
          {nLive} live · {nManual} manual · {nSnapshot} snapshot
        </span>
        <button
          className="dash-btn"
          onClick={() => setPaused((p) => !p)}
          title="Pause / resume live auto-refresh"
        >{paused ? "Resume" : "Pause"}</button>
        <button
          className="dash-btn"
          onClick={() => setRefreshNonce((n) => n + 1)}
          title="Refresh every live and manual tile now"
        >Refresh all</button>
        <button
          className="dash-btn"
          onClick={() => setExportOpen(true)}
          title="Export this dashboard as PDF or PNG"
        >Export ↓</button>
        <span className={"dash-save dash-save-" + saveState}>{saveLabel}</span>
      </div>
      {exportOpen && (
        <ExportDialog
          dashboardId={dashboardId}
          dashName={dash.name}
          onClose={() => setExportOpen(false)}
        />
      )}
      <div className="dash-editor-body">
        <aside className="dash-lib">
          <div className="dash-lib-h">Library</div>
          {pins.length === 0 && (
            <div className="dash-lib-empty">
              No pins yet. Pin SQL results from Ask the warehouse, then
              drag them here.
            </div>
          )}
          {pins.map((p) => {
            const used = tiles.some((t) => t.pin_id === p.pin_id);
            return (
              <div
                key={p.pin_id}
                className={"dash-lib-pin" + (used ? " used" : "")}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", p.pin_id);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                title={used ? "Already on this dashboard" : "Drag onto the canvas"}
              >
                <span className="dash-lib-icon">🗄️</span>
                <span className="dash-lib-pin-title">{p.title}</span>
              </div>
            );
          })}
        </aside>
        <div
          className="dash-canvas-wrap"
          onDragOver={onCanvasDragOver}
          onDrop={onCanvasDrop}
        >
          <RGL
            className="dash-canvas"
            layout={layout}
            cols={12}
            rowHeight={60}
            margin={[8, 8]}
            onLayoutChange={onLayoutChange}
            compactType="vertical"
            draggableHandle=".dash-tile-head"
          >
            {tiles.map((t, i) => (
              <div key={t.tile_id}>
                <Tile
                  tile={t}
                  pin={pins.find((p) => p.pin_id === t.pin_id)}
                  onChange={(patch) => updateTile(t.tile_id, patch)}
                  onRemove={() => removeTile(t.tile_id)}
                  paused={paused}
                  refreshNonce={refreshNonce}
                  tileIndex={i}
                />
              </div>
            ))}
          </RGL>
          {tiles.length === 0 && (
            <div className="dash-canvas-empty">
              Drag a pin from the library onto the canvas.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Export dialog ────────────────────────────────────────────────
function ExportDialog({ dashboardId, dashName, onClose }) {
  const [format, setFormat] = useState("pdf");
  const [freshness, setFreshness] = useState("current");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const doExport = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(
        "/api/warehouse/dashboards/" + encodeURIComponent(dashboardId)
          + "/export",
        {
          method: "POST", credentials: "same-origin", headers: JSON_HDR,
          body: JSON.stringify({ format, data_freshness: freshness }),
        });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setErr(d.detail || d.error || "Export failed.");
        setBusy(false);
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (dashName || "dashboard")
        .replace(/[^A-Za-z0-9_-]+/g, "_") + "." + format;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      onClose();
    } catch (e) {
      setErr("Network error.");
      setBusy(false);
    }
  };

  return (
    <div className="dash-picker-back" onClick={busy ? undefined : onClose}>
      <div
        className="dash-picker"
        style={{ width: "min(420px, 92vw)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dash-picker-h">Export dashboard</div>
        <div className="dash-mode-list">
          <strong style={{ fontSize: 12 }}>Format</strong>
          <label className="dash-mode-opt">
            <input type="radio" checked={format === "pdf"}
              onChange={() => setFormat("pdf")} />
            <span>PDF — best for reports</span>
          </label>
          <label className="dash-mode-opt">
            <input type="radio" checked={format === "png"}
              onChange={() => setFormat("png")} />
            <span>PNG — best for emails or embedding</span>
          </label>
          <strong style={{ fontSize: 12, marginTop: 8 }}>Data</strong>
          <label className="dash-mode-opt">
            <input type="radio" checked={freshness === "current"}
              onChange={() => setFreshness("current")} />
            <span>Use current data (fetched at export)</span>
          </label>
          <label className="dash-mode-opt">
            <input type="radio" checked={freshness === "cached"}
              onChange={() => setFreshness("cached")} />
            <span>Use cached data (faster, may be stale)</span>
          </label>
        </div>
        {err && (
          <div style={{ color: "#dc2626", fontSize: 12, marginTop: 8 }}>
            {err}
          </div>
        )}
        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 8,
          marginTop: 14,
        }}>
          <button className="dash-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="dash-btn" onClick={doExport} disabled={busy}>
            {busy ? "Exporting…" : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardApp() {
  const [editId, setEditId] = useState(null);
  if (editId) {
    return (
      <DashboardEditor
        dashboardId={editId}
        onBack={() => setEditId(null)}
      />
    );
  }
  return <DashboardList onOpen={(id) => setEditId(id)} />;
}
