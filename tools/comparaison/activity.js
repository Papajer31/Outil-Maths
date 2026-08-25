import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveToolInstructionText,
  setToolInstructionText
} from "../../shared/tool-instruction.js";
import { createNumericAnswerControl, renderNumericAnswerDisplayMarkup } from "../../shared/tool-ui/numeric-answer.js";
import { bindNumericKeypadEvents, renderNumericKeypad } from "../../shared/tool-ui/numeric-keypad.js";
import { clientPointToLocalPoint, isClientPointInsideElement } from "../../shared/tool-ui/drag-core.js";
import {
  LIMITS,
  TOKEN_MODES,
  TRACE_MODES,
  evaluateAnswer,
  getDefaultInstruction,
  normalizeSettings,
  pickQuestion,
  questionKey
} from "./model.js";

const TECHNICAL_CHARACTER_URLS = Object.freeze({
  "images-comparaison-minibille": new URL("../../shared/tool-assets/personnages/Minibille.webp", import.meta.url).href,
  "images-comparaison-maxibille": new URL("../../shared/tool-assets/personnages/Maxibille.webp", import.meta.url).href,
  "images-personnages-mathieu": new URL("../../shared/tool-assets/personnages/Mathieu.webp", import.meta.url).href,
  "images-personnages-mathilde": new URL("../../shared/tool-assets/personnages/Mathilde.webp", import.meta.url).href
});

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
      const transitionTargets = state.currentQuestion?.tokenMode === TOKEN_MODES.COMPLETE
        ? [
          ...(state.workspaceEl?.querySelectorAll?.(".comparaison-collection-side") || []),
          state.responsesEl
        ]
        : [state.responsesEl];
      return {
        canToggle: canToggleStudentAnswerDisplay(state),
        mode: canToggleStudentAnswerDisplay(state) ? normalizeAnswerDisplayMode(state.answerDisplayMode) : "correction",
        transitionTargets: transitionTargets.filter(Boolean)
      };
    },

    setShellAnswerDisplayMode(container, context = state.latestContext, mode = "correction") {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      syncRuntimeState(state, state.latestContext);
      if (!canToggleStudentAnswerDisplay(state)) return false;
      const nextMode = normalizeAnswerDisplayMode(mode);
      if (nextMode === state.answerDisplayMode) return true;
      state.answerDisplayMode = nextMode;
      if (state.currentQuestion?.tokenMode === TOKEN_MODES.COMPLETE) {
        updateReviewedCollectionLines(state, nextMode);
      }
      renderAnswerResult(state);
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
        ? evaluateCurrentResponse(state, state.submittedAnswer, state.studentPlacedTokensSnapshot)
        : evaluateCurrentResponse(state, state.selectedAnswer, state.placedTokens);
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
    workspaceEl: null,
    responsesEl: null,
    sceneEl: null,
    canvas: null,
    canvasContext: null,
    assistedRemainderSvg: null,
    assistedRemainderKey: "",
    resizeObserver: null,
    correctionCanvas: null,
    correctionCanvasContext: null,
    correctionRemainderSvg: null,
    correctionRemainderKey: "",
    correctionResizeObserver: null,
    currentQuestion: null,
    lastQuestionKey: "",
    answerRevealed: false,
    selectedAnswer: "",
    submittedAnswer: "",
    answerDisplayMode: "correction",
    studentAnswerSnapshot: "",
    correctionSnapshot: "",
    studentPlacedTokensSnapshot: createEmptyPlacedTokens(),
    currentSettings: normalizeSettings(initialContext?.settings),
    responseAbortController: null,
    drawingAbortController: null,
    placementAbortController: null,
    answerControl: null,
    placedTokens: createEmptyPlacedTokens(),
    nextPlacedTokenId: 1,
    activeTokenDrag: null,
    activeTokenTap: null,
    strokes: [],
    assistedLinks: [],
    activeAssistedLink: null,
    activeStroke: null,
    activePointerId: null
  };
}

function syncRuntimeState(state, context = state.latestContext) {
  state.currentSettings = normalizeSettings(context?.settings || state.currentSettings || {});
}

function renderShell(state) {
  const container = state.container;
  if (!container) return;
  teardownBindings(state);
  teardownDrawing(state);
  teardownCorrection(state);
  teardownPlacement(state);
  destroyAnswerControl(state);

  container.innerHTML = `
    <div class="tool-runtime tool-runtime--comparaison comparaison-root" id="comparaison_root">
      ${renderToolInstruction({ id: "comparaison_instruction" })}
      <div class="tool-stage tool-panel comparaison-panel">
        <div class="comparaison-workspace" id="comparaison_workspace" aria-live="polite"></div>
        <div class="comparaison-responses" id="comparaison_responses"></div>
      </div>
    </div>
  `;

  state.root = container.querySelector("#comparaison_root");
  state.instructionEl = container.querySelector("#comparaison_instruction");
  state.workspaceEl = container.querySelector("#comparaison_workspace");
  state.responsesEl = container.querySelector("#comparaison_responses");
  updateInstruction(state);
}

async function loadNextQuestion(state) {
  state.answerRevealed = false;
  state.selectedAnswer = "";
  state.submittedAnswer = "";
  state.answerDisplayMode = "correction";
  state.studentAnswerSnapshot = "";
  state.correctionSnapshot = "";
  state.studentPlacedTokensSnapshot = createEmptyPlacedTokens();
  state.strokes = [];
  state.assistedLinks = [];
  state.assistedRemainderKey = "";
  state.activeAssistedLink = null;
  state.activeStroke = null;
  state.activePointerId = null;
  state.placedTokens = createEmptyPlacedTokens();
  state.nextPlacedTokenId = 1;
  state.activeTokenDrag = null;
  state.activeTokenTap = null;
  state.root?.classList.remove("comparaison-root--correct", "comparaison-root--incorrect", "comparaison-root--revealed");
  teardownCorrection(state);
  teardownPlacement(state);
  destroyAnswerControl(state);

  state.currentQuestion = pickQuestion(state.currentSettings, {
    avoidKey: state.lastQuestionKey
  });
  state.lastQuestionKey = questionKey(state.currentQuestion || {});

  renderQuestion(state);
  syncValidateState(state);
}

function renderQuestion(state) {
  updateInstruction(state);
  if (!state.currentQuestion) {
    renderEmptyState(state);
    return;
  }

  const question = state.currentQuestion;
  state.root?.setAttribute("data-token-mode", question.tokenMode || TOKEN_MODES.DISPLAYED);
  state.root?.setAttribute("data-trace-mode", question.traceMode || TRACE_MODES.FREE);

  if (state.workspaceEl) {
    state.workspaceEl.innerHTML = renderWorkspaceMarkup(state, question);
    state.sceneEl = state.workspaceEl.querySelector(".comparaison-scene");
  } else {
    state.sceneEl = null;
  }

  renderNumericInput(state);
  setupDrawingLayer(state);
  setupTokenPlacement(state);
}

