import { defineConfig } from "vite";
import path from "node:path";

// Build output goes adjacent to the dashboard's Jinja template so the
// C server can serve it via its existing template directory routing.
const OUT_DIR = path.resolve(__dirname, "../templates/AIdashboard/dist");

export default defineConfig({
  // Project root is the web/ folder.
  root: __dirname,

  // In dev, Vite serves modules from /; in prod, the C server serves
  // from /dashboard/dist/. The base path is set at build time so generated
  // chunk URLs resolve correctly.
  base: "/dashboard/dist/",

  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: path.resolve(__dirname, "src/main.js"),
      output: {
        // Use a stable, hash-free filename so the Jinja template can
        // reference it directly without reading the manifest.
        // Future: switch to hashed names + manifest lookup once the
        // template has a manifest-reading helper.
        entryFileNames: "[name].js",
        chunkFileNames: "[name]-[hash].js",
        assetFileNames: "[name]-[hash][extname]",
      },
    },
  },

  server: {
    port: 5173,
    strictPort: true,
    // Allow the dashboard (https://127.0.0.1:9030) to fetch dev modules
    // from this dev server.
    cors: true,
  },
});
