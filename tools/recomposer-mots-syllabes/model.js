import {
  normalizeSettings,
  setWordCatalog as setSegmenterWordCatalog,
  pickQuestion as pickSegmenterQuestion
} from "../segmenter-mots/model.js";

export { normalizeSettings };

// Pour cet outil, un mot monosyllabique n'offre aucune recomposition :
// on le retire du catalogue avant tout tirage.
export function setWordCatalog(words = []) {
  const polysyllabicWords = (Array.isArray(words) ? words : []).filter((word) => {
    const syllables = (Array.isArray(word?.syllables) ? word.syllables : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    return syllables.length >= 2;
  });
  setSegmenterWordCatalog(polysyllabicWords);
}

export function pickQuestion(settings = {}, options = {}) {
  const base = pickSegmenterQuestion(settings, options);
  if (!base) return null;

  const words = (Array.isArray(base.words) ? base.words : []).map((word, wordIndex) => {
    const syllables = (Array.isArray(word?.syllables) && word.syllables.length
      ? word.syllables
      : [word?.word])
      .map((value) => String(value || "").trim().normalize("NFC"))
      .filter(Boolean);

    return {
      ...word,
      wordIndex,
      syllables
    };
  });

  if (!words.length || words.some((word) => !word.syllables.length)) return null;

  const tokenMeta = [];
  const expectedZones = words.map((word, wordIndex) => word.syllables.map((label, syllableIndex) => {
    const id = `w${wordIndex}s${syllableIndex}`;
    tokenMeta.push({ id, label, wordIndex, syllableIndex });
    return id;
  }));

  return {
    key:`${base.key}::syllabes`,
    target:base.target,
    words,
    prompt:`Recompose les ${words.length} mots avec les syllabes.`,
    tokenMeta,
    items:shuffleArray(tokenMeta.map((token) => token.id)),
    expectedZones
  };
}

export function questionKey(question) {
  return String(question?.key || "");
}

export function getTokenLabel(question, tokenId) {
  const token = (Array.isArray(question?.tokenMeta) ? question.tokenMeta : [])
    .find((entry) => entry.id === tokenId);
  return String(token?.label || "");
}

export function evaluateZoneOrders(question, zoneOrders = []) {
  const meta = new Map((Array.isArray(question?.tokenMeta) ? question.tokenMeta : [])
    .map((token) => [token.id, token]));
  const expected = (Array.isArray(question?.expectedZones) ? question.expectedZones : [])
    .map((zone) => zone.map((id) => String(meta.get(id)?.label || "")).join("\u0001"));
  const submitted = (Array.isArray(zoneOrders) ? zoneOrders : [])
    .map((zone) => (Array.isArray(zone) ? zone : []).map((id) => String(meta.get(id)?.label || "")).join("\u0001"));

  const remainingExpected = expected.map((signature, index) => ({ signature, index }));
  const matchedExpectedIndexByZone = new Array(submitted.length).fill(-1);
  const zoneCorrect = submitted.map((signature, zoneIndex) => {
    if (!signature) return false;
    const matchIndex = remainingExpected.findIndex((entry) => entry.signature === signature);
    if (matchIndex < 0) return false;
    matchedExpectedIndexByZone[zoneIndex] = remainingExpected[matchIndex].index;
    remainingExpected.splice(matchIndex, 1);
    return true;
  });

  const unusedExpectedIndices = remainingExpected.map((entry) => entry.index);
  const correctionExpectedIndexByZone = matchedExpectedIndexByZone.map((matched) => {
    if (matched >= 0) return matched;
    return unusedExpectedIndices.shift() ?? -1;
  });

  return {
    isCorrect:zoneCorrect.length === expected.length
      && zoneCorrect.every(Boolean)
      && submitted.length === expected.length,
    zoneCorrect,
    correctionExpectedIndexByZone
  };
}

function shuffleArray(values) {
  const copy = [...(Array.isArray(values) ? values : [])];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}
