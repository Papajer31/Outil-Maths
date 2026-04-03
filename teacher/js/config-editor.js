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
} from "../../shared/module-registry.js";
import {
  TOOL_LIMITS,
  DEFAULT_TOOL_ROW,
  DEFAULT_ACTIVITY_GLOBALS,
  clampInt,
  cloneData,
  normalizeActivityGlobals,
  normalizeToolDraft,
  normalizeActivitySequence,
  createToolInstanceId
} from "../../shared/activity-config.js";
import {
  formatDurationEstimate
} from "../../shared/activity-duration.js";
import {
  renderSelectControl,
  bindSelect
} from "../../shared/config-widgets.js";

const els = {
  btnBackDashboard: document.getElementById("btnBackDashboard"),
  btnSaveConfig: document.getElementById("btnSaveConfig"),
  btnAddSequenceTool: document.getElementById("btnAddSequenceTool"),
  btnCloseToolPicker: document.getElementById("btnCloseToolPicker"),

  classCodeInput: document.getElementById("classCodeInput"),
  moduleSelectHost: document.getElementById("moduleSelectHost"),
  configNameInput: document.getElementById("configNameInput"),
  editorMessage: document.getElementById("editorMessage"),
  questionTransitionSecInput: document.getElementById("questionTransitionSecInput"),
  configRows: document.getElementById("configRows"),

  toolConfigTitle: document.getElementById("toolConfigTitle"),
  toolConfigHost: document.getElementById("toolConfigHost"),
  activityDurationEstimate: document.getElementById("activityDurationEstimate"),

  toolPickerOverlay: document.getElementById("toolPickerOverlay"),
  toolPickerTiles: document.getElementById("toolPickerTiles")
};

let currentUser = null;
let currentAccessCode = "";
let currentConfigName = "";
let currentTeacherSpace = null;
let availableStudents = [];
let saveState = "saved";

let currentModuleKey = "maths";
let availableModules = [];
let isEditingExistingConfig = false;

let moduleRuntime = null;
let toolsCatalog = [];
const toolModuleCache = new Map();
const sequenceDrafts = new Map();
let activitySequence = [];

let currentToolSettingsEditor = null;
let currentSelectedInstanceId = null;
let activityEstimateRefreshTimer = null;
let activityEstimateRefreshToken = 0;
let dragState = {
  draggedInstanceId: "",
  dropIndex: null
};

const activityGlobals = {
  questionTransitionSec: DEFAULT_ACTIVITY_GLOBALS.questionTransitionSec
};

boot();

async function boot(){
  setMessage("Chargement…");

  try {
    currentUser = await getCurrentUser();
    if (!currentUser){
      window.location.href = "login.html";
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

    await reloadCurrentModule();

    if (existingConfig){
      loadExistingConfig(existingConfig);
    }

    renderModuleSelect();
    renderMeta();
    renderGlobals();
    renderToolPickerTiles();
    renderConfigTable();
    bindEvents();
    await refreshActivityDurationEstimate();

    setMessage("");
  } catch (err) {
    setFatalState(err?.message || "Impossible d’ouvrir l’éditeur.");
  }

  setSaveState("saved");
}

function loadExistingConfig(existing){
  const safeConfig = existing?.config_json;

  if (!safeConfig?.sequence && !safeConfig?.drafts){
    setMessage("Configuration introuvable, création d’une nouvelle base.", true);
    return;
  }

  applyRemoteGlobals(safeConfig.globals);
  applyRemoteSequence(safeConfig.sequence, safeConfig.drafts);
}

function renderMeta(){
  if (els.classCodeInput){
    els.classCodeInput.value = currentAccessCode;
  }

  if (els.configNameInput){
    els.configNameInput.value = currentConfigName;
  }
}

function bindEvents(){
  els.btnBackDashboard?.addEventListener("click", goBackDashboard);
  els.btnSaveConfig?.addEventListener("click", saveCurrentConfig);
  els.btnAddSequenceTool?.addEventListener("click", openToolPicker);
  els.btnCloseToolPicker?.addEventListener("click", closeToolPicker);

  els.toolPickerOverlay?.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-tool-picker='true']")) {
      closeToolPicker();
    }
  });

  els.configRows?.addEventListener("dragover", handleSequenceDragOver);
  els.configRows?.addEventListener("dragleave", handleSequenceDragLeave);
  els.configRows?.addEventListener("drop", handleSequenceDrop);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isToolPickerOpen()) {
      closeToolPicker();
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
    scheduleActivityDurationEstimate();
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
    scheduleActivityDurationEstimate();
  });

  els.configNameInput?.addEventListener("input", () => setSaveState("dirty"));

  els.toolConfigHost?.addEventListener("input", () => {
    setSaveState("dirty");
    scheduleActivityDurationEstimate();
  });

  els.toolConfigHost?.addEventListener("change", () => {
    setSaveState("dirty");
    scheduleActivityDurationEstimate();
  });

  els.toolConfigHost?.addEventListener("click", (event) => {
    if (!event.target.closest("[data-paste]")) return;

    window.requestAnimationFrame(() => {
      setSaveState("dirty");
      scheduleActivityDurationEstimate();
    });
  });
}

