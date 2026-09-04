import { createNumericAnswerControl, renderNumericAnswerDisplayMarkup } from "../../tool-ui/numeric-answer.js";
import { bindNumericKeypadEvents, renderNumericKeypad } from "../../tool-ui/numeric-keypad.js";
import { bindFreeDrag } from "../../tool-ui/drag-core.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveQuestionInstructionText,
  setToolInstructionText
} from "../../tool-instruction.js";

const injectedStyleUrls = new Set();

export function createDecimalRepresentationActivity(modelApi = {}) {
  const {
    normalizeSettings,
    pickQuestion,
    questionKey,
    renderRepresentationSvg,
    renderRepresentationPieceSvg,
    REPRESENTATION_DIRECTIONS,
    DISPLAY_MODES
  } = modelApi;

  const activityCssUrl = modelApi.activityCssUrl || new URL("./activity.css", import.meta.url).href;
  const blueHundredRowsCentered = modelApi.blueHundredRowsCentered !== false;
  const ASSET_MARKUP_CACHE = new Map();

const DRAG_THRESHOLD_PX = 8;
const ORGANIZE_SNAP_THRESHOLD_PX = 4;

// Point de réglage unique de toute la chorégraphie de correction du mode
// « Nombre → Représentation ». Modifier uniquement ces valeurs pour tester
// le rythme sans avoir à chercher des durées dispersées dans le moteur/CSS.
const BUILD_REVIEW_TIMING = Object.freeze({
  organizeStaggerMs: 90,
  organizeMoveMs: 280,
  extraArrivalPauseMs: 120,
  extraPulseMs: 260,
  extraAfterPulsePauseMs: 120,
  studentReviewHoldMs: 3000,
  correctionPanelPauseMs: 180,
  extraFadeMs: 280,
  overflowArrivalMs: 220,
  betweenExtrasMs: 90,
  beforeMissingMs: 180,
  missingFadeMs: 320,
  betweenMissingMs: 100
});

const BUILD_PIECE_SIZES = Object.freeze({
  picbille: {
    ones: { width: 30, height: 30 },
    tens: { width: 395, height: 34 },
    hundreds: { width: 150, height: 128 }
  },
  dede: {
    ones: { width: 25, height: 25 },
    tens: { width: 192.5, height: 106.25 }
  },
  blocs_bleus_base10: {
    ones: { width: 15, height: 15 },
    tens: { width: 150, height: 15 },
    hundreds: { width: 150, height: 150 }
  },
  blocs_textuels: {
    ones: { width: 90, height: 90 },
    tens: { width: 90, height: 90 },
    hundreds: { width: 90, height: 90 }
  }
});

const RANDOM_REPRESENTATION_PIECE_SIZES = Object.freeze({
  picbille: {
    ones: { width: 42, height: 42 },
    tens: { width: 500, height: 44 },
    hundreds: { width: 190, height: 162 }
  },
  blocs_bleus_base10: {
    ones: { width: 19, height: 19 },
    tens: { width: 190, height: 19 },
    hundreds: { width: 190, height: 190 }
  }
});

const RANDOM_REPRESENTATION_PLACEMENT_INSET = 12;

const PALETTE_PIECE_SIZES = Object.freeze({
  picbille: {
    ones: { width: 30, height: 30 },
    tens: { width: 395, height: 34 },
    hundreds: { width: 124, height: 106 }
  },
  dede: {
    ones: { width: 18, height: 18 },
    tens: { width: 154, height: 85 }
  },
  blocs_bleus_base10: {
    ones: { width: 34, height: 34 },
    tens: { width: 160, height: 34 },
    hundreds: { width: 158, height: 158 }
  },
  blocs_textuels: {
    ones: { width: 92, height: 92 },
    tens: { width: 92, height: 92 },
    hundreds: { width: 92, height: 92 }
  }
});

function createActivity(initialContext = {}) {
  injectStyles();

  const state = createRuntimeState(initialContext);

  return {
    mount(container, context = initialContext) {
      state.container = container;
      state.latestContext = context ?? state.latestContext;
      renderShell(state);
      syncValidateState(state);
      startPhaseMonitor(state);
    },

    next(container, context = initialContext) {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      if (!state.container) return;

      if (!state.root) {
        renderShell(state);
      }

      loadNextQuestion(state, state.latestContext ?? {});
    },

    showAnswer(container, context = initialContext) {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      return revealAnswer(state);
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
      return shouldShowResponseBox(context);
    },

    canValidate() {
      return !state.answerRevealed && canSubmitAnswer(state);
    },

    validate() {
      if (!canSubmitAnswer(state) || state.answerRevealed || state.builderAnimating) return false;
      requestReveal(state);
      return true;
    },

    unmount(container) {
      stopPhaseMonitor(state);
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
    questionWrap: null,
    numberColumnEl: null,
    numberEl: null,
    numberResponseShellEl: null,
    panelShellEl: null,
    arrowEl: null,
    panelEl: null,
    panelInnerEl: null,
    builderSidebarEl: null,
    numberKeypadEl: null,
    renderedShowResponseBox: null,
    inputEl: null,
    validateBtn: null,
    answerControl: null,
    responseAbortController: null,
    currentQuestion: null,
    lastQuestionKey: null,
    answerRevealed: false,
    responseUi: getResponseUi(initialContext),
    showResponseBox: shouldShowResponseBox(initialContext),
    builderWorkspaceEl: null,
    builderItemsLayerEl: null,
    builderCueEl: null,
    builderPaletteEl: null,
    builderOverflowEl: null,
    transitionLayerEl: null,
    buildItems: [],
    buildItemsById: new Map(),
    buildItemElementsById: new Map(),
    nextBuildItemId: 1,
    nextBuildZIndex: 1,
    buildDrag: null,
    organizeBtnEl: null,
    organizeTimers: [],
    randomPlacementFrameId: null,
    randomPlacementUsesTimeout: false,
    builderAnimating: false,
    correctionReveal: false,
    showExtraFeedback: false,
    builderPaletteHiddenForReview: false,
    phaseMonitorId: null,
    lastObservedPhaseKind: null,
    answerDisplayMode: "correction",
    studentAnswerSnapshot: null,
    correctionSnapshot: null,
    studentBuildSnapshot: null,
    correctionBuildSnapshot: null,
    buildCorrectionAnimated: false,
    validationRevealRequested: false,
    lastEvaluation: null
  };
}

function buildAssetMarkupCacheKey(themeId, kind, options = {}) {
  const entries = Object.entries(options || {})
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify([String(themeId || ""), String(kind || ""), entries]);
}

function getCachedAssetMarkup(themeId, kind, options = {}) {
  const cacheKey = buildAssetMarkupCacheKey(themeId, kind, options);
  let markup = ASSET_MARKUP_CACHE.get(cacheKey);
  if (markup === undefined) {
    markup = renderRepresentationPieceSvg(themeId, kind, options);
    ASSET_MARKUP_CACHE.set(cacheKey, markup);
  }
  return { cacheKey, markup };
}

function replaceBuildItems(state, items) {
  state.buildItems = Array.isArray(items) ? items : [];
  state.buildItemsById = new Map(state.buildItems.map((item) => [String(item.id || ""), item]));
  return state.buildItems;
}

function appendBuildItem(state, item) {
  state.buildItems.push(item);
  state.buildItemsById.set(String(item.id || ""), item);
  return item;
}

function clearBuildItemElements(state) {
  state.buildItemElementsById.clear();
}

function getBuildItemElement(state, itemId) {
  return state.buildItemElementsById.get(String(itemId || "")) || null;
}

function syncRuntimeState(state, context = state.latestContext) {
  state.responseUi = getResponseUi(context);
  state.showResponseBox = shouldShowResponseBox(context);
}

function renderShell(state) {
  const container = state.container;
  if (!container) return;

  syncRuntimeState(state);
  destroyAnswerControl(state);

  container.innerHTML = `
    <div class="tool-runtime tool-runtime--representation-decimale rd-root${state.showResponseBox ? " rd-root--boxed" : " rd-root--free"}">
      ${renderToolInstruction({ id: "rd_instruction" })}
      <div class="rd-layout">
        <div class="rd-main-row" id="rd_question">
          <div class="rd-number-column" id="rd_number_column">
            <div class="rd-number" id="rd_number"></div>
            <div class="rd-number-response-shell" id="rd_number_response_shell"></div>
          </div>
          <div class="rd-arrow-column">
            <div class="rd-arrow" id="rd_arrow" aria-hidden="true"></div>
          </div>
          <div class="rd-panel-shell is-empty" id="rd_panel_shell">
            <div class="rd-panel">
              <div class="rd-panel-inner" id="rd_panel_inner"></div>
            </div>
            <div class="rd-panel-transition-layer" id="rd_panel_transition_layer"></div>
          </div>
        </div>
        <div class="rd-builder-sidebar is-hidden" id="rd_builder_sidebar"></div>
        <div class="rd-number-keypad-shell is-hidden" id="rd_number_keypad_shell"></div>
      </div>
    </div>
  `;

  state.root = container.querySelector(".rd-root");
  state.renderedShowResponseBox = state.showResponseBox;
  state.instructionEl = container.querySelector("#rd_instruction");
  state.questionWrap = container.querySelector("#rd_question");
  state.numberColumnEl = container.querySelector("#rd_number_column");
  state.numberEl = container.querySelector("#rd_number");
  state.numberResponseShellEl = container.querySelector("#rd_number_response_shell");
  state.panelShellEl = container.querySelector("#rd_panel_shell");
  state.arrowEl = container.querySelector("#rd_arrow");
  state.panelEl = container.querySelector(".rd-panel");
  state.panelInnerEl = container.querySelector("#rd_panel_inner");
  state.builderSidebarEl = container.querySelector("#rd_builder_sidebar");
  state.numberKeypadEl = container.querySelector("#rd_number_keypad_shell");
  state.transitionLayerEl = container.querySelector("#rd_panel_transition_layer");
  state.inputEl = null;
  state.validateBtn = null;
  state.answerControl = null;
  state.responseAbortController = null;
  state.builderWorkspaceEl = null;
  state.builderItemsLayerEl = null;
  state.builderCueEl = null;
  state.builderPaletteEl = null;
  state.organizeBtnEl = null;
  state.phaseMonitorId = null;
  state.lastObservedPhaseKind = null;
  if (state.builderSidebarEl) {
    state.builderSidebarEl.innerHTML = "";
    state.builderSidebarEl.hidden = false;
    state.builderSidebarEl.classList.add("is-hidden");
    state.builderSidebarEl.style.width = "";
    state.builderSidebarEl.style.flexBasis = "";
  }
  if (state.numberKeypadEl) {
    state.numberKeypadEl.innerHTML = "";
    state.numberKeypadEl.hidden = false;
    state.numberKeypadEl.classList.add("is-hidden");
  }
  if (state.transitionLayerEl) {
    state.transitionLayerEl.innerHTML = "";
  }

  resetVisualState(state);
  updateInstructionDisplay(state);
}

function loadNextQuestion(state, context = {}) {
  syncRuntimeState(state, context);

  const settings = normalizeSettings(context?.settings);
  const nextQuestion = pickQuestion(settings, {
    avoidKey: state.lastQuestionKey
  });

  state.currentQuestion = nextQuestion;
  state.lastQuestionKey = questionKey(nextQuestion);
  state.answerRevealed = false;
  state.answerDisplayMode = "correction";
  state.studentAnswerSnapshot = null;
  state.correctionSnapshot = null;
  state.studentBuildSnapshot = null;
  state.correctionBuildSnapshot = null;
  state.buildCorrectionAnimated = false;
  state.validationRevealRequested = false;
  state.lastEvaluation = null;

  if (state.renderedShowResponseBox !== state.showResponseBox) {
    renderShell(state);
  }
  if (state.transitionLayerEl) {
    state.transitionLayerEl.innerHTML = "";
  }

  resetVisualState(state);
  renderQuestion(state, settings);
  syncValidateState(state);
}

function renderQuestion(state, settings) {
  const question = state.currentQuestion;
  if (!question || !state.panelInnerEl || !state.numberEl || !state.panelShellEl) return;

  const isRepresentationToNumber = question.direction === REPRESENTATION_DIRECTIONS.REPRESENTATION_TO_NUMBER;
  const useInlineNumberResponse = shouldUseInlineNumberResponse(state, question);
  const usePassiveFreeBuild = shouldUsePassiveFreeBuildQuestion(state, question);

  state.questionWrap?.setAttribute("data-direction", question.direction);
  state.root?.classList.toggle("rd-root--question-representation-to-number", isRepresentationToNumber);
  state.root?.classList.toggle("rd-root--question-number-to-representation", !isRepresentationToNumber);
  state.root?.classList.toggle("rd-root--inline-number-response", useInlineNumberResponse);
  state.root?.classList.toggle("rd-root--stacked-number-response", useInlineNumberResponse);
  state.root?.classList.toggle("rd-root--passive-free-build", usePassiveFreeBuild);
  state.numberColumnEl?.classList.toggle("is-response-mode", useInlineNumberResponse);
  state.panelEl?.classList.toggle("rd-panel--builder", !isRepresentationToNumber && !usePassiveFreeBuild);
  if (state.arrowEl) {
    state.arrowEl.textContent = isRepresentationToNumber ? "←" : "→";
  }

  state.root?.classList.toggle("rd-root--display-ordered", settings.displayMode === DISPLAY_MODES.ORDERED);
  state.root?.classList.toggle("rd-root--display-random", settings.displayMode === DISPLAY_MODES.RANDOM);
  state.root?.setAttribute("data-theme-id", question.themeId || "");

  if (isRepresentationToNumber) {
    state.numberEl.textContent = useInlineNumberResponse ? "" : "?";
    state.numberEl.style.visibility = "visible";
    if (settings.displayMode === DISPLAY_MODES.RANDOM) {
      renderRandomRepresentationPanel(state, settings);
    } else {
      hideBuilderSidebar(state);
      replaceBuildItems(state, []);
      clearBuildItemElements(state);
      state.panelInnerEl.innerHTML = renderRepresentationSvg(question.themeId, question.value, {
        labelMode: settings.textBlocksLabelMode,
        displayBuild: question.displayBuild,
        allowLooseTens: settings.allowLooseTens
      });
    }
    state.panelShellEl.classList.remove("is-empty");
  } else {
    state.numberEl.textContent = String(question.value);
    state.numberEl.style.visibility = "visible";
    if (state.numberResponseShellEl) {
      state.numberResponseShellEl.innerHTML = "";
    }
    if (usePassiveFreeBuild) {
      renderPassiveFreeBuildPanel(state);
    } else {
      renderBuilderPanel(state, settings);
    }
    state.panelShellEl.classList.remove("is-empty");
  }

  renderResponseArea(state);
  updateInstructionDisplay(state);
}

function shouldUsePassiveFreeBuildQuestion(state, question = state.currentQuestion) {
  if (!question || question.direction !== REPRESENTATION_DIRECTIONS.NUMBER_TO_REPRESENTATION) {
    return false;
  }

  return getResponseUi(state?.latestContext) === "free";
}

function renderRandomRepresentationPanel(state, settings) {
  const question = state.currentQuestion;
  if (!state.panelInnerEl || !question) return;

  cancelRandomRepresentationPlacement(state);
  state.panelInnerEl.innerHTML = `
    <div class="rd-builder-workspace rd-builder-workspace--random-representation" id="rd_builder_workspace">
      <div class="rd-builder-items" id="rd_builder_items"></div>
    </div>
  `;

  state.builderWorkspaceEl = state.panelInnerEl.querySelector("#rd_builder_workspace");
  state.builderItemsLayerEl = state.panelInnerEl.querySelector("#rd_builder_items");
  state.builderCueEl = null;
  state.builderPaletteEl = null;
  state.builderOverflowEl = null;
  state.organizeBtnEl = null;
  hideBuilderSidebar(state);
  replaceBuildItems(state, []);
  clearBuildItemElements(state);
  scheduleRandomRepresentationPlacement(
    state,
    settings,
    question.displayBuild || question.expectedBuild || question.decomposition || {},
    questionKey(question)
  );
}

function animateOrderedRepresentationCorrection(state) {
  const question = state.currentQuestion;
  if (!question || !state.builderWorkspaceEl || !state.builderItemsLayerEl) return false;
  if (question.direction !== REPRESENTATION_DIRECTIONS.REPRESENTATION_TO_NUMBER) return false;

  const settings = normalizeSettings(state.latestContext?.settings);
  if (settings.displayMode !== DISPLAY_MODES.RANDOM) return false;

  // La correction conserve les assets déjà visibles et réutilise exactement
  // la chorégraphie habituelle du bouton « Organiser » : les pièces glissent
  // depuis leur position aléatoire vers leur rangement, au lieu d'être
  // remplacées brutalement par un nouveau SVG déjà ordonné.
  cancelRandomRepresentationPlacement(state);
  organizeBuildPieces(state, settings, { items: state.buildItems });
  return true;
}

function scheduleRandomRepresentationPlacement(state, settings, decomposition, expectedQuestionKey, attempt = 0) {
  const frame = scheduleFrame(() => {
    state.randomPlacementFrameId = null;
    state.randomPlacementUsesTimeout = false;

    if (!state.currentQuestion || questionKey(state.currentQuestion) !== expectedQuestionKey) return;
    if (!state.builderWorkspaceEl || !state.builderItemsLayerEl) return;

    if (!isElementMeasured(state.builderWorkspaceEl) && attempt < 8) {
      scheduleRandomRepresentationPlacement(state, settings, decomposition, expectedQuestionKey, attempt + 1);
      return;
    }

    replaceBuildItems(state, createBuildItemsFromDecomposition(state, decomposition, {
      sizeMode: "random-representation"
    }));
    renderBuildItems(state, settings);
  });

  state.randomPlacementFrameId = frame.id;
  state.randomPlacementUsesTimeout = frame.usesTimeout;
}

function scheduleFrame(callback) {
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    return { id: window.requestAnimationFrame(callback), usesTimeout: false };
  }
  if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
    return { id: window.setTimeout(callback, 16), usesTimeout: true };
  }
  callback();
  return { id: null, usesTimeout: false };
}

