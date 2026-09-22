import {
  getCurrentUser,
  signOutUser,
  normalizeAccessCode,
  getMyTeacherSpace,
  createOrGetMyTeacherSpace,
  updateMyTeacherSpace,
  markTeacherSpaceAsOpened,
  getMyTeacherClasses,
  listStudentsForTeacherSpace,
  createStudentForTeacherSpace,
  updateStudent,
  deleteStudent,
  saveStudentOrderForTeacherSpace,
  listStudentActivityHistory,
  deleteStudentActivityHistoryAttempt,
  resetStudentActivityAttemptEffects,
  deleteStudentActivityAttemptTotally,
  listPedagogicalNodesForTeacher,
  listPedagogicalNodesForAdmin,
  createPedagogicalNodeAsAdmin,
  updatePedagogicalNodeAsAdmin,
  deletePedagogicalNodeAsAdmin,
  listCatalogActivitiesForTeacherSpace,
  setCatalogActivityVisibility,
  listTeacherActivityFoldersForSpace,
  createTeacherActivityFolderForSpace,
  updateTeacherActivityFolder,
  deleteTeacherActivityFolder,
  listTeacherActivitiesForSpace,
  saveTeacherActivityForSpace,
  updateTeacherActivityPlacement,
  deleteTeacherActivity,
  listTeacherSequencesForSpace,
  saveTeacherSequenceForSpace,
  updateTeacherSequencePlacement,
  deleteTeacherSequence,
  listActivityAssignmentsForSpace,
  saveActivityAssignmentForSpace,
  deleteActivityAssignment,
  saveDirectLaunchLinkForSpace,
  listMissionFoldersForSpace,
  createMissionFolderForSpace,
  updateMissionFolder,
  deleteMissionFolder,
  listMissionsForSpace,
  updateMissionPlacement,
  listMissionSteps,
  listMissionAssignments,
  saveMissionForSpace,
  setMissionInactive,
  reactivateMission,
  deleteMissionPermanently,
  isCurrentUserSuperAdmin,
  listCatalogActivitiesForAdmin,
  listAdventureDefaultMenuSlots,
  saveAdventureDefaultMenuSlots,
  listTeacherAdventureMenuSlots,
  saveTeacherAdventureMenuSlot,
  deleteTeacherAdventureMenuSlot,
  deleteTeacherAdventureMenuSlotsForGrade,
  listAdventureClassCursors,
  saveAdventureClassCursor,
  saveCatalogActivityAsAdmin,
  deleteCatalogActivityAsAdmin,
  getCatalogActivityUsageAsAdmin,
  listQuizFoldersForSpace,
  createQuizFolderForSpace,
  updateQuizFolder,
  deleteQuizFolder,
  listQuizzesForSpace,
  updateQuizPlacement,
  listQuizSummariesForSpace,
  getQuizForSpace,
  saveQuizForSpace,
  deleteQuiz,
  listResourceFoldersForSpace,
  createResourceFolderForSpace,
  createSystemResourceFolderAsAdmin,
  ensureRecordingsResourceFolderForSpace,
  updateResourceFolder,
  deleteResourceFolder,
  listResourcesForSpace,
  uploadResourceForSpace,
  replaceAudioResourceFile,
  updateResource,
  deleteResource,
  createResourceSignedUrl,
  getLexicalEntriesCount,
  listLexicalEntries,
  saveLexicalEntryAsAdmin,
  deleteLexicalEntryAsAdmin,
  upsertLexicalEntriesAsAdmin,
  listImageAssetsAsAdmin,
  importSystemImageAssetAsAdmin,
  listImagierAudioEntriesAsAdmin,
  listInterfaceAudioAssetsAsAdmin,
  uploadSystemInterfaceAudioAsAdmin,
  deleteSystemInterfaceAudioAsAdmin,
  getInterfaceAudioAssetPublicUrl
} from "./teacher-api.js";
import { createHeaderPopupController } from "./dashboard/header-popups.js";
import { createStudentDashboardController } from "./dashboard/student-controller.js";
import { createActivityHubViewController } from "./dashboard/activity-hub-view.js";
import { createMyActivitiesViewController } from "./dashboard/my-activities-view.js";
import { createActivityAssignmentViewController } from "./dashboard/activity-assignment-view.js";
import { openDirectLaunchDialog } from "./dashboard/direct-launch-dialog.js";
import { createPersonalActivityEditorController, buildDefaultQuizActivityConfig, refreshQuizActivityConfig } from "./dashboard/personal-activity-editor-view.js";
import { createActivitiesViewController } from "./dashboard/activities-view.js";
import { createAdventureRegistryViewController } from "./dashboard/adventure-registry-view.js";
import { createMissionsViewController } from "./dashboard/missions-view.js";
import { createTeacherToolsViewController } from "./dashboard/teacher-tools-view.js";
import { createQuizWorkshopViewController } from "./dashboard/quiz-workshop-view.js";
import { createQuizExplorerViewController } from "./dashboard/quiz-explorer-view.js";
import { createQuizSeriesViewController, openQuizSeriesCreationOverlay } from "./dashboard/quiz-series-view.js";
import { createResourcesViewController } from "./dashboard/resources-view.js";
import { createLexicalBankViewController } from "./dashboard/lexical-bank-view.js";
import { createAudioAdminViewController } from "./dashboard/audio-admin-view.js";
import { createSystemImagesImportDialog } from "./dashboard/system-images-import-dialog.js";
import { openCatalogTestRunner } from "./dashboard/catalog-test-runner.js";
import { filterQuizSnapshotBySelection, getDefaultSettings as getDefaultQuizSettings, getQuizTestIssues, normalizeQuizRuntimeSettings } from "../../tools/quiz/model.js";
import { normalizeCatalogActivity } from "../../shared/catalogue.js";
import {
  applyContextualHelpPreference,
  getContextualHelpEnabled,
  initContextualHelpSystem,
  setContextualHelpEnabled
} from "../../shared/help-popover.js";
import { startMaterialIconHydration } from "../../shared/material-icons-svg.js";

startMaterialIconHydration();

/* =========================
   DOM
   ========================= */

const btnLogout = document.getElementById("btnLogout");
const teacherEmail = document.getElementById("teacherEmail");
const accessCodeBox = document.getElementById("accessCodeBox");
const accessCodeValue = document.getElementById("accessCodeValue");
const btnEditAccessCode = document.getElementById("btnEditAccessCode");
const btnDashboardHelp = document.getElementById("btnDashboardHelp");
const helpMenuPopup = document.getElementById("helpMenuPopup");
const btnStartTutorial = document.getElementById("btnStartTutorial");
const toggleHelpIcons = document.getElementById("toggleHelpIcons");
const btnUserMenu = document.getElementById("btnUserMenu");
const userMenuPopup = document.getElementById("userMenuPopup");
const btnOpenProfileOverlay = document.getElementById("btnOpenProfileOverlay");
const profileOverlay = document.getElementById("profileOverlay");
const btnCloseProfileOverlay = document.getElementById("btnCloseProfileOverlay");
const btnNavClass = document.getElementById("btnNavClass");
const btnNavActivityHub = document.getElementById("btnNavActivityHub");
const btnNavAdventure = document.getElementById("btnNavAdventure");
const btnNavMissions = document.getElementById("btnNavMissions");
const btnNavQuiz = document.getElementById("btnNavQuiz");
const btnNavResources = document.getElementById("btnNavResources");
const btnNavTeacherTools = document.getElementById("btnNavTeacherTools");
const btnNavAdmin = document.getElementById("btnNavAdmin");
const btnStudentListView = document.getElementById("btnStudentListView");
const btnStudentTileView = document.getElementById("btnStudentTileView");
const navHelpButtons = Array.from(document.querySelectorAll("[data-help-icon]"));
const dashboardHeader = document.querySelector(".dashboard-header");
const dashboardShell = document.querySelector(".dashboard-shell");
const dashboardWorkArea = document.getElementById("workArea");