function renderModuleSelect(){
  if (!els.moduleSelectHost) return;

  const options = availableModules.map((mod) => ({
    value: mod.key,
    label: mod.label
  }));

  els.moduleSelectHost.innerHTML = renderSelectControl({
    id: "moduleSelect",
    value: currentModuleKey,
    options,
    disabled: isEditingExistingConfig,
    rootClassName: "cfg-module-select"
  });

  if (isEditingExistingConfig) {
    return;
  }

  bindSelect(els.moduleSelectHost, "moduleSelect", {
    onChange: (nextModuleKey) => {
      handleModuleSelectionChange(nextModuleKey).catch((err) => {
        setMessage(err?.message || "Impossible de charger ce module.", true);
        renderModuleSelect();
      });
    }
  });
}

async function handleModuleSelectionChange(nextModuleKey){
  const safeNextModuleKey = String(nextModuleKey || "").trim();
  if (!safeNextModuleKey || safeNextModuleKey === currentModuleKey) return;

  persistCurrentToolSettings();

  currentModuleKey = safeNextModuleKey;
  await reloadCurrentModule();
  renderModuleSelect();
  renderMeta();
  renderGlobals();
  renderToolPickerTiles();
  renderConfigTable();
  scheduleActivityDurationEstimate();
  setMessage("");
  setSaveState("dirty");
}

async function reloadCurrentModule(){
  currentToolSettingsEditor = null;
  currentSelectedInstanceId = null;
  dragState = { draggedInstanceId: "", dropIndex: null };

  toolModuleCache.clear();
  sequenceDrafts.clear();
  activitySequence = [];

  moduleRuntime = loadModuleRuntime(currentModuleKey);
  toolsCatalog = await moduleRuntime.loadToolsCatalog();

  if (!Array.isArray(toolsCatalog)) {
    toolsCatalog = [];
  }
}

function renderConfigTable(){
  if (!els.configRows) return;

  if (!activitySequence.length) {
    els.configRows.innerHTML = `
      <div class="cfg-empty-state cfg-sequence-empty">
        Aucun outil dans la séquence.<br>Clique sur + pour ajouter une étape.
      </div>
    `;

    renderEmptyToolPanel();
    return;
  }

  const labels = buildSequenceLabels();

  els.configRows.innerHTML = activitySequence.map((item) => {
    const label = labels.get(item.instanceId) || buildDefaultSequenceLabel(item.toolId);
    return configRowHTML(item, label);
  }).join("");

  activitySequence.forEach((item) => {
    const row = document.getElementById(`row_${cssSafeId(item.instanceId)}`);
    const btnDelete = document.getElementById(`delete_${cssSafeId(item.instanceId)}`);

    if (!row || !btnDelete) return;

    row.classList.toggle("active", currentSelectedInstanceId === item.instanceId);

    row.addEventListener("click", () => {
      openToolSettings(item.instanceId).catch((err) => {
        setMessage(err?.message || "Impossible d’ouvrir les réglages outil.", true);
      });
    });

    btnDelete.addEventListener("click", (event) => {
      event.stopPropagation();
      removeSequenceItem(item.instanceId);
    });

    row.addEventListener("dragstart", (event) => handleRowDragStart(event, item.instanceId));
    row.addEventListener("dragend", handleRowDragEnd);
  });

  renderConfigTableSelectionState();
}

