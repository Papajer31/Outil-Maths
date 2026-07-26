import {
  CATALOG_LEVELS,
  EXPLORATION_DEFAULTS,
  getCatalogFolders,
  normalizeCatalogActivity
} from "../../../shared/catalogue.js";
import { TOOL_LIMITS, clampInt } from "../../../shared/activity-config.js";
import {
  renderStepperField,
  bindStepperField,
  readStepper
} from "../../../shared/config-widgets.js";
import { getActiveToolsRegistry } from "../../../tools/registry.js";
import { loadToolsRuntime } from "../../../shared/tool-root-runtime.js";
import { escapeAttr, escapeHtml } from "./text-utils.js";
import { openCatalogTestRunner } from "./catalog-test-runner.js";
import {
  persistAdminDraftRuntimePayload,
  removeAdminDraftRuntimePayload
} from "../../../shared/admin-draft-runtime-storage.js";

const EMPTY_LEVELS = Object.freeze({
  "1": { settings: {} },
  "2": { settings: {} },
  "3": { settings: {} },
  "4": { settings: {} },
  "5": { settings: {} }
});

const LEVEL_START = "3";
const ADMIN_LEVEL_LABELS = Object.freeze({
  "1": "Très accessible",
  "2": "Accessible",
  "3": "Standard",
  "4": "Exigeant",
  "5": "Très exigeant"
});

const ADMIN_TOOL_PICKER_GROUPS = Object.freeze([
  {
    id: "general",
    label: "Général",
    toolIds: ["quiz"]
  },
  {
    id: "lecture",
    label: "Lecture",
    toolIds: ["encodage"]
  },
  {
    id: "ecriture",
    label: "Écriture",
    toolIds: ["geste-graphique"]
  },
  {
    id: "conjugaison",
    label: "Conjugaison",
    toolIds: ["conjugaison"]
  },
  {
    id: "lexique",
    label: "Lexique",
    toolIds: ["ordre-alphabetique-lettres", "ordre-alphabetique-mots"]
  },
  {
    id: "nombres",
    label: "Nombres",
    toolIds: [
      "plus-moins-autant",
      "comparaison",
      "collection",
      "frise-picbille",
      "droite-numerique-simple",
      "droite-numerique-complete",
      "representation-picbille",
      "representation-dede",
      "representation-carres",
      "representation-tuiles",
      "nombres-lettres"
    ]
  },
  {
    id: "calcul",
    label: "Calcul",
    toolIds: [
      "addition",
      "soustraction",
      "multiplication-posee",
      "addition-trous",
      "soustraction-trous",
      "multiplication-trous",
      "tables-multiplication",
      "boites-jetons",
      "calcul-cible",
      "compte-est-bon"
    ]
  },
  {
    id: "grandeurs-mesures",
    label: "Grandeurs et Mesures",
    toolIds: ["monnaie-representation"]
  }
]);

