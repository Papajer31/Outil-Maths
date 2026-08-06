import {
  DEFAULT_QUESTION_SELECTION_MODE,
  getItemSelectionKey,
  normalizeQuestionSelection
} from "./question-selection.js";

let stylesInjected = false;
let questionSelectionRenderId = 0;
const pendingQuestionSelectionStates = new Map();
const boundQuestionSelectionStates = new WeakMap();
const LARGE_SELECTION_THRESHOLD = 80;
const VIRTUAL_SELECTION_ROW_HEIGHT = 40;
const VIRTUAL_SELECTION_OVERSCAN = 8;

export function renderQuestionSelectionWidget({
  idPrefix = "question",
  items = [],
  selection = {},
  loading = false,
  title = "Sélection de questions",
  itemSingular = "question",
  itemPlural = "questions",
  itemKeyGetter = getItemSelectionKey,
  renderRow = defaultRenderQuestionSelectionRow,
  emptyMessage = "Aucune question à afficher.",
  loadingMessage = "Chargement…",
  listAriaLabel = "Questions disponibles"
} = {}) {
  ensureQuestionSelectionStyles();

  const safeItems = Array.isArray(items) ? items : [];
  const safeSelection = normalizeQuestionSelection(selection);
  const mode = safeSelection.mode === "custom" ? "custom" : DEFAULT_QUESTION_SELECTION_MODE;
  const selectedKeys = new Set(safeSelection.questionKeys);
  const selectedCount = mode === "custom"
    ? safeItems.filter((item, index) => selectedKeys.has(itemKeyGetter(item, index))).length
    : safeItems.length;
  const quickValue = mode === "custom" ? formatQuestionRanges(safeItems, selectedKeys, itemKeyGetter) : "";
  const customHidden = mode !== "custom";
  const prefix = normalizeIdPrefix(idPrefix);
  const renderId = `question-selection-${++questionSelectionRenderId}`;
  const isLargeSelection = !loading && safeItems.length >= LARGE_SELECTION_THRESHOLD;
  pendingQuestionSelectionStates.set(renderId, {
    items:safeItems,
    selectedKeys,
    itemKeyGetter,
    renderRow,
    isLargeSelection,
    virtualFrame:0,
    virtualStart:-1,
    virtualEnd:-1
  });

  return `
    <div class="tv-group general-question-selection${mode === "custom" ? " is-custom" : ""}" data-question-selection="${escapeHtml(prefix)}" data-question-selection-render-id="${escapeHtml(renderId)}" data-question-selection-loading="${loading ? "true" : "false"}" data-question-selection-singular="${escapeHtml(itemSingular)}" data-question-selection-plural="${escapeHtml(itemPlural)}">
      <div class="general-question-selection-header">
        <div class="general-question-selection-title-line">
          <div class="tv-group-title">${escapeHtml(title)}</div>
          <div class="general-question-selection-summary" data-question-selection-summary>
            ${renderSelectionSummary({ mode, selectedCount, total: safeItems.length, loading, itemSingular, itemPlural })}
          </div>
        </div>
        <div class="general-question-selection-mode tv-radio-options" role="radiogroup" aria-label="${escapeHtml(title)}">
          <label class="tv-radio-row">
            <input class="tv-radio" type="radio" name="${escapeHtml(prefix)}_questionSelectionMode" value="all" ${mode === "all" ? "checked" : ""}>
            <span>Toutes les questions</span>
          </label>
          <label class="tv-radio-row">
            <input class="tv-radio" type="radio" name="${escapeHtml(prefix)}_questionSelectionMode" value="custom" ${mode === "custom" ? "checked" : ""}>
            <span>Sélection personnalisée</span>
          </label>
        </div>
      </div>
      <div class="general-question-selection-panel" data-question-selection-panel ${customHidden ? "hidden" : ""}>
        <div class="general-question-selection-quick-row">
          <label class="general-question-selection-quick-field">
            <span>Sélection rapide</span>
            <input
              id="${escapeHtml(prefix)}_questionSelectionQuick"
              class="tv-input general-question-selection-quick-input"
              type="text"
              value="${escapeHtml(quickValue)}"
              placeholder="Ex : 1-5, 10-15"
              autocomplete="off"
              ${loading ? "disabled" : ""}
            >
          </label>
          <div class="general-question-selection-actions">
            <button class="btn general-question-selection-action" type="button" data-question-selection-action="all" ${loading ? "disabled" : ""}>Tout cocher</button>
            <button class="btn general-question-selection-action" type="button" data-question-selection-action="none" ${loading ? "disabled" : ""}>Tout décocher</button>
          </div>
        </div>
        <div class="general-question-selection-list" role="list" aria-label="${escapeHtml(listAriaLabel)}" data-question-selection-list>
          ${isLargeSelection ? renderVirtualQuestionSelectionList(safeItems.length) : renderQuestionSelectionRows({
            items: safeItems,
            selectedKeys,
            loading,
            loadingMessage,
            emptyMessage,
            itemKeyGetter,
            renderRow
          })}
        </div>
      </div>
    </div>
  `;
}

