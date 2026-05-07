import {
  normalizeSettings,
  LIST_TYPES,
  pickQuestion,
  questionKey,
  isAnswerCorrect
} from "./model.js";
import {
  listPublicVocabularyWordsForSpace
} from "../../shared/public-api.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveQuestionInstructionText,
  setToolInstructionText
} from "../../shared/tool-instruction.js";

let stylesInjected = false;
const wordListCache = new Map();

const DRAG_THRESHOLD_PX = 8;
const CORRECTION_STAGGER_MS = 500;
const GROUP_MARGIN = 18;
const GROUP_ANSWER_GAP = 18;
const GROUP_ANSWER_MIN_GAP = 8;

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

    async next(container, context = initialContext) {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;

      if (!state.container) return;
      if (!state.root || state.root.parentElement !== state.container) {
        renderShell(state);
      }

      await loadNextQuestion(state, context ?? state.latestContext ?? {});
    },

    showAnswer(container, context = initialContext) {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      syncRuntimeState(state, state.latestContext);
      updatePromptDisplay(state);
      revealAnswer(state);
    },

    supportsShellValidation(context = state.latestContext) {
      return shouldShowAnswerBox(context);
    },

    canValidate() {
      return canSubmitAnswer(state);
    },

    validate() {
      if (!canSubmitAnswer(state)) return false;
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
    promptEl: null,
    workspace: null,
    bank: null,
    answerZone: null,
    answerTrack: null,
    correctionLane: null,
    validateBtn: null,
    insertMarker: null,
    freeWorkspace: null,
    root: null,
    chipsByValue: new Map(),
    bankOrder: [],
    bankPositions: new Map(),
    answerOrder: [],
    drag: null,
    currentQuestion: null,
    lastQuestionId: null,
    wordEntries: [],
    answerRevealed: false,
    locked: false,
    correctionTimers: [],
    correctionOverlay: null,
    movedCorrectionOriginals: [],
    currentAnswerScale: 1,
    currentCorrectionScale: 1,
    showAnswerBox: shouldShowAnswerBox(initialContext),
    activityMode: normalizeActivityMode(initialContext?.activityMode),
    projectionResponseUi: normalizeProjectionResponseUi(initialContext?.projectionResponseUi),
    phaseMonitorId: null,
    lastObservedPhaseKind: null
  };
}

function syncRuntimeState(state, context = state.latestContext) {
  state.showAnswerBox = shouldShowAnswerBox(context);
  state.activityMode = normalizeActivityMode(context?.activityMode);
  state.projectionResponseUi = normalizeProjectionResponseUi(context?.projectionResponseUi);
}

function getFreeWorkspace(state) {
  return state.freeWorkspace || state.workspace;
}

function lockChip(chip) {
  chip?.classList.add("oa-chip--locked");
  chip?.classList.remove("oa-chip--drag-source-hidden", "oa-chip--dragging");
}

function snapshotChip(chip) {
  if (!chip) return null;
  return {
    value: chip.dataset.value,
    chip,
    rect: chip.getBoundingClientRect()
  };
}

function snapshotChipsByValues(state, values) {
  const originals = new Map();
  values.forEach((value) => {
    const chip = state.chipsByValue.get(value);
    if (!chip) return;
    lockChip(chip);
    originals.set(value, snapshotChip(chip));
  });
  return originals;
}

function snapshotAllChips(state) {
  const originals = [];
  for (const chip of state.chipsByValue.values()) {
    lockChip(chip);
    const snapshot = snapshotChip(chip);
    if (snapshot) originals.push(snapshot);
  }
  return originals;
}

function buildCorrectionLaneMap(state) {
  const laneMap = new Map();
  for (const laneChip of state.correctionLane?.querySelectorAll?.(".oa-chip") ?? []) {
    laneMap.set(laneChip.dataset.value, laneChip.getBoundingClientRect());
  }
  return laneMap;
}

function resetQuestionRuntimeState(state) {
  clearCorrectionOverlay(state);
  clearCorrectionTimers(state);
  clearMovedCorrectionOriginals(state);
  resetVisualState(state);
  state.answerRevealed = false;
  state.locked = false;
  state.chipsByValue.clear();
  state.bankOrder = [];
  state.bankPositions.clear();
  state.answerOrder = [];
}

