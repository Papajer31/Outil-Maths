import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  renderRadioGroup,
  bindRadio,
  readRadio,
  clampInt,
  refreshStepper,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import {
  EXERCISE_TYPES,
  TARGETED_MAX_TARGET_VALUES,
  TARGETED_NUMBER_COUNT_VALUES,
  CLASSIC_MAX_TARGET_VALUES,
  CLASSIC_SPECIAL_NUMBER_OPTIONS,
  getDefaultSettings,
  normalizeSettings,
  normalizeMinSolutionsToFind,
  normalizeTargetedMaxTarget,
  normalizeTargetedNumberCount,
  normalizeClassicTargetMax,
  normalizeClassicSpecialNumbers,
  getTargetAbsoluteMax,
  hasEnoughDistinctValues,
  canGenerateQuestion
} from "./model.js";

let stylesInjected = false;

export function renderToolSettings(container, settings) {
  injectStyles();
  container.classList.add("nombre-cible-config-root");

  const cfg = normalizeSettings(settings);
  const tokenCfg = cfg.tokenBoxes;
  const targetedCfg = cfg.targetedCalculations;
  const classicCfg = cfg.classicChallenge;
  const targetAbsMax = getTargetAbsoluteMax(tokenCfg.boxCount);
  const exerciseType = cfg.exerciseType;

  container.innerHTML = renderToolSettingsStack(
    renderRadioGroup({
      title: "Type d’exercice",
      id: "nc_exerciseType",
      value: exerciseType,
      options: [
        { value: EXERCISE_TYPES.TOKEN_BOXES, label: "Boites à jetons" },
        { value: EXERCISE_TYPES.TARGETED_CALCULATIONS, label: "Calculs ciblés" },
        { value: EXERCISE_TYPES.CLASSIC_CHALLENGE, label: "Défi des 6 nombres" }
      ]
    }),

    exerciseType === EXERCISE_TYPES.TARGETED_CALCULATIONS
      ? renderTargetedCalculationsSettings(targetedCfg)
      : exerciseType === EXERCISE_TYPES.CLASSIC_CHALLENGE
        ? renderClassicChallengeSettings(classicCfg)
        : renderTokenBoxesSettings(tokenCfg, targetAbsMax)
  );

  bindRadio(container, "nc_exerciseType", {
    onChange: (value) => {
      renderToolSettings(container, {
        ...cfg,
        exerciseType: value
      });
    }
  });

  if (exerciseType === EXERCISE_TYPES.TARGETED_CALCULATIONS) {
    bindRadio(container, "nc_targeted_numberCount");
    bindRadio(container, "nc_targeted_targetMax");
    return;
  }

  if (exerciseType === EXERCISE_TYPES.CLASSIC_CHALLENGE) {
    bindRadio(container, "nc_classic_targetMax");
    return;
  }

  bindRadio(container, "nc_boxCount", { onChange: () => syncTargetBounds(container) });
  bindRadio(container, "nc_minSolutionsToFind");
  bindMinMax(container, "nc_values", { inputMin: 1, inputMax: 99 });
  bindMinMax(container, "nc_target", { inputMin: 1, inputMax: targetAbsMax });

  const syncInputs = () => syncTargetBounds(container);
  ["input", "change"].forEach((eventName) => {
    container.querySelector("#nc_values_min")?.addEventListener(eventName, syncInputs);
    container.querySelector("#nc_values_max")?.addEventListener(eventName, syncInputs);
    container.querySelector("#nc_target_min")?.addEventListener(eventName, syncInputs);
    container.querySelector("#nc_target_max")?.addEventListener(eventName, syncInputs);
  });

  syncTargetBounds(container);
}

function renderTokenBoxesSettings(tokenCfg, targetAbsMax) {
  return [
    renderRadioGroup({
      title: "Nombre de boites",
      id: "nc_boxCount",
      value: tokenCfg.boxCount,
      options: [
        { value: 3, label: "3 boites" },
        { value: 4, label: "4 boites" },
        { value: 5, label: "5 boites" },
        { value: 6, label: "6 boites" }
      ]
    }),

    renderRadioGroup({
      title: "Nombre minimal de solutions à trouver",
      id: "nc_minSolutionsToFind",
      value: tokenCfg.minSolutionsToFind,
      options: [
        { value: 1, label: "1" },
        { value: 2, label: "2" },
        { value: 3, label: "3" }
      ]
    }),

    renderMinMax({
      idPrefix: "nc_values",
      title: "Jetons dans les boites",
      minLabel: "Minimum",
      maxLabel: "Maximum",
      minValue: tokenCfg.boxValueMin,
      maxValue: tokenCfg.boxValueMax,
      inputMin: 1,
      inputMax: 99,
      step: 1
    }),

    renderMinMax({
      idPrefix: "nc_target",
      title: "Nombre cible",
      minLabel: "Minimum",
      maxLabel: "Maximum",
      minValue: tokenCfg.targetMin,
      maxValue: tokenCfg.targetMax,
      inputMin: 1,
      inputMax: targetAbsMax,
      step: 1
    })
  ];
}

