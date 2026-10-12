// Run: node --test _dev/regression-tests/exploration-search.test.mjs
// Uses the real Exploration controller and CSS with local catalog fixtures.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../responsive-audit/node_modules/playwright/index.mjs";

const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
let server, browser, baseUrl;

before(async () => {
  server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(`<!doctype html><html lang="fr"><meta charset="utf-8">
        <link rel="stylesheet" href="/css/base.css"><link rel="stylesheet" href="/css/ui.css">
        <link rel="stylesheet" href="/teacher/css/common.css"><link rel="stylesheet" href="/teacher/css/dashboard.css">
        <main class="dashboard-content-frame"><div id="activitiesView" class="dashboard-content-view">
        <div id="configHeader" class="dashboard-config-header"></div>
        <div id="configsList" class="dashboard-content-scroll dashboard-config-list"></div>
        </div></main></html>`);
      return;
    }
    const filename = path.resolve(root, `.${decodeURIComponent(pathname)}`);
    if (!filename.startsWith(`${root}${path.sep}`)) return response.writeHead(403).end();
    try {
      response.setHeader("Content-Type", pathname.endsWith(".js") ? "text/javascript" : pathname.endsWith(".css") ? "text/css" : "application/octet-stream");
      response.end(await fs.readFile(filename));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless:true });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function openExploration(t, { width = 1440, admin = false } = {}) {
  const page = await browser.newPage({ viewport:{ width, height:800 } });
  t.after(() => page.close());
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], "No uncaught browser errors"));
  await page.route("**/*", route => new URL(route.request().url()).origin === baseUrl ? route.continue() : route.abort());
  await page.goto(baseUrl);
  await page.evaluate(async ({ admin }) => {
    localStorage.setItem("dashboard:exploration:grade", "CP");
    const { createActivitiesViewController } = await import("/teacher/js/dashboard/activities-view.js");
    const { startMaterialIconHydration } = await import("/shared/material-icons-svg.js");
    startMaterialIconHydration();
    const folders = [
      { id:"reading", name:"Français", parent_id:null, node_type:"discipline" },
      { id:"words", name:"Lecture", parent_id:"reading", node_type:"domain" },
      { id:"reading-cp", name:"CP", parent_id:"words", node_type:"grade_level" },
      { id:"reading-ce1", name:"CE1", parent_id:"words", node_type:"grade_level" },
      { id:"math", name:"Mathématiques", parent_id:null, node_type:"discipline" },
      { id:"numbers", name:"Nombres", parent_id:"math", node_type:"domain" }
    ];
    const activities = [
      ...Array.from({ length:35 }, (_, index) => ({ id:`reading-${index}`, config_name:`Lecture ${String(index).padStart(2,"0")}`, pedagogical_node_id:"reading-cp", adventure_tier:1, status:"published" })),
      { id:"target-cp", config_name:"Écriture <CP>", description:"Assembler des mots", pedagogical_node_id:"reading-cp", adventure_tier:3, status:"published" },
      { id:"target-ce1", config_name:"Écriture CE1", description:"Assembler des mots", pedagogical_node_id:"reading-ce1", status:"published" },
      { id:'tile-"&', config_name:"Calcul libre", pedagogical_node_id:"numbers", status:"published" }
    ];
    window.catalogLoads = 0;
    window.controller = createActivitiesViewController({
      configHeader:document.querySelector("#configHeader"), configsList:document.querySelector("#configsList"),
      getCurrentTeacherSpace:() => ({ id:"test-space" }), getIsSuperAdmin:() => admin,
      listPedagogicalNodesForTeacher:async () => folders, listPedagogicalNodesForAdmin:async () => folders,
      listCatalogActivitiesForTeacherSpace:async () => { window.catalogLoads++; return activities; },
      listCatalogActivitiesForAdmin:async () => [...activities, { id:"draft-cp", config_name:"Écriture en brouillon", pedagogical_node_id:"reading-cp", status:"draft" }]
    });
    await window.controller.renderActivitiesForSpace();
  }, { admin });
  return page;
}

const searchButton = page => page.getByRole("button", { name:"Rechercher dans Exploration", exact:true });

async function captureSearch(page, name) {
  const directory = process.env.EXPLORATION_SEARCH_SCREENSHOTS;
  if (!directory) return;
  await fs.mkdir(directory, { recursive:true });
  await page.screenshot({ path:path.join(directory, `${name}.png`) });
}

