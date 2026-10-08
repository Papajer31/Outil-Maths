import { normalizeColorPickerValue } from "../../../../../shared/color-picker.js";

export const CLOCK_MODE_MANUAL = "manual";
export const CLOCK_MODE_REAL = "real";
export const CLOCK_THEME_LIGHT = "light";
export const CLOCK_THEME_DARK = "dark";

export const CLOCK_STEP_MINUTE = 1;
export const CLOCK_STEP_FIVE_MINUTES = 5;
export const CLOCK_STEP_QUARTER_HOUR = 15;
export const CLOCK_ALLOWED_STEPS = Object.freeze([
  CLOCK_STEP_MINUTE,
  CLOCK_STEP_FIVE_MINUTES,
  CLOCK_STEP_QUARTER_HOUR
]);

export const CLOCK_SECONDS_PER_DAY = 24 * 60 * 60;
export const CLOCK_DEFAULT_TOTAL_SECONDS = 8 * 60 * 60;
export const CLOCK_DEFAULT_HOUR_COLOR = "#1f2937";
export const CLOCK_DEFAULT_MINUTE_COLOR = "#111827";
export const CLOCK_THEME_COLORS = Object.freeze({
  [CLOCK_THEME_LIGHT]: Object.freeze({
    hourColor: CLOCK_DEFAULT_HOUR_COLOR,
    minuteColor: CLOCK_DEFAULT_MINUTE_COLOR
  }),
  [CLOCK_THEME_DARK]: Object.freeze({
    hourColor: "#f8fafc",
    minuteColor: "#f59e0b"
  })
});

function hasOwn(source, key){
  return Object.prototype.hasOwnProperty.call(source || {}, key);
}

