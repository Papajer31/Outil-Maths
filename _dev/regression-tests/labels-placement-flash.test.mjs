// Run: node --test _dev/regression-tests/labels-placement-flash.test.mjs
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../responsive-audit/node_modules/playwright/index.mjs";

const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
let server;
let browser;
let baseUrl;

before(async () => {
  server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(`<!doctype html>
        <link rel="stylesheet" href="/css/base.css">
        <link rel="stylesheet" href="/teacher/css/dashboard.css">
        <link rel="stylesheet" href="/teacher/css/config-widgets.css">
        <link rel="stylesheet" href="/shared/color-picker.css">
        <link rel="stylesheet" href="/teacher/css/teacher-tools.css">
        <link rel="stylesheet" href="/teacher/css/teacher-tools-projector.css">
        <style>body{margin:0}#stage{position:relative;width:960px;height:540px}</style>
        <section id="stage" class="ttp-stage"><div id="projection" class="ttp-app-host"></div></section>
        <div id="controls"></div>`);
      return;
    }
    const filename = path.resolve(root, `.${decodeURIComponent(pathname)}`);
    if (!filename.startsWith(root + path.sep)) return response.writeHead(403).end();
    try {
      response.setHeader("Content-Type", pathname.endsWith(".js") ? "text/javascript" : pathname.endsWith(".css") ? "text/css" : "application/octet-stream");
      response.end(await fs.readFile(filename));
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
});

for (const fontFamily of ["system", "belleallure"]) {
  for (const buttonId of ["ttLabelsAlign", "ttLabelsRandomPositions"]) {
    test(`${buttonId} keeps ${fontFamily} labels in place until measured placement is ready`, async (t) => {
      const page = await browser.newPage({ viewport:{ width:1280, height:900 } });
      t.after(() => page.close());
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => new URL(route.request().url()).origin === baseUrl ? route.continue() : route.abort());
      await page.goto(baseUrl);
      await page.evaluate(async (font) => {
        const { createLabelsControlPanel } = await import("/teacher/js/teacher-tools/apps/labels/control.js");
        const { renderLabelsProjector } = await import("/teacher/js/teacher-tools/apps/labels/projector.js");
        const { applyLabelsAction, normalizeLabelsState } = await import("/teacher/js/teacher-tools/apps/labels/model.js");
        window.widget = { state:normalizeLabelsState({
          items:[
            { id:"one", text:"Le chat", x:0.52, y:0.25 },
            { id:"two", text:"Une étiquette§sur deux lignes", x:0.07, y:0.60 },
            { id:"three", text:"mot en *gras*", x:0.55, y:0.72 },
            { id:"hidden", text:"Masquée", x:0.31, y:0.41, visible:false }
          ],
          selectedIds:["one"],
          style:{ fontFamily:font, fontSize:30 }
        }) };
        window.project = () => renderLabelsProjector({
          host:document.querySelector("#projection"), state:window.widget.state,
          sendAction:(action, payload) => { window.measured = { action, payload }; }
        });
        let panel;
        panel = createLabelsControlPanel({
          host:document.querySelector("#controls"), getWidget:() => window.widget,
          updateWidget:(patch, options) => {
            window.widget = { ...window.widget, ...patch };
            if (options.renderPanel) panel.render();
            window.project();
          }
        });
        window.finishPlacement = () => {
          window.widget = { ...window.widget, ...applyLabelsAction({ ...window.measured, state:window.widget.state }).patch };
          window.project();
        };
        window.project();
        await document.fonts.ready;
      }, fontFamily);
      const positions = () => page.locator("#projection [data-label-id]").evaluateAll((labels) => labels.map((label) => ({
        id:label.dataset.labelId, left:label.style.left, top:label.style.top
      })));
      const initial = await positions();
      const hidden = await page.evaluate(() => window.widget.state.items.find((item) => item.id === "hidden"));
      await page.locator(`#${buttonId}`).click();
      assert.deepEqual(await positions(), initial, "No temporary estimated placement before the measured result");
      await page.waitForFunction(() => Boolean(window.measured));
      assert.deepEqual(await positions(), initial, "Waiting for the synchronized result must keep the original positions");
      await page.evaluate(() => window.finishPlacement());
      assert.notDeepEqual(await positions(), initial, "The final layout changes the positions");
      assert.equal(await page.evaluate(() => window.widget.state.placementRequest), null);
      assert.deepEqual(await page.evaluate(() => window.widget.state.items.find((item) => item.id === "hidden")), hidden);
      assert.deepEqual(await page.evaluate(() => window.widget.state.selectedIds), ["one"]);
      const rectangles = await page.locator("#projection [data-label-id]").evaluateAll((labels) => labels.map((label) => {
        const rect = label.getBoundingClientRect();
        const stage = document.querySelector("#stage").getBoundingClientRect();
        return { left:rect.left-stage.left, top:rect.top-stage.top, right:rect.right-stage.left, bottom:rect.bottom-stage.top };
      }));
      for (const rect of rectangles) {
        assert.ok(rect.left >= -0.1 && rect.top >= -0.1 && rect.right <= 960.1 && rect.bottom <= 540.1, "Final labels stay inside the stage");
      }
      for (let i = 0; i < rectangles.length; i += 1) {
        for (let j = i + 1; j < rectangles.length; j += 1) {
          const a = rectangles[i];
          const b = rectangles[j];
          assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, "Final labels do not overlap");
        }
      }
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.evaluate(() => window.widget.state.placementRequest), null);
      assert.deepEqual(errors, []);
    });
  }
}
