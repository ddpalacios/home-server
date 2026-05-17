// Vanilla-JS entry for the React SQL Workspace island. Lazily loaded
// via main.js's route map and mounted into #sqlWorkspaceRoot.
import React from "react";
import { createRoot } from "react-dom/client";
import SqlWorkspace from "./sqlworkspace/SqlWorkspace.jsx";

let _root = null;

export function mountSqlWorkspace() {
  const el = document.getElementById("sqlWorkspaceRoot");
  if (!el || _root) return;
  _root = createRoot(el);
  _root.render(React.createElement(SqlWorkspace));
}

export function init() {
  mountSqlWorkspace();
}

window.loadSqlWorkspaceSection = mountSqlWorkspace;
