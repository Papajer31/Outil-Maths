import {
  CLOUD_MODES,
  normalizeSettings,
  setWordCatalog,
  pickQuestion,
  questionKey,
  evaluateAnswer,
  normalizeAnswerIds
} from "./model.js";
import { listPublicPhonologyWords } from "../../shared/public-api.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveQuestionInstructionText,
  setToolInstructionText
} from "../../shared/tool-instruction.js";
import { renderSoundBubble } from "./sound-bubble.js";

let stylesReadyPromise = null;
let phonologyWordCatalogPromise = null;

export function createActivity(initialContext = {}) {
  const state = createRuntimeState(initialContext);

  return {
    async mount(container, context = initialContext) {
      state.container = container;
      syncRuntimeState(state, context ?? state.latestContext);
      await injectActivityStyles();
      await ensurePhonologyWordCatalog();
      renderShell(state);
      bindEvents(state);
      syncValidationState(state);
    },

    async next(container, context = initialContext) {
      state.container = container || state.container;
      if (!state.container) return;

      syncRuntimeState(state, context ?? state.latestContext);
      await injectActivityStyles();
      await ensurePhonologyWordCatalog();

      if (!state.root?.isConnected || state.root?.dataset.responseUi !== state.responseUi) {
        renderShell(state);
        bindEvents(state);
      }

      loadNextQuestion(state);
    },

    showAnswer(container, context = initialContext) {
      state.container = container || state.container;
      syncRuntimeState(state, context ?? state.latestContext);
      if (!state.container || !state.currentQuestion) return;

      if (!state.root?.isConnected || state.root?.dataset.responseUi !== state.responseUi) {
        renderShell(state);
        bindEvents(state);
      }

      if (!state.studentAnswerSnapshot) {
        state.studentAnswerSnapshot = [...state.answerIds];
      }
      state.lastEvaluation = evaluateAnswer(state.currentQuestion, state.studentAnswerSnapshot);
      state.phaseMode = "answer";
      state.answerDisplayMode = "correction";
      stopAnimationLoop(state);
      renderQuestion(state);
      syncValidationState(state);
    },

    supportsShellValidation(context = state.latestContext) {
      return getResponseUi(context) === "boxed";
    },

    canValidate() {
      return canValidate(state);
    },

    validate() {
      if (!canValidate(state)) return false;
      submitCurrentAnswer(state);
      return true;
    },

    getShellAnswerDisplayState(container, context = state.latestContext) {
      state.container = container || state.container;
      syncRuntimeState(state, context ?? state.latestContext);
      return {
        canToggle: canToggleAnswerDisplay(state),
        mode: state.answerDisplayMode === "student" ? "student" : "correction"
      };
    },

    setShellAnswerDisplayMode(container, context = state.latestContext, mode = "correction") {
      state.container = container || state.container;
      syncRuntimeState(state, context ?? state.latestContext);
      if (!canToggleAnswerDisplay(state)) return false;
      state.answerDisplayMode = mode === "student" ? "student" : "correction";
      renderQuestion(state);
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
    boardEl: null,
    cloudZoneEl: null,
    settings: normalizeSettings(initialContext?.settings),
    settingsKey: "",
    responseUi: getResponseUi(initialContext),
    currentQuestion: null,
    lastQuestionKey: "",
    usedWordSlugs: new Set(),
    answerIds: [],
    studentAnswerSnapshot: null,
    lastEvaluation: null,
    phaseMode: "idle",
    answerDisplayMode: "correction",
    letterMotion: new Map(),
    dragState: null,
    suppressedClicks: new Map(),
    animationFrame: 0,
    lastAnimationTimestamp: 0,
    layoutFrame: 0,
    resizeObserver: null
  };
}

function syncRuntimeState(state, context = {}) {
  state.latestContext = context ?? state.latestContext;
  state.settings = normalizeSettings(state.latestContext?.settings);
  state.responseUi = getResponseUi(state.latestContext);
}

function renderShell(state) {
  if (!state.container) return;
  stopAnimationLoop(state);
  disconnectResizeObserver(state);

  state.container.innerHTML = `
    <div class="nl-root" data-response-ui="${escapeAttr(state.responseUi)}">
      ${renderToolInstruction({ id:"nl_instruction" })}
      <div class="nl-board" id="nl_board" aria-live="polite"></div>
    </div>
  `;

  state.root = state.container.querySelector(".nl-root");
  state.instructionEl = state.container.querySelector("#nl_instruction");
  state.boardEl = state.container.querySelector("#nl_board");
  updateInstruction(state);
  renderQuestion(state);
}

function bindEvents(state) {
  state.root?.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const clearButton = target.closest("[data-nl-clear-answer]");
    if (clearButton) {
      if (!isQuestionInteractive(state) || !state.answerIds.length) return;
      state.answerIds = [];
      renderQuestion(state);
      syncValidationState(state);
      return;
    }

    const answerButton = target.closest("[data-nl-answer-id]");
    if (answerButton) {
      if (!isQuestionInteractive(state)) return;
      const id = String(answerButton.getAttribute("data-nl-answer-id") || "");
      const index = state.answerIds.indexOf(id);
      if (index < 0) return;
      state.answerIds.splice(index, 1);
      renderQuestion(state);
      syncValidationState(state);
      return;
    }

    const cloudButton = target.closest("[data-nl-cloud-id]");
    if (!cloudButton || !isQuestionInteractive(state)) return;
    const id = String(cloudButton.getAttribute("data-nl-cloud-id") || "");
    if (!id || state.answerIds.includes(id)) return;

    const suppressedUntil = Number(state.suppressedClicks.get(id) || 0);
    if (suppressedUntil > performance.now()) {
      state.suppressedClicks.delete(id);
      return;
    }

    state.answerIds.push(id);
    renderQuestion(state);
    syncValidationState(state);
  });

  state.root?.addEventListener("pointerdown", (event) => beginDrag(state, event));
  state.root?.addEventListener("pointermove", (event) => moveDrag(state, event));
  state.root?.addEventListener("pointerup", (event) => endDrag(state, event));
  state.root?.addEventListener("pointercancel", (event) => endDrag(state, event));
}

