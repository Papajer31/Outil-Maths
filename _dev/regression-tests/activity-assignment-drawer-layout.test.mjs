// Run: node --test _dev/regression-tests/activity-assignment-drawer-layout.test.mjs
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
        <link rel="stylesheet" href="/teacher/css/dashboard.css">
        <link rel="stylesheet" href="/teacher/css/config-widgets.css">
        <style>html,body,#view{width:100%;height:100%;margin:0}#view{position:relative;overflow:hidden}</style>
        <div id="view"></div>`);
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

test("activity assignment drawer fills the view and moves vertically", async (t) => {
  const page = await browser.newPage({ viewport:{ width:1280, height:720 } });
  t.after(() => page.close());
  await page.route("**/*", (route) => new URL(route.request().url()).origin === baseUrl ? route.continue() : route.abort());
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], "No uncaught browser errors"));

  await page.goto(baseUrl);
  await page.evaluate(async () => {
    const { createActivityAssignmentViewController } = await import("/teacher/js/dashboard/activity-assignment-view.js");
    const controller = createActivityAssignmentViewController({
      view:document.querySelector("#view"),
      getCurrentTeacherSpace:() => ({ id:"test-space" }),
      listCatalogActivitiesForTeacherSpace:async () => [{ id:"site-reading", config_name:"Lecture guidée", pedagogical_node_id:"site-reading-folder", status:"published" }],
      listPedagogicalNodesForTeacher:async () => [
        { id:"site-cycle", name:"Cycle 2", parent_id:null },
        { id:"site-reading-folder", name:"Lecture", parent_id:"site-cycle" }
      ],
      listTeacherActivitiesForSpace:async () => [{ id:"personal-mental", title:"Calcul mental", folder_id:"personal-math", activity_type:"tool", difficulty_mode:"adaptive" }],
      listTeacherActivityFoldersForSpace:async () => [{ id:"personal-math", name:"Mathématiques", parent_id:null }],
      listTeacherSequencesForSpace:async () => [{ id:"sequence-math", title:"Parcours de calcul", folder_id:"personal-math", items:[] }],
      listTeacherClasses:async () => [{ id:"101", name:"CM1" }],
      listStudentsForTeacherSpace:async () => [
        { id:"201", teacher_class_id:"101", first_name:"Alice" },
        { id:"202", teacher_class_id:"101", first_name:"Basile" },
        { id:"203", teacher_class_id:"101", first_name:"Chloé" }
      ],
      listActivityAssignmentsForSpace:async () => [{
        id:"assignment-1",
        source_type:"teacher_activity",
        source_id:"personal-mental",
        title_snapshot:"Calcul mental",
        difficulty_mode:"fixed",
        difficulty_level:4,
        execution_limit_mode:"time",
        execution_limit_value:600,
        is_active:true,
        targets:[
          { target_type:"student", student_id:"201" },
          { target_type:"student", student_id:"203" }
        ],
        completions:[
          { student_id:"201", completed_at:"2026-09-23T10:00:00Z" }
        ]
      }],
      saveActivityAssignmentForSpace:async (spaceId, assignment, targets) => {
        window.__assignmentCalls.duplicates.push({ spaceId, assignment, targets });
        return { ...assignment, id:"assignment-copy", teacher_space_id:spaceId, is_active:true, targets };
      },
      setActivityAssignmentActive:async (assignmentId, isActive) => {
        window.__assignmentCalls.active.push({ assignmentId, isActive });
        return { id:assignmentId, is_active:isActive };
      },
      reassignActivityAssignment:async (assignmentId) => {
        window.__assignmentCalls.reassigned.push(assignmentId);
        return 1;
      }
    });
    window.__assignmentCalls = { duplicates:[], active:[], reassigned:[] };
    await controller.render();
  });

  const assignmentRow = page.locator("[data-assignment-row-id='assignment-1']");
  const assignmentTile = assignmentRow.locator("[data-action='edit-assignment']");
  assert.equal(await assignmentTile.locator(".activity-assignment-current-title").evaluate((title) => getComputedStyle(title).color), "rgb(255, 176, 32)", "the assignment title is yellow");
  assert.equal(await assignmentTile.getByText("Mes activités", { exact:true }).count(), 0, "the source provenance is omitted from the assignment tile");
  assert.deepEqual(await assignmentTile.locator(".activity-assignment-current-student > span:first-child").allTextContents(), ["Alice", "Chloé"], "assigned students are individually visible");
  const aliceTile = assignmentTile.locator(".activity-assignment-current-student", { hasText:"Alice" });
  const chloeTile = assignmentTile.locator(".activity-assignment-current-student", { hasText:"Chloé" });
  assert.equal(await aliceTile.locator("[aria-label='Activité effectuée']").count(), 1, "a completed student has a validation icon");
  assert.equal(await aliceTile.evaluate((student) => student.classList.contains("is-completed")), true, "a completed student has a distinct visual state");
  assert.equal(await chloeTile.locator("[aria-label='Activité effectuée']").count(), 0, "an unfinished student has no validation icon");
  const tileSurface = await assignmentTile.evaluate((button) => {
    const tile = button.closest(".activity-assignment-current-row--overview");
    const container = tile.closest(".activity-assignment-overview");
    const style = getComputedStyle(tile);
    return {
      borderWidth:style.borderTopWidth,
      borderStyle:style.borderTopStyle,
      tileBackground:style.backgroundColor,
      containerBackground:getComputedStyle(container).backgroundColor
    };
  });
  assert.equal(tileSurface.borderWidth, "1px", "the assignment tile has a complete border");
  assert.equal(tileSurface.borderStyle, "solid");
  assert.notEqual(tileSurface.tileBackground, tileSurface.containerBackground, "the assignment tile is lighter than its container");
  const actionBoxes = await assignmentRow.locator(".activity-assignment-current-actions > button").evaluateAll((buttons) => buttons.map((button) => {
    const bounds = button.getBoundingClientRect();
    return { left:bounds.left, right:bounds.right, width:bounds.width };
  }));
  assert.ok(actionBoxes.every((box, index) => !index || box.left >= actionBoxes[index - 1].right), `tile actions must not overlap: ${JSON.stringify(actionBoxes)}`);

  await assignmentRow.getByRole("button", { name:"Dupliquer l’attribution Calcul mental" }).click();
  await page.locator("[data-assignment-row-id='assignment-copy']").waitFor();
  assert.equal((await page.evaluate(() => window.__assignmentCalls.duplicates)).length, 1, "duplicate reuses the complete assignment configuration");
  assert.equal(await page.locator("[data-assignment-row-id='assignment-copy'] [aria-label='Activité effectuée']").count(), 0, "a duplicate starts without completion state");

  await assignmentRow.getByRole("button", { name:"Suspendre l’attribution Calcul mental" }).click();
  await assignmentRow.getByRole("button", { name:"Réactiver l’attribution Calcul mental" }).waitFor();
  assert.equal(await assignmentRow.locator(".activity-assignment-current-status").textContent(), "pauseEn pause");
  await assignmentRow.getByRole("button", { name:"Réactiver l’attribution Calcul mental" }).click();
  await assignmentRow.getByRole("button", { name:"Suspendre l’attribution Calcul mental" }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.__assignmentCalls.active), [
    { assignmentId:"assignment-1", isActive:false },
    { assignmentId:"assignment-1", isActive:true }
  ], "pause and resume persist the assignment state");

  await assignmentRow.getByRole("button", { name:"Réattribuer Calcul mental" }).click();
  await page.getByRole("button", { name:"Réattribuer", exact:true }).click();
  await page.waitForFunction(() => window.__assignmentCalls.reassigned.length === 1);
  assert.equal(await assignmentRow.locator("[aria-label='Activité effectuée']").count(), 0, "reassigning clears the visible completion state");

  await page.getByRole("button", { name:"Attribuer des activités" }).first().click();
  const drawer = page.locator(".activity-assignment-drawer");
  await drawer.waitFor();
  const openingFrames = await drawer.evaluate((element) => element.getAnimations()[0]?.effect?.getKeyframes?.().map((frame) => frame.transform) || []);
  assert.match(String(openingFrames[0]), /112%/, "the drawer enters from below");
  await drawer.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));

  const bounds = await page.evaluate(() => {
    const shell = document.querySelector(".activity-assignment-shell").getBoundingClientRect();
    const panel = document.querySelector(".activity-assignment-drawer").getBoundingClientRect();
    return {
      shell:{ left:shell.left, top:shell.top, right:shell.right, bottom:shell.bottom },
      panel:{ left:panel.left, top:panel.top, right:panel.right, bottom:panel.bottom }
    };
  });
  assert.deepEqual(bounds.panel, bounds.shell, "the assignment drawer covers the complete assignment view");
  assert.equal(await page.locator(".activity-assignment-drawer-scrim").count(), 0, "a full-screen drawer has no redundant background scrim");
  assert.equal(await page.getByText("Choisis une activité ou une séquence", { exact:false }).count(), 0, "the redundant instruction is removed");
  assert.equal(await page.getByText("SÉLECTION", { exact:true }).count(), 1);
  assert.equal(await page.getByText("ATTRIBUTION", { exact:true }).count(), 1);

  const columns = await page.evaluate(() => {
    const body = document.querySelector(".activity-assignment-drawer-body").getBoundingClientRect();
    const left = document.querySelector(".activity-assignment-source-column").getBoundingClientRect();
    const right = document.querySelector(".activity-assignment-config-column").getBoundingClientRect();
    const leftStyle = getComputedStyle(document.querySelector(".activity-assignment-source-column"));
    return {
      body:{ top:body.top, bottom:body.bottom, left:body.left, right:body.right },
      left:{ top:left.top, bottom:left.bottom, left:left.left, right:left.right },
      right:{ top:right.top, bottom:right.bottom, left:right.left, right:right.right },
      divider:leftStyle.borderRightWidth
    };
  });
  assert.equal(columns.left.top, columns.body.top);
  assert.equal(columns.right.top, columns.body.top);
  assert.equal(columns.left.bottom, columns.body.bottom);
  assert.equal(columns.right.bottom, columns.body.bottom);
  assert.equal(columns.left.left, columns.body.left);
  assert.equal(columns.right.right, columns.body.right);
  assert.equal(columns.divider, "3px");

  await page.getByRole("button", { name:"Activités", exact:true }).click();
  assert.equal(await page.getByRole("button", { name:"Dossier parent", exact:true }).count(), 1, "Activities is a real parent folder");
  assert.equal(await page.getByRole("button", { name:"Activités du site", exact:true }).count(), 1);
  assert.equal(await page.getByRole("button", { name:"Mes activités", exact:true }).count(), 1);
  await page.getByRole("button", { name:"Activités du site", exact:true }).click();
  await page.getByRole("button", { name:"Cycle 2", exact:true }).click();
  await page.getByRole("button", { name:"Lecture", exact:true }).click();
  assert.equal(await page.getByRole("button", { name:"Lecture guidée", exact:true }).count(), 1, "site activities use the pedagogical tree");
  await page.getByRole("button", { name:"Dossier parent", exact:true }).click();
  await page.getByRole("button", { name:"Dossier parent", exact:true }).click();
  await page.getByRole("button", { name:"Dossier parent", exact:true }).click();
  await page.getByRole("button", { name:"Mes activités", exact:true }).click();
  await page.getByRole("button", { name:"Mathématiques", exact:true }).click();
  assert.equal(await page.getByRole("button", { name:"Calcul mental", exact:true }).count(), 1, "the activity branch contains personal activities");
  assert.equal(await page.getByRole("button", { name:"Parcours de calcul", exact:true }).count(), 0, "the activity branch excludes sequences");

  await page.getByRole("button", { name:"Dossier parent", exact:true }).click();
  await page.getByRole("button", { name:"Dossier parent", exact:true }).click();
  await page.getByRole("button", { name:"Dossier parent", exact:true }).click();
  await page.getByRole("button", { name:"Séquences", exact:true }).click();
  assert.equal(await page.getByRole("button", { name:"Mathématiques", exact:true }).count(), 1, "Sequences opens directly in the personal tree");
  await page.getByRole("button", { name:"Mathématiques", exact:true }).click();
  assert.equal(await page.getByRole("button", { name:"Parcours de calcul", exact:true }).count(), 1, "the sequence branch contains sequences");
  assert.equal(await page.getByRole("button", { name:"Calcul mental", exact:true }).count(), 0, "the sequence branch excludes standalone activities");
  await page.getByRole("button", { name:"Parcours de calcul", exact:true }).click();
  const config = page.locator("#activityAssignmentConfigContent");
  const selectedTitle = config.getByText("Parcours de calcul", { exact:true });
  assert.equal(await selectedTitle.count(), 1);
  assert.equal(await selectedTitle.evaluate((title) => getComputedStyle(title).color), "rgb(255, 176, 32)", "the selected title uses the usual yellow");
  assert.equal(await config.getByText("Mes activités", { exact:true }).count(), 0, "the source provenance is not repeated");
  assert.equal(await config.locator(".activity-assignment-recipients-block").evaluate((block) => getComputedStyle(block).borderRadius), "0px", "recipient wrapper has square corners");

  const wholeClass = config.getByRole("checkbox", { name:"Toute la classe" });
  const alice = config.getByRole("checkbox", { name:"Alice" });
  const basile = config.getByRole("checkbox", { name:"Basile" });
  const chloe = config.getByRole("checkbox", { name:"Chloé" });
  await wholeClass.click();
  assert.equal(await wholeClass.isChecked(), true);
  assert.equal(await alice.isChecked(), true);
  assert.equal(await basile.isChecked(), true);
  assert.equal(await chloe.isChecked(), true);
  await alice.click();
  assert.equal(await wholeClass.isChecked(), false, "clicking one student clears the whole-class selection");
  assert.equal(await alice.isChecked(), false);
  assert.equal(await basile.isChecked(), true, "other students stay selected");
  assert.equal(await chloe.isChecked(), true, "other students stay selected");
  await wholeClass.click();
  assert.equal(await alice.isChecked(), true, "selecting the whole class selects every student pill");
  await wholeClass.click();
  assert.equal(await alice.isChecked(), false, "clearing the whole class clears every student pill");
  assert.equal(await basile.isChecked(), false);
  assert.equal(await chloe.isChecked(), false);

  await page.getByRole("button", { name:"Dossier parent", exact:true }).click();
  await page.getByRole("button", { name:"Dossier parent", exact:true }).click();
  await page.getByRole("button", { name:"Activités", exact:true }).click();
  await page.getByRole("button", { name:"Mes activités", exact:true }).click();
  await page.getByRole("button", { name:"Mathématiques", exact:true }).click();
  await page.getByRole("button", { name:"Calcul mental", exact:true }).click();
  const rules = config.locator(".activity-assignment-rules-block");
  assert.equal(await config.getByText("Calcul mental", { exact:true }).evaluate((title) => getComputedStyle(title).color), "rgb(255, 176, 32)", "the activity title is yellow in the assignment panel");
  assert.equal(await rules.getByText("Règles de passation", { exact:true }).count(), 1);
  assert.equal(await rules.evaluate((block) => getComputedStyle(block).borderRadius), "0px", "rules wrapper has square corners");
  assert.equal(await config.getByText("Destinataires", { exact:true }).evaluate((title) => getComputedStyle(title).fontSize), "20.8px", "recipient heading is larger");
  assert.equal(await rules.getByText("Règles de passation", { exact:true }).evaluate((title) => getComputedStyle(title).fontSize), "20.8px", "rules heading is larger");
  const inlineRules = await rules.evaluate((block) => {
    const line = block.querySelector(".activity-assignment-rules-line");
    const difficulty = block.querySelector("#activityAssignmentDifficulty").getBoundingClientRect();
    const passation = block.querySelector("#activityAssignmentExecutionMode").getBoundingClientRect();
    const setter = block.querySelector(".dashboard-sequence-limit-stepper").getBoundingClientRect();
    return {
      difficultyCenter:difficulty.top + difficulty.height / 2,
      passationCenter:passation.top + passation.height / 2,
      setterCenter:setter.top + setter.height / 2,
      lineWidth:line.getBoundingClientRect().width,
      lineScrollWidth:line.scrollWidth
    };
  });
  assert.ok(Math.abs(inlineRules.difficultyCenter - inlineRules.passationCenter) < 2, `difficulty and passation stay on one line: ${JSON.stringify(inlineRules)}`);
  assert.ok(Math.abs(inlineRules.passationCenter - inlineRules.setterCenter) < 2, `the setter stays on the rules line: ${JSON.stringify(inlineRules)}`);
  const stepperInput = rules.locator(".tv-input-stepper");
  assert.equal(await stepperInput.getAttribute("type"), "text", "the rules setter has no native number arrows");
  assert.equal(await stepperInput.inputValue(), "5");
  await rules.getByRole("button", { name:"Augmenter Nombre de questions" }).click();
  assert.equal(await stepperInput.inputValue(), "6", "the common increment button updates the setter");
  await rules.getByRole("button", { name:"Diminuer Nombre de questions" }).click();
  assert.equal(await stepperInput.inputValue(), "5", "the common decrement button updates the setter");

  assert.equal(await page.locator(".activity-assignment-drawer.is-opening").count(), 0, "internal updates do not replay the opening motion");

  await page.getByRole("button", { name:"Fermer le volet" }).click();
  await page.locator(".activity-assignment-drawer").waitFor({ state:"detached" });

  await page.locator("[data-action='edit-assignment'][data-assignment-id='assignment-1']").click();
  await page.locator(".activity-assignment-drawer").waitFor();
  assert.equal(await page.getByText("Modifier l’attribution", { exact:true }).count(), 1, "clicking an assignment opens edit mode");
  const editingConfig = page.locator("#activityAssignmentConfigContent");
  assert.equal(await editingConfig.getByText("Calcul mental", { exact:true }).count(), 1, "the existing source is restored");
  assert.equal(await page.locator(".activity-assignment-picker-item.is-selected").getByText("Calcul mental", { exact:true }).count(), 1, "the existing source is selected in the picker");
  assert.equal(await editingConfig.locator("#activityAssignmentDifficulty").inputValue(), "4", "the existing difficulty is restored");
  assert.equal(await editingConfig.locator("#activityAssignmentExecutionMode").inputValue(), "time", "the existing passation mode is restored");
  assert.equal(await editingConfig.locator(".tv-input-stepper").inputValue(), "10", "the existing duration is restored in minutes");
  assert.equal(await editingConfig.getByRole("checkbox", { name:"Alice" }).isChecked(), true, "existing student selections are restored");
  assert.equal(await editingConfig.getByRole("checkbox", { name:"Basile" }).isChecked(), false);
  assert.equal(await editingConfig.getByRole("checkbox", { name:"Chloé" }).isChecked(), true, "existing student selections are restored");
  assert.equal(await editingConfig.getByRole("button", { name:"Enregistrer" }).count(), 1, "edit mode saves the existing assignment");
});
