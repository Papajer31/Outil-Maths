const DEFAULT_DRAW_MODE = "random";
const DRAW_MODES = new Set(["in_order", "random"]);
const DEFAULT_BANK_TYPE = "qcm";
const DEFAULT_MAX_CHOICE_COUNT = 4;
const MIN_CHOICE_COUNT = 2;
const MAX_CHOICE_COUNT = 4;

const DEFAULT_GLOBAL_LAYOUT = "auto";
const GLOBAL_LAYOUTS = new Set(["auto", "vertical", "horizontal"]);
const DEFAULT_ANSWERS_LAYOUT = "auto";
const ANSWERS_LAYOUTS = new Set(["auto", "grid", "column", "row"]);
const DEFAULT_IMAGE_SIZE = "auto";
const IMAGE_SIZES = new Set(["auto", "small", "medium", "large"]);
const DEFAULT_QUESTION_SELECTION_MODE = "all";
const QUESTION_SELECTION_MODES = new Set(["all", "custom"]);

const ASSET_FIELD_RE = /^(?:asset|image)\s*:\s*([a-z0-9._:-]+)$/i;
const ASSET_TOKEN_RE = /\{\{\s*(?:asset|image)\s*:\s*([a-z0-9._:-]+)\s*\}\}/i;

export function getDefaultSettings() {
  return {
    bankId: "",
    bankTitle: "",
    bankInstruction: "",
    drawMode: DEFAULT_DRAW_MODE,
    shuffleChoices: true,
    maxChoiceCount: DEFAULT_MAX_CHOICE_COUNT,
    globalLayout: DEFAULT_GLOBAL_LAYOUT,
    answersLayout: DEFAULT_ANSWERS_LAYOUT,
    imageSize: DEFAULT_IMAGE_SIZE,
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

  return {
    ...getDefaultSettings(),
    ...safeSettings,
    bankId: String(safeSettings.bankId || safeSettings.bank_id || "").trim(),
    bankTitle: String(safeSettings.bankTitle || safeSettings.bank_title || "").trim(),
    bankInstruction: String(safeSettings.bankInstruction || safeSettings.bank_instruction || "").trim(),
    drawMode,
    shuffleChoices: safeSettings.shuffleChoices !== false && safeSettings.shuffle_choices !== false,
    maxChoiceCount: normalizeChoiceCount(safeSettings.maxChoiceCount ?? safeSettings.max_choice_count ?? safeSettings.choiceCount ?? safeSettings.choice_count),
    globalLayout: normalizeGlobalLayout(safeSettings.globalLayout ?? safeSettings.global_layout ?? safeSettings.layoutGlobal ?? safeSettings.layout_global),
    answersLayout: normalizeAnswersLayout(safeSettings.answersLayout ?? safeSettings.answers_layout ?? safeSettings.choicesLayout ?? safeSettings.choices_layout),
    imageSize: normalizeImageSize(safeSettings.imageSize ?? safeSettings.image_size),
    questionSelection: normalizeQuestionSelection(safeSettings.questionSelection ?? safeSettings.question_selection),
    bankItemsSnapshot: normalizeQcmItems(safeSettings.bankItemsSnapshot || safeSettings.bank_items_snapshot || [])
  };
}

export function normalizeQcmItems(items = []) {
  if (!Array.isArray(items)) return [];
  return items
    .map(normalizeQcmItem)
    .filter((item) => item.is_active !== false)
    .filter((item) => item.item_type === DEFAULT_BANK_TYPE)
    .filter((item) => hasQcmContent(item.promptContent) && hasQcmContent(item.correctAnswerContent) && item.distractors.length >= 1);
}

export function normalizeQcmItem(item = {}) {
  const payload = item?.payload_json && typeof item.payload_json === "object" && !Array.isArray(item.payload_json)
    ? item.payload_json
    : (item?.payload && typeof item.payload === "object" && !Array.isArray(item.payload) ? item.payload : {});

  const distractorsSource = payload.distractorContents
    ?? payload.distractor_contents
    ?? payload.distractorsContent
    ?? payload.distractors_content
    ?? payload.distractors
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

  const promptSource = payload.promptContent
    ?? payload.prompt_content
    ?? payload.questionContent
    ?? payload.question_content
    ?? item?.promptContent
    ?? item?.prompt_content
    ?? item?.prompt
    ?? payload.prompt
    ?? "";

  const correctAnswerSource = payload.correctAnswerContent
    ?? payload.correct_answer_content
    ?? payload.mainAnswerContent
    ?? payload.main_answer_content
    ?? item?.correctAnswerContent
    ?? item?.correct_answer_content
    ?? item?.mainAnswerContent
    ?? item?.main_answer_content
    ?? payload.correctAnswer
    ?? payload.correct_answer
    ?? payload.mainAnswer
    ?? payload.main_answer
    ?? item?.correctAnswer
    ?? item?.correct_answer
    ?? "";

  const promptContent = normalizeQcmContent(promptSource);
  const correctAnswerContent = normalizeQcmContent(correctAnswerSource);
  const distractors = normalizeDistractors(distractorsSource);

  const id = String(item?.id || "").trim();
  const position = Math.max(0, Math.trunc(Number(item?.position) || 0));

  return {
    id,
    selectionKey: buildQcmItemSelectionKey({ id, position, promptContent, correctAnswerContent }),
    item_type: String(item?.item_type || item?.itemType || item?.type || DEFAULT_BANK_TYPE).trim().toLowerCase() || DEFAULT_BANK_TYPE,
    prompt: getQcmContentPlainText(promptContent),
    promptContent,
    correctAnswer: getQcmContentPlainText(correctAnswerContent),
    correctAnswerContent,
    distractors,
    explanation: String(payload.explanation ?? item?.explanation ?? "").trim(),
    position,
    is_active: item?.is_active !== false
  };
}

export function normalizeDistractors(value = []) {
  const rawValues = Array.isArray(value)
    ? value
    : String(value || "").split(/[;\n]/g);

  return rawValues
    .map((item) => normalizeQcmContent(item))
    .filter(hasQcmContent)
    .slice(0, 5);
}

export function normalizeQcmContent(value = {}) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const kind = normalizeContentKind(value.kind || value.type || value.contentType || value.content_type);
    const text = String(value.text ?? value.label ?? value.value ?? "").trim();
    const assetId = String(value.assetId ?? value.asset_id ?? value.id ?? "").trim();
    const src = String(value.src ?? value.url ?? "").trim();
    const alt = String(value.alt ?? text ?? "").trim();
    const inferredKind = kind || inferContentKind({ text, assetId, src });
    return {
      kind: inferredKind,
      text,
      assetId,
      src,
      alt,
      raw: value.raw ?? value
    };
  }

  const source = String(value ?? "").trim();
  if (!source) return emptyContent();

  const fullAssetMatch = source.match(ASSET_FIELD_RE);
  if (fullAssetMatch) {
    return {
      kind: "image",
      text: "",
      assetId: fullAssetMatch[1].trim(),
      src: "",
      alt: "",
      raw: source
    };
  }

  const assetTokenMatch = source.match(ASSET_TOKEN_RE);
  if (assetTokenMatch) {
    const text = source.replace(assetTokenMatch[0], "").trim();
    return {
      kind: text ? "imageText" : "image",
      text,
      assetId: assetTokenMatch[1].trim(),
      src: "",
      alt: text,
      raw: source
    };
  }

  return {
    kind: "text",
    text: source,
    assetId: "",
    src: "",
    alt: "",
    raw: source
  };
}

