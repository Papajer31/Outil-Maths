import {
  getQuizQuestionSelectionKey,
  getQuizSelectionItems,
  normalizeQuizRuntimeSettings,
  normalizeQuizSelectionForSnapshot,
  normalizeQuizSnapshot
} from "../../../tools/quiz/model.js";
import {
  bindQuestionSelectionWidget,
  readQuestionSelection,
  renderQuestionSelectionWidget,
  updateQuestionSelectionUi
} from "../../../shared/tool-commons/general-tools/question-selection-widget.js";

export function renderQuizRuntimeSettingsEditor(host, {
  snapshot = {},
  settings = {},
  idPrefix = "quiz-runtime",
  onChange = null
} = {}) {
  if (!host) return;
  const quiz = normalizeQuizSnapshot(snapshot);
  const normalized = normalizeQuizRuntimeSettings(settings, quiz);
  const items = getQuizSelectionItems(quiz);
  const selection = normalizeQuizSelectionForSnapshot(quiz, normalized.questionSelection);

  host.innerHTML = `
    <section class="quiz-runtime-settings-panel" aria-label="Réglages de passation du quiz">
      <div class="quiz-runtime-settings-order">
        <div class="quiz-runtime-settings-heading">
          <strong>Passation</strong>
          <span>Ces réglages sont utilisés quand le quiz est attribué directement.</span>
        </div>
        <div class="quiz-runtime-settings-order-control" role="radiogroup" aria-label="Ordre des questions">
          <span class="quiz-runtime-settings-label">Ordre</span>
          <label class="quiz-runtime-settings-pill">
            <input type="radio" name="${escapeHtml(idPrefix)}_drawMode" value="in_order" ${normalized.drawMode === "in_order" ? "checked" : ""}>
            <span>Dans l’ordre</span>
          </label>
          <label class="quiz-runtime-settings-pill">
            <input type="radio" name="${escapeHtml(idPrefix)}_drawMode" value="random" ${normalized.drawMode === "random" ? "checked" : ""}>
            <span>Aléatoire</span>
          </label>
        </div>
      </div>
      <div class="quiz-runtime-settings-direct-options">
        <label class="quiz-runtime-settings-field">
          <span>Temps par question</span>
          <select class="student-select" data-quiz-runtime-time-limit>
            ${[
              [0, "Sans limite"],
              [60, "1 min"],
              [120, "2 min"],
              [180, "3 min"],
              [300, "5 min"],
              [600, "10 min"],
              [900, "15 min"],
              [1200, "20 min"]
            ].map(([value, label]) => `<option value="${value}" ${normalized.timeLimitSec === value ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </label>
        <label class="quiz-runtime-settings-switch">
          <input type="checkbox" data-quiz-runtime-auto-exit ${normalized.autoExitOnComplete ? "checked" : ""}>
          <span>Retour automatique aux activités à la fin</span>
        </label>
      </div>
      ${renderQuestionSelectionWidget({
        idPrefix,
        items,
        selection,
        title: "Questions utilisées",
        itemSingular: "question",
        itemPlural: "questions",
        itemKeyGetter: getQuizQuestionSelectionKey,
        emptyMessage: "Aucune question à sélectionner.",
        listAriaLabel: "Questions du quiz"
      })}
    </section>
  `;

  bindQuestionSelectionWidget(host, { idPrefix });
  updateQuestionSelectionUi(host, { idPrefix });

  const notify = () => {
    if (typeof onChange === "function") onChange(readQuizRuntimeSettingsEditor(host, { snapshot: quiz, idPrefix }));
  };
  host.querySelectorAll(`input[name="${cssEscape(idPrefix)}_drawMode"]`).forEach((input) => input.addEventListener("change", notify));
  host.querySelector("[data-quiz-runtime-time-limit]")?.addEventListener("change", notify);
  host.querySelector("[data-quiz-runtime-auto-exit]")?.addEventListener("change", notify);
  host.querySelector(`[data-question-selection="${cssEscape(idPrefix)}"]`)?.addEventListener("change", notify);
  host.querySelector(`#${cssEscape(idPrefix)}_questionSelectionQuick`)?.addEventListener("input", notify);
  host.querySelector(`[data-question-selection="${cssEscape(idPrefix)}"]`)?.addEventListener("click", (event) => {
    if (event.target?.closest?.("[data-question-selection-action]")) queueMicrotask(notify);
  });
  return normalized;
}

export function readQuizRuntimeSettingsEditor(host, {
  snapshot = {},
  idPrefix = "quiz-runtime"
} = {}) {
  const quiz = normalizeQuizSnapshot(snapshot);
  const drawMode = host?.querySelector(`input[name="${cssEscape(idPrefix)}_drawMode"]:checked`)?.value === "in_order"
    ? "in_order"
    : "random";
  const questionSelection = normalizeQuizSelectionForSnapshot(quiz, readQuestionSelection(host, {
    idPrefix,
    fallback: quiz.runtimeSettings?.questionSelection || { mode:"all", questionKeys:[] },
    allowEmpty: true
  }));
  const timeLimitSec = Math.max(0, Math.trunc(Number(host?.querySelector("[data-quiz-runtime-time-limit]")?.value) || 0));
  const autoExitOnComplete = host?.querySelector("[data-quiz-runtime-auto-exit]")?.checked === true;
  return normalizeQuizRuntimeSettings({ drawMode, questionSelection, timeLimitSec, autoExitOnComplete }, quiz);
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
