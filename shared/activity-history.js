const SNAPSHOT_JSON_LIMIT = 64 * 1024;
const CONFIG_JSON_LIMIT = 64 * 1024;
const HISTORY_COLUMNS_LIMIT = 16;
const HISTORY_CELLS_LIMIT = 24;
const HISTORY_TOKENS_LIMIT = 240;
const HISTORY_PHRASE_PARTS_LIMIT = 64;
const HISTORY_SEQUENCE_LIMIT = 240;
const HISTORY_MARKED_WORDS_LIMIT = 16;
const HISTORY_MARKED_WORD_LETTERS_LIMIT = 80;
const HISTORY_HEADER_LEGEND_LIMIT = 8;
const HISTORY_CALC_PATH_STEPS_LIMIT = 16;
const HISTORY_DECIMAL_PREVIEW_ITEMS_LIMIT = 160;
const HISTORY_COLLECTION_TRACE_STROKES_LIMIT = 14;
const HISTORY_COLLECTION_TRACE_POINTS_LIMIT = 64;
const HISTORY_COLLECTION_TRACE_LINKS_LIMIT = 20;

const HISTORY_CELL_TYPES = new Set(["text", "long_text", "tokens", "phrase", "image", "audio", "result", "sequence", "marked_words", "calculation_path", "number_line_correction", "picbille_correction", "collection_pair", "collection_complete"]);
const HISTORY_COLUMN_ROLES = new Set(["default", "answer"]);
const HISTORY_COLUMN_ALIGNS = new Set(["left", "center", "right"]);
const HISTORY_TOKEN_TONES = new Set(["default", "accent", "muted", "correct", "incorrect", "missed"]);
const HISTORY_SEQUENCE_STATES = new Set(["neutral", "correct", "missed", "wrong"]);
const HISTORY_SEQUENCE_WRITINGS = new Set(["script", "cursive"]);
const HISTORY_HEADER_LEGEND_STATES = new Set(["correct", "missed", "wrong"]);

export const ACTIVITY_HISTORY_CONTEXTS = Object.freeze(["exploration", "adventure", "mission"]);
export const ACTIVITY_ATTEMPT_STATUSES = Object.freeze(["running", "completed", "interrupted", "abandoned"]);
export const ACTIVITY_QUESTION_OUTCOMES = Object.freeze(["correct", "incorrect", "unanswered"]);

export function normalizeActivityHistoryContext(value, fallback = "exploration") {
  const safe = String(value || "").trim().toLowerCase();
  if (safe === "aventure") return "adventure";
  if (ACTIVITY_HISTORY_CONTEXTS.includes(safe)) return safe;
  const safeFallback = String(fallback || "exploration").trim().toLowerCase();
  return ACTIVITY_HISTORY_CONTEXTS.includes(safeFallback) ? safeFallback : "exploration";
}

export function normalizeActivityAttemptStatus(value, fallback = "interrupted") {
  const safe = String(value || "").trim().toLowerCase();
  if (ACTIVITY_ATTEMPT_STATUSES.includes(safe)) return safe;
  return ACTIVITY_ATTEMPT_STATUSES.includes(fallback) ? fallback : "interrupted";
}

export function normalizeActivityQuestionOutcome(value, fallback = "unanswered") {
  const safe = String(value || "").trim().toLowerCase();
  if (ACTIVITY_QUESTION_OUTCOMES.includes(safe)) return safe;
  return ACTIVITY_QUESTION_OUTCOMES.includes(fallback) ? fallback : "unanswered";
}

