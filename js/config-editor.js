import {
  getCurrentUser,
  normalizeAccessCode,
  getMyTeacherSpace,
  getMyActivityByName,
  saveActivityConfig,
  listPublicStudentsForSpace
} from "./users_info.js";
import {
  getAvailableModules,
  loadModuleRuntime
} from "./module-registry.js";
import {
  TOOL_LIMITS,
  DEFAULT_TOOL_ROW,
  DEFAULT_ACTIVITY_GLOBALS,
  clampInt,
  cloneData,
  normalizeActivityGlobals,
  normalizeToolDraft
} from "./activity-config.js";

/* =========================
   DOM
   ========================= */

const els = {
  btnBackDashboard: document.getElementById("btnBackDashboard"),
  btnSaveConfig: document.getElementById("btnSaveConfig"),

  classCodeInput: document.getElementById("classCodeInput"),
  moduleSelect: document.getElementById("moduleSelect"),
  configNameInput: document.getElementById("configNameInput"),
  editorMessage: document.getElementById("editorMessage"),
  questionTransitionSecInput: document.getElementById("questionTransitionSecInput"),
  configRows: document.getElementById("configRows"),

  toolConfigTitle: document.getElementById("toolConfigTitle"),
  toolConfigHost: document.getElementById("toolConfigHost"),
  questionTransitionSecInput: document.getElementById("questionTransitionSecInput"),
};

/* =========================
   STATE
   ========================= */

let currentUser = null;
let currentAccessCode = "";
let currentConfigName = "";
let currentTeacherSpace = null;
let availableStudents = [];
let saveState = "saved"; // "dirty" | "saving" | "saved"

let currentModuleKey = "maths";
let availableModules = [];
let isEditingExistingConfig = false;

let moduleRuntime = null;
let toolsCatalog = [];
const toolModuleCache = new Map();
const configDrafts = new Map();

let currentToolSettingsEditor = null;
let currentSelectedToolId = null;
const activityGlobals = {
  questionTransitionSec: DEFAULT_ACTIVITY_GLOBALS.questionTransitionSec
};

/* =========================
   INIT
   ========================= */

boot();

/* =========================
   BOOT
   ========================= */

async function boot(){
  setMessage("Chargement…");

  try {
    currentUser = await getCurrentUser();
    if (!currentUser){
      window.location.href = "index.html";
      return;
    }

    const params = new URLSearchParams(window.location.search);
    currentAccessCode = normalizeAccessCode(
      params.get("accessCode") || params.get("classCode")
    );
    currentConfigName = String(params.get("configName") || "").trim();

    if (!currentAccessCode){
      setFatalState("Code de connexion manquant.");
      return;
    }

    currentTeacherSpace = await getMyTeacherSpace();
    if (!currentTeacherSpace){
      setFatalState("Aucun espace enseignant trouvé.");
      return;
    }

    if (currentTeacherSpace.access_code !== currentAccessCode){
      setFatalState(`Le code "${currentAccessCode}" ne correspond pas à ton espace enseignant.`);
      return;
    }

    availableStudents = await listPublicStudentsForSpace(currentAccessCode);
    if (!Array.isArray(availableStudents)) {
      availableStudents = [];
    }

    availableStudents = [...availableStudents].sort((a, b) => {
      const an = String(a?.first_name || "").localeCompare(String(b?.first_name || ""), "fr", { sensitivity: "base" });
      if (an !== 0) return an;
      return String(a?.id || "").localeCompare(String(b?.id || ""), "fr", { sensitivity: "base" });
    });

    availableModules = getAvailableModules();
    if (!Array.isArray(availableModules) || availableModules.length === 0){
      setFatalState("Aucun module disponible.");
      return;
    }

    let existingConfig = null;

    if (currentConfigName){
      existingConfig = await getMyActivityByName(currentTeacherSpace.id, currentConfigName);

      if (existingConfig?.module_key){
        currentModuleKey = existingConfig.module_key;
      }

      isEditingExistingConfig = !!existingConfig;
    }

    renderModuleSelect();
    await reloadCurrentModule();

    if (existingConfig){
      loadExistingConfig(existingConfig);
    }

    renderMeta();
    renderGlobals();
    renderConfigTable();
    bindEvents();

    setMessage("");
  } catch (err) {
    setFatalState(err?.message || "Impossible d’ouvrir l’éditeur.");
  }

  setSaveState("saved");
}

/* =========================
   CHARGEMENT
   ========================= */

function loadExistingConfig(existing){
  if (!existing?.config_json?.drafts){
    setMessage("Configuration introuvable, création d’une nouvelle base.", true);
    return;
  }

  applyRemoteGlobals(existing.config_json.globals);
  applyRemoteDrafts(existing.config_json.drafts);
}

