import {
  findTokenIndexesFromSelectionText,
  formatSelectionIndexes,
  normalizeSelectionMode,
  normalizeTokenIndexes,
  tokenizeSelectionText
} from "../../shared/selection-text.js";

export const DEFAULT_DRAW_MODE = "in_order";
export const DEFAULT_SELECTION_MODE = "disjoint";

export function getDefaultSettings() {
  return {
    bankId: "",
    bankTitle: "",
    drawMode: DEFAULT_DRAW_MODE,
    selectionMode: DEFAULT_SELECTION_MODE,
    bankItemsSnapshot: []
  };
}

export function normalizeSettings(settings = {}) {
  const base = getDefaultSettings();
  return {
    ...base,
    ...settings,
    bankId: String(settings?.bankId || settings?.bank_id || "").trim(),
    bankTitle: String(settings?.bankTitle || settings?.bank_title || "").trim(),
    drawMode: normalizeDrawMode(settings?.drawMode),
    selectionMode: normalizeSelectionMode(settings?.selectionMode || DEFAULT_SELECTION_MODE),
    bankItemsSnapshot: normalizeSelectionItems(settings?.bankItemsSnapshot || settings?.bank_items_snapshot || [])
  };
}

export function normalizeDrawMode(value) {
  return String(value || "").trim().toLowerCase() === "random" ? "random" : DEFAULT_DRAW_MODE;
}

function normalizeRawIndexes(value) {
  return Array.isArray(value)
    ? value
    : String(value || "").split(/[;,.\s]+/g);
}

function removeItemInstructionFields(payload = {}) {
  const nextPayload = { ...payload };
  delete nextPayload.instruction;
  delete nextPayload.consigne;
  delete nextPayload.promptInstruction;
  delete nextPayload.prompt_instruction;
  delete nextPayload.itemInstruction;
  delete nextPayload.item_instruction;
  return nextPayload;
}

export function normalizeSelectionItem(item = {}, index = 0) {
  const payload = item?.payload_json && typeof item.payload_json === "object" && !Array.isArray(item.payload_json)
    ? item.payload_json
    : {};
  const prompt = String(item?.prompt ?? payload.prompt ?? "");
  const wordCount = tokenizeSelectionText(prompt).filter((token) => token.kind === "word").length;
  let expectedTokenIndexes = normalizeTokenIndexes(
    normalizeRawIndexes(payload.expectedTokenIndexes ?? payload.expected_token_indexes ?? payload.selectedTokenIndexes ?? payload.selected_token_indexes ?? []),
    wordCount
  );

  const expectedSelectionText = String(payload.expectedSelectionText ?? payload.expected_selection_text ?? "").trim();
  if (!expectedTokenIndexes.length && expectedSelectionText) {
    expectedTokenIndexes = findTokenIndexesFromSelectionText(prompt, expectedSelectionText);
  }

  return {
    id: item?.id ?? null,
    bank_id: item?.bank_id ?? null,
    item_type: "selection",
    prompt,
    payload_json: {
      ...removeItemInstructionFields(payload),
      expectedTokenIndexes,
      expectedSelectionText: formatSelectionIndexes(prompt, expectedTokenIndexes) || expectedSelectionText,
      explanation: String(payload.explanation ?? "")
    },
    position: Math.max(0, Math.trunc(Number(item?.position ?? index) || 0)),
    is_active: item?.is_active !== false
  };
}

export function normalizeSelectionItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(normalizeSelectionItem)
    .filter((item) => item.is_active !== false)
    .filter((item) => {
      const payload = item.payload_json || {};
      return item.item_type === "selection"
        && String(item.prompt || "").trim()
        && Array.isArray(payload.expectedTokenIndexes)
        && payload.expectedTokenIndexes.length > 0;
    });
}

export function buildQuestionFromItem(item = {}, index = 0) {
  const normalized = normalizeSelectionItem(item, index);
  const payload = normalized.payload_json || {};
  return {
    id: normalized.id || `selection-${index + 1}`,
    prompt: normalized.prompt,
    expectedTokenIndexes: normalizeTokenIndexes(payload.expectedTokenIndexes, tokenizeSelectionText(normalized.prompt).filter((token) => token.kind === "word").length),
    expectedSelectionText: String(payload.expectedSelectionText || ""),
    explanation: String(payload.explanation || ""),
    position: normalized.position,
    key: `${normalized.id || normalized.position || index}::${normalized.prompt}`
  };
}

export function createQuestionDeck(items = [], drawMode = DEFAULT_DRAW_MODE) {
  const questions = normalizeSelectionItems(items)
    .map(buildQuestionFromItem)
    .filter((question) => question.prompt && question.expectedTokenIndexes.length);

  return normalizeDrawMode(drawMode) === "random" ? shuffleArray(questions) : questions;
}

export function evaluateSelection(question, selectedIndexes = []) {
  const wordCount = tokenizeSelectionText(question?.prompt || "").filter((token) => token.kind === "word").length;
  const selected = normalizeTokenIndexes(selectedIndexes, wordCount);
  const expected = normalizeTokenIndexes(question?.expectedTokenIndexes || [], wordCount);
  const sameLength = selected.length === expected.length;
  const isCorrect = sameLength && selected.every((value, index) => value === expected[index]);
  return {
    selectedTokenIndexes: selected,
    expectedTokenIndexes: expected,
    isCorrect
  };
}

export function shuffleArray(values = []) {
  const nextValues = Array.isArray(values) ? [...values] : [];
  for (let index = nextValues.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [nextValues[index], nextValues[swapIndex]] = [nextValues[swapIndex], nextValues[index]];
  }
  return nextValues;
}
