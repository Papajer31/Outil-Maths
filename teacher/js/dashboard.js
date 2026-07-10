import {
  getCurrentUser,
  signOutUser,
  normalizeAccessCode,
  getMyTeacherSpace,
  createOrGetMyTeacherSpace,
  updateMyTeacherSpace,
  markTeacherSpaceAsOpened,
  createQuestionBankFolderForSpace,
  updateQuestionBankFolder,
  deleteQuestionBankFolder,
  listQuestionBankFoldersForSpace,
  listStudentsForTeacherSpace,
  createStudentForTeacherSpace,
  updateStudent,
  deleteStudent,
  saveStudentOrderForTeacherSpace,
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
  deleteMission,
  isCurrentUserSuperAdmin,
  listCatalogActivitiesForAdmin,
  saveCatalogActivityAsAdmin,
  deleteCatalogActivityAsAdmin,
  getCatalogActivityUsageAsAdmin,
  listDefaultVocabularyWordsAsAdmin,
  saveDefaultVocabularyWordAsAdmin,
  upsertDefaultVocabularyWordsAsAdmin,
  deleteDefaultVocabularyWordAsAdmin,
  listEncodingResourcesAsAdmin,
  saveImageAssetAsAdmin,
  deleteImageAssetAsAdmin,
  savePhonologyWordAsAdmin,
  deletePhonologyWordAsAdmin,
  listSystemQuestionBanksAsAdmin,
  createSystemQuestionBankAsAdmin,
  updateQuestionBank,
  deleteQuestionBank,
  listQuestionBankItems,
  replaceQuestionBankItems
} from "./teacher-api.js";
import { createHeaderPopupController } from "./dashboard/header-popups.js";
import { createStudentDashboardController } from "./dashboard/student-controller.js";
import { createQuestionBanksViewController } from "./dashboard/question-banks-view.js";
import { createActivitiesViewController } from "./dashboard/activities-view.js";
import { createMissionsViewController } from "./dashboard/missions-view.js";
import { createTeacherToolsViewController } from "./dashboard/teacher-tools-view.js";
import { createSuperAdminViewController } from "./dashboard/superadmin-view.js";
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
const btnNavActivities = document.getElementById("btnNavActivities");
const btnNavMissions = document.getElementById("btnNavMissions");
const btnNavBanks = document.getElementById("btnNavBanks");
const btnNavTeacherTools = document.getElementById("btnNavTeacherTools");
const btnNavSuperAdmin = document.getElementById("btnNavSuperAdmin");
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
const activitiesView = document.getElementById("activitiesView");
const missionsView = document.getElementById("missionsView");
const missionsHeader = document.getElementById("missionsHeader");
const missionsList = document.getElementById("missionsList");
const banksView = document.getElementById("banksView");
const teacherToolsView = document.getElementById("teacherToolsView");
const teacherToolsHost = document.getElementById("teacherToolsHost");
const superAdminView = document.getElementById("superAdminView");
const superAdminHeader = document.getElementById("superAdminHeader");
const superAdminList = document.getElementById("superAdminList");

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

/* =========================
   STATE
   ========================= */

let currentUser = null;
let currentTeacherSpace = null;
let currentStudents = [];
let currentStudent = null;
let currentDashboardSection = "activities"; // "activities" | "missions" | "class" | "banks" | "teacher-tools" | "super-admin"
let showDashboardHelpIcons = getContextualHelpEnabled();
let studentViewMode = "tiles"; // "list" | "tiles"
let activityListScrollTop = 0;
let hasMountedClassView = false;
let hasMountedActivitiesView = false;
let hasMountedMissionsView = false;
let hasMountedBanksView = false;
let hasMountedTeacherToolsView = false;
let hasMountedSuperAdminView = false;
let currentUserIsSuperAdmin = false;
let mountedClassTeacherSpaceId = "";
let mountedActivitiesTeacherSpaceId = "";
let mountedMissionsTeacherSpaceId = "";
let mountedBanksTeacherSpaceId = "";
let mountedTeacherToolsTeacherSpaceId = "";
let mountedSuperAdminTeacherSpaceId = "";
let dashboardToast = null;
let dashboardToastTimer = null;

