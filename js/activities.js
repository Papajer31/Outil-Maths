import {
  normalizeAccessCode,
  listPublicActivitiesForSpace
} from "./users_info.js";


/* =========================
   DOM
   ========================= */

const btnBack = document.getElementById("btnBack");
const activitiesList = document.getElementById("activitiesList");

/* =========================
   INIT
   ========================= */

boot();

/* =========================
   EVENTS
   ========================= */

btnBack?.addEventListener("click", () => {
  window.location.href = "index.html";
});

/* =========================
   LOGIQUE
   ========================= */

async function boot(){
  const params = new URLSearchParams(window.location.search);

  const accessCode = normalizeAccessCode(
    params.get("accessCode") || params.get("classCode")
  );

  if (!accessCode){
    showError("Code de connexion invalide.");
    return;
  }

  try {
    localStorage.setItem("lastAccessCode", accessCode);
  } catch {}

  try {
    const activities = await listPublicActivitiesForSpace(accessCode);

    if (!Array.isArray(activities) || activities.length === 0){
      showEmpty();
      return;
    }

    renderActivities(accessCode, activities);

  } catch (err) {
    showError(err?.message || "Impossible de charger les activités.");
  }
}

function renderActivities(accessCode, activities){
  if (!activitiesList) return;

  activitiesList.innerHTML = activities.map((activity) => {
    const configName = escapeHtml(activity.config_name ?? "Sans nom");

    return `
      <button
        class="panel activity-tile"
        type="button"
        data-config-name="${escapeAttr(activity.config_name ?? "")}"
      >
        ${configName}
      </button>
    `;
  }).join("");

  activitiesList.querySelectorAll("[data-config-name]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const configName = btn.dataset.configName ?? "";
      if (!configName) return;

      window.location.href =
        `session.html?accessCode=${encodeURIComponent(accessCode)}&configName=${encodeURIComponent(configName)}`;
    });
  });
}

function showEmpty(){
  if (activitiesList){
    activitiesList.innerHTML = "";
  }
}

function showError(){
  if (activitiesList){
    activitiesList.innerHTML = "";
  }
}

/* =========================
   HELPERS
   ========================= */

function escapeHtml(s){
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(s){
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}