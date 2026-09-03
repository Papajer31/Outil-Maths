import { normalizeNumericConstraint } from "../../shared/value-constraints.js";

export const LINE_TYPES = Object.freeze({
  PICBILLE: "picbille",
  SIMPLE: "simple",
  COMPLETE: "complete"
});

export const QUESTION_TYPES = Object.freeze({
  NUMBER_TO_GRADUATION: "numberToGraduation",
  GRADUATION_TO_NUMBER: "graduationToNumber"
});

export const MARKER_POSITIONS = Object.freeze({
  START: "start",
  MIDDLE: "middle",
  END: "end"
});

export const MARKER_GAPS = Object.freeze([1, 10, 100]);

export const PICBILLE_DRAW = Object.freeze({
  cellsPerBox: 10,
  cellWidth: 34,
  cellHeight: 44,
  boxGap: 14,
  leftPadding: 24,
  rightPadding: 24,
  stripTopY: 118,
  svgHeight: 190,
  stripFill: "#efe1bf",
  stripStroke: "#8b7a63",
  mainLine: "#6f6455",
  crossLine: "#c9b48a",
  textColor: "#2b2b2b"
});

export const LINE_DRAW = Object.freeze({
  simpleTickCount: 15,
  completeTickCount: 121,
  completeContinuationTickCount: 4,
  svgWidth: 1400,
  svgHeight: 240,
  lineStartX: 70,
  lineEndX: 1330,
  lineY: 142
});

const DEFAULT_SETTINGS = Object.freeze({
  lineType: LINE_TYPES.SIMPLE,
  questionTypes: [QUESTION_TYPES.NUMBER_TO_GRADUATION, QUESTION_TYPES.GRADUATION_TO_NUMBER],
  markerPositions: [MARKER_POSITIONS.START, MARKER_POSITIONS.MIDDLE, MARKER_POSITIONS.END],
  markerMin: 0,
  markerMax: 140,
  markerValueMode: "simple",
  markerValueStart: 0,
  markerValueStep: 10,
  markerValueList: [],
  markerGaps: [10],
  markerGap: 10,
  picbilleBoxCount: 5
});

export function getDefaultSettings() {
  return clone(DEFAULT_SETTINGS);
}

export function normalizeSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const raw = {
    ...getDefaultSettings(),
    ...source
  };

  const lineType = LINE_TYPES.SIMPLE;
  const questionTypes = normalizeQuestionTypes(raw.questionTypes);
  const markerPositions = normalizeMarkerPositions(raw.markerPositions);
  const markerGapSource = Object.prototype.hasOwnProperty.call(source, "markerGaps")
    ? source.markerGaps
    : source.markerGap;
  const markerGaps = normalizeMarkerGaps(markerGapSource ?? DEFAULT_SETTINGS.markerGaps, lineType);
  const markerGap = markerGaps[0];

  const markerConstraint = normalizeNumericConstraint({
    min: raw.markerMin,
    max: raw.markerMax,
    mode: raw.markerValueMode,
    start: raw.markerValueStart,
    step: raw.markerValueStep,
    values: raw.markerValueList
  }, {
    inputMin: 0,
    inputMax: 9999,
    defaultMin: 0,
    defaultMax: 140,
    defaultStart: 0,
    defaultStep: markerGap,
    defaultValues: []
  });

  return {
    lineType,
    questionTypes,
    markerPositions,
    markerMin: markerConstraint.min,
    markerMax: markerConstraint.max,
    markerValueMode: markerConstraint.mode,
    markerValueStart: markerConstraint.start,
    markerValueStep: markerConstraint.step,
    markerValueList: markerConstraint.values,
    markerAllowedValues: markerConstraint.allowedValues,
    markerGaps,
    markerGap,
    picbilleBoxCount: 5
  };
}

export function pickQuestion(settings = {}, previousKey = "") {
  const cfg = normalizeSettings(settings);
  const candidates = [];

  for (const questionType of cfg.questionTypes) {
    const question = createGraduatedLineQuestion(cfg, questionType);
    if (question) candidates.push(question);
  }

  if (!candidates.length) {
    const fallback = createGraduatedLineQuestion({
      ...cfg,
      questionTypes: [QUESTION_TYPES.NUMBER_TO_GRADUATION],
      markerPositions: [MARKER_POSITIONS.MIDDLE],
      markerMin: 0,
      markerMax: cfg.lineType === LINE_TYPES.COMPLETE ? 124 : 140,
      markerAllowedValues: [cfg.lineType === LINE_TYPES.COMPLETE ? 60 : 70],
      markerGaps: [10],
      markerGap: 10
    }, QUESTION_TYPES.NUMBER_TO_GRADUATION);
    if (fallback) return fallback;
  }

  let picked = pickRandom(candidates);
  if (candidates.length > 1 && questionKey(picked) === previousKey) {
    const alternative = candidates.find((item) => questionKey(item) !== previousKey);
    if (alternative) picked = alternative;
  }
  return picked;
}

