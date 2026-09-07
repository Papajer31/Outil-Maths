// Run: node --test _dev/regression-tests/catalog-draft-preservation.test.mjs
// The real catalog editor, widgets and Addition tool run against a local server.
// Unused preview dialogs and persistence are stubbed; no database is contacted.
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
      response.end('<!doctype html><style>.hidden{display:none}</style><div id="header"></div><div id="list"></div>');
      return;
    }
    const stubs = {
      "/teacher/js/dashboard/catalog-test-runner.js": "export function openCatalogTestRunner() { throw new Error('Preview is outside this test'); }",
      "/teacher/js/dashboard/catalog-tree-admin-dialog.js": "export function openCatalogTreeAdminDialog() { throw new Error('Tree dialog is outside this test'); }"
    };
    if (stubs[pathname]) {
      response.setHeader("Content-Type", "text/javascript");
      response.end(stubs[pathname]);
      return;
    }
    const filename = path.resolve(root, `.${decodeURIComponent(pathname)}`);
    if (!filename.startsWith(`${root}${path.sep}`) && filename !== root) {
      response.writeHead(403).end();
      return;
    }
    try {
      const content = await fs.readFile(filename);
      response.setHeader("Content-Type", pathname.endsWith(".js") ? "text/javascript" : pathname.endsWith(".css") ? "text/css" : "application/octet-stream");
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function openEditor(t, { fixedList = false } = {}) {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.route("**/*", (route) => new URL(route.request().url()).origin === baseUrl ? route.continue() : route.abort());
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], "No uncaught browser errors"));
  await page.goto(baseUrl);
  await page.evaluate(async ({ fixedList }) => {
    const { createCatalogAdminViewController } = await import("/teacher/js/dashboard/catalog-admin-view.js");
    const { getDefaultSettings } = await import("/tools/addition/config.js");
    const settings = getDefaultSettings();
    if (fixedList) {
      settings.generationMode = "fixed_list";
      settings.fixedListRaw = "2+3=5";
    }
    window.savedActivities = [];
    const controller = createCatalogAdminViewController({
      header: document.querySelector("#header"),
      list: document.querySelector("#list"),
      getCurrentTeacherSpace: () => ({ id: "local-test-space" }),
      saveCatalogActivityAsAdmin: async (payload) => {
        window.savedActivities.push(structuredClone(payload));
        return payload;
      },
      listCatalogActivitiesForAdmin: async () => []
    });
    controller.openEditor({
      id: "local-test-activity",
      title: "Local test",
      config_name: "Local test",
      tool_id: "addition",
      status: "draft",
      difficulty_levels: Object.fromEntries([1, 2, 3, 4, 5].map((level) => [String(level), {
        timePerQ: 40,
        infiniteTimePerQ: false,
        settings: structuredClone(settings)
      }]))
    });
  }, { fixedList });
  await ready(page);
  return page;
}

async function ready(page) {
  await page.locator("#adminLevelTimePerQ").waitFor();
  await page.locator(".add-config-root").waitFor();
}

async function editLevel(page) {
  await page.locator("#adminLevelTimePerQ").fill("75");
  await page.locator("#adminLevelInstructionEnabled").check();
  await page.locator("#adminLevelInstructionText").fill("Consigne en cours de rédaction");
  await page.locator("#add_termRange_t1_max").fill("42");
}

async function assertLevel(page) {
  assert.equal(await page.locator("#adminLevelTimePerQ").inputValue(), "75");
  assert.equal(await page.locator("#adminLevelInstructionEnabled").isChecked(), true);
  assert.equal(await page.locator("#adminLevelInstructionText").inputValue(), "Consigne en cours de rédaction");
  assert.equal(await page.locator("#add_termRange_t1_max").inputValue(), "42");
}

test("Changing publication status preserves the edited level and save payload", async (t) => {
  const page = await openEditor(t);
  await editLevel(page);
  await page.locator('[data-action="set-admin-status"][data-status="published"]').click();
  await ready(page);
  await assertLevel(page);
  assert.equal(await page.locator('[data-status="published"]').getAttribute("aria-pressed"), "true");
  await page.locator('[data-action="save-admin-activity"]').click();
  await page.waitForFunction(() => window.savedActivities.length === 1);
  const payload = await page.evaluate(() => window.savedActivities[0]);
  assert.equal(payload.status, "published");
  assert.equal(payload.levels_json["3"].timePerQ, 75);
  assert.equal(payload.levels_json["3"].settings.termRanges.t1.max, 42);
  assert.equal(payload.levels_json["3"].settings.common.instruction.text, "Consigne en cours de rédaction");
});

test("Status toggles preserve an incomplete text draft without recreating its field", async (t) => {
  const page = await openEditor(t, { fixedList: true });
  await page.locator("#add_fixedListRaw").fill("2+3=5\n12+");
  await page.evaluate(() => { window.originalDraftField = document.querySelector("#add_fixedListRaw"); });
  for (const status of ["published", "draft", "draft"]) {
    await page.locator(`[data-action="set-admin-status"][data-status="${status}"]`).click();
    await ready(page);
    assert.equal(await page.locator("#add_fixedListRaw").inputValue(), "2+3=5\n12+");
    assert.equal(await page.evaluate(() => window.originalDraftField === document.querySelector("#add_fixedListRaw")), true);
    assert.equal(await page.locator(`[data-status="${status}"]`).getAttribute("aria-pressed"), "true");
  }
});

test("Level switching, copy and explicit reset keep their intended behavior", async (t) => {
  const page = await openEditor(t);
  await editLevel(page);
  await page.locator('[data-action="select-level"][data-level="2"]').click();
  await ready(page);
  assert.equal(await page.locator("#adminLevelTimePerQ").inputValue(), "40");
  await page.locator('[data-action="select-level"][data-level="3"]').click();
  await ready(page);
  await assertLevel(page);
  await page.locator('[data-action="copy-current-level"]').click();
  await ready(page);
  await page.locator('[data-action="select-level"][data-level="2"]').click();
  await ready(page);
  await assertLevel(page);
  await page.locator('[data-action="reset-current-level"]').click();
  await ready(page);
  assert.equal(await page.locator("#adminLevelTimePerQ").inputValue(), "40");
  assert.equal(await page.locator("#adminLevelInstructionEnabled").isChecked(), false);
  assert.equal(await page.locator("#add_termRange_t1_max").inputValue(), "99");
  await page.locator('[data-action="select-level"][data-level="3"]').click();
  await ready(page);
  await assertLevel(page);
});

test("Description and title changes preserve the edited level", async (t) => {
  const page = await openEditor(t);
  await editLevel(page);
  await page.locator('[data-action="open-admin-description"]').click();
  await ready(page);
  await assertLevel(page);
  await page.locator('[data-field="description"]').fill("Description modifiée");
  await page.locator('[data-action="close-admin-description"]').click();
  await ready(page);
  await assertLevel(page);
  await page.locator('[data-action="rename-admin-activity"]').click();
  await page.locator("#adminActivityTitleInput").fill("Nouveau titre");
  await page.locator('[data-action="apply-admin-title"]').click();
  await ready(page);
  await assertLevel(page);
  assert.equal(await page.locator(".cfg-config-name-display").innerText(), "Nouveau titre");
});
