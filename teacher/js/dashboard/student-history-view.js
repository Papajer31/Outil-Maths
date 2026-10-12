import { escapeAttr, escapeHtml } from "./text-utils.js";
import { openDashboardConfirmDialog } from "./confirm-dialog.js";
import { renderActivityHistoryTable } from "./history-table-renderer.js";
import { createDecimalHistoryPreviewUrl } from "./decimal-history-preview.js";
import { createNumberLineHistoryPreviewUrl } from "./number-line-history-preview.js";
import { createCollectionTracePreviewUrl } from "./collection-history-preview.js";
import { createMillimetreHistoryPreviewUrl, getMillimetreHistoryDialogSize } from "./millimetre-history-preview.js";
import { createPointsAlignedHistoryPreviewUrl } from "./points-aligned-history-preview.js";
import { createMotCacheHistoryPreviewUrl, getMotCacheHistoryDialogSize } from "./mot-cache-history-preview.js";

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

function renderAttemptDetails(attempt) {
  const questions = Array.isArray(attempt?.questions) ? attempt.questions : [];
  const showLevel = attempt?.metadata_json?.catalogAdaptive === true;
  const table = renderActivityHistoryTable(questions, { formatDuration, showLevel });

  if (!table) {
    return `
      <div class="dashboard-history-attempt-details">
        <div class="dashboard-history-unavailable">
          Historique détaillé non disponible pour cet outil.
        </div>
      </div>
    `;
  }

  return `
    <div class="dashboard-history-attempt-details">
      ${table}
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

function renderActivityTypeBadge(attempt) {
  const type = String(attempt?.activity_type || "tool").trim().toLowerCase();
  if (type === "quiz") return '<span class="dashboard-history-activity-type">Quiz</span>';
  if (type === "series") return '<span class="dashboard-history-activity-type">Série</span>';
  return "";
}

function groupMissionRuns(history = []) {
  const groups = new Map();
  const output = [];
  (Array.isArray(history) ? history : []).forEach((attempt) => {
    const context = String(attempt?.context || "").toLowerCase();
    const runId = String(attempt?.mission_run_id || "").trim();
    if (context !== "mission" || !runId) { output.push(attempt); return; }
    if (!groups.has(runId)) {
      const group = {
        _kind:"mission-run",
        id:`mission-run:${runId}`,
        mission_run_id:runId,
        context:"mission",
        started_at:attempt.started_at,
        played_at:attempt.played_at,
        activity_title:String(attempt?.metadata_json?.configName || "Mission"),
        activities:[],
        questions_count:0, correct_count:0, wrong_count:0, duration_ms:0
      };
      groups.set(runId, group);
      output.push(group);
    }
    const group = groups.get(runId);
    group.activities.push(attempt);
    group.questions_count += Math.max(0, Number(attempt?.questions_count) || 0);
    group.correct_count += Math.max(0, Number(attempt?.correct_count) || 0);
    group.wrong_count += Math.max(0, Number(attempt?.wrong_count) || 0);
    group.duration_ms += Math.max(0, Number(attempt?.duration_ms) || 0);
    if (getAttemptTimestamp(attempt) < getAttemptTimestamp(group)) {
      group.started_at = attempt.started_at;
      group.played_at = attempt.played_at;
    }
  });
  return output;
}

function renderMissionRun(group, expandedAttemptIds) {
  const id = String(group?.id || "");
  const expanded = expandedAttemptIds.has(id);
  const total = Math.max(0, Number(group?.questions_count) || 0);
  const correct = Math.max(0, Number(group?.correct_count) || 0);
  const activities = Array.isArray(group?.activities) ? group.activities : [];
  return `
    <article class="dashboard-history-attempt dashboard-history-mission-run ${expanded ? "is-expanded" : ""}" data-history-attempt-id="${escapeAttr(id)}">
      <div class="dashboard-history-attempt-row">
        <button class="dashboard-history-attempt-main" type="button" data-history-toggle-attempt="${escapeAttr(id)}" aria-expanded="${expanded ? "true" : "false"}">
          <div class="dashboard-history-attempt-copy">
            <div class="dashboard-history-attempt-topline">
              <span class="dashboard-history-attempt-date">${escapeHtml(formatAttemptDate(group))}</span>
              <span class="dashboard-history-mode dashboard-history-mode--mission">Mission</span>
            </div>
            <div class="dashboard-history-attempt-title">${escapeHtml(group?.activity_title || "Mission")}</div>
            <div class="dashboard-history-attempt-path">${activities.length} activité${activities.length > 1 ? "s" : ""}</div>
          </div>
          <div class="dashboard-history-attempt-summary">
            <span class="dashboard-history-score">${total ? `${correct}/${total}` : "—"}</span>
            <span class="dashboard-history-duration">${escapeHtml(formatDuration(group?.duration_ms))}</span>
            <span class="dashboard-material-icon dashboard-history-chevron" aria-hidden="true">expand_more</span>
          </div>
        </button>
      </div>
      ${expanded ? `<div class="dashboard-history-attempt-details dashboard-history-mission-activities">${activities.map((attempt) => renderAttempt(attempt, expandedAttemptIds)).join("")}</div>` : ""}
    </article>`;
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
            <div class="dashboard-history-attempt-title">${escapeHtml(attempt?.activity_title || "Activité")}${renderActivityTypeBadge(attempt)}</div>
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
  const displayEntries = groupMissionRuns(filtered);
  count.textContent = `${displayEntries.length} tentative${displayEntries.length > 1 ? "s" : ""}`;

  if (!displayEntries.length) {
    list.innerHTML = `
      <div class="dashboard-history-empty">
        <span class="dashboard-material-icon" aria-hidden="true">history</span>
        <strong>Aucune activité dans cette sélection.</strong>
        <span>Modifie les filtres ou attends qu’une activité soit jouée.</span>
      </div>
    `;
    return;
  }

  list.innerHTML = displayEntries.map((entry) => entry?._kind === "mission-run"
    ? renderMissionRun(entry, expandedAttemptIds)
    : renderAttempt(entry, expandedAttemptIds)).join("");
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
  resetHistory,
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
          <button class="btn danger dashboard-btn-with-icon" type="button" data-history-clear-all disabled>
            <span class="dashboard-material-icon" aria-hidden="true">delete_sweep</span>
            <span>Réinitialiser l’historique</span>
          </button>
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

    <dialog class="dashboard-history-image-dialog" data-history-image-dialog aria-label="Aperçu de l’image">
      <img data-history-image-dialog-image alt="" />
    </dialog>
  `;

  host.querySelector("[data-history-back]")?.addEventListener("click", () => {
    onBack?.();
  });

  const imageDialog = host.querySelector("[data-history-image-dialog]");
  const imageDialogImage = imageDialog?.querySelector("[data-history-image-dialog-image]");
  let currentDecimalPreviewUrl = "";
  let currentNumberLinePreviewUrl = "";
  let currentCollectionTracePreviewUrl = "";
  let currentMillimetrePreviewUrl = "";
  let currentPointsAlignedPreviewUrl = "";
  let currentMotCachePreviewUrl = "";
  const releaseGeneratedPreviewUrls = () => {
    if (currentDecimalPreviewUrl) URL.revokeObjectURL(currentDecimalPreviewUrl);
    if (currentNumberLinePreviewUrl) URL.revokeObjectURL(currentNumberLinePreviewUrl);
    if (currentCollectionTracePreviewUrl) URL.revokeObjectURL(currentCollectionTracePreviewUrl);
    if (currentMillimetrePreviewUrl) URL.revokeObjectURL(currentMillimetrePreviewUrl);
    if (currentPointsAlignedPreviewUrl) URL.revokeObjectURL(currentPointsAlignedPreviewUrl);
    if (currentMotCachePreviewUrl) URL.revokeObjectURL(currentMotCachePreviewUrl);
    currentDecimalPreviewUrl = "";
    currentNumberLinePreviewUrl = "";
    currentCollectionTracePreviewUrl = "";
    currentMillimetrePreviewUrl = "";
    currentPointsAlignedPreviewUrl = "";
    currentMotCachePreviewUrl = "";
  };
  const resetHistoryDialogPresentation = () => {
    if (!(imageDialog instanceof HTMLDialogElement)) return;
    imageDialog.style.removeProperty("background");
    imageDialog.style.removeProperty("width");
    imageDialog.style.removeProperty("height");
    imageDialog.style.removeProperty("padding");
    imageDialog.setAttribute("aria-label", "Aperçu de l’image");
  };
  const closeImageDialog = () => {
    if (!(imageDialog instanceof HTMLDialogElement)) return;
    if (imageDialog.open) imageDialog.close();
  };

  imageDialog?.addEventListener("click", (event) => {
    if (event.target === imageDialog) closeImageDialog();
  });
  imageDialog?.addEventListener("close", () => {
    if (!(imageDialogImage instanceof HTMLImageElement)) return;
    imageDialogImage.removeAttribute("src");
    imageDialogImage.alt = "";
    releaseGeneratedPreviewUrls();
    resetHistoryDialogPresentation();
  });

  host.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const imageTrigger = target?.closest("[data-history-image-preview]");
    const decimalTrigger = target?.closest("[data-history-decimal-preview]");
    const numberLineTrigger = target?.closest("[data-history-number-line-preview]");
    const collectionTraceTrigger = target?.closest("[data-history-collection-trace-preview]");
    const millimetreTrigger = target?.closest("[data-history-mm-preview]");
    const pointsAlignedTrigger = target?.closest("[data-history-points-preview]");
    const motCacheTrigger = target?.closest("[data-history-mot-cache-preview]");
    const trigger = motCacheTrigger || pointsAlignedTrigger || millimetreTrigger || collectionTraceTrigger || numberLineTrigger || decimalTrigger || imageTrigger;
    if (!(trigger instanceof HTMLElement) || !host.contains(trigger)) return;
    if (!(imageDialog instanceof HTMLDialogElement) || !(imageDialogImage instanceof HTMLImageElement)) return;

    event.preventDefault();
    let src = "";
    let alt = "Image proposée";

    resetHistoryDialogPresentation();
    if (motCacheTrigger) {
      let preview = null;
      try { preview = JSON.parse(String(motCacheTrigger.dataset.historyMotCachePreview || "")); } catch { preview = null; }
      releaseGeneratedPreviewUrls();
      try {
        currentMotCachePreviewUrl = createMotCacheHistoryPreviewUrl(preview);
      } catch (error) {
        console.warn("Aperçu Mot caché indisponible.", error);
        currentMotCachePreviewUrl = "";
      }
      src = currentMotCachePreviewUrl;
      alt = preview?.view === "selection" ? "Sélection de l’élève et correction" : "Grille proposée à l’élève";
      const dialogSize = getMotCacheHistoryDialogSize(preview, {
        maxWidth: window.innerWidth - 40, maxHeight: window.innerHeight - 40
      });
      imageDialog.style.width = `${dialogSize.width}px`;
      imageDialog.style.height = `${dialogSize.height}px`;
      imageDialog.style.padding = "0";
    } else if (pointsAlignedTrigger) {
      let preview = null;
      try { preview = JSON.parse(String(pointsAlignedTrigger.dataset.historyPointsPreview || "")); } catch { preview = null; }
      releaseGeneratedPreviewUrls();
      try {
        currentPointsAlignedPreviewUrl = createPointsAlignedHistoryPreviewUrl(preview);
      } catch (error) {
        console.warn("Aperçu Points alignés indisponible.", error);
        currentPointsAlignedPreviewUrl = "";
      }
      src = currentPointsAlignedPreviewUrl;
      alt = preview?.view === "selection" ? "Sélection de l’élève et correction" : "Figure présentée à l’élève";
      imageDialog.style.width = "min(940px, calc(100vw - 40px))";
      imageDialog.style.height = "min(540px, calc(100vh - 40px))";
      imageDialog.style.padding = "10px";
    } else if (millimetreTrigger) {
      let preview = null;
      try { preview = JSON.parse(String(millimetreTrigger.dataset.historyMmPreview || "")); } catch { preview = null; }
      releaseGeneratedPreviewUrls();
      try {
        currentMillimetrePreviewUrl = await createMillimetreHistoryPreviewUrl(preview);
      } catch (error) {
        console.warn("Aperçu M. Millimètre indisponible.", error);
        currentMillimetrePreviewUrl = "";
      }
      src = currentMillimetrePreviewUrl;
      alt = preview?.mode === "build" ? "Construction de l’élève" : "Mesure de l’énoncé";
      const dialogSize = getMillimetreHistoryDialogSize(preview, {
        maxWidth: window.innerWidth - 40, maxHeight: window.innerHeight - 40
      });
      imageDialog.style.width = `${dialogSize.width}px`;
      imageDialog.style.height = `${dialogSize.height}px`;
      imageDialog.style.padding = "0";
    } else if (collectionTraceTrigger) {
      let preview = null;
      try { preview = JSON.parse(String(collectionTraceTrigger.dataset.historyCollectionTracePreview || "")); } catch { preview = null; }
      releaseGeneratedPreviewUrls();
      try {
        currentCollectionTracePreviewUrl = await createCollectionTracePreviewUrl(preview);
      } catch (error) {
        console.warn("Aperçu du tracé de l’élève indisponible.", error);
        currentCollectionTracePreviewUrl = "";
      }
      src = currentCollectionTracePreviewUrl;
      alt = "Tracé de l’élève sur les collections";
      imageDialog.style.background = "#0c0e13";
      imageDialog.style.width = "min(720px, calc(100vw - 40px))";
      imageDialog.style.height = "min(440px, calc(100vh - 40px))";
      imageDialog.style.padding = "10px";
    } else if (numberLineTrigger) {
      let preview = null;
      try { preview = JSON.parse(String(numberLineTrigger.dataset.historyNumberLinePreview || "")); } catch { preview = null; }
      releaseGeneratedPreviewUrls();
      try {
        currentNumberLinePreviewUrl = await createNumberLineHistoryPreviewUrl(preview);
      } catch (error) {
        console.warn("Aperçu de droite numérique indisponible.", error);
        currentNumberLinePreviewUrl = "";
      }
      src = currentNumberLinePreviewUrl;
      alt = "Droite numérique de la question";
    } else if (decimalTrigger) {
      let preview = null;
      try { preview = JSON.parse(String(decimalTrigger.dataset.historyDecimalPreview || "")); } catch { preview = null; }
      releaseGeneratedPreviewUrls();
      try {
        currentDecimalPreviewUrl = await createDecimalHistoryPreviewUrl(preview);
      } catch (error) {
        console.warn("Aperçu de représentation indisponible.", error);
        currentDecimalPreviewUrl = "";
      }
      src = currentDecimalPreviewUrl;
      alt = "Représentation de la question";
    } else {
      src = String(imageTrigger?.dataset.historyImageSrc || "").trim();
      alt = String(imageTrigger?.dataset.historyImageAlt || "Image proposée").trim() || "Image proposée";
    }

    if (!src) return;
    imageDialogImage.src = src;
    imageDialogImage.alt = alt;
    if (!imageDialog.open) imageDialog.showModal();
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
  const clearAllButton = host.querySelector("[data-history-clear-all]");

  const updateClearAllButton = () => {
    if (clearAllButton) clearAllButton.disabled = !history.length;
  };

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
        ? `La Mission contenant « ${activityTitle} » redeviendra à faire pour l’élève. Les tentatives de ce passage resteront visibles dans l’historique avec la mention « Effets réinitialisés ». `
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
          ? "Mission réinitialisée pour l’élève."
          : "Effets de la tentative réinitialisés et progression recalculée.");
      } catch (error) {
        console.error("Réinitialisation des effets impossible.", error);
        showToast?.(error?.message || "Impossible de réinitialiser cette tentative.", { isError: true });
      }
      return;
    }

    if (action === "delete-total") {
      const message = isMission
        ? `Le passage de Mission contenant « ${activityTitle} » sera supprimé définitivement de l’historique et la Mission redeviendra à faire. Cette action est irréversible.`
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

  const rerender = () => {
    updateClearAllButton();
    renderHistoryList(host, history, filters, expandedAttemptIds, handleAttemptAction);
  };

  clearAllButton?.addEventListener("click", async () => {
    const attemptCount = history.length;
    if (!attemptCount || clearAllButton.disabled) return;
    const confirmed = await openDashboardConfirmDialog({
      title: "Réinitialiser tout l’historique ?",
      message:`Toutes les tentatives de ${String(student.first_name || "cet élève")}, y compris celles qui ne sont pas visibles dans cette liste, seront supprimées définitivement. Les progrès Exploration, Aventure et Missions seront aussi remis à zéro. Cette action est irréversible.`,
      confirmLabel: "Réinitialiser l’historique",
      cancelLabel: "Annuler",
      danger: true
    });
    if (!confirmed) return;

    clearAllButton.disabled = true;
    try {
      if (typeof resetHistory !== "function") throw new Error("La réinitialisation de l’historique n’est pas disponible.");
      const clearedCount = await resetHistory(student.id);
      history = [];
      expandedAttemptIds.clear();
      rerender();
      const returnedCount = Number(clearedCount);
      const count = Number.isFinite(returnedCount) ? Math.max(0, Math.trunc(returnedCount)) : attemptCount;
      showToast?.(`${count} tentative${count > 1 ? "s ont été supprimées" : " a été supprimée"} et les progrès associés ont été remis à zéro.`);
    } catch (error) {
      console.error("Réinitialisation complète de l’historique impossible.", error);
      showToast?.(error?.message || "Impossible de réinitialiser l’historique.", { isError:true });
      updateClearAllButton();
    }
  });

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
