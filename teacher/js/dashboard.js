import {
  getCurrentUser,
  signOutUser,
  normalizeAccessCode,
  normalizeConfigName,
  getMyTeacherSpace,
  createOrGetMyTeacherSpace,
  updateMyTeacherSpace,
  markTeacherSpaceAsOpened,
  getMyActivitiesForSpace,
  getMyActivityFoldersForSpace,
  createActivityFolderForSpace,
  updateActivityFolder,
  deleteActivityFolder,
  createQuestionBankFolderForSpace,
  updateQuestionBankFolder,
  deleteQuestionBankFolder,
  listQuestionBankFoldersForSpace,
  deleteMyActivity,
  saveActivityConfig,
  updateActivityDashboardMeta,
  setHighlightedActivityForTeacherSpace,
  listStudentsForTeacherSpace,
  createStudentForTeacherSpace,
  updateStudent,
  deleteStudent,
  saveStudentOrderForTeacherSpace
} from "./teacher-api.js";
import {
  DEFAULT_ACTIVITY_MODE,
  getActivityModeLabel,
  isStudentFacingActivityMode,
  normalizeActivityMode
} from "../../shared/activity-modes.js";
import {
  normalizeActivitySequence
} from "../../shared/activity-config.js";
import { sanitizeActivityConfigJson } from "../../shared/api-common.js";
import {
  ACTIVITY_SHARE_MESSAGES,
  isActivityShareable,
  copyActivityShareLink,
  openActivityShareLink,
  downloadActivityShareQrCode
} from "./activity-share.js";
import {
  normalizeTreeId,
  sortFoldersByDisplay as sortDashboardFoldersByDisplay
} from "./dashboard/activity-tree.js";
import {
  escapeAttr,
  escapeHtml
} from "./dashboard/text-utils.js";
import { createDashboardShareManager } from "./dashboard/share-manager.js";
import { createHeaderPopupController } from "./dashboard/header-popups.js";
import { createActivityOverlayManager } from "./dashboard/activity-overlays.js";
import { createActivityDragController } from "./dashboard/activity-drag.js";
import { createEditorController } from "./dashboard/editor-controller.js";
import { createStudentDashboardController } from "./dashboard/student-controller.js";
import { createQuestionBanksViewController } from "./dashboard/question-banks-view.js";
import { createActivitiesViewController } from "./dashboard/activities-view.js";
import { createTeacherToolsViewController } from "./dashboard/teacher-tools-view.js";
import {
  applyContextualHelpPreference,
  getContextualHelpEnabled,
  initContextualHelpSystem,
  setContextualHelpEnabled
} from "../../shared/help-popover.js";

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
const btnNavActivities = document.getElementById("btnNavActivities");
const btnNavBanks = document.getElementById("btnNavBanks");
const btnNavTeacherTools = document.getElementById("btnNavTeacherTools");
const btnStudentListView = document.getElementById("btnStudentListView");
const btnStudentTileView = document.getElementById("btnStudentTileView");
const navHelpButtons = Array.from(document.querySelectorAll("[data-help-icon]"));
const dashboardHeader = document.querySelector(".dashboard-header");
const dashboardShell = document.querySelector(".dashboard-shell");
const dashboardLayout = document.querySelector(".dashboard-layout");
const dashboardContentFrame = document.querySelector(".dashboard-content-frame");
const dashboardWorkArea = document.getElementById("workArea");

const studentsList = document.getElementById("studentsList");
const configsList = document.getElementById("configsList");
const configHeader = document.getElementById("configHeader");
const classView = document.getElementById("classView");
const activitiesView = document.getElementById("activitiesView");
const banksView = document.getElementById("banksView");
const teacherToolsView = document.getElementById("teacherToolsView");
const teacherToolsHost = document.getElementById("teacherToolsHost");
const editorView = document.getElementById("editorView");

