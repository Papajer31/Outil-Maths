#!/usr/bin/env node
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const CONFIG_PATH = path.join(__dirname, "responsive-audit.config.json");

const args = parseCliArgs(process.argv.slice(2));
const config = await loadConfig(CONFIG_PATH, args);
const outputRoot = path.resolve(PROJECT_ROOT, config.outputDir || "responsive-audit-output");
const screenshotsDir = path.join(outputRoot, "screenshots");

const { RUNTIME_VIEWPORT_PROFILES } = await import(pathToFileURL(path.join(PROJECT_ROOT, "shared", "responsive-profiles.js")).href);
const { CATALOG_ACTIVITIES } = await import(pathToFileURL(path.join(PROJECT_ROOT, "shared", "catalogue.js")).href);
const { getActiveToolsRegistry } = await import(pathToFileURL(path.join(PROJECT_ROOT, "tools", "registry.js")).href);

const allProfiles = [...RUNTIME_VIEWPORT_PROFILES];
const allTools = getAuditTools(getActiveToolsRegistry(), CATALOG_ACTIVITIES);
const selectedProfiles = selectProfiles(allProfiles, config.profiles, args.profiles);
const selectedTools = selectTools(allTools, config.tools, args.tools);

if (!selectedProfiles.length) throw new Error("Aucun profil viewport sélectionné.");
if (!selectedTools.length) throw new Error("Aucun outil sélectionné.");

await prepareOutput(outputRoot, screenshotsDir);
const server = await startStaticServer(PROJECT_ROOT, Number(config.serverPort) || 4177);
const startedAt = new Date();

const report = {
  version: 1,
  kind: "responsive-audit",
  generatedAt: startedAt.toISOString(),
  projectRoot: PROJECT_ROOT,
  baseUrl: server.baseUrl,
  config: sanitizeReportConfig(config),
  profiles: selectedProfiles.map((profile) => pickProfileReport(profile)),
  tools: selectedTools.map((tool) => pickToolReport(tool)),
  summary: {
    totalCases: selectedProfiles.length * selectedTools.length,
    okCases: 0,
    warningCases: 0,
    errorCases: 0,
    fatalCases: 0
  },
  cases: []
};

console.log(`\nAudit responsive local`);
console.log(`Projet : ${PROJECT_ROOT}`);
console.log(`Serveur : ${server.baseUrl}`);
console.log(`Profils : ${selectedProfiles.map((p) => p.label).join(", ")}`);
console.log(`Outils : ${selectedTools.length} outil(s)`);
console.log("");