export function createActivityAttemptClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  if (!bytes.some(Boolean)) {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

/**
 * Capture un instantané d'historique strictement sémantique fourni par l'outil.
 * Il n'existe volontairement aucun repli DOM : un outil non raccordé n'envoie
 * aucun détail jusqu'à ce que son contrat d'historique ait été défini.
 */
export function captureActivityHistorySnapshot({ runtime = null, container = null, context = null, stage = "question" } = {}) {
  if (!runtime || typeof runtime.getHistorySnapshot !== "function") return {};

  try {
    const customSnapshot = runtime.getHistorySnapshot(String(stage || "question").trim().toLowerCase(), container, context);
    return normalizeHistoryTableSnapshot(customSnapshot);
  } catch (error) {
    console.warn("Instantané d’historique fourni par l’outil indisponible.", error);
    return {};
  }
}

/**
 * Contrat commun :
 * {
 *   history: {
 *     columns: [{ key, label, role?, align? }],
 *     cells: { [key]: { type, ... } }
 *   }
 * }
 *
 * Les colonnes peuvent n'être fournies qu'au stade « question » ; les stades
 * « answer » et « correction » n'envoient alors que leurs cellules.
 */
export function normalizeHistoryTableSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const history = value.history;
  if (!history || typeof history !== "object" || Array.isArray(history)) return {};

  const columns = normalizeHistoryColumns(history.columns);
  const cells = normalizeHistoryCells(history.cells);
  if (!columns.length && !Object.keys(cells).length) return {};

  const snapshot = { history: {} };
  if (columns.length) snapshot.history.columns = columns;
  if (Object.keys(cells).length) snapshot.history.cells = cells;

  const serialized = safeJsonStringify(snapshot);
  return serialized.length <= SNAPSHOT_JSON_LIMIT ? snapshot : {};
}

function normalizeHistoryColumns(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const columns = [];

  for (const rawColumn of value.slice(0, HISTORY_COLUMNS_LIMIT)) {
    if (!rawColumn || typeof rawColumn !== "object" || Array.isArray(rawColumn)) continue;
    const key = cleanShortText(rawColumn.key, 80);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const roleCandidate = String(rawColumn.role || "default").trim().toLowerCase();
    const alignCandidate = String(rawColumn.align || "left").trim().toLowerCase();
    columns.push({
      key,
      label: cleanShortText(rawColumn.label, 160),
      role: HISTORY_COLUMN_ROLES.has(roleCandidate) ? roleCandidate : "default",
      align: HISTORY_COLUMN_ALIGNS.has(alignCandidate) ? alignCandidate : "left",
      compact: rawColumn.compact === true,
      fill: rawColumn.fill === true,
      legend: normalizeHistoryHeaderLegend(rawColumn.legend)
    });
  }

  return columns;
}

function normalizeHistoryCells(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const cells = {};

  Object.entries(value).slice(0, HISTORY_CELLS_LIMIT).forEach(([rawKey, rawCell]) => {
    const key = cleanShortText(rawKey, 80);
    if (!key || !rawCell || typeof rawCell !== "object" || Array.isArray(rawCell)) return;
    const type = String(rawCell.type || "text").trim().toLowerCase();
    if (!HISTORY_CELL_TYPES.has(type)) return;

    const normalized = normalizeHistoryCell(type, rawCell);
    if (normalized) {
      if (Object.prototype.hasOwnProperty.call(rawCell, "emptyText")) {
        normalized.emptyText = cleanShortText(rawCell.emptyText, 80);
      }
      const preview = normalizeHistoryPreview(rawCell.preview);
      if (preview) normalized.preview = preview;
      cells[key] = normalized;
    }
  });

  return cells;
}

