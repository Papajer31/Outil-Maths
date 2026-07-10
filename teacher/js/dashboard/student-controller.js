import {
  escapeAttr,
  escapeHtml
} from "./text-utils.js";

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

export function createStudentDashboardController({
  studentsList,
  accessCodeBox,
  accessCodeValue,
  accessCodeModal,
  accessCodeModalTitle,
  accessCodeInput,
  btnModalCreate,
  modalMessage,
  deleteStudentModal,
  deleteStudentModalTitle,
  deleteStudentText,
  deleteStudentMessage,
  getCurrentTeacherSpace,
  setCurrentTeacherSpace,
  getCurrentStudents,
  setCurrentStudents,
  getCurrentStudent,
  setCurrentStudent,
  getStudentViewMode = () => "list",
  setCurrentDashboardSection,
  renderDashboardShellState,
  renderRightPanel,
  updateClassSectionTitle,
  syncDashboardUrl,
  normalizeAccessCode,
  createOrGetMyTeacherSpace,
  updateMyTeacherSpace,
  markTeacherSpaceAsOpened,
  listStudentsForTeacherSpace,
  createStudentForTeacherSpace,
  updateStudent,
  deleteStudent,
  saveStudentOrderForTeacherSpace,
  setCachedActivities,
  setCachedActivityFolders,
  getCollapsedActivityFolderIds,
  getKnownActivityFolderIds,
  studentNotesDrafts = new Map(),
  showToast
} = {}){
  let primaryModalMode = "create-space";
  let pendingStudent = null;
  let draggedStudentId = null;
  let isSavingStudentOrder = false;
  let studentDropIndex = null;
  let rightPanelMode = "activities";

  function buildStudentSubtitle(student){
    const level = String(student?.grade_level || "").trim();
    const code = String(student?.student_code || "").trim();
    return [level, code ? `code ${code}` : ""].filter(Boolean).join(" · ");
  }

  function closeAccessCodeModal(){
    accessCodeModal?.classList.add("hidden");
  }

  function renderAccessCodeBox(){
    if (!accessCodeBox || !accessCodeValue) return;

    const code = String(getCurrentTeacherSpace?.()?.access_code || "").trim();
    if (!code){
      accessCodeBox.classList.add("hidden");
      accessCodeValue.textContent = "—";
      return;
    }

    accessCodeValue.textContent = code;
    accessCodeBox.classList.remove("hidden");
  }

  async function refreshStudents(){
    const currentTeacherSpace = getCurrentTeacherSpace?.();
    if (!currentTeacherSpace?.id){
      setCurrentStudents?.([]);
      setCurrentStudent?.(null);
      setCachedActivities?.(null);
      setCachedActivityFolders?.(null);
      getCollapsedActivityFolderIds?.().clear();
      getKnownActivityFolderIds?.().clear();
      rightPanelMode = "activities";
      updateClassSectionTitle?.();
      return;
    }

    const students = await listStudentsForTeacherSpace?.(currentTeacherSpace.id);
    const nextStudents = Array.isArray(students) ? students : [];
    setCurrentStudents?.(nextStudents);

    const currentStudent = getCurrentStudent?.();
    if (currentStudent?.id){
      const matched = nextStudents.find((student) => String(student.id) === String(currentStudent.id)) || null;
      setCurrentStudent?.(matched);
    }

    if (rightPanelMode === "student-profile" && !getCurrentStudent?.()){
      rightPanelMode = "activities";
    }

    updateClassSectionTitle?.();
  }

  function openPrimaryModal(){
    if (!getCurrentTeacherSpace?.()){
      primaryModalMode = "create-space";
      accessCodeModalTitle?.setAttribute("aria-live", "off");
      if (accessCodeModalTitle) accessCodeModalTitle.textContent = "Créer un code de connexion";
      if (btnModalCreate) btnModalCreate.textContent = "Créer";
      if (accessCodeInput) {
        accessCodeInput.placeholder = "Code de connexion (ex. GKOSIM)";
        accessCodeInput.value = "";
        accessCodeInput.focus();
      }
      if (modalMessage) modalMessage.textContent = "";
      accessCodeModal?.classList.remove("hidden");
      return;
    }

    void openAddStudentOverlay();
  }

  function openEditAccessCodeModal(){
    const currentTeacherSpace = getCurrentTeacherSpace?.();
    if (!currentTeacherSpace){
      openPrimaryModal();
      return;
    }

    primaryModalMode = "edit-access-code";
    if (accessCodeModalTitle) accessCodeModalTitle.textContent = "Modifier le code de connexion";
    if (btnModalCreate) btnModalCreate.textContent = "Enregistrer";
    if (accessCodeInput) {
      accessCodeInput.placeholder = "Code de connexion (ex. GKOSIM)";
      accessCodeInput.value = currentTeacherSpace.access_code || "";
      accessCodeInput.focus();
      accessCodeInput.select();
    }
    if (modalMessage) modalMessage.textContent = "";
    accessCodeModal?.classList.remove("hidden");
  }

  async function submitPrimaryModal(){
    if (!accessCodeInput) return;

    const rawValue = accessCodeInput.value;

    try {
      const accessCode = normalizeAccessCode?.(rawValue);

      if (!accessCode){
        if (modalMessage) {
          modalMessage.textContent = "Entre un code valide.";
          modalMessage.style.color = "var(--bad)";
        }
        return;
      }

      if (primaryModalMode === "edit-access-code"){
        const currentTeacherSpace = getCurrentTeacherSpace?.();
        if (!currentTeacherSpace?.id) return;

        const updatedSpace = await updateMyTeacherSpace?.(currentTeacherSpace.id, {
          access_code: accessCode
        });
        if (updatedSpace) {
          setCurrentTeacherSpace?.(updatedSpace);
        }
      } else {
        let nextTeacherSpace = await createOrGetMyTeacherSpace?.(accessCode);
        if (!nextTeacherSpace?.id) return;
        nextTeacherSpace = await markTeacherSpaceAsOpened?.(nextTeacherSpace.id) || nextTeacherSpace;
        setCurrentTeacherSpace?.(nextTeacherSpace);
        await refreshStudents();
      }

      renderAccessCodeBox();
      syncDashboardUrl?.();
      closeAccessCodeModal();
      await renderStudentsColumn({ skipRefresh: true });
      await renderRightPanel?.();
    } catch (err){
      if (modalMessage) {
        modalMessage.textContent = err?.message || "Erreur.";
        modalMessage.style.color = "var(--bad)";
      }
    }
  }

  function openDeleteStudentModal(student){
    pendingStudent = student;
    if (deleteStudentModalTitle) deleteStudentModalTitle.textContent = "Supprimer l’élève";
    if (deleteStudentMessage) {
      deleteStudentMessage.textContent = "";
      deleteStudentMessage.classList.remove("is-error");
    }
    if (deleteStudentText) deleteStudentText.textContent = `Supprimer l’élève "${student.first_name}" ?`;
    deleteStudentModal?.classList.remove("hidden");
  }

  function closeDeleteStudentModal(){
    pendingStudent = null;
    deleteStudentModal?.classList.add("hidden");
  }

  async function submitDeleteStudent(){
    if (!pendingStudent?.id) return;

    if (deleteStudentMessage) {
      deleteStudentMessage.textContent = "Suppression…";
      deleteStudentMessage.classList.remove("is-error");
    }

    try {
      const deletedId = pendingStudent.id;
      await deleteStudent?.(deletedId);

      studentNotesDrafts.delete(String(deletedId));

      if (String(getCurrentStudent?.()?.id || "") === String(deletedId)){
        setCurrentStudent?.(null);
        rightPanelMode = "activities";
      }

      setCurrentStudents?.(
        (getCurrentStudents?.() || []).filter((student) => String(student.id) !== String(deletedId))
      );
      updateClassSectionTitle?.();

      closeDeleteStudentModal();
      await renderStudentsColumn({ skipRefresh: true });
      await renderRightPanel?.();
    } catch (err){
      if (deleteStudentMessage) {
        deleteStudentMessage.textContent = err?.message || "Suppression impossible.";
        deleteStudentMessage.classList.add("is-error");
      }
    }
  }

  async function selectStudentById(studentId){
    const matched = (getCurrentStudents?.() || []).find((student) => String(student.id) === String(studentId)) || null;
    setCurrentStudent?.(matched);
    setCurrentDashboardSection?.("class");
    renderDashboardShellState?.();
    await renderStudentsColumn({ skipRefresh: true });
  }

  function renderStudentCardMarkup(student){
    const studentId = String(student.id);
    const isCurrent = String(getCurrentStudent?.()?.id || "") === studentId;
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
        ><span class="dashboard-class-card-grip-lines" aria-hidden="true"></span></button>

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
  }

  function clearStudentDropMarkers(){
    studentDropIndex = null;
    studentsList?.querySelectorAll(".dashboard-class-card.is-dragging").forEach((card) => {
      card.classList.remove("is-dragging");
    });
    const indicator = studentsList?.querySelector(":scope > .dashboard-drop-indicator");
    indicator?.classList.remove("is-tile-slot");
    indicator?.removeAttribute("style");
    indicator?.remove();
  }

  function getVisibleStudentCards(){
    return Array.from(studentsList?.querySelectorAll(".dashboard-class-card[data-student-card-id]") || [])
      .filter((card) => String(card.dataset.studentCardId || "") !== String(draggedStudentId || ""));
  }

  function isStudentTileView(){
    return String(getStudentViewMode?.() || "") === "tiles" && !getCurrentStudent?.();
  }

  function getStudentDropIndexFromPointer(clientX, clientY){
    const cards = getVisibleStudentCards();
    if (!cards.length) return 0;

    if (!isStudentTileView()) {
      for (let index = 0; index < cards.length; index += 1){
        const rect = cards[index].getBoundingClientRect();
        const midpoint = rect.top + (rect.height / 2);
        if (clientY < midpoint){
          return index;
        }
      }
      return cards.length;
    }

    const directCard = cards.find((card) => {
      const rect = card.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    });

    if (directCard) {
      const rect = directCard.getBoundingClientRect();
      const index = cards.indexOf(directCard);
      return index + (clientX >= rect.left + (rect.width / 2) ? 1 : 0);
    }

    const firstRect = cards[0].getBoundingClientRect();
    const lastRect = cards[cards.length - 1].getBoundingClientRect();

    if (clientY < firstRect.top) return 0;
    if (clientY > lastRect.bottom) return cards.length;

    let bestIndex = cards.length;
    let bestDistance = Number.POSITIVE_INFINITY;

    cards.forEach((card, index) => {
      const rect = card.getBoundingClientRect();
      const centerX = rect.left + (rect.width / 2);
      const centerY = rect.top + (rect.height / 2);
      const distance = Math.abs(clientX - centerX) + Math.abs(clientY - centerY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index + (clientX >= centerX ? 1 : 0);
      }
    });

    return Math.max(0, Math.min(bestIndex, cards.length));
  }

  function renderStudentTileDropIndicator(dropIndex){
    if (!studentsList) return;

    const cards = getVisibleStudentCards();
    const indicator = ensureDropIndicator(studentsList);
    indicator.classList.add("is-tile-slot");

    if (!cards.length) {
      indicator.hidden = true;
      return;
    }

    const barWidth = 6;
    let left = 0;
    let top = 0;
    let height = Math.max(32, cards[0].offsetHeight - 28);

    if (dropIndex <= 0) {
      const firstCard = cards[0];
      left = firstCard.offsetLeft - Math.round(barWidth / 2);
      top = firstCard.offsetTop + 14;
      height = Math.max(32, firstCard.offsetHeight - 28);
    } else if (dropIndex >= cards.length) {
      const lastCard = cards[cards.length - 1];
      left = lastCard.offsetLeft + lastCard.offsetWidth - Math.round(barWidth / 2);
      top = lastCard.offsetTop + 14;
      height = Math.max(32, lastCard.offsetHeight - 28);
    } else {
      const targetCard = cards[dropIndex];
      left = targetCard.offsetLeft - Math.round(barWidth / 2);
      top = targetCard.offsetTop + 14;
      height = Math.max(32, targetCard.offsetHeight - 28);
    }

    indicator.style.left = `${Math.round(left)}px`;
    indicator.style.top = `${Math.round(top)}px`;
    indicator.style.width = `${barWidth}px`;
    indicator.style.height = `${Math.round(height)}px`;
    indicator.hidden = false;
  }

  function renderStudentDropIndicator(dropIndex){
    if (!studentsList) return;

    if (isStudentTileView()) {
      renderStudentTileDropIndicator(dropIndex);
      return;
    }

    const cards = getVisibleStudentCards();
    const indicator = ensureDropIndicator(studentsList);
    indicator.classList.remove("is-tile-slot");
    indicator.style.removeProperty("height");

    let top = 0;
    if (cards.length === 0){
      indicator.style.removeProperty("left");
      indicator.style.removeProperty("width");
      top = 0;
    } else if (dropIndex <= 0){
      top = cards[0].offsetTop;
    } else if (dropIndex >= cards.length){
      const lastCard = cards[cards.length - 1];
      top = lastCard.offsetTop + lastCard.offsetHeight;
    } else {
      top = cards[dropIndex].offsetTop;
    }

    if (cards.length > 0) {
      const referenceCard = cards[0];
      indicator.style.left = `${Math.round(referenceCard.offsetLeft)}px`;
      indicator.style.width = `${Math.round(referenceCard.offsetWidth)}px`;
    }

    indicator.style.top = `${Math.round(top)}px`;
    indicator.hidden = false;
  }

  function handleStudentDragStart(event){
    const card = event.currentTarget;
    const studentId = String(card?.dataset?.studentCardId || "");

    if (!studentId || isSavingStudentOrder){
      event.preventDefault();
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
    const dropIndex = getStudentDropIndexFromPointer(event.clientX, event.clientY);
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
    const dropIndex = Number.isInteger(studentDropIndex)
      ? studentDropIndex
      : getStudentDropIndexFromPointer(event.clientX, event.clientY);
    await moveStudentCard(draggedStudentId, dropIndex);
  }

  function handleStudentDragEnd(){
    draggedStudentId = null;
    clearStudentDropMarkers();
  }

  async function moveStudentCard(sourceStudentId, dropIndex){
    const sourceId = String(sourceStudentId || "");
    const currentTeacherSpace = getCurrentTeacherSpace?.();
    if (!sourceId || !currentTeacherSpace?.id) return;

    const previousStudents = [...(getCurrentStudents?.() || [])];
    const remainingIds = previousStudents
      .map((student) => String(student.id))
      .filter((studentId) => studentId !== sourceId);

    const safeDropIndex = Math.max(0, Math.min(Number(dropIndex) || 0, remainingIds.length));
    remainingIds.splice(safeDropIndex, 0, sourceId);

    const orderedStudents = remainingIds
      .map((studentId) => previousStudents.find((student) => String(student.id) === studentId))
      .filter(Boolean)
      .map((student, index) => ({ ...student, display_order: index }));

    setCurrentStudents?.(orderedStudents);
    isSavingStudentOrder = true;
    await renderStudentsColumn({ skipRefresh: true });

    try {
      await saveStudentOrderForTeacherSpace?.(currentTeacherSpace.id, remainingIds);
    } catch (err) {
      setCurrentStudents?.(previousStudents);
      showToast?.(err?.message || "Impossible d’enregistrer l’ordre des élèves.", { isError: true });
    } finally {
      isSavingStudentOrder = false;
      draggedStudentId = null;
      clearStudentDropMarkers();
      await renderStudentsColumn({ skipRefresh: true });
    }
  }

  async function openAddStudentOverlay(){
    const currentTeacherSpace = getCurrentTeacherSpace?.();
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

        <input id="newStudentLevel" class="modal-text-input" placeholder="Classe (ex : CPA, CE1 n°2)">

        <input id="newStudentCode" class="modal-text-input" placeholder="Code élève de trois caractères (ex : M2J)" maxlength="3">

        <div class="modal-actions">
          <div id="studentOverlayMessage" class="modal-message"></div>
          <button class="btn" id="cancelAddStudent" type="button">Annuler</button>
          <button class="btn primary" id="confirmAddStudent" type="button">Ajouter</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const nameInput = overlay.querySelector("#newStudentName");
    const levelInput = overlay.querySelector("#newStudentLevel");
    const codeInput = overlay.querySelector("#newStudentCode");
    const message = overlay.querySelector("#studentOverlayMessage");
    const cancelButton = overlay.querySelector("#cancelAddStudent");
    const confirmButton = overlay.querySelector("#confirmAddStudent");

    nameInput?.focus();

    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Enter"){
        event.preventDefault();
        confirmButton?.click();
      }
    });

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay){
        overlay.remove();
      }
    });

    cancelButton?.addEventListener("click", () => overlay.remove());

    confirmButton?.addEventListener("click", async () => {
      const name = String(nameInput?.value || "").trim();
      const level = String(levelInput?.value || "");
      const studentCode = String(codeInput?.value || "").trim().toUpperCase();

      if (!name){
        message.textContent = "Entre un prénom.";
        message.classList.add("is-error");
        return;
      }

      try {
        const createdStudent = await createStudentForTeacherSpace?.(currentTeacherSpace.id, {
          first_name: name,
          grade_level: level,
          student_code: studentCode
        });

        if (!createdStudent) return;

        overlay.remove();
        setCurrentStudents?.(
          [...(getCurrentStudents?.() || []), createdStudent].sort((a, b) => (
            (Number(a?.display_order) || 0) - (Number(b?.display_order) || 0)
          ))
        );
        setCurrentStudent?.(null);
        setCurrentDashboardSection?.("class");
        renderDashboardShellState?.();
        updateClassSectionTitle?.();
        await renderStudentsColumn({ skipRefresh: true });
      } catch (err){
        message.textContent = err?.message || "Ajout impossible.";
        message.classList.add("is-error");
      }
    });
  }

  async function openEditStudentOverlay(studentId){
    const student = (getCurrentStudents?.() || []).find((item) => String(item.id) === String(studentId));
    if (!student) return;

    const overlay = document.createElement("div");
    overlay.className = "modal";
    overlay.innerHTML = `
      <div class="modal-content">
        <div class="modal-title">Éditer l’élève</div>

        <input id="editStudentName" class="modal-text-input" value="${escapeAttr(student.first_name || "")}" placeholder="Prénom">

        <input id="editStudentLevel" class="modal-text-input" value="${escapeAttr(student.grade_level || "")}" placeholder="Classe (ex : CPA, CE1 n°2)">

        <input id="editStudentCode" class="modal-text-input" value="${escapeAttr(student.student_code || "")}" placeholder="Code élève de trois caractères (ex : M2J)" maxlength="3">

        <div class="modal-actions">
          <div id="editStudentMessage" class="modal-message"></div>
          <button class="btn" id="cancelEditStudent" type="button">Annuler</button>
          <button class="btn primary" id="saveStudent" type="button">Enregistrer</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const editInput = overlay.querySelector("#editStudentName");
    const levelInput = overlay.querySelector("#editStudentLevel");
    const codeInput = overlay.querySelector("#editStudentCode");
    const message = overlay.querySelector("#editStudentMessage");
    const cancelButton = overlay.querySelector("#cancelEditStudent");
    const saveButton = overlay.querySelector("#saveStudent");

    editInput?.focus();
    editInput?.select();

    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Enter"){
        event.preventDefault();
        saveButton?.click();
      }
    });

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay){
        overlay.remove();
      }
    });

    cancelButton?.addEventListener("click", () => overlay.remove());

    saveButton?.addEventListener("click", async () => {
      const firstName = String(editInput?.value || "").trim();
      const gradeLevel = String(levelInput?.value || "");
      const studentCode = String(codeInput?.value || "").trim().toUpperCase();

      if (!firstName){
        message.textContent = "Entre un prénom.";
        message.classList.add("is-error");
        return;
      }

      try {
        const updatedStudent = await updateStudent?.(student.id, {
          first_name: firstName,
          grade_level: gradeLevel,
          student_code: studentCode
        });

        if (!updatedStudent) return;

        setCurrentStudents?.(
          (getCurrentStudents?.() || []).map((item) => (
            String(item.id) === String(updatedStudent.id) ? { ...item, ...updatedStudent } : item
          ))
        );

        if (String(getCurrentStudent?.()?.id || "") === String(updatedStudent.id)) {
          setCurrentStudent?.(updatedStudent);
        }

        overlay.remove();
        updateClassSectionTitle?.();
        await renderStudentsColumn({ skipRefresh: true });
        await renderRightPanel?.();
      } catch (err){
        message.textContent = err?.message || "Enregistrement impossible.";
        message.classList.add("is-error");
      }
    });
  }

  async function renderStudentsColumn({ skipRefresh = false } = {}){
    if (!studentsList) return;

    studentsList.classList.toggle("is-tile-view", !getCurrentStudent?.() && String(getStudentViewMode?.() || "") === "tiles");

    if (!getCurrentTeacherSpace?.()){
      studentsList.classList.remove("is-tile-view");
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

      studentsList.classList.toggle("is-tile-view", !getCurrentStudent?.() && String(getStudentViewMode?.() || "") === "tiles");

      const currentStudents = getCurrentStudents?.() || [];

      if (!currentStudents.length){
        studentsList.classList.remove("is-tile-view");
        studentsList.innerHTML = `<div style="color:var(--muted);">Aucun élève pour le moment.</div>`;
        return;
      }

      const currentStudent = getCurrentStudent?.();
      if (currentStudent){
        studentsList.classList.remove("is-tile-view");
        const studentId = String(currentStudent.id);
        const noteValue = studentNotesDrafts.get(studentId) || "";
        const subtitle = buildStudentSubtitle(currentStudent);

        studentsList.innerHTML = `
          <div class="dashboard-student-profile">
            <div class="dashboard-profile-header">
              <div>
                <div class="dashboard-student-name">${escapeHtml(currentStudent.first_name || "")}</div>
                ${subtitle ? `<div class="dashboard-student-meta">${escapeHtml(subtitle)}</div>` : ""}
              </div>

              <button class="dashboard-profile-back" type="button" id="btnBackToClassList">Retour à la liste</button>
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

        document.getElementById("studentNotesTextarea")?.addEventListener("input", (event) => {
          studentNotesDrafts.set(studentId, event.target.value);
        });

        document.getElementById("btnBackToClassList")?.addEventListener("click", async () => {
          setCurrentStudent?.(null);
          await renderStudentsColumn({ skipRefresh: true });
        });
        return;
      }

      studentsList.innerHTML = currentStudents.map((student) => renderStudentCardMarkup(student)).join("");

      studentsList.querySelectorAll(".dashboard-class-card-main[data-student-id]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          await selectStudentById(btn.dataset.studentId);
        });
      });

      studentsList.querySelectorAll("[data-action='edit-student']").forEach((btn) => {
        btn.addEventListener("click", async (event) => {
          event.stopPropagation();
          await openEditStudentOverlay(btn.dataset.studentId);
        });
      });

      studentsList.querySelectorAll("[data-action='delete-student']").forEach((btn) => {
        btn.addEventListener("click", async (event) => {
          event.stopPropagation();
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
      studentsList.classList.remove("is-tile-view");
      studentsList.innerHTML = `<div style="color:var(--bad);">${escapeHtml(err?.message || "Impossible de charger les élèves.")}</div>`;
    }
  }

  function clearArmedHandle(){}

  return {
    refreshStudents,
    renderAccessCodeBox,
    renderStudentsColumn,
    openPrimaryModal,
    openEditAccessCodeModal,
    closeAccessCodeModal,
    submitPrimaryModal,
    closeDeleteStudentModal,
    submitDeleteStudent,
    handleStudentDragOver,
    handleStudentDrop,
    clearArmedHandle
  };
}