const studentsList = document.getElementById("studentsList");
const configsList = document.getElementById("configsList");
const configHeader = document.getElementById("configHeader");
const classView = document.getElementById("classView");
const activityHubView = document.getElementById("activityHubView");
const myActivitiesView = document.getElementById("myActivitiesView");
const myActivitiesHeader = document.getElementById("myActivitiesHeader");
const myActivitiesList = document.getElementById("myActivitiesList");
const personalActivityEditorView = document.getElementById("personalActivityEditorView");
const personalActivityEditorHeader = document.getElementById("personalActivityEditorHeader");
const personalActivityEditorBody = document.getElementById("personalActivityEditorBody");
const activityAssignmentView = document.getElementById("activityAssignmentView");
const adventureView = document.getElementById("adventureView");
const adventureHeader = document.getElementById("adventureHeader");
const adventureList = document.getElementById("adventureList");
const activitiesView = document.getElementById("activitiesView");
const missionsView = document.getElementById("missionsView");
const missionsHeader = document.getElementById("missionsHeader");
const missionsList = document.getElementById("missionsList");
const quizView = document.getElementById("quizView");
const quizExplorerPane = document.getElementById("quizExplorerPane");
const quizExplorerHeader = document.getElementById("quizExplorerHeader");
const quizList = document.getElementById("quizList");
const btnCreateQuiz = document.getElementById("btnCreateQuiz");
const btnCreateQuizSeries = document.getElementById("btnCreateQuizSeries");
const btnCreateQuizFolder = document.getElementById("btnCreateQuizFolder");
const btnBackQuizExplorer = document.getElementById("btnBackQuizExplorer");
const quizWorkshopView = document.getElementById("quizWorkshopView");
const quizSeriesView = document.getElementById("quizSeriesView");
const btnBackQuizSeries = document.getElementById("btnBackQuizSeries");
const btnQuizSeriesSave = document.getElementById("btnQuizSeriesSave");
const btnQuizSeriesTest = document.getElementById("btnQuizSeriesTest");
const btnQuizSeriesAddRow = document.getElementById("btnQuizSeriesAddRow");
const btnQuizSeriesImportQuestions = document.getElementById("btnQuizSeriesImportQuestions");
const quizSeriesImportScrim = document.getElementById("quizSeriesImportScrim");
const quizSeriesImportDrawer = document.getElementById("quizSeriesImportDrawer");
const quizSeriesTitleInput = document.getElementById("quizSeriesTitleInput");
const quizSeriesInstructionInput = document.getElementById("quizSeriesInstructionInput");
const quizSeriesTableHost = document.getElementById("quizSeriesTableHost");
const quizSeriesMessage = document.getElementById("quizSeriesMessage");
const resourcesView = document.getElementById("resourcesView");
const resourcesHeader = document.getElementById("resourcesHeader");
const resourcesList = document.getElementById("resourcesList");
const btnCreateResourceFolder = document.getElementById("btnCreateResourceFolder");
const btnImportResources = document.getElementById("btnImportResources");
const btnRecordResourceAudio = document.getElementById("btnRecordResourceAudio");
const resourceFileInput = document.getElementById("resourceFileInput");
const resourceStorageQuota = document.getElementById("resourceStorageQuota");
const teacherToolsView = document.getElementById("teacherToolsView");
const adminView = document.getElementById("adminView");
const teacherToolsHost = document.getElementById("teacherToolsHost");

const btnAddStudent = document.getElementById("btnAddStudent");
const btnQuizAddQuestion = document.getElementById("btnQuizAddQuestion");
const btnQuizSave = document.getElementById("btnQuizSave");
const btnQuizTest = document.getElementById("btnQuizTest");
const quizWorkshopDrawer = document.getElementById("quizWorkshopDrawer");
const quizQuickEntryDrawer = document.getElementById("quizQuickEntryDrawer");
const quizWorkshopScrim = document.getElementById("quizWorkshopScrim");
const btnQuizDrawerClose = document.getElementById("btnQuizDrawerClose");
const quizWorkshopTemplateGrid = document.getElementById("quizWorkshopTemplateGrid");
const btnQuizConfirmTemplate = document.getElementById("btnQuizConfirmTemplate");
const quizWorkshopQuestions = document.getElementById("quizWorkshopQuestions");
const quizWorkshopEmptyState = document.getElementById("quizWorkshopEmptyState");
const quizWorkshopQuestionCount = document.getElementById("quizWorkshopQuestionCount");
const quizWorkshopTitleInput = document.getElementById("quizWorkshopTitleInput");
const accessCodeModal = document.getElementById("accessCodeModal");
const accessCodeInput = document.getElementById("accessCodeInput");
const btnModalCreate = document.getElementById("btnModalCreate");
const btnModalCancel = document.getElementById("btnModalCancel");
const modalMessage = document.getElementById("modalMessage");
const accessCodeModalTitle = accessCodeModal?.querySelector(".modal-title");

const deleteStudentModal = document.getElementById("deleteStudentModal");
const deleteStudentModalTitle = deleteStudentModal?.querySelector(".modal-title");
const deleteStudentText = document.getElementById("deleteStudentText");
const deleteStudentMessage = document.getElementById("deleteStudentMessage");
const btnDeleteStudentCancel = document.getElementById("btnDeleteStudentCancel");
const btnDeleteStudentConfirm = document.getElementById("btnDeleteStudentConfirm");

/* =========================
   STATE
   ========================= */

let currentUser = null;
let currentTeacherSpace = null;
let currentStudents = [];
let currentStudent = null;
let currentDashboardSection = "activity-hub"; // "activity-hub" | "my-activities" | "personal-activity-editor" | "activity-assignment" | "adventure" | "activities" | "missions" | "class" | "quiz" | "resources" | "teacher-tools" | "admin"
let showDashboardHelpIcons = getContextualHelpEnabled();
let studentViewMode = "tiles"; // "list" | "tiles"
let activityListScrollTop = 0;
let hasMountedClassView = false;
let hasMountedAdventureView = false;
let hasMountedMyActivitiesView = false;
let hasMountedActivitiesView = false;
let hasMountedMissionsView = false;
let hasMountedQuizView = false;
let hasMountedResourcesView = false;
let hasMountedTeacherToolsView = false;
let hasMountedAdminView = false;
let currentUserIsSuperAdmin = false;
let mountedClassTeacherSpaceId = "";
let mountedAdventureTeacherSpaceId = "";
let mountedMyActivitiesTeacherSpaceId = "";
let mountedActivitiesTeacherSpaceId = "";
let mountedMissionsTeacherSpaceId = "";
let mountedQuizTeacherSpaceId = "";
let mountedResourcesTeacherSpaceId = "";
let mountedTeacherToolsTeacherSpaceId = "";
let mountedAdminUserId = "";
let dashboardToast = null;
let dashboardToastTimer = null;

let activityHubViewController = null;
let myActivitiesViewController = null;
let activityAssignmentViewController = null;
let personalActivityEditorController = null;
let personalActivityEditorContext = null;
let adventureViewController = null;
let activitiesViewController = null;
let missionsViewController = null;
let quizExplorerViewController = null;
let quizWorkshopViewController = null;
let quizSeriesViewController = null;
let resourcesViewController = null;
let lexicalBankViewController = null;
let systemImagesImportDialog = null;
let teacherToolsViewController = null;
let audioAdminViewController = null;
let studentController = null;
const helpPopoverController = initContextualHelpSystem({ root: document });

const headerPopupController = createHeaderPopupController({
  helpMenuPopup,
  btnDashboardHelp,
  userMenuPopup,
  btnUserMenu,
  onBeforeOpenHelp: () => {
    helpPopoverController.close();
  },
  onBeforeOpenUser: () => {
    helpPopoverController.close();
  }
});

studentController = createStudentDashboardController({
  studentsList,
  accessCodeBox,
  accessCodeValue,
  accessCodeModal,
  accessCodeModalTitle,
  accessCodeInput,
  btnModalCreate,
  modalMessage,
  deleteStudentModal,
  deleteStudentModalTitle,
  deleteStudentText,
  deleteStudentMessage,
  getCurrentTeacherSpace: () => currentTeacherSpace,
  setCurrentTeacherSpace: (next) => { currentTeacherSpace = next; },
  getCurrentStudents: () => currentStudents,
  setCurrentStudents: (next) => { currentStudents = next; },
  getCurrentStudent: () => currentStudent,
  setCurrentStudent: (next) => { currentStudent = next; },
  getStudentViewMode: () => studentViewMode,
  setCurrentDashboardSection: (next) => { currentDashboardSection = next; },
  renderDashboardShellState,
  renderRightPanel: (...args) => activitiesViewController?.renderRightPanel(...args),
  updateClassSectionTitle,
  syncDashboardUrl,
  normalizeAccessCode,
  createOrGetMyTeacherSpace,
  updateMyTeacherSpace,
  markTeacherSpaceAsOpened,
  listStudentsForTeacherSpace,
  createStudentForTeacherSpace,
  updateStudent,
  deleteStudent,
  saveStudentOrderForTeacherSpace,
  listStudentActivityHistory,
  deleteStudentActivityHistoryAttempt,
  resetStudentActivityAttemptEffects,
  deleteStudentActivityAttemptTotally,
  showToast: showDashboardShareToast
});

