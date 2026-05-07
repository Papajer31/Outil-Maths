import {
  getCurrentUser,
  normalizeAccessCode,
  getMyTeacherSpace,
  getMyActivityByName,
  saveActivityConfig
} from "./teacher-api.js";
import { listPublicStudentsForSpace } from "../../shared/public-api.js";
import {
  getAvailableToolRoots,
  loadToolsRuntime
} from "../../shared/tool-root-runtime.js";
import {
  DEFAULT_ACTIVITY_MODE,
  getActivityModeLabel,
  getToolActivityModeSupport,
  isStudentFacingActivityMode,
  normalizeActivityMode
} from "../../shared/activity-modes.js";
import {
  TOOL_LIMITS,
  DEFAULT_TOOL_ROW,
  DEFAULT_ACTIVITY_GLOBALS,
  clampInt,
  cloneData,
  getCommonInfiniteGaugeSettings,
  normalizeActivityGlobals,
  normalizeToolDraft,
  normalizeActivitySequence,
  createToolInstanceId
} from "../../shared/activity-config.js";
import {
  normalizeDurationEstimate
} from "../../shared/activity-duration.js";
import {
  renderSelectControl,
  bindSelect,
  bindStepperField,
  refreshStepper
} from "../../shared/config-widgets.js";
import { createProjectedSessionLink } from "../../shared/projected-session-link.js";
import {
  ACTIVITY_SHARE_DISABLED_TITLE,
  ACTIVITY_SHARE_MESSAGES,
  isActivityShareable,
  copyActivityShareLink,
  openActivityShareLink,
  downloadActivityShareQrCode
} from "./activity-share.js";

let els = createEditorElements();
let mountOptions = createDefaultMountOptions();
let editorAbortController = null;

function createEditorElements(){
  return {
    page: document.querySelector(".cfg-page"),
    btnBackDashboard: document.getElementById("btnBackDashboard"),
    btnSaveConfig: document.getElementById("btnSaveConfig"),
    btnShareActivity: document.getElementById("btnShareActivity"),
    btnShareCopyLink: document.getElementById("btnShareCopyLink"),
    btnShareOpenLink: document.getElementById("btnShareOpenLink"),
    btnShareDownloadQr: document.getElementById("btnShareDownloadQr"),
    sharePopup: document.getElementById("sharePopup"),
    sharePopupStudentActions: document.getElementById("sharePopupStudentActions"),
    btnAddSequenceTool: document.getElementById("btnAddSequenceTool"),
    btnCloseToolPicker: document.getElementById("btnCloseToolPicker"),

    classCodeInput: document.getElementById("classCodeInput"),
    activityModeBadge: document.getElementById("activityModeBadge"),
    configNameDisplay: document.getElementById("configNameDisplay"),
    btnRenameConfig: document.getElementById("btnRenameConfig"),
    btnProjectConfig: document.getElementById("btnProjectConfig"),
    editorMessage: document.getElementById("editorMessage"),
    configRows: document.getElementById("configRows"),

    toolConfigTitle: document.getElementById("toolConfigTitle"),
    toolConfigHost: document.getElementById("toolConfigHost"),
    activityDurationEstimate: document.getElementById("activityDurationEstimate"),
    activityTotalTimeControl: document.getElementById("activityTotalTimeControl"),
    activityTotalTimeToggleButton: document.getElementById("activityTotalTimeToggleButton"),
    activityTotalTimePanel: document.getElementById("activityTotalTimePanel"),
    activityTotalTimeFixedCheckbox: document.getElementById("activityTotalTimeFixedCheckbox"),
    activityTotalTimeMinutesInput: document.getElementById("activityTotalTimeMinutesInput"),
    activityTotalTimeChevron: document.getElementById("activityTotalTimeChevron"),
    sequenceWarnings: document.getElementById("sequenceWarnings"),

    projectedControlPanel: document.getElementById("projectedControlPanel"),
    btnProjectedTogglePopupControls: document.getElementById("btnProjectedTogglePopupControls"),
    projectedTogglePopupControlsIcon: document.getElementById("projectedTogglePopupControlsIcon"),
    projectedTogglePopupControlsLabel: document.getElementById("projectedTogglePopupControlsLabel"),
    btnProjectedQuit: document.getElementById("btnProjectedQuit"),
    btnProjectedPrevTool: document.getElementById("btnProjectedPrevTool"),
    btnProjectedShowAnswer: document.getElementById("btnProjectedShowAnswer"),
    btnProjectedNextQuestion: document.getElementById("btnProjectedNextQuestion"),
    projectedNextQuestionLabel: document.getElementById("projectedNextQuestionLabel"),
    btnProjectedNextTool: document.getElementById("btnProjectedNextTool"),
    btnProjectedPause: document.getElementById("btnProjectedPause"),
    projectedPauseIcon: document.getElementById("projectedPauseIcon"),
    projectedPauseLabel: document.getElementById("projectedPauseLabel"),

    renameActivityModal: document.getElementById("renameActivityModal"),
    renameActivityModalTitle: document.getElementById("renameActivityModalTitle"),
    renameActivityInput: document.getElementById("renameActivityInput"),
    renameActivityModalMessage: document.getElementById("renameActivityModalMessage"),
    btnRenameActivityCancel: document.getElementById("btnRenameActivityCancel"),
    btnRenameActivityConfirm: document.getElementById("btnRenameActivityConfirm"),

    toolPickerOverlay: document.getElementById("toolPickerOverlay"),
    toolPickerTiles: document.getElementById("toolPickerTiles")
  };
}

function createDefaultMountOptions(){
  return {
    accessCode: "",
    configName: "",
    activityMode: DEFAULT_ACTIVITY_MODE,
    folderId: "",
    projected: null,
    syncUrl: false,
    onBack: null,
    onAuthRequired: null,
    onStateChange: null
  };
}

function addScopedListener(target, type, handler, options = undefined){
  if (!target?.addEventListener) return;

  if (editorAbortController?.signal) {
    const listenerOptions = options && typeof options === "object"
      ? { ...options, signal: editorAbortController.signal }
      : { signal: editorAbortController.signal };
    target.addEventListener(type, handler, listenerOptions);
    return;
  }

  target.addEventListener(type, handler, options);
}

let currentUser = null;
let currentAccessCode = "";
let currentConfigName = "";
let currentConfigNameDraft = "";
let currentTeacherSpace = null;
let availableStudents = [];
let saveState = "saved";
let currentActivityMode = DEFAULT_ACTIVITY_MODE;

let currentModuleKey = "tools";
let currentTargetFolderId = "";
let availableModules = [];
let isEditingExistingConfig = false;
let savedConfigName = "";
let isProjectedEditorMode = false;
let projectedSessionLink = null;
let projectedSessionStatus = null;
let projectedStatusRequestTimer = null;
let hasProjectedLiveChanges = false;

let moduleRuntime = null;
let toolsCatalog = [];
const toolModuleCache = new Map();
const sequenceDrafts = new Map();
let activitySequence = [];

let currentToolSettingsEditor = null;
let currentSelectedInstanceId = null;
let activityEstimateRefreshTimer = null;
let activityEstimateRefreshToken = 0;
let lastActivityDurationEstimate = null;
let hasToolSettingsValidationError = false;
let activityTotalTimePanelOpen = false;
let dragState = {
  draggedInstanceId: "",
  dropIndex: null
};

const activityGlobals = {
  projectionResponseUi: DEFAULT_ACTIVITY_GLOBALS.projectionResponseUi,
  activityTotalTimeEnabled: DEFAULT_ACTIVITY_GLOBALS.activityTotalTimeEnabled,
  activityTotalTimeSec: DEFAULT_ACTIVITY_GLOBALS.activityTotalTimeSec
};

function resetEditorState(){
  currentUser = null;
  currentAccessCode = "";
  currentConfigName = "";
  currentConfigNameDraft = "";
  currentTeacherSpace = null;
  availableStudents = [];
  saveState = "saved";
  currentActivityMode = DEFAULT_ACTIVITY_MODE;

  currentModuleKey = "tools";
  currentTargetFolderId = "";
  availableModules = [];
  isEditingExistingConfig = false;
  savedConfigName = "";
  isProjectedEditorMode = false;
  projectedSessionLink = null;
  projectedSessionStatus = null;
  projectedStatusRequestTimer = null;
  hasProjectedLiveChanges = false;

  moduleRuntime = null;
  toolsCatalog = [];
  toolModuleCache.clear();
  sequenceDrafts.clear();
  activitySequence = [];

  currentToolSettingsEditor = null;
  currentSelectedInstanceId = null;
  activityEstimateRefreshTimer = null;
  activityEstimateRefreshToken = 0;
  lastActivityDurationEstimate = null;
  hasToolSettingsValidationError = false;
  activityTotalTimePanelOpen = false;
  dragState = {
    draggedInstanceId: "",
    dropIndex: null
  };

  activityGlobals.projectionResponseUi = DEFAULT_ACTIVITY_GLOBALS.projectionResponseUi;
  activityGlobals.activityTotalTimeEnabled = DEFAULT_ACTIVITY_GLOBALS.activityTotalTimeEnabled;
  activityGlobals.activityTotalTimeSec = DEFAULT_ACTIVITY_GLOBALS.activityTotalTimeSec;
}

