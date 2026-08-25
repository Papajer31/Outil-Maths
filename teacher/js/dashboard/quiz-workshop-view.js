import { openToolAssetPicker } from "../../../shared/tool-assets/asset-picker.js";
import {
  normalizeQuizImageSource,
  resolveQuizImageSourceUrl
} from "../../../shared/quiz-local-image-store.js";
import {
  normalizeQuizAudioSource,
  resolveQuizAudioSourceUrl
} from "../../../shared/quiz-audio-source.js";
import {
  createDefaultAudioRecordingTitle,
  openAudioRecorderDialog
} from "./audio-recorder-dialog.js";
import { QUESTION_MODELS } from "./quiz-question-models.js";
import {
  findQuizSelectionIndexesFromText,
  formatQuizSelectionIndexes,
  getQuizSelectionWordCount,
  normalizeQuizSelectionIndexes,
  renderQuizSelectionTextToHtml,
  tokenizeQuizSelectionText
} from "../../../shared/quiz-selection-text.js";

const GRID_COLUMNS = 12;
const GRID_ROWS = 8;
const QCM_LAYOUTS = new Set(["auto", "row", "column", "grid"]);
const QUIZ_FONT_SIZES = new Set(["small", "normal", "large", "huge"]);
const QCM_MIN_CHOICES = 2;
const QCM_DEFAULT_CHOICES = 4;
const QCM_MAX_CHOICES = 6;
const MAX_RESOURCE_FILE_SIZE = 25 * 1024 * 1024;
const RESOURCE_STORAGE_QUOTA_BYTES = 100 * 1024 * 1024;
const RESPONSE_WIDGET_TYPES = new Set(["answer", "qcm-text", "selection-words", "categories"]);
const CORRECTION_VISIBILITY_STATES = ["visible", "correct", "incorrect", "hidden"];
const QUESTION_ELEMENT_GROUPS = [
  { id:"content", title:"Contenu" },
  { id:"response", title:"Réponse de l’élève" },
  { id:"input", title:"Outils de saisie" }
];
const QUIZ_VARIANT_COLORS = {
  r: "#d32f2f",
  v: "#2e7d32",
  j: "#d49a00",
  b: "#1565c0"
};
const QUIZ_VARIANT_COLOR_CODES = Object.fromEntries(
  Object.entries(QUIZ_VARIANT_COLORS).map(([code, color]) => [color, code])
);

const QUESTION_ELEMENTS = [
  {
    id: "text",
    group: "content",
    icon: "text_fields",
    title: "Texte",
    description: "Bloc de texte libre."
  },
  {
    id: "answer",
    group: "response",
    icon: "short_text",
    title: "Réponse de l’élève",
    description: "Zone de réponse textuelle.",
    detail: "Éditable dans la vue correction."
  },
  {
    id: "image",
    group: "content",
    icon: "image",
    title: "Image",
    description: "Image des ressources ou image importée.",
    detail: "Toujours affichée sans recadrage."
  },
  {
    id: "audio",
    group: "content",
    icon: "play_arrow",
    title: "Audio",
    description: "Audio des ressources, importé ou enregistré.",
    detail: "Lecture manuelle dans le runtime."
  },
  {
    id: "labels",
    group: "content",
    icon: "label",
    title: "Étiquettes",
    description: "Étiquettes texte à déplacer librement.",
    detail: "La zone du widget devient leur surface de manipulation."
  },
  {
    id: "numeric-keypad",
    group: "input",
    icon: "apps",
    title: "Clavier numérique",
    description: "Clavier numérique commun.",
    detail: "Affiché pendant la question."
  },
  {
    id: "qcm-text",
    group: "response",
    icon: "quiz",
    title: "QCM (texte)",
    description: "Question à choix unique.",
    detail: "Les propositions sont mélangées dans le runtime."
  },
  {
    id: "selection-words",
    group: "response",
    icon: "touch_app",
    title: "Sélection de mots",
    description: "Sélection de mots dans une phrase.",
    detail: "Les groupes continus sont détectés automatiquement."
  },
  {
    id: "categories",
    group: "response",
    icon: "category",
    title: "Catégories",
    description: "Zones pour classer des étiquettes. Doit être relié à un widget Étiquettes."
  }
];

function escapeHtml(value){
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clamp(value, min, max){
  return Math.min(max, Math.max(min, value));
}

function cloneValue(value){
  return JSON.parse(JSON.stringify(value));
}

function normalizeLabelItems(sourceItems, { ensureDefault = false } = {}){
  const source = Array.isArray(sourceItems) ? sourceItems : [];
  const items = source.map((item) => {
    const safe = item && typeof item === "object" && !Array.isArray(item) ? item : { text:item };
    return {
      id:String(safe.id || createId("label")),
      text:String(safe.text ?? safe.label ?? "")
    };
  });
  if (ensureDefault && !items.length) {
    return Array.from({ length:2 }, () => ({ id:createId("label"), text:"" }));
  }
  return items;
}

function normalizeCategoryItems(sourceItems, { ensureDefault = false } = {}){
  const source = Array.isArray(sourceItems) ? sourceItems : [];
  const items = source.map((item) => {
    const safe = item && typeof item === "object" && !Array.isArray(item) ? item : { title:item };
    return {
      id:String(safe.id || createId("category")),
      title:String(safe.title ?? safe.label ?? ""),
      labelIds:Array.from(new Set((Array.isArray(safe.labelIds ?? safe.label_ids) ? (safe.labelIds ?? safe.label_ids) : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)))
    };
  });
  if (ensureDefault && !items.length) {
    return [1, 2].map(() => ({ id:createId("category"), title:"", labelIds:[] }));
  }
  return items;
}

function getCategoryAssignmentState(labelItems = [], categoryItems = []){
  const validLabelIds = new Set(normalizeLabelItems(labelItems).map((item) => item.id));
  const assignments = new Map();
  const duplicateLabelIds = new Set();
  normalizeCategoryItems(categoryItems).forEach((category) => {
    category.labelIds.forEach((labelId) => {
      if (!validLabelIds.has(labelId)) return;
      if (assignments.has(labelId)) duplicateLabelIds.add(labelId);
      else assignments.set(labelId, category.id);
    });
  });
  const missingLabelIds = Array.from(validLabelIds).filter((labelId) => !assignments.has(labelId));
  return { assignments, duplicateLabelIds, missingLabelIds };
}

function parseLabelsQuickEntry(value, previousItems = []){
  const values = String(value ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!values.length) return { error:"le widget Étiquettes doit contenir au moins une étiquette.", items:[] };
  const previous = normalizeLabelItems(previousItems);
  return {
    error:"",
    items:values.map((text, index) => ({ id:previous[index]?.id || createId("label"), text }))
  };
}

function parseCategoriesQuickEntry(value, labelItems = [], previousItems = []){
  const labels = normalizeLabelItems(labelItems);
  const segments = String(value ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
  if (segments.length < 2) {
    return { error:"le widget Catégories doit contenir au moins deux catégories.", items:[] };
  }

  const previous = normalizeCategoryItems(previousItems);
  const usedIndexes = new Set();
  const items = [];
  for (let index = 0; index < segments.length; index += 1) {
    const separatorIndex = segments[index].indexOf(":");
    if (separatorIndex <= 0) {
      return { error:`la catégorie « ${segments[index]} » doit suivre le format Titre:1,2.`, items:[] };
    }
    const title = segments[index].slice(0, separatorIndex).trim();
    const rawIndexes = segments[index].slice(separatorIndex + 1).trim();
    if (!title) return { error:"chaque catégorie doit avoir un titre.", items:[] };
    const indexes = rawIndexes
      ? rawIndexes.split(",").map((part) => Number.parseInt(part.trim(), 10))
      : [];
    if (indexes.some((position) => !Number.isInteger(position) || position < 1 || position > labels.length)) {
      return { error:`les numéros d’étiquettes de « ${title} » doivent être compris entre 1 et ${labels.length}.`, items:[] };
    }
    for (const position of indexes) {
      if (usedIndexes.has(position)) {
        return { error:`l’étiquette n°${position} est affectée à plusieurs catégories.`, items:[] };
      }
      usedIndexes.add(position);
    }
    items.push({
      id:previous[index]?.id || createId("category"),
      title,
      labelIds:indexes.map((position) => labels[position - 1].id)
    });
  }
  if (usedIndexes.size !== labels.length) {
    const missing = labels.map((_, index) => index + 1).filter((position) => !usedIndexes.has(position));
    return { error:`toutes les étiquettes doivent être classées. Il manque : ${missing.join(", ")}.`, items:[] };
  }
  return { error:"", items };
}

function isResponseWidget(widget = {}){
  return RESPONSE_WIDGET_TYPES.has(String(widget?.type || ""));
}

function normalizeCorrectionVisibility(value, fallback = "visible"){
  const safe = String(value || "").trim().toLowerCase();
  return CORRECTION_VISIBILITY_STATES.includes(safe) ? safe : fallback;
}

function getWidgetVisibilityState(widget, mode = "question"){
  if (widget?.type === "numeric-keypad") {
    const visible = mode !== "correction";
    return { visible, visibilityMode: visible ? "visible" : "hidden" };
  }

  if (mode !== "correction") {
    const visible = widget?.questionVisible !== false;
    return { visible, visibilityMode: visible ? "visible" : "hidden" };
  }

  const inheritedMode = widget?.questionVisible !== false ? "visible" : "hidden";
  const overrides = widget?.correctionOverrides || {};
  const visibilityMode = overrides.visibility
    ? normalizeCorrectionVisibility(
        widget?.correctionVisibility,
        widget?.correctionVisible === false ? "hidden" : "visible"
      )
    : inheritedMode;
  return { visible: visibilityMode !== "hidden", visibilityMode };
}

function getVisibilityControlPresentation(visibilityMode, mode = "question"){
  const safeMode = mode === "correction"
    ? normalizeCorrectionVisibility(visibilityMode, "visible")
    : visibilityMode === "hidden" ? "hidden" : "visible";
  if (safeMode === "correct") return { icon:"visibility", label:"Si correct ✓", action:"Afficher si la réponse est correcte" };
  if (safeMode === "incorrect") return { icon:"visibility", label:"Si incorrect ✕", action:"Afficher si la réponse est incorrecte" };
  if (safeMode === "hidden") return { icon:"visibility_off", label:"Masqué", action:"Afficher ce bloc" };
  return { icon:"visibility", label:"Visible", action:"Modifier la visibilité" };
}

function getQuestionCompositionIssues(widgets = []){
  const safeWidgets = Array.isArray(widgets) ? widgets : [];
  const responseCount = safeWidgets.filter(isResponseWidget).length;
  const hasNumericKeypad = safeWidgets.some((widget) => widget.type === "numeric-keypad");
  const hasAnswerReceiver = safeWidgets.some((widget) => widget.type === "answer");
  const issues = [];

  if (responseCount === 0) {
    issues.push({
      code:"missing-response",
      label:"Aucune réponse élève"
    });
  } else if (responseCount > 1) {
    // Cas conservé pour les anciens brouillons éventuellement créés avant
    // l'instauration de la limite à un seul widget de réponse.
    issues.push({
      code:"multiple-responses",
      label:"Plusieurs réponses élève"
    });
  }

  if (hasNumericKeypad && !hasAnswerReceiver) {
    issues.push({
      code:"keypad-without-receiver",
      label:"Le clavier numérique nécessite un champ Réponse"
    });
  }

  safeWidgets.filter((widget) => widget.type === "categories").forEach((widget) => {
    const source = safeWidgets.find((entry) => entry.id === widget.labelsSourceWidgetId && entry.type === "labels");
    if (!source) {
      issues.push({
        code:`categories-source-${widget.id}`,
        label:"Catégories sans source d’étiquettes"
      });
      return;
    }
    const labels = normalizeLabelItems(source.labelItems).filter((item) => item.text.trim());
    const categories = normalizeCategoryItems(widget.categoryItems);
    const assignmentState = getCategoryAssignmentState(labels, categories);
    if (labels.length === 0 || categories.length < 2 || assignmentState.missingLabelIds.length || assignmentState.duplicateLabelIds.size) {
      issues.push({
        code:`categories-incomplete-${widget.id}`,
        label:"Classement des catégories incomplet"
      });
    }
  });

  return issues;
}

function normalizeGridColumnCount(value){
  const columns = Math.trunc(Number(value) || GRID_COLUMNS);
  return columns > 0 ? columns : GRID_COLUMNS;
}

function migrateHorizontalArea(column, columnSpan, sourceColumns = GRID_COLUMNS){
  const fromColumns = normalizeGridColumnCount(sourceColumns);
  const safeColumn = clamp(Math.trunc(Number(column) || 1), 1, fromColumns);
  const safeSpan = clamp(Math.trunc(Number(columnSpan) || 1), 1, fromColumns - safeColumn + 1);
  if (fromColumns === GRID_COLUMNS) return { column: safeColumn, columnSpan: safeSpan };

  const start = Math.round(((safeColumn - 1) / fromColumns) * GRID_COLUMNS);
  const end = Math.round(((safeColumn - 1 + safeSpan) / fromColumns) * GRID_COLUMNS);
  const migratedColumn = clamp(start + 1, 1, GRID_COLUMNS);
  const migratedSpan = clamp(Math.max(1, end - start), 1, GRID_COLUMNS - migratedColumn + 1);
  return { column: migratedColumn, columnSpan: migratedSpan };
}

function migrateQuestionGrid(question = {}, sourceColumns = GRID_COLUMNS){
  const safeQuestion = cloneValue(question);
  if (normalizeGridColumnCount(sourceColumns) === GRID_COLUMNS) return safeQuestion;
  safeQuestion.widgets = (Array.isArray(safeQuestion.widgets) ? safeQuestion.widgets : []).map((widget) => {
    const migrated = cloneValue(widget);
    const questionArea = migrateHorizontalArea(migrated.column, migrated.columnSpan, sourceColumns);
    const correctionArea = migrateHorizontalArea(
      migrated.correctionColumn ?? migrated.column,
      migrated.correctionColumnSpan ?? migrated.columnSpan,
      sourceColumns
    );
    migrated.column = questionArea.column;
    migrated.columnSpan = questionArea.columnSpan;
    migrated.correctionColumn = correctionArea.column;
    migrated.correctionColumnSpan = correctionArea.columnSpan;
    return migrated;
  });
  return safeQuestion;
}

const QUIZ_TEXT_COLOR_ALIASES = new Map([
  ["#d32f2f", "#d32f2f"],
  ["rgb(211, 47, 47)", "#d32f2f"],
  ["#2e7d32", "#2e7d32"],
  ["rgb(46, 125, 50)", "#2e7d32"],
  ["#1565c0", "#1565c0"],
  ["rgb(21, 101, 192)", "#1565c0"],
  ["#d49a00", "#d49a00"],
  ["rgb(212, 154, 0)", "#d49a00"]
]);

function plainTextToHtml(value){
  return escapeHtml(String(value ?? "")).replace(/\r?\n/g, "<br>");
}

function richTextToPlainText(value){
  if (typeof document === "undefined") return String(value ?? "").replace(/<[^>]*>/g, "");
  const host = document.createElement("div");
  host.innerHTML = String(value ?? "");
  return host.innerText.replace(/\r/g, "");
}

function sanitizeRichText(value){
  if (typeof document === "undefined") return escapeHtml(String(value ?? ""));

  const source = document.createElement("template");
  source.innerHTML = String(value ?? "");
  const output = document.createElement("div");
  const allowedTags = new Set(["BR", "STRONG", "B", "EM", "I", "U", "SPAN", "DIV", "P", "FONT"]);

  const appendCleanNode = (node, parent) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.append(document.createTextNode(node.textContent || ""));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tagName = node.tagName.toUpperCase();
    if (!allowedTags.has(tagName)) {
      Array.from(node.childNodes).forEach((child) => appendCleanNode(child, parent));
      return;
    }

    const normalizedTag = tagName === "B" ? "strong" : tagName === "I" ? "em" : tagName === "FONT" ? "span" : tagName.toLowerCase();
    const cleanElement = document.createElement(normalizedTag);
    const rawColor = String(node.getAttribute("color") || node.style?.color || "").trim().toLowerCase();
    const safeColor = QUIZ_TEXT_COLOR_ALIASES.get(rawColor);
    const fontWeight = String(node.style?.fontWeight || "").trim().toLowerCase();
    const fontStyle = String(node.style?.fontStyle || "").trim().toLowerCase();
    const textDecoration = String(node.style?.textDecorationLine || node.style?.textDecoration || "").trim().toLowerCase();
    if (safeColor) cleanElement.style.color = safeColor;
    if (fontWeight === "bold" || Number.parseInt(fontWeight, 10) >= 600) cleanElement.style.fontWeight = "bold";
    if (fontStyle === "italic") cleanElement.style.fontStyle = "italic";
    if (textDecoration.includes("underline")) cleanElement.style.textDecoration = "underline";
    Array.from(node.childNodes).forEach((child) => appendCleanNode(child, cleanElement));
    parent.append(cleanElement);
  };

  Array.from(source.content.childNodes).forEach((node) => appendCleanNode(node, output));
  return output.innerHTML;
}

function normalizeTextFormattingRuns(runs, textLength){
  const normalized = (Array.isArray(runs) ? runs : [])
    .map((run) => ({
      start: clamp(Number(run.start) || 0, 0, textLength),
      end: clamp(Number(run.end) || 0, 0, textLength),
      bold: Boolean(run.bold),
      italic: Boolean(run.italic),
      underline: Boolean(run.underline),
      color: QUIZ_TEXT_COLOR_ALIASES.get(String(run.color || "").trim().toLowerCase()) || ""
    }))
    .filter((run) => run.end > run.start)
    .sort((first, second) => first.start - second.start || first.end - second.end);

  const merged = [];
  normalized.forEach((run) => {
    const previous = merged.at(-1);
    const sameStyle = previous
      && previous.end === run.start
      && previous.bold === run.bold
      && previous.italic === run.italic
      && previous.underline === run.underline
      && previous.color === run.color;
    if (sameStyle) previous.end = run.end;
    else merged.push(run);
  });
  return merged;
}

function getFormattingSignature(runs, textLength){
  return JSON.stringify(normalizeTextFormattingRuns(runs, textLength));
}

function richHtmlToModel(value){
  const cleanHtml = sanitizeRichText(value);
  if (typeof document === "undefined") {
    const text = richTextToPlainText(cleanHtml);
    return { text, formatting: [] };
  }

  const host = document.createElement("div");
  host.innerHTML = cleanHtml;
  let text = "";
  const styledCharacters = [];
  const blockTags = new Set(["DIV", "P"]);

  const appendText = (valueToAppend, format) => {
    Array.from(String(valueToAppend || "")).forEach((character) => {
      text += character;
      styledCharacters.push({ ...format });
    });
  };

  const walk = (node, inherited = { bold: false, italic: false, underline: false, color: "" }) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(node.textContent || "", inherited);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.tagName === "BR") {
      appendText("\n", inherited);
      return;
    }

    const tag = node.tagName.toUpperCase();
    const rawColor = String(node.getAttribute("color") || node.style?.color || "").trim().toLowerCase();
    const fontWeight = String(node.style?.fontWeight || "").trim().toLowerCase();
    const fontStyle = String(node.style?.fontStyle || "").trim().toLowerCase();
    const textDecoration = String(node.style?.textDecorationLine || node.style?.textDecoration || "").trim().toLowerCase();
    const format = {
      bold: inherited.bold || tag === "STRONG" || tag === "B" || fontWeight === "bold" || Number.parseInt(fontWeight, 10) >= 600,
      italic: inherited.italic || tag === "EM" || tag === "I" || fontStyle === "italic",
      underline: inherited.underline || tag === "U" || textDecoration.includes("underline"),
      color: QUIZ_TEXT_COLOR_ALIASES.get(rawColor) || inherited.color || ""
    };
    const isBlock = blockTags.has(tag);
    if (isBlock && text && !text.endsWith("\n")) appendText("\n", inherited);
    Array.from(node.childNodes).forEach((child) => walk(child, format));
  };

  Array.from(host.childNodes).forEach((node) => walk(node));
  if (text.endsWith("\n")) {
    text = text.slice(0, -1);
    styledCharacters.pop();
  }

  const formatting = [];
  let runStart = 0;
  for (let index = 1; index <= styledCharacters.length; index += 1) {
    const previous = styledCharacters[index - 1] || { bold: false, italic: false, underline: false, color: "" };
    const current = styledCharacters[index];
    const changed = !current
      || previous.bold !== current.bold
      || previous.italic !== current.italic
      || previous.underline !== current.underline
      || previous.color !== current.color;
    if (!changed) continue;
    if (previous.bold || previous.italic || previous.underline || previous.color) {
      formatting.push({ start: runStart, end: index, ...previous });
    }
    runStart = index;
  }

  return { text, formatting: normalizeTextFormattingRuns(formatting, text.length) };
}

function richTextModelToHtml(text, formatting){
  const rawText = String(text ?? "");
  const runs = normalizeTextFormattingRuns(formatting, rawText.length);
  let cursor = 0;
  const chunks = [];
  const appendChunk = (value, run = null) => {
    if (!value) return;
    const escaped = escapeHtml(value).replace(/\r?\n/g, "<br>");
    if (!run || (!run.bold && !run.italic && !run.underline && !run.color)) {
      chunks.push(escaped);
      return;
    }
    const styles = [];
    if (run.bold) styles.push("font-weight:bold");
    if (run.italic) styles.push("font-style:italic");
    if (run.underline) styles.push("text-decoration:underline");
    if (run.color) styles.push(`color:${run.color}`);
    chunks.push(`<span style="${styles.join(";")}">${escaped}</span>`);
  };

  runs.forEach((run) => {
    if (run.start > cursor) appendChunk(rawText.slice(cursor, run.start));
    appendChunk(rawText.slice(run.start, run.end), run);
    cursor = run.end;
  });
  if (cursor < rawText.length) appendChunk(rawText.slice(cursor));
  return chunks.join("");
}


