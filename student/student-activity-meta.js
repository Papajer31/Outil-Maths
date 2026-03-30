import { studentState } from "./student-state.js";
import {
  normalizeAccessCode,
  loadPublicActivityConfig
} from "./student-api.js";
import { createSessionEngine } from "../shared/student-core.js";

export async function ensureSelectedActivityMeta() {
  const accessCode = normalizeAccessCode(studentState.accessCode);
  const configName = String(studentState.selectedConfig?.config_name || "").trim();

  if (!accessCode || !configName) {
    return emptyMeta();
  }

  const cached = studentState.selectedConfigMeta;
  if (
    cached &&
    cached.accessCode === accessCode &&
    cached.configName === configName
  ) {
    return cloneMeta(cached);
  }

  const remote = await loadPublicActivityConfig(accessCode, configName);
  if (!remote?.config_json?.drafts) {
    throw new Error("Configuration introuvable ou invalide.");
  }

  const moduleKey = String(remote.module_key ?? remote.module ?? "maths").trim();
  if (!moduleKey) {
    throw new Error("Module d’activité introuvable.");
  }

  const tempEngine = createSessionEngine({
    els: {},
    accessCode,
    configName,
    moduleKey,
    globals: remote.config_json.globals ?? {},
    drafts: remote.config_json.drafts,
    onExitToActivities: () => {},
    onFatalError: () => {}
  });

  try {
    await tempEngine.init();
    const rawMeta = tempEngine.getSessionMeta?.() ?? emptyMeta();

    const meta = {
      accessCode,
      configName,
      requiresStudent: !!rawMeta.requiresStudent,
      allowedStudentIds: Array.isArray(rawMeta.allowedStudentIds)
        ? rawMeta.allowedStudentIds.map((id) => String(id || "").trim()).filter(Boolean)
        : []
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
    requiresStudent: false,
    allowedStudentIds: []
  };
}

function cloneMeta(meta) {
  return {
    accessCode: String(meta?.accessCode || ""),
    configName: String(meta?.configName || ""),
    requiresStudent: !!meta?.requiresStudent,
    allowedStudentIds: Array.isArray(meta?.allowedStudentIds)
      ? [...meta.allowedStudentIds]
      : []
  };
}
