import {
  ANSWERS,
  evaluateAnswer,
  normalizeSettings,
  PROMPT_MODES,
  pickQuestion,
  questionKey
} from "./model.js";
import {
  ensureToolInstructionStyles,
  getCustomInstructionState,
  renderToolInstruction,
  resolveQuestionInstructionText,
  setToolInstructionText,
  shouldReserveInstructionSpace
} from "../../shared/tool-instruction.js";
import {
  bindFreeDrag,
  clientRectToLocalRect
} from "../../shared/tool-ui/drag-core.js";

let stylesInjected = false;

const DRAG_THRESHOLD_PX = 5;
const CORRECTION_STAGGER_MS = 54;

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

    next(container, context = state.latestContext) {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      loadNextQuestion(state, state.latestContext);
      return state.currentQuestion;
    },

    nextQuestion(container, context = state.latestContext) {
      return this.next(container, context);
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
        ? evaluateAnswer(state.currentQuestion, state.submittedAnswer)
        : evaluateAnswer(state.currentQuestion, state.selectedAnswer);
      return {
        answered: evaluation.answered,
        correct: evaluation.isCorrect
      };
    },

    supportsShellValidation(context = state.latestContext) {
      return shouldShowResponses(context);
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
    stageEl: null,
    workspaceEl: null,
    itemsLayerEl: null,
    responsesEl: null,
    currentQuestion: null,
    lastQuestionKey: "",
    answerRevealed: false,
    selectedAnswer: "",
    submittedAnswer: "",
    showResponses: shouldShowResponses(initialContext),
    itemAbortController: null,
    responseAbortController: null,
    correctionTimers: []
  };
}

function syncRuntimeState(state, context = state.latestContext) {
  state.showResponses = shouldShowResponses(context);
}

function renderShell(state) {
  const container = state.container;
  if (!container) return;
  teardownBindings(state);
  clearCorrectionTimers(state);

  container.innerHTML = `
    <div class="tool-runtime pma-root${state.showResponses ? " pma-root--boxed" : " pma-root--free"}">
      ${renderToolInstruction({ id: "pma_instruction" })}
      <div class="tool-stage pma-stage" id="pma_stage">
        <div class="tool-workspace tool-workspace--white pma-workspace" id="pma_workspace">
          <div class="pma-items-layer" id="pma_items_layer"></div>
        </div>
        <div class="tool-choice-grid pma-responses" id="pma_responses"></div>
      </div>
    </div>
  `;

  state.root = container.querySelector(".pma-root");
  state.instructionEl = container.querySelector("#pma_instruction");
  state.stageEl = container.querySelector("#pma_stage");
  state.workspaceEl = container.querySelector("#pma_workspace");
  state.itemsLayerEl = container.querySelector("#pma_items_layer");
  state.responsesEl = container.querySelector("#pma_responses");
  updateInstructionDisplay(state);
}

function loadNextQuestion(state, context = {}) {
  syncRuntimeState(state, context);
  teardownBindings(state);
  clearCorrectionTimers(state);

  const settings = normalizeSettings(context?.settings);
  const nextQuestion = pickQuestion(settings, {
    avoidKey: state.lastQuestionKey,
    attempts: 120
  });

  state.currentQuestion = nextQuestion;
  state.lastQuestionKey = nextQuestion ? questionKey(nextQuestion) : state.lastQuestionKey;
  state.answerRevealed = false;
  state.selectedAnswer = "";
  state.submittedAnswer = "";

  renderQuestion(state);
  syncValidateState(state);
}

function renderQuestion(state) {
  updateInstructionDisplay(state);
  state.root?.classList.remove("pma-root--correct", "pma-root--incorrect", "pma-root--revealed", "pma-root--empty");
  state.root?.classList.toggle("pma-root--boxed", state.showResponses);
  state.root?.classList.toggle("pma-root--free", !state.showResponses);

  if (!state.currentQuestion) {
    renderEmptyQuestion(state);
    return;
  }

  renderObjects(state);
  renderResponses(state);
}

