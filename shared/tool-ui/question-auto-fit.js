const FIT_STATE = new WeakMap();
const DEFAULT_OPTIONS = Object.freeze({
  minFontSize: 32,
  maxFontSize: 220,
  mediaMaxWidthRatio: 0.98,
  mediaMaxHeightRatio: 0.96,
  tolerance: 3,
  delayedRefitMs: [40, 140, 360, 720]
});

export function scheduleQuestionAutoFit(element, options = {}) {
  if (!element || typeof window === "undefined" || typeof document === "undefined") return;

  const state = getFitState(element);
  state.options = normalizeOptions(options);
  element.classList.add("tool-question--auto-fit");
  setupResizeObserver(element, state);
  setupViewportListeners(element, state);
  setupImageListeners(element, state);
  queueFit(element, state);
  scheduleDelayedFits(element, state);
}

export function teardownQuestionAutoFit(element) {
  if (!element) return;
  const state = FIT_STATE.get(element);
  if (!state) return;

  if (state.rafId) {
    window.cancelAnimationFrame(state.rafId);
  }
  if (state.secondRafId) {
    window.cancelAnimationFrame(state.secondRafId);
  }
  clearDelayedFits(state);
  state.resizeObserver?.disconnect?.();
  state.viewportAbortController?.abort?.();
  state.imageAbortController?.abort?.();
  element.classList.remove("tool-question--auto-fit");
  element.style.removeProperty("--tool-question-font-size");
  element.style.removeProperty("font-size");
  element.style.removeProperty("--qcm-question-media-max-width");
  element.style.removeProperty("--qcm-question-media-max-height");
  clearDirectFontTargets(element);
  clearDirectMediaBounds(element);
  delete element.dataset.questionAutoFitSize;
  delete element.dataset.questionAutoFitKind;
  FIT_STATE.delete(element);
}

function getFitState(element) {
  let state = FIT_STATE.get(element);
  if (state) return state;

  state = {
    options: normalizeOptions(),
    rafId: 0,
    secondRafId: 0,
    delayedFitIds: [],
    resizeObserver: null,
    viewportAbortController: null,
    imageAbortController: null
  };
  FIT_STATE.set(element, state);
  return state;
}

function normalizeOptions(options = {}) {
  const minFontSize = clampNumber(options.minFontSize, 12, 320, DEFAULT_OPTIONS.minFontSize);
  const maxFontSize = clampNumber(options.maxFontSize, minFontSize, 360, DEFAULT_OPTIONS.maxFontSize);
  const delayedRefitMs = Array.isArray(options.delayedRefitMs)
    ? options.delayedRefitMs
    : DEFAULT_OPTIONS.delayedRefitMs;

  return {
    minFontSize,
    maxFontSize,
    mediaMaxWidthRatio: clampNumber(options.mediaMaxWidthRatio, 0.2, 1, DEFAULT_OPTIONS.mediaMaxWidthRatio),
    mediaMaxHeightRatio: clampNumber(options.mediaMaxHeightRatio, 0.2, 1, DEFAULT_OPTIONS.mediaMaxHeightRatio),
    tolerance: clampNumber(options.tolerance, 0, 16, DEFAULT_OPTIONS.tolerance),
    delayedRefitMs: delayedRefitMs
      .map((value) => Math.max(0, Math.floor(Number(value) || 0)))
      .filter((value, index, values) => value > 0 && values.indexOf(value) === index)
      .slice(0, 8)
  };
}

function setupResizeObserver(element, state) {
  if (state.resizeObserver || typeof ResizeObserver === "undefined") return;
  state.resizeObserver = new ResizeObserver(() => queueFit(element, state));
  state.resizeObserver.observe(element);
}

function setupViewportListeners(element, state) {
  if (state.viewportAbortController) return;

  const abortController = new AbortController();
  const { signal } = abortController;
  state.viewportAbortController = abortController;
  const handler = () => {
    queueFit(element, state);
    scheduleDelayedFits(element, state);
  };

  window.addEventListener("resize", handler, { signal, passive: true });
  window.visualViewport?.addEventListener?.("resize", handler, { signal, passive: true });
}

