// Dashboard entry bundle.
// In v1, this only proves the wiring works — confirms the C server
// is serving the bundle and that ES module imports are resolving.
// Future: route-specific code splits via dynamic import().

console.log("[dashboard-bundle] main.js loaded via Vite");

// Expose a tiny global so the existing inline JS can detect that the
// bundle is in fact loading. Useful during the migration period when
// some logic will live in the bundle and some still inline.
window.__dashboardBundle = {
  loadedAt: new Date().toISOString(),
  version: 1,
};

// Stub for future dynamic route loaders. Today returns null so existing
// inline route handlers keep working. As routes get migrated into the
// bundle, this map will gain entries.
const ROUTE_MODULE_LOADERS = {
  // "leads": () => import("./routes/leads.js"),
  // "campaigns": () => import("./routes/campaigns.js"),
};

window.__dashboardLoadRouteModule = async function (route) {
  const loader = ROUTE_MODULE_LOADERS[route];
  if (!loader) return null;
  try {
    return await loader();
  } catch (err) {
    console.warn(`[dashboard-bundle] failed to load route ${route}:`, err);
    return null;
  }
};
