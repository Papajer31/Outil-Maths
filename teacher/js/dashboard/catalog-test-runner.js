import { studentState } from "../../../student/student-state.js";
import { renderSessionView } from "../../../student/views/session-view.js";
import { buildCatalogActivityConfig, normalizeCatalogDifficultyLevel } from "../../../shared/catalogue.js";

const LEVELS = [1, 2, 3, 4, 5];

export function mountCatalogTestRunner({
  host,
  accessCode,
  activity,
  catalogActivities = [],
  onClose = null,
  showToast = null,
  initialLevel = 3,
  titleLabel = "Test de l’activité"
} = {}){
  const safeAccessCode = String(accessCode || "").trim().toUpperCase();
  const safeActivity = activity && typeof activity === "object" ? activity : null;

  if (!host || !safeAccessCode || !safeActivity?.id) {
    showToast?.("Impossible d’ouvrir le test de cette activité.", { isError: true });
    return null;
  }

  const snapshot = captureStudentState();
  let activeLevel = normalizeCatalogDifficultyLevel(initialLevel);
  let cleanupSession = null;
  let disposed = false;
  let fullscreenActive = false;

  host.innerHTML = `
    <section class="dashboard-catalog-test-panel" data-catalog-test-panel>
      <div class="dashboard-catalog-test-header">
        <div class="dashboard-catalog-test-title-wrap">
          <span class="dashboard-catalog-test-title">${escapeHtml(titleLabel)}</span>
          <span class="dashboard-catalog-test-subtitle">${escapeHtml(safeActivity.config_name || safeActivity.title || safeActivity.id)}</span>
        </div>
        <div class="dashboard-catalog-test-actions">
          <div class="dashboard-catalog-test-levels" role="group" aria-label="Niveau de difficulté">
            <span class="dashboard-catalog-test-level-pill" aria-hidden="true"></span>
            ${LEVELS.map((level) => renderLevelButton(level, activeLevel)).join("")}
          </div>
          <button class="btn" type="button" data-action="restart-test">Relancer</button>
          <button class="btn" type="button" data-action="toggle-fullscreen-test">Plein écran</button>
          <button class="btn" type="button" data-action="close-test">Fermer</button>
        </div>
      </div>
      <div class="dashboard-catalog-test-native-wrap" data-catalog-test-fullscreen-target>
        <div class="dashboard-catalog-test-native-root" data-catalog-test-root></div>
      </div>
    </section>
  `;

  const panel = host.querySelector("[data-catalog-test-panel]");
  const root = host.querySelector("[data-catalog-test-root]");
  const fullscreenTarget = host.querySelector("[data-catalog-test-fullscreen-target]");
  const levelGroup = host.querySelector(".dashboard-catalog-test-levels");
  const fullscreenButton = host.querySelector("[data-action='toggle-fullscreen-test']");
  const isFloatingHost = host.classList.contains("dashboard-catalog-test-floating-host");

  if (isFloatingHost) {
    panel?.classList.add("is-full-dashboard-window");
  }

  syncLevelButtons();
  mountSession();

  host.querySelectorAll("[data-action='set-test-level']").forEach((button) => {
    button.addEventListener("click", () => {
      const nextLevel = normalizeCatalogDifficultyLevel(button.dataset.level);
      if (nextLevel === activeLevel) return;
      activeLevel = nextLevel;
      syncLevelButtons();
      mountSession();
    });
  });

  host.querySelector("[data-action='restart-test']")?.addEventListener("click", () => {
    mountSession();
  });

  fullscreenButton?.addEventListener("click", () => {
    toggleNativeFullscreen();
  });

  host.querySelector("[data-action='close-test']")?.addEventListener("click", close);
  window.addEventListener("keydown", handleEscape);
  document.addEventListener("fullscreenchange", syncFullscreenState);

  return { close, destroy };

  function mountSession(){
    if (disposed || !root) return;

    cleanupCurrentSession();
    root.innerHTML = `<div class="dashboard-catalog-test-loading">Chargement du test…</div>`;

    const runtimeConfig = buildCatalogActivityConfig(safeActivity, {
      difficultyLevel: activeLevel,
      context: "test",
      activityMode: "individual",
      responseUi: "boxed",
      progressMode: "practice",
      adaptive: false,
      catalogActivities
    });

    if (!runtimeConfig || !Array.isArray(runtimeConfig.sequence)) {
      root.innerHTML = `
        <div class="dashboard-catalog-test-error">
          Impossible de construire le test de cette activité.
        </div>
      `;
      return;
    }

    applyStudentStateForTest(runtimeConfig);
    cleanupSession = renderSessionView(root);
  }

  function applyStudentStateForTest(runtimeConfig){
    studentState.accessCode = safeAccessCode;
    studentState.homeCode = safeAccessCode;
    studentState.activities = Array.isArray(catalogActivities) ? catalogActivities : [];
    studentState.activityFolders = [];
    studentState.activityEntry = "catalog-test";
    studentState.activitiesMode = "individual";
    studentState.hasChosenActivitiesMode = true;
    studentState.selectedConfig = {
      config_name: safeActivity.id,
      config_json: runtimeConfig,
      module_key: "tools",
      catalog_context: "test",
      catalog_difficulty_level: activeLevel,
      catalogTestClose: close
    };
    studentState.selectedConfigMeta = null;
    studentState.selectedMission = null;
    studentState.selectedStudent = null;
    studentState.selectedStudents = [];
    studentState.sharedSessionEntry = true;
    studentState.sessionMode = "student";
    studentState.projectedSession = null;
  }

  function syncLevelButtons(){
    levelGroup?.style.setProperty("--catalog-test-level-offset", `${(activeLevel - 1) * 100}%`);
    host.querySelectorAll("[data-action='set-test-level']").forEach((button) => {
      const selected = Number(button.dataset.level) === activeLevel;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  }

  async function toggleNativeFullscreen(){
    if (!fullscreenTarget) return;

    if (isFullscreenForTest()) {
      try {
        await document.exitFullscreen?.();
      } catch {
        showToast?.("Impossible de quitter le plein écran automatiquement.", { isError: true });
      }
      return;
    }

    if (typeof fullscreenTarget.requestFullscreen !== "function") {
      showToast?.("Le plein écran réel n’est pas disponible dans ce navigateur.", { isError: true });
      return;
    }

    try {
      await fullscreenTarget.requestFullscreen({ navigationUI: "hide" });
    } catch {
      showToast?.("Le navigateur a refusé le plein écran.", { isError: true });
    }
  }

  function isFullscreenForTest(){
    const current = document.fullscreenElement;
    return !!current && (current === fullscreenTarget || fullscreenTarget?.contains?.(current));
  }

  function syncFullscreenState(){
    fullscreenActive = isFullscreenForTest();
    panel?.classList.toggle("is-native-fullscreen", fullscreenActive);
    fullscreenTarget?.classList.toggle("is-native-fullscreen", fullscreenActive);
    document.body.classList.toggle("dashboard-catalog-test-fullscreen-lock", fullscreenActive);
    if (fullscreenButton) {
      fullscreenButton.textContent = fullscreenActive ? "Réduire" : "Plein écran";
    }

    window.setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 0);
  }

  function cleanupCurrentSession(){
    if (typeof cleanupSession === "function") {
      try {
        cleanupSession();
      } catch {}
    }
    cleanupSession = null;
  }

  function destroy(){
    if (disposed) return;
    disposed = true;
    cleanupCurrentSession();
    restoreStudentState(snapshot);
    window.removeEventListener("keydown", handleEscape);
    document.removeEventListener("fullscreenchange", syncFullscreenState);
    document.body.classList.remove("dashboard-catalog-test-fullscreen-lock");

    if (isFullscreenForTest()) {
      try {
        document.exitFullscreen?.();
      } catch {}
    }
  }

  function close(){
    if (disposed) return;
    destroy();
    if (typeof onClose === "function") {
      onClose();
    }
  }

  function handleEscape(event){
    if (event.key !== "Escape") return;
    if (fullscreenActive) {
      return;
    }
    event.preventDefault();
    close();
  }
}

export function openCatalogTestRunner(options = {}){
  const overlay = document.createElement("div");
  overlay.className = "dashboard-catalog-test-floating-host";
  overlay.dataset.catalogTestFloatingHost = "true";
  document.body.appendChild(overlay);

  const controller = mountCatalogTestRunner({
    ...options,
    host: overlay,
    onClose: () => {
      overlay.remove();
      options.onClose?.();
    }
  });

  if (!controller) {
    overlay.remove();
    return null;
  }

  requestAnimationFrame(() => {
    window.dispatchEvent(new Event("resize"));
  });

  return {
    close: controller.close,
    destroy: () => {
      controller.destroy?.();
      overlay.remove();
      options.onClose?.();
    }
  };
}

function renderLevelButton(level, activeLevel){
  const selected = level === activeLevel;
  return `
    <button
      class="dashboard-catalog-test-level-btn ${selected ? "is-active" : ""}"
      type="button"
      data-action="set-test-level"
      data-level="${level}"
      aria-pressed="${selected ? "true" : "false"}"
    >Niv.${level}</button>
  `;
}

function captureStudentState(){
  return {
    accessCode: studentState.accessCode,
    homeCode: studentState.homeCode,
    activities: studentState.activities,
    activityFolders: studentState.activityFolders,
    activityEntry: studentState.activityEntry,
    activitiesMode: studentState.activitiesMode,
    hasChosenActivitiesMode: studentState.hasChosenActivitiesMode,
    selectedConfig: studentState.selectedConfig,
    selectedConfigMeta: studentState.selectedConfigMeta,
    selectedMission: studentState.selectedMission,
    selectedStudent: studentState.selectedStudent,
    selectedStudents: studentState.selectedStudents,
    sharedSessionEntry: studentState.sharedSessionEntry,
    sessionMode: studentState.sessionMode,
    projectedSession: studentState.projectedSession
  };
}

function restoreStudentState(snapshot){
  if (!snapshot || typeof snapshot !== "object") return;
  Object.assign(studentState, snapshot);
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
