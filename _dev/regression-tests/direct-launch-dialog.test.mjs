// Run: node --test _dev/regression-tests/direct-launch-dialog.test.mjs
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
const screenshotDirectory = path.join(os.tmpdir(), "portail-direct-launch-visual");
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
            <title>Aperçu du partage par QR code</title>
            <link rel="stylesheet" href="/css/base.css">
            <link rel="stylesheet" href="/css/ui.css">
            <link rel="stylesheet" href="/teacher/css/common.css">
            <link rel="stylesheet" href="/teacher/css/dashboard.css">
            <link rel="stylesheet" href="/teacher/css/config-widgets.css">
          </head>
          <body>
            <button id="previewOrigin" type="button">Ouvrir l’aperçu</button>
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
  console.log(`Direct-launch screenshots: ${screenshotDirectory}`);
});

test("desktop overlay renders and updates its launch settings", async (t) => {
  const page = await openPreviewPage(t, { width:1440, height:900 });
  await mountDialog(page, { mode:"success" });
  await waitForReadyDialog(page);

  assert.match(await page.locator("#directLaunchTitle").textContent(), /Accès par QR code/);
  assert.equal(await page.locator(".direct-launch-resource-title").textContent(), "Calcul mental — additions jusqu’à 100");
  assert.equal(await page.locator("[data-direct-launch-qr] canvas").count(), 1);
  assert.equal(await page.locator('[data-action="download-qr"]').isEnabled(), true);
  assert.equal(await page.locator('[data-action="copy-link"]').isVisible(), true);
  assert.equal(await page.getByText("À scanner par les élèves", { exact:true }).count(), 0);
  assert.equal(await page.getByText("Scannez pour commencer", { exact:true }).count(), 0);
  assert.equal(await page.getByText("Le lien ouvre directement la ressource.", { exact:true }).count(), 0);
  assert.equal(await page.getByText("Mise à jour automatique", { exact:true }).count(), 0);
  assert.equal(await page.getByText("Toute modification des réglages met immédiatement cet accès à jour.", { exact:true }).count(), 0);
  assert.equal(await page.getByText("Terminer", { exact:true }).count(), 0);
  assert.equal(await page.getByText("Lien de l’activité", { exact:true }).isVisible(), true);
  assert.equal(await page.locator("#directLaunchExecutionValue").getAttribute("type"), "text");

  const stepperOrder = await page.evaluate(() => {
    const position = (selector) => document.querySelector(selector)?.getBoundingClientRect();
    const minus = position('[data-stepper-direction="-1"]');
    const input = position("#directLaunchExecutionValue");
    const plus = position('[data-stepper-direction="1"]');
    return { minusRight:minus?.right, inputLeft:input?.left, inputRight:input?.right, plusLeft:plus?.left };
  });
  assert.ok(stepperOrder.minusRight <= stepperOrder.inputLeft, "The minus button should be left of the value");
  assert.ok(stepperOrder.inputRight <= stepperOrder.plusLeft, "The plus button should be right of the value");

  await page.locator('[data-stepper-direction="1"]').click();
  await waitForCallCount(page, 2);
  assert.equal(await page.locator("#directLaunchExecutionValue").inputValue(), "6");
  assert.equal(await page.evaluate(() => window.__directLaunchCalls.at(-1).execution_limit_value), 6);

  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-action="download-qr"]').click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "calcul-mental-additions-jusqu-a-100-qr.png");

  await page.locator("#directLaunchDifficulty").selectOption("4");
  await waitForCallCount(page, 3);
  await page.locator("#directLaunchExecutionMode").selectOption("time");
  await waitForCallCount(page, 4);
  await page.locator("#directLaunchExecutionValue").fill("12");
  await page.locator("#directLaunchExecutionValue").press("Tab");
  await waitForCallCount(page, 5);
  await waitForReadyDialog(page);

  const lastPayload = await page.evaluate(() => window.__directLaunchCalls.at(-1));
  assert.equal(lastPayload.difficulty_mode, "fixed");
  assert.equal(lastPayload.difficulty_level, 4);
  assert.equal(lastPayload.execution_limit_mode, "time");
  assert.equal(lastPayload.execution_limit_value, 720);

  const cardBox = await page.locator(".direct-launch-card").boundingBox();
  assert.ok(cardBox.width <= 880.5, `Expected card width <= 880px, got ${cardBox.width}`);
  assert.ok(cardBox.height <= 760.5, `Expected card height <= 760px, got ${cardBox.height}`);
  await page.screenshot({ path:path.join(screenshotDirectory, "success-desktop.png") });

  await page.locator(".direct-launch-close").click();
  assert.equal(await page.locator(".direct-launch-dialog").count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement?.id), "previewOrigin");
});

