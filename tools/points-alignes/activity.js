import {
  BOARD,
  DRAWING_PERSISTENCE,
  DRAWING_TYPES,
  MODES,
  evaluateSelection,
  getPrompt,
  normalizeSettings,
  pickQuestion,
  questionKey
} from "./model.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveQuestionInstructionText,
  setToolInstructionText
} from "../../shared/tool-instruction.js";

let stylesReadyPromise = null;
const MIN_GUIDE_LENGTH = 28;

export function createActivity(initialContext = {}) {
  const state = createRuntimeState(initialContext);

  return {
    async mount(container, context = initialContext) {
      state.container = container;
      syncRuntimeState(state, context);
      await injectActivityStyles();
      renderShell(state);
      bindEvents(state);
      syncValidationState(state);
    },

    async next(container, context = state.latestContext) {
      state.container = container || state.container;
      syncRuntimeState(state, context);
      await injectActivityStyles();
      if (!state.root?.isConnected) {
        renderShell(state);
        bindEvents(state);
      }
      loadNextQuestion(state);
      return state.currentQuestion;
    },

    nextQuestion(container, context = state.latestContext) {
      return this.next(container, context);
    },

    showAnswer(container, context = state.latestContext) {
      state.container = container || state.container;
      syncRuntimeState(state, context);
      if (!state.currentQuestion) return;
      if (!state.studentSelectionSnapshot) {
        state.studentSelectionSnapshot = new Set(state.selectedIds);
      }
      state.lastEvaluation = evaluateSelection(state.currentQuestion, [...state.studentSelectionSnapshot]);
      state.phaseMode = "answer";
      state.guideLines = [];
      state.activeGuide = null;
      resetGuidePreview(state);
      renderFigure(state);
      syncValidationState(state);
    },

    getAnswerState() {
      const evaluation = state.lastEvaluation
        || evaluateSelection(state.currentQuestion, [...state.selectedIds]);
      return {
        answered: evaluation.answered,
        correct: evaluation.isCorrect
      };
    },

    supportsShellValidation() {
      return true;
    },

    canValidate() {
      return canValidate(state);
    },

    validate() {
      if (!canValidate(state)) return false;
      submitCurrentAnswer(state);
      return true;
    },

    getHistorySnapshot(stage = "question") {
      return getPointsAlignesHistorySnapshot(state, stage);
    },

    unmount(container) {
      teardownState(state, container || state.container);
    }
  };
}

function createRuntimeState(initialContext) {
  return {
    container: null,
    latestContext: initialContext,
    settings: normalizeSettings(initialContext?.settings),
    root: null,
    instructionEl: null,
    boardEl: null,
    svgEl: null,
    guideLayerEl: null,
    provisionalGuideEl: null,
    eraserButton: null,
    currentQuestion: null,
    lastQuestionKey: "",
    selectedIds: new Set(),
    studentSelectionSnapshot: null,
    lastEvaluation: null,
    guideLines: [],
    activeGuide: null,
    phaseMode: "idle",
    abortController: null
  };
}

function syncRuntimeState(state, context = {}) {
  state.latestContext = context ?? state.latestContext;
  state.settings = normalizeSettings(state.latestContext?.settings);
}

function renderShell(state) {
  if (!state.container) return;
  teardownBindings(state);
  state.container.innerHTML = `
    <div class="pa-root">
      ${renderToolInstruction({ id: "pa_instruction" })}
      <div class="pa-board" data-pa-board>
        <div class="pa-canvas-wrap">
          <svg
            class="pa-canvas"
            data-pa-canvas
            viewBox="0 0 ${BOARD.width} ${BOARD.height}"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Zone géométrique"
          >
            <rect class="pa-canvas-background" x="0" y="0" width="${BOARD.width}" height="${BOARD.height}"></rect>
            <g data-pa-guide-layer></g>
            <line class="pa-guide pa-guide--preview" data-pa-guide-preview x1="0" y1="0" x2="0" y2="0" hidden></line>
            <g data-pa-points-layer></g>
          </svg>
          <button class="tool-choice-button pa-eraser" data-pa-clear-guides type="button" aria-label="Effacer les traits" title="Effacer les traits">
            ${renderEraserIcon()}
          </button>
        </div>
      </div>
    </div>
  `;

  state.root = state.container.querySelector(".pa-root");
  state.instructionEl = state.container.querySelector("#pa_instruction");
  state.boardEl = state.container.querySelector("[data-pa-board]");
  state.svgEl = state.container.querySelector("[data-pa-canvas]");
  state.guideLayerEl = state.container.querySelector("[data-pa-guide-layer]");
  state.provisionalGuideEl = state.container.querySelector("[data-pa-guide-preview]");
  state.eraserButton = state.container.querySelector("[data-pa-clear-guides]");
  updateInstruction(state);
  renderFigure(state);
}