export function bindQuestionSelectionWidget(host, { idPrefix = "question" } = {}) {
  const root = getQuestionSelectionRoot(host, idPrefix);
  if (!root) return;
  const prefix = normalizeIdPrefix(idPrefix);
  const renderId = String(root.dataset.questionSelectionRenderId || "");
  const state = pendingQuestionSelectionStates.get(renderId) || null;
  pendingQuestionSelectionStates.delete(renderId);
  if (state) boundQuestionSelectionStates.set(root, state);

  root.querySelectorAll(`input[name="${cssEscape(prefix)}_questionSelectionMode"]`).forEach((radio) => {
    radio.addEventListener("change", () => {
      if (getQuestionSelectionMode(root, prefix) === "custom" && state && !state.selectedKeys.size) {
        setAllQuestionKeys(state, true);
      }
      if (getQuestionSelectionMode(root, prefix) === "custom") renderVirtualQuestionRows(root, state, { force:true });
      syncRenderedQuestionChecks(root, state);
      updateQuickInputFromChecks(root, prefix, state);
      updateQuestionSelectionUi(host, { idPrefix });
    });
  });

  root.querySelector(`#${cssEscape(prefix)}_questionSelectionQuick`)?.addEventListener("input", (event) => {
    const input = event.currentTarget;
    const selectedIndexes = parseQuestionRangeInput(input?.value || "", state?.items.length || root.querySelectorAll(".general-question-selection-check").length);
    if (state) {
      state.selectedKeys = new Set(state.items
        .filter((item, index) => selectedIndexes.has(index + 1))
        .map((item, index) => state.itemKeyGetter(item, index)));
      syncRenderedQuestionChecks(root, state);
    } else {
      root.querySelectorAll(".general-question-selection-check").forEach((checkbox, index) => {
        checkbox.checked = selectedIndexes.has(index + 1);
      });
    }
    updateQuestionSelectionUi(host, { idPrefix, preserveQuickInput: true });
  });

  root.addEventListener("change", (event) => {
    const checkbox = event.target?.closest?.(".general-question-selection-check");
    if (!checkbox || !root.contains(checkbox)) return;
    if (state) {
      const key = String(checkbox.dataset.questionKey || "").trim();
      if (checkbox.checked) state.selectedKeys.add(key);
      else state.selectedKeys.delete(key);
      checkbox.closest(".general-question-selection-row")?.classList.toggle("is-selected", checkbox.checked);
    }
    updateQuickInputFromChecks(root, prefix, state);
    updateQuestionSelectionUi(host, { idPrefix });
  });

  root.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-question-selection-action]");
    if (!button || !root.contains(button)) return;
    const action = String(button.dataset.questionSelectionAction || "");
    if (state) {
      if (action === "all") setAllQuestionKeys(state, true);
      if (action === "none") setAllQuestionKeys(state, false);
      syncRenderedQuestionChecks(root, state);
    } else {
      if (action === "all") setAllQuestionChecks(root, true);
      if (action === "none") setAllQuestionChecks(root, false);
    }
    updateQuickInputFromChecks(root, prefix, state);
    updateQuestionSelectionUi(host, { idPrefix });
  });

  root.querySelector("[data-question-selection-list]")?.addEventListener("scroll", () => {
    renderVirtualQuestionRows(root, state);
  }, { passive:true });

  if (state && getQuestionSelectionMode(root, prefix) === "custom") {
    renderVirtualQuestionRows(root, state, { force:true });
  }
}

export function updateQuestionSelectionUi(host, { idPrefix = "question", preserveQuickInput = false } = {}) {
  const root = getQuestionSelectionRoot(host, idPrefix);
  if (!root) return;
  const prefix = normalizeIdPrefix(idPrefix);
  const mode = getQuestionSelectionMode(root, prefix);
  const state = boundQuestionSelectionStates.get(root) || null;
  const isCustom = mode === "custom";
  const panel = root.querySelector("[data-question-selection-panel]");
  const total = state?.items.length ?? root.querySelectorAll(".general-question-selection-check").length;
  const selected = state?.selectedKeys.size ?? getCheckedQuestionKeys(root).length;
  const loading = root.dataset.questionSelectionLoading === "true";
  const itemSingular = root.dataset.questionSelectionSingular || "question";
  const itemPlural = root.dataset.questionSelectionPlural || `${itemSingular}s`;

  root.classList.toggle("is-custom", isCustom);
  if (panel) panel.hidden = !isCustom;
  if (isCustom) renderVirtualQuestionRows(root, state);
  const summary = root.querySelector("[data-question-selection-summary]");
  if (summary) {
    summary.textContent = renderSelectionSummary({
      mode,
      selectedCount: selected,
      total,
      loading,
      itemSingular,
      itemPlural
    });
  }
  if (!preserveQuickInput) updateQuickInputFromChecks(root, prefix, state);
}