export function getPlayableMarkerGaps(settings = {}) {
  const cfg = normalizeSettings(settings);
  return cfg.markerGaps.filter((markerGap) => cfg.questionTypes.some((questionType) => {
    return Boolean(createGraduatedLineQuestion({
      ...cfg,
      markerGaps: [markerGap],
      markerGap
    }, questionType));
  }));
}

export function questionKey(question) {
  if (!question) return "";
  return [
    question.lineType,
    question.questionType,
    question.targetValue,
    question.targetIndex,
    question.referenceA,
    question.referenceB,
    question.referencePosition,
    question.markerGap,
    question.picbilleBoxCount
  ].join(":");
}

export function evaluateNumberAnswer(question, rawValue) {
  const submittedText = String(rawValue ?? "").trim();
  if (!/^-?\d+$/.test(submittedText)) {
    return {
      isCorrect: false,
      submittedText,
      submittedValue: null,
      expectedValue: question?.targetValue ?? null
    };
  }

  const submittedValue = Number.parseInt(submittedText, 10);
  return {
    isCorrect: submittedValue === Number(question?.targetValue),
    submittedText,
    submittedValue,
    expectedValue: question?.targetValue ?? null
  };
}

export function evaluateGraduationAnswer(question, submittedIndex) {
  const safeSubmittedIndex = Number.isInteger(submittedIndex) ? submittedIndex : null;
  return {
    isCorrect: safeSubmittedIndex === Number(question?.targetIndex),
    submittedIndex: safeSubmittedIndex,
    expectedIndex: question?.targetIndex ?? null,
    expectedValue: question?.targetValue ?? null
  };
}

export function getTickPercent(question, tickIndex) {
  const ticks = Array.isArray(question?.ticks) ? question.ticks : [];
  const tick = ticks.find((item) => item.index === tickIndex);
  if (!tick) return 50;
  const width = Number(question?.svgWidth) || LINE_DRAW.svgWidth;
  return Math.max(0, Math.min(100, (Number(tick.x) / width) * 100));
}

export function getNearestTickIndex(question, svgX) {
  const ticks = Array.isArray(question?.ticks) ? question.ticks : [];
  if (!ticks.length) return null;

  let best = ticks[0];
  let bestDistance = Math.abs(Number(svgX) - Number(best.x));
  ticks.forEach((tick) => {
    const distance = Math.abs(Number(svgX) - Number(tick.x));
    if (distance < bestDistance) {
      best = tick;
      bestDistance = distance;
    }
  });
  return best.index;
}

export function getTickValue(question, tickIndex) {
  const ticks = Array.isArray(question?.ticks) ? question.ticks : [];
  return ticks.find((item) => item.index === tickIndex)?.value ?? null;
}

function createPicbilleQuestion(cfg, questionType) {
  const tickCount = cfg.picbilleBoxCount * PICBILLE_DRAW.cellsPerBox;
  const ticks = buildPicbilleTicks(cfg.picbilleBoxCount);
  const markerIndices = [0];
  const targetTick = pickRandom(getTargetCandidates(ticks, markerIndices));
  if (!targetTick) return null;

  return {
    lineType: LINE_TYPES.PICBILLE,
    questionType,
    targetIndex: targetTick.index,
    targetValue: targetTick.value,
    referenceA: 1,
    referenceB: null,
    referencePosition: "picbille",
    markerGap: 1,
    unitStep: 1,
    tickCount,
    ticks,
    markerIndices,
    picbilleBoxCount: cfg.picbilleBoxCount,
    svgWidth: getPicbilleSvgWidth(cfg.picbilleBoxCount),
    svgHeight: PICBILLE_DRAW.svgHeight
  };
}