function renderEmptyQuestion(state) {
  state.root?.classList.add("pma-root--empty");
  if (state.itemsLayerEl) {
    state.itemsLayerEl.innerHTML = `
      <div class="tool-empty-message pma-empty-message">
        Aucune question possible avec ces réglages.
      </div>
    `;
  }
  if (state.responsesEl) state.responsesEl.innerHTML = "";
}

function renderObjects(state) {
  const layer = state.itemsLayerEl;
  const question = state.currentQuestion;
  if (!layer || !question) return;

  layer.innerHTML = question.items.map((item) => renderObject(item)).join("");
  bindObjectDrag(state);
}

function renderObject(item) {
  const classes = [
    "tool-card",
    "tool-draggable",
    "pma-object",
    `pma-object--${item.color}`,
    `pma-object--${item.objectStyle}`
  ].join(" ");
  return `
    <div
      class="${classes}"
      data-pma-item-id="${escapeHtml(item.id)}"
      data-pma-color="${escapeHtml(item.color)}"
      style="left:${Number(item.x) || 50}%; top:${Number(item.y) || 50}%;"
      draggable="false"
      aria-hidden="true"
    >
      ${renderObjectVisual(item)}
    </div>
  `;
}

function renderObjectVisual(item) {
  if (item.objectStyle === "tokens") return renderTokenSvg(item.color);
  if (item.objectStyle === "emojis") return `<span class="pma-emoji" aria-hidden="true">${escapeHtml(item.emoji || "⭐")}</span>`;
  return renderCubeSvg(item.color);
}

function renderCubeSvg(color) {
  const main = color === ANSWERS.RED ? "#ef4444" : "#3b82f6";
  const light = color === ANSWERS.RED ? "#fca5a5" : "#93c5fd";
  const dark = color === ANSWERS.RED ? "#b91c1c" : "#1d4ed8";
  return `
    <svg class="pma-svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <path d="M18 32 50 15l32 17-32 17z" fill="${light}"/>
      <path d="M18 32v36l32 17V49z" fill="${main}"/>
      <path d="M82 32v36L50 85V49z" fill="${dark}"/>
      <path d="M18 32 50 49l32-17M50 49v36" fill="none" stroke="rgba(255,255,255,.42)" stroke-width="4" stroke-linejoin="round"/>
    </svg>
  `;
}

function renderTokenSvg(color) {
  const main = color === ANSWERS.RED ? "#ef4444" : "#3b82f6";
  const edge = color === ANSWERS.RED ? "#b91c1c" : "#1d4ed8";
  const side = color === ANSWERS.RED ? "#991b1b" : "#1e40af";
  return `
    <svg class="pma-svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <ellipse cx="50" cy="56" rx="39" ry="35" fill="${side}"/>
      <circle cx="50" cy="47" r="39" fill="${main}" stroke="${edge}" stroke-width="4"/>
    </svg>
  `;
}

function bindObjectDrag(state) {
  teardownObjectBindings(state);
  if (!state.itemsLayerEl || !state.workspaceEl || state.answerRevealed) return;

  const abortController = new AbortController();
  const { signal } = abortController;
  state.itemAbortController = abortController;

  state.itemsLayerEl.querySelectorAll("[data-pma-item-id]").forEach((itemEl) => {
    bindFreeDrag(itemEl, {
      surface: () => state.workspaceEl,
      threshold: DRAG_THRESHOLD_PX,
      dragClasses: ["is-dragging", "pma-object--dragging"],
      disabled: () => state.answerRevealed,
      zIndex: () => getNextZ(state),
      signal
    });
  });
}

function getNextZ(state) {
  const current = Number(state.root?.dataset?.pmaZ || 10);
  const next = current + 1;
  if (state.root) state.root.dataset.pmaZ = String(next);
  return next;
}

function renderResponses(state) {
  const responses = state.responsesEl;
  if (!responses) return;
  teardownResponseBindings(state);

  const options = [ANSWERS.RED, ANSWERS.EQUAL, ANSWERS.BLUE];
  responses.innerHTML = options.map((answer) => renderResponseButton(state, answer)).join("");
  bindResponseEvents(state);
}

