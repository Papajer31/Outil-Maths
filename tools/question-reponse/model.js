import {
  DEFAULT_QUESTION_SELECTION_MODE,
  filterItemsByQuestionSelection,
  getItemSelectionKey,
  getQuestionSelectionSignature as getCommonQuestionSelectionSignature,
  normalizeQuestionSelection as normalizeCommonQuestionSelection
} from "../../shared/tool-commons/general-tools/question-selection.js";

const DEFAULT_DRAW_MODE = "random";
const DRAW_MODES = new Set(["in_order", "random"]);
const DEFAULT_BANK_TYPE = "text_answer";
const ANSWER_TYPES = Object.freeze({ TEXT: "text", NUMBER: "number" });
const DEFAULT_ANSWER_TYPE = ANSWER_TYPES.TEXT;
const ANSWER_TYPE_VALUES = new Set(Object.values(ANSWER_TYPES));

export function getDefaultSettings() {
  return {
    bankId: "",
    bankTitle: "",
    bankInstruction: "",
    drawMode: DEFAULT_DRAW_MODE,
    answerType: DEFAULT_ANSWER_TYPE,
    questionSelection: { mode: DEFAULT_QUESTION_SELECTION_MODE, questionKeys: [] },
    bankItemsSnapshot: []
  };
}

export function normalizeSettings(settings = {}) {
  const safeSettings = settings && typeof settings === "object" && !Array.isArray(settings)
    ? settings
    : {};

  const drawMode = DRAW_MODES.has(String(safeSettings.drawMode || "").trim())
    ? String(safeSettings.drawMode).trim()
    : DEFAULT_DRAW_MODE;
  const answerType = normalizeAnswerType(safeSettings.answerType || safeSettings.answer_type);

  return {
    ...getDefaultSettings(),
    ...safeSettings,
    bankId: String(safeSettings.bankId || safeSettings.bank_id || "").trim(),
    bankTitle: String(safeSettings.bankTitle || safeSettings.bank_title || "").trim(),
    bankInstruction: String(safeSettings.bankInstruction || safeSettings.bank_instruction || "").trim(),
    drawMode,
    answerType,
    questionSelection: normalizeQuestionSelection(safeSettings.questionSelection || safeSettings.question_selection || {}),
    bankItemsSnapshot: normalizeQuestionItems(safeSettings.bankItemsSnapshot || safeSettings.bank_items_snapshot || [])
  };
}

export function normalizeQuestionItems(items = []) {
  if (!Array.isArray(items)) return [];

  return items
    .map(normalizeQuestionItem)
    .filter((item) => item.is_active !== false)
    .filter((item) => item.item_type === DEFAULT_BANK_TYPE)
    .filter((item) => item.prompt && item.mainAnswer);
}

export function normalizeQuestionItem(item = {}) {
  const itemType = String(item?.item_type || item?.itemType || item?.type || DEFAULT_BANK_TYPE)
    .trim()
    .toLowerCase() || DEFAULT_BANK_TYPE;
  const payload = item?.payload_json && typeof item.payload_json === "object" && !Array.isArray(item.payload_json)
    ? item.payload_json
    : (item?.payload && typeof item.payload === "object" && !Array.isArray(item.payload) ? item.payload : {});

  const acceptedSource = payload.acceptedAnswers
    ?? payload.accepted_answers
    ?? item?.acceptedAnswers
    ?? item?.accepted_answers
    ?? [];

  return {
    id: String(item?.id || "").trim(),
    item_type: itemType,
    prompt: String(item?.prompt ?? payload.prompt ?? "").trim(),
    mainAnswer: String(payload.mainAnswer ?? payload.main_answer ?? item?.mainAnswer ?? item?.main_answer ?? item?.expectedAnswer ?? item?.expected_answer ?? "").trim(),
    acceptedAnswers: normalizeAcceptedAnswers(acceptedSource),
    explanation: String(payload.explanation ?? item?.explanation ?? "").trim(),
    position: Math.max(0, Math.trunc(Number(item?.position) || 0)),
    is_active: item?.is_active !== false
  };
}

