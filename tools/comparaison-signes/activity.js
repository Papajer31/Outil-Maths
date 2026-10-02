import {
  CROCODILE_STATES,
  LAYOUTS,
  MODES,
  REPRESENTATIONS,
  SIDES,
  evaluateAnswer,
  getInstruction,
  normalizeSettings,
  pickQuestion,
  questionKey
} from "./model.js";
import { listPublicEmojiAssets } from "../../shared/public-emoji-assets.js";
import { getCollectionEmojiAssets } from "../../shared/collection-generator.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveQuestionInstructionText,
  setToolInstructionText
} from "../../shared/tool-instruction.js";

const CROCODILE_URLS = Object.freeze({
  [CROCODILE_STATES.NEUTRAL]: new URL("../../shared/tool-assets/comparaison-signes/crocodile-neutral.webp", import.meta.url).href,
  [CROCODILE_STATES.LEFT]: new URL("../../shared/tool-assets/comparaison-signes/crocodile-left.webp", import.meta.url).href,
  [CROCODILE_STATES.RIGHT]: new URL("../../shared/tool-assets/comparaison-signes/crocodile-right.webp", import.meta.url).href
});

let stylesInjected = false;

export function createActivity(initialContext = {}) {
  injectStyles();
  const state = createRuntimeState(initialContext);

  return {
    mount(container, context = initialContext) {
      state.container = container;
      syncRuntimeState(state, context);
      renderShell(state);
      syncValidationState(state);
    },

    next(container, context = state.latestContext) {
      return this.nextQuestion(container, context);
    },

    async nextQuestion(container, context = state.latestContext) {
      state.container = container || state.container;
      syncRuntimeState(state, context);
      if (!state.root?.isConnected) renderShell(state);
      await loadNextQuestion(state);
      return state.currentQuestion;
    },

    showAnswer(container, context = state.latestContext) {
      state.container = container || state.container;
      syncRuntimeState(state, context);
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
      requestReveal(state);
      return true;
    },

    getAnswerState() {
      const evaluation = state.lastEvaluation || evaluateAnswer(state.currentQuestion, getSubmittedAnswer(state));
      return {
        answered: Boolean(evaluation?.answered),
        correct: Boolean(evaluation?.isCorrect)
      };
    },

    getHistorySnapshot(stage = "question") {
      return getHistorySnapshot(state, stage);
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
    settings: normalizeSettings(initialContext?.settings),
    root: null,
    instructionEl: null,
    stageEl: null,
    currentQuestion: null,
    lastQuestionKey: "",
    selectedAnswer: "",
    crocodileState: CROCODILE_STATES.NEUTRAL,
    studentAnswerSnapshot: "",
    lastEvaluation: null,
    answerRevealed: false,
    abortController: null,
    emojiAssets: [],
    assetsLoadingPromise: null
  };
}

function syncRuntimeState(state, context = {}) {
  state.latestContext = context ?? state.latestContext;
  state.settings = normalizeSettings(state.latestContext?.settings || state.settings || {});
}

function renderShell(state) {
  if (!state.container) return;
  teardownBindings(state);
  state.container.innerHTML = `
    <div class="tool-runtime cmp-root">
      ${renderToolInstruction({ id: "cmp_instruction" })}
      <div class="cmp-panel">
        <div class="cmp-stage" data-cmp-stage aria-live="polite"></div>
      </div>
    </div>
  `;
  state.root = state.container.querySelector(".cmp-root");
  state.instructionEl = state.container.querySelector("#cmp_instruction");
  state.stageEl = state.container.querySelector("[data-cmp-stage]");
}

async function loadNextQuestion(state) {
  await ensureEmojiAssetsLoaded(state);
  const question = pickQuestion(state.settings, {
    avoidKey: state.lastQuestionKey,
    attempts: 160,
    assets: state.emojiAssets
  });
  if (!question) {
    state.currentQuestion = null;
    state.lastQuestionKey = "";
    renderEmptyState(state);
    syncValidationState(state);
    return null;
  }

  state.currentQuestion = question;
  state.lastQuestionKey = questionKey(question);
  state.selectedAnswer = "";
  state.crocodileState = CROCODILE_STATES.NEUTRAL;
  state.studentAnswerSnapshot = "";
  state.lastEvaluation = null;
  state.answerRevealed = false;
  renderQuestion(state);
  syncValidationState(state);
  return question;
}

async function ensureEmojiAssetsLoaded(state) {
  if (state.emojiAssets.length) return state.emojiAssets;
  if (state.assetsLoadingPromise) return state.assetsLoadingPromise;

  state.assetsLoadingPromise = listPublicEmojiAssets()
    .then((assets) => {
      state.emojiAssets = getCollectionEmojiAssets(assets);
      return state.emojiAssets;
    })
    .catch((error) => {
      console.error("Impossible de charger les émojis depuis Supabase.", error);
      state.emojiAssets = [];
      return state.emojiAssets;
    })
    .finally(() => {
      state.assetsLoadingPromise = null;
    });

  return state.assetsLoadingPromise;
}

function renderQuestion(state) {
  const question = state.currentQuestion;
  if (!question || !state.stageEl) return;

  teardownBindings(state);
  const defaultInstruction = question.instruction || getInstruction(question.mode);
  setToolInstructionText(state.instructionEl, resolveQuestionInstructionText(state.latestContext, defaultInstruction, defaultInstruction));
  state.root?.classList.toggle("is-revealed", state.answerRevealed);
  state.root?.classList.toggle("is-correct", Boolean(state.answerRevealed && state.lastEvaluation?.isCorrect));
  state.root?.classList.toggle("is-incorrect", Boolean(state.answerRevealed && state.lastEvaluation && !state.lastEvaluation.isCorrect));

  state.stageEl.innerHTML = renderStage(state);
  bindQuestionEvents(state);
}

function renderStage(state) {
  const question = state.currentQuestion;
  const mode = question.mode;
  const selected = state.answerRevealed ? state.studentAnswerSnapshot : state.selectedAnswer;
  const shownCrocodileState = getShownCrocodileState(state);
  const leftClasses = getCollectionClasses(state, SIDES.LEFT, selected);
  const rightClasses = getCollectionClasses(state, SIDES.RIGHT, selected);

  const leftValue = renderValue({
    side: SIDES.LEFT,
    value: question.leftCount,
    representation: question.leftRepresentation,
    asset: question,
    layout: question.layout,
    positions: question.leftPositions,
    classes: leftClasses,
    interactive: mode === MODES.CHOOSE_COLLECTION && !state.answerRevealed
  });

  const rightValue = renderValue({
    side: SIDES.RIGHT,
    value: question.rightCount,
    representation: question.rightRepresentation,
    asset: question,
    layout: question.layout,
    positions: question.rightPositions,
    classes: rightClasses,
    interactive: mode === MODES.CHOOSE_COLLECTION && !state.answerRevealed
  });

  return `
    <div class="cmp-comparison cmp-comparison--${escapeAttr(mode)}" data-cmp-layout="${escapeAttr(question.layout)}">
      ${leftValue}
      <div class="cmp-center">
        ${mode === MODES.CHOOSE_SYMBOL
          ? renderSymbolCenter(state, selected)
          : renderCrocodile(state, shownCrocodileState)}
      </div>
      ${rightValue}
    </div>
    ${mode === MODES.CHOOSE_SYMBOL ? renderSymbolButtons(state, selected) : ""}
  `;
}

function renderValue({ side, value, representation, asset, layout, positions, classes = "", interactive = false }) {
  if (representation === REPRESENTATIONS.NUMBER) {
    return renderNumberValue({ side, value, classes, interactive });
  }
  return renderCollection({ side, count: value, asset, layout, positions, classes, interactive });
}

function renderNumberValue({ side, value, classes = "", interactive = false }) {
  const tag = interactive ? "button" : "div";
  const interactionAttrs = interactive
    ? `type="button" data-cmp-collection="${escapeAttr(side)}" aria-label="Choisir la valeur ${side === SIDES.LEFT ? "de gauche" : "de droite"}"`
    : "";
  return `<${tag} class="cmp-number ${classes}" data-cmp-side="${escapeAttr(side)}" ${interactionAttrs}>${escapeHtml(value)}</${tag}>`;
}

function renderCollection({ side, count, asset, layout, positions, classes = "", interactive = false }) {
  const tag = interactive ? "button" : "div";
  const interactionAttrs = interactive
    ? `type="button" data-cmp-collection="${escapeAttr(side)}" aria-label="Choisir la collection ${side === SIDES.LEFT ? "de gauche" : "de droite"}"`
    : "";
  const density = getDensity(count);
  const items = layout === LAYOUTS.CLOUD
    ? renderCloudItems(count, asset, positions)
    : renderRowItems(count, asset);

  return `
    <${tag} class="cmp-collection ${classes}" data-cmp-side="${escapeAttr(side)}" data-cmp-density="${escapeAttr(density)}" ${interactionAttrs}>
      <div class="cmp-items cmp-items--${escapeAttr(layout)}">
        ${items}
      </div>
    </${tag}>
  `;
}

function renderRowItems(count, asset) {
  return Array.from({ length: Number(count) || 0 }, (_, index) => `
    <img class="cmp-item" src="${escapeAttr(getAssetSource(asset))}" alt="" aria-hidden="true" draggable="false" loading="eager" decoding="async" style="--cmp-index:${index}">
  `).join("");
}

function renderCloudItems(count, asset, positions = []) {
  return Array.from({ length: Number(count) || 0 }, (_, index) => {
    const position = positions?.[index] || { x: 50, y: 50, r: 0 };
    return `
      <img class="cmp-item cmp-item--cloud" src="${escapeAttr(getAssetSource(asset))}" alt="" aria-hidden="true" draggable="false" loading="eager" decoding="async"
        style="left:${round(position.x)}%;top:${round(position.y)}%;transform:translate(-50%,-50%) rotate(${round(position.r)}deg)">
    `;
  }).join("");
}

function getAssetSource(asset = {}) {
  return String(asset?.assetSrc || asset?.url || asset?.src || "").trim();
}

function renderCrocodile(state, crocodileState) {
  const interactive = state.currentQuestion?.mode === MODES.ORIENT_CROCODILE && !state.answerRevealed;
  const tag = interactive ? "button" : "div";
  const attrs = interactive
    ? 'type="button" data-cmp-crocodile aria-label="Orienter le crocodile"'
    : "";
  const evaluationClass = state.answerRevealed
    ? (state.lastEvaluation?.isCorrect ? "is-correct" : "is-incorrect")
    : "";
  const url = CROCODILE_URLS[crocodileState] || CROCODILE_URLS[CROCODILE_STATES.NEUTRAL];

  return `
    <${tag} class="cmp-crocodile ${interactive ? "is-interactive" : ""} ${evaluationClass}" ${attrs}>
      <img src="${escapeAttr(url)}" alt="Crocodile" draggable="false">
    </${tag}>
  `;
}

function renderSymbolCenter(state, selected) {
  const question = state.currentQuestion;
  let symbol = selected === "<" || selected === ">" ? selected : "?";
  let classes = "cmp-symbol-slot";

  if (state.answerRevealed) {
    symbol = question.correctSymbol;
    classes += state.lastEvaluation?.isCorrect ? " is-correct" : " is-correction";
  } else if (selected) {
    classes += " is-selected";
  }

  return `<div class="${classes}" aria-label="Signe choisi">${renderComparisonSignIcon(symbol)}</div>`;
}

function renderSymbolButtons(state, selected) {
  const question = state.currentQuestion;
  const symbols = ["<", ">"];
  return `
    <div class="cmp-symbol-buttons" aria-label="Choisir le signe">
      ${symbols.map((symbol) => {
        const isSelected = selected === symbol;
        const isExpected = question.correctSymbol === symbol;
        const classes = ["tool-choice-button", "cmp-symbol-button"];
        if (!state.answerRevealed && isSelected) classes.push("is-selected");
        if (state.answerRevealed && isExpected) classes.push("is-correct");
        if (state.answerRevealed && isSelected && !isExpected) classes.push("is-incorrect");
        return `
          <button class="${classes.join(" ")}" type="button" data-cmp-symbol="${escapeAttr(symbol)}" aria-label="${symbol === "<" ? "Signe inférieur à" : "Signe supérieur à"}" ${state.answerRevealed ? "disabled" : ""}>
            ${renderComparisonSignIcon(symbol)}
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function renderComparisonSignIcon(symbol) {
  const path = symbol === "<"
    ? "M78 10 22 50l56 40"
    : symbol === ">"
      ? "M22 10l56 40-56 40"
      : "";

  if (!path) return '<span class="cmp-symbol-placeholder" aria-hidden="true">?</span>';
  return `
    <svg class="cmp-symbol-icon" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <path d="${path}" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>
  `;
}

function getCollectionClasses(state, side, selected) {
  const classes = [];
  const question = state.currentQuestion;
  if (!question) return "";

  if (!state.answerRevealed) {
    if (question.mode === MODES.CHOOSE_COLLECTION && selected === side) classes.push("is-selected");
    return classes.join(" ");
  }

  if (question.mode === MODES.CHOOSE_SYMBOL) return "";

  if (side === question.correctSide) classes.push("is-correct");
  if (question.mode === MODES.CHOOSE_COLLECTION && selected === side && side !== question.correctSide) classes.push("is-incorrect");
  return classes.join(" ");
}

function getShownCrocodileState(state) {
  if (state.answerRevealed) {
    return state.currentQuestion?.correctCrocodileState || CROCODILE_STATES.NEUTRAL;
  }
  if (state.currentQuestion?.mode === MODES.ORIENT_CROCODILE) return state.crocodileState;
  return CROCODILE_STATES.NEUTRAL;
}

function bindQuestionEvents(state) {
  const controller = new AbortController();
  const { signal } = controller;
  state.abortController = controller;

  state.stageEl?.querySelectorAll("[data-cmp-collection]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.answerRevealed) return;
      state.selectedAnswer = String(button.dataset.cmpCollection || "");
      renderQuestion(state);
      syncValidationState(state);
    }, { signal });
  });

  state.stageEl?.querySelector("[data-cmp-crocodile]")?.addEventListener("click", () => {
    if (state.answerRevealed) return;
    state.crocodileState = state.crocodileState === CROCODILE_STATES.LEFT
      ? CROCODILE_STATES.RIGHT
      : CROCODILE_STATES.LEFT;
    state.selectedAnswer = state.crocodileState;
    renderQuestion(state);
    syncValidationState(state);
  }, { signal });

  state.stageEl?.querySelectorAll("[data-cmp-symbol]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.answerRevealed) return;
      state.selectedAnswer = String(button.dataset.cmpSymbol || "");
      renderQuestion(state);
      syncValidationState(state);
    }, { signal });
  });
}

