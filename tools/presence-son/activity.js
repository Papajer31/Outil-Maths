import {
  ALL_TARGET_ID,
  ANSWERS,
  QUESTION_MODES,
  encodeSyllableSelection,
  normalizeSettings,
  getImageFolderName,
  setWordCatalog,
  setImageCatalog,
  pickQuestion,
  questionKey,
  evaluateAnswer
} from "./model.js";
import {
  listPublicPhonologyWords,
  listPublicImageAssetsInSystemFolder,
  getPublicImageAssetUrl
} from "../../shared/public-api.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveToolInstructionText,
  setToolInstructionText
} from "../../shared/tool-instruction.js";

const DEFAULT_INSTRUCTIONS = Object.freeze({
  [QUESTION_MODES.EXISTENCE]: "Entends-tu ce son dans le mot représenté par l’image ?",
  [QUESTION_MODES.SYLLABLE_PLACE]: "Dans quelle syllabe entends-tu ce son ?"
});
const IMAGE_BUCKET = "images";

let stylesInjected = false;
let runtimeCatalogsPromise = null;

export function createActivity(initialContext = {}) {
  const state = createRuntimeState(initialContext);

  return {
    async mount(container, context = initialContext) {
      state.container = container;
      syncRuntimeState(state, context ?? state.latestContext);
      await Promise.all([
        injectStyles(),
        ensureRuntimeCatalogs()
      ]);
      renderShell(state);
      syncValidationState(state);
    },

    async next(container, context = initialContext) {
      state.container = container || state.container;
      if (!state.container) return;

      syncRuntimeState(state, context ?? state.latestContext);
      await Promise.all([
        injectStyles(),
        ensureRuntimeCatalogs()
      ]);

      if (!state.root || !state.root.isConnected) renderShell(state);
      loadNextQuestion(state);
    },

    showAnswer(container, context = initialContext) {
      state.container = container || state.container;
      syncRuntimeState(state, context ?? state.latestContext);
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

    getShellAnswerDisplayState(container, context = state.latestContext) {
      state.container = container || state.container;
      syncRuntimeState(state, context ?? state.latestContext);
      return {
        canToggle: false,
        mode: "correction",
        transitionTargets: [state.responsesEl]
      };
    },

    setShellAnswerDisplayMode() {
      return false;
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
    settings: normalizeSettings(initialContext?.settings),
    currentQuestion: null,
    selectedAnswer: "",
    selectedSyllables: new Set(),
    submittedAnswer: "",
    answerRevealed: false,
    lastQuestionKey: "",
    responseAbortController: null
  };
}

function syncRuntimeState(state, context = state.latestContext) {
  state.latestContext = context ?? state.latestContext;
  state.settings = normalizeSettings(state.latestContext?.settings);
}

function renderShell(state) {
  if (!state.container) return;
  teardownBindings(state);

  state.container.innerHTML = `
    <div class="tool-runtime tool-runtime--collection collection-root sp-root">
      ${renderToolInstruction({ id: "sp_instruction" })}
      <div class="tool-stage tool-panel collection-panel">
        <div class="collection-question-area" id="sp_question_area"></div>
        <div class="collection-responses" id="sp_responses"></div>
      </div>
    </div>
  `;

  state.root = state.container.querySelector(".sp-root");
  state.instructionEl = state.container.querySelector("#sp_instruction");
  state.questionAreaEl = state.container.querySelector("#sp_question_area");
  state.responsesEl = state.container.querySelector("#sp_responses");

  updateInstruction(state);
  renderQuestion(state);
}

function loadNextQuestion(state) {
  const nextQuestion = pickQuestion(state.settings, {
    avoidKey: state.lastQuestionKey
  });

  if (!nextQuestion) {
    throw new Error(`Aucun mot jouable avec ces réglages et les images actuellement classées dans « ${getImageFolderName()} ».`);
  }

  state.currentQuestion = nextQuestion;
  state.lastQuestionKey = questionKey(nextQuestion);
  state.selectedAnswer = "";
  state.selectedSyllables.clear();
  state.submittedAnswer = "";
  state.answerRevealed = false;

  updateInstruction(state);
  renderQuestion(state);
  syncValidationState(state);
}

function renderQuestion(state) {
  if (!state.questionAreaEl || !state.responsesEl) return;
  teardownBindings(state);

  state.root?.classList.remove("collection-root--revealed", "collection-root--correct", "collection-root--incorrect");

  const question = state.currentQuestion;
  if (!question) {
    state.questionAreaEl.innerHTML = '<div class="tool-empty-message">L’activité va commencer.</div>';
    state.responsesEl.innerHTML = "";
    state.responsesEl.className = "collection-responses";
    return;
  }

  state.questionAreaEl.innerHTML = renderQuestionMarkup(question);
  bindImageState(state.questionAreaEl);
  scheduleTargetOpticalCentering(state.questionAreaEl);
  scheduleMainBlockCentering(state.questionAreaEl);
  renderResponses(state);
}

function renderQuestionMarkup(question) {
  const imageUrl = getPublicImageAssetUrl(question?.imageStoragePath, { bucket: IMAGE_BUCKET });
  const tokenText = String(question?.target?.bubbleText || "").trim();
  const tokenLength = Math.max(1, Array.from(tokenText).length);
  const tokenLabel = tokenText ? `Son ${tokenText}` : "Son recherché";

  return `
    <div class="collection-row collection-row--verify sp-question-row">
      <div class="collection-number sp-target" aria-label="${escapeHtml(tokenLabel)}">
        <span class="sp-target-token" data-length="${escapeHtml(tokenLength)}"><span class="sp-target-glyph">${escapeHtml(tokenText || "?")}</span></span>
      </div>
      <div class="collection-arrow sp-question-mark" aria-hidden="true">?</div>
      <div class="collection-display collection-display--prompt sp-image-host">
        <div class="sp-image-frame is-loading" data-sp-image-frame>
          <img class="sp-image" data-sp-image src="${escapeHtml(imageUrl)}" alt="" draggable="false">
          <div class="sp-image-placeholder" data-sp-image-placeholder>Image indisponible</div>
        </div>
      </div>
    </div>
  `;
}

function bindImageState(root) {
  const frame = root?.querySelector?.("[data-sp-image-frame]");
  const image = root?.querySelector?.("[data-sp-image]");
  if (!(frame instanceof HTMLElement) || !(image instanceof HTMLImageElement)) return;

  const markReady = () => {
    frame.classList.remove("is-loading", "is-error");
    frame.classList.add("is-ready");
  };
  const markError = () => {
    frame.classList.remove("is-loading", "is-ready");
    frame.classList.add("is-error");
  };

  if (!image.getAttribute("src")) {
    markError();
    return;
  }

  if (image.complete && image.naturalWidth > 0) {
    markReady();
    return;
  }

  image.addEventListener("load", markReady, { once: true });
  image.addEventListener("error", markError, { once: true });
}

function renderResponses(state) {
  if (!state.responsesEl) return;
  teardownBindings(state);

  if (state.currentQuestion?.mode === QUESTION_MODES.SYLLABLE_PLACE) {
    renderSyllableResponses(state);
    return;
  }

  renderExistenceResponses(state);
}

function renderExistenceResponses(state) {
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

  bindExistenceResponseEvents(state);
}

function renderSyllableResponses(state) {
  const syllables = Array.isArray(state.currentQuestion?.syllables) ? state.currentQuestion.syllables : [];
  const expected = new Set(Array.isArray(state.currentQuestion?.correctSyllableIndexes) ? state.currentQuestion.correctSyllableIndexes : []);
  const submitted = new Set(parseEncodedSyllableSelection(state.submittedAnswer));

  state.responsesEl.className = "collection-responses sp-syllable-responses";
  state.responsesEl.innerHTML = `
    <div class="sp-syllable-grid" role="group" aria-label="Place du son dans les syllabes">
      ${syllables.map((_, index) => {
        const selected = state.answerRevealed ? submitted.has(index) : state.selectedSyllables.has(index);
        const isExpected = expected.has(index);
        const showCorrect = state.answerRevealed && selected && isExpected;
        const showIncorrect = state.answerRevealed && selected && !isExpected;
        const showCorrection = state.answerRevealed && !selected && isExpected;
        const classes = [
          "tool-choice-button",
          "sp-syllable-button",
          selected && !state.answerRevealed ? "is-selected" : "",
          showCorrect ? "is-correct" : "",
          showIncorrect ? "is-incorrect" : "",
          showCorrection ? "is-correction tool-is-correction" : ""
        ].filter(Boolean).join(" ");
        const showCross = selected || showCorrection;
        return `
          <button
            class="${escapeHtml(classes)}"
            type="button"
            data-sp-syllable-index="${index}"
            aria-label="Syllabe ${index + 1}"
            aria-pressed="${selected ? "true" : "false"}"
            ${state.answerRevealed ? "disabled" : ""}
          >
            <span class="sp-syllable-cross${showCross ? " is-visible" : ""}" aria-hidden="true">×</span>
          </button>
        `;
      }).join("")}
    </div>
  `;

  bindSyllableResponseEvents(state);
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
    <button class="${escapeHtml(classNames)}" type="button" data-sp-answer="${escapeHtml(value)}" aria-label="${escapeHtml(ariaLabel || value)}" ${state.answerRevealed ? "disabled" : ""}>
      ${innerHtml}
    </button>
  `;
}

function bindExistenceResponseEvents(state) {
  if (!state.responsesEl || state.answerRevealed) return;
  teardownBindings(state);

  const abortController = new AbortController();
  const { signal } = abortController;
  state.responseAbortController = abortController;

  state.responsesEl.querySelectorAll("[data-sp-answer]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.answerRevealed) return;
      state.selectedAnswer = String(button.dataset.spAnswer || "");
      updateChoiceSelection(state);
      requestReveal(state);
    }, { signal });
  });
}

function bindSyllableResponseEvents(state) {
  if (!state.responsesEl || state.answerRevealed) return;
  teardownBindings(state);

  const abortController = new AbortController();
  const { signal } = abortController;
  state.responseAbortController = abortController;

  state.responsesEl.querySelectorAll("[data-sp-syllable-index]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.answerRevealed) return;
      const index = Number(button.dataset.spSyllableIndex);
      if (!Number.isInteger(index) || index < 0) return;
      if (state.selectedSyllables.has(index)) state.selectedSyllables.delete(index);
      else state.selectedSyllables.add(index);
      state.selectedAnswer = encodeSyllableSelection(state.selectedSyllables);
      updateSyllableSelection(state);
      syncValidationState(state);
    }, { signal });
  });
}

function updateSyllableSelection(state) {
  state.responsesEl?.querySelectorAll("[data-sp-syllable-index]").forEach((button) => {
    const index = Number(button.dataset.spSyllableIndex);
    const selected = Number.isInteger(index) && state.selectedSyllables.has(index);
    button.classList.toggle("is-selected", selected && !state.answerRevealed);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    button.querySelector(".sp-syllable-cross")?.classList.toggle("is-visible", selected);
  });
}

function parseEncodedSyllableSelection(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0);
}

function updateChoiceSelection(state) {
  state.responsesEl?.querySelectorAll("[data-sp-answer]").forEach((button) => {
    const selected = String(button.dataset.spAnswer || "") === String(state.selectedAnswer || "");
    button.classList.toggle("is-selected", selected && !state.answerRevealed);
  });
}

function requestReveal(state) {
  if (!state.currentQuestion || !state.selectedAnswer) return;
  const wasCorrect = evaluateAnswer(state.currentQuestion, state.selectedAnswer).isCorrect;
  const requested = state.latestContext?.services?.requestAnswerPhase?.({
    manual: false,
    showAnswerNow: true,
    wasCorrect,
    skipValidationReview: true
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

  renderResponses(state);
  syncValidationState(state);
}

function canValidate(state) {
  return !state.answerRevealed && !!state.selectedAnswer;
}

function syncValidationState(state) {
  state.latestContext?.services?.notifyValidationStateChanged?.();
}

function updateInstruction(state) {
  if (!state.instructionEl) return;
  const mode = state.currentQuestion?.mode || state.settings?.questionMode || QUESTION_MODES.EXISTENCE;
  const defaultInstruction = DEFAULT_INSTRUCTIONS[mode] || DEFAULT_INSTRUCTIONS[QUESTION_MODES.EXISTENCE];
  setToolInstructionText(state.instructionEl, resolveToolInstructionText({
    ...state.latestContext,
    defaultInstruction
  }, defaultInstruction));
}

function scheduleTargetOpticalCentering(root) {
  if (!root || typeof window === "undefined") return;
  const schedule = typeof window.requestAnimationFrame === "function"
    ? window.requestAnimationFrame.bind(window)
    : (callback) => window.setTimeout(callback, 0);
  const run = () => centerTargetGlyph(root.querySelector?.(".sp-target-token"));
  schedule(run);
  if (typeof document !== "undefined") {
    document.fonts?.ready?.then?.(() => schedule(run)).catch?.(() => {});
  }
}

function centerTargetGlyph(token) {
  if (!(token instanceof HTMLElement) || typeof window === "undefined" || typeof document === "undefined") return;
  const glyph = token.querySelector(".sp-target-glyph");
  if (!(glyph instanceof HTMLElement)) return;
  const text = String(glyph.textContent || "").trim();
  if (!text) return;

  const computed = window.getComputedStyle(glyph);
  const fontSize = Number.parseFloat(computed.fontSize) || 0;
  const lineHeight = parseCssPixels(computed.lineHeight, fontSize || glyph.getBoundingClientRect().height || 0);
  const metrics = measureTargetText(text, computed);
  if (!metrics || !lineHeight) return;

  const fontAscent = getFiniteMetric(metrics.fontBoundingBoxAscent, metrics.actualBoundingBoxAscent);
  const fontDescent = getFiniteMetric(metrics.fontBoundingBoxDescent, metrics.actualBoundingBoxDescent);
  const actualAscent = getFiniteMetric(metrics.actualBoundingBoxAscent, fontAscent);
  const actualDescent = getFiniteMetric(metrics.actualBoundingBoxDescent, fontDescent);
  const advanceWidth = getFiniteMetric(metrics.width, 0);
  const actualLeft = -getFiniteMetric(metrics.actualBoundingBoxLeft, 0);
  const actualRight = getFiniteMetric(metrics.actualBoundingBoxRight, advanceWidth);

  const baselineY = (lineHeight + fontAscent - fontDescent) / 2;
  const renderedCenterY = baselineY + (actualDescent - actualAscent) / 2;
  const shiftY = lineHeight / 2 - renderedCenterY;
  const renderedCenterX = (actualLeft + actualRight) / 2;
  const shiftX = advanceWidth / 2 - renderedCenterX;

  glyph.style.setProperty("--sp-target-shift-x", `${formatCssNumber(shiftX)}px`);
  glyph.style.setProperty("--sp-target-shift-y", `${formatCssNumber(shiftY)}px`);
}

function scheduleMainBlockCentering(root) {
  if (!root || typeof window === "undefined") return;
  const schedule = typeof window.requestAnimationFrame === "function"
    ? window.requestAnimationFrame.bind(window)
    : (callback) => window.setTimeout(callback, 0);
  const run = () => centerMainQuestionBlock(root);
  schedule(() => schedule(run));
  if (typeof document !== "undefined") {
    document.fonts?.ready?.then?.(() => schedule(run)).catch?.(() => {});
  }
}

function centerMainQuestionBlock(root) {
  const row = root?.querySelector?.(".sp-question-row");
  const target = root?.querySelector?.(".sp-target-token");
  const mark = root?.querySelector?.(".sp-question-mark");
  const image = root?.querySelector?.(".sp-image-frame");
  if (!(row instanceof HTMLElement) || !(target instanceof HTMLElement) || !(mark instanceof HTMLElement) || !(image instanceof HTMLElement)) return;

  row.style.setProperty("--sp-main-shift-x", "0px");
  const targetRect = target.getBoundingClientRect();
  const markRect = mark.getBoundingClientRect();
  const imageRect = image.getBoundingClientRect();
  const hostRect = root.getBoundingClientRect();
  const left = Math.min(targetRect.left, markRect.left, imageRect.left);
  const right = Math.max(targetRect.right, markRect.right, imageRect.right);
  const blockCenter = (left + right) / 2;
  const hostCenter = (hostRect.left + hostRect.right) / 2;
  const shiftX = hostCenter - blockCenter;

  row.style.setProperty("--sp-main-shift-x", `${formatCssNumber(shiftX)}px`);
}

function measureTargetText(text, computedStyle) {
  const canvas = getTargetMeasureCanvas();
  if (!canvas) return null;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.font = computedStyle.font || buildCanvasFont(computedStyle);
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  return context.measureText(text);
}

function getTargetMeasureCanvas() {
  if (getTargetMeasureCanvas.canvas) return getTargetMeasureCanvas.canvas;
  if (typeof document === "undefined") return null;
  getTargetMeasureCanvas.canvas = document.createElement("canvas");
  return getTargetMeasureCanvas.canvas;
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

function formatCssNumber(value) {
  return String(Math.round(Number(value) * 10) / 10);
}

function teardownBindings(state) {
  state.responseAbortController?.abort?.();
  state.responseAbortController = null;
}

function teardownState(state, container) {
  teardownBindings(state);
  if (container) container.innerHTML = "";
  state.root = null;
  state.instructionEl = null;
  state.questionAreaEl = null;
  state.responsesEl = null;
}

async function ensureRuntimeCatalogs() {
  if (!runtimeCatalogsPromise) {
    runtimeCatalogsPromise = Promise.all([
      listPublicPhonologyWords(),
      listPublicImageAssetsInSystemFolder(getImageFolderName())
    ])
      .then(([words, images]) => {
        setWordCatalog(Array.isArray(words) ? words : []);
        setImageCatalog(Array.isArray(images) ? images : []);
        return { words, images };
      })
      .catch((error) => {
        runtimeCatalogsPromise = null;
        setWordCatalog([]);
        setImageCatalog([]);
        throw error;
      });
  }

  return await runtimeCatalogsPromise;
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  if (typeof document === "undefined") return;
  ensureToolInstructionStyles();
  const href = new URL("./activity.css", import.meta.url).href;
  if (document.querySelector(`link[data-sp-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.spStyle = href;
  document.head.appendChild(link);
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