function renderResponseButton(state, answer) {
  const question = state.currentQuestion;
  const selected = state.answerRevealed ? state.submittedAnswer === answer : state.selectedAnswer === answer;
  const correct = state.answerRevealed && question?.correctAnswer === answer;
  const incorrect = state.answerRevealed && selected && question?.correctAnswer !== answer;
  const classes = [
    "tool-choice-button",
    "pma-response",
    `pma-response--${answer}`,
    selected && !state.answerRevealed ? "is-selected" : "",
    correct ? "is-correct" : "",
    incorrect ? "is-incorrect" : "",
    state.answerRevealed ? "is-revealed" : ""
  ].filter(Boolean).join(" ");
  const tagName = state.showResponses ? "button" : "div";
  const attrs = state.showResponses
    ? `type="button" data-pma-answer="${escapeHtml(answer)}" aria-label="${escapeHtml(getAnswerText(answer))}" ${state.answerRevealed ? "disabled" : ""}`
    : `aria-hidden="true"`;

  return `
    <${tagName} class="${classes}" ${attrs}>
      ${renderResponseIcon(state, answer)}
    </${tagName}>
  `;
}

function renderResponseIcon(state, answer) {
  if (answer === ANSWERS.EQUAL) {
    return `
      <span class="pma-response-equal" aria-hidden="true">
        ${renderResponseObject(state, ANSWERS.RED)}
        <strong>=</strong>
        ${renderResponseObject(state, ANSWERS.BLUE)}
      </span>
    `;
  }
  return renderResponseObject(state, answer);
}

function renderResponseObject(state, color) {
  const question = state.currentQuestion || {};
  const objectStyle = question.objectStyle || "cubes";
  const emoji = color === ANSWERS.BLUE ? question.blueEmoji || "" : question.redEmoji || "";
  const classes = [
    "pma-response-object",
    `pma-response-object--${color}`,
    `pma-response-object--${objectStyle}`
  ].join(" ");
  return `
    <span class="${classes}" aria-hidden="true">
      ${renderObjectVisual({ color, objectStyle, emoji })}
    </span>
  `;
}

function getAnswerText(answer) {
  if (answer === ANSWERS.RED) return "Rouges";
  if (answer === ANSWERS.BLUE) return "Bleus";
  return "Autant";
}

function bindResponseEvents(state) {
  if (!state.responsesEl || !state.showResponses || state.answerRevealed) return;
  const abortController = new AbortController();
  const { signal } = abortController;
  state.responseAbortController = abortController;

  state.responsesEl.querySelectorAll("[data-pma-answer]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.answerRevealed) return;
      state.selectedAnswer = String(button.dataset.pmaAnswer || "");
      renderResponses(state);
      syncValidateState(state);
    }, { signal });
  });
}

function revealAnswer(state) {
  if (!state.currentQuestion || state.answerRevealed) return;
  state.submittedAnswer = state.selectedAnswer || "";
  state.answerRevealed = true;
  teardownBindings(state);

  const evaluation = evaluateAnswer(state.currentQuestion, state.submittedAnswer);
  state.root?.classList.add("pma-root--revealed");
  if (state.showResponses) {
    state.root?.classList.toggle("pma-root--correct", evaluation.isCorrect);
    state.root?.classList.toggle("pma-root--incorrect", !evaluation.isCorrect);
  } else {
    state.root?.classList.remove("pma-root--correct", "pma-root--incorrect");
  }

  renderResponses(state);
  animateCorrectionPairs(state);
}

