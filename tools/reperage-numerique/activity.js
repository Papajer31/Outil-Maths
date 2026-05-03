import {
  LINE_TYPES,
  QUESTION_TYPES,
  PICBILLE_DRAW,
  LINE_DRAW,
  normalizeSettings,
  pickQuestion,
  questionKey,
  evaluateNumberAnswer,
  evaluateGraduationAnswer,
  getNearestTickIndex,
  getPicbilleBoxX
} from "./model.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveQuestionInstructionText,
  setToolInstructionText
} from "../../shared/tool-instruction.js";

let stylesInjected = false;

export function createActivity(initialContext = {}) {
  injectStyles();

  const state = createRuntimeState(initialContext);

  return {
    mount(container, context = initialContext) {
      state.container = container;
      state.latestContext = context ?? state.latestContext;
      renderShell(state);
      syncValidateState(state);
    },

    next(container, context = initialContext) {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      if (!state.container) return;

      if (!state.root) renderShell(state);
      loadNextQuestion(state, state.latestContext ?? {});
    },

    showAnswer(container, context = initialContext) {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
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

    supportsShellValidation(context = state.latestContext) {
      return shouldUseShellValidation(context);
    },

    canValidate() {
      return !state.answerRevealed && canSubmitAnswer(state);
    },

    validate() {
      if (!canSubmitAnswer(state) || state.answerRevealed) return false;
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
    linePanelEl: null,
    lineSvgEl: null,
    laneEl: null,
    connectorEl: null,
    responseBoxEl: null,
    inputEl: null,
    currentQuestion: null,
    lastQuestionKey: "",
    answerRevealed: false,
    answerDisplayMode: "correction",
    submittedAnswer: null,
    submittedTickIndex: null,
    placedTickIndex: null,
    hasDragged: false,
    isDragging: false,
    alignmentResizeObserver: null,
    alignmentRaf: 0,
    onWindowResize: null,
    latestEvaluation: null,
    settings: normalizeSettings(initialContext?.settings),
    activityMode: normalizeActivityMode(initialContext?.activityMode),
    projectionResponseUi: normalizeProjectionResponseUi(initialContext?.projectionResponseUi)
  };
}

function syncRuntimeState(state, context = state.latestContext) {
  state.settings = normalizeSettings(context?.settings);
  state.activityMode = normalizeActivityMode(context?.activityMode);
  state.projectionResponseUi = normalizeProjectionResponseUi(context?.projectionResponseUi);
}

function renderShell(state) {
  const container = state.container;
  if (!container) return;

  ensureToolInstructionStyles();
  syncRuntimeState(state);

  container.innerHTML = `
    <div class="rn-root" id="rn_root">
      ${renderToolInstruction({ id: "rn_instruction" })}
      <div class="rn-stage" id="rn_stage">
        <div class="rn-line-panel" id="rn_line_panel"></div>
        <div class="rn-response-lane" id="rn_response_lane">
          <div class="rn-connector" id="rn_connector" aria-hidden="true"></div>
          <div class="rn-response-box" id="rn_response_box"></div>
        </div>
      </div>
    </div>
  `;

  state.root = container.querySelector("#rn_root");
  state.instructionEl = container.querySelector("#rn_instruction");
  state.stageEl = container.querySelector("#rn_stage");
  state.linePanelEl = container.querySelector("#rn_line_panel");
  state.laneEl = container.querySelector("#rn_response_lane");
  state.connectorEl = container.querySelector("#rn_connector");
  state.responseBoxEl = container.querySelector("#rn_response_box");
  setupResponseAlignmentHandling(state);
}

function loadNextQuestion(state, context = state.latestContext) {
  syncRuntimeState(state, context);
  state.currentQuestion = pickQuestion(state.settings, state.lastQuestionKey);
  state.lastQuestionKey = questionKey(state.currentQuestion);
  state.answerRevealed = false;
  state.answerDisplayMode = "correction";
  state.submittedAnswer = null;
  state.submittedTickIndex = null;
  state.latestEvaluation = null;
  state.placedTickIndex = state.currentQuestion?.questionType === QUESTION_TYPES.NUMBER_TO_GRADUATION
    ? Math.floor((state.currentQuestion?.tickCount ?? 1) / 2)
    : state.currentQuestion?.targetIndex ?? null;
  state.hasDragged = false;
  updateInstructionDisplay(state);
  renderQuestion(state);
  syncValidateState(state);
}

function updateInstructionDisplay(state) {
  const fallback = state.currentQuestion?.questionType === QUESTION_TYPES.NUMBER_TO_GRADUATION
    ? "Place ce nombre sur la droite graduée."
    : "Écris le nombre correspondant.";
  const text = resolveQuestionInstructionText(state.latestContext, fallback, fallback);
  setToolInstructionText(state.instructionEl, text);
}

function renderQuestion(state) {
  if (!state.currentQuestion || !state.linePanelEl || !state.responseBoxEl || !state.connectorEl) return;

  state.root?.classList.toggle("rn-root--answer", state.answerRevealed);
  state.root?.classList.toggle("rn-root--number-to-graduation", state.currentQuestion.questionType === QUESTION_TYPES.NUMBER_TO_GRADUATION);
  state.root?.classList.toggle("rn-root--graduation-to-number", state.currentQuestion.questionType === QUESTION_TYPES.GRADUATION_TO_NUMBER);
  state.root?.classList.toggle("rn-root--passive-free", shouldUsePassiveFreeMode(state));
  state.root?.classList.toggle("rn-root--picbille", state.currentQuestion.lineType === LINE_TYPES.PICBILLE);
  state.root?.classList.toggle("rn-root--simple", state.currentQuestion.lineType === LINE_TYPES.SIMPLE);
  state.root?.classList.toggle("rn-root--complete", state.currentQuestion.lineType === LINE_TYPES.COMPLETE);

  state.linePanelEl.innerHTML = renderLineSvg(state);
  state.lineSvgEl = state.linePanelEl.querySelector("svg");

  renderResponseBox(state);
  renderConnector(state);
}

function renderLineSvg(state) {
  const question = state.currentQuestion;
  if (question.lineType === LINE_TYPES.PICBILLE) {
    return renderPicbilleSvg(state);
  }
  return renderGraduatedLineSvg(state);
}

function renderGraduatedLineSvg(state) {
  const question = state.currentQuestion;
  const tickXs = question.ticks.map((tick) => Number(tick.x)).filter(Number.isFinite);
  const firstTickX = tickXs.length ? Math.min(...tickXs) : LINE_DRAW.lineStartX;
  const lastTickX = tickXs.length ? Math.max(...tickXs) : LINE_DRAW.lineEndX;
  const baselineExtension = question.lineType === LINE_TYPES.COMPLETE ? 14 : 40;
  const baselineStartX = Math.max(0, firstTickX - baselineExtension);
  const baselineEndX = Math.min(LINE_DRAW.svgWidth, lastTickX + baselineExtension);
  const labels = new Map([
    [question.markerIndices[0], question.referenceA],
    [question.markerIndices[1], question.referenceB]
  ]);

  const targetIndex = getHighlightedTargetIndex(state);
  const lines = question.ticks.map((tick) => {
    const markerOrder = question.markerIndices.indexOf(tick.index);
    const isMarker = markerOrder >= 0;
    const isTarget = tick.index === targetIndex;
    const { y1, y2, width } = getGraduatedTickShape(question.lineType, tick.role, isMarker, isTarget);
    return `
      <line
        x1="${formatNumber(tick.x)}" y1="${y1}"
        x2="${formatNumber(tick.x)}" y2="${y2}"
        class="rn-svg-tick rn-svg-tick--${tick.role}${isMarker ? ` rn-svg-tick--marker rn-svg-tick--marker-${markerOrder + 1}` : ""}${isTarget ? " rn-svg-tick--target" : ""}"
        stroke-width="${width}"
      />
    `;
  }).join("");

  const labelHtml = [...labels.entries()].map(([index, value]) => {
    const tick = question.ticks.find((item) => item.index === index);
    if (!tick) return "";
    const markerOrder = question.markerIndices.indexOf(index);
    return `
      <text
        x="${formatNumber(tick.x)}"
        y="58"
        class="rn-svg-label rn-svg-label--marker-${markerOrder + 1}"
        text-anchor="middle"
      >${escapeHtml(value)}</text>
    `;
  }).join("");

  return `
    <svg
      class="rn-svg rn-svg--graduated"
      viewBox="0 0 ${LINE_DRAW.svgWidth} ${LINE_DRAW.svgHeight}"
      role="img"
      aria-label="Droite graduée"
      data-rn-svg-width="${LINE_DRAW.svgWidth}"
      preserveAspectRatio="xMidYMid meet"
    >
      ${labelHtml}
      <line
        x1="${baselineStartX}"
        y1="${LINE_DRAW.lineY}"
        x2="${baselineEndX}"
        y2="${LINE_DRAW.lineY}"
        class="rn-svg-baseline"
      />
      ${lines}
    </svg>
  `;
}

function renderPicbilleSvg(state) {
  const question = state.currentQuestion;
  const width = question.svgWidth;
  const highlightedIndex = getHighlightedTargetIndex(state);
  const highlightedValue = highlightedIndex == null ? null : highlightedIndex + 1;
  const highlightAnimation = getPicbilleHighlightAnimation(state, highlightedIndex);

  let boxesSvg = "";
  for (let boxIndex = 0; boxIndex < question.picbilleBoxCount; boxIndex++) {
    boxesSvg += renderPicbilleBox(boxIndex, highlightedValue, highlightAnimation);
  }

  return `
    <svg
      class="rn-svg rn-svg--picbille"
      viewBox="0 0 ${width} ${PICBILLE_DRAW.svgHeight}"
      role="img"
      aria-label="Frise Picbille"
      data-rn-svg-width="${width}"
      preserveAspectRatio="xMidYMid meet"
    >
      ${boxesSvg}
    </svg>
  `;
}

function renderPicbilleBox(boxIndex, highlightedValue, highlightAnimation = null) {
  const x0 = getPicbilleBoxX(boxIndex);
  const y0 = PICBILLE_DRAW.stripTopY;
  const boxWidth = PICBILLE_DRAW.cellsPerBox * PICBILLE_DRAW.cellWidth;
  const cellW = PICBILLE_DRAW.cellWidth;
  const cellH = PICBILLE_DRAW.cellHeight;

  let highlight = "";
  if (highlightedValue != null) {
    const valueBoxIndex = Math.floor((highlightedValue - 1) / PICBILLE_DRAW.cellsPerBox);
    const cellIndexInBox = (highlightedValue - 1) % PICBILLE_DRAW.cellsPerBox;
    if (valueBoxIndex === boxIndex) {
      const cx = x0 + (cellIndexInBox * cellW) + (cellW / 2);
      const cy = y0 + (cellH / 2);
      const circle = `
        <circle
          cx="${formatNumber(cx)}"
          cy="${formatNumber(cy)}"
          r="14"
          class="rn-picbille-highlight"
        />
      `;
      highlight = highlightAnimation
        ? `
          <g class="rn-picbille-highlight-motion" transform="translate(${formatNumber(highlightAnimation.dx)} 0)">
            <animateTransform
              attributeName="transform"
              type="translate"
              from="${formatNumber(highlightAnimation.dx)} 0"
              to="0 0"
              dur="0.42s"
              fill="freeze"
            />
            ${circle}
          </g>
        `
        : circle;
    }
  }

  let verticals = "";
  for (let i = 1; i < PICBILLE_DRAW.cellsPerBox; i++) {
    const x = x0 + (i * cellW);
    const thick = i === 5;
    verticals += `
      <line
        x1="${x}"
        y1="${y0}"
        x2="${x}"
        y2="${y0 + cellH}"
        stroke="${PICBILLE_DRAW.mainLine}"
        stroke-width="${thick ? 3.5 : 1.6}"
      />
    `;
  }

  const crosses = [3, 8].map((cellIndex) => {
    const cx = x0 + ((cellIndex - 1) * cellW) + (cellW / 2);
    const cy = y0 + (cellH / 2);
    const d = 7;

    return `
      <line
        x1="${cx - d}" y1="${cy - d}"
        x2="${cx + d}" y2="${cy + d}"
        stroke="${PICBILLE_DRAW.crossLine}"
        stroke-width="1.8"
        stroke-linecap="butt"
      />
      <line
        x1="${cx + d}" y1="${cy - d}"
        x2="${cx - d}" y2="${cy + d}"
        stroke="${PICBILLE_DRAW.crossLine}"
        stroke-width="1.8"
        stroke-linecap="butt"
      />
    `;
  }).join("");

  const firstCellLabel = boxIndex === 0
    ? `
      <text
        x="${x0 + (cellW / 2)}"
        y="${y0 + 30}"
        text-anchor="middle"
        font-family="Andika, system-ui, sans-serif"
        font-size="28"
        font-weight="1000"
        fill="${PICBILLE_DRAW.textColor}"
      >1</text>
    `
    : "";

  return `
    <g>
      <rect
        x="${x0}"
        y="${y0}"
        width="${boxWidth}"
        height="${cellH}"
        fill="${PICBILLE_DRAW.stripFill}"
        stroke="${PICBILLE_DRAW.stripStroke}"
        stroke-width="2"
      />
      ${highlight}
      ${verticals}
      ${crosses}
      ${firstCellLabel}
    </g>
  `;
}

function getGraduatedTickShape(lineType, role, isMarker, isTarget) {
  if (lineType === LINE_TYPES.COMPLETE) {
    const base = role === "major" || isMarker
      ? { y1: 92, y2: 192, width: 4.5 }
      : role === "medium"
        ? { y1: 112, y2: 172, width: 3.2 }
        : { y1: 124, y2: 160, width: 1.8 };
    return isTarget ? { ...base, width: "var(--rn-highlight-width)" } : base;
  }
  if (isTarget) return { y1: 94, y2: 190, width: "var(--rn-highlight-width)" };
  return { y1: 102, y2: 182, width: isMarker ? 4 : 3 };
}

function renderResponseBox(state) {
  if (!state.responseBoxEl || !state.currentQuestion) return;

  const question = state.currentQuestion;
  const questionType = question.questionType;
  const isNumberToGraduation = questionType === QUESTION_TYPES.NUMBER_TO_GRADUATION;
  const displayMode = canToggleStudentAnswerDisplay(state) ? normalizeAnswerDisplayMode(state.answerDisplayMode) : "correction";
  const isCorrectionMode = state.answerRevealed && displayMode === "correction";
  const isStudentMode = state.answerRevealed && displayMode === "student";

  const displayedTickIndex = resolveDisplayedTickIndex(state, displayMode);

  state.responseBoxEl.className = buildResponseBoxClassName(state, displayedTickIndex, displayMode);
  state.responseBoxEl.innerHTML = isNumberToGraduation
    ? renderNumberToGraduationResponse(state, displayMode)
    : renderGraduationToNumberResponse(state, displayMode);
  syncResponseAlignment(state, displayedTickIndex ?? question.targetIndex);
  queueResponseAlignment(state);

  state.inputEl = state.responseBoxEl.querySelector("#rn_number_input");
  if (state.inputEl) {
    state.inputEl.addEventListener("input", () => syncValidateState(state));
    state.inputEl.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      if (state.answerRevealed) return;
      if (!canSubmitAnswer(state)) return;
      event.preventDefault();
      event.stopPropagation();
      requestReveal(state);
    });
    if (!state.answerRevealed) {
      queueMicrotask(() => state.inputEl?.focus?.());
    }
  }

  if (isNumberToGraduation && !state.answerRevealed && !shouldUsePassiveFreeMode(state)) {
    state.responseBoxEl.tabIndex = 0;
    state.responseBoxEl.setAttribute("role", "button");
    state.responseBoxEl.setAttribute("aria-label", "Valider le placement du nombre");
    attachResponseBoxKeyboardHandlers(state);
    attachDragHandlers(state);
  } else {
    state.responseBoxEl.removeAttribute("tabindex");
    state.responseBoxEl.removeAttribute("role");
    if (!state.inputEl) {
      state.responseBoxEl.removeAttribute("aria-label");
    }
  }

  state.responseBoxEl.toggleAttribute("aria-disabled", state.answerRevealed);
  state.responseBoxEl.classList.toggle("rn-response-box--correction-view", isCorrectionMode);
  state.responseBoxEl.classList.toggle("rn-response-box--student-view", isStudentMode);
}