function loadNextQuestion(state) {
  const settingsKey = JSON.stringify(state.settings);
  if (state.settingsKey && state.settingsKey !== settingsKey) {
    state.usedWordSlugs.clear();
    state.lastQuestionKey = "";
  }
  state.settingsKey = settingsKey;

  let nextQuestion = pickQuestion(state.settings, {
    avoidKey: state.lastQuestionKey,
    usedWordSlugs: state.usedWordSlugs
  });

  if (!nextQuestion && state.usedWordSlugs.size) {
    state.usedWordSlugs.clear();
    nextQuestion = pickQuestion(state.settings, {
      avoidKey: state.lastQuestionKey,
      usedWordSlugs: state.usedWordSlugs
    });
  }

  if (!nextQuestion) {
    throw new Error("Aucun mot ne peut être généré avec ce son, ces graphies et cette longueur.");
  }

  stopAnimationLoop(state);
  state.currentQuestion = nextQuestion;
  state.lastQuestionKey = questionKey(nextQuestion);
  state.usedWordSlugs.add(nextQuestion.slug);
  state.answerIds = [];
  state.studentAnswerSnapshot = null;
  state.lastEvaluation = null;
  state.phaseMode = "question";
  state.answerDisplayMode = "correction";
  state.letterMotion = new Map();
  state.dragState = null;
  state.suppressedClicks.clear();

  updateInstruction(state);
  renderQuestion(state);
  syncValidationState(state);
}

