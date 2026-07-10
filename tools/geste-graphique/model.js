export const DIGIT_VALUES = Object.freeze(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);

export const MODEL_VISIBILITY = Object.freeze({
  VISIBLE: "visible",
  TRACE: "trace",
  HIDDEN: "hidden"
});

export const MODEL_VISIBILITY_VALUES = Object.freeze(Object.values(MODEL_VISIBILITY));

export const MODEL_VISIBILITY_LABELS = Object.freeze({
  [MODEL_VISIBILITY.VISIBLE]: "Visible",
  [MODEL_VISIBILITY.TRACE]: "Tracé",
  [MODEL_VISIBILITY.HIDDEN]: "Caché"
});

export const TOLERANCE_LEVELS = Object.freeze({
  LARGE: "large",
  MEDIUM: "medium",
  LOW: "low"
});

export const TOLERANCE_LEVEL_VALUES = Object.freeze(Object.values(TOLERANCE_LEVELS));

export const TOLERANCE_LEVEL_LABELS = Object.freeze({
  [TOLERANCE_LEVELS.LARGE]: "Grande tolérance",
  [TOLERANCE_LEVELS.MEDIUM]: "Tolérance moyenne",
  [TOLERANCE_LEVELS.LOW]: "Faible tolérance"
});

export const BINARY_CHOICE = Object.freeze({
  WITH: "with",
  WITHOUT: "without"
});

export const BINARY_CHOICE_VALUES = Object.freeze(Object.values(BINARY_CHOICE));

export const BINARY_CHOICE_LABELS = Object.freeze({
  [BINARY_CHOICE.WITH]: "Avec",
  [BINARY_CHOICE.WITHOUT]: "Sans"
});

export const DEFAULT_SETTINGS = Object.freeze({
  digits: Object.freeze(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]),
  animation: BINARY_CHOICE.WITH,
  startPoint: BINARY_CHOICE.WITH,
  toleranceLevel: TOLERANCE_LEVELS.MEDIUM,
  modelVisibility: MODEL_VISIBILITY.TRACE
});

