import {
  normalizeSettings,
  pickQuestion,
  questionKey,
  formatAnswer,
  getExpectedAnswer,
  getDefaultInstruction,
  isFactorAnswerQuestion
} from "./model.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveToolInstructionText,
  setToolInstructionText
} from "../../shared/tool-instruction.js";
import {
  createNumericAnswerControl,
  renderNumericAnswerDisplayMarkup
} from "../../shared/tool-ui/numeric-answer.js";
import { formatIntegerForDisplay } from "../../shared/tool-ui/number-format.js";
import {
  bindCalcFamilyKeypadEvents,
  ensureCalcFamilyLayoutStyles,
  getCalcFamilyShellRefs,
  getNumericAnswerMaxLength,
  renderCalcFamilyInlineShell,
  syncCalcFamilyInlineResponsiveState,
  syncCalcFamilyKeypadVisibility,
  teardownCalcFamilyKeypadBindings
} from "../../shared/tool-commons/calcul/calc-family-layout.js";

const TM_IDS = {
  instruction: "tm_instruction",
  stage: "tm_stage",
  equation: "tm_equation",
  freeExpression: "tm_free_expression",
  responseShell: "tm_response_shell",
  responseWrap: "tm_response_wrap",
  keypadSlot: "tm_keypad_slot"
};

const TM_KEYPAD_DATA_ATTRIBUTE = "data-tm-numeric-key";
const TM_MIN_VISUAL_ANSWER_CHARS = 4;
const LAYOUT_MODES = Object.freeze({
  RESULT: "result",
  FACTOR: "factor"
});

let stylesInjected = false;

export function createActivity(initialContext = {}) {
  injectStyles();
  const state = createRuntimeState(initialContext);

  return {
    mount(container, context = initialContext) {
      state.container = container;
      state.latestContext = context ?? state.latestContext;
      renderShell(state, inferInitialLayoutMode(state.latestContext));
      syncValidateState(state);
    },

    next(container, context = initialContext) {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      if (!state.container) return;
      loadNextQuestion(state, state.latestContext ?? {});
    },

    showAnswer(container, context = initialContext) {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      revealAnswer(state);
    },

    supportsShellValidation(context = state.latestContext) {
      return shouldShowResponseBox(context);
    },

    canValidate() {
      return !state.answerRevealed && canSubmitAnswer(state);
    },

    validate() {
      if (!canSubmitAnswer(state) || state.answerRevealed) return false;
      requestReveal(state);
      return true;
    },

    getShellAnswerDisplayState(container, context = state.latestContext) {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      syncRuntimeState(state, state.latestContext);
      return getShellAnswerDisplayState(state);
    },

    setShellAnswerDisplayMode(container, context = state.latestContext, mode = "correction") {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      syncRuntimeState(state, state.latestContext);
      return applyShellAnswerDisplayMode(state, mode);
    },

    unmount(container) {
      teardownState(state, container || state.container);
    }
  };
}

function createRuntimeState(initialContext = {}) {
  return {
    container: null,
    latestContext: initialContext,
    root: null,
    stageEl: null,
    equationEl: null,
    instructionEl: null,
    exprEl: null,
    responseWrap: null,
    input: null,
    answerControl: null,
    keypadSlot: null,
    keypadAbortController: null,
    currentQuestion: null,
    lastQuestionKey: null,
    questionIndex: 0,
    usedQuestionKeys: new Set(),
    settingsKey: "",
    layoutMode: null,
    shellShowsResponseBox: null,
    answerRevealed: false,
    showResponseBox: shouldShowResponseBox(initialContext),
    instructionText: resolveInstruction(initialContext, null),
    answerDisplayMode: "correction",
    studentAnswerSnapshot: null,
    correctionSnapshot: null,
    lastEvaluation: null
  };
}

function syncRuntimeState(state, context = state.latestContext) {
  state.showResponseBox = shouldShowResponseBox(context);
  state.instructionText = resolveInstruction(context, state.currentQuestion);
}

