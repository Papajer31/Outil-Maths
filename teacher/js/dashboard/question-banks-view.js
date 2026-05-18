import {
  copyQuestionBankToSpace,
  createQuestionBankFolderForSpace,
  createQuestionBankForSpace,
  deleteQuestionBank,
  deleteQuestionBankFolder,
  listQuestionBankFoldersForSpace,
  listQuestionBankItems,
  listQuestionBanksForSpace,
  normalizeQuestionBankTitle,
  replaceQuestionBankItems,
  updateQuestionBank,
  updateQuestionBankFolder
} from "../teacher-api.js";
import {
  buildActivityTreeState as buildDashboardActivityTreeState,
  buildVisibleActivityTree as buildDashboardVisibleActivityTree,
  normalizeTreeId
} from "./activity-tree.js";
import { escapeAttr, escapeHtml } from "./text-utils.js";
import { renderSimpleMarkupToHtml } from "../../../shared/simple-markup.js";
import {
  findTokenIndexesFromSelectionText,
  formatSelectionIndexes,
  normalizeTokenIndexes,
  renderSelectionTextToHtml,
  tokenizeSelectionText
} from "../../../shared/selection-text.js";

const DEFAULT_BANK_TYPE = "text_answer";
const QCM_BANK_TYPE = "qcm";
const SELECTION_BANK_TYPE = "selection";
const BANK_CREATION_TYPE_VALUES = [DEFAULT_BANK_TYPE, QCM_BANK_TYPE, SELECTION_BANK_TYPE];
const BANK_TYPE_FILTER_ALL = "all";
const BANK_TYPE_FILTER_VALUES = Object.freeze([
  BANK_TYPE_FILTER_ALL,
  ...BANK_CREATION_TYPE_VALUES
]);
const QCM_MAX_DISTRACTORS = 5;
const EDITABLE_BANK_TYPES = new Set([DEFAULT_BANK_TYPE, QCM_BANK_TYPE, SELECTION_BANK_TYPE]);
const BANK_TYPE_LABELS = {
  text_answer: "Texte",
  qcm: "QCM",
  selection: "Sélection",
  cloze_text: "Texte à trous",
  image_answer: "Réponse image",
  problem: "Problèmes",
  matching: "Appariement",
  sorting: "Tri"
};
const META_INPUT_IDS = new Set([
  "bankSubjectInput",
  "bankGradeInput",
  "bankTagsInput",
  "bankDescriptionInput"
]);
const ITEM_FIELD_LABELS_BY_TYPE = {
  text_answer: {
    prompt: "Question",
    mainAnswer: "Réponse principale",
    acceptedAnswers: "Réponses acceptées",
    explanation: "Explication"
  },
  qcm: {
    prompt: "Question",
    correctAnswer: "Réponse correcte",
    distractor1: "Distracteur 1",
    explanation: "Explication"
  },
  selection: {
    prompt: "Énoncé",
    expectedSelection: "Sélection attendue",
    explanation: "Explication"
  }
};

const ITEM_TABLE_HEADS_BY_TYPE = {
  text_answer: ["#", "Question", "Réponse principale", "Réponses acceptées", "Explication", ""],
  qcm: ["#", "Question", "Réponse correcte", "Distracteur 1", "Explication", ""],
  selection: ["#", "Énoncé", "Sélection attendue", "Explication", ""]
};
const BANK_ROW_HEIGHT = 34;
const BANK_ROW_EXPANDED_HEIGHT = 102;
const BANK_ROW_EXPANDED_EXTRA = BANK_ROW_EXPANDED_HEIGHT - BANK_ROW_HEIGHT;
const BANK_ROWS_VIRTUALIZATION_THRESHOLD = 120;
const BANK_ROWS_OVERSCAN = 8;

function getBankTypeLabel(type) {
  const safeType = String(type || DEFAULT_BANK_TYPE).trim().toLowerCase() || DEFAULT_BANK_TYPE;
  return BANK_TYPE_LABELS[safeType] || safeType;
}

function normalizeBankType(type) {
  return String(type || DEFAULT_BANK_TYPE).trim().toLowerCase() || DEFAULT_BANK_TYPE;
}

function normalizeBankTypeFilter(value) {
  const safeValue = String(value || "").trim().toLowerCase();
  return BANK_TYPE_FILTER_VALUES.includes(safeValue)
    ? safeValue
    : BANK_TYPE_FILTER_ALL;
}

function isAllBankTypeFilter(value) {
  return normalizeBankTypeFilter(value) === BANK_TYPE_FILTER_ALL;
}

function getBankTypeFilterLabel(value) {
  return isAllBankTypeFilter(value)
    ? "Tous"
    : getBankTypeLabel(value);
}

function getInitialBankCreationTypeFromFilter(value) {
  return isAllBankTypeFilter(value)
    ? ""
    : normalizeBankType(value);
}

function isTextAnswerType(type) {
  return normalizeBankType(type) === DEFAULT_BANK_TYPE;
}

function isQcmType(type) {
  return normalizeBankType(type) === QCM_BANK_TYPE;
}

function isSelectionType(type) {
  return normalizeBankType(type) === SELECTION_BANK_TYPE;
}

function isEditableBankType(type) {
  return EDITABLE_BANK_TYPES.has(normalizeBankType(type));
}

function clampQcmDistractorCount(value) {
  return Math.max(1, Math.min(QCM_MAX_DISTRACTORS, Math.trunc(Number(value) || 1)));
}

function getQcmItemFieldLabels(distractorCount = 1) {
  const labels = {
    prompt: "Question",
    correctAnswer: "Réponse correcte"
  };
  for (let index = 1; index <= clampQcmDistractorCount(distractorCount); index += 1) {
    labels[`distractor${index}`] = `Distracteur ${index}`;
  }
  labels.explanation = "Explication";
  return labels;
}

function getQcmTableHeads(distractorCount = 1) {
  const heads = ["#", "Question", "Réponse correcte"];
  for (let index = 1; index <= clampQcmDistractorCount(distractorCount); index += 1) {
    heads.push(`Distracteur ${index}`);
  }
  heads.push("Explication", "");
  return heads;
}

function getItemFieldLabelsForType(type, { qcmDistractorCount = 1 } = {}) {
  if (isQcmType(type)) return getQcmItemFieldLabels(qcmDistractorCount);
  return ITEM_FIELD_LABELS_BY_TYPE[normalizeBankType(type)] || ITEM_FIELD_LABELS_BY_TYPE[DEFAULT_BANK_TYPE];
}

function getTableHeadsForType(type, { qcmDistractorCount = 1 } = {}) {
  if (isQcmType(type)) return getQcmTableHeads(qcmDistractorCount);
  return ITEM_TABLE_HEADS_BY_TYPE[normalizeBankType(type)] || ITEM_TABLE_HEADS_BY_TYPE[DEFAULT_BANK_TYPE];
}

function getDefaultBankType() {
  return DEFAULT_BANK_TYPE;
}

function createEmptyItem(itemType = DEFAULT_BANK_TYPE) {
  const safeType = normalizeBankType(itemType);

  if (isQcmType(safeType)) {
    return {
      item_type: QCM_BANK_TYPE,
      prompt: "",
      payload_json: {
        correctAnswer: "",
        distractors: [""],
        explanation: ""
      },
      is_active: true
    };
  }

  if (isSelectionType(safeType)) {
    return {
      item_type: SELECTION_BANK_TYPE,
      prompt: "",
      payload_json: {
        expectedTokenIndexes: [],
        expectedSelectionText: "",
        explanation: ""
      },
      is_active: true
    };
  }

  if (!isTextAnswerType(safeType)) {
    return {
      item_type: safeType,
      prompt: "",
      payload_json: {},
      is_active: true
    };
  }

  return {
    item_type: DEFAULT_BANK_TYPE,
    prompt: "",
    payload_json: {
      mainAnswer: "",
      acceptedAnswers: [],
      explanation: ""
    },
    is_active: true
  };
}
function normalizeTagsInput(value) {
  return String(value || "")
    .split(/[;,]/g)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag, index, list) => list.findIndex((item) => item.toLowerCase() === tag.toLowerCase()) === index)
    .slice(0, 24);
}

function acceptedAnswersToText(value) {
  return Array.isArray(value) ? value.join("; ") : "";
}

function acceptedAnswersFromText(value) {
  return String(value || "")
    .split(/[;\n]/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, list) => list.findIndex((other) => other.toLowerCase() === item.toLowerCase()) === index)
    .slice(0, 24);
}

function getQcmDistractorColumnCount(items = []) {
  const maxColumns = items.reduce((max, item) => {
    const payload = item?.payload_json || {};
    const drafts = distractorsFromFields(payload, { keepEmpty: true });
    const lastFilledIndex = drafts.reduce((lastIndex, value, index) => (
      String(value || "").trim() ? index : lastIndex
    ), -1);
    return Math.max(max, lastFilledIndex >= 0 ? Math.min(QCM_MAX_DISTRACTORS, lastFilledIndex + 2) : 0);
  }, 0);
  return Math.max(1, maxColumns);
}

function distractorsToText(value) {
  return normalizeQcmDistractors(value).join("; ");
}

function removeLegacyDistractorFields(payload = {}) {
  delete payload.distractorAnswers;
  delete payload.distractor_answers;
  for (let index = 1; index <= 5; index += 1) {
    delete payload[`distractor${index}`];
  }
  return payload;
}

function removeSelectionInstructionFields(payload = {}) {
  delete payload.instruction;
  delete payload.consigne;
  delete payload.promptInstruction;
  delete payload.prompt_instruction;
  delete payload.itemInstruction;
  delete payload.item_instruction;
  return payload;
}

function normalizeQcmDistractorDrafts(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || "").split(/[;\n]/g);

  const drafts = source
    .map((item) => String(item || "").trim())
    .slice(0, QCM_MAX_DISTRACTORS);

  let lastMeaningfulIndex = drafts.length - 1;
  while (lastMeaningfulIndex >= 0 && !drafts[lastMeaningfulIndex]) {
    lastMeaningfulIndex -= 1;
  }

  return drafts.slice(0, lastMeaningfulIndex + 1);
}

function normalizeQcmDistractors(value) {
  return normalizeQcmDistractorDrafts(value)
    .filter(Boolean)
    .slice(0, QCM_MAX_DISTRACTORS);
}

function distractorsFromFields(payload = {}, { keepEmpty = false } = {}) {
  const source = payload.distractors
    ?? payload.distractorAnswers
    ?? payload.distractor_answers
    ?? [
      payload.distractor1,
      payload.distractor2,
      payload.distractor3,
      payload.distractor4,
      payload.distractor5
    ];

  const drafts = normalizeQcmDistractorDrafts(source);
  return keepEmpty ? drafts : drafts.filter(Boolean);
}

function setQcmDistractorAt(payload = {}, fieldName, value) {
  const match = String(fieldName || "").match(/^distractor([1-5])$/);
  if (!match) return;
  const index = Number(match[1]) - 1;
  const distractors = distractorsFromFields(payload, { keepEmpty: true });
  while (distractors.length <= index) {
    distractors.push("");
  }
  distractors[index] = String(value || "");
  payload.distractors = normalizeQcmDistractorDrafts(distractors);
  removeLegacyDistractorFields(payload);
}

function normalizeItemDraft(item) {
  const itemType = normalizeBankType(item?.item_type || DEFAULT_BANK_TYPE);
  const payload = item?.payload_json && typeof item.payload_json === "object" && !Array.isArray(item.payload_json)
    ? item.payload_json
    : {};

  if (isQcmType(itemType)) {
    const distractors = normalizeQcmDistractors(
      payload.distractors
      ?? payload.distractorAnswers
      ?? payload.distractor_answers
      ?? [
        payload.distractor1,
        payload.distractor2,
        payload.distractor3,
        payload.distractor4,
        payload.distractor5
      ]
    );

    return {
      item_type: QCM_BANK_TYPE,
      prompt: String(item?.prompt || ""),
      payload_json: removeLegacyDistractorFields({
        ...payload,
        correctAnswer: String(payload.correctAnswer ?? payload.correct_answer ?? payload.mainAnswer ?? payload.main_answer ?? ""),
        distractors,
        explanation: String(payload.explanation || "")
      }),
      is_active: item?.is_active !== false
    };
  }

  if (isSelectionType(itemType)) {
    const prompt = String(item?.prompt || payload.prompt || "");
    const wordCount = tokenizeSelectionText(prompt).filter((token) => token.kind === "word").length;
    const expectedFromPayload = payload.expectedTokenIndexes
      ?? payload.expected_token_indexes
      ?? payload.selectedTokenIndexes
      ?? payload.selected_token_indexes
      ?? [];
    const expectedTokenIndexes = normalizeTokenIndexes(expectedFromPayload, wordCount);
    const expectedSelectionText = expectedTokenIndexes.length
      ? formatSelectionIndexes(prompt, expectedTokenIndexes)
      : String(payload.expectedSelectionText || payload.expected_selection_text || "");

    return {
      item_type: SELECTION_BANK_TYPE,
      prompt,
      payload_json: removeSelectionInstructionFields({
        ...payload,
        expectedTokenIndexes,
        expectedSelectionText,
        explanation: String(payload.explanation || "")
      }),
      is_active: item?.is_active !== false
    };
  }

  if (!isTextAnswerType(itemType)) {
    return {
      item_type: itemType,
      prompt: String(item?.prompt || ""),
      payload_json: { ...payload },
      is_active: item?.is_active !== false
    };
  }

  return {
    item_type: DEFAULT_BANK_TYPE,
    prompt: String(item?.prompt || ""),
    payload_json: {
      ...payload,
      mainAnswer: String(payload.mainAnswer ?? payload.main_answer ?? ""),
      acceptedAnswers: Array.isArray(payload.acceptedAnswers)
        ? payload.acceptedAnswers.map((item) => String(item || "").trim()).filter(Boolean)
        : acceptedAnswersFromText(payload.accepted_answers),
      explanation: String(payload.explanation || "")
    },
    is_active: item?.is_active !== false
  };
}
function buildUniqueBankTitle(existingBanks = [], baseTitle = "Nouvelle banque") {
  const existing = new Set(existingBanks.map((bank) => normalizeQuestionBankTitle(bank?.title)).filter(Boolean));
  let index = 0;
  while (index < 999) {
    const candidate = index === 0 ? baseTitle : `${baseTitle} ${index + 1}`;
    if (!existing.has(normalizeQuestionBankTitle(candidate))) return candidate;
    index += 1;
  }
  return `${baseTitle} ${Date.now()}`;
}

function bankTitleAlreadyExists(existingBanks = [], title = "", ignoredBankId = null) {
  const normalizedTitle = normalizeQuestionBankTitle(title);
  if (!normalizedTitle) return false;
  const ignoredId = String(ignoredBankId ?? "").trim();
  return (Array.isArray(existingBanks) ? existingBanks : []).some((bank) => (
    String(bank?.id ?? "") !== ignoredId && normalizeQuestionBankTitle(bank?.title) === normalizedTitle
  ));
}

function stripImportCellQuotes(value) {
  const text = String(value || "").trim();
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1).replaceAll('""', '"').trim();
  }
  return text;
}

