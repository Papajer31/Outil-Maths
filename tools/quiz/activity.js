import {
  createQuestionDeck,
  evaluateAnswer,
  filterQuizSnapshotBySelection,
  getQuestionSelectionSignature,
  getWidgetView,
  materializeQuizQuestionVariant,
  normalizeQuizSnapshot,
  normalizeSettings
} from "./model.js";
import { resolveQuizImageSourceUrl } from "../../shared/quiz-local-image-store.js";
import { resolveQuizAudioSourceUrl } from "../../shared/quiz-audio-source.js";
import { ensureToolUiStyles } from "../../shared/tool-ui/tool-ui.js";
import { bindNumericKeypadEvents, renderNumericKeypad } from "../../shared/tool-ui/numeric-keypad.js";
import {
  clientPointToLocalPoint,
  clientRectToLocalRect
} from "../../shared/tool-ui/drag-core.js";
import {
  normalizeQuizSelectionIndexes,
  renderQuizSelectionTextToHtml
} from "../../shared/quiz-selection-text.js";
let stylesInjected = false;

export function createActivity(initialContext = {}){
  injectStyles();
  const state = createRuntimeState(initialContext);

  return {
    mount(container, context = initialContext){
      state.container = container;
      state.latestContext = context ?? state.latestContext;
      renderShell(state);
      syncValidateState(state);
    },

    async next(container, context = initialContext){
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      if (!state.container) return;
      if (!state.root) renderShell(state);
      loadNextQuestion(state, state.latestContext ?? {});
    },

    showAnswer(container, context = initialContext){
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      revealAnswer(state);
    },

    getShellAnswerDisplayState(container, context = state.latestContext){
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      return getShellAnswerDisplayState(state);
    },

    setShellAnswerDisplayMode(container, context = state.latestContext, mode = "correction"){
      state.container = container || state.container;
      state.latestContext = context ?? state.latestContext;
      return applyShellAnswerDisplayMode(state, mode);
    },

    supportsShellValidation(context = state.latestContext){
      return getResponseUi(context) === "boxed";
    },

    canValidate(){
      return canSubmitAnswer(state);
    },

    validate(){
      if (!canSubmitAnswer(state)) return false;
      requestReveal(state);
      return true;
    },

    unmount(container){
      teardownState(state, container || state.container);
    }
  };
}

function createRuntimeState(initialContext = {}){
  return {
    container: null,
    latestContext: initialContext,
    root: null,
    canvasEl: null,
    currentQuestion: null,
    questions: [],
    deck: [],
    deckIndex: 0,
    loadedSignature: "",
    answerInputEl: null,
    inputAbortController: null,
    keypadAbortController: null,
    qcmAbortController: null,
    selectionAbortController: null,
    labelsAbortController: null,
    labelsResizeObserver: null,
    labelsLayoutFrame: 0,
    audioAbortController: null,
    activeAudioEl: null,
    qcmResizeObserver: null,
    qcmFitTimers: [],
    qcmChoiceFontSizes: new Map(),
    textResizeObserver: null,
    textFitTimers: [],
    answerRevealed: false,
    submittedAnswer: "",
    responseDraftValue: "",
    pendingValidationValue: "",
    selectedChoiceId: "",
    selectedTokenIndexes: [],
    submittedTokenIndexes: [],
    categoryAssignments: new Map(),
    submittedCategoryAssignments: new Map(),
    submittedCategoryLabelOrder: new Map(),
    labelPositions: new Map(),
    activeLabelDrag: null,
    answerDisplayMode: "correction"
  };
}

function renderShell(state){
  const container = state.container;
  if (!container) return;

  container.innerHTML = `
    <div
      class="tool-runtime tool-runtime--quiz quiz-runtime-root"
      id="quiz_runtime_canvas"
      aria-live="polite"
    ></div>
  `;

  state.root = container.querySelector(".quiz-runtime-root");
  state.canvasEl = state.root;
}

function loadNextQuestion(state, context = {}){
  const settings = normalizeSettings(context?.settings);
  ensureQuestionsLoaded(state, settings);

  state.answerRevealed = false;
  state.submittedAnswer = "";
  state.responseDraftValue = "";
  state.pendingValidationValue = "";
  state.selectedChoiceId = "";
  state.selectedTokenIndexes = [];
  state.submittedTokenIndexes = [];
  state.categoryAssignments.clear();
  state.submittedCategoryAssignments.clear();
  state.submittedCategoryLabelOrder.clear();
  state.labelPositions.clear();
  state.activeLabelDrag = null;
  state.answerDisplayMode = "correction";
  state.qcmChoiceFontSizes.clear();
  state.currentQuestion = pickNextQuestion(state, settings);

  renderCurrentView(state);
  syncValidateState(state);
  focusPrimaryInput(state);
}

function ensureQuestionsLoaded(state, settings){
  const snapshot = normalizeQuizSnapshot(settings.quizSnapshot || {});
  const signature = JSON.stringify({
    drawMode: settings.drawMode,
    questionSelection: getQuestionSelectionSignature(settings.questionSelection),
    snapshot
  });
  if (signature === state.loadedSignature && state.questions.length) return;

  // Le runtime ne dépend pas des champs récapitulatifs calculés par l’Atelier.
  // Il relit les vrais widgets afin que la question survive intacte aux étapes
  // de clonage et de normalisation du moteur de séance.
  state.questions = filterQuizSnapshotBySelection(snapshot, settings.questionSelection)
    .map(buildRunnableQuestion)
    .filter(Boolean);
  state.deck = createQuestionDeck(state.questions, settings.drawMode);
  state.deckIndex = 0;
  state.loadedSignature = signature;
}

function buildRunnableQuestion(question){
  const variantCount = Math.max(1, question?.variants?.length || 1);
  const runnableVariants = Array.from({ length:variantCount }, (_, variantIndex) => {
    const variant = materializeQuizQuestionVariant(question, variantIndex);
    const widgets = Array.isArray(variant?.widgets) ? variant.widgets : [];
    const answerWidgets = widgets.filter((widget) => widget?.type === "answer");
    const qcmWidgets = widgets.filter((widget) => widget?.type === "qcm-text");
    const selectionWidgets = widgets.filter((widget) => widget?.type === "selection-words");
    const categoriesWidgets = widgets.filter((widget) => widget?.type === "categories");
    if (answerWidgets.length + qcmWidgets.length + selectionWidgets.length + categoriesWidgets.length !== 1) return null;

    if (qcmWidgets.length === 1) {
      const qcmWidget = qcmWidgets[0];
      const questionView = getWidgetView(qcmWidget, "question");
      const choices = (Array.isArray(qcmWidget.qcmChoices) ? qcmWidget.qcmChoices : [])
        .filter((choice) => String(choice?.text || "").trim())
        .map((choice) => ({ ...choice }));
      const correctChoice = choices.find((choice) => choice.isCorrect) || null;
      if (!questionView?.visible || choices.length < 2 || !correctChoice) return null;
      qcmWidget.qcmChoices = choices;
      return {
        ...variant,
        widgets,
        responseType:"qcm-text",
        qcmWidgetCount:1,
        answerWidgetCount:0,
        primaryQcmWidgetId:qcmWidget.id || "",
        primaryQcmVisibleInQuestion:true,
        expectedAnswer:String(correctChoice.id || ""),
        expectedAnswerLabel:String(correctChoice.text || "").trim()
      };
    }

    if (selectionWidgets.length === 1) {
      const selectionWidget = selectionWidgets[0];
      const questionView = getWidgetView(selectionWidget, "question");
      const expectedTokenIndexes = normalizeQuizSelectionIndexes(
        selectionWidget.selectionExpectedTokenIndexes,
        Infinity
      );
      if (!questionView?.visible || !String(questionView.text || "").trim() || !expectedTokenIndexes.length) return null;
      return {
        ...variant,
        widgets,
        responseType:"selection-words",
        selectionWidgetCount:1,
        answerWidgetCount:0,
        qcmWidgetCount:0,
        primarySelectionWidgetId:selectionWidget.id || "",
        primarySelectionVisibleInQuestion:true,
        expectedTokenIndexes,
        expectedAnswer:expectedTokenIndexes.join(","),
        expectedAnswerLabel:String(variant?.expectedAnswerLabel || "").trim()
      };
    }

    if (categoriesWidgets.length === 1) {
      const categoriesWidget = categoriesWidgets[0];
      const labelsWidget = widgets.find((widget) => widget?.type === "labels" && widget.id === categoriesWidget.labelsSourceWidgetId) || null;
      const questionView = getWidgetView(categoriesWidget, "question");
      const labelsView = labelsWidget ? getWidgetView(labelsWidget, "question") : null;
      const labelItems = Array.isArray(labelsWidget?.labelItems)
        ? labelsWidget.labelItems.filter((item) => String(item?.text || "").trim())
        : [];
      const categoryItems = Array.isArray(categoriesWidget.categoryItems) ? categoriesWidget.categoryItems : [];
      const expectedAssignments = variant.expectedCategoryAssignments && typeof variant.expectedCategoryAssignments === "object"
        ? variant.expectedCategoryAssignments
        : {};
      const assignedIds = Object.keys(expectedAssignments);
      if (!questionView?.visible || !labelsView?.visible || !labelsWidget || labelItems.length === 0 || categoryItems.length < 2) return null;
      if (!variant.categoryAssignmentValid || assignedIds.length !== labelItems.length) return null;
      return {
        ...variant,
        widgets,
        responseType:"categories",
        categoriesWidgetCount:1,
        answerWidgetCount:0,
        qcmWidgetCount:0,
        selectionWidgetCount:0,
        primaryCategoriesWidgetId:categoriesWidget.id || "",
        primaryCategoriesVisibleInQuestion:true,
        primaryLabelsWidgetId:labelsWidget.id || "",
        expectedCategoryAssignments:{ ...expectedAssignments },
        expectedAnswer:JSON.stringify(expectedAssignments),
        expectedAnswerLabel:"Classement attendu"
      };
    }

    const answerWidget = answerWidgets[0];
    const questionView = getWidgetView(answerWidget, "question");
    const correctionView = getWidgetView(answerWidget, "correction");
    const expectedAnswer = String(correctionView?.text ?? variant?.expectedAnswer ?? "").trim();
    if (!questionView?.visible || !expectedAnswer) return null;

    return {
      ...variant,
      widgets,
      responseType:"answer",
      answerWidgetCount:1,
      primaryAnswerWidgetId:answerWidget.id || "",
      primaryAnswerVisibleInQuestion:true,
      expectedAnswer
    };
  }).filter(Boolean);

  if (!runnableVariants.length) return null;
  return { ...question, runnableVariants };
}

