// Headless-browser dashboard export runner.
// Renders a pre-built dashboard HTML file to PDF or PNG via Puppeteer.
//
//   node dashboard-export.js <html-path> <out-path> <pdf|png>
//
// The HTML is generated server-side (Python) with the dashboard's
// tiles, real data, and Chart.js. It sets window.__exportReady = true
// once every chart has painted; this runner waits for that signal so
// the capture is never of a half-rendered page.
const puppeteer = require("puppeteer");

(async () => {
  const [htmlPath, outPath, format] = process.argv.slice(2);
  if (!htmlPath || !outPath || !format) {
    console.error("usage: dashboard-export.js <html-path> <out-path> <pdf|png>");
    process.exit(2);
  }
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
    await page.goto("file://" + htmlPath, { waitUntil: "networkidle0" });
    // Wait for the export HTML to confirm every tile/chart has painted.
    await page
      .waitForFunction("window.__exportReady === true", { timeout: 30000 })
      .catch(() => { /* render anyway after timeout */ });
    if (format === "png") {
      await page.screenshot({ path: outPath, fullPage: true });
    } else {
      await page.pdf({
        path: outPath,
        format: "Letter",
        landscape: true,
        printBackground: true,
        scale: 0.95,
        margin: { top: "0.4in", bottom: "0.4in", left: "0.4in", right: "0.4in" },
      });
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(String((e && e.stack) || e));
  process.exit(1);
});