function renderTargetedCalculationsSettings(targetedCfg) {
  return [
    renderRadioGroup({
      title: "Nombre de nombres",
      id: "nc_targeted_numberCount",
      value: targetedCfg.numberCount,
      options: TARGETED_NUMBER_COUNT_VALUES.map((value) => ({
        value,
        label: `${value} nombres`
      }))
    }),

    renderRadioGroup({
      title: "Limite maximale du nombre cible",
      id: "nc_targeted_targetMax",
      value: targetedCfg.targetMax,
      options: TARGETED_MAX_TARGET_VALUES.map((value) => ({
        value,
        label: String(value)
      }))
    })
  ];
}
function renderClassicChallengeSettings(classicCfg) {
  return [
    renderRadioGroup({
      title: "Limite maximale du nombre cible",
      id: "nc_classic_targetMax",
      value: classicCfg.targetMax,
      options: CLASSIC_MAX_TARGET_VALUES.map((value) => ({
        value,
        label: String(value)
      }))
    }),

    renderClassicSpecialNumbersCheckboxes(classicCfg.specialNumbers),

    renderClassicDivisionCheckbox(classicCfg.allowExactDivision)
  ];
}

function renderClassicSpecialNumbersCheckboxes(specialNumbers = {}) {
  const normalized = normalizeClassicSpecialNumbers(specialNumbers);
  const rows = CLASSIC_SPECIAL_NUMBER_OPTIONS.map((option) => {
    const id = `nc_classic_special_${option.id}`;
    return `
      <label class="tv-checkbox-row nc-special-option" for="${escapeAttr(id)}">
        <input
          class="tv-checkbox"
          type="checkbox"
          id="${escapeAttr(id)}"
          data-nc-classic-special="${escapeAttr(option.id)}"
          ${normalized[option.id] ? "checked" : ""}
        >
        <span>${escapeHtml(option.label)}</span>
      </label>
    `;
  }).join("");
  return `
    <section class="tv-group tv-group-inline">
      <div class="tv-radio-group tv-radio-group-inline nc-special-widget" data-widget="classic-special-numbers">
        <div class="tv-group-title tv-radio-group-title">Nombres spéciaux autorisés</div>
        <div class="tv-radio-options nc-special-options">${rows}</div>
      </div>
    </section>
  `;
}

function renderClassicDivisionCheckbox(allowExactDivision = false) {
  return `
    <section class="tv-group tv-group-inline">
      <div class="tv-radio-group tv-radio-group-inline nc-special-widget" data-widget="classic-division">
        <div class="tv-group-title tv-radio-group-title">Division exacte</div>
        <div class="tv-radio-options nc-special-options">
          <label class="tv-checkbox-row nc-special-option" for="nc_classic_allowExactDivision">
            <input
              class="tv-checkbox"
              type="checkbox"
              id="nc_classic_allowExactDivision"
              data-nc-classic-division="allowExactDivision"
              ${allowExactDivision ? "checked" : ""}
            >
            <span>Autoriser la division exacte</span>
          </label>
        </div>
      </div>
    </section>
  `;
}


function readClassicSpecialNumbers(container, previous = {}) {
  const fallback = normalizeClassicSpecialNumbers(previous);
  const next = { ...fallback };
  CLASSIC_SPECIAL_NUMBER_OPTIONS.forEach((option) => {
    const input = container.querySelector(`[data-nc-classic-special="${cssEscape(option.id)}"]`);
    next[option.id] = input ? Boolean(input.checked) : Boolean(fallback[option.id]);
  });
  return normalizeClassicSpecialNumbers(next);
}