function animateCorrectionPairs(state) {
  const workspace = state.workspaceEl;
  const question = state.currentQuestion;
  if (!workspace || !question) return;

  const redEls = Array.from(workspace.querySelectorAll('[data-pma-color="red"]'));
  const blueEls = Array.from(workspace.querySelectorAll('[data-pma-color="blue"]'));
  const targets = buildCorrectionTargets(workspace, redEls, blueEls);
  const movingEls = [...redEls, ...blueEls];

  movingEls.forEach((el, index) => {
    const localRect = clientRectToLocalRect(workspace, el.getBoundingClientRect());
    el.style.transition = "none";
    el.style.left = `${localRect.left}px`;
    el.style.top = `${localRect.top}px`;
    el.style.transform = "none";
    el.style.setProperty("--pma-object-size", `${Math.max(localRect.width, localRect.height)}px`);
    el.style.zIndex = String(30 + index);
    el.classList.add("pma-object--correcting");
  });

  void workspace.offsetWidth;

  requestAnimationFrame(() => {
    movingEls.forEach((el) => {
      el.style.removeProperty("transition");
    });

    requestAnimationFrame(() => {
      movingEls.forEach((el, index) => {
        const target = targets.get(el);
        if (!target) return;
        const timer = window.setTimeout(() => {
          el.style.left = `${target.x}px`;
          el.style.top = `${target.y}px`;
          el.style.setProperty("--pma-object-size", `${target.size}px`);
          el.classList.toggle("pma-object--leftover", target.leftover);
        }, index * CORRECTION_STAGGER_MS);
        state.correctionTimers.push(timer);
      });
    });
  });
}

function buildCorrectionTargets(workspace, redEls, blueEls) {
  const rect = {
    width: workspace.clientWidth || workspace.offsetWidth || workspace.getBoundingClientRect().width,
    height: workspace.clientHeight || workspace.offsetHeight || workspace.getBoundingClientRect().height
  };
  const itemSize = resolveItemSize(redEls[0] || blueEls[0], workspace);
  const pairCount = Math.min(redEls.length, blueEls.length);
  const leftoverRed = redEls.slice(pairCount);
  const leftoverBlue = blueEls.slice(pairCount);
  const leftovers = leftoverRed.length ? leftoverRed : leftoverBlue;
  const targets = new Map();
  const pairUnits = [];
  const pairStepRatio = resolveCorrectionPairStepRatio(redEls[0] || blueEls[0]);

  for (let index = 0; index < pairCount; index += 1) {
    pairUnits.push({ red: redEls[index], blue: blueEls[index] });
  }

  if (!pairUnits.length && !leftovers.length) return targets;

  const layout = computeCorrectionLayout(rect, itemSize, {
    pairCount: pairUnits.length,
    leftoverCount: leftovers.length,
    leftoversOnLeft: leftoverRed.length > 0,
    pairStepRatio
  });

  pairUnits.forEach((unit, index) => {
    const point = getCorrectionGridPoint(layout.pairs, index);
    targets.set(unit.red, { x: point.x, y: point.y, size: layout.itemSize, leftover: false });
    targets.set(unit.blue, {
      x: point.x + layout.pairStep,
      y: point.y,
      size: layout.itemSize,
      leftover: false
    });
  });

  leftovers.forEach((el, index) => {
    const point = getCorrectionGridPoint(layout.leftovers, index);
    targets.set(el, {
      x: point.x + (layout.leftovers.unitWidth - layout.itemWidth) / 2,
      y: point.y,
      size: layout.itemSize,
      leftover: true
    });
  });

  return targets;
}

function computeCorrectionLayout(rect, itemSize, { pairCount = 0, leftoverCount = 0, leftoversOnLeft = false, pairStepRatio = .72 } = {}) {
  const padding = 18;
  const bounds = splitCorrectionBounds(rect, padding, leftoverCount > 0, leftoversOnLeft);
  const basePairGap = itemSize.width * .1;
  const basePairStep = itemSize.width * pairStepRatio + basePairGap;
  const basePairColGap = Math.max(64, itemSize.width * 1.05);
  const basePairRowGap = Math.max(38, itemSize.height * .58);
  const baseLeftoverColGap = Math.max(20, itemSize.width * .35);
  const baseLeftoverRowGap = Math.max(22, itemSize.height * .36);
  const pairBest = computeBestCorrectionGrid({
    count: pairCount,
    bounds: bounds.pairs,
    unitWidth: itemSize.width + basePairStep,
    unitHeight: itemSize.height,
    colGap: basePairColGap,
    rowGap: basePairRowGap
  });
  const leftoverBest = computeBestCorrectionGrid({
    count: leftoverCount,
    bounds: bounds.leftovers,
    unitWidth: itemSize.width,
    unitHeight: itemSize.height,
    colGap: baseLeftoverColGap,
    rowGap: baseLeftoverRowGap
  });
  const scale = clamp(Math.min(pairBest.scale, leftoverBest.scale), .2, 1);
  const itemWidth = itemSize.width * scale;
  const itemHeight = itemSize.height * scale;
  const itemSizePx = Math.max(itemWidth, itemHeight);
  const pairGap = basePairGap * scale;
  const pairStep = itemWidth * pairStepRatio + pairGap;

  return {
    scale,
    itemWidth,
    itemHeight,
    itemSize: itemSizePx,
    pairGap,
    pairStep,
    pairs: materializeCorrectionGrid({
      best: pairBest,
      bounds: bounds.pairs,
      scale,
      unitWidth: itemWidth + pairStep,
      unitHeight: itemHeight,
      colGap: basePairColGap * scale,
      rowGap: basePairRowGap * scale
    }),
    leftovers: materializeCorrectionGrid({
      best: leftoverBest,
      bounds: bounds.leftovers,
      scale,
      unitWidth: itemWidth,
      unitHeight: itemHeight,
      colGap: baseLeftoverColGap * scale,
      rowGap: baseLeftoverRowGap * scale
    })
  };
}