function getInitialRouteParams(){
  const params = new URLSearchParams(window.location.search);
  const explicitProjected = mountOptions.projected === true || mountOptions.projected === false
    ? mountOptions.projected
    : null;

  return {
    accessCode: normalizeAccessCode(
      mountOptions.accessCode || params.get("accessCode") || params.get("classCode")
    ),
    configName: String(mountOptions.configName || params.get("configName") || "").trim(),
    activityMode: normalizeActivityMode(mountOptions.activityMode, DEFAULT_ACTIVITY_MODE),
    folderId: normalizeOptionalFolderId(mountOptions.folderId || params.get("folderId") || ""),
    projected: explicitProjected ?? (params.get("projected") === "1")
  };
}

function normalizeOptionalFolderId(value){
  const safeValue = String(value || "").trim();
  return safeValue || "";
}

function getEditorPublicState(){
  return {
    accessCode: currentAccessCode,
    configName: currentConfigName,
    activityMode: currentActivityMode,
    moduleKey: currentModuleKey,
    projected: isProjectedEditorMode,
    saveState,
    hasProjectedLiveChanges,
    isEditingExistingConfig
  };
}

function notifyEditorStateChange(){
  mountOptions.onStateChange?.(getEditorPublicState());
}

export function hasConfigEditorPendingChanges(){
  return saveState !== "saved" || hasProjectedLiveChanges;
}

export function getConfigEditorLeaveWarningMessage(){
  if (!hasConfigEditorPendingChanges()) return "";

  if (isProjectedEditorMode || hasProjectedLiveChanges) {
    return "Des modifications non enregistrées ou seulement envoyées à la projection existent. Quitter l’éditeur ?";
  }

  return "Des modifications non enregistrées existent. Quitter l’éditeur ?";
}

export function destroyConfigEditor(){
  if (activityEstimateRefreshTimer) {
    clearTimeout(activityEstimateRefreshTimer);
    activityEstimateRefreshTimer = null;
  }

  closeSharePopup();
  closeRenameActivityModal();
  closeToolPicker();
  teardownProjectedSessionLink();
  clearToolHeaderControls();

  try {
    editorAbortController?.abort();
  } catch {}

  editorAbortController = null;
  mountOptions = createDefaultMountOptions();
  els = createEditorElements();
  resetEditorState();
}

export async function mountConfigEditor(options = {}){
  destroyConfigEditor();

  mountOptions = {
    ...createDefaultMountOptions(),
    ...(options || {})
  };
  els = createEditorElements();
  editorAbortController = new AbortController();
  resetEditorState();

  await boot();

  return {
    destroy: destroyConfigEditor,
    getState: getEditorPublicState,
    hasPendingChanges: hasConfigEditorPendingChanges,
    getLeaveWarningMessage: getConfigEditorLeaveWarningMessage
  };
}

async function boot(){
  setMessage("Chargement…");

  try {
    currentUser = await getCurrentUser();
    if (!currentUser){
      mountOptions.onAuthRequired?.();
      if (mountOptions.onAuthRequired) {
        return;
      }
      window.location.href = "login.html";
      return;
    }

    const initialParams = getInitialRouteParams();
    currentAccessCode = initialParams.accessCode;
    currentConfigName = initialParams.configName;
    currentConfigNameDraft = currentConfigName;
    savedConfigName = currentConfigName;
    currentActivityMode = normalizeActivityMode(initialParams.activityMode, DEFAULT_ACTIVITY_MODE);
    currentTargetFolderId = normalizeOptionalFolderId(initialParams.folderId);
    isProjectedEditorMode = initialParams.projected === true;

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

    availableModules = getAvailableToolRoots();
    if (!Array.isArray(availableModules) || availableModules.length === 0){
      setFatalState("Aucun outil disponible.");
      return;
    }

    let existingConfig = null;

    if (currentConfigName){
      existingConfig = await getMyActivityByName(currentTeacherSpace.id, currentConfigName);
    }

    if (existingConfig?.module_key){
      currentModuleKey = existingConfig.module_key;
    }

    if (existingConfig?.config_json) {
      currentActivityMode = normalizeActivityMode(
        existingConfig.config_json.activity_mode,
        currentActivityMode
      );
    }

    isEditingExistingConfig = !!existingConfig;

    await reloadCurrentModule();

    if (existingConfig){
      loadExistingConfig(existingConfig);
    }

    renderMeta();
    renderGlobals();
    syncShareUi();
    renderToolPickerTiles();
    renderConfigTable();
    bindEvents();
    syncProjectedEditorUi();
    setupProjectedSessionLink();

    if (activitySequence.length > 0) {
      try {
        await openToolSettings(activitySequence[0].instanceId);
      } catch (err) {
        setMessage(err?.message || "Impossible d’ouvrir les réglages du premier outil.", true);
      }
    }

    await refreshActivityDurationEstimate();

    if (!els.editorMessage?.textContent) {
      setMessage(isProjectedEditorMode ? "Projection active : la séquence est figée." : "");
    }
  } catch (err) {
    setFatalState(err?.message || "Impossible d’ouvrir l’éditeur.");
  }

  setSaveState("saved");
  notifyEditorStateChange();
}

function loadExistingConfig(existing){
  const safeConfig = existing?.config_json;
  const safeConfigName = String(existing?.config_name || currentConfigName || "").trim();
  if (safeConfigName) {
    currentConfigName = safeConfigName;
    currentConfigNameDraft = safeConfigName;
    savedConfigName = safeConfigName;
  }

  currentActivityMode = normalizeActivityMode(
    existing?.activity_mode ?? safeConfig?.activity_mode,
    currentActivityMode
  );

  if (!Array.isArray(safeConfig?.sequence)){
    setMessage("Configuration invalide : séquence manquante ou mal formée.", true);
    applyRemoteGlobals(safeConfig?.globals);
    applyRemoteSequence([], { fallbackGlobals: safeConfig?.globals });
    return;
  }

  applyRemoteGlobals(safeConfig.globals);
  applyRemoteSequence(safeConfig.sequence, { fallbackGlobals: safeConfig.globals });
}

function renderMeta(){
  if (els.configNameDisplay){
    const safeName = String(currentConfigNameDraft || currentConfigName || "").trim();
    const displayName = safeName || "Activité sans nom";
    els.configNameDisplay.textContent = displayName;
    els.configNameDisplay.classList.toggle("is-empty", !safeName);
    els.configNameDisplay.title = safeName || "Nom de l’activité à définir";
  }

  renderActivityModeBadge();
  syncProjectionLaunchUi();
  syncRenameUi();
  syncShareUi();
}

function renderActivityModeBadge(){
  if (!els.activityModeBadge) return;

  const safeMode = normalizeActivityMode(currentActivityMode, DEFAULT_ACTIVITY_MODE);
  els.activityModeBadge.textContent = getActivityModeLabel(safeMode);
  els.activityModeBadge.dataset.activityMode = safeMode;
}

function openProjectedSessionPopup({ accessCode, configName }){
  const cleanAccessCode = normalizeAccessCode(accessCode);
  const cleanConfigName = String(configName || "").trim();

  if (!cleanAccessCode || !cleanConfigName) return null;

  const hashParams = new URLSearchParams();
  hashParams.set("projected", "1");
  hashParams.set("classCode", cleanAccessCode);
  hashParams.set("configName", cleanConfigName);

  const popupUrl = `../index.html#/sessionstart?${hashParams.toString()}`;
  const popupFeatures = [
    "popup=yes",
    "width=1400",
    "height=900",
    "menubar=no",
    "toolbar=no",
    "location=no",
    "status=no",
    "resizable=yes",
    "scrollbars=yes"
  ].join(",");

  const popup = window.open(popupUrl, "projectedTeacherSession", popupFeatures);

  if (!popup) {
    alert("La fenêtre de projection a été bloquée par le navigateur.");
    return null;
  }

  try {
    popup.focus();
  } catch {}

  return popup;
}

function syncProjectionLaunchUi(){
  const button = els.btnProjectConfig;
  if (!button) return;

  const canProject = isStudentFacingActivityMode(currentActivityMode)
    && !isProjectedEditorMode
    && Boolean(String(currentConfigName || "").trim());

  button.hidden = !canProject;
  button.disabled = !canProject;
}