export function createCatalogAdminViewController({
  header,
  list,
  getCurrentTeacherSpace,
  listCatalogActivitiesForAdmin,
  saveCatalogActivityAsAdmin,
  deleteCatalogActivityAsAdmin,
  getCatalogActivityUsageAsAdmin,
  showToast,
  onReturnToCatalogue
} = {}) {
  const folders = getCatalogFolders();
  const tools = getActiveToolsRegistry();
  let activities = [];
  let adminCatalogueFolderId = null;
  let editingActivity = null;
  let levelDrafts = cloneJson(EMPTY_LEVELS);
  let activeLevel = LEVEL_START;
  let toolsRuntime = null;
  let activeToolModule = null;
  let activeToolId = "";
  let renderLevelToken = 0;
  let descriptionPanelOpen = false;
  let draggedAdminActivityId = "";
  let draggedAdminCategoryId = "";
  let activeAdminCatalogTestController = null;
  const toolCollapsibleStateByTool = new Map();

  function setCatalogueState({ activities: nextActivities = [], currentFolderId = null } = {}) {
    activities = sortAdminActivities(nextActivities);
    adminCatalogueFolderId = String(currentFolderId || "").trim() || null;
  }

  function renderHeaderActions() {
    const canStartCreation = Boolean(getAdminFolderById(adminCatalogueFolderId));
    return `
      <button id="btnAdminNewCatalogActivity" class="btn primary" type="button" ${canStartCreation ? "" : "disabled"} title="${canStartCreation ? "Créer une activité dans cette partie du Catalogue" : "Sélectionne d’abord un dossier du Catalogue."}">
        <span class="dashboard-material-icon" aria-hidden="true">add</span>
        <span>Créer une activité</span>
      </button>
    `;
  }

  function bindHeaderActions() {
    header?.querySelector("#btnAdminNewCatalogActivity")?.addEventListener("click", () => {
      if (!getAdminFolderById(adminCatalogueFolderId)) return;
      openEditor();
    });
  }

  function getActivityTileEnhancement(activity) {
    const normalized = normalizeCatalogActivity(activity);
    const isPublished = normalized.status === "published";
    const statusLabel = isPublished ? "Publié" : "Brouillon";
    return {
      className: `dashboard-admin-activity-tile ${isPublished ? "is-highlighted" : "is-draft"}`,
      attributes: `draggable="true" data-admin-activity-id="${escapeAttr(normalized.id)}" data-admin-category-id="${escapeAttr(normalized.category_id || "")}" title="Glisser pour réordonner dans cette catégorie"`,
      subtitleHtml: `<span class="dashboard-activity-tile-subtitle">${escapeHtml(getToolLabel(normalized.tool_id))} · ${escapeHtml(statusLabel)}</span>`,
      actionsHtml: `
        <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="edit-admin-activity" data-activity-id="${escapeAttr(normalized.id)}" title="Modifier" aria-label="Modifier"><span class="dashboard-material-icon" aria-hidden="true">edit</span></button>
        <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="duplicate-admin-activity" data-activity-id="${escapeAttr(normalized.id)}" title="Dupliquer" aria-label="Dupliquer"><span class="dashboard-material-icon" aria-hidden="true">content_copy</span></button>
        <button class="dashboard-icon-btn dashboard-material-icon-btn is-danger" type="button" data-action="delete-admin-activity" data-activity-id="${escapeAttr(normalized.id)}" title="Supprimer définitivement" aria-label="Supprimer définitivement"><span class="dashboard-material-icon" aria-hidden="true">delete</span></button>
      `
    };
  }

  function getDropzoneAttributes(folderId) {
    const safeFolderId = String(folderId || "").trim();
    if (!safeFolderId || !canCreateActivityInFolder(safeFolderId)) return "";
    return `data-admin-dropzone="true" data-admin-category-id="${escapeAttr(safeFolderId)}"`;
  }

  function bindCatalogueEvents({ root = list } = {}) {
    root?.querySelectorAll("[data-action='edit-admin-activity']").forEach((btn) => btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const activity = activities.find((item) => String(item.id) === String(btn.dataset.activityId || ""));
      if (activity) openEditor(activity);
    }));
    root?.querySelectorAll("[data-action='duplicate-admin-activity']").forEach((btn) => btn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const activity = activities.find((item) => String(item.id) === String(btn.dataset.activityId || ""));
      if (!activity) return;
      await duplicateCatalogActivity(activity);
    }));
    root?.querySelectorAll("[data-action='delete-admin-activity']").forEach((btn) => btn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const activity = activities.find((item) => String(item.id) === String(btn.dataset.activityId || ""));
      if (!activity) return;
      await confirmAndDeleteCatalogActivity(activity);
    }));
    bindAdminDragAndDrop();
  }

  function returnToCatalogue({ forceRefresh = false } = {}) {
    cleanupActiveAdminCatalogTestController();
    editingActivity = null;
    descriptionPanelOpen = false;
    list?.classList.remove("super-admin-editor-scroll");
    list?.classList.add("dashboard-explorer-host");
    if (typeof onReturnToCatalogue === "function") {
      void Promise.resolve(onReturnToCatalogue({ forceRefresh }));
    }
  }

  function getAdminFolderById(folderId) {
    const safeId = String(folderId || "").trim();
    return safeId ? folders.find((folder) => String(folder.id) === safeId) || null : null;
  }

  function getAdminChildFolders(parentId) {
    const safeParentId = String(parentId || "").trim();
    return folders
      .filter((folder) => String(folder.parent_id || "").trim() === safeParentId)
      .sort(compareAdminFolderOrder);
  }

  function canHostAdminActivity(folder) {
    if (!folder?.id) return false;
    if (String(folder.parent_id || "").trim()) return true;
    return getAdminChildFolders(folder.id).length === 0;
  }

  function canCreateActivityInFolder(folderId) {
    return canHostAdminActivity(getAdminFolderById(folderId));
  }

  function compareAdminFolderOrder(a, b) {
    const orderA = normalizeDisplayOrder(a?.display_order);
    const orderB = normalizeDisplayOrder(b?.display_order);
    if (orderA !== orderB) return orderA - orderB;
    return String(a?.name || "").localeCompare(String(b?.name || ""), "fr", { sensitivity: "base" });
  }

  function getAdminToolPickerGroups() {
    const toolById = new Map(tools.map((tool) => [String(tool.id || ""), tool]));
    const grouped = ADMIN_TOOL_PICKER_GROUPS
      .map((group) => ({
        ...group,
        tools: group.toolIds
          .map((toolId) => toolById.get(toolId))
          .filter(Boolean)
      }))
      .filter((group) => group.tools.length);

    const groupedIds = new Set(grouped.flatMap((group) => group.tools.map((tool) => String(tool.id || ""))));
    const remainingTools = tools.filter((tool) => !groupedIds.has(String(tool.id || "")));
    if (remainingTools.length) {
      grouped.push({
        id: "autres",
        label: "Autres",
        tools: remainingTools
      });
    }

    return grouped;
  }

  function getAdminToolPickerDefaultCategoryId(groups = [], toolId = "") {
    const safeToolId = String(toolId || "").trim();
    const matchingGroup = groups.find((group) => group.tools.some((tool) => String(tool.id || "") === safeToolId));
    return matchingGroup?.id || groups[0]?.id || "";
  }

  async function confirmAndDeleteCatalogActivity(activity) {
    const normalized = normalizeCatalogActivity(activity);
    let usage = null;
    try {
      usage = await getCatalogActivityUsageAsAdmin?.(normalized.id);
    } catch (err) {
      showToast?.(err?.message || "Impossible de vérifier les usages de l’activité.", { isError: true });
      return;
    }

    const confirmed = await openDeleteCatalogActivityDialog(normalized, usage || {});
    if (!confirmed) return;

    try {
      await deleteCatalogActivityAsAdmin?.(normalized.id);
      notifyCatalogueChanged();
      activities = await listCatalogActivitiesForAdmin?.() || activities;
      showToast?.(`Activité “${normalized.config_name}” supprimée définitivement.`);
    } catch (err) {
      showToast?.(err?.message || "Suppression impossible.", { isError: true });
    }
  }

  async function duplicateCatalogActivity(activity) {
    const normalized = normalizeCatalogActivity(activity);
    if (!normalized.id) return;
    if (typeof saveCatalogActivityAsAdmin !== "function") {
      showToast?.("Sauvegarde Admin indisponible.", { isError: true });
      return;
    }

    const title = buildDuplicateActivityTitle(normalized);
    const duplicate = {
      ...normalized,
      id: buildUniqueCatalogActivityId(normalized.category_id, title),
      title,
      config_name: title,
      status: "draft",
      display_order: getDuplicateDisplayOrder(normalized),
      levels_json: normalizeLevelsForSave(normalized.difficulty_levels, {
        questionCount: getActivityQuestionCount(normalized)
      })
    };

    try {
      const saved = await saveCatalogActivityAsAdmin(buildCatalogActivitySavePayload(duplicate));
      notifyCatalogueChanged();
      activities = await listCatalogActivitiesForAdmin?.() || activities;
      showToast?.(`Activité “${saved?.config_name || title}” dupliquée.`);
    } catch (err) {
      showToast?.(err?.message || "Duplication impossible.", { isError: true });
    }
  }

  function openDeleteCatalogActivityDialog(activity, usage = {}) {
    return new Promise((resolve) => {
      const missionsCount = Number(usage.missions_count || usage.mission_steps_count || 0) || 0;
      const progressCount = Number(usage.progress_count || 0) || 0;
      const sessionsCount = Number(usage.sessions_count || 0) || 0;
      const visibilityCount = Number(usage.visibility_count || 0) || 0;
      const overlay = document.createElement("div");
      overlay.className = "modal super-admin-delete-modal";
      overlay.setAttribute("aria-hidden", "false");
      overlay.innerHTML = `
        <div class="modal-content super-admin-delete-card" role="dialog" aria-modal="true" aria-labelledby="adminDeleteActivityTitle">
          <div class="super-admin-delete-icon"><span class="dashboard-material-icon" aria-hidden="true">warning</span></div>
          <div id="adminDeleteActivityTitle" class="modal-title">Supprimer définitivement cette activité ?</div>
          <div class="dashboard-message super-admin-delete-message">
            <strong>${escapeHtml(activity.config_name || activity.title || activity.id)}</strong><br>
            Cette action effacera l’activité système, ses niveaux, ses visibilités, les progressions et les historiques de séance liés.
          </div>
          ${missionsCount > 0 ? `
            <div class="super-admin-delete-warning">
              <span class="dashboard-material-icon" aria-hidden="true">assignment</span>
              <span>Cette activité est utilisée dans ${missionsCount} mission${missionsCount > 1 ? "s" : ""}. Elle sera retirée de ces missions.</span>
            </div>
          ` : ""}
          <div class="super-admin-delete-stats">
            <span>${progressCount} progression${progressCount > 1 ? "s" : ""}</span>
            <span>${sessionsCount} séance${sessionsCount > 1 ? "s" : ""}</span>
            <span>${visibilityCount} visibilité${visibilityCount > 1 ? "s" : ""}</span>
          </div>
          <div class="modal-actions">
            <div class="modal-message">Suppression irréversible.</div>
            <button class="btn" type="button" data-action="cancel-delete-catalog">Annuler</button>
            <button class="btn danger" type="button" data-action="confirm-delete-catalog">Supprimer définitivement</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const cleanup = (value) => {
        overlay.remove();
        resolve(value);
      };
      overlay.querySelector("[data-action='cancel-delete-catalog']")?.addEventListener("click", () => cleanup(false));
      overlay.querySelector("[data-action='confirm-delete-catalog']")?.addEventListener("click", () => cleanup(true));
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) cleanup(false);
      });
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          cleanup(false);
        }
      });
      overlay.tabIndex = -1;
      overlay.focus();
    });
  }

  function openEditor(activity = null) {
    const normalized = activity ? normalizeCatalogActivity(activity) : null;
    editingActivity = normalized ? { ...normalized } : defaultActivity();
    levelDrafts = cloneJson(normalized?.difficulty_levels || EMPTY_LEVELS);
    activeLevel = LEVEL_START;
    activeToolModule = null;
    activeToolId = "";
    descriptionPanelOpen = false;
    toolCollapsibleStateByTool.clear();
    renderEditor();
  }

  function defaultActivity() {
    return {
      id: "",
      title: "",
      config_name: "",
      category_id: getDefaultAdminActivityFolderId(),
      tool_id: "",
      description: "",
      default_question_count: EXPLORATION_DEFAULTS.questionCount,
      display_order: null,
      status: "draft",
      default_visible: true,
      difficulty_levels: cloneJson(EMPTY_LEVELS)
    };
  }

  function getDefaultAdminActivityFolderId() {
    const selectedFolder = getAdminFolderById(adminCatalogueFolderId);
    if (canHostAdminActivity(selectedFolder)) return selectedFolder.id;

    const childHost = getAdminChildFolders(selectedFolder?.id || "")
      .find((folder) => canHostAdminActivity(folder));
    if (childHost) return childHost.id;

    return folders.find((folder) => canHostAdminActivity(folder))?.id || "francais.lecture";
  }

  function renderEditor() {
    if (!list || !editingActivity) return;
    list.classList.remove("dashboard-explorer-host");
    list.classList.add("super-admin-editor-scroll");
    if (header) {
      header.innerHTML = renderEditorHeader();
      bindEditorHeader();
    }
    list.innerHTML = `
      <div class="cfg-page cfg-page-embedded super-admin-config-page">
        <section class="cfg-main super-admin-config-main">
          <aside class="cfg-tools-panel super-admin-config-sidebar">
            <div class="cfg-tools-header">
              <div class="cfg-panel-title">Activité système</div>
            </div>

            <div class="cfg-tools-list super-admin-sidebar-list">
              ${renderToolChoiceTile()}
              ${renderCategoryTile()}
              ${renderQuestionCountTile()}
              ${renderDescriptionTile()}

              <div class="super-admin-sidebar-separator" aria-hidden="true"></div>

              <div class="cfg-tools-header super-admin-level-sidebar-header">
                <div class="cfg-panel-title">Niveaux adaptatifs</div>
              </div>
              <nav class="super-admin-level-tabs" aria-label="Niveaux adaptatifs">
                ${CATALOG_LEVELS.map((level) => renderLevelTab(level)).join("")}
              </nav>
            </div>
          </aside>

          <section class="cfg-settings-panel super-admin-config-settings-panel">
            <div class="cfg-settings-header super-admin-settings-header">
              <div class="cfg-panel-title" id="adminLevelTitle">Niveau ${escapeHtml(activeLevel)} — ${escapeHtml(getLevelLabel(activeLevel))}</div>
              <div class="super-admin-level-actions">
                <button class="btn" type="button" data-action="copy-current-level">Copier le niveau ${escapeHtml(activeLevel)} partout</button>
                <button class="btn" type="button" data-action="reset-current-level">Réinitialiser le niveau courant</button>
              </div>
            </div>
            <div id="superAdminToolMessage" class="modal-message super-admin-tool-message"></div>
            <div id="adminLevelToolSettingsHost" class="cfg-tool-config-host super-admin-tool-settings-host">
              <div class="cfg-empty-state">Chargement des réglages…</div>
            </div>
          </section>
        </section>
        ${renderDescriptionPanel()}
        ${renderAdminTitleOverlay()}
      </div>
    `;
    bindEditorEvents();
    renderActiveLevelSettings();
  }

  function renderEditorHeader() {
    const title = String(editingActivity?.config_name || editingActivity?.title || "").trim();
    const safeTitle = title || "titre";
    const isPublished = String(editingActivity?.status || "draft") === "published";
    return `
        <div class="dashboard-config-header-main super-admin-editor-header-main cfg-header-left">
          <button class="btn cfg-back-btn super-admin-editor-back" type="button" data-action="back-admin-list" aria-label="Retour au Catalogue">↩</button>
          <div class="cfg-header-identity super-admin-editor-identity">
            <span class="cfg-field-label">Titre de l'activité :</span>
            <span class="cfg-config-name-display${title ? "" : " is-empty"}" title="${escapeAttr(safeTitle)}">${escapeHtml(safeTitle)}</span>
            <button class="dashboard-icon-btn cfg-name-rename-btn" type="button" data-action="rename-admin-activity" aria-label="Renommer l’activité" title="Renommer l’activité">
              <span class="dashboard-material-icon" aria-hidden="true">drive_file_rename_outline</span>
            </button>
          </div>
          <div class="dashboard-view-toggle super-admin-status-toggle" role="group" aria-label="Statut de publication">
            <button class="dashboard-view-toggle-btn${isPublished ? "" : " is-active"}" type="button" data-action="set-admin-status" data-status="draft" aria-pressed="${isPublished ? "false" : "true"}">Brouillon</button>
            <button class="dashboard-view-toggle-btn${isPublished ? " is-active" : ""}" type="button" data-action="set-admin-status" data-status="published" aria-pressed="${isPublished ? "true" : "false"}">Publié</button>
        </div>
      </div>
      <div class="dashboard-config-header-center super-admin-editor-header-center">
        <div id="superAdminMessage" class="cfg-editor-message"></div>
      </div>
      <div class="dashboard-config-header-actions cfg-header-actions">
        <button class="btn" type="button" data-action="open-viewport-test-bench" title="Ouvrir le banc de test des résolutions"><span class="dashboard-material-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M120-120v-520h200v-200h520v720H120Zm520-80h120v-560H400v120h240v440Zm-240 0h160v-360H400v360Zm-200 0h120v-360H200v360Zm440-440v80-80Zm-320 80Zm240 0Zm80-80Z"/></svg></span><span>Banc runtime</span></button>
        <button class="btn" type="button" data-action="test-admin-draft-activity">Tester ainsi</button>
        <button class="btn cfg-save-btn dirty" type="button" data-action="save-admin-activity">Enregistrer</button>
      </div>
    `;
  }

  function bindEditorHeader() {
    header?.querySelector("[data-action='back-admin-list']")?.addEventListener("click", () => returnToCatalogue());
    header?.querySelector("[data-action='rename-admin-activity']")?.addEventListener("click", openAdminTitleOverlay);
    header?.querySelectorAll("[data-action='set-admin-status']").forEach((button) => {
      button.addEventListener("click", () => {
        editingActivity.status = String(button.dataset.status || "draft") === "published" ? "published" : "draft";
        renderEditor();
      });
    });
    header?.querySelector("[data-action='open-viewport-test-bench']")?.addEventListener("click", openViewportTestBench);
    header?.querySelector("[data-action='test-admin-draft-activity']")?.addEventListener("click", testCurrentDraftActivity);
    header?.querySelector("[data-action='save-admin-activity']")?.addEventListener("click", saveCurrentActivity);
  }

  function openViewportTestBench() {
    try {
      const draftActivity = buildDraftActivityForTest();
      const currentTeacherSpace = getCurrentTeacherSpace?.() || null;
      const accessCode = String(currentTeacherSpace?.access_code || "ADMINTEST").trim().toUpperCase();
      const catalogActivities = [
        draftActivity,
        ...(Array.isArray(activities) ? activities : [])
      ];
      const token = createAdminDraftRuntimeToken();
      persistAdminDraftRuntimePayload(token, {
        version: 1,
        createdAt: Date.now(),
        accessCode,
        activity: draftActivity,
        catalogActivities,
        initialLevel: activeLevel
      });

      const url = new URL("../_dev/viewport-test.html", window.location.href);
      url.searchParams.set("adminDraftToken", token);

      // Ne pas utiliser directement le feature `noopener` ici : Firefox peut
      // ouvrir correctement l’onglet tout en renvoyant `null`, ce qui faisait
      // croire à tort que la popup avait été bloquée et supprimait le payload.
      const opened = window.open("about:blank", "_blank");
      if (!opened) {
        removeAdminDraftRuntimePayload(token);
        showToast?.("Le navigateur a bloqué l’ouverture du banc de test.", { isError: true });
        return;
      }

      try {
        opened.opener = null;
      } catch {}
      opened.location.href = url.href;
    } catch (err) {
      showToast?.(err?.message || "Impossible d’ouvrir le banc de test.", { isError: true });
    }
  }

  function renderToolChoiceTile() {
    const label = getToolLabel(editingActivity?.tool_id);
    const hasTool = !!String(editingActivity?.tool_id || "").trim();
    return `
      <button class="cfg-add-tool-tile super-admin-tool-choice-tile${hasTool ? " has-tool" : ""}" type="button" data-action="open-admin-tool-picker" aria-label="Sélectionner l’outil de l’activité">
        <span class="cfg-add-tool-tile-icon cfg-material-icon" aria-hidden="true">${hasTool ? "extension" : "add"}</span>
        <span class="cfg-add-tool-tile-label">${escapeHtml(hasTool ? label : "Sélectionner outil")}</span>
        <span class="cfg-duration-chevron cfg-material-icon super-admin-tile-chevron" aria-hidden="true">chevron_right</span>
      </button>
    `;
  }

  function renderCategoryTile() {
    return `
      <label class="cfg-duration-card super-admin-info-card super-admin-select-card">
        <span class="cfg-duration-summary">
          <span class="cfg-duration-icon cfg-material-icon super-admin-info-card-icon" aria-hidden="true">folder</span>
          <span class="cfg-duration-summary-main">Catégorie : <strong id="adminCategoryDisplay">${escapeHtml(getCategoryPathLabel(editingActivity?.category_id))}</strong></span>
          <span class="cfg-duration-chevron cfg-material-icon super-admin-tile-chevron" aria-hidden="true">expand_more</span>
        </span>
        <select class="super-admin-card-select" data-field="category_id" aria-label="Catégorie de l’activité">
          ${renderCategoryOptions(editingActivity.category_id)}
        </select>
      </label>
    `;
  }

  function renderQuestionCountTile() {
    const count = getActivityQuestionCount(editingActivity);
    return `
      <div class="cfg-duration-card super-admin-info-card super-admin-question-count-card">
        <div class="cfg-duration-summary super-admin-question-count-summary">
          <span class="cfg-duration-icon cfg-material-icon super-admin-info-card-icon" aria-hidden="true">quiz</span>
          <span class="cfg-duration-summary-main">Questions :</span>
          <div class="super-admin-question-count-control">
            ${renderStepperField({
              id: "adminActivityQuestionCount",
              label: "Nombre de questions",
              value: count,
              inputMin: TOOL_LIMITS.questionCount.min,
              inputMax: TOOL_LIMITS.questionCount.max,
              step: TOOL_LIMITS.questionCount.step,
              fieldClassName: "super-admin-compact-stepper-field"
            })}
          </div>
        </div>
      </div>
    `;
  }

  function renderDescriptionTile() {
    return `
      <div class="cfg-duration-card super-admin-info-card super-admin-description-card${descriptionPanelOpen ? " is-open" : ""}">
        <button class="cfg-duration-summary" type="button" data-action="open-admin-description" aria-expanded="${descriptionPanelOpen ? "true" : "false"}">
          <span class="cfg-duration-icon cfg-material-icon super-admin-info-card-icon" aria-hidden="true">notes</span>
          <span class="cfg-duration-summary-main">Description</span>
          <span class="cfg-duration-chevron cfg-material-icon super-admin-tile-chevron" aria-hidden="true">edit</span>
        </button>
      </div>
    `;
  }

  function renderDescriptionPanel() {
    if (!descriptionPanelOpen) return "";
    return `
      <aside class="panel super-admin-description-popover" role="dialog" aria-modal="false" aria-labelledby="adminDescriptionTitle">
        <div class="super-admin-description-popover-header">
          <div id="adminDescriptionTitle" class="cfg-panel-title">Description</div>
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="close-admin-description" aria-label="Fermer la description" title="Fermer">
            <span class="dashboard-material-icon" aria-hidden="true">close</span>
          </button>
        </div>
        <textarea class="modal-text-input super-admin-description-textarea" rows="8" data-field="description" placeholder="Courte explication pédagogique…">${escapeHtml(editingActivity.description || "")}</textarea>
      </aside>
    `;
  }

  function renderAdminTitleOverlay() {
    const title = String(editingActivity?.config_name || editingActivity?.title || "").trim();
    return `
      <div id="adminTitleOverlay" class="cfg-modal hidden" aria-hidden="true">
        <div class="cfg-modal-backdrop" data-close-admin-title="true"></div>
        <div class="panel cfg-modal-card super-admin-title-modal" role="dialog" aria-modal="true" aria-labelledby="adminTitleModalTitle">
          <div class="cfg-modal-header">
            <div>
              <div id="adminTitleModalTitle" class="cfg-modal-title">Renommer l’activité</div>
              <div class="cfg-modal-subtitle">Ce titre est affiché dans le Catalogue et dans l’éditeur.</div>
            </div>
            <button class="btn cfg-modal-close" type="button" data-close-admin-title="true" aria-label="Fermer">✕</button>
          </div>
          <div class="super-admin-title-modal-body">
            <label class="super-admin-title-modal-label" for="adminActivityTitleInput">Titre de l’activité</label>
            <input id="adminActivityTitleInput" class="modal-text-input super-admin-title-input" type="text" value="${escapeAttr(title)}" placeholder="Titre de l’activité">
            <div id="adminTitleModalMessage" class="modal-message super-admin-title-message" aria-live="polite"></div>
          </div>
          <div class="super-admin-title-modal-actions">
            <button class="btn" type="button" data-close-admin-title="true">Annuler</button>
            <button class="btn primary" type="button" data-action="apply-admin-title">Valider</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderAdminToolPickerOverlay() {
    const groupedTools = getAdminToolPickerGroups();
    const activeCategoryId = getAdminToolPickerDefaultCategoryId(groupedTools, editingActivity?.tool_id);
    return `
      <div id="adminToolPickerOverlay" class="cfg-modal cfg-tool-picker-modal hidden" aria-hidden="true">
        <div class="cfg-modal-backdrop" data-close-admin-tool-picker="true"></div>
        <div class="panel cfg-modal-card cfg-tool-picker-modal-card" role="dialog" aria-modal="true" aria-labelledby="adminToolPickerTitle">
          <div class="cfg-modal-header">
            <div>
              <div id="adminToolPickerTitle" class="cfg-modal-title">Choisir l’outil de l’activité</div>
              <div class="cfg-modal-subtitle">Sélectionne une catégorie à gauche, puis un outil à droite.</div>
            </div>
            <button class="btn cfg-modal-close" type="button" data-close-admin-tool-picker="true" aria-label="Fermer">✕</button>
          </div>
          <div class="cfg-tool-picker-layout" data-admin-tool-picker>
            <nav class="cfg-tool-picker-categories" aria-label="Catégories d’outils">
              ${groupedTools.map((group) => `
                <button
                  class="cfg-tool-picker-category${group.id === activeCategoryId ? " is-active" : ""}"
                  type="button"
                  data-action="select-admin-tool-category"
                  data-tool-category-id="${escapeAttr(group.id)}"
                  aria-pressed="${group.id === activeCategoryId ? "true" : "false"}"
                >
                  ${escapeHtml(group.label)}
                </button>
              `).join("")}
            </nav>
            <div class="cfg-tool-picker-list" aria-live="polite">
              ${groupedTools.map((group) => `
                <div class="cfg-tool-picker-panel" data-tool-category-panel="${escapeAttr(group.id)}" ${group.id === activeCategoryId ? "" : "hidden"}>
                  ${group.tools.map((tool) => `
                    <button class="cfg-tool-picker-row${String(tool.id) === String(editingActivity?.tool_id || "") ? " is-selected" : ""}" type="button" data-action="choose-admin-tool" data-tool-id="${escapeAttr(tool.id)}">
                      <span class="cfg-tool-picker-row-title">${escapeHtml(tool.label || tool.title || tool.id)}</span>
                    </button>
                  `).join("")}
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderCategoryOptions(selectedId) {
    return folders
      .filter((folder) => canHostAdminActivity(folder))
      .map((folder) => `<option value="${escapeAttr(folder.id)}" ${folder.id === selectedId ? "selected" : ""}>${escapeHtml(getCategoryPathLabel(folder.id))}</option>`)
      .join("");
  }

  function renderLevelTab(level) {
    const key = String(level.level);
    return `
      <button class="cfg-tool-row super-admin-level-tab${key === activeLevel ? " active is-active" : ""}" type="button" data-action="select-level" data-level="${escapeAttr(key)}" aria-pressed="${key === activeLevel ? "true" : "false"}">
        <span class="cfg-tool-main super-admin-level-tab-main">
          <span class="cfg-tool-name">Niveau ${escapeHtml(key)}</span>
          <span class="cfg-tool-subtitle">${escapeHtml(getLevelLabel(key))}</span>
        </span>
      </button>
    `;
  }

  function bindEditorEvents() {
    list?.querySelector("[data-action='back-admin-list']")?.addEventListener("click", () => returnToCatalogue());
    list?.querySelector("[data-action='open-admin-tool-picker']")?.addEventListener("click", openAdminToolPicker);

    list?.querySelectorAll("[data-close-admin-title]").forEach((node) => node.addEventListener("click", closeAdminTitleOverlay));
    list?.querySelector("[data-action='apply-admin-title']")?.addEventListener("click", applyAdminTitle);
    list?.querySelector("#adminActivityTitleInput")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        applyAdminTitle();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeAdminTitleOverlay();
      }
    });

    list?.querySelectorAll("[data-field]").forEach((field) => {
      field.addEventListener("input", readEditorFields);
      field.addEventListener("change", readEditorFields);
    });

    list?.querySelector("[data-field='category_id']")?.addEventListener("change", () => {
      readEditorFields();
      const display = list.querySelector("#adminCategoryDisplay");
      if (display) display.textContent = getCategoryPathLabel(editingActivity?.category_id);
    });

    bindStepperField(list, "adminActivityQuestionCount", {
      inputMin: TOOL_LIMITS.questionCount.min,
      inputMax: TOOL_LIMITS.questionCount.max,
      onChange: readEditorFields
    });

    list?.querySelector("[data-action='open-admin-description']")?.addEventListener("click", () => {
      readEditorFields();
      persistActiveLevelSettingsQuietly();
      descriptionPanelOpen = true;
      renderEditor();
    });

    list?.querySelector("[data-action='close-admin-description']")?.addEventListener("click", () => {
      readEditorFields();
      persistActiveLevelSettingsQuietly();
      descriptionPanelOpen = false;
      renderEditor();
    });

    list?.querySelectorAll("[data-action='select-level']").forEach((button) => {
      button.addEventListener("click", () => switchActiveLevel(button.dataset.level));
    });

    list?.querySelector("[data-action='copy-current-level']")?.addEventListener("click", () => {
      try {
        persistActiveLevelSettings();
        copyActiveLevelToOtherLevels();
        showSuperAdminMessage(`Niveau ${activeLevel} copié sur les autres niveaux.`);
        renderEditor();
      } catch (err) {
        showSuperAdminMessage(err?.message || "Impossible de copier le niveau.", true);
      }
    });

    list?.querySelector("[data-action='reset-current-level']")?.addEventListener("click", () => {
      const tool = activeToolModule?.default || null;
      levelDrafts[String(activeLevel)] = {
        ...makeDefaultLevelDraft(),
        settings: getDefaultToolSettings(tool)
      };
      showSuperAdminMessage(`Niveau ${activeLevel} réinitialisé.`);
      renderEditor();
    });
  }

  function copyActiveLevelToOtherLevels() {
    const sourceKey = clampLevelKey(activeLevel);
    const source = cloneJson(levelDrafts[sourceKey] || makeDefaultLevelDraft());
    levelDrafts = CATALOG_LEVELS.reduce((acc, level) => {
      const key = String(level.level);
      acc[key] = key === sourceKey
        ? cloneJson(levelDrafts[key] || source)
        : cloneJson(source);
      return acc;
    }, {});
  }

  function ensureAdminToolPickerOverlay() {
    if (!list) return null;
    const existing = list.querySelector("#adminToolPickerOverlay");
    if (existing) return existing;

    const host = list.querySelector(".super-admin-config-page") || list;
    host.insertAdjacentHTML("beforeend", renderAdminToolPickerOverlay());
    const overlay = list.querySelector("#adminToolPickerOverlay");
    bindAdminToolPickerEvents(overlay);
    return overlay;
  }

  function bindAdminToolPickerEvents(overlay) {
    if (!overlay || overlay.dataset.bound === "true") return;
    overlay.dataset.bound = "true";

    overlay.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const categoryButton = target.closest("[data-action='select-admin-tool-category']");
      if (categoryButton) {
        selectAdminToolCategory(categoryButton.dataset.toolCategoryId);
        return;
      }

      const toolButton = target.closest("[data-action='choose-admin-tool']");
      if (toolButton) {
        void chooseAdminTool(toolButton.dataset.toolId);
        return;
      }

      if (target.closest("[data-close-admin-tool-picker]")) {
        closeAdminToolPicker();
      }
    });

    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAdminToolPicker();
      }
    });
  }

  function openAdminToolPicker() {
    const overlay = ensureAdminToolPickerOverlay();
    if (!overlay) return;
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
    overlay.querySelector(".cfg-tool-picker-row.is-selected, .cfg-tool-picker-category.is-active, .cfg-modal-close")?.focus?.();
  }

  function closeAdminToolPicker() {
    list?.querySelector("#adminToolPickerOverlay")?.remove();
  }

  function openAdminTitleOverlay() {
    if (!list || !editingActivity) return;
    readEditorFields();
    persistActiveLevelSettingsQuietly();
    const overlay = list.querySelector("#adminTitleOverlay");
    const input = overlay?.querySelector("#adminActivityTitleInput");
    const message = overlay?.querySelector("#adminTitleModalMessage");
    if (!overlay || !input) return;
    input.value = String(editingActivity.config_name || editingActivity.title || "").trim();
    if (message) {
      message.textContent = "";
      message.classList.remove("is-error");
    }
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
    window.requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  function closeAdminTitleOverlay() {
    const overlay = list?.querySelector("#adminTitleOverlay");
    if (!overlay) return;
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
  }

  function applyAdminTitle() {
    if (!editingActivity || !list) return;
    const overlay = list.querySelector("#adminTitleOverlay");
    const input = overlay?.querySelector("#adminActivityTitleInput");
    const message = overlay?.querySelector("#adminTitleModalMessage");
    const clean = String(input?.value || "").trim();
    if (!clean) {
      if (message) {
        message.textContent = "Le titre ne peut pas être vide.";
        message.classList.add("is-error");
      }
      input?.focus();
      return;
    }
    editingActivity.title = clean;
    editingActivity.config_name = clean;
    closeAdminTitleOverlay();
    renderEditor();
  }

  function selectAdminToolCategory(categoryId) {
    const overlay = list?.querySelector("#adminToolPickerOverlay");
    const safeCategoryId = String(categoryId || "").trim();
    if (!overlay || !safeCategoryId) return;

    overlay.querySelectorAll("[data-action='select-admin-tool-category']").forEach((button) => {
      const isActive = String(button.dataset.toolCategoryId || "") === safeCategoryId;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    overlay.querySelectorAll("[data-tool-category-panel]").forEach((panel) => {
      panel.hidden = String(panel.dataset.toolCategoryPanel || "") !== safeCategoryId;
    });
  }

  async function chooseAdminTool(toolId) {
    const previousToolId = String(editingActivity?.tool_id || "");
    const nextToolId = String(toolId || "").trim();
    if (!nextToolId || nextToolId === previousToolId) {
      closeAdminToolPicker();
      return;
    }
    editingActivity.tool_id = nextToolId;
    levelDrafts = cloneJson(EMPTY_LEVELS);
    activeLevel = LEVEL_START;
    activeToolModule = null;
    activeToolId = "";
    toolCollapsibleStateByTool.clear();
    closeAdminToolPicker();
    renderEditor();
  }

  function readEditorFields() {
    if (!editingActivity || !list) return;
    list.querySelectorAll("[data-field]").forEach((field) => {
      const key = field.dataset.field;
      if (!key) return;
      if (field.type === "checkbox") {
        editingActivity[key] = field.checked;
      } else {
        editingActivity[key] = field.value;
      }
    });
    editingActivity.default_question_count = readStepper(list, "adminActivityQuestionCount", {
      inputMin: TOOL_LIMITS.questionCount.min,
      inputMax: TOOL_LIMITS.questionCount.max
    });
  }

  async function switchActiveLevel(nextLevel) {
    const safeNext = clampLevelKey(nextLevel);
    if (safeNext === activeLevel) return;
    try {
      rememberActiveToolCollapsibleState();
      persistActiveLevelSettings();
      activeLevel = safeNext;
      renderEditor();
    } catch (err) {
      showSuperAdminMessage(err?.message || "Impossible de changer de niveau.", true);
    }
  }

  async function renderActiveLevelSettings() {
    const token = ++renderLevelToken;
    const host = list?.querySelector("#adminLevelToolSettingsHost");
    if (!host || !editingActivity) return;
    const toolId = String(editingActivity.tool_id || "").trim();
    if (!toolId) {
      host.innerHTML = `<div class="cfg-empty-state">Sélectionne un outil dans la colonne de gauche.</div>`;
      return;
    }

    host.innerHTML = `<div class="cfg-empty-state">Chargement des widgets de l’outil…</div>`;

    try {
      const runtime = await getToolsRuntime();
      const mod = await runtime.loadToolModule(toolId);
      if (token !== renderLevelToken) return;
      activeToolModule = mod;
      activeToolId = toolId;
      const tool = mod.default || {};
      const settings = getSettingsForLevel(activeLevel, tool);
      const levelDraft = normalizeLevelDraft(levelDrafts[String(activeLevel)]);

      host.innerHTML = `
        <div class="cfg-tool-settings-stack super-admin-tool-settings-stack">
          <div class="super-admin-level-common-row">
            ${renderLevelTimingBlock(levelDraft)}
            ${renderLevelInstructionBlock(levelDraft, tool)}
          </div>
          <div id="adminLevelSpecificSettingsHost"></div>
        </div>
      `;

      bindLevelTimingBlock(host);
      bindLevelInstructionBlock(host);

      const settingsHost = host.querySelector("#adminLevelSpecificSettingsHost");
      if (typeof tool.renderToolSettings === "function") {
        tool.renderToolSettings(settingsHost, cloneJson(settings), getToolEditorContext(activeLevel));
        restoreActiveToolCollapsibleState(settingsHost);
        bindActiveToolCollapsibleStateMemory(settingsHost);
      } else {
        settingsHost.innerHTML = `<div class="cfg-empty-state">Aucun réglage spécifique pour cet outil.</div>`;
      }

      host.querySelectorAll('input[type="number"]').forEach((inp) => {
        inp.addEventListener("focus", () => {
          inp.select?.();
          try { inp.setSelectionRange(0, inp.value.length); } catch {}
        });
        inp.addEventListener("pointerup", () => {
          inp.select?.();
          try { inp.setSelectionRange(0, inp.value.length); } catch {}
        });
      });

      host.addEventListener("toolsettingsrefresh", () => {
        try {
          persistActiveLevelSettings({ allowMissingModule: true });
        } catch {}
        renderActiveLevelSettings();
      }, { once: true });
    } catch (err) {
      host.innerHTML = `<div class="cfg-empty-state">${escapeHtml(err?.message || "Impossible de charger les réglages de l’outil.")}</div>`;
    }
  }

  function rememberActiveToolCollapsibleState(container = list?.querySelector("#adminLevelSpecificSettingsHost")) {
    const toolId = String(editingActivity?.tool_id || activeToolId || "").trim();
    if (!toolId || !container) return;

    const nextState = toolCollapsibleStateByTool.get(toolId) || {};
    container.querySelectorAll("[data-tv-collapsible]").forEach((group) => {
      const key = String(group.dataset.tvCollapsible || "").trim();
      const toggle = group.querySelector(".tv-group-toggle");
      if (!key || !toggle) return;
      nextState[key] = toggle.getAttribute("aria-expanded") === "true";
    });
    toolCollapsibleStateByTool.set(toolId, nextState);
  }

  function restoreActiveToolCollapsibleState(container = list?.querySelector("#adminLevelSpecificSettingsHost")) {
    const toolId = String(editingActivity?.tool_id || activeToolId || "").trim();
    const state = toolCollapsibleStateByTool.get(toolId);
    if (!toolId || !container || !state) return;

    container.querySelectorAll("[data-tv-collapsible]").forEach((group) => {
      const key = String(group.dataset.tvCollapsible || "").trim();
      if (!key || !Object.prototype.hasOwnProperty.call(state, key)) return;
      setCollapsibleGroupExpanded(group, state[key] === true);
    });
  }

  function bindActiveToolCollapsibleStateMemory(container = list?.querySelector("#adminLevelSpecificSettingsHost")) {
    if (!container) return;
    container.addEventListener("click", (event) => {
      const toggle = event.target?.closest?.(".tv-group-toggle");
      if (!toggle || !container.contains(toggle)) return;
      queueMicrotask(() => rememberActiveToolCollapsibleState(container));
    });
  }

  function setCollapsibleGroupExpanded(group, expanded) {
    const toggle = group?.querySelector?.(".tv-group-toggle");
    if (!toggle) return;

    const controlsId = String(toggle.getAttribute("aria-controls") || "").trim();
    const content = controlsId
      ? group.querySelector(`#${cssEscape(controlsId)}`)
      : group.querySelector(".tv-group-content");
    if (!content) return;

    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    content.classList.toggle("is-open", expanded);
    content.hidden = !expanded;
  }

  function renderLevelTimingBlock(levelDraft = {}) {
    const normalized = normalizeLevelDraft(levelDraft);
    return `
      <div class="tv-group tv-group-inline super-admin-level-time-group">
        <div class="tv-minmax tv-minmax-basic super-admin-level-time-inline">
          <div class="tv-minmax-inline">
            <div class="tv-group-title tv-minmax-title">Temps par question</div>
            <div class="tv-minmax-header-actions">
              <div class="tv-minmax-controls">
                ${renderStepperField({
                  id: "adminLevelTimePerQ",
                  label: "Temps par question",
                  value: normalized.timePerQ,
                  inputMin: TOOL_LIMITS.timePerQ.min,
                  inputMax: TOOL_LIMITS.timePerQ.max,
                  step: TOOL_LIMITS.timePerQ.step,
                  fieldClassName: "super-admin-compact-stepper-field",
                  actionButtonHtml: renderAdminInfiniteToggleButton({
                    id: "adminLevelTimePerQInfinite",
                    label: "Temps par question illimité",
                    active: normalized.infiniteTimePerQ
                  })
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderLevelInstructionBlock(levelDraft = {}, tool = null) {
    const instruction = getLevelInstructionState(levelDraft);
    const checkedAttr = instruction.enabled ? "checked" : "";
    const disabledAttr = instruction.enabled ? "" : "disabled";
    const normalizedLevelDraft = normalizeLevelDraft(levelDraft);
    const sourceInstruction = String(
      normalizedLevelDraft?.settings?.sourceInstruction
        ?? normalizedLevelDraft?.settings?.source_instruction
        ?? ""
    ).trim();
    const defaultInstruction = sourceInstruction || String(tool?.defaultInstruction || "").trim();
    const placeholder = defaultInstruction || "Consigne affichée uniquement pour ce niveau...";
    return `
      <div class="tv-group tv-group-inline super-admin-level-instruction-group">
        <div class="super-admin-level-instruction-head">
          <label class="super-admin-level-instruction-checkline" for="adminLevelInstructionEnabled">
            <input id="adminLevelInstructionEnabled" type="checkbox" ${checkedAttr}>
            <span>Consigne personnalisée :</span>
          </label>
        </div>
        <input
          id="adminLevelInstructionText"
          class="tv-input super-admin-level-instruction-input"
          type="text"
          placeholder="${escapeAttr(placeholder)}"
          data-tool-default-instruction="${escapeAttr(String(tool?.defaultInstruction || "").trim())}"
          value="${escapeAttr(instruction.text)}"
          ${disabledAttr}>
      </div>
    `;
  }

  function bindLevelTimingBlock(container) {
    bindStepperField(container, "adminLevelTimePerQ", {
      inputMin: TOOL_LIMITS.timePerQ.min,
      inputMax: TOOL_LIMITS.timePerQ.max
    });
    bindAdminInfiniteToggle(container, {
      buttonId: "adminLevelTimePerQInfinite",
      inputId: "adminLevelTimePerQ"
    });
  }

  function bindLevelInstructionBlock(container) {
    const checkbox = container.querySelector("#adminLevelInstructionEnabled");
    const input = container.querySelector("#adminLevelInstructionText");
    if (!checkbox || !input) return;
    const applyState = () => {
      input.disabled = checkbox.checked !== true;
      input.closest(".super-admin-level-instruction-group")?.classList.toggle("is-enabled", checkbox.checked === true);
    };
    applyState();
    checkbox.addEventListener("change", () => {
      applyState();
      if (checkbox.checked) input.focus();
    });

    container.addEventListener("toolsourceinstructionchange", (event) => {
      const sourceInstruction = String(event?.detail?.instruction || "").trim();
      const toolDefault = String(input.dataset.toolDefaultInstruction || "").trim();
      input.placeholder = sourceInstruction || toolDefault || "Consigne affichée uniquement pour ce niveau...";
    });
  }

  function renderAdminInfiniteToggleButton({ id, label, active = false }) {
    return `
      <button
        class="tv-stepper-infinity-btn${active ? " is-active" : ""}"
        type="button"
        id="${escapeAttr(id)}"
        data-infinite-toggle="true"
        aria-label="${escapeAttr(label)}"
        aria-pressed="${active ? "true" : "false"}"
        title="${escapeAttr(label)}"
      >
        <span class="tv-stepper-icon" aria-hidden="true">all_inclusive</span>
      </button>
    `;
  }

  function bindAdminInfiniteToggle(container, { buttonId, inputId } = {}) {
    const button = container.querySelector(`#${cssEscape(buttonId)}`);
    const input = container.querySelector(`#${cssEscape(inputId)}`);
    if (!button || !input) return;
    const applyState = (active) => {
      button.classList.toggle("is-active", !!active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
      input.disabled = !!active;
      input.closest(".tv-stepper")?.classList.toggle("is-disabled", !!active);
    };
    applyState(button.getAttribute("aria-pressed") === "true");
    button.addEventListener("click", () => applyState(button.getAttribute("aria-pressed") !== "true"));
  }

  async function getToolsRuntime() {
    if (!toolsRuntime) {
      toolsRuntime = await loadToolsRuntime();
    }
    return toolsRuntime;
  }

  function getToolEditorContext(levelKey = activeLevel) {
    const teacherSpace = getCurrentTeacherSpace?.() || null;
    return {
      activityMode: "individual",
      activity_mode: "individual",
      responseUi: "boxed",
      response_ui: "boxed",
      progressMode: "practice",
      progress_mode: "practice",
      passationProfile: {
        activityMode: "individual",
        responseUi: "boxed",
        progressMode: "practice"
      },
      teacherSpace,
      teacher_space_id: teacherSpace?.id || null,
      catalogActivityId: editingActivity?.id || getTechnicalIdPreview(),
      isCatalogAdmin: true,
      toolId: editingActivity?.tool_id || "",
      level: Number(levelKey) || 3,
      setEditorMessage: (message, isError = false) => showToolMessage(message, isError),
      clearEditorMessage: () => showToolMessage("")
    };
  }

  function persistActiveLevelSettings({ allowMissingModule = false } = {}) {
    if (!editingActivity || !list) return;
    const toolId = String(editingActivity.tool_id || "").trim();
    const settingsHost = list.querySelector("#adminLevelSpecificSettingsHost");
    const currentLevelDraft = normalizeLevelDraft(levelDrafts[String(activeLevel)]);
    const instructionState = readLevelInstructionState(list, currentLevelDraft);
    const nextLevelDraft = {
      ...currentLevelDraft,
      ...readLevelTimingSettings(list, currentLevelDraft)
    };
    if (!settingsHost) {
      levelDrafts[String(activeLevel)] = {
        ...nextLevelDraft,
        settings: applyLevelInstructionToSettings(nextLevelDraft.settings, instructionState)
      };
      return;
    }
    if (!activeToolModule || activeToolId !== toolId) {
      if (allowMissingModule) {
        levelDrafts[String(activeLevel)] = {
          ...nextLevelDraft,
          settings: applyLevelInstructionToSettings(nextLevelDraft.settings, instructionState)
        };
        return;
      }
      throw new Error("Les réglages de l’outil ne sont pas encore chargés.");
    }
    const tool = activeToolModule.default || {};
    const previous = getSettingsForLevel(activeLevel, tool);
    const nextSettings = typeof tool.readToolSettings === "function"
      ? tool.readToolSettings(settingsHost, cloneJson(previous), getToolEditorContext(activeLevel))
      : previous;
    levelDrafts[String(activeLevel)] = {
      ...nextLevelDraft,
      settings: applyLevelInstructionToSettings(nextSettings || {}, instructionState)
    };
  }

  function persistActiveLevelSettingsQuietly() {
    try {
      persistActiveLevelSettings({ allowMissingModule: true });
    } catch {}
  }

  function readLevelTimingSettings(container, fallback = {}) {
    const normalized = normalizeLevelDraft(fallback);
    const input = container?.querySelector("#adminLevelTimePerQ");
    const infiniteButton = container?.querySelector("#adminLevelTimePerQInfinite");
    if (!input) {
      return {
        timePerQ: normalized.timePerQ,
        infiniteTimePerQ: normalized.infiniteTimePerQ
      };
    }
    return {
      timePerQ: readStepper(container, "adminLevelTimePerQ", {
        inputMin: TOOL_LIMITS.timePerQ.min,
        inputMax: TOOL_LIMITS.timePerQ.max
      }),
      infiniteTimePerQ: infiniteButton?.getAttribute("aria-pressed") === "true"
    };
  }

  function readLevelInstructionState(container, fallback = {}) {
    const fallbackState = getLevelInstructionState(fallback);
    const checkbox = container?.querySelector("#adminLevelInstructionEnabled");
    const input = container?.querySelector("#adminLevelInstructionText");
    if (!checkbox || !input) return fallbackState;
    return {
      enabled: checkbox.checked === true,
      text: String(input.value ?? "")
    };
  }

  function getLevelInstructionState(levelDraft = {}) {
    const normalized = normalizeLevelDraft(levelDraft);
    const settings = normalized.settings && typeof normalized.settings === "object" && !Array.isArray(normalized.settings)
      ? normalized.settings
      : {};
    const common = settings.common && typeof settings.common === "object" && !Array.isArray(settings.common)
      ? settings.common
      : {};
    const instruction = common.instruction && typeof common.instruction === "object" && !Array.isArray(common.instruction)
      ? common.instruction
      : {};
    return {
      enabled: instruction.enabled === true,
      text: String(instruction.text ?? "")
    };
  }

  function applyLevelInstructionToSettings(settings = {}, instructionState = {}) {
    const safeSettings = settings && typeof settings === "object" && !Array.isArray(settings)
      ? cloneJson(settings)
      : {};
    const common = safeSettings.common && typeof safeSettings.common === "object" && !Array.isArray(safeSettings.common)
      ? { ...safeSettings.common }
      : {};
    common.instruction = {
      enabled: instructionState.enabled === true,
      text: String(instructionState.text ?? ""),
      hidden: false
    };
    safeSettings.common = common;
    return safeSettings;
  }

  async function saveCurrentActivity() {
    if (!editingActivity || !list) return;
    readEditorFields();
    const message = list.querySelector("#superAdminMessage");
    try {
      persistActiveLevelSettings();
      const activityQuestionCount = getActivityQuestionCount(editingActivity);
      const levels = normalizeLevelsForSave(levelDrafts, { questionCount: activityQuestionCount });
      const activityToSave = {
        ...editingActivity,
        default_question_count: activityQuestionCount,
        id: getStableIdForSave(editingActivity),
        display_order: getDisplayOrderForSave(editingActivity)
      };
      const saved = await saveCatalogActivityAsAdmin?.(buildCatalogActivitySavePayload({
        ...activityToSave,
        title: activityToSave.title || activityToSave.config_name,
        levels_json: levels
      }));
      notifyCatalogueChanged();
      activities = await listCatalogActivitiesForAdmin?.() || activities;
      showToast?.(`Activité “${saved?.config_name || activityToSave.title}” enregistrée.`);
    } catch (err) {
      if (message) message.textContent = err?.message || "Enregistrement impossible.";
    }
  }

  async function testCurrentDraftActivity() {
    if (!editingActivity || !list) return;
    showSuperAdminMessage("");

    try {
      const draftActivity = buildDraftActivityForTest();
      const currentTeacherSpace = getCurrentTeacherSpace?.() || null;
      const accessCode = String(currentTeacherSpace?.access_code || "ADMINTEST").trim().toUpperCase();
      const catalogActivities = [
        draftActivity,
        ...(Array.isArray(activities) ? activities : [])
      ];

      cleanupActiveAdminCatalogTestController();
      activeAdminCatalogTestController = openCatalogTestRunner({
        accessCode,
        activity: draftActivity,
        catalogActivities,
        initialLevel: activeLevel,
        titleLabel: "Test du brouillon",
        onClose: () => {
          activeAdminCatalogTestController = null;
        },
        showToast
      });
    } catch (err) {
      showSuperAdminMessage(err?.message || "Impossible de tester cette activité.", true);
    }
  }

  function buildDraftActivityForTest() {
    readEditorFields();
    persistActiveLevelSettings();

    const toolId = String(editingActivity?.tool_id || "").trim();
    if (!toolId) {
      throw new Error("Sélectionne un outil avant de tester l’activité.");
    }

    const questionCount = getActivityQuestionCount(editingActivity);
    const levels = normalizeLevelsForSave(levelDrafts, { questionCount });
    const title = String(editingActivity?.config_name || editingActivity?.title || "").trim()
      || `Test ${getToolLabel(toolId)}`;
    const activeLevelDraft = normalizeLevelDraft(levelDrafts[String(activeLevel)]);

    return normalizeCatalogActivity({
      ...editingActivity,
      id: "__admin_draft_test__",
      title,
      config_name: title,
      category_id: editingActivity?.category_id || getDefaultAdminActivityFolderId(),
      folder_id: editingActivity?.category_id || getDefaultAdminActivityFolderId(),
      tool_id: toolId,
      description: String(editingActivity?.description || "").trim(),
      default_question_count: questionCount,
      question_count: questionCount,
      difficulty_levels: levels,
      levels_json: levels,
      settings: activeLevelDraft.settings || {},
      status: "draft",
      default_visible: false,
      is_visible: true
    });
  }


  function createAdminDraftRuntimeToken() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function cleanupActiveAdminCatalogTestController() {
    if (activeAdminCatalogTestController?.destroy) {
      try {
        activeAdminCatalogTestController.destroy();
      } catch {}
    }
    activeAdminCatalogTestController = null;
  }

  function notifyCatalogueChanged() {
    try {
      window.dispatchEvent(new CustomEvent("catalogue:changed", {
        detail: { source: "superadmin" }
      }));
    } catch {}
  }


  function getSettingsForLevel(levelKey, tool = null) {
    const normalized = normalizeLevelDraft(levelDrafts[String(levelKey)]);
    if (isPlainObject(normalized.settings) && Object.keys(normalized.settings).length) {
      return cloneJson(normalized.settings);
    }
    return getDefaultToolSettings(tool || activeToolModule?.default || null);
  }

  function getActivityQuestionCount(activity = editingActivity) {
    return clampInt(
      activity?.default_question_count ?? activity?.question_count ?? EXPLORATION_DEFAULTS.questionCount,
      TOOL_LIMITS.questionCount.min,
      TOOL_LIMITS.questionCount.max
    );
  }

  function getDefaultToolSettings(tool = null) {
    if (tool && typeof tool.getDefaultSettings === "function") {
      try {
        return cloneJson(tool.getDefaultSettings() || {});
      } catch {}
    }
    return {};
  }

  function showSuperAdminMessage(message = "", isError = false) {
    const el = header?.querySelector("#superAdminMessage") || list?.querySelector("#superAdminMessage");
    if (!el) return;
    el.textContent = String(message || "");
    el.classList.toggle("is-error", !!isError);
  }

  function showToolMessage(message = "", isError = false) {
    const el = list?.querySelector("#superAdminToolMessage");
    if (!el) return;
    el.textContent = String(message || "");
    el.classList.toggle("is-error", !!isError);
  }

  function getToolLabel(toolId) {
    const tool = tools.find((item) => String(item.id || "") === String(toolId || ""));
    return tool?.label || toolId || "Outil";
  }

  function getTechnicalIdPreview() {
    if (!editingActivity) return "";
    const existingId = String(editingActivity.id || "").trim();
    if (existingId) return existingId;
    const title = String(editingActivity.title || editingActivity.config_name || "").trim();
    const categoryId = String(editingActivity.category_id || "").trim();
    if (!title || !categoryId) return "";
    return buildUniqueCatalogActivityId(categoryId, title);
  }

  function getStableIdForSave(activity) {
    const existingId = String(activity?.id || "").trim();
    if (existingId) return existingId;
    return buildUniqueCatalogActivityId(activity?.category_id, activity?.title || activity?.config_name);
  }

  function buildUniqueCatalogActivityId(categoryId, title) {
    const baseId = buildCatalogActivityId(categoryId, title);
    const usedIds = new Set(
      activities
        .map((activity) => String(activity?.id || "").trim().toLowerCase())
        .filter(Boolean)
    );
    if (!usedIds.has(baseId)) return baseId;

    for (let suffix = 2; suffix < 1000; suffix += 1) {
      const candidate = `${baseId}-${suffix}`;
      if (!usedIds.has(candidate)) return candidate;
    }

    return `${baseId}-${Date.now()}`;
  }

  function getDisplayOrderForSave(activity) {
    const existingId = String(activity?.id || "").trim();
    if (existingId) return normalizeDisplayOrder(activity?.display_order);
    return getNextDisplayOrderForCategory(activity?.category_id);
  }

  function getNextDisplayOrderForCategory(categoryId) {
    const safeCategoryId = String(categoryId || "").trim();
    const maxOrder = activities
      .filter((activity) => String(activity?.category_id || activity?.folder_id || "").trim() === safeCategoryId)
      .reduce((max, activity) => Math.max(max, normalizeDisplayOrder(activity?.display_order)), 0);
    return maxOrder + 10;
  }

  function getDuplicateDisplayOrder(activity) {
    const normalized = normalizeCatalogActivity(activity);
    const rows = sortAdminCategoryActivities(
      activities
        .map(normalizeCatalogActivity)
        .filter((item) => String(item.category_id || "") === String(normalized.category_id || ""))
    );
    const sourceIndex = rows.findIndex((item) => String(item.id) === String(normalized.id));
    const sourceOrder = normalizeDisplayOrder(normalized.display_order);
    const nextOrder = sourceIndex >= 0
      ? normalizeDisplayOrder(rows[sourceIndex + 1]?.display_order)
      : 0;

    if (nextOrder > sourceOrder + 1) {
      return sourceOrder + Math.floor((nextOrder - sourceOrder) / 2);
    }

    return sourceOrder > 0 ? sourceOrder + 1 : getNextDisplayOrderForCategory(normalized.category_id);
  }

  function buildDuplicateActivityTitle(activity) {
    const normalized = normalizeCatalogActivity(activity);
    const baseTitle = `Copie de ${String(normalized.config_name || normalized.title || "activité").trim() || "activité"}`;
    const titles = new Set(
      activities
        .map(normalizeCatalogActivity)
        .filter((item) => String(item.category_id || "") === String(normalized.category_id || ""))
        .map((item) => normalizeCatalogLabel(item.config_name || item.title))
        .filter(Boolean)
    );

    if (!titles.has(normalizeCatalogLabel(baseTitle))) return baseTitle;

    for (let suffix = 2; suffix < 1000; suffix += 1) {
      const candidate = `${baseTitle} ${suffix}`;
      if (!titles.has(normalizeCatalogLabel(candidate))) return candidate;
    }

    return `${baseTitle} ${Date.now()}`;
  }

  function sortAdminActivities(rows = []) {
    return [...(Array.isArray(rows) ? rows : [])]
      .map(normalizeCatalogActivity)
      .sort((a, b) => {
        const byCategory = compareCategoryIds(a.category_id, b.category_id);
        if (byCategory !== 0) return byCategory;
        return compareAdminActivityOrder(a, b);
      });
  }

  function sortAdminCategoryActivities(rows = []) {
    return [...(Array.isArray(rows) ? rows : [])].sort(compareAdminActivityOrder);
  }

  function compareAdminActivityOrder(a, b) {
    const orderA = normalizeDisplayOrder(a?.display_order);
    const orderB = normalizeDisplayOrder(b?.display_order);
    if (orderA !== orderB) return orderA - orderB;
    return String(a?.config_name || a?.title || "").localeCompare(String(b?.config_name || b?.title || ""), "fr", { sensitivity: "base" });
  }

  function compareCategoryIds(a, b) {
    const indexA = getCategoryIndex(a);
    const indexB = getCategoryIndex(b);
    if (indexA !== indexB) return indexA - indexB;
    return String(a || "").localeCompare(String(b || ""), "fr", { sensitivity: "base" });
  }

  function getCategoryIndex(categoryId) {
    const safeId = String(categoryId || "").trim();
    const index = folders.findIndex((folder) => String(folder.id) === safeId);
    return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
  }

  function getCategoryPathLabel(categoryId) {
    const safeId = String(categoryId || "").trim();
    const trail = [];
    let cursor = folders.find((folder) => String(folder.id) === safeId) || null;
    while (cursor) {
      trail.unshift(cursor.name);
      cursor = folders.find((folder) => String(folder.id) === String(cursor?.parent_id || "")) || null;
    }
    return trail.length ? trail.join(" / ") : (safeId || "Sans catégorie");
  }

  function bindAdminDragAndDrop() {
    list?.querySelectorAll("[data-admin-activity-id]").forEach((tile) => {
      tile.addEventListener("dragstart", handleAdminDragStart);
      tile.addEventListener("dragover", handleAdminTileDragOver);
      tile.addEventListener("dragleave", handleAdminDragLeave);
      tile.addEventListener("drop", (event) => {
        void handleAdminTileDrop(event);
      });
      tile.addEventListener("dragend", handleAdminDragEnd);
    });

    list?.querySelectorAll("[data-admin-dropzone]").forEach((dropzone) => {
      dropzone.addEventListener("dragover", handleAdminDropzoneDragOver);
      dropzone.addEventListener("dragleave", handleAdminDropzoneDragLeave);
      dropzone.addEventListener("drop", (event) => {
        void handleAdminDropzoneDrop(event);
      });
    });
  }

  function handleAdminDragStart(event) {
    const tile = event.currentTarget;
    if (event.target?.closest?.(".dashboard-activity-tile-actions")) {
      event.preventDefault();
      return;
    }
    draggedAdminActivityId = String(tile.dataset.adminActivityId || "").trim();
    draggedAdminCategoryId = String(tile.dataset.adminCategoryId || "").trim();
    if (!draggedAdminActivityId || !draggedAdminCategoryId) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedAdminActivityId);
    tile.classList.add("is-admin-dragging");
  }

  function handleAdminTileDragOver(event) {
    const tile = event.currentTarget;
    if (!canDropAdminActivity(tile.dataset.adminCategoryId)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    clearAdminDropMarkers();
    tile.classList.add(getAdminDropPlacement(event, tile) === "after" ? "is-admin-drop-after" : "is-admin-drop-before");
  }

  function handleAdminDragLeave(event) {
    event.currentTarget.classList.remove("is-admin-drop-before", "is-admin-drop-after");
  }

  async function handleAdminTileDrop(event) {
    const tile = event.currentTarget;
    if (!canDropAdminActivity(tile.dataset.adminCategoryId)) return;
    event.preventDefault();
    event.stopPropagation();
    const placement = getAdminDropPlacement(event, tile);
    clearAdminDropMarkers();
    await reorderAdminCategory(
      tile.dataset.adminCategoryId,
      draggedAdminActivityId,
      tile.dataset.adminActivityId,
      placement === "after"
    );
  }

  function handleAdminDropzoneDragOver(event) {
    const dropzone = event.currentTarget;
    if (!canDropAdminActivity(dropzone.dataset.adminCategoryId)) return;
    if (event.target?.closest?.("[data-admin-activity-id]")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    dropzone.classList.add("is-admin-dropzone-active");
  }

  function handleAdminDropzoneDragLeave(event) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    event.currentTarget.classList.remove("is-admin-dropzone-active");
  }

  async function handleAdminDropzoneDrop(event) {
    const dropzone = event.currentTarget;
    if (!canDropAdminActivity(dropzone.dataset.adminCategoryId)) return;
    if (event.target?.closest?.("[data-admin-activity-id]")) return;
    event.preventDefault();
    clearAdminDropMarkers();
    await reorderAdminCategory(dropzone.dataset.adminCategoryId, draggedAdminActivityId, "", true);
  }

  function handleAdminDragEnd() {
    draggedAdminActivityId = "";
    draggedAdminCategoryId = "";
    clearAdminDropMarkers();
  }

  function canDropAdminActivity(categoryId) {
    return !!draggedAdminActivityId && String(categoryId || "").trim() === draggedAdminCategoryId;
  }

  function getAdminDropPlacement(event, tile) {
    const rect = tile.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    if (Math.abs(event.clientY - centerY) < rect.height * 0.35) {
      return event.clientX > centerX ? "after" : "before";
    }
    return event.clientY > centerY ? "after" : "before";
  }

  function clearAdminDropMarkers() {
    list?.querySelectorAll(".is-admin-drop-before, .is-admin-drop-after, .is-admin-dropzone-active")
      .forEach((node) => node.classList.remove("is-admin-drop-before", "is-admin-drop-after", "is-admin-dropzone-active"));
  }

  async function reorderAdminCategory(categoryId, sourceId, targetId = "", placeAfter = true) {
    const safeCategoryId = String(categoryId || "").trim();
    const safeSourceId = String(sourceId || "").trim();
    const safeTargetId = String(targetId || "").trim();
    if (!safeCategoryId || !safeSourceId || safeSourceId === safeTargetId) return;

    const currentRows = sortAdminCategoryActivities(
      activities
        .map(normalizeCatalogActivity)
        .filter((activity) => String(activity.category_id || "") === safeCategoryId)
    );
    const moving = currentRows.find((activity) => String(activity.id) === safeSourceId);
    if (!moving) return;

    const nextRows = currentRows.filter((activity) => String(activity.id) !== safeSourceId);
    let insertIndex = nextRows.length;
    if (safeTargetId) {
      const targetIndex = nextRows.findIndex((activity) => String(activity.id) === safeTargetId);
      if (targetIndex >= 0) insertIndex = targetIndex + (placeAfter ? 1 : 0);
    }
    nextRows.splice(insertIndex, 0, moving);

    const previousIds = currentRows.map((activity) => String(activity.id)).join("|");
    const nextIds = nextRows.map((activity) => String(activity.id)).join("|");
    if (previousIds === nextIds) return;

    const reorderedRows = nextRows.map((activity, index) => ({
      ...activity,
      display_order: (index + 1) * 10
    }));
    const previousActivities = activities;
    activities = mergeAdminActivities(activities, reorderedRows);

    try {
      if (typeof saveCatalogActivityAsAdmin !== "function") {
        throw new Error("Sauvegarde Admin indisponible.");
      }
      await Promise.all(reorderedRows.map((activity) => saveCatalogActivityAsAdmin(buildCatalogActivitySavePayload(activity))));
      notifyCatalogueChanged();
      activities = await listCatalogActivitiesForAdmin?.() || activities;
      showToast?.("Ordre du Catalogue enregistré.");
    } catch (err) {
      try {
        activities = await listCatalogActivitiesForAdmin?.() || previousActivities;
      } catch {
        activities = previousActivities;
      }
      showToast?.(err?.message || "Impossible d’enregistrer le nouvel ordre.");
    }
  }

  function mergeAdminActivities(sourceRows, updatedRows) {
    const updatedById = new Map(updatedRows.map((activity) => [String(activity.id), activity]));
    return sortAdminActivities(sourceRows.map((activity) => updatedById.get(String(activity.id)) || activity));
  }

  function buildCatalogActivitySavePayload(activity) {
    return {
      ...activity,
      title: activity?.title || activity?.config_name,
      levels_json: isPlainObject(activity?.levels_json)
        ? activity.levels_json
        : normalizeLevelsForSave(activity?.difficulty_levels)
    };
  }



  return {
    setCatalogueState,
    renderHeaderActions,
    bindHeaderActions,
    getActivityTileEnhancement,
    getDropzoneAttributes,
    bindCatalogueEvents,
    openEditor
  };
}

function normalizeLevelDraft(value) {
  const fallback = makeDefaultLevelDraft();
  if (!isPlainObject(value)) return fallback;
  let settings = isPlainObject(value.settings)
    ? value.settings
    : (isPlainObject(value.tool_settings) ? value.tool_settings : null);
  // Tolérance de migration : si un ancien niveau contenait directement les réglages,
  // on les replace dans settings sans y mélanger les clés communes du niveau.
  if (!settings) {
    const directSettings = { ...value };
    delete directSettings.timePerQ;
    delete directSettings.infiniteTimePerQ;
    delete directSettings.tool_settings;
    delete directSettings.settings;
    settings = directSettings;
  }
  return {
    ...value,
    timePerQ: clampInt(value.timePerQ, TOOL_LIMITS.timePerQ.min, TOOL_LIMITS.timePerQ.max),
    infiniteTimePerQ: value.infiniteTimePerQ == null
      ? EXPLORATION_DEFAULTS.infiniteTimePerQ === true
      : value.infiniteTimePerQ === true,
    settings: cloneJson(settings)
  };
}

function makeDefaultLevelDraft() {
  return {
    timePerQ: EXPLORATION_DEFAULTS.timePerQ,
    infiniteTimePerQ: EXPLORATION_DEFAULTS.infiniteTimePerQ === true,
    settings: {}
  };
}

function normalizeLevelsForSave(levels, { questionCount = EXPLORATION_DEFAULTS.questionCount } = {}) {
  const normalizedLevels = CATALOG_LEVELS.reduce((acc, level) => {
    const key = String(level.level);
    acc[key] = normalizeLevelDraft(levels?.[key]);
    return acc;
  }, {});
  normalizedLevels.__activity = {
    questionCount: clampInt(questionCount, TOOL_LIMITS.questionCount.min, TOOL_LIMITS.questionCount.max)
  };
  return normalizedLevels;
}

function getLevelLabel(levelKey) {
  const key = String(levelKey);
  const meta = CATALOG_LEVELS.find((level) => String(level.level) === key);
  return ADMIN_LEVEL_LABELS[key] || meta?.label || "Standard";
}

function clampLevelKey(value) {
  const key = String(Math.max(1, Math.min(5, Math.trunc(Number(value) || 3))));
  return CATALOG_LEVELS.some((level) => String(level.level) === key) ? key : LEVEL_START;
}

function slugify(value, fallback = "activite") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

function buildCatalogActivityId(categoryId, title) {
  const categoryKey = String(categoryId || "")
    .trim()
    .split(".")
    .map((part) => slugify(part, ""))
    .filter(Boolean)
    .join(".") || "catalogue";
  return `${categoryKey}.${slugify(title)}`.toLowerCase();
}

function normalizeDisplayOrder(value) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizeCatalogLabel(value) {
  return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function cssEscape(value) {
  if (globalThis.CSS && typeof globalThis.CSS.escape === "function") {
    return globalThis.CSS.escape(String(value));
  }
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\$&");
}
