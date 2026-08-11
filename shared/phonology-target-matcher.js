import { PHONOLOGY_GRAPH_BY_ID } from "./phonology-graph-data.js";

export function findPhonologyTargetOccurrences(units, target) {
  const occurrences = [];
  const graphIds = new Set(Array.isArray(target?.graphIds) ? target.graphIds : []);
  const safeUnits = Array.isArray(units) ? units : [];

  safeUnits.forEach((unit, index) => {
    if (unit?.isSilent === true || !graphIds.has(String(unit?.graph || ""))) return;
    const spelling = normalizePhonologySpelling(getPhonologyUnitSurfaceText(unit));
    if (spelling) occurrences.push({ indexes:[index], spelling });
  });

  for (const sequence of Array.isArray(target?.graphSequences) ? target.graphSequences : []) {
    if (!Array.isArray(sequence) || !sequence.length) continue;
    for (let start = 0; start <= safeUnits.length - sequence.length; start += 1) {
      const matches = sequence.every((graphId, offset) => {
        const unit = safeUnits[start + offset];
        return unit?.isSilent !== true && String(unit?.graph || "") === graphId;
      });
      if (!matches) continue;

      const indexes = sequence.map((_, offset) => start + offset);
      const baseSpelling = normalizePhonologySpelling(
        indexes.map((index) => getPhonologyUnitSurfaceText(safeUnits[index])).join("")
      );
      if (!baseSpelling) continue;

      const spelling = resolveSequenceSpelling(
        baseSpelling,
        safeUnits,
        start + sequence.length,
        target?.spellings
      );
      if (spelling) occurrences.push({ indexes, spelling });
    }
  }

  return dedupeOccurrences(occurrences);
}

export function getPhonologyUnitSurfaceText(unit) {
  const explicit = String(unit?.text || "").trim().normalize("NFC");
  if (explicit) return explicit;
  return String(PHONOLOGY_GRAPH_BY_ID.get(String(unit?.graph || ""))?.label || "")
    .trim()
    .normalize("NFC");
}

export function normalizePhonologySpelling(value) {
  return String(value || "")
    .trim()
    .normalize("NFC")
    .toLocaleLowerCase("fr-FR");
}

function resolveSequenceSpelling(baseSpelling, units, nextIndex, targetSpellings) {
  const accepted = new Set((Array.isArray(targetSpellings) ? targetSpellings : [])
    .map(normalizePhonologySpelling)
    .filter(Boolean));

  // On privilégie la graphie déclarée la plus longue. Ainsi u + e + *t
  // est classé « uet » si « ue » et « uet » sont tous deux disponibles.
  const candidates = [baseSpelling];
  let suffix = "";
  for (let index = nextIndex; index < units.length; index += 1) {
    const unit = units[index];
    if (unit?.isSilent !== true) break;
    suffix += getPhonologyUnitSurfaceText(unit);
    candidates.push(normalizePhonologySpelling(`${baseSpelling}${suffix}`));
  }

  const acceptedCandidates = candidates.filter((candidate) => accepted.has(candidate));
  if (acceptedCandidates.length) {
    return acceptedCandidates.sort((a, b) => Array.from(b).length - Array.from(a).length)[0];
  }
  return baseSpelling;
}

function dedupeOccurrences(occurrences) {
  const seen = new Set();
  return occurrences.filter((occurrence) => {
    const key = `${occurrence.indexes.join(",")}::${occurrence.spelling}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