function renderQuestion(state) {
  if (!state.boardEl) return;
  stopAnimationLoop(state);
  disconnectResizeObserver(state);

  const question = state.currentQuestion;
  if (!question) {
    state.boardEl.className = "nl-board is-empty";
    state.boardEl.innerHTML = '<div class="nl-empty-message">L’activité va commencer.</div>';
    return;
  }

  const answerIds = getDisplayedAnswerIds(state);
  const answerIdSet = new Set(state.phaseMode === "question" ? state.answerIds : answerIds);
  const cloudIds = state.phaseMode === "question"
    ? question.shuffledLetterIds.filter((id) => !answerIdSet.has(id))
    : [];
  const letterById = getLetterById(question);
  const remainingCount = Math.max(0, question.letters.length - answerIds.length);
  const resultClass = state.phaseMode === "answer"
    ? (state.lastEvaluation?.isCorrect ? " is-correct" : " is-incorrect")
    : "";
  const modeClass = `nl-board--${state.settings.cloudMode}`;
  const sizeClass = getSizeClass(question.characterCount);

  state.boardEl.className = `nl-board ${modeClass} ${sizeClass}${resultClass}`;
  state.boardEl.innerHTML = `
    <section class="nl-cloud-panel" aria-label="Nuage de lettres">
      <div class="nl-panel-header">
        <span class="nl-panel-title">Lettres mélangées</span>
        <span class="nl-cloud-count">${cloudIds.length} lettre${cloudIds.length > 1 ? "s" : ""}</span>
      </div>
      <div class="nl-cloud-zone" id="nl_cloud_zone" data-mode="${escapeAttr(state.settings.cloudMode)}">
        ${cloudIds.map((id) => renderCloudLetter(state, letterById.get(id))).join("")}
        ${state.phaseMode === "answer" ? renderAnswerCloudMessage(state) : ""}
      </div>
    </section>

    <section class="nl-answer-panel" aria-label="Zone de réponse">
      <div class="nl-panel-header nl-answer-header">
        <span class="nl-panel-title">Ton mot</span>
        <button
          type="button"
          class="nl-clear-button"
          data-nl-clear-answer
          ${state.phaseMode !== "question" || state.answerIds.length === 0 ? "disabled" : ""}
        >Tout effacer</button>
      </div>
      <div class="nl-answer-zone${resultClass}" role="group" aria-label="Réponse composée">
        ${answerIds.map((id) => renderAnswerLetter(state, letterById.get(id), id)).join("")}
        ${state.phaseMode === "question"
          ? Array.from({ length: remainingCount }, (_, index) => `<span class="nl-answer-placeholder" aria-hidden="true" data-placeholder-index="${index}"></span>`).join("")
          : ""}
      </div>
      ${renderAnswerCaption(state)}
    </section>
  `;

  state.cloudZoneEl = state.boardEl.querySelector("#nl_cloud_zone");
  scheduleCloudLayout(state);
  observeCloudResize(state);
}

function renderCloudLetter(state, letter) {
  if (!letter) return "";
  const motion = state.letterMotion.get(letter.id);
  const positioned = motion && Number.isFinite(motion.x) && Number.isFinite(motion.y);
  const style = positioned
    ? `style="transform:translate3d(${roundPosition(motion.x)}px, ${roundPosition(motion.y)}px, 0)"`
    : "";
  const mode = state.settings.cloudMode;
  const modeLabel = mode === CLOUD_MODES.DRAGGABLE
    ? ", déplaçable"
    : mode === CLOUD_MODES.FLOATING
      ? ", en mouvement"
      : "";

  return `
    <button
      class="nl-letter nl-cloud-letter${positioned ? " is-positioned" : ""}"
      type="button"
      data-nl-cloud-id="${escapeAttr(letter.id)}"
      ${style}
      aria-label="Lettre ${escapeAttr(letter.text)}${modeLabel}"
    >${escapeHtml(letter.text)}</button>
  `;
}

