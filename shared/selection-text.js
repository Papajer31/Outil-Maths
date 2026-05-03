const MARKERS = new Set(["§", "*", "_", "["]);
const ELISION_PREFIXES = new Set(["l", "d", "j", "m", "t", "s", "n", "c", "qu"]);

function isLetterOrNumber(char) {
  return /[\p{L}\p{N}]/u.test(char || "");
}

function isApostrophe(char) {
  return char === "'" || char === "’";
}

function isHyphen(char) {
  return char === "-" || char === "‑" || char === "‐";
}

function cloneStyles(styles = []) {
  return Array.from(new Set(styles));
}

function findClosingMarker(source, startIndex, marker) {
  const closeMarker = marker === "[" ? "]" : marker;
  const endIndex = source.indexOf(closeMarker, startIndex);
  if (endIndex <= startIndex) return -1;
  const content = source.slice(startIndex, endIndex);
  return content.trim() ? endIndex : -1;
}

function markerStyle(marker) {
  if (marker === "*") return "strong";
  if (marker === "_") return "em";
  if (marker === "[") return "highlight";
  return "";
}

function pushToken(tokens, kind, text, styles = []) {
  if (!text && kind !== "br") return;
  tokens.push({ kind, text, styles: cloneStyles(styles) });
}

function readWord(source, startIndex) {
  let index = startIndex;
  let text = "";

  while (index < source.length) {
    const char = source[index];

    if (isLetterOrNumber(char)) {
      text += char;
      index += 1;
      continue;
    }

    if (isHyphen(char) && text && isLetterOrNumber(source[index + 1])) {
      text += char;
      index += 1;
      continue;
    }

    if (isApostrophe(char) && text) {
      const lowerText = text.toLocaleLowerCase("fr-FR");
      if (ELISION_PREFIXES.has(lowerText)) {
        text += char;
        index += 1;
        break;
      }

      if (isLetterOrNumber(source[index + 1])) {
        text += char;
        index += 1;
        continue;
      }
    }

    break;
  }

  return { text, endIndex: index };
}

function tokenizePlainText(text, styles = []) {
  const tokens = [];
  let index = 0;

  while (index < text.length) {
    const char = text[index];

    if (char === "\n" || char === "\r") {
      pushToken(tokens, "br", "", styles);
      index += 1;
      continue;
    }

    if (/\s/u.test(char)) {
      let endIndex = index + 1;
      while (endIndex < text.length && /\s/u.test(text[endIndex]) && text[endIndex] !== "\n" && text[endIndex] !== "\r") {
        endIndex += 1;
      }
      pushToken(tokens, "space", text.slice(index, endIndex), styles);
      index = endIndex;
      continue;
    }

    if (isLetterOrNumber(char)) {
      const word = readWord(text, index);
      pushToken(tokens, "word", word.text, styles);
      index = word.endIndex;
      continue;
    }

    pushToken(tokens, "punct", char, styles);
    index += 1;
  }

  return tokens;
}

function parseMarkupRange(source, startIndex = 0, endIndex = source.length, styles = []) {
  const tokens = [];
  let index = startIndex;
  let buffer = "";

  const flushBuffer = () => {
    if (!buffer) return;
    tokens.push(...tokenizePlainText(buffer, styles));
    buffer = "";
  };

  while (index < endIndex) {
    const char = source[index];

    if (char === "§") {
      flushBuffer();
      pushToken(tokens, "br", "", styles);
      index += 1;
      continue;
    }

    if (MARKERS.has(char)) {
      const closeIndex = findClosingMarker(source, index + 1, char);
      const style = markerStyle(char);
      if (closeIndex > -1 && style) {
        flushBuffer();
        tokens.push(...parseMarkupRange(source, index + 1, closeIndex, [...styles, style]));
        index = closeIndex + 1;
        continue;
      }
    }

    buffer += char;
    index += 1;
  }

  flushBuffer();
  return tokens;
}

export function tokenizeSelectionText(value) {
  const tokens = parseMarkupRange(String(value ?? ""));
  let wordIndex = 0;
  return tokens.map((token) => {
    if (token.kind !== "word") return { ...token, wordIndex: null };
    const next = { ...token, wordIndex };
    wordIndex += 1;
    return next;
  });
}

export function getWordTokens(valueOrTokens) {
  const tokens = Array.isArray(valueOrTokens) ? valueOrTokens : tokenizeSelectionText(valueOrTokens);
  return tokens.filter((token) => token.kind === "word");
}

export function normalizeSelectionMode(value) {
  return String(value ?? "").trim().toLowerCase() === "continuous" ? "continuous" : "disjoint";
}

export function normalizeTokenIndexes(value, maxTokenCount = Infinity) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[;,.\s]+/g);
  const max = Number.isFinite(maxTokenCount) ? Math.max(0, Math.trunc(maxTokenCount)) : Infinity;
  return Array.from(new Set(source
    .map((item) => Math.trunc(Number(item)))
    .filter((item) => Number.isFinite(item) && item >= 0 && item < max)))
    .sort((a, b) => a - b);
}

function splitExpectedSelectionText(value) {
  const text = String(value || "").trim();
  if (!text) return [];
  if (text.includes(";")) {
    return text.split(";").map((part) => part.trim()).filter(Boolean);
  }
  return [text];
}

