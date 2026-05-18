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
  DEFAULT_ANSWER_FORMAT,
  DEFAULT_COMPOUND_AUXILIARY,
  DEFAULT_DRAW_MODE,
  DEFAULT_PRESET_ID,
  DEFAULT_QUESTION_FORMAT,
  DEFAULT_SOURCE_MODE,
  getDefaultSettings,
  getCompoundAuxiliaryOptions,
  getCustomVerbBlockOptions,
  getPersonOptions,
  getPresetOptions,
  getQuestionStats,
  getTenseOptions,
  getVerbDisplayInfinitive,
  hasSelectedCompoundTense,
  normalizeSettings,
  resolveCustomVerbs,
  resolveSelectedVerbs
} from "./model.js";
import {
  createTeacherConjugationList,
  deleteTeacherConjugationList,
  listTeacherConjugationListUsages,
  listTeacherConjugationLists,
  renameTeacherConjugationList,
  updateTeacherConjugationList
} from "./personal-lists-api.js";

let stylesInjected = false;
let personalListsState = createPersonalListsState();

export function renderToolSettings(container, settings, context = {}) {
  injectStyles();
  container.classList.add("cj-config-root");
  const cfg = normalizeSettings(settings);

  container.innerHTML = `${renderToolSettingsStack(
    renderRadioGroup({
      title: "Verbes",
      id: "cj_sourceMode",
      value: cfg.sourceMode,
      options: [
        { value: "preset", label: "Liste prédéfinie" },
        { value: "personal", label: "Liste personnelle" },
        { value: "custom", label: "Liste fixe" }
      ]
    }),
    `
      <div class="cj-source-panel" id="cj_presetPanel">
        <div class="tv-group tv-group-inline cj-list-group">
          <div class="tv-select-inline cj-list-select-inline">
            <div class="tv-group-title tv-select-inline-title">Liste prédéfinie</div>
            <div class="cj-list-control-row">
              <div class="tv-select-inline-control cj-list-select-control">
                ${renderSelectControl({
                  id: "cj_presetId",
                  value: cfg.presetId,
                  options: getPresetOptions(),
                  rootClassName: "tv-select-inline-input cj-preset-select"
                })}
              </div>
              <button
                type="button"
                class="cj-list-preview-button"
                id="cj_listPreviewButton"
                aria-label="Consulter ou modifier la liste de verbes"
                title="Consulter ou modifier la liste de verbes"
              >
                <span class="cj-material-icon" aria-hidden="true">visibility</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="cj-source-panel" id="cj_personalPanel">
        <div class="tv-group cj-personal-group">
          <div class="cj-personal-header">
            <div class="cj-personal-title-row">
              <div class="tv-group-title">Liste personnelle</div>
              <div class="cj-personal-feedback" id="cj_personalFeedback" hidden></div>
            </div>
            <div class="cj-personal-status" id="cj_personalStatus" aria-live="polite"></div>
          </div>
          <div class="cj-personal-row">
            <div class="tv-select-inline-control cj-personal-select-control" id="cj_personalSelectHost">
              ${renderPersonalListSelect(cfg)}
            </div>
            <button type="button" class="cj-personal-action" id="cj_personalCreate">Créer</button>
            <button type="button" class="cj-personal-action" id="cj_personalRename">Renommer</button>
            <button type="button" class="cj-personal-action" id="cj_personalUpdate">Mettre à jour</button>
            <button type="button" class="cj-personal-action cj-personal-action-danger" id="cj_personalDelete">Supprimer</button>
          </div>
          <textarea
            class="tv-input cj-personal-textarea"
            id="cj_personalVerbsText"
            rows="5"
            spellcheck="false"
            placeholder="Contenu de la liste personnelle sélectionnée."
          >${escapeHtml(cfg.personalListVerbsText)}</textarea>
        </div>
      </div>
      <div class="cj-source-panel" id="cj_customPanel">
        <div class="tv-group cj-custom-group">
          <div class="cj-custom-header">
            <div class="cj-custom-title-row">
              <div class="tv-group-title">Liste fixe</div>
              <div class="cj-custom-feedback" id="cj_customFeedback" hidden></div>
            </div>
          </div>
          ${renderCustomVerbBlockButtons()}
          <textarea
            class="tv-input cj-custom-textarea"
            id="cj_customVerbsText"
            rows="5"
            spellcheck="false"
            placeholder="Un verbe par ligne, ou séparés par des virgules.
Ex. : chanter, finir, prendre, aller"
          >${escapeHtml(cfg.customVerbsText)}</textarea>
        </div>
      </div>
    `,
    renderCheckboxGroup({
      title: "Temps",
      idPrefix: "cj_tense",
      values: cfg.tenses,
      options: getTenseOptions()
    }),
    `
      <div class="cj-compound-auxiliary-panel" id="cj_compoundAuxiliaryPanel">
        ${renderRadioGroup({
          title: "Auxiliaire des temps composés",
          id: "cj_compoundAuxiliary",
          value: cfg.compoundAuxiliary,
          options: getCompoundAuxiliaryOptions()
        })}
      </div>
    `,
    renderCheckboxGroup({
      title: "Personnes",
      idPrefix: "cj_person",
      values: cfg.persons,
      options: getPersonOptions()
    }),
    renderRadioGroup({
      title: "Affichage de la question",
      id: "cj_questionFormat",
      value: cfg.questionFormat,
      options: [
        { value: "pronoun", label: "verbe + temps + pronom" },
        { value: "grammar", label: "personne grammaticale" }
      ]
    }),
    renderRadioGroup({
      title: "Réponse attendue",
      id: "cj_answerFormat",
      value: cfg.answerFormat,
      options: [
        { value: "form_only", label: "forme verbale seule" },
        { value: "with_pronoun", label: "pronom + forme verbale" }
      ]
    }),
    renderRadioGroup({
      title: "Tirage",
      id: "cj_drawMode",
      value: cfg.drawMode,
      options: [
        { value: "random", label: "Aléatoire" },
        { value: "in_order", label: "Dans l’ordre" }
      ]
    })
  )}${renderListModal()}`;

  bindRadio(container, "cj_sourceMode", { onChange: () => updateDynamicUi(container) });
  bindRadio(container, "cj_questionFormat");
  bindRadio(container, "cj_answerFormat");
  bindRadio(container, "cj_compoundAuxiliary", { onChange: () => updateDynamicUi(container) });
  bindRadio(container, "cj_drawMode");
  bindSelect(container, "cj_presetId", { onChange: () => updateDynamicUi(container) });
  bindPersonalListSelect(container);
  bindCheckboxUpdates(container, "cj_tense", () => updateDynamicUi(container));
  bindCheckboxUpdates(container, "cj_person", () => updateDynamicUi(container));

  const personalText = container.querySelector("#cj_personalVerbsText");
  personalText?.addEventListener("input", () => updateDynamicUi(container));
  bindPersonalListActions(container, context);

  const customText = container.querySelector("#cj_customVerbsText");
  customText?.addEventListener("input", () => updateDynamicUi(container));

  bindCustomVerbBlocks(container);
  bindListModal(container);
  updateDynamicUi(container);
  void ensurePersonalListsLoaded(container, context, cfg.personalListId);
}

