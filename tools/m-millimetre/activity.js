import {
  normalizeSettings,
  pickQuestion,
  questionKey,
  evaluateReadAnswer,
  evaluateBuildAnswer,
  QUESTION_TYPES
} from "./model.js";
import {
  MILLIMETRE_DRAWING,
  mmToPx,
  recognizeNormalSegmentLengthMm,
  createSegment,
  buildGraduationPath,
  buildGeneratedSegments
} from "./drawing.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveQuestionInstructionText,
  setToolInstructionText
} from "../../shared/tool-instruction.js";
import {
  createNumericAnswerControl,
  renderNumericAnswerDisplayMarkup
} from "../../shared/tool-ui/numeric-answer.js";
import {
  bindNumericKeypadEvents,
  renderNumericKeypad
} from "../../shared/tool-ui/numeric-keypad.js";
import {
  bindFreeDrag,
  clientPointToLocalPoint
} from "../../shared/tool-ui/drag-core.js";

let stylesInjected = false;
const NUMERIC_KEY_DATA_ATTRIBUTE = "data-mm-numeric-key";
const DEFAULT_CANVAS_WIDTH = 980;
const DEFAULT_CANVAS_HEIGHT = 430;
const MAGNIFIER_COUNT_TOP_BASELINE_PX = 28;
const MAGNIFIER_COUNT_BOTTOM_INSET_PX = 16;
const MAGNIFIER_COUNT_HALF_SAFE_WIDTH_PX = 56;
const MAGNIFIER_COUNT_TOP_SAFE_BOTTOM_PX = 46;

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

    next(container, context = initialContext) {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      if (!state.container) return;
      syncRuntimeState(state, state.latestContext);
      if (!state.root) renderShell(state);
      loadNextQuestion(state, state.latestContext ?? {});
    },

    showAnswer(container, context = initialContext) {
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

    supportsShellValidation(context = state.latestContext) {
      const cfg = normalizeSettings(context?.settings || state.settings || {});
      return cfg.questionType === QUESTION_TYPES.BUILD || shouldShowResponseBox(context);
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
    settings: normalizeSettings(initialContext?.settings),
    responseUi: getResponseUi(initialContext),
    showResponseBox: shouldShowResponseBox(initialContext),

    root: null,
    instructionEl: null,
    stageEl: null,
    drawingHostEl: null,
    responseShellEl: null,
    freeAnswerEl: null,
    toolbarEl: null,
    undoBtnEl: null,
    magnifierBtnEl: null,
    magnifierEl: null,
    magnifierSvgEl: null,

    currentQuestion: null,
    lastQuestionKey: null,
    answerRevealed: false,
    answerDisplayMode: "correction",
    latestEvaluation: null,

    answerControl: null,
    responseInputEl: null,
    keypadAbortController: null,
    submittedReadAnswer: "",

    buildSvgEl: null,
    buildTraceEl: null,
    buildSegments: [],
    submittedBuildSegments: [],
    buildStartPoint: null,
    canvasWidth: DEFAULT_CANVAS_WIDTH,
    canvasHeight: DEFAULT_CANVAS_HEIGHT,
    drawPointerId: null,
    buildGestureMode: null,
    drawStart: null,
    drawPointer: null,
    buildPanDragStartPoint: null,
    buildPanOriginStartPoint: null,
    buildPanOriginSegments: [],

    magnifierOpen: false,
    magnifierPointerId: null,
    magnifierPointer: null,
    magnifierUnits: 0,
    magnifierAngle: 0,
    magnifierEditingSegmentIndex: -1,

    readScrollEl: null,
    readSvgEl: null,
    readLensToggleEl: null,
    readLensEl: null,
    readLensSvgEl: null,
    readLensOpen: false,
    readLensCenter: null,
    readLensDragAbortController: null,
    readLensDragOffset: { x: 0, y: 0 },
    readLensClipRectEl: null,
    readLayoutSeed: createReadLayoutSeed(),
    readGeneratedSegments: [],
    readSvgWidth: 0,
    readSvgHeight: 0,

    resizeObserver: null,
    readResizeObserver: null
  };
}

function syncRuntimeState(state, context = state.latestContext) {
  state.settings = normalizeSettings(context?.settings || state.settings || {});
  state.responseUi = getResponseUi(context);
  state.showResponseBox = shouldShowResponseBox(context);
}

function renderShell(state) {
  if (!state.container) return;
  teardownBindings(state);
  syncRuntimeState(state);

  state.container.innerHTML = `
    <div class="tool-runtime tool-runtime--m-millimetre mm-root">
      ${renderToolInstruction({ id: "mm_instruction" })}
      <div class="tool-stage mm-stage" id="mm_stage"></div>
    </div>
  `;

  state.root = state.container.querySelector(".mm-root");
  state.instructionEl = state.container.querySelector("#mm_instruction");
  state.stageEl = state.container.querySelector("#mm_stage");
}

function loadNextQuestion(state, context = {}) {
  syncRuntimeState(state, context);
  state.currentQuestion = pickQuestion(state.settings, { avoidKey: state.lastQuestionKey });
  state.lastQuestionKey = questionKey(state.currentQuestion);
  state.answerRevealed = false;
  state.answerDisplayMode = "correction";
  state.latestEvaluation = null;
  state.submittedReadAnswer = "";
  state.buildSegments = [];
  state.submittedBuildSegments = [];
  state.buildStartPoint = null;
  state.drawPointerId = null;
  state.buildGestureMode = null;
  state.drawStart = null;
  state.drawPointer = null;
  state.buildPanDragStartPoint = null;
  state.buildPanOriginStartPoint = null;
  state.buildPanOriginSegments = [];
  state.magnifierOpen = false;
  state.magnifierPointerId = null;
  state.magnifierPointer = null;
  state.magnifierUnits = 0;
  state.magnifierAngle = 0;
  state.magnifierEditingSegmentIndex = -1;
  state.readLensOpen = false;
  state.readLensCenter = null;
  state.readLensDragAbortController?.abort?.();
  state.readLensDragAbortController = null;
  state.readLensClipRectEl = null;
  state.readLayoutSeed = createReadLayoutSeed();
  state.readGeneratedSegments = [];

  destroyAnswerControl(state);
  teardownBindings(state);
  updateInstructionDisplay(state);
  renderQuestion(state);
  syncValidateState(state);
}

function renderQuestion(state) {
  if (!state.stageEl || !state.currentQuestion) return;
  state.root?.classList.toggle("mm-root--read", state.currentQuestion.questionType === QUESTION_TYPES.READ);
  state.root?.classList.toggle("mm-root--build", state.currentQuestion.questionType === QUESTION_TYPES.BUILD);
  state.root?.classList.remove("mm-root--revealed", "mm-root--correct", "mm-root--incorrect");

  if (state.currentQuestion.questionType === QUESTION_TYPES.BUILD) {
    renderBuildQuestion(state);
  } else {
    renderReadQuestion(state);
  }
}

