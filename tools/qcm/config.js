import {
  renderRadioGroup,
  renderCheckbox,
  renderSection,
  renderStepperField,
  bindCollapsibleSection,
  bindRadio,
  bindStepperField,
  readRadio,
  readSelect,
  readCheckbox,
  readStepper,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import {
  renderQuestionBankPickerWidget,
  setupQuestionBankPicker
} from "../../shared/tool-commons/general-tools/question-bank-picker.js";
import {
  bindQuestionSelectionWidget as bindCommonQuestionSelectionWidget,
  readQuestionSelection as readCommonQuestionSelection,
  renderQuestionSelectionWidget as renderCommonQuestionSelectionWidget,
  updateQuestionSelectionUi as updateCommonQuestionSelectionUi
} from "../../shared/tool-commons/general-tools/question-selection-widget.js";
import { getCachedToolAssetsManifest, loadToolAssetsManifest } from "../../shared/tool-assets/tool-assets.js";
import {
  getDefaultSettings,
  getQcmContentPlainText,
  getQcmItemSelectionKey,
  normalizeQcmContent,
  normalizeQcmItems,
  normalizeQuestionSelection,
  normalizeSettings,
  qcmContentHasImage,
  DEFAULT_DRAW_MODE,
  DEFAULT_MAX_CHOICE_COUNT,
  DEFAULT_GLOBAL_LAYOUT,
  DEFAULT_ANSWERS_LAYOUT,
  DEFAULT_QUESTION_SELECTION_MODE,
  MIN_CHOICE_COUNT,
  MAX_CHOICE_COUNT
} from "./model.js";

let stylesInjected = false;

const QCM_BANK_TYPE = "qcm";
const LOADING_OPTION_VALUE = "__loading__";

export function renderToolSettings(container, settings, context = {}) {
  injectStyles();
  container.classList.add("qcm-config-root");

  const cfg = normalizeSettings(settings);
  const initialSnapshot = normalizeQcmItems(cfg.bankItemsSnapshot);

  container.innerHTML = renderToolSettingsStack(
    `
      <div id="qcm_bankWidgetHost">
        ${renderBankWidget({
          value: LOADING_OPTION_VALUE,
          options: [{ value: LOADING_OPTION_VALUE, label: "Chargement des banques…" }],
          disabled: true,
          count: initialSnapshot.length
        })}
      </div>
      <textarea id="qcm_bankSnapshot" hidden>${escapeHtml(JSON.stringify(initialSnapshot))}</textarea>
      <div id="qcm_questionSelectionHost">
        ${renderCommonQuestionSelectionWidget({
          idPrefix: "qcm",
          items: initialSnapshot,
          selection: cfg.questionSelection,
          renderRow: renderQcmQuestionSelectionRow,
          itemSingular: "question",
          itemPlural: "questions",
          emptyMessage: "Aucune question à afficher."
        })}
      </div>
    `,
    renderRadioGroup({
      title: "Tirage des questions dans la banque",
      id: "qcm_drawMode",
      value: cfg.drawMode,
      options: [
        { value: "in_order", label: "Dans l’ordre" },
        { value: "random", label: "Aléatoire" }
      ]
    }),
    renderSection("Réglages avancés", `
      ${renderRadioGroup({
        title: "Layout global",
        id: "qcm_globalLayout",
        value: cfg.globalLayout,
        options: [
          { value: "auto", label: "Auto" },
          { value: "vertical", label: "Vertical" },
          { value: "horizontal", label: "Horizontal" }
        ]
      })}
      ${renderRadioGroup({
        title: "Layout des réponses",
        id: "qcm_answersLayout",
        value: cfg.answersLayout,
        options: [
          { value: "auto", label: "Auto" },
          { value: "grid", label: "Grille" },
          { value: "column", label: "Colonne" },
          { value: "row", label: "Ligne" }
        ]
      })}
      <div class="tv-group tv-group-inline qcm-config-propositions-group">
        <div class="tv-group-title">Propositions</div>
        <div class="qcm-config-propositions-controls">
          ${renderCheckbox({
            id: "qcm_shuffleChoices",
            label: "Mélanger",
            checked: cfg.shuffleChoices !== false
          })}
          ${renderStepperField({
            id: "qcm_maxChoiceCount",
            label: "Nombre max",
            value: cfg.maxChoiceCount ?? DEFAULT_MAX_CHOICE_COUNT,
            inputMin: MIN_CHOICE_COUNT,
            inputMax: MAX_CHOICE_COUNT,
            fieldClassName: "qcm-config-choice-count-field"
          })}
        </div>
      </div>
    `, { collapsible: true, expanded: false, idPrefix: "qcm_advanced" })
  );

  bindRadio(container, "qcm_drawMode");
  bindRadio(container, "qcm_globalLayout");
  bindRadio(container, "qcm_answersLayout");
  bindCollapsibleSection(container, "qcm_advanced");
  bindStepperField(container, "qcm_maxChoiceCount", { inputMin: MIN_CHOICE_COUNT, inputMax: MAX_CHOICE_COUNT });
  setupQuestionSelection(container, initialSnapshot, cfg.questionSelection);
  ensureQuestionSelectionAssets(container).catch(() => {});
  setupBankSelect(container, cfg, context).catch((err) => {
    const host = container.querySelector("#qcm_bankWidgetHost");
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
  const select = container.querySelector("#qcm_bankSelect");
  const snapshotEl = container.querySelector("#qcm_bankSnapshot");
  const bankId = String(readSelect(container, "qcm_bankSelect", { parse: (value) => value }) || "").trim();
  const bankTitle = String(select?.dataset?.bankTitle || previous.bankTitle || "").trim();
  const bankInstruction = String(select?.dataset?.bankInstruction || previous.bankInstruction || "").trim();
  const drawMode = readRadio(container, "qcm_drawMode", DEFAULT_DRAW_MODE);
  const globalLayout = readRadio(container, "qcm_globalLayout", DEFAULT_GLOBAL_LAYOUT);
  const answersLayout = readRadio(container, "qcm_answersLayout", DEFAULT_ANSWERS_LAYOUT);
  const shuffleChoices = readCheckbox(container, "qcm_shuffleChoices");
  const maxChoiceCount = readStepper(container, "qcm_maxChoiceCount", {
    inputMin: MIN_CHOICE_COUNT,
    inputMax: MAX_CHOICE_COUNT
  });
  const snapshot = readSnapshot(snapshotEl?.value || "[]");
  const questionSelection = readCommonQuestionSelection(container, {
    idPrefix: "qcm"
  });

  if (!bankId || bankId === LOADING_OPTION_VALUE) {
    throw new Error("Sélectionne une banque QCM.");
  }

  if (!snapshot.length) {
    throw new Error(select?.dataset.qcmItemsLoaded === "true"
      ? "La banque sélectionnée ne contient aucun QCM exploitable."
      : "Les questions de la banque ne sont pas encore chargées.");
  }

  if (questionSelection.mode === "custom" && !questionSelection.questionKeys.length) {
    throw new Error("Sélectionne au moins une question pour ce niveau.");
  }

  return normalizeSettings({
    ...previous,
    bankId,
    bankTitle,
    bankInstruction,
    drawMode,
    globalLayout,
    answersLayout,
    shuffleChoices,
    maxChoiceCount,
    questionSelection,
    bankItemsSnapshot: snapshot
  });
}

export { getDefaultSettings };

async function setupBankSelect(container, cfg, context = {}) {
  await setupQuestionBankPicker({
    container,
    context,
    selectId: "qcm_bankSelect",
    countId: "qcm_bankCount",
    snapshotId: "qcm_bankSnapshot",
    bankType: QCM_BANK_TYPE,
    bankTypeLabel: "QCM",
    selectedBankId: cfg.bankId,
    bankItemsSnapshot: cfg.bankItemsSnapshot,
    normalizeItems: normalizeQcmItems,
    countFormatter: renderQuestionCount,
    loadingBanksMessage: "Chargement des banques QCM…",
    loadingItemsMessage: "Chargement des QCM…",
    noBankMessage: "Crée d’abord une banque de type “QCM” dans l’onglet Banques.",
    emptyBankMessage: "Cette banque ne contient aucun QCM exploitable.",
    loadErrorMessage: "Impossible de charger les QCM de cette banque.",
    noSpaceMessage: "Impossible de lister les banques sans espace enseignant.",
    setEditorStatus: (message, isError = false) => setEditorStatus(context, message, isError),
    clearEditorStatus: () => clearEditorStatus(context),
    onLoadStart: () => setQuestionSelectionLoading(container),
    onItemsLoaded: (normalizedItems, bankId) => {
      refreshQuestionSelectionWidget(container, normalizedItems, getSelectionForLoadedBank(container, cfg, bankId));
    }
  });
}



function setupQuestionSelection(container, items = [], selection = {}) {
  refreshQuestionSelectionWidget(container, items, selection);
}

function ensureQuestionSelectionAssets(container) {
  return loadToolAssetsManifest().then(() => {
    const snapshotEl = container.querySelector("#qcm_bankSnapshot");
    const items = readSnapshot(snapshotEl?.value || "[]");
    const selection = readCommonQuestionSelection(container, {
      idPrefix: "qcm",
      fallback: { mode: DEFAULT_QUESTION_SELECTION_MODE, questionKeys: [] },
      allowEmpty: true
    });
    refreshQuestionSelectionWidget(container, items, selection);
  });
}

function refreshQuestionSelectionWidget(container, items = [], selection = null) {
  const host = container.querySelector("#qcm_questionSelectionHost");
  if (!host) return;
  const normalizedItems = normalizeQcmItems(items);
  const safeSelection = selection || readCommonQuestionSelection(container, {
    idPrefix: "qcm",
    allowEmpty: true
  });
  host.innerHTML = renderCommonQuestionSelectionWidget({
    idPrefix: "qcm",
    items: normalizedItems,
    selection: safeSelection,
    renderRow: renderQcmQuestionSelectionRow,
    itemSingular: "question",
    itemPlural: "questions",
    emptyMessage: "Aucune question à afficher."
  });
  bindCommonQuestionSelectionWidget(host, { idPrefix: "qcm" });
  updateCommonQuestionSelectionUi(host, { idPrefix: "qcm" });
}

function setQuestionSelectionLoading(container) {
  const host = container.querySelector("#qcm_questionSelectionHost");
  if (!host) return;
  const currentSelection = readCommonQuestionSelection(container, {
    idPrefix: "qcm",
    fallback: { mode: DEFAULT_QUESTION_SELECTION_MODE, questionKeys: [] },
    allowEmpty: true
  });
  host.innerHTML = renderCommonQuestionSelectionWidget({
    idPrefix: "qcm",
    items: [],
    selection: currentSelection,
    loading: true,
    renderRow: renderQcmQuestionSelectionRow,
    itemSingular: "question",
    itemPlural: "questions"
  });
  bindCommonQuestionSelectionWidget(host, { idPrefix: "qcm" });
  updateCommonQuestionSelectionUi(host, { idPrefix: "qcm" });
}

function getSelectionForLoadedBank(container, cfg, bankId) {
  const sameInitialBank = String(bankId || "").trim() === String(cfg?.bankId || "").trim();
  if (!sameInitialBank) {
    return { mode: DEFAULT_QUESTION_SELECTION_MODE, questionKeys: [] };
  }
  return readCommonQuestionSelection(container, {
    idPrefix: "qcm",
    fallback: cfg.questionSelection,
    allowEmpty: true
  });
}

function renderQcmQuestionSelectionRow({ item, index, key, checked }) {
  return `
    <label class="general-question-selection-row" role="listitem">
      <input class="general-question-selection-check" type="checkbox" data-question-key="${escapeHtml(key)}" ${checked ? "checked" : ""}>
      <span class="general-question-selection-index">${index + 1}</span>
      <span class="general-question-selection-preview general-question-selection-preview--question">
        ${renderContentPreview(item.promptContent, { fallback: item.prompt || `Question ${index + 1}` })}
      </span>
      <span class="general-question-selection-arrow" aria-hidden="true">→</span>
      <span class="general-question-selection-preview general-question-selection-preview--answer">
        ${renderContentPreview(item.correctAnswerContent, { fallback: item.correctAnswer || "Réponse" })}
      </span>
    </label>
  `;
}

function renderContentPreview(content, { fallback = "" } = {}) {
  const normalized = normalizeQcmContent(content);
  const manifest = getCachedToolAssetsManifest();
  const hasImage = qcmContentHasImage(normalized);
  const text = getQcmContentPlainText(normalized, { fallbackToAssetId: !hasImage }) || fallback;

  if (hasImage) {
    const image = resolvePreviewImage(normalized, manifest);
    const img = image.src
      ? `<img class="qcm-question-selection-thumb" src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}" loading="lazy" decoding="async">`
      : `<span class="qcm-question-selection-missing-img">image</span>`;
    const label = String(normalized.text || image.label || "").trim();
    return `
      <span class="qcm-question-selection-media-preview">
        ${img}
        ${label ? `<span class="qcm-question-selection-preview-text">${escapeHtml(label)}</span>` : ""}
      </span>
    `;
  }

  return `<span class="qcm-question-selection-preview-text">${escapeHtml(text)}</span>`;
}

function resolvePreviewImage(content, manifest) {
  const assetId = String(content?.assetId || "").trim();
  if (assetId && manifest?.assetsById?.has(assetId)) {
    const asset = manifest.assetsById.get(assetId);
    return {
      src: asset?.url || "",
      alt: String(content.alt || asset?.alt || asset?.label || assetId).trim(),
      label: String(asset?.label || assetId).trim()
    };
  }
  const src = String(content?.src || "").trim();
  return {
    src,
    alt: String(content?.alt || content?.text || assetId || src).trim(),
    label: String(content?.text || assetId || "").trim()
  };
}

function renderBankWidget({
  value = "",
  options = [],
  disabled = false,
  count = 0
} = {}) {
  return renderQuestionBankPickerWidget({
    selectId: "qcm_bankSelect",
    countId: "qcm_bankCount",
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
  const countEl = container.querySelector("#qcm_bankCount");
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

function renderQuestionCount(count = 0) {
  const safeCount = Math.max(0, Math.trunc(Number(count) || 0));
  return `${safeCount} QCM`;
}

function readSnapshot(value) {
  try {
    return normalizeQcmItems(JSON.parse(String(value || "[]")));
  } catch {
    return [];
  }
}

function compareBanks(a, b) {
  const systemDelta = Number(a?.is_system === true) - Number(b?.is_system === true);
  if (systemDelta !== 0) return systemDelta;
  return String(a?.title || "").localeCompare(String(b?.title || ""), "fr");
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-qcm-config-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.qcmConfigStyle = href;
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
