import {
  getCurrentUser,
  signOutUser,
  normalizeAccessCode,
  getMyTeacherSpace,
  createOrGetMyTeacherSpace,
  updateMyTeacherSpace,
  markTeacherSpaceAsOpened,
  getMyActivitiesForSpace,
  deleteMyActivity,
  updateActivityDashboardMeta,
  saveActivityOrderForTeacherSpace,
  setHighlightedActivityForTeacherSpace,
  listStudentsForTeacherSpace,
  createStudentForTeacherSpace,
  updateStudent,
  deleteStudent,
  saveStudentOrderForTeacherSpace
} from "./users_info.js";
import { getModuleLabel } from "../../shared/module-registry.js";

/* =========================
   DOM
   ========================= */

const btnLogout = document.getElementById("btnLogout");
const teacherEmail = document.getElementById("teacherEmail");
const accessCodeBox = document.getElementById("accessCodeBox");
const accessCodeValue = document.getElementById("accessCodeValue");
const btnEditAccessCode = document.getElementById("btnEditAccessCode");

const studentsList = document.getElementById("studentsList");
const configsList = document.getElementById("configsList");
const configHeader = document.querySelector(".dashboard-config-header");

const btnAddStudent = document.getElementById("btnAddStudent");
const accessCodeModal = document.getElementById("accessCodeModal");
const accessCodeInput = document.getElementById("accessCodeInput");
const btnModalCreate = document.getElementById("btnModalCreate");
const btnModalCancel = document.getElementById("btnModalCancel");
const modalMessage = document.getElementById("modalMessage");
const accessCodeModalTitle = accessCodeModal?.querySelector(".modal-title");

const deleteStudentModal = document.getElementById("deleteStudentModal");
const deleteStudentModalTitle = deleteStudentModal?.querySelector(".modal-title");
const deleteStudentText = document.getElementById("deleteStudentText");
const deleteStudentMessage = document.getElementById("deleteStudentMessage");
const btnDeleteStudentCancel = document.getElementById("btnDeleteStudentCancel");
const btnDeleteStudentConfirm = document.getElementById("btnDeleteStudentConfirm");

const deleteActivityModal = document.getElementById("deleteActivityModal");
const deleteActivityModalTitle = deleteActivityModal?.querySelector(".modal-title");
const deleteActivityText = document.getElementById("deleteActivityText");
const deleteActivityMessage = document.getElementById("deleteActivityMessage");
const btnDeleteActivityCancel = document.getElementById("btnDeleteActivityCancel");
const btnDeleteActivityConfirm = document.getElementById("btnDeleteActivityConfirm");

/* =========================
   STATE
   ========================= */

let currentUser = null;
let currentTeacherSpace = null;
let currentStudents = [];
let currentStudent = null;
let pendingStudent = null;
let rightPanelMode = "activities"; // "activities" | "student-profile"

const studentNotesDrafts = new Map();

let draggedStudentId = null;
let dragHandleStudentId = null;
let isSavingStudentOrder = false;
let studentDropIndex = null;
let draggedActivityId = null;
let dragHandleActivityId = null;
let isSavingActivityOrder = false;
let activityDropIndex = null;
let primaryModalMode = "create-space"; // "create-space" | "edit-access-code"
let cachedActivities = null;
let pendingActivity = null;

function clearArmedStudentDragHandle(){
  dragHandleStudentId = null;
}

function clearArmedActivityDragHandle(){
  dragHandleActivityId = null;
}

/* =========================
   INIT
   ========================= */

boot();

/* =========================
   EVENTS
   ========================= */

btnLogout?.addEventListener("click", logout);
btnEditAccessCode?.addEventListener("click", openEditAccessCodeModal);
btnAddStudent?.addEventListener("click", openPrimaryModal);
btnModalCancel?.addEventListener("click", closeAccessCodeModal);
btnModalCreate?.addEventListener("click", submitPrimaryModal);

accessCodeInput?.addEventListener("keydown", async (e) => {
  if (e.key === "Enter"){
    e.preventDefault();
    await submitPrimaryModal();
    return;
  }

  if (e.key === "Escape"){
    e.preventDefault();
    closeAccessCodeModal();
  }
});

accessCodeInput?.addEventListener("input", () => {
  const start = accessCodeInput.selectionStart ?? accessCodeInput.value.length;
  const end = accessCodeInput.selectionEnd ?? accessCodeInput.value.length;
  accessCodeInput.value = String(accessCodeInput.value || "").toUpperCase();
  try {
    accessCodeInput.setSelectionRange(start, end);
  } catch {}
});

accessCodeModal?.addEventListener("click", (e) => {
  if (e.target === accessCodeModal){
    closeAccessCodeModal();
  }
});

btnDeleteStudentCancel?.addEventListener("click", closeDeleteStudentModal);
btnDeleteStudentConfirm?.addEventListener("click", submitDeleteStudent);

