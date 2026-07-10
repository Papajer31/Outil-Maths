import {
  CLOCK_MODE_MANUAL,
  CLOCK_MODE_REAL,
  applyClockAction,
  formatClockDigital,
  getClockAngles,
  getClockDisplaySeconds,
  normalizeClockState,
  normalizeClockTotalSeconds,
  roundSecondsToMinuteStep
} from "./model.js";

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const escapeAttr = escapeHtml;
const clockTimers = new Map();
const clockDragState = new Map();
const CLOCK_CENTER = 100;
const CLOCK_FACE_RADIUS = 96;
const CLOCK_HOUR_NUMBER_RADIUS = 74;
const CLOCK_MINUTE_NUMBER_RADIUS = 106;

function normalizeDegrees(value){
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return ((number % 360) + 360) % 360;
}

function getSignedAngleDelta(from, to){
  let delta = normalizeDegrees(to) - normalizeDegrees(from);
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

function getPointAngle(event, svg){
  const rect = svg?.getBoundingClientRect?.();
  if (!rect?.width || !rect?.height) return 0;
  const x = Number(event.clientX) - (rect.left + rect.width / 2);
  const y = Number(event.clientY) - (rect.top + rect.height / 2);
  return normalizeDegrees(Math.atan2(y, x) * 180 / Math.PI + 90);
}

function getWidgetIdFromHost(host){
  return String(host?.closest?.("[data-widget-id]")?.dataset?.widgetId || "clock").trim();
}

function stopClockTimer(widgetId){
  const safeWidgetId = String(widgetId || "").trim();
  const timer = clockTimers.get(safeWidgetId);
  if (timer) window.clearInterval(timer);
  clockTimers.delete(safeWidgetId);
}

function startClockTimer({ widgetId, host, state, sendAction } = {}){
  const safeWidgetId = String(widgetId || "").trim();
  stopClockTimer(safeWidgetId);
  if (!safeWidgetId || state.mode !== CLOCK_MODE_REAL) return;
  const timer = window.setInterval(() => {
    if (!host?.isConnected) {
      stopClockTimer(safeWidgetId);
      return;
    }
    const root = host.querySelector?.(".ttp-clock");
    if (root?.classList?.contains?.("is-dragging-hand")) return;
    refreshClockDom(host, root?.__ttpClockState || state, sendAction);
  }, state.showSecondHand ? 250 : 1000);
  clockTimers.set(safeWidgetId, timer);
}

function getTicksHtml(state){
  const ticks = [];
  for (let index = 0; index < 60; index += 1) {
    if (!state.showMinuteTicks && index % 5 !== 0) continue;
    const angle = index * 6;
    const isHour = index % 5 === 0;
    ticks.push(`
      <line
        class="ttp-clock-tick${isHour ? " is-hour" : ""}"
        x1="100" y1="${isHour ? -5 : -2}"
        x2="100" y2="${isHour ? 13 : 10}"
        transform="rotate(${angle} 100 100)"
      />
    `);
  }
  return ticks.join("");
}

function getSafeSvgId(value, fallback = "clock"){
  const safeValue = String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "-");
  return safeValue || fallback;
}

function getHourNumberLabel(hour, state){
  if (state.showAfternoonHours !== true) return String(hour);
  return String(hour === 12 ? 24 : hour + 12);
}

function getHourNumbersHtml(state){
  const numbers = [];
  const numberClass = `ttp-clock-hour-number${state.showAfternoonHours ? " is-afternoon" : ""}`;
  for (let hour = 1; hour <= 12; hour += 1) {
    const angle = hour * 30;
    const radius = CLOCK_HOUR_NUMBER_RADIUS;
    const rad = (angle - 90) * Math.PI / 180;
    const x = 100 + Math.cos(rad) * radius;
    const y = 100 + Math.sin(rad) * radius;
    numbers.push(`<text class="${numberClass}" x="${x.toFixed(2)}" y="${y.toFixed(2)}">${getHourNumberLabel(hour, state)}</text>`);
  }
  return numbers.join("");
}

function getMinuteNumbersHtml(state){
  const numbers = [];
  for (let minute = 0; minute < 60; minute += 5) {
    const label = String(minute);
    const angle = minute * 6;
    const radius = CLOCK_MINUTE_NUMBER_RADIUS;
    const rad = (angle - 90) * Math.PI / 180;
    const x = 100 + Math.cos(rad) * radius;
    const y = 100 + Math.sin(rad) * radius;
    numbers.push(`<text class="ttp-clock-minute-number" x="${x.toFixed(2)}" y="${y.toFixed(2)}">${label}</text>`);
  }
  return numbers.join("");
}

