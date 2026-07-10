import {
  EXERCISE_TYPES,
  createTargetedInitialTiles,
  evaluateTargetedCalculationResponse,
  evaluateTokenBoxesResponse,
  formatSelection,
  getTargetedRequiredStepCount,
  hasDuplicateResponseLines,
  normalizeBoxIds,
  normalizeSettings,
  pickQuestion,
  questionKey,
  solutionKeyFromIds,
  targetedStepKey
} from "./model.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveQuestionInstructionText,
  setToolInstructionText
} from "../../shared/tool-instruction.js";

let stylesInjected = false;
const TARGETED_STEP_EQUALS_DELAY_MS = 500;
const TARGETED_STEP_RESULT_DELAY_MS = 500;
const TARGETED_STEP_COMMIT_DELAY_MS = 1000;
const TARGETED_STEP_TILE_DELAY_MS = 1400;
const TARGETED_RESULT_TILE_ANIMATION_MS = 800;
const TARGETED_EXISTING_TILE_SHIFT_ANIMATION_MS = 2000;
const TARGETED_RESULT_TILE_START_SCALE = 0.1;
const TARGETED_CALCULATION_RESULT_MAX = 1000;

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

      if (isCalculationTileQuestion(state.currentQuestion)) {
        const steps = state.answerRevealed ? state.submittedTargetedSteps : state.targetedSteps;
        const evaluation = evaluateTargetedCalculationResponse(state.currentQuestion, steps);
        return {
          answered: steps.length > 0,
          correct: evaluation.isCorrect
        };
      }

      const responseLines = state.answerRevealed ? state.submittedResponseLines : state.responseLines;
      const evaluation = evaluateTokenBoxesResponse(
        state.currentQuestion,
        responseLines,
        state.minSolutionsToFind
      );
      return {
        answered: responseLines.some((line) => normalizeBoxIds(line.boxIds).length >= 2),
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
      const settings = normalizeSettings(context?.settings);
      return settings.exerciseType === EXERCISE_TYPES.TOKEN_BOXES && shouldShowResponseWrappers(context);
    },

    canValidate() {
      if (isCalculationTileQuestion(state.currentQuestion)) return false;
      return canSubmitAnswer(state);
    },

    validate() {
      if (isCalculationTileQuestion(state.currentQuestion)) return false;
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
    promptEl: null,
    targetEl: null,
    boxesEl: null,
    opsEl: null,
    answersEl: null,
    currentQuestion: null,
    lastQuestionKey: null,
    questionIndex: 0,
    usedQuestionKeys: new Set(),
    responseLines: [],
    submittedResponseLines: [],
    activeResponseIndex: 0,
    targetedTiles: [],
    targetedSteps: [],
    submittedTargetedSteps: [],
    targetedEntry: createEmptyTargetedEntry(),
    targetedPendingStep: null,
    targetedStepAnimationTimers: [],
    targetedFlyingTileId: "",
    targetedNextStepAppearing: false,
    targetedSolved: false,
    targetAnimationKey: "",
    targetAnimationTimer: null,
    answerRevealed: false,
    answerDisplayMode: "correction",
    showResponseWrappers: shouldShowResponseWrappers(initialContext),
    minSolutionsToFind: 3,
    boxAbortController: null,
    answerAbortController: null,
    opsAbortController: null,
    targetedAbortController: null
  };
}

function syncRuntimeState(state, context = state.latestContext) {
  state.showResponseWrappers = shouldShowResponseWrappers(context);
}

function renderShell(state) {
  const container = state.container;
  if (!container) return;

  syncRuntimeState(state);
  teardownBindings(state);
  clearTargetAnimation(state);
  clearTargetedStepAnimation(state);

  container.innerHTML = `
    <div class="nc-root${state.showResponseWrappers ? " nc-root--boxed" : " nc-root--free"}">
      ${renderToolInstruction({ id: "nc_instruction" })}
      <div class="nc-stage" id="nc_stage">
        <div class="nc-prompt" id="nc_prompt">
          <span>Je veux</span>
          <strong id="nc_target_value"></strong>
          <span>jetons</span>
        </div>
        <div class="nc-boxes" id="nc_boxes"></div>
        <div class="nc-ops" id="nc_ops"></div>
        <div class="nc-answers" id="nc_answers"></div>
      </div>
    </div>
  `;

  state.root = container.querySelector(".nc-root");
  state.instructionEl = container.querySelector("#nc_instruction");
  state.promptEl = container.querySelector("#nc_prompt");
  state.targetEl = container.querySelector("#nc_target_value");
  state.boxesEl = container.querySelector("#nc_boxes");
  state.opsEl = container.querySelector("#nc_ops");
  state.answersEl = container.querySelector("#nc_answers");
  updateInstructionDisplay(state);
}

function loadNextQuestion(state, context = {}) {
  syncRuntimeState(state, context);
  const settings = normalizeSettings(context?.settings);
  state.minSolutionsToFind = settings.tokenBoxes.minSolutionsToFind;

  const nextQuestion = pickQuestion(settings, {
    avoidKey: state.lastQuestionKey,
    attempts: settings.exerciseType === EXERCISE_TYPES.TARGETED_CALCULATIONS
      ? 3000
      : settings.exerciseType === EXERCISE_TYPES.CLASSIC_CHALLENGE
        ? 360
        : 1800
  });

  if (!nextQuestion) {
    throw new Error("Impossible de générer une question pour Calcul ciblé avec ces réglages.");
  }

  state.currentQuestion = nextQuestion;
  state.lastQuestionKey = questionKey(nextQuestion);
  state.usedQuestionKeys.add(state.lastQuestionKey);
  state.questionIndex += 1;
  state.responseLines = createEmptyResponseLines(state.minSolutionsToFind);
  state.submittedResponseLines = [];
  state.activeResponseIndex = 0;
  clearTargetedStepAnimation(state);
  state.targetedTiles = isCalculationTileQuestion(nextQuestion) ? createTargetedInitialTiles(nextQuestion) : [];
  state.targetedSteps = [];
  state.submittedTargetedSteps = [];
  state.targetedEntry = createEmptyTargetedEntry();
  state.targetedSolved = false;
  state.targetedNextStepAppearing = false;
  state.answerRevealed = false;
  state.answerDisplayMode = "correction";
  state.targetAnimationKey = "";

  updateInstructionDisplay(state);

  if (!state.root) {
    renderShell(state);
  }

  renderQuestion(state);
  syncValidateState(state);
}

function renderQuestion(state) {
  if (!state.currentQuestion) return;

  state.root?.classList.remove(
    "nc-root--revealed",
    "nc-root--correct",
    "nc-root--incorrect",
    "nc-root--token-boxes",
    "nc-root--targeted",
    "nc-root--classic"
  );
  state.root?.classList.toggle("nc-root--boxed", state.showResponseWrappers);
  state.root?.classList.toggle("nc-root--free", !state.showResponseWrappers);

  if (isCalculationTileQuestion(state.currentQuestion)) {
    renderTargetedQuestion(state);
    return;
  }

  renderTokenBoxesQuestion(state);
}

function renderTokenBoxesQuestion(state) {
  state.root?.classList.add("nc-root--token-boxes");
  if (state.promptEl) {
    state.promptEl.innerHTML = `
      <span>Je veux</span>
      <strong id="nc_target_value">${escapeHtml(String(state.currentQuestion.target))}</strong>
      <span>jetons</span>
    `;
    state.targetEl = state.promptEl.querySelector("#nc_target_value");
  }
  if (state.opsEl) {
    state.opsEl.innerHTML = "";
    state.opsEl.hidden = true;
  }

  renderBoxes(state);
  renderAnswers(state);
}

