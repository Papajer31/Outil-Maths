export const NAME_SCALE_MIN = 0.7;
export const NAME_SCALE_MAX = 1.6;
export const NAME_SCALE_STEP = 0.1;
export const NAME_SCALE_DEFAULT = NAME_SCALE_MIN;

export function normalizeStudent(student){
  const id = String(student?.id || "").trim();
  const firstName = String(student?.first_name || student?.firstName || "").trim();

  if (!id && !firstName) return null;

  return {
    id: id || firstName,
    firstName: firstName || "Élève sans prénom",
    gradeLevel: String(student?.grade_level || "").trim(),
    displayOrder: Number(student?.display_order) || 0
  };
}

export function normalizeStudents(students){
  return (Array.isArray(students) ? students : [])
    .map(normalizeStudent)
    .filter(Boolean);
}

export function pickRandom(items){
  if (!items.length) return null;
  const index = Math.floor(Math.random() * items.length);
  return items[index] || null;
}

export function uniqueStrings(values){
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)));
}

export function normalizeNameScale(value){
  const number = Number(value);
  if (!Number.isFinite(number)) return NAME_SCALE_DEFAULT;
  const stepped = Math.round(number / NAME_SCALE_STEP) * NAME_SCALE_STEP;
  return Math.max(NAME_SCALE_MIN, Math.min(NAME_SCALE_MAX, Number(stepped.toFixed(2))));
}

export function normalizeDrawSerial(value){
  return Math.max(0, Math.trunc(Number(value) || 0));
}

export function normalizeRandomStudentState(rawState = {}){
  return {
    avoidRepeats: rawState.avoidRepeats !== false,
    nameScale: normalizeNameScale(rawState.nameScale),
    drawSerial: normalizeDrawSerial(rawState.drawSerial),
    lastDrawPool: normalizeStudents(rawState.lastDrawPool).slice(0, 64),
    excludedStudentIds: uniqueStrings(rawState.excludedStudentIds),
    drawnIds: uniqueStrings(rawState.drawnIds),
    currentStudent: rawState.currentStudent || null,
    history: (Array.isArray(rawState.history) ? rawState.history : []).slice(0, 12)
  };
}

export function createInitialRandomStudentState(){
  return normalizeRandomStudentState();
}

export function getIncludedStudents(students, state){
  const excludedStudentIds = new Set(uniqueStrings(state?.excludedStudentIds));
  return normalizeStudents(students).filter((student) => !excludedStudentIds.has(student.id));
}

export function createRandomStudentProjectorState({ state: rawState, students = [] } = {}){
  const classStudents = normalizeStudents(students);
  const state = normalizeRandomStudentState(rawState);
  const classIds = new Set(classStudents.map((student) => student.id));
  const excludedStudentIds = state.excludedStudentIds.filter((id) => classIds.has(id));
  const includedStudents = getIncludedStudents(classStudents, { excludedStudentIds });
  const includedIds = new Set(includedStudents.map((student) => student.id));
  const drawnIds = state.drawnIds.filter((id) => includedIds.has(id));
  const remainingCount = state.avoidRepeats
    ? includedStudents.filter((student) => !drawnIds.includes(student.id)).length
    : includedStudents.length;

  return {
    ...state,
    excludedStudentIds,
    drawnIds,
    lastDrawPool: state.lastDrawPool.filter((student) => includedIds.has(student.id)),
    history: state.history.filter((student) => includedIds.has(student.id)),
    currentStudent: state.currentStudent && includedIds.has(state.currentStudent.id) ? state.currentStudent : null,
    remainingCount,
    totalCount: includedStudents.length,
    classCount: classStudents.length,
    updatedAt: Date.now()
  };
}