export function readToolSettings(container, settings = {}) {
  const previous = normalizeSettings(settings);
  const nextSettings = normalizeSettings({
    ...previous,
    sourceMode: readRadio(container, "cj_sourceMode", DEFAULT_SOURCE_MODE),
    presetId: readSelect(container, "cj_presetId", { parse: (value) => value }) || DEFAULT_PRESET_ID,
    personalListId: readSelect(container, "cj_personalListId", { parse: (value) => String(value || "").trim() }),
    personalListName: getSelectedPersonalList(container)?.name || "",
    personalListVerbsText: String(container.querySelector("#cj_personalVerbsText")?.value ?? ""),
    customVerbsText: String(container.querySelector("#cj_customVerbsText")?.value ?? ""),
    tenses: readCheckedValues(container, "cj_tense"),
    compoundAuxiliary: readRadio(container, "cj_compoundAuxiliary", DEFAULT_COMPOUND_AUXILIARY),
    persons: readCheckedValues(container, "cj_person"),
    questionFormat: readRadio(container, "cj_questionFormat", DEFAULT_QUESTION_FORMAT),
    answerFormat: readRadio(container, "cj_answerFormat", DEFAULT_ANSWER_FORMAT),
    drawMode: readRadio(container, "cj_drawMode", DEFAULT_DRAW_MODE)
  });

  if (!nextSettings.tenses.length) {
    throw new Error("Sélectionne au moins un temps.");
  }
  if (!nextSettings.persons.length) {
    throw new Error("Sélectionne au moins une personne.");
  }

  if (nextSettings.sourceMode === "personal") {
    if (!nextSettings.personalListId) {
      throw new Error("Choisis une liste personnelle.");
    }
    const personalResolution = resolveCustomVerbs(nextSettings.personalListVerbsText);
    if (!personalResolution.requested) {
      throw new Error("La liste personnelle sélectionnée ne contient aucun verbe.");
    }
  }

  if (nextSettings.sourceMode === "custom") {
    const customResolution = resolveCustomVerbs(nextSettings.customVerbsText);
    if (!customResolution.requested) {
      throw new Error("Saisis au moins un verbe à l’infinitif.");
    }
  }

  const stats = getQuestionStats(nextSettings);
  if (!stats.verbCount) {
    throw new Error("Aucun verbe exploitable dans la sélection.");
  }
  if (!stats.questionCount) {
    throw new Error("Aucune forme disponible avec ces verbes, ces temps et ces personnes.");
  }

  return nextSettings;
}

export { getDefaultSettings };