test("mobile overlay fits without horizontal overflow", async (t) => {
  const page = await openPreviewPage(t, { width:390, height:844 });
  await mountDialog(page, { mode:"success" });
  await waitForReadyDialog(page);

  const layout = await page.evaluate(() => ({
    viewportWidth:window.innerWidth,
    documentWidth:document.documentElement.scrollWidth,
    cardWidth:document.querySelector(".direct-launch-card")?.getBoundingClientRect().width,
    gridColumns:getComputedStyle(document.querySelector(".direct-launch-passation-grid")).gridTemplateColumns
  }));
  assert.equal(layout.documentWidth, layout.viewportWidth);
  assert.equal(Math.round(layout.cardWidth), 390);
  assert.ok(!layout.gridColumns.includes(" "), `Expected one settings column, got ${layout.gridColumns}`);
  await page.screenshot({ path:path.join(screenshotDirectory, "success-mobile.png") });

  await page.locator(".direct-launch-body").evaluate((body) => {
    body.scrollTop = body.scrollHeight;
  });
  const scrolledLayout = await page.evaluate(() => {
    const box = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect ? { top:rect.top, bottom:rect.bottom, height:rect.height } : null;
    };
    const body = document.querySelector(".direct-launch-body");
    return {
      pageScrollY:window.scrollY,
      header:box(".direct-launch-header"),
      card:box(".direct-launch-card"),
      body:box(".direct-launch-body"),
      link:box(".direct-launch-url-row"),
      bodyScrollTop:body?.scrollTop,
      bodyScrollHeight:body?.scrollHeight,
      bodyClientHeight:body?.clientHeight
    };
  });
  assert.equal(scrolledLayout.pageScrollY, 0);
  assert.equal(Math.round(scrolledLayout.header.top), 0);
  assert.ok(scrolledLayout.card.bottom <= 844, "The dialog should stay within the mobile viewport");
  if (scrolledLayout.bodyScrollHeight > scrolledLayout.bodyClientHeight) {
    assert.ok(scrolledLayout.bodyScrollTop > 0, "The mobile content area should scroll independently");
  }
  assert.ok(scrolledLayout.link.top >= scrolledLayout.body.top, "The link row should be reachable inside the mobile scroll area");
  assert.ok(scrolledLayout.link.bottom <= scrolledLayout.body.bottom, "The link row should be visible in the mobile scroll area");
  await page.screenshot({ path:path.join(screenshotDirectory, "success-mobile-bottom.png") });
});

test("loading and retry states remain usable", async (t) => {
  const loadingPage = await openPreviewPage(t, { width:1100, height:760 });
  await mountDialog(loadingPage, { mode:"loading" });
  await loadingPage.locator(".direct-launch-dialog.is-loading").waitFor();
  assert.equal(await loadingPage.getByText("Création du QR code…").isVisible(), true);
  assert.equal(await loadingPage.locator('[data-action="download-qr"]').isDisabled(), true);
  await loadingPage.screenshot({ path:path.join(screenshotDirectory, "loading-desktop.png") });

  const retryPage = await openPreviewPage(t, { width:1100, height:760 });
  await mountDialog(retryPage, { mode:"retry" });
  await retryPage.locator('[data-action="retry"]').waitFor();
  assert.match(await retryPage.locator("[data-direct-launch-message]").textContent(), /indisponible/i);
  await retryPage.screenshot({ path:path.join(screenshotDirectory, "error-desktop.png") });
  await retryPage.locator('[data-action="retry"]').click();
  await waitForReadyDialog(retryPage);
  assert.equal(await retryPage.locator("[data-direct-launch-qr] canvas").count(), 1);
});

