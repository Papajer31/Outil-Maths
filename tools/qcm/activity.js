import { listPublicQuestionBankItemsForSpace } from "../../shared/public-api.js";
import { renderToolInstruction, setToolInstructionText, ensureToolInstructionStyles, resolveQuestionInstructionText } from "../../shared/tool-instruction.js";
import { renderSimpleMarkupToHtml } from "../../shared/simple-markup.js";
import {
  createQuestionDeck,
  evaluateChoice,
  normalizeQcmItems,
  normalizeSettings
} from "./model.js";

let stylesInjected = false;

export function createActivity(initialContext = {}) {
  injectStyles();

  const state = createRuntimeState(initialContext);

  return {
    mount(container, context = initialContext) {
      state.container = container;
      state.latestContext = context ?? state.latestContext;
      syncRuntimeState(state, state.latestContext);
      renderShell(state);
    },

    async nextQuestion(container, context = state.latestContext) {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      await loadNextQuestion(state, state.latestContext);
      return state.currentQuestion;
    },

    showAnswer(container, context = state.latestContext) {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      syncRuntimeState(state, state.latestContext);
      revealAnswer(state);
    },

    getAnswerState() {
      if (!state.currentQuestion) return { answered: false, correct: false };
      const evaluation = state.answerRevealed
        ? getStoredEvaluation(state)
        : getCurrentEvaluation(state);

      return {
        answered: Boolean(state.selectedChoiceId),
        correct: evaluation.isCorrect
      };
    },

    supportsShellValidation(context = state.latestContext) {
      return shouldShowChoicesAsResponse(context);
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
    choicesEl: null,
    correctionEl: null,
    currentQuestion: null,
    questions: [],
    deck: [],
    deckIndex: 0,
    loadedBankId: "",
    loadedDrawMode: "",
    loadedShuffleChoices: null,
    loadedMaxChoiceCount: null,
    loadingPromise: null,
    answerRevealed: false,
    selectedChoiceId: "",
    submittedChoiceId: "",
    showChoicesAsResponse: shouldShowChoicesAsResponse(initialContext),
    choiceAbortController: null
  };
}

function syncRuntimeState(state, context = state.latestContext) {
  state.showChoicesAsResponse = shouldShowChoicesAsResponse(context);
}

function renderShell(state) {
  const container = state.container;
  if (!container) return;

  syncRuntimeState(state);

  container.innerHTML = `
    <div class="qcm-root${state.showChoicesAsResponse ? " qcm-root--boxed" : " qcm-root--free"}">
      ${renderToolInstruction({ id: "qcm_instruction" })}
      <div class="qcm-card" id="qcm_card">
        <div class="qcm-question" id="qcm_question"></div>
        <div class="qcm-choices" id="qcm_choices"></div>
        <div class="qcm-correction qcm-correction--empty" id="qcm_correction" aria-hidden="true"></div>
      </div>
    </div>
  `;

  state.root = container.querySelector(".qcm-root");
  state.instructionEl = container.querySelector("#qcm_instruction");
  state.questionEl = container.querySelector("#qcm_question");
  state.choicesEl = container.querySelector("#qcm_choices");
  state.correctionEl = container.querySelector("#qcm_correction");
  updateInstructionDisplay(state);
}

async function loadNextQuestion(state, context = {}) {
  syncRuntimeState(state, context);
  const settings = normalizeSettings(context?.settings);
  await ensureQuestionsLoaded(state, settings, context);

  state.answerRevealed = false;
  state.selectedChoiceId = "";
  state.submittedChoiceId = "";
  state.currentQuestion = pickNextQuestion(state, settings);

  renderQuestion(state);
  syncValidateState(state);
}

async function ensureQuestionsLoaded(state, settings, context = {}) {
  const bankId = String(settings.bankId || "").trim();
  const accessCode = resolveAccessCode(context);
  const drawMode = String(settings.drawMode || "").trim();
  const shuffleChoices = settings.shuffleChoices !== false;
  const maxChoiceCount = settings.maxChoiceCount;

  if (!bankId) {
    state.questions = [];
    state.deck = [];
    state.deckIndex = 0;
    state.loadedBankId = "";
    state.loadedDrawMode = "";
    state.loadedShuffleChoices = null;
    state.loadedMaxChoiceCount = null;
    return;
  }

  if (
    state.loadedBankId === bankId
    && state.loadedDrawMode === drawMode
    && state.loadedShuffleChoices === shuffleChoices
    && state.loadedMaxChoiceCount === maxChoiceCount
    && state.questions.length
  ) return;

  if (state.loadingPromise) await state.loadingPromise;

  if (
    state.loadedBankId === bankId
    && state.loadedDrawMode === drawMode
    && state.loadedShuffleChoices === shuffleChoices
    && state.loadedMaxChoiceCount === maxChoiceCount
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

    const normalizedItems = normalizeQcmItems(items);
    state.questions = normalizedItems;
    state.deck = createQuestionDeck(normalizedItems, settings.drawMode, { shuffleChoices, maxChoiceCount });
    state.deckIndex = 0;
    state.loadedBankId = bankId;
    state.loadedDrawMode = drawMode;
    state.loadedShuffleChoices = shuffleChoices;
    state.loadedMaxChoiceCount = maxChoiceCount;
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
    state.deck = createQuestionDeck(state.questions, settings.drawMode, {
      shuffleChoices: settings.shuffleChoices !== false,
      maxChoiceCount: settings.maxChoiceCount
    });
    state.deckIndex = 0;
  }

  const nextQuestion = state.deck[state.deckIndex] || state.deck[0] || null;
  state.deckIndex += 1;
  return nextQuestion;
}

function renderQuestion(state) {
  updateInstructionDisplay(state);
  state.root?.classList.remove("qcm-root--correct", "qcm-root--incorrect", "qcm-root--revealed", "qcm-root--empty");
  state.root?.classList.toggle("qcm-root--boxed", state.showChoicesAsResponse);
  state.root?.classList.toggle("qcm-root--free", !state.showChoicesAsResponse);

  if (!state.currentQuestion) {
    renderEmptyQuestion(state);
    return;
  }

  if (state.questionEl) {
    state.questionEl.innerHTML = renderSimpleMarkupToHtml(state.currentQuestion.prompt);
  }

  if (state.correctionEl) {
    state.correctionEl.classList.add("qcm-correction--empty");
    state.correctionEl.setAttribute("aria-hidden", "true");
    state.correctionEl.innerHTML = "";
  }

  renderChoices(state);
}

function renderEmptyQuestion(state) {
  teardownChoiceBindings(state);
  state.root?.classList.add("qcm-root--empty");
  if (state.questionEl) {
    state.questionEl.innerHTML = `
      <div class="qcm-empty-message">
        Aucun QCM disponible dans la banque sélectionnée.
      </div>
    `;
  }
  if (state.choicesEl) state.choicesEl.innerHTML = "";
  if (state.correctionEl) {
    state.correctionEl.classList.add("qcm-correction--empty");
    state.correctionEl.setAttribute("aria-hidden", "true");
    state.correctionEl.innerHTML = "";
  }
}

function renderChoices(state) {
  const choicesEl = state.choicesEl;
  if (!choicesEl || !state.currentQuestion) return;
  teardownChoiceBindings(state);

  choicesEl.classList.toggle("qcm-choices--readonly", state.answerRevealed || !state.showChoicesAsResponse);
  choicesEl.innerHTML = state.currentQuestion.choices.map((choice, index) => {
    const isSelected = String(choice.id) === String(state.selectedChoiceId || state.submittedChoiceId);
    const isSubmitted = String(choice.id) === String(state.submittedChoiceId);
    const showCorrect = state.answerRevealed && choice.isCorrect;
    const showIncorrect = state.answerRevealed && isSubmitted && !choice.isCorrect;
    const classNames = [
      "qcm-choice",
      isSelected && !state.answerRevealed ? "is-selected" : "",
      showCorrect ? "is-correct" : "",
      showIncorrect ? "is-incorrect" : "",
      state.answerRevealed ? "is-revealed" : ""
    ].filter(Boolean).join(" ");

    const disabled = state.answerRevealed || !state.showChoicesAsResponse;
    const tagName = state.showChoicesAsResponse ? "button" : "div";
    const attrs = state.showChoicesAsResponse
      ? `type="button" data-qcm-choice-id="${escapeHtml(choice.id)}" ${disabled ? "disabled" : ""}`
      : "";

    return `
      <${tagName} class="${escapeHtml(classNames)}" ${attrs}>
        <span class="qcm-choice-letter">${String.fromCharCode(65 + index)}</span>
        <span class="qcm-choice-text">${renderSimpleMarkupToHtml(choice.text)}</span>
      </${tagName}>
    `;
  }).join("");

  bindChoiceEvents(state);
  renderCorrectionExplanation(state);
}

function bindChoiceEvents(state) {
  if (!state.choicesEl || !state.showChoicesAsResponse || state.answerRevealed) return;
  teardownChoiceBindings(state);

  const abortController = new AbortController();
  const { signal } = abortController;
  state.choiceAbortController = abortController;

  state.choicesEl.querySelectorAll("[data-qcm-choice-id]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.answerRevealed) return;
      state.selectedChoiceId = String(button.dataset.qcmChoiceId || "");
      renderChoices(state);
      syncValidateState(state);
    }, { signal });
  });
}