function buildResponseBoxClassName(state, displayedTickIndex, displayMode) {
  const question = state.currentQuestion;
  const classes = ["rn-response-box"];
  const passiveFree = shouldUsePassiveFreeMode(state);

  if (passiveFree) {
    classes.push("rn-response-box--passive-free");
  }

  classes.push(question.questionType === QUESTION_TYPES.NUMBER_TO_GRADUATION
    ? "rn-response-box--draggable"
    : "rn-response-box--input");

  if (!state.answerRevealed) {
    classes.push("rn-response-box--pending");
    if (question.questionType === QUESTION_TYPES.NUMBER_TO_GRADUATION && state.hasDragged) {
      classes.push("rn-response-box--placed");
    }
    return classes.join(" ");
  }

  if (passiveFree) {
    classes.push("rn-response-box--neutral-correction");
    if (question.questionType === QUESTION_TYPES.NUMBER_TO_GRADUATION && displayedTickIndex === question.targetIndex) {
      classes.push("rn-response-box--at-correction");
    }
    return classes.join(" ");
  }

  const isCorrect = isStoredAnswerCorrect(state);
  if (displayMode === "student" && !isCorrect) {
    classes.push("rn-response-box--incorrect");
  } else if (isCorrect) {
    classes.push("rn-response-box--correct");
  } else {
    classes.push("rn-response-box--correct-answer");
  }

  if (question.questionType === QUESTION_TYPES.NUMBER_TO_GRADUATION && displayedTickIndex === question.targetIndex) {
    classes.push("rn-response-box--at-correction");
  }

  return classes.join(" ");
}