export function applyRandomStudentAction({ action, payload = {}, state, students = [] } = {}){
  const safeAction = String(action || "").trim();
  const classStudents = normalizeStudents(students);
  const currentState = normalizeRandomStudentState(state);

  if (safeAction === "set-avoid-repeats") {
    return {
      patch: {
        state: normalizeRandomStudentState({
          ...currentState,
          avoidRepeats: payload?.avoidRepeats !== false
        })
      }
    };
  }

  if (safeAction === "set-student-included") {
    const studentId = String(payload?.studentId || "").trim();
    const validIds = new Set(classStudents.map((student) => student.id));
    if (!studentId || !validIds.has(studentId)) return null;

    const excludedStudentIds = new Set(currentState.excludedStudentIds.filter((id) => validIds.has(id)));
    if (payload?.included === false) {
      excludedStudentIds.add(studentId);
    } else {
      excludedStudentIds.delete(studentId);
    }

    return {
      patch: {
        state: normalizeRandomStudentState({
          ...currentState,
          excludedStudentIds: Array.from(excludedStudentIds)
        })
      }
    };
  }

  if (safeAction === "force-draw") {
    const studentId = String(payload?.studentId || "").trim();
    const picked = classStudents.find((student) => student.id === studentId) || null;
    if (!picked) {
      return { error: "Élève introuvable dans la classe." };
    }

    const classIds = new Set(classStudents.map((student) => student.id));
    const excludedStudentIds = currentState.excludedStudentIds
      .filter((id) => classIds.has(id) && id !== picked.id);
    const drawnIds = currentState.drawnIds.filter((id) => classIds.has(id));
    const drawPool = classStudents.filter((student) => (
      !excludedStudentIds.includes(student.id)
      && (!currentState.avoidRepeats || !drawnIds.includes(student.id) || student.id === picked.id)
    ));

    return {
      patch: {
        state: normalizeRandomStudentState({
          ...currentState,
          excludedStudentIds,
          drawSerial: currentState.drawSerial + 1,
          lastDrawPool: drawPool,
          drawnIds: uniqueStrings([...drawnIds, picked.id]),
          currentStudent: picked,
          history: [picked, ...currentState.history.filter((student) => student.id !== picked.id)].slice(0, 12)
        })
      }
    };
  }

  if (safeAction === "adjust-name-scale") {
    return {
      patch: {
        state: normalizeRandomStudentState({
          ...currentState,
          nameScale: normalizeNameScale(currentState.nameScale + (Number(payload?.delta) || 0))
        })
      }
    };
  }

  if (safeAction === "reset") {
    return {
      patch: {
        state: normalizeRandomStudentState({
          ...currentState,
          drawnIds: [],
          currentStudent: null,
          history: []
        })
      },
      message: "Tirage réinitialisé."
    };
  }

  if (safeAction !== "draw") return null;

  if (!classStudents.length) {
    return { error: "Ajoute d’abord des élèves dans l’onglet Classe." };
  }

  const includedStudents = getIncludedStudents(classStudents, currentState);
  if (!includedStudents.length) {
    return { error: "Inclue au moins un élève dans la liste de tirage." };
  }

  const validIds = new Set(includedStudents.map((student) => student.id));
  let drawnIds = currentState.drawnIds.filter((id) => validIds.has(id));
  let pool = currentState.avoidRepeats
    ? includedStudents.filter((student) => !drawnIds.includes(student.id))
    : includedStudents;
  let message = "";

  if (!pool.length && currentState.avoidRepeats) {
    drawnIds = [];
    pool = includedStudents;
    message = "Tous les élèves avaient été tirés : le tirage a été remis à zéro.";
  }

  const picked = pickRandom(pool);
  if (!picked) return null;

  return {
    patch: {
      state: normalizeRandomStudentState({
        ...currentState,
        drawSerial: currentState.drawSerial + 1,
        lastDrawPool: pool,
        drawnIds: uniqueStrings([...drawnIds, picked.id]),
        currentStudent: picked,
        history: [picked, ...currentState.history.filter((student) => student.id !== picked.id)].slice(0, 12)
      })
    },
    message
  };
}