function renderShell(state) {
  const container = state.container;
  if (!container) return;

  syncRuntimeState(state);

  container.innerHTML = state.showAnswerBox
    ? `
      <div class="oa-root">
          ${renderToolInstruction({ id: "oa_prompt" })}
          <div class="oa-workspace-shell">
            <div class="oa-workspace" id="oa_workspace">
              <div class="oa-bank" id="oa_bank"></div>
              <div class="oa-answer-zone" id="oa_answer_zone">
                <div class="oa-answer-track" id="oa_answer_track"></div>
                <div class="oa-answer-insert-marker hidden" id="oa_insert_marker"></div>
              </div>
              <div class="oa-answer-correction-lane" id="oa_correction_lane"></div>
            </div>
          </div>
      </div>
    `
    : `
      <div class="oa-root oa-root--group">
          ${renderToolInstruction({ id: "oa_prompt" })}
          <div class="oa-workspace-shell">
            <div class="oa-workspace oa-workspace--free" id="oa_workspace">
              <div class="oa-free-workspace" id="oa_free_workspace"></div>
            </div>
          </div>
      </div>
    `;

  state.root = container.querySelector(".oa-root");
  state.promptEl = container.querySelector("#oa_prompt");
  state.workspace = container.querySelector("#oa_workspace");
  state.bank = container.querySelector("#oa_bank");
  state.answerZone = container.querySelector("#oa_answer_zone");
  state.answerTrack = container.querySelector("#oa_answer_track");
  state.correctionLane = container.querySelector("#oa_correction_lane");
  state.insertMarker = container.querySelector("#oa_insert_marker");
  state.freeWorkspace = container.querySelector("#oa_free_workspace");
  state.correctionOverlay = null;
  state.currentAnswerScale = 1;
  state.currentCorrectionScale = 1;


  syncValidateState(state);
  updatePromptDisplay(state);
}

async function loadNextQuestion(state, context = {}) {
  const previousShowAnswerBox = state.showAnswerBox;
  syncRuntimeState(state, context);
  if (previousShowAnswerBox !== state.showAnswerBox) {
    renderShell(state);
  }

  const settings = normalizeSettings(context?.settings);
  const workspace = state.workspace;
  if (!workspace || !state.promptEl) return;

  resetQuestionRuntimeState(state);
  renderLoadingState(state);
  updatePromptDisplay(state);

  let wordEntries = [];
  if (settings.listType === LIST_TYPES.WORDS) {
    wordEntries = await loadWordEntriesForAccessCode(context?.accessCode);
  }

  const nextQuestion = pickQuestion(settings, {
    wordEntries,
    avoidKey: state.lastQuestionId,
    attempts: 800
  });

  if (!nextQuestion) {
    throw new Error(settings.listType === LIST_TYPES.WORDS
      ? "Impossible de générer une question d’ordre alphabétique avec la banque de mots actuelle."
      : "Impossible de générer une question d’ordre alphabétique avec ces réglages.");
  }

  state.currentQuestion = nextQuestion;
  state.lastQuestionId = questionKey(nextQuestion);
  state.wordEntries = wordEntries;
  updatePromptDisplay(state);

  if (state.showAnswerBox) {
    state.bankOrder = [...nextQuestion.items];
    state.answerOrder = [];
    renderInteractiveQuestion(state);
    return;
  }

  renderFreeQuestion(state, nextQuestion.items);
}

function revealAnswer(state) {
  if (!state.currentQuestion || !state.workspace || state.answerRevealed) return;

  state.answerRevealed = true;
  state.locked = true;
  syncValidateState(state);
  hideInsertMarker(state);

  if (state.showAnswerBox) {
    revealBoxAnswer(state);
    return;
  }

  revealFreeAnswer(state);
}

function revealBoxAnswer(state) {
  const currentQuestion = state.currentQuestion;
  const currentAnswer = [...state.answerOrder];
  const currentBank = [...state.bankOrder];
  const workspace = state.workspace;

  const answerOriginalsByValue = snapshotChipsByValues(state, currentAnswer);
  const bankOriginalsByValue = snapshotChipsByValues(state, currentBank);

  const isCorrect = isAnswerCorrect(currentAnswer, currentQuestion.answerItems);
  applyAnswerFeedback(state, isCorrect);

  renderCorrectionLane(state, currentQuestion.answerItems);
  const laneMap = buildCorrectionLaneMap(state);
  state.correctionLane?.classList.add("oa-answer-correction-lane--visible");

  const orderedAnswerOriginals = currentQuestion.answerItems
    .map((value) => answerOriginalsByValue.get(value))
    .filter(Boolean);

  createCorrectionOverlay(state, orderedAnswerOriginals, laneMap, workspace);
  animateBankOriginalsToLane(state, bankOriginalsByValue, laneMap, workspace, currentQuestion.answerItems);
}

function revealFreeAnswer(state) {
  const workspace = getFreeWorkspace(state);
  if (!workspace) return;

  snapshotAllChips(state);

  const positions = computeGroupAnswerLayout(workspace, state.currentQuestion.answerItems, state.chipsByValue);
  animateFreeOriginalsToAnswerLayout(state, positions);
}

