import {
  copyQuestionBankToSpace,
  createQuestionBankForSpace,
  deleteQuestionBank,
  listQuestionBankItems,
  listQuestionBanksForSpace,
  normalizeQuestionBankTitle,
  replaceQuestionBankItems,
  updateQuestionBank
} from "../teacher-api.js";
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
const QCM_MAX_DISTRACTORS = 5;
const EDITABLE_BANK_TYPES = new Set([DEFAULT_BANK_TYPE, QCM_BANK_TYPE, SELECTION_BANK_TYPE]);
const BANK_TYPE_LABELS = {
  text_answer: "Réponses textuelles",
  qcm: "QCM",
  selection: "Sélection",
  cloze_text: "Texte à trous",
  image_answer: "Réponse image",
  problem: "Problèmes",
  matching: "Appariement",
  sorting: "Tri"
};
const SAVE_STATUS_ICONS = {
  idle: "warning",
  loading: "hourglass_empty",
  dirty: "warning",
  saving: "hourglass_empty",
  saved: "check",
  error: "error",
  readonly: "warning"
};
const META_INPUT_IDS = new Set([
  "bankTitleInput",
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

function distractorsFromFields(payload = {}) {
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

  return normalizeQcmDistractors(source);
}

function getQcmDistractorColumnCount(items = []) {
  const maxFilled = items.reduce((max, item) => {
    const payload = item?.payload_json || {};
    return Math.max(max, distractorsFromFields(payload).length);
  }, 0);
  return maxFilled >= QCM_MAX_DISTRACTORS
    ? QCM_MAX_DISTRACTORS
    : Math.max(1, maxFilled + 1);
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

function normalizeQcmDistractors(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || "").split(/[;\n]/g);

  return source
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, QCM_MAX_DISTRACTORS);
}

function setQcmDistractorAt(payload = {}, fieldName, value) {
  const match = String(fieldName || "").match(/^distractor([1-5])$/);
  if (!match) return;
  const index = Number(match[1]) - 1;
  const distractors = distractorsFromFields(payload);
  while (distractors.length <= index) {
    distractors.push("");
  }
  distractors[index] = String(value || "");
  payload.distractors = normalizeQcmDistractors(distractors);
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

function stripImportCellQuotes(value) {
  const text = String(value || "").trim();
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1).replaceAll('""', '"').trim();
  }
  return text;
}