const DIGIT_DEFINITIONS = Object.freeze({
  "0": Object.freeze({
    digit: "0",
    viewBox: "0 0 210 297",
    strokes: Object.freeze([
      Object.freeze({ d: "M 156.8 76 C 148.8 57.2 136.7 37.2 115.8 31.1 99.4 26.2 81.7 33.1 71 46 52.4 68.6 45.3 98.2 41.6 126.6 c -3.9 29.8 -0.5 60.7 11.5 88.3 8.5 19.6 24.5 37.7 46.6 41.4 15.3 2.6 30.9 -3.2 40.9 -14.9 17.7 -20.7 26.5 -47.8 29.2 -74.5 3.1 -30.8 -2.5 -62.1 -13.1 -91" })
    ])
  }),
  "1": Object.freeze({
    digit: "1",
    viewBox: "0 0 210 297",
    strokes: Object.freeze([
      Object.freeze({ d: "m 39 154.2 c 23.4 -17.4 45.8 -36.6 64.1 -59.3 15.4 -19.1 25.5 -41.9 35.3 -64.3 0.3 80.2 0.3 160.5 -0.4 240.7" })
    ])
  }),
  "2": Object.freeze({
    digit: "2",
    viewBox: "0 0 210 297",
    strokes: Object.freeze([
      Object.freeze({ d: "m 44.5 83.9 c 8.2 -21.3 22.2 -42.7 44.3 -51.4 18.7 -5.7 39 3 50.5 17.9 11.8 15.4 17.7 37.2 16.4 56.9 -1.7 23.9 -11.7 41.5 -25.5 62.5 -27.9 42.4 -81.6 90.8 -79.4 91 l 110.8 0.1" })
    ])
  }),
  "3": Object.freeze({
    digit: "3",
    viewBox: "0 0 210 297",
    strokes: Object.freeze([
      Object.freeze({ d: "m 54.5 67.3 c 4 -19 21.3 -32.6 40.7 -35.4 17.4 -2.6 36.3 5.9 46.6 22.3 10.5 16.6 14.7 37.5 7.9 56.1 -5.3 14.3 -12.1 20.2 -25.1 26.9 -13.5 6.9 -28.8 9.9 -43.9 10.4 24.3 0.1 51.5 6.9 66.7 26.9 10.7 14.1 15.3 33.7 10.4 50.8 -6.2 21.6 -26.8 32.9 -37.2 36.9 -16.2 6.2 -32.5 4.1 -47.3 -3.6 -10.8 -5.7 -19.5 -15.8 -22 -27.8" })
    ])
  }),
  "4": Object.freeze({
    digit: "4",
    viewBox: "0 0 210 297",
    strokes: Object.freeze([
      Object.freeze({ d: "m 94.6 36.1 c -2.7 32 -8.8 63.8 -19.8 94 -9.4 25.8 -18.4 51.7 -28 77.5 40.5 -0.1 81 -0.2 121.4 -0.4" }),
      Object.freeze({ d: "M 119.2 147.2 V 262.8" })
    ])
  }),
  "5": Object.freeze({
    digit: "5",
    viewBox: "0 0 210 297",
    strokes: Object.freeze([
      Object.freeze({ d: "m 156.5 31.6 c -27.2 0.1 -54.4 0.1 -81.6 0.2 -4.1 39.5 -9.4 78.8 -16 118 17.5 -10.9 39.3 -18 59.7 -12.5 21.9 5.9 34.1 29.4 34.6 50.9 0.6 19 -1.1 37.3 -17.8 53.3 C 120.2 256.2 96.8 261.4 77.2 253.2 62.9 248.2 53.3 235.5 48.6 221.6" })
    ])
  }),
  "6": Object.freeze({
    digit: "6",
    viewBox: "0 0 210 297",
    strokes: Object.freeze([
      Object.freeze({ d: "M 154.6 61.1 C 146.4 47.3 131.7 34.3 114.5 37 94.2 40.1 80.7 57.5 70.9 74 56.7 97.7 48.7 124.8 46.9 152.3 c -1 16.7 -2.5 33.4 -1.1 50.1 1.7 20.4 11.3 41.9 28.9 53.3 25.1 16.2 81.9 -5.5 83.3 -49.3 0.5 -16.1 -2.7 -34.4 -15.4 -45.5 -17.9 -15.6 -45.4 -14.8 -65.2 -4.3 -15.5 8.2 -24.5 25.1 -31.3 40.8" })
    ])
  }),
  "7": Object.freeze({
    digit: "7",
    viewBox: "0 0 210 297",
    strokes: Object.freeze([
      Object.freeze({ d: "m 53 32.4 c 0 0 35 3.8 62.9 3.8 23.2 0 54.2 -4.2 54.2 -4.2 L 61.8 272.3" }),
      Object.freeze({ d: "M 75.8 150.5 H 159.4" })
    ])
  }),
  "8": Object.freeze({
    digit: "8",
    viewBox: "0 0 210 297",
    strokes: Object.freeze([
      Object.freeze({ d: "M 151.6 47.5 C 131.6 23.6 92.4 21.6 68.7 41.2 57.7 49.5 50.9 63 52.2 76.9 c -0.1 15.1 9.3 27.7 19.7 37.6 16.7 17.2 38.9 27.3 58 41.4 16.8 11.5 33 26.6 37.6 47.2 4.6 20.3 -6.4 41.4 -21.7 54.3 -21.9 18.2 -55.2 16.6 -78.3 1.5 C 48.8 244.9 41.8 217.6 49.8 195.9 67 152.7 135.5 142.5 154.9 92.3 c 5.6 -14.4 3.8 -31.1 -3.3 -44.8" })
    ])
  }),
  "9": Object.freeze({
    digit: "9",
    viewBox: "0 0 210 297",
    strokes: Object.freeze([
      Object.freeze({ d: "M 162 62.1 C 151 32 126.2 24.6 102.4 25.8 81 25.5 60.3 38.1 51.2 57.6 c -10.5 20.5 -9.2 45.8 0.1 66.5 8 18 27.8 28 47.2 27.7 21.3 -0.3 41.9 -12.1 51.4 -31.3 9.4 -17.8 11.8 -38.4 12 -58.3 0.4 43.6 1.1 87.2 -2.1 130.7 -1.6 22.3 -13.5 43.8 -32.6 55.7 -24.7 15.4 -54.9 19 -83.4 17.5" })
    ])
  })
});

