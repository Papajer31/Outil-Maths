const QUIZ_LOCAL_STORAGE_KEY = "site-outils.quiz-workspace.v1";
const QUIZ_LOCAL_STORAGE_VERSION = 1;

let fallbackState = {
  version: QUIZ_LOCAL_STORAGE_VERSION,
  folders: [],
  quizzes: []
};

function cloneValue(value){
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function createLocalId(prefix){
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeId(value){
  const text = String(value ?? "").trim();
  return text || null;
}

const QUIZ_GRID_COLUMNS = 12;
const QUIZ_GRID_ROWS = 8;

function clampNumber(value, min, max){
  return Math.min(max, Math.max(min, value));
}

function migrateHorizontalArea(column, columnSpan, sourceColumns){
  const fromColumns = Math.max(1, Math.trunc(Number(sourceColumns) || QUIZ_GRID_COLUMNS));
  const safeColumn = clampNumber(Math.trunc(Number(column) || 1), 1, fromColumns);
  const safeSpan = clampNumber(Math.trunc(Number(columnSpan) || 1), 1, fromColumns - safeColumn + 1);
  if (fromColumns === QUIZ_GRID_COLUMNS) return { column: safeColumn, columnSpan: safeSpan };

  const start = Math.round(((safeColumn - 1) / fromColumns) * QUIZ_GRID_COLUMNS);
  const end = Math.round(((safeColumn - 1 + safeSpan) / fromColumns) * QUIZ_GRID_COLUMNS);
  const migratedColumn = clampNumber(start + 1, 1, QUIZ_GRID_COLUMNS);
  const migratedSpan = clampNumber(Math.max(1, end - start), 1, QUIZ_GRID_COLUMNS - migratedColumn + 1);
  return { column: migratedColumn, columnSpan: migratedSpan };
}

function migrateQuizQuestions(source = {}, sourceColumns = QUIZ_GRID_COLUMNS){
  return (Array.isArray(source.questions) ? source.questions : []).map((question) => {
    const migratedQuestion = cloneValue(question);
    migratedQuestion.widgets = (Array.isArray(migratedQuestion.widgets) ? migratedQuestion.widgets : []).map((widget) => {
      const migratedWidget = cloneValue(widget);
      const questionArea = migrateHorizontalArea(migratedWidget.column, migratedWidget.columnSpan, sourceColumns);
      const correctionArea = migrateHorizontalArea(
        migratedWidget.correctionColumn ?? migratedWidget.column,
        migratedWidget.correctionColumnSpan ?? migratedWidget.columnSpan,
        sourceColumns
      );
      migratedWidget.column = questionArea.column;
      migratedWidget.columnSpan = questionArea.columnSpan;
      migratedWidget.correctionColumn = correctionArea.column;
      migratedWidget.correctionColumnSpan = correctionArea.columnSpan;
      return migratedWidget;
    });
    return migratedQuestion;
  });
}

function normalizeFolder(source = {}, index = 0){
  return {
    id: String(source.id || createLocalId("quiz-folder")),
    name: String(source.name || "Dossier sans nom").trim() || "Dossier sans nom",
    parent_id: normalizeId(source.parent_id),
    display_order: Number.isFinite(Number(source.display_order)) ? Number(source.display_order) : index,
    created_at: String(source.created_at || new Date().toISOString()),
    updated_at: String(source.updated_at || source.created_at || new Date().toISOString())
  };
}

function normalizeQuiz(source = {}, index = 0){
  const now = new Date().toISOString();
  const sourceColumns = Math.max(1, Math.trunc(Number(source.grid?.columns) || QUIZ_GRID_COLUMNS));
  return {
    ...cloneValue(source),
    version: Number(source.version) || 1,
    id: String(source.id || createLocalId("quiz")),
    title: String(source.title || "Quiz sans titre").trim() || "Quiz sans titre",
    folder_id: normalizeId(source.folder_id),
    display_order: Number.isFinite(Number(source.display_order)) ? Number(source.display_order) : index,
    is_system: source.is_system === true,
    grid: {
      columns: QUIZ_GRID_COLUMNS,
      rows: QUIZ_GRID_ROWS
    },
    questions: migrateQuizQuestions(source, sourceColumns),
    created_at: String(source.created_at || now),
    updated_at: String(source.updated_at || now)
  };
}

function normalizeState(source = {}){
  const folders = Array.isArray(source.folders)
    ? source.folders.map(normalizeFolder)
    : [];
  const quizzes = Array.isArray(source.quizzes)
    ? source.quizzes.map(normalizeQuiz)
    : [];
  return {
    version: QUIZ_LOCAL_STORAGE_VERSION,
    folders,
    quizzes
  };
}

function getStorage(){
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function loadQuizLocalState(){
  const storage = getStorage();
  if (!storage) return cloneValue(fallbackState);
  try {
    const raw = storage.getItem(QUIZ_LOCAL_STORAGE_KEY);
    if (!raw) return cloneValue(fallbackState);
    const parsed = JSON.parse(raw);
    fallbackState = normalizeState(parsed);
  } catch (error) {
    console.warn("Impossible de lire les quiz enregistrés localement.", error);
  }
  return cloneValue(fallbackState);
}

export function saveQuizLocalState(source = {}){
  const next = normalizeState(source);
  fallbackState = cloneValue(next);
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(QUIZ_LOCAL_STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      console.warn("Impossible d’enregistrer les quiz localement.", error);
      throw new Error("Le stockage local du navigateur est indisponible.");
    }
  }
  if (typeof globalThis.dispatchEvent === "function" && typeof globalThis.CustomEvent === "function") {
    globalThis.dispatchEvent(new CustomEvent("quiz-local-store-changed", { detail: cloneValue(next) }));
  }
  return cloneValue(next);
}

export function upsertQuizLocal(source = {}){
  const state = loadQuizLocalState();
  const existingIndex = state.quizzes.findIndex((quiz) => String(quiz.id) === String(source.id || ""));
  const existing = existingIndex >= 0 ? state.quizzes[existingIndex] : null;
  const now = new Date().toISOString();
  const nextQuiz = normalizeQuiz({
    ...existing,
    ...cloneValue(source),
    id: source.id || existing?.id || createLocalId("quiz"),
    created_at: existing?.created_at || source.created_at || now,
    updated_at: now,
    display_order: existing?.display_order ?? source.display_order ?? state.quizzes.length
  }, existingIndex >= 0 ? existingIndex : state.quizzes.length);

  if (existingIndex >= 0) state.quizzes.splice(existingIndex, 1, nextQuiz);
  else state.quizzes.push(nextQuiz);
  saveQuizLocalState(state);
  return cloneValue(nextQuiz);
}

export function deleteQuizLocal(quizId){
  const safeId = String(quizId || "");
  const state = loadQuizLocalState();
  const next = state.quizzes.filter((quiz) => String(quiz.id) !== safeId);
  if (next.length === state.quizzes.length) return false;
  state.quizzes = next;
  saveQuizLocalState(state);
  return true;
}

export function upsertQuizFolderLocal(source = {}){
  const state = loadQuizLocalState();
  const existingIndex = state.folders.findIndex((folder) => String(folder.id) === String(source.id || ""));
  const existing = existingIndex >= 0 ? state.folders[existingIndex] : null;
  const now = new Date().toISOString();
  const nextFolder = normalizeFolder({
    ...existing,
    ...source,
    id: source.id || existing?.id || createLocalId("quiz-folder"),
    created_at: existing?.created_at || source.created_at || now,
    updated_at: now,
    display_order: existing?.display_order ?? source.display_order ?? state.folders.length
  }, existingIndex >= 0 ? existingIndex : state.folders.length);

  if (existingIndex >= 0) state.folders.splice(existingIndex, 1, nextFolder);
  else state.folders.push(nextFolder);
  saveQuizLocalState(state);
  return cloneValue(nextFolder);
}

export function deleteQuizFolderLocal(folderId){
  const safeId = String(folderId || "");
  const state = loadQuizLocalState();
  const hasChildFolder = state.folders.some((folder) => String(folder.parent_id || "") === safeId);
  const hasQuiz = state.quizzes.some((quiz) => String(quiz.folder_id || "") === safeId);
  if (hasChildFolder || hasQuiz) throw new Error("Ce dossier doit être vide avant suppression.");
  const next = state.folders.filter((folder) => String(folder.id) !== safeId);
  if (next.length === state.folders.length) return false;
  state.folders = next;
  saveQuizLocalState(state);
  return true;
}

export { QUIZ_LOCAL_STORAGE_KEY };
