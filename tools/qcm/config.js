import {
  renderRadioGroup,
  renderSelectControl,
  renderCheckbox,
  renderSection,
  renderStepperField,
  bindCollapsibleSection,
  bindRadio,
  bindSelect,
  bindStepperField,
  readRadio,
  readSelect,
  readCheckbox,
  readStepper,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
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
        ${renderQuestionSelectionWidget({
          items: initialSnapshot,
          selection: cfg.questionSelection
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
  const drawMode = readRadio(container, "qcm_drawMode", DEFAULT_DRAW_MODE);
  const globalLayout = readRadio(container, "qcm_globalLayout", DEFAULT_GLOBAL_LAYOUT);
  const answersLayout = readRadio(container, "qcm_answersLayout", DEFAULT_ANSWERS_LAYOUT);
  const shuffleChoices = readCheckbox(container, "qcm_shuffleChoices");
  const maxChoiceCount = readStepper(container, "qcm_maxChoiceCount", {
    inputMin: MIN_CHOICE_COUNT,
    inputMax: MAX_CHOICE_COUNT
  });
  const snapshot = readSnapshot(snapshotEl?.value || "[]");
  const questionSelection = readQuestionSelection(container, snapshot);

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
  const host = container.querySelector("#qcm_bankWidgetHost");
  const snapshotEl = container.querySelector("#qcm_bankSnapshot");
  if (!host) return;

  const teacherSpaceId = Number(context?.teacherSpace?.id ?? context?.teacher_space_id ?? 0);
  if (!Number.isFinite(teacherSpaceId) || teacherSpaceId <= 0) {
    renderBankWidgetInto(host, {
      value: "",
      options: [{ value: "", label: "Espace enseignant introuvable" }],
      disabled: true,
      count: 0
    });
    setEditorStatus(context, "Impossible de lister les banques sans espace enseignant.", true);
    return;
  }

  setEditorStatus(context, "Chargement des banques QCM…");
  const api = await import("../../teacher/js/teacher-api.js");
  const banks = await api.listQuestionBanksForSpace(teacherSpaceId, { includeSystem: true });
  const qcmBanks = (Array.isArray(banks) ? banks : [])
    .filter((bank) => String(bank?.bank_type || "").trim().toLowerCase() === QCM_BANK_TYPE)
    .sort(compareBanks);

  if (!qcmBanks.length) {
    renderBankWidgetInto(host, {
      value: "",
      options: [{ value: "", label: "Aucune banque QCM" }],
      disabled: true,
      count: 0
    });
    if (snapshotEl) snapshotEl.value = "[]";
    setEditorStatus(context, "Crée d’abord une banque de type “QCM” dans l’onglet Banques.", true);
    return;
  }

  const selectedId = qcmBanks.some((bank) => String(bank.id) === cfg.bankId)
    ? cfg.bankId
    : String(qcmBanks[0].id || "");
  const bankOptions = qcmBanks.map((bank) => ({
    value: String(bank.id || ""),
    label: `${String(bank.title || "Banque sans titre")}${bank.is_system ? " · système" : ""}`
  }));
  const bankById = new Map(qcmBanks.map((bank) => [String(bank.id || ""), bank]));

  renderBankWidgetInto(host, {
    value: selectedId,
    options: bankOptions,
    disabled: false,
    count: normalizeQcmItems(cfg.bankItemsSnapshot).length
  });

  const select = container.querySelector("#qcm_bankSelect");
  if (!select) return;
  setSelectedBankTitle(select, bankById);

  let loadToken = 0;
  const loadSelectedBank = async () => {
    const bankId = String(select.value || "").trim();
    const token = loadToken + 1;
    loadToken = token;
    select.dataset.qcmItemsLoaded = "false";
    setEditorStatus(context, "Chargement des QCM…");
    setBankCount(container, null);
    setQuestionSelectionLoading(container);
    setSelectedBankTitle(select, bankById);

    try {
      const items = await api.listQuestionBankItems(bankId);
      if (token !== loadToken || String(select.value || "").trim() !== bankId) return;
      const normalizedItems = normalizeQcmItems(items);
      if (snapshotEl) snapshotEl.value = JSON.stringify(normalizedItems);
      select.dataset.qcmItemsLoaded = "true";
      setBankCount(container, normalizedItems.length);
      refreshQuestionSelectionWidget(container, normalizedItems, getSelectionForLoadedBank(container, cfg, bankId));
      if (normalizedItems.length) {
        clearEditorStatus(context);
      } else {
        setEditorStatus(context, "Cette banque ne contient aucun QCM exploitable.", true);
      }
    } catch (err) {
      if (token !== loadToken || String(select.value || "").trim() !== bankId) return;
      const previousSnapshot = String(bankId) === String(cfg.bankId)
        ? normalizeQcmItems(cfg.bankItemsSnapshot)
        : [];
      if (snapshotEl) snapshotEl.value = JSON.stringify(previousSnapshot);
      select.dataset.qcmItemsLoaded = previousSnapshot.length ? "true" : "false";
      setBankCount(container, previousSnapshot.length);
      refreshQuestionSelectionWidget(container, previousSnapshot, getSelectionForLoadedBank(container, cfg, bankId));
      setEditorStatus(context, err?.message || "Impossible de charger les QCM de cette banque.", true);
    }
  };

  bindSelect(container, "qcm_bankSelect", {
    onChange: () => {
      setSelectedBankTitle(select, bankById);
      loadSelectedBank().catch(() => {});
    }
  });

  await loadSelectedBank();
}


function setupQuestionSelection(container, items = [], selection = {}) {
  refreshQuestionSelectionWidget(container, items, selection);
}

function ensureQuestionSelectionAssets(container) {
  return loadToolAssetsManifest().then(() => {
    const snapshotEl = container.querySelector("#qcm_bankSnapshot");
    const items = readSnapshot(snapshotEl?.value || "[]");
    const selection = readQuestionSelection(container, items, { allowEmpty: true });
    refreshQuestionSelectionWidget(container, items, selection);
  });
}

function refreshQuestionSelectionWidget(container, items = [], selection = null) {
  const host = container.querySelector("#qcm_questionSelectionHost");
  if (!host) return;
  const normalizedItems = normalizeQcmItems(items);
  const safeSelection = selection || readQuestionSelection(container, normalizedItems, { allowEmpty: true });
  host.innerHTML = renderQuestionSelectionWidget({ items: normalizedItems, selection: safeSelection });
  bindQuestionSelectionWidget(host);
  updateQuestionSelectionUi(host);
}

function setQuestionSelectionLoading(container) {
  const host = container.querySelector("#qcm_questionSelectionHost");
  if (!host) return;
  const currentSelection = readQuestionSelection(container, [], { allowEmpty: true });
  host.innerHTML = renderQuestionSelectionWidget({
    items: [],
    selection: currentSelection,
    loading: true
  });
  bindQuestionSelectionWidget(host);
  updateQuestionSelectionUi(host);
}

function getSelectionForLoadedBank(container, cfg, bankId) {
  const sameInitialBank = String(bankId || "").trim() === String(cfg?.bankId || "").trim();
  if (!sameInitialBank) {
    return { mode: DEFAULT_QUESTION_SELECTION_MODE, questionKeys: [] };
  }
  return readQuestionSelection(container, [], {
    fallback: cfg.questionSelection,
    allowEmpty: true
  });
}

function renderQuestionSelectionWidget({ items = [], selection = {}, loading = false } = {}) {
  const normalizedItems = normalizeQcmItems(items);
  const safeSelection = normalizeQuestionSelection(selection);
  const mode = safeSelection.mode === "custom" ? "custom" : DEFAULT_QUESTION_SELECTION_MODE;
  const selectedKeys = new Set(safeSelection.questionKeys);
  const selectedCount = mode === "custom"
    ? normalizedItems.filter((item, index) => selectedKeys.has(getQcmItemSelectionKey(item, index))).length
    : normalizedItems.length;
  const quickValue = mode === "custom" ? formatQuestionRanges(normalizedItems, selectedKeys) : "";
  const customHidden = mode !== "custom";

  return `
    <div class="tv-group qcm-question-selection${mode === "custom" ? " is-custom" : ""}" data-qcm-question-selection data-qcm-loading="${loading ? "true" : "false"}">
      <div class="qcm-question-selection-header">
        <div class="qcm-question-selection-title-line">
          <div class="tv-group-title">Sélection de questions</div>
          <div class="qcm-question-selection-summary" data-qcm-selection-summary>
            ${renderSelectionSummary({ mode, selectedCount, total: normalizedItems.length, loading })}
          </div>
        </div>
        <div class="qcm-question-selection-mode tv-radio-options" role="radiogroup" aria-label="Sélection de questions">
          <label class="tv-radio-row">
            <input class="tv-radio" type="radio" name="qcm_questionSelectionMode" value="all" ${mode === "all" ? "checked" : ""}>
            <span>Toutes les questions</span>
          </label>
          <label class="tv-radio-row">
            <input class="tv-radio" type="radio" name="qcm_questionSelectionMode" value="custom" ${mode === "custom" ? "checked" : ""}>
            <span>Sélection personnalisée</span>
          </label>
        </div>
      </div>
      <div class="qcm-question-selection-panel" data-qcm-selection-panel ${customHidden ? "hidden" : ""}>
        <div class="qcm-question-selection-quick-row">
          <label class="qcm-question-selection-quick-field">
            <span>Sélection rapide</span>
            <input
              id="qcm_questionSelectionQuick"
              class="tv-input qcm-question-selection-quick-input"
              type="text"
              value="${escapeHtml(quickValue)}"
              placeholder="Ex : 1-5, 10-15"
              autocomplete="off"
              ${loading ? "disabled" : ""}
            >
          </label>
          <div class="qcm-question-selection-actions">
            <button class="btn qcm-question-selection-action" type="button" data-qcm-selection-action="all" ${loading ? "disabled" : ""}>Tout cocher</button>
            <button class="btn qcm-question-selection-action" type="button" data-qcm-selection-action="none" ${loading ? "disabled" : ""}>Tout décocher</button>
          </div>
        </div>
        <div class="qcm-question-selection-list" role="list" aria-label="Questions de la banque">
          ${renderQuestionSelectionRows(normalizedItems, selectedKeys, { loading })}
        </div>
      </div>
    </div>
  `;
}

function renderSelectionSummary({ mode = "all", selectedCount = 0, total = 0, loading = false } = {}) {
  if (loading) return "(chargement…)";
  const safeTotal = Math.max(0, Math.trunc(Number(total) || 0));
  const safeSelected = Math.max(0, Math.min(safeTotal, Math.trunc(Number(selectedCount) || 0)));
  if (!safeTotal) return "(actuellement : aucune question)";
  const count = mode === "custom" ? safeSelected : safeTotal;
  return `(actuellement : ${count} question${count > 1 ? "s" : ""})`;
}

function renderQuestionSelectionRows(items = [], selectedKeys = new Set(), { loading = false } = {}) {
  const normalizedItems = normalizeQcmItems(items);
  if (loading) {
    return `<div class="qcm-question-selection-empty">Chargement…</div>`;
  }
  if (!normalizedItems.length) {
    return `<div class="qcm-question-selection-empty">Aucune question à afficher.</div>`;
  }

  return normalizedItems.map((item, index) => {
    const key = getQcmItemSelectionKey(item, index);
    const checked = selectedKeys.has(key);
    return `
      <label class="qcm-question-selection-row" role="listitem">
        <input class="qcm-question-selection-check" type="checkbox" data-question-key="${escapeHtml(key)}" ${checked ? "checked" : ""}>
        <span class="qcm-question-selection-index">${index + 1}</span>
        <span class="qcm-question-selection-preview qcm-question-selection-preview--question">
          ${renderContentPreview(item.promptContent, { fallback: item.prompt || `Question ${index + 1}` })}
        </span>
        <span class="qcm-question-selection-arrow" aria-hidden="true">→</span>
        <span class="qcm-question-selection-preview qcm-question-selection-preview--answer">
          ${renderContentPreview(item.correctAnswerContent, { fallback: item.correctAnswer || "Réponse" })}
        </span>
      </label>
    `;
  }).join("");
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

function bindQuestionSelectionWidget(host) {
  const root = host.querySelector("[data-qcm-question-selection]");
  if (!root) return;

  root.querySelectorAll('input[name="qcm_questionSelectionMode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (getQuestionSelectionMode(root) === "custom" && !getCheckedQuestionKeys(root).length) {
        setAllQuestionChecks(root, true);
      }
      updateQuickInputFromChecks(root);
      updateQuestionSelectionUi(host);
    });
  });

  root.querySelector("#qcm_questionSelectionQuick")?.addEventListener("input", (event) => {
    const input = event.currentTarget;
    const selectedIndexes = parseQuestionRangeInput(input?.value || "", root.querySelectorAll(".qcm-question-selection-check").length);
    root.querySelectorAll(".qcm-question-selection-check").forEach((checkbox, index) => {
      checkbox.checked = selectedIndexes.has(index + 1);
    });
    updateQuestionSelectionUi(host, { preserveQuickInput: true });
  });

  root.querySelectorAll(".qcm-question-selection-check").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      updateQuickInputFromChecks(root);
      updateQuestionSelectionUi(host);
    });
  });

  root.querySelectorAll("[data-qcm-selection-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = String(button.dataset.qcmSelectionAction || "");
      if (action === "all") setAllQuestionChecks(root, true);
      if (action === "none") setAllQuestionChecks(root, false);
      updateQuickInputFromChecks(root);
      updateQuestionSelectionUi(host);
    });
  });
}

