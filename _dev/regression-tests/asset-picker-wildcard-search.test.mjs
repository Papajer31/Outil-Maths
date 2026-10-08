// Run: node --test _dev/regression-tests/asset-picker-wildcard-search.test.mjs
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../responsive-audit/node_modules/playwright/index.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
let server;
let browser;
let baseUrl;

before(async () => {
  server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end('<!doctype html><link rel="stylesheet" href="/shared/tool-assets/asset-picker.css">');
      return;
    }
    const filename = path.resolve(root, `.${decodeURIComponent(pathname)}`);
    if (!filename.startsWith(path.resolve(root) + path.sep)) return response.writeHead(403).end();
    try {
      response.setHeader("Content-Type", pathname.endsWith(".js") ? "text/javascript" : "text/css");
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

test("picker wildcard searches match word positions and preserve navigation and selection", async (t) => {
  const page = await browser.newPage({ viewport:{ width:1280, height:900 } });
  t.after(() => page.close());
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => new URL(route.request().url()).origin === baseUrl ? route.continue() : route.abort());
  await page.goto(baseUrl);
  await page.evaluate(async () => {
    const { openToolAssetPicker } = await import("/shared/tool-assets/asset-picker.js");
    const labels = ["avion", "arbre", "chat", "panda", "koala", "boa", "puma", "a", "âne", "été", "table à dessin", "arc en ciel", "explosion", "éclair", "écran", "euros", "étoile", "enveloppe", "éventail", "équerre", "e", "eau", "échelle", "éponge", "extincteur", "bébé", "règle"];
    const image = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>');
    window.pickerResult = openToolAssetPicker({
      multiple:true,
      loadAssets:() => ({
        folders:[
          { id:"root", label:"Alphabet", scope:"system" },
          { id:"child", label:"Images", parentId:"root", scope:"system" }
        ],
        assets:[
          ...labels.map((label, index) => ({
            id:`technical-a-${index}`, label, type:"image", scope:"system", url:image,
            folderId:label === "chat" ? "child" : "root", folderPath:"Alphabet / Images"
          })),
          { id:"outside", label:"abeille", type:"image", scope:"system", url:image },
          { id:"personal", label:"abricot", type:"image", scope:"personal", url:image }
        ]
      })
    });
  });
  await page.locator('[data-tool-asset-folder="root"]').click();
  const search = page.locator(".tool-asset-picker-search-input");
  const results = () => page.locator("[data-tool-asset-id] .tool-asset-picker-label").allTextContents();
  const check = async (query, expected) => {
    await search.fill(query);
    assert.deepEqual((await results()).sort(), [...expected].sort(), `Search ${query}`);
  };

  await check("a*", ["avion", "arbre", "a", "arc en ciel"]);
  await check("*a", ["panda", "koala", "boa", "puma", "a"]);
  await check("*a*", ["chat", "panda", "koala", "table à dessin", "éclair", "écran", "éventail", "eau"]);
  await check("**a**", ["chat", "panda", "koala", "table à dessin", "éclair", "écran", "éventail", "eau"]);
  await check("Â*", ["âne"]);
  await check("a*e", ["arbre"]);
  await check("é*", ["été", "éclair", "écran", "étoile", "éventail", "équerre", "échelle", "éponge"]);
  await check("É*", ["été", "éclair", "écran", "étoile", "éventail", "équerre", "échelle", "éponge"]);
  await check("e\u0301*", ["été", "éclair", "écran", "étoile", "éventail", "équerre", "échelle", "éponge"]);
  await check("e*", ["arc en ciel", "explosion", "euros", "enveloppe", "e", "eau", "extincteur"]);
  await check("*é", ["été", "bébé"]);
  await check("*é*", ["bébé"]);
  await check("*è*", ["règle"]);
  await check("ch*t", ["chat"]);
  await check("t* dessin", ["table à dessin"]);
  await check("été", ["été"]);
  await check("dess", ["table à dessin"]);
  await check("z*", []);
  await check("*", ["avion", "arbre", "chat", "panda", "koala", "boa", "puma", "a", "âne", "été", "table à dessin", "arc en ciel", "explosion", "éclair", "écran", "euros", "étoile", "enveloppe", "éventail", "équerre", "e", "eau", "échelle", "éponge", "extincteur", "bébé", "règle"]);

  await check("*a*", ["chat", "panda", "koala", "table à dessin", "éclair", "écran", "éventail", "eau"]);
  await page.locator('[data-tool-asset-id="technical-a-2"]').click();
  await search.fill("");
  assert.equal(await page.locator('[data-tool-asset-folder="child"]').count(), 1);
  assert.ok(!(await results()).includes("chat"));
  await page.locator('[data-tool-asset-folder="child"]').click();
  await check("*a*", ["chat"]);
  assert.equal(await page.locator('[data-tool-asset-id="technical-a-2"]').getAttribute("aria-selected"), "true");
  await search.fill("");
  await page.locator("[data-tool-asset-parent]").click();
  assert.equal(await page.locator('[data-tool-asset-folder="child"]').count(), 1);
  await page.locator("[data-tool-asset-confirm]").click();
  assert.deepEqual(await page.evaluate(async () => (await window.pickerResult).map((asset) => asset.label)), ["chat"]);
  assert.deepEqual(errors, []);
});
