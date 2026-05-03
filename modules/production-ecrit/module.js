import { createModuleRuntime } from "../../shared/module-factory.js";

export function createProductionEcritModuleRuntime() {
  return createModuleRuntime({
    moduleKey: "production-ecrit",
    manifestUrl: new URL("./manifest.json", import.meta.url)
  });
}

export default createProductionEcritModuleRuntime;

/*

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
          step: TOOL_LIMITS.questionCount.step,
          actionButtonHtml: renderInfiniteToggleButton({
            id: "moduleToolQuestionCountInfinite",
            label: "Nombre de questions illimité",
            active: safeDraft.infiniteQuestionCount
          })
        })}

        ${renderStepperField({
          id: "moduleToolTimePerQ",
          label: "Temps par question",
          value: safeDraft.timePerQ,
          inputMin: TOOL_LIMITS.timePerQ.min,
          inputMax: TOOL_LIMITS.timePerQ.max,
          step: TOOL_LIMITS.timePerQ.step,
          actionButtonHtml: renderInfiniteToggleButton({
            id: "moduleToolTimePerQInfinite",
            label: "Temps par question illimité",
            active: safeDraft.infiniteTimePerQ
          })
        })}

        ${renderStepperField({
          id: "moduleToolAnswerTime",
          label: "Temps d’affichage réponse",
          value: safeDraft.answerTime,
          inputMin: TOOL_LIMITS.answerTime.min,
          inputMax: TOOL_LIMITS.answerTime.max,
          step: TOOL_LIMITS.answerTime.step,
          actionButtonHtml: renderInfiniteToggleButton({
            id: "moduleToolAnswerTimeInfinite",
            label: "Temps d’affichage réponse illimité",
            active: safeDraft.infiniteAnswerTime
          })
        })}
      </div>
    </div>
  `;
}

function bindCommonToolSettings(container, { onDirty, onAnswerInfiniteActivated } = {}) {
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

  bindInfiniteToggle(container, {
    buttonId: "moduleToolQuestionCountInfinite",
    inputId: "moduleToolQuestionCount",
    onChange: () => onDirty?.()
  });

  bindInfiniteToggle(container, {
    buttonId: "moduleToolTimePerQInfinite",
    inputId: "moduleToolTimePerQ",
    onChange: () => onDirty?.()
  });

  bindInfiniteToggle(container, {
    buttonId: "moduleToolAnswerTimeInfinite",
    inputId: "moduleToolAnswerTime",
    onChange: (active) => {
      if (active) {
        onAnswerInfiniteActivated?.();
      }
      onDirty?.();
    }
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

  nextDraft.infiniteQuestionCount = isInfiniteToggleActive(container, "moduleToolQuestionCountInfinite");
  nextDraft.infiniteTimePerQ = isInfiniteToggleActive(container, "moduleToolTimePerQInfinite");
  nextDraft.infiniteAnswerTime = isInfiniteToggleActive(container, "moduleToolAnswerTimeInfinite");
  nextDraft.enabled = true;
  return nextDraft;
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

function isInfiniteToggleActive(container, buttonId) {
  return container.querySelector(`#${cssEscape(buttonId)}`)?.getAttribute("aria-pressed") === "true";
}

function cssEscape(value) {
  if (globalThis.CSS?.escape) {
    return globalThis.CSS.escape(String(value || ""));
  }
  return String(value || "").replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
*/
