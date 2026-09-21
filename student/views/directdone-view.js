import { studentState } from "../student-state.js";

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
  root.querySelector('[data-action="restart-direct"]')?.addEventListener("click", () => {
    if (!token) return;
    const page = new URL(window.location.href);
    page.hash = `/launch?token=${encodeURIComponent(token)}`;
    window.location.href = page.href;
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
