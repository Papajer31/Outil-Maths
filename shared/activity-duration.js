import {
  normalizeToolDraft
} from "./activity-config.js";

export function normalizeDurationEstimate(estimate) {
  if (!estimate || typeof estimate !== "object") return null;

  if (estimate.infinite === true) {
    return { infinite: true };
  }

  const minSec = toSafeSec(estimate.minSec);
  const maxSec = toSafeSec(estimate.maxSec);

  if (minSec == null && maxSec == null) return null;

  const safeMin = minSec ?? maxSec ?? 0;
  const safeMax = Math.max(safeMin, maxSec ?? safeMin);

  return { minSec: safeMin, maxSec: safeMax };
}

export function estimateStandardToolDuration({
  draft,
  hasAnswerPhase = true,
  questionCount = null,
  timePerQ = null,
  answerTime = null
} = {}) {
  const safeDraft = normalizeToolDraft(draft);

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

  const hasToolTimeLimit = safeDraft.toolMaxTimeInfinite !== true;
  const toolTimeLimitSec = hasToolTimeLimit
    ? Math.max(1, clampNonNegativeInt(safeDraft.toolMaxTimeMin, 10)) * 60
    : Number.POSITIVE_INFINITY;

  if (safeDraft.questionFlowMode !== "fixed" || safeDraft.infiniteTimePerQ || (hasAnswerPhase && safeDraft.infiniteAnswerTime)) {
    return hasToolTimeLimit
      ? { minSec: toolTimeLimitSec, maxSec: toolTimeLimitSec }
      : { infinite: true };
  }

  const transitionCount = Math.max(0, safeQuestionCount - 1);

  if (safeDraft.questionTransitionInfinite && transitionCount > 0) {
    return hasToolTimeLimit
      ? { minSec: toolTimeLimitSec, maxSec: toolTimeLimitSec }
      : { infinite: true };
  }

  const totalSec =
    (safeQuestionCount * safeTimePerQ)
    + (transitionCount * clampNonNegativeInt(safeDraft.questionTransitionSec, 0))
    + (hasAnswerPhase ? safeQuestionCount * safeAnswerTime : 0);
  const cappedTotalSec = hasToolTimeLimit
    ? Math.min(totalSec, toolTimeLimitSec)
    : totalSec;

  return {
    minSec: cappedTotalSec,
    maxSec: cappedTotalSec
  };
}


export function applyToolTimeLimitToDurationEstimate(estimate, draft) {
  const safeDraft = normalizeToolDraft(draft);
  if (safeDraft.toolMaxTimeInfinite === true) {
    return normalizeDurationEstimate(estimate);
  }

  const limitSec = Math.max(1, clampNonNegativeInt(safeDraft.toolMaxTimeMin, 10)) * 60;
  const safeEstimate = normalizeDurationEstimate(estimate);

  if (!safeEstimate || safeEstimate.infinite) {
    return { minSec: limitSec, maxSec: limitSec };
  }

  return {
    minSec: Math.min(safeEstimate.minSec, limitSec),
    maxSec: Math.min(safeEstimate.maxSec, limitSec)
  };
}

export function addDurationEstimates(baseEstimate, nextEstimate) {
  const safeBase = normalizeDurationEstimate(baseEstimate);
  const safeNext = normalizeDurationEstimate(nextEstimate);

  if (!safeBase) return safeNext;
  if (!safeNext) return safeBase;
  if (safeBase.infinite || safeNext.infinite) return { infinite: true };

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
  if (safeEstimate.infinite) return "∞";

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
