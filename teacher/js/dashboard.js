import {
  getCurrentUser,
  signOutUser,
  normalizeAccessCode,
  getMyTeacherSpace,
  createOrGetMyTeacherSpace,
  markTeacherSpaceAsOpened,
  updateMyTeacherSpace,
  getMyTeacherClasses,
  createTeacherClass,
  updateTeacherClass,
  deleteTeacherClass,
  getMyActivitiesForSpace,
  deleteMyActivity,
  listStudentsForClass,
  replaceStudentsForClass
} from "./users_info.js";

/* =========================
   DOM
   ========================= */

const btnLogout = document.getElementById("btnLogout");
const teacherEmail = document.getElementById("teacherEmail");

const classesList = document.getElementById("classesList");
const configsList = document.getElementById("configsList");
const configHeader = document.querySelector(".dashboard-config-header");

const btnAddClass = document.getElementById("btnAddClass");
const classModal = document.getElementById("classModal");
const modalClassInput = document.getElementById("modalClassInput");
const btnModalCreate = document.getElementById("btnModalCreate");
const btnModalCancel = document.getElementById("btnModalCancel");
const modalMessage = document.getElementById("modalMessage");
const classModalTitle = classModal?.querySelector(".modal-title");

const deleteClassModal = document.getElementById("deleteClassModal");
const deleteClassText = document.getElementById("deleteClassText");
const deleteClassMessage = document.getElementById("deleteClassMessage");
const btnDeleteClassCancel = document.getElementById("btnDeleteClassCancel");
const btnDeleteClassConfirm = document.getElementById("btnDeleteClassConfirm");

/* =========================
   STATE
   ========================= */

let currentUser = null;
let currentTeacherSpace = null;
let currentTeacherClasses = [];
let currentTeacherClass = null;
let pendingTeacherClass = null;

let rightPanelMode = "configs"; // "configs" | "class-editor"
let currentStudents = [];

let classEditorSnapshot = "";
let classEditorDirty = false;

/* =========================
   INIT
   ========================= */

boot();

/* =========================
   EVENTS
   ========================= */

btnLogout?.addEventListener("click", logout);
btnAddClass?.addEventListener("click", openPrimaryModal);
btnModalCancel?.addEventListener("click", closeModal);
btnModalCreate?.addEventListener("click", submitPrimaryModal);

