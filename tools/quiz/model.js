import { normalizeQuizImageSource } from "../../shared/quiz-local-image-store.js";
import { normalizeQuizAudioSource } from "../../shared/quiz-audio-source.js";
import {
  formatQuizSelectionIndexes,
  getQuizSelectionWordCount,
  normalizeQuizSelectionIndexes
} from "../../shared/quiz-selection-text.js";

import {
  DEFAULT_QUESTION_SELECTION_MODE,
  filterItemsByQuestionSelection,
  getItemSelectionKey,
  getQuestionSelectionSignature as getCommonQuestionSelectionSignature,
  normalizeQuestionSelection as normalizeCommonQuestionSelection
} from "../../shared/tool-commons/general-tools/question-selection.js";

const GRID_COLUMNS = 12;
const GRID_ROWS = 8;
const DEFAULT_DRAW_MODE = "random";
const DRAW_MODES = new Set(["in_order", "random"]);
const SUPPORTED_WIDGET_TYPES = new Set(["text", "answer", "image", "audio", "numeric-keypad", "qcm-text", "selection-words"]);
const QCM_LAYOUTS = new Set(["auto", "row", "column", "grid"]);
const QUIZ_FONT_SIZES = new Set(["small", "normal", "large", "huge"]);
const QCM_MIN_CHOICES = 2;
const QCM_MAX_CHOICES = 6;
const CORRECTION_VISIBILITY_MODES = new Set(["visible", "correct", "incorrect", "hidden"]);
const normalizedQuizSnapshots = new WeakSet();

export function getDefaultSettings(){
  return {
    quizId: "",
    quizTitle: "",
    drawMode: DEFAULT_DRAW_MODE,
    questionSelection: { mode: DEFAULT_QUESTION_SELECTION_MODE, questionKeys: [] },
    quizSnapshot: {
      version: 1,
      id: "",
      title: "",
      instruction: "",
      grid: { columns: GRID_COLUMNS, rows: GRID_ROWS },
      questions: []
    }
  };
}

export function normalizeSettings(settings = {}){
  const safe = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  const drawMode = DRAW_MODES.has(String(safe.drawMode || safe.draw_mode || "").trim())
    ? String(safe.drawMode || safe.draw_mode).trim()
    : DEFAULT_DRAW_MODE;
  const snapshot = normalizeQuizSnapshot(safe.quizSnapshot || safe.quiz_snapshot || safe.snapshot || {});
  const sourceInstruction = String(
    safe.sourceInstruction
    ?? safe.source_instruction
    ?? safe.quizInstruction
    ?? safe.quiz_instruction
    ?? snapshot.instruction
    ?? ""
  ).trim();

  return {
    ...getDefaultSettings(),
    ...safe,
    quizId: String(safe.quizId || safe.quiz_id || snapshot.id || "").trim(),
    quizTitle: String(safe.quizTitle || safe.quiz_title || snapshot.title || "").trim(),
    sourceInstruction,
    drawMode,
    questionSelection: normalizeQuestionSelection(safe.questionSelection || safe.question_selection || {}),
    quizSnapshot: snapshot
  };
}

export function normalizeQuizSnapshot(snapshot = {}){
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) && normalizedQuizSnapshots.has(snapshot)) {
    return snapshot;
  }
  const safe = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot : {};
  const sourceColumns = Math.max(1, Math.trunc(Number(safe.grid?.columns) || GRID_COLUMNS));
  const questions = (Array.isArray(safe.questions) ? safe.questions : [])
    .map((question, index) => normalizeQuizQuestion(question, index, sourceColumns))
    .filter((question) => question.widgets.length > 0);
  const editorMode = String(safe.editorMode ?? safe.editor_mode ?? "").trim();
  const seriesModelId = String(safe.seriesModelId ?? safe.series_model_id ?? "").trim();
  const declaredInstruction = String(
    safe.instruction
    ?? safe.generalInstruction
    ?? safe.general_instruction
    ?? ""
  ).trim();

  const normalized = {
    version: Math.max(1, Math.trunc(Number(safe.version) || 1)),
    id: String(safe.id || "").trim(),
    title: String(safe.title || "").trim(),
    // Les premières séries ne possédaient pas encore de propriété `instruction`.
    // Leur consigne commune est le premier widget texte, répété dans chaque variante.
    instruction: declaredInstruction || (
      editorMode === "series" || Boolean(seriesModelId)
        ? getSeriesInstructionFromQuestions(questions)
        : ""
    ),
    editorMode,
    seriesModelId,
    grid: { columns: GRID_COLUMNS, rows: GRID_ROWS },
    questions
  };
  normalizedQuizSnapshots.add(normalized);
  return normalized;
}

function getSeriesInstructionFromQuestions(questions = []){
  const firstQuestion = Array.isArray(questions) ? questions[0] : null;
  if (!firstQuestion) return "";

  const variant = materializeQuizQuestionVariant(firstQuestion, 0);
  const instructionWidget = (variant.widgets || [])
    .filter((widget) => widget?.type === "text")
    .sort((left, right) => {
      const rowDifference = Number(left?.row || 0) - Number(right?.row || 0);
      return rowDifference || Number(left?.column || 0) - Number(right?.column || 0);
    })
    .find((widget) => getWidgetView(widget, "question")?.visible !== false);

  return String(getWidgetView(instructionWidget, "question")?.text || "").trim();
}

