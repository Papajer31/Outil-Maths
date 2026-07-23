const RESPONSE_WIDGET_TYPES = new Set(["answer", "qcm-text", "selection-words"]);
const SERIES_ALLOWED_WIDGET_TYPES = new Set(["text", "answer", "qcm-text", "selection-words"]);

export const QUESTION_MODELS = Object.freeze([
  {
    id: "free-layout",
    icon: "grid_view",
    title: "Disposition libre",
    description: "Un canevas ouvert avec une consigne sur la première ligne.",
    widgets: [
      {
        type: "text",
        label: "Consigne",
        questionText: "",
        correctionText: "",
        questionPlaceholder: "Consigne de la question",
        correctionPlaceholder: "Consigne de la question",
        column: 1,
        row: 1,
        columnSpan: 12,
        rowSpan: 1,
        visibility: "both"
      }
    ]
  },
  {
    id: "text-simple",
    icon: "short_text",
    title: "Questions textuelles simples",
    description: "Consigne, texte central, réponse textuelle puis explication facultative.",
    widgets: [
      {
        type: "text",
        label: "Consigne",
        questionText: "",
        correctionText: "",
        questionPlaceholder: "Consigne de la question",
        correctionPlaceholder: "Consigne de la question",
        column: 1,
        row: 1,
        columnSpan: 12,
        rowSpan: 1,
        visibility: "both"
      },
      {
        type: "text",
        label: "Texte",
        questionText: "",
        correctionText: "",
        questionPlaceholder: "Texte de la question",
        correctionPlaceholder: "Texte de la question",
        column: 2,
        row: 3,
        columnSpan: 10,
        rowSpan: 2,
        visibility: "both"
      },
      {
        type: "answer",
        label: "Réponse de l’élève",
        questionText: "",
        correctionText: "",
        questionPlaceholder: "Réponse de l’élève",
        correctionPlaceholder: "Saisissez la réponse attendue",
        column: 3,
        row: 6,
        columnSpan: 8,
        rowSpan: 1,
        visibility: "both",
        textAlign: "center",
        verticalAlign: "middle"
      },
      {
        type: "text",
        label: "Explication",
        questionText: "",
        correctionText: "",
        questionPlaceholder: "",
        correctionPlaceholder: "Explication complémentaire de la correction",
        column: 1,
        row: 8,
        columnSpan: 12,
        rowSpan: 1,
        visibility: "correction"
      }
    ]
  },
  {
    id: "qcm",
    icon: "quiz",
    title: "QCM",
    description: "Consigne, texte, quatre propositions puis explication facultative.",
    widgets: [
      {
        type: "text",
        label: "Consigne",
        questionText: "",
        correctionText: "",
        questionPlaceholder: "Consigne de la question",
        correctionPlaceholder: "Consigne de la question",
        column: 1,
        row: 1,
        columnSpan: 12,
        rowSpan: 1,
        visibility: "both"
      },
      {
        type: "text",
        label: "Texte",
        questionText: "",
        correctionText: "",
        questionPlaceholder: "Texte de la question",
        correctionPlaceholder: "Texte de la question",
        column: 2,
        row: 3,
        columnSpan: 10,
        rowSpan: 2,
        visibility: "both"
      },
      {
        type: "qcm-text",
        label: "QCM",
        column: 2,
        row: 6,
        columnSpan: 10,
        rowSpan: 2,
        visibility: "both",
        qcmChoices: [
          { text: "", isCorrect: true },
          { text: "", isCorrect: false },
          { text: "", isCorrect: false },
          { text: "", isCorrect: false }
        ]
      },
      {
        type: "text",
        label: "Explication",
        questionText: "",
        correctionText: "",
        questionPlaceholder: "",
        correctionPlaceholder: "Explication complémentaire de la correction",
        column: 1,
        row: 8,
        columnSpan: 12,
        rowSpan: 1,
        visibility: "correction"
      }
    ]
  },
  {
    id: "selection-words",
    icon: "touch_app",
    title: "Sélection de mots dans une phrase",
    description: "Consigne, phrase à analyser, sélection attendue puis explication facultative.",
    widgets: [
      {
        type: "text",
        label: "Consigne",
        questionText: "",
        correctionText: "",
        questionPlaceholder: "Consigne de la question",
        correctionPlaceholder: "Consigne de la question",
        column: 1,
        row: 1,
        columnSpan: 12,
        rowSpan: 1,
        visibility: "both"
      },
      {
        type: "selection-words",
        label: "Sélection de mots",
        questionText: "",
        correctionText: "",
        questionPlaceholder: "Texte avec plusieurs mots pour sélection",
        correctionPlaceholder: "Texte avec plusieurs mots pour sélection",
        column: 2,
        row: 3,
        columnSpan: 10,
        rowSpan: 4,
        visibility: "both",
        selectionExpectedTokenIndexes: []
      },
      {
        type: "text",
        label: "Explication",
        questionText: "",
        correctionText: "",
        questionPlaceholder: "",
        correctionPlaceholder: "Explication complémentaire de la correction",
        column: 1,
        row: 8,
        columnSpan: 12,
        rowSpan: 1,
        visibility: "correction"
      }
    ]
  }
]);

