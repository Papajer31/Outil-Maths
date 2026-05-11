import {
  normalizeSettings,
  pickQuestion,
  questionKey,
  formatQuestion,
  formatAnswer,
  OPERATION_TYPES
} from "./model.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveToolInstructionText,
  setToolInstructionText
} from "../../shared/tool-instruction.js";

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

function createRuntimeState(initialContext = {}) {
  return {
    container: null,
    latestContext: initialContext,
    root: null,
    instructionEl: null,
    stageEl: null,
    equationEl: null,
    exprEl: null,
    equalsEl: null,
    responseShellEl: null,
    responseWrap: null,
    singleInput: null,
    quotientInput: null,
    remainderInput: null,
    validateBtn: null,
    currentQuestion: null,
    lastQuestionKey: null,
    questionIndex: 0,
    usedQuestionKeys: new Set(),
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

  syncRuntimeState(state);

  container.innerHTML = `
    <div class="op-root${state.showResponseBox ? " op-root--boxed" : " op-root--free"}">
        ${renderToolInstruction({ id: "op_instruction" })}
        <div class="op-stage${state.showResponseBox ? " op-stage--boxed" : " op-stage--free"}" id="op_stage">
          ${state.showResponseBox
            ? `
              <div class="op-equation" id="op_equation">
                <div class="tool-big op-expr" id="op_expr"></div>
                <div class="tool-big op-equals" id="op_equals">=</div>
                <div class="op-inline-response-shell" id="op_response_shell">
                  <div class="op-response-wrap" id="op_response_wrap"></div>
                </div>
              </div>
            `
            : `
              <div class="tool-big op-expr" id="op_expr"></div>
            `
          }
        </div>
    </div>
  `;

  state.root = container.querySelector(".op-root");
  state.instructionEl = container.querySelector("#op_instruction");
  state.stageEl = container.querySelector("#op_stage");
  state.equationEl = container.querySelector("#op_equation");
  state.exprEl = container.querySelector("#op_expr");
  state.equalsEl = container.querySelector("#op_equals");
  state.responseShellEl = container.querySelector("#op_response_shell");
  state.responseWrap = container.querySelector("#op_response_wrap");
  state.singleInput = null;
  state.quotientInput = null;
  state.remainderInput = null;
  state.validateBtn = null;

  updateInstructionDisplay(state);
}

function loadNextQuestion(state, context = {}) {
  syncRuntimeState(state, context);

  const nextQuestion = pickQuestion(normalizeSettings(context?.settings), {
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

  if (state.showResponseBox) {
    renderResponseArea(state);
    resetResponseState(state);
    focusPrimaryInput(state);
  }
}

function renderResponseArea(state) {
  if (!state.responseWrap || !state.currentQuestion) return;

  const isDivision = state.currentQuestion.operation === OPERATION_TYPES.DIVISION;
  state.responseWrap.className = `op-response-wrap${isDivision ? " op-response-wrap--division" : ""}`;

  state.responseWrap.innerHTML = isDivision
    ? `
      <div class="op-answer-cluster">
        <label class="op-answer-label" for="op_response_q">q =</label>
        <input
          class="op-response-input op-response-input--division"
          id="op_response_q"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          aria-label="Quotient"
        />
      </div>
      <div class="op-answer-separator">et</div>
      <div class="op-answer-cluster">
        <label class="op-answer-label" for="op_response_r">r =</label>
        <input
          class="op-response-input op-response-input--division"
          id="op_response_r"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          aria-label="Reste"
        />
      </div>
    `
    : `
      <input
        class="op-response-input op-response-input--single"
        id="op_response_input"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        aria-label="Réponse"
      />
    `;

  state.singleInput = state.responseWrap.querySelector("#op_response_input");
  state.quotientInput = state.responseWrap.querySelector("#op_response_q");
  state.remainderInput = state.responseWrap.querySelector("#op_response_r");

  bindResponseEvents(state);
}

function bindResponseEvents(state) {
  const inputs = [state.singleInput, state.quotientInput, state.remainderInput].filter(Boolean);

  inputs.forEach((input) => {
    input.addEventListener("input", () => {
      if (state.answerRevealed) return;
      syncValidateState(state);
    });

    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      if (state.answerRevealed) return;
      if (!canSubmitAnswer(state)) return;
      event.preventDefault();
      requestReveal(state);
    });
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

  syncValidateState(state);
}

function renderDisplayedResponse(state) {
  if (!state.responseWrap || !state.currentQuestion || !state.showResponseBox) return;

  const evaluation = state.lastEvaluation ?? computeStoredEvaluation(state);
  const showStudentAnswer = canToggleStudentAnswerDisplay(state)
    && normalizeAnswerDisplayMode(state.answerDisplayMode) === "student";

  state.responseWrap.className = `op-response-wrap${state.currentQuestion.operation === OPERATION_TYPES.DIVISION ? " op-response-wrap--division" : ""}`;
  state.responseWrap.classList.toggle("op-response-wrap--correct", evaluation.isCorrect === true);
  state.responseWrap.classList.toggle("op-response-wrap--incorrect", evaluation.isCorrect !== true);

  const snapshot = showStudentAnswer ? state.studentAnswerSnapshot : state.correctionSnapshot;
  state.responseWrap.innerHTML = renderSnapshotMarkup(state.currentQuestion, snapshot, {
    showStudentAnswer,
    evaluation
  });

  state.singleInput = null;
  state.quotientInput = null;
  state.remainderInput = null;
}

function renderSnapshotMarkup(question, snapshot, { showStudentAnswer, evaluation }) {
  if (!snapshot) return "";

  if (snapshot.kind === "division") {
    return `
      <div class="op-answer-cluster">
        <div class="op-answer-label">q =</div>
        ${renderReadOnlyResponseInput(snapshot.quotient, {
          className: `op-response-input op-response-input--division${showStudentAnswer ? (evaluation.quotientCorrect ? " op-response-input--correct" : " op-response-input--incorrect") : ""}`,
          ariaLabel: "Quotient affiché"
        })}
      </div>
      <div class="op-answer-separator">et</div>
      <div class="op-answer-cluster">
        <div class="op-answer-label">r =</div>
        ${renderReadOnlyResponseInput(snapshot.remainder, {
          className: `op-response-input op-response-input--division${showStudentAnswer ? (evaluation.remainderCorrect ? " op-response-input--correct" : " op-response-input--incorrect") : ""}`,
          ariaLabel: "Reste affiché"
        })}
      </div>
    `;
  }

  return renderReadOnlyResponseInput(snapshot.value, {
    className: `op-response-input op-response-input--single${showStudentAnswer ? (evaluation.isCorrect ? " op-response-input--correct" : " op-response-input--incorrect") : ""}`,
    ariaLabel: "Réponse affichée"
  });
}

function captureStudentAnswerSnapshot(state) {
  if (!state.currentQuestion) return null;

  if (state.currentQuestion.operation === OPERATION_TYPES.DIVISION) {
    return {
      kind: "division",
      quotient: String(state.quotientInput?.value ?? "").trim(),
      remainder: String(state.remainderInput?.value ?? "").trim()
    };
  }

  return {
    kind: "single",
    value: String(state.singleInput?.value ?? "").trim()
  };
}

function buildCorrectionSnapshot(question) {
  if (!question) return null;

  if (question.operation === OPERATION_TYPES.DIVISION) {
    return {
      kind: "division",
      quotient: String(question.quotient),
      remainder: String(question.remainder)
    };
  }

  return {
    kind: "single",
    value: String(question.result)
  };
}

function computeStoredEvaluation(state) {
  if (!state.currentQuestion) {
    return {
      isCorrect: false,
      quotientCorrect: false,
      remainderCorrect: false
    };
  }

  if (state.currentQuestion.operation === OPERATION_TYPES.DIVISION) {
    const quotientValue = String(state.studentAnswerSnapshot?.quotient ?? "").trim();
    const remainderValue = String(state.studentAnswerSnapshot?.remainder ?? "").trim();
    const quotientCorrect = isNumericAnswer(quotientValue) && Number.parseInt(quotientValue, 10) === state.currentQuestion.quotient;
    const remainderCorrect = isNumericAnswer(remainderValue) && Number.parseInt(remainderValue, 10) === state.currentQuestion.remainder;
    return {
      isCorrect: quotientCorrect && remainderCorrect,
      quotientCorrect,
      remainderCorrect
    };
  }

  const submittedValue = String(state.studentAnswerSnapshot?.value ?? "").trim();
  return {
    isCorrect: isNumericAnswer(submittedValue) && Number.parseInt(submittedValue, 10) === state.currentQuestion.result,
    quotientCorrect: false,
    remainderCorrect: false
  };
}

function getShellAnswerDisplayState(state) {
  return {
    canToggle: canToggleStudentAnswerDisplay(state),
    mode: canToggleStudentAnswerDisplay(state)
      ? normalizeAnswerDisplayMode(state.answerDisplayMode)
      : "correction"
  };
}

function applyShellAnswerDisplayMode(state, mode) {
  if (!state.showResponseBox || !state.answerRevealed || !state.responseWrap) {
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
  if (!state.showResponseBox || !state.answerRevealed || !state.currentQuestion) {
    return false;
  }

  if (!state.studentAnswerSnapshot || !state.correctionSnapshot) {
    return false;
  }

  if (state.currentQuestion.operation === OPERATION_TYPES.DIVISION) {
    return String(state.studentAnswerSnapshot.quotient ?? "") !== String(state.correctionSnapshot.quotient ?? "")
      || String(state.studentAnswerSnapshot.remainder ?? "") !== String(state.correctionSnapshot.remainder ?? "");
  }

  return String(state.studentAnswerSnapshot.value ?? "") !== String(state.correctionSnapshot.value ?? "");
}

function isCurrentAnswerCorrect(state) {
  if (!state.currentQuestion) return false;

  if (state.currentQuestion.operation === OPERATION_TYPES.DIVISION) {
    const quotientValue = String(state.quotientInput?.value ?? "").trim();
    const remainderValue = String(state.remainderInput?.value ?? "").trim();
    return isNumericAnswer(quotientValue)
      && Number.parseInt(quotientValue, 10) === state.currentQuestion.quotient
      && isNumericAnswer(remainderValue)
      && Number.parseInt(remainderValue, 10) === state.currentQuestion.remainder;
  }

  const submittedValue = String(state.singleInput?.value ?? "").trim();
  return isNumericAnswer(submittedValue) && Number.parseInt(submittedValue, 10) === state.currentQuestion.result;
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

  if (state.currentQuestion.operation === OPERATION_TYPES.DIVISION) {
    return isNumericAnswer(state.quotientInput?.value) && isNumericAnswer(state.remainderInput?.value);
  }

  return isNumericAnswer(state.singleInput?.value);
}

function resetResponseState(state) {
  state.responseWrap?.classList.remove("op-response-wrap--correct", "op-response-wrap--incorrect");
  [state.singleInput, state.quotientInput, state.remainderInput].filter(Boolean).forEach((input) => {
    input.value = "";
    input.readOnly = false;
    input.removeAttribute("aria-invalid");
    input.classList.remove("op-response-input--correct", "op-response-input--incorrect");
  });
  syncValidateState(state);
}

function focusPrimaryInput(state) {
  const target = state.currentQuestion?.operation === OPERATION_TYPES.DIVISION
    ? state.quotientInput
    : state.singleInput;

  if (!target) return;

  queueMicrotask(() => {
    try {
      target.focus({ preventScroll: true });
      target.select?.();
    } catch {
      target.focus?.();
    }
  });
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

function renderReadOnlyResponseInput(value, { className = "", ariaLabel = "" } = {}) {
  return `
    <input
      class="${escapeHtml(String(className || "").trim())}"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      aria-label="${escapeHtml(ariaLabel)}"
      value="${escapeHtml(String(value ?? ""))}"
      readonly
      tabindex="-1"
    />
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function teardownState(state, container) {
  if (container) {
    container.innerHTML = "";
  }

  state.container = null;
  state.root = null;
  state.instructionEl = null;
  state.stageEl = null;
  state.equationEl = null;
  state.exprEl = null;
  state.equalsEl = null;
  state.responseShellEl = null;
  state.responseWrap = null;
  state.singleInput = null;
  state.quotientInput = null;
  state.remainderInput = null;
  state.validateBtn = null;
  state.currentQuestion = null;
  state.answerRevealed = false;
  state.answerDisplayMode = "correction";
  state.studentAnswerSnapshot = null;
  state.correctionSnapshot = null;
  state.lastEvaluation = null;
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  ensureToolInstructionStyles();

  const href = new URL("./activity.css", import.meta.url).href;
  if (document.querySelector(`link[data-op-activity-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.opActivityStyle = href;
  document.head.appendChild(link);
}
