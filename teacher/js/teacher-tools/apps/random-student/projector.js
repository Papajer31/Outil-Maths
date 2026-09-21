import {
  RESULT_SCALE_MAX,
  RESULT_SCALE_MIN,
  RESULT_SCALE_STEP,
  createRandomDrawProjectorState,
  normalizeResultPosition,
  normalizeResultScale
} from "./model.js";

const drawAnimations = new Map();
const RESULT_MARGIN_PX = 18;

function formatCssNumber(value){
  return Number(value.toFixed(2)).toString();
}

function getResultFontSize(scale){
  const safeScale = normalizeResultScale(scale);
  return `clamp(${formatCssNumber(54 * safeScale)}px, ${formatCssNumber(10 * safeScale)}vw, ${formatCssNumber(152 * safeScale)}px)`;
}

function clearAnimation(pageId){
  const memory = drawAnimations.get(pageId);
  if (!memory) return;
  if (memory.timer) window.clearTimeout(memory.timer);
  if (memory.settleTimer) window.clearTimeout(memory.settleTimer);
  memory.timer = 0;
  memory.settleTimer = 0;
  memory.animating = false;
}

function getAnimationLabels(state, currentLabel){
  const labels = (Array.isArray(state?.lastDrawPool) ? state.lastDrawPool : [])
    .map((entry) => String(entry?.label || "").trim())
    .filter(Boolean);
  if (currentLabel && !labels.includes(currentLabel)) labels.push(currentLabel);
  if (!labels.length) return [currentLabel || "—"];
  const loop = [...labels];
  while (loop.length < 8) loop.push(...labels);
  return loop.slice(0, 72);
}

function resultTravel(section, resultNode){
  const sectionRect = section?.getBoundingClientRect?.();
  const resultRect = resultNode?.getBoundingClientRect?.();
  if (!sectionRect || !resultRect) return { x: 0, y: 0 };
  return {
    x: Math.max(0, (sectionRect.width - Math.min(sectionRect.width, resultRect.width)) / 2 - RESULT_MARGIN_PX),
    y: Math.max(0, (sectionRect.height - Math.min(sectionRect.height, resultRect.height)) / 2 - RESULT_MARGIN_PX)
  };
}

function applyResultPosition(section, resultNode, state){
  if (!section || !resultNode) return;
  resultNode.style.left = "50%";
  resultNode.style.top = "50%";
  resultNode.style.transform = "translate(-50%, -50%)";
  // Le calcul se fait après avoir placé le résultat au centre pour mesurer sa taille
  // réelle. Les coordonnées enregistrées restent totalement normalisées.
  const travel = resultTravel(section, resultNode);
  const x = normalizeResultPosition(state?.resultPositionX);
  const y = normalizeResultPosition(state?.resultPositionY);
  resultNode.style.left = `calc(50% + ${x * travel.x}px)`;
  resultNode.style.top = `calc(50% + ${y * travel.y}px)`;
}

function bindResultDrag(section, resultNode){
  if (!section || !resultNode || resultNode.__ttpRandomDragBound) return;
  resultNode.__ttpRandomDragBound = true;
  resultNode.addEventListener("pointerdown", (event) => {
    if (section.classList.contains("is-drawing")) return;
    const state = createRandomDrawProjectorState({ state: section.__ttpRandomState });
    if (!state.currentItem) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const travel = resultTravel(section, resultNode);
    if (travel.x <= 0 && travel.y <= 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const startPositionX = normalizeResultPosition(state.resultPositionX);
    const startPositionY = normalizeResultPosition(state.resultPositionY);
    let nextX = startPositionX;
    let nextY = startPositionY;
    let moved = false;

    const move = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      nextX = travel.x > 0 ? normalizeResultPosition(startPositionX + dx / travel.x) : 0;
      nextY = travel.y > 0 ? normalizeResultPosition(startPositionY + dy / travel.y) : 0;
      moved = moved || Math.hypot(dx, dy) > 3;
      const preview = { ...state, resultPositionX: nextX, resultPositionY: nextY };
      section.__ttpRandomState = preview;
      applyResultPosition(section, resultNode, preview);
      moveEvent.preventDefault();
      moveEvent.stopPropagation();
    };
    const end = (endEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      try { resultNode.releasePointerCapture?.(event.pointerId); } catch {}
      if (moved && endEvent.type !== "pointercancel") {
        section.__ttpRandomSendAction?.("set-result-position", { positionX: nextX, positionY: nextY });
      } else if (endEvent.type === "pointercancel") {
        section.__ttpRandomState = state;
        applyResultPosition(section, resultNode, state);
      }
      resultNode.classList.remove("is-dragging");
      endEvent.preventDefault();
      endEvent.stopPropagation();
    };

    resultNode.classList.add("is-dragging");
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end, { passive: false });
    window.addEventListener("pointercancel", end, { passive: false });
    try { resultNode.setPointerCapture?.(event.pointerId); } catch {}
    event.preventDefault();
    event.stopPropagation();
  }, { passive: false });
}