let browser = null;
try {
  browser = await chromium.launch({ headless: args.headed ? false : config.headless !== false });

  let index = 0;
  for (const tool of selectedTools) {
    for (const profile of selectedProfiles) {
      index += 1;
      const prefix = `[${String(index).padStart(String(report.summary.totalCases).length, "0")}/${report.summary.totalCases}]`;
      process.stdout.write(`${prefix} ${tool.id} — ${profile.label} ... `);
      const result = await auditCase({
        browser,
        baseUrl: server.baseUrl,
        outputRoot,
        screenshotsDir,
        tool,
        profile,
        config
      });
      report.cases.push(result);
      report.summary[`${result.status}Cases`] = (report.summary[`${result.status}Cases`] || 0) + 1;
      console.log(result.status.toUpperCase());
    }
  }

  report.finishedAt = new Date().toISOString();
  report.durationMs = new Date(report.finishedAt).getTime() - startedAt.getTime();
  report.byTool = buildToolSummary(report.cases);
  report.byProfile = buildProfileSummary(report.cases);

  await writeReports(outputRoot, report);
  console.log("\nRapports générés :");
  console.log(`- ${path.join(outputRoot, "report.html")}`);
  console.log(`- ${path.join(outputRoot, "report.json")}`);
  console.log(`- ${path.join(outputRoot, "cases.csv")}`);
  console.log(`- ${screenshotsDir}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  await server.close();
}

async function auditCase({ browser, baseUrl, outputRoot, screenshotsDir, tool, profile, config }) {
  const messages = [];
  const pageErrors = [];
  const failedRequests = [];
  const badResponses = [];
  const token = makeToken(tool.id, profile.id);
  const payload = makeAdminDraftPayload(tool, CATALOG_ACTIVITIES);
  const routeParams = new URLSearchParams({
    adminDraftToken: token,
    catalogTest: "1",
    shared: "1",
    classCode: "ADMINTEST",
    configName: String(payload.activity.id || tool.id)
  });
  const url = `${baseUrl}/index.html?devViewport=1&devViewportWidth=${profile.width}&devViewportHeight=${profile.height}#/session?${routeParams.toString()}`;

  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: 1,
    javaScriptEnabled: true,
    ignoreHTTPSErrors: true
  });

  await context.addInitScript(({ token, payload }) => {
    try {
      window.localStorage.setItem(`adminDraftRuntime:${token}`, JSON.stringify(payload));
    } catch (err) {
      console.warn("Impossible d'écrire le payload adminDraftRuntime.", err);
    }
  }, { token, payload });

  const page = await context.newPage();

  page.on("console", (msg) => {
    const type = msg.type();
    if (!["error", "warning"].includes(type)) return;
    messages.push({ type, text: msg.text().slice(0, 1000) });
  });

  page.on("pageerror", (err) => {
    pageErrors.push(String(err?.message || err).slice(0, 1000));
  });

  page.on("requestfailed", (request) => {
    failedRequests.push({
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText || "request failed"
    });
  });

  page.on("response", (response) => {
    const status = response.status();
    if (status >= 400) {
      badResponses.push({ status, url: response.url() });
    }
  });

  let metrics = null;
  let fatalError = "";
  let screenshotRelativePath = "";

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: Number(config.timeoutMs) || 18000 });
    await waitForRuntimeReady(page, Number(config.timeoutMs) || 18000);
    await page.waitForTimeout(Number(config.waitMsAfterLoad) || 1400);
    await page.evaluate(() => document.fonts?.ready?.catch?.(() => {}) ?? null).catch(() => {});
    metrics = await collectDomMetrics(page, config);

    if (config.screenshot !== false) {
      const screenshotName = `${safeFileName(tool.id)}__${safeFileName(profile.id)}.png`;
      const screenshotPath = path.join(screenshotsDir, screenshotName);
      await page.screenshot({ path: screenshotPath, fullPage: false, animations: "disabled" });
      screenshotRelativePath = path.relative(outputRoot, screenshotPath).replaceAll(path.sep, "/");
    }
  } catch (err) {
    fatalError = String(err?.message || err).slice(0, 2000);
    try {
      const screenshotName = `${safeFileName(tool.id)}__${safeFileName(profile.id)}__fatal.png`;
      const screenshotPath = path.join(screenshotsDir, screenshotName);
      await page.screenshot({ path: screenshotPath, fullPage: false, animations: "disabled" });
      screenshotRelativePath = path.relative(outputRoot, screenshotPath).replaceAll(path.sep, "/");
    } catch {}
  } finally {
    await context.close().catch(() => {});
  }

  const problems = classifyProblems({ metrics, messages, pageErrors, failedRequests, badResponses, fatalError, config });
  const status = fatalError
    ? "fatal"
    : problems.some((problem) => problem.severity === "error")
      ? "error"
      : problems.length
        ? "warning"
        : "ok";

  return {
    status,
    toolId: tool.id,
    toolLabel: tool.label,
    activityId: payload.activity.id,
    profileId: profile.id,
    profileLabel: profile.label,
    width: profile.width,
    height: profile.height,
    screenshot: screenshotRelativePath,
    url,
    fatalError,
    problems: problems.slice(0, Number(config.maxProblemsPerCase) || 40),
    metrics,
    console: messages.slice(0, 25),
    pageErrors: pageErrors.slice(0, 25),
    failedRequests: failedRequests.slice(0, 25),
    badResponses: badResponses.slice(0, 25)
  };
}

async function waitForRuntimeReady(page, timeoutMs) {
  await page.waitForFunction(() => {
    const workArea = document.querySelector("#sessionWorkArea");
    const errorCard = document.querySelector(".session-message-card-error");
    const sessionPage = document.querySelector("#sessionPage, .session-page");
    return !!workArea || !!errorCard || !!sessionPage;
  }, { timeout: timeoutMs });
}

