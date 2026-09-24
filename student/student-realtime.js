import { supabase } from "../shared/supabase-client.js";
import { normalizeAccessCode } from "./student-api.js";
import { studentState } from "./student-state.js";
import {
  refreshClassDataForRealtime,
  refreshMissionsForCurrentSelection
} from "./student-actions.js";

const SPACE_TOPIC_PREFIX = "tujer:space:";
const CATALOG_TOPIC = "tujer:catalog";
const REALTIME_EVENT = "content_changed";
const SYNC_DEBOUNCE_MS = 180;
const NOTICE_DURATION_MS = 5200;

let started = false;
let spaceChannel = null;
let catalogChannel = null;
let subscribedAccessCode = "";
let syncTimer = 0;
let syncRunning = false;
let syncQueued = false;
let pendingSpaceSync = false;
let pendingCatalogSync = false;
let noticeTimer = 0;

export function startStudentRealtimeSync() {
  if (started) return;
  started = true;

  window.addEventListener("student:refresh", handleStudentStateChange);
  window.addEventListener("hashchange", handleNavigationChange);
  window.addEventListener("online", handleConnectivityReturn);

  ensureRealtimeSubscriptions();
}

function handleStudentStateChange() {
  ensureRealtimeSubscriptions();
  if (canRefreshNavigationNow()) {
    flushPendingSyncSoon();
  }
}

function handleNavigationChange() {
  ensureRealtimeSubscriptions();
  if (canRefreshNavigationNow()) {
    flushPendingSyncSoon();
  }
}

function handleConnectivityReturn() {
  if (!subscribedAccessCode) return;
  pendingSpaceSync = true;
  pendingCatalogSync = true;
  flushPendingSyncSoon();
}

function ensureRealtimeSubscriptions() {
  const nextAccessCode = getRealtimeAccessCode();
  if (nextAccessCode === subscribedAccessCode && spaceChannel && catalogChannel) return;

  void resetRealtimeSubscriptions(nextAccessCode);
}

async function resetRealtimeSubscriptions(accessCode) {
  const previousSpaceChannel = spaceChannel;
  const previousCatalogChannel = catalogChannel;
  spaceChannel = null;
  catalogChannel = null;
  subscribedAccessCode = "";

  const removals = [previousSpaceChannel, previousCatalogChannel]
    .filter(Boolean)
    .map((channel) => supabase.removeChannel(channel).catch(() => null));
  if (removals.length) await Promise.allSettled(removals);

  const safeAccessCode = normalizeAccessCode(accessCode);
  if (!safeAccessCode || getRealtimeAccessCode() !== safeAccessCode) return;

  subscribedAccessCode = safeAccessCode;
  spaceChannel = createBroadcastChannel(`${SPACE_TOPIC_PREFIX}${safeAccessCode}`, "space");
  catalogChannel = createBroadcastChannel(CATALOG_TOPIC, "catalog");
}

function createBroadcastChannel(topic, scope) {
  let channelHasSubscribed = false;

  return supabase
    .channel(topic, {
      config: {
        broadcast: { self: false },
        private: false
      }
    })
    .on("broadcast", { event: REALTIME_EVENT }, (message) => {
      handleRealtimeMessage(scope, message?.payload || {});
    })
    .subscribe((status) => {
      if (status !== "SUBSCRIBED") return;

      if (channelHasSubscribed) {
        if (scope === "catalog") pendingCatalogSync = true;
        else pendingSpaceSync = true;
        flushPendingSyncSoon();
      }
      channelHasSubscribed = true;
    });
}

function handleRealtimeMessage(scope, payload) {
  if (!subscribedAccessCode || getRealtimeAccessCode() !== subscribedAccessCode) return;

  if (scope === "catalog") {
    pendingCatalogSync = true;
  } else {
    pendingSpaceSync = true;
  }

  if (!canRefreshNavigationNow()) return;
  scheduleRealtimeSync(payload);
}

function scheduleRealtimeSync() {
  if (syncTimer) window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    syncTimer = 0;
    void runRealtimeSync();
  }, SYNC_DEBOUNCE_MS);
}

function flushPendingSyncSoon() {
  if (!pendingSpaceSync && !pendingCatalogSync) return;
  if (!canRefreshNavigationNow()) return;
  scheduleRealtimeSync();
}

