import {
  PHONOLOGY_GRAPH_BY_ID,
  PHONOLOGY_GRAPH_UNITS,
  PHONOLOGY_GRAPH_IDS_BY_SURFACE
} from "./phonology-graph-data.js";

const GRAPH_BY_ID = PHONOLOGY_GRAPH_BY_ID;

const LEGACY_CODE_HINTS = Object.freeze({
  s1: "s_s",
  s2: "s_z",
  c1: "c_k",
  c2: "c_s",
  g1: "g_g",
  g2: "g_j",
  y_y: "y_yod",
  y_ii: "oy ou ay selon le mot",
  c_cedille: "ç",
  o_circonflexe: "o=ô"
});

const ENCODING_COMPOSITION_DECOMPOSITIONS = Object.freeze({
  es_cons: "e_ouvert/s_s",
  el_cons: "e_ouvert/l",
  ef_cons: "e_ouvert/f",
  ec_cons: "e_ouvert/c_k",
  er_cons: "e_ouvert/r",
  ette: "e_ouvert/tt/*e",
  esse: "e_ouvert/ss/*e",
  elle: "e_ouvert/ll/*e",
  erre: "e_ouvert/rr/*e",
  enne: "e_ouvert/nn/*e"
});

function normalizeUnicode(value){
  return String(value || "").normalize("NFC");
}