async function openPreviewPage(t, viewport) {
  const page = await browser.newPage({ viewport });
  t.after(() => page.close());
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], "No uncaught browser errors"));
  await page.addInitScript(installQrPreviewStub);
  await page.goto(baseUrl, { waitUntil:"networkidle" });
  return page;
}

async function mountDialog(page, { mode }) {
  await page.evaluate(async ({ mode }) => {
    const { openDirectLaunchDialog } = await import("/teacher/js/dashboard/direct-launch-dialog.js");
    const { startMaterialIconHydration } = await import("/shared/material-icons-svg.js");
    startMaterialIconHydration();
    window.__directLaunchCalls = [];
    window.__directLaunchAttempt = 0;
    document.querySelector("#previewOrigin")?.focus();

    const saveDirectLaunchLinkForSpace = async (_teacherSpaceId, payload) => {
      window.__directLaunchCalls.push(structuredClone(payload));
      window.__directLaunchAttempt += 1;
      if (mode === "loading") return new Promise(() => {});
      await new Promise((resolve) => setTimeout(resolve, 70));
      if (mode === "retry" && window.__directLaunchAttempt === 1) {
        throw new Error("Service momentanément indisponible.");
      }
      return {
        token:`preview-${window.__directLaunchAttempt}-${payload.difficulty_level ?? "adaptive"}-${payload.execution_limit_value ?? "all"}`
      };
    };

    void openDirectLaunchDialog({
      teacherSpaceId:42,
      sourceType:"catalog_activity",
      source:{
        id:"mathematiques.calculs.addition",
        config_name:"Calcul mental — additions jusqu’à 100",
        title:"Addition",
        tool_id:"addition",
        difficulty_levels:{
          "1":{ settings:{} },
          "2":{ settings:{} },
          "3":{ settings:{} },
          "4":{ settings:{} },
          "5":{ settings:{} }
        }
      },
      saveDirectLaunchLinkForSpace,
      showToast:(message, options = {}) => {
        window.__lastToast = { message, options };
      }
    });
  }, { mode });
  await page.locator(".direct-launch-card").waitFor();
}

async function waitForReadyDialog(page) {
  await page.locator(".direct-launch-dialog:not(.is-loading)").waitFor();
  await page.locator("[data-direct-launch-qr] canvas").waitFor();
}

async function waitForCallCount(page, count) {
  await page.waitForFunction((expected) => window.__directLaunchCalls?.length >= expected, count);
}

function installQrPreviewStub() {
  window.QRCode = class PreviewQrCode {
    static CorrectLevel = { M:"M" };

    constructor(host, options = {}) {
      const size = Number(options.width) || 256;
      const modules = 33;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      context.fillStyle = options.colorLight || "#ffffff";
      context.fillRect(0, 0, size, size);
      context.fillStyle = options.colorDark || "#111827";
      const cell = size / modules;

      const finder = (startX, startY) => {
        context.fillRect(startX * cell, startY * cell, 7 * cell, 7 * cell);
        context.fillStyle = options.colorLight || "#ffffff";
        context.fillRect((startX + 1) * cell, (startY + 1) * cell, 5 * cell, 5 * cell);
        context.fillStyle = options.colorDark || "#111827";
        context.fillRect((startX + 2) * cell, (startY + 2) * cell, 3 * cell, 3 * cell);
      };
      finder(0, 0);
      finder(modules - 7, 0);
      finder(0, modules - 7);

      const seedText = String(options.text || "preview");
      let seed = Array.from(seedText).reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 2166136261);
      for (let y = 0; y < modules; y += 1) {
        for (let x = 0; x < modules; x += 1) {
          const inFinder = (x < 8 && y < 8) || (x >= modules - 8 && y < 8) || (x < 8 && y >= modules - 8);
          if (inFinder) continue;
          seed = ((seed * 1664525) + 1013904223) >>> 0;
          if ((seed & 3) < 2) context.fillRect(x * cell, y * cell, Math.ceil(cell), Math.ceil(cell));
        }
      }
      host.appendChild(canvas);
    }
  };
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