const btnAddStudent = document.getElementById("btnAddStudent");
const bankExplorerHeader = document.getElementById("bankExplorerHeader");
const bankEditorHeader = document.getElementById("bankEditorHeader");
const bankBreadcrumb = document.getElementById("bankBreadcrumb");
const banksList = document.getElementById("banksList");
const bankEditorHost = document.getElementById("bankEditorHost");
const bankEditorHeaderTitle = document.getElementById("bankEditorHeaderTitle");
const btnCreateBank = document.getElementById("btnCreateBank");
const btnCreateBankFolder = document.getElementById("btnCreateBankFolder");
const btnBackBankExplorer = document.getElementById("btnBackBankExplorer");
const btnDeleteBank = document.getElementById("btnDeleteBank");
const btnSaveBank = document.getElementById("btnSaveBank");
const bankImportModal = document.getElementById("bankImportModal");
const bankImportInput = document.getElementById("bankImportInput");
const bankImportMessage = document.getElementById("bankImportMessage");
const bankImportPreview = document.getElementById("bankImportPreview");
const btnBankImportCancel = document.getElementById("btnBankImportCancel");
const btnBankImportConfirm = document.getElementById("btnBankImportConfirm");
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

const deleteActivityModal = document.getElementById("deleteActivityModal");
const deleteActivityModalTitle = deleteActivityModal?.querySelector(".modal-title");
const deleteActivityText = document.getElementById("deleteActivityText");
const deleteActivityMessage = document.getElementById("deleteActivityMessage");
const btnDeleteActivityCancel = document.getElementById("btnDeleteActivityCancel");
const btnDeleteActivityConfirm = document.getElementById("btnDeleteActivityConfirm");

const leaveEditorModal = document.getElementById("leaveEditorModal");
const leaveEditorModalText = document.getElementById("leaveEditorModalText");
const btnLeaveEditorCancel = document.getElementById("btnLeaveEditorCancel");
const btnLeaveEditorConfirm = document.getElementById("btnLeaveEditorConfirm");

/* =========================
   STATE
   ========================= */

let currentUser = null;
let currentTeacherSpace = null;
let currentStudents = [];
let currentStudent = null;
let rightPanelMode = "activities"; // conservé pour la logique activités
let currentDashboardSection = "activities"; // "activities" | "class" | "banks" | "teacher-tools"
let currentActivitiesViewMode = "list"; // "list" | "editor"
let currentActivityModeFilter = "all";
let showDashboardHelpIcons = getContextualHelpEnabled();
let studentViewMode = "tiles"; // "list" | "tiles"
let activityListScrollTop = 0;
let needsActivitiesRefreshOnReturn = false;
let currentEditorRoute = null;
let activeConfigEditor = null;
let hasMountedClassView = false;
let hasMountedActivitiesView = false;
let hasMountedBanksView = false;
let hasMountedTeacherToolsView = false;
let mountedClassTeacherSpaceId = "";
let mountedActivitiesTeacherSpaceId = "";
let mountedBanksTeacherSpaceId = "";
let mountedTeacherToolsTeacherSpaceId = "";

const studentNotesDrafts = new Map();
let cachedActivities = null;
let cachedActivityFolders = null;
const collapsedActivityFolderIds = new Set();
const knownActivityFolderIds = new Set();
const MAX_ACTIVITY_FOLDER_DEPTH = 3;
let dashboardShareManager = null;
let editorController = null;
let activitiesViewController = null;
let banksViewController = null;
let teacherToolsViewController = null;
let studentController = null;
const helpPopoverController = initContextualHelpSystem({ root: document });

