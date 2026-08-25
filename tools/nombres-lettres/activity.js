import {
  normalizeSettings,
  pickQuestion,
  questionKey,
  evaluateAnswer,
  QUESTION_DIRECTIONS
} from "./model.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveQuestionInstructionText,
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
      syncRuntimeState(state, state.latestContext);
      updateInstructionDisplay(state);
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
    stageSourceEl: null,
    stageArrowEl: null,
    stageAnswerEl: null,
    responseShellEl: null,
    responseInputEl: null,
    validateBtn: null,
    currentQuestion: null,
    lastQuestionKey: null,
    answerRevealed: false,
    submittedAnswer: "",
    answerDisplayMode: "correction",
    showResponseBox: shouldShowResponseBox(initialContext)
  };
}

function syncRuntimeState(state, context = state.latestContext) {
  state.showResponseBox = shouldShowResponseBox(context);
}

function renderShell(state) {
  const container = state.container;
  if (!container) return;

  syncRuntimeState(state);

  container.innerHTML = `
    <div class="tool-runtime tool-runtime--nombres-lettres nl-root${state.showResponseBox ? " nl-root--boxed" : " nl-root--free"}">
        ${renderToolInstruction({ id: "nl_instruction" })}
        <div class="tool-stage nl-stage" id="nl_stage">
          <div class="tool-source-zone nl-stage-source" id="nl_stage_source"></div>
          <div class="nl-stage-arrow" id="nl_stage_arrow" aria-hidden="true">→</div>
          <div class="tool-answer-zone nl-stage-answer" id="nl_stage_answer"></div>
        </div>
        ${state.showResponseBox ? `<div class="tool-answer-panel nl-response-shell" id="nl_response_shell"></div>` : ""}
    </div>
  `;

  state.root = container.querySelector(".nl-root");
  state.instructionEl = container.querySelector("#nl_instruction");
  state.stageEl = container.querySelector("#nl_stage");
  state.stageSourceEl = container.querySelector("#nl_stage_source");
  state.stageArrowEl = container.querySelector("#nl_stage_arrow");
  state.stageAnswerEl = container.querySelector("#nl_stage_answer");
  state.responseShellEl = container.querySelector("#nl_response_shell");
  state.responseInputEl = null;
  state.validateBtn = null;

  updateInstructionDisplay(state);
  updateLayoutVisibility(state);
}

function loadNextQuestion(state, context = {}) {
  syncRuntimeState(state, context);

  const nextQuestion = pickQuestion(normalizeSettings(context?.settings), {
    avoidKey: state.lastQuestionKey
  });
  state.currentQuestion = nextQuestion;
  state.lastQuestionKey = questionKey(nextQuestion);
  state.answerRevealed = false;
  state.submittedAnswer = "";
  state.answerDisplayMode = "correction";

  if (state.showResponseBox !== Boolean(state.responseShellEl)) {
    renderShell(state);
  }

  renderQuestion(state);
  syncValidateState(state);
  focusPrimaryInput(state);
}

function renderQuestion(state) {
  if (!state.currentQuestion) return;

  updateInstructionDisplay(state);
  updateLayoutVisibility(state);

  state.root?.classList.remove("nl-root--correct", "nl-root--incorrect", "nl-root--revealed");
  state.stageAnswerEl?.classList.remove("is-filled");

  if (state.stageSourceEl) {
    state.stageSourceEl.innerHTML = renderSourceMarkup(state.currentQuestion);
  }

  if (state.showResponseBox) {
    if (state.responseShellEl) {
      state.responseShellEl.className = "nl-response-shell";
      state.responseShellEl.innerHTML = renderResponseMarkup(state.currentQuestion);
      state.responseInputEl = state.responseShellEl.querySelector("[data-nl-response-input]");
      bindResponseEvents(state);
    }

    if (state.stageAnswerEl) {
      state.stageAnswerEl.innerHTML = "";
    }
  } else {
    state.responseInputEl = null;
    state.validateBtn = null;
    if (state.stageAnswerEl) {
      state.stageAnswerEl.innerHTML = renderFreePlaceholderMarkup(state.currentQuestion);
      state.stageAnswerEl.classList.remove("is-filled");
    }
  }
}

function bindResponseEvents(state) {
  const input = state.responseInputEl;
  if (!input) return;

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

}

function revealAnswer(state) {
  if (!state.currentQuestion) return;

  state.answerRevealed = true;
  state.submittedAnswer = getCurrentResponseValue(state);
  state.answerDisplayMode = "correction";
  const evaluation = getStoredEvaluation(state);
  const isCorrect = evaluation.isCorrect;

  if (state.showResponseBox) {
    state.root?.classList.toggle("nl-root--correct", isCorrect);
    state.root?.classList.toggle("nl-root--incorrect", !isCorrect);
  } else {
    state.root?.classList.remove("nl-root--correct", "nl-root--incorrect");
  }
  state.root?.classList.add("nl-root--revealed");

  if (state.showResponseBox) {
    if (state.responseShellEl) {
      renderDisplayedResponse(state);
    }
  } else if (state.stageAnswerEl) {
    state.stageAnswerEl.innerHTML = renderFreeAnswerMarkup(state.currentQuestion);
    state.stageAnswerEl.classList.add("is-filled");
  }
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
  if (!state.showResponseBox || !state.currentQuestion || !state.responseInputEl) {
    return false;
  }

  const answer = String(state.responseInputEl.value ?? "").trim();
  if (!answer) return false;

  if (state.currentQuestion.answerKind === "number") {
    return /^\d+$/.test(answer);
  }

  return answer.length > 0;
}