export function normalizeQuizQuestion(question = {}, index = 0, sourceColumns = GRID_COLUMNS){
  const safe = question && typeof question === "object" && !Array.isArray(question) ? question : {};
  const widgets = (Array.isArray(safe.widgets) ? safe.widgets : [])
    .map((widget, widgetIndex) => normalizeQuizWidget(widget, widgetIndex, sourceColumns))
    .filter(Boolean);
  const variants = normalizeQuizVariants(safe.variants, widgets);
  const sample = materializeQuizQuestionVariant({
    id: String(safe.id || `question-${index + 1}`).trim() || `question-${index + 1}`,
    title: String(safe.title || `Question ${index + 1}`).trim() || `Question ${index + 1}`,
    modelId: String(safe.modelId || safe.model_id || "").trim(),
    widgets,
    variants
  }, 0);

  return {
    id: sample.id,
    title: sample.title,
    modelId: sample.modelId,
    widgets,
    variants,
    variantCount: variants.length,
    answerWidgetCount: sample.answerWidgetCount,
    qcmWidgetCount: sample.qcmWidgetCount,
    selectionWidgetCount: sample.selectionWidgetCount,
    responseWidgetCount: sample.responseWidgetCount,
    responseType: sample.responseType,
    primaryAnswerWidgetId: sample.primaryAnswerWidgetId,
    primaryQcmWidgetId: sample.primaryQcmWidgetId,
    primarySelectionWidgetId: sample.primarySelectionWidgetId,
    primaryAnswerVisibleInQuestion: sample.primaryAnswerVisibleInQuestion,
    primaryQcmVisibleInQuestion: sample.primaryQcmVisibleInQuestion,
    primarySelectionVisibleInQuestion: sample.primarySelectionVisibleInQuestion,
    expectedAnswer: sample.expectedAnswer,
    expectedAnswerLabel: sample.expectedAnswerLabel
  };
}

export function normalizeQuizWidget(widget = {}, index = 0, sourceColumns = GRID_COLUMNS){
  const safe = widget && typeof widget === "object" && !Array.isArray(widget) ? widget : {};
  const type = String(safe.type || "text").trim().toLowerCase();
  if (!SUPPORTED_WIDGET_TYPES.has(type)) return null;
  const isAnswer = type === "answer";
  const isImage = type === "image";
  const isAudio = type === "audio";
  const isNumericKeypad = type === "numeric-keypad";
  const isQcmText = type === "qcm-text";
  const isSelectionWords = type === "selection-words";

  const questionText = isNumericKeypad || isImage || isAudio ? "" : String(safe.questionText ?? safe.question_text ?? "");
  const correctionText = isNumericKeypad || isImage || isAudio ? "" : String(safe.correctionText ?? safe.correction_text ?? questionText);
  const questionImageSource = isImage
    ? normalizeQuizImageSource(safe.questionImageSource ?? safe.question_image_source ?? safe.imageSource ?? safe.image_source)
    : null;
  const correctionImageSource = isImage
    ? normalizeQuizImageSource(safe.correctionImageSource ?? safe.correction_image_source ?? questionImageSource)
    : null;
  const questionAudioSource = isAudio
    ? normalizeQuizAudioSource(safe.questionAudioSource ?? safe.question_audio_source ?? safe.audioSource ?? safe.audio_source)
    : null;
  const correctionAudioSource = isAudio
    ? normalizeQuizAudioSource(safe.correctionAudioSource ?? safe.correction_audio_source ?? questionAudioSource)
    : null;
  const questionFormatting = normalizeFormattingRuns(safe.questionFormatting ?? safe.question_formatting, questionText.length);
  const correctionFormatting = normalizeFormattingRuns(safe.correctionFormatting ?? safe.correction_formatting, correctionText.length);
  const questionHtml = questionFormatting.length
    ? richTextModelToHtml(questionText, questionFormatting)
    : String(safe.questionHtml ?? safe.question_html ?? escapeHtml(questionText).replace(/\r?\n/g, "<br>"));
  const correctionHtml = correctionFormatting.length
    ? richTextModelToHtml(correctionText, correctionFormatting)
    : String(safe.correctionHtml ?? safe.correction_html ?? escapeHtml(correctionText).replace(/\r?\n/g, "<br>"));
  const sourceGridColumns = Math.max(1, Math.trunc(Number(sourceColumns) || GRID_COLUMNS));
  const questionArea = migrateHorizontalArea(
    safe.column,
    safe.columnSpan ?? safe.column_span,
    sourceGridColumns,
    isNumericKeypad ? GRID_COLUMNS : isQcmText || isSelectionWords ? 8 : isImage ? 4 : isAudio ? 4 : isAnswer ? 8 : 5
  );
  const correctionArea = migrateHorizontalArea(
    safe.correctionColumn ?? safe.correction_column ?? safe.column,
    safe.correctionColumnSpan ?? safe.correction_column_span ?? safe.columnSpan ?? safe.column_span,
    sourceGridColumns,
    questionArea.columnSpan
  );
  const column = questionArea.column;
  const row = clampInt(safe.row, 1, GRID_ROWS, 1);
  const columnSpan = questionArea.columnSpan;
  const rowSpan = clampInt(safe.rowSpan ?? safe.row_span, 1, GRID_ROWS, isImage || isQcmText ? 3 : isSelectionWords || isAudio ? 2 : 1);
  const overrides = normalizeCorrectionOverrides(safe.correctionOverrides || safe.correction_overrides || {});
  const questionVisible = isNumericKeypad
    ? true
    : safe.questionVisible ?? safe.question_visible ?? safe.visibility !== "correction";
  const correctionVisible = isNumericKeypad
    ? false
    : safe.correctionVisible ?? safe.correction_visible ?? safe.visibility !== "question";
  const inheritedCorrectionVisibility = questionVisible ? "visible" : "hidden";
  const correctionVisibility = isNumericKeypad
    ? "hidden"
    : normalizeCorrectionVisibility(
        safe.correctionVisibility ?? safe.correction_visibility,
        correctionVisible ? "visible" : "hidden"
      );
  if (!overrides.visibility && correctionVisibility !== inheritedCorrectionVisibility) {
    overrides.visibility = true;
  }

  return {
    id: String(safe.id || `widget-${index + 1}`).trim() || `widget-${index + 1}`,
    type,
    label: String(safe.label || (isAnswer ? "Réponse de l’élève" : isImage ? "Image" : isAudio ? "Audio" : isNumericKeypad ? "Clavier numérique" : isQcmText ? "QCM (texte)" : isSelectionWords ? "Sélection de mots" : "Texte")).trim(),
    questionText,
    correctionText,
    questionHtml,
    correctionHtml,
    questionFormatting,
    correctionFormatting,
    questionImageSource,
    correctionImageSource,
    questionAudioSource,
    correctionAudioSource,
    questionPlaceholder: String(safe.questionPlaceholder ?? safe.question_placeholder ?? ""),
    correctionPlaceholder: String(safe.correctionPlaceholder ?? safe.correction_placeholder ?? ""),
    column: clampInt(column, 1, GRID_COLUMNS - columnSpan + 1, 1),
    row: clampInt(row, 1, GRID_ROWS - rowSpan + 1, 1),
    columnSpan,
    rowSpan,
    correctionColumn: correctionArea.column,
    correctionRow: clampInt(safe.correctionRow ?? safe.correction_row, 1, GRID_ROWS, row),
    correctionColumnSpan: correctionArea.columnSpan,
    correctionRowSpan: clampInt(safe.correctionRowSpan ?? safe.correction_row_span, 1, GRID_ROWS, rowSpan),
    questionVisible: Boolean(questionVisible),
    correctionVisible: correctionVisibility !== "hidden",
    correctionVisibility,
    textAlign: normalizeTextAlign(safe.textAlign ?? safe.text_align),
    correctionTextAlign: normalizeTextAlign(safe.correctionTextAlign ?? safe.correction_text_align ?? safe.textAlign ?? safe.text_align),
    verticalAlign: normalizeVerticalAlign(safe.verticalAlign ?? safe.vertical_align),
    correctionVerticalAlign: normalizeVerticalAlign(safe.correctionVerticalAlign ?? safe.correction_vertical_align ?? safe.verticalAlign ?? safe.vertical_align),
    fontSize: normalizeQuizFontSize(safe.fontSize ?? safe.font_size),
    correctionFontSize: normalizeQuizFontSize(safe.correctionFontSize ?? safe.correction_font_size ?? safe.fontSize ?? safe.font_size),
    qcmLayout: normalizeQcmLayout(safe.qcmLayout ?? safe.qcm_layout),
    qcmChoices: isQcmText
      ? normalizeQcmChoices(safe.qcmChoices ?? safe.qcm_choices ?? safe.choices, index)
      : [],
    selectionExpectedTokenIndexes: isSelectionWords
      ? normalizeQuizSelectionIndexes(
          safe.selectionExpectedTokenIndexes ?? safe.selection_expected_token_indexes ?? safe.expectedTokenIndexes ?? safe.expected_token_indexes,
          getQuizSelectionWordCount(questionText)
        )
      : [],
    correctionOverrides: overrides
  };
}

