const FIT_STATE = new WeakMap();
const DEFAULT_OPTIONS = Object.freeze({
  minFontSize: 12,
  step: 2,
  targetFontSize: null,
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
  element.classList.remove("tool-question--auto-fit", "is-question-overflowing");
  element.style.removeProperty("--tool-question-font-size");
  element.style.removeProperty("font-size");
  element.style.removeProperty("--qcm-question-media-max-width");
  element.style.removeProperty("--qcm-question-media-max-height");
  clearDirectFontTargets(element);
  clearDirectMediaBounds(element);
  delete element.dataset.questionAutoFitSize;
  delete element.dataset.questionAutoFitKind;
  delete element.dataset.questionAutoFitOverflow;
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
  const minFontSize = clampNumber(options.minFontSize, 8, 320, DEFAULT_OPTIONS.minFontSize);
  const explicitTarget = Number(options.targetFontSize);
  const delayedRefitMs = Array.isArray(options.delayedRefitMs)
    ? options.delayedRefitMs
    : DEFAULT_OPTIONS.delayedRefitMs;

  return {
    minFontSize,
    step: Math.max(1, Math.floor(clampNumber(options.step, 1, 20, DEFAULT_OPTIONS.step))),
    targetFontSize: Number.isFinite(explicitTarget) ? explicitTarget : null,
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

  const targetFontSize = resolveTargetFontSize(element, options);
  const minFontSize = Math.min(targetFontSize, Math.floor(options.minFontSize));
  const step = Math.max(1, Math.floor(options.step || 2));
  let fittedSize = targetFontSize;

  applyFontSize(element, fittedSize);
  while (fittedSize > minFontSize && !questionFits(element, options.tolerance)) {
    fittedSize = Math.max(minFontSize, fittedSize - step);
    applyFontSize(element, fittedSize);
  }

  const stillOverflows = !questionFits(element, options.tolerance);
  element.classList.toggle("is-question-overflowing", stillOverflows);
  element.dataset.questionAutoFitOverflow = stillOverflows ? "true" : "false";
  element.dataset.questionAutoFitSize = String(fittedSize);
}

function resolveTargetFontSize(element, options) {
  if (Number.isFinite(options.targetFontSize)) {
    return Math.max(1, Math.floor(options.targetFontSize));
  }

  const computed = window.getComputedStyle(element);
  const semanticTarget = parseFloat(computed.getPropertyValue("--tool-question-target-font-size"));
  if (Number.isFinite(semanticTarget) && semanticTarget > 0) {
    return Math.floor(semanticTarget);
  }

  const semanticKey = element.classList.contains("tool-question--huge") || element.classList.contains("tool-statement--huge")
    ? "huge"
    : element.classList.contains("tool-question--small") || element.classList.contains("tool-statement--small")
      ? "small"
      : element.classList.contains("tool-question--normal") || element.classList.contains("tool-statement--normal")
        ? "normal"
        : "large";
  const runtimeTarget = parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue(`--runtime-font-${semanticKey}`));
  if (Number.isFinite(runtimeTarget) && runtimeTarget > 0) {
    return Math.floor(runtimeTarget);
  }

  const currentSize = parseFloat(computed.fontSize);
  return Number.isFinite(currentSize) && currentSize > 0
    ? Math.floor(currentSize)
    : Math.max(1, Math.floor(options.minFontSize));
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
