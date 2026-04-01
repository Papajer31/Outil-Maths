import {
  TOOL_LIMITS,
  normalizeToolDraft,
  normalizeActivityGlobals
} from "../../shared/activity-config.js";
import {
  renderStepperField,
  bindStepperField,
  readStepper
} from "../../shared/config-widgets.js";
import {
  estimateStandardToolDuration,
  sumDurationEstimates
} from "../../shared/activity-duration.js";

const MODULE_MANIFEST_URL = new URL("./manifest.json", import.meta.url);

export function createVocabulaireModuleRuntime() {
  let manifestPromise = null;

  return {
    loadToolsCatalog,
    loadToolModule,
    renderCommonToolSettings,
    bindCommonToolSettings,
    readCommonToolSettings,
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
      throw new Error(`Outil inconnu dans le module vocabulaire : ${toolId}`);
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

function renderCommonToolSettings(draft) {
  const safeDraft = normalizeToolDraft(draft);

  return `
    <div class="tv-group">
      <div class="tv-stepper-grid">
        ${renderStepperField({
          id: "vocabToolQuestionCount",
          label: "Nombre de questions",
          value: safeDraft.questionCount,
          inputMin: TOOL_LIMITS.questionCount.min,
          inputMax: TOOL_LIMITS.questionCount.max,
          step: TOOL_LIMITS.questionCount.step
        })}

        ${renderStepperField({
          id: "vocabToolTimePerQ",
          label: "Temps par question",
          value: safeDraft.timePerQ,
          inputMin: TOOL_LIMITS.timePerQ.min,
          inputMax: TOOL_LIMITS.timePerQ.max,
          step: TOOL_LIMITS.timePerQ.step
        })}

        ${renderStepperField({
          id: "vocabToolAnswerTime",
          label: "Temps d’affichage réponse",
          value: safeDraft.answerTime,
          inputMin: TOOL_LIMITS.answerTime.min,
          inputMax: TOOL_LIMITS.answerTime.max,
          step: TOOL_LIMITS.answerTime.step
        })}
      </div>
    </div>
  `;
}

function bindCommonToolSettings(container, { onDirty } = {}) {
  bindStepperField(container, "vocabToolQuestionCount", {
    inputMin: TOOL_LIMITS.questionCount.min,
    inputMax: TOOL_LIMITS.questionCount.max,
    onChange: () => onDirty?.()
  });

  bindStepperField(container, "vocabToolTimePerQ", {
    inputMin: TOOL_LIMITS.timePerQ.min,
    inputMax: TOOL_LIMITS.timePerQ.max,
    onChange: () => onDirty?.()
  });

  bindStepperField(container, "vocabToolAnswerTime", {
    inputMin: TOOL_LIMITS.answerTime.min,
    inputMax: TOOL_LIMITS.answerTime.max,
    onChange: () => onDirty?.()
  });
}

function readCommonToolSettings(container, draft) {
  const nextDraft = normalizeToolDraft(draft);

  nextDraft.questionCount = readStepper(container, "vocabToolQuestionCount", {
    inputMin: TOOL_LIMITS.questionCount.min,
    inputMax: TOOL_LIMITS.questionCount.max
  });

  nextDraft.timePerQ = readStepper(container, "vocabToolTimePerQ", {
    inputMin: TOOL_LIMITS.timePerQ.min,
    inputMax: TOOL_LIMITS.timePerQ.max
  });

  nextDraft.answerTime = readStepper(container, "vocabToolAnswerTime", {
    inputMin: TOOL_LIMITS.answerTime.min,
    inputMax: TOOL_LIMITS.answerTime.max
  });

  return nextDraft;
}