modalClassInput?.addEventListener("keydown", async (e) => {
  if (e.key === "Enter"){
    e.preventDefault();
    await submitPrimaryModal();
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

btnDeleteClassCancel?.addEventListener("click", closeDeleteClassModal);
btnDeleteClassConfirm?.addEventListener("click", submitDeleteClass);

deleteClassModal?.addEventListener("click", (e) => {
  if (e.target === deleteClassModal){
    closeDeleteClassModal();
  }
});

/* =========================
   BOOT
   ========================= */

async function boot(){
  try {
    currentUser = await getCurrentUser();
    if (!currentUser){
      window.location.href = "login.html";
      return;
    }

    teacherEmail.textContent = currentUser.email || "utilisateur inconnu";

    currentTeacherSpace = await getMyTeacherSpace();

    if (currentTeacherSpace){
      currentTeacherSpace = await markTeacherSpaceAsOpened(currentTeacherSpace.id);
      await refreshTeacherClasses();

      if (currentTeacherClasses.length){
        currentTeacherClass = currentTeacherClasses[0];
      }
    }

    syncCurrentClassUI();
    await renderMyClasses();
    await renderRightPanel();
  } catch (err) {
    teacherEmail.textContent = err?.message || "Impossible de charger le compte.";
  }
}

/* =========================
   AUTH
   ========================= */

async function logout(){
  try {
    await signOutUser();
    window.location.href = "login.html";
  } catch {
    alert("Erreur lors de la déconnexion.");
  }
}

/* =========================
   ESPACE / CLASSES
   ========================= */

async function refreshTeacherClasses(){
  if (!currentTeacherSpace?.id){
    currentTeacherClasses = [];
    return;
  }

  currentTeacherClasses = await getMyTeacherClasses(currentTeacherSpace.id);
}

async function selectTeacherClassById(classId){
  const found = currentTeacherClasses.find((item) => String(item.id) === String(classId));
  currentTeacherClass = found || null;
  rightPanelMode = "configs";
  syncCurrentClassUI();
  await renderMyClasses();
  await renderRightPanel();
}

async function renderMyClasses(){
  if (!classesList) return;

  if (!currentTeacherSpace){
    classesList.innerHTML = `<div style="color:var(--muted);">Commence par créer ton code de connexion.</div>`;
    return;
  }

  classesList.innerHTML = `<div style="color:var(--muted);">Chargement…</div>`;

  try {
    await refreshTeacherClasses();

    if (!currentTeacherClasses.length){
      classesList.innerHTML = `<div style="color:var(--muted);">Aucune classe pour le moment.</div>`;
      return;
    }

    classesList.innerHTML = currentTeacherClasses.map((teacherClass) => {
      const isCurrent = currentTeacherClass?.id === teacherClass.id;

      return `
        <div class="dashboard-class-card ${isCurrent ? "is-active" : ""}">
          <button
            class="dashboard-class-card-main"
            type="button"
            data-class-id="${escapeAttr(teacherClass.id)}"
          >
            <div class="dashboard-class-card-title">${escapeHtml(teacherClass.name)}</div>
            <div class="dashboard-class-card-meta">
              ${updatedLabel(teacherClass.updated_at)}
            </div>
          </button>

          <div class="dashboard-class-card-actions">
            <button
              class="dashboard-icon-btn"
              type="button"
              data-action="edit-class"
              data-class-id="${escapeAttr(teacherClass.id)}"
              title="Éditer la classe"
              aria-label="Éditer la classe"
            >✎</button>

            <button
              class="dashboard-icon-btn is-danger"
              type="button"
              data-action="delete-class"
              data-class-id="${escapeAttr(teacherClass.id)}"
              title="Supprimer la classe"
              aria-label="Supprimer la classe"
            >🗑</button>
          </div>
        </div>
      `;
    }).join("");

    classesList.querySelectorAll("[data-class-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await selectTeacherClassById(btn.dataset.classId);
      });
    });

    classesList.querySelectorAll("[data-action='edit-class']").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const teacherClass = currentTeacherClasses.find((item) => String(item.id) === String(btn.dataset.classId));
        if (!teacherClass) return;
        await openClassEditor(teacherClass);
      });
    });

    classesList.querySelectorAll("[data-action='delete-class']").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const teacherClass = currentTeacherClasses.find((item) => String(item.id) === String(btn.dataset.classId));
        if (!teacherClass) return;
        openDeleteClassModal(teacherClass);
      });
    });
  } catch (err) {
    classesList.innerHTML = `<div style="color:var(--bad);">${escapeHtml(err?.message || "Impossible de charger les classes.")}</div>`;
  }
}

/* =========================
   MODALE PRINCIPALE
   ========================= */

function openPrimaryModal(){
  if (!currentTeacherSpace){
    classModalTitle.textContent = "Créer un code de connexion";
    modalClassInput.placeholder = "Code de connexion (ex. GKOSIM)";
    modalClassInput.value = "";
    modalMessage.textContent = "";
    classModal?.classList.remove("hidden");
    modalClassInput.focus();
    return;
  }

  classModalTitle.textContent = "Créer une classe";
  modalClassInput.placeholder = "Nom de la classe";
  modalClassInput.value = "";
  modalMessage.textContent = "";
  classModal?.classList.remove("hidden");
  modalClassInput.focus();
}

function closeModal(){
  classModal?.classList.add("hidden");
}

async function submitPrimaryModal(){
  const rawValue = modalClassInput.value;

  try {
    if (!currentTeacherSpace){
      const accessCode = normalizeAccessCode(rawValue);

      if (!accessCode){
        modalMessage.textContent = "Entre un code valide.";
        modalMessage.style.color = "var(--bad)";
        return;
      }

      currentTeacherSpace = await createOrGetMyTeacherSpace(accessCode);
      currentTeacherSpace = await markTeacherSpaceAsOpened(currentTeacherSpace.id);
      await refreshTeacherClasses();
      closeModal();
      syncCurrentClassUI();
      await renderMyClasses();
      await renderRightPanel();
      return;
    }

    const teacherClass = await createTeacherClass(currentTeacherSpace.id, rawValue);
    currentTeacherClass = teacherClass;
    closeModal();
    await renderMyClasses();
    await renderRightPanel();
  } catch (err){
    modalMessage.textContent = err?.message || "Erreur.";
    modalMessage.style.color = "var(--bad)";
  }
}

/* =========================
   SUPPRESSION CLASSE
   ========================= */