function focusPrimaryInput(state) {
  if (!state.showResponseBox || !state.responseInputEl) return;

  queueMicrotask(() => {
    try {
      state.responseInputEl.focus({ preventScroll: true });
      state.responseInputEl.select?.();
    } catch {
      state.responseInputEl.focus?.();
    }
  });
}

function updateInstructionDisplay(state) {
  const text = resolveQuestionInstructionText(
    state.latestContext,
    state.currentQuestion?.prompt || ""
  );
  setToolInstructionText(state.instructionEl, text);
}

function resolveDisplayedInstruction(state) {
  return resolveQuestionInstructionText(
    state.latestContext,
    state.currentQuestion?.prompt || ""
  );
}


function renderSourceMarkup(question) {
  if (question.direction === QUESTION_DIRECTIONS.WORDS_TO_NUMBER) {
    return renderSeyesDisplayPanel(question.displayPrimary, {
      panelClassName: "tool-card tool-card--white nl-source-panel nl-source-panel--words"
    });
  }

  return renderSourceNumber(question.displayPrimary);
}

function renderResponseMarkup(question) {
  if (question.direction === QUESTION_DIRECTIONS.WORDS_TO_NUMBER) {
    return renderNumberInputPanel({
      inputId: "nl_response_input",
      ariaLabel: "Réponse en chiffres",
      value: "",
      readonly: false
    });
  }

  return renderSeyesInputPanel({ inputId: "nl_response_input", ariaLabel: "Réponse en lettres" });
}

function renderRevealedResponseMarkup(question, isCorrect) {
  if (question.direction === QUESTION_DIRECTIONS.WORDS_TO_NUMBER) {
    return renderNumberResponseDisplay(question.expectedAnswer, {
      className: isCorrect ? "is-correct" : "is-incorrect"
    });
  }

  return renderSeyesDisplayPanel(question.expectedAnswer, {
    panelClassName: `tool-answer-box nl-answer-panel${isCorrect ? " is-correct" : " is-incorrect"}`
  });
}

function renderStudentResponseMarkup(question, answer, isCorrect) {
  const displayAnswer = String(answer ?? "").trim();

  if (question.direction === QUESTION_DIRECTIONS.WORDS_TO_NUMBER) {
    return renderNumberResponseDisplay(displayAnswer, {
      className: isCorrect ? "is-correct" : "is-incorrect"
    });
  }

  return renderSeyesDisplayPanel(displayAnswer, {
    panelClassName: `tool-answer-box nl-answer-panel${isCorrect ? " is-correct" : " is-incorrect"}`
  });
}

function renderFreePlaceholderMarkup(question) {
  if (question.direction === QUESTION_DIRECTIONS.WORDS_TO_NUMBER) {
    return renderNumberCard("?", {
      className: "nl-answer-card nl-answer-card--placeholder"
    });
  }

  return renderSeyesDisplayPanel("", {
    empty: true,
    panelClassName: "tool-answer-box nl-answer-panel nl-answer-panel--placeholder"
  });
}

function renderFreeAnswerMarkup(question) {
  if (question.direction === QUESTION_DIRECTIONS.WORDS_TO_NUMBER) {
    return renderNumberCard(question.expectedAnswer, {
      className: "nl-answer-card"
    });
  }

  return renderSeyesDisplayPanel(question.expectedAnswer, {
    panelClassName: "tool-answer-box nl-answer-panel"
  });
}

function renderNumberCard(value, { className = "" } = {}) {
  return `
    <div class="tool-card tool-card--white nl-number-card ${className}">
      <div class="nl-number-card-value">${escapeHtml(String(value ?? ""))}</div>
    </div>
  `;
}

function renderSourceNumber(value) {
  return `
    <div class="tool-question nl-source-number">${escapeHtml(String(value ?? ""))}</div>
  `;
}

function renderNumberResponseDisplay(value, { className = "" } = {}) {
  return renderNumberInputPanel({
    ariaLabel: "Réponse affichée en chiffres",
    value,
    readonly: true,
    className: `tool-answer-box tool-answer-input tool-answer-display nl-number-display ${className}`.trim()
  });
}

function renderSeyesInputPanel({ inputId, ariaLabel }) {
  return `
    <label class="tool-answer-box nl-seyes-panel nl-seyes-panel--input" for="${escapeHtml(inputId)}">
      <input
        class="tool-answer-input nl-seyes-input"
        id="${escapeHtml(inputId)}"
        data-nl-response-input
        type="text"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        aria-label="${escapeHtml(ariaLabel)}"
      />
    </label>
  `;
}

