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

  const cfg = normalizeSettings(settings);
  const teacherSpaceId = Number(context?.teacherSpace?.id || 0) || null;

  if (editorState.teacherSpaceId !== teacherSpaceId) {
    editorState = createInitialEditorState(teacherSpaceId);
  }

  container.innerHTML = renderToolSettingsStack(
    renderRadioGroup({
      title: "Type de liste",
      id: "oa_listType",
      value: cfg.listType,
      options: [
        { value: LIST_TYPES.LETTERS, label: "Lettres" },
        { value: LIST_TYPES.WORDS, label: "Mots" }
      ]
    }),

    renderRadioGroup({
      title: "Nombre d’éléments",
      id: "oa_itemCount",
      value: String(cfg.itemCount),
      options: [2, 3, 4, 5, 6].map((value) => ({
        value: String(value),
        label: `${value} items`
      }))
    }),

    `
      <div id="oa_word_settings" class="oa-word-settings" ${cfg.listType === LIST_TYPES.WORDS ? "" : "hidden"}>
        ${renderToolSettingsStack(
          renderRadioGroup({
            title: "Lettres communes",
            id: "oa_prefixConstraint",
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

          renderRadioGroup({
            title: "Indice visuel",
            id: "oa_visualHint",
            value: cfg.visualHint ? "yes" : "no",
            options: [
              { value: "yes", label: "oui" },
              { value: "no", label: "non" }
            ]
          }),

          renderSection("Liste de mots", `
            <div class="oa-word-editor">
              <div class="oa-word-editor-note">Un mot par ligne. Les mots sont triés alphabétiquement à l’enregistrement.</div>

              <div class="oa-word-editor-main">
                <textarea
                  class="tv-input oa-word-editor-text"
                  id="oa_word_list"
                  rows="12"
                  placeholder="Ex. :\nabeille\nabricot\narc-en-ciel"
                  spellcheck="false"
                >${escapeHtml(editorState.text)}</textarea>

                <div class="oa-word-editor-side">
                  <button class="btn oa-word-editor-btn" type="button" id="oa_word_save">Enregistrer la liste</button>
                  <button class="btn oa-word-editor-btn secondary" type="button" id="oa_word_reset">Restaurer la liste par défaut</button>
                  <div class="oa-word-editor-status" id="oa_word_status"></div>
                </div>
              </div>
            </div>
          `, { collapsible: true, expanded: false, idPrefix: "oa_word_list_section" })
        )}
      </div>
    `
  );

  bindRadio(container, "oa_listType", {
    onChange: () => handleListTypeChange(container, context)
  });
  bindRadio(container, "oa_itemCount");
  bindRadio(container, "oa_prefixConstraint");
  bindRadio(container, "oa_visualHint");
  bindCollapsibleSection(container, "oa_word_list_section");
  bindWordEditor(container, context);
  syncWordSettingsVisibility(container);
  refreshWordEditorUI(container);
  if (cfg.listType === LIST_TYPES.WORDS) {
    queueWordListLoad(container, context);
  }
}

export function readToolSettings(container) {
  const listType = readRadio(container, "oa_listType", LIST_TYPES.WORDS);
  const itemCount = Math.max(2, Math.min(6, Number(readRadio(container, "oa_itemCount", "4")) || 2));

  const settings = normalizeSettings({
    listType,
    itemCount,
    prefixConstraint: readRadio(container, "oa_prefixConstraint", PREFIX_CONSTRAINTS.EXACT_1),
    visualHint: readRadio(container, "oa_visualHint", "no") === "yes"
  });

  if (settings.listType !== LIST_TYPES.WORDS) {
    return settings;
  }

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
    const teacherSpaceId = Number(context?.teacherSpace?.id || 0) || null;
    if (!teacherSpaceId) {
      setEditorStatus("Espace enseignant introuvable.", true);
      refreshWordEditorUI(container, { preserveTextarea: true });
      requestToolSettingsValidationRefresh(container);
      return;
    }

    const parsed = parseWordListText(textarea?.value || "");
    if (parsed.errors.length > 0) {
      setEditorStatus(parsed.errors[0], true);
      refreshWordEditorUI(container, { preserveTextarea: true });
      requestToolSettingsValidationRefresh(container);
      return;
    }

    if (parsed.items.length === 0) {
      setEditorStatus("La liste de mots doit contenir au moins un mot.", true);
      refreshWordEditorUI(container, { preserveTextarea: true });
      requestToolSettingsValidationRefresh(container);
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
    requestToolSettingsValidationRefresh(container);
  });

  resetBtn?.addEventListener("click", async () => {
    const teacherSpaceId = Number(context?.teacherSpace?.id || 0) || null;
    if (!teacherSpaceId) {
      setEditorStatus("Espace enseignant introuvable.", true);
      refreshWordEditorUI(container, { preserveTextarea: true });
      requestToolSettingsValidationRefresh(container);
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
    requestToolSettingsValidationRefresh(container);
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
    requestToolSettingsValidationRefresh(container);
  });
}

async function ensureWordListLoaded(container, context) {
  const teacherSpaceId = Number(context?.teacherSpace?.id || 0) || null;
  if (!teacherSpaceId) {
    editorState.status = "error";
    setEditorStatus("Espace enseignant introuvable.", true);
    refreshWordEditorUI(container);
    requestToolSettingsValidationRefresh(container);
    return;
  }

  if (editorState.teacherSpaceId !== teacherSpaceId) {
    editorState = createInitialEditorState(teacherSpaceId);
  }

  if (editorState.status === "loading") return;
  if (editorState.status === "ready" && editorState.items.length > 0) return;

  editorState.status = "loading";
  setEditorStatus("", false);
  refreshWordEditorUI(container);

  const { listTeacherVocabularyWords } = await loadTeacherVocabularyApi();
  const items = await listTeacherVocabularyWords(teacherSpaceId);
  applyLoadedWordItems(items);
  setEditorStatus(getWordListSummary(editorState.items), false);
  refreshWordEditorUI(container);
  requestToolSettingsValidationRefresh(container);
}

async function loadTeacherVocabularyApi() {
  if (!teacherVocabularyApiPromise) {
    teacherVocabularyApiPromise = import("../../teacher/js/teacher-api.js")
      .then((module) => ({
        listTeacherVocabularyWords: module.listTeacherVocabularyWords,
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

function requestToolSettingsValidationRefresh(container) {
  container?.dispatchEvent?.(new CustomEvent("toolsettingsrefresh", { bubbles: true }));
}

function createInitialEditorState(teacherSpaceId = null) {
  return {
    teacherSpaceId,
    status: "idle",
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
  if (document.querySelector(`link[data-oa-config-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.oaConfigStyle = href;
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
