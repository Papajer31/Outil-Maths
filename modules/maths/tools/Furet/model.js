import {
  VALUE_CONSTRAINT_MODES,
  normalizeNumericConstraint
} from "../../../../shared/value-constraints.js";

const WORK_MIN = 0;
const WORK_MAX = 999;
const JUMP_MIN = 1;
const JUMP_MAX = 999;
const STEP_COUNT_MIN = 2;
const STEP_COUNT_MAX = 6;

export function getDefaultSettings() {
  return {
    workMin: 0,
    workMax: 99,
    allowAdd: true,
    allowSubtract: true,
    jumpMin: 1,
    jumpMax: 10,
    jumpMode: VALUE_CONSTRAINT_MODES.LIST,
    jumpStart: 1,
    jumpStep: 1,
    jumpList: [1, 10],
    stepCount: 4
  };
}

export function normalizeSettings(rawSettings = {}) {
  const defaults = getDefaultSettings();
  const workMin = clampInt(rawSettings.workMin ?? defaults.workMin, WORK_MIN, WORK_MAX);
  const workMax = clampInt(rawSettings.workMax ?? defaults.workMax, WORK_MIN, WORK_MAX);
  const workLower = Math.min(workMin, workMax);
  const workUpper = Math.max(workMin, workMax);

  const jumpConstraint = normalizeNumericConstraint({
    min: rawSettings.jumpMin ?? defaults.jumpMin,
    max: rawSettings.jumpMax ?? defaults.jumpMax,
    mode: rawSettings.jumpMode ?? defaults.jumpMode,
    start: rawSettings.jumpStart ?? defaults.jumpStart,
    step: rawSettings.jumpStep ?? defaults.jumpStep,
    values: rawSettings.jumpList ?? defaults.jumpList
  }, {
    inputMin: JUMP_MIN,
    inputMax: JUMP_MAX,
    defaultMin: defaults.jumpMin,
    defaultMax: defaults.jumpMax,
    defaultMode: defaults.jumpMode,
    defaultStart: defaults.jumpStart,
    defaultStep: defaults.jumpStep,
    defaultValues: defaults.jumpList
  });

  return {
    workMin: workLower,
    workMax: workUpper,
    allowAdd: rawSettings.allowAdd !== false,
    allowSubtract: rawSettings.allowSubtract !== false,
    jumpMin: jumpConstraint.min,
    jumpMax: jumpConstraint.max,
    jumpMode: jumpConstraint.mode,
    jumpStart: jumpConstraint.start,
    jumpStep: jumpConstraint.step,
    jumpList: jumpConstraint.values,
    stepCount: clampInt(rawSettings.stepCount ?? defaults.stepCount, STEP_COUNT_MIN, STEP_COUNT_MAX),
    jumpValues: jumpConstraint.allowedValues
  };
}

export function canGenerateQuestion(rawSettings = {}) {
  const planner = buildPlanner(normalizeSettings(rawSettings));
  return planner.startValues.length > 0;
}

export function pickQuestion(rawSettings = {}, {
  avoidKey = null,
  attempts = 80
} = {}) {
  const settings = normalizeSettings(rawSettings);
  const planner = buildPlanner(settings);
  if (!planner.startValues.length) {
    return null;
  }

  const tries = Math.max(1, Math.floor(Number(attempts) || 1));
  let bestQuestion = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestFallback = null;
  let bestFallbackScore = Number.NEGATIVE_INFINITY;

  for (let attempt = 0; attempt < tries; attempt += 1) {
    const start = pickRandom(planner.startValues);
    if (!Number.isFinite(start)) break;

    const signedSteps = buildRandomPath(planner, start, 0, 0);
    if (!signedSteps) continue;

    const question = buildQuestion(start, signedSteps);
    const score = scoreQuestion(question);
    const key = questionKey(question);

    if (score > bestFallbackScore) {
      bestFallback = question;
      bestFallbackScore = score;
    }

    if (avoidKey && key === avoidKey) {
      continue;
    }

    if (score > bestScore) {
      bestQuestion = question;
      bestScore = score;
    }
  }

  return bestQuestion || bestFallback;
}