function updateDynamicUi(container) {
  const sourceMode = readRadio(container, "cj_sourceMode", DEFAULT_SOURCE_MODE);
  const presetPanel = container.querySelector("#cj_presetPanel");
  const personalPanel = container.querySelector("#cj_personalPanel");
  const customPanel = container.querySelector("#cj_customPanel");
  if (presetPanel) presetPanel.hidden = sourceMode !== "preset";
  if (personalPanel) personalPanel.hidden = sourceMode !== "personal";
  if (customPanel) customPanel.hidden = sourceMode !== "custom";

  const compoundAuxiliaryPanel = container.querySelector("#cj_compoundAuxiliaryPanel");
  if (compoundAuxiliaryPanel) {
    compoundAuxiliaryPanel.hidden = !hasSelectedCompoundTense(readCheckedValues(container, "cj_tense"));
  }

  updatePersonalFeedback(container);
  updateCustomFeedback(container);
  updateCustomVerbBlockStates(container);
  updateOpenModalStats(container);
}


function createPersonalListsState() {
  return {
    teacherSpaceId: null,
    status: "idle",
    lists: [],
    requestId: 0,
    error: ""
  };
}

function getTeacherSpaceId(context = {}) {
  const id = Number(context?.teacherSpace?.id || 0);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

function getPersonalListSelectOptions(cfg = {}) {
  const selectedId = String(cfg.personalListId || "").trim();
  const selectedName = String(cfg.personalListName || "").trim();
  const options = [];

  options.push({
    value: "",
    label: personalListsState.status === "loading" ? "Chargement…" : "Choisir une liste"
  });

  personalListsState.lists.forEach((list) => {
    options.push({
      value: String(list.id),
      label: String(list.name || "Liste sans nom")
    });
  });

  if (selectedId && !personalListsState.lists.some((list) => String(list.id) === selectedId)) {
    options.push({
      value: selectedId,
      label: selectedName || "Liste introuvable"
    });
  }

  return options;
}

function renderPersonalListSelect(cfg = {}) {
  return renderSelectControl({
    id: "cj_personalListId",
    value: String(cfg.personalListId || ""),
    options: getPersonalListSelectOptions(cfg),
    rootClassName: "tv-select-inline-input cj-personal-select"
  });
}

function bindPersonalListSelect(container) {
  bindSelect(container, "cj_personalListId", {
    onChange: () => {
      syncPersonalListSelection(container);
      updateDynamicUi(container);
    }
  });
}

async function ensurePersonalListsLoaded(container, context = {}, selectedId = "") {
  const teacherSpaceId = getTeacherSpaceId(context);
  if (!teacherSpaceId) {
    personalListsState = {
      ...createPersonalListsState(),
      status: "unavailable",
      error: "Connexion enseignant requise."
    };
    updatePersonalListShell(container, { selectedId });
    return;
  }

  if (personalListsState.teacherSpaceId !== teacherSpaceId) {
    personalListsState = createPersonalListsState();
    personalListsState.teacherSpaceId = teacherSpaceId;
  }

  if (personalListsState.status === "ready") {
    updatePersonalListShell(container, { selectedId });
    return;
  }
  if (personalListsState.status === "loading") return;

  personalListsState.status = "loading";
  personalListsState.error = "";
  updatePersonalListShell(container, { selectedId });

  const requestId = ++personalListsState.requestId;
  try {
    const lists = await listTeacherConjugationLists(teacherSpaceId);
    if (requestId !== personalListsState.requestId) return;
    personalListsState.lists = lists;
    personalListsState.status = "ready";
    updatePersonalListShell(container, { selectedId });
  } catch (error) {
    if (requestId !== personalListsState.requestId) return;
    personalListsState.status = "error";
    personalListsState.error = error?.message || "Impossible de charger les listes personnelles.";
    updatePersonalListShell(container, { selectedId });
  }
}

function updatePersonalListShell(container, { selectedId = "" } = {}) {
  const host = container.querySelector("#cj_personalSelectHost");
  if (host) {
    const currentValue = String(selectedId || readSelect(container, "cj_personalListId", { parse: (value) => value }) || "").trim();
    const currentList = personalListsState.lists.find((list) => String(list.id) === currentValue);
    const currentLabel = String(host.querySelector(".tv-custom-select-text")?.textContent || "").trim();
    host.innerHTML = renderPersonalListSelect({
      personalListId: currentValue,
      personalListName: currentList?.name || currentLabel
    });
    bindPersonalListSelect(container);
  }

  const status = container.querySelector("#cj_personalStatus");
  if (status) {
    let isStatusError = false;
    if (personalListsState.status === "loading") {
      status.textContent = "Chargement…";
    } else if (personalListsState.status === "error") {
      status.textContent = personalListsState.error;
      isStatusError = true;
    } else if (personalListsState.status === "unavailable") {
      status.textContent = personalListsState.error || "Connexion requise.";
      isStatusError = true;
    } else if (personalListsState.status === "ready" && !personalListsState.lists.length) {
      status.textContent = "Aucune liste enregistrée.";
    } else {
      status.textContent = "";
    }
    status.classList.toggle("is-error", isStatusError);
  }

  syncPersonalListSelection(container, { preserveExistingText: true });
  updatePersonalFeedback(container);
}

function getSelectedPersonalList(container) {
  const id = readSelect(container, "cj_personalListId", { parse: (value) => String(value || "").trim() });
  if (!id) return null;
  return personalListsState.lists.find((list) => String(list.id) === id) || null;
}

function syncPersonalListSelection(container, { preserveExistingText = false } = {}) {
  const selected = getSelectedPersonalList(container);
  const textarea = container.querySelector("#cj_personalVerbsText");
  if (!textarea) return;

  if (selected) {
    textarea.value = selected.verbsText;
    return;
  }

  if (!preserveExistingText) textarea.value = "";
}

function updatePersonalFeedback(container) {
  const sourceMode = readRadio(container, "cj_sourceMode", DEFAULT_SOURCE_MODE);
  const feedback = container.querySelector("#cj_personalFeedback");
  if (!feedback) return;

  if (sourceMode !== "personal") {
    feedback.hidden = true;
    feedback.textContent = "";
    return;
  }

  const resolution = resolveCustomVerbs(String(container.querySelector("#cj_personalVerbsText")?.value ?? ""));
  if (!resolution.unknown.length) {
    feedback.hidden = true;
    feedback.textContent = "";
    return;
  }

  feedback.hidden = false;
  feedback.textContent = `Verbe${resolution.unknown.length > 1 ? "s" : ""} non reconnu${resolution.unknown.length > 1 ? "s" : ""} : ${resolution.unknown.join(", ")}.`;
}

function bindPersonalListActions(container, context = {}) {
  container.querySelector("#cj_personalCreate")?.addEventListener("click", () => {
    void createPersonalListFromUi(container, context);
  });
  container.querySelector("#cj_personalRename")?.addEventListener("click", () => {
    void renamePersonalListFromUi(container, context);
  });
  container.querySelector("#cj_personalUpdate")?.addEventListener("click", () => {
    void updatePersonalListFromUi(container, context);
  });
  container.querySelector("#cj_personalDelete")?.addEventListener("click", () => {
    void deletePersonalListFromUi(container, context);
  });
}

async function createPersonalListFromUi(container, context = {}) {
  const teacherSpaceId = getTeacherSpaceId(context);
  if (!teacherSpaceId) return showPersonalMessage(container, "Connexion enseignant requise.", true);

  const name = await openPersonalPromptModal({
    title: "Créer une liste personnelle",
    label: "Nom de la nouvelle liste personnelle",
    value: "",
    confirmLabel: "Créer"
  });
  if (name == null) return;

  const verbsText = getBestPersonalListDraftText(container);
  try {
    const created = await createTeacherConjugationList(teacherSpaceId, { name, verbsText });
    personalListsState.status = "idle";
    await ensurePersonalListsLoaded(container, context, created.id);
    const personalRadio = container.querySelector('input[name="cj_sourceMode"][value="personal"]');
    if (personalRadio) personalRadio.checked = true;
    updatePersonalListShell(container, { selectedId: created.id });
    showPersonalMessage(container, `Liste « ${created.name} » créée.`, false);
    updateDynamicUi(container);
  } catch (error) {
    showPersonalMessage(container, error?.message || "Impossible de créer la liste.", true);
  }
}

async function renamePersonalListFromUi(container, context = {}) {
  const teacherSpaceId = getTeacherSpaceId(context);
  const selected = getSelectedPersonalList(container);
  if (!teacherSpaceId || !selected) return showPersonalMessage(container, "Choisis une liste personnelle à renommer.", true);

  const name = await openPersonalPromptModal({
    title: "Renommer la liste",
    label: "Nouveau nom de la liste personnelle",
    value: selected.name,
    confirmLabel: "Renommer"
  });
  if (name == null) return;

  try {
    const renamed = await renameTeacherConjugationList(teacherSpaceId, selected.id, name);
    personalListsState.status = "idle";
    await ensurePersonalListsLoaded(container, context, renamed.id);
    showPersonalMessage(container, `Liste renommée en « ${renamed.name} ».`, false);
    updateDynamicUi(container);
  } catch (error) {
    showPersonalMessage(container, error?.message || "Impossible de renommer la liste.", true);
  }
}

async function updatePersonalListFromUi(container, context = {}) {
  const teacherSpaceId = getTeacherSpaceId(context);
  const selected = getSelectedPersonalList(container);
  if (!teacherSpaceId || !selected) return showPersonalMessage(container, "Choisis une liste personnelle à mettre à jour.", true);

  const verbsText = String(container.querySelector("#cj_personalVerbsText")?.value ?? "");
  const confirmed = await openPersonalConfirmModal({
    title: "Mettre à jour la liste",
    message: `Mettre à jour la liste « ${selected.name} » ?\n\nLes activités qui l’utilisent utiliseront cette nouvelle version.`,
    confirmLabel: "Mettre à jour"
  });
  if (!confirmed) return;

  try {
    const updated = await updateTeacherConjugationList(teacherSpaceId, selected.id, { verbsText });
    personalListsState.status = "idle";
    await ensurePersonalListsLoaded(container, context, updated.id);
    showPersonalMessage(container, `Liste « ${updated.name} » mise à jour.`, false);
    updateDynamicUi(container);
  } catch (error) {
    showPersonalMessage(container, error?.message || "Impossible de mettre à jour la liste.", true);
  }
}

async function deletePersonalListFromUi(container, context = {}) {
  const teacherSpaceId = getTeacherSpaceId(context);
  const selected = getSelectedPersonalList(container);
  if (!teacherSpaceId || !selected) return showPersonalMessage(container, "Choisis une liste personnelle à supprimer.", true);

  try {
    const usages = await listTeacherConjugationListUsages(teacherSpaceId, selected.id);
    if (usages.length) {
      await openPersonalConfirmModal({
        title: "Suppression impossible",
        message: buildPersonalListUsageMessage(usages),
        confirmLabel: "Fermer",
        showCancel: false
      });
      return;
    }

    const confirmed = await openPersonalConfirmModal({
      title: "Supprimer la liste",
      message: `Supprimer définitivement la liste personnelle « ${selected.name} » ?`,
      confirmLabel: "Supprimer",
      danger: true
    });
    if (!confirmed) return;
    await deleteTeacherConjugationList(teacherSpaceId, selected.id);
    personalListsState.status = "idle";
    await ensurePersonalListsLoaded(container, context, "");
    showPersonalMessage(container, `Liste « ${selected.name} » supprimée.`, false);
    updateDynamicUi(container);
  } catch (error) {
    showPersonalMessage(container, error?.message || "Impossible de supprimer la liste.", true);
  }
}

function getBestPersonalListDraftText(container) {
  const personalText = String(container.querySelector("#cj_personalVerbsText")?.value ?? "").trim();
  if (personalText) return personalText;
  const customText = String(container.querySelector("#cj_customVerbsText")?.value ?? "").trim();
  if (customText) return customText;
  return "";
}

function showPersonalMessage(container, text = "", isError = false) {
  const status = container.querySelector("#cj_personalStatus");
  if (!status) return;
  status.textContent = String(text || "");
  status.classList.toggle("is-error", isError === true);
}

function buildPersonalListUsageMessage(usages = []) {
  const count = usages.length;
  const intro = count > 1
    ? "Cette liste est utilisée par les activités suivantes :"
    : "Cette liste est utilisée par l’activité suivante :";
  const lines = usages.map((usage) => {
    const name = String(usage?.name || "Activité sans nom").trim();
    const path = String(usage?.path || "").trim();
    return path ? `• « ${name} » dans ${path}.` : `• « ${name} » à la racine.`;
  });
  const outro = count > 1
    ? "Supprimez ou modifiez d’abord les activités concernées."
    : "Supprimez ou modifiez d’abord l’activité concernée.";
  return ["Impossible de supprimer cette liste.", "", intro, ...lines, "", outro].join("\n");
}

function openPersonalPromptModal({
  title = "",
  label = "",
  value = "",
  confirmLabel = "Valider"
} = {}) {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "cj-personal-modal";
    modal.innerHTML = `
      <div class="cj-personal-modal-backdrop" data-cj-personal-modal-cancel></div>
      <section
        class="cj-personal-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cj_personalModalTitle"
      >
        <header class="cj-personal-modal-header">
          <h3 class="cj-personal-modal-title" id="cj_personalModalTitle">${escapeHtml(title)}</h3>
          <button type="button" class="cj-personal-modal-close" data-cj-personal-modal-cancel aria-label="Fermer">
            <span class="cj-material-icon" aria-hidden="true">close</span>
          </button>
        </header>
        <div class="cj-personal-modal-body">
          <label class="cj-personal-modal-label" for="cj_personalModalInput">${escapeHtml(label)}</label>
          <input
            class="tv-input cj-personal-modal-input"
            id="cj_personalModalInput"
            type="text"
            value="${escapeHtml(value)}"
          >
        </div>
        <footer class="cj-personal-modal-actions">
          <button type="button" class="cj-personal-modal-secondary" data-cj-personal-modal-cancel>Annuler</button>
          <button type="button" class="cj-personal-modal-primary" data-cj-personal-modal-confirm>${escapeHtml(confirmLabel)}</button>
        </footer>
      </section>
    `;

    document.body.appendChild(modal);

    const input = modal.querySelector("#cj_personalModalInput");
    const confirmButton = modal.querySelector("[data-cj-personal-modal-confirm]");
    let settled = false;

    const close = (result) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeyDown);
      modal.remove();
      resolve(result);
    };

    const onModalClick = (event) => {
      const target = event.target;
      if (target?.closest?.("[data-cj-personal-modal-cancel]")) close(null);
    };

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        close(null);
        return;
      }
      if (event.key === "Enter" && event.target === input) {
        event.preventDefault();
        close(input?.value ?? "");
      }
    }

    modal.addEventListener("click", onModalClick);
    confirmButton?.addEventListener("click", () => close(input?.value ?? ""));
    document.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => {
      input?.focus();
      input?.select?.();
    });
  });
}

