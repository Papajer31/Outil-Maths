import {
  normalizeSettings,
  setWordCatalog,
  pickQuestion,
  questionKey,
  evaluateSelection,
  buildSelectionPath
} from "./model.js";
import { listPublicPhonologyWords } from "../../shared/public-api.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveQuestionInstructionText,
  setToolInstructionText
} from "../../shared/tool-instruction.js";

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
      }
      loadNextQuestion(state);
    },

    showAnswer(container, context = initialContext) {
      state.container = container || state.container;
      syncRuntimeState(state, context ?? state.latestContext);
      if (!state.container || !state.currentQuestion) return;

      if (!state.root?.isConnected || state.root?.dataset.responseUi !== state.responseUi) {
        renderShell(state);
      }

      if (!state.studentSelectionSnapshot) {
        state.studentSelectionSnapshot = [...state.selection];
      }
      state.lastEvaluation = evaluateSelection(state.currentQuestion, state.studentSelectionSnapshot);
      state.phaseMode = "answer";
      state.answerDisplayMode = "correction";
      stopPointerSelection(state);
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
        canToggle:canToggleAnswerDisplay(state),
        mode:state.answerDisplayMode === "student" ? "student" : "correction"
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
    gridEl:null,
    settings:normalizeSettings(initialContext?.settings),
    settingsKey:"",
    responseUi:getResponseUi(initialContext),
    currentQuestion:null,
    lastQuestionKey:"",
    usedWordSlugs:new Set(),
    selection:[],
    studentSelectionSnapshot:null,
    lastEvaluation:null,
    phaseMode:"idle",
    answerDisplayMode:"correction",
    pointerId:null,
    pointerStartIndex:null,
    pointerAxis:null,
    pointerMoveHandler:null,
    pointerUpHandler:null
  };
}

function syncRuntimeState(state, context = {}) {
  state.latestContext = context ?? state.latestContext;
  state.settings = normalizeSettings(state.latestContext?.settings);
  state.responseUi = getResponseUi(state.latestContext);
}

function renderShell(state) {
  if (!state.container) return;
  stopPointerSelection(state);
  state.container.innerHTML = `
    <div class="mc-root" data-response-ui="${escapeAttr(state.responseUi)}">
      ${renderToolInstruction({ id:"mc_instruction" })}
      <div class="mc-board" id="mc_board" aria-live="polite"></div>
    </div>
  `;
  state.root = state.container.querySelector(".mc-root");
  state.instructionEl = state.container.querySelector("#mc_instruction");
  state.boardEl = state.container.querySelector("#mc_board");
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
    avoidKey:state.lastQuestionKey,
    usedWordSlugs:state.usedWordSlugs
  });
  if (!nextQuestion && state.usedWordSlugs.size) {
    state.usedWordSlugs.clear();
    nextQuestion = pickQuestion(state.settings, {
      avoidKey:state.lastQuestionKey,
      usedWordSlugs:state.usedWordSlugs
    });
  }
  if (!nextQuestion) {
    throw new Error("Aucun mot caché ne peut être généré avec cette cible et ces réglages.");
  }

  state.currentQuestion = nextQuestion;
  state.lastQuestionKey = questionKey(nextQuestion);
  state.usedWordSlugs.add(nextQuestion.slug);
  state.selection = [];
  state.studentSelectionSnapshot = null;
  state.lastEvaluation = null;
  state.phaseMode = "question";
  state.answerDisplayMode = "correction";
  stopPointerSelection(state);

  updateInstruction(state);
  renderQuestion(state);
  syncValidationState(state);
}