export function hasQcmContent(content) {
  const normalized = normalizeQcmContent(content);
  return Boolean(normalized.text || normalized.assetId || normalized.src);
}

export function qcmContentHasImage(content) {
  const normalized = normalizeQcmContent(content);
  return Boolean(normalized.assetId || normalized.src || normalized.kind === "image" || normalized.kind === "imageText");
}

export function qcmContentHasText(content) {
  return Boolean(String(normalizeQcmContent(content).text || "").trim());
}

export function getQcmContentPlainText(content, { fallbackToAssetId = true } = {}) {
  const normalized = normalizeQcmContent(content);
  const text = String(normalized.text || "").trim();
  if (text) return text;
  if (fallbackToAssetId) return String(normalized.assetId || normalized.src || "").trim();
  return "";
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
      text: getQcmContentPlainText(normalized.correctAnswerContent),
      content: normalized.correctAnswerContent,
      isCorrect: true
    },
    ...distractors.map((content, distractorIndex) => ({
      id: `d${distractorIndex + 1}`,
      text: getQcmContentPlainText(content),
      content,
      isCorrect: false
    }))
  ].filter((choice) => hasQcmContent(choice.content));

  const orderedChoices = shuffleChoices ? shuffleArray(choices) : choices;

  return {
    id: normalized.id || `question-${index + 1}`,
    prompt: getQcmContentPlainText(normalized.promptContent),
    promptContent: normalized.promptContent,
    correctAnswer: getQcmContentPlainText(normalized.correctAnswerContent),
    correctAnswerContent: normalized.correctAnswerContent,
    explanation: normalized.explanation,
    choices: orderedChoices,
    correctChoiceId: orderedChoices.find((choice) => choice.isCorrect)?.id || "correct",
    position: normalized.position,
    key: `${normalized.id || normalized.position || index}::${getQcmContentPlainText(normalized.promptContent)}::${getQcmContentPlainText(normalized.correctAnswerContent)}`
  };
}

