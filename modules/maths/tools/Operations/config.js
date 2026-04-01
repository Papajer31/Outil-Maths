import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  renderRadioGroup,
  bindRadio,
  readRadio,
  renderToolSettingsStack,
  setMinMaxBounds
} from "../../../../shared/config-widgets.js";
import {
  OPERATION_TYPES,
  CARRY_MODES,
  getDefaultSettings,
  getPossibleResultBounds,
  hasAtLeastOnePossibleOperation,
  getImpossibleMessage
} from "./model.js";

const GLOBAL_MAX = 999;

export function renderToolSettings(container, settings) {
  const cfg = { ...getDefaultSettings(), ...(settings ?? {}) };

  container.innerHTML = renderToolSettingsStack(
    renderRadioGroup({
      title: "Opérations",
      id: "op_operation",
      value: cfg.operation,
      options: [
        { value: OPERATION_TYPES.ADDITION, label: "Additions" },
        { value: OPERATION_TYPES.SUBTRACTION, label: "Soustractions" },
        { value: OPERATION_TYPES.MULTIPLICATION, label: "Multiplications" },
        { value: OPERATION_TYPES.DIVISION, label: "Divisions" }
      ]
    }),

    `
      <div id="op_carry_wrap" ${needsCarryMode(cfg.operation) ? "" : "hidden"}>
        ${renderRadioGroup({
          title: "Retenues",
          id: "op_carryMode",
          value: cfg.carryMode,
          options: [
            { value: CARRY_MODES.WITHOUT, label: "Sans retenues" },
            { value: CARRY_MODES.WITH, label: "Avec retenues" },
            { value: CARRY_MODES.BOTH, label: "Les deux" }
          ]
        })}
      </div>
    `,

    renderMinMax({
      idPrefix: "op_n1",
      title: "Premier terme",
      minValue: cfg.n1Min,
      maxValue: cfg.n1Max,
      inputMin: 0,
      inputMax: GLOBAL_MAX,
      step: 1,
      mode: cfg.n1Mode,
      startValue: cfg.n1Start,
      stepValue: cfg.n1Step,
      values: cfg.n1List
    }),

    renderMinMax({
      idPrefix: "op_n2",
      title: "Deuxième terme",
      minValue: cfg.n2Min,
      maxValue: cfg.n2Max,
      inputMin: cfg.operation === OPERATION_TYPES.DIVISION ? 1 : 0,
      inputMax: GLOBAL_MAX,
      step: 1,
      mode: cfg.n2Mode,
      startValue: cfg.n2Start,
      stepValue: cfg.n2Step,
      values: cfg.n2List
    }),

    renderMinMax({
      idPrefix: "op_result",
      title: "Résultat",
      minValue: cfg.resultMin,
      maxValue: cfg.resultMax,
      inputMin: 0,
      inputMax: GLOBAL_MAX,
      step: 1,
      mode: cfg.resultMode,
      startValue: cfg.resultStart,
      stepValue: cfg.resultStep,
      values: cfg.resultList
    })
  );

  bindRadio(container, "op_operation", {
    onChange: () => syncUi(container)
  });
  bindRadio(container, "op_carryMode", {
    onChange: () => syncResultBounds(container)
  });

  bindMinMax(container, "op_n1", { inputMin: 0, inputMax: GLOBAL_MAX });
  bindMinMax(container, "op_n2", {
    inputMin: cfg.operation === OPERATION_TYPES.DIVISION ? 1 : 0,
    inputMax: GLOBAL_MAX
  });
  bindMinMax(container, "op_result", { inputMin: 0, inputMax: GLOBAL_MAX });

  const n1Root = container.querySelector('[data-tv-minmax="op_n1"]');
  const n2Root = container.querySelector('[data-tv-minmax="op_n2"]');
  [n1Root, n2Root].forEach((root) => {
    root?.addEventListener("input", () => syncResultBounds(container));
    root?.addEventListener("change", () => syncResultBounds(container));
  });

  syncUi(container);
}

