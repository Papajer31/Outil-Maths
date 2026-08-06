import {
  analyzeSeriesQuestionModel,
  getQuestionModelById,
  getSeriesCompatibleQuestionModels
} from "./quiz-question-models.js";
import { escapeAttr, escapeHtml } from "./text-utils.js";
import { openDashboardConfirmDialog } from "./confirm-dialog.js";
import {
  findQuizSelectionIndexesFromText,
  getQuizSelectionWordCount,
  normalizeQuizSelectionIndexes,
  renderQuizSelectionTextToHtml,
  tokenizeQuizSelectionText
} from "../../../shared/quiz-selection-text.js";

const GRID_COLUMNS = 12;
const GRID_ROWS = 8;
const QCM_MIN_CHOICES = 2;
const QCM_MAX_CHOICES = 6;
let cachedSeriesCompatibleModels = null;
const QUIZ_VARIANT_COLORS = {
  r: "#d32f2f",
  v: "#2e7d32",
  j: "#d49a00",
  b: "#1565c0"
};
const QUIZ_VARIANT_COLOR_CODES = Object.fromEntries(
  Object.entries(QUIZ_VARIANT_COLORS).map(([code, color]) => [color, code])
);

function cloneValue(value){
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createId(prefix = "item"){
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeVisibility(widget = {}){
  const legacy = String(widget.visibility || "both");
  const questionVisible = widget.questionVisible ?? legacy !== "correction";
  const correctionVisible = widget.correctionVisible ?? legacy !== "question";
  const inheritedCorrectionVisibility = questionVisible ? "visible" : "hidden";
  const correctionVisibility = String(widget.correctionVisibility || (correctionVisible ? "visible" : "hidden"));
  return {
    questionVisible: Boolean(questionVisible),
    correctionVisible: correctionVisibility !== "hidden",
    correctionVisibility,
    correctionVisibilityOverridden: correctionVisibility !== inheritedCorrectionVisibility
  };
}

function escapeTextToHtml(value){
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function normalizeFormattingRuns(runs, textLength){
  return (Array.isArray(runs) ? runs : [])
    .map((run) => ({
      start: Math.max(0, Math.min(textLength, Math.trunc(Number(run?.start) || 0))),
      end: Math.max(0, Math.min(textLength, Math.trunc(Number(run?.end) || 0))),
      bold: Boolean(run?.bold),
      italic: Boolean(run?.italic),
      underline: Boolean(run?.underline),
      color: String(run?.color || "")
    }))
    .filter((run) => run.end > run.start)
    .sort((first, second) => first.start - second.start || first.end - second.end);
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
  return { text, formatting:normalizeFormattingRuns(formatting, text.length) };
}

function serializeMiniMarkup(text, formatting = []){
  const rawText = String(text ?? "");
  if (!rawText) return "";
  const styles = Array.from({ length:rawText.length }, () => ({ bold:false, italic:false, underline:false, color:"" }));
  normalizeFormattingRuns(formatting, rawText.length).forEach((run) => {
    for (let index = run.start; index < run.end; index += 1) {
      styles[index] = {
        bold:Boolean(run.bold),
        italic:Boolean(run.italic),
        underline:Boolean(run.underline),
        color:String(run.color || "")
      };
    }
  });

  const serializeChar = (character, style) => {
    let value = character === "\n" ? "§" : character;
    if (style.underline) value = `°${value}°`;
    if (style.italic) value = `_${value}_`;
    if (style.bold) value = `*${value}*`;
    const colorCode = QUIZ_VARIANT_COLOR_CODES[String(style.color || "").toLowerCase()];
    if (colorCode) value = `\\${colorCode}[${value}]`;
    return value;
  };

  let result = "";
  let index = 0;
  while (index < rawText.length) {
    const style = styles[index] || { bold:false, italic:false, underline:false, color:"" };
    let end = index + 1;
    while (end < rawText.length) {
      const next = styles[end];
      if (!next
        || next.bold !== style.bold
        || next.italic !== style.italic
        || next.underline !== style.underline
        || next.color !== style.color) break;
      end += 1;
    }
    let chunk = rawText.slice(index, end).replace(/\r?\n/g, "§");
    if (style.underline) chunk = `°${chunk}°`;
    if (style.italic) chunk = `_${chunk}_`;
    if (style.bold) chunk = `*${chunk}*`;
    const colorCode = QUIZ_VARIANT_COLOR_CODES[String(style.color || "").toLowerCase()];
    if (colorCode) chunk = `\\${colorCode}[${chunk}]`;
    result += chunk;
    index = end;
  }
  return result || Array.from(rawText).map((character, charIndex) => serializeChar(character, styles[charIndex])).join("");
}

function richTextModelToHtml(text, formatting = []){
  const rawText = String(text ?? "");
  const runs = normalizeFormattingRuns(formatting, rawText.length);
  if (!runs.length) return escapeTextToHtml(rawText);
  const boundaries = new Set([0, rawText.length]);
  runs.forEach((run) => {
    boundaries.add(run.start);
    boundaries.add(run.end);
  });
  const points = Array.from(boundaries).sort((first, second) => first - second);
  const chunks = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (end <= start) continue;
    const active = runs.filter((run) => run.start <= start && run.end >= end);
    const style = active.reduce((result, run) => ({
      bold:result.bold || run.bold,
      italic:result.italic || run.italic,
      underline:result.underline || run.underline,
      color:run.color || result.color
    }), { bold:false, italic:false, underline:false, color:"" });
    const css = [];
    if (style.bold) css.push("font-weight:700");
    if (style.italic) css.push("font-style:italic");
    if (style.underline) css.push("text-decoration:underline");
    if (style.color) css.push(`color:${style.color}`);
    const content = escapeTextToHtml(rawText.slice(start, end));
    chunks.push(css.length ? `<span style="${css.join(";")}">${content}</span>` : content);
  }
  return chunks.join("");
}

function createQcmChoices(sourceChoices = []){
  const choices = (Array.isArray(sourceChoices) ? sourceChoices : []).slice(0, QCM_MAX_CHOICES).map((choice, index) => ({
    id:String(choice?.id || createId("choice")),
    text:String(choice?.text || ""),
    formatting:normalizeFormattingRuns(choice?.formatting, String(choice?.text || "").length),
    isCorrect:Boolean(choice?.isCorrect ?? index === 0)
  }));
  while (choices.length < QCM_MIN_CHOICES) {
    choices.push({ id:createId("choice"), text:"", formatting:[], isCorrect:choices.length === 0 });
  }
  let correctIndex = choices.findIndex((choice) => choice.isCorrect);
  if (correctIndex < 0) correctIndex = 0;
  choices.forEach((choice, index) => { choice.isCorrect = index === correctIndex; });
  return choices;
}

function createWidgetFromModel(source = {}){
  const visibility = normalizeVisibility(source);
  const questionText = String(source.questionText || "");
  const correctionText = String(source.correctionText ?? questionText);
  const questionFormatting = normalizeFormattingRuns(source.questionFormatting, questionText.length);
  const correctionFormatting = normalizeFormattingRuns(source.correctionFormatting, correctionText.length);
  const widget = {
    ...cloneValue(source),
    id:createId("widget"),
    questionText,
    correctionText,
    questionFormatting,
    correctionFormatting,
    questionHtml:richTextModelToHtml(questionText, questionFormatting),
    correctionHtml:richTextModelToHtml(correctionText, correctionFormatting),
    correctionColumn:Number(source.correctionColumn) || Number(source.column) || 1,
    correctionRow:Number(source.correctionRow) || Number(source.row) || 1,
    correctionColumnSpan:Number(source.correctionColumnSpan) || Number(source.columnSpan) || 1,
    correctionRowSpan:Number(source.correctionRowSpan) || Number(source.rowSpan) || 1,
    questionVisible:visibility.questionVisible,
    correctionVisible:visibility.correctionVisible,
    correctionVisibility:visibility.correctionVisibility,
    textAlign:String(source.textAlign || "center"),
    correctionTextAlign:String(source.correctionTextAlign || source.textAlign || "center"),
    verticalAlign:String(source.verticalAlign || "middle"),
    correctionVerticalAlign:String(source.correctionVerticalAlign || source.verticalAlign || "middle"),
    fontSize:String(source.fontSize || "normal"),
    correctionFontSize:String(source.correctionFontSize || source.fontSize || "normal"),
    correctionOverrides:{
      text:correctionText !== questionText,
      formatting:false,
      position:false,
      size:false,
      textAlign:false,
      verticalAlign:false,
      fontSize:false,
      visibility:visibility.correctionVisibilityOverridden,
      image:false,
      audio:false,
      ...(source.correctionOverrides || {})
    }
  };
  if (widget.type === "qcm-text") widget.qcmChoices = createQcmChoices(source.qcmChoices);
  if (widget.type === "selection-words") widget.selectionExpectedTokenIndexes = [];
  return widget;
}

function createBaseQuestion(model){
  return {
    id:createId("question"),
    modelId:model.id,
    title:model.title,
    widgets:model.widgets.map(createWidgetFromModel),
    variants:[],
    answerGuide:model.answerGuide ? cloneValue(model.answerGuide) : null
  };
}

function createTextContent(questionParsed, correctionParsed = questionParsed, { correctionOverridden = false } = {}){
  return {
    questionText:questionParsed.text,
    questionFormatting:cloneValue(questionParsed.formatting),
    correctionText:correctionParsed.text,
    correctionFormatting:cloneValue(correctionParsed.formatting),
    correctionTextOverridden:Boolean(correctionOverridden),
    correctionFormattingOverridden:Boolean(correctionOverridden)
  };
}

function getWidgetContent(variant, widget){
  return variant?.widgetContents?.[widget?.id] || {};
}

function getModelPreviewStyle(widget = {}){
  return [
    `--series-column:${Math.max(1, Number(widget.column) || 1)}`,
    `--series-row:${Math.max(1, Number(widget.row) || 1)}`,
    `--series-column-span:${Math.max(1, Number(widget.columnSpan) || 1)}`,
    `--series-row-span:${Math.max(1, Number(widget.rowSpan) || 1)}`
  ].join(";");
}

function getSeriesModelPreviewMarkup(model, analysis){
  const instructionIndex = analysis.instructionWidgetIndex;
  const blocks = model.widgets.map((widget, index) => {
    const classes = [
      "quiz-series-model-preview-block",
      widget.type === "answer" ? "is-answer" : "",
      widget.type === "qcm-text" ? "is-qcm" : "",
      widget.type === "selection-words" ? "is-selection" : "",
      index === instructionIndex ? "is-instruction" : "",
      String(widget.visibility || "") === "correction" ? "is-correction" : ""
    ].filter(Boolean).join(" ");
    return `<span class="${classes}" style="${getModelPreviewStyle(widget)}"></span>`;
  }).join("");
  return `<span class="quiz-series-model-preview" aria-hidden="true">${blocks}</span>`;
}

export function openQuizSeriesCreationOverlay({ onConfirm } = {}){
  const models = cachedSeriesCompatibleModels || (cachedSeriesCompatibleModels = getSeriesCompatibleQuestionModels());
  const overlay = document.createElement("div");
  overlay.className = "quiz-series-creation-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "quizSeriesCreationTitle");
  overlay.innerHTML = `
    <div class="quiz-series-creation-card">
      <header class="quiz-series-creation-header">
        <div>
          <h2 id="quizSeriesCreationTitle">Créer une série de questions</h2>
          <p>Choisissez un modèle textuel, puis renseignez la consigne commune à toutes les questions.</p>
        </div>
        <button class="quiz-series-creation-close dashboard-material-icon-btn" type="button" data-action="cancel" aria-label="Fermer" title="Fermer">
          <span class="dashboard-material-icon" aria-hidden="true">close</span>
        </button>
      </header>
      <div class="quiz-series-creation-content">
        <label class="quiz-series-creation-instruction">
          <span>Titre de la série</span>
          <input type="text" data-series-title placeholder="Ex. : Les déterminants" required>
        </label>
        <section class="quiz-series-models-section" aria-labelledby="quizSeriesModelsTitle">
          <h3 id="quizSeriesModelsTitle">Modèle de question</h3>
          <div class="quiz-series-model-grid">
            ${models.map(({ model, analysis }) => `
              <button class="quiz-series-model-card" type="button" data-series-model-id="${escapeAttr(model.id)}" aria-pressed="false">
                ${getSeriesModelPreviewMarkup(model, analysis)}
                <span class="quiz-series-model-card-copy">
                  <strong>${escapeHtml(model.title)}</strong>
                  <span>${escapeHtml(model.description)}</span>
                </span>
                <span class="quiz-series-model-indicators">
                  ${analysis.indicators.map((indicator) => `<span>${escapeHtml(indicator)}</span>`).join("")}
                </span>
                <span class="quiz-series-model-check dashboard-material-icon" aria-hidden="true">check_circle</span>
              </button>
            `).join("")}
          </div>
        </section>
        <label class="quiz-series-creation-instruction">
          <span>Consigne générale</span>
          <input type="text" data-series-instruction placeholder="Ex. : Écris la bonne réponse." required>
        </label>
        <div class="quiz-series-creation-message" aria-live="polite"></div>
      </div>
      <footer class="quiz-series-creation-actions">
        <button class="btn primary" type="button" data-action="confirm-blank" disabled>Créer une série vierge</button>
        <button class="btn primary" type="button" data-action="confirm-import" disabled>
          <span>Importer des questions</span>
        </button>
      </footer>
    </div>
  `;
  document.body.appendChild(overlay);

  let selectedModelId = "";
  const titleInput = overlay.querySelector("[data-series-title]");
  const instructionInput = overlay.querySelector("[data-series-instruction]");
  const confirmButtons = Array.from(overlay.querySelectorAll('[data-action^="confirm-"]'));
  const message = overlay.querySelector(".quiz-series-creation-message");

  const close = () => overlay.remove();
  const updateState = () => {
    const valid = Boolean(
      selectedModelId
      && String(titleInput?.value || "").trim()
      && String(instructionInput?.value || "").trim()
    );
    confirmButtons.forEach((button) => { button.disabled = !valid; });
    if (message) {
      message.textContent = "";
      message.classList.remove("is-error");
    }
  };

  overlay.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const modelButton = target.closest("[data-series-model-id]");
    if (modelButton) {
      selectedModelId = String(modelButton.dataset.seriesModelId || "");
      overlay.querySelectorAll("[data-series-model-id]").forEach((button) => {
        const selected = button === modelButton;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
      updateState();
      instructionInput?.focus();
      return;
    }
    if (target.closest('[data-action="cancel"]')) {
      close();
      return;
    }
    const confirmAction = target.closest('[data-action="confirm-blank"], [data-action="confirm-import"]');
    if (confirmAction) {
      const title = String(titleInput?.value || "").trim();
      const instruction = String(instructionInput?.value || "").trim();
      if (!selectedModelId || !title || !instruction) return;
      confirmButtons.forEach((button) => { button.disabled = true; });
      const action = confirmAction.matches('[data-action="confirm-import"]') ? "import" : "blank";
      try {
        await onConfirm?.({ modelId:selectedModelId, title, instruction, action });
        close();
      } catch (error) {
        if (message) {
          message.textContent = error?.message || "Création impossible.";
          message.classList.add("is-error");
        }
        confirmButtons.forEach((button) => { button.disabled = false; });
      }
    }
  });
  titleInput?.addEventListener("input", updateState);
  instructionInput?.addEventListener("input", updateState);
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });
  titleInput?.focus();
  return { close };
}


