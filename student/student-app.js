import { studentState } from "./student-state.js";
import { startStudentRouter } from "./student-router.js";
import { hydrateActivitiesRoute, submitAccessCode } from "./student-actions.js";
import { mountPersistentStudentStarfield } from "./student-stars.js";
import { bindStudentFullscreenRetry } from "./student-fullscreen.js";
import { mountStudentOrientationGuard } from "./student-orientation-guard.js";

boot();

function boot(){
  hydrateInitialState();
  hydrateSessionFromUrl();
  bindStaticHomeForm();
  mountPersistentStudentStarfield();
  bindStudentFullscreenRetry();
  mountStudentOrientationGuard();

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
}

function syncStaticHome(){
  const input = document.getElementById("classCode");
  const message = document.getElementById("homeMessage");
  const button = document.querySelector("#studentHomeForm button[type='submit']");

  if (input){
    input.value = String(studentState.homeCode || studentState.accessCode || "").toUpperCase();
  }

  if (message){
    message.textContent = studentState.homeMessage || "";
  }

  if (button){
    const isBusy = !!studentState.isCheckingAccessCode || !!studentState.isLoadingActivities;
    button.disabled = isBusy;
    button.textContent = studentState.isLoadingActivities
      ? "Chargement…"
      : (studentState.isCheckingAccessCode ? "Vérification…" : "Connexion");
  }
}
function hydrateSessionFromUrl(){
  const route = parseHashRoute(window.location.hash);
  const params = route.params;
  const isDirectSessionRoute = route.name === "sessionchoice" || route.name === "sessionstart" || route.name === "session";

  if (!isDirectSessionRoute) {
    studentState.sharedSessionEntry = false;
    studentState.sessionMode = "student";
    studentState.projectedSession = null;
    return;
  }

  const accessCode = String(params.get("classCode") || params.get("accessCode") || "").trim().toUpperCase();
  const configName = String(params.get("configName") || "").trim();
  const isProjected = params.get("projected") === "1";
  const isSharedSessionEntry = params.get("shared") === "1";

  if (!accessCode || !configName) {
    studentState.sharedSessionEntry = false;
    studentState.sessionMode = "student";
    studentState.projectedSession = null;
    return;
  }

  studentState.accessCode = accessCode;
  studentState.homeCode = accessCode;
  studentState.homeMessage = "";
  studentState.selectedConfig = { config_name: configName };
  studentState.selectedConfigMeta = null;
  studentState.selectedStudent = null;
  studentState.selectedStudents = [];
  studentState.sharedSessionEntry = isSharedSessionEntry;
  studentState.sessionMode = isProjected ? "projected-teacher" : "student";
  studentState.projectedSession = isProjected
    ? {
        accessCode,
        configName
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
