const DEFAULT_DRAW_MODE = "in_order";
const DRAW_MODES = new Set(["in_order", "random"]);
const DEFAULT_BANK_TYPE = "qcm";
const DEFAULT_MAX_CHOICE_COUNT = 4;
const MIN_CHOICE_COUNT = 2;
const MAX_CHOICE_COUNT = 6;

export function getDefaultSettings() {
  return {
    bankId: "",
    bankTitle: "",
    drawMode: DEFAULT_DRAW_MODE,
    shuffleChoices: true,
    maxChoiceCount: DEFAULT_MAX_CHOICE_COUNT,
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

  return {
    ...getDefaultSettings(),
    ...safeSettings,
    bankId: String(safeSettings.bankId || safeSettings.bank_id || "").trim(),
    bankTitle: String(safeSettings.bankTitle || safeSettings.bank_title || "").trim(),
    drawMode,
    shuffleChoices: safeSettings.shuffleChoices !== false && safeSettings.shuffle_choices !== false,
    maxChoiceCount: normalizeChoiceCount(safeSettings.maxChoiceCount ?? safeSettings.max_choice_count ?? safeSettings.choiceCount ?? safeSettings.choice_count),
    bankItemsSnapshot: normalizeQcmItems(safeSettings.bankItemsSnapshot || safeSettings.bank_items_snapshot || [])
  };
}

export function normalizeQcmItems(items = []) {
  if (!Array.isArray(items)) return [];
  return items
    .map(normalizeQcmItem)
    .filter((item) => item.prompt && item.correctAnswer && item.distractors.length >= 1);
}

export function normalizeQcmItem(item = {}) {
  const payload = item?.payload_json && typeof item.payload_json === "object" && !Array.isArray(item.payload_json)
    ? item.payload_json
    : (item?.payload && typeof item.payload === "object" && !Array.isArray(item.payload) ? item.payload : {});

  const distractorsSource = payload.distractors
    ?? payload.distractorAnswers
    ?? payload.distractor_answers
    ?? item?.distractors
    ?? item?.distractorAnswers
    ?? item?.distractor_answers
    ?? [
      payload.distractor1,
      payload.distractor2,
      payload.distractor3,
      payload.distractor4,
      payload.distractor5,
      item?.distractor1,
      item?.distractor2,
      item?.distractor3,
      item?.distractor4,
      item?.distractor5
    ];

  return {
    id: String(item?.id || "").trim(),
    item_type: String(item?.item_type || item?.itemType || item?.type || DEFAULT_BANK_TYPE).trim().toLowerCase() || DEFAULT_BANK_TYPE,
    prompt: String(item?.prompt ?? payload.prompt ?? "").trim(),
    correctAnswer: String(payload.correctAnswer ?? payload.correct_answer ?? payload.mainAnswer ?? payload.main_answer ?? item?.correctAnswer ?? item?.correct_answer ?? "").trim(),
    distractors: normalizeDistractors(distractorsSource),
    explanation: String(payload.explanation ?? item?.explanation ?? "").trim(),
    position: Math.max(0, Math.trunc(Number(item?.position) || 0)),
    is_active: item?.is_active !== false
  };
}

export function normalizeDistractors(value = []) {
  const rawValues = Array.isArray(value)
    ? value
    : String(value || "").split(/[;\n]/g);

  return rawValues
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 5);
}

export function buildQuestionFromItem(item, index = 0, { shuffleChoices = true, maxChoiceCount = DEFAULT_MAX_CHOICE_COUNT } = {}) {
  const normalized = normalizeQcmItem(item);
  const safeMaxChoiceCount = normalizeChoiceCount(maxChoiceCount);
  const distractorLimit = Math.max(1, safeMaxChoiceCount - 1);
  const distractors = shuffleChoices
    ? shuffleArray(normalized.distractors).slice(0, distractorLimit)
    : normalized.distractors.slice(0, distractorLimit);

  const choices = [
    {
      id: "correct",
      text: normalized.correctAnswer,
      isCorrect: true
    },
    ...distractors.map((text, distractorIndex) => ({
      id: `d${distractorIndex + 1}`,
      text,
      isCorrect: false
    }))
  ].filter((choice) => choice.text);

  const orderedChoices = shuffleChoices ? shuffleArray(choices) : choices;

  return {
    id: normalized.id || `question-${index + 1}`,
    prompt: normalized.prompt,
    correctAnswer: normalized.correctAnswer,
    explanation: normalized.explanation,
    choices: orderedChoices,
    correctChoiceId: orderedChoices.find((choice) => choice.isCorrect)?.id || "correct",
    position: normalized.position,
    key: `${normalized.id || normalized.position || index}::${normalized.prompt}::${normalized.correctAnswer}`
  };
}

export function evaluateChoice(question, selectedChoiceId = "") {
  const safeChoiceId = String(selectedChoiceId || "").trim();
  const selectedChoice = Array.isArray(question?.choices)
    ? question.choices.find((choice) => String(choice.id) === safeChoiceId)
    : null;

  return {
    selectedChoiceId: safeChoiceId,
    selectedChoiceText: String(selectedChoice?.text || ""),
    correctChoiceId: String(question?.correctChoiceId || ""),
    correctAnswer: String(question?.correctAnswer || ""),
    isCorrect: Boolean(selectedChoice?.isCorrect)
  };
}

export function createQuestionDeck(items = [], drawMode = DEFAULT_DRAW_MODE, { shuffleChoices = true, maxChoiceCount = DEFAULT_MAX_CHOICE_COUNT } = {}) {
  const safeMaxChoiceCount = normalizeChoiceCount(maxChoiceCount);
  const questions = normalizeQcmItems(items)
    .map((item, index) => buildQuestionFromItem(item, index, {
      shuffleChoices,
      maxChoiceCount: safeMaxChoiceCount
    }))
    .filter((question) => question.prompt && question.choices.length >= 2 && question.correctAnswer);

  if (drawMode === "random") {
    return shuffleArray(questions);
  }

  return questions;
}

export function normalizeChoiceCount(value = DEFAULT_MAX_CHOICE_COUNT) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_CHOICE_COUNT;
  return Math.min(MAX_CHOICE_COUNT, Math.max(MIN_CHOICE_COUNT, parsed));
}

export function shuffleArray(values = []) {
  const nextValues = Array.isArray(values) ? [...values] : [];
  for (let index = nextValues.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [nextValues[index], nextValues[swapIndex]] = [nextValues[swapIndex], nextValues[index]];
  }
  return nextValues;
}

export { DEFAULT_DRAW_MODE, DEFAULT_MAX_CHOICE_COUNT, MIN_CHOICE_COUNT, MAX_CHOICE_COUNT };
