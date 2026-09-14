import { studentState } from "../../student/student-state.js";
import { renderSessionView } from "../../student/views/session-view.js";
import { buildCatalogActivityConfig, buildMissionRuntimeConfig, normalizeCatalogDifficultyLevel } from "../../shared/catalogue.js";
import { renderMaterialIcon, setMaterialIcon } from "../../shared/material-icons-svg.js";

const root = document.querySelector("#catalogTestWindowRoot");
let currentToken = "";
let currentPayload = null;
let cleanupSession = null;
let disposed = false;

window.__allowProjectedUnload = true;

window.addEventListener("message", handleMessage);
window.addEventListener("beforeunload", () => notifyClosed(currentToken));
document.addEventListener("fullscreenchange", syncFullscreenButton);

notifyReady();

function handleMessage(event) {
  if (!window.opener || event.source !== window.opener) return;
  if (event.origin !== window.location.origin) return;

  const message = event.data && typeof event.data === "object" ? event.data : null;
  if (message?.type !== "odapp:catalog-test:load") return;

  const token = String(message.token || "").trim();
  const payload = message.payload && typeof message.payload === "object" ? message.payload : null;
  if (!token || !payload) return;

  currentToken = token;
  currentPayload = payload;
  void mountPayload(payload);
}

async function mountPayload(payload) {
  if (!root) return;
  disposed = false;
  cleanupCurrentSession();

  const kind = String(payload?.kind || "activity").trim().toLowerCase() === "mission" ? "mission" : "activity";
  const activity = kind === "activity" && payload.activity && typeof payload.activity === "object" ? payload.activity : null;
  const mission = kind === "mission" && payload.mission && typeof payload.mission === "object" ? payload.mission : null;
  const missionSteps = kind === "mission" && Array.isArray(payload.missionSteps) ? payload.missionSteps : [];
  const accessCode = String(payload.accessCode || "").trim().toUpperCase();
  const catalogActivities = Array.isArray(payload.catalogActivities) ? payload.catalogActivities : [];
  const showLevelSelector = kind === "mission" ? false : payload.showLevelSelector !== false;
  const initialLevel = normalizeCatalogDifficultyLevel(payload.initialLevel ?? 3);
  const validSource = kind === "mission"
    ? Boolean(mission?.id && missionSteps.length)
    : Boolean(activity?.id);

  if (!validSource || !accessCode) {
    showError("Configuration invalide", kind === "mission"
      ? "Impossible de préparer cette mission."
      : "Impossible de préparer ce test.");
    return;
  }

  const sourceTitle = kind === "mission"
    ? String(mission?.title || payload.titleLabel || "Mission")
    : String(activity?.config_name || activity?.title || payload.titleLabel || "Test");
  document.title = `${sourceTitle} — Test / Projection`;
  root.classList.toggle("is-quiz-test", !showLevelSelector);
  root.innerHTML = `
    <div class="catalog-test-window-waiting">
      <strong>${escapeHtml(payload.titleLabel || (kind === "mission" ? "Projection de la mission" : "Test / Projection"))}</strong>
      <span>Préparation du runtime…</span>
    </div>
  `;

  const runtimeConfig = kind === "mission"
    ? buildMissionRuntimeConfig(mission, missionSteps, {
        activityMode: "individual",
        catalogActivities
      })
    : buildRuntimeConfig({
        activity,
        catalogActivities,
        level: initialLevel,
        runtimeConfigOptions: payload.runtimeConfigOptions
      });

  if (!runtimeConfig || !Array.isArray(runtimeConfig.sequence) || !runtimeConfig.sequence.length) {
    showError("Configuration invalide", kind === "mission"
      ? "Impossible de construire le runtime de cette mission."
      : "Impossible de construire le runtime de cette activité.");
    return;
  }

  if (kind === "mission" && runtimeConfig.sequence.length !== missionSteps.length) {
    showError("Mission incomplète", "Une des étapes de la mission est introuvable ou ne peut pas être projetée.");
    return;
  }

  const playlist = kind === "mission"
    ? buildMissionPlaylistMeta(runtimeConfig)
    : buildPlaylistMeta(activity, runtimeConfig, initialLevel);

  applyStudentState({
    kind,
    accessCode,
    activity,
    mission,
    missionSteps,
    catalogActivities,
    runtimeConfig,
    playlist,
    level: initialLevel,
    runtimeConfigOptions: payload.runtimeConfigOptions
  });

  root.replaceChildren();

  try {
    cleanupSession = renderSessionView(root);
    decorateTeacherDock({ showLevelSelector });
    window.setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
  } catch (error) {
    console.error(error);
    cleanupCurrentSession();
    showError("Erreur de lancement", kind === "mission"
      ? "Le runtime de la mission n’a pas pu démarrer."
      : "Le runtime de l’activité n’a pas pu démarrer.");
  }
}