async function runRealtimeSync() {
  if (!canRefreshNavigationNow()) return;
  if (syncRunning) {
    syncQueued = true;
    return;
  }

  const shouldRefreshSpace = pendingSpaceSync;
  const shouldRefreshCatalog = pendingCatalogSync;
  if (!shouldRefreshSpace && !shouldRefreshCatalog) return;

  pendingSpaceSync = false;
  pendingCatalogSync = false;
  syncRunning = true;

  const previousItems = snapshotMissionItems(studentState.missions);

  try {
    if (shouldRefreshCatalog) {
      const catalogRefreshOk = await refreshClassDataForRealtime();
      if (!catalogRefreshOk) pendingCatalogSync = true;
    }
    if (shouldRefreshSpace || shouldRefreshCatalog) {
      await refreshMissionsForCurrentSelection();
    }

    const nextItems = snapshotMissionItems(studentState.missions);
    const addedItems = [...nextItems.values()].filter((item) => !previousItems.has(item.key));
    showAddedContentNotice(addedItems);
  } catch (error) {
    // Realtime reste une amélioration progressive : la navigation normale et F5
    // continuent à fonctionner même si une synchronisation ponctuelle échoue.
    console.warn("Synchronisation temps réel indisponible.", error);
    pendingSpaceSync = pendingSpaceSync || shouldRefreshSpace;
    pendingCatalogSync = pendingCatalogSync || shouldRefreshCatalog;
  } finally {
    syncRunning = false;
    if (syncQueued) {
      syncQueued = false;
      flushPendingSyncSoon();
    }
  }
}

function snapshotMissionItems(items) {
  const result = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const id = String(item?.id || "").trim();
    if (!id) return;
    const isAssignment = item?._kind === "activity_assignment";
    const sourceType = String(item?.source_type || "").trim();
    const kind = isAssignment
      ? (sourceType === "sequence" ? "sequence" : "activity")
      : "mission";
    const key = `${isAssignment ? "assignment" : "mission"}:${id}`;
    result.set(key, { key, kind });
  });
  return result;
}

function showAddedContentNotice(items) {
  if (!Array.isArray(items) || !items.length) return;
  if (!canShowRealtimeNotice()) return;

  const counts = items.reduce((acc, item) => {
    const kind = item?.kind === "sequence" || item?.kind === "mission" ? item.kind : "activity";
    acc[kind] = (acc[kind] || 0) + 1;
    return acc;
  }, { activity: 0, sequence: 0, mission: 0 });

  const nonZeroKinds = Object.entries(counts).filter(([, count]) => count > 0);
  let message = "Du nouveau est disponible.";

  if (nonZeroKinds.length === 1) {
    const [kind, count] = nonZeroKinds[0];
    if (kind === "activity") message = count === 1 ? "Nouvelle activité disponible" : `${count} nouvelles activités disponibles`;
    if (kind === "sequence") message = count === 1 ? "Nouvelle séquence disponible" : `${count} nouvelles séquences disponibles`;
    if (kind === "mission") message = count === 1 ? "Nouvelle mission disponible" : `${count} nouvelles missions disponibles`;
  } else {
    message = "De nouvelles activités ou missions sont disponibles";
  }

  showRealtimeNotice(message);
}

function showRealtimeNotice(message) {
  const text = String(message || "").trim();
  if (!text) return;

  let notice = document.getElementById("studentRealtimeNotice");
  if (!(notice instanceof HTMLElement)) {
    notice = document.createElement("div");
    notice.id = "studentRealtimeNotice";
    notice.className = "student-realtime-notice";
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    notice.innerHTML = `
      <span class="student-realtime-notice-badge" aria-hidden="true">NOUVEAU</span>
      <span class="student-realtime-notice-text"></span>
    `;
    document.body.appendChild(notice);
  }

  const textNode = notice.querySelector(".student-realtime-notice-text");
  if (textNode) textNode.textContent = text;
  notice.classList.remove("is-visible");
  void notice.offsetWidth;
  notice.classList.add("is-visible");

  if (noticeTimer) window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    noticeTimer = 0;
    notice?.classList.remove("is-visible");
  }, NOTICE_DURATION_MS);
}

function canRefreshNavigationNow() {
  if (!subscribedAccessCode) return false;
  if (!hasSelectedParticipants()) return false;
  const route = getCurrentRouteName();
  return route === "activities";
}

function canShowRealtimeNotice() {
  return getCurrentRouteName() === "activities";
}

function hasSelectedParticipants() {
  const mode = String(studentState.activitiesMode || "").trim().toLowerCase();
  const selectedIds = (Array.isArray(studentState.selectedStudents) ? studentState.selectedStudents : [])
    .map((student) => String(student?.id || "").trim())
    .filter(Boolean);
  const uniqueIds = new Set(selectedIds);

  if (mode === "group") return uniqueIds.size >= 2;
  return Boolean(String(studentState.selectedStudent?.id || "").trim() || uniqueIds.size === 1);
}

function getRealtimeAccessCode() {
  if (studentState.selectedConfig?.direct_launch === true) return "";
  const entry = String(studentState.activityEntry || "").trim().toLowerCase();
  if (entry === "direct" || entry === "catalog-test") return "";
  return normalizeAccessCode(studentState.accessCode);
}

function getCurrentRouteName() {
  const rawHash = String(window.location.hash || "").replace(/^#\/?/, "");
  return String(rawHash.split("?")[0] || "home").trim() || "home";
}