function normalizeSlug(value){
  // Le slug est un identifiant lexical, pas un slug de fichier.
  // On conserve donc les diacritiques : « cache » et « caché » doivent
  // pouvoir coexister dans phonology_words.
  return normalizeUnicode(value)
    .toLocaleLowerCase("fr-FR")
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function getGraphFromToken(rawToken){
  const token = normalizeUnicode(rawToken).trim();
  if (!token) return null;

  if (GRAPH_BY_ID.has(token)) {
    const graph = GRAPH_BY_ID.get(token);
    return {
      graph: token,
      text: String(graph?.label || token),
      resolvedFromSurface: false
    };
  }

  const matchingIds = (PHONOLOGY_GRAPH_IDS_BY_SURFACE.get(token) || [])
    .filter((graphId) => graphId !== "__silent__");
  if (matchingIds.length !== 1) return null;

  return {
    graph: matchingIds[0],
    text: token,
    resolvedFromSurface: true
  };
}

function getInvalidGraphIssue(graphToken, lineNumber, sourceLine){
  const token = normalizeUnicode(graphToken).trim();
  const legacyHint = LEGACY_CODE_HINTS[token];
  if (legacyHint) {
    return createIssue({
      line: lineNumber,
      code: "legacy_graph_code",
      message: `Le code ancien « ${token} » est interdit. Utilise « ${legacyHint} ».`,
      source: sourceLine
    });
  }

  const decomposition = ENCODING_COMPOSITION_DECOMPOSITIONS[token];
  if (decomposition) {
    return createIssue({
      line: lineNumber,
      code: "encoding_composition_in_phonology",
      message: `« ${token} » est une composition d’encodage, pas une unité phonologique fine. Écris plutôt « ${decomposition} ».`,
      source: sourceLine
    });
  }

  const choices = (PHONOLOGY_GRAPH_IDS_BY_SURFACE.get(token) || [])
    .filter((graphId) => graphId !== "__silent__");
  if (choices.length > 1) {
    return createIssue({
      line: lineNumber,
      code: "ambiguous_graph",
      message: `La graphie « ${token} » est ambiguë. Précise l’un des codes suivants : ${choices.join(", ")}.`,
      source: sourceLine
    });
  }

  return createIssue({
    line: lineNumber,
    code: "unknown_graph",
    message: `Graphème ou code inconnu : « ${token} ».`,
    source: sourceLine
  });
}

function splitSourceToken(sourceToken){
  const isSilent = sourceToken.startsWith("*");
  const body = sourceToken.replace(/^\*+/, "").trim();
  const separatorIndex = body.indexOf("=");

  if (separatorIndex < 0) {
    return { isSilent, graphToken: body, explicitText: "", isValid: Boolean(body) };
  }

  if (separatorIndex !== body.lastIndexOf("=")) {
    return { isSilent, graphToken: "", explicitText: "", isValid: false };
  }

  const graphToken = body.slice(0, separatorIndex).trim();
  const explicitText = normalizeUnicode(body.slice(separatorIndex + 1).trim());
  return {
    isSilent,
    graphToken,
    explicitText,
    isValid: Boolean(graphToken && explicitText)
  };
}

function getSurfaceCandidates(rawToken, resolved, explicitText = ""){
  const candidates = [];
  const push = (value) => {
    const safe = normalizeUnicode(value);
    if (safe && !candidates.includes(safe)) candidates.push(safe);
  };

  if (explicitText) {
    push(explicitText);
  } else {
    push(resolved?.text);
    push(rawToken);
    const graph = GRAPH_BY_ID.get(resolved?.graph);
    push(graph?.label);
    for (const variant of graph?.variants || []) push(variant);
  }

  for (const candidate of [...candidates]) {
    if (candidate.includes("œ")) push(candidate.replace(/œ/g, "oe"));
    if (candidate.includes("oe")) push(candidate.replace(/oe/g, "œ"));
  }

  return candidates.sort((left, right) => right.length - left.length);
}

function findSurfaceAt(word, cursor, candidates){
  for (const candidate of candidates) {
    if (word.startsWith(candidate, cursor)) return candidate;
  }
  return "";
}

function createIssue({ line, code, message, source = "", severity = "error" }){
  return { line, code, message, source, severity };
}

function splitOptionalPrefix(rawValue){
  const value = normalizeUnicode(rawValue).trim();
  if (!value.startsWith("(")) {
    return { prefix: "", word: value, isValid: true };
  }

  const closeIndex = value.indexOf(")");
  if (closeIndex <= 1) {
    return { prefix: "", word: value, isValid: false };
  }

  const prefix = normalizeUnicode(value.slice(1, closeIndex).trim());
  const word = normalizeUnicode(value.slice(closeIndex + 1).trim());
  const hasNestedParenthesis = prefix.includes("(") || prefix.includes(")");
  return {
    prefix,
    word,
    isValid: Boolean(prefix && word && !hasNestedParenthesis)
  };
}

function parseWordLine(sourceLine, lineNumber){
  const columns = sourceLine.split("|");
  if (columns.length < 2 || columns.length > 4 || columns.some((column, index) => index < 2 && !column.trim())) {
    return {
      row: null,
      issues: [createIssue({
        line: lineNumber,
        code: "invalid_line",
        message: "La ligne doit utiliser le format mot|u/n/i/t/é/s|sy/lla/ba/tion|familiarite (syllabation et familiarité restent tolérées comme absentes pour les anciennes banques).",
        source: sourceLine
      })]
    };
  }

  const displayWordSource = normalizeUnicode(columns[0].trim());
  const unitsSource = normalizeUnicode(columns[1].trim());
  const hasSyllabationColumn = columns.length >= 3;
  const syllablesSource = hasSyllabationColumn ? normalizeUnicode(columns[2].trim()) : "";
  const hasFamiliarityColumn = columns.length === 4;
  const familiaritySource = hasFamiliarityColumn ? normalizeUnicode(columns[3].trim()) : "";
  const issues = [];
  const warnings = [];
  const parsedDisplay = splitOptionalPrefix(displayWordSource);
  const prefix = parsedDisplay.prefix;
  const word = parsedDisplay.word;

  if (!parsedDisplay.isValid) {
    issues.push(createIssue({
      line: lineNumber,
      code: "invalid_prefix",
      message: "Le préfixe optionnel doit utiliser le format « (texte) mot », par exemple « (un) abricot ».",
      source: sourceLine
    }));
  }

  if (!word) {
    issues.push(createIssue({ line: lineNumber, code: "missing_word", message: "Le mot est vide.", source: sourceLine }));
  }

  let familiarity = 50;
  if (hasFamiliarityColumn) {
    if (!/^\d{1,3}$/.test(familiaritySource)) {
      issues.push(createIssue({
        line: lineNumber,
        code: "invalid_familiarity",
        message: "La familiarité doit être un entier compris entre 0 et 100.",
        source: sourceLine
      }));
    } else {
      familiarity = Number(familiaritySource);
      if (!Number.isInteger(familiarity) || familiarity < 0 || familiarity > 100) {
        issues.push(createIssue({
          line: lineNumber,
          code: "invalid_familiarity",
          message: "La familiarité doit être un entier compris entre 0 et 100.",
          source: sourceLine
        }));
      }
    }
  }

  const syllables = [];
  if (hasSyllabationColumn) {
    if (!syllablesSource) {
      issues.push(createIssue({
        line: lineNumber,
        code: "missing_syllabation",
        message: "La troisième colonne de syllabation est vide.",
        source: sourceLine
      }));
    } else {
      const syllableTokens = syllablesSource.split("/").map((token) => normalizeUnicode(token.trim()));
      if (syllableTokens.some((token) => !token)) {
        issues.push(createIssue({
          line: lineNumber,
          code: "empty_syllable",
          message: "La syllabation contient une syllabe vide.",
          source: sourceLine
        }));
      } else if (syllableTokens.join("") !== word) {
        issues.push(createIssue({
          line: lineNumber,
          code: "syllabation_word_mismatch",
          message: `La syllabation « ${syllablesSource} » ne reconstitue pas exactement le mot « ${word} ».`,
          source: sourceLine
        }));
      } else {
        syllables.push(...syllableTokens);
      }
    }
  }

  const slug = normalizeSlug(word);
  if (!slug) {
    issues.push(createIssue({ line: lineNumber, code: "invalid_slug", message: "Impossible de produire un identifiant pour ce mot.", source: sourceLine }));
  }

  const tokens = unitsSource.split("/").map((token) => token.trim());
  if (!tokens.length || tokens.some((token) => !token)) {
    issues.push(createIssue({
      line: lineNumber,
      code: "empty_unit",
      message: "La segmentation contient une unité vide.",
      source: sourceLine
    }));
  }

  let cursor = 0;
  const units = [];

  for (const sourceToken of tokens) {
    if (!sourceToken) continue;
    const parsedToken = splitSourceToken(sourceToken);
    if (!parsedToken.isValid) {
      issues.push(createIssue({
        line: lineNumber,
        code: "invalid_unit_override",
        message: sourceToken.includes("=")
          ? `L’unité « ${sourceToken} » doit utiliser le format code=graphie, par exemple « a=â ».`
          : "Une unité muette ne contient aucune lettre.",
        source: sourceLine
      }));
      break;
    }

    const { isSilent, graphToken, explicitText } = parsedToken;

    if (isSilent) {
      const silentText = explicitText || graphToken;
      const surface = findSurfaceAt(word, cursor, [silentText]);
      if (!surface) {
        const remaining = word.slice(cursor) || "fin du mot";
        issues.push(createIssue({
          line: lineNumber,
          code: "word_mismatch",
          message: `L’unité muette « ${sourceToken} » ne correspond pas à « ${remaining} » dans le mot.`,
          source: sourceLine
        }));
        break;
      }

      units.push({ graph: "__silent__", text: surface, isSilent: true });
      cursor += surface.length;
      continue;
    }

    const forbiddenDecomposition = ENCODING_COMPOSITION_DECOMPOSITIONS[graphToken];
    const resolved = forbiddenDecomposition ? null : getGraphFromToken(graphToken);
    if (!resolved || !GRAPH_BY_ID.has(resolved.graph)) {
      issues.push(getInvalidGraphIssue(graphToken, lineNumber, sourceLine));
      break;
    }

    if (explicitText) {
      const declaredVariants = Array.isArray(GRAPH_BY_ID.get(resolved.graph)?.variants)
        ? GRAPH_BY_ID.get(resolved.graph).variants
        : [];
      if (!declaredVariants.includes(explicitText)) {
        issues.push(createIssue({
          line: lineNumber,
          code: "invalid_graph_override",
          message: `La graphie explicite « ${explicitText} » n’est pas déclarée pour le code « ${resolved.graph} ».`,
          source: sourceLine
        }));
        break;
      }
    }

    const surface = findSurfaceAt(word, cursor, getSurfaceCandidates(graphToken, resolved, explicitText));
    if (!surface) {
      const remaining = word.slice(cursor) || "fin du mot";
      issues.push(createIssue({
        line: lineNumber,
        code: "word_mismatch",
        message: `L’unité « ${sourceToken} » ne correspond pas à « ${remaining} » dans le mot.`,
        source: sourceLine
      }));
      break;
    }

    units.push({
      graph: resolved.graph,
      text: surface,
      isSilent: false
    });
    cursor += surface.length;
  }

  if (cursor !== word.length && issues.length === 0) {
    issues.push(createIssue({
      line: lineNumber,
      code: "incomplete_word",
      message: `La segmentation s’arrête avant « ${word.slice(cursor)} ».`,
      source: sourceLine
    }));
  }

  for (let index = 0; index < units.length - 1; index += 1) {
    const current = units[index];
    const next = units[index + 1];
    const currentText = normalizeUnicode(current?.text).toLocaleLowerCase("fr-FR");
    const nextText = normalizeUnicode(next?.text).toLocaleLowerCase("fr-FR");
    const isRepeatedSingleLetter = Array.from(currentText).length === 1
      && currentText === nextText
      && /^\p{L}$/u.test(currentText);

    if (current?.isSilent !== true && next?.isSilent === true && isRepeatedSingleLetter) {
      warnings.push(createIssue({
        line: lineNumber,
        code: "split_double_consonant",
        severity: "warning",
        message: `Les lettres « ${current.text}${next.text} » sont séparées en une lettre sonore et une lettre muette. Regroupe-les dans une seule unité, par exemple « ${current.text}${next.text} ».`,
        source: sourceLine
      }));
    }
  }

  return {
    row: issues.length ? null : {
      slug,
      word,
      prefix,
      units,
      syllables,
      familiarity,
      hasFamiliarity: hasFamiliarityColumn,
      is_active: true,
      sourceLine: lineNumber
    },
    issues,
    warnings
  };
}

function buildCoverage(rows){
  const wordSetsByGraph = new Map();
  for (const row of rows) {
    for (const unit of row.units) {
      if (unit.isSilent) continue;
      if (!wordSetsByGraph.has(unit.graph)) wordSetsByGraph.set(unit.graph, new Set());
      wordSetsByGraph.get(unit.graph).add(row.slug);
    }
  }

  return [...wordSetsByGraph.entries()]
    .map(([graph, slugs]) => ({
      graph,
      label: String(GRAPH_BY_ID.get(graph)?.label || graph),
      wordCount: slugs.size
    }))
    .sort((left, right) => right.wordCount - left.wordCount || left.graph.localeCompare(right.graph, "fr"));
}

export function parsePhonologyWordsText(source){
  const text = normalizeUnicode(source).replace(/^\uFEFF/, "");
  const rows = [];
  const issues = [];
  const structuralWarnings = [];
  const sourceLines = text.split(/\r?\n/);

  sourceLines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return;
    const parsed = parseWordLine(line, index + 1);
    issues.push(...parsed.issues);
    structuralWarnings.push(...(parsed.warnings || []));
    if (parsed.row) rows.push(parsed.row);
  });

  const firstLineBySlug = new Map();
  const duplicateSlugs = new Set();
  rows.forEach((row) => {
    const existingLine = firstLineBySlug.get(row.slug);
    if (existingLine) {
      duplicateSlugs.add(row.slug);
      issues.push(createIssue({
        line: row.sourceLine || 0,
        code: "duplicate_slug",
        message: `Le mot « ${row.word} » produit le même identifiant qu’une ligne précédente (ligne ${existingLine}).`,
        source: row.word
      }));
      return;
    }
    firstLineBySlug.set(row.slug, row.sourceLine || 0);
  });

  const uniqueRows = rows
    .filter((row) => !duplicateSlugs.has(row.slug))
    .map(({ sourceLine, ...row }) => row);
  const coverage = buildCoverage(uniqueRows);
  const allGraphIds = new Set(uniqueRows.flatMap((row) => row.units.map((unit) => unit.graph)));
  const coverageWarnings = coverage
    .filter((entry) => entry.wordCount < 6)
    .map((entry) => createIssue({
      line: 0,
      code: "low_coverage",
      severity: "warning",
      message: `Seulement ${entry.wordCount} mot${entry.wordCount > 1 ? "s" : ""} pour « ${entry.label} » (${entry.graph}).`
    }));
  const missingSyllabationCount = uniqueRows.filter((row) => !Array.isArray(row.syllables) || row.syllables.length === 0).length;
  const syllabationWarnings = missingSyllabationCount > 0
    ? [createIssue({
        line: 0,
        code: "missing_syllabation_rows",
        severity: "warning",
        message: `${missingSyllabationCount} mot${missingSyllabationCount > 1 ? "s n’ont" : " n’a"} pas de syllabation. Le format historique reste accepté.`
      })]
    : [];
  const missingFamiliarityCount = uniqueRows.filter((row) => row.hasFamiliarity !== true).length;
  const familiarityWarnings = missingFamiliarityCount > 0
    ? [createIssue({
        line: 0,
        code: "missing_familiarity_rows",
        severity: "warning",
        message: `${missingFamiliarityCount} mot${missingFamiliarityCount > 1 ? "s n’ont" : " n’a"} pas de familiarité lexicale explicite. La valeur neutre 50 sera utilisée.`
      })]
    : [];
  const cleanRows = uniqueRows.map(({ hasFamiliarity, ...row }) => row);
  const warnings = [...structuralWarnings, ...coverageWarnings, ...syllabationWarnings, ...familiarityWarnings];

  if (!uniqueRows.length && !issues.length) {
    issues.push(createIssue({
      line: 0,
      code: "empty_source",
      message: "Le fichier ne contient aucun mot exploitable."
    }));
  }

  return {
    rows: cleanRows,
    issues,
    warnings,
    coverage,
    stats: {
      wordCount: uniqueRows.length,
      syllabifiedWordCount: uniqueRows.length - missingSyllabationCount,
      familiarityWordCount: uniqueRows.length - missingFamiliarityCount,
      syllableCount: uniqueRows.reduce((total, row) => total + (Array.isArray(row.syllables) ? row.syllables.length : 0), 0),
      graphCount: allGraphIds.size,
      unitCount: uniqueRows.reduce((total, row) => total + row.units.length, 0),
      errorCount: issues.length,
      warningCount: warnings.length
    },
    isValid: issues.length === 0 && uniqueRows.length > 0
  };
}