function renderNumberInputPanel({
  inputId = "",
  ariaLabel = "",
  value = "",
  readonly = false,
  className = "tool-answer-box tool-answer-input nl-number-input"
} = {}) {
  const safeId = String(inputId ?? "").trim();
  const safeValue = String(value ?? "");
  const safeClassName = String(className || "tool-answer-box tool-answer-input nl-number-input").trim();

  return `
    <input
      class="${escapeHtml(safeClassName)}"
      ${safeId ? `id="${escapeHtml(safeId)}"` : ""}
      ${readonly ? "" : "data-nl-response-input"}
      type="text"
      inputmode="numeric"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      aria-label="${escapeHtml(ariaLabel)}"
      value="${escapeHtml(safeValue)}"
      ${readonly ? 'readonly tabindex="-1"' : ""}
    />
  `;
}

function renderSeyesDisplayPanel(text, { empty = false, panelClassName = "" } = {}) {
  const safeText = String(text ?? "").trim();
  return `
    <div class="nl-seyes-panel ${panelClassName}${empty ? " is-empty" : ""}">
      <div class="nl-seyes-text">${empty ? "" : escapeHtml(safeText)}</div>
    </div>
  `;
}

function normalizeAnswerDisplayMode(value) {
  return String(value ?? "").trim().toLowerCase() === "student" ? "student" : "correction";
}

function getCurrentResponseValue(state) {
  return String(state.responseInputEl?.value ?? "").trim();
}

function getStoredEvaluation(state) {
  return evaluateAnswer(state.currentQuestion, state.submittedAnswer ?? "");
}

function canToggleStudentAnswerDisplay(state) {
  if (!state.showResponseBox || !state.answerRevealed || !state.currentQuestion) {
    return false;
  }

  const submittedAnswer = String(state.submittedAnswer ?? "").trim();
  if (!submittedAnswer) {
    return false;
  }

  return submittedAnswer !== String(state.currentQuestion.expectedAnswer ?? "").trim();
}

function renderDisplayedResponse(state) {
  if (!state.responseShellEl || !state.currentQuestion) return;

  const evaluation = getStoredEvaluation(state);
  const isCorrect = evaluation.isCorrect;
  const showStudentAnswer = canToggleStudentAnswerDisplay(state)
    && normalizeAnswerDisplayMode(state.answerDisplayMode) === "student";

  state.responseShellEl.classList.toggle("nl-response-shell--correct", isCorrect);
  state.responseShellEl.classList.toggle("nl-response-shell--incorrect", !isCorrect);
  state.responseShellEl.innerHTML = showStudentAnswer
    ? renderStudentResponseMarkup(state.currentQuestion, state.submittedAnswer, isCorrect)
    : renderRevealedResponseMarkup(state.currentQuestion, isCorrect);
  state.responseInputEl = null;
  state.validateBtn = null;
}

function getShellAnswerDisplayState(state) {
  return {
    canToggle: canToggleStudentAnswerDisplay(state),
    mode: canToggleStudentAnswerDisplay(state)
      ? normalizeAnswerDisplayMode(state.answerDisplayMode)
      : "correction",
    transitionTargets: [state.responseShellEl]
  };
}

function applyShellAnswerDisplayMode(state, mode) {
  if (!state.showResponseBox || !state.answerRevealed || !state.responseShellEl) {
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

function getCurrentEvaluation(state) {
  return evaluateAnswer(state.currentQuestion, state.responseInputEl?.value ?? "");
}

function isCurrentAnswerCorrect(state) {
  if (!state.showResponseBox || !state.responseInputEl || !state.currentQuestion) {
    return false;
  }
  return getCurrentEvaluation(state).isCorrect;
}

function updateLayoutVisibility(state) {
  const freeMode = !state.showResponseBox;
  state.root?.classList.toggle("nl-root--free", freeMode);
  state.root?.classList.toggle("nl-root--boxed", !freeMode);
  state.stageEl?.classList.toggle("nl-stage--free", freeMode);
  state.stageEl?.classList.toggle("nl-stage--boxed", !freeMode);

  if (state.stageArrowEl) {
    state.stageArrowEl.hidden = !freeMode;
  }

  if (state.stageAnswerEl) {
    state.stageAnswerEl.hidden = !freeMode;
  }
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


function teardownState(state, container) {
  if (container) {
    container.innerHTML = "";
  }
  state.container = null;
  state.root = null;
  state.instructionEl = null;
  state.stageEl = null;
  state.stageSourceEl = null;
  state.stageArrowEl = null;
  state.stageAnswerEl = null;
  state.responseShellEl = null;
  state.responseInputEl = null;
  state.validateBtn = null;
  state.currentQuestion = null;
  state.lastQuestionKey = null;
  state.answerRevealed = false;
  state.submittedAnswer = "";
  state.answerDisplayMode = "correction";
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  ensureToolInstructionStyles();

  const href = new URL("./activity.css", import.meta.url).href;
  if (document.querySelector(`link[data-nl-activity-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.nlActivityStyle = href;
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
