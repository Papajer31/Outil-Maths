import { VALUE_CONSTRAINT_MODES, normalizeNumericConstraint } from "../../shared/value-constraints.js";

export const EXERCISE_TYPES = Object.freeze({
  READ_SUM: "read_sum",
  COMPOSE_SUM: "compose_sum",
  BOTH: "both"
});

export const MONEY_DISPLAY_FORMATS = Object.freeze({
  DECIMAL: "decimal",
  EUROS_CENTS: "euros_cents",
  CENTS_ONLY: "cents_only",
  WORDS: "words"
});

export const MONEY_ASSET_STYLES = Object.freeze({
  REALISTIC: "realistic",
  SIMPLE: "simple"
});

export const DENOMINATIONS = Object.freeze([
  { id: "eur1", label: "1 €", value: 100, kind: "coin", group: "main", asset: "e1.webp" },
  { id: "eur2", label: "2 €", value: 200, kind: "coin", group: "main", asset: "e2.webp" },
  { id: "eur5", label: "5 €", value: 500, kind: "bill", group: "main", asset: "e5.webp" },
  { id: "eur10", label: "10 €", value: 1000, kind: "bill", group: "main", asset: "e10.webp" },
  { id: "eur20", label: "20 €", value: 2000, kind: "bill", group: "main", asset: "e20.webp" },
  { id: "eur50", label: "50 €", value: 5000, kind: "bill", group: "main", asset: "e50.webp" },
  { id: "eur100", label: "100 €", value: 10000, kind: "bill", group: "main", asset: "e100.webp" },
  { id: "cent1", label: "1 c", value: 1, kind: "coin", group: "more", asset: "c1.webp" },
  { id: "cent2", label: "2 c", value: 2, kind: "coin", group: "more", asset: "c2.webp" },
  { id: "cent5", label: "5 c", value: 5, kind: "coin", group: "more", asset: "c5.webp" },
  { id: "cent10", label: "10 c", value: 10, kind: "coin", group: "more", asset: "c10.webp" },
  { id: "cent20", label: "20 c", value: 20, kind: "coin", group: "more", asset: "c20.webp" },
  { id: "cent50", label: "50 c", value: 50, kind: "coin", group: "more", asset: "c50.webp" },
  { id: "eur200", label: "200 €", value: 20000, kind: "bill", group: "more", asset: "e200.webp" },
  { id: "eur500", label: "500 €", value: 50000, kind: "bill", group: "more", asset: "e500.webp" }
]);

const DENOMINATION_BY_ID = new Map(DENOMINATIONS.map((denomination) => [denomination.id, denomination]));
const DEFAULT_ENABLED_IDS = ["eur1", "eur2", "eur5", "eur10", "eur20", "eur50"];
const DEFAULT_DISPLAY_FORMATS = [MONEY_DISPLAY_FORMATS.DECIMAL, MONEY_DISPLAY_FORMATS.EUROS_CENTS];
const MONEY_EURO_MIN = 0;
const MONEY_EURO_MAX = 500;
const DEFAULT_MIN_CENTS = 100;
const DEFAULT_MAX_CENTS = 2000;
const QUESTION_ATTEMPTS = 900;
const MAX_READ_ITEMS = 10;
const MAX_COMPOSE_ITEMS = 14;

export function getDefaultSettings() {
  return {
    exerciseType: EXERCISE_TYPES.BOTH,
    enabledDenominations: Object.fromEntries(DENOMINATIONS.map((denomination) => [
      denomination.id,
      DEFAULT_ENABLED_IDS.includes(denomination.id)
    ])),
    displayFormats: [...DEFAULT_DISPLAY_FORMATS],
    assetStyle: MONEY_ASSET_STYLES.REALISTIC,
    moneyRange: {
      minCents: DEFAULT_MIN_CENTS,
      maxCents: DEFAULT_MAX_CENTS
    },
    maxAttempts: 1,
    explicitDeltaFeedback: true,
    requireMinimumItems: false
  };
}