function renderNumberToGraduationResponse(state, displayMode) {
  const question = state.currentQuestion;
  const label = escapeHtml(question.targetValue);
  return `
    <div class="rn-response-number">${label}</div>
  `;
}

function renderGraduationToNumberResponse(state, displayMode) {
  const question = state.currentQuestion;
  const submitted = state.submittedAnswer ?? "";
  const value = state.answerRevealed
    ? displayMode === "student" && canToggleStudentAnswerDisplay(state)
      ? submitted
      : String(question.targetValue)
    : "";

  if (state.answerRevealed) {
    return `
      <div class="rn-response-number">${escapeHtml(value)}</div>
    `;
  }

  if (shouldUsePassiveFreeMode(state)) {
    return `
      <div class="rn-response-number rn-response-number--hidden" aria-hidden="true">${escapeHtml(question.targetValue)}</div>
    `;
  }

  return `
    <input
      id="rn_number_input"
      class="rn-number-input"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      spellcheck="false"
      aria-label="Nombre indiqué par la graduation"
    >
  `;
}

function renderConnector(state) {
  if (!state.connectorEl || !state.currentQuestion) return;

  const question = state.currentQuestion;
  const displayMode = canToggleStudentAnswerDisplay(state) ? normalizeAnswerDisplayMode(state.answerDisplayMode) : "correction";
  const tickIndex = resolveDisplayedTickIndex(state, displayMode);
  const shouldShow = question.questionType === QUESTION_TYPES.GRADUATION_TO_NUMBER
    || state.answerRevealed
    || state.hasDragged;

  syncResponseAlignment(state, tickIndex ?? question.targetIndex);
  state.connectorEl.hidden = !shouldShow;
  state.connectorEl.classList.toggle("rn-connector--answer", state.answerRevealed);
  state.connectorEl.classList.toggle("rn-connector--incorrect", state.answerRevealed && !isStoredAnswerCorrect(state) && displayMode === "student");
}