export function readQuestionSelection(container, { idPrefix = "question", fallback = null, allowEmpty = false } = {}) {
  const root = getQuestionSelectionRoot(container, idPrefix);
  if (!root) return normalizeQuestionSelection(fallback || { mode: DEFAULT_QUESTION_SELECTION_MODE, questionKeys: [] });

  const prefix = normalizeIdPrefix(idPrefix);
  const mode = getQuestionSelectionMode(root, prefix);
  if (mode !== "custom") {
    return { mode: DEFAULT_QUESTION_SELECTION_MODE, questionKeys: [] };
  }

  const state = boundQuestionSelectionStates.get(root) || null;
  const questionKeys = state ? Array.from(state.selectedKeys) : getCheckedQuestionKeys(root);
  if (!questionKeys.length && allowEmpty && fallback) {
    return normalizeQuestionSelection(fallback);
  }

  return normalizeQuestionSelection({ mode: "custom", questionKeys });
}

export function formatQuestionRanges(items = [], selectedKeys = new Set(), itemKeyGetter = getItemSelectionKey) {
  const selectedIndexes = new Set();
  (Array.isArray(items) ? items : []).forEach((item, index) => {
    if (selectedKeys.has(itemKeyGetter(item, index))) {
      selectedIndexes.add(index + 1);
    }
  });
  return formatRangesFromIndexes(selectedIndexes);
}

export function renderSelectionSummary({
  mode = "all",
  selectedCount = 0,
  total = 0,
  loading = false,
  itemSingular = "question",
  itemPlural = "questions"
} = {}) {
  if (loading) return "(chargement…)";
  const safeTotal = Math.max(0, Math.trunc(Number(total) || 0));
  const safeSelected = Math.max(0, Math.min(safeTotal, Math.trunc(Number(selectedCount) || 0)));
  if (!safeTotal) return `(actuellement : aucune ${itemSingular})`;
  const count = mode === "custom" ? safeSelected : safeTotal;
  const label = count > 1 ? itemPlural : itemSingular;
  return `(actuellement : ${count} ${label})`;
}

function renderQuestionSelectionRows({
  items = [],
  selectedKeys = new Set(),
  loading = false,
  loadingMessage = "Chargement…",
  emptyMessage = "Aucune question à afficher.",
  itemKeyGetter = getItemSelectionKey,
  renderRow = defaultRenderQuestionSelectionRow,
  startIndex = 0,
  endIndex = Infinity
} = {}) {
  const safeItems = Array.isArray(items) ? items : [];
  if (loading) {
    return `<div class="general-question-selection-empty">${escapeHtml(loadingMessage)}</div>`;
  }
  if (!safeItems.length) {
    return `<div class="general-question-selection-empty">${escapeHtml(emptyMessage)}</div>`;
  }

  return safeItems.slice(startIndex, endIndex).map((item, offset) => {
    const index = startIndex + offset;
    const key = itemKeyGetter(item, index);
    const checked = selectedKeys.has(key);
    return renderRow({ item, index, key, checked, escapeHtml });
  }).join("");
}

function renderVirtualQuestionSelectionList(itemCount = 0) {
  const totalHeight = Math.max(0, Math.trunc(Number(itemCount) || 0)) * VIRTUAL_SELECTION_ROW_HEIGHT;
  return `
    <div class="general-question-selection-virtual-spacer" data-question-selection-virtual-spacer style="height:${totalHeight}px">
      <div class="general-question-selection-virtual-rows" data-question-selection-virtual-rows></div>
    </div>
  `;
}

