import {
  DENOMINATIONS,
  EXERCISE_TYPES,
  createMoneyItem,
  evaluateCompareAnswer,
  evaluateComposeAnswer,
  evaluateReadAnswer,
  formatMoney,
  getDenominationById,
  getEnabledDenominations,
  getMinimumComposition,
  normalizeSettings,
  pickQuestion,
  questionKey,
  sumItems
} from "./model.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveQuestionInstructionText,
  setToolInstructionText
} from "../../shared/tool-instruction.js";

let stylesInjected = false;
const READ_SCATTER_ZONE_AREA_RATIO = 0.1;
const READ_SCATTER_ZONE_SIDE_RATIO = Math.sqrt(READ_SCATTER_ZONE_AREA_RATIO);
const BILL_RENDER_SCALE = 0.3;
const BILL_READ_RENDER_SCALE = 0.6;
const BILL_COMPACT_RENDER_SCALE = 0.17;
const COIN_RENDER_SIZE_PX = 100;
const COMPARE_MONEY_RENDER_SCALE = 0.78;
const COMPARE_DRAG_OVERFLOW_RATIO = 0.18;
const COMPOSE_WORKSPACE_MONEY_SCALE = 0.72;
const COMPOSE_PALETTE_MONEY_SCALE = 0.5;
const COMPOSE_DRAG_THRESHOLD_PX = 8;
const COIN_REFERENCE_DIAMETER_MM = 25.75;
const COIN_DIAMETERS_MM = Object.freeze({
  cent1: 16.25,
  cent2: 18.75,
  cent5: 21.25,
  cent10: 19.75,
  cent20: 22.25,
  cent50: 24.25,
  eur1: 23.25,
  eur2: 25.75
});
const BILL_ASSET_SIZES = Object.freeze({
  "e5.webp": { width: 480, height: 248 },
  "e10.webp": { width: 508, height: 268 },
  "e20.webp": { width: 532, height: 288 },
  "e50.webp": { width: 560, height: 308 },
  "e100.webp": { width: 588, height: 328 },
  "e200.webp": { width: 612, height: 328 },
  "e500.webp": { width: 640, height: 328 }
});

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
      syncRuntimeState(state, state.latestContext);
      if (!state.root) renderShell(state);
      loadNextQuestion(state);
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

    getAnswerState() {
      const evaluation = getCurrentEvaluation(state);
      return {
        answered: evaluation.answered,
        correct: evaluation.correct
      };
    },

    supportsShellValidation(context = state.latestContext) {
      return shouldShowResponseUi(context);
    },

    canValidate() {
      return !state.answerRevealed && canValidate(state);
    },

    validate() {
      if (!canValidate(state)) return false;
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
    promptEl: null,
    stageEl: null,
    answerEl: null,
    correctionEl: null,
    currentQuestion: null,
    lastQuestionKey: null,
    answerRevealed: false,
    selectedItems: [],
    selectedWalletId: "",
    submittedReadAnswer: "",
    answerDisplayMode: "correction",
    readInputEl: null,
    composeWasCorrect: null,
    composeStudentItemsSnapshot: [],
    composeCorrectionItemsSnapshot: [],
    composeWorkspaceEl: null,
    composeItemsLayerEl: null,
    composePanelEl: null,
    composePaletteEl: null,
    settings: normalizeSettings(initialContext?.settings),
    activityMode: normalizeActivityMode(initialContext?.activityMode),
    projectionResponseUi: normalizeProjectionResponseUi(initialContext?.projectionResponseUi),
    showResponseUi: shouldShowResponseUi(initialContext),
    drag: null
  };
}

function syncRuntimeState(state, context = state.latestContext) {
  state.settings = normalizeSettings(context?.settings);
  state.activityMode = normalizeActivityMode(context?.activityMode);
  state.projectionResponseUi = normalizeProjectionResponseUi(context?.projectionResponseUi);
  state.showResponseUi = shouldShowResponseUi(context);
}

function renderShell(state) {
  const container = state.container;
  if (!container) return;
  syncRuntimeState(state);
  container.innerHTML = `
    <div class="monnaie-root${state.showResponseUi ? " monnaie-root--boxed" : " monnaie-root--free"}">
      ${renderToolInstruction({ id: "monnaie_instruction" })}
      <div class="monnaie-card">
        <div class="monnaie-prompt" id="monnaie_prompt"></div>
        <div class="monnaie-stage" id="monnaie_stage"></div>
        <div class="monnaie-answer" id="monnaie_answer"></div>
        <div class="monnaie-correction" id="monnaie_correction" aria-hidden="true"></div>
      </div>
    </div>
  `;
  state.root = container.querySelector(".monnaie-root");
  state.instructionEl = container.querySelector("#monnaie_instruction");
  state.promptEl = container.querySelector("#monnaie_prompt");
  state.stageEl = container.querySelector("#monnaie_stage");
  state.answerEl = container.querySelector("#monnaie_answer");
  state.correctionEl = container.querySelector("#monnaie_correction");
  updateInstructionDisplay(state);
}

function loadNextQuestion(state) {
  state.answerRevealed = false;
  state.root?.classList.remove("is-correct", "is-incorrect");
  state.selectedItems = [];
  state.selectedWalletId = "";
  state.submittedReadAnswer = "";
  state.answerDisplayMode = "correction";
  state.readInputEl = null;
  state.composeWasCorrect = null;
  state.composeStudentItemsSnapshot = [];
  state.composeCorrectionItemsSnapshot = [];
  state.composeWorkspaceEl = null;
  state.composeItemsLayerEl = null;
  state.composePanelEl = null;
  state.composePaletteEl = null;
  state.currentQuestion = pickQuestion(state.settings, { avoidKey: state.lastQuestionKey });
  state.lastQuestionKey = questionKey(state.currentQuestion);
  state.correctionEl?.setAttribute("aria-hidden", "true");
  renderQuestion(state);
  syncValidateState(state);
}

