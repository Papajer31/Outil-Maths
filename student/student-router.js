import { studentState } from "./student-state.js";
import { renderHomeView } from "./views/home-view.js";
import { renderActivitiesView } from "./views/activities-view.js";
import { renderSessionStartView } from "./views/sessionstart-view.js";
import { renderSessionChoiceView } from "./views/sessionchoice-view.js";
import { renderSessionView } from "./views/session-view.js";

const ROUTES = {
  home: renderHomeView,
  activities: renderActivitiesView,
  sessionchoice: renderSessionChoiceView,
  sessionstart: renderSessionStartView,
  session: renderSessionView
};

let appRoot = null;
let currentCleanup = null;

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

  const routeName = getRouteName() || "home";

  if (routeName !== "home" && !studentState.accessCode){
    window.location.hash = "#/home";
    return;
  }

  if ((routeName === "sessionchoice" || routeName === "sessionstart" || routeName === "session") && !studentState.selectedConfig){
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

  applyBodyRouteClass(routeName);

  const cleanup = render(appRoot);
  if (typeof cleanup === "function"){
    currentCleanup = cleanup;
  }
}

function getRouteName(){
  const rawHash = String(window.location.hash || "");
  return rawHash.replace(/^#\/?/, "").split("?")[0].trim();
}

function applyBodyRouteClass(routeName){
  document.body.classList.remove(
    "student-route-home",
    "student-route-activities",
    "student-route-sessionchoice",
    "student-route-sessionstart",
    "student-route-session"
  );

  document.body.classList.add(`student-route-${routeName}`);
}