function isSecondHandVisible(state){
  return state.showSecondHand === true && state.mode === CLOCK_MODE_REAL;
}

function getClockFaceHtml(state, widgetId = "clock"){
  const faceClipId = `ttp-clock-face-clip-${getSafeSvgId(widgetId)}`;
  const showSecondHand = isSecondHandVisible(state);
  return `
    <svg class="ttp-clock-svg" viewBox="-12 -12 224 224" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Horloge analogique manipulable" data-clock-svg>
      <defs>
        <clipPath id="${escapeAttr(faceClipId)}">
          <circle cx="100" cy="100" r="${CLOCK_FACE_RADIUS}" />
        </clipPath>
      </defs>
      <circle class="ttp-clock-face" cx="100" cy="100" r="${CLOCK_FACE_RADIUS}" />
      <g class="ttp-clock-ticks" clip-path="url(#${escapeAttr(faceClipId)})" aria-hidden="true">${getTicksHtml(state)}</g>
      <g class="ttp-clock-minute-numbers${state.showMinuteNumbers ? "" : " is-hidden"}" aria-hidden="${state.showMinuteNumbers ? "false" : "true"}">${getMinuteNumbersHtml(state)}</g>
      <g class="ttp-clock-hour-numbers" aria-hidden="true">${getHourNumbersHtml(state)}</g>
      <g class="ttp-clock-hour-extension${state.showHourExtension ? "" : " is-hidden"}" aria-hidden="true">
        <line class="ttp-clock-hand ttp-clock-hour-extension-hand" data-clock-hour-extension-line x1="100" y1="108" x2="100" y2="30" />
      </g>
      <g class="ttp-clock-hand-group is-hour" data-clock-hand="hour" data-widget-action>
        <line class="ttp-clock-hand ttp-clock-hour-hand" data-clock-hand-line x1="100" y1="109" x2="100" y2="54" />
        <line class="ttp-clock-hand-hotzone" data-clock-hand-hotzone x1="100" y1="108" x2="100" y2="45" />
      </g>
      <g class="ttp-clock-hand-group is-minute" data-clock-hand="minute" data-widget-action>
        <line class="ttp-clock-hand ttp-clock-minute-hand" data-clock-hand-line x1="100" y1="108" x2="100" y2="30" />
        <line class="ttp-clock-hand-hotzone" data-clock-hand-hotzone x1="100" y1="112" x2="100" y2="20" />
      </g>
      <g class="ttp-clock-hand-group is-second${showSecondHand ? "" : " is-hidden"}" data-clock-hand="second">
        <line class="ttp-clock-hand ttp-clock-second-hand" data-clock-hand-line x1="100" y1="114" x2="100" y2="24" />
      </g>
      <circle class="ttp-clock-center" cx="100" cy="100" r="6" />
    </svg>
  `;
}

function getClockHandEndpoint(angle, distance){
  const radians = normalizeDegrees(angle) * Math.PI / 180;
  return {
    x: CLOCK_CENTER + Math.sin(radians) * distance,
    y: CLOCK_CENTER - Math.cos(radians) * distance
  };
}

function setHandLineGeometry(line, angle, frontLength, backLength){
  if (!line) return;
  const front = getClockHandEndpoint(angle, frontLength);
  const back = getClockHandEndpoint(angle, -backLength);
  line.setAttribute("x1", front.x.toFixed(2));
  line.setAttribute("y1", front.y.toFixed(2));
  line.setAttribute("x2", back.x.toFixed(2));
  line.setAttribute("y2", back.y.toFixed(2));
}