function createGraduatedLineQuestion(cfg, questionType) {
  const lineType = normalizeLineType(cfg.lineType);
  const markerGaps = normalizeMarkerGaps(cfg.markerGaps ?? cfg.markerGap, lineType);
  const questionsByGap = [];

  for (const markerGap of markerGaps) {
    const unitStep = lineType === LINE_TYPES.COMPLETE ? markerGap / 10 : markerGap;
    const candidates = [];

    for (const referencePosition of cfg.markerPositions) {
      const structure = getLineStructure(lineType, referencePosition);
      const referenceA = pickReferenceA(cfg, {
        lineType,
        markerAIndex: structure.markerAIndex,
        tickCount: structure.tickCount,
        unitStep,
        markerGap
      });
      if (referenceA == null) continue;

      const referenceB = referenceA + markerGap;
      const lineStartValue = referenceA - (structure.markerAIndex * unitStep);
      const ticks = buildGraduatedTicks(lineType, structure.tickCount, lineStartValue, unitStep);
      const markerIndices = [structure.markerAIndex, structure.markerBIndex];
      const targetTick = pickRandom(getTargetCandidates(ticks, markerIndices));
      if (!targetTick) continue;

      candidates.push({
        lineType,
        questionType,
        targetIndex: targetTick.index,
        targetValue: targetTick.value,
        referenceA,
        referenceB,
        referencePosition,
        markerGap,
        unitStep,
        tickCount: structure.tickCount,
        ticks,
        markerIndices,
        picbilleBoxCount: null,
        svgWidth: LINE_DRAW.svgWidth,
        svgHeight: LINE_DRAW.svgHeight
      });
    }

    const questionForGap = pickRandom(candidates);
    if (questionForGap) questionsByGap.push(questionForGap);
  }

  return pickRandom(questionsByGap);
}

function getLineStructure(lineType, position) {
  if (lineType === LINE_TYPES.COMPLETE) {
    const markerStep = 10;
    const tickCount = LINE_DRAW.completeTickCount;
    const lastMarkerIndex = tickCount - 1;
    const markerAIndex = position === MARKER_POSITIONS.START
      ? 0
      : position === MARKER_POSITIONS.END
        ? lastMarkerIndex - markerStep
        : Math.floor(lastMarkerIndex / 2);
    return {
      tickCount,
      markerAIndex,
      markerBIndex: markerAIndex + markerStep
    };
  }

  const markerStep = 1;
  const tickCount = LINE_DRAW.simpleTickCount;
  const lastMarkerIndex = tickCount - 1;
  const markerAIndex = position === MARKER_POSITIONS.START
    ? 0
    : position === MARKER_POSITIONS.END
      ? lastMarkerIndex - markerStep
      : Math.floor(lastMarkerIndex / 2);
  return {
    tickCount,
    markerAIndex,
    markerBIndex: markerAIndex + markerStep
  };
}

function pickReferenceA(cfg, {
  lineType,
  markerAIndex,
  tickCount,
  unitStep,
  markerGap
}) {
  const allowedValues = Array.isArray(cfg.markerAllowedValues) && cfg.markerAllowedValues.length
    ? cfg.markerAllowedValues
    : [0];
  const normalizedValues = allowedValues
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value));
  const minReferenceA = markerAIndex * unitStep;
  const minLineValue = Number.isFinite(Number(cfg.markerMin)) ? Number(cfg.markerMin) : 0;
  const maxLineValue = Number.isFinite(Number(cfg.markerMax)) ? Number(cfg.markerMax) : Number.POSITIVE_INFINITY;
  const lastIndex = Math.max(0, (Number(tickCount) || 1) - 1);

  const validValues = normalizedValues.filter((value) => {
    if (!Number.isFinite(value)) return false;
    if (value < minReferenceA) return false;
    if (value + markerGap > maxLineValue) return false;
    if (!Number.isInteger(value / unitStep)) return false;
    if (lineType === LINE_TYPES.COMPLETE && !Number.isInteger(value / markerGap)) return false;

    const lineStartValue = value - (markerAIndex * unitStep);
    const lineEndValue = lineStartValue + (lastIndex * unitStep);
    if (lineStartValue < minLineValue) return false;
    if (lineEndValue > maxLineValue) return false;

    return true;
  });

  if (validValues.length) return pickRandom(validValues);
  return null;
}

function getTargetCandidates(ticks, markerIndices = []) {
  const markers = new Set(markerIndices);
  return (Array.isArray(ticks) ? ticks : []).filter((tick) => {
    if (!tick || markers.has(tick.index)) return false;
    return Number.isInteger(tick.value) && Number(tick.value) >= 0;
  });
}