function revealAnswer(state) {
  if (!state.currentQuestion) return;

  state.submittedChoiceId = state.selectedChoiceId || "";
  state.answerRevealed = true;
  const evaluation = getStoredEvaluation(state);

  state.root?.classList.add("qcm-root--revealed");

  if (state.showChoicesAsResponse) {
    state.root?.classList.toggle("qcm-root--correct", evaluation.isCorrect);
    state.root?.classList.toggle("qcm-root--incorrect", !evaluation.isCorrect);
  } else {
    state.root?.classList.remove("qcm-root--correct", "qcm-root--incorrect");
  }

  renderChoices(state);
}

function requestReveal(state) {
  state.latestContext?.services?.requestAnswerPhase?.({
    manual: false,
    showAnswerNow: true,
    wasCorrect: isCurrentAnswerCorrect(state)
  });
}

function renderCorrectionExplanation(state) {
  if (!state.correctionEl || !state.currentQuestion) return;
  const explanation = String(state.currentQuestion.explanation || "").trim();
  if (!state.answerRevealed || !explanation) {
    state.correctionEl.classList.add("qcm-correction--empty");
    state.correctionEl.setAttribute("aria-hidden", "true");
    state.correctionEl.innerHTML = "";
    return;
  }
  state.correctionEl.classList.remove("qcm-correction--empty");
  state.correctionEl.setAttribute("aria-hidden", "false");
  state.correctionEl.innerHTML = renderSimpleMarkupToHtml(explanation);
}

