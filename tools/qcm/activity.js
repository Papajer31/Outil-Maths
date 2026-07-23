import { listPublicQuestionBankItemsForSpace } from "../../shared/public-api.js";
import { renderToolInstruction, setToolInstructionText, ensureToolInstructionStyles, resolveQuestionInstructionText } from "../../shared/tool-instruction.js";
import { renderSimpleMarkupToHtml } from "../../shared/simple-markup.js";
import { scheduleQuestionAutoFit, teardownQuestionAutoFit } from "../../shared/tool-ui/question-auto-fit.js";
import { loadToolAssetsManifest } from "../../shared/tool-assets/tool-assets.js";
import {
  createQuestionDeck,
  evaluateChoice,
  filterQcmItemsBySelection,
  getQcmContentPlainText,
  hasQcmContent,
  normalizeQcmContent,
  normalizeQcmItems,
  normalizeSettings,
  qcmContentHasImage,
  getQuestionSelectionSignature
} from "./model.js";
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
    cardEl: null,
    instructionEl: null,
    questionEl: null,
    choicesEl: null,
    correctionEl: null,
    currentQuestion: null,
    currentSettings: normalizeSettings(initialContext?.settings),
    questions: [],
    deck: [],
    deckIndex: 0,
    loadedBankId: "",
    loadedDrawMode: "",
    loadedShuffleChoices: null,
    loadedMaxChoiceCount: null,
    loadedQuestionSelectionSignature: "",
    loadingPromise: null,
    assetsManifest: null,
    assetsLoadingPromise: null,
    answerRevealed: false,
    selectedChoiceId: "",
    submittedChoiceId: "",
    showChoicesAsResponse: shouldShowChoicesAsResponse(initialContext),
    choiceAbortController: null,
    flash: createFlashRuntimeState(initialContext)
  };
}

function syncRuntimeState(state, context = state.latestContext) {
  state.showChoicesAsResponse = shouldShowChoicesAsResponse(context);
  state.currentSettings = normalizeSettings(context?.settings || state.currentSettings);
  syncFlashRuntimeSettings(state.flash, context?.settings || state.currentSettings || {});
}

function renderShell(state) {
  const container = state.container;
  if (!container) return;

  syncRuntimeState(state);

  container.innerHTML = `
    <div class="tool-runtime tool-runtime--qcm${state.flash?.enabled ? " tool-runtime--flash tool-runtime--flash-qcm" : ""} qcm-root${state.showChoicesAsResponse ? " qcm-root--boxed" : " qcm-root--free"}">
      ${renderToolInstruction({ id: "qcm_instruction" })}
      <div class="tool-stage tool-panel qcm-card" id="qcm_card">
        <div class="tool-question tool-question--large qcm-question" id="qcm_question"></div>
        <div class="tool-choice-grid qcm-choices" id="qcm_choices"></div>
        <div class="tool-feedback tool-correction qcm-correction qcm-correction--empty" id="qcm_correction" aria-hidden="true"></div>
      </div>
    </div>
  `;

  state.root = container.querySelector(".qcm-root");
  state.cardEl = container.querySelector("#qcm_card");
  state.instructionEl = container.querySelector("#qcm_instruction");
  state.questionEl = container.querySelector("#qcm_question");
  state.choicesEl = container.querySelector("#qcm_choices");
  state.correctionEl = container.querySelector("#qcm_correction");
  updateInstructionDisplay(state);
  applyLayoutClasses(state);
}

async function loadNextQuestion(state, context = {}) {
  syncRuntimeState(state, context);
  const settings = normalizeSettings(context?.settings);
  state.currentSettings = settings;
  await ensureQuestionsLoaded(state, settings, context);
  await ensureAssetsLoaded(state);

  state.answerRevealed = false;
  state.selectedChoiceId = "";
  state.submittedChoiceId = "";
  state.currentQuestion = pickNextQuestion(state, settings);

  await renderQuestion(state);
  syncValidateState(state);
}

async function ensureAssetsLoaded(state) {
  if (state.assetsManifest) return state.assetsManifest;
  if (state.assetsLoadingPromise) return state.assetsLoadingPromise;

  state.assetsLoadingPromise = loadToolAssetsManifest()
    .then((manifest) => {
      state.assetsManifest = manifest;
      return manifest;
    })
    .finally(() => {
      state.assetsLoadingPromise = null;
    });

  return state.assetsLoadingPromise;
}

