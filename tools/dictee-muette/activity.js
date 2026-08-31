import {
  INPUT_STYLES,
  normalizeSettings,
  getImageFolderName,
  setWordCatalog,
  setImageCatalog,
  pickQuestion,
  questionKey,
  evaluateAnswer,
  getHighlightedKeys,
  getAnswerLength
} from "./model.js";
import {
  listPublicPhonologyWords,
  listPublicImageAssetsInSystemFolder,
  getPublicImageAssetUrl
} from "../../shared/public-api.js";
import { createAlphabetAnswerControl } from "../../shared/tool-ui/alphabet-answer.js";
import {
  renderAlphabetKeyboard,
  bindAlphabetKeyboardEvents
} from "../../shared/tool-ui/alphabet-keyboard.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveQuestionInstructionText,
  setToolInstructionText
} from "../../shared/tool-instruction.js";

const DEFAULT_INSTRUCTION = "Écris le mot qui correspond à l’image.";
const IMAGE_BUCKET = "images";

let stylesReadyPromise = null;
let runtimeCatalogsPromise = null;

export function createActivity(initialContext = {}) {
  const state = createRuntimeState(initialContext);

  return {
    async mount(container, context = initialContext) {
      state.container = container;
      syncRuntimeState(state, context ?? state.latestContext);
      await Promise.all([
        injectActivityStyles(),
        ensureRuntimeCatalogs()
      ]);
      renderShell(state);
      syncValidationState(state);
    },

    async next(container, context = initialContext) {
      state.container = container || state.container;
      if (!state.container) return;

      syncRuntimeState(state, context ?? state.latestContext);
      await Promise.all([
        injectActivityStyles(),
        ensureRuntimeCatalogs()
      ]);

      if (!state.root || !state.root.isConnected) renderShell(state);
      loadNextQuestion(state);
    },

    showAnswer(container, context = initialContext) {
      state.container = container || state.container;
      syncRuntimeState(state, context ?? state.latestContext);
      revealAnswer(state);
    },

    supportsShellValidation() {
      return true;
    },

    canValidate() {
      return canValidate(state);
    },

    validate() {
      if (!canValidate(state)) return false;
      submitCurrentAnswer(state);
      return true;
    },

    getShellAnswerDisplayState(container, context = state.latestContext) {
      state.container = container || state.container;
      syncRuntimeState(state, context ?? state.latestContext);
      return {
        canToggle: canToggleAnswerDisplay(state),
        mode: state.answerDisplayMode === "student" ? "student" : "correction",
        transitionTargets: [state.responseHostEl]
      };
    },

    setShellAnswerDisplayMode(container, context = state.latestContext, mode = "correction") {
      state.container = container || state.container;
      syncRuntimeState(state, context ?? state.latestContext);
      if (!canToggleAnswerDisplay(state)) return false;
      state.answerDisplayMode = mode === "student" ? "student" : "correction";
      renderQuestion(state);
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
    imageFrameEl: null,
    imageEl: null,
    prefixEl: null,
    responseHostEl: null,
    keyboardHostEl: null,
    settings: normalizeSettings(initialContext?.settings),
    settingsKey: "",
    currentQuestion: null,
    lastQuestionKey: "",
    usedWordSlugs: new Set(),
    answerControl: null,
    keyboardAbort: null,
    submittedAnswer: "",
    lastEvaluation: null,
    phaseMode: "idle",
    answerDisplayMode: "correction",
    imageExpanded: false
  };
}

function syncRuntimeState(state, context = state.latestContext) {
  state.latestContext = context ?? state.latestContext;
  state.settings = normalizeSettings(state.latestContext?.settings);
}

function renderShell(state) {
  if (!state.container) return;
  destroyInputBindings(state);

  state.container.innerHTML = `
    <div class="tool-runtime dm-root">
      ${renderToolInstruction({ id: "dm_instruction" })}
      <div class="dm-stage">
        <div class="dm-image-frame" data-dm-image-frame role="button" tabindex="0" aria-label="Agrandir l’image" aria-expanded="false">
          <img class="dm-image" data-dm-image alt="" draggable="false">
          <div class="dm-image-placeholder" data-dm-image-placeholder aria-hidden="true">Image indisponible</div>
        </div>

        <div class="dm-answer-row" data-dm-answer-row>
          <span class="dm-prefix" data-dm-prefix></span>
          <div class="dm-response-host" data-dm-response-host></div>
        </div>

        <div class="dm-keyboard-host" data-dm-keyboard-host></div>
      </div>
    </div>
  `;

  state.root = state.container.querySelector(".dm-root");
  state.instructionEl = state.container.querySelector("#dm_instruction");
  state.imageFrameEl = state.container.querySelector("[data-dm-image-frame]");
  state.imageEl = state.container.querySelector("[data-dm-image]");
  state.prefixEl = state.container.querySelector("[data-dm-prefix]");
  state.responseHostEl = state.container.querySelector("[data-dm-response-host]");
  state.keyboardHostEl = state.container.querySelector("[data-dm-keyboard-host]");

  state.imageEl?.addEventListener("load", () => {
    state.imageFrameEl?.classList.remove("is-loading", "is-error");
    state.imageFrameEl?.classList.add("is-ready");
  });
  state.imageEl?.addEventListener("error", () => {
    state.imageFrameEl?.classList.remove("is-loading", "is-ready");
    state.imageFrameEl?.classList.add("is-error");
  });
  state.imageFrameEl?.addEventListener("click", () => toggleImageExpanded(state));
  state.imageFrameEl?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleImageExpanded(state);
  });

  updateInstruction(state);
  renderQuestion(state);
}

