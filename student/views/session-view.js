import { studentState } from "../student-state.js";
import {
  goBackToActivities
} from "../student-actions.js";
import {
  normalizeAccessCode,
  loadPublicActivityConfig
} from "../student-api.js";
import { createSessionEngine } from "../../shared/student-core.js";

export function renderSessionView(root){
  root.innerHTML = `
    <div class="session-page" id="sessionPage">
      <button
        class="student-nav-btn student-nav-back student-session-back"
        id="btnBackToActivities"
        type="button"
        aria-label="Retour"
        data-skip-autofs="true"
      >
        <span class="student-icon" aria-hidden="true">arrow_back</span>
      </button>

      <button
        class="student-nav-btn student-nav-action student-session-pause"
        id="btnPause"
        title="Pause"
        type="button"
        aria-label="Pause"
        data-skip-autofs="true"
      >
        <span class="student-icon" id="btnPauseIcon" aria-hidden="true">pause</span>
      </button>

      <div id="globalTimer" class="timer hidden" aria-hidden="true">
        <div class="timer-bar" id="timerBar"></div>
      </div>

      <div id="sessionViewport" class="session-viewport">
        <div id="sessionWorkArea" class="session-workarea"></div>
        <div
          id="sessionStageLayer"
          class="hidden session-stage-layer"
          aria-live="polite"
        ></div>
        <div
          id="sessionConfirmLayer"
          class="hidden session-confirm-layer"
          aria-live="polite"
          data-skip-autofs="true"
        ></div>
      </div>
    </div>
  `;

  const controller = new AbortController();
  const { signal } = controller;

  let engine = null;
  let disposed = false;
  let exitConfirmOpen = false;

  const els = {
    btnBackToActivities: root.querySelector("#btnBackToActivities"),
    btnPause: root.querySelector("#btnPause"),
    btnPauseIcon: root.querySelector("#btnPauseIcon"),
    workArea: root.querySelector("#sessionWorkArea"),
    stageLayer: root.querySelector("#sessionStageLayer"),
    confirmLayer: root.querySelector("#sessionConfirmLayer"),
    timer: root.querySelector("#globalTimer"),
    timerBar: root.querySelector("#timerBar")
  };

  const accessCode = normalizeAccessCode(studentState.accessCode);
  const configName = String(studentState.selectedConfig?.config_name || "").trim();

  bindStaticEvents();
  void boot();

  return cleanup;

  async function boot(){
    if (!accessCode || !configName){
      showFatalError("Paramètres invalides. Retourne à la liste des activités.");
      return;
    }

    try {
      const remote = await loadPublicActivityConfig(accessCode, configName);
      if (disposed) return;

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
        onExitToActivities: () => {
          goBackToActivities();
        },
        onFatalError: (message) => {
          showFatalError(message);
        },
      });

      await engine.init();

      if (disposed){
        engine.stop?.();
        return;
      }

      const meta = engine.getSessionMeta?.() ?? { requiresStudent: false, allowedStudentIds: [] };

      if (meta.requiresStudent) {
        const selectedStudent = studentState.selectedStudent;
        const selectedStudentId = String(selectedStudent?.id || "").trim();
        const allowedIds = Array.isArray(meta.allowedStudentIds) ? meta.allowedStudentIds.map(String) : [];

        if (!selectedStudentId || !allowedIds.includes(selectedStudentId)) {
          goBackToSessionStart();
          return;
        }

        engine.setSelectedStudent?.(selectedStudent);
      }

      await engine.startSession?.();
      syncPauseButton();
    } catch (err) {
      if (disposed) return;
      showFatalError(err?.message || "Impossible de charger cette activité.");
    }
  }

  function cleanup(){
    if (disposed) return;
    disposed = true;

    closeExitConfirm();
    controller.abort();

    try {
      engine?.stop?.();
    } catch {}
  }

  function bindStaticEvents(){
    els.btnBackToActivities?.addEventListener("click", () => {
      if (!engine?.isRunning?.()) {
        goBackToActivities();
        return;
      }

      openExitConfirm();
    }, { signal });

    els.btnPause?.addEventListener("click", () => {
      if (!engine || exitConfirmOpen) return;

      if (engine.isPaused?.()) {
        engine.resumeAfterPause?.();
      } else {
        engine.pauseForInterruption?.();
      }

      syncPauseButton();
    }, { signal });

    root.addEventListener("click", (event) => {
      if (event.target.closest("[data-skip-autofs='true']")) return;
      enterFullscreenIfPossible();
    }, { signal });

    window.addEventListener("beforeunload", (e) => {
      if (!engine?.isRunning?.()) return;
      e.preventDefault();
      e.returnValue = "";
    }, { signal });

    window.addEventListener("keydown", (e) => {
      const isRefresh = (e.key === "F5") || (e.ctrlKey && e.key.toLowerCase() === "r");
      if (!isRefresh) return;
      if (!engine?.isRunning?.()) return;

      e.preventDefault();
      openExitConfirm();
    }, { signal });
  }

  function syncPauseButton(){
    const paused = !!engine?.isPaused?.();
    const running = !!engine?.isRunning?.();

    if (els.btnPause) {
      els.btnPause.disabled = !running && !paused;
      els.btnPause.title = paused ? "Reprendre" : "Pause";
      els.btnPause.setAttribute("aria-label", paused ? "Reprendre" : "Pause");
    }

    if (els.btnPauseIcon) {
      els.btnPauseIcon.textContent = paused ? "play_arrow" : "pause";
    }
  }


  function openExitConfirm(){
    if (!engine?.isRunning?.()) {
      goBackToActivities();
      return;
    }

    if (!engine.isPaused?.()) {
      engine.pauseForInterruption?.();
    }

    exitConfirmOpen = true;
    renderExitConfirm();
    syncPauseButton();
  }

  function closeExitConfirm(){
    exitConfirmOpen = false;

    if (els.confirmLayer) {
      els.confirmLayer.innerHTML = "";
      els.confirmLayer.classList.add("hidden");
    }
  }

  function resumeFromExitConfirm(){
    closeExitConfirm();
    engine?.resumeAfterPause?.();
    syncPauseButton();
  }

  function leaveSessionFromExitConfirm(){
    goBackToActivities();
  }

  function renderExitConfirm(){
    if (!els.confirmLayer) return;

    els.confirmLayer.innerHTML = `
      <div class="session-confirm-backdrop"></div>
      <div class="session-confirm-dialog">
        <div class="session-confirm-title">Quitter la séance ?</div>
        <div class="session-confirm-text">La séance en cours va être interrompue.</div>
        <div class="session-confirm-actions">
          <button class="btn session-confirm-btn" id="sessionConfirmStayBtn" type="button" data-skip-autofs="true">Non</button>
          <button class="btn primary session-confirm-btn" id="sessionConfirmLeaveBtn" type="button" data-skip-autofs="true">Oui</button>
        </div>
      </div>
    `;

    els.confirmLayer.classList.remove("hidden");

    els.confirmLayer.querySelector("#sessionConfirmStayBtn")
      ?.addEventListener("click", resumeFromExitConfirm, { signal });

    els.confirmLayer.querySelector("#sessionConfirmLeaveBtn")
      ?.addEventListener("click", leaveSessionFromExitConfirm, { signal });
  }

  function showFatalError(message){
    els.workArea.innerHTML = `
      <div class="session-stage">
        <div class="session-message-card session-message-card-error">
          <div class="session-message-title">Impossible d’ouvrir la séance</div>
          <div class="session-message-text">${escapeHtml(message)}</div>
          <button class="btn primary btn-big" id="sessionFatalBackBtn" type="button">Retour aux activités</button>
        </div>
      </div>
    `;

    document.getElementById("sessionFatalBackBtn")
      ?.addEventListener("click", goBackToActivities, { signal });

    syncPauseButton();
  }
}

function enterFullscreenIfPossible(){
  try {
    if (!document.fullscreenElement){
      const result = document.documentElement.requestFullscreen?.();
      if (result?.catch){
        result.catch(() => {});
      }
    }
  } catch {}
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
