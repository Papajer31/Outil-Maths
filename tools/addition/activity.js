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
import {
  bindCalcFamilyKeypadEvents,
  ensureCalcFamilyLayoutStyles,
  estimateBoxedCalculationLineLength,
  getCalcFamilyShellRefs,
  getCalculationDigitCount,
  getNumericAnswerMaxLength,
  renderCalcFamilyShell,
  syncCalcFamilyKeypadVisibility,
  syncCalcFamilyResponsiveState,
  teardownCalcFamilyKeypadBindings
} from "../../shared/tool-commons/calcul/calc-family-layout.js";

const ADD_IDS = {
  instruction: "add_instruction",
  expression: "add_expression",
  responseWrap: "add_response_wrap",
  keypadSlot: "add_keypad_slot"
};

const ADD_KEYPAD_DATA_ATTRIBUTE = "data-add-numeric-key";

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
    keypadSlot: null,
    keypadAbortController: null,
    currentQuestion: null,
    lastQuestionKey: null,
    questionIndex: 0,
    usedQuestionKeys: new Set(),
    settingsKey: "",
    answerRevealed: false,
    showResponseBox: shouldShowResponseBox(initialContext),
    instructionText: resolveInstruction(initialContext),
    numberDisplayMode: "digits",
    answerDisplayMode: "correction",
    studentAnswerSnapshot: null,
    correctionSnapshot: null,
    lastEvaluation: null
  };
}

function syncRuntimeState(state, context = state.latestContext) {
  state.showResponseBox = shouldShowResponseBox(context);
  state.instructionText = resolveInstruction(context);
  state.numberDisplayMode = normalizeSettings(context?.settings).numberDisplayMode;
}

function renderShell(state) {
  const container = state.container;
  if (!container) return;

  destroyAnswerControl(state);
  syncRuntimeState(state);
  container.innerHTML = renderCalcFamilyShell({
    showResponseBox: state.showResponseBox,
    instructionHtml: renderToolInstruction({ id: ADD_IDS.instruction }),
    expressionId: ADD_IDS.expression,
    responseWrapId: ADD_IDS.responseWrap,
    keypadSlotId: ADD_IDS.keypadSlot,
    rootClassName: `add-root${state.showResponseBox ? " add-root--boxed" : " add-root--free"}`,
    stageClassName: "add-stage",
    equationClassName: "add-equation",
    expressionClassName: "add-expression",
    equalsClassName: "add-equals",
    responseWrapClassName: "add-response-wrap",
    keypadSlotClassName: "add-keypad-slot",
    keypadRootClassName: "add-keypad",
    keypadButtonClassName: "add-keypad-button",
    keypadClearButtonClassName: "add-keypad-button--clear",
    keypadDataAttribute: ADD_KEYPAD_DATA_ATTRIBUTE,
    keypadAriaLabel: "Clavier numérique"
  });

  const refs = getCalcFamilyShellRefs(container, {
    instructionId: ADD_IDS.instruction,
    expressionId: ADD_IDS.expression,
    responseWrapId: ADD_IDS.responseWrap,
    keypadSlotId: ADD_IDS.keypadSlot
  });

  state.root = refs.root;
  state.instructionEl = refs.instructionEl;
  state.exprEl = refs.exprEl;
  state.responseWrap = refs.responseWrap;
  state.keypadSlot = refs.keypadSlot;
  state.input = null;
  updateInstructionDisplay(state);
  syncKeypadVisibility(state);
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
    state.exprEl.textContent = formatQuestion(nextQuestion, state.numberDisplayMode);
  }

  if (state.showResponseBox) {
    renderResponseArea(state);
    syncCompactClass(state);
    focusInput(state);
  } else {
    syncCompactClass(state);
  }
}

function renderResponseArea(state) {
  if (!state.responseWrap) return;
  destroyAnswerControl(state);
  state.responseWrap.className = "tool-answer-panel calc-family-response-wrap add-response-wrap";
  state.responseWrap.innerHTML = "";

  state.answerControl = createNumericAnswerControl({
    id: "add_response_input",
    className: "calc-family-response-input add-response-input",
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
    dataAttribute: ADD_KEYPAD_DATA_ATTRIBUTE,
    onAfterInput: () => syncValidateState(state)
  });
}

function teardownKeypadBindings(state) {
  teardownCalcFamilyKeypadBindings(state);
}

function syncKeypadVisibility(state) {
  syncCalcFamilyKeypadVisibility(state, {
    hiddenClassName: "add-keypad-slot--hidden"
  });
}