const headerPopupController = createHeaderPopupController({
  helpMenuPopup,
  btnDashboardHelp,
  userMenuPopup,
  btnUserMenu,
  onBeforeOpenHelp: () => {
    dashboardShareManager?.close();
    helpPopoverController.close();
  },
  onBeforeOpenUser: () => {
    dashboardShareManager?.close();
    helpPopoverController.close();
  }
});
dashboardShareManager = createDashboardShareManager({
  normalizeAccessCode,
  normalizeActivityMode,
  DEFAULT_ACTIVITY_MODE,
  isActivityShareable,
  copyActivityShareLink,
  openActivityShareLink,
  downloadActivityShareQrCode,
  ACTIVITY_SHARE_MESSAGES,
  getCurrentTeacherSpace: () => currentTeacherSpace,
  getCachedActivities: () => cachedActivities,
  onBeforeOpen: () => headerPopupController.closeAll()
});
const activityOverlayManager = createActivityOverlayManager({
  DEFAULT_ACTIVITY_MODE,
  escapeAttr,
  escapeHtml,
  normalizeActivityMode,
  getActivityModeLabel,
  createActivityFolderForSpace,
  updateActivityFolder,
  deleteActivityFolder,
  deleteMyActivity,
  saveActivityConfig,
  buildActivityTreeState: (...args) => activitiesViewController?.buildActivityTreeState(...args),
  sortFoldersByDisplay: sortDashboardFoldersByDisplay,
  showDashboardShareToast,
  renderActivitiesForSpace: (...args) => activitiesViewController?.renderActivitiesForSpace(...args),
  renderRightPanel: (...args) => activitiesViewController?.renderRightPanel(...args),
  getCurrentTeacherSpace: () => currentTeacherSpace,
  getCachedActivities: () => cachedActivities,
  setCachedActivities: (next) => { cachedActivities = next; },
  getCachedActivityFolders: () => cachedActivityFolders,
  setCachedActivityFolders: (next) => { cachedActivityFolders = next; },
  getKnownActivityFolderIds: () => knownActivityFolderIds,
  getCollapsedActivityFolderIds: () => collapsedActivityFolderIds,
  getActivityById,
  deleteActivityModal,
  deleteActivityModalTitle,
  deleteActivityText,
  deleteActivityMessage
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
  renderDashboardShellState: (...args) => renderDashboardShellState(...args),
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
  setCachedActivities: (next) => { cachedActivities = next; },
  setCachedActivityFolders: (next) => { cachedActivityFolders = next; },
  getCollapsedActivityFolderIds: () => collapsedActivityFolderIds,
  getKnownActivityFolderIds: () => knownActivityFolderIds,
  studentNotesDrafts
});
const activityDragController = createActivityDragController({
  configsList,
  getCurrentTeacherSpace: () => currentTeacherSpace,
  getCachedActivities: () => cachedActivities,
  setCachedActivities: (next) => { cachedActivities = next; },
  getCachedActivityFolders: () => cachedActivityFolders,
  setCachedActivityFolders: (next) => { cachedActivityFolders = next; },
  updateActivityFolder,
  updateActivityDashboardMeta,
  renderActivitiesForSpace: (...args) => activitiesViewController?.renderActivitiesForSpace(...args),
  maxFolderDepth: MAX_ACTIVITY_FOLDER_DEPTH
});
const {
  closeDeleteActivityModal,
  openCreateFolderOverlay,
  openDeleteActivityModal,
  openDeleteFolderOverlay,
  openRenameActivityOverlay,
  openRenameFolderOverlay,
  submitDeleteActivity
} = activityOverlayManager;
activitiesViewController = createActivitiesViewController({
  configHeader,
  configsList,
  closeDashboardSharePopup,
  getCurrentTeacherSpace: () => currentTeacherSpace,
  getCachedActivities: () => cachedActivities,
  setCachedActivities: (next) => { cachedActivities = next; },
  getCachedActivityFolders: () => cachedActivityFolders,
  setCachedActivityFolders: (next) => { cachedActivityFolders = next; },
  getCollapsedActivityFolderIds: () => collapsedActivityFolderIds,
  getKnownActivityFolderIds: () => knownActivityFolderIds,
  getCurrentActivityModeFilter: () => currentActivityModeFilter,
  setCurrentActivityModeFilter: (next) => { currentActivityModeFilter = next; },
  getActivityById,
  getMyActivitiesForSpace,
  getMyActivityFoldersForSpace,
  saveActivityConfig,
  updateActivityDashboardMeta,
  setHighlightedActivityForTeacherSpace,
  openRenameFolderOverlay,
  openRenameActivityOverlay,
  openDeleteFolderOverlay,
  openDeleteActivityModal,
  toggleDashboardSharePopup,
  openEmbeddedConfigEditor: (...args) => openEmbeddedConfigEditor(...args),
  showDashboardShareToast,
  openCreateFolderOverlay,
  getNextActivityOrderForFolder,
  buildDuplicateActivityName,
  buildClonedActivityConfigJson,
  handleActivityDragStart: (...args) => activityDragController.handleActivityDragStart(...args),
  handleActivityDragEnd: (...args) => activityDragController.handleActivityDragEnd(...args)
});
banksViewController = createQuestionBanksViewController({
  banksView,
  bankExplorerHeader,
  bankEditorHeader,
  bankBreadcrumb,
  banksList,
  bankEditorHost,
  bankEditorHeaderTitle,
  btnCreateBank,
  btnCreateBankFolder,
  btnBackBankExplorer,
  btnDeleteBank,
  btnSaveBank,
  createQuestionBankFolderForSpace,
  updateQuestionBankFolder,
  deleteQuestionBankFolder,
  listQuestionBankFoldersForSpace,
  importModal: bankImportModal,
  importInput: bankImportInput,
  importMessage: bankImportMessage,
  importPreview: bankImportPreview,
  btnImportCancel: btnBankImportCancel,
  btnImportConfirm: btnBankImportConfirm,
  getCurrentTeacherSpace: () => currentTeacherSpace,
  showToast: showDashboardShareToast
});

