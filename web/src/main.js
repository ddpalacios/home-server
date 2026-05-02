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

// Dynamic route loaders. Each entry is a function that returns a promise
// of the route module. Routes are loaded lazily on first navigation.
const ROUTE_MODULE_LOADERS = {
  // "leads": () => import("./routes/leads.js"),
  "campaigns": () => import("./routes/campaigns.js"),
  "replies":   () => import("./routes/replies.js"),
  "pipeline":  () => import("./routes/pipeline.js"),
};

window.__dashboardLoadRouteModule = async function (route) {
  const loader = ROUTE_MODULE_LOADERS[route];
  if (!loader) return null;
  try {
    const mod = await loader();
    if (mod && typeof mod.init === "function") {
      try { mod.init(); } catch (err) {
        console.warn(`[dashboard-bundle] init failed for ${route}:`, err);
      }
    }
    return mod;
  } catch (err) {
    console.warn(`[dashboard-bundle] failed to load route ${route}:`, err);
    return null;
  }
};