function hasShareableActivity(){
  return isActivityShareable({
    accessCode: currentAccessCode,
    configName: currentConfigName
  });
}

function syncEditorUrl(){
  if (!mountOptions.syncUrl) {
    notifyEditorStateChange();
    return;
  }

  try {
    const url = new URL(window.location.href);
    url.searchParams.set("classCode", currentAccessCode);

    if (currentConfigName) {
      url.searchParams.set("configName", currentConfigName);
    } else {
      url.searchParams.delete("configName");
    }

    if (isProjectedEditorMode) {
      url.searchParams.set("projected", "1");
    } else {
      url.searchParams.delete("projected");
    }

    history.replaceState({}, "", url.toString());
  } catch {}

  notifyEditorStateChange();
}

function syncShareUi(){
  const canShare = hasShareableActivity();
  const isStudentFacingMode = isStudentFacingActivityMode(currentActivityMode);
  const shareTitle = canShare
    ? "Partager l’activité"
    : ACTIVITY_SHARE_DISABLED_TITLE;

  if (els.btnShareActivity) {
    els.btnShareActivity.disabled = !canShare;
    els.btnShareActivity.title = shareTitle;
    els.btnShareActivity.setAttribute("aria-expanded", isSharePopupOpen() ? "true" : "false");
  }

  els.sharePopupStudentActions?.classList.toggle("hidden", !isStudentFacingMode);

  if (!canShare) {
    closeSharePopup();
  }
}

function syncRenameUi(){
  if (!els.btnRenameConfig) return;

  const isBusySaving = saveState === "saving";
  const isBlocked = isProjectedEditorMode || isBusySaving;
  els.btnRenameConfig.disabled = isBlocked;
  els.btnRenameConfig.title = isProjectedEditorMode
    ? "Le nom est figé pendant la projection"
    : isBusySaving
      ? "Enregistrement en cours"
      : "Renommer l’activité";
}

function isRenameActivityModalOpen(){
  return !!els.renameActivityModal && !els.renameActivityModal.classList.contains("hidden");
}

function openRenameActivityModal(){
  if (isProjectedEditorMode || saveState === "saving") return;
  if (!els.renameActivityModal || !els.renameActivityInput) return;
  if (isRenameActivityModalOpen()) return;

  closeSharePopup();

  const initialName = String(currentConfigNameDraft || currentConfigName || "").trim();
  if (els.renameActivityModalTitle) {
    els.renameActivityModalTitle.textContent = initialName
      ? "Renommer l’activité"
      : "Nommer l’activité";
  }

  els.renameActivityInput.value = initialName;
  els.renameActivityModalMessage.textContent = "";
  els.renameActivityModalMessage.classList.remove("is-error");
  els.renameActivityModal.classList.remove("hidden");
  els.renameActivityModal.setAttribute("aria-hidden", "false");

  window.setTimeout(() => {
    els.renameActivityInput?.focus();
    els.renameActivityInput?.select();
  }, 0);
}

function closeRenameActivityModal(){
  if (!els.renameActivityModal) return;

  els.renameActivityModal.classList.add("hidden");
  els.renameActivityModal.setAttribute("aria-hidden", "true");
  if (els.renameActivityModalMessage) {
    els.renameActivityModalMessage.textContent = "";
    els.renameActivityModalMessage.classList.remove("is-error");
  }
}

function submitRenameActivityModal(){
  if (!els.renameActivityInput || !els.renameActivityModalMessage) return;

  const nextName = String(els.renameActivityInput.value || "").trim();
  const currentName = String(currentConfigNameDraft || currentConfigName || "").trim();

  if (!nextName) {
    els.renameActivityModalMessage.textContent = "Entre un nom d’activité.";
    els.renameActivityModalMessage.classList.add("is-error");
    els.renameActivityInput.focus();
    return;
  }

  if (nextName === currentName) {
    closeRenameActivityModal();
    return;
  }

  currentConfigNameDraft = nextName;
  renderMeta();
  setSaveState("dirty");
  setMessage("");
  closeRenameActivityModal();
}

function isSharePopupOpen(){
  return !els.sharePopup?.classList.contains("hidden");
}

function openSharePopup(){
  if (!hasShareableActivity() || !els.sharePopup) return;
  els.sharePopup.classList.remove("hidden");
  els.btnShareActivity?.setAttribute("aria-expanded", "true");
}

function closeSharePopup(){
  els.sharePopup?.classList.add("hidden");
  els.btnShareActivity?.setAttribute("aria-expanded", "false");
}

function toggleSharePopup(){
  if (isSharePopupOpen()) {
    closeSharePopup();
    return;
  }
  openSharePopup();
}

async function copySharedActivityLink(){
  try {
    await copyActivityShareLink({
      accessCode: currentAccessCode,
      configName: currentConfigName
    });
    setMessage(ACTIVITY_SHARE_MESSAGES.copied);
    closeSharePopup();
  } catch (err) {
    setMessage(ACTIVITY_SHARE_MESSAGES.copyError, true);
  }
}

function openSharedActivityLink(){
  if (!hasShareableActivity()) return;
  openActivityShareLink({
    accessCode: currentAccessCode,
    configName: currentConfigName
  });
  closeSharePopup();
}

async function downloadSharedActivityQrCode(){
  try {
    setMessage(ACTIVITY_SHARE_MESSAGES.qrLoading);
    await downloadActivityShareQrCode({
      accessCode: currentAccessCode,
      configName: currentConfigName
    });
    setMessage(ACTIVITY_SHARE_MESSAGES.qrDownloaded);
    closeSharePopup();
  } catch (err) {
    setMessage(ACTIVITY_SHARE_MESSAGES.qrError, true);
  }
}