function bindEvents(state) {
  teardownBindings(state);
  const controller = new AbortController();
  const { signal } = controller;
  state.abortController = controller;

  state.svgEl?.addEventListener("keydown", (event) => {
    if (!isQuestionInteractive(state) || (event.key !== "Enter" && event.key !== " ")) return;
    const target = event.target instanceof Element ? event.target.closest("[data-pa-point-id]") : null;
    if (!target) return;
    const id = String(target.getAttribute("data-pa-point-id") || "");
    const point = state.currentQuestion?.points?.find((item) => String(item.id) === id);
    if (!point || point.selectable === false) return;
    event.preventDefault();
    togglePointSelection(state, id);
  }, { signal });

  state.svgEl?.addEventListener("pointerdown", (event) => beginGuide(state, event), { signal });
  state.svgEl?.addEventListener("pointermove", (event) => updateGuide(state, event), { signal });
  state.svgEl?.addEventListener("pointerup", (event) => finishGuide(state, event), { signal });
  state.svgEl?.addEventListener("pointercancel", () => cancelGuide(state), { signal });

  state.eraserButton?.addEventListener("click", () => {
    if (getDrawingPersistence(state) === DRAWING_PERSISTENCE.NONE) return;
    state.guideLines = [];
    state.activeGuide = null;
    resetGuidePreview(state);
    renderGuideLines(state);
  }, { signal });
}

function loadNextQuestion(state) {
  const nextQuestion = pickQuestion(state.settings, {
    avoidKey: state.lastQuestionKey,
    attempts: 240
  });
  if (!nextQuestion) throw new Error("Impossible de générer une figure sans alignement parasite avec ces réglages.");

  state.currentQuestion = nextQuestion;
  state.lastQuestionKey = questionKey(nextQuestion);
  state.selectedIds = new Set();
  state.studentSelectionSnapshot = null;
  state.lastEvaluation = null;
  state.guideLines = [];
  state.activeGuide = null;
  state.phaseMode = "question";
  updateInstruction(state);
  renderFigure(state);
  syncValidationState(state);
}

function updateInstruction(state) {
  if (!state.instructionEl) return;
  const fallback = "Sélectionne les points demandés.";
  const prompt = getPrompt(state.currentQuestion) || fallback;
  const text = resolveQuestionInstructionText(state.latestContext, prompt, fallback);
  setToolInstructionText(state.instructionEl, text);
}

function renderFigure(state) {
  if (!state.svgEl) return;
  const pointsLayer = state.svgEl.querySelector("[data-pa-points-layer]");
  if (!pointsLayer) return;

  const question = state.currentQuestion;
  if (!question) {
    pointsLayer.innerHTML = "";
    renderGuideLines(state);
    return;
  }

  pointsLayer.innerHTML = question.points.map((point) => renderPoint(state, point)).join("");
  state.root?.classList.toggle("is-answer", state.phaseMode === "answer");
  state.root?.classList.toggle("is-correct", state.phaseMode === "answer" && state.lastEvaluation?.isCorrect === true);
  state.root?.classList.toggle("is-incorrect", state.phaseMode === "answer" && state.lastEvaluation?.isCorrect === false);
  renderGuideLines(state);
}