function buildGraduatedTicks(lineType, tickCount, lineStartValue, unitStep) {
  const span = LINE_DRAW.lineEndX - LINE_DRAW.lineStartX;
  const lastIndex = Math.max(1, tickCount - 1);
  const stepX = span / lastIndex;
  const extraTicks = lineType === LINE_TYPES.COMPLETE ? LINE_DRAW.completeContinuationTickCount : 0;
  const firstIndex = -extraTicks;
  const finalIndex = lastIndex + extraTicks;

  return Array.from({ length: finalIndex - firstIndex + 1 }, (_, offset) => {
    const index = firstIndex + offset;
    return {
    index,
    value: lineStartValue + (index * unitStep),
      x: LINE_DRAW.lineStartX + (stepX * index),
      role: getTickRole(lineType, index, lastIndex)
    };
  });
}

function getTickRole(lineType, index, lastIndex = LINE_DRAW.completeTickCount - 1) {
  if (lineType !== LINE_TYPES.COMPLETE) return "regular";
  if (index < 0 || index > lastIndex) return "minor";
  if (index % 10 === 0) return "major";
  if (index % 5 === 0) return "medium";
  return "minor";
}

function getLeadingTickCount(lineType) {
  return lineType === LINE_TYPES.COMPLETE ? LINE_DRAW.completeContinuationTickCount : 0;
}

function buildPicbilleTicks(boxCount) {
  const safeBoxCount = clampInt(boxCount, 2, 6);
  return Array.from({ length: safeBoxCount * PICBILLE_DRAW.cellsPerBox }, (_, index) => ({
    index,
    value: index + 1,
    x: getPicbilleCellCenterX(index + 1),
    role: "regular"
  }));
}

export function getPicbilleSvgWidth(boxCount) {
  const safeBoxCount = clampInt(boxCount, 2, 6);
  return PICBILLE_DRAW.leftPadding
    + (safeBoxCount * PICBILLE_DRAW.cellsPerBox * PICBILLE_DRAW.cellWidth)
    + ((safeBoxCount - 1) * PICBILLE_DRAW.boxGap)
    + PICBILLE_DRAW.rightPadding;
}

export function getPicbilleBoxX(boxIndex) {
  const boxWidth = PICBILLE_DRAW.cellsPerBox * PICBILLE_DRAW.cellWidth;
  return PICBILLE_DRAW.leftPadding + boxIndex * (boxWidth + PICBILLE_DRAW.boxGap);
}

export function getPicbilleCellCenterX(value) {
  const safeValue = clampInt(value, 1, 60);
  const zeroBased = safeValue - 1;
  const boxIndex = Math.floor(zeroBased / PICBILLE_DRAW.cellsPerBox);
  const cellIndexInBox = zeroBased % PICBILLE_DRAW.cellsPerBox;
  return getPicbilleBoxX(boxIndex) + (cellIndexInBox * PICBILLE_DRAW.cellWidth) + (PICBILLE_DRAW.cellWidth / 2);
}

function normalizeLineType(value) {
  const safeValue = String(value ?? "").trim();
  if (safeValue === LINE_TYPES.PICBILLE || safeValue === LINE_TYPES.COMPLETE) return safeValue;
  return LINE_TYPES.SIMPLE;
}

function normalizeQuestionTypes(value) {
  const rawValues = Array.isArray(value) ? value : [value];
  const clean = rawValues
    .map((item) => String(item ?? "").trim())
    .filter((item) => item === QUESTION_TYPES.NUMBER_TO_GRADUATION || item === QUESTION_TYPES.GRADUATION_TO_NUMBER);
  return clean.length ? unique(clean) : [...DEFAULT_SETTINGS.questionTypes];
}

function normalizeMarkerPositions(value) {
  const rawValues = Array.isArray(value) ? value : [value];
  const clean = rawValues
    .map((item) => String(item ?? "").trim())
    .filter((item) => item === MARKER_POSITIONS.START || item === MARKER_POSITIONS.MIDDLE || item === MARKER_POSITIONS.END);
  return clean.length ? unique(clean) : [...DEFAULT_SETTINGS.markerPositions];
}

function normalizeMarkerGaps(value, lineType) {
  const rawValues = Array.isArray(value) ? value : [value];
  const clean = unique(rawValues
    .map((item) => clampInt(item, 1, 100))
    .filter((item) => MARKER_GAPS.includes(item))
    .filter((item) => lineType !== LINE_TYPES.COMPLETE || item !== 1));
  if (clean.length) return clean;
  return [10];
}

function unique(values) {
  return [...new Set(values)];
}

function pickRandom(items) {
  const safeItems = Array.isArray(items) ? items : [];
  if (!safeItems.length) return null;
  return safeItems[Math.floor(Math.random() * safeItems.length)];
}

function clampInt(v, min, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
