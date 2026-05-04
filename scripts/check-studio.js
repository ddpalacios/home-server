// Sanity check for the Studio render pipeline.
// Spawns headless Chromium, loads about:blank, screenshots, asserts the PNG
// is valid. Run after scripts/setup-studio.sh on each host.

const path = require("path");
const fs = require("fs");

(async () => {
  // Puppeteer lives under web/node_modules (the setup script installs it
  // there to share the existing npm workspace). Resolve from that path
  // explicitly instead of relying on the default cwd-based search.
  const webNodeModules = path.resolve(__dirname, "..", "web", "node_modules");
  let puppeteer;
  try {
    puppeteer = require(require.resolve("puppeteer", { paths: [webNodeModules] }));
  } catch (err) {
    console.error("FAIL: puppeteer not installed under web/node_modules.");
    console.error("Run scripts/setup-studio.sh first.");
    console.error("Detail:", err.message);
    process.exit(1);
  }
  process.env.PUPPETEER_CACHE_DIR =
    process.env.PUPPETEER_CACHE_DIR ||
    path.resolve(__dirname, "..", ".puppeteer-cache");

  const t0 = Date.now();
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920 });
    await page.setContent(
      '<!doctype html><html><head><style>' +
      'body{margin:0;background:#1d9e75;color:#E1F5EE;font-family:sans-serif}' +
      '.b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:140px;font-weight:900}' +
      '</style></head><body><div class="b">OK</div></body></html>'
    );
    const buf = await page.screenshot({ type: "png" });
    if (!buf || buf.length < 1000) {
      console.error("FAIL: screenshot empty or tiny.");
      process.exit(1);
    }
    const out = path.resolve(__dirname, "..", "studio-assets", "check.png");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, buf);
    console.log(`OK: rendered ${buf.length} bytes in ${Date.now() - t0}ms → ${out}`);
  } catch (err) {
    console.error("FAIL:", err.message || err);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