function renderShell(state, layoutMode = getQuestionLayoutMode(state.currentQuestion)) {
  const container = state.container;
  if (!container) return;

  destroyAnswerControl(state);
  syncRuntimeState(state);
  resetShellRefs(state);

  state.layoutMode = normalizeLayoutMode(layoutMode);
  state.shellShowsResponseBox = state.showResponseBox;
  renderUnifiedShell(state);

  updateInstructionDisplay(state);
  syncKeypadVisibility(state);
}

/**
 * Tables de multiplication utilise volontairement un seul shell inline pour
 * les questions « résultat manquant » et « facteur manquant ». Seule la place
 * de la boîte-réponse change. Le DOM, la typographie et le moteur de fit restent
 * donc strictement identiques entre les deux variantes.
 */
function renderUnifiedShell(state) {
  const modeClass = state.layoutMode === LAYOUT_MODES.FACTOR
    ? "tm-root--factor"
    : "tm-root--result";

  state.container.innerHTML = renderCalcFamilyInlineShell({
    showResponseBox: state.showResponseBox,
    instructionHtml: renderToolInstruction({ id: TM_IDS.instruction }),
    stageId: TM_IDS.stage,
    equationId: TM_IDS.equation,
    freeExpressionId: TM_IDS.freeExpression,
    keypadSlotId: TM_IDS.keypadSlot,
    rootClassName: `tm-root ${modeClass}${state.showResponseBox ? " tm-root--boxed" : " tm-root--free"}`,
    stageClassName: "tm-stage",
    equationClassName: "tm-equation",
    freeExpressionClassName: "tm-expression tm-free-equation",
    keypadSlotClassName: "tm-keypad-slot",
    keypadRootClassName: "tm-keypad",
    keypadButtonClassName: "tm-keypad-button",
    keypadClearButtonClassName: "tm-keypad-button--clear",
    keypadDataAttribute: TM_KEYPAD_DATA_ATTRIBUTE,
    keypadAriaLabel: "Clavier numérique"
  });

  const refs = getCalcFamilyShellRefs(state.container, {
    instructionId: TM_IDS.instruction,
    stageId: TM_IDS.stage,
    equationId: TM_IDS.equation,
    expressionId: TM_IDS.freeExpression,
    keypadSlotId: TM_IDS.keypadSlot
  });

  state.root = refs.root;
  state.stageEl = refs.stageEl;
  state.equationEl = refs.equationEl;
  state.instructionEl = refs.instructionEl;
  state.exprEl = refs.exprEl;
  state.keypadSlot = refs.keypadSlot;
}

function loadNextQuestion(state, context = {}) {
  syncRuntimeState(state, context);

  const normalizedSettings = normalizeSettings(context?.settings);
  const settingsKey = makeRuntimeSettingsKey(normalizedSettings);
  if (state.settingsKey && state.settingsKey !== settingsKey) {
    state.usedQuestionKeys.clear();
    state.lastQuestionKey = null;
    state.questionIndex = 0;
  }
  state.settingsKey = settingsKey;

  const nextQuestion = pickQuestion(normalizedSettings, {
    avoidKey: state.lastQuestionKey,
    sequenceIndex: state.questionIndex,
    usedKeys: state.usedQuestionKeys
  });

  state.currentQuestion = nextQuestion;
  state.lastQuestionKey = questionKey(nextQuestion);
  state.usedQuestionKeys.add(state.lastQuestionKey);
  state.questionIndex += 1;
  state.answerRevealed = false;
  state.answerDisplayMode = "correction";
  state.studentAnswerSnapshot = null;
  state.correctionSnapshot = null;
  state.lastEvaluation = null;

  syncRuntimeState(state, context);

  const desiredLayoutMode = getQuestionLayoutMode(nextQuestion);
  const shellMustChange = !state.root
    || state.layoutMode !== desiredLayoutMode
    || state.shellShowsResponseBox !== state.showResponseBox;

  if (shellMustChange) {
    renderShell(state, desiredLayoutMode);
  } else {
    updateInstructionDisplay(state);
  }

  renderCurrentQuestion(state);
  syncCompactClass(state);

  if (state.showResponseBox) {
    focusInput(state);
  }
}

function renderCurrentQuestion(state) {
  if (!state.currentQuestion) return;

  syncStableAnswerSlotWidth(state);

  if (state.showResponseBox) {
    renderInputEquation(state);
  } else if (state.exprEl) {
    state.exprEl.innerHTML = renderFreeEquationMarkup(state.currentQuestion);
  }
}

