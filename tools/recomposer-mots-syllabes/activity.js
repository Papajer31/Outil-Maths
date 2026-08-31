import {
  normalizeSettings,
  setWordCatalog,
  pickQuestion,
  questionKey,
  getTokenLabel,
  evaluateZoneOrders
} from "./model.js";
import { listPublicPhonologyWords } from "../../shared/public-api.js";
import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveQuestionInstructionText,
  setToolInstructionText
} from "../../shared/tool-instruction.js";

let stylesReadyPromise = null;
let catalogPromise = null;

const DRAG_THRESHOLD_PX = 8;
const BANK_MARGIN = 18;
const BANK_GAP = 16;

export function createActivity(initialContext = {}) {
  const state = createRuntimeState(initialContext);

  return {
    async mount(container, context = initialContext) {
      state.container = container;
      syncRuntimeState(state, context);
      await Promise.all([injectStyles(), ensureCatalog()]);
      renderShell(state);
      syncValidationState(state);
    },

    async next(container, context = initialContext) {
      state.container = container || state.container;
      if (!state.container) return;
      syncRuntimeState(state, context);
      await Promise.all([injectStyles(), ensureCatalog()]);
      if (!state.root?.isConnected) renderShell(state);
      loadNextQuestion(state);
    },

    showAnswer(container, context = initialContext) {
      state.container = container || state.container;
      syncRuntimeState(state, context);
      if (!state.currentQuestion) return;
      if (!state.studentZoneOrdersSnapshot) {
        state.studentZoneOrdersSnapshot = cloneZoneOrders(state.zoneOrders);
      }
      state.locked = true;
      state.answerRevealed = true;
      state.lastEvaluation = evaluateZoneOrders(state.currentQuestion, state.studentZoneOrdersSnapshot);
      state.phaseMode = "answer";
      state.answerDisplayMode = "correction";
      renderInteractiveQuestion(state);
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
        canToggle:canToggleAnswerDisplay(state),
        mode:state.answerDisplayMode === "student" ? "student" : "correction",
        transitionTargets:getCorrectionTransitionTargets(state)
      };
    },

    setShellAnswerDisplayMode(container, context = state.latestContext, mode = "correction") {
      state.container = container || state.container;
      syncRuntimeState(state, context ?? state.latestContext);
      if (!canToggleAnswerDisplay(state)) return false;
      state.answerDisplayMode = mode === "student" ? "student" : "correction";
      renderInteractiveQuestion(state);
      return true;
    },

    unmount(container) {
      teardown(state, container || state.container);
    }
  };
}

function createRuntimeState(initialContext) {
  return {
    container:null,
    latestContext:initialContext,
    settings:normalizeSettings(initialContext?.settings),
    responseUi:getResponseUi(initialContext),
    root:null,
    instructionEl:null,
    workspace:null,
    bank:null,
    answersGrid:null,
    currentQuestion:null,
    lastQuestionKey:"",
    usedWordSlugs:new Set(),
    tokenMeta:new Map(),
    chipsById:new Map(),
    bankOrder:[],
    bankPositions:new Map(),
    zoneOrders:[],
    zones:[],
    drag:null,
    locked:false,
    answerRevealed:false,
    studentZoneOrdersSnapshot:null,
    lastEvaluation:null,
    phaseMode:"idle",
    answerDisplayMode:"correction",
    resizeObserver:null
  };
}

function syncRuntimeState(state, context = {}) {
  state.latestContext = context ?? state.latestContext;
  state.settings = normalizeSettings(state.latestContext?.settings);
  state.responseUi = getResponseUi(state.latestContext);
}

function renderShell(state) {
  if (!state.container) return;
  disconnectResizeObserver(state);
  state.container.innerHTML = `
    <div class="rms-root" data-response-ui="${escapeAttr(state.responseUi)}">
      ${renderToolInstruction({ id:"rms_instruction" })}
      <div class="rms-workspace" id="rms_workspace">
        <div class="rms-bank" id="rms_bank"></div>
        <div class="rms-answers" id="rms_answers"></div>
      </div>
    </div>
  `;
  state.root = state.container.querySelector(".rms-root");
  state.instructionEl = state.container.querySelector("#rms_instruction");
  state.workspace = state.container.querySelector("#rms_workspace");
  state.bank = state.container.querySelector("#rms_bank");
  state.answersGrid = state.container.querySelector("#rms_answers");
  updateInstruction(state);
  observeResize(state);
}