function normalizeHistoryCell(type, cell) {
  if (type === "text") {
    return { type, value: cleanMultilineText(cell.value, 5000) };
  }

  if (type === "long_text") {
    return {
      type,
      value: cleanMultilineText(cell.value, 12000),
      preview: cleanShortText(cell.preview, 320)
    };
  }

  if (type === "tokens") {
    const items = (Array.isArray(cell.items) ? cell.items : [])
      .slice(0, HISTORY_TOKENS_LIMIT)
      .map(normalizeHistoryToken)
      .filter(Boolean);
    return { type, items };
  }

  if (type === "phrase") {
    const parts = (Array.isArray(cell.parts) ? cell.parts : [])
      .slice(0, HISTORY_PHRASE_PARTS_LIMIT)
      .map(normalizeHistoryPhrasePart)
      .filter(Boolean);
    return { type, parts };
  }

  if (type === "image") {
    return {
      type,
      src: cleanShortText(cell.src, 4000),
      alt: cleanShortText(cell.alt, 800),
      label: cleanShortText(cell.label, 800)
    };
  }

  if (type === "audio") {
    return {
      type,
      src: cleanShortText(cell.src, 4000),
      label: cleanShortText(cell.label, 800)
    };
  }

  if (type === "result") {
    return {
      type,
      value: cell.value === true ? true : cell.value === false ? false : null
    };
  }

  if (type === "sequence") {
    const items = (Array.isArray(cell.items) ? cell.items : [])
      .slice(0, HISTORY_SEQUENCE_LIMIT)
      .map(normalizeHistorySequenceItem)
      .filter(Boolean);
    return { type, items };
  }

  if (type === "marked_words") {
    const words = (Array.isArray(cell.words) ? cell.words : [])
      .slice(0, HISTORY_MARKED_WORDS_LIMIT)
      .map(normalizeHistoryMarkedWord)
      .filter(Boolean);
    return { type, words };
  }

  if (type === "calculation_path") {
    const student = (Array.isArray(cell.student) ? cell.student : [])
      .slice(0, HISTORY_CALC_PATH_STEPS_LIMIT)
      .map(normalizeHistoryCalculationPathStep)
      .filter(Boolean);
    const correction = (Array.isArray(cell.correction) ? cell.correction : [])
      .slice(0, HISTORY_CALC_PATH_STEPS_LIMIT)
      .map(normalizeHistoryCalculationPathStep)
      .filter(Boolean);
    const rawBranchAfter = Number(cell.branchAfter);
    const branchAfter = Number.isFinite(rawBranchAfter)
      ? Math.max(-1, Math.min(student.length - 1, Math.trunc(rawBranchAfter)))
      : student.length - 1;
    return { type, student, correction, branchAfter };
  }

  if (type === "number_line_correction") {
    const normalizedLine = normalizeNumberLineHistoryPreview({
      type: "number-line",
      lineType: cell.lineType,
      questionType: cell.questionType,
      targetIndex: cell.targetIndex,
      targetValue: cell.targetValue,
      referenceA: cell.referenceA,
      referenceB: cell.referenceB,
      markerIndices: cell.markerIndices,
      tickCount: cell.tickCount
    });
    if (!normalizedLine) return null;
    const studentIndexRaw = Number(cell.studentIndex);
    return {
      ...normalizedLine,
      type,
      studentIndex: Number.isInteger(studentIndexRaw) ? Math.max(-8, Math.min(168, studentIndexRaw)) : null,
      studentValue: cleanShortText(cell.studentValue, 120),
      correct: cell.correct === true
    };
  }

  if (type === "picbille_correction") {
    const questionType = String(cell.questionType || "").trim() === "graduationToNumber"
      ? "graduationToNumber"
      : "numberToGraduation";
    const boxCount = Math.max(2, Math.min(5, Math.trunc(Number(cell.boxCount) || 5)));
    const startValue = Math.max(0, Math.min(100, Math.trunc(Number(cell.startValue) || 1)));
    const maxIndex = (boxCount * 10) - 1;
    const targetIndexRaw = Number(cell.targetIndex);
    const studentIndexRaw = Number(cell.studentIndex);
    return {
      type,
      questionType,
      boxCount,
      startValue,
      targetIndex: Number.isInteger(targetIndexRaw) ? Math.max(0, Math.min(maxIndex, targetIndexRaw)) : null,
      targetValue: cleanShortText(cell.targetValue, 40),
      studentIndex: Number.isInteger(studentIndexRaw) ? Math.max(0, Math.min(maxIndex, studentIndexRaw)) : null,
      studentValue: cleanShortText(cell.studentValue, 80),
      correct: cell.correct === true
    };
  }

  if (type === "collection_pair") {
    return {
      type,
      smallCount: normalizeCollectionCount(cell.smallCount),
      bigCount: normalizeCollectionCount(cell.bigCount)
    };
  }

  if (type === "collection_complete") {
    return {
      type,
      smallPlaced: normalizeCollectionCount(cell.smallPlaced),
      bigPlaced: normalizeCollectionCount(cell.bigPlaced),
      smallExpected: normalizeCollectionCount(cell.smallExpected),
      bigExpected: normalizeCollectionCount(cell.bigExpected),
      studentDifference: cleanShortText(cell.studentDifference, 40),
      expectedDifference: cleanShortText(cell.expectedDifference, 40)
    };
  }

  return null;
}