function buildRuntimeConfig({ activity, catalogActivities, level, runtimeConfigOptions }) {
  const runtimeConfig = buildCatalogActivityConfig(activity, {
    difficultyLevel: normalizeCatalogDifficultyLevel(level),
    context: "test",
    activityMode: "individual",
    responseUi: "boxed",
    progressMode: "practice",
    adaptive: false,
    catalogActivities
  });

  applyRuntimeConfigOptions(runtimeConfig, runtimeConfigOptions);
  return runtimeConfig;
}

function buildPlaylistMeta(activity, runtimeConfig, level) {
  const firstItem = runtimeConfig?.sequence?.[0] || null;
  return [{
    id: `catalog-test-${String(activity.id || "activity")}`,
    activityId: String(activity.id || ""),
    activityLabel: String(activity.config_name || activity.title || "Activité"),
    level: normalizeCatalogDifficultyLevel(level),
    instanceId: String(firstItem?.instanceId || "")
  }];
}

function buildMissionPlaylistMeta(runtimeConfig) {
  return (Array.isArray(runtimeConfig?.sequence) ? runtimeConfig.sequence : []).map((item, index) => ({
    id: String(item?.mission_step_id || item?.instanceId || `mission-step-${index + 1}`),
    activityId: String(item?.catalog_activity_id || ""),
    activityLabel: String(item?.catalog_activity_title || `Outil ${index + 1}`),
    level: normalizeCatalogDifficultyLevel(item?.catalog_difficulty_level ?? 3),
    instanceId: String(item?.instanceId || "")
  }));
}

function applyStudentState({
  kind = "activity",
  accessCode,
  activity,
  mission,
  missionSteps,
  catalogActivities,
  runtimeConfig,
  playlist,
  level,
  runtimeConfigOptions
}) {
  const isMission = kind === "mission";
  const sourceId = String(isMission ? mission?.id : activity?.id || "");
  const sourceTitle = String(isMission
    ? mission?.title || "Mission"
    : activity?.config_name || activity?.title || "Activité");
  const firstRuntimeItem = runtimeConfig?.sequence?.[0] || null;
  const firstLevel = normalizeCatalogDifficultyLevel(
    firstRuntimeItem?.catalog_difficulty_level ?? level ?? 3
  );
  const configName = `${isMission ? "mission-projection" : "catalog-test-window"}-${sanitizeId(sourceId)}`;

  studentState.accessCode = accessCode;
  studentState.homeCode = accessCode;
  studentState.activities = catalogActivities.length
    ? catalogActivities
    : (activity ? [activity] : []);
  studentState.activityFolders = [];
  studentState.activityEntry = "projected-teacher";
  studentState.activitiesMode = "individual";
  studentState.hasChosenActivitiesMode = true;
  studentState.selectedConfig = {
    id: isMission ? sourceId : undefined,
    mission_id: isMission ? sourceId : undefined,
    config_name: sourceTitle,
    catalog_activity_id: String(firstRuntimeItem?.catalog_activity_id || activity?.id || ""),
    config_json: runtimeConfig,
    module_key: "tools",
    catalog_context: isMission ? "mission" : "test",
    catalog_difficulty_level: firstLevel
  };
  studentState.selectedConfigMeta = null;
  // Une projection de mission est volontairement hors progression élève :
  // on n'attache donc jamais selectedMission au runtime projeté.
  studentState.selectedMission = null;
  studentState.selectedStudent = null;
  studentState.selectedStudents = [];
  studentState.sharedSessionEntry = true;
  studentState.sessionMode = "projected-teacher";
  studentState.projectedSession = {
    catalogDifficultyLevel: firstLevel,
    catalogRuntimeContext: isMission ? "mission" : "test",
    playlist,
    buildRuntimeConfig: isMission
      ? () => buildMissionRuntimeConfig(mission, missionSteps, {
          activityMode: "individual",
          catalogActivities
        })
      : (nextPlaylist) => {
          const nextLevel = normalizeCatalogDifficultyLevel(nextPlaylist?.[0]?.level ?? level);
          return buildRuntimeConfig({
            activity,
            catalogActivities,
            level: nextLevel,
            runtimeConfigOptions
          });
        },
    sendTeacherAction: () => {}
  };
}

