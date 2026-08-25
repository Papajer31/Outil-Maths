import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveToolInstructionText,
  setToolInstructionText
} from "../../tool-instruction.js";
import {
  createNumericAnswerControl,
  renderNumericAnswerDisplayMarkup
} from "../../tool-ui/numeric-answer.js";
import { formatIntegerForDisplay } from "../../tool-ui/number-format.js";
import {
  bindCalcFamilyKeypadEvents,
  ensureCalcFamilyLayoutStyles,
  getCalcFamilyShellRefs,
  getNumericAnswerMaxLength,
  renderCalcFamilyInlineShell,
  syncCalcFamilyInlineResponsiveState,
  syncCalcFamilyKeypadVisibility,
  teardownCalcFamilyKeypadBindings
} from "./calc-family-layout.js";

const HOLE_IDS = Object.freeze({
  instruction: "opt_instruction",
  stage: "opt_stage",
  equation: "opt_equation",
  freeExpression: "opt_expr",
  responseShell: "opt_response_shell",
  responseWrap: "opt_response_wrap",
  responseInput: "opt_response_input",
  keypadSlot: "opt_keypad_slot"
});

const HOLE_KEYPAD_DATA_ATTRIBUTE = "data-opt-numeric-key";

export function createOperationHoleActivity({ model, initialContext = {} } = {}) {
  assertOperationHoleModel(model);
  ensureToolInstructionStyles();
  ensureCalcFamilyLayoutStyles();
  const state = createRuntimeState(model, initialContext);

  return {
    mount(container, context = initialContext) {
      state.container = container;
      state.latestContext = context ?? state.latestContext;
      renderShell(state);
      syncValidateState(state);
    },

    next(container, context = initialContext) {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      if (!state.container) return;

      if (!state.root) {
        renderShell(state);
      }

      loadNextQuestion(state, state.latestContext ?? {});
    },

    showAnswer(container, context = initialContext) {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      revealAnswer(state);
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

    unmount(container) {
      teardownState(state, container || state.container);
    }
  };
}

function createRuntimeState(model, initialContext = {}) {
  return {
    model,
    container: null,
    latestContext: initialContext,
    root: null,
    instructionEl: null,
    stageEl: null,
    equationEl: null,
    exprEl: null,
    responseWrap: null,
    singleInput: null,
    input: null,
    answerControl: null,
    keypadSlot: null,
    keypadAbortController: null,
    currentQuestion: null,
    lastQuestionKey: null,
    answerRevealed: false,
    showResponseBox: shouldShowResponseBox(initialContext),
    instructionText: resolveInstruction(initialContext),
    answerDisplayMode: "correction",
    studentAnswerSnapshot: null,
    correctionSnapshot: null,
    lastEvaluation: null
  };
}

function syncRuntimeState(state, context = state.latestContext) {
  state.showResponseBox = shouldShowResponseBox(context);
  state.instructionText = resolveInstruction(context);
}

function renderShell(state) {
  const container = state.container;
  if (!container) return;

  destroyAnswerControl(state);
  syncRuntimeState(state);

  container.innerHTML = renderCalcFamilyInlineShell({
    showResponseBox: state.showResponseBox,
    instructionHtml: renderToolInstruction({ id: HOLE_IDS.instruction }),
    stageId: HOLE_IDS.stage,
    equationId: HOLE_IDS.equation,
    freeExpressionId: HOLE_IDS.freeExpression,
    keypadSlotId: HOLE_IDS.keypadSlot,
    rootClassName: `tool-runtime--operation-trous op-root opt-root${state.showResponseBox ? " op-root--boxed" : " op-root--free"}`,
    stageClassName: `op-stage${state.showResponseBox ? " op-stage--boxed" : " op-stage--free"}`,
    equationClassName: "op-equation opt-equation",
    freeExpressionClassName: "op-expr opt-free-equation",
    keypadSlotClassName: "op-keypad-slot opt-keypad-slot",
    keypadRootClassName: "op-keypad opt-keypad",
    keypadButtonClassName: "op-keypad-button opt-keypad-button",
    keypadClearButtonClassName: "op-keypad-button--clear opt-keypad-button--clear",
    keypadDataAttribute: HOLE_KEYPAD_DATA_ATTRIBUTE,
    keypadAriaLabel: "Clavier numérique"
  });

  const refs = getCalcFamilyShellRefs(container, {
    instructionId: HOLE_IDS.instruction,
    stageId: HOLE_IDS.stage,
    equationId: HOLE_IDS.equation,
    expressionId: HOLE_IDS.freeExpression,
    keypadSlotId: HOLE_IDS.keypadSlot
  });

  state.root = refs.root;
  state.instructionEl = refs.instructionEl;
  state.stageEl = refs.stageEl;
  state.equationEl = refs.equationEl;
  state.exprEl = refs.exprEl;
  state.responseWrap = null;
  state.singleInput = null;
  state.input = null;
  state.answerControl = null;
  state.keypadSlot = refs.keypadSlot;

  updateInstructionDisplay(state);
  syncKeypadVisibility(state);
}

function loadNextQuestion(state, context = {}) {
  syncRuntimeState(state, context);

  const nextQuestion = state.model.pickQuestion(state.model.normalizeSettings(context?.settings), {
    avoidKey: state.lastQuestionKey
  });

  state.currentQuestion = nextQuestion;
  state.lastQuestionKey = state.model.questionKey(nextQuestion);
  state.answerRevealed = false;
  state.answerDisplayMode = "correction";
  state.studentAnswerSnapshot = null;
  state.correctionSnapshot = null;
  state.lastEvaluation = null;

  updateInstructionDisplay(state);

  if (state.showResponseBox !== Boolean(state.equationEl)) {
    renderShell(state);
  }

  if (state.showResponseBox) {
    renderInputEquation(state);
    resetResponseState(state);
    focusPrimaryInput(state);
  } else if (state.exprEl) {
    state.exprEl.innerHTML = renderFreeEquationMarkup(nextQuestion);
  }
  syncCompactClass(state);

  syncValidateState(state);
}

function renderInputEquation(state) {
  if (!state.equationEl || !state.currentQuestion) return;
  state.equationEl.innerHTML = renderEquationMarkup(state.currentQuestion, {
    holeMarkup: `
      <div class="tool-answer-panel calc-family-inline-response-shell op-inline-response-shell opt-inline-response-shell" id="${HOLE_IDS.responseShell}">
        <div class="tool-answer-row calc-family-response-wrap calc-family-response-wrap--inline op-response-wrap" id="${HOLE_IDS.responseWrap}"></div>
      </div>
    `
  });
  state.responseWrap = state.equationEl.querySelector(`#${HOLE_IDS.responseWrap}`);
  renderResponseInput(state);
}

function renderResponseInput(state) {
  if (!state.responseWrap || !state.currentQuestion) return;

  destroyAnswerControl(state);
  state.responseWrap.className = "tool-answer-row calc-family-response-wrap calc-family-response-wrap--inline op-response-wrap";
  state.responseWrap.innerHTML = "";

  state.answerControl = createNumericAnswerControl({
    id: HOLE_IDS.responseInput,
    className: "calc-family-response-input calc-family-response-input--inline op-response-input op-response-input--single",
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
  state.singleInput = state.answerControl.input;
  state.input = state.singleInput;
  bindResponseEvents(state);
  bindKeypadEvents(state);
  syncKeypadVisibility(state);
}

function bindResponseEvents(state) {
  if (!state.singleInput) return;

  state.singleInput.addEventListener("input", () => {
    if (state.answerRevealed) return;
    syncValidateState(state);
  });

  state.singleInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    if (state.answerRevealed) return;
    if (!canSubmitAnswer(state)) return;
    event.preventDefault();
    requestReveal(state);
  });

  syncValidateState(state);
}


function bindKeypadEvents(state) {
  bindCalcFamilyKeypadEvents({
    state,
    dataAttribute: HOLE_KEYPAD_DATA_ATTRIBUTE,
    onAfterInput: () => syncValidateState(state)
  });
}

function teardownKeypadBindings(state) {
  teardownCalcFamilyKeypadBindings(state);
}

function syncKeypadVisibility(state) {
  syncCalcFamilyKeypadVisibility(state, {
    hiddenClassName: "op-keypad-slot--hidden"
  });
}

function revealAnswer(state) {
  if (!state.currentQuestion) return;

  state.answerRevealed = true;
  state.studentAnswerSnapshot = captureStudentAnswerSnapshot(state);
  state.correctionSnapshot = buildCorrectionSnapshot(state, state.currentQuestion);
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

  const evaluation = state.lastEvaluation ?? computeStoredEvaluation(state);
  const showStudentAnswer = canToggleStudentAnswerDisplay(state)
    && normalizeAnswerDisplayMode(state.answerDisplayMode) === "student";
  const snapshot = showStudentAnswer ? state.studentAnswerSnapshot : state.correctionSnapshot;

  destroyAnswerControl(state);

  const responseClass = [
    "tool-answer-row",
    "calc-family-response-wrap",
    "calc-family-response-wrap--inline",
    "op-response-wrap",
    evaluation.isCorrect === true
      ? "calc-family-response-wrap--correct"
      : (showStudentAnswer ? "calc-family-response-wrap--incorrect" : "calc-family-response-wrap--correction"),
    evaluation.isCorrect === true
      ? "op-response-wrap--correct"
      : (showStudentAnswer ? "op-response-wrap--incorrect" : "")
  ].filter(Boolean).join(" ");

  state.equationEl.innerHTML = renderEquationMarkup(state.currentQuestion, {
    holeMarkup: `
      <div class="tool-answer-panel calc-family-inline-response-shell op-inline-response-shell opt-inline-response-shell" id="${HOLE_IDS.responseShell}">
        <div class="${responseClass}" id="${HOLE_IDS.responseWrap}">
          ${renderSnapshotMarkup(snapshot, { showStudentAnswer, evaluation })}
        </div>
      </div>
    `
  });

  state.responseWrap = state.equationEl.querySelector(`#${HOLE_IDS.responseWrap}`);
  state.singleInput = null;
  state.input = null;
}

function renderEquationMarkup(question, { holeMarkup = "" } = {}) {
  const terms = Array.isArray(question?.terms) ? question.terms : ["", ""];
  const operator = question?.operatorSymbol || "";
  const first = question?.missingIndex === 0
    ? holeMarkup
    : renderMathPart(terms[0]);
  const second = question?.missingIndex === 1
    ? holeMarkup
    : renderMathPart(terms[1]);

  return `
    ${first}
    ${renderMathPart(operator, "opt-operator")}
    ${second}
    ${renderMathPart("=", "op-equals opt-equals")}
    ${renderMathPart(question?.result ?? "")}
  `;
}

function renderMathPart(value, extraClass = "") {
  return `<div class="tool-big calc-family-math-part op-expr opt-math-part ${escapeHtml(extraClass)}">${escapeHtml(formatMathValue(value))}</div>`;
}

function renderFreeEquationMarkup(question, { revealAnswer = false } = {}) {
  if (!question) return "";

  const terms = Array.isArray(question?.terms) ? question.terms : ["", ""];
  const operator = question?.operatorSymbol || "";
  const first = question?.missingIndex === 0
    ? renderFreeHole(terms[0], { visible: revealAnswer })
    : renderFreePart(terms[0]);
  const second = question?.missingIndex === 1
    ? renderFreeHole(terms[1], { visible: revealAnswer })
    : renderFreePart(terms[1]);

  return `
    ${first}
    ${renderFreePart(operator)}
    ${second}
    ${renderFreePart("=")}
    ${renderFreePart(question?.result ?? "")}
  `;
}

function renderFreePart(value) {
  return `<span class="calc-family-free-part opt-free-part">${escapeHtml(formatMathValue(value))}</span>`;
}

function renderFreeHole(value = "", { visible = false } = {}) {
  const safeValue = formatMathValue(value);
  const label = visible ? `Nombre manquant : ${safeValue}` : "Nombre manquant";

  return `
    <span class="calc-family-free-hole opt-free-hole${visible ? " is-filled" : ""}" role="img" aria-label="${escapeHtml(label)}">
      <span class="calc-family-free-hole-value opt-free-hole-value" aria-hidden="true">${escapeHtml(safeValue)}</span>
    </span>
  `;
}

function renderSnapshotMarkup(snapshot, { showStudentAnswer, evaluation }) {
  if (!snapshot) return "";
  return renderNumericAnswerDisplayMarkup(snapshot.value, {
    className: `calc-family-response-input calc-family-response-input--inline op-response-input op-response-input--single${showStudentAnswer ? (evaluation.isCorrect ? " calc-family-response-input--correct is-correct op-response-input--correct" : " calc-family-response-input--incorrect is-incorrect op-response-input--incorrect") : (evaluation.isCorrect ? " calc-family-response-input--correct is-correct op-response-input--correct" : " calc-family-response-input--correction is-correction")}`,
    ariaLabel: "Réponse affichée"
  });
}

function captureStudentAnswerSnapshot(state) {
  return {
    kind: "single",
    value: String(state.singleInput?.value ?? "").trim()
  };
}

function buildCorrectionSnapshot(state, question) {
  return {
    kind: "single",
    value: state.model.formatAnswerValue(question)
  };
}

function computeStoredEvaluation(state) {
  if (!state.currentQuestion) {
    return { isCorrect: false };
  }

  const submittedValue = String(state.studentAnswerSnapshot?.value ?? "").trim();
  return {
    isCorrect: isNumericAnswer(submittedValue)
      && Number.parseInt(submittedValue, 10) === state.currentQuestion.missingValue
  };
}

function getShellAnswerDisplayState(state) {
  return {
    canToggle: canToggleStudentAnswerDisplay(state),
    mode: canToggleStudentAnswerDisplay(state)
      ? normalizeAnswerDisplayMode(state.answerDisplayMode)
      : "correction",
    transitionTargets: [state.equationEl]
  };
}

function applyShellAnswerDisplayMode(state, mode) {
  if (!state.showResponseBox || !state.answerRevealed || !state.equationEl) {
    return false;
  }

  if (!canToggleStudentAnswerDisplay(state)) {
    state.answerDisplayMode = "correction";
    renderDisplayedResponse(state);
    return false;
  }

  state.answerDisplayMode = normalizeAnswerDisplayMode(mode);
  renderDisplayedResponse(state);
  return true;
}

function canToggleStudentAnswerDisplay(state) {
  if (!state.showResponseBox || !state.answerRevealed || !state.currentQuestion) return false;
  if (!state.studentAnswerSnapshot || !state.correctionSnapshot) return false;
  return String(state.studentAnswerSnapshot.value ?? "") !== String(state.correctionSnapshot.value ?? "");
}

function isCurrentAnswerCorrect(state) {
  if (!state.currentQuestion) return false;
  const submittedValue = String(state.singleInput?.value ?? "").trim();
  return isNumericAnswer(submittedValue)
    && Number.parseInt(submittedValue, 10) === state.currentQuestion.missingValue;
}

function requestReveal(state) {
  state.latestContext?.services?.requestAnswerPhase?.({
    manual: false,
    showAnswerNow: true,
    wasCorrect: isCurrentAnswerCorrect(state)
  });
}

function syncValidateState(state) {
  state.latestContext?.services?.notifyValidationStateChanged?.();
}

function canSubmitAnswer(state) {
  if (!state.showResponseBox || !state.currentQuestion) return false;
  return isNumericAnswer(state.singleInput?.value);
}

function resetResponseState(state) {
  state.responseWrap?.classList.remove("op-response-wrap--correct", "op-response-wrap--incorrect");
  if (state.answerControl) {
    state.answerControl.clear();
  } else if (state.singleInput) {
    state.singleInput.value = "";
    state.singleInput.readOnly = false;
    state.singleInput.removeAttribute("aria-invalid");
    state.singleInput.classList.remove("op-response-input--correct", "op-response-input--incorrect");
  }
  syncValidateState(state);
}

function focusPrimaryInput(state) {
  if (!state.answerControl && !state.singleInput) return;

  queueMicrotask(() => {
    if (state.answerControl) {
      state.answerControl.focus();
      return;
    }

    try {
      state.singleInput.focus({ preventScroll: true });
      state.singleInput.select?.();
    } catch {
      state.singleInput.focus?.();
    }
  });
}

function syncCompactClass(state) {
  if (!state.root || !state.currentQuestion) return;
  const fitElement = state.showResponseBox ? state.equationEl : state.exprEl;
  if (!fitElement) return;

  syncCalcFamilyInlineResponsiveState({
    root: state.root,
    equationEl: fitElement,
    lineLength: getCurrentLineDisplayLength(state),
    minScale: 0.32
  });
}

function getCurrentLineDisplayLength(state) {
  const question = state.currentQuestion;
  if (!question) return 0;
  const terms = Array.isArray(question.terms) ? question.terms : ["", ""];
  const answerChars = Math.max(4, getCurrentAnswerMaxLength(state) + 2);
  const firstLength = question.missingIndex === 0 ? answerChars : formatMathValue(terms[0]).length;
  const secondLength = question.missingIndex === 1 ? answerChars : formatMathValue(terms[1]).length;
  return firstLength + 3 + secondLength + 3 + formatMathValue(question.result).length;
}

function formatMathValue(value) {
  const raw = String(value ?? "");
  return /^\d+$/.test(raw) ? formatIntegerForDisplay(raw) : raw;
}

function getCurrentAnswerMaxLength(state) {
  return getNumericAnswerMaxLength(state.currentQuestion?.missingValue);
}

function destroyAnswerControl(state) {
  teardownKeypadBindings(state);
  state.answerControl?.destroy?.();
  state.answerControl = null;
  state.singleInput = null;
  state.input = null;
  syncKeypadVisibility(state);
}

function updateInstructionDisplay(state) {
  setToolInstructionText(state.instructionEl, state.instructionText);
}

function resolveInstruction(context = {}) {
  return resolveToolInstructionText(context);
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

function teardownState(state, container) {
  destroyAnswerControl(state);
  if (container) container.innerHTML = "";

  state.container = null;
  state.root = null;
  state.instructionEl = null;
  state.stageEl = null;
  state.equationEl = null;
  state.exprEl = null;
  state.responseWrap = null;
  state.singleInput = null;
  state.input = null;
  state.answerControl = null;
  state.keypadSlot = null;
  state.keypadAbortController = null;
  state.currentQuestion = null;
  state.answerRevealed = false;
  state.answerDisplayMode = "correction";
  state.studentAnswerSnapshot = null;
  state.correctionSnapshot = null;
  state.lastEvaluation = null;
}

function assertOperationHoleModel(model) {
  const requiredMethods = ["normalizeSettings", "pickQuestion", "questionKey", "formatAnswerValue"];
  const missing = requiredMethods.filter((name) => typeof model?.[name] !== "function");
  if (missing.length) {
    throw new TypeError(`Modèle d'opération à trou incomplet : ${missing.join(", ")}`);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