export function normalizeAcceptedAnswers(value = []) {
  const rawValues = Array.isArray(value)
    ? value
    : String(value || "").split(/[;\n]/g);

  return rawValues
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, 64);
}

export function buildQuestionFromItem(item, index = 0) {
  const normalized = normalizeQuestionItem(item);
  return {
    id: normalized.id || `question-${index + 1}`,
    prompt: normalized.prompt,
    expectedAnswer: normalized.mainAnswer,
    acceptedAnswers: [...normalized.acceptedAnswers],
    explanation: normalized.explanation,
    position: normalized.position,
    key: `${normalized.id || normalized.position || index}::${normalized.prompt}::${normalized.mainAnswer}`
  };
}

export function evaluateAnswer(question, rawAnswer = "") {
  const answerType = normalizeAnswerType(question?.answerType || question?.answer_type);

  if (answerType === ANSWER_TYPES.NUMBER) {
    const submittedAnswer = normalizeNumericAnswer(rawAnswer);
    const expectedAnswers = getAcceptedAnswerList(question)
      .map(normalizeNumericAnswer)
      .filter(isStrictNumericAnswer);

    return {
      submittedAnswer,
      expectedAnswers,
      expectedAnswer: String(question?.expectedAnswer || "").trim(),
      isCorrect: isStrictNumericAnswer(submittedAnswer) && expectedAnswers.includes(submittedAnswer)
    };
  }

  const submittedAnswer = normalizeSubmittedAnswer(rawAnswer);
  const expectedAnswers = getAcceptedAnswerList(question).map(normalizeSubmittedAnswer).filter(Boolean);

  return {
    submittedAnswer,
    expectedAnswers,
    expectedAnswer: String(question?.expectedAnswer || "").trim(),
    isCorrect: Boolean(submittedAnswer) && expectedAnswers.includes(submittedAnswer)
  };
}

export function normalizeSubmittedAnswer(value = "") {
  return String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function normalizeNumericAnswer(value = "") {
  return String(value ?? "").trim();
}

export function isStrictNumericAnswer(value = "") {
  return /^(0|[1-9][0-9]*)$/.test(normalizeNumericAnswer(value));
}

export function normalizeAnswerType(value = "") {
  const safeValue = String(value || "").trim();
  return ANSWER_TYPE_VALUES.has(safeValue) ? safeValue : DEFAULT_ANSWER_TYPE;
}

export function getAcceptedAnswerList(question) {
  const answers = [String(question?.expectedAnswer || "")];
  if (Array.isArray(question?.acceptedAnswers)) {
    question.acceptedAnswers.forEach((answer) => answers.push(String(answer || "")));
  }
  return answers
    .map((answer) => answer.trim())
    .filter(Boolean)
    .filter((answer, index, list) => list.indexOf(answer) === index);
}

export function normalizeQuestionSelection(selection = {}) {
  return normalizeCommonQuestionSelection(selection);
}

export function getQuestionItemSelectionKey(item = {}, index = 0) {
  return getItemSelectionKey(item, index);
}

export function filterQuestionItemsBySelection(items = [], selection = {}) {
  return filterItemsByQuestionSelection(normalizeQuestionItems(items), selection, {
    itemKeyGetter: getQuestionItemSelectionKey
  });
}

export function getQuestionSelectionSignature(selection = {}) {
  return getCommonQuestionSelectionSignature(selection);
}

export function createQuestionDeck(items = [], drawMode = DEFAULT_DRAW_MODE) {
  const questions = normalizeQuestionItems(items)
    .map(buildQuestionFromItem)
    .filter((question) => question.prompt && question.expectedAnswer);

  if (drawMode === "random") {
    return shuffleArray(questions);
  }

  return questions;
}

export function shuffleArray(values = []) {
  const nextValues = Array.isArray(values) ? [...values] : [];
  for (let index = nextValues.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [nextValues[index], nextValues[swapIndex]] = [nextValues[swapIndex], nextValues[index]];
  }
  return nextValues;
}

export { ANSWER_TYPES, DEFAULT_ANSWER_TYPE, DEFAULT_DRAW_MODE, DEFAULT_QUESTION_SELECTION_MODE };