function decorateTeacherDock({ showLevelSelector }) {
  const dock = root.querySelector("#projectedTeacherDock");
  if (!dock) return;

  const levelBlock = dock.querySelector(".projected-teacher-level-block");
  if (levelBlock) levelBlock.hidden = !showLevelSelector;

  const separator = document.createElement("div");
  separator.className = "catalog-test-window-dock-separator";
  separator.setAttribute("aria-hidden", "true");

  const fullscreenButton = document.createElement("button");
  fullscreenButton.id = "btnCatalogTestWindowFullscreen";
  fullscreenButton.className = "projected-teacher-dock-btn";
  fullscreenButton.type = "button";
  fullscreenButton.dataset.skipAutofs = "true";
  fullscreenButton.title = "Plein écran";
  fullscreenButton.setAttribute("aria-label", "Plein écran");
  fullscreenButton.innerHTML = `
    ${renderMaterialIcon("fullscreen", { className: "student-icon projected-teacher-dock-icon catalog-test-window-control-icon", id: "catalogTestWindowFullscreenIcon" })}
    <span data-fullscreen-label>Plein écran</span>
  `;
  fullscreenButton.addEventListener("click", toggleFullscreen);

  const closeButton = document.createElement("button");
  closeButton.className = "projected-teacher-dock-btn catalog-test-window-close-btn";
  closeButton.type = "button";
  closeButton.dataset.skipAutofs = "true";
  closeButton.title = "Fermer la fenêtre";
  closeButton.setAttribute("aria-label", "Fermer la fenêtre");
  closeButton.innerHTML = `
    ${renderMaterialIcon("close", { className: "student-icon projected-teacher-dock-icon catalog-test-window-control-icon" })}
    <span>Fermer</span>
  `;
  closeButton.addEventListener("click", closeWindow);

  dock.append(separator, fullscreenButton, closeButton);
  syncFullscreenButton();
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen?.();
    } else {
      await document.documentElement.requestFullscreen?.({ navigationUI: "hide" });
    }
  } catch (error) {
    console.warn("Impossible de modifier le plein écran.", error);
  }
}

function syncFullscreenButton() {
  const button = root?.querySelector("#btnCatalogTestWindowFullscreen");
  if (!button) return;

  const isFullscreen = Boolean(document.fullscreenElement);
  const label = isFullscreen ? "Réduire" : "Plein écran";
  const icon = button.querySelector("#catalogTestWindowFullscreenIcon");
  const text = button.querySelector("[data-fullscreen-label]");

  button.title = label;
  button.setAttribute("aria-label", label);
  if (text) text.textContent = label;
  if (icon) setMaterialIcon(icon, isFullscreen ? "fullscreen_exit" : "fullscreen");

  window.setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
}

async function closeWindow() {
  const token = currentToken;
  notifyClosed(token);
  cleanupCurrentSession();
  disposed = true;

  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen?.();
    }
  } catch {}

  try {
    window.close();
  } catch {}
}

function cleanupCurrentSession() {
  if (typeof cleanupSession === "function") {
    try {
      cleanupSession();
    } catch {}
  }
  cleanupSession = null;
  studentState.projectedSession = null;
}

function notifyReady() {
  try {
    window.opener?.postMessage({ type: "odapp:catalog-test:ready" }, window.location.origin);
  } catch {}
}

function notifyClosed(token) {
  const safeToken = String(token || "").trim();
  if (!safeToken) return;
  try {
    window.opener?.postMessage({
      type: "odapp:catalog-test:closed",
      token: safeToken
    }, window.location.origin);
  } catch {}
}

function showError(title, text) {
  if (!root || disposed) return;
  root.innerHTML = `
    <div class="catalog-test-window-error">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(text)}</span>
    </div>
  `;
}

function applyRuntimeConfigOptions(runtimeConfig, options) {
  if (!runtimeConfig || !Array.isArray(runtimeConfig.sequence)) return runtimeConfig;
  if (!options || typeof options !== "object" || Array.isArray(options)) return runtimeConfig;

  const firstItem = runtimeConfig.sequence[0];
  if (!firstItem || typeof firstItem !== "object") return runtimeConfig;
  if (!firstItem.draft || typeof firstItem.draft !== "object" || Array.isArray(firstItem.draft)) {
    firstItem.draft = {};
  }

  if (Object.prototype.hasOwnProperty.call(options, "settings")) {
    firstItem.draft.settings = cloneValue(options.settings);
  }

  if (Object.prototype.hasOwnProperty.call(options, "questionCount")) {
    const questionCount = Math.trunc(Number(options.questionCount));
    if (Number.isFinite(questionCount) && questionCount > 0) {
      firstItem.draft.questionCount = questionCount;
    }
  }

  return runtimeConfig;
}

function cloneValue(value) {
  if (value == null) return value;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {}
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function sanitizeId(value) {
  return String(value || "activity").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80) || "activity";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