function renderWorkspaceMarkup(state, question, { correction = false, answerMode = "" } = {}) {
  const normalizedAnswerMode = normalizeAnswerDisplayMode(answerMode);
  const isCompleteReview = question.tokenMode === TOKEN_MODES.COMPLETE && !!answerMode;
  const isStudentReview = isCompleteReview && normalizedAnswerMode === "student";
  const isCorrectionReview = isCompleteReview && normalizedAnswerMode === "correction";
  const tokenMode = isCompleteReview
    ? TOKEN_MODES.COMPLETE
    : correction ? TOKEN_MODES.DISPLAYED : (question.tokenMode || TOKEN_MODES.DISPLAYED);
  const traceEnabled = (isStudentReview || (!correction && !answerMode))
    && tokenMode !== TOKEN_MODES.NONE
    && (question.traceMode === TRACE_MODES.FREE || question.traceMode === TRACE_MODES.ASSISTED);
  const bigGroupGaps = Math.max(0, Math.floor((Number(question.bigCount) - 1) / 5));
  const groupsBeforeRemainder = Math.max(0, Math.floor(Number(question.smallCount) / 5));
  const groupsInsideRemainder = countGroupBreaksBetween(Number(question.smallCount), Number(question.bigCount));

  return `
    <div class="comparaison-scene${correction || isCorrectionReview ? " comparaison-scene--correction" : ""}${isStudentReview ? " comparaison-scene--student-review" : ""}" style="--comparaison-big-count:${escapeHtml(question.bigCount)};--comparaison-small-count:${escapeHtml(question.smallCount)};--comparaison-diff:${escapeHtml(question.difference)};--comparaison-big-group-gaps:${escapeHtml(bigGroupGaps)};--comparaison-groups-before-remainder:${escapeHtml(groupsBeforeRemainder)};--comparaison-groups-inside-remainder:${escapeHtml(groupsInsideRemainder)};">
      ${correction || answerMode ? "" : renderSideControls(question, { traceEnabled })}
      <div class="comparaison-rows">
        ${renderCharacterRow(state, question, {
          role: "big",
          name: question.bigName,
          count: question.bigCount,
          assetId: question.bigAssetId,
          tokenCount: question.bigCount,
          tokenMode,
          answerMode: isCompleteReview ? normalizedAnswerMode : ""
        })}
        ${renderCharacterRow(state, question, {
          role: "small",
          name: question.smallName,
          count: question.smallCount,
          assetId: question.smallAssetId,
          tokenCount: question.smallCount,
          tokenMode,
          answerMode: isCompleteReview ? normalizedAnswerMode : ""
        })}
      </div>
      ${traceEnabled ? '<canvas class="comparaison-drawing-canvas" id="comparaison_drawing_canvas" aria-label="Zone de tracé libre"></canvas>' : ""}
      ${traceEnabled && question.traceMode === TRACE_MODES.ASSISTED ? '<svg class="comparaison-assisted-remainder-svg" id="comparaison_assisted_remainder_svg" aria-hidden="true" focusable="false"></svg>' : ""}
      ${correction || isCorrectionReview ? '<canvas class="comparaison-correction-canvas" id="comparaison_correction_canvas" aria-hidden="true"></canvas><svg class="comparaison-correction-remainder-svg" id="comparaison_correction_remainder_svg" aria-hidden="true" focusable="false"></svg>' : ""}
    </div>
  `;
}

function renderCharacterRow(state, question, { role, name, count, assetId, tokenCount, tokenMode, answerMode = "" }) {
  const placedTokens = answerMode
    ? state.studentPlacedTokensSnapshot?.[role] || []
    : state.placedTokens?.[role] || [];
  return `
    <div class="comparaison-row comparaison-row--${escapeHtml(role)}">
      <div class="comparaison-character-side">
        ${renderSpeechBubble({ name, count })}
        ${renderCharacter(state, { name, assetId, role })}
      </div>
      <div class="comparaison-collection-side">
        ${answerMode
          ? renderReviewedCollectionLine({ role, expectedCount: tokenCount, placedTokens, answerMode })
          : renderCollectionLine({ role, tokenCount, tokenMode, placedTokens })}
      </div>
    </div>
  `;
}

function renderReviewedCollectionLine({ role, expectedCount, placedTokens = [], answerMode = "student" }) {
  const tokens = Array.isArray(placedTokens) ? placedTokens : [];
  const submittedCount = tokens.length;
  const targetCount = Math.max(0, Math.floor(Number(expectedCount) || 0));
  const isStudent = normalizeAnswerDisplayMode(answerMode) === "student";
  const lineCount = isStudent ? Math.max(1, submittedCount, targetCount) : Math.max(1, targetCount);
  const lineGroupGaps = Math.max(0, Math.floor((lineCount - 1) / 5));
  const items = [];

  if (isStudent) {
    for (let index = 0; index < submittedCount; index += 1) {
      const token = tokens[index];
      const extraClass = index >= targetCount ? " comparaison-token--feedback-error" : "";
      items.push(renderToken({
        role,
        index,
        targetCount: lineCount,
        placed: true,
        tokenId: token?.id || `${role}-placed-${index}`,
        extraClass
      }));
    }
    for (let index = submittedCount; index < targetCount; index += 1) {
      items.push(renderMissingTokenFeedback({ role, index, targetCount: lineCount }));
    }
  } else {
    for (let index = 0; index < targetCount; index += 1) {
      const correctionClass = index >= submittedCount ? " comparaison-token--feedback-correction" : "";
      items.push(renderToken({
        role,
        index,
        targetCount: lineCount,
        tokenId: `${role}-${index}`,
        extraClass: correctionClass
      }));
    }
  }

  return `
    <div class="comparaison-token-line comparaison-token-line--${escapeHtml(role)} comparaison-token-line--complete comparaison-token-line--review" style="--comparaison-line-count:${escapeHtml(lineCount)};--comparaison-line-group-gaps:${escapeHtml(lineGroupGaps)};" data-comparaison-token-line="${escapeHtml(role)}" aria-label="${isStudent ? "Réponse de l’élève" : "Correction"} : ${escapeHtml(isStudent ? submittedCount : targetCount)} jetons">
      ${items.join("")}
    </div>
  `;
}

function renderMissingTokenFeedback({ role, index, targetCount }) {
  return `<span class="comparaison-token comparaison-token--missing comparaison-token--feedback-error${isGroupEnd(index, targetCount) ? " comparaison-token--group-end" : ""}" data-token-role="${escapeHtml(role)}" data-token-index="${escapeHtml(index)}" aria-label="Jeton manquant"></span>`;
}

function renderSpeechBubble({ name, count }) {
  return `
    <div class="comparaison-speech" aria-label="${escapeHtml(name)} dit : J’ai ${escapeHtml(count)} jetons.">
      <span>J’ai</span>
      <strong>${escapeHtml(count)}</strong>
      <span>jetons.</span>
    </div>
  `;
}

function renderSideControls(question, { traceEnabled = false } = {}) {
  const hasReserve = question?.tokenMode === TOKEN_MODES.COMPLETE;
  if (!hasReserve && !traceEnabled) return "";

  return `
    <div class="comparaison-side-controls">
      ${hasReserve ? renderTokenReserveButton() : ""}
      ${traceEnabled ? renderClearTracesButton() : ""}
    </div>
  `;
}

function renderTokenReserveButton() {
  return `
    <div class="comparaison-token-reserve" data-comparaison-token-reserve aria-label="Prendre un jeton" title="Prendre un jeton">
      <svg class="comparaison-token-reserve-svg" viewBox="0 0 150 118" aria-hidden="true" focusable="false">
        <path d="M18 48h114l-13 54H32L18 48Z" fill="rgba(255,255,255,.13)" stroke="rgba(255,255,255,.62)" stroke-width="6" stroke-linejoin="round"/>
        <path d="M30 47c10-19 90-19 100 0" fill="none" stroke="rgba(255,255,255,.58)" stroke-width="6" stroke-linecap="round"/>
        <circle cx="52" cy="48" r="15" fill="#4b82df" stroke="#1f4ec7" stroke-width="5"/>
        <circle cx="76" cy="38" r="15" fill="#4b82df" stroke="#1f4ec7" stroke-width="5"/>
        <circle cx="100" cy="51" r="15" fill="#4b82df" stroke="#1f4ec7" stroke-width="5"/>
        <circle cx="68" cy="65" r="15" fill="#4b82df" stroke="#1f4ec7" stroke-width="5"/>
      </svg>
    </div>
  `;
}

function renderClearTracesButton() {
  return `
    <button class="tool-choice-button comparaison-clear-traces" type="button" data-comparaison-clear-traces aria-label="Effacer les tracés" title="Effacer les tracés">
      ${renderEraserIcon()}
    </button>
  `;
}