function openPersonalConfirmModal({
  title = "",
  message = "",
  confirmLabel = "Valider",
  cancelLabel = "Annuler",
  danger = false,
  showCancel = true
} = {}) {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "cj-personal-modal";
    modal.innerHTML = `
      <div class="cj-personal-modal-backdrop" data-cj-personal-modal-cancel></div>
      <section
        class="cj-personal-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cj_personalModalTitle"
      >
        <header class="cj-personal-modal-header">
          <h3 class="cj-personal-modal-title" id="cj_personalModalTitle">${escapeHtml(title)}</h3>
          <button type="button" class="cj-personal-modal-close" data-cj-personal-modal-cancel aria-label="Fermer">
            <span class="cj-material-icon" aria-hidden="true">close</span>
          </button>
        </header>
        <div class="cj-personal-modal-body">
          <div class="cj-personal-modal-message">${escapeHtml(message)}</div>
        </div>
        <footer class="cj-personal-modal-actions">
          ${showCancel ? `<button type="button" class="cj-personal-modal-secondary" data-cj-personal-modal-cancel>${escapeHtml(cancelLabel)}</button>` : ""}
          <button type="button" class="cj-personal-modal-primary${danger ? " is-danger" : ""}" data-cj-personal-modal-confirm>${escapeHtml(confirmLabel)}</button>
        </footer>
      </section>
    `;

    document.body.appendChild(modal);

    const confirmButton = modal.querySelector("[data-cj-personal-modal-confirm]");
    let settled = false;

    const close = (result) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeyDown);
      modal.remove();
      resolve(result);
    };

    const onModalClick = (event) => {
      const target = event.target;
      if (target?.closest?.("[data-cj-personal-modal-cancel]")) close(false);
    };

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
      }
    }

    modal.addEventListener("click", onModalClick);
    confirmButton?.addEventListener("click", () => close(true));
    document.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => confirmButton?.focus());
  });
}

