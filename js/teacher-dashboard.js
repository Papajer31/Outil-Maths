import {
  getCurrentUser,
  signOutUser,
  normalizeClassCode,
  getMyClassSpaces,
  getMyClassSpaceByCode,
  createOrGetMyClassSpace,
  markClassSpaceAsOpened,
  updateMyClassSpace,
  deleteMyClassSpace,
  getMyActivitiesForClass,
  deleteMyActivity
} from "./users_info.js";

/* =========================
   DOM
   ========================= */

const btnLogout = document.getElementById("btnLogout");
const btnNewConfig = document.getElementById("btnNewConfig");

const teacherEmail = document.getElementById("teacherEmail");
const classesList = document.getElementById("classesList");
const selectedClassLabel = document.getElementById("selectedClassLabel");
const configsList = document.getElementById("configsList");

const btnAddClass = document.getElementById("btnAddClass");
const classModal = document.getElementById("classModal");
const modalClassInput = document.getElementById("modalClassInput");
const btnModalCreate = document.getElementById("btnModalCreate");
const btnModalCancel = document.getElementById("btnModalCancel");
const modalMessage = document.getElementById("modalMessage");

const editClassModal = document.getElementById("editClassModal");
const editClassNameInput = document.getElementById("editClassNameInput");
const editClassMessage = document.getElementById("editClassMessage");
const btnEditClassCancel = document.getElementById("btnEditClassCancel");
const btnEditClassSave = document.getElementById("btnEditClassSave");

const deleteClassModal = document.getElementById("deleteClassModal");
const deleteClassText = document.getElementById("deleteClassText");
const deleteClassMessage = document.getElementById("deleteClassMessage");
const btnDeleteClassCancel = document.getElementById("btnDeleteClassCancel");
const btnDeleteClassConfirm = document.getElementById("btnDeleteClassConfirm");

/* =========================
   STATE
   ========================= */

let currentUser = null;
let currentClassSpace = null;
let pendingClassSpace = null;

/* =========================
   INIT
   ========================= */

boot();

/* =========================
   EVENTS
   ========================= */

btnLogout?.addEventListener("click", logout);

btnNewConfig?.addEventListener("click", () => {
  if (!currentClassSpace){
    setClassActionMessage("Choisis d’abord une classe.", true);
    return;
  }

  goToConfigEditor({
    classCode: currentClassSpace.class_code
  });
});

async function logout(){
  try {
    await signOutUser();
    window.location.href = "index.html";
  } catch {
    alert("Erreur lors de la déconnexion.");
  }
}

btnAddClass?.addEventListener("click", openModal);
btnModalCancel?.addEventListener("click", closeModal);
btnModalCreate?.addEventListener("click", createClassFromModal);

modalClassInput?.addEventListener("keydown", async (e) => {
  if (e.key === "Enter"){
    e.preventDefault();
    await createClassFromModal();
    return;
  }

  if (e.key === "Escape"){
    e.preventDefault();
    closeModal();
  }
});

classModal?.addEventListener("click", (e) => {
  if (e.target === classModal){
    closeModal();
  }
});

btnEditClassCancel?.addEventListener("click", closeEditClassModal);
btnEditClassSave?.addEventListener("click", submitEditClass);

btnDeleteClassCancel?.addEventListener("click", closeDeleteClassModal);
btnDeleteClassConfirm?.addEventListener("click", submitDeleteClass);

editClassNameInput?.addEventListener("keydown", async (e) => {
  if (e.key === "Enter"){
    e.preventDefault();
    await submitEditClass();
  }
  if (e.key === "Escape"){
    e.preventDefault();
    closeEditClassModal();
  }
});

editClassModal?.addEventListener("click", (e) => {
  if (e.target === editClassModal){
    closeEditClassModal();
  }
});

deleteClassModal?.addEventListener("click", (e) => {
  if (e.target === deleteClassModal){
    closeDeleteClassModal();
  }
});

/* =========================
   BOOT
   ========================= */