function pickNextQuestion(state, settings){
  if (!state.questions.length) return null;
  if (!state.deck.length || state.deckIndex >= state.deck.length) {
    state.deck = createQuestionDeck(state.questions, settings.drawMode);
    state.deckIndex = 0;
  }
  const question = state.deck[state.deckIndex] || state.questions[0];
  state.deckIndex += 1;
  const variants = Array.isArray(question?.runnableVariants) ? question.runnableVariants : [];
  if (!variants.length) return null;
  const selected = variants[Math.floor(Math.random() * variants.length)] || variants[0] || null;
  if (!selected) return null;
  const current = {
    ...selected,
    widgets:(selected.widgets || []).map((widget) => ({
      ...widget,
      qcmChoices:Array.isArray(widget.qcmChoices) ? widget.qcmChoices.map((choice) => ({ ...choice })) : [],
      labelItems:Array.isArray(widget.labelItems) ? widget.labelItems.map((item) => ({ ...item })) : [],
      categoryItems:Array.isArray(widget.categoryItems) ? widget.categoryItems.map((item) => ({ ...item, labelIds:Array.isArray(item.labelIds) ? [...item.labelIds] : [] })) : [],
      selectionExpectedTokenIndexes:Array.isArray(widget.selectionExpectedTokenIndexes)
        ? [...widget.selectionExpectedTokenIndexes]
        : []
    }))
  };
  if (current.responseType === "qcm-text") {
    const qcmWidget = current.widgets.find((widget) => widget.type === "qcm-text");
    if (qcmWidget) qcmWidget.qcmChoices = shuffleItems(qcmWidget.qcmChoices);
  }
  if (current.responseType === "categories") {
    const labelsWidget = current.widgets.find((widget) => widget.type === "labels" && widget.id === current.primaryLabelsWidgetId);
    if (labelsWidget) labelsWidget.labelItems = shuffleItems(labelsWidget.labelItems, { ensureDifferent:true });
  }
  return current;
}