function escapeSqlText(value){
  return String(value || "").replace(/'/g, "''");
}

export function buildPhonologyWordsSeedSql(rows, {
  deactivateMissing = true,
  replaceAll = false
} = {}){
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length) throw new Error("Aucun mot à exporter.");

  const values = safeRows.map((row) => {
    const units = JSON.stringify(row.units);
    const syllables = JSON.stringify(Array.isArray(row.syllables) ? row.syllables : []);
    const familiarity = Number.isFinite(Number(row.familiarity))
      ? Math.max(0, Math.min(100, Math.round(Number(row.familiarity))))
      : 50;
    return `  ('${escapeSqlText(row.slug)}', '${escapeSqlText(row.word)}', '${escapeSqlText(row.prefix || "")}', '${escapeSqlText(units)}'::jsonb, '${escapeSqlText(syllables)}'::jsonb, ${familiarity}, true, now())`;
  }).join(",\n");

  const slugs = safeRows.map((row) => `'${escapeSqlText(row.slug)}'`).join(", ");
  const replaceSql = replaceAll
    ? "delete from public.phonology_words where slug is not null;\n\n"
    : "";
  const deactivateSql = !replaceAll && deactivateMissing
    ? `\n\nupdate public.phonology_words\nset is_active = false, updated_at = now()\nwhere slug not in (${slugs});`
    : "";

  return `-- Seed générée automatiquement depuis la banque phonologique.\nbegin;\n\n${replaceSql}insert into public.phonology_words (slug, word, prefix, units, syllables, familiarity, is_active, updated_at)\nvalues\n${values}\non conflict (slug) do update\nset\n  word = excluded.word,\n  prefix = excluded.prefix,\n  units = excluded.units,\n  syllables = excluded.syllables,\n  familiarity = excluded.familiarity,\n  is_active = true,\n  updated_at = now();${deactivateSql}\n\ncommit;\n`;
}

export function getPhonologyGraphLabel(graphId){
  return String(GRAPH_BY_ID.get(String(graphId || ""))?.label || graphId || "");
}

export function getAllowedPhonologyGraphCodes(){
  return PHONOLOGY_GRAPH_UNITS.map((unit) => String(unit.id));
}