async function boot(){
  setStatus("Chargement…", "warn");
  setClassActionMessage("");

  try {
    currentUser = await getCurrentUser();
    if (!currentUser){
      window.location.href = "index.html";
      return;
    }

    teacherEmail.textContent = `${currentUser.email || "utilisateur inconnu"}`;

    const spaces = await getMyClassSpaces();
    await renderMyClasses(spaces);
    syncCurrentClassUI();

    const autoSpace = pickAutoSelectedClassSpace(spaces);

    if (autoSpace){
      await openClassSpace(autoSpace, {
        message: spaces.length === 1
          ? `Classe "${autoSpace.class_code}" ouverte automatiquement.`
          : `Dernière classe utilisée rouverte : "${autoSpace.class_code}".`
      });
    } else {
      renderNoSelectedClass();
      setStatus("Tableau de bord", "warn");
    }
  } catch (err) {
    setStatus("Erreur", "bad");
    teacherEmail.textContent = err?.message || "Impossible de charger le compte.";
  }
}

/* =========================
   CLASSES
   ========================= */

async function loadClassByCode(code){
  const normalized = normalizeClassCode(code);
  if (!normalized){
    renderNoSelectedClass();
    return;
  }

  try {
    const found = await getMyClassSpaceByCode(normalized);
    if (!found){
      renderNoSelectedClass();
      setStatus("Tableau de bord", "warn");
      syncCurrentClassUI();
      return;
    }

    await openClassSpace(found, {
      message: ""
    });
  } catch (err) {
    setStatus("Erreur", "bad");
    setClassActionMessage(err?.message || "Impossible de charger la classe.", true);
    syncCurrentClassUI();
  }
}

async function openClassSpace(space, { message = "" } = {}){
  if (!space?.id){
    renderNoSelectedClass();
    return;
  }

  const openedSpace = await markClassSpaceAsOpened(space.id);
  currentClassSpace = openedSpace;
  syncCurrentClassUI();

  await renderMyClasses();
  await renderConfigsForCurrentClass();

  setStatus(openedSpace.class_code, "good");
  setClassActionMessage(message);
}

function pickAutoSelectedClassSpace(spaces){
  if (!Array.isArray(spaces) || spaces.length === 0){
    return null;
  }

  if (spaces.length === 1){
    return spaces[0];
  }

  const withLastOpened = spaces
    .filter((space) => space?.last_opened_at)
    .map((space) => ({
      space,
      ts: new Date(space.last_opened_at).getTime()
    }))
    .filter((entry) => !Number.isNaN(entry.ts))
    .sort((a, b) => b.ts - a.ts);

  return withLastOpened[0]?.space ?? null;
}

async function renderMyClasses(spacesOverride = null){
  if (!classesList) return;

  classesList.innerHTML = `<div style="color:var(--muted);">Chargement…</div>`;

  try {
    const spaces = Array.isArray(spacesOverride)
      ? spacesOverride
      : await getMyClassSpaces();

    if (!spaces.length){
      classesList.innerHTML = `<div style="color:var(--muted);">Aucune classe pour le moment.</div>`;
      return;
    }

    classesList.innerHTML = spaces.map((space) => {
      const isCurrent = currentClassSpace?.id === space.id;
      const titleHtml = space.title
        ? `<div class="dashboard-class-card-subtitle">${escapeHtml(space.title)}</div>`
        : "";

      return `
        <div class="dashboard-class-card ${isCurrent ? "is-active" : ""}">
          <button
            class="dashboard-class-card-main"
            type="button"
            data-class-code="${escapeAttr(space.class_code)}"
          >
            <div class="dashboard-class-card-title">${escapeHtml(space.class_code)}</div>
            ${titleHtml}
            <div class="dashboard-class-card-meta">
              ${updatedLabel(space.updated_at)}
            </div>
          </button>

          <div class="dashboard-class-card-actions">
            <button
              class="dashboard-icon-btn"
              type="button"
              data-action="edit-class"
              data-class-id="${escapeAttr(space.id)}"
              title="Modifier le nom"
              aria-label="Modifier le nom"
            >✎</button>

            <button
              class="dashboard-icon-btn is-danger"
              type="button"
              data-action="delete-class"
              data-class-id="${escapeAttr(space.id)}"
              title="Supprimer la classe"
              aria-label="Supprimer la classe"
            >🗑</button>
          </div>
        </div>
      `;
    }).join("");

    classesList.querySelectorAll("[data-class-code]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const code = btn.dataset.classCode ?? "";
        await loadClassByCode(code);
      });
    });

    classesList.querySelectorAll("[data-action='edit-class']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const spaces = await getMyClassSpaces();
        const space = spaces.find((x) => String(x.id) === String(btn.dataset.classId));
        if (!space) return;
        openEditClassModal(space);
      });
    });

    classesList.querySelectorAll("[data-action='delete-class']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const spaces = await getMyClassSpaces();
        const space = spaces.find((x) => String(x.id) === String(btn.dataset.classId));
        if (!space) return;
        openDeleteClassModal(space);
      });
    });
  } catch (err) {
    classesList.innerHTML = `<div style="color:var(--bad);">${escapeHtml(err?.message || "Impossible de charger les classes.")}</div>`;
  }
}