function renderQuestion(state) {
  updateInstructionDisplay(state);
  if (!state.currentQuestion) {
    state.promptEl.innerHTML = "";
    state.stageEl.innerHTML = `<div class="monnaie-empty">Impossible de générer une question avec ces réglages.</div>`;
    state.answerEl.innerHTML = "";
    state.correctionEl.innerHTML = "";
    return;
  }

  const type = state.currentQuestion.exerciseType;
  state.root?.classList.remove("monnaie-root--read", "monnaie-root--compose", "monnaie-root--compare");
  state.root?.classList.add(
    type === EXERCISE_TYPES.COMPOSE_SUM
      ? "monnaie-root--compose"
      : type === EXERCISE_TYPES.COMPARE_SUMS
        ? "monnaie-root--compare"
        : "monnaie-root--read"
  );
  if (type === EXERCISE_TYPES.COMPOSE_SUM) {
    renderComposeQuestion(state);
  } else if (type === EXERCISE_TYPES.COMPARE_SUMS) {
    renderCompareQuestion(state);
  } else {
    renderReadQuestion(state);
  }
}

function renderReadQuestion(state) {
  const q = state.currentQuestion;
  state.promptEl.innerHTML = "";
  state.stageEl.innerHTML = `
    <div class="monnaie-wallet monnaie-wallet--scatter" id="monnaie_wallet_read">
      ${renderMoneyItems(q.items, { draggable: true })}
    </div>
  `;
  state.answerEl.innerHTML = state.showResponseUi
    ? `
      <div class="monnaie-read-answer-shell">
        <input id="monnaie_read_answer" class="monnaie-input" type="text" inputmode="decimal" aria-label="Réponse">
      </div>
    `
    : "";
  state.correctionEl.innerHTML = "";
  state.readInputEl = state.answerEl.querySelector("#monnaie_read_answer");
  state.readInputEl?.addEventListener("input", () => {
    normalizeReadDecimalSeparator(state.readInputEl);
    syncValidateState(state);
  });
  state.readInputEl?.addEventListener("keydown", (event) => {
    if (event.key === "." || event.code === "NumpadDecimal") {
      event.preventDefault();
      insertTextAtSelection(state.readInputEl, ",");
      syncValidateState(state);
      return;
    }
    if (event.key !== "Enter") return;
    if (!canValidate(state)) return;
    event.preventDefault();
    requestReveal(state);
  });
  layoutScatterMoneyItems(state.stageEl);
  attachMoneyDragHandlers(state.stageEl, { disabled: () => state.answerRevealed });
}

function renderComposeQuestion(state) {
  const q = state.currentQuestion;
  const denominations = getEnabledDenominations(state.settings);
  state.promptEl.innerHTML = "";

  state.stageEl.innerHTML = `
    <div class="monnaie-compose-builder">
      <div class="monnaie-compose-main">
        <div class="monnaie-compose-number" aria-label="Somme à composer">${escapeHtml(formatRuntimeMoney(state, q.targetCents))}</div>
        <div class="monnaie-compose-arrow" aria-hidden="true">→</div>
        <div class="monnaie-compose-panel" id="monnaie_compose_panel">
          <div class="monnaie-compose-workspace" id="monnaie_compose_workspace">
            <div class="monnaie-compose-cue" id="monnaie_compose_cue" aria-hidden="true"></div>
            <div class="monnaie-compose-items" id="monnaie_compose_items"></div>
          </div>
        </div>
      </div>
      <div class="monnaie-compose-library" aria-label="Pièces et billets disponibles">
        <div class="monnaie-compose-library-items" id="monnaie_compose_palette">
          ${renderComposePalette(denominations)}
        </div>
      </div>
    </div>
  `;
  state.answerEl.innerHTML = "";
  state.correctionEl.innerHTML = "";
  state.composeWorkspaceEl = state.stageEl.querySelector("#monnaie_compose_workspace");
  state.composeItemsLayerEl = state.stageEl.querySelector("#monnaie_compose_items");
  state.composePanelEl = state.stageEl.querySelector("#monnaie_compose_panel");
  state.composePaletteEl = state.stageEl.querySelector("#monnaie_compose_palette");

  state.composePaletteEl?.querySelectorAll("[data-denomination-id]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.answerRevealed) return;
      addComposeMoneyItem(state, button.dataset.denominationId);
    });
  });

  renderComposeItems(state);
}

function renderComposePalette(denominations = []) {
  return (Array.isArray(denominations) ? denominations : []).map((denomination, index) => {
    const item = normalizeMoneyItemForRender(denomination, index);
    if (!item) return "";
    const sizeStyle = getMoneyRenderSizeStyle(item, { composePalette: true });
    const style = sizeStyle ? ` style="${sizeStyle}"` : "";
    return `
      <button class="monnaie-money monnaie-money--${item.kind} monnaie-compose-palette-money" type="button" data-denomination-id="${escapeAttr(item.denominationId)}" aria-label="Ajouter ${escapeAttr(item.label)}"${style}>
        ${renderMoneyFace(item)}
      </button>
    `;
  }).join("");
}

function addComposeMoneyItem(state, denominationId) {
  if (!state.composeWorkspaceEl || !state.composeItemsLayerEl) return;
  const item = createMoneyItem(denominationId, state.selectedItems.length);
  if (!item) return;
  const renderItem = normalizeMoneyItemForRender(item, state.selectedItems.length);
  const size = getMoneyRenderSize(renderItem, { compose: true });
  const position = findComposeMoneyPlacement(state, size);
  state.selectedItems.push({
    ...item,
    x: position.x,
    y: position.y,
    status: "normal"
  });
  renderComposeItems(state);
  syncValidateState(state);
}

function renderComposeItems(state) {
  if (!state.composeItemsLayerEl) return;
  state.composeItemsLayerEl.innerHTML = state.selectedItems.map((item, index) => renderComposePlacedMoney(state, item, index)).join("");
  state.stageEl?.querySelector("#monnaie_compose_cue")?.classList.toggle("is-hidden", state.selectedItems.length > 0);
  state.composeItemsLayerEl.querySelectorAll("[data-compose-item-id]").forEach((element) => {
    bindComposeMoneyPointer(state, element, element.dataset.composeItemId);
  });
}

