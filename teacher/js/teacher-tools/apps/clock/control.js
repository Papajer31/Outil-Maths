import {
  CLOCK_MODE_MANUAL,
  CLOCK_MODE_REAL,
  CLOCK_STEP_FIVE_MINUTES,
  CLOCK_STEP_MINUTE,
  CLOCK_STEP_QUARTER_HOUR,
  CLOCK_THEME_DARK,
  CLOCK_THEME_LIGHT,
  applyClockAction,
  formatClockDigital,
  getClockCurrentRealSeconds,
  normalizeClockState
} from "./model.js";
import { escapeAttr, escapeHtml } from "../../../dashboard/text-utils.js";
import { createColorPicker } from "../../../../../shared/color-picker.js";

function getControlSeconds(state){
  return state.mode === CLOCK_MODE_REAL ? getClockCurrentRealSeconds() : state.totalSeconds;
}

function getModeButton(state, mode, icon, label){
  const active = state.mode === mode;
  return `
    <button class="tt-widget-action-btn tt-clock-mode-btn${active ? " is-active" : ""}" type="button" data-clock-mode="${escapeAttr(mode)}" aria-pressed="${active ? "true" : "false"}">
      <span class="dashboard-material-icon" aria-hidden="true">${escapeHtml(icon)}</span>
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function getStepButton(state, step, label){
  const active = state.snapStep === step;
  return `
    <button class="tt-widget-action-btn tt-clock-step-btn${active ? " is-active" : ""}" type="button" data-clock-step="${escapeAttr(step)}" aria-pressed="${active ? "true" : "false"}">
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function getThemeButton(state, theme, icon, label){
  const active = state.theme === theme;
  return `
    <button class="tt-widget-action-btn tt-clock-theme-btn${active ? " is-active" : ""}" type="button" data-clock-theme="${escapeAttr(theme)}" aria-pressed="${active ? "true" : "false"}">
      <span class="dashboard-material-icon" aria-hidden="true">${escapeHtml(icon)}</span>
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function getDefaultThemeColorsButton(){
  return `
    <button class="tt-widget-action-btn tt-clock-theme-default-btn" type="button" data-clock-theme-default>
      <span class="dashboard-material-icon" aria-hidden="true">restart_alt</span>
      <span>Défaut</span>
    </button>
  `;
}

function getDisplayButton(state, key, label, icon, { disabled = false } = {}){
  const checked = state[key] === true;
  const active = key === "showSecondHand" ? checked && state.mode === CLOCK_MODE_REAL : checked;
  return `
    <button
      class="tt-widget-action-btn tt-clock-display-btn${active ? " is-active" : ""}"
      type="button"
      data-clock-display-button="${escapeAttr(key)}"
      aria-pressed="${active ? "true" : "false"}"
      ${disabled ? "disabled aria-disabled=\"true\"" : ""}
    >
      <span class="dashboard-material-icon" aria-hidden="true">${escapeHtml(icon)}</span>
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function renderColorPickerSlot({ id } = {}){
  return `
    <div class="tt-clock-color-control">
      <div id="${escapeAttr(id)}" class="tt-clock-color-picker-slot"></div>
    </div>
  `;
}

export function createClockControlPanel({ host, getWidget, updateWidget, showToast } = {}){
  let liveTimer = 0;

  function getCurrentState(){
    return normalizeClockState(getWidget?.()?.state);
  }

  function clearLiveTimer(){
    if (!liveTimer || typeof window === "undefined") return;
    window.clearInterval(liveTimer);
    liveTimer = 0;
  }

  function syncLiveControls(){
    if (!host?.isConnected) {
      clearLiveTimer();
      return;
    }
    const state = getCurrentState();
    if (state.mode !== CLOCK_MODE_REAL) {
      clearLiveTimer();
      return;
    }
    const seconds = getControlSeconds(state);
    const timeNode = host.querySelector(".tt-clock-current-time");
    if (timeNode) {
      timeNode.textContent = formatClockDigital(seconds);
    }
  }

  function startLiveTimer(state){
    clearLiveTimer();
    if (state.mode !== CLOCK_MODE_REAL || typeof window === "undefined") return;
    liveTimer = window.setInterval(syncLiveControls, state.showSecondHand ? 250 : 1000);
  }

  function commitAction(action, payload = {}, { renderAfter = true } = {}){
    const result = applyClockAction({
      action,
      payload,
      state: getCurrentState()
    });
    if (!result) return;
    if (result.error) {
      showToast?.(String(result.error), { isError: true });
      return;
    }
    const patch = result.patch && typeof result.patch === "object" ? result.patch : null;
    if (patch) updateWidget?.(patch, { renderPanel: renderAfter, sync: true });
    if (result.message) showToast?.(String(result.message), { isError: result.isError === true });
  }

  function render(){
    if (!host) return;
    clearLiveTimer();
    const state = getCurrentState();
    const seconds = getControlSeconds(state);

    host.innerHTML = `
      <section class="tt-control-panel tt-control-panel-compact tt-clock-control" aria-label="Contrôles du widget Horloge">
        <div class="tt-control-panel-head">
          <div class="tt-clock-heading-row">
            <h3>Horloge</h3>
            <span class="tt-clock-current-time">${escapeHtml(formatClockDigital(seconds))}</span>
          </div>
        </div>

        <div class="tt-widget-action-bar tt-clock-mode-bar" aria-label="Mode de l’horloge">
          ${getModeButton(state, CLOCK_MODE_MANUAL, "pan_tool_alt", "Manipulation libre")}
          ${getModeButton(state, CLOCK_MODE_REAL, "schedule", "Heure réelle")}
          <button id="ttClockNow" class="tt-widget-action-btn is-primary" type="button">
            <span class="dashboard-material-icon" aria-hidden="true">my_location</span>
            <span>Maintenant</span>
          </button>
          ${getDisplayButton(state, "showDigital", "Heure numérique", "pin")}
          ${getDisplayButton(state, "showSecondHand", "Trotteuse", "timer", { disabled: state.mode !== CLOCK_MODE_REAL })}
        </div>

        <section class="tt-clock-option-card tt-clock-display-card" aria-label="Affichage">
          <h4>Affichage</h4>
          <div class="tt-clock-display-panel-row">
            <div class="tt-widget-action-bar tt-clock-display-button-grid">
              ${getDisplayButton(state, "showMinuteNumbers", "Minutes", "more_time")}
              ${getDisplayButton(state, "showMinuteTicks", "Graduations", "apps")}
              ${getDisplayButton(state, "showAfternoonHours", "Heures 13-24", "schedule")}
              ${getDisplayButton(state, "showHourExtension", "Prolongement heures", "timeline")}
            </div>
            <div class="tt-clock-color-grid">
              ${renderColorPickerSlot({ id: "ttClockHourColorPicker" })}
              ${renderColorPickerSlot({ id: "ttClockMinuteColorPicker" })}
            </div>
          </div>
        </section>

        <div class="tt-clock-options-grid">
          <section class="tt-clock-option-card tt-clock-adjust-card" aria-label="Ajuster l’heure">
            <h4>Ajuster</h4>
            <div class="tt-clock-nudge-grid">
              <button class="tt-widget-action-btn" type="button" data-clock-adjust="-60">−1 h</button>
              <button class="tt-widget-action-btn" type="button" data-clock-adjust="-15">−15 min</button>
              <button class="tt-widget-action-btn" type="button" data-clock-adjust="-5">−5 min</button>
              <button class="tt-widget-action-btn" type="button" data-clock-adjust="-1">−1 min</button>
              <button class="tt-widget-action-btn" type="button" data-clock-adjust="1">+1 min</button>
              <button class="tt-widget-action-btn" type="button" data-clock-adjust="5">+5 min</button>
              <button class="tt-widget-action-btn" type="button" data-clock-adjust="15">+15 min</button>
              <button class="tt-widget-action-btn" type="button" data-clock-adjust="60">+1 h</button>
            </div>
          </section>

          <section class="tt-clock-option-card" aria-label="Pas de manipulation">
            <h4>Pas des aiguilles</h4>
            <div class="tt-clock-step-group">
              ${getStepButton(state, CLOCK_STEP_MINUTE, "1 min")}
              ${getStepButton(state, CLOCK_STEP_FIVE_MINUTES, "5 min")}
              ${getStepButton(state, CLOCK_STEP_QUARTER_HOUR, "15 min")}
            </div>
          </section>

          <section class="tt-clock-option-card tt-clock-theme-card" aria-label="Thème">
            <h4>Thème</h4>
            <div class="tt-clock-theme-group">
              ${getThemeButton(state, CLOCK_THEME_LIGHT, "light_mode", "Clair")}
              ${getThemeButton(state, CLOCK_THEME_DARK, "dark_mode", "Sombre")}
              ${getDefaultThemeColorsButton()}
            </div>
          </section>
        </div>
      </section>
    `;

    host.querySelectorAll("[data-clock-mode]").forEach((button) => {
      button.addEventListener("click", () => commitAction("set-mode", { mode: button.dataset.clockMode }));
    });
    host.querySelector("#ttClockNow")?.addEventListener("click", () => commitAction("set-now"));
    host.querySelectorAll("[data-clock-adjust]").forEach((button) => {
      button.addEventListener("click", () => commitAction("adjust-minutes", {
        deltaMinutes: button.dataset.clockAdjust
      }));
    });
    host.querySelectorAll("[data-clock-step]").forEach((button) => {
      button.addEventListener("click", () => commitAction("set-snap-step", {
        snapStep: button.dataset.clockStep
      }));
    });
    host.querySelectorAll("[data-clock-theme]").forEach((button) => {
      button.addEventListener("click", () => commitAction("set-theme", {
        theme: button.dataset.clockTheme
      }));
    });
    host.querySelector("[data-clock-theme-default]")?.addEventListener("click", () => {
      commitAction("reset-theme-colors");
    });
    host.querySelectorAll("[data-clock-display-button]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.disabled) return;
        const key = String(button.dataset.clockDisplayButton || "").trim();
        const currentState = getCurrentState();
        commitAction("set-display", {
          [key]: currentState[key] !== true
        });
      });
    });
    createColorPicker({
      host: host.querySelector("#ttClockHourColorPicker"),
      value: state.hourColor,
      label: "Heures",
      headerLabel: "",
      popup: true,
      onChange(value){
        commitAction("set-colors", { hourColor: value }, { renderAfter: false });
      }
    });
    createColorPicker({
      host: host.querySelector("#ttClockMinuteColorPicker"),
      value: state.minuteColor,
      label: "Minutes",
      headerLabel: "",
      popup: true,
      onChange(value){
        commitAction("set-colors", { minuteColor: value }, { renderAfter: false });
      }
    });
    startLiveTimer(state);
  }

  render();
  return {
    render,
    destroy(){
      clearLiveTimer();
      if (host) host.innerHTML = "";
    }
  };
}