function loadNextQuestion(state) {
  clearDrag(state);
  state.locked = false;
  state.answerRevealed = false;
  state.studentZoneOrdersSnapshot = null;
  state.lastEvaluation = null;
  state.phaseMode = "question";
  state.answerDisplayMode = "correction";
  state.bankPositions.clear();
  state.chipsById.clear();
  state.tokenMeta.clear();

  const nextQuestion = pickQuestion(state.settings, {
    avoidKey:state.lastQuestionKey,
    usedWordSlugs:state.usedWordSlugs
  });
  if (!nextQuestion) {
    renderEmpty(state, "Impossible de générer une question avec ces réglages.");
    return;
  }

  state.currentQuestion = nextQuestion;
  state.lastQuestionKey = questionKey(nextQuestion);
  nextQuestion.words.forEach((word) => state.usedWordSlugs.add(word.slug));
  if (state.usedWordSlugs.size > 1000) state.usedWordSlugs.clear();
  state.tokenMeta = new Map(nextQuestion.tokenMeta.map((token) => [token.id, token]));
  state.bankOrder = [...nextQuestion.items];
  state.zoneOrders = Array.from({ length:nextQuestion.words.length }, () => []);
  updateInstruction(state);
  renderInteractiveQuestion(state);
  syncValidationState(state);
}

function renderEmpty(state, text) {
  if (state.bank) state.bank.innerHTML = `<div class="rms-empty">${escapeHtml(text)}</div>`;
  if (state.answersGrid) state.answersGrid.innerHTML = "";
  updateInstruction(state);
}

function renderInteractiveQuestion(state) {
  if (!state.bank || !state.answersGrid || !state.currentQuestion) return;

  const tokenIds = state.currentQuestion.tokenMeta.map((token) => token.id);
  for (const tokenId of tokenIds) {
    if (!state.chipsById.has(tokenId)) {
      state.chipsById.set(tokenId, createChip(state, tokenId));
    }
  }

  const displayedZoneOrders = getDisplayedZoneOrders(state);
  const correctionZoneOrders = state.phaseMode === "answer" ? getCorrectionZoneOrders(state) : [];
  const correctionMatchMask = state.phaseMode === "answer"
    ? getCorrectionMatchMask(state, correctionZoneOrders)
    : [];
  const assigned = new Set(displayedZoneOrders.flat());
  state.bankOrder = state.currentQuestion.items.filter((id) => !assigned.has(id));

  state.bank.innerHTML = "";
  state.answersGrid.innerHTML = "";
  state.answersGrid.dataset.count = String(displayedZoneOrders.length);
  state.zones = [];

  state.bankOrder.forEach((id) => {
    const chip = state.chipsById.get(id);
    resetChipFeedback(chip);
    chip.classList.add("oa-chip--floating");
    chip.style.left = "";
    chip.style.top = "";
    state.bank.appendChild(chip);
  });

  displayedZoneOrders.forEach((order, zoneIndex) => {
    const zone = document.createElement("div");
    zone.className = "rms-answer-zone";
    zone.dataset.zoneIndex = String(zoneIndex);

    const track = document.createElement("div");
    track.className = "rms-answer-track";
    const marker = document.createElement("div");
    marker.className = "rms-insert-marker hidden";
    zone.append(track, marker);

    order.forEach((id, tokenIndex) => {
      const chip = state.chipsById.get(id);
      resetChipFeedback(chip);
      chip.classList.remove("oa-chip--floating");
      chip.style.left = "";
      chip.style.top = "";

      if (state.phaseMode === "answer") {
        const positionWasCorrect = correctionMatchMask?.[zoneIndex]?.[tokenIndex] === true;
        if (state.answerDisplayMode === "student") {
          chip.classList.add(positionWasCorrect ? "rms-chip--correct" : "rms-chip--wrong");
        } else {
          chip.classList.add(positionWasCorrect ? "rms-chip--correct" : "rms-chip--correction");
        }
      }

      track.appendChild(chip);
    });

    if (state.phaseMode === "answer") {
      const isZoneCorrect = !!state.lastEvaluation?.zoneCorrect?.[zoneIndex];
      if (state.answerDisplayMode === "student") {
        zone.classList.add(isZoneCorrect ? "rms-answer-zone--correct" : "rms-answer-zone--incorrect");
      } else {
        zone.classList.add(isZoneCorrect ? "rms-answer-zone--correct" : "rms-answer-zone--correction");
      }
    }

    state.answersGrid.appendChild(zone);
    state.zones.push({ zone, track, marker });
    scaleTrack(track, zone);
  });

  layoutBank(state);
  requestAnimationFrame(() => {
    layoutBank(state);
    state.zones.forEach(({ track, zone }) => scaleTrack(track, zone));
  });
  document.fonts?.ready?.then(() => {
    if (!state.root?.isConnected) return;
    layoutBank(state);
    state.zones.forEach(({ track, zone }) => scaleTrack(track, zone));
  }).catch?.(() => {});

  syncValidationState(state);
}