function renderPoint(state, point) {
  const classes = ["pa-point"];
  const selected = getStudentSelection(state).has(point.id);
  const expected = (state.currentQuestion?.expectedIds || []).includes(point.id);

  if (point.selectable === false) classes.push("is-reference");
  if (state.phaseMode === "question" && selected && point.selectable !== false) classes.push("is-selected");
  if (state.phaseMode === "answer" && point.selectable !== false) {
    if (expected && selected) classes.push("is-correct");
    else if (expected) classes.push("is-missed");
    else if (selected) classes.push("is-incorrect");
  }

  const interactive = state.phaseMode === "question" && point.selectable !== false;
  const label = String(point.label || "");
  const labelMarkup = label
    ? `<text class="pa-point-label" x="18" y="-16" aria-hidden="true">${escapeHtml(label)}</text>`
    : "";

  return `
    <g
      class="${classes.join(" ")}"
      transform="translate(${round(point.x)} ${round(point.y)})"
      data-pa-point-id="${escapeAttr(point.id)}"
      ${interactive ? 'role="button" tabindex="0"' : 'aria-hidden="true"'}
      ${interactive ? `aria-label="Sélectionner ce point" aria-pressed="${selected ? "true" : "false"}"` : ""}
    >
      <circle class="pa-point-hit" cx="0" cy="0" r="25"></circle>
      <circle class="pa-point-halo" cx="0" cy="0" r="20"></circle>
      <path class="pa-point-cross" d="M-10 0H10M0-10V10"></path>
      ${labelMarkup}
    </g>
  `;
}

function togglePointSelection(state, id) {
  if (state.selectedIds.has(id)) state.selectedIds.delete(id);
  else state.selectedIds.add(id);
  renderFigure(state);
  syncValidationState(state);
}

function beginGuide(state, event) {
  if (!isQuestionInteractive(state) || event.button > 0) return;
  const pointerPoint = clientToBoardPoint(state.svgEl, event.clientX, event.clientY);
  const pointTarget = event.target instanceof Element ? event.target.closest("[data-pa-point-id]") : null;
  const domPointId = String(pointTarget?.getAttribute("data-pa-point-id") || "");
  const nearestPoint = state.currentQuestion?.mode === MODES.DOUBLE_ALIGNMENT
    ? findNearestQuestionPoint(state.currentQuestion, pointerPoint, 26)
    : null;
  const pointId = String(nearestPoint?.id || domPointId || "");
  const point = nearestPoint || (pointId
    ? state.currentQuestion?.points?.find((item) => String(item.id) === pointId)
    : null);
  const start = point
    ? { x: Number(point.x) || 0, y: Number(point.y) || 0 }
    : pointerPoint;
  if (!start) return;
  state.activeGuide = { pointerId: event.pointerId, start, end: start, startedOnPointId: pointId };
  state.svgEl.setPointerCapture?.(event.pointerId);
  renderGuidePreview(state);
}

function findNearestQuestionPoint(question, boardPoint, maxDistance = 26) {
  if (!boardPoint) return null;
  let nearest = null;
  let bestDistance = Math.max(0, Number(maxDistance) || 0);
  for (const point of question?.points || []) {
    const dx = (Number(point.x) || 0) - boardPoint.x;
    const dy = (Number(point.y) || 0) - boardPoint.y;
    const currentDistance = Math.hypot(dx, dy);
    if (currentDistance > bestDistance) continue;
    nearest = point;
    bestDistance = currentDistance;
  }
  return nearest;
}

function updateGuide(state, event) {
  if (!state.activeGuide || state.activeGuide.pointerId !== event.pointerId) return;
  const end = clientToBoardPoint(state.svgEl, event.clientX, event.clientY);
  if (!end) return;
  state.activeGuide.end = end;
  renderGuidePreview(state);
}

function finishGuide(state, event) {
  if (!state.activeGuide || state.activeGuide.pointerId !== event.pointerId) return;
  const active = state.activeGuide;
  const end = clientToBoardPoint(state.svgEl, event.clientX, event.clientY) || active.end;
  const start = active.start;
  const gestureLength = Math.hypot(end.x - start.x, end.y - start.y);
  state.activeGuide = null;
  state.svgEl.releasePointerCapture?.(event.pointerId);

  if (gestureLength >= MIN_GUIDE_LENGTH) {
    persistGuideLine(state, createStudentGuideLine(state, start, end));
    renderGuideLines(state);
    return;
  }

  if (active.startedOnPointId) {
    const point = state.currentQuestion?.points?.find(
      (item) => String(item.id) === active.startedOnPointId
    );
    if (point?.selectable !== false) {
      togglePointSelection(state, active.startedOnPointId);
      return;
    }
  }

  renderGuideLines(state);
}

