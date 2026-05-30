import {
  normalizeDrawSerial,
  normalizeNameScale,
  normalizeStudents
} from "./model.js";

const projectorDrawAnimations = new Map();

function formatCssNumber(value){
  return Number(value.toFixed(2)).toString();
}

function getProjectorNameFontSize(scale){
  const safeScale = normalizeNameScale(scale);
  return `clamp(${formatCssNumber(42 * safeScale)}px, ${formatCssNumber(7.5 * safeScale)}vw, ${formatCssNumber(116 * safeScale)}px)`;
}

function clearProjectorDrawAnimation(widgetId){
  const memory = projectorDrawAnimations.get(widgetId);
  if (!memory) return;
  if (memory.timer) window.clearTimeout(memory.timer);
  if (memory.settleTimer) window.clearTimeout(memory.settleTimer);
  memory.timer = 0;
  memory.settleTimer = 0;
  memory.isAnimating = false;
}

function getProjectorDrawNames(state, currentName){
  const names = normalizeStudents(state?.lastDrawPool)
    .map((student) => student.firstName)
    .filter(Boolean);
  if (currentName && !names.includes(currentName)) names.push(currentName);
  if (!names.length) return [currentName || "—"];

  const loopNames = [...names];
  while (loopNames.length < 8) {
    loopNames.push(...names);
  }
  return loopNames.slice(0, 64);
}

function startProjectorDrawAnimation({ widgetId, section, nameEl, state, currentName, drawSerial } = {}){
  if (!widgetId || !section || !nameEl || !currentName) return;

  clearProjectorDrawAnimation(widgetId);
  const memory = projectorDrawAnimations.get(widgetId) || {};
  const names = getProjectorDrawNames(state, currentName);
  const totalSteps = Math.max(22, Math.min(34, names.length * 5));

  memory.drawSerial = drawSerial;
  memory.isInitialized = true;
  memory.isAnimating = true;
  projectorDrawAnimations.set(widgetId, memory);

  section.classList.remove("is-settling");
  section.classList.add("is-drawing");

  let step = 0;
  let connectionAttempts = 0;
  const tick = () => {
    if (!nameEl.isConnected) {
      if (connectionAttempts < 8) {
        connectionAttempts += 1;
        memory.timer = window.setTimeout(tick, 16);
        return;
      }
      memory.isAnimating = false;
      return;
    }

    if (step >= totalSteps) {
      nameEl.textContent = currentName;
      section.classList.remove("is-drawing");
      section.classList.add("is-settling");
      memory.isAnimating = false;
      memory.settleTimer = window.setTimeout(() => {
        if (section.isConnected) section.classList.remove("is-settling");
      }, 420);
      return;
    }

    const progress = totalSteps <= 1 ? 1 : step / (totalSteps - 1);
    const index = (step * 3 + Math.floor(Math.random() * names.length)) % names.length;
    nameEl.textContent = names[index] || currentName;
    step += 1;
    memory.timer = window.setTimeout(tick, 34 + Math.round(progress * progress * 135));
  };

  memory.timer = window.setTimeout(tick, 0);
}

export function renderRandomStudentProjector({ host, chromeHost, widgetInfoHost, state, sendAction } = {}){
  if (!host) return;

  const safeState = state && typeof state === "object" ? state : {};
  const widgetId = String(host.closest?.("[data-widget-id]")?.dataset?.widgetId || "random-student").trim();
  const currentStudent = safeState.currentStudent || null;
  const currentName = String(currentStudent?.firstName || "").trim();
  const hasResult = Boolean(currentName);
  const remainingCount = Math.max(0, Number(safeState.remainingCount) || 0);
  const totalCount = Math.max(0, Number(safeState.totalCount) || 0);
  const avoidRepeats = safeState.avoidRepeats !== false;
  const drawSerial = normalizeDrawSerial(safeState.drawSerial);
  const nameFontSize = getProjectorNameFontSize(safeState.nameScale);
  const memory = projectorDrawAnimations.get(widgetId) || {};
  const previousDrawSerial = memory.isInitialized === true
    ? normalizeDrawSerial(memory.drawSerial)
    : 0;
  const shouldAnimateDraw = hasResult && drawSerial > previousDrawSerial;

  host.innerHTML = `
    <section class="ttp-random-student${hasResult ? " has-result" : ""}" aria-live="polite">
      <div class="ttp-random-student-name" style="font-size:${nameFontSize}"></div>
    </section>
  `;
  const section = host.querySelector(".ttp-random-student");
  const nameEl = host.querySelector(".ttp-random-student-name");
  if (nameEl) nameEl.textContent = hasResult ? currentName : "—";

  if (!memory.isInitialized) {
    projectorDrawAnimations.set(widgetId, {
      ...memory,
      drawSerial,
      isInitialized: true,
      isAnimating: false
    });
  } else if (shouldAnimateDraw) {
    startProjectorDrawAnimation({
      widgetId,
      section,
      nameEl,
      state: safeState,
      currentName,
      drawSerial
    });
  } else {
    clearProjectorDrawAnimation(widgetId);
    projectorDrawAnimations.set(widgetId, {
      ...memory,
      drawSerial,
      isInitialized: true,
      isAnimating: false
    });
  }

  if (widgetInfoHost) {
    widgetInfoHost.textContent = totalCount > 0
      ? `${remainingCount} disponible${remainingCount > 1 ? "s" : ""} / ${totalCount}`
      : "En attente de la liste des élèves";
  }

  let controlsHost = chromeHost || null;
  if (!controlsHost) {
    controlsHost = document.createElement("div");
    controlsHost.className = "ttp-random-student-controls";
    controlsHost.dataset.projectorControls = "true";
    host.querySelector(".ttp-random-student")?.append(controlsHost);
  }

  controlsHost.innerHTML = `
    <button class="ttp-widget-action-btn is-primary" type="button" data-widget-action data-random-student-action="draw" ${totalCount > 0 ? "" : "disabled"}>
      Tirer
    </button>
    <button class="ttp-widget-action-btn" type="button" data-widget-action data-random-student-action="reset">
      Réinit.
    </button>
    <label class="ttp-random-student-toggle" data-widget-action>
      <input type="checkbox" data-random-student-avoid ${avoidRepeats ? "checked" : ""}>
      <span>${avoidRepeats ? "Sans remise" : "Avec remise"}</span>
    </label>
  `;

  controlsHost.querySelector("[data-random-student-action='draw']")?.addEventListener("click", () => {
    sendAction?.("draw");
  });

  controlsHost.querySelector("[data-random-student-action='reset']")?.addEventListener("click", () => {
    sendAction?.("reset");
  });

  controlsHost.querySelector("[data-random-student-avoid]")?.addEventListener("change", (event) => {
    sendAction?.("set-avoid-repeats", {
      avoidRepeats: event.currentTarget.checked === true
    });
  });
}
