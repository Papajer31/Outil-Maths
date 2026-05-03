import { listPublicQuestionBankItemsForSpace } from "../../shared/public-api.js";
import { renderToolInstruction, setToolInstructionText, ensureToolInstructionStyles, resolveQuestionInstructionText } from "../../shared/tool-instruction.js";
import { renderSimpleMarkupToHtml } from "../../shared/simple-markup.js";
import { normalizeTokenIndexes, renderSelectionTextToHtml } from "../../shared/selection-text.js";
import {
  createQuestionDeck,
  evaluateSelection,
  normalizeSelectionItems,
  normalizeSettings
} from "./model.js";

let stylesInjected = false;
const SVG_NS = "http://www.w3.org/2000/svg";
const SELECTION_LAYER_OUTSET_X = 5;
const SELECTION_LAYER_OUTSET_Y = 4;
const SELECTION_LAYER_RADIUS = 14;

export function createActivity(initialContext = {}) {
  injectStyles();
  const state = createRuntimeState(initialContext);

  return {
    mount(container, context = initialContext) {
      state.container = container;
      state.latestContext = context ?? state.latestContext;
      syncRuntimeState(state, state.latestContext);
      renderShell(state);
      syncValidateState(state);
    },

    async nextQuestion(container, context = state.latestContext) {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      await loadNextQuestion(state, state.latestContext);
      return state.currentQuestion;
    },

    async next(container, context = state.latestContext) {
      return this.nextQuestion(container, context);
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
        answered: state.selectedTokenIndexes.length > 0 || state.submittedTokenIndexes.length > 0,
        correct: evaluation.isCorrect
      };
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
      return shouldShowSelectionAsResponse(context);
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
    statementEl: null,
    correctionEl: null,
    currentQuestion: null,
    questions: [],
    deck: [],
    deckIndex: 0,
    loadedBankId: "",
    loadedDrawMode: "",
    loadedSelectionMode: "",
    loadingPromise: null,
    answerRevealed: false,
    selectedTokenIndexes: [],
    submittedTokenIndexes: [],
    answerDisplayMode: "correction",
    showSelectionAsResponse: shouldShowSelectionAsResponse(initialContext),
    activityMode: normalizeActivityMode(initialContext?.activityMode),
    projectionResponseUi: normalizeProjectionResponseUi(initialContext?.projectionResponseUi),
    selectionMode: "disjoint",
    tokenAbortController: null,
    selectionLayerFrame: null,
    statementResizeObserver: null,
    windowResizeAbortController: null,
    lastSelectionRenderState: null
  };
}

function syncRuntimeState(state, context = state.latestContext) {
  state.activityMode = normalizeActivityMode(context?.activityMode);
  state.projectionResponseUi = normalizeProjectionResponseUi(context?.projectionResponseUi);
  state.showSelectionAsResponse = shouldShowSelectionAsResponse(context);
}

function renderShell(state) {
  const container = state.container;
  if (!container) return;
  syncRuntimeState(state);
  teardownTokenBindings(state);
  teardownSelectionLayer(state);

  container.innerHTML = `
    <div class="selection-root${state.showSelectionAsResponse ? " selection-root--boxed" : " selection-root--free"}">
      ${renderToolInstruction({ id: "selection_instruction" })}
      <div class="selection-card" id="selection_card">
        <div class="selection-statement" id="selection_statement"></div>
        <div class="selection-correction selection-correction--empty" id="selection_correction" aria-hidden="true"></div>
      </div>
    </div>
  `;

  state.root = container.querySelector(".selection-root");
  state.instructionEl = container.querySelector("#selection_instruction");
  state.statementEl = container.querySelector("#selection_statement");
  state.correctionEl = container.querySelector("#selection_correction");
  updateInstructionDisplay(state);
}

async function loadNextQuestion(state, context = {}) {
  syncRuntimeState(state, context);
  const settings = normalizeSettings(context?.settings);
  state.selectionMode = settings.selectionMode;
  await ensureQuestionsLoaded(state, settings, context);

  state.answerRevealed = false;
  state.selectedTokenIndexes = [];
  state.submittedTokenIndexes = [];
  state.answerDisplayMode = "correction";
  state.currentQuestion = pickNextQuestion(state, settings);

  renderQuestion(state);
  syncValidateState(state);
}

