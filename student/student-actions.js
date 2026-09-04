import { studentState } from "./student-state.js";
import {
  normalizeAccessCode,
  accessCodeExists,
  listPublicActivitiesForSpace,
  listPublicCatalogActivities,
  listPublicPedagogicalNodesForSpace,
  listPublicStudentsForSpace,
  verifyPublicStudentCode,
  getPublicStudentCodeKeypad,
  getPublicStudentActivityProgress,
  openPublicStudentAdventureDay,
  listPublicMissionsForSpace,
  loadPublicMissionSteps
} from "./student-api.js";
import { DEFAULT_ACTIVITY_MODE, normalizeActivityMode } from "../shared/activity-modes.js";
import { clearSelectedActivityMeta } from "./student-activity-meta.js";
import { markStudentFullscreenWantedAndWait } from "./student-fullscreen.js";
import {
  buildCatalogActivityConfig,
  buildMissionRuntimeConfig,
  getCatalogActivityById,
  normalizeCatalogRuntimeContext,
  normalizeCatalogDifficultyLevel
} from "../shared/catalogue.js";

let classDataLoadPromise = null;
let classDataLoadAccessCode = "";
let loadedClassDataAccessCode = "";
const HOME_LAUNCH_FALLBACK_MS = 1900;
const HOME_LAUNCH_FADE_MS = 260;

