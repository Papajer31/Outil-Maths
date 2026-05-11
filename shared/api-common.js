import {
  DEFAULT_ACTIVITY_MODE,
  isStudentFacingActivityMode,
  normalizeActivityMode
} from "./activity-modes.js";
import {
  getDefaultResponseUiForActivityMode,
  normalizeProgressMode,
  normalizeResponseUi
} from "./activity-config.js";

export function normalizeAccessCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 12);
}

export function normalizeConfigName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_-]/g, "");
}

export function cleanDisplayName(value) {
  return String(value || "").trim();
}

export function normalizeModuleKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");
}

function normalizeDashboardFolderId(value) {
  const folderId = String(value ?? "").trim();
  return folderId || null;
}

function normalizeActivityDashboardMeta(configJson = {}, fallbackOrder = 0) {
  const raw = configJson && typeof configJson === "object" ? (configJson.dashboard ?? {}) : {};

  const displayOrderValue = Number(raw?.display_order);
  const displayOrder = Number.isFinite(displayOrderValue)
    ? Math.max(0, Math.trunc(displayOrderValue))
    : Math.max(0, Math.trunc(Number(fallbackOrder) || 0));

  return {
    display_order: displayOrder,
    folder_id: normalizeDashboardFolderId(raw?.folder_id),
    is_visible: raw?.is_visible !== false,
    is_highlighted: raw?.is_highlighted === true
  };
}

function normalizeActivityStoredMode(configJson = {}) {
  const safeConfig = configJson && typeof configJson === "object" ? configJson : {};
  return normalizeActivityMode(safeConfig.activity_mode, DEFAULT_ACTIVITY_MODE);
}

function normalizeActivityStoredResponseUi(configJson = {}) {
  const safeConfig = configJson && typeof configJson === "object" ? configJson : {};
  const activityMode = normalizeActivityStoredMode(safeConfig);
  return normalizeResponseUi(safeConfig.response_ui, getDefaultResponseUiForActivityMode(activityMode));
}

function normalizeActivityStoredProgressMode(configJson = {}) {
  const safeConfig = configJson && typeof configJson === "object" ? configJson : {};
  return normalizeProgressMode(safeConfig.progress_mode, "evaluated");
}

export function normalizeActivityConfigMeta(configJson = {}, fallbackOrder = 0) {
  return {
    dashboard: normalizeActivityDashboardMeta(configJson, fallbackOrder),
    activity_mode: normalizeActivityStoredMode(configJson),
    response_ui: normalizeActivityStoredResponseUi(configJson),
    progress_mode: normalizeActivityStoredProgressMode(configJson)
  };
}

export function withActivityDashboardMeta(activity, fallbackOrder = 0) {
  const meta = normalizeActivityConfigMeta(activity?.config_json, fallbackOrder);
  const dashboard = meta.dashboard;
  const canStayHighlighted = dashboard.is_visible !== false && isStudentFacingActivityMode(meta.activity_mode);

  return {
    ...(activity || {}),
    display_order: dashboard.display_order,
    folder_id: dashboard.folder_id,
    is_visible: dashboard.is_visible,
    is_highlighted: canStayHighlighted && dashboard.is_highlighted,
    activity_mode: meta.activity_mode,
    response_ui: meta.response_ui,
    progress_mode: meta.progress_mode
  };
}

export function sanitizeActivityConfigJson(configJson = {}) {
  if (!configJson || typeof configJson !== "object" || Array.isArray(configJson)) {
    return {};
  }

  const next = {};

  if (Object.prototype.hasOwnProperty.call(configJson, "version")) {
    next.version = configJson.version;
  }

  if (Object.prototype.hasOwnProperty.call(configJson, "activity_mode")) {
    next.activity_mode = normalizeActivityMode(configJson.activity_mode, DEFAULT_ACTIVITY_MODE);
  }

  if (Object.prototype.hasOwnProperty.call(configJson, "response_ui")) {
    const safeMode = normalizeActivityMode(next.activity_mode ?? configJson.activity_mode, DEFAULT_ACTIVITY_MODE);
    next.response_ui = normalizeResponseUi(configJson.response_ui, getDefaultResponseUiForActivityMode(safeMode));
  }

  if (Object.prototype.hasOwnProperty.call(configJson, "progress_mode")) {
    next.progress_mode = normalizeProgressMode(configJson.progress_mode, "evaluated");
  }

  if (Object.prototype.hasOwnProperty.call(configJson, "globals")) {
    const globals = configJson.globals;
    next.globals = globals && typeof globals === "object" && !Array.isArray(globals)
      ? { ...globals }
      : globals;
  }

  if (Object.prototype.hasOwnProperty.call(configJson, "sequence")) {
    next.sequence = Array.isArray(configJson.sequence)
      ? [...configJson.sequence]
      : configJson.sequence;
  }

  if (Object.prototype.hasOwnProperty.call(configJson, "dashboard")) {
    const dashboard = configJson.dashboard;
    next.dashboard = dashboard && typeof dashboard === "object" && !Array.isArray(dashboard)
      ? { ...dashboard }
      : dashboard;
  }

  return next;
}

