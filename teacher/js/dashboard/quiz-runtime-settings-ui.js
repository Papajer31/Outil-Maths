import {
  getQuizQuestionSelectionKey,
  getQuizSelectionItems,
  getWidgetView,
  materializeQuizQuestionVariant,
  normalizeQuizRuntimeSettings,
  normalizeQuizSelectionForSnapshot,
  normalizeQuizSnapshot
} from "../../../tools/quiz/model.js";

export function renderQuizRuntimeSettingsEditor(host, {
  snapshot = {},
  settings = {},
  idPrefix = "quiz-runtime",
  title = "Règles de passation",
  description = "",
  onChange = null
} = {}) {
  if (!host) return;
  const quiz = normalizeQuizSnapshot(snapshot);
  const normalized = normalizeQuizRuntimeSettings(settings, quiz);
  const selection = normalizeQuizSelectionForSnapshot(quiz, normalized.questionSelection);
  const groups = buildVariantGroups(quiz);
  const currentKeys = groups.flatMap((group) => group.variants.map((variant) => variant.key));
  const currentKeySet = new Set(currentKeys);
  const selectedKeySet = selection.mode === "custom"
    ? new Set(selection.questionKeys.filter((key) => currentKeySet.has(key)))
    : new Set(currentKeys);
  const missingKeys = selection.mode === "custom"
    ? selection.questionKeys.filter((key) => !currentKeySet.has(key))
    : [];
  const prefix = normalizeIdPrefix(idPrefix);
  const questionCount = groups.length;

  host.innerHTML = `
    <section class="quiz-runtime-settings-panel" aria-label="Réglages de passation du quiz">
      <div class="quiz-runtime-settings-order">
        <div class="quiz-runtime-settings-heading">
          <strong>${escapeHtml(title)}</strong>
          ${description ? `<span>${escapeHtml(description)}</span>` : ""}
        </div>
        <div class="quiz-runtime-settings-order-control" role="radiogroup" aria-label="Ordre des questions">
          <span class="quiz-runtime-settings-label">Ordre des questions</span>
          <label class="quiz-runtime-settings-pill">
            <input type="radio" name="${escapeHtml(prefix)}_drawMode" value="in_order" ${normalized.drawMode === "in_order" ? "checked" : ""}>
            <span>Dans l’ordre</span>
          </label>
          <label class="quiz-runtime-settings-pill">
            <input type="radio" name="${escapeHtml(prefix)}_drawMode" value="random" ${normalized.drawMode === "random" ? "checked" : ""}>
            <span>Aléatoire</span>
          </label>
        </div>
      </div>

      <div class="quiz-runtime-variant-selection" data-quiz-variant-selection="${escapeHtml(prefix)}">
        <div class="quiz-runtime-variant-selection-header">
          <div>
            <strong>Sélection des questions et variantes</strong>
            <span class="quiz-runtime-variant-selection-summary" data-quiz-variant-selection-summary></span>
          </div>
          <div class="quiz-runtime-variant-selection-mode" role="radiogroup" aria-label="Sélection des questions et variantes">
            <label class="quiz-runtime-settings-pill">
              <input type="radio" name="${escapeHtml(prefix)}_selectionMode" value="all" ${selection.mode !== "custom" ? "checked" : ""}>
              <span>Tout le quiz</span>
            </label>
            <label class="quiz-runtime-settings-pill" data-quiz-variant-selection-open>
              <input type="radio" name="${escapeHtml(prefix)}_selectionMode" value="custom" ${selection.mode === "custom" ? "checked" : ""}>
              <span>Sélection personnalisée</span>
            </label>
          </div>
        </div>

        <button class="quiz-runtime-variant-selection-edit" type="button" data-quiz-variant-selection-open ${selection.mode === "custom" ? "" : "hidden"}>
          <span class="dashboard-material-icon" aria-hidden="true">tune</span>
          <span class="quiz-runtime-variant-selection-edit-copy">
            <strong>Modifier la sélection</strong>
            <small data-quiz-variant-selection-edit-summary></small>
          </span>
          <span class="dashboard-material-icon" aria-hidden="true">chevron_right</span>
        </button>

        <div class="quiz-runtime-variant-selection-overlay" data-quiz-variant-selection-panel hidden>
          <section class="quiz-runtime-variant-selection-dialog" role="dialog" aria-modal="true" aria-labelledby="${escapeHtml(prefix)}_selectionTitle" tabindex="-1">
            <header class="quiz-runtime-variant-selection-dialog-head">
              <div class="quiz-runtime-variant-selection-dialog-copy">
                <span class="quiz-runtime-variant-selection-kicker">Règles de passation</span>
                <h3 id="${escapeHtml(prefix)}_selectionTitle">Sélection personnalisée</h3>
                <p>${questionCount} question${questionCount > 1 ? "s" : ""} · <span data-quiz-variant-selection-overlay-summary></span></p>
              </div>
              <button class="quiz-runtime-variant-selection-close dashboard-icon-btn dashboard-material-icon-btn" type="button" data-quiz-variant-selection-close aria-label="Fermer la sélection" title="Fermer">
                <span class="dashboard-material-icon" aria-hidden="true">close</span>
              </button>
            </header>

            <div class="quiz-runtime-variant-selection-toolbar">
              <span>Sélectionne exactement les variantes qui pourront être jouées dans la mission.</span>
              <div class="quiz-runtime-variant-selection-actions">
                <button class="btn" type="button" data-quiz-variant-selection-action="all">Tout cocher</button>
                <button class="btn" type="button" data-quiz-variant-selection-action="none">Tout décocher</button>
              </div>
            </div>

            <div class="quiz-runtime-variant-selection-viewport">
              <div class="quiz-runtime-variant-selection-list" tabindex="0" data-quiz-variant-selection-scroll>
                ${groups.length ? groups.map((group) => renderVariantGroup(group, selectedKeySet)).join("") : `
                  <div class="quiz-runtime-variant-selection-empty">Aucune variante disponible.</div>
                `}
                <div class="quiz-runtime-variant-selection-missing" data-quiz-variant-selection-missing ${missingKeys.length ? "" : "hidden"}>
                  <span class="dashboard-material-icon" aria-hidden="true">warning</span>
                  <span data-quiz-variant-selection-missing-text></span>
                  <button class="btn" type="button" data-quiz-variant-selection-clear-missing>Retirer de la sélection</button>
                </div>
              </div>
            </div>

            <footer class="quiz-runtime-variant-selection-dialog-foot">
              <span class="quiz-runtime-variant-selection-foot-summary" data-quiz-variant-selection-foot-summary></span>
              <button class="btn primary" type="button" data-quiz-variant-selection-close>Terminer</button>
            </footer>
          </section>
        </div>
      </div>
    </section>
  `;

  const root = host.querySelector(`[data-quiz-variant-selection="${cssEscape(prefix)}"]`);
  host._quizRuntimeSnapshot = quiz;
  if (root) root._quizMissingSelectionKeys = [...missingKeys];
  bindVariantSelectionTree(host, { idPrefix:prefix, onChange });
  updateVariantSelectionUi(host, { idPrefix:prefix });

  const notify = () => {
    if (typeof onChange === "function") onChange(readQuizRuntimeSettingsEditor(host, { snapshot:quiz, idPrefix:prefix }));
  };
  host.querySelectorAll(`input[name="${cssEscape(prefix)}_drawMode"]`).forEach((input) => input.addEventListener("change", notify));
  return normalized;
}

