import {
  buildQuestionFromItem,
  createQuestionDeck,
  evaluateAnswer,
  filterQuestionItemsBySelection,
  getQuestionSelectionSignature,
  normalizeQuestionItems,
  normalizeSettings
} from "./model.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveQuestionInstructionText,
  setToolInstructionText
} from "../../shared/tool-instruction.js";
import { renderSimpleMarkupToHtml } from "../../shared/simple-markup.js";
import { createNumericAnswerControl, renderNumericAnswerDisplayMarkup } from "../../shared/tool-ui/numeric-answer.js";
import { bindNumericKeypadEvents, renderNumericKeypad } from "../../shared/tool-ui/numeric-keypad.js";
import { scheduleQuestionAutoFit, teardownQuestionAutoFit } from "../../shared/tool-ui/question-auto-fit.js";
import { listPublicQuestionBankItemsForSpace } from "../../shared/public-api.js";
import {
  createFlashRuntimeState,
  syncFlashRuntimeSettings,
  resetFlashRuntimeQuestion,
  clearFlashRuntimeTimers,
  ensureFlashRuntimeStyles,
  getFlashReadyDelayMs,
  renderFlashCueMarkup,
  renderFlashItemMarkup,
  setFlashAnswerVisible,
  setFlashQuestionHidden,
  showFlashReplayButton,
  shouldDelayFlashAnswers,
  wait
} from "../flash-shared/runtime.js";

let stylesInjected = false;

export function createActivity(initialContext = {}) {
  injectStyles();
  if (initialContext?.flashRuntime?.enabled === true) ensureFlashRuntimeStyles();
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
    answerControl: null,
    currentQuestion: null,
    questions: [],
    deck: [],
    deckIndex: 0,
    loadedBankId: "",
    loadedDrawMode: "",
    loadedQuestionSelectionSignature: "",
    loadingPromise: null,
    answerRevealed: false,
    submittedAnswer: "",
    responseDraftValue: "",
    pendingValidationValue: "",
    answerDisplayMode: "correction",
    showResponseBox: shouldShowResponseBox(initialContext),
    flash: createFlashRuntimeState(initialContext),
  };
}

function syncRuntimeState(state, context = state.latestContext) {
  state.showResponseBox = shouldShowResponseBox(context);
  syncFlashRuntimeSettings(state.flash, context?.settings || state.currentSettings || {});
}