function updateQuestionSelectionUi(host, { preserveQuickInput = false } = {}) {
  const root = host.querySelector("[data-qcm-question-selection]");
  if (!root) return;
  const mode = getQuestionSelectionMode(root);
  const isCustom = mode === "custom";
  const panel = root.querySelector("[data-qcm-selection-panel]");
  const total = root.querySelectorAll(".qcm-question-selection-check").length;
  const selected = getCheckedQuestionKeys(root).length;
  const loading = root.dataset.qcmLoading === "true";
  root.classList.toggle("is-custom", isCustom);
  if (panel) panel.hidden = !isCustom;
  root.querySelector("[data-qcm-selection-summary]").textContent = renderSelectionSummary({
    mode,
    selectedCount: selected,
    total,
    loading
  });
  if (!preserveQuickInput) updateQuickInputFromChecks(root);
}

function readQuestionSelection(container, items = [], { fallback = null, allowEmpty = false } = {}) {
  const root = container.querySelector("[data-qcm-question-selection]");
  if (!root) return normalizeQuestionSelection(fallback || { mode: DEFAULT_QUESTION_SELECTION_MODE, questionKeys: [] });

  const mode = getQuestionSelectionMode(root);
  if (mode !== "custom") {
    return { mode: DEFAULT_QUESTION_SELECTION_MODE, questionKeys: [] };
  }

  const questionKeys = getCheckedQuestionKeys(root);
  if (!questionKeys.length && allowEmpty && fallback) {
    return normalizeQuestionSelection(fallback);
  }

  return normalizeQuestionSelection({ mode: "custom", questionKeys });
}