function clamp(value, min, max){
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function normalizeInteger(value, fallback, min, max){
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

export function normalizeClockMode(value){
  return String(value || "").trim() === CLOCK_MODE_REAL ? CLOCK_MODE_REAL : CLOCK_MODE_MANUAL;
}

export function normalizeClockTheme(value){
  return String(value || "").trim() === CLOCK_THEME_DARK ? CLOCK_THEME_DARK : CLOCK_THEME_LIGHT;
}

export function getClockThemeColors(theme){
  return CLOCK_THEME_COLORS[normalizeClockTheme(theme)] || CLOCK_THEME_COLORS[CLOCK_THEME_LIGHT];
}

export function normalizeClockStep(value){
  const numeric = Math.trunc(Number(value));
  return CLOCK_ALLOWED_STEPS.includes(numeric) ? numeric : CLOCK_STEP_MINUTE;
}

export function normalizeClockTotalSeconds(value){
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return CLOCK_DEFAULT_TOTAL_SECONDS;
  return ((number % CLOCK_SECONDS_PER_DAY) + CLOCK_SECONDS_PER_DAY) % CLOCK_SECONDS_PER_DAY;
}

export function getClockCurrentRealSeconds(now = new Date()){
  const date = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
}

export function getClockDisplaySeconds(state = {}, now = new Date()){
  const safeState = normalizeClockState(state);
  return safeState.mode === CLOCK_MODE_REAL
    ? getClockCurrentRealSeconds(now)
    : safeState.totalSeconds;
}

export function normalizeClockState(rawState = {}){
  const theme = normalizeClockTheme(rawState.theme);
  const themeColors = getClockThemeColors(theme);
  const rawHourColor = hasOwn(rawState, "hourColor") ? rawState.hourColor : themeColors.hourColor;
  const rawMinuteColor = hasOwn(rawState, "minuteColor") ? rawState.minuteColor : themeColors.minuteColor;
  const normalizedHourColor = normalizeColorPickerValue(rawHourColor, themeColors.hourColor);
  const normalizedMinuteColor = normalizeColorPickerValue(rawMinuteColor, themeColors.minuteColor);
  const hourColorCustom = rawState.hourColorCustom === true
    || (rawState.hourColorCustom !== false && hasOwn(rawState, "hourColor") && normalizedHourColor !== themeColors.hourColor);
  const minuteColorCustom = rawState.minuteColorCustom === true
    || (rawState.minuteColorCustom !== false && hasOwn(rawState, "minuteColor") && normalizedMinuteColor !== themeColors.minuteColor);

  return {
    theme,
    mode: normalizeClockMode(rawState.mode),
    totalSeconds: normalizeClockTotalSeconds(rawState.totalSeconds),
    snapStep: normalizeClockStep(rawState.snapStep),
    showSecondHand: rawState.showSecondHand === true,
    showDigital: rawState.showDigital === true,
    showMinuteNumbers: rawState.showMinuteNumbers === true,
    showMinuteTicks: rawState.showMinuteTicks !== false,
    showAfternoonHours: rawState.showAfternoonHours === true,
    showHourExtension: rawState.showHourExtension === true,
    hourColor: hourColorCustom ? normalizedHourColor : themeColors.hourColor,
    minuteColor: minuteColorCustom ? normalizedMinuteColor : themeColors.minuteColor,
    hourColorCustom,
    minuteColorCustom,
    updatedAt: Math.max(0, Math.trunc(Number(rawState.updatedAt) || 0))
  };
}

export function createInitialClockState(){
  return normalizeClockState({
    theme: CLOCK_THEME_LIGHT,
    mode: CLOCK_MODE_MANUAL,
    totalSeconds: CLOCK_DEFAULT_TOTAL_SECONDS,
    snapStep: CLOCK_STEP_MINUTE,
    showSecondHand: false,
    showDigital: false,
    showMinuteNumbers: false,
    showMinuteTicks: true,
    showAfternoonHours: false,
    showHourExtension: false,
    hourColor: CLOCK_DEFAULT_HOUR_COLOR,
    minuteColor: CLOCK_DEFAULT_MINUTE_COLOR,
    updatedAt: Date.now()
  });
}

export function createClockProjectorState({ state } = {}){
  return normalizeClockState(state);
}

export function cloneClockState(rawState = {}){
  return normalizeClockState(rawState);
}

export function splitClockSeconds(totalSeconds){
  const safeSeconds = normalizeClockTotalSeconds(totalSeconds);
  return {
    hours: Math.floor(safeSeconds / 3600),
    minutes: Math.floor((safeSeconds % 3600) / 60),
    seconds: safeSeconds % 60
  };
}

export function buildClockSeconds({ hours = 0, minutes = 0, seconds = 0 } = {}){
  const safeHours = normalizeInteger(hours, 0, 0, 23);
  const safeMinutes = normalizeInteger(minutes, 0, 0, 59);
  const safeSeconds = normalizeInteger(seconds, 0, 0, 59);
  return normalizeClockTotalSeconds(safeHours * 3600 + safeMinutes * 60 + safeSeconds);
}

export function formatClockDigital(totalSeconds, { showSeconds = false } = {}){
  const parts = splitClockSeconds(totalSeconds);
  const hourText = String(parts.hours);
  const minuteText = String(parts.minutes).padStart(2, "0");
  const secondText = String(parts.seconds).padStart(2, "0");
  return showSeconds ? `${hourText}H${minuteText}:${secondText}` : `${hourText}H${minuteText}`;
}

export function getClockAngles(totalSeconds){
  const safeSeconds = normalizeClockTotalSeconds(totalSeconds);
  const dayHours = Math.floor(safeSeconds / 3600);
  const hours12 = dayHours % 12;
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return {
    hour: (hours12 + minutes / 60 + seconds / 3600) * 30,
    minute: (minutes + seconds / 60) * 6,
    second: seconds * 6
  };
}

export function roundSecondsToMinuteStep(totalSeconds, stepMinutes = CLOCK_STEP_FIVE_MINUTES){
  const safeStep = normalizeClockStep(stepMinutes);
  const stepSeconds = safeStep * 60;
  return normalizeClockTotalSeconds(Math.round(normalizeClockTotalSeconds(totalSeconds) / stepSeconds) * stepSeconds);
}

function patchState(currentState, patch = {}){
  return normalizeClockState({
    ...currentState,
    ...(patch && typeof patch === "object" ? patch : {}),
    updatedAt: Date.now()
  });
}

export function applyClockAction({ action, payload = {}, state, widget } = {}){
  const safeAction = String(action || "").trim();
  const currentState = normalizeClockState(state);

  if (safeAction === "set-mode") {
    const mode = normalizeClockMode(payload?.mode);
    return {
      patch: {
        state: patchState(currentState, {
          mode,
          totalSeconds: mode === CLOCK_MODE_REAL ? currentState.totalSeconds : getClockDisplaySeconds(currentState)
        })
      }
    };
  }

  if (safeAction === "set-now") {
    return {
      patch: {
        state: patchState(currentState, {
          mode: CLOCK_MODE_REAL,
          totalSeconds: getClockCurrentRealSeconds()
        })
      }
    };
  }

  if (safeAction === "set-time") {
    return {
      patch: {
        state: patchState(currentState, {
          mode: CLOCK_MODE_MANUAL,
          totalSeconds: roundSecondsToMinuteStep(payload?.totalSeconds, payload?.snapStep ?? currentState.snapStep)
        })
      }
    };
  }

  if (safeAction === "set-time-parts") {
    return {
      patch: {
        state: patchState(currentState, {
          mode: CLOCK_MODE_MANUAL,
          totalSeconds: buildClockSeconds(payload)
        })
      }
    };
  }

  if (safeAction === "adjust-minutes") {
    const delta = clamp(Math.trunc(Number(payload?.deltaMinutes) || 0), -24 * 60, 24 * 60);
    const baseSeconds = getClockDisplaySeconds(currentState);
    return {
      patch: {
        state: patchState(currentState, {
          mode: CLOCK_MODE_MANUAL,
          totalSeconds: normalizeClockTotalSeconds(baseSeconds + delta * 60)
        })
      }
    };
  }

  if (safeAction === "set-snap-step") {
    return {
      patch: {
        state: patchState(currentState, {
          snapStep: normalizeClockStep(payload?.snapStep)
        })
      }
    };
  }

  if (safeAction === "set-display") {
    const patch = {};
    if (Object.prototype.hasOwnProperty.call(payload || {}, "showSecondHand")) {
      if (currentState.mode === CLOCK_MODE_REAL) {
        patch.showSecondHand = payload.showSecondHand === true;
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload || {}, "showDigital")) {
      patch.showDigital = payload.showDigital !== false;
    }
    if (Object.prototype.hasOwnProperty.call(payload || {}, "showMinuteNumbers")) {
      patch.showMinuteNumbers = payload.showMinuteNumbers === true;
    }
    if (Object.prototype.hasOwnProperty.call(payload || {}, "showMinuteTicks")) {
      patch.showMinuteTicks = payload.showMinuteTicks !== false;
    }
    if (Object.prototype.hasOwnProperty.call(payload || {}, "showAfternoonHours")) {
      patch.showAfternoonHours = payload.showAfternoonHours === true;
    }
    if (Object.prototype.hasOwnProperty.call(payload || {}, "showHourExtension")) {
      patch.showHourExtension = payload.showHourExtension === true;
    }
    return { patch: { state: patchState(currentState, patch) } };
  }

  if (safeAction === "set-theme") {
    const theme = normalizeClockTheme(payload?.theme);
    const themeColors = getClockThemeColors(theme);
    const patch = { theme };
    if (!currentState.hourColorCustom) patch.hourColor = themeColors.hourColor;
    if (!currentState.minuteColorCustom) patch.minuteColor = themeColors.minuteColor;
    return { patch: { state: patchState(currentState, patch) } };
  }

  if (safeAction === "reset-theme-colors") {
    const themeColors = getClockThemeColors(currentState.theme);
    return {
      patch: {
        state: patchState(currentState, {
          hourColor: themeColors.hourColor,
          minuteColor: themeColors.minuteColor,
          hourColorCustom: false,
          minuteColorCustom: false
        })
      }
    };
  }

  if (safeAction === "set-colors") {
    const patch = {};
    if (Object.prototype.hasOwnProperty.call(payload || {}, "hourColor")) {
      patch.hourColor = normalizeColorPickerValue(payload.hourColor, currentState.hourColor);
      patch.hourColorCustom = true;
    }
    if (Object.prototype.hasOwnProperty.call(payload || {}, "minuteColor")) {
      patch.minuteColor = normalizeColorPickerValue(payload.minuteColor, currentState.minuteColor);
      patch.minuteColorCustom = true;
    }
    return { patch: { state: patchState(currentState, patch) } };
  }

  if (safeAction === "toggle-second-hand") {
    if (currentState.mode !== CLOCK_MODE_REAL) return null;
    return {
      patch: {
        state: patchState(currentState, {
          showSecondHand: !currentState.showSecondHand
        })
      }
    };
  }

  if (safeAction === "toggle-digital") {
    return {
      patch: {
    state: patchState(currentState, {
          showDigital: !currentState.showDigital
        })
      }
    };
  }

  if (safeAction === "toggle-minute-numbers") {
    return {
      patch: {
        state: patchState(currentState, {
          showMinuteNumbers: !currentState.showMinuteNumbers
        })
      }
    };
  }

  return null;
}