function renderShell(state) {
  const container = state.container;
  if (!container) return;

  syncRuntimeState(state);

  container.innerHTML = `
    <div class="tool-runtime tool-runtime--question-reponse${state.flash?.enabled ? " tool-runtime--flash tool-runtime--flash-question-reponse" : ""} qr-root${state.showResponseBox ? " qr-root--boxed" : " qr-root--free"}">
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

  await renderQuestion(state);
  syncValidateState(state);
  if (!state.flash?.enabled) {
    focusPrimaryInput(state);
  }
}

async function ensureQuestionsLoaded(state, settings, context = {}) {
  const bankId = String(settings.bankId || "").trim();
  const accessCode = resolveAccessCode(context);
  const drawMode = String(settings.drawMode || "").trim();
  const questionSelectionSignature = getQuestionSelectionSignature(settings.questionSelection);

  if (!bankId) {
    state.questions = [];
    state.deck = [];
    state.deckIndex = 0;
    state.loadedBankId = "";
    state.loadedDrawMode = "";
    state.loadedQuestionSelectionSignature = "";
    return;
  }

  if (
    state.loadedBankId === bankId
    && state.loadedDrawMode === drawMode
    && state.loadedQuestionSelectionSignature === questionSelectionSignature
    && state.questions.length
  ) return;

  if (state.loadingPromise) await state.loadingPromise;

  if (
    state.loadedBankId === bankId
    && state.loadedDrawMode === drawMode
    && state.loadedQuestionSelectionSignature === questionSelectionSignature
    && state.questions.length
  ) return;

  state.loadingPromise = (async () => {
    let items = [];

    if (accessCode) {
      try {
        items = await listPublicQuestionBankItemsForSpace(accessCode, bankId);
      } catch {
        items = [];
      }
    }

    if (!items.length) {
      items = settings.bankItemsSnapshot;
    }

    const normalizedItems = normalizeQuestionItems(items);
    const selectedItems = filterQuestionItemsBySelection(normalizedItems, settings.questionSelection);
    state.questions = selectedItems.map(buildQuestionFromItem).filter((question) => question.prompt && question.expectedAnswer);
    state.deck = createQuestionDeck(selectedItems, settings.drawMode);
    state.deckIndex = 0;
    state.loadedBankId = bankId;
    state.loadedDrawMode = drawMode;
    state.loadedQuestionSelectionSignature = questionSelectionSignature;
  })();

  try {
    await state.loadingPromise;
  } finally {
    state.loadingPromise = null;
  }
}

function resolveAccessCode(context = {}) {
  return String(
    context?.accessCode
    || context?.spaceAccessCode
    || context?.teacherSpace?.access_code
    || context?.teacher_space?.access_code
    || ""
  ).trim();
}

function pickNextQuestion(state, settings) {
  if (!state.questions.length) return null;

  if (!state.deck.length || state.deckIndex >= state.deck.length) {
    state.deck = createQuestionDeck(state.questions, settings.drawMode);
    state.deckIndex = 0;
  }

  const nextQuestion = state.deck[state.deckIndex] || state.questions[0];
  state.deckIndex += 1;
  return nextQuestion ? {
    ...nextQuestion,
    answerType: settings.answerType
  } : null;
}

async function renderQuestion(state) {
  updateInstructionDisplay(state);
  state.root?.classList.remove("qr-root--correct", "qr-root--incorrect", "qr-root--revealed", "qr-root--empty");
  state.root?.classList.toggle("qr-root--boxed", state.showResponseBox);
  state.root?.classList.toggle("qr-root--free", !state.showResponseBox);

  if (!state.currentQuestion) {
    renderEmptyQuestion(state);
    return;
  }

  const questionHtml = `<span class="qr-question-text-inner">${renderSimpleMarkupToHtml(state.currentQuestion.prompt)}</span>`;
  if (state.questionEl && !state.flash?.enabled) {
    state.questionEl.innerHTML = questionHtml;
    clearQrQuestionSizePreset(state.questionEl);
    scheduleQrQuestionAutoFit(state);
  }

  teardownResponseInputBindings(state);

  if (state.correctionEl) {
    state.correctionEl.classList.add("qr-correction--empty");
    state.correctionEl.setAttribute("aria-hidden", "true");
    state.correctionEl.innerHTML = "";
  }

  if (state.responseSlotEl) {
    state.responseDraftValue = "";
    state.pendingValidationValue = "";

    if (!state.showResponseBox) {
      state.responseSlotEl.classList.remove("qr-response-slot--numeric");
      state.responseSlotEl.innerHTML = renderFreePlaceholderMarkup();
      state.responseInputEl = null;
    } else if (isNumericAnswerMode(state)) {
      renderNumericResponseInput(state);
    } else {
      state.responseSlotEl.classList.remove("qr-response-slot--numeric");
      state.responseSlotEl.innerHTML = renderInputMarkup();
      state.responseInputEl = state.responseSlotEl.querySelector("[data-qr-response-input]");
      bindResponseEvents(state);
    }
  }

  if (state.flash?.enabled) {
    await startFlashQuestion(state, questionHtml);
  }
}


async function startFlashQuestion(state, questionHtml = "") {
  if (!state.flash?.enabled || !state.questionEl) return;

  resetFlashRuntimeQuestion(state.flash);
  const sequenceId = state.flash.sequenceId;
  const answersAfterQuestion = shouldDelayFlashAnswers(state.flash);

  state.questionEl.innerHTML = renderFlashCueMarkup(state.flash.settings);
  setQrResponseVisible(state, !answersAfterQuestion);

  await wait(getFlashReadyDelayMs(state.flash.settings));
  if (!isSameFlashSequence(state, sequenceId)) return;

  state.questionEl.innerHTML = renderFlashItemMarkup(questionHtml);
  clearQrQuestionSizePreset(state.questionEl);
  scheduleQrQuestionAutoFit(state);
  bindFlashReplay(state, sequenceId);
  setQrResponseVisible(state, !answersAfterQuestion);

  if (!answersAfterQuestion) {
    focusPrimaryInput(state);
  }

  state.flash.hideTimer = window.setTimeout(() => {
    hideFlashItem(state, sequenceId, { allowReplay: true });
  }, state.flash.settings.flashDisplayMs);
}

function hideFlashItem(state, sequenceId, { allowReplay = true } = {}) {
  if (!isSameFlashSequence(state, sequenceId)) return;

  clearFlashRuntimeTimers(state.flash);
  state.flash.itemHidden = true;
  setFlashQuestionHidden(state.questionEl, true);
  setQrResponseVisible(state, true);

  const canReplay = allowReplay
    && state.flash.settings.flashAllowReplayOnce === true
    && state.flash.replayUsed !== true
    && state.answerRevealed !== true;
  showFlashReplayButton(state.questionEl, canReplay);

  focusPrimaryInput(state);
  syncValidateState(state);
}

function bindFlashReplay(state, sequenceId) {
  const button = state.questionEl?.querySelector?.("[data-flash-replay]");
  if (!button) return;
  button.addEventListener("click", () => {
    if (!isSameFlashSequence(state, sequenceId)) return;
    if (state.answerRevealed || state.flash.replayUsed) return;

    state.flash.replayUsed = true;
    showFlashReplayButton(state.questionEl, false);
    setFlashQuestionHidden(state.questionEl, false);
    scheduleQrQuestionAutoFit(state);

    state.flash.replayTimer = window.setTimeout(() => {
      hideFlashItem(state, sequenceId, { allowReplay: false });
    }, state.flash.settings.flashDisplayMs);
  });
}

function finalizeFlashBeforeReveal(state) {
  if (!state.flash?.enabled) return;
  clearFlashRuntimeTimers(state.flash);
  state.flash.itemHidden = true;
  setFlashQuestionHidden(state.questionEl, true);
  showFlashReplayButton(state.questionEl, false);
  setQrResponseVisible(state, true);
}

function setQrResponseVisible(state, visible) {
  state.flash.answerVisible = visible !== false;
  setFlashAnswerVisible(state.responseSlotEl, state.flash.answerVisible);
  if (state.responseInputEl) {
    state.responseInputEl.disabled = !state.flash.answerVisible || state.answerRevealed;
  }
}

function isFlashAnswerVisible(state) {
  return !state.flash?.enabled || state.flash.answerVisible !== false;
}

function isSameFlashSequence(state, sequenceId) {
  return state.flash?.enabled === true && state.flash.sequenceId === sequenceId;
}

function renderEmptyQuestion(state) {
  clearFlashRuntimeTimers(state.flash);
  teardownResponseInputBindings(state);
  teardownQuestionAutoFit(state.questionEl);
  state.root?.classList.add("qr-root--empty");
  if (state.questionEl) {
    state.questionEl.innerHTML = `
      <div class="tool-empty-message qr-empty-message">
        Aucune question disponible dans la banque sélectionnée.
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
  finalizeFlashBeforeReveal(state);

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
  const value = showStudentAnswer ? state.submittedAnswer : state.currentQuestion.expectedAnswer;

  teardownResponseInputBindings(state);
  state.responseSlotEl.classList.toggle("qr-response-slot--correct", evaluation.isCorrect);
  state.responseSlotEl.classList.toggle("qr-response-slot--incorrect", !evaluation.isCorrect);
  state.responseSlotEl.innerHTML = isNumericAnswerMode(state)
    ? renderNumericDisplayBox(value, { student: showStudentAnswer, correct: evaluation.isCorrect })
    : renderDisplayBox(value, { student: showStudentAnswer, correct: evaluation.isCorrect });
  state.responseInputEl = null;
  renderCorrectionExplanation(state);
}