function renderReadQuestion(state) {
  state.stageEl.innerHTML = `
    <div class="mm-read-layout">
      <div class="mm-drawing-panel mm-read-panel" id="mm_drawing_host"></div>
      ${state.showResponseBox ? `
        <div class="tool-answer-panel mm-response-shell" id="mm_response_shell">
          <div class="mm-number-response-stack">
            <div class="mm-number-answer-row">
              <div class="mm-number-answer-host" id="mm_numeric_answer_host"></div>
              <span class="mm-unit-label">mm</span>
            </div>
            ${renderNumericKeypad({
              rootClassName: "mm-number-keypad",
              buttonClassName: "mm-number-keypad-button",
              clearButtonClassName: "mm-number-keypad-button--clear",
              dataAttribute: NUMERIC_KEY_DATA_ATTRIBUTE,
              ariaLabel: "Clavier numérique"
            })}
          </div>
        </div>
      ` : `<div class="mm-free-answer" id="mm_free_answer" hidden></div>`}
    </div>
  `;

  state.drawingHostEl = state.stageEl.querySelector("#mm_drawing_host");
  state.responseShellEl = state.stageEl.querySelector("#mm_response_shell");
  state.freeAnswerEl = state.stageEl.querySelector("#mm_free_answer");
  state.toolbarEl = null;
  state.buildSvgEl = null;

  if (state.showResponseBox) mountNumericResponse(state);
  renderReadDrawing(state);

  if (typeof ResizeObserver === "function" && state.drawingHostEl) {
    state.readResizeObserver = new ResizeObserver(() => renderReadDrawing(state));
    state.readResizeObserver.observe(state.drawingHostEl);
  }
}

function renderBuildQuestion(state) {
  state.stageEl.innerHTML = `
    <div class="mm-build-layout">
      <div class="mm-build-header">
        <div class="mm-target-value"><strong>${escapeHtml(state.currentQuestion.value)}</strong><span>mm</span></div>
        <div class="mm-build-toolbar" id="mm_toolbar">
          <button class="mm-tool-button" id="mm_undo" type="button" title="Annuler le dernier segment">
            <span aria-hidden="true">↶</span><span>Annuler</span>
          </button>
          <button class="mm-tool-button" id="mm_magnifier" type="button" aria-expanded="false">
            <span aria-hidden="true">🔍</span><span>Loupe unités</span>
          </button>
        </div>
      </div>
      <div class="mm-drawing-panel mm-build-panel" id="mm_drawing_host">
        <svg class="mm-build-svg" id="mm_build_svg" aria-label="Zone de construction de M. Millimètre"></svg>
        <div class="mm-magnifier" id="mm_magnifier_panel" hidden role="group" aria-label="Loupe pour tracer les unités">
          <svg class="mm-magnifier-svg" id="mm_magnifier_svg" aria-label="Loupe pour tracer les unités"></svg>
        </div>
      </div>
    </div>
  `;

  state.drawingHostEl = state.stageEl.querySelector("#mm_drawing_host");
  state.buildSvgEl = state.stageEl.querySelector("#mm_build_svg");
  state.toolbarEl = state.stageEl.querySelector("#mm_toolbar");
  state.undoBtnEl = state.stageEl.querySelector("#mm_undo");
  state.magnifierBtnEl = state.stageEl.querySelector("#mm_magnifier");
  state.magnifierEl = state.stageEl.querySelector("#mm_magnifier_panel");
  state.magnifierSvgEl = state.stageEl.querySelector("#mm_magnifier_svg");
  state.responseShellEl = null;
  state.freeAnswerEl = null;

  bindBuildEvents(state);
  syncBuildCanvasSize(state);
  renderBuildCanvas(state);
  renderMagnifier(state);
  syncBuildControls(state);

  if (typeof ResizeObserver === "function" && state.drawingHostEl) {
    state.resizeObserver = new ResizeObserver(() => {
      syncBuildCanvasSize(state);
      renderBuildCanvas(state);
      if (state.magnifierOpen) positionMagnifier(state);
    });
    state.resizeObserver.observe(state.drawingHostEl);
  }
}

function mountNumericResponse(state) {
  if (!state.responseShellEl || !state.currentQuestion) return;
  const host = state.responseShellEl.querySelector("#mm_numeric_answer_host");
  if (!host) return;

  state.answerControl = createNumericAnswerControl({
    id: "mm_response_input",
    className: "mm-number-answer",
    ariaLabel: "Longueur en millimètres",
    maxLength: 4,
    captureRoot: state.root,
    onInput: () => {
      if (state.answerRevealed) return;
      syncValidateState(state);
    },
    onSubmit: () => {
      if (!state.answerRevealed && canSubmitAnswer(state)) requestReveal(state);
    }
  });

  host.appendChild(state.answerControl.element);
  state.responseInputEl = state.answerControl.input;

  state.keypadAbortController = new AbortController();
  bindNumericKeypadEvents({
    root: state.responseShellEl,
    control: state.answerControl,
    signal: state.keypadAbortController.signal,
    dataAttribute: NUMERIC_KEY_DATA_ATTRIBUTE
  });

  queueMicrotask(() => state.answerControl?.focus?.());
}

function renderReadDrawing(state) {
  if (!state.drawingHostEl || !state.currentQuestion) return;
  const width = Math.max(720, state.drawingHostEl.clientWidth || DEFAULT_CANVAS_WIDTH);
  const height = Math.max(MILLIMETRE_DRAWING.minimumCanvasHeightPx, Math.min(470, state.drawingHostEl.clientHeight || 430));
  const generated = buildGeneratedSegments(state.currentQuestion.decomposition, {
    width,
    height,
    randomSeed: state.readLayoutSeed
  });
  const svgWidth = Math.max(width, generated.requiredWidth);
  const svgHeight = Math.max(height, generated.requiredHeight);
  const segmentsMarkup = renderSegmentsMarkup(generated.segments, { className: "mm-segment--generated" });

  state.readGeneratedSegments = generated.segments;
  state.readSvgWidth = svgWidth;
  state.readSvgHeight = svgHeight;

  state.drawingHostEl.innerHTML = `
    <button class="mm-read-lens-toggle" id="mm_read_lens_toggle" type="button"
            aria-label="Afficher la loupe" aria-pressed="${state.readLensOpen ? "true" : "false"}" title="Loupe">
      <span aria-hidden="true">🔍</span>
    </button>
    <div class="mm-read-scroll" id="mm_read_scroll">
      <svg class="mm-read-svg" id="mm_read_svg" width="${fmt(svgWidth)}" height="${fmt(svgHeight)}"
           viewBox="0 0 ${fmt(svgWidth)} ${fmt(svgHeight)}" aria-label="Ligne graduée de M. Millimètre">
        ${segmentsMarkup}
      </svg>
    </div>
    <div class="mm-read-lens" id="mm_read_lens"${state.readLensOpen ? "" : " hidden"}
         style="--mm-read-lens-size:${fmt(MILLIMETRE_DRAWING.readLensDiameterPx)}px"
         role="img" aria-label="Loupe déplaçable sur la ligne graduée">
      <svg class="mm-read-lens-svg" id="mm_read_lens_svg" preserveAspectRatio="xMidYMid meet">
        <rect class="mm-read-lens-bg" x="-100000" y="-100000" width="200000" height="200000" />
        <defs>
          <clipPath id="mm_read_lens_source_clip" clipPathUnits="userSpaceOnUse">
            <rect id="mm_read_lens_clip_rect" x="0" y="0" width="1" height="1" />
          </clipPath>
        </defs>
        <g clip-path="url(#mm_read_lens_source_clip)">${segmentsMarkup}</g>
      </svg>
    </div>
  `;

  state.readScrollEl = state.drawingHostEl.querySelector("#mm_read_scroll");
  state.readSvgEl = state.drawingHostEl.querySelector("#mm_read_svg");
  state.readLensToggleEl = state.drawingHostEl.querySelector("#mm_read_lens_toggle");
  state.readLensEl = state.drawingHostEl.querySelector("#mm_read_lens");
  state.readLensSvgEl = state.drawingHostEl.querySelector("#mm_read_lens_svg");
  state.readLensClipRectEl = state.drawingHostEl.querySelector("#mm_read_lens_clip_rect");

  bindReadLensEvents(state);
  syncReadLensUi(state);
}

