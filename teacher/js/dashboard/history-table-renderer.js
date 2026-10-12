import { escapeAttr, escapeHtml } from "./text-utils.js";
import { renderNumberLineHistoryCorrectionSvg, renderPicbilleHistoryCorrectionSvg } from "./number-line-history-preview.js";

const CELL_TYPES = new Set(["text", "long_text", "tokens", "phrase", "image", "audio", "result", "sequence", "marked_words", "calculation_path", "number_line_correction", "picbille_correction", "collection_pair", "collection_complete", "millimetre_preview"]);
const COLUMN_ROLES = new Set(["default", "answer"]);
const COLUMN_ALIGNS = new Set(["left", "center", "right"]);
const SEQUENCE_STATES = new Set(["neutral", "correct", "missed", "wrong"]);
const SEQUENCE_WRITINGS = new Set(["script", "cursive"]);
const HEADER_LEGEND_STATES = new Set(["correct", "missed", "wrong"]);

function getHistoryPayload(snapshot) {
  const history = snapshot?.history;
  return history && typeof history === "object" && !Array.isArray(history) ? history : null;
}

function normalizeColumn(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const key = String(raw.key || "").trim();
  if (!key) return null;
  const role = String(raw.role || "default").trim().toLowerCase();
  const align = String(raw.align || "left").trim().toLowerCase();
  return {
    key,
    label: String(raw.label || "").trim(),
    role: COLUMN_ROLES.has(role) ? role : "default",
    align: COLUMN_ALIGNS.has(align) ? align : "left",
    compact: raw.compact === true,
    fill: raw.fill === true,
    legend: normalizeHeaderLegend(raw.legend)
  };
}

function normalizeHeaderLegend(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const state = String(item.state || "").trim().toLowerCase();
    const label = String(item.label || "").trim();
    if (!HEADER_LEGEND_STATES.has(state) || !label) return null;
    return { state, label };
  }).filter(Boolean);
}

function collectColumns(questions) {
  const ordered = [];
  const byKey = new Map();

  questions.forEach((question) => {
    [question?.question_snapshot, question?.answer_snapshot, question?.correction_snapshot].forEach((snapshot) => {
      const columns = getHistoryPayload(snapshot)?.columns;
      if (!Array.isArray(columns)) return;
      columns.forEach((rawColumn) => {
        const column = normalizeColumn(rawColumn);
        if (!column) return;
        if (!byKey.has(column.key)) {
          byKey.set(column.key, column);
          ordered.push(column);
          return;
        }
        const current = byKey.get(column.key);
        if (!current.label && column.label) current.label = column.label;
        if (current.role === "default" && column.role !== "default") current.role = column.role;
        if (current.align === "left" && column.align !== "left") current.align = column.align;
        if (!current.compact && column.compact) current.compact = true;
        if (!current.fill && column.fill) current.fill = true;
        if ((!current.legend || !current.legend.length) && column.legend?.length) current.legend = column.legend;
      });
    });
  });

  return ordered;
}

function collectCells(question) {
  const cells = {};
  [question?.question_snapshot, question?.answer_snapshot, question?.correction_snapshot].forEach((snapshot) => {
    const stageCells = getHistoryPayload(snapshot)?.cells;
    if (!stageCells || typeof stageCells !== "object" || Array.isArray(stageCells)) return;
    Object.entries(stageCells).forEach(([key, cell]) => {
      if (!key || !cell || typeof cell !== "object" || Array.isArray(cell)) return;
      const type = String(cell.type || "text").trim().toLowerCase();
      if (!CELL_TYPES.has(type)) return;
      cells[key] = cell;
    });
  });
  return cells;
}

function getOutcomeClass(question) {
  const outcome = String(question?.outcome || "unanswered").trim().toLowerCase();
  if (outcome === "correct") return "is-correct";
  if (outcome === "incorrect") return "is-incorrect";
  return "is-unanswered";
}

function renderEmptyCell(cell, fallback = "—") {
  const hasCustomEmpty = cell && Object.prototype.hasOwnProperty.call(cell, "emptyText");
  const value = hasCustomEmpty ? String(cell.emptyText ?? "") : String(fallback ?? "");
  if (!value) return '<span class="dashboard-history-cell-empty dashboard-history-cell-empty--blank" aria-hidden="true"></span>';
  return `<span class="dashboard-history-cell-empty">${escapeHtml(value)}</span>`;
}