function renderFreeAnswer(state) {
  if (!state.responseSlotEl || !state.currentQuestion) return;
  teardownResponseInputBindings(state);
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

function renderNumericResponseInput(state) {
  if (!state.responseSlotEl) return;

  teardownResponseInputBindings(state);
  state.responseSlotEl.classList.add("qr-response-slot--numeric");
  state.responseSlotEl.innerHTML = `
    <div class="qr-numeric-response">
      <div class="qr-numeric-response-input-host" id="qr_numeric_response_host"></div>
      ${renderNumericKeypad({
        rootClassName: "qr-numeric-keypad",
        buttonClassName: "qr-numeric-keypad-button",
        clearButtonClassName: "qr-numeric-keypad-button--clear",
        dataAttribute: "data-qr-numeric-key",
        ariaLabel: "Clavier numérique"
      })}
    </div>
  `;

  const host = state.responseSlotEl.querySelector("#qr_numeric_response_host");
  state.answerControl = createNumericAnswerControl({
    id: "qr_numeric_response_input",
    className: "qr-numeric-answer",
    ariaLabel: "Réponse",
    value: "",
    maxLength: getExpectedAnswerMaxLength(state),
    captureKeyboard: !state.flash?.enabled,
    captureRoot: state.root,
    onInput: (value) => {
      if (state.answerRevealed) return;
      state.responseDraftValue = String(value || "");
      state.pendingValidationValue = "";
      syncValidateState(state);
    },
    onSubmit: () => {
      if (state.answerRevealed) return;
      if (!canSubmitAnswer(state)) return;
      requestReveal(state);
    }
  });
  host?.appendChild(state.answerControl.element);
  state.responseInputEl = state.answerControl.input;

  const abortController = new AbortController();
  const { signal } = abortController;
  state.responseInputAbortController = abortController;
  bindNumericKeypadEvents({
    root: state.responseSlotEl,
    control: state.answerControl,
    signal,
    dataAttribute: "data-qr-numeric-key",
    onAfterInput: () => syncValidateState(state)
  });
}

function renderNumericDisplayBox(value, { correct = false, student = false } = {}) {
  const className = [
    "qr-answer-box",
    "qr-answer-box--display",
    "qr-numeric-answer",
    correct ? "is-correct" : "is-incorrect",
    student ? "is-student-answer" : ""
  ].filter(Boolean).join(" ");

  return renderNumericAnswerDisplayMarkup(value, {
    className,
    ariaLabel: student ? "Réponse de l’élève" : "Correction"
  });
}

function getExpectedAnswerMaxLength(state) {
  return String(state.currentQuestion?.expectedAnswer || "").trim().length || null;
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
  if (!state.showResponseBox || !isFlashAnswerVisible(state) || !state.responseInputEl || state.answerRevealed || !state.currentQuestion) {
    return false;
  }
  return getCurrentResponseValue(state).length > 0;
}

function focusPrimaryInput(state) {
  if (!state.showResponseBox || !isFlashAnswerVisible(state) || !state.responseInputEl) return;
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

function scheduleQrQuestionAutoFit(state) {
  scheduleQuestionAutoFit(state.questionEl, {
    minFontSize: 12,
    step: 2,
    mediaMaxWidthRatio: 0.99,
    mediaMaxHeightRatio: 0.98
  });
}

function clearQrQuestionSizePreset(element) {
  if (!element) return;
  element.classList.remove("qr-question--fit-tiny", "qr-question--fit-short");
  delete element.dataset.qrQuestionSizePreset;
  element.style.removeProperty("font-size");
  element.style.removeProperty("line-height");
  element.style.removeProperty("--tool-question-font-size");
  element.querySelectorAll(".qr-question-text-inner, .flash-item-inner .qr-question-text-inner, .simple-markup-strong, .simple-markup-em, .simple-markup-highlight").forEach((target) => {
    target.style.removeProperty("font-size");
    target.style.removeProperty("line-height");
  });
}

function updateInstructionDisplay(state) {
  const settings = normalizeSettings(state.latestContext?.settings || {});
  const fallback = settings.bankInstruction || (state.currentQuestion?.prompt ? "Réponds à la question." : "");
  const text = resolveQuestionInstructionText(state.latestContext, fallback);
  setToolInstructionText(state.instructionEl, text);
}

function getCurrentResponseValue(state) {
  if (state.answerRevealed && state.submittedAnswer != null) {
    return String(state.submittedAnswer ?? "").trim();
  }

  if (isNumericAnswerMode(state) && state.answerControl) {
    return String(state.answerControl.getValue?.() ?? "").trim();
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
  if (!state.showResponseBox || !isFlashAnswerVisible(state) || !state.responseInputEl || !state.currentQuestion) return false;
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
      : "correction"
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

function isNumericAnswerMode(state) {
  return normalizeSettings(state.latestContext?.settings || {}).answerType === "number";
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
  clearFlashRuntimeTimers(state.flash);
  teardownResponseInputBindings(state);
  teardownQuestionAutoFit(state.questionEl);
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
  state.loadedBankId = "";
  state.loadedDrawMode = "";
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
  state.answerControl?.destroy?.();
  state.answerControl = null;
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