function setupResponseAlignmentHandling(state) {
  if (state.alignmentResizeObserver || state.onWindowResize || !state.stageEl) return;

  if (typeof ResizeObserver === "function") {
    state.alignmentResizeObserver = new ResizeObserver(() => queueResponseAlignment(state));
    state.alignmentResizeObserver.observe(state.stageEl);
  }

  state.onWindowResize = () => queueResponseAlignment(state);
  window.addEventListener("resize", state.onWindowResize, { passive: true });
}

function queueResponseAlignment(state) {
  if (state.alignmentRaf) {
    cancelAnimationFrame(state.alignmentRaf);
  }

  state.alignmentRaf = requestAnimationFrame(() => {
    state.alignmentRaf = 0;
    const tickIndex = getCurrentDisplayedTickIndex(state);
    if (tickIndex != null) {
      syncResponseAlignment(state, tickIndex);
    }
  });
}

function getCurrentDisplayedTickIndex(state) {
  const question = state.currentQuestion;
  if (!question) return null;
  const displayMode = canToggleStudentAnswerDisplay(state)
    ? normalizeAnswerDisplayMode(state.answerDisplayMode)
    : "correction";
  return resolveDisplayedTickIndex(state, displayMode) ?? question.targetIndex;
}

function syncResponseAlignment(state, tickIndex) {
  if (!state.currentQuestion || !state.responseBoxEl || !state.connectorEl) return;

  const boxPoint = getRenderedTickLanePoint(state, tickIndex, { stableY: true });
  const connectorPoint = getRenderedTickLanePoint(state, tickIndex, { stableY: false });
  if (!boxPoint || !connectorPoint) return;

  const boxHeight = state.responseBoxEl.offsetHeight || 112;
  const boxWidth = state.responseBoxEl.offsetWidth || 190;
  const laneWidth = state.laneEl?.offsetWidth || state.laneEl?.getBoundingClientRect?.().width || boxWidth;
  const boxX = clampNumber(boxPoint.x, boxWidth / 2, Math.max(boxWidth / 2, laneWidth - (boxWidth / 2)));
  const boxTopGap = 120;
  const responseY = boxPoint.y + boxTopGap;
  const connectorHeight = Math.max(0, responseY + boxHeight - 10 - connectorPoint.y);
  const connectorMotion = getPassiveFreeConnectorMotion(state, tickIndex, {
    boxHeight,
    boxTopGap,
    connectorPoint,
    connectorHeight
  });

  state.responseBoxEl.style.setProperty("--rn-response-x", `${formatNumber(boxX)}px`);
  state.responseBoxEl.style.setProperty("--rn-response-y", `${formatNumber(responseY)}px`);
  state.connectorEl.style.setProperty("--rn-response-x", `${formatNumber(connectorPoint.x)}px`);
  state.connectorEl.style.setProperty("--rn-connector-y", `${formatNumber(connectorPoint.y)}px`);
  state.connectorEl.style.setProperty("--rn-connector-height", `${formatNumber(connectorHeight)}px`);
  if (connectorMotion) {
    state.connectorEl.style.setProperty("--rn-connector-start-x", `${formatNumber(connectorMotion.dx)}px`);
    state.connectorEl.style.setProperty("--rn-connector-start-y", `${formatNumber(connectorMotion.dy)}px`);
    state.connectorEl.style.setProperty("--rn-connector-start-scale-y", formatNumber(connectorMotion.scaleY));
    state.connectorEl.classList.add("rn-connector--passive-correction-motion");
  } else {
    state.connectorEl.classList.remove("rn-connector--passive-correction-motion");
    state.connectorEl.style.removeProperty("--rn-connector-start-x");
    state.connectorEl.style.removeProperty("--rn-connector-start-y");
    state.connectorEl.style.removeProperty("--rn-connector-start-scale-y");
  }
}