function shuffleItems(items = [], { ensureDifferent = false } = {}){
  const source = Array.isArray(items) ? items : [];
  const shuffled = source.map((item) => ({ ...item }));
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  if (ensureDifferent && shuffled.length > 1 && shuffled.every((item, index) => item.id === source[index]?.id)) {
    [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
  }
  return shuffled;
}

function renderCurrentView(state){
  state.root?.classList.remove("quiz-runtime-root--correct", "quiz-runtime-root--incorrect", "quiz-runtime-root--revealed", "quiz-runtime-root--empty");

  if (!state.currentQuestion) {
    teardownInputBindings(state);
    renderEmptyQuestion(state);
    return;
  }

  const mode = state.answerRevealed ? "correction" : "question";
  if (state.answerRevealed) {
    const evaluation = getStoredEvaluation(state);
    state.root?.classList.add("quiz-runtime-root--revealed");
    state.root?.classList.toggle("quiz-runtime-root--correct", evaluation.isCorrect);
    state.root?.classList.toggle("quiz-runtime-root--incorrect", !evaluation.isCorrect);
  }

  if (!state.canvasEl) return;
  state.canvasEl.dataset.quizRuntimeMode = mode;
  if (state.answerRevealed && patchCorrectionView(state)) return;

  teardownInputBindings(state);
  state.canvasEl.innerHTML = state.currentQuestion.widgets
    .map((widget) => renderWidget(state, widget, mode))
    .join("");

  state.answerInputEl = state.canvasEl.querySelector("[data-quiz-runtime-answer-input]");
  if (state.answerInputEl) {
    state.answerInputEl.value = state.responseDraftValue;
    bindAnswerInput(state);
  }
  bindRuntimeNumericKeypad(state);
  bindRuntimeQcm(state);
  bindRuntimeSelection(state);
  bindRuntimeLabels(state);
  bindRuntimeAudios(state);
  hydrateRuntimeImages(state);
  hydrateRuntimeAudios(state);
  scheduleRuntimeTextFit(state);
  scheduleRuntimeQcmFit(state);
}

function patchCorrectionView(state){
  const canvas = state.canvasEl;
  if (!canvas || !state.currentQuestion) return false;

  teardownInputBindings(state);
  state.answerInputEl = null;

  const widgets = Array.isArray(state.currentQuestion.widgets) ? state.currentQuestion.widgets : [];
  const visibleWidgetIds = new Set();
  let needsImageHydration = false;
  let needsAudioHydration = false;
  let needsQcmFit = false;

  widgets.forEach((widget, index) => {
    const view = getWidgetView(widget, "correction");
    const widgetId = String(widget?.id || "");
    if (!widgetId) return;
    const node = findRuntimeWidgetNode(canvas, widgetId);

    if (!isRuntimeWidgetVisible(state, view, "correction")) {
      node?.remove();
      return;
    }
    visibleWidgetIds.add(widgetId);

    if (widget.type === "qcm-text" && node) {
      if (patchQcmCorrectionWidget(state, node, widget, view)) return;
      needsQcmFit = true;
    }

    const questionView = getWidgetView(widget, "question");
    const unchangedStaticWidget = node
      && widget.type !== "answer"
      && widget.type !== "numeric-keypad"
      && widget.type !== "qcm-text"
      && widget.type !== "selection-words"
      && widget.type !== "labels"
      && widget.type !== "categories"
      && getRuntimeWidgetViewSignature(widget, questionView) === getRuntimeWidgetViewSignature(widget, view);
    if (unchangedStaticWidget) return;

    const replacement = createRuntimeWidgetNode(renderWidget(state, widget, "correction"));
    if (!replacement) {
      node?.remove();
      return;
    }
    if (node) node.replaceWith(replacement);
    else insertRuntimeWidgetNode(canvas, replacement, widgets, index);
    needsImageHydration ||= widget.type === "image";
    needsAudioHydration ||= widget.type === "audio";
    needsQcmFit ||= widget.type === "qcm-text";
  });

  Array.from(canvas.querySelectorAll("[data-quiz-runtime-widget-id]")).forEach((node) => {
    if (!visibleWidgetIds.has(String(node.dataset.quizRuntimeWidgetId || ""))) node.remove();
  });

  bindRuntimeAudios(state);
  bindRuntimeLabels(state);
  if (needsImageHydration) hydrateRuntimeImages(state);
  if (needsAudioHydration) hydrateRuntimeAudios(state);
  scheduleRuntimeTextFit(state);
  if (needsQcmFit) scheduleRuntimeQcmFit(state);
  return true;
}

function getRuntimeWidgetViewSignature(widget, view){
  return JSON.stringify({
    visible: Boolean(view?.visible),
    visibilityMode: String(view?.visibilityMode || "visible"),
    style: getWidgetStyle(view),
    label: String(widget?.label || ""),
    html: String(view?.html || ""),
    imageSource: view?.imageSource || null,
    audioSource: view?.audioSource || null,
    labelItems: view?.labelItems || null,
    labelsSourceWidgetId: String(view?.labelsSourceWidgetId || ""),
    categoryItems: view?.categoryItems || null
  });
}

function findRuntimeWidgetNode(canvas, widgetId){
  return Array.from(canvas.querySelectorAll("[data-quiz-runtime-widget-id]"))
    .find((node) => node.dataset.quizRuntimeWidgetId === widgetId) || null;
}

function createRuntimeWidgetNode(markup){
  const template = document.createElement("template");
  template.innerHTML = String(markup || "").trim();
  return template.content.firstElementChild;
}

function insertRuntimeWidgetNode(canvas, node, widgets, index){
  const followingWidgetIds = widgets.slice(index + 1).map((widget) => String(widget?.id || ""));
  const anchor = Array.from(canvas.children).find((child) => followingWidgetIds.includes(String(child.dataset?.quizRuntimeWidgetId || "")));
  canvas.insertBefore(node, anchor || null);
}

function patchQcmCorrectionWidget(state, node, widget, view){
  const choices = Array.isArray(widget.qcmChoices) ? widget.qcmChoices : [];
  const choiceNodes = Array.from(node.querySelectorAll("[data-quiz-runtime-qcm-choice-id]"));
  if (choiceNodes.length !== choices.length) return false;
  if (choiceNodes.some((choiceNode, index) => choiceNode.dataset.quizRuntimeQcmChoiceId !== String(choices[index]?.id || ""))) return false;

  const layout = resolveQcmLayout(view, choices, widget.qcmLayout);
  const gridColumns = layout === "row" ? choices.length : getQcmGridColumnCount(view, choices);
  const nextStyle = `${getWidgetStyle(view)};--quiz-runtime-qcm-columns:${gridColumns}`;
  const options = node.querySelector(".quiz-runtime-qcm-options");
  const layoutChanged = node.getAttribute("style") !== nextStyle || !options?.classList.contains(`is-${layout}`);
  node.setAttribute("style", nextStyle);
  node.setAttribute("aria-label", String(widget.label || "QCM"));
  if (options) {
    options.className = `quiz-runtime-qcm-options is-${layout}`;
    options.dataset.quizRuntimeQcmLayout = layout;
  }

  const selectedChoiceId = String(state.selectedChoiceId || state.submittedAnswer || "");
  choiceNodes.forEach((choiceNode, index) => {
    const choice = choices[index];
    const isSelected = String(choice?.id || "") === selectedChoiceId;
    choiceNode.classList.remove("is-selected", "is-correct", "is-incorrect");
    if (choice?.isCorrect) choiceNode.classList.add("is-correct");
    else if (isSelected) choiceNode.classList.add("is-incorrect");
    choiceNode.removeAttribute("data-quiz-runtime-qcm-choice");
    choiceNode.setAttribute("aria-disabled", "true");
    choiceNode.setAttribute("aria-pressed", "false");
    if (choiceNode instanceof HTMLButtonElement) choiceNode.disabled = true;
  });

  if (layoutChanged) scheduleRuntimeQcmFit(state);
  return true;
}

function isRuntimeWidgetVisible(state, view, mode = "question"){
  if (!view || view.visible === false) return false;
  if (mode !== "correction") return true;
  const visibilityMode = String(view.visibilityMode || "visible").trim().toLowerCase();
  if (visibilityMode === "hidden") return false;
  if (visibilityMode === "visible") return true;
  const isCorrect = Boolean(getStoredEvaluation(state)?.isCorrect);
  if (visibilityMode === "correct") return isCorrect;
  if (visibilityMode === "incorrect") return !isCorrect;
  return true;
}

function renderWidget(state, widget, mode){
  const view = getWidgetView(widget, mode);
  if (!isRuntimeWidgetVisible(state, view, mode)) return "";
  const style = getWidgetStyle(view);

  if (widget.type === "image") {
    return renderImageWidget(widget, view, style);
  }

  if (widget.type === "audio") {
    return renderAudioWidget(widget, view, style);
  }

  if (widget.type === "labels") {
    return renderLabelsWidget(state, widget, view, mode, style);
  }

  if (widget.type === "answer") {
    return renderAnswerWidget(state, widget, view, mode, style);
  }

  if (widget.type === "numeric-keypad") {
    return renderNumericKeypadWidget(widget, view, style);
  }

  if (widget.type === "qcm-text") {
    return renderQcmWidget(state, widget, view, mode, style);
  }

  if (widget.type === "selection-words") {
    return renderSelectionWordsWidget(state, widget, view, mode, style);
  }

  if (widget.type === "categories") {
    return renderCategoriesWidget(state, widget, view, mode, style);
  }

  return `
    <section
      class="quiz-runtime-widget quiz-runtime-widget--text"
      style="${style}"
      data-quiz-runtime-widget-id="${escapeHtml(widget.id)}"
      aria-label="${escapeHtml(widget.label || "Texte")}" 
    >
      <div class="quiz-runtime-widget-content" data-quiz-runtime-text-fit>${sanitizeRichHtml(view.html)}</div>
    </section>
  `;
}

function getCategoryAssignmentMapForMode(state, mode){
  // Pour Catégories, la phase de correction conserve toujours la disposition
  // réellement soumise par l’élève. La correction est un feedback visuel sur
  // cet état, pas une redistribution automatique des étiquettes.
  if (state.answerRevealed && state.currentQuestion?.responseType === "categories") {
    return new Map(state.submittedCategoryAssignments);
  }
  if (mode === "correction") {
    return new Map(Object.entries(state.currentQuestion?.expectedCategoryAssignments || {}));
  }
  return new Map(state.categoryAssignments);
}

function getLabelsWidgetById(state, widgetId){
  return (state.currentQuestion?.widgets || []).find((widget) => widget?.type === "labels" && widget.id === widgetId) || null;
}

function renderRuntimeLabelChip(item, sourceWidgetId, feedbackClass = ""){
  const normalizedFeedbackClass = ["is-correct", "is-incorrect"].includes(feedbackClass) ? feedbackClass : "";
  return `
    <span
      class="quiz-runtime-label-chip${normalizedFeedbackClass ? ` ${normalizedFeedbackClass}` : ""}"
      data-quiz-runtime-label-id="${escapeHtml(item.id)}"
      data-quiz-runtime-label-source="${escapeHtml(sourceWidgetId)}"
      tabindex="0"
      role="button"
      aria-label="Étiquette ${escapeHtml(item.text)}"
    >${escapeHtml(item.text)}</span>
  `;
}

function renderLabelsWidget(state, widget, view, mode, style){
  const assignments = getCategoryAssignmentMapForMode(state, mode);
  const items = (Array.isArray(view.labelItems) ? view.labelItems : [])
    .filter((item) => String(item?.text || "").trim())
    .filter((item) => !assignments.has(String(item.id || "")));
  return `
    <section
      class="quiz-runtime-widget quiz-runtime-widget--labels"
      style="${style}"
      data-quiz-runtime-widget-id="${escapeHtml(widget.id)}"
      aria-label="${escapeHtml(widget.label || "Étiquettes")}"
    >
      <div class="quiz-runtime-labels-zone" data-quiz-runtime-labels-zone="${escapeHtml(widget.id)}">
        ${items.map((item) => renderRuntimeLabelChip(item, widget.id)).join("")}
      </div>
    </section>
  `;
}

function getSubmittedCategoryLabelIds(state, categoryId, assignments){
  const normalizedCategoryId = String(categoryId || "");
  const retainedOrder = state.answerRevealed
    ? (state.submittedCategoryLabelOrder.get(normalizedCategoryId) || [])
    : [];
  const orderedIds = retainedOrder.filter((labelId) => assignments.get(labelId) === normalizedCategoryId);
  const orderedSet = new Set(orderedIds);
  assignments.forEach((assignedCategoryId, labelId) => {
    if (String(assignedCategoryId || "") === normalizedCategoryId && !orderedSet.has(labelId)) {
      orderedIds.push(labelId);
      orderedSet.add(labelId);
    }
  });
  return orderedIds;
}

function renderCategoriesWidget(state, widget, view, mode, style){
  const assignments = getCategoryAssignmentMapForMode(state, mode);
  const sourceWidgetId = String(widget.labelsSourceWidgetId || view.labelsSourceWidgetId || "");
  const sourceWidget = getLabelsWidgetById(state, sourceWidgetId);
  const labelItems = Array.isArray(sourceWidget?.labelItems) ? sourceWidget.labelItems : [];
  const labelById = new Map(labelItems.map((item) => [String(item.id || ""), item]));
  const categories = Array.isArray(view.categoryItems) ? view.categoryItems : [];
  const interactive = mode === "question" && getResponseUi(state.latestContext) === "boxed";
  const showCorrectionFeedback = mode === "correction"
    && state.answerRevealed
    && normalizeAnswerDisplayMode(state.answerDisplayMode) === "correction";
  const expectedAssignments = state.currentQuestion?.expectedCategoryAssignments || {};
  return `
    <section
      class="quiz-runtime-widget quiz-runtime-widget--categories${showCorrectionFeedback ? " is-correction" : ""}"
      style="${style}"
      data-quiz-runtime-widget-id="${escapeHtml(widget.id)}"
      aria-label="${escapeHtml(widget.label || "Catégories")}"
    >
      <div class="quiz-runtime-categories" style="--quiz-runtime-category-count:${Math.max(1, categories.length)}">
        ${categories.map((category) => {
          const labels = getSubmittedCategoryLabelIds(state, category.id, assignments)
            .map((labelId) => labelById.get(labelId))
            .filter(Boolean);
          return `
            <div
              class="quiz-runtime-category${interactive ? " is-interactive" : ""}"
              data-quiz-runtime-category-id="${escapeHtml(category.id)}"
              data-quiz-runtime-category-source="${escapeHtml(sourceWidgetId)}"
            >
              <div class="quiz-runtime-category-title">${escapeHtml(category.title)}</div>
              <div class="quiz-runtime-category-labels">
                ${labels.map((item) => {
                  const feedbackClass = showCorrectionFeedback
                    ? (String(expectedAssignments[String(item.id || "")] || "") === String(category.id || "") ? "is-correct" : "is-incorrect")
                    : "";
                  return renderRuntimeLabelChip(item, sourceWidgetId, feedbackClass);
                }).join("")}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderSelectionWordsWidget(state, widget, view, mode, style){
  const responseUi = getResponseUi(state.latestContext);
  const interactive = mode === "question" && responseUi === "boxed";
  let activeIndexes = state.selectedTokenIndexes;
  let activeKind = "selected";

  if (mode === "correction") {
    const evaluation = getStoredEvaluation(state);
    if (evaluation.isCorrect) {
      activeIndexes = evaluation.expectedTokenIndexes || state.currentQuestion?.expectedTokenIndexes || [];
      activeKind = "correct";
    } else if (normalizeAnswerDisplayMode(state.answerDisplayMode) === "student") {
      activeIndexes = evaluation.submittedTokenIndexes || state.submittedTokenIndexes;
      activeKind = "student";
    } else {
      activeIndexes = evaluation.expectedTokenIndexes || state.currentQuestion?.expectedTokenIndexes || [];
      activeKind = "correction";
    }
  }

  return `
    <section
      class="quiz-runtime-widget quiz-runtime-widget--selection-words"
      style="${style}"
      data-quiz-runtime-widget-id="${escapeHtml(widget.id)}"
      aria-label="${escapeHtml(widget.label || "Sélection de mots")}" 
    >
      <div class="quiz-runtime-selection-words-text${interactive ? " is-interactive" : ""}" data-quiz-runtime-text-fit>
        ${renderQuizSelectionTextToHtml(view.text, view.formatting, {
          activeIndexes,
          activeKind,
          interactive,
          disabled:!interactive,
          ariaPrefix:"Mot à sélectionner"
        })}
      </div>
    </section>
  `;
}

function resolveQcmLayout(view, choices = [], requestedLayout = "auto"){
  const requested = ["auto", "row", "column", "grid"].includes(String(requestedLayout || "").trim())
    ? String(requestedLayout).trim()
    : "auto";
  if (requested !== "auto") return requested;
  const count = Math.max(2, choices.length || 2);
  const longest = Math.max(0, ...choices.map((choice) => String(choice?.text || "").trim().length));
  const width = Number(view?.columnSpan) || 1;
  const height = Number(view?.rowSpan) || 1;
  if (height <= 1 && width >= count * 2 && longest <= 20) return "row";
  if (width <= 4 || longest >= 38) return "column";
  if (count >= 4 && width >= 6 && height >= 2) return "grid";
  if (count <= 3 && width >= count * 2 && longest <= 24) return "row";
  return "column";
}

function getQcmGridColumnCount(view, choices = []){
  const count = Math.max(2, choices.length || 2);
  const width = Number(view?.columnSpan) || 1;
  if (count <= 2) return 2;
  if (count === 3) return width >= 8 ? 3 : 2;
  if (count === 4) return 2;
  return width >= 9 ? 3 : 2;
}

function renderQcmWidget(state, widget, view, mode, style){
  const choices = Array.isArray(widget.qcmChoices) ? widget.qcmChoices : [];
  const layout = resolveQcmLayout(view, choices, widget.qcmLayout);
  const gridColumns = layout === "row" ? choices.length : getQcmGridColumnCount(view, choices);
  const responseUi = getResponseUi(state.latestContext);
  const canInteract = mode === "question" && responseUi === "boxed";
  const selectedChoiceId = String(state.selectedChoiceId || state.submittedAnswer || "");
  const choiceMarkup = choices.map((choice) => {
    const isSelected = choice.id === selectedChoiceId;
    const isCorrect = Boolean(choice.isCorrect);
    const correctionClass = mode === "correction"
      ? isCorrect
        ? " is-correct"
        : isSelected
          ? " is-incorrect"
          : ""
      : isSelected
        ? " is-selected"
        : "";
    const tag = canInteract ? "button" : "div";
    const choiceIdAttribute = `data-quiz-runtime-qcm-choice-id="${escapeHtml(choice.id)}"`;
    const attributes = canInteract
      ? `type="button" data-quiz-runtime-qcm-choice="${escapeHtml(choice.id)}" ${choiceIdAttribute} aria-pressed="${isSelected ? "true" : "false"}"`
      : `${choiceIdAttribute} aria-disabled="true"`;
    return `
      <${tag} class="tool-choice-button quiz-runtime-qcm-choice${correctionClass}" ${attributes}>
        <span class="tool-choice-text quiz-runtime-qcm-choice-text" data-quiz-runtime-qcm-fit>${sanitizeRichHtml(renderRichTextModel(choice.text, choice.formatting))}</span>
      </${tag}>
    `;
  }).join("");

  return `
    <section
      class="quiz-runtime-widget quiz-runtime-widget--qcm-text"
      style="${style};--quiz-runtime-qcm-columns:${gridColumns}"
      data-quiz-runtime-widget-id="${escapeHtml(widget.id)}"
      aria-label="${escapeHtml(widget.label || "QCM")}" 
    >
      <div class="quiz-runtime-qcm-options is-${layout}" data-quiz-runtime-qcm-layout="${layout}">${choiceMarkup}</div>
    </section>
  `;
}

function renderImageWidget(widget, view, style){
  const source = view?.imageSource && typeof view.imageSource === "object" ? view.imageSource : null;
  if (!source) return "";
  const payload = escapeHtml(JSON.stringify(source));
  const alt = String(source.alt || source.label || source.name || widget.label || "Image").trim() || "Image";
  return `
    <section class="quiz-runtime-widget quiz-runtime-widget--image" style="${style}" data-quiz-runtime-widget-id="${escapeHtml(widget.id)}" aria-label="${escapeHtml(alt)}">
      <img class="quiz-runtime-image" data-quiz-runtime-image-source="${payload}" alt="${escapeHtml(alt)}">
      <div class="quiz-runtime-image-unavailable" aria-hidden="true">Image indisponible</div>
    </section>
  `;
}

async function hydrateRuntimeImages(state){
  const nodes = Array.from(state.canvasEl?.querySelectorAll?.("[data-quiz-runtime-image-source]") || []);
  await Promise.all(nodes.map(async (node) => {
    const payload = String(node.dataset.quizRuntimeImageSource || "");
    if (!payload) return;
    let source = null;
    try { source = JSON.parse(payload); } catch { return; }
    try {
      const url = await resolveQuizImageSourceUrl(source);
      if (!node.isConnected || node.dataset.quizRuntimeImageSource !== payload) return;
      const host = node.closest(".quiz-runtime-widget--image");
      if (!url) {
        node.classList.add("is-unavailable");
        host?.classList.add("is-unavailable");
        return;
      }
      node.src = url;
      node.classList.remove("is-unavailable");
      host?.classList.remove("is-unavailable");
    } catch (error) {
      console.warn("Impossible de charger une image du quiz.", error);
      if (node.isConnected) {
        node.classList.add("is-unavailable");
        node.closest(".quiz-runtime-widget--image")?.classList.add("is-unavailable");
      }
    }
  }));
}

function renderAudioWidget(widget, view, style){
  const source = view?.audioSource && typeof view.audioSource === "object" ? view.audioSource : null;
  if (!source) return "";
  const payload = escapeHtml(JSON.stringify(source));
  const label = String(source.label || source.name || widget.label || "Audio").trim() || "Audio";
  const isNarrow = Number(view?.columnSpan) <= 2;
  return `
    <section
      class="quiz-runtime-widget quiz-runtime-widget--audio${isNarrow ? " is-narrow" : ""}"
      style="${style}"
      data-quiz-runtime-widget-id="${escapeHtml(widget.id)}"
      aria-label="${escapeHtml(label)}"
    >
      <audio class="quiz-runtime-audio-element" preload="metadata" data-quiz-runtime-audio-source="${payload}"></audio>
      <button class="quiz-runtime-audio-button" type="button" data-quiz-runtime-audio-toggle aria-label="Lire l’audio" title="Lire / mettre en pause">
        <span class="dashboard-material-icon" aria-hidden="true">play_arrow</span>
      </button>
      <input class="quiz-runtime-audio-seek" type="range" min="0" max="100" value="0" step="0.1" data-quiz-runtime-audio-seek aria-label="Position de lecture">
      <div class="quiz-runtime-audio-unavailable" aria-hidden="true">Audio indisponible</div>
    </section>
  `;
}

async function hydrateRuntimeAudios(state){
  const nodes = Array.from(state.canvasEl?.querySelectorAll?.("[data-quiz-runtime-audio-source]") || []);
  await Promise.all(nodes.map(async (audio) => {
    const payload = String(audio.dataset.quizRuntimeAudioSource || "");
    if (!payload) return;
    let source = null;
    try { source = JSON.parse(payload); } catch { return; }
    const host = audio.closest(".quiz-runtime-widget--audio");
    try {
      const url = await resolveQuizAudioSourceUrl(source);
      if (!audio.isConnected || audio.dataset.quizRuntimeAudioSource !== payload) return;
      if (!url) {
        host?.classList.add("is-unavailable");
        return;
      }
      audio.addEventListener("loadedmetadata", () => {
        // Les WebM issus de MediaRecorder n’exposent parfois leur durée qu’après
        // une première recherche très lointaine. Sans cela, leur barre peut se
        // déplacer visuellement mais le flux reste impossible à repositionner.
        if (audio.duration !== Infinity) return;
        const restoreTime = Math.max(0, Number(audio.currentTime) || 0);
        let repaired = false;
        const restoreSeekability = () => {
          if (repaired) return;
          if (!Number.isFinite(audio.duration)) return;
          repaired = true;
          audio.removeEventListener("durationchange", restoreSeekability);
          audio.removeEventListener("timeupdate", restoreSeekability);
          audio.currentTime = Math.min(restoreTime, audio.duration);
        };
        audio.addEventListener("durationchange", restoreSeekability);
        audio.addEventListener("timeupdate", restoreSeekability);
        try { audio.currentTime = 1e101; } catch {}
      }, { once:true });
      audio.src = url;
      host?.classList.remove("is-unavailable");
      audio.dataset.quizRuntimeAudioDuration = String(Math.max(0, Number(source?.duration) || 0));
    } catch (error) {
      console.warn("Impossible de charger un audio du quiz.", error);
      if (audio.isConnected) host?.classList.add("is-unavailable");
    }
  }));
}

function bindRuntimeAudios(state){
  state.audioAbortController?.abort();
  state.audioAbortController = new AbortController();
  const { signal } = state.audioAbortController;
  const hosts = Array.from(state.canvasEl?.querySelectorAll?.(".quiz-runtime-widget--audio") || []);

  hosts.forEach((host) => {
    const audio = host.querySelector(".quiz-runtime-audio-element");
    const button = host.querySelector("[data-quiz-runtime-audio-toggle]");
    const icon = button?.querySelector(".dashboard-material-icon");
    const seek = host.querySelector("[data-quiz-runtime-audio-seek]");
    if (!audio || !button) return;

    let isSeeking = false;
    let progressFrame = 0;
    const getDuration = () => Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.duration
      : Math.max(0, Number(audio.dataset.quizRuntimeAudioDuration) || 0);
    const sync = () => {
      const duration = getDuration();
      const current = Math.max(0, Number(audio.currentTime) || 0);
      const ratio = duration > 0 ? current / duration : 0;
      const percentage = Math.max(0, Math.min(100, ratio * 100));
      if (seek && !isSeeking) seek.value = String(percentage);
    };
    const seekTo = () => {
      const duration = getDuration();
      if (duration <= 0) return;
      try { audio.currentTime = (Number(seek?.value) / 100) * duration; } catch {}
    };
    const stopProgressLoop = () => {
      if (progressFrame) window.cancelAnimationFrame(progressFrame);
      progressFrame = 0;
    };
    const runProgressLoop = () => {
      sync();
      if (!audio.paused && !audio.ended) progressFrame = window.requestAnimationFrame(runProgressLoop);
      else progressFrame = 0;
    };
    const startProgressLoop = () => {
      stopProgressLoop();
      runProgressLoop();
    };
    const setPlaying = (playing) => {
      host.classList.toggle("is-playing", playing);
      if (icon) icon.textContent = playing ? "pause" : "play_arrow";
      button.setAttribute("aria-label", playing ? "Mettre l’audio en pause" : "Lire l’audio");
    };

    button.addEventListener("click", () => {
      if (!audio.src) return;
      if (audio.paused) {
        stopRuntimeAudio(state, audio);
        state.activeAudioEl = audio;
        void audio.play().catch(() => {});
      } else {
        audio.pause();
      }
    }, { signal });
    seek?.addEventListener("input", seekTo, { signal });
    seek?.addEventListener("change", seekTo, { signal });
    seek?.addEventListener("pointerdown", () => { isSeeking = true; }, { signal });
    seek?.addEventListener("pointerup", () => { isSeeking = false; }, { signal });
    seek?.addEventListener("pointercancel", () => { isSeeking = false; }, { signal });
    audio.addEventListener("play", () => { setPlaying(true); startProgressLoop(); }, { signal });
    audio.addEventListener("pause", () => { setPlaying(false); stopProgressLoop(); }, { signal });
    audio.addEventListener("timeupdate", sync, { signal });
    audio.addEventListener("loadedmetadata", sync, { signal });
    audio.addEventListener("seeked", sync, { signal });
    audio.addEventListener("ended", () => {
      audio.currentTime = 0;
      setPlaying(false);
      sync();
      if (state.activeAudioEl === audio) state.activeAudioEl = null;
    }, { signal });
    signal.addEventListener("abort", stopProgressLoop, { once:true });
    sync();
  });
}

function stopRuntimeAudio(state, except = null){
  state.canvasEl?.querySelectorAll?.(".quiz-runtime-audio-element").forEach((audio) => {
    if (audio === except) return;
    try { audio.pause(); } catch {}
    const host = audio.closest(".quiz-runtime-widget--audio");
    host?.classList.remove("is-playing");
    const icon = host?.querySelector("[data-quiz-runtime-audio-toggle] .dashboard-material-icon");
    if (icon) icon.textContent = "play_arrow";
  });
  if (state.activeAudioEl && state.activeAudioEl !== except) state.activeAudioEl = null;
}

function renderNumericKeypadWidget(widget, view, style){
  return `
    <section
      class="quiz-runtime-widget quiz-runtime-widget--numeric-keypad"
      style="${style}"
      data-quiz-runtime-widget-id="${escapeHtml(widget.id)}"
      data-quiz-runtime-keypad-host
      aria-label="Clavier numérique"
    >
      ${renderNumericKeypad({
        rootClassName: "quiz-runtime-numeric-keypad",
        buttonClassName: "quiz-runtime-numeric-keypad-button",
        clearButtonClassName: "quiz-runtime-numeric-keypad-button--clear",
        dataAttribute: "data-quiz-runtime-numeric-key",
        ariaLabel: "Clavier numérique"
      })}
    </section>
  `;
}

function renderAnswerWidget(state, widget, view, mode, style){
  const responseUi = getResponseUi(state.latestContext);
  const evaluation = state.answerRevealed ? getStoredEvaluation(state) : null;

  if (mode === "question") {
    if (responseUi === "free") {
      return `
        <section class="quiz-runtime-widget quiz-runtime-widget--answer" style="${style}" data-quiz-runtime-widget-id="${escapeHtml(widget.id)}">
          <div class="tool-answer-box quiz-runtime-answer-box quiz-runtime-answer-box--placeholder">Réponse à trouver</div>
        </section>
      `;
    }

    return `
      <section class="quiz-runtime-widget quiz-runtime-widget--answer" style="${style}" data-quiz-runtime-widget-id="${escapeHtml(widget.id)}">
        <label class="tool-answer-box quiz-runtime-answer-box quiz-runtime-answer-box--input">
          <input
            class="tool-answer-input quiz-runtime-answer-input"
            data-quiz-runtime-answer-input
            type="text"
            inputmode="${state.currentQuestion?.widgets?.some((entry) => entry?.type === "numeric-keypad") ? "numeric" : "text"}"
            autocomplete="off"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            data-gramm="false"
            data-gramm_editor="false"
            data-enable-grammarly="false"
            aria-label="Réponse"
          />
        </label>
      </section>
    `;
  }

  const showStudentAnswer = canToggleStudentAnswerDisplay(state) && normalizeAnswerDisplayMode(state.answerDisplayMode) === "student";
  const displayValue = showStudentAnswer ? state.submittedAnswer : state.currentQuestion.expectedAnswer;
  const classNames = [
    "tool-answer-box",
    "quiz-runtime-answer-box",
    "quiz-runtime-answer-box--display",
    evaluation?.isCorrect ? "is-correct" : "is-incorrect",
    showStudentAnswer ? "is-student-answer" : ""
  ].filter(Boolean).join(" ");

  return `
    <section class="quiz-runtime-widget quiz-runtime-widget--answer" style="${style}" data-quiz-runtime-widget-id="${escapeHtml(widget.id)}">
      <div class="${escapeHtml(classNames)}" data-quiz-runtime-text-fit>${escapeHtml(displayValue)}</div>
    </section>
  `;
}

function renderEmptyQuestion(state){
  state.root?.classList.add("quiz-runtime-root--empty");
  if (state.canvasEl) {
    state.canvasEl.innerHTML = `
      <div class="tool-empty-message quiz-runtime-empty-message">
        Aucune question complète n’est disponible dans ce quiz.
      </div>
    `;
  }
  state.answerInputEl = null;
}

function bindAnswerInput(state){
  const input = state.answerInputEl;
  if (!input) return;
  state.inputAbortController?.abort();
  state.inputAbortController = null;
  const abortController = new AbortController();
  state.inputAbortController = abortController;
  state.answerInputEl = input;
  const { signal } = abortController;

  const capturePendingValue = (event) => {
    if (state.answerRevealed || document.activeElement !== input) return;
    const target = event.target instanceof Node ? event.target : null;
    if (target && input.contains(target)) return;
    state.pendingValidationValue = String(input.value ?? "");
    state.responseDraftValue = state.pendingValidationValue;
  };

  input.addEventListener("focus", () => {
    state.pendingValidationValue = "";
  }, { signal });

  input.addEventListener("input", () => {
    if (state.answerRevealed) return;
    state.responseDraftValue = String(input.value ?? "");
    state.pendingValidationValue = "";
    syncValidateState(state);
  }, { signal });

  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || state.answerRevealed || !canSubmitAnswer(state)) return;
    event.preventDefault();
    state.pendingValidationValue = String(input.value ?? "");
    state.responseDraftValue = state.pendingValidationValue;
    requestReveal(state);
  }, { signal });

  input.addEventListener("blur", () => {
    if (state.answerRevealed) return;
    const value = state.pendingValidationValue || state.responseDraftValue;
    if (String(input.value ?? "") !== value) input.value = value;
  }, { signal });

  document.addEventListener("pointerdown", capturePendingValue, { capture: true, signal });
  document.addEventListener("touchstart", capturePendingValue, { capture: true, signal });
  document.addEventListener("mousedown", capturePendingValue, { capture: true, signal });
}

