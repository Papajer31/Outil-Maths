import {
  renderRadioGroup,
  renderSelectControl,
  renderSection,
  bindCollapsibleSection,
  bindRadio,
  bindSelect,
  readRadio,
  readSelect,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import {
  getDefaultSettings,
  normalizeSelectionItems,
  normalizeSettings,
  DEFAULT_DRAW_MODE,
  DEFAULT_SELECTION_MODE
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
  const drawMode = readRadio(container, "selection_drawMode", DEFAULT_DRAW_MODE);
  const selectionMode = readRadio(container, "selection_selectionMode", DEFAULT_SELECTION_MODE);
  const snapshot = readSnapshot(snapshotEl?.value || "[]");

  if (!bankId || bankId === LOADING_OPTION_VALUE) {
    throw new Error("Sélectionne une banque Sélection.");
  }

  if (!snapshot.length) {
    throw new Error(select?.dataset.selectionItemsLoaded === "true"
      ? "La banque sélectionnée ne contient aucun item exploitable."
      : "Les items de la banque ne sont pas encore chargés.");
  }

  return normalizeSettings({
    ...previous,
    bankId,
    bankTitle,
    drawMode,
    selectionMode,
    bankItemsSnapshot: snapshot
  });
}

export { getDefaultSettings };

async function setupBankSelect(container, cfg, context = {}) {
  const host = container.querySelector("#selection_bankWidgetHost");
  const snapshotEl = container.querySelector("#selection_bankSnapshot");
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

  setEditorStatus(context, "Chargement des banques Sélection…");
  const api = await import("../../teacher/js/teacher-api.js");
  const banks = await api.listQuestionBanksForSpace(teacherSpaceId, { includeSystem: true });
  const selectionBanks = (Array.isArray(banks) ? banks : [])
    .filter((bank) => String(bank?.bank_type || "").trim().toLowerCase() === SELECTION_BANK_TYPE)
    .sort(compareBanks);

  if (!selectionBanks.length) {
    renderBankWidgetInto(host, {
      value: "",
      options: [{ value: "", label: "Aucune banque Sélection" }],
      disabled: true,
      count: 0
    });
    if (snapshotEl) snapshotEl.value = "[]";
    setEditorStatus(context, "Crée d’abord une banque de type “Sélection” dans l’onglet Banques.", true);
    return;
  }

  const selectedId = selectionBanks.some((bank) => String(bank.id) === cfg.bankId)
    ? cfg.bankId
    : String(selectionBanks[0].id || "");
  const bankOptions = selectionBanks.map((bank) => ({
    value: String(bank.id || ""),
    label: `${String(bank.title || "Banque sans titre")}${bank.is_system ? " · proposée" : ""}`
  }));
  const bankById = new Map(selectionBanks.map((bank) => [String(bank.id || ""), bank]));

  renderBankWidgetInto(host, {
    value: selectedId,
    options: bankOptions,
    disabled: false,
    count: normalizeSelectionItems(cfg.bankItemsSnapshot).length
  });

  const select = container.querySelector("#selection_bankSelect");
  if (!select) return;
  setSelectedBankTitle(select, bankById);

  let loadToken = 0;
  const loadSelectedBank = async () => {
    const bankId = String(select.value || "").trim();
    const token = loadToken + 1;
    loadToken = token;
    select.dataset.selectionItemsLoaded = "false";
    setEditorStatus(context, "Chargement des items Sélection…");
    setBankCount(container, null);
    setSelectedBankTitle(select, bankById);

    try {
      const items = await api.listQuestionBankItems(bankId);
      if (token !== loadToken || String(select.value || "").trim() !== bankId) return;
      const normalizedItems = normalizeSelectionItems(items);
      if (snapshotEl) snapshotEl.value = JSON.stringify(normalizedItems);
      select.dataset.selectionItemsLoaded = "true";
      setBankCount(container, normalizedItems.length);
      if (normalizedItems.length) clearEditorStatus(context);
      else setEditorStatus(context, "Cette banque ne contient aucun item Sélection exploitable.", true);
    } catch (err) {
      if (token !== loadToken || String(select.value || "").trim() !== bankId) return;
      const previousSnapshot = String(bankId) === String(cfg.bankId)
        ? normalizeSelectionItems(cfg.bankItemsSnapshot)
        : [];
      if (snapshotEl) snapshotEl.value = JSON.stringify(previousSnapshot);
      select.dataset.selectionItemsLoaded = previousSnapshot.length ? "true" : "false";
      setBankCount(container, previousSnapshot.length);
      setEditorStatus(context, err?.message || "Impossible de charger les items de cette banque.", true);
    }
  };

  bindSelect(container, "selection_bankSelect", {
    onChange: () => {
      setSelectedBankTitle(select, bankById);
      loadSelectedBank().catch(() => {});
    }
  });

  await loadSelectedBank();
}

function renderBankWidget({ value = "", options = [], disabled = false, count = 0 } = {}) {
  return `
    <div class="tv-group tv-group-inline selection-config-bank-group">
      <div class="tv-select-inline selection-config-bank-line">
        <div class="tv-group-title tv-select-inline-title">Banque</div>
        <div class="selection-config-bank-control">
          ${renderSelectControl({
            id: "selection_bankSelect",
            value,
            options,
            disabled,
            rootClassName: "tv-select-inline-input selection-config-bank-select"
          })}
          <span class="selection-config-bank-count" id="selection_bankCount">${count === null ? "…" : renderQuestionCount(count)}</span>
        </div>
      </div>
    </div>
  `;
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