function renderMeta(){
  if (els.classCodeInput){
    els.classCodeInput.value = currentAccessCode;
  }

  if (els.configNameInput){
    els.configNameInput.value = currentConfigName;
  }
}

/* =========================
   EVENTS
   ========================= */

function bindEvents(){
  els.btnBackDashboard?.addEventListener("click", goBackDashboard);
  els.btnSaveConfig?.addEventListener("click", saveCurrentConfig);

  els.moduleSelect?.addEventListener("change", async () => {
    if (isEditingExistingConfig) return;

    const nextModuleKey = String(els.moduleSelect.value || "").trim();
    if (!nextModuleKey || nextModuleKey === currentModuleKey) return;

    try {
      currentModuleKey = nextModuleKey;
      await reloadCurrentModule();
      renderModuleSelect();
      renderMeta();
      renderGlobals();
      renderConfigTable();
      setMessage("");
    } catch (err) {
      setMessage(err?.message || "Impossible de charger ce module.", true);
      renderModuleSelect();
    }
  });

  els.configNameInput?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    saveCurrentConfig();
  });

  els.questionTransitionSecInput?.addEventListener("input", () => {
    activityGlobals.questionTransitionSec = clampInt(
      els.questionTransitionSecInput.value,
      TOOL_LIMITS.questionTransitionSec.min,
      TOOL_LIMITS.questionTransitionSec.max
    );
    setSaveState("dirty");
  });

  els.questionTransitionSecInput?.addEventListener("change", () => {
    const value = clampInt(
      els.questionTransitionSecInput.value,
      TOOL_LIMITS.questionTransitionSec.min,
      TOOL_LIMITS.questionTransitionSec.max
    );
    els.questionTransitionSecInput.value = value;
    activityGlobals.questionTransitionSec = value;
    setSaveState("dirty");
  });

  els.configNameInput?.addEventListener("input", () => setSaveState("dirty"));
  els.moduleSelect?.addEventListener("change", () => setSaveState("dirty"));
  els.questionTransitionSecInput?.addEventListener("input", () => setSaveState("dirty"));
}

function renderModuleSelect(){
  if (!els.moduleSelect) return;

  els.moduleSelect.innerHTML = availableModules.map((mod) => `
    <option value="${escapeHtml(mod.key)}">${escapeHtml(mod.label)}</option>
  `).join("");

  els.moduleSelect.value = currentModuleKey;
  els.moduleSelect.disabled = isEditingExistingConfig;
}

async function reloadCurrentModule(){
  currentToolSettingsEditor = null;
  currentSelectedToolId = null;

  toolModuleCache.clear();
  configDrafts.clear();

  moduleRuntime = loadModuleRuntime(currentModuleKey);
  toolsCatalog = await moduleRuntime.loadToolsCatalog();

  if (!Array.isArray(toolsCatalog)) {
    toolsCatalog = [];
  }

  ensureConfigDrafts();
}

/* =========================
   TABLE DE CONFIG
   ========================= */

function renderConfigTable(){
  if (!els.configRows) return;

  els.configRows.innerHTML = toolsCatalog.map(t => configRowHTML(t)).join("");

  toolsCatalog.forEach((t) => {
    const draft = getToolDraft(t.id);

    const row = document.getElementById(`row_${t.id}`);
    const chk = document.getElementById(`chk_${t.id}`);
    const btnSettings = document.getElementById(`settings_${t.id}`);

    if (!row || !chk || !btnSettings) return;

    chk.checked = !!draft.enabled;
    row.classList.toggle("disabled", !draft.enabled);
    row.classList.toggle("active", draft.enabled);

    chk.addEventListener("change", (e) => {
      e.stopPropagation();
      draft.enabled = chk.checked;
      row.classList.toggle("disabled", !chk.checked);
      setSaveState("dirty");
    });

    btnSettings.addEventListener("click", (e) => {
      e.stopPropagation();
      openToolSettings(t.id).catch((err) => {
        setMessage(err?.message || "Impossible d’ouvrir les réglages outil.", true);
      });
    });
  });

  renderEmptyToolPanel();
}

function configRowHTML(t){
  const draft = getToolDraft(t.id);

  return `
    <div class="cfg-tool-row" id="row_${t.id}">
      <input class="cfg-tool-check" type="checkbox" id="chk_${t.id}" aria-label="Activer ${escapeHtml(t.title)}">
        <div class="cfg-tool-main">
          <div class="cfg-tool-name">${escapeHtml(t.title)}</div>
        </div>
      <button class="btn btn-icon cfg-gear" type="button" id="settings_${t.id}" aria-label="Configurer ${escapeHtml(t.title)}">⚙️</button>
    </div>
  `;
}