function bindRuntimeNumericKeypad(state){
  state.keypadAbortController?.abort();
  state.keypadAbortController = null;
  const hosts = Array.from(state.canvasEl?.querySelectorAll?.("[data-quiz-runtime-keypad-host]") || []);
  const input = state.answerInputEl;
  if (!hosts.length || !input || state.answerRevealed) return;

  const controller = new AbortController();
  state.keypadAbortController = controller;

  const commitValue = (nextValue) => {
    input.value = String(nextValue ?? "");
    input.dispatchEvent(new Event("input", { bubbles:true }));
  };

  const control = {
    appendDigit(digit){
      const safeDigit = /^\d$/.test(String(digit)) ? String(digit) : "";
      if (!safeDigit) return;
      const current = String(input.value || "");
      const next = current === "0"
        ? (safeDigit === "0" ? "0" : safeDigit)
        : `${current}${safeDigit}`;
      commitValue(next);
    },
    clear(){
      commitValue("");
    },
    backspace(){
      commitValue(String(input.value || "").slice(0, -1));
    },
    focus(){
      try {
        input.focus({ preventScroll:true });
      } catch {
        input.focus?.();
      }
    }
  };

  hosts.forEach((host) => {
    bindNumericKeypadEvents({
      root:host,
      control,
      signal:controller.signal,
      dataAttribute:"data-quiz-runtime-numeric-key",
      onAfterInput:() => syncValidateState(state)
    });
  });
}