function normalizeHistoryPreview(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const type = String(value.type || "").trim().toLowerCase();
  if (type === "decimal-representation") return normalizeDecimalHistoryPreview(value);
  if (type === "number-line") return normalizeNumberLineHistoryPreview(value);
  if (type === "collection-trace") return normalizeCollectionTracePreview(value);
  if (type === "millimetre") return normalizeMillimetrePreview(value);
  if (type === "points-aligned") return normalizePointsAlignedHistoryPreview(value);
  if (type === "mot-cache") return normalizeMotCacheHistoryPreview(value);
  return null;
}

function normalizeMotCacheHistoryPreview(value) {
  const rowCount = Math.trunc(Number(value.rowCount));
  const columnCount = Math.trunc(Number(value.columnCount));
  if (!Number.isInteger(rowCount) || rowCount < 1 || rowCount > 5
    || !Number.isInteger(columnCount) || columnCount < 1 || columnCount > 32
    || rowCount * columnCount > 160) return null;
  const total = rowCount * columnCount;
  if (!Array.isArray(value.letters) || value.letters.length !== total) return null;
  const letters = value.letters.map((letter) => cleanShortText(letter, 4));
  const normalizeIndices = (raw) => [...new Set((Array.isArray(raw) ? raw : [])
    .map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < total))];
  const view = value.view === "selection" ? "selection" : "question";
  return {
    type: "mot-cache",
    view,
    rowCount,
    columnCount,
    letters,
    selectedIndices: view === "selection" ? normalizeIndices(value.selectedIndices) : [],
    expectedIndices: view === "selection" ? normalizeIndices(value.expectedIndices) : []
  };
}

function normalizeMillimetrePreview(value) {
  const safeNumber = (v, max) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(Math.max(-max, Math.min(max, n)) * 100) / 100 : 0;
  };
  const segments = (Array.isArray(value.segments) ? value.segments : []).slice(0, 120)
    .filter((s) => s && Number.isFinite(Number(s.mm)) && Number(s.mm) > 0 && Number(s.mm) <= 100)
    .map((s) => ({
      mm: safeNumber(s.mm, 100),
      start: { x: safeNumber(s.start?.x, 12000), y: safeNumber(s.start?.y, 12000) },
      end: { x: safeNumber(s.end?.x, 12000), y: safeNumber(s.end?.y, 12000) }
    }));
  const expectedSegments = (Array.isArray(value.expectedSegments) ? value.expectedSegments : []).slice(0, 120)
    .map((segment) => Number(segment))
    .filter((segment) => Number.isFinite(segment) && segment > 0 && segment <= 100)
    .map((segment) => safeNumber(segment, 100));
  return {
    type: "millimetre",
    mode: value.mode === "build" ? "build" : "read",
    width: Math.max(1, safeNumber(value.width, 12000)),
    height: Math.max(1, safeNumber(value.height, 12000)),
    segments,
    expectedSegments
  };
}

function normalizePointsAlignedHistoryPreview(value) {
  const width = Number(value.width);
  const height = Number(value.height);
  const safeWidth = Number.isFinite(width) ? Math.max(100, Math.min(2400, width)) : 1180;
  const safeHeight = Number.isFinite(height) ? Math.max(100, Math.min(1600, height)) : 650;
  const points = (Array.isArray(value.points) ? value.points : []).slice(0, 48)
    .filter((point) => point && typeof point === "object")
    .map((point) => ({
      id: cleanShortText(point.id, 60),
      x: clampPointsAlignedNumber(point.x, 0, safeWidth),
      y: clampPointsAlignedNumber(point.y, 0, safeHeight),
      label: cleanShortText(point.label, 12),
      selectable: point.selectable !== false
    })).filter((point) => point.id);
  const allowedIds = new Set(points.map((point) => point.id));
  const normalizeIds = (input) => [...new Set((Array.isArray(input) ? input : [])
    .slice(0, 48).map((id) => String(id)).filter((id) => allowedIds.has(id)))];
  // Les traits du runtime peuvent légèrement dépasser du plateau puis être
  // simplement clippés par le SVG. Les ramener brutalement entre 0 et 1
  // déforme leur pente : on conserve donc une petite marge hors cadre.
  const normalizeLines = (lines, limit) => (Array.isArray(lines) ? lines : []).slice(0, limit)
    .filter((line) => line && typeof line === "object")
    .map((line) => ({
      x1: clampPointsAlignedNumber(line.x1, -0.2, 1.2),
      y1: clampPointsAlignedNumber(line.y1, -0.2, 1.2),
      x2: clampPointsAlignedNumber(line.x2, -0.2, 1.2),
      y2: clampPointsAlignedNumber(line.y2, -0.2, 1.2)
    }));
  const view = value.view === "selection" ? "selection" : "question";
  return {
    type: "points-aligned",
    view,
    mode: ["groups", "with-ab", "double-alignment"].includes(value.mode) ? value.mode : "groups",
    width: safeWidth,
    height: safeHeight,
    points,
    selectedIds: view === "selection" ? normalizeIds(value.selectedIds) : [],
    expectedIds: view === "selection" ? normalizeIds(value.expectedIds) : [],
    helperLines: view === "selection" ? normalizeLines(value.helperLines, 10) : [],
    solutionLines: view === "selection" ? normalizeLines(value.solutionLines, 2) : []
  };
}