async function collectDomMetrics(page, config) {
  return await page.evaluate((safeConfig) => {
    const viewportTolerance = Number(safeConfig.viewportPaddingTolerancePx) || 2;
    const clipTolerance = Number(safeConfig.clipTolerancePx) || 2;
    const maxSamples = Number(safeConfig.maxProblemsPerCase) || 40;

    const viewport = {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      documentClientWidth: document.documentElement.clientWidth,
      documentClientHeight: document.documentElement.clientHeight,
      documentScrollWidth: document.documentElement.scrollWidth,
      documentScrollHeight: document.documentElement.scrollHeight,
      bodyScrollWidth: document.body?.scrollWidth || 0,
      bodyScrollHeight: document.body?.scrollHeight || 0,
      bodyClientWidth: document.body?.clientWidth || 0,
      bodyClientHeight: document.body?.clientHeight || 0
    };

    const namedSelectors = {
      studentApp: "#studentApp",
      sessionPage: "#sessionPage, .session-page",
      viewport: ".session-viewport",
      fitHost: ".session-fit-host",
      sceneFrame: ".session-scene-frame",
      scene: ".session-scene",
      chromeTop: ".session-chrome-top",
      contentBand: ".session-content-band",
      workArea: "#sessionWorkArea",
      chromeBottom: ".session-chrome-bottom",
      progressShell: ".session-progress-shell:not(.hidden)",
      countdown: ".session-tool-countdown-pill:not(.hidden)",
      fatalErrorCard: ".session-message-card-error"
    };

    const named = Object.fromEntries(Object.entries(namedSelectors).map(([key, selector]) => {
      const el = document.querySelector(selector);
      return [key, el ? stripElementRef(describeElement(el, { includeText: key === "fatalErrorCard" })) : null];
    }));

    const globalOverflow = {
      x: Math.max(viewport.documentScrollWidth, viewport.bodyScrollWidth) > viewport.innerWidth + viewportTolerance,
      y: Math.max(viewport.documentScrollHeight, viewport.bodyScrollHeight) > viewport.innerHeight + viewportTolerance,
      extraX: Math.max(0, Math.max(viewport.documentScrollWidth, viewport.bodyScrollWidth) - viewport.innerWidth),
      extraY: Math.max(0, Math.max(viewport.documentScrollHeight, viewport.bodyScrollHeight) - viewport.innerHeight)
    };

    const visibleElements = Array.from(document.body?.querySelectorAll("*") || [])
      .map((el) => describeElement(el, { includeText: false }))
      .filter((item) => item.visible);

    const outOfViewport = visibleElements
      .filter((item) => item.area >= 80)
      .map((item) => {
        const overflowLeft = Math.max(0, -item.rect.left);
        const overflowTop = Math.max(0, -item.rect.top);
        const overflowRight = Math.max(0, item.rect.right - viewport.innerWidth);
        const overflowBottom = Math.max(0, item.rect.bottom - viewport.innerHeight);
        const maxOverflow = Math.max(overflowLeft, overflowTop, overflowRight, overflowBottom);
        return { ...item, overflowLeft, overflowTop, overflowRight, overflowBottom, maxOverflow };
      })
      .filter((item) => item.maxOverflow > viewportTolerance)
      .sort((a, b) => b.maxOverflow - a.maxOverflow)
      .slice(0, maxSamples);

    const clippedElements = visibleElements
      .filter((item) => item.area >= 80)
      .map((item) => {
        const el = item.__element;
        const style = window.getComputedStyle(el);
        const overflowX = style.overflowX;
        const overflowY = style.overflowY;
        const clippedX = el.scrollWidth > el.clientWidth + clipTolerance && overflowX !== "visible";
        const clippedY = el.scrollHeight > el.clientHeight + clipTolerance && overflowY !== "visible";
        const text = String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 180);
        return {
          ...stripElementRef(item),
          clippedX,
          clippedY,
          overflowX,
          overflowY,
          scrollWidth: el.scrollWidth,
          scrollHeight: el.scrollHeight,
          clientWidth: el.clientWidth,
          clientHeight: el.clientHeight,
          text
        };
      })
      .filter((item) => item.clippedX || item.clippedY)
      .sort((a, b) => Math.max((b.scrollWidth - b.clientWidth), (b.scrollHeight - b.clientHeight)) - Math.max((a.scrollWidth - a.clientWidth), (a.scrollHeight - a.clientHeight)))
      .slice(0, maxSamples);

    return {
      url: window.location.href,
      title: document.title,
      viewport,
      globalOverflow,
      named,
      outOfViewport: outOfViewport.map(stripElementRef),
      clippedElements,
      bodyClasses: String(document.body?.className || ""),
      htmlClasses: String(document.documentElement?.className || "")
    };

    function describeElement(el, options = {}) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const visible = style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity || 1) !== 0
        && rect.width > 0.5
        && rect.height > 0.5;
      const className = typeof el.className === "string" ? el.className : String(el.getAttribute("class") || "");
      const item = {
        __element: el,
        selector: getElementSelector(el),
        tag: el.tagName.toLowerCase(),
        id: el.id || "",
        className: className.slice(0, 240),
        role: el.getAttribute("role") || "",
        ariaLabel: el.getAttribute("aria-label") || "",
        visible,
        area: Math.round(rect.width * rect.height),
        rect: {
          left: Math.round(rect.left * 10) / 10,
          top: Math.round(rect.top * 10) / 10,
          right: Math.round(rect.right * 10) / 10,
          bottom: Math.round(rect.bottom * 10) / 10,
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10
        },
        overflowX: style.overflowX,
        overflowY: style.overflowY
      };
      if (options.includeText) {
        item.text = String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 500);
      }
      return item;
    }

    function stripElementRef(item) {
      const { __element, ...clean } = item;
      return clean;
    }

    function getElementSelector(el) {
      if (!el || !el.tagName) return "";
      if (el.id) return `#${el.id}`;
      const parts = [];
      let current = el;
      while (current && current.nodeType === 1 && parts.length < 4) {
        let part = current.tagName.toLowerCase();
        const cls = typeof current.className === "string" ? current.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
        if (cls.length) part += `.${cls.join(".")}`;
        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter((node) => node.tagName === current.tagName);
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
        parts.unshift(part);
        current = parent;
      }
      return parts.join(" > ");
    }
  }, config);
}

