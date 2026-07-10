const DEFAULT_FLASH_DISPLAY_MS = 1000;
const FLASH_DISPLAY_MS_MIN = 100;
const FLASH_DISPLAY_MS_MAX = 10000;
const DEFAULT_FLASH_PREPARATION_SECONDS = 5;
const FLASH_PREPARATION_SECONDS_MIN = 1;
const FLASH_PREPARATION_SECONDS_MAX = 10;
const DEFAULT_FLASH_ANSWER_APPEARANCE = "after_question";
const FLASH_ANSWER_APPEARANCES = new Set(["direct", "after_question"]);
const DEFAULT_FLASH_ALLOW_REPLAY_ONCE = false;

export function getDefaultFlashSettings() {
  return {
    flashDisplayMs: DEFAULT_FLASH_DISPLAY_MS,
    flashPreparationSeconds: DEFAULT_FLASH_PREPARATION_SECONDS,
    flashAnswerAppearance: DEFAULT_FLASH_ANSWER_APPEARANCE,
    flashAllowReplayOnce: DEFAULT_FLASH_ALLOW_REPLAY_ONCE
  };
}

export function normalizeFlashSettings(settings = {}) {
  const safeSettings = settings && typeof settings === "object" && !Array.isArray(settings)
    ? settings
    : {};

  return {
    flashDisplayMs: normalizeFlashDisplayMs(
      safeSettings.flashDisplayMs
      ?? safeSettings.flash_display_ms
      ?? safeSettings.displayMs
      ?? safeSettings.display_ms
    ),
    flashPreparationSeconds: normalizeFlashPreparationSeconds(
      safeSettings.flashPreparationSeconds
      ?? safeSettings.flash_preparation_seconds
      ?? safeSettings.flashPrepareSeconds
      ?? safeSettings.flash_prepare_seconds
      ?? safeSettings.preparationSeconds
      ?? safeSettings.preparation_seconds
      ?? safeSettings.flashReadySeconds
      ?? safeSettings.flash_ready_seconds
    ),
    flashAnswerAppearance: normalizeFlashAnswerAppearance(
      safeSettings.flashAnswerAppearance
      ?? safeSettings.flash_answer_appearance
      ?? safeSettings.answerAppearance
      ?? safeSettings.answer_appearance
    ),
    flashAllowReplayOnce: normalizeFlashAllowReplayOnce(
      safeSettings.flashAllowReplayOnce
      ?? safeSettings.flash_allow_replay_once
      ?? safeSettings.allowReplayOnce
      ?? safeSettings.allow_replay_once
    )
  };
}

export function normalizeFlashDisplayMs(value = DEFAULT_FLASH_DISPLAY_MS) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return DEFAULT_FLASH_DISPLAY_MS;
  return Math.min(FLASH_DISPLAY_MS_MAX, Math.max(FLASH_DISPLAY_MS_MIN, parsed));
}

export function normalizeFlashPreparationSeconds(value = DEFAULT_FLASH_PREPARATION_SECONDS) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return DEFAULT_FLASH_PREPARATION_SECONDS;
  return Math.min(FLASH_PREPARATION_SECONDS_MAX, Math.max(FLASH_PREPARATION_SECONDS_MIN, parsed));
}

export function normalizeFlashAnswerAppearance(value = DEFAULT_FLASH_ANSWER_APPEARANCE) {
  const safeValue = String(value || "").trim().toLowerCase();
  return FLASH_ANSWER_APPEARANCES.has(safeValue) ? safeValue : DEFAULT_FLASH_ANSWER_APPEARANCE;
}

export function normalizeFlashAllowReplayOnce(value = DEFAULT_FLASH_ALLOW_REPLAY_ONCE) {
  if (value === false || value === "false" || value === "0" || value === 0 || value === "no" || value === "non") {
    return false;
  }
  if (value === true || value === "true" || value === "1" || value === 1 || value === "yes" || value === "oui") {
    return true;
  }
  return DEFAULT_FLASH_ALLOW_REPLAY_ONCE;
}

export function shouldShowFlashAnswersAfterQuestion(settings = {}) {
  return normalizeFlashSettings(settings).flashAnswerAppearance === "after_question";
}

export {
  DEFAULT_FLASH_DISPLAY_MS,
  FLASH_DISPLAY_MS_MIN,
  FLASH_DISPLAY_MS_MAX,
  DEFAULT_FLASH_PREPARATION_SECONDS,
  FLASH_PREPARATION_SECONDS_MIN,
  FLASH_PREPARATION_SECONDS_MAX,
  DEFAULT_FLASH_ANSWER_APPEARANCE,
  DEFAULT_FLASH_ALLOW_REPLAY_ONCE
};