export function normalizeSettings(settings = {}) {
  const safe = isPlainObject(settings) ? settings : {};
  const defaults = getDefaultSettings();
  const legacyRange = safe.moneyRange ?? safe.readSum ?? safe.composeSum ?? {};
  return {
    exerciseType: normalizeExerciseType(safe.exerciseType),
    enabledDenominations: normalizeEnabledDenominations(safe.enabledDenominations ?? safe.denominations ?? defaults.enabledDenominations),
    displayFormats: normalizeDisplayFormats(safe.displayFormats ?? safe.displayFormat ?? defaults.displayFormats),
    assetStyle: normalizeAssetStyle(safe.assetStyle ?? defaults.assetStyle),
    moneyRange: normalizeMoneyRangeSettings({ ...defaults.moneyRange, ...legacyRange }),
    maxAttempts: clampInt(safe.maxAttempts, 1, 9, defaults.maxAttempts),
    explicitDeltaFeedback: safe.explicitDeltaFeedback !== false,
    requireMinimumItems: Boolean(safe.requireMinimumItems ?? safe.composeSum?.requireMinimumItems ?? defaults.requireMinimumItems)
  };
}

export function normalizeExerciseType(value) {
  const raw = String(value ?? "").trim();
  return Object.values(EXERCISE_TYPES).includes(raw) ? raw : EXERCISE_TYPES.BOTH;
}

export function normalizeAssetStyle(value) {
  const raw = String(value ?? "").trim();
  return Object.values(MONEY_ASSET_STYLES).includes(raw) ? raw : MONEY_ASSET_STYLES.REALISTIC;
}

export function normalizeDisplayFormats(value) {
  const values = Array.isArray(value) ? value : [value];
  const out = values
    .map((item) => String(item ?? "").trim())
    .filter((item) => Object.values(MONEY_DISPLAY_FORMATS).includes(item));
  const unique = Array.from(new Set(out));
  return unique.length ? unique : [...DEFAULT_DISPLAY_FORMATS];
}

export function normalizeEnabledDenominations(raw = {}) {
  const base = isPlainObject(raw) ? raw : {};
  const defaults = getDefaultSettings().enabledDenominations;
  const out = {};
  DENOMINATIONS.forEach((denomination) => {
    out[denomination.id] = Boolean(base[denomination.id] ?? defaults[denomination.id] ?? false);
  });
  if (!Object.values(out).some(Boolean)) {
    DEFAULT_ENABLED_IDS.forEach((id) => { out[id] = true; });
  }
  return out;
}

export function normalizeMoneyRangeSettings(raw = {}) {
  const base = isPlainObject(raw) ? raw : {};
  const minFallback = centsToLowerWholeEuros(base.minCents ?? DEFAULT_MIN_CENTS);
  const maxFallback = centsToUpperWholeEuros(base.maxCents ?? DEFAULT_MAX_CENTS);
  const constraint = normalizeNumericConstraint({
    min: base.min ?? minFallback,
    max: base.max ?? maxFallback,
    mode: base.mode,
    start: base.start,
    step: base.step,
    values: base.values
  }, {
    inputMin: MONEY_EURO_MIN,
    inputMax: MONEY_EURO_MAX,
    defaultMin: minFallback,
    defaultMax: maxFallback,
    defaultStart: minFallback,
    defaultStep: 1,
    defaultValues: []
  });
  const allowedCents = constraint.mode === VALUE_CONSTRAINT_MODES.SIMPLE
    ? []
    : constraint.allowedValues.map((value) => value * 100);
  return {
    minCents: constraint.min * 100,
    maxCents: constraint.max * 100,
    mode: constraint.mode,
    start: constraint.start,
    step: constraint.step,
    values: constraint.values,
    allowedCents
  };
}

export function getEnabledDenominations(settings = {}) {
  const enabled = normalizeSettings(settings).enabledDenominations;
  return DENOMINATIONS.filter((denomination) => enabled[denomination.id]);
}

export function canGenerateQuestion(settings = {}) {
  return Boolean(pickQuestion(settings, { attempts: 120 }));
}

export function pickQuestion(settings = {}, { avoidKey = null, attempts = QUESTION_ATTEMPTS } = {}) {
  const cfg = normalizeSettings(settings);
  const denominations = getEnabledDenominations(cfg);
  if (!denominations.length) return null;

  let fallback = null;
  for (let i = 0; i < attempts; i += 1) {
    const question = buildQuestion(cfg, denominations);
    if (!question) continue;
    if (!fallback) fallback = question;
    if (!avoidKey || questionKey(question) !== avoidKey) return question;
  }
  return fallback;
}