function cancelRandomRepresentationPlacement(state) {
  if (state.randomPlacementFrameId == null) return;
  if (typeof window !== "undefined") {
    if (state.randomPlacementUsesTimeout) {
      window.clearTimeout?.(state.randomPlacementFrameId);
    } else {
      window.cancelAnimationFrame?.(state.randomPlacementFrameId);
    }
  }
  state.randomPlacementFrameId = null;
  state.randomPlacementUsesTimeout = false;
}

function createBuildItemsFromDecomposition(state, decomposition, options = {}) {
  const items = [];
  const kinds = ["hundreds", "tens", "ones"];
  const sizeMode = normalizePieceSizeMode(options.sizeMode);
  kinds.forEach((kind) => {
    const count = Math.max(0, Number(decomposition?.[kind]) || 0);
    for (let index = 0; index < count; index += 1) {
      const size = getWorkspacePieceSize(state.currentQuestion?.themeId, kind, sizeMode);
      const position = state.builderWorkspaceEl
        ? findBuildPiecePlacement({ ...state, buildItems: items }, size, {
            inset: getPlacementInsetForSizeMode(sizeMode)
          })
        : { x: 0, y: 0 };
      items.push({
        id: `piece_${state.nextBuildItemId++}`,
        kind,
        sizeMode,
        zIndex: state.nextBuildZIndex++,
        x: position.x,
        y: position.y,
        status: "normal"
      });
    }
  });
  return shuffleItems(items);
}

function shuffleItems(items) {
  const copy = Array.isArray(items) ? [...items] : [];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function renderPassiveFreeBuildPanel(state) {
  hideNumberKeypad(state);
  const question = state.currentQuestion;
  if (!state.panelInnerEl || !question) return;

  state.panelInnerEl.innerHTML = `
    <div class="rd-builder-workspace rd-builder-workspace--passive" id="rd_builder_workspace">
      ${question.cueAsset ? `
        <div class="rd-builder-cue" id="rd_builder_cue">
          <img class="rd-builder-cue-asset" src="${escapeHtml(question.cueAsset)}" alt="${escapeHtml(question.themeLabel || question.themeId || "")}">
        </div>
      ` : ""}
    </div>
  `;

  state.builderWorkspaceEl = state.panelInnerEl.querySelector("#rd_builder_workspace");
  state.builderItemsLayerEl = null;
  state.builderCueEl = state.panelInnerEl.querySelector("#rd_builder_cue");
  state.builderPaletteEl = null;
  state.builderOverflowEl = null;
  state.organizeBtnEl = null;
  clearBuildItemElements(state);
  hideBuilderSidebar(state);
}

function renderBuilderPanel(state, settings) {
  const question = state.currentQuestion;
  if (!question || !state.panelInnerEl) return;

  const orderedBuild = isOrderedNumberToRepresentation(state, settings);
  hideNumberKeypad(state);

  state.panelInnerEl.innerHTML = `
    <div class="rd-builder-workspace${orderedBuild ? " rd-builder-workspace--ordered-build" : ""}" id="rd_builder_workspace">
      ${question.cueAsset ? `
        <div class="rd-builder-cue" id="rd_builder_cue">
          <img class="rd-builder-cue-asset" src="${escapeHtml(question.cueAsset)}" alt="${escapeHtml(question.themeLabel || question.themeId || "")}">
        </div>
      ` : ""}
      <div class="rd-builder-items" id="rd_builder_items"></div>
    </div>
  `;

  if (state.builderSidebarEl) {
    state.builderSidebarEl.hidden = false;
    state.builderSidebarEl.classList.remove("is-hidden", "rd-builder-sidebar--overflow");
    state.builderSidebarEl.style.width = "";
    state.builderSidebarEl.style.flexBasis = "";
    state.builderSidebarEl.innerHTML = `
      <div class="rd-builder-palette" id="rd_builder_palette">
        <div class="rd-builder-palette-items">${renderBuilderPalette(question.themeId, settings)}</div>
        ${orderedBuild ? "" : renderOrganizeButton()}
      </div>
    `;
  }

  state.builderWorkspaceEl = state.panelInnerEl.querySelector("#rd_builder_workspace");
  state.builderItemsLayerEl = state.panelInnerEl.querySelector("#rd_builder_items");
  state.builderCueEl = state.panelInnerEl.querySelector("#rd_builder_cue");
  state.builderPaletteEl = state.builderSidebarEl?.querySelector("#rd_builder_palette") || null;
  state.builderOverflowEl = state.builderSidebarEl?.querySelector("#rd_builder_overflow") || null;
  state.organizeBtnEl = state.builderSidebarEl?.querySelector("#rd_organize_btn") || null;
  clearBuildItemElements(state);

  state.builderSidebarEl?.classList.remove("rd-builder-sidebar--overflow");
  bindBuilderPalette(state, settings);
  renderBuildItems(state, settings);
  renderBuildOverflow(state, settings);
}

function hideBuilderSidebar(state) {
  if (!state.builderSidebarEl) return;

  state.builderSidebarEl.hidden = true;
  state.builderSidebarEl.classList.add("is-hidden");
  state.builderSidebarEl.classList.remove("rd-builder-sidebar--overflow");
  state.builderSidebarEl.innerHTML = "";
  state.builderSidebarEl.style.width = "";
  state.builderSidebarEl.style.flexBasis = "";
}

function clearBuilderSidebarContentForReview(state) {
  if (!state.builderSidebarEl) return;

  state.builderSidebarEl.hidden = false;
  state.builderSidebarEl.classList.remove("is-hidden", "rd-builder-sidebar--overflow");
  state.builderSidebarEl.style.width = "";
  state.builderSidebarEl.style.flexBasis = "";
  state.builderSidebarEl.innerHTML = "";
  state.builderPaletteEl = null;
  state.builderOverflowEl = null;
  state.organizeBtnEl = null;
}

function hideNumberKeypad(state) {
  if (!state.numberKeypadEl) return;

  state.numberKeypadEl.hidden = true;
  state.numberKeypadEl.classList.add("is-hidden");
  state.numberKeypadEl.innerHTML = "";
}

function renderOrganizeButton({ disabled = false } = {}) {
  return `
    <button
      class="btn secondary rd-organize-btn"
      id="rd_organize_btn"
      type="button"
      aria-label="Organiser"
      title="Organiser"
      ${disabled ? "disabled" : ""}
    >
      <span class="rd-organize-btn__icons" aria-hidden="true">
        <svg viewBox="0 -960 960 960" focusable="false"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h133v-133H200v133Zm213 0h134v-133H413v133Zm214 0h133v-133H627v133ZM200-413h133v-134H200v134Zm213 0h134v-134H413v134Zm214 0h133v-134H627v134ZM200-627h133v-133H200v133Zm213 0h134v-133H413v133Zm214 0h133v-133H627v133Z"/></svg>
        <svg viewBox="0 -960 960 960" focusable="false"><path d="M120-200v-80h720v80H120Zm0-160v-80h720v80H120Zm0-160v-80h720v80H120Zm0-160v-80h720v80H120Z"/></svg>
        <svg viewBox="0 -960 960 960" focusable="false"><path d="M360-160q-33 0-56.5-23.5T280-240q0-33 23.5-56.5T360-320q33 0 56.5 23.5T440-240q0 33-23.5 56.5T360-160Zm240 0q-33 0-56.5-23.5T520-240q0-33 23.5-56.5T600-320q33 0 56.5 23.5T680-240q0 33-23.5 56.5T600-160ZM360-400q-33 0-56.5-23.5T280-480q0-33 23.5-56.5T360-560q33 0 56.5 23.5T440-480q0 33-23.5 56.5T360-400Zm240 0q-33 0-56.5-23.5T520-480q0-33 23.5-56.5T600-560q33 0 56.5 23.5T680-480q0 33-23.5 56.5T600-400ZM360-640q-33 0-56.5-23.5T280-720q0-33 23.5-56.5T360-800q33 0 56.5 23.5T440-720q0 33-23.5 56.5T360-640Zm240 0q-33 0-56.5-23.5T520-720q0-33 23.5-56.5T600-800q33 0 56.5 23.5T680-720q0 33-23.5 56.5T600-640Z"/></svg>
      </span>
    </button>
  `;
}

function renderBuilderPalette(themeId, settings) {
  return getPaletteKinds(themeId, settings).map((kind) => {
    const size = getPalettePieceSize(themeId, kind);
    const { markup } = getCachedAssetMarkup(themeId, kind, { labelMode: settings.textBlocksLabelMode });
    return `
    <button class="rd-piece-btn rd-piece-btn--${kind}" type="button" data-kind="${kind}" aria-label="Ajouter ${escapeHtml(getPieceLabel(kind))}" style="width:${size.width}px;height:${size.height}px;">
      <span class="rd-piece-btn__svg">${markup}</span>
    </button>
  `;
  }).join("");
}

function bindBuilderPalette(state, settings) {
  if (!state.builderPaletteEl || !state.currentQuestion) return;

  state.builderPaletteEl.querySelectorAll(".rd-piece-btn").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.answerRevealed || state.builderAnimating) return;
      const kind = String(button.dataset.kind || "").trim();
      if (!kind) return;
      addBuildPiece(state, kind, settings, button);
    });
  });

  state.organizeBtnEl?.addEventListener("click", () => {
    if (state.answerRevealed || state.builderAnimating) return;
    organizeBuildPieces(state, settings);
  });
}

function renderResponseArea(state) {
  if (!state.currentQuestion) return;

  const useInlineNumberResponse = shouldUseInlineNumberResponse(state);

  if (useInlineNumberResponse) {
    renderInlineNumberResponseInput(state);
    bindNumericResponseEvents(state);
    syncValidateState(state);
    focusInput(state);
    return;
  }

  hideNumberKeypad(state);
  if (state.numberResponseShellEl) {
    state.numberResponseShellEl.innerHTML = "";
  }
  state.inputEl = null;
  bindValidateButton(state);
  syncValidateState(state);
}

function renderNumberKeypadSidebar(state, { hidden = false } = {}) {
  if (!state.numberKeypadEl || (!hidden && !shouldUseInlineNumberResponse(state))) return;

  hideBuilderSidebar(state);
  state.numberKeypadEl.hidden = false;
  state.numberKeypadEl.classList.remove("is-hidden");
  state.numberKeypadEl.innerHTML = renderNumericKeypad({
    hidden,
    rootClassName: "rd-number-keypad",
    buttonClassName: "rd-number-keypad-button",
    clearButtonClassName: "rd-number-keypad-button--clear",
    dataAttribute: "data-rd-number-key",
    ariaLabel: "Clavier numérique"
  });
}

function shouldUseInlineNumberResponse(state, question = state.currentQuestion) {
  return !!question
    && question.direction === REPRESENTATION_DIRECTIONS.REPRESENTATION_TO_NUMBER
    && state.showResponseBox === true
    && !!state.numberResponseShellEl;
}

function renderInlineNumberResponseInput(state) {
  if (!state.numberResponseShellEl) return;

  destroyAnswerControl(state);
  state.numberResponseShellEl.innerHTML = "";

  state.answerControl = createNumericAnswerControl({
    id: "rd_response_input",
    className: "rd-number-response-input",
    ariaLabel: "Réponse",
    value: "",
    maxLength: String(state.currentQuestion?.value ?? "").length,
    captureRoot: state.root,
    onInput: () => {
      if (state.answerRevealed || state.builderAnimating) return;
      syncValidateState(state);
    },
    onSubmit: () => {
      if (state.answerRevealed || state.builderAnimating) return;
      if (!canSubmitAnswer(state)) return;
      requestReveal(state);
    }
  });

  state.numberResponseShellEl.appendChild(state.answerControl.element);
  state.inputEl = state.answerControl.input;
  renderNumberKeypadSidebar(state);
}

function renderDisplayedNumericResponse(state) {
  if (!state.numberResponseShellEl || !state.currentQuestion) return;
  destroyAnswerControl(state);
  hideBuilderSidebar(state);
  renderNumberKeypadSidebar(state, { hidden: true });

  const evaluation = state.lastEvaluation ?? computeStoredNumericEvaluation(state);
  const isCorrect = evaluation.isCorrect === true;
  const showStudentAnswer = canToggleStudentNumericAnswerDisplay(state)
    && normalizeAnswerDisplayMode(state.answerDisplayMode) === "student";
  const showCorrectionFeedback = !isCorrect && !showStudentAnswer;
  const snapshot = showStudentAnswer ? state.studentAnswerSnapshot : state.correctionSnapshot;
  const feedbackClass = isCorrect
    ? "is-correct"
    : (showCorrectionFeedback ? "is-correction" : "is-incorrect");

  state.numberResponseShellEl.innerHTML = renderNumericAnswerDisplayMarkup(String(snapshot?.value ?? ""), {
    className: `rd-number-response-input rd-number-response-input--readonly ${feedbackClass}`,
    ariaLabel: showStudentAnswer ? "Réponse de l’élève" : "Correction"
  });

  state.inputEl = state.numberResponseShellEl.querySelector(".rd-number-response-input");
  applyNumberColumnFeedback(state, isCorrect ? "correct" : (showCorrectionFeedback ? "correction" : "incorrect"));
}

function applyNumberColumnFeedback(state, feedbackKind) {
  if (!state.numberColumnEl) return;
  state.numberColumnEl.classList.toggle("rd-number-column--correct", feedbackKind === "correct");
  state.numberColumnEl.classList.toggle("rd-number-column--incorrect", feedbackKind === "incorrect");
  state.numberColumnEl.classList.toggle("rd-number-column--correction", feedbackKind === "correction");
}

function clearNumberColumnFeedback(state) {
  state.numberColumnEl?.classList.remove("rd-number-column--correct", "rd-number-column--incorrect", "rd-number-column--correction");
}

function bindNumericResponseEvents(state) {
  if (!state.inputEl) return;

  state.responseAbortController?.abort?.();
  const abortController = new AbortController();
  state.responseAbortController = abortController;

  bindNumericKeypadEvents({
    root: state.numberKeypadEl,
    control: state.answerControl,
    signal: abortController.signal,
    dataAttribute: "data-rd-number-key"
  });

  bindValidateButton(state);
}