function normalizeQcmLayout(value){
  const safe = String(value || "auto").trim().toLowerCase();
  return QCM_LAYOUTS.has(safe) ? safe : "auto";
}

function normalizeQcmChoices(sourceChoices, widgetIndex = 0){
  const source = Array.isArray(sourceChoices) ? sourceChoices.slice(0, QCM_MAX_CHOICES) : [];
  const choices = source.map((choice, index) => {
    const safe = choice && typeof choice === "object" && !Array.isArray(choice) ? choice : { text:choice };
    const text = String(safe.text ?? safe.label ?? "");
    return {
      id: String(safe.id || `qcm-${widgetIndex + 1}-choice-${index + 1}`).trim() || `qcm-${widgetIndex + 1}-choice-${index + 1}`,
      text,
      formatting: normalizeFormattingRuns(safe.formatting, text.length),
      isCorrect: Boolean(safe.isCorrect ?? safe.is_correct ?? index === 0)
    };
  });
  while (choices.length < QCM_MIN_CHOICES) {
    const index = choices.length;
    choices.push({
      id:`qcm-${widgetIndex + 1}-choice-${index + 1}`,
      text:"",
      formatting:[],
      isCorrect:index === 0
    });
  }
  let correctIndex = choices.findIndex((choice) => choice.isCorrect);
  if (correctIndex < 0) correctIndex = 0;
  choices.forEach((choice, index) => { choice.isCorrect = index === correctIndex; });
  return choices;
}