function renderComposePlacedMoney(state, item, index) {
  const renderItem = normalizeMoneyItemForRender(item, index);
  if (!renderItem) return "";
  const size = getMoneyRenderSize(renderItem, { compose: true });
  const workspaceWidth = getElementLayoutWidth(state.composeWorkspaceEl);
  const workspaceHeight = getElementLayoutHeight(state.composeWorkspaceEl);
  const left = clampNumber(Number(item.x) || 0, 0, Math.max(0, workspaceWidth - size.width));
  const top = clampNumber(Number(item.y) || 0, 0, Math.max(0, workspaceHeight - size.height));
  item.x = left;
  item.y = top;
  const sizeStyle = getMoneyRenderSizeStyle(renderItem, { compose: true });
  const statusClass = item.status && item.status !== "normal" ? ` monnaie-compose-piece--${item.status}` : "";
  return `
    <button class="monnaie-money monnaie-money--${renderItem.kind} monnaie-compose-piece${statusClass}" type="button" data-compose-item-id="${escapeAttr(item.itemId)}" aria-label="${escapeAttr(renderItem.label)}" style="left:${Math.round(left)}px;top:${Math.round(top)}px;--money-z:${index + 1};${sizeStyle}">
      ${renderMoneyFace(renderItem)}
    </button>
  `;
}

function bindComposeMoneyPointer(state, element, itemId) {
  if (!element) return;
  let pointerId = null;
  let startClientX = 0;
  let startClientY = 0;
  let startItemX = 0;
  let startItemY = 0;
  let dragStarted = false;

  const onPointerMove = (event) => {
    if (event.pointerId !== pointerId || !state.composeWorkspaceEl) return;
    const rawDx = event.clientX - startClientX;
    const rawDy = event.clientY - startClientY;
    if (!dragStarted && Math.hypot(rawDx, rawDy) >= COMPOSE_DRAG_THRESHOLD_PX) {
      dragStarted = true;
      element.classList.add("is-dragging");
    }
    if (!dragStarted) return;

    const item = state.selectedItems.find((candidate) => String(candidate.itemId) === String(itemId));
    if (!item) return;
    const scale = getElementClientScale(state.composeWorkspaceEl);
    const size = {
      width: getElementLayoutWidth(element),
      height: getElementLayoutHeight(element)
    };
    const maxX = Math.max(0, getElementLayoutWidth(state.composeWorkspaceEl) - size.width);
    const maxY = Math.max(0, getElementLayoutHeight(state.composeWorkspaceEl) - size.height);
    const nextX = clampNumber(startItemX + rawDx / scale.x, 0, maxX);
    const nextY = clampNumber(startItemY + rawDy / scale.y, 0, maxY);
    item.x = nextX;
    item.y = nextY;
    element.style.left = `${Math.round(nextX)}px`;
    element.style.top = `${Math.round(nextY)}px`;
  };

  const onPointerEnd = (event) => {
    if (event.pointerId !== pointerId) return;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerEnd);
    window.removeEventListener("pointercancel", onPointerEnd);
    try {
      element.releasePointerCapture?.(event.pointerId);
    } catch {}

    if (!dragStarted && !state.answerRevealed) {
      removeComposeMoneyItem(state, itemId);
    } else {
      element.classList.remove("is-dragging");
      syncActiveComposeSnapshot(state);
    }

    pointerId = null;
    dragStarted = false;
  };

  element.addEventListener("pointerdown", (event) => {
    if (event.button != null && event.button !== 0) return;
    const item = state.selectedItems.find((candidate) => String(candidate.itemId) === String(itemId));
    if (!item) return;
    event.preventDefault();
    event.stopPropagation();
    pointerId = event.pointerId;
    startClientX = event.clientX;
    startClientY = event.clientY;
    startItemX = Number(item.x) || 0;
    startItemY = Number(item.y) || 0;
    dragStarted = false;

    try {
      element.setPointerCapture?.(event.pointerId);
    } catch {}

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
  });
}

function removeComposeMoneyItem(state, itemId) {
  if (state.answerRevealed) return;
  state.selectedItems = state.selectedItems.filter((item) => String(item.itemId) !== String(itemId));
  renderComposeItems(state);
  syncValidateState(state);
}

function syncActiveComposeSnapshot(state) {
  if (!state.answerRevealed || state.currentQuestion?.exerciseType !== EXERCISE_TYPES.COMPOSE_SUM) return;
  if (state.answerDisplayMode === "student") {
    state.composeStudentItemsSnapshot = cloneComposeItems(state.selectedItems);
    return;
  }
  state.composeCorrectionItemsSnapshot = cloneComposeItems(state.selectedItems);
  if (state.composeWasCorrect === true) {
    state.composeStudentItemsSnapshot = cloneComposeItems(state.selectedItems);
  }
}

function findComposeMoneyPlacement(state, size) {
  const workspace = state.composeWorkspaceEl;
  if (!workspace) return { x: 0, y: 0 };
  const width = getElementLayoutWidth(workspace);
  const height = getElementLayoutHeight(workspace);
  const maxX = Math.max(0, width - size.width);
  const maxY = Math.max(0, height - size.height);
  const existingRects = state.selectedItems.map((item, index) => {
    const renderItem = normalizeMoneyItemForRender(item, index);
    const itemSize = getMoneyRenderSize(renderItem, { compose: true });
    return {
      x: Number(item.x) || 0,
      y: Number(item.y) || 0,
      width: itemSize.width,
      height: itemSize.height
    };
  });
  let best = {
    x: Math.max(0, (width - size.width) / 2),
    y: Math.max(0, (height - size.height) / 2),
    score: Number.POSITIVE_INFINITY
  };

  const candidates = [best];
  for (let i = 0; i < 32; i += 1) {
    candidates.push({
      x: Math.random() * maxX,
      y: Math.random() * maxY
    });
  }

  for (const candidate of candidates) {
    const x = clampNumber(candidate.x, 0, maxX);
    const y = clampNumber(candidate.y, 0, maxY);
    const score = computePlacementCollisionScore({ x, y, width: size.width, height: size.height }, existingRects);
    if (score <= 0) return { x, y };
    if (score < best.score) best = { x, y, score };
  }

  return { x: best.x, y: best.y };
}

function computePlacementCollisionScore(rect, existingRects) {
  return existingRects.reduce((score, other) => score + getExpandedIntersectionArea(rect, other, 10), 0);
}

function getExpandedIntersectionArea(a, b, gap = 0) {
  const ax1 = a.x - gap;
  const ay1 = a.y - gap;
  const ax2 = a.x + a.width + gap;
  const ay2 = a.y + a.height + gap;
  const bx1 = b.x - gap;
  const by1 = b.y - gap;
  const bx2 = b.x + b.width + gap;
  const by2 = b.y + b.height + gap;
  const overlapW = Math.min(ax2, bx2) - Math.max(ax1, bx1);
  const overlapH = Math.min(ay2, by2) - Math.max(ay1, by1);
  return overlapW > 0 && overlapH > 0 ? overlapW * overlapH : 0;
}

