export function normalizeSettings(settings) {
  const base = {
    mode: "students",
    selectedStudentIds: [],
    selectionOrder: [],
    studentConfigs: {},
    ...(settings ?? {})
  };

  const selectedFromOrder = Array.isArray(base.selectionOrder)
    ? base.selectionOrder.map((id) => String(id || "").trim()).filter(Boolean)
    : [];

  const selectedFromIds = Array.isArray(base.selectedStudentIds)
    ? base.selectedStudentIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];

  const selected = selectedFromOrder.length ? selectedFromOrder : selectedFromIds;

  const nextStudentConfigs = {};
  const rawStudentConfigs = base.studentConfigs && typeof base.studentConfigs === "object"
    ? base.studentConfigs
    : {};

  for (const [studentId, cfg] of Object.entries(rawStudentConfigs)) {
    const id = String(studentId || "").trim();
    if (!id) continue;

    const phraseTimeSec = clampInt(cfg?.phraseTimeSec, 1, 300, 5);
    const phrasesText = String(cfg?.phrasesText || "");
    const phrases = Array.isArray(cfg?.phrases) && cfg.phrases.length
      ? normalizePhraseList(cfg.phrases)
      : parsePhrasesFromTextarea(phrasesText);

    nextStudentConfigs[id] = {
      phraseTimeSec,
      phrasesText,
      phrases
    };
  }

  base.mode = base.mode === "board" ? "board" : "students";
  base.selectedStudentIds = selected;
  base.selectionOrder = selected;
  base.studentConfigs = nextStudentConfigs;

  return base;
}

function normalizePhraseList(list) {
  if (!Array.isArray(list)) return [];

  return list
    .map((phrase) => ({
      segments: Array.isArray(phrase?.segments)
        ? phrase.segments
            .map((s) => formatSegmentWithSilent(
              String(s || "").replace(/\s+/g, " ").trim()
            ))
            .filter((s) => s.length > 0)
        : []
    }))
    .filter((phrase) => phrase.segments.length > 0);
}

export function getPhrasePoolForStudent(settings, student) {
  if (settings.mode !== "students") {
    return [];
  }

  const studentId = String(student?.id || "").trim();
  if (!studentId) {
    return [];
  }

  const config = settings.studentConfigs?.[studentId];
  if (!config) {
    return [];
  }

  if (Array.isArray(config.phrases) && config.phrases.length) {
    return config.phrases;
  }

  if (typeof config.phrasesText === "string" && config.phrasesText.trim()) {
    return parsePhrasesFromTextarea(config.phrasesText);
  }

  return [];
}

export function getPhraseCountForStudent(settings, student, fallback = 1) {
  const pool = getPhrasePoolForStudent(settings, student);
  return Math.max(1, Array.isArray(pool) ? pool.length : 0) || fallback;
}

export function getPhraseTimeForStudent(settings, student, fallback = 5) {
  if (settings.mode !== "students") {
    return fallback;
  }

  const studentId = String(student?.id || "").trim();
  if (!studentId) {
    return fallback;
  }

  const value = settings.studentConfigs?.[studentId]?.phraseTimeSec;
  return clampInt(value, 1, 300, fallback);
}

export function parsePhrasesFromTextarea(raw) {
  return String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      segments: line
        .split("/")
        .map((s) => formatSegmentWithSilent(s.trim()))
        .filter(Boolean)
    }))
    .filter((p) => p.segments.length > 0);
}

function clampInt(value, min, max, fallback) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function formatSegmentWithSilent(text){
  return String(text || "")
    .replace(/\[([^\]]+)\]/g, '<span class="pem-silent">$1</span>');
}