deleteStudentModal?.addEventListener("click", (e) => {
  if (e.target === deleteStudentModal){
    closeDeleteStudentModal();
  }
});

btnDeleteActivityCancel?.addEventListener("click", closeDeleteActivityModal);
btnDeleteActivityConfirm?.addEventListener("click", submitDeleteActivity);

deleteActivityModal?.addEventListener("click", (e) => {
  if (e.target === deleteActivityModal){
    closeDeleteActivityModal();
  }
});

document.addEventListener("pointerup", clearArmedStudentDragHandle);
document.addEventListener("mouseup", clearArmedStudentDragHandle);
document.addEventListener("touchend", clearArmedStudentDragHandle, { passive: true });
document.addEventListener("pointerup", clearArmedActivityDragHandle);
document.addEventListener("mouseup", clearArmedActivityDragHandle);
document.addEventListener("touchend", clearArmedActivityDragHandle, { passive: true });

studentsList?.addEventListener("dragover", handleStudentDragOver);
studentsList?.addEventListener("drop", handleStudentDrop);
configsList?.addEventListener("dragover", handleActivityDragOver);
configsList?.addEventListener("drop", handleActivityDrop);

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
      await refreshStudents();
    }

    renderAccessCodeBox();
    await renderStudentsColumn({ skipRefresh: true });
    await renderRightPanel({ forceRefresh: true });
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
   ESPACE
   ========================= */

async function refreshStudents(){
  if (!currentTeacherSpace?.id){
    currentStudents = [];
    currentStudent = null;
    rightPanelMode = "activities";
    cachedActivities = null;
    return;
  }

  currentStudents = await listStudentsForTeacherSpace(currentTeacherSpace.id);

  if (currentStudent?.id){
    currentStudent = currentStudents.find((student) => String(student.id) === String(currentStudent.id)) || null;
  }

  if (rightPanelMode === "student-profile" && !currentStudent){
    rightPanelMode = "activities";
  }
}

async function selectStudentById(studentId){
  currentStudent = currentStudents.find((student) => String(student.id) === String(studentId)) || null;
  rightPanelMode = currentStudent ? "student-profile" : "activities";
  await renderStudentsColumn({ skipRefresh: true });
  await renderRightPanel();
}

/* =========================
   COLONNE MA CLASSE
   ========================= */

async function renderStudentsColumn({ skipRefresh = false } = {}){
  if (!studentsList) return;

  if (!currentTeacherSpace){
    studentsList.innerHTML = `<div style="color:var(--muted);">Commence par créer ton code de connexion.</div>`;
    return;
  }

  const hasExistingCards = Boolean(studentsList.querySelector(".dashboard-class-card"));

  if (!skipRefresh && !hasExistingCards){
    studentsList.innerHTML = `<div style="color:var(--muted);">Chargement…</div>`;
  }

  try {
    if (!skipRefresh){
      await refreshStudents();
    }

    if (!currentStudents.length){
      studentsList.innerHTML = `<div style="color:var(--muted);">Aucun élève pour le moment.</div>`;
      return;
    }

    studentsList.innerHTML = currentStudents.map((student) => {
      const studentId = String(student.id);
      const isCurrent = currentStudent?.id === student.id;
      const subtitle = buildStudentSubtitle(student);

      return `
        <div
          class="dashboard-class-card ${isCurrent ? "is-active" : ""}"
          data-student-card-id="${escapeAttr(studentId)}"
          draggable="true"
        >
          <button
            class="dashboard-grip-btn"
            type="button"
            data-action="drag-student"
            data-student-id="${escapeAttr(studentId)}"
            title="Déplacer l’élève"
            aria-label="Déplacer l’élève"
            draggable="false"
          >⋮⋮</button>

          <button
            class="dashboard-class-card-main"
            type="button"
            data-student-id="${escapeAttr(studentId)}"
            draggable="false"
          >
            <div class="dashboard-class-card-heading">
              <span class="dashboard-class-card-title">${escapeHtml(student.first_name || "")}</span>
              ${subtitle ? `<span class="dashboard-class-card-subtitle"> / ${escapeHtml(subtitle)}</span>` : ""}
            </div>
          </button>

          <div class="dashboard-class-card-actions">
            <button
              class="dashboard-icon-btn"
              type="button"
              data-action="edit-student"
              data-student-id="${escapeAttr(studentId)}"
              title="Éditer l’élève"
              aria-label="Éditer l’élève"
              draggable="false"
            >✎</button>

            <button
              class="dashboard-icon-btn dashboard-material-icon-btn is-danger"
              type="button"
              data-action="delete-student"
              data-student-id="${escapeAttr(studentId)}"
              title="Supprimer l’élève"
              aria-label="Supprimer l’élève"
              draggable="false"
            ><span class="dashboard-material-icon" aria-hidden="true">delete</span></button>
          </div>
        </div>
      `;
    }).join("");

    studentsList.querySelectorAll(".dashboard-class-card-main[data-student-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await selectStudentById(btn.dataset.studentId);
      });
    });

    studentsList.querySelectorAll("[data-action='edit-student']").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await openEditStudentOverlay(btn.dataset.studentId);
      });
    });

    studentsList.querySelectorAll("[data-action='delete-student']").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const student = currentStudents.find((item) => String(item.id) === String(btn.dataset.studentId));
        if (!student) return;
        openDeleteStudentModal(student);
      });
    });

    studentsList.querySelectorAll(".dashboard-class-card[data-student-card-id]").forEach((card) => {
      card.addEventListener("dragstart", handleStudentDragStart);
      card.addEventListener("dragend", handleStudentDragEnd);
    });
  } catch (err) {
    studentsList.innerHTML = `<div style="color:var(--bad);">${escapeHtml(err?.message || "Impossible de charger les élèves.")}</div>`;
  }
}