export function readQuizRuntimeSettingsEditor(host, {
  snapshot = {},
  idPrefix = "quiz-runtime"
} = {}) {
  const quiz = normalizeQuizSnapshot(snapshot);
  const prefix = normalizeIdPrefix(idPrefix);
  const drawMode = host?.querySelector(`input[name="${cssEscape(prefix)}_drawMode"]:checked`)?.value === "in_order"
    ? "in_order"
    : "random";
  const root = host?.querySelector(`[data-quiz-variant-selection="${cssEscape(prefix)}"]`);
  const selectionMode = host?.querySelector(`input[name="${cssEscape(prefix)}_selectionMode"]:checked`)?.value === "custom"
    ? "custom"
    : "all";
  const questionSelection = selectionMode === "custom"
    ? {
        mode:"custom",
        questionKeys:[
          ...Array.from(root?.querySelectorAll("[data-quiz-variant-key]:checked") || []).map((input) => String(input.dataset.quizVariantKey || "")).filter(Boolean),
          ...Array.from(root?._quizMissingSelectionKeys || [])
        ]
      }
    : { mode:"all", questionKeys:[] };

  return normalizeQuizRuntimeSettings({ drawMode, questionSelection, timeLimitSec:0, autoExitOnComplete:false }, quiz);
}

