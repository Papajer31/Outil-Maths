const ELISION_PREFIXES = new Set(["l", "d", "j", "m", "t", "s", "n", "c", "qu"]);
const ALLOWED_COLORS = new Set(["#d32f2f", "#2e7d32", "#1565c0", "#d49a00"]);

function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isLetterOrNumber(char){
  return /[\p{L}\p{N}]/u.test(char || "");
}

function isApostrophe(char){
  return char === "'" || char === "’";
}

function isHyphen(char){
  return char === "-" || char === "‑" || char === "‐";
}

function readWord(source, startIndex){
  let index = startIndex;
  while (index < source.length) {
    const char = source[index];
    if (isLetterOrNumber(char)) {
      index += 1;
      continue;
    }
    if (isHyphen(char) && index > startIndex && isLetterOrNumber(source[index + 1])) {
      index += 1;
      continue;
    }
    if (isApostrophe(char) && index > startIndex) {
      const prefix = source.slice(startIndex, index).toLocaleLowerCase("fr-FR");
      if (ELISION_PREFIXES.has(prefix)) {
        index += 1;
        break;
      }
      if (isLetterOrNumber(source[index + 1])) {
        index += 1;
        continue;
      }
    }
    break;
  }
  return index;
}

function normalizeFormattingRuns(runs, textLength){
  return (Array.isArray(runs) ? runs : [])
    .map((run) => ({
      start: Math.max(0, Math.min(textLength, Math.trunc(Number(run?.start) || 0))),
      end: Math.max(0, Math.min(textLength, Math.trunc(Number(run?.end) || 0))),
      bold: Boolean(run?.bold),
      italic: Boolean(run?.italic),
      underline: Boolean(run?.underline),
      color: ALLOWED_COLORS.has(String(run?.color || "").trim().toLowerCase())
        ? String(run.color).trim().toLowerCase()
        : ""
    }))
    .filter((run) => run.end > run.start)
    .sort((first, second) => first.start - second.start || first.end - second.end);
}

export function normalizeQuizSelectionIndexes(value, maxTokenCount = Infinity){
  const source = Array.isArray(value) ? value : String(value || "").split(/[;,\.\s]+/g);
  const max = Number.isFinite(maxTokenCount) ? Math.max(0, Math.trunc(maxTokenCount)) : Infinity;
  return Array.from(new Set(source
    .map((item) => Math.trunc(Number(item)))
    .filter((item) => Number.isFinite(item) && item >= 0 && item < max)))
    .sort((a, b) => a - b);
}

export function tokenizeQuizSelectionText(value){
  const source = String(value ?? "");
  const tokens = [];
  let index = 0;
  let wordIndex = 0;

  while (index < source.length) {
    const start = index;
    const char = source[index];
    if (char === "\r" || char === "\n") {
      if (char === "\r" && source[index + 1] === "\n") index += 2;
      else index += 1;
      tokens.push({ kind:"br", text:"", start, end:index, wordIndex:null });
      continue;
    }
    if (/\s/u.test(char)) {
      index += 1;
      while (index < source.length && /\s/u.test(source[index]) && source[index] !== "\r" && source[index] !== "\n") index += 1;
      tokens.push({ kind:"space", text:source.slice(start, index), start, end:index, wordIndex:null });
      continue;
    }
    if (isLetterOrNumber(char)) {
      index = readWord(source, index);
      tokens.push({ kind:"word", text:source.slice(start, index), start, end:index, wordIndex });
      wordIndex += 1;
      continue;
    }
    index += 1;
    tokens.push({ kind:"punct", text:source.slice(start, index), start, end:index, wordIndex:null });
  }

  return tokens;
}

export function getQuizSelectionWordCount(value){
  return tokenizeQuizSelectionText(value).filter((token) => token.kind === "word").length;
}

function styleAtIndex(index, runs){
  const active = runs.filter((run) => index >= run.start && index < run.end);
  if (!active.length) return { bold:false, italic:false, underline:false, color:"" };
  return active.reduce((style, run) => ({
    bold: style.bold || run.bold,
    italic: style.italic || run.italic,
    underline: style.underline || run.underline,
    color: run.color || style.color
  }), { bold:false, italic:false, underline:false, color:"" });
}

function sameStyle(first, second){
  return first.bold === second.bold
    && first.italic === second.italic
    && first.underline === second.underline
    && first.color === second.color;
}

function renderFormattedRange(source, start, end, runs){
  if (end <= start) return "";
  let cursor = start;
  const chunks = [];
  while (cursor < end) {
    const style = styleAtIndex(cursor, runs);
    let next = cursor + 1;
    while (next < end && sameStyle(styleAtIndex(next, runs), style)) next += 1;
    const text = escapeHtml(source.slice(cursor, next));
    const styles = [];
    if (style.bold) styles.push("font-weight:800");
    if (style.italic) styles.push("font-style:italic");
    if (style.underline) styles.push("text-decoration:underline", "text-underline-offset:.12em");
    if (style.color) styles.push(`color:${style.color}`);
    chunks.push(styles.length ? `<span style="${styles.join(";")}">${text}</span>` : text);
    cursor = next;
  }
  return chunks.join("");
}