function clampPointsAlignedNumber(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(Math.max(min, Math.min(max, number)) * 10000) / 10000 : min;
}

function normalizeCollectionCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(10, Math.trunc(number))) : 0;
}

function normalizeHistoryUnit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(Math.max(-0.05, Math.min(1.05, number)) * 10000) / 10000;
}

function normalizeCollectionTraceRect(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    x: normalizeHistoryUnit(value.x),
    y: normalizeHistoryUnit(value.y),
    w: Math.max(0, normalizeHistoryUnit(value.w)),
    h: Math.max(0, normalizeHistoryUnit(value.h))
  };
}

function normalizeCollectionTracePoint(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return { x: normalizeHistoryUnit(value.x), y: normalizeHistoryUnit(value.y) };
}

function normalizeCollectionTraceToken(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    x: normalizeHistoryUnit(value.x),
    y: normalizeHistoryUnit(value.y),
    r: Math.max(0.001, Math.min(0.08, Math.abs(Number(value.r) || 0.02)))
  };
}

function normalizeCollectionTracePreview(value) {
  const charactersRaw = value.characters && typeof value.characters === "object" && !Array.isArray(value.characters)
    ? value.characters
    : {};
  const tokensRaw = value.tokens && typeof value.tokens === "object" && !Array.isArray(value.tokens)
    ? value.tokens
    : {};

  const strokes = (Array.isArray(value.strokes) ? value.strokes : [])
    .slice(0, HISTORY_COLLECTION_TRACE_STROKES_LIMIT)
    .map((stroke) => (Array.isArray(stroke) ? stroke : [])
      .slice(0, HISTORY_COLLECTION_TRACE_POINTS_LIMIT)
      .map(normalizeCollectionTracePoint)
      .filter(Boolean))
    .filter((stroke) => stroke.length > 1);

  const links = (Array.isArray(value.links) ? value.links : [])
    .slice(0, HISTORY_COLLECTION_TRACE_LINKS_LIMIT)
    .map((link) => {
      if (!link || typeof link !== "object" || Array.isArray(link)) return null;
      const a = normalizeCollectionTracePoint(link.a);
      const b = normalizeCollectionTracePoint(link.b);
      return a && b ? { a, b } : null;
    })
    .filter(Boolean);

  const normalizeTokens = (role) => (Array.isArray(tokensRaw[role]) ? tokensRaw[role] : [])
    .slice(0, 10)
    .map(normalizeCollectionTraceToken)
    .filter(Boolean);

  return {
    type: "collection-trace",
    aspect: Math.max(0.8, Math.min(4, Number(value.aspect) || 2.2)),
    smallCount: normalizeCollectionCount(value.smallCount),
    bigCount: normalizeCollectionCount(value.bigCount),
    smallAssetId: cleanShortText(value.smallAssetId, 120),
    bigAssetId: cleanShortText(value.bigAssetId, 120),
    characters: {
      small: normalizeCollectionTraceRect(charactersRaw.small),
      big: normalizeCollectionTraceRect(charactersRaw.big)
    },
    tokens: {
      small: normalizeTokens("small"),
      big: normalizeTokens("big")
    },
    strokes,
    links
  };
}