async function ensureQuestionsLoaded(state, settings, context = {}) {
  const bankId = String(settings.bankId || "").trim();
  const accessCode = resolveAccessCode(context);
  const drawMode = String(settings.drawMode || "").trim();
  const selectionMode = String(settings.selectionMode || "").trim();

  if (!bankId) {
    state.questions = [];
    state.deck = [];
    state.deckIndex = 0;
    state.loadedBankId = "";
    state.loadedDrawMode = "";
    state.loadedSelectionMode = "";
    return;
  }

  if (
    state.loadedBankId === bankId
    && state.loadedDrawMode === drawMode
    && state.loadedSelectionMode === selectionMode
    && state.questions.length
  ) return;

  if (state.loadingPromise) await state.loadingPromise;

  if (
    state.loadedBankId === bankId
    && state.loadedDrawMode === drawMode
    && state.loadedSelectionMode === selectionMode
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

    if (!items.length) items = settings.bankItemsSnapshot;

    const normalizedItems = normalizeSelectionItems(items);
    state.questions = normalizedItems;
    state.deck = createQuestionDeck(normalizedItems, settings.drawMode);
    state.deckIndex = 0;
    state.loadedBankId = bankId;
    state.loadedDrawMode = drawMode;
    state.loadedSelectionMode = selectionMode;
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

  const nextQuestion = state.deck[state.deckIndex] || state.deck[0] || null;
  state.deckIndex += 1;
  return nextQuestion;
}

function renderQuestion(state) {
  updateInstructionDisplay(state);
  state.root?.classList.remove("selection-root--correct", "selection-root--incorrect", "selection-root--revealed", "selection-root--empty");
  state.root?.classList.toggle("selection-root--boxed", state.showSelectionAsResponse);
  state.root?.classList.toggle("selection-root--free", !state.showSelectionAsResponse);

  if (!state.currentQuestion) {
    renderEmptyQuestion(state);
    return;
  }

  if (state.correctionEl) {
    state.correctionEl.classList.add("selection-correction--empty");
    state.correctionEl.setAttribute("aria-hidden", "true");
    state.correctionEl.innerHTML = "";
  }

  renderStatement(state);
}

function renderEmptyQuestion(state) {
  teardownTokenBindings(state);
  teardownSelectionLayer(state);
  state.lastSelectionRenderState = null;
  state.root?.classList.add("selection-root--empty");
  if (state.statementEl) {
    state.statementEl.classList.remove("selection-statement--continuous", "selection-statement--interactive");
    state.statementEl.innerHTML = `
      <div class="selection-empty-message">
        Aucun item disponible dans la banque sélectionnée.
      </div>
    `;
  }
  if (state.correctionEl) {
    state.correctionEl.classList.add("selection-correction--empty");
    state.correctionEl.setAttribute("aria-hidden", "true");
    state.correctionEl.innerHTML = "";
  }
}

function renderStatement(state) {
  if (!state.statementEl || !state.currentQuestion) return;
  teardownTokenBindings(state);

  const renderState = getSelectionRenderState(state);
  state.lastSelectionRenderState = renderState;
  state.statementEl.classList.toggle("selection-statement--continuous", state.selectionMode === "continuous");
  state.statementEl.classList.toggle("selection-statement--interactive", state.showSelectionAsResponse && !state.answerRevealed);
  state.statementEl.innerHTML = renderSelectionTextToHtml(state.currentQuestion.prompt, {
    activeIndexes: renderState.activeIndexes,
    activeKind: renderState.activeKind,
    selectionMode: state.selectionMode,
    interactive: state.showSelectionAsResponse && !state.answerRevealed,
    disabled: state.answerRevealed,
    ariaPrefix: "Mot à sélectionner"
  });

  bindTokenEvents(state);
  setupStatementResizeObserver(state);
  queueSelectionLayerRender(state);
  renderCorrectionExplanation(state);
}

function getSelectionRenderState(state) {
  if (!state.answerRevealed) {
    return { activeIndexes: state.selectedTokenIndexes, activeKind: "selected" };
  }

  const evaluation = getStoredEvaluation(state);
  if (evaluation.isCorrect) {
    return { activeIndexes: evaluation.expectedTokenIndexes, activeKind: "correct" };
  }

  if (state.answerDisplayMode === "student") {
    return { activeIndexes: evaluation.selectedTokenIndexes, activeKind: "student" };
  }

  return { activeIndexes: evaluation.expectedTokenIndexes, activeKind: "correction" };
}

function bindTokenEvents(state) {
  if (!state.statementEl || !state.showSelectionAsResponse || state.answerRevealed) return;
  teardownTokenBindings(state);

  const abortController = new AbortController();
  const { signal } = abortController;
  state.tokenAbortController = abortController;

  state.statementEl.querySelectorAll("[data-selection-token-index]").forEach((token) => {
    const toggle = () => {
      if (state.answerRevealed) return;
      const tokenIndex = Number(token.dataset.selectionTokenIndex);
      if (!Number.isFinite(tokenIndex)) return;
      const selected = new Set(state.selectedTokenIndexes);
      if (selected.has(tokenIndex)) selected.delete(tokenIndex);
      else selected.add(tokenIndex);
      state.selectedTokenIndexes = normalizeTokenIndexes(Array.from(selected), Infinity);
      renderStatement(state);
      syncValidateState(state);
    };

    token.addEventListener("click", toggle, { signal });
    token.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggle();
    }, { signal });
  });
}

