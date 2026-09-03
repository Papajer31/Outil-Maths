import {
  normalizeSettings,
  LIST_TYPES,
  pickQuestion,
  questionKey,
  isAnswerCorrect,
  getDiscriminatingLetterRanges
} from "./model.js";
import { listPublicPhonologyWords } from "../../shared/public-api.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveQuestionInstructionText,
  setToolInstructionText
} from "../../shared/tool-instruction.js";

let stylesInjected = false;
let activityStyleReadyPromise = null;
let publicWordCatalogPromise = null;

const DRAG_THRESHOLD_PX = 8;
const CORRECTION_STAGGER_MS = 500;
const CORRECTION_MOVE_MS = 2000;
const CORRECT_CORRECTION_STAGGER_MS = 70;
const CORRECT_CORRECTION_MOVE_MS = 360;
const CORRECTION_CONTROLS_BUFFER_MS = 90;
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
    alphabetHelpSlot: null,
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
    visualHintRanges: new Map(),
    itemMetaByValue: new Map(),
    answerRevealed: false,
    locked: false,
    correctionTimers: [],
    correctionOverlay: null,
    movedCorrectionOriginals: [],
    currentAnswerScale: 1,
    currentCorrectionScale: 1,
    showAnswerBox: shouldShowAnswerBox(initialContext),
    phaseMonitorId: null,
    lastObservedPhaseKind: null,
    fastCorrection: false
  };
}

function syncRuntimeState(state, context = state.latestContext) {
  state.showAnswerBox = shouldShowAnswerBox(context);
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
  state.fastCorrection = false;
  state.root?.classList.remove("oa-root--fast-correction");
  state.chipsByValue.clear();
  state.bankOrder = [];
  state.bankPositions.clear();
  state.answerOrder = [];
  state.visualHintRanges = new Map();
  state.itemMetaByValue = new Map();
}

function renderShell(state) {
  const container = state.container;
  if (!container) return;

  syncRuntimeState(state);

  container.innerHTML = state.showAnswerBox
    ? `
      <div class="oa-root">
          ${renderToolInstruction({ id: "oa_prompt" })}
          <div class="oa-alphabet-help-slot" id="oa_alphabet_help_slot"></div>
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
          <div class="oa-alphabet-help-slot" id="oa_alphabet_help_slot"></div>
          <div class="oa-workspace-shell">
            <div class="oa-workspace oa-workspace--free" id="oa_workspace">
              <div class="oa-free-workspace" id="oa_free_workspace"></div>
            </div>
          </div>
      </div>
    `;

  state.root = container.querySelector(".oa-root");
  state.promptEl = container.querySelector("#oa_prompt");
  state.alphabetHelpSlot = container.querySelector("#oa_alphabet_help_slot");
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
    wordEntries = await loadPublicWordCatalog();
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
  state.itemMetaByValue = buildItemMetaByValue(nextQuestion);
  renderAlphabetHelp(state, settings);
  updateVisualHintRanges(state, settings, nextQuestion);
  updatePromptDisplay(state);

  await waitForActivityRenderReady();

  if (state.showAnswerBox) {
    state.bankOrder = [...nextQuestion.items];
    state.answerOrder = [];
    renderInteractiveQuestion(state);
    scheduleBankChipsLayoutRefresh(state);
    return;
  }

  renderFreeQuestion(state, nextQuestion.items);
}

