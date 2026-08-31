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
        canToggle: false,
        mode: "correction",
        transitionTargets: []
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
    spellingsHintEl: null,
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
      <div class="rg-spellings-hint" id="rg_spellings_hint" hidden></div>
    </div>
  `;

  state.root = state.container.querySelector(".rg-root");
  state.instructionEl = state.container.querySelector("#rg_instruction");
  state.gridEl = state.container.querySelector("#rg_words_grid");
  state.spellingsHintEl = state.container.querySelector("#rg_spellings_hint");
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
    if (state.spellingsHintEl) state.spellingsHintEl.hidden = true;
    return;
  }

  const wordCount = question.words.length;
  state.gridEl.className = `rg-words-grid rg-words-grid--count-${wordCount}`;
  let offset = 0;
  state.gridEl.innerHTML = getWordRowCounts(wordCount).map((count) => {
    const words = question.words.slice(offset, offset + count);
    offset += count;
    return `<div class="rg-words-row">${words.map((word) => renderWordCard(state, word)).join("")}</div>`;
  }).join("");
  renderSpellingsHint(state, question);
}

function renderSpellingsHint(state, question) {
  const host = state.spellingsHintEl;
  if (!host) return;
  if (state.settings.showPossibleSpellings !== true || !question?.target?.id || question?.target?.kind === "graphemic") {
    host.hidden = true;
    return;
  }
  const spellings = state.settings.enabledSpellingsByTarget?.[question.target.id]
    || question.target.spellings
    || [];
  if (!spellings.length) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  host.innerHTML = `N’oublie pas, le son ${renderSoundBubble(question.target.bubbleText, { className:"rg-sound-bubble--hint" })} peut s’écrire ${formatSpellings(spellings)}.`;
}

function formatSpellings(spellings = []) {
  const values = spellings.map((spelling) => `<span class="rg-spellings-hint__spelling">${escapeHtml(spelling)}</span>`);
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} ou ${values[1]}`;
  return `${values.slice(0, -1).join(", ")} ou ${values.at(-1)}`;
}

function renderWordCard(state, word) {
  const displayWord = [word.prefix, word.word].filter(Boolean).join(" ");

  return `
    <div class="rg-word" role="group" aria-label="${escapeAttr(displayWord)}">
      ${word.prefix ? `<span class="rg-word-prefix" aria-hidden="true">${escapeHtml(word.prefix)}&nbsp;</span>` : ""}
      ${word.letters.map((letter) => renderLetter(state, word, letter)).join("")}
    </div>
  `;
}

function renderLetter(state, word, letter) {
  if (!letter.selectable) {
    return `<span class="rg-letter rg-letter--separator" aria-hidden="true">${escapeHtml(letter.text)}</span>`;
  }

  const key = makeSelectionKey(word.wordIndex, letter.letterIndex);
  const interactive = isQuestionInteractive(state);
  const className = getLetterClassName(state, key, letter.isTarget, word);
  const ariaPressed = state.selectedKeys.has(key) ? "true" : "false";

  if (!interactive) {
    return `<span class="${className}" data-rg-letter-key="${escapeAttr(key)}">${escapeHtml(letter.text)}</span>`;
  }

  return `
    <button
      class="${className}"
      type="button"
      data-rg-selection-key="${escapeAttr(key)}"
      data-rg-letter-key="${escapeAttr(key)}"
      aria-pressed="${ariaPressed}"
      aria-label="Lettre ${escapeAttr(letter.text)} dans ${escapeAttr(word.word)}"
    >${escapeHtml(letter.text)}</button>
  `;
}