function getPassiveFreeConnectorMotion(state, targetTickIndex, {
  boxHeight,
  boxTopGap,
  connectorPoint,
  connectorHeight
} = {}) {
  const question = state.currentQuestion;
  if (
    !question
    || question.questionType !== QUESTION_TYPES.NUMBER_TO_GRADUATION
    || !state.answerRevealed
    || !shouldUsePassiveFreeMode(state)
    || !Number.isInteger(targetTickIndex)
  ) {
    return null;
  }

  const fromTickIndex = Number.isInteger(state.submittedTickIndex)
    ? state.submittedTickIndex
    : state.placedTickIndex;
  if (!Number.isInteger(fromTickIndex) || fromTickIndex === targetTickIndex) {
    return null;
  }

  const fromBoxPoint = getRenderedTickLanePoint(state, fromTickIndex, { stableY: true });
  const fromConnectorPoint = getRenderedTickLanePoint(state, fromTickIndex, { stableY: false });
  if (!fromBoxPoint || !fromConnectorPoint || !connectorPoint) {
    return null;
  }

  const fromResponseY = fromBoxPoint.y + boxTopGap;
  const fromConnectorHeight = Math.max(0, fromResponseY + boxHeight - 10 - fromConnectorPoint.y);

  return {
    dx: fromConnectorPoint.x - connectorPoint.x,
    dy: fromConnectorPoint.y - connectorPoint.y,
    scaleY: connectorHeight > 0 ? Math.max(0.01, fromConnectorHeight / connectorHeight) : 1
  };
}