function bindValidateButton(state) {
  state.latestContext?.services?.notifyValidationStateChanged?.();
}

function addBuildPiece(state, kind, settings, sourceButton = null) {
  if (!state.builderWorkspaceEl || !state.currentQuestion || state.builderAnimating) return;

  if (!canAcceptNewBuildPiece(state, kind)) {
    triggerPieceLimitFeedback(state, sourceButton);
    return;
  }

  const safeSettings = settings || normalizeSettings(state.latestContext?.settings);
  const size = getWorkspacePieceSize(state.currentQuestion.themeId, kind);
  const position = findBuildPiecePlacement(state, size);
  const orderedBuild = isOrderedNumberToRepresentation(state, safeSettings);

  const item = appendBuildItem(state, {
    id: `piece_${state.nextBuildItemId++}`,
    kind,
    zIndex: state.nextBuildZIndex++,
    x: position.x,
    y: position.y,
    status: "normal"
  });

  renderBuildItems(state, safeSettings);
  renderBuildOverflow(state, safeSettings);
  syncValidateState(state);
  const promoted = maybePromoteBuildPieces(state, safeSettings, kind, sourceButton);

  if (orderedBuild && !state.builderAnimating && !promoted) {
    applyOrderedBuildLayout(state, safeSettings, item.id, { moveDurationMs: 170 });
  }
}

function renderBuildItems(state, settings) {
  if (!state.builderItemsLayerEl || !state.currentQuestion) return;

  const itemsToRender = state.correctionReveal
    ? state.buildItems.filter((item) => item.status !== "extra")
    : state.buildItems;
  const interactionMode = shouldRenderBuildItemsStatic(state, settings) ? "static" : "drag";
  const wantedIds = new Set(itemsToRender.map((item) => String(item.id || "")));

  state.buildItemElementsById.forEach((element, id) => {
    if (wantedIds.has(id)) return;
    element.remove();
    state.buildItemElementsById.delete(id);
  });

  itemsToRender.forEach((item) => {
    const button = ensureBuildItemElement(state, item, settings, interactionMode);
    state.builderItemsLayerEl.appendChild(button);
  });

  syncBuilderCueVisibility(state);
}

function ensureBuildItemElement(state, item, settings, interactionMode) {
  let element = getBuildItemElement(state, item.id);
  if (!element || element.dataset.interactionMode !== interactionMode) {
    const replacement = createBuildItemElement(state, item, settings, interactionMode);
    if (element?.parentElement) {
      element.parentElement.replaceChild(replacement, element);
    }
    state.buildItemElementsById.set(String(item.id || ""), replacement);
    element = replacement;
  } else {
    updateBuildItemElement(state, element, item, settings);
  }
  return element;
}

function createBuildItemElement(state, item, settings, interactionMode) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.id = String(item.id || "");
  button.dataset.interactionMode = interactionMode;
  updateBuildItemElement(state, button, item, settings);
  if (interactionMode === "static") {
    bindStaticBuildPieceRemoval(state, button, item.id);
  } else {
    bindBuildPiecePointer(state, button, item.id);
  }
  return button;
}

function updateBuildItemElement(state, button, item, settings) {
  const size = getBuildItemSize(state, item);
  const bounds = getPlacementBounds(state.builderWorkspaceEl, size, getPlacementInsetForSizeMode(item.sizeMode));
  const statusClass = item.status === "missing"
    ? " rd-build-piece--missing"
    : item.status === "extra" && (state.showExtraFeedback || item.reviewFeedbackVisible === true)
      ? " rd-build-piece--extra"
      : "";
  const className = `rd-build-piece rd-build-piece--${item.kind}${statusClass}`;
  const left = `${round(clamp(item.x, bounds.minX, bounds.maxX))}px`;
  const top = `${round(clamp(item.y, bounds.minY, bounds.maxY))}px`;
  const zIndex = String(Math.max(1, Number(item.zIndex) || 1));
  const width = `${size.width}px`;
  const height = `${size.height}px`;
  const { cacheKey, markup } = getCachedAssetMarkup(state.currentQuestion.themeId, item.kind, {
    labelMode: settings.textBlocksLabelMode
  });

  if (button.className !== className) button.className = className;
  if (button.style.width !== width) button.style.width = width;
  if (button.style.height !== height) button.style.height = height;
  if (button.style.left !== left) button.style.left = left;
  if (button.style.top !== top) button.style.top = top;
  if (button.style.zIndex !== zIndex) button.style.zIndex = zIndex;
  if (button.dataset.markupKey !== cacheKey) {
    button.innerHTML = markup;
    button.dataset.markupKey = cacheKey;
  }
}

function bindStaticBuildPieceRemoval(state, element, itemId) {
  element.addEventListener("click", () => {
    if (!canRemoveBuildPiece(state)) return;
    removeBuildPiece(state, itemId, normalizeSettings(state.latestContext?.settings));
  });
}

function bindBuildPiecePointer(state, element, itemId) {
  element.addEventListener("pointerdown", () => {
    if (state.answerRevealed || state.builderAnimating) return;
    bringBuildPieceToFront(state, itemId, element);
  }, { passive: true });

  bindFreeDrag(element, {
    surface: () => state.builderWorkspaceEl,
    threshold: DRAG_THRESHOLD_PX,
    dragClass: "is-dragging",
    disabled: () => state.answerRevealed || state.builderAnimating,
    zIndex: () => Math.max(1, Number(getBuildItemById(state, itemId)?.zIndex) || 1),
    onMove: ({ x, y }) => {
      const item = getBuildItemById(state, itemId);
      if (!item) return;
      item.x = x;
      item.y = y;
    },
    onEnd: ({ x, y }) => {
      const item = getBuildItemById(state, itemId);
      if (!item) return;
      item.x = x;
      item.y = y;
    },
    onClick: () => {
      if (canRemoveBuildPiece(state)) {
        removeBuildPiece(state, itemId, normalizeSettings(state.latestContext?.settings));
      }
    }
  });
}

function bringBuildPieceToFront(state, itemId, element = null) {
  const item = getBuildItemById(state, itemId);
  if (!item) return 1;
  const zIndex = state.nextBuildZIndex++;
  item.zIndex = zIndex;
  if (element) {
    element.style.zIndex = String(zIndex);
  }
  return zIndex;
}

function canRemoveBuildPiece(state) {
  return !state.answerRevealed
    && !state.builderAnimating
    && state.currentQuestion?.direction !== REPRESENTATION_DIRECTIONS.REPRESENTATION_TO_NUMBER;
}

function removeBuildPiece(state, itemId, settings) {
  replaceBuildItems(state, state.buildItems.filter((item) => item.id !== itemId));
  const safeSettings = settings || normalizeSettings(state.latestContext?.settings);
  renderBuildItems(state, safeSettings);
  renderBuildOverflow(state, safeSettings);
  syncValidateState(state);
}

function isOrderedNumberToRepresentation(state, settings = normalizeSettings(state.latestContext?.settings)) {
  return state.currentQuestion?.direction === REPRESENTATION_DIRECTIONS.NUMBER_TO_REPRESENTATION
    && normalizeSettings(settings).displayMode === DISPLAY_MODES.ORDERED;
}

function shouldRenderBuildItemsStatic(state, settings = normalizeSettings(state.latestContext?.settings)) {
  return isOrderedNumberToRepresentation(state, settings) || state.answerRevealed === true;
}

function getBuildItemById(state, itemId) {
  return state.buildItemsById.get(String(itemId || "")) || null;
}

function updateBuildViewport(state) {
  return;
}

function syncBuilderCueVisibility(state) {
  if (!state.builderCueEl) return;
  state.builderCueEl.classList.toggle("is-hidden", state.buildItems.length > 0);
}

function renderBuildOverflow(state, settings) {
  if (!state.builderSidebarEl) return;

  const extraItems = state.correctionReveal
    ? state.buildItems.filter((item) => item.status === "extra")
    : [];

  if (!extraItems.length) {
    if (state.answerRevealed && state.correctionReveal) {
      state.builderSidebarEl.hidden = true;
      state.builderSidebarEl.classList.add("is-hidden");
    }
    state.builderSidebarEl.classList.remove("rd-builder-sidebar--overflow");
    state.builderOverflowEl = null;
    return;
  }

  state.builderSidebarEl.hidden = false;
  state.builderSidebarEl.classList.remove("is-hidden");
  state.builderSidebarEl.classList.add("rd-builder-sidebar--overflow");
  state.builderSidebarEl.style.width = "";
  state.builderSidebarEl.style.flexBasis = "";
  state.builderSidebarEl.innerHTML = `
    <div class="rd-builder-overflow" id="rd_builder_overflow"></div>
  `;
  state.builderOverflowEl = state.builderSidebarEl.querySelector("#rd_builder_overflow");
  if (!state.builderOverflowEl) return;

  const themeId = state.currentQuestion?.themeId;
  getOverflowGroups(extraItems).forEach((group) => {
    state.builderOverflowEl.appendChild(createOverflowGroupElement(themeId, group.kind, group.count, settings));
  });
}

function getOverflowGroups(items) {
  return ["hundreds", "tens", "ones"].map((kind) => ({
    kind,
    count: items.filter((item) => item.kind === kind).length
  })).filter((group) => group.count > 0);
}

function createOverflowGroupElement(themeId, kind, count, settings, options = {}) {
  const size = getPalettePieceSize(themeId, kind);
  const targetOnly = options.targetOnly === true;
  const startHidden = options.startHidden === true;
  const groupEl = document.createElement("div");
  groupEl.className = `rd-overflow-group rd-overflow-group--${kind}${targetOnly ? " rd-overflow-group--target" : ""}${startHidden ? " is-empty" : ""}`;
  groupEl.dataset.overflowKind = kind;

  const pieceEl = document.createElement("div");
  pieceEl.className = targetOnly
    ? `rd-overflow-target rd-overflow-target--${kind}`
    : `rd-overflow-piece rd-overflow-piece--${kind}`;
  pieceEl.dataset.targetKind = kind;
  pieceEl.style.width = `${size.width}px`;
  pieceEl.style.height = `${size.height}px`;
  if (!targetOnly) {
    pieceEl.innerHTML = getCachedAssetMarkup(themeId, kind, {
      labelMode: settings?.textBlocksLabelMode
    }).markup;
  }
  groupEl.appendChild(pieceEl);

  if (!targetOnly) {
    const countEl = document.createElement("span");
    countEl.className = "rd-overflow-count";
    countEl.textContent = `× ${Math.max(0, Number(count) || 0)}`;
    groupEl.appendChild(countEl);
  }

  return groupEl;
}


function canAcceptNewBuildPiece(state, kind) {
  const themeId = state.currentQuestion?.themeId;
  if (!themeId) return false;
  const counts = countBuildPieces(state.buildItems.filter((item) => item.status !== "extra"));
  const simulated = {
    hundreds: counts.hundreds,
    tens: counts.tens,
    ones: counts.ones
  };
  simulated[kind] = (simulated[kind] || 0) + 1;
  return canNormalizeCountsAfterInsert(themeId, simulated);
}

function canNormalizeCountsAfterInsert(themeId, counts) {
  const safe = {
    hundreds: Math.max(0, Number(counts?.hundreds) || 0),
    tens: Math.max(0, Number(counts?.tens) || 0),
    ones: Math.max(0, Number(counts?.ones) || 0)
  };
  const queue = ["ones", "tens", "hundreds"];

  while (queue.length) {
    const kind = queue.shift();
    while ((safe[kind] || 0) >= 10) {
      const nextKind = getPromotedKind(themeId, kind);
      if (!nextKind) return false;
      safe[kind] -= 10;
      safe[nextKind] = (safe[nextKind] || 0) + 1;
      if ((safe[nextKind] || 0) >= 10 && !queue.includes(nextKind)) {
        queue.push(nextKind);
      }
    }
  }

  return safe.ones <= 9 && safe.tens <= 9 && safe.hundreds <= 9;
}

function getPromotedKind(themeId, kind) {
  if (kind === "ones") return "tens";
  if (kind === "tens" && (themeId === "picbille" || themeId === "blocs_bleus_base10" || themeId === "blocs_textuels")) return "hundreds";
  return null;
}

function maybePromoteBuildPieces(state, settings, preferredKind = "ones", sourceButton = null) {
  const themeId = state.currentQuestion?.themeId;
  if (!themeId || state.builderAnimating) return false;

  const counts = countBuildPieces(state.buildItems.filter((item) => item.status !== "extra"));
  const kindsToCheck = preferredKind === "tens" ? ["tens", "ones"] : ["ones", "tens"];
  const promotableKind = kindsToCheck.find((kind) => (counts[kind] || 0) >= 10 && getPromotedKind(themeId, kind));
  if (!promotableKind) return false;

  return runPromotionSequence(state, settings, promotableKind, sourceButton);
}

function runPromotionSequence(state, settings, kind, sourceButton = null) {
  const themeId = state.currentQuestion?.themeId;
  const nextKind = getPromotedKind(themeId, kind);
  if (!themeId || !nextKind) return false;

  const candidateItems = state.buildItems.filter((item) => item.kind === kind && item.status !== "extra").slice(0, 10);
  if (candidateItems.length < 10) return false;

  const nextCount = state.buildItems.filter((item) => item.kind === nextKind && item.status !== "extra").length;
  const currentCounts = countBuildPieces(state.buildItems.filter((item) => item.status !== "extra"));
  const simulatedAfterPromotion = {
    hundreds: currentCounts.hundreds,
    tens: currentCounts.tens,
    ones: currentCounts.ones
  };
  simulatedAfterPromotion[kind] = Math.max(0, (simulatedAfterPromotion[kind] || 0) - 10);
  simulatedAfterPromotion[nextKind] = (simulatedAfterPromotion[nextKind] || 0) + 1;

  if (nextCount >= 9 && !canNormalizeCountsAfterInsert(themeId, simulatedAfterPromotion)) {
    // Revenir à 9 du type courant si l’ajout vient de dépasser sans promotion possible.
    const overflow = state.buildItems.filter((item) => item.kind === kind && item.status !== "extra");
    const lastItem = overflow[overflow.length - 1];
    if (lastItem) {
      replaceBuildItems(state, state.buildItems.filter((item) => item.id !== lastItem.id));
      renderBuildItems(state, settings);
      renderBuildOverflow(state, settings);
      syncValidateState(state);
    }
    triggerPieceLimitFeedback(state, sourceButton);
    return false;
  }

  const fusionLayout = computeFusionLayout(state, themeId, kind, candidateItems);
  if (!fusionLayout) return false;

  state.builderAnimating = true;
  state.organizeBtnEl?.setAttribute("disabled", "disabled");
  const elementMap = new Map(
    [...(state.builderItemsLayerEl?.querySelectorAll?.(".rd-build-piece") || [])].map((el) => [String(el.dataset.id || ""), el])
  );

  candidateItems.forEach((item, index) => {
    const target = fusionLayout.targets[index];
    const el = elementMap.get(item.id);
    if (!target || !el) return;
    item.x = target.x;
    item.y = target.y;
    el.classList.add("is-organizing");
    el.style.left = `${round(target.x)}px`;
    el.style.top = `${round(target.y)}px`;
  });

  window.setTimeout(() => {
    replaceBuildItems(state, state.buildItems.filter((item) => !candidateItems.some((candidate) => candidate.id === item.id)));
    const promotedSize = getWorkspacePieceSize(themeId, nextKind);
    const promotedX = clamp(fusionLayout.promoted.x, 0, Math.max(0, state.builderWorkspaceEl.clientWidth - promotedSize.width));
    const promotedY = clamp(fusionLayout.promoted.y, 0, Math.max(0, state.builderWorkspaceEl.clientHeight - promotedSize.height));
    appendBuildItem(state, {
      id: `piece_${state.nextBuildItemId++}`,
      kind: nextKind,
      zIndex: state.nextBuildZIndex++,
      x: promotedX,
      y: promotedY,
      status: "normal"
    });

    renderBuildItems(state, settings);
    renderBuildOverflow(state, settings);
    syncValidateState(state);
    state.builderAnimating = false;
    state.organizeBtnEl?.removeAttribute("disabled");
    maybePromoteBuildPieces(state, settings, nextKind, sourceButton);
  }, 290);

  return true;
}

