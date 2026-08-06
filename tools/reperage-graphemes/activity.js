import {
  normalizeSettings,
  setWordCatalog,
  pickQuestion,
  questionKey,
  evaluateSelection,
  makeSelectionKey
} from "./model.js";
import { listPublicPhonologyWords } from "../../shared/public-api.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveQuestionInstructionText,
  setToolInstructionText
} from "../../shared/tool-instruction.js";
import { renderSoundBubble } from "./sound-bubble.js";

let stylesReadyPromise = null;
let phonologyWordCatalogPromise = null;

export function createActivity(initialContext = {}) {
  const state = createRuntimeState(initialContext);

  return {
    async mount(container, context = initialContext) {
      state.container = container;
      syncRuntimeState(state, context ?? state.latestContext);
      await injectActivityStyles();
      await ensurePhonologyWordCatalog();
      renderShell(state);
      bindEvents(state);
      syncValidationState(state);
    },

    async next(container, context = initialContext) {
      state.container = container || state.container;
      if (!state.container) return;

      syncRuntimeState(state, context ?? state.latestContext);
      await injectActivityStyles();
      await ensurePhonologyWordCatalog();

      if (!state.root?.isConnected || state.root?.dataset.responseUi !== state.responseUi) {
        renderShell(state);
        bindEvents(state);
      }

      loadNextQuestion(state);
    },

    showAnswer(container, context = initialContext) {
      state.container = container || state.container;
      syncRuntimeState(state, context ?? state.latestContext);
      if (!state.container || !state.currentQuestion) return;

      if (!state.root?.isConnected || state.root?.dataset.responseUi !== state.responseUi) {
        renderShell(state);
        bindEvents(state);
      }

      if (!state.studentSelectionSnapshot) {
        state.studentSelectionSnapshot = new Set(state.selectedKeys);
      }
      state.lastEvaluation = evaluateSelection(state.currentQuestion, [...state.studentSelectionSnapshot]);
      state.phaseMode = "answer";
      state.answerDisplayMode = "correction";
      renderQuestion(state);
      syncValidationState(state);
    },

    supportsShellValidation(context = state.latestContext) {
      return getResponseUi(context) === "boxed";
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
        mode: state.answerDisplayMode === "student" ? "student" : "correction"
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
    gridEl: null,
    settings: normalizeSettings(initialContext?.settings),
    settingsKey: "",
    responseUi: getResponseUi(initialContext),
    currentQuestion: null,
    lastQuestionKey: "",
    usedWordSlugs: new Set(),
    selectedKeys: new Set(),
    studentSelectionSnapshot: null,
    lastEvaluation: null,
    phaseMode: "idle",
    answerDisplayMode: "correction"
  };
}

function syncRuntimeState(state, context = {}) {
  state.latestContext = context ?? state.latestContext;
  state.settings = normalizeSettings(state.latestContext?.settings);
  state.responseUi = getResponseUi(state.latestContext);
}

function renderShell(state) {
  if (!state.container) return;
  state.container.innerHTML = `
    <div class="rg-root" data-response-ui="${escapeAttr(state.responseUi)}">
      ${renderToolInstruction({ id:"rg_instruction" })}
      <div class="rg-words-grid" id="rg_words_grid" aria-live="polite"></div>
    </div>
  `;

  state.root = state.container.querySelector(".rg-root");
  state.instructionEl = state.container.querySelector("#rg_instruction");
  state.gridEl = state.container.querySelector("#rg_words_grid");
  updateInstruction(state);
  renderQuestion(state);
}

function bindEvents(state) {
  state.gridEl?.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest("[data-rg-selection-key]");
    if (!button || !isQuestionInteractive(state)) return;
    const key = String(button.dataset.rgSelectionKey || "").trim();
    if (!key) return;

    if (state.selectedKeys.has(key)) state.selectedKeys.delete(key);
    else state.selectedKeys.add(key);

    renderQuestion(state);
    syncValidationState(state);
  });
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
    throw new Error("Aucun groupe de mots ne peut être généré avec cette cible et ces réglages.");
  }

  state.currentQuestion = nextQuestion;
  state.lastQuestionKey = questionKey(nextQuestion);
  nextQuestion.words.forEach((word) => state.usedWordSlugs.add(word.slug));
  state.selectedKeys = new Set();
  state.studentSelectionSnapshot = null;
  state.lastEvaluation = null;
  state.phaseMode = "question";
  state.answerDisplayMode = "correction";

  updateInstruction(state);
  renderQuestion(state);
  syncValidationState(state);
}