function renderCompareQuestion(state) {
  const q = state.currentQuestion;
  state.promptEl.innerHTML = "";
  state.stageEl.innerHTML = `
    <div class="monnaie-compare-grid monnaie-compare-grid--${q.wallets.length}">
      ${q.wallets.map((wallet) => `
        <div class="monnaie-compare-choice">
          <button class="monnaie-compare-card" type="button" data-wallet-id="${escapeAttr(wallet.id)}">
            <span class="monnaie-wallet monnaie-wallet--scatter monnaie-wallet--compare">${renderMoneyItems(wallet.items, { draggable: true, scatter: true, compare: true })}</span>
          </button>
          <span class="monnaie-card-total" aria-hidden="true"></span>
        </div>
      `).join("")}
    </div>
  `;
  state.answerEl.innerHTML = "";
  state.correctionEl.innerHTML = "";
  layoutScatterMoneyItems(state.stageEl);
  attachMoneyDragHandlers(state.stageEl, {
    disabled: () => state.answerRevealed,
    constrainToParent: true,
    overflowRatio: COMPARE_DRAG_OVERFLOW_RATIO
  });
  if (state.showResponseUi) {
    state.stageEl.querySelectorAll("[data-wallet-id]").forEach((button) => {
      button.addEventListener("click", () => {
        if (state.answerRevealed) return;
        state.selectedWalletId = button.dataset.walletId;
        state.stageEl.querySelectorAll(".monnaie-compare-card").forEach((card) => {
          card.classList.toggle("is-selected", card.dataset.walletId === state.selectedWalletId);
        });
        syncValidateState(state);
      });
    });
  } else {
    state.stageEl.querySelectorAll(".monnaie-compare-card").forEach((card) => {
      card.disabled = true;
    });
  }
}

function revealAnswer(state) {
  if (!state.currentQuestion || state.answerRevealed) return;
  state.answerRevealed = true;
  const type = state.currentQuestion.exerciseType;
  if (type === EXERCISE_TYPES.COMPOSE_SUM) revealComposeAnswer(state);
  else if (type === EXERCISE_TYPES.COMPARE_SUMS) revealCompareAnswer(state);
  else revealReadAnswer(state);
  syncValidateState(state);
}

function revealReadAnswer(state) {
  const q = state.currentQuestion;
  state.submittedReadAnswer = String(state.submittedReadAnswer || state.readInputEl?.value || "").trim();
  state.answerDisplayMode = "correction";
  const correct = evaluateReadAnswer(q, state.submittedReadAnswer);
  state.root?.classList.toggle("is-correct", correct);
  state.root?.classList.toggle("is-incorrect", state.showResponseUi && !correct);
  if (state.showResponseUi) {
    renderReadDisplayedResponse(state);
    state.correctionEl.innerHTML = "";
    state.correctionEl.setAttribute("aria-hidden", "true");
    return;
  }
  state.correctionEl.innerHTML = `<strong class="monnaie-read-free-correction">${escapeHtml(formatRuntimeMoney(state, q.totalCents))}</strong>`;
  state.correctionEl.removeAttribute("aria-hidden");
}

function requestReveal(state) {
  const requested = state.latestContext?.services?.requestAnswerPhase?.({
    manual: false,
    showAnswerNow: true,
    wasCorrect: isCurrentAnswerCorrect(state)
  });
  if (requested !== true) {
    revealAnswer(state);
    syncValidateState(state);
  }
}

function revealComposeAnswer(state) {
  const q = state.currentQuestion;
  const correct = evaluateComposeAnswer(q, state.selectedItems, state.settings);
  state.composeWasCorrect = correct;
  state.answerDisplayMode = "correction";
  state.composeStudentItemsSnapshot = cloneComposeItems(state.selectedItems);
  state.root?.classList.toggle("is-correct", correct);
  state.root?.classList.toggle("is-incorrect", state.showResponseUi && !correct);
  const useMinimumCorrection = state.settings.composeSum.requireMinimumItems === true;
  const solutionItems = useMinimumCorrection
    ? getMinimumComposition(q.targetCents, getEnabledDenominations(state.settings))
    : q.solutionItems;

  state.composePanelEl?.classList.toggle("is-correct", correct);
  state.composePanelEl?.classList.toggle("is-incorrect", !correct);
  state.composePaletteEl?.querySelectorAll("button").forEach((button) => { button.disabled = true; });

  if (!correct) {
    state.composeCorrectionItemsSnapshot = useMinimumCorrection
      ? buildComposeCorrectionItems(state, solutionItems ?? q.solutionItems)
      : buildClosestComposeCorrectionItems(state) ?? buildComposeCorrectionItems(state, solutionItems ?? q.solutionItems);
    state.selectedItems = cloneComposeItems(state.composeCorrectionItemsSnapshot);
  } else {
    state.composeCorrectionItemsSnapshot = cloneComposeItems(state.composeStudentItemsSnapshot);
  }

  renderComposeItems(state);
  state.correctionEl.innerHTML = "";
  state.correctionEl.setAttribute("aria-hidden", "true");
}

function cloneComposeItems(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => ({ ...item }));
}

function buildComposeCorrectionItems(state, items = []) {
  const out = [];
  const tempState = { ...state, selectedItems: out };
  (Array.isArray(items) ? items : []).forEach((source, index) => {
    const renderItem = normalizeMoneyItemForRender(source, index);
    if (!renderItem) return;
    const size = getMoneyRenderSize(renderItem, { compose: true });
    const position = findComposeMoneyPlacement(tempState, size);
    out.push({
      itemId: `compose-correction-${index}-${renderItem.denominationId}`,
      denominationId: renderItem.denominationId,
      label: renderItem.label,
      value: renderItem.value,
      kind: renderItem.kind,
      x: position.x,
      y: position.y,
      status: "correction"
    });
  });
  return out;
}