function revealAnswer(state) {
  if (!state.currentQuestion || !state.workspace || state.answerRevealed) return;

  state.answerRevealed = true;
  state.locked = true;
  state.root?.classList.toggle("oa-root--fast-correction", state.fastCorrection === true);
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

  if (isCorrect) return;

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

  const workspaceClientPoint = localPointToClientPoint(state.workspace, workspaceLeft, workspaceTop);
  const bankLocalPoint = clientPointToLocalPoint(state.bank, workspaceClientPoint.x, workspaceClientPoint.y);

  const pos = clampBankPosition(state.bank, chip, {
    x: bankLocalPoint.x,
    y: bankLocalPoint.y
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
  scheduleFloatingChipsLayoutRefresh(state, workspace, chips);
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

function updateVisualHintRanges(state, settings, question) {
  if (
    !settings?.visualHint
    || question?.mode !== LIST_TYPES.WORDS
    || !Array.isArray(question?.answerItems)
  ) {
    state.visualHintRanges = new Map();
    return;
  }

  state.visualHintRanges = getDiscriminatingLetterRanges(question.answerItems);
}

function setChipLabelContent(chip, value, state) {
  if (!chip) return;

  const text = String(value ?? "");
  const ranges = normalizeChipHighlightRanges(state?.visualHintRanges?.get(text), text.length);

  if (!ranges.length) {
    chip.textContent = text;
    return;
  }

  chip.textContent = "";
  let cursor = 0;

  ranges.forEach((range) => {
    appendChipText(chip, text.slice(cursor, range.start));

    const span = document.createElement("span");
    span.className = "oa-chip-discriminant";
    span.textContent = text.slice(range.start, range.end);
    chip.appendChild(span);

    cursor = range.end;
  });

  appendChipText(chip, text.slice(cursor));
}

function appendChipText(chip, text) {
  if (!text) return;
  chip.appendChild(document.createTextNode(text));
}

function normalizeChipHighlightRanges(ranges, textLength) {
  return (Array.isArray(ranges) ? ranges : [])
    .map((range) => ({
      start: clampInt(range?.start, 0, textLength),
      end: clampInt(range?.end, 0, textLength)
    }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start)
    .reduce((out, range) => {
      const previous = out[out.length - 1];
      if (previous && range.start < previous.end) return out;
      out.push(range);
      return out;
    }, []);
}

function createChipElement(value, state, { floating = false } = {}) {
  const chip = document.createElement("button");
  chip.className = `oa-chip${floating ? " oa-chip--floating" : ""}`;
  chip.type = "button";
  chip.dataset.value = value;
  applyChipTypography(chip, value, state);
  setChipLabelContent(chip, value, state);
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
  const surfaceScale = getElementClientScale(dragSurface);
  const chipLocalPoint = clientPointToLocalPoint(dragSurface, chipRect.left, chipRect.top);
  const pointerLocalPoint = clientPointToLocalPoint(dragSurface, ev.clientX, ev.clientY);
  const source = state.showAnswerBox
    ? (isValueInAnswer(state, chip.dataset.value) ? "answer" : "bank")
    : "free";

  const proxy = chip.cloneNode(true);
  proxy.classList.add("oa-chip--drag-proxy");
  proxy.classList.remove("oa-chip--locked", "oa-chip--floating", "oa-chip--drag-source-hidden");
  proxy.style.width = `${Math.round(chipRect.width / surfaceScale.x)}px`;
  proxy.style.height = `${Math.round(chipRect.height / surfaceScale.y)}px`;
  proxy.style.left = `${Math.round(chipLocalPoint.x)}px`;
  proxy.style.top = `${Math.round(chipLocalPoint.y)}px`;
  dragSurface.appendChild(proxy);

  chip.classList.add("oa-chip--drag-source-hidden");

  state.drag = {
    value: chip.dataset.value,
    source,
    chip,
    proxy,
    dragSurface,
    pointerOffsetX: pointerLocalPoint.x - chipLocalPoint.x,
    pointerOffsetY: pointerLocalPoint.y - chipLocalPoint.y,
    insertionIndex: getAnswerInsertionIndex(state, ev.clientX),
    overAnswerZone: isPointerInsideAnswerZone(state, ev.clientX, ev.clientY)
  };

  updateDrag(state, ev);
}

function updateDrag(state, ev) {
  const drag = state.drag;
  const dragSurface = drag?.dragSurface;
  if (!drag || !dragSurface) return;

  const proxyWidth = drag.proxy.offsetWidth || drag.chip.offsetWidth || 0;
  const proxyHeight = drag.proxy.offsetHeight || drag.chip.offsetHeight || 0;
  const maxLeft = Math.max(0, dragSurface.clientWidth - proxyWidth);
  const maxTop = Math.max(0, dragSurface.clientHeight - proxyHeight);
  const pointerLocalPoint = clientPointToLocalPoint(dragSurface, ev.clientX, ev.clientY);
  const nextLeft = clamp(pointerLocalPoint.x - drag.pointerOffsetX, 0, maxLeft);
  const nextTop = clamp(pointerLocalPoint.y - drag.pointerOffsetY, 0, maxTop);

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
  const edgeGap = 14;
  const middleShift = 2;

  if (chips.length > 0) {
    if (insertionIndex <= 0) {
      x = chips[0].getBoundingClientRect().left - edgeGap;
    } else if (insertionIndex >= chips.length) {
      const lastRect = chips[chips.length - 1].getBoundingClientRect();
      x = lastRect.right + edgeGap;
    } else {
      const prevRect = chips[insertionIndex - 1].getBoundingClientRect();
      const nextRect = chips[insertionIndex].getBoundingClientRect();
      x = Math.round((prevRect.right + nextRect.left) / 2) + middleShift;
    }
  }

  const localPoint = clientPointToLocalPoint(state.answerZone, x, answerZoneRect.top + (answerZoneRect.height / 2));
  const markerLeft = clamp(Math.round(localPoint.x), 0, state.answerZone.clientWidth || 0);
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
  const isCorrect = isAnswerCorrect([...state.answerOrder], state.currentQuestion?.answerItems || []);
  state.fastCorrection = isCorrect;
  state.latestContext?.services?.requestAnswerPhase?.({
    manual: false,
    showAnswerNow: true,
    wasCorrect: isCorrect,
    skipValidationReview: true,
    answerControlsDelayMs: getCorrectionAnimationDurationMs(state, isCorrect)
  });
}

function getCorrectionAnimationDurationMs(state, isCorrect) {
  const itemCount = Math.max(1, state.currentQuestion?.answerItems?.length || 1);
  const staggerMs = isCorrect ? CORRECT_CORRECTION_STAGGER_MS : CORRECTION_STAGGER_MS;
  const moveMs = isCorrect ? CORRECT_CORRECTION_MOVE_MS : CORRECTION_MOVE_MS;
  return Math.max(0, (itemCount - 1) * staggerMs + moveMs + CORRECTION_CONTROLS_BUFFER_MS);
}

function getCorrectionStaggerMs(state) {
  return state.fastCorrection ? CORRECT_CORRECTION_STAGGER_MS : CORRECTION_STAGGER_MS;
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

  if (!state.showAnswerBox) {
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
    setChipLabelContent(chip, value, state);
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

  originals.forEach(({ value, rect }, index) => {
    const clone = document.createElement("div");
    clone.className = "oa-chip oa-chip--correction-copy";
    clone.dataset.value = value;
    setChipLabelContent(clone, value, state);

    const localRect = clientRectToLocalBox(workspace, rect);
    clone.style.width = `${Math.round(localRect.width)}px`;
    clone.style.height = `${Math.round(localRect.height)}px`;
    clone.style.left = `${Math.round(localRect.left)}px`;
    clone.style.top = `${Math.round(localRect.top)}px`;
    overlay.appendChild(clone);

    const target = laneMap.get(value);
    if (!target) return;

    const timerId = window.setTimeout(() => {
      const targetBox = positionsAreLocal
        ? target
        : clientRectToLocalBox(workspace, target);
      const targetLeft = positionsAreLocal ? target.x : targetBox.left;
      const targetTop = positionsAreLocal ? target.y : targetBox.top;

      startCorrectionMove(clone, targetLeft, targetTop);
    }, index * getCorrectionStaggerMs(state));

    state.correctionTimers.push(timerId);
  });
}

function animateBankOriginalsToLane(state, bankOriginalsByValue, laneMap, workspace, answerItems) {
  answerItems.forEach((value, index) => {
    const original = bankOriginalsByValue.get(value);
    if (!original) return;

    const target = laneMap.get(value);
    if (!target) return;

    const { chip, rect } = original;
    const localRect = clientRectToLocalBox(workspace, rect);

    chip.classList.add("oa-chip--locked", "oa-chip--floating");
    chip.classList.remove("oa-chip--drag-source-hidden");
    chip.style.left = `${Math.round(localRect.left)}px`;
    chip.style.top = `${Math.round(localRect.top)}px`;
    chip.style.zIndex = "6";

    workspace.appendChild(chip);
    state.movedCorrectionOriginals.push(chip);

    const timerId = window.setTimeout(() => {
      const targetBox = clientRectToLocalBox(workspace, target);
      startCorrectionMove(chip, targetBox.left, targetBox.top);
    }, index * getCorrectionStaggerMs(state));

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
    }, index * getCorrectionStaggerMs(state));

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

function buildItemMetaByValue(question) {
  const items = Array.isArray(question?.itemMeta) ? question.itemMeta : [];
  return new Map(items.map((item) => [String(item.value ?? ""), item]));
}

function applyChipTypography(chip, value, state) {
  if (!chip) return;
  const meta = state?.itemMetaByValue?.get?.(String(value ?? ""));
  const writing = meta?.writing === "cursive" ? "cursive" : "script";
  const caseValue = meta?.case === "upper" ? "upper" : "lower";
  chip.classList.toggle("oa-chip--writing-cursive", writing === "cursive");
  chip.classList.toggle("oa-chip--writing-script", writing !== "cursive");
  chip.classList.toggle("oa-chip--case-upper", caseValue === "upper");
  chip.classList.toggle("oa-chip--case-lower", caseValue !== "upper");
}

function renderAlphabetHelp(state, settings = {}) {
  const slot = state.alphabetHelpSlot;
  if (!slot) return;

  if (!settings?.showAlphabet) {
    slot.innerHTML = "";
    slot.hidden = true;
    return;
  }

  slot.hidden = false;
  const initialCase = settings?.caseMode === "upper" ? "upper" : "lower";
  const initialWriting = settings?.writingMode === "cursive" ? "cursive" : "script";
  slot.innerHTML = buildAlphabetHelpHtml(initialCase, initialWriting);
  syncAlphabetHelp(slot);

  slot.querySelector("[data-oa-alpha-case]")?.addEventListener("click", () => {
    const root = slot.querySelector(".oa-alphabet-help");
    if (!root) return;
    root.dataset.case = root.dataset.case === "upper" ? "lower" : "upper";
    syncAlphabetHelp(slot);
  });

  slot.querySelector("[data-oa-alpha-writing]")?.addEventListener("click", () => {
    const root = slot.querySelector(".oa-alphabet-help");
    if (!root) return;
    root.dataset.writing = root.dataset.writing === "cursive" ? "script" : "cursive";
    syncAlphabetHelp(slot);
  });
}

function buildAlphabetHelpHtml(caseValue, writingValue) {
  return `
    <div class="oa-alphabet-help" data-case="${escapeAttr(caseValue)}" data-writing="${escapeAttr(writingValue)}">
      <div class="oa-alphabet-seyes" aria-label="Alphabet d’aide"></div>
      <div class="oa-alphabet-actions" aria-label="Réglages de l’aide alphabet">
        <button class="oa-alphabet-action" type="button" data-oa-alpha-case></button>
        <button class="oa-alphabet-action" type="button" data-oa-alpha-writing></button>
      </div>
    </div>
  `;
}

function syncAlphabetHelp(slot) {
  const root = slot.querySelector(".oa-alphabet-help");
  const target = slot.querySelector(".oa-alphabet-seyes");
  const caseBtn = slot.querySelector("[data-oa-alpha-case]");
  const writingBtn = slot.querySelector("[data-oa-alpha-writing]");
  if (!root || !target) return;

  const caseValue = root.dataset.case === "upper" ? "upper" : "lower";
  const writingValue = root.dataset.writing === "cursive" ? "cursive" : "script";
  const letters = "abcdefghijklmnopqrstuvwxyz".split("").map((letter) => caseValue === "upper" ? letter.toUpperCase() : letter);

  target.classList.toggle("oa-alphabet-seyes--cursive", writingValue === "cursive");
  target.classList.toggle("oa-alphabet-seyes--script", writingValue !== "cursive");
  target.innerHTML = letters
    .map((letter) => `<span class="oa-alphabet-letter"><span class="oa-alphabet-letter-glyph">${escapeHtml(letter)}</span></span>`)
    .join("");

  if (caseBtn) caseBtn.textContent = caseValue === "upper" ? "MAJ" : "min";
  if (writingBtn) writingBtn.textContent = writingValue === "cursive" ? "script" : "cursif";
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
  state.visualHintRanges = new Map();
  state.itemMetaByValue = new Map();
  state.chipsByValue.clear();
  state.answerRevealed = false;
  state.locked = false;
  state.lastQuestionId = null;
  if (container) {
    container.innerHTML = "";
  }
}

async function loadPublicWordCatalog() {
  if (!publicWordCatalogPromise) {
    publicWordCatalogPromise = listPublicPhonologyWords()
      .then((rows) => Array.isArray(rows) ? rows : [])
      .catch((error) => {
        publicWordCatalogPromise = null;
        throw error;
      });
  }

  const entries = await publicWordCatalogPromise;
  if (entries.length > 0) return entries;
  throw new Error("La banque de mots est vide ou indisponible.");
}

function scheduleBankChipsLayoutRefresh(state) {
  const refresh = () => {
    if (state.drag || !state.showAnswerBox || state.locked) return;
    if (!state.bank?.isConnected) return;

    const chips = state.bankOrder
      .map((value) => state.chipsByValue.get(value))
      .filter(Boolean);

    if (chips.length === 0 || !chips.every((chip) => chip.parentElement === state.bank)) return;

    const positions = computeTopAlignedLayout(state.bank, chips);
    state.bankPositions.clear();
    state.bankOrder.forEach((value, index) => {
      state.bankPositions.set(value, positions[index] || { x: GROUP_MARGIN, y: GROUP_MARGIN });
    });
    layoutBankChips(state);
  };

  requestAnimationFrame(() => {
    refresh();
    requestAnimationFrame(refresh);
  });

  document.fonts?.ready?.then(refresh).catch?.(() => {});
}

function scheduleFloatingChipsLayoutRefresh(state, workspace, chips) {
  const refresh = () => {
    if (state.drag || state.showAnswerBox || state.locked) return;
    if (!workspace?.isConnected) return;
    if (!chips.every((chip) => chip?.parentElement === workspace)) return;
    placeFloatingChipsAtTop(workspace, chips);
  };

  requestAnimationFrame(() => {
    refresh();
    requestAnimationFrame(refresh);
  });

  document.fonts?.ready?.then(refresh).catch?.(() => {});
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

function clientRectToLocalBox(element, rect) {
  const topLeft = clientPointToLocalPoint(element, rect.left, rect.top);
  const scale = getElementClientScale(element);
  return {
    left: topLeft.x,
    top: topLeft.y,
    width: Math.max(1, (rect.width || 1) / scale.x),
    height: Math.max(1, (rect.height || 1) / scale.y)
  };
}

function getContainerClientOrigin(container) {
  const rect = container.getBoundingClientRect();
  return {
    left: rect.left + (container.clientLeft || 0),
    top: rect.top + (container.clientTop || 0)
  };
}

function getElementClientScale(element) {
  const rect = element?.getBoundingClientRect?.();
  const width = Math.max(1, element?.clientWidth || element?.offsetWidth || 1);
  const height = Math.max(1, element?.clientHeight || element?.offsetHeight || 1);
  return {
    x: Math.max(0.0001, (rect?.width || width) / width),
    y: Math.max(0.0001, (rect?.height || height) / height)
  };
}

function clientPointToLocalPoint(element, clientX, clientY) {
  const rect = element.getBoundingClientRect();
  const scale = getElementClientScale(element);
  return {
    x: (Number(clientX) - rect.left - (element.clientLeft || 0)) / scale.x,
    y: (Number(clientY) - rect.top - (element.clientTop || 0)) / scale.y
  };
}

function localPointToClientPoint(element, localX, localY) {
  const rect = element.getBoundingClientRect();
  const scale = getElementClientScale(element);
  return {
    x: rect.left + (element.clientLeft || 0) + (Number(localX) || 0) * scale.x,
    y: rect.top + (element.clientTop || 0) + (Number(localY) || 0) * scale.y
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
  ensureToolInstructionStyles();

  const href = new URL("./activity.css", import.meta.url).href;
  const existingLink = document.querySelector(`link[data-oa-activity-style="${href}"]`);

  if (stylesInjected && activityStyleReadyPromise) return activityStyleReadyPromise;
  stylesInjected = true;

  if (existingLink) {
    activityStyleReadyPromise = activityStyleReadyPromise || waitForStylesheetReady(existingLink);
    return activityStyleReadyPromise;
  }

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.oaActivityStyle = href;
  activityStyleReadyPromise = waitForStylesheetReady(link);
  document.head.appendChild(link);
  return activityStyleReadyPromise;
}

async function waitForActivityRenderReady() {
  await Promise.allSettled([injectStyles()].filter(Boolean));

  const fontPromises = [];
  if (document.fonts?.load) {
    fontPromises.push(document.fonts.load('42px "Andika"', 'WcEjgMN'));
    fontPromises.push(document.fonts.load('58px "BelleAllureGS"', 'WcEjgMN'));
  }

  if (document.fonts?.ready) {
    fontPromises.push(document.fonts.ready);
  }

  await Promise.allSettled(fontPromises.filter(Boolean));
  await nextAnimationFrame();
  await nextAnimationFrame();
}

function waitForStylesheetReady(link) {
  if (!link) return Promise.resolve();

  try {
    if (link.sheet) return Promise.resolve();
  } catch {}

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      link.removeEventListener?.("load", finish);
      link.removeEventListener?.("error", finish);
      resolve();
    };

    link.addEventListener?.("load", finish, { once: true });
    link.addEventListener?.("error", finish, { once: true });
    window.setTimeout(finish, 1500);
  });
}

function nextAnimationFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
