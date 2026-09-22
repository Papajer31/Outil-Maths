// Run: node --test --test-isolation=none _dev/regression-tests/personal-activity-quiz-header.test.mjs
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
const screenshotDirectory = path.join(os.tmpdir(), "portail-personal-activity-quiz-header");
let server;
let browser;
let baseUrl;

before(async () => {
  await fs.mkdir(screenshotDirectory, { recursive:true });
  server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(`<!doctype html>
        <html lang="fr">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Éditeur d’activité quiz</title>
            <link rel="stylesheet" href="/css/base.css">
            <link rel="stylesheet" href="/css/ui.css">
            <link rel="stylesheet" href="/teacher/css/common.css">
            <link rel="stylesheet" href="/teacher/css/dashboard.css">
            <link rel="stylesheet" href="/teacher/css/config-widgets.css">
            <link rel="stylesheet" href="/teacher/css/quiz-workshop.css">
          </head>
          <body>
            <main id="personalActivityEditorView" class="dashboard-content-view dashboard-explorer-view">
              <div id="personalActivityEditorHeader" class="dashboard-config-header dashboard-explorer-header"></div>
              <div id="personalActivityEditorBody" class="dashboard-content-scroll dashboard-config-list"></div>
            </main>
          </body>
        </html>`);
      return;
    }

    const filename = path.resolve(root, `.${decodeURIComponent(pathname)}`);
    if (!filename.startsWith(`${root}${path.sep}`) && filename !== root) {
      response.writeHead(403).end();
      return;
    }
    try {
      const content = await fs.readFile(filename);
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
  console.log(`Personal-activity quiz screenshots: ${screenshotDirectory}`);
});

test("quiz source information and edit action live in the activity header", async (t) => {
  const page = await browser.newPage({ viewport:{ width:1920, height:1080 } });
  t.after(() => page.close());
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], "No uncaught browser errors"));
  await page.goto(baseUrl, { waitUntil:"networkidle" });

  await page.evaluate(async () => {
    window.supabase = { createClient:() => ({}) };
    const { startMaterialIconHydration } = await import("/shared/material-icons-svg.js");
    const { createPersonalActivityEditorController } = await import("/teacher/js/dashboard/personal-activity-editor-view.js");
    startMaterialIconHydration();
    const sourceQuiz = {
      id:"quiz-rituel",
      title:"Rituel de calcul mental",
      questions:[{ id:"question-1", variants:[] }]
    };
    const controller = createPersonalActivityEditorController({
      view:document.querySelector("#personalActivityEditorView"),
      header:document.querySelector("#personalActivityEditorHeader"),
      body:document.querySelector("#personalActivityEditorBody"),
      getCurrentTeacherSpace:() => ({ id:42 }),
      getIsSuperAdmin:() => false,
      getQuizForSpace:async () => structuredClone(sourceQuiz),
      saveTeacherActivityForSpace:async (_spaceId, activity) => ({ ...structuredClone(activity), id:"activity-1" }),
      onEditContent:() => {},
      showToast:() => {}
    });
    await controller.open({
      id:"activity-1",
      title:"Rituel de calcul mental",
      activity_type:"quiz",
      difficulty_mode:"adaptive",
      source_quiz_id:"quiz-rituel",
      config_json:{ tool_id:"quiz" },
      levels_json:{}
    });
  });

  await page.getByRole("button", { name:"Modifier le contenu" }).waitFor();
  await page.waitForFunction(() => !document.querySelector("#personalActivityToolSettingsHost .dashboard-activity-empty-state"));

  assert.equal(await page.locator(".personal-activity-source-strip-wrap").count(), 0);
  assert.equal(await page.locator(".personal-activity-source-strip").count(), 0);
  assert.equal(await page.locator(".personal-activity-editor-header-center .personal-activity-editor-tool-name").textContent(), "Rituel de calcul mental");
  assert.equal(await page.getByText("1 question", { exact:true }).count(), 0);
  assert.equal(await page.getByText("Modifier le contenu", { exact:true }).count(), 0);
  assert.equal(
    await page.getByRole("button", { name:"Modifier le contenu" }).evaluate((button) => button.closest("#personalActivityEditorHeader") != null),
    true
  );

  const layout = await page.evaluate(() => ({
    viewportWidth:window.innerWidth,
    documentWidth:document.documentElement.scrollWidth,
    headerHeight:document.querySelector("#personalActivityEditorHeader")?.getBoundingClientRect().height,
    bodyTop:document.querySelector("#personalActivityEditorBody")?.getBoundingClientRect().top
  }));
  assert.equal(layout.documentWidth, layout.viewportWidth);
  assert.equal(Math.round(layout.headerHeight), 72);
  assert.equal(Math.round(layout.bodyTop), 72);
  await page.screenshot({ path:path.join(screenshotDirectory, "adaptive-quiz.png") });
});

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
    ".webp":"image/webp",
    ".woff":"font/woff",
    ".woff2":"font/woff2"
  })[extension] || "application/octet-stream";
}
