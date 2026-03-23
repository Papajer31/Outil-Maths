import {
  normalizeClassCode,
  loadPublicActivityConfig
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

let classCode = "";
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

  classCode = normalizeClassCode(params.get("classCode"));
  configName = String(params.get("configName") || "").trim();

  if (!classCode || !configName){
    showFatalError("Paramètres invalides. Retourne à la liste des activités.");
    return;
  }

  try {
    localStorage.setItem("lastClassCode", classCode);
  } catch {}

  bindStaticEvents();
  updateFullscreenButton();
  document.addEventListener("fullscreenchange", updateFullscreenButton);

  setStatus("Chargement…", "warn");

  try {
    const remote = await loadPublicActivityConfig(classCode, configName);

    if (!remote?.config_json?.drafts){
      showFatalError("Configuration introuvable ou invalide.");
      return;
    }

    const moduleKey = String(
      remote.module_key ??
      remote.tool_key ??
      remote.module ??
      "maths"
    ).trim();

    if (!moduleKey){
      showFatalError("Module d’activité introuvable.");
      return;
    }

    engine = createSessionEngine({
      els,
      classCode,
      configName,
      moduleKey,
      drafts: remote.config_json.drafts,
      onExitToActivities: goBackToActivities,
      onFatalError: (message) => showFatalError(message),
    });

    await engine.init();
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

  document.addEventListener("visibilitychange", () => {
    if (document.hidden){
      engine?.pauseForInterruption?.("Pause (onglet masqué)");
    }
  });

  window.addEventListener("blur", () => {
    engine?.pauseForInterruption?.("Pause (fenêtre inactive)");
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
            engine?.resumeAfterPause?.();
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
  window.location.href = `activities.html?classCode=${encodeURIComponent(classCode)}`;
}

/* =========================
   UI HELPERS
   ========================= */

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