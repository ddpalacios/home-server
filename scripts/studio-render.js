// Headless-render worker for the CTA Studio.
//
// Stdin:  JSON design payload + render options (one line, EOF-terminated):
//           { "design": {…}, "format": "image" | "video" }
//         Backwards-compat: bare design JSON is treated as { format:image }.
// Stdout: For format=image → PNG bytes (raw binary).
//         For format=video → MP4 bytes (raw binary).
// Stderr: status / error text.
//
// Invoked by Flask's POST /api/studio/render via subprocess. One node
// process per render — bundled Chrome stays warm inside the subprocess
// only for its lifetime (~1-2s for image, ~10-30s for video). For
// volume the right move is a long-running daemon; spawn-per-request
// keeps the surface small for v1.

const path = require("path");
const fs = require("fs");

const REPO_ROOT = path.resolve(__dirname, "..");
const TEMPLATE_PATH = path.resolve(
  REPO_ROOT, "templates", "AIdashboard", "studio_render.html");
const RENDER_JS_PATH = path.resolve(
  REPO_ROOT, "templates", "AIdashboard", "studio_render.js");

(async () => {
  // Read the JSON payload from stdin.
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    console.error("bad_json:", err.message);
    process.exit(64);
  }
  // Backwards-compat: a bare design (no `design` wrapper) is image render.
  let design, format;
  if (payload && payload.design) {
    design = payload.design;
    format = (payload.format || "image").toLowerCase();
  } else {
    design = payload;
    format = "image";
  }
  if (format !== "image" && format !== "video") {
    console.error("bad_format:", format);
    process.exit(64);
  }

  // Resolve Puppeteer from web/node_modules and trust the .puppeteerrc.cjs
  // there for cacheDirectory.
  const webNodeModules = path.resolve(REPO_ROOT, "web", "node_modules");
  let puppeteer;
  try {
    puppeteer = require(require.resolve("puppeteer", { paths: [webNodeModules] }));
  } catch (err) {
    console.error("puppeteer_missing:", err.message);
    process.exit(65);
  }

  // Load the template HTML and patch it to inline the render module so
  // Puppeteer can render from `file://` without serving from Flask.
  const templateHtml = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const renderJs = fs.readFileSync(RENDER_JS_PATH, "utf8");
  // Replace the external <script src="…/render.js"> with an inline tag.
  const inlinedHtml = templateHtml.replace(
    /<script src="[^"]*render\.js"><\/script>/,
    `<script>${renderJs}</script>`
  );

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        // file:// URLs need this to load font files via @font-face local() / url()
        "--allow-file-access-from-files",
      ],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });

    // Load template via data: URL so file:// font @font-face stays valid.
    await page.setContent(inlinedHtml, { waitUntil: "load" });
    // Pass design into the page and wait for it to fully render.
    await page.evaluate((d) => { window.__designJson = d; }, design);
    await page.evaluate(() => window.__renderForCapture());
    // Defensive: give fonts another tick to load.
    await page.evaluate(() => document.fonts && document.fonts.ready);

    if (format === "image") {
      // Single-frame PNG (Phase 1 path).
      const buf = await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width: 1080, height: 1920 },
        omitBackground: false,
      });
      process.stdout.write(buf);
      await browser.close();
      process.exit(0);
    }

    // ── format === "video" ──────────────────────────────────────────
    //
    // Capture frames at 30 fps for the design's duration_seconds (1–5).
    // For each frame: ask the page to evaluate the design at time t and
    // wait one rAF, then screenshot. Save frames to a temp dir, then
    // hand them to ffmpeg.
    const fps = 30;
    const dur = Math.max(1, Math.min(5, Number(design.duration_seconds) || 3));
    const totalFrames = Math.round(fps * dur);
    const os = require("os");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-frames-"));
    console.error("video_capture:", { fps, dur, totalFrames, tmpDir });

    try {
      for (let i = 0; i < totalFrames; i++) {
        const t = i / fps;
        await page.evaluate((tSec) => window.__renderFrameAtTime(tSec), t);
        const framePath = path.join(tmpDir,
          "f_" + String(i).padStart(5, "0") + ".png");
        await page.screenshot({
          type: "png",
          clip: { x: 0, y: 0, width: 1080, height: 1920 },
          omitBackground: false,
          path: framePath,
        });
      }
      await browser.close();
      browser = null;

      // Combine frames with ffmpeg.
      const outPath = path.join(tmpDir, "out.mp4");
      const { spawnSync } = require("child_process");
      const ff = spawnSync("ffmpeg", [
        "-y",
        "-framerate", String(fps),
        "-i", path.join(tmpDir, "f_%05d.png"),
        "-c:v", "libx264",
        "-preset", "fast",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-r", String(fps),
        outPath,
      ], { stdio: ["ignore", "ignore", "pipe"] });
      if (ff.status !== 0) {
        console.error("ffmpeg_failed:",
          ff.stderr ? ff.stderr.toString().slice(-600) : "rc=" + ff.status);
        process.exit(67);
      }
      const buf = fs.readFileSync(outPath);
      process.stdout.write(buf);
      // Cleanup frames.
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
      process.exit(0);
    } catch (err) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
      throw err;
    }
  } catch (err) {
    console.error("render_failed:", err.message || String(err));
    if (browser) await browser.close().catch(() => {});
    process.exit(66);
  }
})();
