import { studentState } from "./student-state.js";
import { renderHomeView } from "./views/home-view.js";
import { renderSelectModeView } from "./views/selectmode-view.js";
import { renderSelectStudentsView } from "./views/selectstudents-view.js";
import { renderActivitiesView } from "./views/activities-view.js";
import { renderSessionStartView } from "./views/sessionstart-view.js";
import { renderSessionChoiceView } from "./views/sessionchoice-view.js";
import { renderSessionView } from "./views/session-view.js";
import { syncPersistentStudentStarfield } from "./student-stars.js";
import { syncStudentAudioForRoute } from "./student-audio.js";

const ROUTES = {
  home: renderHomeView,
  selectmode: renderSelectModeView,
  selectstudents: renderSelectStudentsView,
  activities: renderActivitiesView,
  sessionchoice: renderSessionChoiceView,
  sessionstart: renderSessionStartView,
  session: renderSessionView
};

let appRoot = null;
let currentCleanup = null;
let currentRouteName = "";
let currentAnimationToken = 0;

export function startStudentRouter(root){
  appRoot = root;

  window.addEventListener("hashchange", renderCurrentRoute);
  window.addEventListener("student:refresh", renderCurrentRoute);

  if (!getRouteName()){
    window.location.hash = "#/home";
    return;
  }

  renderCurrentRoute();
}

function renderCurrentRoute(){
  if (!appRoot) return;

  const route = parseCurrentRoute();
  const routeName = route.name || "home";
  const routeChanged = routeName !== currentRouteName;
  const isDirectSessionEntry = route.isSharedSessionEntry || route.isProjectedTeacherEntry || route.isCatalogTestEntry;

  if (routeName !== "home" && !studentState.accessCode){
    window.location.hash = "#/home";
    return;
  }

  if (routeName === "sessionchoice"){
    if (isDirectSessionEntry){
      window.location.hash = buildRedirectHash("sessionstart", route.search);
    } else {
      window.location.hash = studentState.hasChosenActivitiesMode ? "#/selectstudents" : "#/selectmode";
    }
    return;
  }

  if (!isDirectSessionEntry && requiresChosenMode(routeName) && !studentState.hasChosenActivitiesMode){
    window.location.hash = "#/selectmode";
    return;
  }

  if (!isDirectSessionEntry && requiresSelectedParticipants(routeName) && hasMissingSelectedParticipants()){
    window.location.hash = "#/selectstudents";
    return;
  }

  if ((routeName === "sessionstart" || routeName === "session") && !studentState.selectedConfig){
    window.location.hash = "#/activities";
    return;
  }

  if (typeof currentCleanup === "function"){
    try {
      currentCleanup();
    } catch {}
    currentCleanup = null;
  }

  const render = ROUTES[routeName] || ROUTES.home;

  if (routeChanged){
    currentRouteName = routeName;
  }

  applyBodyRouteClass(routeName);
  syncPersistentStudentStarfield(routeName);

  if (routeChanged){
    currentAnimationToken += 1;
    appRoot.classList.remove("student-route-fade-in");
    appRoot.classList.add("student-route-fade-prep");
  }

  const cleanup = render(appRoot);
  syncStudentAudioForRoute(routeName);
  if (typeof cleanup === "function"){
    currentCleanup = cleanup;
  }

  if (routeChanged){
    const animationToken = currentAnimationToken;
    window.requestAnimationFrame(() => {
      if (!appRoot || animationToken !== currentAnimationToken) return;
      window.requestAnimationFrame(() => {
        if (!appRoot || animationToken !== currentAnimationToken) return;
        appRoot.classList.remove("student-route-fade-prep");
        appRoot.classList.add("student-route-fade-in");
      });
    });
  }
}

function getRouteName(){
  return parseCurrentRoute().name;
}

function parseCurrentRoute(){
  const rawHash = String(window.location.hash || "");
  const normalizedHash = rawHash.replace(/^#\/?/, "");
  const [rawPath = "", rawQuery = ""] = normalizedHash.split("?");
  const name = String(rawPath || "").trim() || "home";
  const params = new URLSearchParams(rawQuery || "");

  return {
    name,
    search: rawQuery ? `?${rawQuery}` : "",
    isSharedSessionEntry: params.get("shared") === "1",
    isProjectedTeacherEntry: params.get("projected") === "1",
    isCatalogTestEntry: params.get("catalogTest") === "1" || params.get("catalogContext") === "test"
  };
}

function requiresChosenMode(routeName){
  return routeName === "selectstudents"
    || routeName === "activities"
    || routeName === "sessionstart"
    || routeName === "session";
}

function requiresSelectedParticipants(routeName){
  return routeName === "activities"
    || routeName === "sessionstart"
    || routeName === "session";
}

function hasMissingSelectedParticipants(){
  const mode = String(studentState.activitiesMode || "").trim().toLowerCase() === "group"
    ? "group"
    : "individual";
  const selectedStudents = Array.isArray(studentState.selectedStudents)
    ? studentState.selectedStudents.filter(Boolean).map((student) => String(student?.id || "").trim()).filter(Boolean)
    : [];
  const uniqueSelectedIds = [...new Set(selectedStudents)];
  const selectedStudentId = String(studentState.selectedStudent?.id || "").trim();

  if (mode === "group") {
    return uniqueSelectedIds.length < 2;
  }

  if (selectedStudentId) return false;
  return uniqueSelectedIds.length !== 1;
}

function buildRedirectHash(routeName, search = ""){
  const cleanRoute = String(routeName || "home").trim() || "home";
  return `#/${cleanRoute}${String(search || "")}`;
}

function applyBodyRouteClass(routeName){
  document.body.classList.remove(
    "student-route-home",
    "student-route-selectmode",
    "student-route-selectstudents",
    "student-route-activities",
    "student-route-sessionchoice",
    "student-route-sessionstart",
    "student-route-session"
  );

  document.body.classList.add(`student-route-${routeName}`);
}