function getLetterClassName(state, key, isTarget, word) {
  const classes = ["rg-letter"];
  const selectedNow = state.selectedKeys.has(key);

  if (state.phaseMode === "question") {
    if (selectedNow) {
      classes.push("is-selected");
      addContinuousGroupClasses(classes, state, key, isTarget, word, "selected");
    }
    return classes.join(" ");
  }

  if (state.phaseMode !== "answer") return classes.join(" ");

  const studentSelection = getStudentSelection(state);
  const wasSelected = studentSelection.has(key);

  if (state.answerDisplayMode === "student") {
    if (wasSelected && isTarget) { classes.push("is-correct"); addContinuousGroupClasses(classes, state, key, isTarget, word, "correct"); }
    else if (wasSelected && !isTarget) { classes.push("is-wrong"); addContinuousGroupClasses(classes, state, key, isTarget, word, "wrong"); }
    return classes.join(" ");
  }

  if (isTarget && wasSelected) {
    classes.push("is-correct");
    addContinuousGroupClasses(classes, state, key, isTarget, word, "correct");
  } else if (isTarget) {
    classes.push("is-correction");
    addContinuousGroupClasses(classes, state, key, isTarget, word, "correction");
  } else if (wasSelected) {
    classes.push("is-wrong");
    addContinuousGroupClasses(classes, state, key, isTarget, word, "wrong");
  }
  return classes.join(" ");
}

function addContinuousGroupClasses(classes, state, key, isTarget, word, kind) {
  const [wordIndex, letterIndex] = key.split(":").map(Number);
  const isSameKind = (index) => {
    const neighbor = word?.letters?.find((letter) => Number(letter.letterIndex) === index);
    if (!neighbor?.selectable) return false;
    const neighborKey = makeSelectionKey(wordIndex, index);
    const selected = state.phaseMode === "answer" && state.studentSelectionSnapshot instanceof Set
      ? state.studentSelectionSnapshot.has(neighborKey)
      : state.selectedKeys.has(neighborKey);
    if (kind === "selected") return selected;
    if (kind === "correct") return selected && neighbor.isTarget;
    if (kind === "wrong") return selected && !neighbor.isTarget;
    if (kind === "correction") return !selected && neighbor.isTarget;
    return false;
  };
  const hasPrevious = isSameKind(letterIndex - 1);
  const hasNext = isSameKind(letterIndex + 1);
  classes.push("rg-letter--continuous");
  if (!hasPrevious) classes.push("is-group-start");
  if (!hasNext) classes.push("is-group-end");
  if (hasPrevious && hasNext) classes.push("is-group-mid");
}


function submitCurrentAnswer(state) {
  state.studentSelectionSnapshot = new Set(state.selectedKeys);
  state.lastEvaluation = evaluateSelection(state.currentQuestion, [...state.studentSelectionSnapshot]);

  const requested = state.latestContext?.services?.requestAnswerPhase?.({
    manual: false,
    showAnswerNow: true,
    wasCorrect: state.lastEvaluation.isCorrect,
    skipValidationReview: true
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
    || "Dans chaque mot, clique sur les lettres correspondant à la cible demandée.";
  const text = resolveQuestionInstructionText(
    state.latestContext,
    prompt,
    "Dans chaque mot, clique sur les lettres correspondant à la cible demandée."
  );
  const target = state.currentQuestion?.target;

  if (!target?.bubbleText || target?.kind === "graphemic" || text !== prompt) {
    state.instructionEl.removeAttribute("aria-label");
    setToolInstructionText(state.instructionEl, text);
    return;
  }

  state.instructionEl.hidden = false;
  state.instructionEl.classList.remove("is-empty", "is-reserved-space");
  state.instructionEl.removeAttribute("aria-hidden");
  state.instructionEl.setAttribute("aria-label", prompt);
  state.instructionEl.innerHTML = `
    <span>Sélectionne la ou les lettres qui permettent d’écrire le son</span>
    ${renderSoundBubble(target.bubbleText, { className:"rg-sound-bubble--instruction" })}
    <span aria-hidden="true">.</span>
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

function canToggleAnswerDisplay() {
  return false;
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

function getWordRowCounts(wordCount) {
  const layouts = {
    1:[1],
    2:[1, 1],
    3:[2, 1],
    4:[2, 2],
    5:[2, 2, 1],
    6:[2, 2, 2],
    7:[2, 2, 2, 1],
    8:[2, 2, 2, 2]
  };
  return layouts[wordCount] || [wordCount];
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