function renderTextCell(cell) {
  const value = String(cell?.value ?? "").trim();
  return value
    ? `<span class="dashboard-history-cell-text" title="${escapeAttr(value)}">${escapeHtml(value)}</span>`
    : renderEmptyCell(cell);
}


function renderLongTextCell(cell) {
  const value = String(cell?.value ?? "").trim();
  if (!value) return renderEmptyCell(cell);
  const preview = String(cell?.preview || "Afficher le texte").trim() || "Afficher le texte";
  return `
    <button
      class="dashboard-history-long-text-trigger"
      type="button"
      data-history-text-preview
      data-history-text-value="${escapeAttr(value)}"
      title="Afficher le texte complet"
      aria-label="Afficher le texte complet"
    >
      <span class="dashboard-material-icon" aria-hidden="true">article</span>
      <span class="dashboard-history-long-text-preview">${escapeHtml(preview)}</span>
    </button>
  `;
}

function renderTokensCell(cell) {
  const items = Array.isArray(cell?.items) ? cell.items : [];
  if (!items.length) return renderEmptyCell(cell);
  return `<div class="dashboard-history-cell-tokens">${items.map((item) => {
    const rawText = typeof item === "object" && item !== null ? item.text : item;
    const text = String(rawText ?? "").trim();
    if (!text) return "";
    const isObject = typeof item === "object" && item !== null;
    const toneCandidate = isObject ? String(item.tone || "default").trim().toLowerCase() : "default";
    const tone = ["accent", "muted", "correct", "incorrect", "missed"].includes(toneCandidate) ? toneCandidate : "default";
    const plain = isObject && item.plain === true;
    if (plain) return `<span class="dashboard-history-token-plain">${escapeHtml(text)}</span>`;
    return `<span class="dashboard-history-token is-${escapeAttr(tone)}">${escapeHtml(text)}</span>`;
  }).join("")}</div>`;
}

function renderPhraseCell(cell) {
  const parts = Array.isArray(cell?.parts) ? cell.parts : [];
  if (!parts.length) return renderEmptyCell(cell);
  return `<div class="dashboard-history-cell-phrase">${parts.map((part) => {
    const isObject = typeof part === "object" && part !== null;
    const text = String(isObject ? part.text ?? "" : part ?? "").trim();
    if (!text) return "";
    const kind = isObject ? String(part.kind || "text").trim().toLowerCase() : "text";
    if (kind === "pill") {
      const toneCandidate = String(part.tone || "default").trim().toLowerCase();
      const tone = ["accent", "muted", "correct", "incorrect", "missed"].includes(toneCandidate) ? toneCandidate : "default";
      return `<span class="dashboard-history-token is-${escapeAttr(tone)}">${escapeHtml(text)}</span>`;
    }
    return `<span class="dashboard-history-phrase-text">${escapeHtml(text)}</span>`;
  }).join("")}</div>`;
}

function renderSequenceCell(cell) {
  const items = Array.isArray(cell?.items) ? cell.items : [];
  if (!items.length) return renderEmptyCell(cell);

  return `<div class="dashboard-history-cell-sequence">${items.map((item) => {
    if (!item || typeof item !== "object") return "";
    const text = String(item.text ?? item.value ?? "").trim();
    if (!text) return "";
    const stateCandidate = String(item.state || "neutral").trim().toLowerCase();
    const writingCandidate = String(item.writing || "script").trim().toLowerCase();
    const state = SEQUENCE_STATES.has(stateCandidate) ? stateCandidate : "neutral";
    const writing = SEQUENCE_WRITINGS.has(writingCandidate) ? writingCandidate : "script";
    return `<span class="dashboard-history-sequence-item is-${escapeAttr(state)} is-${escapeAttr(writing)}" data-history-sequence-writing="${escapeAttr(writing)}"><span class="dashboard-history-sequence-glyph">${escapeHtml(text)}</span></span>`;
  }).join("")}</div>`;
}