function bindReadLensEvents(state) {
  state.readLensToggleEl?.addEventListener("click", () => {
    state.readLensOpen = !state.readLensOpen;
    if (state.readLensOpen && !state.readLensCenter) {
      state.readLensCenter = defaultReadLensCenter(state);
    }
    syncReadLensUi(state);
  });

  state.readScrollEl?.addEventListener("scroll", () => {
    if (state.readLensOpen) syncReadLensUi(state);
  }, { passive: true });

  if (!state.readLensEl || !state.drawingHostEl) return;

  // Le déplacement utilise le drag commun : les coordonnées client sont
  // converties dans le repère local du runtime, y compris quand celui-ci est
  // redimensionné / mis à l'échelle par la projection ou le viewport.
  state.readLensDragAbortController?.abort?.();
  const controller = new AbortController();
  state.readLensDragAbortController = controller;
  const { signal } = controller;

  // On mémorise le point réellement saisi dans le cercle afin d'éviter tout
  // saut au début du drag. Le drag-core garde ensuite la capture du pointeur.
  state.readLensEl.addEventListener("pointerdown", (event) => {
    if (!state.readLensOpen) return;
    const point = clientPointToLocalPoint(state.drawingHostEl, event.clientX, event.clientY);
    const center = state.readLensCenter || defaultReadLensCenter(state);
    state.readLensCenter = center;
    state.readLensDragOffset = {
      x: point.x - center.x,
      y: point.y - center.y
    };
  }, { signal, passive: true });

  bindFreeDrag(state.readLensEl, {
    surface: () => state.drawingHostEl,
    signal,
    threshold: 0,
    dragClass: "is-dragging",
    positionElement: false,
    disabled: () => !state.readLensOpen,
    onMove: ({ event }) => {
      const point = clientPointToLocalPoint(state.drawingHostEl, event.clientX, event.clientY);
      state.readLensCenter = clampReadLensCenter(state, {
        x: point.x - state.readLensDragOffset.x,
        y: point.y - state.readLensDragOffset.y
      });
      syncReadLensUi(state);
    }
  });
}

function syncReadLensUi(state) {
  if (!state.readLensEl || !state.readLensSvgEl || !state.drawingHostEl) return;
  state.readLensToggleEl?.setAttribute("aria-pressed", state.readLensOpen ? "true" : "false");
  state.readLensToggleEl?.classList.toggle("is-active", state.readLensOpen);
  state.readLensEl.hidden = !state.readLensOpen;
  if (!state.readLensOpen) return;

  // Seul le CENTRE de la loupe est contraint à la zone blanche. Le cercle peut
  // donc dépasser visuellement du cadre, ce qui permet de viser jusqu'au tout
  // dernier pixel des bords sans décaler la zone grossie.
  state.readLensCenter = clampReadLensCenter(state, state.readLensCenter || defaultReadLensCenter(state));
  const diameter = Math.max(120, Number(MILLIMETRE_DRAWING.readLensDiameterPx) || 190);
  const radius = diameter / 2;
  state.readLensEl.style.left = `${fmt(state.readLensCenter.x - radius)}px`;
  state.readLensEl.style.top = `${fmt(state.readLensCenter.y - radius)}px`;

  const zoom = Math.max(1.1, Number(MILLIMETRE_DRAWING.readLensZoom) || 2.6);
  const sourceSpan = diameter / zoom;
  const scrollLeft = Number(state.readScrollEl?.scrollLeft) || 0;
  const scrollTop = Number(state.readScrollEl?.scrollTop) || 0;
  const hostWidth = Math.max(1, state.drawingHostEl?.clientWidth || DEFAULT_CANVAS_WIDTH);
  const hostHeight = Math.max(1, state.drawingHostEl?.clientHeight || DEFAULT_CANVAS_HEIGHT);

  // Correspondance directe : le centre de la loupe grossit exactement le point
  // situé dessous. Aucun remapping à l'approche des bords.
  const sourceX = scrollLeft + state.readLensCenter.x;
  const sourceY = scrollTop + state.readLensCenter.y;
  const viewX = sourceX - sourceSpan / 2;
  const viewY = sourceY - sourceSpan / 2;
  state.readLensSvgEl.setAttribute("viewBox", `${fmt(viewX)} ${fmt(viewY)} ${fmt(sourceSpan)} ${fmt(sourceSpan)}`);

  // Tout ce qui se trouve au-delà de la zone blanche visible est masqué dans
  // la loupe : la partie du cercle qui dépasse reste blanche et ne révèle pas
  // de contenu hors cadre.
  if (state.readLensClipRectEl) {
    state.readLensClipRectEl.setAttribute("x", fmt(scrollLeft));
    state.readLensClipRectEl.setAttribute("y", fmt(scrollTop));
    state.readLensClipRectEl.setAttribute("width", fmt(hostWidth));
    state.readLensClipRectEl.setAttribute("height", fmt(hostHeight));
  }
}

function defaultReadLensCenter(state) {
  const width = Math.max(1, state.drawingHostEl?.clientWidth || DEFAULT_CANVAS_WIDTH);
  const height = Math.max(1, state.drawingHostEl?.clientHeight || DEFAULT_CANVAS_HEIGHT);
  return clampReadLensCenter(state, {
    x: width - 48,
    y: Math.min(height, 86)
  });
}

function clampReadLensCenter(state, point) {
  const width = Math.max(1, state.drawingHostEl?.clientWidth || DEFAULT_CANVAS_WIDTH);
  const height = Math.max(1, state.drawingHostEl?.clientHeight || DEFAULT_CANVAS_HEIGHT);
  return {
    x: clamp(Number(point?.x) || 0, 0, width),
    y: clamp(Number(point?.y) || 0, 0, height)
  };
}

