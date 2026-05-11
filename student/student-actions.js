import { studentState } from "./student-state.js";
import {
  normalizeAccessCode,
  accessCodeExists,
  listPublicActivitiesForSpace,
  listPublicActivityFoldersForSpace,
  listPublicStudentsForSpace
} from "./student-api.js";
import { DEFAULT_ACTIVITY_MODE, normalizeActivityMode } from "../shared/activity-modes.js";
import { clearSelectedActivityMeta } from "./student-activity-meta.js";
import { markStudentFullscreenWanted } from "./student-fullscreen.js";

let classDataLoadPromise = null;
let classDataLoadAccessCode = "";
let loadedClassDataAccessCode = "";

export async function submitAccessCode(rawValue){
  if (studentState.isCheckingAccessCode || studentState.isLoadingActivities) return;

  const code = normalizeAccessCode(rawValue);
  studentState.homeCode = code;

  if (!code){
    studentState.homeMessage = "Entre un code valide.";
    studentState.isCheckingAccessCode = false;
    studentState.isLoadingActivities = false;
    emitRefresh();
    return;
  }

  studentState.homeMessage = "Vérification du code…";
  studentState.isCheckingAccessCode = true;
  studentState.isLoadingActivities = false;
  emitRefresh();

  markStudentFullscreenWanted();

  try {
    const exists = await accessCodeExists(code);

    if (!exists){
      studentState.homeMessage = "Code introuvable.";
      studentState.isCheckingAccessCode = false;
      studentState.isLoadingActivities = false;
      emitRefresh();
      return;
    }

    studentState.accessCode = code;
    studentState.homeCode = code;
    studentState.homeMessage = "Chargement des activités et des élèves…";
    studentState.isCheckingAccessCode = false;

    studentState.activities = [];
    studentState.activityFolders = [];
    studentState.activitiesMessage = "";
    studentState.activitiesMode = DEFAULT_ACTIVITY_MODE;
    studentState.hasChosenActivitiesMode = false;
    studentState.currentActivityFolderId = null;
    studentState.publicStudents = [];
    studentState.publicStudentsMessage = "";
    studentState.selectedConfig = null;
    clearSelectedActivityMeta();
    studentState.selectedStudent = null;
    studentState.selectedStudents = [];
    studentState.sharedSessionEntry = false;
    studentState.isLoadingActivities = true;

    loadedClassDataAccessCode = "";
    classDataLoadAccessCode = "";
    classDataLoadPromise = null;

    persistAccessCode(code);

    emitRefresh();

    try {
      await ensureClassDataLoaded({ refreshOnComplete: false });
      studentState.homeMessage = "";
      window.location.hash = "#/selectmode";
    } catch (err){
      studentState.homeMessage = err?.message || "Impossible de charger les activités et les élèves.";
      emitRefresh();
    }
  } catch (err){
    studentState.homeMessage = err?.message || "Impossible de vérifier le code.";
    studentState.isCheckingAccessCode = false;
    studentState.isLoadingActivities = false;
    emitRefresh();
  }
}

export function hydrateActivitiesRoute(){
  if (!studentState.accessCode) return;
  void ensureClassDataLoaded({ swallowError: true });
}

export function goBackHome(){
  studentState.activitiesMode = DEFAULT_ACTIVITY_MODE;
  studentState.hasChosenActivitiesMode = false;
  studentState.currentActivityFolderId = null;
  studentState.selectedConfig = null;
  clearSelectedActivityMeta();
  studentState.selectedStudent = null;
  studentState.selectedStudents = [];
  studentState.sharedSessionEntry = false;
  studentState.activitiesMessage = "";
  studentState.publicStudentsMessage = "";
  window.location.hash = "#/home";
}

export function openActivityFolder(folderId){
  studentState.currentActivityFolderId = normalizeFolderId(folderId);
  emitRefresh();
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

  studentState.sharedSessionEntry = false;
  clearSelectedActivityMeta();
  window.location.hash = "#/sessionstart";
}

export function startSelectedActivity(){
  if (!studentState.selectedConfig) return;
  window.location.hash = buildStudentHash("session");
}

export function setSelectedStudent(student){
  const normalized = student ? normalizeStudentRecord(student) : null;
  studentState.selectedStudent = normalized ? { ...normalized } : null;
  studentState.selectedStudents = normalized ? [normalized] : [];
  emitRefresh();
}