function renderQuestion(state) {
  if (!state.gridEl) return;
  const question = state.currentQuestion;

  if (!question) {
    state.gridEl.className = "rg-words-grid is-empty";
    state.gridEl.innerHTML = '<div class="rg-empty-message">L’activité va commencer.</div>';
    return;
  }

  const wordCount = question.words.length;
  state.gridEl.className = `rg-words-grid rg-words-grid--count-${wordCount}`;
  state.gridEl.innerHTML = question.words.map((word) => renderWordCard(state, word)).join("");
}

function renderWordCard(state, word) {
  const wordExpectedKeys = new Set(word.letters
    .filter((letter) => letter.selectable && letter.isTarget)
    .map((letter) => makeSelectionKey(word.wordIndex, letter.letterIndex)));
  const studentKeys = getStudentSelection(state);
  const wordSelectedKeys = new Set([...studentKeys].filter((key) => key.startsWith(`${word.wordIndex}:`)));
  const wordIsCorrect = setsEqual(wordExpectedKeys, wordSelectedKeys);
  const showVerdict = state.phaseMode === "answer" && state.responseUi === "boxed";
  const sizeClass = getWordSizeClass(word.characterCount);

  return `
    <section class="rg-word-card ${sizeClass}${showVerdict ? (wordIsCorrect ? " is-correct" : " is-incorrect") : ""}" aria-label="Mot ${escapeAttr(word.word)}">
      <div class="rg-word" role="group" aria-label="${escapeAttr(word.word)}">
        ${word.letters.map((letter) => renderLetter(state, word, letter)).join("")}
      </div>
    </section>
  `;
}

function renderLetter(state, word, letter) {
  if (!letter.selectable) {
    return `<span class="rg-letter rg-letter--separator" aria-hidden="true">${escapeHtml(letter.text)}</span>`;
  }

  const key = makeSelectionKey(word.wordIndex, letter.letterIndex);
  const interactive = isQuestionInteractive(state);
  const className = getLetterClassName(state, key, letter.isTarget);
  const ariaPressed = state.selectedKeys.has(key) ? "true" : "false";

  if (!interactive) {
    return `<span class="${className}" data-rg-letter-key="${escapeAttr(key)}">${escapeHtml(letter.text)}</span>`;
  }

  return `
    <button
      class="${className}"
      type="button"
      data-rg-selection-key="${escapeAttr(key)}"
      aria-pressed="${ariaPressed}"
      aria-label="Lettre ${escapeAttr(letter.text)} dans ${escapeAttr(word.word)}"
    >${escapeHtml(letter.text)}</button>
  `;
}

function getLetterClassName(state, key, isTarget) {
  const classes = ["rg-letter"];
  const selectedNow = state.selectedKeys.has(key);

  if (state.phaseMode === "question") {
    if (selectedNow) classes.push("is-selected");
    return classes.join(" ");
  }

  if (state.phaseMode !== "answer") return classes.join(" ");

  const studentSelection = getStudentSelection(state);
  const wasSelected = studentSelection.has(key);

  if (state.answerDisplayMode === "student") {
    if (wasSelected && isTarget) classes.push("is-correct");
    else if (wasSelected && !isTarget) classes.push("is-wrong");
    return classes.join(" ");
  }

  if (isTarget) classes.push("is-correction");
  if (wasSelected && !isTarget) classes.push("is-wrong");
  return classes.join(" ");
}

function submitCurrentAnswer(state) {
  state.studentSelectionSnapshot = new Set(state.selectedKeys);
  state.lastEvaluation = evaluateSelection(state.currentQuestion, [...state.studentSelectionSnapshot]);

  const requested = state.latestContext?.services?.requestAnswerPhase?.({
    manual: false,
    showAnswerNow: true,
    wasCorrect: state.lastEvaluation.isCorrect
  });

  if (!requested) {
    state.phaseMode = "answer";
    state.answerDisplayMode = "correction";
    renderQuestion(state);
  }

  syncValidationState(state);
}