function buildClosestComposeCorrectionItems(state) {
  const targetCents = Number(state.currentQuestion?.targetCents);
  if (!Number.isFinite(targetCents) || targetCents < 0) return null;

  const denominations = getEnabledDenominations(state.settings)
    .filter((denomination) => Number(denomination?.value) > 0 && Number(denomination.value) <= targetCents)
    .sort((a, b) => Number(b.value) - Number(a.value));
  if (!denominations.length) return null;

  const additionPlan = buildComposeAdditionPlan(targetCents, denominations);
  if (!additionPlan || !Number.isFinite(additionPlan.costs[targetCents])) return null;

  const studentItems = cloneComposeItems(state.composeStudentItemsSnapshot.length
    ? state.composeStudentItemsSnapshot
    : state.selectedItems);
  const keepCandidates = studentItems.map((item, index) => ({
    item,
    index,
    value: Number(item?.value ?? 0)
  })).filter((entry) => entry.value > 0);

  const keepPlan = findBestComposeKeepPlan(keepCandidates, targetCents, additionPlan);
  if (!keepPlan) return null;

  const keptIndexSet = new Set(keepPlan.indices);
  const out = keepCandidates
    .filter((entry) => keptIndexSet.has(entry.index))
    .map((entry) => ({ ...entry.item, status: "normal" }));
  const tempState = { ...state, selectedItems: out };
  const additions = reconstructComposeAdditions(targetCents - keepPlan.amount, additionPlan, denominations);

  additions.forEach((denomination, index) => {
    const renderItem = normalizeMoneyItemForRender(denomination, index);
    if (!renderItem) return;
    const size = getMoneyRenderSize(renderItem, { compose: true });
    const position = findComposeMoneyPlacement(tempState, size);
    out.push({
      itemId: `compose-correction-add-${index}-${renderItem.denominationId}`,
      denominationId: renderItem.denominationId,
      label: renderItem.label,
      value: renderItem.value,
      kind: renderItem.kind,
      x: position.x,
      y: position.y,
      status: "correction"
    });
  });

  return sumItems(out) === targetCents ? out : null;
}

function buildComposeAdditionPlan(targetCents, denominations) {
  const target = Math.max(0, Math.floor(Number(targetCents) || 0));
  const costs = Array(target + 1).fill(Number.POSITIVE_INFINITY);
  const previousDenomination = Array(target + 1).fill("");
  costs[0] = 0;

  for (let amount = 1; amount <= target; amount += 1) {
    denominations.forEach((denomination) => {
      const value = Number(denomination?.value ?? 0);
      if (value <= 0 || value > amount) return;
      const candidate = costs[amount - value] + 1;
      if (candidate < costs[amount]) {
        costs[amount] = candidate;
        previousDenomination[amount] = denomination.id;
      }
    });
  }

  return { costs, previousDenomination };
}

function findBestComposeKeepPlan(studentEntries, targetCents, additionPlan) {
  const target = Math.max(0, Math.floor(Number(targetCents) || 0));
  const states = new Map([[0, []]]);

  studentEntries.forEach((entry) => {
    const value = Math.floor(Number(entry.value) || 0);
    if (value <= 0 || value > target) return;
    const snapshot = Array.from(states.entries());
    snapshot.forEach(([amount, indices]) => {
      const nextAmount = amount + value;
      if (nextAmount > target) return;
      const existing = states.get(nextAmount);
      if (existing && existing.length >= indices.length + 1) return;
      states.set(nextAmount, [...indices, entry.index]);
    });
  });

  let best = null;
  states.forEach((indices, amount) => {
    const residual = target - amount;
    const additions = additionPlan.costs[residual];
    if (!Number.isFinite(additions)) return;
    const removed = studentEntries.length - indices.length;
    const score = removed + additions;
    const candidate = { amount, indices, additions, removed, score };
    if (!best
      || candidate.score < best.score
      || (candidate.score === best.score && candidate.indices.length > best.indices.length)
      || (candidate.score === best.score && candidate.indices.length === best.indices.length && candidate.additions < best.additions)) {
      best = candidate;
    }
  });

  return best;
}

function reconstructComposeAdditions(amountCents, additionPlan, denominations) {
  const byId = new Map(denominations.map((denomination) => [String(denomination.id), denomination]));
  const out = [];
  let amount = Math.max(0, Math.floor(Number(amountCents) || 0));

  while (amount > 0) {
    const denomination = byId.get(String(additionPlan.previousDenomination[amount] || ""));
    if (!denomination) return [];
    out.push(denomination);
    amount -= Number(denomination.value);
  }

  return out;
}

function revealCompareAnswer(state) {
  const q = state.currentQuestion;
  const correct = evaluateCompareAnswer(q, state.selectedWalletId);
  state.root?.classList.toggle("is-correct", correct);
  state.root?.classList.toggle("is-incorrect", state.showResponseUi && !correct);
  state.stageEl.querySelectorAll(".monnaie-compare-card").forEach((card) => {
    card.disabled = true;
    const wallet = q.wallets.find((candidate) => candidate.id === card.dataset.walletId);
    const total = wallet ? formatRuntimeMoney(state, wallet.totalCents) : "";
    card.classList.toggle("is-correct", card.dataset.walletId === q.answerId);
    card.classList.toggle("is-incorrect", state.showResponseUi && card.dataset.walletId === state.selectedWalletId && card.dataset.walletId !== q.answerId);
    const totalEl = card.closest(".monnaie-compare-choice")?.querySelector(".monnaie-card-total");
    if (totalEl) {
      totalEl.textContent = total;
      totalEl.removeAttribute("aria-hidden");
    }
  });
  state.correctionEl.innerHTML = "";
  state.correctionEl.setAttribute("aria-hidden", "true");
}

function getCurrentEvaluation(state) {
  if (!state.currentQuestion) return { answered: false, correct: false };
  const type = state.currentQuestion.exerciseType;
  if (type === EXERCISE_TYPES.COMPOSE_SUM) {
    if (state.answerRevealed && typeof state.composeWasCorrect === "boolean") {
      return {
        answered: true,
        correct: state.composeWasCorrect
      };
    }
    return {
      answered: state.selectedItems.length > 0,
      correct: evaluateComposeAnswer(state.currentQuestion, state.selectedItems, state.settings)
    };
  }
  if (type === EXERCISE_TYPES.COMPARE_SUMS) {
    return {
      answered: Boolean(state.selectedWalletId),
      correct: evaluateCompareAnswer(state.currentQuestion, state.selectedWalletId)
    };
  }
  const readAnswer = getReadResponseValue(state);
  const answered = Boolean(readAnswer);
  return {
    answered,
    correct: answered && evaluateReadAnswer(state.currentQuestion, readAnswer)
  };
}

function isCurrentAnswerCorrect(state) {
  return getCurrentEvaluation(state).correct === true;
}