async function openHome(t, { width = 1440, deferred = false } = {}) {
  const page = await openExploration(t, { width });
  await page.evaluate(async ({ deferred }) => {
    const { createTeacherHomeViewController } = await import("/teacher/js/dashboard/home-view.js");
    const exploration = document.querySelector("#activitiesView");
    exploration.classList.add("hidden");
    const home = document.createElement("div");
    home.id = "homeView";
    home.className = "dashboard-content-view dashboard-home-view";
    exploration.parentElement.appendChild(home);
    window.homeSearchLoads = 0;
    window.deferHomeSearch = deferred;
    window.homeController = createTeacherHomeViewController({
      view:home,
      getActivitySearchEntries:async () => {
        window.homeSearchLoads++;
        if (window.deferHomeSearch) await new Promise(resolve => { window.resolveHomeSearch = resolve; });
        if (window.failHomeSearch) throw new Error("Offline");
        return window.controller.getSearchEntries({ grade:"all" });
      },
      onOpenSearchActivity:async activity => {
        home.classList.add("hidden");
        exploration.classList.remove("hidden");
        await window.controller.revealActivity(activity.id);
      },
      onOpenTableau:() => { window.tableauShortcutCalls = (window.tableauShortcutCalls || 0) + 1; }
    });
  }, { deferred });
  return page;
}

test("Live search uses the selected grade, ignores accents, and reveals the activity in its tier", async t => {
  const page = await openExploration(t);
  const gradeTabs = page.getByRole("group", { name:"Filtrer Exploration par niveau" });
  const tabsBox = await gradeTabs.boundingBox(), searchBox = await searchButton(page).boundingBox();
  assert.ok(searchBox.x >= tabsBox.x + tabsBox.width, "the search button sits to the right of the grade selector");
  assert.ok(Math.abs(searchBox.y + searchBox.height / 2 - tabsBox.y - tabsBox.height / 2) < 2);
  await searchButton(page).click();
  const dialog = page.getByRole("dialog", { name:"Rechercher une activité" });
  const input = dialog.getByRole("searchbox");
  assert.equal(await input.evaluate(element => element === document.activeElement), true);
  assert.equal(await dialog.getByText("Niveau CP", { exact:true }).count(), 1);
  assert.equal(await dialog.locator(".exploration-search-result").count(), 36);
  const initialDialogBounds = await dialog.boundingBox();
  await input.fill("ECRITURE mots");
  assert.equal(await dialog.locator(".exploration-search-result").count(), 1);
  assert.deepEqual(await dialog.boundingBox(), initialDialogBounds, "filtering down to one result keeps the dialog size and position");
  assert.equal(await dialog.locator(".exploration-search-result strong").textContent(), "Écriture <CP>");
  assert.match(await dialog.locator(".exploration-search-result-copy > span").textContent(), /Français › Lecture › CP/);
  assert.equal(await dialog.locator("cp").count(), 0, "catalog titles are escaped");
  await input.fill("introuvable");
  assert.equal(await dialog.getByText("Aucune activité ne correspond à cette recherche.").count(), 1);
  assert.deepEqual(await dialog.boundingBox(), initialDialogBounds, "an empty search keeps the dialog size and position");
  await input.fill("francais cp");
  assert.equal(await dialog.locator(".exploration-search-result").count(), 36, "folder paths are searchable");
  await input.fill("ecriture");
  assert.equal(await page.evaluate(() => window.catalogLoads), 1, "typing never reloads the catalog");
  await captureSearch(page, "search-desktop");
  await dialog.locator("[data-exploration-search-id='target-cp']").click();
  await dialog.waitFor({ state:"detached" });
  const target = page.locator("[data-exploration-activity-id='target-cp'].is-search-target");
  await target.waitFor();
  assert.equal(await target.locator(".dashboard-activity-row-title").textContent(), "Écriture <CP>");
  assert.equal(await target.evaluate(element => element === document.activeElement), true);
  assert.equal(await page.locator(".dashboard-activity-tree-row.is-selected [data-folder-id='reading-cp']").count(), 1);
  assert.equal(await page.locator(".dashboard-activity-tree-list [data-folder-id='reading-cp']").count(), 1, "the collapsed parent branch is expanded");
  const visible = await target.evaluate(element => {
    const row = element.getBoundingClientRect();
    const pane = element.closest(".dashboard-activity-tiers-wrap").getBoundingClientRect();
    return row.top >= pane.top && row.bottom <= pane.bottom;
  });
  assert.equal(visible, true, "a result below the initial viewport is scrolled into view");
});