activityHubViewController = createActivityHubViewController({
  view: activityHubView,
  onOpenExploration: () => openDashboardSection("activities"),
  onOpenMyActivities: () => openDashboardSection("my-activities"),
  onOpenAssignedWork: () => openDashboardSection("activity-assignment")
});
activityHubViewController.render();

myActivitiesViewController = createMyActivitiesViewController({
  view: myActivitiesView,
  header: myActivitiesHeader,
  list: myActivitiesList,
  getCurrentTeacherSpace: () => currentTeacherSpace,
  listTeacherActivityFoldersForSpace,
  createTeacherActivityFolderForSpace,
  updateTeacherActivityFolder,
  deleteTeacherActivityFolder,
  listTeacherActivitiesForSpace,
  updateTeacherActivityPlacement,
  deleteTeacherActivity,
  listTeacherSequencesForSpace,
  saveTeacherSequenceForSpace,
  updateTeacherSequencePlacement,
  deleteTeacherSequence,
  listCatalogActivitiesForTeacherSpace,
  onBack: () => openDashboardSection("activity-hub"),
  onCreateActivity: ({ type, folderId, difficultyMode } = {}) => openPersonalActivityCreator({ type, folderId, difficultyMode }),
  onOpenActivity: (activity) => openPersonalActivity(activity),
  onTestActivity: (activity) => testPersonalActivityFromTile(activity),
  onAssignActivity: (activity) => openActivityAssignment({ sourceType:"teacher_activity", sourceId:activity?.id }),
  onAssignSequence: (sequence) => openActivityAssignment({ sourceType:"sequence", sourceId:sequence?.id }),
  onDirectLaunch: (activity) => openDirectLaunchDialog({
    teacherSpaceId:currentTeacherSpace?.id,
    sourceType:"teacher_activity",
    source:activity,
    saveDirectLaunchLinkForSpace,
    showToast:showDashboardShareToast
  }),
  onDuplicateQuizActivity: duplicatePersonalQuizActivity,
  showToast: showDashboardShareToast
});

adventureViewController = createAdventureRegistryViewController({
  adventureHeader,
  adventureList,
  getCurrentTeacherSpace: () => currentTeacherSpace,
  getIsSuperAdmin: () => currentUserIsSuperAdmin,
  listPedagogicalNodesForTeacher,
  listCatalogActivitiesForTeacherSpace,
  listCatalogActivitiesForAdmin,
  listAdventureDefaultMenuSlots,
  saveAdventureDefaultMenuSlots,
  listTeacherAdventureMenuSlots,
  saveTeacherAdventureMenuSlot,
  deleteTeacherAdventureMenuSlot,
  deleteTeacherAdventureMenuSlotsForGrade,
  listTeacherClasses: getMyTeacherClasses,
  listAdventureClassCursors,
  saveAdventureClassCursor,
  showToast: showDashboardShareToast
});

activitiesViewController = createActivitiesViewController({
  configHeader,
  configsList,
  getCurrentTeacherSpace: () => currentTeacherSpace,
  getIsSuperAdmin: () => currentUserIsSuperAdmin,
  listPedagogicalNodesForTeacher,
  listPedagogicalNodesForAdmin,
  createPedagogicalNodeAsAdmin,
  updatePedagogicalNodeAsAdmin,
  deletePedagogicalNodeAsAdmin,
  listCatalogActivitiesForTeacherSpace,
  setCatalogActivityVisibility,
  listCatalogActivitiesForAdmin,
  saveCatalogActivityAsAdmin,
  deleteCatalogActivityAsAdmin,
  getCatalogActivityUsageAsAdmin,
  onBackToActivityHub: () => openDashboardSection("activity-hub"),
  onAssignCatalogActivity: (activity) => openActivityAssignment({ sourceType:"catalog_activity", sourceId:activity?.id }),
  onDirectLaunchCatalogActivity: (activity) => openDirectLaunchDialog({
    teacherSpaceId:currentTeacherSpace?.id,
    sourceType:"catalog_activity",
    source:activity,
    saveDirectLaunchLinkForSpace,
    showToast:showDashboardShareToast
  }),
  onCreateSystemActivity: ({ pedagogicalNodeId } = {}) => {
    myActivitiesViewController?.openCreationDialog?.({
      folderId:null,
      onCreate: ({ type, difficultyMode } = {}) => openPersonalActivityCreator({
        type,
        folderId:null,
        difficultyMode,
        origin:"activities",
        systemPublication:{ enabled:true, pedagogicalNodeId }
      })
    });
  },
  onEditSystemActivity: (activity) => openSystemCatalogActivity(activity),
  showToast: showDashboardShareToast
});

activityAssignmentViewController = createActivityAssignmentViewController({
  view: activityAssignmentView,
  getCurrentTeacherSpace: () => currentTeacherSpace,
  listCatalogActivitiesForTeacherSpace,
  listTeacherActivitiesForSpace,
  listTeacherSequencesForSpace,
  listTeacherClasses: getMyTeacherClasses,
  listStudentsForTeacherSpace,
  listActivityAssignmentsForSpace,
  saveActivityAssignmentForSpace,
  deleteActivityAssignment,
  onBack: () => openDashboardSection("activity-hub"),
  showToast: showDashboardShareToast
});

missionsViewController = createMissionsViewController({
  missionsView,
  missionsHeader,
  missionsList,
  getCurrentTeacherSpace: () => currentTeacherSpace,
  getCurrentStudents: () => currentStudents,
  listMissionFoldersForSpace,
  createMissionFolderForSpace,
  updateMissionFolder,
  deleteMissionFolder,
  listMissionsForSpace,
  updateMissionPlacement,
  listMissionSteps,
  listMissionAssignments,
  saveMissionForSpace,
  setMissionInactive,
  reactivateMission,
  deleteMissionPermanently,
  listCatalogActivitiesForTeacherSpace,
  listPedagogicalNodesForTeacher,
  listQuizSummariesForSpace,
  getQuizForSpace,
  showToast: showDashboardShareToast
});


personalActivityEditorController = createPersonalActivityEditorController({
  view: personalActivityEditorView,
  header: personalActivityEditorHeader,
  body: personalActivityEditorBody,
  getCurrentTeacherSpace: () => currentTeacherSpace,
  getIsSuperAdmin: () => currentUserIsSuperAdmin,
  saveTeacherActivityForSpace,
  getQuizForSpace,
  listPedagogicalNodesForAdmin,
  listCatalogActivitiesForAdmin,
  saveCatalogActivityAsAdmin,
  onBack: ({ origin } = {}) => openDashboardSection(origin === "activities" ? "activities" : "my-activities"),
  onEditContent: (activity, context) => editPersonalActivityContent(activity, context),
  onSaved: () => {
    hasMountedMyActivitiesView = false;
    mountedMyActivitiesTeacherSpaceId = "";
  },
  showToast: showDashboardShareToast
});

async function openPersonalActivityCreator({ type = "quiz", folderId = null, difficultyMode = "single", origin = "my-activities", systemPublication = null } = {}) {
  const requestedType = String(type || "quiz").trim();
  const activityType = ["quiz", "series", "tool"].includes(requestedType) ? requestedType : "quiz";
  const safeDifficultyMode = String(difficultyMode || "single") === "adaptive" ? "adaptive" : "single";
  const safeFolderId = String(folderId || "").trim() || null;

  if (activityType === "tool") {
    const draftActivity = {
      id:null,
      folder_id:safeFolderId,
      title:"Nouvelle activité",
      activity_type:"tool",
      difficulty_mode:safeDifficultyMode,
      source_quiz_id:null,
      config_json:{},
      levels_json:{},
      display_order:0
    };
    await openDashboardSection("personal-activity-editor");
    await personalActivityEditorController?.open?.(draftActivity, { autoOpenToolPicker:true, origin, systemPublication });
    return;
  }

  const baseContext = {
    activityId:null,
    folderId:safeFolderId,
    activityType,
    difficultyMode:safeDifficultyMode,
    configJson:{},
    levelsJson:{},
    displayOrder:0,
    origin,
    systemPublication
  };

  if (activityType === "series") {
    openQuizSeriesCreationOverlay({
      onConfirm: async ({ modelId, title, instruction, action }) => {
        personalActivityEditorContext = baseContext;
        await openDashboardSection("quiz");
        showQuizSeries({ modelId, title, instruction });
        if (action === "import") {
          window.requestAnimationFrame(() => {
            quizSeriesViewController?.openImportDrawer?.({ source:"creation" });
          });
        }
      }
    });
    return;
  }

  personalActivityEditorContext = baseContext;
  await openDashboardSection("quiz");
  showQuizWorkshop();
}