function renderAnswerLetter(state, letter, id) {
  if (!letter) return "";
  const interactive = isQuestionInteractive(state);
  const classNames = ["nl-letter", "nl-answer-letter"];
  if (state.phaseMode === "answer") {
    classNames.push(state.lastEvaluation?.isCorrect ? "is-correct" : state.answerDisplayMode === "student" ? "is-wrong" : "is-correction");
  }

  if (!interactive) {
    return `<span class="${classNames.join(" ")}">${escapeHtml(letter.text)}</span>`;
  }

  return `
    <button
      class="${classNames.join(" ")}"
      type="button"
      data-nl-answer-id="${escapeAttr(id)}"
      aria-label="Retirer la lettre ${escapeAttr(letter.text)} de la réponse"
    >${escapeHtml(letter.text)}</button>
  `;
}

function renderAnswerCloudMessage(state) {
  if (state.answerDisplayMode === "student" && state.lastEvaluation?.isCorrect === false) {
    return '<div class="nl-cloud-feedback is-wrong">Voici l’ordre que tu avais proposé.</div>';
  }
  return `<div class="nl-cloud-feedback${state.lastEvaluation?.isCorrect ? " is-correct" : ""}">${state.lastEvaluation?.isCorrect ? "Bravo, le mot est correctement formé !" : "Voici le mot attendu."}</div>`;
}

function renderAnswerCaption(state) {
  if (state.phaseMode !== "answer") {
    const total = state.currentQuestion?.letters?.length || 0;
    const placed = state.answerIds.length;
    return `<div class="nl-answer-caption">${placed} lettre${placed > 1 ? "s" : ""} placée${placed > 1 ? "s" : ""} sur ${total}. Le bouton Valider s’active quand le mot est complet.</div>`;
  }

  if (state.lastEvaluation?.isCorrect) {
    return '<div class="nl-answer-caption is-correct">Le mot est correct.</div>';
  }
  return state.answerDisplayMode === "student"
    ? '<div class="nl-answer-caption is-wrong">Ta proposition.</div>'
    : '<div class="nl-answer-caption is-correction">Correction.</div>';
}

function getDisplayedAnswerIds(state) {
  if (state.phaseMode !== "answer") return normalizeAnswerIds(state.currentQuestion, state.answerIds);
  if (state.answerDisplayMode === "student") {
    return normalizeAnswerIds(state.currentQuestion, state.studentAnswerSnapshot || []);
  }
  return [...(state.currentQuestion?.expectedLetterIds || [])];
}

function submitCurrentAnswer(state) {
  state.studentAnswerSnapshot = [...state.answerIds];
  state.lastEvaluation = evaluateAnswer(state.currentQuestion, state.studentAnswerSnapshot);

  const requested = state.latestContext?.services?.requestAnswerPhase?.({
    manual: false,
    showAnswerNow: true,
    wasCorrect: state.lastEvaluation.isCorrect
  });

  if (!requested) {
    state.phaseMode = "answer";
    state.answerDisplayMode = "correction";
    stopAnimationLoop(state);
    renderQuestion(state);
  }

  syncValidationState(state);
}

function updateInstruction(state) {
  if (!state.instructionEl) return;
  const prompt = String(state.currentQuestion?.prompt || "").trim()
    || "Remets les lettres dans l’ordre pour former le mot.";
  const text = resolveQuestionInstructionText(
    state.latestContext,
    prompt,
    "Remets les lettres dans l’ordre pour former le mot."
  );
  const target = state.currentQuestion?.target;

  if (!target?.bubbleText || text !== prompt) {
    state.instructionEl.removeAttribute("aria-label");
    setToolInstructionText(state.instructionEl, text);
    return;
  }

  state.instructionEl.hidden = false;
  state.instructionEl.classList.remove("is-empty", "is-reserved-space");
  state.instructionEl.removeAttribute("aria-hidden");
  state.instructionEl.setAttribute("aria-label", prompt);
  state.instructionEl.innerHTML = `
    <span>Remets les lettres dans l’ordre pour former un mot qui contient le son</span>
    <span class="nl-instruction-sound-token">
      ${renderSoundBubble(target.bubbleText, { className:"nl-sound-bubble--instruction" })}<span aria-hidden="true">,</span>
    </span>
    <span>comme dans « ${escapeHtml(target.example)} ».</span>
  `;
}

