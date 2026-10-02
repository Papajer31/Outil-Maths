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
  return { label: "Sans réponse", className: "is-unanswered", icon: "remove_circle" };
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

  if (Number(snapshot.schemaVersion || snapshot.version || 0) >= 2) {
    const lines = [];
    const prompt = normalizeSnapshotText(snapshot.prompt, 1500);
    const meta = normalizeSnapshotText(snapshot.meta, 300);
    const value = normalizeSnapshotText(snapshot.value, 1200);
    if (prompt) lines.push(prompt);
    if (meta) lines.push(meta);
    if (value) lines.push(value);
    if (Array.isArray(snapshot.facts)) {
      snapshot.facts.forEach((fact) => {
        const label = normalizeSnapshotText(fact?.label, 240);
        const factValue = normalizeSnapshotText(fact?.value, 700);
        if (factValue) lines.push(label ? `${label} : ${factValue}` : factValue);
      });
    }
    if (Array.isArray(snapshot.values)) {
      snapshot.values.forEach((item) => {
        const text = normalizeSnapshotText(item, 700);
        if (text) lines.push(text);
      });
    }
    if (lines.length) return uniqueStrings(lines);
  }

  const ignored = new Set([
    "version", "schemaVersion", "source", "stage", "kind", "text", "fields", "choices", "media", "canvases", "truncated", "originalLength", "topLevelKeys"
  ]);
  const lines = [];
  for (const [key, value] of Object.entries(snapshot)) {
    if (ignored.has(key) || value == null) continue;
    if (["string", "number", "boolean"].includes(typeof value)) {
      const text = normalizeSnapshotText(value, 500);
      if (text) lines.push(`${humanizeHistoryKey(key)} : ${text}`);
    } else if (Array.isArray(value) && value.every((item) => ["string", "number", "boolean"].includes(typeof item))) {
      const text = normalizeSnapshotText(value.join(" · "), 700);
      if (text) lines.push(`${humanizeHistoryKey(key)} : ${text}`);
    }
  }
  return uniqueStrings(lines);
}

