import {
  normalizeSettings,
  pickQuestion,
  questionKey,
  formatAnswerValue
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
    responseWrap: null,
    singleInput: null,
    currentQuestion: null,
    lastQuestionKey: null,
    answerRevealed: false,
    activityMode: normalizeActivityMode(initialContext?.activityMode),
    projectionResponseUi: normalizeProjectionResponseUi(initialContext?.projectionResponseUi),
    showResponseBox: shouldShowResponseBox(initialContext),
    instructionText: resolveInstruction(initialContext),
    answerDisplayMode: "correction",
    studentAnswerSnapshot: null,
    correctionSnapshot: null,
    lastEvaluation: null
  };
}

function syncRuntimeState(state, context = state.latestContext) {
  state.activityMode = normalizeActivityMode(context?.activityMode);
  state.projectionResponseUi = normalizeProjectionResponseUi(context?.projectionResponseUi);
  state.showResponseBox = shouldShowResponseBox(context);
  state.instructionText = resolveInstruction(context);
}

function renderShell(state) {
  const container = state.container;
  if (!container) return;

  syncRuntimeState(state);

  container.innerHTML = `
    <div class="op-root opt-root${state.showResponseBox ? " op-root--boxed" : " op-root--free"}">
      ${renderToolInstruction({ id: "opt_instruction" })}
      <div class="op-stage${state.showResponseBox ? " op-stage--boxed" : " op-stage--free"}" id="opt_stage">
        ${state.showResponseBox
          ? `<div class="op-equation opt-equation" id="opt_equation"></div>`
          : `<div class="tool-big op-expr opt-free-equation" id="opt_expr"></div>`
        }
      </div>
    </div>
  `;

  state.root = container.querySelector(".op-root");
  state.instructionEl = container.querySelector("#opt_instruction");
  state.stageEl = container.querySelector("#opt_stage");
  state.equationEl = container.querySelector("#opt_equation");
  state.exprEl = container.querySelector("#opt_expr");
  state.responseWrap = null;
  state.singleInput = null;

  updateInstructionDisplay(state);
}

function loadNextQuestion(state, context = {}) {
  syncRuntimeState(state, context);

  const nextQuestion = pickQuestion(normalizeSettings(context?.settings), {
    avoidKey: state.lastQuestionKey
  });

  state.currentQuestion = nextQuestion;
  state.lastQuestionKey = questionKey(nextQuestion);
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

  syncValidateState(state);
}

function renderInputEquation(state) {
  if (!state.equationEl || !state.currentQuestion) return;
  state.equationEl.innerHTML = renderEquationMarkup(state.currentQuestion, {
    holeMarkup: `
      <div class="op-inline-response-shell opt-inline-response-shell" id="opt_response_shell">
        <div class="op-response-wrap" id="opt_response_wrap"></div>
      </div>
    `
  });
  state.responseWrap = state.equationEl.querySelector("#opt_response_wrap");
  renderResponseInput(state);
}

function renderResponseInput(state) {
  if (!state.responseWrap || !state.currentQuestion) return;

  state.responseWrap.className = "op-response-wrap";
  state.responseWrap.innerHTML = `
    <input
      class="op-response-input op-response-input--single"
      id="opt_response_input"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      aria-label="Réponse"
    />
  `;

  state.singleInput = state.responseWrap.querySelector("#opt_response_input");
  bindResponseEvents(state);
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

  syncValidateState(state);
}

function renderDisplayedResponse(state) {
  if (!state.equationEl || !state.currentQuestion || !state.showResponseBox) return;

  const evaluation = state.lastEvaluation ?? computeStoredEvaluation(state);
  const showStudentAnswer = canToggleStudentAnswerDisplay(state)
    && normalizeAnswerDisplayMode(state.answerDisplayMode) === "student";
  const snapshot = showStudentAnswer ? state.studentAnswerSnapshot : state.correctionSnapshot;

  const responseClass = [
    "op-response-wrap",
    evaluation.isCorrect === true ? "op-response-wrap--correct" : "op-response-wrap--incorrect"
  ].join(" ");

  state.equationEl.innerHTML = renderEquationMarkup(state.currentQuestion, {
    holeMarkup: `
      <div class="op-inline-response-shell opt-inline-response-shell" id="opt_response_shell">
        <div class="${responseClass}" id="opt_response_wrap">
          ${renderSnapshotMarkup(snapshot, { showStudentAnswer, evaluation })}
        </div>
      </div>
    `
  });

  state.responseWrap = state.equationEl.querySelector("#opt_response_wrap");
  state.singleInput = null;
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
  return `<div class="tool-big op-expr opt-math-part ${escapeHtml(extraClass)}">${escapeHtml(String(value ?? ""))}</div>`;
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
  return `<span class="opt-free-part">${escapeHtml(String(value ?? ""))}</span>`;
}

function renderFreeHole(value = "", { visible = false } = {}) {
  const safeValue = String(value ?? "");
  const label = visible ? `Nombre manquant : ${safeValue}` : "Nombre manquant";

  return `
    <span class="opt-free-hole${visible ? " is-filled" : ""}" role="img" aria-label="${escapeHtml(label)}">
      <span class="opt-free-hole-value" aria-hidden="true">${escapeHtml(safeValue)}</span>
    </span>
  `;
}

function renderSnapshotMarkup(snapshot, { showStudentAnswer, evaluation }) {
  if (!snapshot) return "";
  return renderReadOnlyResponseInput(snapshot.value, {
    className: `op-response-input op-response-input--single${showStudentAnswer ? (evaluation.isCorrect ? " op-response-input--correct" : " op-response-input--incorrect") : ""}`,
    ariaLabel: "Réponse affichée"
  });
}

function captureStudentAnswerSnapshot(state) {
  return {
    kind: "single",
    value: String(state.singleInput?.value ?? "").trim()
  };
}

function buildCorrectionSnapshot(question) {
  return {
    kind: "single",
    value: formatAnswerValue(question)
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
      : "correction"
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
  if (state.singleInput) {
    state.singleInput.value = "";
    state.singleInput.readOnly = false;
    state.singleInput.removeAttribute("aria-invalid");
    state.singleInput.classList.remove("op-response-input--correct", "op-response-input--incorrect");
  }
  syncValidateState(state);
}

function focusPrimaryInput(state) {
  if (!state.singleInput) return;

  queueMicrotask(() => {
    try {
      state.singleInput.focus({ preventScroll: true });
      state.singleInput.select?.();
    } catch {
      state.singleInput.focus?.();
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
  const activityMode = normalizeActivityMode(context?.activityMode);
  if (activityMode === "group") return false;

  if (String(context?.runMode || context?.sessionMode || "").trim() === "projected-teacher") {
    return normalizeProjectionResponseUi(context?.projectionResponseUi) === "boxed";
  }

  return true;
}

function normalizeProjectionResponseUi(value) {
  const safeValue = String(value || "free").trim().toLowerCase();
  return safeValue === "boxed" ? "boxed" : "free";
}

function normalizeActivityMode(value) {
  const safeValue = String(value || "individual").trim().toLowerCase();
  if (safeValue === "group") return safeValue;
  return "individual";
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

function teardownState(state, container) {
  if (container) container.innerHTML = "";

  state.container = null;
  state.root = null;
  state.instructionEl = null;
  state.stageEl = null;
  state.equationEl = null;
  state.exprEl = null;
  state.responseWrap = null;
  state.singleInput = null;
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
  if (document.querySelector(`link[data-opt-activity-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.optActivityStyle = href;
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