function renderMarkedWordsCell(cell) {
  const words = Array.isArray(cell?.words) ? cell.words : [];
  if (!words.length) return renderEmptyCell(cell);

  return `<div class="dashboard-history-cell-marked-words">${words.map((word) => {
    if (!word || typeof word !== "object") return "";
    const prefix = String(word.prefix || "").trim();
    const letters = Array.isArray(word.letters) ? word.letters : [];
    const runs = [];

    letters.forEach((letter) => {
      if (!letter || typeof letter !== "object") return;
      const text = String(letter.text ?? letter.value ?? "");
      if (!text) return;
      const candidate = String(letter.state || "neutral").trim().toLowerCase();
      const state = SEQUENCE_STATES.has(candidate) ? candidate : "neutral";
      const previous = runs.at(-1);
      if (previous && previous.state === state) previous.text += text;
      else runs.push({ state, text });
    });

    const wordHtml = runs.map((run) => {
      const cls = run.state === "neutral" ? "" : ` is-${escapeAttr(run.state)}`;
      return `<span class="dashboard-history-marked-run${cls}">${escapeHtml(run.text)}</span>`;
    }).join("");

    return `<span class="dashboard-history-marked-word">${prefix ? `<span class="dashboard-history-marked-prefix">${escapeHtml(prefix)}&nbsp;</span>` : ""}${wordHtml}</span>`;
  }).join('<span class="dashboard-history-marked-separator" aria-hidden="true">·</span>')}</div>`;
}

function normalizeMediaSrc(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(?:https?:)?\/\//i.test(raw) || raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../")) return raw;
  return "";
}

function renderImageCell(cell) {
  const src = normalizeMediaSrc(cell?.src);
  const alt = String(cell?.alt || cell?.label || "Image").trim() || "Image";
  const label = String(cell?.label || "Afficher l’image").trim() || "Afficher l’image";
  if (!src) return renderEmptyCell(cell);
  return `
    <button
      class="dashboard-history-image-trigger"
      type="button"
      data-history-image-preview
      data-history-image-src="${escapeAttr(src)}"
      data-history-image-alt="${escapeAttr(alt)}"
      aria-label="${escapeAttr(label)}"
      title="${escapeAttr(label)}"
    >
      <span class="dashboard-material-icon" aria-hidden="true">image</span>
    </button>
  `;
}

function renderAudioCell(cell) {
  const src = normalizeMediaSrc(cell?.src);
  const label = String(cell?.label || "Écouter").trim() || "Écouter";
  if (!src) return `<span class="dashboard-history-cell-empty">${escapeHtml(label || "—")}</span>`;
  return `
    <div class="dashboard-history-cell-media dashboard-history-cell-media--audio">
      <audio controls preload="none" src="${escapeAttr(src)}" aria-label="${escapeAttr(label)}"></audio>
    </div>
  `;
}

function renderResultCell(cell) {
  if (cell?.value === true) return '<span class="dashboard-history-cell-result is-correct" aria-label="Correct">✓</span>';
  if (cell?.value === false) return '<span class="dashboard-history-cell-result is-incorrect" aria-label="Incorrect">✗</span>';
  return '<span class="dashboard-history-cell-empty">—</span>';
}
function renderCalculationPathStep(step) {
  if (!step || typeof step !== "object") return "";
  const text = String(step.text ?? "").trim();
  if (!text) return "";
  const stateCandidate = String(step.state || "neutral").trim().toLowerCase();
  const state = ["correct", "missed", "wrong"].includes(stateCandidate) ? stateCandidate : "neutral";
  return `<span class="dashboard-history-calc-path-step is-${escapeAttr(state)}">${escapeHtml(text)}</span>`;
}

function renderCalculationPath(cell) {
  const student = Array.isArray(cell?.student) ? cell.student : [];
  const correction = Array.isArray(cell?.correction) ? cell.correction : [];
  if (!student.length && !correction.length) return renderEmptyCell(cell);

  const rawBranchAfter = Number(cell?.branchAfter);
  const branchAfter = Number.isFinite(rawBranchAfter)
    ? Math.max(-1, Math.min(student.length - 1, Math.trunc(rawBranchAfter)))
    : student.length - 1;

  const renderSequence = (steps = []) => steps.map((step, index) => `
    ${index ? '<span class="dashboard-history-calc-path-arrow" aria-hidden="true">→</span>' : ''}
    ${renderCalculationPathStep(step)}
  `).join("");

  const top = `
    <span class="dashboard-history-calc-path-top">
      ${renderSequence(student)}
    </span>`;

  let bottom = "";
  if (correction.length) {
    // Copie invisible du préfixe conservé : elle aligne le coude exactement
    // après le dernier calcul encore viable sans jamais élargir les espaces
    // entre les calculs de la ligne supérieure.
    const preservedPrefix = branchAfter >= 0 ? student.slice(0, branchAfter + 1) : [];
    bottom = `
      <span class="dashboard-history-calc-path-branch-row">
        ${preservedPrefix.length ? `<span class="dashboard-history-calc-path-prefix" aria-hidden="true">${renderSequence(preservedPrefix)}</span>` : ''}
        <span class="dashboard-history-calc-path-elbow" aria-hidden="true"><span class="dashboard-history-calc-path-elbow-arrow">›</span></span>
        <span class="dashboard-history-calc-path-correction">
          ${renderSequence(correction)}
        </span>
      </span>`;
  }

  return `<div class="dashboard-history-calc-path">${top}${bottom}</div>`;
}


