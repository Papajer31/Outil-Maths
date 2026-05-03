import { VALUE_CONSTRAINT_MODES, normalizeNumericConstraint } from "../../shared/value-constraints.js";

export const EXERCISE_TYPES = Object.freeze({
  READ_SUM: "read_sum",
  COMPOSE_SUM: "compose_sum",
  COMPARE_SUMS: "compare_sums",
  BUY_OBJECTS: "buy_objects",
  MANY_WAYS: "many_ways",
  GIVE_CHANGE: "give_change"
});

export const COMPARISON_QUESTIONS = Object.freeze({
  MORE: "more",
  LESS: "less",
  BOTH: "both"
});

export const MONEY_DISPLAY_FORMATS = Object.freeze({
  DECIMAL: "decimal",
  EUROS_CENTS: "euros_cents"
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
const DEFAULT_EXERCISE_TYPE = EXERCISE_TYPES.READ_SUM;
const DEFAULT_DISPLAY_FORMAT = MONEY_DISPLAY_FORMATS.EUROS_CENTS;
const DEFAULT_MIN_CENTS = 100;
const DEFAULT_MAX_CENTS = 2000;
const MONEY_EURO_MIN = 0;
const MONEY_EURO_MAX = 500;
const QUESTION_ATTEMPTS = 900;
const MAX_ITEMS_PER_WALLET = 10;
const MAX_COMPOSE_ITEMS = 14;
const COMPARE_PREFERRED_MAX_DELTA_CENTS = 500;
const COMPARE_ACCEPTABLE_MAX_DELTA_CENTS = 1200;

export function getDefaultSettings() {
  return {
    enabledDenominations: Object.fromEntries(DENOMINATIONS.map((denomination) => [
      denomination.id,
      DEFAULT_ENABLED_IDS.includes(denomination.id)
    ])),
    displayFormat: DEFAULT_DISPLAY_FORMAT,
    exerciseType: DEFAULT_EXERCISE_TYPE,
    readSum: {
      minCents: DEFAULT_MIN_CENTS,
      maxCents: DEFAULT_MAX_CENTS
    },
    composeSum: {
      minCents: DEFAULT_MIN_CENTS,
      maxCents: DEFAULT_MAX_CENTS,
      requireMinimumItems: false
    },
    compareSums: {
      minCents: DEFAULT_MIN_CENTS,
      maxCents: DEFAULT_MAX_CENTS,
      questionMode: COMPARISON_QUESTIONS.BOTH,
      itemCount: 2
    }
  };
}

export function normalizeSettings(settings = {}) {
  const safe = isPlainObject(settings) ? settings : {};
  const defaults = getDefaultSettings();
  return {
    enabledDenominations: normalizeEnabledDenominations(safe.enabledDenominations ?? safe.denominations ?? defaults.enabledDenominations),
    displayFormat: normalizeMoneyDisplayFormat(safe.displayFormat ?? defaults.displayFormat),
    exerciseType: normalizeExerciseType(safe.exerciseType),
    readSum: normalizeMoneyRangeSettings({ ...defaults.readSum, ...(safe.readSum ?? {}) }),
    composeSum: normalizeComposeSettings({ ...defaults.composeSum, ...(safe.composeSum ?? {}) }),
    compareSums: normalizeCompareSettings({ ...defaults.compareSums, ...(safe.compareSums ?? {}) })
  };
}

export function normalizeExerciseType(value) {
  const raw = String(value ?? "").trim();
  return Object.values(EXERCISE_TYPES).includes(raw) ? raw : DEFAULT_EXERCISE_TYPE;
}

export function normalizeMoneyDisplayFormat(value) {
  const raw = String(value ?? "").trim();
  return Object.values(MONEY_DISPLAY_FORMATS).includes(raw) ? raw : DEFAULT_DISPLAY_FORMAT;
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

export function normalizeComposeSettings(raw = {}) {
  const range = normalizeMoneyRangeSettings(raw);
  return {
    ...range,
    requireMinimumItems: Boolean(raw?.requireMinimumItems)
  };
}

export function normalizeCompareSettings(raw = {}) {
  const range = normalizeMoneyRangeSettings(raw);
  const rawQuestionMode = String(raw?.questionMode ?? "").trim();
  const questionMode = Object.values(COMPARISON_QUESTIONS).includes(rawQuestionMode)
    ? rawQuestionMode
    : COMPARISON_QUESTIONS.BOTH;
  const itemCount = [2, 3, 4].includes(Number(raw?.itemCount)) ? Number(raw.itemCount) : 2;
  return {
    ...range,
    questionMode,
    itemCount
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
  for (let i = 0; i < attempts; i++) {
    const question = buildQuestion(cfg, denominations);
    if (!question) continue;
    if (!fallback) fallback = question;
    if (!avoidKey || questionKey(question) !== avoidKey) return question;
  }
  return fallback;
}

export function questionKey(question = {}) {
  const type = normalizeExerciseType(question.exerciseType);
  if (type === EXERCISE_TYPES.COMPARE_SUMS) {
    return `${type}|${question.promptMode}|${(question.wallets ?? []).map((wallet) => wallet.totalCents).sort((a, b) => a - b).join(",")}`;
  }
  return `${type}|${question.targetCents ?? question.totalCents ?? ""}|${(question.items ?? question.solutionItems ?? []).map((item) => item.id || item.denominationId).join(",")}`;
}

function buildQuestion(cfg, denominations) {
  if (cfg.exerciseType === EXERCISE_TYPES.COMPOSE_SUM) return buildComposeQuestion(cfg, denominations);
  if (cfg.exerciseType === EXERCISE_TYPES.COMPARE_SUMS) return buildCompareQuestion(cfg, denominations);
  return buildReadQuestion(cfg, denominations);
}

function buildReadQuestion(cfg, denominations) {
  const range = cfg.readSum;
  const composition = pickRandomCompositionInRange(denominations, range, {
    minItems: 2,
    maxItems: MAX_ITEMS_PER_WALLET
  });
  if (!composition) return null;
  return {
    exerciseType: EXERCISE_TYPES.READ_SUM,
    totalCents: composition.totalCents,
    items: withItemIds(composition.items),
    solutionText: formatMoney(composition.totalCents, { displayFormat: cfg.displayFormat })
  };
}

function buildComposeQuestion(cfg, denominations) {
  const range = cfg.composeSum;
  const composition = pickRandomCompositionInRange(denominations, range, {
    minItems: 1,
    maxItems: Math.min(MAX_COMPOSE_ITEMS, 10)
  });
  if (!composition) return null;
  const solutionItems = cfg.composeSum.requireMinimumItems
    ? getMinimumComposition(composition.totalCents, denominations, { maxItems: MAX_COMPOSE_ITEMS })
    : composition.items;
  if (!solutionItems?.length) return null;
  return {
    exerciseType: EXERCISE_TYPES.COMPOSE_SUM,
    targetCents: composition.totalCents,
    solutionItems: withItemIds(solutionItems),
    minimumItemCount: getMinimumItemCount(composition.totalCents, denominations, { maxItems: MAX_COMPOSE_ITEMS })
  };
}

function buildCompareQuestion(cfg, denominations) {
  const range = cfg.compareSums;
  const itemCount = range.itemCount;
  const wallets = buildCloseCompareWallets(denominations, range, itemCount)
    ?? buildIndependentCompareWallets(denominations, range, itemCount);
  if (!wallets) return null;
  const promptMode = range.questionMode === COMPARISON_QUESTIONS.BOTH
    ? randomChoice([COMPARISON_QUESTIONS.MORE, COMPARISON_QUESTIONS.LESS])
    : range.questionMode;
  const sorted = [...wallets].sort((a, b) => a.totalCents - b.totalCents);
  const answerId = promptMode === COMPARISON_QUESTIONS.LESS ? sorted[0].id : sorted[sorted.length - 1].id;
  return {
    exerciseType: EXERCISE_TYPES.COMPARE_SUMS,
    promptMode,
    wallets,
    answerId
  };
}

function buildIndependentCompareWallets(denominations, range, itemCount) {
  const wallets = [];
  const seenTotals = new Set();
  for (let guard = 0; guard < QUESTION_ATTEMPTS && wallets.length < itemCount; guard++) {
    const composition = pickRandomCompositionInRange(denominations, range, {
      minItems: 2,
      maxItems: MAX_ITEMS_PER_WALLET
    });
    if (!composition || seenTotals.has(composition.totalCents)) continue;
    seenTotals.add(composition.totalCents);
    wallets.push({
      id: `wallet-${wallets.length + 1}`,
      label: String.fromCharCode(65 + wallets.length),
      totalCents: composition.totalCents,
      items: withItemIds(composition.items, `w${wallets.length + 1}`)
    });
  }
  if (wallets.length < itemCount) return null;
  return wallets;
}

function buildCloseCompareWallets(denominations, range, itemCount) {
  const denoms = normalizeDenominationsList(denominations);
  if (!denoms.length) return null;

  for (let guard = 0; guard < QUESTION_ATTEMPTS; guard++) {
    const base = pickRandomCompositionInRange(denoms, range, {
      minItems: 2,
      maxItems: MAX_ITEMS_PER_WALLET
    });
    if (!base) return null;

    const seenTotals = new Set([base.totalCents]);
    const selected = [{
      totalCents: base.totalCents,
      items: base.items
    }];
    const variants = buildCompareVariantCandidates(base.items, denoms, range, base.totalCents);

    while (selected.length < itemCount) {
      const next = pickCloseCompareVariant(variants, seenTotals);
      if (!next) break;
      seenTotals.add(next.totalCents);
      selected.push(next);
    }

    if (selected.length === itemCount) {
      return selected.map((wallet, index) => ({
        id: `wallet-${index + 1}`,
        label: String.fromCharCode(65 + index),
        totalCents: wallet.totalCents,
        items: withItemIds(wallet.items, `w${index + 1}`)
      }));
    }
  }

  return null;
}

export function evaluateReadAnswer(question, rawAnswer) {
  const expected = Number(question?.totalCents ?? NaN);
  const answer = parseMoneyToCents(rawAnswer);
  return Number.isFinite(answer) && answer === expected;
}

export function evaluateComposeAnswer(question, selectedItems = [], settings = {}) {
  const cfg = normalizeSettings(settings);
  const total = sumItems(selectedItems);
  const target = Number(question?.targetCents ?? NaN);
  if (!Number.isFinite(target) || total !== target) return false;
  if (!cfg.composeSum.requireMinimumItems) return true;
  const minCount = Number(question?.minimumItemCount ?? 0);
  return minCount > 0 && selectedItems.length === minCount;
}

export function evaluateCompareAnswer(question, selectedWalletId) {
  return String(selectedWalletId || "") === String(question?.answerId || "");
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
    kind: safeDenomination.kind
  };
}

export function formatMoney(cents, { decimals = false, displayFormat = MONEY_DISPLAY_FORMATS.EUROS_CENTS } = {}) {
  const value = clampInt(cents, -999999, 999999);
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const euros = Math.floor(abs / 100);
  const rest = abs % 100;
  const format = decimals ? MONEY_DISPLAY_FORMATS.DECIMAL : normalizeMoneyDisplayFormat(displayFormat);
  if (format === MONEY_DISPLAY_FORMATS.DECIMAL) {
    return `${sign}${euros},${String(rest).padStart(2, "0")} €`;
  }
  if (rest === 0) return `${sign}${euros} €`;
  if (euros === 0) return `${sign}${rest} c`;
  return `${sign}${euros} € ${String(rest).padStart(2, "0")} c`;
}

export function parseMoneyToCents(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100);
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return NaN;
  const normalized = raw
    .replace(/€/g, "")
    .replace(/euros?/g, "")
    .replace(/centimes?/g, "c")
    .replace(/\s+/g, " ")
    .trim();

  const euroCentMatch = normalized.match(/^(-?\d+)\s*(?:€|e)?\s+(\d{1,2})\s*c?$/i);
  if (euroCentMatch) {
    const euros = Number(euroCentMatch[1]);
    const cents = Number(euroCentMatch[2]);
    return euros * 100 + Math.sign(euros || 1) * cents;
  }

  const centMatch = normalized.match(/^(-?\d+)\s*c$/i);
  if (centMatch) return Number(centMatch[1]);

  const decimal = normalized.replace(",", ".").replace(/\s/g, "");
  if (/^-?\d+(?:\.\d{1,2})?$/.test(decimal)) {
    return Math.round(Number(decimal) * 100);
  }

  return NaN;
}

export function centsToInputValue(cents) {
  const n = clampInt(cents, 0, 50000);
  return (n / 100).toFixed(2).replace(".", ",");
}

export function inputValueToCents(value, fallback = 0) {
  const parsed = parseMoneyToCents(value);
  return Number.isFinite(parsed) ? clampInt(parsed, 0, 50000) : clampInt(fallback, 0, 50000);
}

export function getMinimumItemCount(amountCents, denominations, { maxItems = 99 } = {}) {
  const comp = getMinimumComposition(amountCents, denominations, { maxItems });
  return comp ? comp.length : 0;
}

export function getMinimumComposition(amountCents, denominations, { maxItems = 99 } = {}) {
  const amount = clampInt(amountCents, 0, 50000);
  if (amount === 0) return [];
  const denoms = normalizeDenominationsList(denominations).sort((a, b) => b.value - a.value);
  if (!denoms.length) return null;

  const dp = Array(amount + 1).fill(Infinity);
  const prev = Array(amount + 1).fill(null);
  dp[0] = 0;
  for (let current = 1; current <= amount; current++) {
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

function pickRandomCompositionInRange(denominations, range, { minItems = 1, maxItems = MAX_ITEMS_PER_WALLET } = {}) {
  const denoms = normalizeDenominationsList(denominations);
  if (!denoms.length) return null;
  const minCents = clampInt(range?.minCents, 0, 50000);
  const maxCents = clampInt(range?.maxCents, minCents, 50000);
  const allowedCents = Array.isArray(range?.allowedCents)
    ? range.allowedCents.filter((value) => Number.isFinite(Number(value)) && value >= minCents && value <= maxCents)
    : [];
  const allowedSet = allowedCents.length ? new Set(allowedCents.map((value) => Number(value))) : null;
  const maxSafeItems = Math.max(minItems, maxItems);

  for (let attempt = 0; attempt < QUESTION_ATTEMPTS; attempt++) {
    const itemCount = randomInt(minItems, maxSafeItems);
    const items = [];
    for (let i = 0; i < itemCount; i++) {
      items.push(randomChoice(denoms));
    }
    const totalCents = items.reduce((sum, item) => sum + item.value, 0);
    if (totalCents < minCents || totalCents > maxCents) continue;
    if (allowedSet && !allowedSet.has(totalCents)) continue;
    return { totalCents, items: sortMoneyItems(items) };
  }

  // Fallback: choose a representable amount by minimum composition.
  for (let attempt = 0; attempt < 600; attempt++) {
    const candidate = allowedCents.length ? randomChoice(allowedCents) : randomInt(minCents, maxCents);
    const composition = getMinimumComposition(candidate, denoms, { maxItems: maxSafeItems });
    if (composition?.length) {
      return { totalCents: candidate, items: sortMoneyItems(composition) };
    }
  }

  return null;
}

function buildCompareVariantCandidates(baseItems = [], denominations = [], range = {}, baseTotalCents = 0) {
  const base = normalizeCompositionItems(baseItems);
  const denoms = normalizeDenominationsList(denominations);
  const candidates = new Map();
  const pushCandidate = (items, editCount) => {
    if (!Array.isArray(items) || items.length < 2 || items.length > MAX_ITEMS_PER_WALLET) return;
    const totalCents = items.reduce((sum, item) => sum + Number(item?.value ?? 0), 0);
    if (totalCents === baseTotalCents || !isTotalAllowedByMoneyRange(totalCents, range)) return;
    const diffCents = Math.abs(totalCents - baseTotalCents);
    const score = getCompareVariantScore(diffCents, editCount);
    const existing = candidates.get(totalCents);
    if (existing && existing.score <= score) return;
    candidates.set(totalCents, {
      totalCents,
      items: sortMoneyItems(items),
      score
    });
  };

  base.forEach((_, index) => {
    denoms.forEach((denom) => {
      if (denom.id === base[index]?.id) return;
      pushCandidate(base.map((item, itemIndex) => itemIndex === index ? denom : item), 1);
    });
  });

  if (base.length < MAX_ITEMS_PER_WALLET) {
    denoms.forEach((denom) => pushCandidate([...base, denom], 1));
  }

  if (base.length > 2) {
    base.forEach((_, index) => {
      pushCandidate(base.filter((__, itemIndex) => itemIndex !== index), 1);
    });
  }

  if (base.length + 2 <= MAX_ITEMS_PER_WALLET) {
    denoms.forEach((first, firstIndex) => {
      denoms.slice(firstIndex).forEach((second) => {
        pushCandidate([...base, first, second], 2);
      });
    });
  }

  if (base.length > 3) {
    base.forEach((_, firstIndex) => {
      base.slice(firstIndex + 1).forEach((__, offset) => {
        const secondIndex = firstIndex + 1 + offset;
        pushCandidate(base.filter((___, itemIndex) => itemIndex !== firstIndex && itemIndex !== secondIndex), 2);
      });
    });
  }

  return [...candidates.values()].sort((a, b) => a.score - b.score || a.totalCents - b.totalCents);
}

function pickCloseCompareVariant(candidates = [], seenTotals = new Set()) {
  const available = candidates.filter((candidate) => !seenTotals.has(candidate.totalCents));
  if (!available.length) return null;
  const bestScore = available[0].score;
  const bestBand = available.filter((candidate) => candidate.score <= bestScore + 80).slice(0, 8);
  return randomChoice(bestBand);
}

function getCompareVariantScore(diffCents, editCount) {
  const diff = Math.abs(Number(diffCents) || 0);
  const edits = Math.max(1, Number(editCount) || 1);
  const tinyPenalty = diff < 100 ? 500 : 0;
  const preferredPenalty = diff <= COMPARE_PREFERRED_MAX_DELTA_CENTS
    ? 0
    : diff - COMPARE_PREFERRED_MAX_DELTA_CENTS;
  const largePenalty = diff <= COMPARE_ACCEPTABLE_MAX_DELTA_CENTS
    ? 0
    : (diff - COMPARE_ACCEPTABLE_MAX_DELTA_CENTS) * 2;
  return edits * 120 + tinyPenalty + preferredPenalty + largePenalty + Math.random() * 40;
}

function isTotalAllowedByMoneyRange(totalCents, range = {}) {
  const total = Number(totalCents);
  if (!Number.isFinite(total)) return false;
  const minCents = clampInt(range?.minCents, 0, 50000);
  const maxCents = clampInt(range?.maxCents, minCents, 50000);
  if (total < minCents || total > maxCents) return false;
  const allowedCents = Array.isArray(range?.allowedCents)
    ? range.allowedCents.filter((value) => Number.isFinite(Number(value)))
    : [];
  return !allowedCents.length || allowedCents.some((value) => Number(value) === total);
}

function normalizeCompositionItems(items) {
  const raw = Array.isArray(items) ? items : [];
  return raw.map((item) => {
    const denom = typeof item === "string"
      ? getDenominationById(item)
      : getDenominationById(item?.denominationId ?? item?.id) || item;
    if (!denom || !Number.isFinite(Number(denom.value))) return null;
    return denom;
  }).filter(Boolean);
}

function normalizeDenominationsList(denominations) {
  const raw = Array.isArray(denominations) ? denominations : [];
  const byId = new Map();
  raw.forEach((item) => {
    const denom = typeof item === "string" ? getDenominationById(item) : item;
    if (!denom || !Number.isFinite(Number(denom.value))) return;
    byId.set(denom.id, denom);
  });
  return [...byId.values()].sort((a, b) => b.value - a.value);
}

function withItemIds(items = [], prefix = "m") {
  return (Array.isArray(items) ? items : []).map((denom, index) => ({
    itemId: `${prefix}-${index}-${denom.id}`,
    denominationId: denom.id,
    label: denom.label,
    value: denom.value,
    kind: denom.kind
  }));
}

function sortMoneyItems(items = []) {
  return [...items].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "fr"));
}

function randomChoice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min, max) {
  const safeMin = Math.ceil(Math.min(Number(min) || 0, Number(max) || 0));
  const safeMax = Math.floor(Math.max(Number(min) || 0, Number(max) || 0));
  return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
}

function centsToLowerWholeEuros(cents) {
  const value = Number(cents);
  if (!Number.isFinite(value)) return MONEY_EURO_MIN;
  return clampInt(Math.floor(value / 100), MONEY_EURO_MIN, MONEY_EURO_MAX);
}

function centsToUpperWholeEuros(cents) {
  const value = Number(cents);
  if (!Number.isFinite(value)) return MONEY_EURO_MIN;
  return clampInt(Math.ceil(value / 100), MONEY_EURO_MIN, MONEY_EURO_MAX);
}

function clampInt(value, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}