function wordTextList(value) {
  return getWordTokens(value).map((token) => token.text);
}

function findSequence(haystack, needle, usedIndexes = new Set()) {
  if (!needle.length || needle.length > haystack.length) return [];

  const normalizedHaystack = haystack.map((item) => item.toLocaleLowerCase("fr-FR"));
  const normalizedNeedle = needle.map((item) => item.toLocaleLowerCase("fr-FR"));

  for (let start = 0; start <= normalizedHaystack.length - normalizedNeedle.length; start += 1) {
    let ok = true;
    for (let offset = 0; offset < normalizedNeedle.length; offset += 1) {
      const index = start + offset;
      if (usedIndexes.has(index) || normalizedHaystack[index] !== normalizedNeedle[offset]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      return normalizedNeedle.map((_, offset) => start + offset);
    }
  }

  return [];
}

export function findTokenIndexesFromSelectionText(statement, expectedText) {
  const words = wordTextList(statement);
  const parts = splitExpectedSelectionText(expectedText);
  const used = new Set();
  const indexes = [];

  parts.forEach((part) => {
    const needle = wordTextList(part);
    const match = findSequence(words, needle, used);
    match.forEach((index) => {
      used.add(index);
      indexes.push(index);
    });
  });

  return normalizeTokenIndexes(indexes, words.length);
}

export function formatSelectionIndexes(statement, indexes = []) {
  const words = getWordTokens(statement);
  const safeIndexes = normalizeTokenIndexes(indexes, words.length);
  if (!safeIndexes.length) return "";

  const groups = [];
  let current = [];
  safeIndexes.forEach((index) => {
    if (!current.length || index === current[current.length - 1] + 1) {
      current.push(index);
    } else {
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

export function escapeSelectionHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function tokenStyleClasses(token) {
  const styles = new Set(token?.styles || []);
  return [
    styles.has("strong") ? "is-mark-strong" : "",
    styles.has("em") ? "is-mark-em" : "",
    styles.has("highlight") ? "is-mark-highlight" : ""
  ].filter(Boolean).join(" ");
}

function computeContinuousClasses(index, activeSet) {
  if (!activeSet.has(index)) return "";
  const previous = activeSet.has(index - 1);
  const next = activeSet.has(index + 1);
  return [
    !previous ? "is-group-start" : "",
    previous && next ? "is-group-mid" : "",
    !next ? "is-group-end" : ""
  ].filter(Boolean).join(" ");
}

export function renderSelectionTextToHtml(value, {
  activeIndexes = [],
  activeKind = "selected",
  selectionMode = "disjoint",
  interactive = false,
  disabled = false,
  ariaPrefix = "Mot"
} = {}) {
  const mode = normalizeSelectionMode(selectionMode);
  const tokens = tokenizeSelectionText(value);
  const wordCount = tokens.filter((token) => token.kind === "word").length;
  const activeSet = new Set(normalizeTokenIndexes(activeIndexes, wordCount));
  const classesByKind = {
    selected: "is-selected",
    student: "is-student",
    correction: "is-correction",
    correct: "is-correct"
  };
  const activeClass = classesByKind[activeKind] || classesByKind.selected;

  return tokens.map((token, tokenIndex) => {
    if (token.kind === "br") return '<br class="selection-text-br">';

    if (token.kind === "space") {
      if (mode === "continuous") {
        const previousWord = findPreviousWord(tokens, tokenIndex);
        const nextWord = findNextWord(tokens, tokenIndex);
        if (previousWord !== null && nextWord !== null && activeSet.has(previousWord) && activeSet.has(nextWord) && nextWord === previousWord + 1) {
          return `<span class="selection-text-space is-bridge ${activeClass}" aria-hidden="true">${escapeSelectionHtml(token.text)}</span>`;
        }
      }
      return escapeSelectionHtml(token.text);
    }

    if (token.kind !== "word") {
      return `<span class="selection-text-token selection-text-token--punct ${tokenStyleClasses(token)}">${escapeSelectionHtml(token.text)}</span>`;
    }

    const isActive = activeSet.has(token.wordIndex);
    const classNames = [
      "selection-text-token",
      "selection-text-token--word",
      mode === "continuous" ? "selection-text-token--continuous" : "selection-text-token--disjoint",
      tokenStyleClasses(token),
      isActive ? activeClass : "",
      mode === "continuous" ? computeContinuousClasses(token.wordIndex, activeSet) : ""
    ].filter(Boolean).join(" ");
    const dataAttrs = interactive && !disabled
      ? ` role="button" tabindex="0" data-selection-token-index="${token.wordIndex}" aria-pressed="${isActive ? "true" : "false"}" aria-label="${escapeSelectionHtml(`${ariaPrefix} ${token.text}`)}"`
      : ` data-selection-token-index="${token.wordIndex}"`;

    return `<span class="${classNames}"${dataAttrs}>${escapeSelectionHtml(token.text)}</span>`;
  }).join("");
}

function findPreviousWord(tokens, tokenIndex) {
  for (let index = tokenIndex - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (token.kind === "word") return token.wordIndex;
    if (token.kind !== "space") return null;
  }
  return null;
}

function findNextWord(tokens, tokenIndex) {
  for (let index = tokenIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind === "word") return token.wordIndex;
    if (token.kind !== "space") return null;
  }
  return null;
}