const studentNotesDrafts = new Map();
const legacyActivityQuarantineSet = new Set();
let activitiesViewController = null;
let missionsViewController = null;
let banksViewController = null;
let teacherToolsViewController = null;
let superAdminViewController = null;
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
  setCachedActivities: () => {},
  setCachedActivityFolders: () => {},
  getCollapsedActivityFolderIds: () => legacyActivityQuarantineSet,
  getKnownActivityFolderIds: () => legacyActivityQuarantineSet,
  studentNotesDrafts,
  showToast: showDashboardShareToast
});

activitiesViewController = createActivitiesViewController({
  configHeader,
  configsList,
  getCurrentTeacherSpace: () => currentTeacherSpace,
  listCatalogActivitiesForTeacherSpace,
  setCatalogActivityVisibility,
  showToast: showDashboardShareToast
});

missionsViewController = createMissionsViewController({
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
  deleteMission,
  listCatalogActivitiesForTeacherSpace
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

superAdminViewController = createSuperAdminViewController({
  view: superAdminView,
  header: superAdminHeader,
  list: superAdminList,
  getIsSuperAdmin: () => currentUserIsSuperAdmin,
  getCurrentTeacherSpace: () => currentTeacherSpace,
  listCatalogActivitiesForAdmin,
  saveCatalogActivityAsAdmin,
  deleteCatalogActivityAsAdmin,
  getCatalogActivityUsageAsAdmin,
  listDefaultVocabularyWordsAsAdmin,
  saveDefaultVocabularyWordAsAdmin,
  upsertDefaultVocabularyWordsAsAdmin,
  deleteDefaultVocabularyWordAsAdmin,
  listEncodingResourcesAsAdmin,
  saveImageAssetAsAdmin,
  deleteImageAssetAsAdmin,
  savePhonologyWordAsAdmin,
  deletePhonologyWordAsAdmin,
  listSystemQuestionBanksAsAdmin,
  createSystemQuestionBankAsAdmin,
  updateQuestionBank,
  deleteQuestionBank,
  listQuestionBankItems,
  replaceQuestionBankItems,
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

async function ensureSuperAdminViewMounted({ forceRefresh = false } = {}){
  const teacherSpaceId = String(currentTeacherSpace?.id || "");
  if (!forceRefresh && hasMountedSuperAdminView && mountedSuperAdminTeacherSpaceId === teacherSpaceId) return;
  await superAdminViewController?.refresh?.({ forceRefresh: true });
  hasMountedSuperAdminView = true;
  mountedSuperAdminTeacherSpaceId = teacherSpaceId;
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

  btnNavActivities?.classList.toggle("is-active", currentDashboardSection === "activities");
  btnNavMissions?.classList.toggle("is-active", currentDashboardSection === "missions");
  btnNavClass?.classList.toggle("is-active", currentDashboardSection === "class");
  btnNavBanks?.classList.toggle("is-active", currentDashboardSection === "banks");
  btnNavTeacherTools?.classList.toggle("is-active", currentDashboardSection === "teacher-tools");
  btnNavSuperAdmin?.classList.toggle("is-active", currentDashboardSection === "super-admin");
  btnNavSuperAdmin?.classList.toggle("hidden", !currentUserIsSuperAdmin);

  activitiesView?.classList.toggle("hidden", currentDashboardSection !== "activities");
  missionsView?.classList.toggle("hidden", currentDashboardSection !== "missions");
  classView?.classList.toggle("hidden", currentDashboardSection !== "class");
  banksView?.classList.toggle("hidden", currentDashboardSection !== "banks");
  teacherToolsView?.classList.toggle("hidden", currentDashboardSection !== "teacher-tools");
  superAdminView?.classList.toggle("hidden", currentDashboardSection !== "super-admin");

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
btnNavSuperAdmin?.addEventListener("click", async () => {
  if (!currentUserIsSuperAdmin) return;
  currentDashboardSection = "super-admin";
  renderDashboardShellState();
  await ensureSuperAdminViewMounted();
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
window.addEventListener("beforeunload", (event) => {
  const hasBankChanges = banksViewController?.hasPendingChanges?.() === true;
  if (!hasBankChanges) return;

  event.preventDefault();
  event.returnValue = "";
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