function clearStudentDropMarkers(){
  studentDropIndex = null;
  studentsList?.querySelectorAll(".dashboard-class-card.is-dragging").forEach((card) => {
    card.classList.remove("is-dragging");
  });
  studentsList?.querySelector(".dashboard-drop-indicator")?.remove();
}

function getVisibleStudentCards(){
  return Array.from(studentsList?.querySelectorAll(".dashboard-class-card[data-student-card-id]") || [])
    .filter((card) => String(card.dataset.studentCardId || "") !== String(draggedStudentId || ""));
}

function getStudentDropIndexFromClientY(clientY){
  const cards = getVisibleStudentCards();
  if (!cards.length) return 0;

  for (let index = 0; index < cards.length; index += 1){
    const rect = cards[index].getBoundingClientRect();
    const midpoint = rect.top + (rect.height / 2);
    if (clientY < midpoint){
      return index;
    }
  }

  return cards.length;
}

function renderStudentDropIndicator(dropIndex){
  if (!studentsList) return;

  const cards = getVisibleStudentCards();
  const indicator = ensureDropIndicator(studentsList);

  let top = 0;
  if (cards.length === 0){
    top = 0;
  } else if (dropIndex <= 0){
    top = cards[0].offsetTop;
  } else if (dropIndex >= cards.length){
    const lastCard = cards[cards.length - 1];
    top = lastCard.offsetTop + lastCard.offsetHeight;
  } else {
    top = cards[dropIndex].offsetTop;
  }

  indicator.style.top = `${Math.round(top)}px`;
  indicator.hidden = false;
}

function ensureDropIndicator(container){
  let indicator = container.querySelector(":scope > .dashboard-drop-indicator");
  if (!indicator){
    indicator = document.createElement("div");
    indicator.className = "dashboard-drop-indicator";
    indicator.hidden = true;
    container.appendChild(indicator);
  }
  return indicator;
}

function handleStudentDragStart(event){
  const card = event.currentTarget;
  const studentId = String(card?.dataset?.studentCardId || "");

  if (!studentId || isSavingStudentOrder){
    event.preventDefault();
    dragHandleStudentId = null;
    return;
  }

  draggedStudentId = studentId;
  card.classList.add("is-dragging");

  if (event.dataTransfer){
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", studentId);
  }
}

function handleStudentDragOver(event){
  if (!draggedStudentId || isSavingStudentOrder || !studentsList) return;

  event.preventDefault();
  const dropIndex = getStudentDropIndexFromClientY(event.clientY);
  studentDropIndex = dropIndex;
  renderStudentDropIndicator(dropIndex);

  const draggedCard = studentsList.querySelector(`.dashboard-class-card[data-student-card-id="${CSS.escape(draggedStudentId)}"]`);
  draggedCard?.classList.add("is-dragging");
}

function handleStudentDragLeave(event){
  if (!studentsList) return;
  const relatedTarget = event.relatedTarget;
  if (relatedTarget instanceof Node && studentsList.contains(relatedTarget)) return;
  clearStudentDropMarkers();
}

async function handleStudentDrop(event){
  if (!draggedStudentId || isSavingStudentOrder) return;

  event.preventDefault();
  const dropIndex = Number.isInteger(studentDropIndex) ? studentDropIndex : getStudentDropIndexFromClientY(event.clientY);
  await moveStudentCard(draggedStudentId, dropIndex);
}

function handleStudentDragEnd(){
  draggedStudentId = null;
  dragHandleStudentId = null;
  clearStudentDropMarkers();
}