function bindRuntimeQcm(state){
  state.qcmAbortController?.abort();
  state.qcmAbortController = null;
  const choices = Array.from(state.canvasEl?.querySelectorAll?.("[data-quiz-runtime-qcm-choice]") || []);
  if (!choices.length || state.answerRevealed) return;
  const controller = new AbortController();
  state.qcmAbortController = controller;
  choices.forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedChoiceId = String(button.dataset.quizRuntimeQcmChoice || "");
      state.responseDraftValue = state.selectedChoiceId;
      choices.forEach((choiceButton) => {
        const selected = choiceButton.dataset.quizRuntimeQcmChoice === state.selectedChoiceId;
        choiceButton.classList.toggle("is-selected", selected);
        choiceButton.setAttribute("aria-pressed", selected ? "true" : "false");
      });
      syncValidateState(state);
    }, { signal:controller.signal });
  });
}

function bindRuntimeSelection(state){
  state.selectionAbortController?.abort();
  state.selectionAbortController = null;
  const tokens = Array.from(state.canvasEl?.querySelectorAll?.(".quiz-runtime-widget--selection-words [data-selection-token-index]") || []);
  if (!tokens.length || state.answerRevealed || getResponseUi(state.latestContext) !== "boxed") return;
  const controller = new AbortController();
  state.selectionAbortController = controller;

  const toggle = (token) => {
    const tokenIndex = Number(token.dataset.selectionTokenIndex);
    if (!Number.isFinite(tokenIndex)) return;
    const selected = new Set(state.selectedTokenIndexes);
    if (selected.has(tokenIndex)) selected.delete(tokenIndex);
    else selected.add(tokenIndex);
    state.selectedTokenIndexes = normalizeQuizSelectionIndexes(Array.from(selected), Infinity);
    state.responseDraftValue = state.selectedTokenIndexes.join(",");
    renderCurrentView(state);
    window.requestAnimationFrame(() => {
      const nextToken = state.canvasEl?.querySelector?.(`.quiz-runtime-widget--selection-words [data-selection-token-index="${tokenIndex}"]`);
      try { nextToken?.focus?.({ preventScroll:true }); } catch { nextToken?.focus?.(); }
    });
    syncValidateState(state);
  };

  tokens.forEach((token) => {
    token.addEventListener("click", () => toggle(token), { signal:controller.signal });
    token.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggle(token);
    }, { signal:controller.signal });
  });
}

function serializeCategoryAssignments(assignments){
  const entries = assignments instanceof Map ? Array.from(assignments.entries()) : Object.entries(assignments || {});
  return JSON.stringify(Object.fromEntries(entries
    .map(([labelId, categoryId]) => [String(labelId || ""), String(categoryId || "")])
    .filter(([labelId, categoryId]) => labelId && categoryId)
    .sort(([left], [right]) => left.localeCompare(right))));
}

function createRuntimeLabelsLayout(measurements, zoneWidth, zoneHeight){
  const preferredGap = Math.max(6, Math.min(14, zoneWidth * .025));
  const candidateGaps = Array.from(new Set([preferredGap, 4, 2]));

  for (const gap of candidateGaps) {
    const contentWidth = zoneWidth - gap * 2;
    const contentHeight = zoneHeight - gap * 2;
    if (contentWidth <= 0 || contentHeight <= 0) continue;
    if (measurements.some(({ width, height }) => width > contentWidth || height > contentHeight)) continue;

    const rows = [];
    let currentRow = null;
    measurements.forEach((measurement) => {
      const nextWidth = currentRow
        ? currentRow.width + gap + measurement.width
        : measurement.width;
      if (currentRow && nextWidth > contentWidth) currentRow = null;
      if (!currentRow) {
        currentRow = { items:[], width:0, height:0 };
        rows.push(currentRow);
      }
      currentRow.width += (currentRow.items.length ? gap : 0) + measurement.width;
      currentRow.height = Math.max(currentRow.height, measurement.height);
      currentRow.items.push(measurement);
    });

    const rowsHeight = rows.reduce((total, row) => total + row.height, 0) + Math.max(0, rows.length - 1) * gap;
    if (rowsHeight > contentHeight) continue;

    const layout = [];
    let top = gap;
    rows.forEach((row) => {
      let left = gap;
      row.items.forEach((measurement) => {
        layout.push({ ...measurement, left, top:top + (row.height - measurement.height) / 2 });
        left += measurement.width + gap;
      });
      top += row.height + gap;
    });
    return layout;
  }

  return null;
}

function layoutRuntimeLabels(state){
  const zones = Array.from(state.canvasEl?.querySelectorAll?.("[data-quiz-runtime-labels-zone]") || []);
  let hasPendingZone = false;
  zones.forEach((zone) => {
    if (zone.dataset.quizRuntimeLabelsLaidOut === "true") return;
    const sourceWidgetId = String(zone.dataset.quizRuntimeLabelsZone || "");
    const chips = Array.from(zone.querySelectorAll(":scope > .quiz-runtime-label-chip"));
    if (!chips.length) return;
    const zoneWidth = zone.clientWidth || zone.offsetWidth;
    const zoneHeight = zone.clientHeight || zone.offsetHeight;
    const measurements = chips.map((chip) => {
      const localRect = clientRectToLocalRect(zone, chip.getBoundingClientRect());
      return { chip, width:localRect.width, height:localRect.height };
    });
    if (zoneWidth < 24 || zoneHeight < 24 || measurements.some(({ width, height }) => width < 2 || height < 2)) {
      hasPendingZone = true;
      return;
    }
    const savedLayout = measurements.every(({ chip }) => {
      const labelId = String(chip.dataset.quizRuntimeLabelId || "");
      const saved = state.labelPositions.get(`${sourceWidgetId}:${labelId}`);
      return Number.isFinite(Number(saved?.x)) && Number.isFinite(Number(saved?.y));
    }) ? measurements.map(({ chip, width, height }) => {
      const labelId = String(chip.dataset.quizRuntimeLabelId || "");
      const saved = state.labelPositions.get(`${sourceWidgetId}:${labelId}`);
      return {
        chip,
        width,
        height,
        left:Math.max(0, Math.min(zoneWidth - width, Number(saved.x) * Math.max(0, zoneWidth - width))),
        top:Math.max(0, Math.min(zoneHeight - height, Number(saved.y) * Math.max(0, zoneHeight - height)))
      };
    }) : null;
    const layout = savedLayout || createRuntimeLabelsLayout(measurements, zoneWidth, zoneHeight);
    if (!layout) {
      hasPendingZone = true;
      return;
    }

    layout.forEach(({ chip, width, height, left, top }) => {
      const labelId = String(chip.dataset.quizRuntimeLabelId || "");
      const key = `${sourceWidgetId}:${labelId}`;
      const maxLeft = Math.max(0, zoneWidth - width);
      const maxTop = Math.max(0, zoneHeight - height);
      chip.style.left = `${left}px`;
      chip.style.top = `${top}px`;
      if (!state.labelPositions.has(key)) {
        state.labelPositions.set(key, {
          x:maxLeft > 0 ? left / maxLeft : 0,
          y:maxTop > 0 ? top / maxTop : 0
        });
      }
    });
    zone.dataset.quizRuntimeLabelsLaidOut = "true";
  });
  return hasPendingZone;
}