function humanizeHistoryKey(key) {
  const labels = {
    responseType:"Type de réponse", attemptCount:"Essais", hintCount:"Indices", timedOut:"Temps écoulé",
    audioPlayCount:"Écoutes audio", maskedTextViewCount:"Affichages du texte masqué",
    maskedTextVisibleDurationMs:"Durée d’affichage du texte masqué"
  };
  return labels[key] || String(key || "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
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

function renderOccurrenceSelectionSnapshot(snapshot, stage) {
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  if (!items.length) return "";

  const selectedIds = new Set((Array.isArray(snapshot?.selectedIds) ? snapshot.selectedIds : []).map(String));
  const expectedIds = new Set((Array.isArray(snapshot?.expectedIds) ? snapshot.expectedIds : []).map(String));
  const prompt = normalizeSnapshotText(snapshot?.prompt, 600);
  const target = normalizeSnapshotText(snapshot?.target, 120);

  const tokens = items.map((item) => {
    const id = String(item?.id || "");
    const selected = selectedIds.has(id);
    const expected = stage === "correction" ? (expectedIds.has(id) || item?.expected === true) : item?.expected === true;
    const classes = ["dashboard-history-occurrence-token"];

    if (stage === "answer") {
      if (selected) classes.push("is-selected");
      else classes.push("is-muted");
    } else if (stage === "correction") {
      if (expected && selected) classes.push("is-correct");
      else if (expected) classes.push("is-missed");
      else if (selected) classes.push("is-incorrect");
      else classes.push("is-muted");
    }

    return `<span class="${classes.join(" ")}">${escapeHtml(item?.text || "")}</span>`;
  }).join("");

  let intro = "";
  if (stage === "question") {
    intro = prompt ? `<div class="dashboard-history-occurrence-prompt">${escapeHtml(prompt)}</div>` : "";
  } else if (stage === "answer") {
    intro = `<div class="dashboard-history-occurrence-summary">${selectedIds.size} sélection${selectedIds.size > 1 ? "s" : ""}</div>`;
  } else if (stage === "correction") {
    intro = target ? `<div class="dashboard-history-occurrence-summary">Occurrences attendues de « ${escapeHtml(target)} »</div>` : "";
  }

  const legend = stage === "correction" ? `
    <div class="dashboard-history-occurrence-legend">
      <span><i class="is-correct"></i>Correcte</span>
      <span><i class="is-missed"></i>Oubliée</span>
      <span><i class="is-incorrect"></i>Incorrecte</span>
    </div>
  ` : "";

  return `${intro}<div class="dashboard-history-occurrence-sequence">${tokens}</div>${legend}`;
}

function renderNumberWordsSnapshot(snapshot, stage, outcome) {
  const value = normalizeSnapshotText(snapshot?.value, 1200);
  const prompt = normalizeSnapshotText(snapshot?.prompt, 700);
  const directionLabel = normalizeSnapshotText(snapshot?.directionLabel, 120);
  const valueLabel = normalizeSnapshotText(snapshot?.valueLabel, 160);
  const outcomeName = String(outcome?.className || "");

  if (stage === "question") {
    return `
      ${prompt ? `<div class="dashboard-history-visual-prompt">${escapeHtml(prompt)}</div>` : ""}
      <div class="dashboard-history-visual-toolbar">
        ${directionLabel ? `<span class="dashboard-history-visual-badge">${escapeHtml(directionLabel)}</span>` : ""}
      </div>
      <div class="dashboard-history-value-card is-source">
        ${valueLabel ? `<div class="dashboard-history-value-card-label">${escapeHtml(valueLabel)}</div>` : ""}
        <div class="dashboard-history-value-card-value">${escapeHtml(value || "—")}</div>
      </div>
    `;
  }

  let statusClass = "is-student";
  let statusIcon = "";
  let statusText = "";
  if (stage === "correction") {
    statusClass = "is-expected";
    statusIcon = "check_circle";
    statusText = "Attendu";
  } else if (outcomeName === "is-correct") {
    statusClass = "is-correct";
    statusIcon = "check_circle";
    statusText = "Correct";
  } else if (outcomeName === "is-incorrect") {
    statusClass = "is-incorrect";
    statusIcon = "cancel";
    statusText = "Réponse donnée";
  } else {
    statusClass = "is-unanswered";
    statusIcon = "remove_circle";
    statusText = "Sans réponse";
  }

  return `
    <div class="dashboard-history-value-card ${statusClass}">
      <div class="dashboard-history-value-card-head">
        <div class="dashboard-history-value-card-label">${escapeHtml(valueLabel || statusText)}</div>
        ${statusIcon ? `<span class="dashboard-history-value-status ${statusClass}"><span class="dashboard-material-icon" aria-hidden="true">${statusIcon}</span>${escapeHtml(statusText)}</span>` : ""}
      </div>
      <div class="dashboard-history-value-card-value">${escapeHtml(value || "—")}</div>
    </div>
  `;
}

function normalizeHistoryComparableText(value) {
  return normalizeSnapshotText(value, 1600).toLocaleLowerCase("fr-FR");
}

function renderSommeDifferenceSnapshot(snapshot, stage, outcome, correctionSnapshot = null) {
  const prompt = normalizeSnapshotText(snapshot?.prompt, 700);

  if (stage === "question") {
    const facts = Array.isArray(snapshot?.facts) ? snapshot.facts : [];
    return `
      ${prompt ? `<div class="dashboard-history-visual-prompt">${escapeHtml(prompt)}</div>` : ""}
      ${facts.length ? `
        <div class="dashboard-history-operation-facts">
          ${facts.map((fact) => {
            const label = normalizeSnapshotText(fact?.label, 180);
            const value = normalizeSnapshotText(fact?.value, 300);
            return `
              <div class="dashboard-history-operation-fact">
                ${label ? `<div class="dashboard-history-operation-fact-label">${escapeHtml(label)}</div>` : ""}
                <div class="dashboard-history-operation-fact-value">${escapeHtml(value || "—")}</div>
              </div>
            `;
          }).join("")}
        </div>
      ` : ""}
    `;
  }

  const values = snapshot?.kind === "choices"
    ? (Array.isArray(snapshot?.values) ? snapshot.values : [])
    : [snapshot?.value];
  const safeValues = uniqueStrings(values);
  const expectedValues = new Set(
    (correctionSnapshot?.kind === "choices"
      ? (Array.isArray(correctionSnapshot?.values) ? correctionSnapshot.values : [])
      : [correctionSnapshot?.value])
      .map(normalizeHistoryComparableText)
      .filter(Boolean)
  );

  if (!safeValues.length) {
    return `<div class="dashboard-history-operation-empty">Aucune réponse</div>`;
  }

  if (snapshot?.kind === "choices") {
    return `
      <div class="dashboard-history-operation-choices">
        ${safeValues.map((value) => {
          let className = "is-student";
          if (stage === "correction") className = "is-expected";
          else if (expectedValues.has(normalizeHistoryComparableText(value))) className = "is-correct";
          else if (outcome?.className === "is-incorrect") className = "is-incorrect";
          else if (outcome?.className === "is-correct") className = "is-correct";
          else if (outcome?.className === "is-unanswered") className = "is-unanswered";
          return `<span class="dashboard-history-operation-choice ${className}">${escapeHtml(value)}</span>`;
        }).join("")}
      </div>
    `;
  }

  let statusClass = "is-student";
  let statusIcon = "";
  let statusText = "";
  if (stage === "correction") {
    statusClass = "is-expected";
    statusIcon = "check_circle";
    statusText = "Attendu";
  } else if (outcome?.className === "is-correct") {
    statusClass = "is-correct";
    statusIcon = "check_circle";
    statusText = "Correct";
  } else if (outcome?.className === "is-incorrect") {
    statusClass = "is-incorrect";
    statusIcon = "cancel";
    statusText = "Réponse donnée";
  } else {
    statusClass = "is-unanswered";
    statusIcon = "remove_circle";
    statusText = "Sans réponse";
  }

  return `
    <div class="dashboard-history-operation-value ${statusClass}">
      <div class="dashboard-history-operation-expression">${escapeHtml(safeValues[0])}</div>
      ${statusIcon ? `<span class="dashboard-history-value-status ${statusClass}"><span class="dashboard-material-icon" aria-hidden="true">${statusIcon}</span>${escapeHtml(statusText)}</span>` : ""}
    </div>
  `;
}

function renderSpecialSnapshotContent(snapshot, stage, outcome, { questionSnapshot = null, correctionSnapshot = null } = {}) {
  if (snapshot?.kind === "occurrence-selection") {
    return renderOccurrenceSelectionSnapshot(snapshot, stage);
  }
  if (snapshot?.kind === "number-words") {
    return renderNumberWordsSnapshot(snapshot, stage, outcome);
  }
  if (questionSnapshot?.kind === "operation") {
    return renderSommeDifferenceSnapshot(snapshot, stage, outcome, correctionSnapshot);
  }
  return "";
}

function renderSnapshotBlock(title, snapshot, stage, emptyText, { outcome = null, questionSnapshot = null, correctionSnapshot = null } = {}) {
  const specialContent = renderSpecialSnapshotContent(snapshot, stage, outcome, { questionSnapshot, correctionSnapshot });
  const lines = specialContent ? [] : getSnapshotStageSummary(snapshot, stage);
  return `
    <div class="dashboard-history-snapshot dashboard-history-snapshot--${escapeAttr(stage)}${specialContent ? " dashboard-history-snapshot--special" : ""}">
      <div class="dashboard-history-snapshot-title">${escapeHtml(title)}</div>
      <div class="dashboard-history-snapshot-content">
        ${specialContent || (lines.length
          ? lines.map((line) => `<div class="dashboard-history-snapshot-line">${escapeHtml(line)}</div>`).join("")
          : `<div class="dashboard-history-snapshot-empty">${escapeHtml(emptyText)}</div>`)}
      </div>
    </div>
  `;
}

function getComparableSnapshotValue(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return "";
  return normalizeSnapshotText(snapshot.value, 1600).toLocaleLowerCase("fr-FR");
}

function canFoldRedundantCorrection(question, outcome) {
  if (outcome?.className !== "is-correct") return false;
  const answer = question?.answer_snapshot;
  const correction = question?.correction_snapshot;

  if (answer?.kind === "number-words" && correction?.kind === "number-words") {
    const answerValue = getComparableSnapshotValue(answer);
    const correctionValue = getComparableSnapshotValue(correction);
    return Boolean(answerValue && correctionValue && answerValue === correctionValue);
  }

  if (question?.question_snapshot?.kind === "operation") {
    const answerValues = answer?.kind === "choices"
      ? uniqueStrings(Array.isArray(answer?.values) ? answer.values : []).map(normalizeHistoryComparableText).sort()
      : [normalizeHistoryComparableText(answer?.value)].filter(Boolean);
    const correctionValues = correction?.kind === "choices"
      ? uniqueStrings(Array.isArray(correction?.values) ? correction.values : []).map(normalizeHistoryComparableText).sort()
      : [normalizeHistoryComparableText(correction?.value)].filter(Boolean);
    return Boolean(
      answerValues.length
      && answerValues.length === correctionValues.length
      && answerValues.every((value, index) => value === correctionValues[index])
    );
  }

  return false;
}

function renderQuestion(question, index) {
  const outcome = getQuestionOutcomeMeta(question);
  const foldCorrection = canFoldRedundantCorrection(question, outcome);
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
      <div class="dashboard-history-question-grid${foldCorrection ? " dashboard-history-question-grid--two" : ""}">
        ${renderSnapshotBlock("Question", question?.question_snapshot, "question", "Question non enregistrée.", {
          outcome,
          questionSnapshot: question?.question_snapshot,
          correctionSnapshot: question?.correction_snapshot
        })}
        ${renderSnapshotBlock(foldCorrection ? "Réponse correcte" : "Réponse de l’élève", question?.answer_snapshot, "answer", "Aucune réponse lisible dans l’instantané.", {
          outcome,
          questionSnapshot: question?.question_snapshot,
          correctionSnapshot: question?.correction_snapshot
        })}
        ${foldCorrection ? "" : renderSnapshotBlock("Correction", question?.correction_snapshot, "correction", "Correction non enregistrée.", {
          outcome,
          questionSnapshot: question?.question_snapshot,
          correctionSnapshot: question?.correction_snapshot
        })}
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