function openDeleteClassModal(teacherClass){
  pendingTeacherClass = teacherClass;
  deleteClassMessage.textContent = "";
  deleteClassMessage.classList.remove("is-error");
  deleteClassText.textContent = `Supprimer la classe "${teacherClass.name}" ?`;
  deleteClassModal?.classList.remove("hidden");
}

function closeDeleteClassModal(){
  pendingTeacherClass = null;
  deleteClassModal?.classList.add("hidden");
}

async function submitDeleteClass(){
  if (!pendingTeacherClass?.id) return;

  deleteClassMessage.textContent = "Suppression…";
  deleteClassMessage.classList.remove("is-error");

  try {
    const deletedId = pendingTeacherClass.id;
    await deleteTeacherClass(deletedId);

    if (currentTeacherClass?.id === deletedId){
      currentTeacherClass = null;
      currentStudents = [];
      rightPanelMode = "configs";
    }

    closeDeleteClassModal();
    await refreshTeacherClasses();

    if (!currentTeacherClass && currentTeacherClasses.length){
      currentTeacherClass = currentTeacherClasses[0];
    }

    await renderMyClasses();
    await renderRightPanel();
  } catch (err){
    deleteClassMessage.textContent = err?.message || "Suppression impossible.";
    deleteClassMessage.classList.add("is-error");
  }
}

/* =========================
   PANNEAU DROIT
   ========================= */

