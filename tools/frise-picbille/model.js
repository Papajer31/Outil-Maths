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
  lineType: LINE_TYPES.PICBILLE,
  questionTypes: [QUESTION_TYPES.NUMBER_TO_GRADUATION, QUESTION_TYPES.GRADUATION_TO_NUMBER],
  picbilleBoxCount: 5,
  picbilleStartValue: 1
});

export function getDefaultSettings() {
  return clone(DEFAULT_SETTINGS);
}

export function normalizeSettings(settings = {}) {
  const raw = {
    ...getDefaultSettings(),
    ...(settings && typeof settings === "object" ? settings : {})
  };

  const lineType = LINE_TYPES.PICBILLE;
  const questionTypes = normalizeQuestionTypes(raw.questionTypes);
  const picbilleBoxCount = clampInt(raw.picbilleBoxCount, 2, 5);
  const picbilleStartValue = normalizePicbilleStartValue(raw.picbilleStartValue, picbilleBoxCount);
  const picbilleEndValue = picbilleStartValue + (picbilleBoxCount * PICBILLE_DRAW.cellsPerBox) - 1;

  return {
    lineType,
    questionTypes,
    markerPositions: [MARKER_POSITIONS.START],
    markerMin: picbilleStartValue,
    markerMax: picbilleEndValue,
    markerValueMode: "simple",
    markerValueStart: picbilleStartValue,
    markerValueStep: 1,
    markerValueList: [],
    markerGap: 1,
    picbilleBoxCount,
    picbilleStartValue,
    picbilleEndValue
  };
}

export function pickQuestion(settings = {}, previousKey = "") {
  const cfg = normalizeSettings(settings);
  const candidates = [];

  for (const questionType of cfg.questionTypes) {
    const question = createPicbilleQuestion(cfg, questionType);
    if (question) candidates.push(question);
  }

  if (!candidates.length) {
    const fallback = createPicbilleQuestion({
      ...cfg,
      questionTypes: [QUESTION_TYPES.NUMBER_TO_GRADUATION],
      picbilleBoxCount: 5,
      picbilleStartValue: 1,
      picbilleEndValue: 50
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
  const ticks = buildPicbilleTicks(cfg.picbilleBoxCount, cfg.picbilleStartValue);
  const markerIndices = [0];
  const targetCandidates = ticks.filter((tick) => {
    if (markerIndices.includes(tick.index)) return false;
    return Number.isInteger(tick.value);
  });
  const targetTick = pickRandom(targetCandidates);
  if (!targetTick) return null;

  return {
    lineType: LINE_TYPES.PICBILLE,
    questionType,
    targetIndex: targetTick.index,
    targetValue: targetTick.value,
    referenceA: cfg.picbilleStartValue,
    referenceB: cfg.picbilleEndValue,
    referencePosition: "picbille",
    markerGap: 1,
    unitStep: 1,
    tickCount,
    ticks,
    markerIndices,
    picbilleBoxCount: cfg.picbilleBoxCount,
    picbilleStartValue: cfg.picbilleStartValue,
    picbilleEndValue: cfg.picbilleEndValue,
    svgWidth: getPicbilleSvgWidth(cfg.picbilleBoxCount),
    svgHeight: PICBILLE_DRAW.svgHeight
  };
}

function createGraduatedLineQuestion(cfg, questionType) {
  const lineType = normalizeLineType(cfg.lineType);
  const markerGap = normalizeMarkerGap(cfg.markerGap, lineType);
  const unitStep = lineType === LINE_TYPES.COMPLETE ? markerGap / 10 : markerGap;
  const candidates = [];

  for (const referencePosition of cfg.markerPositions) {
    const structure = getLineStructure(lineType, referencePosition);
    const referenceA = pickReferenceA(cfg, {
      lineType,
      markerAIndex: structure.markerAIndex,
      unitStep,
      markerGap
    });
    if (referenceA == null) continue;

    const referenceB = referenceA + markerGap;
    const lineStartValue = referenceA - (structure.markerAIndex * unitStep);
    const ticks = buildGraduatedTicks(lineType, structure.tickCount, lineStartValue, unitStep);
    if (ticks.some((tick) => Number(tick.value) < 0)) continue;

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

  return pickRandom(candidates);
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
  unitStep,
  markerGap
}) {
  const allowedValues = Array.isArray(cfg.markerAllowedValues) && cfg.markerAllowedValues.length
    ? cfg.markerAllowedValues
    : [0];
  const normalizedValues = allowedValues
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value));
  const minReferenceA = (markerAIndex + getLeadingTickCount(lineType)) * unitStep;

  const validValues = normalizedValues.filter((value) => {
    if (!Number.isFinite(value)) return false;
    if (value < minReferenceA) return false;
    if (value + markerGap > Number(cfg.markerMax ?? Number.POSITIVE_INFINITY)) return false;
    if (!Number.isInteger(value / unitStep)) return false;
    if (lineType === LINE_TYPES.COMPLETE && !Number.isInteger(value / markerGap)) return false;
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

function buildPicbilleTicks(boxCount, startValue = 1) {
  const safeBoxCount = clampInt(boxCount, 2, 5);
  const safeStartValue = normalizePicbilleStartValue(startValue, safeBoxCount);
  return Array.from({ length: safeBoxCount * PICBILLE_DRAW.cellsPerBox }, (_, index) => ({
    index,
    value: safeStartValue + index,
    x: getPicbilleCellCenterX(index + 1),
    role: "regular"
  }));
}

export function getPicbilleSvgWidth(boxCount) {
  const safeBoxCount = clampInt(boxCount, 2, 5);
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
  const safeValue = clampInt(value, 1, 50);
  const zeroBased = safeValue - 1;
  const boxIndex = Math.floor(zeroBased / PICBILLE_DRAW.cellsPerBox);
  const cellIndexInBox = zeroBased % PICBILLE_DRAW.cellsPerBox;
  return getPicbilleBoxX(boxIndex) + (cellIndexInBox * PICBILLE_DRAW.cellWidth) + (PICBILLE_DRAW.cellWidth / 2);
}

function normalizePicbilleStartValue(value, boxCount = 5) {
  const starts = [1, 11, 21, 31, 41, 51];
  const safeBoxCount = clampInt(boxCount, 2, 5);
  const parsed = Math.floor(Number(value));
  const fallback = 1;
  const candidate = starts.includes(parsed) ? parsed : fallback;
  if (candidate + (safeBoxCount * PICBILLE_DRAW.cellsPerBox) - 1 <= 100) {
    return candidate;
  }
  const valid = starts.filter((start) => start + (safeBoxCount * PICBILLE_DRAW.cellsPerBox) - 1 <= 100);
  return valid.length ? valid[valid.length - 1] : fallback;
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
  return clean.length ? unique(clean) : [MARKER_POSITIONS.START];
}

function normalizeMarkerGap(value, lineType) {
  const n = clampInt(value, 1, 100);
  const clean = MARKER_GAPS.includes(n) ? n : 10;
  if (lineType === LINE_TYPES.COMPLETE && clean === 1) return 10;
  return clean;
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
