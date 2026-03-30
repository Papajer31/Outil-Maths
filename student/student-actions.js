import { studentState } from "./student-state.js";
import {
  normalizeAccessCode,
  accessCodeExists,
  listPublicActivitiesForSpace
} from "./student-api.js";
import {
  clearSelectedActivityMeta,
  ensureSelectedActivityMeta
} from "./student-activity-meta.js";

export async function submitAccessCode(rawValue){
  const code = normalizeAccessCode(rawValue);
  studentState.homeCode = code;

  if (!code){
    studentState.homeMessage = "Entre un code valide.";
    studentState.isCheckingAccessCode = false;
    emitRefresh();
    return;
  }

  studentState.homeMessage = "Vérification du code…";
  studentState.isCheckingAccessCode = true;
  emitRefresh();

  enterFullscreenIfPossible();

  try {
    const exists = await accessCodeExists(code);

    if (!exists){
      studentState.homeMessage = "Code introuvable.";
      studentState.isCheckingAccessCode = false;
      emitRefresh();
      return;
    }

    studentState.accessCode = code;
    studentState.homeCode = code;
    studentState.homeMessage = "";
    studentState.isCheckingAccessCode = false;

    studentState.activities = [];
    studentState.activitiesMessage = "";
    studentState.selectedConfig = null;
    clearSelectedActivityMeta();
    studentState.selectedStudent = null;
    studentState.isLoadingActivities = true;

    persistAccessCode(code);

    window.location.hash = "#/activities";
    emitRefresh();

    void loadActivities();
  } catch (err){
    studentState.homeMessage = err?.message || "Impossible de vérifier le code.";
    studentState.isCheckingAccessCode = false;
    emitRefresh();
  }
}

export function hydrateActivitiesRoute(){
  if (!studentState.accessCode) return;
  if (studentState.isLoadingActivities) return;
  if (studentState.activities.length > 0) return;
  if (studentState.activitiesMessage) return;

  studentState.isLoadingActivities = true;
  emitRefresh();
  void loadActivities();
}

export function goBackHome(){
  studentState.selectedConfig = null;
  clearSelectedActivityMeta();
  studentState.selectedStudent = null;
  window.location.hash = "#/home";
}

export async function selectActivity(configName){
  const cleanName = String(configName || "").trim();
  if (!cleanName) return;

  const found = studentState.activities.find(
    (activity) => String(activity?.config_name || "").trim() === cleanName
  );

  studentState.selectedConfig = found
    ? { ...found }
    : { config_name: cleanName };

  studentState.selectedStudent = null;
  clearSelectedActivityMeta();

  try {
    const meta = await ensureSelectedActivityMeta();
    window.location.hash = meta.requiresStudent ? "#/sessionchoice" : "#/sessionstart";
  } catch {
    window.location.hash = "#/sessionstart";
  }
}

export function startSelectedActivity(){
  if (!studentState.selectedConfig) return;
  window.location.hash = "#/session";
}

export function setSelectedStudent(student){
  studentState.selectedStudent = student ? { ...student } : null;
}

export function goBackToActivities(){
  window.location.hash = "#/activities";
}

export function goBackToSessionChoice(){
  window.location.hash = "#/sessionchoice";
}

export function goBackToSessionStart(){
  window.location.hash = "#/sessionstart";
}

async function loadActivities(){
  try {
    const activities = await listPublicActivitiesForSpace(studentState.accessCode);

    studentState.activities = Array.isArray(activities) ? activities : [];
    studentState.activitiesMessage = studentState.activities.length
      ? ""
      : "Aucune activité disponible.";
  } catch (err){
    studentState.activities = [];
    studentState.activitiesMessage =
      err?.message || "Impossible de charger les activités.";
  } finally {
    studentState.isLoadingActivities = false;
    emitRefresh();
  }
}

function persistAccessCode(code){
  try {
    localStorage.setItem("lastAccessCode", code);
  } catch {}
}

function emitRefresh(){
  window.dispatchEvent(new Event("student:refresh"));
}

function enterFullscreenIfPossible(){
  try {
    if (!document.fullscreenElement){
      const result = document.documentElement.requestFullscreen?.();
      if (result?.catch){
        result.catch(() => {});
      }
    }
  } catch {}
}