export function setSelectedStudents(students){
  const normalized = normalizeStudentSelection(students);
  studentState.selectedStudents = normalized;
  studentState.selectedStudent = null;
  emitRefresh();
}

export function toggleSelectedStudentSelection(student){
  const normalized = normalizeStudentRecord(student);
  if (!normalized) return;

  const currentIds = new Set(
    normalizeStudentSelection(studentState.selectedStudents).map((item) => String(item.id || "").trim())
  );
  const normalizedId = String(normalized.id || "").trim();

  if (currentIds.has(normalizedId)) {
    studentState.selectedStudents = normalizeStudentSelection(studentState.selectedStudents)
      .filter((item) => String(item.id || "").trim() !== normalizedId);
  } else {
    studentState.selectedStudents = [
      ...normalizeStudentSelection(studentState.selectedStudents),
      normalized
    ];
  }

  studentState.selectedStudent = null;
  emitRefresh();
}

export function selectActivitiesMode(mode){
  studentState.activitiesMode = normalizeActivityMode(mode, DEFAULT_ACTIVITY_MODE);
  studentState.hasChosenActivitiesMode = true;
  studentState.currentActivityFolderId = null;
  studentState.selectedConfig = null;
  clearSelectedActivityMeta();
  studentState.selectedStudent = null;
  studentState.selectedStudents = [];
  studentState.sharedSessionEntry = false;
  studentState.activitiesMessage = "";
  studentState.publicStudentsMessage = "";
  emitRefresh();
}

export function goBackToActivities(){
  window.location.hash = buildStudentHash("activities");
}

export function goBackToSelectMode(){
  studentState.currentActivityFolderId = null;
  studentState.selectedConfig = null;
  clearSelectedActivityMeta();
  studentState.selectedStudent = null;
  studentState.selectedStudents = [];
  studentState.sharedSessionEntry = false;
  window.location.hash = "#/selectmode";
}

export function goBackToSelectStudents(){
  studentState.currentActivityFolderId = null;
  studentState.selectedConfig = null;
  clearSelectedActivityMeta();
  studentState.sharedSessionEntry = false;
  window.location.hash = "#/selectstudents";
}

export function goBackToSessionChoice(){
  goBackToSelectStudents();
}

export function goBackToSessionStart(){
  window.location.hash = buildStudentHash("sessionstart");
}

export async function ensureClassDataLoaded(options = {}){
  const {
    refreshOnComplete = true,
    swallowError = false
  } = options;

  const accessCode = normalizeAccessCode(studentState.accessCode);
  if (!accessCode) {
    const error = new Error("Code de classe introuvable.");
    if (swallowError) return false;
    throw error;
  }

  if (loadedClassDataAccessCode === accessCode && !studentState.isLoadingActivities) {
    return true;
  }

  if (classDataLoadPromise && classDataLoadAccessCode === accessCode) {
    return classDataLoadPromise;
  }

  classDataLoadAccessCode = accessCode;
  classDataLoadPromise = loadClassData(accessCode, { refreshOnComplete })
    .then(() => {
      loadedClassDataAccessCode = accessCode;
      return true;
    })
    .catch((err) => {
      loadedClassDataAccessCode = "";
      if (!swallowError) throw err;
      return false;
    })
    .finally(() => {
      classDataLoadPromise = null;
      classDataLoadAccessCode = "";
    });

  return classDataLoadPromise;
}

function persistAccessCode(code){
  try {
    localStorage.setItem("lastAccessCode", code);
  } catch {}
}

function resolveCurrentFolderId(){
  const currentFolderId = normalizeFolderId(studentState.currentActivityFolderId);
  if (!currentFolderId) return null;

  const folderExists = (studentState.activityFolders || []).some(
    (folder) => normalizeFolderId(folder?.id) === currentFolderId
  );

  return folderExists ? currentFolderId : null;
}

function normalizeFolderId(value){
  const folderId = String(value ?? "").trim();
  return folderId || null;
}

function normalizeStudentRecord(student){
  if (!student) return null;

  const id = String(student?.id ?? "").trim();
  if (!id) return null;

  return {
    ...student,
    id
  };
}

function normalizeStudentSelection(students){
  const unique = [];

  for (const student of (Array.isArray(students) ? students : [])) {
    const normalized = normalizeStudentRecord(student);
    if (!normalized) continue;
    if (unique.some((item) => String(item.id || "").trim() === normalized.id)) continue;
    unique.push(normalized);
  }

  return unique;
}