function renderConfigHeader(){
  if (!configHeader) return;

  if (rightPanelMode === "class-editor"){
    const className = currentTeacherClass?.name || "";

    configHeader.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
        <div class="dashboard-section-title">Éditer la classe</div>

        <div class="dashboard-class-title-box">
          <input
            id="classTitleInput"
            class="modal-text-input dashboard-class-title-input"
            type="text"
            value="${escapeAttr(className)}"
            placeholder="Nom de la classe"
            readonly
          >

          <button
            class="dashboard-icon-btn"
            id="btnToggleClassTitleEdit"
            type="button"
            title="Modifier le nom"
            aria-label="Modifier le nom"
          >✎</button>
        </div>
      </div>

      <div style="display:flex; gap:10px; align-items:center;">
        <button class="dashboard-icon-btn" id="btnBackToConfigs" title="Retour">↩</button>
        <button class="btn primary is-saved" id="btnSaveClassHeader" type="button">Enregistré</button>
      </div>
    `;
    return;
  }

  configHeader.innerHTML = `
    <div class="dashboard-section-title">Activités</div>

    <button class="btn primary" id="btnNewConfig" type="button">
      Créer une activité
    </button>
  `;

  document.getElementById("btnNewConfig")?.addEventListener("click", () => {
    if (!currentTeacherSpace?.access_code) return;

    goToConfigEditor({
      accessCode: currentTeacherSpace.access_code
    });
  });
}

function buildClassEditorSnapshot(){
  return JSON.stringify({
    students: (currentStudents || []).map((s) => ({
      first_name: String(s.first_name || "").trim(),
      grade_level: String(s.grade_level || "").trim()
    }))
  });
}

function markClassEditorDirtyState(){
  const currentSnapshot = JSON.stringify({
    students: (currentStudents || []).map((s) => ({
      first_name: String(s.first_name || "").trim(),
      grade_level: String(s.grade_level || "").trim()
    }))
  });

  classEditorDirty = currentSnapshot !== classEditorSnapshot;

  const btn = document.getElementById("btnSaveClassHeader");
  if (!btn) return;

  btn.textContent = classEditorDirty ? "Enregistrer" : "Enregistré";
  btn.classList.toggle("is-saved", !classEditorDirty);
  btn.classList.toggle("is-dirty", classEditorDirty);
}

async function renderRightPanel(){
  renderConfigHeader();

  if (rightPanelMode === "class-editor"){
    bindClassHeaderEvents();
    renderClassEditor();
    return;
  }

  await renderActivitiesForSpace();
}

async function openClassEditor(teacherClass){
  if (!teacherClass?.id) return;

  currentTeacherClass = teacherClass;
  rightPanelMode = "class-editor";
  syncCurrentClassUI();

  currentStudents = await listStudentsForClass(teacherClass.id);
  classEditorSnapshot = buildClassEditorSnapshot();
  classEditorDirty = false;

  await renderMyClasses();
  await renderRightPanel();
}

function renderClassEditor(){
  if (!configsList) return;

  configsList.innerHTML = `
    <div class="dashboard-class-editor">
      <div class="dashboard-editor-table">
        <div class="editor-toolbar">
          <button class="btn" id="btnAddStudent" type="button">Ajouter un élève</button>
        </div>

        <table class="editor-table">
          <thead>
            <tr>
              <th>Prénom</th>
              <th>Classe</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${currentStudents.map((student, index) => `
              <tr>
                <td>${escapeHtml(student.first_name || "")}</td>
                <td>${escapeHtml(student.grade_level || "")}</td>
                <td>
                  <button
                    class="dashboard-icon-btn"
                    data-action="menu-student"
                    data-index="${index}"
                    type="button"
                  >⋯</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  bindClassEditorEvents();
}

function bindClassEditorEvents(){
  document.getElementById("btnAddStudent")?.addEventListener("click", () => {
    openAddStudentOverlay();
  });

  document.querySelectorAll("[data-action='menu-student']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.index);
      openStudentMenu(index);
    });
  });

  markClassEditorDirtyState();
}

function bindClassHeaderEvents(){
  document.getElementById("btnBackToConfigs")?.addEventListener("click", async () => {
    rightPanelMode = "configs";
    await renderRightPanel();
  });

  const classTitleInput = document.getElementById("classTitleInput");
  const btnToggleClassTitleEdit = document.getElementById("btnToggleClassTitleEdit");

  btnToggleClassTitleEdit?.addEventListener("click", async () => {
    if (!currentTeacherClass?.id || !classTitleInput) return;

    const isReadonly = classTitleInput.hasAttribute("readonly");

    if (isReadonly){
      classTitleInput.removeAttribute("readonly");
      classTitleInput.focus();
      classTitleInput.select();
      btnToggleClassTitleEdit.textContent = "✓";
      btnToggleClassTitleEdit.title = "Enregistrer le nom";
      return;
    }

    try {
      const updated = await updateTeacherClass(currentTeacherClass.id, {
        name: classTitleInput.value
      });

      currentTeacherClass = {
        ...currentTeacherClass,
        ...updated
      };

      classTitleInput.value = updated.name || "";
      classTitleInput.setAttribute("readonly", "");
      btnToggleClassTitleEdit.textContent = "✎";
      btnToggleClassTitleEdit.title = "Modifier le nom";

      await refreshTeacherClasses();
      await renderMyClasses();
    } catch (err){
      alert("Erreur lors de l’enregistrement du nom.");
    }
  });

  classTitleInput?.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && !classTitleInput.hasAttribute("readonly")){
      e.preventDefault();
      btnToggleClassTitleEdit?.click();
    }
  });

  document.getElementById("btnSaveClassHeader")?.addEventListener("click", async () => {
    if (!currentTeacherClass?.id) return;
    if (!classEditorDirty) return;

    const cleanedStudents = currentStudents
      .map((student) => ({
        first_name: String(student.first_name || "").trim(),
        grade_level: String(student.grade_level || "").trim()
      }))
      .filter((student) => student.first_name);

    try {
      await replaceStudentsForClass(currentTeacherClass.id, cleanedStudents);

      currentStudents = cleanedStudents;
      classEditorSnapshot = buildClassEditorSnapshot();
      classEditorDirty = false;

      await renderMyClasses();
      await renderRightPanel();
    } catch (err){
      alert("Erreur lors de la sauvegarde.");
    }
  });

  markClassEditorDirtyState();
}

/* =========================
   ÉLÈVES
   ========================= */

function openAddStudentOverlay(){
  const overlay = document.createElement("div");
  overlay.className = "modal";

  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-title">Ajouter un élève</div>

      <input id="newStudentName" class="modal-text-input" placeholder="Prénom">

      <select id="newStudentLevel" class="student-select">
        <option value="">Classe</option>
        <option>CP</option>
        <option>CE1</option>
        <option>CE2</option>
        <option>CM1</option>
        <option>CM2</option>
      </select>

      <div class="modal-actions">
        <button class="btn" id="cancelAddStudent" type="button">Annuler</button>
        <button class="btn primary" id="confirmAddStudent" type="button">Ajouter</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const nameInput = document.getElementById("newStudentName");
  nameInput?.focus();

  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Enter"){
      e.preventDefault();
      document.getElementById("confirmAddStudent")?.click();
    }
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay){
      overlay.remove();
    }
  });

  document.getElementById("cancelAddStudent").onclick = () => overlay.remove();

  document.getElementById("confirmAddStudent").onclick = () => {
    const name = document.getElementById("newStudentName").value.trim();
    const level = document.getElementById("newStudentLevel").value;

    if (!name) return;

    currentStudents.push({
      first_name: name,
      grade_level: level
    });

    overlay.remove();
    renderClassEditor();
    markClassEditorDirtyState();
  };
}

function openStudentMenu(index){
  const student = currentStudents[index];
  if (!student) return;

  const overlay = document.createElement("div");
  overlay.className = "modal";

  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-title">Élève</div>

      <input id="editStudentName" class="modal-text-input" value="${escapeAttr(student.first_name)}">

      <select id="editStudentLevel" class="student-select">
        <option value="" ${!student.grade_level ? "selected" : ""}>Classe</option>
        <option ${student.grade_level === "CP" ? "selected" : ""}>CP</option>
        <option ${student.grade_level === "CE1" ? "selected" : ""}>CE1</option>
        <option ${student.grade_level === "CE2" ? "selected" : ""}>CE2</option>
        <option ${student.grade_level === "CM1" ? "selected" : ""}>CM1</option>
        <option ${student.grade_level === "CM2" ? "selected" : ""}>CM2</option>
      </select>

      <div class="modal-actions">
        <button class="btn" id="deleteStudent" type="button">Supprimer</button>
        <button class="btn primary" id="saveStudent" type="button">Enregistrer</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const editInput = document.getElementById("editStudentName");
  editInput?.focus();
  editInput?.select();

  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Enter"){
      e.preventDefault();
      document.getElementById("saveStudent")?.click();
    }
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay){
      overlay.remove();
    }
  });

  document.getElementById("deleteStudent").onclick = () => {
    currentStudents.splice(index, 1);
    overlay.remove();
    renderClassEditor();
    markClassEditorDirtyState();
  };

  document.getElementById("saveStudent").onclick = () => {
    student.first_name = document.getElementById("editStudentName").value.trim();
    student.grade_level = document.getElementById("editStudentLevel").value;

    overlay.remove();
    renderClassEditor();
    markClassEditorDirtyState();
  };
}

/* =========================
   ACTIVITÉS
   ========================= */

async function renderActivitiesForSpace(){
  if (!configsList) return;

  if (!currentTeacherSpace?.id){
    configsList.innerHTML = `<div style="color:var(--muted);">Crée d’abord ton code de connexion.</div>`;
    return;
  }

  configsList.innerHTML = `<div style="color:var(--muted);">Chargement…</div>`;

  try {
    const configs = await getMyActivitiesForSpace(currentTeacherSpace.id);

    if (!configs.length){
      configsList.innerHTML = `
        <div class="panel" style="color:var(--muted);">
          Aucune activité pour le moment.
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
            <button class="btn" type="button" data-action="open" data-config-name="${escapeAttr(cfg.config_name)}">
              Ouvrir
            </button>

            <button class="btn" type="button" data-action="delete" data-config-name="${escapeAttr(cfg.config_name)}">
              Supprimer
            </button>
          </div>
        </div>
      `;
    }).join("");

    configsList.querySelectorAll("[data-action='open']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const configName = btn.dataset.configName ?? "";
        if (!configName || !currentTeacherSpace?.access_code) return;

        goToConfigEditor({
          accessCode: currentTeacherSpace.access_code,
          configName
        });
      });
    });

    configsList.querySelectorAll("[data-action='delete']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const configName = btn.dataset.configName ?? "";
        if (!configName) return;

        const ok = window.confirm(`Supprimer l’activité "${configName}" ?`);
        if (!ok) return;

        try {
          await deleteMyActivity(currentTeacherSpace.id, configName);
          await renderActivitiesForSpace();
        } catch (err) {
          alert(err?.message || "Suppression impossible.");
        }
      });
    });
  } catch (err) {
    configsList.innerHTML = `<div style="color:var(--bad);">${escapeHtml(err?.message || "Impossible de charger les activités.")}</div>`;
  }
}

/* =========================
   NAV
   ========================= */

function goToConfigEditor({ accessCode, configName = "" }){
  const params = new URLSearchParams();
  params.set("classCode", accessCode);
  if (configName){
    params.set("configName", configName);
  }

  window.location.href = `config-editor.html?${params.toString()}`;
}

/* =========================
   UI
   ========================= */

function setStatus(){}
function setClassActionMessage(){}

function syncCurrentClassUI(){
  // plus de dépendance forte à une classe sélectionnée
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