export function questionKey(question) {
  const values = Array.isArray(question?.values) ? question.values.join(",") : "";
  const steps = Array.isArray(question?.signedSteps) ? question.signedSteps.join(",") : "";
  return `${values}|${steps}`;
}

function buildPlanner(settings) {
  const span = settings.workMax - settings.workMin;
  const jumpValues = Array.isArray(settings.jumpValues)
    ? settings.jumpValues.filter((value) => Number.isFinite(value) && value > 0 && value <= Math.max(1, span))
    : [];

  const signedSteps = [];
  if (settings.allowAdd) {
    jumpValues.forEach((value) => signedSteps.push(value));
  }
  if (settings.allowSubtract) {
    jumpValues.forEach((value) => signedSteps.push(-value));
  }

  const uniqueSteps = Array.from(new Set(signedSteps));
  const requiredMask = getRequiredMask(settings);
  const memo = new Map();

  const planner = {
    settings,
    signedSteps: uniqueSteps,
    requiredMask,
    canComplete(value, index, mask) {
      const key = `${value}|${index}|${mask}`;
      if (memo.has(key)) return memo.get(key);

      let result = false;
      if (index >= settings.stepCount) {
        result = (mask & requiredMask) === requiredMask;
      } else {
        for (const step of uniqueSteps) {
          const next = value + step;
          if (next < settings.workMin || next > settings.workMax) continue;
          const nextMask = mask | getOperationMask(step);
          if (planner.canComplete(next, index + 1, nextMask)) {
            result = true;
            break;
          }
        }
      }

      memo.set(key, result);
      return result;
    }
  };

  const startValues = [];
  for (let value = settings.workMin; value <= settings.workMax; value += 1) {
    if (planner.canComplete(value, 0, 0)) {
      startValues.push(value);
    }
  }

  planner.startValues = startValues;
  return planner;
}

function buildRandomPath(planner, currentValue, index, mask) {
  if (index >= planner.settings.stepCount) {
    return (mask & planner.requiredMask) === planner.requiredMask ? [] : null;
  }

  const candidates = shuffle(planner.signedSteps).filter((step) => {
    const next = currentValue + step;
    if (next < planner.settings.workMin || next > planner.settings.workMax) return false;
    const nextMask = mask | getOperationMask(step);
    return planner.canComplete(next, index + 1, nextMask);
  });

  for (const step of candidates) {
    const next = currentValue + step;
    const nextMask = mask | getOperationMask(step);
    const suffix = buildRandomPath(planner, next, index + 1, nextMask);
    if (suffix) {
      return [step, ...suffix];
    }
  }

  return null;
}

function buildQuestion(start, signedSteps) {
  const values = [start];
  let current = start;

  signedSteps.forEach((step) => {
    current += step;
    values.push(current);
  });

  return {
    start,
    signedSteps: [...signedSteps],
    values,
    stepLabels: signedSteps.map(formatSignedStep)
  };
}

function getRequiredMask(settings) {
  let mask = 0;
  if (settings.allowAdd) mask |= 1;
  if (settings.allowSubtract) mask |= 2;
  return mask;
}

function getOperationMask(step) {
  return step >= 0 ? 1 : 2;
}

function formatSignedStep(step) {
  const abs = Math.abs(step);
  return `${step >= 0 ? "+" : "−"}${abs}`;
}

function scoreQuestion(question) {
  const values = Array.isArray(question?.values) ? question.values : [];
  const signedSteps = Array.isArray(question?.signedSteps) ? question.signedSteps : [];
  const uniqueCount = new Set(values).size;
  let score = uniqueCount * 20;
  score -= Math.max(0, values.length - uniqueCount) * 35;

  for (let index = 1; index < signedSteps.length; index += 1) {
    if (signedSteps[index] === -signedSteps[index - 1]) {
      score -= 24;
    }
  }

  return score;
}

function clampInt(value, min, max) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function pickRandom(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return values[Math.floor(Math.random() * values.length)];
}

function shuffle(values) {
  const copy = Array.isArray(values) ? [...values] : [];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