/* =========================
   AJOUT CLASSE
   ========================= */

function openModal(){
  classModal?.classList.remove("hidden");
  modalMessage.textContent = " ";
  modalClassInput.value = "";
  modalClassInput.focus();
}

function closeModal(){
  classModal?.classList.add("hidden");
}

async function createClassFromModal(){
  const code = normalizeClassCode(modalClassInput.value);

  if (!code){
    modalMessage.textContent = "Entre un code valide.";
    modalMessage.style.color = "var(--bad)";
    return;
  }

  modalMessage.textContent = "Création…";
  modalMessage.classList.toggle("is-error", true);

  try {
    const space = await createOrGetMyClassSpace(code);

    closeModal();

    await openClassSpace(space, {
      message: `Classe "${code}" créée.`
    });

  } catch (err){
    modalMessage.textContent = err?.message || "Erreur.";
    modalMessage.style.color = "var(--bad)";
  }
}

function openEditClassModal(space){
  pendingClassSpace = space;
  editClassMessage.textContent = "";
  editClassMessage.classList.remove("is-error");
  editClassNameInput.value = space.title || space.class_code || "";
  editClassModal?.classList.remove("hidden");
  editClassNameInput.focus();
  editClassNameInput.select();
}

function closeEditClassModal(){
  pendingClassSpace = null;
  editClassModal?.classList.add("hidden");
}

async function submitEditClass(){
  if (!pendingClassSpace?.id) return;

  editClassMessage.textContent = "Enregistrement…";
  editClassMessage.classList.remove("is-error");

  try {
    const updated = await updateMyClassSpace(pendingClassSpace.id, {
      title: editClassNameInput.value
    });

    if (currentClassSpace?.id === updated.id){
      currentClassSpace = {
        ...currentClassSpace,
        ...updated
      };
    }

    closeEditClassModal();
    await renderMyClasses();
    await renderConfigsForCurrentClass();
  } catch (err){
    editClassMessage.textContent = err?.message || "Enregistrement impossible.";
    editClassMessage.classList.add("is-error");
  }
}

function openDeleteClassModal(space){
  pendingClassSpace = space;
  deleteClassMessage.textContent = "";
  deleteClassMessage.classList.remove("is-error");
  deleteClassText.textContent = `Supprimer la classe "${space.class_code}" et toutes ses configurations ?`;
  deleteClassModal?.classList.remove("hidden");
}

function closeDeleteClassModal(){
  pendingClassSpace = null;
  deleteClassModal?.classList.add("hidden");
}

async function submitDeleteClass(){
  if (!pendingClassSpace?.id) return;

  deleteClassMessage.textContent = "Suppression…";
  deleteClassMessage.classList.remove("is-error");

  try {
    const deletedId = pendingClassSpace.id;
    await deleteMyClassSpace(deletedId);

    if (currentClassSpace?.id === deletedId){
      renderNoSelectedClass();
    }

    closeDeleteClassModal();
    await renderMyClasses();
    await renderConfigsForCurrentClass();
  } catch (err){
    deleteClassMessage.textContent = err?.message || "Suppression impossible.";
    deleteClassMessage.classList.add("is-error");
  }
}

