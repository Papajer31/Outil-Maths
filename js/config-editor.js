import {
  getCurrentUser,
  normalizeClassCode,
  getMyClassSpaceByCode,
  getMyActivityByName,
  saveActivityConfig
} from "./users_info.js";
import { loadModuleRuntime } from "./module-registry.js";

/* =========================
   CONSTANTES
   ========================= */

const DEFAULT_TOOL_ROW = Object.freeze({
  enabled: false,
  timePerQ: 40,
  questionCount: 10,
  answerTime: 5,
  settings: null
});

/* =========================
   DOM
   ========================= */

const els = {
  btnBackDashboard: document.getElementById("btnBackDashboard"),
  btnSaveConfig: document.getElementById("btnSaveConfig"),

  headerTitle: document.getElementById("headerTitle"),
  pillStatus: document.getElementById("pillStatus"),

  editorMeta: document.getElementById("editorMeta"),
  classCodeInput: document.getElementById("classCodeInput"),
  configNameInput: document.getElementById("configNameInput"),
  editorMessage: document.getElementById("editorMessage"),
  configRows: document.getElementById("configRows"),

  toolOverlay: document.getElementById("toolOverlay"),
  toolOverlayTitle: document.getElementById("toolOverlayTitle"),
  toolOverlayBody: document.getElementById("toolOverlayBody"),
  toolOverlayActions: document.getElementById("toolOverlayActions"),
  toolOverlayHint: document.getElementById("toolOverlayHint"),
};

/* =========================
   STATE
   ========================= */

let currentUser = null;
let currentClassCode = "";
let currentConfigName = "";
let currentClassSpace = null;

const currentModuleKey = "maths";

let moduleRuntime = null;
let toolsCatalog = [];
const toolModuleCache = new Map();
const configDrafts = new Map();

let currentToolSettingsEditor = null;

/* =========================
   INIT
   ========================= */

boot();

/* =========================
   BOOT
   ========================= */

async function boot(){
  setStatus("Chargement…", "warn");
  setMessage("");

  try {
    currentUser = await getCurrentUser();
    if (!currentUser){
      window.location.href = "index.html";
      return;
    }

    const params = new URLSearchParams(window.location.search);
    currentClassCode = normalizeClassCode(params.get("classCode"));
    currentConfigName = String(params.get("configName") || "").trim();

    if (!currentClassCode){
      setFatalState("Code classe manquant.");
      return;
    }

    currentClassSpace = await getMyClassSpaceByCode(currentClassCode);
    if (!currentClassSpace){
      setFatalState(`La classe "${currentClassCode}" n’existe pas dans ton espace.`);
      return;
    }

    moduleRuntime = loadModuleRuntime(currentModuleKey);
    toolsCatalog = await moduleRuntime.loadToolsCatalog();
    ensureConfigDrafts();

    if (currentConfigName){
      await loadExistingConfig();
    }

    renderMeta();
    renderConfigTable();
    bindEvents();

    setStatus("Configuration", "good");
  } catch (err) {
    setFatalState(err?.message || "Impossible d’ouvrir l’éditeur.");
  }
}

/* =========================
   CHARGEMENT
   ========================= */

async function loadExistingConfig(){
  const existing = await getMyActivityByName(currentClassSpace.id, currentConfigName);

  if (!existing?.config_json?.drafts){
    setMessage("Configuration introuvable, création d’une nouvelle base.", true);
    return;
  }

  applyRemoteDrafts(existing.config_json.drafts);
}

function renderMeta(){
  if (els.classCodeInput){
    els.classCodeInput.value = currentClassCode;
  }

  if (els.configNameInput){
    els.configNameInput.value = currentConfigName;
  }

  if (els.editorMeta){
    els.editorMeta.textContent = currentConfigName
      ? `Classe : ${currentClassCode} — édition de "${currentConfigName}"`
      : `Classe : ${currentClassCode} — nouvelle configuration`;
  }
}

/* =========================
   EVENTS
   ========================= */

function bindEvents(){
  els.btnBackDashboard?.addEventListener("click", goBackDashboard);
  els.btnSaveConfig?.addEventListener("click", saveCurrentConfig);

  els.configNameInput?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    saveCurrentConfig();
  });
}

/* =========================
   TABLE DE CONFIG
   ========================= */

