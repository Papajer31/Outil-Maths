import { scheduleCalcLayoutFit } from "../../tool-ui/calc-layout-fit.js";
import { bindNumericKeypadEvents, renderNumericKeypad } from "../../tool-ui/numeric-keypad.js";

const DEFAULT_SECOND_LINE_DIGIT_THRESHOLD = 8;
const DEFAULT_MIN_SCALE = 0.32;

let stylesInjected = false;

/**
 * Layout commun de la famille Calcul.
 *
 * Ce module ne connaît pas la génération des questions ni la correction : il
 * fournit seulement l'enveloppe DOM, le clavier numérique commun et les règles
 * de densité/fit utilisées par addition, soustraction, multiplication, etc.
 */
export function ensureCalcFamilyLayoutStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const href = new URL("./calc-family-layout.css", import.meta.url).href;
  if (document.querySelector(`link[data-calc-family-layout-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.calcFamilyLayoutStyle = href;
  document.head.appendChild(link);
}

export function renderCalcFamilyShell({
  showResponseBox = true,
  instructionHtml = "",
  expressionId,
  responseWrapId,
  keypadSlotId,
  rootClassName = "",
  modeClassName = "",
  stageClassName = "",
  equationClassName = "",
  expressionClassName = "",
  equalsClassName = "",
  responseWrapClassName = "",
  keypadSlotClassName = "",
  keypadRootClassName = "",
  keypadButtonClassName = "",
  keypadClearButtonClassName = "",
  keypadDataAttribute = "data-calc-family-numeric-key",
  keypadAriaLabel = "Clavier numérique"
} = {}) {
  const rootModeClass = showResponseBox ? "calc-family-root--boxed" : "calc-family-root--free";
  const legacyModeClass = normalizeClassName(modeClassName);

  return `
    <div class="tool-runtime calc-family-root ${rootModeClass} ${legacyModeClass} ${normalizeClassName(rootClassName)}">
      ${instructionHtml}
      <div class="tool-stage calc-family-stage ${normalizeClassName(stageClassName)}">
        <div class="tool-answer-row calc-family-equation ${normalizeClassName(equationClassName)}">
          <div class="tool-big tool-question calc-family-expression ${normalizeClassName(expressionClassName)}" id="${escapeAttribute(expressionId)}"></div>
          ${showResponseBox ? `
            <div class="tool-big calc-family-equals ${normalizeClassName(equalsClassName)}">=</div>
            <div class="tool-answer-panel calc-family-response-wrap ${normalizeClassName(responseWrapClassName)}" id="${escapeAttribute(responseWrapId)}"></div>
          ` : ""}
        </div>
      </div>
      ${showResponseBox ? `
        <div class="calc-family-keypad-slot ${normalizeClassName(keypadSlotClassName)}" id="${escapeAttribute(keypadSlotId)}">
          ${renderNumericKeypad({
            rootClassName: normalizeClassName(`calc-family-keypad ${keypadRootClassName}`),
            buttonClassName: normalizeClassName(`calc-family-keypad-button ${keypadButtonClassName}`),
            clearButtonClassName: normalizeClassName(`calc-family-keypad-button--clear ${keypadClearButtonClassName}`),
            dataAttribute: keypadDataAttribute,
            ariaLabel: keypadAriaLabel
          })}
        </div>
      ` : ""}
    </div>
  `;
}


/**
 * Variante du shell commun pour les opérations dont la boîte-réponse remplace
 * un nombre à l'intérieur même de l'expression (outils « à trous »).
 *
 * Le moteur métier reste extérieur : ce shell fournit seulement les zones
 * stables, le clavier commun et les classes nécessaires au responsive.
 */
export function renderCalcFamilyInlineShell({
  showResponseBox = true,
  instructionHtml = "",
  stageId,
  equationId,
  freeExpressionId,
  keypadSlotId,
  rootClassName = "",
  stageClassName = "",
  equationClassName = "",
  freeExpressionClassName = "",
  keypadSlotClassName = "",
  keypadRootClassName = "",
  keypadButtonClassName = "",
  keypadClearButtonClassName = "",
  keypadDataAttribute = "data-calc-family-numeric-key",
  keypadAriaLabel = "Clavier numérique"
} = {}) {
  const rootModeClass = showResponseBox ? "calc-family-root--boxed" : "calc-family-root--free";
  const inlineStageModeClass = showResponseBox
    ? "calc-family-stage--inline-boxed"
    : "calc-family-stage--inline-free";

  return `
    <div class="tool-runtime calc-family-root calc-family-root--inline ${rootModeClass} ${normalizeClassName(rootClassName)}">
      ${instructionHtml}
      <div class="tool-stage calc-family-stage calc-family-stage--inline ${inlineStageModeClass} ${normalizeClassName(stageClassName)}" id="${escapeAttribute(stageId)}">
        ${showResponseBox
          ? `<div class="tool-answer-row calc-family-equation calc-family-equation--inline ${normalizeClassName(equationClassName)}" id="${escapeAttribute(equationId)}"></div>`
          : `<div class="tool-big calc-family-expression calc-family-free-equation ${normalizeClassName(freeExpressionClassName)}" id="${escapeAttribute(freeExpressionId)}"></div>`
        }
      </div>
      ${showResponseBox ? `
        <div class="calc-family-keypad-slot ${normalizeClassName(keypadSlotClassName)}" id="${escapeAttribute(keypadSlotId)}">
          ${renderNumericKeypad({
            rootClassName: normalizeClassName(`calc-family-keypad ${keypadRootClassName}`),
            buttonClassName: normalizeClassName(`calc-family-keypad-button ${keypadButtonClassName}`),
            clearButtonClassName: normalizeClassName(`calc-family-keypad-button--clear ${keypadClearButtonClassName}`),
            dataAttribute: keypadDataAttribute,
            ariaLabel: keypadAriaLabel
          })}
        </div>
      ` : ""}
    </div>
  `;
}

export function getCalcFamilyShellRefs(container, {
  expressionId,
  instructionId,
  stageId,
  equationId,
  responseWrapId,
  keypadSlotId
} = {}) {
  return {
    root: container?.querySelector?.(".calc-family-root") ?? null,
    instructionEl: instructionId ? container?.querySelector?.(`#${cssEscape(instructionId)}`) ?? null : null,
    stageEl: stageId ? container?.querySelector?.(`#${cssEscape(stageId)}`) ?? null : null,
    equationEl: equationId ? container?.querySelector?.(`#${cssEscape(equationId)}`) ?? null : null,
    exprEl: expressionId ? container?.querySelector?.(`#${cssEscape(expressionId)}`) ?? null : null,
    responseWrap: responseWrapId ? container?.querySelector?.(`#${cssEscape(responseWrapId)}`) ?? null : null,
    keypadSlot: keypadSlotId ? container?.querySelector?.(`#${cssEscape(keypadSlotId)}`) ?? null : null
  };
}

