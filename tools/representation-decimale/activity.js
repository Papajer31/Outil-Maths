import {
  normalizeSettings,
  pickQuestion,
  questionKey,
  renderRepresentationSvg,
  renderRepresentationPieceSvg,
  REPRESENTATION_DIRECTIONS
} from "./model.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveQuestionInstructionText,
  setToolInstructionText
} from "../../shared/tool-instruction.js";

let stylesInjected = false;

const DRAG_THRESHOLD_PX = 8;
const ORGANIZE_SNAP_THRESHOLD_PX = 4;

const BUILD_PIECE_SIZES = Object.freeze({
  picbille: {
    ones: { width: 30, height: 30 },
    tens: { width: 395, height: 34 }
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

const PALETTE_PIECE_SIZES = Object.freeze({
  picbille: {
    ones: { width: 30, height: 30 },
    tens: { width: 395, height: 34 }
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

export function createActivity(initialContext = {}) {
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
    renderedShowResponseBox: null,
    inputEl: null,
    validateBtn: null,
    currentQuestion: null,
    lastQuestionKey: null,
    answerRevealed: false,
    activityMode: normalizeActivityMode(initialContext?.activityMode),
    projectionResponseUi: normalizeProjectionResponseUi(initialContext?.projectionResponseUi),
    showResponseBox: shouldShowResponseBox(initialContext),
    builderWorkspaceEl: null,
    builderItemsLayerEl: null,
    builderCueEl: null,
    builderPaletteEl: null,
    builderOverflowEl: null,
    transitionLayerEl: null,
    buildItems: [],
    nextBuildItemId: 1,
    buildDrag: null,
    organizeBtnEl: null,
    organizeTimers: [],
    builderAnimating: false,
    correctionReveal: false,
    phaseMonitorId: null,
    lastObservedPhaseKind: null,
    answerDisplayMode: "correction",
    studentAnswerSnapshot: null,
    correctionSnapshot: null,
    lastEvaluation: null
  };
}

function syncRuntimeState(state, context = state.latestContext) {
  state.activityMode = normalizeActivityMode(context?.activityMode);
  state.projectionResponseUi = normalizeProjectionResponseUi(context?.projectionResponseUi);
  state.showResponseBox = shouldShowResponseBox(context);
}

function renderShell(state) {
  const container = state.container;
  if (!container) return;

  syncRuntimeState(state);

  container.innerHTML = `
    <div class="rd-root${state.showResponseBox ? " rd-root--boxed" : " rd-root--free"}">
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
  state.transitionLayerEl = container.querySelector("#rd_panel_transition_layer");
  state.inputEl = null;
  state.validateBtn = null;
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
  state.root?.classList.toggle("rd-root--passive-free-build", usePassiveFreeBuild);
  state.numberColumnEl?.classList.toggle("is-response-mode", useInlineNumberResponse);
  state.panelEl?.classList.toggle("rd-panel--builder", !isRepresentationToNumber && !usePassiveFreeBuild);
  if (state.arrowEl) {
    state.arrowEl.textContent = isRepresentationToNumber ? "←" : "→";
  }

  if (isRepresentationToNumber) {
    state.numberEl.textContent = useInlineNumberResponse ? "" : "?";
    state.numberEl.style.visibility = "visible";
    state.panelInnerEl.innerHTML = renderRepresentationSvg(question.themeId, question.value, {
      labelMode: settings.textBlocksLabelMode
    });
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

  if (state.activityMode === "group") {
    return true;
  }

  return String(state.latestContext?.runMode || state.latestContext?.sessionMode || "").trim() === "projected-teacher"
    && normalizeProjectionResponseUi(state.projectionResponseUi) === "free";
}

function renderPassiveFreeBuildPanel(state) {
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
  hideBuilderSidebar(state);
}

function renderBuilderPanel(state, settings) {
  const question = state.currentQuestion;
  if (!question || !state.panelInnerEl) return;

  state.panelInnerEl.innerHTML = `
    <div class="rd-builder-workspace" id="rd_builder_workspace">
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
        <button class="btn secondary rd-organize-btn" id="rd_organize_btn" type="button">Organiser</button>
      </div>
    `;
  }

  state.builderWorkspaceEl = state.panelInnerEl.querySelector("#rd_builder_workspace");
  state.builderItemsLayerEl = state.panelInnerEl.querySelector("#rd_builder_items");
  state.builderCueEl = state.panelInnerEl.querySelector("#rd_builder_cue");
  state.builderPaletteEl = state.builderSidebarEl?.querySelector("#rd_builder_palette") || null;
  state.builderOverflowEl = state.builderSidebarEl?.querySelector("#rd_builder_overflow") || null;
  state.organizeBtnEl = state.builderSidebarEl?.querySelector("#rd_organize_btn") || null;

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

function renderBuilderPalette(themeId, settings) {
  return getPaletteKinds(themeId).map((kind) => {
    const size = getPalettePieceSize(themeId, kind);
    return `
    <button class="rd-piece-btn rd-piece-btn--${kind}" type="button" data-kind="${kind}" aria-label="Ajouter ${escapeHtml(getPieceLabel(kind))}" style="width:${size.width}px;height:${size.height}px;">
      <span class="rd-piece-btn__svg">${renderRepresentationPieceSvg(themeId, kind, { labelMode: settings.textBlocksLabelMode })}</span>
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

  if (state.numberResponseShellEl) {
    state.numberResponseShellEl.innerHTML = "";
  }
  state.inputEl = null;
  bindValidateButton(state);
  syncValidateState(state);
}

function shouldUseInlineNumberResponse(state, question = state.currentQuestion) {
  return !!question
    && question.direction === REPRESENTATION_DIRECTIONS.REPRESENTATION_TO_NUMBER
    && state.showResponseBox === true
    && !!state.numberResponseShellEl;
}

function renderInlineNumberResponseInput(state) {
  if (!state.numberResponseShellEl) return;

  state.numberResponseShellEl.innerHTML = renderNumberResponseInputMarkup({
    inputId: "rd_response_input",
    value: "",
    readonly: false,
    className: "rd-number-response-input",
    ariaLabel: "Réponse"
  });

  state.inputEl = state.numberResponseShellEl.querySelector("#rd_response_input");
}

function renderDisplayedNumericResponse(state) {
  if (!state.numberResponseShellEl || !state.currentQuestion) return;

  const evaluation = state.lastEvaluation ?? computeStoredNumericEvaluation(state);
  const showStudentAnswer = canToggleStudentNumericAnswerDisplay(state)
    && normalizeAnswerDisplayMode(state.answerDisplayMode) === "student";
  const snapshot = showStudentAnswer ? state.studentAnswerSnapshot : state.correctionSnapshot;
  state.numberResponseShellEl.innerHTML = renderNumberResponseInputMarkup({
    value: String(snapshot?.value ?? ""),
    readonly: true,
    className: `rd-number-response-input`,
    ariaLabel: "Réponse affichée"
  });

  state.inputEl = state.numberResponseShellEl.querySelector(".rd-number-response-input");
  applyNumberColumnFeedback(state, evaluation.isCorrect === true);
}

function applyNumberColumnFeedback(state, isCorrect) {
  if (!state.numberColumnEl) return;
  state.numberColumnEl.classList.toggle("rd-number-column--correct", isCorrect === true);
  state.numberColumnEl.classList.toggle("rd-number-column--incorrect", isCorrect !== true);
}

function clearNumberColumnFeedback(state) {
  state.numberColumnEl?.classList.remove("rd-number-column--correct", "rd-number-column--incorrect");
}

function renderNumberResponseInputMarkup({
  inputId = "",
  value = "",
  readonly = false,
  className = "rd-number-response-input",
  ariaLabel = ""
} = {}) {
  const safeId = String(inputId ?? "").trim();
  const safeClassName = String(className || "rd-number-response-input").trim();

  return `
    <input
      class="${escapeHtml(safeClassName)}"
      ${safeId ? `id="${escapeHtml(safeId)}"` : ""}
      ${readonly ? "" : "data-rd-number-response-input"}
      type="text"
      inputmode="numeric"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      aria-label="${escapeHtml(ariaLabel)}"
      value="${escapeHtml(String(value ?? ""))}"
      ${readonly ? 'readonly tabindex="-1"' : ""}
    />
  `;
}

function bindNumericResponseEvents(state) {
  if (!state.inputEl) return;

  state.inputEl.addEventListener("input", () => {
    if (state.answerRevealed || state.builderAnimating) return;
    const digitsOnly = String(state.inputEl.value ?? "").replace(/\D+/g, "");
    if (state.inputEl.value !== digitsOnly) {
      state.inputEl.value = digitsOnly;
    }
    syncValidateState(state);
  });

  state.inputEl.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    if (state.answerRevealed || state.builderAnimating) return;
    if (!canSubmitAnswer(state)) return;
    event.preventDefault();
    requestReveal(state);
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

  state.buildItems.push({
    id: `piece_${state.nextBuildItemId++}`,
    kind,
    x: position.x,
    y: position.y,
    status: "normal"
  });

  renderBuildItems(state, safeSettings);
  renderBuildOverflow(state, safeSettings);
  syncValidateState(state);
  maybePromoteBuildPieces(state, safeSettings, kind, sourceButton);
}

function renderBuildItems(state, settings) {
  if (!state.builderItemsLayerEl || !state.currentQuestion) return;

  state.builderItemsLayerEl.innerHTML = "";
  const itemsToRender = state.correctionReveal
    ? state.buildItems.filter((item) => item.status !== "extra")
    : state.buildItems;

  itemsToRender.forEach((item) => {
    const size = getWorkspacePieceSize(state.currentQuestion.themeId, item.kind);
    const button = document.createElement("button");
    button.type = "button";
    const statusClass = item.status && item.status !== 'normal' ? ` rd-build-piece--${item.status}` : '';
    button.className = `rd-build-piece rd-build-piece--${item.kind}${statusClass}`;
    button.dataset.id = item.id;
    button.style.width = `${size.width}px`;
    button.style.height = `${size.height}px`;
    button.style.left = `${round(clamp(item.x, 0, Math.max(0, state.builderWorkspaceEl.clientWidth - size.width)))}px`;
    button.style.top = `${round(clamp(item.y, 0, Math.max(0, state.builderWorkspaceEl.clientHeight - size.height)))}px`;
    button.innerHTML = renderRepresentationPieceSvg(state.currentQuestion.themeId, item.kind, {
      labelMode: settings.textBlocksLabelMode
    });
    bindBuildPiecePointer(state, button, item.id, size);
    state.builderItemsLayerEl.appendChild(button);
  });

  syncBuilderCueVisibility(state);
}

function bindBuildPiecePointer(state, element, itemId, size) {
  let pointerId = null;
  let startClientX = 0;
  let startClientY = 0;
  let startItemX = 0;
  let startItemY = 0;
  let dragStarted = false;

  const onPointerMove = (event) => {
    if (event.pointerId !== pointerId || !state.builderWorkspaceEl) return;
    const dx = event.clientX - startClientX;
    const dy = event.clientY - startClientY;
    if (!dragStarted && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
      dragStarted = true;
      element.classList.add("is-dragging");
    }
    if (!dragStarted) return;

    const maxX = Math.max(0, state.builderWorkspaceEl.clientWidth - size.width);
    const maxY = Math.max(0, state.builderWorkspaceEl.clientHeight - size.height);
    const nextX = clamp(startItemX + dx, 0, maxX);
    const nextY = clamp(startItemY + dy, 0, maxY);
    const item = getBuildItemById(state, itemId);
    if (!item) return;
    item.x = nextX;
    item.y = nextY;
    element.style.left = `${round(nextX)}px`;
    element.style.top = `${round(nextY)}px`;
  };

  const onPointerEnd = (event) => {
    if (event.pointerId !== pointerId) return;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerEnd);
    window.removeEventListener("pointercancel", onPointerEnd);
    try {
      element.releasePointerCapture?.(event.pointerId);
    } catch {}

    if (!dragStarted) {
      removeBuildPiece(state, itemId, normalizeSettings(state.latestContext?.settings));
    } else {
      element.classList.remove("is-dragging");
    }

    pointerId = null;
    dragStarted = false;
  };

  element.addEventListener("pointerdown", (event) => {
    if (state.answerRevealed) return;
    if (event.button != null && event.button !== 0) return;
    const item = getBuildItemById(state, itemId);
    if (!item) return;

    pointerId = event.pointerId;
    startClientX = event.clientX;
    startClientY = event.clientY;
    startItemX = item.x;
    startItemY = item.y;
    dragStarted = false;

    try {
      element.setPointerCapture?.(event.pointerId);
    } catch {}

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
  });
}

function removeBuildPiece(state, itemId, settings) {
  state.buildItems = state.buildItems.filter((item) => item.id !== itemId);
  const safeSettings = settings || normalizeSettings(state.latestContext?.settings);
  renderBuildItems(state, safeSettings);
  renderBuildOverflow(state, safeSettings);
  syncValidateState(state);
}

function getBuildItemById(state, itemId) {
  return state.buildItems.find((item) => item.id === itemId) || null;
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
  const groups = {
    hundreds: extraItems.filter((item) => item.kind === "hundreds"),
    tens: extraItems.filter((item) => item.kind === "tens"),
    ones: extraItems.filter((item) => item.kind === "ones")
  };

  ["hundreds", "tens", "ones"].forEach((kind) => {
    groups[kind].forEach((item) => {
      const size = getPalettePieceSize(themeId, kind);
      const el = document.createElement("div");
      el.className = `rd-overflow-piece rd-overflow-piece--${kind}`;
      el.style.width = `${size.width}px`;
      el.style.height = `${size.height}px`;
      el.innerHTML = renderRepresentationPieceSvg(themeId, kind, {
        labelMode: settings?.textBlocksLabelMode
      });
      state.builderOverflowEl.appendChild(el);
    });
  });
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
  if (kind === "tens" && (themeId === "blocs_bleus_base10" || themeId === "blocs_textuels")) return "hundreds";
  return null;
}

function maybePromoteBuildPieces(state, settings, preferredKind = "ones", sourceButton = null) {
  const themeId = state.currentQuestion?.themeId;
  if (!themeId || state.builderAnimating) return;

  const counts = countBuildPieces(state.buildItems.filter((item) => item.status !== "extra"));
  const kindsToCheck = preferredKind === "tens" ? ["tens", "ones"] : ["ones", "tens"];
  const promotableKind = kindsToCheck.find((kind) => (counts[kind] || 0) >= 10 && getPromotedKind(themeId, kind));
  if (!promotableKind) return;

  runPromotionSequence(state, settings, promotableKind, sourceButton);
}

function runPromotionSequence(state, settings, kind, sourceButton = null) {
  const themeId = state.currentQuestion?.themeId;
  const nextKind = getPromotedKind(themeId, kind);
  if (!themeId || !nextKind) return;

  const candidateItems = state.buildItems.filter((item) => item.kind === kind && item.status !== "extra").slice(0, 10);
  if (candidateItems.length < 10) return;

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
      state.buildItems = state.buildItems.filter((item) => item.id !== lastItem.id);
      renderBuildItems(state, settings);
      renderBuildOverflow(state, settings);
      syncValidateState(state);
    }
    triggerPieceLimitFeedback(state, sourceButton);
    return;
  }

  const fusionLayout = computeFusionLayout(state, themeId, kind, candidateItems);
  if (!fusionLayout) return;

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
    state.buildItems = state.buildItems.filter((item) => !candidateItems.some((candidate) => candidate.id === item.id));
    const promotedSize = getWorkspacePieceSize(themeId, nextKind);
    const promotedX = clamp(fusionLayout.promoted.x, 0, Math.max(0, state.builderWorkspaceEl.clientWidth - promotedSize.width));
    const promotedY = clamp(fusionLayout.promoted.y, 0, Math.max(0, state.builderWorkspaceEl.clientHeight - promotedSize.height));
    state.buildItems.push({
      id: `piece_${state.nextBuildItemId++}`,
      kind: nextKind,
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


function findBuildPiecePlacement(state, size) {
  const workspace = state.builderWorkspaceEl;
  if (!workspace) return { x: 0, y: 0 };

  const maxX = Math.max(0, workspace.clientWidth - size.width);
  const maxY = Math.max(0, workspace.clientHeight - size.height);
  const existingRects = state.buildItems.map((item) => {
    const itemSize = getWorkspacePieceSize(state.currentQuestion.themeId, item.kind);
    return {
      x: Number(item.x) || 0,
      y: Number(item.y) || 0,
      width: itemSize.width,
      height: itemSize.height
    };
  });

  const tries = 32;
  let best = {
    x: Math.max(0, (workspace.clientWidth - size.width) / 2),
    y: Math.max(0, (workspace.clientHeight - size.height) / 2),
    score: Number.POSITIVE_INFINITY
  };

  const candidates = [];
  for (let i = 0; i < tries; i += 1) {
    candidates.push({
      x: Math.random() * maxX,
      y: Math.random() * maxY
    });
  }
  candidates.push(best);

  for (const candidate of candidates) {
    const x = clamp(candidate.x, 0, maxX);
    const y = clamp(candidate.y, 0, maxY);
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

  const assignments = computeOrganizedAssignments(state, sourceItems);
  if (!assignments.length) {
    options.onComplete?.();
    return;
  }

  const staggerMs = Number.isFinite(options.staggerMs) ? Number(options.staggerMs) : 130;
  const moveDurationMs = Number.isFinite(options.moveDurationMs) ? Number(options.moveDurationMs) : 320;

  state.builderAnimating = true;
  state.organizeBtnEl?.setAttribute("disabled", "disabled");

  const elements = new Map(
    [...(state.builderItemsLayerEl?.querySelectorAll?.(".rd-build-piece") || [])].map((el) => [String(el.dataset.id || ""), el])
  );

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
    state.builderItemsLayerEl?.querySelectorAll?.(".rd-build-piece.is-organizing")?.forEach?.((el) => {
      el.classList.remove("is-organizing");
    });
    options.onComplete?.();
    return;
  }

  const finishId = window.setTimeout(() => {
    state.builderAnimating = false;
    state.organizeBtnEl?.removeAttribute("disabled");
    state.builderItemsLayerEl?.querySelectorAll?.(".rd-build-piece.is-organizing")?.forEach?.((el) => {
      el.classList.remove("is-organizing");
    });
    options.onComplete?.();
  }, totalDuration);
  state.organizeTimers.push(finishId);
}

function computeOrganizedAssignments(state, sourceItems = state.buildItems) {
  const workspace = state.builderWorkspaceEl;
  const themeId = state.currentQuestion?.themeId;
  if (!workspace || !themeId) return [];

  const counts = countBuildPieces(sourceItems);
  const sizes = {
    ones: getWorkspacePieceSize(themeId, "ones"),
    tens: getWorkspacePieceSize(themeId, "tens"),
    hundreds: getWorkspacePieceSize(themeId, "hundreds")
  };

  let slots = [];
  if (themeId === "picbille") {
    slots = computePicbilleBuildSlots(workspace, counts, sizes);
  } else if (themeId === "dede") {
    slots = computeDedeBuildSlots(workspace, counts, sizes);
  } else if (themeId === "blocs_bleus_base10") {
    slots = computeBlueBuildSlots(workspace, counts, sizes);
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

function computeBlueBuildSlots(workspace, counts, sizes) {
  const slots = [];
  const margin = 12;
  const upperGap = 14;
  const tensGap = 10;
  const verticalGroupGap = 18;
  const onesItemGap = 14;
  const onesRowGap = 14;
  const lowerGroupGap = 28;

  const hasHundreds = counts.hundreds > 0;
  const lowerBandTop = hasHundreds ? Math.max(margin + sizes.hundreds.height + 22, workspace.clientHeight / 2) : margin;
  const lowerBandHeight = Math.max(80, workspace.clientHeight - lowerBandTop - margin);

  if (hasHundreds) {
    const hundredCols = Math.min(5, Math.max(1, counts.hundreds));
    const hundredRows = Math.ceil(counts.hundreds / 5);
    const topHeight = hundredRows * sizes.hundreds.height + Math.max(0, hundredRows - 1) * upperGap;
    const topWidth = hundredCols * sizes.hundreds.width + Math.max(0, hundredCols - 1) * upperGap;
    const topStartX = Math.max(margin, (workspace.clientWidth - topWidth) / 2);
    const topStartY = Math.max(margin, (lowerBandTop - topHeight) / 2);
    for (let i = 0; i < counts.hundreds; i += 1) {
      const row = Math.floor(i / 5);
      const col = i % 5;
      slots.push({
        kind: "hundreds",
        x: topStartX + col * (sizes.hundreds.width + upperGap),
        y: topStartY + row * (sizes.hundreds.height + upperGap)
      });
    }
  }

  const tenGroupHeight = counts.tens > 0
    ? counts.tens * sizes.tens.height + Math.max(0, counts.tens - 1) * tensGap + (counts.tens > 5 ? verticalGroupGap : 0)
    : 0;
  const tenGroupWidth = counts.tens > 0 ? sizes.tens.width : 0;
  const oneCols = Math.min(5, Math.max(1, counts.ones));
  const oneRows = counts.ones > 0 ? Math.ceil(counts.ones / 5) : 0;
  const onesWidth = counts.ones > 0
    ? oneCols * sizes.ones.width + Math.max(0, oneCols - 1) * onesItemGap
    : 0;
  const onesHeight = counts.ones > 0
    ? oneRows * sizes.ones.height + Math.max(0, oneRows - 1) * onesRowGap
    : 0;
  const lowerHeight = Math.max(tenGroupHeight, onesHeight);
  const lowerWidth = tenGroupWidth + (counts.tens > 0 && counts.ones > 0 ? lowerGroupGap : 0) + onesWidth;
  const lowerStartX = Math.max(margin, (workspace.clientWidth - lowerWidth) / 2);
  const lowerStartY = lowerBandTop + Math.max(0, (lowerBandHeight - lowerHeight) / 2);

  let cursorY = lowerStartY + Math.max(0, (lowerHeight - tenGroupHeight) / 2);
  const tenGroups = counts.tens > 5 ? [counts.tens - 5, 5] : [counts.tens];
  tenGroups.forEach((groupCount, groupIndex) => {
    if (groupIndex > 0) {
      cursorY += tensGap + verticalGroupGap;
    }
    for (let i = 0; i < groupCount; i += 1) {
      slots.push({
        kind: "tens",
        x: lowerStartX,
        y: cursorY
      });
      cursorY += sizes.tens.height;
      if (i < groupCount - 1) {
        cursorY += tensGap;
      }
    }
  });

  const onesStartX = lowerStartX + tenGroupWidth + (counts.tens > 0 && counts.ones > 0 ? lowerGroupGap : 0);
  for (let i = 0; i < counts.ones; i += 1) {
    const row = Math.floor(i / 5);
    const col = i % 5;
    slots.push({
      kind: "ones",
      x: onesStartX + col * (sizes.ones.width + onesItemGap),
      y: lowerStartY + Math.max(0, (lowerHeight - onesHeight) / 2) + row * (sizes.ones.height + onesRowGap)
    });
  }

  return slots;
}

function computePicbilleBuildSlots(workspace, counts, sizes) {
  const onesCount = counts.ones || 0;
  const tensCount = counts.tens || 0;
  const onesW = sizes.ones.width;
  const onesH = sizes.ones.height;
  const tenW = sizes.tens.width;
  const tenH = sizes.tens.height;
  const unitGap = Math.max(2, (tenW - onesW * 10) / 10.35);
  const groupGap = unitGap * 2.35;
  const unitRowGap = 16;
  const barGap = 8;
  const bigGap = 22;
  const smallGap = 12;

  const groups = getPicbilleBuilderTenGroups(tensCount, onesCount, bigGap, smallGap);
  const tenStackHeight = computeBuilderPicbilleStackHeight(groups, tenH, barGap);
  const onesRowWidth = computePicbilleOnesRowWidth(onesCount, onesW, unitGap, groupGap);
  const totalWidth = Math.max(tenW, onesRowWidth);
  const totalHeight = (onesCount > 0 ? onesH + unitRowGap : 0) + tenStackHeight;
  const startX = Math.max(12, (workspace.clientWidth - totalWidth) / 2);
  const startY = Math.max(12, (workspace.clientHeight - totalHeight) / 2);
  const slots = [];

  if (onesCount > 0) {
    let x = startX;
    const y = startY;
    for (let i = 0; i < onesCount; i += 1) {
      slots.push({ kind: "ones", x, y });
      x += onesW;
      if (i < onesCount - 1) x += i === 4 ? groupGap : unitGap;
    }
  }

  const tenXs = startX + Math.max(0, (totalWidth - tenW) / 2);
  let cursorBottom = startY + (onesCount > 0 ? onesH + unitRowGap : 0) + tenStackHeight;
  groups.forEach((group, groupIndex) => {
    const groupHeight = group.count * tenH + Math.max(0, group.count - 1) * barGap;
    let groupY = cursorBottom - groupHeight;
    for (let i = 0; i < group.count; i += 1) {
      slots.push({ kind: "tens", x: tenXs, y: groupY });
      groupY += tenH;
      if (i < group.count - 1) groupY += barGap;
    }
    cursorBottom -= groupHeight;
    if (groupIndex < groups.length - 1) cursorBottom -= group.gapAfter;
  });

  return slots;
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

function computePicbilleOnesRowWidth(count, onesW, gap, groupGap) {
  if (count <= 0) return 0;
  let total = count * onesW;
  for (let i = 0; i < count - 1; i += 1) total += i === 4 ? groupGap : gap;
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
  state.answerRevealed = true;

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
    revealBuildFeedback(state);
  }

  state.root?.classList.add("rd-root--revealed");
  syncValidateState(state);
}

function revealNumericFeedback(state) {
  if (!state.currentQuestion) return;

  const evaluation = state.lastEvaluation ?? computeStoredNumericEvaluation(state);
  const isCorrect = evaluation.isCorrect === true;

  if (shouldUseInlineNumberResponse(state)) {
    renderDisplayedNumericResponse(state);
    state.inputEl?.setAttribute("aria-invalid", isCorrect ? "false" : "true");
  }

}

function revealBuildFeedback(state) {
  if (shouldUsePassiveFreeBuildQuestion(state)) {
    revealPassiveFreeBuildCorrection(state);
    return;
  }

  const isCorrect = isBuildAnswerCorrect(state);
  state.panelEl?.classList.toggle("rd-panel--correct", isCorrect);
  state.panelEl?.classList.toggle("rd-panel--incorrect", !isCorrect);

  const settings = normalizeSettings(state.latestContext?.settings);

  if (isCorrect) {
    organizeBuildPieces(state, settings, {
      items: state.buildItems,
      onComplete: () => {
        if (state.builderSidebarEl) {
          state.builderSidebarEl.hidden = false;
          state.builderSidebarEl.classList.add("is-hidden");
          state.builderSidebarEl.classList.remove("rd-builder-sidebar--overflow");
          state.builderSidebarEl.innerHTML = "";
        }
      }
    });
    return;
  }

  prepareBuildCorrection(state, settings);
}

function revealPassiveFreeBuildCorrection(state) {
  const question = state.currentQuestion;
  if (!question || !state.panelInnerEl) return;

  const settings = normalizeSettings(state.latestContext?.settings);
  state.panelEl?.classList.remove("rd-panel--correct", "rd-panel--incorrect");
  state.correctionReveal = true;
  state.panelInnerEl.innerHTML = renderRepresentationSvg(question.themeId, question.value, {
    labelMode: settings.textBlocksLabelMode
  });
  hideBuilderSidebar(state);
}

function prepareBuildCorrection(state, settings) {
  if (!state.currentQuestion || !state.builderWorkspaceEl || !state.builderItemsLayerEl) return;

  computeBuildCorrectionDiff(state);
  const missingKinds = [];
  ["hundreds", "tens", "ones"].forEach((kind) => {
    const count = state.currentQuestion?.expectedBuild?.[kind] || 0;
    const current = state.buildItems.filter((item) => item.kind === kind && item.status !== "extra").length;
    for (let i = 0; i < Math.max(0, count - current); i += 1) {
      missingKinds.push(kind);
    }
  });

  missingKinds.forEach((kind) => {
    const size = getWorkspacePieceSize(state.currentQuestion.themeId, kind);
    const position = findBuildPiecePlacement(state, size);
    state.buildItems.push({
      id: `piece_${state.nextBuildItemId++}`,
      kind,
      x: position.x,
      y: position.y,
      status: "missing"
    });
  });

  renderBuildItems(state, settings);
  startBuildCorrectionAnimation(state, settings);
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
    });
  });
}


function startBuildCorrectionAnimation(state, settings) {
  const extraItems = state.buildItems.filter((item) => item.status === "extra");
  if (!extraItems.length) {
    state.correctionReveal = true;
    renderBuildItems(state, settings);
    renderBuildOverflow(state, settings);
    organizeBuildPieces(state, settings, {
      items: state.buildItems.filter((item) => item.status !== "extra")
    });
    return;
  }

  prepareOverflowTargets(state, settings, extraItems);
  const targetMap = collectOverflowTargetPositions(state, extraItems);
  moveExtraPiecesToTransitionLayer(state, extraItems);
  state.correctionReveal = true;
  renderBuildItems(state, settings);

  animateExtraPiecesOut(state, extraItems, targetMap, () => {
    renderBuildOverflow(state, settings);
    organizeBuildPieces(state, settings, {
      items: state.buildItems.filter((item) => item.status !== "extra")
    });
  });
}

function prepareOverflowTargets(state, settings, extraItems) {
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
  ["hundreds", "tens", "ones"].forEach((kind) => {
    extraItems.filter((item) => item.kind === kind).forEach((item) => {
      const size = getPalettePieceSize(themeId, kind);
      const el = document.createElement("div");
      el.className = `rd-overflow-target rd-overflow-target--${kind}`;
      el.dataset.targetId = item.id;
      el.style.width = `${size.width}px`;
      el.style.height = `${size.height}px`;
      state.builderOverflowEl.appendChild(el);
    });
  });
}

function collectOverflowTargetPositions(state, extraItems) {
  const shellRect = state.panelShellEl?.getBoundingClientRect();
  if (!shellRect) return new Map();
  const targetMap = new Map();
  extraItems.forEach((item) => {
    const targetEl = state.builderOverflowEl?.querySelector(`.rd-overflow-target[data-target-id="${CSS.escape(String(item.id))}"]`);
    if (!targetEl) return;
    const rect = targetEl.getBoundingClientRect();
    targetMap.set(item.id, {
      x: rect.left - shellRect.left,
      y: rect.top - shellRect.top
    });
  });
  return targetMap;
}

function moveExtraPiecesToTransitionLayer(state, extraItems) {
  const shellRect = state.panelShellEl?.getBoundingClientRect();
  if (!state.transitionLayerEl || !shellRect) return;
  const elementMap = new Map(
    [...(state.builderItemsLayerEl?.querySelectorAll?.(".rd-build-piece") || [])].map((el) => [String(el.dataset.id || ""), el])
  );
  extraItems.forEach((item) => {
    const el = elementMap.get(item.id);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.classList.add("rd-build-piece--transition-out");
    el.style.left = `${round(rect.left - shellRect.left)}px`;
    el.style.top = `${round(rect.top - shellRect.top)}px`;
    state.transitionLayerEl.appendChild(el);
  });
}

function animateExtraPiecesOut(state, extraItems, targetMap, onComplete) {
  if (!state.transitionLayerEl) {
    onComplete?.();
    return;
  }
  const elements = new Map(
    [...(state.transitionLayerEl.querySelectorAll?.(".rd-build-piece") || [])].map((el) => [String(el.dataset.id || ""), el])
  );
  state.builderAnimating = true;
  state.organizeBtnEl?.setAttribute("disabled", "disabled");

  requestAnimationFrame(() => {
    extraItems.forEach((item) => {
      const el = elements.get(item.id);
      const target = targetMap.get(item.id);
      if (!el || !target) return;
      el.classList.add("is-transitioning-out");
      el.style.left = `${round(target.x)}px`;
      el.style.top = `${round(target.y)}px`;
    });
  });

  const finishId = window.setTimeout(() => {
    state.builderAnimating = false;
    state.organizeBtnEl?.removeAttribute("disabled");
    state.transitionLayerEl?.querySelectorAll?.(".rd-build-piece--transition-out")?.forEach?.((el) => {
      el.remove();
    });
    onComplete?.();
  }, 460);
  state.organizeTimers.push(finishId);
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

function resetVisualState(state) {
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
  state.panelEl?.classList.remove("rd-panel--builder", "rd-panel--correct", "rd-panel--incorrect");
  state.root?.classList.remove(
    "rd-root--revealed",
    "rd-root--question-number-to-representation",
    "rd-root--question-representation-to-number",
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

  clearOrganizeTimers(state);
  if (state.transitionLayerEl) state.transitionLayerEl.innerHTML = "";
  state.buildItems = [];
  state.nextBuildItemId = 1;
  state.buildDrag = null;
  state.correctionReveal = false;
  state.answerDisplayMode = "correction";
  state.studentAnswerSnapshot = null;
  state.correctionSnapshot = null;
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
  return {
    canToggle: canToggleStudentNumericAnswerDisplay(state),
    mode: canToggleStudentNumericAnswerDisplay(state)
      ? normalizeAnswerDisplayMode(state.answerDisplayMode)
      : "correction"
  };
}

function applyShellAnswerDisplayMode(state, mode) {
  if (!shouldUseInlineNumberResponse(state) || !state.answerRevealed) {
    return false;
  }

  if (!canToggleStudentNumericAnswerDisplay(state)) {
    state.answerDisplayMode = "correction";
    renderDisplayedNumericResponse(state);
    return false;
  }

  state.answerDisplayMode = normalizeAnswerDisplayMode(mode);
  renderDisplayedNumericResponse(state);
  return true;
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
  state.latestContext?.services?.requestAnswerPhase?.({
    manual: false,
    showAnswerNow: true,
    wasCorrect: isCurrentAnswerCorrect(state)
  });
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
  const activityMode = normalizeActivityMode(context?.activityMode);
  if (activityMode === "group") {
    return false;
  }

  if (String(context?.runMode || context?.sessionMode || "").trim() === "projected-teacher") {
    return normalizeProjectionResponseUi(context?.projectionResponseUi) === "boxed";
  }

  return true;
}

function normalizeProjectionResponseUi(value) {
  const safeValue = String(value || "free").trim().toLowerCase();
  return safeValue === "boxed" ? "boxed" : "free";
}

function normalizeActivityMode(value) {
  const safeValue = String(value || "individual").trim().toLowerCase();
  if (safeValue === "group") {
    return safeValue;
  }
  return "individual";
}

function normalizeAnswerDisplayMode(value) {
  return String(value || "").trim().toLowerCase() === "student" ? "student" : "correction";
}

function getPaletteKinds(themeId) {
  if (themeId === "picbille" || themeId === "dede") {
    return ["tens", "ones"];
  }
  return ["hundreds", "tens", "ones"];
}

function getWorkspacePieceSize(themeId, kind) {
  const themeMap = BUILD_PIECE_SIZES[themeId] || BUILD_PIECE_SIZES.blocs_bleus_base10;
  return themeMap[kind] || BUILD_PIECE_SIZES.blocs_bleus_base10[kind] || { width: 48, height: 48 };
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
  state.lastEvaluation = null;
  state.builderWorkspaceEl = null;
  state.builderItemsLayerEl = null;
  state.builderCueEl = null;
  state.builderPaletteEl = null;
  state.organizeBtnEl = null;
  state.phaseMonitorId = null;
  state.lastObservedPhaseKind = null;
  state.builderSidebarEl = null;
  state.buildItems = [];
  state.buildDrag = null;
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  ensureToolInstructionStyles();

  const href = new URL("./activity.css", import.meta.url).href;
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
