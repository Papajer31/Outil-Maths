// Run: node --test _dev/regression-tests/sequence-editor-navigation.test.mjs
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
      response.end('<!doctype html><link rel="stylesheet" href="/teacher/css/dashboard.css"><link rel="stylesheet" href="/teacher/css/config-widgets.css"><div id="view"></div>');
      return;
    }
    const filename = path.resolve(root, `.${decodeURIComponent(pathname)}`);
    if (!filename.startsWith(`${root}${path.sep}`)) return response.writeHead(403).end();
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

test("sequence editor navigates site and personal activity trees", async (t) => {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.route("**/*", (route) => new URL(route.request().url()).origin === baseUrl ? route.continue() : route.abort());
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], "No uncaught browser errors"));
  await page.goto(baseUrl);
  await page.evaluate(async () => {
    const { createSequenceEditorController } = await import("/teacher/js/dashboard/sequence-editor-view.js");
    const controller = createSequenceEditorController({
      view:document.querySelector("#view"),
      getCurrentTeacherSpace: () => ({ id:"test-space" }),
      listCatalogActivitiesForTeacherSpace: async () => [{ id:"site-reading", config_name:"Lecture guidée", pedagogical_node_id:"site-comprehension", status:"published" }],
      listPedagogicalNodesForTeacher: async () => [
        { id:"site-cycle-2", name:"Cycle 2", parent_id:null },
        { id:"site-french", name:"Français", parent_id:"site-cycle-2" },
        { id:"site-reading", name:"Lecture", parent_id:"site-french" },
        { id:"site-comprehension", name:"Compréhension", parent_id:"site-reading" }
      ],
      listTeacherActivitiesForSpace: async () => [
        { id:"personal-mental", title:"Calcul mental", folder_id:"personal-math", activity_type:"tool" },
        ...Array.from({ length:30 }, (_, index) => ({
          id:`personal-exercise-${index + 1}`,
          title:`Exercice ${String(index + 1).padStart(2, "0")}`,
          folder_id:"personal-math",
          activity_type:"tool"
        }))
      ],
      listTeacherActivityFoldersForSpace: async () => [{ id:"personal-math", name:"Mathématiques", parent_id:null }],
      saveTeacherSequenceForSpace: async (_spaceId, draft) => draft
    });
    await controller.open();
  });

  await page.getByText("ACTIVITÉS", { exact:true }).waitFor();
  await page.locator(".dashboard-sequence-editor-host.is-open").waitFor();
  assert.equal(await page.getByText("SÉQUENCE", { exact:true }).count(), 1);
  const layout = await page.evaluate(() => {
    const header = document.querySelector(".dashboard-mission-editor-head").getBoundingClientRect();
    const host = document.querySelector(".dashboard-sequence-editor-host").getBoundingClientRect();
    const editor = document.querySelector(".dashboard-sequence-editor").getBoundingClientRect();
    const workspace = document.querySelector(".dashboard-sequence-compose-grid").getBoundingClientRect();
    const left = document.querySelector(".dashboard-mission-catalog-panel").getBoundingClientRect();
    const right = document.querySelector(".dashboard-mission-sequence-panel").getBoundingClientRect();
    const leftStyle = getComputedStyle(document.querySelector(".dashboard-mission-catalog-panel"));
    const headingStyle = getComputedStyle(document.querySelector(".dashboard-sequence-panel-heading"));
    return {
      headerBottom:header.bottom,
      hostTop:host.top,
      hostBottom:host.bottom,
      editorTop:editor.top,
      editorBottom:editor.bottom,
      viewportBottom:window.innerHeight,
      workspaceTop:workspace.top,
      workspaceBottom:workspace.bottom,
      leftTop:left.top,
      leftBottom:left.bottom,
      rightTop:right.top,
      rightBottom:right.bottom,
      dividerWidth:leftStyle.borderRightWidth,
      headingWeight:headingStyle.fontWeight,
      headingPaddingTop:headingStyle.paddingTop
    };
  });
  assert.equal(layout.workspaceTop, layout.headerBottom, "workspace starts directly below the header");
  assert.equal(layout.leftTop, layout.workspaceTop, "left panel starts at the workspace top");
  assert.equal(layout.rightTop, layout.workspaceTop, "right panel starts at the workspace top");
  assert.equal(layout.leftBottom, layout.workspaceBottom, "left panel fills the workspace height");
  assert.equal(layout.rightBottom, layout.workspaceBottom, "right panel fills the workspace height");
  assert.equal(layout.workspaceBottom, layout.viewportBottom, `divider reaches the bottom edge without a visible end: ${JSON.stringify(layout)}`);
  assert.equal(layout.dividerWidth, "3px", "divider is visibly thicker");
  assert.equal(layout.headingWeight, "600", "panel headings use a lighter weight");
  assert.equal(layout.headingPaddingTop, "16px", "panel headings have space above them");
  const rootEntryHeights = await page.locator(".dashboard-sequence-source-root").evaluateAll((entries) => entries.map((entry) => entry.getBoundingClientRect().height));
  assert.ok(rootEntryHeights.every((height) => height < 80), "source entries keep their natural height");
  const rootEntryTop = await page.locator(".dashboard-sequence-source-root").first().evaluate((entry) => entry.getBoundingClientRect().top);
  await page.getByRole("button", { name:"Activités du site" }).click();
  const siteParent = page.getByRole("button", { name:"Dossier parent", exact:true });
  assert.equal(await siteParent.count(), 1, "site activities root exposes the source picker as its parent");
  assert.equal(await siteParent.evaluate((entry) => entry.getBoundingClientRect().top), rootEntryTop, "reserved breadcrumb space prevents a layout jump");
  await page.getByRole("button", { name:"Cycle 2" }).click();
  await page.getByRole("button", { name:"Français" }).click();
  await page.getByRole("button", { name:"Lecture" }).click();
  assert.equal(await page.getByLabel("Afficher le chemin complet").count(), 1, "deep paths collapse behind an ellipsis");
  await page.getByRole("button", { name:"Compréhension" }).click();
  await page.getByRole("button", { name:"Lecture guidée" }).click();
  assert.equal(await page.locator("[data-sequence-item-index]").count(), 1);
  const firstSequenceCard = page.locator("[data-sequence-item-index='0']");
  assert.equal(await firstSequenceCard.locator(".dashboard-sequence-step-number").textContent(), "1", "the sequence number has its own column");
  assert.equal(await firstSequenceCard.locator(".dashboard-class-card-title").textContent(), "Lecture guidée", "the activity title no longer contains the sequence number");
  assert.equal(await firstSequenceCard.locator(".dashboard-class-card-title").evaluate((title) => getComputedStyle(title).color), "rgb(255, 176, 32)", "the activity title uses the sequence title yellow");
  assert.equal(await firstSequenceCard.locator(".dashboard-mini-pill").count(), 0, "the activity origin pill is removed");
  assert.deepEqual(await firstSequenceCard.locator(".dashboard-mission-step-setting-label").allTextContents(), ["Difficulté :", "Passation :"], "the sequence controls have explicit labels");
  const singleTileHeight = await page.locator("[data-sequence-item-index='0']").evaluate((tile) => tile.getBoundingClientRect().height);

  for (let depth = 0; depth < 5; depth += 1) {
    await page.getByRole("button", { name:"Dossier parent", exact:true }).click();
  }
  await page.getByRole("button", { name:"Mes activités", exact:true }).click();
  assert.equal(await page.getByRole("button", { name:"Dossier parent", exact:true }).count(), 1, "personal activities root exposes the source picker as its parent");
  await page.getByRole("button", { name:"Mathématiques" }).click();
  const middleActivity = page.getByRole("button", { name:"Exercice 18" });
  await middleActivity.scrollIntoViewIfNeeded();
  const sourceScrollBeforeAdd = await page.locator("#sequenceSourcePicker").evaluate((picker) => picker.scrollTop);
  await page.evaluate(() => {
    window.sequenceEditorHostBeforeIncrementalUpdates = document.querySelector(".dashboard-sequence-editor-host");
    window.sequenceFirstCardBeforeIncrementalUpdates = document.querySelector(".dashboard-sequence-step-card");
  });
  await middleActivity.click();
  assert.equal(await page.locator("#sequenceSourcePicker").evaluate((picker) => picker.scrollTop), sourceScrollBeforeAdd, "adding an activity preserves the source explorer scroll");
  assert.equal(await page.evaluate(() => window.sequenceEditorHostBeforeIncrementalUpdates === document.querySelector(".dashboard-sequence-editor-host")), true, "adding an activity does not recreate the editor");
  assert.equal(await page.evaluate(() => window.sequenceFirstCardBeforeIncrementalUpdates === document.querySelector(".dashboard-sequence-step-card")), true, "adding an activity preserves existing sequence cards");
  await page.locator(".dashboard-sequence-step-card").nth(1).locator("[data-action='remove-sequence-item']").click();
  assert.equal(await page.locator(".dashboard-sequence-step-card").count(), 1, "removing an activity updates only the sequence list");
  assert.equal(await page.evaluate(() => window.sequenceEditorHostBeforeIncrementalUpdates === document.querySelector(".dashboard-sequence-editor-host")), true, "removing an activity does not recreate the editor");
  await page.getByRole("button", { name:"Calcul mental" }).click();
  assert.equal(await page.locator("[data-sequence-item-index]").count(), 2);
  const firstTileHeightWithTwoItems = await page.locator("[data-sequence-item-index='0']").evaluate((tile) => tile.getBoundingClientRect().height);
  assert.equal(firstTileHeightWithTwoItems, singleTileHeight, "adding an item does not resize existing tiles");
  await page.evaluate(() => { window.sequenceFirstCardBeforeLimitChange = document.querySelector(".dashboard-sequence-step-card"); });
  await page.locator("[data-sequence-item-limit-mode='0']").selectOption("time");
  assert.equal(await page.evaluate(() => window.sequenceFirstCardBeforeLimitChange === document.querySelector(".dashboard-sequence-step-card")), true, "changing the limit mode preserves the card node");
  const firstLimitStepper = page.locator("[data-sequence-item-index='0'] .dashboard-sequence-limit-stepper");
  assert.equal(await firstLimitStepper.locator(".tv-input-stepper").inputValue(), "5", "changing the limit mode updates its value in place");
  assert.equal(await page.locator("[data-sequence-item-index='0'] .dashboard-mission-step-limit-unit").textContent(), "min", "changing the limit mode updates its unit in place");
  await firstLimitStepper.getByRole("button", { name:"Augmenter Durée en minutes" }).click();
  assert.equal(await firstLimitStepper.locator(".tv-input-stepper").inputValue(), "6", "common increment control updates the limit");
  await firstLimitStepper.getByRole("button", { name:"Diminuer Durée en minutes" }).click();
  assert.equal(await firstLimitStepper.locator(".tv-input-stepper").inputValue(), "5", "common decrement control updates the limit");
  assert.equal(await page.locator("[data-action='move-sequence-item-up'], [data-action='move-sequence-item-down']").count(), 0, "sequence arrow controls are removed");
  const sequenceCards = page.locator(".dashboard-sequence-step-card");
  await page.evaluate(() => {
    [window.sequenceCardBeforeDrag, window.sequenceCardDragged] = document.querySelectorAll(".dashboard-sequence-step-card");
  });
  await sequenceCards.nth(1).dragTo(sequenceCards.nth(0), {
    sourcePosition:{ x:20, y:12 },
    targetPosition:{ x:20, y:2 }
  });
  const reorderedTitles = await page.locator(".dashboard-sequence-step-card .dashboard-class-card-title").allTextContents();
  assert.match(reorderedTitles[0], /Calcul mental/, "drag and drop moves the personal activity to the first position");
  assert.match(reorderedTitles[1], /Lecture guidée/, "drag and drop keeps the other activity in the sequence");
  assert.deepEqual(await page.locator(".dashboard-sequence-step-number").allTextContents(), ["1", "2"], "drag and drop reindexes the dedicated number columns");
  assert.equal(await page.evaluate(() => {
    const cards = document.querySelectorAll(".dashboard-sequence-step-card");
    return cards[0] === window.sequenceCardDragged && cards[1] === window.sequenceCardBeforeDrag;
  }), true, "drag and drop reorders the existing card nodes without rerendering them");

  await page.locator("[data-sequence-search]").fill("calcul");
  assert.equal(await page.getByRole("button", { name:"Calcul mental" }).count(), 1);
  for (let index = 0; index < 7; index += 1) {
    await page.getByRole("button", { name:"Calcul mental" }).click();
  }
  const sequenceOverflow = await page.locator(".dashboard-sequence-step-list").evaluate((list) => ({
    clientHeight:list.clientHeight,
    scrollHeight:list.scrollHeight
  }));
  assert.ok(sequenceOverflow.scrollHeight > sequenceOverflow.clientHeight, "sequence list scrolls only when its natural content exceeds the panel");
  await page.locator(".dashboard-sequence-step-list").evaluate((list) => { list.scrollTop = 220; });
  const sequenceScrollBeforeAdd = await page.locator(".dashboard-sequence-step-list").evaluate((list) => list.scrollTop);
  await page.getByRole("button", { name:"Calcul mental" }).click();
  assert.equal(await page.locator(".dashboard-sequence-step-list").evaluate((list) => list.scrollTop), sequenceScrollBeforeAdd, "adding an activity also preserves the sequence scroll");
});