async function duplicatePersonalQuizActivity(activity = {}) {
  const spaceId = currentTeacherSpace?.id;
  if (!spaceId) throw new Error("Espace enseignant introuvable.");
  if (String(activity?.activity_type || "").trim() !== "quiz") {
    throw new Error("Seuls les quiz peuvent être dupliqués ici.");
  }
  const sourceQuizId = String(activity?.source_quiz_id || "").trim();
  if (!sourceQuizId) throw new Error("Quiz source introuvable.");

  const [sourceQuiz, siblingActivities] = await Promise.all([
    getQuizForSpace(spaceId, sourceQuizId),
    listTeacherActivitiesForSpace(spaceId)
  ]);

  const baseTitle = String(activity?.title || sourceQuiz?.title || "Quiz sans titre").trim() || "Quiz sans titre";
  const folderId = String(activity?.folder_id || "").trim();
  const existingTitles = new Set(
    (Array.isArray(siblingActivities) ? siblingActivities : [])
      .filter((item) => String(item?.folder_id || "").trim() === folderId)
      .map((item) => String(item?.title || "").trim().toLocaleLowerCase("fr"))
      .filter(Boolean)
  );
  let copyTitle = `${baseTitle} (copie)`;
  let copyIndex = 2;
  while (existingTitles.has(copyTitle.toLocaleLowerCase("fr"))) {
    copyTitle = `${baseTitle} (copie ${copyIndex})`;
    copyIndex += 1;
  }

  const quizCopy = cloneDashboardJson(sourceQuiz) || {};
  delete quizCopy.id;
  delete quizCopy.teacher_space_id;
  delete quizCopy.created_at;
  delete quizCopy.updated_at;
  quizCopy.title = copyTitle;
  quizCopy.is_system = false;

  let savedQuiz = null;
  try {
    savedQuiz = await saveQuizForSpace(spaceId, quizCopy);
    const refreshed = refreshQuizActivityConfig({
      difficulty_mode:activity?.difficulty_mode,
      config_json:cloneDashboardJson(activity?.config_json || {}),
      levels_json:cloneDashboardJson(activity?.levels_json || {})
    }, savedQuiz);

    const savedActivity = await saveTeacherActivityForSpace(spaceId, {
      folder_id:activity?.folder_id || null,
      title:copyTitle,
      activity_type:"quiz",
      difficulty_mode:String(activity?.difficulty_mode || "single") === "adaptive" ? "adaptive" : "single",
      source_quiz_id:savedQuiz.id,
      config_json:refreshed.config_json,
      levels_json:refreshed.levels_json
    });
    hasMountedMyActivitiesView = false;
    mountedMyActivitiesTeacherSpaceId = "";
    showDashboardShareToast(`Quiz « ${copyTitle} » dupliqué.`);
    return savedActivity;
  } catch (error) {
    if (savedQuiz?.id) {
      try { await deleteQuiz(savedQuiz.id, { is_system:false }); } catch {}
    }
    throw error;
  }
}

async function openPersonalActivity(activity = {}, { origin = "my-activities", systemPublication = null } = {}) {
  await openDashboardSection("personal-activity-editor");
  try {
    await personalActivityEditorController?.open?.(activity, { origin, systemPublication });
  } catch (error) {
    showDashboardShareToast(error?.message || "Impossible d’ouvrir cette activité.", { isError:true });
    await openDashboardSection(origin === "activities" ? "activities" : "my-activities");
  }
}

const CATALOG_EDITOR_SOURCE_META_KEY = "__editor_source";
const CATALOG_LEVEL_KEYS = Object.freeze(["1", "2", "3", "4", "5"]);

async function openSystemCatalogActivity(activity = {}) {
  const catalogActivity = normalizeCatalogActivity(activity);
  if (!catalogActivity.id) return;

  const systemPublication = {
    enabled:true,
    catalogId:catalogActivity.id,
    pedagogicalNodeId:catalogActivity.pedagogical_node_id,
    status:String(catalogActivity.status || "draft") === "published" ? "published" : "draft",
    description:String(catalogActivity.description || ""),
    adventure_tier:Math.max(1, Math.trunc(Number(catalogActivity.adventure_tier) || 1)),
    default_visible:catalogActivity.default_visible !== false,
    display_order:Math.max(0, Math.trunc(Number(catalogActivity.display_order) || 0))
  };

  const linkedTeacherActivityId = getCatalogEditorSourceTeacherActivityId(activity, catalogActivity);
  if (linkedTeacherActivityId && currentTeacherSpace?.id) {
    try {
      const teacherActivities = await listTeacherActivitiesForSpace(currentTeacherSpace.id);
      const linkedActivity = (teacherActivities || []).find((item) => String(item?.id || "") === linkedTeacherActivityId) || null;
      if (linkedActivity) {
        await openPersonalActivity(linkedActivity, { origin:"activities", systemPublication });
        return;
      }
    } catch (error) {
      console.warn("Impossible de retrouver la source de l’activité système ; ouverture depuis la projection.", error);
    }
  }

  const draft = buildTeacherActivityDraftFromCatalog(catalogActivity);
  await openPersonalActivity(draft, { origin:"activities", systemPublication });
}

function getCatalogEditorSourceTeacherActivityId(rawActivity = {}, normalizedActivity = {}) {
  const metadataId = String(
    rawActivity?.levels_json?.[CATALOG_EDITOR_SOURCE_META_KEY]?.teacher_activity_id
    || rawActivity?.difficulty_levels_json?.[CATALOG_EDITOR_SOURCE_META_KEY]?.teacher_activity_id
    || ""
  ).trim();
  if (metadataId) return metadataId;

  const catalogId = String(normalizedActivity?.id || rawActivity?.id || "").trim().toLowerCase();
  if (!catalogId.startsWith("teacher.")) return "";
  return catalogId.slice("teacher.".length).trim();
}

function buildTeacherActivityDraftFromCatalog(activity = {}) {
  const catalogActivity = normalizeCatalogActivity(activity);
  let levels = cloneDashboardJson(catalogActivity.difficulty_levels || {});
  const hasLevelConfiguration = CATALOG_LEVEL_KEYS.some((key) => hasCatalogLevelConfiguration(levels[key]));
  const legacySettings = catalogActivity.settings && typeof catalogActivity.settings === "object" && !Array.isArray(catalogActivity.settings)
    ? cloneDashboardJson(catalogActivity.settings)
    : {};
  if (!hasLevelConfiguration && Object.keys(legacySettings).length) {
    levels = Object.fromEntries(CATALOG_LEVEL_KEYS.map((key) => [key, { settings:cloneDashboardJson(legacySettings) }]));
  }

  const referenceLevel = cloneDashboardJson(levels["3"] || levels["1"] || { settings:{} });
  const isSingleDifficulty = CATALOG_LEVEL_KEYS.every((key) => (
    stableDashboardJson(levels[key] || { settings:{} }) === stableDashboardJson(referenceLevel)
  ));

  return {
    id:null,
    folder_id:null,
    title:String(catalogActivity.title || catalogActivity.config_name || "Activité"),
    activity_type:"tool",
    difficulty_mode:isSingleDifficulty ? "single" : "adaptive",
    source_quiz_id:null,
    config_json:isSingleDifficulty
      ? { tool_id:String(catalogActivity.tool_id || ""), level:referenceLevel }
      : { tool_id:String(catalogActivity.tool_id || "") },
    levels_json:isSingleDifficulty ? {} : levels,
    display_order:0
  };
}

function hasCatalogLevelConfiguration(level = {}) {
  if (!level || typeof level !== "object" || Array.isArray(level)) return false;
  const settings = level.settings && typeof level.settings === "object" && !Array.isArray(level.settings) ? level.settings : {};
  if (Object.keys(settings).length) return true;
  return Object.keys(level).some((key) => key !== "settings");
}

function stableDashboardJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableDashboardJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableDashboardJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function cloneDashboardJson(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

async function editPersonalActivityContent(activity = {}, { origin = "my-activities", systemPublication = null } = {}) {
  const space = currentTeacherSpace;
  const activityType = String(activity?.activity_type || "").trim();
  if (!space?.id || !["quiz", "series"].includes(activityType)) return;
  const sourceQuizId = String(activity?.source_quiz_id || "").trim();
  if (!sourceQuizId) {
    showDashboardShareToast("Le contenu source de cette activité est introuvable.", { isError:true });
    return;
  }

  try {
    const quiz = await getQuizForSpace(space.id, sourceQuizId);
    personalActivityEditorContext = {
      activityId:String(activity.id || "") || null,
      folderId:String(activity.folder_id || "").trim() || null,
      activityType,
      activityTitle:String(activity.title || "").trim(),
      difficultyMode:String(activity.difficulty_mode || "single") === "adaptive" ? "adaptive" : "single",
      configJson:activity.config_json && typeof activity.config_json === "object" ? activity.config_json : {},
      levelsJson:activity.levels_json && typeof activity.levels_json === "object" ? activity.levels_json : {},
      displayOrder:Number(activity.display_order) || 0,
      origin,
      systemPublication
    };
    await openDashboardSection("quiz");
    if (activityType === "series" || String(quiz?.editorMode || "") === "series") showQuizSeries({ quiz });
    else showQuizWorkshop({ quiz });
  } catch (error) {
    personalActivityEditorContext = null;
    showDashboardShareToast(error?.message || "Impossible d’ouvrir le contenu de cette activité.", { isError:true });
  }
}

async function syncPersonalActivityEnvelopeAfterQuizSave(savedQuiz) {
  const context = personalActivityEditorContext;
  if (!context || !currentTeacherSpace?.id || !savedQuiz?.id) return null;
  const difficultyMode = context.difficultyMode === "adaptive" ? "adaptive" : "single";
  const existingActivityShape = {
    difficulty_mode:difficultyMode,
    config_json:context.configJson || {},
    levels_json:context.levelsJson || {}
  };
  const nextConfig = context.activityId
    ? refreshQuizActivityConfig(existingActivityShape, savedQuiz)
    : buildDefaultQuizActivityConfig(savedQuiz, { difficultyMode });

  const savedActivity = await saveTeacherActivityForSpace(currentTeacherSpace.id, {
    id:context.activityId || undefined,
    folder_id:context.folderId,
    title:String(context.activityTitle || savedQuiz.title || "Activité").trim() || "Activité",
    activity_type:context.activityType === "series" ? "series" : "quiz",
    difficulty_mode:difficultyMode,
    source_quiz_id:savedQuiz.id,
    config_json:nextConfig.config_json,
    levels_json:nextConfig.levels_json,
    display_order:context.displayOrder || 0
  });
  personalActivityEditorContext = {
    ...context,
    activityId:String(savedActivity?.id || context.activityId || "") || null,
    configJson:savedActivity?.config_json || nextConfig.config_json,
    levelsJson:savedActivity?.levels_json || nextConfig.levels_json,
    displayOrder:Number(savedActivity?.display_order) || context.displayOrder || 0
  };
  hasMountedMyActivitiesView = false;
  mountedMyActivitiesTeacherSpaceId = "";
  return savedActivity;
}

async function returnFromPersonalActivityEditor() {
  if (!personalActivityEditorContext) {
    showQuizExplorer();
    return;
  }
  const returnContext = { ...personalActivityEditorContext };
  const activityId = String(returnContext.activityId || "").trim();
  personalActivityEditorContext = null;
  showQuizExplorer();

  if (activityId && currentTeacherSpace?.id) {
    try {
      const activities = await listTeacherActivitiesForSpace(currentTeacherSpace.id);
      const activity = (activities || []).find((item) => String(item.id) === activityId);
      if (activity) {
        await openPersonalActivity(activity, {
          origin:String(returnContext.origin || "my-activities"),
          systemPublication:returnContext.systemPublication || null
        });
        return;
      }
    } catch {}
  }
  await openDashboardSection(String(returnContext.origin || "") === "activities" ? "activities" : "my-activities");
}

async function testPersonalActivityFromTile(activity = {}) {
  await openPersonalActivity(activity);
  await personalActivityEditorController?.test?.();
}

function testQuizSnapshot(snapshot) {
  const issues = getQuizTestIssues(snapshot);
  if (issues.length) {
    showDashboardShareToast(issues[0], { isError: true });
    return;
  }

  const runtimeSettings = normalizeQuizRuntimeSettings(snapshot?.runtimeSettings, snapshot);
  const quizSettings = {
    ...getDefaultQuizSettings(),
    quizId: snapshot.id || "",
    quizTitle: snapshot.title || "",
    sourceInstruction: snapshot.instruction || "",
    drawMode: runtimeSettings.drawMode,
    questionSelection: runtimeSettings.questionSelection,
    quizSnapshot: snapshot
  };

  const activity = {
    id: "atelier.quiz.test",
    config_name: snapshot.title || "Test du quiz",
    pedagogical_node_id: "autres",
    tool_id: "quiz",
    description: "Test direct depuis l’Atelier de quiz.",
    default_question_count: Math.max(1, filterQuizSnapshotBySelection(snapshot, runtimeSettings.questionSelection).length),
    settings: quizSettings,
    difficulty_levels: {
      3: {
        settings: quizSettings
      }
    }
  };

  openCatalogTestRunner({
    accessCode: String(currentTeacherSpace?.access_code || "TEST").trim().toUpperCase() || "TEST",
    activity,
    catalogActivities: [activity],
    initialLevel: 3,
    titleLabel: "Test du quiz",
    runtimeConfigOptions: {
      settings: quizSettings
    },
    showLevelSelector: false,
    showToast: showDashboardShareToast
  });
}

quizWorkshopViewController = createQuizWorkshopViewController({
  view: quizWorkshopView,
  addButton: btnQuizAddQuestion,
  drawer: quizWorkshopDrawer,
  quickEntryDrawer: quizQuickEntryDrawer,
  drawerScrim: quizWorkshopScrim,
  drawerCloseButton: btnQuizDrawerClose,
  templateGrid: quizWorkshopTemplateGrid,
  confirmButton: btnQuizConfirmTemplate,
  saveButton: btnQuizSave,
  testButton: btnQuizTest,
  titleInput: quizWorkshopTitleInput,
  questionsHost: quizWorkshopQuestions,
  emptyState: quizWorkshopEmptyState,
  questionCount: quizWorkshopQuestionCount,
  getCurrentTeacherSpace: () => currentTeacherSpace,
  listResourceFoldersForSpace,
  createResourceFolderForSpace,
  ensureRecordingsResourceFolderForSpace,
  listResourcesForSpace,
  uploadResourceForSpace,
  createResourceSignedUrl,
  showToast: showDashboardShareToast,
  onSaveQuiz: async (snapshot) => {
    const saved = await quizExplorerViewController?.saveQuiz?.(snapshot);
    if (!saved) throw new Error("Enregistrement Supabase impossible.");
    const personalActivity = await syncPersonalActivityEnvelopeAfterQuizSave(saved);
    showDashboardShareToast(personalActivity
      ? `Activité « ${personalActivity.title} » enregistrée.`
      : `Quiz « ${saved.title} » enregistré.`);
    return saved;
  },
  onTestQuiz: testQuizSnapshot
});

function showQuizExplorer(){
  quizWorkshopViewController?.close?.();
  quizSeriesViewController?.close?.();
  quizWorkshopView?.classList.add("hidden");
  quizSeriesView?.classList.add("hidden");
  quizExplorerPane?.classList.remove("hidden");
  quizView?.classList.remove("is-quiz-workshop-open", "is-quiz-series-open");
  quizExplorerViewController?.render?.();
}

function showQuizWorkshop({ quiz = null, folderId = null, isSystem = false } = {}){
  quizExplorerPane?.classList.add("hidden");
  quizSeriesView?.classList.add("hidden");
  quizWorkshopView?.classList.remove("hidden");
  quizView?.classList.remove("is-quiz-series-open");
  quizView?.classList.add("is-quiz-workshop-open");
  quizWorkshopViewController?.render?.();
  if (quiz) quizWorkshopViewController?.loadQuiz?.(quiz);
  else quizWorkshopViewController?.resetQuiz?.({ folderId, title: "", is_system: isSystem });
}

function showQuizSeries({ quiz = null, folderId = null, modelId = "", instruction = "", title = "", isSystem = false } = {}){
  quizExplorerPane?.classList.add("hidden");
  quizWorkshopView?.classList.add("hidden");
  quizSeriesView?.classList.remove("hidden");
  quizView?.classList.remove("is-quiz-workshop-open");
  quizView?.classList.add("is-quiz-series-open");
  quizSeriesViewController?.render?.();
  try {
    if (quiz) quizSeriesViewController?.loadQuiz?.(quiz);
    else quizSeriesViewController?.resetSeries?.({ folderId, modelId, instruction, title, isSystem });
  } catch (error) {
    showDashboardShareToast(error?.message || "Impossible d’ouvrir cette série.", { isError:true });
    showQuizExplorer();
  }
}

quizSeriesViewController = createQuizSeriesViewController({
  view: quizSeriesView,
  backButton: btnBackQuizSeries,
  saveButton: btnQuizSeriesSave,
  testButton: btnQuizSeriesTest,
  titleInput: quizSeriesTitleInput,
  instructionInput: quizSeriesInstructionInput,
  tableHost: quizSeriesTableHost,
  addRowButton: btnQuizSeriesAddRow,
  importQuestionsButton: btnQuizSeriesImportQuestions,
  importScrim: quizSeriesImportScrim,
  importDrawer: quizSeriesImportDrawer,
  messageHost: quizSeriesMessage,
  showToast: showDashboardShareToast,
  onBack: returnFromPersonalActivityEditor,
  onSaveQuiz: async (snapshot) => {
    const saved = await quizExplorerViewController?.saveQuiz?.(snapshot);
    if (!saved) throw new Error("Enregistrement Supabase impossible.");
    const personalActivity = await syncPersonalActivityEnvelopeAfterQuizSave(saved);
    showDashboardShareToast(personalActivity
      ? `Activité « ${personalActivity.title} » enregistrée.`
      : `Quiz « ${saved.title} » enregistré.`);
    return saved;
  },
  onTestQuiz: testQuizSnapshot
});

quizExplorerViewController = createQuizExplorerViewController({
  view: quizView,
  header: quizExplorerHeader,
  list: quizList,
  createQuizButton: btnCreateQuiz,
  createSeriesButton: btnCreateQuizSeries,
  createFolderButton: btnCreateQuizFolder,
  onCreateQuiz: ({ folderId, isSystem = false } = {}) => showQuizWorkshop({ folderId, isSystem }),
  onCreateSeries: ({ folderId, isSystem = false } = {}) => {
    openQuizSeriesCreationOverlay({
      onConfirm: ({ modelId, title, instruction, action }) => {
        showQuizSeries({ folderId, modelId, title, instruction, isSystem });
        if (action === "import") {
          window.requestAnimationFrame(() => {
            quizSeriesViewController?.openImportDrawer?.({ source:"creation" });
          });
        }
      }
    });
  },
  onOpenQuiz: (quiz) => {
    if (quiz?.is_system === true && !currentUserIsSuperAdmin) {
      testQuizSnapshot(quiz);
      return;
    }
    if (String(quiz?.editorMode || "") === "series") showQuizSeries({ quiz });
    else showQuizWorkshop({ quiz });
  },
  onAssignQuiz: async (quiz) => {
    currentDashboardSection = "missions";
    renderDashboardShellState();
    await ensureMissionsViewMounted({ forceRefresh:true });
    await missionsViewController?.createMissionFromQuiz?.(quiz);
  },
  getCurrentTeacherSpace: () => currentTeacherSpace,
  getIsSuperAdmin: () => currentUserIsSuperAdmin,
  listQuizFoldersForSpace,
  createQuizFolderForSpace,
  updateQuizFolder,
  deleteQuizFolder,
  listQuizzesForSpace,
  updateQuizPlacement,
  saveQuizForSpace,
  deleteQuiz,
  showToast: showDashboardShareToast
});

systemImagesImportDialog = createSystemImagesImportDialog({
  getIsSuperAdmin: () => currentUserIsSuperAdmin,
  listImageAssetsAsAdmin,
  importSystemImageAssetAsAdmin,
  showToast: showDashboardShareToast,
  onImported: () => resourcesViewController?.refresh?.({ forceRefresh:false })
});

lexicalBankViewController = createLexicalBankViewController({
  view: resourcesView,
  host: resourcesList,
  getIsSuperAdmin: () => currentUserIsSuperAdmin,
  listLexicalEntries,
  saveLexicalEntryAsAdmin,
  deleteLexicalEntryAsAdmin,
  upsertLexicalEntriesAsAdmin,
  showToast: showDashboardShareToast,
  onBack: () => {
    void resourcesViewController?.refresh?.({ forceRefresh:true });
  }
});

resourcesViewController = createResourcesViewController({
  view: resourcesView,
  header: resourcesHeader,
  list: resourcesList,
  createFolderButton: btnCreateResourceFolder,
  importResourcesButton: btnImportResources,
  recordAudioButton: btnRecordResourceAudio,
  resourceFileInput,
  storageQuotaElement: resourceStorageQuota,
  showToast: showDashboardShareToast,
  getCurrentTeacherSpace: () => currentTeacherSpace,
  getIsSuperAdmin: () => currentUserIsSuperAdmin,
  listResourceFoldersForSpace,
  createResourceFolderForSpace,
  createSystemResourceFolderAsAdmin,
  ensureRecordingsResourceFolderForSpace,
  updateResourceFolder,
  deleteResourceFolder,
  listResourcesForSpace,
  uploadResourceForSpace,
  replaceAudioResourceFile,
  updateResource,
  deleteResource,
  createResourceSignedUrl,
  getLexicalEntriesCount,
  onOpenLexicalBank: () => { void lexicalBankViewController?.open?.(); },
  onImportSystemImages: ({ folderPath, folderName } = {}) => {
    systemImagesImportDialog?.open?.({ destinationPath:folderPath, destinationLabel:folderName });
  }
});

audioAdminViewController = createAudioAdminViewController({
  view: adminView,
  listImagierAudioEntriesAsAdmin,
  listInterfaceAudioAssetsAsAdmin,
  uploadSystemInterfaceAudioAsAdmin,
  deleteSystemInterfaceAudioAsAdmin,
  getInterfaceAudioAssetPublicUrl,
  showToast: showDashboardShareToast
});

teacherToolsViewController = createTeacherToolsViewController({
  view: teacherToolsView,
  host: teacherToolsHost,
  getCurrentTeacherSpace: () => currentTeacherSpace,
  getCurrentStudents: () => currentStudents,
  listCatalogActivitiesForTeacherSpace,
  listPedagogicalNodesForTeacher,
  listResourcesForSpace,
  uploadResourceForSpace,
  createResourceSignedUrl,
  showToast: showDashboardShareToast
});

function isHelpMenuOpen(){
  return headerPopupController.isHelpOpen();
}

function isUserMenuOpen(){
  return headerPopupController.isUserOpen();
}

function closeHelpMenu(){
  headerPopupController.closeHelp();
}

function toggleHelpMenu(){
  headerPopupController.toggleHelp();
}

function closeUserMenu(){
  headerPopupController.closeUser();
}

function toggleUserMenu(){
  headerPopupController.toggleUser();
}

function closeHeaderPopups(){
  headerPopupController.closeAll();
}

function ensureDashboardToast(){
  if (dashboardToast) return dashboardToast;

  const toast = document.createElement("div");
  toast.className = "dashboard-share-toast hidden";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  document.body.appendChild(toast);
  dashboardToast = toast;
  return toast;
}

function showDashboardShareToast(message, { isError = false, duration = 2400 } = {}){
  const toast = ensureDashboardToast();
  toast.textContent = String(message || "");
  toast.classList.toggle("is-error", isError === true);
  toast.classList.remove("hidden");

  if (dashboardToastTimer) {
    clearTimeout(dashboardToastTimer);
    dashboardToastTimer = null;
  }

  if (duration > 0) {
    dashboardToastTimer = window.setTimeout(() => {
      dashboardToast?.classList.add("hidden");
      dashboardToastTimer = null;
    }, duration);
  }
}

function syncDashboardViewportSizing(){
  const viewportHeight = Math.max(
    window.visualViewport?.height || 0,
    window.innerHeight || 0,
    document.documentElement?.clientHeight || 0
  );
  const headerHeight = Math.ceil(dashboardHeader?.getBoundingClientRect().height || 0);

  if (dashboardWorkArea) {
    dashboardWorkArea.style.setProperty("--dashboard-header-height", `${headerHeight}px`);
  }

  if (dashboardShell) {
    dashboardShell.style.height = `${viewportHeight}px`;
  }
}

function renderStudentViewToggle(){
  const isList = studentViewMode !== "tiles";

  btnStudentListView?.classList.toggle("is-active", isList);
  btnStudentTileView?.classList.toggle("is-active", !isList);
  btnStudentListView?.setAttribute("aria-pressed", String(isList));
  btnStudentTileView?.setAttribute("aria-pressed", String(!isList));
}

function rememberActivitiesScrollPosition(){
  if (!configsList) return;
  activityListScrollTop = configsList.scrollTop;
}

function restoreActivitiesScrollPosition(){
  if (!configsList) return;

  const target = activityListScrollTop;
  window.requestAnimationFrame(() => {
    configsList.scrollTop = target;
  });
}

async function ensureClassViewMounted({ forceRefresh = false } = {}){
  const teacherSpaceId = String(currentTeacherSpace?.id || "");
  if (!forceRefresh && hasMountedClassView && mountedClassTeacherSpaceId === teacherSpaceId) return;
  await studentController?.renderStudentsColumn({ skipRefresh: !forceRefresh });
  hasMountedClassView = true;
  mountedClassTeacherSpaceId = teacherSpaceId;
}

async function ensureAdventureViewMounted({ forceRefresh = false } = {}){
  const teacherSpaceId = String(currentTeacherSpace?.id || "");
  if (!forceRefresh && hasMountedAdventureView && mountedAdventureTeacherSpaceId === teacherSpaceId) return;
  await adventureViewController?.refresh?.({ forceRefresh });
  hasMountedAdventureView = true;
  mountedAdventureTeacherSpaceId = teacherSpaceId;
}

async function ensureMyActivitiesViewMounted({ forceRefresh = false } = {}){
  const teacherSpaceId = String(currentTeacherSpace?.id || "");
  if (!forceRefresh && hasMountedMyActivitiesView && mountedMyActivitiesTeacherSpaceId === teacherSpaceId) return;
  await myActivitiesViewController?.render?.({ forceRefresh:true });
  hasMountedMyActivitiesView = true;
  mountedMyActivitiesTeacherSpaceId = teacherSpaceId;
}

async function ensureActivityAssignmentViewMounted({ forceRefresh = false, preselect = null } = {}){
  await activityAssignmentViewController?.render?.({ forceRefresh, preselect });
}

async function openActivityAssignment({ sourceType = "", sourceId = "" } = {}){
  await openDashboardSection("activity-assignment");
  if (sourceType && sourceId) {
    await activityAssignmentViewController?.open?.({ sourceType, sourceId });
  }
}

async function ensureActivitiesViewMounted({ forceRefresh = false } = {}){
  const teacherSpaceId = String(currentTeacherSpace?.id || "");
  if (!forceRefresh && hasMountedActivitiesView && mountedActivitiesTeacherSpaceId === teacherSpaceId) return;
  await activitiesViewController?.renderRightPanel({ forceRefresh });
  hasMountedActivitiesView = true;
  mountedActivitiesTeacherSpaceId = teacherSpaceId;
}

async function ensureMissionsViewMounted({ forceRefresh = false } = {}){
  const teacherSpaceId = String(currentTeacherSpace?.id || "");
  if (!forceRefresh && hasMountedMissionsView && mountedMissionsTeacherSpaceId === teacherSpaceId) return;
  hasMountedMissionsView = true;
  mountedMissionsTeacherSpaceId = teacherSpaceId;
  await missionsViewController?.renderMissionsView?.({ forceRefresh: true });
}

async function ensureQuizViewMounted(){
  const teacherSpaceId = String(currentTeacherSpace?.id || "");
  const isSameTeacherSpace = hasMountedQuizView && mountedQuizTeacherSpaceId === teacherSpaceId;
  const isEditingQuiz = quizView?.classList.contains("is-quiz-workshop-open")
    || quizView?.classList.contains("is-quiz-series-open");

  if (!isSameTeacherSpace) {
    await quizExplorerViewController?.refresh?.();
    quizWorkshopViewController?.render?.();
    hasMountedQuizView = true;
    mountedQuizTeacherSpaceId = teacherSpaceId;
    showQuizExplorer();
    return;
  }

  // Une vue d’édition ouverte garde son DOM, son tiroir et ses brouillons
  // lorsqu’on consulte temporairement un autre onglet.
  if (isEditingQuiz) return;

  await quizExplorerViewController?.refresh?.();
}

async function ensureResourcesViewMounted({ forceRefresh = false } = {}){
  const teacherSpaceId = String(currentTeacherSpace?.id || "");
  if (!forceRefresh && hasMountedResourcesView && mountedResourcesTeacherSpaceId === teacherSpaceId) return;
  await resourcesViewController?.refresh?.({ forceRefresh });
  hasMountedResourcesView = true;
  mountedResourcesTeacherSpaceId = teacherSpaceId;
}

async function ensureAdminViewMounted({ forceRefresh = false } = {}){
  if (currentUserIsSuperAdmin !== true) return;
  const userId = String(currentUser?.id || "");
  if (!forceRefresh && hasMountedAdminView && mountedAdminUserId === userId) return;
  await audioAdminViewController?.refresh?.();
  hasMountedAdminView = true;
  mountedAdminUserId = userId;
}

async function ensureTeacherToolsViewMounted({ forceRefresh = false } = {}){
  const teacherSpaceId = String(currentTeacherSpace?.id || "");
  if (!forceRefresh && hasMountedTeacherToolsView && mountedTeacherToolsTeacherSpaceId === teacherSpaceId) {
    return;
  }
  teacherToolsViewController?.render?.();
  hasMountedTeacherToolsView = true;
  mountedTeacherToolsTeacherSpaceId = teacherSpaceId;
}

async function openDashboardSection(section){
  const next = String(section || "").trim();
  if (!next) return;
  currentDashboardSection = next;
  renderDashboardShellState();

  if (next === "activity-hub") {
    activityHubViewController?.render?.();
    return;
  }
  if (next === "my-activities") return ensureMyActivitiesViewMounted();
  if (next === "personal-activity-editor") return;
  if (next === "activity-assignment") {
    await ensureActivityAssignmentViewMounted({ forceRefresh:true });
    return;
  }
  if (next === "class") return ensureClassViewMounted();
  if (next === "adventure") {
    const preserveDraft = adventureViewController?.hasUnsavedChanges?.() === true;
    return ensureAdventureViewMounted({ forceRefresh: !preserveDraft });
  }
  if (next === "activities") {
    await ensureActivitiesViewMounted();
    restoreActivitiesScrollPosition();
    return;
  }
  if (next === "missions") return ensureMissionsViewMounted();
  if (next === "quiz") return ensureQuizViewMounted();
  if (next === "resources") return ensureResourcesViewMounted();
  if (next === "teacher-tools") return ensureTeacherToolsViewMounted();
  if (next === "admin" && currentUserIsSuperAdmin === true) return ensureAdminViewMounted({ forceRefresh:true });
}

function buildDashboardHistoryState(){
  return {
    app: "teacher-dashboard",
    accessCode: String(currentTeacherSpace?.access_code || "").trim()
  };
}

function syncDashboardUrl({ mode = "replace" } = {}){
  try {
    const url = new URL(window.location.href);
    const accessCode = String(currentTeacherSpace?.access_code || "").trim();

    if (accessCode) {
      url.searchParams.set("accessCode", accessCode);
    } else {
      url.searchParams.delete("accessCode");
    }

    // L’ancien éditeur d’activités est en quarantaine : ces paramètres ne pilotent plus le dashboard.
    url.searchParams.delete("configName");
    url.searchParams.delete("projected");

    const historyMethod = mode === "push" ? "pushState" : "replaceState";
    history[historyMethod](buildDashboardHistoryState(), "", url.toString());
  } catch {}
}

function renderDashboardShellState(){
  syncDashboardViewportSizing();

  if (currentDashboardSection !== "quiz") personalActivityEditorContext = null;

  const isActivitiesSection = ["activity-hub", "my-activities", "personal-activity-editor", "activity-assignment", "activities"].includes(currentDashboardSection);
  btnNavActivityHub?.classList.toggle("is-active", isActivitiesSection);
  btnNavAdventure?.classList.toggle("is-active", currentDashboardSection === "adventure");
  btnNavMissions?.classList.toggle("is-active", currentDashboardSection === "missions");
  btnNavClass?.classList.toggle("is-active", currentDashboardSection === "class");
  btnNavQuiz?.classList.toggle("is-active", currentDashboardSection === "quiz");
  btnNavResources?.classList.toggle("is-active", currentDashboardSection === "resources");
  btnNavTeacherTools?.classList.toggle("is-active", currentDashboardSection === "teacher-tools");
  btnNavAdmin?.classList.toggle("is-active", currentDashboardSection === "admin");
  btnNavAdmin?.classList.toggle("hidden", currentUserIsSuperAdmin !== true);

  activityHubView?.classList.toggle("hidden", currentDashboardSection !== "activity-hub");
  myActivitiesView?.classList.toggle("hidden", currentDashboardSection !== "my-activities");
  personalActivityEditorView?.classList.toggle("hidden", currentDashboardSection !== "personal-activity-editor");
  activityAssignmentView?.classList.toggle("hidden", currentDashboardSection !== "activity-assignment");
  adventureView?.classList.toggle("hidden", currentDashboardSection !== "adventure");
  activitiesView?.classList.toggle("hidden", currentDashboardSection !== "activities");
  missionsView?.classList.toggle("hidden", currentDashboardSection !== "missions");
  classView?.classList.toggle("hidden", currentDashboardSection !== "class");
  quizView?.classList.toggle("hidden", currentDashboardSection !== "quiz");
  resourcesView?.classList.toggle("hidden", currentDashboardSection !== "resources");
  teacherToolsView?.classList.toggle("hidden", currentDashboardSection !== "teacher-tools");
  adminView?.classList.toggle("hidden", currentDashboardSection !== "admin");

  navHelpButtons.forEach((button) => {
    button.classList.toggle("is-hidden", !showDashboardHelpIcons);
  });
  applyContextualHelpPreference(showDashboardHelpIcons, document);

  if (toggleHelpIcons) {
    toggleHelpIcons.checked = showDashboardHelpIcons;
  }

  renderStudentViewToggle();
}

function updateClassSectionTitle(){
  const title = document.getElementById("classSectionTitle");
  if (!title) return;

  const count = Array.isArray(currentStudents) ? currentStudents.length : 0;
  title.textContent = `${count} élève${count > 1 ? "s" : ""}`;
}

/* =========================
   INIT
   ========================= */

syncDashboardViewportSizing();
boot();

/* =========================
   EVENTS
   ========================= */

btnLogout?.addEventListener("click", logout);
btnEditAccessCode?.addEventListener("click", studentController.openEditAccessCodeModal);
btnAddStudent?.addEventListener("click", studentController.openPrimaryModal);
btnModalCancel?.addEventListener("click", studentController.closeAccessCodeModal);
btnModalCreate?.addEventListener("click", studentController.submitPrimaryModal);
btnNavActivityHub?.addEventListener("click", async () => {
  await openDashboardSection("activity-hub");
});
btnNavAdventure?.addEventListener("click", async () => {
  currentDashboardSection = "adventure";
  renderDashboardShellState();
  const preserveDraft = adventureViewController?.hasUnsavedChanges?.() === true;
  await ensureAdventureViewMounted({ forceRefresh: !preserveDraft });
});
btnNavMissions?.addEventListener("click", async () => {
  currentDashboardSection = "missions";
  renderDashboardShellState();
  await ensureMissionsViewMounted();
});
btnNavClass?.addEventListener("click", async () => {
  currentDashboardSection = "class";
  renderDashboardShellState();
  await ensureClassViewMounted();
});
btnNavQuiz?.addEventListener("click", async () => {
  if (currentDashboardSection === "quiz" && personalActivityEditorContext) {
    personalActivityEditorContext = null;
    showQuizExplorer();
    return;
  }
  if (currentDashboardSection === "quiz") return;
  personalActivityEditorContext = null;
  currentDashboardSection = "quiz";
  renderDashboardShellState();
  await ensureQuizViewMounted();
  showQuizExplorer();
});
btnBackQuizExplorer?.addEventListener("click", () => {
  void returnFromPersonalActivityEditor();
});
btnNavResources?.addEventListener("click", async () => {
  currentDashboardSection = "resources";
  renderDashboardShellState();
  await ensureResourcesViewMounted();
});
btnNavTeacherTools?.addEventListener("click", async () => {
  currentDashboardSection = "teacher-tools";
  renderDashboardShellState();
  await ensureTeacherToolsViewMounted();
});
btnNavAdmin?.addEventListener("click", async () => {
  if (currentUserIsSuperAdmin !== true) return;
  currentDashboardSection = "admin";
  renderDashboardShellState();
  await ensureAdminViewMounted({ forceRefresh:true });
});
btnStudentListView?.addEventListener("click", async () => {
  if (studentViewMode === "list") return;
  studentViewMode = "list";
  renderStudentViewToggle();
  await studentController.renderStudentsColumn({ skipRefresh: true });
});
btnStudentTileView?.addEventListener("click", async () => {
  if (studentViewMode === "tiles") return;
  studentViewMode = "tiles";
  renderStudentViewToggle();
  await studentController.renderStudentsColumn({ skipRefresh: true });
});
btnDashboardHelp?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleHelpMenu();
});
btnUserMenu?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleUserMenu();
});
btnStartTutorial?.addEventListener("click", () => {
  helpPopoverController.close();
  closeHeaderPopups();
  showDashboardShareToast("Tutoriel à brancher plus tard.", { duration: 3200 });
});
toggleHelpIcons?.addEventListener("change", () => {
  showDashboardHelpIcons = setContextualHelpEnabled(toggleHelpIcons.checked, document);
  renderDashboardShellState();
});
btnOpenProfileOverlay?.addEventListener("click", () => {
  closeHeaderPopups();
  profileOverlay?.classList.remove("hidden");
});
btnCloseProfileOverlay?.addEventListener("click", () => {
  profileOverlay?.classList.add("hidden");
});
profileOverlay?.addEventListener("click", (event) => {
  if (event.target === profileOverlay) {
    profileOverlay.classList.add("hidden");
  }
});
document.addEventListener("pointerdown", (event) => {
  headerPopupController.handleDocumentPointerDown(event);
});
window.addEventListener("popstate", () => {
  syncDashboardUrl();
});
window.addEventListener("resize", () => {
  syncDashboardViewportSizing();
});
window.visualViewport?.addEventListener?.("resize", syncDashboardViewportSizing);
configsList?.addEventListener("scroll", () => {
  rememberActivitiesScrollPosition();
});