async function ensureQuestionsLoaded(state, settings, context = {}) {
  const bankId = String(settings.bankId || "").trim();
  const accessCode = resolveAccessCode(context);
  const drawMode = String(settings.drawMode || "").trim();
  const shuffleChoices = settings.shuffleChoices !== false;
  const maxChoiceCount = settings.maxChoiceCount;
  const questionSelectionSignature = getQuestionSelectionSignature(settings.questionSelection);

  if (!bankId) {
    state.questions = [];
    state.deck = [];
    state.deckIndex = 0;
    state.loadedBankId = "";
    state.loadedDrawMode = "";
    state.loadedShuffleChoices = null;
    state.loadedMaxChoiceCount = null;
    state.loadedQuestionSelectionSignature = "";
    return;
  }

  if (
    state.loadedBankId === bankId
    && state.loadedDrawMode === drawMode
    && state.loadedShuffleChoices === shuffleChoices
    && state.loadedMaxChoiceCount === maxChoiceCount
    && state.loadedQuestionSelectionSignature === questionSelectionSignature
    && state.questions.length
  ) return;

  if (state.loadingPromise) await state.loadingPromise;

  if (
    state.loadedBankId === bankId
    && state.loadedDrawMode === drawMode
    && state.loadedShuffleChoices === shuffleChoices
    && state.loadedMaxChoiceCount === maxChoiceCount
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

    const normalizedItems = normalizeQcmItems(items);
    const selectedItems = filterQcmItemsBySelection(normalizedItems, settings.questionSelection);
    state.questions = selectedItems;
    state.deck = createQuestionDeck(selectedItems, settings.drawMode, { shuffleChoices, maxChoiceCount });
    state.deckIndex = 0;
    state.loadedBankId = bankId;
    state.loadedDrawMode = drawMode;
    state.loadedShuffleChoices = shuffleChoices;
    state.loadedMaxChoiceCount = maxChoiceCount;
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

async function renderQuestion(state) {
  updateInstructionDisplay(state);
  state.root?.classList.remove("qcm-root--correct", "qcm-root--incorrect", "qcm-root--revealed", "qcm-root--empty");
  state.root?.classList.toggle("qcm-root--boxed", state.showChoicesAsResponse);
  state.root?.classList.toggle("qcm-root--free", !state.showChoicesAsResponse);
  applyLayoutClasses(state);

  if (!state.currentQuestion) {
    renderEmptyQuestion(state);
    return;
  }

  const questionHtml = renderQcmContent(state.currentQuestion.promptContent, state, { role: "question" });
  if (state.questionEl && !state.flash?.enabled) {
    state.questionEl.innerHTML = questionHtml;
    clearQcmQuestionSizePreset(state.questionEl);
  }

  if (state.correctionEl) {
    state.correctionEl.classList.add("qcm-correction--empty");
    state.correctionEl.setAttribute("aria-hidden", "true");
    state.correctionEl.innerHTML = "";
  }

  renderChoices(state);

  if (state.flash?.enabled) {
    await startFlashQuestion(state, questionHtml);
  } else {
    scheduleQcmQuestionAutoFit(state);
  }
}


async function startFlashQuestion(state, questionHtml = "") {
  if (!state.flash?.enabled || !state.questionEl) return;

  resetFlashRuntimeQuestion(state.flash);
  const sequenceId = state.flash.sequenceId;
  const answersAfterQuestion = shouldDelayFlashAnswers(state.flash);

  state.questionEl.innerHTML = renderFlashCueMarkup(state.flash.settings);
  setQcmChoicesVisible(state, !answersAfterQuestion);

  await wait(getFlashReadyDelayMs(state.flash.settings));
  if (!isSameFlashSequence(state, sequenceId)) return;

  state.questionEl.innerHTML = renderFlashItemMarkup(questionHtml);
  clearQcmQuestionSizePreset(state.questionEl);
  scheduleQcmQuestionAutoFit(state);
  bindFlashReplay(state, sequenceId);
  setQcmChoicesVisible(state, !answersAfterQuestion);

  state.flash.hideTimer = window.setTimeout(() => {
    hideFlashItem(state, sequenceId, { allowReplay: true });
  }, state.flash.settings.flashDisplayMs);
}

function hideFlashItem(state, sequenceId, { allowReplay = true } = {}) {
  if (!isSameFlashSequence(state, sequenceId)) return;

  clearFlashRuntimeTimers(state.flash);
  state.flash.itemHidden = true;
  setFlashQuestionHidden(state.questionEl, true);
  setQcmChoicesVisible(state, true);

  const canReplay = allowReplay
    && state.flash.settings.flashAllowReplayOnce === true
    && state.flash.replayUsed !== true
    && state.answerRevealed !== true;
  showFlashReplayButton(state.questionEl, canReplay);

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
    scheduleQcmQuestionAutoFit(state);

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
  setQcmChoicesVisible(state, true);
}

function setQcmChoicesVisible(state, visible) {
  state.flash.answerVisible = visible !== false;
  setFlashAnswerVisible(state.choicesEl, state.flash.answerVisible);
  updateChoiceStates(state);
  if (state.flash.answerVisible && state.showChoicesAsResponse && !state.answerRevealed) {
    bindChoiceEvents(state);
  } else {
    teardownChoiceBindings(state);
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
  teardownChoiceBindings(state);
  teardownQuestionAutoFit(state.questionEl);
  state.root?.classList.add("qcm-root--empty");
  if (state.questionEl) {
    state.questionEl.innerHTML = `
      <div class="tool-empty-message qcm-empty-message">
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

  applyLayoutClasses(state);
  choicesEl.style.setProperty("--qcm-choice-count", String(Math.max(1, state.currentQuestion.choices.length)));
  choicesEl.classList.toggle("qcm-choices--readonly", state.answerRevealed || !state.showChoicesAsResponse || !isFlashAnswerVisible(state));
  choicesEl.innerHTML = state.currentQuestion.choices.map((choice, index) => {
    const isSelected = String(choice.id) === String(state.selectedChoiceId || state.submittedChoiceId);
    const isSubmitted = String(choice.id) === String(state.submittedChoiceId);
    const showCorrect = state.answerRevealed && choice.isCorrect;
    const showIncorrect = state.answerRevealed && isSubmitted && !choice.isCorrect;
    const classNames = [
      "tool-choice-button",
      "qcm-choice",
      qcmContentHasImage(choice.content) ? "qcm-choice--media" : "qcm-choice--text-only",
      isSelected && !state.answerRevealed ? "is-selected" : "",
      showCorrect ? "is-correct" : "",
      showIncorrect ? "is-incorrect" : "",
      state.answerRevealed ? "is-revealed" : ""
    ].filter(Boolean).join(" ");

    const disabled = state.answerRevealed || !state.showChoicesAsResponse || !isFlashAnswerVisible(state);
    const tagName = state.showChoicesAsResponse ? "button" : "div";
    const choiceIdAttr = `data-qcm-choice-id="${escapeHtml(choice.id)}"`;
    const attrs = state.showChoicesAsResponse
      ? `type="button" ${choiceIdAttr} ${disabled ? "disabled" : ""}`
      : choiceIdAttr;

    return `
      <${tagName} class="${escapeHtml(classNames)}" ${attrs}>
        <span class="tool-choice-marker qcm-choice-letter">${String.fromCharCode(65 + index)}</span>
        <span class="tool-choice-text qcm-choice-text">${renderQcmContent(choice.content || choice.text, state, { role: "choice" })}</span>
      </${tagName}>
    `;
  }).join("");

  updateChoiceStates(state);
  bindChoiceEvents(state);
  renderCorrectionExplanation(state);
}

function bindChoiceEvents(state) {
  if (!state.choicesEl || !state.showChoicesAsResponse || !isFlashAnswerVisible(state) || state.answerRevealed) return;
  teardownChoiceBindings(state);

  const abortController = new AbortController();
  const { signal } = abortController;
  state.choiceAbortController = abortController;

  state.choicesEl.querySelectorAll("[data-qcm-choice-id]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.answerRevealed) return;
      state.selectedChoiceId = String(button.dataset.qcmChoiceId || "");
      updateChoiceStates(state);
      syncValidateState(state);
    }, { signal });
  });
}

function revealAnswer(state) {
  if (!state.currentQuestion) return;
  finalizeFlashBeforeReveal(state);

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

  updateChoiceStates(state);
  renderCorrectionExplanation(state);
}

function updateChoiceStates(state) {
  if (!state.choicesEl || !state.currentQuestion) return;

  const disabled = state.answerRevealed || !state.showChoicesAsResponse || !isFlashAnswerVisible(state);
  state.choicesEl.classList.toggle("qcm-choices--readonly", disabled);

  const choicesById = new Map(
    state.currentQuestion.choices.map((choice) => [String(choice.id), choice])
  );

  state.choicesEl.querySelectorAll(".qcm-choice[data-qcm-choice-id]").forEach((choiceEl) => {
    const choiceId = String(choiceEl.dataset.qcmChoiceId || "");
    const choice = choicesById.get(choiceId);
    if (!choice) return;

    const isSelected = choiceId === String(state.selectedChoiceId || state.submittedChoiceId || "");
    const isSubmitted = choiceId === String(state.submittedChoiceId || "");
    const showCorrect = state.answerRevealed && choice.isCorrect;
    const showIncorrect = state.answerRevealed && isSubmitted && !choice.isCorrect;

    choiceEl.classList.toggle("is-selected", isSelected && !state.answerRevealed);
    choiceEl.classList.toggle("is-correct", showCorrect);
    choiceEl.classList.toggle("is-incorrect", showIncorrect);
    choiceEl.classList.toggle("is-revealed", state.answerRevealed);

    if (choiceEl instanceof HTMLButtonElement) {
      choiceEl.disabled = disabled;
    }
  });
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

function renderQcmContent(content, state, { role = "choice" } = {}) {
  const normalized = normalizeQcmContent(content);
  if (!hasQcmContent(normalized)) return "";

  const imageHtml = qcmContentHasImage(normalized)
    ? renderQcmImage(normalized, state, { role })
    : "";
  const textHtml = String(normalized.text || "").trim()
    ? `<span class="qcm-content-text-inner">${renderSimpleMarkupToHtml(normalized.text)}</span>`
    : "";

  const kindClass = imageHtml && textHtml
    ? "qcm-content--image-text"
    : (imageHtml ? "qcm-content--image" : "qcm-content--text");

  return `
    <span class="qcm-content qcm-content--${escapeHtml(role)} ${kindClass}">
      ${imageHtml}
      ${textHtml ? `<span class="qcm-content-text">${textHtml}</span>` : ""}
    </span>
  `;
}

function renderQcmImage(content, state, { role = "choice" } = {}) {
  const image = resolveContentImage(content, state);
  if (!image.src) {
    const label = escapeHtml(content.assetId || content.src || "image");
    return `
      <span class="qcm-media-frame qcm-media-frame--missing qcm-media-frame--${escapeHtml(role)}">
        <span class="qcm-media-missing">Image introuvable<br><strong>${label}</strong></span>
      </span>
    `;
  }

  return `
    <span class="qcm-media-frame qcm-media-frame--${escapeHtml(role)}">
      <img class="qcm-media-img" src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}" draggable="false" loading="lazy" decoding="async">
    </span>
  `;
}

function resolveContentImage(content, state) {
  const normalized = normalizeQcmContent(content);
  const assetId = String(normalized.assetId || "").trim();
  if (assetId && state.assetsManifest?.assetsById?.has(assetId)) {
    const asset = state.assetsManifest.assetsById.get(assetId);
    return {
      src: asset?.url || "",
      alt: String(normalized.alt || asset?.alt || asset?.label || assetId).trim()
    };
  }

  const src = String(normalized.src || "").trim();
  if (src) {
    return {
      src,
      alt: String(normalized.alt || normalized.text || assetId || src).trim()
    };
  }

  return { src: "", alt: String(normalized.alt || normalized.text || assetId || "").trim() };
}

function applyLayoutClasses(state) {
  if (!state.root) return;
  const settings = normalizeSettings(state.currentSettings);
  const effectiveGlobalLayout = resolveEffectiveGlobalLayout(state, settings);
  const effectiveAnswersLayout = resolveEffectiveAnswersLayout(state, settings);
  const imageSize = settings.imageSize || "auto";

  setClassFromMap(state.root, {
    "qcm-layout--auto": settings.globalLayout === "auto",
    "qcm-layout--vertical": settings.globalLayout === "vertical",
    "qcm-layout--horizontal": settings.globalLayout === "horizontal",
    "qcm-layout--effective-vertical": effectiveGlobalLayout === "vertical",
    "qcm-layout--effective-horizontal": effectiveGlobalLayout === "horizontal",
    "qcm-answers--auto": settings.answersLayout === "auto",
    "qcm-answers--grid": settings.answersLayout === "grid",
    "qcm-answers--column": settings.answersLayout === "column",
    "qcm-answers--row": settings.answersLayout === "row",
    "qcm-answers--effective-grid": effectiveAnswersLayout === "grid",
    "qcm-answers--effective-column": effectiveAnswersLayout === "column",
    "qcm-answers--effective-row": effectiveAnswersLayout === "row",
    "qcm-image-size--auto": imageSize === "auto",
    "qcm-image-size--small": imageSize === "small",
    "qcm-image-size--medium": imageSize === "medium",
    "qcm-image-size--large": imageSize === "large"
  });
}

function resolveEffectiveGlobalLayout(state, settings) {
  if (settings.globalLayout === "vertical" || settings.globalLayout === "horizontal") return settings.globalLayout;
  const question = state.currentQuestion;
  if (!question) return "vertical";

  const hasQuestionImage = qcmContentHasImage(question.promptContent);
  const hasChoiceImage = Array.isArray(question.choices) && question.choices.some((choice) => qcmContentHasImage(choice.content));
  const availableWidth = Math.round(state.cardEl?.getBoundingClientRect?.().width || state.container?.getBoundingClientRect?.().width || 0);

  if (hasQuestionImage && hasChoiceImage && availableWidth >= 1050) return "horizontal";
  return "vertical";
}

function resolveEffectiveAnswersLayout(state, settings) {
  if (["grid", "column", "row"].includes(settings.answersLayout)) return settings.answersLayout;
  const choices = Array.isArray(state.currentQuestion?.choices) ? state.currentQuestion.choices : [];
  const count = choices.length;
  const hasMedia = choices.some((choice) => qcmContentHasImage(choice.content));
  const allShortText = choices.every((choice) => getQcmContentPlainText(choice.content, { fallbackToAssetId: false }).length <= 12);

  if (hasMedia) return count <= 3 ? "row" : "grid";
  if (count <= 3 && allShortText) return "row";
  if (count === 4 && allShortText) return "grid";
  return "column";
}

function setClassFromMap(element, classMap) {
  Object.entries(classMap).forEach(([className, enabled]) => {
    element.classList.toggle(className, Boolean(enabled));
  });
}

function canSubmitAnswer(state) {
  if (!state.showChoicesAsResponse || !isFlashAnswerVisible(state) || state.answerRevealed || !state.currentQuestion) {
    return false;
  }
  return Boolean(state.selectedChoiceId);
}

function syncValidateState(state) {
  state.latestContext?.services?.notifyValidationStateChanged?.();
}

function scheduleQcmQuestionAutoFit(state) {
  scheduleQuestionAutoFit(state.questionEl, {
    minFontSize: 12,
    step: 2,
    mediaMaxWidthRatio: 0.99,
    mediaMaxHeightRatio: 0.98
  });
}

function clearQcmQuestionSizePreset(element) {
  if (!element) return;
  element.classList.remove("qcm-question--fit-tiny", "qcm-question--fit-short");
  delete element.dataset.qcmQuestionSizePreset;
  element.style.removeProperty("font-size");
  element.style.removeProperty("line-height");
  element.style.removeProperty("--tool-question-font-size");
  getQcmQuestionFontTargets(element).forEach((target) => {
    target.style.removeProperty("font-size");
    target.style.removeProperty("line-height");
  });
}

function getQcmQuestionFontTargets(element) {
  const selectors = [
    ".flash-item-inner .qcm-content--question",
    ".flash-item-inner .qcm-content--question .qcm-content-text",
    ".flash-item-inner .qcm-content--question .qcm-content-text-inner",
    ".qcm-content--question",
    ".qcm-content--question .qcm-content-text",
    ".qcm-content--question .qcm-content-text-inner",
    ".simple-markup-strong",
    ".simple-markup-em",
    ".simple-markup-highlight"
  ];
  const targets = [];
  selectors.forEach((selector) => {
    element.querySelectorAll(selector).forEach((target) => {
      if (!targets.includes(target)) targets.push(target);
    });
  });
  return targets;
}

function updateInstructionDisplay(state) {
  const settings = normalizeSettings(state.latestContext?.settings || {});
  const fallback = settings.bankInstruction || (state.currentQuestion?.prompt ? "Choisis la bonne réponse." : "");
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
  if (!state.showChoicesAsResponse || !isFlashAnswerVisible(state) || !state.currentQuestion) return false;
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
  clearFlashRuntimeTimers(state.flash);
  teardownChoiceBindings(state);
  teardownQuestionAutoFit(state.questionEl);
  if (container) container.innerHTML = "";
  state.container = null;
  state.root = null;
  state.cardEl = null;
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
  state.assetsLoadingPromise = null;
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
