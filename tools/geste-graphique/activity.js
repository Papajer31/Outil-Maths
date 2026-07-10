import {
  ensureToolInstructionStyles,
  renderToolInstruction,
  resolveToolInstructionText,
  setToolInstructionText
} from "../../shared/tool-instruction.js";
import {
  MODEL_VISIBILITY,
  TOLERANCE_LEVELS,
  normalizeSettings,
  pickQuestion,
  questionKey
} from "./model.js";

let stylesInjected = false;

const DEFAULT_INSTRUCTION = "Repasse le chiffre avec ton doigt.";
const SAMPLE_COUNT_PER_STROKE = 90;
const VALIDATION_PROFILES = Object.freeze({
  [TOLERANCE_LEVELS.LARGE]: Object.freeze({ scoreThreshold: 0.70 }),
  [TOLERANCE_LEVELS.MEDIUM]: Object.freeze({ scoreThreshold: 0.76 }),
  [TOLERANCE_LEVELS.LOW]: Object.freeze({ scoreThreshold: 0.82 })
});

// La jauge de qualité est absolue : elle ne dépend plus du niveau de tolérance.
// Le niveau choisi ne déplace que le repère vertical de réussite.
const ABSOLUTE_SCORE_TOLERANCE = 15;

// Petit recalage mathématique, uniquement pour l'évaluation.
// Il compense un léger offset matériel sans déplacer visuellement le tracé élève.
const START_OFFSET_RECENTER_MAX_DISTANCE = 24;

// Le sens du geste est une règle pédagogique fixe, indépendante du niveau de tolérance.
const DIRECTION_OK_THRESHOLD = 0.72;

const UI_ASSET_URLS = Object.freeze({
  traceIcon: new URL("../../shared/ui-assets/picto_trace.svg", import.meta.url).href,
  directionIcon: new URL("../../shared/ui-assets/picto_sens.svg", import.meta.url).href,
  thumbUp: new URL("../../shared/ui-assets/pouce_up.webp", import.meta.url).href,
  thumbDown: new URL("../../shared/ui-assets/pouce_down.webp", import.meta.url).href
});

export function createActivity(initialContext = {}) {
  injectStyles();
  const state = createRuntimeState(initialContext);

  return {
    mount(container, context = initialContext) {
      state.container = container;
      state.latestContext = context ?? state.latestContext;
      syncRuntimeState(state, state.latestContext);
      renderShell(state);
    },

    next(container, context = state.latestContext) {
      return this.nextQuestion(container, context);
    },

    nextQuestion(container, context = state.latestContext) {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      syncRuntimeState(state, state.latestContext);
      if (!state.root) renderShell(state);
      loadNextQuestion(state);
      return state.currentQuestion;
    },

    showAnswer(container, context = state.latestContext) {
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      syncRuntimeState(state, state.latestContext);
      revealAnswer(state);
    },

    supportsShellValidation() {
      return true;
    },

    canValidate() {
      return !state.answerRevealed && isTraceComplete(state);
    },

    validate() {
      if (state.answerRevealed || !isTraceComplete(state)) return false;
      requestReveal(state);
      return true;
    },

    getAnswerState() {
      const evaluation = state.lastEvaluation || evaluateTrace(state);
      return {
        answered: isTraceComplete(state),
        correct: evaluation.isCorrect
      };
    },

    unmount(container) {
      teardownState(state, container || state.container);
    }
  };
}

function createRuntimeState(initialContext = {}) {
  return {
    container: null,
    latestContext: initialContext,
    root: null,
    instructionEl: null,
    padEl: null,
    svgEl: null,
    userLayerEl: null,
    startDotEl: null,
    statusEl: null,
    resetButtonEl: null,
    currentQuestion: null,
    lastQuestionKey: "",
    currentSettings: normalizeSettings(initialContext?.settings),
    answerRevealed: false,
    userStrokes: [],
    activePoints: [],
    activePointerId: null,
    currentStrokeIndex: 0,
    lastEvaluation: null,
    pointerAbortController: null,
    animationTimers: [],
    animationFrame: 0,
    animationRunId: 0,
    strokeSamples: [],
  };
}

function syncRuntimeState(state, context = state.latestContext) {
  state.currentSettings = normalizeSettings(context?.settings || state.currentSettings || {});
}

