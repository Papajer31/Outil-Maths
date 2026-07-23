const DEFAULT_MIN_SCALE = 0.34;
const DEFAULT_SAFE_PADDING = 16;
const DEFAULT_MAX_ATTEMPTS = 14;
const MIN_USABLE_WIDTH = 180;
const WIDTH_STABILITY_EPSILON = 2;

const activeFits = new WeakMap();

/**
 * Ajuste légèrement l'échelle d'un runtime de calcul pour que la ligne utile
 * reste visible sans rognage. Le CSS garde les tailles pédagogiques de base ;
 * cette fonction applique seulement un coefficient de secours quand l'expression
 * ou la ligne complète dépasse l'espace disponible.
 *
 * Important : au premier rendu d'un outil, le shell peut être connecté au DOM
 * avant d'avoir reçu sa largeur réelle. On attend donc une largeur réellement
 * exploitable et stable avant d'appliquer une réduction. Cela évite le cas où
 * la première question démarre minuscule, puis grossit au moment de la correction.
 */
export function scheduleCalcLayoutFit({
  root,
  equationEl,
  expressionEl,
  equalsEl,
  responseWrapEl,
  answerSecondLine = false,
  minScale = DEFAULT_MIN_SCALE,
  safePadding = DEFAULT_SAFE_PADDING,
  maxAttempts = DEFAULT_MAX_ATTEMPTS
} = {}) {
  if (!root || !equationEl || !expressionEl) return;

  cleanupActiveFit(root);
  root.style.setProperty("--calc-layout-scale", "1");

  const fitState = {
    rafId: 0,
    timeoutIds: new Set(),
    resizeObserver: null,
    disposed: false,
    pending: false,
    attempt: 0,
    lastRawWidth: null,
    stableWidthCount: 0
  };

  activeFits.set(root, fitState);

  const options = {
    root,
    equationEl,
    expressionEl,
    equalsEl,
    responseWrapEl,
    answerSecondLine,
    minScale,
    safePadding,
    maxAttempts
  };

  const requestFit = () => {
    if (fitState.disposed || fitState.pending) return;
    fitState.pending = true;
    fitState.rafId = scheduleFrame(() => {
      fitState.pending = false;
      runFitWhenReady(options, fitState, requestFit);
    });
  };

  requestFit();
  scheduleDelayedFit(fitState, requestFit, 80);
  scheduleDelayedFit(fitState, requestFit, 180);
  installResizeObserver(fitState, requestFit, root, equationEl, equationEl.parentElement);
}

function runFitWhenReady(options, fitState, requestFit) {
  const {
    root,
    equationEl,
    expressionEl,
    equalsEl,
    responseWrapEl,
    answerSecondLine,
    minScale,
    safePadding,
    maxAttempts
  } = options;

  if (fitState.disposed) return;
  if (!root.isConnected || !equationEl.isConnected || !expressionEl.isConnected) return;

  root.style.setProperty("--calc-layout-scale", "1");

  const rawAvailableWidth = getRawAvailableWidth(root, equationEl);
  const availableWidth = rawAvailableWidth - Math.max(0, Number(safePadding) || 0);

  if (!isUsableWidth(availableWidth)) {
    retryIfPossible(fitState, requestFit, maxAttempts);
    return;
  }

  if (isWidthStable(fitState, rawAvailableWidth)) {
    fitState.stableWidthCount += 1;
  } else {
    fitState.stableWidthCount = 0;
  }
  fitState.lastRawWidth = rawAvailableWidth;

  // On attend deux mesures successives cohérentes avant de réduire l'échelle.
  // Tant que la largeur fluctue au démarrage, on garde scale=1 plutôt que de
  // figer une échelle calculée sur une largeur transitoire trop petite.
  if (fitState.stableWidthCount < 1 && fitState.attempt < maxAttempts) {
    retryIfPossible(fitState, requestFit, maxAttempts);
    return;
  }

  const requiredWidth = answerSecondLine
    ? Math.max(
        measureElementWidth(expressionEl),
        measureAnswerLineWidth(equalsEl, responseWrapEl, equationEl)
      )
    : measureElementWidth(equationEl);

  if (!Number.isFinite(requiredWidth) || requiredWidth <= 0) {
    retryIfPossible(fitState, requestFit, maxAttempts);
    return;
  }

  const scale = requiredWidth > availableWidth
    ? clamp(availableWidth / requiredWidth, minScale, 1)
    : 1;

  root.style.setProperty("--calc-layout-scale", formatScale(scale));
}

function retryIfPossible(fitState, requestFit, maxAttempts) {
  if (fitState.attempt >= maxAttempts) return;
  fitState.attempt += 1;
  requestFit();
}

function scheduleFrame(callback) {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(callback);
  }
  return setTimeout(callback, 0);
}

function cancelFrame(id) {
  if (!id) return;
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(id);
  } else {
    clearTimeout(id);
  }
}

function scheduleDelayedFit(fitState, callback, delay) {
  const timeoutId = setTimeout(() => {
    fitState.timeoutIds.delete(timeoutId);
    callback();
  }, delay);
  fitState.timeoutIds.add(timeoutId);
}

function installResizeObserver(fitState, callback, ...elements) {
  if (typeof ResizeObserver !== "function") return;
  const observedElements = elements.filter(Boolean);
  if (!observedElements.length) return;

  const observer = new ResizeObserver(() => callback());
  observedElements.forEach((element) => observer.observe(element));
  fitState.resizeObserver = observer;
}

function cleanupActiveFit(root) {
  const previous = activeFits.get(root);
  if (!previous) return;
  previous.disposed = true;
  cancelFrame(previous.rafId);
  previous.timeoutIds?.forEach((timeoutId) => clearTimeout(timeoutId));
  previous.timeoutIds?.clear?.();
  previous.resizeObserver?.disconnect?.();
  activeFits.delete(root);
}

function getRawAvailableWidth(root, equationEl) {
  const stageEl = equationEl.parentElement;
  return Math.max(
    0,
    Number(stageEl?.clientWidth) || 0,
    Number(equationEl.clientWidth) || 0,
    Number(root.clientWidth) || 0
  );
}

function isUsableWidth(width) {
  return Number.isFinite(width) && width > MIN_USABLE_WIDTH;
}

function isWidthStable(fitState, rawWidth) {
  if (!Number.isFinite(fitState.lastRawWidth)) return false;
  return Math.abs(rawWidth - fitState.lastRawWidth) <= WIDTH_STABILITY_EPSILON;
}

function measureElementWidth(element) {
  if (!element) return 0;
  const rect = element.getBoundingClientRect?.();
  return Math.ceil(Math.max(
    Number(element.scrollWidth) || 0,
    Number(rect?.width) || 0
  ));
}

function measureAnswerLineWidth(equalsEl, responseWrapEl, equationEl) {
  const gap = getColumnGap(equationEl);
  const equalsWidth = measureElementWidth(equalsEl);
  const responseWidth = measureElementWidth(responseWrapEl);
  if (!equalsWidth && !responseWidth) return 0;
  return equalsWidth + responseWidth + gap;
}

function getColumnGap(element) {
  if (!element || typeof getComputedStyle !== "function") return 0;
  const styles = getComputedStyle(element);
  const raw = styles.columnGap || styles.gap || "0";
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatScale(value) {
  return String(Math.round(value * 10000) / 10000);
}
