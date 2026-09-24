import { isIntrinsicCatalogActivity, normalizeCatalogActivity } from "../../../shared/catalogue.js";
import { bindStepperField, refreshStepper, renderStepperField } from "../../../shared/config-widgets.js";
import { escapeAttr, escapeHtml } from "./text-utils.js";

const LEVELS = [1, 2, 3, 4, 5];

export function createSequenceEditorController({
  view,
  getCurrentTeacherSpace,
  listCatalogActivitiesForTeacherSpace,
  listPedagogicalNodesForTeacher,
  listTeacherActivitiesForSpace,
  listTeacherActivityFoldersForSpace,
  saveTeacherSequenceForSpace,
  showToast,
  onSaved,
  onClose
} = {}) {
  let editorHost = null;
  let motion = null;
  let closeTimer = null;
  let draft = null;
  let catalogActivities = [];
  let catalogNodes = [];
  let teacherActivities = [];
  let teacherActivityFolders = [];
  let sourceType = null;
  let catalogPickerFolderId = null;
  let teacherPickerFolderId = null;
  let searchQuery = "";
  let draggedSequenceCard = null;
  let sequenceDragInitialOrder = [];
  const sequenceReflowAnimations = new WeakMap();
  const sequenceItemControlIds = new WeakMap();
  let nextSequenceItemControlId = 0;

  async function open(sequence = null, { folderId = null } = {}) {
    const space = getCurrentTeacherSpace?.();
    if (!space?.id || !view) return;
    try {
      const [catalog, nodes, personal, personalFolders] = await Promise.all([
        listCatalogActivitiesForTeacherSpace?.(space.id) || [],
        listPedagogicalNodesForTeacher?.() || [],
        listTeacherActivitiesForSpace?.(space.id) || [],
        listTeacherActivityFoldersForSpace?.(space.id) || []
      ]);
      catalogActivities = Array.isArray(catalog) ? catalog : [];
      catalogNodes = Array.isArray(nodes) ? nodes : [];
      teacherActivities = Array.isArray(personal) ? personal : [];
      teacherActivityFolders = Array.isArray(personalFolders) ? personalFolders : [];
      draft = sequence
        ? clone(sequence)
        : {
            id:null,
            teacher_space_id:space.id,
            folder_id:String(folderId || "").trim() || null,
            title:"",
            items:[]
          };
      draft.items = Array.isArray(draft.items) ? draft.items : [];
      if (!("folder_id" in draft)) draft.folder_id = String(folderId || "").trim() || null;
      sourceType = null;
      catalogPickerFolderId = null;
      teacherPickerFolderId = null;
      searchQuery = "";
      render({ animate:true });
    } catch (error) {
      showToast?.(error?.message || "Impossible d’ouvrir l’éditeur de séquence.", { isError:true });
    }
  }

  function render({ animate = false } = {}) {
    if (!view || !draft) return;
    const shouldAnimate = animate || !editorHost;
    clearTimeout(closeTimer);
    closeTimer = null;
    cancelMotion();
    editorHost?.remove();
    editorHost = document.createElement("aside");
    editorHost.className = "dashboard-mission-editor-host dashboard-sequence-editor-host";
    editorHost.setAttribute("role", "dialog");
    editorHost.setAttribute("aria-modal", "true");
    editorHost.setAttribute("aria-label", "Éditeur de séquence");
    editorHost.innerHTML = `
      <section class="panel dashboard-mission-editor dashboard-sequence-editor">
        <div class="dashboard-config-header dashboard-mission-editor-head">
          <div class="dashboard-config-header-main dashboard-mission-editor-head-main">
            <button class="dashboard-back-btn dashboard-material-icon-btn" type="button" data-action="close-sequence-editor" title="Retour à Mes activités" aria-label="Retour à Mes activités">
              <span class="dashboard-material-icon" aria-hidden="true">arrow_back</span>
            </button>
            <span class="dashboard-mini-pill">Séquence</span>
            <label class="dashboard-mission-title-field">
              <input
                class="dashboard-mission-title-input"
                type="text"
                data-sequence-title
                value="${escapeAttr(draft.title || "")}"
                placeholder="Titre de la séquence"
                aria-label="Titre de la séquence"
                autocomplete="off"
                required
              >
            </label>
          </div>
          <div class="dashboard-config-header-center dashboard-mission-editor-head-center">
            <span class="dashboard-mission-editor-name">Éditeur de séquence</span>
          </div>
          <div class="dashboard-config-header-actions dashboard-mission-editor-head-actions">
            <div id="sequenceEditorMessage" class="modal-message"></div>
            <button class="btn primary dashboard-btn-with-icon" type="button" data-action="save-sequence">
              <span class="dashboard-material-icon" aria-hidden="true">save</span>
              <span>Enregistrer</span>
            </button>
          </div>
        </div>

        <div class="dashboard-mission-compose-grid dashboard-sequence-compose-grid">
          <section class="panel dashboard-mission-catalog-panel">
            <div class="dashboard-sequence-panel-heading">ACTIVITÉS</div>
            <label class="dashboard-mission-catalog-search">
              <span class="dashboard-material-icon" aria-hidden="true">search</span>
              <input class="modal-text-input" type="search" data-sequence-search value="${escapeAttr(searchQuery)}" placeholder="Rechercher une activité…" autocomplete="off">
            </label>
            <div id="sequenceSourceBreadcrumb" class="dashboard-sequence-picker-breadcrumb-slot">${renderSourceBreadcrumb()}</div>
            <div id="sequenceSourcePicker" class="dashboard-mission-catalog-results dashboard-sequence-source-results">${renderSourcePicker()}</div>
          </section>

          <section class="panel dashboard-mission-sequence-panel">
            <div class="dashboard-sequence-panel-heading">SÉQUENCE</div>
            <div class="dashboard-mission-step-list dashboard-sequence-step-list">
              ${draft.items.length
                ? draft.items.map((item, index) => renderSequenceItem(item, index)).join("")
                : `<div class="dashboard-activity-empty-state">Ajoute au moins une activité.</div>`}
            </div>
          </section>
        </div>
      </section>
    `;
    view.append(editorHost);
    bindEvents();
    const openingHost = editorHost;
    const focusNewSequenceTitle = () => window.requestAnimationFrame(() => {
      if (editorHost !== openingHost || draft?.id) return;
      const titleInput = openingHost.querySelector("[data-sequence-title]");
      titleInput?.focus?.({ preventScroll:true });
    });
    if (shouldAnimate) {
      editorHost.classList.remove("is-open", "is-closing");
      const opening = runMotion(editorHost, true);
      if (opening) opening.finished.then(focusNewSequenceTitle).catch(() => {});
      else requestAnimationFrame(() => {
        editorHost?.classList.add("is-open");
        focusNewSequenceTitle();
      });
    } else {
      editorHost.classList.add("is-open");
      focusNewSequenceTitle();
    }
  }

  function renderSourcePicker() {
    const query = normalizeSearch(searchQuery);
    if (query) return renderSearchResults(query);
    if (!sourceType) return `
      ${renderSourceRoot("catalog_activity", "Activités du site", "account_tree")}
      ${renderSourceRoot("teacher_activity", "Mes activités", "folder_shared")}
    `;
    return sourceType === "teacher_activity" ? renderTeacherActivityPicker() : renderCatalogPicker();
  }

  function renderSearchResults(query) {
    const catalog = getEligibleCatalogActivities()
      .filter((activity) => normalizeSearch(`${getSourceTitle(activity)} ${getCatalogActivityPath(activity)}`).includes(query))
      .map((activity) => renderSourceActivity(activity, "catalog_activity", getCatalogActivityPath(activity) || "Activités du site"));
    const personal = teacherActivities
      .filter((activity) => normalizeSearch(`${getSourceTitle(activity)} ${getTeacherActivityPath(activity)}`).includes(query))
      .map((activity) => renderSourceActivity(activity, "teacher_activity", getTeacherActivityPath(activity) || "Mes activités"));
    return [...catalog, ...personal].join("") || `<div class="dashboard-activity-empty-state">Aucun résultat.</div>`;
  }

  function renderCatalogPicker() {
    const currentNode = getCatalogNode(catalogPickerFolderId);
    const childNodes = catalogNodes
      .filter((node) => String(node?.parent_id || "") === String(currentNode?.id || ""))
      .sort(compareByOrderAndName);
    const activities = getEligibleCatalogActivities()
      .filter((activity) => String(activity?.pedagogical_node_id || activity?.folder_id || "") === String(currentNode?.id || ""))
      .sort(compareByOrderAndTitle);
    return `
      ${currentNode
        ? renderParentFolder(currentNode.parent_id ? "catalog-node" : "catalog-root", currentNode.parent_id)
        : renderParentFolder("picker-root", null)}
      ${childNodes.map((node) => renderPickerFolder(node, "catalog-node")).join("")}
      ${activities.map((activity) => renderSourceActivity(activity, "catalog_activity", "")).join("")}
      ${currentNode && !childNodes.length && !activities.length ? `<div class="dashboard-activity-empty-state">Aucune activité dans ce dossier.</div>` : ""}
    `;
  }

  function renderTeacherActivityPicker() {
    const currentFolder = getTeacherActivityFolder(teacherPickerFolderId);
    const childFolders = teacherActivityFolders
      .filter((folder) => String(folder?.parent_id || "") === String(currentFolder?.id || ""))
      .sort(compareByOrderAndName);
    const activities = teacherActivities
      .filter((activity) => String(activity?.folder_id || "") === String(currentFolder?.id || ""))
      .sort(compareByOrderAndTitle);
    return `
      ${currentFolder
        ? renderParentFolder(currentFolder.parent_id ? "teacher-folder" : "teacher-root", currentFolder.parent_id)
        : renderParentFolder("picker-root", null)}
      ${childFolders.map((folder) => renderPickerFolder(folder, "teacher-folder")).join("")}
      ${activities.map((activity) => renderSourceActivity(activity, "teacher_activity", "")).join("")}
      ${currentFolder && !childFolders.length && !activities.length ? `<div class="dashboard-activity-empty-state">Aucune activité dans ce dossier.</div>` : ""}
    `;
  }

  function renderSourceRoot(type, label, icon) {
    return `<button class="dashboard-mission-catalog-folder dashboard-sequence-source-root" type="button" data-sequence-picker-action="open-source" data-source-type="${type}"><span class="dashboard-material-icon" aria-hidden="true">${icon}</span><span>${label}</span><span class="dashboard-material-icon dashboard-mission-catalog-chevron" aria-hidden="true">chevron_right</span></button>`;
  }

  function renderSourceBreadcrumb() {
    if (searchQuery || !sourceType) return "";
    const personal = sourceType === "teacher_activity";
    return renderPickerBreadcrumb(
      personal ? "Mes activités" : "Activités du site",
      personal ? "teacher-root" : "catalog-root",
      personal ? getTeacherActivityBreadcrumb(teacherPickerFolderId) : getCatalogBreadcrumb(catalogPickerFolderId),
      personal ? "teacher-folder" : "catalog-node"
    );
  }

  function renderPickerBreadcrumb(rootLabel, rootAction, breadcrumb, itemAction) {
    const renderCrumb = (label, action, folderId, current = false) => `<button class="dashboard-breadcrumb-btn${current ? " is-current" : ""}" type="button" data-sequence-picker-action="${action}" ${folderId ? `data-folder-id="${escapeAttr(folderId)}"` : ""}>${escapeHtml(label)}</button>`;
    const separator = () => `<span class="dashboard-breadcrumb-separator" aria-hidden="true">›</span>`;
    const rootCrumb = (current = false) => renderCrumb(rootLabel, rootAction, null, current);
    const folderCrumb = (folder, current = false) => renderCrumb(getFolderLabel(folder), itemAction, folder.id, current);
    const content = breadcrumb.length > 2
      ? [
          `<details class="dashboard-breadcrumb-overflow"><summary class="dashboard-breadcrumb-btn dashboard-breadcrumb-overflow-trigger" aria-label="Afficher le chemin complet" title="Afficher le chemin complet">…</summary><div class="dashboard-breadcrumb-overflow-menu">${rootCrumb()}${breadcrumb.map((folder, index) => folderCrumb(folder, index === breadcrumb.length - 1)).join("")}</div></details>`,
          separator(),
          folderCrumb(breadcrumb[breadcrumb.length - 2]),
          separator(),
          folderCrumb(breadcrumb[breadcrumb.length - 1], true)
        ].join("")
      : [
          rootCrumb(!breadcrumb.length),
          ...breadcrumb.flatMap((folder, index) => [separator(), folderCrumb(folder, index === breadcrumb.length - 1)])
        ].join("");
    return `<nav class="dashboard-breadcrumb dashboard-sequence-picker-breadcrumb" aria-label="Arborescence des activités">${content}</nav>`;
  }

  function renderParentFolder(action, folderId) {
    return `<button class="dashboard-mission-catalog-folder dashboard-mission-catalog-folder--parent" type="button" data-sequence-picker-action="${action}" ${folderId ? `data-folder-id="${escapeAttr(folderId)}"` : ""}><span class="dashboard-material-icon" aria-hidden="true">arrow_upward</span><span>Dossier parent</span></button>`;
  }

  function renderPickerFolder(folder, action) {
    return `<button class="dashboard-mission-catalog-folder" type="button" data-sequence-picker-action="${action}" data-folder-id="${escapeAttr(folder.id)}"><span class="dashboard-material-icon" aria-hidden="true">folder</span><span>${escapeHtml(getFolderLabel(folder))}</span><span class="dashboard-material-icon dashboard-mission-catalog-chevron" aria-hidden="true">chevron_right</span></button>`;
  }

  function renderSourceActivity(activity, type, meta) {
    const personal = type === "teacher_activity";
    return `<button class="dashboard-mission-catalog-activity dashboard-sequence-source-item" type="button" data-add-sequence-source="${escapeAttr(getSourceId(activity))}" data-source-type="${type}"><span class="dashboard-material-icon" aria-hidden="true">${personal ? getPersonalTypeIcon(activity) : "extension"}</span><span class="dashboard-mission-catalog-activity-copy"><strong>${escapeHtml(getSourceTitle(activity))}</strong>${meta ? `<small>${escapeHtml(meta)}</small>` : ""}</span></button>`;
  }

  function getSequenceItemControlId(item) {
    if (!item || typeof item !== "object") return "sequence_limit_fallback";
    let id = sequenceItemControlIds.get(item);
    if (!id) {
      nextSequenceItemControlId += 1;
      id = `sequence_limit_${nextSequenceItemControlId}`;
      sequenceItemControlIds.set(item, id);
    }
    return id;
  }

  function renderSequenceItem(item, index) {
    const source = findSource(item.source_type, item.source_id);
    const intrinsic = source ? isSourceIntrinsic(item.source_type, source) : item.execution_limit_mode === "intrinsic";
    const adaptiveAvailable = source ? isAdaptiveAvailableFor(item.source_type, source) : item.difficulty_mode === "adaptive";
    const difficulty = item.difficulty_mode === "adaptive" ? "adaptive" : String(item.difficulty_level || 3);
    const mode = intrinsic ? "intrinsic" : (String(item.execution_limit_mode || "questions") === "time" ? "time" : "questions");
    const value = Math.max(1, Number(item.execution_limit_value) || (mode === "time" ? 300 : 5));
    const displayedLimitValue = mode === "time" ? Math.max(1, Math.round(value / 60)) : value;
    const limitStepperId = getSequenceItemControlId(item);
    const title = item.title_snapshot || getSourceTitle(source) || "Activité";
    const difficultyHtml = `
      <div class="dashboard-mission-step-difficulty">
        <span class="dashboard-mission-step-setting-label">Difficulté :</span>
        <select class="student-select dashboard-mission-step-difficulty-select" data-sequence-item-difficulty="${index}" aria-label="Difficulté de l’activité">
          ${adaptiveAvailable ? `<option value="adaptive" ${difficulty === "adaptive" ? "selected" : ""}>Adaptative</option>` : ""}
          ${LEVELS.map((level) => `<option value="${level}" ${difficulty !== "adaptive" && Number(difficulty) === level ? "selected" : ""}>N${level}</option>`).join("")}
        </select>
      </div>
    `;
    const limitHtml = intrinsic
      ? `<div class="dashboard-mission-step-limit is-intrinsic"><span class="dashboard-material-icon" aria-hidden="true">lock</span><span>Toutes les questions · contenu de l’activité</span></div>`
      : `<div class="dashboard-mission-step-limit">
          <span class="dashboard-mission-step-setting-label">Passation :</span>
          <select class="student-select dashboard-mission-step-limit-mode" data-sequence-item-limit-mode="${index}" aria-label="Règle d’arrêt">
            <option value="questions" ${mode === "questions" ? "selected" : ""}>Questions</option>
            <option value="time" ${mode === "time" ? "selected" : ""}>Temps</option>
          </select>
          ${renderStepperField({
            id:limitStepperId,
            label:mode === "time" ? "Durée en minutes" : "Nombre de questions",
            value:displayedLimitValue,
            inputMin:1,
            inputMax:mode === "time" ? 120 : 200,
            step:1,
            fieldClassName:"dashboard-sequence-limit-stepper"
          })}
          <span class="dashboard-mission-step-limit-unit">${mode === "time" ? "min" : "questions"}</span>
        </div>`;
    return `
      <div class="dashboard-class-card dashboard-mission-step-card dashboard-sequence-step-card" data-sequence-item-index="${index}" draggable="true">
        <div class="dashboard-sequence-step-number" aria-hidden="true">${index + 1}</div>
        <div class="dashboard-class-card-main dashboard-mission-step-main">
          <div class="dashboard-class-card-heading">
            <span class="dashboard-class-card-title">${escapeHtml(title)}</span>
          </div>
          <div class="dashboard-mission-step-settings">${difficultyHtml}${limitHtml}</div>
        </div>
        <div class="dashboard-class-card-actions">
          <button class="dashboard-icon-btn dashboard-material-icon-btn is-danger" type="button" data-action="remove-sequence-item" data-index="${index}" title="Retirer"><span class="dashboard-material-icon" aria-hidden="true">delete</span></button>
        </div>
      </div>
    `;
  }

  function bindEvents() {
    editorHost?.querySelector("[data-action='close-sequence-editor']")?.addEventListener("click", () => close());
    editorHost?.querySelector("[data-sequence-title]")?.addEventListener("input", (event) => {
      if (draft) draft.title = String(event.target?.value || "");
    });
    editorHost?.querySelector("[data-action='save-sequence']")?.addEventListener("click", () => void save());
    editorHost?.querySelector("[data-sequence-search]")?.addEventListener("input", (event) => {
      searchQuery = String(event.target?.value || "");
      renderSourcePickerIntoHost({ resetScroll:true });
    });
    bindSourcePickerEvents();
    bindSequenceListEvents();
  }

  function renderSourcePickerIntoHost({ resetScroll = false } = {}) {
    const breadcrumbHost = editorHost?.querySelector("#sequenceSourceBreadcrumb");
    const host = editorHost?.querySelector("#sequenceSourcePicker");
    if (!host) return;
    if (breadcrumbHost) breadcrumbHost.innerHTML = renderSourceBreadcrumb();
    host.innerHTML = renderSourcePicker();
    if (resetScroll) host.scrollTop = 0;
    bindSourcePickerEvents();
  }

  function bindSourcePickerEvents() {
    editorHost?.querySelectorAll("[data-sequence-picker-action]").forEach((button) => button.addEventListener("click", () => {
      const action = String(button.dataset.sequencePickerAction || "");
      if (action === "open-source") {
        sourceType = button.dataset.sourceType === "teacher_activity" ? "teacher_activity" : "catalog_activity";
        catalogPickerFolderId = null;
        teacherPickerFolderId = null;
      } else if (action === "picker-root") {
        sourceType = null;
        catalogPickerFolderId = null;
        teacherPickerFolderId = null;
      } else if (action === "catalog-root") {
        sourceType = "catalog_activity";
        catalogPickerFolderId = null;
      } else if (action === "teacher-root") {
        sourceType = "teacher_activity";
        teacherPickerFolderId = null;
      } else if (action === "catalog-node") {
        sourceType = "catalog_activity";
        catalogPickerFolderId = String(button.dataset.folderId || "").trim() || null;
      } else if (action === "teacher-folder") {
        sourceType = "teacher_activity";
        teacherPickerFolderId = String(button.dataset.folderId || "").trim() || null;
      } else {
        return;
      }
      clearSearch();
      renderSourcePickerIntoHost({ resetScroll:true });
    }));
    editorHost?.querySelectorAll("[data-add-sequence-source]").forEach((button) => button.addEventListener("click", () => {
      syncItemControls();
      const itemSourceType = button.dataset.sourceType === "teacher_activity" ? "teacher_activity" : "catalog_activity";
      const source = findSource(itemSourceType, button.dataset.addSequenceSource);
      if (!source || !draft) return;
      const intrinsic = isSourceIntrinsic(itemSourceType, source);
      const adaptive = isAdaptiveAvailableFor(itemSourceType, source);
      draft.items.push({
        source_type:itemSourceType,
        source_id:getSourceId(source),
        title_snapshot:getSourceTitle(source),
        difficulty_mode:adaptive ? "adaptive" : "fixed",
        difficulty_level:adaptive ? null : 3,
        execution_limit_mode:intrinsic ? "intrinsic" : "questions",
        execution_limit_value:intrinsic ? null : 5
      });
      appendSequenceItem(draft.items.length - 1);
    }));
  }

  function clearSearch() {
    searchQuery = "";
    const search = editorHost?.querySelector("[data-sequence-search]");
    if (search) search.value = "";
  }

  function syncItemControls({ changingLimitIndex = -1 } = {}) {
    if (!draft?.items) return;
    draft.items.forEach((item, index) => {
      const source = findSource(item.source_type, item.source_id);
      const intrinsic = source ? isSourceIntrinsic(item.source_type, source) : item.execution_limit_mode === "intrinsic";
      const difficultyEl = editorHost?.querySelector(`[data-sequence-item-difficulty="${index}"]`);
      if (difficultyEl) {
        const value = String(difficultyEl.value || "3");
        item.difficulty_mode = value === "adaptive" ? "adaptive" : "fixed";
        item.difficulty_level = value === "adaptive" ? null : Math.max(1, Math.min(5, Math.trunc(Number(value) || 3)));
      }
      if (intrinsic) {
        item.execution_limit_mode = "intrinsic";
        item.execution_limit_value = null;
        return;
      }
      const modeEl = editorHost?.querySelector(`[data-sequence-item-limit-mode="${index}"]`);
      const card = editorHost?.querySelector(`[data-sequence-item-index="${index}"]`);
      const valueEl = card?.querySelector(".dashboard-sequence-limit-stepper .tv-input-stepper");
      if (!modeEl || !valueEl) return;
      const mode = String(modeEl.value || "questions") === "time" ? "time" : "questions";
      if (index === changingLimitIndex && mode !== item.execution_limit_mode) {
        item.execution_limit_mode = mode;
        item.execution_limit_value = mode === "time" ? 300 : 5;
        return;
      }
      const raw = Math.max(1, Math.trunc(Number(valueEl.value) || (mode === "time" ? 5 : 5)));
      item.execution_limit_mode = mode;
      item.execution_limit_value = mode === "time" ? raw * 60 : raw;
    });
  }

  function bindSequenceListEvents() {
    const list = editorHost?.querySelector(".dashboard-sequence-step-list");
    if (!list) return;
    bindSequenceSteppers(list);
    list.addEventListener("click", (event) => {
      const button = event.target instanceof Element
        ? event.target.closest("[data-action='remove-sequence-item']")
        : null;
      if (!button) return;
      const index = Number(button.dataset.index);
      if (!Number.isInteger(index) || !draft?.items?.[index]) return;
      syncItemControls();
      removeSequenceItem(index);
    });
    list.addEventListener("change", (event) => {
      const control = event.target instanceof Element ? event.target : null;
      if (!control) return;
      if (control.matches("[data-sequence-item-limit-mode]")) {
        const index = Number(control.dataset.sequenceItemLimitMode);
        syncItemControls({ changingLimitIndex:index });
        updateSequenceLimitControl(index);
        return;
      }
      if (control.matches("[data-sequence-item-difficulty], .dashboard-sequence-limit-stepper .tv-input-stepper")) {
        syncItemControls();
      }
    });
    list.addEventListener("dragstart", (event) => {
      const card = event.target instanceof Element
        ? event.target.closest(".dashboard-sequence-step-card")
        : null;
      if (!card || event.target.closest("button, input, select, textarea, a, label")) {
        event.preventDefault();
        return;
      }
      syncItemControls();
      draggedSequenceCard = card;
      sequenceDragInitialOrder = Array.from(list.querySelectorAll(".dashboard-sequence-step-card"));
      card.setAttribute("aria-grabbed", "true");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(card.dataset.sequenceItemIndex || ""));
      window.requestAnimationFrame(() => {
        card.classList.add("is-dragging");
        list.classList.add("is-reordering");
      });
    });
    list.addEventListener("dragend", () => {
      if (!draggedSequenceCard) return;
      restoreSequenceDomOrder(list);
      finishSequenceDrag(list);
    });
    list.addEventListener("dragover", (event) => {
      if (!draggedSequenceCard) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      autoScrollSequenceList(list, event.clientY);
      const reference = Array.from(list.querySelectorAll(".dashboard-sequence-step-card"))
        .filter((card) => card !== draggedSequenceCard)
        .find((card) => event.clientY < card.getBoundingClientRect().top + card.getBoundingClientRect().height / 2) || null;
      if (reference === draggedSequenceCard.nextElementSibling || (!reference && draggedSequenceCard === list.lastElementChild)) return;
      moveSequenceCardInDom(list, draggedSequenceCard, reference);
    });
    list.addEventListener("drop", (event) => {
      if (!draggedSequenceCard || !draft?.items) return;
      event.preventDefault();
      const previousItems = [...draft.items];
      const indexes = Array.from(list.querySelectorAll(".dashboard-sequence-step-card"))
        .map((card) => Number(card.dataset.sequenceItemIndex));
      if (indexes.length === previousItems.length && indexes.every((index) => Number.isInteger(index) && previousItems[index])) {
        draft.items = indexes.map((index) => previousItems[index]);
      }
      reindexSequenceCards(list);
      finishSequenceDrag(list);
    });
  }

  function appendSequenceItem(index) {
    const list = editorHost?.querySelector(".dashboard-sequence-step-list");
    const item = draft?.items?.[index];
    if (!list || !item) return;
    const scrollTop = list.scrollTop;
    list.querySelector(".dashboard-activity-empty-state")?.remove();
    list.insertAdjacentHTML("beforeend", renderSequenceItem(item, index));
    const card = list.querySelector(`[data-sequence-item-index="${index}"]`);
    if (card) bindSequenceSteppers(card);
    list.scrollTop = scrollTop;
    window.requestAnimationFrame(() => {
      if (list.isConnected) list.scrollTop = scrollTop;
    });
  }

  function removeSequenceItem(index) {
    const list = editorHost?.querySelector(".dashboard-sequence-step-list");
    const card = list?.querySelector(`[data-sequence-item-index="${index}"]`);
    if (!list || !card || !draft?.items?.[index]) return;
    const cards = Array.from(list.querySelectorAll(".dashboard-sequence-step-card"));
    const previousTops = captureSequenceCardTops(cards);
    draft.items.splice(index, 1);
    card.remove();
    if (!draft.items.length) {
      list.innerHTML = `<div class="dashboard-activity-empty-state">Ajoute au moins une activité.</div>`;
      return;
    }
    reindexSequenceCards(list);
    animateSequenceCards(cards.filter((item) => item !== card && item.isConnected), previousTops);
  }

  function updateSequenceLimitControl(index) {
    const item = draft?.items?.[index];
    const card = editorHost?.querySelector(`[data-sequence-item-index="${index}"]`);
    if (!item || !card || item.execution_limit_mode === "intrinsic") return;
    const mode = item.execution_limit_mode === "time" ? "time" : "questions";
    const value = card.querySelector(".dashboard-sequence-limit-stepper .tv-input-stepper");
    const unit = card.querySelector(".dashboard-mission-step-limit-unit");
    const label = mode === "time" ? "Durée en minutes" : "Nombre de questions";
    if (value) {
      value.max = mode === "time" ? "120" : "200";
      value.value = mode === "time"
        ? String(Math.max(1, Math.round((Number(item.execution_limit_value) || 300) / 60)))
        : String(Math.max(1, Number(item.execution_limit_value) || 5));
    }
    if (unit) unit.textContent = mode === "time" ? "min" : "questions";
    const stepper = card.querySelector(".dashboard-sequence-limit-stepper .tv-stepper");
    const fieldLabel = card.querySelector(".dashboard-sequence-limit-stepper .tv-stepper-field-label");
    if (stepper) stepper.setAttribute("aria-label", label);
    if (fieldLabel) fieldLabel.textContent = label;
    stepper?.querySelector('[data-stepper-direction="-1"]')?.setAttribute("aria-label", `Diminuer ${label}`);
    stepper?.querySelector('[data-stepper-direction="1"]')?.setAttribute("aria-label", `Augmenter ${label}`);
    refreshStepper(card, getSequenceItemControlId(item), { inputMin:1, inputMax:mode === "time" ? 120 : 200 });
  }

  function reindexSequenceCards(list) {
    Array.from(list.querySelectorAll(".dashboard-sequence-step-card")).forEach((card, index) => {
      const item = draft?.items?.[index];
      card.dataset.sequenceItemIndex = String(index);
      const number = card.querySelector(".dashboard-sequence-step-number");
      if (number) number.textContent = String(index + 1);
      const title = card.querySelector(".dashboard-class-card-title");
      if (title && item) title.textContent = item.title_snapshot || getSourceTitle(findSource(item.source_type, item.source_id)) || "Activité";
      const remove = card.querySelector("[data-action='remove-sequence-item']");
      if (remove) remove.dataset.index = String(index);
      updateIndexedAttribute(card, "data-sequence-item-difficulty", index);
      updateIndexedAttribute(card, "data-sequence-item-limit-mode", index);
    });
  }

  function bindSequenceSteppers(root) {
    const cards = root.matches?.(".dashboard-sequence-step-card")
      ? [root]
      : Array.from(root.querySelectorAll(".dashboard-sequence-step-card"));
    cards.forEach((card) => {
      const index = Number(card.dataset.sequenceItemIndex);
      const item = draft?.items?.[index];
      const input = card.querySelector(".dashboard-sequence-limit-stepper .tv-input-stepper");
      if (!item || !input || input.dataset.sequenceStepperBound === "true") return;
      input.dataset.sequenceStepperBound = "true";
      const mode = item.execution_limit_mode === "time" ? "time" : "questions";
      bindStepperField(card, getSequenceItemControlId(item), {
        inputMin:1,
        inputMax:mode === "time" ? 120 : 200,
        onChange:() => syncItemControls()
      });
    });
  }

  function updateIndexedAttribute(card, attribute, index) {
    const control = card.querySelector(`[${attribute}]`);
    if (!control) return;
    control.setAttribute(attribute, String(index));
  }

  function restoreSequenceDomOrder(list) {
    if (!sequenceDragInitialOrder.length) return;
    const cards = Array.from(list.querySelectorAll(".dashboard-sequence-step-card"));
    const previousTops = captureSequenceCardTops(cards);
    sequenceDragInitialOrder.forEach((card) => list.append(card));
    animateSequenceCards(cards, previousTops);
  }

  function finishSequenceDrag(list) {
    draggedSequenceCard?.classList.remove("is-dragging");
    draggedSequenceCard?.removeAttribute("aria-grabbed");
    draggedSequenceCard = null;
    sequenceDragInitialOrder = [];
    list.classList.remove("is-reordering");
  }

  function moveSequenceCardInDom(list, card, reference) {
    const cards = Array.from(list.querySelectorAll(".dashboard-sequence-step-card"));
    const previousTops = captureSequenceCardTops(cards);
    list.insertBefore(card, reference);
    animateSequenceCards(cards.filter((item) => item !== card), previousTops);
  }

  function captureSequenceCardTops(cards) {
    const positions = new Map(cards.map((item) => [item, item.getBoundingClientRect().top]));
    cards.forEach((item) => {
      const animation = sequenceReflowAnimations.get(item);
      if (!animation) return;
      try { animation.cancel(); } catch {}
      sequenceReflowAnimations.delete(item);
    });
    return positions;
  }

  function animateSequenceCards(cards, previousTops) {
    cards.forEach((item) => {
      if (typeof item.animate !== "function") return;
      const delta = previousTops.get(item) - item.getBoundingClientRect().top;
      if (!delta) return;
      const animation = item.animate(
        [{ transform:`translate3d(0, ${delta}px, 0)` }, { transform:"translate3d(0, 0, 0)" }],
        { duration:120, easing:"cubic-bezier(.2,.8,.2,1)" }
      );
      sequenceReflowAnimations.set(item, animation);
      animation.finished.finally(() => {
        if (sequenceReflowAnimations.get(item) === animation) sequenceReflowAnimations.delete(item);
      }).catch(() => {});
    });
  }

  function autoScrollSequenceList(list, pointerY) {
    const bounds = list.getBoundingClientRect();
    const edge = Math.min(64, bounds.height / 4);
    if (pointerY < bounds.top + edge) list.scrollTop -= 14;
    else if (pointerY > bounds.bottom - edge) list.scrollTop += 14;
  }

  async function save() {
    if (!draft) return;
    syncItemControls();
    draft.title = String(editorHost?.querySelector("[data-sequence-title]")?.value || draft.title || "").trim();
    const message = editorHost?.querySelector("#sequenceEditorMessage");
    if (!draft.title) {
      if (message) message.textContent = "Donne un titre à la séquence.";
      return;
    }
    if (!draft.items.length) {
      if (message) message.textContent = "Ajoute au moins une activité.";
      return;
    }
    const button = editorHost?.querySelector("[data-action='save-sequence']");
    if (button) button.disabled = true;
    try {
      const saved = await saveTeacherSequenceForSpace?.(getCurrentTeacherSpace?.().id, draft);
      showToast?.(`Séquence « ${saved?.title || draft.title} » enregistrée.`);
      await onSaved?.(saved);
      close({ notify:false });
    } catch (error) {
      if (message) message.textContent = error?.message || "Enregistrement impossible.";
      if (button) button.disabled = false;
    }
  }

  function close({ notify = true } = {}) {
    const host = editorHost;
    draft = null;
    const finish = () => {
      clearTimeout(closeTimer);
      closeTimer = null;
      host?.remove();
      if (editorHost === host) editorHost = null;
      if (notify) onClose?.();
    };
    if (!host) {
      finish();
      return;
    }
    host.classList.add("is-closing");
    const closing = runMotion(host, false);
    if (closing) {
      closing.finished.then(finish).catch(() => finish());
      return;
    }
    host.classList.remove("is-open");
    closeTimer = window.setTimeout(finish, 420);
  }

  function cancelMotion() {
    if (!motion) return;
    const current = motion;
    motion = null;
    try { current.cancel(); } catch {}
  }

  function runMotion(host, openState) {
    if (!host?.animate) return null;
    cancelMotion();
    host.classList.add("is-animating");
    if (openState) host.classList.add("is-opening");
    const current = host.animate(
      openState
        ? [{ transform:"translate3d(0,112%,0)" }, { transform:"translate3d(0,0,0)" }]
        : [{ transform:"translate3d(0,0,0)" }, { transform:"translate3d(0,100%,0)" }],
      {
        duration:openState ? 450 : 400,
        easing:openState ? "cubic-bezier(.22,1,.36,1)" : "cubic-bezier(.55,0,1,.45)",
        fill:"both"
      }
    );
    motion = current;
    current.finished.then(() => {
      if (motion !== current) return;
      if (openState) host.classList.add("is-open");
      else host.classList.remove("is-open");
      motion = null;
      host.classList.remove("is-animating", "is-opening");
      try { current.cancel(); } catch {}
    }).catch(() => {});
    return current;
  }

  function findSource(type, id) {
    const source = type === "teacher_activity" ? teacherActivities : catalogActivities;
    return source.find((item) => getSourceId(item) === String(id || "")) || null;
  }

  function getEligibleCatalogActivities() {
    return catalogActivities.filter((activity) => activity?.is_visible !== false && String(activity?.status || "published") === "published");
  }

  function getCatalogNode(id) {
    const safeId = String(id || "").trim();
    return catalogNodes.find((node) => String(node?.id || "") === safeId) || null;
  }

  function getTeacherActivityFolder(id) {
    const safeId = String(id || "").trim();
    return teacherActivityFolders.find((folder) => String(folder?.id || "") === safeId) || null;
  }

  function getBreadcrumb(id, getItem) {
    const result = [];
    const seen = new Set();
    let cursor = getItem(id);
    while (cursor && !seen.has(String(cursor.id))) {
      seen.add(String(cursor.id));
      result.unshift(cursor);
      cursor = getItem(cursor.parent_id);
    }
    return result;
  }

  function getCatalogBreadcrumb(id) {
    return getBreadcrumb(id, getCatalogNode);
  }

  function getTeacherActivityBreadcrumb(id) {
    return getBreadcrumb(id, getTeacherActivityFolder);
  }

  function getFolderLabel(folder) {
    return String(folder?.name || folder?.student_label || folder?.id || "").trim();
  }

  function getCatalogActivityPath(activity) {
    return [
      "Activités du site",
      ...getCatalogBreadcrumb(activity?.pedagogical_node_id || activity?.folder_id).map(getFolderLabel)
    ].filter(Boolean).join(" › ");
  }

  function getTeacherActivityPath(activity) {
    return [
      "Mes activités",
      ...getTeacherActivityBreadcrumb(activity?.folder_id).map(getFolderLabel)
    ].filter(Boolean).join(" › ");
  }

  function getSourceId(source) {
    return String(source?.id || source?.catalog_activity_id || "").trim();
  }

  function getSourceTitle(source) {
    return String(source?.config_name || source?.title || "Activité").trim() || "Activité";
  }

  function isAdaptiveAvailableFor(type, source) {
    if (type === "catalog_activity") return true;
    return String(source?.difficulty_mode || "single") === "adaptive";
  }

  function isSourceIntrinsic(type, source) {
    if (!source) return false;
    const runtimeSource = type === "teacher_activity" ? teacherActivityToCatalogShape(source) : normalizeCatalogActivity(source);
    return isIntrinsicCatalogActivity(runtimeSource);
  }

  function teacherActivityToCatalogShape(activity = {}) {
    const adaptive = String(activity?.difficulty_mode || "single") === "adaptive";
    const config = isPlainObject(activity?.config_json) ? activity.config_json : {};
    const single = isPlainObject(config.level) ? config.level : {};
    const levels = adaptive && isPlainObject(activity?.levels_json)
      ? activity.levels_json
      : Object.fromEntries(LEVELS.map((level) => [String(level), clone(single)]));
    return normalizeCatalogActivity({
      id:`teacher-activity.${String(activity?.id || "")}`,
      config_name:getSourceTitle(activity),
      title:getSourceTitle(activity),
      tool_id:String(config.tool_id || "").trim(),
      levels_json:levels,
      status:"published",
      default_visible:true
    });
  }

  function getPersonalTypeLabel(activity) {
    const type = String(activity?.activity_type || "tool");
    if (type === "series") return "Série";
    if (type === "quiz") return "Quiz";
    return "Outil";
  }

  function getPersonalTypeIcon(activity) {
    const type = String(activity?.activity_type || "tool");
    if (type === "series") return "view_list";
    if (type === "quiz") return "quiz";
    return "extension";
  }

  return { open, close };
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function compareByOrderAndName(a, b) {
  const orderA = Number(a?.display_order) || 0;
  const orderB = Number(b?.display_order) || 0;
  if (orderA !== orderB) return orderA - orderB;
  return String(a?.name || "").localeCompare(String(b?.name || ""), "fr", { sensitivity:"base" });
}

function compareByOrderAndTitle(a, b) {
  const orderA = Number(a?.display_order) || 0;
  const orderB = Number(b?.display_order) || 0;
  if (orderA !== orderB) return orderA - orderB;
  return String(a?.config_name || a?.title || "").localeCompare(String(b?.config_name || b?.title || ""), "fr", { sensitivity:"base" });
}
