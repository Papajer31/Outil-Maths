let stylesInjected = false;

export function renderQuestionBankPickerWidget({
  selectId,
  countId,
  value = "",
  options = [],
  disabled = false,
  count = 0,
  countFormatter = defaultCountFormatter,
  emptyLabel = "Aucune banque sélectionnée",
  disabledLabel = "Chargement des banques…",
  entityLabel = "Banque",
  selectButtonLabel = "+ Sélectionner la banque",
  changeButtonLabel = "+ Changer de banque"
} = {}) {
  ensureQuestionBankPickerStyles();

  const safeValue = String(value || "").trim();
  const selectedOption = Array.isArray(options)
    ? options.find((option) => String(option?.value || "") === safeValue)
    : null;
  const title = selectedOption?.label && safeValue && safeValue !== "__loading__"
    ? stripStatusSuffix(selectedOption.label)
    : "";
  const label = disabled
    ? String(options?.[0]?.label || disabledLabel)
    : (title || emptyLabel);
  const hasSelection = safeValue && safeValue !== "__loading__" && title;
  const buttonLabel = hasSelection
    ? changeButtonLabel
    : selectButtonLabel;

  return `
    <div class="tv-group tv-group-inline qb-picker-widget" data-qb-picker-widget>
      <div class="qb-picker-line">
        <div class="tv-group-title qb-picker-title">${escapeHtml(entityLabel)}</div>
        <div class="qb-picker-control">
          <input
            id="${escapeHtml(selectId)}"
            type="hidden"
            value="${escapeHtml(safeValue === "__loading__" ? "" : safeValue)}"
            data-bank-title="${escapeHtml(title)}"
            data-qb-picker-input
          >
          <button class="tool-choice-button qb-picker-button${hasSelection ? " qb-picker-button--change" : ""}" type="button" data-qb-picker-open ${disabled ? "disabled" : ""}>
            ${escapeHtml(buttonLabel)}
          </button>
          <div class="qb-picker-summary${hasSelection ? " is-selected" : ""}" data-qb-picker-summary>
            <span class="qb-picker-bank-name" data-qb-picker-bank-name>${escapeHtml(label)}</span>
            <span class="qb-picker-bank-count" id="${escapeHtml(countId)}" data-qb-picker-count>${count === null ? "…" : escapeHtml(countFormatter(count))}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function setupQuestionBankPicker({
  container,
  context = {},
  selectId,
  countId,
  snapshotId,
  bankType,
  bankTypeLabel = "banques",
  selectedBankId = "",
  bankItemsSnapshot = [],
  normalizeItems = (items) => Array.isArray(items) ? items : [],
  countFormatter = defaultCountFormatter,
  loadingBanksMessage = "Chargement des banques…",
  loadingItemsMessage = "Chargement des questions…",
  noBankMessage = "Aucune banque disponible.",
  emptyBankMessage = "Cette banque ne contient aucun item exploitable.",
  loadErrorMessage = "Impossible de charger les items de cette banque.",
  noSpaceMessage = "Impossible de lister les banques sans espace enseignant.",
  setEditorStatus = () => {},
  clearEditorStatus = () => {},
  onLoadStart = () => {},
  onItemsLoaded = () => {}
} = {}) {
  ensureQuestionBankPickerStyles();

  const input = container?.querySelector?.(`#${cssEscape(selectId)}`);
  const snapshotEl = container?.querySelector?.(`#${cssEscape(snapshotId)}`);
  if (!container || !input) return;

  const initialBankId = String(selectedBankId || "").trim();
  let banks = [];
  let folders = [];
  let loadToken = 0;

  const teacherSpaceId = Number(context?.teacherSpace?.id ?? context?.teacher_space_id ?? 0);
  if (!Number.isFinite(teacherSpaceId) || teacherSpaceId <= 0) {
    updatePickerState(container, {
      selectId,
      countId,
      disabled: true,
      title: "Espace enseignant introuvable",
      count: 0,
      countFormatter
    });
    setEditorStatus(noSpaceMessage, true);
    return;
  }

  updatePickerState(container, {
    selectId,
    countId,
    disabled: true,
    title: loadingBanksMessage,
    count: null,
    countFormatter
  });
  setEditorStatus(loadingBanksMessage, false);

  const api = await import("../../../teacher/js/teacher-api.js");
  const [rawBanks, rawFolders] = await Promise.all([
    api.listQuestionBanksForSpace(teacherSpaceId, { includeSystem: true }),
    typeof api.listQuestionBankFoldersForSpace === "function"
      ? api.listQuestionBankFoldersForSpace(teacherSpaceId)
      : Promise.resolve([])
  ]);

  const safeBankType = String(bankType || "").trim().toLowerCase();
  banks = (Array.isArray(rawBanks) ? rawBanks : [])
    .filter((bank) => String(bank?.bank_type || "").trim().toLowerCase() === safeBankType)
    .sort(compareTreeItems);
  folders = (Array.isArray(rawFolders) ? rawFolders : []).sort(compareTreeItems);

  if (!banks.length) {
    if (snapshotEl) snapshotEl.value = "[]";
    input.value = "";
    input.dataset.bankTitle = "";
    setItemsLoadedFlag(input, selectId, false);
    updatePickerState(container, {
      selectId,
      countId,
      disabled: true,
      title: `Aucune banque ${bankTypeLabel}`,
      count: 0,
      countFormatter
    });
    setEditorStatus(noBankMessage, true);
    onItemsLoaded([], "", { empty: true });
    return;
  }

  updatePickerState(container, {
    selectId,
    countId,
    disabled: false,
    title: initialBankId ? (getBankById(banks, initialBankId)?.title || "Banque sélectionnée") : "Aucune banque sélectionnée",
    value: initialBankId,
    count: normalizeItems(bankItemsSnapshot).length,
    countFormatter
  });

  const openButton = container.querySelector(`[data-qb-picker-open]`);
  openButton?.addEventListener?.("click", () => {
    openBankPickerOverlay({
      banks,
      folders,
      selectedBankId: input.value,
      bankTypeLabel,
      onSelect: (bank) => loadBank(bank).catch(() => {})
    });
  });

  if (initialBankId && getBankById(banks, initialBankId)) {
    await loadBank(getBankById(banks, initialBankId));
  } else {
    if (snapshotEl) snapshotEl.value = JSON.stringify(normalizeItems(bankItemsSnapshot));
    setItemsLoadedFlag(input, selectId, normalizeItems(bankItemsSnapshot).length > 0);
    clearEditorStatus();
  }

  async function loadBank(bank) {
    const bankId = String(bank?.id || "").trim();
    if (!bankId) return;
    const token = loadToken + 1;
    loadToken = token;

    input.value = bankId;
    input.dataset.bankTitle = String(bank?.title || "");
    setItemsLoadedFlag(input, selectId, false);
    updatePickerState(container, {
      selectId,
      countId,
      disabled: false,
      title: bank?.title || "Banque sélectionnée",
      value: bankId,
      count: null,
      countFormatter
    });
    setEditorStatus(loadingItemsMessage, false);
    onLoadStart(bankId, bank);

    try {
      const items = await api.listQuestionBankItems(bankId);
      if (token !== loadToken || String(input.value || "").trim() !== bankId) return;
      const normalizedItems = normalizeItems(items);
      if (snapshotEl) snapshotEl.value = JSON.stringify(normalizedItems);
      setItemsLoadedFlag(input, selectId, true);
      updatePickerState(container, {
        selectId,
        countId,
        disabled: false,
        title: bank?.title || "Banque sélectionnée",
        value: bankId,
        count: normalizedItems.length,
        countFormatter
      });
      onItemsLoaded(normalizedItems, bankId, { bank });
      if (normalizedItems.length) clearEditorStatus();
      else setEditorStatus(emptyBankMessage, true);
    } catch (err) {
      if (token !== loadToken || String(input.value || "").trim() !== bankId) return;
      const fallbackItems = String(bankId) === String(initialBankId)
        ? normalizeItems(bankItemsSnapshot)
        : [];
      if (snapshotEl) snapshotEl.value = JSON.stringify(fallbackItems);
      setItemsLoadedFlag(input, selectId, fallbackItems.length > 0);
      updatePickerState(container, {
        selectId,
        countId,
        disabled: false,
        title: bank?.title || "Banque sélectionnée",
        value: bankId,
        count: fallbackItems.length,
        countFormatter
      });
      onItemsLoaded(fallbackItems, bankId, { bank, error: err });
      setEditorStatus(err?.message || loadErrorMessage, true);
    }
  }
}

