import {
  normalizeSettings,
  setWordCatalog,
  pickQuestion,
  questionKey,
  evaluateCuts,
  normalizeCutPositions
} from "./model.js";
import { listPublicPhonologyWords } from "../../shared/public-api.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveQuestionInstructionText,
  setToolInstructionText
} from "../../shared/tool-instruction.js";
import { bindFreeDrag, clientPointToLocalPoint } from "../../shared/tool-ui/drag-core.js";

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

      if (!state.studentCutsSnapshot) {
        state.studentCutsSnapshot = new Set(state.cuts);
      }
      state.lastEvaluation = evaluateCuts(state.currentQuestion, [...state.studentCutsSnapshot]);
      state.phaseMode = "answer";
      state.answerDisplayMode = "correction";
      state.activeCutPosition = null;
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
        mode:state.answerDisplayMode === "student" ? "student" : "correction",
        transitionTargets:[state.boardEl]
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
    stringShellEl:null,
    stringEl:null,
    previewLineEl:null,
    trackEl:null,
    scissorsEl:null,
    cutButtonEl:null,
    undoButtonEl:null,
    settings:normalizeSettings(initialContext?.settings),
    settingsKey:"",
    responseUi:getResponseUi(initialContext),
    currentQuestion:null,
    lastQuestionKey:"",
    usedWordSlugs:new Set(),
    cuts:new Set(),
    cutHistory:[],
    activeCutPosition:null,
    boundaryMetrics:[],
    studentCutsSnapshot:null,
    lastEvaluation:null,
    phaseMode:"idle",
    answerDisplayMode:"correction",
    dragPointerId:null,
    dragAbortController:null,
    resizeObserver:null,
    geometryFrame:null
  };
}

function syncRuntimeState(state, context = {}) {
  state.latestContext = context ?? state.latestContext;
  state.settings = normalizeSettings(state.latestContext?.settings);
  state.responseUi = getResponseUi(state.latestContext);
}

function renderShell(state) {
  if (!state.container) return;
  disconnectResizeObserver(state);

  state.container.innerHTML = `
    <div class="sm-root" data-response-ui="${escapeAttr(state.responseUi)}">
      ${renderToolInstruction({ id:"sm_instruction" })}
      <div class="sm-board" id="sm_board" aria-live="polite"></div>
    </div>
  `;

  state.root = state.container.querySelector(".sm-root");
  state.instructionEl = state.container.querySelector("#sm_instruction");
  state.boardEl = state.container.querySelector("#sm_board");
  updateInstruction(state);
  renderQuestion(state);
}

function bindEvents(state) {
  state.root?.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const cutButton = target.closest("[data-sm-cut]");
    if (cutButton) {
      commitActiveCut(state);
      return;
    }

    const undoButton = target.closest("[data-sm-undo]");
    if (undoButton) {
      undoLastCut(state);
      return;
    }
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
    throw new Error("Aucune suite de mots ne peut être générée avec cette cible et ces réglages.");
  }

  state.currentQuestion = nextQuestion;
  state.lastQuestionKey = questionKey(nextQuestion);
  nextQuestion.words.forEach((word) => state.usedWordSlugs.add(word.slug));
  state.cuts = new Set();
  state.cutHistory = [];
  state.activeCutPosition = null;
  state.boundaryMetrics = [];
  state.studentCutsSnapshot = null;
  state.lastEvaluation = null;
  state.phaseMode = "question";
  state.answerDisplayMode = "correction";
  state.dragPointerId = null;

  updateInstruction(state);
  renderQuestion(state);
  syncValidationState(state);
}

