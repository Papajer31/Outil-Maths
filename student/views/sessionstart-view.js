import { studentState } from "../student-state.js";
import {
  goBackToActivities,
  getSelectedParticipantsValidationIssue,
  startSelectedActivity
} from "../student-actions.js";
import { ensureSelectedActivityMeta } from "../student-activity-meta.js";
import { createProjectedSessionLink } from "../../shared/projected-session-link.js";
import { requestAppFullscreen } from "../../shared/dom-helpers.js";
import { closeProjectedWindow } from "../projected-session.js";

const rocketOffUrl = new URL("../../shared/ui-assets/rocket-off.svg", import.meta.url).href;
const rocketOnUrl = new URL("../../shared/ui-assets/rocket-on.svg", import.meta.url).href;

export function renderSessionStartView(root){
  const isProjectedTeacherMode = studentState.sessionMode === "projected-teacher";
  const isSharedSessionEntry = studentState.sharedSessionEntry === true;
  root.innerHTML = `
    <div class="sessionstart-shell student-screen-shell student-stars-shell" id="sessionStartShell">
      <div class="student-stars-content">
        ${isSharedSessionEntry ? "" : `
          <button
            class="student-nav-btn student-nav-back"
            id="btnBackFromSessionStart"
            type="button"
            aria-label="Retour"
            data-skip-autofs="true"
          >
            <span class="student-icon" aria-hidden="true">arrow_back</span>
          </button>
        `}

        <div class="sessionstart-center">
          <button
            class="start-floating-btn"
            id="btnStartSession"
            type="button"
            aria-label="Démarrer"
          >
            <span class="start-rocket-visual" aria-hidden="true">
              <img class="start-rocket-img start-rocket-img-off" src="${rocketOffUrl}" alt="" draggable="false">
              <img class="start-rocket-img start-rocket-img-on" src="${rocketOnUrl}" alt="" draggable="false">
            </span>
          </button>
        </div>

        <div class="sessionstart-aux">
          <div class="sessionstart-message" id="sessionStartMessage"></div>
        </div>
      </div>
    </div>
  `;

  const controller = new AbortController();
  const { signal } = controller;

  const projectedSessionLink = isProjectedTeacherMode
    ? createProjectedSessionLink({
        accessCode: studentState.accessCode,
        configName: studentState.selectedConfig?.config_name,
        onMessage: handleProjectedMessage
      })
    : null;

  const els = {
    shell: root.querySelector("#sessionStartShell"),
    back: root.querySelector("#btnBackFromSessionStart"),
    start: root.querySelector("#btnStartSession"),
    message: root.querySelector("#sessionStartMessage")
  };

  let disposed = false;
  let requiresStudent = false;
  let blockingMessage = "";
  let isLaunching = false;
  let launchTimer = 0;

  els.back?.addEventListener("click", () => {
    if (isProjectedTeacherMode) {
      closeProjectedWindowFromView();
      return;
    }

    goBackToActivities();
  }, { signal });

  els.start?.addEventListener("click", () => {
    if (requiresStudent && getSelectedParticipantsValidationIssue()) return;
    if (blockingMessage || isLaunching) return;

    isLaunching = true;
    els.start?.classList.add("is-launching");

    window.clearTimeout(launchTimer);
    launchTimer = window.setTimeout(() => {
      startSelectedActivity();
    }, 360);
  }, { signal });

  els.shell?.addEventListener("click", (event) => {
    if (event.target.closest("[data-skip-autofs='true']")) return;
    requestAppFullscreen();
  }, { signal });

  window.addEventListener("unload", () => {
    notifyProjectionClosed();
  }, { signal });

  syncStartButton();
  sendProjectedStatus();
  void boot();

  return cleanup;

  async function boot(){
    if (!studentState.selectedConfig){
      els.start?.setAttribute("disabled", "disabled");
      goBackToActivities();
      return;
    }

    try {
      const meta = await ensureSelectedActivityMeta();
      if (disposed) return;

      requiresStudent = !!meta.requiresStudent;
      blockingMessage = String(meta.blockingMessage || "").trim();

      if (requiresStudent) {
        const selectionIssue = getSelectedParticipantsValidationIssue(meta);
        if (selectionIssue) {
          blockingMessage = selectionIssue;
        }

        if (isProjectedTeacherMode) {
          blockingMessage = "Cette activité nécessite un élève sélectionné et n’est pas encore compatible avec la projection.";
        }
      }

      syncStartButton();
    } catch (err) {
      if (disposed) return;
      els.start?.setAttribute("disabled", "disabled");
    }
  }

  function cleanup(){
    if (disposed) return;
    disposed = true;
    controller.abort();
    window.clearTimeout(launchTimer);
    try {
      projectedSessionLink?.close?.();
    } catch {}
  }

  function syncStartButton(){
    const selectionIssue = requiresStudent ? getSelectedParticipantsValidationIssue() : "";
    const missingStudent = requiresStudent && !!selectionIssue;
    const mustDisable = missingStudent || !!blockingMessage;

    els.start?.toggleAttribute("disabled", mustDisable);
    els.start?.classList.toggle("is-blocked", mustDisable);

    if (els.message) {
      els.message.textContent = blockingMessage || selectionIssue || "";
    }

    sendProjectedStatus();
  }

  function handleProjectedMessage(message){
    const type = String(message?.type || "").trim();

    if (type === "request-status") {
      sendProjectedStatus();
      return;
    }

    if (type !== "command") return;

    const command = String(message?.command || "").trim();
    if (command === "close") {
      closeProjectedWindowFromView();
    }
  }

  function sendProjectedStatus(){
    if (!isProjectedTeacherMode || !projectedSessionLink) return;

    projectedSessionLink.send("status", {
      active: true,
      route: "sessionstart",
      running: false,
      paused: false,
      phase: "START",
      currentToolIndex: -1,
      totalTools: 0,
      currentInstanceId: "",
      currentQuestionNumber: 0,
      totalQuestionCountLabel: "—",
      canGoPrevTool: false,
      canGoNextTool: false,
      canRevealAnswer: false,
      canAdvanceQuestion: false
    });
  }

  function notifyProjectionClosed(){
    if (!isProjectedTeacherMode || !projectedSessionLink) return;
    projectedSessionLink.send("projection-closed", { active: false });
  }

  function closeProjectedWindowFromView(){
    notifyProjectionClosed();
    closeProjectedWindow();
  }
}