function cancelGuide(state) {
  state.activeGuide = null;
  renderGuidePreview(state);
}

function renderGuideLines(state) {
  const isAnswer = state.phaseMode === "answer" && !!state.currentQuestion;
  const persistence = getDrawingPersistence(state);
  const persistentLines = !isAnswer && persistence !== DRAWING_PERSISTENCE.NONE ? state.guideLines : [];
  const solutionLines = isAnswer ? getSolutionLines(state.currentQuestion) : [];

  if (state.guideLayerEl) {
    const studentMarkup = persistentLines.map((line) => `
      <line
        class="pa-guide"
        x1="${round(line.x1 * BOARD.width)}"
        y1="${round(line.y1 * BOARD.height)}"
        x2="${round(line.x2 * BOARD.width)}"
        y2="${round(line.y2 * BOARD.height)}"
      ></line>
    `).join("");
    const solutionMarkup = solutionLines.map((line) => `
      <line
        class="pa-guide pa-guide--solution"
        stroke-linecap="square"
        x1="${round(line.x1)}"
        y1="${round(line.y1)}"
        x2="${round(line.x2)}"
        y2="${round(line.y2)}"
      ></line>
    `).join("");
    state.guideLayerEl.innerHTML = studentMarkup + solutionMarkup;
  }

  if (state.eraserButton) {
    const disableEraser = isAnswer || persistence === DRAWING_PERSISTENCE.NONE || persistentLines.length === 0;
    state.eraserButton.hidden = isAnswer || persistence === DRAWING_PERSISTENCE.NONE;
    state.eraserButton.toggleAttribute("disabled", disableEraser);
  }
  renderGuidePreview(state);
}

function getSolutionLines(question) {
  const points = Array.isArray(question?.points) ? question.points : [];
  const byId = new Map(points.map((point) => [String(point.id), point]));
  const sourceLines = [];

  if (question?.mode === "with-ab") {
    const a = byId.get("ref-a");
    const b = byId.get("ref-b");
    if (a && b) sourceLines.push([a, b]);
  } else if (question?.mode === "double-alignment") {
    const a = byId.get("ref-a");
    const b = byId.get("ref-b");
    const c = byId.get("ref-c");
    const d = byId.get("ref-d");
    if (a && b) sourceLines.push([a, b]);
    if (c && d) sourceLines.push([c, d]);
  } else if (question?.mode === "groups") {
    const groups = new Map();
    for (const point of points) {
      if (point?.role !== "target" || !point?.groupId) continue;
      const key = String(point.groupId);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(point);
    }
    for (const groupPoints of groups.values()) {
      if (groupPoints.length >= 2) sourceLines.push([groupPoints[0], groupPoints[1]]);
    }
  }

  return sourceLines
    .map(([a, b]) => extendInfiniteLineToBoard(a, b))
    .filter(Boolean);
}