function renderInputEquation(state) {
  if (!state.equationEl || !state.currentQuestion) return;

  state.equationEl.innerHTML = renderQuestionEquationMarkup(state.currentQuestion, {
    holeMarkup: `
      <div class="tool-answer-panel calc-family-inline-response-shell tm-inline-response-shell" id="${TM_IDS.responseShell}">
        <div class="tool-answer-row calc-family-response-wrap calc-family-response-wrap--inline tm-response-wrap tm-response-wrap--inline" id="${TM_IDS.responseWrap}"></div>
      </div>
    `
  });

  state.responseWrap = state.equationEl.querySelector(`#${TM_IDS.responseWrap}`);
  prepareResponseControl(state, {
    responseWrap: state.responseWrap,
    wrapClassName: "tool-answer-row calc-family-response-wrap calc-family-response-wrap--inline tm-response-wrap tm-response-wrap--inline",
    inputClassName: "calc-family-response-input calc-family-response-input--inline tm-response-input tm-response-input--inline"
  });
}

function prepareResponseControl(state, {
  responseWrap,
  wrapClassName,
  inputClassName
} = {}) {
  if (!responseWrap) return;

  destroyAnswerControl(state);
  state.responseWrap = responseWrap;
  state.responseWrap.className = wrapClassName;
  state.responseWrap.innerHTML = "";

  state.answerControl = createNumericAnswerControl({
    id: "tm_response_input",
    className: inputClassName,
    ariaLabel: "Réponse",
    maxLength: getCurrentAnswerMaxLength(state),
    captureKeyboard: true,
    captureRoot: () => state.root,
    onSubmit: () => {
      if (state.answerRevealed || !canSubmitAnswer(state)) return;
      requestReveal(state);
    }
  });

  state.responseWrap.appendChild(state.answerControl.element);
  state.input = state.answerControl.input;
  bindResponseEvents(state);
  bindKeypadEvents(state);
  syncKeypadVisibility(state);
}

function bindResponseEvents(state) {
  if (!state.input) return;

  state.input.addEventListener("input", () => {
    if (state.answerRevealed) return;
    syncValidateState(state);
  });

  state.input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    if (state.answerRevealed || !canSubmitAnswer(state)) return;
    event.preventDefault();
    requestReveal(state);
  });

  syncValidateState(state);
}

function bindKeypadEvents(state) {
  bindCalcFamilyKeypadEvents({
    state,
    dataAttribute: TM_KEYPAD_DATA_ATTRIBUTE,
    onAfterInput: () => syncValidateState(state)
  });
}

function teardownKeypadBindings(state) {
  teardownCalcFamilyKeypadBindings(state);
}

function syncKeypadVisibility(state) {
  syncCalcFamilyKeypadVisibility(state, {
    hiddenClassName: "tm-keypad-slot--hidden"
  });
}

function revealAnswer(state) {
  if (!state.currentQuestion) return;

  state.answerRevealed = true;
  state.studentAnswerSnapshot = captureStudentAnswerSnapshot(state);
  state.correctionSnapshot = buildCorrectionSnapshot(state.currentQuestion);
  state.lastEvaluation = computeStoredEvaluation(state);
  state.answerDisplayMode = "correction";

  if (state.showResponseBox) {
    renderDisplayedResponse(state);
  } else if (state.exprEl) {
    state.exprEl.innerHTML = renderFreeEquationMarkup(state.currentQuestion, { revealAnswer: true });
  }

  syncKeypadVisibility(state);
  syncCompactClass(state);
  syncValidateState(state);
}