export function questionKey(question = {}) {
  const q = question && typeof question === "object" ? question : {};
  return `${q.exerciseType}|${q.displayFormat}|${q.targetCents ?? q.totalCents ?? ""}|${(q.items ?? q.solutionItems ?? []).map((item) => item.id || item.denominationId).join(",")}`;
}

function buildQuestion(cfg, denominations) {
  const exerciseType = cfg.exerciseType === EXERCISE_TYPES.BOTH
    ? randomChoice([EXERCISE_TYPES.READ_SUM, EXERCISE_TYPES.COMPOSE_SUM])
    : cfg.exerciseType;
  return exerciseType === EXERCISE_TYPES.COMPOSE_SUM
    ? buildComposeQuestion(cfg, denominations)
    : buildReadQuestion(cfg, denominations);
}

function buildReadQuestion(cfg, denominations) {
  const composition = pickRandomCompositionInRange(denominations, cfg.moneyRange, {
    minItems: 2,
    maxItems: MAX_READ_ITEMS
  });
  if (!composition) return null;
  const displayFormat = randomChoice(cfg.displayFormats);
  const items = cfg.requireMinimumItems
    ? getMinimumComposition(composition.totalCents, denominations, { maxItems: MAX_READ_ITEMS })
    : composition.items;
  if (!items?.length) return null;
  return {
    exerciseType: EXERCISE_TYPES.READ_SUM,
    displayFormat,
    totalCents: composition.totalCents,
    items: withItemIds(items),
    solutionText: formatMoney(composition.totalCents, { displayFormat })
  };
}

function buildComposeQuestion(cfg, denominations) {
  const composition = pickRandomCompositionInRange(denominations, cfg.moneyRange, {
    minItems: 1,
    maxItems: Math.min(MAX_COMPOSE_ITEMS, 10)
  });
  if (!composition) return null;
  const displayFormat = randomChoice(cfg.displayFormats);
  const solutionItems = cfg.requireMinimumItems
    ? getMinimumComposition(composition.totalCents, denominations, { maxItems: MAX_COMPOSE_ITEMS })
    : composition.items;
  if (!solutionItems?.length) return null;
  return {
    exerciseType: EXERCISE_TYPES.COMPOSE_SUM,
    displayFormat,
    targetCents: composition.totalCents,
    solutionItems: withItemIds(solutionItems),
    minimumItemCount: getMinimumItemCount(composition.totalCents, denominations, { maxItems: MAX_COMPOSE_ITEMS })
  };
}

export function evaluateReadAnswer(question, response) {
  const expected = Number(question?.totalCents ?? NaN);
  const answer = parseReadResponseToCents(response, question?.displayFormat);
  return Number.isFinite(answer) && answer === expected;
}

export function evaluateComposeAnswer(question, selectedItems = [], settings = {}) {
  const cfg = normalizeSettings(settings);
  const total = sumItems(selectedItems);
  const target = Number(question?.targetCents ?? NaN);
  if (!Number.isFinite(target) || total !== target) return false;
  if (!cfg.requireMinimumItems) return true;
  const minCount = Number(question?.minimumItemCount ?? 0);
  return minCount > 0 && selectedItems.length === minCount;
}

export function getAnswerCents(question, response, selectedItems = []) {
  if (!question) return NaN;
  if (question.exerciseType === EXERCISE_TYPES.COMPOSE_SUM) return sumItems(selectedItems);
  return parseReadResponseToCents(response, question.displayFormat);
}

export function sumItems(items = []) {
  return (Array.isArray(items) ? items : []).reduce((sum, item) => sum + Number(item?.value ?? 0), 0);
}

export function getDenominationById(id) {
  return DENOMINATION_BY_ID.get(String(id || "")) || null;
}