function widgetSortValue(widget = {}, index = 0){
  return {
    row: Math.max(1, Number(widget.row) || 1),
    column: Math.max(1, Number(widget.column) || 1),
    index
  };
}

function compareWidgets(first, second){
  return first.order.row - second.order.row
    || first.order.column - second.order.column
    || first.order.index - second.order.index;
}

function isVisibleInQuestion(widget = {}){
  if (widget.questionVisible !== undefined) return widget.questionVisible !== false;
  return String(widget.visibility || "both") !== "correction";
}

function isVisibleInCorrection(widget = {}){
  if (widget.correctionVisible !== undefined) return widget.correctionVisible !== false;
  return String(widget.visibility || "both") !== "question";
}

function getIndicatorForWidget(widget = {}){
  if (widget.type === "answer") return "RÉPONSE";
  if (widget.type === "qcm-text") return "QCM";
  if (widget.type === "selection-words") return "SÉLECTION";
  if (widget.type === "text" && !isVisibleInQuestion(widget) && isVisibleInCorrection(widget)) return "EXPLICATION";
  if (widget.type === "text") return "TEXTE";
  return "";
}

export function getQuestionModelById(modelId){
  const safeId = String(modelId || "").trim();
  return QUESTION_MODELS.find((model) => model.id === safeId) || null;
}

export function analyzeSeriesQuestionModel(model = {}){
  const widgets = Array.isArray(model.widgets) ? model.widgets : [];
  const indexed = widgets
    .map((widget, index) => ({ widget, index, order: widgetSortValue(widget, index) }))
    .sort(compareWidgets);
  const instructionEntry = indexed.find(({ widget }) => (
    widget.type === "text"
    && Math.max(1, Number(widget.row) || 1) === 1
    && isVisibleInQuestion(widget)
  )) || null;
  const responseEntries = indexed.filter(({ widget }) => RESPONSE_WIDGET_TYPES.has(String(widget.type || "")));
  const unsupportedEntries = indexed.filter(({ widget }) => !SERIES_ALLOWED_WIDGET_TYPES.has(String(widget.type || "")));
  const reasons = [];

  if (!instructionEntry) reasons.push("Le modèle ne possède pas de consigne textuelle sur la première ligne.");
  if (responseEntries.length !== 1) reasons.push("Le modèle doit contenir exactement un widget de réponse.");
  if (unsupportedEntries.length) reasons.push("Le modèle contient un widget non textuel.");

  const variableEntries = indexed.filter((entry) => entry !== instructionEntry);
  const fields = variableEntries.map(({ widget, index }) => {
    if (widget.type === "answer") {
      return { kind: "answer", widgetIndex: index, label: "Réponse", required: true };
    }
    if (widget.type === "qcm-text") {
      return {
        kind: "qcm",
        widgetIndex: index,
        label: "QCM",
        required: true,
        choiceCount: Math.max(2, Math.min(6, Array.isArray(widget.qcmChoices) ? widget.qcmChoices.length : 4))
      };
    }
    if (widget.type === "selection-words") {
      return { kind: "selection", widgetIndex: index, label: "Sélection", required: true };
    }
    if (widget.type === "text" && !isVisibleInQuestion(widget) && isVisibleInCorrection(widget)) {
      return { kind: "explanation", widgetIndex: index, label: "Explication", required: false };
    }
    return {
      kind: "text",
      widgetIndex: index,
      label: String(widget.label || "Texte").trim() || "Texte",
      required: true
    };
  });

  const indicators = [];
  variableEntries.forEach(({ widget }) => {
    const indicator = getIndicatorForWidget(widget);
    if (indicator && !indicators.includes(indicator)) indicators.push(indicator);
  });

  const responseType = responseEntries[0]?.widget?.type || "";
  return {
    compatible: reasons.length === 0,
    reasons,
    model,
    instructionWidgetIndex: instructionEntry?.index ?? -1,
    instructionWidget: instructionEntry?.widget || null,
    responseWidgetIndex: responseEntries[0]?.index ?? -1,
    responseType,
    fields,
    indicators
  };
}

export function getSeriesCompatibleQuestionModels(){
  return QUESTION_MODELS
    .map((model) => ({ model, analysis: analyzeSeriesQuestionModel(model) }))
    .filter(({ analysis }) => analysis.compatible);
}