function renderConfigTable(){
  if (!els.configRows) return;

  els.configRows.innerHTML = toolsCatalog.map(t => configRowHTML(t)).join("");

  toolsCatalog.forEach((t) => {
    const draft = getToolDraft(t.id);

    const chk = document.getElementById(`chk_${t.id}`);
    const time = document.getElementById(`time_${t.id}`);
    const count = document.getElementById(`count_${t.id}`);
    const answer = document.getElementById(`answer_${t.id}`);
    const btnSettings = document.getElementById(`settings_${t.id}`);

    if (!chk || !time || !count || !answer) return;

    chk.checked = !!draft.enabled;
    time.value = draft.timePerQ;
    count.value = draft.questionCount;
    answer.value = draft.answerTime;

    chk.addEventListener("change", () => {
      draft.enabled = chk.checked;
      setRowEnabled(t.id, chk.checked);
    });

    time.addEventListener("input", () => {
      draft.timePerQ = clampInt(time.value, 5, 999);
    });
    time.addEventListener("change", () => {
      time.value = clampInt(time.value, 5, 999);
      draft.timePerQ = Number(time.value);
    });

    count.addEventListener("input", () => {
      draft.questionCount = clampInt(count.value, 1, 200);
    });
    count.addEventListener("change", () => {
      count.value = clampInt(count.value, 1, 200);
      draft.questionCount = Number(count.value);
    });

    answer.addEventListener("input", () => {
      draft.answerTime = clampInt(answer.value, 1, 30);
    });
    answer.addEventListener("change", () => {
      answer.value = clampInt(answer.value, 1, 30);
      draft.answerTime = Number(answer.value);
    });

    btnSettings?.addEventListener("click", () => {
      openToolSettings(t.id).catch((err) => {
        setMessage(err?.message || "Impossible d’ouvrir les réglages outil.", true);
      });
    });

    setRowEnabled(t.id, chk.checked);
  });

  els.configRows.querySelectorAll('input[type="number"]').forEach((inp) => {
    inp.addEventListener("focus", () => {
      inp.select?.();
      try { inp.setSelectionRange(0, inp.value.length); } catch {}
    });

    inp.addEventListener("pointerup", () => {
      inp.select?.();
      try { inp.setSelectionRange(0, inp.value.length); } catch {}
    });
  });
}

function configRowHTML(t){
  return `
    <div class="cfg-row" id="row_${t.id}">
      <input type="checkbox" id="chk_${t.id}" aria-label="Activer ${escapeHtml(t.title)}">
      <div class="pill cfg-title">${escapeHtml(t.title)}</div>
      <input type="number" min="5" max="999" step="5" id="time_${t.id}">
      <input type="number" min="1" max="200" step="1" id="count_${t.id}">
      <input type="number" min="1" max="30" step="1" id="answer_${t.id}">
      <button class="btn btn-icon cfg-gear" type="button" id="settings_${t.id}" aria-label="Réglages ${escapeHtml(t.title)}">⚙️</button>
    </div>
  `;
}

function setRowEnabled(id, enabled){
  const row = document.getElementById(`row_${id}`);
  const time = document.getElementById(`time_${id}`);
  const count = document.getElementById(`count_${id}`);
  const answer = document.getElementById(`answer_${id}`);

  if (time) time.disabled = !enabled;
  if (count) count.disabled = !enabled;
  if (answer) answer.disabled = !enabled;
  row?.classList.toggle("disabled", !enabled);
}

/* =========================
   RÉGLAGES OUTIL
   ========================= */

async function openToolSettings(toolId){
  const toolMeta = toolsCatalog.find(t => t.id === toolId);
  if (!toolMeta) return;

  const draft = getToolDraft(toolId);
  const mod = await loadToolModule(toolId);
  const tool = mod.default ?? {};

  if (draft.settings == null){
    draft.settings = getToolDefaultSettings(tool);
  }

  currentToolSettingsEditor = { toolId, tool };

  openToolOverlay({
    title: toolMeta.title,
    body: `<div id="toolSettingsHost"></div>`,
    actions: [
      { label: "Annuler", primary: false, onClick: closeToolOverlay },
      { label: "Valider", primary: true, onClick: validateToolSettings }
    ],
    hint: ""
  });

  const host = document.getElementById("toolSettingsHost");
  if (!host) return;

  if (typeof tool.renderToolSettings === "function"){
    tool.renderToolSettings(host, cloneData(draft.settings));
  } else {
    host.innerHTML = `<div class="panel">Aucun réglage spécifique pour cet outil.</div>`;
  }

  host.querySelectorAll('input[type="number"]').forEach((inp) => {
    inp.addEventListener("focus", () => {
      inp.select?.();
      try { inp.setSelectionRange(0, inp.value.length); } catch {}
    });

    inp.addEventListener("pointerup", () => {
      inp.select?.();
      try { inp.setSelectionRange(0, inp.value.length); } catch {}
    });
  });
}