function renderCharacter(state, { name, assetId, role }) {
  const assetUrl = assetId ? TECHNICAL_CHARACTER_URLS[assetId] : "";
  if (assetUrl) {
    return `
      <img class="comparaison-character comparaison-character--${escapeHtml(role)}" src="${escapeHtml(assetUrl)}" alt="${escapeHtml(name)}" draggable="false" loading="eager" decoding="async">
    `;
  }

  return `
    <div class="comparaison-character comparaison-character--placeholder comparaison-character--${escapeHtml(role)}" aria-label="${escapeHtml(name)}">
      <span>${escapeHtml(getInitials(name))}</span>
    </div>
  `;
}

function renderCollectionLine({ role, tokenCount, tokenMode, placedTokens = [] }) {
  if (tokenMode === TOKEN_MODES.NONE) return "";

  if (tokenMode === TOKEN_MODES.COMPLETE) {
    const safePlacedTokens = Array.isArray(placedTokens) ? placedTokens.slice(0, LIMITS.maxCount) : [];
    const safePlacedCount = safePlacedTokens.length;
    const canAddToken = safePlacedCount < LIMITS.maxCount;
    const lineCount = Math.max(1, safePlacedCount + (canAddToken ? 1 : 0));
    const lineGroupGaps = Math.max(0, Math.floor((lineCount - 1) / 5));
    const items = renderPlacedTokens({ role, lineCount, placedTokens: safePlacedTokens });
    const nextSpot = canAddToken ? renderNextSpot({ role, index: safePlacedCount, lineCount }) : "";

    return `
      <div class="comparaison-token-line comparaison-token-line--${escapeHtml(role)} comparaison-token-line--complete" style="--comparaison-line-count:${escapeHtml(lineCount)};--comparaison-line-group-gaps:${escapeHtml(lineGroupGaps)};" data-comparaison-token-line="${escapeHtml(role)}" aria-label="Collection à compléter : ${escapeHtml(tokenCount)} jetons">
        ${items}
        ${nextSpot}
      </div>
    `;
  }

  const items = Array.from({ length: tokenCount }, (_, index) => renderToken({
    role,
    index,
    targetCount: tokenCount,
    tokenId: `${role}-${index}`
  })).join("");
  const remainder = role === "big"
    ? '<div class="comparaison-remainder-frame" aria-hidden="true"></div>'
    : "";

  return `
    <div class="comparaison-token-line comparaison-token-line--${escapeHtml(role)}" data-comparaison-token-line="${escapeHtml(role)}" aria-label="${escapeHtml(tokenCount)} jetons">
      ${items}
      ${remainder}
    </div>
  `;
}

function renderPlacedTokens({ role, lineCount, placedTokens }) {
  const tokens = Array.isArray(placedTokens) ? placedTokens : [];
  return tokens.map((token, index) => renderToken({
    role,
    index,
    targetCount: lineCount,
    placed: true,
    tokenId: token?.id || `${role}-placed-${index}`
  })).join("");
}

function renderNextSpot({ role, index, lineCount }) {
  return `
    <span class="comparaison-token-next-spot${isGroupEnd(index, lineCount) ? " comparaison-token--group-end" : ""}" data-comparaison-next-spot="${escapeHtml(role)}" data-token-role="${escapeHtml(role)}" data-token-index="${escapeHtml(index)}" aria-hidden="true"></span>
  `;
}

function renderToken({ role, index, targetCount = 0, placed = false, tokenId = "", extraClass = "" }) {
  const id = tokenId || `${role}-${index}`;
  return `
    <span class="comparaison-token comparaison-token--${escapeHtml(role)}${placed ? " comparaison-token--placed" : ""}${extraClass}${isGroupEnd(index, targetCount) ? " comparaison-token--group-end" : ""}" data-token-role="${escapeHtml(role)}" data-token-index="${escapeHtml(index)}" data-token-id="${escapeHtml(id)}" aria-label="Jeton ${escapeHtml(index + 1)}"></span>
  `;
}

function isGroupEnd(index, targetCount) {
  return (Number(index) + 1) % 5 === 0 && (Number(index) + 1) < Number(targetCount);
}

function renderEmptyState(state) {
  state.sceneEl = null;
  if (state.workspaceEl) {
    state.workspaceEl.innerHTML = `<div class="tool-empty-message">Impossible de générer une comparaison avec ces bornes.</div>`;
  }
  if (state.responsesEl) state.responsesEl.innerHTML = "";
}

function renderNumericInput(state) {
  if (!state.responsesEl || !state.currentQuestion) return;
  teardownBindings(state);
  destroyAnswerControl(state);

  state.responsesEl.className = "comparaison-responses comparaison-responses--write";
  state.responsesEl.innerHTML = `
    <div class="comparaison-answer-area">
      <div class="comparaison-write-answer" id="comparaison_write_answer"></div>
    </div>
    ${renderNumericKeypad({
      rootClassName: "comparaison-keypad",
      buttonClassName: "comparaison-keypad-button",
      clearButtonClassName: "comparaison-keypad-button--clear",
      dataAttribute: "data-comparaison-key"
    })}
  `;

  const host = state.responsesEl.querySelector("#comparaison_write_answer");
  state.answerControl = createNumericAnswerControl({
    id: "comparaison_numeric_answer",
    className: "comparaison-numeric-answer",
    ariaLabel: "Réponse",
    maxLength: String(state.currentQuestion.correctAnswer || "").length,
    captureRoot: state.root,
    onInput: (value) => {
      if (state.answerRevealed) return;
      state.selectedAnswer = String(value || "");
      syncValidateState(state);
    },
    onSubmit: () => {
      if (!state.answerRevealed && state.selectedAnswer) requestReveal(state);
    }
  });
  host?.appendChild(state.answerControl.element);

  const abortController = new AbortController();
  const { signal } = abortController;
  state.responseAbortController = abortController;
  bindNumericKeypadEvents({
    root: state.responsesEl,
    control: state.answerControl,
    signal,
    dataAttribute: "data-comparaison-key"
  });
  state.answerControl.focus?.();
}

function setupDrawingLayer(state) {
  teardownDrawing(state);
  state.canvas = state.workspaceEl?.querySelector?.("#comparaison_drawing_canvas") || null;
  state.assistedRemainderSvg = state.workspaceEl?.querySelector?.("#comparaison_assisted_remainder_svg") || null;
  if (!state.canvas || !canDraw(state)) return;

  state.canvasContext = state.canvas.getContext("2d");
  const abortController = new AbortController();
  const { signal } = abortController;
  state.drawingAbortController = abortController;

  syncCanvasSize(state);
  state.resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => syncCanvasSize(state)) : null;
  state.resizeObserver?.observe?.(state.canvas);

  state.canvas.addEventListener("pointerdown", (event) => beginStroke(state, event), { signal });
  state.canvas.addEventListener("pointermove", (event) => extendStroke(state, event), { signal });
  state.canvas.addEventListener("pointerup", (event) => endStroke(state, event), { signal });
  state.canvas.addEventListener("pointercancel", (event) => endStroke(state, event), { signal });

  state.workspaceEl?.querySelector("[data-comparaison-clear-traces]")?.addEventListener("click", () => {
    clearTraces(state);
    state.answerControl?.focus?.();
  }, { signal });
}

function beginStroke(state, event) {
  if (!canDraw(state) || state.activeStroke || state.activeAssistedLink || state.activeTokenTap) return;
  event.preventDefault();
  state.canvas.setPointerCapture?.(event.pointerId);
  state.activePointerId = event.pointerId;

  if (state.currentQuestion?.traceMode === TRACE_MODES.ASSISTED) {
    beginAssistedTrace(state, event);
    return;
  }

  const point = getCanvasPoint(state.canvas, event);
  const tokenHit = getPlacedTokenHit(state, event);
  if (tokenHit) {
    state.activeTokenTap = {
      pointerId: event.pointerId,
      role: tokenHit.role,
      tokenId: tokenHit.tokenId,
      startPoint: point
    };
    return;
  }
  state.activeStroke = [point];
  redrawCanvas(state);
}