function scheduleRuntimeLabelsLayout(state, signal){
  const zones = Array.from(state.canvasEl?.querySelectorAll?.("[data-quiz-runtime-labels-zone]") || []);
  if (!zones.length) return;
  let typographyReady = !document.fonts?.ready || document.fonts.status === "loaded";

  const runLayout = () => {
    state.labelsLayoutFrame = 0;
    if (signal.aborted) return;
    const hasPendingZone = layoutRuntimeLabels(state);
    if (!hasPendingZone) {
      state.labelsResizeObserver?.disconnect();
      state.labelsResizeObserver = null;
    }
  };
  const scheduleLayout = () => {
    if (signal.aborted || !typographyReady || state.labelsLayoutFrame) return;
    state.labelsLayoutFrame = window.requestAnimationFrame(runLayout);
  };
  const beginLayout = () => {
    if (signal.aborted) return;
    typographyReady = true;
    window.requestAnimationFrame(() => window.requestAnimationFrame(scheduleLayout));
  };

  if (typeof ResizeObserver !== "undefined") {
    state.labelsResizeObserver?.disconnect();
    state.labelsResizeObserver = new ResizeObserver(scheduleLayout);
    zones.forEach((zone) => state.labelsResizeObserver.observe(zone));
  }
  if (typographyReady) beginLayout();
  else document.fonts.ready.then(beginLayout, beginLayout);
}

function clearRuntimeLabelDropTargets(state){
  state.canvasEl?.querySelectorAll?.(".quiz-runtime-category.is-drop-target")
    .forEach((node) => node.classList.remove("is-drop-target"));
}

function getRuntimeLabelDropTargets(state, sourceWidgetId){
  const categories = Array.from(state.canvasEl?.querySelectorAll?.(`[data-quiz-runtime-category-source="${CSS.escape(sourceWidgetId)}"]`) || []);
  const sourceZone = state.canvasEl?.querySelector?.(`[data-quiz-runtime-labels-zone="${CSS.escape(sourceWidgetId)}"]`) || null;
  return {
    categories:categories.map((element) => ({
      type:"category",
      element,
      categoryId:String(element.dataset.quizRuntimeCategoryId || ""),
      rect:element.getBoundingClientRect()
    })),
    source:sourceZone ? { type:"labels", element:sourceZone, categoryId:"", rect:sourceZone.getBoundingClientRect() } : null
  };
}

function getRuntimeLabelDropTarget(targets, clientX, clientY){
  const containsPoint = ({ rect }) => clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  const category = targets?.categories?.find(containsPoint);
  if (category) return category;
  if (targets?.source && containsPoint(targets.source)) return targets.source;
  return null;
}

function bindRuntimeLabels(state){
  state.labelsAbortController?.abort();
  state.labelsAbortController = null;
  if (!state.canvasEl || state.answerRevealed) return;
  const chips = Array.from(state.canvasEl.querySelectorAll(".quiz-runtime-label-chip[data-quiz-runtime-label-id]"));
  if (!chips.length) return;

  const controller = new AbortController();
  state.labelsAbortController = controller;
  const signal = controller.signal;
  scheduleRuntimeLabelsLayout(state, signal);

  chips.forEach((chip) => {
    chip.draggable = false;
    chip.addEventListener("dragstart", (event) => event.preventDefault(), { signal });
    chip.addEventListener("pointerdown", (downEvent) => {
      if (downEvent.button != null && downEvent.button !== 0) return;
      const labelId = String(chip.dataset.quizRuntimeLabelId || "");
      const sourceWidgetId = String(chip.dataset.quizRuntimeLabelSource || "");
      if (!labelId || !sourceWidgetId) return;
      downEvent.preventDefault();

      const root = state.canvasEl;
      const startClientX = downEvent.clientX;
      const startClientY = downEvent.clientY;
      let floating = null;
      let dragged = false;
      let pointerOffsetX = 0;
      let pointerOffsetY = 0;
      let lastX = 0;
      let lastY = 0;
      let moveFrame = 0;
      let pendingPoint = null;
      let dropTargets = null;
      let highlightedCategory = null;
      const pointerId = downEvent.pointerId;

      try { chip.setPointerCapture?.(pointerId); } catch {}

      const startFloatingDrag = (event) => {
        const chipRect = chip.getBoundingClientRect();
        const localRect = clientRectToLocalRect(root, chipRect);
        const pointer = clientPointToLocalPoint(root, event.clientX, event.clientY);
        floating = chip.cloneNode(true);
        floating.removeAttribute("tabindex");
        floating.classList.add("is-floating");
        floating.style.width = `${localRect.width}px`;
        floating.style.height = `${localRect.height}px`;
        floating.style.left = `${localRect.left}px`;
        floating.style.top = `${localRect.top}px`;
        root.appendChild(floating);
        chip.classList.add("is-drag-origin");
        pointerOffsetX = pointer.x - localRect.left;
        pointerOffsetY = pointer.y - localRect.top;
        lastX = localRect.left;
        lastY = localRect.top;
        dropTargets = getRuntimeLabelDropTargets(state, sourceWidgetId);
        dragged = true;
      };

      const moveFloating = (clientX, clientY) => {
        if (!floating) return;
        const pointer = clientPointToLocalPoint(root, clientX, clientY);
        const width = Number.parseFloat(floating.style.width) || floating.offsetWidth || 1;
        const height = Number.parseFloat(floating.style.height) || floating.offsetHeight || 1;
        lastX = Math.max(0, Math.min((root.clientWidth || 0) - width, pointer.x - pointerOffsetX));
        lastY = Math.max(0, Math.min((root.clientHeight || 0) - height, pointer.y - pointerOffsetY));
        floating.style.left = `${lastX}px`;
        floating.style.top = `${lastY}px`;

        const target = getRuntimeLabelDropTarget(dropTargets, clientX, clientY);
        const nextHighlightedCategory = target?.type === "category" ? target.element : null;
        if (nextHighlightedCategory !== highlightedCategory) {
          highlightedCategory?.classList.remove("is-drop-target");
          nextHighlightedCategory?.classList.add("is-drop-target");
          highlightedCategory = nextHighlightedCategory;
        }
      };

      const scheduleFloatingMove = (clientX, clientY) => {
        pendingPoint = { clientX, clientY };
        if (moveFrame) return;
        moveFrame = window.requestAnimationFrame(() => {
          moveFrame = 0;
          const point = pendingPoint;
          pendingPoint = null;
          if (point) moveFloating(point.clientX, point.clientY);
        });
      };

      const onMove = (event) => {
        if (event.pointerId !== pointerId) return;
        event.preventDefault();
        if (!dragged) {
          const distance = Math.hypot(event.clientX - startClientX, event.clientY - startClientY);
          if (distance < 6) return;
          startFloatingDrag(event);
        }
        scheduleFloatingMove(event.clientX, event.clientY);
      };

      const finish = (event) => {
        if (event.pointerId !== pointerId) return;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", cancel);
        try { chip.releasePointerCapture?.(pointerId); } catch {}
        if (!dragged || !floating) {
          state.activeLabelDrag = null;
          return;
        }

        if (moveFrame) window.cancelAnimationFrame(moveFrame);
        moveFrame = 0;
        pendingPoint = null;
        moveFloating(event.clientX, event.clientY);
        const target = getRuntimeLabelDropTarget(dropTargets, event.clientX, event.clientY);
        if (target?.type === "category" && target.categoryId) {
          state.categoryAssignments.set(labelId, target.categoryId);
          target.element.querySelector(".quiz-runtime-category-labels")?.append(chip);
          chip.style.removeProperty("left");
          chip.style.removeProperty("top");
        } else if (target?.type === "labels") {
          state.categoryAssignments.delete(labelId);
          const zone = target.element;
          const floatingLocal = clientRectToLocalRect(zone, floating.getBoundingClientRect());
          const maxLeft = Math.max(0, (zone.clientWidth || 0) - floatingLocal.width);
          const maxTop = Math.max(0, (zone.clientHeight || 0) - floatingLocal.height);
          const left = Math.max(0, Math.min(maxLeft, floatingLocal.left));
          const top = Math.max(0, Math.min(maxTop, floatingLocal.top));
          state.labelPositions.set(`${sourceWidgetId}:${labelId}`, {
            x:maxLeft > 0 ? left / maxLeft : 0,
            y:maxTop > 0 ? top / maxTop : 0
          });
          zone.append(chip);
          chip.style.left = `${left}px`;
          chip.style.top = `${top}px`;
        }

        state.responseDraftValue = serializeCategoryAssignments(state.categoryAssignments);
        clearRuntimeLabelDropTargets(state);
        floating.remove();
        chip.classList.remove("is-drag-origin");
        state.activeLabelDrag = null;
        syncValidateState(state);
      };

      const cancel = (event) => {
        if (event.pointerId !== pointerId) return;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", cancel);
        if (moveFrame) window.cancelAnimationFrame(moveFrame);
        moveFrame = 0;
        pendingPoint = null;
        clearRuntimeLabelDropTargets(state);
        floating?.remove?.();
        chip.classList.remove("is-drag-origin");
        state.activeLabelDrag = null;
      };

      state.activeLabelDrag = { labelId, sourceWidgetId };
      window.addEventListener("pointermove", onMove, { passive:false, signal });
      window.addEventListener("pointerup", finish, { passive:false, signal });
      window.addEventListener("pointercancel", cancel, { passive:false, signal });
      signal.addEventListener("abort", () => {
        if (moveFrame) window.cancelAnimationFrame(moveFrame);
        clearRuntimeLabelDropTargets(state);
        floating?.remove?.();
        chip.classList.remove("is-drag-origin");
      }, { once:true });
    }, { signal, passive:false });
  });
}

function scheduleRuntimeTextFit(state){
  const fit = () => fitRuntimeTextWidgets(state);
  state.textFitTimers.forEach((timer) => window.clearTimeout(timer));
  state.textFitTimers = [];
  window.requestAnimationFrame(() => window.requestAnimationFrame(fit));
  [120, 420].forEach((delay) => {
    const timer = window.setTimeout(fit, delay);
    state.textFitTimers.push(timer);
  });
  if (!state.root || typeof ResizeObserver === "undefined") return;
  if (!state.textResizeObserver) {
    state.textResizeObserver = new ResizeObserver(fit);
    state.textResizeObserver.observe(state.root);
  }
}

