// Run: node --test --test-isolation=none _dev/regression-tests/fusee-tableau.test.mjs
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep, join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "../responsive-audit/node_modules/playwright/index.mjs";
import { applyFuseeAction } from "../../teacher/js/teacher-tools/apps/fusee/model.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const screenshots = join(tmpdir(), "portail-fusee-tableau");
const activity = { id:"addition", title:"Addition", activity_type:"tool", difficulty_mode:"single", config_json:{ tool_id:"addition", level:{ settings:{} } } };
const fixture = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<link rel="stylesheet" href="/css/base.css"><link rel="stylesheet" href="/css/ui.css">
<link rel="stylesheet" href="/teacher/css/dashboard.css"><link rel="stylesheet" href="/teacher/css/teacher-tools.css">
<style>html,body{height:100%;margin:0}#host{height:100dvh;display:flex;flex-direction:column}</style>
</head><body><div class="dashboard-content-view dashboard-teacher-tools-view" style="height:100dvh"><div id="host" class="dashboard-teacher-tools-host"></div></div><script type="module">
import { createTeacherToolsViewController } from "/teacher/js/dashboard/teacher-tools-view.js";
import { startMaterialIconHydration } from "/shared/material-icons-svg.js";
startMaterialIconHydration();
window.controller = createTeacherToolsViewController({
  host:document.getElementById("host"), getCurrentTeacherSpace:()=>({id:"test-space",access_code:"TEST"}),
  getCurrentStudents:()=>[], showToast:message=>{window.lastToast=message;}
});
await window.controller.render();window.ready=true;
</script></body></html>`;
const mime = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".svg":"image/svg+xml", ".png":"image/png", ".jpg":"image/jpeg", ".webp":"image/webp", ".wav":"audio/wav", ".flac":"audio/flac", ".mp3":"audio/mpeg", ".ttf":"font/ttf", ".woff2":"font/woff2" };
let server, browser, origin;

before(async () => {
  await mkdir(screenshots, { recursive:true });
  server = createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname === "/teacher/fixture") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(fixture); return; }
    const file = resolve(root, "." + decodeURIComponent(pathname === "/games/fusee/" ? pathname + "index.html" : pathname));
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403).end(); return; }
    try {
      let content = await readFile(file);
      // Only account/database access is stubbed. All Tableau/game/UI modules,
      // activity engine, styles and media are the actual project files.
      if (pathname === "/games/fusee/") content = content.toString().replace(/<script src="https:\/\/cdn[^>]+><\/script>/, "<script>window.supabase={createClient:()=>({})};</script>");
      if (pathname === "/games/fusee/app.js") content = content.toString().replace(/^import .*teacher-api.js";/m, `
        const getCurrentUser=async()=>({id:'test-teacher'});
        const getMyTeacherSpace=async()=>({id:'test-space',access_code:'TEST'});
        const listTeacherActivitiesForSpace=async()=>[${JSON.stringify(activity)}];
      `);
      res.setHeader("Content-Type", (mime[extname(file)] || "application/octet-stream") + (/[.](html|js|css)$/.test(file) ? "; charset=utf-8" : ""));
      res.end(content);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless:true });
});

after(async () => {
  await browser?.close();
  await new Promise(done => server.close(done));
});

test("The Tableau projection starts without dashboard authentication or creation services", async () => {
  const context = await browser.newContext({ viewport:{ width:1440, height:1000 } });
  await context.route("**/*", route => route.request().url().startsWith(origin + "/") ? route.continue() : route.abort());
  const page = await context.newPage(), errors = [], accountRequests = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (/\/(?:shared\/supabase-client|teacher\/js\/teacher-api|teacher\/js\/creations\/service)\.js(?:\?|$)/.test(request.url())) accountRequests.push(request.url());
  });
  try {
    await page.goto(origin + "/teacher/teacher-tools-projector.html?space=test-space&channel=startup-test");
    assert.equal(await page.evaluate(() => typeof window.supabase), "undefined");
    await page.locator("#btnTeacherToolsLaunch").click();
    await page.locator("#teacherToolsLaunchOverlay").waitFor({ state:"hidden", timeout:10000 });
    await page.locator("#btnTeacherToolsPageMenu").click();
    await page.locator("#teacherToolsPageDrawer").waitFor({ state:"visible" });
    await page.locator("#btnTeacherToolsPageAdd").click();
    await page.locator('[data-catalog-tool="fusee"]').waitFor({ state:"visible" });
    assert.deepEqual(errors, []);
    assert.deepEqual(accountRequests, []);
  } finally { await context.close(); }
});

test("La Fusée uses the Tableau's controls, single projection popup and page lifecycle", async () => {
  const context = await browser.newContext({ viewport:{ width:1440, height:1000 } });
  await context.route("**/*", route => route.request().url().startsWith(origin + "/") ? route.continue() : route.abort());
  const errors = [];
  context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
  const page = await context.newPage();
  try {
    await page.goto(origin + "/teacher/fixture");
    await page.waitForFunction(() => window.ready);
    await page.locator("#ttOpenWidgetPicker").click();
    await page.locator('[data-tool-id="fusee"]').click();
    const control = page.frameLocator('iframe[title="Préparation de La Fusée"]');
    await control.locator("#mission-title").fill("Mission du Tableau");
    for (const key of ["carburant", "provisions", "outils", "oxygene"]) await control.locator(`#target-${key}`).fill("0");
    await control.getByRole("tab", { name:"Les activités", exact:true }).click();
    await control.locator('[data-action="activity-eau"]').click();
    await control.locator("#activity-select").selectOption("addition");
    await control.getByRole("tab", { name:"La mission", exact:true }).click();
    await control.locator('[data-action="toggle-inactivity"]').click();
    await page.frames().find(frame => frame.url().includes("tableau=control")).evaluate(() => window.scrollTo(0,0));
    await page.screenshot({ path:join(screenshots, "configuration.png") });

    console.log("Configuration ready");
    const popupPromise = page.waitForEvent("popup");
    await control.getByRole("button", { name:"Commencer la mission", exact:true }).click();
    const popup = await popupPromise;
    await popup.waitForURL("**/teacher-tools-projector.html?**");
    await popup.locator("#btnTeacherToolsLaunch").click();
    console.log("Tableau projection opened");
    const runtime = popup.frameLocator('iframe[title="Jeu La Fusée"]');
    await runtime.getByRole("button", { name:"Démarrer la mission", exact:true }).click({ timeout:25000 });
    assert.equal(context.pages().length, 2, "The rocket must not open its own popup");
    const runtimeFrame = () => popup.frames().find(frame => frame.url().includes("tableau=runtime"));
    assert.equal(await runtimeFrame().evaluate(() => FuseeApp.getGame().config.title), "Mission du Tableau");
    await popup.screenshot({ path:join(screenshots, "projection.png") });

    await control.locator('[data-action="toggle-inactivity"]').click();
    await control.locator('[data-inactivity-seconds]').fill("8");
    await control.locator('#mission-title').click();
    await runtimeFrame().waitForFunction(() => FuseeApp.getGame().config.inactivitySeconds===8);
    await control.locator('[data-action="toggle-inactivity"]').click();
    await runtimeFrame().waitForFunction(() => FuseeApp.getGame().config.automaticControlEnabled===false);
    await popup.locator('#btnTeacherToolsAppControls').click();
    await popup.locator('[data-fusee-pause]').click();
    await runtime.locator('[data-inactivity-seconds]').waitFor();
    await runtime.locator('[data-action="toggle-inactivity"]').click();
    await runtime.locator('[data-inactivity-seconds]').fill("12");
    await runtime.locator('.modal h2').click();
    await page.frames().find(frame => frame.url().includes("tableau=control")).waitForFunction(() => document.querySelector('[data-inactivity-seconds]').value==='12');
    await runtime.locator('[data-action="toggle-inactivity"]').click();
    await runtime.locator('[data-action="unpause"]').click();
    await popup.locator('#teacherToolsAppControls').waitFor({ state:'hidden' });

    // A live snapshot must neither reload the configuration nor erase edits.
    await control.locator("#mission-title").fill("Prochaine préparation");
    await runtimeFrame().evaluate(() => { FuseeApp.getGame().dust=7; FuseeApp.getSavedGame(); });
    await control.getByRole("button", { name:"Afficher la partie", exact:true }).waitFor();
    assert.equal(await control.locator("#mission-title").inputValue(), "Prochaine préparation");
    console.log("Mission launched and snapshots synchronized");
    const frameBeforeSwitch = runtimeFrame();
    await frameBeforeSwitch.evaluate(() => window.tableauRetentionMarker="same-runtime");
    await page.locator("#ttOpenWidgetPicker").click();
    await page.locator('[data-tool-id="clock"]').click();
    await popup.locator(".ttp-fusee-runtime").waitFor({ state:"hidden" });
    const elapsed = await frameBeforeSwitch.evaluate(() => FuseeApp.getGame().elapsed);
    await page.waitForTimeout(1200);
    assert.equal(await frameBeforeSwitch.evaluate(() => FuseeApp.getGame().elapsed), elapsed);
    await page.locator('[data-select-page^="fusee-"]').click();
    await runtime.getByRole("button", { name:"Reprendre la mission", exact:true }).click();
    assert.equal(await runtimeFrame().evaluate(() => window.tableauRetentionMarker), "same-runtime");
    assert.equal(await runtimeFrame().evaluate(() => FuseeApp.getGame().dust), 7);
    assert.equal(await control.locator("#mission-title").inputValue(), "Prochaine préparation");

    console.log("Page switch and resume verified");
    // Suspending an exercise retains its checkpoint and returns to the question.
    await runtimeFrame().evaluate(() => {
      const game=FuseeApp.getGame();game.phase="resource";game.pendingResource="eau";
      game.pendingQuestionPlayer=game.active;game.pendingPlanet="p0";game.pendingQuestionReason="planet";
      document.querySelector('[data-action="resource-eau"]')?.remove();
      const button=document.createElement("button");button.dataset.action="resource-eau";
      document.body.append(button);button.click();button.remove();
    });
    await runtime.locator(".tujer-question-host .session-page").waitFor();
    await runtimeFrame().waitForFunction(() => !!FuseeApp.getSavedGame()?.snapshot?.questionCheckpoint);
    const question = await runtimeFrame().evaluate(() => FuseeApp.getGame().question);
    await page.locator('[data-select-page^="clock-"]').click();
    await popup.locator(".ttp-fusee-runtime").waitFor({ state:"hidden" });
    await page.locator('[data-select-page^="fusee-"]').click();
    await runtime.getByRole("button", { name:"Reprendre la mission", exact:true }).click();
    await runtime.locator(".tujer-question-host .session-page").waitFor();
    assert.deepEqual(await runtimeFrame().evaluate(() => FuseeApp.getGame().question), question);
    await popup.screenshot({ path:join(screenshots, "question.png") });

    await page.reload();
    await page.waitForFunction(() => window.ready);
    await control.locator('#mission-title').waitFor();
    assert.equal(await control.locator('#mission-title').inputValue(), "Prochaine préparation");
    await page.evaluate(() => window.controller.openTool("fusee"));
    assert.equal(await page.locator('[data-select-page^="fusee-"]').count(), 1);
    assert.equal(await runtimeFrame().evaluate(() => window.tableauRetentionMarker), "same-runtime");

    // Closing/reopening the projection restores the latest saved mission.
    await popup.close();
    const reopenedPromise = page.waitForEvent("popup");
    await control.getByRole("button", { name:/Afficher la partie|Reprendre la partie/ }).click();
    const reopened = await reopenedPromise;
    await reopened.waitForURL("**/teacher-tools-projector.html?**");
    await reopened.locator("#btnTeacherToolsLaunch").click();
    await reopened.frameLocator('iframe[title="Jeu La Fusée"]').locator(".tujer-question-host .session-page").waitFor({ timeout:25000 });
    const restored = reopened.frames().find(frame => frame.url().includes("tableau=runtime"));
    assert.equal(await restored.evaluate(() => FuseeApp.getGame().dust), 7);
    assert.equal(await restored.evaluate(() => FuseeApp.getGame().phase), "question");

    // The controls stay usable at a narrow dashboard width.
    await page.setViewportSize({ width:900, height:800 });
    await page.screenshot({ path:join(screenshots, "configuration-narrow.png") });
    const controlBounds = await page.locator('iframe[title="Préparation de La Fusée"]').boundingBox();
    assert.ok(controlBounds.width>400 && controlBounds.height>300 && controlBounds.y<400, "The narrow control pane must remain visible and usable");
    assert.equal(await control.locator("#mission-title").inputValue(), "Prochaine préparation");
    assert.deepEqual(errors, []);
  } catch(error) { console.error("Browser errors:", errors); await page.screenshot({path:join(screenshots,"failure.png")}); throw error; } finally { await context.close(); }
});