function configRowHTML(item, label){
  const safeId = cssSafeId(item.instanceId);

  return `
    <div class="cfg-tool-row" id="row_${safeId}" draggable="true">
      <div class="cfg-tool-grip" aria-hidden="true">⋮⋮</div>
      <div class="cfg-tool-main">
        <div class="cfg-tool-name">${escapeHtml(label.title)}</div>
        ${label.subtitle ? `<div class="cfg-tool-subtitle">${escapeHtml(label.subtitle)}</div>` : ""}
      </div>
      <button class="btn btn-icon cfg-tool-action cfg-tool-delete" type="button" id="delete_${safeId}" aria-label="Supprimer ${escapeHtml(label.title)}"><span class="cfg-material-icon" aria-hidden="true">delete</span></button>
    </div>
  `;
}

function renderToolPickerTiles(){
  if (!els.toolPickerTiles) return;

  if (!toolsCatalog.length) {
    els.toolPickerTiles.innerHTML = `
      <div class="cfg-empty-state">
        Aucun outil disponible dans ce module.
      </div>
    `;
    return;
  }

  els.toolPickerTiles.innerHTML = toolsCatalog.map((tool) => `
    <button class="cfg-tool-picker-tile" type="button" data-tool-id="${escapeHtml(tool.id)}">
      <div class="cfg-tool-picker-tile-title">${escapeHtml(tool.title)}</div>
    </button>
  `).join("");

  els.toolPickerTiles.querySelectorAll("[data-tool-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const toolId = String(btn.getAttribute("data-tool-id") || "").trim();
      addToolToSequence(toolId).catch((err) => {
        setMessage(err?.message || "Impossible d’ajouter cet outil.", true);
      });
    });
  });
}

function openToolPicker(){
  renderToolPickerTiles();
  els.toolPickerOverlay?.classList.remove("hidden");
  els.toolPickerOverlay?.setAttribute("aria-hidden", "false");
}

function closeToolPicker(){
  els.toolPickerOverlay?.classList.add("hidden");
  els.toolPickerOverlay?.setAttribute("aria-hidden", "true");
}

function isToolPickerOpen(){
  return !!els.toolPickerOverlay && !els.toolPickerOverlay.classList.contains("hidden");
}

async function addToolToSequence(toolId){
  const safeToolId = String(toolId || "").trim();
  if (!safeToolId) return;

  const toolMeta = getToolMeta(safeToolId);
  if (!toolMeta) {
    throw new Error("Outil introuvable dans ce module.");
  }

  persistCurrentToolSettings();

  const mod = await loadToolModule(safeToolId);
  const tool = mod.default ?? {};
  const instanceId = createToolInstanceId(safeToolId);
  const draft = normalizeToolDraft({
    ...DEFAULT_TOOL_ROW,
    enabled: true,
    settings: getToolDefaultSettings(tool)
  });
  draft.enabled = true;

  activitySequence.push({ instanceId, toolId: safeToolId });
  sequenceDrafts.set(instanceId, {
    instanceId,
    toolId: safeToolId,
    draft
  });

  closeToolPicker();
  renderConfigTable();
  setSaveState("dirty");
  scheduleActivityDurationEstimate();
  setMessage("");

  await openToolSettings(instanceId);
}