function extendStroke(state, event) {
  if (state.currentQuestion?.traceMode === TRACE_MODES.ASSISTED) {
    extendAssistedTrace(state, event);
    return;
  }

  if (state.activeTokenTap && event.pointerId === state.activeTokenTap.pointerId) {
    event.preventDefault();
    const point = getCanvasPoint(state.canvas, event);
    if (distance(state.activeTokenTap.startPoint, point) < 10) return;
    state.activeStroke = [state.activeTokenTap.startPoint, point];
    state.activeTokenTap = null;
    redrawCanvas(state);
    return;
  }

  if (!state.activeStroke || event.pointerId !== state.activePointerId) return;
  event.preventDefault();
  const point = getCanvasPoint(state.canvas, event);
  const previous = state.activeStroke[state.activeStroke.length - 1];
  if (previous && distance(previous, point) < 2) return;
  state.activeStroke.push(point);
  redrawCanvas(state);
}

function endStroke(state, event) {
  if (state.currentQuestion?.traceMode === TRACE_MODES.ASSISTED) {
    endAssistedTrace(state, event);
    return;
  }

  if (state.activeTokenTap && event.pointerId === state.activeTokenTap.pointerId) {
    event.preventDefault();
    const role = state.activeTokenTap.role;
    const tokenId = state.activeTokenTap.tokenId;
    state.canvas.releasePointerCapture?.(event.pointerId);
    state.activeTokenTap = null;
    state.activePointerId = null;
    removePlacedToken(state, role, tokenId);
    return;
  }

  if (!state.activeStroke || event.pointerId !== state.activePointerId) return;
  event.preventDefault();
  if (state.activeStroke.length > 1) {
    state.strokes.push(state.activeStroke);
  }
  state.canvas.releasePointerCapture?.(event.pointerId);
  state.activeStroke = null;
  state.activePointerId = null;
  clearAssistedRemainderCapsules(state);
  redrawCanvas(state);
}

function beginAssistedTrace(state, event) {
  const tokenHit = getTraceTokenHit(state, event);
  if (!tokenHit) {
    state.canvas.releasePointerCapture?.(event.pointerId);
    state.activePointerId = null;
    return;
  }

  const startPoint = getTokenCenterOnCanvas(state, tokenHit.element);
  state.activeAssistedLink = {
    pointerId: event.pointerId,
    start: tokenHit,
    startPoint,
    currentPoint: startPoint,
    hasMoved: false
  };

  if (state.currentQuestion?.tokenMode === TOKEN_MODES.COMPLETE) {
    state.activeTokenTap = {
      pointerId: event.pointerId,
      role: tokenHit.role,
      tokenId: tokenHit.tokenId,
      startPoint
    };
  }
  redrawCanvas(state);
}

function extendAssistedTrace(state, event) {
  if (!state.activeAssistedLink || event.pointerId !== state.activeAssistedLink.pointerId) return;
  event.preventDefault();
  const point = getCanvasPoint(state.canvas, event);
  if (distance(state.activeAssistedLink.startPoint, point) >= 10) {
    state.activeAssistedLink.hasMoved = true;
    state.activeTokenTap = null;
  }
  state.activeAssistedLink.currentPoint = point;
  redrawCanvas(state);
}

function endAssistedTrace(state, event) {
  if (state.activeTokenTap && event.pointerId === state.activeTokenTap.pointerId) {
    event.preventDefault();
    const { role, tokenId } = state.activeTokenTap;
    state.canvas.releasePointerCapture?.(event.pointerId);
    state.activeTokenTap = null;
    state.activeAssistedLink = null;
    state.activePointerId = null;
    removePlacedToken(state, role, tokenId);
    return;
  }

  if (!state.activeAssistedLink || event.pointerId !== state.activeAssistedLink.pointerId) return;
  event.preventDefault();
  const active = state.activeAssistedLink;
  if (active.hasMoved) {
    const target = getTraceTokenHit(state, event);
    if (isValidAssistedLink(state, active.start, target)) {
      addAssistedLink(state, active.start, target);
    }
  }
  state.canvas.releasePointerCapture?.(event.pointerId);
  state.activeAssistedLink = null;
  state.activePointerId = null;
  redrawCanvas(state);
}

function canDraw(state) {
  const question = state.currentQuestion;
  if (!question || state.answerRevealed) return false;
  return question.tokenMode !== TOKEN_MODES.NONE
    && (question.traceMode === TRACE_MODES.FREE || question.traceMode === TRACE_MODES.ASSISTED);
}

function clearTraces(state) {
  state.strokes = [];
  state.assistedLinks = [];
  state.activeStroke = null;
  state.activeAssistedLink = null;
  state.activePointerId = null;
  redrawCanvas(state);
}

function syncCanvasSize(state) {
  const canvas = state.canvas;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  redrawCanvas(state);
}

function redrawCanvas(state) {
  const canvas = state.canvas;
  const context = state.canvasContext;
  if (!canvas || !context) return;

  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  context.lineCap = "round";
  context.lineJoin = "round";

  if (state.currentQuestion?.traceMode === TRACE_MODES.ASSISTED) {
    drawAssistedLinks(context, state, rect);
    updateAssistedRemainderCapsules(state);
    return;
  }

  clearAssistedRemainderCapsules(state);
  context.lineWidth = Math.max(5, Math.min(9, rect.width * .006));
  context.strokeStyle = "rgba(245, 158, 11, .78)";
  [...state.strokes, state.activeStroke].filter(Boolean).forEach((stroke) => drawStroke(context, stroke));
}

function drawAssistedLinks(context, state, rect) {
  context.lineWidth = getAssistedTraceWidth(rect);
  context.strokeStyle = "rgba(245, 158, 11, .82)";
  state.assistedLinks.forEach((link) => {
    const bigEl = getTokenElementById(state, "big", link.bigTokenId);
    const smallEl = getTokenElementById(state, "small", link.smallTokenId);
    if (!bigEl || !smallEl) return;
    drawStraightLine(context, getTokenCenterOnCanvas(state, bigEl), getTokenCenterOnCanvas(state, smallEl));
  });

  if (state.activeAssistedLink?.hasMoved) {
    context.strokeStyle = "rgba(245, 158, 11, .48)";
    drawStraightLine(context, state.activeAssistedLink.startPoint, state.activeAssistedLink.currentPoint);
  }
}


function updateAssistedRemainderCapsules(state) {
  const question = state.currentQuestion;
  const svg = state.assistedRemainderSvg || state.workspaceEl?.querySelector?.("#comparaison_assisted_remainder_svg") || null;
  state.assistedRemainderSvg = svg;

  if (!svg || !question || state.answerRevealed || question.traceMode !== TRACE_MODES.ASSISTED) {
    clearAssistedRemainderCapsules(state);
    return;
  }

  const groups = getAssistedRemainderGroups(state);
  if (!groups.length) {
    clearAssistedRemainderCapsules(state);
    return;
  }

  const key = groups
    .map((group) => group.map((token) => token.tokenId).join(","))
    .join(";");
  const shouldAnimate = key !== state.assistedRemainderKey;
  state.assistedRemainderKey = key;

  const svgRect = svg.getBoundingClientRect();
  if (!svgRect.width || !svgRect.height) return;
  svg.setAttribute("viewBox", `0 0 ${svgRect.width} ${svgRect.height}`);
  svg.innerHTML = "";

  const strokeWidth = getAssistedTraceWidth(svgRect);

  groups.forEach((group, index) => {
    const bounds = getTokenGroupBoundsOnSvg(svg, group);
    if (!bounds) return;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "comparaison-assisted-remainder-path");
    path.setAttribute("d", buildHandDrawnCapsulePath(bounds, index));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "rgba(245, 158, 11, .82)");
    path.setAttribute("stroke-width", String(strokeWidth));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);

    if (shouldAnimate && typeof path.getTotalLength === "function") {
      const length = Math.max(1, path.getTotalLength());
      path.style.strokeDasharray = String(length);
      path.style.strokeDashoffset = String(length);
      requestAnimationFrame(() => {
        path.classList.add("is-animated");
      });
    }
  });
}