function renderInteractiveQuestion(state) {
  if (!state.bank || !state.answerTrack || !state.answerZone) return;

  state.bank.innerHTML = "";
  state.answerTrack.innerHTML = "";
  state.correctionLane.innerHTML = "";
  state.correctionLane.classList.remove("oa-answer-correction-lane--visible");
  clearAnswerFeedback(state);

  const allValues = [...state.bankOrder, ...state.answerOrder];
  const chipMap = state.chipsByValue;

  allValues.forEach((value) => {
    if (chipMap.has(value)) return;
    chipMap.set(value, createChipElement(value, state, { floating: true }));
  });

  state.bankOrder.forEach((value) => {
    const chip = chipMap.get(value);
    if (!chip) return;
    chip.classList.add("oa-chip--floating");
    state.bank.appendChild(chip);
  });

  state.answerOrder.forEach((value) => {
    const chip = chipMap.get(value);
    if (!chip) return;
    chip.classList.remove("oa-chip--floating");
    chip.style.left = "";
    chip.style.top = "";
    state.answerTrack.appendChild(chip);
  });

  layoutBankChips(state);

  applyTrackScale(state.answerTrack, state.answerZone, {
    availableWidth: Math.max(160, state.answerZone.clientWidth - 40),
    maxScale: 1,
    minScale: 0.62,
    baseTransform: "translate(-50%, -50%)"
  });

  syncValidateState(state);
}

function layoutBankChips(state) {
  if (!state.bank) return;

  const missingValues = state.bankOrder.filter((value) => !state.bankPositions.has(value));
  if (missingValues.length > 0) {
    const missingChips = missingValues
      .map((value) => state.chipsByValue.get(value))
      .filter(Boolean);

    const positions = computeTopAlignedLayout(state.bank, missingChips);
    missingValues.forEach((value, index) => {
      state.bankPositions.set(value, positions[index] || { x: GROUP_MARGIN, y: GROUP_MARGIN });
    });
  }

  state.bankOrder.forEach((value) => {
    const chip = state.chipsByValue.get(value);
    if (!chip) return;

    const pos = clampBankPosition(state.bank, chip, state.bankPositions.get(value));
    state.bankPositions.set(value, pos);
    chip.style.left = `${pos.x}px`;
    chip.style.top = `${pos.y}px`;
  });
}

function clampBankPosition(bank, chip, pos = {}) {
  const maxLeft = Math.max(0, bank.clientWidth - chip.offsetWidth);
  const maxTop = Math.max(0, bank.clientHeight - chip.offsetHeight);

  return {
    x: clamp(pos.x ?? GROUP_MARGIN, 0, maxLeft),
    y: clamp(pos.y ?? GROUP_MARGIN, 0, maxTop)
  };
}

function placeBankValueFromWorkspaceDrop(state, value, workspaceLeft, workspaceTop) {
  if (!state.bank || !state.workspace) return;

  const chip = state.chipsByValue.get(value);
  if (!chip) return;

  const workspaceOrigin = getContainerClientOrigin(state.workspace);
  const bankOrigin = getContainerClientOrigin(state.bank);

  const bankLocalX = workspaceLeft + workspaceOrigin.left - bankOrigin.left;
  const bankLocalY = workspaceTop + workspaceOrigin.top - bankOrigin.top;

  const pos = clampBankPosition(state.bank, chip, {
    x: bankLocalX,
    y: bankLocalY
  });

  state.bankPositions.set(value, pos);
  chip.style.left = `${pos.x}px`;
  chip.style.top = `${pos.y}px`;
}

function renderFreeQuestion(state, items) {
  const workspace = getFreeWorkspace(state);
  if (!workspace) return;

  workspace.innerHTML = "";
  state.chipsByValue.clear();

  const chips = items.map((value) => {
    const chip = createChipElement(value, state, { floating: true });
    chip.style.left = "0px";
    chip.style.top = "0px";
    workspace.appendChild(chip);
    state.chipsByValue.set(value, chip);
    return chip;
  });

  placeFloatingChipsAtTop(workspace, chips);
}

function renderLoadingState(state) {
  if (state.showAnswerBox) {
    if (state.bank) state.bank.innerHTML = '<div class="oa-loading">Chargement…</div>';
    if (state.answerTrack) state.answerTrack.innerHTML = "";
    if (state.correctionLane) state.correctionLane.innerHTML = "";
    clearAnswerFeedback(state);
    syncValidateState(state);
    return;
  }

  const freeWorkspace = getFreeWorkspace(state);
  if (freeWorkspace && !state.showAnswerBox) {
    freeWorkspace.innerHTML = '<div class="oa-loading">Chargement…</div>';
  }
}

