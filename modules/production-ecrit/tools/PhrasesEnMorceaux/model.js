export function normalizeSettings(settings) {
  const base = {
    selectedStudentIds: [],
    selectionOrder: [],
    studentConfigs: {},
    projectionEnabled: false,
    commonConfig: defaultPhraseConfig(),
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
    nextStudentConfigs[id] = normalizePhraseConfig(cfg);
  }

  base.selectedStudentIds = selected;
  base.selectionOrder = selected;
  base.studentConfigs = nextStudentConfigs;
  base.commonConfig = normalizePhraseConfig(base.commonConfig);
  base.projectionEnabled = normalizeProjectionEnabled(base.projectionEnabled, base.commonConfig);

  return base;
}

export function getRunProfileForContext(settings, ctx = {}) {
  const safeSettings = normalizeSettings(settings);
  const runMode = String(ctx?.runMode || "student").trim();

  if (runMode === "projected-teacher") {
    if (!safeSettings.projectionEnabled) {
      return {
        requiresStudent: false,
        allowedStudentIds: [],
        blockingMessage: "Le mode projection n’est pas activé pour cet outil."
      };
    }

    const commonPool = getCommonPhrasePool(safeSettings);
    return {
      requiresStudent: false,
      allowedStudentIds: [],
      blockingMessage: commonPool.length
        ? ""
        : "Aucune phrase à afficher n’est définie pour le mode projection."
    };
  }

  return {
    requiresStudent: true,
    allowedStudentIds: getSelectedStudentIds(safeSettings),
    blockingMessage: ""
  };
}

export function getPhrasePoolForContext(settings, ctx = {}) {
  const safeSettings = normalizeSettings(settings);
  const runMode = String(ctx?.runMode || "student").trim();

  if (runMode === "projected-teacher") {
    return safeSettings.projectionEnabled ? getCommonPhrasePool(safeSettings) : [];
  }

  return getPhrasePoolForStudent(safeSettings, ctx?.student);
}

export function getPhraseCountForContext(settings, ctx = {}, fallback = 1) {
  const pool = getPhrasePoolForContext(settings, ctx);
  return Math.max(1, Array.isArray(pool) ? pool.length : 0) || fallback;
}

export function getPhraseTimeForContext(settings, ctx = {}, fallback = 5) {
  const safeSettings = normalizeSettings(settings);
  const runMode = String(ctx?.runMode || "student").trim();

  if (runMode === "projected-teacher") {
    return getPhraseTimeFromConfig(safeSettings.commonConfig, fallback);
  }

  return getPhraseTimeForStudent(safeSettings, ctx?.student, fallback);
}

export function getCommonPhrasePool(settings) {
  const safeSettings = normalizeSettings(settings);
  return getPhrasePoolFromConfig(safeSettings.commonConfig);
}

export function getPhrasePoolForStudent(settings, student) {
  const safeSettings = normalizeSettings(settings);
  const studentId = String(student?.id || "").trim();
  if (!studentId) {
    return [];
  }

  return getPhrasePoolFromConfig(safeSettings.studentConfigs?.[studentId]);
}

export function getPhraseCountForStudent(settings, student, fallback = 1) {
  const pool = getPhrasePoolForStudent(settings, student);
  return Math.max(1, Array.isArray(pool) ? pool.length : 0) || fallback;
}

export function getPhraseTimeForStudent(settings, student, fallback = 5) {
  const safeSettings = normalizeSettings(settings);
  const studentId = String(student?.id || "").trim();
  if (!studentId) {
    return fallback;
  }

  return getPhraseTimeFromConfig(safeSettings.studentConfigs?.[studentId], fallback);
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

export function defaultPhraseConfig() {
  return {
    phraseTimeSec: 5,
    infinitePhraseTime: false,
    phrasesText: "",
    phrases: []
  };
}

function normalizePhraseConfig(cfg) {
  const fallback = defaultPhraseConfig();
  const phraseTimeSec = clampInt(cfg?.phraseTimeSec, 1, 300, fallback.phraseTimeSec);
  const infinitePhraseTime = cfg?.infinitePhraseTime === true;
  const phrasesText = String(cfg?.phrasesText || "");
  const phrases = Array.isArray(cfg?.phrases) && cfg.phrases.length
    ? normalizePhraseList(cfg.phrases)
    : parsePhrasesFromTextarea(phrasesText);

  return {
    phraseTimeSec,
    infinitePhraseTime,
    phrasesText,
    phrases
  };
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

function getPhrasePoolFromConfig(config) {
  const safeConfig = normalizePhraseConfig(config);

  if (Array.isArray(safeConfig.phrases) && safeConfig.phrases.length) {
    return safeConfig.phrases;
  }

  if (typeof safeConfig.phrasesText === "string" && safeConfig.phrasesText.trim()) {
    return parsePhrasesFromTextarea(safeConfig.phrasesText);
  }

  return [];
}

function getPhraseTimeFromConfig(config, fallback = 5) {
  const safeConfig = normalizePhraseConfig(config);
  if (safeConfig.infinitePhraseTime) {
    return Number.POSITIVE_INFINITY;
  }

  return clampInt(safeConfig.phraseTimeSec, 1, 300, fallback);
}

function getSelectedStudentIds(settings) {
  return Array.isArray(settings?.selectionOrder) && settings.selectionOrder.length
    ? settings.selectionOrder.map((id) => String(id || "").trim()).filter(Boolean)
    : Array.isArray(settings?.selectedStudentIds)
      ? settings.selectedStudentIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
}

function normalizeProjectionEnabled(flag, commonConfig) {
  if (flag === true || flag === false) {
    return flag;
  }

  const safeConfig = normalizePhraseConfig(commonConfig);
  return getPhrasePoolFromConfig(safeConfig).length > 0;
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
