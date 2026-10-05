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

export function countCopyWords(text = ""){
  return tokenizeCopyText(text).filter((token) => token.kind === "word").length;
}

export function tokenizeCopyText(text = ""){
  const source = String(text ?? "");
  const tokens = [];
  const wordPattern = /[\p{L}\p{N}](?:[\p{L}\p{M}\p{N}]|[’'\-](?=[\p{L}\p{N}]))*/gu;
  let cursor = 0;
  let wordIndex = 0;
  let match;

  while ((match = wordPattern.exec(source))) {
    if (match.index > cursor) {
      tokens.push({ kind:"text", text:source.slice(cursor, match.index) });
    }
    tokens.push({ kind:"word", text:match[0], index:wordIndex });
    wordIndex += 1;
    cursor = match.index + match[0].length;
  }

  if (cursor < source.length) {
    tokens.push({ kind:"text", text:source.slice(cursor) });
  }

  return tokens;
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