function revealAnswer(state) {
  if (!state.currentQuestion) return;
  state.submittedTokenIndexes = normalizeTokenIndexes(state.selectedTokenIndexes, Infinity);
  state.answerRevealed = true;
  const evaluation = getStoredEvaluation(state);

  state.root?.classList.add("selection-root--revealed");
  if (state.showSelectionAsResponse) {
    state.root?.classList.toggle("selection-root--correct", evaluation.isCorrect);
    state.root?.classList.toggle("selection-root--incorrect", !evaluation.isCorrect);
  } else {
    state.root?.classList.remove("selection-root--correct", "selection-root--incorrect");
  }

  renderStatement(state);
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
    state.correctionEl.classList.add("selection-correction--empty");
    state.correctionEl.setAttribute("aria-hidden", "true");
    state.correctionEl.innerHTML = "";
    return;
  }
  state.correctionEl.classList.remove("selection-correction--empty");
  state.correctionEl.setAttribute("aria-hidden", "false");
  state.correctionEl.innerHTML = renderSimpleMarkupToHtml(explanation);
}

function canSubmitAnswer(state) {
  if (!state.showSelectionAsResponse || state.answerRevealed || !state.currentQuestion) return false;
  return state.selectedTokenIndexes.length > 0;
}

function syncValidateState(state) {
  state.latestContext?.services?.notifyValidationStateChanged?.();
}

function updateInstructionDisplay(state) {
  const fallback = "Sélectionne les mots demandés.";
  const text = resolveQuestionInstructionText(state.latestContext, fallback);
  setToolInstructionText(state.instructionEl, text);
}

function getStoredEvaluation(state) {
  return evaluateSelection(state.currentQuestion, state.submittedTokenIndexes ?? []);
}

function getCurrentEvaluation(state) {
  return evaluateSelection(state.currentQuestion, state.selectedTokenIndexes ?? []);
}

function isCurrentAnswerCorrect(state) {
  if (!state.showSelectionAsResponse || !state.currentQuestion) return false;
  return getCurrentEvaluation(state).isCorrect;
}

function canToggleStudentAnswerDisplay(state) {
  if (!state.showSelectionAsResponse || !state.answerRevealed || !state.currentQuestion) return false;
  if (!state.submittedTokenIndexes.length) return false;
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
  if (!state.showSelectionAsResponse || !state.answerRevealed || !state.statementEl) return false;
  if (!canToggleStudentAnswerDisplay(state)) {
    state.answerDisplayMode = "correction";
    renderStatement(state);
    return false;
  }
  state.answerDisplayMode = normalizeAnswerDisplayMode(mode);
  renderStatement(state);
  return true;
}