function createChipElement(value, state, { floating = false } = {}) {
  const chip = document.createElement("button");
  chip.className = `oa-chip${floating ? " oa-chip--floating" : ""}`;
  chip.type = "button";
  chip.dataset.value = value;
  chip.textContent = value;
  attachDragBehavior(state, chip, { floating });
  return chip;
}

function attachDragBehavior(state, chip, { floating = false } = {}) {
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let dragStarted = false;

  const onPointerMove = (ev) => {
    if (pointerId !== ev.pointerId || state.locked) return;

    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    const distance = Math.hypot(dx, dy);

    if (!dragStarted && distance >= DRAG_THRESHOLD_PX) {
      dragStarted = true;
      startDrag(state, chip, ev);
    }

    if (!dragStarted) return;
    updateDrag(state, ev);
  };

  const onPointerUp = (ev) => {
    if (pointerId !== ev.pointerId) return;

    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);

    try {
      chip.releasePointerCapture?.(ev.pointerId);
    } catch {}

    if (dragStarted) {
      finishDrag(state, ev);
    } else if (!state.locked && state.showAnswerBox && isValueInAnswer(state, chip.dataset.value)) {
      moveAnswerValueBackToBank(state, chip.dataset.value);
    }

    pointerId = null;
    dragStarted = false;
  };

  chip.addEventListener("pointerdown", (ev) => {
    if (state.locked) return;
    if (ev.button != null && ev.button !== 0) return;

    pointerId = ev.pointerId;
    startX = ev.clientX;
    startY = ev.clientY;
    dragStarted = false;

    try {
      chip.setPointerCapture?.(ev.pointerId);
    } catch {}

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  });
}

function getDragSurface(state) {
  return state.showAnswerBox ? state.workspace : getFreeWorkspace(state);
}

function startDrag(state, chip, ev) {
  const dragSurface = getDragSurface(state);
  if (!dragSurface) return;

  const chipRect = chip.getBoundingClientRect();
  const dragSurfaceRect = dragSurface.getBoundingClientRect();
  const source = state.showAnswerBox
    ? (isValueInAnswer(state, chip.dataset.value) ? "answer" : "bank")
    : "free";

  const proxy = chip.cloneNode(true);
  proxy.classList.add("oa-chip--drag-proxy");
  proxy.classList.remove("oa-chip--locked", "oa-chip--floating", "oa-chip--drag-source-hidden");
  proxy.style.width = `${Math.round(chipRect.width)}px`;
  proxy.style.height = `${Math.round(chipRect.height)}px`;
  proxy.style.left = `${chipRect.left - dragSurfaceRect.left}px`;
  proxy.style.top = `${chipRect.top - dragSurfaceRect.top}px`;
  dragSurface.appendChild(proxy);

  chip.classList.add("oa-chip--drag-source-hidden");

  state.drag = {
    value: chip.dataset.value,
    source,
    chip,
    proxy,
    dragSurface,
    pointerOffsetX: ev.clientX - chipRect.left,
    pointerOffsetY: ev.clientY - chipRect.top,
    insertionIndex: getAnswerInsertionIndex(state, ev.clientX),
    overAnswerZone: isPointerInsideAnswerZone(state, ev.clientX, ev.clientY)
  };

  updateDrag(state, ev);
}

function updateDrag(state, ev) {
  const drag = state.drag;
  const dragSurface = drag?.dragSurface;
  if (!drag || !dragSurface) return;

  const dragSurfaceRect = dragSurface.getBoundingClientRect();
  const proxyWidth = drag.proxy.offsetWidth || drag.chip.offsetWidth || 0;
  const proxyHeight = drag.proxy.offsetHeight || drag.chip.offsetHeight || 0;
  const maxLeft = Math.max(0, dragSurface.clientWidth - proxyWidth);
  const maxTop = Math.max(0, dragSurface.clientHeight - proxyHeight);
  const nextLeft = clamp(ev.clientX - dragSurfaceRect.left - drag.pointerOffsetX, 0, maxLeft);
  const nextTop = clamp(ev.clientY - dragSurfaceRect.top - drag.pointerOffsetY, 0, maxTop);

  drag.proxy.style.left = `${Math.round(nextLeft)}px`;
  drag.proxy.style.top = `${Math.round(nextTop)}px`;

  if (!state.showAnswerBox) return;

  drag.overAnswerZone = isPointerInsideAnswerZone(state, ev.clientX, ev.clientY);
  drag.insertionIndex = getAnswerInsertionIndex(state, ev.clientX);

  if (drag.overAnswerZone) {
    showInsertMarker(state, drag.insertionIndex, drag.value);
  } else {
    hideInsertMarker(state);
  }
}