function captureVariantWidgetContent(widget){
  const content = {
    questionText: String(widget?.questionText ?? ""),
    questionFormatting: normalizeFormattingRuns(widget?.questionFormatting, String(widget?.questionText ?? "").length),
    correctionText: String(widget?.correctionText ?? widget?.questionText ?? ""),
    correctionFormatting: normalizeFormattingRuns(
      widget?.correctionFormatting,
      String(widget?.correctionText ?? widget?.questionText ?? "").length
    ),
    correctionTextOverridden: Boolean(widget?.correctionOverrides?.text),
    correctionFormattingOverridden: Boolean(widget?.correctionOverrides?.formatting)
  };
  if (widget?.type === "qcm-text") {
    content.qcmChoices = normalizeQcmChoices(widget.qcmChoices).map((choice) => ({ ...choice }));
  }
  if (widget?.type === "selection-words") {
    content.selectionExpectedTokenIndexes = normalizeQuizSelectionIndexes(
      widget.selectionExpectedTokenIndexes,
      getQuizSelectionWordCount(widget.questionText)
    );
  }
  if (widget?.type === "image") {
    content.questionImageSource = normalizeQuizImageSource(widget.questionImageSource);
    content.correctionImageSource = normalizeQuizImageSource(widget.correctionImageSource ?? widget.questionImageSource);
    content.correctionImageOverridden = Boolean(widget.correctionOverrides?.image);
  }
  if (widget?.type === "audio") {
    content.questionAudioSource = normalizeQuizAudioSource(widget.questionAudioSource);
    content.correctionAudioSource = normalizeQuizAudioSource(widget.correctionAudioSource ?? widget.questionAudioSource);
    content.correctionAudioOverridden = Boolean(widget.correctionOverrides?.audio);
  }
  return content;
}

function normalizeVariantWidgetContent(source = {}, widget){
  const questionText = String(source.questionText ?? source.question_text ?? widget?.questionText ?? "");
  const correctionText = String(source.correctionText ?? source.correction_text ?? widget?.correctionText ?? questionText);
  return {
    questionText,
    questionFormatting: normalizeFormattingRuns(source.questionFormatting ?? source.question_formatting ?? widget?.questionFormatting, questionText.length),
    correctionText,
    correctionFormatting: normalizeFormattingRuns(
      source.correctionFormatting ?? source.correction_formatting ?? widget?.correctionFormatting,
      correctionText.length
    ),
    correctionTextOverridden: Boolean(
      source.correctionTextOverridden
      ?? source.correction_text_overridden
      ?? widget?.correctionOverrides?.text
    ),
    correctionFormattingOverridden: Boolean(
      source.correctionFormattingOverridden
      ?? source.correction_formatting_overridden
      ?? widget?.correctionOverrides?.formatting
    ),
    ...(widget?.type === "qcm-text" ? {
      qcmChoices: normalizeQcmChoices(source.qcmChoices ?? source.qcm_choices ?? widget.qcmChoices)
    } : {}),
    ...(widget?.type === "selection-words" ? {
      selectionExpectedTokenIndexes: normalizeQuizSelectionIndexes(
        source.selectionExpectedTokenIndexes ?? source.selection_expected_token_indexes ?? widget.selectionExpectedTokenIndexes,
        getQuizSelectionWordCount(questionText)
      )
    } : {}),
    ...(widget?.type === "image" ? {
      questionImageSource: normalizeQuizImageSource(
        source.questionImageSource ?? source.question_image_source ?? widget.questionImageSource
      ),
      correctionImageSource: normalizeQuizImageSource(
        source.correctionImageSource ?? source.correction_image_source ?? widget.correctionImageSource ?? widget.questionImageSource
      ),
      correctionImageOverridden: Boolean(
        source.correctionImageOverridden
        ?? source.correction_image_overridden
        ?? widget.correctionOverrides?.image
      )
    } : {}),
    ...(widget?.type === "audio" ? {
      questionAudioSource: normalizeQuizAudioSource(
        source.questionAudioSource ?? source.question_audio_source ?? widget.questionAudioSource
      ),
      correctionAudioSource: normalizeQuizAudioSource(
        source.correctionAudioSource ?? source.correction_audio_source ?? widget.correctionAudioSource ?? widget.questionAudioSource
      ),
      correctionAudioOverridden: Boolean(
        source.correctionAudioOverridden
        ?? source.correction_audio_overridden
        ?? widget.correctionOverrides?.audio
      )
    } : {})
  };
}

function normalizeQuizVariants(sourceVariants, widgets = []){
  const rawVariants = Array.isArray(sourceVariants) && sourceVariants.length ? sourceVariants : [{}];
  return rawVariants.map((variant, index) => {
    const safe = variant && typeof variant === "object" && !Array.isArray(variant) ? variant : {};
    const sourceContents = safe.widgetContents && typeof safe.widgetContents === "object"
      ? safe.widgetContents
      : safe.widget_contents && typeof safe.widget_contents === "object"
        ? safe.widget_contents
        : {};
    const widgetContents = {};
    widgets.forEach((widget) => {
      widgetContents[widget.id] = normalizeVariantWidgetContent(
        sourceContents[widget.id] || captureVariantWidgetContent(widget),
        widget
      );
    });
    return {
      id: String(safe.id || `variant-${index + 1}`).trim() || `variant-${index + 1}`,
      widgetContents
    };
  });
}