function normalizeAnswerDisplayMode(value) {
  return String(value ?? "").trim().toLowerCase() === "student" ? "student" : "correction";
}

function shouldShowSelectionAsResponse(context = {}) {
  const mode = normalizeActivityMode(context?.activityMode);
  if (mode === "individual") return true;
  if (mode === "group") return false;
  return normalizeProjectionResponseUi(context?.projectionResponseUi) === "boxed";
}

function normalizeActivityMode(value) {
  const safeValue = String(value ?? "").trim().toLowerCase();
  if (safeValue === "group" || safeValue === "projection") return safeValue;
  return "individual";
}

function normalizeProjectionResponseUi(value) {
  return String(value ?? "").trim().toLowerCase() === "boxed" ? "boxed" : "free";
}

function teardownState(state, container) {
  teardownTokenBindings(state);
  teardownSelectionLayer(state);
  if (container) container.innerHTML = "";
  state.container = null;
  state.root = null;
  state.instructionEl = null;
  state.statementEl = null;
  state.correctionEl = null;
  state.currentQuestion = null;
  state.questions = [];
  state.deck = [];
  state.deckIndex = 0;
  state.loadedBankId = "";
  state.loadedDrawMode = "";
  state.loadedSelectionMode = "";
  state.loadingPromise = null;
  state.answerRevealed = false;
  state.selectedTokenIndexes = [];
  state.submittedTokenIndexes = [];
  state.lastSelectionRenderState = null;
}

function teardownTokenBindings(state) {
  state.tokenAbortController?.abort?.();
  state.tokenAbortController = null;
}

function teardownSelectionLayer(state) {
  if (state.selectionLayerFrame !== null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(state.selectionLayerFrame);
  }
  state.selectionLayerFrame = null;
  state.statementResizeObserver?.disconnect?.();
  state.statementResizeObserver = null;
  state.windowResizeAbortController?.abort?.();
  state.windowResizeAbortController = null;
  state.statementEl?.querySelector(".selection-selection-layer")?.remove();
}

function setupStatementResizeObserver(state) {
  if (!state.statementEl || state.statementResizeObserver || state.windowResizeAbortController) return;

  if (typeof ResizeObserver === "function") {
    state.statementResizeObserver = new ResizeObserver(() => queueSelectionLayerRender(state));
    state.statementResizeObserver.observe(state.statementEl);
    return;
  }

  if (typeof window !== "undefined") {
    const abortController = new AbortController();
    state.windowResizeAbortController = abortController;
    window.addEventListener("resize", () => queueSelectionLayerRender(state), { signal: abortController.signal });
  }
}

function queueSelectionLayerRender(state) {
  if (state.selectionLayerFrame !== null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(state.selectionLayerFrame);
  }

  if (typeof requestAnimationFrame !== "function") {
    renderSelectionLayer(state);
    return;
  }

  state.selectionLayerFrame = requestAnimationFrame(() => {
    state.selectionLayerFrame = null;
    renderSelectionLayer(state);
  });
}

function renderSelectionLayer(state) {
  const statementEl = state.statementEl;
  if (!statementEl) return;
  statementEl.querySelector(".selection-selection-layer")?.remove();

  const renderState = state.lastSelectionRenderState || getSelectionRenderState(state);
  if (state.selectionMode !== "continuous" || !renderState?.activeIndexes?.length) return;

  const fragments = computeSelectionFragments(statementEl, renderState.activeIndexes);
  if (!fragments.length) return;

  const statementRect = statementEl.getBoundingClientRect();
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.classList.add("selection-selection-layer");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("width", String(Math.max(1, statementRect.width)));
  svg.setAttribute("height", String(Math.max(1, statementRect.height)));
  svg.setAttribute("viewBox", `0 0 ${Math.max(1, statementRect.width)} ${Math.max(1, statementRect.height)}`);

  fragments.forEach((fragment) => {
    svg.appendChild(createSelectionFragmentGroup(fragment, renderState.activeKind));
  });

  statementEl.prepend(svg);
}

