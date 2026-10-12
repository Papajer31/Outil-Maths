export const TIMER_MODES = Object.freeze({
  LIMITED:"limited",
  UNLIMITED:"unlimited"
});

const TIMER_MODE_VALUES = new Set(Object.values(TIMER_MODES));

export function getDefaultSettings(){
  return {
    text:"",
    copyTimeMode:TIMER_MODES.LIMITED,
    copyTimeMinutes:10,
    verificationTimeMode:TIMER_MODES.LIMITED,
    verificationTimeMinutes:2
  };
}

export function normalizeSettings(settings = {}){
  const safe = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  return {
    ...getDefaultSettings(),
    ...safe,
    text:String(safe.text ?? "").replace(/\r\n?/g, "\n").slice(0, 12000),
    copyTimeMode:normalizeTimerMode(safe.copyTimeMode ?? safe.copy_time_mode, TIMER_MODES.LIMITED),
    copyTimeMinutes:clampInt(safe.copyTimeMinutes ?? safe.copy_time_minutes, 1, 60, 10),
    verificationTimeMode:normalizeTimerMode(safe.verificationTimeMode ?? safe.verification_time_mode, TIMER_MODES.LIMITED),
    verificationTimeMinutes:clampInt(safe.verificationTimeMinutes ?? safe.verification_time_minutes, 1, 30, 2)
  };
}

const ELIDED_WORD_PREFIXES = new Set([
  "l", "d", "j", "m", "t", "s", "n", "c", "qu",
  "jusqu", "lorsqu", "puisqu", "quoiqu"
]);

export function countCopyWords(text = ""){
  return tokenizeCopyText(text)
    .filter((token) => token.kind === "word")
    .reduce((total, token) => total + Math.max(1, Number(token.wordCount) || 1), 0);
}

export function getCopyWordCountThroughTokenIndex(text = "", tokenIndex){
  const safeIndex = Math.trunc(Number(tokenIndex));
  if (!Number.isInteger(safeIndex) || safeIndex < 0) return null;
  const token = tokenizeCopyText(text).find((entry) => entry.kind === "word" && entry.index === safeIndex);
  return token && Number.isInteger(token.wordNumberEnd) ? token.wordNumberEnd : null;
}

export function getCopyWordTokenByIndex(text = "", tokenIndex){
  const safeIndex = Math.trunc(Number(tokenIndex));
  if (!Number.isInteger(safeIndex) || safeIndex < 0) return null;
  return tokenizeCopyText(text).find((entry) => entry.kind === "word" && entry.index === safeIndex) || null;
}

export function tokenizeCopyText(text = ""){
  const source = String(text ?? "");
  const tokens = [];
  const wordPattern = /[\p{L}\p{N}](?:[\p{L}\p{M}\p{N}]|[’'\-](?=[\p{L}\p{N}]))*/gu;
  let cursor = 0;
  let wordIndex = 0;
  let pedagogicalWordCount = 0;
  let match;

  const pushClickableWord = (wordText) => {
    pedagogicalWordCount += 1;
    tokens.push({
      kind:"word",
      text:wordText,
      index:wordIndex,
      wordCount:1,
      wordNumberStart:pedagogicalWordCount,
      wordNumberEnd:pedagogicalWordCount
    });
    wordIndex += 1;
  };

  while ((match = wordPattern.exec(source))) {
    if (match.index > cursor) {
      tokens.push({ kind:"text", text:source.slice(cursor, match.index) });
    }

    // Les élisions grammaticales doivent être deux mots réellement cliquables :
    // « l'habitude » => « l' » + « habitude », « qu'il » => « qu' » + « il ».
    // Les apostrophes lexicalisées (aujourd'hui, quelqu'un…) restent un seul mot.
    for (const part of splitClickablePedagogicalWords(match[0])) {
      pushClickableWord(part);
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < source.length) {
    tokens.push({ kind:"text", text:source.slice(cursor) });
  }

  return tokens;
}

function splitClickablePedagogicalWords(value){
  const token = String(value || "");
  const apostropheIndex = token.search(/[’']/u);
  if (apostropheIndex <= 0 || apostropheIndex >= token.length - 1) return [token];

  const prefix = token.slice(0, apostropheIndex).toLocaleLowerCase("fr-FR");
  if (!ELIDED_WORD_PREFIXES.has(prefix)) return [token];

  const elided = token.slice(0, apostropheIndex + 1);
  const remainder = token.slice(apostropheIndex + 1);
  return [elided, ...splitClickablePedagogicalWords(remainder)];
}

function normalizeTimerMode(value, fallback){
  const safe = String(value || "").trim().toLowerCase();
  return TIMER_MODE_VALUES.has(safe) ? safe : fallback;
}

function clampInt(value, min, max, fallback){
  const numeric = Math.trunc(Number(value));
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}