function applyVariantContentToWidget(widget, content = {}){
  const normalized = normalizeVariantWidgetContent(content, widget);
  return {
    ...widget,
    questionText: normalized.questionText,
    questionFormatting: normalized.questionFormatting,
    questionHtml: richTextModelToHtml(normalized.questionText, normalized.questionFormatting),
    correctionText: normalized.correctionText,
    correctionFormatting: normalized.correctionFormatting,
    correctionHtml: richTextModelToHtml(normalized.correctionText, normalized.correctionFormatting),
    ...(widget.type === "qcm-text" ? { qcmChoices:normalized.qcmChoices } : {}),
    ...(widget.type === "selection-words" ? { selectionExpectedTokenIndexes:normalized.selectionExpectedTokenIndexes } : {}),
    ...(widget.type === "image" ? {
      questionImageSource: normalized.questionImageSource,
      correctionImageSource: normalized.correctionImageSource
    } : {}),
    ...(widget.type === "audio" ? {
      questionAudioSource: normalized.questionAudioSource,
      correctionAudioSource: normalized.correctionAudioSource
    } : {}),
    correctionOverrides: {
      ...(widget.correctionOverrides || {}),
      text: normalized.correctionTextOverridden,
      formatting: normalized.correctionFormattingOverridden,
      ...(widget.type === "image" ? { image:normalized.correctionImageOverridden } : {}),
      ...(widget.type === "audio" ? { audio:normalized.correctionAudioOverridden } : {})
    }
  };
}

export function materializeQuizQuestionVariant(question = {}, variantIndex = 0){
  const widgets = Array.isArray(question.widgets) ? question.widgets : [];
  const variants = Array.isArray(question.variants) && question.variants.length
    ? question.variants
    : normalizeQuizVariants([], widgets);
  const safeIndex = Math.min(variants.length - 1, Math.max(0, Math.trunc(Number(variantIndex) || 0)));
  const variant = variants[safeIndex] || variants[0];
  const materializedWidgets = widgets.map((widget) => applyVariantContentToWidget(
    widget,
    variant?.widgetContents?.[widget.id] || captureVariantWidgetContent(widget)
  ));
  const answerWidgets = materializedWidgets.filter((widget) => widget.type === "answer");
  const qcmWidgets = materializedWidgets.filter((widget) => widget.type === "qcm-text");
  const selectionWidgets = materializedWidgets.filter((widget) => widget.type === "selection-words");
  const primaryAnswerWidget = answerWidgets[0] || null;
  const primaryQcmWidget = qcmWidgets[0] || null;
  const primarySelectionWidget = selectionWidgets[0] || null;
  const correctionView = primaryAnswerWidget ? getWidgetView(primaryAnswerWidget, "correction") : null;
  const correctQcmChoice = primaryQcmWidget?.qcmChoices?.find((choice) => choice.isCorrect) || null;
  const selectionExpectedTokenIndexes = primarySelectionWidget
    ? normalizeQuizSelectionIndexes(
        primarySelectionWidget.selectionExpectedTokenIndexes,
        getQuizSelectionWordCount(primarySelectionWidget.questionText)
      )
    : [];
  return {
    ...question,
    widgets: materializedWidgets,
    activeVariantIndex: safeIndex,
    variantId: variant?.id || "",
    variantCount: variants.length,
    answerWidgetCount: answerWidgets.length,
    qcmWidgetCount: qcmWidgets.length,
    selectionWidgetCount: selectionWidgets.length,
    responseWidgetCount: answerWidgets.length + qcmWidgets.length + selectionWidgets.length,
    responseType: primaryQcmWidget ? "qcm-text" : primarySelectionWidget ? "selection-words" : primaryAnswerWidget ? "answer" : "",
    primaryAnswerWidgetId: primaryAnswerWidget?.id || "",
    primaryQcmWidgetId: primaryQcmWidget?.id || "",
    primarySelectionWidgetId: primarySelectionWidget?.id || "",
    primaryAnswerVisibleInQuestion: Boolean(primaryAnswerWidget && getWidgetView(primaryAnswerWidget, "question")?.visible),
    primaryQcmVisibleInQuestion: Boolean(primaryQcmWidget && getWidgetView(primaryQcmWidget, "question")?.visible),
    primarySelectionVisibleInQuestion: Boolean(primarySelectionWidget && getWidgetView(primarySelectionWidget, "question")?.visible),
    expectedAnswer: primaryQcmWidget
      ? String(correctQcmChoice?.id || "")
      : primarySelectionWidget
        ? selectionExpectedTokenIndexes.join(",")
        : String(correctionView?.text || "").trim(),
    expectedAnswerLabel: primaryQcmWidget
      ? String(correctQcmChoice?.text || "").trim()
      : primarySelectionWidget
        ? formatQuizSelectionIndexes(primarySelectionWidget.questionText, selectionExpectedTokenIndexes)
        : String(correctionView?.text || "").trim(),
    expectedTokenIndexes: selectionExpectedTokenIndexes
  };
}