function renderQuestion(state) {
  if (!state.boardEl) return;
  disconnectResizeObserver(state);
  disconnectScissorsDrag(state);

  const question = state.currentQuestion;
  if (!question) {
    state.boardEl.className = "sm-board is-empty";
    state.boardEl.innerHTML = '<div class="sm-empty-message">L’activité va commencer.</div>';
    return;
  }

  const displayCuts = getDisplayedCuts(state);
  const expectedCuts = new Set(question.expectedCutPositions || []);
  const studentCuts = getStudentCuts(state);
  const charCount = Math.max(1, question.letters.length);
  const completed = state.cuts.size >= question.requiredCutCount;

  state.boardEl.className = `sm-board${state.phaseMode === "answer" ? " is-answer" : ""}`;
  state.boardEl.style.setProperty("--sm-char-count", String(charCount));
  state.boardEl.innerHTML = `
    <section class="sm-string-area" aria-label="Suite de lettres à segmenter">
      <div class="sm-string-shell" data-sm-string-shell>
        <div class="sm-string" data-sm-string>
      ${question.letters.map((letter, index) => renderLetter(state, letter, index, displayCuts, expectedCuts, studentCuts)).join("")}
        </div>
        <div class="sm-preview-line" data-sm-preview-line hidden aria-hidden="true"></div>
      </div>
    </section>

    <section class="sm-manipulation" aria-label="Outil de découpage">
      <div class="sm-track" data-sm-track>
        <button
          type="button"
          class="sm-scissors"
          data-sm-scissors
          aria-label="Déplacer les ciseaux"
          ${isQuestionInteractive(state) && !completed ? "" : "disabled"}
        >${renderScissorsSvg()}</button>
      </div>
      <div class="sm-actions">
        <button type="button" class="sm-cut-button" data-sm-cut aria-label="Découper" ${state.activeCutPosition ? "" : "disabled"}>${renderScissorsSvg()}</button>
        <button type="button" class="sm-undo-button" data-sm-undo aria-label="Annuler" ${isQuestionInteractive(state) && state.cutHistory.length ? "" : "disabled"}>${renderCloseSvg()}</button>
      </div>
    </section>
  `;

  state.stringShellEl = state.boardEl.querySelector("[data-sm-string-shell]");
  state.stringEl = state.boardEl.querySelector("[data-sm-string]");
  state.previewLineEl = state.boardEl.querySelector("[data-sm-preview-line]");
  state.trackEl = state.boardEl.querySelector("[data-sm-track]");
  state.scissorsEl = state.boardEl.querySelector("[data-sm-scissors]");
  state.cutButtonEl = state.boardEl.querySelector("[data-sm-cut]");
  state.undoButtonEl = state.boardEl.querySelector("[data-sm-undo]");

  // Calculer tout de suite évite que la première question utilise la largeur
  // par défaut de la piste avant le premier frame de rendu.
  refreshGeometry(state);
  scheduleGeometryRefresh(state);
  observeResize(state);
  bindScissorsDrag(state);
}

function renderLetter(state, letter, index, displayCuts, expectedCuts, studentCuts) {
  const boundaryBefore = index;
  const hasCut = index > 0 && displayCuts.has(boundaryBefore);
  const classes = ["sm-letter"];
  if (hasCut) classes.push("has-cut-before");

  if (state.phaseMode === "answer" && hasCut) {
    if (state.answerDisplayMode === "student") {
      classes.push(expectedCuts.has(boundaryBefore) ? "is-correct-cut" : "is-wrong-cut");
    } else if (expectedCuts.has(boundaryBefore)) {
      classes.push(studentCuts.has(boundaryBefore) ? "is-correct-cut" : "is-correction-cut");
    }
  }

  return `<span class="${classes.join(" ")}" data-sm-letter-index="${index}">${escapeHtml(letter)}</span>`;
}

function updateDragFromPointer(state, clientX) {
  if (!state.trackEl || !state.scissorsEl || !isQuestionInteractive(state)) return;
  if (state.cuts.size >= (state.currentQuestion?.requiredCutCount || 0)) {
    resetScissors(state);
    return;
  }

  const trackWidth = Math.max(0, state.trackEl.clientWidth || state.trackEl.offsetWidth || 0);
  if (!(trackWidth > 0)) return;
  const pointer = clientPointToLocalPoint(state.trackEl, clientX, 0);
  const x = Math.max(0, Math.min(trackWidth, pointer.x));
  const restThreshold = Math.min(36, trackWidth * 0.04);
  if (x <= restThreshold) {
    state.activeCutPosition = null;
    applyPreviewPosition(state, null, 0);
    syncCutButton(state);
    return;
  }

  const available = state.boundaryMetrics.filter((entry) => !state.cuts.has(entry.position));
  if (!available.length) {
    state.activeCutPosition = null;
    applyPreviewPosition(state, null, 0);
    syncCutButton(state);
    return;
  }

  let nearest = available[0];
  let bestDistance = Math.abs(nearest.x - x);
  for (const entry of available.slice(1)) {
    const distance = Math.abs(entry.x - x);
    if (distance < bestDistance) {
      nearest = entry;
      bestDistance = distance;
    }
  }

  state.activeCutPosition = nearest.position;
  applyPreviewPosition(state, nearest.x, nearest.x);
  syncCutButton(state);
}

