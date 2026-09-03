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
  listMissionFoldersForSpace,
  createMissionFolderForSpace,
  updateMissionFolder,
  deleteMissionFolder,
  listMissionsForSpace,
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
  updateResource,
  deleteResource,
  createResourceSignedUrl,
  syncPhonologyWordsAsAdmin,
  listImageAssetsAsAdmin,
  listPhonologyWordLexiconAsAdmin,
  importSystemImageAssetAsAdmin,
  listInterfaceAudioAssetsAsAdmin,
  uploadSystemInterfaceAudioAsAdmin,
  deleteSystemInterfaceAudioAsAdmin,
  getInterfaceAudioAssetPublicUrl
} from "./teacher-api.js";
import { createHeaderPopupController } from "./dashboard/header-popups.js";
import { createStudentDashboardController } from "./dashboard/student-controller.js";
import { createActivitiesViewController } from "./dashboard/activities-view.js";
import { createAdventureRegistryViewController } from "./dashboard/adventure-registry-view.js";
import { createMissionsViewController } from "./dashboard/missions-view.js";
import { createTeacherToolsViewController } from "./dashboard/teacher-tools-view.js";
import { createQuizWorkshopViewController } from "./dashboard/quiz-workshop-view.js";
import { createQuizExplorerViewController } from "./dashboard/quiz-explorer-view.js";
import { createQuizSeriesViewController, openQuizSeriesCreationOverlay } from "./dashboard/quiz-series-view.js";
import { createResourcesViewController } from "./dashboard/resources-view.js";
import { createAudioAdminViewController } from "./dashboard/audio-admin-view.js";
import { createPhonologyWordsImportDialog } from "./dashboard/phonology-words-import-dialog.js";
import { createSystemImagesImportDialog } from "./dashboard/system-images-import-dialog.js";
import { openCatalogTestRunner } from "./dashboard/catalog-test-runner.js";
import { getDefaultSettings as getDefaultQuizSettings, getQuizTestIssues } from "../../tools/quiz/model.js";
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
const btnNavAdventure = document.getElementById("btnNavAdventure");
const btnNavActivities = document.getElementById("btnNavActivities");
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
const btnManagePhonologyWords = document.getElementById("btnManagePhonologyWords");
const btnManageSystemImages = document.getElementById("btnManageSystemImages");
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
let currentDashboardSection = "activities"; // "adventure" | "activities" | "missions" | "class" | "quiz" | "resources" | "teacher-tools" | "admin"
let showDashboardHelpIcons = getContextualHelpEnabled();
let studentViewMode = "tiles"; // "list" | "tiles"
let activityListScrollTop = 0;
let hasMountedClassView = false;
let hasMountedAdventureView = false;
let hasMountedActivitiesView = false;
let hasMountedMissionsView = false;
let hasMountedQuizView = false;
let hasMountedResourcesView = false;
let hasMountedTeacherToolsView = false;
let hasMountedAdminView = false;
let currentUserIsSuperAdmin = false;
let mountedClassTeacherSpaceId = "";
let mountedAdventureTeacherSpaceId = "";
let mountedActivitiesTeacherSpaceId = "";
let mountedMissionsTeacherSpaceId = "";
let mountedQuizTeacherSpaceId = "";
let mountedResourcesTeacherSpaceId = "";
let mountedTeacherToolsTeacherSpaceId = "";
let mountedAdminUserId = "";
let dashboardToast = null;
let dashboardToastTimer = null;

let adventureViewController = null;
let activitiesViewController = null;
let missionsViewController = null;
let quizExplorerViewController = null;
let quizWorkshopViewController = null;
let quizSeriesViewController = null;
let resourcesViewController = null;
let phonologyWordsImportDialog = null;
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
  listMissionSteps,
  listMissionAssignments,
  saveMissionForSpace,
  setMissionInactive,
  reactivateMission,
  deleteMissionPermanently,
  listCatalogActivitiesForTeacherSpace,
  listPedagogicalNodesForTeacher
});

