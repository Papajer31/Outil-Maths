import { isIntrinsicCatalogActivity, normalizeCatalogActivity } from "../../../shared/catalogue.js";
import { escapeAttr, escapeHtml } from "./text-utils.js";

const LEVELS = [1, 2, 3, 4, 5];

export function createSequenceEditorController({
  view,
  getCurrentTeacherSpace,
  listCatalogActivitiesForTeacherSpace,
  listTeacherActivitiesForSpace,
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
  let teacherActivities = [];
  let sourceType = "catalog_activity";
  let searchQuery = "";

  async function open(sequence = null, { folderId = null } = {}) {
    const space = getCurrentTeacherSpace?.();
    if (!space?.id || !view) return;
    try {
      const [catalog, personal] = await Promise.all([
        listCatalogActivitiesForTeacherSpace?.(space.id) || [],
        listTeacherActivitiesForSpace?.(space.id) || []
      ]);
      catalogActivities = Array.isArray(catalog) ? catalog : [];
      teacherActivities = Array.isArray(personal) ? personal : [];
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
      sourceType = "catalog_activity";
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
            <div class="dashboard-mission-panel-title">Ajouter une activité</div>
            <div class="dashboard-sequence-source-tabs" role="tablist" aria-label="Origine des activités">
              <button class="btn${sourceType === "catalog_activity" ? " primary" : ""}" type="button" data-sequence-source-tab="catalog_activity">Exploration</button>
              <button class="btn${sourceType === "teacher_activity" ? " primary" : ""}" type="button" data-sequence-source-tab="teacher_activity">Mes activités</button>
            </div>
            <label class="dashboard-mission-catalog-search">
              <span class="dashboard-material-icon" aria-hidden="true">search</span>
              <input class="modal-text-input" type="search" data-sequence-search value="${escapeAttr(searchQuery)}" placeholder="Rechercher une activité…" autocomplete="off">
            </label>
            <div class="dashboard-mission-catalog-results dashboard-sequence-source-results">
              ${renderSourceList()}
            </div>
          </section>

          <section class="panel dashboard-mission-sequence-panel">
            <div class="dashboard-mission-panel-title">Suite de la séquence <span class="dashboard-mini-pill">${draft.items.length}</span></div>
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

  function renderSourceList() {
    const source = sourceType === "teacher_activity" ? teacherActivities : catalogActivities;
    const query = normalizeSearch(searchQuery);
    const filtered = source
      .filter((activity) => !query || normalizeSearch(getSourceTitle(activity)).includes(query))
      .sort((a, b) => getSourceTitle(a).localeCompare(getSourceTitle(b), "fr", { sensitivity:"base" }));
    if (!filtered.length) return `<div class="dashboard-activity-empty-state">Aucune activité disponible.</div>`;
    return filtered.map((activity) => {
      const id = getSourceId(activity);
      const personal = sourceType === "teacher_activity";
      const meta = personal
        ? `${getPersonalTypeLabel(activity)} · ${String(activity?.difficulty_mode || "single") === "adaptive" ? "Adaptative" : "Difficulté unique"}`
        : "Exploration";
      return `
        <button class="dashboard-mission-catalog-activity dashboard-sequence-source-item" type="button" data-add-sequence-source="${escapeAttr(id)}">
          <span class="dashboard-material-icon" aria-hidden="true">${personal ? getPersonalTypeIcon(activity) : "extension"}</span>
          <span class="dashboard-mission-catalog-activity-copy">
            <strong>${escapeHtml(getSourceTitle(activity))}</strong>
            <small>${escapeHtml(meta)}</small>
          </span>
        </button>
      `;
    }).join("");
  }

  function renderSequenceItem(item, index) {
    const source = findSource(item.source_type, item.source_id);
    const intrinsic = source ? isSourceIntrinsic(item.source_type, source) : item.execution_limit_mode === "intrinsic";
    const adaptiveAvailable = source ? isAdaptiveAvailableFor(item.source_type, source) : item.difficulty_mode === "adaptive";
    const difficulty = item.difficulty_mode === "adaptive" ? "adaptive" : String(item.difficulty_level || 3);
    const mode = intrinsic ? "intrinsic" : (String(item.execution_limit_mode || "questions") === "time" ? "time" : "questions");
    const value = Math.max(1, Number(item.execution_limit_value) || (mode === "time" ? 300 : 5));
    const title = item.title_snapshot || getSourceTitle(source) || "Activité";
    const origin = item.source_type === "teacher_activity" ? "Mes activités" : "Exploration";
    const difficultyHtml = `
      <div class="dashboard-mission-step-difficulty">
        <span class="dashboard-mission-step-setting-label">Difficulté</span>
        <select class="student-select dashboard-mission-step-difficulty-select" data-sequence-item-difficulty="${index}" aria-label="Difficulté de l’activité">
          ${adaptiveAvailable ? `<option value="adaptive" ${difficulty === "adaptive" ? "selected" : ""}>Adaptative</option>` : ""}
          ${LEVELS.map((level) => `<option value="${level}" ${difficulty !== "adaptive" && Number(difficulty) === level ? "selected" : ""}>N${level}</option>`).join("")}
        </select>
      </div>
    `;
    const limitHtml = intrinsic
      ? `<div class="dashboard-mission-step-limit is-intrinsic"><span class="dashboard-material-icon" aria-hidden="true">lock</span><span>Toutes les questions · contenu de l’activité</span></div>`
      : `<div class="dashboard-mission-step-limit">
          <select class="student-select dashboard-mission-step-limit-mode" data-sequence-item-limit-mode="${index}" aria-label="Règle d’arrêt">
            <option value="questions" ${mode === "questions" ? "selected" : ""}>Questions</option>
            <option value="time" ${mode === "time" ? "selected" : ""}>Temps</option>
          </select>
          <input class="modal-text-input dashboard-mission-step-limit-value" type="number" min="1" max="${mode === "time" ? 120 : 200}" step="1" data-sequence-item-limit-value="${index}" value="${escapeAttr(mode === "time" ? Math.max(1, Math.round(value / 60)) : value)}">
          <span class="dashboard-mission-step-limit-unit">${mode === "time" ? "min" : "questions"}</span>
        </div>`;
    return `
      <div class="dashboard-class-card dashboard-mission-step-card" data-sequence-item-index="${index}">
        <div class="dashboard-class-card-main dashboard-mission-step-main" style="cursor:default;">
          <div class="dashboard-class-card-heading">
            <span class="dashboard-class-card-title">${index + 1}. ${escapeHtml(title)}</span>
            <span class="dashboard-mini-pill">${escapeHtml(origin)}</span>
          </div>
          <div class="dashboard-mission-step-settings">${difficultyHtml}${limitHtml}</div>
        </div>
        <div class="dashboard-class-card-actions">
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="move-sequence-item-up" data-index="${index}" ${index <= 0 ? "disabled" : ""} title="Monter"><span class="dashboard-material-icon" aria-hidden="true">arrow_upward</span></button>
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="move-sequence-item-down" data-index="${index}" ${index >= draft.items.length - 1 ? "disabled" : ""} title="Descendre"><span class="dashboard-material-icon" aria-hidden="true">arrow_downward</span></button>
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
    editorHost?.querySelectorAll("[data-sequence-source-tab]").forEach((button) => button.addEventListener("click", () => {
      syncItemControls();
      sourceType = button.dataset.sequenceSourceTab === "teacher_activity" ? "teacher_activity" : "catalog_activity";
      searchQuery = "";
      render();
    }));
    editorHost?.querySelector("[data-sequence-search]")?.addEventListener("input", (event) => {
      searchQuery = String(event.target?.value || "");
      const results = editorHost?.querySelector(".dashboard-sequence-source-results");
      if (results) results.innerHTML = renderSourceList();
      bindAddButtons();
    });
    bindAddButtons();
    editorHost?.querySelectorAll("[data-action='remove-sequence-item']").forEach((button) => button.addEventListener("click", () => {
      syncItemControls();
      const index = Number(button.dataset.index);
      if (!Number.isInteger(index) || !draft?.items?.[index]) return;
      draft.items.splice(index, 1);
      render();
    }));
    editorHost?.querySelectorAll("[data-action='move-sequence-item-up']").forEach((button) => button.addEventListener("click", () => moveItem(Number(button.dataset.index), -1)));
    editorHost?.querySelectorAll("[data-action='move-sequence-item-down']").forEach((button) => button.addEventListener("click", () => moveItem(Number(button.dataset.index), 1)));
    editorHost?.querySelectorAll("[data-sequence-item-difficulty]").forEach((control) => control.addEventListener("change", () => syncItemControls()));
    editorHost?.querySelectorAll("[data-sequence-item-limit-mode]").forEach((control) => control.addEventListener("change", () => {
      syncItemControls({ changingLimitIndex:Number(control.dataset.sequenceItemLimitMode) });
      render();
    }));
    editorHost?.querySelectorAll("[data-sequence-item-limit-value]").forEach((control) => control.addEventListener("change", () => syncItemControls()));
  }

  function bindAddButtons() {
    editorHost?.querySelectorAll("[data-add-sequence-source]").forEach((button) => button.addEventListener("click", () => {
      syncItemControls();
      const source = findSource(sourceType, button.dataset.addSequenceSource);
      if (!source || !draft) return;
      const intrinsic = isSourceIntrinsic(sourceType, source);
      const adaptive = isAdaptiveAvailableFor(sourceType, source);
      draft.items.push({
        source_type:sourceType,
        source_id:getSourceId(source),
        title_snapshot:getSourceTitle(source),
        difficulty_mode:adaptive ? "adaptive" : "fixed",
        difficulty_level:adaptive ? null : 3,
        execution_limit_mode:intrinsic ? "intrinsic" : "questions",
        execution_limit_value:intrinsic ? null : 5
      });
      render();
    }));
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
      const valueEl = editorHost?.querySelector(`[data-sequence-item-limit-value="${index}"]`);
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

  function moveItem(index, delta) {
    syncItemControls();
    const target = index + delta;
    if (!draft?.items || index < 0 || target < 0 || index >= draft.items.length || target >= draft.items.length) return;
    const [item] = draft.items.splice(index, 1);
    draft.items.splice(target, 0, item);
    render();
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