function clearAssistedRemainderCapsules(state) {
  state.assistedRemainderKey = "";
  const svg = state.assistedRemainderSvg || state.workspaceEl?.querySelector?.("#comparaison_assisted_remainder_svg") || null;
  if (svg) svg.innerHTML = "";
}

function getAssistedRemainderGroups(state) {
  const smallTokens = getVisibleTraceTokens(state, "small");
  const bigTokens = getVisibleTraceTokens(state, "big");
  if (!smallTokens.length || !bigTokens.length) return [];

  const linkedSmallIds = new Set(state.assistedLinks.map((link) => String(link.smallTokenId)));
  const linkedBigIds = new Set(state.assistedLinks.map((link) => String(link.bigTokenId)));

  if (smallTokens.some((token) => !linkedSmallIds.has(String(token.tokenId)))) {
    return [];
  }

  const unlinkedBigTokens = bigTokens
    .filter((token) => !linkedBigIds.has(String(token.tokenId)))
    .sort((a, b) => a.index - b.index);

  return groupContiguousTokens(unlinkedBigTokens);
}

function getVisibleTraceTokens(state, role) {
  const tokens = Array.from(state.sceneEl?.querySelectorAll?.(`.comparaison-token[data-token-role="${role}"]`) || []);
  return tokens
    .filter((tokenEl) => !tokenEl.classList.contains("comparaison-token--dragging"))
    .map((tokenEl, fallbackIndex) => ({
      element: tokenEl,
      tokenId: tokenEl.dataset.tokenId || `${role}-${fallbackIndex}`,
      index: Number.isFinite(Number(tokenEl.dataset.tokenIndex)) ? Number(tokenEl.dataset.tokenIndex) : fallbackIndex
    }))
    .filter((token) => token.element && token.tokenId)
    .sort((a, b) => a.index - b.index);
}

function groupContiguousTokens(tokens) {
  const groups = [];
  tokens.forEach((token) => {
    const current = groups[groups.length - 1];
    if (!current || token.index !== current[current.length - 1].index + 1) {
      groups.push([token]);
    } else {
      current.push(token);
    }
  });
  return groups;
}

function getTokenGroupBoundsOnSvg(svg, group) {
  const svgRect = svg.getBoundingClientRect();
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  group.forEach((token) => {
    const rect = token.element?.getBoundingClientRect?.();
    if (!rect) return;
    left = Math.min(left, rect.left - svgRect.left);
    top = Math.min(top, rect.top - svgRect.top);
    right = Math.max(right, rect.right - svgRect.left);
    bottom = Math.max(bottom, rect.bottom - svgRect.top);
  });

  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;

  const tokenSize = Math.max(1, bottom - top);
  const padX = Math.max(10, tokenSize * .22);
  const padY = Math.max(8, tokenSize * .20);

  return {
    left: Math.max(0, left - padX),
    top: Math.max(0, top - padY),
    right: Math.min(svgRect.width, right + padX),
    bottom: Math.min(svgRect.height, bottom + padY)
  };
}

function buildHandDrawnCapsulePath(bounds, seed = 0) {
  const left = bounds.left;
  const top = bounds.top;
  const right = bounds.right;
  const bottom = bounds.bottom;
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const wobble = Math.max(2, Math.min(7, height * .08));
  const seedShift = ((seed % 3) - 1) * Math.min(8, width * .035);
  const gapWidth = Math.min(Math.max(16, width * .13), Math.max(18, width * .28));
  const gapCenter = clamp(left + width * .60 + seedShift, left + width * .38, right - width * .22);
  const gapLeft = clamp(gapCenter - gapWidth / 2, left + width * .20, right - width * .34);
  const gapRight = clamp(gapCenter + gapWidth / 2, gapLeft + 10, right - width * .10);

  const yTopA = top + wobble * .15;
  const yTopB = top - wobble * .28;
  const yBottomA = bottom + wobble * .25;
  const yBottomB = bottom - wobble * .18;
  const midY = top + height * .52;

  return [
    `M ${round(gapRight)} ${round(yTopA)}`,
    `C ${round(right - width * .10)} ${round(top - wobble * .35)} ${round(right + wobble * .30)} ${round(top + height * .16)} ${round(right + wobble * .18)} ${round(midY)}`,
    `C ${round(right + wobble * .32)} ${round(bottom - height * .10)} ${round(right - width * .12)} ${round(yBottomA)} ${round(right - width * .34)} ${round(bottom + wobble * .10)}`,
    `C ${round(left + width * .27)} ${round(bottom + wobble * .38)} ${round(left - wobble * .30)} ${round(bottom - height * .12)} ${round(left + wobble * .15)} ${round(midY)}`,
    `C ${round(left + wobble * .10)} ${round(top + height * .13)} ${round(left + width * .16)} ${round(yTopB)} ${round(left + width * .38)} ${round(top + wobble * .05)}`,
    `C ${round(gapLeft + width * .06)} ${round(top + wobble * .30)} ${round(gapLeft + width * .03)} ${round(top + wobble * .08)} ${round(gapLeft)} ${round(top + wobble * .05)}`
  ].join(" ");
}

