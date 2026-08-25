import { loadPublicEmojiAssetsById } from "../../shared/public-emoji-assets.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  setToolInstructionText
} from "../../shared/tool-instruction.js";
import {
  RESPONSE_MODES,
  TRACE_MODES,
  buildCorrectOperation,
  evaluateOperationAnswer,
  getFeedbackMessage,
  normalizeSettings,
  pickQuestion,
  questionKey
} from "./model.js";

const ANSWER_PARTS = Object.freeze(["left", "operator", "right", "result"]);
const NUMERIC_PARTS = Object.freeze(["left", "right", "result"]);
const TECHNICAL_CHARACTER_URLS = Object.freeze({
  "images-personnages-mathis": new URL("../../shared/tool-assets/personnages/Mathis.webp", import.meta.url).href,
  "images-personnages-mathilde": new URL("../../shared/tool-assets/personnages/Mathilde.webp", import.meta.url).href,
  "images-personnages-mathieu": new URL("../../shared/tool-assets/personnages/Mathieu.webp", import.meta.url).href,
  "images-personnages-mathea": new URL("../../shared/tool-assets/personnages/Mathea.webp", import.meta.url).href
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

    supportsShellValidation() {
      return true;
    },

    canValidate() {
      return !state.answerRevealed && canSubmitAnswer(state);
    },

    validate() {
      if (state.answerRevealed || !canSubmitAnswer(state)) return false;
      requestReveal(state);
      return true;
    },

    getAnswerState() {
      const evaluation = state.answerRevealed
        ? state.lastEvaluation
        : evaluateOperationAnswer(state.currentQuestion, captureAnswerSnapshot(state));
      return {
        answered: Boolean(evaluation?.answered),
        correct: Boolean(evaluation?.isCorrect)
      };
    },

    getShellAnswerDisplayState() {
      return {
        canToggle: canToggleStudentAnswerDisplay(state),
        mode: normalizeAnswerDisplayMode(state.answerDisplayMode),
        transitionTargets: [state.answerEl]
      };
    },

    setShellAnswerDisplayMode(container, context = state.latestContext, mode = "correction") {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      syncRuntimeState(state, state.latestContext);
      if (!canToggleStudentAnswerDisplay(state)) return false;
      state.answerDisplayMode = normalizeAnswerDisplayMode(mode);
      renderResponseArea(state, { readOnly: true });
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
    workspaceEl: null,
    answerEl: null,
    sceneEl: null,
    canvas: null,
    canvasContext: null,
    drawingAbortController: null,
    resizeObserver: null,
    responseAbortController: null,
    emojiAssetsById: new Map(),
    assetsLoadingPromise: null,
    currentSettings: normalizeSettings(initialContext?.settings),
    currentQuestion: null,
    lastQuestionKey: "",
    answerRevealed: false,
    answerDisplayMode: "correction",
    answerParts: createEmptyAnswerParts(),
    activePart: "left",
    studentAnswerSnapshot: null,
    correctionSnapshot: null,
    lastEvaluation: null,
    strokes: [],
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

  container.innerHTML = `
    <div class="tool-runtime tool-runtime--somme-difference sd-root" id="sd_root">
      ${renderToolInstruction({ id: "sd_instruction" })}
      <div class="tool-stage tool-panel sd-panel">
        <div class="sd-workspace" id="sd_workspace" aria-live="polite"></div>
        <div class="sd-answer-zone" id="sd_answer_zone"></div>
      </div>
    </div>
  `;

  state.root = container.querySelector("#sd_root");
  state.instructionEl = container.querySelector("#sd_instruction");
  state.workspaceEl = container.querySelector("#sd_workspace");
  state.answerEl = container.querySelector("#sd_answer_zone");
}

async function loadNextQuestion(state) {
  await ensureEmojiAssetsLoaded(state);
  state.answerRevealed = false;
  state.answerDisplayMode = "correction";
  state.answerParts = createEmptyAnswerParts();
  state.activePart = "left";
  state.studentAnswerSnapshot = null;
  state.correctionSnapshot = null;
  state.lastEvaluation = null;
  state.strokes = [];
  state.activeStroke = null;
  state.activePointerId = null;
  state.root?.classList.remove("sd-root--correct", "sd-root--incorrect", "sd-root--impossible", "sd-root--revealed");

  state.currentQuestion = pickQuestion(state.currentSettings, { avoidKey: state.lastQuestionKey });
  state.lastQuestionKey = questionKey(state.currentQuestion);

  renderQuestion(state);
  syncValidateState(state);
}

async function ensureEmojiAssetsLoaded(state) {
  if (state.emojiAssetsById.size) return state.emojiAssetsById;
  if (state.assetsLoadingPromise) return state.assetsLoadingPromise;

  state.assetsLoadingPromise = loadPublicEmojiAssetsById()
    .then((assetsById) => {
      state.emojiAssetsById = assetsById;
      return state.emojiAssetsById;
    })
    .catch((error) => {
      console.error("Impossible de charger les émojis depuis Supabase.", error);
      state.emojiAssetsById = new Map();
      return state.emojiAssetsById;
    })
    .finally(() => {
      state.assetsLoadingPromise = null;
    });

  return state.assetsLoadingPromise;
}

function renderQuestion(state) {
  if (!state.currentQuestion) return;
  setToolInstructionText(state.instructionEl, state.currentQuestion.instruction || "Écris le bon calcul.");
  teardownBindings(state);
  teardownDrawing(state);

  if (state.workspaceEl) {
    state.workspaceEl.innerHTML = renderWorkspaceMarkup(state);
    state.sceneEl = state.workspaceEl.querySelector(".sd-scene");
    revealLoadedEmojiImages(state.workspaceEl, ".sd-object--image");
  }
  renderResponseArea(state, { readOnly: false });
  setupDrawingLayer(state);
  setupResponseBindings(state);
  focusActiveField(state);
}

function renderWorkspaceMarkup(state) {
  const question = state.currentQuestion;
  const traceEnabled = state.currentSettings.traceMode === TRACE_MODES.ENABLED && !state.answerRevealed;
  const density = getCollectionDensity(question);
  return `
    <div class="sd-scene" data-sd-density="${escapeHtml(density)}">
      ${traceEnabled ? renderSideControls() : ""}
      <div class="sd-rows">
        ${renderCharacterRow(state, {
          role: "top",
          character: question.topCharacter,
          count: question.topCount,
          object: question.object
        })}
        ${renderCharacterRow(state, {
          role: "bottom",
          character: question.bottomCharacter,
          count: question.bottomCount,
          object: question.object
        })}
      </div>
      ${traceEnabled ? '<canvas class="sd-drawing-canvas" id="sd_drawing_canvas" aria-label="Zone de tracé libre"></canvas>' : ""}
    </div>
  `;
}


function getCollectionDensity(question) {
  const maxCount = Math.max(
    Number(question?.topCount || 0),
    Number(question?.bottomCount || 0)
  );

  if (maxCount <= 5) return "tiny";
  if (maxCount <= 10) return "small";
  if (maxCount <= 30) return "medium";
  if (maxCount <= 50) return "large";
  return "compact";
}

function renderSideControls() {
  return `
    <div class="sd-side-controls">
      <button class="tool-choice-button sd-clear-traces" type="button" data-sd-clear-traces aria-label="Effacer les tracés" title="Effacer les tracés">
        ${renderEraserIcon()}
      </button>
    </div>
  `;
}

function renderCharacterRow(state, { role, character, count, object }) {
  return `
    <div class="sd-row sd-row--${escapeHtml(role)}">
      <div class="sd-character-side">
        ${renderCharacter(state, character, role)}
      </div>
      <div class="sd-collection-side">
        ${renderCollection(count, object, state)}
      </div>
    </div>
  `;
}

function renderCharacter(state, character, role) {
  const assetUrl = character?.assetId ? TECHNICAL_CHARACTER_URLS[character.assetId] : "";
  if (assetUrl) {
    return `<img class="sd-character sd-character--${escapeHtml(role)}" src="${escapeHtml(assetUrl)}" alt="${escapeHtml(character.name)}" draggable="false" loading="eager" decoding="async">`;
  }
  return `<div class="sd-character sd-character--placeholder sd-character--${escapeHtml(role)}"><span>${escapeHtml(getInitials(character?.name))}</span></div>`;
}

function renderCollection(count, object, state = null) {
  const safeCount = Math.max(0, Math.min(99, Math.floor(Number(count) || 0)));
  const asset = object?.assetId ? state?.emojiAssetsById?.get(object.assetId) : null;

  if (safeCount <= 10) {
    const items = Array.from({ length: safeCount }, (_, index) => renderCollectionObject({
      object,
      asset,
      index,
      groupEnd: isGroupEnd(index, safeCount)
    })).join("");
    return `<div class="sd-collection sd-collection--units" aria-label="${escapeHtml(safeCount)} ${escapeHtml(object?.plural || "objets")}">${items}</div>`;
  }

  const decadeGroups = [];
  const groupCount = Math.ceil(safeCount / 10);
  for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
    const startIndex = groupIndex * 10;
    const groupItemCount = Math.max(0, Math.min(10, safeCount - startIndex));
    decadeGroups.push(renderDecadeGroup({
      object,
      asset,
      startIndex,
      count: groupItemCount
    }));
  }

  return `
    <div class="sd-collection sd-collection--decades" aria-label="${escapeHtml(safeCount)} ${escapeHtml(object?.plural || "objets")}" style="--sd-decade-columns:${escapeHtml(Math.min(5, groupCount))};">
      <div class="sd-decades-grid" aria-hidden="true">${decadeGroups.join("")}</div>
    </div>
  `;
}

function renderDecadeGroup({ object, asset, startIndex, count }) {
  const topCount = Math.min(5, count);
  const bottomCount = Math.max(0, count - 5);
  const topItems = Array.from({ length: topCount }, (_, offset) => renderCollectionObject({
    object,
    asset,
    index: startIndex + offset
  })).join("");
  const bottomItems = Array.from({ length: bottomCount }, (_, offset) => renderCollectionObject({
    object,
    asset,
    index: startIndex + 5 + offset
  })).join("");

  return `
    <div class="sd-decade-group" aria-hidden="true">
      <div class="sd-decade-row">${topItems}</div>
      <div class="sd-decade-row">${bottomItems}</div>
    </div>
  `;
}

function renderCollectionObject({ object, asset, index, groupEnd = false }) {
  const label = `${object?.plural || "objet"} ${index + 1}`;
  const classes = [
    "sd-object",
    asset?.url ? "sd-object--image" : "sd-object--fallback",
    groupEnd ? "sd-object--group-end" : ""
  ].filter(Boolean).join(" ");

  if (asset?.url) {
    return `
      <img class="${escapeHtml(classes)}" src="${escapeHtml(asset.url)}" alt="" aria-hidden="true" draggable="false" loading="eager" decoding="async">
    `;
  }
  return `
    <span class="${escapeHtml(classes)}" aria-label="${escapeHtml(label)}">${escapeHtml(object?.fallback || "●")}</span>
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

function isGroupEnd(index, totalCount) {
  return (Number(index) + 1) % 5 === 0 && (Number(index) + 1) < Number(totalCount);
}

function renderResponseArea(state, { readOnly = false } = {}) {
  if (!state.answerEl || !state.currentQuestion) return;
  teardownBindings(state);
  const mode = state.currentSettings.responseMode;
  const snapshot = readOnly ? getDisplayedSnapshot(state) : captureAnswerSnapshot(state);
  const evaluation = state.lastEvaluation;
  const showStudentAnswer = readOnly
    && canToggleStudentAnswerDisplay(state)
    && normalizeAnswerDisplayMode(state.answerDisplayMode) === "student";
  const showCorrection = readOnly && !showStudentAnswer;
  const classes = [
    "sd-answer-card",
    `sd-answer-card--${mode}`,
    readOnly ? "sd-answer-card--readonly" : "",
    evaluation?.isCorrect ? "is-correct" : "",
    evaluation && !evaluation.isCorrect && showStudentAnswer ? "is-incorrect" : "",
    evaluation && !evaluation.isCorrect && showCorrection ? "is-correction" : "",
    evaluation?.reason === "impossible_subtraction" && showStudentAnswer ? "is-impossible" : ""
  ].filter(Boolean).join(" ");

  state.answerEl.innerHTML = `
    <div class="${escapeHtml(classes)}">
      ${renderOperationInput(state, { mode, snapshot, readOnly })}
      ${readOnly ? renderReadOnlyKeypadReplacement(state, evaluation, { showStudentAnswer }) : renderOperationKeypad()}
    </div>
  `;
}

function renderReadOnlyKeypadReplacement(state, evaluation, { showStudentAnswer = false } = {}) {
  const isImpossible = evaluation?.reason === "impossible_subtraction";
  const impossibleMessage = isImpossible
    ? (showStudentAnswer
      ? "Cette soustraction est impossible."
      : buildImpossibleSubtractionCorrectionMessage(state))
    : "";
  return `
    <div class="sd-keypad-replacement" ${isImpossible ? 'role="status"' : 'aria-hidden="true"'}>
      ${escapeHtml(impossibleMessage)}
    </div>
  `;
}

function buildImpossibleSubtractionCorrectionMessage(state) {
  const snapshot = state?.studentAnswerSnapshot;
  let left = String(snapshot?.left || "").trim();
  let right = String(snapshot?.right || "").trim();

  if ((!left || !right) && snapshot?.mode === RESPONSE_MODES.COMPLETE) {
    const match = String(snapshot.complete || "").match(/^\s*(\d+)\s*-\s*(\d+)/);
    left = left || String(match?.[1] || "");
    right = right || String(match?.[2] || "");
  }

  return left && right
    ? `Ta soustraction ${left} - ${right} était impossible.`
    : "Ta soustraction était impossible.";
}

function renderOperationInput(state, { mode, snapshot, readOnly = false }) {
  const question = state.currentQuestion;
  const readOnlyClass = readOnly ? " sd-operation-input--readonly" : "";

  if (mode === RESPONSE_MODES.COMPLETE) {
    return `
      <div class="sd-operation-input sd-operation-input--complete${readOnlyClass}" data-sd-operation-input>
        ${readOnly ? '<span class="sd-correction-frame" aria-hidden="true"></span>' : ""}
        ${renderEditableField({ part: "complete", value: snapshot.complete || snapshot.expression || snapshotToExpression(snapshot), label: "Opération complète", wide: true, readOnly })}
      </div>
    `;
  }

  const operator = mode === RESPONSE_MODES.PROPOSED
    ? buildCorrectOperation(question).operator
    : snapshot.operator;

  return `
    <div class="sd-operation-input sd-operation-input--${escapeHtml(mode)}${readOnlyClass}" data-sd-operation-input>
      ${readOnly ? '<span class="sd-correction-frame" aria-hidden="true"></span>' : ""}
      ${renderEditableField({ part: "left", value: snapshot.left, label: "Premier nombre", readOnly })}
      ${mode === RESPONSE_MODES.PROPOSED
        ? `<span class="sd-operation-symbol sd-operation-symbol--given" aria-label="Opérateur donné">${escapeHtml(operator)}</span>`
        : renderEditableField({ part: "operator", value: operator, label: "Opérateur", readOnly })}
      ${renderEditableField({ part: "right", value: snapshot.right, label: "Deuxième nombre", readOnly })}
      <span class="sd-operation-symbol" aria-hidden="true">=</span>
      ${renderEditableField({ part: "result", value: snapshot.result, label: "Résultat", readOnly })}
    </div>
  `;
}

function renderEditableField({ part, value = "", label = "Réponse", wide = false, readOnly = false }) {
  const text = String(value || "");
  const classes = `sd-answer-field${wide ? " sd-answer-field--wide" : ""}${readOnly ? " sd-answer-field--readonly" : ""}`;
  if (readOnly) {
    return `
      <span class="${escapeHtml(classes)}" data-sd-part="${escapeHtml(part)}" aria-label="${escapeHtml(label)}">
        <span>${escapeHtml(text || "\u00a0")}</span>
      </span>
    `;
  }
  return `
    <button class="${escapeHtml(classes)}" type="button" data-sd-part="${escapeHtml(part)}" aria-label="${escapeHtml(label)}">
      <span>${escapeHtml(text || "\u00a0")}</span>
    </button>
  `;
}

function renderOperationKeypad() {
  const keys = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "-", "=", "clear"];
  return `
    <div class="tool-numeric-keypad sd-keypad" role="group" aria-label="Clavier de l'opération">
      ${keys.map(renderOperationKeypadButton).join("")}
    </div>
  `;
}

function renderOperationKeypadButton(key) {
  const label = key === "clear" ? renderTrashIcon() : key;
  const ariaLabel = key === "clear" ? "Effacer la réponse" : key;
  return `
    <button class="tool-choice-button tool-numeric-keypad-button sd-keypad-button sd-keypad-button--${escapeHtml(key)}" type="button" data-sd-key="${escapeHtml(key)}" aria-label="${escapeHtml(ariaLabel)}">
      ${label}
    </button>
  `;
}

function setupResponseBindings(state) {
  if (!state.answerEl || state.answerRevealed) return;
  const abortController = new AbortController();
  const { signal } = abortController;
  state.responseAbortController = abortController;

  state.answerEl.querySelectorAll("[data-sd-part]").forEach((field) => {
    field.addEventListener("click", () => {
      setActivePart(state, field.dataset.sdPart || "left");
    }, { signal });
  });

  state.answerEl.querySelectorAll("[data-sd-key]").forEach((button) => {
    button.addEventListener("click", () => {
      handleOperationKey(state, button.dataset.sdKey || "");
      focusActiveField(state);
    }, { signal });
  });

  document.addEventListener("keydown", (event) => handleGlobalKeydown(state, event), { capture: true, signal });
  syncActiveFieldClass(state);
  syncValidateState(state);
}

function handleGlobalKeydown(state, event) {
  if (state.answerRevealed || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key;
  if (/^\d$/.test(key) || key === "+" || key === "-" || key === "=" || key === "Backspace" || key === "Delete" || key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  } else {
    return;
  }

  if (key === "Enter") {
    if (canSubmitAnswer(state)) requestReveal(state);
    return;
  }
  if (key === "Backspace") {
    handleOperationKey(state, "backspace");
  } else if (key === "Delete") {
    handleOperationKey(state, "clear");
  } else {
    handleOperationKey(state, key);
  }
  focusActiveField(state);
}

function handleOperationKey(state, key) {
  const mode = state.currentSettings.responseMode;
  const safeKey = String(key || "");
  if (safeKey === "clear") {
    state.answerParts = createEmptyAnswerParts();
    state.activePart = mode === RESPONSE_MODES.COMPLETE ? "complete" : "left";
    rerenderEditableAnswer(state);
    return;
  }
  if (safeKey === "backspace") {
    removeLastCharacter(state);
    rerenderEditableAnswer(state);
    return;
  }
  if (/^\d$/.test(safeKey)) {
    appendDigitToActivePart(state, safeKey);
    rerenderEditableAnswer(state);
    return;
  }
  if (safeKey === "+" || safeKey === "-") {
    handleOperatorKey(state, safeKey);
    rerenderEditableAnswer(state);
    return;
  }
  if (safeKey === "=") {
    handleEqualsKey(state);
    rerenderEditableAnswer(state);
  }
}


function appendCompleteExpressionKey(state, key) {
  const safeKey = String(key || "");
  const raw = getCompleteExpressionRaw(state.answerParts.complete);

  if (/^\d$/.test(safeKey)) {
    state.answerParts.complete = formatCompleteExpression(`${raw}${safeKey}`.slice(0, 12));
    return;
  }

  if (safeKey === "+" || safeKey === "-") {
    state.answerParts.complete = formatCompleteExpression(applyCompleteOperator(raw, safeKey));
    return;
  }

  if (safeKey === "=") {
    state.answerParts.complete = formatCompleteExpression(applyCompleteEquals(raw));
  }
}

function applyCompleteOperator(rawExpression, operator) {
  const raw = String(rawExpression || "");
  if (!/\d$/.test(raw) || raw.includes("=")) return raw;

  const operatorIndex = findCompleteOperatorIndex(raw);
  if (operatorIndex >= 0) {
    return `${raw.slice(0, operatorIndex)}${operator}${raw.slice(operatorIndex + 1)}`;
  }
  return `${raw}${operator}`;
}

function applyCompleteEquals(rawExpression) {
  const raw = String(rawExpression || "");
  if (raw.includes("=")) return raw;
  const operatorIndex = findCompleteOperatorIndex(raw);
  if (operatorIndex < 0) return raw;
  if (!/^\d+$/.test(raw.slice(operatorIndex + 1))) return raw;
  return `${raw}=`;
}

function findCompleteOperatorIndex(rawExpression) {
  const raw = String(rawExpression || "");
  const plusIndex = raw.indexOf("+");
  const minusIndex = raw.indexOf("-");
  if (plusIndex < 0) return minusIndex;
  if (minusIndex < 0) return plusIndex;
  return Math.min(plusIndex, minusIndex);
}

function getCompleteExpressionRaw(value) {
  return String(value || "").replace(/\s+/g, "").replace(/[^0-9+\-=]/g, "");
}

function formatCompleteExpression(value) {
  const raw = getCompleteExpressionRaw(value);
  let output = "";
  for (const character of raw) {
    if (/\d/.test(character)) {
      output += character;
    } else if (character === "+" || character === "-" || character === "=") {
      output = `${output.trimEnd()} ${character} `;
    }
  }
  return output;
}

function appendDigitToActivePart(state, digit) {
  const mode = state.currentSettings.responseMode;
  if (mode === RESPONSE_MODES.COMPLETE) {
    appendCompleteExpressionKey(state, digit);
    return;
  }
  if (!NUMERIC_PARTS.includes(state.activePart)) {
    state.activePart = state.activePart === "operator" ? "right" : "left";
  }
  const part = state.activePart;
  state.answerParts[part] = `${state.answerParts[part] || ""}${digit}`.slice(0, 2);
}

function handleOperatorKey(state, operator) {
  const mode = state.currentSettings.responseMode;
  if (mode === RESPONSE_MODES.COMPLETE) {
    appendCompleteExpressionKey(state, operator);
    return;
  }
  if (mode === RESPONSE_MODES.PROPOSED) {
    if (operator === buildCorrectOperation(state.currentQuestion).operator) state.activePart = "right";
    return;
  }
  state.answerParts.operator = operator;
  state.activePart = "right";
}

function handleEqualsKey(state) {
  const mode = state.currentSettings.responseMode;
  if (mode === RESPONSE_MODES.COMPLETE) {
    appendCompleteExpressionKey(state, "=");
    return;
  }
  state.activePart = "result";
}

function removeLastCharacter(state) {
  const mode = state.currentSettings.responseMode;
  if (mode === RESPONSE_MODES.COMPLETE) {
    const raw = getCompleteExpressionRaw(state.answerParts.complete).slice(0, -1);
    state.answerParts.complete = formatCompleteExpression(raw);
    return;
  }
  const part = state.activePart;
  if (part === "operator") {
    state.answerParts.operator = "";
  } else if (NUMERIC_PARTS.includes(part)) {
    state.answerParts[part] = String(state.answerParts[part] || "").slice(0, -1);
  }
}

function rerenderEditableAnswer(state) {
  renderResponseArea(state, { readOnly: false });
  setupResponseBindings(state);
}

function setActivePart(state, part) {
  const mode = state.currentSettings.responseMode;
  if (mode === RESPONSE_MODES.COMPLETE) {
    state.activePart = "complete";
  } else if (mode === RESPONSE_MODES.PROPOSED && part === "operator") {
    state.activePart = "right";
  } else if ([...ANSWER_PARTS, "complete"].includes(part)) {
    state.activePart = part;
  }
  syncActiveFieldClass(state);
  focusActiveField(state);
}

function syncActiveFieldClass(state) {
  state.answerEl?.querySelectorAll?.("[data-sd-part]").forEach((field) => {
    field.classList.toggle("is-active", (field.dataset.sdPart || "") === state.activePart);
  });
}

function focusActiveField(state) {
  queueMicrotask(() => {
    syncActiveFieldClass(state);
    const active = state.answerEl?.querySelector?.(`[data-sd-part="${cssEscape(state.activePart)}"]`);
    active?.focus?.({ preventScroll: true });
  });
}

function revealAnswer(state) {
  if (!state.currentQuestion || state.answerRevealed) return;
  state.answerRevealed = true;
  state.studentAnswerSnapshot = captureAnswerSnapshot(state);
  state.correctionSnapshot = buildCorrectionSnapshot(state.currentQuestion);
  state.lastEvaluation = evaluateOperationAnswer(state.currentQuestion, state.studentAnswerSnapshot);
  state.answerDisplayMode = "correction";

  state.root?.classList.add("sd-root--revealed");
  state.root?.classList.toggle("sd-root--correct", state.lastEvaluation.isCorrect === true);
  state.root?.classList.toggle("sd-root--incorrect", state.lastEvaluation.isCorrect !== true);
  state.root?.classList.toggle("sd-root--impossible", state.lastEvaluation.reason === "impossible_subtraction");

  teardownDrawing(state);
  renderResponseArea(state, { readOnly: true });
  syncValidateState(state);
}

function captureAnswerSnapshot(state) {
  const mode = state.currentSettings.responseMode;
  if (mode === RESPONSE_MODES.PROPOSED) {
    return {
      mode,
      left: String(state.answerParts.left || ""),
      operator: buildCorrectOperation(state.currentQuestion).operator,
      right: String(state.answerParts.right || ""),
      result: String(state.answerParts.result || "")
    };
  }
  if (mode === RESPONSE_MODES.COMPLETE) {
    return { mode, complete: String(state.answerParts.complete || "") };
  }
  return {
    mode,
    left: String(state.answerParts.left || ""),
    operator: String(state.answerParts.operator || ""),
    right: String(state.answerParts.right || ""),
    result: String(state.answerParts.result || "")
  };
}

function buildCorrectionSnapshot(question) {
  return {
    mode: RESPONSE_MODES.SEGMENTED,
    ...buildCorrectOperation(question)
  };
}

function getDisplayedSnapshot(state) {
  if (!state.answerRevealed) return captureAnswerSnapshot(state);
  const showStudent = canToggleStudentAnswerDisplay(state) && normalizeAnswerDisplayMode(state.answerDisplayMode) === "student";
  return showStudent ? state.studentAnswerSnapshot : state.correctionSnapshot;
}

function snapshotToExpression(snapshot) {
  if (!snapshot) return "";
  if (snapshot.expression) return snapshot.expression;
  if (snapshot.mode === RESPONSE_MODES.COMPLETE) return String(snapshot.complete || "");
  const left = String(snapshot.left || "");
  const operator = String(snapshot.operator || "");
  const right = String(snapshot.right || "");
  const result = String(snapshot.result || "");
  return [left, operator, right, "=", result].filter(Boolean).join(" ").replace("= ", "= ").trim();
}

function canToggleStudentAnswerDisplay(state) {
  if (!state.answerRevealed || !state.studentAnswerSnapshot || !state.correctionSnapshot) return false;
  return snapshotToExpression(state.studentAnswerSnapshot) !== snapshotToExpression(state.correctionSnapshot);
}

function isCurrentAnswerCorrect(state) {
  return evaluateOperationAnswer(state.currentQuestion, captureAnswerSnapshot(state)).isCorrect === true;
}

function canSubmitAnswer(state) {
  const evaluation = evaluateOperationAnswer(state.currentQuestion, captureAnswerSnapshot(state));
  return evaluation.answered === true && evaluation.reason !== "invalid_format" && evaluation.reason !== "empty";
}

function requestReveal(state) {
  const requested = state.latestContext?.services?.requestAnswerPhase?.({
    manual: false,
    showAnswerNow: true,
    wasCorrect: isCurrentAnswerCorrect(state)
  });
  if (requested === false || !state.latestContext?.services?.requestAnswerPhase) {
    revealAnswer(state);
  }
}

function setupDrawingLayer(state) {
  teardownDrawing(state);
  if (state.currentSettings.traceMode !== TRACE_MODES.ENABLED || state.answerRevealed) return;
  state.canvas = state.workspaceEl?.querySelector?.("#sd_drawing_canvas") || null;
  if (!state.canvas) return;
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
  state.workspaceEl?.querySelector?.("[data-sd-clear-traces]")?.addEventListener("click", () => {
    state.strokes = [];
    state.activeStroke = null;
    redrawCanvas(state);
    focusActiveField(state);
  }, { signal });
}

function beginStroke(state, event) {
  if (!state.canvas || state.activeStroke) return;
  event.preventDefault();
  state.canvas.setPointerCapture?.(event.pointerId);
  state.activePointerId = event.pointerId;
  state.activeStroke = [getCanvasPoint(state.canvas, event)];
  redrawCanvas(state);
}

function extendStroke(state, event) {
  if (!state.activeStroke || event.pointerId !== state.activePointerId) return;
  event.preventDefault();
  state.activeStroke.push(getCanvasPoint(state.canvas, event));
  redrawCanvas(state);
}

function endStroke(state, event) {
  if (!state.activeStroke || event.pointerId !== state.activePointerId) return;
  event.preventDefault();
  state.canvas?.releasePointerCapture?.(event.pointerId);
  if (state.activeStroke.length > 1) state.strokes.push(state.activeStroke);
  state.activeStroke = null;
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
  context.lineWidth = Math.max(5, Math.min(9, rect.width * .006));
  context.strokeStyle = "rgba(245, 158, 11, .78)";
  [...state.strokes, state.activeStroke].filter(Boolean).forEach((stroke) => drawStroke(context, stroke));
}

function drawStroke(context, stroke) {
  if (!Array.isArray(stroke) || stroke.length < 2) return;
  context.beginPath();
  context.moveTo(stroke[0].x, stroke[0].y);
  for (let index = 1; index < stroke.length; index += 1) {
    const previous = stroke[index - 1];
    const current = stroke[index];
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

function teardownBindings(state) {
  state.responseAbortController?.abort?.();
  state.responseAbortController = null;
}

function teardownDrawing(state) {
  state.drawingAbortController?.abort?.();
  state.drawingAbortController = null;
  state.resizeObserver?.disconnect?.();
  state.resizeObserver = null;
  state.canvas = null;
  state.canvasContext = null;
  state.activeStroke = null;
  state.activePointerId = null;
}

function teardownState(state, container) {
  teardownBindings(state);
  teardownDrawing(state);
  if (container) container.innerHTML = "";
  state.container = null;
  state.root = null;
  state.instructionEl = null;
  state.workspaceEl = null;
  state.answerEl = null;
  state.sceneEl = null;
}

function createEmptyAnswerParts() {
  return { left: "", operator: "", right: "", result: "", complete: "" };
}

function normalizeAnswerDisplayMode(value) {
  return String(value || "").trim().toLowerCase() === "student" ? "student" : "correction";
}

function syncValidateState(state) {
  state.latestContext?.services?.notifyValidationStateChanged?.();
}

function renderEraserIcon() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M690-240h190v80H610l80-80Zm-500 80-85-85q-23-23-23.5-57t22.5-58l440-456q23-24 56.5-24t56.5 23l199 199q23 23 23 57t-23 57L520-160H190Zm296-80 314-322-198-198-442 456 64 64h262Zm-6-240Z"/>
    </svg>
  `;
}

function renderTrashIcon() {
  return `
    <svg viewBox="0 -960 960 960" aria-hidden="true" focusable="false">
      <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z" fill="currentColor"/>
    </svg>
  `;
}

function getInitials(name) {
  const letters = String(name || "?").trim().replace(/[^A-Za-zÀ-ÿ]/g, "");
  return letters.slice(0, 2) || "?";
}

function cssEscape(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  if (typeof document === "undefined") return;
  ensureToolInstructionStyles();
  const href = new URL("./activity.css", import.meta.url).href;
  if (document.querySelector(`link[data-sd-activity-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.sdActivityStyle = href;
  document.head.appendChild(link);
}
