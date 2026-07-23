import { escapeHtml } from "./text-utils.js";

/**
 * Confirmation applicative commune aux vues du tableau de bord.
 * Elle remplace les boîtes système, dont le rendu varie selon le navigateur.
 */
export function openDashboardConfirmDialog({
  title = "Confirmer l’action",
  message = "",
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  danger = false
} = {}){
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal dashboard-confirm-dialog";
    overlay.setAttribute("role", "presentation");
    overlay.innerHTML = `
      <section class="modal-content" role="dialog" aria-modal="true" aria-labelledby="dashboardConfirmDialogTitle">
        <header class="dashboard-confirm-dialog-header">
          <h2 class="modal-title" id="dashboardConfirmDialogTitle">${escapeHtml(title)}</h2>
        </header>
        <p class="dashboard-confirm-dialog-message">${escapeHtml(message)}</p>
        <footer class="modal-actions dashboard-confirm-dialog-actions">
          <button class="btn" type="button" data-confirm-dialog-cancel>${escapeHtml(cancelLabel)}</button>
          <button class="btn ${danger ? "dashboard-danger-btn" : "primary"}" type="button" data-confirm-dialog-confirm>${escapeHtml(confirmLabel)}</button>
        </footer>
      </section>
    `;

    let settled = false;
    const close = (confirmed = false) => {
      if (settled) return;
      settled = true;
      overlay.remove();
      resolve(confirmed);
    };

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close(false);
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
      }
    });
    overlay.querySelectorAll("[data-confirm-dialog-cancel]").forEach((button) => {
      button.addEventListener("click", () => close(false));
    });
    overlay.querySelector("[data-confirm-dialog-confirm]")?.addEventListener("click", () => close(true));

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.querySelector("[data-confirm-dialog-cancel]")?.focus());
  });
}