function resetChipFeedback(chip) {
  chip?.classList?.remove("rms-chip--correct", "rms-chip--wrong", "rms-chip--correction");
}

function createChip(state, tokenId) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "oa-chip oa-chip--writing-script oa-chip--case-lower";
  chip.dataset.tokenId = tokenId;
  chip.textContent = getTokenLabel(state.currentQuestion, tokenId);
  attachDragBehavior(state, chip);
  return chip;
}

function attachDragBehavior(state, chip) {
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let dragStarted = false;

  const onMove = (event) => {
    if (pointerId !== event.pointerId || state.locked) return;
    if (!dragStarted && Math.hypot(event.clientX - startX, event.clientY - startY) >= DRAG_THRESHOLD_PX) {
      dragStarted = true;
      startDrag(state, chip, event);
    }
    if (dragStarted) updateDrag(state, event);
  };

  const onUp = (event) => {
    if (pointerId !== event.pointerId) return;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    try { chip.releasePointerCapture?.(event.pointerId); } catch {}

    if (dragStarted) {
      finishDrag(state, event);
    } else if (!state.locked) {
      const zoneIndex = findTokenZone(state, chip.dataset.tokenId);
      if (zoneIndex >= 0) moveTokenBackToBank(state, chip.dataset.tokenId);
    }
    pointerId = null;
    dragStarted = false;
  };

  chip.addEventListener("pointerdown", (event) => {
    if (state.locked || (event.button != null && event.button !== 0)) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    dragStarted = false;
    try { chip.setPointerCapture?.(event.pointerId); } catch {}
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  });
}

function startDrag(state, chip, event) {
  if (!state.workspace) return;
  const rect = chip.getBoundingClientRect();
  const workspaceRect = state.workspace.getBoundingClientRect();
  const scale = getElementScale(state.workspace);
  const sourceZoneIndex = findTokenZone(state, chip.dataset.tokenId);

  const proxy = chip.cloneNode(true);
  proxy.classList.add("oa-chip--drag-proxy");
  proxy.classList.remove("oa-chip--floating", "oa-chip--drag-source-hidden");
  proxy.style.width = `${rect.width / scale.x}px`;
  proxy.style.height = `${rect.height / scale.y}px`;
  proxy.style.left = `${(rect.left - workspaceRect.left) / scale.x}px`;
  proxy.style.top = `${(rect.top - workspaceRect.top) / scale.y}px`;
  state.workspace.appendChild(proxy);
  chip.classList.add("oa-chip--drag-source-hidden");

  state.drag = {
    tokenId:chip.dataset.tokenId,
    chip,
    proxy,
    sourceZoneIndex,
    pointerOffsetX:(event.clientX - rect.left) / scale.x,
    pointerOffsetY:(event.clientY - rect.top) / scale.y,
    targetZoneIndex:-1,
    insertionIndex:0
  };
  updateDrag(state, event);
}

function updateDrag(state, event) {
  const drag = state.drag;
  if (!drag || !state.workspace) return;
  const local = clientPointToLocal(state.workspace, event.clientX, event.clientY);
  const maxLeft = Math.max(0, state.workspace.clientWidth - drag.proxy.offsetWidth);
  const maxTop = Math.max(0, state.workspace.clientHeight - drag.proxy.offsetHeight);
  drag.proxy.style.left = `${clamp(local.x - drag.pointerOffsetX, 0, maxLeft)}px`;
  drag.proxy.style.top = `${clamp(local.y - drag.pointerOffsetY, 0, maxTop)}px`;

  const targetZoneIndex = findZoneAtPoint(state, event.clientX, event.clientY);
  hideAllMarkers(state);
  drag.targetZoneIndex = targetZoneIndex;
  if (targetZoneIndex >= 0) {
    drag.insertionIndex = getInsertionIndex(state, targetZoneIndex, event.clientX, drag.tokenId);
    showMarker(state, targetZoneIndex, drag.insertionIndex, drag.tokenId);
  }
}