function updateInstruction(state) {
  if (!state.instructionEl) return;
  const prompt = String(state.currentQuestion?.prompt || "").trim()
    || "Dans chaque mot, clique sur les lettres qui font le son demandé.";
  const text = resolveQuestionInstructionText(
    state.latestContext,
    prompt,
    "Dans chaque mot, clique sur les lettres qui font le son demandé."
  );
  const target = state.currentQuestion?.target;

  if (!target?.bubbleText || text !== prompt) {
    state.instructionEl.removeAttribute("aria-label");
    setToolInstructionText(state.instructionEl, text);
    return;
  }

  state.instructionEl.hidden = false;
  state.instructionEl.classList.remove("is-empty", "is-reserved-space");
  state.instructionEl.removeAttribute("aria-hidden");
  state.instructionEl.setAttribute("aria-label", prompt);
  state.instructionEl.innerHTML = `
    <span>Dans chaque mot, clique sur la ou les lettres qui font le son</span>
    <span class="rg-instruction-sound-token">
      ${renderSoundBubble(target.bubbleText, { className:"rg-sound-bubble--instruction" })}<span aria-hidden="true">,</span>
    </span>
    <span>comme dans « ${escapeHtml(target.example)} ».</span>
  `;
}

function canValidate(state) {
  return state.responseUi === "boxed"
    && isQuestionInteractive(state)
    && state.selectedKeys.size > 0;
}

function isQuestionInteractive(state) {
  return state.phaseMode === "question" && !!state.currentQuestion;
}

function canToggleAnswerDisplay(state) {
  return state.responseUi === "boxed"
    && state.phaseMode === "answer"
    && !!state.studentSelectionSnapshot
    && state.lastEvaluation?.isCorrect === false;
}

function getStudentSelection(state) {
  if (state.studentSelectionSnapshot instanceof Set) return state.studentSelectionSnapshot;
  return state.selectedKeys;
}


function syncValidationState(state) {
  state.latestContext?.services?.notifyValidationStateChanged?.();
}

function getResponseUi(context = {}) {
  const value = String(
    context?.responseUi
    ?? context?.response_ui
    ?? context?.passationProfile?.responseUi
    ?? context?.passationProfile?.response_ui
    ?? "boxed"
  ).trim().toLowerCase();
  return value === "free" ? "free" : "boxed";
}

function getWordSizeClass(characterCount) {
  const count = Math.max(0, Number(characterCount) || 0);
  if (count >= 13) return "rg-word-card--very-long";
  if (count >= 10) return "rg-word-card--long";
  if (count >= 7) return "rg-word-card--medium";
  return "rg-word-card--short";
}

function setsEqual(first, second) {
  if (first.size !== second.size) return false;
  for (const value of first) {
    if (!second.has(value)) return false;
  }
  return true;
}

async function ensurePhonologyWordCatalog() {
  if (!phonologyWordCatalogPromise) {
    phonologyWordCatalogPromise = listPublicPhonologyWords()
      .then((rows) => {
        const words = Array.isArray(rows) ? rows : [];
        setWordCatalog(words);
        return words;
      })
      .catch((error) => {
        phonologyWordCatalogPromise = null;
        setWordCatalog([]);
        throw error;
      });
  }
  return await phonologyWordCatalogPromise;
}

function teardownState(state, container) {
  if (container) container.innerHTML = "";
  state.container = null;
  state.root = null;
  state.instructionEl = null;
  state.gridEl = null;
  state.currentQuestion = null;
  state.selectedKeys.clear();
  state.studentSelectionSnapshot = null;
  state.lastEvaluation = null;
  state.phaseMode = "idle";
}

function injectActivityStyles() {
  if (stylesReadyPromise) return stylesReadyPromise;
  ensureToolInstructionStyles();

  const href = new URL("./activity.css", import.meta.url).href;
  const existing = document.querySelector(`link[data-rg-activity-style="${href}"]`);
  if (existing) {
    stylesReadyPromise = Promise.resolve();
    return stylesReadyPromise;
  }

  stylesReadyPromise = new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.rgActivityStyle = href;
    link.addEventListener("load", resolve, { once:true });
    link.addEventListener("error", resolve, { once:true });
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

function escapeAttr(value) {
  return escapeHtml(value);
}