function classifyProblems({ metrics, messages, pageErrors, failedRequests, badResponses, fatalError, config }) {
  const problems = [];
  if (fatalError) {
    problems.push({ severity: "error", type: "fatal", message: fatalError });
    return problems;
  }

  if (!metrics) {
    problems.push({ severity: "error", type: "missing-metrics", message: "Aucune métrique DOM n'a pu être collectée." });
    return problems;
  }

  if (metrics.named?.fatalErrorCard?.text) {
    problems.push({ severity: "error", type: "runtime-error-card", message: metrics.named.fatalErrorCard.text });
  }

  if (!metrics.named?.workArea) {
    problems.push({ severity: "error", type: "missing-workarea", message: "#sessionWorkArea est absent du rendu." });
  }

  if (metrics.globalOverflow?.x) {
    problems.push({ severity: "error", type: "global-horizontal-scroll", message: `Scrollbar horizontale globale probable : +${Math.round(metrics.globalOverflow.extraX)} px.` });
  }

  if (metrics.globalOverflow?.y) {
    problems.push({ severity: "warning", type: "global-vertical-scroll", message: `Scrollbar verticale globale probable : +${Math.round(metrics.globalOverflow.extraY)} px.` });
  }

  const relevantOut = (metrics.outOfViewport || []).filter((item) => !isIgnoredViewportOverflow(item));
  for (const item of relevantOut.slice(0, 8)) {
    problems.push({
      severity: "warning",
      type: "element-out-of-viewport",
      message: `${item.selector} sort du viewport de ${Math.round(item.maxOverflow)} px.`,
      selector: item.selector,
      rect: item.rect
    });
  }

  const relevantClipped = (metrics.clippedElements || []).filter((item) => !isIgnoredClipping(item));
  for (const item of relevantClipped.slice(0, 8)) {
    const axis = item.clippedX && item.clippedY ? "horizontalement et verticalement" : item.clippedX ? "horizontalement" : "verticalement";
    problems.push({
      severity: "warning",
      type: "element-clipped",
      message: `${item.selector} semble rogné ${axis}.`,
      selector: item.selector,
      text: item.text || "",
      rect: item.rect,
      scrollWidth: item.scrollWidth,
      clientWidth: item.clientWidth,
      scrollHeight: item.scrollHeight,
      clientHeight: item.clientHeight
    });
  }

  if (pageErrors.length) {
    for (const err of pageErrors.slice(0, 5)) {
      problems.push({ severity: "error", type: "page-error", message: err });
    }
  }

  const seriousConsoleErrors = messages.filter((msg) => msg.type === "error" && !isIgnoredConsoleError(msg.text));
  for (const msg of seriousConsoleErrors.slice(0, 5)) {
    problems.push({ severity: "warning", type: "console-error", message: msg.text });
  }

  const seriousBadResponses = badResponses.filter((response) => !isIgnoredBadResponse(response.url));
  for (const response of seriousBadResponses.slice(0, 5)) {
    problems.push({ severity: "warning", type: "http-error", message: `${response.status} — ${response.url}` });
  }

  const seriousFailedRequests = failedRequests.filter((request) => !isIgnoredBadResponse(request.url));
  for (const request of seriousFailedRequests.slice(0, 5)) {
    problems.push({ severity: "warning", type: "request-failed", message: `${request.failure} — ${request.url}` });
  }

  return problems.slice(0, Number(config.maxProblemsPerCase) || 40);
}

