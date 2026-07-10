import {
  DENOMINATIONS,
  EXERCISE_TYPES,
  MONEY_ASSET_STYLES,
  MONEY_DISPLAY_FORMATS,
  createMoneyItem,
  evaluateComposeAnswer,
  evaluateReadAnswer,
  formatMoney,
  getAnswerCents,
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

    getAnswerState() {
      const evaluation = getCurrentEvaluation(state);
      return {
        answered: evaluation.answered,
        correct: evaluation.correct
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
      return shouldShowResponseUi(context);
    },

    canValidate() {
      return !state.answerRevealed && canValidate(state);
    },

    validate() {
      if (!canValidate(state)) return false;
      submitAttempt(state);
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
    feedbackEl: null,
    currentQuestion: null,
    lastQuestionKey: null,
    answerRevealed: false,
    attemptCount: 0,
    selectedItems: [],
    submittedReadResponse: null,
    answerDisplayMode: "correction",
    readInputs: {},
    composeWasCorrect: null,
    composeStudentItemsSnapshot: [],
    composeCorrectionItemsSnapshot: [],
    composeWorkspaceEl: null,
    composeItemsLayerEl: null,
    composePanelEl: null,
    composePaletteEl: null,
    settings: normalizeSettings(initialContext?.settings),
    showResponseUi: shouldShowResponseUi(initialContext)
  };
}

function syncRuntimeState(state, context = state.latestContext) {
  state.settings = normalizeSettings(context?.settings);
  state.showResponseUi = shouldShowResponseUi(context);
}

function renderShell(state) {
  const container = state.container;
  if (!container) return;
  syncRuntimeState(state);
  container.innerHTML = `
    <div class="monrep-root${state.showResponseUi ? " monrep-root--boxed" : " monrep-root--free"}">
      ${renderToolInstruction({ id: "monrep_instruction" })}
      <div class="monrep-card">
        <div class="monrep-prompt" id="monrep_prompt"></div>
        <div class="monrep-stage" id="monrep_stage"></div>
        <div class="monrep-answer" id="monrep_answer"></div>
        <div class="monrep-feedback" id="monrep_feedback" aria-live="polite" aria-hidden="true"></div>
      </div>
    </div>
  `;
  state.root = container.querySelector(".monrep-root");
  state.instructionEl = container.querySelector("#monrep_instruction");
  state.promptEl = container.querySelector("#monrep_prompt");
  state.stageEl = container.querySelector("#monrep_stage");
  state.answerEl = container.querySelector("#monrep_answer");
  state.feedbackEl = container.querySelector("#monrep_feedback");
  updateInstructionDisplay(state);
}

function loadNextQuestion(state) {
  state.answerRevealed = false;
  state.attemptCount = 0;
  state.selectedItems = [];
  state.submittedReadResponse = null;
  state.answerDisplayMode = "correction";
  state.readInputs = {};
  state.composeWasCorrect = null;
  state.composeStudentItemsSnapshot = [];
  state.composeCorrectionItemsSnapshot = [];
  state.composeWorkspaceEl = null;
  state.composeItemsLayerEl = null;
  state.composePanelEl = null;
  state.composePaletteEl = null;
  state.currentQuestion = pickQuestion(state.settings, { avoidKey: state.lastQuestionKey });
  state.lastQuestionKey = questionKey(state.currentQuestion);
  state.root?.classList.remove("is-correct", "is-incorrect");
  hideFeedback(state);
  renderQuestion(state);
  syncValidateState(state);
}

function renderQuestion(state) {
  updateInstructionDisplay(state);
  if (!state.currentQuestion) {
    state.promptEl.innerHTML = "";
    state.stageEl.innerHTML = `<div class="monrep-empty">Impossible de générer une question avec ces réglages.</div>`;
    state.answerEl.innerHTML = "";
    return;
  }

  const type = state.currentQuestion.exerciseType;
  state.root?.classList.remove("monrep-root--read", "monrep-root--compose", "monrep-root--simple-assets", "monrep-root--realistic-assets");
  state.root?.classList.add(
    type === EXERCISE_TYPES.COMPOSE_SUM ? "monrep-root--compose" : "monrep-root--read",
    state.settings.assetStyle === MONEY_ASSET_STYLES.SIMPLE ? "monrep-root--simple-assets" : "monrep-root--realistic-assets"
  );
  if (type === EXERCISE_TYPES.COMPOSE_SUM) renderComposeQuestion(state);
  else renderReadQuestion(state);
}

function renderReadQuestion(state) {
  const q = state.currentQuestion;
  state.promptEl.innerHTML = "";
  state.stageEl.innerHTML = `
    <div class="monrep-wallet monrep-wallet--scatter" id="monrep_wallet_read">
      ${renderMoneyItems(state, q.items, { draggable: true })}
    </div>
  `;
  state.answerEl.innerHTML = state.showResponseUi ? renderReadAnswerForm(q) : "";
  state.readInputs = collectReadInputs(state.answerEl);
  Object.values(state.readInputs).forEach((input) => {
    input?.addEventListener("input", () => {
      if (input.dataset.moneyDecimal === "true") normalizeDecimalSeparator(input);
      clearAttemptFeedback(state);
      syncValidateState(state);
    });
    input?.addEventListener("keydown", (event) => {
      if (event.key === "." || event.code === "NumpadDecimal") {
        if (input.dataset.moneyDecimal === "true") {
          event.preventDefault();
          insertTextAtSelection(input, ",");
          syncValidateState(state);
        }
        return;
      }
      if (event.key !== "Enter" || !canValidate(state)) return;
      event.preventDefault();
      submitAttempt(state);
    });
  });
  layoutScatterMoneyItems(state.stageEl);
  bindReadMoneyDrag(state);
}

function renderReadAnswerForm(question) {
  const displayFormat = question?.displayFormat;
  const showCentsInput = shouldShowReadCentsInput(question);
  const adaptiveClass = showCentsInput ? "" : " monrep-read-answer-shell--euros-only";
  if (displayFormat === MONEY_DISPLAY_FORMATS.EUROS_CENTS) {
    return `
      <div class="monrep-read-answer-shell monrep-read-answer-shell--euros-cents${adaptiveClass}">
        <input class="monrep-input monrep-input--small" type="text" inputmode="numeric" data-read-field="euros" aria-label="Euros">
        <span>€</span>
        ${showCentsInput ? `
          <input class="monrep-input monrep-input--small" type="text" inputmode="numeric" data-read-field="cents" aria-label="Centimes">
          <span>c</span>
        ` : ""}
      </div>
    `;
  }
  if (displayFormat === MONEY_DISPLAY_FORMATS.CENTS_ONLY) {
    return `
      <div class="monrep-read-answer-shell monrep-read-answer-shell--cents-only">
        <input class="monrep-input" type="text" inputmode="numeric" data-read-field="centsTotal" aria-label="Centimes">
        <span>c</span>
      </div>
    `;
  }
  if (displayFormat === MONEY_DISPLAY_FORMATS.WORDS) {
    return `
      <div class="monrep-read-answer-shell monrep-read-answer-shell--words${adaptiveClass}">
        <input class="monrep-input monrep-input--small" type="text" inputmode="numeric" data-read-field="euros" aria-label="Euros">
        <span>${showCentsInput ? "euros et" : "euros"}</span>
        ${showCentsInput ? `
          <input class="monrep-input monrep-input--small" type="text" inputmode="numeric" data-read-field="cents" aria-label="Centimes">
          <span>centimes</span>
        ` : ""}
      </div>
    `;
  }
  return `
    <div class="monrep-read-answer-shell monrep-read-answer-shell--decimal">
      <input class="monrep-input" type="text" inputmode="decimal" data-read-field="decimal" data-money-decimal="true" aria-label="Réponse">
      <span>€</span>
    </div>
  `;
}

function shouldShowReadCentsInput(question) {
  const displayFormat = question?.displayFormat;
  if (displayFormat !== MONEY_DISPLAY_FORMATS.EUROS_CENTS && displayFormat !== MONEY_DISPLAY_FORMATS.WORDS) return false;
  const total = Number(question?.totalCents);
  if (!Number.isFinite(total)) return true;
  return Math.abs(Math.trunc(total)) % 100 !== 0;
}

function collectReadInputs(root) {
  return Object.fromEntries(
    Array.from(root?.querySelectorAll("[data-read-field]") ?? [])
      .map((input) => [input.dataset.readField, input])
  );
}

function renderComposeQuestion(state) {
  const q = state.currentQuestion;
  const denominations = getEnabledDenominations(state.settings);
  state.promptEl.innerHTML = "";
  state.stageEl.innerHTML = `
    <div class="monrep-compose-builder">
      <div class="monrep-compose-main">
        <div class="monrep-compose-number" aria-label="Somme à composer">${escapeHtml(formatRuntimeMoney(q.targetCents, q.displayFormat))}</div>
        <div class="monrep-compose-arrow" aria-hidden="true">→</div>
        <div class="monrep-compose-panel" id="monrep_compose_panel">
          <div class="monrep-compose-workspace" id="monrep_compose_workspace">
            <div class="monrep-compose-cue" id="monrep_compose_cue" aria-hidden="true"></div>
            <div class="monrep-compose-items" id="monrep_compose_items"></div>
          </div>
        </div>
      </div>
      <div class="monrep-compose-library" aria-label="Pièces et billets disponibles">
        <div class="monrep-compose-library-items" id="monrep_compose_palette">
          ${renderComposePalette(state, denominations)}
        </div>
      </div>
    </div>
  `;
  state.answerEl.innerHTML = "";
  state.composeWorkspaceEl = state.stageEl.querySelector("#monrep_compose_workspace");
  state.composeItemsLayerEl = state.stageEl.querySelector("#monrep_compose_items");
  state.composePanelEl = state.stageEl.querySelector("#monrep_compose_panel");
  state.composePaletteEl = state.stageEl.querySelector("#monrep_compose_palette");

  state.composePaletteEl?.querySelectorAll("[data-denomination-id]").forEach((button) => {
    button.disabled = !state.showResponseUi;
    button.addEventListener("click", () => {
      if (!state.showResponseUi || state.answerRevealed) return;
      addComposeMoneyItem(state, button.dataset.denominationId);
      clearAttemptFeedback(state);
    });
  });

  renderComposeItems(state);
}

function renderComposePalette(state, denominations = []) {
  return (Array.isArray(denominations) ? denominations : []).map((denomination, index) => {
    const item = normalizeMoneyItemForRender(denomination, index);
    if (!item) return "";
    const sizeStyle = getMoneyRenderSizeStyle(item, { composePalette: true });
    const style = sizeStyle ? ` style="${sizeStyle}"` : "";
    return `
      <button class="monrep-money monrep-money--${item.kind} monrep-compose-palette-money" type="button" data-denomination-id="${escapeAttr(item.denominationId)}" aria-label="Ajouter ${escapeAttr(item.label)}"${style}>
        ${renderMoneyFace(state, item)}
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
  state.stageEl?.querySelector("#monrep_compose_cue")?.classList.toggle("is-hidden", state.selectedItems.length > 0);
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
  const statusClass = item.status && item.status !== "normal" ? ` monrep-compose-piece--${item.status}` : "";
  return `
    <button class="monrep-money monrep-money--${renderItem.kind} monrep-compose-piece${statusClass}" type="button" data-compose-item-id="${escapeAttr(item.itemId)}" aria-label="${escapeAttr(renderItem.label)}" style="left:${Math.round(left)}px;top:${Math.round(top)}px;--money-z:${index + 1};${sizeStyle}">
      ${renderMoneyFace(state, renderItem)}
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

function bindReadMoneyDrag(state) {
  const wallet = state.stageEl?.querySelector(".monrep-wallet--scatter");
  if (!wallet) return;
  wallet.querySelectorAll(".monrep-money--draggable").forEach((element) => {
    bindReadMoneyPointer(wallet, element);
  });
}

function bindReadMoneyPointer(wallet, element) {
  if (!wallet || !element) return;
  let pointerId = null;
  let startClientX = 0;
  let startClientY = 0;
  let startLeft = 0;
  let startTop = 0;

  const onPointerMove = (event) => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();

    const scale = getElementClientScale(wallet);
    const maxX = Math.max(0, getElementLayoutWidth(wallet) - getElementLayoutWidth(element));
    const maxY = Math.max(0, getElementLayoutHeight(wallet) - getElementLayoutHeight(element));
    const nextX = clampNumber(startLeft + (event.clientX - startClientX) / scale.x, 0, maxX);
    const nextY = clampNumber(startTop + (event.clientY - startClientY) / scale.y, 0, maxY);

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
    element.classList.remove("is-dragging");
    pointerId = null;
  };

  element.addEventListener("pointerdown", (event) => {
    if (pointerId != null) return;
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    pointerId = event.pointerId;
    startClientX = event.clientX;
    startClientY = event.clientY;
    startLeft = getElementPixelValue(element, "left", element.offsetLeft || 0);
    startTop = getElementPixelValue(element, "top", element.offsetTop || 0);
    element.classList.add("is-dragging");

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

function submitAttempt(state) {
  const evaluation = getCurrentEvaluation(state);
  if (evaluation.correct) {
    requestReveal(state);
    return;
  }

  if (state.currentQuestion?.exerciseType === EXERCISE_TYPES.READ_SUM) {
    requestReveal(state);
    return;
  }

  state.attemptCount += 1;
  if (state.attemptCount < state.settings.maxAttempts) {
    showAttemptFeedback(state, evaluation.answerCents);
    syncValidateState(state);
    return;
  }

  requestReveal(state);
}

function showAttemptFeedback(state, answerCents = NaN) {
  const remaining = Math.max(0, state.settings.maxAttempts - state.attemptCount);
  const hint = buildDeltaHint(state, answerCents);
  const suffix = remaining > 1 ? ` Il reste ${remaining} essais.` : " Il reste 1 essai.";
  state.root?.classList.remove("is-correct", "is-incorrect");
  state.root?.classList.add("is-warned");
  state.feedbackEl.innerHTML = `${escapeHtml(hint)}${escapeHtml(suffix)}`;
  state.feedbackEl.classList.remove("monrep-feedback--final");
  state.feedbackEl.removeAttribute("aria-hidden");
}

function buildDeltaHint(state, answerCents = NaN) {
  const q = state.currentQuestion;
  const target = q?.exerciseType === EXERCISE_TYPES.COMPOSE_SUM ? Number(q.targetCents) : Number(q.totalCents);
  if (!Number.isFinite(target) || !Number.isFinite(answerCents)) return "Essaie encore.";
  const delta = target - answerCents;
  if (delta === 0) return "C’est juste.";
  const missing = delta > 0;
  if (state.settings.explicitDeltaFeedback) {
    return missing
      ? `Il manque ${formatMoney(Math.abs(delta), { displayFormat: MONEY_DISPLAY_FORMATS.EUROS_CENTS })}.`
      : `Il y a ${formatMoney(Math.abs(delta), { displayFormat: MONEY_DISPLAY_FORMATS.EUROS_CENTS })} en trop.`;
  }
  return missing ? "Il manque de l’argent." : "Il y a de l’argent en trop.";
}

function clearAttemptFeedback(state) {
  state.root?.classList.remove("is-warned");
  if (!state.answerRevealed) hideFeedback(state);
}

function hideFeedback(state) {
  if (!state.feedbackEl) return;
  state.feedbackEl.innerHTML = "";
  state.feedbackEl.setAttribute("aria-hidden", "true");
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

function revealAnswer(state) {
  if (!state.currentQuestion || state.answerRevealed) return;
  state.answerRevealed = true;
  if (state.currentQuestion.exerciseType === EXERCISE_TYPES.COMPOSE_SUM) revealComposeAnswer(state);
  else revealReadAnswer(state);
  syncValidateState(state);
}

function revealReadAnswer(state) {
  const q = state.currentQuestion;
  state.submittedReadResponse = getReadResponse(state);
  state.answerDisplayMode = "correction";
  const correct = evaluateReadAnswer(q, state.submittedReadResponse);
  state.root?.classList.remove("is-warned");
  state.root?.classList.toggle("is-correct", correct);
  state.root?.classList.toggle("is-incorrect", state.showResponseUi && !correct);
  renderReadDisplayedResponse(state);
  if (!state.showResponseUi) {
    state.feedbackEl.innerHTML = `<strong>${escapeHtml(formatRuntimeMoney(q.totalCents, q.displayFormat))}</strong>`;
    state.feedbackEl.classList.add("monrep-feedback--final");
    state.feedbackEl.removeAttribute("aria-hidden");
    return;
  }
  if (!correct) {
    state.feedbackEl.innerHTML = escapeHtml(buildDeltaHint(state, getAnswerCents(q, state.submittedReadResponse)));
    state.feedbackEl.classList.add("monrep-feedback--final");
    state.feedbackEl.removeAttribute("aria-hidden");
  } else {
    hideFeedback(state);
  }
}

function revealComposeAnswer(state) {
  const q = state.currentQuestion;
  const correct = evaluateComposeAnswer(q, state.selectedItems, state.settings);
  state.composeWasCorrect = correct;
  state.answerDisplayMode = "correction";
  state.composeStudentItemsSnapshot = cloneComposeItems(state.selectedItems);
  state.root?.classList.remove("is-warned");
  state.root?.classList.toggle("is-correct", correct);
  state.root?.classList.toggle("is-incorrect", state.showResponseUi && !correct);
  state.composePanelEl?.classList.toggle("is-correct", correct);
  state.composePanelEl?.classList.toggle("is-incorrect", !correct);
  state.composePaletteEl?.querySelectorAll("button").forEach((button) => { button.disabled = true; });

  const solutionItems = state.settings.requireMinimumItems
    ? getMinimumComposition(q.targetCents, getEnabledDenominations(state.settings))
    : q.solutionItems;
  state.composeCorrectionItemsSnapshot = correct
    ? cloneComposeItems(state.composeStudentItemsSnapshot)
    : buildComposeCorrectionItems(state, solutionItems ?? q.solutionItems);
  if (!correct) state.selectedItems = cloneComposeItems(state.composeCorrectionItemsSnapshot);

  renderComposeItems(state);
  if (!correct) {
    state.feedbackEl.innerHTML = escapeHtml(buildDeltaHint(state, sumItems(state.composeStudentItemsSnapshot)));
    state.feedbackEl.classList.add("monrep-feedback--final");
    state.feedbackEl.removeAttribute("aria-hidden");
  } else {
    hideFeedback(state);
  }
}

function renderReadDisplayedResponse(state) {
  if (!state.currentQuestion || !state.showResponseUi) return;
  const showStudentAnswer = canToggleReadAnswerDisplay(state)
    && normalizeAnswerDisplayMode(state.answerDisplayMode) === "student";
  const response = showStudentAnswer
    ? state.submittedReadResponse
    : responseFromQuestionCents(state.currentQuestion);
  setReadInputsValue(state, response);
  Object.values(state.readInputs).forEach((input) => {
    if (input) input.readOnly = true;
  });
}

function getCurrentEvaluation(state) {
  if (!state.currentQuestion) return { answered: false, correct: false, answerCents: NaN };
  const type = state.currentQuestion.exerciseType;
  if (type === EXERCISE_TYPES.COMPOSE_SUM) {
    const items = state.answerRevealed && state.answerDisplayMode === "student"
      ? state.composeStudentItemsSnapshot
      : state.selectedItems;
    const answerCents = sumItems(items);
    if (state.answerRevealed && typeof state.composeWasCorrect === "boolean") {
      return { answered: true, correct: state.composeWasCorrect, answerCents };
    }
    return {
      answered: state.selectedItems.length > 0,
      correct: evaluateComposeAnswer(state.currentQuestion, state.selectedItems, state.settings),
      answerCents
    };
  }
  const response = getReadResponse(state);
  const answerCents = getAnswerCents(state.currentQuestion, response);
  const answered = hasReadResponse(response, state.currentQuestion.displayFormat);
  return {
    answered,
    correct: answered && evaluateReadAnswer(state.currentQuestion, response),
    answerCents
  };
}

function getReadResponse(state) {
  if (state.answerRevealed && state.submittedReadResponse) return state.submittedReadResponse;
  const out = {};
  Object.entries(state.readInputs).forEach(([key, input]) => {
    out[key] = String(input?.value ?? "").trim();
  });
  return out;
}

function hasReadResponse(response, displayFormat) {
  const format = displayFormat || MONEY_DISPLAY_FORMATS.DECIMAL;
  if (format === MONEY_DISPLAY_FORMATS.CENTS_ONLY) return String(response?.centsTotal ?? "").trim() !== "";
  if (format === MONEY_DISPLAY_FORMATS.EUROS_CENTS || format === MONEY_DISPLAY_FORMATS.WORDS) {
    return String(response?.euros ?? "").trim() !== "" || String(response?.cents ?? "").trim() !== "";
  }
  return String(response?.decimal ?? "").trim() !== "";
}

function responseFromQuestionCents(question) {
  return responseFromCents(question?.totalCents, question?.displayFormat, {
    includeZeroCents: shouldShowReadCentsInput(question)
  });
}

function responseFromCents(cents, displayFormat, { includeZeroCents = true } = {}) {
  const value = Math.max(0, Math.floor(Number(cents) || 0));
  const euros = Math.floor(value / 100);
  const rest = value % 100;
  if (displayFormat === MONEY_DISPLAY_FORMATS.CENTS_ONLY) return { centsTotal: String(value) };
  if (displayFormat === MONEY_DISPLAY_FORMATS.EUROS_CENTS || displayFormat === MONEY_DISPLAY_FORMATS.WORDS) {
    if (rest === 0 && includeZeroCents === false) return { euros: String(euros) };
    return { euros: String(euros), cents: String(rest).padStart(2, "0") };
  }
  return { decimal: `${euros},${String(rest).padStart(2, "0")}` };
}

function setReadInputsValue(state, response = {}) {
  Object.entries(state.readInputs).forEach(([key, input]) => {
    if (!input) return;
    input.value = String(response?.[key] ?? "");
  });
}

function isCurrentAnswerCorrect(state) {
  return getCurrentEvaluation(state).correct === true;
}

function canToggleReadAnswerDisplay(state) {
  if (!state.showResponseUi || !state.answerRevealed || !state.currentQuestion) return false;
  if (state.currentQuestion.exerciseType !== EXERCISE_TYPES.READ_SUM) return false;
  if (!state.submittedReadResponse) return false;
  return !evaluateReadAnswer(state.currentQuestion, state.submittedReadResponse)
    || JSON.stringify(state.submittedReadResponse) !== JSON.stringify(responseFromQuestionCents(state.currentQuestion));
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
    mode: canToggle ? normalizeAnswerDisplayMode(state.answerDisplayMode) : "correction"
  };
}

function applyShellAnswerDisplayMode(state, mode) {
  if (!state.showResponseUi || !state.answerRevealed) return false;
  state.answerDisplayMode = normalizeAnswerDisplayMode(mode);

  if (state.currentQuestion?.exerciseType === EXERCISE_TYPES.COMPOSE_SUM) {
    if (!canToggleComposeAnswerDisplay(state)) {
      state.answerDisplayMode = "correction";
      return false;
    }
    state.selectedItems = cloneComposeItems(
      state.answerDisplayMode === "student"
        ? state.composeStudentItemsSnapshot
        : state.composeCorrectionItemsSnapshot
    );
    renderComposeItems(state);
    return true;
  }

  if (!canToggleReadAnswerDisplay(state)) {
    state.answerDisplayMode = "correction";
    renderReadDisplayedResponse(state);
    return false;
  }
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
  const text = resolveQuestionInstructionText({
    tool: state.latestContext?.tool,
    settings: state.latestContext?.settings,
    runtimeConfig: state.settings,
    defaultInstruction: state.latestContext?.defaultInstruction || "Manipule les pièces et les billets pour répondre."
  }, "");
  setToolInstructionText(state.instructionEl, text);
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
      asset: renderItem.asset,
      x: position.x,
      y: position.y,
      status: "correction"
    });
  });
  return out;
}

function syncActiveComposeSnapshot(state) {
  if (!state.answerRevealed || state.currentQuestion?.exerciseType !== EXERCISE_TYPES.COMPOSE_SUM) return;
  if (state.answerDisplayMode === "student") {
    state.composeStudentItemsSnapshot = cloneComposeItems(state.selectedItems);
    return;
  }
  state.composeCorrectionItemsSnapshot = cloneComposeItems(state.selectedItems);
  if (state.composeWasCorrect === true) state.composeStudentItemsSnapshot = cloneComposeItems(state.selectedItems);
}

function cloneComposeItems(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => ({ ...item }));
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
  for (let i = 0; i < 32; i += 1) candidates.push({ x: Math.random() * maxX, y: Math.random() * maxY });

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

function renderMoneyItems(state, items = [], { draggable = false, compact = false } = {}) {
  const safeItems = (Array.isArray(items) ? items : [])
    .map((item, index) => normalizeMoneyItemForRender(item, index))
    .filter(Boolean);
  return safeItems.map((item, index) => {
    const styleParts = [];
    if (draggable) {
      styleParts.push(`--rot:${((index * 17) % 13) - 6}deg`);
      styleParts.push(`--money-z:${index + 1}`);
    }
    const sizeStyle = getMoneyRenderSizeStyle(item, { draggable, compact });
    if (sizeStyle) styleParts.push(sizeStyle);
    const style = styleParts.length ? ` style="${styleParts.join(";")}"` : "";
    const indexAttr = draggable ? ` data-money-index="${index}"` : "";
    return `<span class="monrep-money monrep-money--${item.kind}${compact ? " monrep-money--compact" : ""}${draggable ? " monrep-money--draggable" : ""}"${indexAttr}${style}>${renderMoneyFace(state, item)}</span>`;
  }).join("");
}

function normalizeMoneyItemForRender(item, index = 0) {
  const source = typeof item === "string" ? getDenominationById(item) : item;
  if (!source) return null;
  const denom = getDenominationById(source.denominationId || source.id) || source;
  return {
    itemId: source.itemId || `money-${index}-${denom.id || source.denominationId}`,
    denominationId: source.denominationId || denom.id,
    label: source.label || denom.label,
    value: Number(source.value ?? denom.value ?? 0),
    kind: source.kind || denom.kind || "coin",
    asset: source.asset || denom.asset || ""
  };
}

function renderMoneyFace(state, item) {
  if (state.settings.assetStyle === MONEY_ASSET_STYLES.SIMPLE) {
    return `<span class="monrep-simple-face">${escapeHtml(item?.label ?? "")}</span>`;
  }
  const asset = String(item?.asset || "").trim();
  if (!asset) return escapeHtml(item?.label ?? "");
  const src = new URL(`../../shared/tool-assets/images/monnaie/${asset}`, import.meta.url).href;
  return `<img src="${escapeAttr(src)}" alt="${escapeAttr(item.label)}" draggable="false">`;
}

function getMoneyRenderSizeStyle(item, options = {}) {
  const size = getMoneyRenderSize(item, options);
  if (!size) return "";
  if (item?.kind !== "bill") return `--money-coin-size:${Math.round(size.width)}px`;
  return `--money-width:${Math.round(size.width)}px;--money-height:${Math.round(size.height)}px`;
}

function getMoneyRenderSize(item, { draggable = false, compact = false, compose = false, composePalette = false } = {}) {
  const safeKind = item?.kind === "bill" ? "bill" : "coin";
  if (safeKind !== "bill") {
    const scale = compose ? COMPOSE_WORKSPACE_MONEY_SCALE : composePalette ? COMPOSE_PALETTE_MONEY_SCALE : 1;
    const size = (compact ? 62 : COIN_RENDER_SIZE_PX * scale) * getCoinDiameterRatio(item);
    return { width: Math.round(size), height: Math.round(size) };
  }
  const dimensions = BILL_ASSET_SIZES[item?.asset];
  if (!dimensions) return compact ? { width: 88, height: 48 } : { width: 132, height: 70 };
  const baseScale = compact
    ? BILL_COMPACT_RENDER_SCALE
    : composePalette
      ? BILL_READ_RENDER_SCALE * COMPOSE_PALETTE_MONEY_SCALE
      : compose
        ? BILL_READ_RENDER_SCALE * COMPOSE_WORKSPACE_MONEY_SCALE
        : draggable
          ? BILL_READ_RENDER_SCALE
          : BILL_RENDER_SCALE;
  return {
    width: Math.round(dimensions.width * baseScale),
    height: Math.round(dimensions.height * baseScale)
  };
}

function getCoinDiameterRatio(item) {
  const diameter = COIN_DIAMETERS_MM[item?.denominationId] ?? COIN_REFERENCE_DIAMETER_MM;
  return diameter / COIN_REFERENCE_DIAMETER_MM;
}

function layoutScatterMoneyItems(root) {
  const wallet = root?.querySelector(".monrep-wallet--scatter");
  if (!wallet) return;
  const items = Array.from(wallet.querySelectorAll(".monrep-money"));
  if (!items.length) return;
  const rect = wallet.getBoundingClientRect();
  const areaW = Math.max(120, rect.width * READ_SCATTER_ZONE_SIDE_RATIO);
  const areaH = Math.max(120, rect.height * READ_SCATTER_ZONE_SIDE_RATIO);
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;

  items.forEach((item, index) => {
    const itemRect = item.getBoundingClientRect();
    const maxDx = Math.max(0, (areaW - itemRect.width) / 2);
    const maxDy = Math.max(0, (areaH - itemRect.height) / 2);
    const angle = (index / Math.max(1, items.length)) * Math.PI * 2;
    const radius = Math.min(maxDx, maxDy) * (0.35 + (index % 3) * 0.22);
    const jitterX = Math.cos(angle) * radius + ((index % 2) ? 18 : -18);
    const jitterY = Math.sin(angle) * radius + ((index % 3) - 1) * 16;
    const x = clampNumber(centerX - itemRect.width / 2 + jitterX, centerX - areaW / 2, centerX + areaW / 2 - itemRect.width);
    const y = clampNumber(centerY - itemRect.height / 2 + jitterY, centerY - areaH / 2, centerY + areaH / 2 - itemRect.height);
    item.style.left = `${Math.round(x)}px`;
    item.style.top = `${Math.round(y)}px`;
  });
}

function formatRuntimeMoney(cents, displayFormat) {
  return formatMoney(cents, { displayFormat });
}

function normalizeDecimalSeparator(input) {
  if (!input) return;
  const value = String(input.value ?? "");
  if (!value.includes(".")) return;
  const selectionStart = input.selectionStart;
  const selectionEnd = input.selectionEnd;
  input.value = value.replace(/\./g, ",");
  if (selectionStart != null && selectionEnd != null) input.setSelectionRange(selectionStart, selectionEnd);
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

function getElementLayoutWidth(element) {
  return element?.offsetWidth || element?.getBoundingClientRect?.().width || 0;
}

function getElementLayoutHeight(element) {
  return element?.offsetHeight || element?.getBoundingClientRect?.().height || 0;
}

function getElementClientScale(element) {
  const rect = element?.getBoundingClientRect?.();
  const layoutWidth = getElementLayoutWidth(element);
  const layoutHeight = getElementLayoutHeight(element);
  return {
    x: rect?.width && layoutWidth ? rect.width / layoutWidth : 1,
    y: rect?.height && layoutHeight ? rect.height / layoutHeight : 1
  };
}

function getElementPixelValue(element, property, fallback = 0) {
  const value = Number.parseFloat(element?.style?.[property]);
  return Number.isFinite(value) ? value : fallback;
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
  state.feedbackEl = null;
}

function shouldShowResponseUi(context = {}) {
  const explicit = String(context?.responseUi ?? context?.response_ui ?? "").trim().toLowerCase();
  if (explicit === "free") return false;
  if (explicit === "boxed") return true;
  const mode = String(context?.activityMode ?? context?.activity_mode ?? "").trim().toLowerCase();
  return mode !== "group";
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const href = new URL("./activity.css", import.meta.url).href;
  if (document.querySelector(`link[data-monnaie-rep-activity-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.monnaieRepActivityStyle = href;
  document.head.appendChild(link);
}

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
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
