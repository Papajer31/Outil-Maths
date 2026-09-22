import { studentState } from "../student-state.js";
import { hydrateDirectLaunch } from "../student-actions.js";

export function renderDirectDoneView(root) {
  const token = String(studentState.selectedConfig?.direct_launch_token || "").trim();
  const title = String(studentState.selectedConfig?.config_name || "Activité").trim() || "Activité";
  root.innerHTML = `
    <div class="student-screen-shell student-stars-shell">
      <div class="student-stars-content student-home-content stack-lg text-center">
        <header class="stack-sm">
          <h1 class="title-xl">Activité terminée !</h1>
          <p>${escapeHtml(title)}</p>
        </header>
        ${token ? `<button class="btn btn-primary" type="button" data-action="restart-direct">Recommencer</button>` : ""}
      </div>
    </div>
  `;
  const restartButton = root.querySelector('[data-action="restart-direct"]');
  restartButton?.addEventListener("click", async () => {
    if (!token || restartButton.disabled) return;

    restartButton.disabled = true;
    try {
      const hydrated = await hydrateDirectLaunch(token);
      if (!hydrated) throw new Error("Lien direct indisponible.");

      // Navigation interne : on remplace l'écran de fin par la fusée de
      // sessionstart sans repasser par l'accueil ni recharger la SPA.
      window.location.replace("#/sessionstart?shared=1&direct=1");
    } catch (error) {
      console.warn("Impossible de recommencer le lien direct.", error);
      restartButton.disabled = false;
    }
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