function computeContinuousClasses(index, activeSet){
  if (!activeSet.has(index)) return "";
  const previous = activeSet.has(index - 1);
  const next = activeSet.has(index + 1);
  return [
    !previous ? "is-group-start" : "",
    previous && next ? "is-group-mid" : "",
    !next ? "is-group-end" : ""
  ].filter(Boolean).join(" ");
}

function findPreviousWord(tokens, tokenIndex){
  for (let index = tokenIndex - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (token.kind === "word") return token.wordIndex;
    if (token.kind !== "space") return null;
  }
  return null;
}

function findNextWord(tokens, tokenIndex){
  for (let index = tokenIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind === "word") return token.wordIndex;
    if (token.kind !== "space") return null;
  }
  return null;
}

export function renderQuizSelectionTextToHtml(value, formatting = [], {
  activeIndexes = [],
  activeKind = "selected",
  interactive = false,
  disabled = false,
  ariaPrefix = "Mot à sélectionner"
} = {}){
  const source = String(value ?? "");
  const tokens = tokenizeQuizSelectionText(source);
  const runs = normalizeFormattingRuns(formatting, source.length);
  const wordCount = tokens.filter((token) => token.kind === "word").length;
  const activeSet = new Set(normalizeQuizSelectionIndexes(activeIndexes, wordCount));
  const classesByKind = {
    selected:"is-selected",
    student:"is-student",
    correction:"is-correction",
    correct:"is-correct"
  };
  const activeClass = classesByKind[activeKind] || classesByKind.selected;

  return tokens.map((token, tokenIndex) => {
    if (token.kind === "br") return '<br class="selection-text-br">';
    if (token.kind === "space") {
      const previousWord = findPreviousWord(tokens, tokenIndex);
      const nextWord = findNextWord(tokens, tokenIndex);
      const bridged = previousWord !== null
        && nextWord !== null
        && activeSet.has(previousWord)
        && activeSet.has(nextWord)
        && nextWord === previousWord + 1;
      const className = bridged ? `selection-text-space is-bridge ${activeClass}` : "";
      return bridged
        ? `<span class="${className}" aria-hidden="true">${escapeHtml(token.text)}</span>`
        : escapeHtml(token.text);
    }
    const content = renderFormattedRange(source, token.start, token.end, runs);
    if (token.kind !== "word") {
      return `<span class="selection-text-token selection-text-token--punct">${content}</span>`;
    }
    const isActive = activeSet.has(token.wordIndex);
    const classNames = [
      "selection-text-token",
      "selection-text-token--word",
      "selection-text-token--continuous",
      isActive ? activeClass : "",
      computeContinuousClasses(token.wordIndex, activeSet)
    ].filter(Boolean).join(" ");
    const dataAttrs = interactive && !disabled
      ? ` role="button" tabindex="0" data-selection-token-index="${token.wordIndex}" aria-pressed="${isActive ? "true" : "false"}" aria-label="${escapeHtml(`${ariaPrefix} ${token.text}`)}"`
      : ` data-selection-token-index="${token.wordIndex}"`;
    return `<span class="${classNames}"${dataAttrs}>${content}</span>`;
  }).join("");
}

function wordList(value){
  return tokenizeQuizSelectionText(value).filter((token) => token.kind === "word").map((token) => token.text);
}

export function findQuizSelectionIndexesFromText(statement, expectedText){
  const words = wordList(statement);
  const groups = String(expectedText || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => wordList(part));
  const used = new Set();
  const indexes = [];
  const normalizedWords = words.map((word) => word.toLocaleLowerCase("fr-FR"));

  groups.forEach((group) => {
    if (!group.length) return;
    const normalizedGroup = group.map((word) => word.toLocaleLowerCase("fr-FR"));
    for (let start = 0; start <= normalizedWords.length - normalizedGroup.length; start += 1) {
      let valid = true;
      for (let offset = 0; offset < normalizedGroup.length; offset += 1) {
        const index = start + offset;
        if (used.has(index) || normalizedWords[index] !== normalizedGroup[offset]) {
          valid = false;
          break;
        }
      }
      if (!valid) continue;
      normalizedGroup.forEach((_, offset) => {
        const index = start + offset;
        used.add(index);
        indexes.push(index);
      });
      break;
    }
  });

  return normalizeQuizSelectionIndexes(indexes, words.length);
}

export function formatQuizSelectionIndexes(statement, indexes = []){
  const words = tokenizeQuizSelectionText(statement).filter((token) => token.kind === "word");
  const safeIndexes = normalizeQuizSelectionIndexes(indexes, words.length);
  if (!safeIndexes.length) return "";
  const groups = [];
  let current = [];
  safeIndexes.forEach((index) => {
    if (!current.length || index === current[current.length - 1] + 1) current.push(index);
    else {
      groups.push(current);
      current = [index];
    }
  });
  if (current.length) groups.push(current);
  return groups
    .map((group) => group.map((index) => words[index]?.text || "").filter(Boolean).join(" "))
    .filter(Boolean)
    .join("; ");
}