function setupImageListeners(element, state) {
  state.imageAbortController?.abort?.();
  state.imageAbortController = null;

  const images = Array.from(element.querySelectorAll("img"));
  if (!images.length) return;

  const abortController = new AbortController();
  state.imageAbortController = abortController;
  images.forEach((image) => {
    if (image.complete) return;
    image.addEventListener("load", () => {
      queueFit(element, state);
      scheduleDelayedFits(element, state);
    }, { once: true, signal: abortController.signal });
    image.addEventListener("error", () => queueFit(element, state), { once: true, signal: abortController.signal });
  });
}

function scheduleDelayedFits(element, state) {
  clearDelayedFits(state);
  state.delayedFitIds = state.options.delayedRefitMs.map((delay) => window.setTimeout(() => {
    queueFit(element, state);
  }, delay));
}

function clearDelayedFits(state) {
  if (!state?.delayedFitIds?.length) return;
  state.delayedFitIds.forEach((id) => window.clearTimeout(id));
  state.delayedFitIds = [];
}

function queueFit(element, state) {
  if (!element || !state) return;
  if (state.rafId) window.cancelAnimationFrame(state.rafId);
  if (state.secondRafId) window.cancelAnimationFrame(state.secondRafId);
  state.rafId = window.requestAnimationFrame(() => {
    state.rafId = 0;
    state.secondRafId = window.requestAnimationFrame(() => {
      state.secondRafId = 0;
      fitQuestionElement(element, state.options);
    });
  });
}

function fitQuestionElement(element, options) {
  if (!element || !element.isConnected) return;
  const rect = element.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return;

  const contentInfo = getContentInfo(element);
  element.dataset.questionAutoFitKind = contentInfo.kind;

  applyMediaBounds(element, rect, options);

  const maxFontSize = resolveEffectiveMaxFontSize(element, rect, options, contentInfo);
  let low = Math.floor(options.minFontSize);
  let high = Math.max(low, Math.floor(maxFontSize));
  let best = low;

  applyFontSize(element, low);

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    applyFontSize(element, mid);

    if (questionFits(element, options.tolerance)) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  applyFontSize(element, best);
  element.dataset.questionAutoFitSize = String(best);
}

function resolveEffectiveMaxFontSize(element, rect, options, contentInfo = getContentInfo(element)) {
  if (contentInfo.kind === "media") return options.maxFontSize;

  const textLength = Math.max(1, contentInfo.textLength);
  const heightBasedMax = rect.height * (textLength <= 2 ? 0.92 : textLength <= 8 ? 0.82 : 0.72);
  const widthBasedMax = rect.width / getEstimatedTextWidthFactor(textLength);
  const geometricMax = Math.min(heightBasedMax, widthBasedMax);

  return Math.max(options.minFontSize, Math.min(options.maxFontSize, Math.floor(geometricMax)));
}

function getEstimatedTextWidthFactor(textLength) {
  if (textLength <= 1) return 0.72;
  if (textLength === 2) return 1.25;
  if (textLength <= 4) return textLength * 0.72;
  if (textLength <= 8) return textLength * 0.62;
  if (textLength <= 16) return textLength * 0.55;
  return textLength * 0.5;
}

function applyFontSize(element, fontSize) {
  const safeSize = Math.max(1, Math.floor(fontSize));
  const size = `${safeSize}px`;
  element.style.setProperty("--tool-question-font-size", size);
  // Sécurité : certains contextes de runtime ou banc de viewport appliquent des
  // classes avec des variables CSS déjà résolues. L’inline font-size force le
  // recalcul et évite un affichage minuscule dans certains viewports simulés.
  element.style.fontSize = size;

  // Important pour QCM/Flash-QCM : le texte réel de la question est souvent
  // enveloppé dans plusieurs spans flex. Selon le layout effectif et les styles
  // des médias, l’héritage depuis .qcm-question peut rester trop prudent. On
  // force donc aussi la taille sur les nœuds qui portent réellement le texte.
  getDirectFontTargets(element).forEach((target) => {
    target.style.setProperty("font-size", size, "important");
    target.style.setProperty("line-height", resolveLineHeight(safeSize), "important");
  });
}

function resolveLineHeight(fontSize) {
  if (fontSize >= 180) return "0.96";
  if (fontSize >= 110) return "1";
  return "1.08";
}