function renderNumberLineCorrectionCell(cell) {
  const svg = renderNumberLineHistoryCorrectionSvg(cell);
  return svg || renderEmptyCell(cell);
}

function renderPicbilleCorrectionCell(cell) {
  const svg = renderPicbilleHistoryCorrectionSvg(cell);
  return svg || renderEmptyCell(cell);
}

function renderHistoryCollectionDot(state = "normal", isGroupEnd = false) {
  const styles = [
    "display:inline-block",
    "width:.72em",
    "height:.72em",
    "border-radius:50%",
    "box-sizing:border-box",
    "vertical-align:-.06em",
    isGroupEnd ? "margin-right:.42em" : "margin-right:.11em"
  ];
  if (state === "missing") {
    styles.push("background:transparent", "border:1.5px dashed #55c878");
  } else if (state === "wrong") {
    styles.push("background:#ff6b6b", "border:1px solid #c43d3d");
  } else {
    styles.push("background:#4b82df", "border:1px solid #1f4ec7");
  }
  return `<span aria-hidden="true" style="${styles.join(";")}"></span>`;
}

function renderHistoryCollectionDots(actual, expected = actual) {
  const safeActual = Math.max(0, Math.min(10, Math.trunc(Number(actual) || 0)));
  const safeExpected = Math.max(0, Math.min(10, Math.trunc(Number(expected) || 0)));
  const total = Math.max(safeActual, safeExpected);
  if (!total) return '<span class="dashboard-history-cell-empty">—</span>';
  let html = "";
  for (let index = 0; index < total; index += 1) {
    let state = "normal";
    if (index >= safeActual && index < safeExpected) state = "missing";
    else if (index >= safeExpected && index < safeActual) state = "wrong";
    html += renderHistoryCollectionDot(state, (index + 1) % 5 === 0 && index + 1 < total);
  }
  return `<span style="display:inline-flex;align-items:center;white-space:nowrap">${html}</span>`;
}

function renderCollectionPairCell(cell) {
  const small = Math.max(0, Math.min(10, Math.trunc(Number(cell?.smallCount) || 0)));
  const big = Math.max(0, Math.min(10, Math.trunc(Number(cell?.bigCount) || 0)));
  return `<span style="display:inline-flex;align-items:center;gap:.34em;white-space:nowrap">
    <span>Collections :</span>
    <strong>${small}</strong><span aria-hidden="true">→</span>${renderHistoryCollectionDots(small)}
    <span>et</span>
    <strong>${big}</strong><span aria-hidden="true">→</span>${renderHistoryCollectionDots(big)}
  </span>`;
}

function renderCollectionCompleteCell(cell) {
  const smallPlaced = Math.max(0, Math.min(10, Math.trunc(Number(cell?.smallPlaced) || 0)));
  const bigPlaced = Math.max(0, Math.min(10, Math.trunc(Number(cell?.bigPlaced) || 0)));
  const smallExpected = Math.max(0, Math.min(10, Math.trunc(Number(cell?.smallExpected) || 0)));
  const bigExpected = Math.max(0, Math.min(10, Math.trunc(Number(cell?.bigExpected) || 0)));
  const studentDifference = String(cell?.studentDifference ?? "").trim();
  const expectedDifference = String(cell?.expectedDifference ?? "").trim();
  const differenceCorrect = studentDifference !== "" && studentDifference === expectedDifference;
  const diffHtml = differenceCorrect
    ? `<strong style="color:#55c878">${escapeHtml(studentDifference)}</strong>`
    : `<strong style="color:#ff6b6b">${escapeHtml(studentDifference || "—")}</strong><span aria-hidden="true">→</span><strong style="color:#55c878">${escapeHtml(expectedDifference || "—")}</strong>`;

  return `<span style="display:flex;align-items:center;gap:.36em;white-space:nowrap;min-width:max-content">
    <span>Jetons posés :</span>
    <strong>${smallPlaced}</strong><span aria-hidden="true">→</span>${renderHistoryCollectionDots(smallPlaced, smallExpected)}
    <span>et</span>
    <strong>${bigPlaced}</strong><span aria-hidden="true">→</span>${renderHistoryCollectionDots(bigPlaced, bigExpected)}
    <span style="opacity:.55;margin:0 .14em">·</span>
    <span>Différence :</span>${diffHtml}
  </span>`;
}