function testQuizSnapshot(snapshot) {
  const issues = getQuizTestIssues(snapshot);
  if (issues.length) {
    showDashboardShareToast(issues[0], { isError: true });
    return;
  }

  const quizSettings = {
    ...getDefaultQuizSettings(),
    quizId: snapshot.id || "",
    quizTitle: snapshot.title || "",
    quizSnapshot: snapshot
  };

  const activity = {
    id: "atelier.quiz.test",
    config_name: snapshot.title || "Test du quiz",
    pedagogical_node_id: "autres",
    tool_id: "quiz",
    description: "Test direct depuis l’Atelier de quiz.",
    default_question_count: snapshot.questions.reduce((total, question) => total + Math.max(1, question?.variants?.length || 1), 0),
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
    showDashboardShareToast(`Quiz « ${saved.title} » enregistré.`);
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
  onBack: showQuizExplorer,
  onSaveQuiz: async (snapshot) => {
    const saved = await quizExplorerViewController?.saveQuiz?.(snapshot);
    if (!saved) throw new Error("Enregistrement Supabase impossible.");
    showDashboardShareToast(`Quiz « ${saved.title} » enregistré.`);
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
  getCurrentTeacherSpace: () => currentTeacherSpace,
  getIsSuperAdmin: () => currentUserIsSuperAdmin,
  listQuizFoldersForSpace,
  createQuizFolderForSpace,
  updateQuizFolder,
  deleteQuizFolder,
  listQuizzesForSpace,
  saveQuizForSpace,
  deleteQuiz,
  showToast: showDashboardShareToast
});

phonologyWordsImportDialog = createPhonologyWordsImportDialog({
  openButton: btnManagePhonologyWords,
  getIsSuperAdmin: () => currentUserIsSuperAdmin,
  syncPhonologyWordsAsAdmin,
  showToast: showDashboardShareToast
});

systemImagesImportDialog = createSystemImagesImportDialog({
  openButton: btnManageSystemImages,
  getIsSuperAdmin: () => currentUserIsSuperAdmin,
  listImageAssetsAsAdmin,
  listPhonologyWordLexiconAsAdmin,
  importSystemImageAssetAsAdmin,
  showToast: showDashboardShareToast,
  onImported: () => resourcesViewController?.refresh?.({ forceRefresh:false })
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
  updateResource,
  deleteResource,
  createResourceSignedUrl
});

audioAdminViewController = createAudioAdminViewController({
  view: adminView,
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

  btnNavAdventure?.classList.toggle("is-active", currentDashboardSection === "adventure");
  btnNavActivities?.classList.toggle("is-active", currentDashboardSection === "activities");
  btnNavMissions?.classList.toggle("is-active", currentDashboardSection === "missions");
  btnNavClass?.classList.toggle("is-active", currentDashboardSection === "class");
  btnNavQuiz?.classList.toggle("is-active", currentDashboardSection === "quiz");
  btnNavResources?.classList.toggle("is-active", currentDashboardSection === "resources");
  btnNavTeacherTools?.classList.toggle("is-active", currentDashboardSection === "teacher-tools");
  btnNavAdmin?.classList.toggle("is-active", currentDashboardSection === "admin");
  btnNavAdmin?.classList.toggle("hidden", currentUserIsSuperAdmin !== true);

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

  phonologyWordsImportDialog?.setVisible?.(currentUserIsSuperAdmin === true);
  systemImagesImportDialog?.setVisible?.(currentUserIsSuperAdmin === true);
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
btnNavAdventure?.addEventListener("click", async () => {
  currentDashboardSection = "adventure";
  renderDashboardShellState();
  const preserveDraft = adventureViewController?.hasUnsavedChanges?.() === true;
  await ensureAdventureViewMounted({ forceRefresh: !preserveDraft });
});
btnNavActivities?.addEventListener("click", async () => {
  currentDashboardSection = "activities";
  renderDashboardShellState();
  await ensureActivitiesViewMounted();
  restoreActivitiesScrollPosition();
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
  if (currentDashboardSection === "quiz") return;
  currentDashboardSection = "quiz";
  renderDashboardShellState();
  await ensureQuizViewMounted();
});
btnBackQuizExplorer?.addEventListener("click", () => {
  showQuizExplorer();
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
  await ensureAdminViewMounted();
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
    await ensureActivitiesViewMounted({ forceRefresh: true });
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