function removeSequenceItem(instanceId){
  const safeInstanceId = String(instanceId || "").trim();
  if (!safeInstanceId) return;

  persistCurrentToolSettings();

  const index = activitySequence.findIndex((item) => item.instanceId === safeInstanceId);
  if (index < 0) return;

  activitySequence.splice(index, 1);
  sequenceDrafts.delete(safeInstanceId);

  const replacement = activitySequence[index] || activitySequence[index - 1] || null;

  if (currentSelectedInstanceId === safeInstanceId) {
    currentSelectedInstanceId = replacement?.instanceId ?? null;
    currentToolSettingsEditor = null;
  }

  renderConfigTable();
  setSaveState("dirty");
  scheduleActivityDurationEstimate();
  setMessage("");

  if (replacement) {
    openToolSettings(replacement.instanceId).catch((err) => {
      setMessage(err?.message || "Impossible d’ouvrir les réglages outil.", true);
    });
    return;
  }

  renderEmptyToolPanel();
}

function handleRowDragStart(event, instanceId) {
  dragState.draggedInstanceId = instanceId;
  dragState.dropIndex = null;

  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", instanceId);
  event.currentTarget?.classList.add("is-dragging");
}

function handleRowDragEnd(event) {
  event.currentTarget?.classList.remove("is-dragging");
  clearDropMarker();
}

function handleSequenceDragOver(event) {
  if (!dragState.draggedInstanceId || !els.configRows) {
    return;
  }

  event.preventDefault();
  const dropIndex = getSequenceDropIndexFromClientY(event.clientY);
  dragState.dropIndex = dropIndex;
  renderSequenceDropIndicator(dropIndex);
  event.dataTransfer.dropEffect = "move";
}

function handleSequenceDragLeave(event) {
  if (!els.configRows) return;
  const relatedTarget = event.relatedTarget;
  if (relatedTarget instanceof Node && els.configRows.contains(relatedTarget)) return;
  clearDropMarker();
}

function handleSequenceDrop(event) {
  if (!dragState.draggedInstanceId) return;

  event.preventDefault();
  const draggedInstanceId = String(
    event.dataTransfer.getData("text/plain") || dragState.draggedInstanceId || ""
  ).trim();
  const dropIndex = Number.isInteger(dragState.dropIndex)
    ? dragState.dropIndex
    : getSequenceDropIndexFromClientY(event.clientY);

  clearDropMarker();
  moveSequenceItemToIndex(draggedInstanceId, dropIndex);
}

function getVisibleSequenceRows() {
  return Array.from(els.configRows?.querySelectorAll(".cfg-tool-row[id]") || [])
    .filter((row) => String(row.id || "") !== `row_${cssSafeId(dragState.draggedInstanceId || "")}`);
}

function getSequenceDropIndexFromClientY(clientY) {
  const rows = getVisibleSequenceRows();
  if (!rows.length) return 0;

  for (let index = 0; index < rows.length; index += 1) {
    const rect = rows[index].getBoundingClientRect();
    const midpoint = rect.top + (rect.height / 2);
    if (clientY < midpoint) {
      return index;
    }
  }

  return rows.length;
}

function ensureSequenceDropIndicator() {
  if (!els.configRows) return null;

  let indicator = els.configRows.querySelector(":scope > .cfg-drop-indicator");
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.className = "cfg-drop-indicator";
    indicator.hidden = true;
    els.configRows.appendChild(indicator);
  }
  return indicator;
}

function renderSequenceDropIndicator(dropIndex) {
  if (!els.configRows) return;

  const rows = getVisibleSequenceRows();
  const indicator = ensureSequenceDropIndicator();
  if (!indicator) return;

  let top = 0;
  if (rows.length === 0) {
    top = 0;
  } else if (dropIndex <= 0) {
    top = rows[0].offsetTop;
  } else if (dropIndex >= rows.length) {
    const lastRow = rows[rows.length - 1];
    top = lastRow.offsetTop + lastRow.offsetHeight;
  } else {
    top = rows[dropIndex].offsetTop;
  }

  indicator.style.top = `${Math.round(top)}px`;
  indicator.hidden = false;
}

