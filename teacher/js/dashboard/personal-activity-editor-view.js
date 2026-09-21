import { getActiveToolsRegistry } from "../../../tools/registry.js";
import { loadToolsRuntime } from "../../../shared/tool-root-runtime.js";
import { TOOL_LIMITS } from "../../../shared/activity-config.js";
import { renderStepperField, bindStepperField, readStepper } from "../../../shared/config-widgets.js";
import { getDefaultSettings as getDefaultQuizSettings, normalizeSettings as normalizeQuizSettings, normalizeQuizRuntimeSettings } from "../../../tools/quiz/model.js";
import { openCatalogTestRunner } from "./catalog-test-runner.js";
import { escapeAttr, escapeHtml } from "./text-utils.js";

const LEVEL_KEYS = Object.freeze(["1", "2", "3", "4", "5"]);
const LEVEL_LABELS = Object.freeze({
  "1": "Très accessible",
  "2": "Accessible",
  "3": "Standard",
  "4": "Exigeant",
  "5": "Très exigeant"
});
const DEFAULT_LEVEL = "3";
const DEFAULT_TIME_PER_Q = 40;
const CATALOG_EDITOR_SOURCE_META_KEY = "__editor_source";

const TOOL_GROUPS = Object.freeze([
  { id:"lecture", label:"Lecture", toolIds:["reperage-graphemes", "presence-son", "nuage-lettres", "segmenter-mots", "recomposer-mots-syllabes", "mot-cache", "reperage-occurrences", "reperage-mots"] },
  { id:"ecriture", label:"Écriture", toolIds:["encodage", "dictee-muette", "geste-graphique"] },
  { id:"conjugaison", label:"Conjugaison", toolIds:["conjugaison", "identifier-verbe"] },
  { id:"lexique", label:"Lexique", toolIds:["ordre-alphabetique-lettres", "ordre-alphabetique-mots"] },
  { id:"nombres", label:"Nombres", toolIds:["plus-moins-autant", "comparaison", "collection", "frise-picbille", "droite-numerique-simple", "droite-numerique-complete", "representation-picbille", "representation-dede", "representation-carres", "representation-tuiles", "nombres-lettres"] },
  { id:"calcul", label:"Calcul", toolIds:["addition", "soustraction", "multiplication-posee", "addition-trous", "soustraction-trous", "multiplication-trous", "tables-multiplication", "boites-jetons", "calcul-cible", "compte-est-bon", "somme-difference"] },
  { id:"grandeurs-mesures", label:"Grandeurs et mesures", toolIds:["monnaie-representation"] }
]);