function finishDrag(state, event) {
  const drag = state.drag;
  if (!drag) return;
  drag.chip.classList.remove("oa-chip--drag-source-hidden");

  const proxyLeft = parseFloat(drag.proxy.style.left || "0");
  const proxyTop = parseFloat(drag.proxy.style.top || "0");
  drag.proxy.remove();

  const targetZone = findZoneAtPoint(state, event.clientX, event.clientY);
  if (targetZone >= 0) {
    moveTokenIntoZone(state, drag.tokenId, targetZone, drag.insertionIndex);
  } else if (drag.sourceZoneIndex >= 0) {
    moveTokenBackToBank(state, drag.tokenId, { workspaceLeft:proxyLeft, workspaceTop:proxyTop });
  } else {
    placeBankTokenFromWorkspace(state, drag.tokenId, proxyLeft, proxyTop);
  }

  hideAllMarkers(state);
  state.drag = null;
}

function moveTokenIntoZone(state, tokenId, zoneIndex, insertionIndex) {
  removeTokenFromZones(state, tokenId);
  const target = state.zoneOrders[zoneIndex] || [];
  const index = clampInt(insertionIndex, 0, target.length);
  target.splice(index, 0, tokenId);
  state.zoneOrders[zoneIndex] = target;
  state.bankPositions.delete(tokenId);
  renderInteractiveQuestion(state);
}

function moveTokenBackToBank(state, tokenId, drop = null) {
  removeTokenFromZones(state, tokenId);
  if (!drop) state.bankPositions.delete(tokenId);
  renderInteractiveQuestion(state);
  if (drop) placeBankTokenFromWorkspace(state, tokenId, drop.workspaceLeft, drop.workspaceTop);
}

function removeTokenFromZones(state, tokenId) {
  state.zoneOrders = state.zoneOrders.map((order) => order.filter((id) => id !== tokenId));
}

function findTokenZone(state, tokenId) {
  return state.zoneOrders.findIndex((order) => order.includes(tokenId));
}

function findZoneAtPoint(state, clientX, clientY) {
  for (let index = 0; index < state.zones.length; index += 1) {
    const rect = state.zones[index].zone.getBoundingClientRect();
    if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) return index;
  }
  return -1;
}

function getInsertionIndex(state, zoneIndex, pointerClientX, draggedTokenId) {
  const zoneState = state.zones[zoneIndex];
  if (!zoneState) return 0;
  const ids = (state.zoneOrders[zoneIndex] || []).filter((id) => id !== draggedTokenId);
  const chips = ids.map((id) => state.chipsById.get(id)).filter(Boolean);
  for (let index = 0; index < chips.length; index += 1) {
    const rect = chips[index].getBoundingClientRect();
    if (pointerClientX < rect.left + rect.width / 2) return index;
  }
  return chips.length;
}

function showMarker(state, zoneIndex, insertionIndex, draggedTokenId) {
  const zoneState = state.zones[zoneIndex];
  if (!zoneState) return;
  const ids = (state.zoneOrders[zoneIndex] || []).filter((id) => id !== draggedTokenId);
  const chips = ids.map((id) => state.chipsById.get(id)).filter(Boolean);
  const zoneRect = zoneState.zone.getBoundingClientRect();
  let clientX = zoneRect.left + zoneRect.width / 2;
  const edgeGap = 14;
  const middleShift = 2;

  if (chips.length) {
    if (insertionIndex <= 0) {
      clientX = chips[0].getBoundingClientRect().left - edgeGap;
    } else if (insertionIndex >= chips.length) {
      clientX = chips[chips.length - 1].getBoundingClientRect().right + edgeGap;
    } else {
      const prev = chips[insertionIndex - 1].getBoundingClientRect();
      const next = chips[insertionIndex].getBoundingClientRect();
      clientX = Math.round((prev.right + next.left) / 2) + middleShift;
    }
  }

  const localPoint = clientPointToLocal(
    zoneState.zone,
    clientX,
    zoneRect.top + zoneRect.height / 2
  );
  const markerLeft = clamp(Math.round(localPoint.x), 0, zoneState.zone.clientWidth || 0);
  zoneState.marker.style.left = `${markerLeft}px`;
  zoneState.marker.classList.remove("hidden");
}