async function moveStudentCard(sourceStudentId, dropIndex){
  const sourceId = String(sourceStudentId || "");
  if (!sourceId || !currentTeacherSpace?.id) return;

  const previousStudents = [...currentStudents];
  const remainingIds = previousStudents
    .map((student) => String(student.id))
    .filter((studentId) => studentId !== sourceId);

  const safeDropIndex = Math.max(0, Math.min(Number(dropIndex) || 0, remainingIds.length));
  remainingIds.splice(safeDropIndex, 0, sourceId);

  const orderedStudents = remainingIds
    .map((studentId) => previousStudents.find((student) => String(student.id) === studentId))
    .filter(Boolean)
    .map((student, index) => ({ ...student, display_order: index }));

  currentStudents = orderedStudents;
  isSavingStudentOrder = true;
  await renderStudentsColumn({ skipRefresh: true });

  try {
    await saveStudentOrderForTeacherSpace(currentTeacherSpace.id, remainingIds);
  } catch (err) {
    currentStudents = previousStudents;
    alert(err?.message || "Impossible d’enregistrer l’ordre des élèves.");
  } finally {
    isSavingStudentOrder = false;
    draggedStudentId = null;
    dragHandleStudentId = null;
    clearStudentDropMarkers();
    await renderStudentsColumn({ skipRefresh: true });
  }
}

function buildStudentSubtitle(student){
  return String(student?.grade_level || "").trim();
}

/* =========================
   MODALE PRINCIPALE
   ========================= */

function openPrimaryModal(){
  if (!currentTeacherSpace){
    primaryModalMode = "create-space";
    accessCodeModalTitle.textContent = "Créer un code de connexion";
    btnModalCreate.textContent = "Créer";
    accessCodeInput.placeholder = "Code de connexion (ex. GKOSIM)";
    accessCodeInput.value = "";
    modalMessage.textContent = "";
    accessCodeModal?.classList.remove("hidden");
    accessCodeInput.focus();
    return;
  }

  openAddStudentOverlay();
}

function openEditAccessCodeModal(){
  if (!currentTeacherSpace){
    openPrimaryModal();
    return;
  }

  primaryModalMode = "edit-access-code";
  accessCodeModalTitle.textContent = "Modifier le code de connexion";
  btnModalCreate.textContent = "Enregistrer";
  accessCodeInput.placeholder = "Code de connexion (ex. GKOSIM)";
  accessCodeInput.value = currentTeacherSpace.access_code || "";
  modalMessage.textContent = "";
  accessCodeModal?.classList.remove("hidden");
  accessCodeInput.focus();
  accessCodeInput.select();
}

function closeAccessCodeModal(){
  accessCodeModal?.classList.add("hidden");
}

function renderAccessCodeBox(){
  if (!accessCodeBox || !accessCodeValue) return;

  const code = String(currentTeacherSpace?.access_code || "").trim();
  if (!code){
    accessCodeBox.classList.add("hidden");
    accessCodeValue.textContent = "—";
    return;
  }

  accessCodeValue.textContent = code;
  accessCodeBox.classList.remove("hidden");
}

async function submitPrimaryModal(){
  const rawValue = accessCodeInput.value;

  try {
    const accessCode = normalizeAccessCode(rawValue);

    if (!accessCode){
      modalMessage.textContent = "Entre un code valide.";
      modalMessage.style.color = "var(--bad)";
      return;
    }

    if (primaryModalMode === "edit-access-code"){
      currentTeacherSpace = await updateMyTeacherSpace(currentTeacherSpace.id, {
        access_code: accessCode
      });
    } else {
      currentTeacherSpace = await createOrGetMyTeacherSpace(accessCode);
      currentTeacherSpace = await markTeacherSpaceAsOpened(currentTeacherSpace.id);
      await refreshStudents();
    }

    renderAccessCodeBox();
    closeAccessCodeModal();
    await renderStudentsColumn({ skipRefresh: true });
    await renderRightPanel();
  } catch (err){
    modalMessage.textContent = err?.message || "Erreur.";
    modalMessage.style.color = "var(--bad)";
  }
}

/* =========================
   SUPPRESSION ÉLÈVE
   ========================= */

function openDeleteStudentModal(student){
  pendingStudent = student;
  deleteStudentModalTitle.textContent = "Supprimer l’élève";
  deleteStudentMessage.textContent = "";
  deleteStudentMessage.classList.remove("is-error");
  deleteStudentText.textContent = `Supprimer l’élève "${student.first_name}" ?`;
  deleteStudentModal?.classList.remove("hidden");
}

function closeDeleteStudentModal(){
  pendingStudent = null;
  deleteStudentModal?.classList.add("hidden");
}

async function submitDeleteStudent(){
  if (!pendingStudent?.id) return;

  deleteStudentMessage.textContent = "Suppression…";
  deleteStudentMessage.classList.remove("is-error");

  try {
    const deletedId = pendingStudent.id;
    await deleteStudent(deletedId);

    studentNotesDrafts.delete(String(deletedId));

    if (currentStudent?.id === deletedId){
      currentStudent = null;
      rightPanelMode = "activities";
    }

    currentStudents = currentStudents.filter((student) => String(student.id) !== String(deletedId));

    closeDeleteStudentModal();
    await renderStudentsColumn({ skipRefresh: true });
    await renderRightPanel();
  } catch (err){
    deleteStudentMessage.textContent = err?.message || "Suppression impossible.";
    deleteStudentMessage.classList.add("is-error");
  }
}