function extendInfiniteLineToBoard(a, b) {
  const ax = Number(a?.x);
  const ay = Number(a?.y);
  const bx = Number(b?.x);
  const by = Number(b?.y);
  if (![ax, ay, bx, by].every(Number.isFinite)) return null;

  const dx = bx - ax;
  const dy = by - ay;
  if (Math.hypot(dx, dy) < 1e-6) return null;

  const intersections = [];
  const add = (x, y) => {
    if (x < -1e-6 || x > BOARD.width + 1e-6 || y < -1e-6 || y > BOARD.height + 1e-6) return;
    const point = { x: clamp(x, 0, BOARD.width), y: clamp(y, 0, BOARD.height) };
    if (!intersections.some((other) => Math.hypot(other.x - point.x, other.y - point.y) < 0.1)) {
      intersections.push(point);
    }
  };

  if (Math.abs(dx) > 1e-9) {
    let t = (0 - ax) / dx;
    add(0, ay + t * dy);
    t = (BOARD.width - ax) / dx;
    add(BOARD.width, ay + t * dy);
  }
  if (Math.abs(dy) > 1e-9) {
    let t = (0 - ay) / dy;
    add(ax + t * dx, 0);
    t = (BOARD.height - ay) / dy;
    add(ax + t * dx, BOARD.height);
  }

  if (intersections.length < 2) return null;
  let bestA = intersections[0];
  let bestB = intersections[1];
  let bestDistance = -1;
  for (let i = 0; i < intersections.length - 1; i += 1) {
    for (let j = i + 1; j < intersections.length; j += 1) {
      const candidateDistance = Math.hypot(
        intersections[j].x - intersections[i].x,
        intersections[j].y - intersections[i].y
      );
      if (candidateDistance > bestDistance) {
        bestDistance = candidateDistance;
        bestA = intersections[i];
        bestB = intersections[j];
      }
    }
  }
  // Dépasser légèrement le viewBox garantit que le trait rendu est clippé
  // exactement sur le vrai bord blanc, sans laisser apparaître de retrait.
  const edgeDx = bestB.x - bestA.x;
  const edgeDy = bestB.y - bestA.y;
  const edgeLength = Math.hypot(edgeDx, edgeDy) || 1;
  const overshoot = 64;
  const ux = edgeDx / edgeLength;
  const uy = edgeDy / edgeLength;
  return {
    x1: bestA.x - ux * overshoot,
    y1: bestA.y - uy * overshoot,
    x2: bestB.x + ux * overshoot,
    y2: bestB.y + uy * overshoot
  };
}

function renderGuidePreview(state) {
  const line = state.provisionalGuideEl;
  if (!line) return;
  const active = state.activeGuide;
  if (!active) {
    resetGuidePreview(state);
    return;
  }

  let preview = {
    x1: active.start.x,
    y1: active.start.y,
    x2: active.end.x,
    y2: active.end.y
  };
  if (getDrawingType(state) === DRAWING_TYPES.LINE) {
    preview = extendInfiniteLineToBoard(active.start, active.end) || preview;
  }

  line.hidden = false;
  line.removeAttribute("hidden");
  line.style.removeProperty("display");
  line.setAttribute("x1", round(preview.x1));
  line.setAttribute("y1", round(preview.y1));
  line.setAttribute("x2", round(preview.x2));
  line.setAttribute("y2", round(preview.y2));
}

function resetGuidePreview(state) {
  const line = state.provisionalGuideEl;
  if (!line) return;
  line.hidden = true;
  line.setAttribute("hidden", "");
  line.style.display = "none";
  line.setAttribute("x1", "0");
  line.setAttribute("y1", "0");
  line.setAttribute("x2", "0");
  line.setAttribute("y2", "0");
}

function createStudentGuideLine(state, start, end) {
  if (getDrawingType(state) === DRAWING_TYPES.LINE) {
    const extended = extendInfiniteLineToBoard(start, end);
    if (extended) {
      return {
        x1: extended.x1 / BOARD.width,
        y1: extended.y1 / BOARD.height,
        x2: extended.x2 / BOARD.width,
        y2: extended.y2 / BOARD.height
      };
    }
  }
  return {
    x1: start.x / BOARD.width,
    y1: start.y / BOARD.height,
    x2: end.x / BOARD.width,
    y2: end.y / BOARD.height
  };
}

function getDrawingType(state) {
  return state?.settings?.drawingType || DRAWING_TYPES.SEGMENT;
}

function persistGuideLine(state, line) {
  const persistence = getDrawingPersistence(state);
  if (persistence === DRAWING_PERSISTENCE.NONE) return;
  if (persistence === DRAWING_PERSISTENCE.LAST_ONLY) {
    state.guideLines = [line];
    return;
  }
  state.guideLines.push(line);
}

function getDrawingPersistence(state) {
  return state?.settings?.drawingPersistence || DRAWING_PERSISTENCE.ALL;
}