test("The original game remains usable and its preparation can be picked up in the Tableau", async () => {
  const context = await browser.newContext({ viewport:{ width:1440, height:1000 } });
  await context.route("**/*", route => route.request().url().startsWith(origin + "/") ? route.continue() : route.abort());
  const page = await context.newPage();
  try {
    await page.goto(origin + "/games/fusee/");
    await page.locator('#mission-title').fill("Préparation existante");
    await page.locator('#duration').click();
    await page.getByRole('tab', { name:'Les activités', exact:true }).click();
    await page.locator('#activity-select').selectOption('addition');
    const config=await page.evaluate(() => FuseeApp.getConfig());
    for (const key of Object.keys(config.targets)) config.targets[key]=key==='carburant'?1:0;
    config.automaticControlEnabled=false;
    await page.evaluate(config => FuseeApp.setConfig(config),config);
    const popupPromise=page.waitForEvent('popup');
    await page.getByRole('button',{name:'Commencer la mission',exact:true}).click();
    const runtime=await popupPromise;
    await runtime.getByRole('button',{name:'Démarrer la mission',exact:true}).click({timeout:25000});
    assert.match(runtime.url(),/runtime=1/);
    assert.ok(!runtime.url().includes('tableau='));
    await runtime.close();
    await page.goto(origin + "/teacher/fixture");
    await page.waitForFunction(() => window.ready);
    await page.evaluate(() => window.controller.openTool('fusee'));
    const control=page.frameLocator('iframe[title="Préparation de La Fusée"]');
    await control.locator('#mission-title').waitFor();
    assert.equal(await control.locator('#mission-title').inputValue(),"Préparation existante");
    await control.getByRole('button',{name:/Reprendre la partie|Afficher la partie/}).waitFor();
  } finally { await context.close(); }
});

test("A delayed snapshot from the previous mission cannot replace the new game", () => {
  const saved = { version:2, snapshot:{ config:{ title:"New mission" } } };
  assert.equal(applyFuseeAction({ state:{ saved, launchId:"new" }, action:"runtime:save", payload:{ saved:{ version:2,snapshot:{} },launchId:"old" } }), null);
});