function commitActiveCut(state) {
  if (!isQuestionInteractive(state)) return;
  const position = Number(state.activeCutPosition);
  if (!Number.isInteger(position) || state.cuts.has(position)) return;
  if (state.cuts.size >= (state.currentQuestion?.requiredCutCount || 0)) return;

  state.cuts.add(position);
  state.cutHistory.push(position);
  state.activeCutPosition = null;
  renderQuestion(state);
  syncValidationState(state);
}

function undoLastCut(state) {
  if (!isQuestionInteractive(state) || !state.cutHistory.length) return;
  const position = state.cutHistory.pop();
  state.cuts.delete(position);
  state.activeCutPosition = null;
  renderQuestion(state);
  syncValidationState(state);
}

function refreshGeometry(state) {
  if (!state.stringEl || !state.trackEl || !state.scissorsEl || !state.currentQuestion) return;
  fitStringToAvailableWidth(state);
  const letters = [...state.stringEl.querySelectorAll("[data-sm-letter-index]")];
  if (letters.length < 2) {
    state.boundaryMetrics = [];
    return;
  }

  const stringRect = state.stringEl.getBoundingClientRect();
  const shellRect = state.stringShellEl?.getBoundingClientRect() || stringRect;
  const width = Math.max(120, state.stringEl.clientWidth || state.stringEl.offsetWidth || 0);
  state.trackEl.style.width = `${Math.round(width)}px`;
  const trackRect = state.trackEl.getBoundingClientRect();
  const scissorsRect = state.scissorsEl?.getBoundingClientRect();
  if (state.previewLineEl && scissorsRect) {
    const scissorsCenter = clientPointToLocalPoint(
      state.stringShellEl,
      scissorsRect.left + scissorsRect.width / 2,
      scissorsRect.top + scissorsRect.height / 2
    );
    const guideTop = -18;
    state.previewLineEl.style.setProperty("--sm-guide-top", `${guideTop}px`);
    state.previewLineEl.style.setProperty("--sm-guide-height", `${Math.max(0, scissorsCenter.y - guideTop)}px`);
  }

  state.boundaryMetrics = [];
  for (let position = 1; position < letters.length; position += 1) {
    const previousRect = letters[position - 1].getBoundingClientRect();
    const nextRect = letters[position].getBoundingClientRect();
    const boundaryViewportX = (previousRect.right + nextRect.left) / 2;
    state.boundaryMetrics.push({
      position,
      x:clientPointToLocalPoint(state.trackEl, boundaryViewportX, trackRect.top).x,
      shellX:clientPointToLocalPoint(state.stringShellEl, boundaryViewportX, shellRect.top).x
    });
  }

  resetScissors(state);
}

function fitStringToAvailableWidth(state) {
  const area = state.boardEl?.querySelector?.(".sm-string-area");
  if (!area || !state.stringEl) return;

  const availableWidth = Math.max(0, area.clientWidth - 20);
  const currentWidth = Math.max(1, state.stringEl.offsetWidth || state.stringEl.clientWidth || 0);
  const currentFontSize = Number.parseFloat(globalThis.getComputedStyle?.(state.stringEl)?.fontSize || "0");
  if (!(availableWidth > 0) || !(currentFontSize > 0)) return;

  // Les séparations ajoutent chacune une marge de .58em. On la réserve dès
  // l'affichage initial afin que la chaîne reste lisible après les découpages.
  const displayedCuts = getDisplayedCuts(state).size;
  const remainingCuts = Math.max(0, (state.currentQuestion?.requiredCutCount || 0) - displayedCuts);
  const expectedWidth = currentWidth + remainingCuts * currentFontSize * .58;
  const targetWidth = availableWidth * .94;
  const nextFontSize = Math.max(24, Math.min(72, currentFontSize * targetWidth / expectedWidth));

  if (Math.abs(nextFontSize - currentFontSize) >= .25) {
    state.stringEl.style.fontSize = `${Math.round(nextFontSize * 10) / 10}px`;
  }
}