function requestReveal(state) {
  if (!canValidate(state)) return;
  state.studentAnswerSnapshot = getSubmittedAnswer(state);
  state.lastEvaluation = evaluateAnswer(state.currentQuestion, state.studentAnswerSnapshot);

  const requested = state.latestContext?.services?.requestAnswerPhase?.({
    manual: false,
    showAnswerNow: true,
    wasCorrect: state.lastEvaluation.isCorrect,
    skipValidationReview: true
  });

  if (!requested) revealAnswer(state);
  syncValidationState(state);
}

function revealAnswer(state) {
  if (!state.currentQuestion) return;
  if (!state.studentAnswerSnapshot) state.studentAnswerSnapshot = getSubmittedAnswer(state);
  state.lastEvaluation = evaluateAnswer(state.currentQuestion, state.studentAnswerSnapshot);
  state.answerRevealed = true;
  renderQuestion(state);
  syncValidationState(state);
}

function canValidate(state) {
  if (!state.currentQuestion || state.answerRevealed) return false;
  return evaluateAnswer(state.currentQuestion, getSubmittedAnswer(state)).answered;
}

function getSubmittedAnswer(state) {
  if (state.currentQuestion?.mode === MODES.ORIENT_CROCODILE) {
    return state.crocodileState === CROCODILE_STATES.NEUTRAL ? "" : state.crocodileState;
  }
  return String(state.selectedAnswer || "");
}

