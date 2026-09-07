import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";
import { chromium } from "../responsive-audit/node_modules/playwright/index.mjs";

// Real UI modules; no account, database, or external network is used.
const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = `<!doctype html><html><body><div id="host"></div>
<script type="module">
  import { createTeacherToolsViewController } from "/teacher/js/dashboard/teacher-tools-view.js";
  window.controller = createTeacherToolsViewController({
    host: document.getElementById("host"),
    getCurrentTeacherSpace: () => ({ id: "regression-test" }),
    getCurrentStudents: () => [],
    showToast: (message) => { window.lastToast = message; }
  });
  window.controller.render();
  window.ready = true;
</script></body></html>`;
const server = createServer(async (req, res) => {
  if (req.url === "/fixture") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(fixture);
    return;
  }
  const path = resolve(root, "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname));
  if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(path);
    res.setHeader("Content-Type", extname(path) === ".js" ? "text/javascript; charset=utf-8" : "application/octet-stream");
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
let failures = 0;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1600 } });
  await context.route("**/*", (route) => route.request().url().startsWith(origin + "/") ? route.continue() : route.abort());
  const cases = [
    { name: "Labels text survives font change", tool: "labels", field: "#ttLabelsText", value: "Mon brouillon non validé", act: (page) => page.locator("#ttLabelsFontFamily").selectOption("system") },
    { name: "Labels text survives shadow change", tool: "labels", field: "#ttLabelsText", value: "Texte avec réglages avancés", act: (page) => page.locator("#ttLabelsShadow").click() },
    { name: "Labels text survives scene lock", tool: "labels", field: "#ttLabelsText", value: "Brouillon conservé", act: (page) => page.locator("#btnTeacherToolsToggleSceneLock").click() },
    { name: "Image URL survives aspect ratio change", tool: "image", field: "#ttImageUrlInput", value: "https://example.invalid/pending.png", act: (page) => page.locator("#ttImagePreserveProportions").click() },
    { name: "Multiple images URL survives mode change", tool: "multi-images", field: "#ttMultiImagesUrlInput", value: "https://example.invalid/pending.png", act: (page) => page.locator('[data-multi-images-mode="board"]').click() },
    { name: "Background URL survives preset change", tool: null, field: "#ttBackgroundUrlInput", value: "https://example.invalid/pending.png", act: (page) => page.locator("[data-background-choice]").first().click() }
  ];
  for (const testCase of cases) {
    const page = await context.newPage();
    const errors = [];
    let navigations = 0;
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigations++; });
    try {
      await page.goto(origin + "/fixture");
      await page.waitForFunction(() => window.ready, null, { timeout: 10000 });
      if (testCase.tool) {
        await page.locator("#ttOpenWidgetPicker").click();
        await page.locator(`[data-teacher-tool-pick="${testCase.tool}"]`).click();
      }
      await page.locator(testCase.field).fill(testCase.value);
      await testCase.act(page);
      assert.equal(await page.locator(testCase.field).inputValue(), testCase.value);
      assert.equal(navigations, 1, "The document must not navigate");
      assert.deepEqual(errors, []);
      console.log("PASS " + testCase.name);
    } catch (error) {
      failures++;
      console.error("FAIL " + testCase.name + ": " + error.message + (errors.length ? "\nPage errors: " + errors.join("; ") : ""));
    } finally { await page.close(); }
  }
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
if (failures) process.exitCode = 1;