function getReadResponseValue(state) {
  if (state.answerRevealed) return String(state.submittedReadAnswer ?? "").trim();
  return String(state.readInputEl?.value ?? "").trim();
}

function formatRuntimeMoney(state, cents) {
  return formatMoney(cents, { displayFormat: state.settings?.displayFormat });
}

function renderReadDisplayedResponse(state) {
  if (!state.readInputEl || !state.currentQuestion) return;
  const showStudentAnswer = canToggleReadAnswerDisplay(state)
    && normalizeAnswerDisplayMode(state.answerDisplayMode) === "student";
  state.readInputEl.value = showStudentAnswer
    ? String(state.submittedReadAnswer ?? "")
    : formatRuntimeMoney(state, state.currentQuestion.totalCents);
  state.readInputEl.readOnly = true;
}

function normalizeReadDecimalSeparator(input) {
  if (!input) return;
  const value = String(input.value ?? "");
  if (!value.includes(".")) return;
  const selectionStart = input.selectionStart;
  const selectionEnd = input.selectionEnd;
  input.value = value.replace(/\./g, ",");
  if (selectionStart != null && selectionEnd != null) {
    input.setSelectionRange(selectionStart, selectionEnd);
  }
}

function insertTextAtSelection(input, text) {
  if (!input || input.readOnly || input.disabled) return;
  const value = String(input.value ?? "");
  const start = input.selectionStart ?? value.length;
  const end = input.selectionEnd ?? start;
  input.value = `${value.slice(0, start)}${text}${value.slice(end)}`;
  const nextCursor = start + String(text).length;
  input.setSelectionRange(nextCursor, nextCursor);
}

function canToggleReadAnswerDisplay(state) {
  if (!state.showResponseUi || !state.answerRevealed || !state.currentQuestion) return false;
  if (state.currentQuestion.exerciseType !== EXERCISE_TYPES.READ_SUM) return false;
  const submittedAnswer = String(state.submittedReadAnswer ?? "").trim();
  if (!submittedAnswer) return false;
  const correctionAnswer = formatRuntimeMoney(state, state.currentQuestion.totalCents);
  return !evaluateReadAnswer(state.currentQuestion, submittedAnswer) || submittedAnswer !== correctionAnswer;
}

function canToggleComposeAnswerDisplay(state) {
  if (!state.showResponseUi || !state.answerRevealed || !state.currentQuestion) return false;
  if (state.currentQuestion.exerciseType !== EXERCISE_TYPES.COMPOSE_SUM) return false;
  if (state.composeWasCorrect !== false) return false;
  return state.composeStudentItemsSnapshot.length > 0 && state.composeCorrectionItemsSnapshot.length > 0;
}

function getShellAnswerDisplayState(state) {
  const canToggle = canToggleReadAnswerDisplay(state) || canToggleComposeAnswerDisplay(state);
  return {
    canToggle,
    mode: canToggle
      ? normalizeAnswerDisplayMode(state.answerDisplayMode)
      : "correction"
  };
}

function applyShellAnswerDisplayMode(state, mode) {
  if (!state.showResponseUi || !state.answerRevealed) return false;
  if (state.currentQuestion?.exerciseType === EXERCISE_TYPES.COMPOSE_SUM) {
    if (!canToggleComposeAnswerDisplay(state)) {
      state.answerDisplayMode = "correction";
      return false;
    }
    state.answerDisplayMode = normalizeAnswerDisplayMode(mode);
    state.selectedItems = cloneComposeItems(
      state.answerDisplayMode === "student"
        ? state.composeStudentItemsSnapshot
        : state.composeCorrectionItemsSnapshot
    );
    renderComposeItems(state);
    return true;
  }

  if (!state.readInputEl) return false;
  if (!canToggleReadAnswerDisplay(state)) {
    state.answerDisplayMode = "correction";
    renderReadDisplayedResponse(state);
    return false;
  }
  state.answerDisplayMode = normalizeAnswerDisplayMode(mode);
  renderReadDisplayedResponse(state);
  return true;
}

function normalizeAnswerDisplayMode(value) {
  return String(value ?? "").trim().toLowerCase() === "student" ? "student" : "correction";
}

function canValidate(state) {
  if (!state.showResponseUi || state.answerRevealed || !state.currentQuestion) return false;
  return getCurrentEvaluation(state).answered;
}

function syncValidateState(state) {
  state.latestContext?.services?.notifyValidationStateChanged?.();
  state.latestContext?.requestShellValidationStateSync?.();
  state.latestContext?.onValidationStateChange?.(canValidate(state));
}

function updateInstructionDisplay(state) {
  if (!state.instructionEl) return;
  ensureToolInstructionStyles();
  const questionInstruction = state.currentQuestion?.exerciseType === EXERCISE_TYPES.COMPARE_SUMS
    ? getComparePromptText(state.currentQuestion)
    : "";
  const text = resolveQuestionInstructionText({
    tool: state.latestContext?.tool,
    settings: state.latestContext?.settings,
    runtimeConfig: state.settings,
    defaultInstruction: state.latestContext?.defaultInstruction || "Manipule les pièces et les billets pour répondre."
  }, questionInstruction);
  setToolInstructionText(state.instructionEl, text);
}

function getComparePromptText(question) {
  return question?.promptMode === "less" ? "Qui a le moins d’argent ?" : "Qui a le plus d’argent ?";
}

function renderMoneyItems(items = [], { draggable = false, removable = false, compact = false, scatter = false, compare = false } = {}) {
  const safeItems = (Array.isArray(items) ? items : [])
    .map((item, index) => normalizeMoneyItemForRender(item, index))
    .filter(Boolean);
  return safeItems.map((item, index) => {
    const shouldScatter = draggable || scatter;
    const styleParts = [];
    if (shouldScatter) {
      styleParts.push(`--rot:${((index * 17) % 13) - 6}deg`);
      styleParts.push(`--money-z:${index + 1}`);
    }
    const sizeStyle = getMoneyRenderSizeStyle(item, { draggable, compact, scatter, compare });
    if (sizeStyle) styleParts.push(sizeStyle);
    const style = styleParts.length ? ` style="${styleParts.join(";")}"` : "";
    const selectedAttr = removable ? ` data-selected-item-id="${escapeAttr(item.itemId)}"` : "";
    const tag = removable ? "button" : "span";
    const typeAttr = removable ? ` type="button"` : "";
    const indexAttr = shouldScatter ? ` data-money-index="${index}"` : "";
    const scatterAttr = scatter ? ` data-money-scatter="true"` : "";
    return `<${tag}${typeAttr}${selectedAttr} class="monnaie-money monnaie-money--${item.kind}${compact ? " monnaie-money--compact" : ""}${draggable ? " monnaie-money--draggable" : ""}${scatter ? " monnaie-money--scatter-item" : ""}" data-money-drag="${draggable ? "true" : "false"}"${scatterAttr}${indexAttr}${style}>${renderMoneyFace(item)}</${tag}>`;
  }).join("");
}

