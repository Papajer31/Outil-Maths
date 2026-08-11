import { normalizeNumericConstraint, pickValueFromConstraint } from "../../shared/value-constraints.js";

export const RESPONSE_MODES = Object.freeze({
  PROPOSED: "proposed",
  SEGMENTED: "segmented",
  COMPLETE: "complete"
});

export const RESPONSE_MODE_LABELS = Object.freeze({
  [RESPONSE_MODES.PROPOSED]: "Opération proposée",
  [RESPONSE_MODES.SEGMENTED]: "Opération segmentée",
  [RESPONSE_MODES.COMPLETE]: "Opération complète"
});

export const TRACE_MODES = Object.freeze({
  ENABLED: "enabled",
  DISABLED: "disabled"
});

export const TRACE_MODE_LABELS = Object.freeze({
  [TRACE_MODES.ENABLED]: "Oui",
  [TRACE_MODES.DISABLED]: "Non"
});

export const OPERATION_TYPES = Object.freeze({
  SUM: "sum",
  DIFFERENCE: "difference"
});

export const LIMITS = Object.freeze({
  minCount: 1,
  maxCount: 99,
  defaultMin: 1,
  defaultMax: 10
});

const CHARACTER_POOL = Object.freeze([
  { id: "mathis", name: "Mathis", gender: "m", assetId: "images-personnages-mathis" },
  { id: "mathilde", name: "Mathilde", gender: "f", assetId: "images-personnages-mathilde" },
  { id: "mathieu", name: "Mathieu", gender: "m", assetId: "images-personnages-mathieu" },
  { id: "mathea", name: "Mathea", gender: "f", assetId: "images-personnages-mathea" }
]);

// Sous-ensemble contrôlé de la liste blanche commune des émojis de collection.
const COLLECTION_OBJECTS = Object.freeze([
  { id: "pommes", assetId: "emoji_pomme", fallback: "🍎", plural: "pommes" },
  { id: "bananes", assetId: "emoji_banane", fallback: "🍌", plural: "bananes" },
  { id: "cerises", assetId: "emoji_cerise", fallback: "🍒", plural: "cerises" },
  { id: "fraises", assetId: "emoji_fraise", fallback: "🍓", plural: "fraises" },
  { id: "carottes", assetId: "emoji_carotte", fallback: "🥕", plural: "carottes" },
  { id: "etoiles", assetId: "emoji_etoile", fallback: "⭐", plural: "étoiles" },
  { id: "coeurs", assetId: "emoji_coeur", fallback: "❤️", plural: "cœurs" },
  { id: "crayons", assetId: "emoji_crayon", fallback: "✏️", plural: "crayons" },
  { id: "ballons", assetId: "emoji_ballon_baudruche", fallback: "🎈", plural: "ballons" },
  { id: "chats", assetId: "emoji_chat", fallback: "🐱", plural: "chats" }
]);

const SUM_INSTRUCTIONS = Object.freeze([
  { id: "sum_plain", template: "Quelle est la somme ?" },
  { id: "sum_operation", template: "Écris l'addition correspondante." },
  { id: "sum_together", template: "Combien ont-ils de {objects} ensemble ?" },
  { id: "sum_total", template: "Combien ont-ils de {objects} en tout ?" },
  { id: "sum_calculation", template: "Écris le calcul qui donne la somme." }
]);

const DIFFERENCE_INSTRUCTIONS = Object.freeze([
  { id: "diff_plain", template: "Quelle est la différence ?" },
  { id: "diff_operation", template: "Écris la soustraction correspondante." },
  { id: "diff_more", template: "Combien de {objects} {a} {verb} de plus que {b} ?", relation: "more" },
  { id: "diff_less", template: "Combien de {objects} {a} {verb} de moins que {b} ?", relation: "less" },
  { id: "diff_gap", template: "De combien leurs collections diffèrent-elles ?" },
  { id: "diff_calculation", template: "Écris le calcul qui donne la différence." }
]);

export function getDefaultSettings() {
  return {
    collectionRange: {
      min: LIMITS.defaultMin,
      max: LIMITS.defaultMax,
      mode: "simple",
      start: LIMITS.defaultMin,
      step: 1,
      values: []
    },
    responseMode: RESPONSE_MODES.SEGMENTED,
    traceMode: TRACE_MODES.ENABLED
  };
}

export function normalizeSettings(settings = {}) {
  const defaults = getDefaultSettings();
  const source = isPlainObject(settings) ? settings : {};
  const responseMode = normalizeResponseMode(source.responseMode ?? source.answerMode ?? defaults.responseMode);
  const traceMode = normalizeTraceMode(source.traceMode ?? (source.traceEnabled === false ? TRACE_MODES.DISABLED : defaults.traceMode));

  return {
    collectionRange: normalizeCollectionRange(source.collectionRange || source.range || defaults.collectionRange),
    responseMode,
    traceMode
  };
}