/* -------------------------------------------------------------------------- */
/* Boites à jetons                                                             */
/* -------------------------------------------------------------------------- */

function renderBoxes(state) {
  const boxesEl = state.boxesEl;
  if (!boxesEl || !state.currentQuestion) return;
  teardownBoxBindings(state);

  const activeIds = getCurrentActiveBoxIds(state);
  const activeSet = new Set(activeIds.map(String));
  const canInteract = state.showResponseWrappers && !state.answerRevealed;

  boxesEl.hidden = false;
  boxesEl.className = "nc-boxes";
  boxesEl.style.gridTemplateColumns = `repeat(${state.currentQuestion.boxes.length}, minmax(0, 1fr))`;
  boxesEl.innerHTML = state.currentQuestion.boxes.map((box) => {
    const selected = activeSet.has(String(box.id));
    const tagName = canInteract ? "button" : "div";
    const attrs = canInteract
      ? `type="button" data-nc-box-id="${escapeHtml(box.id)}" aria-pressed="${selected ? "true" : "false"}"`
      : "";
    return `
      <${tagName} class="nc-token-box${selected ? " is-selected" : ""}${canInteract ? " nc-token-box--interactive" : ""}" ${attrs}>
        ${renderBoxSvg(box.value)}
      </${tagName}>
    `;
  }).join("");

  bindBoxEvents(state);
}

function renderAnswers(state) {
  const answersEl = state.answersEl;
  if (!answersEl || !state.currentQuestion) return;
  teardownAnswerBindings(state);

  if (!state.showResponseWrappers && !state.answerRevealed) {
    answersEl.innerHTML = "";
    answersEl.hidden = true;
    return;
  }

  answersEl.hidden = false;

  if (!state.showResponseWrappers && state.answerRevealed) {
    answersEl.innerHTML = renderSolutionWrappers(state, {
      mode: "free_correction"
    });
    return;
  }

  if (state.answerRevealed && state.answerDisplayMode !== "student") {
    answersEl.innerHTML = renderSolutionWrappers(state, {
      mode: "correction"
    });
    return;
  }

  answersEl.innerHTML = renderStudentWrappers(state, {
    readOnly: state.answerRevealed
  });

  bindAnswerEvents(state);
}

function renderStudentWrappers(state, { readOnly = false } = {}) {
  const lines = state.answerRevealed ? state.submittedResponseLines : state.responseLines;
  const evaluation = state.currentQuestion
    ? evaluateTokenBoxesResponse(state.currentQuestion, lines, state.minSolutionsToFind)
    : null;
  const duplicateIndexes = getDuplicateIndexes(lines);
  const reservedSlots = createReservedAnswerSlots(lines.length);

  return `
    <div class="nc-answer-stack${readOnly ? " nc-answer-stack--readonly" : ""}">
      ${lines.map((line, index) => {
        const boxIds = normalizeBoxIds(line.boxIds);
        const label = formatSelection(state.currentQuestion, boxIds);
        const lineEval = evaluation?.lineEvaluations?.[index] ?? null;
        const displayLabel = formatStudentResponseLabel(label, lineEval, readOnly);
        const isActive = !readOnly && index === state.activeResponseIndex;
        const isDuplicate = duplicateIndexes.has(index);
        const stateClass = readOnly && !lineEval?.isEmpty
          ? (lineEval?.isCorrectDistinct ? " is-correct" : " is-incorrect")
          : "";
        const expressionContent = displayLabel
          ? escapeHtml(displayLabel)
          : (readOnly ? "" : `<span class="nc-answer-placeholder">Réponse ${index + 1}</span>`);
        const tagName = readOnly ? "div" : "button";
        const attrs = readOnly ? "" : `type="button" data-nc-answer-index="${index}"`;
        return `
          <${tagName} class="nc-answer-wrapper${isActive ? " is-active" : ""}${isDuplicate ? " is-duplicate" : ""}${stateClass}" ${attrs}>
            ${isDuplicate ? `<span class="nc-duplicate-flag" title="Même sélection qu’une autre réponse">!</span>` : ""}
            <span class="nc-answer-expression">${expressionContent}</span>
          </${tagName}>
        `;
      }).join("")}
      ${reservedSlots}
    </div>
  `;
}

function formatStudentResponseLabel(label, lineEval, readOnly) {
  if (!label) return "";
  if (!readOnly || lineEval?.isEmpty || lineEval?.isCorrectDistinct) return label;
  const sum = Number(lineEval?.sum);
  return Number.isFinite(sum) ? `${label} = ${sum}` : label;
}

function createReservedAnswerSlots(visibleCount) {
  const count = Math.max(0, 3 - Math.max(0, Math.min(3, Number(visibleCount) || 0)));
  return Array.from({ length: count }, () => `
    <div class="nc-answer-wrapper nc-answer-wrapper--reserved" aria-hidden="true">
      <span class="nc-answer-expression"></span>
    </div>
  `).join("");
}

function renderSolutionWrappers(state, { mode = "correction" } = {}) {
  const evaluation = evaluateTokenBoxesResponse(
    state.currentQuestion,
    state.submittedResponseLines,
    state.minSolutionsToFind
  );
  const rows = mode === "correction"
    ? buildCorrectionRows(state, evaluation)
    : buildFreeCorrectionRows(evaluation);

  return `
    <div class="nc-answer-stack nc-answer-stack--readonly nc-answer-stack--correction">
      ${rows.map((row) => {
        const expression = formatSelection(state.currentQuestion, row.boxIds, { withResult: true });
        return `
          <div class="nc-answer-wrapper ${row.stateClass}">
            <span class="nc-answer-expression">${escapeHtml(expression)}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function buildCorrectionRows(state, evaluation) {
  const requiredCount = Math.max(1, Math.min(3, Number(state.minSolutionsToFind) || 3));
  const missingSolutions = [...evaluation.missingSolutions];
  const rows = [];

  for (let index = 0; index < requiredCount; index += 1) {
    const lineEval = evaluation.lineEvaluations[index] ?? null;
    if (lineEval?.isCorrectDistinct) {
      rows.push({
        boxIds: lineEval.boxIds,
        key: lineEval.key,
        stateClass: "is-correct"
      });
      continue;
    }

    const replacement = missingSolutions.shift();
    if (replacement) {
      rows.push({
        boxIds: replacement.boxIds,
        key: replacement.key,
        stateClass: "is-incorrect"
      });
    }
  }

  missingSolutions.forEach((solution) => {
    rows.push({
      boxIds: solution.boxIds,
      key: solution.key,
      stateClass: "is-neutral"
    });
  });

  return rows;
}

function buildFreeCorrectionRows(evaluation) {
  return evaluation.expectedSolutions.map((solution) => ({
    boxIds: solution.boxIds,
    key: solution.key,
    stateClass: "is-neutral"
  }));
}

function bindBoxEvents(state) {
  if (!state.boxesEl || !state.showResponseWrappers || state.answerRevealed || isTargetedQuestion(state.currentQuestion)) return;
  teardownBoxBindings(state);

  const abortController = new AbortController();
  const { signal } = abortController;
  state.boxAbortController = abortController;

  state.boxesEl.querySelectorAll("[data-nc-box-id]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleBoxInActiveResponse(state, String(button.dataset.ncBoxId || ""));
    }, { signal });
  });
}