function renderMoneyFace(item) {
  const asset = String(item?.asset || "").trim();
  if (!asset) return escapeHtml(item?.label ?? "");
  const src = new URL(`./assets/${asset}`, import.meta.url).href;
  return `<img src="${escapeAttr(src)}" alt="${escapeAttr(item.label)}" draggable="false">`;
}

function getMoneyRenderSizeStyle(item, options = {}) {
  const size = getMoneyRenderSize(item, options);
  if (!size) return "";
  if (item?.kind !== "bill") {
    return `--money-coin-size:${Math.round(size.width)}px`;
  }
  return `--money-width:${Math.round(size.width)}px;--money-height:${Math.round(size.height)}px`;
}

function getMoneyRenderSize(item, { draggable = false, compact = false, scatter = false, compare = false, compose = false, composePalette = false } = {}) {
  const safeKind = item?.kind === "bill" ? "bill" : "coin";
  if (safeKind !== "bill") {
    const scale = compare
      ? COMPARE_MONEY_RENDER_SCALE
      : compose
        ? COMPOSE_WORKSPACE_MONEY_SCALE
        : composePalette
          ? COMPOSE_PALETTE_MONEY_SCALE
          : 1;
    const size = (compact ? 62 : COIN_RENDER_SIZE_PX * scale) * getCoinDiameterRatio(item);
    return { width: Math.round(size), height: Math.round(size) };
  }
  const dimensions = BILL_ASSET_SIZES[item?.asset];
  if (!dimensions) {
    return compact
      ? { width: 88, height: 48 }
      : { width: 132, height: 70 };
  }
  const baseScale = compact
    ? BILL_COMPACT_RENDER_SCALE
    : composePalette
      ? BILL_READ_RENDER_SCALE * COMPOSE_PALETTE_MONEY_SCALE
      : compose
        ? BILL_READ_RENDER_SCALE * COMPOSE_WORKSPACE_MONEY_SCALE
        : (draggable || scatter)
          ? BILL_READ_RENDER_SCALE
          : BILL_RENDER_SCALE;
  const scale = compare ? baseScale * COMPARE_MONEY_RENDER_SCALE : baseScale;
  const width = Math.round(dimensions.width * scale);
  const height = Math.round(dimensions.height * scale);
  return { width, height };
}

function getCoinDiameterRatio(item) {
  const id = String(item?.denominationId || item?.id || "").trim();
  const diameter = COIN_DIAMETERS_MM[id];
  if (!Number.isFinite(diameter)) return 1;
  return diameter / COIN_REFERENCE_DIAMETER_MM;
}

function normalizeMoneyItemForRender(item, index = 0) {
  const denom = item?.denominationId ? getDenominationById(item.denominationId) : getDenominationById(item?.id);
  const source = denom || item;
  if (!source) return null;
  return {
    itemId: String(item?.itemId ?? `render-${index}-${source.id ?? source.label}`),
    denominationId: source.id ?? item?.denominationId ?? "",
    label: source.label ?? formatMoney(source.value),
    value: Number(source.value ?? 0),
    kind: source.kind === "bill" ? "bill" : "coin",
    asset: source.asset ?? denom?.asset ?? ""
  };
}

function attachMoneyDragHandlers(root, { disabled = () => false, constrainToParent = false, overflowRatio = 0 } = {}) {
  if (!root) return;
  const items = Array.from(root.querySelectorAll("[data-money-drag='true']"));
  items.forEach((item) => {
    item.addEventListener("pointerdown", (event) => {
      if (disabled()) return;
      event.preventDefault();
      event.stopPropagation();
      item.setPointerCapture?.(event.pointerId);
      item.classList.add("is-dragging");
      item.dataset.moneyUserMoved = "true";
      ensureMoneyItemAbsolutePosition(item);
      const rect = item.getBoundingClientRect();
      const parent = item.parentElement;
      const parentRect = parent.getBoundingClientRect();
      const parentScale = getElementClientScale(parent);
      const parsedLeft = Number.parseFloat(item.style.left);
      const parsedTop = Number.parseFloat(item.style.top);
      const startLeft = Number.isFinite(parsedLeft) ? parsedLeft : (rect.left - parentRect.left) / parentScale.x;
      const startTop = Number.isFinite(parsedTop) ? parsedTop : (rect.top - parentRect.top) / parentScale.y;
      const startX = event.clientX;
      const startY = event.clientY;
      const dragBounds = constrainToParent ? getMoneyDragBounds(item, overflowRatio) : null;
      const move = (moveEvent) => {
        const left = startLeft + (moveEvent.clientX - startX) / parentScale.x;
        const top = startTop + (moveEvent.clientY - startY) / parentScale.y;
        const position = dragBounds ? clampMoneyPosition(left, top, dragBounds) : { left, top };
        item.style.left = `${position.left}px`;
        item.style.top = `${position.top}px`;
        item.style.position = "absolute";
      };
      const up = (upEvent) => {
        item.releasePointerCapture?.(upEvent.pointerId);
        item.classList.remove("is-dragging");
        item.removeEventListener("pointermove", move);
        item.removeEventListener("pointerup", up);
        item.removeEventListener("pointercancel", up);
      };
      item.addEventListener("pointermove", move);
      item.addEventListener("pointerup", up);
      item.addEventListener("pointercancel", up);
    });
    item.addEventListener("click", (event) => {
      if (disabled()) return;
      event.preventDefault();
      event.stopPropagation();
    });
  });
}