function renderQuestion(state) {
  if (!state.boardEl) return;
  stopPointerSelection(state);
  const question = state.currentQuestion;
  if (!question) {
    state.boardEl.className = "mc-board is-empty";
    state.boardEl.innerHTML = '<div class="mc-empty-message">L’activité va commencer.</div>';
    state.gridEl = null;
    return;
  }

  const displayedSelection = getDisplayedSelection(state);
  const displayedSet = new Set(displayedSelection);
  const expectedSet = new Set(question.expectedIndices || []);
  const studentSet = new Set(state.studentSelectionSnapshot || state.selection);
  const resultClass = state.phaseMode === "answer"
    ? (state.lastEvaluation?.isCorrect ? " is-correct" : " is-incorrect")
    : "";

  state.boardEl.className = `mc-board${resultClass}${state.phaseMode === "answer" ? " is-answer" : ""}`;
  const gridPixelWidth = Math.min(1220, question.columnCount * 72);
  const cellFontSize = Math.max(16, Math.min(42, Math.round((gridPixelWidth / Math.max(1, question.columnCount)) * 0.55)));
  state.boardEl.innerHTML = `
    <section class="mc-grid-wrap" aria-label="Grille de lettres">
      <div
        class="mc-grid"
        data-mc-grid
        style="--mc-cols:${question.columnCount};--mc-rows:${question.rowCount};--mc-grid-width:${gridPixelWidth}px;--mc-cell-font:${cellFontSize}px"
        role="grid"
        aria-rowcount="${question.rowCount}"
        aria-colcount="${question.columnCount}"
      >
        ${question.cells.map((cell) => renderCell(state, cell, displayedSet, expectedSet, studentSet)).join("")}
      </div>
    </section>
  `;
  state.gridEl = state.boardEl.querySelector("[data-mc-grid]");
  if (isQuestionInteractive(state)) bindGridSelection(state);
}

function renderCell(state, cell, displayedSet, expectedSet, studentSet) {
  const classes = ["mc-cell"];
  const index = Number(cell.index);
  if (displayedSet.has(index)) classes.push("is-selected");

  if (state.phaseMode === "answer") {
    if (state.answerDisplayMode === "correction") {
      if (expectedSet.has(index)) classes.push("is-correction");
    } else if (studentSet.has(index)) {
      classes.push(state.lastEvaluation?.isCorrect ? "is-correct" : "is-wrong");
    }
  }

  return `
    <button
      type="button"
      class="${classes.join(" ")}"
      data-mc-cell-index="${index}"
      role="gridcell"
      aria-rowindex="${Number(cell.row) + 1}"
      aria-colindex="${Number(cell.column) + 1}"
      aria-label="${escapeAttr(String(cell.text || ""))}"
      ${isQuestionInteractive(state) ? "" : "disabled"}
    >${escapeHtml(String(cell.text || ""))}</button>
  `;
}

function bindGridSelection(state) {
  if (!state.gridEl) return;
  state.gridEl.addEventListener("pointerdown", (event) => {
    if (!isQuestionInteractive(state) || (event.button != null && event.button !== 0)) return;
    const cell = event.target instanceof Element ? event.target.closest("[data-mc-cell-index]") : null;
    if (!cell) return;
    const index = Number(cell.dataset.mcCellIndex);
    if (!Number.isInteger(index)) return;

    event.preventDefault();
    stopPointerSelection(state);
    state.pointerId = event.pointerId;
    state.pointerStartIndex = index;
    state.pointerAxis = null;
    state.selection = [index];
    syncSelectionClasses(state);
    syncValidationState(state);

    try { state.gridEl.setPointerCapture?.(event.pointerId); } catch {}

    state.pointerMoveHandler = (moveEvent) => {
      if (moveEvent.pointerId !== state.pointerId || !isQuestionInteractive(state)) return;
      const endIndex = findNearestCellIndex(state, moveEvent.clientX, moveEvent.clientY);
      if (!Number.isInteger(endIndex)) return;
      const result = buildSelectionPath(
        state.pointerStartIndex,
        endIndex,
        state.currentQuestion.rowCount,
        state.currentQuestion.columnCount,
        state.pointerAxis
      );
      if (!state.pointerAxis && result.indices.length > 1) state.pointerAxis = result.axis;
      state.selection = result.indices;
      syncSelectionClasses(state);
      syncValidationState(state);
    };

    state.pointerUpHandler = (upEvent) => {
      if (upEvent.pointerId !== state.pointerId) return;
      try { state.gridEl?.releasePointerCapture?.(upEvent.pointerId); } catch {}
      stopPointerSelection(state);
      syncValidationState(state);
    };

    window.addEventListener("pointermove", state.pointerMoveHandler, { passive:false });
    window.addEventListener("pointerup", state.pointerUpHandler);
    window.addEventListener("pointercancel", state.pointerUpHandler);
  });
}