teacherToolsViewController = createTeacherToolsViewController({
  view: teacherToolsView,
  host: teacherToolsHost,
  getCurrentTeacherSpace: () => currentTeacherSpace,
  getCurrentStudents: () => currentStudents,
  showToast: showDashboardShareToast
});

editorController = createEditorController({
  editorView,
  leaveEditorModal,
  leaveEditorModalText,
  btnLeaveEditorCancel,
  getCurrentTeacherSpace: () => currentTeacherSpace,
  getCurrentEditorRoute: () => currentEditorRoute,
  setCurrentEditorRoute: (next) => { currentEditorRoute = next; },
  getActiveConfigEditor: () => activeConfigEditor,
  setActiveConfigEditor: (next) => { activeConfigEditor = next; },
  getNeedsActivitiesRefreshOnReturn: () => needsActivitiesRefreshOnReturn,
  setNeedsActivitiesRefreshOnReturn: (next) => { needsActivitiesRefreshOnReturn = next; },
  getCurrentDashboardSection: () => currentDashboardSection,
  setCurrentDashboardSection: (next) => { currentDashboardSection = next; },
  getCurrentActivitiesViewMode: () => currentActivitiesViewMode,
  setCurrentActivitiesViewMode: (next) => { currentActivitiesViewMode = next; },
  setCurrentActivityModeFilter: (next) => { currentActivityModeFilter = next; },
  renderDashboardShellState: (...args) => renderDashboardShellState(...args),
  renderActivitiesRightPanel: (...args) => activitiesViewController?.renderRightPanel(...args),
  renderStudentsColumn: (...args) => studentController?.renderStudentsColumn(...args),
  rememberActivitiesScrollPosition,
  restoreActivitiesScrollPosition,
  syncDashboardUrl
});
const {
  renderActivitiesForSpace
} = activitiesViewController;

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
  dashboardShareManager?.close();
}

function showDashboardShareToast(message, { isError = false, duration = 2400 } = {}){
  dashboardShareManager?.showToast(message, { isError, duration });
}

function isDashboardSharePopupOpen(){
  return dashboardShareManager?.isOpen() === true;
}

function closeDashboardSharePopup(){
  dashboardShareManager?.close();
}