function validateToolSettings(){
  if (!currentToolSettingsEditor) return;

  const { toolId, tool } = currentToolSettingsEditor;
  const draft = getToolDraft(toolId);
  const host = document.getElementById("toolSettingsHost");
  if (!host) return;

  try {
    if (typeof tool.readToolSettings === "function"){
      draft.settings = tool.readToolSettings(host);
    } else if (draft.settings == null){
      draft.settings = getToolDefaultSettings(tool);
    }

    closeToolOverlay();
  } catch (err) {
    setMessage(err?.message || "Réglages invalides.", true);
  }
}

/* =========================
   SAUVEGARDE
   ========================= */

async function saveCurrentConfig(){
  const name = String(els.configNameInput?.value || "").trim();

  if (!name){
    setMessage("Entre un nom de configuration.", true);
    els.configNameInput?.focus();
    return;
  }

  syncDraftsFromUI();

  const enabledCount = countEnabledTools();
  if (enabledCount === 0){
    setMessage("Choisis au moins un outil.", true);
    return;
  }

  setStatus("Enregistrement…", "warn");
  setMessage("Sauvegarde en cours…");
  els.btnSaveConfig.disabled = true;

  try {
    await saveActivityConfig({
      classCode: currentClassCode,
      toolKey: currentModuleKey,
      configName: name,
      configJson: {
        version: 1,
        drafts: serializeDrafts()
      }
    });

    currentConfigName = name;
    renderMeta();

    setStatus("Enregistré", "good");
    setMessage(`Configuration "${name}" enregistrée.`);
  } catch (err) {
    setStatus("Erreur", "bad");
    setMessage(err?.message || "Impossible d’enregistrer.", true);
  } finally {
    els.btnSaveConfig.disabled = false;
  }
}

function syncDraftsFromUI(){
  for (const t of toolsCatalog){
    const draft = getToolDraft(t.id);

    const chk = document.getElementById(`chk_${t.id}`);
    const time = document.getElementById(`time_${t.id}`);
    const count = document.getElementById(`count_${t.id}`);
    const answer = document.getElementById(`answer_${t.id}`);

    if (!chk || !time || !count || !answer) continue;

    draft.enabled = !!chk.checked;
    draft.timePerQ = clampInt(time.value, 5, 999);
    draft.questionCount = clampInt(count.value, 1, 200);
    draft.answerTime = clampInt(answer.value, 1, 30);
  }
}

function countEnabledTools(){
  let total = 0;
  for (const t of toolsCatalog){
    if (getToolDraft(t.id).enabled) total += 1;
  }
  return total;
}

/* =========================
   DRAFTS
   ========================= */

function ensureConfigDrafts(){
  for (const t of toolsCatalog){
    if (!configDrafts.has(t.id)){
      configDrafts.set(t.id, {
        enabled: DEFAULT_TOOL_ROW.enabled,
        timePerQ: DEFAULT_TOOL_ROW.timePerQ,
        questionCount: DEFAULT_TOOL_ROW.questionCount,
        answerTime: DEFAULT_TOOL_ROW.answerTime,
        settings: null
      });
    }
  }
}

function getToolDraft(id){
  if (!configDrafts.has(id)){
    configDrafts.set(id, {
      enabled: DEFAULT_TOOL_ROW.enabled,
      timePerQ: DEFAULT_TOOL_ROW.timePerQ,
      questionCount: DEFAULT_TOOL_ROW.questionCount,
      answerTime: DEFAULT_TOOL_ROW.answerTime,
      settings: null
    });
  }
  return configDrafts.get(id);
}

function serializeDrafts(){
  const out = {};
  for (const t of toolsCatalog){
    const draft = getToolDraft(t.id);
    out[t.id] = {
      enabled: !!draft.enabled,
      timePerQ: clampInt(draft.timePerQ, 5, 999),
      questionCount: clampInt(draft.questionCount, 1, 200),
      answerTime: clampInt(draft.answerTime, 1, 30),
      settings: draft.settings == null ? null : cloneData(draft.settings)
    };
  }
  return out;
}