function resolveCorrectionPairStepRatio(el) {
  if (el?.classList?.contains("pma-object--tokens")) return .82;
  if (el?.classList?.contains("pma-object--cubes")) return .66;
  if (el?.classList?.contains("pma-object--emojis")) return .70;
  return .72;
}

function splitCorrectionBounds(rect, padding, hasLeftovers, leftoversOnLeft) {
  const width = Math.max(1, rect.width || 1);
  const height = Math.max(1, rect.height || 1);
  const full = {
    x: padding,
    y: padding,
    width: Math.max(1, width - padding * 2),
    height: Math.max(1, height - padding * 2)
  };

  if (!hasLeftovers) {
    return { pairs: full, leftovers: full };
  }

  const reserveWidth = full.width * .24;
  const separationWidth = full.width * .13;
  const pairWidth = Math.max(1, full.width - reserveWidth - separationWidth);
  const leftoverBounds = {
    x: leftoversOnLeft ? full.x : full.x + pairWidth + separationWidth,
    y: full.y,
    width: reserveWidth,
    height: full.height
  };
  const pairBounds = {
    x: leftoversOnLeft ? full.x + reserveWidth + separationWidth : full.x,
    y: full.y,
    width: pairWidth,
    height: full.height
  };

  return {
    pairs: pairBounds,
    leftovers: leftoverBounds
  };
}

function computeBestCorrectionGrid({ count, bounds, unitWidth, unitHeight, colGap, rowGap }) {
  if (count <= 0) return { columns: 1, rows: 1, scale: 1 };

  let best = null;
  for (let columns = 1; columns <= count; columns += 1) {
    const rows = Math.ceil(count / columns);
    const gridWidth = columns * unitWidth + (columns - 1) * colGap;
    const gridHeight = rows * unitHeight + (rows - 1) * rowGap;
    const scale = Math.min(1, bounds.width / Math.max(1, gridWidth), bounds.height / Math.max(1, gridHeight));
    const score = scale - Math.abs(columns - rows) * .001;
    if (!best || score > best.score) {
      best = { columns, rows, scale, score };
    }
  }

  return best || { columns: 1, rows: count, scale: 1 };
}

function materializeCorrectionGrid({ best, bounds, scale, unitWidth, unitHeight, colGap, rowGap }) {
  const columns = best?.columns || 1;
  const rows = best?.rows || 1;
  const gridWidth = columns * unitWidth + (columns - 1) * colGap;
  const gridHeight = rows * unitHeight + (rows - 1) * rowGap;

  return {
    columns,
    unitWidth,
    unitHeight,
    colGap,
    rowGap,
    startX: bounds.x + Math.max(0, (bounds.width - gridWidth) / 2),
    startY: bounds.y + Math.max(0, (bounds.height - gridHeight) / 2)
  };
}

function getCorrectionGridPoint(grid, index) {
  const col = index % grid.columns;
  const row = Math.floor(index / grid.columns);
  return {
    x: grid.startX + col * (grid.unitWidth + grid.colGap),
    y: grid.startY + row * (grid.unitHeight + grid.rowGap)
  };
}