function buildVariantGroups(quiz = {}){
  const items = getQuizSelectionItems(quiz);
  const byQuestionId = new Map();
  items.forEach((item, itemIndex) => {
    const questionId = String(item.sourceQuestionId || item.id || `question-${itemIndex + 1}`);
    let group = byQuestionId.get(questionId);
    if (!group) {
      const questionIndex = Math.max(0, quiz.questions.findIndex((question) => String(question.id) === questionId));
      const question = quiz.questions[questionIndex] || item;
      group = {
        questionId,
        questionIndex,
        title:`Question ${questionIndex + 1}`,
        subtitle:normalizeQuestionSubtitle(question?.title),
        variants:[]
      };
      byQuestionId.set(questionId, group);
    }
    const variantIndex = Number(item.sourceVariantIndex ?? group.variants.length);
    const descriptor = getVariantDescriptor(item, variantIndex);
    group.variants.push({
      key:getQuizQuestionSelectionKey(item, itemIndex),
      index:variantIndex,
      title:descriptor.title,
      detail:descriptor.detail,
      response:descriptor.response
    });
  });
  return Array.from(byQuestionId.values()).sort((left, right) => left.questionIndex - right.questionIndex);
}

function renderVariantGroup(group, selectedKeySet){
  const selectedCount = group.variants.filter((variant) => selectedKeySet.has(variant.key)).length;
  const allSelected = group.variants.length > 0 && selectedCount === group.variants.length;
  return `
    <section class="quiz-runtime-variant-group" data-quiz-variant-group="${escapeHtml(group.questionId)}">
      <label class="quiz-runtime-variant-group-header">
        <input type="checkbox" data-quiz-question-variants-toggle ${allSelected ? "checked" : ""}>
        <span class="quiz-runtime-variant-group-copy">
          <strong>${escapeHtml(group.title)}</strong>
          ${group.subtitle ? `<small>${escapeHtml(group.subtitle)}</small>` : ""}
        </span>
        <span class="quiz-runtime-variant-group-count" data-quiz-variant-group-count>${selectedCount} / ${group.variants.length}</span>
      </label>
      <div class="quiz-runtime-variant-list">
        ${group.variants.map((variant) => `
          <label class="quiz-runtime-variant-row">
            <input type="checkbox" data-quiz-variant-key="${escapeHtml(variant.key)}" ${selectedKeySet.has(variant.key) ? "checked" : ""}>
            <span class="quiz-runtime-variant-row-copy">
              <strong>${escapeHtml(variant.title)}</strong>
              ${variant.detail ? `<small><span>${escapeHtml(variant.detail)}</span></small>` : ""}
            </span>
            ${variant.response ? `<span class="quiz-runtime-variant-row-response">${escapeHtml(variant.response)}</span>` : ""}
          </label>
        `).join("")}
      </div>
    </section>
  `;
}

function bindVariantSelectionTree(host, { idPrefix = "quiz-runtime", onChange = null } = {}){
  const prefix = normalizeIdPrefix(idPrefix);
  const root = host?.querySelector(`[data-quiz-variant-selection="${cssEscape(prefix)}"]`);
  if (!root) return;
  const notify = () => {
    updateVariantSelectionUi(host, { idPrefix:prefix });
    if (typeof onChange === "function") onChange(readQuizRuntimeSettingsEditor(host, { snapshot:host._quizRuntimeSnapshot || {}, idPrefix:prefix }));
  };

  root.addEventListener("change", (event) => {
    const mode = event.target?.closest?.(`input[name="${cssEscape(prefix)}_selectionMode"]`);
    if (mode) {
      updateVariantSelectionUi(host, { idPrefix:prefix });
      if (mode.value === "custom") openVariantSelectionOverlay(host, prefix);
      else closeVariantSelectionOverlay(host, prefix);
      if (typeof onChange === "function") onChange(readQuizRuntimeSettingsEditor(host, { snapshot:host._quizRuntimeSnapshot, idPrefix:prefix }));
      return;
    }

    const questionToggle = event.target?.closest?.("[data-quiz-question-variants-toggle]");
    if (questionToggle) {
      const group = questionToggle.closest("[data-quiz-variant-group]");
      group?.querySelectorAll("[data-quiz-variant-key]").forEach((checkbox) => { checkbox.checked = questionToggle.checked; });
      notify();
      return;
    }

    if (event.target?.closest?.("[data-quiz-variant-key]")) notify();
  });

  root.addEventListener("click", (event) => {
    const open = event.target?.closest?.("[data-quiz-variant-selection-open]");
    if (open && root.contains(open)) {
      const customRadio = host.querySelector(`input[name="${cssEscape(prefix)}_selectionMode"][value="custom"]`);
      if (customRadio && !customRadio.checked) {
        customRadio.checked = true;
        updateVariantSelectionUi(host, { idPrefix:prefix });
        if (typeof onChange === "function") onChange(readQuizRuntimeSettingsEditor(host, { snapshot:host._quizRuntimeSnapshot, idPrefix:prefix }));
      }
      openVariantSelectionOverlay(host, prefix);
      return;
    }

    const close = event.target?.closest?.("[data-quiz-variant-selection-close]");
    if (close && root.contains(close)) {
      closeVariantSelectionOverlay(host, prefix);
      return;
    }

    const overlay = root.querySelector("[data-quiz-variant-selection-panel]");
    if (event.target === overlay) {
      closeVariantSelectionOverlay(host, prefix);
      return;
    }

    const action = event.target?.closest?.("[data-quiz-variant-selection-action]")?.dataset.quizVariantSelectionAction;
    if (action === "all" || action === "none") {
      const checked = action === "all";
      root.querySelectorAll("[data-quiz-variant-key]").forEach((checkbox) => { checkbox.checked = checked; });
      notify();
      return;
    }
    if (event.target?.closest?.("[data-quiz-variant-selection-clear-missing]")) {
      root._quizMissingSelectionKeys = [];
      notify();
    }
  });

  root.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const overlay = root.querySelector("[data-quiz-variant-selection-panel]");
    if (!overlay || overlay.hidden) return;
    event.preventDefault();
    closeVariantSelectionOverlay(host, prefix);
  });
}