function bindAnswerEvents(state) {
  if (!state.answersEl || state.answerRevealed || isTargetedQuestion(state.currentQuestion)) return;
  teardownAnswerBindings(state);

  const abortController = new AbortController();
  const { signal } = abortController;
  state.answerAbortController = abortController;

  state.answersEl.querySelectorAll("[data-nc-answer-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.ncAnswerIndex);
      if (!Number.isFinite(index)) return;
      state.activeResponseIndex = Math.max(0, Math.min(state.responseLines.length - 1, index));
      renderBoxes(state);
      renderAnswers(state);
      syncValidateState(state);
    }, { signal });
  });
}

function toggleBoxInActiveResponse(state, boxId) {
  if (!boxId || !state.responseLines[state.activeResponseIndex]) return;
  const line = state.responseLines[state.activeResponseIndex];
  const ids = normalizeBoxIds(line.boxIds);
  const index = ids.indexOf(boxId);
  if (index >= 0) ids.splice(index, 1);
  else ids.push(boxId);
  state.responseLines[state.activeResponseIndex] = { boxIds: ids };
  renderBoxes(state);
  renderAnswers(state);
  syncValidateState(state);
}

function getCurrentActiveBoxIds(state) {
  if (state.answerRevealed || !state.showResponseWrappers) return [];
  return normalizeBoxIds(state.responseLines[state.activeResponseIndex]?.boxIds ?? []);
}

/* -------------------------------------------------------------------------- */
/* Calculs ciblés                                                              */
/* -------------------------------------------------------------------------- */

function renderTargetedQuestion(state) {
  state.root?.classList.add("nc-root--targeted");
  state.root?.classList.toggle("nc-root--classic", isClassicChallengeQuestion(state.currentQuestion));
  renderTargetedPrompt(state);
  renderTargetedTiles(state);
  renderTargetedOps(state);
  renderTargetedAnswers(state);
  bindTargetedEvents(state);
}

function renderClassicChallengeQuestion(state) {
  state.root?.classList.add("nc-root--targeted", "nc-root--classic");
  renderTargetedPrompt(state);
  renderClassicChallengeTiles(state);
  renderClassicChallengeAnswers(state);
}

function renderClassicChallengeTiles(state) {
  const boxesEl = state.boxesEl;
  if (!boxesEl || !state.currentQuestion) return;
  teardownTargetedBindings(state);
  boxesEl.hidden = false;
  boxesEl.className = "nc-boxes nc-calc-tiles nc-classic-tiles";
  boxesEl.style.gridTemplateColumns = `repeat(${Math.max(1, state.targetedTiles.length)}, minmax(116px, 138px))`;
  boxesEl.innerHTML = state.targetedTiles.map((tile) => `
    <div
      class="nc-calc-tile nc-classic-tile${tile.kind === "result" ? " is-result" : ""}"
      data-nc-calc-tile-ref="${escapeHtml(tile.id)}"
    >
      <span class="nc-calc-tile-value${getCalcTileValueLengthClass(tile.value)}">${escapeHtml(String(tile.value))}</span>
    </div>
  `).join("");
}

function renderClassicChallengeAnswers(state) {
  if (state.opsEl) {
    state.opsEl.innerHTML = "";
    state.opsEl.hidden = true;
  }
  const answersEl = state.answersEl;
  if (!answersEl) return;
  teardownAnswerBindings(state);
  if (!state.answerRevealed) {
    answersEl.innerHTML = "";
    answersEl.hidden = true;
    return;
  }
  answersEl.hidden = false;
  const rows = Array.isArray(state.currentQuestion?.solutionSteps) ? state.currentQuestion.solutionSteps : [];
  answersEl.innerHTML = `
    <div class="nc-answer-stack nc-answer-stack--readonly nc-calc-step-stack nc-calc-step-stack--correction nc-classic-correction">
      ${rows.map((step, index) => `
        <div class="nc-answer-wrapper nc-calc-step is-neutral${index === rows.length - 1 ? " is-final-solution-step" : ""}">
          <span class="nc-answer-expression">${renderTargetedStepExpression(step, { resultFeedback: getTargetedFinalResultFeedback(state, step, true) })}</span>
          ${renderTargetedBackPlaceholder()}
        </div>
      `).join("")}
    </div>
  `;
}

function renderTargetedPrompt(state) {
  if (!state.promptEl) return;
  state.promptEl.innerHTML = `
    <strong id="nc_target_value">${escapeHtml(String(state.currentQuestion.target))}</strong>
  `;
  state.targetEl = state.promptEl.querySelector("#nc_target_value");

  const key = questionKey(state.currentQuestion);
  if (!state.answerRevealed && state.targetAnimationKey !== key) {
    state.targetAnimationKey = key;
    animateTargetValue(state, Number(state.currentQuestion.target));
  }
}

function renderTargetedTiles(state) {
  const boxesEl = state.boxesEl;
  if (!boxesEl) return;
  teardownTargetedBindings(state);
  boxesEl.hidden = false;
  boxesEl.className = "nc-boxes nc-calc-tiles";
  boxesEl.style.gridTemplateColumns = `repeat(${Math.max(1, state.targetedTiles.length)}, minmax(108px, 132px))`;

  const canInteractBase = state.showResponseWrappers && !state.answerRevealed && !state.targetedFlyingTileId;
  const canInteract = canInteractBase && !state.targetedPendingStep;
  boxesEl.innerHTML = state.targetedTiles.map((tile) => {
    const selected = tile.id === state.targetedEntry.leftId || tile.id === state.targetedEntry.rightId;
    const selectable = canInteract && canSelectTargetedTile(state, tile);
    const disabled = canInteractBase && !selectable && !selected;
    const tagName = selectable ? "button" : "div";
    const attrs = selectable
      ? `type="button" data-nc-calc-tile-id="${escapeHtml(tile.id)}"`
      : (disabled ? `aria-disabled="true"` : "");
    return `
      <${tagName}
        class="nc-calc-tile${tile.consumed ? " is-consumed" : ""}${disabled ? " is-disabled" : ""}${selected ? " is-selected" : ""}${tile.kind === "result" ? " is-result" : ""}${tile.justCreated ? " is-new" : ""}${selectable ? " nc-calc-tile--interactive" : ""}"
        data-nc-calc-tile-ref="${escapeHtml(tile.id)}"
        ${attrs}
      >
        <span class="nc-calc-tile-value${getCalcTileValueLengthClass(tile.value)}">${escapeHtml(String(tile.value))}</span>
      </${tagName}>
    `;
  }).join("");
}

function renderTargetedOps(state) {
  if (!state.opsEl) return;
  const canInteract = state.showResponseWrappers && !state.answerRevealed && !state.targetedPendingStep && !state.targetedFlyingTileId;
  const opsEnabled = canInteract && !!state.targetedEntry.leftId && !state.targetedEntry.op;
  const allowedOps = getAllowedCalculationOps(state.currentQuestion);
  state.opsEl.hidden = !state.showResponseWrappers;
  state.opsEl.innerHTML = `
    <div class="nc-calc-ops${opsEnabled ? " is-enabled" : ""}">
      ${allowedOps.map((op) => `
        <button
          class="nc-calc-op${state.targetedEntry.op === op ? " is-selected" : ""}"
          type="button"
          data-nc-calc-op="${escapeHtml(op)}"
          ${opsEnabled ? "" : "disabled"}
        >${escapeHtml(op)}</button>
      `).join("")}
    </div>
  `;
}


