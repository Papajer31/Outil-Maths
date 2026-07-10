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
import { createQuestionBanksViewController } from "./question-banks-view.js";
import { openCatalogTestRunner } from "./catalog-test-runner.js";

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
    toolIds: ["question-reponse", "qcm", "selection", "flash-texte", "flash-qcm"]
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

const ADMIN_SECTION_META = Object.freeze({
  catalogue: {
    label: "Catalogue",
    title: "Admin - Catalogue",
    subtitle: "Activités système prêtes à l’emploi, rangées comme dans le Catalogue enseignant."
  },
  ressources: {
    label: "Ressources",
    title: "Admin - Ressources",
    subtitle: "Mots, images et contenus bruts utilisés par les outils."
  },
  banques: {
    label: "Banques",
    title: "Admin - Banques",
    subtitle: "Banques système proposées à tous les enseignants."
  }
});

export function createSuperAdminViewController({
  view,
  header,
  list,
  getIsSuperAdmin,
  getCurrentTeacherSpace,
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
  showToast
} = {}) {
  const folders = getCatalogFolders();
  const tools = getActiveToolsRegistry();
  let isAdmin = false;
  let activities = [];
  let vocabularyWords = [];
  let encodingResources = { assets: [], words: [] };
  let systemBanks = [];
  let adminSection = "catalogue";
  let adminCatalogueFolderId = null;
  let resourceSection = "vocabulary";
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
  let systemBanksController = null;
  const toolCollapsibleStateByTool = new Map();

  async function refresh({ forceRefresh = false } = {}) {
    if (!view || !header || !list) return;
    header.innerHTML = renderHeader();
    if (!forceRefresh && activities.length) {
      await renderList();
      return;
    }
    list.innerHTML = `<div class="dashboard-activity-empty-state">Chargement de l’Admin…</div>`;
    try {
      isAdmin = await getIsSuperAdmin?.() === true;
      if (!isAdmin) {
        list.innerHTML = `<div class="dashboard-activity-empty-state">Cet espace est réservé à l’Admin système.</div>`;
        bindHeader();
        return;
      }
      activities = await listCatalogActivitiesForAdmin?.() || [];
      await renderList();
      bindHeader();
    } catch (err) {
      list.innerHTML = `<div class="dashboard-activity-empty-state">${escapeHtml(err?.message || "Impossible de charger l’Admin.")}</div>`;
      bindHeader();
    }
  }

  function renderHeader() {
    const isCatalogue = adminSection === "catalogue";
    const isBanks = adminSection === "banques";
    const meta = getAdminSectionMeta(adminSection);
    return `
      <div class="dashboard-config-header-main">
        <div>
          <div class="dashboard-section-title">${escapeHtml(meta.title)}</div>
          <div class="dashboard-section-subtitle">${escapeHtml(meta.subtitle)}</div>
        </div>
        ${isBanks ? renderAdminBankTypeFilter() : ""}
      </div>
      <div class="dashboard-config-header-center">
        <div class="dashboard-view-toggle super-admin-main-toggle" role="group" aria-label="Section Admin">
          ${renderAdminSectionButton("catalogue", ADMIN_SECTION_META.catalogue.label)}
          ${renderAdminSectionButton("ressources", ADMIN_SECTION_META.ressources.label)}
          ${renderAdminSectionButton("banques", ADMIN_SECTION_META.banques.label)}
        </div>
      </div>
      <div class="dashboard-config-header-actions">
        <button id="btnOpenViewportTestBench" class="btn" type="button" title="Ouvrir le banc de test du runtime élève dans un nouvel onglet">
          <span class="dashboard-material-icon" aria-hidden="true">devices</span>
          <span>Banc runtime</span>
        </button>
        ${isCatalogue ? `
          <button id="btnAdminNewCatalogActivity" class="btn primary" type="button">
            <span class="dashboard-material-icon" aria-hidden="true">add</span>
            <span>Créer une activité</span>
          </button>
        ` : ""}
        ${isBanks ? renderAdminBankHeaderActions() : ""}
      </div>
    `;
  }

  function getAdminSectionMeta(section) {
    return ADMIN_SECTION_META[section] || ADMIN_SECTION_META.catalogue;
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

  function renderAdminBankTypeFilter() {
    return `
      <div id="adminBankExplorerControls" class="super-admin-bank-header-controls">
        <div class="dashboard-mode-pill" role="tablist" aria-label="Type de banque courant">
          <button class="dashboard-mode-pill-btn is-active" type="button" role="tab" data-bank-type-filter="all" aria-selected="true" title="Afficher toutes les banques">Tous</button>
          <button class="dashboard-mode-pill-btn" type="button" role="tab" data-bank-type-filter="text_answer" aria-selected="false" title="Afficher les banques texte">Texte</button>
          <button class="dashboard-mode-pill-btn" type="button" role="tab" data-bank-type-filter="qcm" aria-selected="false" title="Afficher les banques QCM">QCM</button>
          <button class="dashboard-mode-pill-btn" type="button" role="tab" data-bank-type-filter="selection" aria-selected="false" title="Afficher les banques Sélection">Sélection</button>
        </div>
      </div>
    `;
  }

  function renderAdminBankHeaderActions() {
    return `
      <button id="btnCreateBankFolder" class="dashboard-icon-btn dashboard-material-icon-btn" type="button" title="Les dossiers de banques système ne sont pas encore disponibles" aria-label="Créer un dossier" disabled>
        <span class="dashboard-material-icon" aria-hidden="true">create_new_folder</span>
      </button>
      <button id="btnCreateBank" class="btn primary" type="button">
        <span class="dashboard-material-icon" aria-hidden="true">add</span>
        <span>Créer une banque</span>
      </button>
    `;
  }

  function renderAdminSectionButton(section, label) {
    const active = adminSection === section;
    return `<button class="dashboard-view-toggle-btn${active ? " is-active" : ""}" type="button" data-admin-section="${escapeAttr(section)}" aria-pressed="${active ? "true" : "false"}">${escapeHtml(label)}</button>`;
  }

  function bindHeader() {
    header?.querySelectorAll("[data-admin-section]").forEach((button) => {
      button.addEventListener("click", () => {
        const next = String(button.dataset.adminSection || "catalogue");
        if (next === adminSection) return;
        adminSection = ["catalogue", "ressources", "banques"].includes(next) ? next : "catalogue";
        renderList({ forceReload: true });
      });
    });
    header?.querySelector("#btnOpenViewportTestBench")?.addEventListener("click", openViewportTestBench);
    header?.querySelector("#btnAdminNewCatalogActivity")?.addEventListener("click", () => {
      if (!isAdmin) return;
      openEditor();
    });
  }

  async function renderList({ forceReload = false } = {}) {
    if (!list) return;
    cleanupActiveAdminCatalogTestController();
    descriptionPanelOpen = false;
    if (adminSection !== "banques") {
      destroySystemBanksController();
    }
    if (header) {
      header.innerHTML = renderHeader();
      bindHeader();
    }
    list.classList.add("dashboard-explorer-host");
    list.classList.remove("super-admin-editor-scroll");
    list.classList.remove("super-admin-banks-list-host");
    if (!isAdmin) {
      list.innerHTML = `<div class="dashboard-activity-empty-state">Cet espace est réservé à l’Admin système.</div>`;
      return;
    }
    if (adminSection === "ressources") {
      await renderResourcesSection({ forceReload });
      return;
    }
    if (adminSection === "banques") {
      await renderSystemBanksSection({ forceReload });
      return;
    }
    renderCatalogueSection();
  }

  function renderCatalogueSection() {
    const selectedFolder = getAdminFolderById(adminCatalogueFolderId);
    if (adminCatalogueFolderId && !selectedFolder) {
      adminCatalogueFolderId = null;
    }
    const openedFolder = selectedFolder || null;
    const openedFolderId = String(openedFolder?.id || "");
    const openedPathLabel = openedFolder ? getCategoryPathLabel(openedFolderId) : "Racine du catalogue";
    const childFolders = getAdminChildFolders(openedFolderId);
    const childActivities = getAdminActivitiesForFolder(openedFolderId);
    const rootFolders = getAdminChildFolders("");
    const tilesHtml = [
      renderAdminParentTile(openedFolder),
      ...childFolders.map(renderAdminFolderTile),
      ...childActivities.map(renderActivityTile)
    ].filter(Boolean).join("");

    list.innerHTML = `
      <div class="dashboard-activities-explorer dashboard-admin-explorer" style="--dashboard-tree-pane-width:18%;">
        <aside class="dashboard-activity-tree-pane panel">
          <div class="dashboard-activity-tree-list">
            <div class="dashboard-activity-tree-row dashboard-activity-tree-root ${openedFolder ? "" : "is-selected"}">
              <button class="dashboard-activity-tree-main dashboard-activity-tree-main--root" type="button" data-action="open-admin-root">
                <span class="dashboard-material-icon dashboard-activity-tree-node-icon" aria-hidden="true">travel_explore</span>
                <span class="dashboard-activity-tree-node-label">Catalogue</span>
              </button>
            </div>
            ${rootFolders.map((folder) => renderAdminTreeFolder(folder, 0)).join("")}
          </div>
        </aside>
        <div class="dashboard-activity-splitter" role="separator" aria-orientation="vertical" aria-label="Séparateur entre les panneaux"></div>
        <section class="dashboard-activity-tiles-pane panel dashboard-admin-tiles-pane">
          <div class="dashboard-admin-catalogue-panel-head">
            <div>
              <div class="dashboard-section-title">${escapeHtml(openedFolder?.name || "Catalogue")}</div>
              <div class="dashboard-section-subtitle">${escapeHtml(openedPathLabel)}</div>
            </div>
            <div class="dashboard-admin-catalogue-stats" aria-label="Contenu du dossier">
              <span class="dashboard-mini-pill">${childFolders.length} dossier${childFolders.length > 1 ? "s" : ""}</span>
              <span class="dashboard-mini-pill">${childActivities.length} activité${childActivities.length > 1 ? "s" : ""}</span>
            </div>
          </div>
          <div class="dashboard-activity-tiles-grid-wrap">
            <div class="dashboard-activity-tiles-grid dashboard-admin-catalogue-grid" data-admin-dropzone="true" data-admin-category-id="${escapeAttr(openedFolderId)}">
              ${tilesHtml || `<div class="dashboard-activity-empty-state">Aucune activité dans ce dossier.</div>`}
            </div>
          </div>
        </section>
      </div>
    `;
    bindListEvents();
  }

  function renderAdminTreeFolder(folder, depth = 0) {
    const selected = String(adminCatalogueFolderId || "") === String(folder.id || "");
    return `
      <div class="dashboard-activity-tree-row dashboard-tree-node ${selected ? "is-selected" : ""}" style="--dashboard-tree-depth:${depth};">
        <div class="dashboard-tree-indent" aria-hidden="true"></div>
        <span class="dashboard-tree-toggle-placeholder" aria-hidden="true"></span>
        <button class="dashboard-activity-tree-main" type="button" data-action="open-admin-folder" data-folder-id="${escapeAttr(folder.id)}">
          <span class="dashboard-material-icon dashboard-activity-tree-node-icon" aria-hidden="true">folder</span>
          <span class="dashboard-activity-tree-node-label">${escapeHtml(folder.name)}</span>
        </button>
      </div>
      ${getAdminChildFolders(folder.id).map((child) => renderAdminTreeFolder(child, depth + 1)).join("")}
    `;
  }

  function renderAdminFolderTile(folder) {
    return `
      <article class="dashboard-activity-tile dashboard-activity-tile--folder dashboard-activity-tile--catalog-folder">
        <button class="dashboard-activity-tile-surface dashboard-activity-tile-surface--folder" type="button" data-action="open-admin-folder" data-folder-id="${escapeAttr(folder.id)}">
          <span class="dashboard-material-icon dashboard-activity-tile-icon" aria-hidden="true">folder</span>
          <span class="dashboard-activity-tile-labelbox">
            <span class="dashboard-activity-tile-title">${escapeHtml(folder.name)}</span>
          </span>
        </button>
      </article>
    `;
  }

  function renderAdminParentTile(selectedFolder) {
    if (!selectedFolder) return "";
    const parentId = String(selectedFolder.parent_id || "");
    return `
      <article class="dashboard-activity-tile dashboard-activity-tile--folder dashboard-activity-tile--catalog-folder dashboard-activity-tile--parent">
        <button class="dashboard-activity-tile-surface dashboard-activity-tile-surface--folder" type="button" data-action="${parentId ? "open-admin-folder" : "open-admin-root"}" ${parentId ? `data-folder-id="${escapeAttr(parentId)}"` : ""}>
          <span class="dashboard-material-icon dashboard-activity-tile-icon" aria-hidden="true">arrow_upward</span>
          <span class="dashboard-activity-tile-labelbox">
            <span class="dashboard-activity-tile-title">Dossier parent</span>
          </span>
        </button>
      </article>
    `;
  }

  function renderActivityTile(activity) {
    const normalized = normalizeCatalogActivity(activity);
    const isPublished = normalized.status === "published";
    const statusLabel = isPublished ? "Publié" : "Brouillon";
    return `
      <article
        class="dashboard-activity-tile dashboard-activity-tile--activity dashboard-activity-tile--catalog-activity dashboard-admin-activity-tile ${isPublished ? "is-highlighted" : "is-draft"}"
        draggable="true"
        data-admin-activity-id="${escapeAttr(normalized.id)}"
        data-admin-category-id="${escapeAttr(normalized.category_id || "")}"
        title="Glisser pour réordonner dans cette catégorie"
      >
        <button class="dashboard-activity-tile-surface dashboard-activity-tile-surface--activity" type="button" data-action="edit-admin-activity" data-activity-id="${escapeAttr(normalized.id)}">
          <span class="dashboard-material-icon dashboard-activity-tile-icon" aria-hidden="true">extension</span>
          <span class="dashboard-activity-tile-labelbox dashboard-activity-tile-labelbox--activity">
            <span class="dashboard-activity-tile-title">${escapeHtml(normalized.config_name)}</span>
            <span class="dashboard-activity-tile-subtitle">${escapeHtml(getToolLabel(normalized.tool_id))} · ${escapeHtml(statusLabel)}</span>
          </span>
        </button>
        <div class="dashboard-activity-tile-actions dashboard-activity-tile-actions--activity">
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="duplicate-admin-activity" data-activity-id="${escapeAttr(normalized.id)}" title="Dupliquer"><span class="dashboard-material-icon" aria-hidden="true">content_copy</span></button>
          <button class="dashboard-icon-btn dashboard-material-icon-btn is-danger" type="button" data-action="delete-admin-activity" data-activity-id="${escapeAttr(normalized.id)}" title="Supprimer définitivement"><span class="dashboard-material-icon" aria-hidden="true">delete</span></button>
        </div>
      </article>
    `;
  }

  function bindListEvents() {
    list?.querySelectorAll("[data-action='open-admin-root']").forEach((btn) => btn.addEventListener("click", () => {
      adminCatalogueFolderId = null;
      renderCatalogueSection();
    }));
    list?.querySelectorAll("[data-action='open-admin-folder']").forEach((btn) => btn.addEventListener("click", () => {
      adminCatalogueFolderId = String(btn.dataset.folderId || "").trim() || null;
      renderCatalogueSection();
    }));
    list?.querySelectorAll("[data-action='edit-admin-activity']").forEach((btn) => btn.addEventListener("click", () => {
      const activity = activities.find((item) => item.id === btn.dataset.activityId);
      openEditor(activity);
    }));
    list?.querySelectorAll("[data-action='duplicate-admin-activity']").forEach((btn) => btn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const activity = activities.find((item) => String(item.id) === String(btn.dataset.activityId || ""));
      if (!activity) return;
      await duplicateCatalogActivity(activity);
    }));
    list?.querySelectorAll("[data-action='delete-admin-activity']").forEach((btn) => btn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const activity = activities.find((item) => String(item.id) === String(btn.dataset.activityId || ""));
      if (!activity) return;
      await confirmAndDeleteCatalogActivity(activity);
    }));
    bindAdminDragAndDrop();
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

  function getAdminActivitiesForFolder(folderId) {
    const safeFolderId = String(folderId || "").trim();
    if (!safeFolderId) return [];
    return sortAdminCategoryActivities(
      activities
        .map(normalizeCatalogActivity)
        .filter((activity) => String(activity.category_id || "").trim() === safeFolderId)
    );
  }

  function canHostAdminActivity(folder) {
    if (!folder?.id) return false;
    if (String(folder.parent_id || "").trim()) return true;
    return getAdminChildFolders(folder.id).length === 0;
  }

  function compareAdminFolderOrder(a, b) {
    const orderA = normalizeDisplayOrder(a?.display_order);
    const orderB = normalizeDisplayOrder(b?.display_order);
    if (orderA !== orderB) return orderA - orderB;
    return String(a?.name || "").localeCompare(String(b?.name || ""), "fr", { sensitivity: "base" });
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
      activities = await listCatalogActivitiesForAdmin?.() || [];
      renderList({ forceReload: false });
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
      renderList({ forceReload: false });
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
          <button class="btn cfg-back-btn super-admin-editor-back" type="button" data-action="back-admin-list" aria-label="Retour à l’Admin">↩</button>
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
        <button class="btn" type="button" data-action="open-viewport-test-bench" title="Ouvrir le banc de test des résolutions"><span class="dashboard-material-icon" aria-hidden="true">devices</span><span>Banc runtime</span></button>
        <button class="btn" type="button" data-action="test-admin-draft-activity">Tester ainsi</button>
        <button class="btn cfg-save-btn dirty" type="button" data-action="save-admin-activity">Enregistrer</button>
      </div>
    `;
  }

  function bindEditorHeader() {
    header?.querySelector("[data-action='back-admin-list']")?.addEventListener("click", () => renderList());
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
      const url = new URL("../dev/viewport-test.html", window.location.href);
      const opened = window.open(url.href, "_blank", "noopener");
      if (!opened) {
        showToast?.("Le navigateur a bloqué l’ouverture du banc de test.", { isError: true });
      }
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
    list?.querySelector("[data-action='back-admin-list']")?.addEventListener("click", () => renderList());
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
    const defaultInstruction = String(tool?.defaultInstruction || "").trim();
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
      activities = await listCatalogActivitiesForAdmin?.() || [];
      showToast?.(`Activité “${saved?.config_name || activityToSave.title}” enregistrée.`);
      renderList();
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

  function getAdminActivityGroups() {
    const groupsByCategory = new Map();
    sortAdminActivities(activities).forEach((activity) => {
      const normalized = normalizeCatalogActivity(activity);
      const categoryId = String(normalized.category_id || "").trim();
      if (!groupsByCategory.has(categoryId)) {
        groupsByCategory.set(categoryId, []);
      }
      groupsByCategory.get(categoryId).push(normalized);
    });

    return [...groupsByCategory.entries()]
      .map(([categoryId, rows]) => ({
        categoryId,
        label: getCategoryPathLabel(categoryId),
        activities: sortAdminCategoryActivities(rows)
      }))
      .sort((a, b) => compareCategoryIds(a.categoryId, b.categoryId));
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
    renderList();

    try {
      if (typeof saveCatalogActivityAsAdmin !== "function") {
        throw new Error("Sauvegarde Admin indisponible.");
      }
      await Promise.all(reorderedRows.map((activity) => saveCatalogActivityAsAdmin(buildCatalogActivitySavePayload(activity))));
      notifyCatalogueChanged();
      activities = await listCatalogActivitiesForAdmin?.() || activities;
      renderList();
      showToast?.("Ordre du Catalogue enregistré.");
    } catch (err) {
      try {
        activities = await listCatalogActivitiesForAdmin?.() || previousActivities;
      } catch {
        activities = previousActivities;
      }
      renderList();
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


  async function renderResourcesSection({ forceReload = false } = {}) {
    if (resourceSection === "encoding") {
      await renderEncodingResources({ forceReload });
      return;
    }
    await renderVocabularyResources({ forceReload });
  }

  function renderResourcesShell(bodyHtml) {
    const meta = ADMIN_SECTION_META.ressources;
    list.innerHTML = `
      <div class="super-admin-section-shell">
        <div class="panel super-admin-section-panel">
          <div class="super-admin-section-head">
            <div>
              <div class="dashboard-section-title">${escapeHtml(meta.label)}</div>
              <div class="dashboard-section-subtitle">${escapeHtml(meta.subtitle)}</div>
            </div>
            <div class="dashboard-view-toggle" role="group" aria-label="Type de ressource">
              <button class="dashboard-view-toggle-btn${resourceSection === "vocabulary" ? " is-active" : ""}" type="button" data-resource-section="vocabulary">Vocabulaire</button>
              <button class="dashboard-view-toggle-btn${resourceSection === "encoding" ? " is-active" : ""}" type="button" data-resource-section="encoding">Encodage</button>
            </div>
          </div>
          ${bodyHtml}
        </div>
      </div>
    `;
    list.querySelectorAll("[data-resource-section]").forEach((button) => {
      button.addEventListener("click", () => {
        resourceSection = button.dataset.resourceSection === "encoding" ? "encoding" : "vocabulary";
        renderList({ forceReload: true });
      });
    });
  }

  function parseVocabularyImportText(rawText, existingWordsList = []) {
    const existingWords = new Set(
      (Array.isArray(existingWordsList) ? existingWordsList : [])
        .map((item) => String(item?.word || "").trim())
        .filter(Boolean)
    );
    const importedByWord = new Map();
    const importedOrder = [];
    const errors = [];
    let ignoredLines = 0;
    let duplicateLines = 0;

    String(rawText || "")
      .replace(/\r/g, "")
      .split("\n")
      .forEach((rawLine, index) => {
        const lineNumber = index + 1;
        const line = String(rawLine || "").trim();
        if (!line || line.startsWith("#")) {
          ignoredLines += 1;
          return;
        }

        const columns = line.split("|").map((part) => part.trim());
        if (columns.length > 2) {
          errors.push(`Ligne ${lineNumber} : format attendu mot|page.`);
          return;
        }

        const word = columns[0] || "";
        const pageText = columns.length > 1 ? columns[1] : "";
        if (!word) {
          errors.push(`Ligne ${lineNumber} : mot manquant.`);
          return;
        }

        let dictionaryPage = null;
        if (pageText) {
          if (!/^[1-9]\d*$/.test(pageText)) {
            errors.push(`Ligne ${lineNumber} : page invalide “${pageText}”.`);
            return;
          }
          dictionaryPage = Number.parseInt(pageText, 10);
        }

        const item = { word, dictionary_page: dictionaryPage, lineNumber };
        if (importedByWord.has(word)) {
          duplicateLines += 1;
          importedByWord.set(word, item);
          return;
        }
        importedByWord.set(word, item);
        importedOrder.push(word);
      });

    const items = importedOrder.map((word) => importedByWord.get(word)).filter(Boolean);
    const updateCount = items.filter((item) => existingWords.has(item.word)).length;
    const createCount = Math.max(0, items.length - updateCount);

    return {
      items,
      errors,
      ignoredLines,
      duplicateLines,
      createCount,
      updateCount
    };
  }

  function renderVocabularyImportPreview(target, analysis) {
    if (!target) return;
    const safeAnalysis = analysis || parseVocabularyImportText("", vocabularyWords);
    const hasContent = safeAnalysis.items.length || safeAnalysis.errors.length || safeAnalysis.duplicateLines;
    if (!hasContent) {
      target.innerHTML = `<div class="super-admin-import-muted">Colle une liste au format <strong>mot|page</strong>, puis lance l’analyse.</div>`;
      return;
    }

    const rows = safeAnalysis.items.slice(0, 6).map((item, index) => `
      <div class="super-admin-vocab-import-row">
        <span>${index + 1}</span>
        <strong>${escapeHtml(item.word)}</strong>
        <em>${item.dictionary_page ? `p. ${escapeHtml(item.dictionary_page)}` : "page non renseignée"}</em>
      </div>
    `).join("");
    const moreCount = safeAnalysis.items.length - 6;
    const more = moreCount > 0
      ? `<div class="super-admin-import-muted">+ ${moreCount} autre${moreCount > 1 ? "s" : ""} mot${moreCount > 1 ? "s" : ""}</div>`
      : "";
    const warnings = safeAnalysis.duplicateLines
      ? `<div class="super-admin-import-warning">${safeAnalysis.duplicateLines} doublon${safeAnalysis.duplicateLines > 1 ? "s" : ""} dans le collage : la dernière ligne est conservée.</div>`
      : "";
    const errorMarkup = safeAnalysis.errors.length
      ? `<div class="super-admin-import-errors">${safeAnalysis.errors.slice(0, 5).map(escapeHtml).join("<br>")}${safeAnalysis.errors.length > 5 ? "<br>…" : ""}</div>`
      : "";

    target.innerHTML = `
      <div class="super-admin-import-summary">
        <strong>${safeAnalysis.items.length}</strong> mot${safeAnalysis.items.length > 1 ? "s" : ""} valide${safeAnalysis.items.length > 1 ? "s" : ""}
        · <strong>${safeAnalysis.createCount}</strong> création${safeAnalysis.createCount > 1 ? "s" : ""}
        · <strong>${safeAnalysis.updateCount}</strong> mise${safeAnalysis.updateCount > 1 ? "s" : ""} à jour
      </div>
      ${rows}
      ${more}
      ${warnings}
      ${errorMarkup}
    `;
  }

  async function renderVocabularyResources({ forceReload = false } = {}) {
    if (forceReload || !vocabularyWords.length) {
      list.innerHTML = `<div class="dashboard-activity-empty-state">Chargement du vocabulaire…</div>`;
      vocabularyWords = await listDefaultVocabularyWordsAsAdmin?.() || [];
    }
    renderResourcesShell(`
      <div class="super-admin-resource-grid super-admin-resource-grid--vocabulary">
        <div class="super-admin-resource-stack">
          <form class="super-admin-resource-form" data-action="save-vocab-word">
            <div class="cfg-panel-title">Ajouter / modifier un mot</div>
            <label class="super-admin-field-stack">
              <span class="super-admin-field-label">Mot</span>
              <input class="modal-text-input" name="word" type="text" placeholder="ex. maison" autocomplete="off">
            </label>
            <label class="super-admin-field-stack">
              <span class="super-admin-field-label">Page dictionnaire</span>
              <input class="modal-text-input" name="dictionary_page" type="number" min="1" step="1" placeholder="Optionnel">
            </label>
            <button class="btn primary" type="submit">Enregistrer le mot</button>
            <div class="modal-message" id="adminVocabMessage"></div>
          </form>

          <section class="super-admin-resource-form" data-vocab-import-panel>
            <div class="cfg-panel-title">Import en masse</div>
            <div class="dashboard-section-subtitle">Une ligne par mot. Format : <strong>mot|page</strong>. La page est facultative.</div>
            <textarea class="super-admin-vocab-import-input" id="adminVocabImportInput" spellcheck="false" placeholder="abeille|1&#10;absent|2&#10;accent|3&#10;douter|191"></textarea>
            <div class="super-admin-import-actions">
              <button class="btn" type="button" data-action="analyze-vocab-import">Analyser</button>
              <button class="btn primary" type="button" data-action="import-vocab-bulk">Importer</button>
            </div>
            <div class="super-admin-vocab-import-preview" id="adminVocabImportPreview">
              <div class="super-admin-import-muted">Colle une liste au format <strong>mot|page</strong>, puis lance l’analyse.</div>
            </div>
            <div class="modal-message" id="adminVocabImportMessage"></div>
          </section>
        </div>

        <div class="super-admin-resource-list">
          <div class="super-admin-resource-list-head">
            <div class="cfg-panel-title">Liste de vocabulaire</div>
            <span class="dashboard-mini-pill">${vocabularyWords.length} mot${vocabularyWords.length > 1 ? "s" : ""}</span>
          </div>
          <div class="super-admin-resource-items">
            ${vocabularyWords.map((word) => `
              <article class="super-admin-resource-row" data-vocab-id="${escapeAttr(word.id)}">
                <div>
                  <strong>${escapeHtml(word.word)}</strong>
                  <span>${word.dictionary_page ? `p. ${escapeHtml(word.dictionary_page)}` : "page non renseignée"}</span>
                </div>
                <div class="super-admin-resource-row-actions">
                  <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="edit-vocab-word" data-word="${escapeAttr(word.word)}" data-page="${escapeAttr(word.dictionary_page || "")}" title="Reprendre"><span class="dashboard-material-icon">edit</span></button>
                  <button class="dashboard-icon-btn dashboard-material-icon-btn is-danger" type="button" data-action="delete-vocab-word" data-vocab-id="${escapeAttr(word.id)}" title="Supprimer"><span class="dashboard-material-icon">delete</span></button>
                </div>
              </article>
            `).join("") || `<div class="dashboard-activity-empty-state">Aucun mot pour le moment.</div>`}
          </div>
        </div>
      </div>
    `);
    bindVocabularyResourceEvents();
  }

  function bindVocabularyResourceEvents() {
    const form = list.querySelector("[data-action='save-vocab-word']");
    const message = list.querySelector("#adminVocabMessage");
    const importInput = list.querySelector("#adminVocabImportInput");
    const importPreview = list.querySelector("#adminVocabImportPreview");
    const importMessage = list.querySelector("#adminVocabImportMessage");

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      try {
        await saveDefaultVocabularyWordAsAdmin?.({
          word: data.get("word"),
          dictionary_page: data.get("dictionary_page")
        });
        vocabularyWords = await listDefaultVocabularyWordsAsAdmin?.() || [];
        showToast?.("Mot enregistré.");
        await renderVocabularyResources({ forceReload: false });
      } catch (err) {
        if (message) message.textContent = err?.message || "Enregistrement impossible.";
      }
    });

    list.querySelector("[data-action='analyze-vocab-import']")?.addEventListener("click", () => {
      const analysis = parseVocabularyImportText(importInput?.value || "", vocabularyWords);
      renderVocabularyImportPreview(importPreview, analysis);
      if (importMessage) {
        importMessage.textContent = analysis.errors.length
          ? `${analysis.errors.length} erreur${analysis.errors.length > 1 ? "s" : ""} à corriger avant import.`
          : `${analysis.items.length} mot${analysis.items.length > 1 ? "s" : ""} prêt${analysis.items.length > 1 ? "s" : ""} à importer.`;
      }
    });

    list.querySelector("[data-action='import-vocab-bulk']")?.addEventListener("click", async () => {
      const analysis = parseVocabularyImportText(importInput?.value || "", vocabularyWords);
      renderVocabularyImportPreview(importPreview, analysis);
      if (analysis.errors.length) {
        if (importMessage) importMessage.textContent = "Corrige les erreurs avant d’importer.";
        return;
      }
      if (!analysis.items.length) {
        if (importMessage) importMessage.textContent = "Aucun mot valide à importer.";
        return;
      }
      if (typeof upsertDefaultVocabularyWordsAsAdmin !== "function") {
        if (importMessage) importMessage.textContent = "Import en masse indisponible.";
        return;
      }
      try {
        if (importMessage) importMessage.textContent = "Import en cours…";
        vocabularyWords = await upsertDefaultVocabularyWordsAsAdmin(analysis.items);
        showToast?.(`${analysis.items.length} mot${analysis.items.length > 1 ? "s" : ""} importé${analysis.items.length > 1 ? "s" : ""}.`);
        await renderVocabularyResources({ forceReload: false });
      } catch (err) {
        if (importMessage) importMessage.textContent = err?.message || "Import impossible.";
      }
    });

    importInput?.addEventListener("input", () => {
      if (importMessage) importMessage.textContent = "";
    });

    list.querySelectorAll("[data-action='edit-vocab-word']").forEach((button) => {
      button.addEventListener("click", () => {
        const wordInput = form?.querySelector("[name='word']");
        const pageInput = form?.querySelector("[name='dictionary_page']");
        if (wordInput) wordInput.value = button.dataset.word || "";
        if (pageInput) pageInput.value = button.dataset.page || "";
        wordInput?.focus();
      });
    });
    list.querySelectorAll("[data-action='delete-vocab-word']").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!confirm("Supprimer ce mot du vocabulaire système ?")) return;
        await deleteDefaultVocabularyWordAsAdmin?.(button.dataset.vocabId);
        vocabularyWords = await listDefaultVocabularyWordsAsAdmin?.() || [];
        await renderVocabularyResources({ forceReload: false });
      });
    });
  }

  async function renderEncodingResources({ forceReload = false } = {}) {
    if (forceReload || (!encodingResources.assets.length && !encodingResources.words.length)) {
      list.innerHTML = `<div class="dashboard-activity-empty-state">Chargement des ressources Encodage…</div>`;
      encodingResources = await listEncodingResourcesAsAdmin?.() || { assets: [], words: [] };
    }
    const assets = Array.isArray(encodingResources.assets) ? encodingResources.assets : [];
    const words = Array.isArray(encodingResources.words) ? encodingResources.words : [];
    renderResourcesShell(`
      <div class="super-admin-resource-grid super-admin-resource-grid--wide">
        <form class="super-admin-resource-form" data-action="save-encoding-entry">
          <div class="cfg-panel-title">Ajouter / modifier une entrée Encodage</div>
          <label class="super-admin-field-stack">
            <span class="super-admin-field-label">Slug</span>
            <input class="modal-text-input" name="slug" type="text" placeholder="abricot" autocomplete="off">
          </label>
          <label class="super-admin-field-stack">
            <span class="super-admin-field-label">Mot affiché</span>
            <input class="modal-text-input" name="word" type="text" placeholder="abricot" autocomplete="off">
          </label>
          <label class="super-admin-field-stack">
            <span class="super-admin-field-label">Image Storage</span>
            <input class="modal-text-input" name="storage_path" type="text" placeholder="encodage/abricot.webp" autocomplete="off">
          </label>
          <label class="super-admin-field-stack">
            <span class="super-admin-field-label">Correction</span>
            <textarea class="modal-text-input" name="units" rows="4" placeholder="JSON ou raccourci, ex. a b r i c1 o t*"></textarea>
          </label>
          <label class="super-admin-checkline"><input type="checkbox" name="is_active" checked> Actif</label>
          <button class="btn primary" type="submit">Enregistrer l’entrée</button>
          <div class="modal-message" id="adminEncodingMessage">Astuce : ajoute * après un graphème muet, par exemple <code>t*</code>.</div>
        </form>
        <div class="super-admin-resource-list">
          <div class="super-admin-resource-list-head">
            <div class="cfg-panel-title">Entrées Encodage</div>
            <span class="dashboard-mini-pill">${words.length} mot${words.length > 1 ? "s" : ""} · ${assets.length} asset${assets.length > 1 ? "s" : ""}</span>
          </div>
          <div class="super-admin-resource-items">
            ${words.map((word) => {
              const asset = assets.find((item) => String(item.slug) === String(word.slug));
              return `
                <article class="super-admin-resource-row" data-encoding-slug="${escapeAttr(word.slug)}">
                  <div>
                    <strong>${escapeHtml(word.word)}</strong>
                    <span>${escapeHtml(word.slug)}${asset?.storage_path ? ` · ${escapeHtml(asset.storage_path)}` : " · image non renseignée"}</span>
                  </div>
                  <div class="super-admin-resource-row-actions">
                    <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="edit-encoding-entry" data-slug="${escapeAttr(word.slug)}" title="Reprendre"><span class="dashboard-material-icon">edit</span></button>
                    <button class="dashboard-icon-btn dashboard-material-icon-btn is-danger" type="button" data-action="delete-encoding-entry" data-slug="${escapeAttr(word.slug)}" title="Supprimer"><span class="dashboard-material-icon">delete</span></button>
                  </div>
                </article>
              `;
            }).join("") || `<div class="dashboard-activity-empty-state">Aucune entrée Encodage pour le moment.</div>`}
          </div>
        </div>
      </div>
    `);
    bindEncodingResourceEvents();
  }

  function bindEncodingResourceEvents() {
    const form = list.querySelector("[data-action='save-encoding-entry']");
    const message = list.querySelector("#adminEncodingMessage");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const slug = String(data.get("slug") || data.get("word") || "").trim();
      try {
        await savePhonologyWordAsAdmin?.({
          slug,
          word: data.get("word"),
          units: data.get("units"),
          is_active: data.get("is_active") === "on"
        });
        const storagePath = String(data.get("storage_path") || "").trim();
        if (storagePath) {
          await saveImageAssetAsAdmin?.({
            slug,
            storage_path: storagePath,
            is_active: data.get("is_active") === "on"
          });
        }
        encodingResources = await listEncodingResourcesAsAdmin?.() || { assets: [], words: [] };
        showToast?.("Entrée Encodage enregistrée.");
        await renderEncodingResources({ forceReload: false });
      } catch (err) {
        if (message) message.textContent = err?.message || "Enregistrement impossible.";
      }
    });
    list.querySelectorAll("[data-action='edit-encoding-entry']").forEach((button) => {
      button.addEventListener("click", () => {
        const slug = button.dataset.slug || "";
        const word = (encodingResources.words || []).find((item) => String(item.slug) === slug) || null;
        const asset = (encodingResources.assets || []).find((item) => String(item.slug) === slug) || null;
        if (!word) return;
        form.querySelector("[name='slug']").value = word.slug || "";
        form.querySelector("[name='word']").value = word.word || "";
        form.querySelector("[name='storage_path']").value = asset?.storage_path || "";
        form.querySelector("[name='units']").value = JSON.stringify(word.units || [], null, 2);
        const active = form.querySelector("[name='is_active']");
        if (active) active.checked = word.is_active !== false;
      });
    });
    list.querySelectorAll("[data-action='delete-encoding-entry']").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!confirm("Supprimer cette entrée Encodage et l’asset associé ?")) return;
        const slug = button.dataset.slug || "";
        await deletePhonologyWordAsAdmin?.(slug);
        await deleteImageAssetAsAdmin?.(slug).catch(() => {});
        encodingResources = await listEncodingResourcesAsAdmin?.() || { assets: [], words: [] };
        await renderEncodingResources({ forceReload: false });
      });
    });
  }

  async function renderSystemBanksSection({ forceReload = false } = {}) {
    destroySystemBanksController();
    list.classList.remove("dashboard-explorer-host");
    list.classList.add("super-admin-banks-list-host");
    list.innerHTML = renderSystemBanksWorkbench();

    const bankView = list.querySelector("[data-admin-banks-view]");
    if (!bankView) return;

    const query = (selector) => bankView.querySelector(selector);
    systemBanksController = createQuestionBanksViewController({
      banksView: bankView,
      bankExplorerHeader: header,
      bankEditorHeader: query("#bankEditorHeader"),
      bankBreadcrumb: query("#bankBreadcrumb"),
      banksList: query("#banksList"),
      bankEditorHost: query("#bankEditorHost"),
      bankEditorHeaderTitle: query("#bankEditorHeaderTitle"),
      btnCreateBank: header?.querySelector("#btnCreateBank"),
      btnCreateBankFolder: null,
      btnBackBankExplorer: query("#btnBackBankExplorer"),
      btnSaveBank: query("#btnSaveBank"),
      importModal: query("#bankImportModal"),
      importInput: query("#bankImportInput"),
      importMessage: query("#bankImportMessage"),
      importPreview: query("#bankImportPreview"),
      btnImportCancel: query("#btnBankImportCancel"),
      btnImportConfirm: query("#btnBankImportConfirm"),
      getCurrentTeacherSpace,
      requireTeacherSpace: false,
      bankRootMode: "flat",
      allowFolders: false,
      allowSystemBankEditing: true,
      rootLabel: "Banques système",
      listQuestionBanksForSpace: async () => {
        systemBanks = await listSystemQuestionBanksAsAdmin?.() || [];
        return systemBanks;
      },
      listQuestionBankFoldersForSpace: async () => [],
      createQuestionBankForSpace: async (_spaceId, payload = {}) => {
        const bank = await createSystemQuestionBankAsAdmin?.({
          title: payload.title,
          bank_type: payload.bank_type,
          description: payload.description || "",
          folder_id: null,
          display_order: payload.display_order
        });
        systemBanks = [];
        return bank;
      },
      updateQuestionBank,
      deleteQuestionBank,
      listQuestionBankItems,
      replaceQuestionBankItems,
      showToast
    });
    await systemBanksController.refresh({ forceRefresh: forceReload });
  }

  function destroySystemBanksController() {
    systemBanksController?.destroy?.();
    systemBanksController = null;
  }

  function renderSystemBanksWorkbench() {
    return `
      <div class="dashboard-banks-view super-admin-banks-view" data-admin-banks-view>
        <div id="bankExplorerHeader" class="dashboard-config-header dashboard-banks-explorer-header hidden" aria-hidden="true">
          <nav id="bankBreadcrumb" class="dashboard-breadcrumb" aria-label="Fil d’Ariane des banques">
            <button class="dashboard-breadcrumb-btn is-current" type="button" data-action="open-root">Banques système</button>
          </nav>
        </div>

        <div id="bankEditorHeader" class="dashboard-config-header dashboard-banks-editor-header hidden">
          <div class="cfg-header-left dashboard-banks-editor-header-main">
            <button class="btn cfg-back-btn" id="btnBackBankExplorer" type="button" aria-label="Retour aux banques">↩</button>

            <button id="btnToggleBankMeta" class="dashboard-bank-meta-toggle dashboard-material-icon-btn" type="button" aria-label="Afficher les informations facultatives" aria-expanded="false" aria-controls="bankEditorMetaPanel" title="Afficher matière, niveau, tags et description" disabled>
              <span class="dashboard-material-icon" aria-hidden="true">expand_more</span>
            </button>

            <div class="cfg-header-identity">
              <div class="cfg-config-name-wrap">
                <div class="cfg-field-label">Titre de la banque :</div>
                <div id="bankEditorHeaderTitle" class="cfg-config-name-display is-empty">Banque sans nom</div>
                <button class="dashboard-icon-btn cfg-name-rename-btn" id="btnRenameBankFromHeader" type="button" aria-label="Renommer la banque" title="Renommer la banque" disabled>
                  <span class="dashboard-material-icon cfg-name-rename-icon" aria-hidden="true">drive_file_rename_outline</span>
                </button>
                <div id="bankEditorTypePill" class="dashboard-bank-type-pill" hidden></div>
              </div>
            </div>
          </div>

          <div id="bankEditorMessage" class="cfg-editor-message"></div>

          <div class="cfg-header-actions dashboard-banks-header-actions">
            <button id="btnSaveBank" class="btn cfg-save-btn" type="button" disabled>Enregistrer</button>
          </div>

          <div id="bankEditorMetaPanel" class="dashboard-bank-header-meta-panel" hidden></div>
        </div>

        <div id="banksList" class="dashboard-content-scroll dashboard-config-list dashboard-explorer-host dashboard-banks-explorer-host">
          <div class="dashboard-activity-empty-state">Chargement…</div>
        </div>

        <section id="bankEditorHost" class="dashboard-bank-editor-host hidden" aria-live="polite">
          <div class="dashboard-bank-empty-state">Chargement…</div>
        </section>

        <div id="bankImportModal" class="modal hidden" aria-hidden="true">
          <div class="modal-content modal-content-wide dashboard-bank-import-modal" role="dialog" aria-modal="true" aria-labelledby="bankImportModalTitle">
            <div id="bankImportModalTitle" class="modal-title">Importer des questions</div>
            <div class="dashboard-bank-import-help">
              Colle un tableau ou une liste avec le séparateur <strong>|</strong> ou des tabulations :<br>
              <code>Question | Réponse principale | Réponses acceptées | Explication</code>
            </div>

            <textarea id="bankImportInput" class="dashboard-bank-import-input" placeholder="Qui est le premier grand roi des Carolingiens ? | Charlemagne | Charles le Grand; Charles Ier"></textarea>
            <div id="bankImportPreview" class="dashboard-bank-import-preview" hidden></div>

            <div class="modal-actions">
              <div id="bankImportMessage" class="modal-message">Colle une liste pour commencer.</div>
              <button id="btnBankImportCancel" class="btn" type="button">Annuler</button>
              <button id="btnBankImportConfirm" class="btn primary" type="button">Ajouter</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return { refresh };
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