/* =========================
   SUPPRESSION ACTIVITÉ
   ========================= */

function openDeleteActivityModal(activity){
  pendingActivity = activity;
  deleteActivityModalTitle.textContent = "Supprimer l’activité";
  deleteActivityMessage.textContent = "";
  deleteActivityMessage.classList.remove("is-error");
  deleteActivityText.textContent = `Supprimer l’activité "${activity.config_name}" ?`;
  deleteActivityModal?.classList.remove("hidden");
}

function closeDeleteActivityModal(){
  pendingActivity = null;
  deleteActivityModal?.classList.add("hidden");
}

async function submitDeleteActivity(){
  if (!pendingActivity?.id || !currentTeacherSpace?.id) return;

  deleteActivityMessage.textContent = "Suppression…";
  deleteActivityMessage.classList.remove("is-error");

  try {
    const deletedId = String(pendingActivity.id);
    const deletedName = pendingActivity.config_name || "";

    await deleteMyActivity(currentTeacherSpace.id, deletedName);

    cachedActivities = (cachedActivities || []).filter(
      (activity) => String(activity.id) !== deletedId
    );

    closeDeleteActivityModal();
    await renderActivitiesForSpace();
  } catch (err){
    deleteActivityMessage.textContent = err?.message || "Suppression impossible.";
    deleteActivityMessage.classList.add("is-error");
  }
}

/* =========================
   PANNEAU DROIT
   ========================= */

function renderConfigHeader(){
  if (!configHeader) return;

  if (rightPanelMode === "student-profile"){
    configHeader.innerHTML = `
      <div class="dashboard-section-title">Profil élève</div>

      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <button class="dashboard-icon-btn" id="btnBackToActivities" title="Retour aux activités" aria-label="Retour aux activités" type="button">↩</button>
        <button class="btn primary" id="btnNewConfig" type="button">Créer une activité</button>
      </div>
    `;

    document.getElementById("btnBackToActivities")?.addEventListener("click", async () => {
      currentStudent = null;
      rightPanelMode = "activities";
      await renderStudentsColumn({ skipRefresh: true });
      await renderRightPanel();
    });
  } else {
    configHeader.innerHTML = `
      <div class="dashboard-section-title">Activités</div>

      <button class="btn primary" id="btnNewConfig" type="button">
        Créer une activité
      </button>
    `;
  }

  document.getElementById("btnNewConfig")?.addEventListener("click", () => {
    if (!currentTeacherSpace?.access_code) return;

    goToConfigEditor({
      accessCode: currentTeacherSpace.access_code
    });
  });
}

async function renderRightPanel({ forceRefresh = false } = {}){
  renderConfigHeader();

  if (rightPanelMode === "student-profile"){
    renderStudentProfile();
    return;
  }

  await renderActivitiesForSpace({ forceRefresh });
}

function renderStudentProfile(){
  if (!configsList) return;

  if (!currentStudent){
    configsList.innerHTML = `<div style="color:var(--muted);">Choisis un élève pour afficher son profil.</div>`;
    return;
  }

  const studentId = String(currentStudent.id);
  const noteValue = studentNotesDrafts.get(studentId) || "";
  const subtitle = buildStudentSubtitle(currentStudent);

  configsList.innerHTML = `
    <div class="dashboard-student-profile">
      <div class="dashboard-student-profile-header">
        <div>
          <div class="dashboard-student-name">${escapeHtml(currentStudent.first_name || "")}</div>
          ${subtitle ? `<div class="dashboard-student-meta">${escapeHtml(subtitle)}</div>` : ""}
        </div>
      </div>

      <label class="dashboard-student-notes-label" for="studentNotesTextarea">Notes</label>
      <textarea
        id="studentNotesTextarea"
        class="dashboard-student-notes"
        placeholder="Placeholder : tu pourras noter ici des observations sur cet élève."
      >${escapeHtml(noteValue)}</textarea>

      <div class="dashboard-student-help">Ces notes ne sont pas encore sauvegardées.</div>
    </div>
  `;

  document.getElementById("studentNotesTextarea")?.addEventListener("input", (e) => {
    studentNotesDrafts.set(studentId, e.target.value);
  });
}

/* =========================
   ÉLÈVES : OVERLAYS
   ========================= */