export function getSelectedParticipantsForCurrentMode(){
  const mode = normalizeActivityMode(studentState.activitiesMode, DEFAULT_ACTIVITY_MODE);
  const normalizedSingle = normalizeStudentRecord(studentState.selectedStudent);
  const normalizedSelection = normalizeStudentSelection(studentState.selectedStudents);

  if (mode === "group") {
    return normalizedSelection;
  }

  if (normalizedSingle) {
    return [normalizedSingle];
  }

  if (normalizedSelection.length === 1) {
    return normalizedSelection;
  }

  return [];
}

export function getSelectedParticipantsValidationIssue(meta = null){
  const mode = normalizeActivityMode(studentState.activitiesMode, DEFAULT_ACTIVITY_MODE);
  const participants = getSelectedParticipantsForCurrentMode();

  if (mode === "group") {
    if (participants.length < 2) {
      return "Sélectionne au moins deux élèves pour cette activité.";
    }
  } else if (participants.length !== 1) {
    return "Sélectionne un élève pour démarrer cette activité.";
  }

  const allowedIds = Array.isArray(meta?.allowedStudentIds)
    ? meta.allowedStudentIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];

  if (allowedIds.length) {
    const allowedSet = new Set(allowedIds);
    const invalidParticipant = participants.find((student) => !allowedSet.has(String(student?.id || "").trim()));
    if (invalidParticipant) {
      return "La sélection d’élèves n’est pas compatible avec cette activité.";
    }
  }

  return "";
}

export function hasValidSelectedParticipants(meta = null){
  return !getSelectedParticipantsValidationIssue(meta);
}

async function loadClassData(accessCode, { refreshOnComplete = true } = {}){
  studentState.isLoadingActivities = true;
  studentState.activitiesMessage = "";
  studentState.publicStudentsMessage = "";
  emitRefresh();

  try {
    const [activities, folders, students] = await Promise.all([
      listPublicActivitiesForSpace(accessCode),
      listPublicActivityFoldersForSpace(accessCode),
      listPublicStudentsForSpace(accessCode)
    ]);

    studentState.activities = Array.isArray(activities) ? activities : [];
    studentState.activityFolders = Array.isArray(folders) ? folders : [];
    studentState.publicStudents = Array.isArray(students) ? students : [];
    studentState.currentActivityFolderId = resolveCurrentFolderId();
    studentState.activitiesMessage = (studentState.activities.length || studentState.activityFolders.length)
      ? ""
      : "Aucune activité disponible.";
    studentState.publicStudentsMessage = studentState.publicStudents.length
      ? ""
      : "Aucun élève disponible dans cette classe.";
    loadedClassDataAccessCode = accessCode;
    return {
      activities: studentState.activities,
      activityFolders: studentState.activityFolders,
      publicStudents: studentState.publicStudents
    };
  } catch (err){
    studentState.activities = [];
    studentState.activityFolders = [];
    studentState.publicStudents = [];
    studentState.currentActivityFolderId = null;
    const message = err?.message || "Impossible de charger les données de classe.";
    studentState.activitiesMessage = message;
    studentState.publicStudentsMessage = message;
    loadedClassDataAccessCode = "";
    throw err instanceof Error ? err : new Error(message);
  } finally {
    studentState.isLoadingActivities = false;
    if (refreshOnComplete) {
      emitRefresh();
    }
  }
}

function buildStudentHash(routeName){
  const cleanRoute = String(routeName || "home").trim() || "home";
  const shouldPreserveSharedContext = studentState.sharedSessionEntry === true
    && (cleanRoute === "sessionchoice" || cleanRoute === "sessionstart" || cleanRoute === "session");

  if (studentState.sessionMode !== "projected-teacher" && !shouldPreserveSharedContext) {
    return `#/${cleanRoute}`;
  }

  const accessCode = normalizeAccessCode(
    studentState.projectedSession?.accessCode || studentState.accessCode || ""
  );
  const configName = String(
    studentState.projectedSession?.configName || studentState.selectedConfig?.config_name || ""
  ).trim();

  if (!accessCode || !configName) {
    return `#/${cleanRoute}`;
  }

  const params = new URLSearchParams();
  params.set("classCode", accessCode);
  params.set("configName", configName);

  if (studentState.sessionMode === "projected-teacher") {
    params.set("projected", "1");
  }

  if (shouldPreserveSharedContext) {
    params.set("shared", "1");
  }

  return `#/${cleanRoute}?${params.toString()}`;
}


function emitRefresh(){
  window.dispatchEvent(new Event("student:refresh"));
}