export function bindCalcFamilyKeypadEvents({
  state,
  dataAttribute = "data-calc-family-numeric-key",
  onAfterInput
} = {}) {
  teardownCalcFamilyKeypadBindings(state);
  if (!state?.keypadSlot || !state?.answerControl || state.answerRevealed) return;

  const abortController = new AbortController();
  state.keypadAbortController = abortController;

  bindNumericKeypadEvents({
    root: state.keypadSlot,
    control: state.answerControl,
    signal: abortController.signal,
    dataAttribute,
    onAfterInput
  });
}

export function teardownCalcFamilyKeypadBindings(state) {
  state?.keypadAbortController?.abort?.();
  if (state) state.keypadAbortController = null;
}

export function syncCalcFamilyKeypadVisibility(state, {
  hiddenClassName = ""
} = {}) {
  if (!state?.keypadSlot) return;
  const hidden = !state.showResponseBox || state.answerRevealed || !state.answerControl;
  state.keypadSlot.classList.toggle("calc-family-keypad-slot--hidden", hidden);
  if (hiddenClassName) state.keypadSlot.classList.toggle(hiddenClassName, hidden);
  state.keypadSlot.setAttribute("aria-hidden", hidden ? "true" : "false");
}

export function syncCalcFamilyResponsiveState({
  root,
  equationEl,
  expressionEl,
  equalsEl,
  responseWrapEl,
  showResponseBox = true,
  digitCount = 0,
  lineLength = 0,
  secondLineLength = lineLength,
  secondLineDigitThreshold = DEFAULT_SECOND_LINE_DIGIT_THRESHOLD,
  minScale = DEFAULT_MIN_SCALE
} = {}) {
  if (!root || !equationEl || !expressionEl) return false;

  const safeDigitCount = Math.max(0, Number(digitCount) || 0);
  const answerSecondLine = Boolean(showResponseBox) && safeDigitCount > secondLineDigitThreshold;
  const length = answerSecondLine ? Number(secondLineLength) || 0 : Number(lineLength) || 0;

  root.classList.toggle("calc-runtime--answer-second-line", answerSecondLine);
  root.classList.toggle("calc-runtime--single-line-answer", Boolean(showResponseBox) && !answerSecondLine);
  root.classList.toggle("calc-runtime--ultra-dense", length >= 34 || safeDigitCount >= 16);
  root.classList.toggle("calc-runtime--dense", (length >= 26 || safeDigitCount >= 12) && !(length >= 34 || safeDigitCount >= 16));
  root.classList.toggle("calc-runtime--compact", (length >= 18 || safeDigitCount >= 9) && !(length >= 26 || safeDigitCount >= 12));

  scheduleCalcLayoutFit({
    root,
    equationEl,
    expressionEl,
    equalsEl,
    responseWrapEl,
    answerSecondLine,
    minScale
  });

  return answerSecondLine;
}


