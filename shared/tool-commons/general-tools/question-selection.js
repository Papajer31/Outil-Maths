export const DEFAULT_QUESTION_SELECTION_MODE = "all";

const QUESTION_SELECTION_MODES = new Set(["all", "custom"]);

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

export function normalizeQuestionKeyList(values = []) {
  const source = Array.isArray(values)
    ? values
    : String(values || "").split(/[;,\n]+/g);

  return source
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);
}

export function getQuestionSelectionSignature(selection = {}) {
  const normalized = normalizeQuestionSelection(selection);
  if (normalized.mode !== "custom") return "all";
  return `custom:${normalized.questionKeys.join("|")}`;
}

export function getItemSelectionKey(item = {}, index = 0) {
  const explicitKey = String(item?.selectionKey || item?.selection_key || "").trim();
  if (explicitKey) return explicitKey;

  const id = String(item?.id || "").trim();
  if (id) return `id:${id}`;

  const position = Number(item?.position);
  if (Number.isFinite(position)) return `pos:${Math.trunc(position)}`;

  return `idx:${Math.max(0, Math.trunc(Number(index) || 0))}`;
}

export function filterItemsByQuestionSelection(items = [], selection = {}, { itemKeyGetter = getItemSelectionKey } = {}) {
  const safeItems = Array.isArray(items) ? items : [];
  const normalizedSelection = normalizeQuestionSelection(selection);
  if (normalizedSelection.mode !== "custom") return safeItems;

  const selectedKeys = new Set(normalizedSelection.questionKeys);
  if (!selectedKeys.size) return [];

  return safeItems.filter((item, index) => selectedKeys.has(itemKeyGetter(item, index)));
}
