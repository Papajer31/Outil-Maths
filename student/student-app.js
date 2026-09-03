import { readAdminDraftRuntimePayload } from "../shared/admin-draft-runtime-storage.js";
import { studentState } from "./student-state.js";
import { startStudentRouter } from "./student-router.js";
import { hydrateActivitiesRoute, submitAccessCode } from "./student-actions.js";
import { mountPersistentStudentStarfield } from "./student-stars.js";
import {
  bindStudentFullscreenRetry,
  setStudentFullscreenSuppressed
} from "./student-fullscreen.js";
import { mountStudentOrientationGuard } from "./student-orientation-guard.js";
import { installStudentInteractionGuards } from "./student-guards.js";
import {
  buildCatalogActivityConfig,
  normalizeCatalogDifficultyLevel,
  normalizeCatalogRuntimeContext
} from "../shared/catalogue.js";
import { startMaterialIconHydration } from "../shared/material-icons-svg.js";
import { isDevViewportMode } from "../shared/dom-helpers.js";
import { installResponsiveRuntime } from "../shared/responsive-runtime.js";
import { initializeStudentAudioEngine } from "./student-audio.js";

boot();

function boot(){
  installResponsiveRuntime();

  if (isDevViewportMode()) {
    document.documentElement.classList.add("dev-viewport-mode");
    document.body.classList.add("student-dev-viewport-mode");
    setStudentFullscreenSuppressed(true);
  }

  hydrateInitialState();
  if (!hydrateAdminDraftSessionFromUrl()) {
    hydrateSessionFromUrl();
  }
  bindStaticHomeForm();
  mountPersistentStudentStarfield();
  bindStudentFullscreenRetry();
  mountStudentOrientationGuard();
  installStudentInteractionGuards();
  startMaterialIconHydration();
  initializeStudentAudioEngine();

  const appRoot = document.getElementById("studentApp");
  if (!appRoot) return;

  startStudentRouter(appRoot);

  if (String(window.location.hash || "").startsWith("#/activities")){
    hydrateActivitiesRoute();
  }
}

function hydrateInitialState(){
  try {
    const lastAccessCode = localStorage.getItem("lastAccessCode");
    if (lastAccessCode && !studentState.accessCode){
      const code = String(lastAccessCode).trim().toUpperCase();
      studentState.accessCode = code;
      studentState.homeCode = code;
    }
  } catch {}
}