function isIgnoredViewportOverflow(item) {
  const selector = String(item.selector || "");
  if (selector.includes(".student-stars")) return true;
  if (selector.includes(".session-scene")) return false;
  return false;
}

function isIgnoredClipping(item) {
  const selector = String(item.selector || "");
  const text = String(item.text || "");
  if (selector.includes(".material-symbol") || selector.includes(".icon")) return true;
  if (selector.includes(".session-stage-layer") && !text) return true;
  if (selector.includes(".session-confirm-layer") && !text) return true;
  if (selector.includes(".student-stars")) return true;
  if (item.area < 100) return true;
  return false;
}

function isIgnoredConsoleError(text) {
  const value = String(text || "").toLowerCase();
  if (value.includes("supabase")) return true;
  if (value.includes("cdn.jsdelivr")) return true;
  return false;
}

function isIgnoredBadResponse(url) {
  const value = String(url || "").toLowerCase();
  if (value.includes("cdn.jsdelivr.net/npm/@supabase")) return true;
  return false;
}

function makeAdminDraftPayload(tool, catalogActivities) {
  const activity = tool.activity || {
    id: `dev.${tool.id}`,
    config_name: tool.label || tool.id,
    category_id: "dev.responsive-audit",
    tool_id: tool.id,
    description: `Activité de test responsive pour ${tool.label || tool.id}.`,
    settings: {}
  };

  return {
    accessCode: "ADMINTEST",
    initialLevel: 3,
    activity,
    catalogActivities: Array.isArray(catalogActivities) && catalogActivities.length ? catalogActivities : [activity]
  };
}

function getAuditTools(registry, catalogActivities) {
  const activitiesByTool = new Map();
  for (const activity of catalogActivities || []) {
    const toolId = String(activity?.tool_id || activity?.toolId || "").trim();
    if (!toolId || activitiesByTool.has(toolId)) continue;
    activitiesByTool.set(toolId, activity);
  }

  return (registry || []).map((entry) => {
    const id = String(entry?.id || "").trim();
    return {
      id,
      label: String(entry?.label || id || "Outil").trim(),
      tags: Array.isArray(entry?.tags) ? [...entry.tags] : [],
      activity: activitiesByTool.get(id) || null
    };
  }).filter((tool) => !!tool.id);
}

function selectProfiles(allProfiles, configProfiles, cliProfiles) {
  const source = cliProfiles || configProfiles;
  if (!source || source === "official" || source === "all") return allProfiles;
  const wanted = Array.isArray(source) ? source : String(source).split(",").map((item) => item.trim()).filter(Boolean);
  return allProfiles.filter((profile) => wanted.some((item) => item === profile.id || item === profile.label || item === `${profile.width}x${profile.height}` || item === `${profile.width}×${profile.height}`));
}