function finishDrag(state, ev) {
  const drag = state.drag;
  if (!drag) return;

  drag.chip.classList.remove("oa-chip--drag-source-hidden");

  const proxyLeft = parseFloat(drag.proxy.style.left || "0");
  const proxyTop = parseFloat(drag.proxy.style.top || "0");

  if (!state.showAnswerBox) {
    drag.chip.style.left = drag.proxy.style.left;
    drag.chip.style.top = drag.proxy.style.top;
    drag.proxy.remove();
    state.drag = null;
    return;
  }

  drag.proxy.remove();

  const overAnswer = drag.overAnswerZone && isPointerInsideAnswerZone(state, ev.clientX, ev.clientY);

  if (overAnswer) {
    moveValueIntoAnswer(state, drag.value, drag.insertionIndex);
  } else if (drag.source === "answer") {
    moveAnswerValueBackToBank(state, drag.value, {
      workspaceLeft: proxyLeft,
      workspaceTop: proxyTop
    });
  } else {
    placeBankValueFromWorkspaceDrop(state, drag.value, proxyLeft, proxyTop);
  }

  hideInsertMarker(state);
  state.drag = null;
}

function moveValueIntoAnswer(state, value, insertionIndex) {
  const nextAnswer = state.answerOrder.filter((item) => item !== value);
  const clampedIndex = clampInt(insertionIndex, 0, nextAnswer.length);
  nextAnswer.splice(clampedIndex, 0, value);
  state.answerOrder = nextAnswer;
  state.bankPositions.delete(value);
  state.bankOrder = state.currentQuestion.items.filter((item) => !state.answerOrder.includes(item));
  renderInteractiveQuestion(state);
}

function moveAnswerValueBackToBank(state, value, dropPosition = null) {
  state.answerOrder = state.answerOrder.filter((item) => item !== value);
  state.bankOrder = state.currentQuestion.items.filter((item) => !state.answerOrder.includes(item));

  if (!dropPosition) {
    state.bankPositions.delete(value);
  }

  renderInteractiveQuestion(state);

  if (dropPosition) {
    placeBankValueFromWorkspaceDrop(
      state,
      value,
      dropPosition.workspaceLeft,
      dropPosition.workspaceTop
    );
  }
}

function getAnswerInsertionIndex(state, pointerClientX) {
  if (!state.answerTrack || !state.answerZone) return state.answerOrder.length;

  const answerValues = state.answerOrder.filter((item) => item !== state.drag?.value);
  if (!answerValues.length) return 0;

  const chips = answerValues
    .map((value) => state.chipsByValue.get(value))
    .filter(Boolean);

  if (!chips.length) return 0;

  for (let index = 0; index < chips.length; index += 1) {
    const rect = chips[index].getBoundingClientRect();
    if (pointerClientX < rect.left + (rect.width / 2)) {
      return index;
    }
  }

  return chips.length;
}

function showInsertMarker(state, insertionIndex, draggedValue) {
  if (!state.insertMarker || !state.answerTrack || !state.answerZone) return;

  const values = state.answerOrder.filter((item) => item !== draggedValue);
  const chips = values
    .map((value) => state.chipsByValue.get(value))
    .filter(Boolean);

  const answerZoneRect = state.answerZone.getBoundingClientRect();
  let x = answerZoneRect.left + (answerZoneRect.width / 2);

  if (chips.length > 0) {
    if (insertionIndex <= 0) {
      x = chips[0].getBoundingClientRect().left;
    } else if (insertionIndex >= chips.length) {
      const lastRect = chips[chips.length - 1].getBoundingClientRect();
      x = lastRect.right;
    } else {
      const prevRect = chips[insertionIndex - 1].getBoundingClientRect();
      const nextRect = chips[insertionIndex].getBoundingClientRect();
      x = Math.round((prevRect.right + nextRect.left) / 2);
    }
  }

  const markerLeft = Math.round(x - answerZoneRect.left);
  state.insertMarker.style.left = `${markerLeft}px`;
  state.insertMarker.classList.remove("hidden");
}

function hideInsertMarker(state) {
  state.insertMarker?.classList.add("hidden");
}