function computeSelectionFragments(statementEl, activeIndexes = []) {
  const activeRuns = createContiguousIndexRuns(activeIndexes);
  if (!activeRuns.length) return [];

  const statementRect = statementEl.getBoundingClientRect();
  const tokenByIndex = new Map();
  statementEl.querySelectorAll("[data-selection-token-index]").forEach((tokenEl) => {
    const index = Number(tokenEl.dataset.selectionTokenIndex);
    if (Number.isFinite(index)) tokenByIndex.set(index, tokenEl);
  });

  return activeRuns.flatMap((run) => {
    const lineGroups = [];
    run.forEach((index) => {
      const tokenEl = tokenByIndex.get(index);
      if (!tokenEl) return;
      const rect = tokenEl.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const bounds = {
        index,
        left: rect.left - statementRect.left,
        right: rect.right - statementRect.left,
        top: rect.top - statementRect.top,
        bottom: rect.bottom - statementRect.top,
        centerY: rect.top + rect.height / 2
      };
      const current = lineGroups[lineGroups.length - 1];
      if (!current || !rectsShareVisualLine(current, bounds)) {
        lineGroups.push({
          startIndex: index,
          endIndex: index,
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
          bottom: bounds.bottom,
          centerY: bounds.centerY,
          count: 1
        });
        return;
      }

      current.endIndex = index;
      current.left = Math.min(current.left, bounds.left);
      current.right = Math.max(current.right, bounds.right);
      current.top = Math.min(current.top, bounds.top);
      current.bottom = Math.max(current.bottom, bounds.bottom);
      current.centerY = ((current.centerY * current.count) + bounds.centerY) / (current.count + 1);
      current.count += 1;
    });

    return lineGroups.map((group, groupIndex) => {
      const x = group.left - SELECTION_LAYER_OUTSET_X;
      const y = group.top - SELECTION_LAYER_OUTSET_Y;
      const width = (group.right - group.left) + SELECTION_LAYER_OUTSET_X * 2;
      const height = (group.bottom - group.top) + SELECTION_LAYER_OUTSET_Y * 2;
      return {
        x,
        y,
        width,
        height,
        dashedLeft: groupIndex > 0,
        dashedRight: groupIndex < lineGroups.length - 1
      };
    });
  });
}

function createContiguousIndexRuns(indexes = []) {
  const safeIndexes = normalizeTokenIndexes(indexes, Infinity);
  const runs = [];
  let current = [];
  safeIndexes.forEach((index) => {
    if (!current.length || index === current[current.length - 1] + 1) {
      current.push(index);
      return;
    }
    runs.push(current);
    current = [index];
  });
  if (current.length) runs.push(current);
  return runs;
}

function rectsShareVisualLine(group, bounds) {
  const groupHeight = Math.max(1, group.bottom - group.top);
  const boundsHeight = Math.max(1, bounds.bottom - bounds.top);
  const tolerance = Math.max(4, Math.min(groupHeight, boundsHeight) * 0.42);
  return Math.abs(group.centerY - bounds.centerY) <= tolerance;
}

function createSelectionFragmentGroup(fragment, activeKind = "selected") {
  const group = document.createElementNS(SVG_NS, "g");
  const safeKind = ["selected", "student", "correct", "correction"].includes(activeKind) ? activeKind : "selected";
  group.classList.add("selection-selection-fragment", `selection-selection-fragment--${safeKind}`);

  const fill = document.createElementNS(SVG_NS, "path");
  fill.classList.add("selection-selection-fragment-fill");
  fill.setAttribute("d", createSelectionFillPath(fragment));
  group.appendChild(fill);

  createSelectionBorderPaths(fragment).forEach(({ d, dashed }) => {
    const path = document.createElementNS(SVG_NS, "path");
    path.classList.add("selection-selection-fragment-border");
    if (dashed) path.classList.add("selection-selection-fragment-border--dashed");
    path.setAttribute("d", d);
    group.appendChild(path);
  });

  return group;
}

