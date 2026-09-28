const MAX_TIMER_MS = (99 * 60 + 59) * 1000;

function clamp(value, min, max){
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function normalizeRect(raw, fallback){
  const hasW = Number.isFinite(Number(raw?.w));
  const hasH = Number.isFinite(Number(raw?.h));
  const w = hasW ? clamp(raw.w, 0.12, 0.72) : fallback.w;
  const h = hasH ? clamp(raw.h, 0.07, 0.52) : fallback.h;
  const x = Number.isFinite(Number(raw?.x)) ? Number(raw.x) : fallback.x;
  const y = Number.isFinite(Number(raw?.y)) ? Number(raw.y) : fallback.y;
  return {
    x: clamp(x, 0, Math.max(0, 1 - w)),
    y: clamp(y, 0, Math.max(0, 1 - h)),
    w,
    h
  };
}

export function createInitialOverlayWidgetsState(){
  return {
    annotations: { visible: false },
    timer: {
      visible: false,
      remainingMs: 0,
      maxMs: 0,
      running: false,
      deadlineAt: 0,
      rect: { x: 0.055, y: 0.075, w: 0.245, h: 0.155 },
      barVisible: false,
      barRect: { x: 0.055, y: 0.25, w: 0.34, h: 0.072 }
    }
  };
}

export function getTimerRemainingMs(rawTimer, now = Date.now()){
  const timer = normalizeTimerState(rawTimer);
  if (!timer.running) return timer.remainingMs;
  return Math.max(0, timer.deadlineAt - Number(now || Date.now()));
}

export function normalizeTimerState(raw = {}){
  const initial = createInitialOverlayWidgetsState().timer;
  const running = raw?.running === true;
  const remainingMs = clamp(raw?.remainingMs, 0, MAX_TIMER_MS);
  const deadlineAt = Math.max(0, Number(raw?.deadlineAt) || 0);
  const maxMs = clamp(raw?.maxMs, 0, MAX_TIMER_MS);
  return {
    visible: raw?.visible === true,
    remainingMs,
    maxMs: Math.max(maxMs, remainingMs),
    running: running && deadlineAt > 0,
    deadlineAt: running && deadlineAt > 0 ? deadlineAt : 0,
    rect: normalizeRect(raw?.rect, initial.rect),
    barVisible: raw?.barVisible === true,
    barRect: normalizeRect(raw?.barRect, initial.barRect)
  };
}

export function normalizeOverlayWidgetsState(raw = {}){
  const initial = createInitialOverlayWidgetsState();
  return {
    annotations: { visible: raw?.annotations?.visible === true },
    timer: normalizeTimerState(raw?.timer || initial.timer)
  };
}

function rebaseTimer(rawTimer, now = Date.now()){
  const timer = normalizeTimerState(rawTimer);
  if (!timer.running) return timer;
  const remainingMs = getTimerRemainingMs(timer, now);
  return normalizeTimerState({
    ...timer,
    remainingMs,
    running: remainingMs > 0,
    deadlineAt: remainingMs > 0 ? now + remainingMs : 0
  });
}

function applyTimerAction(rawTimer, action, payload = {}, now = Date.now()){
  let timer = rebaseTimer(rawTimer, now);
  const safeAction = String(action || "").trim();

  if (safeAction === "set-visible") {
    return normalizeTimerState({ ...timer, visible: payload.visible === true });
  }
  if (safeAction === "set-position") {
    return normalizeTimerState({ ...timer, rect: { ...timer.rect, x: payload.x, y: payload.y } });
  }
  if (safeAction === "set-size") {
    return normalizeTimerState({ ...timer, rect: { ...timer.rect, w: payload.w, h: payload.h } });
  }
  if (safeAction === "set-bar-visible") {
    return normalizeTimerState({ ...timer, barVisible: payload.visible === true });
  }
  if (safeAction === "set-bar-position") {
    return normalizeTimerState({ ...timer, barRect: { ...timer.barRect, x: payload.x, y: payload.y } });
  }
  if (safeAction === "set-bar-size") {
    return normalizeTimerState({ ...timer, barRect: { ...timer.barRect, w: payload.w, h: payload.h } });
  }
  if (safeAction === "reset") {
    return normalizeTimerState({
      ...timer,
      remainingMs: 0,
      maxMs: 0,
      running: false,
      deadlineAt: 0
    });
  }
  if (safeAction === "finish") {
    return normalizeTimerState({ ...timer, remainingMs: 0, running: false, deadlineAt: 0 });
  }
  if (safeAction === "toggle-running") {
    if (timer.running) {
      return normalizeTimerState({ ...timer, running: false, deadlineAt: 0 });
    }
    if (timer.remainingMs <= 0) return timer;
    return normalizeTimerState({
      ...timer,
      running: true,
      maxMs: timer.maxMs > 0 ? timer.maxMs : timer.remainingMs,
      deadlineAt: now + timer.remainingMs
    });
  }
  if (safeAction === "adjust") {
    const deltaSeconds = Number(payload.deltaSeconds || 0);
    if (!Number.isFinite(deltaSeconds) || deltaSeconds === 0) return timer;
    // Comme l'application WPF, un réglage pendant le décompte repart de la
    // seconde affichée (arrondi supérieur) pour éviter toute pause perceptible.
    const nextSeconds = Math.ceil((timer.remainingMs / 1000) + deltaSeconds);
    const nextMs = clamp(nextSeconds * 1000, 0, MAX_TIMER_MS);
    const running = timer.running && nextMs > 0;
    return normalizeTimerState({
      ...timer,
      remainingMs: nextMs,
      maxMs: running
        ? Math.max(timer.maxMs, nextMs)
        : nextMs,
      running,
      deadlineAt: running ? now + nextMs : 0
    });
  }
  return timer;
}

export function applyOverlayWidgetAction(rawWidgets, widgetId, action, payload = {}, now = Date.now()){
  const widgets = normalizeOverlayWidgetsState(rawWidgets);
  const id = String(widgetId || "").trim();
  const safeAction = String(action || "").trim();

  if (id === "annotations") {
    if (safeAction === "set-visible") {
      return normalizeOverlayWidgetsState({
        ...widgets,
        annotations: { visible: payload.visible === true }
      });
    }
    return widgets;
  }

  if (id === "timer") {
    return normalizeOverlayWidgetsState({
      ...widgets,
      timer: applyTimerAction(widgets.timer, safeAction, payload, now)
    });
  }

  return widgets;
}

export function getTimerProgress(rawTimer, now = Date.now()){
  const timer = normalizeTimerState(rawTimer);
  if (timer.maxMs <= 0) return 0;
  return clamp(getTimerRemainingMs(timer, now) / timer.maxMs, 0, 1);
}
