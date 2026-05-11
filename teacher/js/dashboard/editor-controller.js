import { mountConfigEditor } from "../config-editor.js";
import { normalizeAccessCode } from "../../../shared/api-common.js";
import {
  DEFAULT_ACTIVITY_MODE,
  normalizeActivityMode
} from "../../../shared/activity-modes.js";

export function createEditorController({
  editorView,
  leaveEditorModal,
  leaveEditorModalText,
  btnLeaveEditorCancel,
  getCurrentTeacherSpace,
  getCurrentEditorRoute,
  setCurrentEditorRoute,
  getActiveConfigEditor,
  setActiveConfigEditor,
  getNeedsActivitiesRefreshOnReturn,
  setNeedsActivitiesRefreshOnReturn,
  getCurrentDashboardSection,
  setCurrentDashboardSection,
  getCurrentActivitiesViewMode,
  setCurrentActivitiesViewMode,
  setCurrentActivityModeFilter,
  renderDashboardShellState,
  renderActivitiesRightPanel,
  renderStudentsColumn,
  rememberActivitiesScrollPosition,
  restoreActivitiesScrollPosition,
  syncDashboardUrl
} = {}) {
  let isApplyingHistoryRoute = false;
  let leaveEditorModalResolver = null;
  let leaveEditorModalPromise = null;

  function isEditorOpen(){
    return getCurrentActivitiesViewMode?.() === "editor"
      && !!getActiveConfigEditor?.();
  }

  function getInitialDashboardEditorRoute(){
    try {
      const url = new URL(window.location.href);
      return {
        accessCode: normalizeAccessCode(url.searchParams.get("accessCode")),
        configName: String(url.searchParams.get("configName") || "").trim(),
        projected: url.searchParams.get("projected") === "1"
      };
    } catch {
      return { accessCode: "", configName: "", projected: false };
    }
  }

  function resolveLeaveEditorModal(confirmed){
    if (!leaveEditorModalResolver) return;

    const resolver = leaveEditorModalResolver;
    leaveEditorModalResolver = null;
    leaveEditorModalPromise = null;
    leaveEditorModal?.classList.add("hidden");
    leaveEditorModal?.setAttribute("aria-hidden", "true");
    resolver(confirmed === true);
  }

  function openLeaveEditorModal(message){
    if (!leaveEditorModal) {
      return Promise.resolve(window.confirm(message));
    }

    if (leaveEditorModalPromise) {
      return leaveEditorModalPromise;
    }

    leaveEditorModalText.textContent = String(
      message || "Des modifications non enregistrées existent. Quitter l’éditeur ?"
    );
    leaveEditorModal.classList.remove("hidden");
    leaveEditorModal.setAttribute("aria-hidden", "false");

    window.setTimeout(() => {
      btnLeaveEditorCancel?.focus();
    }, 0);

    leaveEditorModalPromise = new Promise((resolve) => {
      leaveEditorModalResolver = resolve;
    });

    return leaveEditorModalPromise;
  }

  async function confirmLeavingEditor(){
    if (!getActiveConfigEditor?.()?.hasPendingChanges?.()) {
      return true;
    }

    const message = getActiveConfigEditor?.()?.getLeaveWarningMessage?.()
      || "Des modifications non enregistrées existent. Quitter l’éditeur ?";

    return openLeaveEditorModal(message);
  }

  async function closeEmbeddedConfigEditor({
    nextSection = "activities",
    forceRefresh = true,
    historyMode = "replace"
  } = {}){
    getActiveConfigEditor?.()?.destroy?.();
    setActiveConfigEditor?.(null);
    setCurrentEditorRoute?.(null);
    setCurrentActivitiesViewMode?.("list");
    setCurrentDashboardSection?.(nextSection);
    renderDashboardShellState?.();

    if (forceRefresh || getNeedsActivitiesRefreshOnReturn?.()) {
      setNeedsActivitiesRefreshOnReturn?.(false);
      await renderActivitiesRightPanel?.({ forceRefresh: true });
    }

    if (nextSection === "activities") {
      restoreActivitiesScrollPosition?.();
    }

    if (historyMode !== "silent") {
      syncDashboardUrl?.({ mode: historyMode });
    }
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
    if (!editorView) return false;

    const safeAccessCode = normalizeAccessCode(accessCode || getCurrentTeacherSpace?.()?.access_code);
    const safeConfigName = String(configName || "").trim();
    if (!safeAccessCode) return false;

    const activeConfigEditor = getActiveConfigEditor?.();
    if (activeConfigEditor?.hasPendingChanges?.()) {
      const currentEditorRoute = getCurrentEditorRoute?.();
      const sameTarget = currentEditorRoute
        && currentEditorRoute.accessCode === safeAccessCode
        && currentEditorRoute.configName === safeConfigName
        && currentEditorRoute.projected === !!projected;

      if (!sameTarget && !await confirmLeavingEditor()) {
        return false;
      }
    }

    rememberActivitiesScrollPosition?.();
    activeConfigEditor?.destroy?.();
    const nextEditorRoute = {
      accessCode: safeAccessCode,
      configName: safeConfigName,
      projected: !!projected,
      activityMode: normalizeActivityMode(activityMode, DEFAULT_ACTIVITY_MODE),
      folderId: String(folderId || "").trim()
    };
    setCurrentEditorRoute?.(nextEditorRoute);
    setCurrentDashboardSection?.("activities");
    setCurrentActivitiesViewMode?.("editor");
    renderDashboardShellState?.();

    if (historyMode !== "silent") {
      syncDashboardUrl?.({ mode: historyMode });
    }

    setActiveConfigEditor?.(await mountConfigEditor({
      accessCode: safeAccessCode,
      configName: safeConfigName,
      projected: !!projected,
      activityMode,
      folderId,
      syncUrl: false,
      onBack: async () => {
        if (!await confirmLeavingEditor()) return;
        await closeEmbeddedConfigEditor({
          nextSection: "activities",
          forceRefresh: true,
          historyMode: "push"
        });
      },
      onAuthRequired: () => {
        window.location.href = "login.html";
      },
      onStateChange: (state) => {
        setCurrentEditorRoute?.({
          accessCode: state.accessCode || safeAccessCode,
          configName: String(state.configName || "").trim(),
          projected: state.projected === true,
          activityMode: normalizeActivityMode(state.activityMode, DEFAULT_ACTIVITY_MODE)
        });

        if (syncActivityModeContext) {
          setCurrentActivityModeFilter?.(normalizeActivityMode(state.activityMode, DEFAULT_ACTIVITY_MODE));
        }

        setNeedsActivitiesRefreshOnReturn?.(true);
        syncDashboardUrl?.();
      }
    }));

    return true;
  }

  async function maybeOpenInitialEditorRoute(){
    const route = getInitialDashboardEditorRoute();
    const teacherSpace = getCurrentTeacherSpace?.();
    if (!route.configName) return;
    if (!teacherSpace?.access_code) return;
    if (route.accessCode && route.accessCode !== teacherSpace.access_code) return;

    await openEmbeddedConfigEditor({
      accessCode: teacherSpace.access_code,
      configName: route.configName,
      projected: route.projected,
      historyMode: "silent",
      syncActivityModeContext: true
    });
  }

  async function applyDashboardRouteFromUrl({ allowConfirm = true } = {}){
    if (isApplyingHistoryRoute) return;

    const route = getInitialDashboardEditorRoute();
    const teacherSpace = getCurrentTeacherSpace?.();
    if (route.accessCode && teacherSpace?.access_code && route.accessCode !== teacherSpace.access_code) {
      return;
    }

    if (route.configName) {
      const currentEditorRoute = getCurrentEditorRoute?.();
      const sameEditorRoute = isEditorOpen()
        && currentEditorRoute
        && currentEditorRoute.accessCode === (route.accessCode || teacherSpace?.access_code || "")
        && currentEditorRoute.configName === route.configName
        && currentEditorRoute.projected === route.projected;

      if (sameEditorRoute) {
        return;
      }

      if (allowConfirm && isEditorOpen() && !await confirmLeavingEditor()) {
        syncDashboardUrl?.({ mode: "push" });
        return;
      }

      isApplyingHistoryRoute = true;
      try {
        await openEmbeddedConfigEditor({
          accessCode: route.accessCode || teacherSpace?.access_code,
          configName: route.configName,
          projected: route.projected,
          historyMode: "silent",
          syncActivityModeContext: true
        });
      } finally {
        isApplyingHistoryRoute = false;
      }
      return;
    }

    if (allowConfirm && isEditorOpen() && !await confirmLeavingEditor()) {
      syncDashboardUrl?.({ mode: "push" });
      return;
    }

    if (isEditorOpen()) {
      isApplyingHistoryRoute = true;
      try {
        await closeEmbeddedConfigEditor({
          nextSection: "activities",
          forceRefresh: true,
          historyMode: "silent"
        });
      } finally {
        isApplyingHistoryRoute = false;
      }
      return;
    }

    setCurrentDashboardSection?.("activities");
    setCurrentActivitiesViewMode?.("list");
    renderDashboardShellState?.();
    await renderActivitiesRightPanel?.({ forceRefresh: false });
    restoreActivitiesScrollPosition?.();
  }

  async function leaveEditorToSection(nextSection){
    if (!isEditorOpen()) {
      setCurrentDashboardSection?.(nextSection);
      if (nextSection === "activities") {
        setCurrentActivitiesViewMode?.("list");
      }
      renderDashboardShellState?.();
      if (nextSection === "activities") {
        await renderActivitiesRightPanel?.({ forceRefresh: false });
      } else if (nextSection === "class") {
        await renderStudentsColumn?.({ skipRefresh: true });
      }
      return true;
    }

    if (!await confirmLeavingEditor()) {
      return false;
    }

    await closeEmbeddedConfigEditor({
      nextSection,
      forceRefresh: true
    });

    if (nextSection === "class") {
      await renderStudentsColumn?.({ skipRefresh: true });
    }

    return true;
  }

  return {
    applyDashboardRouteFromUrl,
    leaveEditorToSection,
    maybeOpenInitialEditorRoute,
    openEmbeddedConfigEditor,
    resolveLeaveEditorModal,
    syncDashboardUrl
  };
}