function getAssistedTraceWidth(rect) {
  return Math.max(5, Math.min(8, Number(rect?.width || 0) * .0055));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function drawStraightLine(context, a, b) {
  if (!a || !b) return;
  context.beginPath();
  context.moveTo(a.x, a.y);
  context.lineTo(b.x, b.y);
  context.stroke();
}

function drawStroke(context, stroke) {
  if (!Array.isArray(stroke) || stroke.length < 2) return;
  context.beginPath();
  context.moveTo(stroke[0].x, stroke[0].y);
  for (let i = 1; i < stroke.length; i += 1) {
    const previous = stroke[i - 1];
    const current = stroke[i];
    const midX = (previous.x + current.x) / 2;
    const midY = (previous.y + current.y) / 2;
    context.quadraticCurveTo(previous.x, previous.y, midX, midY);
  }
  const last = stroke[stroke.length - 1];
  context.lineTo(last.x, last.y);
  context.stroke();
}

function getCanvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function distance(a, b) {
  const dx = (a?.x || 0) - (b?.x || 0);
  const dy = (a?.y || 0) - (b?.y || 0);
  return Math.hypot(dx, dy);
}

function getTraceTokenHit(state, event) {
  const tokens = Array.from(state.sceneEl?.querySelectorAll?.(".comparaison-token") || [])
    .filter((token) => !token.classList.contains("comparaison-token--dragging"));
  for (const token of tokens) {
    if (!isClientPointInsideElement(token, event.clientX, event.clientY)) continue;
    const role = token.dataset.tokenRole || "";
    const tokenId = token.dataset.tokenId || "";
    const index = Math.max(0, Math.floor(Number(token.dataset.tokenIndex) || 0));
    if (role && tokenId) return { role, tokenId, index, element: token };
  }
  return null;
}

function getTokenCenterOnCanvas(state, tokenEl) {
  const canvasRect = state.canvas?.getBoundingClientRect?.();
  const tokenRect = tokenEl?.getBoundingClientRect?.();
  if (!canvasRect || !tokenRect) return { x: 0, y: 0 };
  return {
    x: tokenRect.left + tokenRect.width / 2 - canvasRect.left,
    y: tokenRect.top + tokenRect.height / 2 - canvasRect.top
  };
}

function getTokenElementById(state, role, tokenId) {
  const tokens = Array.from(state.sceneEl?.querySelectorAll?.(`.comparaison-token[data-token-role="${role}"]`) || []);
  return tokens.find((token) => String(token.dataset.tokenId || "") === String(tokenId || "")) || null;
}

function isValidAssistedLink(state, start, target) {
  if (!start || !target) return false;
  if (start.role === target.role) return false;
  if (isTokenAlreadyLinked(state, start.role, start.tokenId)) return false;
  if (isTokenAlreadyLinked(state, target.role, target.tokenId)) return false;
  return true;
}

function isTokenAlreadyLinked(state, role, tokenId) {
  return state.assistedLinks.some((link) => {
    return role === "big"
      ? String(link.bigTokenId) === String(tokenId)
      : String(link.smallTokenId) === String(tokenId);
  });
}

function addAssistedLink(state, start, target) {
  const bigTokenId = start.role === "big" ? start.tokenId : target.tokenId;
  const smallTokenId = start.role === "small" ? start.tokenId : target.tokenId;
  state.assistedLinks.push({ bigTokenId, smallTokenId });
}

function getPlacedTokenHit(state, event) {
  const question = state.currentQuestion;
  if (!question || question.tokenMode !== TOKEN_MODES.COMPLETE) return null;
  const tokens = Array.from(state.sceneEl?.querySelectorAll?.(".comparaison-token--placed") || []);
  for (const token of tokens) {
    if (!isClientPointInsideElement(token, event.clientX, event.clientY)) continue;
    const role = token.dataset.tokenRole || "";
    const index = Math.max(0, Math.floor(Number(token.dataset.tokenIndex) || 0));
    const tokenId = token.dataset.tokenId || "";
    if (role && tokenId) return { role, index, tokenId };
  }
  return null;
}

function removePlacedToken(state, role, tokenId = "") {
  if (!role || !state.currentQuestion || state.currentQuestion.tokenMode !== TOKEN_MODES.COMPLETE) return;
  const tokens = Array.isArray(state.placedTokens?.[role]) ? state.placedTokens[role] : [];
  if (!tokens.length) return;
  const index = tokenId
    ? tokens.findIndex((token) => String(token?.id || "") === String(tokenId))
    : tokens.length - 1;
  if (index < 0) return;
  const [removed] = tokens.splice(index, 1);
  removeAssistedLinksForToken(state, role, removed?.id || tokenId);
  renderPlacementLines(state);
  syncCanvasSize(state);
}

function removeAssistedLinksForToken(state, role, tokenId) {
  if (!tokenId) return;
  state.assistedLinks = state.assistedLinks.filter((link) => {
    return role === "big"
      ? String(link.bigTokenId) !== String(tokenId)
      : String(link.smallTokenId) !== String(tokenId);
  });
}

function countGroupBreaksBetween(startCount, endCount) {
  let count = 0;
  for (let tokenIndex = Math.floor(startCount) + 1; tokenIndex < Math.floor(endCount); tokenIndex += 1) {
    if (tokenIndex % 5 === 0) count += 1;
  }
  return count;
}

function setupTokenPlacement(state) {
  teardownPlacement(state);
  const question = state.currentQuestion;
  if (!question || state.answerRevealed || question.tokenMode !== TOKEN_MODES.COMPLETE) return;

  const reserveButton = state.workspaceEl?.querySelector?.("[data-comparaison-token-reserve]") || null;
  if (!reserveButton) return;

  const abortController = new AbortController();
  const { signal } = abortController;
  state.placementAbortController = abortController;

  reserveButton.addEventListener("pointerdown", (event) => beginTokenDrag(state, event), { signal });
}

function beginTokenDrag(state, event) {
  if (state.activeTokenDrag || state.answerRevealed || !canPlaceMoreTokens(state)) return;
  event.preventDefault();
  event.stopPropagation();

  const scene = state.sceneEl;
  if (!scene) return;

  const tokenEl = document.createElement("span");
  tokenEl.className = "comparaison-token comparaison-token--dragging";
  tokenEl.setAttribute("aria-hidden", "true");
  scene.appendChild(tokenEl);

  const dragAbortController = new AbortController();
  const { signal } = dragAbortController;
  state.activeTokenDrag = {
    pointerId: event.pointerId,
    tokenEl,
    abortController: dragAbortController
  };

  scene.classList.add("comparaison-scene--placing");
  positionDragToken(state, event);

  const move = (moveEvent) => {
    if (!state.activeTokenDrag || moveEvent.pointerId !== state.activeTokenDrag.pointerId) return;
    moveEvent.preventDefault();
    positionDragToken(state, moveEvent);
  };
  const end = (endEvent) => {
    if (!state.activeTokenDrag || endEvent.pointerId !== state.activeTokenDrag.pointerId) return;
    endEvent.preventDefault();
    finishTokenDrag(state, endEvent);
  };

  window.addEventListener("pointermove", move, { signal });
  window.addEventListener("pointerup", end, { signal });
  window.addEventListener("pointercancel", end, { signal });
}

function finishTokenDrag(state, event) {
  const role = findDropRoleForToken(state, event);
  clearActiveTokenDrag(state);
  if (role && canPlaceTokenInRole(state, role)) {
    state.placedTokens[role].push({ id: `placed-${state.nextPlacedTokenId++}` });
    renderPlacementLines(state);
    syncCanvasSize(state);
  }
}

function clearActiveTokenDrag(state) {
  const drag = state.activeTokenDrag;
  if (!drag) return;
  drag.abortController?.abort?.();
  drag.tokenEl?.remove?.();
  state.activeTokenDrag = null;
  state.sceneEl?.classList.remove("comparaison-scene--placing");
}

function positionDragToken(state, event) {
  const drag = state.activeTokenDrag;
  const scene = state.sceneEl;
  if (!drag?.tokenEl || !scene) return;
  const point = clientPointToLocalPoint(scene, event.clientX, event.clientY);
  drag.tokenEl.style.left = `${point.x}px`;
  drag.tokenEl.style.top = `${point.y}px`;
}

function findDropRoleForToken(state, event) {
  const spots = Array.from(state.sceneEl?.querySelectorAll?.("[data-comparaison-next-spot]") || []);
  if (!spots.length) return "";

  let best = null;
  spots.forEach((spot) => {
    const rect = spot.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const distance = Math.hypot(dx, dy);
    const inside = isClientPointInsideElement(spot, event.clientX, event.clientY);
    const threshold = Math.max(52, Math.min(90, Math.max(rect.width, rect.height) * 1.3));
    const score = inside ? 0 : distance;
    if (score <= threshold && (!best || score < best.score)) {
      best = { score, role: spot.dataset.comparaisonNextSpot || "" };
    }
  });

  return best?.role || "";
}

function canPlaceMoreTokens(state) {
  return !!state.currentQuestion
    && state.currentQuestion.tokenMode === TOKEN_MODES.COMPLETE
    && ((state.placedTokens?.big?.length || 0) < LIMITS.maxCount || (state.placedTokens?.small?.length || 0) < LIMITS.maxCount);
}

function canPlaceTokenInRole(state, role) {
  if (!state.currentQuestion || state.currentQuestion.tokenMode !== TOKEN_MODES.COMPLETE) return false;
  if (role !== "big" && role !== "small") return false;
  return (state.placedTokens?.[role]?.length || 0) < LIMITS.maxCount;
}

function renderPlacementLines(state) {
  const question = state.currentQuestion;
  if (!state.sceneEl || !question || question.tokenMode !== TOKEN_MODES.COMPLETE) return;

  ["big", "small"].forEach((role) => {
    const oldLine = state.sceneEl.querySelector(`[data-comparaison-token-line="${role}"]`);
    if (!oldLine) return;
    const tokenCount = role === "big" ? question.bigCount : question.smallCount;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = renderCollectionLine({
      role,
      tokenCount,
      tokenMode: question.tokenMode,
      placedTokens: state.placedTokens?.[role] || []
    }).trim();
    const newLine = wrapper.firstElementChild;
    if (newLine) oldLine.replaceWith(newLine);
  });
  redrawCanvas(state);
}


function createEmptyPlacedTokens() {
  return { big: [], small: [] };
}

function clonePlacedTokens(placedTokens = createEmptyPlacedTokens()) {
  return {
    big: Array.isArray(placedTokens?.big) ? placedTokens.big.map((token) => ({ ...token })) : [],
    small: Array.isArray(placedTokens?.small) ? placedTokens.small.map((token) => ({ ...token })) : []
  };
}

function evaluatePlacedTokens(question = {}, placedTokens = createEmptyPlacedTokens()) {
  if (question?.tokenMode !== TOKEN_MODES.COMPLETE) {
    return { required: false, isCorrect: true, bigCorrect: true, smallCorrect: true };
  }
  const bigCorrect = (placedTokens?.big?.length || 0) === Number(question.bigCount || 0);
  const smallCorrect = (placedTokens?.small?.length || 0) === Number(question.smallCount || 0);
  return {
    required: true,
    isCorrect: bigCorrect && smallCorrect,
    bigCorrect,
    smallCorrect
  };
}

function evaluateCurrentResponse(state, answer = "", placedTokens = state.placedTokens) {
  const numeric = evaluateAnswer(state.currentQuestion, answer);
  const tokens = evaluatePlacedTokens(state.currentQuestion, placedTokens);
  return {
    ...numeric,
    numeric,
    tokens,
    isCorrect: numeric.isCorrect && tokens.isCorrect
  };
}

function requestReveal(state) {
  const wasCorrect = evaluateCurrentResponse(state, state.selectedAnswer, state.placedTokens).isCorrect;
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

  state.studentPlacedTokensSnapshot = clonePlacedTokens(state.placedTokens);
  const evaluation = evaluateCurrentResponse(state, state.submittedAnswer, state.studentPlacedTokensSnapshot);
  state.root?.classList.add("comparaison-root--revealed");
  state.root?.classList.toggle("comparaison-root--correct", evaluation.isCorrect);
  state.root?.classList.toggle("comparaison-root--incorrect", !evaluation.isCorrect);

  state.studentAnswerSnapshot = String(state.submittedAnswer || "");
  state.correctionSnapshot = String(state.currentQuestion.correctAnswer || "");
  state.answerDisplayMode = evaluation.isCorrect ? "correction" : "student";
  teardownPlacement(state);
  teardownDrawing(state);
  renderAnswerWorkspace(state);
  renderAnswerResult(state);
  syncValidateState(state);
}

function renderAnswerWorkspace(state) {
  if (!state.workspaceEl || !state.currentQuestion) return;
  const isCompleteMode = state.currentQuestion.tokenMode === TOKEN_MODES.COMPLETE;
  if (!isCompleteMode) {
    renderCorrectionWorkspace(state);
    return;
  }

  teardownCorrection(state);
  teardownDrawing(state);
  const mode = normalizeAnswerDisplayMode(state.answerDisplayMode);
  state.workspaceEl.innerHTML = renderWorkspaceMarkup(state, state.currentQuestion, { answerMode: mode });
  state.sceneEl = state.workspaceEl.querySelector(".comparaison-scene");
  if (mode === "student") setupFrozenStudentDrawingLayer(state);
  else setupCorrectionLayer(state);
}

function updateReviewedCollectionLines(state, answerMode) {
  const question = state.currentQuestion;
  const scene = state.sceneEl;
  if (!question || !scene) {
    renderAnswerWorkspace(state);
    return;
  }

  teardownCorrection(state);
  teardownDrawing(state);

  const mode = normalizeAnswerDisplayMode(answerMode);
  scene.classList.toggle("comparaison-scene--student-review", mode === "student");
  scene.classList.toggle("comparaison-scene--correction", mode === "correction");
  ["big", "small"].forEach((role) => {
    const collectionSide = scene.querySelector(`.comparaison-row--${role} .comparaison-collection-side`);
    if (!collectionSide) return;
    const expectedCount = role === "big" ? question.bigCount : question.smallCount;
    collectionSide.innerHTML = renderReviewedCollectionLine({
      role,
      expectedCount,
      placedTokens: state.studentPlacedTokensSnapshot?.[role] || [],
      answerMode: mode
    });
  });

  scene.querySelectorAll(
    "#comparaison_drawing_canvas, #comparaison_assisted_remainder_svg, #comparaison_correction_canvas, #comparaison_correction_remainder_svg"
  ).forEach((element) => element.remove());

  if (mode === "student") {
    const traceEnabled = question.traceMode === TRACE_MODES.FREE || question.traceMode === TRACE_MODES.ASSISTED;
    if (traceEnabled) {
      scene.insertAdjacentHTML("beforeend", '<canvas class="comparaison-drawing-canvas" id="comparaison_drawing_canvas" aria-label="Zone de tracé libre"></canvas>');
      if (question.traceMode === TRACE_MODES.ASSISTED) {
        scene.insertAdjacentHTML("beforeend", '<svg class="comparaison-assisted-remainder-svg" id="comparaison_assisted_remainder_svg" aria-hidden="true" focusable="false"></svg>');
      }
    }
    setupFrozenStudentDrawingLayer(state);
    return;
  }

  scene.insertAdjacentHTML(
    "beforeend",
    '<canvas class="comparaison-correction-canvas" id="comparaison_correction_canvas" aria-hidden="true"></canvas><svg class="comparaison-correction-remainder-svg" id="comparaison_correction_remainder_svg" aria-hidden="true" focusable="false"></svg>'
  );
  setupCorrectionLayer(state);
}

function renderCorrectionWorkspace(state) {
  if (!state.workspaceEl || !state.currentQuestion) return;
  teardownCorrection(state);
  teardownDrawing(state);
  state.workspaceEl.innerHTML = renderWorkspaceMarkup(state, state.currentQuestion, { correction: true });
  state.sceneEl = state.workspaceEl.querySelector(".comparaison-scene");
  setupCorrectionLayer(state);
}

function setupFrozenStudentDrawingLayer(state) {
  state.canvas = state.workspaceEl?.querySelector?.("#comparaison_drawing_canvas") || null;
  state.assistedRemainderSvg = state.workspaceEl?.querySelector?.("#comparaison_assisted_remainder_svg") || null;
  if (!state.canvas) return;
  state.canvasContext = state.canvas.getContext("2d");
  syncCanvasSize(state);
  state.resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => syncCanvasSize(state)) : null;
  state.resizeObserver?.observe?.(state.canvas);
}

