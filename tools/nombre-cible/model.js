export const EXERCISE_TYPES = {
  TOKEN_BOXES: "token_boxes",
  TARGETED_CALCULATIONS: "targeted_calculations",
  CLASSIC_CHALLENGE: "classic_challenge"
};

// Ancien alias conservé pour les configs déjà enregistrées avec "classic".
const LEGACY_CLASSIC_EXERCISE_TYPE = "classic";

export const MIN_SOLUTIONS_TO_FIND_VALUES = [1, 2, 3];
export const TARGETED_NUMBER_COUNT_VALUES = [4, 5];
export const TARGETED_MAX_TARGET_VALUES = [50, 100, 500, 1000];
export const CLASSIC_MAX_TARGET_VALUES = [100, 500, 1000];
export const CLASSIC_SPECIAL_NUMBER_OPTIONS = [
  { id: "15", label: "15", values: [15] },
  { id: "20", label: "20", values: [20] },
  { id: "25", label: "25", values: [25] },
  { id: "50", label: "50", values: [50] },
  { id: "75", label: "75", values: [75] },
  { id: "100", label: "100", values: [100] },
  { id: "250", label: "250", values: [250] },
  { id: "otherTens", label: "autres dizaines", values: [30, 40, 60, 70, 80, 90] }
];
export const TARGETED_OPERATIONS = ["+", "-", "×"];

const DEFAULT_EXERCISE_TYPE = EXERCISE_TYPES.TOKEN_BOXES;
const BOX_COUNT_MIN = 3;
const BOX_COUNT_MAX = 6;
const BOX_VALUE_MIN = 1;
const BOX_VALUE_MAX = 99;
const SOLUTION_COUNT = 3;
const RANDOM_PICK_MAX_ATTEMPTS = 1800;
const TARGETED_RANDOM_PICK_MAX_ATTEMPTS = 2600;
const CLASSIC_RANDOM_PICK_MAX_ATTEMPTS = 360;
const TARGETED_CALCULATION_RESULT_MAX = 1000;
const CLASSIC_SOLUTION_VALUE_LIMIT = 2000;
const CLASSIC_STORED_NODES_PER_VALUE = 10;
const CLASSIC_MAX_VALUES_PER_MASK = 4200;

export function getDefaultSettings() {
  return {
    exerciseType: DEFAULT_EXERCISE_TYPE,
    tokenBoxes: {
      boxCount: 5,
      boxValueMin: 1,
      boxValueMax: 9,
      targetMin: 10,
      targetMax: 20,
      minSolutionsToFind: 3
    },
    targetedCalculations: {
      numberCount: 4,
      targetMax: 100
    },
    classicChallenge: {
      targetMax: 500,
      allowExactDivision: false,
      specialNumbers: {
        "15": true,
        "20": true,
        "25": true,
        "50": true,
        "75": true,
        "100": true,
        "250": false,
        otherTens: false
      }
    }
  };
}

export function normalizeSettings(settings = {}) {
  const safeSettings = isPlainObject(settings) ? settings : {};
  const defaults = getDefaultSettings();
  const rawTokenBoxes = isPlainObject(safeSettings.tokenBoxes)
    ? safeSettings.tokenBoxes
    : safeSettings;
  const rawTargeted = isPlainObject(safeSettings.targetedCalculations)
    ? safeSettings.targetedCalculations
    : safeSettings;
  const rawClassic = isPlainObject(safeSettings.classicChallenge)
    ? safeSettings.classicChallenge
    : safeSettings;

  return {
    exerciseType: normalizeExerciseType(safeSettings.exerciseType),
    tokenBoxes: normalizeTokenBoxesSettings({
      ...defaults.tokenBoxes,
      ...rawTokenBoxes
    }),
    targetedCalculations: normalizeTargetedCalculationsSettings({
      ...defaults.targetedCalculations,
      ...rawTargeted
    }),
    classicChallenge: normalizeClassicChallengeSettings({
      ...defaults.classicChallenge,
      ...rawClassic
    })
  };
}

export function normalizeTokenBoxesSettings(raw = {}) {
  const base = isPlainObject(raw) ? raw : {};
  const boxCount = clampInt(base.boxCount, BOX_COUNT_MIN, BOX_COUNT_MAX);
  let boxValueMin = clampInt(base.boxValueMin, BOX_VALUE_MIN, BOX_VALUE_MAX);
  let boxValueMax = clampInt(base.boxValueMax, BOX_VALUE_MIN, BOX_VALUE_MAX);
  if (boxValueMin > boxValueMax) {
    [boxValueMin, boxValueMax] = [boxValueMax, boxValueMin];
  }

  const targetAbsMax = getTargetAbsoluteMax(boxCount);
  let targetMin = clampInt(base.targetMin, 1, targetAbsMax);
  let targetMax = clampInt(base.targetMax, 1, targetAbsMax);
  if (targetMin > targetMax) {
    [targetMin, targetMax] = [targetMax, targetMin];
  }

  return {
    boxCount,
    boxValueMin,
    boxValueMax,
    targetMin,
    targetMax,
    minSolutionsToFind: normalizeMinSolutionsToFind(base.minSolutionsToFind)
  };
}

export function normalizeTargetedCalculationsSettings(raw = {}) {
  const base = isPlainObject(raw) ? raw : {};
  return {
    numberCount: normalizeTargetedNumberCount(base.numberCount),
    targetMax: normalizeTargetedMaxTarget(base.targetMax)
  };
}

export function normalizeClassicChallengeSettings(raw = {}) {
  const base = isPlainObject(raw) ? raw : {};
  return {
    targetMax: normalizeClassicTargetMax(base.targetMax),
    allowExactDivision: Boolean(base.allowExactDivision),
    specialNumbers: normalizeClassicSpecialNumbers(base.specialNumbers ?? base)
  };
}

export function normalizeClassicTargetMax(value) {
  const n = clampInt(value, CLASSIC_MAX_TARGET_VALUES[0], CLASSIC_MAX_TARGET_VALUES[CLASSIC_MAX_TARGET_VALUES.length - 1]);
  if (CLASSIC_MAX_TARGET_VALUES.includes(n)) return n;
  return CLASSIC_MAX_TARGET_VALUES.find((candidate) => n <= candidate) ?? CLASSIC_MAX_TARGET_VALUES[CLASSIC_MAX_TARGET_VALUES.length - 1];
}

export function normalizeClassicSpecialNumbers(raw = {}) {
  const base = isPlainObject(raw) ? raw : {};
  const defaults = getDefaultSettings().classicChallenge.specialNumbers;
  const out = {};
  CLASSIC_SPECIAL_NUMBER_OPTIONS.forEach((option) => {
    out[option.id] = Boolean(base[option.id] ?? defaults[option.id] ?? false);
  });
  return out;
}