function findNearestCellIndex(state, clientX, clientY) {
  if (!state.gridEl) return null;
  const cells = [...state.gridEl.querySelectorAll("[data-mc-cell-index]")];
  let bestIndex = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const cell of cells) {
    const rect = cell.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distance = (clientX - centerX) ** 2 + (clientY - centerY) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = Number(cell.dataset.mcCellIndex);
    }
  }
  return Number.isInteger(bestIndex) ? bestIndex : null;
}

function syncSelectionClasses(state) {
  if (!state.gridEl || state.phaseMode !== "question") return;
  const selected = new Set(state.selection);
  state.gridEl.querySelectorAll("[data-mc-cell-index]").forEach((cell) => {
    const index = Number(cell.dataset.mcCellIndex);
    cell.classList.toggle("is-selected", selected.has(index));
  });
}

function stopPointerSelection(state) {
  if (state.pointerMoveHandler) window.removeEventListener("pointermove", state.pointerMoveHandler);
  if (state.pointerUpHandler) {
    window.removeEventListener("pointerup", state.pointerUpHandler);
    window.removeEventListener("pointercancel", state.pointerUpHandler);
  }
  state.pointerId = null;
  state.pointerStartIndex = null;
  state.pointerAxis = null;
  state.pointerMoveHandler = null;
  state.pointerUpHandler = null;
}

function getDisplayedSelection(state) {
  if (state.phaseMode !== "answer") return state.selection;
  if (state.answerDisplayMode === "student") return state.studentSelectionSnapshot || [];
  return state.currentQuestion?.expectedIndices || [];
}

function submitCurrentAnswer(state) {
  state.studentSelectionSnapshot = [...state.selection];
  state.lastEvaluation = evaluateSelection(state.currentQuestion, state.studentSelectionSnapshot);
  stopPointerSelection(state);

  const requested = state.latestContext?.services?.requestAnswerPhase?.({
    manual:false,
    showAnswerNow:true,
    wasCorrect:state.lastEvaluation.isCorrect
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
  const fallback = "Retrouve le mot caché dans la grille.";
  const prompt = String(state.currentQuestion?.prompt || "").trim() || fallback;
  const text = resolveQuestionInstructionText(state.latestContext, prompt, fallback);
  setToolInstructionText(state.instructionEl, text);
}

function canValidate(state) {
  return state.responseUi === "boxed"
    && isQuestionInteractive(state)
    && state.selection.length > 0;
}

function canToggleAnswerDisplay(state) {
  return state.responseUi === "boxed"
    && state.phaseMode === "answer"
    && Array.isArray(state.studentSelectionSnapshot)
    && state.lastEvaluation?.isCorrect === false;
}

function isQuestionInteractive(state) {
  return state.phaseMode === "question" && !!state.currentQuestion;
}

function syncValidationState(state) {
  state.latestContext?.services?.notifyValidationStateChanged?.();
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
  stopPointerSelection(state);
  if (container) container.innerHTML = "";
  state.container = null;
  state.root = null;
  state.instructionEl = null;
  state.boardEl = null;
  state.gridEl = null;
  state.currentQuestion = null;
  state.selection = [];
  state.studentSelectionSnapshot = null;
  state.lastEvaluation = null;
  state.phaseMode = "idle";
}

function injectActivityStyles() {
  if (stylesReadyPromise) return stylesReadyPromise;
  ensureToolInstructionStyles();
  const href = new URL("./activity.css", import.meta.url).href;
  const existing = document.querySelector(`link[data-mc-activity-style="${href}"]`);
  if (existing) {
    stylesReadyPromise = Promise.resolve();
    return stylesReadyPromise;
  }
  stylesReadyPromise = new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.mcActivityStyle = href;
    link.addEventListener("load", () => resolve(), { once:true });
    link.addEventListener("error", () => resolve(), { once:true });
    document.head.appendChild(link);
  });
  return stylesReadyPromise;
}

function getResponseUi(context = {}) {
  return context?.responseUi === "boxed" ? "boxed" : "inline";
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
