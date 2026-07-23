import {
  bindRadio,
  readRadio,
  renderRadioGroup,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import { renderQuestionBankPickerWidget } from "../../shared/tool-commons/general-tools/question-bank-picker.js";
import {
  bindQuestionSelectionWidget,
  readQuestionSelection,
  renderQuestionSelectionWidget,
  updateQuestionSelectionUi
} from "../../shared/tool-commons/general-tools/question-selection-widget.js";
import {
  DEFAULT_DRAW_MODE,
  DEFAULT_QUESTION_SELECTION_MODE,
  filterQuizQuestionsBySelection,
  getDefaultSettings,
  getQuizQuestionSelectionKey,
  getWidgetView,
  materializeQuizQuestionVariant,
  normalizeQuizSnapshot,
  normalizeSettings
} from "./model.js";

let stylesInjected = false;

const QUIZ_ROOT_PERSONAL = "__quiz_root_personal";
const QUIZ_ROOT_SYSTEM = "__quiz_root_system";

export function renderToolSettings(container, settings, context = {}){
  injectStyles();
  container.classList.add("quiz-config-root");

  const cfg = normalizeSettings(settings);
  const initialSnapshot = normalizeQuizSnapshot(cfg.quizSnapshot || {});
  const initialQuizId = String(cfg.quizId || initialSnapshot.id || "").trim();
  const initialQuizTitle = String(cfg.quizTitle || initialSnapshot.title || "").trim();
  const initialSelection = cfg.questionSelection;
  const initialQuizzes = normalizeAvailableQuizzes([], cfg);

  container.innerHTML = renderToolSettingsStack(
    `
      <div id="quiz_pickerHost">
        ${renderQuizPicker({
          quizzes: initialQuizzes,
          value: initialQuizId,
          count: initialSnapshot.questions.length,
          disabled: true,
          emptyLabel: initialQuizId ? (initialQuizTitle || "Quiz sélectionné") : "Chargement des quiz…"
        })}
      </div>
      <textarea id="quiz_snapshot" hidden>${escapeHtml(JSON.stringify(initialSnapshot))}</textarea>
      <div id="quiz_questionSelectionHost">
        ${renderQuestionSelectionWidget({
          idPrefix: "quiz",
          items: initialSnapshot.questions,
          selection: initialSelection,
          itemKeyGetter: getQuizQuestionSelectionKey,
          renderRow: (args) => renderQuizQuestionSelectionRow({ ...args, quizInstruction:initialSnapshot.instruction }),
          itemSingular: "question",
          itemPlural: "questions",
          emptyMessage: "Aucune question à afficher.",
          listAriaLabel: "Questions du quiz"
        })}
      </div>
    `,
    renderRadioGroup({
      title: "Tirage des questions dans le quiz",
      id: "quiz_drawMode",
      value: cfg.drawMode,
      options: [
        { value: "in_order", label: "Dans l’ordre" },
        { value: "random", label: "Aléatoire" }
      ]
    })
  );

  bindRadio(container, "quiz_drawMode");
  bindQuestionSelectionWidget(container, { idPrefix: "quiz" });
  updateQuestionSelectionUi(container, { idPrefix: "quiz" });

  setupQuizPicker(container, {
    cfg,
    selectedQuizId: initialQuizId,
    selectedQuizTitle: initialQuizTitle,
    initialSelection,
    context
  }).catch((error) => {
    setQuizPickerState(container, {
      disabled: true,
      title: "Impossible de charger les quiz",
      value: initialQuizId,
      count: initialSnapshot.questions.length
    });
    setEditorStatus(context, error?.message || "Impossible de charger les quiz.", true);
  });
}

export function readToolSettings(container, settings = {}){
  const previous = normalizeSettings(settings);
  const input = container.querySelector("#quiz_quizSelect");
  const snapshotEl = container.querySelector("#quiz_snapshot");
  const quizId = String(input?.value || "").trim();
  const quizTitle = String(input?.dataset?.quizTitle || input?.dataset?.bankTitle || previous.quizTitle || "").trim();
  const drawMode = readRadio(container, "quiz_drawMode", DEFAULT_DRAW_MODE);
  const quizSnapshot = readSnapshot(snapshotEl?.value || "{}");
  const questionSelection = readQuestionSelection(container, {
    idPrefix: "quiz"
  });

  if (!quizId) {
    throw new Error("Sélectionne un quiz.");
  }

  if (!quizSnapshot.questions.length) {
    throw new Error("Le quiz sélectionné ne contient aucune question.");
  }

  if (questionSelection.mode === "custom" && !questionSelection.questionKeys.length) {
    throw new Error("Sélectionne au moins une question pour ce niveau.");
  }

  const selectedQuestions = filterQuizQuestionsBySelection(quizSnapshot.questions, questionSelection);
  if (!selectedQuestions.length) {
    throw new Error("La sélection ne contient aucune question.");
  }

  const incompleteIndex = selectedQuestions.findIndex((question) => !isQuestionRunnable(question));
  if (incompleteIndex >= 0) {
    const question = selectedQuestions[incompleteIndex];
    const sourceIndex = quizSnapshot.questions.findIndex((item) => item.id === question.id);
    const displayIndex = sourceIndex >= 0 ? sourceIndex + 1 : incompleteIndex + 1;
    throw new Error(`La question ${displayIndex} doit contenir un unique widget de réponse exécutable (réponse, QCM ou sélection de mots).`);
  }

  return normalizeSettings({
    ...previous,
    quizId,
    quizTitle: quizTitle || quizSnapshot.title,
    bankInstruction: quizSnapshot.instruction,
    drawMode,
    questionSelection,
    quizSnapshot: {
      ...quizSnapshot,
      id: quizId,
      title: quizTitle || quizSnapshot.title
    }
  });
}

export { getDefaultSettings };

async function setupQuizPicker(container, {
  cfg = {},
  selectedQuizId = "",
  selectedQuizTitle = "",
  initialSelection = null,
  context = {}
} = {}){
  const teacherSpaceId = Number(context?.teacherSpace?.id ?? context?.teacher_space_id ?? 0);
  if (!Number.isFinite(teacherSpaceId) || teacherSpaceId <= 0) {
    setQuizPickerState(container, {
      disabled: true,
      title: "Espace enseignant introuvable",
      value: selectedQuizId,
      count: normalizeQuizSnapshot(cfg.quizSnapshot || {}).questions.length
    });
    setEditorStatus(context, "Impossible de lister les quiz sans espace enseignant.", true);
    return;
  }

  setQuizPickerState(container, {
    disabled: true,
    title: selectedQuizId ? (selectedQuizTitle || "Quiz sélectionné") : "Chargement des quiz…",
    value: selectedQuizId,
    count: selectedQuizId ? normalizeQuizSnapshot(cfg.quizSnapshot || {}).questions.length : null
  });
  setEditorStatus(context, "Chargement des quiz…", false);

  const api = await import("../../teacher/js/teacher-api.js");
  const [rawQuizzes, rawFolders] = await Promise.all([
    api.listQuizzesForSpace(teacherSpaceId),
    typeof api.listQuizFoldersForSpace === "function"
      ? api.listQuizFoldersForSpace(teacherSpaceId)
      : Promise.resolve([])
  ]);

  const quizzes = normalizeAvailableQuizzes(rawQuizzes, cfg);
  const folders = normalizeAvailableFolders(rawFolders);
  const selectedQuiz = findQuizById(quizzes, selectedQuizId);

  renderQuizPickerInto(container, {
    quizzes,
    value: selectedQuiz?.id || selectedQuizId,
    count: selectedQuiz
      ? normalizeQuizSnapshot(selectedQuiz).questions.length
      : normalizeQuizSnapshot(cfg.quizSnapshot || {}).questions.length,
    disabled: quizzes.length === 0
  });

  const input = container.querySelector("#quiz_quizSelect");
  const openButton = container.querySelector("[data-qb-picker-open]");
  if (!input || !openButton) return;
  input.dataset.quizTitle = String(selectedQuiz?.title || selectedQuizTitle || "").trim();

  openButton.addEventListener("click", () => {
    openQuizPickerOverlay({
      quizzes,
      folders,
      selectedQuizId: input.value,
      onSelect: (quiz) => {
        applyQuizSelection(container, quiz, {
          initialQuizId: selectedQuizId,
          initialSelection
        });
        clearEditorStatus(context);
      }
    });
  });

  if (!quizzes.length) {
    setEditorStatus(context, "Crée d’abord un quiz dans l’onglet Quiz.", true);
    return;
  }

  if (selectedQuiz) {
    applyQuizSelection(container, selectedQuiz, {
      initialQuizId: selectedQuizId,
      initialSelection
    });
  }
  clearEditorStatus(context);
}

function renderQuizPickerInto(container, options = {}){
  const host = container.querySelector("#quiz_pickerHost");
  if (!host) return;
  host.innerHTML = renderQuizPicker(options);
}

function setQuizPickerState(container, {
  disabled = false,
  title = "",
  value = undefined,
  count = 0
} = {}){
  const input = container.querySelector("#quiz_quizSelect");
  const nameEl = container.querySelector("[data-qb-picker-bank-name]");
  const countEl = container.querySelector("#quiz_quizCount");
  const button = container.querySelector("[data-qb-picker-open]");
  if (input && value !== undefined) input.value = String(value || "");
  if (input) {
    input.dataset.quizTitle = String(title || "");
    input.dataset.bankTitle = String(title || "");
  }
  if (nameEl) nameEl.textContent = String(title || "Aucun quiz sélectionné");
  if (countEl) countEl.textContent = count === null ? "…" : renderQuestionCount(count);
  if (button) {
    button.disabled = Boolean(disabled);
    const hasSelection = Boolean(String(input?.value || "").trim());
    button.classList.toggle("qb-picker-button--change", hasSelection);
    button.textContent = hasSelection ? "+ Changer de quiz" : "+ Sélectionner le quiz";
  }
}

function applyQuizSelection(container, quiz, {
  initialQuizId = "",
  initialSelection = null
} = {}){
  const input = container.querySelector("#quiz_quizSelect");
  const snapshotEl = container.querySelector("#quiz_snapshot");
  const nameEl = container.querySelector("[data-qb-picker-bank-name]");
  const countEl = container.querySelector("#quiz_quizCount");
  const button = container.querySelector("[data-qb-picker-open]");
  if (!input || !snapshotEl || !quiz) return;

  const snapshot = normalizeQuizSnapshot(quiz);
  const quizId = String(quiz.id || snapshot.id || "").trim();
  const quizTitle = String(quiz.title || snapshot.title || "Quiz sans titre").trim();

  input.value = quizId;
  input.dataset.bankTitle = quizTitle;
  input.dataset.quizTitle = quizTitle;
  snapshotEl.value = JSON.stringify(snapshot);
  if (nameEl) nameEl.textContent = quizTitle;
  if (countEl) countEl.textContent = renderQuestionCount(snapshot.questions.length);
  if (button) {
    button.textContent = "+ Changer de quiz";
    button.classList.add("qb-picker-button--change");
  }
  container.querySelector("[data-qb-picker-summary]")?.classList.add("is-selected");

  const sameInitialQuiz = quizId === String(initialQuizId || "").trim();
  refreshQuestionSelectionWidget(
    container,
    snapshot.questions,
    sameInitialQuiz ? initialSelection : { mode: DEFAULT_QUESTION_SELECTION_MODE, questionKeys: [] },
    snapshot.instruction
  );
  container.dispatchEvent(new CustomEvent("questionbankchange", {
    bubbles:true,
    detail:{ instruction:snapshot.instruction }
  }));
}

function refreshQuestionSelectionWidget(container, questions = [], selection = null, quizInstruction = ""){
  const host = container.querySelector("#quiz_questionSelectionHost");
  if (!host) return;
  host.innerHTML = renderQuestionSelectionWidget({
    idPrefix: "quiz",
    items: questions,
    selection: selection || { mode: DEFAULT_QUESTION_SELECTION_MODE, questionKeys: [] },
    itemKeyGetter: getQuizQuestionSelectionKey,
    renderRow: (args) => renderQuizQuestionSelectionRow({ ...args, quizInstruction }),
    itemSingular: "question",
    itemPlural: "questions",
    emptyMessage: "Aucune question à afficher.",
    listAriaLabel: "Questions du quiz"
  });
  bindQuestionSelectionWidget(host, { idPrefix: "quiz" });
  updateQuestionSelectionUi(host, { idPrefix: "quiz" });
}

function renderQuizPicker({
  quizzes = [],
  value = "",
  count = 0,
  disabled = false,
  emptyLabel = "Aucun quiz sélectionné"
} = {}){
  const options = quizzes.map((quiz) => ({
    value: quiz.id,
    label: quiz.title
  }));
  return renderQuestionBankPickerWidget({
    selectId: "quiz_quizSelect",
    countId: "quiz_quizCount",
    value,
    options,
    disabled,
    count,
    countFormatter: renderQuestionCount,
    emptyLabel,
    disabledLabel: "Aucun quiz disponible",
    entityLabel: "Quiz",
    selectButtonLabel: "+ Sélectionner le quiz",
    changeButtonLabel: "+ Changer de quiz"
  });
}

function openQuizPickerOverlay({ quizzes = [], folders = [], selectedQuizId = "", onSelect = () => {} } = {}){
  closeQuizPickerOverlay();

  const overlay = document.createElement("div");
  overlay.className = "qb-picker-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `
    <div class="qb-picker-modal" role="document">
      <header class="qb-picker-modal-header">
        <div>
          <div class="qb-picker-modal-eyebrow">Quiz</div>
          <h2>Sélectionner le quiz</h2>
        </div>
      </header>
      <div class="qb-picker-modal-body">
        ${renderQuizTree({ quizzes, folders, selectedQuizId })}
      </div>
    </div>
  `;

  const close = () => overlay.remove();
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      close();
      return;
    }
    const button = event.target.closest("[data-quiz-picker-id]");
    if (!button) return;
    const quiz = findQuizById(quizzes, button.dataset.quizPickerId);
    if (!quiz) return;
    onSelect(quiz);
    close();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    close();
  });

  document.body.appendChild(overlay);
  overlay.querySelector("[data-quiz-picker-id].is-selected, [data-quiz-picker-id]")?.focus?.();
}

function closeQuizPickerOverlay(){
  document.querySelectorAll(".qb-picker-overlay").forEach((overlay) => overlay.remove());
}

function renderQuizTree({ quizzes = [], folders = [], selectedQuizId = "" } = {}){
  const personalQuizzes = quizzes.filter((quiz) => quiz.is_system !== true);
  const systemQuizzes = quizzes.filter((quiz) => quiz.is_system === true);
  const personalFolders = folders.filter((folder) => folder.is_system !== true);
  const systemFolders = folders.filter((folder) => folder.is_system === true);
  const personalRootFolders = personalFolders
    .filter((folder) => !normalizeParentId(folder.parent_id))
    .sort(compareTreeItems);
  const systemRootFolders = systemFolders
    .filter((folder) => !normalizeParentId(folder.parent_id))
    .sort(compareTreeItems);
  const personalRootQuizzes = personalQuizzes
    .filter((quiz) => !normalizeFolderId(quiz.folder_id))
    .sort(compareTreeItems);
  const systemRootQuizzes = systemQuizzes
    .filter((quiz) => !normalizeFolderId(quiz.folder_id))
    .sort(compareTreeItems);

  const personalHasContent = personalRootFolders.length || personalRootQuizzes.length;
  const systemHasContent = systemRootFolders.length || systemRootQuizzes.length;
  return `
    <div class="qb-picker-tree">
      <section class="qb-picker-tree-section">
        <h3>Quiz personnels</h3>
        ${personalHasContent
          ? `
            <div class="qb-picker-tree-list">
              ${personalRootFolders.map((folder) => renderQuizFolderNode({ folder, folders: personalFolders, quizzes: personalQuizzes, selectedQuizId, depth: 0 })).join("")}
              ${personalRootQuizzes.map((quiz) => renderQuizNode({ quiz, selectedQuizId, depth: 0 })).join("")}
            </div>
          `
          : '<p class="qb-picker-empty">Aucun quiz personnel.</p>'}
      </section>
      <section class="qb-picker-tree-section">
        <h3>Quiz système</h3>
        ${systemHasContent
          ? `
            <div class="qb-picker-tree-list">
              ${systemRootFolders.map((folder) => renderQuizFolderNode({ folder, folders: systemFolders, quizzes: systemQuizzes, selectedQuizId, depth: 0, system: true })).join("")}
              ${systemRootQuizzes.map((quiz) => renderQuizNode({ quiz, selectedQuizId, depth: 0, system: true })).join("")}
            </div>
          `
          : '<p class="qb-picker-empty">Aucun quiz système.</p>'}
      </section>
    </div>
  `;
}

function renderQuizFolderNode({ folder, folders, quizzes, selectedQuizId, depth, system = false }){
  const folderId = String(folder.id || "").trim();
  const childFolders = folders
    .filter((item) => normalizeParentId(item.parent_id) === folderId)
    .sort(compareTreeItems);
  const childQuizzes = quizzes
    .filter((quiz) => normalizeFolderId(quiz.folder_id) === folderId)
    .sort(compareTreeItems);

  return `
    <div class="qb-picker-folder" style="--qb-depth:${Math.max(0, depth)};">
      <div class="qb-picker-folder-label">📁 ${escapeHtml(folder.name || "Dossier")}</div>
      ${childFolders.map((child) => renderQuizFolderNode({ folder: child, folders, quizzes, selectedQuizId, depth: depth + 1, system })).join("")}
      ${childQuizzes.map((quiz) => renderQuizNode({ quiz, selectedQuizId, depth: depth + 1, system })).join("")}
    </div>
  `;
}

function renderQuizNode({ quiz, selectedQuizId, depth, system = false }){
  const quizId = String(quiz.id || "").trim();
  const questionCount = normalizeQuizSnapshot(quiz).questions.length;
  const selected = quizId && quizId === String(selectedQuizId || "").trim();
  return `
    <button
      class="qb-picker-bank${selected ? " is-selected" : ""}"
      type="button"
      data-quiz-picker-id="${escapeHtml(quizId)}"
      style="--qb-depth:${Math.max(0, depth)};"
    >
      <span class="qb-picker-bank-icon" aria-hidden="true">${system ? "★" : "•"}</span>
      <span class="qb-picker-bank-title">${escapeHtml(quiz.title || "Quiz sans titre")}</span>
      <span class="qb-picker-bank-badge quiz-picker-count-badge">${escapeHtml(renderQuestionCount(questionCount))}</span>
    </button>
  `;
}

function renderQuizQuestionSelectionRow({ item, index, key, checked, quizInstruction = "" }){
  const prompt = getQuestionPromptPreview(item, index, quizInstruction);
  const answer = getQuestionAnswerPreview(item);
  return `
    <label class="general-question-selection-row" role="listitem">
      <input class="general-question-selection-check" type="checkbox" data-question-key="${escapeHtml(key)}" ${checked ? "checked" : ""}>
      <span class="general-question-selection-index">${index + 1}</span>
      <span class="general-question-selection-preview general-question-selection-preview--question">
        <span class="general-question-selection-preview-text">${escapeHtml(prompt)}</span>
      </span>
      <span class="general-question-selection-arrow" aria-hidden="true">→</span>
      <span class="general-question-selection-preview general-question-selection-preview--answer">
        <span class="general-question-selection-preview-text">${escapeHtml(answer)}</span>
      </span>
    </label>
  `;
}

function getQuestionPromptPreview(question, index, quizInstruction = ""){
  const normalizedInstruction = String(quizInstruction || "").trim();
  // Dans une série, les textes de chaque ligne vivent dans la variante :
  // le modèle de base ne contient souvent que son titre générique (« QCM »).
  const variant = materializeQuizQuestionVariant(question, 0);
  const texts = (Array.isArray(variant?.widgets) ? variant.widgets : [])
    .filter((widget) => widget?.type === "text" || widget?.type === "selection-words")
    .sort(compareWidgetsByReadingOrder)
    .map((widget) => ({ widget, view:getWidgetView(widget, "question") }))
    .filter(({ view }) => view?.visible !== false)
    .filter(({ widget, view }) => !(
      normalizedInstruction
      && Number(widget?.row) === 1
      && String(view?.text || "").trim() === normalizedInstruction
    ))
    .map(({ view }) => String(view?.text || "").trim())
    .filter(Boolean);
  return texts.slice(0, 2).join(" · ") || String(question?.title || `Question ${index + 1}`);
}

function getQuestionAnswerPreview(question){
  const variant = materializeQuizQuestionVariant(question, 0);
  const answer = String(variant.expectedAnswerLabel || "").trim();
  if (variant.responseType === "selection-words") {
    return answer.split(";").map((word) => word.trim()).filter(Boolean).join(" - ") || "Réponse à définir";
  }
  return answer || "Réponse à définir";
}

function isQuestionRunnable(question){
  const variantCount = Math.max(1, Array.isArray(question?.variants) ? question.variants.length : 0);
  return Array.from({ length:variantCount }, (_, index) => materializeQuizQuestionVariant(question, index)).every((variant) => {
    if (variant.responseWidgetCount !== 1) return false;
    if (variant.responseType === "qcm-text") {
      const qcm = variant.widgets.find((widget) => widget.type === "qcm-text");
      const choices = (qcm?.qcmChoices || []).filter((choice) => String(choice.text || "").trim());
      return variant.primaryQcmVisibleInQuestion
        && choices.length >= 2
        && choices.some((choice) => choice.isCorrect && String(choice.text || "").trim());
    }
    if (variant.responseType === "selection-words") {
      return variant.primarySelectionVisibleInQuestion && variant.expectedTokenIndexes.length > 0;
    }
    return variant.primaryAnswerVisibleInQuestion && Boolean(String(variant.expectedAnswer || "").trim());
  });
}

function normalizeAvailableQuizzes(source = [], cfg = {}){
  const quizzes = (Array.isArray(source) ? source : [])
    .map((quiz, index) => ({
      ...quiz,
      id: String(quiz?.id || "").trim(),
      title: String(quiz?.title || "Quiz sans titre").trim() || "Quiz sans titre",
      folder_id: normalizeFolderId(quiz?.folder_id),
      is_system: quiz?.is_system === true,
      display_order: Number.isFinite(Number(quiz?.display_order)) ? Number(quiz.display_order) : index
    }))
    .filter((quiz) => quiz.id);

  const fallback = normalizeQuizSnapshot(cfg.quizSnapshot || {});
  const fallbackId = String(cfg.quizId || fallback.id || "").trim();
  if (fallbackId && !findQuizById(quizzes, fallbackId)) {
    quizzes.push({
      ...fallback,
      id: fallbackId,
      title: String(cfg.quizTitle || fallback.title || "Quiz lié").trim() || "Quiz lié",
      folder_id: "",
      is_system: false,
      display_order: Number.MAX_SAFE_INTEGER
    });
  }
  return quizzes.sort(compareTreeItems);
}

function normalizeAvailableFolders(source = []){
  return (Array.isArray(source) ? source : [])
    .map((folder, index) => ({
      ...folder,
      id: String(folder?.id || "").trim(),
      name: String(folder?.name || "Dossier").trim() || "Dossier",
      parent_id: normalizeParentId(folder?.parent_id),
      is_system: folder?.is_system === true,
      display_order: Number.isFinite(Number(folder?.display_order)) ? Number(folder.display_order) : index
    }))
    .filter((folder) => folder.id)
    .sort(compareTreeItems);
}

function readSnapshot(rawValue){
  try {
    return normalizeQuizSnapshot(JSON.parse(String(rawValue || "{}")));
  } catch {
    return normalizeQuizSnapshot({});
  }
}

function normalizeParentId(value){
  const safe = String(value ?? "").trim();
  if (!safe || safe === QUIZ_ROOT_PERSONAL || safe === QUIZ_ROOT_SYSTEM) return "";
  return safe;
}

function normalizeFolderId(value){
  const safe = String(value ?? "").trim();
  if (!safe || safe === QUIZ_ROOT_PERSONAL || safe === QUIZ_ROOT_SYSTEM) return "";
  return safe;
}

function findQuizById(quizzes, id){
  return (Array.isArray(quizzes) ? quizzes : []).find((quiz) => String(quiz?.id || "") === String(id || "")) || null;
}

function compareTreeItems(first, second){
  const firstOrder = Number(first?.display_order);
  const secondOrder = Number(second?.display_order);
  if (Number.isFinite(firstOrder) && Number.isFinite(secondOrder) && firstOrder !== secondOrder) {
    return firstOrder - secondOrder;
  }
  return String(first?.name || first?.title || "").localeCompare(
    String(second?.name || second?.title || ""),
    "fr",
    { sensitivity: "base" }
  );
}

function compareWidgetsByReadingOrder(first, second){
  const rowDifference = Number(first?.row || 0) - Number(second?.row || 0);
  if (rowDifference) return rowDifference;
  return Number(first?.column || 0) - Number(second?.column || 0);
}

function renderQuestionCount(count){
  const safeCount = Math.max(0, Math.trunc(Number(count) || 0));
  return `${safeCount} question${safeCount > 1 ? "s" : ""}`;
}

function setEditorStatus(context, message, isError = false){
  const text = String(message || "").trim();
  if (!text) {
    clearEditorStatus(context);
    return;
  }
  if (typeof context?.setEditorMessage === "function") {
    context.setEditorMessage(text, Boolean(isError));
  }
}

function clearEditorStatus(context){
  if (typeof context?.clearEditorMessage === "function") {
    context.clearEditorMessage();
  } else if (typeof context?.setEditorMessage === "function") {
    context.setEditorMessage("");
  }
}

function injectStyles(){
  if (typeof document === "undefined") return;
  const href = new URL("./config.css", import.meta.url).href;
  const selector = `link[data-quiz-config-style="${href}"]`;
  if (document.querySelector(selector)) {
    stylesInjected = true;
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.quizConfigStyle = href;
  document.head.appendChild(link);
  stylesInjected = true;
}

function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