export function hasClassicSpecialNumbersEnabled(classicSettings = {}) {
  const cfg = normalizeClassicChallengeSettings(classicSettings);
  return CLASSIC_SPECIAL_NUMBER_OPTIONS.some((option) => cfg.specialNumbers[option.id]);
}

export function normalizeTargetedNumberCount(value) {
  const n = clampInt(value, 4, 5);
  return TARGETED_NUMBER_COUNT_VALUES.includes(n) ? n : 4;
}

export function normalizeTargetedMaxTarget(value) {
  const n = clampInt(value, 50, TARGETED_CALCULATION_RESULT_MAX);
  if (TARGETED_MAX_TARGET_VALUES.includes(n)) return n;
  return TARGETED_MAX_TARGET_VALUES.find((candidate) => n <= candidate) ?? TARGETED_CALCULATION_RESULT_MAX;
}

export function getTargetAbsoluteMax(boxCount) {
  return clampInt(boxCount, BOX_COUNT_MIN, BOX_COUNT_MAX) * BOX_VALUE_MAX;
}

export function hasEnoughDistinctValues(settings) {
  const cfg = normalizeTokenBoxesSettings(settings?.tokenBoxes ?? settings);
  return (cfg.boxValueMax - cfg.boxValueMin + 1) >= cfg.boxCount;
}

export function canGenerateQuestion(settings) {
  const cfg = normalizeSettings(settings);
  if (cfg.exerciseType === EXERCISE_TYPES.TARGETED_CALCULATIONS) {
    return !!pickTargetedCalculationQuestion(cfg, { attempts: 420 });
  }
  if (cfg.exerciseType === EXERCISE_TYPES.CLASSIC_CHALLENGE) {
    return !!pickClassicChallengeQuestion(cfg, { attempts: 60 });
  }
  if (cfg.exerciseType !== EXERCISE_TYPES.TOKEN_BOXES) return false;
  return !!pickTokenBoxesQuestion(cfg, { attempts: 2200 });
}

export function pickQuestion(settings, {
  avoidKey = null,
  attempts = RANDOM_PICK_MAX_ATTEMPTS
} = {}) {
  const cfg = normalizeSettings(settings);

  if (cfg.exerciseType === EXERCISE_TYPES.TARGETED_CALCULATIONS) {
    return pickTargetedCalculationQuestion(cfg, { avoidKey, attempts: Math.max(attempts, TARGETED_RANDOM_PICK_MAX_ATTEMPTS) });
  }

  if (cfg.exerciseType === EXERCISE_TYPES.CLASSIC_CHALLENGE) {
    return pickClassicChallengeQuestion(cfg, { avoidKey, attempts: Math.max(120, Math.min(attempts, CLASSIC_RANDOM_PICK_MAX_ATTEMPTS)) });
  }

  if (cfg.exerciseType !== EXERCISE_TYPES.TOKEN_BOXES) {
    return null;
  }

  return pickTokenBoxesQuestion(cfg, { avoidKey, attempts });
}

function pickTokenBoxesQuestion(settings, {
  avoidKey = null,
  attempts = RANDOM_PICK_MAX_ATTEMPTS
} = {}) {
  const cfg = normalizeSettings(settings).tokenBoxes;

  if (!hasEnoughDistinctValues(cfg)) {
    return null;
  }

  let fallback = null;

  for (let i = 0; i < attempts; i++) {
    const candidate = buildTokenBoxesCandidate(cfg);
    if (!candidate) continue;

    if (!fallback) fallback = candidate;
    if (!avoidKey || questionKey(candidate) !== avoidKey) {
      return candidate;
    }
  }

  return fallback;
}

export function questionKey(question) {
  const exerciseType = normalizeExerciseType(question?.exerciseType);

  if (exerciseType === EXERCISE_TYPES.TARGETED_CALCULATIONS || exerciseType === EXERCISE_TYPES.CLASSIC_CHALLENGE) {
    const numbersKey = [...(question?.numbers ?? question?.initialNumbers ?? [])]
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => a - b)
      .join(",");
    return `${exerciseType}|${question?.target ?? ""}|${numbersKey}`;
  }

  const valuesKey = [...(question?.boxes ?? [])]
    .map((box) => Number(box?.value ?? 0))
    .sort((a, b) => a - b)
    .join(",");
  return `${exerciseType}|${question?.target ?? ""}|${valuesKey}`;
}

export function solutionKeyFromIds(boxIds = []) {
  return normalizeBoxIds(boxIds).sort(compareIds).join("|");
}

export function sumBoxIds(question, boxIds = []) {
  const boxById = new Map((question?.boxes ?? []).map((box) => [String(box.id), Number(box.value)]));
  return normalizeBoxIds(boxIds).reduce((sum, id) => sum + (boxById.get(String(id)) ?? 0), 0);
}

export function formatSelection(question, boxIds = [], { withResult = false } = {}) {
  const boxById = new Map((question?.boxes ?? []).map((box) => [String(box.id), Number(box.value)]));
  const values = normalizeBoxIds(boxIds)
    .map((id) => boxById.get(String(id)))
    .filter((value) => Number.isFinite(value));

  if (!values.length) return "";

  const expression = values.join(" + ");
  return withResult ? `${expression} = ${question?.target ?? ""}` : expression;
}

export function evaluateTokenBoxesResponse(question, responseLines = [], minSolutionsToFind = 3) {
  const expectedSolutions = normalizeExpectedSolutions(question);
  const expectedByKey = new Map(expectedSolutions.map((solution) => [solution.key, solution]));
  const threshold = normalizeMinSolutionsToFind(minSolutionsToFind);
  const normalizedLines = normalizeResponseLines(responseLines);
  const seenKeys = new Set();
  const lineEvaluations = normalizedLines.map((line) => {
    const key = solutionKeyFromIds(line.boxIds);
    const hasMinimumSize = line.boxIds.length >= 2;
    const isExpected = hasMinimumSize && expectedByKey.has(key);
    const isDuplicate = !!key && seenKeys.has(key);
    if (key) seenKeys.add(key);

    return {
      index: line.index,
      boxIds: line.boxIds,
      key,
      sum: sumBoxIds(question, line.boxIds),
      isEmpty: line.boxIds.length === 0,
      hasMinimumSize,
      isExpected,
      isDuplicate,
      isCorrectDistinct: isExpected && !isDuplicate
    };
  });

  const correctDistinctKeys = new Set(lineEvaluations
    .filter((line) => line.isCorrectDistinct)
    .map((line) => line.key));
  const missingSolutions = expectedSolutions.filter((solution) => !correctDistinctKeys.has(solution.key));

  return {
    lineEvaluations,
    expectedSolutions,
    correctDistinctKeys,
    correctDistinctCount: correctDistinctKeys.size,
    minSolutionsToFind: threshold,
    missingSolutions,
    isCorrect: correctDistinctKeys.size >= threshold
  };
}