function renderTargetedAnswers(state) {
  const answersEl = state.answersEl;
  if (!answersEl) return;
  teardownAnswerBindings(state);

  if (!state.showResponseWrappers && !state.answerRevealed) {
    answersEl.innerHTML = "";
    answersEl.hidden = true;
    return;
  }

  answersEl.hidden = false;

  if (state.answerRevealed && state.answerDisplayMode !== "student") {
    answersEl.innerHTML = renderTargetedCorrection(state);
    return;
  }

  if (state.answerRevealed && state.answerDisplayMode === "student") {
    answersEl.innerHTML = renderTargetedStudentSteps(state, { readOnly: true });
    return;
  }

  if (!state.showResponseWrappers) {
    answersEl.innerHTML = "";
    answersEl.hidden = true;
    return;
  }

  answersEl.innerHTML = renderTargetedStudentSteps(state, { readOnly: false });
}

function renderTargetedStudentSteps(state, { readOnly = false } = {}) {
  const required = readOnly && isClassicChallengeQuestion(state.currentQuestion)
    ? Math.max(1, state.submittedTargetedSteps.length)
    : getTargetedRequiredStepCount(state.currentQuestion);
  const activeIndex = Math.min(state.targetedSteps.length, required - 1);
  const pendingStepIndex = state.targetedSteps.length;
  const pending = !readOnly ? state.targetedPendingStep : null;
  const pendingIsInline = pending && pending.phase !== "awaitTile";
  const delayNextStep = !readOnly && (pending?.phase === "awaitTile" || !!state.targetedFlyingTileId);
  const rows = Array.from({ length: required }, (_, index) => {
    const step = (readOnly ? state.submittedTargetedSteps : state.targetedSteps)[index] ?? null;
    const inlinePending = pendingIsInline && !step && index === pendingStepIndex ? pending : null;
    const isDelayedActiveStep = delayNextStep && index === activeIndex && !step && !inlinePending;
    const isVisible = !isDelayedActiveStep && (readOnly || index <= state.targetedSteps.length || !!inlinePending);
    const isActive = !readOnly && !isDelayedActiveStep && index === activeIndex && !step && !inlinePending;
    const isCompleted = !!step;
    const isCompleting = !!inlinePending;
    const isJustCompleted = !!step && pending?.phase === "awaitTile" && pending.step === step;
    const isAppearing = !step && !isDelayedActiveStep && state.targetedNextStepAppearing && index === activeIndex;
    const isFuture = !isVisible;
    const isLastCompleted = !readOnly && isCompleted && index === state.targetedSteps.length - 1;
    const renderedStep = step ?? inlinePending?.step ?? null;
    const resultFeedback = getTargetedFinalResultFeedback(state, renderedStep, index === required - 1);
    const shakeFinalResult = resultFeedback === "incorrect" && inlinePending?.phase === "result";
    const backEnabled = !readOnly
      && !state.targetedPendingStep
      && !state.targetedFlyingTileId
      && (isActive ? hasActiveTargetedEntry(state) : isLastCompleted);
    const content = step
      ? renderTargetedStepExpression(step, { resultFeedback })
      : inlinePending
        ? renderPendingTargetedStep(inlinePending, { resultFeedback, shakeFinalResult })
        : isActive
          ? renderCurrentTargetedEntry(state)
          : (readOnly ? renderEmptyTargetedStepExpression() : `<span class="nc-answer-placeholder">Étape ${index + 1}</span>`);
    const backButton = readOnly
      ? renderTargetedBackPlaceholder()
      : `
        <button
          class="nc-calc-back"
          type="button"
          data-nc-calc-back="${index}"
          ${backEnabled ? "" : "disabled"}
          aria-label="Revenir en arrière"
        ><span class="nc-material-icon" aria-hidden="true">undo</span></button>
      `;

    return `
      <div class="nc-answer-wrapper nc-calc-step${isActive ? " is-active" : ""}${isCompleted ? " is-completed" : ""}${isCompleting ? " is-completing" : ""}${isJustCompleted ? " is-just-completed" : ""}${isAppearing ? " is-appearing" : ""}${isFuture ? " is-future" : ""}${readOnly && step ? " is-student-step" : ""}">
        <span class="nc-answer-expression">${content}</span>
        ${backButton}
      </div>
    `;
  }).join("");

  return `
    <div class="nc-answer-stack nc-calc-step-stack${readOnly ? " nc-answer-stack--readonly" : ""}">
      ${rows}
    </div>
  `;
}

function renderCurrentTargetedEntry(state) {
  const entry = state.targetedEntry;
  const left = getTargetedTile(state, entry.leftId);
  const right = getTargetedTile(state, entry.rightId);
  const parts = [];
  if (left) parts.push(`<span>${escapeHtml(String(left.value))}</span>`);
  else parts.push(`<span class="nc-answer-placeholder">Entre un calcul</span>`);
  if (entry.op) parts.push(`<span>${escapeHtml(entry.op)}</span>`);
  if (right) parts.push(`<span>${escapeHtml(String(right.value))}</span>`);
  return parts.join(" ");
}

function renderPendingTargetedStep(pending, options = {}) {
  const phase = String(pending?.phase || "expression");
  return renderTargetedStepExpression(pending?.step ?? {}, { phase, animateReveal: true, ...options });
}

function renderTargetedStepExpression(step, {
  phase = "complete",
  animateReveal = false,
  resultFeedback = "",
  shakeFinalResult = false
} = {}) {
  const safePhase = String(phase || "complete");
  const showEquals = safePhase === "equals" || safePhase === "result";
  const showResult = safePhase === "result" || safePhase === "complete";
  const equalsVisible = showEquals || safePhase === "complete";
  const visibleClass = (visible) => visible ? " is-visible" : "";
  const animatedClass = (visible) => visible && animateReveal ? " is-animated" : "";
  const safeFeedback = resultFeedback === "correct" || resultFeedback === "incorrect" ? resultFeedback : "";
  const resultFeedbackClass = safeFeedback ? ` is-final-${safeFeedback}` : "";
  const resultShakeClass = shakeFinalResult ? " is-shaking" : "";
  const resultAttrs = step?.resultTileId
    ? ` data-nc-calc-result-source="${escapeHtml(step.resultTileId)}"`
    : "";

  return [
    `<span>${escapeHtml(String(step.leftValue ?? ""))}</span>`,
    `<span>${escapeHtml(String(step.op ?? ""))}</span>`,
    `<span>${escapeHtml(String(step.rightValue ?? ""))}</span>`,
    `<span class="nc-calc-step-reveal${visibleClass(equalsVisible)}${animatedClass(equalsVisible)}">=</span>`,
    `<span class="nc-calc-step-reveal nc-calc-step-result${visibleClass(showResult)}${animatedClass(showResult)}${resultFeedbackClass}${resultShakeClass}"${resultAttrs}>${escapeHtml(String(step.result ?? ""))}</span>`
  ].join(" ");
}

function renderEmptyTargetedStepExpression() {
  return `
    <span></span>
    <span></span>
    <span></span>
    <span class="nc-calc-step-reveal is-visible"></span>
    <span class="nc-calc-step-reveal is-visible"></span>
  `;
}

function renderTargetedBackPlaceholder() {
  return `
    <button
      class="nc-calc-back nc-calc-back--placeholder"
      type="button"
      disabled
      aria-hidden="true"
      tabindex="-1"
    ><span class="nc-material-icon" aria-hidden="true">undo</span></button>
  `;
}

