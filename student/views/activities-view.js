import { studentState } from "../student-state.js";
import { goBackHome, selectActivity } from "../student-actions.js";

export function renderActivitiesView(root){
  root.innerHTML = `
    <div class="activities-shell student-screen-shell" id="activitiesShell">
      <button
        class="student-nav-btn student-nav-back"
        id="btnBackHome"
        type="button"
        aria-label="Retour"
        data-skip-autofs="true"
      >
        <span class="student-icon" aria-hidden="true">arrow_back</span>
      </button>

      <div id="activitiesList" class="activities-list activities-list-alone">
        ${renderActivitiesContent()}
      </div>
    </div>
  `;

  document.getElementById("btnBackHome")
    ?.addEventListener("click", goBackHome);

  document.getElementById("activitiesShell")
    ?.addEventListener("click", (event) => {
      if (event.target.closest("[data-skip-autofs='true']")) return;
      enterFullscreenIfPossible();
    });

  document.querySelectorAll("[data-config-name]").forEach((button) => {
    button.addEventListener("click", () => {
      void selectActivity(button.dataset.configName || "");
    });
  });
}

function renderActivitiesContent(){
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

  return studentState.activities.map((activity) => `
    <button
      class="activity-tile"
      type="button"
      data-config-name="${escapeAttr(activity?.config_name || "")}"
    >
      ${escapeHtml(activity?.config_name || "Sans nom")}
    </button>
  `).join("");
}

function escapeHtml(value){
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value){
  return escapeHtml(value);
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