function selectTools(allTools, configTools, cliTools) {
  const source = cliTools || configTools;
  if (!source || source === "all") return allTools;
  const wanted = new Set((Array.isArray(source) ? source : String(source).split(",")).map((item) => item.trim()).filter(Boolean));
  return allTools.filter((tool) => wanted.has(tool.id) || wanted.has(tool.label));
}

async function loadConfig(configPath, args) {
  let config = {};
  try {
    config = JSON.parse(await fs.readFile(configPath, "utf8"));
  } catch (err) {
    throw new Error(`Impossible de lire ${configPath}: ${err.message}`);
  }

  if (args.headed) config.headless = false;
  if (args.screenshot === false) config.screenshot = false;
  return config;
}

function parseCliArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (arg === "--headed") out.headed = true;
    else if (arg === "--no-screenshot") out.screenshot = false;
    else if (arg.startsWith("--tools=")) out.tools = arg.slice("--tools=".length);
    else if (arg.startsWith("--profiles=")) out.profiles = arg.slice("--profiles=".length);
  }
  return out;
}

async function prepareOutput(outputRoot, screenshotsDir) {
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(screenshotsDir, { recursive: true });
}

async function startStaticServer(root, preferredPort) {
  let port = preferredPort;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const server = http.createServer((req, res) => serveStatic(root, req, res));
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => resolve());
      });
      return {
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((resolve) => server.close(() => resolve()))
      };
    } catch (err) {
      if (err?.code !== "EADDRINUSE") throw err;
      port += 1;
    }
  }
  throw new Error("Impossible de trouver un port libre pour le serveur local.");
}

async function serveStatic(root, req, res) {
  try {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const decodedPath = decodeURIComponent(url.pathname);
    const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
    const filePath = path.resolve(root, relativePath);
    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat || !stat.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": getMimeType(filePath),
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Access-Control-Allow-Origin": "*"
    });
    fssync.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.writeHead(500);
    res.end(String(err?.message || err));
  }
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".otf": "font/otf"
  }[ext] || "application/octet-stream";
}

async function writeReports(outputRoot, report) {
  await fs.writeFile(path.join(outputRoot, "report.json"), JSON.stringify(report, null, 2), "utf8");
  await fs.writeFile(path.join(outputRoot, "cases.csv"), buildCasesCsv(report.cases), "utf8");
  await fs.writeFile(path.join(outputRoot, "report.html"), buildHtmlReport(report), "utf8");
  await fs.writeFile(path.join(outputRoot, "README.txt"), buildOutputReadme(report), "utf8");
}

function buildToolSummary(cases) {
  const map = new Map();
  for (const item of cases) {
    const key = item.toolId;
    if (!map.has(key)) map.set(key, { toolId: item.toolId, toolLabel: item.toolLabel, ok: 0, warning: 0, error: 0, fatal: 0, total: 0 });
    const row = map.get(key);
    row.total += 1;
    row[item.status] += 1;
  }
  return [...map.values()];
}

function buildProfileSummary(cases) {
  const map = new Map();
  for (const item of cases) {
    const key = item.profileId;
    if (!map.has(key)) map.set(key, { profileId: item.profileId, profileLabel: item.profileLabel, width: item.width, height: item.height, ok: 0, warning: 0, error: 0, fatal: 0, total: 0 });
    const row = map.get(key);
    row.total += 1;
    row[item.status] += 1;
  }
  return [...map.values()];
}

function buildCasesCsv(cases) {
  const headers = ["status", "toolId", "toolLabel", "profileId", "profileLabel", "width", "height", "problems", "screenshot"];
  const rows = [headers.join(";")];
  for (const item of cases) {
    rows.push([
      item.status,
      item.toolId,
      item.toolLabel,
      item.profileId,
      item.profileLabel,
      item.width,
      item.height,
      (item.problems || []).map((problem) => `${problem.type}: ${problem.message}`).join(" | "),
      item.screenshot || ""
    ].map(csvEscape).join(";"));
  }
  return rows.join("\n");
}