export function getDefaultSettings() {
  return normalizeSettings(DEFAULT_SETTINGS);
}

export function normalizeSettings(settings = {}) {
  const safeSettings = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  const digits = normalizeDigits(safeSettings.digits ?? safeSettings.selectedDigits, DEFAULT_SETTINGS.digits);
  const animation = normalizeBinaryChoice(safeSettings.animation ?? safeSettings.animationMode ?? safeSettings.introAnimation, DEFAULT_SETTINGS.animation);
  const startPoint = normalizeBinaryChoice(safeSettings.startPoint ?? safeSettings.startPointMode ?? safeSettings.showStartPoint, DEFAULT_SETTINGS.startPoint);
  const toleranceLevel = normalizeToleranceLevel(safeSettings.toleranceLevel ?? safeSettings.tolerance);
  const modelVisibility = normalizeModelVisibility(safeSettings.modelVisibility ?? safeSettings.modelAfterAnimation);
  return {
    digits,
    animation,
    startPoint,
    toleranceLevel,
    modelVisibility,
    animationEnabled: animation === BINARY_CHOICE.WITH,
    showStartPoint: startPoint === BINARY_CHOICE.WITH
  };
}

export function normalizeDigits(value, fallback = DEFAULT_SETTINGS.digits) {
  const rawValues = Array.isArray(value) ? value : String(value ?? "").split(/[;,\s]+/);
  const result = [];
  rawValues.forEach((item) => {
    const digit = String(item ?? "").trim();
    if (!DIGIT_VALUES.includes(digit) || result.includes(digit)) return;
    result.push(digit);
  });
  return result.length ? result : [...fallback];
}

export function normalizeBinaryChoice(value, fallback = BINARY_CHOICE.WITH) {
  if (typeof value === "boolean") return value ? BINARY_CHOICE.WITH : BINARY_CHOICE.WITHOUT;
  const raw = String(value || "").trim().toLowerCase();
  if (["avec", "with", "yes", "true", "1", "on"].includes(raw)) return BINARY_CHOICE.WITH;
  if (["sans", "without", "no", "false", "0", "off", "none"].includes(raw)) return BINARY_CHOICE.WITHOUT;
  return BINARY_CHOICE_VALUES.includes(raw) ? raw : fallback;
}

export function normalizeModelVisibility(value) {
  const raw = String(value || "").trim();
  if (raw === "pale") return MODEL_VISIBILITY.TRACE;
  return MODEL_VISIBILITY_VALUES.includes(raw) ? raw : DEFAULT_SETTINGS.modelVisibility;
}

export function normalizeToleranceLevel(value) {
  const raw = String(value || "").trim();
  return TOLERANCE_LEVEL_VALUES.includes(raw) ? raw : DEFAULT_SETTINGS.toleranceLevel;
}

export function pickQuestion(settings = {}, { avoidDigit = "" } = {}) {
  const cfg = normalizeSettings(settings);
  const pool = cfg.digits.length > 1
    ? cfg.digits.filter((digit) => digit !== String(avoidDigit || ""))
    : cfg.digits;
  const source = pool.length ? pool : cfg.digits;
  const digit = source[Math.floor(Math.random() * source.length)] || source[0] || "1";
  return getDigitDefinition(digit);
}

export function getDigitDefinition(digit) {
  return DIGIT_DEFINITIONS[String(digit || "")] || DIGIT_DEFINITIONS["1"];
}

export function questionKey(question = {}) {
  return String(question?.digit || "");
}