function moveSequenceItemToIndex(draggedInstanceId, dropIndex) {
  const safeDraggedId = String(draggedInstanceId || "").trim();
  if (!safeDraggedId) return;

  const draggedIndex = activitySequence.findIndex((item) => item.instanceId === safeDraggedId);
  if (draggedIndex < 0) return;

  const [draggedItem] = activitySequence.splice(draggedIndex, 1);
  const safeDropIndex = Math.max(0, Math.min(Number(dropIndex) || 0, activitySequence.length));
  activitySequence.splice(safeDropIndex, 0, draggedItem);

  renderConfigTable();
  setSaveState("dirty");
  scheduleActivityDurationEstimate();
}


function clearDropMarker() {
  dragState.dropIndex = null;
  els.configRows?.querySelectorAll(".cfg-tool-row").forEach((row) => {
    row.classList.remove("is-dragging");
  });
  els.configRows?.querySelector(":scope > .cfg-drop-indicator")?.remove();
}


async function openToolSettings(instanceId){
  const entry = getSequenceEntry(instanceId);
  if (!entry) return;

  persistCurrentToolSettings();

  currentSelectedInstanceId = entry.instanceId;

  const draft = getSequenceDraft(entry.instanceId);
  const mod = await loadToolModule(entry.toolId);
  const tool = mod.default ?? {};

  if (draft.settings == null){
    draft.settings = getToolDefaultSettings(tool);
  }

  currentToolSettingsEditor = { instanceId: entry.instanceId, toolId: entry.toolId, tool };
  renderConfigTableSelectionState();
  injectSharedToolHeaderStyles();

  const headerSlot = ensureToolHeaderControlsSlot();
  if (headerSlot) {
    headerSlot.innerHTML = "";
  }

  if (els.toolConfigTitle) {
    const label = buildSequenceLabels().get(entry.instanceId) || buildDefaultSequenceLabel(entry.toolId);
    els.toolConfigTitle.textContent = label.subtitle
      ? `${label.title} — ${label.subtitle}`
      : label.title;
  }

  const host = els.toolConfigHost;
  if (!host) return;

  const commonSettingsHtml =
    typeof moduleRuntime?.renderCommonToolSettings === "function"
      ? (moduleRuntime.renderCommonToolSettings(cloneData(draft), getToolEditorContext(entry.instanceId)) || "")
      : "";

  host.innerHTML = `
    <div class="cfg-tool-settings-stack">
      ${commonSettingsHtml}
      <div id="toolSpecificSettingsHost"></div>
    </div>
  `;

  const settingsHost = getSpecificToolSettingsHost(host);

  if (typeof tool.renderToolSettings === "function"){
    tool.renderToolSettings(
      settingsHost,
      cloneData(getSequenceDraft(entry.instanceId).settings),
      getToolEditorContext(entry.instanceId)
    );
  } else {
    settingsHost.innerHTML = `<div class="cfg-empty-state">Aucun réglage spécifique pour cet outil.</div>`;
  }

  if (typeof moduleRuntime?.bindCommonToolSettings === "function") {
    moduleRuntime.bindCommonToolSettings(host, {
      onDirty: () => {
        setSaveState("dirty");
        scheduleActivityDurationEstimate();
      }
    });
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

  scheduleActivityDurationEstimate();
}

async function saveCurrentConfig(){
  setSaveState("saving");
  const name = String(els.configNameInput?.value || "").trim();

  if (!name){
    setMessage("Entre un nom d’activité.", true);
    els.configNameInput?.focus();
    setSaveState("dirty");
    return;
  }

  persistCurrentToolSettings();

  const enabledCount = countEnabledTools();
  if (enabledCount === 0){
    setMessage("Ajoute au moins un outil dans la séquence.", true);
    setSaveState("dirty");
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
        version: 3,
        globals: serializeGlobals(),
        sequence: serializeSequence()
      }
    });

    currentConfigName = name;
    renderMeta();

    setSaveState("saved");
    setMessage(`Activité "${name}" enregistrée.`);
  } catch (err) {
    setSaveState("dirty");
    setMessage(err?.message || "Impossible d’enregistrer.", true);
  } finally {
    els.btnSaveConfig.disabled = false;
  }
}

