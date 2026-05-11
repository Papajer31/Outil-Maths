import {
  renderRadioGroup,
  renderSelectControl,
  bindRadio,
  bindSelect,
  readRadio,
  readSelect,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import {
  getDefaultSettings,
  normalizeQuestionItems,
  normalizeSettings,
  DEFAULT_DRAW_MODE
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
    `,
    renderRadioGroup({
      title: "Tirage",
      id: "qr_drawMode",
      value: cfg.drawMode,
      options: [
        { value: "in_order", label: "Dans l’ordre" },
        { value: "random", label: "Aléatoire" }
      ]
    })
  );

  bindRadio(container, "qr_drawMode");
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
  const drawMode = readRadio(container, "qr_drawMode", DEFAULT_DRAW_MODE);
  const snapshot = readSnapshot(snapshotEl?.value || "[]");

  if (!bankId || bankId === LOADING_OPTION_VALUE) {
    throw new Error("Sélectionne une banque de questions.");
  }

  if (!snapshot.length) {
    throw new Error(select?.dataset.qrItemsLoaded === "true"
      ? "La banque sélectionnée ne contient aucune question exploitable."
      : "Les questions de la banque ne sont pas encore chargées.");
  }

  return normalizeSettings({
    ...previous,
    bankId,
    bankTitle,
    drawMode,
    bankItemsSnapshot: snapshot
  });
}

export { getDefaultSettings };

async function setupBankSelect(container, cfg, context = {}) {
  const host = container.querySelector("#qr_bankWidgetHost");
  const snapshotEl = container.querySelector("#qr_bankSnapshot");
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

  setEditorStatus(context, "Chargement des banques…");
  const api = await import("../../teacher/js/teacher-api.js");
  const banks = await api.listQuestionBanksForSpace(teacherSpaceId, { includeSystem: true });
  const textBanks = (Array.isArray(banks) ? banks : [])
    .filter((bank) => String(bank?.bank_type || TEXT_ANSWER_TYPE).trim().toLowerCase() === TEXT_ANSWER_TYPE)
    .sort(compareBanks);

  if (!textBanks.length) {
    renderBankWidgetInto(host, {
      value: "",
      options: [{ value: "", label: "Aucune banque disponible" }],
      disabled: true,
      count: 0
    });
    if (snapshotEl) snapshotEl.value = "[]";
    setEditorStatus(context, "Crée d’abord une banque de type “Texte” dans l’onglet Banques.", true);
    return;
  }

  const selectedId = textBanks.some((bank) => String(bank.id) === cfg.bankId)
    ? cfg.bankId
    : String(textBanks[0].id || "");
  const bankOptions = textBanks.map((bank) => ({
    value: String(bank.id || ""),
    label: `${String(bank.title || "Banque sans titre")}${bank.is_system ? " · proposée" : ""}`
  }));
  const bankById = new Map(textBanks.map((bank) => [String(bank.id || ""), bank]));

  renderBankWidgetInto(host, {
    value: selectedId,
    options: bankOptions,
    disabled: false,
    count: normalizeQuestionItems(cfg.bankItemsSnapshot).length
  });

  const select = container.querySelector("#qr_bankSelect");
  if (!select) return;
  setSelectedBankTitle(select, bankById);

  let loadToken = 0;
  const loadSelectedBank = async () => {
    const bankId = String(select.value || "").trim();
    const token = loadToken + 1;
    loadToken = token;
    select.dataset.qrItemsLoaded = "false";
    setEditorStatus(context, "Chargement des questions…");
    setBankCount(container, null);
    setSelectedBankTitle(select, bankById);

    try {
      const items = await api.listQuestionBankItems(bankId);
      if (token !== loadToken || String(select.value || "").trim() !== bankId) return;
      const normalizedItems = normalizeQuestionItems(items);
      if (snapshotEl) snapshotEl.value = JSON.stringify(normalizedItems);
      select.dataset.qrItemsLoaded = "true";
      setBankCount(container, normalizedItems.length);
      if (normalizedItems.length) {
        clearEditorStatus(context);
      } else {
        setEditorStatus(context, "Cette banque ne contient aucune question exploitable.", true);
      }
    } catch (err) {
      if (token !== loadToken || String(select.value || "").trim() !== bankId) return;
      const previousSnapshot = String(bankId) === String(cfg.bankId)
        ? normalizeQuestionItems(cfg.bankItemsSnapshot)
        : [];
      if (snapshotEl) snapshotEl.value = JSON.stringify(previousSnapshot);
      select.dataset.qrItemsLoaded = previousSnapshot.length ? "true" : "false";
      setBankCount(container, previousSnapshot.length);
      setEditorStatus(context, err?.message || "Impossible de charger les questions de cette banque.", true);
    }
  };

  bindSelect(container, "qr_bankSelect", {
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
  count = 0,
} = {}) {
  return `
    <div class="tv-group tv-group-inline qr-config-bank-group">
      <div class="tv-select-inline qr-config-bank-line">
        <div class="tv-group-title tv-select-inline-title">Banque</div>
        <div class="qr-config-bank-control">
          ${renderSelectControl({
            id: "qr_bankSelect",
            value,
            options,
            disabled,
            rootClassName: "tv-select-inline-input qr-config-bank-select"
          })}
          <span class="qr-config-bank-count" id="qr_bankCount">${count === null ? "…" : renderQuestionCount(count)}</span>
        </div>
      </div>
    </div>
  `;
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