function renderTargetedCorrection(state) {
  const evaluation = evaluateTargetedCalculationResponse(state.currentQuestion, state.submittedTargetedSteps);
  const rows = state.showResponseWrappers
    ? buildTargetedCorrectionRows(state, evaluation)
    : (state.currentQuestion.solutionSteps ?? []).map((step) => ({
        step,
        className: "is-neutral"
      }));

  return `
    <div class="nc-answer-stack nc-answer-stack--readonly nc-calc-step-stack nc-calc-step-stack--correction">
      ${rows.map((row) => `
        <div class="nc-answer-wrapper nc-calc-step ${row.className}">
          <span class="nc-answer-expression">${row.step ? renderTargetedStepExpression(row.step, { resultFeedback: getTargetedFinalResultFeedback(state, row.step, row.isFinalStep) }) : renderEmptyTargetedStepExpression()}</span>
          ${renderTargetedBackPlaceholder()}
        </div>
      `).join("")}
    </div>
  `;
}

function buildTargetedCorrectionRows(state, evaluation) {
  const solutionSteps = evaluation.solutionSteps ?? [];
  const submitted = state.submittedTargetedSteps ?? [];
  const isClassic = isClassicChallengeQuestion(state.currentQuestion);

  if (isClassic && evaluation.isCorrect && submitted.length) {
    return submitted.map((step) => ({
      step,
      className: "is-correct",
      isFinalStep: Number(step?.result) === Number(state.currentQuestion?.target)
    }));
  }

  if (!isClassic && evaluation.isCorrect && submitted.length) {
    const required = getTargetedRequiredStepCount(state.currentQuestion);
    return Array.from({ length: required }, (_, index) => ({
      step: submitted[index] ?? solutionSteps[index] ?? null,
      className: submitted[index] ? "is-correct" : "is-correction",
      isFinalStep: index === required - 1
    }));
  }

  const submittedByKey = new Map();
  submitted.forEach((step) => {
    const key = targetedStepKey(step);
    if (key && !submittedByKey.has(key)) submittedByKey.set(key, step);
  });

  return solutionSteps.map((solutionStep, index) => {
    const key = targetedStepKey(solutionStep);
    const submittedStep = key ? submittedByKey.get(key) : null;
    return {
      step: submittedStep ?? solutionStep,
      className: submittedStep ? "is-correct" : (isClassic ? "is-neutral" : "is-correction"),
      isFinalStep: Number((submittedStep ?? solutionStep)?.result) === Number(state.currentQuestion?.target)
        || (!isClassic && index === solutionSteps.length - 1)
    };
  });
}


function getTargetedFinalResultFeedback(state, step, isFinalStep) {
  if (!step) return "";
  if (isClassicChallengeQuestion(state.currentQuestion)) {
    return Number(step.result) === Number(state.currentQuestion?.target) ? "correct" : "";
  }
  if (!isFinalStep) return "";
  const result = Number(step.result);
  const target = Number(state.currentQuestion?.target);
  if (!Number.isFinite(result) || !Number.isFinite(target)) return "";
  return result === target ? "correct" : "incorrect";
}

function getCalcTileValueLengthClass(value) {
  const length = String(value ?? "").trim().length;
  if (length >= 4) return " has-4-chars";
  if (length >= 3) return " has-3-chars";
  return "";
}

function bindTargetedEvents(state) {
  if (!state.showResponseWrappers || state.answerRevealed || state.targetedPendingStep || state.targetedFlyingTileId || !isCalculationTileQuestion(state.currentQuestion)) return;
  const abortController = new AbortController();
  const { signal } = abortController;
  state.targetedAbortController = abortController;

  state.boxesEl?.querySelectorAll("[data-nc-calc-tile-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectTargetedTile(state, String(button.dataset.ncCalcTileId || ""));
    }, { signal });
  });

  state.opsEl?.querySelectorAll("[data-nc-calc-op]").forEach((button) => {
    button.addEventListener("click", () => {
      selectTargetedOperation(state, String(button.dataset.ncCalcOp || ""));
    }, { signal });
  });

  state.answersEl?.querySelectorAll("[data-nc-calc-back]").forEach((button) => {
    button.addEventListener("click", () => {
      handleTargetedBack(state);
    }, { signal });
  });
}

function selectTargetedTile(state, tileId) {
  if (!state.showResponseWrappers || state.answerRevealed || state.targetedPendingStep || state.targetedFlyingTileId) return;
  const tile = getTargetedTile(state, tileId);
  if (!tile || !canSelectTargetedTile(state, tile)) return;

  if (!state.targetedEntry.leftId) {
    state.targetedEntry.leftId = tile.id;
    rerenderTargetedInteraction(state);
    return;
  }

  if (state.targetedEntry.op && !state.targetedEntry.rightId) {
    completeTargetedStep(state, tile.id);
  }
}

function selectTargetedOperation(state, op) {
  if (!state.showResponseWrappers || state.answerRevealed || state.targetedPendingStep || state.targetedFlyingTileId) return;
  const safeOp = normalizeCalcOp(op);
  if (!safeOp || !state.targetedEntry.leftId || state.targetedEntry.op) return;
  state.targetedEntry.op = safeOp;
  rerenderTargetedInteraction(state);
}

function completeTargetedStep(state, rightTileId) {
  if (state.targetedPendingStep || state.targetedFlyingTileId) return;
  const left = getTargetedTile(state, state.targetedEntry.leftId);
  const right = getTargetedTile(state, rightTileId);
  const op = normalizeCalcOp(state.targetedEntry.op);
  if (!left || !right || !op || left.id === right.id || left.consumed || right.consumed) return;
  if (op === "-" && Number(left.value) < Number(right.value)) return;

  const result = calculate(left.value, op, right.value);
  if (!isAllowedTargetedCalculationResult(result, state.currentQuestion)) return;

  left.consumed = true;
  right.consumed = true;

  const stepIndex = state.targetedSteps.length;
  const requiredStepCount = getTargetedRequiredStepCount(state.currentQuestion);
  const isLastTargetedStep = stepIndex + 1 >= requiredStepCount;
  const reachesClassicTarget = isClassicChallengeQuestion(state.currentQuestion)
    && Number(result) === Number(state.currentQuestion?.target);
  const resultTile = {
    id: `r${stepIndex}`,
    value: result,
    kind: "result",
    sourceIds: [...(left.sourceIds ?? []), ...(right.sourceIds ?? [])],
    consumed: false,
    justCreated: true
  };

  const step = {
    leftValue: Number(left.value),
    rightValue: Number(right.value),
    result,
    op,
    leftSources: [...(left.sourceIds ?? [])],
    rightSources: [...(right.sourceIds ?? [])],
    leftTileId: left.id,
    rightTileId: right.id,
    resultTileId: resultTile.id,
    key: ""
  };
  step.key = targetedStepKey(step);

  state.targetedPendingStep = {
    step,
    resultTile,
    phase: "expression"
  };
  state.targetedEntry = createEmptyTargetedEntry();

  rerenderTargetedInteraction(state);

  scheduleTargetedStepAnimationTimer(state, () => {
    if (!state.targetedPendingStep || state.targetedPendingStep.step !== step) return;
    state.targetedPendingStep.phase = "equals";
    renderTargetedQuestion(state);
  }, TARGETED_STEP_EQUALS_DELAY_MS);

  scheduleTargetedStepAnimationTimer(state, () => {
    if (!state.targetedPendingStep || state.targetedPendingStep.step !== step) return;
    state.targetedPendingStep.phase = "result";
    renderTargetedQuestion(state);
  }, TARGETED_STEP_RESULT_DELAY_MS);

  scheduleTargetedStepAnimationTimer(state, () => {
    if (!state.targetedPendingStep || state.targetedPendingStep.step !== step) return;
    state.targetedSteps.push(step);
    state.targetedPendingStep.phase = "awaitTile";
    renderTargetedQuestion(state);
  }, TARGETED_STEP_COMMIT_DELAY_MS);

  scheduleTargetedStepAnimationTimer(state, () => {
    if (!state.targetedPendingStep || state.targetedPendingStep.step !== step) return;
    if (isLastTargetedStep || reachesClassicTarget) {
      state.targetedPendingStep = null;
      renderTargetedQuestion(state);
      maybeResolveTargetedQuestion(state);
      return;
    }
    const flightSourceCenter = getTargetedResultSourceCenter(state, resultTile.id);
    const previousTileCenters = getTargetedTileCenters(state);
    state.targetedTiles.push(resultTile);
    state.targetedPendingStep = null;
    state.targetedFlyingTileId = resultTile.id;
    renderTargetedQuestion(state);
    animateTargetedExistingTileShift(state, previousTileCenters, resultTile.id);
    animateTargetedResultTileFlight(state, resultTile.id, flightSourceCenter);
  }, TARGETED_STEP_TILE_DELAY_MS);

  if (!isLastTargetedStep && !reachesClassicTarget) {
    scheduleTargetedStepAnimationTimer(state, () => {
      resultTile.justCreated = false;
      if (!state.answerRevealed) {
        if (state.targetedFlyingTileId === resultTile.id) {
          state.targetedFlyingTileId = "";
        }
        state.targetedNextStepAppearing = true;
        renderTargetedQuestion(state);
        state.targetedNextStepAppearing = false;
        const latestStep = state.targetedSteps[state.targetedSteps.length - 1] ?? null;
        const liveResultTile = getTargetedTile(state, resultTile.id);
        if (liveResultTile === resultTile && latestStep?.resultTileId === resultTile.id) {
          maybeResolveTargetedQuestion(state);
        }
      }
    }, TARGETED_STEP_TILE_DELAY_MS + TARGETED_RESULT_TILE_ANIMATION_MS);
  }
}