async function openAddStudentOverlay(){
  if (!currentTeacherSpace?.id){
    openPrimaryModal();
    return;
  }

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
        <div id="studentOverlayMessage" class="modal-message"></div>
        <button class="btn" id="cancelAddStudent" type="button">Annuler</button>
        <button class="btn primary" id="confirmAddStudent" type="button">Ajouter</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const nameInput = document.getElementById("newStudentName");
  const message = document.getElementById("studentOverlayMessage");
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

  document.getElementById("confirmAddStudent").onclick = async () => {
    const name = document.getElementById("newStudentName").value.trim();
    const level = document.getElementById("newStudentLevel").value;

    if (!name){
      message.textContent = "Entre un prénom.";
      message.classList.add("is-error");
      return;
    }

    try {
      const createdStudent = await createStudentForTeacherSpace(currentTeacherSpace.id, {
        first_name: name,
        grade_level: level
      });

      overlay.remove();
      currentStudents = [...currentStudents, createdStudent].sort((a, b) => (Number(a?.display_order) || 0) - (Number(b?.display_order) || 0));
      currentStudent = currentStudents.find((student) => String(student.id) === String(createdStudent.id)) || createdStudent;
      rightPanelMode = "student-profile";
      await renderStudentsColumn({ skipRefresh: true });
      await renderRightPanel();
    } catch (err){
      message.textContent = err?.message || "Ajout impossible.";
      message.classList.add("is-error");
    }
  };
}

async function openEditStudentOverlay(studentId){
  const student = currentStudents.find((item) => String(item.id) === String(studentId));
  if (!student) return;

  const overlay = document.createElement("div");
  overlay.className = "modal";

  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-title">Éditer l’élève</div>

      <input id="editStudentName" class="modal-text-input" value="${escapeAttr(student.first_name || "")}" placeholder="Prénom">

      <select id="editStudentLevel" class="student-select">
        <option value="" ${!student.grade_level ? "selected" : ""}>Classe</option>
        <option ${student.grade_level === "CP" ? "selected" : ""}>CP</option>
        <option ${student.grade_level === "CE1" ? "selected" : ""}>CE1</option>
        <option ${student.grade_level === "CE2" ? "selected" : ""}>CE2</option>
        <option ${student.grade_level === "CM1" ? "selected" : ""}>CM1</option>
        <option ${student.grade_level === "CM2" ? "selected" : ""}>CM2</option>
      </select>

      <div class="modal-actions">
        <div id="editStudentMessage" class="modal-message"></div>
        <button class="btn" id="cancelEditStudent" type="button">Annuler</button>
        <button class="btn primary" id="saveStudent" type="button">Enregistrer</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const editInput = document.getElementById("editStudentName");
  const message = document.getElementById("editStudentMessage");
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

  document.getElementById("cancelEditStudent").onclick = () => overlay.remove();

  document.getElementById("saveStudent").onclick = async () => {
    const firstName = document.getElementById("editStudentName").value.trim();
    const gradeLevel = document.getElementById("editStudentLevel").value;

    if (!firstName){
      message.textContent = "Entre un prénom.";
      message.classList.add("is-error");
      return;
    }

    try {
      const updatedStudent = await updateStudent(student.id, {
        first_name: firstName,
        grade_level: gradeLevel
      });

      currentStudents = currentStudents.map((item) => String(item.id) === String(updatedStudent.id) ? { ...item, ...updatedStudent } : item);
      if (currentStudent?.id === updatedStudent.id){
        currentStudent = currentStudents.find((item) => String(item.id) === String(updatedStudent.id)) || updatedStudent;
      }

      overlay.remove();
      await renderStudentsColumn({ skipRefresh: true });
      await renderRightPanel();
    } catch (err){
      message.textContent = err?.message || "Enregistrement impossible.";
      message.classList.add("is-error");
    }
  };
}

/* =========================
   ACTIVITÉS
   ========================= */