function parseQuizSelectionImportValue(value){
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
    if (character === openMarker) {
      rangeStart = text.length;
    } else if (character === closeMarker) {
      if (rangeStart !== null) ranges.push({ start:rangeStart, end:text.length });
      rangeStart = null;
    } else {
      text += character;
    }
    offsets.push(text.length);
  }

  const formatting = parsed.formatting
    .map((run) => ({ ...run, start:offsets[run.start], end:offsets[run.end] }))
    .filter((run) => run.end > run.start);
  const tokens = tokenizeQuizSelectionText(text).filter((token) => token.kind === "word");
  const expectedTokenIndexes = tokens
    .filter((token) => ranges.some((range) => token.start >= range.start && token.end <= range.end))
    .map((token) => token.wordIndex);

  if (!text.trim()) return { error:"L’énoncé ne peut pas être vide." };
  if (!expectedTokenIndexes.length) {
    return { error:"La sélection doit contenir au moins un mot entre crochets." };
  }

  return {
    text,
    formatting:normalizeFormattingRuns(formatting, text.length),
    expectedTokenIndexes:normalizeQuizSelectionIndexes(expectedTokenIndexes, tokens.length)
  };
}

function getSeriesImportFieldDescription(field){
  if (field.kind === "qcm") return "Bonne réponse; distracteur 1; distracteur 2; …";
  if (field.kind === "selection") return "Phrase avec [mots] à sélectionner";
  return String(field.label || "Texte");
}

