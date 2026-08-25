export const WRITING_MODES = Object.freeze({
  SCRIPT:"script",
  CURSIVE:"cursive",
  BOTH:"both"
});

const DEFAULT_ROWS = Object.freeze([
  Object.freeze({
    target:"a",
    distractors:Object.freeze(["o", "i", "r", "l", "u", "e", "s", "m", "à", "â", "A"])
  })
]);
const DEFAULT_TOTAL_COUNT = 20;
const DEFAULT_TARGET_COUNT = 5;
const MIN_TOTAL_COUNT = 2;
const MAX_TOTAL_COUNT = 60;
const MAX_TARGET_COUNT = 30;

export function getDefaultSettings() {
  const rows = DEFAULT_ROWS.map((row) => ({
    target:row.target,
    distractors:[...row.distractors],
    distractorsRaw:row.distractors.join(";")
  }));
  return {
    rows,
    // Alias conservés pour relire sans rupture les réglages de la V1.
    target:rows[0].target,
    distractors:[...rows[0].distractors],
    distractorsRaw:rows[0].distractorsRaw,
    totalCount:DEFAULT_TOTAL_COUNT,
    targetCount:DEFAULT_TARGET_COUNT,
    acceptDiacritics:true,
    writingMode:WRITING_MODES.SCRIPT
  };
}

export function normalizeSettings(settings = {}) {
  const fallback = getDefaultSettings();
  const rows = normalizeRows(resolveRowsSource(settings));
  const totalCount = clampInt(settings?.totalCount, MIN_TOTAL_COUNT, MAX_TOTAL_COUNT, fallback.totalCount);
  const targetCount = clampInt(settings?.targetCount, 1, Math.min(MAX_TARGET_COUNT, totalCount), fallback.targetCount);
  const acceptDiacritics = settings?.acceptDiacritics !== false;
  const writingMode = normalizeWritingMode(settings?.writingMode);
  const firstRow = rows[0] || { target:"", distractors:[], distractorsRaw:"" };

  return {
    rows,
    // Alias de compatibilité : les anciens consommateurs éventuels voient la première ligne.
    target:firstRow.target,
    distractors:[...firstRow.distractors],
    distractorsRaw:firstRow.distractorsRaw,
    totalCount,
    targetCount,
    acceptDiacritics,
    writingMode
  };
}