export function pickQuestion(settings = {}, { avoidKey = "" } = {}) {
  const cfg = normalizeSettings(settings);
  let fallback = null;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const question = buildRandomQuestion(cfg);
    if (!question) continue;
    fallback = fallback || question;
    if (questionKey(question) !== avoidKey) return question;
  }

  if (fallback) return fallback;
  throw new Error("Impossible de générer une question avec ces réglages.");
}

export function questionKey(question) {
  return [
    "somme-difference",
    question?.operationType || "",
    question?.topCount ?? "",
    question?.bottomCount ?? "",
    question?.instructionId || "",
    question?.object?.id || ""
  ].join("|");
}

export function buildCorrectOperation(question) {
  if (!question) return { left: "", operator: "", right: "", result: "", expression: "" };
  if (question.operationType === OPERATION_TYPES.SUM) {
    const left = Number(question.topCount) || 0;
    const right = Number(question.bottomCount) || 0;
    const result = left + right;
    return buildOperation(left, "+", right, result);
  }
  const left = Math.max(Number(question.topCount) || 0, Number(question.bottomCount) || 0);
  const right = Math.min(Number(question.topCount) || 0, Number(question.bottomCount) || 0);
  return buildOperation(left, "-", right, left - right);
}

export function evaluateOperationAnswer(question, answer = {}) {
  if (!question) return { answered: false, isCorrect: false, reason: "empty" };
  const parsed = parseAnswerByMode(answer);
  if (!parsed.valid) {
    return { answered: parsed.answered, isCorrect: false, reason: parsed.reason || "invalid" };
  }

  const { left, operator, right, result } = parsed;
  if (operator === "-" && left < right) {
    return {
      answered: true,
      isCorrect: false,
      reason: "impossible_subtraction",
      message: "Cette soustraction est impossible."
    };
  }

  if (operator === "+") {
    if (result !== left + right) return { answered: true, isCorrect: false, reason: "wrong_result" };
    if (question.operationType !== OPERATION_TYPES.SUM) return { answered: true, isCorrect: false, reason: "wrong_operation" };
    const a = Number(question.topCount) || 0;
    const b = Number(question.bottomCount) || 0;
    const usesBothCounts = (left === a && right === b) || (left === b && right === a);
    return { answered: true, isCorrect: usesBothCounts, reason: usesBothCounts ? "correct" : "wrong_terms" };
  }

  if (operator === "-") {
    if (result !== left - right) return { answered: true, isCorrect: false, reason: "wrong_result" };
    if (question.operationType !== OPERATION_TYPES.DIFFERENCE) return { answered: true, isCorrect: false, reason: "wrong_operation" };
    const big = Math.max(Number(question.topCount) || 0, Number(question.bottomCount) || 0);
    const small = Math.min(Number(question.topCount) || 0, Number(question.bottomCount) || 0);
    const isExpected = left === big && right === small;
    return { answered: true, isCorrect: isExpected, reason: isExpected ? "correct" : "wrong_terms" };
  }

  return { answered: true, isCorrect: false, reason: "wrong_operation" };
}

export function getFeedbackMessage(evaluation = {}) {
  if (evaluation?.reason === "impossible_subtraction") {
    return evaluation.message || "Cette soustraction est impossible.";
  }
  if (evaluation?.isCorrect) return "C’est juste.";
  if (evaluation?.answered) return "Ce n’est pas encore le bon calcul.";
  return "Écris le calcul complet.";
}

export function getCharacters() {
  return CHARACTER_POOL.map((character) => ({ ...character }));
}

export function getCollectionObjects() {
  return COLLECTION_OBJECTS.map((item) => ({ ...item }));
}

function buildRandomQuestion(cfg) {
  const topCount = pickValueFromConstraint(cfg.collectionRange, { inputMin: LIMITS.minCount, inputMax: LIMITS.maxCount });
  const bottomCount = pickValueFromConstraint(cfg.collectionRange, { inputMin: LIMITS.minCount, inputMax: LIMITS.maxCount });
  if (!Number.isInteger(topCount) || !Number.isInteger(bottomCount)) return null;

  const operationType = Math.random() < .5 ? OPERATION_TYPES.SUM : OPERATION_TYPES.DIFFERENCE;
  if (operationType === OPERATION_TYPES.DIFFERENCE && topCount === bottomCount) return null;

  const [topCharacter, bottomCharacter] = pickTwoDistinct(CHARACTER_POOL);
  const object = pickRandom(COLLECTION_OBJECTS);
  const instruction = buildInstruction({ operationType, topCount, bottomCount, topCharacter, bottomCharacter, object });

  return {
    operationType,
    topCount,
    bottomCount,
    topCharacter,
    bottomCharacter,
    object,
    instructionId: instruction.id,
    instruction: instruction.text,
    correctOperation: buildCorrectOperation({ operationType, topCount, bottomCount })
  };
}