function computeFusionLayout(state, themeId, kind, items) {
  const workspace = state.builderWorkspaceEl;
  if (!workspace || !items?.length) return null;
  const size = getWorkspacePieceSize(themeId, kind);
  const nextKind = getPromotedKind(themeId, kind);
  const promotedSize = getWorkspacePieceSize(themeId, nextKind);
  const centers = items.map((item) => ({ x: item.x + size.width / 2, y: item.y + size.height / 2 }));
  const avgX = centers.reduce((sum, p) => sum + p.x, 0) / centers.length;
  const avgY = centers.reduce((sum, p) => sum + p.y, 0) / centers.length;

  let targets = [];
  if (themeId === "picbille" && kind === "ones") {
    targets = computePicbilleFusionTargets(workspace, size, avgX, avgY);
  } else if (themeId === "picbille" && kind === "tens") {
    targets = computePicbilleTensFusionTargets(workspace, size, avgX, avgY);
  } else if (themeId === "dede" && kind === "ones") {
    targets = computeDedeFusionTargets(workspace, size, avgX, avgY);
  } else if (themeId === "blocs_bleus_base10" && kind === "ones") {
    targets = computeBlueOnesFusionTargets(workspace, size, avgX, avgY);
  } else if (themeId === "blocs_bleus_base10" && kind === "tens") {
    targets = computeBlueTensFusionTargets(workspace, size, avgX, avgY);
  } else if (themeId === "blocs_textuels") {
    targets = computeStackFusionTargets(workspace, size, avgX, avgY, 10);
  } else {
    targets = computeStackFusionTargets(workspace, size, avgX, avgY, 10);
  }

  if (!targets.length) return null;
  const bounds = getTargetBounds(targets, size.width, size.height);
  return {
    targets,
    promoted: {
      x: bounds.centerX - promotedSize.width / 2,
      y: bounds.centerY - promotedSize.height / 2
    }
  };
}

function computePicbilleFusionTargets(workspace, size, avgX, avgY) {
  const gap = 10;
  const groupGap = 24;
  const totalWidth = size.width * 10 + gap * 8 + groupGap;
  const maxX = Math.max(0, workspace.clientWidth - totalWidth);
  const maxY = Math.max(0, workspace.clientHeight - size.height);
  let x = clamp(avgX - totalWidth / 2, 0, maxX);
  const y = clamp(avgY - size.height / 2, 0, maxY);
  const targets = [];
  for (let i = 0; i < 10; i += 1) {
    targets.push({ x, y });
    x += size.width;
    if (i < 9) x += i === 4 ? groupGap : gap;
  }
  return targets;
}

function computePicbilleTensFusionTargets(workspace, size, avgX, avgY) {
  const count = 10;
  const gap = Math.max(0, Math.min(8, (workspace.clientHeight - size.height * count) / Math.max(1, count - 1)));
  const totalHeight = size.height * count + gap * (count - 1);
  const x = clamp(avgX - size.width / 2, 0, Math.max(0, workspace.clientWidth - size.width));
  const startY = clamp(avgY - totalHeight / 2, 0, Math.max(0, workspace.clientHeight - totalHeight));
  return Array.from({ length: count }, (_, i) => ({
    x,
    y: startY + i * (size.height + gap)
  }));
}

function computeDedeFusionTargets(workspace, size, avgX, avgY) {
  const cols = 5;
  const itemGap = 8;
  const rowGap = 12;
  const totalWidth = cols * size.width + (cols - 1) * itemGap;
  const totalHeight = 2 * size.height + rowGap;
  const startX = clamp(avgX - totalWidth / 2, 0, Math.max(0, workspace.clientWidth - totalWidth));
  const startY = clamp(avgY - totalHeight / 2, 0, Math.max(0, workspace.clientHeight - totalHeight));
  const targets = [];
  for (let i = 0; i < 10; i += 1) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    targets.push({
      x: startX + col * (size.width + itemGap),
      y: startY + row * (size.height + rowGap)
    });
  }
  return targets;
}

function computeBlueOnesFusionTargets(workspace, size, avgX, avgY) {
  const totalWidth = size.width * 10;
  const startX = clamp(avgX - totalWidth / 2, 0, Math.max(0, workspace.clientWidth - totalWidth));
  const y = clamp(avgY - size.height / 2, 0, Math.max(0, workspace.clientHeight - size.height));
  return Array.from({ length: 10 }, (_, i) => ({ x: startX + i * size.width, y }));
}

function computeBlueTensFusionTargets(workspace, size, avgX, avgY) {
  const totalHeight = size.height * 10;
  const x = clamp(avgX - size.width / 2, 0, Math.max(0, workspace.clientWidth - size.width));
  const startY = clamp(avgY - totalHeight / 2, 0, Math.max(0, workspace.clientHeight - totalHeight));
  return Array.from({ length: 10 }, (_, i) => ({ x, y: startY + i * size.height }));
}

function computeStackFusionTargets(workspace, size, avgX, avgY, count) {
  const x = clamp(avgX - size.width / 2, 0, Math.max(0, workspace.clientWidth - size.width));
  const y = clamp(avgY - size.height / 2, 0, Math.max(0, workspace.clientHeight - size.height));
  return Array.from({ length: count }, () => ({ x, y }));
}

function getTargetBounds(targets, width, height) {
  const left = Math.min(...targets.map((target) => target.x));
  const top = Math.min(...targets.map((target) => target.y));
  const right = Math.max(...targets.map((target) => target.x + width));
  const bottom = Math.max(...targets.map((target) => target.y + height));
  return {
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2
  };
}

function triggerPieceLimitFeedback(state, button) {
  if (button) {
    button.classList.remove("is-rejecting");
    void button.offsetWidth;
    button.classList.add("is-rejecting");
    window.setTimeout(() => button.classList.remove("is-rejecting"), 260);
  }
  state.builderWorkspaceEl?.classList.remove("is-limit-flash");
  void state.builderWorkspaceEl?.offsetWidth;
  state.builderWorkspaceEl?.classList.add("is-limit-flash");
  window.setTimeout(() => state.builderWorkspaceEl?.classList.remove("is-limit-flash"), 260);
}


function findBuildPiecePlacement(state, size, options = {}) {
  const workspace = state.builderWorkspaceEl;
  if (!workspace) return { x: 0, y: 0 };

  const workspaceSize = getElementSize(workspace);
  const bounds = getPlacementBounds(workspace, size, Number(options.inset) || 0);
  const existingRects = state.buildItems.map((item) => {
    const itemSize = getBuildItemSize(state, item);
    return {
      x: Number(item.x) || 0,
      y: Number(item.y) || 0,
      width: itemSize.width,
      height: itemSize.height
    };
  });

  const tries = 32;
  let best = {
    x: clamp((workspaceSize.width - size.width) / 2, bounds.minX, bounds.maxX),
    y: clamp((workspaceSize.height - size.height) / 2, bounds.minY, bounds.maxY),
    score: Number.POSITIVE_INFINITY
  };

  const candidates = [];
  for (let i = 0; i < tries; i += 1) {
    candidates.push({
      x: bounds.minX + Math.random() * Math.max(0, bounds.maxX - bounds.minX),
      y: bounds.minY + Math.random() * Math.max(0, bounds.maxY - bounds.minY)
    });
  }
  candidates.push(best);

  for (const candidate of candidates) {
    const x = clamp(candidate.x, bounds.minX, bounds.maxX);
    const y = clamp(candidate.y, bounds.minY, bounds.maxY);
    const score = computePlacementCollisionScore({ x, y, width: size.width, height: size.height }, existingRects);

    if (score <= 0) {
      return { x, y };
    }

    if (score < best.score) {
      best = { x, y, score };
    }
  }

  return { x: best.x, y: best.y };
}

function getPlacementBounds(workspace, size, inset = 0) {
  const safeInset = Math.max(0, Number(inset) || 0);
  const { width, height } = getElementSize(workspace);
  const pieceWidth = Math.max(0, Number(size?.width) || 0);
  const pieceHeight = Math.max(0, Number(size?.height) || 0);
  const canInsetX = width >= pieceWidth + safeInset * 2;
  const canInsetY = height >= pieceHeight + safeInset * 2;
  const minX = canInsetX ? safeInset : 0;
  const minY = canInsetY ? safeInset : 0;

  return {
    minX,
    minY,
    maxX: Math.max(minX, width - pieceWidth - (canInsetX ? safeInset : 0)),
    maxY: Math.max(minY, height - pieceHeight - (canInsetY ? safeInset : 0))
  };
}

function getElementSize(element) {
  const rect = element?.getBoundingClientRect?.();
  return {
    width: Math.max(0, Number(element?.clientWidth) || Number(rect?.width) || 0),
    height: Math.max(0, Number(element?.clientHeight) || Number(rect?.height) || 0)
  };
}

function isElementMeasured(element) {
  const size = getElementSize(element);
  return size.width > 0 && size.height > 0;
}

function computePlacementCollisionScore(rect, existingRects) {
  let score = 0;
  for (const other of existingRects) {
    score += getExpandedIntersectionArea(rect, other, 10);
  }
  return score;
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
  if (overlapW <= 0 || overlapH <= 0) return 0;
  return overlapW * overlapH;
}

function organizeBuildPieces(state, settings, options = {}) {
  if (!state.builderWorkspaceEl || !state.currentQuestion) return;
  const sourceItems = Array.isArray(options.items) ? options.items : state.buildItems;
  if (!sourceItems.length) {
    options.onComplete?.();
    return;
  }

  clearOrganizeTimers(state);

  const assignments = Array.isArray(options.assignments)
    ? options.assignments
    : computeOrganizedAssignments(state, sourceItems, settings);
  if (!assignments.length) {
    options.onComplete?.();
    return;
  }

  const staggerMs = Number.isFinite(options.staggerMs) ? Number(options.staggerMs) : 130;
  const moveDurationMs = Number.isFinite(options.moveDurationMs) ? Number(options.moveDurationMs) : 320;

  state.builderAnimating = true;
  state.organizeBtnEl?.setAttribute("disabled", "disabled");

  const elements = state.buildItemElementsById;

  let animatedCount = 0;
  let maxDelay = 0;

  assignments.forEach((assignment, index) => {
    const item = getBuildItemById(state, assignment.id);
    const element = elements.get(assignment.id);
    if (!item || !element) return;

    const dx = Math.abs((Number(item.x) || 0) - assignment.x);
    const dy = Math.abs((Number(item.y) || 0) - assignment.y);

    if (dx <= ORGANIZE_SNAP_THRESHOLD_PX && dy <= ORGANIZE_SNAP_THRESHOLD_PX) {
      item.x = assignment.x;
      item.y = assignment.y;
      element.classList.remove("is-organizing");
      element.style.left = `${round(assignment.x)}px`;
      element.style.top = `${round(assignment.y)}px`;
      return;
    }

    animatedCount += 1;
    const delay = index * staggerMs;
    if (delay > maxDelay) maxDelay = delay;
    const timerId = window.setTimeout(() => {
      const liveItem = getBuildItemById(state, assignment.id);
      const liveElement = elements.get(assignment.id);
      if (!liveItem || !liveElement) return;

      liveItem.x = assignment.x;
      liveItem.y = assignment.y;
      liveElement.classList.add("is-organizing");
      liveElement.style.left = `${round(assignment.x)}px`;
      liveElement.style.top = `${round(assignment.y)}px`;
    }, delay);
    state.organizeTimers.push(timerId);
  });

  const totalDuration = animatedCount > 0
    ? Math.max(260, maxDelay + moveDurationMs)
    : 0;
  if (totalDuration <= 0) {
    state.builderAnimating = false;
    state.organizeBtnEl?.removeAttribute("disabled");
    state.buildItemElementsById.forEach((el) => {
      el.classList.remove("is-organizing");
    });
    options.onComplete?.();
    return;
  }

  const finishId = window.setTimeout(() => {
    state.builderAnimating = false;
    state.organizeBtnEl?.removeAttribute("disabled");
    state.buildItemElementsById.forEach((el) => {
      el.classList.remove("is-organizing");
    });
    options.onComplete?.();
  }, totalDuration);
  state.organizeTimers.push(finishId);
}


function organizeBuildPiecesForValidationReview(state, settings, assignments, onComplete) {
  if (!state.builderWorkspaceEl || !state.currentQuestion) {
    onComplete?.();
    return;
  }

  const safeAssignments = Array.isArray(assignments) ? assignments : [];
  if (!safeAssignments.length) {
    onComplete?.();
    return;
  }

  clearOrganizeTimers(state);
  state.builderAnimating = true;
  state.organizeBtnEl?.setAttribute("disabled", "disabled");

  const elements = state.buildItemElementsById;
  let cursorMs = 0;
  let latestMoveEndMs = 0;

  const schedule = (callback, delayMs) => {
    const timerId = window.setTimeout(callback, Math.max(0, delayMs));
    state.organizeTimers.push(timerId);
    return timerId;
  };

  safeAssignments.forEach((assignment) => {
    const item = getBuildItemById(state, assignment.id);
    const element = elements.get(String(assignment.id || ""));
    if (!item || !element) return;

    const dx = Math.abs((Number(item.x) || 0) - assignment.x);
    const dy = Math.abs((Number(item.y) || 0) - assignment.y);
    const needsMove = dx > ORGANIZE_SNAP_THRESHOLD_PX || dy > ORGANIZE_SNAP_THRESHOLD_PX;
    const startMs = cursorMs;
    const moveMs = needsMove ? BUILD_REVIEW_TIMING.organizeMoveMs : 0;

    if (needsMove) {
      schedule(() => {
        const liveItem = getBuildItemById(state, assignment.id);
        const liveElement = getBuildItemElement(state, assignment.id);
        if (!liveItem || !liveElement) return;
        liveItem.x = assignment.x;
        liveItem.y = assignment.y;
        liveElement.style.setProperty("--rd-organize-move-duration", `${BUILD_REVIEW_TIMING.organizeMoveMs}ms`);
        liveElement.classList.add("is-organizing");
        liveElement.style.left = `${round(assignment.x)}px`;
        liveElement.style.top = `${round(assignment.y)}px`;
      }, startMs);
      latestMoveEndMs = Math.max(latestMoveEndMs, startMs + moveMs);
    } else {
      item.x = assignment.x;
      item.y = assignment.y;
      element.style.left = `${round(assignment.x)}px`;
      element.style.top = `${round(assignment.y)}px`;
    }

    cursorMs += BUILD_REVIEW_TIMING.organizeStaggerMs;
  });

  // Complete the one-and-only spatial reorganization first. Only once every
  // asset is settled do we reveal the student's surplus assets, one by one.
  const organizationEndMs = Math.max(cursorMs, latestMoveEndMs);
  const extraAssignments = safeAssignments.filter((assignment) => {
    return getBuildItemById(state, assignment.id)?.status === "extra";
  });

  let pulseCursorMs = organizationEndMs;
  if (extraAssignments.length) {
    pulseCursorMs += BUILD_REVIEW_TIMING.extraArrivalPauseMs;

    extraAssignments.forEach((assignment) => {
      const pulseAtMs = pulseCursorMs;
      schedule(() => {
        const liveItem = getBuildItemById(state, assignment.id);
        const liveElement = getBuildItemElement(state, assignment.id);
        if (!liveItem || !liveElement) return;
        liveItem.reviewFeedbackVisible = true;
        updateBuildItemElement(state, liveElement, liveItem, settings);
        liveElement.style.setProperty("--rd-extra-pulse-duration", `${BUILD_REVIEW_TIMING.extraPulseMs}ms`);
        liveElement.classList.remove("is-review-pulsing");
        void liveElement.offsetWidth;
        liveElement.classList.add("is-review-pulsing");
      }, pulseAtMs);
      schedule(() => {
        getBuildItemElement(state, assignment.id)?.classList.remove("is-review-pulsing");
      }, pulseAtMs + BUILD_REVIEW_TIMING.extraPulseMs);

      pulseCursorMs += BUILD_REVIEW_TIMING.extraPulseMs
        + BUILD_REVIEW_TIMING.extraAfterPulsePauseMs;
    });
  }

  const totalDurationMs = Math.max(organizationEndMs, pulseCursorMs);
  const finish = () => {
    state.builderAnimating = false;
    state.organizeBtnEl?.removeAttribute("disabled");
    state.buildItemElementsById.forEach((element) => {
      element.classList.remove("is-organizing", "is-review-pulsing");
    });
    onComplete?.();
  };

  if (totalDurationMs <= 0) {
    finish();
    return;
  }

  schedule(finish, totalDurationMs);
}

