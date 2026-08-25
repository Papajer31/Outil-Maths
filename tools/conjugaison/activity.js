import {
  createQuestionDeck,
  createQuestions,
  evaluateAnswer,
  normalizeSettings
} from "./model.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveQuestionInstructionText,
  setToolInstructionText
} from "../../shared/tool-instruction.js";
import { renderSimpleMarkupToHtml } from "../../shared/simple-markup.js";

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

    async next(container, context = initialContext) {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      if (!state.container) return;

      if (!state.root) renderShell(state);
      await loadNextQuestion(state, state.latestContext ?? {});
    },

    showAnswer(container, context = initialContext) {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      syncRuntimeState(state, state.latestContext);
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
      return canSubmitAnswer(state);
    },

    validate() {
      if (!canSubmitAnswer(state)) return false;
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
    questionEl: null,
    responseSlotEl: null,
    correctionEl: null,
    responseInputEl: null,
    responseInputAbortController: null,
    currentQuestion: null,
    questions: [],
    deck: [],
    deckIndex: 0,
    loadedSettingsSignature: "",
    loadingPromise: null,
    answerRevealed: false,
    submittedAnswer: "",
    responseDraftValue: "",
    pendingValidationValue: "",
    answerDisplayMode: "correction",
    showResponseBox: shouldShowResponseBox(initialContext),
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
    <div class="tool-runtime tool-runtime--conjugaison qr-root${state.showResponseBox ? " qr-root--boxed" : " qr-root--free"}">
      ${renderToolInstruction({ id: "qr_instruction" })}
      <div class="tool-stage tool-panel qr-card" id="qr_card">
        <div class="tool-question tool-question--large qr-question" id="qr_question"></div>
        <div class="tool-answer-panel qr-response-slot" id="qr_response_slot"></div>
        <div class="tool-feedback tool-correction qr-correction qr-correction--empty" id="qr_correction" aria-hidden="true"></div>
      </div>
    </div>
  `;

  state.root = container.querySelector(".qr-root");
  state.instructionEl = container.querySelector("#qr_instruction");
  state.questionEl = container.querySelector("#qr_question");
  state.responseSlotEl = container.querySelector("#qr_response_slot");
  state.correctionEl = container.querySelector("#qr_correction");
  state.responseInputEl = null;
  updateInstructionDisplay(state);
}

async function loadNextQuestion(state, context = {}) {
  syncRuntimeState(state, context);
  const settings = normalizeSettings(context?.settings);
  await ensureQuestionsLoaded(state, settings, context);

  state.answerRevealed = false;
  state.submittedAnswer = "";
  state.responseDraftValue = "";
  state.pendingValidationValue = "";
  state.answerDisplayMode = "correction";
  state.currentQuestion = pickNextQuestion(state, settings);

  if (state.showResponseBox !== Boolean(state.responseInputEl || state.responseSlotEl?.querySelector("[data-qr-response-input]") || state.showResponseBox)) {
    renderShell(state);
  }

  renderQuestion(state);
  syncValidateState(state);
  focusPrimaryInput(state);
}

async function ensureQuestionsLoaded(state, settings) {
  const signature = createSettingsSignature(settings);

  if (state.loadedSettingsSignature === signature && state.questions.length) return;
  if (state.loadingPromise) await state.loadingPromise;
  if (state.loadedSettingsSignature === signature && state.questions.length) return;

  state.loadingPromise = Promise.resolve().then(() => {
    state.questions = createQuestions(settings).filter((question) => question.prompt && question.expectedAnswer);
    state.deck = createQuestionDeck(settings);
    state.deckIndex = 0;
    state.loadedSettingsSignature = signature;
  });

  try {
    await state.loadingPromise;
  } finally {
    state.loadingPromise = null;
  }
}

function createSettingsSignature(settings = {}) {
  try {
    return JSON.stringify(normalizeSettings(settings));
  } catch {
    return String(Date.now());
  }
}

function pickNextQuestion(state, settings) {
  if (!state.questions.length) return null;

  if (!state.deck.length || state.deckIndex >= state.deck.length) {
    state.deck = createQuestionDeck(settings);
    state.deckIndex = 0;
  }

  const nextQuestion = state.deck[state.deckIndex] || state.questions[0];
  state.deckIndex += 1;
  return nextQuestion || null;
}

function renderQuestion(state) {
  updateInstructionDisplay(state);
  state.root?.classList.remove("qr-root--correct", "qr-root--incorrect", "qr-root--revealed", "qr-root--empty");
  state.root?.classList.toggle("qr-root--boxed", state.showResponseBox);
  state.root?.classList.toggle("qr-root--free", !state.showResponseBox);

  if (!state.currentQuestion) {
    renderEmptyQuestion(state);
    return;
  }

  if (state.questionEl) {
    state.questionEl.innerHTML = renderSimpleMarkupToHtml(state.currentQuestion.prompt);
  }

  teardownResponseInputBindings(state);

  if (state.correctionEl) {
    state.correctionEl.classList.add("qr-correction--empty");
    state.correctionEl.setAttribute("aria-hidden", "true");
    state.correctionEl.innerHTML = "";
  }

  if (state.responseSlotEl) {
    state.responseSlotEl.innerHTML = state.showResponseBox
      ? renderInputMarkup()
      : renderFreePlaceholderMarkup();
    state.responseInputEl = state.responseSlotEl.querySelector("[data-qr-response-input]");
    state.responseDraftValue = "";
    state.pendingValidationValue = "";
    bindResponseEvents(state);
  }
}

function renderEmptyQuestion(state) {
  teardownResponseInputBindings(state);
  state.root?.classList.add("qr-root--empty");
  if (state.questionEl) {
    state.questionEl.innerHTML = `
      <div class="qr-empty-message">
        Aucune forme disponible avec ces réglages.
      </div>
    `;
  }
  if (state.responseSlotEl) {
    state.responseSlotEl.innerHTML = "";
    state.responseInputEl = null;
  }
  state.responseDraftValue = "";
  state.pendingValidationValue = "";
  if (state.correctionEl) {
    state.correctionEl.classList.add("qr-correction--empty");
    state.correctionEl.setAttribute("aria-hidden", "true");
    state.correctionEl.innerHTML = "";
  }
}

function bindResponseEvents(state) {
  const input = state.responseInputEl;
  if (!input) return;
  teardownResponseInputBindings(state);

  const abortController = new AbortController();
  const { signal } = abortController;
  state.responseInputAbortController = abortController;

  const capturePendingValidationValue = (event) => {
    if (state.answerRevealed) return;
    if (document.activeElement !== input) return;
    const target = event.target instanceof Node ? event.target : null;
    if (target && input.contains(target)) return;
    const snapshot = String(input.value ?? "");
    state.pendingValidationValue = snapshot;
    state.responseDraftValue = snapshot;
  };

  input.addEventListener("beforeinput", (event) => {
    if (state.answerRevealed) return;
    if (!shouldIgnoreReplacementInput(event)) return;
    event.preventDefault();
    input.value = state.responseDraftValue;
  }, { signal });

  input.addEventListener("focus", () => {
    state.pendingValidationValue = "";
  }, { signal });

  input.addEventListener("input", (event) => {
    if (state.answerRevealed) return;
    if (state.pendingValidationValue) {
      if (document.activeElement !== input) {
        input.value = state.pendingValidationValue;
        state.responseDraftValue = state.pendingValidationValue;
        syncValidateState(state);
        return;
      }
      state.pendingValidationValue = "";
    }
    if (shouldIgnoreReplacementInput(event)) {
      input.value = state.responseDraftValue;
      syncValidateState(state);
      return;
    }
    state.responseDraftValue = String(input.value ?? "");
    syncValidateState(state);
  }, { signal });

  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    if (state.answerRevealed) return;
    if (!canSubmitAnswer(state)) return;
    event.preventDefault();
    state.pendingValidationValue = String(input.value ?? "");
    state.responseDraftValue = state.pendingValidationValue;
    requestReveal(state);
  }, { signal });

  input.addEventListener("blur", () => {
    if (state.answerRevealed) return;
    if (state.pendingValidationValue) {
      input.value = state.pendingValidationValue;
      state.responseDraftValue = state.pendingValidationValue;
      return;
    }
    if (String(input.value ?? "") !== state.responseDraftValue) {
      input.value = state.responseDraftValue;
    }
  }, { signal });

  document.addEventListener("pointerdown", capturePendingValidationValue, { capture: true, signal });
  document.addEventListener("touchstart", capturePendingValidationValue, { capture: true, signal });
  document.addEventListener("mousedown", capturePendingValidationValue, { capture: true, signal });
}

function revealAnswer(state) {
  if (!state.currentQuestion) return;

  const submittedAnswer = getCurrentResponseValue(state);
  state.submittedAnswer = submittedAnswer;
  state.pendingValidationValue = "";
  state.answerRevealed = true;
  state.answerDisplayMode = "correction";
  const evaluation = getStoredEvaluation(state);

  state.root?.classList.add("qr-root--revealed");

  if (state.showResponseBox) {
    state.root?.classList.toggle("qr-root--correct", evaluation.isCorrect);
    state.root?.classList.toggle("qr-root--incorrect", !evaluation.isCorrect);
    renderDisplayedResponse(state);
  } else {
    state.root?.classList.remove("qr-root--correct", "qr-root--incorrect");
    renderFreeAnswer(state);
  }
}

function requestReveal(state) {
  state.latestContext?.services?.requestAnswerPhase?.({
    manual: false,
    showAnswerNow: true,
    wasCorrect: isCurrentAnswerCorrect(state)
  });
}

function renderDisplayedResponse(state) {
  if (!state.responseSlotEl || !state.currentQuestion) return;
  const evaluation = getStoredEvaluation(state);
  const showStudentAnswer = canToggleStudentAnswerDisplay(state) && normalizeAnswerDisplayMode(state.answerDisplayMode) === "student";

  state.responseSlotEl.classList.toggle("qr-response-slot--correct", evaluation.isCorrect);
  state.responseSlotEl.classList.toggle("qr-response-slot--incorrect", !evaluation.isCorrect);
  state.responseSlotEl.innerHTML = showStudentAnswer
    ? renderDisplayBox(state.submittedAnswer, { student: true, correct: evaluation.isCorrect })
    : renderDisplayBox(state.currentQuestion.expectedAnswer, { correct: evaluation.isCorrect });
  state.responseInputEl = null;
  renderCorrectionExplanation(state);
}

function renderFreeAnswer(state) {
  if (!state.responseSlotEl || !state.currentQuestion) return;
  state.responseSlotEl.classList.remove("qr-response-slot--correct", "qr-response-slot--incorrect");
  state.responseSlotEl.innerHTML = renderDisplayBox(state.currentQuestion.expectedAnswer, { free: true });
  state.responseInputEl = null;
  renderCorrectionExplanation(state);
}

function renderCorrectionExplanation(state) {
  if (!state.correctionEl || !state.currentQuestion) return;
  const explanation = String(state.currentQuestion.explanation || "").trim();
  if (!explanation) {
    state.correctionEl.classList.add("qr-correction--empty");
    state.correctionEl.setAttribute("aria-hidden", "true");
    state.correctionEl.innerHTML = "";
    return;
  }
  state.correctionEl.classList.remove("qr-correction--empty");
  state.correctionEl.setAttribute("aria-hidden", "false");
  state.correctionEl.innerHTML = renderSimpleMarkupToHtml(explanation);
}

function renderInputMarkup() {
  return `
    <label class="tool-answer-box qr-answer-box qr-answer-box--input" for="qr_response_input">
      <input
        class="tool-answer-input qr-answer-input"
        id="qr_response_input"
        data-qr-response-input
        type="text"
        autocomplete="off"
        autocapitalize="none"
        autocorrect="off"
        spellcheck="false"
        data-gramm="false"
        data-gramm_editor="false"
        data-enable-grammarly="false"
        aria-label="Réponse"
      />
    </label>
  `;
}

function renderDisplayBox(value, { correct = false, student = false, free = false } = {}) {
  const classNames = [
    "tool-answer-box",
    "tool-answer-box--display",
    "qr-answer-box",
    "qr-answer-box--display",
    correct ? "is-correct" : "is-incorrect",
    student ? "is-student-answer" : "",
    free ? "is-free-answer" : ""
  ].filter(Boolean).join(" ");

  return `
    <div class="${escapeHtml(classNames)}">
      ${escapeHtml(String(value ?? ""))}
    </div>
  `;
}

function renderFreePlaceholderMarkup() {
  return `
    <div class="tool-answer-box qr-answer-box qr-answer-box--placeholder">
      Réponse à trouver
    </div>
  `;
}

function canSubmitAnswer(state) {
  if (!state.showResponseBox || !state.responseInputEl || state.answerRevealed || !state.currentQuestion) {
    return false;
  }
  return getCurrentResponseValue(state).length > 0;
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

function syncValidateState(state) {
  state.latestContext?.services?.notifyValidationStateChanged?.();
}

function updateInstructionDisplay(state) {
  const fallback = state.currentQuestion?.prompt ? "Conjugue le verbe demandé." : "";
  const text = resolveQuestionInstructionText(state.latestContext, fallback);
  setToolInstructionText(state.instructionEl, text);
}

function getCurrentResponseValue(state) {
  if (state.answerRevealed && state.submittedAnswer != null) {
    return String(state.submittedAnswer ?? "").trim();
  }

  const pendingValue = String(state.pendingValidationValue ?? "");
  const liveValue = state.responseInputEl ? String(state.responseInputEl.value ?? "") : "";
  const draftValue = String(state.responseDraftValue ?? "");
  return String(pendingValue || draftValue || liveValue || state.submittedAnswer || "").trim();
}

function getStoredEvaluation(state) {
  return evaluateAnswer(state.currentQuestion, state.submittedAnswer ?? "");
}

function getCurrentEvaluation(state) {
  return evaluateAnswer(state.currentQuestion, getCurrentResponseValue(state));
}

function isCurrentAnswerCorrect(state) {
  if (!state.showResponseBox || !state.responseInputEl || !state.currentQuestion) return false;
  return getCurrentEvaluation(state).isCorrect;
}

function canToggleStudentAnswerDisplay(state) {
  if (!state.showResponseBox || !state.answerRevealed || !state.currentQuestion) return false;
  const submittedAnswer = String(state.submittedAnswer || "").trim();
  if (!submittedAnswer) return false;
  return !getStoredEvaluation(state).isCorrect;
}

function getShellAnswerDisplayState(state) {
  return {
    canToggle: canToggleStudentAnswerDisplay(state),
    mode: canToggleStudentAnswerDisplay(state)
      ? normalizeAnswerDisplayMode(state.answerDisplayMode)
      : "correction",
    transitionTargets: [state.responseSlotEl]
  };
}

function applyShellAnswerDisplayMode(state, mode) {
  if (!state.showResponseBox || !state.answerRevealed || !state.responseSlotEl) return false;
  if (!canToggleStudentAnswerDisplay(state)) {
    state.answerDisplayMode = "correction";
    renderDisplayedResponse(state);
    return false;
  }
  state.answerDisplayMode = normalizeAnswerDisplayMode(mode);
  renderDisplayedResponse(state);
  return true;
}

function normalizeAnswerDisplayMode(value) {
  return String(value ?? "").trim().toLowerCase() === "student" ? "student" : "correction";
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
  teardownResponseInputBindings(state);
  if (container) container.innerHTML = "";
  state.container = null;
  state.root = null;
  state.instructionEl = null;
  state.questionEl = null;
  state.responseSlotEl = null;
  state.correctionEl = null;
  state.responseInputEl = null;
  state.currentQuestion = null;
  state.questions = [];
  state.deck = [];
  state.deckIndex = 0;
  state.loadedSettingsSignature = "";
  state.loadingPromise = null;
  state.answerRevealed = false;
  state.submittedAnswer = "";
  state.responseDraftValue = "";
  state.pendingValidationValue = "";
  state.answerDisplayMode = "correction";
}

function shouldIgnoreReplacementInput(event) {
  const inputType = String(event?.inputType || "").trim().toLowerCase();
  return inputType === "insertreplacementtext";
}

function teardownResponseInputBindings(state) {
  state.responseInputAbortController?.abort?.();
  state.responseInputAbortController = null;
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  ensureToolInstructionStyles();

  const simpleMarkupHref = new URL("../../shared/simple-markup.css", import.meta.url).href;
  if (!document.querySelector(`link[data-simple-markup-style="${simpleMarkupHref}"]`)) {
    const simpleMarkupLink = document.createElement("link");
    simpleMarkupLink.rel = "stylesheet";
    simpleMarkupLink.href = simpleMarkupHref;
    simpleMarkupLink.dataset.simpleMarkupStyle = simpleMarkupHref;
    document.head.appendChild(simpleMarkupLink);
  }

  const href = new URL("./activity.css", import.meta.url).href;
  if (document.querySelector(`link[data-qr-activity-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.qrActivityStyle = href;
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