function renderDisplayedResponse(state) {
  if (!state.equationEl || !state.currentQuestion || !state.showResponseBox) return;

  const { evaluation, showStudentAnswer, snapshot } = getDisplayedSnapshotState(state);
  destroyAnswerControl(state);

  const responseClasses = [
    "tool-answer-row",
    "calc-family-response-wrap",
    "calc-family-response-wrap--inline",
    "tm-response-wrap",
    "tm-response-wrap--inline",
    evaluation.isCorrect === true
      ? "calc-family-response-wrap--correct"
      : (showStudentAnswer ? "calc-family-response-wrap--incorrect" : "calc-family-response-wrap--correction"),
    evaluation.isCorrect === true
      ? "tm-response-wrap--correct"
      : (showStudentAnswer ? "tm-response-wrap--incorrect" : "")
  ].filter(Boolean).join(" ");

  state.equationEl.innerHTML = renderQuestionEquationMarkup(state.currentQuestion, {
    holeMarkup: `
      <div class="tool-answer-panel calc-family-inline-response-shell tm-inline-response-shell" id="${TM_IDS.responseShell}">
        <div class="${responseClasses}" id="${TM_IDS.responseWrap}">
          ${renderSnapshotMarkup(snapshot, { showStudentAnswer, evaluation })}
        </div>
      </div>
    `
  });

  state.responseWrap = state.equationEl.querySelector(`#${TM_IDS.responseWrap}`);
  state.input = null;
}

function getDisplayedSnapshotState(state) {
  const evaluation = state.lastEvaluation ?? computeStoredEvaluation(state);
  const showStudentAnswer = canToggleStudentAnswerDisplay(state)
    && normalizeAnswerDisplayMode(state.answerDisplayMode) === "student";
  const snapshot = showStudentAnswer ? state.studentAnswerSnapshot : state.correctionSnapshot;
  return { evaluation, showStudentAnswer, snapshot };
}

function renderSnapshotMarkup(snapshot, { showStudentAnswer, evaluation } = {}) {
  const stateClass = showStudentAnswer
    ? (evaluation.isCorrect
      ? " calc-family-response-input--correct tm-response-input--correct"
      : " calc-family-response-input--incorrect tm-response-input--incorrect")
    : (evaluation.isCorrect
      ? " calc-family-response-input--correct tm-response-input--correct"
      : " calc-family-response-input--correction");
  return renderNumericAnswerDisplayMarkup(snapshot?.value ?? "", {
    className: `calc-family-response-input calc-family-response-input--inline tm-response-input tm-response-input--inline${stateClass}`,
    ariaLabel: "Réponse affichée"
  });
}

function renderQuestionEquationMarkup(question, { holeMarkup = "" } = {}) {
  const factorTarget = isFactorAnswerQuestion(question);
  const missingIndex = Number(question?.missingIndex) === 0 ? 0 : 1;

  const first = factorTarget && missingIndex === 0
    ? holeMarkup
    : renderMathPart(question?.factor1);
  const second = factorTarget && missingIndex === 1
    ? holeMarkup
    : renderMathPart(question?.factor2);
  const result = factorTarget
    ? renderMathPart(question?.result ?? "")
    : holeMarkup;

  return `
    ${first}
    ${renderMathPart("×", "tm-operator")}
    ${second}
    ${renderMathPart("=", "tm-equals")}
    ${result}
  `;
}

function renderFreeEquationMarkup(question, { revealAnswer = false } = {}) {
  if (!question) return "";

  const factorTarget = isFactorAnswerQuestion(question);
  if (!factorTarget) {
    const baseQuestion = `
      ${renderFreePart(question.factor1)}
      ${renderFreePart("×")}
      ${renderFreePart(question.factor2)}
    `;
    if (!revealAnswer) return baseQuestion;
    return `
      ${baseQuestion}
      ${renderFreePart("=")}
      ${renderFreePart(question.result)}
    `;
  }

  const missingIndex = Number(question.missingIndex) === 0 ? 0 : 1;
  const first = missingIndex === 0
    ? renderFreeHole(question.factor1, { visible: revealAnswer, label: "Facteur manquant" })
    : renderFreePart(question.factor1);
  const second = missingIndex === 1
    ? renderFreeHole(question.factor2, { visible: revealAnswer, label: "Facteur manquant" })
    : renderFreePart(question.factor2);

  return `
    ${first}
    ${renderFreePart("×")}
    ${second}
    ${renderFreePart("=")}
    ${renderFreePart(question.result)}
  `;
}

function renderMathPart(value, extraClass = "") {
  return `<div class="tool-big calc-family-math-part tm-expression tm-math-part ${escapeHtml(extraClass)}">${escapeHtml(formatMathValue(value))}</div>`;
}