test("Search closes by keyboard and backdrop, and Tous can reveal a tile in another branch", async t => {
  const page = await openExploration(t, { width:768 });
  await searchButton(page).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("searchbox").fill("ecriture");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state:"detached" });
  assert.equal(await searchButton(page).evaluate(element => element === document.activeElement), true);
  await page.locator("[data-exploration-grade='CE1']").click();
  await searchButton(page).click();
  assert.equal(await dialog.locator(".exploration-search-result").count(), 1);
  assert.equal(await dialog.locator(".exploration-search-result strong").textContent(), "Écriture CE1");
  await dialog.getByRole("button", { name:"Fermer la recherche" }).click();
  await page.locator("[data-exploration-grade='all']").click();
  await searchButton(page).click();
  await dialog.getByRole("searchbox").fill("calcul");
  const result = dialog.getByRole("button", { name:/Calcul libre/ });
  await result.focus();
  await page.keyboard.press("Tab");
  assert.equal(await dialog.getByRole("button", { name:"Fermer la recherche" }).evaluate(element => element === document.activeElement), true, "Tab stays within the modal");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await result.evaluate(element => element === document.activeElement), true, "Shift+Tab wraps to the last result");
  await page.mouse.click(4,4);
  await dialog.waitFor({ state:"detached" });
  await searchButton(page).click();
  await dialog.getByRole("searchbox").fill("calcul");
  await dialog.getByRole("button", { name:/Calcul libre/ }).click();
  const target = page.locator(".dashboard-activity-tile.is-search-target");
  await target.waitFor();
  assert.equal(await target.getAttribute("data-exploration-activity-id"), 'tile-"&');
  assert.equal(await target.locator(".dashboard-activity-tile-title").textContent(), "Calcul libre");
});

test("Admin drafts are searchable; the overlay fits small screens and closes on catalog refresh", async t => {
  const page = await openExploration(t, { width:390, admin:true });
  const triggerBounds = await searchButton(page).boundingBox();
  assert.ok(triggerBounds.x >= 0 && triggerBounds.x + triggerBounds.width <= 390, "the search button remains accessible on mobile");
  await searchButton(page).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("searchbox").fill("brouillon");
  assert.equal(await dialog.locator(".exploration-search-result").count(), 1);
  assert.equal(await dialog.locator(".exploration-search-result strong").textContent(), "Écriture en brouillon");
  await dialog.getByRole("searchbox").fill("");
  const bounds = await dialog.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
  assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 800);
  assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true);
  assert.equal(await dialog.locator(".exploration-search-results").evaluate(element => element.scrollHeight > element.clientHeight), true);
  await captureSearch(page, "search-mobile");
  await page.evaluate(() => window.controller.closeSearch({ restoreFocus:false }));
  await dialog.waitFor({ state:"detached" });
  await searchButton(page).click();
  await page.evaluate(() => window.controller.renderActivitiesForSpace({ forceRefresh:true }));
  await dialog.waitFor({ state:"detached" });
});

test("Home search expands below its input, filters all grades, and reveals a result beyond the Exploration grade filter", async t => {
  const page = await openHome(t);
  const home = page.locator("#homeView");
  const input = home.getByRole("searchbox", { name:"Rechercher une activité" });
  const dropdown = home.locator(".dashboard-home-search-dropdown");
  assert.equal(await dropdown.isVisible(), false);
  assert.equal(await page.evaluate(() => window.homeSearchLoads), 0, "catalog search is loaded only when requested");
  const headingBounds = await home.locator(".dashboard-home-heading").boundingBox();
  const inputBounds = await input.boundingBox();
  const tilesBounds = await home.locator(".dashboard-home-actions").boundingBox();
  assert.ok(headingBounds.y + headingBounds.height <= inputBounds.y);
  assert.ok(inputBounds.y + inputBounds.height <= tilesBounds.y, "search is between the heading and shortcut tiles");
  await input.click();
  await dropdown.locator("[data-home-search-id='target-ce1']").waitFor();
  assert.equal(await dropdown.locator(".exploration-search-result").count(), 38, "home searches every grade");
  assert.deepEqual(await home.locator(".dashboard-home-actions").boundingBox(), tilesBounds, "the dropdown leaves shortcuts in place");
  await input.fill("ECRITURE mots");
  assert.equal(await dropdown.locator(".exploration-search-result").count(), 2);
  await input.fill("introuvable");
  assert.equal(await dropdown.getByText("Aucune activité ne correspond à cette recherche.").count(), 1);
  await input.fill("francais ce1");
  assert.equal(await dropdown.locator(".exploration-search-result").count(), 1);
  assert.equal(await page.evaluate(() => window.homeSearchLoads), 1, "typing uses the loaded search index");
  await captureSearch(page, "home-search-desktop");
  await dropdown.locator("[data-home-search-id='target-ce1']").click();
  await page.locator("[data-exploration-activity-id='target-ce1'].is-search-target").waitFor();
  assert.equal(await page.locator("[data-exploration-grade='CE1']").getAttribute("aria-pressed"), "true", "navigation selects the result's grade");
  assert.equal(await home.isVisible(), false);
  assert.equal(await page.locator(".dashboard-activity-tree-row.is-selected [data-folder-id='reading-ce1']").count(), 1);
});

