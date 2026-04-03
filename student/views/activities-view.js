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

  const activities = [...(studentState.activities || [])]
    .filter((activity) => activity?.is_visible !== false)
    .sort((a, b) => {
      const orderA = Number(a?.display_order);
      const orderB = Number(b?.display_order);
      if (Number.isFinite(orderA) && Number.isFinite(orderB) && orderA !== orderB) {
        return orderA - orderB;
      }
      return String(a?.config_name || "").localeCompare(String(b?.config_name || ""), "fr", { sensitivity: "base" });
    });

  if (!activities.length){
    return `
      <div class="activities-placeholder">
        Aucune activité disponible.
      </div>
    `;
  }

  return activities.map((activity) => `
    <button
      class="activity-tile ${activity?.is_highlighted ? "is-highlighted" : ""}"
      type="button"
      data-config-name="${escapeAttr(activity?.config_name || "")}"
    >
      <span class="activity-tile-label">${escapeHtml(activity?.config_name || "Sans nom")}</span>
      ${activity?.is_highlighted ? '<span class="activity-tile-badge">Activité du moment</span>' : ''}
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