function getSeriesImportFormat(analysis){
  const fields = Array.isArray(analysis?.fields) ? analysis.fields : [];
  return fields.map(getSeriesImportFieldDescription).join(" | ");
}

function getSeriesImportExample(analysis){
  const fields = Array.isArray(analysis?.fields) ? analysis.fields : [];
  return fields.map((field) => {
    if (field.kind === "answer") return "8";
    if (field.kind === "qcm") return "Paris; Lyon; Marseille; Toulouse";
    if (field.kind === "selection") return "Le [chat] dort sur le [tapis].";
    if (field.kind === "explanation") return "Explication facultative";
    return field.label === "Texte" ? "Quel est le double de 4 ?" : String(field.label || "Texte");
  }).join(" | ");
}

function getLastRequiredFieldIndex(analysis){
  const fields = Array.isArray(analysis?.fields) ? analysis.fields : [];
  let lastRequiredIndex = -1;
  fields.forEach((field, index) => {
    if (field.required !== false) lastRequiredIndex = index;
  });
  return lastRequiredIndex;
}


function buildSeriesColumns(analysis, qcmChoiceCount = 4){
  const columns = [];
  analysis.fields.forEach((field) => {
    const base = `widget-${field.widgetIndex}`;
    if (field.kind === "qcm") {
      columns.push({ key:`${base}-correct`, kind:"qcm-choice", widgetIndex:field.widgetIndex, choiceIndex:0, label:"Bonne réponse", required:true });
      const count = Math.max(QCM_MIN_CHOICES, Math.min(QCM_MAX_CHOICES, qcmChoiceCount));
      for (let index = 1; index < count; index += 1) {
        columns.push({
          key:`${base}-distractor-${index}`,
          kind:"qcm-choice",
          widgetIndex:field.widgetIndex,
          choiceIndex:index,
          label:`Distracteur ${index}`,
          required:index === 1
        });
      }
      return;
    }
    if (field.kind === "selection") {
      columns.push({ key:`${base}-statement`, kind:"selection-statement", widgetIndex:field.widgetIndex, label:"Énoncé", required:true });
      columns.push({ key:`${base}-expected`, kind:"selection-picker", widgetIndex:field.widgetIndex, label:"Sélection attendue", required:true });
      return;
    }
    columns.push({
      key:`${base}-${field.kind}`,
      kind:field.kind,
      widgetIndex:field.widgetIndex,
      label:field.label,
      required:field.required !== false
    });
  });
  return columns;
}

function createEmptyRow(){
  return { id:createId("variant"), values:{}, selections:{} };
}

function getColumnValue(row, column){
  return String(row?.values?.[column.key] || "");
}

function isRowEmpty(row, columns){
  const hasValue = columns.some((column) => column.kind !== "selection-picker" && getColumnValue(row, column).trim());
  const hasSelection = Object.values(row?.selections || {}).some((indexes) => Array.isArray(indexes) && indexes.length);
  return !hasValue && !hasSelection;
}

