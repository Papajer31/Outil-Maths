import {
  renderRadioGroup,
  bindRadio,
  readRadio,
  readSelect,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import {
  renderQuestionBankPickerWidget,
  setupQuestionBankPicker
} from "../../shared/tool-commons/general-tools/question-bank-picker.js";
import {
  bindQuestionSelectionWidget,
  readQuestionSelection,
  renderQuestionSelectionWidget,
  updateQuestionSelectionUi
} from "../../shared/tool-commons/general-tools/question-selection-widget.js";
import {
  getDefaultSettings,
  getQuestionItemSelectionKey,
  filterQuestionItemsBySelection,
  isStrictNumericAnswer,
  normalizeQuestionItems,
  normalizeSettings,
  ANSWER_TYPES,
  DEFAULT_ANSWER_TYPE,
  DEFAULT_DRAW_MODE,
  DEFAULT_QUESTION_SELECTION_MODE
} from "./model.js";

let stylesInjected = false;

const TEXT_ANSWER_TYPE = "text_answer";
const LOADING_OPTION_VALUE = "__loading__";

export function renderToolSettings(container, settings, context = {}) {
  injectStyles();
  container.classList.add("qr-config-root");

  const cfg = normalizeSettings(settings);
  const initialSnapshot = normalizeQuestionItems(cfg.bankItemsSnapshot);

  container.innerHTML = renderToolSettingsStack(
    `
      <div id="qr_bankWidgetHost">
        ${renderBankWidget({
          value: LOADING_OPTION_VALUE,
          options: [{ value: LOADING_OPTION_VALUE, label: "Chargement des banques…" }],
          disabled: true,
          count: initialSnapshot.length
        })}
      </div>
      <textarea id="qr_bankSnapshot" hidden>${escapeHtml(JSON.stringify(initialSnapshot))}</textarea>
      <div id="qr_questionSelectionHost">
        ${renderQuestionSelectionWidget({
          idPrefix: "qr",
          items: initialSnapshot,
          selection: cfg.questionSelection,
          itemKeyGetter: getQuestionItemSelectionKey,
          renderRow: renderQuestionResponseSelectionRow,
          itemSingular: "question",
          itemPlural: "questions",
          emptyMessage: "Aucune question à afficher."
        })}
      </div>
    `,
    renderRadioGroup({
      title: "Type de réponse",
      id: "qr_answerType",
      value: cfg.answerType,
      options: [
        { value: ANSWER_TYPES.TEXT, label: "Texte" },
        { value: ANSWER_TYPES.NUMBER, label: "Nombre" }
      ]
    }),
    renderRadioGroup({
      title: "Tirage des questions dans la banque",
      id: "qr_drawMode",
      value: cfg.drawMode,
      options: [
        { value: "in_order", label: "Dans l’ordre" },
        { value: "random", label: "Aléatoire" }
      ]
    })
  );

  bindRadio(container, "qr_answerType");
  bindRadio(container, "qr_drawMode");
  refreshQuestionSelectionWidget(container, initialSnapshot, cfg.questionSelection);
  setupBankSelect(container, cfg, context).catch((err) => {
    const host = container.querySelector("#qr_bankWidgetHost");
    if (!host) return;
    renderBankWidgetInto(host, {
      value: "",
      options: [{ value: "", label: "Aucune banque chargée" }],
      disabled: true,
      count: 0
    });
    setEditorStatus(context, err?.message || "Impossible de charger les banques.", true);
  });
}

export function readToolSettings(container, settings = {}) {
  const previous = normalizeSettings(settings);
  const select = container.querySelector("#qr_bankSelect");
  const snapshotEl = container.querySelector("#qr_bankSnapshot");
  const bankId = String(readSelect(container, "qr_bankSelect", { parse: (value) => value }) || "").trim();
  const bankTitle = String(select?.dataset?.bankTitle || previous.bankTitle || "").trim();
  const bankInstruction = String(select?.dataset?.bankInstruction || previous.bankInstruction || "").trim();
  const answerType = readRadio(container, "qr_answerType", DEFAULT_ANSWER_TYPE);
  const drawMode = readRadio(container, "qr_drawMode", DEFAULT_DRAW_MODE);
  const snapshot = readSnapshot(snapshotEl?.value || "[]");
  const questionSelection = readQuestionSelection(container, {
    idPrefix: "qr"
  });

  if (!bankId || bankId === LOADING_OPTION_VALUE) {
    throw new Error("Sélectionne une banque de questions.");
  }

  if (!snapshot.length) {
    throw new Error(select?.dataset.qrItemsLoaded === "true"
      ? "La banque sélectionnée ne contient aucune question exploitable."
      : "Les questions de la banque ne sont pas encore chargées.");
  }

  if (questionSelection.mode === "custom" && !questionSelection.questionKeys.length) {
    throw new Error("Sélectionne au moins une question pour ce niveau.");
  }

  if (answerType === ANSWER_TYPES.NUMBER) {
    validateNumericQuestionSelection(snapshot, questionSelection);
  }

  return normalizeSettings({
    ...previous,
    bankId,
    bankTitle,
    bankInstruction,
    drawMode,
    answerType,
    questionSelection,
    bankItemsSnapshot: snapshot
  });
}

export { getDefaultSettings };

async function setupBankSelect(container, cfg, context = {}) {
  await setupQuestionBankPicker({
    container,
    context,
    selectId: "qr_bankSelect",
    countId: "qr_bankCount",
    snapshotId: "qr_bankSnapshot",
    bankType: TEXT_ANSWER_TYPE,
    bankTypeLabel: "Texte",
    selectedBankId: cfg.bankId,
    bankItemsSnapshot: cfg.bankItemsSnapshot,
    normalizeItems: normalizeQuestionItems,
    countFormatter: renderQuestionCount,
    loadingBanksMessage: "Chargement des banques…",
    loadingItemsMessage: "Chargement des questions…",
    noBankMessage: "Crée d’abord une banque de type “Texte” dans l’onglet Banques.",
    emptyBankMessage: "Cette banque ne contient aucune question exploitable.",
    loadErrorMessage: "Impossible de charger les questions de cette banque.",
    noSpaceMessage: "Impossible de lister les banques sans espace enseignant.",
    setEditorStatus: (message, isError = false) => setEditorStatus(context, message, isError),
    clearEditorStatus: () => clearEditorStatus(context),
    onLoadStart: () => setQuestionSelectionLoading(container),
    onItemsLoaded: (normalizedItems, bankId) => {
      refreshQuestionSelectionWidget(container, normalizedItems, getSelectionForLoadedBank(container, cfg, bankId));
    }
  });
}

function refreshQuestionSelectionWidget(container, items = [], selection = null) {
  const host = container.querySelector("#qr_questionSelectionHost");
  if (!host) return;
  const normalizedItems = normalizeQuestionItems(items);
  const safeSelection = selection || readQuestionSelection(container, {
    idPrefix: "qr",
    fallback: { mode: DEFAULT_QUESTION_SELECTION_MODE, questionKeys: [] },
    allowEmpty: true
  });
  host.innerHTML = renderQuestionSelectionWidget({
    idPrefix: "qr",
    items: normalizedItems,
    selection: safeSelection,
    itemKeyGetter: getQuestionItemSelectionKey,
    renderRow: renderQuestionResponseSelectionRow,
    itemSingular: "question",
    itemPlural: "questions",
    emptyMessage: "Aucune question à afficher."
  });
  bindQuestionSelectionWidget(host, { idPrefix: "qr" });
  updateQuestionSelectionUi(host, { idPrefix: "qr" });
}

function setQuestionSelectionLoading(container) {
  const host = container.querySelector("#qr_questionSelectionHost");
  if (!host) return;
  const currentSelection = readQuestionSelection(container, {
    idPrefix: "qr",
    fallback: { mode: DEFAULT_QUESTION_SELECTION_MODE, questionKeys: [] },
    allowEmpty: true
  });
  host.innerHTML = renderQuestionSelectionWidget({
    idPrefix: "qr",
    items: [],
    selection: currentSelection,
    loading: true,
    itemKeyGetter: getQuestionItemSelectionKey,
    renderRow: renderQuestionResponseSelectionRow,
    itemSingular: "question",
    itemPlural: "questions"
  });
  bindQuestionSelectionWidget(host, { idPrefix: "qr" });
  updateQuestionSelectionUi(host, { idPrefix: "qr" });
}

function getSelectionForLoadedBank(container, cfg, bankId) {
  const sameInitialBank = String(bankId || "").trim() === String(cfg?.bankId || "").trim();
  if (!sameInitialBank) {
    return { mode: DEFAULT_QUESTION_SELECTION_MODE, questionKeys: [] };
  }
  return readQuestionSelection(container, {
    idPrefix: "qr",
    fallback: cfg.questionSelection,
    allowEmpty: true
  });
}

function validateNumericQuestionSelection(items = [], selection = {}) {
  const selectedItems = filterQuestionItemsBySelection(items, selection);
  const invalidItem = selectedItems.find((item) => {
    if (!isStrictNumericAnswer(item.mainAnswer)) return true;
    return Array.isArray(item.acceptedAnswers)
      && item.acceptedAnswers.some((answer) => !isStrictNumericAnswer(answer));
  });

  if (!invalidItem) return;

  const preview = String(invalidItem.prompt || invalidItem.mainAnswer || "").trim();
  const suffix = preview ? ` Exemple concerné : “${preview.slice(0, 80)}”.` : "";
  throw new Error(`En mode Nombre, toutes les réponses sélectionnées doivent être des nombres entiers sans zéro non significatif.${suffix}`);
}

function renderQuestionResponseSelectionRow({ item, index, key, checked }) {
  return `
    <label class="general-question-selection-row" role="listitem">
      <input class="general-question-selection-check" type="checkbox" data-question-key="${escapeHtml(key)}" ${checked ? "checked" : ""}>
      <span class="general-question-selection-index">${index + 1}</span>
      <span class="general-question-selection-preview general-question-selection-preview--question">
        <span class="general-question-selection-preview-text">${escapeHtml(item.prompt || `Question ${index + 1}`)}</span>
      </span>
      <span class="general-question-selection-arrow" aria-hidden="true">→</span>
      <span class="general-question-selection-preview general-question-selection-preview--answer">
        <span class="general-question-selection-preview-text">${escapeHtml(item.mainAnswer || "Réponse")}</span>
      </span>
    </label>
  `;
}

function renderBankWidget({
  value = "",
  options = [],
  disabled = false,
  count = 0,
} = {}) {
  return renderQuestionBankPickerWidget({
    selectId: "qr_bankSelect",
    countId: "qr_bankCount",
    value,
    options,
    disabled,
    count,
    countFormatter: renderQuestionCount
  });
}

function renderBankWidgetInto(host, options) {
  host.innerHTML = renderBankWidget(options);
}

function setBankCount(container, count) {
  const countEl = container.querySelector("#qr_bankCount");
  if (countEl) countEl.textContent = count === null ? "…" : renderQuestionCount(count);
}

function setEditorStatus(context, message, isError = false) {
  const text = String(message || "").trim();
  if (!text) {
    clearEditorStatus(context);
    return;
  }

  if (typeof context?.setEditorMessage === "function") {
    context.setEditorMessage(text, !!isError);
  }
}

function clearEditorStatus(context) {
  if (typeof context?.clearEditorMessage === "function") {
    context.clearEditorMessage();
  } else if (typeof context?.setEditorMessage === "function") {
    context.setEditorMessage("");
  }
}

function setSelectedBankTitle(select, bankById) {
  if (!select) return;
  const bank = bankById.get(String(select.value || ""));
  select.dataset.bankTitle = String(bank?.title || "");
}

function compareBanks(a, b) {
  if (a?.is_system !== b?.is_system) return a?.is_system ? 1 : -1;
  return String(a?.title || "").localeCompare(String(b?.title || ""), "fr", { sensitivity: "base" });
}

function readSnapshot(rawValue) {
  try {
    return normalizeQuestionItems(JSON.parse(String(rawValue || "[]")));
  } catch {
    return [];
  }
}

function renderQuestionCount(count) {
  const safeCount = Math.max(0, Math.trunc(Number(count) || 0));
  return `${safeCount} question${safeCount > 1 ? "s" : ""}`;
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-qr-config-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.qrConfigStyle = href;
  document.head.appendChild(link);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
