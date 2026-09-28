import { getTimerProgress, getTimerRemainingMs, normalizeTimerState } from "../state.js";

const DING_URL = new URL("./Ding.wav", import.meta.url).href;
const MIN_TIMER_WIDTH = 250;
const MIN_TIMER_HEIGHT = 96;
const MIN_BAR_WIDTH = 150;
const MIN_BAR_HEIGHT = 38;

function clamp(value, min, max){
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function formatClock(milliseconds){
  const seconds = Math.max(0, Math.ceil(Number(milliseconds || 0) / 1000));
  const minutes = Math.floor(seconds / 60);
  return {
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(seconds % 60).padStart(2, "0")
  };
}

function rectToPixels(rect, stageRect){
  return {
    left: rect.x * stageRect.width,
    top: rect.y * stageRect.height,
    width: rect.w * stageRect.width,
    height: rect.h * stageRect.height
  };
}

function applyNormalizedRect(element, rect, stageRect, { minWidth, minHeight } = {}){
  if (!element || !stageRect) return;
  const px = rectToPixels(rect, stageRect);
  const width = Math.max(minWidth || 1, Math.min(stageRect.width, px.width));
  const height = Math.max(minHeight || 1, Math.min(stageRect.height, px.height));
  const left = clamp(px.left, 0, Math.max(0, stageRect.width - width));
  const top = clamp(px.top, 0, Math.max(0, stageRect.height - height));
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
}

function normalizedPositionFromPixels(left, top, width, height, stageRect){
  return {
    x: clamp(left / Math.max(1, stageRect.width), 0, Math.max(0, 1 - width / Math.max(1, stageRect.width))),
    y: clamp(top / Math.max(1, stageRect.height), 0, Math.max(0, 1 - height / Math.max(1, stageRect.height)))
  };
}

function normalizedSizeFromPixels(width, height, stageRect){
  return {
    w: clamp(width / Math.max(1, stageRect.width), 0.12, 0.72),
    h: clamp(height / Math.max(1, stageRect.height), 0.07, 0.52)
  };
}

export function createTimerOverlayProjector({ stage, host, getTimerState, onAction } = {}){
  let rafId = 0;
  let timerNode = null;
  let barNode = null;
  let audio = null;
  let finishSignalledForDeadline = 0;
  let lastRunning = false;
  let destroyed = false;
  let tickerStarted = false;

  function getStageRect(){ return stage?.getBoundingClientRect?.() || { left:0, top:0, width:1, height:1 }; }
  function state(){ return normalizeTimerState(getTimerState?.() || {}); }

  function playDing(){
    try {
      if (!audio) {
        audio = new Audio(DING_URL);
        audio.preload = "auto";
      }
      audio.currentTime = 0;
      const promise = audio.play();
      promise?.catch?.(() => {});
    } catch {}
  }

  function primeAudio(){
    try {
      if (!audio) {
        audio = new Audio(DING_URL);
        audio.preload = "auto";
      }
      audio.load?.();
    } catch {}
  }

  function emit(action, payload = {}){
    onAction?.(action, payload);
  }

  function startDrag(element, event, { kind } = {}){
    if (!element || !stage) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target;
    if (target?.closest?.("button,[data-timer-adjust],[data-timer-resize]")) return;
    const stageRect = getStageRect();
    const startRect = element.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;

    const move = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      const left = clamp(startRect.left - stageRect.left + dx, 0, Math.max(0, stageRect.width - startRect.width));
      const top = clamp(startRect.top - stageRect.top + dy, 0, Math.max(0, stageRect.height - startRect.height));
      element.style.left = `${left}px`;
      element.style.top = `${top}px`;
      moveEvent.preventDefault();
    };
    const end = (endEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (!moved) return;
      const rect = element.getBoundingClientRect();
      const pos = normalizedPositionFromPixels(rect.left - stageRect.left, rect.top - stageRect.top, rect.width, rect.height, stageRect);
      emit(kind === "bar" ? "set-bar-position" : "set-position", pos);
      endEvent.preventDefault();
    };
    window.addEventListener("pointermove", move, { passive:false });
    window.addEventListener("pointerup", end, { passive:false, once:false });
    window.addEventListener("pointercancel", end, { passive:false, once:false });
  }

  function startResize(element, event, { kind } = {}){
    if (!element || !stage) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const stageRect = getStageRect();
    const startRect = element.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const minWidth = kind === "bar" ? MIN_BAR_WIDTH : MIN_TIMER_WIDTH;
    const minHeight = kind === "bar" ? MIN_BAR_HEIGHT : MIN_TIMER_HEIGHT;

    const move = (moveEvent) => {
      const maxWidth = Math.max(minWidth, stageRect.right - startRect.left);
      const maxHeight = Math.max(minHeight, stageRect.bottom - startRect.top);
      const width = clamp(startRect.width + moveEvent.clientX - startX, minWidth, maxWidth);
      const height = clamp(startRect.height + moveEvent.clientY - startY, minHeight, maxHeight);
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
      moveEvent.preventDefault();
    };
    const end = (endEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      const rect = element.getBoundingClientRect();
      const size = normalizedSizeFromPixels(rect.width, rect.height, stageRect);
      emit(kind === "bar" ? "set-bar-size" : "set-size", size);
      endEvent.preventDefault();
    };
    window.addEventListener("pointermove", move, { passive:false });
    window.addEventListener("pointerup", end, { passive:false });
    window.addEventListener("pointercancel", end, { passive:false });
  }

  function wireHold(button, deltaSeconds){
    if (!button) return;
    let holdTimer = 0;
    let holdStartedAt = 0;
    let pointerId = null;

    const clear = () => {
      if (holdTimer) window.clearTimeout(holdTimer);
      holdTimer = 0;
      holdStartedAt = 0;
      if (pointerId !== null) {
        try { button.releasePointerCapture?.(pointerId); } catch {}
      }
      pointerId = null;
    };

    const schedule = () => {
      const heldMs = performance.now() - holdStartedAt;
      const delay = heldMs > 2500 ? 45 : heldMs > 1400 ? 80 : heldMs > 700 ? 130 : 220;
      holdTimer = window.setTimeout(() => {
        emit("adjust", { deltaSeconds });
        schedule();
      }, delay);
    };

    button.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      clear();
      event.preventDefault();
      event.stopPropagation();
      pointerId = event.pointerId;
      try { button.setPointerCapture?.(event.pointerId); } catch {}
      emit("adjust", { deltaSeconds });
      holdStartedAt = performance.now();
      holdTimer = window.setTimeout(schedule, 260);
    });
    button.addEventListener("pointerup", clear);
    button.addEventListener("pointercancel", clear);
    button.addEventListener("lostpointercapture", clear);
  }

  function buildTimer(){
    if (timerNode || !host) return;
    timerNode = document.createElement("section");
    timerNode.className = "ttp-timer-widget";
    timerNode.setAttribute("aria-label", "Minuteur");
    timerNode.innerHTML = `
      <div class="ttp-timer-menu" data-timer-drag>
        <button class="ttp-timer-menu-btn is-go" type="button" data-timer-go aria-label="Démarrer" title="Démarrer"><span class="ttp-material-icon" aria-hidden="true">play_arrow</span></button>
        <button class="ttp-timer-menu-btn is-stop" type="button" data-timer-reset aria-label="Remettre à zéro" title="Remettre à zéro"><span class="ttp-material-icon" aria-hidden="true">stop</span></button>
        <button class="ttp-timer-menu-btn is-close" type="button" data-timer-close aria-label="Masquer le minuteur" title="Masquer"><span class="ttp-material-icon" aria-hidden="true">close</span></button>
      </div>
      <div class="ttp-timer-display" data-timer-drag>
        <div class="ttp-timer-number-column">
          <button class="ttp-timer-adjust is-up" type="button" data-timer-adjust="60" aria-label="Ajouter une minute">▲</button>
          <span class="ttp-timer-number" data-timer-minutes>00</span>
          <button class="ttp-timer-adjust is-down" type="button" data-timer-adjust="-60" aria-label="Retirer une minute">▼</button>
        </div>
        <span class="ttp-timer-separator">:</span>
        <div class="ttp-timer-number-column">
          <button class="ttp-timer-adjust is-up" type="button" data-timer-adjust="1" aria-label="Ajouter une seconde">▲</button>
          <span class="ttp-timer-number" data-timer-seconds>00</span>
          <button class="ttp-timer-adjust is-down" type="button" data-timer-adjust="-1" aria-label="Retirer une seconde">▼</button>
        </div>
      </div>
      <button class="ttp-timer-bar-toggle" type="button" data-timer-bar-toggle aria-label="Afficher la jauge" title="Afficher la jauge">❱</button>
      <div class="ttp-widget-resize-grip" data-timer-resize aria-label="Redimensionner"></div>
    `;
    host.appendChild(timerNode);

    timerNode.querySelector("[data-timer-go]")?.addEventListener("click", (event) => {
      event.stopPropagation();
      primeAudio();
      emit("toggle-running");
    });
    timerNode.querySelector("[data-timer-reset]")?.addEventListener("click", (event) => { event.stopPropagation(); emit("reset"); });
    timerNode.querySelector("[data-timer-close]")?.addEventListener("click", (event) => { event.stopPropagation(); emit("set-visible", { visible:false }); });
    timerNode.querySelector("[data-timer-bar-toggle]")?.addEventListener("click", (event) => {
      event.stopPropagation();
      emit("set-bar-visible", { visible: !state().barVisible });
    });
    timerNode.querySelectorAll("[data-timer-adjust]").forEach((button) => wireHold(button, Number(button.dataset.timerAdjust || 0)));
    timerNode.querySelectorAll("[data-timer-drag]").forEach((area) => area.addEventListener("pointerdown", (event) => startDrag(timerNode, event, { kind:"timer" })));
    timerNode.querySelector("[data-timer-resize]")?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      startResize(timerNode, event, { kind:"timer" });
    });
  }

  function buildBar(){
    if (barNode || !host) return;
    barNode = document.createElement("section");
    barNode.className = "ttp-timer-bar-widget";
    barNode.setAttribute("aria-label", "Jauge du minuteur");
    barNode.innerHTML = `
      <div class="ttp-timer-bar-track" data-timer-bar-drag><div class="ttp-timer-bar-fill" data-timer-bar-fill></div></div>
      <div class="ttp-widget-resize-grip" data-timer-bar-resize aria-label="Redimensionner"></div>
    `;
    host.appendChild(barNode);
    barNode.querySelector("[data-timer-bar-drag]")?.addEventListener("pointerdown", (event) => startDrag(barNode, event, { kind:"bar" }));
    barNode.querySelector("[data-timer-bar-resize]")?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      startResize(barNode, event, { kind:"bar" });
    });
  }

  function removeTimer(){ timerNode?.remove?.(); timerNode = null; }
  function removeBar(){ barNode?.remove?.(); barNode = null; }

  function updateFrame(){
    if (destroyed) return;
    const timer = state();
    const now = Date.now();
    const remainingMs = getTimerRemainingMs(timer, now);
    const clock = formatClock(remainingMs);

    if (timerNode) {
      timerNode.classList.toggle("is-running", timer.running && remainingMs > 0);
      const minutes = timerNode.querySelector("[data-timer-minutes]");
      const seconds = timerNode.querySelector("[data-timer-seconds]");
      if (minutes) minutes.textContent = clock.minutes;
      if (seconds) seconds.textContent = clock.seconds;
      const go = timerNode.querySelector("[data-timer-go]");
      const goIcon = go?.querySelector(".ttp-material-icon");
      if (go) {
        const running = timer.running && remainingMs > 0;
        go.setAttribute("aria-label", running ? "Pause" : "Démarrer");
        go.setAttribute("title", running ? "Pause" : "Démarrer");
        go.classList.toggle("is-running", running);
        if (goIcon) goIcon.textContent = running ? "pause" : "play_arrow";
      }
      const barToggle = timerNode.querySelector("[data-timer-bar-toggle]");
      if (barToggle) {
        barToggle.textContent = timer.barVisible ? "❰" : "❱";
        barToggle.setAttribute("aria-label", timer.barVisible ? "Masquer la jauge" : "Afficher la jauge");
        barToggle.setAttribute("title", timer.barVisible ? "Masquer la jauge" : "Afficher la jauge");
      }
    }

    if (barNode) {
      const fill = barNode.querySelector("[data-timer-bar-fill]");
      if (fill) fill.style.width = `${(getTimerProgress(timer, now) * 100).toFixed(3)}%`;
    }

    if (timer.running && remainingMs <= 0) {
      const key = Number(timer.deadlineAt || 0);
      if (key && finishSignalledForDeadline !== key) {
        finishSignalledForDeadline = key;
        playDing();
        emit("finish");
      }
    }
    if (!timer.running && lastRunning) finishSignalledForDeadline = 0;
    lastRunning = timer.running;

    rafId = window.requestAnimationFrame(updateFrame);
  }

  function ensureTicker(){
    if (tickerStarted || destroyed) return;
    tickerStarted = true;
    rafId = window.requestAnimationFrame(updateFrame);
  }

  function render(){
    const timer = state();
    const stageRect = getStageRect();
    if (timer.visible) {
      buildTimer();
      applyNormalizedRect(timerNode, timer.rect, stageRect, { minWidth:MIN_TIMER_WIDTH, minHeight:MIN_TIMER_HEIGHT });
    } else {
      removeTimer();
    }
    if (timer.visible && timer.barVisible) {
      buildBar();
      applyNormalizedRect(barNode, timer.barRect, stageRect, { minWidth:MIN_BAR_WIDTH, minHeight:MIN_BAR_HEIGHT });
    } else {
      removeBar();
    }
    ensureTicker();
  }

  function handleResize(){ render(); }
  window.addEventListener("resize", handleResize);

  return {
    render,
    destroy(){
      destroyed = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
      removeTimer();
      removeBar();
      try { audio?.pause?.(); } catch {}
      audio = null;
    }
  };
}