function resizeTextarea(textarea){
  if (!(textarea instanceof HTMLTextAreaElement)) return;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.max(34, textarea.scrollHeight)}px`;
}

export function createQuizSeriesViewController({
  view,
  backButton,
  saveButton,
  testButton,
  titleInput,
  instructionInput,
  tableHost,
  addRowButton,
  importQuestionsButton,
  importScrim,
  importDrawer,
  messageHost,
  onSaveQuiz,
  onTestQuiz,
  onBack,
  showToast
} = {}){
  const titleDisplay = view?.querySelector("#quizSeriesTitleDisplay") || null;
  const renameTitleButton = view?.querySelector("#btnRenameQuizSeriesTitle") || null;
  const titleOverlay = view?.querySelector("#quizSeriesTitleOverlay") || null;
  const titleOverlayInput = view?.querySelector("#quizSeriesTitleOverlayInput") || null;
  const titleOverlayMessage = view?.querySelector("#quizSeriesTitleOverlayMessage") || null;
  const applyTitleButton = view?.querySelector("#btnApplyQuizSeriesTitle") || null;
  let isMounted = false;
  let currentQuizId = "";
  let currentFolderId = null;
  let currentQuizIsSystem = false;
  let currentDisplayOrder = null;
  let currentCreatedAt = "";
  let currentUpdatedAt = "";
  let currentModelId = "";
  let currentModel = null;
  let currentAnalysis = null;
  let currentQuestion = null;
  let qcmChoiceCount = 4;
  let rows = [];
  let isDirty = false;
  let validationIssues = [];
  let importDrawerCloseTimer = 0;
  let importDrawerTrigger = null;
  let tableRenderToken = 0;
  let tableRenderFrame = 0;

  function getColumns(){
    return currentAnalysis ? buildSeriesColumns(currentAnalysis, qcmChoiceCount) : [];
  }

  function setMessage(text = "", { isError = false } = {}){
    if (!messageHost) return;
    messageHost.textContent = String(text || "");
    messageHost.classList.toggle("is-error", Boolean(isError));
  }

  function updateHeader(){
    const title = String(titleInput?.value || "").trim();
    if (titleDisplay) {
      titleDisplay.textContent = title || "titre";
      titleDisplay.title = title || "Titre du quiz";
      titleDisplay.classList.toggle("is-empty", !title);
    }
    if (saveButton) saveButton.disabled = !isDirty;
    if (testButton) testButton.disabled = rows.every((row) => isRowEmpty(row, getColumns()));
  }

  function markDirty(){
    isDirty = true;
    validationIssues = [];
    setMessage("");
    updateHeader();
  }

  function markSaved(){
    isDirty = false;
    validationIssues = [];
    setMessage("");
    updateHeader();
  }

  function closeTitleOverlay(){
    if (!titleOverlay) return;
    titleOverlay.classList.add("hidden");
    titleOverlay.setAttribute("aria-hidden", "true");
  }

  function openTitleOverlay(){
    if (!titleOverlay || !titleOverlayInput) return;
    titleOverlayInput.value = String(titleInput?.value || "").trim();
    if (titleOverlayMessage) titleOverlayMessage.textContent = "";
    titleOverlay.classList.remove("hidden");
    titleOverlay.setAttribute("aria-hidden", "false");
    window.requestAnimationFrame(() => {
      titleOverlayInput.focus();
      titleOverlayInput.select();
    });
  }

  function applyTitleOverlay(){
    const title = String(titleOverlayInput?.value || "").trim();
    if (!title) {
      if (titleOverlayMessage) titleOverlayMessage.textContent = "Le titre ne peut pas être vide.";
      titleOverlayInput?.focus();
      return;
    }
    if (titleInput) {
      titleInput.value = title;
      titleInput.dispatchEvent(new Event("input", { bubbles:true }));
    }
    closeTitleOverlay();
  }

  function parseImportText(value){
    const fields = Array.isArray(currentAnalysis?.fields) ? currentAnalysis.fields : [];
    const lastRequiredIndex = getLastRequiredFieldIndex(currentAnalysis);
    const rawLines = String(value ?? "").replace(/\r\n?/g, "\n").split("\n");
    const records = [];
    const errors = [];
    let maxQcmChoices = Math.max(
      QCM_MIN_CHOICES,
      Number(fields.find((field) => field.kind === "qcm")?.choiceCount) || QCM_MIN_CHOICES
    );

    rawLines.forEach((rawLine, sourceIndex) => {
      if (!rawLine.trim()) return;
      const lineNumber = sourceIndex + 1;
      const values = rawLine.split("|").map((item) => item.trim());

      if (values.length < lastRequiredIndex + 1) {
        errors.push({
          lineNumber,
          message:`${lastRequiredIndex + 1} champ${lastRequiredIndex + 1 > 1 ? "s sont requis" : " est requis"} avant les champs facultatifs.`
        });
        return;
      }
      if (values.length > fields.length) {
        errors.push({
          lineNumber,
          message:`${fields.length} champ${fields.length > 1 ? "s sont attendus" : " est attendu"}, mais ${values.length} ont été trouvés.`
        });
        return;
      }
      while (values.length < fields.length) values.push("");

      const parsedValues = [];
      let lineHasError = false;

      fields.forEach((field, fieldIndex) => {
        const rawValue = String(values[fieldIndex] ?? "").trim();
        if (field.required !== false && !rawValue) {
          errors.push({ lineNumber, message:`Le champ « ${field.label} » est obligatoire.` });
          lineHasError = true;
          parsedValues.push(rawValue);
          return;
        }

        if (field.kind === "qcm") {
          const rawChoices = rawValue.split(";").map((choice) => choice.trim());
          while (rawChoices.length && !rawChoices.at(-1)) rawChoices.pop();
          const firstEmptyIndex = rawChoices.findIndex((choice) => !choice);
          if (firstEmptyIndex >= 0) {
            errors.push({
              lineNumber,
              message:"Le QCM contient une proposition vide entre deux points-virgules."
            });
            lineHasError = true;
          } else if (rawChoices.length < QCM_MIN_CHOICES) {
            errors.push({
              lineNumber,
              message:"Le QCM doit contenir une bonne réponse et au moins un distracteur, séparés par « ; »."
            });
            lineHasError = true;
          } else if (rawChoices.length > QCM_MAX_CHOICES) {
            errors.push({
              lineNumber,
              message:`Le QCM accepte au maximum ${QCM_MAX_CHOICES} propositions.`
            });
            lineHasError = true;
          }
          maxQcmChoices = Math.max(maxQcmChoices, Math.min(QCM_MAX_CHOICES, rawChoices.length));
          parsedValues.push(rawChoices);
          return;
        }

        if (field.kind === "selection") {
          const parsedSelection = parseQuizSelectionImportValue(rawValue);
          if (parsedSelection.error) {
            errors.push({ lineNumber, message:parsedSelection.error });
            lineHasError = true;
          }
          parsedValues.push(parsedSelection);
          return;
        }

        parsedValues.push(rawValue);
      });

      if (!lineHasError) records.push({ lineNumber, values:parsedValues });
    });

    return { records, errors, maxQcmChoices };
  }

  function buildImportedRow(record){
    const row = createEmptyRow();
    const fields = Array.isArray(currentAnalysis?.fields) ? currentAnalysis.fields : [];
    fields.forEach((field, fieldIndex) => {
      const base = `widget-${field.widgetIndex}`;
      const value = record.values[fieldIndex];

      if (field.kind === "qcm") {
        const choices = Array.isArray(value) ? value : [];
        row.values[`${base}-correct`] = String(choices[0] || "");
        choices.slice(1, QCM_MAX_CHOICES).forEach((choice, choiceIndex) => {
          row.values[`${base}-distractor-${choiceIndex + 1}`] = String(choice || "");
        });
        return;
      }

      if (field.kind === "selection") {
        const selection = value && !value.error ? value : { text:"", formatting:[], expectedTokenIndexes:[] };
        row.values[`${base}-statement`] = serializeMiniMarkup(selection.text, selection.formatting);
        row.selections[field.widgetIndex] = normalizeQuizSelectionIndexes(
          selection.expectedTokenIndexes,
          getQuizSelectionWordCount(selection.text)
        );
        return;
      }

      row.values[`${base}-${field.kind}`] = String(value || "");
    });
    return row;
  }

  function getImportSummaryMarkup(result, hasInput){
    if (!hasInput) {
      return '<span>Collez ou saisissez une question par ligne.</span>';
    }
    const count = result.records.length;
    const errorCount = result.errors.length;
    return `
      <span><strong>${count}</strong> question${count > 1 ? "s" : ""} reconnue${count > 1 ? "s" : ""}</span>
      <span class="${errorCount ? "is-error" : "is-valid"}">
        ${errorCount ? `${errorCount} erreur${errorCount > 1 ? "s" : ""}` : "Aucune erreur"}
      </span>
    `;
  }

  function finishImportDrawerClose(){
    clearTimeout(importDrawerCloseTimer);
    importDrawer?.classList.remove("is-open", "is-visible", "is-closing");
    if (importDrawer) importDrawer.innerHTML = "";
  }

  function closeImportDrawer({ restoreFocus = true } = {}){
    importScrim?.classList.remove("is-open");
    importScrim?.setAttribute("aria-hidden", "true");
    importDrawer?.setAttribute("aria-hidden", "true");
    importDrawer?.classList.remove("is-open");
    importDrawer?.classList.add("is-closing");
    clearTimeout(importDrawerCloseTimer);
    importDrawerCloseTimer = window.setTimeout(finishImportDrawerClose, 520);
    if (restoreFocus) importDrawerTrigger?.focus?.();
  }

  function renderImportDrawer(source = "editor"){
    if (!importDrawer || !currentAnalysis) return;
    const format = getSeriesImportFormat(currentAnalysis);
    const example = getSeriesImportExample(currentAnalysis);

    importDrawer.innerHTML = `
      <header class="quiz-series-import-drawer-header">
        <div class="quiz-series-import-drawer-heading">
          <h3 id="quizSeriesImportDrawerTitle">Importer les questions</h3>
          <p>Une ligne correspond à une question. Les lignes valides seront converties dans le tableau.</p>
        </div>
        <div class="quiz-series-import-drawer-actions">
          <button class="btn primary" type="button" data-series-import-action="apply-append" disabled>
            <span class="dashboard-material-icon" aria-hidden="true">add</span>
            <span>Importer à la suite</span>
          </button>
          <button class="btn primary" type="button" data-series-import-action="apply-replace" disabled>
            <span class="dashboard-material-icon" aria-hidden="true">add</span>
            <span>Importer en remplaçant</span>
          </button>
          <button class="quiz-workshop-drawer-close dashboard-material-icon-btn" type="button" data-series-import-action="close" aria-label="Fermer le volet d’import" title="Fermer">
            <span class="dashboard-material-icon" aria-hidden="true">close</span>
          </button>
        </div>
      </header>
      <section class="quiz-series-import-content">
        <div class="quiz-series-import-format-line">
          <strong>Format attendu :</strong>
          <code>${escapeHtml(format)}</code>
          <details>
            <summary>Mise en forme disponible</summary>
            <div class="quiz-series-import-markup-help">
              <span><code>§</code> retour à la ligne</span>
              <span><code>*mot*</code> gras</span>
              <span><code>_mot_</code> italique</span>
              <span><code>°mot°</code> souligné</span>
              <span><code>\\r[mot]</code> rouge</span>
              <span><code>\\v[mot]</code> vert</span>
              <span><code>\\j[mot]</code> jaune</span>
              <span><code>\\b[mot]</code> bleu</span>
            </div>
          </details>
          <button class="btn quiz-series-import-insert-pipe" type="button" data-series-import-action="insert-pipe" title="Insérer le séparateur">Insérer |</button>
        </div>

        <div class="quiz-series-import-input-wrap">
          <div class="quiz-series-import-line-numbers" data-series-import-line-numbers aria-hidden="true">1</div>
          <textarea
            class="quiz-series-import-input"
            rows="14"
            wrap="off"
            spellcheck="true"
            autocomplete="off"
            placeholder="${escapeAttr(example)}"
            aria-label="Questions à importer"
          ></textarea>
        </div>

        <div class="quiz-series-import-status" data-series-import-status aria-live="polite"></div>
        <div class="quiz-series-import-errors" data-series-import-errors aria-live="polite"></div>
      </section>
    `;

    const input = importDrawer.querySelector(".quiz-series-import-input");
    const confirmButtons = Array.from(importDrawer.querySelectorAll('[data-series-import-action^="apply-"]'));
    const lineNumbers = importDrawer.querySelector("[data-series-import-line-numbers]");
    const status = importDrawer.querySelector("[data-series-import-status]");
    const errorsHost = importDrawer.querySelector("[data-series-import-errors]");

    const refreshAnalysis = () => {
      const text = String(input?.value || "");
      const result = parseImportText(text);
      const hasInput = Boolean(text.trim());
      if (lineNumbers) lineNumbers.textContent = Array.from({ length:Math.max(1, text.split("\n").length) }, (_, index) => String(index + 1)).join("\n");
      if (status) status.innerHTML = getImportSummaryMarkup(result, hasInput);
      if (errorsHost) {
        errorsHost.innerHTML = result.errors.length
          ? `<ul>${result.errors.map((error) => `<li><strong>Ligne ${error.lineNumber}</strong> — ${escapeHtml(error.message)}</li>`).join("")}</ul>`
          : "";
      }
      confirmButtons.forEach((button) => { button.disabled = !result.records.length || result.errors.length > 0; });
      return result;
    };

    importDrawer.querySelector('[data-series-import-action="close"]')?.addEventListener("click", () => closeImportDrawer());
    importDrawer.querySelector('[data-series-import-action="insert-pipe"]')?.addEventListener("click", () => {
      if (!input) return;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      input.setRangeText("|", start, end, "end");
      input.focus();
      refreshAnalysis();
    });

    input?.addEventListener("input", refreshAnalysis);
    input?.addEventListener("scroll", () => {
      if (lineNumbers) lineNumbers.scrollTop = input.scrollTop;
    });
    input?.addEventListener("paste", (event) => {
      const pasted = event.clipboardData?.getData("text/plain");
      if (pasted == null || !pasted.includes("\t")) return;
      event.preventDefault();
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      input.setRangeText(pasted.replace(/\t/g, "|"), start, end, "end");
      refreshAnalysis();
    });

    const applyImport = (importMode) => {
      const result = refreshAnalysis();
      if (!result.records.length || result.errors.length) {
        input?.focus();
        return;
      }

      const importedRows = result.records.map(buildImportedRow);
      const existingRows = rows.filter((row) => !isRowEmpty(row, getColumns()));
      const defaultChoiceCount = Math.max(
        QCM_MIN_CHOICES,
        Number(currentAnalysis.fields.find((field) => field.kind === "qcm")?.choiceCount) || QCM_MIN_CHOICES
      );

      if (importMode === "replace") {
        rows = importedRows;
        qcmChoiceCount = Math.max(defaultChoiceCount, result.maxQcmChoices);
      } else {
        rows = [...existingRows, ...importedRows];
        qcmChoiceCount = Math.max(qcmChoiceCount, defaultChoiceCount, result.maxQcmChoices);
      }

      validationIssues = [];
      markDirty();
      closeImportDrawer({ restoreFocus:false });
      setMessage(`${importedRows.length} question${importedRows.length > 1 ? "s ont été importées" : " a été importée"}.`);
      // Laisse le navigateur afficher la fermeture du volet avant d’amorcer le
      // rendu potentiellement volumineux du tableau.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          renderTable();
          const firstImportedIndex = importMode === "append" ? Math.max(0, rows.length - importedRows.length) : 0;
          tableHost?.querySelector(`[data-series-row-index="${firstImportedIndex}"] textarea`)?.focus?.();
        });
      });
    };
    importDrawer.querySelector('[data-series-import-action="apply-append"]')?.addEventListener("click", () => applyImport("append"));
    importDrawer.querySelector('[data-series-import-action="apply-replace"]')?.addEventListener("click", () => applyImport("replace"));

    importDrawer.onkeydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeImportDrawer();
      }
    };

    refreshAnalysis();
  }

  function openImportDrawer({ source = "editor" } = {}){
    if (!importDrawer || !importScrim || !currentAnalysis) return;
    importDrawerTrigger = source === "creation" ? null : (document.activeElement || importQuestionsButton);
    renderImportDrawer(source);
    clearTimeout(importDrawerCloseTimer);
    importScrim.classList.add("is-open");
    importScrim.setAttribute("aria-hidden", "false");
    importDrawer.classList.remove("is-open", "is-closing");
    importDrawer.classList.add("is-visible");
    importDrawer.setAttribute("aria-hidden", "false");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        importDrawer.classList.add("is-open");
        window.setTimeout(() => importDrawer.querySelector("textarea")?.focus(), 120);
      });
    });
  }

  function getIssue(rowIndex, columnKey){
    return validationIssues.find((issue) => issue.rowIndex === rowIndex && issue.columnKey === columnKey) || null;
  }

  function getSelectionSummary(row, column){
    const statementColumn = getColumns().find((candidate) => candidate.kind === "selection-statement" && candidate.widgetIndex === column.widgetIndex);
    const parsed = parseMiniMarkup(getColumnValue(row, statementColumn || {}));
    const indexes = normalizeQuizSelectionIndexes(row.selections?.[column.widgetIndex], getQuizSelectionWordCount(parsed.text));
    const words = tokenizeQuizSelectionText(parsed.text).filter((token) => token.kind === "word");
    return indexes.map((index) => words[index]?.text || "").filter(Boolean).join(" - ");
  }

  function getColumnWidthClass(column){
    if (column.kind === "selection-picker") return "is-selection";
    if (column.kind === "explanation") return "is-explanation";
    if (column.kind === "qcm-choice") return "is-qcm-choice";
    if (column.kind === "answer") return "is-answer";
    return "is-text";
  }

  function getTableGridTemplate(columns){
    const widths = columns.map((column) => {
      if (column.kind === "selection-picker") return "minmax(240px, 1fr)";
      if (column.kind === "explanation") return "minmax(290px, 1.2fr)";
      if (column.kind === "qcm-choice") return "minmax(210px, .9fr)";
      if (column.kind === "answer") return "minmax(220px, 1fr)";
      return "minmax(280px, 1.25fr)";
    });
    return ["48px", ...widths, "148px"].join(" ");
  }

  function renderTableRow(row, rowIndex, columns){
    return `
      <div class="quiz-series-row" data-series-row-id="${escapeAttr(row.id)}" role="row">
        <div class="quiz-series-row-index" role="rowheader">${rowIndex + 1}</div>
          ${columns.map((column, columnIndex) => {
            const issue = getIssue(rowIndex, column.key);
            if (column.kind === "selection-picker") {
              const summary = getSelectionSummary(row, column);
              return `
                <div class="quiz-series-cell-wrap ${getColumnWidthClass(column)}${issue ? " is-invalid" : ""}" title="${escapeAttr(issue?.message || "")}" role="cell">
                  <button
                    class="quiz-series-selection-button${summary ? " has-selection" : ""}"
                    type="button"
                    data-series-action="pick-selection"
                    data-series-row-index="${rowIndex}"
                    data-series-column-key="${escapeAttr(column.key)}"
                    data-series-col-index="${columnIndex}"
                  >
                    <span class="dashboard-material-icon quiz-series-selection-icon" aria-hidden="true">touch_app</span>
                    <span class="quiz-series-selection-label">${summary ? escapeHtml(summary) : "Choisir…"}</span>
                  </button>
                </div>
              `;
            }
            return `
              <div class="quiz-series-cell-wrap ${getColumnWidthClass(column)}${issue ? " is-invalid" : ""}" title="${escapeAttr(issue?.message || "")}" role="cell">
                <textarea
                  class="quiz-series-cell"
                  rows="1"
                  spellcheck="true"
                  data-series-row-index="${rowIndex}"
                  data-series-column-key="${escapeAttr(column.key)}"
                  data-series-col-index="${columnIndex}"
                  placeholder="${escapeAttr(column.label)}"
                  aria-label="${escapeAttr(`${column.label}, question ${rowIndex + 1}`)}"
                  ${issue ? 'aria-invalid="true"' : ""}
                >${escapeHtml(getColumnValue(row, column))}</textarea>
              </div>
            `;
          }).join("")}
          <div class="quiz-series-row-actions" role="cell">
            <button class="dashboard-material-icon-btn" type="button" data-series-action="move-up" data-series-row-index="${rowIndex}" title="Monter" aria-label="Monter la question" ${rowIndex === 0 ? "disabled" : ""}><span class="dashboard-material-icon" aria-hidden="true">arrow_upward</span></button>
            <button class="dashboard-material-icon-btn" type="button" data-series-action="move-down" data-series-row-index="${rowIndex}" title="Descendre" aria-label="Descendre la question" ${rowIndex === rows.length - 1 ? "disabled" : ""}><span class="dashboard-material-icon" aria-hidden="true">arrow_downward</span></button>
            <button class="dashboard-material-icon-btn" type="button" data-series-action="duplicate" data-series-row-index="${rowIndex}" title="Dupliquer" aria-label="Dupliquer la question"><span class="dashboard-material-icon" aria-hidden="true">content_copy</span></button>
            <button class="dashboard-material-icon-btn is-danger" type="button" data-series-action="delete" data-series-row-index="${rowIndex}" title="Supprimer" aria-label="Supprimer la question"><span class="dashboard-material-icon" aria-hidden="true">delete</span></button>
          </div>
        </div>
      `;
  }

  function renderTable(){
    if (!tableHost) return;
    const renderToken = ++tableRenderToken;
    if (tableRenderFrame) window.cancelAnimationFrame(tableRenderFrame);
    tableRenderFrame = 0;
    const columns = getColumns();
    if (!currentAnalysis || !columns.length) {
      tableHost.innerHTML = '<div class="quiz-series-empty">Aucun modèle de série actif.</div>';
      return;
    }
    if (!rows.length) rows = [createEmptyRow()];

    const gridTemplate = getTableGridTemplate(columns);
    const isLargeSeries = rows.length >= 80;
    tableHost.innerHTML = `
      <div class="quiz-series-table" style="--quiz-series-table-columns:${gridTemplate}">
        <div class="quiz-series-table-head" role="row">
          <div>#</div>
          ${columns.map((column) => `
            <div class="${getColumnWidthClass(column)}">
              <span>${escapeHtml(column.label)}</span>
              <small>${column.required ? "(obligatoire)" : "(facultatif)"}</small>
            </div>
          `).join("")}
          <div><span class="sr-only">Actions</span></div>
        </div>
        <div class="quiz-series-table-body" role="rowgroup" ${isLargeSeries ? 'aria-busy="true"' : ""}>
          ${isLargeSeries ? '<div class="quiz-series-table-loading" data-series-table-loading><span class="dashboard-material-icon" aria-hidden="true">progress_activity</span><span>Chargement des questions…</span></div>' : ""}
        </div>
      </div>
    `;
    updateHeader();
    const body = tableHost.querySelector(".quiz-series-table-body");
    if (!body) return;
    let nextRowIndex = 0;
    const chunkSize = isLargeSeries ? 16 : rows.length;
    const renderChunk = () => {
      if (renderToken !== tableRenderToken || !body.isConnected) return;
      const endIndex = Math.min(rows.length, nextRowIndex + chunkSize);
      body.insertAdjacentHTML("beforeend", rows.slice(nextRowIndex, endIndex)
        .map((row, index) => renderTableRow(row, nextRowIndex + index, columns))
        .join(""));
      if (!isLargeSeries) {
        Array.from(body.querySelectorAll("textarea")).forEach(resizeTextarea);
      }
      nextRowIndex = endIndex;
      if (nextRowIndex < rows.length) {
        tableRenderFrame = window.requestAnimationFrame(renderChunk);
        return;
      }
      tableRenderFrame = 0;
      body.removeAttribute("aria-busy");
      body.querySelector("[data-series-table-loading]")?.remove();
    };
    renderChunk();
  }

  function addRow(afterIndex = rows.length - 1, source = null){
    const row = source ? cloneValue(source) : createEmptyRow();
    row.id = createId("variant");
    const insertIndex = Math.max(0, Math.min(rows.length, Number(afterIndex) + 1));
    rows.splice(insertIndex, 0, row);
    markDirty();
    renderTable();
    window.requestAnimationFrame(() => tableHost?.querySelector(`[data-series-row-index="${insertIndex}"]`)?.focus());
  }

  function removeRow(index){
    if (!Number.isFinite(index) || index < 0 || index >= rows.length) return;
    if (rows.length === 1) rows[0] = createEmptyRow();
    else rows.splice(index, 1);
    markDirty();
    renderTable();
  }

  function moveRow(index, step){
    const target = index + step;
    if (index < 0 || index >= rows.length || target < 0 || target >= rows.length) return;
    const [row] = rows.splice(index, 1);
    rows.splice(target, 0, row);
    markDirty();
    renderTable();
  }

  function openSelectionPicker(rowIndex, column){
    const row = rows[rowIndex];
    if (!row || !column) return;
    const statementColumn = getColumns().find((candidate) => candidate.kind === "selection-statement" && candidate.widgetIndex === column.widgetIndex);
    const parsed = parseMiniMarkup(getColumnValue(row, statementColumn || {}));
    const wordCount = getQuizSelectionWordCount(parsed.text);
    if (!parsed.text.trim() || !wordCount) {
      showToast?.("Saisissez d’abord l’énoncé.", { isError:true });
      tableHost?.querySelector(`[data-series-row-index="${rowIndex}"][data-series-column-key="${CSS.escape(statementColumn?.key || "")}"]`)?.focus();
      return;
    }
    let draftIndexes = normalizeQuizSelectionIndexes(row.selections?.[column.widgetIndex], wordCount);
    const overlay = document.createElement("div");
    overlay.className = "quiz-series-selection-picker-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div class="quiz-series-selection-picker-card">
        <div class="quiz-series-selection-picker-header">
          <div class="quiz-series-selection-picker-title">Cliquez sur les mots attendus</div>
        </div>
        <div class="quiz-series-selection-picker-text" data-selection-picker-text></div>
        <div class="quiz-series-selection-picker-footer">
          <div class="quiz-series-selection-picker-actions">
            <button class="btn" type="button" data-selection-picker-action="clear">Effacer</button>
            <button class="btn primary" type="button" data-selection-picker-action="apply">Valider la sélection</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const textHost = overlay.querySelector("[data-selection-picker-text]");
    const renderPicker = () => {
      if (textHost) textHost.innerHTML = renderQuizSelectionTextToHtml(parsed.text, parsed.formatting, {
        activeIndexes:draftIndexes,
        activeKind:"selected",
        interactive:true,
        ariaPrefix:"Mot à sélectionner"
      });
    };
    const close = () => overlay.remove();
    renderPicker();
    overlay.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target === overlay) {
        close();
        return;
      }
      const token = target.closest("[data-selection-token-index]");
      if (token && textHost?.contains(token)) {
        const tokenIndex = Number(token.dataset.selectionTokenIndex);
        const set = new Set(draftIndexes);
        if (set.has(tokenIndex)) set.delete(tokenIndex);
        else set.add(tokenIndex);
        draftIndexes = normalizeQuizSelectionIndexes(Array.from(set), wordCount);
        renderPicker();
        return;
      }
      if (target.closest('[data-selection-picker-action="clear"]')) {
        draftIndexes = [];
        renderPicker();
      } else if (target.closest('[data-selection-picker-action="apply"]')) {
        row.selections[column.widgetIndex] = normalizeQuizSelectionIndexes(draftIndexes, wordCount);
        markDirty();
        close();
        renderTable();
      }
    });
    overlay.addEventListener("keydown", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const token = target?.closest("[data-selection-token-index]");
      if (token && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        token.click();
      }
    });
    overlay.querySelector("[data-selection-token-index]")?.focus?.();
  }

  function setCellValue(rowIndex, column, value){
    const row = rows[rowIndex];
    if (!row || !column) return;
    if (column.kind === "selection-picker") {
      const statementColumn = getColumns().find((candidate) => candidate.kind === "selection-statement" && candidate.widgetIndex === column.widgetIndex);
      const parsed = parseMiniMarkup(getColumnValue(row, statementColumn || {}));
      row.selections[column.widgetIndex] = findQuizSelectionIndexesFromText(parsed.text, String(value || ""));
      return;
    }
    row.values[column.key] = String(value ?? "");
    if (column.kind === "selection-statement") row.selections[column.widgetIndex] = [];
  }

  function applyPasteMatrix(startRowIndex, startColumnIndex, text){
    const columns = getColumns();
    const matrix = String(text || "").replace(/\r\n?/g, "\n").split("\n");
    while (matrix.length && matrix.at(-1) === "") matrix.pop();
    const rowsData = matrix.map((line) => line.split("\t"));
    if (!rowsData.length) return false;
    while (rows.length < startRowIndex + rowsData.length) rows.push(createEmptyRow());
    rowsData.forEach((cells, rowOffset) => {
      cells.forEach((value, columnOffset) => {
        const column = columns[startColumnIndex + columnOffset];
        if (column) setCellValue(startRowIndex + rowOffset, column, value);
      });
    });
    markDirty();
    renderTable();
    return true;
  }

  function validate({ focus = false } = {}){
    const columns = getColumns();
    const issues = [];
    const activeRows = rows.filter((row) => !isRowEmpty(row, columns));
    if (!String(titleInput?.value || "").trim()) issues.push({ rowIndex:-1, columnKey:"title", message:"Donnez un titre à la série." });
    if (!String(instructionInput?.value || "").trim()) issues.push({ rowIndex:-1, columnKey:"instruction", message:"Renseignez la consigne générale." });
    if (!activeRows.length) issues.push({ rowIndex:0, columnKey:columns[0]?.key || "", message:"Ajoutez au moins une question complète." });

    rows.forEach((row, rowIndex) => {
      if (isRowEmpty(row, columns)) return;
      columns.forEach((column) => {
        if (!column.required) return;
        if (column.kind === "selection-picker") {
          const indexes = row.selections?.[column.widgetIndex] || [];
          if (!indexes.length) issues.push({ rowIndex, columnKey:column.key, message:"Sélectionnez au moins un mot attendu." });
          return;
        }
        if (!getColumnValue(row, column).trim()) {
          issues.push({ rowIndex, columnKey:column.key, message:`Le champ « ${column.label} » est obligatoire.` });
        }
      });

      const qcmWidgetIndexes = Array.from(new Set(
        columns.filter((column) => column.kind === "qcm-choice").map((column) => column.widgetIndex)
      ));
      qcmWidgetIndexes.forEach((widgetIndex) => {
        const distractors = columns
          .filter((column) => column.kind === "qcm-choice" && column.widgetIndex === widgetIndex && column.choiceIndex > 0)
          .sort((first, second) => first.choiceIndex - second.choiceIndex);
        let foundEmpty = false;
        distractors.forEach((column) => {
          const hasValue = Boolean(getColumnValue(row, column).trim());
          if (!hasValue) {
            foundEmpty = true;
            return;
          }
          if (foundEmpty) {
            const previous = distractors.find((candidate) => candidate.choiceIndex === column.choiceIndex - 1);
            issues.push({
              rowIndex,
              columnKey:previous?.key || column.key,
              message:"Remplissez les distracteurs dans l’ordre, sans laisser de colonne vide entre deux propositions."
            });
          }
        });
      });
    });

    validationIssues = issues.filter((issue) => issue.rowIndex >= 0);
    if (issues.length) {
      renderTable();
      const first = issues[0];
      setMessage(first.message, { isError:true });
      if (focus) {
        if (first.columnKey === "title") openTitleOverlay();
        else if (first.columnKey === "instruction") instructionInput?.focus();
        else tableHost?.querySelector(`[data-series-row-index="${first.rowIndex}"][data-series-column-key="${CSS.escape(first.columnKey)}"]`)?.focus();
      }
      return false;
    }
    validationIssues = [];
    setMessage("");
    return true;
  }

  function createVariantFromRow(row, columns){
    const widgetContents = {};
    const instructionParsed = parseMiniMarkup(String(instructionInput?.value || "").trim());
    const instructionWidget = currentQuestion.widgets[currentAnalysis.instructionWidgetIndex];
    widgetContents[instructionWidget.id] = createTextContent(instructionParsed, instructionParsed);

    currentAnalysis.fields.forEach((field) => {
      const widget = currentQuestion.widgets[field.widgetIndex];
      if (!widget) return;
      const base = `widget-${field.widgetIndex}`;
      if (field.kind === "text") {
        const parsed = parseMiniMarkup(String(row.values[`${base}-text`] || "").trim());
        widgetContents[widget.id] = createTextContent(parsed, parsed);
        return;
      }
      if (field.kind === "answer") {
        const parsed = parseMiniMarkup(String(row.values[`${base}-answer`] || "").trim());
        widgetContents[widget.id] = createTextContent({ text:"", formatting:[] }, parsed, { correctionOverridden:true });
        return;
      }
      if (field.kind === "qcm") {
        const choiceColumns = columns.filter((column) => column.kind === "qcm-choice" && column.widgetIndex === field.widgetIndex);
        const values = choiceColumns.map((column) => String(row.values[column.key] || "").trim()).filter(Boolean).slice(0, QCM_MAX_CHOICES);
        const choices = values.map((value, index) => {
          const parsed = parseMiniMarkup(value);
          return { id:createId("choice"), text:parsed.text, formatting:parsed.formatting, isCorrect:index === 0 };
        });
        widgetContents[widget.id] = {
          ...createTextContent({ text:"", formatting:[] }, { text:"", formatting:[] }),
          qcmChoices:createQcmChoices(choices)
        };
        return;
      }
      if (field.kind === "selection") {
        const parsed = parseMiniMarkup(String(row.values[`${base}-statement`] || "").trim());
        widgetContents[widget.id] = {
          ...createTextContent(parsed, parsed),
          selectionExpectedTokenIndexes:normalizeQuizSelectionIndexes(row.selections?.[field.widgetIndex], getQuizSelectionWordCount(parsed.text))
        };
        return;
      }
      if (field.kind === "explanation") {
        const parsed = parseMiniMarkup(String(row.values[`${base}-explanation`] || "").trim());
        widgetContents[widget.id] = createTextContent({ text:"", formatting:[] }, parsed, { correctionOverridden:true });
      }
    });
    return { id:row.id || createId("variant"), widgetContents };
  }

  function buildSnapshot(){
    const columns = getColumns();
    const activeRows = rows.filter((row) => !isRowEmpty(row, columns));
    const question = cloneValue(currentQuestion);
    const instructionParsed = parseMiniMarkup(String(instructionInput?.value || "").trim());
    const instructionWidget = question.widgets[currentAnalysis.instructionWidgetIndex];
    instructionWidget.questionText = instructionParsed.text;
    instructionWidget.questionFormatting = cloneValue(instructionParsed.formatting);
    instructionWidget.questionHtml = richTextModelToHtml(instructionParsed.text, instructionParsed.formatting);
    instructionWidget.correctionText = instructionParsed.text;
    instructionWidget.correctionFormatting = cloneValue(instructionParsed.formatting);
    instructionWidget.correctionHtml = richTextModelToHtml(instructionParsed.text, instructionParsed.formatting);
    instructionWidget.correctionOverrides = { ...(instructionWidget.correctionOverrides || {}), text:false, formatting:false };
    question.variants = activeRows.map((row) => createVariantFromRow(row, columns));
    return {
      version:1,
      id:currentQuizId,
      title:String(titleInput?.value || "").trim() || "Série sans titre",
      instruction:instructionParsed.text,
      folder_id:currentFolderId,
      display_order:currentDisplayOrder,
      is_system:currentQuizIsSystem,
      created_at:currentCreatedAt,
      updated_at:currentUpdatedAt,
      editorMode:"series",
      seriesModelId:currentModelId,
      seriesResponseType:currentAnalysis.responseType,
      grid:{ columns:GRID_COLUMNS, rows:GRID_ROWS },
      questions:[question]
    };
  }

  function extractInstruction(question, analysis){
    const widget = question.widgets?.[analysis.instructionWidgetIndex];
    const firstVariant = question.variants?.[0];
    const content = getWidgetContent(firstVariant, widget);
    return serializeMiniMarkup(
      content.questionText ?? widget?.questionText ?? "",
      content.questionFormatting ?? widget?.questionFormatting ?? []
    );
  }

  function extractRows(question, analysis){
    const variants = Array.isArray(question.variants) && question.variants.length ? question.variants : [{ id:createId("variant"), widgetContents:{} }];
    let maxChoices = Math.max(2, analysis.fields.find((field) => field.kind === "qcm")?.choiceCount || 4);
    variants.forEach((variant) => {
      analysis.fields.filter((field) => field.kind === "qcm").forEach((field) => {
        const widget = question.widgets[field.widgetIndex];
        const choices = getWidgetContent(variant, widget).qcmChoices || widget?.qcmChoices || [];
        maxChoices = Math.max(maxChoices, Math.min(QCM_MAX_CHOICES, choices.length));
      });
    });
    qcmChoiceCount = maxChoices;
    const columns = buildSeriesColumns(analysis, qcmChoiceCount);

    return variants.map((variant) => {
      const row = { id:String(variant.id || createId("variant")), values:{}, selections:{} };
      analysis.fields.forEach((field) => {
        const widget = question.widgets[field.widgetIndex];
        const content = getWidgetContent(variant, widget);
        const base = `widget-${field.widgetIndex}`;
        if (field.kind === "text") {
          row.values[`${base}-text`] = serializeMiniMarkup(content.questionText ?? widget?.questionText ?? "", content.questionFormatting ?? widget?.questionFormatting ?? []);
        } else if (field.kind === "answer") {
          row.values[`${base}-answer`] = serializeMiniMarkup(content.correctionText ?? widget?.correctionText ?? "", content.correctionFormatting ?? widget?.correctionFormatting ?? []);
        } else if (field.kind === "qcm") {
          const rawChoices = createQcmChoices(content.qcmChoices || widget?.qcmChoices || []);
          const correct = rawChoices.find((choice) => choice.isCorrect) || rawChoices[0];
          const ordered = [correct, ...rawChoices.filter((choice) => choice.id !== correct?.id)];
          const choiceColumns = columns.filter((column) => column.kind === "qcm-choice" && column.widgetIndex === field.widgetIndex);
          choiceColumns.forEach((column, index) => {
            const choice = ordered[index];
            row.values[column.key] = choice ? serializeMiniMarkup(choice.text, choice.formatting) : "";
          });
        } else if (field.kind === "selection") {
          const text = String(content.questionText ?? widget?.questionText ?? "");
          row.values[`${base}-statement`] = serializeMiniMarkup(text, content.questionFormatting ?? widget?.questionFormatting ?? []);
          row.selections[field.widgetIndex] = normalizeQuizSelectionIndexes(
            content.selectionExpectedTokenIndexes ?? widget?.selectionExpectedTokenIndexes,
            getQuizSelectionWordCount(text)
          );
        } else if (field.kind === "explanation") {
          row.values[`${base}-explanation`] = serializeMiniMarkup(content.correctionText ?? widget?.correctionText ?? "", content.correctionFormatting ?? widget?.correctionFormatting ?? []);
        }
      });
      return row;
    });
  }

  function resetSeries({ folderId = null, modelId = "", instruction = "", title = "", isSystem = false } = {}){
    mount();
    const model = getQuestionModelById(modelId);
    const analysis = model ? analyzeSeriesQuestionModel(model) : null;
    if (!model || !analysis?.compatible) throw new Error("Modèle de série incompatible.");
    currentQuizId = "";
    currentFolderId = folderId || null;
    currentQuizIsSystem = isSystem === true;
    currentDisplayOrder = null;
    currentCreatedAt = "";
    currentUpdatedAt = "";
    currentModelId = model.id;
    currentModel = model;
    currentAnalysis = analysis;
    currentQuestion = createBaseQuestion(model);
    qcmChoiceCount = Math.max(2, analysis.fields.find((field) => field.kind === "qcm")?.choiceCount || 4);
    rows = [createEmptyRow()];
    if (titleInput) titleInput.value = String(title || "");
    if (instructionInput) instructionInput.value = String(instruction || "");
    validationIssues = [];
    isDirty = true;
    renderTable();
    titleInput?.focus();
  }

  function loadQuiz(quiz = {}){
    mount();
    const question = Array.isArray(quiz.questions) ? quiz.questions[0] : null;
    const modelId = String(quiz.seriesModelId || question?.modelId || "");
    const model = getQuestionModelById(modelId);
    const analysis = model ? analyzeSeriesQuestionModel(model) : null;
    if (!question || !model || !analysis?.compatible) throw new Error("Cette série ne correspond plus à un modèle compatible.");
    currentQuizId = String(quiz.id || "");
    currentFolderId = quiz.folder_id || null;
    currentQuizIsSystem = quiz.is_system === true;
    currentDisplayOrder = quiz.display_order ?? null;
    currentCreatedAt = String(quiz.created_at || "");
    currentUpdatedAt = String(quiz.updated_at || "");
    currentModelId = model.id;
    currentModel = model;
    currentAnalysis = analysis;
    currentQuestion = cloneValue(question);
    if (titleInput) titleInput.value = String(quiz.title || "");
    if (instructionInput) instructionInput.value = extractInstruction(currentQuestion, currentAnalysis);
    rows = extractRows(currentQuestion, currentAnalysis);
    validationIssues = [];
    isDirty = false;
    renderTable();
    markSaved();
  }

  async function handleSave(){
    if (!validate({ focus:true }) || typeof onSaveQuiz !== "function") return;
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.setAttribute("aria-busy", "true");
    }
    try {
      const saved = await onSaveQuiz(buildSnapshot());
      if (saved) {
        currentQuizId = String(saved.id || currentQuizId);
        currentFolderId = saved.folder_id ?? currentFolderId;
        currentDisplayOrder = saved.display_order ?? currentDisplayOrder;
        currentQuizIsSystem = saved.is_system === true;
        currentCreatedAt = String(saved.created_at || currentCreatedAt);
        currentUpdatedAt = String(saved.updated_at || currentUpdatedAt);
        if (titleInput) titleInput.value = String(saved.title || titleInput.value || "");
        markSaved();
      }
    } catch (error) {
      console.error("Impossible d’enregistrer la série.", error);
      setMessage(error?.message || "Enregistrement impossible.", { isError:true });
      showToast?.(error?.message || "Enregistrement impossible.", { isError:true });
      updateHeader();
    } finally {
      saveButton?.removeAttribute("aria-busy");
    }
  }

  function handleTest(){
    if (!validate({ focus:true }) || typeof onTestQuiz !== "function") return;
    onTestQuiz(buildSnapshot());
  }

  async function handleBack(){
    if (isDirty) {
      const confirmed = await openDashboardConfirmDialog({
        title:"Quitter sans enregistrer",
        message:"Les dernières modifications de cette série seront perdues.",
        confirmLabel:"Quitter",
        danger:true
      });
      if (!confirmed) return;
    }
    onBack?.();
  }

  function mount(){
    if (isMounted) return;
    backButton?.addEventListener("click", () => { void handleBack(); });
    saveButton?.addEventListener("click", () => void handleSave());
    testButton?.addEventListener("click", handleTest);
    addRowButton?.addEventListener("click", () => addRow(rows.length - 1));
    importQuestionsButton?.addEventListener("click", () => openImportDrawer({ source:"editor" }));
    importScrim?.addEventListener("click", () => closeImportDrawer());
    renameTitleButton?.addEventListener("click", openTitleOverlay);
    titleOverlay?.querySelectorAll("[data-close-quiz-series-title]").forEach((element) => element.addEventListener("click", closeTitleOverlay));
    applyTitleButton?.addEventListener("click", applyTitleOverlay);
    titleOverlayInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        applyTitleOverlay();
      }
    });
    titleInput?.addEventListener("input", markDirty);
    instructionInput?.addEventListener("input", markDirty);
    instructionInput?.addEventListener("input", (event) => resizeTextarea(event.target));

    tableHost?.addEventListener("input", (event) => {
      const textarea = event.target instanceof HTMLTextAreaElement ? event.target : null;
      if (!textarea) return;
      const rowIndex = Number(textarea.dataset.seriesRowIndex);
      const column = getColumns().find((candidate) => candidate.key === textarea.dataset.seriesColumnKey);
      const row = rows[rowIndex];
      if (!row || !column) return;
      const previous = row.values[column.key] || "";
      row.values[column.key] = textarea.value;
      if (column.kind === "selection-statement" && textarea.value !== previous) {
        row.selections[column.widgetIndex] = [];
        const picker = tableHost.querySelector(`[data-series-row-index="${rowIndex}"][data-series-column-key="widget-${column.widgetIndex}-expected"]`);
        picker?.classList.remove("has-selection");
        const label = picker?.querySelector("span:last-child");
        if (label) label.textContent = "Choisir…";
      }
      resizeTextarea(textarea);
      markDirty();
    });

    tableHost?.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const action = target.closest("[data-series-action]");
      if (!action) return;
      const rowIndex = Number(action.dataset.seriesRowIndex);
      const type = String(action.dataset.seriesAction || "");
      if (type === "add-row") addRow(rows.length - 1);
      else if (type === "move-up") moveRow(rowIndex, -1);
      else if (type === "move-down") moveRow(rowIndex, 1);
      else if (type === "duplicate") addRow(rowIndex, rows[rowIndex]);
      else if (type === "delete") removeRow(rowIndex);
      else if (type === "pick-selection") {
        const column = getColumns().find((candidate) => candidate.key === action.dataset.seriesColumnKey);
        openSelectionPicker(rowIndex, column);
      }
    });

    tableHost?.addEventListener("paste", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const cell = target?.closest("[data-series-col-index]");
      if (!cell) return;
      const pasted = event.clipboardData?.getData("text/plain") || "";
      if (!pasted.includes("\t") && !pasted.includes("\n") && !pasted.includes("\r")) return;
      event.preventDefault();
      const rowIndex = Number(cell.dataset.seriesRowIndex);
      const columnIndex = Number(cell.dataset.seriesColIndex);
      applyPasteMatrix(rowIndex, columnIndex, pasted);
    });

    isMounted = true;
  }

  function render(){
    mount();
    renderTable();
    resizeTextarea(instructionInput);
  }

  function close(){
    closeImportDrawer({ restoreFocus:false });
    setMessage("");
  }

  return {
    render,
    close,
    resetSeries,
    loadQuiz,
    openImportDrawer,
    getQuizSnapshot:buildSnapshot,
    hasUnsavedChanges:() => isDirty
  };
}