export function createMoneyItem(denomination, index = 0) {
  const safeDenomination = typeof denomination === "string" ? getDenominationById(denomination) : denomination;
  if (!safeDenomination) return null;
  return {
    itemId: `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${index}`,
    denominationId: safeDenomination.id,
    label: safeDenomination.label,
    value: safeDenomination.value,
    kind: safeDenomination.kind,
    asset: safeDenomination.asset
  };
}

export function formatMoney(cents, { displayFormat = MONEY_DISPLAY_FORMATS.EUROS_CENTS } = {}) {
  const value = clampInt(cents, -999999, 999999, 0);
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const euros = Math.floor(abs / 100);
  const rest = abs % 100;
  const format = normalizeDisplayFormats([displayFormat])[0];

  if (format === MONEY_DISPLAY_FORMATS.DECIMAL) {
    return `${sign}${euros},${String(rest).padStart(2, "0")} €`;
  }
  if (format === MONEY_DISPLAY_FORMATS.CENTS_ONLY) {
    return `${sign}${abs} c`;
  }
  if (format === MONEY_DISPLAY_FORMATS.WORDS) {
    return `${sign}${euros} ${euros > 1 ? "euros" : "euro"} et ${rest} ${rest > 1 ? "centimes" : "centime"}`;
  }
  if (rest === 0) return `${sign}${euros} €`;
  if (euros === 0) return `${sign}${rest} c`;
  return `${sign}${euros} € ${String(rest).padStart(2, "0")} c`;
}

export function parseReadResponseToCents(response, displayFormat = MONEY_DISPLAY_FORMATS.DECIMAL) {
  if (typeof response === "number" && Number.isFinite(response)) return Math.round(response * 100);
  if (isPlainObject(response)) {
    const format = normalizeDisplayFormats([displayFormat])[0];
    if (format === MONEY_DISPLAY_FORMATS.CENTS_ONLY) {
      return parseIntegerLike(response.centsTotal);
    }
    if (format === MONEY_DISPLAY_FORMATS.EUROS_CENTS || format === MONEY_DISPLAY_FORMATS.WORDS) {
      const euros = parseIntegerLike(response.euros);
      const cents = parseIntegerLike(response.cents);
      if (!Number.isFinite(euros) && !Number.isFinite(cents)) return NaN;
      return (Number.isFinite(euros) ? euros : 0) * 100 + (Number.isFinite(cents) ? cents : 0);
    }
    return parseMoneyToCents(response.decimal);
  }
  return parseMoneyToCents(response);
}

export function parseMoneyToCents(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100);
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return NaN;
  const normalized = raw
    .replace(/€/g, " € ")
    .replace(/euros?/g, " euros ")
    .replace(/centimes?/g, " c ")
    .replace(/\s+/g, " ")
    .trim();

  const wordsMatch = normalized.match(/^(-?\d+)\s*euros?\s*(?:et\s*)?(\d{1,2})\s*c?$/i);
  if (wordsMatch) return Number(wordsMatch[1]) * 100 + Math.sign(Number(wordsMatch[1]) || 1) * Number(wordsMatch[2]);

  const euroCentMatch = normalized.match(/^(-?\d+)\s*(?:€|e)?\s+(\d{1,2})\s*c?$/i);
  if (euroCentMatch) return Number(euroCentMatch[1]) * 100 + Math.sign(Number(euroCentMatch[1]) || 1) * Number(euroCentMatch[2]);

  const centMatch = normalized.match(/^(-?\d+)\s*c$/i);
  if (centMatch) return Number(centMatch[1]);

  const decimal = normalized.replace(/\s/g, "").replace(",", ".").replace(/€|euros?/g, "");
  if (/^-?\d+(?:\.\d{1,2})?$/.test(decimal)) return Math.round(Number(decimal) * 100);

  return NaN;
}

export function getMinimumItemCount(amountCents, denominations, { maxItems = 99 } = {}) {
  const comp = getMinimumComposition(amountCents, denominations, { maxItems });
  return comp ? comp.length : 0;
}