function splitDelimitedImportLine(line, delimiter = "|") {
  const columns = [];
  const safeDelimiter = String(delimiter || "|").charAt(0) || "|";
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      current += char;
      if (inQuotes && line[index + 1] === '"') {
        current += line[index + 1];
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === safeDelimiter && !inQuotes) {
      columns.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  columns.push(current);
  return columns;
}

function splitImportLine(line, { maxColumns = 4, mergeOverflowIntoLast = true } = {}) {
  const delimiter = line.includes("\t") ? "\t" : "|";
  const columns = splitDelimitedImportLine(line, delimiter).map(stripImportCellQuotes);

  if (mergeOverflowIntoLast && columns.length > maxColumns) {
    return [
      ...columns.slice(0, maxColumns - 1),
      columns.slice(maxColumns - 1).join(` ${delimiter} `).trim()
    ];
  }

  while (columns.length < maxColumns) columns.push("");
  return columns.slice(0, maxColumns);
}

function parseTextAnswerImportLine(columns) {
  const [prompt = "", mainAnswer = "", accepted = "", explanation = ""] = columns;
  if (!prompt || !mainAnswer) return null;

  return {
    item_type: DEFAULT_BANK_TYPE,
    prompt,
    payload_json: {
      mainAnswer,
      acceptedAnswers: acceptedAnswersFromText(accepted),
      explanation
    },
    is_active: true
  };
}

function parseQcmImportLine(columns) {
  const [
    prompt = "",
    correctAnswer = "",
    distractorsText = "",
    explanation = ""
  ] = columns;

  const distractors = normalizeQcmDistractors(distractorsText);
  if (!prompt || !correctAnswer || !distractors.length) return null;

  return {
    item_type: QCM_BANK_TYPE,
    prompt,
    payload_json: {
      correctAnswer,
      distractors,
      explanation
    },
    is_active: true
  };
}

function parseSelectionImportLine(columns) {
  const [prompt = "", expectedSelectionText = "", explanation = ""] = columns;
  if (!prompt || !expectedSelectionText) return null;
  const expectedTokenIndexes = findTokenIndexesFromSelectionText(prompt, expectedSelectionText);
  if (!expectedTokenIndexes.length) return null;

  return {
    item_type: SELECTION_BANK_TYPE,
    prompt,
    payload_json: {
      expectedTokenIndexes,
      expectedSelectionText: formatSelectionIndexes(prompt, expectedTokenIndexes) || expectedSelectionText,
      explanation
    },
    is_active: true
  };
}

function parseBankImportText(rawText, bankType = DEFAULT_BANK_TYPE) {
  const safeType = normalizeBankType(bankType);
  const lines = String(rawText || "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const imported = [];
  const errors = [];

  lines.forEach((line, index) => {
    const lowerLine = line.toLowerCase();
    const looksLikeSelectionHeader = index === 0
      && isSelectionType(safeType)
      && (lowerLine.includes("énoncé") || lowerLine.includes("enonce"))
      && (lowerLine.includes("sélection") || lowerLine.includes("selection"));
    const looksLikeHeader = looksLikeSelectionHeader || (index === 0
      && (lowerLine.includes("question") || lowerLine.includes("énoncé") || lowerLine.includes("enonce"))
      && (lowerLine.includes("réponse") || lowerLine.includes("reponse")));

    if (looksLikeHeader) return;

    const columns = splitImportLine(line, { maxColumns: isSelectionType(safeType) ? 3 : 4, mergeOverflowIntoLast: true });

    const item = isSelectionType(safeType)
      ? parseSelectionImportLine(columns)
      : isQcmType(safeType)
        ? parseQcmImportLine(columns)
        : parseTextAnswerImportLine(columns);

    if (!item) {
      errors.push(isSelectionType(safeType)
        ? `Ligne ${index + 1} ignorée : énoncé ou sélection attendue manquante`
        : isQcmType(safeType)
          ? `Ligne ${index + 1} ignorée : question, réponse correcte ou distracteur manquant`
          : `Ligne ${index + 1} ignorée : question ou réponse principale manquante`);
      return;
    }

    imported.push(item);
  });

  return { imported, errors };
}

function normalizeExportCellValue(value) {
  return String(value || "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" § ");
}

function formatExportCell(value) {
  const text = normalizeExportCellValue(value);
  if (!text) return "";
  if (/[|"\t]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function serializeBankItemForExport(item, bankType = DEFAULT_BANK_TYPE) {
  const safeType = normalizeBankType(bankType);
  const normalizedItem = normalizeItemDraft({
    ...item,
    item_type: item?.item_type || safeType
  });
  const payload = normalizedItem.payload_json || {};

  if (isSelectionType(safeType)) {
    return [
      normalizedItem.prompt,
      getItemSelectionDisplayValue(normalizedItem),
      payload.explanation || ""
    ].map(formatExportCell).join(" | ");
  }

  if (isQcmType(safeType)) {
    return [
      normalizedItem.prompt,
      payload.correctAnswer || "",
      distractorsToText(distractorsFromFields(payload)),
      payload.explanation || ""
    ].map(formatExportCell).join(" | ");
  }

  return [
    normalizedItem.prompt,
    payload.mainAnswer || "",
    acceptedAnswersToText(payload.acceptedAnswers),
    payload.explanation || ""
  ].map(formatExportCell).join(" | ");
}

function getItemSelectionDisplayValue(item) {
  const payload = item?.payload_json || {};
  const indexes = normalizeTokenIndexes(
    payload.expectedTokenIndexes,
    tokenizeSelectionText(item?.prompt || "").filter((token) => token.kind === "word").length
  );
  return formatSelectionIndexes(item?.prompt || "", indexes) || String(payload.expectedSelectionText || "");
}

function serializeBankItemsForExport(items = [], bankType = DEFAULT_BANK_TYPE) {
  return (Array.isArray(items) ? items : [])
    .map((item) => serializeBankItemForExport(item, bankType))
    .join("\n");
}
export function createQuestionBanksViewController({
  banksView,
  bankExplorerHeader,
  bankEditorHeader,
  bankBreadcrumb,
  banksList,
  bankEditorHost,
  bankEditorHeaderTitle,
  btnCreateBank,
  btnCreateBankFolder,
  btnBackBankExplorer,
  btnDeleteBank,
  btnSaveBank,
  importModal,
  importInput,
  importMessage,
  importPreview,
  btnImportCancel,
  btnImportConfirm,
  getCurrentTeacherSpace,
  showToast
} = {}) {
  let banks = [];
  let bankFolders = [];
  let currentOpenFolderId = null;
  let currentBankTypeFilter = BANK_TYPE_FILTER_ALL;
  let bankViewMode = "explorer";
  let treePaneWidthPercent = 14;
  const collapsedBankFolderIds = new Set();
  const knownBankFolderIds = new Set();
  let selectedBankId = null;
  let selectedBank = null;
  let itemDrafts = [];
  let metaDraft = null;
  let hasPendingChanges = false;
  let isRendering = false;
  let isSaving = false;
  let saveStatus = "idle";
  let saveStatusMessage = "Aucune banque sélectionnée";
  let isMetaExpanded = false;
  let previewItemIndex = 0;
  let expandedItemIndex = -1;
  let isTableBusy = false;
  let tableBusyLabel = "Chargement…";
  let tableScrollHost = null;
  let tableScrollFrame = 0;
  let renderedWindowStart = -1;
  let renderedWindowEnd = -1;
  let renderedVirtualMode = false;
  let draggedBankId = null;
  let bankDropTarget = null;
  let isMovingBank = false;

  function getExplorerBanks() {
    return (banks || []).map((bank, index) => ({
      ...bank,
      config_name: bank?.title || "Banque sans titre",
      folder_id: bank?.is_system === true ? null : (String(bank?.folder_id ?? "").trim() || null),
      display_order: Number.isFinite(Number(bank?.display_order)) ? Number(bank.display_order) : index
    }));
  }

  function getBanksForCurrentType(
    banksSource = getExplorerBanks(),
    typeFilter = currentBankTypeFilter
  ) {
    const safeFilter = normalizeBankTypeFilter(typeFilter);
    const source = Array.isArray(banksSource) ? banksSource : [];
    if (safeFilter === BANK_TYPE_FILTER_ALL) {
      return [...source];
    }

    return source.filter((bank) => normalizeBankType(bank?.bank_type) === safeFilter);
  }

  function buildBankTreeState({
    banksSource = getExplorerBanks(),
    foldersSource = bankFolders
  } = {}) {
    return buildDashboardActivityTreeState({
      activitiesSource: banksSource,
      foldersSource
    });
  }

  function buildVisibleBankTree() {
    return buildDashboardVisibleActivityTree({
      activitiesSource: getBanksForCurrentType(),
      foldersSource: bankFolders,
      collapsedFolderIds: collapsedBankFolderIds,
      currentActivityMode: currentBankTypeFilter
    });
  }

  function syncCollapsedBankFolders() {
    const ids = new Set((bankFolders || []).map((folder) => String(folder.id)));

    for (const folderId of Array.from(collapsedBankFolderIds)) {
      if (!ids.has(folderId)) collapsedBankFolderIds.delete(folderId);
    }

    for (const folderId of Array.from(knownBankFolderIds)) {
      if (!ids.has(folderId)) knownBankFolderIds.delete(folderId);
    }

    ids.forEach((folderId) => {
      if (!knownBankFolderIds.has(folderId)) {
        knownBankFolderIds.add(folderId);
        collapsedBankFolderIds.add(folderId);
      }
    });
  }

  function sanitizeCurrentFolderSelection(treeState = buildBankTreeState()) {
    const safeCurrentFolderId = normalizeTreeId(currentOpenFolderId);
    if (!safeCurrentFolderId || !treeState?.folderById?.has(safeCurrentFolderId)) {
      currentOpenFolderId = null;
    }
  }

  function getSelectedFolder(treeState = buildBankTreeState()) {
    const safeCurrentFolderId = normalizeTreeId(currentOpenFolderId);
    if (!safeCurrentFolderId) return null;
    return treeState?.folderById?.get(safeCurrentFolderId) || null;
  }

  function getFolderBreadcrumb(treeState = buildBankTreeState(), folderId = currentOpenFolderId) {
    const safeFolderId = normalizeTreeId(folderId);
    if (!safeFolderId || !treeState?.folderById?.has(safeFolderId)) return [];

    const path = [];
    let cursor = treeState.folderById.get(safeFolderId) || null;
    while (cursor) {
      path.unshift(cursor);
      const parentId = normalizeTreeId(cursor.parent_id);
      cursor = parentId ? (treeState.folderById.get(parentId) || null) : null;
    }
    return path;
  }

  function expandFolderPath(folderId) {
    const treeState = buildBankTreeState();
    const safeFolderId = normalizeTreeId(folderId);
    if (!safeFolderId || !treeState.folderById.has(safeFolderId)) return;

    let cursor = treeState.folderById.get(safeFolderId) || null;
    while (cursor) {
      collapsedBankFolderIds.delete(String(cursor.id));
      const parentId = normalizeTreeId(cursor.parent_id);
      cursor = parentId ? (treeState.folderById.get(parentId) || null) : null;
    }
  }

  function setBankViewMode(mode = "explorer") {
    bankViewMode = mode === "editor" ? "editor" : "explorer";
    const isEditor = bankViewMode === "editor";
    bankExplorerHeader?.classList.toggle("hidden", isEditor);
    banksList?.classList.toggle("hidden", isEditor);
    bankEditorHeader?.classList.toggle("hidden", !isEditor);
    bankEditorHost?.classList.toggle("hidden", !isEditor);
    banksView?.classList.toggle("is-bank-editor-open", isEditor);
  }

  function updateBankTypeFilterButtons() {
    const currentFilter = normalizeBankTypeFilter(currentBankTypeFilter);
    bankExplorerHeader?.querySelectorAll("[data-bank-type-filter]").forEach((btn) => {
      const buttonFilter = normalizeBankTypeFilter(btn.dataset.bankTypeFilter);
      const isActive = buttonFilter === currentFilter;
      const filterTitle = isAllBankTypeFilter(buttonFilter)
        ? "Afficher toutes les banques"
        : `Afficher les banques ${getBankTypeFilterLabel(buttonFilter).toLowerCase()}`;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
      btn.setAttribute("title", filterTitle);
    });

    const createButtonTitle = isAllBankTypeFilter(currentFilter)
      ? "Créer une banque"
      : `Créer une banque ${getBankTypeLabel(currentFilter).toLowerCase()}`;
    btnCreateBank?.setAttribute("title", createButtonTitle);
  }

  function setCurrentBankTypeFilter(typeFilter = BANK_TYPE_FILTER_ALL) {
    const nextFilter = normalizeBankTypeFilter(typeFilter);
    if (nextFilter === normalizeBankTypeFilter(currentBankTypeFilter)) return;
    currentBankTypeFilter = nextFilter;
    renderExplorer();
  }

  function setCurrentFolder(folderId = null, { expandPath = true } = {}) {
    const safeFolderId = normalizeTreeId(folderId);
    currentOpenFolderId = safeFolderId;
    if (safeFolderId && expandPath) expandFolderPath(safeFolderId);
    renderExplorer();
  }

  function getCurrentFolderContents(treeState = buildBankTreeState()) {
    const selectedFolder = getSelectedFolder(treeState);
    const parentId = selectedFolder ? String(selectedFolder.id) : null;
    return {
      selectedFolder,
      childFolders: treeState.folderChildren.get(parentId) || [],
      childBanks: treeState.activityChildren.get(parentId) || []
    };
  }

  function getBankById(bankId) {
    const safeBankId = String(bankId || "").trim();
    if (!safeBankId) return null;
    return (banks || []).find((bank) => String(bank?.id) === safeBankId) || null;
  }

  function getNextBankOrderForFolder(folderId = currentOpenFolderId) {
    const treeState = buildBankTreeState();
    const parentId = normalizeTreeId(folderId);
    const childFolders = treeState.folderChildren.get(parentId) || [];
    const childBanks = treeState.activityChildren.get(parentId) || [];
    return [...childFolders, ...childBanks]
      .reduce((maxOrder, item) => Math.max(maxOrder, Number(item.display_order) || 0), -1) + 1;
  }

  function getNextBankOrderForFolderAfterMove(folderId, sourceBankId) {
    const safeSourceBankId = String(sourceBankId || "");
    const treeState = buildBankTreeState({
      banksSource: getExplorerBanks().filter((bank) => String(bank.id) !== safeSourceBankId),
      foldersSource: bankFolders
    });
    const parentId = normalizeTreeId(folderId);
    const childFolders = treeState.folderChildren.get(parentId) || [];
    const childBanks = treeState.activityChildren.get(parentId) || [];
    return [...childFolders, ...childBanks]
      .reduce((maxOrder, item) => Math.max(maxOrder, Number(item.display_order) || 0), -1) + 1;
  }

  function renderBankBreadcrumb(treeState = buildBankTreeState()) {
    if (!bankBreadcrumb) return;
    const breadcrumb = getFolderBreadcrumb(treeState);
    bankBreadcrumb.innerHTML = [
      `<button class="dashboard-breadcrumb-btn${breadcrumb.length === 0 ? " is-current" : ""}" type="button" data-action="open-root">Banques</button>`,
      ...breadcrumb.map((folder, index) => {
        const isCurrent = index === breadcrumb.length - 1;
        return `
          <span class="dashboard-breadcrumb-separator" aria-hidden="true">/</span>
          <button
            class="dashboard-breadcrumb-btn${isCurrent ? " is-current" : ""}"
            type="button"
            data-action="open-folder"
            data-folder-id="${escapeAttr(folder.id)}"
          >
            ${escapeHtml(folder.name || "")}
          </button>
        `;
      })
    ].join("");
  }

  function renderTreeFolderNode(node) {
    const folder = node.item;
    const folderId = String(folder.id);
    const chevronIcon = node.isCollapsed ? "chevron_right" : "expand_more";
    const isSelected = normalizeTreeId(currentOpenFolderId) === folderId;

    return `
      <div
        class="dashboard-activity-tree-row dashboard-tree-node ${isSelected ? "is-selected" : ""}"
        data-node-type="folder"
        data-node-id="${escapeAttr(folderId)}"
        data-parent-id="${escapeAttr(node.parentId || "")}"
        data-tree-path="${escapeAttr(node.treePath)}"
        style="--dashboard-tree-depth:${Math.max(0, Number(node.depth) || 0)};"
      >
        <div class="dashboard-tree-indent" aria-hidden="true"></div>

        <button
          class="dashboard-folder-toggle-btn dashboard-material-icon-btn"
          type="button"
          data-action="toggle-folder"
          data-folder-id="${escapeAttr(folderId)}"
          title="${node.isCollapsed ? "Déplier le dossier" : "Replier le dossier"}"
          aria-label="${node.isCollapsed ? "Déplier le dossier" : "Replier le dossier"}"
        >
          <span class="dashboard-material-icon" aria-hidden="true">${chevronIcon}</span>
        </button>

        <button
          class="dashboard-activity-tree-main"
          type="button"
          data-action="open-folder"
          data-folder-id="${escapeAttr(folderId)}"
        >
          <span class="dashboard-material-icon dashboard-activity-tree-node-icon" aria-hidden="true">folder</span>
          <span class="dashboard-activity-tree-node-label">${escapeHtml(folder.name || "")}</span>
        </button>
      </div>
    `;
  }

  function renderExplorerFolderTile(folder) {
    return `
      <article class="dashboard-activity-tile dashboard-activity-tile--folder" data-node-type="folder" data-node-id="${escapeAttr(folder.id)}">
        <button
          class="dashboard-activity-tile-surface dashboard-activity-tile-surface--folder"
          type="button"
          data-action="open-folder"
          data-folder-id="${escapeAttr(folder.id)}"
        >
          <span class="dashboard-material-icon dashboard-activity-tile-icon" aria-hidden="true">folder</span>
          <span class="dashboard-activity-tile-title">${escapeHtml(folder.name || "")}</span>
        </button>

        <div class="dashboard-activity-tile-corner-actions dashboard-activity-tile-corner-actions--stacked">
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="rename-folder" data-folder-id="${escapeAttr(folder.id)}" title="Renommer le dossier" aria-label="Renommer le dossier">
            <span class="dashboard-material-icon" aria-hidden="true">edit</span>
          </button>
          <button class="dashboard-icon-btn dashboard-material-icon-btn is-danger" type="button" data-action="delete-folder" data-folder-id="${escapeAttr(folder.id)}" title="Supprimer le dossier" aria-label="Supprimer le dossier">
            <span class="dashboard-material-icon" aria-hidden="true">delete</span>
          </button>
        </div>
      </article>
    `;
  }

  function renderExplorerParentTile(selectedFolder) {
    if (!selectedFolder) return "";
    const parentId = normalizeTreeId(selectedFolder.parent_id);
    return `
      <article class="dashboard-activity-tile dashboard-activity-tile--folder dashboard-activity-tile--parent">
        <button
          class="dashboard-activity-tile-surface dashboard-activity-tile-surface--folder"
          type="button"
          data-action="${parentId ? "open-folder" : "open-root"}"
          ${parentId ? `data-folder-id="${escapeAttr(parentId)}"` : ""}
        >
          <span class="dashboard-material-icon dashboard-activity-tile-icon" aria-hidden="true">arrow_upward</span>
          <span class="dashboard-activity-tile-title">Dossier parent</span>
        </button>
      </article>
    `;
  }

  function renderExplorerBankTile(bank) {
    const bankId = String(bank.id || "");
    const typeLabel = getBankTypeLabel(bank.bank_type);
    const canDrag = bank.is_system !== true;
    const actionButtons = bank.is_system === true
      ? ""
      : `
        <div class="dashboard-activity-tile-actions dashboard-activity-tile-actions--activity">
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="rename-bank" data-bank-id="${escapeAttr(bankId)}" title="Renommer la banque" aria-label="Renommer la banque">
            <span class="dashboard-material-icon" aria-hidden="true">edit</span>
          </button>

          <button class="dashboard-icon-btn dashboard-material-icon-btn is-danger" type="button" data-action="delete-bank" data-bank-id="${escapeAttr(bankId)}" title="Supprimer la banque" aria-label="Supprimer la banque">
            <span class="dashboard-material-icon" aria-hidden="true">delete</span>
          </button>
        </div>
      `;
    return `
      <article
        class="dashboard-activity-tile dashboard-activity-tile--activity"
        data-node-type="bank"
        data-node-id="${escapeAttr(bankId)}"
        draggable="${canDrag ? "true" : "false"}"
      >
        <button
          class="dashboard-activity-tile-surface dashboard-activity-tile-surface--activity"
          type="button"
          data-action="open-bank"
          data-bank-id="${escapeAttr(bankId)}"
          draggable="false"
        >
          <span class="dashboard-activity-tile-topline">
            <span class="dashboard-material-icon dashboard-activity-tile-icon" aria-hidden="true">database</span>
            <span class="dashboard-activity-tile-subtitle dashboard-mini-pill dashboard-activity-tile-mode-badge">
              ${escapeHtml(typeLabel)}
            </span>
          </span>
          <span class="dashboard-activity-tile-title">${escapeHtml(bank.title || "Banque sans titre")}</span>
        </button>
        ${actionButtons}
      </article>
    `;
  }

  function renderEmptyExplorerState(treeState = buildBankTreeState()) {
    const currentFilter = normalizeBankTypeFilter(currentBankTypeFilter);
    const selectedFolder = getSelectedFolder(treeState);
    const contextLabel = selectedFolder ? `dans « ${selectedFolder.name} »` : "à la racine";
    const message = isAllBankTypeFilter(currentFilter)
      ? `Aucune banque ${contextLabel}.`
      : `Aucune banque de type ${getBankTypeLabel(currentFilter).toLowerCase()} ${contextLabel}.`;
    return `<div class="dashboard-activity-empty-state">${escapeHtml(message)}</div>`;
  }

  function renderExplorerShell(treeState, visibleNodes) {
    const { selectedFolder, childFolders, childBanks } = getCurrentFolderContents(treeState);
    const treeHtml = visibleNodes
      .filter((node) => node.type === "folder")
      .map(renderTreeFolderNode)
      .join("");
    const tilesHtml = [
      renderExplorerParentTile(selectedFolder),
      ...childFolders.map(renderExplorerFolderTile),
      ...childBanks.map(renderExplorerBankTile)
    ].filter(Boolean).join("");

    return `
      <div class="dashboard-activities-explorer" style="--dashboard-tree-pane-width:${treePaneWidthPercent}%;">
        <aside class="dashboard-activity-tree-pane panel">
          <div class="dashboard-activity-tree-list">
            <div class="dashboard-activity-tree-row dashboard-activity-tree-root ${normalizeTreeId(currentOpenFolderId) ? "" : "is-selected"}">
              <button class="dashboard-activity-tree-main dashboard-activity-tree-main--root" type="button" data-action="open-root">
                <span class="dashboard-material-icon dashboard-activity-tree-node-icon" aria-hidden="true">home</span>
                <span class="dashboard-activity-tree-node-label">Banques</span>
              </button>
            </div>
            ${treeHtml || '<div class="dashboard-activity-tree-empty">Aucun dossier pour le moment.</div>'}
          </div>
        </aside>

        <div class="dashboard-activity-splitter" role="separator" aria-orientation="vertical" aria-label="Séparateur entre les panneaux"></div>

        <section class="dashboard-activity-tiles-pane panel">
          <div class="dashboard-activity-tiles-grid-wrap">
            <div class="dashboard-activity-tiles-grid">
              ${tilesHtml || renderEmptyExplorerState(treeState)}
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function renderExplorer() {
    if (!banksList) return;
    const { state: treeState, visibleNodes } = buildVisibleBankTree();
    sanitizeCurrentFolderSelection(treeState);
    renderBankBreadcrumb(treeState);
    updateBankTypeFilterButtons();
    banksList.classList.add("dashboard-explorer-host");
    banksList.innerHTML = renderExplorerShell(treeState, visibleNodes);
    bindExplorerEvents();
  }

  function getFolderById(folderId) {
    const safeFolderId = normalizeTreeId(folderId);
    return safeFolderId ? (bankFolders || []).find((folder) => String(folder.id) === safeFolderId) || null : null;
  }

  function openNameInputOverlay({ title, confirmLabel, initialName = "", placeholder = "", onConfirm } = {}) {
    const overlay = document.createElement("div");
    overlay.className = "modal";
    overlay.innerHTML = `
      <div class="modal-content">
        <div class="modal-title">${escapeHtml(title || "Dossier")}</div>
        <input id="bankFolderNameInput" class="modal-text-input" type="text" placeholder="${escapeAttr(placeholder || "")}" value="${escapeAttr(initialName || "")}">
        <div class="modal-actions">
          <div id="bankFolderModalMessage" class="modal-message"></div>
          <button class="btn" id="bankFolderModalCancel" type="button">Annuler</button>
          <button class="btn primary" id="bankFolderModalConfirm" type="button">${escapeHtml(confirmLabel || "Enregistrer")}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const input = overlay.querySelector("#bankFolderNameInput");
    const message = overlay.querySelector("#bankFolderModalMessage");

    function close() { overlay.remove(); }

    async function submit() {
      const name = String(input?.value || "").trim();
      if (!name) {
        message.textContent = "Entre un nom de dossier.";
        message.classList.add("is-error");
        input?.focus();
        return;
      }

      message.textContent = "";
      message.classList.remove("is-error");
      try {
        await onConfirm?.(name);
        close();
      } catch (err) {
        message.textContent = err?.message || "Enregistrement impossible.";
        message.classList.add("is-error");
      }
    }

    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        void submit();
      }
    });
    overlay.querySelector("#bankFolderModalCancel")?.addEventListener("click", close);
    overlay.querySelector("#bankFolderModalConfirm")?.addEventListener("click", () => { void submit(); });
    input?.focus();
    input?.select();
  }

  async function openCreateFolderOverlay(parentId = currentOpenFolderId) {
    const teacherSpace = getCurrentTeacherSpace?.();
    if (!teacherSpace?.id) return;
    openNameInputOverlay({
      title: "Créer un dossier",
      confirmLabel: "Créer",
      initialName: "",
      placeholder: "Nom du dossier",
      onConfirm: async (name) => {
        const created = await createQuestionBankFolderForSpace(teacherSpace.id, { name, parent_id: parentId });
        bankFolders = [...bankFolders, created];
        knownBankFolderIds.add(String(created.id));
        collapsedBankFolderIds.add(String(created.id));
        renderExplorer();
      }
    });
  }

  function openRenameFolderOverlay(folderId) {
    const folder = getFolderById(folderId);
    if (!folder) return;
    openNameInputOverlay({
      title: "Renommer le dossier",
      confirmLabel: "Enregistrer",
      initialName: folder.name || "",
      placeholder: "Nom du dossier",
      onConfirm: async (name) => {
        const updated = await updateQuestionBankFolder(folder.id, { name });
        bankFolders = bankFolders.map((item) => String(item.id) === String(folder.id) ? { ...item, ...updated } : item);
        renderExplorer();
      }
    });
  }

  function openRenameBankOverlay(bankId) {
    const bank = getBankById(bankId);
    if (!bank || bank.is_system === true) return;

    openNameInputOverlay({
      title: "Renommer la banque",
      confirmLabel: "Enregistrer",
      initialName: bank.title || "",
      placeholder: "Nom de la banque",
      onConfirm: async (name) => {
        if (bankTitleAlreadyExists(banks, name, bank.id)) {
          throw new Error("Une banque porte déjà ce nom.");
        }

        const updated = await updateQuestionBank(bank.id, { title: name });
        banks = banks.map((item) => String(item.id) === String(updated.id) ? { ...item, ...updated } : item);
        if (String(selectedBankId || "") === String(updated.id)) {
          selectedBank = { ...(selectedBank || {}), ...updated };
          metaDraft = metaDraft ? { ...metaDraft, title: updated.title || "" } : metaDraft;
        }
        renderExplorer();
        updateActionState();
      }
    });
  }

  async function deleteBankFromExplorer(bankId) {
    const bank = getBankById(bankId);
    if (!bank || bank.is_system === true) return;

    const ok = window.confirm(`Supprimer la banque « ${bank.title} » ?`);
    if (!ok) return;

    try {
      await deleteQuestionBank(bank.id);
      banks = banks.filter((item) => String(item.id) !== String(bank.id));
      if (String(selectedBankId || "") === String(bank.id)) {
        selectedBankId = null;
        selectedBank = null;
        itemDrafts = [];
        metaDraft = null;
        expandedItemIndex = -1;
        setPendingChanges(false);
        setSaveStatus("idle", "Aucune banque sélectionnée");
        renderEditor();
      }
      renderExplorer();
      updateActionState();
    } catch (err) {
      showToast?.(err?.message || "Impossible de supprimer la banque.", { isError: true });
    }
  }

  function openDeleteFolderOverlay(folderId) {
    const folder = getFolderById(folderId);
    if (!folder) return;
    const overlay = document.createElement("div");
    overlay.className = "modal";
    overlay.innerHTML = `
      <div class="modal-content">
        <div class="modal-title">Supprimer le dossier</div>
        <div class="dashboard-message">Supprimer le dossier "${escapeHtml(folder.name || "")}" ?</div>
        <div class="modal-actions">
          <div id="deleteBankFolderMessage" class="modal-message"></div>
          <button class="btn" id="deleteBankFolderCancel" type="button">Annuler</button>
          <button class="btn dashboard-danger-btn" id="deleteBankFolderConfirm" type="button">Supprimer</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const message = overlay.querySelector("#deleteBankFolderMessage");

    function close() { overlay.remove(); }

    async function submit() {
      const treeState = buildBankTreeState();
      const hasChildFolders = (treeState.folderChildren.get(String(folder.id)) || []).length > 0;
      const hasChildBanks = (treeState.activityChildren.get(String(folder.id)) || []).length > 0;
      if (hasChildFolders || hasChildBanks) {
        message.textContent = "Ce dossier doit être vide avant suppression.";
        message.classList.add("is-error");
        return;
      }

      message.textContent = "Suppression…";
      message.classList.remove("is-error");
      try {
        await deleteQuestionBankFolder(folder.id);
        bankFolders = bankFolders.filter((item) => String(item.id) !== String(folder.id));
        collapsedBankFolderIds.delete(String(folder.id));
        knownBankFolderIds.delete(String(folder.id));
        if (normalizeTreeId(currentOpenFolderId) === String(folder.id)) currentOpenFolderId = null;
        close();
        renderExplorer();
      } catch (err) {
        message.textContent = err?.message || "Suppression impossible.";
        message.classList.add("is-error");
      }
    }

    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        void submit();
      }
    });
    overlay.querySelector("#deleteBankFolderCancel")?.addEventListener("click", close);
    overlay.querySelector("#deleteBankFolderConfirm")?.addEventListener("click", () => { void submit(); });
  }

  function clearHighlightedBankDropTargets() {
    banksList?.querySelectorAll(".dashboard-activity-tile.is-dragging, .dashboard-activity-tile.is-drop-inside, .dashboard-tree-node.is-drop-inside, .dashboard-activity-tree-root.is-drop-inside").forEach((el) => {
      el.classList.remove("is-dragging", "is-drop-inside");
    });
  }

  function clearBankDropMarkers() {
    bankDropTarget = null;
    clearHighlightedBankDropTargets();
  }

  function getBankDropTargetFromEvent(event) {
    const targetEl = event.target instanceof Element ? event.target : null;
    if (!targetEl || !banksList?.contains(targetEl)) return null;

    if (targetEl.closest(".dashboard-activity-tree-root")) {
      return { mode: "append-root" };
    }

    const folderTile = targetEl.closest(".dashboard-activity-tile[data-node-type='folder'][data-node-id]");
    if (folderTile) {
      return {
        mode: "inside",
        targetId: String(folderTile.dataset.nodeId || ""),
        targetSurface: "tile"
      };
    }

    const folderRow = targetEl.closest(".dashboard-tree-node[data-node-type='folder'][data-node-id]");
    if (folderRow) {
      return {
        mode: "inside",
        targetId: String(folderRow.dataset.nodeId || ""),
        targetSurface: "tree"
      };
    }

    return null;
  }

  function renderBankDropTarget(dropTarget) {
    clearHighlightedBankDropTargets();
    if (!dropTarget) return;

    if (dropTarget.mode === "append-root") {
      banksList?.querySelector(".dashboard-activity-tree-root")?.classList.add("is-drop-inside");
      return;
    }

    if (dropTarget.mode !== "inside") return;
    const targetId = CSS.escape(String(dropTarget.targetId || ""));
    if (dropTarget.targetSurface === "tile") {
      banksList?.querySelector(`.dashboard-activity-tile[data-node-type="folder"][data-node-id="${targetId}"]`)?.classList.add("is-drop-inside");
      return;
    }

    banksList?.querySelector(`.dashboard-tree-node[data-node-type="folder"][data-node-id="${targetId}"]`)?.classList.add("is-drop-inside");
  }

  async function moveBankToDropTarget(bankId, dropTarget) {
    const teacherSpace = getCurrentTeacherSpace?.();
    if (!teacherSpace?.id || !dropTarget) return;

    const sourceBank = getBankById(bankId);
    if (!sourceBank || sourceBank.is_system === true) {
      clearBankDropMarkers();
      return;
    }

    const targetFolderId = dropTarget.mode === "append-root" ? null : normalizeTreeId(dropTarget.targetId);
    if (dropTarget.mode === "inside" && !getFolderById(targetFolderId)) {
      clearBankDropMarkers();
      return;
    }

    const previousBanks = [...banks];
    const nextDisplayOrder = getNextBankOrderForFolderAfterMove(targetFolderId, sourceBank.id);
    banks = banks.map((bank) => String(bank?.id) === String(sourceBank.id)
      ? {
          ...bank,
          folder_id: targetFolderId,
          display_order: nextDisplayOrder
        }
      : bank);

    isMovingBank = true;
    renderExplorer();

    try {
      const updated = await updateQuestionBank(sourceBank.id, {
        folder_id: targetFolderId,
        display_order: nextDisplayOrder
      });
      banks = banks.map((bank) => String(bank?.id) === String(sourceBank.id)
        ? { ...bank, ...updated }
        : bank);
    } catch (err) {
      banks = previousBanks;
      showToast?.(err?.message || "Impossible de déplacer la banque.", { isError: true });
    } finally {
      isMovingBank = false;
      draggedBankId = null;
      clearBankDropMarkers();
      renderExplorer();
    }
  }

  function handleBankDragStart(event) {
    const card = event.currentTarget;
    const bankId = String(card?.dataset?.nodeId || "");
    const bank = getBankById(bankId);
    if (!bankId || !bank || bank.is_system === true || isMovingBank) {
      event.preventDefault();
      return;
    }

    draggedBankId = bankId;
    card.classList.add("is-dragging");

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", `bank:${bankId}`);
    }
  }

  function handleBankDragOver(event) {
    if (!draggedBankId || isMovingBank) return;
    const dropTarget = getBankDropTargetFromEvent(event);
    if (!dropTarget) return;

    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    bankDropTarget = dropTarget;
    renderBankDropTarget(dropTarget);
    banksList?.querySelector(`.dashboard-activity-tile[data-node-type="bank"][data-node-id="${CSS.escape(draggedBankId)}"]`)?.classList.add("is-dragging");
  }

  function handleBankDragLeave(event) {
    if (!banksList) return;
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && banksList.contains(relatedTarget)) return;
    clearBankDropMarkers();
  }

  async function handleBankDrop(event) {
    if (!draggedBankId || isMovingBank) return;
    const dropTarget = bankDropTarget || getBankDropTargetFromEvent(event);
    if (!dropTarget) return;

    event.preventDefault();
    await moveBankToDropTarget(draggedBankId, dropTarget);
  }

  function handleBankDragEnd() {
    draggedBankId = null;
    clearBankDropMarkers();
  }

  function bindExplorerEvents() {
    banksList?.querySelectorAll("[data-action='toggle-folder']").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleFolderExpanded(btn.dataset.folderId);
      });
    });

    banksList?.querySelectorAll("[data-action='open-root']").forEach((btn) => {
      btn.addEventListener("click", () => setCurrentFolder(null));
    });

    banksList?.querySelectorAll("[data-action='open-folder']").forEach((btn) => {
      btn.addEventListener("click", () => setCurrentFolder(btn.dataset.folderId));
    });

    banksList?.querySelectorAll("[data-action='rename-folder']").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        openRenameFolderOverlay(btn.dataset.folderId);
      });
    });

    banksList?.querySelectorAll("[data-action='delete-folder']").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        openDeleteFolderOverlay(btn.dataset.folderId);
      });
    });

    banksList?.querySelectorAll("[data-action='rename-bank']").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        openRenameBankOverlay(btn.dataset.bankId);
      });
    });

    banksList?.querySelectorAll("[data-action='delete-bank']").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        void deleteBankFromExplorer(btn.dataset.bankId);
      });
    });

    banksList?.querySelectorAll("[data-action='open-bank']").forEach((btn) => {
      btn.addEventListener("click", () => {
        void selectBank(btn.dataset.bankId);
      });
    });

    banksList?.querySelectorAll(".dashboard-activity-tile[data-node-type='bank'][data-node-id][draggable='true']").forEach((card) => {
      card.addEventListener("dragstart", handleBankDragStart);
      card.addEventListener("dragend", handleBankDragEnd);
    });
  }

  function toggleFolderExpanded(folderId) {
    const safeFolderId = normalizeTreeId(folderId);
    if (!safeFolderId) return;
    if (collapsedBankFolderIds.has(safeFolderId)) {
      collapsedBankFolderIds.delete(safeFolderId);
    } else {
      collapsedBankFolderIds.add(safeFolderId);
    }
    renderExplorer();
  }

  async function closeBankEditor({ force = false } = {}) {
    if (hasPendingChanges && !force && !window.confirm("Des modifications non enregistrées existent. Revenir aux banques ?")) {
      return false;
    }
    selectedBankId = null;
    selectedBank = null;
    itemDrafts = [];
    metaDraft = null;
    expandedItemIndex = -1;
    setTableBusy(false);
    setPendingChanges(false);
    setSaveStatus("idle", "Aucune banque sélectionnée");
    renderEditor();
    setBankViewMode("explorer");
    renderExplorer();
    return true;
  }

  function getSelectedBank() {
    return selectedBank || banks.find((bank) => String(bank?.id) === String(selectedBankId)) || null;
  }

  function getSelectedBankType() {
    return normalizeBankType(getSelectedBank()?.bank_type || DEFAULT_BANK_TYPE);
  }

  function getCurrentQcmDistractorColumnCount() {
    return getQcmDistractorColumnCount(itemDrafts);
  }

  function hasOptionalMeta(draft = metaDraft) {
    return Boolean(
      String(draft?.subject || "").trim()
      || String(draft?.grade_level || "").trim()
      || String(draft?.description || "").trim()
      || (Array.isArray(draft?.tags) && draft.tags.length > 0)
    );
  }

  function selectedBankIsTextAnswer() {
    return isTextAnswerType(getSelectedBank()?.bank_type);
  }

  function selectedBankIsEditableType() {
    return isEditableBankType(getSelectedBank()?.bank_type);
  }

  function canEditSelectedBank() {
    const bank = getSelectedBank();
    return Boolean(bank && bank.is_system !== true);
  }

  function canEditSelectedBankItems() {
    return canEditSelectedBank() && selectedBankIsEditableType();
  }

  function shouldVirtualizeRows() {
    return itemDrafts.length >= BANK_ROWS_VIRTUALIZATION_THRESHOLD;
  }

  function getItemsRowsHost() {
    return document.getElementById("bankItemsRows");
  }

  function getItemsLoadingHost() {
    return document.getElementById("bankItemsLoading");
  }

  function setTableBusy(next = false, label = "Chargement…") {
    isTableBusy = next === true;
    tableBusyLabel = String(label || "").trim() || "Chargement…";
    renderTableBusy();
  }

  function renderTableBusy() {
    const loadingHost = getItemsLoadingHost();
    if (!loadingHost) return;
    loadingHost.hidden = !isTableBusy;
    loadingHost.setAttribute("aria-hidden", isTableBusy ? "false" : "true");
    const label = loadingHost.querySelector(".dashboard-bank-table-loading-label");
    if (label) {
      label.textContent = tableBusyLabel;
    }
  }

  function renderBankEditorMessage() {
    const messageEl = document.getElementById("bankEditorMessage");
    if (!messageEl) return;

    const safeStatus = saveStatus || "idle";
    const label = saveStatusMessage || "";
    const shouldShowMessage = Boolean(label) && safeStatus !== "idle";
    messageEl.textContent = shouldShowMessage ? label : "";
    messageEl.style.color = safeStatus === "error" ? "var(--bad)" : "var(--muted)";
  }

  function renderSaveStatus() {
    const bank = getSelectedBank();
    const canEditBank = canEditSelectedBank();
    const safeStatus = saveStatus || "idle";

    if (btnSaveBank) {
      btnSaveBank.classList.remove("dirty", "saving", "saved", "readonly");

      if (safeStatus === "saving" || safeStatus === "loading") {
        btnSaveBank.classList.add("saving");
        btnSaveBank.textContent = safeStatus === "loading" ? "Chargement…" : "Enregistrement…";
      } else if (safeStatus === "saved" && !hasPendingChanges) {
        btnSaveBank.classList.add("saved");
        btnSaveBank.textContent = "Enregistré";
      } else {
        if (hasPendingChanges || safeStatus === "dirty" || safeStatus === "error") {
          btnSaveBank.classList.add("dirty");
        }
        btnSaveBank.textContent = "Enregistrer";
      }

      btnSaveBank.disabled = !canEditBank || safeStatus === "saving" || safeStatus === "loading";
      btnSaveBank.classList.toggle("readonly", bank?.is_system === true);
    }

    renderBankEditorMessage();
  }

  function setSaveStatus(status = "idle", message = "") {
    saveStatus = status;
    saveStatusMessage = message;
    renderSaveStatus();
  }

  function updateActionState() {
    const bank = getSelectedBank();
    const canEditBank = canEditSelectedBank();

    if (bankEditorHeaderTitle) {
      bankEditorHeaderTitle.textContent = bank?.title || "Banque sans nom";
      bankEditorHeaderTitle.classList.toggle("is-empty", !bank?.title);
      bankEditorHeaderTitle.title = bank?.title || "";
    }

    const btnRenameBankFromHeader = document.getElementById("btnRenameBankFromHeader");
    if (btnRenameBankFromHeader) {
      btnRenameBankFromHeader.disabled = !bank || bank.is_system === true || isSaving;
      btnRenameBankFromHeader.title = bank?.is_system === true
        ? "Cette banque proposée ne peut pas être renommée"
        : "Renommer la banque";
    }

    const bankEditorTypePill = document.getElementById("bankEditorTypePill");
    if (bankEditorTypePill) {
      bankEditorTypePill.hidden = !bank;
      bankEditorTypePill.textContent = bank ? getBankTypeLabel(bank.bank_type) : "";
      bankEditorTypePill.title = bank ? `Type technique : ${bank.bank_type || DEFAULT_BANK_TYPE}` : "";
    }

    syncBankMetaExpansionUi();

    const importButton = document.getElementById("btnImportBank");
    if (importButton) {
      importButton.disabled = !canEditSelectedBankItems() || isSaving;
      importButton.title = bank && !selectedBankIsEditableType()
        ? "L’import rapide n’est pas encore disponible pour ce type de banque."
        : "";
    }

    const exportEditButton = document.getElementById("btnExportEditBank");
    if (exportEditButton) {
      exportEditButton.disabled = !bank || !selectedBankIsEditableType() || isSaving;
      exportEditButton.title = bank && !selectedBankIsEditableType()
        ? "L’édition brute n’est pas encore disponible pour ce type de banque."
        : "";
    }

    if (btnDeleteBank) {
      btnDeleteBank.disabled = !bank || bank.is_system === true || isSaving;
      btnDeleteBank.title = bank?.is_system === true
        ? "Les banques proposées ne peuvent pas être supprimées."
        : "";
    }

    if (!bank) {
      setSaveStatus("idle", "Aucune banque sélectionnée");
    } else if (bank.is_system === true) {
      setSaveStatus("readonly", "Banque proposée en lecture seule");
    } else if (hasPendingChanges && !isSaving && saveStatus !== "error") {
      setSaveStatus("dirty", "Modifications non enregistrées");
    } else {
      renderSaveStatus();
    }
  }

  function setPendingChanges(next = true) {
    const nextPendingChanges = next === true;
    const hasChanged = hasPendingChanges !== nextPendingChanges;
    hasPendingChanges = nextPendingChanges;

    const shouldMarkDirty = hasPendingChanges && !isSaving && saveStatus !== "dirty";
    if (shouldMarkDirty) {
      saveStatus = "dirty";
      saveStatusMessage = "Modifications non enregistrées";
    }

    if (hasChanged || shouldMarkDirty || !hasPendingChanges || isSaving) {
      updateActionState();
    }
  }

  function renderEmptyState(message = "Sélectionne une banque ou crée-en une nouvelle.") {
    if (!bankEditorHost) return;
    unbindRowsHostEvents();
    renderBankHeaderMetaPanel();
    bankEditorHost.innerHTML = `
      <div class="dashboard-bank-empty-state">
        <span class="dashboard-material-icon" aria-hidden="true">database</span>
        <div>${escapeHtml(message)}</div>
      </div>
    `;
  }

  function renderBanksList() {
    renderExplorer();
  }

  function buildBankMetaFieldsMarkup({ isSystem = false } = {}) {
    if (!metaDraft) return "";
    const tagsText = Array.isArray(metaDraft.tags) ? metaDraft.tags.join("; ") : "";

    return `
      <div class="dashboard-bank-meta-grid dashboard-bank-header-meta-grid">
        <label class="dashboard-bank-field">
          <span>Matière</span>
          <input id="bankSubjectInput" class="dashboard-bank-input" type="text" value="${escapeAttr(metaDraft.subject)}" ${isSystem ? "disabled" : ""}>
        </label>
        <label class="dashboard-bank-field">
          <span>Niveau</span>
          <input id="bankGradeInput" class="dashboard-bank-input" type="text" value="${escapeAttr(metaDraft.grade_level)}" ${isSystem ? "disabled" : ""}>
        </label>
        <label class="dashboard-bank-field dashboard-bank-field-wide">
          <span>Tags <small>séparés par ;</small></span>
          <input id="bankTagsInput" class="dashboard-bank-input" type="text" value="${escapeAttr(tagsText)}" ${isSystem ? "disabled" : ""}>
        </label>
        <label class="dashboard-bank-field dashboard-bank-field-wide">
          <span>Description</span>
          <textarea id="bankDescriptionInput" class="dashboard-bank-textarea" ${isSystem ? "disabled" : ""}>${escapeHtml(metaDraft.description)}</textarea>
        </label>
      </div>
    `;
  }

  function renderBankHeaderMetaPanel() {
    const bank = getSelectedBank();
    const panel = document.getElementById("bankEditorMetaPanel");
    const toggleButton = document.getElementById("btnToggleBankMeta");
    if (!panel) return;

    if (!bank || !metaDraft) {
      panel.innerHTML = "";
      panel.hidden = true;
      if (toggleButton) {
        toggleButton.disabled = true;
        toggleButton.setAttribute("aria-expanded", "false");
      }
      return;
    }

    panel.innerHTML = buildBankMetaFieldsMarkup({ isSystem: bank.is_system === true });
    syncBankMetaExpansionUi();
  }

  function buildEditorMarkup() {
    const bank = getSelectedBank();
    if (!bank || !metaDraft) return "";
    const isSystem = bank.is_system === true;
    const bankType = normalizeBankType(bank.bank_type);
    const isEditableItemsBank = isEditableBankType(bankType);
    const canEditItems = canEditSelectedBankItems();
    const qcmDistractorColumnCount = isQcmType(bankType) ? getCurrentQcmDistractorColumnCount() : 1;

    return `
      <div class="dashboard-bank-editor">
        ${isSystem ? `
          <div class="dashboard-bank-readonly-note">
            <span class="dashboard-material-icon" aria-hidden="true">lock</span>
            <span>Cette banque est proposée à tous les enseignants. Crée une copie personnelle pour la modifier.</span>
          </div>
          <div class="dashboard-bank-editor-actions">
            <button id="btnCopySystemBank" class="btn" type="button">Créer une copie modifiable</button>
          </div>
        ` : ""}

        ${isEditableItemsBank ? `
          <div class="dashboard-bank-table-toolbar">
            <div>
              <div class="dashboard-bank-table-title-row">
                <div class="dashboard-bank-table-title">Items</div>
                <div class="dashboard-bank-table-count">- ${itemDrafts.length} question${itemDrafts.length > 1 ? "s" : ""}</div>
                <div class="dashboard-bank-preview-wrap">
                  <button
                    id="btnBankPreview"
                    class="dashboard-bank-preview-btn dashboard-material-icon-btn"
                    type="button"
                    aria-label="Aperçu d’une question"
                    aria-expanded="false"
                    ${itemDrafts.length ? "" : "disabled"}
                  >
                    <span class="dashboard-material-icon" aria-hidden="true">preview</span>
                  </button>
                  <div id="bankPreviewPopup" class="dashboard-bank-preview-popup" role="dialog" aria-label="Aperçu d’une question" hidden>
                    <div class="dashboard-bank-preview-popup-header">
                      <div class="dashboard-bank-preview-popup-title">Aperçu</div>
                      <label class="dashboard-bank-preview-picker">
                        <span>#</span>
                        <input id="bankPreviewIndexInput" type="number" min="1" max="${Math.max(1, itemDrafts.length)}" value="${Math.min(itemDrafts.length || 1, previewItemIndex + 1)}">
                      </label>
                    </div>
                    <div id="bankPreviewContent" class="dashboard-bank-preview-content"></div>
                  </div>
                </div>
              </div>
            </div>
            <div class="dashboard-bank-table-actions">
              <div class="dashboard-bank-markup-help-wrap">
                <button
                  id="btnBankMarkupHelp"
                  class="dashboard-bank-markup-help-btn"
                  type="button"
                  aria-label="Aide mini-langage"
                  aria-expanded="false"
                >?</button>
                <div id="bankMarkupHelpPopup" class="dashboard-bank-markup-help-popup" role="dialog" aria-label="Mini-langage" hidden>
                  <div class="dashboard-bank-markup-help-title">Mini-langage</div>
                  <div class="dashboard-bank-markup-help-list">
                    <div><code>§</code><span>retour ligne</span></div>
                    <div><code>*mot*</code><span>gras</span></div>
                    <div><code>_mot_</code><span>italique</span></div>
                    <div><code>[mot]</code><span>couleur</span></div>
                  </div>
                </div>
              </div>
              <button id="btnAddBankItem" class="btn" type="button" ${canEditItems ? "" : "disabled"}>
                <span class="dashboard-material-icon" aria-hidden="true">add</span>
                <span>Ajouter une question</span>
              </button>
              <button id="btnImportBank" class="btn" type="button" ${canEditItems ? "" : "disabled"}>
                <span class="dashboard-material-icon" aria-hidden="true">content_paste</span>
                <span>Importer / coller</span>
              </button>
              <button id="btnExportEditBank" class="btn" type="button" ${isEditableItemsBank ? "" : "disabled"}>
                <span class="dashboard-material-icon" aria-hidden="true">edit_note</span>
                <span>Exporter / éditer</span>
              </button>
            </div>
          </div>

          <div class="dashboard-bank-table dashboard-bank-table--${escapeAttr(bankType)}" role="table" aria-label="Items de la banque" ${isQcmType(bankType) ? `style="--dashboard-bank-qcm-distractor-columns:${qcmDistractorColumnCount}"` : ""}>
            ${buildTableHeadMarkup(bankType, { qcmDistractorCount: qcmDistractorColumnCount })}
            <div id="bankItemsRows" class="dashboard-bank-table-body"></div>
            <div id="bankItemsLoading" class="dashboard-bank-table-loading" aria-hidden="${isTableBusy ? "false" : "true"}" ${isTableBusy ? "" : "hidden"}>
              <span class="dashboard-material-icon" aria-hidden="true">progress_activity</span>
              <span class="dashboard-bank-table-loading-label">${escapeHtml(tableBusyLabel)}</span>
            </div>
          </div>
        ` : buildUnsupportedBankTypeMarkup(bank)}
      </div>
    `;
  }

  function buildUnsupportedBankTypeMarkup(bank) {
    return `
      <div class="dashboard-bank-unsupported">
        <div class="dashboard-bank-unsupported-icon dashboard-material-icon" aria-hidden="true">extension</div>
        <div>
          <div class="dashboard-bank-unsupported-title">Type de banque conservé, pas encore éditable ici</div>
          <div class="dashboard-bank-unsupported-text">
            Cette interface sait modifier les banques Texte, les banques QCM et les banques Sélection. Les ${itemDrafts.length} item${itemDrafts.length > 1 ? "s" : ""} de type ${escapeHtml(getBankTypeLabel(bank?.bank_type))} sont chargés et préservés.
          </div>
        </div>
      </div>
    `;
  }

  function buildTableHeadMarkup(bankType = DEFAULT_BANK_TYPE, { qcmDistractorCount = 1 } = {}) {
    const heads = getTableHeadsForType(bankType, { qcmDistractorCount });
    return `
            <div class="dashboard-bank-table-head dashboard-bank-table-head--${escapeAttr(normalizeBankType(bankType))}" role="row" ${isQcmType(bankType) ? `data-qcm-distractor-count="${clampQcmDistractorCount(qcmDistractorCount)}"` : ""}>
              ${heads.map((head) => `<div>${escapeHtml(head)}</div>`).join("")}
            </div>`;
  }

  function getItemFieldDisplayValue(item, fieldName) {
    const payload = item?.payload_json || {};
    if (fieldName === "prompt") return String(item?.prompt || "");
    if (fieldName === "mainAnswer") return String(payload.mainAnswer || "");
    if (fieldName === "acceptedAnswers") return acceptedAnswersToText(payload.acceptedAnswers);
    if (fieldName === "correctAnswer") return String(payload.correctAnswer || "");
    if (fieldName === "expectedSelection") {
      const indexes = normalizeTokenIndexes(payload.expectedTokenIndexes, tokenizeSelectionText(item?.prompt || "").filter((token) => token.kind === "word").length);
      return formatSelectionIndexes(item?.prompt || "", indexes) || String(payload.expectedSelectionText || "");
    }
    if (fieldName === "distractors") return distractorsToText(distractorsFromFields(payload));
    {
      const match = String(fieldName || "").match(/^distractor([1-5])$/);
      if (match) return String(distractorsFromFields(payload, { keepEmpty: true })[Number(match[1]) - 1] || "");
    }
    if (fieldName === "explanation") return String(payload.explanation || "");
    return "";
  }
  function buildItemFieldMarkup(fieldName, value, label, index, {
    disabled = false,
    spellcheck = null,
    extraClass = ""
  } = {}) {
    const safeValue = String(value || "");
    const spellcheckAttr = spellcheck === true
      ? ' spellcheck="true"'
      : spellcheck === false
        ? ' spellcheck="false"'
        : "";
    const className = ["dashboard-bank-cell", extraClass].filter(Boolean).join(" ");

    if (fieldName === "expectedSelection") {
      return `
        <div class="dashboard-bank-cell-wrap dashboard-bank-selection-cell-wrap">
          <button
            class="${escapeAttr(className)} dashboard-bank-cell-picker"
            data-bank-field="${escapeAttr(fieldName)}"
            data-bank-action="pick-selection"
            type="button"
            aria-label="${escapeAttr(`${label} ${index + 1}`)}"
            title="${escapeAttr(safeValue || "Choisir les mots attendus")}"
            ${disabled ? "disabled" : ""}
          >${escapeHtml(safeValue || "Choisir…")}</button>
          <div class="dashboard-bank-cell-preview" data-bank-preview-field="${escapeAttr(fieldName)}">${escapeHtml(safeValue)}</div>
        </div>
      `;
    }

    return `
      <div class="dashboard-bank-cell-wrap">
        <input
          class="${escapeAttr(className)}"
          data-bank-field="${escapeAttr(fieldName)}"
          type="text"
          aria-label="${escapeAttr(`${label} ${index + 1}`)}"
          title="${escapeAttr(safeValue)}"
          value="${escapeAttr(safeValue)}"${spellcheckAttr} ${disabled ? "disabled" : ""}
        >
        <div class="dashboard-bank-cell-preview" data-bank-preview-field="${escapeAttr(fieldName)}">${escapeHtml(safeValue)}</div>
      </div>
    `;
  }

  function buildItemRowMarkup(item, index, { disabled = false } = {}) {
    const bankType = normalizeBankType(item?.item_type || getSelectedBankType());
    const fields = getItemFieldLabelsForType(bankType, { qcmDistractorCount: getCurrentQcmDistractorColumnCount() });
    const hasAnyValue = itemHasAnyValue(item, bankType);
    const invalidClass = hasAnyValue && itemIsIncomplete(item, bankType)
      ? "is-incomplete"
      : "";
    const isExpanded = expandedItemIndex === index;
    const expandedClass = isExpanded ? "is-expanded" : "";
    const expandLabel = isExpanded ? "Réduire la ligne" : "Déplier la ligne";

    const fieldMarkup = Object.entries(fields).map(([fieldName, label]) => buildItemFieldMarkup(fieldName, getItemFieldDisplayValue(item, fieldName), label, index, {
      disabled,
      spellcheck: true,
      extraClass: fieldName === "prompt" ? "dashboard-bank-cell-prompt" : ""
    })).join("");

    return `
      <div class="dashboard-bank-row dashboard-bank-row--${escapeAttr(bankType)} ${invalidClass} ${expandedClass}" data-item-index="${index}">
        <button
          class="dashboard-bank-row-number"
          type="button"
          data-bank-action="toggle-expand-row"
          aria-label="${escapeAttr(`${expandLabel} ${index + 1}`)}"
          aria-expanded="${isExpanded ? "true" : "false"}"
          title="${escapeAttr(expandLabel)}"
        >${index + 1}</button>
        ${fieldMarkup}
        <button class="dashboard-bank-row-delete" type="button" data-bank-action="delete-row" aria-label="Supprimer la question" title="Supprimer la question" ${disabled ? "disabled" : ""}>
          <span class="dashboard-material-icon" aria-hidden="true">delete</span>
        </button>
      </div>
    `;
  }
  function buildItemsRowsMarkup({ disabled = false } = {}) {
    if (!itemDrafts.length) {
      return `
        <div class="dashboard-bank-row-empty">
          Cette banque est vide. Ajoute une question ou importe une liste.
        </div>
      `;
    }

    return itemDrafts.map((item, index) => buildItemRowMarkup(item, index, { disabled })).join("");
  }

  function getRowOffsetBefore(index) {
    const safeIndex = Math.max(0, Math.min(itemDrafts.length, Math.trunc(Number(index) || 0)));
    let offset = safeIndex * BANK_ROW_HEIGHT;
    if (expandedItemIndex >= 0 && expandedItemIndex < safeIndex) {
      offset += BANK_ROW_EXPANDED_EXTRA;
    }
    return offset;
  }

  function getTotalRowsHeight() {
    return getRowOffsetBefore(itemDrafts.length);
  }

  function findRowIndexForOffset(offset) {
    const count = itemDrafts.length;
    if (!count) return 0;

    const safeOffset = Math.max(0, Number(offset) || 0);
    if (expandedItemIndex < 0) {
      return Math.max(0, Math.min(count - 1, Math.floor(safeOffset / BANK_ROW_HEIGHT)));
    }

    const expandedStart = expandedItemIndex * BANK_ROW_HEIGHT;
    if (safeOffset < expandedStart) {
      return Math.max(0, Math.min(count - 1, Math.floor(safeOffset / BANK_ROW_HEIGHT)));
    }

    if (safeOffset < expandedStart + BANK_ROW_EXPANDED_HEIGHT) {
      return expandedItemIndex;
    }

    const afterExpandedOffset = safeOffset - expandedStart - BANK_ROW_EXPANDED_HEIGHT;
    return Math.max(
      0,
      Math.min(count - 1, expandedItemIndex + 1 + Math.floor(afterExpandedOffset / BANK_ROW_HEIGHT))
    );
  }

  function getVisibleWindow(rowsHost = getItemsRowsHost()) {
    if (!itemDrafts.length) {
      return {
        startIndex: 0,
        endIndex: -1,
        beforeHeight: 0,
        afterHeight: 0
      };
    }

    if (!shouldVirtualizeRows()) {
      return {
        startIndex: 0,
        endIndex: itemDrafts.length - 1,
        beforeHeight: 0,
        afterHeight: 0
      };
    }

    const viewportHeight = Math.max(rowsHost?.clientHeight || 0, BANK_ROW_HEIGHT * 8);
    const scrollTop = Math.max(0, rowsHost?.scrollTop || 0);
    const startIndex = Math.max(0, findRowIndexForOffset(scrollTop) - BANK_ROWS_OVERSCAN);
    const endIndex = Math.min(
      itemDrafts.length - 1,
      findRowIndexForOffset(scrollTop + viewportHeight) + BANK_ROWS_OVERSCAN
    );

    return {
      startIndex,
      endIndex,
      beforeHeight: getRowOffsetBefore(startIndex),
      afterHeight: Math.max(0, getTotalRowsHeight() - getRowOffsetBefore(endIndex + 1))
    };
  }

  function buildVirtualizedItemsRowsMarkup({
    disabled = false,
    startIndex = 0,
    endIndex = itemDrafts.length - 1,
    beforeHeight = 0,
    afterHeight = 0
  } = {}) {
    if (!itemDrafts.length) {
      return buildItemsRowsMarkup({ disabled });
    }

    const visibleRows = [];
    for (let index = startIndex; index <= endIndex; index += 1) {
      visibleRows.push(buildItemRowMarkup(itemDrafts[index], index, { disabled }));
    }

    return `
      ${beforeHeight > 0 ? `<div class="dashboard-bank-table-spacer" style="height:${beforeHeight}px" aria-hidden="true"></div>` : ""}
      ${visibleRows.join("")}
      ${afterHeight > 0 ? `<div class="dashboard-bank-table-spacer" style="height:${afterHeight}px" aria-hidden="true"></div>` : ""}
    `;
  }

  function unbindRowsHostEvents() {
    if (tableScrollFrame) {
      window.cancelAnimationFrame(tableScrollFrame);
      tableScrollFrame = 0;
    }
    if (tableScrollHost) {
      tableScrollHost.removeEventListener("scroll", handleRowsHostScroll);
      tableScrollHost = null;
    }
    renderedWindowStart = -1;
    renderedWindowEnd = -1;
    renderedVirtualMode = false;
  }

  function bindRowsHostEvents() {
    const rowsHost = getItemsRowsHost();
    if (!rowsHost || tableScrollHost === rowsHost) return;
    unbindRowsHostEvents();
    tableScrollHost = rowsHost;
    rowsHost.addEventListener("scroll", handleRowsHostScroll, { passive: true });
  }

  function handleRowsHostScroll() {
    if (!shouldVirtualizeRows()) return;
    if (tableScrollFrame) return;
    tableScrollFrame = window.requestAnimationFrame(() => {
      tableScrollFrame = 0;
      refreshItemsTable({ preserveScroll: true });
    });
  }

  function renderEditor() {
    const bank = getSelectedBank();

    if (!bank) {
      renderBankHeaderMetaPanel();
      updateActionState();
      renderEmptyState();
      return;
    }

    bankEditorHost.innerHTML = buildEditorMarkup();
    renderBankHeaderMetaPanel();
    if (selectedBankIsEditableType()) {
      bindRowsHostEvents();
      refreshItemsTable({ preserveScroll: false, force: true });
    } else {
      unbindRowsHostEvents();
    }
    updateActionState();
    updateItemsSummaryUi();
    renderTableBusy();
  }

  function updateItemsSummaryUi() {
    const count = itemDrafts.length;
    const countLabel = bankEditorHost?.querySelector(".dashboard-bank-table-count");
    if (countLabel) {
      countLabel.textContent = `- ${count} question${count > 1 ? "s" : ""}`;
    }

    const previewButton = document.getElementById("btnBankPreview");
    if (previewButton) {
      previewButton.disabled = !count;
      if (!count) closePreviewPopup();
    }

    const previewInput = document.getElementById("bankPreviewIndexInput");
    if (previewInput) {
      previewInput.max = String(Math.max(1, count));
      previewInput.value = String(clampPreviewIndex(previewItemIndex) + 1);
    }
  }

  function syncTableColumnLayout() {
    const bankType = getSelectedBankType();
    if (!isQcmType(bankType)) return false;

    const table = bankEditorHost?.querySelector(".dashboard-bank-table--qcm");
    const head = table?.querySelector(".dashboard-bank-table-head");
    if (!table || !head) return false;

    const count = clampQcmDistractorCount(getCurrentQcmDistractorColumnCount());
    const countText = String(count);
    table.style.setProperty("--dashboard-bank-qcm-distractor-columns", countText);

    if (head.dataset.qcmDistractorCount === countText) return false;

    head.dataset.qcmDistractorCount = countText;
    head.innerHTML = getTableHeadsForType(bankType, { qcmDistractorCount: count })
      .map((headLabel) => `<div>${escapeHtml(headLabel)}</div>`)
      .join("");
    return true;
  }

  function refreshItemsTable({ preserveScroll = true, force = false } = {}) {
    const rowsHost = getItemsRowsHost();
    if (!rowsHost) {
      unbindRowsHostEvents();
      return;
    }

    bindRowsHostEvents();
    const tableStructureChanged = syncTableColumnLayout();
    force = force || tableStructureChanged;

    const scrollTop = rowsHost.scrollTop;
    const disabled = !canEditSelectedBankItems();
    if (!shouldVirtualizeRows()) {
      renderedVirtualMode = false;
      if (force || renderedWindowStart !== 0 || renderedWindowEnd !== itemDrafts.length - 1) {
        rowsHost.innerHTML = buildItemsRowsMarkup({ disabled });
        renderedWindowStart = itemDrafts.length ? 0 : -1;
        renderedWindowEnd = itemDrafts.length ? itemDrafts.length - 1 : -1;
        if (preserveScroll) {
          rowsHost.scrollTop = scrollTop;
        }
      }
    } else {
      const windowState = getVisibleWindow(rowsHost);
      const sameWindow = renderedVirtualMode
        && renderedWindowStart === windowState.startIndex
        && renderedWindowEnd === windowState.endIndex;

      if (force || !sameWindow) {
        rowsHost.innerHTML = buildVirtualizedItemsRowsMarkup({
          disabled,
          ...windowState
        });
        renderedWindowStart = windowState.startIndex;
        renderedWindowEnd = windowState.endIndex;
        renderedVirtualMode = true;
        if (preserveScroll) {
          rowsHost.scrollTop = scrollTop;
        }
      }
    }
    updateItemsSummaryUi();
    syncPreviewPopupContent();
    renderTableBusy();
  }

  function appendItemRow(index) {
    void index;
    refreshItemsTable({ preserveScroll: false, force: true });
  }

  function replaceItemRow(index) {
    if (!Number.isFinite(index) || !itemDrafts[index]) return;

    const rowsHost = getItemsRowsHost();
    const row = rowsHost?.querySelector(`.dashboard-bank-row[data-item-index="${index}"]`);
    if (!rowsHost || !row) {
      refreshItemsTable();
      return;
    }

    const template = document.createElement("template");
    template.innerHTML = buildItemRowMarkup(itemDrafts[index], index, {
      disabled: !canEditSelectedBankItems()
    }).trim();
    const nextRow = template.content.firstElementChild;
    if (!nextRow) return;
    row.replaceWith(nextRow);
  }

  function refreshRowIndex(row, index) {
    if (!row) return;
    row.dataset.itemIndex = String(index);
    const number = row.querySelector(".dashboard-bank-row-number");
    if (number) {
      const isExpanded = expandedItemIndex === index;
      const expandLabel = isExpanded ? "Réduire la ligne" : "Déplier la ligne";
      number.textContent = String(index + 1);
      number.setAttribute("aria-label", `${expandLabel} ${index + 1}`);
      number.setAttribute("aria-expanded", isExpanded ? "true" : "false");
      number.title = expandLabel;
    }

    Object.entries(getItemFieldLabelsForType(getSelectedBankType(), { qcmDistractorCount: getCurrentQcmDistractorColumnCount() })).forEach(([fieldName, label]) => {
      const input = row.querySelector(`[data-bank-field="${fieldName}"]`);
      input?.setAttribute("aria-label", `${label} ${index + 1}`);
    });
  }

  function renumberItemRows() {
    getItemsRowsHost()?.querySelectorAll(".dashboard-bank-row").forEach((row, index) => {
      refreshRowIndex(row, index);
    });
  }

  function deleteDraftItem(index) {
    if (!canEditSelectedBankItems() || !Number.isFinite(index) || !itemDrafts[index]) return;
    itemDrafts.splice(index, 1);
    if (expandedItemIndex === index) {
      expandedItemIndex = -1;
    } else if (expandedItemIndex > index) {
      expandedItemIndex -= 1;
    }
    previewItemIndex = clampPreviewIndex(previewItemIndex);
    setPendingChanges(true);
    refreshItemsTable({ force: true });
  }

  function syncMetaDraftFromInputs() {
    if (!metaDraft) return;
    metaDraft.subject = document.getElementById("bankSubjectInput")?.value ?? metaDraft.subject;
    metaDraft.grade_level = document.getElementById("bankGradeInput")?.value ?? metaDraft.grade_level;
    metaDraft.tags = normalizeTagsInput(document.getElementById("bankTagsInput")?.value ?? metaDraft.tags);
    metaDraft.description = document.getElementById("bankDescriptionInput")?.value ?? metaDraft.description;
  }

  function updateDraftItem(index, field, value) {
    const item = itemDrafts[index];
    if (!item) return;
    if (!item.payload_json || typeof item.payload_json !== "object" || Array.isArray(item.payload_json)) {
      item.payload_json = {};
    }

    if (field === "prompt") {
      item.prompt = String(value || "");
      if (isSelectionType(item.item_type || getSelectedBankType())) {
        const wordCount = tokenizeSelectionText(item.prompt).filter((token) => token.kind === "word").length;
        item.payload_json.expectedTokenIndexes = normalizeTokenIndexes(item.payload_json.expectedTokenIndexes, wordCount);
        item.payload_json.expectedSelectionText = formatSelectionIndexes(item.prompt, item.payload_json.expectedTokenIndexes);
      }
    } else if (field === "mainAnswer") {
      item.payload_json.mainAnswer = String(value || "");
    } else if (field === "acceptedAnswers") {
      item.payload_json.acceptedAnswers = acceptedAnswersFromText(value);
    } else if (field === "correctAnswer") {
      item.payload_json.correctAnswer = String(value || "");
    } else if (field === "expectedSelection") {
      const indexes = findTokenIndexesFromSelectionText(item.prompt || "", value);
      item.payload_json.expectedTokenIndexes = indexes;
      item.payload_json.expectedSelectionText = formatSelectionIndexes(item.prompt || "", indexes) || String(value || "");
    } else if (field === "distractors") {
      item.payload_json.distractors = normalizeQcmDistractors(value);
      removeLegacyDistractorFields(item.payload_json);
    } else if (/^distractor[1-5]$/.test(field)) {
      setQcmDistractorAt(item.payload_json, field, value);
    } else if (field === "explanation") {
      item.payload_json.explanation = String(value || "");
    }
    setPendingChanges(true);
  }
  function refreshRowFeedback(row, index) {
    const item = itemDrafts[index];
    if (!row || !item) return;

    const bankType = normalizeBankType(item.item_type || getSelectedBankType());
    const isIncomplete = itemHasAnyValue(item, bankType) && itemIsIncomplete(item, bankType);
    row.classList.toggle("is-incomplete", isIncomplete);
    syncRowPreview(row, index);

    if (index === previewItemIndex) {
      syncPreviewPopupContent();
    }
  }
  function itemHasAnyValue(item, bankType = DEFAULT_BANK_TYPE) {
    const payload = item?.payload_json || {};
    if (isSelectionType(bankType)) {
      return Boolean(
        String(item?.prompt || "").trim()
        || normalizeTokenIndexes(payload.expectedTokenIndexes, tokenizeSelectionText(item?.prompt || "").filter((token) => token.kind === "word").length).length
        || String(payload.expectedSelectionText || "").trim()
        || String(payload.explanation || "").trim()
      );
    }

    if (isQcmType(bankType)) {
      return Boolean(
        String(item?.prompt || "").trim()
        || String(payload.correctAnswer || "").trim()
        || distractorsFromFields(payload).join("").trim()
        || String(payload.explanation || "").trim()
      );
    }

    return Boolean(
      String(item?.prompt || "").trim()
      || String(payload.mainAnswer || "").trim()
      || acceptedAnswersToText(payload.acceptedAnswers).trim()
      || String(payload.explanation || "").trim()
    );
  }

  function itemIsIncomplete(item, bankType = DEFAULT_BANK_TYPE) {
    const payload = item?.payload_json || {};
    const prompt = String(item?.prompt || "").trim();

    if (isSelectionType(bankType)) {
      return !prompt
        || !normalizeTokenIndexes(payload.expectedTokenIndexes, tokenizeSelectionText(item?.prompt || "").filter((token) => token.kind === "word").length).length;
    }

    if (isQcmType(bankType)) {
      return !prompt
        || !String(payload.correctAnswer || "").trim()
        || !distractorsFromFields(payload).length;
    }

    return !prompt || !String(payload.mainAnswer || "").trim();
  }

  function getFirstMissingField(item, bankType = DEFAULT_BANK_TYPE) {
    const payload = item?.payload_json || {};
    if (isSelectionType(bankType)) {
      if (!String(item?.prompt || "").trim()) return "prompt";
      if (!normalizeTokenIndexes(payload.expectedTokenIndexes, tokenizeSelectionText(item?.prompt || "").filter((token) => token.kind === "word").length).length) return "expectedSelection";
      return "prompt";
    }

    if (!String(item?.prompt || "").trim()) return "prompt";

    if (isQcmType(bankType)) {
      if (!String(payload.correctAnswer || "").trim()) return "correctAnswer";
      if (!distractorsFromFields(payload).length) return "distractor1";
      return "prompt";
    }

    if (!String(payload.mainAnswer || "").trim()) return "mainAnswer";
    return "prompt";
  }

  function syncRowPreview(row, index) {
    const item = itemDrafts[index];
    if (!row || !item) return;

    Object.keys(getItemFieldLabelsForType(item.item_type || getSelectedBankType(), { qcmDistractorCount: getCurrentQcmDistractorColumnCount() })).forEach((fieldName) => {
      const value = getItemFieldDisplayValue(item, fieldName);
      const preview = row.querySelector(`[data-bank-preview-field="${fieldName}"]`);
      if (preview) {
        preview.textContent = value;
      }
      const input = row.querySelector(`[data-bank-field="${fieldName}"]`);
      if (input) {
        input.setAttribute("title", value);
        if (fieldName === "expectedSelection" && input.tagName === "BUTTON") {
          input.textContent = value || "Choisir…";
        }
      }
    });
  }

  function focusBankCell(rowIndex, fieldName = "prompt", { select = true } = {}) {
    const rowsHost = getItemsRowsHost();
    if (rowsHost && shouldVirtualizeRows()) {
      rowsHost.scrollTop = Math.max(0, getRowOffsetBefore(rowIndex) - (BANK_ROW_HEIGHT * 2));
      refreshItemsTable({ preserveScroll: true });
    }

    const field = bankEditorHost?.querySelector(
      `.dashboard-bank-row[data-item-index="${rowIndex}"] [data-bank-field="${fieldName}"]`
    );
    field?.focus();
    if (select && typeof field?.select === "function") {
      field.select();
    }
  }

  function addDraftItemAndFocus() {
    if (!canEditSelectedBankItems()) return;
    itemDrafts.push(createEmptyItem(getSelectedBank()?.bank_type));
    setPendingChanges(true);
    appendItemRow(itemDrafts.length - 1);
    focusBankCell(itemDrafts.length - 1, "prompt");
  }

  function toggleExpandedRow(index) {
    if (!Number.isFinite(index) || !itemDrafts[index]) return;
    expandedItemIndex = expandedItemIndex === index ? -1 : index;
    refreshItemsTable({ preserveScroll: true, force: true });
  }

  function closeMarkupHelpPopup() {
    const popup = document.getElementById("bankMarkupHelpPopup");
    const button = document.getElementById("btnBankMarkupHelp");
    if (!popup || !button) return;
    popup.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  function closePreviewPopup() {
    const popup = document.getElementById("bankPreviewPopup");
    const button = document.getElementById("btnBankPreview");
    if (!popup || !button) return;
    popup.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  function clampPreviewIndex(value) {
    const count = itemDrafts.length;
    if (!count) return 0;
    const numericValue = Math.trunc(Number(value));
    if (!Number.isFinite(numericValue)) return 0;
    return Math.max(0, Math.min(count - 1, numericValue));
  }

  function syncPreviewPopupContent() {
    const popup = document.getElementById("bankPreviewPopup");
    const content = document.getElementById("bankPreviewContent");
    const input = document.getElementById("bankPreviewIndexInput");
    if (!popup || popup.hidden || !content) return;

    previewItemIndex = clampPreviewIndex(previewItemIndex);
    const item = itemDrafts[previewItemIndex] || null;
    const payload = item?.payload_json || {};

    if (input) {
      input.max = String(Math.max(1, itemDrafts.length));
      input.value = String(previewItemIndex + 1);
    }

    if (!item) {
      content.innerHTML = `<div class="dashboard-bank-preview-empty">Aucune question à prévisualiser.</div>`;
      return;
    }

    if (isSelectionType(item.item_type)) {
      const expectedIndexes = normalizeTokenIndexes(payload.expectedTokenIndexes, tokenizeSelectionText(item.prompt || "").filter((token) => token.kind === "word").length);
      content.innerHTML = `
        <div class="dashboard-bank-preview-selection-text">${renderSelectionTextToHtml(item.prompt || "", {
          activeIndexes: expectedIndexes,
          activeKind: "correction",
          selectionMode: "continuous"
        }) || "<span>Énoncé vide</span>"}</div>
        ${String(payload.explanation || "").trim() ? `
          <div class="dashboard-bank-preview-explanation">${renderSimpleMarkupToHtml(payload.explanation)}</div>
        ` : ""}
      `;
      return;
    }

    if (isQcmType(item.item_type)) {
      const distractors = distractorsFromFields(payload);
      content.innerHTML = `
        <div class="dashboard-bank-preview-question">${renderSimpleMarkupToHtml(item.prompt || "") || "<span>Question vide</span>"}</div>
        <div class="dashboard-bank-preview-answers">
          <div><strong>Bonne réponse :</strong> ${renderSimpleMarkupToHtml(payload.correctAnswer || "") || "<span>vide</span>"}</div>
          ${distractors.length ? `<div><strong>Distracteurs :</strong> ${distractors.map((value) => renderSimpleMarkupToHtml(value)).join(" · ")}</div>` : ""}
        </div>
        ${String(payload.explanation || "").trim() ? `
          <div class="dashboard-bank-preview-explanation">${renderSimpleMarkupToHtml(payload.explanation)}</div>
        ` : ""}
      `;
      return;
    }

    content.innerHTML = `
      <div class="dashboard-bank-preview-question">${renderSimpleMarkupToHtml(item.prompt || "") || "<span>Question vide</span>"}</div>
      ${String(payload.explanation || "").trim() ? `
        <div class="dashboard-bank-preview-explanation">${renderSimpleMarkupToHtml(payload.explanation)}</div>
      ` : ""}
    `;
  }

  function openSelectionPicker(index) {
    if (!canEditSelectedBankItems() || !Number.isFinite(index) || !isSelectionType(getSelectedBankType()) || !itemDrafts[index]) return;
    const item = itemDrafts[index];
    const payload = item.payload_json || {};
    const wordCount = tokenizeSelectionText(item.prompt || "").filter((token) => token.kind === "word").length;
    let draftIndexes = normalizeTokenIndexes(payload.expectedTokenIndexes, wordCount);

    const overlay = document.createElement("div");
    overlay.className = "dashboard-selection-picker-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div class="dashboard-selection-picker-card">
        <div class="dashboard-selection-picker-header">
          <div>
            <div class="dashboard-selection-picker-title">Choisir les mots attendus</div>
            <div class="dashboard-selection-picker-subtitle">Clique sur les mots de l’énoncé pour définir la correction.</div>
          </div>
          <button class="dashboard-selection-picker-close dashboard-material-icon-btn" type="button" aria-label="Fermer">
            <span class="dashboard-material-icon" aria-hidden="true">close</span>
          </button>
        </div>
        <div class="dashboard-selection-picker-text" id="selectionPickerText"></div>
        <div class="dashboard-selection-picker-footer">
          <div id="selectionPickerSummary" class="dashboard-selection-picker-summary"></div>
          <div class="dashboard-selection-picker-actions">
            <button class="btn" type="button" data-selection-picker-action="clear">Effacer</button>
            <button class="btn" type="button" data-selection-picker-action="cancel">Annuler</button>
            <button class="btn primary" type="button" data-selection-picker-action="apply">Valider la sélection</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const textHost = overlay.querySelector("#selectionPickerText");
    const summary = overlay.querySelector("#selectionPickerSummary");

    const renderPickerText = () => {
      if (textHost) {
        textHost.innerHTML = renderSelectionTextToHtml(item.prompt || "", {
          activeIndexes: draftIndexes,
          activeKind: "selected",
          selectionMode: "continuous",
          interactive: true,
          ariaPrefix: "Mot à sélectionner"
        });
      }
      if (summary) {
        summary.textContent = draftIndexes.length
          ? `Sélection : ${formatSelectionIndexes(item.prompt || "", draftIndexes)}`
          : "Aucun mot sélectionné.";
      }
    };

    const close = () => overlay.remove();
    renderPickerText();

    overlay.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const token = target.closest("[data-selection-token-index]");
      if (token && textHost?.contains(token)) {
        const tokenIndex = Number(token.dataset.selectionTokenIndex);
        if (Number.isFinite(tokenIndex)) {
          const set = new Set(draftIndexes);
          if (set.has(tokenIndex)) set.delete(tokenIndex);
          else set.add(tokenIndex);
          draftIndexes = normalizeTokenIndexes(Array.from(set), wordCount);
          renderPickerText();
        }
        return;
      }

      if (target.closest(".dashboard-selection-picker-close") || target.closest('[data-selection-picker-action="cancel"]')) {
        close();
        return;
      }

      if (target.closest('[data-selection-picker-action="clear"]')) {
        draftIndexes = [];
        renderPickerText();
        return;
      }

      if (target.closest('[data-selection-picker-action="apply"]')) {
        item.payload_json.expectedTokenIndexes = normalizeTokenIndexes(draftIndexes, wordCount);
        item.payload_json.expectedSelectionText = formatSelectionIndexes(item.prompt || "", item.payload_json.expectedTokenIndexes);
        setPendingChanges(true);
        close();
        refreshItemsTable({ preserveScroll: true, force: true });
        focusBankCell(index, "prompt", { select: false });
      }
    });

    overlay.addEventListener("keydown", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const token = target?.closest("[data-selection-token-index]");
      if (token && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        token.click();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    });

    overlay.querySelector("[data-selection-token-index]")?.focus?.();
  }

  function itemDraftIsEmpty(item) {
    return !itemHasAnyValue(item, item?.item_type || getSelectedBankType());
  }
  function maybeImportFromCellPaste(event, index) {
    if (!canEditSelectedBankItems()) return false;

    const text = event.clipboardData?.getData("text/plain") || "";
    if (!text.trim() || !/[|\t]/.test(text)) return false;

    const { imported } = parseBankImportText(text, getSelectedBankType());
    if (!imported.length) return false;

    event.preventDefault();
    const replacement = imported.map(normalizeItemDraft);
    const insertIndex = Number.isFinite(index) ? Math.max(0, index) : itemDrafts.length;
    expandedItemIndex = -1;

    if (itemDraftIsEmpty(itemDrafts[insertIndex])) {
      itemDrafts.splice(insertIndex, 1, ...replacement);
    } else {
      itemDrafts.splice(insertIndex + 1, 0, ...replacement);
    }

    setPendingChanges(true);
    refreshItemsTable({ force: true });
    focusBankCell(insertIndex, "prompt");
    showToast?.(`${replacement.length} question${replacement.length > 1 ? "s" : ""} ajoutée${replacement.length > 1 ? "s" : ""}.`);
    return true;
  }

  async function deleteSelectedBank() {
    const bank = getSelectedBank();
    if (!bank || bank.is_system === true || isSaving) return;

    const ok = window.confirm(`Supprimer la banque « ${bank.title} » ?`);
    if (!ok) return;

    try {
      await deleteQuestionBank(bank.id);
      selectedBankId = null;
      selectedBank = null;
      itemDrafts = [];
      metaDraft = null;
      expandedItemIndex = -1;
      setPendingChanges(false);
      await refresh({ forceRefresh: true });
    } catch (err) {
      showToast?.(err?.message || "Impossible de supprimer la banque.", { isError: true });
    }
  }

  function syncBankMetaExpansionUi() {
    const bank = getSelectedBank();
    const canShowMeta = Boolean(bank && metaDraft);
    const metaPanel = document.getElementById("bankEditorMetaPanel");
    const button = document.getElementById("btnToggleBankMeta");
    const label = isMetaExpanded
      ? "Masquer les informations facultatives"
      : "Afficher les informations facultatives";
    const title = isMetaExpanded
      ? "Masquer matière, niveau, tags et description"
      : "Afficher matière, niveau, tags et description";

    if (metaPanel) metaPanel.hidden = !canShowMeta || !isMetaExpanded;
    if (button) {
      button.disabled = !canShowMeta;
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-expanded", String(isMetaExpanded));
      button.title = title;
    }
  }

  function togglePreviewPopup() {
    const popup = document.getElementById("bankPreviewPopup");
    const button = document.getElementById("btnBankPreview");
    if (!popup || !button || !itemDrafts.length) return;

    previewItemIndex = clampPreviewIndex(previewItemIndex);
    const nextOpen = popup.hidden;
    popup.hidden = !nextOpen;
    button.setAttribute("aria-expanded", String(nextOpen));
    if (nextOpen) {
      syncPreviewPopupContent();
      document.getElementById("bankPreviewIndexInput")?.focus();
    }
  }

  function toggleMarkupHelpPopup() {
    const popup = document.getElementById("bankMarkupHelpPopup");
    const button = document.getElementById("btnBankMarkupHelp");
    if (!popup || !button) return;

    const nextOpen = popup.hidden;
    popup.hidden = !nextOpen;
    button.setAttribute("aria-expanded", String(nextOpen));
  }

  async function copySelectedSystemBank() {
    const bank = getSelectedBank();
    if (!bank || bank.is_system !== true) return;

    const teacherSpace = getCurrentTeacherSpace?.();
    if (!teacherSpace?.id) return;
    try {
      const newTitle = buildUniqueBankTitle(banks, bank.title);
      const { bank: copiedBank } = await copyQuestionBankToSpace(bank.id, teacherSpace.id, {
        title: newTitle,
        folder_id: currentOpenFolderId,
        display_order: getNextBankOrderForFolder(currentOpenFolderId)
      });
      await refresh({ forceRefresh: true, preferredBankId: copiedBank.id });
      showToast?.("Copie personnelle créée.");
    } catch (err) {
      showToast?.(err?.message || "Impossible de copier la banque.", { isError: true });
    }
  }

  function handleEditorInput(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const field = target.closest("[data-bank-field]");
    if (field) {
      const row = field.closest(".dashboard-bank-row");
      const index = Number(row?.dataset?.itemIndex);
      const shouldTrackQcmColumns = isQcmType(getSelectedBankType()) && /^distractor[1-5]$/.test(field.dataset.bankField || "");
      const previousQcmColumnCount = shouldTrackQcmColumns ? getCurrentQcmDistractorColumnCount() : 0;
      updateDraftItem(index, field.dataset.bankField, field.value);
      if (shouldTrackQcmColumns && previousQcmColumnCount !== getCurrentQcmDistractorColumnCount()) {
        const fieldName = field.dataset.bankField;
        window.requestAnimationFrame(() => {
          refreshItemsTable({ preserveScroll: true, force: true });
          focusBankCell(index, fieldName, { select: false });
        });
        return;
      }
      refreshRowFeedback(row, index);
      return;
    }

    if (target.id === "bankPreviewIndexInput") {
      previewItemIndex = clampPreviewIndex(Number(target.value) - 1);
      syncPreviewPopupContent();
      return;
    }

    if (META_INPUT_IDS.has(target.id)) {
      syncMetaDraftFromInputs();
      setPendingChanges(true);
    }
  }

  function handleEditorClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const button = target.closest("button");
    if (button?.disabled) return;

    const expandButton = target.closest("[data-bank-action=\"toggle-expand-row\"]");
    if (expandButton) {
      const row = expandButton.closest(".dashboard-bank-row");
      toggleExpandedRow(Number(row?.dataset?.itemIndex));
      return;
    }

    const deleteButton = target.closest("[data-bank-action=\"delete-row\"]");
    if (deleteButton) {
      const row = deleteButton.closest(".dashboard-bank-row");
      deleteDraftItem(Number(row?.dataset?.itemIndex));
      return;
    }

    const selectionPickerButton = target.closest('[data-bank-action="pick-selection"]');
    if (selectionPickerButton) {
      const row = selectionPickerButton.closest(".dashboard-bank-row");
      openSelectionPicker(Number(row?.dataset?.itemIndex));
      return;
    }

    if (target.closest("#btnAddBankItem")) {
      addDraftItemAndFocus();
      return;
    }

    if (target.closest("#btnImportBank")) {
      openImportModal();
      return;
    }

    if (target.closest("#btnExportEditBank")) {
      openExportEditOverlay();
      return;
    }

    if (target.closest("#btnBankPreview")) {
      togglePreviewPopup();
      return;
    }

    if (target.closest("#btnBankMarkupHelp")) {
      toggleMarkupHelpPopup();
      return;
    }

    if (target.closest("#btnToggleBankMeta")) {
      isMetaExpanded = !isMetaExpanded;
      syncBankMetaExpansionUi();
      return;
    }

    if (target.closest("#btnCopySystemBank")) {
      void copySelectedSystemBank();
    }
  }

  function handleEditorKeydown(event) {
    const target = event.target instanceof Element ? event.target : null;
    const field = target?.closest("[data-bank-field]");
    if (!field) return;

    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      addDraftItemAndFocus();
    }
  }

  function handleEditorPaste(event) {
    const target = event.target instanceof Element ? event.target : null;
    const field = target?.closest("[data-bank-field]");
    if (!field || field.dataset.bankField !== "prompt") return;

    const row = field.closest(".dashboard-bank-row");
    const index = Number(row?.dataset?.itemIndex);
    maybeImportFromCellPaste(event, index);
  }

  async function selectBank(bankId, { forceReload = false } = {}) {
    if (hasPendingChanges && !forceReload && !window.confirm("Des modifications non enregistrées existent. Changer de banque ?")) {
      return false;
    }

    selectedBankId = bankId;
    selectedBank = banks.find((bank) => String(bank.id) === String(bankId)) || null;
    metaDraft = selectedBank ? {
      title: selectedBank.title || "",
      description: selectedBank.description || "",
      subject: selectedBank.subject || "",
      grade_level: selectedBank.grade_level || "",
      tags: Array.isArray(selectedBank.tags) ? [...selectedBank.tags] : []
    } : null;
    isMetaExpanded = hasOptionalMeta(metaDraft);
    previewItemIndex = 0;
    expandedItemIndex = -1;
    itemDrafts = [];
    hasPendingChanges = false;
    setBankViewMode("editor");
    setTableBusy(Boolean(selectedBank), "Chargement des questions…");
    setSaveStatus(selectedBank ? "loading" : "idle", selectedBank ? "Chargement de la banque…" : "Aucune banque sélectionnée");
    updateActionState();
    renderEditor();

    if (!selectedBank) return false;

    try {
      const items = await listQuestionBankItems(selectedBank.id);
      itemDrafts = items.map(normalizeItemDraft);
      hasPendingChanges = false;
      setTableBusy(false);
      setSaveStatus(selectedBank.is_system === true ? "readonly" : "saved", selectedBank.is_system === true ? "Banque proposée en lecture seule" : "Banque chargée");
      updateActionState();
      renderEditor();
      return true;
    } catch (err) {
      setTableBusy(false);
      setSaveStatus("error", err?.message || "Impossible de charger les items.");
      renderEmptyState(err?.message || "Impossible de charger les questions.");
      return false;
    }
  }

  async function refresh({ forceRefresh = false, preferredBankId = null } = {}) {
    if (isRendering) return;
    const teacherSpace = getCurrentTeacherSpace?.();
    if (!teacherSpace?.id) {
      selectedBankId = null;
      selectedBank = null;
      itemDrafts = [];
      metaDraft = null;
      expandedItemIndex = -1;
      bankFolders = [];
      setTableBusy(false);
      setPendingChanges(false);
      setBankViewMode("explorer");
      if (banksList) {
        renderBankBreadcrumb(buildBankTreeState());
        banksList.innerHTML = `<div class="dashboard-activity-empty-state">Crée d’abord ton espace enseignant.</div>`;
      }
      renderEmptyState("Crée d’abord ton espace enseignant.");
      return;
    }

    if (hasPendingChanges && !forceRefresh && selectedBankId && bankViewMode === "editor") {
      renderEditor();
      return;
    }

    isRendering = true;
    try {
      const [nextBanks, nextFolders] = await Promise.all([
        listQuestionBanksForSpace(teacherSpace.id, { includeSystem: true }),
        listQuestionBankFoldersForSpace(teacherSpace.id)
      ]);
      banks = Array.isArray(nextBanks) ? nextBanks : [];
      bankFolders = Array.isArray(nextFolders) ? nextFolders : [];
      syncCollapsedBankFolders();
      sanitizeCurrentFolderSelection(buildBankTreeState());

      if (preferredBankId) {
        renderExplorer();
        await selectBank(preferredBankId, { forceReload: true });
      } else if (bankViewMode === "editor" && selectedBankId && banks.some((bank) => String(bank.id) === String(selectedBankId))) {
        await selectBank(selectedBankId, { forceReload: true });
      } else {
        selectedBankId = null;
        selectedBank = null;
        itemDrafts = [];
        metaDraft = null;
        expandedItemIndex = -1;
        setTableBusy(false);
        setPendingChanges(false);
        setSaveStatus("idle", "Aucune banque sélectionnée");
        setBankViewMode("explorer");
        renderExplorer();
        renderEditor();
      }
    } catch (err) {
      setTableBusy(false);
      setBankViewMode("explorer");
      if (banksList) {
        banksList.innerHTML = `<div class="dashboard-activity-empty-state is-error">${escapeHtml(err?.message || "Impossible de charger les banques.")}</div>`;
      }
      setSaveStatus("error", "Erreur de chargement");
      renderEmptyState("Impossible de charger les banques. Vérifie que le SQL des banques a été exécuté dans Supabase.");
    } finally {
      isRendering = false;
    }
  }

  async function createBank({ title, bankType } = {}) {
    const teacherSpace = getCurrentTeacherSpace?.();
    if (!teacherSpace?.id) return;

    const safeType = isEditableBankType(bankType) ? normalizeBankType(bankType) : DEFAULT_BANK_TYPE;
    const safeTitle = String(title || "").trim();
    if (!safeTitle) {
      throw new Error("Nom de banque vide.");
    }

    const bank = await createQuestionBankForSpace(teacherSpace.id, {
      title: safeTitle,
      bank_type: safeType,
      folder_id: currentOpenFolderId,
      display_order: getNextBankOrderForFolder(currentOpenFolderId)
    });
    await refresh({ forceRefresh: true, preferredBankId: bank.id });
    if (String(selectedBankId) === String(bank.id) && !itemDrafts.length && selectedBankIsEditableType()) {
      itemDrafts = [createEmptyItem(bank.bank_type || DEFAULT_BANK_TYPE)];
      setSaveStatus("saved", "Nouvelle banque créée");
      updateActionState();
      renderEditor();
      focusBankCell(0, "prompt");
    }
  }

  function openCreateBankOverlay() {
    const teacherSpace = getCurrentTeacherSpace?.();
    if (!teacherSpace?.id) return;

    const currentFilter = normalizeBankTypeFilter(currentBankTypeFilter);
    let selectedType = getInitialBankCreationTypeFromFilter(currentFilter);
    const overlay = document.createElement("div");
    overlay.className = "modal dashboard-create-activity-modal";
    overlay.innerHTML = `
      <div class="modal-content modal-content-wide">
        <div class="modal-title">Créer une banque</div>

        <div class="dashboard-create-activity-section">
          <div class="dashboard-create-activity-label">Type de banque</div>
          <div class="dashboard-mode-choice-grid" role="radiogroup" aria-label="Type de la nouvelle banque">
            ${BANK_CREATION_TYPE_VALUES.map((type) => {
              const isSelected = selectedType === type;
              return `
                <button
                  class="btn dashboard-mode-choice-btn dashboard-create-activity-mode-btn${isSelected ? " is-selected" : ""}"
                  type="button"
                  role="radio"
                  aria-checked="${isSelected ? "true" : "false"}"
                  data-create-bank-type="${escapeAttr(type)}"
                >
                  ${escapeHtml(getBankTypeLabel(type))}
                </button>
              `;
            }).join("")}
          </div>
        </div>

        <label class="dashboard-create-activity-section" for="bankCreationNameInput">
          <span class="dashboard-create-activity-label">Nom de la banque</span>
          <input
            id="bankCreationNameInput"
            class="modal-text-input"
            type="text"
            placeholder="Nom de la banque"
            autocomplete="off"
          >
        </label>

        <div class="modal-actions">
          <div id="bankCreationMessage" class="modal-message"></div>
          <button class="btn" id="bankCreationCancel" type="button">Annuler</button>
          <button class="btn primary" id="bankCreationConfirm" type="button" disabled>Créer</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const input = overlay.querySelector("#bankCreationNameInput");
    const message = overlay.querySelector("#bankCreationMessage");
    const confirmButton = overlay.querySelector("#bankCreationConfirm");
    const cancelButton = overlay.querySelector("#bankCreationCancel");
    const typeButtons = Array.from(overlay.querySelectorAll("[data-create-bank-type]"));

    function setMessageText(text = "", isError = false) {
      if (!message) return;
      message.textContent = text;
      message.classList.toggle("is-error", !!isError);
    }

    function updateTypeButtons() {
      typeButtons.forEach((btn) => {
        const type = normalizeBankType(btn.dataset.createBankType || DEFAULT_BANK_TYPE);
        const isSelected = selectedType === type;
        btn.classList.toggle("is-selected", isSelected);
        btn.setAttribute("aria-checked", isSelected ? "true" : "false");
      });
    }

    function updateConfirmState() {
      const name = String(input?.value || "").trim();
      const nameExists = Boolean(name && bankTitleAlreadyExists(banks, name));
      const canCreate = Boolean(selectedType && name && !nameExists);
      if (confirmButton) {
        confirmButton.disabled = !canCreate;
      }

      if (nameExists) {
        setMessageText("Une banque porte déjà ce nom.", true);
      } else if (message?.textContent === "Une banque porte déjà ce nom.") {
        setMessageText("");
      }
    }

    function setBusy(isBusy) {
      typeButtons.forEach((btn) => {
        btn.disabled = isBusy;
      });
      if (input) input.disabled = isBusy;
      if (cancelButton) cancelButton.disabled = isBusy;
      if (confirmButton) confirmButton.disabled = isBusy || !selectedType || !String(input?.value || "").trim();
    }

    function close() {
      overlay.remove();
    }

    async function submit() {
      const name = String(input?.value || "").trim();

      if (!selectedType) {
        setMessageText("Choisis un type de banque.", true);
        return;
      }

      if (!name) {
        setMessageText("Entre un nom de banque.", true);
        input?.focus();
        return;
      }

      if (bankTitleAlreadyExists(banks, name)) {
        setMessageText("Une banque porte déjà ce nom.", true);
        input?.focus();
        input?.select?.();
        return;
      }

      setBusy(true);
      setMessageText("Création de la banque…");

      try {
        await createBank({ title: name, bankType: selectedType });
        close();
      } catch (err) {
        setMessageText(err?.message || "Impossible de créer la banque.", true);
        setBusy(false);
        updateConfirmState();
      }
    }

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });

    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        void submit();
      }
    });

    typeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const nextType = normalizeBankType(btn.dataset.createBankType || DEFAULT_BANK_TYPE);
        selectedType = isEditableBankType(nextType) ? nextType : DEFAULT_BANK_TYPE;
        setMessageText("");
        updateTypeButtons();
        updateConfirmState();
        input?.focus();
      });
    });

    input?.addEventListener("input", () => {
      setMessageText("");
      updateConfirmState();
    });

    cancelButton?.addEventListener("click", close);
    confirmButton?.addEventListener("click", () => {
      void submit();
    });

    updateTypeButtons();
    updateConfirmState();
    input?.focus();
  }

  async function saveBank() {
    const bank = getSelectedBank();
    if (!bank || bank.is_system === true || isSaving) return;
    syncMetaDraftFromInputs();

    const title = String(metaDraft?.title || "").trim();
    if (!title) {
      showToast?.("Le titre de la banque est obligatoire.", { isError: true });
      setSaveStatus("error", "Titre obligatoire");
      document.getElementById("btnRenameBankFromHeader")?.focus();
      return;
    }

    const shouldSaveItems = isEditableBankType(bank.bank_type);
    const invalidIndex = shouldSaveItems
      ? itemDrafts.findIndex((item) => {
          const bankType = normalizeBankType(item.item_type || bank.bank_type);
          return itemHasAnyValue(item, bankType) && itemIsIncomplete(item, bankType);
        })
      : -1;

    if (invalidIndex >= 0) {
      showToast?.(`La question ${invalidIndex + 1} est incomplète.`, { isError: true });
      setSaveStatus("error", `Question ${invalidIndex + 1} incomplète`);
      focusBankCell(invalidIndex, getFirstMissingField(itemDrafts[invalidIndex], itemDrafts[invalidIndex]?.item_type || bank.bank_type));
      return;
    }

    isSaving = true;
    setSaveStatus("saving", "Enregistrement…");
    setPendingChanges(hasPendingChanges);
    try {
      const updatedBank = await updateQuestionBank(bank.id, {
        title,
        description: metaDraft.description,
        subject: metaDraft.subject,
        grade_level: metaDraft.grade_level,
        tags: metaDraft.tags,
        bank_type: bank.bank_type || DEFAULT_BANK_TYPE
      });
      const updatedItems = shouldSaveItems
        ? await replaceQuestionBankItems(bank.id, itemDrafts)
        : itemDrafts;
      banks = banks.map((item) => String(item.id) === String(updatedBank.id) ? updatedBank : item);
      selectedBank = updatedBank;
      selectedBankId = updatedBank.id;
      metaDraft = {
        title: updatedBank.title || "",
        description: updatedBank.description || "",
        subject: updatedBank.subject || "",
        grade_level: updatedBank.grade_level || "",
        tags: Array.isArray(updatedBank.tags) ? [...updatedBank.tags] : []
      };
      itemDrafts = updatedItems.map(normalizeItemDraft);
      hasPendingChanges = false;
      setSaveStatus("saved", "Banque enregistrée");
      renderBankHeaderMetaPanel();
      updateActionState();
      renderBanksList();
      if (shouldSaveItems) {
        refreshItemsTable({ force: true });
      } else {
        renderEditor();
      }
      showToast?.("Banque enregistrée.");
    } catch (err) {
      setSaveStatus("error", "Erreur de sauvegarde");
      showToast?.(err?.message || "Impossible d’enregistrer la banque.", { isError: true });
    } finally {
      isSaving = false;
      updateActionState();
    }
  }

  function openImportModal() {
    if (!getSelectedBank() || !canEditSelectedBankItems()) return;
    importInput.value = "";
    importMessage.textContent = isSelectionType(getSelectedBankType())
      ? "Colle une liste avec 3 colonnes : Énoncé | Sélection attendue | Explication."
      : isQcmType(getSelectedBankType())
        ? "Colle une liste avec 4 colonnes : Question | Réponse correcte | Distracteurs | Explication. Sépare les distracteurs par des points-virgules."
        : "Colle une liste avec 2 à 4 colonnes : Question | Réponse | Réponses acceptées | Explication.";
    importMessage.classList.remove("is-error");
    if (importPreview) {
      importPreview.innerHTML = "";
      importPreview.hidden = true;
    }
    importModal?.classList.remove("hidden");
    importModal?.setAttribute("aria-hidden", "false");
    window.setTimeout(() => importInput?.focus(), 0);
  }

  function closeImportModal() {
    importModal?.classList.add("hidden");
    importModal?.setAttribute("aria-hidden", "true");
  }

  function renderImportPreview(imported = [], errors = []) {
    if (!importPreview) return;

    if (!imported.length && !errors.length) {
      importPreview.innerHTML = "";
      importPreview.hidden = true;
      return;
    }

    const rows = imported.slice(0, 5).map((item, index) => `
      <div class="dashboard-bank-import-preview-row">
        <span>${index + 1}</span>
        <strong>${escapeHtml(item.prompt)}</strong>
        <em>${escapeHtml(isSelectionType(item.item_type) ? item.payload_json?.expectedSelectionText || formatSelectionIndexes(item.prompt || "", item.payload_json?.expectedTokenIndexes || []) : isQcmType(item.item_type) ? item.payload_json?.correctAnswer || "" : item.payload_json?.mainAnswer || "")}</em>
      </div>
    `).join("");
    const more = imported.length > 5
      ? `<div class="dashboard-bank-import-preview-more">+ ${imported.length - 5} autre${imported.length - 5 > 1 ? "s" : ""} question${imported.length - 5 > 1 ? "s" : ""}</div>`
      : "";
    const errorMarkup = errors.length
      ? `<div class="dashboard-bank-import-preview-errors">${escapeHtml(errors.slice(0, 2).join(" · "))}${errors.length > 2 ? "…" : ""}</div>`
      : "";

    importPreview.hidden = false;
    importPreview.innerHTML = `
      ${rows ? `<div class="dashboard-bank-import-preview-title">Aperçu</div>${rows}${more}` : ""}
      ${errorMarkup}
    `;
  }

  function updateImportPreview() {
    const { imported, errors } = parseBankImportText(importInput?.value || "", getSelectedBankType());
    importMessage.classList.toggle("is-error", imported.length === 0 && !!importInput?.value?.trim());
    importMessage.textContent = imported.length
      ? `${imported.length} question${imported.length > 1 ? "s" : ""} détectée${imported.length > 1 ? "s" : ""}${errors.length ? ` · ${errors.length} ligne${errors.length > 1 ? "s" : ""} ignorée${errors.length > 1 ? "s" : ""}` : ""}.`
        : errors.length
          ? `${errors.length} ligne${errors.length > 1 ? "s" : ""} ignorée${errors.length > 1 ? "s" : ""}.`
          : isSelectionType(getSelectedBankType())
          ? "Colle une liste avec 3 colonnes : Énoncé | Sélection attendue | Explication."
          : isQcmType(getSelectedBankType())
            ? "Colle une liste avec 4 colonnes : Question | Réponse correcte | Distracteurs | Explication. Sépare les distracteurs par des points-virgules."
            : "Colle une liste avec 2 à 4 colonnes : Question | Réponse | Réponses acceptées | Explication.";
    renderImportPreview(imported, errors);
  }

  function confirmImport() {
    if (!canEditSelectedBankItems()) return;
    const { imported, errors } = parseBankImportText(importInput?.value || "", getSelectedBankType());
    if (!imported.length) {
      importMessage.textContent = "Aucune question valide détectée.";
      importMessage.classList.add("is-error");
      renderImportPreview([], errors);
      return;
    }

    const normalizedImported = imported.map(normalizeItemDraft);
    expandedItemIndex = -1;
    if (itemDrafts.length === 1 && itemDraftIsEmpty(itemDrafts[0])) {
      itemDrafts = normalizedImported;
    } else {
      itemDrafts.push(...normalizedImported);
    }
    setPendingChanges(true);
    refreshItemsTable({ preserveScroll: false, force: true });
    closeImportModal();
    showToast?.(`${imported.length} question${imported.length > 1 ? "s" : ""} ajoutée${imported.length > 1 ? "s" : ""}.${errors.length ? ` ${errors.length} ligne(s) ignorée(s).` : ""}`);
  }

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function buildExportFilename() {
    const bank = getSelectedBank();
    const title = String(bank?.title || "banque")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "banque";
    return `${title}.txt`;
  }

  function insertTextAtSelection(textarea, text) {
    if (!textarea) return;
    const start = Number.isFinite(textarea.selectionStart) ? textarea.selectionStart : textarea.value.length;
    const end = Number.isFinite(textarea.selectionEnd) ? textarea.selectionEnd : start;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    textarea.value = `${before}${text}${after}`;
    const nextPosition = start + String(text || "").length;
    textarea.focus();
    textarea.setSelectionRange(nextPosition, nextPosition);
  }

  function openExportEditOverlay() {
    const bank = getSelectedBank();
    if (!bank || !selectedBankIsEditableType()) return;

    const canApplyChanges = canEditSelectedBankItems();
    const overlay = document.createElement("div");
    overlay.className = "modal dashboard-bank-export-modal";
    overlay.setAttribute("aria-hidden", "false");
    overlay.innerHTML = `
      <div class="modal-content modal-content-wide dashboard-bank-export-modal-card" role="dialog" aria-modal="true" aria-labelledby="bankExportEditorTitle">
        <div class="dashboard-bank-export-header">
          <div>
            <div id="bankExportEditorTitle" class="modal-title">Exporter / éditer</div>
            <div class="dashboard-bank-export-subtitle">Une question par ligne, colonnes séparées par <code>|</code>. Ce texte peut être recollé dans l’import.</div>
          </div>
          <button class="dashboard-icon-btn dashboard-material-icon-btn dashboard-bank-export-close" type="button" aria-label="Fermer">
            <span class="dashboard-material-icon" aria-hidden="true">close</span>
          </button>
        </div>

        <div class="dashboard-bank-export-toolbar" role="toolbar" aria-label="Actions de texte">
          <button id="btnBankRawCopy" class="btn" type="button">
            <span class="dashboard-material-icon" aria-hidden="true">content_copy</span>
            <span>Copier</span>
          </button>
          <button id="btnBankRawPaste" class="btn" type="button">
            <span class="dashboard-material-icon" aria-hidden="true">content_paste</span>
            <span>Coller</span>
          </button>
          <button id="btnBankRawDownload" class="btn" type="button">
            <span class="dashboard-material-icon" aria-hidden="true">download</span>
            <span>Fichier .txt</span>
          </button>
        </div>

        <div class="dashboard-bank-export-search">
          <input id="bankRawSearchInput" class="dashboard-bank-input" type="search" placeholder="Rechercher" autocomplete="off">
          <input id="bankRawReplaceInput" class="dashboard-bank-input" type="text" placeholder="Remplacer par" autocomplete="off">
          <button id="btnBankRawFindPrev" class="dashboard-icon-btn dashboard-material-icon-btn" type="button" title="Occurrence précédente" aria-label="Occurrence précédente">
            <span class="dashboard-material-icon" aria-hidden="true">keyboard_arrow_up</span>
          </button>
          <button id="btnBankRawFindNext" class="dashboard-icon-btn dashboard-material-icon-btn" type="button" title="Occurrence suivante" aria-label="Occurrence suivante">
            <span class="dashboard-material-icon" aria-hidden="true">keyboard_arrow_down</span>
          </button>
          <button id="btnBankRawReplaceOne" class="btn" type="button">Remplacer</button>
          <button id="btnBankRawReplaceAll" class="btn" type="button">Tout remplacer</button>
        </div>

        <textarea id="bankRawEditorInput" class="dashboard-bank-export-input" spellcheck="true"></textarea>

        <div class="modal-actions dashboard-bank-export-actions">
          <div id="bankRawEditorMessage" class="modal-message"></div>
          <button id="btnBankRawCancel" class="btn" type="button">Fermer</button>
          <button id="btnBankRawApply" class="btn primary" type="button" ${canApplyChanges ? "" : "disabled"}>Appliquer à la banque</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const textarea = overlay.querySelector("#bankRawEditorInput");
    const message = overlay.querySelector("#bankRawEditorMessage");
    const searchInput = overlay.querySelector("#bankRawSearchInput");
    const replaceInput = overlay.querySelector("#bankRawReplaceInput");
    const applyButton = overlay.querySelector("#btnBankRawApply");

    if (textarea) {
      textarea.value = serializeBankItemsForExport(itemDrafts, getSelectedBankType());
    }

    function setRawMessage(text = "", isError = false) {
      if (!message) return;
      message.textContent = text;
      message.classList.toggle("is-error", !!isError);
    }

    function close() {
      overlay.remove();
    }

    function findRawText(direction = 1) {
      const query = String(searchInput?.value || "");
      if (!textarea || !query) {
        setRawMessage("Entre un texte à rechercher.", true);
        searchInput?.focus();
        return false;
      }

      const source = textarea.value.toLocaleLowerCase("fr");
      const needle = query.toLocaleLowerCase("fr");
      const selectionStart = Number.isFinite(textarea.selectionStart) ? textarea.selectionStart : 0;
      const selectionEnd = Number.isFinite(textarea.selectionEnd) ? textarea.selectionEnd : selectionStart;
      let index = -1;

      if (direction < 0) {
        index = source.lastIndexOf(needle, Math.max(0, selectionStart - 1));
        if (index < 0) index = source.lastIndexOf(needle);
      } else {
        index = source.indexOf(needle, selectionEnd);
        if (index < 0) index = source.indexOf(needle);
      }

      if (index < 0) {
        setRawMessage("Aucune occurrence trouvée.", true);
        return false;
      }

      textarea.focus();
      textarea.setSelectionRange(index, index + query.length);
      setRawMessage(`Occurrence ${index + 1}.`);
      return true;
    }

    function replaceCurrentRawMatch() {
      if (!textarea) return;
      const query = String(searchInput?.value || "");
      if (!query) {
        setRawMessage("Entre un texte à rechercher.", true);
        searchInput?.focus();
        return;
      }

      const selected = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
      if (selected.toLocaleLowerCase("fr") !== query.toLocaleLowerCase("fr") && !findRawText(1)) {
        return;
      }

      const replacement = String(replaceInput?.value || "");
      insertTextAtSelection(textarea, replacement);
      setRawMessage("Occurrence remplacée.");
      findRawText(1);
    }

    function replaceAllRawMatches() {
      if (!textarea) return;
      const query = String(searchInput?.value || "");
      if (!query) {
        setRawMessage("Entre un texte à rechercher.", true);
        searchInput?.focus();
        return;
      }

      const regex = new RegExp(escapeRegExp(query), "gi");
      const matches = textarea.value.match(regex) || [];
      if (!matches.length) {
        setRawMessage("Aucune occurrence trouvée.", true);
        return;
      }

      textarea.value = textarea.value.replace(regex, String(replaceInput?.value || ""));
      setRawMessage(`${matches.length} occurrence${matches.length > 1 ? "s" : ""} remplacée${matches.length > 1 ? "s" : ""}.`);
      textarea.focus();
    }

    async function copyRawText() {
      if (!textarea) return;
      try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard indisponible");
        await navigator.clipboard.writeText(textarea.value);
        setRawMessage("Texte copié.");
      } catch {
        textarea.focus();
        textarea.select();
        const ok = document.execCommand?.("copy");
        setRawMessage(ok ? "Texte copié." : "Impossible de copier automatiquement.", !ok);
      }
    }

    async function pasteRawText() {
      if (!textarea) return;
      try {
        if (!navigator.clipboard?.readText) throw new Error("Clipboard indisponible");
        const text = await navigator.clipboard.readText();
        insertTextAtSelection(textarea, text || "");
        setRawMessage("Texte collé.");
      } catch {
        textarea.focus();
        setRawMessage("Le navigateur bloque le collage automatique. Utilise Ctrl+V dans la zone de texte.", true);
      }
    }

    function downloadRawText() {
      if (!textarea) return;
      const blob = new Blob([textarea.value], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = buildExportFilename();
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setRawMessage("Fichier préparé.");
    }

    function applyRawTextToBank() {
      if (!canApplyChanges || !textarea) return;
      const { imported, errors } = parseBankImportText(textarea.value, getSelectedBankType());
      if (!imported.length) {
        setRawMessage("Aucune question valide détectée.", true);
        return;
      }

      if (errors.length && !window.confirm(`${errors.length} ligne${errors.length > 1 ? "s" : ""} seront ignorée${errors.length > 1 ? "s" : ""}. Appliquer quand même ?`)) {
        return;
      }

      itemDrafts = imported.map(normalizeItemDraft);
      expandedItemIndex = -1;
      previewItemIndex = clampPreviewIndex(previewItemIndex);
      setPendingChanges(true);
      refreshItemsTable({ preserveScroll: false, force: true });
      close();
      showToast?.(`${itemDrafts.length} question${itemDrafts.length > 1 ? "s" : ""} chargée${itemDrafts.length > 1 ? "s" : ""} depuis le texte brut.`);
    }

    overlay.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target === overlay || target.closest(".dashboard-bank-export-close") || target.closest("#btnBankRawCancel")) {
        close();
        return;
      }
      if (target.closest("#btnBankRawCopy")) {
        void copyRawText();
        return;
      }
      if (target.closest("#btnBankRawPaste")) {
        void pasteRawText();
        return;
      }
      if (target.closest("#btnBankRawDownload")) {
        downloadRawText();
        return;
      }
      if (target.closest("#btnBankRawFindPrev")) {
        findRawText(-1);
        return;
      }
      if (target.closest("#btnBankRawFindNext")) {
        findRawText(1);
        return;
      }
      if (target.closest("#btnBankRawReplaceOne")) {
        replaceCurrentRawMatch();
        return;
      }
      if (target.closest("#btnBankRawReplaceAll")) {
        replaceAllRawMatches();
        return;
      }
      if (target.closest("#btnBankRawApply")) {
        applyRawTextToBank();
      }
    });

    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchInput?.focus();
        searchInput?.select?.();
        return;
      }
      if (event.key === "Enter" && event.target === searchInput) {
        event.preventDefault();
        findRawText(event.shiftKey ? -1 : 1);
      }
    });

    if (!canApplyChanges && applyButton) {
      applyButton.title = "Cette banque est en lecture seule.";
      setRawMessage("Banque en lecture seule : copie ou télécharge le texte, puis crée une banque personnelle pour l’éditer.");
    } else {
      setRawMessage(`${itemDrafts.length} question${itemDrafts.length > 1 ? "s" : ""} exportée${itemDrafts.length > 1 ? "s" : ""}.`);
    }

    textarea?.focus();
    textarea?.setSelectionRange(0, 0);
  }

  function bindEvents() {
    btnCreateBank?.addEventListener("click", openCreateBankOverlay);
    btnCreateBankFolder?.addEventListener("click", () => { void openCreateFolderOverlay(currentOpenFolderId); });
    bankExplorerHeader?.querySelectorAll("[data-bank-type-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setCurrentBankTypeFilter(btn.dataset.bankTypeFilter);
      });
    });
    updateBankTypeFilterButtons();
    document.getElementById("btnRenameBankFromHeader")?.addEventListener("click", () => {
      const bank = getSelectedBank();
      if (!bank) return;
      openRenameBankOverlay(bank.id);
    });
    banksList?.addEventListener("dragover", handleBankDragOver);
    banksList?.addEventListener("drop", (event) => { void handleBankDrop(event); });
    banksList?.addEventListener("dragleave", handleBankDragLeave);
    btnBackBankExplorer?.addEventListener("click", () => { void closeBankEditor(); });
    btnSaveBank?.addEventListener("click", saveBank);
    btnDeleteBank?.addEventListener("click", deleteSelectedBank);
    bankEditorHeader?.addEventListener("input", handleEditorInput);
    bankEditorHeader?.addEventListener("click", handleEditorClick);
    bankEditorHost?.addEventListener("input", handleEditorInput);
    bankEditorHost?.addEventListener("click", handleEditorClick);
    bankEditorHost?.addEventListener("keydown", handleEditorKeydown);
    bankEditorHost?.addEventListener("paste", handleEditorPaste);

    bankBreadcrumb?.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
      if (!target) return;
      if (target.dataset.action === "open-root") {
        setCurrentFolder(null);
      } else if (target.dataset.action === "open-folder") {
        setCurrentFolder(target.dataset.folderId);
      }
    });

    btnImportCancel?.addEventListener("click", closeImportModal);
    btnImportConfirm?.addEventListener("click", confirmImport);
    importInput?.addEventListener("input", updateImportPreview);
    importModal?.addEventListener("click", (event) => {
      if (event.target === importModal) closeImportModal();
    });
    importModal?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeImportModal();
      }
    });

    document.addEventListener("pointerdown", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest(".dashboard-bank-markup-help-wrap")) {
        closeMarkupHelpPopup();
      }
      if (!target.closest(".dashboard-bank-preview-wrap")) {
        closePreviewPopup();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeMarkupHelpPopup();
        closePreviewPopup();
      }
    });
  }

  bindEvents();
  renderEmptyState();
  updateActionState();

  return {
    refresh,
    isEditorOpen: () => bankViewMode === "editor",
    closeEditor: closeBankEditor,
    hasPendingChanges: () => hasPendingChanges,
    getLeaveWarningMessage: () => "Des modifications non enregistrées existent dans une banque."
  };
}