function maybeResolveTargetedQuestion(state) {
  if (!isCalculationTileQuestion(state.currentQuestion) || state.answerRevealed) return;
  const evaluation = evaluateTargetedCalculationResponse(state.currentQuestion, state.targetedSteps);
  if (!evaluation.isCorrect) return;

  state.targetedSolved = true;
  state.submittedTargetedSteps = cloneTargetedSteps(state.targetedSteps);
  requestReveal(state);
}

function handleTargetedBack(state) {
  if (state.answerRevealed || state.targetedPendingStep || state.targetedFlyingTileId) return;

  if (state.targetedEntry.op) {
    state.targetedEntry.op = "";
    rerenderTargetedInteraction(state);
    return;
  }

  if (state.targetedEntry.leftId) {
    state.targetedEntry.leftId = "";
    rerenderTargetedInteraction(state);
    return;
  }

  undoLastTargetedStep(state);
}

function undoLastTargetedStep(state) {
  const step = state.targetedSteps[state.targetedSteps.length - 1];
  if (!step) return;

  const resultTile = getTargetedTile(state, step.resultTileId);
  if (resultTile?.consumed) return;

  state.targetedSteps.pop();
  state.targetedTiles = state.targetedTiles.filter((tile) => tile.id !== step.resultTileId);

  const leftTile = getTargetedTile(state, step.leftTileId);
  const rightTile = getTargetedTile(state, step.rightTileId);
  if (leftTile) leftTile.consumed = false;
  if (rightTile) rightTile.consumed = false;

  state.targetedEntry = createEmptyTargetedEntry();
  rerenderTargetedInteraction(state);
}

function rerenderTargetedInteraction(state) {
  renderTargetedQuestion(state);
  syncValidateState(state);
}

function canSelectTargetedTile(state, tile) {
  if (state.targetedFlyingTileId) return false;
  if (state.targetedPendingStep) return false;
  if (state.targetedSteps.length >= getTargetedRequiredStepCount(state.currentQuestion)) return false;
  if (!tile || tile.consumed) return false;
  const entry = state.targetedEntry;

  if (!entry.leftId) return true;
  if (!entry.op) return false;
  if (tile.id === entry.leftId) return false;

  const left = getTargetedTile(state, entry.leftId);
  if (!left) return false;
  if (!isAllowedTargetedCalculationResult(calculate(left.value, entry.op, tile.value), state.currentQuestion)) return false;

  return true;
}

function getTargetedTile(state, tileId) {
  const id = String(tileId ?? "");
  if (!id) return null;
  return state.targetedTiles.find((tile) => String(tile.id) === id) ?? null;
}

function animateTargetedResultTileFlight(state, tileId, sourceCenter = null) {
  window.requestAnimationFrame(() => {
    if (state.answerRevealed || state.targetedFlyingTileId !== tileId) return;
    const tileEl = findTargetedTileElement(state, tileId);
    const tileCenter = getElementCenter(tileEl);
    const resolvedSourceCenter = sourceCenter ?? getTargetedResultSourceCenter(state, tileId);
    if (!tileCenter || !resolvedSourceCenter) return;

    const deltaX = resolvedSourceCenter.x - tileCenter.x;
    const deltaY = resolvedSourceCenter.y - tileCenter.y;

    const startTransform = `translate(${deltaX}px, ${deltaY}px) scale(${TARGETED_RESULT_TILE_START_SCALE})`;
    const endTransform = "translate(0, 0) scale(1)";

    if (typeof tileEl.animate !== "function") {
      tileEl.style.transform = startTransform;
      tileEl.style.transition = `transform ${TARGETED_RESULT_TILE_ANIMATION_MS}ms linear`;
      window.requestAnimationFrame(() => {
        tileEl.style.transform = endTransform;
      });
      return;
    }

    tileEl.animate([
      {
        transform: startTransform
      },
      {
        transform: endTransform
      }
    ], {
      duration: TARGETED_RESULT_TILE_ANIMATION_MS,
      easing: "linear",
      fill: "both"
    });
  });
}

function animateTargetedExistingTileShift(state, previousTileCenters, excludedTileId = "") {
  if (!previousTileCenters?.size) return;
  window.requestAnimationFrame(() => {
    if (state.answerRevealed) return;
    const excludedId = String(excludedTileId ?? "");

    previousTileCenters.forEach((previousCenter, tileId) => {
      if (!previousCenter || String(tileId) === excludedId) return;
      const tileEl = findTargetedTileElement(state, tileId);
      const currentCenter = getElementCenter(tileEl);
      if (!tileEl || !currentCenter) return;

      const deltaX = previousCenter.x - currentCenter.x;
      const deltaY = previousCenter.y - currentCenter.y;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;

      const startTransform = `translate(${deltaX}px, ${deltaY}px)`;
      const endTransform = "translate(0, 0)";

      tileEl.style.willChange = "transform";

      if (typeof tileEl.animate !== "function") {
        tileEl.style.transform = startTransform;
        tileEl.style.transition = `transform ${TARGETED_EXISTING_TILE_SHIFT_ANIMATION_MS}ms cubic-bezier(.22, 1, .36, 1)`;
        window.requestAnimationFrame(() => {
          tileEl.style.transform = endTransform;
        });
        window.setTimeout(() => {
          tileEl.style.willChange = "";
        }, TARGETED_EXISTING_TILE_SHIFT_ANIMATION_MS);
        return;
      }

      const animation = tileEl.animate([
        {
          transform: startTransform
        },
        {
          transform: endTransform
        }
      ], {
        duration: TARGETED_EXISTING_TILE_SHIFT_ANIMATION_MS,
        easing: "cubic-bezier(.22, 1, .36, 1)",
        fill: "both"
      });

      animation.finished?.then(
        () => {
          if (tileEl.isConnected) tileEl.style.willChange = "";
        },
        () => {
          if (tileEl.isConnected) tileEl.style.willChange = "";
        }
      );
    });
  });
}