export function getWidgetView(widget, mode = "question"){
  if (!widget) return null;
  const visibilityState = getWidgetVisibilityState(widget, mode);
  if (widget.type === "numeric-keypad") {
    return normalizeViewBounds({
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
    });
  }
  if (widget.type === "image") {
    const correctionMode = mode === "correction";
    const overrides = widget.correctionOverrides || {};
    return normalizeViewBounds({
      html:"",
      text:"",
      formatting:[],
      placeholder:"",
      imageSource:correctionMode && overrides.image ? widget.correctionImageSource : widget.questionImageSource,
      column:correctionMode && overrides.position ? widget.correctionColumn : widget.column,
      row:correctionMode && overrides.position ? widget.correctionRow : widget.row,
      columnSpan:correctionMode && overrides.size ? widget.correctionColumnSpan : widget.columnSpan,
      rowSpan:correctionMode && overrides.size ? widget.correctionRowSpan : widget.rowSpan,
      textAlign:"center",
      verticalAlign:"middle",
      ...visibilityState
    });
  }
  if (widget.type === "audio") {
    const correctionMode = mode === "correction";
    const overrides = widget.correctionOverrides || {};
    return normalizeViewBounds({
      html:"",
      text:"",
      formatting:[],
      placeholder:"",
      audioSource:correctionMode && overrides.audio ? widget.correctionAudioSource : widget.questionAudioSource,
      column:correctionMode && overrides.position ? widget.correctionColumn : widget.column,
      row:correctionMode && overrides.position ? widget.correctionRow : widget.row,
      columnSpan:correctionMode && overrides.size ? widget.correctionColumnSpan : widget.columnSpan,
      rowSpan:correctionMode && overrides.size ? widget.correctionRowSpan : widget.rowSpan,
      textAlign:"center",
      verticalAlign:"middle",
      ...visibilityState
    });
  }
  if (widget.type === "selection-words") {
    const correctionMode = mode === "correction";
    const overrides = widget.correctionOverrides || {};
    return normalizeViewBounds({
      html:richTextModelToHtml(widget.questionText, widget.questionFormatting),
      text:widget.questionText,
      formatting:widget.questionFormatting,
      placeholder:widget.questionPlaceholder,
      selectionExpectedTokenIndexes:normalizeQuizSelectionIndexes(
        widget.selectionExpectedTokenIndexes,
        getQuizSelectionWordCount(widget.questionText)
      ),
      column:correctionMode && overrides.position ? widget.correctionColumn : widget.column,
      row:correctionMode && overrides.position ? widget.correctionRow : widget.row,
      columnSpan:correctionMode && overrides.size ? widget.correctionColumnSpan : widget.columnSpan,
      rowSpan:correctionMode && overrides.size ? widget.correctionRowSpan : widget.rowSpan,
      textAlign:correctionMode && overrides.textAlign ? widget.correctionTextAlign : widget.textAlign,
      verticalAlign:correctionMode && overrides.verticalAlign ? widget.correctionVerticalAlign : widget.verticalAlign,
      fontSize:correctionMode && overrides.fontSize ? widget.correctionFontSize : widget.fontSize,
      ...visibilityState
    });
  }
  if (widget.type === "qcm-text") {
    const correctionMode = mode === "correction";
    const overrides = widget.correctionOverrides || {};
    return normalizeViewBounds({
      html:"",
      text:"",
      formatting:[],
      placeholder:"",
      qcmChoices:normalizeQcmChoices(widget.qcmChoices),
      qcmLayout:normalizeQcmLayout(widget.qcmLayout),
      column:correctionMode && overrides.position ? widget.correctionColumn : widget.column,
      row:correctionMode && overrides.position ? widget.correctionRow : widget.row,
      columnSpan:correctionMode && overrides.size ? widget.correctionColumnSpan : widget.columnSpan,
      rowSpan:correctionMode && overrides.size ? widget.correctionRowSpan : widget.rowSpan,
      textAlign:correctionMode && overrides.textAlign ? widget.correctionTextAlign : widget.textAlign,
      verticalAlign:correctionMode && overrides.verticalAlign ? widget.correctionVerticalAlign : widget.verticalAlign,
      fontSize:correctionMode && overrides.fontSize ? widget.correctionFontSize : widget.fontSize,
      ...visibilityState
    });
  }
  if (mode !== "correction") {
    return normalizeViewBounds({
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
    });
  }

  const overrides = widget.correctionOverrides || {};
  const text = overrides.text ? widget.correctionText : widget.questionText;
  const formatting = overrides.formatting ? widget.correctionFormatting : widget.questionFormatting;
  return normalizeViewBounds({
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
  });
}


export function normalizeQuestionSelection(selection = {}){
  return normalizeCommonQuestionSelection(selection);
}

export function getQuizQuestionSelectionKey(question = {}, index = 0){
  return getItemSelectionKey(question, index);
}

export function filterQuizQuestionsBySelection(questions = [], selection = {}){
  const normalizedQuestions = (Array.isArray(questions) ? questions : [])
    .map(normalizeQuizQuestion)
    .filter((question) => question.widgets.length > 0);
  return filterItemsByQuestionSelection(normalizedQuestions, selection, {
    itemKeyGetter: getQuizQuestionSelectionKey
  });
}

// Chaque variante est une unité sélectionnable et tirable par l’activité. Cela
// vaut autant pour les séries que pour les quiz composés dans l’Atelier : une
// question peut elle aussi posséder plusieurs variantes.
export function getQuizSelectionItems(snapshot = {}){
  const normalizedSnapshot = normalizeQuizSnapshot(snapshot);
  const questions = normalizedSnapshot.questions;
  return questions.flatMap((question) => {
    const variants = Array.isArray(question.variants) && question.variants.length
      ? question.variants
      : normalizeQuizVariants([], question.widgets);
    const sourceQuestionKey = getQuizQuestionSelectionKey(question);
    return variants.map((variant, variantIndex) => ({
      ...question,
      // Une seule variante est conservée afin que le runtime ne refasse pas
      // un tirage aléatoire parmi les variantes de cette question.
      variants:[variant],
      variantCount:1,
      selectionKey:`variant:${question.id}:${variant.id || variantIndex}`,
      sourceQuestionKey,
      sourceQuestionId:question.id,
      sourceVariantIndex:variantIndex,
      sourceVariantId:String(variant.id || "")
    }));
  });
}