export function normalizeDistractors(value) {
  const source = Array.isArray(value)
    ? value
    : String(value ?? "").split(/[;\r\n]+/);
  const seen = new Set();
  const result = [];

  for (const item of source) {
    const text = normalizeDisplayText(item);
    if (!text) continue;
    const key = text.normalize("NFC");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

export function compareText(value, target, { acceptDiacritics = true } = {}) {
  return makeComparisonKey(value, acceptDiacritics) === makeComparisonKey(target, acceptDiacritics);
}

export function getCandidatePools(row = {}, settings = {}) {
  const target = normalizeDisplayText(row?.target);
  const distractors = normalizeDistractors(
    row?.distractorsRaw != null ? row.distractorsRaw : row?.distractors
  );
  const targetVariants = uniqueDisplayTexts([
    target,
    ...distractors.filter((value) => compareText(value, target, settings))
  ]);
  const distractorPool = distractors.filter((value) => !compareText(value, target, settings));
  return { targetVariants, distractorPool };
}

export function validateSettings(settings = {}) {
  const cfg = normalizeSettings(settings);
  const errors = [];

  if (!cfg.rows.length) {
    errors.push("Ajoute au moins une possibilité.");
  }

  cfg.rows.forEach((row, index) => {
    const line = `Ligne ${index + 1}`;
    if (!row.target) {
      errors.push(`${line} : indique ce qu’il faut trouver.`);
      return;
    }
    if (!row.distractors.length) {
      errors.push(`${line} : ajoute au moins un distracteur.`);
      return;
    }
    const { distractorPool } = getCandidatePools(row, cfg);
    if (!distractorPool.length) {
      errors.push(`${line} : ajoute au moins un distracteur différent de la cible.`);
    }
  });

  if (cfg.targetCount >= cfg.totalCount) {
    errors.push("Le nombre d’occurrences doit être inférieur au nombre total d’éléments.");
  }

  return { valid:errors.length === 0, errors, settings:cfg };
}

export function pickQuestion(settings = {}, { avoidKey = "", avoidRowKey = "" } = {}) {
  const validation = validateSettings(settings);
  if (!validation.valid) return null;
  const cfg = validation.settings;
  const candidates = cfg.rows.map((row, index) => ({ row, index, rowKey:buildRowKey(row, cfg) }));
  const filtered = candidates.length > 1
    ? candidates.filter((candidate) => candidate.rowKey !== avoidRowKey)
    : candidates;
  const rowCandidates = filtered.length ? filtered : candidates;
  const selected = rowCandidates[Math.floor(Math.random() * rowCandidates.length)];
  const { targetVariants, distractorPool } = getCandidatePools(selected.row, cfg);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const targetTexts = drawDistributed(targetVariants, cfg.targetCount);
    const distractorTexts = drawDistributed(distractorPool, cfg.totalCount - cfg.targetCount);
    const items = shuffle([
      ...targetTexts.map((text) => makeItem(text, true, cfg.writingMode)),
      ...distractorTexts.map((text) => makeItem(text, false, cfg.writingMode))
    ]).map((item, index) => ({ ...item, id:`item-${index + 1}` }));

    const question = {
      target:selected.row.target,
      rowIndex:selected.index,
      rowKey:selected.rowKey,
      prompt:`Clique sur toutes les occurrences de « ${selected.row.target} ».` ,
      items,
      expectedIds:items.filter((item) => item.isTarget).map((item) => item.id),
      totalCount:cfg.totalCount,
      targetCount:cfg.targetCount,
      acceptDiacritics:cfg.acceptDiacritics,
      writingMode:cfg.writingMode,
      maxItemLength:items.reduce((max, item) => Math.max(max, [...item.text].length), 0)
    };
    question.key = buildQuestionKey(question);
    if (!avoidKey || question.key !== avoidKey || attempt === 11) return question;
  }

  return null;
}

export function questionKey(question) {
  return String(question?.key || buildQuestionKey(question));
}

export function evaluateSelection(question, selectedIds = []) {
  const availableIds = new Set((question?.items || []).map((item) => String(item.id)));
  const selected = uniqueStrings(selectedIds).filter((id) => availableIds.has(id));
  const expected = uniqueStrings(question?.expectedIds || []).filter((id) => availableIds.has(id));
  const selectedSet = new Set(selected);
  const expectedSet = new Set(expected);
  const isCorrect = selected.length === expected.length && selected.every((id) => expectedSet.has(id));

  return {
    isCorrect,
    selectedIds:selected,
    expectedIds:expected,
    correctSelectedIds:selected.filter((id) => expectedSet.has(id)),
    incorrectSelectedIds:selected.filter((id) => !expectedSet.has(id)),
    missedIds:expected.filter((id) => !selectedSet.has(id))
  };
}

function resolveRowsSource(settings = {}) {
  if (Array.isArray(settings?.rows)) return settings.rows;

  const hasLegacyValues = settings?.target != null
    || settings?.distractors != null
    || settings?.distractorsRaw != null;
  if (hasLegacyValues) {
    return [{
      target:settings?.target,
      distractors:settings?.distractors,
      distractorsRaw:settings?.distractorsRaw
    }];
  }

  return getDefaultSettings().rows;
}

function normalizeRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const target = normalizeDisplayText(row?.target);
    const distractors = normalizeDistractors(
      row?.distractorsRaw != null ? row.distractorsRaw : row?.distractors
    );
    return {
      target,
      distractors,
      distractorsRaw:distractors.join(";")
    };
  });
}

function makeItem(text, isTarget, writingMode) {
  return {
    text,
    isTarget:isTarget === true,
    writing:writingMode === WRITING_MODES.BOTH
      ? (Math.random() < 0.5 ? WRITING_MODES.SCRIPT : WRITING_MODES.CURSIVE)
      : writingMode
  };
}

function makeComparisonKey(value, acceptDiacritics) {
  let text = normalizeDisplayText(value).toLocaleLowerCase("fr-FR");
  if (acceptDiacritics) {
    text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  return text.normalize("NFC");
}

function normalizeDisplayText(value) {
  return String(value ?? "").trim().normalize("NFC");
}

function normalizeWritingMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === WRITING_MODES.CURSIVE || mode === WRITING_MODES.BOTH) return mode;
  return WRITING_MODES.SCRIPT;
}

function drawDistributed(pool, count) {
  const source = uniqueDisplayTexts(pool);
  const wanted = Math.max(0, Math.trunc(Number(count)) || 0);
  if (!source.length || wanted === 0) return [];
  const result = [];

  while (result.length < wanted) {
    const cycle = shuffle([...source]);
    for (const value of cycle) {
      result.push(value);
      if (result.length >= wanted) break;
    }
  }
  return result;
}

function uniqueDisplayTexts(values) {
  const seen = new Set();
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    const text = normalizeDisplayText(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "")).filter(Boolean))];
}

function buildRowKey(row = {}, settings = {}) {
  const normalizedTarget = makeComparisonKey(row?.target, settings?.acceptDiacritics === true);
  const distractors = normalizeDistractors(row?.distractorsRaw != null ? row.distractorsRaw : row?.distractors);
  return `${normalizedTarget}\u0001${distractors.join("\u0002")}`;
}

function buildQuestionKey(question = {}) {
  return `${question.rowKey || ""}\u0003${(question.items || [])
    .map((item) => `${item.text}\u0001${item.writing}\u0001${item.isTarget ? 1 : 0}`)
    .join("\u0002")}`;
}

function shuffle(values) {
  const items = [...values];
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

function clampInt(value, min, max, fallback) {
  const parsed = Math.round(Number(value));
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, safe));
}