function hideAllMarkers(state) {
  state.zones.forEach(({ marker }) => marker.classList.add("hidden"));
}

function layoutBank(state) {
  if (!state.bank) return;
  const missing = state.bankOrder.filter((id) => !state.bankPositions.has(id));
  if (missing.length) {
    const chips = missing.map((id) => state.chipsById.get(id)).filter(Boolean);
    const positions = computeWrappedLayout(state.bank, chips);
    missing.forEach((id, index) => state.bankPositions.set(id, positions[index] || { x:BANK_MARGIN, y:BANK_MARGIN }));
  }

  state.bankOrder.forEach((id) => {
    const chip = state.chipsById.get(id);
    if (!chip) return;
    const pos = clampBankPosition(state.bank, chip, state.bankPositions.get(id));
    state.bankPositions.set(id, pos);
    chip.style.left = `${pos.x}px`;
    chip.style.top = `${pos.y}px`;
  });
}

function computeWrappedLayout(bank, chips) {
  const width = Math.max(320, bank.clientWidth);
  const available = Math.max(120, width - BANK_MARGIN * 2);
  const rows = [];
  let row = [];
  let rowWidth = 0;
  let rowHeight = 0;

  chips.forEach((chip, index) => {
    const chipWidth = chip.offsetWidth || 100;
    const chipHeight = chip.offsetHeight || 68;
    const nextWidth = row.length ? rowWidth + BANK_GAP + chipWidth : chipWidth;
    if (row.length && nextWidth > available) {
      rows.push({ items:row, width:rowWidth, height:rowHeight });
      row = [];
      rowWidth = 0;
      rowHeight = 0;
    }
    row.push({ index, chipWidth, chipHeight });
    rowWidth = row.length === 1 ? chipWidth : rowWidth + BANK_GAP + chipWidth;
    rowHeight = Math.max(rowHeight, chipHeight);
  });
  if (row.length) rows.push({ items:row, width:rowWidth, height:rowHeight });

  const positions = new Array(chips.length);
  let y = BANK_MARGIN;
  rows.forEach((current) => {
    let x = Math.max(BANK_MARGIN, Math.round((width - current.width) / 2));
    current.items.forEach((item) => {
      positions[item.index] = { x, y:y + Math.round((current.height - item.chipHeight) / 2) };
      x += item.chipWidth + BANK_GAP;
    });
    y += current.height + BANK_GAP;
  });
  return positions;
}

function clampBankPosition(bank, chip, pos = {}) {
  return {
    x:clamp(pos.x ?? BANK_MARGIN, 0, Math.max(0, bank.clientWidth - chip.offsetWidth)),
    y:clamp(pos.y ?? BANK_MARGIN, 0, Math.max(0, bank.clientHeight - chip.offsetHeight))
  };
}

function placeBankTokenFromWorkspace(state, tokenId, workspaceLeft, workspaceTop) {
  if (!state.workspace || !state.bank) return;
  const chip = state.chipsById.get(tokenId);
  if (!chip) return;
  const workspaceRect = state.workspace.getBoundingClientRect();
  const workspaceScale = getElementScale(state.workspace);
  const clientX = workspaceRect.left + workspaceLeft * workspaceScale.x;
  const clientY = workspaceRect.top + workspaceTop * workspaceScale.y;
  const bankLocal = clientPointToLocal(state.bank, clientX, clientY);
  const pos = clampBankPosition(state.bank, chip, bankLocal);
  state.bankPositions.set(tokenId, pos);
  chip.style.left = `${pos.x}px`;
  chip.style.top = `${pos.y}px`;
}