function getHistorySnapshot(state, stage = "question") {
  const question = state.currentQuestion;
  if (!question) return { schemaVersion: 2, kind: "comparison-collections", prompt: "" };
  const safeStage = String(stage || "question").toLowerCase();
  return {
    schemaVersion: 2,
    kind: "comparison-collections",
    prompt: question.instruction,
    mode: question.mode,
    leftCount: question.leftCount,
    rightCount: question.rightCount,
    leftRepresentation: question.leftRepresentation,
    rightRepresentation: question.rightRepresentation,
    layout: question.layout,
    assetId: question.assetId,
    assetLabel: question.assetLabel,
    submittedAnswer: safeStage === "question" ? "" : state.studentAnswerSnapshot,
    expectedAnswer: safeStage === "correction" ? question.correctAnswer : ""
  };
}

function renderEmptyState(state) {
  if (!state.stageEl) return;
  state.root?.classList.remove("is-revealed", "is-correct", "is-incorrect");
  setToolInstructionText(state.instructionEl, "Impossible de générer une comparaison avec ces réglages.");
  state.stageEl.innerHTML = '<p class="cmp-empty-state">Modifie les valeurs ou les représentations, puis relance l’activité.</p>';
}

function getDensity(count) {
  const value = Number(count) || 0;
  if (value <= 5) return "tiny";
  if (value <= 10) return "small";
  if (value <= 15) return "medium";
  return "large";
}

function syncValidationState(state) {
  state.latestContext?.services?.notifyValidationStateChanged?.();
}

function teardownBindings(state) {
  state.abortController?.abort();
  state.abortController = null;
}

function teardownState(state, container) {
  teardownBindings(state);
  if (container) container.innerHTML = "";
  state.container = null;
  state.root = null;
  state.instructionEl = null;
  state.stageEl = null;
  state.currentQuestion = null;
  state.selectedAnswer = "";
  state.crocodileState = CROCODILE_STATES.NEUTRAL;
  state.studentAnswerSnapshot = "";
  state.lastEvaluation = null;
  state.answerRevealed = false;
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  ensureToolInstructionStyles();
  if (typeof document === "undefined") return;
  const href = new URL("./activity.css", import.meta.url).href;
  if (document.querySelector(`link[data-comparaison-signes-activity-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.comparaisonSignesActivityStyle = href;
  document.head.appendChild(link);
}

function round(value) {
  return Math.round(Number(value) * 10) / 10;
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
