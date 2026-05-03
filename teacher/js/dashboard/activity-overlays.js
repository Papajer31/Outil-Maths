export function createActivityOverlayManager({
  DEFAULT_ACTIVITY_MODE,
  escapeAttr,
  escapeHtml,
  normalizeActivityMode,
  getActivityModeLabel,
  getOtherActivityModes,
  createActivityFolderForSpace,
  updateActivityFolder,
  deleteActivityFolder,
  deleteMyActivity,
  saveActivityConfig,
  getMyActivitiesForSpace,
  buildActivityTreeState,
  sortFoldersByDisplay,
  showDashboardShareToast,
  renderActivitiesForSpace,
  renderRightPanel,
  getCurrentTeacherSpace,
  getCachedActivities,
  setCachedActivities,
  getCachedActivityFolders,
  setCachedActivityFolders,
  getKnownActivityFolderIds,
  getCollapsedActivityFolderIds,
  getActivityById,
  getCurrentActivityModeFilter,
  setCurrentActivityModeFilter,
  getNextActivityOrderForFolder,
  buildVersionActivityName,
  buildClonedActivityConfigJson,
  evaluateActivityVersionCompatibility,
  deleteActivityModal,
  deleteActivityModalTitle,
  deleteActivityText,
  deleteActivityMessage
} = {}){
  let pendingActivity = null;

  function openDeleteActivityModal(activity){
    pendingActivity = activity;
    deleteActivityModalTitle.textContent = "Supprimer l’activité";
    deleteActivityMessage.textContent = "";
    deleteActivityMessage.classList.remove("is-error");
    deleteActivityText.textContent = `Supprimer l’activité "${activity.config_name}" ?`;
    deleteActivityModal?.classList.remove("hidden");
  }

  function closeDeleteActivityModal(){
    pendingActivity = null;
    deleteActivityModal?.classList.add("hidden");
  }

  async function submitDeleteActivity(){
    const currentTeacherSpace = getCurrentTeacherSpace?.();
    if (!pendingActivity?.id || !currentTeacherSpace?.id) return;

    deleteActivityMessage.textContent = "Suppression…";
    deleteActivityMessage.classList.remove("is-error");

    try {
      const deletedId = String(pendingActivity.id);
      const deletedName = pendingActivity.config_name || "";

      await deleteMyActivity(currentTeacherSpace.id, deletedName);

      setCachedActivities?.((getCachedActivities?.() || []).filter(
        (activity) => String(activity.id) !== deletedId
      ));

      closeDeleteActivityModal();
      await renderActivitiesForSpace?.();
    } catch (err){
      deleteActivityMessage.textContent = err?.message || "Suppression impossible.";
      deleteActivityMessage.classList.add("is-error");
    }
  }

  function openCreateVersionOverlay(activityId){
    const sourceActivity = getActivityById?.(activityId);
    const currentTeacherSpace = getCurrentTeacherSpace?.();
    if (!sourceActivity || !currentTeacherSpace?.access_code || !currentTeacherSpace?.id) return Promise.resolve();

    const sourceMode = normalizeActivityMode(sourceActivity.activity_mode, DEFAULT_ACTIVITY_MODE);
    const targetModes = getOtherActivityModes(sourceMode);
    const overlay = document.createElement("div");
    overlay.className = "modal";
    overlay.innerHTML = `
      <div class="modal-content">
        <div class="modal-title">Créer une version…</div>
        <div class="dashboard-message">
          Crée une nouvelle activité à partir de <strong>${escapeHtml(sourceActivity.config_name || "")}</strong>, sans modifier l’originale.
        </div>

        <div class="dashboard-mode-choice-grid">
          ${targetModes.map((mode) => `
            <button
              class="btn dashboard-mode-choice-btn"
              type="button"
              data-target-mode="${escapeAttr(mode)}"
            >
              ${escapeHtml(getActivityModeLabel(mode))}
            </button>
          `).join("")}
        </div>

        <div class="modal-actions">
          <div id="activityVersionMessage" class="modal-message"></div>
          <button class="btn" id="activityVersionCancel" type="button">Annuler</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const message = overlay.querySelector("#activityVersionMessage");
    const actionButtons = Array.from(overlay.querySelectorAll("[data-target-mode]"));

    function close(){
      overlay.remove();
    }

    function setBusy(isBusy){
      actionButtons.forEach((btn) => {
        btn.disabled = isBusy;
      });
    }

    async function handleCreateVersion(targetMode){
      const safeTargetMode = normalizeActivityMode(targetMode, DEFAULT_ACTIVITY_MODE);
      setBusy(true);
      message.textContent = "Vérification de la compatibilité…";
      message.classList.remove("is-error");

      try {
        const issues = await evaluateActivityVersionCompatibility?.(sourceActivity, safeTargetMode);
        if (issues?.length) {
          message.innerHTML = `
            <div class="dashboard-version-error-title">Version impossible en mode ${escapeHtml(getActivityModeLabel(safeTargetMode).toLowerCase())}.</div>
            <ul class="dashboard-version-error-list">
              ${issues.map((issue) => `
                <li><strong>${escapeHtml(issue.toolTitle || issue.toolId || "Outil")}</strong> : ${escapeHtml(issue.blockingMessage || "Incompatible.")}</li>
              `).join("")}
            </ul>
          `;
          message.classList.add("is-error");
          return;
        }

        const nextName = buildVersionActivityName?.(sourceActivity.config_name, safeTargetMode, getCachedActivities?.());
        const nextDisplayOrder = getNextActivityOrderForFolder?.(sourceActivity.folder_id);
        const clonedConfigJson = buildClonedActivityConfigJson?.(sourceActivity, {
          targetMode: safeTargetMode,
          nextDisplayOrder,
          preserveVisibilityFlag: false,
          preserveHighlightFlag: false
        });

        await saveActivityConfig?.({
          accessCode: currentTeacherSpace.access_code,
          moduleKey: sourceActivity.module_key,
          configName: nextName,
          configJson: clonedConfigJson
        });

        setCachedActivities?.(await getMyActivitiesForSpace?.(currentTeacherSpace.id));
        setCurrentActivityModeFilter?.(safeTargetMode);
        close();
        await renderRightPanel?.({ forceRefresh: false });
        showDashboardShareToast?.(`Version ${getActivityModeLabel(safeTargetMode).toLowerCase()} créée : ${nextName}`);
      } catch (err) {
        message.textContent = err?.message || "Impossible de créer la version.";
        message.classList.add("is-error");
      } finally {
        setBusy(false);
      }
    }

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        close();
      }
    });

    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    });

    actionButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        void handleCreateVersion(btn.dataset.targetMode || "");
      });
    });

    overlay.querySelector("#activityVersionCancel")?.addEventListener("click", close);
    return Promise.resolve();
  }

  function openCreateFolderOverlay(parentId = null){
    const currentTeacherSpace = getCurrentTeacherSpace?.();
    return openNameInputOverlay({
      title: "Créer un dossier",
      confirmLabel: "Créer",
      initialName: "",
      placeholder: "Nom du dossier",
      onConfirm: async (name) => {
        const created = await createActivityFolderForSpace?.(currentTeacherSpace.id, { name, parent_id: parentId });
        setCachedActivityFolders?.(sortFoldersByDisplay?.([...(getCachedActivityFolders?.() || []), created]));
        getKnownActivityFolderIds?.().add(String(created.id));
        getCollapsedActivityFolderIds?.().add(String(created.id));
        await renderActivitiesForSpace?.();
      }
    });
  }

  function openRenameFolderOverlay(folderId){
    const folder = (getCachedActivityFolders?.() || []).find((item) => String(item.id) === String(folderId));
    if (!folder) return Promise.resolve();

    return openNameInputOverlay({
      title: "Renommer le dossier",
      confirmLabel: "Enregistrer",
      initialName: folder.name || "",
      placeholder: "Nom du dossier",
      onConfirm: async (name) => {
        const updated = await updateActivityFolder?.(folder.id, { name });
        setCachedActivityFolders?.((getCachedActivityFolders?.() || []).map((item) => String(item.id) === String(folder.id) ? { ...item, ...updated } : item));
        await renderActivitiesForSpace?.();
      }
    });
  }

  function openRenameActivityOverlay(activityId){
    const activity = getActivityById?.(activityId);
    const currentTeacherSpace = getCurrentTeacherSpace?.();
    if (!activity || !currentTeacherSpace?.access_code) return Promise.resolve();

    return openNameInputOverlay({
      title: "Renommer l’activité",
      confirmLabel: "Enregistrer",
      initialName: activity.config_name || "",
      placeholder: "Nom de l’activité",
      onConfirm: async (name) => {
        const result = await saveActivityConfig?.({
          accessCode: currentTeacherSpace.access_code,
          moduleKey: activity.module_key,
          existingConfigName: activity.config_name,
          configName: name,
          configJson: activity.config_json
        });

        setCachedActivities?.((getCachedActivities?.() || []).map((item) => (
          String(item.id) === String(activity.id)
            ? { ...item, ...result.activity }
            : item
        )));
        await renderActivitiesForSpace?.();
      }
    });
  }

  function openNameInputOverlay({ title, confirmLabel, initialName = "", placeholder = "", onConfirm }){
    const overlay = document.createElement("div");
    overlay.className = "modal";
    overlay.innerHTML = `
      <div class="modal-content">
        <div class="modal-title">${escapeHtml(title || "Dossier")}</div>

        <input
          id="folderNameInput"
          class="modal-text-input"
          type="text"
          placeholder="${escapeAttr(placeholder || "")}"
          value="${escapeAttr(initialName || "")}"
        >

        <div class="modal-actions">
          <div id="folderModalMessage" class="modal-message"></div>
          <button class="btn" id="folderModalCancel" type="button">Annuler</button>
          <button class="btn primary" id="folderModalConfirm" type="button">${escapeHtml(confirmLabel || "Enregistrer")}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const input = overlay.querySelector("#folderNameInput");
    const message = overlay.querySelector("#folderModalMessage");
    input?.focus();
    input?.select();

    function close(){
      overlay.remove();
    }

    async function submit(){
      const name = String(input?.value || "").trim();
      if (!name) {
        message.textContent = "Entre un nom de dossier.";
        message.classList.add("is-error");
        input?.focus();
        return;
      }

      message.textContent = "";
      message.classList.remove("is-error");

      try {
        await onConfirm?.(name);
        close();
      } catch (err) {
        message.textContent = err?.message || "Enregistrement impossible.";
        message.classList.add("is-error");
      }
    }

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        close();
      }
    });

    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        void submit();
      }
    });

    overlay.querySelector("#folderModalCancel")?.addEventListener("click", close);
    overlay.querySelector("#folderModalConfirm")?.addEventListener("click", () => {
      void submit();
    });

    return Promise.resolve();
  }

  function openDeleteFolderOverlay(folderId){
    const folder = (getCachedActivityFolders?.() || []).find((item) => String(item.id) === String(folderId));
    if (!folder) return Promise.resolve();

    const overlay = document.createElement("div");
    overlay.className = "modal";
    overlay.innerHTML = `
      <div class="modal-content">
        <div class="modal-title">Supprimer le dossier</div>
        <div class="dashboard-message">Supprimer le dossier "${escapeHtml(folder.name || "")}" ?</div>

        <div class="modal-actions">
          <div id="deleteFolderMessage" class="modal-message"></div>
          <button class="btn" id="deleteFolderCancel" type="button">Annuler</button>
          <button class="btn dashboard-danger-btn" id="deleteFolderConfirm" type="button">Supprimer</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const message = overlay.querySelector("#deleteFolderMessage");

    function close(){
      overlay.remove();
    }

    async function submit(){
      const state = buildActivityTreeState?.();
      const hasChildFolders = (state.folderChildren.get(String(folder.id)) || []).length > 0;
      const hasChildActivities = (state.activityChildren.get(String(folder.id)) || []).length > 0;

      if (hasChildFolders || hasChildActivities) {
        message.textContent = "Ce dossier doit être vide avant suppression.";
        message.classList.add("is-error");
        return;
      }

      message.textContent = "Suppression…";
      message.classList.remove("is-error");

      try {
        await deleteActivityFolder?.(folder.id);
        setCachedActivityFolders?.((getCachedActivityFolders?.() || []).filter((item) => String(item.id) !== String(folder.id)));
        getCollapsedActivityFolderIds?.().delete(String(folder.id));
        getKnownActivityFolderIds?.().delete(String(folder.id));
        close();
        await renderActivitiesForSpace?.();
      } catch (err) {
        message.textContent = err?.message || "Suppression impossible.";
        message.classList.add("is-error");
      }
    }

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        close();
      }
    });

    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        void submit();
      }
    });

    overlay.querySelector("#deleteFolderCancel")?.addEventListener("click", close);
    overlay.querySelector("#deleteFolderConfirm")?.addEventListener("click", () => {
      void submit();
    });

    return Promise.resolve();
  }

  return {
    closeDeleteActivityModal,
    openCreateFolderOverlay,
    openCreateVersionOverlay,
    openDeleteActivityModal,
    openDeleteFolderOverlay,
    openRenameActivityOverlay,
    openRenameFolderOverlay,
    submitDeleteActivity
  };
}