function canSubmitAnswer(state) {
  if (!state.showChoicesAsResponse || state.answerRevealed || !state.currentQuestion) {
    return false;
  }
  return Boolean(state.selectedChoiceId);
}

function syncValidateState(state) {
  state.latestContext?.services?.notifyValidationStateChanged?.();
}

function updateInstructionDisplay(state) {
  const fallback = state.currentQuestion?.prompt ? "Choisis la bonne réponse." : "";
  const text = resolveQuestionInstructionText(state.latestContext, fallback);
  setToolInstructionText(state.instructionEl, text);
}

function getStoredEvaluation(state) {
  return evaluateChoice(state.currentQuestion, state.submittedChoiceId ?? "");
}

function getCurrentEvaluation(state) {
  return evaluateChoice(state.currentQuestion, state.selectedChoiceId ?? "");
}

function isCurrentAnswerCorrect(state) {
  if (!state.showChoicesAsResponse || !state.currentQuestion) return false;
  return getCurrentEvaluation(state).isCorrect;
}

function shouldShowChoicesAsResponse(context = {}) {
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
  teardownChoiceBindings(state);
  if (container) container.innerHTML = "";
  state.container = null;
  state.root = null;
  state.instructionEl = null;
  state.questionEl = null;
  state.choicesEl = null;
  state.correctionEl = null;
  state.currentQuestion = null;
  state.questions = [];
  state.deck = [];
  state.deckIndex = 0;
  state.loadedBankId = "";
  state.loadedDrawMode = "";
  state.loadedShuffleChoices = null;
  state.loadedMaxChoiceCount = null;
  state.loadingPromise = null;
  state.answerRevealed = false;
  state.selectedChoiceId = "";
  state.submittedChoiceId = "";
}

function teardownChoiceBindings(state) {
  state.choiceAbortController?.abort?.();
  state.choiceAbortController = null;
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
  if (document.querySelector(`link[data-qcm-activity-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.qcmActivityStyle = href;
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