function isPointerInsideAnswerZone(state, clientX, clientY) {
  if (!state.answerZone) return false;
  const rect = state.answerZone.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function syncValidateState(state) {
  state.latestContext?.services?.notifyValidationStateChanged?.();
}

function canSubmitAnswer(state) {
  const questionSize = state.currentQuestion?.items?.length || 0;
  const phaseKind = state.latestContext?.services?.getPhaseKind?.() || null;
  return !state.locked
    && !state.answerRevealed
    && questionSize > 0
    && state.answerOrder.length === questionSize
    && phaseKind === "QUESTION";
}

function requestReveal(state) {
  state.latestContext?.services?.requestAnswerPhase?.({
    manual: false,
    showAnswerNow: true,
    wasCorrect: isAnswerCorrect([...state.answerOrder], state.currentQuestion?.answerItems || [])
  });
}

function startPhaseMonitor(state) {
  stopPhaseMonitor(state);

  state.lastObservedPhaseKind = state.latestContext?.services?.getPhaseKind?.() || null;

  state.phaseMonitorId = window.setInterval(() => {
    const phaseKind = state.latestContext?.services?.getPhaseKind?.() || null;
    if (phaseKind === state.lastObservedPhaseKind) return;

    state.lastObservedPhaseKind = phaseKind;
    handlePhaseKindChange(state, phaseKind);
  }, 80);
}

function stopPhaseMonitor(state) {
  if (state.phaseMonitorId != null) {
    window.clearInterval(state.phaseMonitorId);
    state.phaseMonitorId = null;
  }
}

function handlePhaseKindChange(state, phaseKind) {
  if (phaseKind === "TRANSITION") {
    clearCorrectionOverlay(state);
    clearCorrectionTimers(state);
    clearMovedCorrectionOriginals(state);
    state.correctionLane?.classList.remove("oa-answer-correction-lane--visible");
    if (state.correctionLane) state.correctionLane.innerHTML = "";
    clearAnswerFeedback(state);
  }

  syncValidateState(state);
}

function applyAnswerFeedback(state, isCorrect) {
  if (!state.answerZone) return;

  if (state.activityMode === "group") {
    clearAnswerFeedback(state);
    return;
  }

  state.answerZone.classList.remove("oa-answer-zone--correct", "oa-answer-zone--incorrect");
  state.answerZone.classList.add(isCorrect ? "oa-answer-zone--correct" : "oa-answer-zone--incorrect");
}

function clearAnswerFeedback(state) {
  state.answerZone?.classList.remove("oa-answer-zone--correct", "oa-answer-zone--incorrect");
}

function renderCorrectionLane(state, answerItems) {
  if (!state.correctionLane || !state.workspace) return;

  state.correctionLane.innerHTML = "";
  answerItems.forEach((value) => {
    const chip = document.createElement("div");
    chip.className = "oa-chip oa-chip--correction-slot";
    chip.dataset.value = value;
    chip.textContent = value;
    state.correctionLane.appendChild(chip);
  });

  applyTrackScale(state.correctionLane, state.workspace, {
    availableWidth: Math.max(160, state.workspace.clientWidth - 80),
    maxScale: 1,
    minScale: 0.62,
    baseTransform: "translate(-50%, -50%)"
  });
}

function startCorrectionMove(element, targetLeft, targetTop) {
  if (!element) return;

  element.classList.remove("oa-chip--animating");
  element.style.transition = "none";

  // Force le navigateur à valider l'état initial avant d'autoriser l'animation.
  void element.offsetWidth;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      element.style.transition = "";
      element.classList.add("oa-chip--animating");
      element.style.left = `${Math.round(targetLeft)}px`;
      element.style.top = `${Math.round(targetTop)}px`;
    });
  });
}

function createCorrectionOverlay(state, originals, laneMap, workspace, { positionsAreLocal = false } = {}) {
  clearCorrectionOverlay(state);
  clearCorrectionTimers(state);

  const overlay = document.createElement("div");
  overlay.className = "oa-correction-overlay";
  workspace.appendChild(overlay);
  state.correctionOverlay = overlay;

  const workspaceOrigin = getContainerClientOrigin(workspace);

  originals.forEach(({ value, rect }, index) => {
    const clone = document.createElement("div");
    clone.className = "oa-chip oa-chip--correction-copy";
    clone.textContent = value;
    clone.dataset.value = value;
    clone.style.width = `${Math.round(rect.width)}px`;
    clone.style.height = `${Math.round(rect.height)}px`;
    clone.style.left = `${Math.round(rect.left - workspaceOrigin.left)}px`;
    clone.style.top = `${Math.round(rect.top - workspaceOrigin.top)}px`;
    overlay.appendChild(clone);

    const target = laneMap.get(value);
    if (!target) return;

    const timerId = window.setTimeout(() => {
      const targetLeft = positionsAreLocal
        ? target.x
        : Math.round(target.left - workspaceOrigin.left);
      const targetTop = positionsAreLocal
        ? target.y
        : Math.round(target.top - workspaceOrigin.top);

      startCorrectionMove(clone, targetLeft, targetTop);
    }, index * CORRECTION_STAGGER_MS);

    state.correctionTimers.push(timerId);
  });
}