/* =========================
   CONFIGS
   ========================= */

async function renderConfigsForCurrentClass(){
  if (!currentClassSpace){
    renderNoSelectedClass();
    return;
  }

  if (selectedClassLabel){
    selectedClassLabel.textContent = "";
  }

  if (!configsList) return;
  configsList.innerHTML = `<div style="color:var(--muted);">Chargement…</div>`;

  try {
    const configs = await getMyActivitiesForClass(currentClassSpace.id);

    if (!configs.length){
      configsList.innerHTML = `
        <div class="panel" style="color:var(--muted);">
          Cette classe ne contient encore aucune configuration.
        </div>
      `;
      return;
    }

    configsList.innerHTML = configs.map((cfg) => {
      const updated = formatDate(cfg.updated_at);

      return `
        <div class="dashboard-config-card">
          <div class="dashboard-config-main">
            <div class="dashboard-config-title">${escapeHtml(cfg.config_name)}</div>
            <div class="dashboard-config-meta">
              <span class="dashboard-mini-pill">Module : ${escapeHtml(cfg.module_key || "")}</span>
              <span class="dashboard-config-date">${updated ? `Modifiée : ${updated}` : ""}</span>
            </div>
          </div>

          <div class="dashboard-config-actions">
            <button class="btn" type="button"
              data-action="open"
              data-config-name="${escapeAttr(cfg.config_name)}">
              Ouvrir
            </button>

            <button class="btn" type="button"
              data-action="delete"
              data-config-name="${escapeAttr(cfg.config_name)}">
              Supprimer
            </button>
          </div>
        </div>
      `;
    }).join("");

    configsList.querySelectorAll("[data-action='open']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const configName = btn.dataset.configName ?? "";
        if (!configName) return;

        goToConfigEditor({
          classCode: currentClassSpace.class_code,
          configName
        });
      });
    });

    configsList.querySelectorAll("[data-action='delete']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const configName = btn.dataset.configName ?? "";
        if (!configName) return;

        const ok = window.confirm(`Supprimer la configuration "${configName}" ?`);
        if (!ok) return;

        try {
          await deleteMyActivity(currentClassSpace.id, configName);
          setClassActionMessage(`Configuration "${configName}" supprimée.`);
          await renderConfigsForCurrentClass();
        } catch (err) {
          setClassActionMessage(err?.message || "Suppression impossible.", true);
        }
      });
    });

  } catch (err) {
    configsList.innerHTML = `<div style="color:var(--bad);">${escapeHtml(err?.message || "Impossible de charger les configurations.")}</div>`;
  }
}

function renderNoSelectedClass(){
  currentClassSpace = null;
  syncCurrentClassUI();

  if (selectedClassLabel){
    selectedClassLabel.textContent = "Aucune classe sélectionnée.";
  }

  if (configsList){
    configsList.innerHTML = `<div style="color:var(--muted);">Sélectionne une classe pour voir ses configurations.</div>`;
  }
}

/* =========================
   NAV
   ========================= */

function goToConfigEditor({ classCode, configName = "" }){
  const params = new URLSearchParams();
  params.set("classCode", classCode);
  if (configName){
    params.set("configName", configName);
  }

  window.location.href = `config-editor.html?${params.toString()}`;
}

/* =========================
   UI
   ========================= */

function setStatus(){
  // Ancienne pill de statut supprimée du dashboard.
}

function setClassActionMessage(){
  // Ancienne zone de message supprimée avec le panneau "Choisir une classe".
}

function syncCurrentClassUI(){
  const classCode = currentClassSpace?.class_code || "";

  if (btnNewConfig){
    btnNewConfig.disabled = !classCode;
  }
}

function formatDate(value){
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  return d.toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function updatedLabel(value){
  const formatted = formatDate(value);
  return formatted ? `Mise à jour : ${formatted}` : "";
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