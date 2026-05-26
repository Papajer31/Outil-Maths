import {
  INPUT_MODES,
  LENGTH_HINT_MODES,
  normalizeSettings,
  INDIVIDUAL_VALIDATION_MODES,
  pickQuestion,
  questionKey,
  visibleTextOfGraph,
  evaluateWordAttempt,
  evaluateLetterAttempt,
  buildStudentGraphTiles,
  getGraphImageUrl,
  getGraphFallbackDisplay,
  getGraphLabel,
  getLetterChoicesForQuestion,
  getLetterImageUrl,
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
const FAMILY_CYCLE_MS = 5000;
const FAMILY_FADE_MS = 1000;

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




function usesShellValidationMode(context = {}) {
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
    responseUi: getResponseUi(initialContext),
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
    suppressLibraryClickOnce: false,
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
    insertBar: null,
    familyCycleTimers: new Map(),
    openFamilyPopup: null,
    onDocumentPointerDownFamily: null,
    onDocumentClickFamily: null
  };
}

function syncRuntimeState(state, context = state.latestContext) {
  const nextContext = context ?? state.latestContext ?? {};

  state.latestContext = nextContext;
  state.responseUi = getResponseUi(nextContext);
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

      if (!state.dom.root || !state.dom.root.isConnected || state.dom.root.dataset.responseUi !== state.responseUi) {
        renderShell();
        bindStaticEvents();
      }

      const nextQuestion = pickQuestion(state.settings, { avoidKey: state.lastQuestionId });
      if (!nextQuestion) {
        throw new Error(state.settings.inputMode === INPUT_MODES.LETTERS
          ? "Aucun mot jouable pour cette activité."
          : "Aucun mot jouable avec les graphèmes sélectionnés pour cette activité.");
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

      if (!state.dom.root || !state.dom.root.isConnected || state.dom.root.dataset.responseUi !== state.responseUi) {
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
    const isBoxedResponse = state.responseUi === "boxed";
    closeFamilyPopup();
    clearFamilyCycleTimers();
    resetAnswerScaleHandling();

    container.innerHTML = `
      <div class="phono-root${isBoxedResponse ? "" : " is-response-free"}" data-response-ui="${isBoxedResponse ? "boxed" : "free"}">
        ${renderToolInstruction({ id: "phono_prompt" })}
        <div class="phono-layout">
          <section class="phono-top-zone">
            <div class="phono-panel phono-image-panel">
              <img id="phono_wordImage" class="phono-word-image" alt="">
            </div>

            ${isBoxedResponse ? `
              <div id="phono_answerBox" class="phono-answer" aria-label="Boite de réponse">
                <div id="phono_answerTrack" class="phono-answer-track"></div>
              </div>

              <div class="phono-action-col">
                <button id="phono_btnClear" class="phono-btn phono-btn-secondary phono-btn-clear-side" type="button" aria-label="Effacer la réponse" title="Effacer"><span class="phono-material-icon" aria-hidden="true">delete</span></button>
              </div>
            ` : `
              <div id="phono_answerBox" class="phono-answer phono-answer-correction-only" aria-label="Correction">
                <div id="phono_answerTrack" class="phono-answer-track"></div>
              </div>
            `}
          </section>

          ${isBoxedResponse ? `
            <section class="phono-bottom-zone">
              <div class="phono-panel phono-library-panel">
                <div id="phono_graphLibrary" class="phono-library"></div>
              </div>
            </section>
          ` : ""}
        </div>

        <div id="phono_imageOverlay" class="phono-image-overlay hidden" aria-hidden="true">
          <img id="phono_imageOverlayImg" alt="">
        </div>
      </div>
    `;

    ensureDom();
    updatePromptDisplay();
    syncPhaseClasses();
  }

  function bindStaticEvents() {
    const dom = ensureDom();

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
      state.onDocumentPointerDownFamily = (event) => {
        if (!state.openFamilyPopup) return;
        const target = event.target;
        if (state.openFamilyPopup.popup?.contains(target) || state.openFamilyPopup.tile?.contains(target)) {
          return;
        }

        const isLibraryTap = !!target?.closest?.("#phono_graphLibrary");
        if (isLibraryTap) {
          event.preventDefault();
          event.stopPropagation();
          suppressNextLibraryClick();
        }

        closeFamilyPopup();
      };
      state.onDocumentClickFamily = (event) => {
        const target = event.target;
        if (!target?.closest?.("#phono_graphLibrary")) return;
        if (!shouldSuppressLibraryClick({ consume: true })) return;

        event.preventDefault();
        event.stopPropagation();
      };
      document.addEventListener("pointerdown", state.onDocumentPointerDownFamily, true);
      document.addEventListener("click", state.onDocumentClickFamily, true);
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

    closeFamilyPopup();
    clearFamilyCycleTimers();

    if (state.responseUi !== "boxed") {
      dom.graphLibrary.innerHTML = "";
      return;
    }

    dom.graphLibrary.innerHTML = "";

    if (state.settings.inputMode === INPUT_MODES.LETTERS) {
      const letters = getLetterChoicesForQuestion(state.currentQuestion);
      dom.graphLibrary.style.setProperty("--phono-library-cols", String(getLibraryColumnCount(letters.length)));
      for (const letter of letters) {
        dom.graphLibrary.appendChild(createLetterLibraryTile(letter));
      }
      return;
    }

    const tiles = buildStudentGraphTiles(state.settings.graphOrder);
    dom.graphLibrary.style.setProperty("--phono-library-cols", String(getLibraryColumnCount(tiles.length)));

    tiles.forEach((tileModel, index) => {
      if (tileModel.type === "family") {
        dom.graphLibrary.appendChild(createFamilyLibraryTile(tileModel, index));
      } else {
        dom.graphLibrary.appendChild(createGraphLibraryTile(tileModel.units[0]));
      }
    });
  }

  function createGraphLibraryTile(unit) {
    const graph = String(unit?.id || "").trim();
    const tile = document.createElement("div");
    tile.className = "phono-tile";
    tile.dataset.graph = graph;
    tile.draggable = true;

    const btn = document.createElement("div");
    btn.className = "phono-tile-btn";
    btn.appendChild(createGraphVisual(graph, [graph]));
    tile.appendChild(btn);

    tile.addEventListener("click", (event) => {
      if (!isEditingAnswer()) return;
      if (shouldSuppressLibraryClick({ consume: true })) {
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

      event.dataTransfer?.setData("text/plain", serializeUnitPayload("graph", graph));
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "copy";
      }

      const dragEl = makeDragChip({ type: "graph", id: graph });
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

    return tile;
  }

  function createLetterLibraryTile(letter) {
    const safeLetter = String(letter || "").trim();
    const tile = document.createElement("div");
    tile.className = "phono-tile phono-letter-tile";
    tile.dataset.letter = safeLetter;
    tile.draggable = true;

    const btn = document.createElement("div");
    btn.className = "phono-tile-btn";
    btn.appendChild(createLetterVisual(safeLetter));
    tile.appendChild(btn);

    tile.addEventListener("click", (event) => {
      if (!isEditingAnswer()) return;
      if (shouldSuppressLibraryClick({ consume: true })) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      addLetterToAnswer(safeLetter);
    });

    tile.addEventListener("dragstart", (event) => {
      if (!isEditingAnswer()) {
        event.preventDefault();
        return;
      }

      event.dataTransfer?.setData("text/plain", serializeUnitPayload("letter", safeLetter));
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "copy";
      }

      const dragEl = makeDragChip({ type: "letter", id: safeLetter });
      document.body.appendChild(dragEl);
      event.dataTransfer?.setDragImage(dragEl, dragEl.offsetWidth / 2, dragEl.offsetHeight / 2);
      requestAnimationFrame(() => dragEl.remove());
    });

    tile.addEventListener("pointerdown", (event) => {
      if (!isEditingAnswer()) return;
      if (event.pointerType === "mouse") return;
      if (state.pointerDrag.active || state.pendingLibraryTouch.active) return;
      beginPendingLibraryTouch(safeLetter, event.pointerId, event.clientX, event.clientY);
    });

    return tile;
  }

  function createFamilyLibraryTile(tileModel, index) {
    const activeIds = tileModel.units.map((unit) => unit.id);
    const tile = document.createElement("div");
    tile.className = "phono-tile phono-family-tile";
    tile.dataset.family = tileModel.family;
    tile.dataset.familyIndex = "0";
    tile.setAttribute("role", "button");
    tile.tabIndex = 0;
    tile.setAttribute("aria-label", `Choisir un graphème de la famille ${tileModel.family}`);

    const stack = document.createElement("div");
    stack.className = "phono-family-stack";

    const card = document.createElement("div");
    card.className = "phono-family-card is-top";
    const initialLayer = createFamilyVisualLayer(activeIds[0], activeIds, "current");
    card.appendChild(initialLayer);
    stack.appendChild(card);

    tile.appendChild(stack);

    const open = (event) => {
      if (!isEditingAnswer()) return;
      if (shouldSuppressLibraryClick({ consume: true })) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        return;
      }
      event?.preventDefault?.();
      event?.stopPropagation?.();
      openFamilyPopup(tile, tileModel);
    };

    tile.addEventListener("click", open);
    tile.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        open(event);
      }
    });

    scheduleFamilyCycle(tile, tileModel, index);
    return tile;
  }

  function createGraphVisual(graph, activeIds = []) {
    const visual = document.createElement("span");
    visual.className = "phono-unit-visual";

    const imageUrl = getGraphImageUrl(graph);
    if (imageUrl) {
      const image = document.createElement("img");
      image.alt = getGraphLabel(graph);
      image.draggable = false;
      image.addEventListener("error", () => {
        image.hidden = true;
        visual.classList.add("is-fallback");
      }, { once: true });
      image.src = imageUrl;
      visual.appendChild(image);
    } else {
      visual.classList.add("is-fallback");
    }

    visual.appendChild(createGraphFallback(graph, activeIds));
    return visual;
  }

  function createFamilyVisualLayer(graph, activeIds = [], kind = "current") {
    const layer = document.createElement("span");
    layer.className = `phono-family-visual-layer is-${kind}`;
    layer.appendChild(createGraphVisual(graph, activeIds));
    return layer;
  }

  function createGraphFallback(graph, activeIds = []) {
    const display = getGraphFallbackDisplay(graph, activeIds);
    const fallback = document.createElement("span");
    fallback.className = "phono-unit-fallback";
    fallback.dataset.unitSize = getUnitSizeBucket(display.label);

    const label = document.createElement("span");
    label.textContent = display.label;
    fallback.appendChild(label);

    if (display.subLabel) {
      const sub = document.createElement("span");
      sub.className = "phono-unit-fallback-sub";
      sub.textContent = display.subLabel;
      fallback.appendChild(sub);
    }

    return fallback;
  }

  function createLetterVisual(letter) {
    const safeLetter = String(letter || "").trim();
    const visual = document.createElement("span");
    visual.className = "phono-unit-visual phono-letter-visual";

    const imageUrl = getLetterImageUrl(safeLetter);
    if (imageUrl) {
      const image = document.createElement("img");
      image.alt = safeLetter;
      image.draggable = false;
      image.addEventListener("error", () => {
        image.hidden = true;
        visual.classList.add("is-fallback");
      }, { once: true });
      image.src = imageUrl;
      visual.appendChild(image);
    } else {
      visual.classList.add("is-fallback");
    }

    const fallback = document.createElement("span");
    fallback.className = "phono-unit-fallback";
    fallback.textContent = safeLetter;
    visual.appendChild(fallback);

    return visual;
  }

  function scheduleFamilyCycle(tile, tileModel, tileIndex) {
    const units = Array.isArray(tileModel?.units) ? tileModel.units : [];
    if (units.length < 2) return;

    const interval = window.setInterval(() => {
      advanceFamilyTile(tile, tileModel);
    }, FAMILY_CYCLE_MS);

    state.familyCycleTimers.set(tile, { timeout: 0, interval });
  }

  function advanceFamilyTile(tile, tileModel) {
    if (!tile?.isConnected) return;
    if (state.openFamilyPopup?.family === tileModel.family) return;

    const units = Array.isArray(tileModel?.units) ? tileModel.units : [];
    if (units.length < 2) return;

    const activeIds = units.map((unit) => unit.id);
    const current = Number(tile.dataset.familyIndex || 0);
    const next = (Number.isFinite(current) ? current + 1 : 1) % units.length;
    tile.dataset.familyIndex = String(next);

    const topCard = tile.querySelector(".phono-family-card.is-top");
    if (!topCard) return;

    const previousLayers = topCard.querySelectorAll(".phono-family-visual-layer.is-next");
    previousLayers.forEach((layer) => layer.remove());

    const currentLayer = topCard.querySelector(".phono-family-visual-layer.is-current");
    const nextLayer = createFamilyVisualLayer(units[next].id, activeIds, "next");
    nextLayer.style.setProperty("--phono-family-fade-duration", `${FAMILY_FADE_MS}ms`);
    currentLayer?.style.setProperty("--phono-family-fade-duration", `${FAMILY_FADE_MS}ms`);
    topCard.appendChild(nextLayer);

    requestAnimationFrame(() => {
      nextLayer.getBoundingClientRect();
      nextLayer.classList.add("is-visible");
      currentLayer?.classList.add("is-fading");
    });

    window.setTimeout(() => {
      nextLayer.classList.remove("is-next", "is-visible");
      nextLayer.classList.add("is-current");
      currentLayer?.remove();
    }, FAMILY_FADE_MS + 120);
  }

  function clearFamilyCycleTimers() {
    for (const timer of state.familyCycleTimers.values()) {
      if (timer.timeout) window.clearTimeout(timer.timeout);
      if (timer.interval) window.clearInterval(timer.interval);
    }
    state.familyCycleTimers.clear();
  }

  function openFamilyPopup(tile, tileModel) {
    if (!tile || !tileModel) return;
    closeFamilyPopup();

    const activeIds = tileModel.units.map((unit) => unit.id);
    const tileRect = tile.getBoundingClientRect();
    const popupCols = getFamilyPopupColumnCount(tileModel.units.length, tileRect.width);

    tile.classList.add("is-open");
    state.dom.graphLibrary?.classList.add("is-family-popup-open");

    const popup = document.createElement("div");
    popup.className = "phono-family-popup";
    popup.dataset.family = tileModel.family;
    popup.style.setProperty("--phono-popup-cols", String(popupCols));
    popup.style.setProperty("--phono-popup-tile-width", `${Math.max(1, tileRect.width)}px`);
    popup.style.setProperty("--phono-popup-tile-height", `${Math.max(1, tileRect.height)}px`);

    const grid = document.createElement("div");
    grid.className = "phono-family-popup-grid";

    tileModel.units.forEach((unit) => {
      const choice = document.createElement("button");
      choice.className = "phono-family-choice";
      choice.type = "button";
      choice.setAttribute("aria-label", getGraphLabel(unit.id));
      choice.appendChild(createGraphVisual(unit.id, activeIds));
      choice.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        addGraphToAnswer(unit.id);
        closeFamilyPopup();
      });
      grid.appendChild(choice);
    });

    popup.appendChild(grid);
    state.dom.root?.appendChild(popup);
    positionFamilyPopup(popup, tile);

    state.openFamilyPopup = {
      family: tileModel.family,
      tile,
      popup
    };
  }

  function positionFamilyPopup(popup, tile) {
    const root = state.dom.root;
    if (!root || !popup || !tile) return;

    const rootRect = root.getBoundingClientRect();
    const tileRect = tile.getBoundingClientRect();
    const gap = 8;

    let left = tileRect.left - rootRect.left;
    let top = tileRect.bottom - rootRect.top + gap;

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;

    const popupRect = popup.getBoundingClientRect();
    left = clamp(left, gap, Math.max(gap, rootRect.width - popupRect.width - gap));

    if (top + popupRect.height > rootRect.height - gap) {
      top = tileRect.top - rootRect.top - popupRect.height - gap;
    }
    top = clamp(top, gap, Math.max(gap, rootRect.height - popupRect.height - gap));

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  }

  function getFamilyPopupColumnCount(unitCount, tileWidth) {
    const safeCount = Math.max(1, Number(unitCount) || 1);
    const desiredCols = safeCount > 5 ? Math.ceil(safeCount / 2) : safeCount;
    const rootWidth = state.dom.root?.getBoundingClientRect?.().width || 0;
    const safeTileWidth = Math.max(1, Number(tileWidth) || 1);
    const gap = 8;
    const horizontalChrome = 28;
    const availableWidth = Math.max(safeTileWidth, rootWidth - horizontalChrome);
    const maxCols = Math.max(1, Math.floor((availableWidth + gap) / (safeTileWidth + gap)));

    return Math.max(1, Math.min(desiredCols, maxCols, safeCount));
  }

  function closeFamilyPopup() {
    if (state.openFamilyPopup?.tile) {
      state.openFamilyPopup.tile.classList.remove("is-open");
    }
    state.dom.graphLibrary?.classList.remove("is-family-popup-open");
    if (state.openFamilyPopup?.popup?.parentNode) {
      state.openFamilyPopup.popup.remove();
    }
    state.openFamilyPopup = null;
  }

  function clearAnswer() {
    const question = state.currentQuestion;

    if (isSlotsMode()) {
      if (state.settings.inputMode === INPUT_MODES.LETTERS) {
        const letters = buildCanonicalAnswerEntries(question, { inputMode: INPUT_MODES.LETTERS });
        state.answer = letters.map(() => null);
      } else {
        const units = Array.isArray(question?.units) ? question.units : [];
        state.answer = units.map((unit) => unit.isSilent
          ? { type: "graph", id: unit.graph, graph: unit.graph, injected: true, mark: "", title: "", badge: "", displayGraph: null }
          : null
        );
      }
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

  function isSlotsMode() {
    return state.settings.lengthHintMode === LENGTH_HINT_MODES.BOXES;
  }

  function isFreeLengthMode() {
    return state.settings.lengthHintMode !== LENGTH_HINT_MODES.BOXES;
  }

  function getExpectedAnswerLength() {
    if (state.settings.inputMode === INPUT_MODES.LETTERS) {
      return buildCanonicalAnswerEntries(state.currentQuestion, { inputMode: INPUT_MODES.LETTERS }).length;
    }
    return Array.isArray(state.currentQuestion?.units) ? state.currentQuestion.units.length : 0;
  }

  function getEntryDisplayText(entry) {
    if (entry?.type === "letter") {
      return String(entry.displayGraph ?? entry.letter ?? entry.id ?? entry.graph ?? "");
    }
    return visibleTextOfGraph(entry?.displayGraph ?? entry?.graph ?? entry?.id ?? "");
  }

  function getUnitSizeBucket(text) {
    const length = Array.from(String(text || "")).length;
    if (length >= 5) return "long";
    if (length >= 3) return "medium";
    return "short";
  }

  function serializeUnitPayload(type, id) {
    return `${type}:${String(id || "")}`;
  }

  function parseUnitPayload(payload) {
    const raw = String(payload || "").trim();
    if (!raw) return { type: "graph", id: "" };
    if (raw.startsWith("letter:")) return { type: "letter", id: raw.slice(7) };
    if (raw.startsWith("graph:")) return { type: "graph", id: raw.slice(6) };
    return { type: "graph", id: raw };
  }

  function addGraphToAnswer(graph, event = null, insertIndex = null) {
    if (!isEditingAnswer()) return;

    const selectedSet = new Set(state.settings.graphOrder);
    if (!selectedSet.has(graph)) return;

    const entry = { type: "graph", id: graph, graph, injected: false, mark: "", title: "", badge: "", displayGraph: null };
    addEntryToAnswer(entry, event, insertIndex);
  }

  function addLetterToAnswer(letter, event = null, insertIndex = null) {
    if (!isEditingAnswer()) return;
    const safeLetter = String(letter || "").trim();
    if (!safeLetter) return;
    const entry = { type: "letter", id: safeLetter, graph: safeLetter, letter: safeLetter, injected: false, mark: "", title: "", badge: "", displayGraph: null };
    addEntryToAnswer(entry, event, insertIndex);
  }

  function addCurrentInputToAnswer(id, event = null, insertIndex = null) {
    if (state.settings.inputMode === INPUT_MODES.LETTERS) {
      addLetterToAnswer(id, event, insertIndex);
    } else {
      addGraphToAnswer(id, event, insertIndex);
    }
  }

  function addPayloadToAnswer(payload, event = null, insertIndex = null) {
    const unit = parseUnitPayload(payload);
    if (!unit.id) return;
    if (unit.type === "letter") {
      addLetterToAnswer(unit.id, event, insertIndex);
    } else {
      addGraphToAnswer(unit.id, event, insertIndex);
    }
  }

  function addEntryToAnswer(entry, event = null, insertIndex = null) {
    if (isFreeLengthMode()) {
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

    if (isFreeLengthMode()) {
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

    const slotsMode = isSlotsMode();
    dom.answerBox.classList.toggle("is-slots", slotsMode);
    dom.answerBox.classList.toggle("is-inline-row", !slotsMode);
    dom.answerTrack.classList.toggle("is-slots-track", slotsMode);
    dom.answerTrack.classList.toggle("is-inline-track", !slotsMode);

    if (slotsMode) {
      const slotCount = Math.max(state.answer.length, getExpectedAnswerLength());

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
          const payload = event.dataTransfer?.getData("text/plain");
          if (payload) {
            addPayloadToAnswer(payload, event);
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
    state.answer = buildCanonicalAnswerEntries(state.currentQuestion, { inputMode: state.settings.inputMode });
    renderAnswer();
  }

  function makeChip(entry, index) {
    const chip = document.createElement("div");
    chip.className = "phono-chip";
    chip.dataset.graph = entry.graph;
    chip.dataset.idx = String(index);
    const displayText = getEntryDisplayText(entry);
    chip.textContent = displayText;
    chip.dataset.unitSize = getUnitSizeBucket(displayText);

    const visualMark = getVisualMark(entry.mark);
    if (visualMark.chipClass && !isSlotsMode()) {
      chip.classList.add(visualMark.chipClass);
    }

    if (visualMark.dotted || entry.injected) {
      chip.classList.add("dotted");
    }

    if (isFreeLengthMode() && !entry.injected) {
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

    const result = state.settings.inputMode === INPUT_MODES.LETTERS
      ? evaluateLetterAttempt(state.currentQuestion, state.answer, {
        preserveSlots: isSlotsMode()
      })
      : evaluateWordAttempt(state.currentQuestion, state.answer, {
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
    if (state.responseUi !== "boxed") {
      return false;
    }

    const mode = getEffectiveIndividualValidationMode();

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
    return state.responseUi === "boxed"
      && !!state.currentQuestion
      && isFinalCorrectionToggleValidationMode(getEffectiveIndividualValidationMode());
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
    return state.responseUi === "boxed"
      && isAnswerDisplayPhase()
      && state.shellToggleAvailable === true
      && !!state.currentQuestion
      && !!state.studentAnswerSnapshot
      && isFinalCorrectionToggleValidationMode(getEffectiveIndividualValidationMode());
  }

  function getEffectiveIndividualValidationMode() {
    const mode = state.settings.individualValidationMode || INDIVIDUAL_VALIDATION_MODES.UNLIMITED;
    if (state.settings.inputMode === INPUT_MODES.LETTERS && mode === INDIVIDUAL_VALIDATION_MODES.GRAPHO_TOLERANCE) {
      return INDIVIDUAL_VALIDATION_MODES.UNLIMITED;
    }
    return mode;
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

  function resetAnswerScaleHandling() {
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

    if (state.dom.answerBox) {
      delete state.dom.answerBox.dataset.scaleReady;
    }
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

    if (isSlotsMode()) {
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

      if (!isFreeLengthMode()) return;
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

      if (isFreeLengthMode()) {
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

        addPayloadToAnswer(payload, event, index);
        return;
      }

      addPayloadToAnswer(payload, event);
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
    const clearButton = state.dom.btnClear;
    const activeQuestion = isEditingAnswer();

    syncPhaseClasses();
    if (!activeQuestion) {
      closeFamilyPopup();
    }

    if (clearButton) {
      clearButton.disabled = !activeQuestion;
      clearButton.classList.toggle("is-disabled-phase", !activeQuestion);
    }

    if (state.currentQuestion || state.phaseMode !== "question-active") {
      state.latestContext?.services?.notifyValidationStateChanged?.();
    }
  }

  function syncPhaseClasses() {
    const root = state.dom.root;
    if (!root) return;
    const isBoxed = state.responseUi === "boxed";
    const isAnswerPhase = state.phaseMode === "answer-manual" || state.phaseMode === "answer-timed";
    root.classList.toggle("is-response-free", !isBoxed);
    root.classList.toggle("is-response-boxed", isBoxed);
    root.classList.toggle("is-question-active", state.phaseMode === "question-active");
    root.classList.toggle("is-answer-phase", isAnswerPhase);
    root.classList.toggle("is-input-letters", state.settings.inputMode === INPUT_MODES.LETTERS);
    root.classList.toggle("is-input-graphemes", state.settings.inputMode !== INPUT_MODES.LETTERS);
  }

  function makeDragChip(unit) {
    const element = document.createElement("div");
    element.className = "phono-chip good";
    element.textContent = typeof unit === "object"
      ? getEntryDisplayText(unit)
      : visibleTextOfGraph(unit);
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

  function shouldSuppressLibraryClick(options = {}) {
    const shouldSuppress = state.suppressLibraryClickOnce || Date.now() < state.suppressLibraryClickUntil;
    if (shouldSuppress && options.consume) {
      state.suppressLibraryClickOnce = false;
    }
    return shouldSuppress;
  }

  function suppressNextLibraryClick() {
    state.suppressLibraryClickOnce = true;
    state.suppressLibraryClickUntil = Date.now() + 900;
    window.setTimeout(() => {
      if (Date.now() >= state.suppressLibraryClickUntil) {
        state.suppressLibraryClickOnce = false;
      }
    }, 950);
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

    if (isFreeLengthMode()) {
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

    if (isFreeLengthMode()) {
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

      addCurrentInputToAnswer(graph, null, index);
      return;
    }

    const slot = slotFromPoint(x, y);
    if (slot) {
      addCurrentInputToAnswer(graph, { target: slot });
    } else {
      addCurrentInputToAnswer(graph, null);
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
    return state.responseUi === "boxed" && state.phaseMode === "question-active" && !!state.currentQuestion;
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
    closeFamilyPopup();
    clearFamilyCycleTimers();

    if (state.globalHandlersBound) {
      document.removeEventListener("pointermove", state.onGlobalPointerMove, { passive: false });
      document.removeEventListener("pointerup", state.onGlobalPointerUp, { passive: false });
      document.removeEventListener("pointercancel", state.onGlobalPointerCancel, { passive: false });
      if (state.onDocumentPointerDownFamily) {
        document.removeEventListener("pointerdown", state.onDocumentPointerDownFamily, true);
      }
      if (state.onDocumentClickFamily) {
        document.removeEventListener("click", state.onDocumentClickFamily, true);
      }
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