/* =========================
   RÉGLAGES OUTIL
   ========================= */

async function openToolSettings(toolId){
  const toolMeta = toolsCatalog.find(t => t.id === toolId);
  if (!toolMeta) return;

  persistCurrentToolSettings();

  currentSelectedToolId = toolId;

  const draft = getToolDraft(toolId);
  const mod = await loadToolModule(toolId);
  const tool = mod.default ?? {};

  if (draft.settings == null){
    draft.settings = getToolDefaultSettings(tool);
  }

  currentToolSettingsEditor = { toolId, tool };
  renderConfigTableSelectionState();

    const headerSlot = ensureToolHeaderControlsSlot();
  if (headerSlot) {
    headerSlot.innerHTML = "";
    if (typeof tool.renderToolHeaderControls === "function") {
      tool.renderToolHeaderControls(headerSlot, cloneData(draft.settings), {
        accessCode: currentAccessCode,
        teacherSpace: cloneData(currentTeacherSpace),
        students: cloneData(availableStudents),
        moduleKey: currentModuleKey,
        configName: currentConfigName
      });

      headerSlot.querySelectorAll('input[type="radio"], input[type="checkbox"], select').forEach((el) => {
        el.addEventListener("change", () => {
          persistCurrentToolHeaderControls();
          openToolSettings(toolId).catch((err) => {
            setMessage(err?.message || "Impossible d’actualiser les réglages outil.", true);
          });
        });
      });
    }
  }

  if (els.toolConfigTitle) {
    els.toolConfigTitle.textContent = toolMeta.title;
  }

  const host = els.toolConfigHost;
  if (!host) return;

  host.innerHTML = "";

  if (typeof tool.renderToolSettings === "function"){
    tool.renderToolSettings(host, cloneData(getToolDraft(toolId).settings), {
      accessCode: currentAccessCode,
      teacherSpace: cloneData(currentTeacherSpace),
      students: cloneData(availableStudents),
      moduleKey: currentModuleKey,
      configName: currentConfigName
    });
  } else {
    host.innerHTML = `<div class="cfg-empty-state">Aucun réglage spécifique pour cet outil.</div>`;
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

/* =========================
   SAUVEGARDE
   ========================= */

async function saveCurrentConfig(){
  setSaveState("saving");
  const name = String(els.configNameInput?.value || "").trim();

  if (!name){
    setMessage("Entre un nom d’activité.", true);
    els.configNameInput?.focus();
    return;
  }

  syncDraftsFromUI();
  persistCurrentToolSettings();

  const enabledCount = countEnabledTools();
  if (enabledCount === 0){
    setMessage("Choisis au moins un outil.", true);
    return;
  }

  setSaveState("saving");
  setMessage("Sauvegarde en cours…");
  els.btnSaveConfig.disabled = true;

  try {
    await saveActivityConfig({
      accessCode: currentAccessCode,
      moduleKey: currentModuleKey,
      configName: name,
      configJson: {
        version: 2,
        globals: serializeGlobals(),
        drafts: serializeDrafts()
      }
    });

    currentConfigName = name;
    renderMeta();

    setSaveState("saved");
    setMessage(`Activité "${name}" enregistrée.`);
    setSaveState("saved");
  } catch (err) {
    setSaveState("dirty");
    setMessage(err?.message || "Impossible d’enregistrer.", true);
    setSaveState("dirty");
  } finally {
    els.btnSaveConfig.disabled = false;
  }
}

function syncDraftsFromUI(){
  for (const t of toolsCatalog){
    const draft = getToolDraft(t.id);
    const chk = document.getElementById(`chk_${t.id}`);
    if (!chk) continue;
    draft.enabled = !!chk.checked;
  }
}

function countEnabledTools(){
  let total = 0;
  for (const t of toolsCatalog){
    if (getToolDraft(t.id).enabled) total += 1;
  }
  return total;
}

function renderGlobals(){
  if (els.questionTransitionSecInput){
    els.questionTransitionSecInput.value = activityGlobals.questionTransitionSec;
  }
}

function serializeGlobals(){
  return normalizeActivityGlobals(activityGlobals);
}

function applyRemoteGlobals(remoteGlobals){
  Object.assign(activityGlobals, normalizeActivityGlobals(remoteGlobals));
}

function setSaveState(state){
  saveState = state;

  const btn = els.btnSaveConfig;
  if (!btn) return;

  btn.classList.remove("dirty", "saving", "saved");

  if (state === "dirty"){
    btn.classList.add("dirty");
    btn.textContent = "Enregistrer";
  }

  if (state === "saving"){
    btn.classList.add("saving");
    btn.textContent = "Enregistrement…";
  }

  if (state === "saved"){
    btn.classList.add("saved");
    btn.textContent = "Enregistré";
  }
}

/* =========================
   DRAFTS
   ========================= */

function ensureConfigDrafts(){
  for (const t of toolsCatalog){
    if (!configDrafts.has(t.id)){
      configDrafts.set(t.id, normalizeToolDraft(DEFAULT_TOOL_ROW));
    }
  }
}

function getToolDraft(id){
  if (!configDrafts.has(id)){
    configDrafts.set(id, normalizeToolDraft(DEFAULT_TOOL_ROW));
  }
  return configDrafts.get(id);
}

function serializeDrafts(){
  const out = {};
  for (const t of toolsCatalog){
    const draft = getToolDraft(t.id);
    out[t.id] = normalizeToolDraft(draft);
  }
  return out;
}

function applyRemoteDrafts(remoteDrafts){
  ensureConfigDrafts();

  for (const t of toolsCatalog){
    const incoming = remoteDrafts?.[t.id];
    const draft = getToolDraft(t.id);

    if (!incoming){
      Object.assign(draft, normalizeToolDraft(DEFAULT_TOOL_ROW));
      continue;
    }

    Object.assign(draft, normalizeToolDraft(incoming));
  }
}

function persistCurrentToolSettings(){
  if (!currentToolSettingsEditor) return;

  persistCurrentToolHeaderControls();

  const host = els.toolConfigHost;
  if (!host) return;

  const { toolId, tool } = currentToolSettingsEditor;
  const draft = getToolDraft(toolId);

  try {
    if (typeof tool.readToolSettings === "function"){
      draft.settings = tool.readToolSettings(host);
    } else if (draft.settings == null){
      draft.settings = getToolDefaultSettings(tool);
    }

    setSaveState("dirty");
    setMessage("");
  } catch (err) {
    setMessage(err?.message || "Réglages invalides.", true);
  }
}

function renderConfigTableSelectionState(){
  for (const t of toolsCatalog) {
    const row = document.getElementById(`row_${t.id}`);
    row?.classList.toggle("active", currentSelectedToolId === t.id);
  }
}

function ensureToolHeaderControlsSlot(){
  const settingsHeader = document.querySelector(".cfg-settings-header");
  if (!settingsHeader) return null;

  let slot = document.getElementById("toolHeaderControls");
  if (slot) return slot;

  slot = document.createElement("div");
  slot.id = "toolHeaderControls";
  slot.className = "cfg-tool-header-controls";

  const title = els.toolConfigTitle;
  if (title && title.parentElement === settingsHeader) {
    title.insertAdjacentElement("afterend", slot);
  } else {
    settingsHeader.prepend(slot);
  }

  return slot;
}

function clearToolHeaderControls(){
  const slot = document.getElementById("toolHeaderControls");
  if (slot) slot.innerHTML = "";
}

function persistCurrentToolHeaderControls(){
  if (!currentToolSettingsEditor) return;

  const { toolId, tool } = currentToolSettingsEditor;
  const draft = getToolDraft(toolId);
  const slot = document.getElementById("toolHeaderControls");
  if (!slot) return;

  try {
    if (typeof tool.readToolHeaderControls === "function"){
      draft.settings = tool.readToolHeaderControls(slot, cloneData(draft.settings));
      setSaveState("dirty");
      setMessage("");
    }
  } catch (err) {
    setMessage(err?.message || "Réglages d’en-tête invalides.", true);
  }
}

function renderEmptyToolPanel(){
  clearToolHeaderControls();

  if (els.toolConfigTitle) {
    els.toolConfigTitle.textContent = "Configuration de l’outil";
  }

  if (els.toolConfigHost) {
    els.toolConfigHost.innerHTML = `
      <div class="cfg-empty-state">
        Sélectionne un outil dans la colonne de gauche.
      </div>
    `;
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
  window.location.href = `teacher-dashboard.html?accessCode=${encodeURIComponent(currentAccessCode)}`;
}

/* =========================
   UI
   ========================= */

function setFatalState(message){
  setMessage(message, true);

  if (els.btnSaveConfig){
    els.btnSaveConfig.disabled = true;
  }

  renderEmptyToolPanel();
}

function setMessage(text, isError = false){
  if (!els.editorMessage) return;
  els.editorMessage.textContent = text;
  els.editorMessage.style.color = isError ? "var(--bad)" : "var(--muted)";
}

/* =========================
   HELPERS
   ========================= */

function escapeHtml(s){
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}