function applyOrderedBuildLayout(state, settings, focusItemId = "", options = {}) {
  if (!state.builderWorkspaceEl || !state.currentQuestion) return;
  const assignments = computeOrganizedAssignments(state, state.buildItems, settings);
  if (!assignments.length) return;

  clearOrganizeTimers(state);

  const moveDurationMs = Number.isFinite(options.moveDurationMs) ? Number(options.moveDurationMs) : 170;
  const focusId = String(focusItemId || "");
  let movedCount = 0;

  state.builderAnimating = true;
  state.organizeBtnEl?.setAttribute("disabled", "disabled");

  assignments.forEach((assignment) => {
    const item = getBuildItemById(state, assignment.id);
    if (!item) return;
    const element = getBuildItemElement(state, assignment.id);
    if (!element) return;

    const dx = Math.abs((Number(item.x) || 0) - assignment.x);
    const dy = Math.abs((Number(item.y) || 0) - assignment.y);
    item.x = assignment.x;
    item.y = assignment.y;

    if (dx <= ORGANIZE_SNAP_THRESHOLD_PX && dy <= ORGANIZE_SNAP_THRESHOLD_PX) {
      element.classList.remove("is-organizing");
      element.style.left = `${round(assignment.x)}px`;
      element.style.top = `${round(assignment.y)}px`;
      return;
    }

    movedCount += 1;
    element.classList.add("is-organizing");
    if (focusId && focusId === String(assignment.id || "")) {
      element.style.zIndex = String(Math.max(1, Number(item.zIndex) || 1));
    }
    element.style.left = `${round(assignment.x)}px`;
    element.style.top = `${round(assignment.y)}px`;
  });

  if (!movedCount) {
    state.builderAnimating = false;
    state.organizeBtnEl?.removeAttribute("disabled");
    return;
  }

  const finishId = window.setTimeout(() => {
    state.builderAnimating = false;
    state.organizeBtnEl?.removeAttribute("disabled");
    state.buildItemElementsById.forEach((element) => {
      element.classList.remove("is-organizing");
    });
  }, Math.max(220, moveDurationMs));
  state.organizeTimers.push(finishId);
}

function computeOrganizedAssignments(state, sourceItems = state.buildItems, settings = normalizeSettings(state.latestContext?.settings)) {
  const workspace = state.builderWorkspaceEl;
  const themeId = state.currentQuestion?.themeId;
  if (!workspace || !themeId) return [];

  const counts = countBuildPieces(sourceItems);
  const sizeForKind = (kind) => {
    const representativeItem = sourceItems.find((item) => item.kind === kind);
    return getWorkspacePieceSize(themeId, kind, representativeItem?.sizeMode);
  };
  const sizes = {
    ones: sizeForKind("ones"),
    tens: sizeForKind("tens"),
    hundreds: sizeForKind("hundreds")
  };

  let slots = [];
  if (themeId === "picbille") {
    slots = computePicbilleBuildSlots(workspace, counts, sizes, {
      useLooseUnitsLayout: normalizeSettings(settings).allowLooseTens === true,
      tenGroupCounts: getPicbilleReviewTenGroupCounts(sourceItems)
    });
  } else if (themeId === "dede") {
    slots = computeDedeBuildSlots(workspace, counts, sizes);
  } else if (themeId === "blocs_textuels") {
    slots = computeTextBuildSlots(workspace, counts, sizes);
  } else if (themeId === "blocs_bleus_base10") {
    slots = computeBlueBuildSlots(workspace, counts, sizes, {
      useLooseUnitsLayout: normalizeSettings(settings).allowLooseTens === true
    });
  } else {
    slots = computeSectionedBuildSlots(workspace, counts, sizes, { sectionGap: 18, itemGap: 10, rowGap: 10, columns: 5 });
  }

  const itemsByKind = {
    hundreds: sourceItems.filter((item) => item.kind === "hundreds"),
    tens: sourceItems.filter((item) => item.kind === "tens"),
    ones: sourceItems.filter((item) => item.kind === "ones")
  };

  const assignments = [];
  ["hundreds", "tens", "ones"].forEach((kind) => {
    const itemList = itemsByKind[kind] || [];
    const slotList = slots.filter((slot) => slot.kind === kind);
    itemList.forEach((item, index) => {
      const slot = slotList[index];
      if (!slot) return;
      assignments.push({ id: item.id, x: slot.x, y: slot.y, kind });
    });
  });

  return assignments;
}

function getPicbilleReviewTenGroupCounts(items) {
  const source = Array.isArray(items) ? items : [];
  const existingCount = source.filter((item) => item.kind === "tens" && item.status !== "missing").length;
  const missingCount = source.filter((item) => item.kind === "tens" && item.status === "missing").length;
  return existingCount > 0 && missingCount > 0 ? [existingCount, missingCount] : null;
}

function computeSectionedBuildSlots(workspace, counts, sizes, options = {}) {
  const defaultSectionGap = Number(options.sectionGap) || 22;
  const defaultItemGap = Number(options.itemGap) || 14;
  const defaultRowGap = Number(options.rowGap) || 14;
  const defaultColumns = Math.max(1, Number(options.columns) || 5);
  const sections = Array.isArray(options.sections) && options.sections.length
    ? options.sections
    : [
        counts.hundreds > 0 ? { kind: "hundreds", count: counts.hundreds, size: sizes.hundreds } : null,
        counts.tens > 0 ? { kind: "tens", count: counts.tens, size: sizes.tens } : null,
        counts.ones > 0 ? { kind: "ones", count: counts.ones, size: sizes.ones } : null
      ].filter(Boolean);

  if (!sections.length) return [];

  const sectionMetrics = sections.map((section) => {
    const count = Math.max(0, Number(section.count) || 0);
    const size = section.size;
    const columns = Math.max(1, Number(section.columns) || defaultColumns);
    const itemGap = Number.isFinite(section.itemGap) ? Number(section.itemGap) : defaultItemGap;
    const rowGap = Number.isFinite(section.rowGap) ? Number(section.rowGap) : defaultRowGap;
    const groupBreakAfter = Number(section.groupBreakAfter) || 0;
    const groupExtraGap = Number(section.groupExtraGap) || 0;
    const rows = Math.max(1, Math.ceil(count / columns));
    let width = 0;
    if (count > 0) {
      if (groupBreakAfter > 0 && rows === 1) {
        width = count * size.width + Math.max(0, count - 1) * itemGap + (count > groupBreakAfter ? groupExtraGap : 0);
      } else {
        const perRow = Math.min(columns, count);
        width = perRow * size.width + Math.max(0, perRow - 1) * itemGap;
      }
    }
    const height = rows * size.height + Math.max(0, rows - 1) * rowGap;
    return {
      ...section,
      count,
      size,
      columns,
      itemGap,
      rowGap,
      groupBreakAfter,
      groupExtraGap,
      width,
      height,
      rows
    };
  });

  const maxWidth = Math.max(...sectionMetrics.map((section) => section.width || 0), 1);
  const totalHeight = sectionMetrics.reduce((sum, section) => sum + section.height, 0)
    + defaultSectionGap * Math.max(0, sectionMetrics.length - 1);
  const startX = Math.max(12, (workspace.clientWidth - maxWidth) / 2);
  let cursorY = Math.max(12, (workspace.clientHeight - totalHeight) / 2);
  const slots = [];

  sectionMetrics.forEach((section, sectionIndex) => {
    const sectionStartX = startX + Math.max(0, (maxWidth - section.width) / 2);
    for (let i = 0; i < section.count; i += 1) {
      const row = Math.floor(i / section.columns);
      const col = i % section.columns;
      let x = sectionStartX + col * (section.size.width + section.itemGap);
      if (section.groupBreakAfter > 0 && row === 0 && i >= section.groupBreakAfter) {
        x += section.groupExtraGap;
      }
      slots.push({
        kind: section.kind,
        x: clamp(x, 0, Math.max(0, workspace.clientWidth - section.size.width)),
        y: clamp(cursorY + row * (section.size.height + section.rowGap), 0, Math.max(0, workspace.clientHeight - section.size.height))
      });
    }
    cursorY += section.height + (sectionIndex < sectionMetrics.length - 1 ? defaultSectionGap : 0);
  });

  return slots;
}

const DX1 = 0.55;
const DX2 = 2.45;
const DX3 = 4.3;
const DX4 = 6.2;
const DXM = 1.5;

const DY_TOP = 0.12;
const DY_MID = 1.12;
const DY_BOT = 2.12;

const DEDE_UNIT_TEMPLATES = Object.freeze({
  1: [
    [DX1, DY_TOP]
  ],

  2: [
    [DX1, DY_TOP],
    [DX2, DY_TOP]
  ],

  3: [
    [DX1, DY_TOP],
    [DX2, DY_TOP],
    [DX1, DY_BOT]
  ],

  4: [
    [DX1, DY_TOP],
    [DX2, DY_TOP],
    [DX1, DY_BOT],
    [DX2, DY_BOT]
  ],

  5: [
    [DX1, DY_TOP],
    [DX2, DY_TOP],
    [DX1, DY_BOT],
    [DX2, DY_BOT],
    [DXM, DY_MID]
  ],

  6: [
    [DX1, DY_TOP],
    [DX2, DY_TOP],
    [DX1, DY_BOT],
    [DX2, DY_BOT],
    [DXM, DY_MID],
    [DX3, DY_TOP]
  ],

  7: [
    [DX1, DY_TOP],
    [DX2, DY_TOP],
    [DX1, DY_BOT],
    [DX2, DY_BOT],
    [DXM, DY_MID],
    [DX3, DY_TOP],
    [DX4, DY_TOP]
  ],

  8: [
    [DX1, DY_TOP],
    [DX2, DY_TOP],
    [DX1, DY_BOT],
    [DX2, DY_BOT],
    [DXM, DY_MID],
    [DX3, DY_TOP],
    [DX4, DY_TOP],
    [DX3, DY_BOT]
  ],

  9: [
    [DX1, DY_TOP],
    [DX2, DY_TOP],
    [DX1, DY_BOT],
    [DX2, DY_BOT],
    [DXM, DY_MID],
    [DX3, DY_TOP],
    [DX4, DY_TOP],
    [DX3, DY_BOT],
    [DX4, DY_BOT]
  ]
});

function computeDedeBuildSlots(workspace, counts, sizes) {
  const tensCount = Math.max(0, counts.tens || 0);
  const onesCount = Math.max(0, counts.ones || 0);
  const tenW = sizes.tens.width;
  const tenH = sizes.tens.height;
  const oneW = sizes.ones.width;
  const oneH = sizes.ones.height;
  const colGap = 18;
  const rowGap = 14;

  const tenRows = [];
  for (let i = 0; i < tensCount; i += 2) {
    tenRows.push([i, i + 1 < tensCount ? i + 1 : null]);
  }

  const template = DEDE_UNIT_TEMPLATES[Math.min(9, Math.max(0, onesCount))] || [];
  const templateWidthUnits = template.length ? Math.max(...template.map(([x]) => x)) + 1 : 0;
  const onesClusterWidth = template.length ? templateWidthUnits * oneW : 0;
  const onesClusterHeight = template.length ? (Math.max(...template.map(([, y]) => y), 0) + 1) * oneH : 0;

  const secondColumnNeeded = tensCount > 1 || (onesCount > 0 && tensCount % 2 === 1);
  const totalWidth = tenW + (secondColumnNeeded ? colGap + Math.max(tenW, onesClusterWidth) : 0);
  const tenRowsHeight = tenRows.length ? tenRows.length * tenH + Math.max(0, tenRows.length - 1) * rowGap : 0;
  const onesBelowLeft = onesCount > 0 && (tensCount === 0 || tensCount % 2 === 0);
  const onesBlockHeight = onesCount > 0 ? Math.max(oneH, onesClusterHeight) : 0;
  const totalHeight = onesBelowLeft
    ? tenRowsHeight + (tenRowsHeight > 0 ? rowGap : 0) + onesBlockHeight
    : Math.max(tenRowsHeight, onesBlockHeight);
  const startX = Math.max(12, (workspace.clientWidth - totalWidth) / 2);
  const startY = Math.max(12, (workspace.clientHeight - totalHeight) / 2);
  const leftColX = startX;
  const rightColX = startX + tenW + colGap;
  const slots = [];

  let cursorY = startY;
  tenRows.forEach((row) => {
    if (row[0] != null) {
      slots.push({ kind: "tens", x: leftColX, y: cursorY });
    }
    if (row[1] != null) {
      slots.push({ kind: "tens", x: rightColX, y: cursorY });
    }
    cursorY += tenH + rowGap;
  });

  if (onesCount > 0) {
    let onesStartY = startY;
    let onesStartX = leftColX;

    if (tensCount > 0) {
      if (tensCount % 2 === 1) {
        const lastRowIndex = tenRows.length - 1;
        onesStartY = startY + lastRowIndex * (tenH + rowGap) + Math.max(0, (tenH - onesClusterHeight) / 2);
        onesStartX = rightColX;
      } else {
        onesStartY = startY + tenRowsHeight + rowGap;
        onesStartX = leftColX;
      }
    }

    template.forEach(([rx, ry]) => {
      slots.push({
        kind: "ones",
        x: onesStartX + rx * oneW,
        y: onesStartY + ry * oneH
      });
    });
  }

  return slots;
}