accessCodeInput?.addEventListener("keydown", async (e) => {
  if (e.key === "Enter"){
    e.preventDefault();
    await studentController.submitPrimaryModal();
    return;
  }

  if (e.key === "Escape"){
    e.preventDefault();
    studentController.closeAccessCodeModal();
  }
});

accessCodeInput?.addEventListener("input", () => {
  const start = accessCodeInput.selectionStart ?? accessCodeInput.value.length;
  const end = accessCodeInput.selectionEnd ?? accessCodeInput.value.length;
  accessCodeInput.value = String(accessCodeInput.value || "").toUpperCase();
  try {
    accessCodeInput.setSelectionRange(start, end);
  } catch {}
});

accessCodeModal?.addEventListener("click", (e) => {
  if (e.target === accessCodeModal){
    studentController.closeAccessCodeModal();
  }
});

btnDeleteStudentCancel?.addEventListener("click", studentController.closeDeleteStudentModal);
btnDeleteStudentConfirm?.addEventListener("click", studentController.submitDeleteStudent);

deleteStudentModal?.addEventListener("click", (e) => {
  if (e.target === deleteStudentModal){
    studentController.closeDeleteStudentModal();
  }
});

document.addEventListener("pointerup", () => studentController?.clearArmedHandle?.());
document.addEventListener("mouseup", () => studentController?.clearArmedHandle?.());
document.addEventListener("touchend", () => studentController?.clearArmedHandle?.(), { passive: true });