function applyRemoteDrafts(remoteDrafts){
  ensureConfigDrafts();

  for (const t of toolsCatalog){
    const incoming = remoteDrafts?.[t.id];
    const draft = getToolDraft(t.id);

    if (!incoming){
      draft.enabled = DEFAULT_TOOL_ROW.enabled;
      draft.timePerQ = DEFAULT_TOOL_ROW.timePerQ;
      draft.questionCount = DEFAULT_TOOL_ROW.questionCount;
      draft.answerTime = DEFAULT_TOOL_ROW.answerTime;
      draft.settings = null;
      continue;
    }

    draft.enabled = !!incoming.enabled;
    draft.timePerQ = clampInt(incoming.timePerQ, 5, 999);
    draft.questionCount = clampInt(incoming.questionCount, 1, 200);
    draft.answerTime = clampInt(incoming.answerTime, 1, 30);
    draft.settings = incoming.settings == null ? null : cloneData(incoming.settings);
  }
}

/* =========================
   OUTILS / MODULES
   ========================= */

async function loadToolModule(toolId){
  if (!moduleRuntime){
    throw new Error("Runtime de module non initialisé.");
  }

  if (!toolModuleCache.has(toolId)){
    toolModuleCache.set(toolId, moduleRuntime.loadToolModule(toolId));
  }

  return await toolModuleCache.get(toolId);
}

function getToolDefaultSettings(tool){
  if (typeof tool?.getDefaultSettings === "function"){
    return cloneData(tool.getDefaultSettings());
  }
  return {};
}

/* =========================
   NAVIGATION
   ========================= */

function goBackDashboard(){
  const params = new URLSearchParams();
  params.set("classCode", currentClassCode);
  window.location.href = `teacher-dashboard.html?${params.toString()}`;
}

/* =========================
   OVERLAY OUTIL
   ========================= */

function openToolOverlay({ title, body, actions, hint }){
  if (els.toolOverlayTitle) els.toolOverlayTitle.textContent = title ?? "";
  if (els.toolOverlayBody) els.toolOverlayBody.innerHTML = body ?? "";
  if (els.toolOverlayHint) els.toolOverlayHint.innerHTML = hint ?? "";

  if (els.toolOverlayActions){
    els.toolOverlayActions.innerHTML = "";
    for (const a of (actions ?? [])){
      const btn = document.createElement("button");
      btn.className = `btn ${a.primary ? "primary" : ""}`.trim();
      btn.textContent = a.label;
      btn.addEventListener("click", a.onClick);
      els.toolOverlayActions.appendChild(btn);
    }
  }

  els.toolOverlay?.classList.remove("hidden");
}

function closeToolOverlay(){
  els.toolOverlay?.classList.add("hidden");
  if (els.toolOverlayActions) els.toolOverlayActions.innerHTML = "";
  if (els.toolOverlayBody) els.toolOverlayBody.innerHTML = "";
  if (els.toolOverlayHint) els.toolOverlayHint.innerHTML = "";
  currentToolSettingsEditor = null;
}

/* =========================
   UI
   ========================= */

function setFatalState(message){
  setStatus("Erreur", "bad");
  setMessage(message, true);

  if (els.editorMeta){
    els.editorMeta.textContent = message;
  }

  if (els.btnSaveConfig){
    els.btnSaveConfig.disabled = true;
  }
}

function setStatus(text, mood){
  if (els.pillStatus){
    els.pillStatus.textContent = text;
    els.pillStatus.classList.remove("good", "warn", "bad");

    if (mood === "good") els.pillStatus.classList.add("good");
    else if (mood === "warn") els.pillStatus.classList.add("warn");
    else if (mood === "bad") els.pillStatus.classList.add("bad");
  }

  if (els.headerTitle){
    els.headerTitle.textContent = text;
  }
}

function setMessage(text, isError = false){
  if (!els.editorMessage) return;
  els.editorMessage.textContent = text;
  els.editorMessage.style.color = isError ? "var(--bad)" : "var(--muted)";
}

/* =========================
   HELPERS
   ========================= */

function clampInt(v, min, max){
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function cloneData(value){
  if (typeof structuredClone === "function"){
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}