function startAnimation({ pageId, section, resultNode, state, currentLabel, drawSerial } = {}){
  if (!pageId || !section || !resultNode || !currentLabel) return;
  clearAnimation(pageId);
  const memory = drawAnimations.get(pageId) || {};
  const labels = getAnimationLabels(state, currentLabel);
  const steps = Math.max(20, Math.min(34, labels.length * 4));
  memory.drawSerial = drawSerial;
  memory.initialized = true;
  memory.animating = true;
  drawAnimations.set(pageId, memory);
  section.classList.add("is-drawing");
  section.classList.remove("is-settling");

  let step = 0;
  const tick = () => {
    if (!resultNode.isConnected) return;
    if (step >= steps) {
      resultNode.textContent = currentLabel;
      applyResultPosition(section, resultNode, state);
      section.classList.remove("is-drawing");
      section.classList.add("is-settling");
      memory.animating = false;
      memory.settleTimer = window.setTimeout(() => section.isConnected && section.classList.remove("is-settling"), 420);
      return;
    }
    const progress = steps <= 1 ? 1 : step / (steps - 1);
    const index = (step * 3 + Math.floor(Math.random() * labels.length)) % labels.length;
    resultNode.textContent = labels[index] || currentLabel;
    applyResultPosition(section, resultNode, state);
    step += 1;
    memory.timer = window.setTimeout(tick, 34 + Math.round(progress * progress * 130));
  };
  memory.timer = window.setTimeout(tick, 0);
}

export function renderRandomStudentQuickActions({ host, state, sendAction } = {}){
  if (!host) return;
  const safeState = createRandomDrawProjectorState({ state });
  host.innerHTML = `
    <button class="ttp-quick-action-btn ttp-quick-action-icon-only" type="button" data-random-quick-draw title="Tirer" aria-label="Tirer" ${safeState.totalCount ? "" : "disabled"}>
      <span class="ttp-material-icon" aria-hidden="true">casino</span>
    </button>`;
  host.querySelector("[data-random-quick-draw]")?.addEventListener("click", () => sendAction?.("draw"));
}

export function renderRandomStudentProjector({ host, chromeHost, state, page, sendAction } = {}){
  if (!host) return;
  const safeState = createRandomDrawProjectorState({ state });
  const pageId = String(page?.id || "random-draw");
  const currentLabel = String(safeState.currentItem?.label || "").trim();
  const drawSerial = Math.max(0, Math.trunc(Number(safeState.drawSerial) || 0));
  const memory = drawAnimations.get(pageId) || {};
  const shouldAnimate = Boolean(currentLabel) && memory.initialized === true && drawSerial > (Number(memory.drawSerial) || 0);
  const resultFontSize = getResultFontSize(safeState.resultScale);

  host.innerHTML = `
    <section class="ttp-random-draw${currentLabel ? " has-result" : ""}" aria-live="polite">
      <div class="ttp-random-draw-result${currentLabel ? " is-movable" : ""}" style="font-size:${resultFontSize}" ${currentLabel ? 'tabindex="0" title="Déplacer le résultat"' : ""}>${currentLabel || "—"}</div>
    </section>`;

  const section = host.querySelector(".ttp-random-draw");
  const resultNode = host.querySelector(".ttp-random-draw-result");
  if (section) {
    section.__ttpRandomState = safeState;
    section.__ttpRandomSendAction = sendAction;
  }
  applyResultPosition(section, resultNode, safeState);
  bindResultDrag(section, resultNode);

  if (!memory.initialized) {
    drawAnimations.set(pageId, { ...memory, initialized: true, drawSerial, animating: false });
  } else if (shouldAnimate) {
    startAnimation({ pageId, section, resultNode, state: safeState, currentLabel, drawSerial });
  } else {
    clearAnimation(pageId);
    drawAnimations.set(pageId, { ...memory, initialized: true, drawSerial, animating: false });
  }

  if (!chromeHost) return;
  const isScaleMin = safeState.resultScale <= RESULT_SCALE_MIN;
  const isScaleMax = safeState.resultScale >= RESULT_SCALE_MAX;
  chromeHost.innerHTML = `
    <button class="ttp-widget-action-btn" type="button" data-random-draw="reset" ${safeState.sourceCount ? "" : "disabled"}>
      <span class="ttp-material-icon" aria-hidden="true">restart_alt</span><span>Réinitialiser</span>
    </button>
    <label class="ttp-random-draw-toggle">
      <input type="checkbox" data-random-draw-avoid ${safeState.avoidRepeats ? "checked" : ""}>
      <span>${safeState.avoidRepeats ? "Sans remise" : "Avec remise"}</span>
    </label>
    <button class="ttp-widget-action-btn" type="button" data-random-draw="smaller" title="Diminuer la taille du texte" aria-label="Diminuer la taille du texte" ${isScaleMin ? "disabled" : ""}>
      <span class="ttp-material-icon" aria-hidden="true">text_decrease</span>
    </button>
    <button class="ttp-widget-action-btn" type="button" data-random-draw="larger" title="Augmenter la taille du texte" aria-label="Augmenter la taille du texte" ${isScaleMax ? "disabled" : ""}>
      <span class="ttp-material-icon" aria-hidden="true">text_increase</span>
    </button>
    <button class="ttp-widget-action-btn" type="button" data-random-draw="center" title="Recentrer le résultat" aria-label="Recentrer le résultat" ${currentLabel ? "" : "disabled"}>
      <span class="ttp-material-icon" aria-hidden="true">center_focus_strong</span>
    </button>`;
  chromeHost.querySelector("[data-random-draw='reset']")?.addEventListener("click", () => sendAction?.("reset"));
  chromeHost.querySelector("[data-random-draw-avoid]")?.addEventListener("change", (event) => {
    sendAction?.("set-avoid-repeats", { avoidRepeats: event.currentTarget.checked === true });
  });
  chromeHost.querySelector("[data-random-draw='smaller']")?.addEventListener("click", () => sendAction?.("adjust-result-scale", { delta: -RESULT_SCALE_STEP }));
  chromeHost.querySelector("[data-random-draw='larger']")?.addEventListener("click", () => sendAction?.("adjust-result-scale", { delta: RESULT_SCALE_STEP }));
  chromeHost.querySelector("[data-random-draw='center']")?.addEventListener("click", () => sendAction?.("center-result"));
}
