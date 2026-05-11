import {
  TOOL_LIMITS,
  cloneData,
  getCommonSuccessGoalSettings,
  ensureCommonSuccessGoalSettings,
  normalizeToolDraft,
  normalizeActivityGlobals,
  normalizeActivitySequence,
  normalizePassationProfile,
  supportsSuccessGoalQuestionFlow,
  normalizeQuestionFlowMode
} from "./activity-config.js";
import {
  renderStepperField,
  bindStepperField,
  readStepper,
  renderCheckbox
} from "./config-widgets.js";
import {
  applyToolTimeLimitToDurationEstimate,
  estimateStandardToolDuration,
  sumDurationEstimates
} from "./activity-duration.js";
import {
  normalizeToolContract
} from "./tool-contract.js";
import {
  DEFAULT_ACTIVITY_MODE,
  normalizeActivityMode
} from "./activity-modes.js";
import { getActiveToolsRegistry, getToolRegistryMeta } from "../tools/registry.js";

const TOOL_MODULE_CACHE = new Map();
const lockStickerUrl = new URL("./ui-assets/lock.webp", import.meta.url).href;

const SHARED_ROOT_TOOLS_RUNTIME = createRootToolsRuntime();

export function getToolRootKey() {
  return getToolRegistryMeta().key;
}

export function getToolRootLabel() {
  return getToolRegistryMeta().label;
}

export function getAvailableToolRoots() {
  return [{
    key: getToolRootKey(),
    label: getToolRootLabel()
  }];
}

export function getToolRootRuntimeUrl() {
  return new URL("./tool-root-runtime.js", import.meta.url);
}

export async function loadToolsRuntime() {
  return SHARED_ROOT_TOOLS_RUNTIME;
}

export function createRootToolsRuntime() {
  return {
    loadToolsCatalog,
    loadToolModule,
    renderCommonToolSettings,
    bindCommonToolSettings,
    readCommonToolSettings,
    estimateActivityDuration
  };
}

function shouldForceInfiniteQuestionCount(context = {}) {
  return context?.forceInfiniteQuestionCount === true
    || context?.isFinalInfiniteSequenceItem === true
    || context?.finalInfiniteSequenceItem === true;
}

async function loadToolsCatalog() {
  const registry = getActiveToolsRegistry();

  return registry.map((entry) => ({
    id: String(entry?.id || "").trim(),
    label: String(entry?.label || entry?.id || "Outil").trim() || "Outil",
    title: String(entry?.label || entry?.id || "Outil").trim() || "Outil",
    moduleKey: getToolRegistryMeta().key,
    path: String(entry?.entry || "").trim(),
    description: String(entry?.description || "").trim(),
    tags: Array.isArray(entry?.tags) ? [...entry.tags] : []
  })).filter((entry) => !!entry.id);
}

async function loadToolModule(toolId) {
  const registry = getActiveToolsRegistry();
  const safeToolId = String(toolId || "").trim();
  const entry = registry.find((item) => String(item?.id || "").trim() === safeToolId);

  if (!entry) {
    throw new Error(`Outil actif introuvable : ${safeToolId || "(vide)"}`);
  }

  if (!TOOL_MODULE_CACHE.has(safeToolId)) {
    TOOL_MODULE_CACHE.set(safeToolId, (async () => {
      const entryUrl = new URL(String(entry.entry || ""), import.meta.url);
      const mod = await import(entryUrl.href);
      const normalizedDefault = normalizeToolContract(mod.default ?? {}, {
        toolId: safeToolId,
        label: entry.label || mod.default?.label || safeToolId
      });

      return {
        ...mod,
        default: normalizedDefault
      };
    })());
  }

  return await TOOL_MODULE_CACHE.get(safeToolId);
}