function applyPreviewPosition(state, markerX, scissorsX) {
  if (state.scissorsEl) {
    state.scissorsEl.style.left = `${Math.max(0, Number(scissorsX) || 0)}px`;
  }
  if (!state.previewLineEl) return;
  if (!Number.isFinite(Number(markerX)) || state.activeCutPosition === null) {
    state.previewLineEl.hidden = true;
    state.previewLineEl.style.left = "0px";
    return;
  }
  const metric = state.boundaryMetrics.find((entry) => entry.position === state.activeCutPosition);
  const left = metric?.shellX ?? Number(markerX);
  state.previewLineEl.hidden = false;
  state.previewLineEl.style.left = `${Math.max(0, left)}px`;
}

function resetScissors(state) {
  state.activeCutPosition = null;
  applyPreviewPosition(state, null, 0);
  syncCutButton(state);
}

function syncCutButton(state) {
  if (state.cutButtonEl) {
    state.cutButtonEl.disabled = !isQuestionInteractive(state) || !state.activeCutPosition;
  }
}

function getDisplayedCuts(state) {
  if (state.phaseMode !== "answer") return new Set(state.cuts);
  const student = getStudentCuts(state);
  if (state.answerDisplayMode === "student") return new Set(student);
  return new Set(state.currentQuestion?.expectedCutPositions || []);
}

function getStudentCuts(state) {
  if (state.studentCutsSnapshot instanceof Set) return state.studentCutsSnapshot;
  return state.cuts;
}

function submitCurrentAnswer(state) {
  state.studentCutsSnapshot = new Set(state.cuts);
  state.lastEvaluation = evaluateCuts(state.currentQuestion, [...state.studentCutsSnapshot]);

  const requested = state.latestContext?.services?.requestAnswerPhase?.({
    manual:false,
    showAnswerNow:true,
    wasCorrect:state.lastEvaluation.isCorrect
  });

  if (!requested) {
    state.phaseMode = "answer";
    state.answerDisplayMode = "correction";
    state.activeCutPosition = null;
    renderQuestion(state);
  }
  syncValidationState(state);
}

function updateInstruction(state) {
  if (!state.instructionEl) return;
  const wordCount = state.currentQuestion?.words?.length || state.settings.wordCount || 4;
  const fallback = `Découpe cette suite de lettres en ${wordCount} mots.`;
  const prompt = String(state.currentQuestion?.prompt || "").trim() || fallback;
  const text = resolveQuestionInstructionText(state.latestContext, prompt, fallback);
  setToolInstructionText(state.instructionEl, text);
}

function canValidate(state) {
  return state.responseUi === "boxed"
    && isQuestionInteractive(state)
    && state.cuts.size === (state.currentQuestion?.requiredCutCount || 0);
}

function canToggleAnswerDisplay(state) {
  return state.responseUi === "boxed"
    && state.phaseMode === "answer"
    && !!state.studentCutsSnapshot
    && state.lastEvaluation?.isCorrect === false;
}

function isQuestionInteractive(state) {
  return state.phaseMode === "question" && !!state.currentQuestion;
}

function scheduleGeometryRefresh(state) {
  if (state.geometryFrame !== null) cancelAnimationFrame(state.geometryFrame);
  state.geometryFrame = requestAnimationFrame(() => {
    state.geometryFrame = requestAnimationFrame(() => {
      state.geometryFrame = null;
      refreshGeometry(state);
    });
  });
}