function getQuestionSelectionMode(root) {
  return String(root?.querySelector('input[name="qcm_questionSelectionMode"]:checked')?.value || DEFAULT_QUESTION_SELECTION_MODE).trim() === "custom"
    ? "custom"
    : DEFAULT_QUESTION_SELECTION_MODE;
}

function getCheckedQuestionKeys(root) {
  return Array.from(root?.querySelectorAll(".qcm-question-selection-check:checked") || [])
    .map((checkbox) => String(checkbox.dataset.questionKey || "").trim())
    .filter(Boolean);
}

function setAllQuestionChecks(root, checked) {
  root.querySelectorAll(".qcm-question-selection-check").forEach((checkbox) => {
    checkbox.checked = Boolean(checked);
  });
}

function updateQuickInputFromChecks(root) {
  const input = root.querySelector("#qcm_questionSelectionQuick");
  if (!input) return;
  const selectedIndexes = new Set();
  root.querySelectorAll(".qcm-question-selection-check").forEach((checkbox, index) => {
    if (checkbox.checked) selectedIndexes.add(index + 1);
  });
  input.value = formatRangesFromIndexes(selectedIndexes);
}

function formatQuestionRanges(items = [], selectedKeys = new Set()) {
  const selectedIndexes = new Set();
  normalizeQcmItems(items).forEach((item, index) => {
    if (selectedKeys.has(getQcmItemSelectionKey(item, index))) {
      selectedIndexes.add(index + 1);
    }
  });
  return formatRangesFromIndexes(selectedIndexes);
}