function clientToBoardPoint(svg, clientX, clientY) {
  if (!svg) return null;
  const rect = svg.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) return null;

  const scale = Math.min(rect.width / BOARD.width, rect.height / BOARD.height);
  const drawnWidth = BOARD.width * scale;
  const drawnHeight = BOARD.height * scale;
  const offsetX = (rect.width - drawnWidth) / 2;
  const offsetY = (rect.height - drawnHeight) / 2;
  const x = (clientX - rect.left - offsetX) / scale;
  const y = (clientY - rect.top - offsetY) / scale;

  return {
    x: clamp(x, 0, BOARD.width),
    y: clamp(y, 0, BOARD.height)
  };
}

function submitCurrentAnswer(state) {
  state.studentSelectionSnapshot = new Set(state.selectedIds);
  state.lastEvaluation = evaluateSelection(state.currentQuestion, [...state.studentSelectionSnapshot]);

  const requested = state.latestContext?.services?.requestAnswerPhase?.({
    manual: false,
    showAnswerNow: true,
    wasCorrect: state.lastEvaluation.isCorrect,
    skipValidationReview: true
  });

  if (!requested) {
    state.phaseMode = "answer";
    state.guideLines = [];
    state.activeGuide = null;
    resetGuidePreview(state);
    renderFigure(state);
  }
  syncValidationState(state);
}

function canValidate(state) {
  return isQuestionInteractive(state) && state.selectedIds.size > 0;
}

function isQuestionInteractive(state) {
  return state.phaseMode === "question" && !!state.currentQuestion;
}

function getStudentSelection(state) {
  return state.studentSelectionSnapshot instanceof Set ? state.studentSelectionSnapshot : state.selectedIds;
}

function getPointsAlignesHistorySnapshot(state, stage = "question") {
  const question = state.currentQuestion;
  if (!question) {
    return { schemaVersion: 2, kind: "geometry-point-selection", prompt: "", points: [] };
  }
  const safeStage = String(stage || "question").toLowerCase();
  const studentSelection = getStudentSelection(state);
  return {
    schemaVersion: 2,
    kind: "geometry-point-selection",
    prompt: String(question.prompt || ""),
    mode: String(question.mode || ""),
    board: { width: BOARD.width, height: BOARD.height },
    points: question.points.map((point) => ({
      id: String(point.id || ""),
      x: Number(point.x) / BOARD.width,
      y: Number(point.y) / BOARD.height,
      label: String(point.label || ""),
      selectable: point.selectable !== false,
      reference: point.role === "reference"
    })),
    selectedIds: safeStage === "question" ? [] : [...studentSelection],
    expectedIds: safeStage === "correction" ? [...(question.expectedIds || [])] : [],
    helperLines: safeStage === "question" ? [] : state.guideLines.map((line) => ({ ...line }))
  };
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
  state.boardEl = null;
  state.svgEl = null;
  state.guideLayerEl = null;
  state.provisionalGuideEl = null;
  state.eraserButton = null;
  state.currentQuestion = null;
  state.selectedIds.clear();
  state.studentSelectionSnapshot = null;
  state.lastEvaluation = null;
  state.guideLines = [];
  state.activeGuide = null;
  state.phaseMode = "idle";
}

function renderEraserIcon() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M690-240h190v80H610l80-80Zm-500 80-85-85q-23-23-23.5-57t22.5-58l440-456q23-24 56.5-24t56.5 23l199 199q23 23 23 57t-23 57L520-160H190Zm296-80 314-322-198-198-442 456 64 64h262Zm-6-240Z"/>
    </svg>
  `;
}

function injectActivityStyles() {
  if (stylesReadyPromise) return stylesReadyPromise;
  ensureToolInstructionStyles();
  const href = new URL("./activity.css", import.meta.url).href;
  const existing = document.querySelector(`link[data-pa-activity-style="${href}"]`);
  if (existing) {
    stylesReadyPromise = Promise.resolve();
    return stylesReadyPromise;
  }
  stylesReadyPromise = new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.paActivityStyle = href;
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", resolve, { once: true });
    document.head.appendChild(link);
  });
  return stylesReadyPromise;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