function getMoneyDragBounds(item, overflowRatio = 0) {
  const parent = item.parentElement;
  if (!parent) return null;
  const ratio = Math.max(0, Math.min(0.45, Number(overflowRatio) || 0));
  const itemWidth = getElementLayoutWidth(item) || Number.parseFloat(item.style.getPropertyValue("--money-width")) || 0;
  const itemHeight = getElementLayoutHeight(item) || Number.parseFloat(item.style.getPropertyValue("--money-height")) || 0;
  const minLeft = -itemWidth * ratio;
  const minTop = -itemHeight * ratio;
  const maxLeft = getElementLayoutWidth(parent) - itemWidth * (1 - ratio);
  const maxTop = getElementLayoutHeight(parent) - itemHeight * (1 - ratio);
  return {
    minLeft: Math.min(minLeft, maxLeft),
    maxLeft: Math.max(minLeft, maxLeft),
    minTop: Math.min(minTop, maxTop),
    maxTop: Math.max(minTop, maxTop)
  };
}

function clampMoneyPosition(left, top, bounds) {
  if (!bounds) return { left, top };
  return {
    left: Math.min(bounds.maxLeft, Math.max(bounds.minLeft, left)),
    top: Math.min(bounds.maxTop, Math.max(bounds.minTop, top))
  };
}

function layoutScatterMoneyItems(root) {
  const wallets = Array.from(root?.querySelectorAll(".monnaie-wallet--scatter") ?? []);
  wallets.forEach((wallet) => layoutScatterWalletItems(wallet));
}

function layoutScatterWalletItems(wallet) {
  if (!wallet) return;
  const placeItems = (force = false) => {
    const items = Array.from(wallet.querySelectorAll("[data-money-drag='true'], [data-money-scatter='true']"));
    if (!items.length) return;
    const width = Math.max(1, getElementLayoutWidth(wallet));
    const height = Math.max(1, getElementLayoutHeight(wallet));
    if (width <= 1 || height <= 1) {
      requestAnimationFrame(placeItems);
      return;
    }
    const zoneWidth = width * READ_SCATTER_ZONE_SIDE_RATIO;
    const zoneHeight = height * READ_SCATTER_ZONE_SIDE_RATIO;
    const zoneLeft = (width - zoneWidth) / 2;
    const zoneTop = (height - zoneHeight) / 2;

    items.forEach((item, index) => {
      if (item.dataset.moneyUserMoved === "true") return;
      if (!force && item.dataset.moneyPositioned === "true") return;
      const itemWidth = getElementLayoutWidth(item) || Number.parseFloat(item.style.getPropertyValue("--money-width")) || (item.classList.contains("monnaie-money--bill") ? 176 : 86);
      const itemHeight = getElementLayoutHeight(item) || Number.parseFloat(item.style.getPropertyValue("--money-height")) || (item.classList.contains("monnaie-money--bill") ? 92 : 86);
      const xRatio = getOrCreatePlacementRatio(item, "x");
      const yRatio = getOrCreatePlacementRatio(item, "y");
      const left = zoneLeft + xRatio * zoneWidth - itemWidth / 2;
      const top = zoneTop + yRatio * zoneHeight - itemHeight / 2;
      item.style.left = `${Math.round(left)}px`;
      item.style.top = `${Math.round(top)}px`;
      item.style.position = "absolute";
      item.dataset.moneyPositioned = "true";
    });
  };
  const images = Array.from(wallet.querySelectorAll("img"));
  images.forEach((image) => {
    if (image.complete) return;
    image.addEventListener("load", () => placeItems(true), { once: true });
  });
  placeItems(true);
}

function getOrCreatePlacementRatio(item, axis) {
  const key = axis === "y" ? "moneyPlacementY" : "moneyPlacementX";
  const existing = Number.parseFloat(item.dataset[key]);
  if (Number.isFinite(existing)) return existing;
  const next = Math.random();
  item.dataset[key] = String(next);
  return next;
}

function ensureMoneyItemAbsolutePosition(item) {
  if (!item || item.dataset.moneyPositioned === "true") return;
  const parent = item.parentElement;
  const parentRect = parent?.getBoundingClientRect();
  const rect = item.getBoundingClientRect();
  if (!parentRect) return;
  const parentScale = getElementClientScale(parent);
  item.style.left = `${(rect.left - parentRect.left) / parentScale.x}px`;
  item.style.top = `${(rect.top - parentRect.top) / parentScale.y}px`;
  item.style.position = "absolute";
  item.dataset.moneyPositioned = "true";
}

function getElementLayoutWidth(element) {
  if (!element) return 0;
  return element.offsetWidth || element.getBoundingClientRect?.().width || 0;
}

function getElementLayoutHeight(element) {
  if (!element) return 0;
  return element.offsetHeight || element.getBoundingClientRect?.().height || 0;
}

function getElementClientScale(element) {
  const rect = element?.getBoundingClientRect?.();
  const width = getElementLayoutWidth(element);
  const height = getElementLayoutHeight(element);
  const x = rect && width > 0 ? rect.width / width : 1;
  const y = rect && height > 0 ? rect.height / height : 1;
  return {
    x: Number.isFinite(x) && x > 0 ? x : 1,
    y: Number.isFinite(y) && y > 0 ? y : 1
  };
}

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function shouldShowResponseUi(context = {}) {
  const activityMode = normalizeActivityMode(context?.activityMode);
  const projectionResponseUi = normalizeProjectionResponseUi(context?.projectionResponseUi);
  if (activityMode === "individual") return true;
  if (String(context?.runMode || context?.sessionMode || "").trim() === "projected-teacher") return projectionResponseUi === "boxed";
  return false;
}

function normalizeActivityMode(value) {
  const raw = String(value || "").trim();
  return ["individual", "group"].includes(raw) ? raw : "individual";
}

function normalizeProjectionResponseUi(value) {
  const raw = String(value || "").trim();
  return raw === "boxed" || raw === "free" ? raw : "free";
}

function teardownState(state, container) {
  const target = container || state.container;
  if (target) target.innerHTML = "";
  state.container = null;
  state.root = null;
  state.instructionEl = null;
  state.promptEl = null;
  state.stageEl = null;
  state.answerEl = null;
  state.correctionEl = null;
  state.composeWasCorrect = null;
  state.composeStudentItemsSnapshot = [];
  state.composeCorrectionItemsSnapshot = [];
  state.composeWorkspaceEl = null;
  state.composeItemsLayerEl = null;
  state.composePanelEl = null;
  state.composePaletteEl = null;
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const href = new URL("./activity.css", import.meta.url).href;
  if (document.querySelector(`link[data-monnaie-activity-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.monnaieActivityStyle = href;
  document.head.appendChild(link);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