function setupCorrectionLayer(state) {
  state.correctionCanvas = state.workspaceEl?.querySelector?.("#comparaison_correction_canvas") || null;
  state.correctionRemainderSvg = state.workspaceEl?.querySelector?.("#comparaison_correction_remainder_svg") || null;
  state.correctionRemainderKey = "";
  if (!state.correctionCanvas) return;
  state.correctionCanvasContext = state.correctionCanvas.getContext("2d");
  syncCorrectionCanvasSize(state);
  state.correctionResizeObserver = typeof ResizeObserver !== "undefined"
    ? new ResizeObserver(() => syncCorrectionCanvasSize(state))
    : null;
  state.correctionResizeObserver?.observe?.(state.correctionCanvas);
  state.correctionRemainderSvg && state.correctionResizeObserver?.observe?.(state.correctionRemainderSvg);
  state.sceneEl?.querySelectorAll?.(".comparaison-token")?.forEach?.((token) => state.correctionResizeObserver?.observe?.(token));
  requestAnimationFrame(() => syncCorrectionCanvasSize(state));
}

function syncCorrectionCanvasSize(state) {
  const canvas = state.correctionCanvas;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  drawCorrectionCorrespondences(state);
  drawCorrectionRemainderCapsules(state);
}

function drawCorrectionCorrespondences(state) {
  const canvas = state.correctionCanvas;
  const context = state.correctionCanvasContext;
  const question = state.currentQuestion;
  if (!canvas || !context || !question) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = getCorrectionTraceWidth(rect);
  context.strokeStyle = "rgba(34, 197, 94, .88)";
  for (let index = 0; index < Number(question.smallCount || 0); index += 1) {
    const bigEl = getTokenElementById(state, "big", `big-${index}`);
    const smallEl = getTokenElementById(state, "small", `small-${index}`);
    if (!bigEl || !smallEl) continue;
    drawStraightLine(context, getTokenCenterOnCorrectionCanvas(state, bigEl), getTokenCenterOnCorrectionCanvas(state, smallEl));
  }
}


