// Vanilla-JS entry point for the React dashboard editor island.
// Mounted into a single #dashboardRoot div in the Jinja shell, lazily
// loaded via main.js's route map so React + react-grid-layout aren't
// paid for on pages that don't use the dashboard editor.
import React from "react";
import { createRoot } from "react-dom/client";
import DashboardApp from "./dashboard/DashboardApp.jsx";

let _root = null;

export function mountDashboard() {
  const el = document.getElementById("dashboardRoot");
  if (!el || _root) return;
  _root = createRoot(el);
  _root.render(React.createElement(DashboardApp));
}

// main.js calls init() after the module loads.
export function init() {
  mountDashboard();
}

// Allow an inline section-loader hook to call this by name.
window.loadDashboardSection = mountDashboard;