function createSelectionFillPath(fragment) {
  const { x, y, width, height, dashedLeft, dashedRight } = normalizeFragmentGeometry(fragment);
  const radii = fragmentRadii(width, height, dashedLeft, dashedRight);
  const right = x + width;
  const bottom = y + height;

  return [
    `M ${x + radii.topLeft} ${y}`,
    `L ${right - radii.topRight} ${y}`,
    radii.topRight ? `Q ${right} ${y} ${right} ${y + radii.topRight}` : `L ${right} ${y}`,
    `L ${right} ${bottom - radii.bottomRight}`,
    radii.bottomRight ? `Q ${right} ${bottom} ${right - radii.bottomRight} ${bottom}` : `L ${right} ${bottom}`,
    `L ${x + radii.bottomLeft} ${bottom}`,
    radii.bottomLeft ? `Q ${x} ${bottom} ${x} ${bottom - radii.bottomLeft}` : `L ${x} ${bottom}`,
    `L ${x} ${y + radii.topLeft}`,
    radii.topLeft ? `Q ${x} ${y} ${x + radii.topLeft} ${y}` : `L ${x} ${y}`,
    "Z"
  ].join(" ");
}

function createSelectionBorderPaths(fragment) {
  const { x, y, width, height, dashedLeft, dashedRight } = normalizeFragmentGeometry(fragment);
  const radii = fragmentRadii(width, height, dashedLeft, dashedRight);
  const right = x + width;
  const bottom = y + height;

  return [
    {
      d: [
        `M ${x + radii.topLeft} ${y}`,
        `L ${right - radii.topRight} ${y}`
      ].join(" "),
      dashed: false
    },
    {
      d: [
        radii.topRight ? `M ${right - radii.topRight} ${y} Q ${right} ${y} ${right} ${y + radii.topRight}` : `M ${right} ${y}`,
        `L ${right} ${bottom - radii.bottomRight}`,
        radii.bottomRight ? `Q ${right} ${bottom} ${right - radii.bottomRight} ${bottom}` : ""
      ].filter(Boolean).join(" "),
      dashed: dashedRight
    },
    {
      d: [
        `M ${right - radii.bottomRight} ${bottom}`,
        `L ${x + radii.bottomLeft} ${bottom}`
      ].join(" "),
      dashed: false
    },
    {
      d: [
        radii.bottomLeft ? `M ${x + radii.bottomLeft} ${bottom} Q ${x} ${bottom} ${x} ${bottom - radii.bottomLeft}` : `M ${x} ${bottom}`,
        `L ${x} ${y + radii.topLeft}`,
        radii.topLeft ? `Q ${x} ${y} ${x + radii.topLeft} ${y}` : ""
      ].filter(Boolean).join(" "),
      dashed: dashedLeft
    }
  ];
}

function normalizeFragmentGeometry(fragment) {
  return {
    x: Number(fragment.x) || 0,
    y: Number(fragment.y) || 0,
    width: Math.max(1, Number(fragment.width) || 0),
    height: Math.max(1, Number(fragment.height) || 0),
    dashedLeft: Boolean(fragment.dashedLeft),
    dashedRight: Boolean(fragment.dashedRight)
  };
}

function fragmentRadii(width, height, dashedLeft, dashedRight) {
  const radius = Math.min(SELECTION_LAYER_RADIUS, width / 2, height / 2);
  return {
    topLeft: dashedLeft ? 0 : radius,
    bottomLeft: dashedLeft ? 0 : radius,
    topRight: dashedRight ? 0 : radius,
    bottomRight: dashedRight ? 0 : radius
  };
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

  const selectionTextHref = new URL("../../shared/selection-text.css", import.meta.url).href;
  if (!document.querySelector(`link[data-selection-text-style="${selectionTextHref}"]`)) {
    const selectionTextLink = document.createElement("link");
    selectionTextLink.rel = "stylesheet";
    selectionTextLink.href = selectionTextHref;
    selectionTextLink.dataset.selectionTextStyle = selectionTextHref;
    document.head.appendChild(selectionTextLink);
  }

  const href = new URL("./activity.css", import.meta.url).href;
  if (document.querySelector(`link[data-selection-activity-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.selectionActivityStyle = href;
  document.head.appendChild(link);
}
