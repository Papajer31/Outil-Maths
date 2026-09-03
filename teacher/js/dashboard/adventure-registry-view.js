import {
  getPedagogicalNodeGradeLevel,
  isIntrinsicCatalogActivity,
  PEDAGOGICAL_GRADE_LEVELS
} from "../../../shared/catalogue.js";
import { renderMaterialIcon } from "../../../shared/material-icons-svg.js";
import { escapeAttr, escapeHtml } from "./text-utils.js";

const STORAGE_KEY_GRADE = "site-outils.adventure-grade";
const STORAGE_KEY_MENU = "site-outils.adventure-menu";
const STORAGE_KEY_CLASS = "site-outils.adventure-class";
const DEFAULT_GRADE = "CE1";
const MENU_COUNT = 34;
const DAY_COUNT = 4;
const REQUIRED_SLOT_COUNT = 6;

export function createAdventureRegistryViewController({
  adventureHeader,
  adventureList,
  getCurrentTeacherSpace,
  getIsSuperAdmin,
  listPedagogicalNodesForTeacher,
  listCatalogActivitiesForTeacherSpace,
  listCatalogActivitiesForAdmin,
  listAdventureDefaultMenuSlots,
  saveAdventureDefaultMenuSlots,
  listTeacherAdventureMenuSlots,
  saveTeacherAdventureMenuSlot,
  deleteTeacherAdventureMenuSlot,
  deleteTeacherAdventureMenuSlotsForGrade,
  listTeacherClasses,
  listAdventureClassCursors,
  saveAdventureClassCursor,
  showToast
} = {}){
  let pedagogicalNodes = [];
  let catalogActivities = [];
  let objectiveRows = [];
  let objectiveByGradeFolderId = new Map();
  let activityById = new Map();
  let defaultSlots = new Map();
  let teacherSlots = new Map();
  let teacherClasses = [];
  let classCursors = new Map();
  let selectedGrade = readStoredGrade();
  let selectedMenu = readStoredMenu();
  let selectedClassId = readStoredClassId();
  let editingDay = 0;
  let isSuperAdmin = false;
  let hasDefaultDifferences = false;
  let isSaving = false;
  let isCursorSaving = false;
  let baseLoaded = false;
  let loadedGrade = "";
  let pickerElement = null;
  let menuLayout = null;
  let menuClickHandlerBound = false;

  async function refresh({ forceRefresh = false } = {}){
    if (!adventureList) return;
    isSuperAdmin = getIsSuperAdmin?.() === true;
    renderHeader();

    const teacherSpaceId = getTeacherSpaceId();
    if (!teacherSpaceId) {
      adventureList.innerHTML = `<div class="dashboard-activity-empty-state">Crée d’abord ton espace enseignant pour configurer l’Aventure.</div>`;
      return;
    }

    if (!forceRefresh && baseLoaded && loadedGrade === selectedGrade) {
      render();
      return;
    }

    if (!menuLayout?.isConnected) {
      menuLayout = null;
      adventureList.innerHTML = `<div class="dashboard-activity-empty-state">Chargement des menus Aventure…</div>`;
    } else {
      menuLayout.setAttribute("aria-busy", "true");
    }

    try {
      if (!baseLoaded || forceRefresh) {
        const activityRequest = isSuperAdmin
          ? listCatalogActivitiesForAdmin?.()
          : listCatalogActivitiesForTeacherSpace?.(teacherSpaceId);
        const [nextNodes, nextActivities, nextClasses] = await Promise.all([
          listPedagogicalNodesForTeacher?.(),
          activityRequest,
          listTeacherClasses?.(teacherSpaceId)
        ]);
        pedagogicalNodes = Array.isArray(nextNodes) ? nextNodes : [];
        catalogActivities = (Array.isArray(nextActivities) ? nextActivities : [])
          .filter((activity) => activity?.status === "published" && activity?.is_visible !== false);
        teacherClasses = (Array.isArray(nextClasses) ? nextClasses : [])
          .map((item) => ({
            ...item,
            id: Number(item?.id) || null,
            name: String(item?.name || "Classe").trim() || "Classe"
          }))
          .filter((item) => Number.isSafeInteger(item.id) && item.id > 0);
        syncSelectedClass();
        baseLoaded = true;
      }

      await loadSelectedGrade();
      render();
    } catch (error) {
      console.error(error);
      menuLayout = null;
      adventureList.innerHTML = `
        <div class="dashboard-activity-empty-state adventure-registry-error">
          <span class="dashboard-material-icon" aria-hidden="true">database</span>
          <strong>Menus Aventure indisponibles</strong>
          <span>Exécute d’abord le script SQL <code>19_adventure_weekly_menus.sql</code>, puis recharge cette page.</span>
        </div>
      `;
    }
  }

  async function loadSelectedGrade(){
    const teacherSpaceId = getTeacherSpaceId();
    const requests = [
      listAdventureDefaultMenuSlots?.(selectedGrade),
      listTeacherAdventureMenuSlots?.(teacherSpaceId, selectedGrade),
      listAdventureClassCursors?.(teacherClasses.map((item) => item.id), selectedGrade)
    ];
    const [nextDefaults, nextTeacherSlots = [], nextClassCursors = []] = await Promise.all(requests);

    defaultSlots = rowsToMap(nextDefaults);
    teacherSlots = rowsToMap(nextTeacherSlots);
    classCursors = new Map((Array.isArray(nextClassCursors) ? nextClassCursors : [])
      .map((item) => [Number(item?.teacher_class_id), item])
      .filter(([classId]) => Number.isSafeInteger(classId) && classId > 0));
    refreshDefaultDifferences();
    loadedGrade = selectedGrade;
    editingDay = 0;
    rebuildCatalogModel();
  }

  function rebuildCatalogModel(){
    const nodeById = new Map(pedagogicalNodes.map((node) => [String(node?.id || ""), node]));
    const counts = new Map();
    catalogActivities.forEach((activity) => {
      const folderId = String(activity?.pedagogical_node_id || activity?.folder_id || "");
      if (!folderId) return;
      counts.set(folderId, (counts.get(folderId) || 0) + 1);
    });

    objectiveRows = pedagogicalNodes
      .filter((node) => node?.node_type === "grade_level")
      .filter((node) => getPedagogicalNodeGradeLevel(node) === selectedGrade)
      .map((gradeFolder) => buildObjectiveRow(gradeFolder, nodeById, counts))
      .filter(Boolean)
      .sort(compareNaturalPath);

    objectiveByGradeFolderId = new Map(objectiveRows.map((row) => [row.gradeFolderId, row]));
    activityById = new Map(catalogActivities.map((activity) => [String(activity?.id || ""), activity]));
  }

  function buildObjectiveRow(gradeFolder, nodeById, counts){
    const objective = nodeById.get(String(gradeFolder.parent_id || "")) || null;
    const theme = objective ? nodeById.get(String(objective.parent_id || "")) || null : null;
    const domain = theme ? nodeById.get(String(theme.parent_id || "")) || null : null;
    const discipline = domain ? nodeById.get(String(domain.parent_id || "")) || null : null;
    if (objective?.node_type !== "learning_objective" || theme?.node_type !== "theme" || domain?.node_type !== "domain" || discipline?.node_type !== "discipline") return null;

    const pathNodes = [discipline, domain, theme, objective];
    return {
      gradeFolderId: String(gradeFolder.id),
      objectiveName: String(objective.name || objective.id),
      themeName: String(theme.name || theme.id),
      domainName: String(domain.name || domain.id),
      disciplineName: String(discipline.name || discipline.id),
      activityCount: counts.get(String(gradeFolder.id)) || 0,
      naturalPath: pathNodes.map((node) => `${String(Number(node.display_order) || 0).padStart(6, "0")}:${String(node.name || "")}:${String(node.id || "")}`).join("/"),
      searchText: normalizeSearchText([discipline.name, domain.name, theme.name, objective.name].join(" "))
    };
  }

  function render(){
    renderHeader();
    renderMenus();
  }

  function renderHeader(){
    if (!adventureHeader) return;
    const selectedGradeIndex = Math.max(0, PEDAGOGICAL_GRADE_LEVELS.indexOf(selectedGrade));
    const existingTabs = adventureHeader.querySelector(".adventure-registry-grade-tabs");
    const existingSaveButton = adventureHeader.querySelector("[data-action='save-adventure-menus']");
    if (existingTabs && (!!existingSaveButton === isSuperAdmin)) {
      existingTabs.style.setProperty("--adventure-grade-index", String(selectedGradeIndex));
      adventureHeader.querySelectorAll("[data-adventure-grade]").forEach((button) => {
        const isActive = button.dataset.adventureGrade === selectedGrade;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
      });
      if (existingSaveButton) {
        existingSaveButton.disabled = !hasDefaultDifferences || isSaving;
        existingSaveButton.querySelector("span:last-child").textContent = isSaving ? "Enregistrement…" : "Enregistrer";
      }
      return;
    }
    const gradeButtons = PEDAGOGICAL_GRADE_LEVELS.map((grade) => `
      <button
        class="dashboard-view-toggle-btn${grade === selectedGrade ? " is-active" : ""}"
        type="button"
        data-adventure-grade="${escapeAttr(grade)}"
        aria-pressed="${grade === selectedGrade ? "true" : "false"}"
      >${escapeHtml(grade)}</button>
    `).join("");

    adventureHeader.innerHTML = `
      <div class="dashboard-config-header-main">
        <div class="dashboard-section-title">Aventure</div>
      </div>
      <div class="dashboard-config-header-center">
        <div class="dashboard-view-toggle adventure-registry-grade-tabs" role="group" aria-label="Niveau de l’Aventure" style="--adventure-grade-index:${selectedGradeIndex};">
          ${gradeButtons}
        </div>
      </div>
      <div class="dashboard-config-header-actions">
        ${isSuperAdmin ? `
          <button class="btn primary dashboard-btn-with-icon" type="button" data-action="save-adventure-menus" ${!hasDefaultDifferences || isSaving ? "disabled" : ""}>
            ${renderMaterialIcon("save", { className: "dashboard-material-icon" })}
            <span>${isSaving ? "Enregistrement…" : "Enregistrer"}</span>
          </button>
        ` : ""}
      </div>
    `;

    adventureHeader.querySelectorAll("[data-adventure-grade]").forEach((button) => {
      button.addEventListener("click", () => selectGrade(button.dataset.adventureGrade));
    });
    adventureHeader.querySelector("[data-action='save-adventure-menus']")?.addEventListener("click", saveAdminMenus);
  }

  function renderMenus(){
    if (!adventureList) return;
    ensureMenuLayout();
    renderMenuNavigation();
    renderWeekPane();
    menuLayout?.removeAttribute("aria-busy");
  }

  function ensureMenuLayout(){
    if (menuLayout?.isConnected) return;
    adventureList.innerHTML = `
      <div class="adventure-weekly-layout">
        <aside class="panel adventure-menu-nav-pane" aria-label="Menus hebdomadaires">
          <div class="adventure-menu-nav-head"><strong></strong></div>
          <div class="adventure-menu-nav-list"></div>
        </aside>
        <div class="dashboard-activity-splitter" role="separator" aria-orientation="vertical" aria-label="Séparateur entre les panneaux"></div>
        <section class="panel adventure-week-pane"></section>
      </div>
    `;
    menuLayout = adventureList.querySelector(".adventure-weekly-layout");
    if (!menuClickHandlerBound) {
      adventureList.addEventListener("click", handleMenuClick);
      adventureList.addEventListener("change", handleMenuChange);
      menuClickHandlerBound = true;
    }
  }

  function renderMenuNavigation(){
    const navHead = menuLayout?.querySelector(".adventure-menu-nav-head strong");
    const navList = menuLayout?.querySelector(".adventure-menu-nav-list");
    if (!navHead || !navList) return;
    navHead.textContent = `Menus ${selectedGrade}`;
    const currentCursor = getSelectedClassCursor();
    const menuButtons = Array.from({ length: MENU_COUNT }, (_, index) => {
      const menuNumber = index + 1;
      const filledCount = countFilledSlots(menuNumber);
      const isCurrent = currentCursor?.is_enabled === true && currentCursor.menu_number === menuNumber;
      return `
        <button class="adventure-menu-nav-btn${selectedMenu === menuNumber ? " is-active" : ""}${isCurrent ? " is-current" : ""}" type="button" data-menu-number="${menuNumber}" ${isCurrent ? `title="Menu actuellement ouvert pour la classe"` : ""}>
          <span>Menu ${menuNumber}</span>
          <span class="adventure-menu-nav-count">${filledCount}/24</span>
        </button>
      `;
    }).join("");
    navList.innerHTML = menuButtons;
  }

  function renderWeekPane(){
    const weekPane = menuLayout?.querySelector(".adventure-week-pane");
    if (!weekPane) return;
    weekPane.setAttribute("aria-label", `Menu ${selectedMenu}`);
    weekPane.innerHTML = `
      ${renderClassCursorBar()}
      <div class="adventure-days-grid">
        ${Array.from({ length: DAY_COUNT }, (_, index) => renderDay(index + 1)).join("")}
      </div>
    `;
  }

  function renderClassCursorBar(){
    if (!teacherClasses.length) {
      return `<div class="adventure-class-cursor-bar is-empty">Crée une classe avant d’ouvrir l’Aventure aux élèves.</div>`;
    }

    const cursor = getSelectedClassCursor();
    const selectedClass = teacherClasses.find((item) => item.id === selectedClassId) || teacherClasses[0];
    const options = teacherClasses.map((item) => `
      <option value="${item.id}"${item.id === selectedClass?.id ? " selected" : ""}>${escapeHtml(item.name)}</option>
    `).join("");
    const status = cursor
      ? `${cursor.is_enabled ? "Ouvert" : "Désactivé"} · Menu ${cursor.menu_number} · Jour ${cursor.day_number}`
      : "Non démarré · clique sur le drapeau d’un jour";

    return `
      <div class="adventure-class-cursor-bar${cursor?.is_enabled ? " is-enabled" : ""}" aria-label="Jour Aventure actuellement ouvert">
        <label class="adventure-class-cursor-class">
          <span>Classe</span>
          <select data-adventure-class-select ${isCursorSaving ? "disabled" : ""}>${options}</select>
        </label>
        <div class="adventure-class-cursor-status">
          ${renderMaterialIcon(cursor?.is_enabled ? "play_arrow" : "pause", { className: "dashboard-material-icon" })}
          <strong>${escapeHtml(status)}</strong>
        </div>
        <div class="adventure-class-cursor-actions">
          ${cursor ? `
            <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="move-class-cursor" data-delta="-1" title="Jour précédent" ${isCursorSaving ? "disabled" : ""}>
              ${renderMaterialIcon("chevron_left", { className: "dashboard-material-icon" })}
            </button>
            <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="move-class-cursor" data-delta="1" title="Jour suivant" ${isCursorSaving ? "disabled" : ""}>
              ${renderMaterialIcon("chevron_right", { className: "dashboard-material-icon" })}
            </button>
            <button class="btn adventure-class-cursor-toggle" type="button" data-action="toggle-class-cursor" ${isCursorSaving ? "disabled" : ""}>
              ${cursor.is_enabled ? "Désactiver" : "Réactiver"}
            </button>
          ` : ""}
        </div>
      </div>
    `;
  }

  function renderDay(dayNumber){
    const isEditing = editingDay === dayNumber;
    const currentCursor = getSelectedClassCursor();
    const isCurrentDay = currentCursor?.is_enabled === true
      && currentCursor.menu_number === selectedMenu
      && currentCursor.day_number === dayNumber;
    return `
      <section class="adventure-day-column${isEditing ? " is-editing" : ""}${isCurrentDay ? " is-current-day" : ""}" data-day-column="${dayNumber}">
        <header class="adventure-day-head">
          <strong>Jour ${dayNumber}</strong>
          <div class="adventure-day-head-actions">
            <button class="dashboard-icon-btn dashboard-material-icon-btn adventure-day-current-btn${isCurrentDay ? " is-active" : ""}" type="button" data-action="set-current-day" data-day-number="${dayNumber}" title="${isCurrentDay ? "Jour actuellement ouvert" : "Ouvrir ce jour aux élèves"}" aria-pressed="${isCurrentDay}" ${!teacherClasses.length || isCursorSaving ? "disabled" : ""}>
              ${renderMaterialIcon(isCurrentDay ? "flag" : "radio_button_unchecked", { className: "dashboard-material-icon" })}
            </button>
            <button class="dashboard-icon-btn dashboard-material-icon-btn${isEditing ? " is-active" : ""}" type="button" data-action="toggle-day-edit" data-day-number="${dayNumber}" title="${isEditing ? "Terminer la modification" : "Modifier ce jour"}" aria-pressed="${isEditing}">
              ${isEditing
                ? renderMaterialIcon("done", { className: "dashboard-material-icon" })
                : `<svg class="adventure-day-edit-icon" xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="#e3e3e3" aria-hidden="true"><path d="m620-284 56-56q6-6 6-14t-6-14L540-505q4-11 6-22t2-25q0-57-40.5-97.5T410-690q-17 0-34 4.5T343-673l94 94-56 56-94-94q-8 16-12.5 33t-4.5 34q0 57 40.5 97.5T408-412q13 0 24.5-2t22.5-6l137 136q6 6 14 6t14-6ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg>`}
            </button>
          </div>
        </header>
        <div class="adventure-day-slots">
          ${Array.from({ length: REQUIRED_SLOT_COUNT }, (_, index) => renderSlot(dayNumber, index + 1, isEditing)).join("")}
          <div class="adventure-menu-slot adventure-menu-slot--adaptive" aria-label="Quatre activités adaptatives automatiques">
            <span class="adventure-slot-adaptive-plus">+4</span>
            <span>activités adaptatives</span>
          </div>
        </div>
      </section>
    `;
  }

  function renderSlot(dayNumber, slotNumber, isEditing){
    const item = getEffectiveSlot(selectedMenu, dayNumber, slotNumber);
    const slotAttrs = `data-day-number="${dayNumber}" data-slot-number="${slotNumber}"`;
    if (!item) {
      return `
        <article class="adventure-menu-slot is-empty" ${slotAttrs}>
          <span class="adventure-slot-number">${slotNumber}</span>
          <div class="adventure-slot-empty-actions">
            <button class="btn adventure-slot-choice-btn" type="button" data-action="choose-objective" ${slotAttrs}>Objectif…</button>
            <span class="adventure-slot-choice-separator" aria-hidden="true">ou</span>
            <button class="btn adventure-slot-choice-btn" type="button" data-action="choose-activity" ${slotAttrs}>Activité…</button>
          </div>
        </article>
      `;
    }

    const info = describeMenuItem(item);
    return `
      <article class="adventure-menu-slot${info.missing ? " is-missing" : ""}" ${slotAttrs}>
        <span class="adventure-slot-number">${slotNumber}</span>
        <div class="adventure-slot-content${isEditing ? " is-editing" : ""}">
          <span class="adventure-slot-kind adventure-slot-kind--${escapeAttr(item.item_type)}">${item.item_type === "activity" ? "Activité" : "Objectif"}</span>
          <strong title="${escapeAttr(info.title)}">${escapeHtml(info.title)}</strong>
          ${isEditing ? `
            <div class="adventure-slot-edit-controls">
              <div class="adventure-slot-edit-targets">
                <button class="btn adventure-slot-choice-btn" type="button" data-action="choose-objective" ${slotAttrs}>Objectif…</button>
                <span class="adventure-slot-choice-separator" aria-hidden="true">ou</span>
                <button class="btn adventure-slot-choice-btn" type="button" data-action="choose-activity" ${slotAttrs}>Activité…</button>
              </div>
              ${renderAdventureSlotExecutionLimit(item, dayNumber, slotNumber, true)}
            </div>
          ` : `
            <span title="${escapeAttr(info.meta)}">${escapeHtml(info.meta)}</span>
            ${renderAdventureSlotExecutionLimit(item, dayNumber, slotNumber, false)}
          `}
        </div>
        <button class="adventure-slot-clear-btn" type="button" data-action="clear-slot" ${slotAttrs} title="Vider cet emplacement" aria-label="Vider cet emplacement">
          ${renderMaterialIcon("close", { className: "dashboard-material-icon" })}
        </button>
      </article>
    `;
  }

  function renderAdventureSlotExecutionLimit(item, dayNumber, slotNumber, isEditing){
    const activity = item?.item_type === "activity" ? activityById.get(String(item.catalog_activity_id || "")) : null;
    if (activity && isIntrinsicCatalogActivity(activity)) {
      return `<span class="adventure-slot-limit-summary is-intrinsic">${renderMaterialIcon("lock", { className: "dashboard-material-icon" })}Toutes les questions</span>`;
    }

    const limit = normalizeLocalExecutionLimit(item?.execution_limit);
    if (!isEditing) {
      const label = limit.mode === "time" ? `${Math.max(1, Math.round(limit.value / 60))} min` : `${limit.value} question${limit.value === 1 ? "" : "s"}`;
      return `<span class="adventure-slot-limit-summary">${escapeHtml(label)}</span>`;
    }

    const attrs = `data-day-number="${dayNumber}" data-slot-number="${slotNumber}"`;
    return `<div class="adventure-slot-limit-editor">
      <select class="student-select" data-adventure-limit-mode ${attrs} aria-label="Règle d’arrêt">
        <option value="questions" ${limit.mode === "questions" ? "selected" : ""}>Questions</option>
        <option value="time" ${limit.mode === "time" ? "selected" : ""}>Temps</option>
      </select>
      <input class="modal-text-input" type="number" min="1" max="${limit.mode === "time" ? 120 : 200}" value="${escapeAttr(limit.mode === "time" ? Math.max(1, Math.round(limit.value / 60)) : limit.value)}" data-adventure-limit-value ${attrs} aria-label="${limit.mode === "time" ? "Minutes" : "Nombre de questions"}">
      <span>${limit.mode === "time" ? "min" : "questions"}</span>
    </div>`;
  }

  function describeMenuItem(item){
    if (item.item_type === "objective") {
      const objective = objectiveByGradeFolderId.get(String(item.grade_folder_id || ""));
      if (!objective) return { title: "Objectif indisponible", meta: String(item.grade_folder_id || ""), missing: true };
      return {
        title: objective.objectiveName,
        meta: `${objective.disciplineName} › ${objective.themeName} · ${objective.activityCount} activité${objective.activityCount === 1 ? "" : "s"}`,
        missing: false
      };
    }

    const activity = activityById.get(String(item.catalog_activity_id || ""));
    if (!activity) return { title: "Activité indisponible", meta: String(item.catalog_activity_id || ""), missing: true };
    const objective = objectiveByGradeFolderId.get(String(activity.pedagogical_node_id || activity.folder_id || ""));
    const tier = Math.max(1, Math.trunc(Number(activity.adventure_tier) || 1));
    return {
      title: String(activity.config_name || activity.title || activity.id),
      meta: `${objective?.objectiveName || "Objectif inconnu"} · Palier ${tier}`,
      missing: false
    };
  }

  function handleMenuClick(event){
    const button = event.target.closest("button");
    if (!button || !adventureList?.contains(button)) return;
    if (button.dataset.menuNumber) {
      selectMenu(button.dataset.menuNumber);
      return;
    }
    if (button.dataset.action === "set-current-day") {
      void saveCurrentClassCursor(selectedMenu, normalizeDayNumber(button.dataset.dayNumber), true);
      return;
    }
    if (button.dataset.action === "move-class-cursor") {
      void moveCurrentClassCursor(Number(button.dataset.delta) || 0);
      return;
    }
    if (button.dataset.action === "toggle-class-cursor") {
      const cursor = getSelectedClassCursor();
      if (cursor) void saveCurrentClassCursor(cursor.menu_number, cursor.day_number, !cursor.is_enabled);
      return;
    }
    if (button.dataset.action === "toggle-day-edit") {
      const dayNumber = normalizeDayNumber(button.dataset.dayNumber);
      const previousDay = editingDay;
      editingDay = editingDay === dayNumber ? 0 : dayNumber;
      if (previousDay && previousDay !== dayNumber) renderDayColumn(previousDay);
      renderDayColumn(dayNumber);
      return;
    }
    if (button.dataset.action === "choose-objective") openPicker("objective", button.dataset.dayNumber, button.dataset.slotNumber);
    if (button.dataset.action === "choose-activity") openPicker("activity", button.dataset.dayNumber, button.dataset.slotNumber);
    if (button.dataset.action === "clear-slot") void setSlot(normalizeDayNumber(button.dataset.dayNumber), normalizeSlotNumber(button.dataset.slotNumber), null);
  }

  function handleMenuChange(event){
    const classSelect = event.target.closest("[data-adventure-class-select]");
    if (classSelect && adventureList?.contains(classSelect)) {
      selectClass(classSelect.value);
      return;
    }

    const modeSelect = event.target.closest("[data-adventure-limit-mode]");
    const valueInput = event.target.closest("[data-adventure-limit-value]");
    const control = modeSelect || valueInput;
    if (!control || !adventureList?.contains(control)) return;

    const dayNumber = normalizeDayNumber(control.dataset.dayNumber);
    const slotNumber = normalizeSlotNumber(control.dataset.slotNumber);
    const item = getEffectiveSlot(selectedMenu, dayNumber, slotNumber);
    if (!item) return;
    const slot = control.closest(".adventure-menu-slot");
    const modeEl = slot?.querySelector("[data-adventure-limit-mode]");
    const valueEl = slot?.querySelector("[data-adventure-limit-value]");
    if (!modeEl || !valueEl) return;
    const mode = String(modeEl.value || "questions") === "time" ? "time" : "questions";
    const previousLimit = normalizeLocalExecutionLimit(item.execution_limit);
    let nextLimit;
    if (modeSelect && mode !== previousLimit.mode) {
      // Changer d’unité repart sur un défaut lisible au lieu de transformer 5 questions en 5 minutes.
      nextLimit = mode === "time" ? { mode: "time", value: 180 } : { mode: "questions", value: 5 };
    } else {
      const amount = Math.max(1, Math.trunc(Number(valueEl.value) || (mode === "time" ? 3 : 5)));
      nextLimit = { mode, value: mode === "time" ? amount * 60 : amount };
    }
    void setSlot(dayNumber, slotNumber, { ...item, execution_limit: nextLimit });
  }

  function renderDayColumn(dayNumber){
    const current = menuLayout?.querySelector(`[data-day-column="${dayNumber}"]`);
    if (current) current.outerHTML = renderDay(dayNumber);
  }

  function updateMenuNavigation(menuNumber = selectedMenu){
    menuLayout?.querySelectorAll("[data-menu-number]").forEach((button) => {
      const isActive = Number(button.dataset.menuNumber) === selectedMenu;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
    const count = menuLayout?.querySelector(`[data-menu-number="${menuNumber}"] .adventure-menu-nav-count`);
    if (count) count.textContent = `${countFilledSlots(menuNumber)}/24`;
  }

  function openPicker(type, dayValue, slotValue){
    closePicker();
    const dayNumber = normalizeDayNumber(dayValue);
    const slotNumber = normalizeSlotNumber(slotValue);
    const rows = type === "activity" ? getActivityPickerRows() : objectiveRows;
    const title = type === "activity" ? "Choisir une activité précise" : "Choisir un objectif";
    const itemButtons = rows.map((row, index) => renderPickerRow(type, row, index)).join("");

    pickerElement = document.createElement("div");
    pickerElement.className = "cfg-modal adventure-menu-picker-modal";
    pickerElement.innerHTML = `
      <div class="cfg-modal-backdrop" data-action="close-picker"></div>
      <div class="cfg-modal-card adventure-menu-picker-card" role="dialog" aria-modal="true" aria-labelledby="adventureMenuPickerTitle">
        <div class="cfg-modal-header">
          <div class="adventure-menu-picker-header-copy">
            <div id="adventureMenuPickerTitle" class="cfg-modal-title">${escapeHtml(title)}</div>
            <div class="cfg-modal-subtitle">Menu ${selectedMenu} · Jour ${dayNumber} · Emplacement ${slotNumber}</div>
          </div>
          <button class="btn cfg-modal-close" type="button" data-action="close-picker" aria-label="Fermer">✕</button>
        </div>
        <div class="adventure-menu-picker-search-wrap">
          ${renderMaterialIcon("search", { className: "dashboard-material-icon" })}
          <input class="modal-text-input adventure-menu-picker-search" type="search" placeholder="Rechercher…" autocomplete="off">
        </div>
        <div class="adventure-menu-picker-list">
          ${itemButtons || `<div class="dashboard-activity-empty-state">Aucun élément disponible pour ${escapeHtml(selectedGrade)}.</div>`}
        </div>
      </div>
    `;
    document.body.appendChild(pickerElement);

    pickerElement.querySelectorAll("[data-action='close-picker']").forEach((button) => button.addEventListener("click", closePicker));
    pickerElement.querySelectorAll("[data-picker-index]").forEach((button) => {
      button.addEventListener("click", async () => {
        const row = rows[Number(button.dataset.pickerIndex)];
        if (!row) return;
        const item = type === "activity"
          ? { item_type: "activity", catalog_activity_id: String(row.id) }
          : { item_type: "objective", grade_folder_id: String(row.gradeFolderId) };
        await setSlot(dayNumber, slotNumber, item);
        closePicker();
      });
    });

    const searchInput = pickerElement.querySelector(".adventure-menu-picker-search");
    searchInput?.addEventListener("input", () => filterPickerRows(searchInput.value));
    window.requestAnimationFrame(() => searchInput?.focus());
  }

  function renderPickerRow(type, row, index){
    if (type === "activity") {
      const objective = objectiveByGradeFolderId.get(String(row.pedagogical_node_id || row.folder_id || ""));
      const title = String(row.config_name || row.title || row.id);
      const tier = Math.max(1, Math.trunc(Number(row.adventure_tier) || 1));
      const searchable = normalizeSearchText(`${title} ${objective?.disciplineName || ""} ${objective?.domainName || ""} ${objective?.themeName || ""} ${objective?.objectiveName || ""} palier ${tier}`);
      return `
        <button class="adventure-menu-picker-row" type="button" data-picker-index="${index}" data-search="${escapeAttr(searchable)}">
          <span class="adventure-picker-row-icon">${renderMaterialIcon("extension", { className: "dashboard-material-icon" })}</span>
          <span class="adventure-picker-row-main">
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(objective ? `${objective.disciplineName} › ${objective.themeName} › ${objective.objectiveName}` : "Objectif inconnu")}</span>
          </span>
          <span class="adventure-picker-row-meta">Palier ${tier}</span>
        </button>
      `;
    }

    return `
      <button class="adventure-menu-picker-row" type="button" data-picker-index="${index}" data-search="${escapeAttr(row.searchText)}">
        <span class="adventure-picker-row-icon">${renderMaterialIcon("flag", { className: "dashboard-material-icon" })}</span>
        <span class="adventure-picker-row-main">
          <strong>${escapeHtml(row.objectiveName)}</strong>
          <span>${escapeHtml(`${row.disciplineName} › ${row.domainName} › ${row.themeName}`)}</span>
        </span>
        <span class="adventure-picker-row-meta">${row.activityCount} activité${row.activityCount === 1 ? "" : "s"}</span>
      </button>
    `;
  }

  function filterPickerRows(value){
    const query = normalizeSearchText(value);
    pickerElement?.querySelectorAll(".adventure-menu-picker-row").forEach((row) => {
      row.hidden = !!query && !String(row.dataset.search || "").includes(query);
    });
  }

  function getActivityPickerRows(){
    const validFolders = new Set(objectiveRows.map((row) => row.gradeFolderId));
    return catalogActivities
      .filter((activity) => validFolders.has(String(activity.pedagogical_node_id || activity.folder_id || "")))
      .sort((a, b) => {
        const objectiveA = objectiveByGradeFolderId.get(String(a.pedagogical_node_id || a.folder_id || ""));
        const objectiveB = objectiveByGradeFolderId.get(String(b.pedagogical_node_id || b.folder_id || ""));
        const pathCompare = compareNaturalPath(objectiveA, objectiveB);
        if (pathCompare) return pathCompare;
        const tierCompare = (Number(a.adventure_tier) || 1) - (Number(b.adventure_tier) || 1);
        if (tierCompare) return tierCompare;
        const orderCompare = (Number(a.display_order) || 0) - (Number(b.display_order) || 0);
        if (orderCompare) return orderCompare;
        return String(a.config_name || a.title || "").localeCompare(String(b.config_name || b.title || ""), "fr", { sensitivity: "base" });
      });
  }

  function closePicker(){
    pickerElement?.remove();
    pickerElement = null;
  }

  async function setSlot(dayNumber, slotNumber, item){
    const key = slotKey(selectedMenu, dayNumber, slotNumber);
    const teacherSpaceId = getTeacherSpaceId();
    if (!teacherSpaceId) return;
    const defaultItem = defaultSlots.get(key) || null;
    const desired = item ? normalizeLocalSlot(selectedMenu, dayNumber, slotNumber, item) : null;

    try {
      if (sameMenuItem(desired, defaultItem)) {
        await deleteTeacherAdventureMenuSlot?.(teacherSpaceId, selectedGrade, selectedMenu, dayNumber, slotNumber);
        teacherSlots.delete(key);
      } else {
        const saved = await saveTeacherAdventureMenuSlot?.(teacherSpaceId, {
          grade_level: selectedGrade,
          menu_number: selectedMenu,
          day_number: dayNumber,
          slot_number: slotNumber,
          ...(desired || { item_type: "empty" })
        });
        teacherSlots.set(key, saved || normalizeLocalSlot(selectedMenu, dayNumber, slotNumber, desired || { item_type: "empty" }));
      }
      refreshDefaultDifferences();
      renderHeader();
      renderSlotElement(dayNumber, slotNumber);
      updateMenuNavigation(selectedMenu);
      showToast?.("Menu personnalisé enregistré.");
    } catch (error) {
      console.error(error);
      showToast?.(error?.message || "Impossible d’enregistrer cette case.", { isError: true });
    }
  }

  async function restoreTeacherDefault(dayNumber, slotNumber){
    const teacherSpaceId = getTeacherSpaceId();
    if (!teacherSpaceId) return;
    const key = slotKey(selectedMenu, dayNumber, slotNumber);
    try {
      await deleteTeacherAdventureMenuSlot?.(teacherSpaceId, selectedGrade, selectedMenu, dayNumber, slotNumber);
      teacherSlots.delete(key);
      refreshDefaultDifferences();
      renderHeader();
      renderSlotElement(dayNumber, slotNumber);
      updateMenuNavigation(selectedMenu);
      showToast?.("Proposition par défaut restaurée.");
    } catch (error) {
      console.error(error);
      showToast?.(error?.message || "Impossible de restaurer la proposition par défaut.", { isError: true });
    }
  }

  async function saveAdminMenus(){
    if (!isSuperAdmin || !hasDefaultDifferences || isSaving) return;
    isSaving = true;
    renderHeader();
    try {
      const payload = collectEffectiveSlots();
      const saved = await saveAdventureDefaultMenuSlots?.(selectedGrade, payload);
      defaultSlots = rowsToMap(saved);
      const teacherSpaceId = getTeacherSpaceId();
      if (teacherSpaceId && teacherSlots.size) {
        try {
          await deleteTeacherAdventureMenuSlotsForGrade?.(teacherSpaceId, selectedGrade);
          teacherSlots = new Map();
        } catch (cleanupError) {
          console.warn("Les personnalisations devenues inutiles n’ont pas pu être nettoyées.", cleanupError);
        }
      }
      refreshDefaultDifferences();
      showToast?.(`Menus système ${selectedGrade} enregistrés.`);
      renderMenus();
    } catch (error) {
      console.error(error);
      showToast?.(error?.message || "Impossible d’enregistrer les menus Aventure.", { isError: true });
    } finally {
      isSaving = false;
      renderHeader();
    }
  }

  async function selectGrade(value){
    const grade = PEDAGOGICAL_GRADE_LEVELS.includes(String(value || "")) ? String(value) : DEFAULT_GRADE;
    if (grade === selectedGrade) return;
    selectedGrade = grade;
    editingDay = 0;
    closePicker();
    try { localStorage.setItem(STORAGE_KEY_GRADE, selectedGrade); } catch {}
    menuLayout?.setAttribute("aria-busy", "true");
    renderHeader();
    try {
      await loadSelectedGrade();
      render();
    } catch (error) {
      console.error(error);
      showToast?.(error?.message || "Impossible de charger ce niveau.", { isError: true });
    }
  }

  function selectMenu(value){
    const nextMenu = normalizeMenuNumber(value);
    if (nextMenu === selectedMenu) return;
    selectedMenu = nextMenu;
    editingDay = 0;
    closePicker();
    try { localStorage.setItem(STORAGE_KEY_MENU, String(selectedMenu)); } catch {}
    updateMenuNavigation();
    renderWeekPane();
  }

  function syncSelectedClass(){
    if (teacherClasses.some((item) => item.id === selectedClassId)) return;
    selectedClassId = teacherClasses[0]?.id || null;
    if (selectedClassId) {
      try { localStorage.setItem(STORAGE_KEY_CLASS, String(selectedClassId)); } catch {}
    }
  }

  function selectClass(value){
    const classId = Number(value);
    if (!teacherClasses.some((item) => item.id === classId) || classId === selectedClassId) return;
    selectedClassId = classId;
    try { localStorage.setItem(STORAGE_KEY_CLASS, String(selectedClassId)); } catch {}
    renderMenuNavigation();
    renderWeekPane();
  }

  function getSelectedClassCursor(){
    if (!Number.isSafeInteger(selectedClassId) || selectedClassId <= 0) return null;
    return classCursors.get(selectedClassId) || null;
  }

  async function saveCurrentClassCursor(menuNumber, dayNumber, isEnabled){
    if (isCursorSaving || !Number.isSafeInteger(selectedClassId) || selectedClassId <= 0) return;
    isCursorSaving = true;
    renderWeekPane();
    try {
      const saved = await saveAdventureClassCursor?.(selectedClassId, selectedGrade, {
        menu_number: normalizeMenuNumber(menuNumber),
        day_number: normalizeDayNumber(dayNumber),
        is_enabled: isEnabled === true
      });
      if (!saved) throw new Error("Le curseur Aventure n’a pas été enregistré.");
      classCursors.set(selectedClassId, saved);
      selectedMenu = normalizeMenuNumber(saved.menu_number);
      try { localStorage.setItem(STORAGE_KEY_MENU, String(selectedMenu)); } catch {}
      showToast?.(saved.is_enabled
        ? `Aventure ouverte : menu ${saved.menu_number}, jour ${saved.day_number}.`
        : "Aventure désactivée pour cette classe et ce niveau.");
    } catch (error) {
      console.error(error);
      showToast?.(error?.message || "Impossible de modifier le jour Aventure.", { isError: true });
    } finally {
      isCursorSaving = false;
      renderMenuNavigation();
      renderWeekPane();
    }
  }

  async function moveCurrentClassCursor(delta){
    const cursor = getSelectedClassCursor();
    const direction = Math.sign(Number(delta) || 0);
    if (!cursor || !direction) return;
    const currentIndex = ((normalizeMenuNumber(cursor.menu_number) - 1) * DAY_COUNT) + (normalizeDayNumber(cursor.day_number) - 1);
    const nextIndex = Math.max(0, Math.min((MENU_COUNT * DAY_COUNT) - 1, currentIndex + direction));
    if (nextIndex === currentIndex) return;
    const nextMenu = Math.floor(nextIndex / DAY_COUNT) + 1;
    const nextDay = (nextIndex % DAY_COUNT) + 1;
    await saveCurrentClassCursor(nextMenu, nextDay, cursor.is_enabled === true);
  }

  function renderSlotElement(dayNumber, slotNumber){
    const current = menuLayout?.querySelector(`[data-day-number="${dayNumber}"][data-slot-number="${slotNumber}"]`);
    if (current) current.outerHTML = renderSlot(dayNumber, slotNumber, editingDay === dayNumber);
  }

  function getEffectiveSlot(menuNumber, dayNumber, slotNumber){
    const key = slotKey(menuNumber, dayNumber, slotNumber);
    const override = teacherSlots.get(key);
    if (override) return override.item_type === "empty" ? null : override;
    return defaultSlots.get(key) || null;
  }

  function collectEffectiveSlots(){
    const slots = [];
    for (let menuNumber = 1; menuNumber <= MENU_COUNT; menuNumber += 1) {
      for (let dayNumber = 1; dayNumber <= DAY_COUNT; dayNumber += 1) {
        for (let slotNumber = 1; slotNumber <= REQUIRED_SLOT_COUNT; slotNumber += 1) {
          const item = getEffectiveSlot(menuNumber, dayNumber, slotNumber);
          if (!item) continue;
          slots.push({
            grade_level: selectedGrade,
            menu_number: menuNumber,
            day_number: dayNumber,
            slot_number: slotNumber,
            item_type: item.item_type,
            grade_folder_id: item.item_type === "objective" ? item.grade_folder_id : null,
            catalog_activity_id: item.item_type === "activity" ? item.catalog_activity_id : null,
            execution_limit: normalizeLocalExecutionLimit(item.execution_limit)
          });
        }
      }
    }
    return slots;
  }

  function refreshDefaultDifferences(){
    if (!isSuperAdmin) {
      hasDefaultDifferences = false;
      return;
    }
    hasDefaultDifferences = false;
    for (let menuNumber = 1; menuNumber <= MENU_COUNT && !hasDefaultDifferences; menuNumber += 1) {
      for (let dayNumber = 1; dayNumber <= DAY_COUNT && !hasDefaultDifferences; dayNumber += 1) {
        for (let slotNumber = 1; slotNumber <= REQUIRED_SLOT_COUNT; slotNumber += 1) {
          const key = slotKey(menuNumber, dayNumber, slotNumber);
          if (!sameMenuItem(getEffectiveSlot(menuNumber, dayNumber, slotNumber), defaultSlots.get(key) || null)) {
            hasDefaultDifferences = true;
            break;
          }
        }
      }
    }
  }

  function countFilledSlots(menuNumber){
    let total = 0;
    for (let day = 1; day <= DAY_COUNT; day += 1) {
      for (let slot = 1; slot <= REQUIRED_SLOT_COUNT; slot += 1) {
        if (getEffectiveSlot(menuNumber, day, slot)) total += 1;
      }
    }
    return total;
  }

  function getTeacherSpaceId(){
    const id = Number(getCurrentTeacherSpace?.()?.id);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  }

  return {
    refresh,
    render,
    hasUnsavedChanges: () => false
  };
}

function rowsToMap(rows){
  return new Map((Array.isArray(rows) ? rows : []).map((item) => [slotKey(item.menu_number, item.day_number, item.slot_number), item]));
}

function normalizeLocalSlot(menuNumber, dayNumber, slotNumber, item = {}){
  const itemType = ["objective", "activity", "empty"].includes(String(item?.item_type || "")) ? String(item.item_type) : "empty";
  return {
    ...item,
    menu_number: normalizeMenuNumber(menuNumber),
    day_number: normalizeDayNumber(dayNumber),
    slot_number: normalizeSlotNumber(slotNumber),
    item_type: itemType,
    grade_folder_id: itemType === "objective" ? String(item?.grade_folder_id || "") : null,
    catalog_activity_id: itemType === "activity" ? String(item?.catalog_activity_id || "") : null,
    execution_limit: normalizeLocalExecutionLimit(item?.execution_limit ?? item?.executionLimit)
  };
}

function normalizeLocalExecutionLimit(value){
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const mode = String(raw.mode || "questions").trim() === "time" ? "time" : "questions";
  const fallback = mode === "time" ? 180 : 5;
  const amount = Math.max(1, Math.trunc(Number(raw.value) || fallback));
  return { mode, value: mode === "time" ? Math.min(7200, amount) : Math.min(200, amount) };
}

function sameExecutionLimit(a, b){
  const left = normalizeLocalExecutionLimit(a);
  const right = normalizeLocalExecutionLimit(b);
  return left.mode === right.mode && left.value === right.value;
}

function sameMenuItem(a, b){
  if (!a && !b) return true;
  if (!a || !b || a.item_type !== b.item_type) return false;
  if (!sameExecutionLimit(a.execution_limit, b.execution_limit)) return false;
  if (a.item_type === "objective") return String(a.grade_folder_id || "") === String(b.grade_folder_id || "");
  if (a.item_type === "activity") return String(a.catalog_activity_id || "") === String(b.catalog_activity_id || "");
  return true;
}

function slotKey(menuNumber, dayNumber, slotNumber){
  return `${normalizeMenuNumber(menuNumber)}:${normalizeDayNumber(dayNumber)}:${normalizeSlotNumber(slotNumber)}`;
}

function normalizeMenuNumber(value){
  return Math.max(1, Math.min(MENU_COUNT, Math.trunc(Number(value) || 1)));
}

function normalizeDayNumber(value){
  return Math.max(1, Math.min(DAY_COUNT, Math.trunc(Number(value) || 1)));
}

function normalizeSlotNumber(value){
  return Math.max(1, Math.min(REQUIRED_SLOT_COUNT, Math.trunc(Number(value) || 1)));
}

function readStoredClassId(){
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY_CLASS));
    if (Number.isSafeInteger(stored) && stored > 0) return stored;
  } catch {}
  return null;
}

function readStoredGrade(){
  try {
    const stored = String(localStorage.getItem(STORAGE_KEY_GRADE) || "");
    if (PEDAGOGICAL_GRADE_LEVELS.includes(stored)) return stored;
  } catch {}
  return DEFAULT_GRADE;
}

function readStoredMenu(){
  try { return normalizeMenuNumber(localStorage.getItem(STORAGE_KEY_MENU)); } catch { return 1; }
}

function compareNaturalPath(a, b){
  return String(a?.naturalPath || "").localeCompare(String(b?.naturalPath || ""), "fr", { sensitivity: "base" });
}

function normalizeSearchText(value){
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .trim();
}
