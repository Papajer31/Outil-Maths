import {
  normalizeActivityGlobals,
  normalizeToolDraft
} from "../../shared/activity-config.js";
import {
  estimateStandardToolDuration,
  sumDurationEstimates
} from "../../shared/activity-duration.js";

const MODULE_MANIFEST_URL = new URL("./manifest.json", import.meta.url);

export function createProductionEcritModuleRuntime() {
  let manifestPromise = null;

  return {
    loadToolsCatalog,
    loadToolModule,
    estimateActivityDuration
  };

  async function loadToolsCatalog() {
    const manifest = await loadManifest();
    const toolsMap = manifest.tools || {};

    return Object.entries(toolsMap).map(([id, def]) => ({
      id,
      title: def.label || id
    }));
  }

  async function loadToolModule(toolId) {
    const manifest = await loadManifest();
    const toolDef = manifest?.tools?.[toolId];

    if (!toolDef) {
      throw new Error(`Outil inconnu dans le module production-ecrit : ${toolId}`);
    }

    if (!toolDef.entry) {
      throw new Error(`Entrée manquante pour l’outil ${toolId}`);
    }

    const entryUrl = new URL(toolDef.entry, import.meta.url);
    return await import(entryUrl.href);
  }

  async function estimateActivityDuration(configJson = {}) {
    const manifest = await loadManifest();
    const toolsMap = manifest.tools || {};
    const safeGlobals = normalizeActivityGlobals(configJson?.globals);
    const safeDrafts = configJson?.drafts && typeof configJson.drafts === "object"
      ? configJson.drafts
      : {};

    const estimates = [];

    for (const toolId of Object.keys(toolsMap)) {
      const safeDraft = normalizeToolDraft(safeDrafts[toolId]);
      if (!safeDraft.enabled) continue;

      const mod = await loadToolModule(toolId);
      const tool = mod.default ?? {};

      const estimate = typeof tool.estimateDuration === "function"
        ? tool.estimateDuration({
            draft: safeDraft,
            globals: safeGlobals,
            toolId
          })
        : estimateStandardToolDuration({
            draft: safeDraft,
            globals: safeGlobals,
            hasAnswerPhase: tool.hasAnswerPhase !== false
          });

      estimates.push(estimate);
    }

    return sumDurationEstimates(estimates);
  }

  async function loadManifest() {
    if (!manifestPromise) {
      manifestPromise = fetchJSON(MODULE_MANIFEST_URL.href);
    }
    return await manifestPromise;
  }
}

async function fetchJSON(path) {
  const r = await fetch(path, { cache: "no-store" });
  if (!r.ok) {
    throw new Error(`Impossible de charger ${path} (${r.status})`);
  }
  return await r.json();
}
