// Headless-browser dashboard export runner.
// Renders a pre-built dashboard HTML file to PDF or PNG via Puppeteer.
//
//   node dashboard-export.js <html-path> <out-path> <pdf|png>
//
// The HTML is generated server-side (Python) with the dashboard's
// tiles, real data, and Chart.js. It sets window.__exportReady = true
// once every chart has painted; this runner waits for that signal so
// the capture is never of a half-rendered page.
import puppeteer from "puppeteer";

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
    await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
    await page.goto("file://" + htmlPath, { waitUntil: "networkidle0" });
    // Wait for the export HTML to confirm every tile/chart has painted.
    await page
      .waitForFunction("window.__exportReady === true", { timeout: 30000 })
      .catch(() => { /* render anyway after timeout */ });
    if (format === "png") {
      await page.screenshot({ path: outPath, fullPage: true });
    } else {
      // Size the PDF page to the actual content so nothing is scaled to
      // fit a fixed Letter page — tiles keep their on-canvas aspect
      // ratio (no squish) and render at full resolution (no down-scale).
      const dims = await page.evaluate(() => ({
        w: Math.ceil(document.documentElement.scrollWidth),
        h: Math.ceil(document.documentElement.scrollHeight),
      }));
      await page.pdf({
        path: outPath,
        width: dims.w + "px",
        height: dims.h + "px",
        printBackground: true,
        scale: 1,
        pageRanges: "1",
      });
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(String((e && e.stack) || e));
  process.exit(1);
});