function updateCustomFeedback(container) {
  const sourceMode = readRadio(container, "cj_sourceMode", DEFAULT_SOURCE_MODE);
  const feedback = container.querySelector("#cj_customFeedback");
  if (!feedback) return;

  if (sourceMode !== "custom") {
    feedback.hidden = true;
    feedback.textContent = "";
    return;
  }

  const resolution = resolveCustomVerbs(String(container.querySelector("#cj_customVerbsText")?.value ?? ""));
  if (!resolution.unknown.length) {
    feedback.hidden = true;
    feedback.textContent = "";
    return;
  }

  feedback.hidden = false;
  feedback.textContent = `Verbe${resolution.unknown.length > 1 ? "s" : ""} non reconnu${resolution.unknown.length > 1 ? "s" : ""} : ${resolution.unknown.join(", ")}.`;
}

function renderCheckboxGroup({ title, idPrefix, values = [], options = [] } = {}) {
  const selectedValues = new Set(Array.isArray(values) ? values.map(String) : []);
  const rowsHtml = (Array.isArray(options) ? options : []).map((option, index) => {
    const value = String(option?.value ?? "");
    const label = String(option?.label ?? value);
    const id = `${idPrefix}_${index}`;
    return `
      <label class="cj-checkbox-row">
        <input
          class="tv-checkbox cj-checkbox"
          type="checkbox"
          id="${escapeHtml(id)}"
          data-cj-checkbox-group="${escapeHtml(idPrefix)}"
          value="${escapeHtml(value)}"
          ${selectedValues.has(value) ? "checked" : ""}
        >
        <span>${escapeHtml(label)}</span>
      </label>
    `;
  }).join("");

  return `
    <div class="tv-group tv-group-inline cj-checkbox-group">
      <div class="tv-group-title cj-checkbox-group-title">${escapeHtml(title)}</div>
      <div class="cj-checkbox-grid">
        ${rowsHtml}
      </div>
    </div>
  `;
}