function bindStaticHomeForm(){
  const form = document.getElementById("studentHomeForm");
  const input = document.getElementById("classCode");

  if (!form || !input) return;

  if (studentState.homeCode || studentState.accessCode){
    input.value = String(studentState.homeCode || studentState.accessCode).toUpperCase();
  }

  input.addEventListener("input", () => {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = String(input.value || "").toUpperCase();
    studentState.homeCode = input.value;
    try {
      input.setSelectionRange(start, end);
    } catch {}
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitAccessCode(input.value || "");
    syncStaticHome();
  });

  window.addEventListener("student:refresh", syncStaticHome);

  syncStaticHome();
  window.requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

function syncStaticHome(){
  const input = document.getElementById("classCode");
  const message = document.getElementById("homeMessage");
  const button = document.querySelector("#studentHomeForm button[type='submit']");

  if (input){
    input.value = String(studentState.homeCode || studentState.accessCode || "").toUpperCase();
  }

  if (message){
    const isBusy = !!studentState.isCheckingAccessCode || !!studentState.isLoadingActivities || !!studentState.homeLaunchPhase;
    message.textContent = isBusy ? "" : (studentState.homeMessage || "");
  }

  if (button){
    const isBusy = !!studentState.isCheckingAccessCode || !!studentState.isLoadingActivities || !!studentState.homeLaunchPhase;
    button.disabled = isBusy;
    button.textContent = "Connexion";
  }
}
function hydrateAdminDraftSessionFromUrl(){
  const route = parseHashRoute(window.location.hash);
  const token = String(route.params.get("adminDraftToken") || "").trim();
  if (!token) return false;

  try {
    const payload = readAdminDraftRuntimePayload(token);
    const draftActivity = payload?.activity && typeof payload.activity === "object" ? payload.activity : null;
    if (!draftActivity?.id) return false;

    const difficultyLevel = normalizeCatalogDifficultyLevel(payload.initialLevel || 3);
    const catalogActivities = Array.isArray(payload.catalogActivities) && payload.catalogActivities.length
      ? payload.catalogActivities
      : [draftActivity];
    const runtimeConfig = buildCatalogActivityConfig(draftActivity, {
      difficultyLevel,
      context: "test",
      activityMode: "individual",
      responseUi: "boxed",
      progressMode: "practice",
      adaptive: false,
      catalogActivities
    });

    if (!runtimeConfig || !Array.isArray(runtimeConfig.sequence)) return false;

    const accessCode = String(payload.accessCode || route.params.get("classCode") || "ADMINTEST").trim().toUpperCase();
    const configName = String(draftActivity.id || "__admin_draft_test__").trim();

    setStudentFullscreenSuppressed(true);
    studentState.accessCode = accessCode;
    studentState.homeCode = accessCode;
    studentState.homeMessage = "";
    studentState.activities = catalogActivities;
    studentState.activityFolders = [];
    studentState.activityEntry = "catalog-test";
    studentState.activitiesMode = "individual";
    studentState.hasChosenActivitiesMode = true;
    studentState.selectedConfig = {
      config_name: configName,
      config_json: runtimeConfig,
      module_key: "tools",
      catalog_context: "test",
      catalog_difficulty_level: difficultyLevel,
      admin_draft_runtime: true
    };
    studentState.selectedConfigMeta = null;
    studentState.selectedMission = null;
    studentState.selectedStudent = null;
    studentState.selectedStudents = [];
    studentState.sharedSessionEntry = true;
    studentState.sessionMode = "student";
    studentState.projectedSession = null;
    return true;
  } catch (err) {
    console.warn("Impossible de charger le brouillon admin dans le banc runtime.", err);
    return false;
  }
}

function hydrateSessionFromUrl(){
  const route = parseHashRoute(window.location.hash);
  const params = route.params;
  const isDirectSessionRoute = route.name === "sessionchoice" || route.name === "sessionstart" || route.name === "session";

  if (!isDirectSessionRoute) {
    setStudentFullscreenSuppressed(isDevViewportMode());
    studentState.sharedSessionEntry = false;
    studentState.sessionMode = "student";
    studentState.projectedSession = null;
    return;
  }

  const accessCode = String(params.get("classCode") || params.get("accessCode") || "").trim().toUpperCase();
  const configName = String(params.get("configName") || "").trim();
  const isProjected = params.get("projected") === "1";
  const isSharedSessionEntry = params.get("shared") === "1";
  const catalogRuntimeContext = normalizeCatalogRuntimeContext(
    params.get("catalogContext") || (params.get("catalogTest") === "1" ? "test" : "")
  );
  const catalogDifficultyLevel = normalizeCatalogDifficultyLevel(
    params.get("catalogLevel") || params.get("difficultyLevel") || params.get("catalogDifficultyLevel") || 3
  );

  if (!accessCode || !configName) {
    setStudentFullscreenSuppressed(isDevViewportMode());
    studentState.sharedSessionEntry = false;
    studentState.sessionMode = "student";
    studentState.projectedSession = null;
    return;
  }

  setStudentFullscreenSuppressed(isDevViewportMode() || catalogRuntimeContext === "test");

  studentState.accessCode = accessCode;
  studentState.homeCode = accessCode;
  studentState.homeMessage = "";
  studentState.selectedConfig = {
    config_name: configName,
    catalog_context: catalogRuntimeContext,
    catalog_difficulty_level: catalogDifficultyLevel
  };
  studentState.selectedConfigMeta = null;
  studentState.selectedStudent = null;
  studentState.selectedStudents = [];
  studentState.sharedSessionEntry = isSharedSessionEntry;
  studentState.sessionMode = isProjected ? "projected-teacher" : "student";
  studentState.projectedSession = isProjected
    ? {
        accessCode,
        configName,
        catalogRuntimeContext,
        catalogDifficultyLevel
      }
    : null;
}

function parseHashRoute(rawHash){
  const hash = String(rawHash || "").replace(/^#\/?/, "");
  const [pathPart = "", queryPart = ""] = hash.split("?");

  return {
    name: String(pathPart || "").trim() || "home",
    params: new URLSearchParams(queryPart || "")
  };
}
