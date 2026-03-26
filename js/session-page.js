import {
  normalizeAccessCode,
  loadPublicActivityConfig,
  listPublicStudentsForSpace
} from "./users_info.js";

import {
  createSessionEngine
} from "./session-core.js";


/* =========================
   DOM
   ========================= */

const els = {
  btnBackToActivities: document.getElementById("btnBackToActivities"),
  btnPause: document.getElementById("btnPause"),
  btnFullscreen: document.getElementById("btnFullscreen"),
  headerTitle: document.getElementById("headerTitle"),
  pillStatus: document.getElementById("pillStatus"),

  workArea: document.getElementById("workArea"),

  overlay: document.getElementById("overlay"),
  overlayTitle: document.getElementById("overlayTitle"),
  overlayBody: document.getElementById("overlayBody"),
  overlayActions: document.getElementById("overlayActions"),
  overlayHint: document.getElementById("overlayHint"),

  toolOverlay: document.getElementById("toolOverlay"),
  toolOverlayTitle: document.getElementById("toolOverlayTitle"),
  toolOverlayBody: document.getElementById("toolOverlayBody"),
  toolOverlayActions: document.getElementById("toolOverlayActions"),
  toolOverlayHint: document.getElementById("toolOverlayHint"),

  timer: document.getElementById("globalTimer"),
  timerBar: document.getElementById("timerBar"),
};

let accessCode = "";
let configName = "";
let engine = null;

/* =========================
   INIT
   ========================= */

boot();

/* =========================
   BOOT
   ========================= */

async function boot(){
  const params = new URLSearchParams(window.location.search);

  accessCode = normalizeAccessCode(
    params.get("accessCode") || params.get("classCode")
  );
  configName = String(params.get("configName") || "").trim();

  if (!accessCode || !configName){
    showFatalError("Paramètres invalides. Retourne à la liste des activités.");
    return;
  }

  try {
    localStorage.setItem("lastAccessCode", accessCode);
  } catch {}

  bindStaticEvents();
  updateFullscreenButton();
  document.addEventListener("fullscreenchange", updateFullscreenButton);

  setStatus("Chargement…", "warn");

  try {
    const remote = await loadPublicActivityConfig(accessCode, configName);

    if (!remote?.config_json?.drafts){
      showFatalError("Configuration introuvable ou invalide.");
      return;
    }

    const moduleKey = String(
      remote.module_key ??
      remote.module ??
      "maths"
    ).trim();

    if (!moduleKey){
      showFatalError("Module d’activité introuvable.");
      return;
    }

    engine = createSessionEngine({
      els,
      accessCode,
      configName,
      moduleKey,
      globals: remote.config_json.globals ?? {},
      drafts: remote.config_json.drafts,
      onExitToActivities: goBackToActivities,
      onFatalError: (message) => showFatalError(message),
    });

    await engine.init();

    const meta = engine.getSessionMeta?.() ?? { requiresStudent: false };

    if (meta.requiresStudent) {
      const students = await listPublicStudentsForSpace(accessCode);
      const allowedIds = Array.isArray(meta.allowedStudentIds) ? meta.allowedStudentIds : [];

      const filteredStudents = Array.isArray(students)
        ? students.filter((student) => allowedIds.includes(String(student?.id || "")))
        : [];

      if (filteredStudents.length === 0) {
        showFatalError("Cette activité nécessite un élève, mais aucun élève concerné n’est disponible.");
        return;
      }

      openStudentSelectionOverlay(filteredStudents);
      return;
    }

    await engine.openStartOverlay();

  } catch (err) {
    showFatalError(err?.message || "Impossible de charger cette activité.");
  }
}

/* =========================
   EVENTS
   ========================= */

function bindStaticEvents(){
  els.btnBackToActivities?.addEventListener("click", () => {
    if (engine?.isRunning?.()){
      const ok = window.confirm("Une séance est en cours. Quitter la séance ?");
      if (!ok) return;
    }
    goBackToActivities();
  });

  els.btnPause?.addEventListener("click", () => {
    engine?.pauseForInterruption?.("Pause");
  });

  els.btnFullscreen?.addEventListener("click", async () => {
    await enterFullscreen();
  });

  window.addEventListener("beforeunload", (e) => {
    if (!engine?.isRunning?.()) return;
    e.preventDefault();
    e.returnValue = "";
  });


  window.addEventListener("keydown", (e) => {
    const isRefresh = (e.key === "F5") || (e.ctrlKey && e.key.toLowerCase() === "r");
    if (!isRefresh) return;
    if (!engine?.isRunning?.()) return;

    e.preventDefault();

    openOverlay({
      title: "Quitter ?",
      body: `<div class="panel">Une séance est en cours.</div>`,
      actions: [
        {
          label: "Annuler",
          primary: false,
          onClick: () => {
            closeOverlay();
          }
        },
        {
          label: "Quitter",
          primary: true,
          onClick: () => {
            goBackToActivities();
          }
        }
      ],
      hint: ""
    });
  });
}