function canValidate(state) {
  return state.responseUi === "boxed"
    && isQuestionInteractive(state)
    && state.answerIds.length === (state.currentQuestion?.letters?.length || 0);
}

function isQuestionInteractive(state) {
  return state.phaseMode === "question" && !!state.currentQuestion;
}

function canToggleAnswerDisplay(state) {
  return state.responseUi === "boxed"
    && state.phaseMode === "answer"
    && Array.isArray(state.studentAnswerSnapshot)
    && state.lastEvaluation?.isCorrect === false;
}

function beginDrag(state, event) {
  if (!isQuestionInteractive(state) || state.settings.cloudMode !== CLOUD_MODES.DRAGGABLE) return;
  const target = event.target instanceof Element ? event.target.closest("[data-nl-cloud-id]") : null;
  if (!(target instanceof HTMLElement) || !state.cloudZoneEl) return;

  const id = String(target.dataset.nlCloudId || "");
  const motion = state.letterMotion.get(id);
  if (!id || !motion) return;

  const zoneRect = state.cloudZoneEl.getBoundingClientRect();
  const tileRect = target.getBoundingClientRect();
  state.dragState = {
    id,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    offsetX: event.clientX - tileRect.left,
    offsetY: event.clientY - tileRect.top,
    zoneRect,
    tileWidth: tileRect.width,
    tileHeight: tileRect.height,
    moved: false,
    element: target
  };
  target.setPointerCapture?.(event.pointerId);
  target.classList.add("is-dragging");
}

function moveDrag(state, event) {
  const drag = state.dragState;
  if (!drag || drag.pointerId !== event.pointerId || !state.cloudZoneEl) return;
  const dx = event.clientX - drag.startClientX;
  const dy = event.clientY - drag.startClientY;
  if (!drag.moved && Math.hypot(dx, dy) >= 5) drag.moved = true;

  const maxX = Math.max(0, drag.zoneRect.width - drag.tileWidth);
  const maxY = Math.max(0, drag.zoneRect.height - drag.tileHeight);
  const x = clamp(event.clientX - drag.zoneRect.left - drag.offsetX, 0, maxX);
  const y = clamp(event.clientY - drag.zoneRect.top - drag.offsetY, 0, maxY);
  const motion = state.letterMotion.get(drag.id);
  if (!motion) return;
  motion.x = x;
  motion.y = y;
  motion.homeX = x;
  motion.homeY = y;
  applyLetterPosition(drag.element, motion);
  event.preventDefault();
}

function endDrag(state, event) {
  const drag = state.dragState;
  if (!drag || drag.pointerId !== event.pointerId) return;
  drag.element?.classList.remove("is-dragging");
  try { drag.element?.releasePointerCapture?.(event.pointerId); } catch {}
  if (drag.moved) state.suppressedClicks.set(drag.id, performance.now() + 450);
  state.dragState = null;
}

function scheduleCloudLayout(state) {
  if (state.layoutFrame) cancelAnimationFrame(state.layoutFrame);
  state.layoutFrame = requestAnimationFrame(() => {
    state.layoutFrame = 0;
    initializeCloudPositions(state);
    if (state.settings.cloudMode === CLOUD_MODES.FLOATING && isQuestionInteractive(state)) {
      startAnimationLoop(state);
    }
  });
}