function getRenderedTickLanePoint(state, tickIndex, { stableY = false } = {}) {
  const svgPoint = getTickSvgAnchorPoint(state, tickIndex, { stableY });
  if (!svgPoint || !state.lineSvgEl || !state.laneEl) return null;

  const metrics = getRenderedSvgMetrics(state);
  const laneRect = state.laneEl.getBoundingClientRect();
  if (!metrics || !laneRect.width) return null;

  const screenX = metrics.rect.left + metrics.offsetX + ((svgPoint.x - metrics.viewBoxX) * metrics.scale);
  const screenY = metrics.rect.top + metrics.offsetY + ((svgPoint.y - metrics.viewBoxY) * metrics.scale);
  const laneScaleX = laneRect.width / Math.max(1, state.laneEl.offsetWidth || laneRect.width);
  const laneScaleY = laneRect.height / Math.max(1, state.laneEl.offsetHeight || laneRect.height);

  return {
    x: (screenX - laneRect.left) / (laneScaleX || 1),
    y: (screenY - laneRect.top) / (laneScaleY || 1)
  };
}

function getRenderedSvgMetrics(state) {
  if (!state.lineSvgEl || !state.currentQuestion) return null;

  const rect = state.lineSvgEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  const viewBox = state.lineSvgEl.viewBox?.baseVal;
  const viewBoxX = Number(viewBox?.x) || 0;
  const viewBoxY = Number(viewBox?.y) || 0;
  const viewBoxWidth = Number(viewBox?.width) || Number(state.lineSvgEl.dataset.rnSvgWidth) || state.currentQuestion.svgWidth || LINE_DRAW.svgWidth;
  const viewBoxHeight = Number(viewBox?.height) || state.currentQuestion.svgHeight || LINE_DRAW.svgHeight;
  const scale = Math.min(rect.width / viewBoxWidth, rect.height / viewBoxHeight);
  const renderedWidth = viewBoxWidth * scale;
  const renderedHeight = viewBoxHeight * scale;

  return {
    rect,
    viewBoxX,
    viewBoxY,
    viewBoxWidth,
    viewBoxHeight,
    scale,
    offsetX: (rect.width - renderedWidth) / 2,
    offsetY: (rect.height - renderedHeight) / 2
  };
}

function getTickSvgAnchorPoint(state, tickIndex, { stableY = false } = {}) {
  const question = state.currentQuestion;
  if (!question) return null;
  const tick = question.ticks.find((item) => item.index === tickIndex);
  if (!tick) return null;

  if (question.lineType === LINE_TYPES.PICBILLE) {
    return {
      x: tick.x,
      y: PICBILLE_DRAW.stripTopY + PICBILLE_DRAW.cellHeight
    };
  }

  if (!stableY) {
    const isMarker = question.markerIndices.includes(tick.index);
    const shape = getGraduatedTickShape(question.lineType, tick.role, isMarker, false);
    return {
      x: tick.x,
      y: shape.y2
    };
  }

  return {
    x: tick.x,
    y: getGraduatedResponseAnchorY(question.lineType)
  };
}

function getGraduatedResponseAnchorY(lineType) {
  if (lineType === LINE_TYPES.COMPLETE) {
    return 192;
  }
  return 190;
}

