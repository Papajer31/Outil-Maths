import { bindStepperField, renderStepperField } from "../../../shared/config-widgets.js";

export const DEFAULT_SUCCESS_EXECUTION = Object.freeze({
  correctCount:10,
  milestones:3,
  maxTimeSec:300
});

export function normalizeSuccessExecutionConfig(value = {}, fallback = DEFAULT_SUCCESS_EXECUTION) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const correctCount = clampInt(raw.correctCount ?? raw.correct_count ?? raw.value, 1, 999, fallback.correctCount);
  const milestones = clampInt(raw.milestones ?? raw.safetyMilestones ?? raw.safety_milestones, 0, 12, fallback.milestones);
  const maxTimeSec = clampInt(raw.maxTimeSec ?? raw.max_time_sec ?? raw.seconds, 60, 7200, fallback.maxTimeSec);
  return { correctCount, milestones, maxTimeSec };
}

export function executionLimitConfigToDb(value = {}) {
  const safe = normalizeSuccessExecutionConfig(value);
  return {
    milestones:safe.milestones,
    max_time_sec:safe.maxTimeSec
  };
}

export function renderSuccessExecutionPopover({ idPrefix, value = {}, className = "" } = {}) {
  const safePrefix = String(idPrefix || "successExecution").replace(/[^a-zA-Z0-9_-]+/g, "-");
  const safe = normalizeSuccessExecutionConfig(value);
  return `
    <details class="execution-success-popover ${className}" data-success-execution-popover>
      <summary class="tv-stepper-btn execution-success-popover-trigger" aria-label="Réglages de réussite" title="Réglages de réussite">
        <span class="execution-success-popover-dots" aria-hidden="true">...</span>
      </summary>
      <div class="execution-success-popover-panel" role="group" aria-label="Réglages de réussite">
        <div class="execution-success-popover-title">Réglages de réussite</div>
        ${renderStepperField({
          id:`${safePrefix}CorrectCount`,
          label:"Réussites nécessaires",
          value:safe.correctCount,
          inputMin:1,
          inputMax:999,
          step:1,
          fieldClassName:"execution-success-stepper"
        })}
        ${renderStepperField({
          id:`${safePrefix}Milestones`,
          label:"Paliers de sécurité",
          value:safe.milestones,
          inputMin:0,
          inputMax:12,
          step:1,
          fieldClassName:"execution-success-stepper"
        })}
        ${renderStepperField({
          id:`${safePrefix}MaxTime`,
          label:"Temps maximum (min)",
          value:Math.max(1, Math.round(safe.maxTimeSec / 60)),
          inputMin:1,
          inputMax:120,
          step:1,
          fieldClassName:"execution-success-stepper"
        })}
      </div>
    </details>
  `;
}

export function bindSuccessExecutionPopover(root, idPrefix, { value = {}, onChange } = {}) {
  if (!root) return;
  const safePrefix = String(idPrefix || "successExecution").replace(/[^a-zA-Z0-9_-]+/g, "-");
  let current = normalizeSuccessExecutionConfig(value);
  bindSuccessExecutionPopoverPlacement(root);
  const emit = (patch) => {
    current = normalizeSuccessExecutionConfig({ ...current, ...patch });
    onChange?.({ ...current });
  };

  bindStepperField(root, `${safePrefix}CorrectCount`, {
    inputMin:1,
    inputMax:999,
    onChange:(raw) => emit({ correctCount:raw })
  });
  bindStepperField(root, `${safePrefix}Milestones`, {
    inputMin:0,
    inputMax:12,
    onChange:(raw) => emit({ milestones:raw })
  });
  bindStepperField(root, `${safePrefix}MaxTime`, {
    inputMin:1,
    inputMax:120,
    onChange:(raw) => emit({ maxTimeSec:raw * 60 })
  });
}

function bindSuccessExecutionPopoverPlacement(root) {
  const popover = root.querySelector?.("[data-success-execution-popover]");
  const trigger = popover?.querySelector?.(".execution-success-popover-trigger");
  const panel = popover?.querySelector?.(".execution-success-popover-panel");
  if (!popover || !trigger || !panel || popover.dataset.successExecutionPlacementBound === "true") return;

  popover.dataset.successExecutionPlacementBound = "true";
  popover.addEventListener("toggle", () => {
    if (!popover.open) {
      delete popover.dataset.popoverPlacement;
      return;
    }

    window.requestAnimationFrame(() => {
      if (!popover.open) return;

      const triggerRect = trigger.getBoundingClientRect();
      const panelHeight = panel.getBoundingClientRect().height;
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const viewportMargin = 16;
      const spaceAbove = Math.max(0, triggerRect.top - viewportMargin);
      const spaceBelow = Math.max(0, viewportHeight - triggerRect.bottom - viewportMargin);

      popover.dataset.popoverPlacement = panelHeight > spaceBelow && spaceAbove > spaceBelow
        ? "above"
        : "below";
    });
  });
}

function clampInt(value, min, max, fallback) {
  const parsed = Math.trunc(Number(value));
  const fallbackParsed = Math.trunc(Number(fallback));
  const safe = Number.isFinite(parsed) ? parsed : (Number.isFinite(fallbackParsed) ? fallbackParsed : min);
  return Math.max(min, Math.min(max, safe));
}