export function createPersonalActivityEditorController({
  view,
  header,
  body,
  getCurrentTeacherSpace,
  getIsSuperAdmin,
  saveTeacherActivityForSpace,
  getQuizForSpace,
  listPedagogicalNodesForAdmin,
  listCatalogActivitiesForAdmin,
  saveCatalogActivityAsAdmin,
  onBack,
  onEditContent,
  onSaved,
  showToast
} = {}) {
  const activeTools = getActiveToolsRegistry();
  const tools = activeTools.filter((tool) => String(tool.id || "") !== "quiz");
  let toolsRuntime = null;
  let editingActivity = null;
  let sourceQuiz = null;
  let activeLevel = DEFAULT_LEVEL;
  let singleDraft = makeDefaultLevelDraft();
  let levelDrafts = makeDefaultLevels();
  let activeToolModule = null;
  let activeToolId = "";
  let renderToken = 0;
  let toolPickerOverlay = null;
  let systemPublicationOverlay = null;
  let systemPublicationSnapshot = null;
  let isDirty = false;
  let editorOrigin = "my-activities";
  let systemPublication = null;
  let adminPedagogicalNodes = [];
  let adminCatalogActivities = [];

  async function open(activity = {}, { autoOpenToolPicker = false, origin = "my-activities", systemPublication:requestedSystemPublication = null } = {}) {
    editingActivity = normalizeActivity(activity);
    sourceQuiz = null;
    activeLevel = DEFAULT_LEVEL;
    isDirty = false;
    editorOrigin = String(origin || "my-activities").trim() || "my-activities";
    hydrateDraftsFromActivity();
    await hydrateSystemPublication(requestedSystemPublication);

    if (["quiz", "series"].includes(editingActivity.activity_type) && editingActivity.source_quiz_id) {
      const space = getCurrentTeacherSpace?.();
      if (space?.id) {
        sourceQuiz = await getQuizForSpace?.(space.id, editingActivity.source_quiz_id) || null;
        syncQuizSourceIntoDrafts();
      }
    }

    render();
    if (autoOpenToolPicker && editingActivity.activity_type === "tool" && !getToolId()) {
      queueMicrotask(() => openToolPicker());
    }
  }

  async function hydrateSystemPublication(requested = null) {
    systemPublication = null;
    adminPedagogicalNodes = [];
    adminCatalogActivities = [];
    if (getIsSuperAdmin?.() !== true) return;

    try {
      const [nodes, catalog] = await Promise.all([
        listPedagogicalNodesForAdmin?.() || [],
        listCatalogActivitiesForAdmin?.({ includeArchived:true }) || []
      ]);
      adminPedagogicalNodes = Array.isArray(nodes) ? nodes : [];
      adminCatalogActivities = Array.isArray(catalog) ? catalog : [];
    } catch (error) {
      showToast?.(error?.message || "Impossible de charger les options de publication système.", { isError:true });
    }

    const requestedState = requested && typeof requested === "object" ? requested : {};
    const requestedCatalogId = String(requestedState.catalogId || requestedState.catalog_id || "").trim().toLowerCase();
    const catalogId = requestedCatalogId || getSystemCatalogId(editingActivity?.id);
    const existing = catalogId
      ? adminCatalogActivities.find((item) => String(item?.id || "") === catalogId) || null
      : null;
    const requestedCategory = String(requestedState.pedagogicalNodeId || requestedState.pedagogical_node_id || "").trim();
    const existingCategory = String(existing?.pedagogical_node_id || existing?.folder_id || "").trim();
    const fallbackCategory = getAdminPublicationFolders()[0]?.id || "";

    const existingEnabled = Boolean(existing) && String(existing?.status || "") !== "archived";
    systemPublication = {
      enabled:existingEnabled || requestedState.enabled === true,
      catalog_id:catalogId || null,
      pedagogical_node_id:existingCategory || requestedCategory || fallbackCategory,
      status:String(existing?.status || requestedState.status || "draft") === "published" ? "published" : "draft",
      description:String(existing?.description || requestedState.description || ""),
      adventure_tier:Math.max(1, Math.trunc(Number(existing?.adventure_tier ?? requestedState.adventure_tier) || 1)),
      default_visible:existing ? existing.default_visible !== false : requestedState.default_visible !== false,
      display_order:Number.isFinite(Number(existing?.display_order)) ? Math.max(0, Math.trunc(Number(existing.display_order))) : null,
      existed:Boolean(existing)
    };
  }

  function getAdminPublicationFolders() {
    return adminPedagogicalNodes
      .filter((node) => node?.is_active !== false && String(node?.node_type || "") === "grade_level")
      .sort((a, b) => getPedagogicalPathLabel(a?.id).localeCompare(getPedagogicalPathLabel(b?.id), "fr", { sensitivity:"base" }));
  }

  function getPedagogicalPathLabel(nodeId) {
    const byId = new Map(adminPedagogicalNodes.map((node) => [String(node?.id || ""), node]));
    const parts = [];
    const seen = new Set();
    let cursor = byId.get(String(nodeId || ""));
    while (cursor && !seen.has(String(cursor.id || ""))) {
      parts.unshift(String(cursor.name || cursor.id || ""));
      seen.add(String(cursor.id || ""));
      cursor = byId.get(String(cursor.parent_id || ""));
    }
    return parts.filter(Boolean).join(" › ") || String(nodeId || "");
  }

  function getSystemCatalogId(activityId = editingActivity?.id) {
    const safe = String(activityId || "").trim().toLowerCase();
    return safe ? `teacher.${safe}` : "";
  }

  function render() {
    if (!view) return;
    renderHeader();
    renderBody();
  }

  function renderHeader() {
    if (!header || !editingActivity) return;
    const typeMeta = getTypeMeta(editingActivity.activity_type);
    const tool = findTool(getToolId());
    const toolLabel = tool?.label || typeMeta.label;
    const backLabel = editorOrigin === "activities" ? "Retour à Exploration" : "Retour à Mes activités";
    header.innerHTML = `
      <div class="dashboard-config-header-main personal-activity-editor-header-main">
        <button class="dashboard-back-btn dashboard-material-icon-btn" type="button" data-action="back-personal-activity" title="${escapeAttr(backLabel)}" aria-label="${escapeAttr(backLabel)}">
          <span class="dashboard-material-icon" aria-hidden="true">arrow_back</span>
        </button>
        <span class="dashboard-mini-pill">${escapeHtml(typeMeta.label)}</span>
        <div class="personal-activity-editor-title-wrap">
          <input class="personal-activity-title-input" type="text" value="${escapeAttr(editingActivity.title)}" placeholder="Titre de l’activité" aria-label="Titre de l’activité">
        </div>
      </div>
      <div class="dashboard-config-header-center personal-activity-editor-header-center">
        <span class="personal-activity-editor-tool-name">${escapeHtml(toolLabel)}</span>
        ${editingActivity.activity_type === "tool" ? `
          <button class="personal-activity-tool-picker-btn" type="button" data-action="choose-personal-tool" title="Changer d’outil" aria-label="Changer d’outil">
            <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="#e3e3e3" aria-hidden="true"><path d="m680-80-12-60q-12-5-22.5-10.5T624-164l-58 18-40-68 46-40q-2-12-2-26t2-26l-46-40 40-68 58 18q11-8 21.5-13.5T668-420l12-60h80l12 60q12 5 22.5 10.5T816-396l58-18 40 68-46 40q2 12 2 26t-2 26l46 40-40 68-58-18q-11 8-21.5 13.5T772-140l-12 60h-80Zm96.5-143.5Q800-247 800-280t-23.5-56.5Q753-360 720-360t-56.5 23.5Q640-313 640-280t23.5 56.5Q687-200 720-200t56.5-23.5ZM160-240v-480 172-12 320Zm0 80q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v131q-18-13-38-22.5T800-548v-92H447l-80-80H160v480h283q3 21 9.5 41t15.5 39H160Z"/></svg>
          </button>
        ` : ""}
      </div>
      <div class="dashboard-config-header-actions">
        <button class="btn dashboard-btn-with-icon" type="button" data-action="test-personal-activity">
          <span class="dashboard-material-icon" aria-hidden="true">play_arrow</span><span>Tester</span>
        </button>
        <button class="btn primary dashboard-btn-with-icon" type="button" data-action="save-personal-activity">
          <span class="dashboard-material-icon" aria-hidden="true">save</span><span>Enregistrer</span>
        </button>
        ${systemPublication ? `
          <button class="btn dashboard-btn-with-icon" type="button" data-action="open-system-publication">
            <span class="dashboard-material-icon" aria-hidden="true">deployed_code_update</span><span>Publier</span>
          </button>
        ` : ""}
      </div>
    `;

    header.querySelector("[data-action='back-personal-activity']")?.addEventListener("click", () => onBack?.({ origin:editorOrigin, activity:clone(editingActivity) }));
    header.querySelector("[data-action='choose-personal-tool']")?.addEventListener("click", openToolPicker);
    header.querySelector(".personal-activity-title-input")?.addEventListener("input", (event) => {
      editingActivity.title = String(event.target?.value || "");
      markDirty();
    });
    header.querySelector("[data-action='save-personal-activity']")?.addEventListener("click", () => save());
    header.querySelector("[data-action='test-personal-activity']")?.addEventListener("click", () => test());
    header.querySelector("[data-action='open-system-publication']")?.addEventListener("click", openSystemPublicationOverlay);
  }

  function renderBody() {
    if (!body || !editingActivity) return;
    const isAdaptive = editingActivity.difficulty_mode === "adaptive";
    const typeMeta = getTypeMeta(editingActivity.activity_type);
    const toolId = getToolId();
    const sourceStrip = ["quiz", "series"].includes(editingActivity.activity_type)
      ? renderQuizSourceStrip(typeMeta)
      : "";

    body.innerHTML = `
      <div class="personal-activity-editor-shell${isAdaptive ? " is-adaptive" : " is-single"}">
        ${sourceStrip ? `<div class="personal-activity-source-strip-wrap">${sourceStrip}</div>` : ""}
        <section class="personal-activity-editor-main">
          <div class="personal-activity-config-heading">
            <div class="personal-activity-config-controls">
              <div class="personal-activity-difficulty-switch${isAdaptive ? " is-adaptive" : ""}" role="group" aria-label="Mode de difficulté">
                <button class="personal-activity-difficulty-btn${editingActivity.difficulty_mode === "single" ? " is-active" : ""}" type="button" data-difficulty-mode="single" aria-pressed="${editingActivity.difficulty_mode === "single" ? "true" : "false"}">Unique</button>
                <button class="personal-activity-difficulty-btn${isAdaptive ? " is-active" : ""}" type="button" data-difficulty-mode="adaptive" aria-pressed="${isAdaptive ? "true" : "false"}">Adaptative</button>
              </div>
              ${isAdaptive ? `
                <nav class="personal-activity-header-levels" aria-label="Niveaux adaptatifs">
                  ${LEVEL_KEYS.map((level) => `<button class="personal-activity-header-level${level === activeLevel ? " is-active" : ""}" type="button" data-level="${level}" title="${escapeAttr(LEVEL_LABELS[level])}">Niveau ${level}</button>`).join("")}
                </nav>
                <div class="personal-activity-copy-menu">
                  <button class="personal-activity-copy-btn" type="button" data-action="toggle-copy-level-menu" aria-expanded="false" aria-controls="personalActivityCopyLevelMenu">
                    <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="#e3e3e3" aria-hidden="true"><path d="M480-80q-33 0-56.5-23.5T400-160v-320q0-33 23.5-56.5T480-560h320q33 0 56.5 23.5T880-480v320q0 33-23.5 56.5T800-80H480Zm0-80h320v-320H480v320Zm-240-80v-400q0-33 23.5-56.5T320-720h400v80H320v400h-80ZM80-400v-400q0-33 23.5-56.5T160-880h400v80H160v400H80Zm400 240v-320 320Z"/></svg>
                    <span>Copier vers</span>
                  </button>
                  <div id="personalActivityCopyLevelMenu" class="personal-activity-copy-level-menu" role="menu" hidden>
                    ${LEVEL_KEYS.filter((level) => level !== activeLevel).map((level) => `<button type="button" role="menuitem" data-copy-level="${level}">Niveau ${level}</button>`).join("")}
                  </div>
                </div>
              ` : ""}
            </div>
          </div>
          <div id="personalActivityToolSettingsHost" class="personal-activity-tool-settings-host">
            ${toolId ? `<div class="dashboard-activity-empty-state">Chargement des réglages…</div>` : `<div class="personal-activity-editor-prompt"><span class="dashboard-material-icon" aria-hidden="true">extension</span><strong>Choisissez un outil.</strong></div>`}
          </div>
        </section>
      </div>
    `;

    bindBodyEvents();
    if (toolId) void renderCurrentToolSettings();
  }

  function renderQuizSourceStrip(typeMeta) {
    const title = String(sourceQuiz?.title || editingActivity.title || "Contenu à créer").trim() || "Contenu à créer";
    const count = getQuizSourceCount(sourceQuiz);
    return `
      <div class="personal-activity-source-strip">
        <span class="dashboard-material-icon" aria-hidden="true">${typeMeta.icon}</span>
        <strong>${escapeHtml(title)}</strong>
        <span class="personal-activity-source-meta">${count == null ? typeMeta.label : `${count} ${editingActivity.activity_type === "series" ? "variante" : "question"}${count > 1 ? "s" : ""}`}</span>
        <button class="btn personal-activity-source-action" type="button" data-action="edit-personal-content">Modifier le contenu</button>
      </div>
    `;
  }

  function renderSystemPublicationForm() {
    if (!systemPublication) return "";
    const folders = getAdminPublicationFolders();
    const enabled = systemPublication.enabled === true;
    const disabledAttr = enabled ? "" : "disabled";
    const published = systemPublication.status === "published";
    return `
      <section class="personal-activity-system-publication${enabled ? " is-enabled" : ""}" aria-label="Publication dans Exploration">
        <label class="personal-activity-system-toggle">
          <input id="personalActivitySystemEnabled" type="checkbox" ${enabled ? "checked" : ""}>
          <span><strong>Inclure dans Exploration</strong><small>Option réservée à l’administrateur. L’activité personnelle reste la source de configuration.</small></span>
        </label>
        <div class="personal-activity-system-fields">
          <label>
            <span>Emplacement</span>
            <select id="personalActivitySystemCategory" ${disabledAttr}>
              ${folders.map((folder) => `<option value="${escapeAttr(folder.id)}" ${String(folder.id) === String(systemPublication.pedagogical_node_id || "") ? "selected" : ""}>${escapeHtml(getPedagogicalPathLabel(folder.id))}</option>`).join("")}
            </select>
          </label>
          <div class="personal-activity-system-status" role="group" aria-label="Statut de publication">
            <span>Statut</span>
            <div class="personal-activity-system-status-options">
              <button class="personal-activity-difficulty-btn${published ? "" : " is-active"}" type="button" data-system-status="draft" ${disabledAttr}>Brouillon</button>
              <button class="personal-activity-difficulty-btn${published ? " is-active" : ""}" type="button" data-system-status="published" ${disabledAttr}>Publié</button>
            </div>
          </div>
          <label>
            <span>Palier Aventure</span>
            <input id="personalActivitySystemTier" type="number" min="1" step="1" value="${escapeAttr(systemPublication.adventure_tier)}" ${disabledAttr}>
          </label>
          <label class="personal-activity-system-description">
            <span>Description</span>
            <input id="personalActivitySystemDescription" type="text" value="${escapeAttr(systemPublication.description)}" placeholder="Description courte dans le catalogue" ${disabledAttr}>
          </label>
        </div>
      </section>
    `;
  }

  function openSystemPublicationOverlay() {
    if (!systemPublication) return;
    closeSystemPublicationOverlay({ restore:false });
    systemPublicationSnapshot = clone(systemPublication);
    const overlay = document.createElement("div");
    overlay.className = "cfg-modal personal-activity-publication-modal";
    overlay.innerHTML = `
      <div class="cfg-modal-backdrop" data-cancel-system-publication="true"></div>
      <div class="panel cfg-modal-card personal-activity-publication-card" role="dialog" aria-modal="true" aria-labelledby="personalActivityPublicationTitle">
        <div class="cfg-modal-header">
          <div id="personalActivityPublicationTitle" class="cfg-modal-title">Publier dans Exploration</div>
          <button class="btn cfg-modal-close" type="button" data-cancel-system-publication="true" aria-label="Fermer sans appliquer" title="Fermer sans appliquer">✕</button>
        </div>
        <div class="personal-activity-publication-content" data-system-publication-content></div>
        <div class="modal-actions personal-activity-publication-actions">
          <span class="modal-message">Valider enregistre immédiatement ces réglages dans Exploration.</span>
          <button class="btn" type="button" data-cancel-system-publication="true">Annuler</button>
          <button class="btn primary" type="button" data-apply-system-publication="true">Valider</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    systemPublicationOverlay = overlay;
    overlay.querySelectorAll("[data-cancel-system-publication]").forEach((element) => element.addEventListener("click", () => closeSystemPublicationOverlay({ restore:true })));
    overlay.querySelector("[data-apply-system-publication]")?.addEventListener("click", applySystemPublicationOverlay);
    renderSystemPublicationOverlay();
  }

  async function applySystemPublicationOverlay() {
    if (!systemPublication) return;
    if (!validateSystemPublication()) return;

    const applyButton = systemPublicationOverlay?.querySelector("[data-apply-system-publication]");
    const cancelButtons = [...(systemPublicationOverlay?.querySelectorAll("[data-cancel-system-publication]") || [])];
    if (applyButton) applyButton.disabled = true;
    cancelButtons.forEach((button) => { button.disabled = true; });
    setSystemPublicationOverlayMessage(
      systemPublication.enabled
        ? (systemPublication.status === "published" ? "Publication dans Exploration…" : "Enregistrement du brouillon…")
        : "Retrait d’Exploration…"
    );

    markDirty();
    const saved = await save({ quiet:true });
    if (!saved) {
      if (applyButton) applyButton.disabled = false;
      cancelButtons.forEach((button) => { button.disabled = false; });
      setSystemPublicationOverlayMessage("La publication n’a pas pu être enregistrée.", { isError:true, preserveExistingError:true });
      return;
    }

    const publicationState = systemPublication.enabled
      ? (systemPublication.status === "published" ? "publiée dans Exploration" : "enregistrée en brouillon")
      : "retirée d’Exploration";
    systemPublicationSnapshot = null;
    closeSystemPublicationOverlay({ restore:false });
    showToast?.(`Activité « ${editingActivity.title} » ${publicationState}.`);
  }

  function setSystemPublicationOverlayMessage(message, { isError = false, preserveExistingError = false } = {}) {
    const modalMessage = systemPublicationOverlay?.querySelector(".personal-activity-publication-actions .modal-message");
    if (!modalMessage) return;
    if (preserveExistingError && modalMessage.classList.contains("is-error") && String(modalMessage.textContent || "").trim()) return;
    modalMessage.textContent = String(message || "");
    modalMessage.classList.toggle("is-error", isError === true);
  }

  function closeSystemPublicationOverlay({ restore = false } = {}) {
    if (restore && systemPublicationSnapshot) {
      systemPublication = clone(systemPublicationSnapshot);
    }
    systemPublicationSnapshot = null;
    systemPublicationOverlay?.remove();
    systemPublicationOverlay = null;
  }

  function renderSystemPublicationOverlay() {
    const content = systemPublicationOverlay?.querySelector("[data-system-publication-content]");
    if (!content) return;
    content.innerHTML = renderSystemPublicationForm();
    bindSystemPublicationBlock(content);
  }

  function bindSystemPublicationBlock(root) {
    if (!systemPublication) return;
    const enabledInput = root?.querySelector("#personalActivitySystemEnabled");
    enabledInput?.addEventListener("change", () => {
      systemPublication.enabled = enabledInput.checked === true;
      renderSystemPublicationOverlay();
    });
    root?.querySelector("#personalActivitySystemCategory")?.addEventListener("change", (event) => {
      systemPublication.pedagogical_node_id = String(event.target?.value || "").trim();
    });
    root?.querySelectorAll("[data-system-status]").forEach((button) => button.addEventListener("click", () => {
      systemPublication.status = String(button.dataset.systemStatus || "draft") === "published" ? "published" : "draft";
      renderSystemPublicationOverlay();
    }));
    root?.querySelector("#personalActivitySystemTier")?.addEventListener("input", (event) => {
      systemPublication.adventure_tier = Math.max(1, Math.trunc(Number(event.target?.value) || 1));
    });
    root?.querySelector("#personalActivitySystemDescription")?.addEventListener("input", (event) => {
      systemPublication.description = String(event.target?.value || "");
    });
  }

  function bindBodyEvents() {
    body.querySelector("[data-action='edit-personal-content']")?.addEventListener("click", async () => {
      const ok = await persistVisibleLevel({ silent:true });
      if (!ok) return;
      const saved = await save({ quiet:true });
      if (!saved) return;
      onEditContent?.(clone(saved), { origin:editorOrigin, systemPublication:clone(systemPublication) });
    });
    body.querySelectorAll("[data-difficulty-mode]").forEach((button) => {
      button.addEventListener("click", async () => {
        const mode = String(button.dataset.difficultyMode || "single") === "adaptive" ? "adaptive" : "single";
        if (mode === editingActivity.difficulty_mode) return;
        const ok = await persistVisibleLevel({ silent:true });
        if (!ok) return;
        changeDifficultyMode(mode);
      });
    });
    body.querySelectorAll("[data-level]").forEach((button) => {
      button.addEventListener("click", async () => {
        const next = normalizeLevelKey(button.dataset.level);
        if (next === activeLevel) return;
        const ok = await persistVisibleLevel({ silent:true });
        if (!ok) return;
        activeLevel = next;
        render();
      });
    });
    const copyLevelMenu = body.querySelector("#personalActivityCopyLevelMenu");
    body.querySelector("[data-action='toggle-copy-level-menu']")?.addEventListener("click", () => {
      if (!copyLevelMenu) return;
      copyLevelMenu.hidden = !copyLevelMenu.hidden;
      body.querySelector("[data-action='toggle-copy-level-menu']")?.setAttribute("aria-expanded", copyLevelMenu.hidden ? "false" : "true");
    });
    copyLevelMenu?.querySelectorAll("[data-copy-level]").forEach((button) => {
      button.addEventListener("click", () => copyCurrentConfigurationToLevel(button.dataset.copyLevel));
    });
  }

  async function renderCurrentToolSettings() {
    const token = ++renderToken;
    const toolId = getToolId();
    const host = body?.querySelector("#personalActivityToolSettingsHost");
    if (!toolId || !host) return;

    try {
      const runtime = await getToolsRuntime();
      const mod = await runtime.loadToolModule(toolId);
      if (token !== renderToken) return;
      activeToolModule = mod;
      activeToolId = toolId;
      const tool = mod.default || {};
      const draft = getCurrentDraft(tool);
      const settings = ensureToolSettings(draft.settings, tool);
      host.innerHTML = `
        <div class="cfg-tool-settings-stack personal-activity-tool-settings-stack">
          <div class="super-admin-level-common-row personal-activity-common-row">
            ${renderLevelTimingBlock(draft)}
            ${renderLevelInstructionBlock(draft, tool)}
          </div>
          <div id="personalActivitySpecificSettings"></div>
        </div>
      `;
      bindLevelTimingBlock(host);
      bindLevelInstructionBlock(host);
      const settingsHost = host.querySelector("#personalActivitySpecificSettings");
      if (typeof tool.renderToolSettings === "function") {
        tool.renderToolSettings(settingsHost, clone(settings), getToolContext());
      } else {
        settingsHost.innerHTML = `<div class="dashboard-activity-empty-state">Cet outil n’a aucun réglage spécifique.</div>`;
      }
      host.querySelectorAll('input[type="number"]').forEach((input) => {
        input.addEventListener("focus", () => input.select?.());
        input.addEventListener("pointerup", () => input.select?.());
      });
      host.addEventListener("toolsettingsrefresh", () => {
        void persistVisibleLevel({ silent:true }).then(() => renderCurrentToolSettings());
      }, { once:true });
    } catch (error) {
      host.innerHTML = `<div class="dashboard-activity-empty-state">${escapeHtml(error?.message || "Impossible de charger cet outil.")}</div>`;
      setMessage(error?.message || "Impossible de charger cet outil.", true);
    }
  }

  function renderLevelTimingBlock(levelDraft = {}) {
    const normalized = normalizeLevelDraft(levelDraft);
    return `
      <div class="tv-group tv-group-inline super-admin-level-time-group personal-activity-common-block">
        <div class="tv-minmax tv-minmax-basic super-admin-level-time-inline">
          <div class="tv-minmax-inline">
            <div class="tv-group-title tv-minmax-title">Temps par question</div>
            <div class="tv-minmax-header-actions">
              <div class="tv-minmax-controls">
                ${renderStepperField({
                  id:"personalActivityTimePerQ",
                  label:"Temps par question",
                  value:normalized.timePerQ,
                  inputMin:TOOL_LIMITS.timePerQ.min,
                  inputMax:TOOL_LIMITS.timePerQ.max,
                  step:TOOL_LIMITS.timePerQ.step,
                  fieldClassName:"super-admin-compact-stepper-field",
                  actionButtonHtml:renderInfiniteToggleButton({
                    id:"personalActivityTimePerQInfinite",
                    label:"Temps par question illimité",
                    active:normalized.infiniteTimePerQ
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
    const normalized = normalizeLevelDraft(levelDraft);
    const sourceInstruction = String(normalized?.settings?.sourceInstruction ?? normalized?.settings?.source_instruction ?? "").trim();
    const defaultInstruction = sourceInstruction || String(tool?.defaultInstruction || "").trim();
    const placeholder = defaultInstruction || "Consigne affichée pour cette activité…";
    return `
      <div class="tv-group tv-group-inline super-admin-level-instruction-group personal-activity-common-block">
        <div class="super-admin-level-instruction-head">
          <label class="super-admin-level-instruction-checkline" for="personalActivityInstructionEnabled">
            <input id="personalActivityInstructionEnabled" type="checkbox" ${checkedAttr}>
            <span>Consigne personnalisée :</span>
          </label>
        </div>
        <input id="personalActivityInstructionText" class="tv-input super-admin-level-instruction-input" type="text"
          placeholder="${escapeAttr(placeholder)}" data-tool-default-instruction="${escapeAttr(String(tool?.defaultInstruction || "").trim())}"
          value="${escapeAttr(instruction.text)}" ${disabledAttr}>
      </div>
    `;
  }

  function renderInfiniteToggleButton({ id, label, active = false }) {
    return `<button class="tv-stepper-infinity-btn${active ? " is-active" : ""}" type="button" id="${escapeAttr(id)}" data-infinite-toggle="true" aria-label="${escapeAttr(label)}" aria-pressed="${active ? "true" : "false"}" title="${escapeAttr(label)}"><span class="tv-stepper-icon" aria-hidden="true">all_inclusive</span></button>`;
  }

  function bindLevelTimingBlock(container) {
    bindStepperField(container, "personalActivityTimePerQ", {
      inputMin:TOOL_LIMITS.timePerQ.min,
      inputMax:TOOL_LIMITS.timePerQ.max
    });
    bindInfiniteToggle(container, { buttonId:"personalActivityTimePerQInfinite", inputId:"personalActivityTimePerQ" });
  }

  function bindInfiniteToggle(container, { buttonId, inputId } = {}) {
    const button = container.querySelector(`#${CSS.escape(buttonId)}`);
    const input = container.querySelector(`#${CSS.escape(inputId)}`);
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

  function bindLevelInstructionBlock(container) {
    const checkbox = container.querySelector("#personalActivityInstructionEnabled");
    const input = container.querySelector("#personalActivityInstructionText");
    if (!checkbox || !input) return;
    const applyState = () => {
      input.disabled = checkbox.checked !== true;
      input.closest(".super-admin-level-instruction-group")?.classList.toggle("is-enabled", checkbox.checked === true);
    };
    applyState();
    checkbox.addEventListener("change", () => {
      applyState();
      markDirty();
      if (checkbox.checked) input.focus();
    });
    input.addEventListener("input", markDirty);
    container.addEventListener("toolsourceinstructionchange", (event) => {
      const sourceInstruction = String(event?.detail?.instruction || "").trim();
      const toolDefault = String(input.dataset.toolDefaultInstruction || "").trim();
      input.placeholder = sourceInstruction || toolDefault || "Consigne affichée pour cette activité…";
    });
  }

  async function persistVisibleLevel({ silent = false } = {}) {
    const toolId = getToolId();
    if (!toolId) return true;
    const current = getCurrentDraft(activeToolModule?.default || null);
    const host = body?.querySelector("#personalActivitySpecificSettings");
    let settings = clone(current.settings || {});

    try {
      if (host && activeToolModule?.default && activeToolId === toolId && typeof activeToolModule.default.readToolSettings === "function") {
        settings = activeToolModule.default.readToolSettings(host, clone(settings), getToolContext());
      }
      const instructionState = readLevelInstructionState(body, current);
      settings = applyLevelInstructionToSettings(settings, instructionState);
      const nextDraft = {
        ...current,
        ...readLevelTimingSettings(body, current),
        settings:clone(settings)
      };
      setCurrentDraft(nextDraft);
      if (!silent) setMessage("");
      return true;
    } catch (error) {
      if (!silent) setMessage(error?.message || "Réglages incomplets.", true);
      return false;
    }
  }

  function readLevelTimingSettings(container, fallback = {}) {
    const normalized = normalizeLevelDraft(fallback);
    const input = container?.querySelector("#personalActivityTimePerQ");
    const infiniteButton = container?.querySelector("#personalActivityTimePerQInfinite");
    if (!input) return { timePerQ:normalized.timePerQ, infiniteTimePerQ:normalized.infiniteTimePerQ };
    let timePerQ = normalized.timePerQ;
    try { timePerQ = clampTime(readStepper(container, "personalActivityTimePerQ", { inputMin:TOOL_LIMITS.timePerQ.min, inputMax:TOOL_LIMITS.timePerQ.max })); }
    catch { timePerQ = clampTime(input.value); }
    return {
      timePerQ,
      infiniteTimePerQ:infiniteButton?.getAttribute("aria-pressed") === "true"
    };
  }

  function readLevelInstructionState(container, fallback = {}) {
    const fallbackState = getLevelInstructionState(fallback);
    const checkbox = container?.querySelector("#personalActivityInstructionEnabled");
    const input = container?.querySelector("#personalActivityInstructionText");
    if (!checkbox || !input) return fallbackState;
    return { enabled:checkbox.checked === true, text:String(input.value ?? "") };
  }

  function getLevelInstructionState(levelDraft = {}) {
    const normalized = normalizeLevelDraft(levelDraft);
    const settings = isPlainObject(normalized.settings) ? normalized.settings : {};
    const common = isPlainObject(settings.common) ? settings.common : {};
    const instruction = isPlainObject(common.instruction) ? common.instruction : {};
    return { enabled:instruction.enabled === true, text:String(instruction.text ?? "") };
  }

  function applyLevelInstructionToSettings(settings = {}, instructionState = {}) {
    const safeSettings = isPlainObject(settings) ? clone(settings) : {};
    const common = isPlainObject(safeSettings.common) ? { ...safeSettings.common } : {};
    common.instruction = {
      enabled:instructionState.enabled === true,
      text:String(instructionState.text ?? ""),
      hidden:false
    };
    safeSettings.common = common;
    return safeSettings;
  }

  function validateSystemPublication() {
    if (!systemPublication?.enabled) return true;
    const fail = (message) => {
      setMessage(message, true);
      setSystemPublicationOverlayMessage(message, { isError:true });
      return false;
    };
    const categoryId = String(systemPublication.pedagogical_node_id || "").trim();
    if (!categoryId) {
      return fail("Choisissez l’emplacement de l’activité dans Exploration.");
    }
    if (!getAdminPublicationFolders().some((folder) => String(folder.id) === categoryId)) {
      return fail("L’emplacement Exploration sélectionné n’est plus disponible.");
    }
    return true;
  }

  async function syncSystemCatalogProjection(savedActivity) {
    if (!systemPublication || typeof saveCatalogActivityAsAdmin !== "function") return null;
    const catalogId = String(systemPublication.catalog_id || getSystemCatalogId(savedActivity?.id)).trim().toLowerCase();
    if (!catalogId) return null;

    const existing = adminCatalogActivities.find((item) => String(item?.id || "") === catalogId) || null;
    if (!systemPublication.enabled && !existing) return null;

    const categoryId = String(systemPublication.pedagogical_node_id || existing?.pedagogical_node_id || existing?.folder_id || "").trim();
    if (!categoryId) return null;
    const tier = Math.max(1, Math.trunc(Number(systemPublication.adventure_tier) || Number(existing?.adventure_tier) || 1));
    const categoryChanged = existing && String(existing?.pedagogical_node_id || existing?.folder_id || "") !== categoryId;
    const tierChanged = existing && Math.max(1, Math.trunc(Number(existing?.adventure_tier) || 1)) !== tier;
    const displayOrder = existing && !categoryChanged && !tierChanged
      ? Math.max(0, Math.trunc(Number(existing.display_order) || 0))
      : getNextSystemDisplayOrder(categoryId, tier);
    const levels = editingActivity.difficulty_mode === "adaptive"
      ? clone(levelDrafts)
      : Object.fromEntries(LEVEL_KEYS.map((key) => [key, clone(singleDraft)]));
    const catalogLevels = {
      ...levels,
      [CATALOG_EDITOR_SOURCE_META_KEY]: {
        type:"teacher_activity",
        teacher_activity_id:String(savedActivity?.id || "").trim(),
        version:1
      }
    };

    const savedCatalog = await saveCatalogActivityAsAdmin({
      id:catalogId,
      pedagogical_node_id:categoryId,
      tool_id:getToolId(),
      title:String(savedActivity?.title || editingActivity.title || "Activité"),
      description:String(systemPublication.description || "").trim(),
      adventure_tier:tier,
      display_order:displayOrder,
      status:systemPublication.enabled ? systemPublication.status : "archived",
      default_visible:systemPublication.default_visible !== false,
      levels_json:catalogLevels
    });

    systemPublication.catalog_id = catalogId;
    systemPublication.existed = true;
    systemPublication.display_order = displayOrder;
    adminCatalogActivities = [
      ...adminCatalogActivities.filter((item) => String(item?.id || "") !== catalogId),
      savedCatalog
    ];
    try {
      window.dispatchEvent(new CustomEvent("catalogue:changed", { detail:{ source:"unified-activity-editor", catalogActivityId:catalogId } }));
    } catch {}
    return savedCatalog;
  }

  function getNextSystemDisplayOrder(categoryId, tier = 1) {
    const safeCategoryId = String(categoryId || "").trim();
    const safeTier = Math.max(1, Math.trunc(Number(tier) || 1));
    return adminCatalogActivities
      .filter((item) => String(item?.pedagogical_node_id || item?.folder_id || "") === safeCategoryId)
      .filter((item) => Math.max(1, Math.trunc(Number(item?.adventure_tier) || 1)) === safeTier)
      .reduce((max, item) => Math.max(max, Math.max(0, Math.trunc(Number(item?.display_order) || 0))), 0) + 10;
  }

  async function save({ quiet = false } = {}) {
    if (!editingActivity) return null;
    const title = String(editingActivity.title || "").trim();
    if (!title) {
      setMessage("Donnez un titre à l’activité.", true);
      header?.querySelector(".personal-activity-title-input")?.focus?.();
      return null;
    }
    editingActivity.title = title;

    const toolId = getToolId();
    if (!toolId) {
      setMessage("Choisissez un outil.", true);
      return null;
    }
    const ok = await persistVisibleLevel();
    if (!ok) return null;
    if (!validateSystemPublication()) return null;

    const space = getCurrentTeacherSpace?.();
    if (!space?.id) {
      setMessage("Espace enseignant introuvable.", true);
      return null;
    }

    const payload = {
      ...editingActivity,
      difficulty_mode: editingActivity.difficulty_mode,
      config_json: editingActivity.difficulty_mode === "single"
        ? { tool_id:toolId, level:clone(singleDraft) }
        : { tool_id:toolId },
      levels_json: editingActivity.difficulty_mode === "adaptive"
        ? clone(levelDrafts)
        : {}
    };

    try {
      const saved = await saveTeacherActivityForSpace?.(space.id, payload);
      editingActivity = normalizeActivity(saved || payload);
      if (systemPublication && !systemPublication.catalog_id) {
        systemPublication.catalog_id = getSystemCatalogId(editingActivity.id);
      }
      hydrateDraftsFromActivity();
      const savedCatalogProjection = await syncSystemCatalogProjection(editingActivity);
      if (systemPublication?.enabled) {
        if (!savedCatalogProjection?.id) {
          throw new Error("L’activité a été enregistrée, mais sa publication dans Exploration a échoué.");
        }
        const savedStatus = String(savedCatalogProjection.status || "draft").trim();
        if (savedStatus !== String(systemPublication.status || "draft").trim()) {
          throw new Error("L’activité a été enregistrée, mais son statut de publication n’a pas été appliqué.");
        }
      }
      isDirty = false;
      renderHeader();
      if (!quiet) {
        showToast?.(`Activité « ${editingActivity.title} » enregistrée.`);
      }
      onSaved?.(clone(editingActivity));
      return editingActivity;
    } catch (error) {
      const message = error?.message || "Impossible d’enregistrer cette activité.";
      setMessage(message, true);
      setSystemPublicationOverlayMessage(message, { isError:true });
      return null;
    }
  }

  async function test() {
    let saved = editingActivity?.id ? editingActivity : null;
    if (isDirty || !saved?.id) saved = await save({ quiet:true });
    else {
      const ok = await persistVisibleLevel();
      if (!ok) return;
      saved = await save({ quiet:true });
    }
    if (!saved?.id) return;

    const runtimeActivity = buildRuntimeActivity(saved);
    if (!runtimeActivity) return;
    const space = getCurrentTeacherSpace?.();
    openCatalogTestRunner({
      accessCode:String(space?.access_code || "TEST").trim().toUpperCase() || "TEST",
      activity:runtimeActivity,
      catalogActivities:[runtimeActivity],
      initialLevel:editingActivity.difficulty_mode === "adaptive" ? Number(activeLevel) : 3,
      titleLabel:`Test · ${editingActivity.title}`,
      showLevelSelector:editingActivity.difficulty_mode === "adaptive",
      showToast
    });
  }

  function buildRuntimeActivity(activity = editingActivity) {
    const toolId = getToolId();
    if (!toolId) return null;
    const levels = editingActivity.difficulty_mode === "adaptive"
      ? clone(levelDrafts)
      : Object.fromEntries(LEVEL_KEYS.map((key) => [key, clone(singleDraft)]));
    const baseSettings = editingActivity.difficulty_mode === "adaptive"
      ? clone(levels[DEFAULT_LEVEL]?.settings || levels[activeLevel]?.settings || {})
      : clone(singleDraft.settings || {});
    return {
      id:String(activity?.id || `teacher-activity-${Date.now()}`),
      title:String(editingActivity.title || "Activité"),
      config_name:String(editingActivity.title || "Activité"),
      tool_id:toolId,
      settings:baseSettings,
      difficulty_levels:levels,
      levels_json:levels,
      status:"published",
      is_visible:true
    };
  }

  function changeDifficultyMode(mode) {
    const next = mode === "adaptive" ? "adaptive" : "single";
    if (next === editingActivity.difficulty_mode) return;
    if (next === "adaptive") {
      levelDrafts = Object.fromEntries(LEVEL_KEYS.map((key) => [key, clone(singleDraft)]));
      activeLevel = DEFAULT_LEVEL;
    } else {
      singleDraft = clone(levelDrafts[activeLevel] || levelDrafts[DEFAULT_LEVEL] || makeDefaultLevelDraft());
    }
    editingActivity.difficulty_mode = next;
    markDirty();
    render();
  }

  async function copyCurrentConfigurationToLevel(level) {
    const targetLevel = normalizeLevelKey(level);
    if (editingActivity?.difficulty_mode !== "adaptive" || targetLevel === activeLevel) return;
    const ok = await persistVisibleLevel();
    if (!ok) return;
    levelDrafts[targetLevel] = clone(getCurrentDraft(activeToolModule?.default || null));
    markDirty();
    showToast?.(`Configuration du niveau ${activeLevel} copiée vers le niveau ${targetLevel}.`);
    render();
  }

  function hydrateDraftsFromActivity() {
    const config = isPlainObject(editingActivity?.config_json) ? editingActivity.config_json : {};
    const levels = isPlainObject(editingActivity?.levels_json) ? editingActivity.levels_json : {};
    singleDraft = normalizeLevelDraft(config.level || config.single_level || null);
    levelDrafts = Object.fromEntries(LEVEL_KEYS.map((key) => [key, normalizeLevelDraft(levels[key] || singleDraft)]));
  }

  function syncQuizSourceIntoDrafts() {
    if (!sourceQuiz) return;
    if (editingActivity.difficulty_mode === "adaptive") {
      LEVEL_KEYS.forEach((key) => {
        levelDrafts[key] = {
          ...normalizeLevelDraft(levelDrafts[key]),
          settings:makeQuizSettings(sourceQuiz, levelDrafts[key]?.settings)
        };
      });
    } else {
      singleDraft = {
        ...normalizeLevelDraft(singleDraft),
        settings:makeQuizSettings(sourceQuiz, singleDraft?.settings)
      };
    }
  }

  function getCurrentDraft(tool = null) {
    const source = editingActivity.difficulty_mode === "adaptive"
      ? levelDrafts[activeLevel]
      : singleDraft;
    const draft = normalizeLevelDraft(source);
    if (!Object.keys(draft.settings || {}).length && tool) draft.settings = ensureToolSettings(null, tool);
    return draft;
  }

  function setCurrentDraft(draft) {
    const normalized = normalizeLevelDraft(draft);
    if (editingActivity.difficulty_mode === "adaptive") levelDrafts[activeLevel] = normalized;
    else singleDraft = normalized;
    markDirty();
  }

  function getToolId() {
    if (["quiz", "series"].includes(editingActivity?.activity_type)) return "quiz";
    const config = isPlainObject(editingActivity?.config_json) ? editingActivity.config_json : {};
    return String(config.tool_id || "").trim();
  }

  function setToolId(toolId) {
    const safeId = String(toolId || "").trim();
    editingActivity.config_json = { ...(isPlainObject(editingActivity.config_json) ? editingActivity.config_json : {}), tool_id:safeId };
    singleDraft = makeDefaultLevelDraft();
    levelDrafts = makeDefaultLevels();
    activeToolId = "";
    activeToolModule = null;
    markDirty();
  }

  function openToolPicker() {
    if (editingActivity?.activity_type !== "tool") return;
    closeToolPicker();
    const groups = getToolGroups();
    const selected = getToolId();
    const initialCategory = groups.find((group) => group.tools.some((tool) => String(tool.id) === selected))?.id || groups[0]?.id || "";
    const maxToolCount = Math.max(1, ...groups.map((group) => group.tools.length));
    const pickerHeight = Math.max(420, 112 + maxToolCount * 50);
    const overlay = document.createElement("div");
    overlay.className = "cfg-modal cfg-tool-picker-modal";
    overlay.innerHTML = `
      <div class="cfg-modal-backdrop" data-close-personal-tool-picker="true"></div>
      <div class="panel cfg-modal-card cfg-tool-picker-modal-card personal-tool-picker-card" style="--personal-tool-picker-height:${pickerHeight}px;" role="dialog" aria-modal="true" aria-labelledby="personalToolPickerTitle">
        <div class="cfg-modal-header">
          <div id="personalToolPickerTitle" class="cfg-modal-title">Choisir l’outil</div>
          <button class="btn cfg-modal-close" type="button" data-close-personal-tool-picker="true" aria-label="Fermer" title="Fermer">✕</button>
        </div>
        <div class="cfg-tool-picker-layout" data-personal-tool-picker>
          <nav class="cfg-tool-picker-categories" aria-label="Catégories d’outils">
            ${groups.map((group) => `<button class="cfg-tool-picker-category${group.id === initialCategory ? " is-active" : ""}" type="button" data-personal-tool-category="${escapeAttr(group.id)}">${escapeHtml(group.label)}</button>`).join("")}
          </nav>
          <div class="cfg-tool-picker-list personal-tool-picker-list">
            ${groups.map((group) => `<div class="cfg-tool-picker-panel" data-personal-tool-panel="${escapeAttr(group.id)}" ${group.id === initialCategory ? "" : "hidden"}>${group.tools.map((tool) => renderToolPickerRow(tool, selected)).join("")}</div>`).join("")}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    toolPickerOverlay = overlay;
    overlay.querySelectorAll("[data-close-personal-tool-picker]").forEach((el) => el.addEventListener("click", closeToolPicker));
    overlay.querySelectorAll("[data-personal-tool-category]").forEach((button) => button.addEventListener("click", () => {
      const category = String(button.dataset.personalToolCategory || "");
      closeToolInfoPopovers();
      overlay.querySelectorAll("[data-personal-tool-category]").forEach((item) => item.classList.toggle("is-active", item === button));
      overlay.querySelectorAll("[data-personal-tool-panel]").forEach((panel) => { panel.hidden = String(panel.dataset.personalToolPanel || "") !== category; });
    }));
    overlay.querySelectorAll("[data-personal-tool-id]").forEach((button) => button.addEventListener("click", () => {
      setToolId(button.dataset.personalToolId);
      closeToolPicker();
      render();
    }));
    overlay.querySelectorAll("[data-personal-tool-info]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleToolInfoPopover(button);
    }));
    overlay.addEventListener("click", (event) => {
      if (!event.target.closest?.("[data-personal-tool-info-popover]") && !event.target.closest?.("[data-personal-tool-info]")) closeToolInfoPopovers();
    });
  }

  function renderToolPickerRow(tool, selected) {
    const id = String(tool?.id || "");
    const description = String(tool?.description || "Aucune description disponible.");
    return `
      <div class="personal-tool-picker-row-shell" data-personal-tool-info-shell>
        <button class="cfg-tool-picker-row personal-tool-picker-row${id === selected ? " is-selected" : ""}" type="button" data-personal-tool-id="${escapeAttr(id)}">
          <span class="cfg-tool-picker-row-title">${escapeHtml(tool?.label || id)}</span>
          ${id === selected ? `<span class="dashboard-material-icon personal-tool-picker-selected" aria-hidden="true">check_circle</span>` : ""}
        </button>
        <button class="personal-tool-picker-info" type="button" data-personal-tool-info aria-label="Informations sur ${escapeAttr(tool?.label || id)}" aria-expanded="false">?</button>
        <div class="personal-tool-picker-info-popover" data-personal-tool-info-popover role="tooltip" hidden>${escapeHtml(description)}</div>
      </div>
    `;
  }

  function closeToolInfoPopovers(exceptShell = null) {
    toolPickerOverlay?.querySelectorAll("[data-personal-tool-info-shell]").forEach((shell) => {
      if (shell === exceptShell) return;
      shell.querySelector("[data-personal-tool-info]")?.setAttribute("aria-expanded", "false");
      const popover = shell.querySelector("[data-personal-tool-info-popover]");
      if (popover) popover.hidden = true;
    });
  }

  function toggleToolInfoPopover(button) {
    const shell = button?.closest?.("[data-personal-tool-info-shell]");
    const popover = shell?.querySelector?.("[data-personal-tool-info-popover]");
    if (!shell || !popover) return;
    const shouldOpen = popover.hidden;
    closeToolInfoPopovers(shell);
    popover.hidden = !shouldOpen;
    button.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
  }

  function closeToolPicker() {
    toolPickerOverlay?.remove();
    toolPickerOverlay = null;
  }

  function getToolGroups() {
    const byId = new Map(tools.map((tool) => [String(tool.id || ""), tool]));
    const groups = TOOL_GROUPS.map((group) => ({ ...group, tools:group.toolIds.map((id) => byId.get(id)).filter(Boolean) })).filter((group) => group.tools.length);
    const grouped = new Set(groups.flatMap((group) => group.tools.map((tool) => String(tool.id))));
    const others = tools.filter((tool) => !grouped.has(String(tool.id)));
    if (others.length) groups.push({ id:"autres", label:"Autres", tools:others });
    return groups;
  }

  function findTool(toolId) {
    return activeTools.find((tool) => String(tool.id || "") === String(toolId || "")) || null;
  }

  async function getToolsRuntime() {
    if (!toolsRuntime) toolsRuntime = await loadToolsRuntime();
    return toolsRuntime;
  }

  function getToolContext() {
    const space = getCurrentTeacherSpace?.() || null;
    return {
      activityMode:"individual",
      activity_mode:"individual",
      responseUi:"boxed",
      response_ui:"boxed",
      progressMode:"practice",
      progress_mode:"practice",
      passationProfile:{ activityMode:"individual", responseUi:"boxed", progressMode:"practice" },
      teacherSpace:space,
      teacher_space_id:space?.id || null,
      toolId:getToolId(),
      level:Number(activeLevel) || 3,
      lockQuizSource:true,
      setEditorMessage:(message, isError = false) => setMessage(message, isError),
      clearEditorMessage:() => setMessage("")
    };
  }

  function setMessage(message = "", isError = false) {
    const text = String(message || "").trim();
    if (text) showToast?.(text, { isError:Boolean(isError) });
  }

  function markDirty() {
    isDirty = true;
  }

  function hasUnsavedChanges() {
    return isDirty;
  }

  function getCurrentActivity() {
    return clone(editingActivity);
  }

  return { open, save, test, render, hasUnsavedChanges, getCurrentActivity };
}

export function buildDefaultQuizActivityConfig(quiz, { difficultyMode = "single" } = {}) {
  const level = {
    ...makeDefaultLevelDraft(),
    settings:makeQuizSettings(quiz)
  };
  if (difficultyMode === "adaptive") {
    return {
      config_json:{ tool_id:"quiz" },
      levels_json:Object.fromEntries(LEVEL_KEYS.map((key) => [key, clone(level)]))
    };
  }
  return {
    config_json:{ tool_id:"quiz", level:clone(level) },
    levels_json:{}
  };
}

export function refreshQuizActivityConfig(activity = {}, quiz = {}) {
  const mode = String(activity?.difficulty_mode || "single") === "adaptive" ? "adaptive" : "single";
  const config = isPlainObject(activity?.config_json) ? clone(activity.config_json) : {};
  const levels = isPlainObject(activity?.levels_json) ? clone(activity.levels_json) : {};
  if (mode === "adaptive") {
    const base = normalizeLevelDraft(config.level || null);
    LEVEL_KEYS.forEach((key) => {
      const draft = normalizeLevelDraft(levels[key] || base);
      levels[key] = { ...draft, settings:makeQuizSettings(quiz, draft.settings) };
    });
    return { config_json:{ ...config, tool_id:"quiz", level:undefined }, levels_json:levels };
  }
  const draft = normalizeLevelDraft(config.level || null);
  return {
    config_json:{ ...config, tool_id:"quiz", level:{ ...draft, settings:makeQuizSettings(quiz, draft.settings) } },
    levels_json:{}
  };
}

function makeQuizSettings(quiz = {}, existing = null) {
  const defaults = getDefaultQuizSettings();
  const prior = isPlainObject(existing) ? existing : {};
  const runtime = normalizeQuizRuntimeSettings(
    isPlainObject(prior) && (prior.drawMode || prior.questionSelection)
      ? prior
      : (quiz?.runtimeSettings || {}),
    quiz
  );
  return normalizeQuizSettings({
    ...defaults,
    ...prior,
    quizId:String(quiz?.id || prior.quizId || ""),
    quizTitle:String(quiz?.title || prior.quizTitle || ""),
    sourceInstruction:String(quiz?.instruction || prior.sourceInstruction || ""),
    drawMode:runtime.drawMode,
    questionSelection:runtime.questionSelection,
    quizSnapshot:clone(quiz)
  });
}

function ensureToolSettings(settings, tool) {
  if (isPlainObject(settings) && Object.keys(settings).length) return clone(settings);
  if (tool && typeof tool.getDefaultSettings === "function") {
    try { return clone(tool.getDefaultSettings() || {}); } catch {}
  }
  return {};
}

function normalizeActivity(activity = {}) {
  return {
    ...clone(activity),
    id:String(activity?.id || "").trim() || null,
    folder_id:String(activity?.folder_id || "").trim() || null,
    title:String(activity?.title || "").trim(),
    activity_type:["quiz", "series", "tool"].includes(String(activity?.activity_type || "")) ? String(activity.activity_type) : "tool",
    difficulty_mode:String(activity?.difficulty_mode || "single") === "adaptive" ? "adaptive" : "single",
    source_quiz_id:String(activity?.source_quiz_id || "").trim() || null,
    config_json:isPlainObject(activity?.config_json) ? clone(activity.config_json) : {},
    levels_json:isPlainObject(activity?.levels_json) ? clone(activity.levels_json) : {},
    display_order:Math.max(0, Math.trunc(Number(activity?.display_order) || 0))
  };
}

function normalizeLevelDraft(value) {
  const safe = isPlainObject(value) ? value : {};
  const settings = isPlainObject(safe.settings)
    ? safe.settings
    : (isPlainObject(safe.tool_settings) ? safe.tool_settings : {});
  return {
    ...clone(safe),
    timePerQ:clampTime(safe.timePerQ),
    infiniteTimePerQ:safe.infiniteTimePerQ === true,
    settings:clone(settings)
  };
}

function makeDefaultLevelDraft() {
  return { timePerQ:DEFAULT_TIME_PER_Q, infiniteTimePerQ:false, settings:{} };
}

function makeDefaultLevels() {
  return Object.fromEntries(LEVEL_KEYS.map((key) => [key, makeDefaultLevelDraft()]));
}

function normalizeLevelKey(value) {
  const numeric = Math.max(1, Math.min(5, Math.trunc(Number(value) || 3)));
  return String(numeric);
}

function clampTime(value) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return DEFAULT_TIME_PER_Q;
  return Math.max(TOOL_LIMITS.timePerQ.min, Math.min(TOOL_LIMITS.timePerQ.max, number));
}

function getTypeMeta(type) {
  if (type === "series") return { label:"Série", icon:"view_list" };
  if (type === "quiz") return { label:"Quiz", icon:"quiz" };
  return { label:"Outil", icon:"extension" };
}

function getQuizSourceCount(quiz) {
  if (!quiz || !Array.isArray(quiz.questions)) return null;
  if (String(quiz.editorMode || "") === "series" || quiz.seriesModelId) {
    return quiz.questions.reduce((sum, question) => sum + Math.max(1, Array.isArray(question?.variants) ? question.variants.length : 1), 0);
  }
  return quiz.questions.length;
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === "function") {
    try { return structuredClone(value); } catch {}
  }
  return JSON.parse(JSON.stringify(value));
}
