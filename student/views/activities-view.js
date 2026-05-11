import { studentState } from "../student-state.js";
import { goBackToSelectStudents, openActivityFolder, selectActivity } from "../student-actions.js";
import { requestAppFullscreen, escapeHtml, escapeAttr } from "../../shared/dom-helpers.js";
import { createPlanetSvg, nextSeed } from "../../shared/planetGenerator.js";
import {
  DEFAULT_ACTIVITY_MODE,
  isStudentFacingActivityMode,
  normalizeActivityMode
} from "../../shared/activity-modes.js";

export const STUDENT_ACTIVITY_PLANET_SETTINGS = {
  respectReducedMotion: false
};

const activityPlanetSeeds = new Map();
const activityPlanetMotion = new Map();
let activityPlanetSeedScope = "";

export function renderActivitiesView(root){
  const isSharedSessionEntry = studentState.sharedSessionEntry === true;
  const treeState = buildActivityTreeState();
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
          ${renderActivitiesBreadcrumb(treeState)}
        </div>

        <div class="activities-stage">
          <div id="activitiesList" class="activities-list activities-list-alone">
            ${renderActivitiesContent(treeState)}
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
  const currentFolderId = normalizeFolderId(studentState.currentActivityFolderId);
  const currentFolder = currentFolderId ? treeState.folderById.get(currentFolderId) || null : null;

  if (!currentFolder) {
    goBackToSelectStudents();
    return;
  }

  openActivityFolder(currentFolder.parent_id || "");
}

function renderActivitiesContent(treeState = buildActivityTreeState()){
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
  const featuredActivity = !currentFolder
    ? getFeaturedRootActivity(getCurrentStudentActivitiesMode())
    : null;

  if (!items.length && !currentFolder && !featuredActivity){
    return `
      <div class="activities-placeholder">
        Aucune activité disponible.
      </div>
    `;
  }

  const rows = chunkItems(items, getActivityRowSize());
  const featuredRow = featuredActivity
    ? `
      <div class="activities-featured-row">
        ${renderActivityTile(featuredActivity, { featured: true })}
      </div>
    `
    : "";
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

  return `${featuredRow}${childRows}${emptyFolderPlaceholder}`;
}

function renderActivitiesBreadcrumb(treeState = buildActivityTreeState()){
  const currentFolderId = normalizeFolderId(studentState.currentActivityFolderId);
  const currentFolder = currentFolderId ? treeState.folderById.get(currentFolderId) || null : null;
  const trail = buildBreadcrumbTrail(treeState, currentFolder);

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
              data-breadcrumb-folder-id="${escapeAttr(item.folderId ?? "")}"
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
      data-folder-id="${escapeAttr(folder?.id ?? "")}"
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

function renderActivityTile(activity, { featured = false } = {}){
  return `
    <button
      class="activity-tile ${featured ? "activity-tile-featured" : ""}"
      type="button"
      data-config-name="${escapeAttr(activity?.config_name || "")}"
    >
      <span
        class="activity-planet-visual ${shouldAnimateActivityPlanets() ? "is-levitating" : ""}"
        aria-hidden="true"
        style="${buildActivityPlanetMotionStyle(`activity:${String(activity?.id || activity?.config_name || "")}`)}"
      >
        ${renderActivityPlanet(`activity:${String(activity?.id || activity?.config_name || "")}`)}
      </span>
      <span class="activity-tile-label ${featured ? "activity-tile-label-featured" : ""}">${escapeHtml(activity?.config_name || "Sans nom")}</span>
    </button>
  `;
}

function getFeaturedRootActivity(currentMode){
  const safeMode = normalizeActivityMode(currentMode, DEFAULT_ACTIVITY_MODE);
  if (!isStudentFacingActivityMode(safeMode)) return null;

  return ((studentState.activities || [])
    .filter((activity) => activity?.is_visible !== false)
    .filter((activity) => normalizeActivityMode(activity?.activity_mode, DEFAULT_ACTIVITY_MODE) === safeMode)
    .filter((activity) => activity?.is_highlighted === true)
    .sort(compareActivityRecordsForDisplay)[0]) || null;
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
    label: "Activités",
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

  const folders = (studentState.activityFolders || []).map((folder, index) => ({
    ...folder,
    id: String(folder?.id || ""),
    parent_id: normalizeFolderId(folder?.parent_id),
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

  activities.forEach((activity) => {
    if (activity.folder_id && !folderById.has(activity.folder_id)) {
      activity.folder_id = null;
    }
  });

  const folderChildren = new Map();
  const activityChildren = new Map();

  folders.forEach((folder) => {
    ensureBucket(folderChildren, folder.parent_id).push(folder);
  });

  activities.forEach((activity) => {
    ensureBucket(activityChildren, activity.folder_id).push(activity);
  });

  return {
    folderById,
    folderChildren,
    activityChildren
  };
}

function getOrderedChildNodes(state, parentId = null){
  const folderNodes = (state.folderChildren.get(parentId) || []).map((folder) => ({
    type: "folder",
    id: folder.id,
    label: folder.name,
    display_order: folder.display_order,
    item: folder
  }));

  const activityNodes = (state.activityChildren.get(parentId) || []).map((activity) => ({
    type: "activity",
    id: activity.id,
    label: activity.config_name,
    display_order: activity.display_order,
    item: activity
  }));

  return [...folderNodes, ...activityNodes].sort(compareOrderedTreeNodes);
}

function compareOrderedTreeNodes(a, b){
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

function compareActivityRecordsForDisplay(a, b){
  const orderA = Number(a?.display_order);
  const orderB = Number(b?.display_order);
  if (Number.isFinite(orderA) && Number.isFinite(orderB) && orderA !== orderB) {
    return orderA - orderB;
  }

  const labelA = String(a?.config_name || "");
  const labelB = String(b?.config_name || "");
  const byLabel = labelA.localeCompare(labelB, "fr", { sensitivity: "base" });
  if (byLabel !== 0) return byLabel;

  return String(a?.id || "").localeCompare(String(b?.id || ""), "fr", { sensitivity: "base" });
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