export function evaluateChoice(question, selectedChoiceId = "") {
  const safeChoiceId = String(selectedChoiceId || "").trim();
  const selectedChoice = Array.isArray(question?.choices)
    ? question.choices.find((choice) => String(choice.id) === safeChoiceId)
    : null;

  return {
    selectedChoiceId: safeChoiceId,
    selectedChoiceText: getQcmContentPlainText(selectedChoice?.content || selectedChoice?.text || ""),
    selectedChoiceContent: selectedChoice?.content || null,
    correctChoiceId: String(question?.correctChoiceId || ""),
    correctAnswer: getQcmContentPlainText(question?.correctAnswerContent || question?.correctAnswer || ""),
    correctAnswerContent: question?.correctAnswerContent || null,
    isCorrect: Boolean(selectedChoice?.isCorrect)
  };
}

export function normalizeQuestionSelection(selection = {}) {
  const source = selection && typeof selection === "object" && !Array.isArray(selection)
    ? selection
    : {};

  const mode = QUESTION_SELECTION_MODES.has(String(source.mode || "").trim())
    ? String(source.mode).trim()
    : DEFAULT_QUESTION_SELECTION_MODE;

  const rawKeys = source.questionKeys
    ?? source.question_keys
    ?? source.selectedQuestionKeys
    ?? source.selected_question_keys
    ?? source.questionIds
    ?? source.question_ids
    ?? [];

  return {
    mode,
    questionKeys: normalizeQuestionKeyList(rawKeys)
  };
}

export function getQuestionSelectionSignature(selection = {}) {
  const normalized = normalizeQuestionSelection(selection);
  if (normalized.mode !== "custom") return "all";
  return `custom:${normalized.questionKeys.join("|")}`;
}

export function getQcmItemSelectionKey(item = {}, index = 0) {
  const explicitKey = String(item?.selectionKey || item?.selection_key || "").trim();
  if (explicitKey) return explicitKey;

  const normalized = normalizeQcmItem(item);
  if (normalized.selectionKey) return normalized.selectionKey;

  return `idx:${Math.max(0, Math.trunc(Number(index) || 0))}`;
}