async function estimateActivityDuration(configJson = {}) {
  const safeGlobals = normalizeActivityGlobals(configJson?.globals);
  if (safeGlobals.activityTotalTimeEnabled === true) {
    return {
      minSec: safeGlobals.activityTotalTimeSec,
      maxSec: safeGlobals.activityTotalTimeSec
    };
  }

  const toolsCatalog = await loadToolsCatalog();
  const safeSequence = normalizeActivitySequence(configJson?.sequence, {
    toolsCatalog,
    fallbackGlobals: configJson?.globals
  });

  const estimates = [];

  for (const item of safeSequence) {
    const safeDraft = normalizeToolDraft(item.draft);
    const mod = await loadToolModule(item.toolId);
    const tool = mod.default ?? {};

    const estimate = typeof tool.estimateDuration === "function"
      ? await tool.estimateDuration({
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

    estimates.push(applyToolTimeLimitToDurationEstimate(estimate, safeDraft));
  }

  return sumDurationEstimates(estimates);
}

function renderCommonToolSettings(draft, context = {}) {
  const safeDraft = normalizeToolDraft(draft);
  const safeTool = context && typeof context === "object" && !Array.isArray(context)
    ? (context.tool && typeof context.tool === "object" ? context.tool : null)
    : null;
  const showInstructionField = safeTool?.supportsCustomInstruction !== false;
  const instructionState = getCommonInstructionState(safeDraft.settings);
  const successGoalSettings = getCommonSuccessGoalSettings(safeDraft);
  const defaultInstructionText = String(safeTool?.defaultInstruction || "").trim();
  const passationProfile = normalizePassationProfile({
    activityMode: context?.activityMode ?? context?.activity_mode ?? context?.mode,
    responseUi: context?.responseUi ?? context?.response_ui,
    progressMode: context?.progressMode ?? context?.progress_mode
  }, {
    activityMode: DEFAULT_ACTIVITY_MODE,
    responseUi: "boxed",
    progressMode: "evaluated"
  });
  const forceInfiniteQuestionCount = shouldForceInfiniteQuestionCount(context);
  const canShowSuccessGoalQuestionFlow = supportsSuccessGoalQuestionFlow(passationProfile) && !forceInfiniteQuestionCount;
  const questionFlowMode = getQuestionFlowModeForRender({
    questionFlowMode: safeDraft.questionFlowMode,
    canShowSuccessGoalQuestionFlow,
    forceInfiniteQuestionCount
  });
  const shouldShowSuccessGoalSettings = canShowSuccessGoalQuestionFlow && questionFlowMode === "successGoal";
  const forcedInfiniteMessage = "Dernier outil : questions illimitées forcées par la durée totale.";

  return `
    <div class="tv-group">
      <div class="tv-stepper-grid">
        ${renderQuestionCountModeControl({
          questionCount: safeDraft.questionCount,
          successGoalSettings,
          questionFlowMode,
          canShowSuccessGoalQuestionFlow,
          shouldShowSuccessGoalSettings,
          forceInfiniteQuestionCount,
          forcedInfiniteMessage
        })}

        ${renderStepperField({
          id: "commonToolTimePerQ",
          label: "Temps par question",
          value: safeDraft.timePerQ,
          inputMin: TOOL_LIMITS.timePerQ.min,
          inputMax: TOOL_LIMITS.timePerQ.max,
          step: TOOL_LIMITS.timePerQ.step,
          fieldClassName: "cfg-common-flow-time-per-question-field",
          actionButtonHtml: renderInfiniteToggleButton({
            id: "commonToolTimePerQInfinite",
            label: "Temps par question illimité",
            active: safeDraft.infiniteTimePerQ
          })
        })}

        ${renderStepperField({
          id: "commonToolAnswerTime",
          label: "Temps d’affichage réponse",
          value: safeDraft.answerTime,
          inputMin: TOOL_LIMITS.answerTime.min,
          inputMax: TOOL_LIMITS.answerTime.max,
          step: TOOL_LIMITS.answerTime.step,
          fieldClassName: "cfg-common-flow-answer-time-field",
          actionButtonHtml: renderInfiniteToggleButton({
            id: "commonToolAnswerTimeInfinite",
            label: "Temps d’affichage réponse illimité",
            active: safeDraft.infiniteAnswerTime
          })
        })}

        ${renderStepperField({
          id: "commonToolQuestionTransitionSec",
          label: "Temps entre les questions",
          value: safeDraft.questionTransitionSec,
          inputMin: TOOL_LIMITS.questionTransitionSec.min,
          inputMax: TOOL_LIMITS.questionTransitionSec.max,
          step: TOOL_LIMITS.questionTransitionSec.step,
          fieldClassName: "cfg-common-flow-transition-field",
          actionButtonHtml: renderInfiniteToggleButton({
            id: "commonToolQuestionTransitionSecInfinite",
            label: "Temps entre les questions illimité",
            active: safeDraft.questionTransitionInfinite
          })
        })}

        ${renderStepperField({
          id: "commonToolMaxTimeMin",
          label: "Durée maximale",
          value: safeDraft.toolMaxTimeMin,
          inputMin: TOOL_LIMITS.toolMaxTimeMin.min,
          inputMax: TOOL_LIMITS.toolMaxTimeMin.max,
          step: TOOL_LIMITS.toolMaxTimeMin.step,
          fieldClassName: "cfg-common-flow-max-time-field",
          actionButtonHtml: renderInfiniteToggleButton({
            id: "commonToolMaxTimeInfinite",
            label: "Aucune limite de temps pour cet outil",
            active: safeDraft.toolMaxTimeInfinite
          })
        })}
      </div>
      ${showInstructionField ? `
        <div class="cfg-common-flow-instruction-row">
          <div class="cfg-common-flow-instruction-head">
            <div class="cfg-common-flow-instruction-controls">
              ${renderCheckbox({
                id: "commonToolInstructionEnabled",
                label: "Consigne personnalisée",
                checked: instructionState.enabled
              })}
              ${renderCheckbox({
                id: "commonToolInstructionHidden",
                label: "Aucune consigne",
                checked: instructionState.hidden
              })}
            </div>
            ${renderCurrentInstructionHint(defaultInstructionText)}
          </div>
          <div class="cfg-common-flow-instruction-panel" id="commonToolInstructionPanel"${instructionState.enabled && !instructionState.hidden ? "" : " hidden"}>
            <textarea
              class="tv-input tv-minmax-textarea cfg-common-flow-instruction-input"
              id="commonToolInstructionText"
              rows="2"
              placeholder="Saisir une consigne..."
              ${instructionState.enabled && !instructionState.hidden ? "" : "disabled"}>${escapeHtml(instructionState.text)}</textarea>
          </div>
        </div>
      ` : ""}
    </div>
  `;
}

function bindCommonToolSettings(container, { onDirty, onAnswerInfiniteActivated, forceInfiniteQuestionCount = false } = {}) {
  const instructionToggle = container.querySelector("#commonToolInstructionEnabled");
  const instructionHiddenToggle = container.querySelector("#commonToolInstructionHidden");
  const instructionPanel = container.querySelector("#commonToolInstructionPanel");
  const instructionInput = container.querySelector("#commonToolInstructionText");
  const successGoalRow = container.querySelector("#commonToolSuccessGoalRow");

  const applyInstructionState = () => {
    const hidden = instructionHiddenToggle?.checked === true;
    const enabled = instructionToggle?.checked === true && !hidden;

    if (instructionToggle) {
      instructionToggle.disabled = hidden;
      instructionToggle.closest(".tv-checkbox-row")?.classList.toggle("is-disabled", hidden);
    }

    if (instructionPanel) {
      instructionPanel.hidden = !enabled;
    }

    if (instructionInput) {
      instructionInput.disabled = !enabled;
    }
  };

  const applySuccessGoalState = (mode) => {
    if (successGoalRow) {
      const canShowSuccessGoalSettings = successGoalRow.dataset.commonSuccessGoalAllowed !== "false";
      successGoalRow.hidden = !(canShowSuccessGoalSettings && mode === "successGoal");
    }
  };

  if (instructionToggle || instructionHiddenToggle || instructionInput) {
    applyInstructionState();

    instructionToggle?.addEventListener("change", () => {
      applyInstructionState();
      onDirty?.();
    });

    instructionHiddenToggle?.addEventListener("change", () => {
      applyInstructionState();
      onDirty?.();
    });

    instructionInput?.addEventListener("input", () => onDirty?.());
  }

  bindStepperField(container, "commonToolSuccessGoalSafetyMilestones", {
    inputMin: TOOL_LIMITS.successGoalSafetyMilestones.min,
    inputMax: TOOL_LIMITS.successGoalSafetyMilestones.max,
    onChange: () => onDirty?.()
  });

  bindStepperField(container, "commonToolSuccessGoalCorrectCount", {
    inputMin: TOOL_LIMITS.successGoalCorrectCount.min,
    inputMax: TOOL_LIMITS.successGoalCorrectCount.max,
    onChange: () => onDirty?.()
  });

  bindStepperField(container, "commonToolQuestionCount", {
    inputMin: TOOL_LIMITS.questionCount.min,
    inputMax: TOOL_LIMITS.questionCount.max,
    onChange: () => onDirty?.()
  });

  bindStepperField(container, "commonToolTimePerQ", {
    inputMin: TOOL_LIMITS.timePerQ.min,
    inputMax: TOOL_LIMITS.timePerQ.max,
    onChange: () => onDirty?.()
  });

  bindStepperField(container, "commonToolAnswerTime", {
    inputMin: TOOL_LIMITS.answerTime.min,
    inputMax: TOOL_LIMITS.answerTime.max,
    onChange: () => onDirty?.()
  });

  bindStepperField(container, "commonToolQuestionTransitionSec", {
    inputMin: TOOL_LIMITS.questionTransitionSec.min,
    inputMax: TOOL_LIMITS.questionTransitionSec.max,
    onChange: () => onDirty?.()
  });

  bindStepperField(container, "commonToolMaxTimeMin", {
    inputMin: TOOL_LIMITS.toolMaxTimeMin.min,
    inputMax: TOOL_LIMITS.toolMaxTimeMin.max,
    onChange: () => onDirty?.()
  });

  bindQuestionCountMode(container, {
    forceInfiniteQuestionCount,
    onChange: (mode) => {
      applySuccessGoalState(mode);
      onDirty?.();
    }
  });

  bindInfiniteToggle(container, {
    buttonId: "commonToolTimePerQInfinite",
    inputId: "commonToolTimePerQ",
    onChange: () => onDirty?.()
  });

  bindInfiniteToggle(container, {
    buttonId: "commonToolAnswerTimeInfinite",
    inputId: "commonToolAnswerTime",
    onChange: (active) => {
      if (active) {
        onAnswerInfiniteActivated?.();
      }
      onDirty?.();
    }
  });

  bindInfiniteToggle(container, {
    buttonId: "commonToolQuestionTransitionSecInfinite",
    inputId: "commonToolQuestionTransitionSec",
    onChange: () => onDirty?.()
  });

  bindInfiniteToggle(container, {
    buttonId: "commonToolMaxTimeInfinite",
    inputId: "commonToolMaxTimeMin",
    onChange: () => onDirty?.()
  });

  applySuccessGoalState(getActiveQuestionCountMode(container));
}

function readCommonToolSettings(container, draft, context = {}) {
  const nextDraft = normalizeToolDraft(draft);

  nextDraft.questionCount = readStepper(container, "commonToolQuestionCount", {
    inputMin: TOOL_LIMITS.questionCount.min,
    inputMax: TOOL_LIMITS.questionCount.max
  });

  nextDraft.timePerQ = readStepper(container, "commonToolTimePerQ", {
    inputMin: TOOL_LIMITS.timePerQ.min,
    inputMax: TOOL_LIMITS.timePerQ.max
  });

  nextDraft.answerTime = readStepper(container, "commonToolAnswerTime", {
    inputMin: TOOL_LIMITS.answerTime.min,
    inputMax: TOOL_LIMITS.answerTime.max
  });

  nextDraft.questionTransitionSec = readStepper(container, "commonToolQuestionTransitionSec", {
    inputMin: TOOL_LIMITS.questionTransitionSec.min,
    inputMax: TOOL_LIMITS.questionTransitionSec.max
  });

  nextDraft.toolMaxTimeMin = readStepper(container, "commonToolMaxTimeMin", {
    inputMin: TOOL_LIMITS.toolMaxTimeMin.min,
    inputMax: TOOL_LIMITS.toolMaxTimeMin.max
  });

  nextDraft.questionFlowMode = shouldForceInfiniteQuestionCount(context)
    ? "unlimited"
    : normalizeQuestionFlowMode(getActiveQuestionCountMode(container), "fixed");
  nextDraft.infiniteTimePerQ = isInfiniteToggleActive(container, "commonToolTimePerQInfinite");
  nextDraft.infiniteAnswerTime = isInfiniteToggleActive(container, "commonToolAnswerTimeInfinite");
  nextDraft.questionTransitionInfinite = isInfiniteToggleActive(container, "commonToolQuestionTransitionSecInfinite");
  nextDraft.toolMaxTimeInfinite = isInfiniteToggleActive(container, "commonToolMaxTimeInfinite");
  nextDraft.settings = ensureCommonSuccessGoalSettings(nextDraft.settings, {
    successGoalSafetyMilestones: readStepper(container, "commonToolSuccessGoalSafetyMilestones", {
      inputMin: TOOL_LIMITS.successGoalSafetyMilestones.min,
      inputMax: TOOL_LIMITS.successGoalSafetyMilestones.max
    }),
    successGoalCorrectCount: readStepper(container, "commonToolSuccessGoalCorrectCount", {
      inputMin: TOOL_LIMITS.successGoalCorrectCount.min,
      inputMax: TOOL_LIMITS.successGoalCorrectCount.max
    })
  });

  const instructionToggle = container.querySelector("#commonToolInstructionEnabled");
  const instructionHiddenToggle = container.querySelector("#commonToolInstructionHidden");
  const instructionInput = container.querySelector("#commonToolInstructionText");
  if (instructionToggle && instructionInput) {
    nextDraft.settings = ensureCommonInstructionState(nextDraft.settings, {
      enabled: instructionToggle.checked,
      text: String(instructionInput.value ?? ""),
      hidden: instructionHiddenToggle?.checked === true
    });
  }

  nextDraft.enabled = true;
  return nextDraft;
}

function getCommonInstructionState(settings) {
  const common = settings && typeof settings === "object" && !Array.isArray(settings) && settings.common && typeof settings.common === "object" && !Array.isArray(settings.common)
    ? settings.common
    : null;
  const instruction = common && typeof common.instruction === "object" && !Array.isArray(common.instruction)
    ? common.instruction
    : null;

  return {
    enabled: instruction?.enabled === true,
    text: String(instruction?.text ?? ""),
    hidden: instruction?.hidden === true
  };
}

function getQuestionFlowModeForRender({
  questionFlowMode = "fixed",
  canShowSuccessGoalQuestionFlow = false,
  forceInfiniteQuestionCount = false
} = {}) {
  if (forceInfiniteQuestionCount) return "unlimited";
  const safeMode = normalizeQuestionFlowMode(questionFlowMode, "fixed");
  if (safeMode === "successGoal" && !canShowSuccessGoalQuestionFlow) return "unlimited";
  return safeMode;
}

function renderQuestionCountModeControl({
  questionCount,
  successGoalSettings,
  questionFlowMode = "fixed",
  canShowSuccessGoalQuestionFlow = false,
  shouldShowSuccessGoalSettings = false,
  forceInfiniteQuestionCount = false,
  forcedInfiniteMessage = ""
} = {}) {
  const safeQuestionFlowMode = ["fixed", "unlimited", "successGoal"].includes(questionFlowMode)
    ? questionFlowMode
    : "fixed";
  const fixedActive = safeQuestionFlowMode === "fixed";
  const unlimitedActive = safeQuestionFlowMode === "unlimited";
  const successGoalActive = safeQuestionFlowMode === "successGoal";
  const disabledAttrs = forceInfiniteQuestionCount ? ` disabled aria-disabled="true"` : "";

  return `
    <div class="cfg-common-flow-question-mode-row${forceInfiniteQuestionCount ? " is-forced-infinite" : ""}" data-question-flow-mode="${safeQuestionFlowMode}">
      <div class="cfg-common-flow-question-mode-left">
        <span class="cfg-common-flow-question-mode-title">Questions :</span>
        <span class="cfg-common-flow-question-mode-toggle${canShowSuccessGoalQuestionFlow ? " has-success-goal" : ""}" role="group" aria-label="Déroulé des questions">
          <button
            class="cfg-common-flow-question-mode-btn${fixedActive ? " is-active" : ""}"
            type="button"
            id="commonToolQuestionCountFixedMode"
            data-question-count-mode="fixed"
            aria-pressed="${fixedActive ? "true" : "false"}"
            ${disabledAttrs}
          >Nombre fixe</button>
          <button
            class="cfg-common-flow-question-mode-btn${unlimitedActive ? " is-active" : ""}"
            type="button"
            id="commonToolQuestionCountUnlimited"
            data-question-count-mode="unlimited"
            aria-pressed="${unlimitedActive ? "true" : "false"}"
            ${disabledAttrs}
          >Illimitées</button>
          ${canShowSuccessGoalQuestionFlow ? `
            <button
              class="cfg-common-flow-question-mode-btn${successGoalActive ? " is-active" : ""}"
              type="button"
              id="commonToolQuestionCountSuccessGoal"
              data-question-count-mode="successGoal"
              aria-pressed="${successGoalActive ? "true" : "false"}"
              ${disabledAttrs}
            >Objectif de réussite</button>
          ` : ""}
        </span>
        <div class="cfg-common-flow-question-fixed-row" id="commonToolQuestionFixedRow"${fixedActive ? "" : " hidden"}>
          <div class="cfg-common-flow-question-inline-control cfg-common-flow-question-fixed-inline-control">
            ${renderStepperField({
              id: "commonToolQuestionCount",
              label: "Nombre de questions",
              value: questionCount,
              inputMin: TOOL_LIMITS.questionCount.min,
              inputMax: TOOL_LIMITS.questionCount.max,
              step: TOOL_LIMITS.questionCount.step,
              fieldClassName: "cfg-common-flow-question-count-field cfg-common-flow-compact-stepper-field"
            })}
            <span class="cfg-common-flow-question-inline-suffix">questions posées</span>
          </div>
        </div>
        ${forceInfiniteQuestionCount ? renderForcedInfiniteLockSticker(forcedInfiniteMessage) : ""}
      </div>

      <div class="cfg-common-flow-question-mode-right">
        <div
          class="cfg-common-flow-success-goal-row cfg-common-flow-question-successGoal-row"
          id="commonToolSuccessGoalRow"
          data-common-success-goal-allowed="${canShowSuccessGoalQuestionFlow ? "true" : "false"}"
          ${shouldShowSuccessGoalSettings ? "" : " hidden"}
        >
          <div class="cfg-common-flow-question-inline-control">
            <span class="cfg-common-flow-question-inline-label">Objectif :</span>
            ${renderStepperField({
              id: "commonToolSuccessGoalCorrectCount",
              label: "Réponses correctes",
              value: successGoalSettings.successGoalCorrectCount,
              inputMin: TOOL_LIMITS.successGoalCorrectCount.min,
              inputMax: TOOL_LIMITS.successGoalCorrectCount.max,
              step: TOOL_LIMITS.successGoalCorrectCount.step,
              fieldClassName: "cfg-common-flow-success-goal-field cfg-common-flow-success-goal-required-field cfg-common-flow-compact-stepper-field"
            })}
            <span class="cfg-common-flow-question-inline-suffix">réponses correctes</span>
          </div>

          <div class="cfg-common-flow-question-inline-control">
            <span class="cfg-common-flow-question-inline-label">Paliers de sécurité :</span>
            ${renderStepperField({
              id: "commonToolSuccessGoalSafetyMilestones",
              label: "Nombre de paliers",
              value: successGoalSettings.successGoalSafetyMilestones,
              inputMin: TOOL_LIMITS.successGoalSafetyMilestones.min,
              inputMax: TOOL_LIMITS.successGoalSafetyMilestones.max,
              step: TOOL_LIMITS.successGoalSafetyMilestones.step,
              fieldClassName: "cfg-common-flow-success-goal-field cfg-common-flow-success-goal-safety-milestones-field cfg-common-flow-compact-stepper-field"
            })}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderCurrentInstructionHint(defaultInstructionText = "") {
  const safeText = String(defaultInstructionText || "").trim() || "Aucune";
  return `
    <div class="cfg-common-flow-instruction-current">
      <span class="cfg-common-flow-instruction-current-label">Consigne actuelle :</span>
      <span class="cfg-common-flow-instruction-current-text">${escapeHtml(safeText)}</span>
    </div>
  `;
}

function ensureCommonInstructionState(settings, instructionState = {}) {
  const safeSettings = settings && typeof settings === "object" && !Array.isArray(settings)
    ? cloneData(settings)
    : {};
  const safeCommon = safeSettings.common && typeof safeSettings.common === "object" && !Array.isArray(safeSettings.common)
    ? { ...safeSettings.common }
    : {};

  safeCommon.instruction = {
    enabled: instructionState?.enabled === true,
    text: String(instructionState?.text ?? ""),
    hidden: instructionState?.hidden === true
  };

  safeSettings.common = safeCommon;
  return safeSettings;
}

function renderInfiniteToggleButton({ id, label, active = false }) {
  return `
    <button
      class="tv-stepper-infinity-btn${active ? " is-active" : ""}"
      type="button"
      id="${id}"
      data-infinite-toggle="true"
      aria-label="${escapeHtml(label)}"
      aria-pressed="${active ? "true" : "false"}"
      title="${escapeHtml(label)}"
    >
      <span class="tv-stepper-icon" aria-hidden="true">all_inclusive</span>
    </button>
  `;
}

function renderForcedInfiniteLockSticker(message = "") {
  const safeMessage = String(message || "").trim();
  return `
    <span
      class="cfg-common-flow-forced-lock-sticker"
      role="img"
      tabindex="0"
      aria-label="${escapeHtml(safeMessage)}"
      title="${escapeHtml(safeMessage)}"
    >
      <img src="${lockStickerUrl}" alt="" aria-hidden="true" draggable="false">
    </span>
  `;
}

function bindInfiniteToggle(container, { buttonId, inputId, onChange } = {}) {
  const button = container.querySelector(`#${cssEscape(buttonId)}`);
  const input = container.querySelector(`#${cssEscape(inputId)}`);
  if (!button || !input) return;

  const applyState = (active) => {
    button.classList.toggle("is-active", !!active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
    input.disabled = !!active;
    input.closest(".tv-stepper")?.classList.toggle("is-disabled", !!active);
  };

  applyState(button.getAttribute("aria-pressed") === "true");

  button.addEventListener("click", () => {
    const nextActive = button.getAttribute("aria-pressed") !== "true";
    applyState(nextActive);
    onChange?.(nextActive);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function bindQuestionCountMode(container, { forceInfiniteQuestionCount = false, onChange } = {}) {
  const fixedButton = container.querySelector("#commonToolQuestionCountFixedMode");
  const unlimitedButton = container.querySelector("#commonToolQuestionCountUnlimited");
  const successGoalButton = container.querySelector("#commonToolQuestionCountSuccessGoal");
  const questionInput = container.querySelector("#commonToolQuestionCount");
  const fixedRow = container.querySelector("#commonToolQuestionFixedRow");
  const successGoalRow = container.querySelector("#commonToolSuccessGoalRow");

  if (!fixedButton || !unlimitedButton || !questionInput) return;

  const canShowSuccessGoalSettings = successGoalRow?.dataset.commonSuccessGoalAllowed !== "false";
  const buttons = [fixedButton, unlimitedButton, successGoalButton].filter(Boolean);

  const setMode = (mode, { notify = false } = {}) => {
    const safeMode = ["fixed", "unlimited", "successGoal"].includes(mode) ? mode : "fixed";
    const activeMode = forceInfiniteQuestionCount
      ? "unlimited"
      : safeMode === "successGoal" && !canShowSuccessGoalSettings
        ? "unlimited"
        : safeMode;

    buttons.forEach((button) => {
      const buttonMode = String(button.dataset.questionCountMode || "fixed");
      const selected = buttonMode === activeMode;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
      button.disabled = !!forceInfiniteQuestionCount;
      button.setAttribute("aria-disabled", forceInfiniteQuestionCount ? "true" : "false");
    });

    const row = fixedButton.closest(".cfg-common-flow-question-mode-row");
    row?.setAttribute("data-question-flow-mode", activeMode);

    if (fixedRow) {
      fixedRow.hidden = activeMode !== "fixed";
    }
    if (successGoalRow) {
      successGoalRow.hidden = !(canShowSuccessGoalSettings && activeMode === "successGoal" && !forceInfiniteQuestionCount);
    }

    setStepperDisabled(questionInput, activeMode !== "fixed" || forceInfiniteQuestionCount);

    if (notify) {
      onChange?.(activeMode);
    }
  };

  setMode(getActiveQuestionCountMode(container));

  fixedButton.addEventListener("click", () => {
    if (fixedButton.disabled) return;
    setMode("fixed", { notify: true });
  });

  unlimitedButton.addEventListener("click", () => {
    if (unlimitedButton.disabled) return;
    setMode("unlimited", { notify: true });
  });

  successGoalButton?.addEventListener("click", () => {
    if (successGoalButton.disabled) return;
    setMode("successGoal", { notify: true });
  });
}

function setStepperDisabled(input, disabled) {
  if (!input) return;

  input.disabled = !!disabled;
  const stepper = input.closest(".tv-stepper");
  stepper?.classList.toggle("is-disabled", !!disabled);
  const buttons = Array.from(stepper?.querySelectorAll(".tv-stepper-btn") || []);

  if (disabled) {
    buttons.forEach((button) => {
      button.disabled = true;
    });
    return;
  }

  const min = Number(input.getAttribute("min"));
  const max = Number(input.getAttribute("max"));
  const value = Number(input.value);
  const safeMin = Number.isFinite(min) ? min : Number.NEGATIVE_INFINITY;
  const safeMax = Number.isFinite(max) ? max : Number.POSITIVE_INFINITY;

  buttons.forEach((button) => {
    const direction = Number(button.dataset.stepperDirection) || 0;
    button.disabled = direction < 0
      ? value <= safeMin
      : value >= safeMax;
  });
}

function getActiveQuestionCountMode(container) {
  const selectedButton = container.querySelector?.(".cfg-common-flow-question-mode-btn.is-active");
  const selectedMode = String(selectedButton?.dataset?.questionCountMode || "");
  if (["fixed", "unlimited", "successGoal"].includes(selectedMode)) {
    return selectedMode;
  }

  if (container.querySelector?.("#commonToolQuestionCountSuccessGoal")?.getAttribute("aria-pressed") === "true") {
    return "successGoal";
  }
  if (container.querySelector?.("#commonToolQuestionCountUnlimited")?.getAttribute("aria-pressed") === "true") {
    return "unlimited";
  }
  return "fixed";
}

function isInfiniteToggleActive(container, buttonId) {
  return container.querySelector(`#${cssEscape(buttonId)}`)?.getAttribute("aria-pressed") === "true";
}

function cssEscape(value) {
  if (globalThis.CSS?.escape) {
    return globalThis.CSS.escape(String(value || ""));
  }
  return String(value || "").replace(/([^a-zA-Z0-9_-])/g, "\$1");
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