function getHighlightedTargetIndex(state) {
  const question = state.currentQuestion;
  if (!question) return null;

  if (question.questionType === QUESTION_TYPES.GRADUATION_TO_NUMBER) {
    return question.targetIndex;
  }

  if (!state.answerRevealed) {
    return state.hasDragged ? state.placedTickIndex : null;
  }

  const mode = canToggleStudentAnswerDisplay(state) ? normalizeAnswerDisplayMode(state.answerDisplayMode) : "correction";
  return resolveDisplayedTickIndex(state, mode);
}

function resolveDisplayedTickIndex(state, displayMode = state.answerDisplayMode) {
  const question = state.currentQuestion;
  if (!question) return null;

  if (question.questionType === QUESTION_TYPES.GRADUATION_TO_NUMBER) {
    return question.targetIndex;
  }

  if (!state.answerRevealed) {
    return state.placedTickIndex;
  }

  if (displayMode === "student" && canToggleStudentAnswerDisplay(state)) {
    return Number.isInteger(state.submittedTickIndex) ? state.submittedTickIndex : state.placedTickIndex;
  }

  return question.targetIndex;
}

function getPicbilleHighlightAnimation(state, highlightedIndex) {
  const question = state.currentQuestion;
  if (
    !question
    || question.lineType !== LINE_TYPES.PICBILLE
    || question.questionType !== QUESTION_TYPES.NUMBER_TO_GRADUATION
    || !state.answerRevealed
    || !shouldUsePassiveFreeMode(state)
    || !Number.isInteger(highlightedIndex)
  ) {
    return null;
  }

  const fromIndex = Number.isInteger(state.submittedTickIndex)
    ? state.submittedTickIndex
    : state.placedTickIndex;
  if (!Number.isInteger(fromIndex) || fromIndex === highlightedIndex) {
    return null;
  }

  return {
    dx: getPicbilleCellCenterX(fromIndex) - getPicbilleCellCenterX(highlightedIndex)
  };
}

function getPicbilleCellCenterX(tickIndex) {
  const safeIndex = Math.max(0, Math.floor(Number(tickIndex) || 0));
  const boxIndex = Math.floor(safeIndex / PICBILLE_DRAW.cellsPerBox);
  const cellIndexInBox = safeIndex % PICBILLE_DRAW.cellsPerBox;
  return getPicbilleBoxX(boxIndex) + (cellIndexInBox * PICBILLE_DRAW.cellWidth) + (PICBILLE_DRAW.cellWidth / 2);
}

function attachDragHandlers(state) {
  if (!state.responseBoxEl || state.responseBoxEl.dataset.rnDragReady === "true") return;
  state.responseBoxEl.dataset.rnDragReady = "true";

  state.responseBoxEl.addEventListener("pointerdown", (event) => {
    if (state.answerRevealed || !state.currentQuestion) return;
    event.preventDefault();
    state.responseBoxEl.focus?.({ preventScroll: true });
    state.isDragging = true;
    state.responseBoxEl.setPointerCapture?.(event.pointerId);
    updatePlacedTickFromPointer(state, event.clientX);

    const onPointerMove = (moveEvent) => {
      if (!state.isDragging) return;
      moveEvent.preventDefault();
      updatePlacedTickFromPointer(state, moveEvent.clientX);
    };

    const onPointerUp = () => {
      state.isDragging = false;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      syncValidateState(state);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  });
}

function attachResponseBoxKeyboardHandlers(state) {
  if (!state.responseBoxEl || state.responseBoxEl.dataset.rnKeyboardReady === "true") return;
  state.responseBoxEl.dataset.rnKeyboardReady = "true";

  state.responseBoxEl.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    if (state.answerRevealed) return;
    if (state.currentQuestion?.questionType !== QUESTION_TYPES.NUMBER_TO_GRADUATION) return;
    if (!canSubmitAnswer(state)) return;
    event.preventDefault();
    requestReveal(state);
  });
}

function updatePlacedTickFromPointer(state, clientX) {
  if (!state.currentQuestion || !state.lineSvgEl) return;
  const metrics = getRenderedSvgMetrics(state);
  if (!metrics) return;
  const x = metrics.viewBoxX + ((clientX - metrics.rect.left - metrics.offsetX) / metrics.scale);
  const tickIndex = getNearestTickIndex(state.currentQuestion, x);
  if (tickIndex == null) return;
  state.placedTickIndex = tickIndex;
  state.hasDragged = true;
  renderQuestion(state);
  syncValidateState(state);
}

function revealAnswer(state) {
  if (!state.currentQuestion) return;

  if (state.currentQuestion.questionType === QUESTION_TYPES.GRADUATION_TO_NUMBER) {
    const submitted = state.submittedAnswer != null
      ? state.submittedAnswer
      : String(state.inputEl?.value ?? "").trim();
    state.submittedAnswer = submitted;
    state.latestEvaluation = evaluateNumberAnswer(state.currentQuestion, submitted);
  } else {
    const submittedIndex = Number.isInteger(state.submittedTickIndex)
      ? state.submittedTickIndex
      : state.hasDragged
        ? state.placedTickIndex
        : null;
    state.submittedTickIndex = submittedIndex;
    state.latestEvaluation = evaluateGraduationAnswer(state.currentQuestion, submittedIndex);
  }

  state.answerRevealed = true;
  state.answerDisplayMode = "correction";
  renderQuestion(state);
  syncValidateState(state);
}