function normalizeDecimalHistoryPreview(value) {
  const type = "decimal-representation";
  const modeCandidate = String(value.mode || "ordered").trim().toLowerCase();
  const mode = modeCandidate === "pieces" ? "pieces" : "ordered";
  const themeId = cleanShortText(value.themeId, 80);
  if (!themeId) return null;

  const preview = {
    type,
    mode,
    themeId,
    value: Number.isFinite(Number(value.value)) ? Number(value.value) : 0,
    labelMode: cleanShortText(value.labelMode, 80),
    allowLooseTens: value.allowLooseTens === true,
    displayBuild: normalizeDecimalDecomposition(value.displayBuild),
    viewport: normalizeDecimalViewport(value.viewport)
  };

  if (mode === "pieces") {
    preview.items = (Array.isArray(value.items) ? value.items : [])
      .slice(0, HISTORY_DECIMAL_PREVIEW_ITEMS_LIMIT)
      .map(normalizeDecimalPreviewItem)
      .filter(Boolean);
  }

  return preview;
}

function normalizeNumberLineHistoryPreview(value) {
  const lineTypeCandidate = String(value.lineType || "simple").trim().toLowerCase();
  const lineType = lineTypeCandidate === "complete" ? "complete" : "simple";
  const questionTypeCandidate = String(value.questionType || "").trim();
  const questionType = questionTypeCandidate === "graduationToNumber"
    ? "graduationToNumber"
    : "numberToGraduation";
  const tickCount = Math.max(2, Math.min(160, Math.trunc(Number(value.tickCount) || (lineType === "complete" ? 121 : 15))));
  const markerIndices = (Array.isArray(value.markerIndices) ? value.markerIndices : [])
    .slice(0, 2)
    .map((item) => Number(item))
    .filter(Number.isInteger)
    .map((item) => Math.max(-8, Math.min(168, item)));
  const targetIndexRaw = Number(value.targetIndex);
  const targetIndex = Number.isInteger(targetIndexRaw)
    ? Math.max(-8, Math.min(168, targetIndexRaw))
    : null;

  return {
    type: "number-line",
    lineType,
    questionType,
    targetIndex,
    targetValue: Number.isFinite(Number(value.targetValue)) ? Number(value.targetValue) : 0,
    referenceA: Number.isFinite(Number(value.referenceA)) ? Number(value.referenceA) : 0,
    referenceB: Number.isFinite(Number(value.referenceB)) ? Number(value.referenceB) : 0,
    markerIndices,
    tickCount
  };
}

function normalizeDecimalDecomposition(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  ["thousands", "hundreds", "tens", "ones", "looseTens"].forEach((key) => {
    const raw = Number(value[key]);
    if (Number.isFinite(raw)) result[key] = Math.max(0, Math.trunc(raw));
  });
  return result;
}

function normalizeDecimalViewport(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { width: 720, height: 420 };
  const width = Number(value.width);
  const height = Number(value.height);
  return {
    width: Number.isFinite(width) ? Math.max(80, Math.min(2400, width)) : 720,
    height: Number.isFinite(height) ? Math.max(80, Math.min(1600, height)) : 420
  };
}

function normalizeDecimalPreviewItem(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const kind = cleanShortText(value.kind, 40);
  if (!["thousands", "hundreds", "tens", "ones"].includes(kind)) return null;
  const x = Number(value.x);
  const y = Number(value.y);
  const width = Number(value.width);
  const height = Number(value.height);
  const zIndex = Number(value.zIndex);
  return {
    kind,
    x: Number.isFinite(x) ? Math.max(-100, Math.min(2400, x)) : 0,
    y: Number.isFinite(y) ? Math.max(-100, Math.min(1600, y)) : 0,
    width: Number.isFinite(width) ? Math.max(4, Math.min(1200, width)) : 40,
    height: Number.isFinite(height) ? Math.max(4, Math.min(1000, height)) : 40,
    zIndex: Number.isFinite(zIndex) ? Math.trunc(zIndex) : 1
  };
}

function normalizeHistoryCalculationPathStep(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const text = cleanShortText(value.text ?? value.value, 240);
  if (!text) return null;
  const stateCandidate = String(value.state || "neutral").trim().toLowerCase();
  const state = ["neutral", "correct", "missed", "wrong"].includes(stateCandidate) ? stateCandidate : "neutral";
  return { text, state };
}