function updatePickerState(container, {
  selectId,
  countId,
  disabled = false,
  title = "",
  value = undefined,
  count = 0,
  countFormatter = defaultCountFormatter
} = {}) {
  const input = container.querySelector(`#${cssEscape(selectId)}`);
  const nameEl = container.querySelector("[data-qb-picker-bank-name]");
  const countEl = container.querySelector(`#${cssEscape(countId)}`);
  const button = container.querySelector("[data-qb-picker-open]");

  if (input && value !== undefined) input.value = String(value || "");
  if (input) input.dataset.bankTitle = String(title || "");
  if (nameEl) nameEl.textContent = String(title || "Aucune banque sélectionnée");
  if (countEl) countEl.textContent = count === null ? "…" : countFormatter(count);
  if (button) {
    const hasSelection = Boolean(String(input?.value || "").trim());
    button.disabled = !!disabled;
    button.classList.toggle("qb-picker-button--change", hasSelection);
    button.textContent = hasSelection ? "+ Changer de banque" : "+ Sélectionner la banque";
  }
}

function openBankPickerOverlay({ banks = [], folders = [], selectedBankId = "", bankTypeLabel = "banques", onSelect = () => {} } = {}) {
  closeExistingOverlay();

  const overlay = document.createElement("div");
  overlay.className = "qb-picker-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `
    <div class="qb-picker-modal" role="document">
      <header class="qb-picker-modal-header">
        <div>
          <div class="qb-picker-modal-eyebrow">Banques</div>
          <h2>Sélectionner la banque</h2>
        </div>
       </header>
      <div class="qb-picker-modal-body">
        ${renderBankTree({ banks, folders, selectedBankId, bankTypeLabel })}
      </div>
    </div>
  `;

  const close = () => overlay.remove();
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      close();
      return;
    }

    const bankButton = event.target.closest("[data-qb-picker-bank-id]");
    if (!bankButton) return;
    const bank = getBankById(banks, bankButton.dataset.qbPickerBankId);
    if (!bank) return;
    onSelect(bank);
    close();
  });

  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });

  document.body.appendChild(overlay);
  overlay.querySelector("[data-qb-picker-bank-id].is-selected, [data-qb-picker-bank-id]")?.focus?.();
}

function closeExistingOverlay() {
  document.querySelectorAll(".qb-picker-overlay").forEach((overlay) => overlay.remove());
}

function renderBankTree({ banks, folders, selectedBankId, bankTypeLabel }) {
  const personalBanks = banks.filter((bank) => bank.is_system !== true);
  const systemBanks = banks.filter((bank) => bank.is_system === true);
  const folderByParent = groupBy(folders, (folder) => normalizeId(folder.parent_id));
  const personalBankByFolder = groupBy(personalBanks, (bank) => normalizeId(bank.folder_id));

  return `
    <div class="qb-picker-tree">
      ${renderTreeSection({
        label: "Banques personnelles",
        emptyLabel: `Aucune banque personnelle ${bankTypeLabel}`,
        folders: folderByParent.get("") || [],
        bankByFolder: personalBankByFolder,
        selectedBankId,
        depth: 0
      })}
      ${renderSystemSection({ banks: systemBanks, selectedBankId, bankTypeLabel })}
    </div>
  `;
}

function renderTreeSection({ label, emptyLabel, folders, bankByFolder, selectedBankId, depth }) {
  const rootBanks = bankByFolder.get("") || [];
  const hasContent = folders.length || rootBanks.length;
  return `
    <section class="qb-picker-tree-section">
      <h3>${escapeHtml(label)}</h3>
      ${hasContent
        ? `
          <div class="qb-picker-tree-list">
            ${folders.map((folder) => renderFolderNode({ folder, bankByFolder, selectedBankId, depth })).join("")}
            ${rootBanks.map((bank) => renderBankNode({ bank, selectedBankId, depth })).join("")}
          </div>
        `
        : `<p class="qb-picker-empty">${escapeHtml(emptyLabel)}</p>`}
    </section>
  `;
}

function renderFolderNode({ folder, bankByFolder, selectedBankId, depth }) {
  const childFolders = (folder.children || []).sort(compareTreeItems);
  const folderId = normalizeId(folder.id);
  const nestedBanks = (bankByFolder.get(folderId) || []).sort(compareTreeItems);
  return `
    <div class="qb-picker-folder" style="--qb-depth:${Math.max(0, depth)};">
      <div class="qb-picker-folder-label">📁 ${escapeHtml(folder.name || "Dossier")}</div>
      ${childFolders.map((child) => renderFolderNode({ folder: child, bankByFolder, selectedBankId, depth: depth + 1 })).join("")}
      ${nestedBanks.map((bank) => renderBankNode({ bank, selectedBankId, depth: depth + 1 })).join("")}
    </div>
  `;
}

function renderSystemSection({ banks, selectedBankId, bankTypeLabel }) {
  return `
    <section class="qb-picker-tree-section">
      <h3>Banques système</h3>
      ${banks.length
        ? `<div class="qb-picker-tree-list">${banks.map((bank) => renderBankNode({ bank, selectedBankId, depth: 0, system: true })).join("")}</div>`
        : `<p class="qb-picker-empty">Aucune banque système ${escapeHtml(bankTypeLabel)}</p>`}
    </section>
  `;
}

function renderBankNode({ bank, selectedBankId, depth, system = false }) {
  const bankId = String(bank?.id || "");
  const isSelected = bankId && bankId === String(selectedBankId || "");
  return `
    <button
      class="qb-picker-bank${isSelected ? " is-selected" : ""}"
      type="button"
      data-qb-picker-bank-id="${escapeHtml(bankId)}"
      style="--qb-depth:${Math.max(0, depth)};"
    >
      <span class="qb-picker-bank-icon" aria-hidden="true">${system ? "★" : "•"}</span>
      <span class="qb-picker-bank-title">${escapeHtml(bank?.title || "Banque sans titre")}</span>
      ${system ? '<span class="qb-picker-bank-badge">système</span>' : ""}
    </button>
  `;
}

function groupBy(items, getKey) {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const key = String(getKey(item) || "");
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  map.forEach((list) => list.sort(compareTreeItems));

  const folderMap = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!("parent_id" in item)) return;
    item.children = [];
    folderMap.set(normalizeId(item.id), item);
  });
  folderMap.forEach((folder) => {
    const parentId = normalizeId(folder.parent_id);
    if (parentId && folderMap.has(parentId)) {
      folderMap.get(parentId).children.push(folder);
    }
  });

  return map;
}

function getBankById(banks, id) {
  return (Array.isArray(banks) ? banks : []).find((bank) => String(bank?.id || "") === String(id || "")) || null;
}

function normalizeId(value) {
  return String(value ?? "").trim();
}

function compareTreeItems(a, b) {
  const orderA = Number(a?.display_order);
  const orderB = Number(b?.display_order);
  if (Number.isFinite(orderA) && Number.isFinite(orderB) && orderA !== orderB) return orderA - orderB;
  const nameA = String(a?.name || a?.title || "");
  const nameB = String(b?.name || b?.title || "");
  const nameCompare = nameA.localeCompare(nameB, "fr", { sensitivity: "base" });
  if (nameCompare !== 0) return nameCompare;
  return String(a?.id || "").localeCompare(String(b?.id || ""), "fr", { sensitivity: "base" });
}

function stripStatusSuffix(label) {
  return String(label || "").replace(/\s+·\s+(?:proposée|système)$/i, "").trim();
}

function setItemsLoadedFlag(input, selectId, loaded) {
  if (!input) return;
  const key = getItemsLoadedDatasetKey(selectId);
  if (key) input.dataset[key] = loaded ? "true" : "false";
  input.dataset.itemsLoaded = loaded ? "true" : "false";
}

function getItemsLoadedDatasetKey(selectId) {
  if (String(selectId).startsWith("qcm_")) return "qcmItemsLoaded";
  if (String(selectId).startsWith("qr_")) return "qrItemsLoaded";
  if (String(selectId).startsWith("selection_")) return "selectionItemsLoaded";
  return "";
}

function defaultCountFormatter(count = 0) {
  const safeCount = Math.max(0, Math.trunc(Number(count) || 0));
  return `${safeCount} item${safeCount > 1 ? "s" : ""}`;
}

function ensureQuestionBankPickerStyles() {
  if (typeof document === "undefined") return;
  const href = new URL("./question-bank-picker.css", import.meta.url).href;
  const selector = `link[data-qb-picker-style="${href}"]`;
  if (document.querySelector(selector)) {
    stylesInjected = true;
    return;
  }

  // Le panneau de test catalogue peut démonter puis reconstruire l’éditeur
  // sans recharger le module ES. On ne doit donc jamais se fier au seul
  // booléen de module : si la balise <link> a disparu, on la recrée.
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.qbPickerStyle = href;
  document.head.appendChild(link);
  stylesInjected = true;
}

function cssEscape(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