function computeBlueBuildSlots(workspace, counts, sizes, options = {}) {
  const slots = [];
  const margin = 12;
  const sectionGap = 28;
  const hundredGap = 16;
  const hundredRowGap = 10;
  const tensGap = 10;
  const verticalGroupGap = 18;
  const onesGap = 10;
  const onesGroupGap = 18;
  const useLooseUnitsLayout = options.useLooseUnitsLayout === true;

  const hundredRows = getSectionRows(counts.hundreds, 5);
  const hundredWidth = Math.max(
    0,
    ...hundredRows.map((count) => count * sizes.hundreds.width + Math.max(0, count - 1) * hundredGap)
  );
  const hundredHeight = hundredRows.length
    ? hundredRows.length * sizes.hundreds.height + Math.max(0, hundredRows.length - 1) * hundredRowGap
    : 0;

  const tenGroupHeight = counts.tens > 0
    ? counts.tens * sizes.tens.height + Math.max(0, counts.tens - 1) * tensGap + (counts.tens > 5 ? verticalGroupGap : 0)
    : 0;
  const tenGroupWidth = counts.tens > 0 ? sizes.tens.width : 0;

  const onesWidth = counts.ones > 0
    ? (useLooseUnitsLayout ? 2 * sizes.ones.width + onesGap : sizes.ones.width)
    : 0;
  const onesHeight = counts.ones > 0
    ? (useLooseUnitsLayout ? 5 * sizes.ones.height + 4 * onesGap : computeVerticalItemsHeight(counts.ones, sizes.ones.height, onesGap, onesGroupGap))
    : 0;

  const sections = [
    hundredRows.length ? { kind: "hundreds", width: hundredWidth, height: hundredHeight } : null,
    counts.tens > 0 ? { kind: "tens", width: tenGroupWidth, height: tenGroupHeight } : null,
    counts.ones > 0 ? { kind: "ones", width: onesWidth, height: onesHeight } : null
  ].filter(Boolean);

  if (!sections.length) return slots;

  const totalWidth = sections.reduce((sum, section, index) => {
    return sum + section.width + (index > 0 ? sectionGap : 0);
  }, 0);
  const contentHeight = Math.max(1, ...sections.map((section) => section.height));
  const startX = Math.max(margin, (workspace.clientWidth - totalWidth) / 2);
  const startY = Math.max(margin, (workspace.clientHeight - contentHeight) / 2);
  let cursorX = startX;

  sections.forEach((section, sectionIndex) => {
    if (sectionIndex > 0) cursorX += sectionGap;
    const sectionX = cursorX;
    const sectionY = startY + contentHeight - section.height;

    if (section.kind === "hundreds") {
      let rowY = sectionY;
      hundredRows.forEach((count, rowIndex) => {
        const rowWidth = count * sizes.hundreds.width + Math.max(0, count - 1) * hundredGap;
        let rowX = blueHundredRowsCentered
          ? sectionX + Math.max(0, (section.width - rowWidth) / 2)
          : sectionX;
        for (let i = 0; i < count; i += 1) {
          slots.push({ kind: "hundreds", x: rowX, y: rowY });
          rowX += sizes.hundreds.width + hundredGap;
        }
        rowY += sizes.hundreds.height + (rowIndex < hundredRows.length - 1 ? hundredRowGap : 0);
      });
    } else if (section.kind === "tens") {
      let tenY = sectionY;
      const tenGroups = counts.tens > 5 ? [counts.tens - 5, 5] : [counts.tens];
      tenGroups.forEach((groupCount, groupIndex) => {
        if (groupIndex > 0) {
          tenY += tensGap + verticalGroupGap;
        }
        for (let i = 0; i < groupCount; i += 1) {
          slots.push({ kind: "tens", x: sectionX, y: tenY });
          tenY += sizes.tens.height;
          if (i < groupCount - 1) tenY += tensGap;
        }
      });
    } else if (section.kind === "ones") {
      const bottomY = sectionY + section.height;
      for (let i = 0; i < counts.ones; i += 1) {
        const column = useLooseUnitsLayout ? Math.floor(i / 5) : 0;
        const rowFromBottom = useLooseUnitsLayout ? i % 5 : i;
        slots.push({
          kind: "ones",
          x: sectionX + column * (sizes.ones.width + onesGap),
          y: bottomY - sizes.ones.height - (
            useLooseUnitsLayout
              ? rowFromBottom * (sizes.ones.height + onesGap)
              : getVerticalItemOffsetFromBottom(rowFromBottom, sizes.ones.height, onesGap, onesGroupGap)
          )
        });
      }
    }

    cursorX += section.width;
  });

  return slots;
}

function computeTextBuildSlots(workspace, counts, sizes) {
  const margin = 12;
  const itemGap = 10;
  const rowGap = 18;
  const groupGap = 22;
  const rows = [
    counts.hundreds > 0 ? { kind: "hundreds", count: counts.hundreds, size: sizes.hundreds } : null,
    counts.tens > 0 ? { kind: "tens", count: counts.tens, size: sizes.tens } : null,
    counts.ones > 0 ? { kind: "ones", count: counts.ones, size: sizes.ones } : null
  ].filter(Boolean);

  if (!rows.length) return [];

  const metrics = rows.map((row) => ({
    ...row,
    width: computeGroupedRowWidth(row.count, row.size.width, itemGap, 5, groupGap),
    height: row.size.height
  }));

  const contentWidth = Math.max(...metrics.map((row) => row.width), 1);
  const contentHeight = metrics.reduce((sum, row) => sum + row.height, 0) + Math.max(0, metrics.length - 1) * rowGap;
  const startX = Math.max(margin, (workspace.clientWidth - contentWidth) / 2);
  let cursorY = Math.max(margin, (workspace.clientHeight - contentHeight) / 2);
  const slots = [];

  metrics.forEach((row, rowIndex) => {
    let cursorX = startX;
    for (let index = 0; index < row.count; index += 1) {
      slots.push({
        kind: row.kind,
        x: clamp(cursorX, 0, Math.max(0, workspace.clientWidth - row.size.width)),
        y: clamp(cursorY, 0, Math.max(0, workspace.clientHeight - row.size.height))
      });
      cursorX += row.size.width;
      if (index < row.count - 1) {
        cursorX += itemGap;
        if ((index + 1) % 5 === 0) {
          cursorX += groupGap;
        }
      }
    }
    cursorY += row.height + (rowIndex < metrics.length - 1 ? rowGap : 0);
  });

  return slots;
}

function computeGroupedRowWidth(count, itemWidth, gap, groupEvery = 0, groupGap = 0) {
  const safeCount = Math.max(0, Number(count) || 0);
  if (!safeCount) return 0;
  let width = safeCount * itemWidth + Math.max(0, safeCount - 1) * gap;
  if (groupEvery > 0) {
    width += Math.floor((safeCount - 1) / groupEvery) * groupGap;
  }
  return width;
}

function getSectionRows(count, columns) {
  const rows = [];
  let remaining = Math.max(0, Number(count) || 0);
  while (remaining > 0) {
    const rowCount = Math.min(columns, remaining);
    rows.push(rowCount);
    remaining -= rowCount;
  }
  return rows;
}

function computeVerticalItemsHeight(count, itemHeight, gap, groupGap) {
  const safeCount = Math.max(0, Number(count) || 0);
  if (!safeCount) return 0;
  return itemHeight + getVerticalItemOffsetFromBottom(safeCount - 1, itemHeight, gap, groupGap);
}

function getVerticalItemOffsetFromBottom(index, itemHeight, gap, groupGap) {
  let offset = 0;
  for (let step = 0; step < index; step += 1) {
    offset += itemHeight;
    offset += step === 4 ? groupGap : gap;
  }
  return offset;
}

function computePicbilleBuildSlots(workspace, counts, sizes, options = {}) {
  const hundredsCount = Math.max(0, counts.hundreds || 0);
  const onesCount = Math.max(0, counts.ones || 0);
  const tensCount = Math.max(0, counts.tens || 0);

  const margin = 12;
  const sectionGap = 28;
  const hundredGap = 16;
  const hundredRowGap = 10;
  const barGap = 8;
  const bigGap = 22;
  const smallGap = 12;
  const unitGap = Math.max(2, (sizes.tens.width - sizes.ones.width * 10) / 10.35);
  const groupGap = unitGap * 2.35;

  const hundredRows = getPicbilleBuilderHundredRows(hundredsCount);
  const hundredWidth = Math.max(
    0,
    ...hundredRows.map((count) => count * sizes.hundreds.width + Math.max(0, count - 1) * hundredGap)
  );
  const hundredHeight = hundredRows.length
    ? hundredRows.length * sizes.hundreds.height + Math.max(0, hundredRows.length - 1) * hundredRowGap
    : 0;

  const requestedTenGroupCounts = Array.isArray(options.tenGroupCounts)
    ? options.tenGroupCounts.map((count) => Math.max(0, Number(count) || 0)).filter(Boolean)
    : null;
  const tenGroups = requestedTenGroupCounts?.length
    ? requestedTenGroupCounts.map((count, index) => ({
        count,
        gapAfter: index < requestedTenGroupCounts.length - 1 ? bigGap : 0
      }))
    : getPicbilleBuilderTenGroups(tensCount, onesCount, bigGap, smallGap);
  const tensWidth = tenGroups.length ? sizes.tens.width : 0;
  const tensHeight = tenGroups.length ? computeBuilderPicbilleStackHeight(tenGroups, sizes.tens.height, barGap) : 0;

  const onesLayout = getPicbilleBuilderVerticalOnesLayout(onesCount, sizes.ones, {
    unitGap,
    groupGap,
    useLooseUnitsLayout: options.useLooseUnitsLayout === true
  });

  const sections = [
    hundredRows.length ? { kind: "hundreds", width: hundredWidth, height: hundredHeight } : null,
    tenGroups.length ? { kind: "tens", width: tensWidth, height: tensHeight } : null,
    onesLayout.count ? { kind: "ones", width: onesLayout.width, height: onesLayout.height } : null
  ].filter(Boolean);

  if (!sections.length) return [];

  const totalWidth = sections.reduce((sum, section, index) => {
    return sum + section.width + (index > 0 ? sectionGap : 0);
  }, 0);
  const contentHeight = Math.max(1, ...sections.map((section) => section.height));
  const startX = Math.max(margin, (workspace.clientWidth - totalWidth) / 2);
  const startY = Math.max(margin, (workspace.clientHeight - contentHeight) / 2);
  const slots = [];
  let cursorX = startX;

  sections.forEach((section, sectionIndex) => {
    if (sectionIndex > 0) cursorX += sectionGap;

    const sectionX = cursorX;
    const sectionY = startY + contentHeight - section.height;

    if (section.kind === "hundreds") {
      appendPicbilleBuilderHundredSlots(slots, hundredRows, sizes.hundreds, sectionX, sectionY, hundredGap, hundredRowGap, section.width);
    } else if (section.kind === "tens") {
      appendPicbilleBuilderTenSlots(slots, tenGroups, sizes.tens, sectionX, sectionY, barGap);
    } else if (section.kind === "ones") {
      appendPicbilleBuilderOneSlots(slots, onesCount, sizes.ones, sectionX, sectionY, onesLayout);
    }

    cursorX += section.width;
  });

  return slots;
}

function appendPicbilleBuilderHundredSlots(slots, rows, size, sectionX, sectionY, itemGap, rowGap, sectionWidth) {
  let cursorY = sectionY;
  rows.forEach((count, rowIndex) => {
    const rowWidth = count * size.width + Math.max(0, count - 1) * itemGap;
    let cursorX = sectionX + Math.max(0, (sectionWidth - rowWidth) / 2);
    for (let i = 0; i < count; i += 1) {
      slots.push({ kind: "hundreds", x: cursorX, y: cursorY });
      cursorX += size.width + itemGap;
    }
    cursorY += size.height + (rowIndex < rows.length - 1 ? rowGap : 0);
  });
}

function appendPicbilleBuilderTenSlots(slots, groups, size, sectionX, sectionY, barGap) {
  let cursorBottom = sectionY + computeBuilderPicbilleStackHeight(groups, size.height, barGap);
  groups.forEach((group, groupIndex) => {
    const groupHeight = group.count * size.height + Math.max(0, group.count - 1) * barGap;
    let cursorY = cursorBottom - groupHeight;
    for (let i = 0; i < group.count; i += 1) {
      slots.push({ kind: "tens", x: sectionX, y: cursorY });
      cursorY += size.height;
      if (i < group.count - 1) cursorY += barGap;
    }
    cursorBottom -= groupHeight;
    if (groupIndex < groups.length - 1) cursorBottom -= group.gapAfter;
  });
}

function appendPicbilleBuilderOneSlots(slots, count, size, sectionX, sectionY, layout) {
  const bottomY = sectionY + layout.height;
  for (let index = 0; index < count; index += 1) {
    const column = layout.useLooseUnitsLayout ? Math.floor(index / 5) : 0;
    const rowFromBottom = layout.useLooseUnitsLayout ? index % 5 : index;
    const offsetY = layout.useLooseUnitsLayout
      ? rowFromBottom * (size.height + layout.unitGap)
      : getPicbilleBuilderVerticalUnitOffsetFromBottom(rowFromBottom, size.height, layout.unitGap, layout.groupGap);

    slots.push({
      kind: "ones",
      x: sectionX + column * (size.width + layout.unitGap),
      y: bottomY - size.height - offsetY
    });
  }
}

function getPicbilleBuilderVerticalOnesLayout(count, size, options = {}) {
  const safeCount = Math.max(0, Number(count) || 0);
  if (!safeCount) {
    return { count: 0, width: 0, height: 0, unitGap: 0, groupGap: 0, useLooseUnitsLayout: false };
  }

  const unitGap = Number(options.unitGap) || 0;
  const groupGap = Number(options.groupGap) || unitGap;
  const useLooseUnitsLayout = options.useLooseUnitsLayout === true;
  if (useLooseUnitsLayout) {
    return {
      count: safeCount,
      width: 2 * size.width + unitGap,
      height: 5 * size.height + 4 * unitGap,
      unitGap,
      groupGap,
      useLooseUnitsLayout
    };
  }

  return {
    count: safeCount,
    width: size.width,
    height: size.height + getPicbilleBuilderVerticalUnitOffsetFromBottom(safeCount - 1, size.height, unitGap, groupGap),
    unitGap,
    groupGap,
    useLooseUnitsLayout
  };
}

function getPicbilleBuilderVerticalUnitOffsetFromBottom(index, itemHeight, unitGap, groupGap) {
  let offset = 0;
  for (let step = 0; step < index; step += 1) {
    offset += itemHeight;
    offset += step === 4 ? groupGap : unitGap;
  }
  return offset;
}

function getPicbilleBuilderHundredRows(count) {
  const rows = [];
  let remaining = Math.max(0, Number(count) || 0);
  while (remaining > 0) {
    const rowCount = Math.min(5, remaining);
    rows.push(rowCount);
    remaining -= rowCount;
  }
  return rows;
}

function getPicbilleBuilderTenGroups(tensCount, onesCount, bigGap, smallGap) {
  if (tensCount <= 0) return [];
  if (tensCount <= 5) return [{ count: tensCount, gapAfter: 0 }];
  if (tensCount === 6) return [{ count: 5, gapAfter: bigGap }, { count: 1, gapAfter: 0 }];
  if (tensCount === 7) return [{ count: 5, gapAfter: bigGap }, { count: 1, gapAfter: smallGap }, { count: 1, gapAfter: 0 }];
  if (tensCount === 8 && onesCount === 0) return [{ count: 2, gapAfter: bigGap }, { count: 2, gapAfter: bigGap }, { count: 2, gapAfter: bigGap }, { count: 2, gapAfter: 0 }];
  if (tensCount === 8) return [{ count: 5, gapAfter: bigGap }, { count: 3, gapAfter: 0 }];
  if (tensCount === 9) return [{ count: 5, gapAfter: bigGap }, { count: 3, gapAfter: bigGap }, { count: 1, gapAfter: 0 }];
  return [{ count: 5, gapAfter: bigGap }, { count: Math.max(0, tensCount - 5), gapAfter: 0 }];
}

function computeBuilderPicbilleStackHeight(groups, tenH, barGap) {
  let total = 0;
  groups.forEach((group, index) => {
    total += group.count * tenH + Math.max(0, group.count - 1) * barGap;
    if (index < groups.length - 1) total += group.gapAfter || 0;
  });
  return total;
}

function clearOrganizeTimers(state) {
  (state.organizeTimers || []).forEach((timerId) => window.clearTimeout(timerId));
  state.organizeTimers = [];
  state.builderAnimating = false;
  state.organizeBtnEl?.removeAttribute("disabled");
}

function startPhaseMonitor(state) {
  stopPhaseMonitor(state);
  state.lastObservedPhaseKind = state.latestContext?.services?.getPhaseKind?.() || null;
  state.phaseMonitorId = window.setInterval(() => {
    const phaseKind = state.latestContext?.services?.getPhaseKind?.() || null;
    if (phaseKind === state.lastObservedPhaseKind) return;
    state.lastObservedPhaseKind = phaseKind;
    handlePhaseKindChange(state, phaseKind);
  }, 90);
}

function stopPhaseMonitor(state) {
  if (state.phaseMonitorId != null) {
    window.clearInterval(state.phaseMonitorId);
    state.phaseMonitorId = null;
  }
}

function handlePhaseKindChange(state, phaseKind) {
  if (phaseKind === "TRANSITION" || phaseKind === "BETWEEN_TOOLS" || phaseKind === "IDLE") {
    clearOverflowCorrectionArtifacts(state);
  }
}

function clearOverflowCorrectionArtifacts(state) {
  if (state.transitionLayerEl) state.transitionLayerEl.innerHTML = "";
  if (state.builderSidebarEl?.classList.contains("rd-builder-sidebar--overflow")) {
    state.builderSidebarEl.classList.remove("rd-builder-sidebar--overflow");
    state.builderSidebarEl.classList.add("is-hidden");
    state.builderSidebarEl.innerHTML = "";
    state.builderOverflowEl = null;
  }
}

