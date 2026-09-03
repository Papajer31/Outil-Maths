import { escapeAttr, escapeHtml } from "./text-utils.js";
import { openDashboardConfirmDialog } from "./confirm-dialog.js";

const PERIOD_OPTIONS = Object.freeze([
  ["today", "Aujourd’hui"],
  ["7d", "7 jours"],
  ["30d", "30 jours"],
  ["all", "Tout"]
]);

const MODE_OPTIONS = Object.freeze([
  ["all", "Tous les modes"],
  ["exploration", "Exploration"],
  ["adventure", "Aventure"],
  ["mission", "Missions"]
]);

function toTimestamp(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getAttemptTimestamp(attempt) {
  return toTimestamp(attempt?.started_at || attempt?.played_at || attempt?.created_at);
}

function formatAttemptDate(attempt) {
  const timestamp = getAttemptTimestamp(attempt);
  if (!timestamp) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp)).replace(" à ", " · ");
}

function formatDuration(value) {
  const milliseconds = Math.max(0, Math.trunc(Number(value) || 0));
  if (!milliseconds) return "—";
  const totalSeconds = Math.max(1, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (!minutes) return `${seconds} s`;
  return `${minutes} min ${String(seconds).padStart(2, "0")}`;
}

function getContextLabel(value) {
  const context = String(value || "").trim().toLowerCase();
  if (context === "adventure" || context === "aventure") return "Aventure";
  if (context === "mission") return "Missions";
  return "Exploration";
}

function getAttemptStatusLabel(value) {
  const status = String(value || "completed").trim().toLowerCase();
  if (status === "running") return "En cours";
  if (status === "interrupted") return "Interrompue";
  if (status === "abandoned") return "Abandonnée";
  return "Terminée";
}

function getQuestionOutcomeMeta(question) {
  const outcome = String(question?.outcome || "unanswered").trim().toLowerCase();
  if (outcome === "correct") return { label: "Réussie", className: "is-correct", icon: "check_circle" };
  if (outcome === "incorrect") return { label: "Erreur", className: "is-incorrect", icon: "cancel" };
  return { label: "Sans réponse", className: "is-unanswered", icon: "remove_circle_outline" };
}

function normalizeSnapshotText(value, maxLength = 1800) {
  const safe = String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (safe.length <= maxLength) return safe;
  return `${safe.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function uniqueStrings(values = []) {
  const seen = new Set();
  return values
    .map((value) => normalizeSnapshotText(value, 700))
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLocaleLowerCase("fr-FR");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function getSnapshotFieldSummary(snapshot) {
  const fields = Array.isArray(snapshot?.fields) ? snapshot.fields : [];
  const values = fields.flatMap((field) => {
    const value = normalizeSnapshotText(field?.value, 500);
    const checked = field?.checked === true;
    if (!value && !checked) return [];
    const label = normalizeSnapshotText(field?.label || field?.name || "", 160);
    if (checked && !value) return [label || "Sélectionné"];
    return [label ? `${label} : ${value}` : value];
  });
  return uniqueStrings(values);
}

function choiceLooksSelected(choice, stage) {
  if (choice?.pressed === true || choice?.selected === true || choice?.checked === true) return true;
  const classes = Array.isArray(choice?.classes) ? choice.classes.join(" ").toLowerCase() : "";
  if (stage === "correction") return /correct/.test(classes);
  return /selected|active|answer|response/.test(classes) && !/incorrect/.test(classes);
}

function getSnapshotChoiceSummary(snapshot, stage) {
  const choices = Array.isArray(snapshot?.choices) ? snapshot.choices : [];
  return uniqueStrings(
    choices
      .filter((choice) => choiceLooksSelected(choice, stage))
      .map((choice) => choice?.text || choice?.ariaLabel || "")
  );
}

function getCustomSnapshotSummary(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || snapshot.source !== "tool") return [];
  const ignored = new Set([
    "version", "source", "stage", "text", "fields", "choices", "media", "canvases", "truncated", "originalLength", "topLevelKeys"
  ]);
  const lines = [];
  for (const [key, value] of Object.entries(snapshot)) {
    if (ignored.has(key) || value == null) continue;
    if (["string", "number", "boolean"].includes(typeof value)) {
      const text = normalizeSnapshotText(value, 500);
      if (text) lines.push(`${key} : ${text}`);
    } else if (Array.isArray(value) && value.every((item) => ["string", "number", "boolean"].includes(typeof item))) {
      const text = normalizeSnapshotText(value.join(" · "), 700);
      if (text) lines.push(`${key} : ${text}`);
    }
  }
  return uniqueStrings(lines);
}

function getSnapshotMediaSummary(snapshot) {
  const media = Array.isArray(snapshot?.media) ? snapshot.media : [];
  return uniqueStrings(media.map((item) => item?.alt || item?.title || item?.ariaLabel || ""));
}

function getSnapshotStageSummary(snapshot, stage) {
  const custom = getCustomSnapshotSummary(snapshot);

  if (stage === "answer") {
    const structured = uniqueStrings([
      ...getSnapshotFieldSummary(snapshot),
      ...getSnapshotChoiceSummary(snapshot, stage),
      ...custom
    ]);
    if (structured.length) return structured;
  } else if (stage === "correction") {
    // Une saisie conserve souvent la réponse de l'élève pendant la correction :
    // on ne doit donc surtout pas relire les valeurs des champs comme corrigé.
    const structured = uniqueStrings([
      ...getSnapshotChoiceSummary(snapshot, stage),
      ...custom
    ]);
    if (structured.length) return structured;
  } else {
    const text = normalizeSnapshotText(snapshot?.text, 1800);
    const media = getSnapshotMediaSummary(snapshot);
    const structured = uniqueStrings([text, ...media, ...custom]);
    if (structured.length) return structured;
  }

  const text = normalizeSnapshotText(snapshot?.text, 1800);
  if (text) return [text];

  const canvases = Array.isArray(snapshot?.canvases) ? snapshot.canvases : [];
  if (canvases.length) return ["Réponse visuelle enregistrée dans la zone de travail."];
  return [];
}

function renderSnapshotBlock(title, snapshot, stage, emptyText) {
  const lines = getSnapshotStageSummary(snapshot, stage);
  return `
    <div class="dashboard-history-snapshot dashboard-history-snapshot--${escapeAttr(stage)}">
      <div class="dashboard-history-snapshot-title">${escapeHtml(title)}</div>
      <div class="dashboard-history-snapshot-content">
        ${lines.length
          ? lines.map((line) => `<div class="dashboard-history-snapshot-line">${escapeHtml(line)}</div>`).join("")
          : `<div class="dashboard-history-snapshot-empty">${escapeHtml(emptyText)}</div>`}
      </div>
    </div>
  `;
}

function renderQuestion(question, index) {
  const outcome = getQuestionOutcomeMeta(question);
  return `
    <article class="dashboard-history-question ${outcome.className}">
      <header class="dashboard-history-question-header">
        <div class="dashboard-history-question-title">Question ${index + 1}</div>
        <div class="dashboard-history-question-meta">
          <span class="dashboard-history-question-outcome ${outcome.className}">
            <span class="dashboard-material-icon" aria-hidden="true">${outcome.icon}</span>
            ${escapeHtml(outcome.label)}
          </span>
          <span>${escapeHtml(formatDuration(question?.duration_ms))}</span>
        </div>
      </header>
      <div class="dashboard-history-question-grid">
        ${renderSnapshotBlock("Question", question?.question_snapshot, "question", "Question non enregistrée.")}
        ${renderSnapshotBlock("Réponse de l’élève", question?.answer_snapshot, "answer", "Aucune réponse lisible dans l’instantané.")}
        ${renderSnapshotBlock("Correction", question?.correction_snapshot, "correction", "Correction non enregistrée.")}
      </div>
    </article>
  `;
}

function renderAttemptDetails(attempt) {
  const questions = Array.isArray(attempt?.questions) ? attempt.questions : [];
  if (!questions.length) {
    return `
      <div class="dashboard-history-attempt-details">
        <div class="dashboard-history-legacy-note">
          Cette tentative a été enregistrée avant l’historique détaillé : le résumé est disponible, mais pas le détail des questions.
        </div>
      </div>
    `;
  }

  return `
    <div class="dashboard-history-attempt-details">
      <div class="dashboard-history-questions">
        ${questions.map((question, index) => renderQuestion(question, index)).join("")}
      </div>
    </div>
  `;
}

function canResetAttempt(attempt) {
  const context = String(attempt?.context || "exploration").trim().toLowerCase();
  return context === "exploration" || context === "mission";
}

function renderAttemptActions(attempt) {
  const id = String(attempt?.id || "");
  const resettable = canResetAttempt(attempt);
  const effectsReset = Boolean(attempt?.progress_voided_at);

  return `
    <details class="dashboard-history-attempt-actions">
      <summary class="dashboard-history-attempt-actions-toggle" aria-label="Actions sur cette tentative" title="Actions">
        <span class="dashboard-material-icon" aria-hidden="true">more_vert</span>
      </summary>
      <div class="dashboard-history-attempt-actions-menu" role="menu">
        <button type="button" role="menuitem" data-history-attempt-action="hide" data-history-attempt-action-id="${escapeAttr(id)}">
          <span class="dashboard-material-icon" aria-hidden="true">visibility_off</span>
          <span>Supprimer de l’historique</span>
        </button>
        ${resettable ? `
          <button type="button" role="menuitem" data-history-attempt-action="reset" data-history-attempt-action-id="${escapeAttr(id)}" ${effectsReset ? "disabled" : ""}>
            <span class="dashboard-material-icon" aria-hidden="true">restart_alt</span>
            <span>${effectsReset ? "Effets déjà réinitialisés" : "Réinitialiser les effets"}</span>
          </button>
          <button class="is-danger" type="button" role="menuitem" data-history-attempt-action="delete-total" data-history-attempt-action-id="${escapeAttr(id)}">
            <span class="dashboard-material-icon" aria-hidden="true">delete_forever</span>
            <span>Supprimer totalement</span>
          </button>
        ` : `
          <div class="dashboard-history-attempt-actions-note">La réinitialisation fine d’Aventure sera ajoutée plus tard.</div>
        `}
      </div>
    </details>
  `;
}

function renderAttempt(attempt, expandedAttemptIds) {
  const id = String(attempt?.id || "");
  const questions = Array.isArray(attempt?.questions) ? attempt.questions : [];
  const total = Math.max(
    Number(attempt?.questions_count) || 0,
    (Number(attempt?.correct_count) || 0) + (Number(attempt?.wrong_count) || 0),
    questions.length
  );
  const correct = Math.max(0, Number(attempt?.correct_count) || 0);
  const expanded = expandedAttemptIds.has(id);
  const discipline = String(attempt?.discipline_name || "").trim();
  const domain = String(attempt?.domain_name || "").trim();
  const breadcrumb = [discipline, domain].filter(Boolean).join(" · ");
  const effectsReset = Boolean(attempt?.progress_voided_at);

  return `
    <article class="dashboard-history-attempt ${expanded ? "is-expanded" : ""} ${effectsReset ? "has-reset-effects" : ""}" data-history-attempt-id="${escapeAttr(id)}">
      <div class="dashboard-history-attempt-row">
        <button class="dashboard-history-attempt-main" type="button" data-history-toggle-attempt="${escapeAttr(id)}" aria-expanded="${expanded ? "true" : "false"}">
          <div class="dashboard-history-attempt-copy">
            <div class="dashboard-history-attempt-topline">
              <span class="dashboard-history-attempt-date">${escapeHtml(formatAttemptDate(attempt))}</span>
              <span class="dashboard-history-mode dashboard-history-mode--${escapeAttr(String(attempt?.context || "exploration").toLowerCase())}">${escapeHtml(getContextLabel(attempt?.context))}</span>
              ${String(attempt?.status || "completed") !== "completed" ? `<span class="dashboard-history-status">${escapeHtml(getAttemptStatusLabel(attempt?.status))}</span>` : ""}
              ${effectsReset ? `<span class="dashboard-history-reset-status">Effets réinitialisés</span>` : ""}
            </div>
            <div class="dashboard-history-attempt-title">${escapeHtml(attempt?.activity_title || "Activité")}</div>
            ${breadcrumb ? `<div class="dashboard-history-attempt-path">${escapeHtml(breadcrumb)}</div>` : ""}
          </div>
          <div class="dashboard-history-attempt-summary">
            <span class="dashboard-history-score">${total ? `${correct}/${total}` : "—"}</span>
            <span class="dashboard-history-duration">${escapeHtml(formatDuration(attempt?.duration_ms))}</span>
            <span class="dashboard-material-icon dashboard-history-chevron" aria-hidden="true">expand_more</span>
          </div>
        </button>
        ${renderAttemptActions(attempt)}
      </div>
      ${expanded ? renderAttemptDetails(attempt) : ""}
    </article>
  `;
}

function getPeriodStart(period) {
  const now = new Date();
  if (period === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }
  if (period === "7d") return now.getTime() - (7 * 24 * 60 * 60 * 1000);
  if (period === "30d") return now.getTime() - (30 * 24 * 60 * 60 * 1000);
  return 0;
}

function getFilteredAttempts(history, filters) {
  const periodStart = getPeriodStart(filters.period);
  const search = String(filters.activity || "").trim().toLocaleLowerCase("fr-FR");

  return history.filter((attempt) => {
    if (periodStart && getAttemptTimestamp(attempt) < periodStart) return false;
    const context = String(attempt?.context || "exploration").trim().toLowerCase();
    if (filters.mode !== "all" && context !== filters.mode) return false;
    if (filters.discipline !== "all" && String(attempt?.discipline_id || "") !== filters.discipline) return false;
    if (search) {
      const haystack = [attempt?.activity_title, attempt?.tool_id, attempt?.discipline_name, attempt?.domain_name]
        .map((value) => String(value || "").toLocaleLowerCase("fr-FR"))
        .join(" ");
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

function renderHistoryList(host, history, filters, expandedAttemptIds, onAttemptAction) {
  const list = host.querySelector("[data-history-list]");
  const count = host.querySelector("[data-history-count]");
  if (!list || !count) return;

  const filtered = getFilteredAttempts(history, filters);
  count.textContent = `${filtered.length} tentative${filtered.length > 1 ? "s" : ""}`;

  if (!filtered.length) {
    list.innerHTML = `
      <div class="dashboard-history-empty">
        <span class="dashboard-material-icon" aria-hidden="true">history</span>
        <strong>Aucune activité dans cette sélection.</strong>
        <span>Modifie les filtres ou attends qu’une activité soit jouée.</span>
      </div>
    `;
    return;
  }

  list.innerHTML = filtered.map((attempt) => renderAttempt(attempt, expandedAttemptIds)).join("");
  list.querySelectorAll("[data-history-toggle-attempt]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = String(button.dataset.historyToggleAttempt || "");
      if (expandedAttemptIds.has(id)) expandedAttemptIds.delete(id);
      else expandedAttemptIds.add(id);
      renderHistoryList(host, history, filters, expandedAttemptIds, onAttemptAction);
    });
  });

  list.querySelectorAll("[data-history-attempt-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = String(button.dataset.historyAttemptAction || "");
      const id = String(button.dataset.historyAttemptActionId || "");
      if (!action || !id || button.disabled) return;
      button.closest("details")?.removeAttribute("open");
      button.disabled = true;
      try {
        await onAttemptAction?.(action, id);
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    });
  });
}

function renderFilterOptions(options, selectedValue) {
  return options.map(([value, label]) => `<option value="${escapeAttr(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
}

export async function mountStudentHistoryView({
  host,
  student,
  subtitle = "",
  loadHistory,
  deleteHistoryAttempt,
  resetAttemptEffects,
  deleteAttemptTotally,
  showToast,
  onBack
} = {}) {
  if (!host || !student) return;

  host.innerHTML = `
    <div class="dashboard-student-profile dashboard-student-history-profile">
      <div class="dashboard-profile-header dashboard-student-history-header">
        <div>
          <div class="dashboard-student-name">${escapeHtml(student.first_name || "")}</div>
          ${subtitle ? `<div class="dashboard-student-meta">${escapeHtml(subtitle)}</div>` : ""}
        </div>
        <button class="dashboard-profile-back" type="button" data-history-back>Retour à la liste</button>
      </div>

      <section class="dashboard-student-history" aria-label="Historique de l’élève">
        <div class="dashboard-history-heading-row">
          <div>
            <h2 class="dashboard-history-title">Historique</h2>
            <div class="dashboard-history-count" data-history-count>Chargement…</div>
          </div>
        </div>

        <div class="dashboard-history-filters" aria-label="Filtres de l’historique">
          <label class="dashboard-history-filter">
            <span>Période</span>
            <select data-history-filter="period">${renderFilterOptions(PERIOD_OPTIONS, "30d")}</select>
          </label>
          <label class="dashboard-history-filter">
            <span>Mode</span>
            <select data-history-filter="mode">${renderFilterOptions(MODE_OPTIONS, "all")}</select>
          </label>
          <label class="dashboard-history-filter">
            <span>Discipline</span>
            <select data-history-filter="discipline"><option value="all">Toutes</option></select>
          </label>
          <label class="dashboard-history-filter dashboard-history-filter--search">
            <span>Activité</span>
            <input type="search" data-history-filter="activity" placeholder="Rechercher une activité" autocomplete="off" />
          </label>
        </div>

        <div class="dashboard-history-list" data-history-list>
          <div class="dashboard-history-loading">
            <span class="dashboard-material-icon" aria-hidden="true">progress_activity</span>
            Chargement de l’historique…
          </div>
        </div>
      </section>
    </div>
  `;

  host.querySelector("[data-history-back]")?.addEventListener("click", () => {
    onBack?.();
  });

  let history = [];
  try {
    const loaded = await loadHistory?.(student.id);
    history = Array.isArray(loaded) ? loaded : [];
  } catch (error) {
    const list = host.querySelector("[data-history-list]");
    const count = host.querySelector("[data-history-count]");
    if (count) count.textContent = "Erreur";
    if (list) {
      list.innerHTML = `<div class="dashboard-history-error">${escapeHtml(error?.message || "Impossible de charger l’historique.")}</div>`;
    }
    return;
  }

  const disciplineSelect = host.querySelector("[data-history-filter='discipline']");
  if (disciplineSelect) {
    const disciplines = [...new Map(
      history
        .filter((attempt) => attempt?.discipline_id && attempt?.discipline_name)
        .map((attempt) => [String(attempt.discipline_id), String(attempt.discipline_name)])
    ).entries()].sort((a, b) => a[1].localeCompare(b[1], "fr"));
    disciplineSelect.innerHTML = `<option value="all">Toutes</option>${disciplines
      .map(([id, name]) => `<option value="${escapeAttr(id)}">${escapeHtml(name)}</option>`)
      .join("")}`;
  }

  const filters = { period: "30d", mode: "all", discipline: "all", activity: "" };
  const expandedAttemptIds = new Set();

  const reloadHistory = async () => {
    const loaded = await loadHistory?.(student.id);
    history = Array.isArray(loaded) ? loaded : [];
  };

  const handleAttemptAction = async (action, attemptId) => {
    const attempt = history.find((item) => String(item?.id || "") === String(attemptId || ""));
    if (!attempt) return;

    const activityTitle = String(attempt.activity_title || "Activité");
    const context = String(attempt.context || "exploration").trim().toLowerCase();
    const isMission = context === "mission";

    if (action === "hide") {
      const confirmed = await openDashboardConfirmDialog({
        title: "Supprimer de l’historique ?",
        message: `La tentative « ${activityTitle} » ne sera plus affichée dans l’historique. Sa progression sera conservée à l’identique.`,
        confirmLabel: "Supprimer de l’historique",
        cancelLabel: "Annuler",
        danger: true
      });
      if (!confirmed) return;

      try {
        await deleteHistoryAttempt?.(attemptId, student.id);
        history = history.filter((item) => String(item?.id || "") !== String(attemptId || ""));
        expandedAttemptIds.delete(String(attemptId || ""));
        rerender();
        showToast?.("Tentative retirée de l’historique. La progression est conservée.");
      } catch (error) {
        console.error("Suppression de la trace impossible.", error);
        showToast?.(error?.message || "Impossible de supprimer cette trace.", { isError: true });
      }
      return;
    }

    if (action === "reset") {
      const message = isMission
        ? `La progression de « ${activityTitle} » sera annulée à partir de cette étape : cette étape et toutes les suivantes redeviendront à faire pour l’élève. Les tentatives resteront visibles dans l’historique avec la mention « Effets réinitialisés ». `
        : `Les effets de « ${activityTitle} » sur Exploration seront annulés. Les statistiques et le niveau adaptatif de cette activité seront recalculés à partir des autres tentatives. La trace restera visible dans l’historique.`;
      const confirmed = await openDashboardConfirmDialog({
        title: "Réinitialiser les effets ?",
        message,
        confirmLabel: "Réinitialiser",
        cancelLabel: "Annuler",
        danger: true
      });
      if (!confirmed) return;

      try {
        await resetAttemptEffects?.(attemptId, student.id);
        await reloadHistory();
        rerender();
        showToast?.(isMission
          ? "Progression Mission réinitialisée à partir de cette étape."
          : "Effets de la tentative réinitialisés et progression recalculée.");
      } catch (error) {
        console.error("Réinitialisation des effets impossible.", error);
        showToast?.(error?.message || "Impossible de réinitialiser cette tentative.", { isError: true });
      }
      return;
    }

    if (action === "delete-total") {
      const message = isMission
        ? `La tentative « ${activityTitle} » sera supprimée définitivement. Cette étape et toutes les suivantes redeviendront à faire, et leurs effets adaptatifs seront annulés. Cette action est irréversible.`
        : `La tentative « ${activityTitle} » sera supprimée définitivement et tous ses effets sur Exploration seront annulés. La progression de cette activité sera recalculée à partir des autres tentatives. Cette action est irréversible.`;
      const confirmed = await openDashboardConfirmDialog({
        title: "Supprimer totalement cette tentative ?",
        message,
        confirmLabel: "Supprimer totalement",
        cancelLabel: "Annuler",
        danger: true
      });
      if (!confirmed) return;

      try {
        await deleteAttemptTotally?.(attemptId, student.id);
        expandedAttemptIds.delete(String(attemptId || ""));
        await reloadHistory();
        rerender();
        showToast?.("Tentative supprimée totalement et effets réinitialisés.");
      } catch (error) {
        console.error("Suppression totale impossible.", error);
        showToast?.(error?.message || "Impossible de supprimer totalement cette tentative.", { isError: true });
      }
    }
  };

  const rerender = () => renderHistoryList(host, history, filters, expandedAttemptIds, handleAttemptAction);

  host.querySelectorAll("[data-history-filter]").forEach((control) => {
    const key = String(control.dataset.historyFilter || "");
    const eventName = control.tagName === "INPUT" ? "input" : "change";
    control.addEventListener(eventName, () => {
      filters[key] = control.value;
      rerender();
    });
  });

  rerender();
}