function initializeCloudPositions(state) {
  const zone = state.cloudZoneEl;
  if (!zone || !state.currentQuestion) return;
  const elements = [...zone.querySelectorAll("[data-nl-cloud-id]")]
    .filter((element) => element instanceof HTMLElement);
  if (!elements.length) return;

  const zoneWidth = Math.max(1, zone.clientWidth);
  const zoneHeight = Math.max(1, zone.clientHeight);
  const firstRect = elements[0].getBoundingClientRect();
  const tileWidth = Math.max(44, firstRect.width || 72);
  const tileHeight = Math.max(44, firstRect.height || 72);
  const missingIds = elements
    .map((element) => String(element.dataset.nlCloudId || ""))
    .filter((id) => id && !state.letterMotion.has(id));

  if (missingIds.length) {
    const positions = makeScatteredPositions(missingIds.length, zoneWidth, zoneHeight, tileWidth, tileHeight);
    missingIds.forEach((id, index) => {
      const position = positions[index];
      const velocity = makeVelocity();
      state.letterMotion.set(id, {
        x: position.x,
        y: position.y,
        homeX: position.x,
        homeY: position.y,
        vx: velocity.vx,
        vy: velocity.vy
      });
    });
  }

  for (const element of elements) {
    const id = String(element.dataset.nlCloudId || "");
    const motion = state.letterMotion.get(id);
    if (!motion) continue;
    motion.x = clamp(motion.x, 0, Math.max(0, zoneWidth - element.offsetWidth));
    motion.y = clamp(motion.y, 0, Math.max(0, zoneHeight - element.offsetHeight));
    applyLetterPosition(element, motion);
  }
}

function makeScatteredPositions(count, zoneWidth, zoneHeight, tileWidth, tileHeight) {
  const safeCount = Math.max(1, count);
  const aspect = zoneWidth / Math.max(1, zoneHeight);
  const columns = Math.max(1, Math.ceil(Math.sqrt(safeCount * Math.max(.75, aspect))));
  const rows = Math.max(1, Math.ceil(safeCount / columns));
  const cellWidth = zoneWidth / columns;
  const cellHeight = zoneHeight / rows;
  const cells = shuffleArray(Array.from({ length: columns * rows }, (_, index) => index));

  return Array.from({ length: safeCount }, (_, index) => {
    const cell = cells[index] ?? index;
    const column = cell % columns;
    const row = Math.floor(cell / columns);
    const maxX = Math.max(0, zoneWidth - tileWidth);
    const maxY = Math.max(0, zoneHeight - tileHeight);
    const centerX = column * cellWidth + cellWidth / 2 - tileWidth / 2;
    const centerY = row * cellHeight + cellHeight / 2 - tileHeight / 2;
    const jitterX = (Math.random() - .5) * Math.max(0, cellWidth - tileWidth) * .5;
    const jitterY = (Math.random() - .5) * Math.max(0, cellHeight - tileHeight) * .5;
    return {
      x: clamp(centerX + jitterX, 0, maxX),
      y: clamp(centerY + jitterY, 0, maxY)
    };
  });
}

function makeVelocity() {
  const angle = Math.random() * Math.PI * 2;
  const speed = 22 + Math.random() * 16;
  return {
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed
  };
}

function startAnimationLoop(state) {
  if (state.animationFrame || !isQuestionInteractive(state) || state.settings.cloudMode !== CLOUD_MODES.FLOATING) return;
  state.lastAnimationTimestamp = 0;

  const step = (timestamp) => {
    state.animationFrame = 0;
    if (!isQuestionInteractive(state) || state.settings.cloudMode !== CLOUD_MODES.FLOATING || !state.cloudZoneEl) return;

    const dt = state.lastAnimationTimestamp
      ? Math.min(.05, Math.max(0, (timestamp - state.lastAnimationTimestamp) / 1000))
      : 0;
    state.lastAnimationTimestamp = timestamp;
    const zoneWidth = state.cloudZoneEl.clientWidth;
    const zoneHeight = state.cloudZoneEl.clientHeight;

    state.cloudZoneEl.querySelectorAll("[data-nl-cloud-id]").forEach((element) => {
      if (!(element instanceof HTMLElement)) return;
      const id = String(element.dataset.nlCloudId || "");
      const motion = state.letterMotion.get(id);
      if (!motion) return;

      const maxX = Math.max(0, zoneWidth - element.offsetWidth);
      const maxY = Math.max(0, zoneHeight - element.offsetHeight);
      motion.x += motion.vx * dt;
      motion.y += motion.vy * dt;

      if (motion.x <= 0) {
        motion.x = 0;
        motion.vx = Math.abs(motion.vx);
      } else if (motion.x >= maxX) {
        motion.x = maxX;
        motion.vx = -Math.abs(motion.vx);
      }

      if (motion.y <= 0) {
        motion.y = 0;
        motion.vy = Math.abs(motion.vy);
      } else if (motion.y >= maxY) {
        motion.y = maxY;
        motion.vy = -Math.abs(motion.vy);
      }

      applyLetterPosition(element, motion);
    });

    state.animationFrame = requestAnimationFrame(step);
  };

  state.animationFrame = requestAnimationFrame(step);
}