function revealAnswer(state) {
  if (!state.currentQuestion || !state.exprEl) return;

  state.answerRevealed = true;
  state.studentAnswerSnapshot = captureStudentAnswerSnapshot(state);
  state.correctionSnapshot = buildCorrectionSnapshot(state.currentQuestion);
  state.lastEvaluation = computeStoredEvaluation(state);
  state.answerDisplayMode = "correction";

  if (state.showResponseBox) {
    state.exprEl.textContent = formatQuestion(state.currentQuestion, state.numberDisplayMode);
    renderDisplayedResponse(state);
  } else {
    state.exprEl.textContent = formatAnswer(state.currentQuestion, state.numberDisplayMode);
  }

  syncKeypadVisibility(state);
  syncCompactClass(state);
  syncValidateState(state);
}

function renderDisplayedResponse(state) {
  if (!state.responseWrap || !state.currentQuestion || !state.showResponseBox) return;

  const evaluation = state.lastEvaluation ?? computeStoredEvaluation(state);
  const showStudentAnswer = canToggleStudentAnswerDisplay(state)
    && normalizeAnswerDisplayMode(state.answerDisplayMode) === "student";
  const snapshot = showStudentAnswer ? state.studentAnswerSnapshot : state.correctionSnapshot;

  state.responseWrap.className = "tool-answer-panel calc-family-response-wrap add-response-wrap";
  state.responseWrap.classList.toggle("calc-family-response-wrap--correct", evaluation.isCorrect === true);
  state.responseWrap.classList.toggle("calc-family-response-wrap--incorrect", evaluation.isCorrect !== true);
  state.responseWrap.classList.toggle("add-response-wrap--correct", evaluation.isCorrect === true);
  state.responseWrap.classList.toggle("add-response-wrap--incorrect", evaluation.isCorrect !== true);
  destroyAnswerControl(state);
  state.responseWrap.innerHTML = renderNumericAnswerDisplayMarkup(snapshot?.value ?? "", {
    className: `calc-family-response-input add-response-input${showStudentAnswer ? (evaluation.isCorrect ? " calc-family-response-input--correct add-response-input--correct" : " calc-family-response-input--incorrect add-response-input--incorrect") : ""}`,
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
  syncCalcFamilyResponsiveState({
    root: state.root,
    equationEl: state.root.querySelector(".calc-family-equation"),
    expressionEl: state.exprEl,
    equalsEl: state.root.querySelector(".calc-family-equals"),
    responseWrapEl: state.responseWrap,
    showResponseBox: state.showResponseBox,
    digitCount,
    lineLength: getCurrentLineDisplayLength(state),
    secondLineLength: formatQuestion(state.currentQuestion, state.numberDisplayMode).length,
    minScale: 0.32
  });
}

function getCurrentCalculationDigitCount(state) {
  return getCalculationDigitCount(state.currentQuestion);
}

function getCurrentLineDisplayLength(state) {
  if (!state.currentQuestion) return 0;

  // Quand la réponse est saisie dans une boîte, le layout doit rester stable
  // entre la phase de saisie et la phase de correction. On dimensionne donc
  // toujours la ligne sur la même enveloppe théorique : question + signe =
  // + largeur visuelle maximale de la boîte réponse. Sinon, une question située
  // juste au seuil compact/dense peut grossir brutalement au moment de la
  // correction, parce que le texte corrigé est plus court que la boîte.
  if (state.showResponseBox) {
    return estimateBoxedCalculationLineLength({
      questionText: formatQuestion(state.currentQuestion, state.numberDisplayMode),
      answerMaxLength: getCurrentAnswerMaxLength(state)
    });
  }

  return formatAnswer(state.currentQuestion, state.numberDisplayMode).length;
}

function getCurrentAnswerMaxLength(state) {
  return getNumericAnswerMaxLength(state.currentQuestion?.result);
}

function destroyAnswerControl(state) {
  teardownKeypadBindings(state);
  state.answerControl?.destroy?.();
  state.answerControl = null;
  syncKeypadVisibility(state);
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
  state.keypadSlot = null;
  state.input = null;
  state.answerControl = null;
  state.keypadAbortController = null;
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
  ensureCalcFamilyLayoutStyles();

  const href = new URL("./activity.css", import.meta.url).href;
  if (document.querySelector(`link[data-add-activity-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.addActivityStyle = href;
  document.head.appendChild(link);
}