function findTargetedTileElement(state, tileId) {
  const id = String(tileId ?? "");
  if (!id || !state.boxesEl) return null;
  return [...state.boxesEl.querySelectorAll("[data-nc-calc-tile-ref]")]
    .find((tileEl) => String(tileEl.dataset.ncCalcTileRef || "") === id) ?? null;
}

function findTargetedResultSourceElement(state, tileId) {
  const id = String(tileId ?? "");
  if (!id || !state.answersEl) return null;
  return [...state.answersEl.querySelectorAll("[data-nc-calc-result-source]")]
    .find((sourceEl) => String(sourceEl.dataset.ncCalcResultSource || "") === id) ?? null;
}

function getTargetedTileCenters(state) {
  const centers = new Map();
  if (!state.boxesEl) return centers;
  state.boxesEl.querySelectorAll("[data-nc-calc-tile-ref]").forEach((tileEl) => {
    const id = String(tileEl.dataset.ncCalcTileRef || "");
    const center = getElementCenter(tileEl);
    if (id && center) centers.set(id, center);
  });
  return centers;
}

function getTargetedResultSourceCenter(state, tileId) {
  return getElementCenter(findTargetedResultSourceElement(state, tileId));
}

function getElementCenter(element) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
}

function calculate(left, op, right) {
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.NaN;
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "×") return a * b;
  if (op === "÷") {
    if (b === 0 || !Number.isInteger(a) || !Number.isInteger(b) || a % b !== 0) return Number.NaN;
    return a / b;
  }
  return Number.NaN;
}

function isAllowedTargetedCalculationResult(result, question = null) {
  const max = isClassicChallengeQuestion(question) ? 2000 : TARGETED_CALCULATION_RESULT_MAX;
  return Number.isFinite(result) && Number.isInteger(result) && result >= 0 && result <= max;
}

function normalizeCalcOp(value) {
  const safe = String(value ?? "").trim();
  if (safe === "+" || safe === "-" || safe === "×" || safe === "÷") return safe;
  if (safe === "/" || safe === ":") return "÷";
  return "";
}

function getAllowedCalculationOps(question) {
  const ops = Array.isArray(question?.allowedOperations) ? question.allowedOperations : ["+", "-", "×"];
  const normalized = ops.map(normalizeCalcOp).filter(Boolean);
  return normalized.length ? [...new Set(normalized)] : ["+", "-", "×"];
}

function createEmptyTargetedEntry() {
  return { leftId: "", op: "", rightId: "" };
}

function hasActiveTargetedEntry(state) {
  return !!state.targetedEntry.leftId || !!state.targetedEntry.op || !!state.targetedEntry.rightId;
}

function scheduleTargetedStepAnimationTimer(state, callback, delay) {
  const timerId = window.setTimeout(() => {
    state.targetedStepAnimationTimers = state.targetedStepAnimationTimers.filter((id) => id !== timerId);
    callback();
  }, delay);
  state.targetedStepAnimationTimers.push(timerId);
}

function clearTargetedStepAnimation(state) {
  state.targetedStepAnimationTimers.forEach((timerId) => window.clearTimeout(timerId));
  state.targetedStepAnimationTimers = [];
  state.targetedPendingStep = null;
  state.targetedFlyingTileId = "";
  state.targetedNextStepAppearing = false;
}

/* -------------------------------------------------------------------------- */
/* Révélation / shell commun                                                   */
/* -------------------------------------------------------------------------- */

function revealAnswer(state) {
  if (!state.currentQuestion) return;

  if (isCalculationTileQuestion(state.currentQuestion)) {
    if (!state.submittedTargetedSteps.length) {
      state.submittedTargetedSteps = cloneTargetedSteps(state.targetedSteps);
    }
    state.answerRevealed = true;
    state.answerDisplayMode = state.showResponseWrappers ? "correction" : "correction";
    const evaluation = evaluateTargetedCalculationResponse(state.currentQuestion, state.submittedTargetedSteps);
    state.root?.classList.add("nc-root--revealed");
    if (state.showResponseWrappers) {
      state.root?.classList.toggle("nc-root--correct", evaluation.isCorrect);
      state.root?.classList.toggle("nc-root--incorrect", !evaluation.isCorrect);
    } else {
      state.root?.classList.remove("nc-root--correct", "nc-root--incorrect");
    }
    renderTargetedQuestion(state);
    syncValidateState(state);
    return;
  }

  if (state.showResponseWrappers) {
    state.submittedResponseLines = cloneResponseLines(state.responseLines);
  } else {
    state.submittedResponseLines = [];
  }

  state.answerRevealed = true;
  state.answerDisplayMode = "correction";
  const evaluation = evaluateTokenBoxesResponse(
    state.currentQuestion,
    state.submittedResponseLines,
    state.minSolutionsToFind
  );

  state.root?.classList.add("nc-root--revealed");
  if (state.showResponseWrappers) {
    state.root?.classList.toggle("nc-root--correct", evaluation.isCorrect);
    state.root?.classList.toggle("nc-root--incorrect", !evaluation.isCorrect);
  } else {
    state.root?.classList.remove("nc-root--correct", "nc-root--incorrect");
  }

  renderBoxes(state);
  renderAnswers(state);
  syncValidateState(state);
}

function requestReveal(state) {
  state.latestContext?.services?.requestAnswerPhase?.({
    manual: false,
    showAnswerNow: true,
    wasCorrect: isCurrentAnswerCorrect(state)
  });
}

function canSubmitAnswer(state) {
  if (!state.showResponseWrappers || state.answerRevealed || !state.currentQuestion) return false;
  if (isCalculationTileQuestion(state.currentQuestion)) return false;
  if (hasDuplicateResponseLines(state.responseLines)) return false;
  return state.responseLines.some((line) => normalizeBoxIds(line.boxIds).length >= 2);
}

function isCurrentAnswerCorrect(state) {
  if (!state.currentQuestion) return false;

  if (isCalculationTileQuestion(state.currentQuestion)) {
    return evaluateTargetedCalculationResponse(state.currentQuestion, state.targetedSteps).isCorrect;
  }

  if (!state.showResponseWrappers) return false;
  const evaluation = evaluateTokenBoxesResponse(state.currentQuestion, state.responseLines, state.minSolutionsToFind);
  return evaluation.isCorrect && !hasDuplicateResponseLines(state.responseLines);
}

function getShellAnswerDisplayState(state) {
  const canToggle = canToggleStudentAnswerDisplay(state);
  return {
    canToggle,
    mode: canToggle ? normalizeAnswerDisplayMode(state.answerDisplayMode) : "correction"
  };
}

function applyShellAnswerDisplayMode(state, mode) {
  if (!state.showResponseWrappers || !state.answerRevealed || !state.currentQuestion) return false;
  if (!canToggleStudentAnswerDisplay(state)) {
    state.answerDisplayMode = "correction";
    if (isCalculationTileQuestion(state.currentQuestion)) renderTargetedAnswers(state);
    else renderAnswers(state);
    return false;
  }
  state.answerDisplayMode = normalizeAnswerDisplayMode(mode);
  if (isCalculationTileQuestion(state.currentQuestion)) renderTargetedAnswers(state);
  else renderAnswers(state);
  return true;
}