export function normalizeQuizSelectionForSnapshot(snapshot = {}, selection = {}){
  const normalizedSelection = normalizeQuestionSelection(selection);
  if (normalizedSelection.mode !== "custom") return normalizedSelection;

  const selectedKeys = new Set(normalizedSelection.questionKeys);
  const items = getQuizSelectionItems(snapshot);
  return {
    ...normalizedSelection,
    // Les anciennes activités sélectionnaient la question conteneur. Cette clé
    // continue donc de sélectionner toutes ses variantes.
    questionKeys:items
      .filter((item, index) => selectedKeys.has(getQuizQuestionSelectionKey(item, index)) || selectedKeys.has(item.sourceQuestionKey))
      .map((item, index) => getQuizQuestionSelectionKey(item, index))
  };
}

export function filterQuizSnapshotBySelection(snapshot = {}, selection = {}){
  const items = getQuizSelectionItems(snapshot);
  const normalizedSelection = normalizeQuizSelectionForSnapshot(snapshot, selection);
  return filterItemsByQuestionSelection(items, normalizedSelection, {
    itemKeyGetter:getQuizQuestionSelectionKey
  });
}

export function getQuizSelectionItemCount(snapshot = {}){
  const normalizedSnapshot = normalizeQuizSnapshot(snapshot);
  const questions = normalizedSnapshot.questions;
  return questions.reduce((total, question) => {
    const count = Array.isArray(question?.variants) && question.variants.length
      ? question.variants.length
      : 1;
    return total + count;
  }, 0);
}

export function getQuestionSelectionSignature(selection = {}){
  return getCommonQuestionSelectionSignature(selection);
}