function renderCustomVerbBlockButtons() {
  return getCustomVerbBlockOptions().map((block) => `
    <button
      type="button"
      class="cj-custom-block-button"
      data-cj-verb-block-id="${escapeHtml(block.id)}"
      title="Ajouter ou retirer : ${escapeHtml(block.verbs.join(", "))}"
    >${escapeHtml(block.label)}</button>
  `).join("");
}

function bindCustomVerbBlocks(container) {
  Array.from(container.querySelectorAll("[data-cj-verb-block-id]")).forEach((button) => {
    button.addEventListener("click", () => {
      const blockId = String(button.dataset.cjVerbBlockId || "");
      toggleCustomVerbBlock(container, blockId);
    });
  });
}

function toggleCustomVerbBlock(container, blockId) {
  const textarea = container.querySelector("#cj_customVerbsText");
  if (!textarea) return;

  const block = getCustomVerbBlockOptions().find((option) => option.id === blockId);
  if (!block) return;

  const blockIds = new Set(block.verbIds);
  const currentIds = getCustomTextVerbIds(textarea.value);
  const isActive = block.verbIds.length > 0 && block.verbIds.every((verbId) => currentIds.has(verbId));
  const nextLines = removeVerbBlockFromTextLines(textarea.value, blockIds);

  if (!isActive) {
    const blockLine = block.verbs.join(", ");
    const emptyIndex = nextLines.findIndex((line) => !line.length);
    if (emptyIndex >= 0) {
      nextLines[emptyIndex] = blockLine;
    } else {
      nextLines.push(blockLine);
    }
  }

  textarea.value = formatCustomVerbLines(nextLines);
  const customRadio = container.querySelector('input[name="cj_sourceMode"][value="custom"]');
  if (customRadio) customRadio.checked = true;
  updateDynamicUi(container);
}

