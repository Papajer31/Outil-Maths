import { studentState } from "../student-state.js";
import { goBackHome, selectActivitiesMode } from "../student-actions.js";
import { requestAppFullscreen } from "../../shared/dom-helpers.js";
import { renderMaterialIcon } from "../../shared/material-icons-svg.js";

export function renderSelectModeView(root) {
  const currentMode = String(studentState.activitiesMode || "").trim().toLowerCase() === "group"
    ? "group"
    : "individual";

  root.innerHTML = `
    <div class="selectmode-shell student-screen-shell student-stars-shell" id="selectModeShell">
      <button
        class="student-nav-btn student-nav-back"
        id="btnBackToHome"
        type="button"
        aria-label="Retour"
        data-skip-autofs="true"
      >
        ${renderMaterialIcon("arrow_back")}
      </button>

      <div class="student-stars-content selectmode-content">
        <section class="selectmode-panel" aria-label="Choix du mode">
          <div class="selectmode-grid" role="group" aria-label="Choix du mode">
            <button
              type="button"
              class="selectmode-card${currentMode === "individual" ? " is-selected" : ""}"
              data-activity-mode="individual"
            >
              <div class="selectmode-card-title">Je suis tout seul</div>
              <div class="selectmode-card-visual" aria-hidden="true">
                <img
                  class="selectmode-card-img"
                  src="./student/assets/astro-seul.webp"
                  alt=""
                >
              </div>
            </button>

            <button
              type="button"
              class="selectmode-card${currentMode === "group" ? " is-selected" : ""}"
              data-activity-mode="group"
            >
              <div class="selectmode-card-title">Nous sommes plusieurs</div>
              <div class="selectmode-card-visual" aria-hidden="true">
                <img
                  class="selectmode-card-img"
                  src="./student/assets/astro-group.webp"
                  alt=""
                >
              </div>
            </button>
          </div>
        </section>
      </div>
    </div>
  `;

  const controller = new AbortController();
  const { signal } = controller;

  const shell = root.querySelector("#selectModeShell");

  root.querySelector("#btnBackToHome")?.addEventListener("click", goBackHome, { signal });
  shell?.addEventListener("click", (event) => {
    if (event.target.closest("[data-skip-autofs='true']")) return;
    requestAppFullscreen();
  }, { signal });

  root.querySelectorAll("[data-activity-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = String(button.dataset.activityMode || "").trim();
      if (!mode) return;

      selectActivitiesMode(mode);
      window.location.hash = "#/selectstudents";
    }, { signal });
  });

  return () => controller.abort();
}