function renderShell(state) {
  const container = state.container;
  if (!container) return;
  teardownBindings(state);
  clearAnimationTimers(state);

  container.innerHTML = `
    <div class="tool-runtime tool-runtime--geste-graphique gg-root" id="gg_root">
      ${renderToolInstruction({ id: "gg_instruction" })}
      <div class="tool-stage tool-panel gg-panel">
        <div class="gg-board">
          <button class="gg-reset-button" type="button" id="gg_reset" aria-label="Effacer le tracé" title="Effacer le tracé">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-.8 11.2A2 2 0 0 1 15.2 22H8.8a2 2 0 0 1-2-1.8L6 9Zm3 2 .4 8h2L11 11H9Zm4 0-.4 8h2l.4-8h-2Z"></path>
            </svg>
          </button>
          <div class="gg-pad" id="gg_pad">
            <svg class="gg-svg" id="gg_svg" viewBox="0 0 210 297" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"></svg>
          </div>
          <div class="gg-status" id="gg_status" hidden aria-hidden="true">
            <div class="gg-feedback-heading gg-feedback-heading--quality">
              <img class="gg-feedback-icon gg-feedback-icon--quality" src="${escapeHtml(UI_ASSET_URLS.traceIcon)}" alt="" aria-hidden="true">
              <span class="gg-feedback-label">Qualité du tracé :</span>
            </div>
            <div class="gg-score-gauge" aria-hidden="true">
              <div class="gg-score-cover"></div>
              <div class="gg-score-threshold"></div>
            </div>
            <div class="gg-feedback-heading gg-feedback-heading--direction">
              <img class="gg-feedback-icon gg-feedback-icon--direction" src="${escapeHtml(UI_ASSET_URLS.directionIcon)}" alt="" aria-hidden="true">
              <span class="gg-feedback-label">Sens du tracé :</span>
            </div>
            <div class="gg-direction-result" aria-hidden="true">
              <img class="gg-thumb gg-thumb--up" src="${escapeHtml(UI_ASSET_URLS.thumbUp)}" alt="" aria-hidden="true">
              <img class="gg-thumb gg-thumb--down" src="${escapeHtml(UI_ASSET_URLS.thumbDown)}" alt="" aria-hidden="true">
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  state.root = container.querySelector("#gg_root");
  state.instructionEl = container.querySelector("#gg_instruction");
  state.padEl = container.querySelector("#gg_pad");
  state.svgEl = container.querySelector("#gg_svg");
  state.statusEl = container.querySelector("#gg_status");
  state.resetButtonEl = container.querySelector("#gg_reset");
  state.resetButtonEl?.addEventListener("click", () => resetCurrentTrace(state));
  updateInstruction(state);
}

function loadNextQuestion(state) {
  state.currentQuestion = pickQuestion(state.currentSettings, { avoidDigit: state.lastQuestionKey });
  state.lastQuestionKey = questionKey(state.currentQuestion);
  state.answerRevealed = false;
  state.userStrokes = [];
  state.activePoints = [];
  state.activePointerId = null;
  state.currentStrokeIndex = 0;
  state.lastEvaluation = null;
  setResetButtonEnabled(state, true);
  renderQuestion(state);
  state.latestContext?.services?.notifyValidationStateChanged?.();
}

function renderQuestion(state) {
  updateInstruction(state);
  clearAnimationTimers(state);
  teardownBindings(state);
  state.root?.classList.remove("gg-root--correct", "gg-root--incorrect", "gg-root--revealed");
  state.padEl?.classList.remove("is-ready", "is-blocked");
  hideScoreGauge(state);

  const question = state.currentQuestion;
  if (!question || !state.svgEl) return;
  state.svgEl.setAttribute("viewBox", question.viewBox || "0 0 200 260");
  state.svgEl.innerHTML = `
    <g class="gg-model-layer">
      ${question.strokes.map((stroke, index) => `<path class="gg-model-path" data-gg-model-index="${index}" d="${escapeHtml(stroke.d)}"></path>`).join("")}
    </g>
    <g class="gg-animation-layer">
      ${question.strokes.map((stroke, index) => `<path class="gg-animation-path" data-gg-animation-index="${index}" d="${escapeHtml(stroke.d)}"></path>`).join("")}
    </g>
    <g class="gg-user-layer" id="gg_user_layer"></g>
    <circle class="gg-start-dot" id="gg_start_dot" cx="0" cy="0" r="6"></circle>
  `;
  state.userLayerEl = state.svgEl.querySelector("#gg_user_layer");
  state.startDotEl = state.svgEl.querySelector("#gg_start_dot");
  applyPadOptionAttributes(state);
  prepareAnimationPaths(state);
  positionStartDot(state);

  if (state.currentSettings.animationEnabled) {
    state.padEl?.setAttribute("data-model-visibility", MODEL_VISIBILITY.TRACE);
    runIntroAnimation(state);
  } else {
    completeIntroWithoutAnimation(state);
  }
}

function prepareAnimationPaths(state) {
  // Le modèle gris brut reste la référence visuelle : on ne le remplace pas.
  // L'animation/correction utilisent une polyligne échantillonnée, puis recalée
  // sur la boîte réelle du chemin gris. Cela évite les bugs de dashoffset tout
  // en gardant le modèle statique comme source de vérité affichée.
  const modelPaths = Array.from(state.svgEl?.querySelectorAll(".gg-model-path") || []);
  const animationPaths = Array.from(state.svgEl?.querySelectorAll(".gg-animation-path") || []);
  state.strokeSamples = modelPaths.map((path) => getAlignedSamplesForPath(path, getDisplaySampleCount(path)));

  animationPaths.forEach((path) => {
    path.setAttribute("d", "");
    path.style.opacity = "1";
    path.style.transition = "none";
  });
}

function applyPadOptionAttributes(state) {
  state.padEl?.setAttribute("data-animation-enabled", state.currentSettings.animationEnabled ? "true" : "false");
  state.padEl?.setAttribute("data-start-point", state.currentSettings.showStartPoint ? "visible" : "hidden");
}

function completeIntroWithoutAnimation(state) {
  state.currentStrokeIndex = 0;
  state.padEl?.classList.add("is-ready");
  state.padEl?.setAttribute("data-model-visibility", MODEL_VISIBILITY.VISIBLE);
  state.svgEl?.querySelectorAll(".gg-animation-path").forEach((path) => {
    path.style.opacity = "0";
  });
  positionStartDot(state);
  bindDrawingEvents(state);
}

function runIntroAnimation(state) {
  const modelPaths = Array.from(state.svgEl?.querySelectorAll(".gg-model-path") || []);
  const animationPaths = Array.from(state.svgEl?.querySelectorAll(".gg-animation-path") || []);
  const runId = (state.animationRunId || 0) + 1;
  state.animationRunId = runId;
  let index = 0;

  const finish = () => {
    if (state.animationRunId !== runId) return;
    state.currentStrokeIndex = 0;
    applyPadOptionAttributes(state);
    positionStartDot(state);
    state.padEl?.classList.add("is-ready");
    state.padEl?.setAttribute("data-model-visibility", state.currentSettings.modelVisibility);
    syncModelDisplayAfterAnimation(state);
    bindDrawingEvents(state);
  };

  const playNextStroke = () => {
    if (state.animationRunId !== runId) return;
    const modelPath = modelPaths[index];
    const animationPath = animationPaths[index];
    if (!modelPath || !animationPath) {
      finish();
      return;
    }

    state.currentStrokeIndex = index;
    positionStartDot(state);
    const samples = state.strokeSamples[index] || getAlignedSamplesForPath(modelPath, getAnimationSampleCount(modelPath));
    const duration = getAnimationDurationFromSamples(samples, modelPath);
    const startedAt = window.performance?.now?.() || Date.now();

    const step = (nowValue) => {
      if (state.animationRunId !== runId) return;
      const now = Number(nowValue) || Date.now();
      const progress = Math.max(0, Math.min(1, (now - startedAt) / duration));
      const visibleCount = Math.max(2, Math.ceil(progress * samples.length));
      animationPath.setAttribute("d", pointsToPathData(samples.slice(0, visibleCount)));

      if (progress < 1) {
        state.animationFrame = window.requestAnimationFrame(step);
        return;
      }

      animationPath.setAttribute("d", pointsToPathData(samples));
      index += 1;
      if (index >= modelPaths.length) {
        state.animationTimers.push(window.setTimeout(finish, 180));
      } else {
        state.animationTimers.push(window.setTimeout(playNextStroke, 220));
      }
    };

    state.animationFrame = window.requestAnimationFrame(step);
  };

  state.animationTimers.push(window.setTimeout(playNextStroke, 120));
}

function getAnimationSampleCount(path) {
  const length = safePathLength(path);
  return Math.max(48, Math.min(220, Math.round(length / 2)));
}

function getAnimationDuration(path) {
  const length = safePathLength(path);
  return Math.max(820, Math.min(1700, length * 5.2));
}

function bindDrawingEvents(state) {
  teardownBindings(state);
  if (!state.padEl || !state.svgEl) return;

  state.padEl.classList.remove("is-blocked");
  state.padEl.querySelector(".gg-touch-warning")?.remove();

  const abortController = new AbortController();
  const { signal } = abortController;
  state.pointerAbortController = abortController;

  state.padEl.addEventListener("pointerdown", (event) => startPointerTrace(state, event), { signal });
  state.padEl.addEventListener("pointermove", (event) => movePointerTrace(state, event), { signal });
  state.padEl.addEventListener("pointerup", (event) => endPointerTrace(state, event), { signal });
  state.padEl.addEventListener("pointercancel", (event) => endPointerTrace(state, event), { signal });
  state.padEl.addEventListener("lostpointercapture", (event) => endPointerTrace(state, event), { signal });
}

function startPointerTrace(state, event) {
  if (state.answerRevealed || state.activePointerId != null) return;
  event.preventDefault();
  state.activePointerId = event.pointerId;
  state.padEl?.setPointerCapture?.(event.pointerId);
  state.activePoints = [clientPointToSvgPoint(state, event.clientX, event.clientY)];
  drawActivePath(state);
}

function movePointerTrace(state, event) {
  if (state.activePointerId !== event.pointerId || state.answerRevealed) return;
  event.preventDefault();
  const point = clientPointToSvgPoint(state, event.clientX, event.clientY);
  const last = state.activePoints[state.activePoints.length - 1];
  if (!last || distance(last, point) >= 1.4) {
    state.activePoints.push(point);
    drawActivePath(state);
  }
}

function endPointerTrace(state, event) {
  if (state.activePointerId !== event.pointerId) return;
  event.preventDefault();
  state.padEl?.releasePointerCapture?.(event.pointerId);
  state.activePointerId = null;

  if (state.activePoints.length >= 2) {
    state.userStrokes[state.currentStrokeIndex] = state.activePoints;
    state.currentStrokeIndex = Math.min(getExpectedStrokeCount(state) - 1, state.currentStrokeIndex + 1);
    state.activePoints = [];
    renderUserStrokes(state);
    positionStartDot(state);
    state.latestContext?.services?.notifyValidationStateChanged?.();
  }
}

function resetCurrentTrace(state) {
  state.answerRevealed = false;
  state.lastEvaluation = null;
  state.userStrokes = [];
  state.activePoints = [];
  state.activePointerId = null;
  state.currentStrokeIndex = 0;
  state.root?.classList.remove("gg-root--correct", "gg-root--incorrect", "gg-root--revealed");
  hideScoreGauge(state);
  setResetButtonEnabled(state, true);
  applyPadOptionAttributes(state);
  renderUserStrokes(state);
  positionStartDot(state);
  bindDrawingEvents(state);
  state.latestContext?.services?.notifyValidationStateChanged?.();
}

function revealAnswer(state) {
  if (!state.currentQuestion || state.answerRevealed) return;
  state.answerRevealed = true;
  teardownBindings(state);
  const evaluation = evaluateTrace(state);
  state.lastEvaluation = evaluation;
  state.root?.classList.add("gg-root--revealed");
  state.root?.classList.toggle("gg-root--correct", evaluation.isCorrect);
  state.root?.classList.toggle("gg-root--incorrect", !evaluation.isCorrect);
  setResetButtonEnabled(state, false);
  showScoreGauge(state, evaluation.score, evaluation.directionOk, evaluation.scoreThreshold);
}

function requestReveal(state) {
  const evaluation = evaluateTrace(state);
  state.lastEvaluation = evaluation;
  const requested = state.latestContext?.services?.requestAnswerPhase?.({
    manual: false,
    showAnswerNow: true,
    wasCorrect: evaluation.isCorrect
  });
  if (requested === false || !state.latestContext?.services?.requestAnswerPhase) {
    revealAnswer(state);
  }
}

function evaluateTrace(state) {
  if (!state.currentQuestion || !state.svgEl || !isTraceComplete(state)) {
    return { score: 0, isCorrect: false };
  }

  const profile = getValidationProfile(state.currentSettings.toleranceLevel);
  const expectedPaths = Array.from(state.svgEl.querySelectorAll(".gg-model-path"));
  const strokeScores = expectedPaths.map((path, index) => {
    const expected = state.strokeSamples[index] || getAlignedSamplesForPath(path, SAMPLE_COUNT_PER_STROKE);
    return evaluateStroke(expected, state.userStrokes[index] || []);
  });
  const score = strokeScores.reduce((sum, item) => sum + item.score, 0) / Math.max(1, strokeScores.length);
  const directionOk = strokeScores.every((item) => item.directionScore >= DIRECTION_OK_THRESHOLD);
  return {
    score,
    isCorrect: score >= profile.scoreThreshold && directionOk,
    directionOk,
    scoreThreshold: profile.scoreThreshold,
    strokes: strokeScores
  };
}

function evaluateStroke(expectedPoints, userPoints) {
  const expected = Array.isArray(expectedPoints) ? expectedPoints : [];
  if (expected.length < 2 || !Array.isArray(userPoints) || userPoints.length < 2) return { score: 0, directionScore: 0 };

  const recentered = recenterUserPointsForEvaluation(expected, userPoints);
  const evaluationPoints = recentered.points;
  const tolerance = ABSOLUTE_SCORE_TOLERANCE;
  const coverageHits = expected.filter((point) => minDistanceToPoints(point, evaluationPoints) <= tolerance).length;
  const coverage = coverageHits / Math.max(1, expected.length);
  const avgDistance = evaluationPoints.reduce((sum, point) => sum + minDistanceToPoints(point, expected), 0) / Math.max(1, evaluationPoints.length);
  const proximity = Math.max(0, 1 - (avgDistance / (tolerance * 1.55)));
  const start = expected[0] || { x: 0, y: 0 };
  const startScore = Math.max(0, 1 - (distance(start, evaluationPoints[0]) / (tolerance * 1.9)));
  const directionScore = getDirectionScore(expected, evaluationPoints);
  const score = coverage * .50 + proximity * .35 + startScore * .15;
  return { score, coverage, proximity, startScore, directionScore, recentered: recentered.applied };
}

function recenterUserPointsForEvaluation(expected, userPoints) {
  const start = expected[0];
  const userStart = userPoints[0];
  if (!start || !userStart) return { points: userPoints, applied: false };

  const offsetDistance = distance(start, userStart);
  if (offsetDistance > START_OFFSET_RECENTER_MAX_DISTANCE) {
    return { points: userPoints, applied: false };
  }

  const dx = (Number(start.x) || 0) - (Number(userStart.x) || 0);
  const dy = (Number(start.y) || 0) - (Number(userStart.y) || 0);
  return {
    points: userPoints.map((point) => ({
      x: (Number(point?.x) || 0) + dx,
      y: (Number(point?.y) || 0) + dy
    })),
    applied: Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01
  };
}

function getDirectionScore(expected, userPoints) {
  if (expected.length < 2 || userPoints.length < 2) return 0;
  const expectedEnd = expected[expected.length - 1];
  const expectedStart = expected[0];
  const userStart = userPoints[0];
  const userEnd = userPoints[userPoints.length - 1];
  const forward = distance(userStart, expectedStart) + distance(userEnd, expectedEnd);
  const backward = distance(userStart, expectedEnd) + distance(userEnd, expectedStart);
  const endpointScore = forward <= backward ? 1 : Math.max(0, 1 - ((forward - backward) / 120));

  const sampledUser = sampleUserPoints(userPoints, Math.min(36, Math.max(8, userPoints.length)));
  const indices = sampledUser.map((point) => nearestPointIndex(point, expected));
  let forwardSteps = 0;
  let backwardSteps = 0;
  for (let index = 1; index < indices.length; index += 1) {
    if (indices[index] > indices[index - 1]) forwardSteps += 1;
    else if (indices[index] < indices[index - 1]) backwardSteps += 1;
  }
  const stepCount = Math.max(1, forwardSteps + backwardSteps);
  const progressionScore = Math.max(0, (forwardSteps - backwardSteps) / stepCount);
  return endpointScore * .45 + progressionScore * .55;
}

function getValidationProfile(level = TOLERANCE_LEVELS.MEDIUM) {
  return VALIDATION_PROFILES[level] || VALIDATION_PROFILES[TOLERANCE_LEVELS.MEDIUM];
}

function syncModelDisplayAfterAnimation(state) {
  const visibility = state.currentSettings.modelVisibility;
  state.svgEl?.querySelectorAll(".gg-animation-path").forEach((path) => {
    path.style.opacity = visibility === MODEL_VISIBILITY.VISIBLE ? "1" : "0";
  });
}

function showScoreGauge(state, score = 0, directionOk = false, scoreThreshold = 0.76) {
  if (!state.statusEl) return;
  const pct = Math.max(0, Math.min(1, Number(score) || 0));
  const threshold = Math.max(0, Math.min(1, Number(scoreThreshold) || 0));
  const coverScale = Math.max(0, Math.min(1, 1 - pct));
  state.statusEl.hidden = false;
  state.statusEl.setAttribute("aria-hidden", "true");
  state.statusEl.classList.toggle("gg-status--direction-ok", !!directionOk);
  state.statusEl.classList.toggle("gg-status--direction-ko", !directionOk);
  state.statusEl.style.setProperty("--gg-cover-scale", "1");
  state.statusEl.style.setProperty("--gg-threshold-position", formatCssPercent(threshold));

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      state.statusEl?.style.setProperty("--gg-cover-scale", formatCssRatio(coverScale));
    });
  });
}

function hideScoreGauge(state) {
  if (!state.statusEl) return;
  state.statusEl.hidden = true;
  state.statusEl.classList.remove("gg-status--direction-ok", "gg-status--direction-ko");
  state.statusEl.style.setProperty("--gg-cover-scale", "1");
  state.statusEl.style.setProperty("--gg-threshold-position", "76%");
}

function setResetButtonEnabled(state, enabled = true) {
  if (!state.resetButtonEl) return;
  state.resetButtonEl.disabled = !enabled;
  state.resetButtonEl.setAttribute("aria-hidden", enabled ? "false" : "true");
}

function sampleUserPoints(points, count) {
  const source = Array.isArray(points) ? points : [];
  if (source.length <= count) return source;
  return Array.from({ length: count }, (_, index) => {
    const sourceIndex = Math.round((index * (source.length - 1)) / Math.max(1, count - 1));
    return source[sourceIndex];
  });
}

function nearestPointIndex(point, points) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  points.forEach((candidate, index) => {
    const d = distance(point, candidate);
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function getAlignedSamplesForPath(path, count = 80) {
  const rawSamples = samplePath(path, count);
  if (rawSamples.length < 2) return rawSamples;

  const pathBox = getPathBBox(path);
  const sampleBox = getPointsBBox(rawSamples);
  if (!hasFiniteBox(pathBox) || !hasFiniteBox(sampleBox)) return rawSamples;

  const epsilon = 0.01;
  const canScaleX = pathBox.width > epsilon && sampleBox.width > epsilon;
  const canScaleY = pathBox.height > epsilon && sampleBox.height > epsilon;
  const scaleX = canScaleX ? pathBox.width / sampleBox.width : 1;
  const scaleY = canScaleY ? pathBox.height / sampleBox.height : 1;

  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY)) return rawSamples;

  // Le recalage doit fonctionner aussi pour les traits parfaitement droits.
  // Les deuxièmes gestes de 4 et 7 ont une largeur OU une hauteur nulle :
  // l'ancien test les ignorait, alors que les autres chemins étaient recalés.
  return rawSamples.map((point) => ({
    x: canScaleX
      ? pathBox.x + ((point.x - sampleBox.x) * scaleX)
      : pathBox.x + (pathBox.width / 2),
    y: canScaleY
      ? pathBox.y + ((point.y - sampleBox.y) * scaleY)
      : pathBox.y + (pathBox.height / 2)
  }));
}

function getPathBBox(path) {
  try {
    const box = path?.getBBox?.();
    if (!box) return null;
    return {
      x: Number(box.x) || 0,
      y: Number(box.y) || 0,
      width: Number(box.width) || 0,
      height: Number(box.height) || 0
    };
  } catch {
    return null;
  }
}

function getPointsBBox(points) {
  const source = Array.isArray(points) ? points : [];
  if (!source.length) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  source.forEach((point) => {
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function hasFiniteBox(box) {
  return !!box
    && Number.isFinite(box.x)
    && Number.isFinite(box.y)
    && Number.isFinite(box.width)
    && Number.isFinite(box.height);
}

function isUsableBox(box) {
  return !!box && Number.isFinite(box.x) && Number.isFinite(box.y) && box.width > 0.01 && box.height > 0.01;
}

function getDisplaySampleCount(path) {
  const length = safePathLength(path);
  return Math.max(90, Math.min(260, Math.round(length / 1.5)));
}

function getAnimationDurationFromSamples(samples, path = null) {
  const length = getPolylineLength(samples) || safePathLength(path);
  return Math.max(820, Math.min(1700, length * 5.2));
}

function getPolylineLength(points) {
  const source = Array.isArray(points) ? points : [];
  let total = 0;
  for (let index = 1; index < source.length; index += 1) {
    total += distance(source[index - 1], source[index]);
  }
  return total;
}

function readPathStartPoint(path) {
  const d = String(path?.getAttribute?.("d") || "").trim();
  const match = d.match(/[mM]\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*[ ,]\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)/i);
  if (!match) return null;
  return { x: Number(match[1]) || 0, y: Number(match[2]) || 0 };
}

function samplePath(path, count = 80) {
  const length = safePathLength(path);
  return Array.from({ length: Math.max(2, count) }, (_, index) => {
    const p = path.getPointAtLength((length * index) / Math.max(1, count - 1));
    return { x: p.x, y: p.y };
  });
}

function drawActivePath(state) {
  renderUserStrokes(state, state.activePoints);
}

function renderUserStrokes(state, activePoints = null) {
  if (!state.userLayerEl) return;
  const strokeMarkup = state.userStrokes.map((points, index) => {
    if (!Array.isArray(points) || points.length < 2) return "";
    return `<path class="gg-user-path" data-gg-user-stroke="${index}" d="${escapeHtml(pointsToPathData(points))}"></path>`;
  }).join("");
  const activeMarkup = Array.isArray(activePoints) && activePoints.length >= 2
    ? `<path class="gg-user-path gg-user-path--active" d="${escapeHtml(pointsToPathData(activePoints))}"></path>`
    : "";
  state.userLayerEl.innerHTML = `${strokeMarkup}${activeMarkup}`;
}

function positionStartDot(state) {
  if (!state.startDotEl || !state.svgEl || !state.currentQuestion) return;
  const path = state.svgEl.querySelector(`.gg-model-path[data-gg-model-index="${state.currentStrokeIndex}"]`)
    || state.svgEl.querySelector(".gg-model-path");
  if (!path) return;
  const samples = state.strokeSamples[state.currentStrokeIndex] || getAlignedSamplesForPath(path, 2);
  const point = samples[0] || readPathStartPoint(path) || { x: 0, y: 0 };
  state.startDotEl.setAttribute("cx", String(point.x));
  state.startDotEl.setAttribute("cy", String(point.y));
}

function isTraceComplete(state) {
  const count = getExpectedStrokeCount(state);
  if (!count) return false;
  for (let index = 0; index < count; index += 1) {
    if (!Array.isArray(state.userStrokes[index]) || state.userStrokes[index].length < 2) return false;
  }
  return true;
}

function getExpectedStrokeCount(state) {
  return Math.max(0, state.currentQuestion?.strokes?.length || 0);
}

function clientPointToSvgPoint(state, clientX, clientY) {
  const svg = state.svgEl;
  if (!svg) return { x: 0, y: 0 };
  const rect = svg.getBoundingClientRect();
  const viewBox = getSvgViewBox(svg);

  if (!rect.width || !rect.height || !viewBox.width || !viewBox.height) {
    return { x: viewBox.x, y: viewBox.y };
  }

  // Important : on évite ici getScreenCTM(). Dans le banc runtime et certains
  // navigateurs/tablettes, il peut renvoyer une matrice différente de la zone
  // réellement dessinée quand le SVG est dans une iframe ou un conteneur
  // redimensionné. Le modèle gris est affiché en xMidYMid meet : on reproduit
  // explicitement ce calcul pour que le tracé utilisateur reste sous le doigt.
  const scale = Math.min(rect.width / viewBox.width, rect.height / viewBox.height);
  const drawnWidth = viewBox.width * scale;
  const drawnHeight = viewBox.height * scale;
  const offsetX = (rect.width - drawnWidth) / 2;
  const offsetY = (rect.height - drawnHeight) / 2;

  const x = viewBox.x + ((Number(clientX) - rect.left - offsetX) / scale);
  const y = viewBox.y + ((Number(clientY) - rect.top - offsetY) / scale);

  // Ne surtout pas borner ici aux limites du viewBox.
  // Le SVG garde une taille visuelle volontairement compacte pour le chiffre,
  // mais la zone de travail doit permettre de commencer/continuer le geste
  // largement autour du modèle. Le clamp était la vraie "boîte bleue" :
  // dès que le doigt sortait du rectangle du SVG, les coordonnées restaient
  // collées au bord, donc le tracé était coupé.
  return { x, y };
}

function getSvgViewBox(svg) {
  const baseVal = svg?.viewBox?.baseVal;
  if (baseVal && Number(baseVal.width) && Number(baseVal.height)) {
    return {
      x: Number(baseVal.x) || 0,
      y: Number(baseVal.y) || 0,
      width: Number(baseVal.width) || 0,
      height: Number(baseVal.height) || 0
    };
  }

  const raw = String(svg?.getAttribute?.("viewBox") || "0 0 210 297")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  return {
    x: Number.isFinite(raw[0]) ? raw[0] : 0,
    y: Number.isFinite(raw[1]) ? raw[1] : 0,
    width: Number.isFinite(raw[2]) && raw[2] > 0 ? raw[2] : 210,
    height: Number.isFinite(raw[3]) && raw[3] > 0 ? raw[3] : 297
  };
}

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function pointsToPathData(points) {
  if (!points.length) return "";
  const [first, ...rest] = points;
  return `M ${formatNumber(first.x)} ${formatNumber(first.y)} ${rest.map((p) => `L ${formatNumber(p.x)} ${formatNumber(p.y)}`).join(" ")}`;
}

function minDistanceToPoints(point, points) {
  if (!points.length) return Number.POSITIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  for (const candidate of points) {
    const d = distance(point, candidate);
    if (d < min) min = d;
  }
  return min;
}

function distance(a, b) {
  const dx = (Number(a?.x) || 0) - (Number(b?.x) || 0);
  const dy = (Number(a?.y) || 0) - (Number(b?.y) || 0);
  return Math.hypot(dx, dy);
}

function safePathLength(path) {
  try {
    return Math.max(1, path.getTotalLength());
  } catch {
    return 1;
  }
}

function formatNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(Math.round(n * 10) / 10) : "0";
}

function formatCssRatio(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n * 10000) / 10000);
}

function formatCssPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0%";
  return `${Math.round(n * 10000) / 100}%`;
}

function updateInstruction(state) {
  if (!state.instructionEl) return;
  setToolInstructionText(state.instructionEl, resolveToolInstructionText(state.latestContext, DEFAULT_INSTRUCTION));
}

function teardownBindings(state) {
  state.pointerAbortController?.abort?.();
  state.pointerAbortController = null;
}

function clearAnimationTimers(state) {
  state.animationTimers.forEach((timer) => window.clearTimeout(timer));
  state.animationTimers = [];
  if (state.animationFrame) window.cancelAnimationFrame(state.animationFrame);
  state.animationFrame = 0;
  state.animationRunId = (state.animationRunId || 0) + 1;
}

function teardownState(state, container) {
  teardownBindings(state);
  clearAnimationTimers(state);
  if (container) container.innerHTML = "";
  state.root = null;
  state.instructionEl = null;
  state.padEl = null;
  state.svgEl = null;
  state.userLayerEl = null;
  state.startDotEl = null;
  state.statusEl = null;
  state.resetButtonEl = null;
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  ensureToolInstructionStyles();
  const href = new URL("./activity.css", import.meta.url).href;
  if (document.querySelector(`link[data-gg-activity-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.ggActivityStyle = href;
  document.head.appendChild(link);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