function animateBankOriginalsToLane(state, bankOriginalsByValue, laneMap, workspace, answerItems) {
  const workspaceOrigin = getContainerClientOrigin(workspace);

  answerItems.forEach((value, index) => {
    const original = bankOriginalsByValue.get(value);
    if (!original) return;

    const target = laneMap.get(value);
    if (!target) return;

    const { chip, rect } = original;

    chip.classList.add("oa-chip--locked", "oa-chip--floating");
    chip.classList.remove("oa-chip--drag-source-hidden");
    chip.style.left = `${Math.round(rect.left - workspaceOrigin.left)}px`;
    chip.style.top = `${Math.round(rect.top - workspaceOrigin.top)}px`;
    chip.style.zIndex = "6";

    workspace.appendChild(chip);
    state.movedCorrectionOriginals.push(chip);

    const timerId = window.setTimeout(() => {
      const targetLeft = Math.round(target.left - workspaceOrigin.left);
      const targetTop = Math.round(target.top - workspaceOrigin.top);

      startCorrectionMove(chip, targetLeft, targetTop);
    }, index * CORRECTION_STAGGER_MS);

    state.correctionTimers.push(timerId);
  });
}

function animateFreeOriginalsToAnswerLayout(state, positions) {
  const answerItems = state.currentQuestion?.answerItems || [];

  answerItems.forEach((value, index) => {
    const chip = state.chipsByValue.get(value);
    const target = positions[index];
    if (!chip || !target) return;

    chip.style.zIndex = "6";

    const timerId = window.setTimeout(() => {
      startCorrectionMove(chip, target.x, target.y);
    }, index * CORRECTION_STAGGER_MS);

    state.correctionTimers.push(timerId);
  });
}

function clearMovedCorrectionOriginals(state) {
  state.movedCorrectionOriginals.forEach((chip) => {
    chip?.remove?.();
  });
  state.movedCorrectionOriginals = [];
}

function clearCorrectionOverlay(state) {
  state.correctionOverlay?.remove();
  state.correctionOverlay = null;
}

function clearCorrectionTimers(state) {
  state.correctionTimers.forEach((timerId) => window.clearTimeout(timerId));
  state.correctionTimers = [];
}

function resetVisualState(state) {
  clearAnswerFeedback(state);
  hideInsertMarker(state);
}

function updatePromptDisplay(state) {
  const text = resolveQuestionInstructionText(
    state.latestContext,
    state.currentQuestion?.prompt || ""
  );
  setToolInstructionText(state.promptEl, text);
}

function teardownState(state, container) {
  stopPhaseMonitor(state);
  clearCorrectionOverlay(state);
  clearCorrectionTimers(state);
  clearMovedCorrectionOriginals(state);
  state.drag?.chip?.classList?.remove?.("oa-chip--drag-source-hidden");
  state.drag?.proxy?.remove();
  state.drag = null;
  state.currentQuestion = null;
  state.bankOrder = [];
  state.bankPositions.clear();
  state.answerOrder = [];
  state.chipsByValue.clear();
  state.answerRevealed = false;
  state.locked = false;
  state.lastQuestionId = null;
  if (container) {
    container.innerHTML = "";
  }
}

function loadWordEntriesForAccessCode(accessCode) {
  const code = String(accessCode || "").trim();
  if (!code) {
    throw new Error("Code d’accès manquant pour charger la banque de mots.");
  }

  if (!wordListCache.has(code)) {
    wordListCache.set(code, listPublicVocabularyWordsForSpace(code));
  }

  return Promise.resolve(wordListCache.get(code)).then((entries) => {
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error("La banque de mots de cet enseignant est vide.");
    }
    return entries;
  });
}

function placeFloatingChipsAtTop(workspace, chips) {
  const layoutOrder = shuffleArray([...chips]);
  const positions = computeTopAlignedLayout(workspace, layoutOrder);

  layoutOrder.forEach((chip, index) => {
    const pos = positions[index];
    if (!pos) return;
    chip.style.left = `${pos.x}px`;
    chip.style.top = `${pos.y}px`;
  });
}

function computeTopAlignedLayout(workspace, chips) {
  return computeWrappedCenteredLayout({
    workspaceWidth: Math.max(320, workspace.clientWidth),
    workspaceHeight: Math.max(220, workspace.clientHeight),
    chips,
    verticalAlign: "top"
  });
}

function computeGroupAnswerLayout(workspace, answerItems, chipMap) {
  const chips = answerItems.map((value) => chipMap.get(value)).filter(Boolean);
  return computeWrappedCenteredLayout({
    workspaceWidth: Math.max(320, workspace.clientWidth),
    workspaceHeight: Math.max(220, workspace.clientHeight),
    chips,
    verticalAlign: "center"
  });
}

