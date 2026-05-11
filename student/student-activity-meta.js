import { studentState } from "./student-state.js";
import {
  normalizeAccessCode,
  loadPublicActivityConfig
} from "./student-api.js";
import {
  DEFAULT_ACTIVITY_MODE,
  normalizeActivityMode
} from "../shared/activity-modes.js";
import { normalizePassationProfile } from "../shared/activity-config.js";
import { createSessionEngine } from "../shared/student-core.js";

export async function ensureSelectedActivityMeta({ runMode = studentState.sessionMode || "student" } = {}) {
  const accessCode = normalizeAccessCode(studentState.accessCode);
  const configName = String(studentState.selectedConfig?.config_name || "").trim();

  if (!accessCode || !configName) {
    return emptyMeta();
  }

  const cached = studentState.selectedConfigMeta;
  if (
    cached &&
    cached.accessCode === accessCode &&
    cached.configName === configName &&
    cached.runMode === runMode
  ) {
    return cloneMeta(cached);
  }

  const remote = await loadPublicActivityConfig(accessCode, configName);
  if (!Array.isArray(remote?.config_json?.sequence)) {
    throw new Error("Configuration introuvable ou invalide.");
  }

  const moduleKey = String(remote.module_key ?? remote.module ?? "tools").trim();
  if (!moduleKey) {
    throw new Error("Module d’activité introuvable.");
  }

  const loadedActivityMode = normalizeActivityMode(
    remote.config_json?.activity_mode ?? remote.activity_mode,
    DEFAULT_ACTIVITY_MODE
  );
  const loadedPassationProfile = normalizePassationProfile({
    activityMode: loadedActivityMode,
    responseUi: remote.config_json?.response_ui,
    progressMode: remote.config_json?.progress_mode
  });

  if (remote.config_json && remote.config_json.response_ui == null) {
    remote.config_json.response_ui = loadedPassationProfile.responseUi;
  }

  const tempEngine = createSessionEngine({
    els: {},
    accessCode,
    configName,
    moduleKey,
    globals: remote.config_json.globals ?? {},
    sequence: remote.config_json.sequence,
    activityMode: loadedPassationProfile.activityMode,
    responseUi: loadedPassationProfile.responseUi,
    progressMode: loadedPassationProfile.progressMode,
    onExitToActivities: () => {},
    onFatalError: () => {},
    runMode
  });

  try {
    await tempEngine.init();
    const rawMeta = tempEngine.getSessionMeta?.() ?? emptyMeta();

    const meta = {
      accessCode,
      configName,
      runMode,
      requiresStudent: !!rawMeta.requiresStudent,
      allowedStudentIds: Array.isArray(rawMeta.allowedStudentIds)
        ? rawMeta.allowedStudentIds.map((id) => String(id || "").trim()).filter(Boolean)
        : [],
      blockingMessage: String(rawMeta.blockingMessage || "").trim()
    };

    studentState.selectedConfigMeta = meta;
    return cloneMeta(meta);
  } finally {
    try {
      tempEngine.stop?.();
    } catch {}
  }
}

export function clearSelectedActivityMeta() {
  studentState.selectedConfigMeta = null;
}

function emptyMeta() {
  return {
    accessCode: "",
    configName: "",
    runMode: "student",
    requiresStudent: false,
    allowedStudentIds: [],
    blockingMessage: ""
  };
}

function cloneMeta(meta) {
  return {
    accessCode: String(meta?.accessCode || ""),
    configName: String(meta?.configName || ""),
    runMode: String(meta?.runMode || "student"),
    requiresStudent: !!meta?.requiresStudent,
    allowedStudentIds: Array.isArray(meta?.allowedStudentIds)
      ? [...meta.allowedStudentIds]
      : [],
    blockingMessage: String(meta?.blockingMessage || "")
  };
}