function updateCustomVerbBlockStates(container) {
  const textarea = container.querySelector("#cj_customVerbsText");
  const buttons = Array.from(container.querySelectorAll("[data-cj-verb-block-id]"));
  if (!textarea || !buttons.length) return;

  const currentIds = getCustomTextVerbIds(textarea.value);
  const blocks = getCustomVerbBlockOptions();

  buttons.forEach((button) => {
    const block = blocks.find((option) => option.id === String(button.dataset.cjVerbBlockId || ""));
    const isActive = Boolean(block?.verbIds?.length) && block.verbIds.every((verbId) => currentIds.has(verbId));
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function getCustomTextVerbIds(rawText = "") {
  const ids = new Set();
  parseCustomTextEntries(rawText).forEach((entry) => {
    const verb = resolveCustomVerbs(entry).verbs[0];
    if (verb?.id) ids.add(verb.id);
  });
  return ids;
}

function removeVerbBlockFromTextLines(rawText = "", blockIds = new Set()) {
  return String(rawText ?? "").split(/\n/gu).map((line) => {
    const keptEntries = splitCustomLineEntries(line).filter((entry) => {
      const verb = resolveCustomVerbs(entry).verbs[0];
      return !verb?.id || !blockIds.has(verb.id);
    });
    return keptEntries.join(", ");
  });
}

function parseCustomTextEntries(rawText = "") {
  return String(rawText ?? "").split(/\n/gu).flatMap(splitCustomLineEntries);
}

function splitCustomLineEntries(line = "") {
  return String(line ?? "")
    .split(/[,;]+/gu)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function formatCustomVerbLines(lines = []) {
  const nextLines = Array.isArray(lines) ? [...lines] : [];
  while (nextLines.length && !String(nextLines[nextLines.length - 1] || "").trim()) {
    nextLines.pop();
  }
  return nextLines.join("\n");
}

function renderListModal() {
  return `
    <div class="cj-list-modal" id="cj_listModal" hidden aria-hidden="true">
      <div class="cj-list-modal-backdrop" data-cj-list-modal-close></div>
      <section
        class="cj-list-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cj_listModalTitle"
      >
        <header class="cj-list-modal-header">
          <h3 class="cj-list-modal-title" id="cj_listModalTitle">Consulter ou modifier la liste de verbes</h3>
          <button type="button" class="cj-list-modal-close" data-cj-list-modal-close aria-label="Fermer">
            <span class="cj-material-icon" aria-hidden="true">close</span>
          </button>
        </header>
        <div class="cj-list-modal-stats" id="cj_listModalStats" aria-live="polite"></div>
        <textarea
          class="tv-input cj-list-modal-textarea"
          id="cj_listModalTextarea"
          spellcheck="false"
          placeholder="Un verbe par ligne."
        ></textarea>
        <footer class="cj-list-modal-actions">
          <button type="button" class="cj-list-modal-secondary" data-cj-list-modal-close>Annuler</button>
          <button type="button" class="cj-list-modal-primary" id="cj_listModalApply">Appliquer comme liste fixe</button>
        </footer>
      </section>
    </div>
  `;
}

function bindListModal(container) {
  const openButton = container.querySelector("#cj_listPreviewButton");
  const modal = container.querySelector("#cj_listModal");
  const textarea = container.querySelector("#cj_listModalTextarea");
  const applyButton = container.querySelector("#cj_listModalApply");
  if (!modal || !textarea || !applyButton) return;

  openButton?.addEventListener("click", () => openListModal(container));
  textarea.addEventListener("input", () => updateModalStats(container));
  applyButton.addEventListener("click", () => applyListModal(container));

  Array.from(container.querySelectorAll("[data-cj-list-modal-close]"))
    .forEach((button) => button.addEventListener("click", () => closeListModal(container)));

  modal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeListModal(container);
  });
}

function openListModal(container) {
  const modal = container.querySelector("#cj_listModal");
  const textarea = container.querySelector("#cj_listModalTextarea");
  const applyButton = container.querySelector("#cj_listModalApply");
  if (!modal || !textarea) return;

  const cfg = readCurrentSettings(container);
  const listText = getCurrentVerbListText(cfg);
  textarea.value = listText;
  modal.dataset.initialText = listText;
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  if (applyButton) applyButton.textContent = cfg.sourceMode === "custom" ? "Appliquer" : "Appliquer comme liste fixe";
  updateModalStats(container);
  requestAnimationFrame(() => textarea.focus());
}

function closeListModal(container) {
  const modal = container.querySelector("#cj_listModal");
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
}

function applyListModal(container) {
  const modal = container.querySelector("#cj_listModal");
  const textarea = container.querySelector("#cj_listModalTextarea");
  const customText = container.querySelector("#cj_customVerbsText");
  if (!modal || !textarea || !customText) return;

  const nextText = String(textarea.value ?? "");
  const initialText = String(modal.dataset.initialText ?? "");
  if (nextText !== initialText || readRadio(container, "cj_sourceMode", DEFAULT_SOURCE_MODE) === "custom") {
    customText.value = nextText;
    const customRadio = container.querySelector('input[name="cj_sourceMode"][value="custom"]');
    if (customRadio) customRadio.checked = true;
    updateDynamicUi(container);
  }
  closeListModal(container);
}

function updateOpenModalStats(container) {
  const modal = container.querySelector("#cj_listModal");
  if (!modal || modal.hidden) return;
  updateModalStats(container);
}

function updateModalStats(container) {
  const statsEl = container.querySelector("#cj_listModalStats");
  const textarea = container.querySelector("#cj_listModalTextarea");
  if (!statsEl || !textarea) return;

  const cfg = normalizeSettings({
    ...readCurrentSettings(container),
    sourceMode: "custom",
    customVerbsText: String(textarea.value ?? "")
  });
  const stats = getQuestionStats(cfg);
  const unknownText = stats.unknownVerbs.length
    ? `<span class="cj-list-modal-warning">Non reconnus : ${escapeHtml(stats.unknownVerbs.join(", "))}</span>`
    : "";

  statsEl.innerHTML = `
    <span>${stats.verbCount} verbe${stats.verbCount > 1 ? "s" : ""} sur ${stats.baseVerbCount}</span>
    <span>${stats.questionCount} forme${stats.questionCount > 1 ? "s" : ""} possible${stats.questionCount > 1 ? "s" : ""} sur ${stats.baseQuestionCount}</span>
    ${unknownText}
  `;
}

function getCurrentVerbListText(cfg) {
  if (cfg.sourceMode === "custom") return cfg.customVerbsText;
  return resolveSelectedVerbs(cfg)
    .verbs
    .map((verb) => getVerbDisplayInfinitive(verb))
    .map((infinitive) => String(infinitive || "").trim())
    .filter(Boolean)
    .join("\n");
}

function readCurrentSettings(container) {
  return normalizeSettings({
    sourceMode: readRadio(container, "cj_sourceMode", DEFAULT_SOURCE_MODE),
    presetId: readSelect(container, "cj_presetId", { parse: (value) => value }) || DEFAULT_PRESET_ID,
    personalListId: readSelect(container, "cj_personalListId", { parse: (value) => String(value || "").trim() }),
    personalListName: getSelectedPersonalList(container)?.name || "",
    personalListVerbsText: String(container.querySelector("#cj_personalVerbsText")?.value ?? ""),
    customVerbsText: String(container.querySelector("#cj_customVerbsText")?.value ?? ""),
    tenses: readCheckedValues(container, "cj_tense"),
    compoundAuxiliary: readRadio(container, "cj_compoundAuxiliary", DEFAULT_COMPOUND_AUXILIARY),
    persons: readCheckedValues(container, "cj_person"),
    questionFormat: readRadio(container, "cj_questionFormat", DEFAULT_QUESTION_FORMAT),
    answerFormat: readRadio(container, "cj_answerFormat", DEFAULT_ANSWER_FORMAT),
    drawMode: readRadio(container, "cj_drawMode", DEFAULT_DRAW_MODE)
  });
}

function bindCheckboxUpdates(container, idPrefix, onChange) {
  Array.from(container.querySelectorAll(`[data-cj-checkbox-group="${cssEscape(idPrefix)}"]`))
    .forEach((input) => input.addEventListener("change", () => onChange?.()));
}

function readCheckedValues(container, idPrefix) {
  return Array.from(container.querySelectorAll(`[data-cj-checkbox-group="${cssEscape(idPrefix)}"]:checked`))
    .map((input) => String(input.value || "").trim())
    .filter(Boolean);
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-cj-config-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.cjConfigStyle = href;
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