function renderGlobals(){
  injectSharedToolHeaderStyles();

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

function applyRemoteSequence(remoteSequence, legacyDrafts){
  const safeSequence = normalizeActivitySequence(remoteSequence, {
    toolsCatalog,
    legacyDrafts
  });

  activitySequence = safeSequence.map((item) => ({
    instanceId: item.instanceId,
    toolId: item.toolId
  }));

  sequenceDrafts.clear();

  safeSequence.forEach((item) => {
    sequenceDrafts.set(item.instanceId, {
      instanceId: item.instanceId,
      toolId: item.toolId,
      draft: normalizeToolDraft(item.draft)
    });
  });
}

function getSequenceEntry(instanceId){
  const safeInstanceId = String(instanceId || "").trim();
  if (!safeInstanceId) return null;
  return activitySequence.find((item) => item.instanceId === safeInstanceId) || null;
}

function getSequenceDraft(instanceId){
  const safeInstanceId = String(instanceId || "").trim();
  const entry = getSequenceEntry(safeInstanceId);
  if (!entry) return normalizeToolDraft(DEFAULT_TOOL_ROW);

  if (!sequenceDrafts.has(safeInstanceId)) {
    sequenceDrafts.set(safeInstanceId, {
      instanceId: safeInstanceId,
      toolId: entry.toolId,
      draft: normalizeToolDraft({
        ...DEFAULT_TOOL_ROW,
        enabled: true
      })
    });
  }

  const stored = sequenceDrafts.get(safeInstanceId);
  stored.toolId = entry.toolId;
  stored.draft.enabled = true;
  return stored.draft;
}

function serializeSequence(){
  persistCurrentToolSettings();

  return activitySequence.map((item) => ({
    instanceId: item.instanceId,
    toolId: item.toolId,
    draft: normalizeToolDraft({
      ...getSequenceDraft(item.instanceId),
      enabled: true
    })
  }));
}

function persistCurrentToolSettings(){
  if (!currentToolSettingsEditor) return;

  persistCurrentToolHeaderControls();

  const host = els.toolConfigHost;
  if (!host) return;

  const { instanceId, tool } = currentToolSettingsEditor;
  const draft = getSequenceDraft(instanceId);

  try {
    let nextDraft = normalizeToolDraft({
      ...draft,
      enabled: true
    });

    if (nextDraft.settings == null){
      nextDraft.settings = getToolDefaultSettings(tool);
    }

    if (typeof moduleRuntime?.readCommonToolSettings === "function") {
      const nextDraftFromModule = moduleRuntime.readCommonToolSettings(
        host,
        nextDraft,
        getToolEditorContext(instanceId)
      );

      if (nextDraftFromModule) {
        nextDraft = normalizeToolDraft(nextDraftFromModule);
      }
    }

    const settingsHost = getSpecificToolSettingsHost(host);

    if (typeof tool.readToolSettings === "function"){
      const nextSettings = tool.readToolSettings(
        settingsHost,
        cloneData(nextDraft.settings),
        getToolEditorContext(instanceId)
      );

      nextDraft.settings = mergeToolSettings(nextDraft.settings, nextSettings);
    } else if (nextDraft.settings == null){
      nextDraft.settings = getToolDefaultSettings(tool);
    }

    nextDraft.enabled = true;

    const stored = sequenceDrafts.get(instanceId) || {
      instanceId,
      toolId: currentToolSettingsEditor.toolId,
      draft: normalizeToolDraft(DEFAULT_TOOL_ROW)
    };

    stored.toolId = currentToolSettingsEditor.toolId;
    stored.draft = normalizeToolDraft(nextDraft);
    stored.draft.enabled = true;
    sequenceDrafts.set(instanceId, stored);

    setSaveState("dirty");
    setMessage("");
  } catch (err) {
    setMessage(err?.message || "Réglages invalides.", true);
  }
}

function renderConfigTableSelectionState(){
  activitySequence.forEach((item) => {
    const row = document.getElementById(`row_${cssSafeId(item.instanceId)}`);
    row?.classList.toggle("active", currentSelectedInstanceId === item.instanceId);
  });
}

function ensureToolHeaderControlsSlot(){
  return null;
}

function clearToolHeaderControls(){
  const slot = document.getElementById("toolHeaderControls");
  slot?.remove();
}

function persistCurrentToolHeaderControls(){
  return;
}

function renderEmptyToolPanel(){
  clearToolHeaderControls();

  if (els.toolConfigTitle) {
    els.toolConfigTitle.textContent = "Configuration de l’outil";
  }

  if (els.toolConfigHost) {
    els.toolConfigHost.innerHTML = `
      <div class="cfg-empty-state">
        Sélectionne un outil dans la séquence.
      </div>
    `;
  }
}

function scheduleActivityDurationEstimate(){
  if (activityEstimateRefreshTimer) {
    clearTimeout(activityEstimateRefreshTimer);
  }

  activityEstimateRefreshTimer = window.setTimeout(() => {
    activityEstimateRefreshTimer = null;
    refreshActivityDurationEstimate().catch(() => {});
  }, 80);
}

async function refreshActivityDurationEstimate(){
  const token = ++activityEstimateRefreshToken;

  persistCurrentToolSettings();

  const estimate = typeof moduleRuntime?.estimateActivityDuration === "function"
    ? await moduleRuntime.estimateActivityDuration({
        globals: serializeGlobals(),
        sequence: serializeSequence()
      })
    : null;

  if (token !== activityEstimateRefreshToken) return;

  const text = countEnabledTools() > 0
    ? formatDurationEstimate(estimate)
    : "—";

  if (els.activityDurationEstimate) {
    els.activityDurationEstimate.textContent = `Durée estimée : ${text}`;
    els.activityDurationEstimate.title = text === "—" ? "Durée indisponible" : `Durée estimée : ${text}`;
  }
}

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

function injectSharedToolHeaderStyles(){
  return;
}

function isPlainObject(value){
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function mergeToolSettings(baseSettings, nextSettings){
  const safeBase = isPlainObject(baseSettings) ? cloneData(baseSettings) : {};

  if (nextSettings == null) return safeBase;
  if (isPlainObject(nextSettings)) return { ...safeBase, ...nextSettings };

  return cloneData(nextSettings);
}

function getSpecificToolSettingsHost(container){
  return container.querySelector("#toolSpecificSettingsHost") || container;
}

function getToolEditorContext(instanceId = currentSelectedInstanceId){
  return {
    accessCode: currentAccessCode,
    teacherSpace: cloneData(currentTeacherSpace),
    students: cloneData(availableStudents),
    moduleKey: currentModuleKey,
    configName: currentConfigName,
    toolInstanceId: String(instanceId || "")
  };
}

function getToolMeta(toolId){
  return toolsCatalog.find((tool) => tool.id === toolId) || null;
}

function buildSequenceLabels(){
  const labels = new Map();

  activitySequence.forEach((item) => {
    const toolMeta = getToolMeta(item.toolId);

    labels.set(item.instanceId, {
      title: toolMeta?.title || item.toolId,
      subtitle: ""
    });
  });

  return labels;
}

function buildDefaultSequenceLabel(toolId){
  const toolMeta = getToolMeta(toolId);
  return {
    title: toolMeta?.title || String(toolId || "Outil"),
    subtitle: ""
  };
}

function countEnabledTools(){
  return activitySequence.length;
}

function goBackDashboard(){
  window.location.href = `dashboard.html?accessCode=${encodeURIComponent(currentAccessCode)}`;
}

function setFatalState(message){
  setMessage(message, true);

  if (els.btnSaveConfig){
    els.btnSaveConfig.disabled = true;
  }

  if (els.btnAddSequenceTool) {
    els.btnAddSequenceTool.disabled = true;
  }

  renderEmptyToolPanel();
}

function setMessage(text, isError = false){
  if (!els.editorMessage) return;
  els.editorMessage.textContent = text;
  els.editorMessage.style.color = isError ? "var(--bad)" : "var(--muted)";
}

function cssSafeId(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "item";
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
