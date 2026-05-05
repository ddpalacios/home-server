// Vanilla-JS entry point for the React flow-builder island. The rest
// of the dashboard is plain ESM + DOM rendering — only this feature
// boots a React tree, mounted into a single root div in the Jinja
// shell. Lazy-loaded via main.js's route map so React isn't paid for
// on pages that don't use it.
import React from "react";
import { createRoot } from "react-dom/client";
import FlowBuilder from "./flow-builder/FlowBuilder.jsx";

let _root = null;

export function mountFlowBuilder() {
  const el = document.getElementById("flowBuilderRoot");
  if (!el) return;
  if (_root) return;       // already mounted, do nothing
  _root = createRoot(el);
  _root.render(React.createElement(FlowBuilder));
}

// Allow the inline section-loader hook in index.html to call this by
// name without an import.
window.loadFlowBuilderSection = mountFlowBuilder;