function openVariantSelectionOverlay(host, prefix){
  const root = host?.querySelector(`[data-quiz-variant-selection="${cssEscape(prefix)}"]`);
  const overlay = root?.querySelector("[data-quiz-variant-selection-panel]");
  if (!overlay) return;
  root._quizSelectionPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  overlay.hidden = false;
  root.classList.add("is-overlay-open");
  requestAnimationFrame(() => {
    overlay.querySelector(".quiz-runtime-variant-selection-dialog")?.focus({ preventScroll:true });
  });
}

function closeVariantSelectionOverlay(host, prefix){
  const root = host?.querySelector(`[data-quiz-variant-selection="${cssEscape(prefix)}"]`);
  const overlay = root?.querySelector("[data-quiz-variant-selection-panel]");
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  root.classList.remove("is-overlay-open");
  const previousFocus = root._quizSelectionPreviousFocus;
  root._quizSelectionPreviousFocus = null;
  if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === "function") {
    requestAnimationFrame(() => previousFocus.focus({ preventScroll:true }));
  }
}

function updateVariantSelectionUi(host, { idPrefix = "quiz-runtime" } = {}){
  const prefix = normalizeIdPrefix(idPrefix);
  const root = host?.querySelector(`[data-quiz-variant-selection="${cssEscape(prefix)}"]`);
  if (!root) return;
  const custom = host.querySelector(`input[name="${cssEscape(prefix)}_selectionMode"]:checked`)?.value === "custom";
  const editButton = root.querySelector(".quiz-runtime-variant-selection-edit");
  if (editButton) editButton.hidden = !custom;
  if (!custom) closeVariantSelectionOverlay(host, prefix);

  let selected = 0;
  let total = 0;
  root.querySelectorAll("[data-quiz-variant-group]").forEach((group) => {
    const variants = Array.from(group.querySelectorAll("[data-quiz-variant-key]"));
    const selectedInGroup = variants.filter((checkbox) => checkbox.checked).length;
    selected += selectedInGroup;
    total += variants.length;
    const questionToggle = group.querySelector("[data-quiz-question-variants-toggle]");
    if (questionToggle) {
      questionToggle.checked = variants.length > 0 && selectedInGroup === variants.length;
      questionToggle.indeterminate = selectedInGroup > 0 && selectedInGroup < variants.length;
    }
    const count = group.querySelector("[data-quiz-variant-group-count]");
    if (count) count.textContent = `${selectedInGroup} / ${variants.length}`;
  });

  const effectiveSelected = custom ? selected : total;
  const plural = total > 1 ? "variantes" : "variante";
  const summary = root.querySelector("[data-quiz-variant-selection-summary]");
  if (summary) summary.textContent = custom
    ? `${effectiveSelected} ${effectiveSelected > 1 ? "variantes" : "variante"} sur ${total}`
    : `${total} ${plural} · tout le quiz`;
  const editSummary = root.querySelector("[data-quiz-variant-selection-edit-summary]");
  if (editSummary) editSummary.textContent = `${effectiveSelected} ${effectiveSelected > 1 ? "variantes" : "variante"} sur ${total} sélectionnée${effectiveSelected > 1 ? "s" : ""}`;
  root.querySelectorAll("[data-quiz-variant-selection-overlay-summary]").forEach((node) => {
    node.textContent = `${effectiveSelected} / ${total} ${plural}`;
  });
  const footSummary = root.querySelector("[data-quiz-variant-selection-foot-summary]");
  if (footSummary) footSummary.textContent = `${effectiveSelected} ${effectiveSelected > 1 ? "variantes sélectionnées" : "variante sélectionnée"} sur ${total}`;

  const missingKeys = Array.from(root._quizMissingSelectionKeys || []);
  const missing = root.querySelector("[data-quiz-variant-selection-missing]");
  if (missing) missing.hidden = !custom || missingKeys.length === 0;
  const missingText = root.querySelector("[data-quiz-variant-selection-missing-text]");
  if (missingText) {
    missingText.textContent = missingKeys.length === 1
      ? "1 variante ou question sélectionnée n’existe plus dans le quiz."
      : `${missingKeys.length} variantes ou questions sélectionnées n’existent plus dans le quiz.`;
  }
}