function renderVirtualQuestionRows(root, state, { force = false } = {}){
  if (!state?.isLargeSelection) return;
  const list = root.querySelector("[data-question-selection-list]");
  if (!list || state.virtualFrame) return;
  state.virtualFrame = window.requestAnimationFrame(() => {
    state.virtualFrame = 0;
    if (!list.isConnected) return;
    const viewportHeight = Math.max(list.clientHeight || 0, VIRTUAL_SELECTION_ROW_HEIGHT * 8);
    const visibleRows = Math.ceil(viewportHeight / VIRTUAL_SELECTION_ROW_HEIGHT);
    const startIndex = Math.max(0, Math.floor(list.scrollTop / VIRTUAL_SELECTION_ROW_HEIGHT) - VIRTUAL_SELECTION_OVERSCAN);
    const endIndex = Math.min(state.items.length, startIndex + visibleRows + (VIRTUAL_SELECTION_OVERSCAN * 2));
    if (!force && state.virtualStart === startIndex && state.virtualEnd === endIndex) return;
    const rows = list.querySelector("[data-question-selection-virtual-rows]");
    if (!rows) return;
    rows.style.transform = `translateY(${startIndex * VIRTUAL_SELECTION_ROW_HEIGHT}px)`;
    rows.innerHTML = renderQuestionSelectionRows({
      items:state.items,
      selectedKeys:state.selectedKeys,
      itemKeyGetter:state.itemKeyGetter,
      renderRow:state.renderRow,
      startIndex,
      endIndex
    });
    state.virtualStart = startIndex;
    state.virtualEnd = endIndex;
  });
}

function defaultRenderQuestionSelectionRow({ item = {}, index = 0, key = "", checked = false }) {
  const prompt = String(item?.prompt || item?.title || item?.label || `Question ${index + 1}`).trim();
  const answer = String(item?.mainAnswer || item?.answer || item?.expectedAnswer || item?.payload_json?.expectedSelectionText || "").trim();
  return `
    <label class="general-question-selection-row${checked ? " is-selected" : ""}" role="listitem">
      <input class="general-question-selection-check" type="checkbox" data-question-key="${escapeHtml(key)}" ${checked ? "checked" : ""}>
      <span class="general-question-selection-index">${index + 1}</span>
      <span class="general-question-selection-preview general-question-selection-preview--question">
        <span class="general-question-selection-preview-text">${escapeHtml(prompt)}</span>
      </span>
      ${answer ? `
        <span class="general-question-selection-arrow" aria-hidden="true">→</span>
        <span class="general-question-selection-preview general-question-selection-preview--answer">
          <span class="general-question-selection-preview-text">${escapeHtml(answer)}</span>
        </span>
      ` : ""}
    </label>
  `;
}

function getQuestionSelectionRoot(host, idPrefix = "question") {
  const prefix = normalizeIdPrefix(idPrefix);
  return host?.querySelector?.(`[data-question-selection="${cssEscape(prefix)}"]`) || null;
}

function getQuestionSelectionMode(root, idPrefix = "question") {
  const prefix = normalizeIdPrefix(idPrefix);
  return String(root?.querySelector(`input[name="${cssEscape(prefix)}_questionSelectionMode"]:checked`)?.value || DEFAULT_QUESTION_SELECTION_MODE).trim() === "custom"
    ? "custom"
    : DEFAULT_QUESTION_SELECTION_MODE;
}

function getCheckedQuestionKeys(root) {
  return Array.from(root?.querySelectorAll(".general-question-selection-check:checked") || [])
    .map((checkbox) => String(checkbox.dataset.questionKey || "").trim())
    .filter(Boolean);
}

function setAllQuestionChecks(root, checked) {
  root.querySelectorAll(".general-question-selection-check").forEach((checkbox) => {
    checkbox.checked = Boolean(checked);
  });
}

function updateQuickInputFromChecks(root, idPrefix = "question", state = null) {
  const prefix = normalizeIdPrefix(idPrefix);
  const input = root.querySelector(`#${cssEscape(prefix)}_questionSelectionQuick`);
  if (!input) return;
  if (state) {
    input.value = formatQuestionRanges(state.items, state.selectedKeys, state.itemKeyGetter);
    return;
  }
  const selectedIndexes = new Set();
  root.querySelectorAll(".general-question-selection-check").forEach((checkbox, index) => {
    if (checkbox.checked) selectedIndexes.add(index + 1);
  });
  input.value = formatRangesFromIndexes(selectedIndexes);
}

function setAllQuestionKeys(state, checked) {
  state.selectedKeys = checked
    ? new Set(state.items.map((item, index) => state.itemKeyGetter(item, index)))
    : new Set();
}

function syncRenderedQuestionChecks(root, state) {
  if (!state) return;
  root.querySelectorAll(".general-question-selection-check").forEach((checkbox) => {
    checkbox.checked = state.selectedKeys.has(String(checkbox.dataset.questionKey || "").trim());
    checkbox.closest(".general-question-selection-row")?.classList.toggle("is-selected", checkbox.checked);
  });
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

function normalizeIdPrefix(value = "question") {
  return String(value || "question").trim().replace(/[^a-zA-Z0-9_-]+/g, "_") || "question";
}

function ensureQuestionSelectionStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  if (typeof document === "undefined") return;
  const href = new URL("./question-selection-widget.css", import.meta.url).href;
  if (document.querySelector(`link[data-question-selection-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.questionSelectionStyle = href;
  document.head.appendChild(link);
}

function cssEscape(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(String(value));
  }
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
