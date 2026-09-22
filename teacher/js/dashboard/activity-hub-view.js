export function createActivityHubViewController({
  view,
  onOpenExploration,
  onOpenMyActivities,
  onOpenAssignedWork
} = {}) {
  function render() {
    if (!view) return;
    view.innerHTML = `
      <div class="dashboard-config-header dashboard-explorer-header">
        <div class="dashboard-config-header-main">
          <div class="dashboard-section-title">Activités</div>
        </div>
        <div class="dashboard-config-header-center" aria-hidden="true"></div>
        <div class="dashboard-config-header-actions" aria-hidden="true"></div>
      </div>

      <div class="activity-hub-shell dashboard-content-scroll dashboard-config-list">
        <div class="activity-hub-grid activity-hub-grid--three" aria-label="Espaces Activités">
          ${renderHubCard({
            action: "open-exploration",
            icon: "travel_explore",
            title: "Exploration",
            text: "Le catalogue d’activités du site, organisé selon les programmes et disponible aux élèves."
          })}
          ${renderHubCard({
            action: "open-my-activities",
            icon: "edit_note",
            title: "Mes activités",
            text: "Créer, classer et retrouver vos propres quiz, séries et activités génératives."
          })}
          ${renderHubCard({
            action: "open-assigned",
            icon: "assignment_ind",
            title: "Activités attribuées",
            text: "Voir les activités et séquences actuellement proposées aux élèves, puis en attribuer de nouvelles."
          })}
        </div>

      </div>
    `;
    bindEvents();
  }

  function renderHubCard({ action, icon, title, text }) {
    return `
      <button class="activity-hub-card panel" type="button" data-action="${action}">
        <span class="activity-hub-card-icon dashboard-material-icon" aria-hidden="true">${icon}</span>
          <span class="activity-hub-card-copy">
            <span class="activity-hub-card-title">${title}</span>
            <span class="activity-hub-card-text">${text}</span>
          </span>
      </button>
    `;
  }

  function bindEvents() {
    view?.querySelector("[data-action='open-exploration']")?.addEventListener("click", () => onOpenExploration?.());
    view?.querySelector("[data-action='open-my-activities']")?.addEventListener("click", () => onOpenMyActivities?.());
    view?.querySelector("[data-action='open-assigned']")?.addEventListener("click", () => onOpenAssignedWork?.());
  }

  return { render };
}