function getVariantDescriptor(item = {}, variantIndex = 0){
  const materialized = materializeQuizQuestionVariant(item, 0);
  const widgets = (Array.isArray(materialized.widgets) ? materialized.widgets : [])
    .slice()
    .sort((left, right) => Number(left?.row || 0) - Number(right?.row || 0) || Number(left?.column || 0) - Number(right?.column || 0));

  const snippets = [];
  for (const widget of widgets) {
    const view = getWidgetView(widget, "question");
    if (!view || view.visible === false) continue;
    if (["text", "masked-text", "flash-text", "selection-words"].includes(widget.type)) {
      const text = cleanText(view.text);
      if (text) snippets.push(text);
      continue;
    }
    if (widget.type === "image" || widget.type === "flash-image") {
      const label = getImageSourceLabel(view.imageSource || widget.questionImageSource);
      if (label) snippets.push(`Image : ${label}`);
      continue;
    }
    if (widget.type === "audio") {
      const label = getMediaSourceLabel(view.audioSource || widget.questionAudioSource);
      if (label) snippets.push(`Audio : ${label}`);
      continue;
    }
    if (widget.type === "labels") {
      const labels = (Array.isArray(view.labelItems) ? view.labelItems : []).map((entry) => cleanText(entry?.text)).filter(Boolean);
      if (labels.length) snippets.push(`Étiquettes : ${labels.slice(0, 4).join(" · ")}${labels.length > 4 ? "…" : ""}`);
    }
  }

  const uniqueSnippets = Array.from(new Set(snippets));
  const title = shorten(uniqueSnippets[0] || getResponseFallbackTitle(materialized, variantIndex), 108);
  const detail = uniqueSnippets.length > 1 ? shorten(uniqueSnippets.slice(1, 3).join(" · "), 132) : "";
  const response = getResponseSummary(materialized);
  return { title, detail, response };
}

function getResponseFallbackTitle(question, variantIndex){
  switch (question?.responseType) {
    case "qcm-text": return "Question à choix multiple";
    case "selection-words": return "Sélection de mots dans une phrase";
    case "categories": return "Classement par catégories";
    case "verified-answer": return "Réponse vérifiée";
    case "answer": return "Réponse à saisir";
    case "done": return "Validation « J’ai terminé »";
    default:return "Contenu de la question";
  }
}

function getResponseSummary(question = {}){
  const expected = cleanText(question.expectedAnswerLabel || question.expectedAnswer || "");
  switch (question.responseType) {
    case "qcm-text":
      return expected ? `QCM · réponse : ${shorten(expected, 54)}` : "QCM";
    case "selection-words":
      return expected ? `Sélection · attendu : ${shorten(expected, 54)}` : "Sélection de mots";
    case "categories":
      return "Classement par catégories";
    case "verified-answer":
      return expected ? `Réponse vérifiée · ${shorten(expected, 54)}` : "Réponse vérifiée";
    case "answer":
      return expected ? `Réponse · ${shorten(expected, 54)}` : "Réponse à saisir";
    case "done":
      return "J’ai terminé";
    default:
      return "";
  }
}

function getImageSourceLabel(source){
  if (!source || typeof source !== "object") return "";
  return String(source.label || source.name || source.title || source.alt || source.fileName || source.file_name || source.path || source.objectPath || source.object_path || "").trim();
}

function getMediaSourceLabel(source){
  if (!source || typeof source !== "object") return "";
  return String(source.label || source.name || source.title || source.fileName || source.file_name || source.path || source.objectPath || source.object_path || "").trim();
}

function cleanText(value){
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeQuestionSubtitle(value){
  const text = String(value || "").trim();
  if (!text || /^Disposition\b/i.test(text) || /^Question\s+\d+$/i.test(text)) return "";
  return text;
}

function shorten(value, maxLength){
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function normalizeIdPrefix(value){
  return String(value || "quiz-runtime").replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function cssEscape(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(String(value));
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