function toggleDashboardSharePopup(button){
  dashboardShareManager?.toggle(button);
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
  if (!configsList || currentActivitiesViewMode !== "list") return;
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

async function ensureActivitiesViewMounted({ forceRefresh = false } = {}){
  const teacherSpaceId = String(currentTeacherSpace?.id || "");
  if (!forceRefresh && hasMountedActivitiesView && mountedActivitiesTeacherSpaceId === teacherSpaceId) return;
  await activitiesViewController?.renderRightPanel({ forceRefresh });
  hasMountedActivitiesView = true;
  mountedActivitiesTeacherSpaceId = teacherSpaceId;
}

async function ensureBanksViewMounted({ forceRefresh = false } = {}){
  const teacherSpaceId = String(currentTeacherSpace?.id || "");
  if (!forceRefresh && hasMountedBanksView && mountedBanksTeacherSpaceId === teacherSpaceId) return;
  await banksViewController?.refresh({ forceRefresh });
  hasMountedBanksView = true;
  mountedBanksTeacherSpaceId = teacherSpaceId;
}

async function ensureTeacherToolsViewMounted({ forceRefresh = false } = {}){
  const teacherSpaceId = String(currentTeacherSpace?.id || "");
  if (!forceRefresh && hasMountedTeacherToolsView && mountedTeacherToolsTeacherSpaceId === teacherSpaceId) {
    teacherToolsViewController?.refresh?.();
    return;
  }
  teacherToolsViewController?.render?.();
  hasMountedTeacherToolsView = true;
  mountedTeacherToolsTeacherSpaceId = teacherSpaceId;
}

function getActivityById(activityId){
  const safeActivityId = String(activityId || "").trim();
  if (!safeActivityId) return null;
  return (cachedActivities || []).find((activity) => String(activity?.id || "") === safeActivityId) || null;
}

function getNextActivityOrderForFolder(folderId, activities = cachedActivities, folders = cachedActivityFolders){
  const safeFolderId = normalizeTreeId(folderId);
  const siblingFolders = (Array.isArray(folders) ? folders : []).filter(
    (folder) => normalizeTreeId(folder?.parent_id) === safeFolderId
  );
  const siblingActivities = (Array.isArray(activities) ? activities : []).filter(
    (activity) => normalizeTreeId(activity?.folder_id) === safeFolderId
  );

  return [...siblingFolders, ...siblingActivities]
    .reduce((maxOrder, item) => Math.max(maxOrder, Number(item?.display_order) || 0), -1) + 1;
}

function buildDuplicateActivityName(baseName, activities = cachedActivities){
  const safeBaseName = String(baseName || "").trim() || "Activité";
  const existingNames = new Set(
    (Array.isArray(activities) ? activities : [])
      .map((activity) => normalizeConfigName(activity?.config_name))
      .filter(Boolean)
  );

  let suffixIndex = 0;
  while (suffixIndex < 999) {
    const candidate = suffixIndex === 0
      ? `${safeBaseName} (copie)`
      : `${safeBaseName} (copie ${suffixIndex + 1})`;
    if (!existingNames.has(normalizeConfigName(candidate))) {
      return candidate;
    }
    suffixIndex += 1;
  }

  return `${safeBaseName} (copie ${Date.now()})`;
}

function buildClonedActivityConfigJson(sourceActivity, {
  targetMode = DEFAULT_ACTIVITY_MODE,
  nextDisplayOrder = 0,
  preserveVisibilityFlag = false,
  preserveHighlightFlag = false
} = {}){
  const safeMode = normalizeActivityMode(targetMode, DEFAULT_ACTIVITY_MODE);
  const sourceConfigJson = sourceActivity?.config_json && typeof sourceActivity.config_json === "object"
    ? (typeof structuredClone === "function"
      ? structuredClone(sourceActivity.config_json)
      : JSON.parse(JSON.stringify(sourceActivity.config_json)))
    : {};
  const safeSourceConfigJson = sanitizeActivityConfigJson(sourceConfigJson);

  if (!Array.isArray(safeSourceConfigJson.sequence)) {
    throw new Error("La configuration source est invalide : séquence manquante.");
  }

  const sourceDashboard = safeSourceConfigJson.dashboard && typeof safeSourceConfigJson.dashboard === "object"
    ? safeSourceConfigJson.dashboard
    : {};

  return {
    ...safeSourceConfigJson,
    sequence: normalizeActivitySequence(safeSourceConfigJson.sequence, {
      fallbackGlobals: safeSourceConfigJson.globals
    }),
    activity_mode: safeMode,
    dashboard: {
      ...sourceDashboard,
      display_order: Math.max(0, Math.trunc(Number(nextDisplayOrder) || 0)),
      folder_id: normalizeTreeId(sourceActivity?.folder_id),
      is_visible: preserveVisibilityFlag
        ? sourceActivity?.is_visible !== false
        : isStudentFacingActivityMode(safeMode),
      is_highlighted: preserveHighlightFlag
        ? sourceActivity?.is_highlighted === true
        : false
    }
  };
}

function buildDashboardHistoryState(){
  return {
    app: "teacher-dashboard",
    accessCode: String(currentTeacherSpace?.access_code || "").trim(),
    configName: String(currentEditorRoute?.configName || "").trim(),
    projected: currentEditorRoute?.projected === true
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

    if (currentEditorRoute?.configName) {
      url.searchParams.set("configName", currentEditorRoute.configName);
    } else {
      url.searchParams.delete("configName");
    }

    if (currentEditorRoute?.projected && currentEditorRoute?.configName) {
      url.searchParams.set("projected", "1");
    } else {
      url.searchParams.delete("projected");
    }

    const historyMethod = mode === "push" ? "pushState" : "replaceState";
    history[historyMethod](buildDashboardHistoryState(), "", url.toString());
  } catch {}
}

function renderDashboardShellState(){
  syncDashboardViewportSizing();

  if (currentDashboardSection !== "activities" || currentActivitiesViewMode !== "list") {
    closeDashboardSharePopup();
  }

  btnNavActivities?.classList.toggle("is-active", currentDashboardSection === "activities");
  btnNavClass?.classList.toggle("is-active", currentDashboardSection === "class");
  btnNavBanks?.classList.toggle("is-active", currentDashboardSection === "banks");
  btnNavTeacherTools?.classList.toggle("is-active", currentDashboardSection === "teacher-tools");
  activitiesView?.classList.toggle("hidden", currentDashboardSection !== "activities" || currentActivitiesViewMode !== "list");
  editorView?.classList.toggle("hidden", currentDashboardSection !== "activities" || currentActivitiesViewMode !== "editor");
  classView?.classList.toggle("hidden", currentDashboardSection !== "class");
  banksView?.classList.toggle("hidden", currentDashboardSection !== "banks");
  teacherToolsView?.classList.toggle("hidden", currentDashboardSection !== "teacher-tools");

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

function resolveLeaveEditorModal(confirmed){
  return editorController?.resolveLeaveEditorModal(confirmed);
}

async function maybeOpenInitialEditorRoute(){
  return editorController?.maybeOpenInitialEditorRoute();
}

async function applyDashboardRouteFromUrl({ allowConfirm = true } = {}){
  return editorController?.applyDashboardRouteFromUrl({ allowConfirm });
}

async function openEmbeddedConfigEditor({
  accessCode,
  configName = "",
  projected = false,
  activityMode = DEFAULT_ACTIVITY_MODE,
  folderId = "",
  syncActivityModeContext = false,
  historyMode = "push"
} = {}){
  return editorController?.openEmbeddedConfigEditor({
    accessCode,
    configName,
    projected,
    activityMode,
    folderId,
    syncActivityModeContext,
    historyMode
  });
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
btnNavActivities?.addEventListener("click", async () => {
  currentDashboardSection = "activities";
  if (currentActivitiesViewMode === "editor" && !activeConfigEditor) {
    currentActivitiesViewMode = "list";
  }
  renderDashboardShellState();
  if (currentActivitiesViewMode === "list") {
    await ensureActivitiesViewMounted();
    restoreActivitiesScrollPosition();
  }
});
btnNavClass?.addEventListener("click", async () => {
  currentDashboardSection = "class";
  renderDashboardShellState();
  await ensureClassViewMounted();
});
btnNavBanks?.addEventListener("click", async () => {
  currentDashboardSection = "banks";
  renderDashboardShellState();
  await ensureBanksViewMounted();
});
btnNavTeacherTools?.addEventListener("click", async () => {
  currentDashboardSection = "teacher-tools";
  renderDashboardShellState();
  await ensureTeacherToolsViewMounted();
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
  alert("Placeholder : tutoriel à brancher plus tard.");
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
  dashboardShareManager?.handleDocumentPointerDown(event);
});
document.addEventListener("keydown", (event) => {
  dashboardShareManager?.handleDocumentKeyDown(event);
});
window.addEventListener("popstate", () => {
  void applyDashboardRouteFromUrl({ allowConfirm: true });
});
window.addEventListener("resize", () => {
  dashboardShareManager?.handleResize();
  syncDashboardViewportSizing();
});
window.addEventListener("beforeunload", (event) => {
  const hasEditorChanges = activeConfigEditor?.hasPendingChanges?.() === true;
  const hasBankChanges = banksViewController?.hasPendingChanges?.() === true;
  if (!hasEditorChanges && !hasBankChanges) return;

  event.preventDefault();
  event.returnValue = "";
});
window.visualViewport?.addEventListener?.("resize", syncDashboardViewportSizing);
configsList?.addEventListener("scroll", () => {
  dashboardShareManager?.close();
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

btnDeleteActivityCancel?.addEventListener("click", closeDeleteActivityModal);
btnDeleteActivityConfirm?.addEventListener("click", submitDeleteActivity);

deleteActivityModal?.addEventListener("click", (e) => {
  if (e.target === deleteActivityModal){
    closeDeleteActivityModal();
  }
});

btnLeaveEditorCancel?.addEventListener("click", () => {
  resolveLeaveEditorModal(false);
});

btnLeaveEditorConfirm?.addEventListener("click", () => {
  resolveLeaveEditorModal(true);
});

leaveEditorModal?.addEventListener("click", (event) => {
  if (event.target === leaveEditorModal) {
    resolveLeaveEditorModal(false);
  }
});

leaveEditorModal?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    resolveLeaveEditorModal(false);
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    resolveLeaveEditorModal(true);
  }
});

document.addEventListener("pointerup", () => studentController?.clearArmedHandle?.());
document.addEventListener("mouseup", () => studentController?.clearArmedHandle?.());
document.addEventListener("touchend", () => studentController?.clearArmedHandle?.(), { passive: true });
document.addEventListener("pointerup", () => activityDragController.clearArmedHandle());
document.addEventListener("mouseup", () => activityDragController.clearArmedHandle());
document.addEventListener("touchend", () => activityDragController.clearArmedHandle(), { passive: true });

studentsList?.addEventListener("dragover", studentController.handleStudentDragOver);
studentsList?.addEventListener("drop", studentController.handleStudentDrop);
configsList?.addEventListener("dragover", activityDragController.handleActivityDragOver);
configsList?.addEventListener("drop", activityDragController.handleActivityDrop);
configsList?.addEventListener("dragleave", activityDragController.handleActivityDragLeave);

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

    teacherEmail.textContent = currentUser.email || "utilisateur inconnu";

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
    await maybeOpenInitialEditorRoute();
    syncDashboardUrl();
  } catch (err) {
    teacherEmail.textContent = err?.message || "Impossible de charger le compte.";
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
    alert("Erreur lors de la déconnexion.");
  }
}