function renderFreePart(value) {
  return `<span class="calc-family-free-part tm-free-part">${escapeHtml(formatMathValue(value))}</span>`;
}

function renderFreeHole(value = "", { visible = false, label = "Nombre manquant" } = {}) {
  const safeValue = formatMathValue(value);
  const ariaLabel = visible ? `${label} : ${safeValue}` : label;

  return `
    <span class="calc-family-free-hole tm-free-hole${visible ? " is-filled" : ""}" role="img" aria-label="${escapeHtml(ariaLabel)}">
      <span class="calc-family-free-hole-value tm-free-hole-value" aria-hidden="true">${escapeHtml(safeValue)}</span>
    </span>
  `;
}

function captureStudentAnswerSnapshot(state) {
  return {
    value: String(state.input?.value ?? "").trim()
  };
}

function buildCorrectionSnapshot(question) {
  return {
    value: String(getExpectedAnswer(question) ?? "")
  };
}

function computeStoredEvaluation(state) {
  const answer = String(state.studentAnswerSnapshot?.value ?? "").trim();
  const expected = String(state.correctionSnapshot?.value ?? getExpectedAnswer(state.currentQuestion) ?? "").trim();
  return {
    isCorrect: isNumericAnswer(answer) && Number.parseInt(answer, 10) === Number.parseInt(expected, 10)
  };
}

function getShellAnswerDisplayState(state) {
  return {
    canToggle: canToggleStudentAnswerDisplay(state),
    mode: normalizeAnswerDisplayMode(state.answerDisplayMode),
    transitionTargets: [state.responseWrap]
  };
}

function applyShellAnswerDisplayMode(state, mode = "correction") {
  if (!canToggleStudentAnswerDisplay(state)) return false;
  state.answerDisplayMode = normalizeAnswerDisplayMode(mode);
  renderDisplayedResponse(state);
  return true;
}

function canToggleStudentAnswerDisplay(state) {
  if (!state.showResponseBox || !state.answerRevealed) return false;
  if (!state.studentAnswerSnapshot || !state.correctionSnapshot) return false;
  return String(state.studentAnswerSnapshot.value ?? "") !== String(state.correctionSnapshot.value ?? "");
}

function isCurrentAnswerCorrect(state) {
  const submittedValue = String(state.input?.value ?? "").trim();
  return isNumericAnswer(submittedValue)
    && Number.parseInt(submittedValue, 10) === Number(getExpectedAnswer(state.currentQuestion));
}

function requestReveal(state) {
  state.latestContext?.services?.requestAnswerPhase?.({
    manual: false,
    showAnswerNow: true,
    wasCorrect: isCurrentAnswerCorrect(state)
  });
}

function canSubmitAnswer(state) {
  return state.showResponseBox && state.currentQuestion && isNumericAnswer(state.input?.value);
}

function syncValidateState(state) {
  state.latestContext?.services?.notifyValidationStateChanged?.();
}

function updateInstructionDisplay(state) {
  setToolInstructionText(state.instructionEl, state.instructionText);
}

function resolveInstruction(context = {}, question = null) {
  const fallback = getQuestionDefaultInstruction(question, context?.settings);
  return resolveToolInstructionText({
    ...context,
    defaultInstruction: fallback
  }, fallback);
}

function getQuestionDefaultInstruction(question, settings = {}) {
  if (question) {
    return isFactorAnswerQuestion(question)
      ? "Écris le facteur manquant."
      : "Écris le résultat.";
  }
  return getDefaultInstruction(settings);
}

function shouldShowResponseBox(context = {}) {
  return getResponseUi(context) === "boxed";
}

function getResponseUi(context = {}) {
  return normalizeResponseUi(
    context?.responseUi
    ?? context?.response_ui
    ?? context?.passationProfile?.responseUi
    ?? context?.passationProfile?.response_ui
  ) || "boxed";
}

function normalizeResponseUi(value) {
  const safeValue = String(value ?? "").trim().toLowerCase();
  if (safeValue === "boxed" || safeValue === "free") return safeValue;
  return "";
}

function normalizeAnswerDisplayMode(value) {
  return String(value || "").trim().toLowerCase() === "student" ? "student" : "correction";
}

function isNumericAnswer(value) {
  return /^\d+$/.test(String(value ?? "").trim());
}

