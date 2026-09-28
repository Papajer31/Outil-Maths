import { normalizeNumericConstraint, pickValueFromConstraint } from "../../shared/value-constraints.js";

export const RESPONSE_MODES = Object.freeze({
  PROPOSED: "proposed",
  SEGMENTED: "segmented",
  COMPLETE: "complete",
  CHOOSE_CALCULATION: "choose-calculation"
});

export const RESPONSE_MODE_LABELS = Object.freeze({
  [RESPONSE_MODES.PROPOSED]: "Opération proposée",
  [RESPONSE_MODES.SEGMENTED]: "Opération segmentée",
  [RESPONSE_MODES.COMPLETE]: "Opération complète",
  [RESPONSE_MODES.CHOOSE_CALCULATION]: "Choisir le calcul"
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

export const OPERATION_MODES = Object.freeze({
  MIXED: "mixed",
  SUM_ONLY: "sum-only",
  DIFFERENCE_ONLY: "difference-only"
});

export const OPERATION_MODE_LABELS = Object.freeze({
  [OPERATION_MODES.MIXED]: "Sommes et différences",
  [OPERATION_MODES.SUM_ONLY]: "Uniquement des sommes",
  [OPERATION_MODES.DIFFERENCE_ONLY]: "Uniquement des différences"
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
  { id: "sum_together", template: "Combien ont-ils {de}{objects} ensemble ?" },
  { id: "sum_total", template: "Combien ont-ils {de}{objects} en tout ?" },
  { id: "sum_calculation", template: "Écris le calcul qui donne la somme." }
]);

const DIFFERENCE_INSTRUCTIONS = Object.freeze([
  { id: "diff_plain", template: "Quelle est la différence ?" },
  { id: "diff_operation", template: "Écris la soustraction correspondante." },
  { id: "diff_more", template: "Combien {de}{objects} {a} {verb} de plus que {b} ?", relation: "more" },
  { id: "diff_less", template: "Combien {de}{objects} {a} {verb} de moins que {b} ?", relation: "less" },
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
    operationMode: OPERATION_MODES.MIXED,
    responseMode: RESPONSE_MODES.SEGMENTED,
    traceMode: TRACE_MODES.ENABLED
  };
}

export function normalizeSettings(settings = {}) {
  const defaults = getDefaultSettings();
  const source = isPlainObject(settings) ? settings : {};
  const operationMode = normalizeOperationMode(source.operationMode ?? defaults.operationMode);
  const responseMode = normalizeResponseMode(source.responseMode ?? source.answerMode ?? defaults.responseMode);
  const traceMode = normalizeTraceMode(source.traceMode ?? (source.traceEnabled === false ? TRACE_MODES.DISABLED : defaults.traceMode));

  return {
    collectionRange: normalizeCollectionRange(source.collectionRange || source.range || defaults.collectionRange),
    operationMode,
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

  if (normalizeResponseMode(answer.mode) === RESPONSE_MODES.CHOOSE_CALCULATION) {
    const choices = Array.isArray(question.calculationChoices)
      ? question.calculationChoices
      : buildCalculationChoices(question);
    const selectedIds = new Set(parsed.choiceIds);
    const selected = choices.filter((choice) => selectedIds.has(choice.id));
    const allSelectedAreCorrect = selected.length > 0 && selected.every((choice) => choice.isCorrect);
    return {
      answered: selected.length > 0,
      isCorrect: allSelectedAreCorrect,
      reason: allSelectedAreCorrect ? "correct" : selected.length > 0 ? "wrong_operation" : "invalid"
    };
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

export function buildCalculationChoices(question) {
  const top = Number(question?.topCount) || 0;
  const bottom = Number(question?.bottomCount) || 0;
  const operationType = question?.operationType;
  const candidates = [
    { id: "top-plus-bottom", left: top, operator: "+", right: bottom },
    { id: "bottom-plus-top", left: bottom, operator: "+", right: top },
    { id: "top-minus-bottom", left: top, operator: "-", right: bottom },
    { id: "bottom-minus-top", left: bottom, operator: "-", right: top }
  ].map((choice) => ({
    ...choice,
    expression: `${choice.left} ${choice.operator} ${choice.right}`,
    isCorrect: operationType === OPERATION_TYPES.SUM
      ? choice.operator === "+"
      : choice.operator === "-" && choice.left === Math.max(top, bottom) && choice.right === Math.min(top, bottom)
  }));
  return shuffleItems(candidates);
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

  const operationType = pickOperationType(cfg.operationMode);
  if (operationType === OPERATION_TYPES.DIFFERENCE && topCount === bottomCount) return null;
  if (cfg.responseMode === RESPONSE_MODES.CHOOSE_CALCULATION && topCount === bottomCount) return null;

  const [topCharacter, bottomCharacter] = pickTwoDistinct(CHARACTER_POOL);
  const object = pickRandom(COLLECTION_OBJECTS);
  const instruction = buildInstruction({
    operationType,
    topCount,
    bottomCount,
    topCharacter,
    bottomCharacter,
    object,
    responseMode: cfg.responseMode
  });

  return {
    operationType,
    topCount,
    bottomCount,
    topCharacter,
    bottomCharacter,
    object,
    instructionId: instruction.id,
    instruction: instruction.text,
    correctOperation: buildCorrectOperation({ operationType, topCount, bottomCount }),
    calculationChoices: buildCalculationChoices({ operationType, topCount, bottomCount })
  };
}

function buildInstruction({ operationType, topCount, bottomCount, topCharacter, bottomCharacter, object, responseMode }) {
  if (operationType === OPERATION_TYPES.SUM) {
    const item = pickRandom(SUM_INSTRUCTIONS);
    return {
      id: item.id,
      text: adaptInstructionForResponseMode(
        fillTemplate(item.template, { object, a: topCharacter, b: bottomCharacter }),
        responseMode
      )
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
    text: adaptInstructionForResponseMode(
      fillTemplate(item.template, { object, a, b }),
      responseMode
    )
  };
}

function adaptInstructionForResponseMode(text, responseMode) {
  if (responseMode !== RESPONSE_MODES.CHOOSE_CALCULATION) return text;
  const value = String(text || "");
  const replacements = new Map([
    ["Quelle est la somme ?", "Quel calcul permet de trouver la somme ?"],
    ["Écris l'addition correspondante.", "Choisis l'addition correspondante."],
    ["Écris le calcul qui donne la somme.", "Choisis le calcul qui donne la somme."],
    ["Quelle est la différence ?", "Quel calcul permet de trouver la différence ?"],
    ["Écris la soustraction correspondante.", "Choisis la soustraction correspondante."],
    ["Écris le calcul qui donne la différence.", "Choisis le calcul qui donne la différence."]
  ]);
  return replacements.get(value) || value;
}

function fillTemplate(template, { object, a, b }) {
  const objects = String(object?.plural || "objets");
  return String(template || "")
    .replaceAll("{de}", startsWithVowel(objects) ? "d'" : "de ")
    .replaceAll("{objects}", objects)
    .replaceAll("{a}", String(a?.name || ""))
    .replaceAll("{b}", String(b?.name || ""))
    .replaceAll("{verb}", getAvoirVerb(a));
}

function startsWithVowel(value) {
  const first = String(value || "").trim().charAt(0).toLocaleLowerCase("fr-FR");
  return "aàâäeéèêëiîïoôöuùûüyÿœ".includes(first);
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

function normalizeOperationMode(value) {
  const raw = String(value || "").trim();
  return Object.values(OPERATION_MODES).includes(raw) ? raw : OPERATION_MODES.MIXED;
}

function pickOperationType(mode) {
  if (mode === OPERATION_MODES.SUM_ONLY) return OPERATION_TYPES.SUM;
  if (mode === OPERATION_MODES.DIFFERENCE_ONLY) return OPERATION_TYPES.DIFFERENCE;
  return Math.random() < .5 ? OPERATION_TYPES.SUM : OPERATION_TYPES.DIFFERENCE;
}

function normalizeTraceMode(value) {
  const raw = String(value || "").trim();
  return raw === TRACE_MODES.DISABLED ? TRACE_MODES.DISABLED : TRACE_MODES.ENABLED;
}

function parseAnswerByMode(answer = {}) {
  const mode = normalizeResponseMode(answer.mode);
  if (mode === RESPONSE_MODES.CHOOSE_CALCULATION) {
    const rawChoiceIds = Array.isArray(answer.choiceIds)
      ? answer.choiceIds
      : [answer.choiceId];
    const choiceIds = [...new Set(rawChoiceIds
      .map((choiceId) => String(choiceId ?? "").trim())
      .filter(Boolean))];
    return {
      valid: choiceIds.length > 0,
      answered: choiceIds.length > 0,
      choiceIds,
      reason: choiceIds.length > 0 ? "choice" : "empty"
    };
  }
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

function shuffleItems(source = []) {
  const list = Array.isArray(source) ? source.slice() : [];
  for (let index = list.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [list[index], list[target]] = [list[target], list[index]];
  }
  return list;
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}