function bindEvents(){
  addScopedListener(els.btnBackDashboard, "click", goBackDashboard);
  addScopedListener(els.btnSaveConfig, "click", handlePrimaryAction);
  addScopedListener(els.btnRenameConfig, "click", () => {
    openRenameActivityModal();
  });
  addScopedListener(els.btnProjectConfig, "click", () => {
    if (!isStudentFacingActivityMode(currentActivityMode) || isProjectedEditorMode) return;

    const popup = openProjectedSessionPopup({
      accessCode: currentAccessCode,
      configName: currentConfigName
    });

    if (!popup) return;

    isProjectedEditorMode = true;
    setSaveState(saveState);
    setupProjectedSessionLink();
    syncProjectedEditorUi();
    syncEditorUrl();

    if (!els.editorMessage?.textContent) {
      setMessage("Projection active : la séquence est figée.");
    }
  });
  addScopedListener(els.btnShareActivity, "click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleSharePopup();
  });
  addScopedListener(els.btnShareCopyLink, "click", () => {
    void copySharedActivityLink();
  });
  addScopedListener(els.btnShareOpenLink, "click", () => {
    openSharedActivityLink();
  });
  addScopedListener(els.btnShareDownloadQr, "click", () => {
    void downloadSharedActivityQrCode();
  });
  addScopedListener(els.btnAddSequenceTool, "click", () => {
    if (isProjectedEditorMode) return;
    openToolPicker();
  });
  addScopedListener(els.btnCloseToolPicker, "click", closeToolPicker);
  addScopedListener(els.btnRenameActivityCancel, "click", closeRenameActivityModal);
  addScopedListener(els.btnRenameActivityConfirm, "click", () => {
    submitRenameActivityModal();
  });

  addScopedListener(els.toolPickerOverlay, "click", (event) => {
    if (event.target.closest("[data-close-tool-picker='true']")) {
      closeToolPicker();
    }
  });

  addScopedListener(els.renameActivityModal, "click", (event) => {
    if (event.target === els.renameActivityModal) {
      closeRenameActivityModal();
    }
  });

  addScopedListener(els.configRows, "dragover", handleSequenceDragOver);
  addScopedListener(els.configRows, "dragleave", handleSequenceDragLeave);
  addScopedListener(els.configRows, "drop", handleSequenceDrop);

  addScopedListener(els.btnProjectedTogglePopupControls, "click", () => {
    const visible = projectedSessionStatus?.controlsHidden === true;
    sendProjectedCommand("set-controls-visible", { visible });
  });
  addScopedListener(els.btnProjectedQuit, "click", () => sendProjectedCommand("close"));
  addScopedListener(els.btnProjectedPrevTool, "click", () => sendProjectedCommand("go-prev-tool"));
  addScopedListener(els.btnProjectedShowAnswer, "click", () => {
    const actionKind = String(projectedSessionStatus?.projectedPrimaryActionKind || "answer");
    sendProjectedCommand(actionKind === "validate" ? "validate" : "show-answer");
  });
  addScopedListener(els.btnProjectedNextQuestion, "click", () => sendProjectedCommand("next-question"));
  addScopedListener(els.btnProjectedNextTool, "click", () => sendProjectedCommand("go-next-tool"));
  addScopedListener(els.btnProjectedPause, "click", () => {
    const command = projectedSessionStatus?.paused ? "resume" : "pause";
    sendProjectedCommand(command);
  });

  addScopedListener(document, "keydown", (event) => {
    if (event.key === "Escape" && isRenameActivityModalOpen()) {
      closeRenameActivityModal();
      return;
    }

    if (event.key === "Escape" && isToolPickerOpen()) {
      closeToolPicker();
      return;
    }

    if (event.key === "Escape" && isSharePopupOpen()) {
      closeSharePopup();
    }
  });

  addScopedListener(document, "pointerdown", (event) => {
    if (!isSharePopupOpen()) return;
    if (els.sharePopup?.contains(event.target) || els.btnShareActivity?.contains(event.target)) return;
    closeSharePopup();
  });

  addScopedListener(els.renameActivityModal, "keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeRenameActivityModal();
      return;
    }

    if (event.key === "Enter" && event.target === els.renameActivityInput) {
      event.preventDefault();
      submitRenameActivityModal();
    }
  });

  bindStepperField(els.activityTotalTimeControl || document, "activityTotalTimeMinutesInput", {
    inputMin: getActivityTotalTimeMinuteLimits().min,
    inputMax: getActivityTotalTimeMinuteLimits().max
  });

  addScopedListener(els.activityTotalTimeToggleButton, "click", () => {
    activityTotalTimePanelOpen = !activityTotalTimePanelOpen;
    syncActivityTotalTimeUi();
  });

  addScopedListener(els.activityTotalTimeFixedCheckbox, "change", () => {
    persistCurrentToolSettings();
    activityGlobals.activityTotalTimeEnabled = els.activityTotalTimeFixedCheckbox?.checked === true;
    syncActivityTotalTimeUi();
    renderConfigTable();
    setSaveState("dirty");
    scheduleActivityDurationEstimate();
    rerenderCurrentToolSettingsPanel();
  });

  addScopedListener(els.activityTotalTimeMinutesInput, "input", () => {
    activityGlobals.activityTotalTimeSec = readActivityTotalTimeSecFromInput();
    syncActivityTotalTimeUi({ preserveInput: true });
    setSaveState("dirty");
    scheduleActivityDurationEstimate();
  });

  addScopedListener(els.activityTotalTimeMinutesInput, "change", () => {
    activityGlobals.activityTotalTimeSec = readActivityTotalTimeSecFromInput();
    syncActivityTotalTimeUi();
    setSaveState("dirty");
    scheduleActivityDurationEstimate();
  });

  addScopedListener(els.toolConfigHost, "input", () => {
    setSaveState("dirty");
    scheduleActivityDurationEstimate();
  });

  addScopedListener(els.toolConfigHost, "change", () => {
    setSaveState("dirty");
    scheduleActivityDurationEstimate();
  });

  addScopedListener(els.toolConfigHost, "click", (event) => {
    if (!event.target.closest("[data-paste]")) return;

    window.requestAnimationFrame(() => {
      setSaveState("dirty");
      scheduleActivityDurationEstimate();
    });
  });

  addScopedListener(els.toolConfigHost, "toolsettingsrefresh", () => {
    persistCurrentToolSettings();
  });
}

async function reloadCurrentModule(){
  currentToolSettingsEditor = null;
  currentSelectedInstanceId = null;
  dragState = { draggedInstanceId: "", dropIndex: null };

  toolModuleCache.clear();
  sequenceDrafts.clear();
  activitySequence = [];

  moduleRuntime = await loadToolsRuntime(currentModuleKey);
  toolsCatalog = await moduleRuntime.loadToolsCatalog();

  if (!Array.isArray(toolsCatalog)) {
    toolsCatalog = [];
    return;
  }

  toolsCatalog = await Promise.all(toolsCatalog.map(async (toolMeta) => {
    const mod = await loadToolModule(toolMeta.id);
    const tool = mod.default ?? {};
    const modeSupport = getToolActivityModeSupport(tool, {
      activityMode: currentActivityMode,
      accessCode: currentAccessCode,
      moduleKey: currentModuleKey,
      toolId: toolMeta.id,
      settings: getToolDefaultSettings(tool)
    });

    return {
      ...toolMeta,
      supportedActivityModes: modeSupport.supportedModes,
      compatibleWithCurrentMode: modeSupport.compatible
    };
  }));
}

function renderConfigTable(){
  if (!els.configRows) return;

  if (!activitySequence.length) {
    els.configRows.innerHTML = `
      <div class="cfg-empty-state cfg-sequence-empty">
        Aucun outil dans la séquence.<br>Clique sur + pour ajouter une étape.
      </div>
    `;

    renderSequenceWarnings();
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
      openToolSettings(item.instanceId).then(() => {
        if (isProjectedEditorMode) {
          sendProjectedCommand("go-to-instance", { instanceId: item.instanceId });
        }
      }).catch((err) => {
        setMessage(err?.message || "Impossible d’ouvrir les réglages outil.", true);
      });
    });

    btnDelete.addEventListener("click", (event) => {
      event.stopPropagation();
      if (isProjectedEditorMode) return;
      removeSequenceItem(item.instanceId);
    });

    row.addEventListener("dragstart", (event) => handleRowDragStart(event, item.instanceId));
    row.addEventListener("dragend", handleRowDragEnd);
  });

  renderConfigTableSelectionState();
  renderSequenceWarnings();
  syncProjectedEditorUi();
}

function configRowHTML(item, label){
  const safeId = cssSafeId(item.instanceId);
  const deleteDisabled = isProjectedEditorMode ? ' disabled aria-disabled="true"' : "";
  const rowDraggable = isProjectedEditorMode ? "false" : "true";
  const isFinalInfinite = isFinalInfiniteSequenceItem(item);

  return `
    <div class="cfg-tool-row${isFinalInfinite ? " is-final-infinite" : ""}" id="row_${safeId}" draggable="${rowDraggable}">
      <div class="cfg-tool-grip" aria-hidden="true">⋮⋮</div>
      <div class="cfg-tool-main">
        <div class="cfg-tool-name">${escapeHtml(label.title)}</div>
        ${label.subtitle ? `<div class="cfg-tool-subtitle">${escapeHtml(label.subtitle)}</div>` : ""}
        ${isFinalInfinite ? `<div class="cfg-tool-subtitle cfg-tool-final-infinite-badge">Défi final — questions à l’infini</div>` : ""}
      </div>
      <button class="btn btn-icon cfg-tool-action cfg-tool-delete" type="button" id="delete_${safeId}" aria-label="Supprimer ${escapeHtml(label.title)}"${deleteDisabled}><span class="cfg-material-icon" aria-hidden="true">delete</span></button>
    </div>
  `;
}