function revealAnswer(state) {
  const question = state.currentQuestion;
  if (!question || !state.panelInnerEl || !state.numberEl) return;
  if (state.answerRevealed) return;

  const isRepresentationToNumber = question.direction === REPRESENTATION_DIRECTIONS.REPRESENTATION_TO_NUMBER;
  const validationRevealRequested = state.validationRevealRequested === true;
  state.validationRevealRequested = false;
  state.answerRevealed = true;
  let revealResult = null;

  if (isRepresentationToNumber) {
    state.studentAnswerSnapshot = captureStudentNumericAnswerSnapshot(state);
    state.correctionSnapshot = buildNumericCorrectionSnapshot(state);
    state.lastEvaluation = computeStoredNumericEvaluation(state);
    state.answerDisplayMode = "correction";

    if (shouldUseInlineNumberResponse(state, question)) {
      revealNumericFeedback(state);
    } else {
      state.numberEl.textContent = String(question.value);
      state.numberEl.style.visibility = "visible";
      revealNumericFeedback(state);
    }
  } else {
    revealResult = revealBuildFeedback(state, { validationReview: validationRevealRequested });
  }

  state.root?.classList.add("rd-root--revealed");
  syncValidateState(state);
  return revealResult;
}

function revealNumericFeedback(state) {
  if (!state.currentQuestion) return;

  const evaluation = state.lastEvaluation ?? computeStoredNumericEvaluation(state);
  const isCorrect = evaluation.isCorrect === true;
  state.panelEl?.classList.toggle("rd-panel--correct", isCorrect);
  state.panelEl?.classList.toggle("rd-panel--incorrect", !isCorrect);

  if (shouldUseInlineNumberResponse(state)) {
    renderDisplayedNumericResponse(state);
    state.inputEl?.setAttribute("aria-invalid", isCorrect ? "false" : "true");
  }

  // En mode aléatoire, la représentation reste désorganisée pendant les
  // 3 secondes de revue de la réponse élève. Elle ne se range qu'au moment où
  // la correction est réellement affichée. Une réponse juste est déjà sa
  // propre correction, donc le rangement peut être immédiat dans ce seul cas.
  if (!canToggleStudentNumericAnswerDisplay(state)) {
    animateOrderedRepresentationCorrection(state);
  }
}

function revealBuildFeedback(state, { validationReview = false } = {}) {
  if (shouldUsePassiveFreeBuildQuestion(state)) {
    revealPassiveFreeBuildCorrection(state);
    return;
  }

  const isCorrect = isBuildAnswerCorrect(state);
  state.lastEvaluation = { isCorrect };
  state.panelEl?.classList.toggle("rd-panel--correct", isCorrect);
  state.panelEl?.classList.toggle("rd-panel--incorrect", !isCorrect);
  state.panelEl?.classList.remove("rd-panel--corrected");

  const settings = normalizeSettings(state.latestContext?.settings);

  if (isCorrect) {
    state.answerDisplayMode = "correction";
    // La palette ne fait pas partie de la correction : on la masque avant
    // toute organisation forcée afin que l'animation ne se joue que dans
    // l'espace de représentation.
    hideBuilderSidebar(state);
    return new Promise((resolve) => {
      organizeBuildPieces(state, settings, {
        items: state.buildItems,
        onComplete: resolve
      });
    });
  }

  // Réponse fausse : une seule réorganisation est autorisée. Le gabarit de
  // rangement est l'union chiffre par chiffre de la cible et de la réponse
  // de l'élève (max des centaines, dizaines et unités). Les emplacements
  // nécessaires aux éléments manquants sont donc réservés dès maintenant.
  computeBuildCorrectionDiff(state);
  state.correctionReveal = false;
  state.showExtraFeedback = false;
  state.answerDisplayMode = "student";
  state.builderPaletteHiddenForReview = true;
  clearBuilderSidebarContentForReview(state);
  renderBuildItems(state, settings);

  return new Promise((resolve) => {
    organizeBuildPiecesForValidationReview(
      state,
      settings,
      buildStudentReviewAssignments(state, settings),
      () => {
        state.studentBuildSnapshot = captureBuildSnapshot(state.buildItems);
        state.correctionBuildSnapshot = buildCorrectionBuildSnapshot(
          state,
          settings,
          state.studentBuildSnapshot
        );
        state.buildCorrectionAnimated = false;
        renderBuildItems(state, settings);

        if (validationReview) {
          resolve();
          return;
        }

        void startBuildCorrectionAnimation(state, settings).then(resolve);
      }
    );
  });
}

function revealPassiveFreeBuildCorrection(state) {
  const question = state.currentQuestion;
  if (!question || !state.panelInnerEl) return;

  const settings = normalizeSettings(state.latestContext?.settings);
  state.panelEl?.classList.remove("rd-panel--correct", "rd-panel--incorrect");
  state.correctionReveal = true;
  state.panelInnerEl.innerHTML = renderRepresentationSvg(question.themeId, question.value, {
    labelMode: settings.textBlocksLabelMode,
    allowLooseTens: settings.allowLooseTens
  });
  hideBuilderSidebar(state);
}

function captureBuildSnapshot(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({ ...item }));
}

function buildCorrectionBuildSnapshot(state, settings, studentSnapshot) {
  const items = captureBuildSnapshot(studentSnapshot);
  const expected = state.currentQuestion?.expectedBuild || { hundreds: 0, tens: 0, ones: 0 };

  ["hundreds", "tens", "ones"].forEach((kind) => {
    const expectedCount = Math.max(0, Number(expected[kind]) || 0);
    const studentCount = items.filter((item) => item.kind === kind).length;
    for (let i = studentCount; i < expectedCount; i += 1) {
      items.push({
        id: `piece_${state.nextBuildItemId++}`,
        kind,
        zIndex: state.nextBuildZIndex++,
        x: 0,
        y: 0,
        status: "missing",
        reviewFeedbackVisible: false
      });
    }
  });

  // La correction utilise exactement le même gabarit-union que la vue élève :
  // max(chiffre cible, chiffre élève) pour chaque ordre. Aucun élément déjà
  // rangé ne doit donc changer de place lors du basculement vers la correction.
  const assignments = computeOrganizedAssignments(state, items, settings);
  const assignmentById = new Map(assignments.map((entry) => [String(entry.id || ""), entry]));
  items.forEach((item) => {
    const target = assignmentById.get(String(item.id || ""));
    if (!target) return;
    item.x = target.x;
    item.y = target.y;
  });

  return items;
}


function findCorrectionMissingPlacement(state, item, occupiedRects, target = null) {
  const workspace = state.builderWorkspaceEl;
  const size = getBuildItemSize(state, item);
  const bounds = getPlacementBounds(workspace, size, getPlacementInsetForSizeMode(item.sizeMode));
  const candidates = [];
  if (target) {
    candidates.push({
      x: clamp(Number(target.x) || 0, bounds.minX, bounds.maxX),
      y: clamp(Number(target.y) || 0, bounds.minY, bounds.maxY)
    });
  }

  const step = Math.max(18, Math.round(Math.min(size.width, size.height) / 2));
  for (let y = bounds.minY; y <= bounds.maxY; y += step) {
    for (let x = bounds.minX; x <= bounds.maxX; x += step) {
      candidates.push({ x, y });
    }
  }

  let best = candidates[0] || { x: bounds.minX, y: bounds.minY };
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const rect = { x: candidate.x, y: candidate.y, width: size.width, height: size.height };
    const score = occupiedRects.reduce(
      (sum, occupied) => sum + getExpandedIntersectionArea(rect, occupied, 10),
      0
    );
    if (score <= 0) return candidate;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function orderBuildItemsForCorrection(items) {
  const source = Array.isArray(items) ? items : [];
  return ["hundreds", "tens", "ones"].flatMap((kind) => {
    const sameKind = source.filter((item) => item.kind === kind);
    return [
      ...sameKind.filter((item) => item.status !== "missing"),
      ...sameKind.filter((item) => item.status === "missing")
    ];
  });
}

function computeBuildCorrectionDiff(state) {
  const expected = state.currentQuestion?.expectedBuild || { hundreds: 0, tens: 0, ones: 0 };
  const byKind = {
    hundreds: state.buildItems.filter((item) => item.kind === "hundreds"),
    tens: state.buildItems.filter((item) => item.kind === "tens"),
    ones: state.buildItems.filter((item) => item.kind === "ones")
  };

  ["hundreds", "tens", "ones"].forEach((kind) => {
    const expectedCount = Math.max(0, Number(expected[kind]) || 0);
    const items = byKind[kind];
    const validCount = Math.min(items.length, expectedCount);
    items.forEach((item, index) => {
      item.status = index < validCount ? "normal" : "extra";
      item.reviewFeedbackVisible = false;
    });
  });
}

function buildStudentReviewLayoutItems(state) {
  const expected = state.currentQuestion?.expectedBuild || { hundreds: 0, tens: 0, ones: 0 };
  const layoutItems = captureBuildSnapshot(state.buildItems);
  const studentCounts = countBuildPieces(layoutItems);

  ["hundreds", "tens", "ones"].forEach((kind) => {
    const targetCount = Math.max(0, Number(expected[kind]) || 0);
    const studentCount = Math.max(0, Number(studentCounts[kind]) || 0);
    const missingCount = Math.max(0, targetCount - studentCount);
    for (let i = 0; i < missingCount; i += 1) {
      layoutItems.push({
        id: `__review_reserved_${kind}_${i}`,
        kind,
        zIndex: 0,
        x: 0,
        y: 0,
        status: "missing"
      });
    }
  });

  return layoutItems;
}

function buildStudentReviewAssignments(state, settings) {
  const realIds = new Set(state.buildItems.map((item) => String(item.id || "")));
  const layoutItems = buildStudentReviewLayoutItems(state);
  return computeOrganizedAssignments(state, layoutItems, settings)
    .filter((assignment) => realIds.has(String(assignment.id || "")));
}


function startBuildCorrectionAnimation(state, settings) {
  const snapshot = captureBuildSnapshot(state.correctionBuildSnapshot);
  if (!snapshot.length) return Promise.resolve();

  const extraItems = orderBuildItemsForCorrection(
    snapshot.filter((item) => item.status === "extra")
  );

  clearOrganizeTimers(state);
  clearOverflowCorrectionArtifacts(state);
  state.answerDisplayMode = "correction";
  state.correctionReveal = false;
  state.builderPaletteHiddenForReview = true;
  state.builderAnimating = true;
  state.showExtraFeedback = true;
  renderBuildItems(state, settings);

  // Le panneau annonce d'abord la correction. Les assets, eux, ne changent
  // plus jamais de coordonnées après l'unique rangement de la vue élève.
  state.panelEl?.classList.remove("rd-panel--incorrect", "rd-panel--correct");
  state.panelEl?.classList.add("rd-panel--corrected");

  return new Promise((resolve) => {
    const begin = window.setTimeout(() => {
      void fadeExtraBuildPiecesSequentially(state, settings, extraItems)
        .then(() => waitBuildReviewTiming(state, BUILD_REVIEW_TIMING.beforeMissingMs))
        .then(() => {
          replaceBuildItems(state, captureBuildSnapshot(snapshot));
          state.correctionReveal = true;
          state.showExtraFeedback = true;
          renderBuildItems(state, settings);
          return revealMissingBuildPiecesSequentially(state);
        })
        .then(() => {
          state.builderAnimating = false;
          state.buildCorrectionAnimated = true;
          resolve();
        });
    }, BUILD_REVIEW_TIMING.correctionPanelPauseMs);
    state.organizeTimers.push(begin);
  });
}

function waitBuildReviewTiming(state, delayMs) {
  const safeDelay = Math.max(0, Number(delayMs) || 0);
  if (safeDelay <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timerId = window.setTimeout(() => {
      const index = state.organizeTimers.indexOf(timerId);
      if (index >= 0) state.organizeTimers.splice(index, 1);
      resolve();
    }, safeDelay);
    state.organizeTimers.push(timerId);
  });
}

function prepareOverflowProgress(state, settings, extraItems) {
  if (!state.builderSidebarEl) return;
  state.builderSidebarEl.hidden = false;
  state.builderSidebarEl.classList.remove("is-hidden");
  state.builderSidebarEl.classList.add("rd-builder-sidebar--overflow");
  state.builderSidebarEl.style.width = "";
  state.builderSidebarEl.style.flexBasis = "";
  state.builderSidebarEl.innerHTML = `<div class="rd-builder-overflow" id="rd_builder_overflow"></div>`;
  state.builderOverflowEl = state.builderSidebarEl.querySelector("#rd_builder_overflow");
  if (!state.builderOverflowEl) return;

  const themeId = state.currentQuestion?.themeId;
  getOverflowGroups(extraItems).forEach((group) => {
    state.builderOverflowEl.appendChild(createOverflowGroupElement(themeId, group.kind, 0, settings, {
      startHidden: true
    }));
  });
}

function incrementOverflowProgress(state, kind, count) {
  const group = state.builderOverflowEl?.querySelector?.(`[data-overflow-kind="${kind}"]`);
  if (!group) return;
  const countEl = group.querySelector(".rd-overflow-count");
  if (countEl) countEl.textContent = `× ${Math.max(1, Number(count) || 1)}`;
  group.classList.remove("is-empty", "is-arriving");
  group.style.setProperty("--rd-overflow-arrival-duration", `${BUILD_REVIEW_TIMING.overflowArrivalMs}ms`);
  void group.offsetWidth;
  group.classList.add("is-arriving");
  const timerId = window.setTimeout(() => {
    group.classList.remove("is-arriving");
  }, BUILD_REVIEW_TIMING.overflowArrivalMs);
  state.organizeTimers.push(timerId);
}

async function fadeExtraBuildPiecesSequentially(state, settings, extraItems) {
  if (!extraItems.length) return;

  prepareOverflowProgress(state, settings, extraItems);
  const overflowCounts = { hundreds: 0, tens: 0, ones: 0 };

  for (let index = 0; index < extraItems.length; index += 1) {
    const item = extraItems[index];
    const element = getBuildItemElement(state, item.id);
    if (element) {
      element.style.setProperty("--rd-extra-fade-duration", `${BUILD_REVIEW_TIMING.extraFadeMs}ms`);
      element.classList.add("is-correction-exit");
      await waitBuildReviewTiming(state, BUILD_REVIEW_TIMING.extraFadeMs);
      state.buildItemElementsById.delete(String(item.id || ""));
      element.remove();
    }

    overflowCounts[item.kind] = (overflowCounts[item.kind] || 0) + 1;
    incrementOverflowProgress(state, item.kind, overflowCounts[item.kind]);
    await waitBuildReviewTiming(state, BUILD_REVIEW_TIMING.overflowArrivalMs);

    if (index < extraItems.length - 1) {
      await waitBuildReviewTiming(state, BUILD_REVIEW_TIMING.betweenExtrasMs);
    }
  }
}

function revealMissingBuildPiecesSequentially(state) {
  const elementsById = new Map(
    [...(state.builderItemsLayerEl?.querySelectorAll?.(".rd-build-piece--missing") || [])]
      .map((element) => [String(element.dataset.id || ""), element])
  );
  const missingItems = orderBuildItemsForCorrection(
    state.buildItems.filter((item) => item.status === "missing")
  );
  // Les dizaines Picbille forment une pile : leur lecture et leur ajout se
  // font du bas vers le haut, contrairement aux emplacements calculés.
  const orderedMissingItems = missingItems.sort((a, b) => {
    if (a.kind !== "tens" || b.kind !== "tens") return 0;
    return (Number(b.y) || 0) - (Number(a.y) || 0);
  });
  const missingElements = orderedMissingItems
    .map((item) => elementsById.get(String(item.id || "")))
    .filter(Boolean);
  if (!missingElements.length) return Promise.resolve();

  missingElements.forEach((element) => {
    element.style.setProperty("--rd-missing-fade-duration", `${BUILD_REVIEW_TIMING.missingFadeMs}ms`);
    element.classList.add("rd-build-piece--correction-enter");
  });

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        let index = 0;
        const revealNext = () => {
          const element = missingElements[index];
          if (!element) {
            resolve();
            return;
          }

          element.classList.add("is-visible");
          const fadeTimer = window.setTimeout(() => {
            index += 1;
            if (index >= missingElements.length) {
              resolve();
              return;
            }
            const pauseTimer = window.setTimeout(revealNext, BUILD_REVIEW_TIMING.betweenMissingMs);
            state.organizeTimers.push(pauseTimer);
          }, BUILD_REVIEW_TIMING.missingFadeMs);
          state.organizeTimers.push(fadeTimer);
        };
        revealNext();
      });
    });
  });
}