function observeResize(state) {
  if (typeof ResizeObserver !== "function" || !state.stringShellEl) return;
  state.resizeObserver = new ResizeObserver(() => scheduleGeometryRefresh(state));
  state.resizeObserver.observe(state.stringShellEl);
  if (state.root) state.resizeObserver.observe(state.root);
  globalThis.document?.fonts?.ready?.then?.(() => scheduleGeometryRefresh(state));
}

function bindScissorsDrag(state) {
  if (!state.scissorsEl || !state.trackEl) return;
  const controller = new AbortController();
  state.dragAbortController = controller;
  bindFreeDrag(state.scissorsEl, {
    surface:state.trackEl,
    signal:controller.signal,
    dragClass:"is-dragging",
    positionElement:false,
    disabled:() => !isQuestionInteractive(state) || state.cuts.size >= (state.currentQuestion?.requiredCutCount || 0),
    onMove:({ event }) => updateDragFromPointer(state, event.clientX),
    onEnd:() => { state.dragPointerId = null; }
  });
}

function disconnectScissorsDrag(state) {
  state.dragAbortController?.abort?.();
  state.dragAbortController = null;
  state.dragPointerId = null;
}

function disconnectResizeObserver(state) {
  state.resizeObserver?.disconnect?.();
  state.resizeObserver = null;
  if (state.geometryFrame !== null) cancelAnimationFrame(state.geometryFrame);
  state.geometryFrame = null;
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
  disconnectResizeObserver(state);
  disconnectScissorsDrag(state);
  if (container) container.innerHTML = "";
  state.container = null;
  state.root = null;
  state.instructionEl = null;
  state.boardEl = null;
  state.stringShellEl = null;
  state.stringEl = null;
  state.previewLineEl = null;
  state.trackEl = null;
  state.scissorsEl = null;
  state.currentQuestion = null;
  state.cuts.clear();
  state.cutHistory = [];
  state.studentCutsSnapshot = null;
  state.lastEvaluation = null;
  state.phaseMode = "idle";
}

function injectActivityStyles() {
  if (stylesReadyPromise) return stylesReadyPromise;
  ensureToolInstructionStyles();

  const href = new URL("./activity.css", import.meta.url).href;
  const existing = document.querySelector(`link[data-sm-activity-style="${href}"]`);
  if (existing) {
    stylesReadyPromise = Promise.resolve();
    return stylesReadyPromise;
  }

  stylesReadyPromise = new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.smActivityStyle = href;
    link.addEventListener("load", resolve, { once:true });
    link.addEventListener("error", resolve, { once:true });
    document.head.appendChild(link);
  });
  return stylesReadyPromise;
}

function renderScissorsSvg() {
  return `
    <svg viewBox="0 -960 960 960" aria-hidden="true" focusable="false">
      <g transform="rotate(-90 480 -480)">
        <path fill="currentColor" d="M760-120 480-400l-94 94q8 15 11 32t3 34q0 66-47 113T240-80q-66 0-113-47T80-240q0-66 47-113t113-47q17 0 34 3t32 11l94-94-94-94q-15 8-32 11t-34 3q-66 0-113-47T80-720q0-66 47-113t113-47q66 0 113 47t47 113q0 17-3 34t-11 32l494 494v40H760ZM600-520l-80-80 240-240h120v40L600-520ZM296.5-663.5Q320-687 320-720t-23.5-56.5Q273-800 240-800t-56.5 23.5Q160-753 160-720t23.5 56.5Q207-640 240-640t56.5-23.5ZM494-466q6-6 6-14t-6-14q-6-6-14-6t-14 6q-6 6-6 14t6 14q6 6 14 6t14-6ZM296.5-183.5Q320-207 320-240t-23.5-56.5Q273-320 240-320t-56.5 23.5Q160-273 160-240t23.5 56.5Q207-160 240-160t56.5-23.5Z"/>
      </g>
    </svg>
  `;
}

function renderCloseSvg() {
  return `
    <svg viewBox="0 -960 960 960" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="m249-207-42-42 231-231-231-231 42-42 231 231 231-231 42 42-231 231 231 231-42 42-231-231-231 231Z"/>
    </svg>
  `;
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
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
