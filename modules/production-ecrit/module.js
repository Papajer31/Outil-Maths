import {
  TOOL_LIMITS,
  normalizeToolDraft,
  normalizeActivityGlobals,
  normalizeActivitySequence
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

export function createProductionEcritModuleRuntime() {
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
      throw new Error(`Outil inconnu dans le module production-ecrit : ${toolId}`);
    }

    if (!toolDef.entry) {
      throw new Error(`Entrée manquante pour l’outil ${toolId}`);
    }

    const entryUrl = new URL(toolDef.entry, import.meta.url);
    return await import(entryUrl.href);
  }

  async function estimateActivityDuration(configJson = {}) {
    const safeGlobals = normalizeActivityGlobals(configJson?.globals);
    const toolsCatalog = await loadToolsCatalog();
    const safeSequence = normalizeActivitySequence(configJson?.sequence, {
      toolsCatalog,
      legacyDrafts: configJson?.drafts
    });

    const estimates = [];

    for (const item of safeSequence) {
      const safeDraft = normalizeToolDraft(item.draft);
      const mod = await loadToolModule(item.toolId);
      const tool = mod.default ?? {};

      const estimate = typeof tool.estimateDuration === "function"
        ? tool.estimateDuration({
            draft: safeDraft,
            globals: safeGlobals,
            toolId: item.toolId,
            instanceId: item.instanceId
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
          id: "moduleToolQuestionCount",
          label: "Nombre de questions",
          value: safeDraft.questionCount,
          inputMin: TOOL_LIMITS.questionCount.min,
          inputMax: TOOL_LIMITS.questionCount.max,
          step: TOOL_LIMITS.questionCount.step
        })}

        ${renderStepperField({
          id: "moduleToolTimePerQ",
          label: "Temps par question",
          value: safeDraft.timePerQ,
          inputMin: TOOL_LIMITS.timePerQ.min,
          inputMax: TOOL_LIMITS.timePerQ.max,
          step: TOOL_LIMITS.timePerQ.step
        })}

        ${renderStepperField({
          id: "moduleToolAnswerTime",
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
  bindStepperField(container, "moduleToolQuestionCount", {
    inputMin: TOOL_LIMITS.questionCount.min,
    inputMax: TOOL_LIMITS.questionCount.max,
    onChange: () => onDirty?.()
  });

  bindStepperField(container, "moduleToolTimePerQ", {
    inputMin: TOOL_LIMITS.timePerQ.min,
    inputMax: TOOL_LIMITS.timePerQ.max,
    onChange: () => onDirty?.()
  });

  bindStepperField(container, "moduleToolAnswerTime", {
    inputMin: TOOL_LIMITS.answerTime.min,
    inputMax: TOOL_LIMITS.answerTime.max,
    onChange: () => onDirty?.()
  });
}

function readCommonToolSettings(container, draft) {
  const nextDraft = normalizeToolDraft(draft);

  nextDraft.questionCount = readStepper(container, "moduleToolQuestionCount", {
    inputMin: TOOL_LIMITS.questionCount.min,
    inputMax: TOOL_LIMITS.questionCount.max
  });

  nextDraft.timePerQ = readStepper(container, "moduleToolTimePerQ", {
    inputMin: TOOL_LIMITS.timePerQ.min,
    inputMax: TOOL_LIMITS.timePerQ.max
  });

  nextDraft.answerTime = readStepper(container, "moduleToolAnswerTime", {
    inputMin: TOOL_LIMITS.answerTime.min,
    inputMax: TOOL_LIMITS.answerTime.max
  });

  nextDraft.enabled = true;
  return nextDraft;
}