export async function submitAccessCode(rawValue){
  if (studentState.isCheckingAccessCode || studentState.isLoadingActivities || studentState.homeLaunchPhase) return;

  const code = normalizeAccessCode(rawValue);
  studentState.homeCode = code;

  if (!code){
    studentState.homeMessage = "Entre un code valide.";
    studentState.homeLaunchPhase = "";
    studentState.isCheckingAccessCode = false;
    studentState.isLoadingActivities = false;
    emitRefresh();
    return;
  }

  studentState.homeMessage = "";
  studentState.homeLaunchPhase = "fullscreen";
  studentState.isCheckingAccessCode = true;
  studentState.isLoadingActivities = false;
  const fullscreenPromise = markStudentFullscreenWantedAndWait();
  emitRefresh();

  const accessCheckPromise = accessCodeExists(code)
    .then((exists) => ({ exists, error: null }))
    .catch((error) => ({ exists: false, error }));

  try {
    await fullscreenPromise;
    const accessCheck = await accessCheckPromise;
    if (accessCheck.error) throw accessCheck.error;

    if (!accessCheck.exists){
      studentState.homeMessage = "Code introuvable.";
      studentState.homeLaunchPhase = "";
      studentState.isCheckingAccessCode = false;
      studentState.isLoadingActivities = false;
      emitRefresh();
      return;
    }

    studentState.accessCode = code;
    studentState.homeCode = code;
    studentState.homeMessage = "";
    studentState.isCheckingAccessCode = false;

    studentState.activities = [];
    studentState.activityFolders = [];
    studentState.missions = [];
    studentState.missionsMessage = "";
    studentState.activityEntry = "";
    studentState.studentCode = "";
    studentState.activitiesMessage = "";
    resetAdventureState();
    studentState.activitiesMode = DEFAULT_ACTIVITY_MODE;
    studentState.hasChosenActivitiesMode = false;
    studentState.currentActivityFolderId = null;
    studentState.publicStudents = [];
    studentState.publicStudentsMessage = "";
    studentState.selectedConfig = null;
    clearSelectedActivityMeta();
    studentState.selectedMission = null;
    studentState.selectedStudent = null;
    studentState.selectedStudents = [];
    studentState.sharedSessionEntry = false;
    studentState.isLoadingActivities = true;

    loadedClassDataAccessCode = "";
    classDataLoadAccessCode = "";
    classDataLoadPromise = null;

    persistAccessCode(code);

    try {
      await ensureClassDataLoaded({ refreshOnComplete: false, refreshOnStart: false });
      studentState.homeMessage = "";
      studentState.homeLaunchPhase = "flying";
      studentState.isCheckingAccessCode = false;
      studentState.isLoadingActivities = false;
      emitRefresh();
      await waitForHomeLaunchFlightComplete();
      studentState.homeLaunchPhase = "leaving";
      emitRefresh();
      await delay(HOME_LAUNCH_FADE_MS);
      studentState.homeLaunchPhase = "";
      window.location.hash = "#/selectmode";
    } catch (err){
      studentState.homeMessage = err?.message || "Impossible de charger les activités et les élèves.";
      studentState.homeLaunchPhase = "";
      studentState.isCheckingAccessCode = false;
      studentState.isLoadingActivities = false;
      emitRefresh();
    }
  } catch (err){
    if (studentState.homeLaunchPhase === "flying") {
      await waitForHomeLaunchFlightComplete();
    }
    studentState.homeMessage = err?.message || "Impossible de vérifier le code.";
    studentState.homeLaunchPhase = "";
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
  studentState.homeLaunchPhase = "";
  studentState.currentActivityFolderId = null;
  studentState.activityEntry = "";
  studentState.studentCode = "";
  studentState.missions = [];
  studentState.missionsMessage = "";
  studentState.selectedConfig = null;
  clearSelectedActivityMeta();
  studentState.selectedMission = null;
  studentState.selectedStudent = null;
  studentState.selectedStudents = [];
  studentState.sharedSessionEntry = false;
  studentState.activitiesMessage = "";
  resetAdventureState();
  studentState.publicStudentsMessage = "";
  window.location.hash = "#/home";
}

export function openActivityFolder(folderId){
  studentState.currentActivityFolderId = normalizeFolderId(folderId);
  emitRefresh();
}

export async function openAdventureEntry(){
  studentState.activityEntry = "adventure";
  studentState.currentActivityFolderId = null;
  studentState.selectedConfig = null;
  studentState.selectedMission = null;
  clearSelectedActivityMeta();
  await refreshAdventureDay();
}

export async function refreshAdventureDay(){
  const participant = getSelectedParticipantsForCurrentMode()[0] || null;
  const studentId = Number(participant?.id);
  const studentCode = String(studentState.studentCode || "").trim();

  studentState.isLoadingAdventure = true;
  studentState.adventureMessage = "";
  emitRefresh();

  if (!studentState.accessCode || !Number.isFinite(studentId) || studentId <= 0 || !studentCode) {
    studentState.adventureDay = null;
    studentState.adventureMessage = "Impossible d’ouvrir l’Aventure pour cet élève.";
    studentState.isLoadingAdventure = false;
    emitRefresh();
    return null;
  }

  try {
    const day = await openPublicStudentAdventureDay(
      studentState.accessCode,
      studentId,
      studentCode
    );
    studentState.adventureDay = day && typeof day === "object" ? day : null;
    studentState.adventureMessage = String(
      day?.availability === "ready" ? "" : day?.message || "Aucune Aventure disponible pour le moment."
    ).trim();
    return studentState.adventureDay;
  } catch (err) {
    studentState.adventureDay = null;
    studentState.adventureMessage = err?.message || "Impossible de charger l’Aventure.";
    return null;
  } finally {
    studentState.isLoadingAdventure = false;
    emitRefresh();
  }
}

export async function startNextAdventurePassage(){
  if (studentState.isLoadingAdventure) return false;

  let day = studentState.adventureDay;
  if (!day || day.availability !== "ready") {
    day = await refreshAdventureDay();
  }
  if (!day || day.availability !== "ready" || day.day_status === "completed") return false;

  const requiredPassages = (Array.isArray(day.passages) ? day.passages : [])
    .filter((passage) => String(passage?.passage_type || "") === "required")
    .sort((a, b) => Number(a?.passage_number || 0) - Number(b?.passage_number || 0));
  const passage = requiredPassages.find((item) => !["completed", "skipped"].includes(String(item?.status || ""))) || null;

  if (!passage) {
    await refreshAdventureDay();
    return false;
  }

  const activityId = String(passage?.catalog_activity_id || "").trim();
  let activity = findLoadedCatalogActivity(activityId);

  if (!activity) {
    try {
      const catalogActivities = await listPublicCatalogActivities();
      activity = getCatalogActivityById(activityId, catalogActivities);
    } catch {}
  }

  if (!activity) {
    studentState.adventureMessage = "L’activité prévue pour cette étape est introuvable.";
    emitRefresh();
    return false;
  }

  const participant = getSelectedParticipantsForCurrentMode()[0] || null;
  const startedLevel = normalizeCatalogDifficultyLevel(passage?.started_level ?? 1);
  const configJson = buildCatalogActivityConfig(activity, {
    activityMode: "individual",
    responseUi: "boxed",
    progressMode: "practice",
    difficultyLevel: startedLevel,
    context: "adventure",
    adaptive: true,
    executionLimit: passage?.execution_limit ?? { mode: "questions", value: 5 },
    catalogActivities: studentState.activities
  });

  if (!configJson) {
    studentState.adventureMessage = "Impossible de préparer cette activité Aventure.";
    emitRefresh();
    return false;
  }

  studentState.selectedMission = null;
  clearSelectedActivityMeta();
  studentState.selectedConfig = {
    id: activity.id,
    catalog_activity_id: activity.id,
    config_name: activity.config_name,
    catalog_context: "adventure",
    catalog_difficulty_level: startedLevel,
    module_key: "tools",
    config_json: configJson,
    progression_context: {
      context: "adventure",
      catalogActivityId: activity.id,
      studentId: String(participant?.id || ""),
      startedLevel,
      adventureDayId: String(day?.day_id || ""),
      adventurePassageId: String(passage?.id || ""),
      passageNumber: Math.max(1, Math.trunc(Number(passage?.passage_number) || 1))
    }
  };

  studentState.sharedSessionEntry = false;
  window.location.hash = "#/sessionstart";
  return true;
}

export async function selectActivity(configName){
  const cleanName = String(configName || "").trim();
  if (!cleanName) return;

  const activity = findLoadedCatalogActivity(cleanName);
  if (!activity) return;

  await prepareSelectedExplorationActivity(activity);
  studentState.selectedMission = null;
  studentState.sharedSessionEntry = false;
  clearSelectedActivityMeta();
  window.location.hash = "#/sessionstart";
}

export async function startSelectedActivity(){
  if (!studentState.selectedConfig) return;
  await refreshSelectedExplorationActivityBeforeStart();
  window.location.hash = buildStudentHash("session");
}

function findLoadedCatalogActivity(value){
  const cleanName = String(value || "").trim();
  if (!cleanName) return null;
  const found = studentState.activities.find((activity) => (
    String(activity?.id || "").trim() === cleanName ||
    String(activity?.config_name || "").trim() === cleanName
  ));
  return found || getCatalogActivityById(cleanName, studentState.activities);
}

async function prepareSelectedExplorationActivity(activity, forcedDifficultyLevel = null){
  if (!activity) return null;

  const currentMode = normalizeActivityMode(studentState.activitiesMode, DEFAULT_ACTIVITY_MODE);
  const isIndividualExploration = currentMode === "individual"
    && String(studentState.activityEntry || "").trim().toLowerCase() === "exploration";
  const participant = isIndividualExploration ? getSelectedParticipantsForCurrentMode()[0] || null : null;

  let startingDifficultyLevel = normalizeCatalogDifficultyLevel(
    forcedDifficultyLevel ?? (isIndividualExploration ? 1 : 3)
  );

  if (forcedDifficultyLevel == null && isIndividualExploration && participant?.id && studentState.studentCode) {
    try {
      const progress = await getPublicStudentActivityProgress(
        studentState.accessCode,
        participant.id,
        studentState.studentCode,
        activity.id
      );
      startingDifficultyLevel = normalizeCatalogDifficultyLevel(progress?.current_level ?? 1);
    } catch (err) {
      console.warn("Progression élève indisponible, démarrage au niveau 1.", err);
    }
  }

  const configJson = buildCatalogActivityConfig(activity, {
    activityMode: currentMode,
    responseUi: currentMode === "group" ? "free" : "boxed",
    progressMode: "practice",
    difficultyLevel: startingDifficultyLevel,
    context: "exploration",
    adaptive: isIndividualExploration,
    catalogActivities: studentState.activities
  });

  studentState.selectedConfig = {
    id: activity.id,
    catalog_activity_id: activity.id,
    config_name: activity.config_name,
    catalog_context: "exploration",
    module_key: "tools",
    config_json: configJson,
    progression_context: isIndividualExploration && participant?.id ? {
      context: "exploration",
      catalogActivityId: activity.id,
      studentId: participant.id,
      startedLevel: startingDifficultyLevel
    } : null
  };

  return studentState.selectedConfig;
}

async function refreshSelectedExplorationActivityBeforeStart(){
  const context = studentState.selectedConfig?.progression_context;
  const activityId = String(context?.catalogActivityId || studentState.selectedConfig?.catalog_activity_id || "").trim();
  if (!context || String(context.context || "").trim() !== "exploration" || !activityId) return;

  const activity = findLoadedCatalogActivity(activityId);
  if (!activity) return;

  await prepareSelectedExplorationActivity(activity);
}

export async function applyExplorationProgressLevelToSelectedConfig(level){
  const context = studentState.selectedConfig?.progression_context;
  const activityId = String(context?.catalogActivityId || studentState.selectedConfig?.catalog_activity_id || "").trim();
  if (!context || String(context.context || "").trim() !== "exploration" || !activityId) return;

  const activity = findLoadedCatalogActivity(activityId);
  if (!activity) return;

  await prepareSelectedExplorationActivity(activity, normalizeCatalogDifficultyLevel(level));
}

export function setSelectedStudent(student){
  const normalized = student ? normalizeStudentRecord(student) : null;
  studentState.selectedStudent = normalized ? { ...normalized } : null;
  studentState.selectedStudents = normalized ? [normalized] : [];
  resetStudentCodeKeypad();
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
  studentState.activityEntry = "";
  studentState.studentCode = "";
  studentState.missions = [];
  studentState.missionsMessage = "";
  studentState.selectedConfig = null;
  clearSelectedActivityMeta();
  studentState.selectedMission = null;
  studentState.selectedStudent = null;
  studentState.selectedStudents = [];
  studentState.sharedSessionEntry = false;
  studentState.activitiesMessage = "";
  resetAdventureState();
  studentState.publicStudentsMessage = "";
  emitRefresh();
}

export function selectActivityEntry(entry){
  const safeEntry = String(entry || "").trim().toLowerCase();
  studentState.activityEntry = ["exploration", "missions", "adventure"].includes(safeEntry) ? safeEntry : "";
  studentState.currentActivityFolderId = null;
  studentState.selectedConfig = null;
  studentState.selectedMission = null;
  clearSelectedActivityMeta();
  if (studentState.activityEntry !== "adventure") {
    resetAdventureState();
  }
  emitRefresh();
}

export function setStudentCode(value){
  studentState.studentCode = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
}

export async function loadStudentCodeKeypad(studentId){
  const id = String(studentId || "").trim();
  if (!id || !studentState.accessCode) return;
  if (studentState.isLoadingStudentCodeKeypad && studentState.studentCodeKeypadStudentId === id) return;

  studentState.studentCodeKeypad = [];
  studentState.studentCodeKeypadStudentId = id;
  studentState.studentCodeKeypadMessage = "";
  studentState.isLoadingStudentCodeKeypad = true;
  emitRefresh();

  try {
    const keys = await getPublicStudentCodeKeypad(studentState.accessCode, id);
    if (String(studentState.selectedStudent?.id || "") !== id) return;
    studentState.studentCodeKeypad = keys;
    if (keys.length < 10) studentState.studentCodeKeypadMessage = "Le clavier est indisponible.";
  } catch {
    if (String(studentState.selectedStudent?.id || "") !== id) return;
    studentState.studentCodeKeypadMessage = "Le clavier est indisponible.";
  } finally {
    if (studentState.studentCodeKeypadStudentId === id) {
      studentState.isLoadingStudentCodeKeypad = false;
      emitRefresh();
    }
  }
}

export async function validateSingleStudentCode(){
  const participant = getSelectedParticipantsForCurrentMode()[0] || null;
  if (!participant?.id) return false;
  const ok = await verifyPublicStudentCode(studentState.accessCode, participant.id, studentState.studentCode);
  return ok === true;
}

export async function refreshMissionsForCurrentSelection(){
  const participants = getSelectedParticipantsForCurrentMode();
  const ids = participants.map((student) => Number(student.id)).filter((id) => Number.isFinite(id));
  if (!studentState.accessCode || !ids.length) {
    studentState.missions = [];
    studentState.missionsMessage = "";
    emitRefresh();
    return [];
  }
  try {
    const isGroup = normalizeActivityMode(studentState.activitiesMode, DEFAULT_ACTIVITY_MODE) === "group";
    const missions = await listPublicMissionsForSpace(studentState.accessCode, ids, isGroup);
    studentState.missions = Array.isArray(missions) ? missions : [];
    studentState.missionsMessage = "";
    emitRefresh();
    return studentState.missions;
  } catch (err) {
    studentState.missions = [];
    studentState.missionsMessage = err?.message || "Impossible de charger les missions.";
    emitRefresh();
    return [];
  }
}

export async function selectMission(missionId){
  const mission = (studentState.missions || []).find((item) => String(item.id) === String(missionId));
  if (!mission) return;

  const currentMode = normalizeActivityMode(studentState.activitiesMode, DEFAULT_ACTIVITY_MODE);
  const participant = currentMode === "individual"
    ? (getSelectedParticipantsForCurrentMode()[0] || null)
    : null;
  const studentId = Number(participant?.id);
  const steps = await loadPublicMissionSteps(
    studentState.accessCode,
    mission.id,
    currentMode === "individual" && Number.isFinite(studentId) && studentId > 0 ? studentId : null
  );

  // En individuel, les étapes déjà terminées sont persistantes : on ne rejoue
  // que celles qui restent à faire. Une tentative interrompue n'est pas marquée
  // terminée et revient donc naturellement en tête de la reprise.
  const remainingSteps = currentMode === "individual"
    ? steps.filter((step) => step?.is_completed !== true)
    : steps;

  if (!remainingSteps.length) {
    await refreshMissionsForCurrentSelection();
    return;
  }

  const catalogActivities = await listPublicCatalogActivities();

  // Une étape adaptative reprend le dernier niveau mémorisé pour cette activité.
  // Ce niveau est partagé avec l'Exploration ; les Missions fixes n'y touchent pas.
  const resolvedRemainingSteps = await Promise.all(remainingSteps.map(async (step) => {
    const mode = String(step?.difficulty_mode || "normal").trim().toLowerCase();
    if (mode !== "adaptive" || currentMode !== "individual" || !participant?.id || !studentState.studentCode) {
      return { ...step };
    }

    try {
      const progress = await getPublicStudentActivityProgress(
        studentState.accessCode,
        participant.id,
        studentState.studentCode,
        step.catalog_activity_id
      );
      return {
        ...step,
        resolved_difficulty_level: normalizeCatalogDifficultyLevel(progress?.current_level ?? 1)
      };
    } catch (err) {
      console.warn("Niveau adaptatif de Mission indisponible, démarrage au niveau 1.", err);
      return {
        ...step,
        resolved_difficulty_level: normalizeCatalogDifficultyLevel(1)
      };
    }
  }));

  const configJson = buildMissionRuntimeConfig(mission, resolvedRemainingSteps, {
    activityMode: currentMode,
    catalogActivities
  });
  studentState.selectedMission = { ...mission, steps, remainingSteps: resolvedRemainingSteps };
  studentState.selectedConfig = {
    id: mission.id,
    mission_id: mission.id,
    config_name: mission.title,
    catalog_context: "mission",
    module_key: "tools",
    config_json: configJson
  };
  studentState.sharedSessionEntry = false;
  clearSelectedActivityMeta();
  window.location.hash = "#/sessionstart";
}


export function goBackToActivities(){
  const returningContext = String(
    studentState.selectedConfig?.progression_context?.context
      || studentState.selectedConfig?.catalog_context
      || ""
  ).trim().toLowerCase();

  if (returningContext === "adventure") {
    studentState.activityEntry = "adventure";
    studentState.selectedConfig = null;
    clearSelectedActivityMeta();
    window.location.hash = buildStudentHash("activities");
    void refreshAdventureDay();
    return;
  }

  if (returningContext === "mission") {
    studentState.activityEntry = "missions";
    studentState.selectedConfig = null;
    studentState.selectedMission = null;
    clearSelectedActivityMeta();
    window.location.hash = buildStudentHash("activities");
    // La dernière tentative est finalisée avant ce retour normal. Le rechargement
    // reflète donc immédiatement x/y, ou retire la Mission si elle est terminée.
    void refreshMissionsForCurrentSelection();
    return;
  }

  window.location.hash = buildStudentHash("activities");
}

export function goBackToSelectMode(){
  studentState.currentActivityFolderId = null;
  studentState.activityEntry = "";
  studentState.studentCode = "";
  resetStudentCodeKeypad();
  studentState.missions = [];
  studentState.missionsMessage = "";
  resetAdventureState();
  studentState.selectedConfig = null;
  clearSelectedActivityMeta();
  studentState.selectedMission = null;
  studentState.selectedStudent = null;
  studentState.selectedStudents = [];
  studentState.sharedSessionEntry = false;
  window.location.hash = "#/selectmode";
}

export function goBackToSelectStudents(){
  studentState.currentActivityFolderId = null;
  studentState.activityEntry = "";
  studentState.studentCode = "";
  studentState.missions = [];
  studentState.missionsMessage = "";
  resetAdventureState();
  studentState.selectedConfig = null;
  clearSelectedActivityMeta();
  studentState.selectedMission = null;
  if (normalizeActivityMode(studentState.activitiesMode, DEFAULT_ACTIVITY_MODE) === "individual") {
    studentState.selectedStudent = null;
    studentState.selectedStudents = [];
  }
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
    refreshOnStart = true,
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
  classDataLoadPromise = loadClassData(accessCode, { refreshOnComplete, refreshOnStart })
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

async function loadClassData(accessCode, { refreshOnComplete = true, refreshOnStart = true } = {}){
  studentState.isLoadingActivities = true;
  studentState.activitiesMessage = "";
  studentState.publicStudentsMessage = "";
  if (refreshOnStart) {
    emitRefresh();
  }

  try {
    const [activities, folders, students] = await Promise.all([
      listPublicActivitiesForSpace(accessCode),
      listPublicPedagogicalNodesForSpace(accessCode),
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
  const accessCode = normalizeAccessCode(
    studentState.projectedSession?.accessCode || studentState.accessCode || ""
  );
  const configName = String(
    studentState.projectedSession?.configName || studentState.selectedConfig?.config_name || ""
  ).trim();
  const catalogRuntimeContext = normalizeCatalogRuntimeContext(
    studentState.projectedSession?.catalogRuntimeContext
      || studentState.selectedConfig?.catalog_context
      || studentState.selectedConfig?.catalogContext
      || ""
  );
  const catalogDifficultyLevel = normalizeCatalogDifficultyLevel(
    studentState.projectedSession?.catalogDifficultyLevel
      ?? studentState.selectedConfig?.catalog_difficulty_level
      ?? studentState.selectedConfig?.catalogDifficultyLevel
      ?? 3
  );
  const shouldPreserveCatalogTestContext = catalogRuntimeContext === "test"
    && (cleanRoute === "sessionstart" || cleanRoute === "session");

  if (
    studentState.sessionMode !== "projected-teacher"
    && !shouldPreserveSharedContext
    && !shouldPreserveCatalogTestContext
  ) {
    return `#/${cleanRoute}`;
  }

  if (!accessCode || !configName) {
    return `#/${cleanRoute}`;
  }

  const params = new URLSearchParams();
  params.set("classCode", accessCode);
  params.set("configName", configName);

  if (studentState.sessionMode === "projected-teacher") {
    params.set("projected", "1");
  }

  if (catalogRuntimeContext === "test") {
    params.set("catalogTest", "1");
    params.set("catalogContext", "test");
    params.set("catalogLevel", String(catalogDifficultyLevel));
  }

  if (shouldPreserveSharedContext) {
    params.set("shared", "1");
  }

  return `#/${cleanRoute}?${params.toString()}`;
}


function resetAdventureState(){
  studentState.adventureDay = null;
  studentState.adventureMessage = "";
  studentState.isLoadingAdventure = false;
}

function emitRefresh(){
  window.dispatchEvent(new Event("student:refresh"));
}

function resetStudentCodeKeypad(){
  studentState.studentCodeKeypad = [];
  studentState.studentCodeKeypadStudentId = "";
  studentState.isLoadingStudentCodeKeypad = false;
  studentState.studentCodeKeypadMessage = "";
}

function waitForHomeLaunchFlightComplete(){
  return new Promise((resolve) => {
    let isResolved = false;
    let timeout = 0;

    const finish = () => {
      if (isResolved) return;
      isResolved = true;
      window.clearTimeout(timeout);
      window.removeEventListener("student:home-launch-flight-complete", finish);
      resolve();
    };

    timeout = window.setTimeout(finish, HOME_LAUNCH_FALLBACK_MS);
    window.addEventListener("student:home-launch-flight-complete", finish);
  });
}

function delay(duration){
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, Number(duration) || 0));
  });
}
