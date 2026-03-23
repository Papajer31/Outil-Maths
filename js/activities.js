import {
  normalizeClassCode,
  listPublicActivitiesForClass
} from "./users_info.js";

/* =========================
   DOM
   ========================= */

const btnBack = document.getElementById("btnBack");
const pillStatus = document.getElementById("pillStatus");
const classCodeLabel = document.getElementById("classCodeLabel");
const activitiesMessage = document.getElementById("activitiesMessage");
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
  const classCode = normalizeClassCode(params.get("classCode"));

  if (!classCode){
    showError("Code classe invalide.");
    return;
  }

  try {
    localStorage.setItem("lastClassCode", classCode);
  } catch {}

  if (classCodeLabel){
    classCodeLabel.textContent = `Classe : ${classCode}`;
  }

  if (pillStatus){
    pillStatus.textContent = "Chargement";
  }

  try {
    const activities = await listPublicActivitiesForClass(classCode);

    if (!Array.isArray(activities) || activities.length === 0){
      showEmpty(classCode);
      return;
    }

    renderActivities(classCode, activities);

    if (pillStatus){
      pillStatus.textContent = `${activities.length} activité${activities.length > 1 ? "s" : ""}`;
    }

    if (activitiesMessage){
      activitiesMessage.innerHTML = `
        <div style="font-weight:700;">
          Choisis une activité.
        </div>
      `;
    }

  } catch (err) {
    showError(err?.message || "Impossible de charger les activités.");
  }
}

function renderActivities(classCode, activities){
  if (!activitiesList) return;

  activitiesList.innerHTML = activities.map((activity) => {
    const configName = escapeHtml(activity.config_name ?? "Sans nom");
    const toolKey = escapeHtml(activity.tool_key ?? "");
    const createdAt = formatDate(activity.created_at);
    const updatedAt = formatDate(activity.updated_at);

    return `
      <button
        class="panel activity-card"
        type="button"
        data-config-name="${escapeAttr(activity.config_name ?? "")}"
        style="
          display:flex;
          flex-direction:column;
          align-items:flex-start;
          gap:8px;
          width:100%;
          text-align:left;
          cursor:pointer;
        "
      >
        <div style="font-weight:900;font-size:24px;">${configName}</div>

        <div style="color:var(--muted);font-size:15px;">
          ${toolKey ? `Outil : ${toolKey}` : ""}
        </div>

        <div style="color:var(--muted);font-size:13px;">
          ${updatedAt ? `Modifiée : ${updatedAt}` : createdAt ? `Créée : ${createdAt}` : ""}
        </div>
      </button>
    `;
  }).join("");

  activitiesList.querySelectorAll("[data-config-name]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const configName = btn.dataset.configName ?? "";
      if (!configName) return;

      window.location.href =
        `session.html?classCode=${encodeURIComponent(classCode)}&configName=${encodeURIComponent(configName)}`;
    });
  });
}

function showEmpty(classCode){
  if (pillStatus){
    pillStatus.textContent = "Aucune activité";
  }

  if (activitiesMessage){
    activitiesMessage.innerHTML = `
      <div style="font-weight:700;margin-bottom:8px;">Aucune activité trouvée</div>
      <div style="color:var(--muted);">
        La classe <strong>${escapeHtml(classCode)}</strong> ne contient encore aucune activité publique.
      </div>
    `;
  }

  if (activitiesList){
    activitiesList.innerHTML = "";
  }
}

function showError(message){
  if (pillStatus){
    pillStatus.textContent = "Erreur";
  }

  if (activitiesMessage){
    activitiesMessage.innerHTML = `
      <div style="font-weight:700;margin-bottom:8px;">Erreur</div>
      <div style="color:var(--muted);">${escapeHtml(message)}</div>
    `;
  }

  if (activitiesList){
    activitiesList.innerHTML = "";
  }
}

/* =========================
   HELPERS
   ========================= */

function formatDate(value){
  if (!value) return "";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  return d.toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

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