function buildHtmlReport(report) {
  const rows = report.cases.map((item) => `
    <tr class="status-${escapeHtml(item.status)}">
      <td><span class="badge">${escapeHtml(item.status.toUpperCase())}</span></td>
      <td>${escapeHtml(item.toolLabel)}<br><small>${escapeHtml(item.toolId)}</small></td>
      <td>${escapeHtml(item.profileLabel)}<br><small>${escapeHtml(`${item.width}×${item.height}`)}</small></td>
      <td>${item.screenshot ? `<a href="${escapeAttr(item.screenshot)}">capture</a>` : "—"}</td>
      <td>${buildProblemsHtml(item.problems)}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Audit responsive — Site d'outils</title>
  <style>
    body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:24px;background:#f6f7fb;color:#1f2937;}
    h1{margin:0 0 8px;font-size:28px;}
    h2{margin-top:28px;}
    .summary{display:flex;gap:12px;flex-wrap:wrap;margin:18px 0;}
    .card{background:white;border:1px solid #d8deea;border-radius:14px;padding:14px 16px;box-shadow:0 8px 24px rgba(15,23,42,.06);}
    .card strong{display:block;font-size:24px;}
    table{width:100%;border-collapse:collapse;background:white;border:1px solid #d8deea;border-radius:14px;overflow:hidden;}
    th,td{padding:10px 12px;border-bottom:1px solid #e5eaf3;text-align:left;vertical-align:top;}
    th{background:#eef2f9;font-size:13px;text-transform:uppercase;letter-spacing:.04em;}
    tr.status-ok .badge{background:#dcfce7;color:#166534;}
    tr.status-warning .badge{background:#fef3c7;color:#92400e;}
    tr.status-error .badge, tr.status-fatal .badge{background:#fee2e2;color:#991b1b;}
    .badge{display:inline-block;border-radius:999px;padding:4px 8px;font-size:12px;font-weight:700;}
    small{color:#64748b;}
    ul{margin:0;padding-left:18px;}
    li{margin:0 0 5px;}
    a{color:#2563eb;}
    .muted{color:#64748b;}
  </style>
</head>
<body>
  <h1>Audit responsive — Site d'outils</h1>
  <p class="muted">Généré le ${escapeHtml(new Date(report.generatedAt).toLocaleString("fr-FR"))}</p>
  <div class="summary">
    <div class="card"><strong>${report.summary.totalCases}</strong> cas testés</div>
    <div class="card"><strong>${report.summary.okCases}</strong> OK</div>
    <div class="card"><strong>${report.summary.warningCases}</strong> alertes</div>
    <div class="card"><strong>${report.summary.errorCases + report.summary.fatalCases}</strong> erreurs</div>
  </div>
  <h2>Détail</h2>
  <table>
    <thead><tr><th>Statut</th><th>Outil</th><th>Profil</th><th>Capture</th><th>Problèmes détectés</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

function buildProblemsHtml(problems) {
  if (!Array.isArray(problems) || !problems.length) return "—";
  return `<ul>${problems.map((problem) => `<li><strong>${escapeHtml(problem.type)}</strong> — ${escapeHtml(problem.message)}</li>`).join("")}</ul>`;
}

function buildOutputReadme(report) {
  return `Audit responsive généré le ${report.generatedAt}\n\nÀ renvoyer dans ChatGPT :\n- report.json\n- cases.csv\n- le dossier screenshots/\n\nLe plus simple : zipper tout le dossier responsive-audit-output.\n`;
}

function sanitizeReportConfig(config) {
  return {
    profiles: config.profiles,
    tools: config.tools,
    headless: config.headless,
    screenshot: config.screenshot,
    waitMsAfterLoad: config.waitMsAfterLoad,
    timeoutMs: config.timeoutMs,
    maxProblemsPerCase: config.maxProblemsPerCase
  };
}

function pickProfileReport(profile) {
  return { id: profile.id, label: profile.label, width: profile.width, height: profile.height, meta: profile.meta, ratio: profile.ratio };
}

function pickToolReport(tool) {
  return { id: tool.id, label: tool.label, tags: tool.tags, activityId: tool.activity?.id || `dev.${tool.id}` };
}

function makeToken(toolId, profileId) {
  return `responsive-audit-${safeFileName(toolId)}-${safeFileName(profileId)}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function safeFileName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "item";
}

function csvEscape(value) {
  const text = String(value ?? "").replaceAll('"', '""');
  return `"${text}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