function scaleTrack(track, zone) {
  if (!track || !zone) return;
  track.style.transform = "translate(-50%, -50%) scale(1)";
  const width = Math.ceil(track.scrollWidth || track.getBoundingClientRect().width || 0);
  const available = Math.max(100, zone.clientWidth - 24);
  const scale = width > available ? clamp(available / width, 0.58, 1) : 1;
  track.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

function getCorrectionMatchMask(state, correctionZoneOrders = getCorrectionZoneOrders(state)) {
  const student = state.studentZoneOrdersSnapshot || state.zoneOrders;
  return (Array.isArray(correctionZoneOrders) ? correctionZoneOrders : []).map((expectedOrder, zoneIndex) => {
    const studentOrder = Array.isArray(student?.[zoneIndex]) ? student[zoneIndex] : [];
    return (Array.isArray(expectedOrder) ? expectedOrder : []).map((expectedId, tokenIndex) => {
      const studentId = studentOrder[tokenIndex];
      if (!studentId) return false;
      return getTokenLabel(state.currentQuestion, studentId) === getTokenLabel(state.currentQuestion, expectedId);
    });
  });
}

function getChangedCorrectionTokenIds(state) {
  if (state.phaseMode !== "answer" || !Array.isArray(state.studentZoneOrdersSnapshot)) return new Set();
  const correction = getCorrectionZoneOrders(state);
  const student = state.studentZoneOrdersSnapshot;
  const changed = new Set();

  correction.forEach((expectedOrder, zoneIndex) => {
    const studentOrder = Array.isArray(student?.[zoneIndex]) ? student[zoneIndex] : [];
    const length = Math.max(studentOrder.length, expectedOrder.length);
    for (let tokenIndex = 0; tokenIndex < length; tokenIndex += 1) {
      const studentId = studentOrder[tokenIndex];
      const expectedId = expectedOrder[tokenIndex];
      const studentLabel = studentId ? getTokenLabel(state.currentQuestion, studentId) : "";
      const expectedLabel = expectedId ? getTokenLabel(state.currentQuestion, expectedId) : "";
      if (studentLabel === expectedLabel) continue;
      if (studentId) changed.add(studentId);
      if (expectedId) changed.add(expectedId);
    }
  });

  return changed;
}

function getCorrectionTransitionTargets(state) {
  const changedIds = getChangedCorrectionTokenIds(state);
  if (!changedIds.size) return [];
  return [...changedIds]
    .map((id) => state.chipsById.get(id))
    .filter((chip) => chip?.isConnected);
}

function canValidate(state) {
  const phaseKind = state.latestContext?.services?.getPhaseKind?.() || null;
  const totalTokens = state.currentQuestion?.tokenMeta?.length || 0;
  const assignedTokens = state.zoneOrders.reduce((sum, zone) => sum + zone.length, 0);
  return !state.locked
    && !state.answerRevealed
    && totalTokens > 0
    && assignedTokens === totalTokens
    && state.zoneOrders.every((zone) => zone.length > 0)
    && phaseKind === "QUESTION";
}

function submitCurrentAnswer(state) {
  state.studentZoneOrdersSnapshot = cloneZoneOrders(state.zoneOrders);
  const evaluation = evaluateZoneOrders(state.currentQuestion, state.studentZoneOrdersSnapshot);
  state.lastEvaluation = evaluation;
  const requested = state.latestContext?.services?.requestAnswerPhase?.({
    manual:false,
    showAnswerNow:true,
    wasCorrect:evaluation.isCorrect
  });

  // Fallback pour les contextes qui n'ont pas de shell de phase de réponse.
  if (!requested) {
    state.locked = true;
    state.answerRevealed = true;
    state.phaseMode = "answer";
    state.answerDisplayMode = "correction";
    renderInteractiveQuestion(state);
  }
  syncValidationState(state);
}

function getDisplayedZoneOrders(state) {
  if (state.phaseMode !== "answer") return state.zoneOrders;
  if (state.answerDisplayMode === "student") {
    return state.studentZoneOrdersSnapshot || state.zoneOrders;
  }
  return getCorrectionZoneOrders(state);
}

function getCorrectionZoneOrders(state) {
  const expectedZones = Array.isArray(state.currentQuestion?.expectedZones)
    ? state.currentQuestion.expectedZones
    : [];
  const snapshot = state.studentZoneOrdersSnapshot || state.zoneOrders;
  const evaluation = state.lastEvaluation || evaluateZoneOrders(state.currentQuestion, snapshot);
  const mapping = Array.isArray(evaluation?.correctionExpectedIndexByZone)
    ? evaluation.correctionExpectedIndexByZone
    : [];

  if (mapping.length !== expectedZones.length) {
    return cloneZoneOrders(expectedZones);
  }

  return mapping.map((expectedIndex, zoneIndex) => {
    const expected = expectedZones[expectedIndex];
    return Array.isArray(expected)
      ? [...expected]
      : [...(expectedZones[zoneIndex] || [])];
  });
}

function cloneZoneOrders(zoneOrders) {
  return (Array.isArray(zoneOrders) ? zoneOrders : [])
    .map((zone) => [...(Array.isArray(zone) ? zone : [])]);
}

function canToggleAnswerDisplay(state) {
  return state.responseUi === "boxed"
    && state.phaseMode === "answer"
    && Array.isArray(state.studentZoneOrdersSnapshot)
    && state.lastEvaluation?.isCorrect === false;
}

function syncValidationState(state) {
  state.latestContext?.services?.notifyValidationStateChanged?.();
}

function updateInstruction(state) {
  if (!state.instructionEl) return;
  const text = resolveQuestionInstructionText(state.latestContext, state.currentQuestion?.prompt || "Recompose les mots avec les syllabes.");
  setToolInstructionText(state.instructionEl, text);
}

async function ensureCatalog() {
  if (!catalogPromise) {
    catalogPromise = listPublicPhonologyWords().then((rows) => {
      setWordCatalog(Array.isArray(rows) ? rows : []);
      return rows;
    }).catch((error) => {
      catalogPromise = null;
      setWordCatalog([]);
      throw error;
    });
  }
  return catalogPromise;
}

function observeResize(state) {
  disconnectResizeObserver(state);
  if (typeof ResizeObserver !== "function" || !state.workspace) return;
  state.resizeObserver = new ResizeObserver(() => {
    if (state.drag || !state.currentQuestion) return;
    layoutBank(state);
    state.zones.forEach(({ track, zone }) => scaleTrack(track, zone));
  });
  state.resizeObserver.observe(state.workspace);
}

function disconnectResizeObserver(state) {
  state.resizeObserver?.disconnect?.();
  state.resizeObserver = null;
}

function clearDrag(state) {
  state.drag?.chip?.classList?.remove?.("oa-chip--drag-source-hidden");
  state.drag?.proxy?.remove?.();
  state.drag = null;
}

function teardown(state, container) {
  disconnectResizeObserver(state);
  clearDrag(state);
  state.currentQuestion = null;
  state.chipsById.clear();
  state.bankPositions.clear();
  state.zoneOrders = [];
  state.zones = [];
  if (container) container.innerHTML = "";
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

function getElementScale(element) {
  const rect = element?.getBoundingClientRect?.();
  const width = Math.max(1, element?.clientWidth || element?.offsetWidth || 1);
  const height = Math.max(1, element?.clientHeight || element?.offsetHeight || 1);
  return {
    x:Math.max(0.0001, (rect?.width || width) / width),
    y:Math.max(0.0001, (rect?.height || height) / height)
  };
}

function clientPointToLocal(element, clientX, clientY) {
  const rect = element.getBoundingClientRect();
  const scale = getElementScale(element);
  return {
    x:(clientX - rect.left) / scale.x,
    y:(clientY - rect.top) / scale.y
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function clampInt(value, min, max) {
  const n = Math.trunc(Number(value));
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
}

async function injectStyles() {
  ensureToolInstructionStyles();
  if (stylesReadyPromise) return stylesReadyPromise;
  const hrefOa = new URL("../ordre-alphabetique-mots/activity.css", import.meta.url).href;
  const hrefOwn = new URL("./activity.css", import.meta.url).href;
  stylesReadyPromise = Promise.all([
    ensureStylesheet(hrefOa, "data-rms-oa-style"),
    ensureStylesheet(hrefOwn, "data-rms-activity-style")
  ]);
  return stylesReadyPromise;
}

function ensureStylesheet(href, datasetAttr) {
  const existing = document.querySelector(`link[${datasetAttr}="${href}"]`);
  if (existing) return Promise.resolve();
  return new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute(datasetAttr, href);
    link.addEventListener("load", resolve, { once:true });
    link.addEventListener("error", resolve, { once:true });
    document.head.appendChild(link);
    setTimeout(resolve, 1500);
  });
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
