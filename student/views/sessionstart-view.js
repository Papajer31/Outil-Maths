import { studentState } from "../student-state.js";
import {
  goBackToActivities,
  goBackToSessionChoice,
  startSelectedActivity
} from "../student-actions.js";
import { ensureSelectedActivityMeta } from "../student-activity-meta.js";

export function renderSessionStartView(root){
  root.innerHTML = `
    <div class="sessionstart-shell student-screen-shell" id="sessionStartShell">
      <button
        class="student-nav-btn student-nav-back"
        id="btnBackFromSessionStart"
        type="button"
        aria-label="Retour"
        data-skip-autofs="true"
      >
        <span class="student-icon" aria-hidden="true">arrow_back</span>
      </button>

      <div class="sessionstart-center">
        <button
          class="start-floating-btn"
          id="btnStartSession"
          type="button"
          aria-label="Démarrer"
          title="Démarrer"
        >
          <span class="student-icon start-floating-btn-icon" aria-hidden="true">arrow_circle_right</span>
        </button>
      </div>
    </div>
  `;

  const controller = new AbortController();
  const { signal } = controller;

  const els = {
    shell: root.querySelector("#sessionStartShell"),
    back: root.querySelector("#btnBackFromSessionStart"),
    start: root.querySelector("#btnStartSession")
  };

  let disposed = false;
  let requiresStudent = false;

  els.back?.addEventListener("click", () => {
    if (requiresStudent) {
      goBackToSessionChoice();
      return;
    }

    goBackToActivities();
  }, { signal });

  els.start?.addEventListener("click", () => {
    if (requiresStudent && !studentState.selectedStudent) return;
    startSelectedActivity();
  }, { signal });

  els.shell?.addEventListener("click", (event) => {
    if (event.target.closest("[data-skip-autofs='true']")) return;
    enterFullscreenIfPossible();
  }, { signal });

  syncStartButton();
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

      if (requiresStudent) {
        const selectedStudentId = String(studentState.selectedStudent?.id || "").trim();
        if (!selectedStudentId || !meta.allowedStudentIds.includes(selectedStudentId)) {
          goBackToSessionChoice();
          return;
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
  }

  function syncStartButton(){
    const mustDisable = requiresStudent && !studentState.selectedStudent;
    els.start?.toggleAttribute("disabled", mustDisable);
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
