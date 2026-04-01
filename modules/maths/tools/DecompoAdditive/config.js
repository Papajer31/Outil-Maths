import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  renderSection,
  renderCheckbox,
  readCheckbox,
  clampInt,
  renderToolSettingsStack,
  refreshStepper
} from "../../../../shared/config-widgets.js";
import {
  getDefaultSettings,
  normalizeSettings,
  buildQuestionPool
} from "./model.js";

export function renderToolSettings(container, settings) {
  const cfg = normalizeSettings(settings);

  container.innerHTML = renderToolSettingsStack(
    renderMinMax({
      idPrefix: "da_top",
      title: "Nombres à décomposer",
      minLabel: "Minimum",
      maxLabel: "Maximum",
      minValue: cfg.minTop,
      maxValue: cfg.maxTop,
      inputMin: 1,
      inputMax: 99,
      step: 1,
      mode: cfg.topMode,
      startValue: cfg.topStart,
      stepValue: cfg.topStep,
      values: cfg.topList
    }),

    renderSection("Options", `
      <div class="tv-stack">
        ${renderCheckbox({
          id: "da_allowZero",
          label: "Autoriser 0 dans la décomposition",
          checked: cfg.allowZero
        })}

        ${renderCheckbox({
          id: "da_includeSymmetricPairs",
          label: "Autoriser les paires symétriques (ex. 2 + 3 et 3 + 2)",
          checked: cfg.includeSymmetricPairs
        })}
      </div>
    `)
  );

  bindMinMax(container, "da_top", {
    inputMin: 1,
    inputMax: 99
  });

  const minEl = container.querySelector("#da_top_min");
  const maxEl = container.querySelector("#da_top_max");
  const startEl = container.querySelector("#da_top_start");
  const allowZeroEl = container.querySelector("#da_allowZero");

  const syncSpecific = () => {
    [minEl, maxEl, startEl].forEach((el) => {
      if (!el) return;
      el.value = String(clampInt(el.value, 1, 99));
    });

    if (Number(minEl?.value) > Number(maxEl?.value)) {
      minEl.value = maxEl.value;
    }

    if (!allowZeroEl.checked && Number(maxEl?.value) < 2) {
      maxEl.value = "2";
      if (Number(minEl?.value) > 2) {
        minEl.value = "2";
      }
      if (Number(startEl?.value) < 2) {
        startEl.value = "2";
      }
    }

    refreshStepper(container, "da_top_min", { inputMin: 1, inputMax: 99 });
    refreshStepper(container, "da_top_max", { inputMin: 1, inputMax: 99 });
    refreshStepper(container, "da_top_start", { inputMin: 1, inputMax: 99 });
  };

  minEl?.addEventListener("input", syncSpecific);
  maxEl?.addEventListener("input", syncSpecific);
  startEl?.addEventListener("input", syncSpecific);
  minEl?.addEventListener("change", syncSpecific);
  maxEl?.addEventListener("change", syncSpecific);
  startEl?.addEventListener("change", syncSpecific);
  allowZeroEl?.addEventListener("change", syncSpecific);

  syncSpecific();
}

export function readToolSettings(container) {
  const topRange = readMinMax(container, "da_top", {
    inputMin: 1,
    inputMax: 99,
    errorLabel: "Les bornes des nombres à décomposer"
  });

  const allowZero = readCheckbox(container, "da_allowZero");
  const includeSymmetricPairs = readCheckbox(container, "da_includeSymmetricPairs");

  if (!allowZero && topRange.mode !== "list" && topRange.max < 2) {
    throw new Error("Avec 0 interdit, le maximum doit être au moins 2.");
  }

  const settings = {
    minTop: topRange.min,
    maxTop: topRange.max,
    topMode: topRange.mode,
    topStart: topRange.start,
    topStep: topRange.step,
    topList: topRange.values,
    allowZero,
    includeSymmetricPairs
  };

  if (buildQuestionPool(settings).length === 0) {
    throw new Error("Cette configuration ne produit aucune décomposition possible.");
  }

  return settings;
}

export { getDefaultSettings };