function createReadLayoutSeed() {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

function bindBuildEvents(state) {
  state.undoBtnEl?.addEventListener("click", () => {
    if (state.answerRevealed || !state.buildSegments.length) return;
    state.buildSegments.pop();
    closeMagnifier(state);
    renderBuildCanvas(state);
    syncBuildControls(state);
    syncValidateState(state);
  });

  state.magnifierBtnEl?.addEventListener("click", () => {
    if (state.answerRevealed) return;
    state.magnifierOpen ? closeMagnifier(state) : openMagnifier(state);
  });

  state.buildSvgEl?.addEventListener("pointerdown", (event) => onBuildPointerDown(state, event));
  state.buildSvgEl?.addEventListener("pointermove", (event) => onBuildPointerMove(state, event));
  state.buildSvgEl?.addEventListener("pointerup", (event) => onBuildPointerUp(state, event));
  state.buildSvgEl?.addEventListener("pointercancel", () => {
    cancelBuildGesture(state);
    renderBuildCanvas(state);
    syncBuildControls(state);
  });

  state.magnifierSvgEl?.addEventListener("pointerdown", (event) => onMagnifierPointerDown(state, event));
  state.magnifierSvgEl?.addEventListener("pointermove", (event) => onMagnifierPointerMove(state, event));
  state.magnifierSvgEl?.addEventListener("pointerup", (event) => onMagnifierPointerUp(state, event));
  state.magnifierSvgEl?.addEventListener("pointercancel", () => cancelMagnifierGesture(state));
}

export function clampBuildTranslation(state, dx, dy, { startPoint, segments }) {
  const points = [];
  if (startPoint) points.push(startPoint);
  (segments || []).forEach((segment) => {
    if (segment?.start) points.push(segment.start);
    if (segment?.end) points.push(segment.end);
  });
  if (!points.length) return { x: 0, y: 0 };

  const xs = points.map((point) => Number(point.x)).filter(Number.isFinite);
  const ys = points.map((point) => Number(point.y)).filter(Number.isFinite);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const margin = Math.max(6, Number(MILLIMETRE_DRAWING.tickLengthPx) + 4);
  const marginX = Math.min(margin, Math.max(0, (state.canvasWidth - (maxX - minX)) / 2));
  const marginY = Math.min(margin, Math.max(0, (state.canvasHeight - (maxY - minY)) / 2));

  return {
    x: clamp(Number(dx), marginX - minX, state.canvasWidth - marginX - maxX),
    y: clamp(Number(dy), marginY - minY, state.canvasHeight - marginY - maxY)
  };
}

function translatePoint(point, dx, dy) {
  return {
    x: Number(point?.x || 0) + Number(dx || 0),
    y: Number(point?.y || 0) + Number(dy || 0)
  };
}

function translateSegment(segment, dx, dy) {
  const start = translatePoint(segment.start, dx, dy);
  const end = translatePoint(segment.end, dx, dy);
  return {
    ...segment,
    start,
    end,
    angle: Math.atan2(end.y - start.y, end.x - start.x)
  };
}

function onBuildPointerDown(state, event) {
  if (state.answerRevealed || state.magnifierOpen || !state.buildSvgEl || state.drawPointerId != null) return;
  if (event.button != null && event.button !== 0) return;

  const point = buildPointerToLocalPoint(state, event);
  if (!isPointInsideCanvas(state, point)) return;

  // Au tout premier geste, le point d'appui devient immédiatement le point de
  // départ ET le tracé peut commencer dans le même mouvement. Un simple clic
  // reste aussi possible : si aucune longueur n'est reconnue au relâchement,
  // le point de départ demeure simplement posé à cet endroit.
  if (!state.buildStartPoint) {
    event.preventDefault();
    state.buildStartPoint = { ...point };
    state.drawPointerId = event.pointerId;
    state.buildGestureMode = "draw";
    state.drawStart = { ...point };
    state.drawPointer = { ...point };
    state.buildSvgEl.setPointerCapture?.(event.pointerId);
    state.buildSvgEl.classList.add("is-drawing-trace");
    renderBuildCanvas(state);
    syncBuildControls(state);
    return;
  }

  const endpoint = currentBuildEndpoint(state);
  const startsOnPointerDisc = endpoint
    && distanceBetween(point, endpoint) <= MILLIMETRE_DRAWING.startHitRadiusPx;

  event.preventDefault();
  state.drawPointerId = event.pointerId;
  state.buildSvgEl.setPointerCapture?.(event.pointerId);

  if (!startsOnPointerDisc) {
    state.buildGestureMode = "pan";
    state.buildPanDragStartPoint = { ...point };
    state.buildPanOriginStartPoint = { ...state.buildStartPoint };
    state.buildPanOriginSegments = state.buildSegments.map(cloneSegment);
    state.buildSvgEl.classList.add("is-moving-trace");
    return;
  }

  state.buildGestureMode = "draw";
  state.drawStart = { ...endpoint };
  state.drawPointer = point;
  state.buildSvgEl.classList.add("is-drawing-trace");
  renderBuildCanvas(state);
}

function onBuildPointerMove(state, event) {
  if (state.drawPointerId !== event.pointerId || !state.buildSvgEl) return;
  event.preventDefault();
  const point = buildPointerToLocalPoint(state, event);

  if (state.buildGestureMode === "pan") {
    if (!state.buildPanDragStartPoint || !state.buildPanOriginStartPoint) return;
    const rawDx = point.x - state.buildPanDragStartPoint.x;
    const rawDy = point.y - state.buildPanDragStartPoint.y;
    const delta = clampBuildTranslation(state, rawDx, rawDy, {
      startPoint: state.buildPanOriginStartPoint,
      segments: state.buildPanOriginSegments
    });
    state.buildStartPoint = translatePoint(state.buildPanOriginStartPoint, delta.x, delta.y);
    state.buildSegments = state.buildPanOriginSegments.map((segment) => translateSegment(segment, delta.x, delta.y));
    renderBuildCanvas(state);
    return;
  }

  if (state.buildGestureMode !== "draw") return;
  state.drawPointer = point;
  renderBuildCanvas(state);
}

function onBuildPointerUp(state, event) {
  if (state.drawPointerId !== event.pointerId || !state.buildSvgEl) return;
  event.preventDefault();

  if (state.buildGestureMode === "pan") {
    cancelBuildGesture(state);
    renderBuildCanvas(state);
    syncBuildControls(state);
    return;
  }

  if (state.buildGestureMode !== "draw" || !state.drawStart) {
    cancelBuildGesture(state);
    return;
  }

  const pointer = buildPointerToLocalPoint(state, event);
  const distance = distanceBetween(state.drawStart, pointer);
  const recognizedMm = recognizeNormalSegmentLengthMm(distance, {
    firstSegment: state.buildSegments.length === 0
  });

  if (recognizedMm != null) {
    const segment = createSegment(state.drawStart, pointer, recognizedMm, {
      kind: recognizedMm === 100 ? "hundred" : "ten",
      inputMode: "normal"
    });
    if (isPointInsideCanvas(state, segment.end)) {
      state.buildSegments.push(segment);
    }
  }

  cancelBuildGesture(state);
  renderBuildCanvas(state);
  syncBuildControls(state);
  syncValidateState(state);
}

function cancelBuildGesture(state) {
  if (state.buildSvgEl && state.drawPointerId != null) {
    try { state.buildSvgEl.releasePointerCapture?.(state.drawPointerId); } catch {}
  }
  state.drawPointerId = null;
  state.buildGestureMode = null;
  state.drawStart = null;
  state.drawPointer = null;
  state.buildPanDragStartPoint = null;
  state.buildPanOriginStartPoint = null;
  state.buildPanOriginSegments = [];
  state.buildSvgEl?.classList.remove("is-moving-trace", "is-drawing-trace");
}

function renderBuildCanvas(state) {
  if (!state.buildSvgEl) return;
  const width = Math.max(1, state.canvasWidth || DEFAULT_CANVAS_WIDTH);
  const height = Math.max(1, state.canvasHeight || DEFAULT_CANVAS_HEIGHT);
  state.buildSvgEl.setAttribute("viewBox", `0 0 ${fmt(width)} ${fmt(height)}`);
  state.buildSvgEl.removeAttribute("width");
  state.buildSvgEl.removeAttribute("height");

  let traceMarkup = "";

  if (state.answerRevealed && state.latestEvaluation) {
    if (state.latestEvaluation.isCorrect) {
      traceMarkup = renderSegmentsMarkup(state.submittedBuildSegments, {
        className: "mm-segment--correct"
      });
    } else if (state.answerDisplayMode === "student") {
      traceMarkup = renderSegmentsMarkup(state.submittedBuildSegments, {
        className: "mm-segment--student-wrong"
      });
    } else {
      traceMarkup = renderBuildCorrectionMarkup(state, width, height);
    }
  } else {
    traceMarkup = renderSegmentsMarkup(state.buildSegments);
  }

  // Le groupe de tracé est volontairement distinct du fond blanc / quadrillage.
  // Le shell peut ainsi faire son fondu Réponse -> Correction uniquement sur la
  // construction, sans faire disparaître la zone de travail.
  let markup = `<g class="mm-build-trace" id="mm_build_trace">${traceMarkup}</g>`;
  const endpoint = segmentEndPointOrNull(state.buildSegments, state.buildStartPoint);

  if (!state.answerRevealed && state.drawStart && state.drawPointer) {
    markup += `<line class="mm-provisional-line" x1="${fmt(state.drawStart.x)}" y1="${fmt(state.drawStart.y)}" x2="${fmt(state.drawPointer.x)}" y2="${fmt(state.drawPointer.y)}" />`;
  }

  if (!state.answerRevealed && endpoint) {
    markup += `<circle class="mm-current-point" cx="${fmt(endpoint.x)}" cy="${fmt(endpoint.y)}" r="6" />`;
    markup += `<circle class="mm-current-point-hit" cx="${fmt(endpoint.x)}" cy="${fmt(endpoint.y)}" r="${fmt(MILLIMETRE_DRAWING.startHitRadiusPx)}" />`;
  }

  state.buildSvgEl.innerHTML = markup;
  state.buildTraceEl = state.buildSvgEl.querySelector("#mm_build_trace");
}

function renderBuildCorrectionMarkup(state, width, height) {
  const student = state.submittedBuildSegments || [];
  const expected = Array.isArray(state.latestEvaluation?.expectedSegments)
    ? state.latestEvaluation.expectedSegments.map(Number)
    : (state.currentQuestion?.decomposition?.segments || []).map(Number);

  let prefixLength = 0;
  while (
    prefixLength < student.length
    && prefixLength < expected.length
    && Number(student[prefixLength]?.mm) === Number(expected[prefixLength])
  ) {
    prefixLength += 1;
  }

  const preserved = student.slice(0, prefixLength).map(cloneSegment);
  const startPoint = segmentEndPointOrNull(preserved, state.buildStartPoint)
    || { x: width / 2, y: height / 2 };
  const previousAngle = preserved[preserved.length - 1]?.angle;
  const remaining = expected.slice(prefixLength);
  const correction = buildCorrectionSuffixSegments(startPoint, remaining, {
    width,
    height,
    previousAngle
  });

  return [
    renderSegmentsMarkup(preserved, { className: "mm-segment--correction-preserved" }),
    renderSegmentsMarkup(correction, { className: "mm-segment--correction" })
  ].join("");
}

function buildCorrectionSuffixSegments(startPoint, values, { width, height, previousAngle = null } = {}) {
  const segments = [];
  let point = { ...startPoint };
  let angle = Number.isFinite(previousAngle) ? Number(previousAngle) : null;

  values.forEach((rawValue) => {
    const mm = Number(rawValue);
    if (!(mm > 0)) return;
    const nextAngle = chooseCorrectionAngle(point, mm, angle, { width, height });
    const pointer = {
      x: point.x + Math.cos(nextAngle) * mmToPx(mm),
      y: point.y + Math.sin(nextAngle) * mmToPx(mm)
    };
    const segment = createSegment(point, pointer, mm, {
      kind: mm === 100 ? "hundred" : mm === 10 ? "ten" : "unit",
      inputMode: "correction"
    });
    segments.push(segment);
    point = { ...segment.end };
    angle = segment.angle;
  });

  return segments;
}

function chooseCorrectionAngle(start, mm, previousAngle, { width, height }) {
  const margin = Math.max(8, Number(MILLIMETRE_DRAWING.tickLengthPx) + 6);
  const centerAngle = Math.atan2(height / 2 - start.y, width / 2 - start.x);
  const preferredTurns = mm === 100
    ? [82, -82, 98, -98, 68, -68, 112, -112]
    : mm === 10
      ? [38, -38, 55, -55, 78, -78, 100, -100]
      : [42, -42, 65, -65, 90, -90];
  const candidates = [centerAngle];

  if (Number.isFinite(previousAngle)) {
    preferredTurns.forEach((turn) => candidates.push(previousAngle + degreesToRadians(turn)));
  }
  for (let deg = 0; deg < 360; deg += 15) candidates.push(degreesToRadians(deg));

  let bestAngle = centerAngle;
  let bestScore = -Infinity;
  const length = mmToPx(mm);

  candidates.forEach((candidate, index) => {
    const end = {
      x: start.x + Math.cos(candidate) * length,
      y: start.y + Math.sin(candidate) * length
    };
    if (
      end.x < margin || end.y < margin
      || end.x > width - margin || end.y > height - margin
    ) return;

    const clearance = Math.min(end.x, end.y, width - end.x, height - end.y);
    const preferredBonus = index < 1 + preferredTurns.length ? 80 - index * 3 : 0;
    const centerDistance = Math.hypot(end.x - width / 2, end.y - height / 2);
    const score = clearance + preferredBonus - centerDistance * 0.04;
    if (score > bestScore) {
      bestScore = score;
      bestAngle = candidate;
    }
  });

  return bestAngle;
}

function openMagnifier(state) {
  if (!state.magnifierEl || !state.buildStartPoint || state.answerRevealed) return;
  state.magnifierOpen = true;
  state.magnifierEl.hidden = false;
  state.magnifierBtnEl?.setAttribute("aria-expanded", "true");

  // Si le dernier morceau est déjà un segment d'unités, la loupe se rouvre en
  // mode édition sur CE segment : même origine, même direction et même compteur.
  // Un Annuler supprime naturellement ce segment et remettra donc la loupe à 0.
  const lastIndex = state.buildSegments.length - 1;
  const last = lastIndex >= 0 ? state.buildSegments[lastIndex] : null;
  const editsExistingUnit = last && Number(last.mm) >= 1 && Number(last.mm) <= 9;
  state.magnifierEditingSegmentIndex = editsExistingUnit ? lastIndex : -1;
  state.magnifierUnits = editsExistingUnit ? Number(last.mm) : 0;
  state.magnifierAngle = editsExistingUnit && Number.isFinite(last.angle) ? Number(last.angle) : 0;
  state.magnifierPointer = null;
  positionMagnifier(state);
  renderMagnifier(state);
}

function magnifierAnchorPoint(state) {
  const index = Number(state.magnifierEditingSegmentIndex);
  if (index >= 0 && state.buildSegments[index]?.start) {
    return { ...state.buildSegments[index].start };
  }
  return currentBuildEndpoint(state);
}

function positionMagnifier(state) {
  if (!state.magnifierEl || !state.magnifierOpen) return;
  const anchor = magnifierAnchorPoint(state);
  if (!anchor) return;

  const radius = magnifierDisplayRadiusPx();
  const diameter = radius * 2;
  state.magnifierEl.style.width = `${fmt(diameter)}px`;
  state.magnifierEl.style.height = `${fmt(diameter)}px`;
  state.magnifierEl.style.left = `${fmt(anchor.x - radius)}px`;
  state.magnifierEl.style.top = `${fmt(anchor.y - radius)}px`;

  if (state.magnifierSvgEl) {
    state.magnifierSvgEl.setAttribute("viewBox", `0 0 ${fmt(diameter)} ${fmt(diameter)}`);
  }
}

function closeMagnifier(state) {
  state.magnifierOpen = false;
  if (state.magnifierEl) state.magnifierEl.hidden = true;
  state.magnifierBtnEl?.setAttribute("aria-expanded", "false");
  cancelMagnifierGesture(state);
  state.magnifierEditingSegmentIndex = -1;
}

function onMagnifierPointerDown(state, event) {
  if (!state.magnifierOpen || state.answerRevealed || !state.magnifierSvgEl || state.magnifierPointerId != null) return;
  if (event.button != null && event.button !== 0) return;

  const point = magnifierPointerToLocalPoint(state, event);
  const origin = magnifierOrigin(state);
  if (distanceBetween(point, origin) > Math.max(24, mmToPx(2) * MILLIMETRE_DRAWING.magnifierScale)) return;

  event.preventDefault();
  state.magnifierPointerId = event.pointerId;
  state.magnifierPointer = point;
  // On ne remet surtout pas le compteur à zéro ici : si la loupe édite déjà
  // un segment d'unités, sa valeur reste visible jusqu'à ce que l'élève trace
  // effectivement une nouvelle longueur.
  state.magnifierSvgEl.setPointerCapture?.(event.pointerId);
  renderMagnifier(state);
}

function onMagnifierPointerMove(state, event) {
  if (state.magnifierPointerId !== event.pointerId || !state.magnifierSvgEl) return;
  event.preventDefault();
  const point = magnifierPointerToLocalPoint(state, event);
  state.magnifierPointer = point;
  const origin = magnifierOrigin(state);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const distance = Math.hypot(dx, dy);
  const unitPx = mmToPx(1) * MILLIMETRE_DRAWING.magnifierScale;

  state.magnifierUnits = Math.max(0, Math.min(
    MILLIMETRE_DRAWING.maxUnitsPerMagnifierStroke,
    Math.floor(distance / Math.max(1, unitPx))
  ));
  state.magnifierAngle = distance > 0 ? Math.atan2(dy, dx) : state.magnifierAngle;
  renderMagnifier(state);
}

function onMagnifierPointerUp(state, event) {
  if (state.magnifierPointerId !== event.pointerId) return;
  event.preventDefault();
  const units = state.magnifierUnits;
  const angle = state.magnifierAngle;
  const editingIndex = Number(state.magnifierEditingSegmentIndex);

  if (units >= 1 && units <= MILLIMETRE_DRAWING.maxUnitsPerMagnifierStroke) {
    const start = magnifierAnchorPoint(state);
    if (start) {
      const pointer = {
        x: start.x + Math.cos(angle) * mmToPx(units),
        y: start.y + Math.sin(angle) * mmToPx(units)
      };
      const segment = createSegment(start, pointer, units, {
        kind: "unit",
        inputMode: "magnifier"
      });
      if (isPointInsideCanvas(state, segment.end)) {
        if (editingIndex >= 0 && state.buildSegments[editingIndex]) {
          state.buildSegments[editingIndex] = segment;
        } else {
          state.buildSegments.push(segment);
        }
        closeMagnifier(state);
        renderBuildCanvas(state);
        syncBuildControls(state);
        syncValidateState(state);
        return;
      }
    }
  }

  cancelMagnifierGesture(state);
  renderMagnifier(state);
}

function cancelMagnifierGesture(state) {
  if (state.magnifierSvgEl && state.magnifierPointerId != null) {
    try { state.magnifierSvgEl.releasePointerCapture?.(state.magnifierPointerId); } catch {}
  }
  state.magnifierPointerId = null;
  state.magnifierPointer = null;
}

function renderMagnifier(state) {
  if (!state.magnifierSvgEl || !state.magnifierOpen) return;
  const anchor = magnifierAnchorPoint(state);
  if (!anchor) return;

  const zoom = Math.max(1, Number(MILLIMETRE_DRAWING.magnifierScale) || 1);
  const radius = magnifierDisplayRadiusPx();
  const diameter = radius * 2;
  const origin = { x: radius, y: radius };
  const count = state.magnifierUnits;
  const angle = Number.isFinite(state.magnifierAngle) ? state.magnifierAngle : 0;

  state.magnifierSvgEl.setAttribute("viewBox", `0 0 ${fmt(diameter)} ${fmt(diameter)}`);

  // En édition d'un segment d'unités déjà présent, on retire ce seul segment du
  // contexte zoomé : il est redessiné juste après comme le segment actif, à son
  // opacité normale et avec le compteur correspondant.
  const editingIndex = Number(state.magnifierEditingSegmentIndex);
  const contextSegments = editingIndex >= 0
    ? state.buildSegments.filter((_, index) => index !== editingIndex)
    : state.buildSegments;
  const contextMarkup = renderSegmentsMarkup(contextSegments, {
    className: "mm-segment--magnifier-context"
  });
  const contextTransform = `translate(${fmt(origin.x)} ${fmt(origin.y)}) scale(${fmt(zoom)}) translate(${-fmtNumber(anchor.x)} ${-fmtNumber(anchor.y)})`;
  const visibleLocalSegments = contextSegments.map((segment) => ({
    start: projectPointIntoMagnifier(segment.start, anchor, origin, zoom),
    end: projectPointIntoMagnifier(segment.end, anchor, origin, zoom)
  }));

  let markup = `
    <circle class="mm-magnifier-bg" cx="${fmt(origin.x)}" cy="${fmt(origin.y)}" r="${fmt(radius)}" />
    <g class="mm-magnifier-zoomed-context" transform="${contextTransform}">${contextMarkup}</g>
  `;

  if (count > 0) {
    const visibleLength = mmToPx(count) * zoom;
    const end = {
      x: origin.x + Math.cos(angle) * visibleLength,
      y: origin.y + Math.sin(angle) * visibleLength
    };
    const segment = { mm: count, start: origin, end };
    visibleLocalSegments.push(segment);
    markup += `<line class="mm-segment-line mm-segment-line--magnified" x1="${fmt(origin.x)}" y1="${fmt(origin.y)}" x2="${fmt(end.x)}" y2="${fmt(end.y)}" />`;
    markup += `<path class="mm-ticks mm-ticks--magnified" d="${buildGraduationPath(segment, { scale: zoom, visibleMm: count })}" />`;
  }

  const countBaseline = resolveMagnifierCountBaseline({
    diameter,
    origin,
    segments: visibleLocalSegments
  });
  const countPlacement = countBaseline === MAGNIFIER_COUNT_TOP_BASELINE_PX ? "top" : "bottom";

  markup += `
    <circle class="mm-magnifier-origin" cx="${fmt(origin.x)}" cy="${fmt(origin.y)}" r="5" />
    <text class="mm-magnifier-count mm-magnifier-count--${countPlacement}" x="${fmt(origin.x)}" y="${fmt(countBaseline)}" text-anchor="middle">${count} mm</text>
  `;

  state.magnifierSvgEl.innerHTML = markup;
}

function projectPointIntoMagnifier(point, anchor, origin, zoom) {
  return {
    x: origin.x + (Number(point?.x) - Number(anchor?.x)) * zoom,
    y: origin.y + (Number(point?.y) - Number(anchor?.y)) * zoom
  };
}

export function resolveMagnifierCountBaseline({ diameter, origin, segments = [] }) {
  const safeDiameter = Math.max(1, Number(diameter) || 1);
  const centerX = Number(origin?.x) || safeDiameter / 2;
  const topSafeArea = {
    left: centerX - MAGNIFIER_COUNT_HALF_SAFE_WIDTH_PX,
    right: centerX + MAGNIFIER_COUNT_HALF_SAFE_WIDTH_PX,
    top: 0,
    bottom: MAGNIFIER_COUNT_TOP_SAFE_BOTTOM_PX
  };
  const topIsObstructed = segments.some((segment) => segmentIntersectsRect(segment, topSafeArea));
  return topIsObstructed
    ? safeDiameter - MAGNIFIER_COUNT_BOTTOM_INSET_PX
    : MAGNIFIER_COUNT_TOP_BASELINE_PX;
}

function segmentIntersectsRect(segment, rect) {
  const x0 = Number(segment?.start?.x);
  const y0 = Number(segment?.start?.y);
  const x1 = Number(segment?.end?.x);
  const y1 = Number(segment?.end?.y);
  if (![x0, y0, x1, y1].every(Number.isFinite)) return false;

  const dx = x1 - x0;
  const dy = y1 - y0;
  let minimum = 0;
  let maximum = 1;
  const boundaries = [
    [-dx, x0 - rect.left],
    [dx, rect.right - x0],
    [-dy, y0 - rect.top],
    [dy, rect.bottom - y0]
  ];

  for (const [direction, distance] of boundaries) {
    if (Math.abs(direction) < 1e-9) {
      if (distance < 0) return false;
      continue;
    }
    const ratio = distance / direction;
    if (direction < 0) {
      if (ratio > maximum) return false;
      minimum = Math.max(minimum, ratio);
    } else {
      if (ratio < minimum) return false;
      maximum = Math.min(maximum, ratio);
    }
  }

  return minimum <= maximum;
}

function magnifierDisplayRadiusPx() {
  return Math.max(
    mmToPx(10) * Number(MILLIMETRE_DRAWING.magnifierScale || 1),
    mmToPx(MILLIMETRE_DRAWING.magnifierRadiusMm || 12) * Number(MILLIMETRE_DRAWING.magnifierScale || 1)
  );
}

function magnifierOrigin(state) {
  const radius = magnifierDisplayRadiusPx();
  return { x: radius, y: radius };
}

function magnifierPointerToLocalPoint(state, event) {
  return clientPointToLocalPoint(state.magnifierSvgEl, event.clientX, event.clientY);
}


function revealAnswer(state) {
  if (!state.currentQuestion || state.answerRevealed) return;

  if (state.currentQuestion.questionType === QUESTION_TYPES.READ) {
    state.submittedReadAnswer = getCurrentReadValue(state);
    state.latestEvaluation = evaluateReadAnswer(state.currentQuestion, state.submittedReadAnswer);
  } else {
    state.submittedBuildSegments = state.buildSegments.map(cloneSegment);
    state.latestEvaluation = evaluateBuildAnswer(
      state.currentQuestion,
      state.submittedBuildSegments.map((segment) => segment.mm)
    );
  }

  cancelBuildGesture(state);
  state.answerRevealed = true;
  state.answerDisplayMode = "correction";
  state.root?.classList.add("mm-root--revealed");
  state.root?.classList.toggle("mm-root--correct", Boolean(state.latestEvaluation?.isCorrect));
  state.root?.classList.toggle("mm-root--incorrect", !state.latestEvaluation?.isCorrect);
  closeMagnifier(state);

  if (state.currentQuestion.questionType === QUESTION_TYPES.READ) {
    renderReadAnswerState(state);
  } else {
    renderBuildCanvas(state);
    syncBuildControls(state);
  }
  syncValidateState(state);
}

function renderReadAnswerState(state) {
  if (!state.currentQuestion || !state.latestEvaluation) return;
  const expected = String(state.currentQuestion.value);
  const isCorrect = state.latestEvaluation.isCorrect;

  destroyAnswerControl(state);
  state.keypadAbortController?.abort?.();
  state.keypadAbortController = null;
  state.responseInputEl = null;

  if (state.showResponseBox && state.responseShellEl) {
    renderDisplayedReadResponse(state);
    return;
  }

  if (state.freeAnswerEl) {
    state.freeAnswerEl.hidden = false;
    state.freeAnswerEl.innerHTML = `<strong>${escapeHtml(expected)}</strong><span>mm</span>`;
    state.freeAnswerEl.classList.toggle("is-correct", isCorrect);
  }
}

function renderDisplayedReadResponse(state) {
  if (!state.responseShellEl || !state.currentQuestion || !state.latestEvaluation) return;
  const canToggle = canToggleStudentAnswerDisplay(state);
  const showStudent = canToggle && state.answerDisplayMode === "student";
  const value = showStudent ? state.submittedReadAnswer : String(state.currentQuestion.value);
  const className = showStudent
    ? (state.latestEvaluation.isCorrect ? "is-correct" : "is-incorrect")
    : (state.latestEvaluation.isCorrect ? "is-correct" : "is-correction");

  state.responseShellEl.innerHTML = `
    <div class="mm-number-response-stack mm-number-response-stack--result">
      <div class="mm-number-answer-row">
        <div class="mm-number-answer-host">
          ${renderNumericAnswerDisplayMarkup(value, {
            className: `mm-number-answer mm-number-answer--readonly ${className}`,
            ariaLabel: showStudent ? "Réponse de l’élève" : "Correction"
          })}
        </div>
        <span class="mm-unit-label">mm</span>
      </div>
      ${renderNumericKeypad({
        hidden: true,
        rootClassName: "mm-number-keypad",
        buttonClassName: "mm-number-keypad-button",
        clearButtonClassName: "mm-number-keypad-button--clear",
        dataAttribute: NUMERIC_KEY_DATA_ATTRIBUTE,
        ariaLabel: "Clavier numérique"
      })}
    </div>
  `;
}

function requestReveal(state) {
  const evaluation = getCurrentEvaluation(state);
  const requested = state.latestContext?.services?.requestAnswerPhase?.({
    manual: false,
    showAnswerNow: true,
    wasCorrect: Boolean(evaluation?.isCorrect)
  });
  if (requested === false || !state.latestContext?.services?.requestAnswerPhase) {
    revealAnswer(state);
  }
}

function getCurrentEvaluation(state) {
  if (!state.currentQuestion) return { isCorrect: false };
  if (state.currentQuestion.questionType === QUESTION_TYPES.BUILD) {
    return evaluateBuildAnswer(state.currentQuestion, state.buildSegments.map((segment) => segment.mm));
  }
  return evaluateReadAnswer(state.currentQuestion, getCurrentReadValue(state));
}

function canSubmitAnswer(state) {
  if (!state.currentQuestion) return false;
  if (state.currentQuestion.questionType === QUESTION_TYPES.BUILD) {
    return state.buildSegments.length > 0;
  }
  if (!state.showResponseBox) return false;
  return /^\d+$/.test(getCurrentReadValue(state));
}

function getCurrentReadValue(state) {
  return String(state.answerControl?.getValue?.() ?? state.responseInputEl?.value ?? "").trim();
}

function getShellAnswerDisplayState(state) {
  const canToggle = canToggleStudentAnswerDisplay(state);
  const isReadQuestion = state.currentQuestion?.questionType === QUESTION_TYPES.READ;
  return {
    canToggle,
    mode: canToggle ? state.answerDisplayMode : "correction",
    // En mode Lire, le fondu Réponse/Correction ne concerne que la boîte
    // réponse : le dessin de M. Millimètre reste parfaitement stable.
    transitionTargets: (isReadQuestion
      ? [state.responseShellEl]
      : [state.buildTraceEl]
    ).filter(Boolean)
  };
}

function applyShellAnswerDisplayMode(state, mode) {
  if (!state.answerRevealed || !canToggleStudentAnswerDisplay(state)) {
    state.answerDisplayMode = "correction";
    return false;
  }

  state.answerDisplayMode = String(mode).trim().toLowerCase() === "student" ? "student" : "correction";
  if (state.currentQuestion?.questionType === QUESTION_TYPES.READ) {
    renderDisplayedReadResponse(state);
  } else {
    renderBuildCanvas(state);
  }
  return true;
}

function canToggleStudentAnswerDisplay(state) {
  if (!state.answerRevealed || !state.latestEvaluation || state.latestEvaluation.isCorrect) return false;
  if (state.currentQuestion?.questionType === QUESTION_TYPES.READ) {
    return state.showResponseBox && Boolean(String(state.submittedReadAnswer || "").trim());
  }
  return state.submittedBuildSegments.length > 0;
}

function updateInstructionDisplay(state) {
  const fallback = state.currentQuestion?.prompt || "Construis comme M. Millimètre.";
  const text = resolveQuestionInstructionText(state.latestContext, fallback, fallback);
  setToolInstructionText(state.instructionEl, text);
}

function renderSegmentsMarkup(segments = [], { className = "" } = {}) {
  return segments.map((segment) => {
    const extraClass = className ? ` ${className}` : "";
    const ticks = buildGraduationPath(segment);
    return `
      <g class="mm-segment${extraClass}" data-mm-length="${escapeHtml(segment.mm)}">
        <line class="mm-segment-line" x1="${fmt(segment.start.x)}" y1="${fmt(segment.start.y)}" x2="${fmt(segment.end.x)}" y2="${fmt(segment.end.y)}" />
        <path class="mm-ticks" d="${ticks}" />
      </g>
    `;
  }).join("");
}

function syncBuildCanvasSize(state) {
  if (!state.drawingHostEl || !state.buildSvgEl) return;
  // IMPORTANT : clientWidth/clientHeight appartiennent au repère local CSS du
  // runtime. getBoundingClientRect() renverrait des dimensions déjà mises à
  // l'échelle à l'écran et rendrait le tracé dépendant de la résolution/scale.
  state.canvasWidth = Math.max(1, Number(state.drawingHostEl.clientWidth) || DEFAULT_CANVAS_WIDTH);
  state.canvasHeight = Math.max(1, Number(state.drawingHostEl.clientHeight) || DEFAULT_CANVAS_HEIGHT);
}

function syncBuildControls(state) {
  if (state.undoBtnEl) state.undoBtnEl.disabled = state.answerRevealed || state.buildSegments.length === 0;
  if (state.magnifierBtnEl) {
    state.magnifierBtnEl.disabled = state.answerRevealed || !state.buildStartPoint;
    state.magnifierBtnEl.classList.toggle("is-active", state.magnifierOpen);
  }
  state.buildSvgEl?.classList.toggle("has-start-point", Boolean(state.buildStartPoint));
}

function currentBuildEndpoint(state) {
  return segmentEndPointOrNull(state.buildSegments, state.buildStartPoint);
}

function segmentEndPointOrNull(segments = [], fallback = null) {
  const last = segments[segments.length - 1];
  if (last?.end) return { ...last.end };
  return fallback ? { ...fallback } : null;
}

function isPointInsideCanvas(state, point) {
  if (!point) return false;
  const pad = 5;
  return point.x >= pad
    && point.y >= pad
    && point.x <= state.canvasWidth - pad
    && point.y <= state.canvasHeight - pad;
}

function buildPointerToLocalPoint(state, event) {
  return clientPointToLocalPoint(state.buildSvgEl, event.clientX, event.clientY);
}


function degreesToRadians(value) {
  return Number(value) * Math.PI / 180;
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, Number(min) || 0), Number(max) || 0);
}

