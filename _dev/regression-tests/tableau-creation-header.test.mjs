// Run: node --test --test-isolation=none _dev/regression-tests/tableau-creation-header.test.mjs
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep, join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "../responsive-audit/node_modules/playwright/index.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const screenshots = join(tmpdir(), "portail-tableau-creation-header");
const fixture = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<link rel="stylesheet" href="/css/base.css"><link rel="stylesheet" href="/css/ui.css">
<link rel="stylesheet" href="/teacher/css/dashboard.css"><link rel="stylesheet" href="/teacher/css/teacher-tools.css">
<style>html,body{height:100%;margin:0}#host{height:100dvh;display:flex;flex-direction:column}</style>
</head><body><div class="dashboard-content-view dashboard-teacher-tools-view" style="height:100dvh"><div id="host" class="dashboard-teacher-tools-host"></div></div><script type="module">
import { createTeacherToolsViewController } from "/teacher/js/dashboard/teacher-tools-view.js";
import { startMaterialIconHydration } from "/shared/material-icons-svg.js";
startMaterialIconHydration();
window.resources=[];window.documents={};window.operations=[];window.toasts=[];
window.controller=createTeacherToolsViewController({host:document.getElementById("host"),
getCurrentTeacherSpace:()=>({id:"test-space"}),getCurrentStudents:()=>[],
listResourcesForSpace:async()=>window.resources,
showToast:message=>{window.toasts.push(message);}});
await window.controller.render();window.ready=true;
</script></body></html>`;
// Only remote account/storage operations are replaced. The actual creation
// service, serializers, dialogs, controller and mini-app modules run unchanged.
const apiFixture = `
export const TEACHER_RESOURCE_STORAGE_QUOTA_BYTES=100*1024*1024;
export const ensureTujerResourceFoundationForSpace=async()=>({});
export const ensureTujerManagedFolderPathForSpace=async()=>({id:"creations-folder"});
export const listResourcesForSpace=async()=>window.resources;
export const replaceTujerCreationResourceRefs=async()=>{};
export const createResourceSignedUrl=async resource=>URL.createObjectURL(new Blob([JSON.stringify(window.documents[resource.id])],{type:"application/json"}));
async function store(id,file,options,kind){
  if(window.blockSaves)await new Promise(resolve=>{window.releaseSave=resolve;});
  if(window.failSave)throw new Error(window.failSave);
  const document=JSON.parse(await file.text());
  const resource={id,type:"creation",is_system:false,size_bytes:file.size,...options};
  window.documents[id]=document;
  window.resources=window.resources.filter(row=>row.id!==id).concat(resource);
  window.operations.push({kind,id,document});return resource;
}
export const uploadResourceForSpace=async(space,file,options)=>store("resource-"+(window.resources.length+1),file,options,"upload");
export const replacePersonalResourceFile=async(id,file,options)=>store(id,file,options,"replace");
`;
const mime = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".svg":"image/svg+xml", ".png":"image/png", ".jpg":"image/jpeg", ".webp":"image/webp", ".ttf":"font/ttf", ".woff2":"font/woff2", ".otf":"font/otf" };
let server, browser, origin;
before(async () => {
  await mkdir(screenshots, { recursive:true });
  server=createServer(async (req,res) => {
    const pathname=new URL(req.url,"http://localhost").pathname;
    if(pathname==="/teacher/fixture"){res.setHeader("Content-Type","text/html; charset=utf-8");res.end(fixture);return;}
    if(pathname==="/teacher/js/teacher-api.js"){res.setHeader("Content-Type","text/javascript; charset=utf-8");res.end(apiFixture);return;}
    const file=resolve(root,"."+decodeURIComponent(pathname));
    if(!file.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403).end();return;}
    try{res.setHeader("Content-Type",(mime[extname(file)]||"application/octet-stream")+"; charset=utf-8");res.end(await readFile(file));}catch{res.writeHead(404).end();}
  });
  await new Promise(done=>server.listen(0,"127.0.0.1",done));
  origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();await new Promise(done=>server.close(done));});

async function openPage(){
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route("**/*",route=>route.request().url().startsWith(origin+"/")?route.continue():route.abort());
  const page=await context.newPage(),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto(origin+"/teacher/fixture");await page.waitForFunction(()=>window.ready);
  return {context,page,errors};
}
const action=(page,name)=>page.locator(`.tt-app-control-header [data-page-creation-action="${name}"]`);
async function saveNamed(page,title){
  const dialog=page.getByRole("dialog",{name:/Enregistrer/});
  await dialog.locator("input").fill(title);await dialog.locator('[data-action="confirm"]').click();
  await dialog.waitFor({state:"hidden"});
}
for(const [tool,type] of [["labels","tableau.page.labels-text"],["image-labels","tableau.page.image-labels"],["multi-images","tableau.page.multi-images"]]){
  test(`${tool}: creation actions in the header save, update, copy and reopen the page`,async()=>{
    const {context,page,errors}=await openPage();
    try{
      await page.evaluate(tool=>controller.openTool(tool),tool);
      const headerLabels=()=>page.locator(".tt-app-control-header button").evaluateAll(buttons=>buttons.map(button=>button.getAttribute("aria-label")||button.querySelector("span:last-child")?.textContent));
      assert.deepEqual(await headerLabels(),["Enregistrer dans mes créations","Ouvrir une création","Fond","Fermer la page"]);
      assert.equal(await page.locator(".tt-labels-creation-bar").count(),0);
      assert.equal(await page.locator("[data-app-control] [data-page-creation-action]").count(),0);
      if(tool==="labels"){
        await page.locator("#ttLabelsText").fill("Première étiquette");await page.locator("#ttLabelsApplyText").click();
        await page.locator("[data-toggle-background]").click();
        await page.locator("#ttSurfaceBackgroundType").selectOption("space");
        await page.locator("[data-toggle-background]").click();
      }
      const title=`Création ${tool}`;
      await action(page,"save").click();await saveNamed(page,title);
      await action(page,"update").waitFor();
      assert.deepEqual(await headerLabels(),["Mettre à jour","Enregistrer une copie","Ouvrir une création","Fond","Fermer la page"]);
      const first=await page.evaluate(()=>operations[0]);
      assert.equal(first.document.creationType,type);assert.equal(first.document.title,title);
      if(tool==="labels"){
        assert.equal(first.document.payload.page.state.items[0].text,"Première étiquette");
        assert.equal(first.document.payload.page.surface.background.background,"space");
        await page.locator("#ttLabelsText").fill("Étiquette modifiée");await page.locator("#ttLabelsApplyText").click();
      }
      await action(page,"update").click();await page.waitForFunction(()=>operations.length===2);
      assert.equal((await page.evaluate(()=>operations[1])).id,first.id);
      assert.equal(await page.evaluate(()=>resources.length),1);
      await action(page,"copy").click();await saveNamed(page,title+" - copie");
      await action(page,"update").waitFor();
      const copy=await page.evaluate(()=>operations[2]);
      assert.notEqual(copy.id,first.id);assert.equal(copy.document.title,title+" - copie");
      assert.equal(await page.evaluate(()=>resources.length),2);
      await action(page,"open").click();
      const picker=page.locator("dialog.tt-labels-creation-picker");
      await picker.locator(`[data-page-open-creation="${first.id}"]`).click();await picker.waitFor({state:"hidden"});
      assert.equal(await action(page,"update").getAttribute("title"),`Mettre à jour « ${title} »`);
      if(tool==="labels")assert.equal(await page.locator("#ttLabelsText").inputValue(),"Étiquette modifiée");
      for(const viewport of [{width:1440,height:1000},{width:900,height:800}]){
        await page.setViewportSize(viewport);
        const header=page.locator(".tt-app-control-header");
        const overflow=await header.evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth}));
        assert.ok(overflow.scroll<=overflow.client,JSON.stringify({tool,viewport,overflow}));
        await page.screenshot({path:join(screenshots,`${tool}-${viewport.width}.png`)});
      }
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  });
}

test("Saving survives header refresh and stays attached to its original page",async()=>{
  const {context,page,errors}=await openPage();
  try{
    await page.evaluate(()=>controller.openTool("labels"));
    await action(page,"save").click();await saveNamed(page,"Ma création");
    const labelsPage=await page.locator('[data-select-page^="labels-"]').getAttribute("data-select-page");
    const originalId=await page.evaluate(()=>resources[0].id);
    await page.evaluate(()=>{window.blockSaves=true;});
    await action(page,"update").click();await page.waitForFunction(()=>!!window.releaseSave);
    await page.evaluate(()=>controller.refresh());
    assert.equal(await action(page,"update").isDisabled(),true);
    await page.evaluate(()=>controller.openTool("image-labels"));
    assert.equal(await action(page,"save").isEnabled(),true);
    await page.evaluate(()=>{window.blockSaves=false;window.releaseSave();});
    await page.waitForFunction(()=>operations.length===2);
    assert.equal((await page.evaluate(()=>operations[1])).id,originalId);
    assert.equal(await action(page,"update").count(),0);
    await page.locator(`[data-select-page="${labelsPage}"]`).click();
    assert.equal(await action(page,"update").isEnabled(),true);
    await page.evaluate(()=>{window.failSave="Échec simulé";});
    await action(page,"update").click();await page.waitForFunction(()=>toasts.includes("Échec simulé"));
    assert.equal(await action(page,"update").isEnabled(),true);
    assert.equal(await action(page,"copy").isEnabled(),true);
    await page.evaluate(()=>controller.openTool("clock"));
    assert.equal(await page.locator(".tt-app-control-header [data-page-creation-action]").count(),0);
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