function splitImportLine(line, { maxColumns = 4, mergeOverflowIntoLast = true } = {}) {
  const delimiter = line.includes("\t") ? "\t" : "|";
  const columns = line.split(delimiter).map(stripImportCellQuotes);

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
export function createQuestionBanksViewController({
  banksView,
  banksList,
  bankEditorHost,
  bankSaveStatus,
  btnCreateBank,
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

  function renderSaveStatus() {
    if (!bankSaveStatus) return;
    const safeStatus = saveStatus || "idle";
    const label = saveStatusMessage || "";
    bankSaveStatus.textContent = SAVE_STATUS_ICONS[safeStatus] || "warning";
    bankSaveStatus.dataset.state = safeStatus;
    bankSaveStatus.title = label;
    bankSaveStatus.setAttribute("aria-label", label);
  }

  function setSaveStatus(status = "idle", message = "") {
    saveStatus = status;
    saveStatusMessage = message;
    renderSaveStatus();
  }

  function updateActionState() {
    const bank = getSelectedBank();
    const canEditBank = canEditSelectedBank();

    const importButton = document.getElementById("btnImportBank");
    if (importButton) {
      importButton.disabled = !canEditSelectedBankItems() || isSaving;
      importButton.title = bank && !selectedBankIsEditableType()
        ? "L’import rapide n’est pas encore disponible pour ce type de banque."
        : "";
    }

    if (btnDeleteBank) {
      btnDeleteBank.disabled = !bank || bank.is_system === true || isSaving;
      btnDeleteBank.title = bank?.is_system === true
        ? "Les banques proposées ne peuvent pas être supprimées."
        : "";
    }

    if (btnSaveBank) {
      btnSaveBank.disabled = !hasPendingChanges || !canEditBank || isSaving;
      btnSaveBank.textContent = isSaving ? "Enregistrement…" : "Enregistrer";
    }

    banksView?.classList.toggle("has-pending-bank-changes", hasPendingChanges);

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
    bankEditorHost.innerHTML = `
      <div class="dashboard-bank-empty-state">
        <span class="dashboard-material-icon" aria-hidden="true">database</span>
        <div>${escapeHtml(message)}</div>
      </div>
    `;
  }

  function renderBanksList() {
    if (!banksList) return;

    if (!banks.length) {
      banksList.innerHTML = `
        <div class="dashboard-bank-list-empty">
          <span class="dashboard-material-icon" aria-hidden="true">inventory_2</span>
          <span>Aucune banque pour le moment.</span>
        </div>
      `;
      return;
    }

    banksList.innerHTML = banks.map((bank) => {
      const isSelected = String(bank.id) === String(selectedBankId);
      const typeLabel = getBankTypeLabel(bank.bank_type);
      const badge = bank.is_system ? "Proposée" : "Personnelle";
      const itemCount = Number(bank.items_count ?? bank.item_count);
      return `
        <button class="dashboard-bank-list-card ${isSelected ? "is-selected" : ""}" type="button" data-bank-id="${escapeAttr(bank.id)}">
          <span class="dashboard-bank-list-title">${escapeHtml(bank.title)}</span>
          <span class="dashboard-bank-list-meta">
            ${escapeHtml(typeLabel)} · ${escapeHtml(badge)}${Number.isFinite(itemCount) ? ` · ${itemCount} item${itemCount > 1 ? "s" : ""}` : ""}
          </span>
        </button>
      `;
    }).join("");
  }

  function buildEditorMarkup() {
    const bank = getSelectedBank();
    if (!bank || !metaDraft) return "";
    const isSystem = bank.is_system === true;
    const bankType = normalizeBankType(bank.bank_type);
    const isEditableItemsBank = isEditableBankType(bankType);
    const canEditItems = canEditSelectedBankItems();
    const typeLabel = getBankTypeLabel(bank.bank_type);
    const tagsText = Array.isArray(metaDraft.tags) ? metaDraft.tags.join("; ") : "";
    const qcmDistractorColumnCount = isQcmType(bankType) ? getCurrentQcmDistractorColumnCount() : 1;

    return `
      <div class="dashboard-bank-editor">
        <div class="dashboard-bank-editor-top">
          <div class="dashboard-bank-title-fields">
            <label class="dashboard-bank-title-label" for="bankTitleInput">Titre de la banque :</label>
            <input id="bankTitleInput" class="dashboard-bank-input dashboard-bank-title-input" type="text" value="${escapeAttr(metaDraft.title)}" ${isSystem ? "disabled" : ""}>
            <div class="dashboard-bank-type-pill" title="Type technique : ${escapeAttr(bank.bank_type || DEFAULT_BANK_TYPE)}">${escapeHtml(typeLabel)}</div>
            <button
              id="btnToggleBankMeta"
              class="dashboard-bank-meta-toggle dashboard-material-icon-btn"
              type="button"
              aria-label="${isMetaExpanded ? "Masquer les informations facultatives" : "Afficher les informations facultatives"}"
              aria-expanded="${isMetaExpanded ? "true" : "false"}"
              title="${isMetaExpanded ? "Masquer matière, niveau, tags et description" : "Afficher matière, niveau, tags et description"}"
            >
              <span class="dashboard-material-icon" aria-hidden="true">expand_more</span>
            </button>
          </div>
        </div>

        ${isSystem ? `
          <div class="dashboard-bank-readonly-note">
            <span class="dashboard-material-icon" aria-hidden="true">lock</span>
            <span>Cette banque est proposée à tous les enseignants. Crée une copie personnelle pour la modifier.</span>
          </div>
          <div class="dashboard-bank-editor-actions">
            <button id="btnCopySystemBank" class="btn" type="button">Créer une copie modifiable</button>
          </div>
        ` : ""}

        <div class="dashboard-bank-meta-grid" ${isMetaExpanded ? "" : "hidden"}>
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

        ${isEditableItemsBank ? `
          <div class="dashboard-bank-table-wrap">
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
            Cette interface sait modifier les banques de réponses textuelles, les banques QCM et les banques Sélection. Les ${itemDrafts.length} item${itemDrafts.length > 1 ? "s" : ""} de type ${escapeHtml(getBankTypeLabel(bank?.bank_type))} sont chargés et préservés.
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
      if (match) return String(distractorsFromFields(payload)[Number(match[1]) - 1] || "");
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
      updateActionState();
      renderEmptyState();
      return;
    }

    bankEditorHost.innerHTML = buildEditorMarkup();
    bindRowsHostEvents();
    refreshItemsTable({ preserveScroll: false, force: true });
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
      renderEditor();
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
    metaDraft.title = document.getElementById("bankTitleInput")?.value ?? metaDraft.title;
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
    const metaGrid = bankEditorHost?.querySelector(".dashboard-bank-meta-grid");
    const button = document.getElementById("btnToggleBankMeta");
    const label = isMetaExpanded
      ? "Masquer les informations facultatives"
      : "Afficher les informations facultatives";
    const title = isMetaExpanded
      ? "Masquer matière, niveau, tags et description"
      : "Afficher matière, niveau, tags et description";

    if (metaGrid) metaGrid.hidden = !isMetaExpanded;
    if (button) {
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
        title: newTitle
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
    setTableBusy(Boolean(selectedBank), "Chargement des questions…");
    setSaveStatus(selectedBank ? "loading" : "idle", selectedBank ? "Chargement de la banque…" : "Aucune banque sélectionnée");
    updateActionState();
    renderBanksList();
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
      setTableBusy(false);
      setPendingChanges(false);
      renderEmptyState("Crée d’abord ton espace enseignant.");
      return;
    }

    if (hasPendingChanges && !forceRefresh && selectedBankId) {
      renderBanksList();
      renderEditor();
      return;
    }

    isRendering = true;
    try {
      banks = await listQuestionBanksForSpace(teacherSpace.id, { includeSystem: true });
      if (preferredBankId) {
        selectedBankId = preferredBankId;
      } else if (!selectedBankId && banks.length) {
        selectedBankId = banks[0].id;
      } else if (selectedBankId && !banks.some((bank) => String(bank.id) === String(selectedBankId))) {
        selectedBankId = banks[0]?.id || null;
      }
      renderBanksList();
      if (selectedBankId) {
        await selectBank(selectedBankId, { forceReload: true });
      } else {
        selectedBank = null;
        itemDrafts = [];
        metaDraft = null;
        expandedItemIndex = -1;
        setTableBusy(false);
        setPendingChanges(false);
        setSaveStatus("idle", "Aucune banque sélectionnée");
        renderEditor();
      }
    } catch (err) {
      setTableBusy(false);
      banksList.innerHTML = `<div class="dashboard-bank-list-empty is-error">${escapeHtml(err?.message || "Impossible de charger les banques.")}</div>`;
      setSaveStatus("error", "Erreur de chargement");
      renderEmptyState("Impossible de charger les banques. Vérifie que le SQL des banques a été exécuté dans Supabase.");
    } finally {
      isRendering = false;
    }
  }

  async function createBank() {
    const teacherSpace = getCurrentTeacherSpace?.();
    if (!teacherSpace?.id) return;
    if (hasPendingChanges && !window.confirm("Des modifications non enregistrées existent. Créer une nouvelle banque ?")) return;

    try {
      const requestedType = normalizeBankType(document.getElementById("bankCreateType")?.value || DEFAULT_BANK_TYPE);
      const bankType = isEditableBankType(requestedType) ? requestedType : DEFAULT_BANK_TYPE;
      const title = buildUniqueBankTitle(banks, isSelectionType(bankType) ? "Nouvelle banque Sélection" : isQcmType(bankType) ? "Nouvelle banque QCM" : "Nouvelle banque");
      const bank = await createQuestionBankForSpace(teacherSpace.id, {
        title,
        bank_type: bankType
      });
      await refresh({ forceRefresh: true, preferredBankId: bank.id });
      if (String(selectedBankId) === String(bank.id) && !itemDrafts.length && selectedBankIsEditableType()) {
        itemDrafts = [createEmptyItem(bank.bank_type || DEFAULT_BANK_TYPE)];
        setSaveStatus("saved", "Nouvelle banque créée");
        updateActionState();
        renderEditor();
        focusBankCell(0, "prompt");
      }
    } catch (err) {
      showToast?.(err?.message || "Impossible de créer la banque.", { isError: true });
    }
  }

  async function saveBank() {
    const bank = getSelectedBank();
    if (!bank || bank.is_system === true || isSaving) return;
    syncMetaDraftFromInputs();

    const title = String(metaDraft?.title || "").trim();
    if (!title) {
      showToast?.("Le titre de la banque est obligatoire.", { isError: true });
      setSaveStatus("error", "Titre obligatoire");
      document.getElementById("bankTitleInput")?.focus();
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

  function bindEvents() {
    btnCreateBank?.addEventListener("click", createBank);
    btnSaveBank?.addEventListener("click", saveBank);
    btnDeleteBank?.addEventListener("click", deleteSelectedBank);
    bankEditorHost?.addEventListener("input", handleEditorInput);
    bankEditorHost?.addEventListener("click", handleEditorClick);
    bankEditorHost?.addEventListener("keydown", handleEditorKeydown);
    bankEditorHost?.addEventListener("paste", handleEditorPaste);

    banksList?.addEventListener("click", (event) => {
      const card = event.target.closest("[data-bank-id]");
      if (!card) return;
      void selectBank(card.dataset.bankId);
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
    hasPendingChanges: () => hasPendingChanges,
    getLeaveWarningMessage: () => "Des modifications non enregistrées existent dans une banque."
  };
}