function renderCellContent(cell) {
  const type = String(cell?.type || "text").trim().toLowerCase();
  if (type === "long_text") return renderLongTextCell(cell);
  if (type === "tokens") return renderTokensCell(cell);
  if (type === "phrase") return renderPhraseCell(cell);
  if (type === "image") return renderImageCell(cell);
  if (type === "audio") return renderAudioCell(cell);
  if (type === "result") return renderResultCell(cell);
  if (type === "sequence") return renderSequenceCell(cell);
  if (type === "marked_words") return renderMarkedWordsCell(cell);
  if (type === "calculation_path") return renderCalculationPath(cell);
  if (type === "number_line_correction") return renderNumberLineCorrectionCell(cell);
  if (type === "picbille_correction") return renderPicbilleCorrectionCell(cell);
  if (type === "collection_pair") return renderCollectionPairCell(cell);
  if (type === "collection_complete") return renderCollectionCompleteCell(cell);
  if (type === "millimetre_preview") return renderMillimetrePreviewCell(cell);
  return renderTextCell(cell);
}

function buildMillimetreTraceItems(studentLengths = [], expectedLengths = []) {
  const remainingExpectedByValue = new Map();
  expectedLengths.forEach((value) => {
    const mm = Number(value);
    if (!Number.isFinite(mm) || mm <= 0 || mm > 100) return;
    remainingExpectedByValue.set(mm, (remainingExpectedByValue.get(mm) || 0) + 1);
  });

  const items = [];
  studentLengths.forEach((value) => {
    const mm = Number(value);
    if (!Number.isFinite(mm) || mm <= 0 || mm > 100) return;
    const remaining = remainingExpectedByValue.get(mm) || 0;
    if (remaining > 0) {
      remainingExpectedByValue.set(mm, remaining - 1);
      items.push({ value: mm, state: "neutral" });
      return;
    }
    items.push({ value: mm, state: "extra" });
  });

  // Les tracés de l'élève restent dans leur ordre réel. Seuls les segments
  // manquants sont insérés au voisinage des segments de même catégorie.
  const category = (mm) => mm === 100 ? 0 : mm === 10 ? 1 : 2;
  const additions = Array.from({ length: items.length + 1 }, () => []);
  expectedLengths.forEach((value) => {
    const mm = Number(value);
    if (!Number.isFinite(mm) || mm <= 0 || mm > 100) return;
    const remaining = remainingExpectedByValue.get(mm) || 0;
    if (remaining <= 0) return;
    remainingExpectedByValue.set(mm, remaining - 1);

    const kind = category(mm);
    // Après le dernier 100 / 10 / segment d'unités du tracé réel.
    let slot = -1;
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (category(items[index].value) === kind) {
        slot = index + 1;
        break;
      }
    }
    // Si cette catégorie est absente, la placer avant la catégorie inférieure.
    if (slot < 0) {
      const nextCategory = items.findIndex((item) => category(item.value) > kind);
      slot = nextCategory >= 0 ? nextCategory : items.length;
    }
    additions[slot].push({ value: mm, state: "missing" });
  });

  const grouped = [...additions[0]];
  items.forEach((item, index) => {
    grouped.push(item, ...additions[index + 1]);
  });
  return grouped;
}

