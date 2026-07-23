import {
  renderRadioGroup,
  renderSection,
  bindCollapsibleSection,
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
  getSelectionItemSelectionKey,
  normalizeSelectionItems,
  normalizeSettings,
  DEFAULT_DRAW_MODE,
  DEFAULT_SELECTION_MODE,
  DEFAULT_QUESTION_SELECTION_MODE
} from "./model.js";

let stylesInjected = false;

const SELECTION_BANK_TYPE = "selection";
const LOADING_OPTION_VALUE = "__loading__";

export function renderToolSettings(container, settings, context = {}) {
  injectStyles();
  container.classList.add("selection-config-root");

  const cfg = normalizeSettings(settings);
  const initialSnapshot = normalizeSelectionItems(cfg.bankItemsSnapshot);

  container.innerHTML = renderToolSettingsStack(
    `
      <div id="selection_bankWidgetHost">
        ${renderBankWidget({
          value: LOADING_OPTION_VALUE,
          options: [{ value: LOADING_OPTION_VALUE, label: "Chargement des banques…" }],
          disabled: true,
          count: initialSnapshot.length
        })}
      </div>
      <textarea id="selection_bankSnapshot" hidden>${escapeHtml(JSON.stringify(initialSnapshot))}</textarea>
      <div id="selection_questionSelectionHost">
        ${renderQuestionSelectionWidget({
          idPrefix: "selection",
          items: initialSnapshot,
          selection: cfg.questionSelection,
          itemKeyGetter: getSelectionItemSelectionKey,
          renderRow: renderSelectionQuestionSelectionRow,
          itemSingular: "question",
          itemPlural: "questions",
          emptyMessage: "Aucun item à afficher."
        })}
      </div>
    `,
    renderRadioGroup({
      title: "Tirage des questions dans la banque",
      id: "selection_drawMode",
      value: cfg.drawMode,
      options: [
        { value: "in_order", label: "Dans l’ordre" },
        { value: "random", label: "Aléatoire" }
      ]
    }),
    renderSection("Réglages avancés", renderRadioGroup({
      title: "Sélection",
      id: "selection_selectionMode",
      value: cfg.selectionMode,
      options: [
        { value: "disjoint", label: "Disjointe" },
        { value: "continuous", label: "Continue" }
      ]
    }), { collapsible: true, expanded: false, idPrefix: "selection_advanced" })
  );

  bindRadio(container, "selection_drawMode");
  bindCollapsibleSection(container, "selection_advanced");
  bindRadio(container, "selection_selectionMode");
  refreshQuestionSelectionWidget(container, initialSnapshot, cfg.questionSelection);
  setupBankSelect(container, cfg, context).catch((err) => {
    const host = container.querySelector("#selection_bankWidgetHost");
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
  const select = container.querySelector("#selection_bankSelect");
  const snapshotEl = container.querySelector("#selection_bankSnapshot");
  const bankId = String(readSelect(container, "selection_bankSelect", { parse: (value) => value }) || "").trim();
  const bankTitle = String(select?.dataset?.bankTitle || previous.bankTitle || "").trim();
  const bankInstruction = String(select?.dataset?.bankInstruction || previous.bankInstruction || "").trim();
  const drawMode = readRadio(container, "selection_drawMode", DEFAULT_DRAW_MODE);
  const selectionMode = readRadio(container, "selection_selectionMode", DEFAULT_SELECTION_MODE);
  const snapshot = readSnapshot(snapshotEl?.value || "[]");
  const questionSelection = readQuestionSelection(container, {
    idPrefix: "selection"
  });

  if (!bankId || bankId === LOADING_OPTION_VALUE) {
    throw new Error("Sélectionne une banque Sélection.");
  }

  if (!snapshot.length) {
    throw new Error(select?.dataset.selectionItemsLoaded === "true"
      ? "La banque sélectionnée ne contient aucun item exploitable."
      : "Les items de la banque ne sont pas encore chargés.");
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
    selectionMode,
    questionSelection,
    bankItemsSnapshot: snapshot
  });
}

export { getDefaultSettings };

async function setupBankSelect(container, cfg, context = {}) {
  await setupQuestionBankPicker({
    container,
    context,
    selectId: "selection_bankSelect",
    countId: "selection_bankCount",
    snapshotId: "selection_bankSnapshot",
    bankType: SELECTION_BANK_TYPE,
    bankTypeLabel: "Sélection",
    selectedBankId: cfg.bankId,
    bankItemsSnapshot: cfg.bankItemsSnapshot,
    normalizeItems: normalizeSelectionItems,
    countFormatter: renderQuestionCount,
    loadingBanksMessage: "Chargement des banques Sélection…",
    loadingItemsMessage: "Chargement des items Sélection…",
    noBankMessage: "Crée d’abord une banque de type “Sélection” dans l’onglet Banques.",
    emptyBankMessage: "Cette banque ne contient aucun item Sélection exploitable.",
    loadErrorMessage: "Impossible de charger les items de cette banque.",
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
  const host = container.querySelector("#selection_questionSelectionHost");
  if (!host) return;
  const normalizedItems = normalizeSelectionItems(items);
  const safeSelection = selection || readQuestionSelection(container, {
    idPrefix: "selection",
    fallback: { mode: DEFAULT_QUESTION_SELECTION_MODE, questionKeys: [] },
    allowEmpty: true
  });
  host.innerHTML = renderQuestionSelectionWidget({
    idPrefix: "selection",
    items: normalizedItems,
    selection: safeSelection,
    itemKeyGetter: getSelectionItemSelectionKey,
    renderRow: renderSelectionQuestionSelectionRow,
    itemSingular: "question",
    itemPlural: "questions",
    emptyMessage: "Aucun item à afficher."
  });
  bindQuestionSelectionWidget(host, { idPrefix: "selection" });
  updateQuestionSelectionUi(host, { idPrefix: "selection" });
}

function setQuestionSelectionLoading(container) {
  const host = container.querySelector("#selection_questionSelectionHost");
  if (!host) return;
  const currentSelection = readQuestionSelection(container, {
    idPrefix: "selection",
    fallback: { mode: DEFAULT_QUESTION_SELECTION_MODE, questionKeys: [] },
    allowEmpty: true
  });
  host.innerHTML = renderQuestionSelectionWidget({
    idPrefix: "selection",
    items: [],
    selection: currentSelection,
    loading: true,
    itemKeyGetter: getSelectionItemSelectionKey,
    renderRow: renderSelectionQuestionSelectionRow,
    itemSingular: "question",
    itemPlural: "questions"
  });
  bindQuestionSelectionWidget(host, { idPrefix: "selection" });
  updateQuestionSelectionUi(host, { idPrefix: "selection" });
}

function getSelectionForLoadedBank(container, cfg, bankId) {
  const sameInitialBank = String(bankId || "").trim() === String(cfg?.bankId || "").trim();
  if (!sameInitialBank) {
    return { mode: DEFAULT_QUESTION_SELECTION_MODE, questionKeys: [] };
  }
  return readQuestionSelection(container, {
    idPrefix: "selection",
    fallback: cfg.questionSelection,
    allowEmpty: true
  });
}

function renderSelectionQuestionSelectionRow({ item, index, key, checked }) {
  const payload = item?.payload_json || {};
  const expected = String(payload.expectedSelectionText || "").trim();
  return `
    <label class="general-question-selection-row" role="listitem">
      <input class="general-question-selection-check" type="checkbox" data-question-key="${escapeHtml(key)}" ${checked ? "checked" : ""}>
      <span class="general-question-selection-index">${index + 1}</span>
      <span class="general-question-selection-preview general-question-selection-preview--question">
        <span class="general-question-selection-preview-text">${escapeHtml(item.prompt || `Item ${index + 1}`)}</span>
      </span>
      <span class="general-question-selection-arrow" aria-hidden="true">→</span>
      <span class="general-question-selection-preview general-question-selection-preview--answer">
        <span class="general-question-selection-preview-text">${escapeHtml(expected || "Sélection attendue")}</span>
      </span>
    </label>
  `;
}

function renderBankWidget({ value = "", options = [], disabled = false, count = 0 } = {}) {
  return renderQuestionBankPickerWidget({
    selectId: "selection_bankSelect",
    countId: "selection_bankCount",
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
  const countEl = container.querySelector("#selection_bankCount");
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
  return `${safeCount} item${safeCount > 1 ? "s" : ""}`;
}

function readSnapshot(value) {
  try {
    return normalizeSelectionItems(JSON.parse(String(value || "[]")));
  } catch {
    return [];
  }
}

function compareBanks(a, b) {
  const systemDelta = Number(a?.is_system === true) - Number(b?.is_system === true);
  if (systemDelta !== 0) return systemDelta;
  return String(a?.title || "").localeCompare(String(b?.title || ""), "fr", { sensitivity: "base" });
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-selection-config-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.selectionConfigStyle = href;
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