function stopAnimationLoop(state) {
  if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
  state.animationFrame = 0;
  state.lastAnimationTimestamp = 0;
}

function observeCloudResize(state) {
  if (!state.cloudZoneEl || typeof ResizeObserver !== "function") return;
  state.resizeObserver = new ResizeObserver(() => scheduleCloudLayout(state));
  state.resizeObserver.observe(state.cloudZoneEl);
}

function disconnectResizeObserver(state) {
  state.resizeObserver?.disconnect?.();
  state.resizeObserver = null;
}

function applyLetterPosition(element, motion) {
  if (!(element instanceof HTMLElement) || !motion) return;
  element.style.transform = `translate3d(${roundPosition(motion.x)}px, ${roundPosition(motion.y)}px, 0)`;
  element.classList.add("is-positioned");
}

function getLetterById(question) {
  return new Map((Array.isArray(question?.letters) ? question.letters : [])
    .map((letter) => [String(letter?.id || ""), letter]));
}

function getSizeClass(characterCount) {
  const count = Math.max(0, Number(characterCount) || 0);
  if (count >= 11) return "nl-board--very-long";
  if (count >= 9) return "nl-board--long";
  if (count >= 7) return "nl-board--medium";
  return "nl-board--short";
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
        phonologyWordCatalogPromise = null;
        setWordCatalog([]);
        throw error;
      });
  }
  return await phonologyWordCatalogPromise;
}

function teardownState(state, container) {
  stopAnimationLoop(state);
  disconnectResizeObserver(state);
  if (state.layoutFrame) cancelAnimationFrame(state.layoutFrame);
  state.layoutFrame = 0;
  if (container) container.innerHTML = "";
  state.container = null;
  state.root = null;
  state.instructionEl = null;
  state.boardEl = null;
  state.cloudZoneEl = null;
  state.currentQuestion = null;
  state.answerIds = [];
  state.studentAnswerSnapshot = null;
  state.lastEvaluation = null;
  state.letterMotion.clear();
  state.dragState = null;
  state.phaseMode = "idle";
}

function injectActivityStyles() {
  if (stylesReadyPromise) return stylesReadyPromise;
  ensureToolInstructionStyles();

  const href = new URL("./activity.css", import.meta.url).href;
  const existing = document.querySelector(`link[data-nl-activity-style="${href}"]`);
  if (existing) {
    stylesReadyPromise = Promise.resolve();
    return stylesReadyPromise;
  }

  stylesReadyPromise = new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.nlActivityStyle = href;
    link.addEventListener("load", resolve, { once:true });
    link.addEventListener("error", resolve, { once:true });
    document.head.appendChild(link);
  });

  return stylesReadyPromise;
}

function syncValidationState(state) {
  state.latestContext?.services?.notifyValidationStateChanged?.();
}

function getResponseUi(context = {}) {
  const value = String(
    context?.responseUi
    ?? context?.response_ui
    ?? context?.passationProfile?.responseUi
    ?? context?.passationProfile?.response_ui
    ?? "boxed"
  ).trim().toLowerCase();
  return value === "free" ? "free" : "boxed";
}

function shuffleArray(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function roundPosition(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
