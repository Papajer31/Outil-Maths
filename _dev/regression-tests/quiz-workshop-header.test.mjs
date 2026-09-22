// Run: node --test --test-isolation=none _dev/regression-tests/quiz-workshop-header.test.mjs
// Screenshots are written to the operating system's temporary directory.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../responsive-audit/node_modules/playwright/index.mjs";

const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const screenshotDirectory = path.join(os.tmpdir(), "portail-quiz-workshop-header");
let server;
let browser;
let baseUrl;

before(async () => {
  await fs.mkdir(screenshotDirectory, { recursive:true });
  server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const requestedPath = pathname === "/" ? "/teacher/dashboard.html" : pathname;
    const filename = path.resolve(root, `.${decodeURIComponent(requestedPath)}`);
    if (!filename.startsWith(`${root}${path.sep}`) && filename !== root) {
      response.writeHead(403).end();
      return;
    }

    try {
      let content = await fs.readFile(filename);
      if (filename.endsWith(`${path.sep}teacher${path.sep}dashboard.html`)) {
        content = Buffer.from(content.toString("utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ""));
      }
      response.setHeader("Content-Type", contentTypeFor(filename));
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless:true });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  console.log(`Quiz-workshop screenshots: ${screenshotDirectory}`);
});

test("quiz editor header follows the activity editor structure", async (t) => {
  const page = await openWorkshopPage(t, { width:1600, height:900 });
  const layout = await page.evaluate(() => {
    const rect = (selector) => {
      const bounds = document.querySelector(selector)?.getBoundingClientRect();
      return bounds ? { left:bounds.left, right:bounds.right, top:bounds.top, height:bounds.height } : null;
    };
    const header = document.querySelector(".quiz-workshop-header");
    return {
      documentWidth:document.documentElement.scrollWidth,
      viewportWidth:window.innerWidth,
      header:rect(".quiz-workshop-header"),
      columns:getComputedStyle(header).gridTemplateColumns,
      display:getComputedStyle(header).display,
      computedHeight:getComputedStyle(header).height,
      minHeight:getComputedStyle(header).minHeight,
      padding:getComputedStyle(header).padding,
      boxSizing:getComputedStyle(header).boxSizing,
      titleParent:document.querySelector("#quizWorkshopTitleInput")?.parentElement?.className,
      addParent:document.querySelector("#btnQuizAddQuestion")?.parentElement?.className,
      testButton:rect("#btnQuizTest"),
      saveButton:rect("#btnQuizSave")
    };
  });

  await page.screenshot({ path:path.join(screenshotDirectory, "desktop.png") });
  assert.equal(layout.documentWidth, layout.viewportWidth);
  assert.equal(Math.round(layout.header.height), 72, JSON.stringify(layout));
  assert.equal(Math.round(layout.header.top), 0);
  assert.equal(layout.columns.split(" ").length, 3);
  assert.match(layout.titleParent, /quiz-workshop-title-field/);
  assert.match(layout.addParent, /quiz-workshop-board-head/);
  assert.ok(layout.testButton.right <= layout.saveButton.left, "Tester should appear before Enregistrer");
  assert.equal(await page.locator(".quiz-workshop-editor-name").textContent(), "Atelier de quiz");
  assert.equal(await page.locator(".dashboard-mini-pill", { hasText:"Quiz" }).isVisible(), true);
});

test("quiz editor header remains usable on a narrow viewport", async (t) => {
  const page = await openWorkshopPage(t, { width:820, height:900 });
  const layout = await page.evaluate(() => ({
    documentWidth:document.documentElement.scrollWidth,
    viewportWidth:window.innerWidth,
    columns:getComputedStyle(document.querySelector(".quiz-workshop-header")).gridTemplateColumns,
    titleWidth:document.querySelector("#quizWorkshopTitleInput")?.getBoundingClientRect().width
  }));

  assert.equal(layout.documentWidth, layout.viewportWidth);
  assert.ok(!layout.columns.includes(" "), `Expected one header column, got ${layout.columns}`);
  assert.ok(layout.titleWidth > 200, `Expected a usable title field, got ${layout.titleWidth}px`);
  await page.screenshot({ path:path.join(screenshotDirectory, "narrow.png") });
});

async function openWorkshopPage(t, viewport) {
  const page = await browser.newPage({ viewport });
  t.after(() => page.close());
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], "No uncaught browser errors"));
  await page.goto(`${baseUrl}/teacher/dashboard.html`, { waitUntil:"networkidle" });
  await page.evaluate(async () => {
    const workshop = document.querySelector("#quizWorkshopView");
    const wrapper = document.createElement("main");
    wrapper.id = "quizView";
    wrapper.style.width = "100vw";
    wrapper.style.height = "100vh";
    wrapper.append(workshop);
    document.body.replaceChildren(wrapper);
    workshop.classList.remove("hidden");
    document.documentElement.style.height = "100%";
    document.body.style.height = "100%";
    document.body.style.margin = "0";
    const { startMaterialIconHydration } = await import("/shared/material-icons-svg.js");
    startMaterialIconHydration();
  });
  await page.locator(".quiz-workshop-header").waitFor();
  return page;
}

function contentTypeFor(filename) {
  const extension = path.extname(filename).toLowerCase();
  return ({
    ".css":"text/css; charset=utf-8",
    ".html":"text/html; charset=utf-8",
    ".js":"text/javascript; charset=utf-8",
    ".mjs":"text/javascript; charset=utf-8",
    ".otf":"font/otf",
    ".svg":"image/svg+xml",
    ".ttf":"font/ttf",
    ".woff":"font/woff",
    ".woff2":"font/woff2"
  })[extension] || "application/octet-stream";
}