function fitRuntimeTextWidgets(state){
  // À l'ouverture d'un outil, le conteneur peut exister avant d'avoir reçu sa
  // taille finale. Ne surtout pas mémoriser alors une police réduite pour un
  // canevas de quelques pixels : le ResizeObserver relancera l'ajustement dès
  // que la vue sera réellement affichée.
  const canvasRect = state.canvasEl?.getBoundingClientRect?.();
  const rootRect = state.root?.getBoundingClientRect?.();
  if (!hasUsableRuntimeFitBounds(canvasRect) || !hasUsableRuntimeFitBounds(rootRect)) return;

  const targets = Array.from(state.canvasEl?.querySelectorAll?.("[data-quiz-runtime-text-fit]") || []);
  targets.forEach((target) => {
    const host = target.closest(".quiz-runtime-widget");
    if (!host) return;
    const hostRect = host.getBoundingClientRect();
    if (!hasUsableRuntimeFitBounds(hostRect, 16)) return;

    const targetSize = resolveRuntimeTargetFontSize(host, target);
    const minimumSize = Math.min(12, targetSize);
    let size = targetSize;
    target.style.fontSize = `${size}px`;

    while (size > minimumSize && !runtimeTextFits(target, host)) {
      size = Math.max(minimumSize, size - 2);
      target.style.fontSize = `${size}px`;
    }

    const overflows = !runtimeTextFits(target, host);
    target.classList.toggle("is-overflowing", overflows);
    target.dataset.quizRuntimeFittedFontSize = String(size);
  });
}

function hasUsableRuntimeFitBounds(rect, minimum = 120){
  return Boolean(rect && rect.width >= minimum && rect.height >= minimum);
}

function resolveRuntimeTargetFontSize(host, target){
  const hostStyle = window.getComputedStyle(host);
  const semanticSize = parseFloat(hostStyle.getPropertyValue("--quiz-runtime-target-font-size"));
  if (Number.isFinite(semanticSize) && semanticSize > 0) return Math.max(1, Math.floor(semanticSize));

  const fontSizeKey = String(host.style.getPropertyValue("--quiz-runtime-font-size-key") || "").trim();
  if (Object.hasOwn(RUNTIME_FONT_FALLBACKS, fontSizeKey)) {
    const runtimeSize = parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue(`--runtime-font-${fontSizeKey}`));
    return Math.max(1, Math.floor(Number.isFinite(runtimeSize) && runtimeSize > 0
      ? runtimeSize
      : RUNTIME_FONT_FALLBACKS[fontSizeKey]));
  }

  const declaredTarget = String(host.style.getPropertyValue("--quiz-runtime-target-font-size") || "");
  const semanticMatch = declaredTarget.match(/--runtime-font-(small|normal|large|huge)/);
  if (semanticMatch) {
    const runtimeSize = parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue(`--runtime-font-${semanticMatch[1]}`));
    if (Number.isFinite(runtimeSize) && runtimeSize > 0) return Math.max(1, Math.floor(runtimeSize));
  }

  const currentSize = parseFloat(window.getComputedStyle(target).fontSize);
  return Number.isFinite(currentSize) && currentSize > 0 ? Math.max(1, Math.floor(currentSize)) : 12;
}

function runtimeTextFits(target, host, tolerance = 2){
  const hostStyle = window.getComputedStyle(host);
  const availableWidth = Math.max(0, host.clientWidth
    - (parseFloat(hostStyle.paddingLeft) || 0)
    - (parseFloat(hostStyle.paddingRight) || 0));
  const availableHeight = Math.max(0, host.clientHeight
    - (parseFloat(hostStyle.paddingTop) || 0)
    - (parseFloat(hostStyle.paddingBottom) || 0));
  return target.scrollWidth <= availableWidth + tolerance
    && target.scrollHeight <= availableHeight + tolerance;
}

function scheduleRuntimeQcmFit(state){
  const fit = () => fitRuntimeQcmChoices(state);
  state.qcmFitTimers.forEach((timer) => window.clearTimeout(timer));
  state.qcmFitTimers = [];
  window.requestAnimationFrame(() => window.requestAnimationFrame(fit));
  // Le tout premier rendu peut intervenir avant que le conteneur du runtime
  // ait atteint sa taille finale. Une seconde passe évite de conserver une
  // police calculée sur une zone provisoirement trop petite.
  [120, 420].forEach((delay) => {
    const timer = window.setTimeout(fit, delay);
    state.qcmFitTimers.push(timer);
  });
  if (!state.root || typeof ResizeObserver === "undefined") return;
  if (!state.qcmResizeObserver) {
    state.qcmResizeObserver = new ResizeObserver(fit);
    state.qcmResizeObserver.observe(state.root);
  }
}

function fitRuntimeQcmChoices(state){
  const targets = Array.from(state.canvasEl?.querySelectorAll?.("[data-quiz-runtime-qcm-fit]") || []);
  targets.forEach((target) => {
    const host = target.closest(".quiz-runtime-qcm-choice");
    if (!host) return;
    const choiceId = String(host.dataset.quizRuntimeQcmChoiceId || "");
    const retainedSize = state.answerRevealed ? state.qcmChoiceFontSizes.get(choiceId) : null;
    if (Number.isFinite(retainedSize)) {
      target.style.fontSize = `${retainedSize}px`;
      target.classList.toggle("is-overflowing", target.scrollHeight > target.clientHeight + 2 || target.scrollWidth > target.clientWidth + 2);
      return;
    }
    const hostRect = host.getBoundingClientRect();
    if (hostRect.width < 8 || hostRect.height < 8) return;
    const widgetHost = host.closest(".quiz-runtime-widget") || host;
    const targetSize = resolveRuntimeTargetFontSize(widgetHost, target);
    const minimumSize = Math.min(10, targetSize);
    let best = targetSize;
    target.style.fontSize = `${best}px`;
    while (best > minimumSize && (target.scrollHeight > target.clientHeight + 2 || target.scrollWidth > target.clientWidth + 2)) {
      best = Math.max(minimumSize, best - 2);
      target.style.fontSize = `${best}px`;
    }
    if (choiceId) state.qcmChoiceFontSizes.set(choiceId, best);
    const stillOverflows = target.scrollHeight > target.clientHeight + 2 || target.scrollWidth > target.clientWidth + 2;
    target.classList.toggle("is-overflowing", stillOverflows);
  });
}

function captureSubmittedCategoryLabelOrder(state){
  const order = new Map();
  const categories = Array.from(state.canvasEl?.querySelectorAll?.("[data-quiz-runtime-category-id]") || []);
  categories.forEach((categoryNode) => {
    const categoryId = String(categoryNode.dataset.quizRuntimeCategoryId || "");
    if (!categoryId) return;
    const labelIds = Array.from(categoryNode.querySelectorAll(".quiz-runtime-category-labels > .quiz-runtime-label-chip[data-quiz-runtime-label-id]"))
      .map((chip) => String(chip.dataset.quizRuntimeLabelId || ""))
      .filter(Boolean);
    order.set(categoryId, labelIds);
  });
  return order;
}

function revealAnswer(state){
  if (!state.currentQuestion) return;
  fitRuntimeQcmChoices(state);
  state.submittedAnswer = getCurrentResponseValue(state);
  if (state.currentQuestion?.responseType === "selection-words") {
    state.submittedTokenIndexes = normalizeQuizSelectionIndexes(state.selectedTokenIndexes, Infinity);
  }
  if (state.currentQuestion?.responseType === "categories") {
    state.submittedCategoryAssignments = new Map(state.categoryAssignments);
    state.submittedCategoryLabelOrder = captureSubmittedCategoryLabelOrder(state);
  }
  state.pendingValidationValue = "";
  state.answerRevealed = true;
  state.answerDisplayMode = "correction";
  renderCurrentView(state);
}

function requestReveal(state){
  state.latestContext?.services?.requestAnswerPhase?.({
    manual: false,
    showAnswerNow: true,
    wasCorrect: isCurrentAnswerCorrect(state)
  });
}

function canSubmitAnswer(state){
  if (getResponseUi(state.latestContext) !== "boxed") return false;
  if (state.answerRevealed || !state.currentQuestion) return false;
  if (state.currentQuestion.responseType === "qcm-text") return Boolean(state.selectedChoiceId);
  if (state.currentQuestion.responseType === "selection-words") return state.selectedTokenIndexes.length > 0;
  if (state.currentQuestion.responseType === "categories") {
    const expectedIds = Object.keys(state.currentQuestion.expectedCategoryAssignments || {});
    return expectedIds.length > 0 && expectedIds.every((labelId) => state.categoryAssignments.has(labelId));
  }
  if (!state.answerInputEl) return false;
  return getCurrentResponseValue(state).length > 0;
}

function getCurrentResponseValue(state){
  if (state.answerRevealed) return String(state.submittedAnswer || "").trim();
  if (state.currentQuestion?.responseType === "qcm-text") return String(state.selectedChoiceId || "").trim();
  if (state.currentQuestion?.responseType === "selection-words") {
    const indexes = state.answerRevealed ? state.submittedTokenIndexes : state.selectedTokenIndexes;
    return normalizeQuizSelectionIndexes(indexes, Infinity).join(",");
  }
  if (state.currentQuestion?.responseType === "categories") {
    const assignments = state.answerRevealed ? state.submittedCategoryAssignments : state.categoryAssignments;
    return serializeCategoryAssignments(assignments);
  }
  return String(
    state.pendingValidationValue
    || state.responseDraftValue
    || state.answerInputEl?.value
    || ""
  ).trim();
}

function getStoredEvaluation(state){
  return evaluateAnswer(state.currentQuestion, state.submittedAnswer);
}

function getCurrentEvaluation(state){
  return evaluateAnswer(state.currentQuestion, getCurrentResponseValue(state));
}

function isCurrentAnswerCorrect(state){
  if (!state.currentQuestion) return false;
  if (state.currentQuestion.responseType === "qcm-text") return Boolean(state.selectedChoiceId && getCurrentEvaluation(state).isCorrect);
  if (state.currentQuestion.responseType === "selection-words") return Boolean(state.selectedTokenIndexes.length && getCurrentEvaluation(state).isCorrect);
  if (state.currentQuestion.responseType === "categories") return Boolean(state.categoryAssignments.size && getCurrentEvaluation(state).isCorrect);
  return Boolean(state.answerInputEl && getCurrentEvaluation(state).isCorrect);
}

function canToggleStudentAnswerDisplay(state){
  if (!state.answerRevealed || !state.currentQuestion) return false;
  if (state.currentQuestion.responseType === "qcm-text") return false;
  if (state.currentQuestion.responseType === "categories") {
    if (!state.submittedCategoryAssignments.size) return false;
    return !getStoredEvaluation(state).isCorrect;
  }
  if (state.currentQuestion.responseType === "selection-words") {
    if (!state.submittedTokenIndexes.length) return false;
    return !getStoredEvaluation(state).isCorrect;
  }
  if (!String(state.submittedAnswer || "").trim()) return false;
  return !getStoredEvaluation(state).isCorrect;
}