function createId(prefix){
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeQcmLayout(value){
  const normalized = String(value || "auto").trim().toLowerCase();
  return QCM_LAYOUTS.has(normalized) ? normalized : "auto";
}

function normalizeQuizFontSize(value){
  const normalized = String(value || "normal").trim().toLowerCase();
  return QUIZ_FONT_SIZES.has(normalized) ? normalized : "normal";
}

function createQcmChoice(source = {}, index = 0){
  const text = String(source.text ?? source.label ?? "");
  return {
    id: String(source.id || createId("choice")),
    text,
    formatting: normalizeTextFormattingRuns(source.formatting, text.length),
    isCorrect: Boolean(source.isCorrect ?? source.is_correct ?? index === 0)
  };
}

function normalizeQcmChoices(sourceChoices, { ensureDefaultSlots = true } = {}){
  const source = Array.isArray(sourceChoices) ? sourceChoices.slice(0, QCM_MAX_CHOICES) : [];
  const targetLength = source.length
    ? Math.max(QCM_MIN_CHOICES, source.length)
    : ensureDefaultSlots
      ? QCM_DEFAULT_CHOICES
      : QCM_MIN_CHOICES;
  const choices = Array.from({ length:Math.min(QCM_MAX_CHOICES, targetLength) }, (_, index) => (
    createQcmChoice(source[index] || {}, index)
  ));
  let correctIndex = choices.findIndex((choice) => choice.isCorrect);
  if (correctIndex < 0) correctIndex = 0;
  choices.forEach((choice, index) => {
    choice.isCorrect = index === correctIndex;
  });
  return choices;
}

function getQcmChoicePlaceholder(choice, index){
  if (choice?.isCorrect) return "Bonne réponse";
  return `Distracteur ${Math.max(1, index)}`;
}

function resolveQcmLayout(widgetView, choices = [], requestedLayout = "auto"){
  const requested = normalizeQcmLayout(requestedLayout);
  if (requested !== "auto") return requested;
  const nonEmptyChoices = choices.filter((choice) => String(choice?.text || "").trim());
  const count = Math.max(QCM_MIN_CHOICES, nonEmptyChoices.length || choices.length || QCM_DEFAULT_CHOICES);
  const longest = Math.max(0, ...choices.map((choice) => String(choice?.text || "").trim().length));
  const width = Number(widgetView?.columnSpan) || 1;
  const height = Number(widgetView?.rowSpan) || 1;

  if (height <= 1 && width >= count * 2 && longest <= 20) return "row";
  if (width <= 4 || longest >= 38) return "column";
  if (count >= 4 && width >= 6 && height >= 2) return "grid";
  if (count <= 3 && width >= count * 2 && longest <= 24) return "row";
  return "column";
}

function getQcmGridColumnCount(widgetView, choices = []){
  const count = Math.max(QCM_MIN_CHOICES, choices.length || QCM_DEFAULT_CHOICES);
  const width = Number(widgetView?.columnSpan) || 1;
  if (count <= 2) return 2;
  if (count === 3) return width >= 8 ? 3 : 2;
  if (count === 4) return 2;
  return width >= 9 ? 3 : 2;
}

function getWidgetMinimumGridSize(type = ""){
  if (type === "numeric-keypad") return { columnSpan:6, rowSpan:1 };
  if (type === "categories") return { columnSpan:4, rowSpan:2 };
  if (type === "labels") return { columnSpan:4, rowSpan:3 };
  if (type === "qcm-text") return { columnSpan:3, rowSpan:1 };
  if (type === "image" || type === "audio") return { columnSpan:2, rowSpan:2 };
  return { columnSpan:1, rowSpan:1 };
}

function createWidget(source = {}){
  const rawType = String(source.type || "text").trim().toLowerCase();
  const type = ["text", "answer", "image", "audio", "labels", "numeric-keypad", "qcm-text", "selection-words", "categories"].includes(rawType) ? rawType : "text";
  const isAnswer = type === "answer";
  const isImage = type === "image";
  const isAudio = type === "audio";
  const isLabels = type === "labels";
  const isNumericKeypad = type === "numeric-keypad";
  const isQcmText = type === "qcm-text";
  const isSelectionWords = type === "selection-words";
  const isCategories = type === "categories";
  const defaultQuestionPlaceholder = isAnswer
    ? "Réponse de l’élève"
    : isSelectionWords
      ? "Saisissez la phrase dans laquelle l’élève sélectionnera des mots"
      : isNumericKeypad || isImage || isAudio || isLabels || isCategories
        ? ""
        : "Saisissez le texte";
  const defaultCorrectionPlaceholder = isAnswer ? "Saisissez la réponse attendue" : defaultQuestionPlaceholder;
  const sourceQuestionModel = source.questionFormatting
    ? { text: String(source.questionText ?? ""), formatting: source.questionFormatting }
    : richHtmlToModel(source.questionHtml ?? plainTextToHtml(source.questionText ?? ""));
  const questionText = String(source.questionText ?? sourceQuestionModel.text ?? "");
  const questionFormatting = normalizeTextFormattingRuns(source.questionFormatting ?? sourceQuestionModel.formatting, questionText.length);

  const sourceCorrectionModel = source.correctionFormatting
    ? { text: String(source.correctionText ?? questionText), formatting: source.correctionFormatting }
    : richHtmlToModel(source.correctionHtml ?? plainTextToHtml(source.correctionText ?? questionText));
  const correctionText = String(source.correctionText ?? sourceCorrectionModel.text ?? questionText);
  const correctionFormatting = normalizeTextFormattingRuns(source.correctionFormatting ?? sourceCorrectionModel.formatting, correctionText.length);
  const questionImageSource = isImage
    ? normalizeQuizImageSource(source.questionImageSource ?? source.question_image_source ?? source.imageSource ?? source.image_source)
    : null;
  const correctionImageSource = isImage
    ? normalizeQuizImageSource(source.correctionImageSource ?? source.correction_image_source ?? questionImageSource)
    : null;
  const questionAudioSource = isAudio
    ? normalizeQuizAudioSource(source.questionAudioSource ?? source.question_audio_source ?? source.audioSource ?? source.audio_source)
    : null;
  const correctionAudioSource = isAudio
    ? normalizeQuizAudioSource(source.correctionAudioSource ?? source.correction_audio_source ?? questionAudioSource)
    : null;

  const legacyVisibility = source.visibility || "both";
  const questionVisible = isNumericKeypad
    ? true
    : source.questionVisible ?? legacyVisibility !== "correction";
  const correctionVisible = isNumericKeypad
    ? false
    : source.correctionVisible ?? legacyVisibility !== "question";
  const inheritedCorrectionVisibility = questionVisible ? "visible" : "hidden";
  const correctionVisibility = isNumericKeypad
    ? "hidden"
    : normalizeCorrectionVisibility(
        source.correctionVisibility ?? source.correction_visibility,
        correctionVisible ? "visible" : "hidden"
      );
  const minimumGridSize = getWidgetMinimumGridSize(type);
  const column = clamp(Number(source.column) || 1, 1, GRID_COLUMNS);
  const row = clamp(Number(source.row) || 1, 1, GRID_ROWS);
  const columnSpan = clamp(Number(source.columnSpan) || (isNumericKeypad ? GRID_COLUMNS : isCategories ? 8 : isQcmText || isSelectionWords ? 8 : isLabels ? 6 : isImage || isAudio ? 3 : 5), minimumGridSize.columnSpan, GRID_COLUMNS);
  const rowSpan = clamp(Number(source.rowSpan) || (isCategories ? 4 : isQcmText ? 3 : isLabels ? 3 : isSelectionWords ? 2 : isImage || isAudio ? 2 : 1), minimumGridSize.rowSpan, GRID_ROWS);
  const textAlign = source.textAlign || "center";
  const verticalAlign = source.verticalAlign || "middle";
  const sourceOverrides = source.correctionOverrides || {};
  const legacyContentOverride = Boolean(sourceOverrides.content);
  const inferredOverrides = {
    text: correctionText !== questionText,
    formatting: getFormattingSignature(correctionFormatting, correctionText.length) !== getFormattingSignature(questionFormatting, questionText.length),
    position: false,
    size: false,
    textAlign: false,
    verticalAlign: false,
    fontSize: false,
    visibility: correctionVisibility !== inheritedCorrectionVisibility,
    image: isImage && JSON.stringify(correctionImageSource) !== JSON.stringify(questionImageSource),
    audio: isAudio && JSON.stringify(correctionAudioSource) !== JSON.stringify(questionAudioSource)
  };

  return {
    id: source.id || createId("widget"),
    type,
    label: source.label || (isAnswer ? "Réponse de l’élève" : isImage ? "Image" : isAudio ? "Audio" : isLabels ? "Étiquettes" : isNumericKeypad ? "Clavier numérique" : isQcmText ? "QCM (texte)" : isSelectionWords ? "Sélection de mots" : isCategories ? "Catégories" : "Texte"),
    questionText,
    correctionText,
    questionPlaceholder: String(source.questionPlaceholder ?? defaultQuestionPlaceholder),
    correctionPlaceholder: String(source.correctionPlaceholder ?? source.questionPlaceholder ?? defaultCorrectionPlaceholder),
    questionFormatting,
    correctionFormatting,
    questionHtml: richTextModelToHtml(questionText, questionFormatting),
    correctionHtml: richTextModelToHtml(correctionText, correctionFormatting),
    questionImageSource,
    correctionImageSource,
    questionAudioSource,
    correctionAudioSource,
    column,
    row,
    columnSpan,
    rowSpan,
    correctionColumn: clamp(Number(source.correctionColumn) || column, 1, GRID_COLUMNS),
    correctionRow: clamp(Number(source.correctionRow) || row, 1, GRID_ROWS),
    correctionColumnSpan: clamp(Number(source.correctionColumnSpan) || columnSpan, minimumGridSize.columnSpan, GRID_COLUMNS),
    correctionRowSpan: clamp(Number(source.correctionRowSpan) || rowSpan, minimumGridSize.rowSpan, GRID_ROWS),
    questionVisible: Boolean(questionVisible),
    correctionVisible: correctionVisibility !== "hidden",
    correctionVisibility,
    textAlign,
    correctionTextAlign: source.correctionTextAlign || textAlign,
    verticalAlign,
    correctionVerticalAlign: source.correctionVerticalAlign || verticalAlign,
    fontSize: normalizeQuizFontSize(source.fontSize ?? source.font_size),
    correctionFontSize: normalizeQuizFontSize(source.correctionFontSize ?? source.correction_font_size ?? source.fontSize ?? source.font_size),
    qcmLayout: normalizeQcmLayout(source.qcmLayout ?? source.qcm_layout),
    qcmChoices: isQcmText
      ? normalizeQcmChoices(source.qcmChoices ?? source.qcm_choices ?? source.choices)
      : [],
    labelItems: isLabels
      ? normalizeLabelItems(source.labelItems ?? source.label_items ?? source.labels, { ensureDefault:true })
      : [],
    labelsSourceWidgetId: isCategories
      ? String(source.labelsSourceWidgetId ?? source.labels_source_widget_id ?? source.sourceWidgetId ?? source.source_widget_id ?? "")
      : "",
    categoryItems: isCategories
      ? normalizeCategoryItems(source.categoryItems ?? source.category_items ?? source.categories, { ensureDefault:true })
      : [],
    selectionExpectedTokenIndexes: isSelectionWords
      ? normalizeQuizSelectionIndexes(
          source.selectionExpectedTokenIndexes ?? source.selection_expected_token_indexes ?? source.expectedTokenIndexes ?? source.expected_token_indexes,
          getQuizSelectionWordCount(questionText)
        )
      : [],
    correctionOverrides: {
      ...inferredOverrides,
      ...sourceOverrides,
      text: sourceOverrides.text ?? (sourceOverrides.content !== undefined ? legacyContentOverride : inferredOverrides.text),
      formatting: sourceOverrides.formatting ?? (sourceOverrides.content !== undefined ? legacyContentOverride : inferredOverrides.formatting),
      visibility: sourceOverrides.visibility ?? inferredOverrides.visibility
    }
  };
}

function getWidgetView(widget, mode = "question"){
  const visibilityState = getWidgetVisibilityState(widget, mode);
  if (widget?.type === "numeric-keypad") {
    return {
      html: "",
      text: "",
      formatting: [],
      placeholder: "",
      column: widget.column,
      row: widget.row,
      columnSpan: widget.columnSpan,
      rowSpan: widget.rowSpan,
      textAlign: "center",
      verticalAlign: "middle",
      ...visibilityState
    };
  }

  if (widget?.type === "labels") {
    const overrides = widget.correctionOverrides || {};
    const correctionMode = mode === "correction";
    return {
      html:"",
      text:"",
      formatting:[],
      placeholder:"",
      labelItems:normalizeLabelItems(widget.labelItems),
      column:correctionMode && overrides.position ? widget.correctionColumn : widget.column,
      row:correctionMode && overrides.position ? widget.correctionRow : widget.row,
      columnSpan:correctionMode && overrides.size ? widget.correctionColumnSpan : widget.columnSpan,
      rowSpan:correctionMode && overrides.size ? widget.correctionRowSpan : widget.rowSpan,
      textAlign:"center",
      verticalAlign:"middle",
      ...visibilityState
    };
  }

  if (widget?.type === "categories") {
    const overrides = widget.correctionOverrides || {};
    const correctionMode = mode === "correction";
    return {
      html:"",
      text:"",
      formatting:[],
      placeholder:"",
      labelsSourceWidgetId:String(widget.labelsSourceWidgetId || ""),
      categoryItems:normalizeCategoryItems(widget.categoryItems),
      column:correctionMode && overrides.position ? widget.correctionColumn : widget.column,
      row:correctionMode && overrides.position ? widget.correctionRow : widget.row,
      columnSpan:correctionMode && overrides.size ? widget.correctionColumnSpan : widget.columnSpan,
      rowSpan:correctionMode && overrides.size ? widget.correctionRowSpan : widget.rowSpan,
      textAlign:"center",
      verticalAlign:"middle",
      ...visibilityState
    };
  }

  if (widget?.type === "image") {
    const overrides = widget.correctionOverrides || {};
    const correctionMode = mode === "correction";
    return {
      html: "",
      text: "",
      formatting: [],
      placeholder: "",
      imageSource: correctionMode && overrides.image ? widget.correctionImageSource : widget.questionImageSource,
      column: correctionMode && overrides.position ? widget.correctionColumn : widget.column,
      row: correctionMode && overrides.position ? widget.correctionRow : widget.row,
      columnSpan: correctionMode && overrides.size ? widget.correctionColumnSpan : widget.columnSpan,
      rowSpan: correctionMode && overrides.size ? widget.correctionRowSpan : widget.rowSpan,
      textAlign: "center",
      verticalAlign: "middle",
      ...visibilityState
    };
  }

  if (widget?.type === "audio") {
    const overrides = widget.correctionOverrides || {};
    const correctionMode = mode === "correction";
    return {
      html: "",
      text: "",
      formatting: [],
      placeholder: "",
      audioSource: correctionMode && overrides.audio ? widget.correctionAudioSource : widget.questionAudioSource,
      column: correctionMode && overrides.position ? widget.correctionColumn : widget.column,
      row: correctionMode && overrides.position ? widget.correctionRow : widget.row,
      columnSpan: correctionMode && overrides.size ? widget.correctionColumnSpan : widget.columnSpan,
      rowSpan: correctionMode && overrides.size ? widget.correctionRowSpan : widget.rowSpan,
      textAlign: "center",
      verticalAlign: "middle",
      ...visibilityState
    };
  }

  if (widget?.type === "qcm-text") {
    const overrides = widget.correctionOverrides || {};
    const correctionMode = mode === "correction";
    return {
      html: "",
      text: "",
      formatting: [],
      placeholder: "",
      qcmChoices: normalizeQcmChoices(widget.qcmChoices, { ensureDefaultSlots:true }),
      qcmLayout: normalizeQcmLayout(widget.qcmLayout),
      column: correctionMode && overrides.position ? widget.correctionColumn : widget.column,
      row: correctionMode && overrides.position ? widget.correctionRow : widget.row,
      columnSpan: correctionMode && overrides.size ? widget.correctionColumnSpan : widget.columnSpan,
      rowSpan: correctionMode && overrides.size ? widget.correctionRowSpan : widget.rowSpan,
      textAlign: correctionMode && overrides.textAlign ? widget.correctionTextAlign : widget.textAlign,
      verticalAlign: correctionMode && overrides.verticalAlign ? widget.correctionVerticalAlign : widget.verticalAlign,
      fontSize: correctionMode && overrides.fontSize ? widget.correctionFontSize : widget.fontSize,
      ...visibilityState
    };
  }

  if (widget?.type === "selection-words") {
    const overrides = widget.correctionOverrides || {};
    const correctionMode = mode === "correction";
    return {
      html: richTextModelToHtml(widget.questionText, widget.questionFormatting),
      text: widget.questionText,
      formatting: widget.questionFormatting,
      placeholder: widget.questionPlaceholder,
      selectionExpectedTokenIndexes: normalizeQuizSelectionIndexes(
        widget.selectionExpectedTokenIndexes,
        getQuizSelectionWordCount(widget.questionText)
      ),
      column: correctionMode && overrides.position ? widget.correctionColumn : widget.column,
      row: correctionMode && overrides.position ? widget.correctionRow : widget.row,
      columnSpan: correctionMode && overrides.size ? widget.correctionColumnSpan : widget.columnSpan,
      rowSpan: correctionMode && overrides.size ? widget.correctionRowSpan : widget.rowSpan,
      textAlign: correctionMode && overrides.textAlign ? widget.correctionTextAlign : widget.textAlign,
      verticalAlign: correctionMode && overrides.verticalAlign ? widget.correctionVerticalAlign : widget.verticalAlign,
      fontSize: correctionMode && overrides.fontSize ? widget.correctionFontSize : widget.fontSize,
      ...visibilityState
    };
  }

  if (mode !== "correction") {
    return {
      html: richTextModelToHtml(widget.questionText, widget.questionFormatting),
      text: widget.questionText,
      formatting: widget.questionFormatting,
      placeholder: widget.questionPlaceholder,
      column: widget.column,
      row: widget.row,
      columnSpan: widget.columnSpan,
      rowSpan: widget.rowSpan,
      textAlign: widget.textAlign,
      verticalAlign: widget.verticalAlign,
      fontSize: widget.fontSize,
      ...visibilityState
    };
  }

  const overrides = widget.correctionOverrides || {};
  const text = overrides.text ? widget.correctionText : widget.questionText;
  const formatting = overrides.formatting ? widget.correctionFormatting : widget.questionFormatting;
  return {
    html: richTextModelToHtml(text, formatting),
    text,
    formatting,
    placeholder: widget.correctionPlaceholder,
    column: overrides.position ? widget.correctionColumn : widget.column,
    row: overrides.position ? widget.correctionRow : widget.row,
    columnSpan: overrides.size ? widget.correctionColumnSpan : widget.columnSpan,
    rowSpan: overrides.size ? widget.correctionRowSpan : widget.rowSpan,
    textAlign: overrides.textAlign ? widget.correctionTextAlign : widget.textAlign,
    verticalAlign: overrides.verticalAlign ? widget.correctionVerticalAlign : widget.verticalAlign,
    fontSize: overrides.fontSize ? widget.correctionFontSize : widget.fontSize,
    ...visibilityState
  };
}

function detachCorrectionProperty(widget, property){
  if (!widget?.correctionOverrides || widget.correctionOverrides[property]) return;
  const current = getWidgetView(widget, "correction");
  widget.correctionOverrides[property] = true;
  if (property === "text") {
    widget.correctionText = current.text;
  } else if (property === "formatting") {
    widget.correctionFormatting = cloneValue(current.formatting || []);
  } else if (property === "position") {
    widget.correctionColumn = current.column;
    widget.correctionRow = current.row;
  } else if (property === "size") {
    widget.correctionColumnSpan = current.columnSpan;
    widget.correctionRowSpan = current.rowSpan;
  } else if (property === "textAlign") {
    widget.correctionTextAlign = current.textAlign;
  } else if (property === "verticalAlign") {
    widget.correctionVerticalAlign = current.verticalAlign;
  } else if (property === "fontSize") {
    widget.correctionFontSize = current.fontSize;
  } else if (property === "visibility") {
    widget.correctionVisibility = current.visibilityMode || (current.visible ? "visible" : "hidden");
    widget.correctionVisible = widget.correctionVisibility !== "hidden";
  } else if (property === "image") {
    widget.correctionImageSource = cloneValue(current.imageSource || null);
  } else if (property === "audio") {
    widget.correctionAudioSource = cloneValue(current.audioSource || null);
  }
}

function captureWidgetVariantContent(widget){
  ensureVariantContentShape(widget);
  const content = {
    questionText: String(widget.questionText ?? ""),
    questionFormatting: cloneValue(widget.questionFormatting || []),
    correctionText: String(widget.correctionText ?? widget.questionText ?? ""),
    correctionFormatting: cloneValue(widget.correctionFormatting || widget.questionFormatting || []),
    correctionTextOverridden: Boolean(widget.correctionOverrides?.text),
    correctionFormattingOverridden: Boolean(widget.correctionOverrides?.formatting)
  };
  if (widget.type === "qcm-text") {
    content.qcmChoices = normalizeQcmChoices(widget.qcmChoices, { ensureDefaultSlots:true }).map((choice) => cloneValue(choice));
  }
  if (widget.type === "labels") {
    content.labelItems = normalizeLabelItems(widget.labelItems).map((item) => cloneValue(item));
  }
  if (widget.type === "categories") {
    content.categoryItems = normalizeCategoryItems(widget.categoryItems).map((item) => cloneValue(item));
  }
  if (widget.type === "selection-words") {
    content.selectionExpectedTokenIndexes = normalizeQuizSelectionIndexes(
      widget.selectionExpectedTokenIndexes,
      getQuizSelectionWordCount(widget.questionText)
    );
  }
  if (widget.type === "image") {
    content.questionImageSource = normalizeQuizImageSource(widget.questionImageSource);
    content.correctionImageSource = normalizeQuizImageSource(widget.correctionImageSource ?? widget.questionImageSource);
    content.correctionImageOverridden = Boolean(widget.correctionOverrides?.image);
  }
  if (widget.type === "audio") {
    content.questionAudioSource = normalizeQuizAudioSource(widget.questionAudioSource);
    content.correctionAudioSource = normalizeQuizAudioSource(widget.correctionAudioSource ?? widget.questionAudioSource);
    content.correctionAudioOverridden = Boolean(widget.correctionOverrides?.audio);
  }
  return content;
}

function ensureVariantContentShape(widget){
  if (!widget.correctionOverrides) widget.correctionOverrides = {};
  if (!Array.isArray(widget.questionFormatting)) widget.questionFormatting = [];
  if (!Array.isArray(widget.correctionFormatting)) widget.correctionFormatting = [];
  if (widget.type === "qcm-text") widget.qcmChoices = normalizeQcmChoices(widget.qcmChoices, { ensureDefaultSlots:true });
  if (widget.type === "labels") widget.labelItems = normalizeLabelItems(widget.labelItems, { ensureDefault:true });
  if (widget.type === "categories") widget.categoryItems = normalizeCategoryItems(widget.categoryItems, { ensureDefault:true });
  if (widget.type === "selection-words") {
    widget.selectionExpectedTokenIndexes = normalizeQuizSelectionIndexes(
      widget.selectionExpectedTokenIndexes,
      getQuizSelectionWordCount(widget.questionText)
    );
  }
  if (widget.type === "image") {
    widget.questionImageSource = normalizeQuizImageSource(widget.questionImageSource);
    widget.correctionImageSource = normalizeQuizImageSource(widget.correctionImageSource ?? widget.questionImageSource);
  }
  if (widget.type === "audio") {
    widget.questionAudioSource = normalizeQuizAudioSource(widget.questionAudioSource);
    widget.correctionAudioSource = normalizeQuizAudioSource(widget.correctionAudioSource ?? widget.questionAudioSource);
  }
}

function applyWidgetVariantContent(widget, source = {}){
  ensureVariantContentShape(widget);
  if (widget.type === "qcm-text") {
    widget.qcmChoices = normalizeQcmChoices(source.qcmChoices ?? source.qcm_choices ?? widget.qcmChoices, { ensureDefaultSlots:true });
  }
  if (widget.type === "labels") {
    widget.labelItems = normalizeLabelItems(source.labelItems ?? source.label_items ?? widget.labelItems, { ensureDefault:true });
  }
  if (widget.type === "categories") {
    widget.categoryItems = normalizeCategoryItems(source.categoryItems ?? source.category_items ?? widget.categoryItems, { ensureDefault:true });
  }
  if (widget.type === "selection-words") {
    widget.selectionExpectedTokenIndexes = normalizeQuizSelectionIndexes(
      source.selectionExpectedTokenIndexes ?? source.selection_expected_token_indexes ?? widget.selectionExpectedTokenIndexes,
      getQuizSelectionWordCount(source.questionText ?? widget.questionText)
    );
  }
  if (widget.type === "image") {
    widget.questionImageSource = normalizeQuizImageSource(source.questionImageSource ?? source.question_image_source ?? widget.questionImageSource);
    widget.correctionImageSource = normalizeQuizImageSource(
      source.correctionImageSource ?? source.correction_image_source ?? widget.correctionImageSource ?? widget.questionImageSource
    );
    widget.correctionOverrides.image = Boolean(source.correctionImageOverridden ?? source.correction_image_overridden);
  }
  if (widget.type === "audio") {
    widget.questionAudioSource = normalizeQuizAudioSource(source.questionAudioSource ?? source.question_audio_source ?? widget.questionAudioSource);
    widget.correctionAudioSource = normalizeQuizAudioSource(
      source.correctionAudioSource ?? source.correction_audio_source ?? widget.correctionAudioSource ?? widget.questionAudioSource
    );
    widget.correctionOverrides.audio = Boolean(source.correctionAudioOverridden ?? source.correction_audio_overridden);
  }
  widget.questionText = String(source.questionText ?? "");
  widget.questionFormatting = normalizeTextFormattingRuns(source.questionFormatting, widget.questionText.length);
  widget.correctionText = String(source.correctionText ?? widget.questionText);
  widget.correctionFormatting = normalizeTextFormattingRuns(source.correctionFormatting, widget.correctionText.length);
  widget.correctionOverrides.text = Boolean(source.correctionTextOverridden);
  widget.correctionOverrides.formatting = Boolean(source.correctionFormattingOverridden);
  widget.questionHtml = richTextModelToHtml(widget.questionText, widget.questionFormatting);
  widget.correctionHtml = richTextModelToHtml(widget.correctionText, widget.correctionFormatting);
}

function createVariantFromWidgets(widgets = [], source = {}){
  const sourceContents = source.widgetContents && typeof source.widgetContents === "object"
    ? source.widgetContents
    : source.widget_contents && typeof source.widget_contents === "object"
      ? source.widget_contents
      : {};
  const widgetContents = {};
  widgets.forEach((widget) => {
    const content = sourceContents[widget.id];
    widgetContents[widget.id] = content
      ? {
          questionText: String(content.questionText ?? content.question_text ?? ""),
          questionFormatting: normalizeTextFormattingRuns(content.questionFormatting ?? content.question_formatting, String(content.questionText ?? content.question_text ?? "").length),
          correctionText: String(content.correctionText ?? content.correction_text ?? content.questionText ?? content.question_text ?? ""),
          correctionFormatting: normalizeTextFormattingRuns(
            content.correctionFormatting ?? content.correction_formatting,
            String(content.correctionText ?? content.correction_text ?? content.questionText ?? content.question_text ?? "").length
          ),
          correctionTextOverridden: Boolean(content.correctionTextOverridden ?? content.correction_text_overridden),
          correctionFormattingOverridden: Boolean(content.correctionFormattingOverridden ?? content.correction_formatting_overridden),
          ...(widget.type === "qcm-text" ? {
            qcmChoices: normalizeQcmChoices(content.qcmChoices ?? content.qcm_choices ?? widget.qcmChoices, { ensureDefaultSlots:true })
          } : {}),
          ...(widget.type === "labels" ? {
            labelItems: normalizeLabelItems(content.labelItems ?? content.label_items ?? widget.labelItems, { ensureDefault:true })
          } : {}),
          ...(widget.type === "categories" ? {
            categoryItems: normalizeCategoryItems(content.categoryItems ?? content.category_items ?? widget.categoryItems, { ensureDefault:true })
          } : {}),
          ...(widget.type === "selection-words" ? {
            selectionExpectedTokenIndexes: normalizeQuizSelectionIndexes(
              content.selectionExpectedTokenIndexes ?? content.selection_expected_token_indexes ?? widget.selectionExpectedTokenIndexes,
              getQuizSelectionWordCount(content.questionText ?? content.question_text ?? widget.questionText)
            )
          } : {}),
          ...(widget.type === "image" ? {
            questionImageSource: normalizeQuizImageSource(content.questionImageSource ?? content.question_image_source ?? widget.questionImageSource),
            correctionImageSource: normalizeQuizImageSource(
              content.correctionImageSource ?? content.correction_image_source ?? widget.correctionImageSource ?? widget.questionImageSource
            ),
            correctionImageOverridden: Boolean(content.correctionImageOverridden ?? content.correction_image_overridden)
          } : {}),
          ...(widget.type === "audio" ? {
            questionAudioSource: normalizeQuizAudioSource(content.questionAudioSource ?? content.question_audio_source ?? widget.questionAudioSource),
            correctionAudioSource: normalizeQuizAudioSource(
              content.correctionAudioSource ?? content.correction_audio_source ?? widget.correctionAudioSource ?? widget.questionAudioSource
            ),
            correctionAudioOverridden: Boolean(content.correctionAudioOverridden ?? content.correction_audio_overridden)
          } : {})
        }
      : captureWidgetVariantContent(widget);
  });
  return {
    id: String(source.id || createId("variant")),
    widgetContents
  };
}

function normalizeQuestionVariants(sourceVariants, widgets = []){
  const variants = Array.isArray(sourceVariants) && sourceVariants.length
    ? sourceVariants.map((variant) => createVariantFromWidgets(widgets, variant))
    : [createVariantFromWidgets(widgets)];
  return variants.length ? variants : [createVariantFromWidgets(widgets)];
}

function parseMiniMarkup(value){
  const source = String(value ?? "");
  let text = "";
  const styles = [];
  const baseStyle = { bold:false, italic:false, underline:false, color:"" };

  const append = (chunk, style) => {
    for (const character of String(chunk)) {
      text += character;
      styles.push({ ...style });
    }
  };

  const parseSegment = (startIndex, closingMarker = "", inherited = baseStyle) => {
    let index = startIndex;
    while (index < source.length) {
      if (closingMarker && source.startsWith(closingMarker, index)) {
        return { index:index + closingMarker.length, closed:true };
      }

      const character = source[index];
      if (character === "§") {
        append("\n", inherited);
        index += 1;
        continue;
      }

      const colorMatch = source.slice(index).match(/^\\([rvjb])\[/);
      if (colorMatch) {
        const markerEnd = source.indexOf("]", index + colorMatch[0].length);
        if (markerEnd > index + colorMatch[0].length) {
          const result = parseSegment(index + colorMatch[0].length, "]", {
            ...inherited,
            color:QUIZ_VARIANT_COLORS[colorMatch[1]]
          });
          index = result.index;
          continue;
        }
      }

      if (["*", "_", "°"].includes(character) && source.indexOf(character, index + 1) > index + 1) {
        const styleKey = character === "*" ? "bold" : character === "_" ? "italic" : "underline";
        const result = parseSegment(index + 1, character, { ...inherited, [styleKey]:true });
        index = result.index;
        continue;
      }

      append(character, inherited);
      index += 1;
    }
    return { index, closed:!closingMarker };
  };

  parseSegment(0);
  const formatting = [];
  let runStart = 0;
  for (let index = 1; index <= styles.length; index += 1) {
    const previous = styles[index - 1] || baseStyle;
    const current = styles[index];
    const changed = !current
      || previous.bold !== current.bold
      || previous.italic !== current.italic
      || previous.underline !== current.underline
      || previous.color !== current.color;
    if (!changed) continue;
    if (previous.bold || previous.italic || previous.underline || previous.color) {
      formatting.push({ start:runStart, end:index, ...previous });
    }
    runStart = index;
  }
  return { text, formatting:normalizeTextFormattingRuns(formatting, text.length) };
}

function serializeMiniMarkup(text, formatting = []){
  const rawText = String(text ?? "");
  if (!rawText) return "";
  const styles = Array.from({ length:rawText.length }, () => ({ bold:false, italic:false, underline:false, color:"" }));
  normalizeTextFormattingRuns(formatting, rawText.length).forEach((run) => {
    for (let index = run.start; index < run.end; index += 1) {
      styles[index] = {
        bold:Boolean(run.bold),
        italic:Boolean(run.italic),
        underline:Boolean(run.underline),
        color:String(run.color || "")
      };
    }
  });

  let output = "";
  let start = 0;
  while (start < rawText.length) {
    let end = start + 1;
    const style = styles[start];
    while (end < rawText.length) {
      const candidate = styles[end];
      if (candidate.bold !== style.bold
        || candidate.italic !== style.italic
        || candidate.underline !== style.underline
        || candidate.color !== style.color) break;
      end += 1;
    }
    let chunk = rawText.slice(start, end).replace(/\r?\n/g, "§");
    if (style.underline) chunk = `°${chunk}°`;
    if (style.italic) chunk = `_${chunk}_`;
    if (style.bold) chunk = `*${chunk}*`;
    const colorCode = QUIZ_VARIANT_COLOR_CODES[String(style.color || "").toLowerCase()];
    if (colorCode) chunk = `\\${colorCode}[${chunk}]`;
    output += chunk;
    start = end;
  }
  return output;
}

function serializeQuizSelectionQuickEntry(text, formatting = [], expectedTokenIndexes = []){
  const rawText = String(text ?? "");
  const tokens = tokenizeQuizSelectionText(rawText).filter((token) => token.kind === "word");
  const selected = new Set(normalizeQuizSelectionIndexes(expectedTokenIndexes, tokens.length));
  if (!selected.size) return serializeMiniMarkup(rawText, formatting);

  const groupStarts = new Set();
  const groupEnds = new Set();
  tokens.forEach((token, index) => {
    if (!selected.has(index)) return;
    if (!selected.has(index - 1)) groupStarts.add(token.start);
    if (!selected.has(index + 1)) groupEnds.add(token.end);
  });

  let decorated = "";
  const formattingStarts = [];
  const formattingEnds = [];
  for (let index = 0; index <= rawText.length; index += 1) {
    if (groupStarts.has(index)) decorated += "[";
    formattingStarts[index] = decorated.length;
    if (index < rawText.length) decorated += rawText[index];
    formattingEnds[index + 1] = decorated.length;
    if (groupEnds.has(index + 1)) decorated += "]";
  }

  const decoratedFormatting = normalizeTextFormattingRuns(formatting, rawText.length)
    .map((run) => ({
      ...run,
      start:formattingStarts[run.start],
      end:formattingEnds[run.end]
    }))
    .filter((run) => run.end > run.start);
  return serializeMiniMarkup(decorated, decoratedFormatting);
}

function parseQuizSelectionQuickEntry(value){
  const source = String(value ?? "");
  const openMarker = "\uE000";
  const closeMarker = "\uE001";
  let markedSource = "";
  let isOpen = false;

  for (let index = 0; index < source.length; index += 1) {
    const colorStart = source.slice(index).match(/^\\[rvjb]\[/);
    if (colorStart) {
      const colorEnd = source.indexOf("]", index + colorStart[0].length);
      if (colorEnd !== -1) {
        markedSource += source.slice(index, colorEnd + 1);
        index = colorEnd;
        continue;
      }
    }
    if (source[index] === "[") {
      if (isOpen) return { error:"Les sélections entre crochets ne peuvent pas être imbriquées." };
      markedSource += openMarker;
      isOpen = true;
      continue;
    }
    if (source[index] === "]") {
      if (!isOpen) return { error:"Un crochet fermant « ] » n’a pas de crochet ouvrant." };
      markedSource += closeMarker;
      isOpen = false;
      continue;
    }
    markedSource += source[index];
  }
  if (isOpen) return { error:"Un crochet ouvrant « [ » n’a pas de crochet fermant." };

  const parsed = parseMiniMarkup(markedSource);
  const offsets = [0];
  const ranges = [];
  let rangeStart = null;
  let text = "";
  for (let index = 0; index < parsed.text.length; index += 1) {
    const character = parsed.text[index];
    if (character === openMarker) rangeStart = text.length;
    else if (character === closeMarker) {
      if (rangeStart !== null) ranges.push({ start:rangeStart, end:text.length });
      rangeStart = null;
    } else text += character;
    offsets.push(text.length);
  }

  const formatting = parsed.formatting
    .map((run) => ({ ...run, start:offsets[run.start], end:offsets[run.end] }))
    .filter((run) => run.end > run.start);
  const tokens = tokenizeQuizSelectionText(text).filter((token) => token.kind === "word");
  const expectedTokenIndexes = tokens
    .filter((token) => ranges.some((range) => token.start >= range.start && token.end <= range.end))
    .map((token) => token.wordIndex);

  if (!expectedTokenIndexes.length) {
    return { error:"La sélection doit contenir au moins un mot entre crochets." };
  }
  return {
    text,
    formatting:normalizeTextFormattingRuns(formatting, text.length),
    expectedTokenIndexes:normalizeQuizSelectionIndexes(expectedTokenIndexes, tokens.length)
  };
}

function getTextareaCaretPoint(textarea, position){
  const rect = textarea.getBoundingClientRect();
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  const properties = [
    "boxSizing", "width", "fontFamily", "fontSize", "fontWeight", "fontStyle",
    "letterSpacing", "lineHeight", "textTransform", "textIndent", "textAlign",
    "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth"
  ];
  mirror.style.position = "fixed";
  mirror.style.left = `${rect.left}px`;
  mirror.style.top = `${rect.top}px`;
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.style.wordBreak = "break-word";
  properties.forEach((property) => { mirror.style[property] = style[property]; });
  mirror.textContent = textarea.value.slice(0, position);
  const marker = document.createElement("span");
  marker.textContent = textarea.value.slice(position, position + 1) || "\u200b";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const markerRect = marker.getBoundingClientRect();
  const point = {
    left:markerRect.left - textarea.scrollLeft,
    top:markerRect.top - textarea.scrollTop,
    height:markerRect.height || parseFloat(style.lineHeight) || 18
  };
  mirror.remove();
  return point;
}


function normalizeWidgetPosition(widget){
  widget.columnSpan = clamp(widget.columnSpan, 1, GRID_COLUMNS);
  widget.rowSpan = clamp(widget.rowSpan, 1, GRID_ROWS);
  widget.column = clamp(widget.column, 1, GRID_COLUMNS - widget.columnSpan + 1);
  widget.row = clamp(widget.row, 1, GRID_ROWS - widget.rowSpan + 1);
  widget.correctionColumnSpan = clamp(widget.correctionColumnSpan, 1, GRID_COLUMNS);
  widget.correctionRowSpan = clamp(widget.correctionRowSpan, 1, GRID_ROWS);
  widget.correctionColumn = clamp(widget.correctionColumn, 1, GRID_COLUMNS - widget.correctionColumnSpan + 1);
  widget.correctionRow = clamp(widget.correctionRow, 1, GRID_ROWS - widget.correctionRowSpan + 1);
  return widget;
}

function getPositionStyle(item){
  return [
    `--quiz-column:${Number(item.column) || 1}`,
    `--quiz-row:${Number(item.row) || 1}`,
    `--quiz-column-span:${Number(item.columnSpan) || 1}`,
    `--quiz-row-span:${Number(item.rowSpan) || 1}`
  ].join(";");
}

function getWidgetStyle(widgetView){
  const horizontal = widgetView.textAlign === "left"
    ? "flex-start"
    : widgetView.textAlign === "right"
      ? "flex-end"
      : "center";
  const vertical = widgetView.verticalAlign === "top"
    ? "flex-start"
    : widgetView.verticalAlign === "bottom"
      ? "flex-end"
      : "center";

  return [
    getPositionStyle(widgetView),
    `--quiz-widget-horizontal:${horizontal}`,
    `--quiz-widget-vertical:${vertical}`,
    `--quiz-widget-text-align:${widgetView.textAlign || "center"}`,
    `--quiz-widget-font-size:var(--quiz-editor-font-${normalizeQuizFontSize(widgetView.fontSize)})`
  ].join(";");
}

function getTemplatePreviewMarkup(model){
  const blocks = model.widgets.map((widget) => `
    <span
      class="quiz-workshop-model-preview-block${widget.type === "answer" ? " is-answer" : ""}${widget.type === "image" ? " is-image" : ""}${widget.type === "audio" ? " is-audio" : ""}${widget.type === "numeric-keypad" ? " is-keypad" : ""}${widget.type === "qcm-text" ? " is-qcm" : ""}${widget.type === "selection-words" ? " is-selection" : ""}${widget.visibility === "correction" ? " is-correction" : ""}"
      style="${getPositionStyle(widget)}"
    ></span>
  `).join("");

  const answer = model.answerGuide ? `
    <span class="quiz-workshop-model-preview-answer" style="${getPositionStyle(model.answerGuide)}"></span>
  ` : "";

  return `<span class="quiz-workshop-model-preview" aria-hidden="true">${blocks}${answer}</span>`;
}

function getQuestionPreviewMarkup(question){
  const blocks = getQuestionPreviewWidgets(question).map(({ widget, view }) => {
    return `
      <span
        class="quiz-workshop-card-preview-block${widget.type === "answer" ? " is-answer" : ""}${widget.type === "image" ? " is-image" : ""}${widget.type === "audio" ? " is-audio" : ""}${widget.type === "numeric-keypad" ? " is-keypad" : ""}${widget.type === "qcm-text" ? " is-qcm" : ""}${widget.type === "selection-words" ? " is-selection" : ""}${view.visible ? "" : " is-hidden"}"
        style="${getPositionStyle(view)}"
      ></span>
    `;
  }).join("");

  const answer = question.answerGuide ? `
    <span class="quiz-workshop-card-preview-answer" style="${getPositionStyle(question.answerGuide)}"></span>
  ` : "";

  return `<div class="quiz-workshop-card-preview" aria-hidden="true">${blocks}${answer}</div>`;
}

function getQuestionPreviewWidgets(question = {}){
  const sourceWidgets = Array.isArray(question.widgets) ? question.widgets : [];
  const firstVariant = normalizeQuestionVariants(question.variants, sourceWidgets)[0];

  return sourceWidgets.map((sourceWidget) => {
    const widget = normalizeWidgetPosition(createWidget(sourceWidget));
    applyWidgetVariantContent(widget, firstVariant?.widgetContents?.[widget.id] || captureWidgetVariantContent(widget));
    const view = getWidgetView(widget, "question");
    return { widget, view };
  });
}

function getQuestionWidgetSummaryMarkup(question = {}){
  const items = getQuestionPreviewWidgets(question)
    .filter(({ view }) => view.visible)
    .sort(({ view: first }, { view: second }) => first.row - second.row || first.column - second.column)
    .slice(0, 4)
    .map(({ widget, view }) => {
      const content = String(view.text || "").replace(/\s+/g, " ").trim()
        || String(widget.label || "Élément sans contenu").trim();
      return `<li class="quiz-workshop-question-summary-item">${escapeHtml(content)}</li>`;
    });

  return items.length
    ? `<ul class="quiz-workshop-question-summary" aria-label="Aperçu des éléments">${items.join("")}</ul>`
    : "";
}

export function createQuizWorkshopViewController({
  view,
  addButton,
  drawer,
  quickEntryDrawer,
  drawerScrim,
  drawerCloseButton,
  templateGrid,
  confirmButton,
  saveButton,
  testButton,
  titleInput,
  onSaveQuiz = null,
  onTestQuiz = null,
  questionsHost,
  emptyState,
  questionCount,
  getCurrentTeacherSpace = null,
  listResourceFoldersForSpace = null,
  createResourceFolderForSpace = null,
  ensureRecordingsResourceFolderForSpace = null,
  listResourcesForSpace = null,
  uploadResourceForSpace = null,
  createResourceSignedUrl = null,
  showToast = null
} = {}){
  const elementGrid = drawer?.querySelector("[data-quiz-element-grid]") || null;
  const canvas = drawer?.querySelector("[data-quiz-canvas]") || null;
  const canvasFrame = drawer?.querySelector("[data-quiz-canvas-frame]") || null;
  const canvasTopbar = drawer?.querySelector("[data-quiz-canvas-topbar]") || null;
  const drawerTitle = drawer?.querySelector("[data-quiz-editor-title]") || null;
  const drawerText = drawer?.querySelector("[data-quiz-editor-text]") || null;
  const confirmLabel = confirmButton?.querySelector("[data-quiz-confirm-label]") || null;
  const questionWarnings = drawer?.querySelector("[data-quiz-question-warnings]") || null;
  const textToolbar = drawer?.querySelector("[data-quiz-text-toolbar]") || null;
  const addQuestionAfterListButton = view?.querySelector("#btnQuizAddQuestionAfterList") || null;
  const fontSizeMenu = textToolbar?.querySelector("[data-quiz-font-size-menu]") || null;
  const fontSizeToggle = textToolbar?.querySelector("[data-quiz-font-size-toggle]") || null;
  const colorMenu = textToolbar?.querySelector("[data-quiz-color-menu]") || null;
  const colorToggle = textToolbar?.querySelector("[data-quiz-color-toggle]") || null;
  const quickEntryButton = drawer?.querySelector("[data-quiz-quick-entry]") || null;
  const variantNavigation = drawer?.querySelector("[data-quiz-variant-navigation]") || null;

  let isMounted = false;
  let activeLibraryTab = "models";
  let previewMode = "question";
  let selectedModelId = "free-layout";
  let selectedWidgetId = "";
  let editingWidgetId = "";
  let editingChoiceId = "";
  let editingQuestionId = "";
  let draftTitle = "Disposition libre";
  let draftWidgets = [];
  let draftVariants = [];
  let activeVariantIndex = 0;
  let draftAnswerGuide = null;
  let questions = [];
  let currentQuizId = "";
  let currentQuizFolderId = null;
  let currentQuizCreatedAt = "";
  let currentQuizUpdatedAt = "";
  let currentQuizDisplayOrder = null;
  let currentQuizIsSystem = false;
  let isQuizDirty = false;
  let lastDrawerTrigger = addButton || null;
  let canvasResizeObserver = null;
  let interactionState = null;
  let savedTextSelection = null;
  let drawerCloseTimer = null;
  let drawerMotion = null;

  function getSelectedModel(){
    return QUESTION_MODELS.find((model) => model.id === selectedModelId) || null;
  }

  function getQuizTitle(){
    return String(titleInput?.value || "").trim();
  }

  function updateSaveButton(){
    if (!saveButton) return;
    saveButton.disabled = !isQuizDirty;
    saveButton.classList.toggle("is-dirty", isQuizDirty);
    saveButton.title = isQuizDirty ? "Enregistrer les modifications" : "Le quiz est enregistré";
  }

  function markQuizDirty(){
    isQuizDirty = true;
    updateSaveButton();
  }

  function markQuizSaved(){
    isQuizDirty = false;
    updateSaveButton();
  }

  function normalizeQuestion(source = {}){
    const widgets = Array.isArray(source.widgets)
      ? source.widgets.map((widget) => ensureWidgetContent(normalizeWidgetPosition(createWidget(widget))))
      : [];
    return {
      ...cloneValue(source),
      id: String(source.id || createId("question")),
      modelId: String(source.modelId || "free-layout"),
      title: String(source.title || "Disposition personnalisée"),
      widgets,
      variants:normalizeQuestionVariants(source.variants, widgets),
      answerGuide: source.answerGuide ? cloneValue(source.answerGuide) : null
    };
  }

  function cancelDrawerMotion(){
    if (!drawerMotion) return;
    const motion = drawerMotion;
    drawerMotion = null;
    try { motion.cancel(); } catch {}
    drawer?.classList.remove("is-animating", "is-opening");
  }

  function runDrawerMotion(open){
    if (!drawer?.animate) return null;

    cancelDrawerMotion();
    drawer.classList.add("is-animating");
    if (open) drawer.classList.add("is-opening");

    // Une seule propriété animée : la translation verticale. Le retrait du
    // scale et de l'opacité évite les doubles recalculs visuels à l'ouverture.
    const keyframes = open
      ? [
          { transform:"translate3d(0,112%,0)" },
          { transform:"translate3d(0,0,0)" }
        ]
      : [
          { transform:"translate3d(0,0,0)" },
          { transform:"translate3d(0,100%,0)" }
        ];

    const motion = drawer.animate(keyframes, {
      duration:open ? 450 : 400,
      easing:open ? "cubic-bezier(.22,1,.36,1)" : "cubic-bezier(.55,0,1,.45)",
      fill:"both"
    });

    drawerMotion = motion;
    motion.finished.then(() => {
      if (drawerMotion !== motion) return;

      // On pose d'abord l'état CSS final, puis on retire l'animation. Ainsi,
      // aucune image ne repasse brièvement par la position de départ.
      if (open) drawer.classList.add("is-open");
      else drawer.classList.remove("is-open");

      drawerMotion = null;
      drawer.classList.remove("is-animating", "is-opening");
      try { motion.cancel(); } catch {}
    }).catch(() => {});
    return motion;
  }

  function getSelectedWidget(){
    return draftWidgets.find((widget) => widget.id === selectedWidgetId) || null;
  }

  function getEditingWidget(){
    return draftWidgets.find((widget) => widget.id === editingWidgetId) || null;
  }

  function getActiveEditor(){
    if (!editingWidgetId || !canvas) return null;
    const choiceSelector = editingChoiceId
      ? `[data-quiz-qcm-choice-id="${CSS.escape(editingChoiceId)}"]`
      : "";
    return canvas.querySelector(`[data-quiz-widget-editor-id="${CSS.escape(editingWidgetId)}"]${choiceSelector}`);
  }

  function getActiveContentProperty(){
    return previewMode === "correction" ? "correctionHtml" : "questionHtml";
  }

  function getActiveTextProperty(){
    return previewMode === "correction" ? "correctionText" : "questionText";
  }

  function ensureWidgetContent(widget){
    const normalized = normalizeWidgetPosition(createWidget(widget));
    Object.assign(widget, normalized);
    return widget;
  }

  function ensureDraftVariants(){
    if (!draftVariants.length) draftVariants = [createVariantFromWidgets(draftWidgets)];
    activeVariantIndex = clamp(activeVariantIndex, 0, Math.max(0, draftVariants.length - 1));
    return draftVariants;
  }

  function persistActiveVariantContent(){
    ensureDraftVariants();
    const variant = draftVariants[activeVariantIndex];
    if (!variant) return;
    if (!variant.widgetContents || typeof variant.widgetContents !== "object") variant.widgetContents = {};
    draftWidgets.forEach((widget) => {
      variant.widgetContents[widget.id] = captureWidgetVariantContent(widget);
    });
  }

  function loadVariantContent(index){
    ensureDraftVariants();
    activeVariantIndex = clamp(index, 0, draftVariants.length - 1);
    const variant = draftVariants[activeVariantIndex];
    draftWidgets.forEach((widget) => {
      const content = variant.widgetContents?.[widget.id] || captureWidgetVariantContent(widget);
      applyWidgetVariantContent(widget, content);
    });
  }

  function syncActiveVariantWidget(widget){
    if (!widget) return;
    ensureDraftVariants();
    const variant = draftVariants[activeVariantIndex];
    if (!variant.widgetContents || typeof variant.widgetContents !== "object") variant.widgetContents = {};
    variant.widgetContents[widget.id] = captureWidgetVariantContent(widget);
    renderQuestionWarnings();
  }

  function renderVariantNavigation(){
    if (!variantNavigation) return;
    const count = Math.max(1, draftVariants.length);
    variantNavigation.hidden = count < 2;
    variantNavigation.dataset.quizVariantCurrent = String(activeVariantIndex + 1);
    variantNavigation.dataset.quizVariantCount = String(count);
    variantNavigation.querySelectorAll("[data-quiz-variant-step]").forEach((button) => {
      const direction = Number(button.dataset.quizVariantStep || 0);
      const label = direction < 0 ? "Variante précédente" : "Variante suivante";
      button.setAttribute("aria-label", `${label} (${activeVariantIndex + 1} sur ${count})`);
      button.title = `${label} — ${activeVariantIndex + 1} sur ${count}`;
    });
  }

  function changeVariant(step){
    if (draftVariants.length < 2) return;
    const editor = getActiveEditor();
    if (editor) finalizeEditorContent(editor);
    persistActiveVariantContent();
    const count = draftVariants.length;
    activeVariantIndex = (activeVariantIndex + step + count) % count;
    loadVariantContent(activeVariantIndex);
    editingWidgetId = "";
    editingChoiceId = "";
    savedTextSelection = null;
    hideTextToolbar();
    renderEditor();
  }

  function markLayoutAsCustom(){
    selectedModelId = "";
    draftTitle = "Disposition personnalisée";
    templateGrid?.querySelectorAll("[data-quiz-model-id]").forEach((tile) => {
      tile.classList.remove("is-selected");
      tile.setAttribute("aria-pressed", "false");
    });
  }

  function areasOverlap(first, second){
    return !(
      first.column + first.columnSpan <= second.column ||
      second.column + second.columnSpan <= first.column ||
      first.row + first.rowSpan <= second.row ||
      second.row + second.rowSpan <= first.row
    );
  }

  function canPlaceWidget(widgetId, candidate){
    const collidesWithWidget = draftWidgets.some((widget) => (
      widget.id !== widgetId && areasOverlap(candidate, getWidgetView(widget, previewMode))
    ));
    if (collidesWithWidget) return false;
    return !draftAnswerGuide || !areasOverlap(candidate, draftAnswerGuide);
  }

  function findAvailablePosition(columnSpan = 5, rowSpan = 1){
    for (let row = 1; row <= GRID_ROWS - rowSpan + 1; row += 1) {
      for (let column = 1; column <= GRID_COLUMNS - columnSpan + 1; column += 1) {
        const candidate = { column, row, columnSpan, rowSpan };
        if (canPlaceWidget("", candidate)) return candidate;
      }
    }
    return null;
  }

  function setDraftFromModel(modelId){
    const model = QUESTION_MODELS.find((entry) => entry.id === modelId) || QUESTION_MODELS[0];
    selectedModelId = model.id;
    draftTitle = model.title;
    draftWidgets = model.widgets.map((widget) => ensureWidgetContent(normalizeWidgetPosition(createWidget(widget))));
    draftVariants = [createVariantFromWidgets(draftWidgets)];
    activeVariantIndex = 0;
    draftAnswerGuide = model.answerGuide ? cloneValue(model.answerGuide) : null;
    selectedWidgetId = draftWidgets[0]?.id || "";
    editingWidgetId = "";
    editingChoiceId = "";
    savedTextSelection = null;
    hideTextToolbar();
    renderEditor();
  }

  function resetDraft(){
    editingQuestionId = "";
    previewMode = "question";
    activeLibraryTab = "models";
    setDraftFromModel("free-layout");
  }

  function renderTemplates(){
    if (!templateGrid) return;

    templateGrid.innerHTML = QUESTION_MODELS.map((model) => `
      <button
        class="quiz-workshop-model-tile${model.id === selectedModelId ? " is-selected" : ""}"
        type="button"
        data-quiz-model-id="${escapeHtml(model.id)}"
        aria-pressed="${model.id === selectedModelId ? "true" : "false"}"
      >
        ${getTemplatePreviewMarkup(model)}
        <span class="quiz-workshop-model-copy">
          <strong>${escapeHtml(model.title)}</strong>
          <span>${escapeHtml(model.description)}</span>
        </span>
        <span class="quiz-workshop-model-check dashboard-material-icon" aria-hidden="true">check_circle</span>
      </button>
    `).join("");
  }

  function renderElements(){
    if (!elementGrid) return;

    const hasNumericKeypad = draftWidgets.some((widget) => widget.type === "numeric-keypad");
    const hasResponseWidget = draftWidgets.some(isResponseWidget);

    elementGrid.innerHTML = QUESTION_ELEMENT_GROUPS.map((group, groupIndex) => {
      const groupElements = QUESTION_ELEMENTS.filter((element) => element.group === group.id);
      const responseMessage = group.id === "response" && hasResponseWidget
        ? `<span class="quiz-workshop-element-group-note">Un élément de réponse est déjà présent.</span>`
        : "";

      const tiles = groupElements.map((element) => {
        const isResponseElement = RESPONSE_WIDGET_TYPES.has(element.id);
        const isDuplicateKeypad = element.id === "numeric-keypad" && hasNumericKeypad;
        const isDisabled = isDuplicateKeypad || (isResponseElement && hasResponseWidget);
        const disabledTitle = isDuplicateKeypad
          ? "Un clavier numérique est déjà présent dans cette question"
          : isResponseElement && hasResponseWidget
            ? "Un élément de réponse est déjà présent dans cette question"
            : "";

        return `
          <button
            class="quiz-workshop-element-tile${isDisabled ? " is-disabled" : ""}"
            type="button"
            draggable="${isDisabled ? "false" : "true"}"
            data-quiz-element-id="${escapeHtml(element.id)}"
            ${isDisabled ? `disabled aria-disabled="true" title="${escapeHtml(disabledTitle)}"` : ""}
          >
            <span class="quiz-workshop-element-icon dashboard-material-icon" aria-hidden="true">${escapeHtml(element.icon)}</span>
            <span class="quiz-workshop-element-copy">
              <strong>${escapeHtml(element.title)}</strong>
              <span>
                ${escapeHtml(element.description)}
                ${element.detail ? `<span class="quiz-workshop-element-detail">${escapeHtml(element.detail)}</span>` : ""}
              </span>
            </span>
          </button>
        `;
      }).join("");

      return `
        <section class="quiz-workshop-element-group${groupIndex > 0 ? " has-separator" : ""}" data-quiz-element-group="${escapeHtml(group.id)}">
          <div class="quiz-workshop-element-group-heading">
            <strong>${escapeHtml(group.title)}</strong>
            ${responseMessage}
          </div>
          <div class="quiz-workshop-element-group-grid">
            ${tiles}
          </div>
        </section>
      `;
    }).join("");
  }

  function renderLibrary(){
    drawer?.querySelectorAll("[data-quiz-library-tab]").forEach((tab) => {
      const isActive = tab.dataset.quizLibraryTab === activeLibraryTab;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
      tab.tabIndex = isActive ? 0 : -1;
    });

    drawer?.querySelectorAll("[data-quiz-library-panel]").forEach((panel) => {
      panel.classList.toggle("hidden", panel.dataset.quizLibraryPanel !== activeLibraryTab);
    });
  }

  function getGridCellsMarkup(){
    return Array.from({ length: GRID_COLUMNS * GRID_ROWS }, (_, index) => {
      const column = (index % GRID_COLUMNS) + 1;
      const row = Math.floor(index / GRID_COLUMNS) + 1;
      return `<span class="quiz-workshop-grid-cell" style="grid-column:${column};grid-row:${row}" aria-hidden="true"></span>`;
    }).join("");
  }

  function fitCanvas(){
    if (!canvas || !canvasFrame) return;

    const availableWidth = Math.max(0, canvasFrame.clientWidth - 16);
    const availableHeight = Math.max(0, canvasFrame.clientHeight - 16);
    if (!availableWidth || !availableHeight) return;

    const aspectRatio = GRID_COLUMNS / GRID_ROWS;
    const width = Math.floor(Math.min(availableWidth, availableHeight * aspectRatio));
    const height = Math.floor(width / aspectRatio);

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    window.requestAnimationFrame(positionTextToolbar);
  }

  function getVisibleWidgetHtml(widget){
    ensureWidgetContent(widget);
    return getWidgetView(widget, previewMode).html;
  }

  function isWidgetVisible(widget){
    return getWidgetView(widget, previewMode).visible;
  }

  function renderInspector(){
    // Toute l’édition du widget Texte se fait directement sur le canevas.
  }

  function getNumericKeypadPreviewMarkup(){
    const keys = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
      .map((digit) => `<span class="quiz-workshop-keypad-preview-key">${digit}</span>`)
      .join("");
    return `
      <div class="quiz-workshop-keypad-preview" aria-hidden="true">
        ${keys}
        <span class="quiz-workshop-keypad-preview-key is-clear">
          <svg viewBox="0 -960 960 960" aria-hidden="true" focusable="false">
            <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z" fill="currentColor"/>
          </svg>
        </span>
      </div>
    `;
  }

  function getQcmEditorMarkup(widget, widgetView, isSelected){
    const choices = normalizeQcmChoices(widgetView.qcmChoices, { ensureDefaultSlots:true });
    const resolvedLayout = resolveQcmLayout(widgetView, choices, widgetView.qcmLayout);
    const gridColumns = resolvedLayout === "row" ? choices.length : getQcmGridColumnCount(widgetView, choices);
    const choiceMarkup = choices.map((choice, index) => {
      const isEditingChoice = widget.id === editingWidgetId && choice.id === editingChoiceId;
      const isEmpty = !String(choice.text || "");
      const placeholder = getQcmChoicePlaceholder(choice, index);
      return `
        <div class="quiz-workshop-qcm-choice${choice.isCorrect ? " is-correct" : ""}${isEditingChoice ? " is-editing" : ""}" data-qcm-choice-shell="${escapeHtml(choice.id)}">
          <button
            class="quiz-workshop-qcm-correct-toggle"
            type="button"
            data-set-qcm-correct="${escapeHtml(widget.id)}"
            data-qcm-choice-id="${escapeHtml(choice.id)}"
            aria-label="Définir comme bonne réponse"
            title="Bonne réponse"
          ><span class="dashboard-material-icon" aria-hidden="true">${choice.isCorrect ? "check_circle" : "radio_button_unchecked"}</span></button>
          <div
            class="quiz-workshop-qcm-choice-text${isEmpty ? " is-empty" : ""}"
            contenteditable="true"
            role="textbox"
            aria-multiline="true"
            spellcheck="true"
            data-quiz-widget-editor-id="${escapeHtml(widget.id)}"
            data-quiz-qcm-choice-id="${escapeHtml(choice.id)}"
            data-placeholder="${escapeHtml(placeholder)}"
          >${richTextModelToHtml(choice.text, choice.formatting) || "<br>"}</div>
          <button
            class="quiz-workshop-qcm-choice-remove dashboard-material-icon-btn"
            type="button"
            data-remove-qcm-choice="${escapeHtml(widget.id)}"
            data-qcm-choice-id="${escapeHtml(choice.id)}"
            aria-label="Supprimer cette proposition"
            title="Supprimer la proposition"
            ${choices.length <= QCM_MIN_CHOICES ? "disabled" : ""}
          ><span class="dashboard-material-icon" aria-hidden="true">close</span></button>
        </div>
      `;
    }).join("");

    const addChoiceMarkup = choices.length < QCM_MAX_CHOICES ? `
      <button
        class="quiz-workshop-qcm-add-choice dashboard-material-icon-btn"
        type="button"
        data-add-qcm-choice="${escapeHtml(widget.id)}"
        aria-label="Ajouter une proposition"
        title="Ajouter une proposition"
      ><span class="dashboard-material-icon" aria-hidden="true">add</span></button>
    ` : "";

    const rightFreeColumns = GRID_COLUMNS - (widgetView.column + widgetView.columnSpan - 1);
    const leftFreeColumns = widgetView.column - 1;
    const bottomFreeRows = GRID_ROWS - (widgetView.row + widgetView.rowSpan - 1);
    const topFreeRows = widgetView.row - 1;
    const toolbarPlacementClass = leftFreeColumns >= 1
      ? " is-left"
      : rightFreeColumns >= 1
        ? ""
        : bottomFreeRows >= 1
          ? " is-below"
          : topFreeRows >= 1
            ? " is-above"
            : " is-left";
    const layoutToolbarMarkup = isSelected ? `
      <div class="quiz-workshop-qcm-layout-toolbar${toolbarPlacementClass}" role="toolbar" aria-label="Disposition du QCM">
        ${[
          ["auto", "Auto"],
          ["row", "Ligne"],
          ["column", "Colonne"],
          ["grid", "Grille"]
        ].map(([value, label]) => `
          <button
            type="button"
            data-qcm-layout="${value}"
            data-qcm-widget-id="${escapeHtml(widget.id)}"
            class="${widget.qcmLayout === value ? "is-active" : ""}"
            aria-pressed="${widget.qcmLayout === value ? "true" : "false"}"
          >${label}</button>
        `).join("")}
      </div>
    ` : "";

    return `
      <div
        class="quiz-workshop-qcm-options is-${resolvedLayout}"
        style="--quiz-qcm-columns:${gridColumns}"
        data-qcm-resolved-layout="${resolvedLayout}"
      >${choiceMarkup}</div>
      ${addChoiceMarkup}
      ${layoutToolbarMarkup}
    `;
  }

  function getSelectionWordsEditorMarkup(widget, widgetView){
    const text = String(widgetView.text || "");
    const expectedIndexes = normalizeQuizSelectionIndexes(
      widgetView.selectionExpectedTokenIndexes ?? widget.selectionExpectedTokenIndexes,
      getQuizSelectionWordCount(text)
    );
    if (!text) {
      return `
        <div class="quiz-workshop-selection-words-empty">
          <span class="dashboard-material-icon" aria-hidden="true">touch_app</span>
          <strong>Écrivez d’abord la phrase dans la vue Question.</strong>
        </div>
      `;
    }
    return `
      <div class="quiz-workshop-selection-words-correction" data-quiz-selection-words-correction>
        <div class="quiz-workshop-selection-words-text">
          ${renderQuizSelectionTextToHtml(text, widgetView.formatting, {
            activeIndexes:expectedIndexes,
            activeKind:"correct",
            interactive:true,
            ariaPrefix:"Mot attendu"
          })}
        </div>
        <div class="quiz-workshop-selection-words-hint">
          ${expectedIndexes.length
            ? `Sélection attendue : ${escapeHtml(formatQuizSelectionIndexes(text, expectedIndexes))}`
            : "Cliquez sur les mots attendus."}
        </div>
      </div>
    `;
  }

  function getLabelsEditorMarkup(widget, widgetView, isSelected){
    const items = normalizeLabelItems(widgetView.labelItems ?? widget.labelItems, { ensureDefault:true });
    const labels = items.map((item, index) => `
      <span class="quiz-workshop-label-chip" data-quiz-label-chip="${escapeHtml(item.id)}">
        <span
          class="quiz-workshop-label-chip-text${item.text ? "" : " is-empty"}"
          ${isSelected ? `contenteditable="true" role="textbox" spellcheck="true" data-quiz-label-editor="${escapeHtml(widget.id)}" data-quiz-label-id="${escapeHtml(item.id)}"` : ""}
          data-placeholder="Étiquette ${index + 1}"
        >${escapeHtml(item.text)}</span>
        <button type="button" class="quiz-workshop-label-chip-remove" data-remove-quiz-label="${escapeHtml(widget.id)}" data-quiz-label-id="${escapeHtml(item.id)}" aria-label="Supprimer cette étiquette" title="Supprimer"${isSelected ? "" : ' tabindex="-1" aria-hidden="true"'}>×</button>
      </span>
    `).join("");
    return `
      <div class="quiz-workshop-labels-editor" data-quiz-labels-editor="${escapeHtml(widget.id)}">
        <button type="button" class="quiz-workshop-labels-add${isSelected ? "" : " is-hidden"}" data-add-quiz-label="${escapeHtml(widget.id)}"${isSelected ? "" : ' tabindex="-1" aria-hidden="true"'}>
          <span class="dashboard-material-icon" aria-hidden="true">add</span>
          <span>Ajouter une étiquette</span>
        </button>
        <div class="quiz-workshop-labels-editor-zone">${labels}</div>
      </div>
    `;
  }

  function getCategoriesEditorMarkup(widget, widgetView, isSelected){
    if (previewMode === "question") {
      return `
        <div class="quiz-workshop-categories-question-message">
          <span class="dashboard-material-icon" aria-hidden="true">category</span>
          <strong>Le classement se configure dans la correction.</strong>
          <span>Passez en vue « Correction » pour répartir les étiquettes dans les catégories.</span>
        </div>
      `;
    }

    const labelWidgets = draftWidgets.filter((entry) => entry.type === "labels");
    const sourceWidgetId = String(widget.labelsSourceWidgetId || "");
    const sourceWidget = labelWidgets.find((entry) => entry.id === sourceWidgetId) || null;
    const sourceLabels = normalizeLabelItems(sourceWidget?.labelItems || []);
    const labelById = new Map(sourceLabels.map((item) => [item.id, item]));
    const categories = normalizeCategoryItems(widgetView.categoryItems ?? widget.categoryItems, { ensureDefault:true });
    const assigned = new Set(categories.flatMap((category) => category.labelIds));
    const unassigned = sourceLabels.filter((item) => !assigned.has(item.id));

    const sourceControl = labelWidgets.length === 0
      ? `<div class="quiz-workshop-categories-source-empty"><span class="dashboard-material-icon" aria-hidden="true">label_off</span><span>Ajoutez d’abord un widget Étiquettes.</span></div>`
      : labelWidgets.length === 1
        ? `<div class="quiz-workshop-categories-source-static"><span>Source</span><strong>${escapeHtml(labelWidgets[0].label || "Étiquettes")}</strong></div>`
        : `
          <label class="quiz-workshop-categories-source-select-wrap">
            <span>Source</span>
            <select data-quiz-categories-source="${escapeHtml(widget.id)}">
              ${labelWidgets.map((entry, index) => {
                const preview = normalizeLabelItems(entry.labelItems).map((item) => item.text.trim()).filter(Boolean).slice(0, 3).join(", ");
                return `<option value="${escapeHtml(entry.id)}"${entry.id === sourceWidgetId ? " selected" : ""}>${escapeHtml(entry.label || `Étiquettes ${index + 1}`)}${preview ? ` — ${escapeHtml(preview)}${normalizeLabelItems(entry.labelItems).length > 3 ? "…" : ""}` : ""}</option>`;
              }).join("")}
            </select>
          </label>
        `;

    const renderDraggableLabel = (item, originCategoryId = "") => `
      <span
        class="quiz-workshop-category-label-chip"
        draggable="true"
        data-quiz-category-label-chip="${escapeHtml(item.id)}"
        data-quiz-category-label-source="${escapeHtml(sourceWidgetId)}"
        data-quiz-category-label-origin="${escapeHtml(originCategoryId)}"
        title="Glisser vers une catégorie"
      >${escapeHtml(item.text || "(vide)")}</span>
    `;

    const unassignedMarkup = `
      <div class="quiz-workshop-categories-unassigned" data-quiz-category-drop-widget="${escapeHtml(widget.id)}" data-quiz-category-drop-id="">
        <div class="quiz-workshop-category-pool-labels">
          ${unassigned.map((item) => renderDraggableLabel(item)).join("")}
        </div>
      </div>
    `;

    const categoriesMarkup = categories.map((category, index) => {
      const categoryLabels = category.labelIds.map((labelId) => labelById.get(labelId)).filter(Boolean);
      return `
        <div class="quiz-workshop-category-pool" data-quiz-category-drop-widget="${escapeHtml(widget.id)}" data-quiz-category-drop-id="${escapeHtml(category.id)}">
          <div class="quiz-workshop-category-pool-heading">
            <span
              class="quiz-workshop-category-title${category.title ? "" : " is-empty"}"
              ${isSelected ? `contenteditable="true" role="textbox" spellcheck="true" data-quiz-category-title-editor="${escapeHtml(widget.id)}" data-quiz-category-id="${escapeHtml(category.id)}"` : ""}
              data-placeholder="Catégorie ${index + 1}"
            >${escapeHtml(category.title)}</span>
            ${categories.length > 2 ? `
              <button type="button" class="quiz-workshop-category-remove" data-remove-quiz-category="${escapeHtml(widget.id)}" data-quiz-category-id="${escapeHtml(category.id)}" aria-label="Supprimer cette catégorie" title="Supprimer"${isSelected ? "" : ' tabindex="-1" aria-hidden="true"'}>×</button>
            ` : ""}
          </div>
          <div class="quiz-workshop-category-pool-labels">
            ${categoryLabels.length ? categoryLabels.map((item) => renderDraggableLabel(item, category.id)).join("") : `<span class="quiz-workshop-category-pool-empty">Déposez des étiquettes ici.</span>`}
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="quiz-workshop-categories-editor" data-quiz-categories-editor="${escapeHtml(widget.id)}">
        <div class="quiz-workshop-categories-toolbar">
          ${sourceWidget ? unassignedMarkup : '<div class="quiz-workshop-categories-toolbar-spacer"></div>'}
          ${sourceControl}
        </div>
        <div class="quiz-workshop-categories-table">
          <div class="quiz-workshop-categories-grid" style="--quiz-category-count:${categories.length}">${categoriesMarkup}</div>
          <button type="button" class="quiz-workshop-categories-add" data-add-quiz-category="${escapeHtml(widget.id)}" aria-label="Ajouter une catégorie" title="Ajouter une catégorie">
            <span class="dashboard-material-icon" aria-hidden="true">add</span>
          </button>
        </div>
      </div>
    `;
  }

  function getImageEditorMarkup(widget, widgetView, isSelected){
    const source = normalizeQuizImageSource(widgetView.imageSource);
    const sourcePayload = source ? escapeHtml(JSON.stringify(source)) : "";
    const label = source?.label || source?.name || source?.alt || "Image";
    const imageMarkup = source
      ? `<img class="quiz-workshop-image-preview" data-quiz-image-source="${sourcePayload}" alt="${escapeHtml(source.alt || label)}">`
      : `<div class="quiz-workshop-image-placeholder">
          <span class="dashboard-material-icon" aria-hidden="true">image</span>
          <strong>Choisir une image</strong>
        </div>`;
    return `
      <div class="quiz-workshop-image-content${source ? " has-image" : " is-empty"}">
        ${imageMarkup}
        ${source ? `<div class="quiz-workshop-image-unavailable">Image indisponible</div>` : ""}
        ${source ? `
          <div class="quiz-workshop-image-actions is-remove${isSelected ? " is-visible" : ""}">
            <button class="btn quiz-workshop-image-action" type="button" data-remove-quiz-image="${escapeHtml(widget.id)}">
              <span class="dashboard-material-icon" aria-hidden="true">delete</span>
              <span>Supprimer</span>
            </button>
          </div>
        ` : `
          <div class="quiz-workshop-image-actions is-visible">
            <button class="btn quiz-workshop-image-action" type="button" data-choose-quiz-image-resource="${escapeHtml(widget.id)}">
              <span class="dashboard-material-icon" aria-hidden="true">collections</span>
              <span>Ressources</span>
            </button>
            ${currentQuizIsSystem ? "" : `
              <button class="btn quiz-workshop-image-action" type="button" data-upload-quiz-image="${escapeHtml(widget.id)}">
                <span class="dashboard-material-icon" aria-hidden="true">upload_file</span>
                <span>Importer</span>
              </button>
            `}
          </div>
        `}
      </div>
    `;
  }

  async function hydrateImagePreviews(root = canvas){
    const nodes = Array.from(root?.querySelectorAll?.("[data-quiz-image-source]") || []);
    await Promise.all(nodes.map(async (node) => {
      const payload = String(node.dataset.quizImageSource || "");
      if (!payload) return;
      let source = null;
      try { source = normalizeQuizImageSource(JSON.parse(payload)); } catch { return; }
      if (!source) return;
      const expectedPayload = payload;
      try {
        const url = await resolveQuizImageSourceUrl(source);
        if (!node.isConnected || node.dataset.quizImageSource !== expectedPayload) return;
        const host = node.closest(".quiz-workshop-image-content");
        if (!url) {
          node.classList.add("is-unavailable");
          host?.classList.add("is-unavailable");
          return;
        }
        node.src = url;
        node.classList.remove("is-unavailable");
        host?.classList.remove("is-unavailable");
      } catch (error) {
        console.warn("Impossible de charger l’image du widget Quiz.", error);
        if (node.isConnected) {
          node.classList.add("is-unavailable");
          node.closest(".quiz-workshop-image-content")?.classList.add("is-unavailable");
        }
      }
    }));
  }

  function setWidgetImageSource(widget, source){
    if (!widget || widget.type !== "image") return;
    const normalized = normalizeQuizImageSource(source);
    if (previewMode === "correction") {
      detachCorrectionProperty(widget, "image");
      widget.correctionImageSource = normalized;
    } else {
      widget.questionImageSource = normalized;
    }
    syncActiveVariantWidget(widget);
    markLayoutAsCustom();
    selectedWidgetId = widget.id;
    renderCanvas();
  }

  function removeWidgetImageSource(widgetId){
    const widget = draftWidgets.find((entry) => entry.id === widgetId);
    if (!widget || widget.type !== "image") return;
    if (previewMode === "correction") {
      detachCorrectionProperty(widget, "image");
      widget.correctionImageSource = null;
    } else {
      widget.questionImageSource = null;
      if (!widget.correctionOverrides?.image) widget.correctionImageSource = null;
    }
    syncActiveVariantWidget(widget);
    markLayoutAsCustom();
    selectedWidgetId = widget.id;
    renderCanvas();
  }

  function getActiveTeacherSpaceId(){
    const id = Number(getCurrentTeacherSpace?.()?.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Aucun espace enseignant actif.");
    return id;
  }

  function normalizeResourceName(value){
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  function getResourceFolderPath(folderId, foldersById){
    const parts = [];
    const visited = new Set();
    let currentId = String(folderId || "").trim();
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const folder = foldersById.get(currentId);
      if (!folder) break;
      parts.unshift(String(folder.name || "Dossier").trim() || "Dossier");
      currentId = String(folder.parent_id || "").trim();
    }
    return parts.join(" / ") || "Sans dossier";
  }

  async function loadQuizImageResources(){
    const systemRoot = "Ressources système";
    const personalRoot = "Ressources personnelles";
    const systemImagesRoot = `${systemRoot} / Images`;
    const folderPaths = new Set([personalRoot, systemRoot, systemImagesRoot]);

    if (typeof listResourcesForSpace !== "function") {
      return { assets:[], folderPaths:[...folderPaths], unifiedTree:true };
    }

    const teacherSpaceId = getActiveTeacherSpaceId();
    const [folderRows, resourceRows] = await Promise.all([
      typeof listResourceFoldersForSpace === "function" ? listResourceFoldersForSpace(teacherSpaceId) : [],
      listResourcesForSpace(teacherSpaceId)
    ]);
    const visibleFolders = (Array.isArray(folderRows) ? folderRows : []).filter((folder) =>
      !currentQuizIsSystem || folder?.is_system === true
    );
    const foldersById = new Map(visibleFolders.map((folder) => [String(folder.id || ""), folder]));
    const images = (Array.isArray(resourceRows) ? resourceRows : []).filter((resource) =>
      resource?.type === "image" && (!currentQuizIsSystem || resource?.is_system === true)
    );

    visibleFolders.forEach((folder) => {
      const root = folder?.is_system === true ? systemRoot : personalRoot;
      const path = getResourceFolderPath(folder?.id, foldersById);
      if (path && path !== "Sans dossier") folderPaths.add(`${root} / ${path}`);
    });

    const resourceAssets = await Promise.all(images.map(async (resource) => {
      let url = String(resource.url || "").trim();
      if (!url && resource.storage_path && typeof createResourceSignedUrl === "function") {
        try { url = await createResourceSignedUrl(resource, 3600); }
        catch (error) { console.warn("Impossible de signer une ressource du Quiz.", error); }
      }
      return {
        id:`resource:${resource.id}`,
        resourceId:String(resource.id || ""),
        type:"image",
        scope:resource.is_system === true ? "system" : "personal",
        category:(() => {
          const root = resource.is_system === true ? systemRoot : personalRoot;
          const path = getResourceFolderPath(resource.folder_id, foldersById);
          return path && path !== "Sans dossier" ? `${root} / ${path}` : root;
        })(),
        label:String(resource.title || "Image"),
        alt:String(resource.alt || resource.title || "Image"),
        tags:Array.isArray(resource.tags) ? resource.tags : [],
        mimeType:String(resource.mime_type || "image/*"),
        url
      };
    }));

    return {
      assets:resourceAssets.filter((asset) => asset.resourceId && asset.url),
      folderPaths:[...folderPaths],
      unifiedTree:true
    };
  }

  async function chooseResourceImage(widgetId){
    const widget = draftWidgets.find((entry) => entry.id === widgetId);
    if (!widget || widget.type !== "image") return;
    try {
      const asset = await openToolAssetPicker({
        type:"image",
        title:"Choisir une image",
        loadAssets:loadQuizImageResources,
        emptyMessage:"Aucune image disponible dans ce dossier."
      });
      if (!asset) return;
      if (!asset.resourceId) throw new Error("Cette image n’est pas une ressource Supabase valide.");
      setWidgetImageSource(widget, {
        kind:"resource",
        resourceId:asset.resourceId,
        label:asset.label,
        alt:asset.alt || asset.label,
        mimeType:asset.mimeType || "image/*"
      });
    } catch (error) {
      console.error("Impossible d’ouvrir les ressources du Quiz.", error);
      showToast?.(error?.message || "Impossible de charger les ressources.", { isError:true });
    }
  }

  async function ensureImportsResourceFolder(teacherSpaceId){
    if (typeof listResourceFoldersForSpace !== "function" || typeof createResourceFolderForSpace !== "function") {
      throw new Error("La gestion des dossiers de ressources n’est pas disponible.");
    }
    const folders = await listResourceFoldersForSpace(teacherSpaceId);
    const personalRootFolders = (Array.isArray(folders) ? folders : []).filter((folder) =>
      folder?.is_system !== true && !String(folder?.parent_id || "").trim()
    );
    const existing = personalRootFolders.find((folder) => normalizeResourceName(folder.name) === "imports");
    if (existing) return existing;
    return await createResourceFolderForSpace(teacherSpaceId, {
      name:"Imports",
      parent_id:null,
      display_order:personalRootFolders.length
    });
  }

  function getImportedResourceTitle(file){
    const name = String(file?.name || "Image importée").trim() || "Image importée";
    return name.replace(/\.[a-z0-9]{1,10}$/i, "").trim() || name;
  }

  async function readImageDimensions(file){
    if (!(file instanceof Blob)) return { width:0, height:0 };
    if (typeof createImageBitmap === "function") {
      try {
        const bitmap = await createImageBitmap(file);
        const dimensions = { width:Math.max(0, Number(bitmap.width) || 0), height:Math.max(0, Number(bitmap.height) || 0) };
        bitmap.close?.();
        return dimensions;
      } catch {}
    }
    return await new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      const finish = (dimensions) => {
        URL.revokeObjectURL(url);
        resolve(dimensions);
      };
      image.onload = () => finish({ width:Math.max(0, Number(image.naturalWidth) || 0), height:Math.max(0, Number(image.naturalHeight) || 0) });
      image.onerror = () => finish({ width:0, height:0 });
      image.src = url;
    });
  }

  function chooseImportedImage(widgetId){
    if (currentQuizIsSystem) {
      showToast?.("Un quiz système ne peut utiliser que les images système du site.", { isError:true });
      return;
    }
    const widget = draftWidgets.find((entry) => entry.id === widgetId);
    if (!widget || widget.type !== "image") return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.hidden = true;
    document.body.appendChild(input);
    input.addEventListener("change", async () => {
      const file = input.files?.[0] || null;
      input.remove();
      if (!file) return;
      try {
        const mimeType = String(file.type || "").trim().toLowerCase();
        if (!mimeType.startsWith("image/")) throw new Error("Le fichier sélectionné n’est pas une image.");
        if (Number(file.size) > MAX_RESOURCE_FILE_SIZE) throw new Error("Cette image dépasse la limite de 25 Mo.");
        if (typeof uploadResourceForSpace !== "function" || typeof listResourcesForSpace !== "function") {
          throw new Error("L’import Supabase des ressources n’est pas disponible.");
        }

        const teacherSpaceId = getActiveTeacherSpaceId();
        const existingResources = await listResourcesForSpace(teacherSpaceId);
        const usedBytes = (Array.isArray(existingResources) ? existingResources : [])
          .filter((resource) => resource?.is_system !== true)
          .reduce((total, resource) => total + Math.max(0, Number(resource?.size_bytes) || 0), 0);
        if (usedBytes + Math.max(0, Number(file.size) || 0) > RESOURCE_STORAGE_QUOTA_BYTES) {
          throw new Error("Le quota de stockage personnel de 100 Mo serait dépassé.");
        }

        const importsFolder = await ensureImportsResourceFolder(teacherSpaceId);
        const dimensions = await readImageDimensions(file);
        const title = getImportedResourceTitle(file);
        const uploaded = await uploadResourceForSpace(teacherSpaceId, file, {
          folder_id:importsFolder.id,
          title,
          alt:title,
          mime_type:mimeType,
          width:dimensions.width,
          height:dimensions.height
        });
        if (!uploaded?.id) throw new Error("La ressource importée n’a pas été enregistrée.");

        setWidgetImageSource(widget, {
          kind:"resource",
          resourceId:uploaded.id,
          label:uploaded.title || title,
          alt:uploaded.alt || uploaded.title || title,
          mimeType:uploaded.mime_type || mimeType
        });
        showToast?.(`Image importée dans Ressources personnelles / Imports.`);
      } catch (error) {
        console.error("Impossible d’importer l’image.", error);
        showToast?.(error?.message || "Impossible d’importer cette image.", { isError:true });
      }
    }, { once:true });
    input.addEventListener("cancel", () => input.remove(), { once:true });
    input.click();
  }

  function formatAudioDuration(value){
    const total = Math.max(0, Math.floor(Number(value) || 0));
    const minutes = Math.floor(total / 60);
    const seconds = String(total % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  function getAudioEditorMarkup(widget, widgetView, isSelected){
    const source = normalizeQuizAudioSource(widgetView.audioSource);
    const sourcePayload = source ? escapeHtml(JSON.stringify(source)) : "";
    return `
      <div class="quiz-workshop-audio-content${source ? " has-audio" : " is-empty"}">
        ${source ? `
          <audio class="quiz-workshop-audio-element" data-quiz-audio-source="${sourcePayload}" preload="metadata"></audio>
          <div class="quiz-workshop-audio-playback dashboard-audio-recorder-preview">
            <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-toggle-quiz-audio-preview="${escapeHtml(widget.id)}" aria-label="Lire l’audio" title="Lire / mettre en pause"><span class="dashboard-material-icon" aria-hidden="true">play_arrow</span></button>
            <input class="dashboard-audio-recorder-progress" data-quiz-audio-seek type="range" min="0" max="100" value="0" aria-label="Position de lecture">
          </div>` : `
          <div class="quiz-workshop-audio-actions">
            <button class="btn" type="button" data-choose-quiz-audio-resource="${escapeHtml(widget.id)}"><span class="dashboard-material-icon" aria-hidden="true">collections</span>Ressources</button>
            ${currentQuizIsSystem ? "" : `
              <button class="btn" type="button" data-upload-quiz-audio="${escapeHtml(widget.id)}"><span class="dashboard-material-icon" aria-hidden="true">upload_file</span>Importer</button>
              <button class="btn" type="button" data-open-quiz-audio-recorder="${escapeHtml(widget.id)}"><span class="dashboard-material-icon" aria-hidden="true">radio_button_checked</span>Enregistrer</button>
            `}
          </div>`}
        ${source ? `<button class="btn quiz-workshop-audio-remove${isSelected ? " is-visible" : ""}" type="button" data-remove-quiz-audio="${escapeHtml(widget.id)}">Supprimer</button>` : ""}
        <div class="quiz-workshop-audio-unavailable">Audio indisponible</div>
      </div>
    `;
  }

  function stopWorkshopAudio(except = null){
    canvas?.querySelectorAll?.(".quiz-workshop-audio-element").forEach((audio) => {
      if (audio === except) return;
      try { audio.pause(); } catch {}
      const host = audio.closest(".quiz-workshop-audio-content");
      host?.classList.remove("is-playing");
      const icon = host?.querySelector("[data-toggle-quiz-audio-preview] .dashboard-material-icon");
      if (icon) icon.textContent = "play_arrow";
    });
  }

  async function hydrateAudioPreviews(root = canvas){
    const nodes = Array.from(root?.querySelectorAll?.("[data-quiz-audio-source]") || []);
    await Promise.all(nodes.map(async (audio) => {
      const payload = String(audio.dataset.quizAudioSource || "");
      if (!payload) return;
      let source = null;
      try { source = normalizeQuizAudioSource(JSON.parse(payload)); } catch { return; }
      if (!source) return;
      const expectedPayload = payload;
      const host = audio.closest(".quiz-workshop-audio-content");
      try {
        const url = await resolveQuizAudioSourceUrl(source);
        if (!audio.isConnected || audio.dataset.quizAudioSource !== expectedPayload) return;
        if (!url) {
          host?.classList.add("is-unavailable");
          return;
        }
        audio.src = url;
        host?.classList.remove("is-unavailable");
        audio.volume = 1;
        const seek = host?.querySelector("[data-quiz-audio-seek]");
        const playIcon = host?.querySelector("[data-toggle-quiz-audio-preview] .dashboard-material-icon");
        let progressFrame = 0;
        let isSeeking = false;
        const getPlaybackDuration = () => {
          if (Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration;
          return Math.max(0, Number(source.duration) || 0);
        };
        const syncProgress = () => {
          const duration = getPlaybackDuration();
          const ratio = duration > 0 ? audio.currentTime / duration : 0;
          if (seek && !isSeeking) seek.value = String(clamp(ratio * 100, 0, 100));
        };
        const stopProgressLoop = () => {
          if (progressFrame) window.cancelAnimationFrame(progressFrame);
          progressFrame = 0;
        };
        const runProgressLoop = () => {
          syncProgress();
          if (!audio.paused && !audio.ended) progressFrame = window.requestAnimationFrame(runProgressLoop);
          else progressFrame = 0;
        };
        const startProgressLoop = () => {
          stopProgressLoop();
          runProgressLoop();
        };
        seek?.addEventListener("pointerdown", () => { isSeeking = true; });
        seek?.addEventListener("pointerup", () => { isSeeking = false; syncProgress(); });
        seek?.addEventListener("pointercancel", () => { isSeeking = false; syncProgress(); });
        seek?.addEventListener("change", () => { isSeeking = false; syncProgress(); });
        audio.addEventListener("timeupdate", syncProgress);
        audio.addEventListener("loadedmetadata", syncProgress);
        audio.addEventListener("durationchange", syncProgress);
        audio.addEventListener("play", () => {
          stopWorkshopAudio(audio);
          host?.classList.add("is-playing");
          if (playIcon) playIcon.textContent = "pause";
          startProgressLoop();
        });
        const stopState = () => {
          stopProgressLoop();
          host?.classList.remove("is-playing");
          if (playIcon) playIcon.textContent = "play_arrow";
          syncProgress();
        };
        audio.addEventListener("pause", stopState);
        audio.addEventListener("ended", () => {
          audio.currentTime = 0;
          stopState();
        });
      } catch (error) {
        console.warn("Impossible de charger l’audio du widget Quiz.", error);
        if (audio.isConnected) host?.classList.add("is-unavailable");
      }
    }));
  }

  function setWidgetAudioSource(widget, source){
    if (!widget || widget.type !== "audio") return;
    const normalized = normalizeQuizAudioSource(source);
    if (previewMode === "correction") {
      detachCorrectionProperty(widget, "audio");
      widget.correctionAudioSource = normalized;
    } else {
      widget.questionAudioSource = normalized;
    }
    syncActiveVariantWidget(widget);
    markLayoutAsCustom();
    selectedWidgetId = widget.id;
    renderCanvas();
  }

  function removeWidgetAudioSource(widgetId){
    const widget = draftWidgets.find((entry) => entry.id === widgetId && entry.type === "audio");
    if (!widget) return;
    stopWorkshopAudio();
    if (previewMode === "correction") {
      detachCorrectionProperty(widget, "audio");
      widget.correctionAudioSource = null;
    } else {
      widget.questionAudioSource = null;
      if (!widget.correctionOverrides?.audio) widget.correctionAudioSource = null;
    }
    syncActiveVariantWidget(widget);
    markLayoutAsCustom();
    selectedWidgetId = widget.id;
    renderCanvas();
  }

  async function loadQuizAudioResources(){
    const systemRoot = "Ressources système";
    const personalRoot = "Ressources personnelles";
    const systemAudioRoot = `${systemRoot} / Audio`;
    const folderPaths = new Set([personalRoot, systemRoot, systemAudioRoot]);

    if (typeof listResourcesForSpace !== "function") {
      return { assets:[], folderPaths:[...folderPaths], unifiedTree:true };
    }

    const teacherSpaceId = getActiveTeacherSpaceId();
    const [folderRows, resourceRows] = await Promise.all([
      typeof listResourceFoldersForSpace === "function" ? listResourceFoldersForSpace(teacherSpaceId) : [],
      listResourcesForSpace(teacherSpaceId)
    ]);
    const visibleFolders = (Array.isArray(folderRows) ? folderRows : []).filter((folder) =>
      !currentQuizIsSystem || folder?.is_system === true
    );
    const foldersById = new Map(visibleFolders.map((folder) => [String(folder.id || ""), folder]));
    const audios = (Array.isArray(resourceRows) ? resourceRows : []).filter((resource) =>
      resource?.type === "audio" && (!currentQuizIsSystem || resource?.is_system === true)
    );

    visibleFolders.forEach((folder) => {
      const root = folder?.is_system === true ? systemRoot : personalRoot;
      const path = getResourceFolderPath(folder?.id, foldersById);
      if (path && path !== "Sans dossier") folderPaths.add(`${root} / ${path}`);
    });

    const resourceAssets = await Promise.all(audios.map(async (resource) => {
      let url = String(resource.url || "").trim();
      if (!url && resource.storage_path && typeof createResourceSignedUrl === "function") {
        try { url = await createResourceSignedUrl(resource, 3600); }
        catch (error) { console.warn("Impossible de signer une ressource audio du Quiz.", error); }
      }
      return {
        id:`resource:${resource.id}`,
        resourceId:String(resource.id || ""),
        type:"audio",
        scope:resource.is_system === true ? "system" : "personal",
        category:(() => {
          const root = resource.is_system === true ? systemRoot : personalRoot;
          const path = getResourceFolderPath(resource.folder_id, foldersById);
          return path && path !== "Sans dossier" ? `${root} / ${path}` : root;
        })(),
        label:String(resource.title || "Audio"),
        tags:Array.isArray(resource.tags) ? resource.tags : [],
        mimeType:String(resource.mime_type || "audio/*"),
        duration:Math.max(0, Number(resource.duration) || 0),
        url
      };
    }));

    return {
      assets:resourceAssets.filter((asset) => asset.resourceId && asset.url),
      folderPaths:[...folderPaths],
      unifiedTree:true
    };
  }

  async function chooseResourceAudio(widgetId){
    const widget = draftWidgets.find((entry) => entry.id === widgetId && entry.type === "audio");
    if (!widget) return;
    try {
      const asset = await openToolAssetPicker({
        type:"audio",
        title:"Choisir un audio",
        loadAssets:loadQuizAudioResources,
        emptyMessage:"Aucun audio disponible dans ce dossier."
      });
      if (!asset) return;
      if (!asset.resourceId) throw new Error("Cet audio n’est pas une ressource Supabase valide.");
      setWidgetAudioSource(widget, {
        kind:"resource",
        resourceId:asset.resourceId,
        label:asset.label,
        mimeType:asset.mimeType || "audio/*",
        duration:asset.duration || 0
      });
    } catch (error) {
      console.error("Impossible d’ouvrir les ressources audio du Quiz.", error);
      showToast?.(error?.message || "Impossible de charger les ressources audio.", { isError:true });
    }
  }

  async function readAudioDuration(file){
    if (!(file instanceof Blob)) return 0;
    return await new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const audio = document.createElement("audio");
      const finish = (duration = 0) => {
        URL.revokeObjectURL(url);
        audio.remove();
        resolve(Math.max(0, Number(duration) || 0));
      };
      audio.preload = "metadata";
      audio.addEventListener("loadedmetadata", () => finish(Number.isFinite(audio.duration) ? audio.duration : 0), { once:true });
      audio.addEventListener("error", () => finish(0), { once:true });
      audio.src = url;
    });
  }

  function chooseImportedAudio(widgetId){
    if (currentQuizIsSystem) {
      showToast?.("Un quiz système ne peut utiliser que les audios système du site.", { isError:true });
      return;
    }
    const widget = draftWidgets.find((entry) => entry.id === widgetId && entry.type === "audio");
    if (!widget) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*,.mp3,.wav,.ogg,.webm,.m4a,.mp4";
    input.hidden = true;
    document.body.appendChild(input);
    input.addEventListener("change", async () => {
      const file = input.files?.[0] || null;
      input.remove();
      if (!file) return;
      try {
        const mimeType = String(file.type || "").trim().toLowerCase();
        if (mimeType && !mimeType.startsWith("audio/")) throw new Error("Le fichier sélectionné n’est pas un audio.");
        if (Number(file.size) > MAX_RESOURCE_FILE_SIZE) throw new Error("Cet audio dépasse la limite de 25 Mo.");
        if (typeof uploadResourceForSpace !== "function" || typeof listResourcesForSpace !== "function") {
          throw new Error("L’import Supabase des ressources n’est pas disponible.");
        }

        const teacherSpaceId = getActiveTeacherSpaceId();
        const existingResources = await listResourcesForSpace(teacherSpaceId);
        const usedBytes = (Array.isArray(existingResources) ? existingResources : [])
          .filter((resource) => resource?.is_system !== true)
          .reduce((total, resource) => total + Math.max(0, Number(resource?.size_bytes) || 0), 0);
        if (usedBytes + Math.max(0, Number(file.size) || 0) > RESOURCE_STORAGE_QUOTA_BYTES) {
          throw new Error("Le quota de stockage personnel de 100 Mo serait dépassé.");
        }

        const importsFolder = await ensureImportsResourceFolder(teacherSpaceId);
        const title = getImportedResourceTitle(file);
        const duration = await readAudioDuration(file);
        const uploaded = await uploadResourceForSpace(teacherSpaceId, file, {
          folder_id:importsFolder.id,
          title,
          alt:title,
          type:"audio",
          mime_type:mimeType || "audio/*",
          duration,
          metadata:{ origin:"import" }
        });
        if (!uploaded?.id) throw new Error("La ressource importée n’a pas été enregistrée.");

        setWidgetAudioSource(widget, {
          kind:"resource",
          resourceId:uploaded.id,
          label:uploaded.title || title,
          mimeType:uploaded.mime_type || mimeType || "audio/*",
          duration:uploaded.duration || duration
        });
        showToast?.("Audio importé dans Ressources personnelles / Imports.");
      } catch (error) {
        console.error("Impossible d’importer l’audio.", error);
        showToast?.(error?.message || "Impossible d’importer cet audio.", { isError:true });
      }
    }, { once:true });
    input.addEventListener("cancel", () => input.remove(), { once:true });
    input.click();
  }

  async function recordAudioResource(widgetId){
    if (currentQuizIsSystem) {
      showToast?.("L’enregistrement audio personnel est désactivé pour les quiz système.", { isError:true });
      return;
    }
    const widget = draftWidgets.find((entry) => entry.id === widgetId && entry.type === "audio");
    if (!widget) return;
    if (typeof ensureRecordingsResourceFolderForSpace !== "function") {
      showToast?.("Le dossier des enregistrements n’est pas disponible.", { isError:true });
      return;
    }
    const teacherSpaceId = getActiveTeacherSpaceId();
    const resource = await openAudioRecorderDialog({
      teacherSpaceId,
      ensureDestinationFolder:() => ensureRecordingsResourceFolderForSpace(teacherSpaceId),
      listResourcesForSpace,
      uploadResourceForSpace,
      defaultTitle:createDefaultAudioRecordingTitle(),
      showToast
    });
    if (!resource?.id) return;
    setWidgetAudioSource(widget, {
      kind:"resource",
      resourceId:resource.id,
      label:resource.title || "Enregistrement",
      mimeType:resource.mime_type || "audio/*",
      duration:resource.duration || 0
    });
  }

  function renderCanvas(){
    if (!canvas) return;

    stopWorkshopAudio();
    canvas.dataset.quizMode = previewMode;

    const answerMarkup = draftAnswerGuide ? `
      <div
        class="quiz-workshop-answer-guide"
        style="${getPositionStyle(draftAnswerGuide)}"
        aria-label="${previewMode === "correction" ? "Emplacement de la correction" : "Emplacement de la réponse"}"
      >
        <span class="dashboard-material-icon" aria-hidden="true">${previewMode === "correction" ? "task_alt" : "edit"}</span>
        <span>${previewMode === "correction" ? "Réponse attendue" : "Réponse de l’élève"}</span>
      </div>
    ` : "";

    const widgetMarkup = draftWidgets.map((widget) => {
      ensureWidgetContent(widget);
      const widgetView = getWidgetView(widget, previewMode);
      const isSelected = widget.id === selectedWidgetId;
      const isEditing = widget.id === editingWidgetId;
      const isMoving = interactionState?.type === "move" && interactionState.widgetId === widget.id;
      const isResizing = interactionState?.type === "resize" && interactionState.widgetId === widget.id;
      const visibilityPresentation = getVisibilityControlPresentation(widgetView.visibilityMode, previewMode);
      const isAnswerWidget = widget.type === "answer";
      const isImageWidget = widget.type === "image";
      const isAudioWidget = widget.type === "audio";
      const isLabelsWidget = widget.type === "labels";
      const isNumericKeypadWidget = widget.type === "numeric-keypad";
      const isQcmTextWidget = widget.type === "qcm-text";
      const isSelectionWordsWidget = widget.type === "selection-words";
      const isCategoriesWidget = widget.type === "categories";
      const canEditContent = !isImageWidget
        && !isAudioWidget
        && !isLabelsWidget
        && !isNumericKeypadWidget
        && !isQcmTextWidget
        && !isCategoriesWidget
        && (!isAnswerWidget || previewMode === "correction")
        && (!isSelectionWordsWidget || previewMode === "question");
      const isContentEmpty = !widgetView.text;
      const editorAttributes = canEditContent
        ? `contenteditable="true" role="textbox" aria-multiline="true" spellcheck="true" data-quiz-widget-editor-id="${escapeHtml(widget.id)}" data-quiz-editor-field="${previewMode === "correction" ? "correctionHtml" : "questionHtml"}"`
        : `contenteditable="false" aria-readonly="true"`;
      const editorHtml = widgetView.html || (canEditContent ? "<br>" : "");
      const widgetContentMarkup = isNumericKeypadWidget
        ? getNumericKeypadPreviewMarkup()
        : isLabelsWidget
          ? getLabelsEditorMarkup(widget, widgetView, isSelected)
          : isCategoriesWidget
            ? getCategoriesEditorMarkup(widget, widgetView, isSelected)
        : isImageWidget
          ? getImageEditorMarkup(widget, widgetView, isSelected)
          : isAudioWidget
            ? getAudioEditorMarkup(widget, widgetView, isSelected)
          : isQcmTextWidget
            ? getQcmEditorMarkup(widget, widgetView, isSelected)
            : isSelectionWordsWidget && previewMode === "correction"
              ? getSelectionWordsEditorMarkup(widget, widgetView)
              : `
          <div class="quiz-workshop-canvas-widget-content-shell">
            <div
              class="quiz-workshop-canvas-widget-content${canEditContent ? "" : " is-readonly"}${isContentEmpty ? " is-empty" : ""}"
              ${editorAttributes}
              data-placeholder="${escapeHtml(widgetView.placeholder || "")}"
            >${editorHtml}</div>
          </div>
        `;
      const visibilityMarkup = isNumericKeypadWidget ? "" : `
          <button
            class="quiz-workshop-widget-visibility dashboard-material-icon-btn"
            type="button"
            data-toggle-quiz-widget-visibility="${escapeHtml(widget.id)}"
            aria-label="${escapeHtml(visibilityPresentation.action)} dans la vue ${previewMode === "correction" ? "Correction" : "Question"}"
            title="Cliquer pour changer : ${escapeHtml(visibilityPresentation.label)}"
          >
            <span class="dashboard-material-icon" aria-hidden="true">${visibilityPresentation.icon}</span>
            <span class="quiz-workshop-widget-visibility-label">${escapeHtml(visibilityPresentation.label)}</span>
          </button>
      `;
      const canTransformWidget = !isNumericKeypadWidget || previewMode === "question";
      const moveMarkup = canTransformWidget ? `
          <button
            class="quiz-workshop-canvas-widget-move"
            type="button"
            data-move-quiz-widget="${escapeHtml(widget.id)}"
            aria-label="Déplacer ce bloc"
            title="Déplacer"
          >
            <span class="dashboard-material-icon" aria-hidden="true">open_with</span>
          </button>
      ` : "";
      const resizeMarkup = canTransformWidget ? `
          <button
            class="quiz-workshop-canvas-widget-resize"
            type="button"
            data-resize-quiz-widget="${escapeHtml(widget.id)}"
            aria-label="Redimensionner ce bloc"
            title="Redimensionner"
          ></button>
      ` : "";
      return `
        <article
          class="quiz-workshop-canvas-widget quiz-workshop-canvas-widget--${escapeHtml(widget.type)}${isSelected ? " is-selected" : ""}${isEditing ? " is-editing" : ""}${isMoving ? " is-moving" : ""}${isResizing ? " is-resizing" : ""}${widgetView.visibilityMode === "hidden" ? " is-hidden-in-view" : ""}${widgetView.visibilityMode === "correct" ? " is-visible-if-correct" : ""}${widgetView.visibilityMode === "incorrect" ? " is-visible-if-incorrect" : ""}"
          style="${getWidgetStyle(widgetView)}"
          data-quiz-widget-id="${escapeHtml(widget.id)}"
          tabindex="0"
          aria-label="Bloc ${escapeHtml(widget.label)}${widgetView.visibilityMode === "hidden" ? ", masqué dans cette vue" : widgetView.visibilityMode === "correct" ? ", affiché si la réponse est correcte" : widgetView.visibilityMode === "incorrect" ? ", affiché si la réponse est incorrecte" : ""}"
        >
          ${moveMarkup}
          <button
            class="quiz-workshop-widget-remove dashboard-material-icon-btn"
            type="button"
            data-remove-quiz-widget="${escapeHtml(widget.id)}"
            aria-label="Supprimer ce bloc"
            title="Supprimer"
          >
            <span class="dashboard-material-icon" aria-hidden="true">close</span>
          </button>
          ${widgetContentMarkup}
          ${visibilityMarkup}
          ${resizeMarkup}
        </article>
      `;
    }).join("");

    const emptyMarkup = !widgetMarkup && !answerMarkup ? `
      <div class="quiz-workshop-canvas-empty">
        <span class="dashboard-material-icon" aria-hidden="true">widgets</span>
        <strong>Le canevas est vide</strong>
        <span>Ajoutez un élément depuis le panneau de gauche.</span>
      </div>
    ` : "";

    canvas.innerHTML = `${getGridCellsMarkup()}${answerMarkup}${widgetMarkup}${emptyMarkup}`;
    window.requestAnimationFrame(() => {
      fitCanvas();
      hydrateImagePreviews();
      hydrateAudioPreviews();
      if (editingWidgetId) {
        showTextToolbar();
        updateToolbarState();
      }
    });

    drawer?.querySelectorAll("[data-quiz-preview-mode]").forEach((button) => {
      const isActive = button.dataset.quizPreviewMode === previewMode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function renderEditorHeader(){
    const isEditing = Boolean(editingQuestionId);
    if (drawerTitle) drawerTitle.textContent = isEditing ? "Modifier la question" : "Ajouter une question";
    if (drawerText) {
      drawerText.textContent = isEditing
        ? "Ajustez la composition de la question sur le canevas."
        : "Choisissez un modèle ou composez librement la question avec les éléments disponibles.";
    }
    if (confirmLabel) confirmLabel.textContent = isEditing ? "Enregistrer la question" : "Ajouter la question";
    if (confirmButton) confirmButton.disabled = draftWidgets.length === 0 && !draftAnswerGuide;
    renderQuestionWarnings();
  }

  function renderQuestionWarnings(){
    if (!questionWarnings) return;
    const issues = getQuestionCompositionIssues(draftWidgets);
    questionWarnings.hidden = issues.length === 0;
    questionWarnings.innerHTML = issues.map((issue) => `
      <span class="quiz-workshop-question-warning-pill" data-quiz-question-warning="${escapeHtml(issue.code)}">
        <span class="dashboard-material-icon" aria-hidden="true">warning</span>
        <span>${escapeHtml(issue.label)}</span>
      </span>
    `).join("");
  }

  function renderEditor(){
    renderTemplates();
    renderElements();
    renderLibrary();
    renderCanvas();
    renderVariantNavigation();
    renderEditorHeader();
  }

  function renderQuestions(){
    const count = questions.length;

    if (testButton) testButton.disabled = count === 0;
    if (questionCount) questionCount.textContent = `${count} question${count > 1 ? "s" : ""}`;
    emptyState?.classList.toggle("hidden", count > 0);
    questionsHost?.classList.toggle("hidden", count === 0);
    addQuestionAfterListButton?.classList.toggle("hidden", count === 0);
    if (!questionsHost) return;

    questionsHost.innerHTML = questions.map((question, index) => {
      const compositionIssues = getQuestionCompositionIssues(question.widgets);
      const warningLabel = compositionIssues.map((issue) => issue.label).join(" · ");
      return `
      <article class="quiz-workshop-question-card${compositionIssues.length ? " is-incomplete" : ""}">
        <div class="quiz-workshop-question-index" aria-hidden="true">${index + 1}</div>
        ${getQuestionPreviewMarkup(question)}
        <div class="quiz-workshop-question-main">
          <div class="quiz-workshop-question-meta">
            ${question.widgets.length} élément${question.widgets.length > 1 ? "s" : ""} · ${Math.max(1, question.variants?.length || 1)} variante${Math.max(1, question.variants?.length || 1) > 1 ? "s" : ""}
            ${compositionIssues.length ? `
              <span class="quiz-workshop-question-incomplete" role="img" aria-label="Question incomplète : ${escapeHtml(warningLabel)}" title="Question incomplète : ${escapeHtml(warningLabel)}">
                <span class="dashboard-material-icon" aria-hidden="true">warning</span>
              </span>
            ` : ""}
          </div>
          ${getQuestionWidgetSummaryMarkup(question)}
        </div>
        <div class="quiz-workshop-question-actions">
          <button class="quiz-workshop-question-action dashboard-material-icon-btn" type="button" data-edit-question="${escapeHtml(question.id)}" aria-label="Modifier cette question" title="Modifier">
            <span class="dashboard-material-icon" aria-hidden="true">edit</span>
          </button>
          <button class="quiz-workshop-question-action dashboard-material-icon-btn" type="button" data-duplicate-question="${escapeHtml(question.id)}" aria-label="Dupliquer cette question" title="Dupliquer">
            <span class="dashboard-material-icon" aria-hidden="true">content_copy</span>
          </button>
          <button class="quiz-workshop-question-action quiz-workshop-question-action--remove dashboard-material-icon-btn" type="button" data-remove-question="${escapeHtml(question.id)}" aria-label="Supprimer cette question" title="Supprimer">
            <span class="dashboard-material-icon" aria-hidden="true">delete</span>
          </button>
        </div>
      </article>
    `;
    }).join("");
  }

  function openDrawer(event, question = null){
    lastDrawerTrigger = event?.currentTarget || addButton || null;

    if (question) {
      editingQuestionId = question.id;
      selectedModelId = question.modelId || "free-layout";
      draftTitle = question.title || "Disposition personnalisée";
      draftWidgets = cloneValue(question.widgets).map((widget) => ensureWidgetContent(normalizeWidgetPosition(widget)));
      draftVariants = normalizeQuestionVariants(question.variants, draftWidgets);
      activeVariantIndex = 0;
      loadVariantContent(activeVariantIndex);
      draftAnswerGuide = question.answerGuide ? cloneValue(question.answerGuide) : null;
      previewMode = "question";
      activeLibraryTab = "models";
      selectedWidgetId = draftWidgets[0]?.id || "";
      editingWidgetId = "";
      editingChoiceId = "";
      renderEditor();
    } else {
      resetDraft();
    }

    clearTimeout(drawerCloseTimer);
    cancelDrawerMotion();
    drawerScrim?.classList.add("is-open");
    drawerScrim?.setAttribute("aria-hidden", "false");
    drawer?.classList.remove("is-open", "is-closing", "is-opening", "is-animating");
    drawer?.classList.add("is-visible");
    drawer?.setAttribute("aria-hidden", "false");
    view?.querySelectorAll("[data-quiz-open-drawer]").forEach((button) => button.setAttribute("aria-expanded", "true"));

    // Le volet reste dans son état CSS bas tant que l'animation n'a pas
    // commencé. On évite ainsi le saut bas → haut → bas du premier frame.
    fitCanvas();
    const openMotion = runDrawerMotion(true);
    const focusActiveLibraryTab = () => window.requestAnimationFrame(() => {
      drawer?.querySelector("[data-quiz-library-tab].is-active")?.focus({ preventScroll:true });
    });

    // Le focus attend la fin de la translation : certains navigateurs tentent
    // sinon de faire défiler l'élément focalisé pendant qu'il est encore hors
    // écran, ce qui produit précisément l'effet de tremblement observé.
    if (openMotion) openMotion.finished.then(focusActiveLibraryTab).catch(() => {});
    else focusActiveLibraryTab();
  }

  function closeDrawer({ restoreFocus = true } = {}){
    interactionState = null;
    editingWidgetId = "";
    editingChoiceId = "";
    savedTextSelection = null;
    hideTextToolbar();
    document.body.classList.remove("quiz-workshop-is-resizing", "quiz-workshop-is-moving");
    drawerScrim?.classList.remove("is-open");
    drawerScrim?.setAttribute("aria-hidden", "true");
    drawer?.setAttribute("aria-hidden", "true");
    view?.querySelectorAll("[data-quiz-open-drawer]").forEach((button) => button.setAttribute("aria-expanded", "false"));
    clearTimeout(drawerCloseTimer);

    drawer?.classList.add("is-closing");
    const closeMotion = runDrawerMotion(false);
    const finishClose = () => {
      drawer?.classList.remove("is-open", "is-visible", "is-closing", "is-animating");
    };

    if (closeMotion) {
      closeMotion.finished.then(finishClose).catch(() => {});
    } else {
      drawer?.classList.remove("is-open");
      drawerCloseTimer = window.setTimeout(finishClose, 820);
    }

    if (restoreFocus) lastDrawerTrigger?.focus();
  }

  function saveQuestion(){
    if (draftWidgets.length === 0 && !draftAnswerGuide) return;
    const editor = getActiveEditor();
    if (editor) finalizeEditorContent(editor);
    persistActiveVariantContent();

    const widgets = cloneValue(draftWidgets).map((widget) => {
      ensureWidgetContent(widget);
      widget.questionFormatting = normalizeTextFormattingRuns(widget.questionFormatting, widget.questionText.length);
      widget.correctionFormatting = normalizeTextFormattingRuns(widget.correctionFormatting, widget.correctionText.length);
      widget.questionHtml = richTextModelToHtml(widget.questionText, widget.questionFormatting);
      widget.correctionHtml = richTextModelToHtml(widget.correctionText, widget.correctionFormatting);
      return widget;
    });

    const payload = {
      id: editingQuestionId || createId("question"),
      modelId: selectedModelId,
      title: draftTitle || getSelectedModel()?.title || "Disposition personnalisée",
      widgets,
      variants:cloneValue(draftVariants),
      answerGuide: draftAnswerGuide ? cloneValue(draftAnswerGuide) : null
    };

    if (editingQuestionId) questions = questions.map((question) => question.id === editingQuestionId ? payload : question);
    else questions.push(payload);

    markQuizDirty();
    renderQuestions();
    closeDrawer();
  }

  function addWidget(elementType = "text", { column = null, row = null, columnSpan = null, rowSpan = null } = {}){
    const normalizedType = ["text", "answer", "image", "audio", "labels", "numeric-keypad", "qcm-text", "selection-words", "categories"].includes(elementType) ? elementType : "text";
    const isAnswer = normalizedType === "answer";
    const isImage = normalizedType === "image";
    const isAudio = normalizedType === "audio";
    const isLabels = normalizedType === "labels";
    const isNumericKeypad = normalizedType === "numeric-keypad";
    const isQcmText = normalizedType === "qcm-text";
    const isSelectionWords = normalizedType === "selection-words";
    const isCategories = normalizedType === "categories";
    if (isAnswer || isQcmText || isSelectionWords || isCategories) {
      const existingResponse = draftWidgets.find(isResponseWidget);
      if (existingResponse) {
        selectWidget(existingResponse.id);
        return;
      }
    }
    if (isNumericKeypad) {
      const existing = draftWidgets.find((widget) => widget.type === "numeric-keypad");
      if (existing) {
        selectWidget(existing.id);
        return;
      }
    }

    const resolvedColumnSpan = columnSpan || (isNumericKeypad ? GRID_COLUMNS : isCategories ? 8 : isQcmText || isSelectionWords ? 8 : isLabels ? 6 : isImage || isAudio ? 3 : isAnswer ? 7 : 5);
    const resolvedRowSpan = Math.max(1, Number(rowSpan) || (isCategories ? 4 : isQcmText ? 3 : isLabels ? 3 : isSelectionWords ? 2 : isImage || isAudio ? 2 : 1));
    const requested = column && row
      ? { column, row, columnSpan: resolvedColumnSpan, rowSpan: resolvedRowSpan }
      : findAvailablePosition(resolvedColumnSpan, resolvedRowSpan);
    if (!requested) return;

    const availableLabelWidgets = draftWidgets.filter((entry) => entry.type === "labels");
    const widget = ensureWidgetContent(normalizeWidgetPosition(createWidget({
      type: normalizedType,
      label: isAnswer ? "Réponse de l’élève" : isImage ? "Image" : isAudio ? "Audio" : isLabels ? "Étiquettes" : isNumericKeypad ? "Clavier numérique" : isQcmText ? "QCM (texte)" : isSelectionWords ? "Sélection de mots" : isCategories ? "Catégories" : "Texte",
      questionText: "",
      correctionText: "",
      questionPlaceholder: isAnswer
        ? "Réponse de l’élève"
        : isSelectionWords
          ? "Saisissez la phrase dans laquelle l’élève sélectionnera des mots"
          : isNumericKeypad || isImage || isAudio || isLabels || isCategories
            ? ""
            : "Saisissez le texte",
      correctionPlaceholder: isAnswer ? "Saisissez la réponse attendue" : isNumericKeypad || isImage || isAudio || isLabels || isCategories ? "" : "Saisissez le texte",
      labelsSourceWidgetId:isCategories && availableLabelWidgets.length ? availableLabelWidgets[0].id : "",
      column: requested.column,
      row: requested.row,
      columnSpan: resolvedColumnSpan,
      rowSpan: resolvedRowSpan,
      visibility: isNumericKeypad ? "question" : "both",
      textAlign: "center",
      verticalAlign: "middle"
    })));

    if (!canPlaceWidget(widget.id, getWidgetView(widget, previewMode))) return;
    draftWidgets.push(widget);
    if (isLabels) {
      const labelWidgets = draftWidgets.filter((entry) => entry.type === "labels");
      if (labelWidgets.length === 1) {
        draftWidgets.filter((entry) => entry.type === "categories" && !entry.labelsSourceWidgetId).forEach((categoriesWidget) => {
          categoriesWidget.labelsSourceWidgetId = widget.id;
        });
      }
    }
    ensureDraftVariants();
    draftVariants.forEach((variant) => {
      if (!variant.widgetContents || typeof variant.widgetContents !== "object") variant.widgetContents = {};
      variant.widgetContents[widget.id] = captureWidgetVariantContent(widget);
    });
    selectedWidgetId = widget.id;
    editingWidgetId = isImage || isAudio || isLabels || isCategories || isNumericKeypad || isQcmText || (isAnswer && previewMode === "question") || (isSelectionWords && previewMode === "correction") ? "" : widget.id;
    editingChoiceId = "";
    markLayoutAsCustom();
    renderEditor();
    if (editingWidgetId) window.requestAnimationFrame(() => focusEditorAtEnd(widget.id));
  }

  function removeWidget(widgetId){
    draftWidgets = draftWidgets.filter((widget) => widget.id !== widgetId);
    draftVariants.forEach((variant) => {
      if (variant.widgetContents) delete variant.widgetContents[widgetId];
    });
    const fallbackLabelsWidgetId = draftWidgets.find((widget) => widget.type === "labels")?.id || "";
    draftWidgets.filter((widget) => widget.type === "categories" && widget.labelsSourceWidgetId === widgetId).forEach((widget) => {
      widget.labelsSourceWidgetId = fallbackLabelsWidgetId;
      widget.categoryItems = normalizeCategoryItems(widget.categoryItems, { ensureDefault:true }).map((category) => ({ ...category, labelIds:[] }));
      draftVariants.forEach((variant) => {
        const content = variant.widgetContents?.[widget.id];
        if (content) content.categoryItems = normalizeCategoryItems(content.categoryItems, { ensureDefault:true }).map((category) => ({ ...category, labelIds:[] }));
      });
    });
    if (selectedWidgetId === widgetId) selectedWidgetId = draftWidgets[0]?.id || "";
    if (editingWidgetId === widgetId) {
      editingWidgetId = "";
      editingChoiceId = "";
    }
    hideTextToolbar();
    markLayoutAsCustom();
    renderEditor();
  }

  function getCanvasCell(event){
    if (!canvas) return { column: 1, row: 1 };
    const rect = canvas.getBoundingClientRect();
    const relativeX = clamp(event.clientX - rect.left, 0, Math.max(0, rect.width - 1));
    const relativeY = clamp(event.clientY - rect.top, 0, Math.max(0, rect.height - 1));
    return {
      column: clamp(Math.floor(relativeX / (rect.width / GRID_COLUMNS)) + 1, 1, GRID_COLUMNS),
      row: clamp(Math.floor(relativeY / (rect.height / GRID_ROWS)) + 1, 1, GRID_ROWS)
    };
  }

  function selectWidget(widgetId, { render = true } = {}){
    selectedWidgetId = widgetId;
    if (render) renderCanvas();
  }

  function getQuickEntryFields(){
    let textIndex = 0;
    let answerIndex = 0;
    let qcmIndex = 0;
    let selectionIndex = 0;
    let labelsIndex = 0;
    let categoriesIndex = 0;
    return draftWidgets
      .filter((widget) => ["text", "answer", "qcm-text", "selection-words", "labels", "categories"].includes(widget.type))
      .map((widget, originalIndex) => ({
        widget,
        originalIndex,
        view: getWidgetView(widget, "question")
      }))
      .sort((first, second) => (
        first.view.row - second.view.row
        || first.view.column - second.view.column
        || first.originalIndex - second.originalIndex
      ))
      .map(({ widget }) => {
        if (widget.type === "answer") {
          answerIndex += 1;
          return { widget, token:`réponse${answerIndex}` };
        }
        if (widget.type === "qcm-text") {
          qcmIndex += 1;
          return {
            widget,
            token:`qcm${qcmIndex}_bonne;qcm${qcmIndex}_distracteur1;qcm${qcmIndex}_distracteur2`
          };
        }
        if (widget.type === "selection-words") {
          selectionIndex += 1;
          return {
            widget,
            token:`sélection${selectionIndex}_phrase avec [mots] à sélectionner`
          };
        }
        if (widget.type === "labels") {
          labelsIndex += 1;
          return {
            widget,
            token:`étiquette${labelsIndex}_1;étiquette${labelsIndex}_2;étiquette${labelsIndex}_3`
          };
        }
        if (widget.type === "categories") {
          categoriesIndex += 1;
          return {
            widget,
            token:`catégorie${categoriesIndex}_A:1,2;catégorie${categoriesIndex}_B:3`
          };
        }
        textIndex += 1;
        return { widget, token:`texte${textIndex}` };
      });
  }

  function getVariantCellModel(variant, field){
    const content = variant?.widgetContents?.[field.widget.id] || captureWidgetVariantContent(field.widget);
    if (field.widget.type === "qcm-text") {
      return {
        choices: normalizeQcmChoices(content.qcmChoices ?? content.qcm_choices ?? field.widget.qcmChoices, { ensureDefaultSlots:true })
      };
    }
    if (field.widget.type === "answer") {
      return {
        text:String(content.correctionText ?? content.questionText ?? ""),
        formatting:content.correctionFormatting || content.questionFormatting || []
      };
    }
    if (field.widget.type === "selection-words") {
      const text = String(content.questionText ?? "");
      return {
        text,
        formatting:content.questionFormatting || [],
        expectedTokenIndexes:normalizeQuizSelectionIndexes(
          content.selectionExpectedTokenIndexes ?? content.selection_expected_token_indexes ?? field.widget.selectionExpectedTokenIndexes,
          getQuizSelectionWordCount(text)
        )
      };
    }
    if (field.widget.type === "labels") {
      return {
        labelItems:normalizeLabelItems(content.labelItems ?? content.label_items ?? field.widget.labelItems, { ensureDefault:true })
      };
    }
    if (field.widget.type === "categories") {
      return {
        categoryItems:normalizeCategoryItems(content.categoryItems ?? content.category_items ?? field.widget.categoryItems, { ensureDefault:true })
      };
    }
    return {
      text:String(content.questionText ?? ""),
      formatting:content.questionFormatting || []
    };
  }

  function serializeQuickEntryVariants(fields){
    persistActiveVariantContent();
    ensureDraftVariants();
    const lines = draftVariants.map((variant) => fields
      .map((field) => {
        const model = getVariantCellModel(variant, field);
        if (field.widget.type === "qcm-text") {
          const choices = model.choices || [];
          const correct = choices.find((choice) => choice.isCorrect) || choices[0];
          const distractors = choices.filter((choice) => choice.id !== correct?.id);
          return [correct, ...distractors]
            .filter((choice) => choice && String(choice.text || "").trim())
            .map((choice) => serializeMiniMarkup(choice.text, choice.formatting))
            .join(";");
        }
        if (field.widget.type === "selection-words") {
          return serializeQuizSelectionQuickEntry(model.text, model.formatting, model.expectedTokenIndexes);
        }
        if (field.widget.type === "labels") {
          return (model.labelItems || [])
            .map((item) => String(item.text || "").trim())
            .filter(Boolean)
            .join(";");
        }
        if (field.widget.type === "categories") {
          const sourceWidgetId = String(field.widget.labelsSourceWidgetId || "");
          const sourceWidget = draftWidgets.find((widget) => widget.id === sourceWidgetId && widget.type === "labels");
          const sourceContent = sourceWidget
            ? variant?.widgetContents?.[sourceWidget.id] || captureWidgetVariantContent(sourceWidget)
            : null;
          const labelItems = normalizeLabelItems(sourceContent?.labelItems ?? sourceWidget?.labelItems ?? []);
          const indexById = new Map(labelItems.map((item, index) => [item.id, index + 1]));
          return (model.categoryItems || []).map((category) => {
            const indexes = category.labelIds
              .map((labelId) => indexById.get(labelId))
              .filter(Boolean);
            return `${String(category.title || "").trim()}:${indexes.join(",")}`;
          }).join(";");
        }
        return serializeMiniMarkup(model.text, model.formatting);
      })
      .join("|"));
    return lines.every((line) => !line.trim()) ? "" : lines.join("\n");
  }

  function buildVariantFromQuickEntry(fields, values, sourceVariant = null){
    const variant = createVariantFromWidgets(draftWidgets, sourceVariant || {});
    fields.forEach((field, index) => {
      if (field.widget.type === "categories") return;
      const content = variant.widgetContents[field.widget.id] || captureWidgetVariantContent(field.widget);
      if (field.widget.type === "labels") {
        const parsedLabels = parseLabelsQuickEntry(values[index], content.labelItems ?? field.widget.labelItems);
        if (!parsedLabels.error) content.labelItems = parsedLabels.items;
        variant.widgetContents[field.widget.id] = content;
        return;
      }
      if (field.widget.type === "qcm-text") {
        const previousChoices = normalizeQcmChoices(content.qcmChoices ?? field.widget.qcmChoices, { ensureDefaultSlots:true });
        const choiceValues = String(values[index] ?? "")
          .split(";")
          .map((value) => value.trim())
          .slice(0, QCM_MAX_CHOICES);
        content.qcmChoices = choiceValues.map((value, choiceIndex) => {
          const parsedChoice = parseMiniMarkup(value);
          return {
            id: previousChoices[choiceIndex]?.id || createId("choice"),
            text: parsedChoice.text,
            formatting: parsedChoice.formatting,
            isCorrect: choiceIndex === 0
          };
        });
        while (content.qcmChoices.length < QCM_MIN_CHOICES) {
          content.qcmChoices.push(createQcmChoice({}, content.qcmChoices.length));
        }
        content.qcmChoices.forEach((choice, choiceIndex) => {
          choice.isCorrect = choiceIndex === 0;
        });
        variant.widgetContents[field.widget.id] = content;
        return;
      }

      if (field.widget.type === "selection-words") {
        const parsedSelection = parseQuizSelectionQuickEntry(values[index]);
        if (parsedSelection.error) return;
        content.questionText = parsedSelection.text;
        content.questionFormatting = parsedSelection.formatting;
        content.correctionText = parsedSelection.text;
        content.correctionFormatting = cloneValue(parsedSelection.formatting);
        content.correctionTextOverridden = false;
        content.correctionFormattingOverridden = false;
        content.selectionExpectedTokenIndexes = parsedSelection.expectedTokenIndexes;
        variant.widgetContents[field.widget.id] = content;
        return;
      }

      const parsed = parseMiniMarkup(String(values[index] ?? "").trim());
      if (field.widget.type === "answer") {
        content.correctionText = parsed.text;
        content.correctionFormatting = parsed.formatting;
        content.correctionTextOverridden = true;
        content.correctionFormattingOverridden = true;
      } else {
        content.questionText = parsed.text;
        content.questionFormatting = parsed.formatting;
        if (!content.correctionTextOverridden) content.correctionText = parsed.text;
        if (!content.correctionFormattingOverridden) content.correctionFormatting = cloneValue(parsed.formatting);
      }
      variant.widgetContents[field.widget.id] = content;
    });

    fields.forEach((field, index) => {
      if (field.widget.type !== "categories") return;
      const content = variant.widgetContents[field.widget.id] || captureWidgetVariantContent(field.widget);
      const sourceWidget = draftWidgets.find((widget) => widget.id === field.widget.labelsSourceWidgetId && widget.type === "labels");
      const sourceContent = sourceWidget ? variant.widgetContents[sourceWidget.id] : null;
      const parsedCategories = parseCategoriesQuickEntry(
        values[index],
        sourceContent?.labelItems ?? sourceWidget?.labelItems ?? [],
        content.categoryItems ?? field.widget.categoryItems
      );
      if (!parsedCategories.error) content.categoryItems = parsedCategories.items;
      variant.widgetContents[field.widget.id] = content;
    });
    return variant;
  }

  function applyQuickEntryLines(fields, rows){
    const previousVariants = cloneValue(draftVariants);
    draftVariants = rows.map((values, index) => {
      const hasExistingVariant = Boolean(previousVariants[index]);
      const variant = buildVariantFromQuickEntry(
        fields,
        values,
        previousVariants[index] || previousVariants[0] || null
      );
      if (!hasExistingVariant) variant.id = createId("variant");
      return variant;
    });
    activeVariantIndex = clamp(activeVariantIndex, 0, draftVariants.length - 1);
    loadVariantContent(activeVariantIndex);
    editingWidgetId = "";
    editingChoiceId = "";
    selectedWidgetId = fields[0]?.widget?.id || selectedWidgetId;
    savedTextSelection = null;
    hideTextToolbar();
    markLayoutAsCustom();
    renderEditor();
  }

  function openQuickEntryOverlay(){
    if (!quickEntryDrawer) return;
    const editor = getActiveEditor();
    if (editor) finalizeEditorContent(editor);
    const fields = getQuickEntryFields();
    if (!fields.length) {
      window.alert("Ajoutez au moins un widget avant d’utiliser la saisie rapide.");
      return;
    }

    const example = fields.map((field) => field.token).join("|");
    const hasQcmField = fields.some((field) => field.widget.type === "qcm-text");
    const hasSelectionField = fields.some((field) => field.widget.type === "selection-words");
    const hasLabelsField = fields.some((field) => field.widget.type === "labels");
    const hasCategoriesField = fields.some((field) => field.widget.type === "categories");
    const overlay = quickEntryDrawer;
    overlay.classList.remove("is-open", "is-visible", "is-animating");
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <header class="quiz-workshop-quick-entry-drawer-header">
        <div class="quiz-workshop-quick-entry-heading">
          <div id="quizQuickEntryTitle" class="quiz-workshop-drawer-title">Saisie rapide</div>
          <p class="quiz-workshop-quick-entry-help">Une ligne de texte correspond à une question complète.</p>
        </div>
        <div class="quiz-workshop-quick-entry-header-actions">
          <button class="btn primary" type="button" data-action="confirm">Mettre à jour les variantes</button>
          <button class="quiz-workshop-drawer-close dashboard-material-icon-btn" type="button" data-action="cancel" aria-label="Fermer la saisie rapide" title="Fermer">
            <span class="dashboard-material-icon" aria-hidden="true">close</span>
          </button>
        </div>
      </header>
      <section class="quiz-workshop-quick-entry-content" role="dialog" aria-modal="true" aria-labelledby="quizQuickEntryTitle">
        <div class="quiz-workshop-quick-entry-format-row">
          <span class="quiz-workshop-quick-entry-format-label">Format attendu :</span>
          <div class="quiz-workshop-quick-entry-example">
            <code>${escapeHtml(example)}</code>
          </div>
          <div class="quiz-markup-help-wrap" data-quiz-quick-markup-help>
            <button
              class="quiz-markup-help-btn"
              type="button"
              data-quiz-quick-markup-help-toggle
              aria-label="Aide mise en forme"
              aria-expanded="false"
            >?</button>
            <div class="quiz-markup-help-popup" data-quiz-quick-markup-help-popup role="dialog" aria-label="Mise en forme" hidden>
              <div class="quiz-markup-help-title">Mise en forme</div>
              <div class="quiz-markup-help-list">
                <div><code>§</code><span>retour à la ligne</span></div>
                <div><code>*mot*</code><span>gras</span></div>
                <div><code>_mot_</code><span>italique</span></div>
                <div><code>°mot°</code><span>souligné</span></div>
                <div><code>\\r[mot]</code><span>rouge</span></div>
                <div><code>\\v[mot]</code><span>vert</span></div>
                <div><code>\\j[mot]</code><span>jaune</span></div>
                <div><code>\\b[mot]</code><span>bleu</span></div>
              </div>
            </div>
          </div>
          <div class="quiz-workshop-quick-entry-separator-hint">
            <span>Utilisez <kbd>|</kbd> comme séparateur (<kbd>Alt Gr</kbd> + <kbd>6</kbd> sur le clavier). Ou bien utilisez ce bouton :</span>
            <button class="btn quiz-workshop-insert-pipe-btn" type="button" data-action="insert-pipe">|</button>
          </div>
        </div>
        ${hasQcmField ? `
          <aside class="quiz-workshop-quick-entry-qcm-callout" aria-label="Consigne de saisie du QCM">
            <span class="dashboard-material-icon" aria-hidden="true">tips_and_updates</span>
            <span>QCM → Commencez par la bonne réponse, puis utilisez <kbd>;</kbd> pour séparer les propositions.</span>
          </aside>
        ` : ""}
        ${hasSelectionField ? `
          <aside class="quiz-workshop-quick-entry-qcm-callout" aria-label="Consigne de saisie de la sélection de mots">
            <span class="dashboard-material-icon" aria-hidden="true">touch_app</span>
            <span>Sélection → Entourez chaque mot ou groupe de mots attendu de crochets : <code>[Le] lion est mort [ce] soir.</code></span>
          </aside>
        ` : ""}
        ${hasLabelsField ? `
          <aside class="quiz-workshop-quick-entry-qcm-callout" aria-label="Consigne de saisie des étiquettes">
            <span class="dashboard-material-icon" aria-hidden="true">label</span>
            <span>Étiquettes → Séparez les étiquettes avec <kbd>;</kbd> : <code>chat;chien;rose;tulipe</code>.</span>
          </aside>
        ` : ""}
        ${hasCategoriesField ? `
          <aside class="quiz-workshop-quick-entry-qcm-callout" aria-label="Consigne de saisie des catégories">
            <span class="dashboard-material-icon" aria-hidden="true">category</span>
            <span>Catégories → Écrivez <code>Titre:1,2;Autre:3,4</code>. Les numéros correspondent à l’ordre des étiquettes de la source.</span>
          </aside>
        ` : ""}
        <div class="quiz-workshop-quick-entry-textarea-wrap">
          <textarea class="modal-text-input quiz-workshop-quick-entry-input" rows="10" autocomplete="off" spellcheck="true" placeholder="${escapeHtml(example)}"></textarea>
        </div>
        <div class="quiz-workshop-quick-markup-toolbar" data-quiz-quick-markup-toolbar role="toolbar" aria-label="Mise en forme de la saisie rapide" hidden>
          <button type="button" data-quick-wrap-prefix="*" data-quick-wrap-suffix="*" aria-label="Gras" title="Gras"><span class="dashboard-material-icon" aria-hidden="true">format_bold</span></button>
          <button type="button" data-quick-wrap-prefix="_" data-quick-wrap-suffix="_" aria-label="Italique" title="Italique"><span class="dashboard-material-icon" aria-hidden="true">format_italic</span></button>
          <button type="button" data-quick-wrap-prefix="°" data-quick-wrap-suffix="°" aria-label="Souligné" title="Souligné"><span class="dashboard-material-icon" aria-hidden="true">format_underlined</span></button>
          <span class="quiz-workshop-quick-markup-separator" aria-hidden="true"></span>
          <button type="button" class="is-color" data-quick-wrap-prefix="\\r[" data-quick-wrap-suffix="]" style="--quick-color:#d32f2f" aria-label="Rouge" title="Rouge"></button>
          <button type="button" class="is-color" data-quick-wrap-prefix="\\v[" data-quick-wrap-suffix="]" style="--quick-color:#2e7d32" aria-label="Vert" title="Vert"></button>
          <button type="button" class="is-color" data-quick-wrap-prefix="\\j[" data-quick-wrap-suffix="]" style="--quick-color:#d49a00" aria-label="Jaune" title="Jaune"></button>
          <button type="button" class="is-color" data-quick-wrap-prefix="\\b[" data-quick-wrap-suffix="]" style="--quick-color:#1565c0" aria-label="Bleu" title="Bleu"></button>
        </div>
        <div class="modal-message" aria-live="polite"></div>
      </section>
    `;
    const input = overlay.querySelector("textarea");
    const message = overlay.querySelector(".modal-message");
    const markupToolbar = overlay.querySelector("[data-quiz-quick-markup-toolbar]");
    const markupHelpWrap = overlay.querySelector("[data-quiz-quick-markup-help]");
    const markupHelpButton = overlay.querySelector("[data-quiz-quick-markup-help-toggle]");
    const markupHelpPopup = overlay.querySelector("[data-quiz-quick-markup-help-popup]");
    input.value = serializeQuickEntryVariants(fields);

    let quickEntryMotion = null;
    let isQuickEntryClosing = false;

    const runQuickEntryMotion = (open) => {
      if (!overlay.animate) return null;
      quickEntryMotion?.cancel?.();
      overlay.classList.add("is-animating");
      const motion = overlay.animate(open
        ? [{ transform:"translate3d(105%,0,0)" }, { transform:"translate3d(0,0,0)" }]
        : [{ transform:"translate3d(0,0,0)" }, { transform:"translate3d(105%,0,0)" }], {
        duration:open ? 450 : 400,
        easing:open ? "cubic-bezier(.22,1,.36,1)" : "cubic-bezier(.55,0,1,.45)",
        fill:"both"
      });
      quickEntryMotion = motion;
      motion.finished.then(() => {
        if (quickEntryMotion !== motion) return;
        overlay.classList.toggle("is-open", open);
        overlay.classList.remove("is-animating");
        quickEntryMotion = null;
        motion.cancel();
      }).catch(() => {});
      return motion;
    };

    const close = () => {
      if (isQuickEntryClosing) return;
      isQuickEntryClosing = true;
      markupToolbar.hidden = true;
      overlay.setAttribute("aria-hidden", "true");
      const finishClose = () => {
        overlay.classList.remove("is-open", "is-visible", "is-animating");
        overlay.innerHTML = "";
        quickEntryButton?.focus({ preventScroll:true });
      };
      const motion = runQuickEntryMotion(false);
      if (motion) motion.finished.then(finishClose).catch(() => {});
      else {
        overlay.classList.remove("is-open");
        window.setTimeout(finishClose, 400);
      }
    };

    const replaceSelection = (replacement, selectionStartOffset = replacement.length, selectionEndOffset = selectionStartOffset) => {
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? start;
      input.setRangeText(replacement, start, end, "end");
      const base = start;
      input.setSelectionRange(base + selectionStartOffset, base + selectionEndOffset);
      input.focus();
    };

    const setMarkupHelpOpen = (open) => {
      if (!markupHelpButton || !markupHelpPopup) return;
      markupHelpPopup.hidden = !open;
      markupHelpButton.setAttribute("aria-expanded", String(open));
    };

    const wrapSelection = (prefix, suffix) => {
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? start;
      const selected = input.value.slice(start, end);
      const before = input.value.slice(Math.max(0, start - prefix.length), start);
      const after = input.value.slice(end, end + suffix.length);
      if (selected && before === prefix && after === suffix) {
        input.setRangeText("", end, end + suffix.length, "end");
        input.setRangeText("", start - prefix.length, start, "end");
        input.setSelectionRange(start - prefix.length, end - prefix.length);
      } else {
        replaceSelection(`${prefix}${selected}${suffix}`, prefix.length, prefix.length + selected.length);
      }
      window.requestAnimationFrame(positionMarkupToolbar);
    };

    const positionMarkupToolbar = () => {
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? start;
      if (document.activeElement !== input || start === end) {
        markupToolbar.hidden = true;
        return;
      }
      markupToolbar.hidden = false;
      const startPoint = getTextareaCaretPoint(input, start);
      const endPoint = getTextareaCaretPoint(input, end);
      const toolbarRect = markupToolbar.getBoundingClientRect();
      const center = Math.abs(startPoint.top - endPoint.top) < startPoint.height
        ? (startPoint.left + endPoint.left) / 2
        : startPoint.left;
      const left = clamp(center - toolbarRect.width / 2, 8, window.innerWidth - toolbarRect.width - 8);
      let top = startPoint.top - toolbarRect.height - 8;
      if (top < 8) top = Math.min(window.innerHeight - toolbarRect.height - 8, startPoint.top + startPoint.height + 8);
      markupToolbar.style.left = `${Math.round(left)}px`;
      markupToolbar.style.top = `${Math.round(top)}px`;
    };

    const normalizeTabs = () => {
      if (!input.value.includes("\t")) return;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      const beforeStart = input.value.slice(0, start);
      const beforeEnd = input.value.slice(0, end);
      input.value = input.value.replace(/\t/g, "|");
      input.setSelectionRange(beforeStart.replace(/\t/g, "|").length, beforeEnd.replace(/\t/g, "|").length);
    };

    const submit = () => {
      normalizeTabs();
      const rawLines = String(input.value ?? "").replace(/\r\n?/g, "\n").split("\n");
      while (rawLines.length && !rawLines.at(-1).trim()) rawLines.pop();
      const lines = rawLines.filter((line) => line.trim().length > 0);
      if (!lines.length) {
        message.textContent = "Saisissez au moins une variante.";
        message.classList.add("is-error");
        input.focus();
        return;
      }
      const rows = [];
      for (let index = 0; index < lines.length; index += 1) {
        const values = lines[index].split("|");
        if (values.length !== fields.length) {
          message.textContent = `Ligne ${index + 1} : ${fields.length} valeur${fields.length > 1 ? "s sont attendues" : " est attendue"}, mais ${values.length} ${values.length > 1 ? "ont été trouvées" : "a été trouvée"}.`;
          message.classList.add("is-error");
          input.focus();
          return;
        }
        for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
          if (fields[fieldIndex].widget.type !== "qcm-text") continue;
          const choices = String(values[fieldIndex] ?? "")
            .split(";")
            .map((value) => value.trim())
            .filter(Boolean);
          if (choices.length < QCM_MIN_CHOICES) {
            message.textContent = `Ligne ${index + 1} : le QCM doit contenir au moins une bonne réponse et un distracteur, séparés par « ; ».`;
            message.classList.add("is-error");
            input.focus();
            return;
          }
          if (choices.length > QCM_MAX_CHOICES) {
            message.textContent = `Ligne ${index + 1} : le QCM accepte au maximum ${QCM_MAX_CHOICES} propositions.`;
            message.classList.add("is-error");
            input.focus();
            return;
          }
        }
        for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
          if (fields[fieldIndex].widget.type !== "selection-words") continue;
          const parsedSelection = parseQuizSelectionQuickEntry(values[fieldIndex]);
          if (parsedSelection.error) {
            message.textContent = `Ligne ${index + 1} : ${parsedSelection.error}`;
            message.classList.add("is-error");
            input.focus();
            return;
          }
        }
        const parsedLabelsByWidgetId = new Map();
        for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
          const field = fields[fieldIndex];
          if (field.widget.type !== "labels") continue;
          const previousItems = draftVariants[index]?.widgetContents?.[field.widget.id]?.labelItems
            ?? draftVariants[0]?.widgetContents?.[field.widget.id]?.labelItems
            ?? field.widget.labelItems;
          const parsedLabels = parseLabelsQuickEntry(values[fieldIndex], previousItems);
          if (parsedLabels.error) {
            message.textContent = `Ligne ${index + 1} : ${parsedLabels.error}`;
            message.classList.add("is-error");
            input.focus();
            return;
          }
          parsedLabelsByWidgetId.set(field.widget.id, parsedLabels.items);
        }
        for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
          const field = fields[fieldIndex];
          if (field.widget.type !== "categories") continue;
          const sourceItems = parsedLabelsByWidgetId.get(field.widget.labelsSourceWidgetId);
          if (!sourceItems) {
            message.textContent = `Ligne ${index + 1} : le widget Catégories n’a pas de source Étiquettes valide.`;
            message.classList.add("is-error");
            input.focus();
            return;
          }
          const previousItems = draftVariants[index]?.widgetContents?.[field.widget.id]?.categoryItems
            ?? draftVariants[0]?.widgetContents?.[field.widget.id]?.categoryItems
            ?? field.widget.categoryItems;
          const parsedCategories = parseCategoriesQuickEntry(values[fieldIndex], sourceItems, previousItems);
          if (parsedCategories.error) {
            message.textContent = `Ligne ${index + 1} : ${parsedCategories.error}`;
            message.classList.add("is-error");
            input.focus();
            return;
          }
        }
        rows.push(values);
      }
      applyQuickEntryLines(fields, rows);
      close();
    };

    input.addEventListener("paste", (event) => {
      const pasted = event.clipboardData?.getData("text/plain");
      if (pasted == null || !pasted.includes("\t")) return;
      event.preventDefault();
      replaceSelection(pasted.replace(/\t/g, "|"));
    });
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Tab" || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      replaceSelection("|");
      markupToolbar.hidden = true;
    });
    input.addEventListener("input", () => {
      normalizeTabs();
      message.textContent = "";
      message.classList.remove("is-error");
      positionMarkupToolbar();
    });
    ["select", "mouseup", "keyup", "scroll"].forEach((eventName) => input.addEventListener(eventName, positionMarkupToolbar));

    markupToolbar.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) event.preventDefault();
    });
    markupToolbar.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      const inserted = button.dataset.quickInsert;
      if (inserted) {
        const end = input.selectionEnd ?? input.value.length;
        input.setSelectionRange(end, end);
        replaceSelection(inserted);
      } else {
        wrapSelection(String(button.dataset.quickWrapPrefix || ""), String(button.dataset.quickWrapSuffix || ""));
      }
    });

    overlay.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (!target.closest("[data-quiz-quick-markup-help]")) setMarkupHelpOpen(false);
      if (target.closest("[data-quiz-quick-markup-help-toggle]")) {
        setMarkupHelpOpen(markupHelpPopup?.hidden);
      } else if (target.closest('[data-action="cancel"]')) close();
      else if (event.target.closest('[data-action="confirm"]')) submit();
      else if (event.target.closest('[data-action="insert-pipe"]')) {
        replaceSelection("|");
        markupToolbar.hidden = true;
      }
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!markupHelpPopup?.hidden) setMarkupHelpOpen(false);
        else close();
      } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        submit();
      }
    });
    overlay.classList.add("is-visible");
    overlay.setAttribute("aria-hidden", "false");
    const focusInput = () => {
      if (isQuickEntryClosing) return;
      input.focus({ preventScroll:true });
      input.setSelectionRange(input.value.length, input.value.length);
    };
    // Même déroulé que le volet inférieur : le volet est déjà présent dans le
    // DOM, puis l'animation Web Animations API le fait entrer dans sa position.
    const openMotion = runQuickEntryMotion(true);
    if (openMotion) openMotion.finished.then(focusInput).catch(() => {});
    else {
      overlay.classList.add("is-open");
      window.setTimeout(focusInput, 460);
    }
  }

  function handleDrawerClick(event){
    const selectionToken = event.target.closest("[data-selection-token-index]");
    const selectionWidgetNode = selectionToken?.closest?.('[data-quiz-widget-id]');
    if (selectionToken && selectionWidgetNode && previewMode === "correction") {
      const widget = draftWidgets.find((entry) => entry.id === String(selectionWidgetNode.dataset.quizWidgetId || ""));
      if (widget?.type === "selection-words") {
        event.preventDefault();
        event.stopPropagation();
        const wordCount = getQuizSelectionWordCount(widget.questionText);
        const tokenIndex = Number(selectionToken.dataset.selectionTokenIndex);
        if (Number.isFinite(tokenIndex) && tokenIndex >= 0 && tokenIndex < wordCount) {
          const selected = new Set(normalizeQuizSelectionIndexes(widget.selectionExpectedTokenIndexes, wordCount));
          if (selected.has(tokenIndex)) selected.delete(tokenIndex);
          else selected.add(tokenIndex);
          widget.selectionExpectedTokenIndexes = normalizeQuizSelectionIndexes(Array.from(selected), wordCount);
          selectedWidgetId = widget.id;
          syncActiveVariantWidget(widget);
          markLayoutAsCustom();
          renderCanvas();
        }
        return;
      }
    }

    const addLabelButton = event.target.closest("[data-add-quiz-label]");
    if (addLabelButton) {
      event.preventDefault();
      event.stopPropagation();
      const widget = draftWidgets.find((entry) => entry.id === String(addLabelButton.dataset.addQuizLabel || "") && entry.type === "labels");
      if (!widget) return;
      const item = { id:createId("label"), text:"" };
      widget.labelItems = normalizeLabelItems(widget.labelItems);
      widget.labelItems.push(item);
      syncActiveVariantWidget(widget);
      markLayoutAsCustom();
      selectedWidgetId = widget.id;
      renderCanvas();
      window.requestAnimationFrame(() => {
        const editor = canvas?.querySelector(`[data-quiz-label-editor="${CSS.escape(widget.id)}"][data-quiz-label-id="${CSS.escape(item.id)}"]`);
        editor?.focus?.();
      });
      return;
    }

    const removeLabelButton = event.target.closest("[data-remove-quiz-label]");
    if (removeLabelButton) {
      event.preventDefault();
      event.stopPropagation();
      const widgetId = String(removeLabelButton.dataset.removeQuizLabel || "");
      const labelId = String(removeLabelButton.dataset.quizLabelId || "");
      const widget = draftWidgets.find((entry) => entry.id === widgetId && entry.type === "labels");
      if (!widget || !labelId) return;
      widget.labelItems = normalizeLabelItems(widget.labelItems).filter((item) => item.id !== labelId);
      syncActiveVariantWidget(widget);
      draftWidgets.filter((entry) => entry.type === "categories" && entry.labelsSourceWidgetId === widget.id).forEach((categoriesWidget) => {
        categoriesWidget.categoryItems = normalizeCategoryItems(categoriesWidget.categoryItems, { ensureDefault:true })
          .map((category) => ({ ...category, labelIds:category.labelIds.filter((id) => id !== labelId) }));
        syncActiveVariantWidget(categoriesWidget);
      });
      markLayoutAsCustom();
      renderCanvas();
      return;
    }

    const addCategoryButton = event.target.closest("[data-add-quiz-category]");
    if (addCategoryButton) {
      event.preventDefault();
      event.stopPropagation();
      const widget = draftWidgets.find((entry) => entry.id === String(addCategoryButton.dataset.addQuizCategory || "") && entry.type === "categories");
      if (!widget) return;
      widget.categoryItems = normalizeCategoryItems(widget.categoryItems, { ensureDefault:true });
      const category = { id:createId("category"), title:"", labelIds:[] };
      widget.categoryItems.push(category);
      syncActiveVariantWidget(widget);
      markLayoutAsCustom();
      selectedWidgetId = widget.id;
      renderCanvas();
      window.requestAnimationFrame(() => {
        const editor = canvas?.querySelector(`[data-quiz-category-title-editor="${CSS.escape(widget.id)}"][data-quiz-category-id="${CSS.escape(category.id)}"]`);
        editor?.focus?.();
        if (editor) document.getSelection()?.selectAllChildren?.(editor);
      });
      return;
    }

    const removeCategoryButton = event.target.closest("[data-remove-quiz-category]");
    if (removeCategoryButton) {
      event.preventDefault();
      event.stopPropagation();
      const widget = draftWidgets.find((entry) => entry.id === String(removeCategoryButton.dataset.removeQuizCategory || "") && entry.type === "categories");
      const categoryId = String(removeCategoryButton.dataset.quizCategoryId || "");
      if (!widget || !categoryId) return;
      const categories = normalizeCategoryItems(widget.categoryItems, { ensureDefault:true });
      if (categories.length <= 2) return;
      widget.categoryItems = categories.filter((category) => category.id !== categoryId);
      syncActiveVariantWidget(widget);
      markLayoutAsCustom();
      renderCanvas();
      return;
    }

    const formatButton = event.target.closest("[data-quiz-format-command]");
    if (formatButton) {
      applyTextCommand(String(formatButton.dataset.quizFormatCommand || ""));
      return;
    }

    const fontSizeButton = event.target.closest("[data-quiz-font-size]");
    if (fontSizeButton) {
      applyFontSize(String(fontSizeButton.dataset.quizFontSize || ""));
      setFontSizeMenuOpen(false);
      return;
    }

    const fontSizeToggleButton = event.target.closest("[data-quiz-font-size-toggle]");
    if (fontSizeToggleButton) {
      setFontSizeMenuOpen(Boolean(fontSizeMenu?.hidden));
      return;
    }

    const colorButton = event.target.closest("[data-quiz-text-color]");
    if (colorButton) {
      applyTextCommand("foreColor", String(colorButton.dataset.quizTextColor || ""));
      setColorMenuOpen(false);
      return;
    }

    const colorToggleButton = event.target.closest("[data-quiz-color-toggle]");
    if (colorToggleButton) {
      setColorMenuOpen(Boolean(colorMenu?.hidden));
      return;
    }

    const alignmentButton = event.target.closest("[data-quiz-text-align]");
    if (alignmentButton) {
      applyTextAlignment(String(alignmentButton.dataset.quizTextAlign || "center"));
      return;
    }

    const verticalAlignmentButton = event.target.closest("[data-quiz-vertical-align]");
    if (verticalAlignmentButton) {
      applyVerticalAlignment(String(verticalAlignmentButton.dataset.quizVerticalAlign || "middle"));
      return;
    }

    const chooseResourceImageButton = event.target.closest("[data-choose-quiz-image-resource]");
    if (chooseResourceImageButton) {
      event.stopPropagation();
      void chooseResourceImage(String(chooseResourceImageButton.dataset.chooseQuizImageResource || ""));
      return;
    }

    const uploadImageButton = event.target.closest("[data-upload-quiz-image]");
    if (uploadImageButton) {
      event.stopPropagation();
      chooseImportedImage(String(uploadImageButton.dataset.uploadQuizImage || ""));
      return;
    }

    const removeImageButton = event.target.closest("[data-remove-quiz-image]");
    if (removeImageButton) {
      event.stopPropagation();
      removeWidgetImageSource(String(removeImageButton.dataset.removeQuizImage || ""));
      return;
    }

    const chooseResourceAudioButton = event.target.closest("[data-choose-quiz-audio-resource]");
    if (chooseResourceAudioButton) {
      event.stopPropagation();
      void chooseResourceAudio(String(chooseResourceAudioButton.dataset.chooseQuizAudioResource || ""));
      return;
    }

    const importAudioButton = event.target.closest("[data-upload-quiz-audio]");
    if (importAudioButton) {
      event.stopPropagation();
      chooseImportedAudio(String(importAudioButton.dataset.uploadQuizAudio || ""));
      return;
    }

    const removeAudioButton = event.target.closest("[data-remove-quiz-audio]");
    if (removeAudioButton) {
      event.stopPropagation();
      removeWidgetAudioSource(String(removeAudioButton.dataset.removeQuizAudio || ""));
      return;
    }

    const openAudioRecorderButton = event.target.closest("[data-open-quiz-audio-recorder]");
    if (openAudioRecorderButton) {
      event.stopPropagation();
      void recordAudioResource(String(openAudioRecorderButton.dataset.openQuizAudioRecorder || ""));
      return;
    }

    const audioPreviewButton = event.target.closest("[data-toggle-quiz-audio-preview]");
    if (audioPreviewButton) {
      event.stopPropagation();
      const widgetId = String(audioPreviewButton.dataset.toggleQuizAudioPreview || "");
      const widget = draftWidgets.find((entry) => entry.id === widgetId);
      const source = widget ? normalizeQuizAudioSource(getWidgetView(widget, previewMode).audioSource) : null;
      if (!source) return;
      const host = audioPreviewButton.closest(".quiz-workshop-audio-content");
      const audio = host?.querySelector(".quiz-workshop-audio-element");
      if (!audio?.src) return;
      if (audio.paused) {
        stopWorkshopAudio(audio);
        void audio.play().catch(() => {});
      } else {
        audio.pause();
      }
      return;
    }

    const qcmLayoutButton = event.target.closest("[data-qcm-layout]");
    if (qcmLayoutButton) {
      event.stopPropagation();
      const widget = draftWidgets.find((entry) => entry.id === String(qcmLayoutButton.dataset.qcmWidgetId || ""));
      if (widget?.type === "qcm-text") {
        widget.qcmLayout = normalizeQcmLayout(qcmLayoutButton.dataset.qcmLayout);
        syncActiveVariantWidget(widget);
        markLayoutAsCustom();
        renderCanvas();
      }
      return;
    }

    const qcmCorrectButton = event.target.closest("[data-set-qcm-correct]");
    if (qcmCorrectButton) {
      event.stopPropagation();
      const widget = draftWidgets.find((entry) => entry.id === String(qcmCorrectButton.dataset.setQcmCorrect || ""));
      const choiceId = String(qcmCorrectButton.dataset.qcmChoiceId || "");
      if (widget?.type === "qcm-text") {
        widget.qcmChoices.forEach((choice) => { choice.isCorrect = choice.id === choiceId; });
        syncActiveVariantWidget(widget);
        markLayoutAsCustom();
        selectedWidgetId = widget.id;
        renderCanvas();
      }
      return;
    }

    const qcmAddButton = event.target.closest("[data-add-qcm-choice]");
    if (qcmAddButton) {
      event.stopPropagation();
      const widget = draftWidgets.find((entry) => entry.id === String(qcmAddButton.dataset.addQcmChoice || ""));
      if (widget?.type === "qcm-text" && widget.qcmChoices.length < QCM_MAX_CHOICES) {
        const choice = createQcmChoice({ isCorrect:false }, widget.qcmChoices.length);
        widget.qcmChoices.push(choice);
        syncActiveVariantWidget(widget);
        markLayoutAsCustom();
        selectedWidgetId = widget.id;
        editingWidgetId = widget.id;
        editingChoiceId = choice.id;
        renderCanvas();
        window.requestAnimationFrame(() => focusEditorAtEnd(widget.id, choice.id));
      }
      return;
    }

    const qcmRemoveButton = event.target.closest("[data-remove-qcm-choice]");
    if (qcmRemoveButton) {
      event.stopPropagation();
      const widget = draftWidgets.find((entry) => entry.id === String(qcmRemoveButton.dataset.removeQcmChoice || ""));
      const choiceId = String(qcmRemoveButton.dataset.qcmChoiceId || "");
      if (widget?.type === "qcm-text" && widget.qcmChoices.length > QCM_MIN_CHOICES) {
        const wasCorrect = widget.qcmChoices.find((choice) => choice.id === choiceId)?.isCorrect;
        widget.qcmChoices = widget.qcmChoices.filter((choice) => choice.id !== choiceId);
        if (wasCorrect && widget.qcmChoices[0]) widget.qcmChoices[0].isCorrect = true;
        widget.qcmChoices.forEach((choice, index) => {
          if (index > 0 && wasCorrect) choice.isCorrect = false;
        });
        if (editingChoiceId === choiceId) {
          editingWidgetId = "";
          editingChoiceId = "";
          hideTextToolbar();
        }
        syncActiveVariantWidget(widget);
        markLayoutAsCustom();
        selectedWidgetId = widget.id;
        renderCanvas();
      }
      return;
    }

    const tab = event.target.closest("[data-quiz-library-tab]");
    if (tab) {
      activeLibraryTab = String(tab.dataset.quizLibraryTab || "models");
      renderLibrary();
      return;
    }

    const quickEntryAction = event.target.closest("[data-quiz-quick-entry]");
    if (quickEntryAction) {
      openQuickEntryOverlay();
      return;
    }

    const variantButton = event.target.closest("[data-quiz-variant-step]");
    if (variantButton) {
      changeVariant(Number(variantButton.dataset.quizVariantStep || 0));
      return;
    }

    const modeButton = event.target.closest("[data-quiz-preview-mode]");
    if (modeButton) {
      previewMode = String(modeButton.dataset.quizPreviewMode || "question");
      editingWidgetId = "";
      editingChoiceId = "";
      savedTextSelection = null;
      hideTextToolbar();
      renderCanvas();
      return;
    }

    const modelTile = event.target.closest("[data-quiz-model-id]");
    if (modelTile) {
      setDraftFromModel(String(modelTile.dataset.quizModelId || "free-layout"));
      return;
    }

    const elementTile = event.target.closest("[data-quiz-element-id]");
    if (elementTile) {
      addWidget(String(elementTile.dataset.quizElementId || "text"));
      return;
    }

    const visibilityButton = event.target.closest("[data-toggle-quiz-widget-visibility]");
    if (visibilityButton) {
      event.stopPropagation();
      toggleWidgetVisibility(String(visibilityButton.dataset.toggleQuizWidgetVisibility || ""));
      return;
    }

    const removeButton = event.target.closest("[data-remove-quiz-widget]");
    if (removeButton) {
      event.stopPropagation();
      removeWidget(String(removeButton.dataset.removeQuizWidget || ""));
      return;
    }

    const widgetNode = event.target.closest("[data-quiz-widget-id]");
    if (widgetNode && !event.target.closest("[data-quiz-widget-editor-id], [data-quiz-label-editor], [data-quiz-category-title-editor], select")) {
      editingWidgetId = "";
      editingChoiceId = "";
      hideTextToolbar();
      selectWidget(String(widgetNode.dataset.quizWidgetId || ""));
      return;
    }

    if (!event.target.closest("[data-quiz-text-toolbar]")) {
      setColorMenuOpen(false);
      setFontSizeMenuOpen(false);
    }
  }

  function handleDrawerInput(event){
    const labelsSourceSelect = event.target.closest("[data-quiz-categories-source]");
    if (labelsSourceSelect) {
      const widget = draftWidgets.find((entry) => entry.id === String(labelsSourceSelect.dataset.quizCategoriesSource || "") && entry.type === "categories");
      if (!widget) return;
      const nextSourceId = String(labelsSourceSelect.value || "");
      if (widget.labelsSourceWidgetId === nextSourceId) return;
      widget.labelsSourceWidgetId = nextSourceId;
      widget.categoryItems = normalizeCategoryItems(widget.categoryItems, { ensureDefault:true })
        .map((category) => ({ ...category, labelIds:[] }));
      draftVariants.forEach((variant) => {
        const content = variant.widgetContents?.[widget.id];
        if (!content) return;
        content.categoryItems = normalizeCategoryItems(content.categoryItems, { ensureDefault:true })
          .map((category) => ({ ...category, labelIds:[] }));
      });
      syncActiveVariantWidget(widget);
      markLayoutAsCustom();
      renderCanvas();
      return;
    }

    const labelEditor = event.target.closest("[data-quiz-label-editor]");
    if (labelEditor) {
      const widget = draftWidgets.find((entry) => entry.id === String(labelEditor.dataset.quizLabelEditor || "") && entry.type === "labels");
      const labelId = String(labelEditor.dataset.quizLabelId || "");
      const item = widget?.labelItems?.find?.((entry) => entry.id === labelId);
      if (!widget || !item) return;
      item.text = String(labelEditor.textContent || "").replace(/\r?\n/g, " ");
      labelEditor.classList.toggle("is-empty", !item.text);
      syncActiveVariantWidget(widget);
      markLayoutAsCustom();
      return;
    }

    const categoryTitleEditor = event.target.closest("[data-quiz-category-title-editor]");
    if (categoryTitleEditor) {
      const widget = draftWidgets.find((entry) => entry.id === String(categoryTitleEditor.dataset.quizCategoryTitleEditor || "") && entry.type === "categories");
      const categoryId = String(categoryTitleEditor.dataset.quizCategoryId || "");
      const category = widget?.categoryItems?.find?.((entry) => entry.id === categoryId);
      if (!widget || !category) return;
      category.title = String(categoryTitleEditor.textContent || "").replace(/\r?\n/g, " ");
      categoryTitleEditor.classList.toggle("is-empty", !category.title);
      syncActiveVariantWidget(widget);
      markLayoutAsCustom();
      return;
    }

    const audioSeek = event.target.closest("[data-quiz-audio-seek]");
    if (audioSeek) {
      const host = audioSeek.closest(".quiz-workshop-audio-content");
      const audio = host?.querySelector(".quiz-workshop-audio-element");
      const widgetNode = audioSeek.closest("[data-quiz-widget-id]");
      const widget = draftWidgets.find((entry) => entry.id === String(widgetNode?.dataset.quizWidgetId || ""));
      const fallbackDuration = widget ? Number(getWidgetView(widget, previewMode).audioSource?.duration) || 0 : 0;
      const duration = Number.isFinite(audio?.duration) && audio.duration > 0 ? audio.duration : fallbackDuration;
      if (audio && duration > 0) {
        audio.currentTime = (Number(audioSeek.value) / 100) * duration;
      }
      return;
    }
    const editor = event.target.closest("[data-quiz-widget-editor-id]");
    if (!editor) return;
    syncWidgetFromEditor(editor);
    updateEditorEmptyState(editor);
  }

  function handleDrawerFocusIn(event){
    const editor = event.target.closest("[data-quiz-widget-editor-id]");
    if (!editor) return;
    const widgetId = String(editor.dataset.quizWidgetEditorId || "");
    if (!widgetId) return;

    selectedWidgetId = widgetId;
    editingWidgetId = widgetId;
    editingChoiceId = String(editor.dataset.quizQcmChoiceId || "");
    const editorWasEmpty = updateEditorEmptyState(editor);
    canvas?.querySelectorAll("[data-quiz-widget-id]").forEach((node) => {
      const isCurrent = node.dataset.quizWidgetId === widgetId;
      node.classList.toggle("is-selected", isCurrent);
      node.classList.toggle("is-editing", isCurrent);
    });
    setColorMenuOpen(false);
    setFontSizeMenuOpen(false);
    window.requestAnimationFrame(() => {
      if (editorWasEmpty) placeCaretAtEnd(editor);
      else saveCurrentSelection();
      showTextToolbar();
      updateToolbarState();
    });
  }

  function handleDrawerFocusOut(){
    window.setTimeout(() => {
      const active = document.activeElement;
      if (active?.closest?.("[data-quiz-widget-editor-id]") || active?.closest?.("[data-quiz-text-toolbar]")) return;
      const editor = getActiveEditor();
      if (editor) finalizeEditorContent(editor);
      editingWidgetId = "";
      editingChoiceId = "";
      savedTextSelection = null;
      canvas?.querySelectorAll(".quiz-workshop-canvas-widget.is-editing").forEach((node) => node.classList.remove("is-editing"));
      hideTextToolbar();
    }, 0);
  }

  function handleDrawerDragStart(event){
    const labelChip = event.target.closest("[data-quiz-category-label-chip]");
    if (labelChip) {
      const labelId = String(labelChip.dataset.quizCategoryLabelChip || "");
      const sourceWidgetId = String(labelChip.dataset.quizCategoryLabelSource || "");
      if (!labelId || !sourceWidgetId) return;
      event.dataTransfer?.setData("text/plain", `quiz-label:${sourceWidgetId}:${labelId}`);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      return;
    }
    const element = event.target.closest("[data-quiz-element-id]");
    if (!element) return;
    event.dataTransfer?.setData("text/plain", `element:${String(element.dataset.quizElementId || "text")}`);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
  }

  function handleCanvasDragOver(event){
    const transfer = event.dataTransfer?.getData("text/plain") || "";
    const categoryDrop = event.target.closest?.("[data-quiz-category-drop-widget]");
    if (categoryDrop || transfer.startsWith("quiz-label:")) {
      event.preventDefault();
      canvas?.querySelectorAll("[data-quiz-category-drop-widget].is-drop-target").forEach((node) => node.classList.remove("is-drop-target"));
      categoryDrop?.classList?.add("is-drop-target");
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      return;
    }
    event.preventDefault();
    canvas?.classList.add("is-drag-over");
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  }

  function handleCanvasDragLeave(event){
    if (!canvas?.contains(event.relatedTarget)) {
      canvas?.querySelectorAll("[data-quiz-category-drop-widget].is-drop-target").forEach((node) => node.classList.remove("is-drop-target"));
    }
    if (!canvas?.contains(event.relatedTarget)) canvas?.classList.remove("is-drag-over");
  }

  function handleCanvasDrop(event){
    event.preventDefault();
    canvas?.classList.remove("is-drag-over");
    canvas?.querySelectorAll("[data-quiz-category-drop-widget].is-drop-target").forEach((node) => node.classList.remove("is-drop-target"));
    const transfer = event.dataTransfer?.getData("text/plain") || "";
    if (transfer.startsWith("quiz-label:")) {
      const [, sourceWidgetId = "", labelId = ""] = transfer.split(":");
      const dropZone = event.target.closest?.("[data-quiz-category-drop-widget]");
      if (!dropZone) return;
      const widget = draftWidgets.find((entry) => entry.id === String(dropZone.dataset.quizCategoryDropWidget || "") && entry.type === "categories");
      if (!widget || widget.labelsSourceWidgetId !== sourceWidgetId) return;
      const categoryId = String(dropZone.dataset.quizCategoryDropId || "");
      widget.categoryItems = normalizeCategoryItems(widget.categoryItems, { ensureDefault:true }).map((category) => ({
        ...category,
        labelIds:category.labelIds.filter((id) => id !== labelId)
      }));
      if (categoryId) {
        const target = widget.categoryItems.find((category) => category.id === categoryId);
        if (target && !target.labelIds.includes(labelId)) target.labelIds.push(labelId);
      }
      syncActiveVariantWidget(widget);
      markLayoutAsCustom();
      selectedWidgetId = widget.id;
      renderCanvas();
      return;
    }
    if (!transfer.startsWith("element:")) return;
    const elementType = transfer.slice("element:".length) || "text";
    const cell = getCanvasCell(event);
    addWidget(elementType, { column: cell.column, row: cell.row });
  }

  function handleWidgetPointerDown(event){
    const resizeHandle = event.target.closest("[data-resize-quiz-widget]");
    const moveHandle = event.target.closest("[data-move-quiz-widget]");
    const handle = resizeHandle || moveHandle;
    if (!handle || !canvas) return;

    const widgetId = String(resizeHandle?.dataset.resizeQuizWidget || moveHandle?.dataset.moveQuizWidget || "");
    const widget = draftWidgets.find((entry) => entry.id === widgetId);
    if (!widget) return;
    const widgetView = getWidgetView(widget, previewMode);

    event.preventDefault();
    event.stopPropagation();
    getActiveEditor()?.blur();
    selectedWidgetId = widgetId;
    editingWidgetId = "";
    editingChoiceId = "";
    savedTextSelection = null;
    hideTextToolbar();

    const rect = canvas.getBoundingClientRect();
    interactionState = {
      type: resizeHandle ? "resize" : "move",
      widgetId,
      startX: event.clientX,
      startY: event.clientY,
      startColumn: widgetView.column,
      startRow: widgetView.row,
      startColumnSpan: widgetView.columnSpan,
      startRowSpan: widgetView.rowSpan,
      cellWidth: rect.width / GRID_COLUMNS,
      cellHeight: rect.height / GRID_ROWS
    };

    document.body.classList.add(resizeHandle ? "quiz-workshop-is-resizing" : "quiz-workshop-is-moving");
    renderCanvas();
  }

  function handleWidgetPointerMove(event){
    if (!interactionState) return;
    const widget = draftWidgets.find((entry) => entry.id === interactionState.widgetId);
    if (!widget) return;
    const currentView = getWidgetView(widget, previewMode);

    const columnDelta = Math.round((event.clientX - interactionState.startX) / interactionState.cellWidth);
    const rowDelta = Math.round((event.clientY - interactionState.startY) / interactionState.cellHeight);
    let candidate;

    if (interactionState.type === "resize") {
      const minimumGridSize = getWidgetMinimumGridSize(widget.type);
      candidate = {
        ...currentView,
        columnSpan: clamp(interactionState.startColumnSpan + columnDelta, minimumGridSize.columnSpan, GRID_COLUMNS - currentView.column + 1),
        rowSpan: clamp(interactionState.startRowSpan + rowDelta, minimumGridSize.rowSpan, GRID_ROWS - currentView.row + 1)
      };
    } else {
      candidate = {
        ...currentView,
        column: clamp(interactionState.startColumn + columnDelta, 1, GRID_COLUMNS - currentView.columnSpan + 1),
        row: clamp(interactionState.startRow + rowDelta, 1, GRID_ROWS - currentView.rowSpan + 1)
      };
    }

    if (!canPlaceWidget(widget.id, candidate)) return;
    const unchanged = interactionState.type === "resize"
      ? candidate.columnSpan === currentView.columnSpan && candidate.rowSpan === currentView.rowSpan
      : candidate.column === currentView.column && candidate.row === currentView.row;
    if (unchanged) return;

    if (interactionState.type === "resize") {
      if (previewMode === "correction") {
        detachCorrectionProperty(widget, "size");
        widget.correctionColumnSpan = candidate.columnSpan;
        widget.correctionRowSpan = candidate.rowSpan;
      } else {
        widget.columnSpan = candidate.columnSpan;
        widget.rowSpan = candidate.rowSpan;
      }
    } else if (previewMode === "correction") {
      detachCorrectionProperty(widget, "position");
      widget.correctionColumn = candidate.column;
      widget.correctionRow = candidate.row;
    } else {
      widget.column = candidate.column;
      widget.row = candidate.row;
    }

    markLayoutAsCustom();
    renderCanvas();
  }

  function handleWidgetPointerUp(){
    if (!interactionState) return;
    interactionState = null;
    document.body.classList.remove("quiz-workshop-is-resizing", "quiz-workshop-is-moving");
    renderEditor();
  }

  function syncWidgetFromEditor(editor){
    const widgetId = String(editor.dataset.quizWidgetEditorId || "");
    const widget = draftWidgets.find((entry) => entry.id === widgetId);
    if (!widget) return;
    const parsed = richHtmlToModel(editor.innerHTML);

    const qcmChoiceId = String(editor.dataset.quizQcmChoiceId || "");
    if (widget.type === "qcm-text" && qcmChoiceId) {
      const choice = widget.qcmChoices.find((entry) => entry.id === qcmChoiceId);
      if (!choice) return;
      choice.text = parsed.text;
      choice.formatting = parsed.formatting;
      syncActiveVariantWidget(widget);
      markLayoutAsCustom();
      return;
    }

    if (previewMode === "correction") {
      const current = getWidgetView(widget, "correction");
      if (parsed.text !== current.text) {
        detachCorrectionProperty(widget, "text");
        widget.correctionText = parsed.text;
      }
      if (getFormattingSignature(parsed.formatting, parsed.text.length) !== getFormattingSignature(current.formatting, current.text.length)) {
        detachCorrectionProperty(widget, "formatting");
        widget.correctionFormatting = parsed.formatting;
      }
      widget.correctionHtml = richTextModelToHtml(widget.correctionText, widget.correctionFormatting);
    } else {
      const previousExpectedText = widget.type === "selection-words"
        ? formatQuizSelectionIndexes(widget.questionText, widget.selectionExpectedTokenIndexes)
        : "";
      widget.questionText = parsed.text;
      widget.questionFormatting = parsed.formatting;
      widget.questionHtml = richTextModelToHtml(widget.questionText, widget.questionFormatting);
      if (widget.type === "selection-words") {
        widget.selectionExpectedTokenIndexes = previousExpectedText
          ? findQuizSelectionIndexesFromText(widget.questionText, previousExpectedText)
          : [];
        widget.correctionText = widget.questionText;
        widget.correctionFormatting = cloneValue(widget.questionFormatting);
        widget.correctionHtml = widget.questionHtml;
        widget.correctionOverrides.text = false;
        widget.correctionOverrides.formatting = false;
      }
    }
    syncActiveVariantWidget(widget);
    markLayoutAsCustom();
  }

  function finalizeEditorContent(editor){
    const widgetId = String(editor.dataset.quizWidgetEditorId || "");
    const widget = draftWidgets.find((entry) => entry.id === widgetId);
    if (!widget) return;
    syncWidgetFromEditor(editor);
    if (widget.type === "qcm-text") {
      const choiceId = String(editor.dataset.quizQcmChoiceId || "");
      const choice = widget.qcmChoices.find((entry) => entry.id === choiceId);
      if (choice) {
        const expectedHtml = richTextModelToHtml(choice.text, choice.formatting);
        if (editor.innerHTML !== expectedHtml) editor.innerHTML = expectedHtml || "<br>";
      }
      return;
    }
    const view = getWidgetView(widget, previewMode);
    if (editor.innerHTML !== view.html) editor.innerHTML = view.html;
  }

  function updateEditorEmptyState(editor){
    if (!editor) return false;
    const isEmpty = richHtmlToModel(editor.innerHTML).text.length === 0;
    editor.classList.toggle("is-empty", isEmpty);
    if (isEmpty && !editor.querySelector("br")) editor.innerHTML = "<br>";
    return isEmpty;
  }

  function placeCaretAtEnd(editor){
    if (!editor) return;
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    saveCurrentSelection();
  }

  function focusEditorAtEnd(widgetId, choiceId = ""){
    const choiceSelector = choiceId ? `[data-quiz-qcm-choice-id="${CSS.escape(choiceId)}"]` : "";
    const editor = canvas?.querySelector(`[data-quiz-widget-editor-id="${CSS.escape(widgetId)}"]${choiceSelector}`);
    if (!editor) return;
    editor.focus({ preventScroll:true });
    updateEditorEmptyState(editor);
    placeCaretAtEnd(editor);
  }

  function saveCurrentSelection(){
    const editor = getActiveEditor();
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    savedTextSelection = range.cloneRange();
    updateToolbarState();
  }

  function restoreCurrentSelection(){
    const editor = getActiveEditor();
    if (!editor) return false;
    editor.focus({ preventScroll: true });
    if (!savedTextSelection) return true;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(savedTextSelection);
    return true;
  }

  function applyTextCommand(command, value = null){
    const editor = getActiveEditor();
    if (!editor || !command) return;
    restoreCurrentSelection();
    try {
      document.execCommand("styleWithCSS", false, true);
      document.execCommand(command, false, value);
    } catch (error) {
      console.warn("Impossible d’appliquer la mise en forme du texte.", error);
    }
    syncWidgetFromEditor(editor);
    saveCurrentSelection();
    updateToolbarState();
  }

  function applyFontSize(value){
    const widget = getEditingWidget();
    const normalized = normalizeQuizFontSize(value);
    if (!widget) return;
    if (previewMode === "correction") {
      detachCorrectionProperty(widget, "fontSize");
      widget.correctionFontSize = normalized;
    } else {
      widget.fontSize = normalized;
    }
    markLayoutAsCustom();
    const widgetNode = canvas?.querySelector(`[data-quiz-widget-id="${CSS.escape(widget.id)}"]`);
    widgetNode?.style.setProperty("--quiz-widget-font-size", `var(--quiz-editor-font-${normalized})`);
    updateToolbarState();
    restoreCurrentSelection();
  }

  function applyTextAlignment(value){
    const widget = getEditingWidget();
    if (!widget || !["left", "center", "right"].includes(value)) return;
    if (previewMode === "correction") {
      detachCorrectionProperty(widget, "textAlign");
      widget.correctionTextAlign = value;
    } else {
      widget.textAlign = value;
    }
    markLayoutAsCustom();
    const widgetNode = canvas?.querySelector(`[data-quiz-widget-id="${CSS.escape(widget.id)}"]`);
    if (widgetNode) {
      const horizontal = value === "left" ? "flex-start" : value === "right" ? "flex-end" : "center";
      widgetNode.style.setProperty("--quiz-widget-horizontal", horizontal);
      widgetNode.style.setProperty("--quiz-widget-text-align", value);
    }
    updateToolbarState();
    restoreCurrentSelection();
  }

  function applyVerticalAlignment(value){
    const widget = getEditingWidget();
    if (!widget || !["top", "middle", "bottom"].includes(value)) return;
    if (previewMode === "correction") {
      detachCorrectionProperty(widget, "verticalAlign");
      widget.correctionVerticalAlign = value;
    } else {
      widget.verticalAlign = value;
    }
    markLayoutAsCustom();
    const widgetNode = canvas?.querySelector(`[data-quiz-widget-id="${CSS.escape(widget.id)}"]`);
    if (widgetNode) {
      const vertical = value === "top" ? "flex-start" : value === "bottom" ? "flex-end" : "center";
      widgetNode.style.setProperty("--quiz-widget-vertical", vertical);
    }
    updateToolbarState();
    restoreCurrentSelection();
  }

  function toggleWidgetVisibility(widgetId){
    const widget = draftWidgets.find((entry) => entry.id === widgetId);
    if (!widget) return;
    const currentView = getWidgetView(widget, previewMode);
    if (previewMode === "correction") {
      const currentMode = normalizeCorrectionVisibility(currentView.visibilityMode, "visible");
      detachCorrectionProperty(widget, "visibility");
      const currentIndex = CORRECTION_VISIBILITY_STATES.indexOf(currentMode);
      const nextMode = CORRECTION_VISIBILITY_STATES[(currentIndex + 1) % CORRECTION_VISIBILITY_STATES.length];
      widget.correctionVisibility = nextMode;
      widget.correctionVisible = nextMode !== "hidden";
    } else {
      widget.questionVisible = !currentView.visible;
    }
    markLayoutAsCustom();
    renderCanvas();
  }

  function updateToolbarState(){
    if (!textToolbar || textToolbar.hidden) return;
    ["bold", "italic", "underline"].forEach((command) => {
      let active = false;
      try { active = document.queryCommandState(command); } catch {}
      const button = textToolbar.querySelector(`[data-quiz-format-command="${command}"]`);
      button?.classList.toggle("is-active", active);
      button?.setAttribute("aria-pressed", active ? "true" : "false");
    });
    const widget = getEditingWidget();
    const widgetView = widget ? getWidgetView(widget, previewMode) : null;
    const fontSize = normalizeQuizFontSize(widgetView?.fontSize);
    textToolbar.querySelectorAll("[data-quiz-font-size]").forEach((button) => {
      const active = button.dataset.quizFontSize === fontSize;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-checked", active ? "true" : "false");
    });
    textToolbar.querySelectorAll("[data-quiz-text-align]").forEach((button) => {
      const active = button.dataset.quizTextAlign === widgetView?.textAlign;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    textToolbar.querySelectorAll("[data-quiz-vertical-align]").forEach((button) => {
      const active = button.dataset.quizVerticalAlign === widgetView?.verticalAlign;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function positionTextToolbar(){
    if (!textToolbar || textToolbar.hidden) return;
    const widgetNode = canvas?.querySelector(`[data-quiz-widget-id="${CSS.escape(editingWidgetId)}"]`);
    if (!widgetNode) {
      hideTextToolbar();
      return;
    }

    const activeEditor = getActiveEditor();
    const anchorNode = editingChoiceId ? activeEditor?.closest("[data-qcm-choice-shell]") : widgetNode;
    const rect = (anchorNode || widgetNode).getBoundingClientRect();
    const toolbarRect = textToolbar.getBoundingClientRect();
    const host = textToolbar.offsetParent;
    const hostRect = host?.getBoundingClientRect();
    const topbarRect = canvasTopbar?.getBoundingClientRect();
    if (!hostRect || !topbarRect) return;

    const edgeGap = 5;
    const minInset = 8;
    const laneTop = topbarRect.top - hostRect.top + 4;
    const idealTop = rect.top - hostRect.top - toolbarRect.height - edgeGap;

    // La barre peut utiliser la bande supérieure du canevas. Elle reste au-
    // dessus du widget, y compris sur la première ligne.
    const top = Math.max(laneTop, idealTop);

    const idealLeft = rect.left - hostRect.left + (rect.width - toolbarRect.width) / 2;
    const maxLeft = Math.max(minInset, hostRect.width - toolbarRect.width - minInset);
    const left = clamp(idealLeft, minInset, maxLeft);

    textToolbar.style.left = `${Math.round(left)}px`;
    textToolbar.style.top = `${Math.round(top)}px`;
  }

  function showTextToolbar(){
    if (!textToolbar || !editingWidgetId || !getActiveEditor()) return;
    textToolbar.hidden = false;
    window.requestAnimationFrame(() => {
      positionTextToolbar();
      updateToolbarState();
    });
  }

  function hideTextToolbar(){
    if (!textToolbar) return;
    textToolbar.hidden = true;
    setColorMenuOpen(false);
    setFontSizeMenuOpen(false);
  }

  function setColorMenuOpen(open){
    if (!colorMenu || !colorToggle) return;
    colorMenu.hidden = !open;
    colorToggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) setFontSizeMenuOpen(false);
  }

  function setFontSizeMenuOpen(open){
    if (!fontSizeMenu || !fontSizeToggle) return;
    fontSizeMenu.hidden = !open;
    fontSizeToggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) setColorMenuOpen(false);
  }

  function handleToolbarPointerDown(event){
    if (event.target.closest("button")) event.preventDefault();
  }

  function handleSelectionChange(){
    if (!editingWidgetId) return;
    saveCurrentSelection();
  }

  function buildQuizSnapshot(){
    return {
      version: 1,
      id: currentQuizId,
      title: getQuizTitle() || "Quiz sans titre",
      folder_id: currentQuizFolderId,
      display_order: currentQuizDisplayOrder,
      is_system: currentQuizIsSystem,
      created_at: currentQuizCreatedAt,
      updated_at: currentQuizUpdatedAt,
      grid: { columns: GRID_COLUMNS, rows: GRID_ROWS },
      questions: cloneValue(questions)
    };
  }

  async function handleSaveQuiz(){
    if (typeof onSaveQuiz !== "function") return;
    const title = getQuizTitle();
    if (!title) {
      titleInput?.setCustomValidity("Donnez un titre au quiz.");
      titleInput?.reportValidity();
      titleInput?.focus();
      return;
    }
    titleInput?.setCustomValidity("");
    saveButton?.setAttribute("aria-busy", "true");
    if (saveButton) saveButton.disabled = true;
    try {
      const saved = await onSaveQuiz(buildQuizSnapshot());
      if (saved) {
        currentQuizId = String(saved.id || currentQuizId);
        currentQuizFolderId = saved.folder_id ?? currentQuizFolderId;
        currentQuizCreatedAt = String(saved.created_at || currentQuizCreatedAt);
        currentQuizUpdatedAt = String(saved.updated_at || currentQuizUpdatedAt);
        currentQuizDisplayOrder = saved.display_order ?? currentQuizDisplayOrder;
        currentQuizIsSystem = saved.is_system === true;
        setQuizTitle(saved.title || title);
        markQuizSaved();
      }
    } catch (error) {
      console.error("Impossible d’enregistrer le quiz.", error);
      window.alert(error?.message || "Enregistrement impossible.");
      updateSaveButton();
    } finally {
      saveButton?.removeAttribute("aria-busy");
    }
  }

  function handleTestQuiz(){
    if (!questions.length || typeof onTestQuiz !== "function") return;
    onTestQuiz(buildQuizSnapshot());
  }

  function duplicateQuestion(questionId, trigger){
    const sourceIndex = questions.findIndex((entry) => entry.id === String(questionId || ""));
    if (sourceIndex < 0) return;
    const duplicate = normalizeQuestion(cloneValue(questions[sourceIndex]));
    duplicate.id = createId("question");
    const widgetIdMap = new Map();
    duplicate.widgets = duplicate.widgets.map((widget) => {
      const nextId = createId("widget");
      widgetIdMap.set(widget.id, nextId);
      return { ...widget, id:nextId };
    });
    duplicate.widgets = duplicate.widgets.map((widget) => widget.type === "categories"
      ? { ...widget, labelsSourceWidgetId:widgetIdMap.get(widget.labelsSourceWidgetId) || "" }
      : widget);
    duplicate.variants = duplicate.variants.map((variant) => {
      const widgetContents = {};
      Object.entries(variant.widgetContents || {}).forEach(([widgetId, content]) => {
        const nextId = widgetIdMap.get(widgetId);
        if (nextId) widgetContents[nextId] = cloneValue(content);
      });
      return { ...variant, id:createId("variant"), widgetContents };
    });
    questions.splice(sourceIndex + 1, 0, duplicate);
    markQuizDirty();
    renderQuestions();
    openDrawer({ currentTarget: trigger }, duplicate);
  }

  function handleQuestionsClick(event){
    const editButton = event.target.closest("[data-edit-question]");
    if (editButton) {
      const question = questions.find((entry) => entry.id === String(editButton.dataset.editQuestion || ""));
      if (question) openDrawer(event, question);
      return;
    }

    const duplicateButton = event.target.closest("[data-duplicate-question]");
    if (duplicateButton) {
      duplicateQuestion(String(duplicateButton.dataset.duplicateQuestion || ""), duplicateButton);
      return;
    }

    const removeButton = event.target.closest("[data-remove-question]");
    if (!removeButton) return;
    const questionId = String(removeButton.dataset.removeQuestion || "");
    questions = questions.filter((question) => question.id !== questionId);
    markQuizDirty();
    renderQuestions();
  }

  function handleKeydown(event){
    if (!drawer?.classList.contains("is-open")) return;
    const selectionToken = event.target instanceof Element ? event.target.closest("[data-selection-token-index]") : null;
    if (selectionToken && (event.key === "Enter" || event.key === " ")) {
      const widgetNode = selectionToken.closest("[data-quiz-widget-id]");
      const widget = draftWidgets.find((entry) => entry.id === String(widgetNode?.dataset.quizWidgetId || ""));
      if (widget?.type === "selection-words" && previewMode === "correction") {
        event.preventDefault();
        selectionToken.click();
        return;
      }
    }

    if (event.key === "Escape") {
      if (colorMenu && !colorMenu.hidden) {
        event.preventDefault();
        setColorMenuOpen(false);
        return;
      }
      if (fontSizeMenu && !fontSizeMenu.hidden) {
        event.preventDefault();
        setFontSizeMenuOpen(false);
        return;
      }
      event.preventDefault();
      closeDrawer();
      return;
    }

    if ((event.key === "Delete" || event.key === "Backspace") && selectedWidgetId) {
      const tagName = String(event.target?.tagName || "").toLowerCase();
      if (tagName === "input" || tagName === "textarea" || event.target?.isContentEditable) return;
      event.preventDefault();
      removeWidget(selectedWidgetId);
    }
  }

  function mount(){
    if (isMounted) return;
    resetDraft();
    renderQuestions();

    view?.querySelectorAll("[data-quiz-open-drawer]").forEach((button) => button.addEventListener("click", openDrawer));
    drawerCloseButton?.addEventListener("click", () => closeDrawer());
    drawerScrim?.addEventListener("click", () => closeDrawer());
    confirmButton?.addEventListener("click", saveQuestion);
    saveButton?.addEventListener("click", handleSaveQuiz);
    testButton?.addEventListener("click", handleTestQuiz);
    titleInput?.addEventListener("input", () => {
      titleInput.setCustomValidity("");
      markQuizDirty();
    });
    questionsHost?.addEventListener("click", handleQuestionsClick);
    drawer?.addEventListener("click", handleDrawerClick);
    drawer?.addEventListener("input", handleDrawerInput);
    drawer?.addEventListener("focusin", handleDrawerFocusIn);
    drawer?.addEventListener("focusout", handleDrawerFocusOut);
    drawer?.addEventListener("pointerdown", handleWidgetPointerDown);
    drawer?.addEventListener("dragstart", handleDrawerDragStart);
    textToolbar?.addEventListener("pointerdown", handleToolbarPointerDown);
    canvas?.addEventListener("dragover", handleCanvasDragOver);
    canvas?.addEventListener("dragleave", handleCanvasDragLeave);
    canvas?.addEventListener("drop", handleCanvasDrop);
    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("pointermove", handleWidgetPointerMove);
    document.addEventListener("pointerup", handleWidgetPointerUp);
    document.addEventListener("pointercancel", handleWidgetPointerUp);
    document.addEventListener("selectionchange", handleSelectionChange);
    window.addEventListener("resize", positionTextToolbar);
    window.addEventListener("scroll", positionTextToolbar, true);

    if (canvasFrame && typeof ResizeObserver === "function") {
      canvasResizeObserver = new ResizeObserver(() => fitCanvas());
      canvasResizeObserver.observe(canvasFrame);
    }

    window.requestAnimationFrame(fitCanvas);
    isMounted = true;
  }

  function render(){
    mount();
  }

  function setQuizTitle(title = ""){
    if (titleInput) {
      titleInput.value = String(title ?? "");
      titleInput.setCustomValidity("");
    }
  }

  function resetQuiz({
    id = "",
    title = "",
    folderId = null,
    folder_id = null,
    display_order = null,
    is_system = false,
    created_at = "",
    updated_at = "",
    grid = null,
    questions: sourceQuestions = []
  } = {}){
    mount();
    close();
    currentQuizId = String(id || "");
    currentQuizFolderId = folder_id ?? folderId ?? null;
    currentQuizDisplayOrder = display_order;
    currentQuizIsSystem = is_system === true;
    currentQuizCreatedAt = String(created_at || "");
    currentQuizUpdatedAt = String(updated_at || "");
    const sourceColumns = normalizeGridColumnCount(grid?.columns);
    questions = Array.isArray(sourceQuestions)
      ? sourceQuestions.map((question) => normalizeQuestion(migrateQuestionGrid(question, sourceColumns)))
      : [];
    setQuizTitle(title);
    resetDraft();
    renderQuestions();
    markQuizSaved();
  }

  function loadQuiz(quiz = {}){
    resetQuiz(quiz);
  }

  function close(){
    if (!drawer?.classList.contains("is-open")) return;
    closeDrawer({ restoreFocus: false });
  }

  return {
    render,
    close,
    resetQuiz,
    loadQuiz,
    setQuizTitle,
    getQuizSnapshot: buildQuizSnapshot,
    hasUnsavedChanges: () => isQuizDirty
  };
}