function renderMillimetreTraceDetails(preview) {
  if (preview?.mode !== "build") return "";
  const studentLengths = Array.isArray(preview?.segments)
    ? preview.segments.map((segment) => Number(segment?.mm)).filter((mm) => Number.isFinite(mm) && mm > 0 && mm <= 100)
    : [];
  const expectedLengths = Array.isArray(preview?.expectedSegments)
    ? preview.expectedSegments.map((segment) => Number(segment)).filter((mm) => Number.isFinite(mm) && mm > 0 && mm <= 100)
    : [];
  const items = buildMillimetreTraceItems(studentLengths, expectedLengths);
  const plainStudent = studentLengths.join(" + ") || "—";
  const plainMissing = items.filter((item) => item.state === "missing").map((item) => String(item.value)).join(" + ");
  const title = plainMissing ? `Tracé → ${plainStudent} · Manquants : ${plainMissing}` : `Tracé → ${plainStudent}`;
  if (!items.length) {
    return `<span class="dashboard-history-mm-trace" title="${escapeAttr(title)}"><span class="dashboard-history-mm-trace-label">Tracé →</span><span class="dashboard-history-mm-trace-values">—</span></span>`;
  }
  const valuesMarkup = items.map((item, index) => {
    const separator = index > 0 ? '<span class="dashboard-history-mm-trace-separator" aria-hidden="true">+</span>' : "";
    const stateClass = item.state === "extra"
      ? ' is-extra'
      : item.state === "missing"
        ? ' is-missing'
        : '';
    return `${separator}<span class="dashboard-history-mm-trace-item${stateClass}">${escapeHtml(String(item.value))}</span>`;
  }).join("");
  return `<span class="dashboard-history-mm-trace" title="${escapeAttr(title)}"><span class="dashboard-history-mm-trace-label">Tracé →</span><span class="dashboard-history-mm-trace-values">${valuesMarkup}</span></span>`;
}

function renderMillimetrePreviewCell(cell) {
  const preview = cell?.preview;
  if (!preview || preview.type !== "millimetre") return renderEmptyCell(cell);
  let serialized = "";
  try { serialized = JSON.stringify(preview); } catch { return renderEmptyCell(cell); }
  const label = String(cell.label || "Voir la mesure");
  const verdict = typeof cell.correct === "boolean"
    ? `<span class="dashboard-history-cell-result ${cell.correct ? "is-correct" : "is-incorrect"}" aria-label="${cell.correct ? "Correct" : "Incorrect"}">${cell.correct ? "✓" : "✗"}</span>` : "";
  const sequence = renderMillimetreTraceDetails(preview);
  return `<span class="dashboard-history-cell-with-preview"><button type="button" class="dashboard-history-image-trigger dashboard-history-mm-trigger" data-history-mm-preview="${escapeAttr(serialized)}" aria-label="${escapeAttr(label)}"><span class="dashboard-material-icon" aria-hidden="true">straighten</span><span>${escapeHtml(label)}</span></button>${sequence}${verdict}</span>`;
}

function renderPointsAlignedHistoryCell(cell) {
  const preview = cell?.preview;
  if (!preview || preview.type !== "points-aligned") return renderTextCell(cell);
  let serialized = "";
  try { serialized = JSON.stringify(preview); } catch { return renderTextCell(cell); }
  const isSelection = preview.view === "selection";
  const label = isSelection ? "Voir la sélection" : "Voir la figure";
  const button = `<button type="button" class="dashboard-history-image-trigger dashboard-history-geometry-trigger" data-history-points-preview="${escapeAttr(serialized)}" aria-label="${escapeAttr(label)}"><span class="dashboard-material-icon" aria-hidden="true">${isSelection ? "ads_click" : "image"}</span><span>${escapeHtml(label)}</span></button>`;
  const text = String(cell.value || "").trim();
  return `<span class="dashboard-history-cell-with-preview dashboard-history-geometry-cell">${button}${text ? `<span class="dashboard-history-geometry-caption" title="${escapeAttr(text)}">${escapeHtml(text)}</span>` : ""}</span>`;
}

function renderMotCacheHistoryCell(cell) {
  const preview = cell?.preview;
  if (!preview || preview.type !== "mot-cache") return renderTextCell(cell);
  let serialized = "";
  try { serialized = JSON.stringify(preview); } catch { return renderTextCell(cell); }
  const isSelection = preview.view === "selection";
  const label = isSelection ? "Voir la sélection" : "Voir la grille";
  const button = `<button type="button" class="dashboard-history-image-trigger dashboard-history-geometry-trigger" data-history-mot-cache-preview="${escapeAttr(serialized)}" aria-label="${escapeAttr(label)}"><span class="dashboard-material-icon" aria-hidden="true">${isSelection ? "ads_click" : "grid_on"}</span><span>${escapeHtml(label)}</span></button>`;
  const text = String(cell.value || "").trim();
  return `<span class="dashboard-history-cell-with-preview dashboard-history-geometry-cell">${button}${text ? `<span class="dashboard-history-geometry-caption" title="${escapeAttr(text)}">${escapeHtml(text)}</span>` : ""}</span>`;
}

