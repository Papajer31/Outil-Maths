import {
  renderRadioGroup,
  renderSelectControl,
  renderCheckbox,
  renderStepperField,
  bindRadio,
  bindSelect,
  bindStepperField,
  readRadio,
  readSelect,
  readCheckbox,
  readStepper,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import {
  getDefaultSettings,
  normalizeQcmItems,
  normalizeSettings,
  DEFAULT_DRAW_MODE,
  DEFAULT_MAX_CHOICE_COUNT,
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
    `,
    renderRadioGroup({
      title: "Tirage",
      id: "qcm_drawMode",
      value: cfg.drawMode,
      options: [
        { value: "in_order", label: "Dans l’ordre" },
        { value: "random", label: "Aléatoire" }
      ]
    }),
    `
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
    `
  );

  bindRadio(container, "qcm_drawMode");
  bindStepperField(container, "qcm_maxChoiceCount", { inputMin: MIN_CHOICE_COUNT, inputMax: MAX_CHOICE_COUNT });
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
  const shuffleChoices = readCheckbox(container, "qcm_shuffleChoices");
  const maxChoiceCount = readStepper(container, "qcm_maxChoiceCount", {
    inputMin: MIN_CHOICE_COUNT,
    inputMax: MAX_CHOICE_COUNT
  });
  const snapshot = readSnapshot(snapshotEl?.value || "[]");

  if (!bankId || bankId === LOADING_OPTION_VALUE) {
    throw new Error("Sélectionne une banque QCM.");
  }

  if (!snapshot.length) {
    throw new Error(select?.dataset.qcmItemsLoaded === "true"
      ? "La banque sélectionnée ne contient aucun QCM exploitable."
      : "Les questions de la banque ne sont pas encore chargées.");
  }

  return normalizeSettings({
    ...previous,
    bankId,
    bankTitle,
    drawMode,
    shuffleChoices,
    maxChoiceCount,
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
    label: `${String(bank.title || "Banque sans titre")}${bank.is_system ? " · proposée" : ""}`
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
    setSelectedBankTitle(select, bankById);

    try {
      const items = await api.listQuestionBankItems(bankId);
      if (token !== loadToken || String(select.value || "").trim() !== bankId) return;
      const normalizedItems = normalizeQcmItems(items);
      if (snapshotEl) snapshotEl.value = JSON.stringify(normalizedItems);
      select.dataset.qcmItemsLoaded = "true";
      setBankCount(container, normalizedItems.length);
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