function formatRangesFromIndexes(selectedIndexes = new Set()) {
  const values = Array.from(selectedIndexes)
    .map((value) => Math.trunc(Number(value)))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (!values.length) return "";

  const ranges = [];
  let start = values[0];
  let previous = values[0];
  for (let index = 1; index <= values.length; index += 1) {
    const current = values[index];
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    ranges.push(start === previous ? String(start) : `${start}-${previous}`);
    start = current;
    previous = current;
  }
  return ranges.join(", ");
}

function parseQuestionRangeInput(value = "", maxIndex = 0) {
  const selected = new Set();
  const safeMax = Math.max(0, Math.trunc(Number(maxIndex) || 0));
  const segments = String(value || "")
    .replace(/[–—]/g, "-")
    .split(/[,;\n]+/g)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const rangeMatch = segment.match(/^(\d+)\s*-\s*(\d+)$/);
    const singleMatch = segment.match(/^(\d+)$/);
    if (rangeMatch) {
      const first = clampQuestionIndex(rangeMatch[1], safeMax);
      const last = clampQuestionIndex(rangeMatch[2], safeMax);
      if (!first || !last) continue;
      const start = Math.min(first, last);
      const end = Math.max(first, last);
      for (let valueIndex = start; valueIndex <= end; valueIndex += 1) selected.add(valueIndex);
      continue;
    }
    if (singleMatch) {
      const valueIndex = clampQuestionIndex(singleMatch[1], safeMax);
      if (valueIndex) selected.add(valueIndex);
    }
  }

  return selected;
}

function clampQuestionIndex(value, maxIndex) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(maxIndex, parsed);
}

function renderBankWidget({
  value = "",
  options = [],
  disabled = false,
  count = 0
} = {}) {
  return `
    <div class="tv-group tv-group-inline qcm-config-bank-group">
      <div class="tv-select-inline qcm-config-bank-line">
        <div class="tv-group-title tv-select-inline-title">Banque</div>
        <div class="qcm-config-bank-control">
          ${renderSelectControl({
            id: "qcm_bankSelect",
            value,
            options,
            disabled,
            rootClassName: "tv-select-inline-input qcm-config-bank-select"
          })}
          <span class="qcm-config-bank-count" id="qcm_bankCount">${count === null ? "…" : renderQuestionCount(count)}</span>
        </div>
      </div>
    </div>
  `;
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