function renderToolPickerTiles(){
  if (!els.toolPickerTiles) return;

  const compatibleTools = toolsCatalog.filter((tool) => tool?.compatibleWithCurrentMode !== false);

  if (!compatibleTools.length) {
    els.toolPickerTiles.innerHTML = `
      <div class="cfg-empty-state">
        Aucun outil disponible en mode ${escapeHtml(getActivityModeLabel(currentActivityMode).toLowerCase())} dans le catalogue d’outils.
      </div>
    `;
    return;
  }

  els.toolPickerTiles.innerHTML = compatibleTools.map((tool) => `
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
  if (isProjectedEditorMode) return;
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
  if (isProjectedEditorMode) return;

  const safeToolId = String(toolId || "").trim();
  if (!safeToolId) return;

  const toolMeta = getToolMeta(safeToolId);
  if (!toolMeta) {
    throw new Error("Outil introuvable dans le catalogue d’outils.");
  }

  if (toolMeta.compatibleWithCurrentMode === false) {
    throw new Error(`Cet outil n’est pas disponible en mode ${getActivityModeLabel(currentActivityMode).toLowerCase()}.`);
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
  if (isProjectedEditorMode) return;

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
  if (isProjectedEditorMode) {
    event.preventDefault();
    return;
  }

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
  if (isProjectedEditorMode) return;
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
  if (isProjectedEditorMode) return;
  if (!els.configRows) return;
  const relatedTarget = event.relatedTarget;
  if (relatedTarget instanceof Node && els.configRows.contains(relatedTarget)) return;
  clearDropMarker();
}

function handleSequenceDrop(event) {
  if (isProjectedEditorMode) return;
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
  if (isProjectedEditorMode) return;

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

  const modeSupport = getToolActivityModeSupport(tool, {
    activityMode: currentActivityMode,
    accessCode: currentAccessCode,
    teacherSpace: cloneData(currentTeacherSpace),
    moduleKey: currentModuleKey,
    configName: currentConfigName,
    globals: serializeGlobals(),
    projectionResponseUi: activityGlobals.projectionResponseUi,
    toolId: entry.toolId,
    toolInstanceId: entry.instanceId,
    settings: cloneData(draft.settings)
  });

  currentToolSettingsEditor = {
    instanceId: entry.instanceId,
    toolId: entry.toolId,
    tool,
    modeSupport
  };
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

  if (!modeSupport.compatible) {
    host.innerHTML = `
      <div class="cfg-empty-state">
        ${escapeHtml(modeSupport.blockingMessage || `Cet outil n’est pas disponible en mode ${getActivityModeLabel(currentActivityMode).toLowerCase()}.`)}
      </div>
    `;
    scheduleActivityDurationEstimate();
    return;
  }

  const showCommonToolSettings = modeSupport.supportsCommonFlowSettings !== false;
  const showSpecificToolSettings = modeSupport.showSpecificToolSettings !== false;

  const commonSettingsHtml =
    showCommonToolSettings && typeof moduleRuntime?.renderCommonToolSettings === "function"
      ? (moduleRuntime.renderCommonToolSettings(cloneData(draft), getToolEditorContext(entry.instanceId)) || "")
      : "";

  const combinedCommonSettingsHtml = showCommonToolSettings
    ? buildCombinedCommonFlowSettingsHtml({
        baseHtml: commonSettingsHtml
      })
    : "";

  const compactCommonFlowHtml = combinedCommonSettingsHtml
    ? buildCompactCommonFlowSettingsHtml({
        baseHtml: combinedCommonSettingsHtml,
        draft,
        tool,
        context: getToolEditorContext(entry.instanceId)
      })
    : "";

  host.innerHTML = `
    <div class="cfg-tool-settings-stack">
      ${compactCommonFlowHtml ? `<div id="toolCommonSettingsHost">${compactCommonFlowHtml}</div>` : ""}
      <div id="toolSpecificSettingsHost"></div>
    </div>
  `;

  const commonSettingsHost = host.querySelector("#toolCommonSettingsHost");
  const settingsHost = getSpecificToolSettingsHost(host);

  if (showSpecificToolSettings && typeof tool.renderToolSettings === "function"){
    tool.renderToolSettings(
      settingsHost,
      cloneData(getSequenceDraft(entry.instanceId).settings),
      getToolEditorContext(entry.instanceId)
    );
  } else {
    settingsHost.innerHTML = `<div class="cfg-empty-state">Aucun réglage spécifique pour cet outil.</div>`;
  }

  const refreshCommonFlowSummary = () => {
    updateCompactCommonFlowSummary(host, {
      instanceId: entry.instanceId,
      tool
    });
  };

  if (showCommonToolSettings && typeof moduleRuntime?.bindCommonToolSettings === "function") {
    moduleRuntime.bindCommonToolSettings(commonSettingsHost || host, {
      forceInfiniteQuestionCount: isFinalInfiniteSequenceItem(entry),
      onDirty: () => {
        setSaveState("dirty");
        scheduleActivityDurationEstimate();
        refreshCommonFlowSummary();
      },
      onAnswerInfiniteActivated: () => {
        setCurrentToolQuestionTransitionToZero();
      }
    });
    bindCompactCommonFlowPanel(host);
    refreshCommonFlowSummary();
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
  const name = String(currentConfigNameDraft || currentConfigName || "").trim();

  if (!name){
    setMessage("Entre un nom d’activité.", true);
    setSaveState("dirty");
    return;
  }

  persistCurrentToolSettings();

  setSaveState("saving");
  setMessage("Sauvegarde en cours…");
  els.btnSaveConfig.disabled = true;

  try {
    await saveActivityConfig({
      accessCode: currentAccessCode,
      moduleKey: currentModuleKey,
      existingConfigName: isEditingExistingConfig ? savedConfigName : "",
      configName: name,
      desiredFolderId: currentTargetFolderId || null,
      configJson: {
        version: 4,
        activity_mode: currentActivityMode,
        globals: serializeGlobals(),
        sequence: serializeSequence()
      }
    });

    currentConfigName = name;
    currentConfigNameDraft = name;
    savedConfigName = name;
    isEditingExistingConfig = true;
    syncEditorUrl();
    renderMeta();

    hasProjectedLiveChanges = false;
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

  syncActivityTotalTimeUi();
}

function syncActivityTotalTimeUi({ preserveInput = false } = {}){
  const enabled = activityGlobals.activityTotalTimeEnabled === true;
  const panelOpen = activityTotalTimePanelOpen === true;
  const minuteLimits = getActivityTotalTimeMinuteLimits();
  const totalMinutes = Math.min(
    minuteLimits.max,
    Math.max(
      minuteLimits.min,
      Math.round((Number(activityGlobals.activityTotalTimeSec) || DEFAULT_ACTIVITY_GLOBALS.activityTotalTimeSec) / 60)
    )
  );

  els.activityTotalTimeControl?.classList.toggle("is-active", enabled);
  els.activityTotalTimeControl?.classList.toggle("is-expanded", panelOpen);

  if (els.activityTotalTimeToggleButton) {
    const buttonLabel = panelOpen
      ? "Replier les réglages de durée"
      : "Déplier les réglages de durée";
    els.activityTotalTimeToggleButton.setAttribute("aria-expanded", panelOpen ? "true" : "false");
    els.activityTotalTimeToggleButton.title = buttonLabel;
    els.activityTotalTimeToggleButton.setAttribute("aria-label", buttonLabel);
  }

  if (els.activityTotalTimePanel) {
    els.activityTotalTimePanel.hidden = !panelOpen;
  }

  if (els.activityTotalTimeChevron) {
    els.activityTotalTimeChevron.textContent = panelOpen ? "expand_less" : "expand_more";
  }

  if (els.activityTotalTimeFixedCheckbox) {
    els.activityTotalTimeFixedCheckbox.checked = enabled;
  }

  if (els.activityTotalTimeMinutesInput) {
    if (!preserveInput) {
      els.activityTotalTimeMinutesInput.value = String(totalMinutes);
    }
    els.activityTotalTimeMinutesInput.disabled = !enabled;
    els.activityTotalTimeMinutesInput.setAttribute("aria-disabled", enabled ? "false" : "true");
    els.activityTotalTimeMinutesInput.closest(".tv-stepper")?.classList.toggle("is-disabled", !enabled);
    refreshStepper(els.activityTotalTimeControl || document, "activityTotalTimeMinutesInput", {
      inputMin: minuteLimits.min,
      inputMax: minuteLimits.max
    });
  }

  syncActivityDurationSummary();
}

function readActivityTotalTimeSecFromInput(){
  const minuteLimits = getActivityTotalTimeMinuteLimits();
  const rawMinutes = Math.floor(Number(els.activityTotalTimeMinutesInput?.value));
  const safeMinutes = Number.isFinite(rawMinutes) ? rawMinutes : Math.round(DEFAULT_ACTIVITY_GLOBALS.activityTotalTimeSec / 60);
  const rawSec = safeMinutes * 60;
  return clampInt(
    rawSec,
    TOOL_LIMITS.activityTotalTimeSec.min,
    TOOL_LIMITS.activityTotalTimeSec.max
  );
}

function getActivityTotalTimeMinuteLimits(){
  return {
    min: Math.max(1, Math.ceil(TOOL_LIMITS.activityTotalTimeSec.min / 60)),
    max: Math.max(1, Math.floor(TOOL_LIMITS.activityTotalTimeSec.max / 60))
  };
}

function rerenderCurrentToolSettingsPanel(){
  const selectedId = String(currentSelectedInstanceId || "").trim();
  if (!selectedId) return;
  openToolSettings(selectedId).catch((err) => {
    setMessage(err?.message || "Impossible d’actualiser les réglages outil.", true);
  });
}

function serializeGlobals(){
  return normalizeActivityGlobals(activityGlobals);
}

function applyRemoteGlobals(remoteGlobals){
  Object.assign(activityGlobals, normalizeActivityGlobals(remoteGlobals));
}

function setSaveState(state){
  saveState = state;
  syncShareUi();
  syncRenameUi();

  const btn = els.btnSaveConfig;
  if (!btn) {
    notifyEditorStateChange();
    return;
  }

  btn.classList.remove("dirty", "saving", "saved", "project-send-btn");

  if (isProjectedEditorMode) {
    btn.classList.add("project-send-btn");

    if (state === "dirty"){
      btn.classList.add("dirty");
      btn.textContent = "Envoyer";
    }

    if (state === "saving"){
      btn.classList.add("saving");
      btn.textContent = "Envoi…";
    }

    if (state === "saved"){
      btn.textContent = "Envoyer";
    }

    btn.disabled = state === "saving";
    notifyEditorStateChange();
    return;
  }

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

  notifyEditorStateChange();
}

function applyRemoteSequence(remoteSequence, { fallbackGlobals = null } = {}){
  const safeSequence = normalizeActivitySequence(remoteSequence, {
    toolsCatalog,
    fallbackGlobals
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
  if (currentToolSettingsEditor.modeSupport?.compatible === false) return;

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

    if (
    currentToolSettingsEditor?.modeSupport?.supportsCommonFlowSettings !== false
      && typeof moduleRuntime?.readCommonToolSettings === "function"
    ) {
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

    const previousSerializedDraft = JSON.stringify(normalizeToolDraft(stored.draft));

    stored.toolId = currentToolSettingsEditor.toolId;
    stored.draft = normalizeToolDraft(nextDraft);
    stored.draft.enabled = true;
    sequenceDrafts.set(instanceId, stored);

    const nextSerializedDraft = JSON.stringify(stored.draft);
    const hadValidationError = hasToolSettingsValidationError;
    hasToolSettingsValidationError = false;

    if (previousSerializedDraft !== nextSerializedDraft) {
      setSaveState("dirty");
      setMessage("");
    } else if (hadValidationError) {
      setMessage("");
    }
  } catch (err) {
    hasToolSettingsValidationError = true;
    setMessage(err?.message || "Réglages invalides.", true);
  }
}

function renderConfigTableSelectionState(){
  activitySequence.forEach((item) => {
    const row = document.getElementById(`row_${cssSafeId(item.instanceId)}`);
    row?.classList.toggle("active", currentSelectedInstanceId === item.instanceId);
    row?.classList.toggle("is-final-infinite", isFinalInfiniteSequenceItem(item));
  });
}

function renderSequenceWarnings(){
  if (!els.sequenceWarnings) return;
  const shouldWarnAboutBlockingInfiniteTool = normalizeActivityMode(currentActivityMode, DEFAULT_ACTIVITY_MODE) === "group";

  if (!shouldWarnAboutBlockingInfiniteTool) {
    els.sequenceWarnings.innerHTML = "";
    els.sequenceWarnings.hidden = true;
    return;
  }

  const hasBlockingInfiniteTool = activitySequence.some((item, index) => {
    if (index >= activitySequence.length - 1) return false;
    return getSequenceDraft(item.instanceId)?.infiniteQuestionCount === true;
  });

  if (!hasBlockingInfiniteTool) {
    els.sequenceWarnings.innerHTML = "";
    els.sequenceWarnings.hidden = true;
    return;
  }

  els.sequenceWarnings.innerHTML = `
    <div class="cfg-sequence-warning">
      Attention : un outil placé avant la fin de la séquence utilise <strong>Nombre de questions = ∞</strong>.
      Les outils suivants ne seront donc jamais atteints automatiquement.
    </div>
  `;
  els.sequenceWarnings.hidden = false;
}

function setCurrentToolQuestionTransitionToZero(){
  const currentTransitionInput = els.toolConfigHost?.querySelector("#commonToolQuestionTransitionSec");
  if (!currentTransitionInput || Number(currentTransitionInput.value) === 0) return;

  currentTransitionInput.value = 0;
  currentTransitionInput.dispatchEvent(new Event("change", { bubbles: true }));
  setSaveState("dirty");
  scheduleActivityDurationEstimate();
}

function buildCombinedCommonFlowSettingsHtml({
  baseHtml = ""
} = {}) {
  const template = document.createElement("template");
  template.innerHTML = String(baseHtml || "").trim();

  let group = template.content.querySelector(".tv-group");
  if (!group) {
    group = document.createElement("div");
    group.className = "tv-group";
    template.content.appendChild(group);
  }

  let grid = group.querySelector(".tv-stepper-grid");
  if (!grid) {
    grid = document.createElement("div");
    grid.className = "tv-stepper-grid";
    while (group.firstChild) {
      grid.appendChild(group.firstChild);
    }
    group.appendChild(grid);
  }

  group.classList.add("cfg-common-flow-group");
  grid.classList.add("cfg-common-flow-grid");

  const instructionRow = group.querySelector(".cfg-common-flow-instruction-row");
  if (instructionRow) {
    instructionRow.remove();
  }

  const createSettingsSection = ({ id, className, nodes = [] } = {}) => {
    const section = document.createElement("div");
    section.id = id;
    section.hidden = true;
    section.setAttribute("data-common-flow-settings-section", "true");
    section.className = `tv-group cfg-common-flow-group cfg-common-flow-subwidget ${className}`;

    const sectionGrid = document.createElement("div");
    sectionGrid.className = "tv-stepper-grid cfg-common-flow-grid";
    nodes.forEach((node) => {
      if (node) {
        sectionGrid.appendChild(node);
      }
    });
    section.appendChild(sectionGrid);
    return section;
  };

  const questionModeRow = grid.querySelector(".cfg-common-flow-question-mode-row");
  const questionSection = createSettingsSection({
    id: "commonFlowQuestionSettings",
    className: "cfg-common-flow-question-widget",
    nodes: questionModeRow
      ? [questionModeRow]
      : [
          grid.querySelector(".cfg-common-flow-question-count-field"),
          grid.querySelector("#commonToolInfiniteGaugeRow")
        ]
  });

  const timingSection = createSettingsSection({
    id: "commonFlowTimingSettings",
    className: "cfg-common-flow-timing-widget",
    nodes: [
      grid.querySelector(".cfg-common-flow-time-per-question-field"),
      grid.querySelector(".cfg-common-flow-answer-time-field"),
      grid.querySelector(".cfg-common-flow-transition-field"),
      grid.querySelector(".cfg-common-flow-max-time-field")
    ]
  });

  if (instructionRow) {
    instructionRow.id = "commonFlowInstructionSettings";
    instructionRow.hidden = true;
    instructionRow.setAttribute("data-common-flow-settings-section", "true");
    instructionRow.classList.add("cfg-common-flow-subwidget", "cfg-common-flow-instruction-widget");
  }

  return [
    questionSection.outerHTML,
    timingSection.outerHTML,
    instructionRow?.outerHTML || ""
  ].join("");
}

function buildCompactCommonFlowSettingsHtml({ baseHtml = "", draft = {}, tool = null, context = {} } = {}) {
  const summary = buildCommonFlowSummaryParts(draft, tool, context);

  return `
    <div class="cfg-common-flow-compact">
      <button
        class="cfg-common-flow-summary-card"
        id="commonFlowSummaryButton"
        type="button"
        aria-controls="commonFlowQuestionSettings commonFlowTimingSettings commonFlowInstructionSettings"
        aria-expanded="false"
      >
        <span class="cfg-material-icon cfg-common-flow-summary-icon" aria-hidden="true">tune</span>
        <span class="cfg-common-flow-summary-copy">
          <span class="cfg-common-flow-summary-main" id="commonFlowSummaryMain" title="${escapeHtml(summary.main)}">${escapeHtml(summary.main)}</span>
          <span class="cfg-common-flow-summary-instruction" id="commonFlowSummaryInstruction" title="${escapeHtml(summary.instruction)}">${escapeHtml(summary.instruction)}</span>
        </span>
      </button>

      ${baseHtml}
    </div>
  `;
}

function bindCompactCommonFlowPanel(container) {
  const summaryButton = container.querySelector("#commonFlowSummaryButton");
  const sections = Array.from(container.querySelectorAll("[data-common-flow-settings-section]"));

  if (!summaryButton || sections.length === 0) return;

  const setExpanded = (expanded) => {
    sections.forEach((section) => {
      section.hidden = !expanded;
    });
    summaryButton.setAttribute("aria-expanded", expanded ? "true" : "false");
  };

  summaryButton.setAttribute("aria-expanded", "false");
  summaryButton.addEventListener("click", () => {
    setExpanded(sections.every((section) => section.hidden));
  });

  container.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setExpanded(false);
      summaryButton.focus?.({ preventScroll: true });
    }
  });
}

function updateCompactCommonFlowSummary(container, { instanceId = currentSelectedInstanceId, tool = null } = {}) {
  const summaryMain = container.querySelector("#commonFlowSummaryMain");
  const summaryInstruction = container.querySelector("#commonFlowSummaryInstruction");
  if (!summaryMain || !summaryInstruction) return;

  let draft = getSequenceDraft(instanceId);

  if (typeof moduleRuntime?.readCommonToolSettings === "function") {
    try {
      draft = moduleRuntime.readCommonToolSettings(
        container,
        draft,
        getToolEditorContext(instanceId)
      ) || draft;
    } catch {
      draft = getSequenceDraft(instanceId);
    }
  }

  const summary = buildCommonFlowSummaryParts(draft, tool || currentToolSettingsEditor?.tool || null, getToolEditorContext(instanceId));

  summaryMain.textContent = summary.main;
  summaryMain.title = summary.main;
  summaryInstruction.textContent = summary.instruction;
  summaryInstruction.title = summary.instruction;
}

function buildCommonFlowSummaryParts(draft = {}, tool = null, context = {}) {
  const safeDraft = normalizeToolDraft(draft);
  const forceInfiniteQuestionCount = context?.forceInfiniteQuestionCount === true
    || context?.isFinalInfiniteSequenceItem === true
    || context?.finalInfiniteSequenceItem === true;
  const questionCount = forceInfiniteQuestionCount || safeDraft.infiniteQuestionCount
    ? `Objectif ${getCommonFlowObjectiveTarget(safeDraft)}`
    : String(clampInt(
        safeDraft.questionCount,
        TOOL_LIMITS.questionCount.min,
        TOOL_LIMITS.questionCount.max
      ));
  const timeLimit = safeDraft.toolMaxTimeInfinite
    ? "Limite de temps : aucune"
    : `Limite de temps : ${clampInt(safeDraft.toolMaxTimeMin, TOOL_LIMITS.toolMaxTimeMin.min, TOOL_LIMITS.toolMaxTimeMin.max)} min`;
  const timePerQuestion = safeDraft.infiniteTimePerQ
    ? "Pas de chrono"
    : `${clampInt(safeDraft.timePerQ, TOOL_LIMITS.timePerQ.min, TOOL_LIMITS.timePerQ.max)} s par question`;
  const answerTime = safeDraft.infiniteAnswerTime
    ? "Temps d'affichage de la réponse : ∞"
    : `Temps d'affichage de la réponse : ${clampInt(safeDraft.answerTime, TOOL_LIMITS.answerTime.min, TOOL_LIMITS.answerTime.max)} s`;
  const pause = safeDraft.questionTransitionInfinite
    ? "Pause entre les questions : manuelle"
    : clampInt(safeDraft.questionTransitionSec, TOOL_LIMITS.questionTransitionSec.min, TOOL_LIMITS.questionTransitionSec.max) <= 0
      ? "Pause entre les questions : aucune"
      : `Pause entre les questions : ${clampInt(safeDraft.questionTransitionSec, TOOL_LIMITS.questionTransitionSec.min, TOOL_LIMITS.questionTransitionSec.max)} s`;
  const summaryGap = "\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0";

  return {
    main: [
      `Nombre de questions : ${questionCount}`,
      timeLimit,
      timePerQuestion,
      answerTime,
      pause
    ].join(summaryGap),
    instruction: `Consigne : ${getResolvedCommonInstructionSummary(safeDraft, tool)}`
  };
}


function getCommonFlowObjectiveTarget(draft = {}) {
  return getCommonInfiniteGaugeSettings(draft?.settings).infiniteGaugeRequiredCorrect;
}

function getResolvedCommonInstructionSummary(draft = {}, tool = null) {
  const defaultInstruction = String(tool?.defaultInstruction || "").trim();
  const common = draft?.settings && typeof draft.settings === "object" && !Array.isArray(draft.settings)
    && draft.settings.common && typeof draft.settings.common === "object" && !Array.isArray(draft.settings.common)
      ? draft.settings.common
      : null;
  const instruction = common?.instruction && typeof common.instruction === "object" && !Array.isArray(common.instruction)
    ? common.instruction
    : null;
  const customInstruction = String(instruction?.text || "").trim();

  if (instruction?.enabled === true && customInstruction) {
    return customInstruction;
  }

  return defaultInstruction || "—";
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

  renderSequenceWarnings();

  const estimate = typeof moduleRuntime?.estimateActivityDuration === "function"
    ? await moduleRuntime.estimateActivityDuration({
        globals: serializeGlobals(),
        sequence: serializeSequence()
      })
    : null;

  if (token !== activityEstimateRefreshToken) return;

  const text = countEnabledTools() > 0
    ? formatDurationSummaryValue(estimate)
    : "—";

  if (activityGlobals.activityTotalTimeEnabled !== true) {
    lastActivityDurationEstimate = countEnabledTools() > 0 ? estimate : null;
  }

  syncActivityDurationSummary(text);
}

function syncActivityDurationSummary(estimatedText = null){
  if (!els.activityDurationEstimate) return;

  const enabled = activityGlobals.activityTotalTimeEnabled === true;
  const modeText = enabled ? "fixe" : "estimation";
  const durationText = enabled
    ? formatDurationSummaryValue({
        minSec: activityGlobals.activityTotalTimeSec,
        maxSec: activityGlobals.activityTotalTimeSec
      })
    : (estimatedText ?? (countEnabledTools() > 0 ? formatDurationSummaryValue(lastActivityDurationEstimate) : "—"));

  const summaryText = `Durée : ${durationText} (${modeText})`;
  els.activityDurationEstimate.textContent = summaryText;
  els.activityDurationEstimate.title = durationText === "—"
    ? "Durée indisponible"
    : summaryText;
}

function formatDurationSummaryValue(estimate){
  const safeEstimate = normalizeDurationEstimate(estimate);
  if (!safeEstimate) return "—";
  if (safeEstimate.infinite) return "∞";

  if (safeEstimate.minSec === safeEstimate.maxSec) {
    return formatDurationSummarySeconds(safeEstimate.minSec);
  }

  return `entre ${formatDurationSummarySeconds(safeEstimate.minSec)} et ${formatDurationSummarySeconds(safeEstimate.maxSec)}`;
}

function formatDurationSummarySeconds(totalSec){
  const safeTotalSec = Math.max(0, Math.floor(Number(totalSec) || 0));

  if (safeTotalSec < 60) {
    return "moins d’1 minute";
  }

  const minutes = Math.floor(safeTotalSec / 60);
  return `${minutes} minute${minutes > 1 ? "s" : ""}`;
}

async function loadToolModule(toolId){
  if (!moduleRuntime){
    throw new Error("Runtime d’outils non initialisé.");
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
  const safeInstanceId = String(instanceId || "");

  const setScopedEditorMessage = (text = "", isError = false) => {
    if (safeInstanceId && safeInstanceId !== String(currentSelectedInstanceId || "")) return;
    setMessage(text, isError);
  };

  return {
    accessCode: currentAccessCode,
    teacherSpace: cloneData(currentTeacherSpace),
    students: cloneData(availableStudents),
    activityMode: currentActivityMode,
    moduleKey: currentModuleKey,
    configName: currentConfigName,
    globals: serializeGlobals(),
    projectionResponseUi: activityGlobals.projectionResponseUi,
    isFinalInfiniteSequenceItem: isFinalInfiniteSequenceItem(safeInstanceId),
    forceInfiniteQuestionCount: isFinalInfiniteSequenceItem(safeInstanceId),
    tool: currentToolSettingsEditor?.tool || null,
    toolInstanceId: safeInstanceId,
    setEditorMessage: setScopedEditorMessage,
    clearEditorMessage: () => setScopedEditorMessage("")
  };
}

function isFinalInfiniteSequenceItem(itemOrInstanceId){
  if (activityGlobals.activityTotalTimeEnabled !== true) return false;
  if (!activitySequence.length) return false;

  const safeInstanceId = typeof itemOrInstanceId === "string"
    ? String(itemOrInstanceId || "").trim()
    : String(itemOrInstanceId?.instanceId || "").trim();
  if (!safeInstanceId) return false;

  const lastItem = activitySequence[activitySequence.length - 1];
  return String(lastItem?.instanceId || "") === safeInstanceId;
}

function getToolMeta(toolId){
  return toolsCatalog.find((tool) => tool.id === toolId) || null;
}

function buildSequenceLabels(){
  const labels = new Map();

  activitySequence.forEach((item) => {
    const toolMeta = getToolMeta(item.toolId);

    labels.set(item.instanceId, {
      title: toolMeta?.label || toolMeta?.title || item.toolId,
      subtitle: ""
    });
  });

  return labels;
}

function buildDefaultSequenceLabel(toolId){
  const toolMeta = getToolMeta(toolId);
  return {
    title: toolMeta?.label || toolMeta?.title || String(toolId || "Outil"),
    subtitle: ""
  };
}

function countEnabledTools(){
  return activitySequence.length;
}

function handlePrimaryAction(){
  if (isProjectedEditorMode) {
    void sendProjectedConfig();
    return;
  }

  void saveCurrentConfig();
}

function setupProjectedSessionLink(){
  teardownProjectedSessionLink();

  if (!isProjectedEditorMode) {
    projectedSessionStatus = null;
    syncProjectedEditorUi();
    return;
  }

  projectedSessionLink = createProjectedSessionLink({
    accessCode: currentAccessCode,
    configName: currentConfigName,
    onMessage: handleProjectedSessionMessage
  });

  if (!projectedSessionLink) {
    setMessage("Projection active, mais la synchronisation navigateur n’est pas disponible.", true);
    syncProjectedEditorUi();
    return;
  }

  scheduleProjectedStatusRequest();
  syncProjectedEditorUi();
}

function teardownProjectedSessionLink(){
  if (projectedStatusRequestTimer) {
    clearTimeout(projectedStatusRequestTimer);
    projectedStatusRequestTimer = null;
  }

  try {
    projectedSessionLink?.close?.();
  } catch {}

  projectedSessionLink = null;
}

function scheduleProjectedStatusRequest(){
  if (!isProjectedEditorMode || !projectedSessionLink) return;

  projectedSessionLink.send("request-status");

  if (projectedStatusRequestTimer) {
    clearTimeout(projectedStatusRequestTimer);
  }

  projectedStatusRequestTimer = window.setTimeout(() => {
    projectedStatusRequestTimer = null;
    projectedSessionLink?.send("request-status");
  }, 250);
}

function handleProjectedSessionMessage(message){
  const type = String(message?.type || "").trim();

  if (type === "projection-closed") {
    exitProjectedEditorMode("Projection fermée.");
    return;
  }

  if (type !== "status") return;

  projectedSessionStatus = {
    active: message.active !== false,
    route: String(message.route || "session"),
    running: message.running === true,
    paused: message.paused === true,
    phase: String(message.phase || "IDLE"),
    currentToolIndex: Number.isInteger(message.currentToolIndex) ? message.currentToolIndex : -1,
    totalTools: Number.isInteger(message.totalTools) ? message.totalTools : activitySequence.length,
    currentInstanceId: String(message.currentInstanceId || "").trim(),
    currentQuestionNumber: Math.max(0, Number(message.currentQuestionNumber) || 0),
    totalQuestionCountLabel: String(message.totalQuestionCountLabel || "—"),
    canGoPrevTool: message.canGoPrevTool === true,
    canGoNextTool: message.canGoNextTool === true,
    canRevealAnswer: message.canRevealAnswer === true,
    canAdvanceQuestion: message.canAdvanceQuestion === true,
    projectedPrimaryActionKind: normalizeProjectedPrimaryActionKind(message.projectedPrimaryActionKind),
    projectedPrimaryActionLabel: String(message.projectedPrimaryActionLabel || "Réponse"),
    projectedPrimaryActionIcon: String(message.projectedPrimaryActionIcon || "visibility"),
    projectedPrimaryActionEnabled: message.projectedPrimaryActionEnabled === true,
    controlsHidden: message.controlsHidden === true
  };

  syncProjectedEditorUi();

  if (projectedSessionStatus.currentInstanceId) {
    syncSelectionWithProjectedStatus(projectedSessionStatus.currentInstanceId);
  }
}

function syncSelectionWithProjectedStatus(instanceId){
  const safeInstanceId = String(instanceId || "").trim();
  if (!safeInstanceId) return;
  if (!activitySequence.some((item) => item.instanceId === safeInstanceId)) return;
  if (currentSelectedInstanceId === safeInstanceId) return;

  openToolSettings(safeInstanceId).catch((err) => {
    setMessage(err?.message || "Impossible de synchroniser l’outil projeté.", true);
  });
}

function normalizeProjectedPrimaryActionKind(value){
  return String(value || "").trim() === "validate" ? "validate" : "answer";
}

function syncProjectedEditorUi(){
  els.page?.classList.toggle("is-projection-mode", isProjectedEditorMode);
  els.projectedControlPanel?.classList.toggle("hidden", !isProjectedEditorMode);
  syncProjectionLaunchUi();

  if (els.btnAddSequenceTool) {
    els.btnAddSequenceTool.disabled = isProjectedEditorMode;
    els.btnAddSequenceTool.title = isProjectedEditorMode
      ? "Séquence figée pendant la projection"
      : "Ajouter un outil";
  }

  if (els.btnSaveConfig) {
    els.btnSaveConfig.disabled = saveState === "saving";
  }

  syncRenameUi();

  const status = projectedSessionStatus;
  const hasStatus = isProjectedEditorMode && !!status;
  const controlsEnabled = hasStatus && status.active !== false;
  const popupControlsHidden = status?.controlsHidden === true;

  const nextQuestionText = controlsEnabled
    ? `Question ${status.currentQuestionNumber || 0}/${status.totalQuestionCountLabel || "—"}`
    : "Question —/—";

  if (els.projectedNextQuestionLabel) {
    els.projectedNextQuestionLabel.textContent = nextQuestionText;
  }

  if (els.projectedPauseIcon) {
    els.projectedPauseIcon.textContent = status?.paused ? "play_arrow" : "pause";
  }

  if (els.projectedPauseLabel) {
    els.projectedPauseLabel.textContent = status?.paused ? "Reprendre" : "Pause";
  }

  if (els.projectedTogglePopupControlsIcon) {
    els.projectedTogglePopupControlsIcon.textContent = popupControlsHidden ? "visibility" : "visibility_off";
  }

  if (els.projectedTogglePopupControlsLabel) {
    els.projectedTogglePopupControlsLabel.textContent = popupControlsHidden ? "Afficher boutons" : "Masquer boutons";
  }

  if (els.btnProjectedTogglePopupControls) {
    els.btnProjectedTogglePopupControls.disabled = !controlsEnabled || status?.route !== "session";
  }

  if (els.btnProjectedQuit) els.btnProjectedQuit.disabled = !controlsEnabled;
  if (els.btnProjectedPrevTool) els.btnProjectedPrevTool.disabled = !controlsEnabled || !status?.canGoPrevTool;
  if (els.btnProjectedShowAnswer) {
    const actionKind = normalizeProjectedPrimaryActionKind(status?.projectedPrimaryActionKind);
    const actionLabel = String(status?.projectedPrimaryActionLabel || (actionKind === "validate" ? "Valider" : "Réponse"));
    const actionIcon = String(status?.projectedPrimaryActionIcon || (actionKind === "validate" ? "task_alt" : "visibility"));
    els.btnProjectedShowAnswer.disabled = !controlsEnabled || status?.projectedPrimaryActionEnabled !== true;
    els.btnProjectedShowAnswer.title = actionLabel;
    els.btnProjectedShowAnswer.setAttribute("aria-label", actionLabel);
    const iconEl = els.btnProjectedShowAnswer.querySelector(".cfg-material-icon");
    const labelEl = els.btnProjectedShowAnswer.querySelector("span:not(.cfg-material-icon)");
    if (iconEl) iconEl.textContent = actionIcon;
    if (labelEl) labelEl.textContent = actionLabel;
  }
  if (els.btnProjectedNextQuestion) els.btnProjectedNextQuestion.disabled = !controlsEnabled || !status?.canAdvanceQuestion;
  if (els.btnProjectedNextTool) els.btnProjectedNextTool.disabled = !controlsEnabled || !status?.canGoNextTool;
  if (els.btnProjectedPause) els.btnProjectedPause.disabled = !controlsEnabled || !status?.running;
}

function sendProjectedCommand(command, payload = {}){
  if (!isProjectedEditorMode || !projectedSessionLink) return;
  projectedSessionLink.send("command", {
    command,
    ...payload
  });
}

async function sendProjectedConfig(){
  if (!isProjectedEditorMode || !projectedSessionLink) return;

  persistCurrentToolSettings();
  setSaveState("saving");

  try {
    projectedSessionLink.send("apply-config", {
      globals: serializeGlobals(),
      sequence: serializeSequence()
    });

    hasProjectedLiveChanges = true;
    setSaveState("saved");
    setMessage("Appliqué à la prochaine question.");
  } catch (err) {
    setSaveState("dirty");
    setMessage(err?.message || "Impossible d’envoyer la configuration à la projection.", true);
  }
}

function exitProjectedEditorMode(message = ""){
  const shouldStayDirty = hasProjectedLiveChanges || saveState === "dirty" || saveState === "saving";

  teardownProjectedSessionLink();
  projectedSessionStatus = null;
  isProjectedEditorMode = false;
  closeToolPicker();
  renderConfigTable();
  syncProjectedEditorUi();
  setSaveState(shouldStayDirty ? "dirty" : "saved");
  if (message) {
    setMessage(message);
  }

  syncEditorUrl();
}

function goBackDashboard(){
  if (typeof mountOptions.onBack === "function") {
    mountOptions.onBack({
      state: getEditorPublicState(),
      hasPendingChanges: hasConfigEditorPendingChanges(),
      warningMessage: getConfigEditorLeaveWarningMessage()
    });
    return;
  }

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

  syncRenameUi();
  renderEmptyToolPanel();
  syncProjectedEditorUi();
  notifyEditorStateChange();
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
