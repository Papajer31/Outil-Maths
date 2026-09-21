import {
  normalizeSettings,
  setWordCatalog,
  pickQuestion,
  questionKey,
  evaluateSelection
} from "./model.js";
import { listPublicLexicalWords } from "../../shared/public-api.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveQuestionInstructionText,
  setToolInstructionText
} from "../../shared/tool-instruction.js";

let stylesReadyPromise = null;
let lexicalWordCatalogPromise = null;

export function createActivity(initialContext = {}) {
  const state = createRuntimeState(initialContext);

  return {
    async mount(container, context = initialContext) {
      state.container = container;
      syncRuntimeState(state, context ?? state.latestContext);
      await injectActivityStyles();
      await ensureLexicalWordCatalog();
      renderShell(state);
      bindEvents(state);
      syncValidationState(state);
    },

    async next(container, context = initialContext) {
      state.container = container || state.container;
      if (!state.container) return;
      syncRuntimeState(state, context ?? state.latestContext);
      await injectActivityStyles();
      await ensureLexicalWordCatalog();

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
        state.studentSelectionSnapshot = new Set(state.selectedIds);
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
        canToggle:false,
        mode:"correction",
        transitionTargets:[]
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
    container:null,
    latestContext:initialContext,
    root:null,
    instructionEl:null,
    boardEl:null,
    settings:normalizeSettings(initialContext?.settings),
    settingsKey:"",
    responseUi:getResponseUi(initialContext),
    currentQuestion:null,
    lastQuestionKey:"",
    selectedIds:new Set(),
    studentSelectionSnapshot:null,
    lastEvaluation:null,
    phaseMode:"idle",
    answerDisplayMode:"correction"
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
    <div class="iv-root" data-response-ui="${escapeAttr(state.responseUi)}">
      ${renderToolInstruction({ id:"iv_instruction" })}
      <div class="iv-board" id="iv_board" aria-live="polite"></div>
    </div>
  `;
  state.root = state.container.querySelector(".iv-root");
  state.instructionEl = state.container.querySelector("#iv_instruction");
  state.boardEl = state.container.querySelector("#iv_board");
  updateInstruction(state);
  renderQuestion(state);
}

function bindEvents(state) {
  state.boardEl?.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest("[data-iv-item-id]");
    if (!button || !isQuestionInteractive(state)) return;
    const id = String(button.dataset.ivItemId || "").trim();
    if (!id) return;

    if (state.selectedIds.has(id)) state.selectedIds.delete(id);
    else state.selectedIds.add(id);

    syncItemClasses(state);
    syncValidationState(state);
  });
}

function loadNextQuestion(state) {
  const settingsKey = JSON.stringify(state.settings);
  if (state.settingsKey && state.settingsKey !== settingsKey) {
    state.lastQuestionKey = "";
  }
  state.settingsKey = settingsKey;

  const nextQuestion = pickQuestion(state.settings, { avoidKey:state.lastQuestionKey });
  if (!nextQuestion) {
    throw new Error("Impossible de générer l’exercice avec ces réglages.");
  }

  state.currentQuestion = nextQuestion;
  state.lastQuestionKey = questionKey(nextQuestion);
  state.selectedIds = new Set();
  state.studentSelectionSnapshot = null;
  state.lastEvaluation = null;
  state.phaseMode = "question";
  state.answerDisplayMode = "correction";

  updateInstruction(state);
  renderQuestion(state);
  syncValidationState(state);
}

function renderQuestion(state) {
  if (!state.boardEl) return;
  const question = state.currentQuestion;
  if (!question) {
    state.boardEl.className = "iv-board is-empty";
    state.boardEl.innerHTML = '<div class="iv-empty-message">L’activité va commencer.</div>';
    return;
  }

  const lengthClass = question.maxItemLength <= 4
    ? "iv-board--short"
    : question.maxItemLength <= 10
      ? "iv-board--words"
      : "iv-board--long";
  const densityClass = question.totalCount >= 36
    ? "iv-board--dense"
    : question.totalCount >= 24
      ? "iv-board--medium"
      : "iv-board--airy";
  const resultClass = state.phaseMode === "answer"
    ? (state.lastEvaluation?.isCorrect ? " is-correct" : " is-incorrect")
    : "";

  state.boardEl.className = `iv-board ${lengthClass} ${densityClass}${resultClass}${state.phaseMode === "answer" ? " is-answer" : ""}`;
  state.boardEl.innerHTML = `
    <section class="iv-items" role="group" aria-label="Mots à examiner">
      ${question.items.map((item) => renderItem(state, item)).join("")}
    </section>
  `;
}

function renderItem(state, item) {
  const interactive = isQuestionInteractive(state);
  const classes = getItemClassNames(state, item);
  const pressed = state.selectedIds.has(item.id) ? "true" : "false";

  if (!interactive) {
    return `<span class="${classes}" data-iv-item-static="${escapeAttr(item.id)}"><span class="iv-item-text">${escapeHtml(item.text)}</span></span>`;
  }

  return `
    <button
      type="button"
      class="${classes}"
      data-iv-item-id="${escapeAttr(item.id)}"
      aria-pressed="${pressed}"
      aria-label="${escapeAttr(item.text)}"
    ><span class="iv-item-text">${escapeHtml(item.text)}</span></button>
  `;
}

function getItemClassNames(state, item) {
  const classes = ["iv-item"];
  const selectedNow = state.selectedIds.has(item.id);

  if (state.phaseMode === "question") {
    if (selectedNow) classes.push("is-selected");
    return classes.join(" ");
  }

  const studentSelection = getStudentSelection(state);
  const wasSelected = studentSelection.has(item.id);

  if (state.answerDisplayMode === "student") {
    if (wasSelected && item.isTarget) classes.push("is-correct");
    else if (wasSelected && !item.isTarget) classes.push("is-wrong");
    return classes.join(" ");
  }

  if (item.isTarget && wasSelected) classes.push("is-correct");
  else if (item.isTarget) classes.push("is-correction");
  else if (wasSelected) classes.push("is-wrong");
  return classes.join(" ");
}

function syncItemClasses(state) {
  if (!state.boardEl || state.phaseMode !== "question") return;
  state.boardEl.querySelectorAll("[data-iv-item-id]").forEach((button) => {
    const id = String(button.dataset.ivItemId || "");
    const selected = state.selectedIds.has(id);
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
  });
}

function submitCurrentAnswer(state) {
  state.studentSelectionSnapshot = new Set(state.selectedIds);
  state.lastEvaluation = evaluateSelection(state.currentQuestion, [...state.studentSelectionSnapshot]);

  const requested = state.latestContext?.services?.requestAnswerPhase?.({
    manual:false,
    showAnswerNow:true,
    wasCorrect:state.lastEvaluation.isCorrect,
    skipValidationReview:true
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
  const fallback = "Clique sur tous les verbes.";
  const prompt = String(state.currentQuestion?.prompt || "").trim() || fallback;
  const text = resolveQuestionInstructionText(state.latestContext, prompt, fallback);
  setToolInstructionText(state.instructionEl, text);
}

function canValidate(state) {
  return state.responseUi === "boxed"
    && isQuestionInteractive(state)
    && state.selectedIds.size > 0;
}

function canToggleAnswerDisplay() {
  return false;
}

function isQuestionInteractive(state) {
  return state.phaseMode === "question" && !!state.currentQuestion;
}

function getStudentSelection(state) {
  return state.studentSelectionSnapshot instanceof Set ? state.studentSelectionSnapshot : state.selectedIds;
}

function syncValidationState(state) {
  state.latestContext?.services?.notifyValidationStateChanged?.();
}

async function ensureLexicalWordCatalog() {
  if (!lexicalWordCatalogPromise) {
    lexicalWordCatalogPromise = listPublicLexicalWords()
      .then((rows) => {
        const words = Array.isArray(rows) ? rows : [];
        setWordCatalog(words);
        return words;
      })
      .catch((error) => {
        lexicalWordCatalogPromise = null;
        setWordCatalog([]);
        throw error;
      });
  }
  return await lexicalWordCatalogPromise;
}

function teardownState(state, container) {
  if (container) container.innerHTML = "";
  state.container = null;
  state.root = null;
  state.instructionEl = null;
  state.boardEl = null;
  state.currentQuestion = null;
  state.selectedIds.clear();
  state.studentSelectionSnapshot = null;
  state.lastEvaluation = null;
  state.phaseMode = "idle";
}

function injectActivityStyles() {
  if (stylesReadyPromise) return stylesReadyPromise;
  ensureToolInstructionStyles();
  const href = new URL("./activity.css", import.meta.url).href;
  const existing = document.querySelector(`link[data-iv-activity-style="${href}"]`);
  if (existing) {
    stylesReadyPromise = Promise.resolve();
    return stylesReadyPromise;
  }

  stylesReadyPromise = new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.ivActivityStyle = href;
    link.addEventListener("load", resolve, { once:true });
    link.addEventListener("error", resolve, { once:true });
    document.head.appendChild(link);
  });
  return stylesReadyPromise;
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