export function filterQcmItemsBySelection(items = [], selection = {}) {
  const normalizedItems = normalizeQcmItems(items);
  const normalizedSelection = normalizeQuestionSelection(selection);
  if (normalizedSelection.mode !== "custom") return normalizedItems;

  const selectedKeys = new Set(normalizedSelection.questionKeys);
  if (!selectedKeys.size) return [];

  return normalizedItems.filter((item, index) => selectedKeys.has(getQcmItemSelectionKey(item, index)));
}

export function createQuestionDeck(items = [], drawMode = DEFAULT_DRAW_MODE, { shuffleChoices = true, maxChoiceCount = DEFAULT_MAX_CHOICE_COUNT } = {}) {
  const safeMaxChoiceCount = normalizeChoiceCount(maxChoiceCount);
  const questions = normalizeQcmItems(items)
    .map((item, index) => buildQuestionFromItem(item, index, {
      shuffleChoices,
      maxChoiceCount: safeMaxChoiceCount
    }))
    .filter((question) => hasQcmContent(question.promptContent) && question.choices.length >= 2 && hasQcmContent(question.correctAnswerContent));

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

export function normalizeGlobalLayout(value = DEFAULT_GLOBAL_LAYOUT) {
  const safeValue = String(value || "").trim().toLowerCase();
  return GLOBAL_LAYOUTS.has(safeValue) ? safeValue : DEFAULT_GLOBAL_LAYOUT;
}

export function normalizeAnswersLayout(value = DEFAULT_ANSWERS_LAYOUT) {
  const safeValue = String(value || "").trim().toLowerCase();
  return ANSWERS_LAYOUTS.has(safeValue) ? safeValue : DEFAULT_ANSWERS_LAYOUT;
}

export function normalizeImageSize(value = DEFAULT_IMAGE_SIZE) {
  const safeValue = String(value || "").trim().toLowerCase();
  return IMAGE_SIZES.has(safeValue) ? safeValue : DEFAULT_IMAGE_SIZE;
}

export function shuffleArray(values = []) {
  const nextValues = Array.isArray(values) ? [...values] : [];
  for (let index = nextValues.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [nextValues[index], nextValues[swapIndex]] = [nextValues[swapIndex], nextValues[index]];
  }
  return nextValues;
}

function normalizeQuestionKeyList(value = []) {
  const rawValues = Array.isArray(value)
    ? value
    : String(value || "").split(/[;,.\n]+/g);
  const seen = new Set();
  const result = [];
  for (const item of rawValues) {
    const key = String(item || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(key);
  }
  return result;
}

function buildQcmItemSelectionKey({ id = "", position = 0, promptContent = {}, correctAnswerContent = {} } = {}) {
  const safeId = String(id || "").trim();
  if (safeId) return `id:${safeId}`;

  const safePosition = Math.max(0, Math.trunc(Number(position) || 0));
  const prompt = getQcmContentPlainText(promptContent);
  const answer = getQcmContentPlainText(correctAnswerContent);
  return `item:${safePosition}:${simpleHash(`${prompt}::${answer}`)}`;
}

function simpleHash(value = "") {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeContentKind(value) {
  const safeValue = String(value || "").trim().toLowerCase();
  if (["image-text", "imagetext", "image_text"].includes(safeValue)) return "imageText";
  if (safeValue === "image" || safeValue === "text") return safeValue;
  return "";
}

function inferContentKind({ text = "", assetId = "", src = "" } = {}) {
  if ((assetId || src) && text) return "imageText";
  if (assetId || src) return "image";
  return "text";
}

function emptyContent() {
  return {
    kind: "text",
    text: "",
    assetId: "",
    src: "",
    alt: "",
    raw: ""
  };
}

export {
  DEFAULT_DRAW_MODE,
  DEFAULT_MAX_CHOICE_COUNT,
  MIN_CHOICE_COUNT,
  MAX_CHOICE_COUNT,
  DEFAULT_GLOBAL_LAYOUT,
  DEFAULT_ANSWERS_LAYOUT,
  DEFAULT_IMAGE_SIZE,
  DEFAULT_QUESTION_SELECTION_MODE
};