/**
 * Responsive des opérations à trou. La boîte reste toujours dans la ligne :
 * on conserve donc les seuils historiques de cette famille, puis le fit commun
 * intervient uniquement si la largeur mesurée l'exige réellement.
 */
export function syncCalcFamilyInlineResponsiveState({
  root,
  equationEl,
  lineLength = 0,
  minScale = DEFAULT_MIN_SCALE
} = {}) {
  if (!root || !equationEl) return;

  const length = Math.max(0, Number(lineLength) || 0);
  root.classList.remove("calc-runtime--answer-second-line", "calc-runtime--single-line-answer");
  root.classList.toggle("calc-runtime--ultra-dense", false);
  root.classList.toggle("calc-runtime--dense", length >= 30);
  root.classList.toggle("calc-runtime--compact", length >= 22 && length < 30);

  scheduleCalcLayoutFit({
    root,
    equationEl,
    expressionEl: equationEl,
    equalsEl: null,
    responseWrapEl: null,
    answerSecondLine: false,
    minScale
  });
}

export function getCalculationDigitCount(question, keys = ["terms", "term1", "term2", "factor1", "factor2"]) {
  if (!question) return 0;

  if (keys.includes("terms") && Array.isArray(question.terms)) {
    return question.terms.reduce((total, value) => total + countIntegerDigitsForLayout(value), 0);
  }

  return keys
    .filter((key) => key !== "terms")
    .reduce((total, key) => total + countIntegerDigitsForLayout(question[key]), 0);
}

export function countIntegerDigitsForLayout(value) {
  const digits = String(Math.abs(Math.trunc(Number(value) || 0))).replace(/\D+/g, "");
  return Math.max(1, digits.length);
}

export function getNumericAnswerMaxLength(value) {
  const digitCount = String(value ?? "").replace(/\D+/g, "").length;
  return Math.max(1, digitCount);
}

export function estimateBoxedCalculationLineLength({
  questionText = "",
  answerMaxLength = 1,
  answerExtraChars = 2,
  minAnswerChars = 4
} = {}) {
  const answerChars = Math.max(minAnswerChars, (Number(answerMaxLength) || 0) + answerExtraChars);
  return `${questionText} = `.length + answerChars;
}

function normalizeClassName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function escapeAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function cssEscape(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(String(value));
  }
  return String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
