const DEFAULT_MIN_SCALE = 0.34;
const DEFAULT_SAFE_PADDING = 16;

/**
 * Ajuste légèrement l'échelle d'un runtime de calcul pour que la ligne utile
 * reste visible sans rognage. Le CSS garde les tailles pédagogiques de base ;
 * cette fonction applique seulement un coefficient de secours quand l'expression
 * ou la ligne complète dépasse l'espace disponible.
 */
export function scheduleCalcLayoutFit({
  root,
  equationEl,
  expressionEl,
  equalsEl,
  responseWrapEl,
  answerSecondLine = false,
  minScale = DEFAULT_MIN_SCALE,
  safePadding = DEFAULT_SAFE_PADDING
} = {}) {
  if (!root || !equationEl || !expressionEl) return;

  root.style.setProperty("--calc-layout-scale", "1");

  const run = () => {
    if (!root.isConnected || !equationEl.isConnected || !expressionEl.isConnected) return;

    root.style.setProperty("--calc-layout-scale", "1");

    const availableWidth = getAvailableWidth(root, equationEl, safePadding);
    if (availableWidth <= 0) return;

    const requiredWidth = answerSecondLine
      ? Math.max(
          measureElementWidth(expressionEl),
          measureAnswerLineWidth(equalsEl, responseWrapEl, equationEl)
        )
      : measureElementWidth(equationEl);

    if (!Number.isFinite(requiredWidth) || requiredWidth <= 0) return;

    const scale = requiredWidth > availableWidth
      ? clamp(availableWidth / requiredWidth, minScale, 1)
      : 1;

    root.style.setProperty("--calc-layout-scale", formatScale(scale));
  };

  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(run);
  } else {
    setTimeout(run, 0);
  }
}

function getAvailableWidth(root, equationEl, safePadding) {
  const stageEl = equationEl.parentElement;
  const rawWidth = Math.max(
    0,
    stageEl?.clientWidth || 0,
    equationEl.clientWidth || 0,
    root.clientWidth || 0
  );
  return Math.max(1, rawWidth - Math.max(0, Number(safePadding) || 0));
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