function computeWrappedCenteredLayout({
  workspaceWidth,
  workspaceHeight,
  chips,
  verticalAlign = "center"
}) {
  const margin = GROUP_MARGIN;
  const rowGap = 18;
  const safeWorkspaceWidth = Math.max(320, workspaceWidth);
  const safeWorkspaceHeight = Math.max(220, workspaceHeight);
  const availableWidth = Math.max(120, safeWorkspaceWidth - (margin * 2));
  const widths = chips.map((chip) => chip.offsetWidth);
  const heights = chips.map((chip) => chip.offsetHeight);
  const sumWidths = widths.reduce((sum, width) => sum + width, 0);

  let gap = GROUP_ANSWER_GAP;
  if (chips.length > 1) {
    const maxGap = Math.floor((availableWidth - sumWidths) / (chips.length - 1));
    gap = Math.max(GROUP_ANSWER_MIN_GAP, Math.min(GROUP_ANSWER_GAP, maxGap));
  }

  const singleRowWidth = sumWidths + Math.max(0, chips.length - 1) * gap;

  if (singleRowWidth <= availableWidth) {
    const startX = Math.round((safeWorkspaceWidth - singleRowWidth) / 2);
    const rowHeight = Math.max(...heights, 0);
    const baseY = verticalAlign === "top"
      ? margin
      : Math.max(margin, Math.round((safeWorkspaceHeight - rowHeight) / 2));

    let x = startX;
    return chips.map((chip, index) => {
      const pos = {
        x,
        y: baseY + Math.round((rowHeight - heights[index]) / 2)
      };
      x += widths[index] + gap;
      return pos;
    });
  }

  const rows = [];
  let currentRow = [];
  let currentWidth = 0;
  let currentHeight = 0;

  chips.forEach((chip, index) => {
    const chipWidth = widths[index];
    const chipHeight = heights[index];
    const nextWidth = currentRow.length === 0 ? chipWidth : currentWidth + GROUP_ANSWER_GAP + chipWidth;

    if (currentRow.length > 0 && nextWidth > availableWidth) {
      rows.push({ items: currentRow, width: currentWidth, height: currentHeight });
      currentRow = [];
      currentWidth = 0;
      currentHeight = 0;
    }

    currentRow.push({ chip, index, chipWidth, chipHeight });
    currentWidth = currentRow.length === 1 ? chipWidth : currentWidth + GROUP_ANSWER_GAP + chipWidth;
    currentHeight = Math.max(currentHeight, chipHeight);
  });

  if (currentRow.length > 0) {
    rows.push({ items: currentRow, width: currentWidth, height: currentHeight });
  }

  const totalHeight = rows.reduce((sum, row) => sum + row.height, 0) + Math.max(0, rows.length - 1) * rowGap;
  let cursorY = verticalAlign === "top"
    ? margin
    : Math.max(margin, Math.round((safeWorkspaceHeight - totalHeight) / 2));
  const positions = new Array(chips.length);

  rows.forEach((row) => {
    let cursorX = Math.max(margin, Math.round((safeWorkspaceWidth - row.width) / 2));

    row.items.forEach((item) => {
      positions[item.index] = {
        x: cursorX,
        y: cursorY + Math.round((row.height - item.chipHeight) / 2)
      };
      cursorX += item.chipWidth + GROUP_ANSWER_GAP;
    });

    cursorY += row.height + rowGap;
  });

  return positions;
}

function applyTrackScale(track, zone, {
  availableWidth = 0,
  maxScale = 1,
  minScale = 0.6,
  baseTransform = "translateX(-50%)"
} = {}) {
  if (!track || !zone) return 1;

  track.style.transform = `${baseTransform} scale(1)`;

  const trackWidth = Math.ceil(track.scrollWidth || track.getBoundingClientRect().width || 0);
  const safeAvailableWidth = Math.max(1, Math.floor(availableWidth || zone.clientWidth || 1));
  const scale = trackWidth > safeAvailableWidth
    ? clamp(safeAvailableWidth / trackWidth, minScale, maxScale)
    : 1;

  track.style.transform = `${baseTransform} scale(${scale})`;
  return scale;
}

function shouldShowAnswerBox(context = {}) {
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

function isValueInAnswer(state, value) {
  return state.answerOrder.includes(value);
}

function shuffleArray(items) {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [out[index], out[swapIndex]] = [out[swapIndex], out[index]];
  }
  return out;
}

function getContainerClientOrigin(container) {
  const rect = container.getBoundingClientRect();
  return {
    left: rect.left + (container.clientLeft || 0),
    top: rect.top + (container.clientTop || 0)
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function clampInt(value, min, max) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  ensureToolInstructionStyles();

  const href = new URL("./activity.css", import.meta.url).href;
  if (document.querySelector(`link[data-oa-activity-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.oaActivityStyle = href;
  document.head.appendChild(link);
}