export function getMinimumComposition(amountCents, denominations, { maxItems = 99 } = {}) {
  const amount = clampInt(amountCents, 0, 50000, 0);
  if (amount === 0) return [];
  const denoms = normalizeDenominationsList(denominations).sort((a, b) => b.value - a.value);
  if (!denoms.length) return null;

  const dp = Array(amount + 1).fill(Infinity);
  const prev = Array(amount + 1).fill(null);
  dp[0] = 0;
  for (let current = 1; current <= amount; current += 1) {
    for (const denom of denoms) {
      if (denom.value > current) continue;
      if (dp[current - denom.value] + 1 < dp[current]) {
        dp[current] = dp[current - denom.value] + 1;
        prev[current] = denom;
      }
    }
  }
  if (!Number.isFinite(dp[amount]) || dp[amount] > maxItems) return null;
  const out = [];
  let cursor = amount;
  while (cursor > 0) {
    const denom = prev[cursor];
    if (!denom) return null;
    out.push(denom);
    cursor -= denom.value;
  }
  return out;
}

function pickRandomCompositionInRange(denominations, range, { minItems = 1, maxItems = MAX_READ_ITEMS } = {}) {
  const denoms = normalizeDenominationsList(denominations);
  if (!denoms.length) return null;
  const minCents = clampInt(range?.minCents, 0, 50000, DEFAULT_MIN_CENTS);
  const maxCents = clampInt(range?.maxCents, minCents, 50000, DEFAULT_MAX_CENTS);
  const allowedCents = Array.isArray(range?.allowedCents)
    ? range.allowedCents.filter((value) => Number.isFinite(Number(value)) && value >= minCents && value <= maxCents)
    : [];
  const allowedSet = allowedCents.length ? new Set(allowedCents.map((value) => Number(value))) : null;
  const maxSafeItems = Math.max(minItems, maxItems);

  for (let attempt = 0; attempt < QUESTION_ATTEMPTS; attempt += 1) {
    const itemCount = randomInt(minItems, maxSafeItems);
    const items = [];
    for (let i = 0; i < itemCount; i += 1) {
      items.push(randomChoice(denoms));
    }
    const totalCents = items.reduce((sum, item) => sum + item.value, 0);
    if (totalCents < minCents || totalCents > maxCents) continue;
    if (allowedSet && !allowedSet.has(totalCents)) continue;
    return { totalCents, items: sortMoneyItems(items) };
  }

  for (const amount of allowedCents.length ? shuffled(allowedCents) : shuffledRange(minCents, maxCents, 100)) {
    const comp = getMinimumComposition(amount, denoms, { maxItems: maxSafeItems });
    if (comp && comp.length >= minItems) return { totalCents: amount, items: comp };
  }

  return null;
}

function normalizeDenominationsList(denominations) {
  const source = Array.isArray(denominations) ? denominations : [];
  return source
    .map((item) => (typeof item === "string" ? getDenominationById(item) : item))
    .filter((item) => item && Number(item.value) > 0);
}

function withItemIds(items = [], prefix = "m") {
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    ...item,
    denominationId: item.denominationId || item.id,
    itemId: `${prefix}-${index}-${item.id || item.denominationId}`
  }));
}

function sortMoneyItems(items = []) {
  return [...items].sort((a, b) => b.value - a.value || String(a.id).localeCompare(String(b.id)));
}

function parseIntegerLike(value) {
  const raw = String(value ?? "").trim().replace(/\s+/g, "");
  if (!/^-?\d+$/.test(raw)) return NaN;
  return Number(raw);
}

function randomChoice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min, max) {
  const a = Math.ceil(Number(min));
  const b = Math.floor(Number(max));
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function shuffled(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function shuffledRange(min, max, step) {
  const out = [];
  const safeStep = Math.max(1, Math.floor(Number(step) || 1));
  for (let value = min; value <= max; value += safeStep) out.push(value);
  return shuffled(out);
}

function centsToLowerWholeEuros(cents) {
  const value = Number(cents);
  if (!Number.isFinite(value)) return 0;
  return Math.min(MONEY_EURO_MAX, Math.max(MONEY_EURO_MIN, Math.floor(value / 100)));
}

function centsToUpperWholeEuros(cents) {
  const value = Number(cents);
  if (!Number.isFinite(value)) return 0;
  return Math.min(MONEY_EURO_MAX, Math.max(MONEY_EURO_MIN, Math.ceil(value / 100)));
}

function clampInt(value, min, max, fallback = min) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