function renderHistoryPreviewButton(preview) {
  if (!preview || typeof preview !== "object" || Array.isArray(preview)) return "";
  const type = String(preview.type || "").trim().toLowerCase();
  if (type !== "decimal-representation" && type !== "number-line" && type !== "collection-trace") return "";

  let serialized = "";
  try { serialized = JSON.stringify(preview); } catch { serialized = ""; }
  if (!serialized) return "";

  const dataAttribute = type === "number-line"
    ? `data-history-number-line-preview="${escapeAttr(serialized)}"`
    : type === "collection-trace"
      ? `data-history-collection-trace-preview="${escapeAttr(serialized)}"`
      : `data-history-decimal-preview="${escapeAttr(serialized)}"`;
  const label = type === "number-line"
    ? "Afficher la droite"
    : type === "collection-trace"
      ? "Afficher le tracé de l’élève"
      : "Afficher la représentation";

  return `
    <button
      class="dashboard-history-image-trigger dashboard-history-cell-preview-trigger"
      type="button"
      ${dataAttribute}
      aria-label="${escapeAttr(label)}"
      title="${escapeAttr(label)}"
    >
      <span class="dashboard-material-icon" aria-hidden="true">image</span>
    </button>
  `;
}

function renderCell(cell) {
  if (cell?.preview?.type === "millimetre") return renderMillimetrePreviewCell({ ...cell, label: cell.preview.mode === "build" ? "Voir la construction" : "Voir la mesure" });
  if (cell?.preview?.type === "points-aligned") return renderPointsAlignedHistoryCell(cell);
  if (cell?.preview?.type === "mot-cache") return renderMotCacheHistoryCell(cell);
  const content = renderCellContent(cell);
  const previewButton = renderHistoryPreviewButton(cell?.preview);
  if (!previewButton) return content;
  return `<div class="dashboard-history-cell-with-preview">${content}${previewButton}</div>`;
}

function renderHeaderLegend(legend) {
  const items = Array.isArray(legend) ? legend : [];
  if (!items.length) return "";
  return `<span class="dashboard-history-header-legend">${items.map((item) => `
    <span class="dashboard-history-header-legend-item">
      <span class="dashboard-history-header-legend-swatch is-${escapeAttr(item.state)}" aria-hidden="true"></span>
      <span>${escapeHtml(item.label)}</span>
    </span>
  `).join("")}</span>`;
}

function renderHeaderCell(column) {
  return `<th scope="col" class="is-align-${escapeAttr(column.align)}${column.compact ? " is-compact" : ""}${column.fill ? " is-fill" : ""}">
    <span class="dashboard-history-header-content">
      <span>${escapeHtml(column.label)}</span>
      ${renderHeaderLegend(column.legend)}
    </span>
  </th>`;
}

function renderHeader(columns, showLevel) {
  return `
    <thead>
      <tr>
        <th class="dashboard-history-col-index" scope="col" aria-label="Numéro de question"></th>
        ${showLevel ? '<th class="dashboard-history-col-level" scope="col">Niveau</th>' : ""}
        ${columns.map(renderHeaderCell).join("")}
        <th class="dashboard-history-col-time" scope="col">Temps</th>
      </tr>
    </thead>
  `;
}

function getQuestionLevel(question) {
  const raw = Number(question?.level_presented ?? question?.levelPresented);
  if (!Number.isFinite(raw)) return null;
  const level = Math.trunc(raw);
  return level >= 1 && level <= 5 ? level : null;
}

function renderLevelCell(question) {
  const level = getQuestionLevel(question);
  if (!level) return '<td class="dashboard-history-col-level"><span class="dashboard-history-cell-empty">—</span></td>';
  return `
    <td class="dashboard-history-col-level">
      <span class="dashboard-history-level-badge dashboard-history-level-badge--${level}">Niveau ${level}</span>
    </td>
  `;
}

