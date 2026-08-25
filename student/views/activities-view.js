import { studentState } from "../student-state.js";
import {
  goBackToSelectStudents,
  openActivityFolder,
  openAdventureEntry,
  refreshAdventureDay,
  refreshMissionsForCurrentSelection,
  selectActivity,
  selectActivityEntry,
  selectMission,
  startNextAdventurePassage
} from "../student-actions.js";
import { requestAppFullscreen, escapeHtml, escapeAttr } from "../../shared/dom-helpers.js";
import { createPlanetSvg, nextSeed } from "../../shared/planetGenerator.js";
import {
  DEFAULT_ACTIVITY_MODE,
  isStudentFacingActivityMode,
  normalizeActivityMode
} from "../../shared/activity-modes.js";
import { filterPedagogicalNodesForGradeLevels } from "../../shared/catalogue.js";

export const STUDENT_ACTIVITY_PLANET_SETTINGS = {
  respectReducedMotion: false
};

const activityPlanetSeeds = new Map();
const activityPlanetMotion = new Map();
let activityPlanetSeedScope = "";

export function renderActivitiesView(root){
  const isSharedSessionEntry = studentState.sharedSessionEntry === true;
  const treeState = buildActivityTreeState();
  const entry = normalizeEntry(studentState.activityEntry);

  root.innerHTML = `
    <div class="activities-shell student-screen-shell student-stars-shell" id="activitiesShell">
      <div class="student-stars-content activities-layout">
        ${isSharedSessionEntry ? "" : `
          <button
            class="student-nav-btn student-nav-back"
            id="btnBackToSelectStudents"
            type="button"
            aria-label="Retour"
            data-skip-autofs="true"
          >
            <svg
              class="student-back-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 -960 960 960"
              width="24"
              height="24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="m313-440 224 224-57 56-320-320 320-320 57 56-224 224h487v80H313Z"/>
            </svg>
          </button>
        `}

        <div class="activities-breadcrumb-wrap">
          ${entry ? renderActivitiesBreadcrumb(treeState, entry) : ""}
        </div>

        <div class="activities-stage">
          <div id="activitiesList" class="activities-list activities-list-alone">
            ${entry === "exploration"
              ? renderExplorationContent(treeState)
              : entry === "missions"
                ? renderMissionsContent()
                : entry === "adventure"
                  ? renderAdventureContent()
                  : renderEntryHub()}
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("btnBackToSelectStudents")
    ?.addEventListener("click", () => {
      handleActivitiesBack(treeState);
    });

  document.getElementById("activitiesShell")
    ?.addEventListener("click", (event) => {
      if (event.target.closest("[data-skip-autofs='true']")) return;
      requestAppFullscreen();
    });

  document.querySelectorAll("[data-entry]").forEach((button) => {
    button.addEventListener("click", async () => {
      const nextEntry = String(button.dataset.entry || "").trim();
      if (nextEntry === "adventure") {
        await openAdventureEntry();
        return;
      }
      if (nextEntry === "missions") {
        await refreshMissionsForCurrentSelection();
      }
      selectActivityEntry(nextEntry);
    });
  });

  document.querySelector("[data-adventure-next]")?.addEventListener("click", () => {
    void startNextAdventurePassage();
  });

  document.querySelector("[data-adventure-refresh]")?.addEventListener("click", () => {
    void refreshAdventureDay();
  });

  document.querySelectorAll("[data-mission-id]").forEach((button) => {
    button.addEventListener("click", () => {
      void selectMission(button.dataset.missionId || "");
    });
  });

  document.querySelectorAll("[data-config-name]").forEach((button) => {
    button.addEventListener("click", () => {
      void selectActivity(button.dataset.configName || "");
    });
  });

  document.querySelectorAll("[data-folder-id]").forEach((button) => {
    button.addEventListener("click", () => {
      openActivityFolder(button.dataset.folderId || "");
    });
  });

  document.querySelectorAll("[data-breadcrumb-folder-id]").forEach((button) => {
    button.addEventListener("click", () => {
      openActivityFolder(button.dataset.breadcrumbFolderId || "");
    });
  });
}

function handleActivitiesBack(treeState = buildActivityTreeState()){
  const entry = normalizeEntry(studentState.activityEntry);
  if (!entry) {
    goBackToSelectStudents();
    return;
  }

  if (entry === "exploration") {
    const currentFolderId = normalizeFolderId(studentState.currentActivityFolderId);
    const currentFolder = currentFolderId ? treeState.folderById.get(currentFolderId) || null : null;
    if (currentFolder) {
      openActivityFolder(currentFolder.parent_id || "");
      return;
    }
  }

  selectActivityEntry("");
}

function renderEntryHub(){
  const isGroup = normalizeActivityMode(studentState.activitiesMode, DEFAULT_ACTIVITY_MODE) === "group";
  const missions = Array.isArray(studentState.missions) ? studentState.missions : [];
  const missionTile = missions.length
    ? renderEntryTile({
      entry: "missions",
      label: missions.length > 1 ? "Missions" : "Mission",
      subtitle: missions.length > 1 ? `${missions.length} missions disponibles` : "Une mission est disponible",
      planetKey: "entry:missions"
    })
    : "";

  return `
    <div class="activities-row">
      ${renderEntryTile({
        entry: "exploration",
        label: "Exploration",
        subtitle: "Choisis une activité librement.",
        planetKey: "entry:exploration"
      })}
      ${isGroup ? "" : renderEntryTile({
        entry: "adventure",
        label: "Aventure",
        subtitle: "Continue ton parcours du jour.",
        planetKey: "entry:adventure"
      })}
      ${missionTile}
    </div>
  `;
}

function renderEntryTile({ entry, label, subtitle = "", planetKey, disabled = false }){
  const attrs = disabled
    ? `disabled aria-disabled="true" data-skip-autofs="true"`
    : `data-entry="${escapeAttr(entry)}"`;
  return `
    <button
      class="activity-tile ${disabled ? "activity-tile-disabled" : ""}"
      type="button"
      ${attrs}
    >
      <span
        class="activity-planet-visual ${shouldAnimateActivityPlanets() ? "is-levitating" : ""}"
        aria-hidden="true"
        style="${buildActivityPlanetMotionStyle(planetKey)}"
      >
        ${renderActivityPlanet(planetKey)}
      </span>
      <span class="activity-tile-label">${escapeHtml(label)}</span>
      ${subtitle ? `<span class="activity-tile-hint" style="display:block;text-align:center;font-size:0.8rem;opacity:0.78;">${escapeHtml(subtitle)}</span>` : ""}
    </button>
  `;
}

function renderExplorationContent(treeState = buildActivityTreeState()){
  if (studentState.isLoadingActivities){
    return `
      <div class="activities-placeholder">
        Chargement des activités…
      </div>
    `;
  }

  if (studentState.activitiesMessage){
    return `
      <div class="activities-placeholder">
        ${escapeHtml(studentState.activitiesMessage)}
      </div>
    `;
  }

  const currentFolderId = normalizeFolderId(studentState.currentActivityFolderId);
  const currentFolder = currentFolderId ? treeState.folderById.get(currentFolderId) || null : null;
  const items = getOrderedChildNodes(treeState, currentFolder?.id || null);

  if (!items.length && !currentFolder){
    return `
      <div class="activities-placeholder">
        Aucune activité disponible.
      </div>
    `;
  }

  const rows = chunkItems(items, getActivityRowSize());
  const childRows = rows.map((row) => `
    <div class="activities-row">
      ${row.map((node) => node.type === "folder"
    ? renderFolderTile(node.item)
    : renderActivityTile(node.item)
  ).join("")}
    </div>
  `).join("");

  const emptyFolderPlaceholder = currentFolder && !items.length
    ? `
      <div class="activities-placeholder activities-folder-empty">
        Ce dossier est vide.
      </div>
    `
    : "";

  return `${childRows}${emptyFolderPlaceholder}`;
}

function renderAdventureContent(){
  if (studentState.isLoadingAdventure) {
    return `
      <div class="activities-placeholder">
        Préparation de ton Aventure…
      </div>
    `;
  }

  const day = studentState.adventureDay;
  const message = String(studentState.adventureMessage || "").trim();

  if (!day || day.availability !== "ready") {
    return `
      <div class="activities-placeholder">
        <div>${escapeHtml(message || "Aucune Aventure disponible pour le moment.")}</div>
        <button type="button" class="btn" data-adventure-refresh style="margin-top:1rem;">Réessayer</button>
      </div>
    `;
  }

  const requiredPassages = (Array.isArray(day.passages) ? day.passages : [])
    .filter((passage) => String(passage?.passage_type || "") === "required")
    .sort((a, b) => Number(a?.passage_number || 0) - Number(b?.passage_number || 0));
  const completedCount = requiredPassages.filter((passage) => String(passage?.status || "") === "completed").length;
  const nextPassage = requiredPassages.find((passage) => !["completed", "skipped"].includes(String(passage?.status || ""))) || null;
  const isCompleted = String(day?.day_status || "") === "completed" || completedCount >= 6;

  if (isCompleted) {
    return `
      <div class="activities-placeholder">
        <div style="font-size:1.35rem;font-weight:700;">Bravo !</div>
        <div style="margin-top:.5rem;">Ton Aventure du jour est terminée.</div>
        <div style="margin-top:.35rem;opacity:.75;">6 activités sur 6</div>
      </div>
    `;
  }

  if (!nextPassage) {
    return `
      <div class="activities-placeholder">
        <div>Finalisation de ton Aventure…</div>
        <button type="button" class="btn" data-adventure-refresh style="margin-top:1rem;">Actualiser</button>
      </div>
    `;
  }

  const activityId = String(nextPassage?.catalog_activity_id || "").trim();
  const activity = (studentState.activities || []).find((item) => String(item?.id || "").trim() === activityId) || null;
  const activityLabel = String(activity?.config_name || "Activité").trim() || "Activité";
  const passageNumber = Math.max(1, Math.trunc(Number(nextPassage?.passage_number) || (completedCount + 1)));
  const status = String(nextPassage?.status || "");
  const verb = status === "interrupted" || status === "running" ? "Reprendre" : "Commencer";

  return `
    <div class="activities-row">
      <button
        class="activity-tile"
        type="button"
        data-adventure-next
      >
        <span
          class="activity-planet-visual ${shouldAnimateActivityPlanets() ? "is-levitating" : ""}"
          aria-hidden="true"
          style="${buildActivityPlanetMotionStyle(`adventure:passage:${passageNumber}`)}"
        >
          ${renderActivityPlanet(`adventure:passage:${passageNumber}`)}
        </span>
        <span class="activity-tile-label">${escapeHtml(`${verb} · ${passageNumber}/6`)}</span>
        <span class="activity-tile-hint" style="display:block;text-align:center;font-size:0.8rem;opacity:0.78;">
          ${escapeHtml(activityLabel)}
        </span>
      </button>
    </div>
    <div class="activities-placeholder" style="padding-top:.5rem;">
      ${escapeHtml(`${completedCount} activité${completedCount > 1 ? "s" : ""} terminée${completedCount > 1 ? "s" : ""} sur 6`)}
    </div>
  `;
}

function renderMissionsContent(){
  const missions = Array.isArray(studentState.missions) ? studentState.missions : [];
  if (!missions.length) {
    return "";
  }

  const rows = chunkItems(missions, getActivityRowSize());
  return rows.map((row) => `
    <div class="activities-row">
      ${row.map((mission) => renderMissionTile(mission)).join("")}
    </div>
  `).join("");
}

function renderMissionTile(mission){
  return `
    <button
      class="activity-tile activity-mission-tile"
      type="button"
      data-mission-id="${escapeAttr(mission?.id || "")}"
    >
      <span
        class="activity-planet-visual ${shouldAnimateActivityPlanets() ? "is-levitating" : ""}"
        aria-hidden="true"
        style="${buildActivityPlanetMotionStyle(`mission:${String(mission?.id || "")}`)}"
      >
        ${renderActivityPlanet(`mission:${String(mission?.id || "")}`)}
      </span>
      <span class="activity-tile-label">${escapeHtml(mission?.title || "Mission")}</span>
      <span class="activity-tile-hint" style="display:block;text-align:center;font-size:0.8rem;opacity:0.78;">
        ${escapeHtml(formatMissionSubtitle(mission))}
      </span>
    </button>
  `;
}

function formatMissionSubtitle(mission){
  const intent = String(mission?.intent_mode || "practice") === "evaluation" ? "Évaluation" : "Entrainement";
  const answer = String(mission?.answer_mode || "student_input") === "manual_validation" ? "sans saisie" : "réponse saisie";
  return `${intent} · ${answer}`;
}

function renderActivitiesBreadcrumb(treeState = buildActivityTreeState(), entry = normalizeEntry(studentState.activityEntry)){
  const currentFolderId = normalizeFolderId(studentState.currentActivityFolderId);
  const currentFolder = currentFolderId ? treeState.folderById.get(currentFolderId) || null : null;
  const trail = entry === "exploration"
    ? buildBreadcrumbTrail(treeState, currentFolder)
    : [{ label: entry === "adventure" ? "Aventure" : "Mission", folderId: "", clickable: false }];

  return `
    <nav class="activities-breadcrumb" aria-label="Navigation dossiers">
      ${trail.map((item, index) => {
        const isLast = index === trail.length - 1;
        const separator = isLast ? "" : '<span class="activities-breadcrumb-separator" aria-hidden="true">/</span>';
        const node = item.clickable
          ? `
            <button
              type="button"
              class="activities-breadcrumb-btn"
              data-breadcrumb-folder-id="${escapeAttr(item.folderId ?? "") }"
            >
              ${escapeHtml(item.label)}
            </button>
          `
          : `<span class="activities-breadcrumb-current">${escapeHtml(item.label)}</span>`;

        return `${node}${separator}`;
      }).join("")}
    </nav>
  `;
}

function renderFolderTile(folder){
  return `
    <button
      class="activity-tile activity-folder-tile"
      type="button"
      data-folder-id="${escapeAttr(folder?.id ?? "") }"
    >
      <span
        class="activity-planet-visual ${shouldAnimateActivityPlanets() ? "is-levitating" : ""}"
        aria-hidden="true"
        style="${buildActivityPlanetMotionStyle(`folder:${String(folder?.id ?? "")}`)}"
      >
        ${renderActivityPlanet(`folder:${String(folder?.id ?? "")}`)}
      </span>
      <span class="activity-tile-label">${escapeHtml(folder?.name || "Dossier")}</span>
    </button>
  `;
}

function renderActivityTile(activity){
  return `
    <button
      class="activity-tile"
      type="button"
      data-config-name="${escapeAttr(activity?.config_name || activity?.id || "") }"
    >
      <span
        class="activity-planet-visual ${shouldAnimateActivityPlanets() ? "is-levitating" : ""}"
        aria-hidden="true"
        style="${buildActivityPlanetMotionStyle(`activity:${String(activity?.id || activity?.config_name || "")}`)}"
      >
        ${renderActivityPlanet(`activity:${String(activity?.id || activity?.config_name || "")}`)}
      </span>
      <span class="activity-tile-label">${escapeHtml(activity?.config_name || "Sans nom")}</span>
    </button>
  `;
}

function getCurrentStudentActivitiesMode(){
  const safeMode = normalizeActivityMode(studentState.activitiesMode, DEFAULT_ACTIVITY_MODE);
  return isStudentFacingActivityMode(safeMode) ? safeMode : DEFAULT_ACTIVITY_MODE;
}

function renderActivityPlanet(key){
  ensurePlanetSeedScope();

  const cacheKey = String(key || "").trim() || nextSeed();
  let seed = activityPlanetSeeds.get(cacheKey);
  if (!seed) {
    seed = nextSeed();
    activityPlanetSeeds.set(cacheKey, seed);
  }

  return createPlanetSvg({
    seed,
    settings: {
      viewportSize: 240,
      planetDiameter: 156
    }
  }).svg;
}

function ensurePlanetSeedScope(){
  const nextScope = String(studentState.accessCode || "").trim().toUpperCase();
  if (nextScope === activityPlanetSeedScope) return;
  activityPlanetSeedScope = nextScope;
  activityPlanetSeeds.clear();
  activityPlanetMotion.clear();
}

function shouldAnimateActivityPlanets(){
  if (!STUDENT_ACTIVITY_PLANET_SETTINGS.respectReducedMotion) {
    return true;
  }

  try {
    return !window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  } catch {
    return true;
  }
}

function buildActivityPlanetMotionStyle(key){
  ensurePlanetSeedScope();

  const cacheKey = String(key || "").trim() || nextSeed();
  let motion = activityPlanetMotion.get(cacheKey);
  if (!motion) {
    const random = createSeededRandom(hashString(cacheKey));
    motion = {
      duration: formatMotionNumber(6.8 + random() * 3.6),
      delay: formatMotionNumber(-(random() * 8.5)),
      x: formatMotionNumber(-5 + random() * 10),
      y: formatMotionNumber(-(6 + random() * 12)),
      tilt: formatMotionNumber(-1.8 + random() * 3.6)
    };
    activityPlanetMotion.set(cacheKey, motion);
  }

  return [
    `--activity-planet-float-duration:${motion.duration}s`,
    `--activity-planet-float-delay:${motion.delay}s`,
    `--activity-planet-float-x:${motion.x}px`,
    `--activity-planet-float-y:${motion.y}px`,
    `--activity-planet-float-tilt:${motion.tilt}deg`
  ].join(";");
}

function buildBreadcrumbTrail(treeState, currentFolder){
  const folders = [];
  let cursor = currentFolder;

  while (cursor) {
    folders.unshift(cursor);
    cursor = cursor.parent_id ? treeState.folderById.get(cursor.parent_id) || null : null;
  }

  const trail = [{
    label: "Exploration",
    folderId: "",
    clickable: folders.length > 0
  }];

  folders.forEach((folder, index) => {
    const isLast = index === folders.length - 1;
    trail.push({
      label: String(folder?.name || "Dossier"),
      folderId: String(folder?.id || ""),
      clickable: !isLast
    });
  });

  return trail;
}

function buildActivityTreeState(){
  const currentMode = getCurrentStudentActivitiesMode();

  const selectedGradeLevels = [...new Set(
    (Array.isArray(studentState.selectedStudents) ? studentState.selectedStudents : [])
      .map((student) => String(student?.grade_level || "").trim().toUpperCase())
      .filter(Boolean)
  )];
  const scopedFolders = filterPedagogicalNodesForGradeLevels(
    studentState.activityFolders || [],
    selectedGradeLevels,
    { requireAll: true }
  );
  const folders = scopedFolders.map((folder, index) => ({
    ...folder,
    id: String(folder?.id || ""),
    parent_id: normalizeFolderId(folder?.parent_id),
    student_label: String(folder?.student_label || "").trim() || null,
    student_navigation_mode: normalizeStudentNavigationMode(folder?.student_navigation_mode),
    display_order: Number.isFinite(Number(folder?.display_order))
      ? Math.max(0, Math.trunc(Number(folder.display_order)))
      : index
  })).filter((folder) => folder.id);

  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  folders.forEach((folder) => {
    if (folder.parent_id && !folderById.has(folder.parent_id)) {
      folder.parent_id = null;
    }
  });

  const activities = (studentState.activities || []).map((activity, index) => ({
    ...activity,
    id: String(activity?.id || activity?.config_name || index),
    folder_id: normalizeFolderId(activity?.folder_id),
    display_order: Number.isFinite(Number(activity?.display_order))
      ? Math.max(0, Math.trunc(Number(activity.display_order)))
      : index
  }))
    .filter((activity) => activity?.is_visible !== false)
    .filter((activity) => normalizeActivityMode(activity?.activity_mode, DEFAULT_ACTIVITY_MODE) === currentMode);

  const visibleActivities = activities.filter((activity) => !activity.folder_id || folderById.has(activity.folder_id));
  const usefulFolderIds = new Set();
  visibleActivities.forEach((activity) => {
    let folderId = activity.folder_id;
    const seen = new Set();
    while (folderId && folderById.has(folderId) && !seen.has(folderId)) {
      usefulFolderIds.add(folderId);
      seen.add(folderId);
      folderId = folderById.get(folderId)?.parent_id || null;
    }
  });

  const usefulFolders = folders.filter((folder) => usefulFolderIds.has(folder.id));
  const projectedFolders = usefulFolders
    .filter((folder) => !isStudentTransparentFolder(folder))
    .map((folder) => {
      const projectedParentId = findStudentProjectedParentId(folder.parent_id, folderById, usefulFolderIds);
      return {
        ...folder,
        parent_id: projectedParentId,
        pedagogical_name: folder.name,
        name: getStudentFolderLabel(folder),
        student_sort_path: buildStudentProjectionOrderPath(folder.id, projectedParentId, folderById)
      };
    });
  const projectedFolderById = new Map(projectedFolders.map((folder) => [folder.id, folder]));

  const folderChildren = new Map();
  const activityChildren = new Map();

  projectedFolders.forEach((folder) => {
    ensureBucket(folderChildren, folder.parent_id).push(folder);
  });

  visibleActivities.forEach((activity) => {
    const projectedParentId = findStudentProjectedParentId(activity.folder_id, folderById, usefulFolderIds);
    const folderPath = buildStudentProjectionOrderPath(activity.folder_id, projectedParentId, folderById);
    const projectedActivity = {
      ...activity,
      student_sort_path: [...folderPath, activity.display_order]
    };
    ensureBucket(activityChildren, projectedParentId).push(projectedActivity);
  });

  return {
    folderById: projectedFolderById,
    folderChildren,
    activityChildren
  };
}

function normalizeStudentNavigationMode(value){
  return String(value || "").trim() === "transparent" ? "transparent" : "folder";
}

function isStudentTransparentFolder(folder){
  return String(folder?.node_type || "").trim() === "grade_level"
    || normalizeStudentNavigationMode(folder?.student_navigation_mode) === "transparent";
}

function getStudentFolderLabel(folder){
  return String(folder?.student_label || "").trim()
    || String(folder?.name || "Dossier").trim()
    || "Dossier";
}

function findStudentProjectedParentId(startFolderId, folderById, usefulFolderIds){
  let folderId = normalizeFolderId(startFolderId);
  const seen = new Set();

  while (folderId && folderById.has(folderId) && !seen.has(folderId)) {
    seen.add(folderId);
    const folder = folderById.get(folderId);
    if (usefulFolderIds.has(folderId) && !isStudentTransparentFolder(folder)) {
      return folderId;
    }
    folderId = folder?.parent_id || null;
  }

  return null;
}

function buildStudentProjectionOrderPath(startFolderId, stopFolderId, folderById){
  const reversedPath = [];
  let folderId = normalizeFolderId(startFolderId);
  const stopId = normalizeFolderId(stopFolderId);
  const seen = new Set();

  while (folderId && folderId !== stopId && folderById.has(folderId) && !seen.has(folderId)) {
    seen.add(folderId);
    const folder = folderById.get(folderId);
    reversedPath.push(Number.isFinite(Number(folder?.display_order)) ? Number(folder.display_order) : 0);
    folderId = folder?.parent_id || null;
  }

  return reversedPath.reverse();
}

function getOrderedChildNodes(state, parentId = null){
  const folderNodes = (state.folderChildren.get(parentId) || []).map((folder) => ({
    type: "folder",
    id: folder.id,
    label: folder.name,
    display_order: folder.display_order,
    sort_path: folder.student_sort_path,
    item: folder
  }));

  const activityNodes = (state.activityChildren.get(parentId) || []).map((activity) => ({
    type: "activity",
    id: activity.id,
    label: activity.config_name,
    display_order: activity.display_order,
    sort_path: activity.student_sort_path,
    item: activity
  }));

  return [...folderNodes, ...activityNodes].sort(compareOrderedTreeNodes);
}

function compareOrderedTreeNodes(a, b){
  const pathComparison = compareStudentOrderPaths(a?.sort_path, b?.sort_path);
  if (pathComparison !== 0) return pathComparison;

  const orderA = Number(a?.display_order);
  const orderB = Number(b?.display_order);
  if (Number.isFinite(orderA) && Number.isFinite(orderB) && orderA !== orderB) {
    return orderA - orderB;
  }

  if (a?.type !== b?.type) {
    return a?.type === "folder" ? -1 : 1;
  }

  const labelA = String(a?.label || "");
  const labelB = String(b?.label || "");
  const byLabel = labelA.localeCompare(labelB, "fr", { sensitivity: "base" });
  if (byLabel !== 0) return byLabel;

  return String(a?.id || "").localeCompare(String(b?.id || ""), "fr", { sensitivity: "base" });
}

function compareStudentOrderPaths(a, b){
  const pathA = Array.isArray(a) ? a : [];
  const pathB = Array.isArray(b) ? b : [];
  const length = Math.max(pathA.length, pathB.length);

  for (let index = 0; index < length; index += 1) {
    if (index >= pathA.length) return -1;
    if (index >= pathB.length) return 1;
    const valueA = Number(pathA[index]) || 0;
    const valueB = Number(pathB[index]) || 0;
    if (valueA !== valueB) return valueA - valueB;
  }

  return 0;
}

function ensureBucket(map, key){
  if (!map.has(key)) {
    map.set(key, []);
  }
  return map.get(key);
}

function normalizeFolderId(value){
  const folderId = String(value ?? "").trim();
  return folderId || null;
}

function normalizeEntry(value){
  const entry = String(value || "").trim().toLowerCase();
  return ["exploration", "missions", "adventure"].includes(entry) ? entry : "";
}

function getActivityRowSize(){
  const width = Number(window.innerWidth) || 0;
  const height = Number(window.innerHeight) || 0;
  const isCompactLandscape = width <= 940 && height <= 520;
  if (isCompactLandscape) return 8;
  if (width <= 1359) return 6;
  return 5;
}

function chunkItems(items, size){
  const safeSize = Math.max(1, Number(size) || 1);
  const rows = [];

  for (let index = 0; index < items.length; index += safeSize) {
    rows.push(items.slice(index, index + safeSize));
  }

  return rows;
}

function hashString(input){
  let hash = 2166136261;
  const text = String(input || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed){
  let value = Number(seed) || 0;
  return function seededRandom(){
    value |= 0;
    value = (value + 0x6D2B79F5) | 0;
    let tmp = Math.imul(value ^ (value >>> 15), 1 | value);
    tmp = (tmp + Math.imul(tmp ^ (tmp >>> 7), 61 | tmp)) ^ tmp;
    return ((tmp ^ (tmp >>> 14)) >>> 0) / 4294967296;
  };
}

function formatMotionNumber(value){
  return Number(value).toFixed(3);
}
