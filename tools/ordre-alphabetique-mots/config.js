import {
  renderRadioGroup,
  bindRadio,
  readRadio,
  renderSection,
  bindCollapsibleSection,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import {
  LIST_TYPES,
  PREFIX_CONSTRAINTS,
  getDefaultSettings,
  normalizeSettings,
  parseWordListText,
  serializeWordListEntries,
  normalizeWordEntries,
  mergeWordEntriesPreservingPages,
  getWordListSummary,
  canGenerateQuestion
} from "./model.js";

let stylesInjected = false;
let editorState = createInitialEditorState();
let teacherVocabularyApiPromise = null;

export function renderToolSettings(container, settings, context = {}) {
  injectStyles();

  const cfg = normalizeSettings({
    ...settings,
    listType: LIST_TYPES.WORDS
  });
  const scopeKey = getVocabularyScopeKey(context);

  if (editorState.scopeKey !== scopeKey) {
    editorState = createInitialEditorState(scopeKey);
  }
  editorState.readOnly = isCatalogAdminContext(context);

  container.innerHTML = `
    <div class="oam-config-root">
      ${renderToolSettingsStack(
        renderRadioGroup({
          title: "Nombre d’éléments",
          id: "oam_itemCount",
          value: String(cfg.itemCount),
          options: [2, 3, 4, 5, 6].map((value) => ({
            value: String(value),
            label: `${value} mot${value > 1 ? "s" : ""}`
          }))
        }),

        renderRadioGroup({
          title: "Lettres communes",
          id: "oam_prefixConstraint",
          value: cfg.prefixConstraint,
          options: [
            { value: PREFIX_CONSTRAINTS.NONE, label: "Aucune" },
            { value: PREFIX_CONSTRAINTS.EXACT_1, label: "1 lettre" },
            { value: PREFIX_CONSTRAINTS.EXACT_2, label: "2 lettres" },
            { value: PREFIX_CONSTRAINTS.EXACT_3, label: "3 lettres" },
            { value: PREFIX_CONSTRAINTS.AT_LEAST_1, label: "au moins 1" },
            { value: PREFIX_CONSTRAINTS.AT_LEAST_2, label: "au moins 2" },
            { value: PREFIX_CONSTRAINTS.AT_LEAST_3, label: "au moins 3" }
          ]
        }),

        renderSection("Réglages avancés", renderToolSettingsStack(
          renderAlphabetSwitch(cfg.showAlphabet),
          renderRadioGroup({
            title: "Indice visuel",
            id: "oam_visualHint",
            value: cfg.visualHint ? "yes" : "no",
            options: [
              { value: "yes", label: "oui" },
              { value: "no", label: "non" }
            ]
          }),
          renderWordListEditor()
        ), { collapsible: true, expanded: false, idPrefix: "oam_advanced" })
      )}
    </div>
  `;

  bindRadio(container, "oam_itemCount");
  bindRadio(container, "oam_prefixConstraint");
  bindRadio(container, "oam_visualHint");
  bindCollapsibleSection(container, "oam_advanced");
  bindCollapsibleSection(container, "oam_word_list_section");
  bindWordEditor(container, context);
  refreshWordEditorUI(container);
  queueWordListLoad(container, context);
}

export function readToolSettings(container) {
  const itemCount = Math.max(2, Math.min(6, Number(readRadio(container, "oam_itemCount", "4")) || 2));

  const settings = normalizeSettings({
    listType: LIST_TYPES.WORDS,
    itemCount,
    prefixConstraint: readRadio(container, "oam_prefixConstraint", PREFIX_CONSTRAINTS.EXACT_1),
    visualHint: readRadio(container, "oam_visualHint", "no") === "yes",
    showAlphabet: container.querySelector("#oam_showAlphabet")?.checked === true
  });

  if (editorState.status === "loading") {
    throw new Error("Chargement de la liste de mots en cours.");
  }

  if (editorState.status === "saving") {
    throw new Error("Enregistrement de la liste de mots en cours.");
  }

  if (editorState.status === "error") {
    throw new Error(editorState.message || "La liste de mots est indisponible.");
  }

  if (editorState.dirty) {
    throw new Error("Enregistre la liste de mots avant de sauvegarder l’activité.");
  }

  if (editorState.items.length < settings.itemCount) {
    throw new Error(`Il faut au moins ${settings.itemCount} mots dans la liste.`);
  }

  if (!canGenerateQuestion(settings, { wordEntries: editorState.items })) {
    throw new Error("Impossible de générer une liste avec ces réglages dans la banque de mots actuelle.");
  }

  return settings;
}

export { getDefaultSettings };

function renderAlphabetSwitch(showAlphabet) {
  return `
    <div class="tv-group oam-toggle-row">
      <label class="oam-switch-label" for="oam_showAlphabet">
        <input class="tv-checkbox" type="checkbox" id="oam_showAlphabet" ${showAlphabet ? "checked" : ""}>
        <span>Afficher l’alphabet</span>
      </label>
    </div>
  `;
}

function renderWordListEditor() {
  const readOnly = editorState.readOnly;
  return renderSection("Liste de mots", `
    <div class="oa-word-editor">
      <div class="oa-word-editor-note">${
        readOnly
          ? "Liste système issue d’Admin - Ressources. Elle sert à vérifier que les réglages peuvent générer des questions."
          : "Un mot par ligne. Les mots sont triés alphabétiquement à l’enregistrement."
      }</div>

      <div class="oa-word-editor-main">
        <textarea
          class="tv-input oa-word-editor-text"
          id="oa_word_list"
          rows="12"
          placeholder="Ex. :\nabeille\nabricot\narc-en-ciel"
          spellcheck="false"
          ${readOnly ? "readonly" : ""}
        >${escapeHtml(editorState.text)}</textarea>

        <div class="oa-word-editor-side">
          ${readOnly ? "" : `
            <button class="btn oa-word-editor-btn" type="button" id="oa_word_save">Enregistrer la liste</button>
            <button class="btn oa-word-editor-btn secondary" type="button" id="oa_word_reset">Restaurer la liste par défaut</button>
          `}
          <div class="oa-word-editor-status" id="oa_word_status"></div>
        </div>
      </div>
    </div>
  `, { collapsible: true, expanded: false, idPrefix: "oam_word_list_section" });
}

function bindWordEditor(container, context) {
  const textarea = container.querySelector("#oa_word_list");
  const saveBtn = container.querySelector("#oa_word_save");
  const resetBtn = container.querySelector("#oa_word_reset");

  textarea?.addEventListener("input", () => {
    editorState.text = textarea.value;
    editorState.dirty = editorState.text !== editorState.savedText;

    if (editorState.status === "ready") {
      const parsed = parseWordListText(editorState.text);
      if (parsed.errors.length > 0) {
        setEditorStatus(parsed.errors[0], true);
      } else if (parsed.items.length === 0) {
        setEditorStatus("La liste de mots est vide.", true);
      } else if (editorState.dirty) {
        setEditorStatus(`${parsed.items.length} mots prêts à être enregistrés.`, false);
      }
    }

    refreshWordEditorUI(container, { preserveTextarea: true });
  });

  saveBtn?.addEventListener("click", async () => {
    const teacherSpaceId = getTeacherSpaceId(context);
    if (!teacherSpaceId) {
      setEditorStatus("Espace enseignant introuvable.", true);
      refreshWordEditorUI(container, { preserveTextarea: true });
      return;
    }

    const parsed = parseWordListText(textarea?.value || "");
    if (parsed.errors.length > 0) {
      setEditorStatus(parsed.errors[0], true);
      refreshWordEditorUI(container, { preserveTextarea: true });
      return;
    }

    if (parsed.items.length === 0) {
      setEditorStatus("La liste de mots doit contenir au moins un mot.", true);
      refreshWordEditorUI(container, { preserveTextarea: true });
      return;
    }

    editorState.status = "saving";
    refreshWordEditorUI(container, { preserveTextarea: true });

    try {
      const { replaceTeacherVocabularyWords } = await loadTeacherVocabularyApi();
      const mergedItems = mergeWordEntriesPreservingPages(parsed.items, editorState.items);
      const savedItems = await replaceTeacherVocabularyWords(teacherSpaceId, mergedItems);
      applyLoadedWordItems(savedItems);

      const warningText = parsed.warnings.length > 0
        ? ` ${parsed.warnings.length} doublon${parsed.warnings.length > 1 ? "s" : ""} ignoré${parsed.warnings.length > 1 ? "s" : ""}.`
        : "";

      setEditorStatus(`Liste enregistrée. ${getWordListSummary(editorState.items)}${warningText}`, false);
    } catch (err) {
      editorState.status = "error";
      setEditorStatus(err?.message || "Impossible d’enregistrer la liste.", true);
    }

    refreshWordEditorUI(container);
  });

  resetBtn?.addEventListener("click", async () => {
    const teacherSpaceId = getTeacherSpaceId(context);
    if (!teacherSpaceId) {
      setEditorStatus("Espace enseignant introuvable.", true);
      refreshWordEditorUI(container, { preserveTextarea: true });
      return;
    }

    editorState.status = "saving";
    refreshWordEditorUI(container, { preserveTextarea: true });

    try {
      const { resetTeacherVocabularyWords } = await loadTeacherVocabularyApi();
      const resetItems = await resetTeacherVocabularyWords(teacherSpaceId);
      applyLoadedWordItems(resetItems);
      setEditorStatus(`Liste par défaut restaurée. ${getWordListSummary(editorState.items)}`, false);
    } catch (err) {
      editorState.status = "error";
      setEditorStatus(err?.message || "Impossible de restaurer la liste par défaut.", true);
    }

    refreshWordEditorUI(container);
  });
}

function handleListTypeChange(container, context) {
  syncWordSettingsVisibility(container);

  const listType = readRadio(container, "oa_listType", LIST_TYPES.WORDS);
  if (listType === LIST_TYPES.WORDS) {
    queueWordListLoad(container, context);
  }
}

function syncWordSettingsVisibility(container) {
  const listType = readRadio(container, "oa_listType", LIST_TYPES.WORDS);
  const wordSettings = container.querySelector("#oa_word_settings");
  if (!wordSettings) return;

  wordSettings.hidden = listType !== LIST_TYPES.WORDS;
}

function queueWordListLoad(container, context) {
  ensureWordListLoaded(container, context).catch((err) => {
    setEditorStatus(err?.message || "Impossible de charger la liste de mots.", true);
    refreshWordEditorUI(container);
  });
}

async function ensureWordListLoaded(container, context) {
  const catalogAdmin = isCatalogAdminContext(context);
  const teacherSpaceId = getTeacherSpaceId(context);
  const scopeKey = getVocabularyScopeKey(context);

  if (editorState.scopeKey !== scopeKey) {
    editorState = createInitialEditorState(scopeKey);
  }
  editorState.readOnly = catalogAdmin;

  if (!catalogAdmin && !teacherSpaceId) {
    editorState.status = "error";
    editorState.loadAttempted = true;
    setEditorStatus("Espace enseignant introuvable.", true);
    refreshWordEditorUI(container);
    return;
  }

  if (editorState.status === "loading") return;
  if (editorState.status === "ready") return;
  if (editorState.status === "error" && editorState.loadAttempted) return;

  editorState.status = "loading";
  editorState.loadAttempted = true;
  setEditorStatus("", false);
  refreshWordEditorUI(container);

  const {
    listTeacherVocabularyWords,
    listDefaultVocabularyWordsAsAdmin
  } = await loadTeacherVocabularyApi();
  const items = catalogAdmin
    ? await listDefaultVocabularyWordsAsAdmin()
    : await listTeacherVocabularyWords(teacherSpaceId);
  applyLoadedWordItems(items);
  setEditorStatus(getWordListSummary(editorState.items), false);
  refreshWordEditorUI(container);
}

async function loadTeacherVocabularyApi() {
  if (!teacherVocabularyApiPromise) {
    teacherVocabularyApiPromise = import("../../teacher/js/teacher-api.js")
      .then((module) => ({
        listTeacherVocabularyWords: module.listTeacherVocabularyWords,
        listDefaultVocabularyWordsAsAdmin: module.listDefaultVocabularyWordsAsAdmin,
        replaceTeacherVocabularyWords: module.replaceTeacherVocabularyWords,
        resetTeacherVocabularyWords: module.resetTeacherVocabularyWords
      }))
      .catch((error) => {
        teacherVocabularyApiPromise = null;
        throw error;
      });
  }

  return teacherVocabularyApiPromise;
}

function applyLoadedWordItems(items) {
  editorState.items = normalizeWordEntries(items);
  editorState.text = serializeWordListEntries(editorState.items, { includePages: false });
  editorState.savedText = editorState.text;
  editorState.dirty = false;
  editorState.status = "ready";
}

function refreshWordEditorUI(container, { preserveTextarea = false } = {}) {
  const textarea = container.querySelector("#oa_word_list");
  const saveBtn = container.querySelector("#oa_word_save");
  const resetBtn = container.querySelector("#oa_word_reset");
  const statusEl = container.querySelector("#oa_word_status");

  if (textarea && !preserveTextarea) {
    textarea.value = editorState.text;
  }

  if (textarea) {
    textarea.readOnly = !!editorState.readOnly;
    textarea.disabled = editorState.status === "loading" || editorState.status === "saving";
  }

  if (saveBtn) {
    saveBtn.disabled = editorState.status === "loading" || editorState.status === "saving";
    saveBtn.textContent = editorState.status === "saving" ? "Enregistrement…" : "Enregistrer la liste";
  }

  if (resetBtn) {
    resetBtn.disabled = editorState.status === "loading" || editorState.status === "saving";
  }

  if (statusEl) {
    statusEl.textContent = editorState.message || "";
    statusEl.classList.toggle("is-error", !!editorState.isError);
    statusEl.classList.toggle("is-dirty", !!editorState.dirty && !editorState.isError);
  }
}

function setEditorStatus(message, isError = false) {
  editorState.message = String(message || "");
  editorState.isError = !!isError;
}

function getTeacherSpaceId(context = {}) {
  const value = context?.teacherSpace?.id ?? context?.teacher_space_id ?? context?.teacherSpaceId ?? 0;
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function isCatalogAdminContext(context = {}) {
  return context?.isCatalogAdmin === true;
}

function getVocabularyScopeKey(context = {}) {
  if (isCatalogAdminContext(context)) return "admin:default-vocabulary";
  const teacherSpaceId = getTeacherSpaceId(context);
  return teacherSpaceId ? `teacher:${teacherSpaceId}` : "teacher:missing";
}

function createInitialEditorState(scopeKey = "teacher:missing") {
  return {
    scopeKey,
    readOnly: false,
    status: "idle",
    loadAttempted: false,
    items: [],
    text: "",
    savedText: "",
    dirty: false,
    message: "",
    isError: false
  };
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-oam-config-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.oamConfigStyle = href;
  document.head.appendChild(link);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
