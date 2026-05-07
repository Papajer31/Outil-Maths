import {
  normalizeSettings,
  INDIVIDUAL_VALIDATION_MODES,
  pickQuestion,
  questionKey,
  visibleTextOfGraph,
  evaluateWordAttempt,
  getGraphFilename,
  getGraphLabel,
  setWordCatalog,
  buildCanonicalAnswerEntries
} from "./model.js";
import {
  listPublicImageAssets,
  getPublicImageAssetUrl,
  listPublicPhonologyWords
} from "../../shared/public-api.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveQuestionInstructionText,
  setToolInstructionText
} from "../../shared/tool-instruction.js";

const QUESTION_PROMPT = "Encode ce mot.";
const TOUCH_DRAG_THRESHOLD = 8;
const LIBRARY_SCROLL_LOCK_THRESHOLD = 10;
const LIBRARY_DRAG_INTENT_THRESHOLD = 14;

let stylesReadyPromise = null;

const WORD_IMAGE_BUCKET = "images";
let wordImageCatalogPromise = null;
let phonologyWordCatalogPromise = null;

function normalizeWordImageSlug(value) {
  return String(value || "").trim().toLowerCase();
}

async function ensurePhonologyWordCatalog() {
  if (!phonologyWordCatalogPromise) {
    phonologyWordCatalogPromise = listPublicPhonologyWords()
      .then((rows) => {
        const words = Array.isArray(rows) ? rows : [];
        setWordCatalog(words);
        return words;
      })
      .catch((error) => {
        setWordCatalog([]);
        throw error;
      });
  }

  return await phonologyWordCatalogPromise;
}

async function ensureWordImageCatalog() {
  if (!wordImageCatalogPromise) {
    wordImageCatalogPromise = listPublicImageAssets()
      .then((rows) => {
        const map = new Map();

        for (const row of (Array.isArray(rows) ? rows : [])) {
          const slug = normalizeWordImageSlug(row?.slug);
          const storagePath = String(row?.storage_path || "").trim();
          if (!slug || !storagePath) continue;
          map.set(slug, storagePath);
        }

        return map;
      })
      .catch(() => new Map());
  }

  return await wordImageCatalogPromise;
}

async function resolveWordImageUrl(question) {
  const slug = normalizeWordImageSlug(question?.slug || questionKey(question));
  if (!slug) return "";

  try {
    const catalog = await ensureWordImageCatalog();
    const storagePath = catalog.get(slug);
    return getPublicImageAssetUrl(storagePath, { bucket: WORD_IMAGE_BUCKET }) || "";
  } catch {
    return "";
  }
}

function createPendingLibraryTouch() {
  return {
    active: false,
    graph: null,
    pointerId: null,
    startX: 0,
    startY: 0
  };
}

function createPointerDrag() {
  return {
    active: false,
    moved: false,
    kind: "",
    graph: null,
    fromIndex: null,
    pointerId: null,
    startX: 0,
    startY: 0,
    ghost: null
  };
}


function normalizeActivityMode(value) {
  const safeValue = String(value || "individual").trim().toLowerCase();
  if (safeValue === "group") {
    return safeValue;
  }
  return "individual";
}

function normalizeProjectionResponseUi(value) {
  return String(value || "free").trim().toLowerCase() === "boxed" ? "boxed" : "free";
}

function usesShellValidationMode(context = {}) {
  const activityMode = normalizeActivityMode(context?.activityMode);
  if (activityMode === "individual") {
    return true;
  }
  const runMode = String(context?.runMode || context?.sessionMode || "").trim().toLowerCase();
  return runMode === "projected-teacher"
    && normalizeProjectionResponseUi(context?.projectionResponseUi) === "boxed";
}

function normalizeAnswerDisplayMode(value) {
  return String(value || "").trim().toLowerCase() === "student" ? "student" : "correction";
}

function isFinalCorrectionToggleValidationMode(mode) {
  return mode === INDIVIDUAL_VALIDATION_MODES.GRAPHO_TOLERANCE
    || mode === INDIVIDUAL_VALIDATION_MODES.LIMITED_ATTEMPTS;
}

function cloneAnswerEntry(entry) {
  return entry ? { ...entry } : null;
}

function cloneAnswerEntries(entries) {
  return (Array.isArray(entries) ? entries : []).map(cloneAnswerEntry);
}

function createRuntimeState(initialContext = {}) {

  return {
    container: null,
    latestContext: initialContext,
    activityMode: normalizeActivityMode(initialContext?.activityMode),
    settings: normalizeSettings(initialContext?.settings),
    currentQuestion: null,
    lastQuestionId: "",
    validationAttempts: 0,
    phaseMode: "question-active",
    corrected: false,
    answerDisplayMode: "correction",
    studentAnswerSnapshot: null,
    shellToggleAvailable: false,
    answer: [],
    sessionItem: initialContext?.sessionItem ?? null,
    sessionControls: initialContext?.sessionControls ?? initialContext?.services?.sessionControls ?? null,
    dom: {},
    suppressLibraryClickUntil: 0,
    pendingLibraryTouch: createPendingLibraryTouch(),
    pointerDrag: createPointerDrag(),
    dragFromAnswerIndex: null,
    globalHandlersBound: false,
    onGlobalPointerMove: null,
    onGlobalPointerUp: null,
    onGlobalPointerCancel: null,
    answerScaleObserver: null,
    answerScaleRaf: 0,
    onWindowResize: null,
    insertBar: null
  };
}

