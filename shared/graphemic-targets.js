export const WORD_SELECTION_MODES = Object.freeze({
  PHONEMIC:"phonemic",
  GRAPHEMIC:"graphemic"
});

const LEGACY_GRAPHEMIC_TARGETS = Object.freeze({
  ks:"x",
  gz:"x",
  x_ks:"x",
  x_gz:"x",
  oi:"oi",
  oy:"oy",
  ay:"ay",
  oin:"oin",
  ien:"ien",
  ion:"ion",
  ill_ij:"ill",
  ouil:"ouil",
  ouille:"ouille",
  ail:"ail",
  aille:"aille",
  eil:"eil",
  eille:"eille",
  euil:"euil",
  euille:"euille"
});

export function normalizeWordSelectionMode(value) {
  return String(value || "").trim().toLocaleLowerCase("fr-FR") === WORD_SELECTION_MODES.GRAPHEMIC
    ? WORD_SELECTION_MODES.GRAPHEMIC
    : WORD_SELECTION_MODES.PHONEMIC;
}

export function normalizeGraphemicEntry(value) {
  const normalized = String(value || "")
    .trim()
    .normalize("NFC")
    .toLocaleLowerCase("fr-FR");
  return /^\p{L}+$/u.test(normalized) ? normalized : "";
}

export function normalizeGraphemicEntries(values = []) {
  const source = Array.isArray(values) ? values : [values];
  return Array.from(new Set(source.map(normalizeGraphemicEntry).filter(Boolean)));
}

export function parseGraphemicEntryText(value) {
  return normalizeGraphemicEntries(
    String(value || "")
      .split(/[;,/\s]+/u)
      .map((part) => part.trim())
      .filter(Boolean)
  );
}

export function makeGraphemicTarget(value) {
  const grapheme = normalizeGraphemicEntry(value);
  if (!grapheme) return null;
  return {
    id:`grapheme:${grapheme}`,
    kind:"graphemic",
    grapheme,
    label:`Graphie « ${grapheme} »`,
    bubbleText:grapheme,
    example:"",
    graphIds:[],
    graphSequences:[],
    spellings:[grapheme]
  };
}

export function getGraphemicTargets(values = []) {
  return normalizeGraphemicEntries(values).map(makeGraphemicTarget).filter(Boolean);
}

export function findGraphemicOccurrences(word, value) {
  const grapheme = normalizeGraphemicEntry(value?.grapheme || value);
  const source = Array.from(String(word || "").normalize("NFC"));
  const folded = source.map((char) => char.toLocaleLowerCase("fr-FR"));
  const needle = Array.from(grapheme);
  if (!needle.length || needle.length > folded.length) return [];

  const occurrences = [];
  for (let start = 0; start <= folded.length - needle.length; start += 1) {
    const matches = needle.every((char, offset) => folded[start + offset] === char);
    if (!matches) continue;
    occurrences.push({
      start,
      end:start + needle.length,
      indexes:Array.from({ length:needle.length }, (_, offset) => start + offset),
      spelling:source.slice(start, start + needle.length).join("")
    });
  }
  return occurrences;
}


export function wordContainsAnyGraphemicEntry(word, values = []) {
  return normalizeGraphemicEntries(values).some((entry) => findGraphemicOccurrences(word, entry).length > 0);
}

export function legacyGraphemicEntriesFromSettings(settings = {}) {
  const ids = Array.isArray(settings?.targetIds)
    ? settings.targetIds
    : [settings?.targetId].filter(Boolean);
  return normalizeGraphemicEntries(ids.map((id) => LEGACY_GRAPHEMIC_TARGETS[String(id || "").trim()]).filter(Boolean));
}

export function inferWordSelectionMode(settings = {}, knownPhonemeIds = null) {
  const explicit = String(settings?.wordSelectionMode || settings?.selectionMode || "").trim();
  if (explicit) return normalizeWordSelectionMode(explicit);
  if (normalizeGraphemicEntries(settings?.graphemicEntries || settings?.graphemes).length) {
    return WORD_SELECTION_MODES.GRAPHEMIC;
  }

  if (knownPhonemeIds instanceof Set) {
    const ids = Array.isArray(settings?.targetIds)
      ? settings.targetIds
      : [settings?.targetId].filter(Boolean);
    const specific = ids.filter((id) => String(id || "") !== "all");
    if (specific.length && specific.every((id) => !knownPhonemeIds.has(String(id || "").trim()))) {
      if (legacyGraphemicEntriesFromSettings(settings).length) return WORD_SELECTION_MODES.GRAPHEMIC;
    }
  }
  return WORD_SELECTION_MODES.PHONEMIC;
}