studentsList?.addEventListener("dragover", studentController.handleStudentDragOver);
studentsList?.addEventListener("drop", studentController.handleStudentDrop);

/* =========================
   BOOT
   ========================= */

async function boot(){
  try {
    currentUser = await getCurrentUser();
    if (!currentUser){
      window.location.href = "login.html";
      return;
    }

    if (teacherEmail) teacherEmail.textContent = currentUser.email || "utilisateur inconnu";
    currentUserIsSuperAdmin = await isCurrentUserSuperAdmin();
    btnNavAdventure?.classList.remove("hidden");
    btnNavAdmin?.classList.toggle("hidden", currentUserIsSuperAdmin !== true);

    currentTeacherSpace = await getMyTeacherSpace();
    if (currentTeacherSpace){
      currentTeacherSpace = await markTeacherSpaceAsOpened(currentTeacherSpace.id);
      await studentController.refreshStudents();
    }

    studentController.renderAccessCodeBox();
    renderDashboardShellState();
    updateClassSectionTitle();
    await ensureClassViewMounted();
    activityHubViewController?.render?.();
    syncDashboardUrl();
  } catch (err) {
    if (teacherEmail) teacherEmail.textContent = err?.message || "Impossible de charger le compte.";
  }
}

/* =========================
   AUTH
   ========================= */

async function logout(){
  try {
    await signOutUser();
    window.location.href = "login.html";
  } catch {
    showDashboardShareToast("Erreur lors de la déconnexion.", { isError: true });
  }
}