function loadNextQuestion(state) {
  const settingsKey = JSON.stringify(state.settings);
  if (state.settingsKey && state.settingsKey !== settingsKey) {
    state.usedWordSlugs.clear();
    state.lastQuestionKey = "";
  }
  state.settingsKey = settingsKey;

  let nextQuestion = pickQuestion(state.settings, {
    avoidKey: state.lastQuestionKey,
    usedWordSlugs: state.usedWordSlugs
  });

  if (!nextQuestion && state.usedWordSlugs.size) {
    state.usedWordSlugs.clear();
    nextQuestion = pickQuestion(state.settings, {
      avoidKey: state.lastQuestionKey,
      usedWordSlugs: state.usedWordSlugs
    });
  }

  if (!nextQuestion) {
    throw new Error("Aucun mot jouable avec ces réglages et les images actuellement classées dans « Imagier ».");
  }

  state.currentQuestion = nextQuestion;
  state.lastQuestionKey = questionKey(nextQuestion);
  state.usedWordSlugs.add(nextQuestion.slug);
  state.submittedAnswer = "";
  state.lastEvaluation = null;
  state.phaseMode = "question";
  state.answerDisplayMode = "correction";
  setImageExpanded(state, false);

  updateInstruction(state);
  renderQuestion(state);
  syncValidationState(state);
  queueMicrotask(() => state.answerControl?.focus?.());
}

function renderQuestion(state) {
  if (!state.responseHostEl || !state.keyboardHostEl) return;
  destroyInputBindings(state);

  const question = state.currentQuestion;
  if (!question) {
    state.prefixEl.textContent = "";
    state.responseHostEl.innerHTML = '<div class="dm-empty-message">L’activité va commencer.</div>';
    state.keyboardHostEl.innerHTML = "";
    state.keyboardHostEl.classList.remove("is-hidden");
    clearImage(state);
    return;
  }

  renderImage(state, question);
  renderPrefix(state, question);

  if (state.phaseMode === "answer") {
    renderAnswerPhase(state, question);
    state.keyboardHostEl.classList.add("is-hidden");
    return;
  }

  renderEditableAnswer(state, question);
  renderKeyboard(state, question);
}