function normalizeHistoryHeaderLegend(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, HISTORY_HEADER_LEGEND_LIMIT)
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const state = String(item.state || "").trim().toLowerCase();
      const label = cleanShortText(item.label, 80);
      if (!HISTORY_HEADER_LEGEND_STATES.has(state) || !label) return null;
      return { state, label };
    })
    .filter(Boolean);
}

function normalizeHistorySequenceItem(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const text = cleanShortText(value.text ?? value.value, 400);
  if (!text) return null;
  const stateCandidate = String(value.state || "neutral").trim().toLowerCase();
  const writingCandidate = String(value.writing || "script").trim().toLowerCase();
  return {
    text,
    state: HISTORY_SEQUENCE_STATES.has(stateCandidate) ? stateCandidate : "neutral",
    writing: HISTORY_SEQUENCE_WRITINGS.has(writingCandidate) ? writingCandidate : "script"
  };
}

function normalizeHistoryMarkedWord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prefix = cleanShortText(value.prefix, 400);
  const letters = (Array.isArray(value.letters) ? value.letters : [])
    .slice(0, HISTORY_MARKED_WORD_LETTERS_LIMIT)
    .map((letter) => {
      if (!letter || typeof letter !== "object" || Array.isArray(letter)) return null;
      const text = cleanShortText(letter.text ?? letter.value, 40);
      if (!text) return null;
      const stateCandidate = String(letter.state || "neutral").trim().toLowerCase();
      return {
        text,
        state:HISTORY_SEQUENCE_STATES.has(stateCandidate) ? stateCandidate : "neutral"
      };
    })
    .filter(Boolean);
  if (!prefix && !letters.length) return null;
  return { prefix, letters };
}

function normalizeHistoryPhrasePart(value) {
  if (["string", "number", "boolean"].includes(typeof value)) {
    const text = cleanShortText(value, 400);
    return text ? { kind:"text", text } : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const text = cleanShortText(value.text ?? value.value, 400);
  if (!text) return null;
  const kind = String(value.kind || "text").trim().toLowerCase() === "pill" ? "pill" : "text";
  if (kind === "pill") {
    const toneCandidate = String(value.tone || "default").trim().toLowerCase();
    return {
      kind,
      text,
      tone: HISTORY_TOKEN_TONES.has(toneCandidate) ? toneCandidate : "default"
    };
  }
  return { kind, text };
}

function normalizeHistoryToken(value) {
  if (["string", "number", "boolean"].includes(typeof value)) {
    const text = cleanShortText(value, 400);
    return text ? { text, tone: "default" } : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const text = cleanShortText(value.text ?? value.value, 400);
  if (!text) return null;
  const toneCandidate = String(value.tone || "default").trim().toLowerCase();
  return {
    text,
    tone: HISTORY_TOKEN_TONES.has(toneCandidate) ? toneCandidate : "default"
  };
}

export function normalizeHistoryJson(value, fallback = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return cloneJson(fallback);
  }
  return cloneJson(value);
}

export function createActivityHistoryConfigSnapshot(value) {
  const safe = normalizeHistoryJson(value, {});
  const serialized = safeJsonStringify(safe);
  if (serialized.length <= CONFIG_JSON_LIMIT) return safe;

  return {
    truncated: true,
    originalLength: serialized.length,
    topLevelKeys: Object.keys(safe).slice(0, 120),
    summary: summarizeTopLevelValues(safe)
  };
}

function cleanShortText(value, maxLength) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(0, Number(maxLength) || 0));
}

function cleanMultilineText(value, maxLength) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, Math.max(0, Number(maxLength) || 0));
}

function summarizeTopLevelValues(value) {
  const summary = {};
  Object.entries(value).slice(0, 120).forEach(([key, item]) => {
    if (item == null || ["string", "number", "boolean"].includes(typeof item)) {
      summary[key] = typeof item === "string" ? item.slice(0, 500) : item;
      return;
    }
    if (Array.isArray(item)) {
      summary[key] = { type: "array", length: item.length };
      return;
    }
    if (typeof item === "object") {
      summary[key] = { type: "object", keys: Object.keys(item).slice(0, 40) };
    }
  });
  return summary;
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value) || "";
  } catch {
    return "";
  }
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}