test("Home dropdown works on mobile and closes or navigates using the keyboard", async t => {
  const page = await openHome(t, { width:390 });
  const home = page.locator("#homeView");
  const input = home.getByRole("searchbox");
  const dropdown = home.locator(".dashboard-home-search-dropdown");
  await input.click();
  await dropdown.locator("[data-home-search-id='target-cp']").waitFor();
  const bounds = await dropdown.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
  assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 800);
  assert.equal(await dropdown.evaluate(element => element.scrollWidth <= element.clientWidth), true);
  assert.equal(await dropdown.locator(".dashboard-home-search-results").evaluate(element => element.scrollHeight > element.clientHeight), true);
  await captureSearch(page, "home-search-mobile");
  await input.fill("calcul");
  await page.keyboard.press("Escape");
  assert.equal(await dropdown.isVisible(), false);
  assert.equal(await input.evaluate(element => element === document.activeElement), true);
  await input.click();
  await dropdown.getByRole("button", { name:/Calcul libre/ }).waitFor();
  await home.locator(".dashboard-home-heading").click();
  assert.equal(await dropdown.isVisible(), false, "clicking outside collapses the list");
  await input.click();
  await dropdown.getByRole("button", { name:/Calcul libre/ }).waitFor();
  await page.keyboard.press("ArrowDown");
  assert.equal(await dropdown.getByRole("button", { name:/Calcul libre/ }).evaluate(element => element === document.activeElement), true);
  await page.keyboard.press("Enter");
  await page.locator(".dashboard-activity-tile.is-search-target").waitFor();
  assert.equal(await page.locator(".dashboard-activity-tile.is-search-target").getAttribute("data-exploration-activity-id"), 'tile-"&');
});

test("Home search filters text typed during loading and does not reopen after a dismissed request completes", async t => {
  const page = await openHome(t, { deferred:true });
  const home = page.locator("#homeView");
  const input = home.getByRole("searchbox");
  const dropdown = home.locator(".dashboard-home-search-dropdown");
  await input.click();
  assert.equal(await dropdown.getByText("Chargement des activités…").count(), 1);
  await input.fill("ecriture");
  await page.evaluate(() => window.resolveHomeSearch());
  await dropdown.locator("[data-home-search-id='target-ce1']").waitFor();
  assert.equal(await dropdown.locator(".exploration-search-result").count(), 2);
  await page.keyboard.press("Escape");
  await input.click();
  await home.locator(".dashboard-home-heading").click();
  await page.evaluate(() => window.resolveHomeSearch());
  assert.equal(await dropdown.isVisible(), false);
  await page.evaluate(() => { window.deferHomeSearch = false; window.failHomeSearch = true; });
  await input.click();
  await dropdown.getByText("Impossible de charger les activités. Réessayez en rouvrant la recherche.").waitFor();
  await page.keyboard.press("Escape");
  await page.evaluate(() => { window.failHomeSearch = false; });
  await input.click();
  await dropdown.locator("[data-home-search-id='target-cp']").waitFor();
  await page.keyboard.press("Escape");
  await home.getByRole("button", { name:/Ouvrir le Tableau/ }).click();
  assert.equal(await page.evaluate(() => window.tableauShortcutCalls), 1, "the shortcut handler still runs directly on click");
  assert.equal(await dropdown.isVisible(), false);
});