function renderRow(question, fallbackIndex, columns, formatDuration, showLevel) {
  const cells = collectCells(question);
  const outcomeClass = getOutcomeClass(question);
  const rawQuestionIndex = Number(question?.question_index);
  const questionNumber = Number.isFinite(rawQuestionIndex) ? Math.max(0, Math.trunc(rawQuestionIndex)) + 1 : fallbackIndex + 1;
  const duration = typeof formatDuration === "function" ? formatDuration(question?.duration_ms) : "—";

  return `
    <tr>
      <th class="dashboard-history-col-index" scope="row">${questionNumber}</th>
      ${showLevel ? renderLevelCell(question) : ""}
      ${columns.map((column) => {
        const answerClass = column.role === "answer" ? ` is-answer ${outcomeClass}` : "";
        return `<td class="is-align-${escapeAttr(column.align)}${column.compact ? " is-compact" : ""}${column.fill ? " is-fill" : ""}${answerClass}">${renderCell(cells[column.key])}</td>`;
      }).join("")}
      <td class="dashboard-history-col-time">${escapeHtml(duration)}</td>
    </tr>
  `;
}

export function renderActivityHistoryTable(questions, { formatDuration, showLevel = false } = {}) {
  const safeQuestions = Array.isArray(questions) ? questions : [];
  if (!safeQuestions.length) return "";

  const columns = collectColumns(safeQuestions);
  if (!columns.length) return "";

  const hasFillColumn = columns.some((column) => column.fill === true);

  return `
    <div class="dashboard-history-table-wrap">
      <table class="dashboard-history-table${hasFillColumn ? " has-fill-column" : ""}">
        ${renderHeader(columns, showLevel === true)}
        <tbody>
          ${safeQuestions.map((question, index) => renderRow(question, index, columns, formatDuration, showLevel === true)).join("")}
        </tbody>
      </table>
    </div>
  `;
}
let historySequenceMeasureCanvas = null;

function getHistorySequenceMeasureContext() {
  if (typeof document === "undefined") return null;
  if (!historySequenceMeasureCanvas) historySequenceMeasureCanvas = document.createElement("canvas");
  return historySequenceMeasureCanvas.getContext("2d");
}

function fitHistorySequenceGlyph(glyph) {
  if (!(glyph instanceof HTMLElement)) return;
  const item = glyph.closest(".dashboard-history-sequence-item.is-cursive");
  if (!(item instanceof HTMLElement)) return;

  const text = String(glyph.textContent || "").normalize("NFC");
  if (!text) return;

  const context = getHistorySequenceMeasureContext();
  if (!context) return;
  const style = getComputedStyle(glyph);
  const fontSize = Number.parseFloat(style.fontSize) || 24;
  context.font = style.font || `${style.fontWeight || 400} ${fontSize}px ${style.fontFamily}`;

  const metrics = context.measureText(text);
  const actualAscent = Number(metrics.actualBoundingBoxAscent) || 0;
  const actualDescent = Number(metrics.actualBoundingBoxDescent) || 0;
  const fontAscent = Number(metrics.fontBoundingBoxAscent ?? metrics.emHeightAscent) || (fontSize * .78);
  const fontDescent = Number(metrics.fontBoundingBoxDescent ?? metrics.emHeightDescent) || (fontSize * .22);

  // Centre l'encre réellement dessinée dans la boîte typographique, plutôt que
  // d'utiliser les métriques verticales très généreuses de Belle Allure GS.
  const rawOffset = ((fontDescent - fontAscent) - (actualDescent - actualAscent)) / 2;
  const offset = Math.max(-8, Math.min(8, rawOffset));
  glyph.style.setProperty("--history-sequence-glyph-y", `${offset.toFixed(2)}px`);

  // Le f minuscule Belle Allure cumule une forte hampe et un jambage :
  // une légère compression verticale évite qu'il empiète sur les lignes voisines.
  const lower = text.toLocaleLowerCase("fr-FR");
  const isLowercaseF = lower === "f" && text === lower;
  glyph.style.setProperty("--history-sequence-glyph-scale-y", isLowercaseF ? ".88" : "1");
}

export function fitHistorySequenceGlyphs(root = document) {
  if (!root?.querySelectorAll) return;
  const run = () => {
    root.querySelectorAll(".dashboard-history-sequence-item.is-cursive .dashboard-history-sequence-glyph")
      .forEach(fitHistorySequenceGlyph);
  };

  const schedule = () => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else run();
  };

  if (document?.fonts?.ready) document.fonts.ready.then(schedule).catch(schedule);
  else schedule();
}