function syncHandGeometry(root, totalSeconds, state){
  const angles = getClockAngles(totalSeconds);
  const hourHand = root?.querySelector?.("[data-clock-hand='hour']");
  const minuteHand = root?.querySelector?.("[data-clock-hand='minute']");
  const secondHand = root?.querySelector?.("[data-clock-hand='second']");
  const hourExtension = root?.querySelector?.("[data-clock-hour-extension-line]");
  if (hourHand) {
    hourHand.removeAttribute("transform");
    setHandLineGeometry(hourHand.querySelector("[data-clock-hand-line]"), angles.hour, 50, 9);
    setHandLineGeometry(hourHand.querySelector("[data-clock-hand-hotzone]"), angles.hour, 58, 8);
  }
  if (hourExtension) {
    setHandLineGeometry(hourExtension, angles.hour, 87, 8);
    hourExtension.closest?.(".ttp-clock-hour-extension")?.classList?.toggle?.("is-hidden", state.showHourExtension !== true);
  }
  if (minuteHand) {
    minuteHand.removeAttribute("transform");
    setHandLineGeometry(minuteHand.querySelector("[data-clock-hand-line]"), angles.minute, 87, 8);
    setHandLineGeometry(minuteHand.querySelector("[data-clock-hand-hotzone]"), angles.minute, 90, 12);
  }
  if (secondHand) {
    secondHand.removeAttribute("transform");
    setHandLineGeometry(secondHand.querySelector("[data-clock-hand-line]"), angles.second, 78, 14);
    secondHand.classList.toggle("is-hidden", !isSecondHandVisible(state));
  }
}

function syncDigital(root, totalSeconds, state){
  const digital = root?.querySelector?.("[data-clock-digital]");
  if (!digital) return;
  const isVisible = state.showDigital === true;
  if (isVisible) {
    digital.textContent = formatClockDigital(totalSeconds);
  } else {
    digital.innerHTML = `<span class="ttp-material-icon" aria-hidden="true">schedule</span>`;
  }
  digital.classList.toggle("is-hidden", !isVisible);
  digital.setAttribute("aria-pressed", isVisible ? "true" : "false");
  digital.setAttribute("aria-label", isVisible ? "Masquer l’heure numérique" : "Afficher l’heure numérique");
}

function refreshClockDom(host, rawState, sendAction){
  const state = normalizeClockState(rawState);
  const root = host?.querySelector?.(".ttp-clock");
  if (!root) return;
  if (root.classList.contains("is-dragging-hand") && state.mode === CLOCK_MODE_REAL) return;
  const seconds = getClockDisplaySeconds(state);
  root.__ttpClockState = state;
  root.classList.toggle("is-real-mode", state.mode === CLOCK_MODE_REAL);
  root.dataset.clockMode = state.mode;
  syncHandGeometry(root, seconds, state);
  syncDigital(root, seconds, state);
}

function getDragNextSeconds(memory, event){
  const svg = memory.svg;
  const currentAngle = getPointAngle(event, svg);
  const deltaAngle = getSignedAngleDelta(memory.lastAngle, currentAngle);
  memory.lastAngle = currentAngle;
  memory.accumulatedAngle += deltaAngle;

  const rawMinuteDelta = memory.hand === "hour"
    ? memory.accumulatedAngle * 2
    : memory.accumulatedAngle / 6;
  const step = Math.max(1, memory.snapStep);
  const roundedMinuteDelta = Math.round(rawMinuteDelta / step) * step;
  return roundSecondsToMinuteStep(memory.startSeconds + roundedMinuteDelta * 60, step);
}