function focusInput(state) {
  if (!state.answerControl && !state.input) return;
  queueMicrotask(() => {
    if (state.answerControl) {
      state.answerControl.focus();
      return;
    }

    try {
      state.input.focus({ preventScroll: true });
      state.input.select?.();
    } catch {
      state.input.focus?.();
    }
  });
}

function syncCompactClass(state) {
  if (!state.root || !state.currentQuestion) return;

  syncStableAnswerSlotWidth(state);
  syncCalcFamilyInlineResponsiveState({
    root: state.root,
    equationEl: state.showResponseBox ? state.equationEl : state.exprEl,
    lineLength: getStableLineDisplayLength(state),
    minScale: 0.32
  });
}

function getStableLineDisplayLength(state) {
  const question = state.currentQuestion;
  if (!question) return 0;

  const fullEquationLength = formatAnswer(question).length;
  const hiddenValue = isFactorAnswerQuestion(question)
    ? (Number(question.missingIndex) === 0 ? question.factor1 : question.factor2)
    : question.result;
  const hiddenValueLength = formatMathValue(hiddenValue).length;
  const answerSlotLength = getStableAnswerVisualChars(question);

  return Math.max(0, fullEquationLength - hiddenValueLength + answerSlotLength);
}

function syncStableAnswerSlotWidth(state) {
  if (!state.root || !state.currentQuestion) return;
  state.root.style.setProperty(
    "--tm-answer-visual-chars",
    String(getStableAnswerVisualChars(state.currentQuestion))
  );
}

function getStableAnswerVisualChars(question) {
  if (!question) return TM_MIN_VISUAL_ANSWER_CHARS;
  const maxDigits = Math.max(
    getNumericAnswerMaxLength(question.factor1),
    getNumericAnswerMaxLength(question.factor2),
    getNumericAnswerMaxLength(question.result)
  );
  return Math.max(TM_MIN_VISUAL_ANSWER_CHARS, maxDigits + 2);
}

function getCurrentAnswerMaxLength(state) {
  return getNumericAnswerMaxLength(getExpectedAnswer(state.currentQuestion));
}

function getQuestionLayoutMode(question) {
  return isFactorAnswerQuestion(question) ? LAYOUT_MODES.FACTOR : LAYOUT_MODES.RESULT;
}

function inferInitialLayoutMode(context = {}) {
  const settings = normalizeSettings(context?.settings);
  return settings.answerTarget === "factor" ? LAYOUT_MODES.FACTOR : LAYOUT_MODES.RESULT;
}

function normalizeLayoutMode(value) {
  return value === LAYOUT_MODES.FACTOR ? LAYOUT_MODES.FACTOR : LAYOUT_MODES.RESULT;
}

function destroyAnswerControl(state) {
  teardownKeypadBindings(state);
  state.answerControl?.destroy?.();
  state.answerControl = null;
  syncKeypadVisibility(state);
}

function resetShellRefs(state) {
  state.root = null;
  state.stageEl = null;
  state.equationEl = null;
  state.instructionEl = null;
  state.exprEl = null;
  state.responseWrap = null;
  state.keypadSlot = null;
  state.input = null;
}

function formatMathValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? formatIntegerForDisplay(numeric) : String(value ?? "");
}

function makeRuntimeSettingsKey(settings) {
  try {
    return JSON.stringify(settings ?? null) || "";
  } catch {
    return String(settings ?? "");
  }
}

function teardownState(state, container) {
  destroyAnswerControl(state);
  if (container) container.innerHTML = "";
  state.container = null;
  resetShellRefs(state);
  state.answerControl = null;
  state.keypadAbortController = null;
  state.currentQuestion = null;
  state.layoutMode = null;
  state.shellShowsResponseBox = null;
  state.answerRevealed = false;
  state.studentAnswerSnapshot = null;
  state.correctionSnapshot = null;
  state.lastEvaluation = null;
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  ensureToolInstructionStyles();
  ensureCalcFamilyLayoutStyles();

  const href = new URL("./activity.css", import.meta.url).href;
  if (document.querySelector(`link[data-tm-activity-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.tmActivityStyle = href;
  document.head.appendChild(link);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