function renderEditableAnswer(state, question) {
  const isBoxes = state.settings.inputStyle === INPUT_STYLES.BOXES;
  const answerLength = getAnswerLength(question);
  state.responseHostEl?.classList.toggle("is-boxes", isBoxes);

  const control = createAlphabetAnswerControl({
    className: isBoxes ? "dm-answer-control dm-answer-control--boxes" : "dm-answer-control dm-answer-control--single",
    ariaLabel: `Écrire le mot${question.prefix ? ` après ${question.prefix}` : ""}`,
    value: "",
    // En zone unique, ne pas borner à la longueur de la bonne réponse :
    // le blocage de saisie donnerait indirectement le nombre de lettres.
    maxLength: isBoxes ? answerLength : 32,
    lowercase: true,
    captureKeyboard: true,
    captureRoot: state.root,
    onInput: () => {
      if (isBoxes) syncLetterSlots(state, control.getValue(), answerLength);
      syncValidationState(state);
    },
    onSubmit: () => {
      if (canValidate(state)) submitCurrentAnswer(state);
    }
  });

  state.answerControl = control;
  state.responseHostEl.innerHTML = "";
  state.responseHostEl.appendChild(control.element);

  if (isBoxes) {
    control.display.hidden = true;
    const slots = document.createElement("div");
    slots.className = "dm-letter-slots";
    slots.dataset.dmLetterSlots = "true";
    slots.setAttribute("aria-hidden", "true");
    control.element.appendChild(slots);
    syncLetterSlots(state, "", answerLength);
  }
}

function renderKeyboard(state, question) {
  const highlightedKeys = state.settings.highlightWordLetters
    ? getHighlightedKeys(question)
    : [];

  state.keyboardHostEl.innerHTML = renderAlphabetKeyboard({
    showDiacritics: state.settings.showDiacritics,
    showBackspace: true,
    highlightedKeys,
    ariaLabel: "Clavier pour écrire le mot"
  });
  state.keyboardHostEl.classList.remove("is-hidden");

  state.keyboardAbort = new AbortController();
  bindAlphabetKeyboardEvents({
    root: state.keyboardHostEl,
    control: state.answerControl,
    signal: state.keyboardAbort.signal,
    onAfterInput: () => syncValidationState(state)
  });
}

function renderAnswerPhase(state, question) {
  const evaluation = state.lastEvaluation || evaluateAnswer(question, state.submittedAnswer);
  const showStudent = state.answerDisplayMode === "student";
  const displayedValue = showStudent ? state.submittedAnswer : question.word;
  const isCorrectAnswer = evaluation.isCorrect;
  const feedbackClass = isCorrectAnswer
    ? "is-correct"
    : showStudent
      ? "is-incorrect"
      : "is-correction";
  const slotFeedbackMode = isCorrectAnswer ? "correct" : showStudent ? "student" : "correction";
  const isBoxes = state.settings.inputStyle === INPUT_STYLES.BOXES;

  state.responseHostEl.classList.toggle("is-boxes", isBoxes);

  if (isBoxes) {
    const existingControl = state.responseHostEl.querySelector(".dm-answer-control--boxes");
    if (existingControl instanceof HTMLElement) {
      existingControl.classList.add("dm-answer-display", "dm-answer-display--boxes");
      existingControl.classList.remove("is-correct", "is-incorrect", "is-correction");
      existingControl.classList.add(feedbackClass);
      existingControl.tabIndex = -1;
      existingControl.setAttribute("aria-readonly", "true");
      const slots = existingControl.querySelector("[data-dm-letter-slots]");
      if (slots) slots.innerHTML = renderLetterSlotsMarkup(displayedValue, getAnswerLength(question), evaluation, slotFeedbackMode);
      return;
    }

    state.responseHostEl.innerHTML = "";
    const wrapper = document.createElement("div");
    wrapper.className = `tool-answer-box tool-answer-input tool-alphabet-answer dm-answer-control dm-answer-control--boxes dm-answer-display dm-answer-display--boxes ${feedbackClass}`;
    wrapper.innerHTML = renderLetterSlotsMarkup(displayedValue, getAnswerLength(question), evaluation, slotFeedbackMode);
    state.responseHostEl.appendChild(wrapper);
    return;
  }

  state.responseHostEl.innerHTML = "";
  const box = document.createElement("div");
  box.className = `tool-answer-box tool-answer-box--medium dm-answer-display dm-answer-display--single ${feedbackClass}`;
  const text = document.createElement("span");
  text.className = "dm-answer-display__text";
  text.textContent = displayedValue || " ";
  box.appendChild(text);
  state.responseHostEl.appendChild(box);
}