function syncRuntimeState(state, context = state.latestContext) {
  const nextContext = context ?? state.latestContext ?? {};

  state.latestContext = nextContext;
  state.activityMode = normalizeActivityMode(nextContext?.activityMode);
  state.settings = normalizeSettings(nextContext?.settings);
  state.sessionItem = nextContext?.sessionItem ?? state.sessionItem ?? null;
  state.sessionControls = nextContext?.sessionControls ?? nextContext?.services?.sessionControls ?? state.sessionControls ?? null;

  return state;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function injectActivityStyles() {
  if (stylesReadyPromise) return stylesReadyPromise;

  ensureToolInstructionStyles();

  const href = new URL("./activity.css", import.meta.url).href;
  const existing = document.querySelector(`link[data-phono-activity-style="${href}"]`);

  if (existing) {
    stylesReadyPromise = Promise.resolve();
    return stylesReadyPromise;
  }

  stylesReadyPromise = new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.phonoActivityStyle = href;
    link.addEventListener("load", () => resolve(), { once: true });
    link.addEventListener("error", () => resolve(), { once: true });
    document.head.appendChild(link);
  });

  return stylesReadyPromise;
}

export function createActivity(initialContext = {}) {
  const state = createRuntimeState(initialContext);

  return {
    async mount(container, context = initialContext) {
      state.container = container;
      syncRuntimeState(state, context ?? state.latestContext);
      await injectActivityStyles();
      await ensurePhonologyWordCatalog();
      renderShell();
      bindStaticEvents();
      updatePromptDisplay();
      syncActionButton();
    },

    async next(container, context = initialContext) {
      state.container = container || state.container;
      if (!state.container) return;

      syncRuntimeState(state, context ?? state.latestContext);
      await injectActivityStyles();
      await ensurePhonologyWordCatalog();

      if (!state.dom.root || !state.dom.root.isConnected) {
        renderShell();
        bindStaticEvents();
      }

      const nextQuestion = pickQuestion(state.settings, { avoidKey: state.lastQuestionId });
      if (!nextQuestion) {
        throw new Error("Aucun mot jouable avec les graphèmes sélectionnés pour cette activité.");
      }

      state.currentQuestion = nextQuestion;
      state.lastQuestionId = questionKey(nextQuestion);
      state.phaseMode = "question-active";
      state.corrected = false;
      state.validationAttempts = 0;
      state.answerDisplayMode = "correction";
      state.studentAnswerSnapshot = null;
      state.shellToggleAvailable = false;

      ensureDom();
      await renderCurrentWord();
      renderLibrary();
      clearAnswer();
      state.dom.answerBox?.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
      updatePromptDisplay();
      syncActionButton();
    },

    showAnswer(container, context = initialContext) {
      state.container = container || state.container;
      if (!state.container) return;

      syncRuntimeState(state, context ?? state.latestContext);

      if (!state.dom.root || !state.dom.root.isConnected) {
        renderShell();
        bindStaticEvents();
      }

      ensureDom();
      updatePromptDisplay();

      state.phaseMode = shouldUseManualAnswerPhase() ? "answer-manual" : "answer-timed";

      if (state.currentQuestion) {
        const wasAlreadyCorrect = state.corrected === true;
        state.answerDisplayMode = "correction";
        renderCanonicalAnswer();
        setOverallBorder(wasAlreadyCorrect ? "good" : "bad");
        state.dom.answerBox?.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
      }

      syncActionButton();
    },

    getShellAnswerDisplayState(container, context = state.latestContext) {
      state.container = container || state.container;
      syncRuntimeState(state, context ?? state.latestContext);
      ensureDom();
      return getAnswerDisplayStateForShell();
    },

    setShellAnswerDisplayMode(container, context = state.latestContext, mode = "correction") {
      state.container = container || state.container;
      syncRuntimeState(state, context ?? state.latestContext);
      ensureDom();
      return applyAnswerDisplayModeForShell(mode);
    },

    supportsShellValidation(context = state.latestContext) {
      return usesShellValidationMode(context);
    },

    canValidate() {
      return isEditingAnswer();
    },

    validate() {
      if (!isEditingAnswer()) return false;
      evaluateCurrent();
      return true;
    },

    unmount(container) {
      teardownRuntime(container || state.container);
      const reset = createRuntimeState(state.latestContext);
      Object.assign(state, reset);
      state.container = null;
    }
  };

  function ensureDom() {
    if (state.dom.root && state.dom.root.isConnected) return state.dom;

    const container = state.container;
    if (!container) return state.dom;

    state.dom = {
      root: container.querySelector(".phono-root"),
      prompt: container.querySelector("#phono_prompt"),
      wordImage: container.querySelector("#phono_wordImage"),
      answerBox: container.querySelector("#phono_answerBox"),
      answerTrack: container.querySelector("#phono_answerTrack"),
      graphLibrary: container.querySelector("#phono_graphLibrary"),
      btnCheck: container.querySelector("#phono_btnCheck"),
      btnClear: container.querySelector("#phono_btnClear"),
      imageOverlay: container.querySelector("#phono_imageOverlay"),
      imageOverlayImg: container.querySelector("#phono_imageOverlayImg")
    };

    return state.dom;
  }

  function renderShell() {
    const container = state.container;
    if (!container) return;

    syncRuntimeState(state);

    container.innerHTML = `
      <div class="phono-root">
        ${renderToolInstruction({ id: "phono_prompt" })}
        <div class="phono-layout">
          <section class="phono-top-zone">
            <div class="phono-panel phono-image-panel">
              <img id="phono_wordImage" class="phono-word-image" alt="">
            </div>

            <div id="phono_answerBox" class="phono-answer" aria-label="Boite de réponse">
              <div id="phono_answerTrack" class="phono-answer-track"></div>
            </div>

            <div class="phono-action-col">
              ${usesShellValidationMode(state.latestContext)
                ? ``
                : `<button id="phono_btnCheck" class="phono-btn phono-btn-primary phono-btn-check-side" type="button">Vérifier</button>`}
              <button id="phono_btnClear" class="phono-btn phono-btn-secondary phono-btn-clear-side" type="button" aria-label="Effacer la réponse" title="Effacer"><span class="phono-material-icon" aria-hidden="true">delete</span></button>
            </div>
          </section>

          <section class="phono-bottom-zone">
            <div class="phono-panel phono-library-panel">
              <div id="phono_graphLibrary" class="phono-library"></div>
            </div>
          </section>
        </div>

        <div id="phono_imageOverlay" class="phono-image-overlay hidden" aria-hidden="true">
          <img id="phono_imageOverlayImg" alt="">
        </div>
      </div>
    `;

    ensureDom();
    updatePromptDisplay();
  }

  function bindStaticEvents() {
    const dom = ensureDom();

    dom.btnCheck?.addEventListener("click", (event) => {
      event.preventDefault();
      evaluateCurrent();
      event.currentTarget?.blur?.();
    });

    dom.btnClear?.addEventListener("click", (event) => {
      event.preventDefault();
      clearCurrentAnswer();
      event.currentTarget?.blur?.();
    });

    dom.wordImage?.addEventListener("click", openImageOverlay);
    dom.imageOverlay?.addEventListener("click", closeImageOverlay);

    if (!state.globalHandlersBound) {
      state.onGlobalPointerMove = (event) => handleGlobalPointerMoveForLibrary(event);
      state.onGlobalPointerUp = (event) => handleGlobalPointerUpForLibrary(event);
      state.onGlobalPointerCancel = (event) => handleGlobalPointerCancelForLibrary(event);

      document.addEventListener("pointermove", state.onGlobalPointerMove, { passive: false });
      document.addEventListener("pointerup", state.onGlobalPointerUp, { passive: false });
      document.addEventListener("pointercancel", state.onGlobalPointerCancel, { passive: false });
      state.globalHandlersBound = true;
    }

    setupAnswerDrop();
    setupAnswerScaleHandling();
  }

  async function renderCurrentWord() {
    const question = state.currentQuestion;
    const dom = ensureDom();
    if (!dom.wordImage || !question) return;

    const questionId = questionKey(question);
    dom.wordImage.onerror = null;
    dom.wordImage.src = "";
    dom.wordImage.alt = question.word || "";
    clearOverallBorder();

    const imageUrl = await resolveWordImageUrl(question);
    if (!state.currentQuestion || questionKey(state.currentQuestion) !== questionId || !state.dom.wordImage) {
      return;
    }

    dom.wordImage.src = imageUrl;
    dom.wordImage.alt = question.word;
  }

  function getLibraryColumnCount(totalGraphs) {
    if (totalGraphs <= 18) return 6;
    if (totalGraphs <= 21) return 7;
    if (totalGraphs <= 32) return 8;
    if (totalGraphs <= 36) return 9;
    return 10;
  }

  function renderLibrary() {
    const dom = ensureDom();
    if (!dom.graphLibrary) return;

    const totalGraphs = Array.isArray(state.settings.graphOrder) ? state.settings.graphOrder.length : 0;
    dom.graphLibrary.style.setProperty("--phono-library-cols", String(getLibraryColumnCount(totalGraphs)));
    dom.graphLibrary.innerHTML = "";

    for (const graph of state.settings.graphOrder) {
      const tile = document.createElement("div");
      tile.className = "phono-tile";
      tile.dataset.graph = graph;
      tile.draggable = true;

      const btn = document.createElement("div");
      btn.className = "phono-tile-btn";

      const image = document.createElement("img");
      image.src = getGraphImageUrl(graph);
      image.alt = getGraphLabel(graph);

      btn.appendChild(image);
      tile.appendChild(btn);

      tile.addEventListener("click", (event) => {
        if (!isEditingAnswer()) return;
        if (shouldSuppressLibraryClick()) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        addGraphToAnswer(graph);
      });

      tile.addEventListener("dragstart", (event) => {
        if (!isEditingAnswer()) {
          event.preventDefault();
          return;
        }

        event.dataTransfer?.setData("text/plain", graph);
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "copy";
        }

        const dragEl = makeDragChip(graph);
        document.body.appendChild(dragEl);
        event.dataTransfer?.setDragImage(dragEl, dragEl.offsetWidth / 2, dragEl.offsetHeight / 2);
        requestAnimationFrame(() => dragEl.remove());
      });

      tile.addEventListener("pointerdown", (event) => {
        if (!isEditingAnswer()) return;
        if (event.pointerType === "mouse") return;
        if (state.pointerDrag.active || state.pendingLibraryTouch.active) return;
        beginPendingLibraryTouch(graph, event.pointerId, event.clientX, event.clientY);
      });

      dom.graphLibrary.appendChild(tile);
    }
  }

  function clearAnswer() {
    const question = state.currentQuestion;

    if (state.settings.mode === "cases") {
      const units = Array.isArray(question?.units) ? question.units : [];
      state.answer = units.map((unit) => unit.isSilent
        ? { graph: unit.graph, injected: true, mark: "", title: "", badge: "", displayGraph: null }
        : null
      );
    } else {
      state.answer = [];
    }

    state.corrected = false;
    renderAnswer();
    clearOverallBorder();
    syncActionButton();
  }

  function clearCurrentAnswer() {
    if (!isEditingAnswer()) return;
    clearAnswer();
  }

  function addGraphToAnswer(graph, event = null, insertIndex = null) {
    if (!isEditingAnswer()) return;

    const selectedSet = new Set(state.settings.graphOrder);
    if (!selectedSet.has(graph)) return;

    const entry = { graph, injected: false, mark: "", title: "", badge: "", displayGraph: null };

    if (state.settings.mode === "libre") {
      if (insertIndex == null) {
        state.answer.push(entry);
      } else {
        state.answer.splice(insertIndex, 0, entry);
      }
    } else {
      const targetSlot = event?.target?.closest?.(".phono-slot");
      if (targetSlot) {
        const index = parseInt(targetSlot.dataset.idx, 10);
        if (!Number.isFinite(index)) return;
        if (state.answer[index]) return;
        state.answer[index] = entry;
      } else {
        const firstFree = state.answer.findIndex((item) => !item);
        if (firstFree === -1) return;
        state.answer[firstFree] = entry;
      }
    }

    state.corrected = false;
    renderAnswer();
  }

  function removeAt(index) {
    if (!isEditingAnswer()) return;

    if (state.settings.mode === "libre") {
      const entry = state.answer[index];
      if (!entry || entry.injected) return;
      state.answer.splice(index, 1);
    } else {
      const entry = state.answer[index];
      if (!entry || entry.injected) return;
      state.answer[index] = null;
    }

    state.corrected = false;
    renderAnswer();
  }

  function renderAnswer() {
    const dom = ensureDom();
    if (!dom.answerBox || !dom.answerTrack) return;

    dom.answerTrack.innerHTML = "";

    const isSlotsMode = state.settings.mode === "cases";
    dom.answerBox.classList.toggle("is-slots", isSlotsMode);
    dom.answerBox.classList.toggle("is-inline-row", !isSlotsMode);
    dom.answerTrack.classList.toggle("is-slots-track", isSlotsMode);
    dom.answerTrack.classList.toggle("is-inline-track", !isSlotsMode);

    if (isSlotsMode) {
      const slotCount = Math.max(state.answer.length, state.currentQuestion?.units?.length || 0);

      for (let index = 0; index < slotCount; index += 1) {
        const slot = document.createElement("div");
        slot.className = "phono-slot";
        slot.dataset.idx = String(index);

        slot.addEventListener("dragover", (event) => {
          if (!isEditingAnswer()) return;
          event.preventDefault();
          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "copy";
          }
        });

        slot.addEventListener("drop", (event) => {
          if (!isEditingAnswer()) return;
          event.preventDefault();
          const graph = event.dataTransfer?.getData("text/plain");
          if (graph) {
            addGraphToAnswer(graph, event);
          }
        });

        const entry = state.answer[index];
        if (entry) {
          const chip = makeChip(entry, index);
          const visualMark = getVisualMark(entry.mark);
          if (visualMark.slotClass) {
            slot.classList.add(visualMark.slotClass);
          }
          if (visualMark.dotted || entry.injected) {
            slot.classList.add("silent");
          }
          slot.appendChild(chip);
        }

        dom.answerTrack.appendChild(slot);
      }

      queueAnswerScaleUpdate();
      return;
    }

    for (let index = 0; index < state.answer.length; index += 1) {
      dom.answerTrack.appendChild(makeChip(state.answer[index], index));
    }

    queueAnswerScaleUpdate();
  }

  function renderCanonicalAnswer() {
    state.answer = buildCanonicalAnswerEntries(state.currentQuestion);
    renderAnswer();
  }

  function makeChip(entry, index) {
    const chip = document.createElement("div");
    chip.className = "phono-chip";
    chip.dataset.graph = entry.graph;
    chip.dataset.idx = String(index);
    chip.textContent = visibleTextOfGraph(entry.displayGraph ?? entry.graph);

    const visualMark = getVisualMark(entry.mark);
    if (visualMark.chipClass && state.settings.mode !== "cases") {
      chip.classList.add(visualMark.chipClass);
    }

    if (visualMark.dotted || entry.injected) {
      chip.classList.add("dotted");
    }

    if (state.settings.mode === "libre" && !entry.injected) {
      chip.draggable = isEditingAnswer();

      chip.addEventListener("dragstart", (event) => {
        if (!isEditingAnswer()) {
          event.preventDefault();
          return;
        }

        state.dragFromAnswerIndex = index;
        event.dataTransfer?.setData("text/plain", "__MOVE__");
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
        }
        chip.style.opacity = "0.6";
      });

      chip.addEventListener("dragend", () => {
        state.dragFromAnswerIndex = null;
        chip.style.opacity = "";
        hideInsertBar();
      });

      chip.addEventListener("pointerdown", (event) => {
        if (!isEditingAnswer()) return;
        if (event.pointerType === "mouse") return;
        if (state.pointerDrag.active) return;

        event.preventDefault();
        chip.setPointerCapture?.(event.pointerId);
        state.dragFromAnswerIndex = index;

        startPointerDrag({
          kind: "move",
          graph: entry.graph,
          fromIndex: index,
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY
        });

        chip.style.opacity = "0.6";
      });

      chip.addEventListener("pointermove", (event) => {
        if (!isEditingAnswer()) return;
        if (!state.pointerDrag.active || state.pointerDrag.pointerId !== event.pointerId) return;
        event.preventDefault();
        movePointerDrag(event.clientX, event.clientY);
      });

      chip.addEventListener("pointerup", (event) => {
        if (!isEditingAnswer()) return;
        if (!state.pointerDrag.active || state.pointerDrag.pointerId !== event.pointerId) return;
        event.preventDefault();
        chip.style.opacity = "";
        state.dragFromAnswerIndex = null;
        endPointerDrag(event.clientX, event.clientY);
      });

      chip.addEventListener("pointercancel", (event) => {
        if (!isEditingAnswer()) return;
        if (!state.pointerDrag.active || state.pointerDrag.pointerId !== event.pointerId) return;
        event.preventDefault();
        chip.style.opacity = "";
        state.dragFromAnswerIndex = null;
        endPointerDrag(event.clientX, event.clientY);
      });
    }

    if (!entry.injected) {
      chip.addEventListener("click", () => removeAt(index));
    }

    if (entry.title) {
      chip.title = entry.title;
    }

    return chip;
  }

  function evaluateCurrent() {
    if (!state.currentQuestion) return;

    if (state.phaseMode === "answer-manual") {
      requestNextQuestion();
      return;
    }

    if (state.phaseMode === "answer-timed") {
      return;
    }

    const result = evaluateWordAttempt(state.currentQuestion, state.answer, {
      selectedGraphs: state.settings.graphOrder
    });

    const verdict = String(result.verdict || "").trim();
    state.answer = Array.isArray(result.entries) ? result.entries : [];
    state.corrected = verdict === "green";
    renderAnswer();
    setOverallBorder(getOverallBorderKind(verdict));

    if (state.corrected) {
      completeQuestion({ wasCorrect: true });
      return;
    }

    if (shouldShowFinalCorrectionForVerdict(verdict)) {
      captureStudentAnswerSnapshotForFinalCorrection(verdict);
      showFinalCorrection({ wasCorrect: false });
      return;
    }

    syncActionButton();
  }

  function shouldShowFinalCorrectionForVerdict(verdict) {
    if (state.activityMode !== "individual") {
      return false;
    }

    const mode = state.settings.individualValidationMode || INDIVIDUAL_VALIDATION_MODES.UNLIMITED;

    if (mode === INDIVIDUAL_VALIDATION_MODES.GRAPHO_TOLERANCE) {
      return verdict === "red";
    }

    if (mode === INDIVIDUAL_VALIDATION_MODES.LIMITED_ATTEMPTS) {
      state.validationAttempts += 1;
      return state.validationAttempts >= Math.max(1, Number(state.settings.individualMaxAttempts) || 1);
    }

    return false;
  }

  function completeQuestion({ wasCorrect }) {
    const manualAnswer = shouldUseManualAnswerPhase();
    const requested = requestAnswerPhase({
      manual: manualAnswer,
      showAnswerNow: true,
      wasCorrect
    });

    if (!requested) {
      state.phaseMode = manualAnswer ? "answer-manual" : "answer-timed";
    }

    syncActionButton();
  }

  function showFinalCorrection({ wasCorrect }) {
    state.phaseMode = shouldUseManualAnswerPhase() ? "answer-manual" : "answer-timed";
    state.answerDisplayMode = "correction";
    renderCanonicalAnswer();
    setOverallBorder(wasCorrect ? "good" : "bad");
    state.corrected = wasCorrect === true;
    completeQuestion({ wasCorrect });
  }

  function captureStudentAnswerSnapshotForFinalCorrection(verdict) {
    if (!canExposeFinalCorrectionToggle()) {
      return;
    }

    state.studentAnswerSnapshot = {
      entries: cloneAnswerEntries(state.answer),
      verdict: String(verdict || "").trim()
    };
    state.answerDisplayMode = "correction";
    state.shellToggleAvailable = true;
  }

  function canExposeFinalCorrectionToggle() {
    return state.activityMode === "individual"
      && !!state.currentQuestion
      && isFinalCorrectionToggleValidationMode(state.settings.individualValidationMode || INDIVIDUAL_VALIDATION_MODES.UNLIMITED);
  }

  function getAnswerDisplayStateForShell() {
    const canToggle = canToggleStudentAnswerDisplay();
    return {
      canToggle,
      mode: canToggle ? normalizeAnswerDisplayMode(state.answerDisplayMode) : "correction"
    };
  }

  function applyAnswerDisplayModeForShell(mode) {
    if (!canToggleStudentAnswerDisplay()) {
      state.answerDisplayMode = "correction";
      if (isAnswerDisplayPhase() && state.currentQuestion) {
        renderCanonicalAnswer();
        setOverallBorder(getOverallBorderKind(state.corrected === true ? "green" : "red"));
      }
      return false;
    }

    state.answerDisplayMode = normalizeAnswerDisplayMode(mode);
    renderDisplayedAnswerMode();
    return true;
  }

  function canToggleStudentAnswerDisplay() {
    return state.activityMode === "individual"
      && isAnswerDisplayPhase()
      && state.shellToggleAvailable === true
      && !!state.currentQuestion
      && !!state.studentAnswerSnapshot
      && isFinalCorrectionToggleValidationMode(state.settings.individualValidationMode || INDIVIDUAL_VALIDATION_MODES.UNLIMITED);
  }

  function isAnswerDisplayPhase() {
    return state.phaseMode === "answer-manual" || state.phaseMode === "answer-timed";
  }

  function renderDisplayedAnswerMode() {
    const showStudentAnswer = canToggleStudentAnswerDisplay()
      && normalizeAnswerDisplayMode(state.answerDisplayMode) === "student";

    if (showStudentAnswer) {
      state.answer = cloneAnswerEntries(state.studentAnswerSnapshot.entries);
      renderAnswer();
      setOverallBorder(getOverallBorderKind(state.studentAnswerSnapshot.verdict));
    } else {
      renderCanonicalAnswer();
      setOverallBorder("bad");
    }

    state.dom.answerBox?.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
  }

  function setupAnswerScaleHandling() {
    const box = state.dom.answerBox;
    if (!box || box.dataset.scaleReady === "1") return;

    box.dataset.scaleReady = "1";

    state.onWindowResize = () => queueAnswerScaleUpdate();
    window.addEventListener("resize", state.onWindowResize, { passive: true });

    if (typeof ResizeObserver === "function") {
      state.answerScaleObserver = new ResizeObserver(() => {
        queueAnswerScaleUpdate();
      });
      state.answerScaleObserver.observe(box);
    }

    document.fonts?.ready
      ?.then(() => queueAnswerScaleUpdate())
      ?.catch?.(() => {});

    queueAnswerScaleUpdate();
  }

  function queueAnswerScaleUpdate() {
    if (state.answerScaleRaf) {
      cancelAnimationFrame(state.answerScaleRaf);
    }

    state.answerScaleRaf = requestAnimationFrame(() => {
      state.answerScaleRaf = 0;
      applyAnswerScale();
    });
  }

  function applyAnswerScale() {
    const box = state.dom.answerBox;
    const track = state.dom.answerTrack;
    if (!box || !track) return;

    track.style.transform = "scale(1)";

    if (state.settings.mode === "cases") {
      return;
    }

    const chipCount = track.querySelectorAll(".phono-chip").length;
    if (!chipCount) {
      return;
    }

    const boxStyles = window.getComputedStyle(box);
    const paddingLeft = parseFloat(boxStyles.paddingLeft) || 0;
    const paddingRight = parseFloat(boxStyles.paddingRight) || 0;
    const availableWidth = Math.max(0, box.clientWidth - paddingLeft - paddingRight - 2);
    const naturalWidth = Math.ceil(track.scrollWidth);
    if (!availableWidth || !naturalWidth) {
      return;
    }

    const scale = Math.max(0.01, Math.min(1, availableWidth / naturalWidth));
    track.style.transform = `scale(${scale})`;
  }

  function setupAnswerDrop() {
    const dom = ensureDom();
    if (!dom.answerBox || dom.answerBox.dataset.dropReady === "1") return;

    dom.answerBox.dataset.dropReady = "1";

    dom.answerBox.addEventListener("dragover", (event) => {
      if (!isEditingAnswer()) return;

      event.preventDefault();
      const payload = event.dataTransfer?.getData("text/plain");
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = payload === "__MOVE__" ? "move" : "copy";
      }

      if (state.settings.mode !== "libre") return;
      const index = getInsertIndexFromPointer(dom.answerBox, event.clientX, event.clientY);
      showInsertBarAt(dom.answerBox, index);
    });

    dom.answerBox.addEventListener("dragleave", (event) => {
      if (event.target === dom.answerBox) {
        hideInsertBar();
      }
    });

    dom.answerBox.addEventListener("drop", (event) => {
      if (!isEditingAnswer()) return;

      event.preventDefault();
      const payload = event.dataTransfer?.getData("text/plain");
      hideInsertBar();

      if (!payload) return;

      if (state.settings.mode === "libre") {
        const index = getInsertIndexFromPointer(dom.answerBox, event.clientX, event.clientY);

        if (payload === "__MOVE__" && state.dragFromAnswerIndex != null) {
          const from = state.dragFromAnswerIndex;
          const moving = state.answer[from];
          if (!moving || moving.injected) return;

          const item = state.answer.splice(from, 1)[0];
          const targetIndex = index > from ? index - 1 : index;
          state.answer.splice(targetIndex, 0, item);
          renderAnswer();
          return;
        }

        addGraphToAnswer(payload, event, index);
        return;
      }

      addGraphToAnswer(payload, event);
    });
  }

  function getVisualMark(mark) {
    switch (String(mark || "").trim()) {
      case "green":
        return { chipClass: "good", slotClass: "good", dotted: false };
      case "orange":
        return { chipClass: "warn", slotClass: "warn", dotted: false };
      case "red":
        return { chipClass: "bad", slotClass: "bad", dotted: false };
      case "green-dotted":
        return { chipClass: "good", slotClass: "good", dotted: true };
      case "red-placeholder":
        return { chipClass: "bad", slotClass: "bad", dotted: true };
      default:
        return { chipClass: "", slotClass: "", dotted: false };
    }
  }

  function getOverallBorderKind(verdict) {
    switch (String(verdict || "").trim()) {
      case "green":
        return "good";
      case "orange":
        return "warn";
      case "red":
        return "bad";
      default:
        return "";
    }
  }

  function clearOverallBorder() {
    state.dom.answerBox?.classList.remove("overall-good", "overall-warn", "overall-bad");
  }

  function setOverallBorder(kind) {
    clearOverallBorder();
    if (!kind || !state.dom.answerBox) return;
    state.dom.answerBox.classList.add(`overall-${kind}`);
  }

  function shouldUseManualAnswerPhase() {
    return !!(state.sessionItem?.infiniteTimePerQ || state.sessionItem?.infiniteAnswerTime);
  }

  function syncActionButton() {
    const button = state.dom.btnCheck;
    const clearButton = state.dom.btnClear;
    const manual = state.phaseMode === "answer-manual";
    const timed = state.phaseMode === "answer-timed";
    const activeQuestion = isEditingAnswer();

    if (button) {
      button.textContent = manual ? "Nouveau mot" : "Vérifier";
      button.classList.toggle("is-answer-manual", manual);
      button.classList.toggle("is-answer-timed", timed);
      button.disabled = timed;
    }

    if (clearButton) {
      clearButton.disabled = !activeQuestion;
      clearButton.classList.toggle("is-disabled-phase", !activeQuestion);
    }

    state.latestContext?.services?.notifyValidationStateChanged?.();
  }

  function getGraphImageUrl(graph) {
    return new URL(`./assets/graphs/${getGraphFilename(graph)}`, import.meta.url).href;
  }

  function makeDragChip(graph) {
    const element = document.createElement("div");
    element.className = "phono-chip good";
    element.textContent = visibleTextOfGraph(graph);
    element.style.position = "absolute";
    element.style.left = "-9999px";
    element.style.top = "-9999px";
    return element;
  }

  function createInsertBar() {
    const element = document.createElement("div");
    element.className = "phono-insert-indicator";
    return element;
  }

  function getInsertBar() {
    if (!state.insertBar) {
      state.insertBar = createInsertBar();
    }
    return state.insertBar;
  }

  function showInsertBarAt(box, index) {
    const indicator = getInsertBar();
    const host = state.dom.answerTrack || box;
    const chips = Array.from(host.querySelectorAll(".phono-chip"));

    if (index <= 0) {
      host.insertBefore(indicator, chips[0] || null);
      return;
    }

    if (index >= chips.length) {
      host.appendChild(indicator);
      return;
    }

    host.insertBefore(indicator, chips[index]);
  }

  function hideInsertBar() {
    if (state.insertBar?.parentNode) {
      state.insertBar.parentNode.removeChild(state.insertBar);
    }
  }

  function getInsertIndexFromPointer(box, x, y) {
    const chips = Array.from(box.querySelectorAll(".phono-chip"));
    if (!chips.length) return 0;

    let bestLine = null;
    let bestDistance = Infinity;

    for (const chip of chips) {
      const rect = chip.getBoundingClientRect();
      const centerY = (rect.top + rect.bottom) / 2;
      const distance = Math.abs(y - centerY);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestLine = centerY;
      }
    }

    const lineChips = chips
      .map((chip, index) => ({ chip, index, rect: chip.getBoundingClientRect() }))
      .filter((item) => Math.abs(((item.rect.top + item.rect.bottom) / 2) - bestLine) < 18)
      .sort((a, b) => a.rect.left - b.rect.left);

    if (!lineChips.length) return chips.length;

    for (const item of lineChips) {
      const midpoint = (item.rect.left + item.rect.right) / 2;
      if (x < midpoint) return item.index;
    }

    return lineChips[lineChips.length - 1].index + 1;
  }

  function openImageOverlay() {
    if (!state.dom.wordImage?.src) return;
    state.dom.imageOverlayImg.src = state.dom.wordImage.src;
    state.dom.imageOverlayImg.alt = state.dom.wordImage.alt || "";
    state.dom.imageOverlay?.classList.remove("hidden");
    state.dom.imageOverlay?.setAttribute("aria-hidden", "false");
  }

  function closeImageOverlay() {
    state.dom.imageOverlay?.classList.add("hidden");
    state.dom.imageOverlay?.setAttribute("aria-hidden", "true");
    if (state.dom.imageOverlayImg) {
      state.dom.imageOverlayImg.src = "";
      state.dom.imageOverlayImg.alt = "";
    }
  }

  function beginPendingLibraryTouch(graph, pointerId, x, y) {
    state.pendingLibraryTouch = {
      active: true,
      graph,
      pointerId,
      startX: x,
      startY: y
    };
  }

  function resetPendingLibraryTouch() {
    state.pendingLibraryTouch = createPendingLibraryTouch();
  }

  function shouldSuppressLibraryClick() {
    return Date.now() < state.suppressLibraryClickUntil;
  }

  function suppressNextLibraryClick() {
    state.suppressLibraryClickUntil = Date.now() + 400;
  }

  function handleGlobalPointerMoveForLibrary(event) {
    const pending = state.pendingLibraryTouch;

    if (pending.active && pending.pointerId === event.pointerId) {
      const dx = event.clientX - pending.startX;
      const dy = event.clientY - pending.startY;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);

      if (ady >= LIBRARY_SCROLL_LOCK_THRESHOLD && ady > adx) {
        resetPendingLibraryTouch();
        return;
      }

      if (Math.hypot(dx, dy) >= LIBRARY_DRAG_INTENT_THRESHOLD) {
        event.preventDefault();
        startPointerDrag({
          kind: "lib",
          graph: pending.graph,
          fromIndex: null,
          pointerId: event.pointerId,
          x: pending.startX,
          y: pending.startY
        });
        resetPendingLibraryTouch();
        movePointerDrag(event.clientX, event.clientY);
        suppressNextLibraryClick();
        return;
      }
    }

    if (state.pointerDrag.active && state.pointerDrag.kind === "lib" && state.pointerDrag.pointerId === event.pointerId) {
      event.preventDefault();
      movePointerDrag(event.clientX, event.clientY);
    }
  }

  function handleGlobalPointerUpForLibrary(event) {
    if (state.pendingLibraryTouch.active && state.pendingLibraryTouch.pointerId === event.pointerId) {
      resetPendingLibraryTouch();
      return;
    }

    if (state.pointerDrag.active && state.pointerDrag.kind === "lib" && state.pointerDrag.pointerId === event.pointerId) {
      event.preventDefault();
      endPointerDrag(event.clientX, event.clientY);
    }
  }

  function handleGlobalPointerCancelForLibrary(event) {
    if (state.pendingLibraryTouch.active && state.pendingLibraryTouch.pointerId === event.pointerId) {
      resetPendingLibraryTouch();
      return;
    }

    if (state.pointerDrag.active && state.pointerDrag.kind === "lib" && state.pointerDrag.pointerId === event.pointerId) {
      releaseDragState();
    }
  }

  function startPointerDrag({ kind, graph, fromIndex, pointerId, x, y }) {
    state.pointerDrag.active = true;
    state.pointerDrag.moved = false;
    state.pointerDrag.kind = kind;
    state.pointerDrag.graph = graph;
    state.pointerDrag.fromIndex = fromIndex ?? null;
    state.pointerDrag.pointerId = pointerId;
    state.pointerDrag.startX = x;
    state.pointerDrag.startY = y;
    state.pointerDrag.ghost = makeDragChip(graph);
    state.pointerDrag.ghost.classList.add("drag-ghost");
    document.body.appendChild(state.pointerDrag.ghost);
    updateGhost(x, y);
  }

  function updateGhost(x, y) {
    const ghost = state.pointerDrag.ghost;
    if (!ghost) return;
    ghost.style.left = `${x}px`;
    ghost.style.top = `${y}px`;
  }

  function movePointerDrag(x, y) {
    if (!state.pointerDrag.active) return;

    if (!state.pointerDrag.moved) {
      const dx = x - state.pointerDrag.startX;
      const dy = y - state.pointerDrag.startY;
      if (Math.hypot(dx, dy) >= TOUCH_DRAG_THRESHOLD) {
        state.pointerDrag.moved = true;
      }
    }

    updateGhost(x, y);

    if (state.settings.mode === "libre") {
      if (isOverAnswerBox(x, y)) {
        const index = getInsertIndexFromPointer(state.dom.answerBox, x, y);
        showInsertBarAt(state.dom.answerBox, index);
      } else {
        hideInsertBar();
      }
    }
  }

  function endPointerDrag(x, y) {
    if (!state.pointerDrag.active) return;

    const moved = state.pointerDrag.moved;
    const kind = state.pointerDrag.kind;
    const graph = state.pointerDrag.graph;
    const fromIndex = state.pointerDrag.fromIndex;

    releaseDragState();

    if (!moved || !isEditingAnswer()) return;

    if (state.settings.mode === "libre") {
      if (!isOverAnswerBox(x, y)) return;
      const index = getInsertIndexFromPointer(state.dom.answerBox, x, y);

      if (kind === "move" && typeof fromIndex === "number") {
        const moving = state.answer[fromIndex];
        if (!moving || moving.injected) return;

        const item = state.answer.splice(fromIndex, 1)[0];
        const targetIndex = index > fromIndex ? index - 1 : index;
        state.answer.splice(targetIndex, 0, item);
        renderAnswer();
        return;
      }

      addGraphToAnswer(graph, null, index);
      return;
    }

    const slot = slotFromPoint(x, y);
    if (slot) {
      addGraphToAnswer(graph, { target: slot });
    } else {
      addGraphToAnswer(graph, null);
    }
  }

  function isOverAnswerBox(x, y) {
    const element = document.elementFromPoint(x, y);
    return !!element?.closest?.("#phono_answerBox");
  }

  function slotFromPoint(x, y) {
    const element = document.elementFromPoint(x, y);
    return element?.closest?.(".phono-slot") ?? null;
  }

  function releaseDragState() {
    hideInsertBar();

    if (state.pointerDrag.ghost?.parentNode) {
      state.pointerDrag.ghost.remove();
    }

    state.pointerDrag = createPointerDrag();
    state.dragFromAnswerIndex = null;
  }

  function isEditingAnswer() {
    return state.phaseMode === "question-active";
  }

  function updatePromptDisplay() {
    const prompt = String(state.currentQuestion?.prompt || "").trim() || (state.currentQuestion ? QUESTION_PROMPT : "");
    const text = resolveQuestionInstructionText(state.latestContext, prompt, QUESTION_PROMPT);
    setToolInstructionText(state.dom.prompt, text);
  }

  function requestAnswerPhase(options = {}) {
    const service = state.latestContext?.services?.requestAnswerPhase;
    if (typeof service === "function") {
      return service(options);
    }

    const fallback = state.sessionControls?.requestAnswerPhase;
    return typeof fallback === "function" ? fallback(options) : false;
  }

  function requestNextQuestion() {
    const service = state.latestContext?.services?.requestNextQuestion;
    if (typeof service === "function") {
      return service();
    }

    const fallback = state.sessionControls?.requestNextQuestion;
    return typeof fallback === "function" ? fallback() : false;
  }

  function teardownRuntime(container) {
    releaseDragState();
    resetPendingLibraryTouch();

    if (state.globalHandlersBound) {
      document.removeEventListener("pointermove", state.onGlobalPointerMove, { passive: false });
      document.removeEventListener("pointerup", state.onGlobalPointerUp, { passive: false });
      document.removeEventListener("pointercancel", state.onGlobalPointerCancel, { passive: false });
    }

    if (state.answerScaleObserver) {
      state.answerScaleObserver.disconnect();
      state.answerScaleObserver = null;
    }

    if (state.answerScaleRaf) {
      cancelAnimationFrame(state.answerScaleRaf);
      state.answerScaleRaf = 0;
    }

    if (state.onWindowResize) {
      window.removeEventListener("resize", state.onWindowResize);
      state.onWindowResize = null;
    }

    if (container) {
      container.innerHTML = "";
    }
  }
}
