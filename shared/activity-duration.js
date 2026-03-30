import {
  normalizeActivityGlobals,
  normalizeToolDraft
} from "./activity-config.js";

export function normalizeDurationEstimate(estimate) {
  if (!estimate || typeof estimate !== "object") return null;

  const minSec = toSafeSec(estimate.minSec);
  const maxSec = toSafeSec(estimate.maxSec);

  if (minSec == null && maxSec == null) return null;

  const safeMin = minSec ?? maxSec ?? 0;
  const safeMax = Math.max(safeMin, maxSec ?? safeMin);

  return { minSec: safeMin, maxSec: safeMax };
}

export function estimateStandardToolDuration({
  draft,
  globals,
  hasAnswerPhase = true,
  questionCount = null,
  timePerQ = null,
  answerTime = null
} = {}) {
  const safeDraft = normalizeToolDraft(draft);
  const safeGlobals = normalizeActivityGlobals(globals);

  const safeQuestionCount = clampNonNegativeInt(
    questionCount ?? safeDraft.questionCount,
    safeDraft.questionCount
  );
  const safeTimePerQ = clampNonNegativeInt(
    timePerQ ?? safeDraft.timePerQ,
    safeDraft.timePerQ
  );
  const safeAnswerTime = hasAnswerPhase
    ? clampNonNegativeInt(answerTime ?? safeDraft.answerTime, safeDraft.answerTime)
    : 0;

  const transitionCount = Math.max(0, safeQuestionCount - 1);

  const totalSec =
    (safeQuestionCount * safeTimePerQ)
    + (transitionCount * clampNonNegativeInt(safeGlobals.questionTransitionSec, 0))
    + (hasAnswerPhase ? safeQuestionCount * safeAnswerTime : 0);

  return {
    minSec: totalSec,
    maxSec: totalSec
  };
}

export function addDurationEstimates(baseEstimate, nextEstimate) {
  const safeBase = normalizeDurationEstimate(baseEstimate);
  const safeNext = normalizeDurationEstimate(nextEstimate);

  if (!safeBase) return safeNext;
  if (!safeNext) return safeBase;

  return {
    minSec: safeBase.minSec + safeNext.minSec,
    maxSec: safeBase.maxSec + safeNext.maxSec
  };
}

export function sumDurationEstimates(estimates) {
  return (Array.isArray(estimates) ? estimates : []).reduce(
    (acc, estimate) => addDurationEstimates(acc, estimate),
    null
  );
}

export function formatDurationEstimate(estimate) {
  const safeEstimate = normalizeDurationEstimate(estimate);
  if (!safeEstimate) return "—";

  if (safeEstimate.minSec === safeEstimate.maxSec) {
    return formatDurationValue(safeEstimate.minSec);
  }

  return `entre ${formatDurationValue(safeEstimate.minSec)} et ${formatDurationValue(safeEstimate.maxSec)}`;
}

function formatDurationValue(totalSec) {
  const safeTotalSec = Math.max(0, Math.floor(Number(totalSec) || 0));

  if (safeTotalSec < 60) {
    return "moins d’1 minute";
  }

  const totalMinutes = Math.floor(safeTotalSec / 60);
  return `${totalMinutes} min`;
}

function toSafeSec(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, n);
}

function clampNonNegativeInt(value, fallback = 0) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return Math.max(0, Math.floor(Number(fallback) || 0));
  return Math.max(0, n);
}