export function createQuestionDeck(questions = [], drawMode = DEFAULT_DRAW_MODE){
  const deck = Array.isArray(questions) ? questions.map((question) => ({ ...question })) : [];
  if (drawMode !== "random") return deck;
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

export function evaluateAnswer(question, rawAnswer = ""){
  if (question?.responseType === "selection-words") {
    const expectedIndexes = normalizeQuizSelectionIndexes(question?.expectedTokenIndexes ?? question?.expectedAnswer, Infinity);
    const submittedIndexes = normalizeQuizSelectionIndexes(rawAnswer, Infinity);
    const isCorrect = expectedIndexes.length > 0
      && submittedIndexes.length === expectedIndexes.length
      && submittedIndexes.every((value, index) => value === expectedIndexes[index]);
    return {
      submittedAnswer:submittedIndexes.join(","),
      submittedTokenIndexes:submittedIndexes,
      expectedTokenIndexes:expectedIndexes,
      expectedAnswer:String(question?.expectedAnswerLabel || "").trim(),
      isCorrect
    };
  }
  const submittedAnswer = normalizeSubmittedAnswer(rawAnswer);
  const expectedAnswer = normalizeSubmittedAnswer(question?.expectedAnswer || "");
  return {
    submittedAnswer,
    expectedAnswer: String(question?.expectedAnswerLabel || question?.expectedAnswer || "").trim(),
    isCorrect: Boolean(submittedAnswer) && Boolean(expectedAnswer) && submittedAnswer === expectedAnswer
  };
}

export function normalizeSubmittedAnswer(value = ""){
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

export function getQuizTestIssues(snapshot = {}){
  const quiz = normalizeQuizSnapshot(snapshot);
  const issues = [];
  if (!quiz.questions.length) issues.push("Ajoutez au moins une question.");
  quiz.questions.forEach((question, index) => {
    const variants = Array.from({ length: Math.max(1, question.variants?.length || 1) }, (_, variantIndex) => (
      materializeQuizQuestionVariant(question, variantIndex)
    ));
    variants.forEach((variant, variantIndex) => {
      const suffix = variants.length > 1 ? `, variante ${variantIndex + 1}` : "";
      if (variant.responseWidgetCount !== 1) {
        issues.push(`La question ${index + 1}${suffix} doit contenir exactement un widget de réponse (« Réponse de l’élève », « QCM » ou « Sélection de mots »).`);
      } else if (variant.responseType === "answer" && !variant.primaryAnswerVisibleInQuestion) {
        issues.push(`Affichez la zone « Réponse de l’élève » de la question ${index + 1}${suffix} dans la vue Question.`);
      } else if (variant.responseType === "qcm-text" && !variant.primaryQcmVisibleInQuestion) {
        issues.push(`Affichez le QCM de la question ${index + 1}${suffix} dans la vue Question.`);
      } else if (variant.responseType === "selection-words" && !variant.primarySelectionVisibleInQuestion) {
        issues.push(`Affichez la sélection de mots de la question ${index + 1}${suffix} dans la vue Question.`);
      } else if (variant.responseType === "qcm-text") {
        const qcm = variant.widgets.find((widget) => widget.type === "qcm-text");
        const filledChoices = (qcm?.qcmChoices || []).filter((choice) => String(choice.text || "").trim());
        if (filledChoices.length < QCM_MIN_CHOICES || !filledChoices.some((choice) => choice.isCorrect)) {
          issues.push(`Renseignez au moins une bonne réponse et un distracteur dans le QCM de la question ${index + 1}${suffix}.`);
        }
      } else if (variant.responseType === "selection-words" && !variant.expectedTokenIndexes?.length) {
        issues.push(`Sélectionnez au moins un mot attendu dans la correction de la question ${index + 1}${suffix}.`);
      } else if (!variant.expectedAnswer) {
        issues.push(`Renseignez la réponse attendue de la question ${index + 1}${suffix} dans la vue Correction.`);
      }
    });
  });
  return issues;
}

function normalizeCorrectionVisibility(value, fallback = "visible"){
  const safe = String(value || "").trim().toLowerCase();
  return CORRECTION_VISIBILITY_MODES.has(safe) ? safe : fallback;
}

function getWidgetVisibilityState(widget, mode = "question"){
  if (widget?.type === "numeric-keypad") {
    const visible = mode !== "correction";
    return { visible, visibilityMode:visible ? "visible" : "hidden" };
  }
  if (mode !== "correction") {
    const visible = widget?.questionVisible !== false;
    return { visible, visibilityMode:visible ? "visible" : "hidden" };
  }
  const inheritedMode = widget?.questionVisible !== false ? "visible" : "hidden";
  const overrides = widget?.correctionOverrides || {};
  const visibilityMode = overrides.visibility
    ? normalizeCorrectionVisibility(
        widget?.correctionVisibility,
        widget?.correctionVisible === false ? "hidden" : "visible"
      )
    : inheritedMode;
  return { visible:visibilityMode !== "hidden", visibilityMode };
}

function normalizeCorrectionOverrides(value = {}){
  const safe = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const legacyContent = Boolean(safe.content);
  return {
    text: Boolean(safe.text ?? legacyContent),
    formatting: Boolean(safe.formatting ?? legacyContent),
    position: Boolean(safe.position),
    size: Boolean(safe.size),
    textAlign: Boolean(safe.textAlign ?? safe.text_align),
    verticalAlign: Boolean(safe.verticalAlign ?? safe.vertical_align),
    fontSize: Boolean(safe.fontSize ?? safe.font_size),
    visibility: Boolean(safe.visibility),
    image: Boolean(safe.image),
    audio: Boolean(safe.audio)
  };
}

function normalizeViewBounds(view){
  const columnSpan = clampInt(view.columnSpan, 1, GRID_COLUMNS, 1);
  const rowSpan = clampInt(view.rowSpan, 1, GRID_ROWS, 1);
  return {
    ...view,
    columnSpan,
    rowSpan,
    column: clampInt(view.column, 1, GRID_COLUMNS - columnSpan + 1, 1),
    row: clampInt(view.row, 1, GRID_ROWS - rowSpan + 1, 1),
    textAlign: normalizeTextAlign(view.textAlign),
    verticalAlign: normalizeVerticalAlign(view.verticalAlign),
    fontSize: normalizeQuizFontSize(view.fontSize),
    visible: view.visible !== false
  };
}

function normalizeTextAlign(value){
  const safe = String(value || "center").trim().toLowerCase();
  return ["left", "center", "right"].includes(safe) ? safe : "center";
}

function normalizeVerticalAlign(value){
  const safe = String(value || "middle").trim().toLowerCase();
  return ["top", "middle", "bottom"].includes(safe) ? safe : "middle";
}

function normalizeQuizFontSize(value){
  const safe = String(value || "normal").trim().toLowerCase();
  return QUIZ_FONT_SIZES.has(safe) ? safe : "normal";
}

function normalizeFormattingRuns(runs, textLength){
  const colors = new Set(["#d32f2f", "#2e7d32", "#1565c0", "#d49a00"]);
  const normalized = (Array.isArray(runs) ? runs : [])
    .map((run) => ({
      start: clampInt(run?.start, 0, textLength, 0),
      end: clampInt(run?.end, 0, textLength, 0),
      bold: Boolean(run?.bold),
      italic: Boolean(run?.italic),
      underline: Boolean(run?.underline),
      color: colors.has(String(run?.color || "").trim().toLowerCase())
        ? String(run.color).trim().toLowerCase()
        : ""
    }))
    .filter((run) => run.end > run.start)
    .sort((first, second) => first.start - second.start || first.end - second.end);
  return normalized;
}

function richTextModelToHtml(text, formatting = []){
  const rawText = String(text ?? "");
  const runs = normalizeFormattingRuns(formatting, rawText.length);
  if (!runs.length) return escapeHtml(rawText).replace(/\r?\n/g, "<br>");
  let cursor = 0;
  const chunks = [];
  const append = (value, run = null) => {
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
    if (run.start > cursor) append(rawText.slice(cursor, run.start));
    append(rawText.slice(run.start, run.end), run);
    cursor = Math.max(cursor, run.end);
  });
  if (cursor < rawText.length) append(rawText.slice(cursor));
  return chunks.join("");
}

function migrateHorizontalArea(column, columnSpan, sourceColumns = GRID_COLUMNS, fallbackSpan = 1){
  const fromColumns = Math.max(1, Math.trunc(Number(sourceColumns) || GRID_COLUMNS));
  const safeColumn = clampInt(column, 1, fromColumns, 1);
  const safeSpan = clampInt(columnSpan, 1, fromColumns - safeColumn + 1, fallbackSpan);
  if (fromColumns === GRID_COLUMNS) return { column: safeColumn, columnSpan: safeSpan };

  const start = Math.round(((safeColumn - 1) / fromColumns) * GRID_COLUMNS);
  const end = Math.round(((safeColumn - 1 + safeSpan) / fromColumns) * GRID_COLUMNS);
  const migratedColumn = clampInt(start + 1, 1, GRID_COLUMNS, 1);
  const migratedSpan = clampInt(Math.max(1, end - start), 1, GRID_COLUMNS - migratedColumn + 1, 1);
  return { column: migratedColumn, columnSpan: migratedSpan };
}

function clampInt(value, min, max, fallback){
  const number = Number(value);
  const safe = Number.isFinite(number) ? Math.trunc(number) : fallback;
  return Math.min(max, Math.max(min, safe));
}

function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export { GRID_COLUMNS, GRID_ROWS, DEFAULT_DRAW_MODE, DEFAULT_QUESTION_SELECTION_MODE };