function requestReveal(state) {
  captureCurrentAnswer(state);
  const wasCorrect = isStoredAnswerCorrect(state);
  state.latestContext?.services?.requestAnswerPhase?.({
    manual: false,
    showAnswerNow: true,
    wasCorrect
  });
}

function captureCurrentAnswer(state) {
  if (!state.currentQuestion) return;

  if (state.currentQuestion.questionType === QUESTION_TYPES.GRADUATION_TO_NUMBER) {
    const submitted = String(state.inputEl?.value ?? "").trim();
    state.submittedAnswer = submitted;
    state.latestEvaluation = evaluateNumberAnswer(state.currentQuestion, submitted);
  } else {
    state.submittedTickIndex = state.hasDragged ? state.placedTickIndex : null;
    state.latestEvaluation = evaluateGraduationAnswer(state.currentQuestion, state.submittedTickIndex);
  }
}

function canSubmitAnswer(state) {
  if (!state.currentQuestion) return false;

  if (state.currentQuestion.questionType === QUESTION_TYPES.GRADUATION_TO_NUMBER) {
    return /^-?\d+$/.test(String(state.inputEl?.value ?? "").trim());
  }

  return state.hasDragged && Number.isInteger(state.placedTickIndex);
}

function isStoredAnswerCorrect(state) {
  if (!state.currentQuestion) return false;
  if (!state.latestEvaluation) {
    captureCurrentAnswer(state);
  }
  return state.latestEvaluation?.isCorrect === true;
}

function canToggleStudentAnswerDisplay(state) {
  if (!state.answerRevealed || !state.currentQuestion) return false;
  if (!shouldUseShellValidation(state.latestContext)) return false;
  if (isStoredAnswerCorrect(state)) return false;

  if (state.currentQuestion.questionType === QUESTION_TYPES.GRADUATION_TO_NUMBER) {
    return String(state.submittedAnswer ?? "").trim() !== "";
  }

  return Number.isInteger(state.submittedTickIndex);
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
  if (!state.answerRevealed || !state.currentQuestion) return false;
  if (!canToggleStudentAnswerDisplay(state)) {
    state.answerDisplayMode = "correction";
    renderQuestion(state);
    return false;
  }

  state.answerDisplayMode = normalizeAnswerDisplayMode(mode);
  renderQuestion(state);
  return true;
}

function shouldUseShellValidation(context = {}) {
  const mode = normalizeActivityMode(context?.activityMode);
  if (mode === "individual") return true;
  if (mode !== "projection") return false;
  return normalizeProjectionResponseUi(context?.projectionResponseUi) === "boxed";
}

function shouldUsePassiveFreeMode(state) {
  if (!state) return false;
  if (state.activityMode === "group") return true;
  return state.activityMode === "projection"
    && normalizeProjectionResponseUi(state.projectionResponseUi) === "free";
}

function normalizeAnswerDisplayMode(value) {
  return String(value ?? "").trim().toLowerCase() === "student" ? "student" : "correction";
}

function normalizeActivityMode(value) {
  const safeValue = String(value ?? "").trim().toLowerCase();
  if (safeValue === "group" || safeValue === "projection") return safeValue;
  return "individual";
}

function normalizeProjectionResponseUi(value) {
  return String(value ?? "").trim().toLowerCase() === "boxed" ? "boxed" : "free";
}

function syncValidateState(state) {
  state.latestContext?.services?.notifyValidationStateChanged?.();
}

function teardownState(state, container) {
  if (state.isDragging) {
    state.isDragging = false;
  }
  if (state.alignmentResizeObserver) {
    state.alignmentResizeObserver.disconnect();
    state.alignmentResizeObserver = null;
  }
  if (state.alignmentRaf) {
    cancelAnimationFrame(state.alignmentRaf);
    state.alignmentRaf = 0;
  }
  if (state.onWindowResize) {
    window.removeEventListener("resize", state.onWindowResize);
    state.onWindowResize = null;
  }
  if (container) container.innerHTML = "";
  state.container = null;
  state.root = null;
  state.instructionEl = null;
  state.stageEl = null;
  state.linePanelEl = null;
  state.lineSvgEl = null;
  state.laneEl = null;
  state.connectorEl = null;
  state.responseBoxEl = null;
  state.inputEl = null;
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const href = new URL("./activity.css", import.meta.url).href;
  if (document.querySelector(`link[data-rn-activity-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.rnActivityStyle = href;
  document.head.appendChild(link);
}

function formatNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