function canToggleStudentAnswerDisplay(state) {
  if (!state.showResponseWrappers || !state.answerRevealed || !state.currentQuestion) return false;
  if (isCalculationTileQuestion(state.currentQuestion)) {
    if (!state.submittedTargetedSteps.length) return false;
    return !evaluateTargetedCalculationResponse(state.currentQuestion, state.submittedTargetedSteps).isCorrect;
  }
  if (!state.submittedResponseLines.length) return false;
  const evaluation = evaluateTokenBoxesResponse(
    state.currentQuestion,
    state.submittedResponseLines,
    state.minSolutionsToFind
  );
  return !evaluation.isCorrect;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function normalizeAnswerDisplayMode(value) {
  return String(value ?? "").trim().toLowerCase() === "student" ? "student" : "correction";
}

function createEmptyResponseLines(count) {
  return Array.from({ length: Math.max(1, Math.min(3, Number(count) || 3)) }, () => ({ boxIds: [] }));
}

function cloneResponseLines(lines = []) {
  return (Array.isArray(lines) ? lines : []).map((line) => ({
    boxIds: normalizeBoxIds(line.boxIds)
  }));
}

function cloneTargetedSteps(steps = []) {
  return (Array.isArray(steps) ? steps : []).map((step) => ({
    ...step,
    leftSources: [...(step.leftSources ?? [])],
    rightSources: [...(step.rightSources ?? [])]
  }));
}

function getDuplicateIndexes(lines = []) {
  const firstByKey = new Map();
  const indexes = new Set();

  normalizeResponseLinesForDuplicate(lines).forEach((line, index) => {
    if (!line.key) return;
    if (firstByKey.has(line.key)) {
      indexes.add(firstByKey.get(line.key));
      indexes.add(index);
      return;
    }
    firstByKey.set(line.key, index);
  });

  return indexes;
}

function normalizeResponseLinesForDuplicate(lines = []) {
  return (Array.isArray(lines) ? lines : []).map((line) => {
    const boxIds = normalizeBoxIds(line.boxIds);
    return {
      boxIds,
      key: boxIds.length ? solutionKeyFromIds(boxIds) : ""
    };
  });
}

function syncValidateState(state) {
  state.latestContext?.services?.notifyValidationStateChanged?.();
}

function updateInstructionDisplay(state) {
  const fallback = "Utilise tous les nombres pour atteindre le nombre cible.";
  const text = resolveQuestionInstructionText(state.latestContext, fallback);
  setToolInstructionText(state.instructionEl, text);
}

function shouldShowResponseWrappers(context = {}) {
  return getResponseUi(context) === "boxed";
}

function getResponseUi(context = {}) {
  return normalizeResponseUi(
    context?.responseUi
    ?? context?.response_ui
    ?? context?.passationProfile?.responseUi
    ?? context?.passationProfile?.response_ui
  ) || "boxed";
}

function normalizeResponseUi(value) {
  const safeValue = String(value ?? "").trim().toLowerCase();
  if (safeValue === "boxed" || safeValue === "free") return safeValue;
  return "";
}


function isTargetedQuestion(question) {
  return String(question?.exerciseType ?? "") === EXERCISE_TYPES.TARGETED_CALCULATIONS;
}

function isClassicChallengeQuestion(question) {
  return String(question?.exerciseType ?? "") === EXERCISE_TYPES.CLASSIC_CHALLENGE;
}

function isCalculationTileQuestion(question) {
  return isTargetedQuestion(question) || isClassicChallengeQuestion(question);
}

function animateTargetValue(state, target) {
  clearTargetAnimation(state);
  if (!state.targetEl || state.answerRevealed) {
    if (state.targetEl) state.targetEl.textContent = String(target);
    return;
  }

  const max = Math.max(20, Math.min(TARGETED_CALCULATION_RESULT_MAX, Number(target) + 80));
  let tick = 0;
  state.targetEl.classList.add("is-rolling");
  state.targetAnimationTimer = window.setInterval(() => {
    tick += 1;
    if (!state.targetEl) return;
    if (tick >= 12) {
      clearTargetAnimation(state);
      state.targetEl.textContent = String(target);
      state.targetEl.classList.remove("is-rolling");
      state.targetEl.classList.add("is-settled");
      window.setTimeout(() => state.targetEl?.classList.remove("is-settled"), 420);
      return;
    }
    state.targetEl.textContent = String(Math.floor(Math.random() * (max + 1)));
  }, 32);
}

function clearTargetAnimation(state) {
  if (state.targetAnimationTimer) {
    window.clearInterval(state.targetAnimationTimer);
    state.targetAnimationTimer = null;
  }
}

function teardownState(state, container) {
  teardownBindings(state);
  clearTargetAnimation(state);
  clearTargetedStepAnimation(state);
  if (container) container.innerHTML = "";
  state.container = null;
  state.root = null;
  state.instructionEl = null;
  state.promptEl = null;
  state.targetEl = null;
  state.boxesEl = null;
  state.opsEl = null;
  state.answersEl = null;
  state.currentQuestion = null;
  state.lastQuestionKey = null;
  state.usedQuestionKeys.clear();
  state.responseLines = [];
  state.submittedResponseLines = [];
  state.activeResponseIndex = 0;
  state.targetedTiles = [];
  state.targetedSteps = [];
  state.submittedTargetedSteps = [];
  state.targetedEntry = createEmptyTargetedEntry();
  state.targetedPendingStep = null;
  state.targetedFlyingTileId = "";
  state.targetedStepAnimationTimers = [];
  state.targetedNextStepAppearing = false;
  state.targetedSolved = false;
  state.answerRevealed = false;
  state.answerDisplayMode = "correction";
}

function teardownBindings(state) {
  teardownBoxBindings(state);
  teardownAnswerBindings(state);
  teardownOpsBindings(state);
  teardownTargetedBindings(state);
}

function teardownBoxBindings(state) {
  state.boxAbortController?.abort?.();
  state.boxAbortController = null;
}

function teardownAnswerBindings(state) {
  state.answerAbortController?.abort?.();
  state.answerAbortController = null;
}

function teardownOpsBindings(state) {
  state.opsAbortController?.abort?.();
  state.opsAbortController = null;
}

function teardownTargetedBindings(state) {
  state.targetedAbortController?.abort?.();
  state.targetedAbortController = null;
}

function renderBoxSvg(value) {
  return `
    <svg
      viewBox="0 0 220 200"
      aria-hidden="true"
      class="nc-token-box-svg"
    >
      <polygon
        points="34,18 186,18 198,28 22,28"
        fill="#f0c991"
        stroke="#8f6738"
        stroke-width="2.5"
      />
      <rect
        x="18"
        y="28"
        width="184"
        height="34"
        rx="3"
        fill="#e0b47c"
        stroke="#8f6738"
        stroke-width="2.5"
      />
      <rect
        x="24"
        y="62"
        width="172"
        height="120"
        rx="3"
        fill="#d7a46d"
        stroke="#8f6738"
        stroke-width="2.5"
      />
      <line
        x1="24"
        y1="62"
        x2="196"
        y2="62"
        stroke="#7c5528"
        stroke-width="2"
        opacity=".45"
      />
      <text
        x="110"
        y="130"
        text-anchor="middle"
        dominant-baseline="middle"
        font-family="Andika, system-ui, sans-serif"
        font-size="84"
        font-weight="700"
        fill="#101010"
      >${escapeHtml(String(value))}</text>
    </svg>
  `;
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  ensureToolInstructionStyles();

  const href = new URL("./activity.css", import.meta.url).href;
  if (document.querySelector(`link[data-nombre-cible-activity-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.nombreCibleActivityStyle = href;
  document.head.appendChild(link);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