function drawCorrectionRemainderCapsules(state) {
  const svg = state.correctionRemainderSvg || state.workspaceEl?.querySelector?.("#comparaison_correction_remainder_svg") || null;
  const question = state.currentQuestion;
  state.correctionRemainderSvg = svg;

  if (!svg || !question || !state.answerRevealed) return;

  const groups = getCorrectionRemainderGroups(state);
  if (!groups.length) {
    svg.innerHTML = "";
    state.correctionRemainderKey = "";
    return;
  }

  const key = groups
    .map((group) => group.map((token) => token.tokenId).join(","))
    .join(";");
  const shouldAnimate = key !== state.correctionRemainderKey;
  state.correctionRemainderKey = key;

  const svgRect = svg.getBoundingClientRect();
  if (!svgRect.width || !svgRect.height) return;
  svg.setAttribute("viewBox", `0 0 ${svgRect.width} ${svgRect.height}`);
  svg.innerHTML = "";

  const strokeWidth = getCorrectionTraceWidth(svgRect);

  groups.forEach((group, index) => {
    const bounds = getTokenGroupBoundsOnSvg(svg, group);
    if (!bounds) return;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "comparaison-correction-remainder-path");
    path.setAttribute("d", buildHandDrawnCapsulePath(bounds, index));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "rgba(34, 197, 94, .92)");
    path.setAttribute("stroke-width", String(strokeWidth));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);

    if (shouldAnimate && typeof path.getTotalLength === "function") {
      const length = Math.max(1, path.getTotalLength());
      path.style.strokeDasharray = String(length);
      path.style.strokeDashoffset = String(length);
      requestAnimationFrame(() => {
        path.classList.add("is-animated");
      });
    }
  });
}

function getCorrectionRemainderGroups(state) {
  const question = state.currentQuestion;
  if (!question) return [];
  const start = Math.max(0, Math.floor(Number(question.smallCount) || 0));
  const end = Math.max(start, Math.floor(Number(question.bigCount) || 0));
  const tokens = [];

  for (let index = start; index < end; index += 1) {
    const element = getTokenElementById(state, "big", `big-${index}`);
    if (!element) continue;
    tokens.push({
      element,
      tokenId: `big-${index}`,
      index
    });
  }

  return groupContiguousTokens(tokens);
}

function getCorrectionTraceWidth(rect) {
  return Math.max(5, Math.min(8, Number(rect?.width || 0) * .0055));
}

function getTokenCenterOnCorrectionCanvas(state, tokenEl) {
  const canvasRect = state.correctionCanvas?.getBoundingClientRect?.();
  const tokenRect = tokenEl?.getBoundingClientRect?.();
  if (!canvasRect || !tokenRect) return { x: 0, y: 0 };
  return {
    x: tokenRect.left + tokenRect.width / 2 - canvasRect.left,
    y: tokenRect.top + tokenRect.height / 2 - canvasRect.top
  };
}

function renderAnswerResult(state) {
  if (!state.responsesEl || !state.currentQuestion) return;
  teardownBindings(state);
  destroyAnswerControl(state);

  const showStudentAnswer = canToggleStudentAnswerDisplay(state) && normalizeAnswerDisplayMode(state.answerDisplayMode) === "student";
  const value = showStudentAnswer ? state.studentAnswerSnapshot : state.correctionSnapshot;
  const numericEvaluation = evaluateAnswer(state.currentQuestion, state.studentAnswerSnapshot);
  const className = [
    "comparaison-numeric-answer",
    "comparaison-numeric-answer--readonly",
    showStudentAnswer
      ? (numericEvaluation.isCorrect ? "is-correct" : "is-incorrect")
      : (numericEvaluation.isCorrect ? "is-correct" : "is-correction")
  ].filter(Boolean).join(" ");

  state.responsesEl.className = "comparaison-responses comparaison-responses--write comparaison-responses--result";
  state.responsesEl.innerHTML = `
    <div class="comparaison-answer-area">
      <div class="comparaison-write-answer" id="comparaison_write_answer">
        ${renderNumericAnswerDisplayMarkup(value, {
          className,
          ariaLabel: showStudentAnswer ? "Réponse de l’élève" : "Correction"
        })}
      </div>
    </div>
    ${renderNumericKeypad({
      hidden: true,
      rootClassName: "comparaison-keypad",
      buttonClassName: "comparaison-keypad-button",
      clearButtonClassName: "comparaison-keypad-button--clear",
      dataAttribute: "data-comparaison-key"
    })}
  `;
}

function canToggleStudentAnswerDisplay(state) {
  if (!state.answerRevealed) return false;
  const numericDiffers = String(state.studentAnswerSnapshot || "") !== String(state.correctionSnapshot || "");
  const tokensDiffer = state.currentQuestion?.tokenMode === TOKEN_MODES.COMPLETE
    && !evaluatePlacedTokens(state.currentQuestion, state.studentPlacedTokensSnapshot).isCorrect;
  return numericDiffers || tokensDiffer;
}

function normalizeAnswerDisplayMode(value) {
  return String(value || "").trim().toLowerCase() === "student" ? "student" : "correction";
}

function syncValidateState(state) {
  state.latestContext?.services?.notifyValidationStateChanged?.();
}

function updateInstruction(state) {
  if (!state.instructionEl) return;
  const defaultInstruction = getDefaultInstruction(state.currentSettings);
  setToolInstructionText(state.instructionEl, resolveToolInstructionText({
    ...state.latestContext,
    defaultInstruction
  }, defaultInstruction));
}

function teardownBindings(state) {
  state.responseAbortController?.abort?.();
  state.responseAbortController = null;
}

function teardownCorrection(state) {
  state.correctionResizeObserver?.disconnect?.();
  state.correctionResizeObserver = null;
  if (state.correctionRemainderSvg) state.correctionRemainderSvg.innerHTML = "";
  state.correctionCanvas = null;
  state.correctionCanvasContext = null;
  state.correctionRemainderSvg = null;
  state.correctionRemainderKey = "";
}

function teardownPlacement(state) {
  state.placementAbortController?.abort?.();
  state.placementAbortController = null;
  clearActiveTokenDrag(state);
}

function teardownDrawing(state) {
  state.drawingAbortController?.abort?.();
  state.drawingAbortController = null;
  state.resizeObserver?.disconnect?.();
  state.resizeObserver = null;
  clearAssistedRemainderCapsules(state);
  state.canvas = null;
  state.canvasContext = null;
  state.assistedRemainderSvg = null;
  state.activeStroke = null;
  state.activeAssistedLink = null;
  state.activePointerId = null;
  state.activeTokenTap = null;
}

function destroyAnswerControl(state) {
  state.answerControl?.destroy?.();
  state.answerControl = null;
}

function teardownState(state, container) {
  teardownBindings(state);
  teardownDrawing(state);
  teardownCorrection(state);
  teardownPlacement(state);
  destroyAnswerControl(state);
  if (container) container.innerHTML = "";
  state.root = null;
  state.instructionEl = null;
  state.workspaceEl = null;
  state.responsesEl = null;
  state.sceneEl = null;
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  if (typeof document === "undefined") return;
  ensureToolInstructionStyles();
  const href = new URL("./activity.css", import.meta.url).href;
  if (document.querySelector(`link[data-comparaison-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.comparaisonStyle = href;
  document.head.appendChild(link);
}

function getInitials(name) {
  const letters = String(name || "?").trim().replace(/[^A-Za-zÀ-ÿ]/g, "");
  return letters.slice(0, 2) || "?";
}

function renderEraserIcon() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M690-240h190v80H610l80-80Zm-500 80-85-85q-23-23-23.5-57t22.5-58l440-456q23-24 56.5-24t56.5 23l199 199q23 23 23 57t-23 57L520-160H190Zm296-80 314-322-198-198-442 456 64 64h262Zm-6-240Z"/>
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