export function hasDuplicateResponseLines(responseLines = []) {
  const seen = new Set();
  for (const line of normalizeResponseLines(responseLines)) {
    if (line.boxIds.length === 0) continue;
    const key = solutionKeyFromIds(line.boxIds);
    if (!key) continue;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

export function normalizeResponseLines(responseLines = []) {
  return (Array.isArray(responseLines) ? responseLines : [])
    .map((line, index) => ({
      index,
      boxIds: normalizeBoxIds(Array.isArray(line) ? line : line?.boxIds)
    }));
}

export function normalizeBoxIds(boxIds = []) {
  const ids = [];
  const seen = new Set();

  for (const rawId of Array.isArray(boxIds) ? boxIds : []) {
    const id = String(rawId ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  return ids;
}

export function normalizeMinSolutionsToFind(value) {
  const n = clampInt(value, 1, 3);
  return MIN_SOLUTIONS_TO_FIND_VALUES.includes(n) ? n : 3;
}

function buildTokenBoxesCandidate(settings) {
  const values = pickDistinctValues(settings.boxValueMin, settings.boxValueMax, settings.boxCount);
  if (values.length !== settings.boxCount) return null;

  const boxes = values.map((value, index) => ({
    id: `box_${index}`,
    value
  }));

  const grouped = collectSolutionsByTarget(boxes, settings.targetMin, settings.targetMax);
  const candidateTargets = [...grouped.entries()]
    .filter(([, solutions]) => solutions.length === SOLUTION_COUNT)
    .map(([target]) => target);

  if (!candidateTargets.length) return null;

  const target = pickRandom(candidateTargets);
  const rawSolutions = grouped.get(target) ?? [];
  const displaySolutions = shuffle(rawSolutions).map((solution) => ({
    boxIds: shuffle(solution.boxIds),
    values: solution.values,
    key: solution.key
  }));

  return {
    exerciseType: EXERCISE_TYPES.TOKEN_BOXES,
    target,
    boxes,
    values,
    solutions: displaySolutions,
    answerLines: displaySolutions.map((solution) => `${formatSelection({ boxes, target }, solution.boxIds)} = ${target}`)
  };
}

function collectSolutionsByTarget(boxes, targetMin, targetMax) {
  const grouped = new Map();
  const n = boxes.length;

  for (let mask = 1; mask < (1 << n); mask++) {
    const boxIds = [];
    const values = [];
    let sum = 0;

    for (let i = 0; i < n; i++) {
      if ((mask & (1 << i)) === 0) continue;
      boxIds.push(String(boxes[i].id));
      values.push(Number(boxes[i].value));
      sum += Number(boxes[i].value);
    }

    if (boxIds.length < 2) continue;
    if (sum < targetMin || sum > targetMax) continue;

    if (!grouped.has(sum)) grouped.set(sum, []);
    grouped.get(sum).push({
      boxIds,
      values,
      key: solutionKeyFromIds(boxIds)
    });
  }

  return grouped;
}

function normalizeExpectedSolutions(question) {
  return (Array.isArray(question?.solutions) ? question.solutions : [])
    .map((solution) => {
      const boxIds = normalizeBoxIds(solution?.boxIds ?? solution);
      return {
        boxIds,
        key: solutionKeyFromIds(boxIds)
      };
    })
    .filter((solution) => solution.boxIds.length >= 2 && solution.key);
}

export function getTargetedRequiredStepCount(questionOrSettings) {
  if (String(questionOrSettings?.exerciseType ?? "") === EXERCISE_TYPES.CLASSIC_CHALLENGE) {
    return 5;
  }
  const rawCount = Number(questionOrSettings?.numberCount ?? questionOrSettings?.targetedCalculations?.numberCount ?? 4);
  return Math.max(1, normalizeTargetedNumberCount(rawCount) - 1);
}

export function createTargetedInitialTiles(question) {
  const numbers = Array.isArray(question?.numbers)
    ? question.numbers
    : (Array.isArray(question?.initialNumbers) ? question.initialNumbers : []);
  return numbers.map((value, index) => createInitialTargetedTile(value, index));
}

export function formatTargetedStep(step) {
  if (!step) return "";
  const left = Number(step.leftValue);
  const right = Number(step.rightValue);
  const result = Number(step.result);
  const op = normalizeOperation(step.op);
  if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(result) || !op) return "";
  return `${left} ${op} ${right} = ${result}`;
}

export function targetedStepKey(step) {
  if (!step) return "";
  const op = normalizeOperation(step.op);
  const leftKey = sourceKey(step.leftSources ?? step.leftSourceIds ?? []);
  const rightKey = sourceKey(step.rightSources ?? step.rightSourceIds ?? []);
  if (!op || !leftKey || !rightKey) return "";

  if (op === "+" || op === "×") {
    return `${op}:${[leftKey, rightKey].sort().join("|")}`;
  }

  return `${op}:${leftKey}|${rightKey}`;
}

export function evaluateTargetedCalculationResponse(question, steps = []) {
  const safeSteps = Array.isArray(steps) ? steps : [];
  const solutionSteps = Array.isArray(question?.solutionSteps) ? question.solutionSteps : [];
  const solutionKeys = new Set(solutionSteps.map(targetedStepKey).filter(Boolean));
  const stepEvaluations = safeSteps.map((step, index) => {
    const key = targetedStepKey(step);
    return {
      index,
      step,
      key,
      isInReferenceSolution: !!key && solutionKeys.has(key)
    };
  });
  const finalValue = safeSteps.length ? Number(safeSteps[safeSteps.length - 1]?.result) : null;
  const requiredStepCount = getTargetedRequiredStepCount(question);
  const isClassic = String(question?.exerciseType ?? "") === EXERCISE_TYPES.CLASSIC_CHALLENGE;
  const target = Number(question?.target);
  const isComplete = isClassic
    ? safeSteps.some((step) => Number(step?.result) === target)
    : safeSteps.length === requiredStepCount;
  const isCorrect = isClassic
    ? isComplete
    : isComplete && Number(finalValue) === target;

  return {
    stepEvaluations,
    solutionSteps,
    finalValue,
    requiredStepCount,
    isComplete,
    isCorrect
  };
}

function pickTargetedCalculationQuestion(settings, {
  avoidKey = null,
  attempts = TARGETED_RANDOM_PICK_MAX_ATTEMPTS
} = {}) {
  const cfg = normalizeSettings(settings).targetedCalculations;
  let fallback = null;

  for (let i = 0; i < attempts; i += 1) {
    const candidate = buildTargetedCalculationCandidate(cfg);
    if (!candidate) continue;

    if (!fallback) fallback = candidate;
    if (!avoidKey || questionKey(candidate) !== avoidKey) {
      return candidate;
    }
  }

  return fallback;
}

function buildTargetedCalculationCandidate(cfg) {
  const settings = normalizeTargetedCalculationsSettings(cfg);
  const numbers = pickTargetedNumbers(settings.numberCount, settings.targetMax);
  if (numbers.length !== settings.numberCount) return null;

  const familyBuilders = getTargetedFamilyBuilders(settings.numberCount);
  const builders = shuffleWeighted(familyBuilders);
  const intermediateLimit = getIntermediateLimit(settings.targetMax);

  for (const entry of builders) {
    const candidate = entry.builder(numbers, {
      targetMax: settings.targetMax,
      intermediateLimit
    });
    if (!candidate) continue;
    const target = Number(candidate.target);
    if (!Number.isFinite(target) || target < 0 || target > settings.targetMax) continue;
    if (!Array.isArray(candidate.steps) || candidate.steps.length !== settings.numberCount - 1) continue;
    if (!candidate.steps.some((step) => step.op === "×")) continue;

    return {
      exerciseType: EXERCISE_TYPES.TARGETED_CALCULATIONS,
      numberCount: settings.numberCount,
      target,
      numbers,
      initialNumbers: numbers,
      targetMax: settings.targetMax,
      family: entry.id,
      solutionSteps: candidate.steps,
      answerLines: candidate.steps.map(formatTargetedStep)
    };
  }

  return null;
}

function getTargetedFamilyBuilders(numberCount) {
  const common4 = [
    { id: "two_products_add", weight: 14, builder: buildTwoProducts("+") },
    { id: "two_products_sub", weight: 14, builder: buildTwoProducts("-") },
    { id: "pivot_product_delta", weight: 16, builder: buildProductWithCorrection },
    { id: "made_factor_times_pivot", weight: 12, builder: buildMadeFactorTimesPivot },
    { id: "two_expressions_product", weight: 7, builder: buildTwoExpressionsProduct },
    { id: "triple_product_adjust", weight: 8, builder: buildTripleProductAdjust },
    { id: "total_product_rare", weight: 1, builder: buildTotalProduct }
  ];

  if (numberCount === 5) {
    return [
      { id: "two_products_adjust", weight: 16, builder: buildFiveTwoProductsAdjust },
      { id: "product_correction_three", weight: 14, builder: buildFiveProductCorrectionThree },
      { id: "parenthesis_mult_correction", weight: 13, builder: buildFiveParenthesisMultCorrection },
      { id: "make_pivot_five", weight: 11, builder: buildFiveMakePivot },
      { id: "two_expr_adjust", weight: 8, builder: buildFiveTwoExprAdjust },
      { id: "triple_product_adjust_five", weight: 6, builder: buildFiveTripleProductAdjust }
    ];
  }

  return common4;
}

function buildTwoProducts(finalOp) {
  return (numbers, limits) => {
    const order = shuffle([0, 1, 2, 3]);
    const tiles = makeInitialNodes(numbers);
    const p1 = combineNodes(tiles[order[0]], "×", tiles[order[1]], limits);
    const p2 = combineNodes(tiles[order[2]], "×", tiles[order[3]], limits);
    if (!p1 || !p2) return null;
    const [left, right] = finalOp === "-" ? orderForNonNegative(p1, p2) : [p1, p2];
    const finalNode = combineNodes(left, finalOp, right, limits);
    if (!finalNode) return null;
    return makeCandidate(finalNode, [p1.step, p2.step, finalNode.step]);
  };
}

function buildProductWithCorrection(numbers, limits) {
  const order = shuffle([0, 1, 2, 3]);
  const tiles = makeInitialNodes(numbers);
  const product = combineNodes(tiles[order[0]], "×", tiles[order[1]], limits);
  if (!product) return null;

  const correctionOp = Math.random() < 0.5 ? "+" : "-";
  let correction = null;
  if (Math.random() < 0.5) {
    correction = combineNodes(tiles[order[2]], "+", tiles[order[3]], limits);
  } else {
    const [a, b] = orderForNonNegative(tiles[order[2]], tiles[order[3]]);
    correction = combineNodes(a, "-", b, limits);
  }
  if (!correction) return null;
  const [left, right] = correctionOp === "-" ? orderForNonNegative(product, correction) : [product, correction];
  const finalNode = combineNodes(left, correctionOp, right, limits);
  if (!finalNode) return null;
  return makeCandidate(finalNode, [product.step, correction.step, finalNode.step]);
}

function buildMadeFactorTimesPivot(numbers, limits) {
  const order = shuffle([0, 1, 2, 3]);
  const tiles = makeInitialNodes(numbers);
  const makeOp = Math.random() < 0.72 ? "+" : "-";
  const [firstA, firstB] = makeOp === "-"
    ? orderForNonNegative(tiles[order[0]], tiles[order[1]])
    : [tiles[order[0]], tiles[order[1]]];
  const factor = combineNodes(firstA, makeOp, firstB, limits);
  if (!factor) return null;
  const pivot = tiles[order[2]];
  const product = combineNodes(factor, "×", pivot, limits);
  if (!product) return null;
  const adjustOp = Math.random() < 0.55 ? "+" : "-";
  const [left, right] = adjustOp === "-" ? orderForNonNegative(product, tiles[order[3]]) : [product, tiles[order[3]]];
  const finalNode = combineNodes(left, adjustOp, right, limits);
  if (!finalNode) return null;
  return makeCandidate(finalNode, [factor.step, product.step, finalNode.step]);
}

function buildTwoExpressionsProduct(numbers, limits) {
  const order = shuffle([0, 1, 2, 3]);
  const tiles = makeInitialNodes(numbers);
  const left = combineNodes(tiles[order[0]], "+", tiles[order[1]], limits);
  if (!left) return null;
  const secondOp = Math.random() < 0.65 ? "+" : "-";
  const [a, b] = secondOp === "-" ? orderForNonNegative(tiles[order[2]], tiles[order[3]]) : [tiles[order[2]], tiles[order[3]]];
  const right = combineNodes(a, secondOp, b, limits);
  if (!right) return null;
  const finalNode = combineNodes(left, "×", right, limits);
  if (!finalNode) return null;
  return makeCandidate(finalNode, [left.step, right.step, finalNode.step]);
}

function buildTripleProductAdjust(numbers, limits) {
  const order = shuffle([0, 1, 2, 3]);
  const tiles = makeInitialNodes(numbers);
  const p1 = combineNodes(tiles[order[0]], "×", tiles[order[1]], limits);
  if (!p1) return null;
  const p2 = combineNodes(p1, "×", tiles[order[2]], limits);
  if (!p2) return null;
  const adjustOp = Math.random() < 0.5 ? "+" : "-";
  const [left, right] = adjustOp === "-" ? orderForNonNegative(p2, tiles[order[3]]) : [p2, tiles[order[3]]];
  const finalNode = combineNodes(left, adjustOp, right, limits);
  if (!finalNode) return null;
  return makeCandidate(finalNode, [p1.step, p2.step, finalNode.step]);
}

function buildTotalProduct(numbers, limits) {
  const order = shuffle([0, 1, 2, 3]);
  const tiles = makeInitialNodes(numbers);
  const p1 = combineNodes(tiles[order[0]], "×", tiles[order[1]], limits);
  const p2 = p1 ? combineNodes(p1, "×", tiles[order[2]], limits) : null;
  const p3 = p2 ? combineNodes(p2, "×", tiles[order[3]], limits) : null;
  if (!p1 || !p2 || !p3) return null;
  return makeCandidate(p3, [p1.step, p2.step, p3.step]);
}

function buildFiveTwoProductsAdjust(numbers, limits) {
  const order = shuffle([0, 1, 2, 3, 4]);
  const tiles = makeInitialNodes(numbers);
  const p1 = combineNodes(tiles[order[0]], "×", tiles[order[1]], limits);
  const p2 = combineNodes(tiles[order[2]], "×", tiles[order[3]], limits);
  if (!p1 || !p2) return null;
  const sumOrDiff = Math.random() < 0.68 ? "+" : "-";
  const [midLeft, midRight] = sumOrDiff === "-" ? orderForNonNegative(p1, p2) : [p1, p2];
  const mid = combineNodes(midLeft, sumOrDiff, midRight, limits);
  if (!mid) return null;
  const finalOp = Math.random() < 0.52 ? "+" : "-";
  const [left, right] = finalOp === "-" ? orderForNonNegative(mid, tiles[order[4]]) : [mid, tiles[order[4]]];
  const finalNode = combineNodes(left, finalOp, right, limits);
  if (!finalNode) return null;
  return makeCandidate(finalNode, [p1.step, p2.step, mid.step, finalNode.step]);
}

function buildFiveProductCorrectionThree(numbers, limits) {
  const order = shuffle([0, 1, 2, 3, 4]);
  const tiles = makeInitialNodes(numbers);
  const product = combineNodes(tiles[order[0]], "×", tiles[order[1]], limits);
  if (!product) return null;
  let firstCorrection = null;
  if (Math.random() < 0.65) {
    firstCorrection = combineNodes(tiles[order[2]], "+", tiles[order[3]], limits);
  } else {
    const [firstLeft, firstRight] = orderForNonNegative(tiles[order[2]], tiles[order[3]]);
    firstCorrection = combineNodes(firstLeft, "-", firstRight, limits);
  }
  if (!firstCorrection) return null;
  const secondCorrectionOp = Math.random() < 0.56 ? "+" : "-";
  const [corrLeft, corrRight] = secondCorrectionOp === "-"
    ? orderForNonNegative(firstCorrection, tiles[order[4]])
    : [firstCorrection, tiles[order[4]]];
  const correction = combineNodes(corrLeft, secondCorrectionOp, corrRight, limits);
  if (!correction) return null;
  const finalOp = Math.random() < 0.52 ? "+" : "-";
  const [left, right] = finalOp === "-" ? orderForNonNegative(product, correction) : [product, correction];
  const finalNode = combineNodes(left, finalOp, right, limits);
  if (!finalNode) return null;
  return makeCandidate(finalNode, [product.step, firstCorrection.step, correction.step, finalNode.step]);
}

function buildFiveParenthesisMultCorrection(numbers, limits) {
  const order = shuffle([0, 1, 2, 3, 4]);
  const tiles = makeInitialNodes(numbers);
  const makeOp = Math.random() < 0.74 ? "+" : "-";
  const [a, b] = makeOp === "-" ? orderForNonNegative(tiles[order[0]], tiles[order[1]]) : [tiles[order[0]], tiles[order[1]]];
  const factor = combineNodes(a, makeOp, b, limits);
  if (!factor) return null;
  const product = combineNodes(factor, "×", tiles[order[2]], limits);
  if (!product) return null;
  const correctionParts = orderForNonNegative(tiles[order[3]], tiles[order[4]]);
  const correction = combineNodes(correctionParts[0], "-", correctionParts[1], limits);
  if (!correction) return null;
  const finalOp = Math.random() < 0.58 ? "+" : "-";
  const [left, right] = finalOp === "-" ? orderForNonNegative(product, correction) : [product, correction];
  const finalNode = combineNodes(left, finalOp, right, limits);
  if (!finalNode) return null;
  return makeCandidate(finalNode, [factor.step, product.step, correction.step, finalNode.step]);
}

function buildFiveMakePivot(numbers, limits) {
  const order = shuffle([0, 1, 2, 3, 4]);
  const tiles = makeInitialNodes(numbers);
  const start = combineNodes(tiles[order[0]], "+", tiles[order[1]], limits);
  if (!start) return null;
  const [subLeft, subRight] = orderForNonNegative(start, tiles[order[2]]);
  const factor = combineNodes(subLeft, "-", subRight, limits);
  if (!factor) return null;
  const product = combineNodes(factor, "×", tiles[order[3]], limits);
  if (!product) return null;
  const finalOp = Math.random() < 0.55 ? "+" : "-";
  const [left, right] = finalOp === "-" ? orderForNonNegative(product, tiles[order[4]]) : [product, tiles[order[4]]];
  const finalNode = combineNodes(left, finalOp, right, limits);
  if (!finalNode) return null;
  return makeCandidate(finalNode, [start.step, factor.step, product.step, finalNode.step]);
}

function buildFiveTwoExprAdjust(numbers, limits) {
  const order = shuffle([0, 1, 2, 3, 4]);
  const tiles = makeInitialNodes(numbers);
  const left = combineNodes(tiles[order[0]], "+", tiles[order[1]], limits);
  if (!left) return null;
  const secondOp = Math.random() < 0.66 ? "+" : "-";
  const [a, b] = secondOp === "-" ? orderForNonNegative(tiles[order[2]], tiles[order[3]]) : [tiles[order[2]], tiles[order[3]]];
  const right = combineNodes(a, secondOp, b, limits);
  if (!right) return null;
  const product = combineNodes(left, "×", right, limits);
  if (!product) return null;
  const finalOp = Math.random() < 0.5 ? "+" : "-";
  const [finalLeft, finalRight] = finalOp === "-" ? orderForNonNegative(product, tiles[order[4]]) : [product, tiles[order[4]]];
  const finalNode = combineNodes(finalLeft, finalOp, finalRight, limits);
  if (!finalNode) return null;
  return makeCandidate(finalNode, [left.step, right.step, product.step, finalNode.step]);
}

function buildFiveTripleProductAdjust(numbers, limits) {
  const order = shuffle([0, 1, 2, 3, 4]);
  const tiles = makeInitialNodes(numbers);
  const p1 = combineNodes(tiles[order[0]], "×", tiles[order[1]], limits);
  const p2 = p1 ? combineNodes(p1, "×", tiles[order[2]], limits) : null;
  if (!p1 || !p2) return null;
  const midOp = Math.random() < 0.55 ? "+" : "-";
  const [midLeft, midRight] = midOp === "-" ? orderForNonNegative(p2, tiles[order[3]]) : [p2, tiles[order[3]]];
  const mid = combineNodes(midLeft, midOp, midRight, limits);
  if (!mid) return null;
  const finalOp = Math.random() < 0.5 ? "+" : "-";
  const [left, right] = finalOp === "-" ? orderForNonNegative(mid, tiles[order[4]]) : [mid, tiles[order[4]]];
  const finalNode = combineNodes(left, finalOp, right, limits);
  if (!finalNode) return null;
  return makeCandidate(finalNode, [p1.step, p2.step, mid.step, finalNode.step]);
}

function makeCandidate(finalNode, steps) {
  if (!finalNode || !Array.isArray(steps)) return null;
  const cleanedSteps = steps.filter(Boolean);
  if (!cleanedSteps.length) return null;
  return {
    target: finalNode.value,
    steps: cleanedSteps.map(normalizeTargetedStep)
  };
}

function makeInitialNodes(numbers) {
  return numbers.map((value, index) => createInitialTargetedTile(value, index));
}

function createInitialTargetedTile(value, index) {
  const id = `n${index}`;
  return {
    id,
    value: Number(value),
    expr: String(value),
    sources: [id],
    sourceIds: [id],
    kind: "initial",
    label: String(value)
  };
}

function combineNodes(left, op, right, limits = {}) {
  const safeOp = normalizeOperation(op);
  if (!left || !right || !safeOp) return null;
  const leftValue = Number(left.value);
  const rightValue = Number(right.value);
  if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return null;

  if (safeOp === "-" && leftValue < rightValue) return null;
  if (safeOp === "×" && (leftValue === 0 || rightValue === 0 || leftValue === 1 || rightValue === 1)) return null;
  if (safeOp === "+" && (leftValue === 0 || rightValue === 0)) return null;
  if (safeOp === "-" && rightValue === 0) return null;
  if (safeOp === "÷") {
    if (rightValue === 0 || rightValue === 1 || leftValue === 0) return null;
    if (!Number.isInteger(leftValue) || !Number.isInteger(rightValue) || leftValue % rightValue !== 0) return null;
  }

  const value = safeOp === "+"
    ? leftValue + rightValue
    : safeOp === "-"
      ? leftValue - rightValue
      : safeOp === "×"
        ? leftValue * rightValue
        : leftValue / rightValue;

  if (!Number.isFinite(value) || value < 0 || value > TARGETED_CALCULATION_RESULT_MAX) return null;
  const intermediateLimit = Number(limits?.intermediateLimit);
  if (Number.isFinite(intermediateLimit) && value > intermediateLimit) return null;

  const sourceIds = [...(left.sourceIds ?? left.sources ?? []), ...(right.sourceIds ?? right.sources ?? [])];
  const node = {
    id: `r_${sourceKey(sourceIds)}_${safeOp}_${value}`,
    value,
    expr: `${wrapExpr(left)} ${safeOp} ${wrapExpr(right)}`,
    sources: sourceIds,
    sourceIds,
    kind: "result",
    label: String(value)
  };

  node.step = normalizeTargetedStep({
    leftValue,
    rightValue,
    result: value,
    op: safeOp,
    leftSources: [...(left.sourceIds ?? left.sources ?? [])],
    rightSources: [...(right.sourceIds ?? right.sources ?? [])],
    leftExpression: left.expr,
    rightExpression: right.expr
  });

  return node;
}

function normalizeTargetedStep(step) {
  return {
    leftValue: Number(step.leftValue),
    rightValue: Number(step.rightValue),
    result: Number(step.result),
    op: normalizeOperation(step.op),
    leftSources: [...(step.leftSources ?? step.leftSourceIds ?? [])].map(String),
    rightSources: [...(step.rightSources ?? step.rightSourceIds ?? [])].map(String),
    leftExpression: String(step.leftExpression ?? step.leftValue ?? ""),
    rightExpression: String(step.rightExpression ?? step.rightValue ?? ""),
    key: targetedStepKey(step)
  };
}

function orderForNonNegative(a, b) {
  return Number(a?.value) >= Number(b?.value) ? [a, b] : [b, a];
}

function normalizeOperation(value) {
  const safe = String(value ?? "").trim();
  if (safe === "+" || safe === "-" || safe === "×" || safe === "÷") return safe;
  if (safe === "x" || safe === "X" || safe === "*") return "×";
  if (safe === "/" || safe === ":") return "÷";
  return "";
}

function sourceKey(ids = []) {
  return [...(Array.isArray(ids) ? ids : [])]
    .map(String)
    .filter(Boolean)
    .sort(compareIds)
    .join("+");
}

function wrapExpr(node) {
  const expr = String(node?.expr ?? node?.value ?? "");
  return expr.includes(" ") ? `(${expr})` : expr;
}

function pickClassicChallengeQuestion(settings, {
  avoidKey = null,
  attempts = CLASSIC_RANDOM_PICK_MAX_ATTEMPTS
} = {}) {
  const cfg = normalizeSettings(settings).classicChallenge;
  let fallback = null;

  for (let i = 0; i < attempts; i += 1) {
    const candidate = buildClassicChallengeCandidate(cfg);
    if (!candidate) continue;

    if (!fallback) fallback = candidate;
    if (!avoidKey || questionKey(candidate) !== avoidKey) {
      return candidate;
    }
  }

  return fallback;
}

function buildClassicChallengeCandidate(cfg) {
  const settings = normalizeClassicChallengeSettings(cfg);
  const numbers = pickClassicChallengeNumbers(settings);
  if (numbers.length !== 6) return null;

  const specialValues = getClassicSpecialValues(settings);
  const mustUseSpecial = specialValues.length > 0;
  const specialIndexes = new Set(numbers
    .map((value, index) => specialValues.includes(Number(value)) ? `n${index}` : "")
    .filter(Boolean));

  if (mustUseSpecial && !specialIndexes.size) return null;

  const solved = solveClassicChallenge(numbers, {
    targetMax: settings.targetMax,
    specialIndexes,
    mustUseSpecial,
    allowExactDivision: settings.allowExactDivision
  });

  if (!solved) return null;

  return {
    exerciseType: EXERCISE_TYPES.CLASSIC_CHALLENGE,
    numberCount: 6,
    target: solved.target,
    numbers,
    initialNumbers: numbers,
    targetMax: settings.targetMax,
    specialNumbers: settings.specialNumbers,
    allowExactDivision: settings.allowExactDivision,
    allowedOperations: settings.allowExactDivision ? ["+", "-", "×", "÷"] : ["+", "-", "×"],
    family: "classic_solved_challenge",
    solutionSteps: solved.solution.steps.map(normalizeTargetedStep),
    answerLines: solved.solution.steps.map(formatTargetedStep)
  };
}

function solveClassicChallenge(numbers, options = {}) {
  const targetMax = normalizeClassicTargetMax(options.targetMax);
  const specialIndexes = options.specialIndexes instanceof Set ? options.specialIndexes : new Set();
  const mustUseSpecial = Boolean(options.mustUseSpecial);
  const allowExactDivision = Boolean(options.allowExactDivision);
  const attempts = 760;
  let best = null;

  for (let i = 0; i < attempts; i += 1) {
    const candidate = buildClassicRandomSolution(numbers, {
      specialIndexes,
      mustUseSpecial,
      allowExactDivision
    });
    if (!candidate) continue;
    const target = Number(candidate.value);
    if (!Number.isFinite(target) || target < 0 || target > targetMax) continue;
    if (!isNonTrivialClassicSolution(candidate)) continue;
    if (mustUseSpecial && !nodeUsesAnySource(candidate, specialIndexes)) continue;
    if (hasTrivialClassicTarget(numbers, target, { allowExactDivision })) continue;

    if (!best || scoreClassicSolution(candidate) > scoreClassicSolution(best)) {
      best = candidate;
    }

    if (best && scoreClassicSolution(best) >= 70 && Math.random() < 0.55) break;
  }

  if (!best) return null;
  return {
    target: Number(best.value),
    solution: best
  };
}

function buildClassicRandomSolution(numbers, options = {}) {
  const initialNodes = makeInitialNodes(numbers).map((node) => ({
    ...node,
    steps: [],
    usedOps: []
  }));
  const specialIndexes = options.specialIndexes instanceof Set ? options.specialIndexes : new Set();
  const mustUseSpecial = Boolean(options.mustUseSpecial);
  const allowExactDivision = Boolean(options.allowExactDivision);
  const usableCounts = mustUseSpecial ? [4, 5, 6, 3, 4, 5, 6] : [3, 4, 4, 5, 5, 6];
  const wantedCount = pickRandom(usableCounts);
  let selected = shuffle(initialNodes).slice(0, Math.min(wantedCount, initialNodes.length));

  if (mustUseSpecial && !selected.some((node) => nodeUsesAnySource(node, specialIndexes))) {
    const specialNode = shuffle(initialNodes).find((node) => nodeUsesAnySource(node, specialIndexes));
    if (!specialNode) return null;
    selected = selected.filter((node) => !nodeUsesAnySource(node, specialIndexes));
    selected = [specialNode, ...selected].slice(0, wantedCount);
  }

  let active = shuffle(selected);
  while (active.length > 1) {
    const pairIndexes = pickClassicPairIndexes(active);
    if (!pairIndexes) return null;
    const [firstIndex, secondIndex] = pairIndexes;
    const left = active[firstIndex];
    const right = active[secondIndex];
    const combined = pickClassicCombination(left, right, { allowExactDivision });
    if (!combined) return null;
    active = active.filter((_, index) => index !== firstIndex && index !== secondIndex);
    active.push(combined);
    active = shuffle(active);
  }

  return active[0] ?? null;
}

function pickClassicPairIndexes(active = []) {
  if (!Array.isArray(active) || active.length < 2) return null;
  const indexes = shuffle(active.map((_, index) => index));
  return [indexes[0], indexes[1]];
}

function pickClassicCombination(left, right, options = {}) {
  const allowExactDivision = Boolean(options.allowExactDivision);
  const operations = shuffle(allowExactDivision
    ? ["×", "+", "-", "÷", "×", "+", "-", "÷"]
    : ["×", "+", "-", "×", "+", "-"]);
  for (const op of operations) {
    if (op === "-") {
      const [a, b] = orderForNonNegative(left, right);
      const node = combineClassicNodes(a, "-", b);
      if (node) return node;
      continue;
    }
    if (op === "÷") {
      const first = combineClassicNodes(left, "÷", right);
      if (first) return first;
      const second = combineClassicNodes(right, "÷", left);
      if (second) return second;
      continue;
    }
    const node = combineClassicNodes(left, op, right);
    if (node) return node;
  }
  return null;
}


function hasTrivialClassicTarget(numbers, target, options = {}) {
  const allowExactDivision = Boolean(options.allowExactDivision);
  const values = (Array.isArray(numbers) ? numbers : []).map(Number).filter(Number.isFinite);
  if (values.includes(Number(target))) return true;
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      const a = values[i];
      const b = values[j];
      if (a + b === target) return true;
      if (Math.abs(a - b) === target) return true;
      if (a * b === target) return true;
      if (allowExactDivision) {
        if (b !== 0 && a % b === 0 && a / b === target) return true;
        if (a !== 0 && b % a === 0 && b / a === target) return true;
      }
    }
  }
  return false;
}


function addClassicCombinedNodes(targetMap, left, right) {
  const add = combineClassicNodes(left, "+", right);
  if (add) addClassicNode(targetMap, add);

  const mul = combineClassicNodes(left, "×", right);
  if (mul) addClassicNode(targetMap, mul);

  const subLeft = combineClassicNodes(left, "-", right);
  if (subLeft) addClassicNode(targetMap, subLeft);

  const subRight = combineClassicNodes(right, "-", left);
  if (subRight) addClassicNode(targetMap, subRight);
}

function combineClassicNodes(left, op, right) {
  const node = combineNodes(left, op, right, { intermediateLimit: CLASSIC_SOLUTION_VALUE_LIMIT });
  if (!node) return null;
  return {
    ...node,
    steps: [
      ...(Array.isArray(left.steps) ? left.steps : []),
      ...(Array.isArray(right.steps) ? right.steps : []),
      node.step
    ],
    usedOps: [
      ...(Array.isArray(left.usedOps) ? left.usedOps : []),
      ...(Array.isArray(right.usedOps) ? right.usedOps : []),
      normalizeOperation(op)
    ]
  };
}

function addClassicNode(targetMap, node) {
  if (!targetMap || !node) return;
  const value = Number(node.value);
  if (!Number.isFinite(value) || value < 0 || value > CLASSIC_SOLUTION_VALUE_LIMIT) return;

  const key = String(value);
  const list = targetMap.get(key) ?? [];
  const nodeKey = classicNodeShapeKey(node);
  if (list.some((existing) => classicNodeShapeKey(existing) === nodeKey)) return;

  list.push(node);
  list.sort((a, b) => scoreClassicSolution(b) - scoreClassicSolution(a));
  if (list.length > CLASSIC_STORED_NODES_PER_VALUE) list.length = CLASSIC_STORED_NODES_PER_VALUE;
  targetMap.set(key, list);

  if (targetMap.size > CLASSIC_MAX_VALUES_PER_MASK) {
    const entries = [...targetMap.entries()]
      .sort(([, a], [, b]) => scoreClassicSolution(b[0]) - scoreClassicSolution(a[0]));
    targetMap.clear();
    entries.slice(0, CLASSIC_MAX_VALUES_PER_MASK).forEach(([entryKey, entryValue]) => targetMap.set(entryKey, entryValue));
  }
}

function classicNodeShapeKey(node) {
  return `${sourceKey(node?.sourceIds ?? node?.sources ?? [])}:${String(node?.expr ?? "")}`;
}

function isTrivialClassicSolution(node) {
  const usedCount = countDistinctSources(node);
  if (usedCount <= 2) return true;
  const ops = Array.isArray(node?.usedOps) ? node.usedOps.filter(Boolean) : [];
  if (usedCount <= 3 && ops.length && ops.every((op) => op === "+")) return true;
  if (usedCount <= 3 && ops.length && ops.every((op) => op === "×")) return true;
  return false;
}

function isNonTrivialClassicSolution(node) {
  const usedCount = countDistinctSources(node);
  const ops = Array.isArray(node?.usedOps) ? node.usedOps.filter(Boolean) : [];
  const opKinds = new Set(ops);
  if (usedCount < 3) return false;
  if (ops.length < 2) return false;
  if (!opKinds.has("×")) return false;
  if (isTrivialClassicSolution(node)) return false;
  if (usedCount === 3 && opKinds.size < 2) return false;
  return true;
}

function scoreClassicSolution(node) {
  if (!node) return 0;
  const usedCount = countDistinctSources(node);
  const ops = Array.isArray(node.usedOps) ? node.usedOps.filter(Boolean) : [];
  const opKinds = new Set(ops);
  let score = 0;
  score += usedCount * 8;
  score += Math.min(4, ops.filter((op) => op === "×").length) * 5;
  score += opKinds.size * 7;
  if (opKinds.has("+") && opKinds.has("-")) score += 4;
  if (opKinds.has("÷")) score += 4;
  if (usedCount >= 5) score += 10;
  if (usedCount === 6) score += 8;
  if (ops.every((op) => op === "+") || ops.every((op) => op === "×")) score -= 18;
  if (isTrivialClassicSolution(node)) score -= 100;
  return score;
}

function countDistinctSources(node) {
  return new Set([...(node?.sourceIds ?? node?.sources ?? [])].map(String).filter(Boolean)).size;
}

function nodeUsesAnySource(node, sourceSet) {
  if (!(sourceSet instanceof Set) || !sourceSet.size) return false;
  return [...(node?.sourceIds ?? node?.sources ?? [])].some((source) => sourceSet.has(String(source)));
}

function pickClassicChallengeNumbers(settings) {
  const cfg = normalizeClassicChallengeSettings(settings);
  const basePool = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const specialValues = getClassicSpecialValues(cfg);

  if (!specialValues.length) {
    return shuffle(basePool).slice(0, 6).sort((a, b) => a - b);
  }

  const maxSpecialCount = Math.min(3, specialValues.length, 6);
  const specialCount = weightedSpecialCount(maxSpecialCount, cfg.targetMax);
  const pickedSpecials = shuffle(specialValues).slice(0, specialCount);
  const remainingPool = basePool.filter((value) => !pickedSpecials.includes(value));
  const pickedBase = shuffle(remainingPool).slice(0, 6 - pickedSpecials.length);
  return [...pickedBase, ...pickedSpecials].sort((a, b) => a - b);
}

function weightedSpecialCount(maxSpecialCount, targetMax) {
  if (maxSpecialCount <= 1) return 1;
  const roll = Math.random();
  const highTarget = normalizeClassicTargetMax(targetMax) >= 500;
  if (maxSpecialCount >= 3 && highTarget && roll > 0.82) return 3;
  if (roll > 0.48) return 2;
  return 1;
}

function getClassicSpecialValues(settings) {
  const cfg = normalizeClassicChallengeSettings(settings);
  const values = [];
  CLASSIC_SPECIAL_NUMBER_OPTIONS.forEach((option) => {
    if (!cfg.specialNumbers[option.id]) return;
    values.push(...option.values);
  });
  return [...new Set(values)].sort((a, b) => a - b);
}

function pickTargetedNumbers(count, targetMax) {
  const pool = buildTargetedNumberPool(targetMax);
  return shuffle(pool).slice(0, count).sort((a, b) => a - b);
}

function buildTargetedNumberPool(targetMax) {
  const base = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const extras = [];
  if (targetMax >= 50) extras.push(15, 20, 25);
  if (targetMax >= 100) extras.push(30, 50);
  if (targetMax >= 500) extras.push(75, 100);
  if (targetMax >= 1000) extras.push(250);
  return [...new Set([...base, ...extras])];
}

function getIntermediateLimit(targetMax) {
  const safe = normalizeTargetedMaxTarget(targetMax);
  if (safe <= 50) return 160;
  if (safe <= 100) return 320;
  if (safe <= 500) return TARGETED_CALCULATION_RESULT_MAX;
  return TARGETED_CALCULATION_RESULT_MAX;
}

function shuffleWeighted(entries = []) {
  const expanded = [];
  entries.forEach((entry) => {
    const weight = Math.max(1, Math.floor(Number(entry?.weight) || 1));
    for (let i = 0; i < weight; i += 1) expanded.push(entry);
  });
  return uniqueById(shuffle(expanded));
}

function uniqueById(entries = []) {
  const seen = new Set();
  const out = [];
  entries.forEach((entry) => {
    const id = String(entry?.id ?? "");
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(entry);
  });
  return out;
}

function pickDistinctValues(min, max, count) {
  const pool = [];
  for (let n = min; n <= max; n++) {
    pool.push(n);
  }
  return shuffle(pool).slice(0, count);
}

function normalizeExerciseType(value) {
  const safe = String(value ?? "").trim();
  if (safe === EXERCISE_TYPES.TARGETED_CALCULATIONS) return EXERCISE_TYPES.TARGETED_CALCULATIONS;
  if (safe === EXERCISE_TYPES.CLASSIC_CHALLENGE || safe === LEGACY_CLASSIC_EXERCISE_TYPE) return EXERCISE_TYPES.CLASSIC_CHALLENGE;
  return EXERCISE_TYPES.TOKEN_BOXES;
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function clampInt(value, min, max) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function compareIds(a, b) {
  return String(a).localeCompare(String(b), "fr", { numeric: true, sensitivity: "base" });
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