function buildInstruction({ operationType, topCount, bottomCount, topCharacter, bottomCharacter, object }) {
  if (operationType === OPERATION_TYPES.SUM) {
    const item = pickRandom(SUM_INSTRUCTIONS);
    return {
      id: item.id,
      text: fillTemplate(item.template, { object, a: topCharacter, b: bottomCharacter })
    };
  }

  const item = pickRandom(DIFFERENCE_INSTRUCTIONS);
  let a = topCharacter;
  let b = bottomCharacter;
  if (item.relation === "more") {
    a = topCount > bottomCount ? topCharacter : bottomCharacter;
    b = topCount > bottomCount ? bottomCharacter : topCharacter;
  } else if (item.relation === "less") {
    a = topCount < bottomCount ? topCharacter : bottomCharacter;
    b = topCount < bottomCount ? bottomCharacter : topCharacter;
  }

  return {
    id: item.id,
    text: fillTemplate(item.template, { object, a, b })
  };
}

function fillTemplate(template, { object, a, b }) {
  return String(template || "")
    .replaceAll("{objects}", String(object?.plural || "objets"))
    .replaceAll("{a}", String(a?.name || ""))
    .replaceAll("{b}", String(b?.name || ""))
    .replaceAll("{verb}", getAvoirVerb(a));
}

function getAvoirVerb(character) {
  return character?.gender === "f" ? "a-t-elle" : "a-t-il";
}

function pickTwoDistinct(source) {
  const list = Array.isArray(source) ? source.slice() : [];
  if (list.length < 2) return [list[0] || null, list[0] || null];
  const firstIndex = Math.floor(Math.random() * list.length);
  let secondIndex = Math.floor(Math.random() * (list.length - 1));
  if (secondIndex >= firstIndex) secondIndex += 1;
  return [list[firstIndex], list[secondIndex]];
}

function pickRandom(source) {
  const list = Array.isArray(source) ? source : [];
  return list[Math.floor(Math.random() * list.length)] || null;
}

function normalizeCollectionRange(value) {
  return normalizeNumericConstraint(value, {
    inputMin: LIMITS.minCount,
    inputMax: LIMITS.maxCount,
    defaultMin: LIMITS.defaultMin,
    defaultMax: LIMITS.defaultMax,
    defaultStart: LIMITS.defaultMin,
    defaultStep: 1,
    defaultValues: []
  });
}

function normalizeResponseMode(value) {
  const raw = String(value || "").trim();
  return Object.values(RESPONSE_MODES).includes(raw) ? raw : RESPONSE_MODES.SEGMENTED;
}

function normalizeTraceMode(value) {
  const raw = String(value || "").trim();
  return raw === TRACE_MODES.DISABLED ? TRACE_MODES.DISABLED : TRACE_MODES.ENABLED;
}

function parseAnswerByMode(answer = {}) {
  const mode = normalizeResponseMode(answer.mode);
  if (mode === RESPONSE_MODES.COMPLETE) {
    return parseCompleteOperation(answer.complete);
  }

  const leftRaw = String(answer.left ?? "").trim();
  const operatorRaw = String(answer.operator ?? "").trim();
  const rightRaw = String(answer.right ?? "").trim();
  const resultRaw = String(answer.result ?? "").trim();
  const answered = Boolean(leftRaw || operatorRaw || rightRaw || resultRaw);
  if (![leftRaw, rightRaw, resultRaw].every(isCleanIntegerText) || !/^[+-]$/.test(operatorRaw)) {
    return { valid: false, answered, reason: answered ? "invalid_format" : "empty" };
  }

  return {
    valid: true,
    answered: true,
    left: Number.parseInt(leftRaw, 10),
    operator: operatorRaw,
    right: Number.parseInt(rightRaw, 10),
    result: Number.parseInt(resultRaw, 10)
  };
}

function parseCompleteOperation(value) {
  const raw = String(value ?? "").trim().replace(/\s+/g, "");
  const answered = Boolean(raw);
  const match = raw.match(/^(0|[1-9]\d*)([+-])(0|[1-9]\d*)=(0|[1-9]\d*)$/);
  if (!match) return { valid: false, answered, reason: answered ? "invalid_format" : "empty" };
  return {
    valid: true,
    answered: true,
    left: Number.parseInt(match[1], 10),
    operator: match[2],
    right: Number.parseInt(match[3], 10),
    result: Number.parseInt(match[4], 10)
  };
}

function isCleanIntegerText(value) {
  return /^(0|[1-9]\d*)$/.test(String(value ?? "").trim());
}

function buildOperation(left, operator, right, result) {
  const expression = `${left} ${operator} ${right} = ${result}`;
  return {
    left: String(left),
    operator,
    right: String(right),
    result: String(result),
    expression
  };
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}