export function mergeActivityDashboardMeta(configJson = {}, metaUpdates = {}, fallbackOrder = 0) {
  const safeConfig = sanitizeActivityConfigJson(configJson);
  const current = normalizeActivityDashboardMeta(safeConfig, fallbackOrder);
  const next = { ...current };

  if ("display_order" in metaUpdates) {
    const displayOrder = Number(metaUpdates.display_order);
    if (!Number.isFinite(displayOrder)) {
      throw new Error("Ordre d’activité invalide.");
    }
    next.display_order = Math.max(0, Math.trunc(displayOrder));
  }

  if ("folder_id" in metaUpdates) {
    next.folder_id = normalizeDashboardFolderId(metaUpdates.folder_id);
  }

  if ("is_visible" in metaUpdates) {
    next.is_visible = metaUpdates.is_visible !== false;
  }

  if ("is_highlighted" in metaUpdates) {
    next.is_highlighted = metaUpdates.is_highlighted === true;
  }

  const storedActivityMode = normalizeActivityStoredMode(safeConfig);
  if (!next.is_visible || !isStudentFacingActivityMode(storedActivityMode)) {
    next.is_highlighted = false;
  }

  return {
    ...safeConfig,
    dashboard: next
  };
}

export function sortActivitiesByDashboardMeta(activities = []) {
  return [...activities].sort((a, b) => {
    const orderA = Number(a?.display_order);
    const orderB = Number(b?.display_order);

    if (Number.isFinite(orderA) && Number.isFinite(orderB) && orderA !== orderB) {
      return orderA - orderB;
    }

    const nameA = String(a?.config_name || "").localeCompare(String(b?.config_name || ""), "fr", { sensitivity: "base" });
    if (nameA !== 0) return nameA;

    return String(a?.id || "").localeCompare(String(b?.id || ""), "fr", { sensitivity: "base" });
  });
}

export function normalizeFolderRecord(folder = {}, fallbackOrder = 0) {
  const displayOrderValue = Number(folder?.display_order);
  return {
    ...(folder || {}),
    parent_id: normalizeDashboardFolderId(folder?.parent_id),
    display_order: Number.isFinite(displayOrderValue)
      ? Math.max(0, Math.trunc(displayOrderValue))
      : Math.max(0, Math.trunc(Number(fallbackOrder) || 0))
  };
}

export function sortFoldersByMeta(folders = []) {
  return [...folders].sort((a, b) => {
    const orderA = Number(a?.display_order);
    const orderB = Number(b?.display_order);

    if (Number.isFinite(orderA) && Number.isFinite(orderB) && orderA !== orderB) {
      return orderA - orderB;
    }

    const nameCompare = String(a?.name || "").localeCompare(String(b?.name || ""), "fr", { sensitivity: "base" });
    if (nameCompare !== 0) return nameCompare;

    return String(a?.id || "").localeCompare(String(b?.id || ""), "fr", { sensitivity: "base" });
  });
}

export function mergePreservedActivityMeta(configJson = {}, preservedMeta = null) {
  const safeConfig = sanitizeActivityConfigJson(configJson);
  const safePreserved = preservedMeta && typeof preservedMeta === "object" ? preservedMeta : {};

  const incomingDashboard = safeConfig.dashboard && typeof safeConfig.dashboard === "object"
    ? safeConfig.dashboard
    : {};

  const nextActivityMode = "activity_mode" in safeConfig
    ? normalizeActivityMode(safeConfig.activity_mode, DEFAULT_ACTIVITY_MODE)
    : normalizeActivityMode(safePreserved.activity_mode, DEFAULT_ACTIVITY_MODE);
  const nextResponseUi = "response_ui" in safeConfig
    ? normalizeResponseUi(safeConfig.response_ui, getDefaultResponseUiForActivityMode(nextActivityMode))
    : normalizeResponseUi(safePreserved.response_ui, getDefaultResponseUiForActivityMode(nextActivityMode));
  const nextProgressMode = "progress_mode" in safeConfig
    ? normalizeProgressMode(safeConfig.progress_mode, "evaluated")
    : normalizeProgressMode(safePreserved.progress_mode, "evaluated");

  return {
    ...safeConfig,
    activity_mode: nextActivityMode,
    response_ui: nextResponseUi,
    progress_mode: nextProgressMode,
    dashboard: {
      ...(safePreserved.dashboard && typeof safePreserved.dashboard === "object" ? safePreserved.dashboard : {}),
      ...incomingDashboard
    }
  };
}
