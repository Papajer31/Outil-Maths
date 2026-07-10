import {
  normalizeSettings,
  pickQuestion,
  questionKey,
  formatQuestion,
  formatAnswer
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
import { scheduleCalcLayoutFit } from "../../shared/tool-ui/calc-layout-fit.js";

let stylesInjected = false;

export function createActivity(initialContext = {}) {
  injectStyles();
  const state = createRuntimeState(initialContext);

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
      if (!state.root) renderShell(state);
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
    instructionEl: null,
    exprEl: null,
    responseWrap: null,
    input: null,
    answerControl: null,
    currentQuestion: null,
    lastQuestionKey: null,
    questionIndex: 0,
    usedQuestionKeys: new Set(),
    settingsKey: "",
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
  container.innerHTML = `
    <div class="tool-runtime add-root${state.showResponseBox ? " add-root--boxed" : " add-root--free"}">
      ${renderToolInstruction({ id: "add_instruction" })}
      <div class="tool-stage add-stage">
        <div class="tool-answer-row add-equation">
          <div class="tool-big tool-question add-expression" id="add_expression"></div>
          ${state.showResponseBox ? `
            <div class="tool-big add-equals">=</div>
            <div class="tool-answer-panel add-response-wrap" id="add_response_wrap"></div>
          ` : ""}
        </div>
      </div>
    </div>
  `;

  state.root = container.querySelector(".add-root");
  state.instructionEl = container.querySelector("#add_instruction");
  state.exprEl = container.querySelector("#add_expression");
  state.responseWrap = container.querySelector("#add_response_wrap");
  state.input = null;
  updateInstructionDisplay(state);
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

  updateInstructionDisplay(state);

  if (state.showResponseBox !== Boolean(state.responseWrap)) {
    renderShell(state);
  }

  if (state.exprEl) {
    state.exprEl.textContent = formatQuestion(nextQuestion);
  }
  syncCompactClass(state);

  if (state.showResponseBox) {
    renderResponseArea(state);
    focusInput(state);
  }
}

function renderResponseArea(state) {
  if (!state.responseWrap) return;
  destroyAnswerControl(state);
  state.responseWrap.className = "tool-answer-panel add-response-wrap";
  state.responseWrap.innerHTML = "";

  state.answerControl = createNumericAnswerControl({
    id: "add_response_input",
    className: "add-response-input",
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

function revealAnswer(state) {
  if (!state.currentQuestion || !state.exprEl) return;

  state.answerRevealed = true;
  state.studentAnswerSnapshot = captureStudentAnswerSnapshot(state);
  state.correctionSnapshot = buildCorrectionSnapshot(state.currentQuestion);
  state.lastEvaluation = computeStoredEvaluation(state);
  state.answerDisplayMode = "correction";

  if (state.showResponseBox) {
    state.exprEl.textContent = formatQuestion(state.currentQuestion);
    renderDisplayedResponse(state);
  } else {
    state.exprEl.textContent = formatAnswer(state.currentQuestion);
  }

  syncCompactClass(state);
  syncValidateState(state);
}

function renderDisplayedResponse(state) {
  if (!state.responseWrap || !state.currentQuestion || !state.showResponseBox) return;

  const evaluation = state.lastEvaluation ?? computeStoredEvaluation(state);
  const showStudentAnswer = canToggleStudentAnswerDisplay(state)
    && normalizeAnswerDisplayMode(state.answerDisplayMode) === "student";
  const snapshot = showStudentAnswer ? state.studentAnswerSnapshot : state.correctionSnapshot;

  state.responseWrap.className = "tool-answer-panel add-response-wrap";
  state.responseWrap.classList.toggle("add-response-wrap--correct", evaluation.isCorrect === true);
  state.responseWrap.classList.toggle("add-response-wrap--incorrect", evaluation.isCorrect !== true);
  destroyAnswerControl(state);
  state.responseWrap.innerHTML = renderNumericAnswerDisplayMarkup(snapshot?.value ?? "", {
    className: `add-response-input${showStudentAnswer ? (evaluation.isCorrect ? " add-response-input--correct" : " add-response-input--incorrect") : ""}`,
    ariaLabel: "Réponse affichée"
  });
  state.input = null;
}

function captureStudentAnswerSnapshot(state) {
  return {
    value: String(state.input?.value ?? "").trim()
  };
}

function buildCorrectionSnapshot(question) {
  return {
    value: String(question?.result ?? "")
  };
}

function computeStoredEvaluation(state) {
  const answer = String(state.studentAnswerSnapshot?.value ?? "").trim();
  const expected = String(state.correctionSnapshot?.value ?? state.currentQuestion?.result ?? "").trim();
  return {
    isCorrect: isNumericAnswer(answer) && Number.parseInt(answer, 10) === Number.parseInt(expected, 10)
  };
}

function getShellAnswerDisplayState(state) {
  return {
    canToggle: canToggleStudentAnswerDisplay(state),
    mode: normalizeAnswerDisplayMode(state.answerDisplayMode)
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
    && Number.parseInt(submittedValue, 10) === Number(state.currentQuestion?.result);
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

  const digitCount = getCurrentCalculationDigitCount(state);
  const shouldMoveAnswerToSecondLine = state.showResponseBox && digitCount > 8;
  const length = shouldMoveAnswerToSecondLine
    ? formatQuestion(state.currentQuestion).length
    : getCurrentLineDisplayLength(state);

  state.root.classList.toggle("calc-runtime--answer-second-line", shouldMoveAnswerToSecondLine);
  state.root.classList.toggle("calc-runtime--single-line-answer", state.showResponseBox && !shouldMoveAnswerToSecondLine);
  state.root.classList.toggle("calc-runtime--ultra-dense", length >= 34 || digitCount >= 16);
  state.root.classList.toggle("calc-runtime--dense", (length >= 26 || digitCount >= 12) && !(length >= 34 || digitCount >= 16));
  state.root.classList.toggle("calc-runtime--compact", (length >= 18 || digitCount >= 9) && !(length >= 26 || digitCount >= 12));

  scheduleCalcLayoutFit({
    root: state.root,
    equationEl: state.root.querySelector(".add-equation"),
    expressionEl: state.exprEl,
    equalsEl: state.root.querySelector(".add-equals"),
    responseWrapEl: state.responseWrap,
    answerSecondLine: shouldMoveAnswerToSecondLine,
    minScale: 0.32
  });
}

function getCurrentCalculationDigitCount(state) {
  const question = state.currentQuestion;
  if (!question) return 0;

  const values = Array.isArray(question.terms)
    ? question.terms
    : [question.term1, question.term2, question.factor1, question.factor2];

  return values.reduce((total, value) => total + countIntegerDigitsForLayout(value), 0);
}

function countIntegerDigitsForLayout(value) {
  const digits = String(Math.abs(Math.trunc(Number(value) || 0))).replace(/\D+/g, "");
  return Math.max(1, digits.length);
}

function getCurrentLineDisplayLength(state) {
  if (!state.currentQuestion) return 0;
  if (!state.showResponseBox || state.answerRevealed) {
    return formatAnswer(state.currentQuestion).length;
  }
  const answerChars = Math.max(4, getCurrentAnswerMaxLength(state) + 2);
  return `${formatQuestion(state.currentQuestion)} = `.length + answerChars;
}

function getCurrentAnswerMaxLength(state) {
  const rawValue = state.currentQuestion?.result ?? "";
  const digitCount = String(rawValue).replace(/\D+/g, "").length;
  return Math.max(1, digitCount);
}

function destroyAnswerControl(state) {
  state.answerControl?.destroy?.();
  state.answerControl = null;
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
  state.root = null;
  state.instructionEl = null;
  state.exprEl = null;
  state.responseWrap = null;
  state.input = null;
  state.answerControl = null;
  state.currentQuestion = null;
  state.answerRevealed = false;
  state.studentAnswerSnapshot = null;
  state.correctionSnapshot = null;
  state.lastEvaluation = null;
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  ensureToolInstructionStyles();

  const href = new URL("./activity.css", import.meta.url).href;
  if (document.querySelector(`link[data-add-activity-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.addActivityStyle = href;
  document.head.appendChild(link);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