export function readToolSettings(container, settings = {}) {
  const next = readToolSettingsLoose(container, settings);

  if (next.exerciseType === EXERCISE_TYPES.CLASSIC_CHALLENGE) {
    if (!canGenerateQuestion(next)) {
      throw new Error("Impossible de générer un défi des 6 nombres avec ces réglages.");
    }
    return next;
  }

  if (next.exerciseType === EXERCISE_TYPES.TARGETED_CALCULATIONS) {
    if (!canGenerateQuestion(next)) {
      throw new Error("Impossible de générer un calcul ciblé avec ces réglages.");
    }
    return next;
  }

  if (!hasEnoughDistinctValues(next)) {
    throw new Error(`Il faut au moins ${next.tokenBoxes.boxCount} valeurs distinctes pour ${next.tokenBoxes.boxCount} boites.`);
  }

  if (!canGenerateQuestion(next)) {
    throw new Error("Impossible de générer une question avec exactement 3 solutions dans ces bornes.");
  }

  return next;
}

function readToolSettingsLoose(container, settings = {}) {
  const previous = normalizeSettings(settings);
  const exerciseType = readRadio(container, "nc_exerciseType", previous.exerciseType);

  if (exerciseType === EXERCISE_TYPES.TARGETED_CALCULATIONS) {
    return normalizeSettings({
      ...previous,
      exerciseType,
      targetedCalculations: {
        ...previous.targetedCalculations,
        numberCount: normalizeTargetedNumberCount(readRadio(container, "nc_targeted_numberCount", previous.targetedCalculations.numberCount)),
        targetMax: normalizeTargetedMaxTarget(readRadio(container, "nc_targeted_targetMax", previous.targetedCalculations.targetMax))
      }
    });
  }

  if (exerciseType === EXERCISE_TYPES.CLASSIC_CHALLENGE) {
    return normalizeSettings({
      ...previous,
      exerciseType,
      classicChallenge: {
        ...previous.classicChallenge,
        targetMax: normalizeClassicTargetMax(readRadio(container, "nc_classic_targetMax", previous.classicChallenge.targetMax)),
        allowExactDivision: Boolean(container.querySelector("#nc_classic_allowExactDivision")?.checked),
        specialNumbers: readClassicSpecialNumbers(container, previous.classicChallenge.specialNumbers)
      }
    });
  }

  const boxCount = readRadio(container, "nc_boxCount", previous.tokenBoxes.boxCount);
  const minSolutionsToFind = readRadio(container, "nc_minSolutionsToFind", previous.tokenBoxes.minSolutionsToFind);

  const values = readMinMax(container, "nc_values", {
    inputMin: 1,
    inputMax: 99,
    errorLabel: "Les bornes des jetons dans les boites"
  });

  const targetAbsMax = getTargetAbsoluteMax(boxCount);
  const target = readMinMax(container, "nc_target", {
    inputMin: 1,
    inputMax: targetAbsMax,
    errorLabel: "Les bornes du nombre cible"
  });

  return normalizeSettings({
    ...previous,
    exerciseType,
    tokenBoxes: {
      ...previous.tokenBoxes,
      boxCount,
      boxValueMin: values.min,
      boxValueMax: values.max,
      targetMin: target.min,
      targetMax: target.max,
      minSolutionsToFind
    }
  });
}

export { getDefaultSettings };

function syncTargetBounds(container) {
  const boxCount = clampInt(readRadio(container, "nc_boxCount", 5), 3, 6);
  const targetAbsMax = getTargetAbsoluteMax(boxCount);
  const targetMinEl = container.querySelector("#nc_target_min");
  const targetMaxEl = container.querySelector("#nc_target_max");
  if (!targetMinEl || !targetMaxEl) return;

  targetMinEl.max = String(targetAbsMax);
  targetMaxEl.max = String(targetAbsMax);
  targetMinEl.value = String(clampInt(targetMinEl.value, 1, targetAbsMax));
  targetMaxEl.value = String(clampInt(targetMaxEl.value, 1, targetAbsMax));

  if (Number(targetMinEl.value) > Number(targetMaxEl.value)) {
    targetMinEl.value = targetMaxEl.value;
  }

  refreshStepper(container, "nc_target_min", { inputMin: 1, inputMax: targetAbsMax });
  refreshStepper(container, "nc_target_max", { inputMin: 1, inputMax: targetAbsMax });
  normalizeMinSolutionsToFind(readRadio(container, "nc_minSolutionsToFind", 3));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\function injectStyles() {");
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-nombre-cible-config-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.nombreCibleConfigStyle = href;
  document.head.appendChild(link);
}