function distanceBetween(a, b) {
  return Math.hypot(Number(a?.x) - Number(b?.x), Number(a?.y) - Number(b?.y));
}

function cloneSegment(segment) {
  return {
    ...segment,
    start: { ...segment.start },
    end: { ...segment.end }
  };
}

function syncValidateState(state) {
  state.latestContext?.services?.notifyValidationStateChanged?.();
}

function shouldShowResponseBox(context = {}) {
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
  const safe = String(value ?? "").trim().toLowerCase();
  return safe === "free" || safe === "boxed" ? safe : "";
}

function teardownBindings(state) {
  state.keypadAbortController?.abort?.();
  state.keypadAbortController = null;
  state.resizeObserver?.disconnect?.();
  state.resizeObserver = null;
  state.readResizeObserver?.disconnect?.();
  state.readResizeObserver = null;
  state.readLensDragAbortController?.abort?.();
  state.readLensDragAbortController = null;
}

function destroyAnswerControl(state) {
  state.answerControl?.destroy?.();
  state.answerControl = null;
  state.responseInputEl = null;
}

function teardownState(state, container) {
  teardownBindings(state);
  destroyAnswerControl(state);
  if (container) container.innerHTML = "";
  state.container = null;
  state.root = null;
  state.stageEl = null;
  state.currentQuestion = null;
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  ensureToolInstructionStyles();
  const href = new URL("./activity.css", import.meta.url).href;
  if (document.querySelector(`link[data-mm-activity-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.mmActivityStyle = href;
  document.head.appendChild(link);
}

function fmtNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fmt(value) {
  return Number(value).toFixed(2).replace(/\.00$/, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