export function readToolSettings(container) {
  const operation = readRadio(container, "op_operation", OPERATION_TYPES.ADDITION);
  const carryMode = readRadio(container, "op_carryMode", CARRY_MODES.WITHOUT);
  const n2InputMin = operation === OPERATION_TYPES.DIVISION ? 1 : 0;

  const n1Range = readMinMax(container, "op_n1", {
    inputMin: 0,
    inputMax: GLOBAL_MAX,
    errorLabel: "Les bornes du premier terme"
  });

  const n2Range = readMinMax(container, "op_n2", {
    inputMin: n2InputMin,
    inputMax: GLOBAL_MAX,
    errorLabel: "Les bornes du deuxième terme"
  });

  const resultBounds = getPossibleResultBounds({
    operation,
    carryMode,
    n1Min: n1Range.min,
    n1Max: n1Range.max,
    n1Mode: n1Range.mode,
    n1Start: n1Range.start,
    n1Step: n1Range.step,
    n1List: n1Range.values,
    n2Min: n2Range.min,
    n2Max: n2Range.max,
    n2Mode: n2Range.mode,
    n2Start: n2Range.start,
    n2Step: n2Range.step,
    n2List: n2Range.values
  });

  const resultRange = readMinMax(container, "op_result", {
    inputMin: resultBounds?.min ?? 0,
    inputMax: resultBounds?.max ?? GLOBAL_MAX,
    errorLabel: "Les bornes du résultat"
  });

  const settings = {
    operation,
    carryMode,
    n1Min: n1Range.min,
    n1Max: n1Range.max,
    n1Mode: n1Range.mode,
    n1Start: n1Range.start,
    n1Step: n1Range.step,
    n1List: n1Range.values,
    n2Min: n2Range.min,
    n2Max: n2Range.max,
    n2Mode: n2Range.mode,
    n2Start: n2Range.start,
    n2Step: n2Range.step,
    n2List: n2Range.values,
    resultMin: resultRange.min,
    resultMax: resultRange.max,
    resultMode: resultRange.mode,
    resultStart: resultRange.start,
    resultStep: resultRange.step,
    resultList: resultRange.values
  };

  if (!hasAtLeastOnePossibleOperation(settings)) {
    throw new Error(getImpossibleMessage(settings));
  }

  return settings;
}

export { getDefaultSettings };

function syncUi(container) {
  const operation = readRadio(container, "op_operation", OPERATION_TYPES.ADDITION);
  const carryWrap = container.querySelector("#op_carry_wrap");
  if (carryWrap) {
    carryWrap.hidden = !needsCarryMode(operation);
  }

  setMinMaxBounds(container, "op_n2", {
    inputMin: operation === OPERATION_TYPES.DIVISION ? 1 : 0,
    inputMax: GLOBAL_MAX
  });

  syncResultBounds(container);
}

function syncResultBounds(container) {
  try {
    const operation = readRadio(container, "op_operation", OPERATION_TYPES.ADDITION);
    const carryMode = readRadio(container, "op_carryMode", CARRY_MODES.WITHOUT);
    const n2InputMin = operation === OPERATION_TYPES.DIVISION ? 1 : 0;

    const n1Range = readMinMax(container, "op_n1", {
      inputMin: 0,
      inputMax: GLOBAL_MAX,
      errorLabel: "Les bornes du premier terme"
    });

    const n2Range = readMinMax(container, "op_n2", {
      inputMin: n2InputMin,
      inputMax: GLOBAL_MAX,
      errorLabel: "Les bornes du deuxième terme"
    });

    const resultBounds = getPossibleResultBounds({
      operation,
      carryMode,
      n1Min: n1Range.min,
      n1Max: n1Range.max,
      n1Mode: n1Range.mode,
      n1Start: n1Range.start,
      n1Step: n1Range.step,
      n1List: n1Range.values,
      n2Min: n2Range.min,
      n2Max: n2Range.max,
      n2Mode: n2Range.mode,
      n2Start: n2Range.start,
      n2Step: n2Range.step,
      n2List: n2Range.values
    });

    setMinMaxBounds(container, "op_result", {
      inputMin: resultBounds?.min ?? 0,
      inputMax: resultBounds?.max ?? GLOBAL_MAX
    });
  } catch {
    setMinMaxBounds(container, "op_result", {
      inputMin: 0,
      inputMax: GLOBAL_MAX
    });
  }
}

function needsCarryMode(operation) {
  return operation === OPERATION_TYPES.ADDITION || operation === OPERATION_TYPES.SUBTRACTION;
}
