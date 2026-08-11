import { listPublicEmojiAssets } from "../../shared/public-emoji-assets.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveToolInstructionText,
  setToolInstructionText
} from "../../shared/tool-instruction.js";
import { createNumericAnswerControl, renderNumericAnswerDisplayMarkup } from "../../shared/tool-ui/numeric-answer.js";
import { bindNumericKeypadEvents, renderNumericKeypad } from "../../shared/tool-ui/numeric-keypad.js";
import { getCollectionEmojiAssets } from "../../shared/collection-generator.js";
import {
  ANSWERS,
  COLLECTION_MODES,
  evaluateAnswer,
  getDefaultInstructionForMode,
  normalizeSettings,
  pickQuestion,
  questionKey
} from "./model.js";

let stylesInjected = false;

export function createActivity(initialContext = {}) {
  injectStyles();
  const state = createRuntimeState(initialContext);

  return {
    mount(container, context = initialContext) {
      state.container = container;
      state.latestContext = context ?? state.latestContext;
      syncRuntimeState(state, state.latestContext);
      renderShell(state);
    },

    next(container, context = state.latestContext) {
      return this.nextQuestion(container, context);
    },

    async nextQuestion(container, context = state.latestContext) {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      syncRuntimeState(state, state.latestContext);
      if (!state.root) renderShell(state);
      await loadNextQuestion(state);
      return state.currentQuestion;
    },

    showAnswer(container, context = state.latestContext) {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      syncRuntimeState(state, state.latestContext);
      revealAnswer(state);
    },

    getShellAnswerDisplayState() {
      return {
        canToggle: canToggleStudentAnswerDisplay(state),
        mode: canToggleStudentAnswerDisplay(state) ? normalizeAnswerDisplayMode(state.answerDisplayMode) : "correction"
      };
    },

    setShellAnswerDisplayMode(container, context = state.latestContext, mode = "correction") {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      syncRuntimeState(state, state.latestContext);
      if (!canToggleStudentAnswerDisplay(state)) return false;
      state.answerDisplayMode = normalizeAnswerDisplayMode(mode);
      renderWriteAnswerResult(state);
      return true;
    },

    supportsShellValidation() {
      return true;
    },

    canValidate() {
      return !state.answerRevealed && !!state.selectedAnswer;
    },

    validate() {
      if (state.answerRevealed || !state.selectedAnswer) return false;
      requestReveal(state);
      return true;
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
    questionAreaEl: null,
    responsesEl: null,
    currentQuestion: null,
    lastQuestionKey: "",
    lastAssetId: "",
    answerRevealed: false,
    selectedAnswer: "",
    submittedAnswer: "",
    answerDisplayMode: "correction",
    studentAnswerSnapshot: "",
    correctionSnapshot: "",
    currentSettings: normalizeSettings(initialContext?.settings),
    emojiAssets: [],
    assetsLoadingPromise: null,
    responseAbortController: null,
    answerControl: null
  };
}

function syncRuntimeState(state, context = state.latestContext) {
  state.currentSettings = normalizeSettings(context?.settings || state.currentSettings || {});
}

function renderShell(state) {
  const container = state.container;
  if (!container) return;
  teardownBindings(state);
  destroyAnswerControl(state);

  container.innerHTML = `
    <div class="tool-runtime tool-runtime--collection collection-root" id="collection_root">
      ${renderToolInstruction({ id: "collection_instruction" })}
      <div class="tool-stage tool-panel collection-panel">
        <div class="collection-question-area" id="collection_question_area" aria-live="polite"></div>
        <div class="collection-responses" id="collection_responses"></div>
      </div>
    </div>
  `;

  state.root = container.querySelector("#collection_root");
  state.instructionEl = container.querySelector("#collection_instruction");
  state.questionAreaEl = container.querySelector("#collection_question_area");
  state.responsesEl = container.querySelector("#collection_responses");
  updateInstruction(state);
}

async function loadNextQuestion(state) {
  await ensureEmojiAssetsLoaded(state);
  state.answerRevealed = false;
  state.selectedAnswer = "";
  state.submittedAnswer = "";
  state.answerDisplayMode = "correction";
  state.studentAnswerSnapshot = "";
  state.correctionSnapshot = "";
  state.root?.classList.remove("collection-root--correct", "collection-root--incorrect", "collection-root--revealed");
  destroyAnswerControl(state);

  state.currentQuestion = pickQuestion(state.currentSettings, {
    avoidKey: state.lastQuestionKey,
    avoidAssetId: state.lastAssetId,
    assets: state.emojiAssets
  });

  state.lastQuestionKey = questionKey(state.currentQuestion || {});
  state.lastAssetId = String(state.currentQuestion?.assetId || "");
  renderQuestion(state);
  syncValidateState(state);
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
  updateInstruction(state);
  if (!state.currentQuestion) {
    renderEmptyState(state);
    return;
  }

  state.root?.setAttribute("data-collection-mode", state.currentQuestion.mode || COLLECTION_MODES.VERIFY);
  if (state.questionAreaEl) {
    state.questionAreaEl.innerHTML = renderQuestionMarkup(state.currentQuestion);
  }
  renderResponses(state);
  revealLoadedEmojiImages(state.root, ".collection-item");
  scheduleCollectionCloudOverlapCheck(state.root);
}

function renderQuestionMarkup(question) {
  if (question.mode === COLLECTION_MODES.VERIFY) {
    return `
      <div class="collection-row collection-row--verify">
        <div class="collection-number" aria-label="Nombre ${escapeHtml(question.targetCount)}">${escapeHtml(question.targetCount)}</div>
        <div class="collection-arrow" aria-hidden="true">→</div>
        ${renderCollectionCloud(question.shownCollection || question, {
          className: "collection-display collection-display--verify",
          seed: `verify|${question.assetId}|${question.targetCount}|${question.shownCount}`
        })}
      </div>
    `;
  }

  if (question.mode === COLLECTION_MODES.NUMBER_TO_COLLECTION) {
    return `
      <div class="collection-row collection-row--prompt collection-row--number-prompt">
        <div class="collection-number collection-number--prompt" aria-label="Nombre ${escapeHtml(question.targetCount)}">${escapeHtml(question.targetCount)}</div>
      </div>
    `;
  }

  return `
    <div class="collection-row collection-row--prompt">
      ${renderCollectionCloud(question.promptCollection || question, {
        className: "collection-display collection-display--prompt",
        seed: `prompt|${question.assetId}|${question.targetCount}|${question.mode}`
      })}
    </div>
  `;
}

function renderEmptyState(state) {
  if (state.questionAreaEl) {
    state.questionAreaEl.innerHTML = `<div class="tool-empty-message">Aucun asset emoji disponible en nombre suffisant.</div>`;
  }
  if (state.responsesEl) state.responsesEl.innerHTML = "";
}

function renderResponses(state) {
  if (!state.responsesEl) return;
  teardownBindings(state);
  destroyAnswerControl(state);

  if (!state.currentQuestion) {
    state.responsesEl.innerHTML = "";
    return;
  }

  if (state.currentQuestion.mode === COLLECTION_MODES.MATCH_COLLECTION || state.currentQuestion.mode === COLLECTION_MODES.NUMBER_TO_COLLECTION) {
    renderCollectionChoices(state);
    return;
  }

  if (state.currentQuestion.mode === COLLECTION_MODES.NUMBER_LINE) {
    renderNumberLine(state);
    return;
  }

  if (state.currentQuestion.mode === COLLECTION_MODES.WRITE_NUMBER) {
    renderNumericInput(state);
    return;
  }

  renderYesNoButtons(state);
}

function renderYesNoButtons(state) {
  const buttons = [
    { value: ANSWERS.YES, ariaLabel: "Oui", icon: renderCheckIcon() },
    { value: ANSWERS.NO, ariaLabel: "Non", icon: renderCrossIcon() }
  ];

  state.responsesEl.className = "collection-responses collection-responses--yes-no";
  state.responsesEl.innerHTML = buttons.map((button) => renderAnswerButton({
    value: button.value,
    ariaLabel: button.ariaLabel,
    innerHtml: button.icon,
    state,
    className: "collection-response collection-response--icon"
  })).join("");

  bindResponseEvents(state, "[data-collection-answer]", { immediate: true });
}

function renderCollectionChoices(state) {
  const choices = Array.isArray(state.currentQuestion.choices) ? state.currentQuestion.choices : [];
  const count = Math.max(1, choices.length);
  state.responsesEl.className = `collection-responses collection-responses--qcm collection-responses--qcm-${count}`;
  state.responsesEl.innerHTML = choices.map((choice, index) => {
    const cloud = renderCollectionCloud(choice.collection, {
      className: "collection-display collection-display--choice",
      seed: `choice|${state.currentQuestion.assetId}|${choice.id}|${choice.count}|${index}`
    });
    return renderAnswerButton({
      value: choice.id,
      ariaLabel: `Collection ${index + 1}`,
      innerHtml: cloud,
      state,
      className: "collection-response collection-response--collection"
    });
  }).join("");

  bindResponseEvents(state, "[data-collection-answer]", { immediate: true });
}

function renderNumberLine(state) {
  const values = Array.isArray(state.currentQuestion.numberLine?.values) ? state.currentQuestion.numberLine.values : [];
  state.responsesEl.className = "collection-responses collection-responses--number-line";
  state.responsesEl.innerHTML = `
    <div class="collection-number-line" role="group" aria-label="File numérique">
      ${values.map((value) => renderAnswerButton({
        value: String(value),
        ariaLabel: `Nombre ${value}`,
        innerHtml: `<span>${escapeHtml(value)}</span>`,
        state,
        className: "collection-response collection-response--number"
      })).join("")}
    </div>
  `;

  bindResponseEvents(state, "[data-collection-answer]", { immediate: true });
}

function renderNumericInput(state) {
  state.responsesEl.className = "collection-responses collection-responses--write";
  state.responsesEl.innerHTML = `
    <div class="collection-write-answer" id="collection_write_answer"></div>
    ${renderWriteKeypad()}
  `;

  const host = state.responsesEl.querySelector("#collection_write_answer");
  state.answerControl = createNumericAnswerControl({
    id: "collection_numeric_answer",
    className: "collection-numeric-answer",
    ariaLabel: "Réponse chiffrée",
    maxLength: 2,
    captureRoot: state.root,
    onInput: (value) => {
      if (state.answerRevealed) return;
      state.selectedAnswer = String(value || "");
      syncValidateState(state);
      scheduleNumericAnswerVisualCentering(state.responsesEl);
    },
    onSubmit: () => {
      if (!state.answerRevealed && state.selectedAnswer) requestReveal(state);
    }
  });
  host?.appendChild(state.answerControl.element);
  bindKeypadEvents(state);
  state.answerControl.focus?.();
  scheduleNumericAnswerVisualCentering(host);
}

function renderAnswerButton({ value, ariaLabel, innerHtml, state, className = "collection-response" }) {
  const isSelected = String(state.selectedAnswer || "") === String(value || "");
  const isSubmitted = String(state.submittedAnswer || "") === String(value || "");
  const showCorrect = state.answerRevealed && String(state.currentQuestion?.correctAnswer || "") === String(value || "");
  const showIncorrect = state.answerRevealed && isSubmitted && String(state.currentQuestion?.correctAnswer || "") !== String(value || "");
  const classNames = [
    "tool-choice-button",
    className,
    isSelected && !state.answerRevealed ? "is-selected" : "",
    showCorrect ? "is-correct" : "",
    showIncorrect ? "is-incorrect" : ""
  ].filter(Boolean).join(" ");

  return `
    <button class="${escapeHtml(classNames)}" type="button" data-collection-answer="${escapeHtml(value)}" aria-label="${escapeHtml(ariaLabel || value)}" ${state.answerRevealed ? "disabled" : ""}>
      ${innerHtml}
    </button>
  `;
}

function renderWriteKeypad({ hidden = false } = {}) {
  return renderNumericKeypad({
    hidden,
    rootClassName: "collection-keypad",
    buttonClassName: "collection-keypad-button",
    clearButtonClassName: "collection-keypad-button--clear",
    dataAttribute: "data-collection-key"
  });
}

function bindResponseEvents(state, selector, { immediate = true } = {}) {
  if (!state.responsesEl || state.answerRevealed) return;
  teardownBindings(state);

  const abortController = new AbortController();
  const { signal } = abortController;
  state.responseAbortController = abortController;

  state.responsesEl.querySelectorAll(selector).forEach((button) => {
    button.addEventListener("click", () => {
      if (state.answerRevealed) return;
      state.selectedAnswer = String(button.dataset.collectionAnswer || "");
      updateChoiceSelection(state);
      if (immediate) requestReveal(state);
    }, { signal });
  });
}

function bindKeypadEvents(state) {
  if (!state.responsesEl || state.answerRevealed) return;
  teardownBindings(state);

  const abortController = new AbortController();
  const { signal } = abortController;
  state.responseAbortController = abortController;

  bindNumericKeypadEvents({
    root: state.responsesEl,
    control: state.answerControl,
    signal,
    dataAttribute: "data-collection-key"
  });
}

function updateChoiceSelection(state) {
  state.responsesEl?.querySelectorAll("[data-collection-answer]").forEach((button) => {
    const selected = String(button.dataset.collectionAnswer || "") === String(state.selectedAnswer || "");
    button.classList.toggle("is-selected", selected && !state.answerRevealed);
  });
}

function requestReveal(state) {
  const wasCorrect = evaluateAnswer(state.currentQuestion, state.selectedAnswer).isCorrect;
  const requested = state.latestContext?.services?.requestAnswerPhase?.({
    manual: false,
    showAnswerNow: true,
    wasCorrect
  });
  if (requested === false || !state.latestContext?.services?.requestAnswerPhase) {
    revealAnswer(state);
  }
}

function revealAnswer(state) {
  if (!state.currentQuestion || state.answerRevealed) return;
  state.submittedAnswer = state.selectedAnswer || "";
  state.answerRevealed = true;

  const evaluation = evaluateAnswer(state.currentQuestion, state.submittedAnswer);
  state.root?.classList.add("collection-root--revealed");
  state.root?.classList.toggle("collection-root--correct", evaluation.isCorrect);
  state.root?.classList.toggle("collection-root--incorrect", !evaluation.isCorrect);

  if (state.currentQuestion.mode === COLLECTION_MODES.WRITE_NUMBER) {
    state.studentAnswerSnapshot = String(state.submittedAnswer || "");
    state.correctionSnapshot = String(state.currentQuestion.correctAnswer || "");
    state.answerDisplayMode = "correction";
    renderWriteAnswerResult(state);
  } else {
    renderResponses(state);
    scheduleCollectionCloudOverlapCheck(state.root);
  }
  syncValidateState(state);
}

function syncValidateState(state) {
  state.latestContext?.services?.notifyValidationStateChanged?.();
}

function renderWriteAnswerResult(state) {
  if (!state.responsesEl || state.currentQuestion?.mode !== COLLECTION_MODES.WRITE_NUMBER) return;
  teardownBindings(state);
  destroyAnswerControl(state);

  const showStudentAnswer = canToggleStudentAnswerDisplay(state) && normalizeAnswerDisplayMode(state.answerDisplayMode) === "student";
  const value = showStudentAnswer ? state.studentAnswerSnapshot : state.correctionSnapshot;
  const evaluation = evaluateAnswer(state.currentQuestion, state.studentAnswerSnapshot);
  const className = [
    "collection-numeric-answer",
    "collection-numeric-answer--readonly",
    evaluation.isCorrect ? "is-correct" : "is-incorrect"
  ].filter(Boolean).join(" ");

  state.responsesEl.className = "collection-responses collection-responses--write collection-responses--write-result";
  state.responsesEl.innerHTML = `
    <div class="collection-write-answer" id="collection_write_answer">
      ${renderNumericAnswerDisplayMarkup(value, {
        className,
        ariaLabel: showStudentAnswer ? "Réponse de l’élève" : "Correction"
      })}
    </div>
    ${renderWriteKeypad({ hidden: true })}
  `;
  scheduleNumericAnswerVisualCentering(state.responsesEl);
}

function canToggleStudentAnswerDisplay(state) {
  if (!state.answerRevealed || state.currentQuestion?.mode !== COLLECTION_MODES.WRITE_NUMBER) return false;
  return String(state.studentAnswerSnapshot || "") !== String(state.correctionSnapshot || "");
}

function normalizeAnswerDisplayMode(value) {
  return String(value || "").trim().toLowerCase() === "student" ? "student" : "correction";
}

function scheduleNumericAnswerVisualCentering(root) {
  if (!root || typeof window === "undefined") return;
  const schedule = typeof window.requestAnimationFrame === "function"
    ? window.requestAnimationFrame.bind(window)
    : (callback) => window.setTimeout(callback, 0);
  const run = () => centerNumericAnswerDisplays(root);
  schedule(run);
  if (typeof document !== "undefined") {
    document.fonts?.ready?.then?.(() => schedule(run)).catch?.(() => {});
  }
}

function centerNumericAnswerDisplays(root) {
  root?.querySelectorAll?.(".collection-numeric-answer").forEach((box) => {
    centerNumericAnswerDisplay(box);
  });
}

function centerNumericAnswerDisplay(box) {
  const display = box?.querySelector?.(".tool-numeric-answer__display");
  if (!box || !display || typeof window === "undefined" || typeof document === "undefined") return;

  const computed = window.getComputedStyle(display);
  const fontSize = Number.parseFloat(computed.fontSize) || 0;
  const lineHeight = parseCssPixels(computed.lineHeight, fontSize || display.getBoundingClientRect().height || 0);
  const metrics = measureRenderedTextMetrics(display.textContent, computed);
  if (!metrics || !lineHeight) {
    box.style.setProperty("--tool-numeric-answer-display-shift-y", "0px");
    return;
  }

  const fontAscent = getFiniteMetric(metrics.fontBoundingBoxAscent, metrics.actualBoundingBoxAscent);
  const fontDescent = getFiniteMetric(metrics.fontBoundingBoxDescent, metrics.actualBoundingBoxDescent);
  const actualAscent = getFiniteMetric(metrics.actualBoundingBoxAscent, fontAscent);
  const actualDescent = getFiniteMetric(metrics.actualBoundingBoxDescent, fontDescent);
  if (!fontAscent && !fontDescent) return;

  const baselineY = (lineHeight + fontAscent - fontDescent) / 2;
  const renderedCenterY = baselineY + (actualDescent - actualAscent) / 2;
  const shiftPx = lineHeight / 2 - renderedCenterY;
  box.style.setProperty("--tool-numeric-answer-display-shift-y", `${formatCssNumber(shiftPx)}px`);
}

function measureRenderedTextMetrics(value, computedStyle) {
  const text = String(value || "").replace(/\u00a0/g, "").trim() || "0";
  const canvas = getNumericMeasureCanvas();
  if (!canvas) return null;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.font = computedStyle.font || buildCanvasFont(computedStyle);
  return context.measureText(text);
}

function getNumericMeasureCanvas() {
  if (getNumericMeasureCanvas.canvas) return getNumericMeasureCanvas.canvas;
  if (typeof document === "undefined") return null;
  getNumericMeasureCanvas.canvas = document.createElement("canvas");
  return getNumericMeasureCanvas.canvas;
}

function buildCanvasFont(style) {
  return [
    style.fontStyle || "normal",
    style.fontVariant || "normal",
    style.fontWeight || "400",
    style.fontSize || "16px",
    style.fontFamily || "sans-serif"
  ].join(" ");
}

function parseCssPixels(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getFiniteMetric(value, fallback = 0) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  const fallbackParsed = Number(fallback);
  return Number.isFinite(fallbackParsed) ? fallbackParsed : 0;
}

function updateInstruction(state) {
  if (!state.instructionEl) return;
  const defaultInstruction = getDefaultInstructionForMode(state.currentSettings?.mode || state.currentQuestion?.mode);
  setToolInstructionText(state.instructionEl, resolveToolInstructionText({
    ...state.latestContext,
    defaultInstruction
  }, defaultInstruction));
}

function renderCollectionCloud(collection = {}, { className = "collection-display", seed = "" } = {}) {
  const items = Array.isArray(collection.items) ? collection.items : [];
  const count = Number(collection.count ?? items.length) || items.length;
  const safeSeed = String(seed || `${collection.assetId || "asset"}|${count}`);
  return `
    <div class="collection-cloud ${escapeHtml(className)}" data-count="${escapeHtml(count)}">
      ${items.map((item, index) => `
        <img
          class="collection-item"
          src="${escapeHtml(item.src)}"
          alt=""
          aria-hidden="true"
          draggable="false"
          loading="eager"
          decoding="async"
          style="${escapeHtml(getCloudItemStyle({ item, index, count, seed: safeSeed }))}"
        >
      `).join("")}
    </div>
  `;
}

function revealLoadedEmojiImages(root, selector) {
  if (!root) return;
  root.querySelectorAll(selector).forEach((image) => {
    const reveal = () => image.classList.add("is-loaded");
    if (image.complete && image.naturalWidth > 0) {
      reveal();
      return;
    }
    image.addEventListener("load", reveal, { once: true });
  });
}

function teardownBindings(state) {
  state.responseAbortController?.abort?.();
  state.responseAbortController = null;
}

function destroyAnswerControl(state) {
  state.answerControl?.destroy?.();
  state.answerControl = null;
}

function teardownState(state, container) {
  teardownBindings(state);
  destroyAnswerControl(state);
  if (container) container.innerHTML = "";
  state.root = null;
  state.instructionEl = null;
  state.questionAreaEl = null;
  state.responsesEl = null;
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  if (typeof document === "undefined") return;
  ensureToolInstructionStyles();
  const href = new URL("./activity.css", import.meta.url).href;
  if (document.querySelector(`link[data-collection-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.collectionStyle = href;
  document.head.appendChild(link);
}

function getCloudItemStyle({ item, index = 0, count = 1, seed = "" } = {}) {
  const safeCount = Math.max(1, Math.floor(Number(count) || 1));
  if (safeCount === 1) {
    return "--collection-x:50%;--collection-y:50%;--collection-rotation:0deg;--collection-scale:1.08;";
  }

  const layout = getCloudLayout(safeCount);
  const slots = buildCloudSlots(layout, seed);
  const slot = slots[index % slots.length] || { x: 50, y: 50 };
  const seedBase = `${seed || item?.assetId || "asset"}|${safeCount}|${index}`;
  const jitterFactor = safeCount > 16 ? 1.4 : safeCount > 9 ? 1.9 : 2.5;
  const jitterX = (seededUnit(`x|${seedBase}`) - .5) * jitterFactor;
  const jitterY = (seededUnit(`y|${seedBase}`) - .5) * jitterFactor;
  const x = clampNumber(slot.x + jitterX, 7, 93);
  const y = clampNumber(slot.y + jitterY, 8, 92);
  const rotation = Math.round((seededUnit(`r|${seedBase}`) - .5) * 12);
  const scale = safeCount > 16 ? .96 : safeCount > 9 ? 1 : 1.04;

  return [
    `--collection-x:${formatCssNumber(x)}%`,
    `--collection-y:${formatCssNumber(y)}%`,
    `--collection-rotation:${rotation}deg`,
    `--collection-scale:${scale}`
  ].join(";") + ";";
}

function getCloudLayout(count) {
  if (count <= 2) return { cols: count, rows: 1, spanX: 34, spanY: 0 };
  if (count <= 4) return { cols: 2, rows: 2, spanX: 38, spanY: 36 };
  if (count <= 9) return { cols: 3, rows: 3, spanX: 54, spanY: 50 };
  if (count <= 16) return { cols: 4, rows: Math.ceil(count / 4), spanX: 66, spanY: 58 };
  return { cols: 5, rows: Math.ceil(count / 5), spanX: 72, spanY: 64 };
}

function buildCloudSlots(layout, seed = "") {
  const cols = Math.max(1, layout.cols);
  const rows = Math.max(1, layout.rows);
  const spanX = Number(layout.spanX) || 0;
  const spanY = Number(layout.spanY) || 0;
  const slots = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const nx = cols === 1 ? 0 : (col / (cols - 1)) * 2 - 1;
      const ny = rows === 1 ? 0 : (row / (rows - 1)) * 2 - 1;
      const rowOffset = rows > 1 && row % 2 === 1 ? (spanX / Math.max(1, cols - 1)) * .18 : 0;
      const centerPull = 1 - (Math.abs(nx) + Math.abs(ny)) * .035;
      slots.push({
        x: 50 + nx * spanX * .5 * centerPull + rowOffset,
        y: 50 + ny * spanY * .5 * centerPull
      });
    }
  }

  return slots
    .map((slot, index) => ({
      ...slot,
      order: seededUnit(`slot|${seed}|${index}`)
    }))
    .sort((a, b) => a.order - b.order);
}

function scheduleCollectionCloudOverlapCheck(root) {
  if (!root || typeof window === "undefined") return;
  const schedule = typeof window.requestAnimationFrame === "function"
    ? window.requestAnimationFrame.bind(window)
    : (callback) => window.setTimeout(callback, 0);
  schedule(() => {
    resolveCollectionCloudOverlaps(root);
    schedule(() => resolveCollectionCloudOverlaps(root));
  });
}

function resolveCollectionCloudOverlaps(root) {
  root?.querySelectorAll?.(".collection-cloud").forEach((cloud) => {
    resolveCloudOverlap(cloud);
  });
}

function resolveCloudOverlap(cloud) {
  const items = Array.from(cloud?.querySelectorAll?.(".collection-item") || []);
  if (items.length < 2) return;

  const cloudRect = cloud.getBoundingClientRect();
  if (!cloudRect.width || !cloudRect.height) return;

  const points = items.map((item) => {
    const rect = item.getBoundingClientRect();
    return {
      item,
      x: ((rect.left + rect.width / 2 - cloudRect.left) / cloudRect.width) * 100,
      y: ((rect.top + rect.height / 2 - cloudRect.top) / cloudRect.height) * 100,
      w: (rect.width / cloudRect.width) * 100,
      h: (rect.height / cloudRect.height) * 100
    };
  });

  for (let iteration = 0; iteration < 36; iteration += 1) {
    let changed = false;
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        changed = separateOverlappingPoints(points[i], points[j]) || changed;
      }
    }
    points.forEach(clampCloudPoint);
    if (!changed) break;
  }

  points.forEach(({ item, x, y }) => {
    item.style.setProperty("--collection-x", `${formatCssNumber(x)}%`);
    item.style.setProperty("--collection-y", `${formatCssNumber(y)}%`);
  });
}

function separateOverlappingPoints(a, b) {
  const margin = .7;
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if (Math.abs(dx) < .001 && Math.abs(dy) < .001) {
    dx = .01;
    dy = .01;
  }

  const overlapX = (a.w + b.w) / 2 + margin - Math.abs(dx);
  const overlapY = (a.h + b.h) / 2 + margin - Math.abs(dy);
  if (overlapX <= 0 || overlapY <= 0) return false;

  if (overlapX < overlapY) {
    const direction = dx < 0 ? -1 : 1;
    const shift = overlapX / 2;
    a.x -= direction * shift;
    b.x += direction * shift;
  } else {
    const direction = dy < 0 ? -1 : 1;
    const shift = overlapY / 2;
    a.y -= direction * shift;
    b.y += direction * shift;
  }
  return true;
}

function clampCloudPoint(point) {
  const minX = point.w / 2;
  const maxX = 100 - point.w / 2;
  const minY = point.h / 2;
  const maxY = 100 - point.h / 2;
  point.x = clampNumber(point.x, minX, maxX);
  point.y = clampNumber(point.y, minY, maxY);
}

function seededUnit(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  if (min > max) return (min + max) / 2;
  return Math.min(max, Math.max(min, n));
}

function formatCssNumber(value) {
  return String(Math.round(Number(value) * 10) / 10);
}

function renderCheckIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4.2 12.7 9.1 17.6 19.8 6.9" fill="none" stroke="#22c55e" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
}

function renderCrossIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6.2 6.2 17.8 17.8M17.8 6.2 6.2 17.8" fill="none" stroke="#ef4444" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