function getShellAnswerDisplayState(state){
  return {
    canToggle: canToggleStudentAnswerDisplay(state),
    mode: canToggleStudentAnswerDisplay(state)
      ? normalizeAnswerDisplayMode(state.answerDisplayMode)
      : "correction",
    transitionTargets: getShellAnswerTransitionTargets(state)
  };
}

function getShellAnswerTransitionTargets(state){
  if (!state.canvasEl || !state.currentQuestion) return [];

  const responseWidgetTypes = new Set([
    "answer",
    "numeric-keypad",
    "qcm-text",
    "selection-words",
    "labels",
    "categories"
  ]);
  const widgetIds = (Array.isArray(state.currentQuestion.widgets) ? state.currentQuestion.widgets : [])
    .filter((widget) => {
      if (responseWidgetTypes.has(widget?.type)) return true;
      const questionView = getWidgetView(widget, "question");
      const correctionView = getWidgetView(widget, "correction");
      return isRuntimeWidgetVisible(state, questionView, "question")
        !== isRuntimeWidgetVisible(state, correctionView, "correction")
        || getRuntimeWidgetViewSignature(widget, questionView)
          !== getRuntimeWidgetViewSignature(widget, correctionView);
    })
    .map((widget) => String(widget?.id || ""))
    .filter(Boolean);

  return widgetIds
    .map((widgetId) => findRuntimeWidgetNode(state.canvasEl, widgetId))
    .filter(Boolean);
}

function applyShellAnswerDisplayMode(state, mode){
  if (!state.answerRevealed || !state.currentQuestion) return false;
  if (!canToggleStudentAnswerDisplay(state)) {
    state.answerDisplayMode = "correction";
    renderCurrentView(state);
    return false;
  }
  state.answerDisplayMode = normalizeAnswerDisplayMode(mode);
  renderCurrentView(state);
  return true;
}

function normalizeAnswerDisplayMode(value){
  return String(value || "").trim().toLowerCase() === "student" ? "student" : "correction";
}

function focusPrimaryInput(state){
  if (["qcm-text", "selection-words", "categories"].includes(state.currentQuestion?.responseType)) return;
  if (!state.answerInputEl) return;
  queueMicrotask(() => {
    try {
      state.answerInputEl.focus({ preventScroll: true });
      state.answerInputEl.select?.();
    } catch {
      state.answerInputEl.focus?.();
    }
  });
}

function syncValidateState(state){
  state.latestContext?.services?.notifyValidationStateChanged?.();
}

function getResponseUi(context = {}){
  const value = String(
    context?.responseUi
    ?? context?.response_ui
    ?? context?.passationProfile?.responseUi
    ?? context?.passationProfile?.response_ui
    ?? "boxed"
  ).trim().toLowerCase();
  return value === "free" ? "free" : "boxed";
}

function normalizeRuntimeFontSize(value){
  const safe = String(value || "normal").trim().toLowerCase();
  return ["small", "normal", "large", "huge"].includes(safe) ? safe : "normal";
}

const RUNTIME_FONT_FALLBACKS = Object.freeze({
  small:32,
  normal:48,
  large:64,
  huge:80
});

function getWidgetStyle(view){
  const horizontal = view.textAlign === "left" ? "flex-start" : view.textAlign === "right" ? "flex-end" : "center";
  const vertical = view.verticalAlign === "top" ? "flex-start" : view.verticalAlign === "bottom" ? "flex-end" : "center";
  const fontSize = normalizeRuntimeFontSize(view.fontSize);
  return [
    `grid-column:${view.column} / span ${view.columnSpan}`,
    `grid-row:${view.row} / span ${view.rowSpan}`,
    `--quiz-runtime-horizontal:${horizontal}`,
    `--quiz-runtime-vertical:${vertical}`,
    `--quiz-runtime-text-align:${view.textAlign}`,
    `--quiz-runtime-row-span:${view.rowSpan}`,
    `--quiz-runtime-font-size-key:${fontSize}`,
    `--quiz-runtime-target-font-size:var(--runtime-font-${fontSize}, ${RUNTIME_FONT_FALLBACKS[fontSize]}px)`
  ].join(";");
}

function renderRichTextModel(text, formatting = []){
  const rawText = String(text ?? "");
  const runs = (Array.isArray(formatting) ? formatting : [])
    .map((run) => ({
      start:Math.max(0, Math.min(rawText.length, Number(run?.start) || 0)),
      end:Math.max(0, Math.min(rawText.length, Number(run?.end) || 0)),
      bold:Boolean(run?.bold),
      italic:Boolean(run?.italic),
      underline:Boolean(run?.underline),
      color:String(run?.color || "")
    }))
    .filter((run) => run.end > run.start)
    .sort((first, second) => first.start - second.start || first.end - second.end);
  let cursor = 0;
  const chunks = [];
  const append = (value, run = null) => {
    if (!value) return;
    const safe = escapeHtml(value).replace(/\r?\n/g, "<br>");
    if (!run || (!run.bold && !run.italic && !run.underline && !run.color)) {
      chunks.push(safe);
      return;
    }
    const styles = [];
    if (run.bold) styles.push("font-weight:bold");
    if (run.italic) styles.push("font-style:italic");
    if (run.underline) styles.push("text-decoration:underline");
    if (run.color) styles.push(`color:${run.color}`);
    chunks.push(`<span style="${styles.join(";")}">${safe}</span>`);
  };
  runs.forEach((run) => {
    if (run.start > cursor) append(rawText.slice(cursor, run.start));
    append(rawText.slice(run.start, run.end), run);
    cursor = run.end;
  });
  if (cursor < rawText.length) append(rawText.slice(cursor));
  return chunks.join("");
}

function sanitizeRichHtml(value){
  const raw = String(value || "");
  if (typeof document === "undefined") return escapeHtml(raw);
  const template = document.createElement("template");
  template.innerHTML = raw;
  const output = document.createElement("div");
  const allowedTags = new Set(["BR", "STRONG", "B", "EM", "I", "U", "SPAN"]);
  const allowedColors = new Map([
    ["#d32f2f", "#d32f2f"],
    ["rgb(211, 47, 47)", "#d32f2f"],
    ["#2e7d32", "#2e7d32"],
    ["rgb(46, 125, 50)", "#2e7d32"],
    ["#1565c0", "#1565c0"],
    ["rgb(21, 101, 192)", "#1565c0"],
    ["#d49a00", "#d49a00"],
    ["rgb(212, 154, 0)", "#d49a00"]
  ]);

  const cleanNode = (node, parent) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.append(document.createTextNode(node.textContent || ""));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (!allowedTags.has(node.tagName)) {
      Array.from(node.childNodes).forEach((child) => cleanNode(child, parent));
      return;
    }
    const tag = node.tagName === "B" ? "strong" : node.tagName === "I" ? "em" : node.tagName.toLowerCase();
    const element = document.createElement(tag);
    const color = String(node.style?.color || "").trim().toLowerCase();
    const weight = String(node.style?.fontWeight || "").trim().toLowerCase();
    const style = String(node.style?.fontStyle || "").trim().toLowerCase();
    const decoration = String(node.style?.textDecoration || node.style?.textDecorationLine || "").trim().toLowerCase();
    const safeColor = allowedColors.get(color);
    if (safeColor) element.style.color = safeColor;
    if (weight === "bold" || Number.parseInt(weight, 10) >= 600) element.style.fontWeight = "bold";
    if (style === "italic") element.style.fontStyle = "italic";
    if (decoration.includes("underline")) element.style.textDecoration = "underline";
    Array.from(node.childNodes).forEach((child) => cleanNode(child, element));
    parent.append(element);
  };

  Array.from(template.content.childNodes).forEach((node) => cleanNode(node, output));
  return output.innerHTML;
}

function teardownInputBindings(state){
  state.inputAbortController?.abort();
  state.inputAbortController = null;
  state.keypadAbortController?.abort();
  state.keypadAbortController = null;
  state.qcmAbortController?.abort();
  state.qcmAbortController = null;
  state.selectionAbortController?.abort();
  state.selectionAbortController = null;
  state.labelsAbortController?.abort();
  state.labelsAbortController = null;
  state.labelsResizeObserver?.disconnect();
  state.labelsResizeObserver = null;
  if (state.labelsLayoutFrame) window.cancelAnimationFrame(state.labelsLayoutFrame);
  state.labelsLayoutFrame = 0;
  state.canvasEl?.querySelectorAll?.(".quiz-runtime-label-chip.is-floating").forEach((node) => node.remove());
  clearRuntimeLabelDropTargets(state);
  state.activeLabelDrag = null;
  state.audioAbortController?.abort();
  state.audioAbortController = null;
  stopRuntimeAudio(state);
  state.activeAudioEl = null;
  state.answerInputEl = null;
}

function teardownState(state, container){
  teardownInputBindings(state);
  if (container) container.innerHTML = "";
  state.container = null;
  state.root = null;
  state.canvasEl = null;
  state.currentQuestion = null;
  state.questions = [];
  state.deck = [];
  state.deckIndex = 0;
  state.loadedSignature = "";
  state.answerRevealed = false;
  state.submittedAnswer = "";
  state.responseDraftValue = "";
  state.pendingValidationValue = "";
  state.selectedChoiceId = "";
  state.selectedTokenIndexes = [];
  state.submittedTokenIndexes = [];
  state.categoryAssignments.clear();
  state.submittedCategoryAssignments.clear();
  state.submittedCategoryLabelOrder.clear();
  state.labelPositions.clear();
  state.activeLabelDrag = null;
  state.answerDisplayMode = "correction";
  state.qcmResizeObserver?.disconnect?.();
  state.qcmResizeObserver = null;
  state.qcmFitTimers.forEach((timer) => window.clearTimeout(timer));
  state.qcmFitTimers = [];
  state.qcmChoiceFontSizes.clear();
  state.textResizeObserver?.disconnect?.();
  state.textResizeObserver = null;
  state.textFitTimers.forEach((timer) => window.clearTimeout(timer));
  state.textFitTimers = [];
}

function injectStyles(){
  if (stylesInjected) return;
  stylesInjected = true;
  ensureToolUiStyles();
  const selectionTextHref = new URL("../../shared/selection-text.css", import.meta.url).href;
  if (!document.querySelector(`link[data-selection-text-style="${selectionTextHref}"]`)) {
    const selectionTextLink = document.createElement("link");
    selectionTextLink.rel = "stylesheet";
    selectionTextLink.href = selectionTextHref;
    selectionTextLink.dataset.selectionTextStyle = selectionTextHref;
    document.head.appendChild(selectionTextLink);
  }
  const href = new URL("./activity.css", import.meta.url).href;
  if (document.querySelector(`link[data-quiz-runtime-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.quizRuntimeStyle = href;
  document.head.appendChild(link);
}

function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