async function renderActivitiesForSpace({ forceRefresh = false } = {}){
  if (!configsList) return;

  if (!currentTeacherSpace?.id){
    configsList.innerHTML = `<div style="color:var(--muted);">Crée d’abord ton code de connexion.</div>`;
    return;
  }

  const hasExistingCards = Boolean(configsList.querySelector(".dashboard-config-card"));

  if (!cachedActivities && !hasExistingCards){
    configsList.innerHTML = `<div style="color:var(--muted);">Chargement…</div>`;
  }

  try {
    const configs = forceRefresh || !cachedActivities
      ? await getMyActivitiesForSpace(currentTeacherSpace.id)
      : cachedActivities;

    cachedActivities = Array.isArray(configs) ? [...configs] : [];

    if (!cachedActivities.length){
      configsList.innerHTML = `
        <div class="panel" style="color:var(--muted);">
          Aucune activité pour le moment.
        </div>
      `;
      return;
    }

    configsList.innerHTML = cachedActivities.map((cfg) => {
      const updated = formatDate(cfg.updated_at);
      const activityId = String(cfg.id || "");
      const visibilityIcon = cfg.is_visible === false ? "visibility_off" : "visibility";
      const visibilityLabel = cfg.is_visible === false ? "Afficher dans la vue élève" : "Masquer dans la vue élève";
      const highlightIcon = cfg.is_highlighted ? "rocket_launch" : "rocket";
      const highlightLabel = cfg.is_highlighted ? "Retirer la mise en avant" : "Mettre en avant dans la vue élève";

      return `
        <div
          class="dashboard-config-card ${cfg.is_highlighted ? "is-highlighted" : ""} ${cfg.is_visible === false ? "is-hidden" : ""}"
          data-activity-card-id="${escapeAttr(activityId)}"
          draggable="true"
        >
          <button
            class="dashboard-grip-btn"
            type="button"
            data-action="drag-activity"
            data-activity-id="${escapeAttr(activityId)}"
            title="Déplacer l’activité"
            aria-label="Déplacer l’activité"
            draggable="false"
          >⋮⋮</button>

          <div class="dashboard-config-main">
            <div class="dashboard-config-title">${escapeHtml(cfg.config_name)}</div>
            <div class="dashboard-config-meta">
              <span class="dashboard-mini-pill">${escapeHtml(getModuleLabel(cfg.module_key || ""))}</span>
              <span class="dashboard-config-date">${updated ? `Modifiée : ${updated}` : ""}</span>
            </div>
          </div>

          <div class="dashboard-config-actions">
            <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="open" data-config-name="${escapeAttr(cfg.config_name)}" title="Ouvrir l’activité" aria-label="Ouvrir l’activité" draggable="false">
              <span class="dashboard-material-icon" aria-hidden="true">page_info</span>
            </button>

            <button class="dashboard-icon-btn dashboard-material-icon-btn ${cfg.is_visible === false ? "is-muted" : ""}" type="button" data-action="toggle-visible" data-activity-id="${escapeAttr(activityId)}" title="${escapeAttr(visibilityLabel)}" aria-label="${escapeAttr(visibilityLabel)}" draggable="false">
              <span class="dashboard-material-icon" aria-hidden="true">${visibilityIcon}</span>
            </button>

            <button class="dashboard-icon-btn dashboard-material-icon-btn ${cfg.is_highlighted ? "is-accent" : ""}" type="button" data-action="toggle-highlight" data-activity-id="${escapeAttr(activityId)}" title="${escapeAttr(highlightLabel)}" aria-label="${escapeAttr(highlightLabel)}" draggable="false">
              <span class="dashboard-material-icon" aria-hidden="true">${highlightIcon}</span>
            </button>

            <button class="dashboard-icon-btn dashboard-material-icon-btn is-danger" type="button" data-action="delete" data-config-name="${escapeAttr(cfg.config_name)}" title="Supprimer l’activité" aria-label="Supprimer l’activité" draggable="false">
              <span class="dashboard-material-icon" aria-hidden="true">delete</span>
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
      btn.addEventListener("click", () => {
        const configName = btn.dataset.configName ?? "";
        if (!configName) return;

        const activity = (cachedActivities || []).find(
          (item) => String(item.config_name || "") === String(configName)
        );
        if (!activity) return;

        openDeleteActivityModal(activity);
      });
    });

    configsList.querySelectorAll("[data-action='toggle-visible']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const activityId = String(btn.dataset.activityId || "");
        const activity = cachedActivities?.find((item) => String(item.id) === activityId);
        if (!activity) return;

        const previousActivities = cachedActivities ? [...cachedActivities] : [];
        cachedActivities = previousActivities.map((item) => String(item.id) === activityId
          ? { ...item, is_visible: item.is_visible === false }
          : item
        );
        await renderActivitiesForSpace();

        try {
          const updated = await updateActivityDashboardMeta(activityId, { is_visible: activity.is_visible === false });
          cachedActivities = cachedActivities.map((item) => String(item.id) === activityId ? { ...item, ...updated } : item);
          await renderActivitiesForSpace();
        } catch (err) {
          cachedActivities = previousActivities;
          await renderActivitiesForSpace();
          alert(err?.message || "Impossible de modifier la visibilité.");
        }
      });
    });

    configsList.querySelectorAll("[data-action='toggle-highlight']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const activityId = String(btn.dataset.activityId || "");
        if (!activityId || !currentTeacherSpace?.id) return;

        const activity = cachedActivities?.find((item) => String(item.id) === activityId);
        if (!activity) return;

        const nextHighlightedId = activity.is_highlighted ? null : activityId;
        const previousActivities = cachedActivities ? [...cachedActivities] : [];
        cachedActivities = previousActivities.map((item) => ({
          ...item,
          is_highlighted: nextHighlightedId !== null && String(item.id) === nextHighlightedId
        }));
        await renderActivitiesForSpace();

        try {
          await setHighlightedActivityForTeacherSpace(currentTeacherSpace.id, nextHighlightedId);
          cachedActivities = await getMyActivitiesForSpace(currentTeacherSpace.id);
          await renderActivitiesForSpace();
        } catch (err) {
          cachedActivities = previousActivities;
          await renderActivitiesForSpace();
          alert(err?.message || "Impossible de modifier la mise en avant.");
        }
      });
    });

    configsList.querySelectorAll(".dashboard-config-card[data-activity-card-id]").forEach((card) => {
      card.addEventListener("dragstart", handleActivityDragStart);
      card.addEventListener("dragend", handleActivityDragEnd);
    });
  } catch (err) {
    configsList.innerHTML = `<div style="color:var(--bad);">${escapeHtml(err?.message || "Impossible de charger les activités.")}</div>`;
  }
}

function clearActivityDropMarkers(){
  activityDropIndex = null;
  configsList?.querySelectorAll(".dashboard-config-card.is-dragging").forEach((card) => {
    card.classList.remove("is-dragging");
  });
  configsList?.querySelector(".dashboard-drop-indicator")?.remove();
}

function getVisibleActivityCards(){
  return Array.from(configsList?.querySelectorAll(".dashboard-config-card[data-activity-card-id]") || [])
    .filter((card) => String(card.dataset.activityCardId || "") !== String(draggedActivityId || ""));
}

function getActivityDropIndexFromClientY(clientY){
  const cards = getVisibleActivityCards();
  if (!cards.length) return 0;

  for (let index = 0; index < cards.length; index += 1){
    const rect = cards[index].getBoundingClientRect();
    const midpoint = rect.top + (rect.height / 2);
    if (clientY < midpoint){
      return index;
    }
  }

  return cards.length;
}

function renderActivityDropIndicator(dropIndex){
  if (!configsList) return;

  const cards = getVisibleActivityCards();
  const indicator = ensureDropIndicator(configsList);

  let top = 0;
  if (cards.length === 0){
    top = 0;
  } else if (dropIndex <= 0){
    top = cards[0].offsetTop;
  } else if (dropIndex >= cards.length){
    const lastCard = cards[cards.length - 1];
    top = lastCard.offsetTop + lastCard.offsetHeight;
  } else {
    top = cards[dropIndex].offsetTop;
  }

  indicator.style.top = `${Math.round(top)}px`;
  indicator.hidden = false;
}

function handleActivityDragStart(event){
  const card = event.currentTarget;
  const activityId = String(card?.dataset?.activityCardId || "");

  if (!activityId || isSavingActivityOrder){
    event.preventDefault();
    dragHandleActivityId = null;
    return;
  }

  draggedActivityId = activityId;
  card.classList.add("is-dragging");

  if (event.dataTransfer){
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", activityId);
  }
}

function handleActivityDragOver(event){
  if (!draggedActivityId || isSavingActivityOrder || !configsList) return;

  event.preventDefault();
  const dropIndex = getActivityDropIndexFromClientY(event.clientY);
  activityDropIndex = dropIndex;
  renderActivityDropIndicator(dropIndex);

  const draggedCard = configsList.querySelector(`.dashboard-config-card[data-activity-card-id="${CSS.escape(draggedActivityId)}"]`);
  draggedCard?.classList.add("is-dragging");
}

function handleActivityDragLeave(event){
  if (!configsList) return;
  const relatedTarget = event.relatedTarget;
  if (relatedTarget instanceof Node && configsList.contains(relatedTarget)) return;
  clearActivityDropMarkers();
}

async function handleActivityDrop(event){
  if (!draggedActivityId || isSavingActivityOrder) return;

  event.preventDefault();
  const dropIndex = Number.isInteger(activityDropIndex) ? activityDropIndex : getActivityDropIndexFromClientY(event.clientY);
  await moveActivityCard(draggedActivityId, dropIndex);
}

function handleActivityDragEnd(){
  draggedActivityId = null;
  dragHandleActivityId = null;
  clearActivityDropMarkers();
}

async function moveActivityCard(sourceActivityId, dropIndex){
  const sourceId = String(sourceActivityId || "");
  if (!sourceId || !currentTeacherSpace?.id) return;

  const previousActivities = cachedActivities ? [...cachedActivities] : [];
  const remainingIds = previousActivities
    .map((activity) => String(activity.id))
    .filter((activityId) => activityId !== sourceId);

  const safeDropIndex = Math.max(0, Math.min(Number(dropIndex) || 0, remainingIds.length));
  remainingIds.splice(safeDropIndex, 0, sourceId);

  const orderedActivities = remainingIds
    .map((activityId) => previousActivities.find((activity) => String(activity.id) === activityId))
    .filter(Boolean)
    .map((activity, index) => ({ ...activity, display_order: index }));

  cachedActivities = orderedActivities;
  isSavingActivityOrder = true;
  await renderActivitiesForSpace();

  try {
    await saveActivityOrderForTeacherSpace(currentTeacherSpace.id, remainingIds);
  } catch (err) {
    cachedActivities = previousActivities;
    alert(err?.message || "Impossible d’enregistrer l’ordre des activités.");
  } finally {
    isSavingActivityOrder = false;
    draggedActivityId = null;
    dragHandleActivityId = null;
    clearActivityDropMarkers();
    await renderActivitiesForSpace();
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