/* =========================
   NAVIGATION
   ========================= */

function goBackToActivities(){
  window.location.href = `activities.html?accessCode=${encodeURIComponent(accessCode)}`;
}

/* =========================
   UI HELPERS
   ========================= */

function openStudentSelectionOverlay(students){
  const rows = Array.isArray(students)
    ? [...students].sort((a, b) => {
        const classOrderA = Number(a?.class_display_order ?? 0);
        const classOrderB = Number(b?.class_display_order ?? 0);
        if (classOrderA !== classOrderB) return classOrderA - classOrderB;

        const firstNameA = String(a?.first_name || "").toLowerCase();
        const firstNameB = String(b?.first_name || "").toLowerCase();
        return firstNameA.localeCompare(firstNameB, "fr");
      })
    : [];

  const duplicateMap = countFirstNameDuplicates(rows);

  openOverlay({
    title: "",
    body: `
      <div class="student-panel">
        <div class="student-panel-topbar">
          <button
            class="btn btn-icon student-back-btn"
            id="studentBackBtn"
            type="button"
            aria-label="Retour"
          >
            <span class="icon">&#xEAA7;</span>
          </button>
        </div>

        <div id="studentSelectionGrid" class="student-selection-grid">
          ${rows.map((student) => {
            const firstName = String(student.first_name || "").trim();
            const className = String(student.class_name || "").trim();
            const showClassName = duplicateMap.get(firstName.toLowerCase()) > 1 && className;

            return `
              <button
                type="button"
                class="student-selection-btn"
                data-student-id="${escapeAttr(student.id ?? "")}"
              >
                <div class="student-selection-emoji">🙂</div>
                <div class="student-selection-name">${escapeHtml(firstName)}</div>
                ${showClassName ? `<div class="student-selection-class">${escapeHtml(className)}</div>` : ""}
              </button>
            `;
          }).join("")}
        </div>
      </div>
    `,
    actions: [],
    hint: ""
  });

  document.getElementById("studentBackBtn")
    ?.addEventListener("click", goBackToActivities);

  document.querySelectorAll("[data-student-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const studentId = String(btn.dataset.studentId || "");
      const student = rows.find((row) => String(row.id || "") === studentId);
      if (!student) return;

      try {
        engine?.setSelectedStudent?.(student);
        await engine?.openStartOverlay?.();
      } catch (err) {
        showFatalError(err?.message || "Impossible d’ouvrir la séance.");
      }
    });
  });
}

function countFirstNameDuplicates(students){
  const map = new Map();

  for (const student of students) {
    const key = String(student?.first_name || "").trim().toLowerCase();
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }

  return map;
}

function escapeAttr(s){
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

   function setStatus(text, mood){
  if (els.pillStatus){
    els.pillStatus.textContent = text;
    els.pillStatus.classList.remove("good", "warn", "bad");

    if (mood === "good") els.pillStatus.classList.add("good");
    else if (mood === "warn") els.pillStatus.classList.add("warn");
    else if (mood === "bad") els.pillStatus.classList.add("bad");
  }

  if (els.headerTitle){
    els.headerTitle.textContent = text;
  }
}

function showFatalError(message){
  setStatus("Erreur", "bad");

  openOverlay({
    title: "Erreur",
    body: `
      <div class="panel" style="text-align:center;">
        <div style="font-weight:700;margin-bottom:8px;">Impossible d’ouvrir la séance</div>
        <div>${escapeHtml(message)}</div>
      </div>
    `,
    actions: [
      {
        label: "Retour aux activités",
        primary: true,
        onClick: goBackToActivities
      }
    ],
    hint: ""
  });
}

function updateFullscreenButton(){
  if (!els.btnFullscreen) return;
  const isFs = !!document.fullscreenElement;
  els.btnFullscreen.style.display = isFs ? "none" : "";
}

async function enterFullscreen(){
  try {
    if (!document.fullscreenElement){
      await document.documentElement.requestFullscreen();
    }
  } catch {
    // silence volontaire
  } finally {
    updateFullscreenButton();
  }
}

function openOverlay({ title, body, actions, hint, opaque = false }){
  if (els.overlayTitle) els.overlayTitle.textContent = title ?? "";
  if (els.overlayBody) els.overlayBody.innerHTML = body ?? "";
  if (els.overlayHint) els.overlayHint.innerHTML = hint ?? "";

  if (els.overlayActions){
    els.overlayActions.innerHTML = "";

    for (const a of (actions ?? [])){
      const btn = document.createElement("button");
      btn.className = `btn ${a.primary ? "primary" : ""}`.trim();
      btn.textContent = a.label;
      btn.addEventListener("click", a.onClick);
      els.overlayActions.appendChild(btn);
    }
  }

  els.overlay?.classList.toggle("opaque", !!opaque);
  els.overlay?.classList.remove("hidden");
}

function closeOverlay(){
  els.overlay?.classList.add("hidden");
  els.overlay?.classList.remove("opaque");
  if (els.overlayActions) els.overlayActions.innerHTML = "";
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}