function bindHandDrag(root, state, sendAction){
  const svg = root?.querySelector?.("[data-clock-svg]");
  if (!svg || svg.__ttpClockDragBound) return;
  svg.__ttpClockDragBound = true;
  const widgetId = getWidgetIdFromHost(root);

  root.querySelectorAll("[data-clock-hand]").forEach((hand) => {
    const handType = String(hand.dataset.clockHand || "").trim();
    if (handType === "second") return;
    hand.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const freshState = normalizeClockState(root.__ttpClockState || state);
      stopClockTimer(widgetId);
      const startSeconds = getClockDisplaySeconds(freshState);
      const memory = {
        hand: handType,
        svg,
        state: freshState,
        startSeconds,
        currentSeconds: startSeconds,
        snapStep: freshState.snapStep,
        lastAngle: getPointAngle(event, svg),
        accumulatedAngle: 0,
        pointerId: event.pointerId
      };
      clockDragState.set(widgetId, memory);
      root.classList.add("is-dragging-hand");
      try { svg.setPointerCapture?.(event.pointerId); } catch {}
    }, { passive: false });
  });

  const move = (event) => {
    const memory = clockDragState.get(widgetId);
    if (!memory || event.pointerId !== memory.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const nextSeconds = getDragNextSeconds(memory, event);
    memory.currentSeconds = normalizeClockTotalSeconds(nextSeconds);
    const localState = normalizeClockState({
      ...memory.state,
      mode: CLOCK_MODE_MANUAL,
      totalSeconds: memory.currentSeconds
    });
    root.__ttpClockState = localState;
    refreshClockDom(root.closest?.(".ttp-widget-body") || root.parentElement, localState, sendAction);
  };

  const finish = (event) => {
    const memory = clockDragState.get(widgetId);
    if (!memory || event.pointerId !== memory.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    clockDragState.delete(widgetId);
    root.classList.remove("is-dragging-hand");
    try { svg.releasePointerCapture?.(event.pointerId); } catch {}
    const localState = normalizeClockState({
      ...memory.state,
      mode: CLOCK_MODE_MANUAL,
      totalSeconds: memory.currentSeconds
    });
    root.__ttpClockState = localState;
    refreshClockDom(root.closest?.(".ttp-widget-body") || root.parentElement, localState, sendAction);
    stopClockTimer(widgetId);
    sendAction?.("set-time", {
      totalSeconds: memory.currentSeconds,
      snapStep: memory.snapStep
    });
  };

  svg.addEventListener("pointermove", move, { passive: false });
  svg.addEventListener("pointerup", finish, { passive: false });
  svg.addEventListener("pointercancel", finish, { passive: false });
}

function getSideControlButton({ action, payload = "", label, pressed = false, primary = false } = {}){
  return `
    <button
      class="ttp-clock-side-btn${primary ? " is-primary" : ""}"
      type="button"
      data-clock-projector-action="${escapeAttr(action)}"
      data-clock-projector-payload="${escapeAttr(payload)}"
      aria-pressed="${pressed ? "true" : "false"}"
    >
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function getChromeButton({ action, payload = "", icon, label, shortLabel = label, pressed = false, disabled = false } = {}){
  return `
    <button
      class="ttp-widget-action-btn ttp-clock-chrome-btn"
      type="button"
      data-widget-action
      data-clock-projector-action="${escapeAttr(action)}"
      data-clock-projector-payload="${escapeAttr(payload)}"
      title="${escapeAttr(label)}"
      aria-label="${escapeAttr(label)}"
      aria-pressed="${pressed ? "true" : "false"}"
      ${disabled ? "disabled aria-disabled=\"true\"" : ""}
    >
      <span class="ttp-material-icon" aria-hidden="true">${escapeHtml(icon)}</span>
      <span>${escapeHtml(shortLabel)}</span>
    </button>
  `;
}

function renderClockSideControls(state, side){
  if (side === "left") {
    return `
      ${getSideControlButton({ action: "adjust-minutes", payload: "-1", label: "- 1 min" })}
      ${getSideControlButton({ action: "adjust-minutes", payload: "-5", label: "- 5 min" })}
      ${getSideControlButton({ action: "adjust-minutes", payload: "-15", label: "- 15 min" })}
      ${getSideControlButton({ action: "adjust-minutes", payload: "-60", label: "- 1 h" })}
    `;
  }
  return `
    ${getSideControlButton({ action: "adjust-minutes", payload: "1", label: "+ 1 min" })}
    ${getSideControlButton({ action: "adjust-minutes", payload: "5", label: "+ 5 min" })}
    ${getSideControlButton({ action: "adjust-minutes", payload: "15", label: "+ 15 min" })}
    ${getSideControlButton({ action: "adjust-minutes", payload: "60", label: "+ 1 h" })}
  `;
}

function renderClockChromeControls({ chromeHost, bottomChromeHost, state, sendAction } = {}){
  const safeState = normalizeClockState(state);
  if (chromeHost) {
    chromeHost.innerHTML = `
      ${getChromeButton({ action: "set-mode", payload: CLOCK_MODE_MANUAL, icon: "pan_tool_alt", label: "Manipulation libre", shortLabel: "Libre", pressed: safeState.mode === CLOCK_MODE_MANUAL })}
      ${getChromeButton({ action: "set-mode", payload: CLOCK_MODE_REAL, icon: "schedule", label: "Heure réelle", shortLabel: "Réelle", pressed: safeState.mode === CLOCK_MODE_REAL })}
      ${getChromeButton({ action: "toggle-display", payload: "showSecondHand", icon: "timer", label: "Trotteuse", pressed: safeState.mode === CLOCK_MODE_REAL && safeState.showSecondHand, disabled: safeState.mode !== CLOCK_MODE_REAL })}
    `;
    bindClockProjectorControls(chromeHost, safeState, sendAction);
  }
  if (bottomChromeHost) {
    bottomChromeHost.innerHTML = `
      ${getChromeButton({ action: "toggle-display", payload: "showMinuteNumbers", icon: "more_time", label: "Nombres des minutes", shortLabel: "Minutes", pressed: safeState.showMinuteNumbers })}
      ${getChromeButton({ action: "toggle-display", payload: "showMinuteTicks", icon: "apps", label: "Graduations", pressed: safeState.showMinuteTicks })}
      ${getChromeButton({ action: "toggle-display", payload: "showAfternoonHours", icon: "schedule", label: "Heures 13-24", shortLabel: "13-24", pressed: safeState.showAfternoonHours })}
      ${getChromeButton({ action: "toggle-display", payload: "showHourExtension", icon: "timeline", label: "Prolongement de l’aiguille des heures", shortLabel: "Prolong.", pressed: safeState.showHourExtension })}
    `;
    bindClockProjectorControls(bottomChromeHost, safeState, sendAction);
  }
}

function handleClockProjectorControl({ action, payload, state, sendAction } = {}){
  const safeAction = String(action || "").trim();
  const safePayload = String(payload || "").trim();
  const safeState = normalizeClockState(state);

  if (safeAction === "set-mode") {
    sendAction?.("set-mode", { mode: safePayload });
    return;
  }
  if (safeAction === "adjust-minutes") {
    sendAction?.("adjust-minutes", { deltaMinutes: safePayload });
    return;
  }
  if (safeAction === "toggle-display" && safePayload) {
    if (safePayload === "showSecondHand" && safeState.mode !== CLOCK_MODE_REAL) return;
    sendAction?.("set-display", { [safePayload]: safeState[safePayload] !== true });
  }
}

function bindClockProjectorControls(root, state, sendAction){
  root?.querySelectorAll?.("[data-clock-projector-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      handleClockProjectorControl({
        action: button.dataset.clockProjectorAction,
        payload: button.dataset.clockProjectorPayload,
        state: root.__ttpClockState || state,
        sendAction
      });
    });
  });
}

export function renderClockProjector({ host, chromeHost, widgetInfoHost, bottomChromeHost, state, sendAction } = {}){
  if (!host) return;
  const safeState = normalizeClockState(state);
  const widgetId = getWidgetIdFromHost(host);
  const totalSeconds = getClockDisplaySeconds(safeState);
  const frame = host.closest?.(".ttp-widget-frame");
  if (frame) frame.dataset.clockTheme = safeState.theme;
  stopClockTimer(widgetId);
  renderClockChromeControls({ chromeHost, bottomChromeHost, state: safeState, sendAction });

  host.innerHTML = `
    <section class="ttp-clock" data-clock-mode="${escapeAttr(safeState.mode)}" data-clock-theme="${escapeAttr(safeState.theme)}" style="--ttp-clock-hour-color:${escapeAttr(safeState.hourColor)}; --ttp-clock-minute-color:${escapeAttr(safeState.minuteColor)};">
      <aside class="ttp-clock-side-controls is-left" aria-label="Contrôles gauche de l’horloge">
        ${renderClockSideControls(safeState, "left")}
      </aside>
      <div class="ttp-clock-main">
        <button
          class="ttp-clock-digital${safeState.showDigital ? "" : " is-hidden"}"
          type="button"
          data-widget-action
          data-clock-projector-action="toggle-display"
          data-clock-projector-payload="showDigital"
          data-clock-digital
          aria-pressed="${safeState.showDigital ? "true" : "false"}"
          aria-label="${safeState.showDigital ? "Masquer l’heure numérique" : "Afficher l’heure numérique"}"
        >${safeState.showDigital ? escapeHtml(formatClockDigital(totalSeconds)) : `<span class="ttp-material-icon" aria-hidden="true">schedule</span>`}</button>
        <div class="ttp-clock-face-wrap">
          ${getClockFaceHtml(safeState, widgetId)}
        </div>
      </div>
      <aside class="ttp-clock-side-controls is-right" aria-label="Contrôles droits de l’horloge">
        ${renderClockSideControls(safeState, "right")}
      </aside>
    </section>
  `;

  const root = host.querySelector(".ttp-clock");
  if (root) {
    root.__ttpClockState = safeState;
    bindHandDrag(root, safeState, sendAction);
    bindClockProjectorControls(root, safeState, sendAction);
    refreshClockDom(host, safeState, sendAction);
    startClockTimer({ widgetId, host, state: safeState, sendAction });
  }

  if (widgetInfoHost) {
    widgetInfoHost.textContent = "";
    widgetInfoHost.setAttribute("aria-hidden", "true");
    widgetInfoHost.style.visibility = "hidden";
  }
}

export function applyClockProjectorLocalAction({ action, payload = {}, state } = {}){
  return applyClockAction({ action, payload, state });
}