function isBuildAnswerCorrect(state) {
  const expected = state.currentQuestion?.expectedBuild;
  if (!expected) return false;
  const counts = countBuildPieces(state.buildItems);
  return counts.hundreds === (expected.hundreds || 0)
    && counts.tens === (expected.tens || 0)
    && counts.ones === (expected.ones || 0);
}

function countBuildPieces(items) {
  return (Array.isArray(items) ? items : []).reduce((acc, item) => {
    if (item?.kind === "hundreds") acc.hundreds += 1;
    if (item?.kind === "tens") acc.tens += 1;
    if (item?.kind === "ones") acc.ones += 1;
    return acc;
  }, { hundreds: 0, tens: 0, ones: 0 });
}

function destroyAnswerControl(state) {
  state.responseAbortController?.abort?.();
  state.responseAbortController = null;
  state.answerControl?.destroy?.();
  state.answerControl = null;
}

function resetVisualState(state) {
  destroyAnswerControl(state);
  cancelRandomRepresentationPlacement(state);
  if (state.numberEl) {
    state.numberEl.textContent = "?";
    state.numberEl.style.visibility = "visible";
  }
  state.numberColumnEl?.classList.remove("is-response-mode");
  clearNumberColumnFeedback(state);
  state.root?.classList.remove("rd-root--inline-number-response");
  if (state.numberResponseShellEl) {
    state.numberResponseShellEl.innerHTML = "";
  }

  if (state.panelInnerEl) {
    state.panelInnerEl.innerHTML = "";
  }

  state.panelShellEl?.classList.add("is-empty");
  state.panelEl?.classList.remove("rd-panel--builder", "rd-panel--correct", "rd-panel--corrected", "rd-panel--incorrect");
  state.root?.classList.remove(
    "rd-root--revealed",
    "rd-root--question-number-to-representation",
    "rd-root--question-representation-to-number",
    "rd-root--stacked-number-response",
    "rd-root--passive-free-build"
  );
  state.questionWrap?.removeAttribute("data-direction");

  if (state.inputEl) {
    state.inputEl.value = "";
    state.inputEl.readOnly = false;
    state.inputEl.removeAttribute("aria-invalid");
    state.inputEl.classList.remove(
      "rd-number-response-input--correct",
      "rd-number-response-input--incorrect"
    );
  }


  if (state.builderSidebarEl) {
    state.builderSidebarEl.hidden = false;
    state.builderSidebarEl.classList.add("is-hidden");
    state.builderSidebarEl.classList.remove("rd-builder-sidebar--overflow");
    state.builderSidebarEl.innerHTML = "";
    state.builderSidebarEl.style.width = "";
    state.builderSidebarEl.style.flexBasis = "";
  }
  state.showExtraFeedback = false;
  state.builderPaletteHiddenForReview = false;
  if (state.numberKeypadEl) {
    state.numberKeypadEl.hidden = false;
    state.numberKeypadEl.classList.add("is-hidden");
    state.numberKeypadEl.innerHTML = "";
  }

  clearOrganizeTimers(state);
  if (state.transitionLayerEl) state.transitionLayerEl.innerHTML = "";
  replaceBuildItems(state, []);
  clearBuildItemElements(state);
  state.nextBuildItemId = 1;
  state.nextBuildZIndex = 1;
  state.buildDrag = null;
  state.correctionReveal = false;
  state.answerDisplayMode = "correction";
  state.studentAnswerSnapshot = null;
  state.correctionSnapshot = null;
  state.studentBuildSnapshot = null;
  state.correctionBuildSnapshot = null;
  state.buildCorrectionAnimated = false;
  state.validationRevealRequested = false;
  state.lastEvaluation = null;
}

function updateInstructionDisplay(state) {
  const text = resolveQuestionInstructionText(
    state.latestContext,
    state.currentQuestion?.instruction || ""
  );
  setToolInstructionText(state.instructionEl, text);
}

function getShellAnswerDisplayState(state) {
  if (canToggleStudentBuildAnswerDisplay(state)) {
    return {
      canToggle: true,
      mode: normalizeAnswerDisplayMode(state.answerDisplayMode),
      // La transition initiale est animée par le moteur de représentation lui-même
      // (surplus vers la bibliothèque + manquants en fondu).
      transitionTargets: []
    };
  }

  return {
    canToggle: canToggleStudentNumericAnswerDisplay(state),
    mode: canToggleStudentNumericAnswerDisplay(state)
      ? normalizeAnswerDisplayMode(state.answerDisplayMode)
      : "correction",
    transitionTargets: [state.numberResponseShellEl]
  };
}

function applyShellAnswerDisplayMode(state, mode) {
  const normalizedMode = normalizeAnswerDisplayMode(mode);

  if (canToggleStudentBuildAnswerDisplay(state)) {
    if (normalizedMode === "student") {
      applyStudentBuildSnapshot(state);
      return true;
    }

    if (state.buildCorrectionAnimated !== true) {
      return startBuildCorrectionAnimation(state, normalizeSettings(state.latestContext?.settings));
    }

    applyCorrectionBuildSnapshot(state);
    return true;
  }

  if (!shouldUseInlineNumberResponse(state) || !state.answerRevealed) {
    return false;
  }

  if (!canToggleStudentNumericAnswerDisplay(state)) {
    state.answerDisplayMode = "correction";
    animateOrderedRepresentationCorrection(state);
    renderDisplayedNumericResponse(state);
    return false;
  }

  state.answerDisplayMode = normalizedMode;
  if (normalizedMode === "correction") {
    animateOrderedRepresentationCorrection(state);
  }
  renderDisplayedNumericResponse(state);
  return true;
}

function canToggleStudentBuildAnswerDisplay(state) {
  return state.answerRevealed === true
    && state.currentQuestion?.direction === REPRESENTATION_DIRECTIONS.NUMBER_TO_REPRESENTATION
    && !shouldUsePassiveFreeBuildQuestion(state)
    && state.lastEvaluation?.isCorrect === false
    && Array.isArray(state.studentBuildSnapshot)
    && Array.isArray(state.correctionBuildSnapshot);
}

function restoreBuilderPaletteForReview(state, settings) {
  if (!state.builderSidebarEl || !state.currentQuestion) return;
  const orderedBuild = isOrderedNumberToRepresentation(state, settings);
  state.builderSidebarEl.hidden = false;
  state.builderSidebarEl.classList.remove("is-hidden", "rd-builder-sidebar--overflow");
  state.builderSidebarEl.style.width = "";
  state.builderSidebarEl.style.flexBasis = "";
  state.builderSidebarEl.innerHTML = `
    <div class="rd-builder-palette" id="rd_builder_palette">
      <div class="rd-builder-palette-items">${renderBuilderPalette(state.currentQuestion.themeId, settings)}</div>
      ${orderedBuild ? "" : renderOrganizeButton({ disabled: true })}
    </div>
  `;
  state.builderPaletteEl = state.builderSidebarEl.querySelector("#rd_builder_palette");
  state.builderOverflowEl = null;
  state.organizeBtnEl = state.builderSidebarEl.querySelector("#rd_organize_btn");
  state.builderPaletteEl?.querySelectorAll?.("button")?.forEach?.((button) => button.setAttribute("disabled", "disabled"));
}

function applyStudentBuildSnapshot(state) {
  const settings = normalizeSettings(state.latestContext?.settings);
  clearOrganizeTimers(state);
  clearOverflowCorrectionArtifacts(state);
  state.answerDisplayMode = "student";
  state.correctionReveal = false;
  state.showExtraFeedback = false;
  replaceBuildItems(state, captureBuildSnapshot(state.studentBuildSnapshot));
  renderBuildItems(state, settings);
  if (state.builderPaletteHiddenForReview) {
    clearBuilderSidebarContentForReview(state);
  } else {
    restoreBuilderPaletteForReview(state, settings);
  }
  state.panelEl?.classList.remove("rd-panel--correct", "rd-panel--corrected");
  state.panelEl?.classList.add("rd-panel--incorrect");
}

function applyCorrectionBuildSnapshot(state) {
  const settings = normalizeSettings(state.latestContext?.settings);
  clearOrganizeTimers(state);
  clearOverflowCorrectionArtifacts(state);
  state.answerDisplayMode = "correction";
  state.correctionReveal = true;
  state.showExtraFeedback = true;
  replaceBuildItems(state, captureBuildSnapshot(state.correctionBuildSnapshot));
  renderBuildItems(state, settings);
  renderBuildOverflow(state, settings);
  state.panelEl?.classList.remove("rd-panel--incorrect", "rd-panel--correct");
  state.panelEl?.classList.add("rd-panel--corrected");
}

function captureStudentNumericAnswerSnapshot(state) {
  return {
    value: String(state.inputEl?.value ?? "").trim()
  };
}

function buildNumericCorrectionSnapshot(state) {
  return {
    value: String(state.currentQuestion?.value ?? "")
  };
}

function computeStoredNumericEvaluation(state) {
  const submittedValue = String(state.studentAnswerSnapshot?.value ?? "").trim();
  const expectedValue = Number(state.currentQuestion?.value);

  return {
    isCorrect: /^\d+$/.test(submittedValue) && Number.parseInt(submittedValue, 10) === expectedValue
  };
}

function canToggleStudentNumericAnswerDisplay(state) {
  if (!shouldUseInlineNumberResponse(state) || !state.answerRevealed) {
    return false;
  }

  const studentValue = String(state.studentAnswerSnapshot?.value ?? "").trim();
  const correctionValue = String(state.correctionSnapshot?.value ?? "").trim();
  if (!studentValue) {
    return false;
  }

  return studentValue !== correctionValue;
}

function isCurrentAnswerCorrect(state) {
  if (!state.currentQuestion) return false;

  if (state.currentQuestion.direction === REPRESENTATION_DIRECTIONS.REPRESENTATION_TO_NUMBER) {
    const submittedValue = String(state.inputEl?.value ?? "").trim();
    return /^\d+$/.test(submittedValue) && Number.parseInt(submittedValue, 10) === state.currentQuestion.value;
  }

  return isBuildAnswerCorrect(state);
}

function requestReveal(state) {
  const wasCorrect = isCurrentAnswerCorrect(state);
  const needsOrganizedBuildReview = wasCorrect === false
    && state.currentQuestion?.direction === REPRESENTATION_DIRECTIONS.NUMBER_TO_REPRESENTATION
    && !shouldUsePassiveFreeBuildQuestion(state);

  state.validationRevealRequested = true;
  const accepted = state.latestContext?.services?.requestAnswerPhase?.({
    manual: false,
    showAnswerNow: true,
    wasCorrect,
    validationReviewDelayAfterPreparation: needsOrganizedBuildReview,
    validationReviewDelayMs: needsOrganizedBuildReview
      ? BUILD_REVIEW_TIMING.studentReviewHoldMs
      : undefined
  });
  if (accepted === false) {
    state.validationRevealRequested = false;
  }
}

function syncValidateState(state) {
  state.latestContext?.services?.notifyValidationStateChanged?.();
}

function canSubmitAnswer(state) {
  if (!state.currentQuestion) return false;

  if (state.currentQuestion.direction === REPRESENTATION_DIRECTIONS.REPRESENTATION_TO_NUMBER) {
    return /^\d+$/.test(String(state.inputEl?.value ?? "").trim());
  }

  return state.buildItems.length > 0;
}

function focusInput(state) {
  if (!state.inputEl) return;
  queueMicrotask(() => {
    try {
      state.inputEl.focus({ preventScroll: true });
      state.inputEl.select?.();
    } catch {
      state.inputEl.focus?.();
    }
  });
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
  const safeValue = String(value ?? "").trim().toLowerCase();
  if (safeValue === "boxed" || safeValue === "free") return safeValue;
  return "";
}



function normalizeAnswerDisplayMode(value) {
  return String(value || "").trim().toLowerCase() === "student" ? "student" : "correction";
}

function getPaletteKinds(themeId, settings = null) {
  if (themeId === "picbille" || themeId === "blocs_bleus_base10" || themeId === "blocs_textuels") {
    const max = Number(settings?.max ?? 0) || 0;
    return max >= 100 ? ["hundreds", "tens", "ones"] : ["tens", "ones"];
  }
  if (themeId === "dede") {
    return ["tens", "ones"];
  }
  return ["hundreds", "tens", "ones"];
}

function getBuildItemSize(state, item) {
  return getWorkspacePieceSize(
    state.currentQuestion?.themeId,
    item?.kind,
    item?.sizeMode
  );
}

function getWorkspacePieceSize(themeId, kind, sizeMode = "") {
  const sizeCatalog = normalizePieceSizeMode(sizeMode) === "random-representation"
    ? RANDOM_REPRESENTATION_PIECE_SIZES
    : BUILD_PIECE_SIZES;
  const themeMap = sizeCatalog[themeId] || BUILD_PIECE_SIZES[themeId] || BUILD_PIECE_SIZES.blocs_bleus_base10;
  return themeMap[kind] || BUILD_PIECE_SIZES.blocs_bleus_base10[kind] || { width: 48, height: 48 };
}

function normalizePieceSizeMode(value) {
  return String(value || "").trim() === "random-representation" ? "random-representation" : "";
}

function getPlacementInsetForSizeMode(sizeMode) {
  return normalizePieceSizeMode(sizeMode) === "random-representation"
    ? RANDOM_REPRESENTATION_PLACEMENT_INSET
    : 0;
}

function getPalettePieceSize(themeId, kind) {
  const themeMap = PALETTE_PIECE_SIZES[themeId] || PALETTE_PIECE_SIZES.blocs_bleus_base10;
  return themeMap[kind] || PALETTE_PIECE_SIZES.blocs_bleus_base10[kind] || { width: 48, height: 48 };
}

function getPieceLabel(kind) {
  if (kind === "hundreds") return "une centaine";
  if (kind === "tens") return "une dizaine";
  return "une unité";
}

function teardownState(state, container) {
  stopPhaseMonitor(state);
  cancelRandomRepresentationPlacement(state);
  destroyAnswerControl(state);
  if (container) {
    container.innerHTML = "";
  }

  state.container = null;
  state.latestContext = {};
  state.root = null;
  state.instructionEl = null;
  state.questionWrap = null;
  state.numberColumnEl = null;
  state.numberEl = null;
  state.numberResponseShellEl = null;
  state.panelShellEl = null;
  state.panelEl = null;
  state.panelInnerEl = null;
  state.renderedShowResponseBox = null;
  state.inputEl = null;
  state.validateBtn = null;
  state.currentQuestion = null;
  state.answerRevealed = false;
  state.answerDisplayMode = "correction";
  state.studentAnswerSnapshot = null;
  state.correctionSnapshot = null;
  state.studentBuildSnapshot = null;
  state.correctionBuildSnapshot = null;
  state.buildCorrectionAnimated = false;
  state.validationRevealRequested = false;
  state.lastEvaluation = null;
  state.builderWorkspaceEl = null;
  state.builderItemsLayerEl = null;
  state.builderCueEl = null;
  state.builderPaletteEl = null;
  state.organizeBtnEl = null;
  state.randomPlacementFrameId = null;
  state.randomPlacementUsesTimeout = false;
  state.phaseMonitorId = null;
  state.lastObservedPhaseKind = null;
  state.builderSidebarEl = null;
  state.numberKeypadEl = null;
  replaceBuildItems(state, []);
  clearBuildItemElements(state);
  state.nextBuildZIndex = 1;
  state.buildDrag = null;
}

function injectStyles() {
  const href = activityCssUrl;
  if (injectedStyleUrls.has(href)) return;
  injectedStyleUrls.add(href);
  ensureToolInstructionStyles();

  if (typeof document === "undefined") return;
  if (document.querySelector(`link[data-rd-activity-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.rdActivityStyle = href;
  document.head.appendChild(link);
}

function round(value) {
  return Number(value).toFixed(3).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


  return createActivity;
}
