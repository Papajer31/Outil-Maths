import { createMathsModuleRuntime } from "../modules/maths/module.js";
import { createProductionEcritModuleRuntime } from "../modules/production-ecrit/module.js";
import { createVocabulaireModuleRuntime } from "../modules/vocabulaire/module.js";

const MODULE_DEFS = {
  maths: {
    key: "maths",
    label: "Maths",
    createRuntime: createMathsModuleRuntime
  },
  "production-ecrit": {
    key: "production-ecrit",
    label: "Production d’écrit",
    createRuntime: createProductionEcritModuleRuntime
  },
  vocabulaire: {
    key: "vocabulaire",
    label: "Vocabulaire",
    createRuntime: createVocabulaireModuleRuntime
  }
};

export function getAvailableModules() {
  return Object.values(MODULE_DEFS).map((def) => ({
    key: def.key,
    label: def.label
  }));
}

export function getModuleLabel(moduleKey) {
  const normalizedModuleKey = String(moduleKey || "").trim();
  return MODULE_DEFS[normalizedModuleKey]?.label || normalizedModuleKey;
}

export function loadModuleRuntime(moduleKey) {
  const normalizedModuleKey = String(moduleKey || "").trim();
  const def = MODULE_DEFS[normalizedModuleKey];

  if (!def) {
    throw new Error(`Module inconnu : ${normalizedModuleKey}`);
  }

  return def.createRuntime();
}