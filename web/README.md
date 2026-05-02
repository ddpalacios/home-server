# dashboard-web

Vite project for the dashboard's JS bundles.

## Dev workflow

```
cd web
npm run build          # one-shot build
npm run build -- --watch   # rebuild on save
npm run dev            # full Vite dev server with HMR (port 5173)
```

Build output writes to `../templates/AIdashboard/dist/`. The C server
serves these at `/dashboard/dist/*`.

## Adding a new route bundle

1. Add `src/routes/<route>.js` with the route's logic.
2. Register it in `src/main.js`'s `ROUTE_MODULE_LOADERS` map.
3. Run `npm run build`.
4. The dashboard's existing route handler can call
   `window.__dashboardLoadRouteModule(route)` to lazy-load it.