function getDirectFontTargets(element) {
  const selectors = [
    ".flash-item-inner .qcm-content--question",
    ".flash-item-inner .qcm-content--question .qcm-content-text",
    ".flash-item-inner .qcm-content--question .qcm-content-text-inner",
    ".flash-item-inner .qr-question-text-inner",
    ".qcm-content--question",
    ".qcm-content--question .qcm-content-text",
    ".qcm-content--question .qcm-content-text-inner",
    ".qr-question-text-inner"
  ];
  const targets = [];
  selectors.forEach((selector) => {
    element.querySelectorAll(selector).forEach((target) => {
      if (!targets.includes(target)) targets.push(target);
    });
  });
  return targets;
}

function clearDirectFontTargets(element) {
  getDirectFontTargets(element).forEach((target) => {
    target.style.removeProperty("font-size");
    target.style.removeProperty("line-height");
  });
}

function applyMediaBounds(element, rect, options) {
  const maxWidth = Math.max(24, Math.floor(rect.width * options.mediaMaxWidthRatio));
  const maxHeight = Math.max(24, Math.floor(rect.height * options.mediaMaxHeightRatio));
  element.style.setProperty("--qcm-question-media-max-width", `${maxWidth}px`);
  element.style.setProperty("--qcm-question-media-max-height", `${maxHeight}px`);

  // Certaines règles locales posent les variables directement sur le cadre image
  // et masquent alors les variables héritées du conteneur. On force donc aussi
  // les bornes sur les cadres image de question.
  element.querySelectorAll(".qcm-media-frame--question").forEach((frame) => {
    frame.style.setProperty("--qcm-question-media-max-width", `${maxWidth}px`);
    frame.style.setProperty("--qcm-question-media-max-height", `${maxHeight}px`);
  });
}

function clearDirectMediaBounds(element) {
  element.querySelectorAll(".qcm-media-frame--question").forEach((frame) => {
    frame.style.removeProperty("--qcm-question-media-max-width");
    frame.style.removeProperty("--qcm-question-media-max-height");
  });
}

function questionFits(element, tolerance = 3) {
  const rect = element.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return false;

  const overflowX = element.scrollWidth - rect.width;
  const overflowY = element.scrollHeight - rect.height;
  if (overflowX > tolerance || overflowY > tolerance) return false;

  const contentRect = measureQuestionContent(element);
  if (!contentRect) return true;

  return contentRect.width <= rect.width + tolerance
    && contentRect.height <= rect.height + tolerance;
}

function measureQuestionContent(element) {
  const target = getMeasuredContentElement(element);
  if (!target) return null;

  if (hasVisibleTextContent(target)) {
    const range = document.createRange();
    try {
      range.selectNodeContents(target);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) return rect;
    } finally {
      range.detach?.();
    }
  }

  return target.getBoundingClientRect?.() || null;
}

function getMeasuredContentElement(element) {
  return element.querySelector(".flash-item-inner .qcm-content-text-inner")
    || element.querySelector(".flash-item-inner .qr-question-text-inner")
    || element.querySelector(".qcm-content--question .qcm-content-text-inner")
    || element.querySelector(".qcm-content--question .qcm-content-text")
    || element.querySelector(".qr-question-text-inner")
    || element.querySelector(".qcm-media-frame--question")
    || element.querySelector(".flash-item-inner")
    || element.firstElementChild
    || element;
}

function getContentInfo(element) {
  const target = getMeasuredContentElement(element);
  const text = String(target?.textContent || element?.textContent || "")
    .replace(/\s+/g, "")
    .trim();
  const hasText = text.length > 0;
  const hasMedia = !!element.querySelector("img, svg, .qcm-media-frame--question");

  return {
    kind: hasText ? (text.length <= 8 ? "short-text" : "text") : (hasMedia ? "media" : "empty"),
    textLength: text.length,
    hasText,
    hasMedia
  };
}

function hasVisibleTextContent(element) {
  return String(element?.textContent || "").replace(/\s+/g, "").length > 0;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  const safe = Number.isFinite(number) ? number : fallback;
  return Math.min(max, Math.max(min, safe));
}