function resolveItemSize(el, workspace) {
  const rect = el?.getBoundingClientRect?.();
  const localRect = workspace && rect ? clientRectToLocalRect(workspace, rect) : null;
  return {
    width: Math.max(36, localRect?.width || rect?.width || 76),
    height: Math.max(36, localRect?.height || rect?.height || 76)
  };
}

function requestReveal(state) {
  state.latestContext?.services?.requestAnswerPhase?.({
    manual: false,
    showAnswerNow: true,
    wasCorrect: isCurrentAnswerCorrect(state)
  });
}

function canSubmitAnswer(state) {
  return !!state.currentQuestion && state.showResponses && !state.answerRevealed && !!state.selectedAnswer;
}

function isCurrentAnswerCorrect(state) {
  if (!state.currentQuestion) return false;
  return evaluateAnswer(state.currentQuestion, state.selectedAnswer).isCorrect;
}

function syncValidateState(state) {
  state.latestContext?.services?.notifyValidationStateChanged?.();
}

function updateInstructionDisplay(state) {
  if (!state.instructionEl) return;
  const fallback = getDefaultQuestionInstructionText(state.currentQuestion);

  if (shouldReserveInstructionSpace(state.latestContext) || getCustomInstructionState(state.latestContext).enabled) {
    const text = resolveQuestionInstructionText(state.latestContext, fallback);
    setToolInstructionText(state.instructionEl, text);
    return;
  }

  state.instructionEl.classList.remove("is-reserved-space");
  state.instructionEl.removeAttribute("aria-hidden");
  state.instructionEl.hidden = !fallback;
  state.instructionEl.classList.toggle("is-empty", !fallback);
  state.instructionEl.innerHTML = fallback ? getDefaultQuestionInstructionHtml(state.currentQuestion) : "";
}

function getDefaultQuestionInstructionText(question) {
  if (!question) return "";
  return `Qui en a le ${getQuestionInstructionKeyword(question)} ?`;
}

function getDefaultQuestionInstructionHtml(question) {
  const keyword = getQuestionInstructionKeyword(question);
  return `<span class="pma-instruction-line">Qui en a le <span class="pma-instruction-keyword">${escapeHtml(keyword)}</span> ?</span>`;
}

function getQuestionInstructionKeyword(question) {
  return question?.promptMode === PROMPT_MODES.LESS ? "moins" : "plus";
}

function shouldShowResponses(context = {}) {
  return getResponseUi(context) !== "free";
}

function getResponseUi(context = {}) {
  const safe = String(
    context?.responseUi
    ?? context?.response_ui
    ?? context?.passationProfile?.responseUi
    ?? context?.passationProfile?.response_ui
    ?? "boxed"
  ).trim().toLowerCase();
  return safe === "free" ? "free" : "boxed";
}

function teardownState(state, container) {
  teardownBindings(state);
  clearCorrectionTimers(state);
  if (container) container.innerHTML = "";
  state.container = null;
  state.root = null;
  state.instructionEl = null;
  state.stageEl = null;
  state.workspaceEl = null;
  state.itemsLayerEl = null;
  state.responsesEl = null;
  state.currentQuestion = null;
  state.answerRevealed = false;
  state.selectedAnswer = "";
  state.submittedAnswer = "";
}

function teardownBindings(state) {
  teardownObjectBindings(state);
  teardownResponseBindings(state);
}

function teardownObjectBindings(state) {
  state.itemAbortController?.abort?.();
  state.itemAbortController = null;
}

function teardownResponseBindings(state) {
  state.responseAbortController?.abort?.();
  state.responseAbortController = null;
}

function clearCorrectionTimers(state) {
  state.correctionTimers.forEach((timer) => window.clearTimeout(timer));
  state.correctionTimers = [];
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  ensureToolInstructionStyles();

  const href = new URL("./activity.css", import.meta.url).href;
  if (document.querySelector(`link[data-pma-activity-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.pmaActivityStyle = href;
  document.head.appendChild(link);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