function renderPrefix(state, question) {
  if (!state.prefixEl) return;
  const prefix = String(question?.prefix || "").trim();
  state.prefixEl.textContent = prefix;
  state.prefixEl.hidden = !prefix;
  state.prefixEl.parentElement?.classList.toggle("has-elided-prefix", /[’']$/.test(prefix));
}

function renderImage(state, question) {
  if (!state.imageEl || !state.imageFrameEl) return;
  const url = getPublicImageAssetUrl(question?.imageStoragePath, { bucket: IMAGE_BUCKET });

  state.imageFrameEl.classList.remove("is-ready", "is-error");
  state.imageFrameEl.classList.add("is-loading");
  state.imageEl.alt = "";

  if (!url) {
    state.imageEl.removeAttribute("src");
    state.imageFrameEl.classList.remove("is-loading");
    state.imageFrameEl.classList.add("is-error");
    return;
  }

  if (state.imageEl.src !== url) state.imageEl.src = url;
  else if (state.imageEl.complete && state.imageEl.naturalWidth > 0) {
    state.imageFrameEl.classList.remove("is-loading");
    state.imageFrameEl.classList.add("is-ready");
  }
}

function toggleImageExpanded(state) {
  if (!state.imageFrameEl || !state.imageEl?.src || state.imageFrameEl.classList.contains("is-error")) return;
  setImageExpanded(state, !state.imageExpanded);
}

function setImageExpanded(state, expanded) {
  state.imageExpanded = expanded === true;
  state.root?.classList.toggle("is-image-expanded", state.imageExpanded);
  state.imageFrameEl?.classList.toggle("is-expanded", state.imageExpanded);
  state.imageFrameEl?.setAttribute("aria-expanded", String(state.imageExpanded));
  state.imageFrameEl?.setAttribute("aria-label", state.imageExpanded ? "Réduire l’image" : "Agrandir l’image");
}

function clearImage(state) {
  state.imageEl?.removeAttribute("src");
  state.imageFrameEl?.classList.remove("is-loading", "is-ready", "is-error");
  setImageExpanded(state, false);
}

function syncLetterSlots(state, value, length) {
  const host = state.responseHostEl?.querySelector("[data-dm-letter-slots]");
  if (!host) return;
  host.innerHTML = renderLetterSlotsMarkup(value, length);
}

function renderLetterSlotsMarkup(value, length, evaluation = null, feedbackMode = "student") {
  const chars = Array.from(String(value || "").normalize("NFC"));
  const expectedChars = Array.from(String(evaluation?.expected || "").normalize("NFC"));
  const actualChars = Array.from(String(evaluation?.actual || "").normalize("NFC"));
  const hasFeedback = expectedChars.length > 0;
  const safeLength = Math.max(1, Number(length) || chars.length || 1);
  return Array.from({ length: safeLength }, (_, index) => {
    const char = chars[index] || "";
    let feedbackClass = "";
    if (hasFeedback) {
      if (feedbackMode === "correction") feedbackClass = " is-correction";
      else if (feedbackMode === "correct") feedbackClass = " is-correct";
      else feedbackClass = actualChars[index] && actualChars[index] === expectedChars[index]
        ? " is-correct"
        : " is-incorrect";
    }
    return `<span class="dm-letter-slot${char ? " is-filled" : ""}${feedbackClass}">${escapeHtml(char || " ")}</span>`;
  }).join("");
}

function submitCurrentAnswer(state) {
  if (!state.currentQuestion || !state.answerControl) return;
  state.submittedAnswer = state.answerControl.getValue();
  state.lastEvaluation = evaluateAnswer(state.currentQuestion, state.submittedAnswer);

  const requested = state.latestContext?.services?.requestAnswerPhase?.({
    manual: false,
    showAnswerNow: true,
    wasCorrect: state.lastEvaluation.isCorrect
  });

  if (requested === false || !state.latestContext?.services?.requestAnswerPhase) {
    state.phaseMode = "answer";
    state.answerDisplayMode = "correction";
    renderQuestion(state);
  }

  syncValidationState(state);
}

function revealAnswer(state) {
  if (!state.currentQuestion) return;

  if (state.phaseMode !== "answer") {
    state.submittedAnswer = state.answerControl?.getValue?.() || state.submittedAnswer || "";
    state.lastEvaluation = evaluateAnswer(state.currentQuestion, state.submittedAnswer);
  }

  state.phaseMode = "answer";
  state.answerDisplayMode = "correction";
  renderQuestion(state);
  syncValidationState(state);
}

function canValidate(state) {
  if (state.phaseMode !== "question" || !state.currentQuestion || !state.answerControl) return false;
  return String(state.answerControl.getValue() || "").trim().length > 0;
}

function canToggleAnswerDisplay(state) {
  if (state.phaseMode !== "answer" || !state.currentQuestion) return false;
  const submitted = String(state.submittedAnswer || "").normalize("NFC");
  const expected = String(state.currentQuestion.word || "").normalize("NFC");
  return submitted !== expected;
}

function updateInstruction(state) {
  if (!state.instructionEl) return;
  const prompt = String(state.currentQuestion?.prompt || DEFAULT_INSTRUCTION).trim() || DEFAULT_INSTRUCTION;
  const text = resolveQuestionInstructionText(
    state.latestContext,
    prompt,
    DEFAULT_INSTRUCTION
  );
  setToolInstructionText(state.instructionEl, text);
}

function syncValidationState(state) {
  state.latestContext?.services?.notifyValidationStateChanged?.();
}

function destroyInputBindings(state) {
  state.keyboardAbort?.abort?.();
  state.keyboardAbort = null;
  state.answerControl?.destroy?.();
  state.answerControl = null;
}

function teardownState(state, container) {
  destroyInputBindings(state);
  if (container) container.innerHTML = "";
  const reset = createRuntimeState(state.latestContext);
  Object.assign(state, reset);
  state.container = null;
}

async function ensureRuntimeCatalogs() {
  if (!runtimeCatalogsPromise) {
    runtimeCatalogsPromise = Promise.all([
      listPublicPhonologyWords(),
      listPublicImageAssetsInSystemFolder(getImageFolderName())
    ])
      .then(([words, images]) => {
        setWordCatalog(Array.isArray(words) ? words : []);
        setImageCatalog(Array.isArray(images) ? images : []);
        return { words, images };
      })
      .catch((error) => {
        runtimeCatalogsPromise = null;
        setWordCatalog([]);
        setImageCatalog([]);
        const message = String(error?.message || "");
        if (message.includes("list_public_system_image_assets_in_folder")) {
          throw new Error("La migration 26_public_system_image_folder_runtime.sql doit être exécutée dans Supabase.");
        }
        throw error;
      });
  }

  return await runtimeCatalogsPromise;
}

function injectActivityStyles() {
  ensureToolInstructionStyles();
  if (stylesReadyPromise) return stylesReadyPromise;

  stylesReadyPromise = new Promise((resolve) => {
    const href = new URL("./activity.css", import.meta.url).href;
    const existing = document.querySelector(`link[data-dm-activity-style="${href}"]`);
    if (existing) {
      if (existing.sheet) resolve();
      else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => resolve(), { once: true });
      }
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.dmActivityStyle = href;
    link.addEventListener("load", () => resolve(), { once: true });
    link.addEventListener("error", () => resolve(), { once: true });
    document.head.appendChild(link);
  });

  return stylesReadyPromise;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
