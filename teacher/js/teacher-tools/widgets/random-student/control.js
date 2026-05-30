import {
  NAME_SCALE_MAX,
  NAME_SCALE_MIN,
  NAME_SCALE_STEP,
  applyRandomStudentAction,
  createRandomStudentProjectorState,
  normalizeRandomStudentState,
  normalizeStudents
} from "./model.js";
import { escapeHtml } from "../../../dashboard/text-utils.js";

export function createRandomStudentControlPanel({ host, getWidget, updateWidget, getStudents, showToast } = {}){
  let isForcedDrawPending = false;

  function getCleanStudents(){
    return normalizeStudents(getStudents?.());
  }

  function getCurrentToolState(){
    return normalizeRandomStudentState(getWidget?.()?.state);
  }

  function commitPatch(patch = {}, { renderPanel = false } = {}){
    updateWidget?.(patch, { renderPanel, sync: true });
  }

  function runAction(action, payload = {}, { renderAfter = true } = {}){
    const result = applyRandomStudentAction({
      action,
      payload,
      state: getCurrentToolState(),
      students: getCleanStudents()
    });

    if (!result) return;

    if (result.error) {
      showToast?.(result.error, { isError: true });
      if (renderAfter) render();
      return;
    }

    if (result.patch) {
      commitPatch(result.patch, { renderPanel: false });
    }

    if (result.message) {
      showToast?.(result.message, { isError: result.isError === true });
    }

    if (renderAfter) render();
  }

  function getProjectorState(){
    return createRandomStudentProjectorState({
      state: getCurrentToolState(),
      students: getCleanStudents()
    });
  }

  function drawStudent(){
    isForcedDrawPending = false;
    runAction("draw");
  }

  function resetDraw(){
    isForcedDrawPending = false;
    runAction("reset");
  }

  function adjustNameScale(delta){
    runAction("adjust-name-scale", { delta });
  }

  function toggleStudentInclusion(studentId, included){
    runAction("set-student-included", { studentId, included });
  }

  function toggleForcedDrawPending(){
    isForcedDrawPending = !isForcedDrawPending;
    render();
  }

  function forceDrawStudent(studentId){
    isForcedDrawPending = false;
    runAction("force-draw", { studentId });
  }

  function renderStudentTiles(students, state){
    if (!students.length) {
      return `<div class="tt-random-student-list-empty">Aucun élève dans la classe.</div>`;
    }

    const excludedStudentIds = new Set(state.excludedStudentIds);
    const drawnIds = new Set(state.drawnIds);

    return `
      <div class="tt-random-student-tile-grid">
        ${students.map((student) => {
          const isIncluded = !excludedStudentIds.has(student.id);
          const isDrawn = isIncluded && state.avoidRepeats && drawnIds.has(student.id);
          return `
            <button
              class="tt-random-student-tile${isIncluded ? " is-included" : " is-excluded"}${isDrawn ? " is-drawn" : ""}"
              type="button"
              data-random-student-toggle="${escapeHtml(student.id)}"
              aria-pressed="${isIncluded ? "true" : "false"}"
            >
              <span class="tt-random-student-tile-main">
                <strong>${escapeHtml(student.firstName)}</strong>
              </span>
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderInlineHistory(history, currentStudent){
    const currentStudentId = String(currentStudent?.id || "").trim();
    const recentHistory = (Array.isArray(history) ? history : [])
      .filter((student) => String(student?.id || "").trim() !== currentStudentId)
      .slice(0, 6);

    const historyItems = recentHistory.length
      ? recentHistory.map((student) => `
          <span class="tt-random-student-history-chip">${escapeHtml(student.firstName)}</span>
        `).join("")
      : `<span class="tt-random-student-history-empty-inline">Aucun tirage</span>`;

    return `
      <div class="tt-random-student-inline-history" aria-label="Derniers tirages">
        <span class="tt-random-student-inline-label">Derniers tirages :</span>
        ${historyItems}
        <span class="tt-random-student-history-more" aria-hidden="true">...</span>
      </div>
    `;
  }

  function render(){
    if (!host) return;

    const students = getCleanStudents();
    const state = getProjectorState();
    const canDraw = state.totalCount > 0;
    const currentName = state.currentStudent?.firstName || "—";
    const isNameScaleMin = state.nameScale <= NAME_SCALE_MIN;
    const isNameScaleMax = state.nameScale >= NAME_SCALE_MAX;

    host.innerHTML = `
      <section class="tt-control-panel tt-control-panel-compact" aria-label="Tirage au sort d’élève">
        <div class="tt-control-panel-head">
          <div>
            <h3>Tirage au sort d’élève</h3>
          </div>
        </div>

        <div class="tt-widget-action-bar" aria-label="Actions du widget">
          <button id="ttRandomStudentDraw" class="tt-widget-action-btn is-primary" type="button" ${canDraw ? "" : "disabled"}>
            <span class="dashboard-material-icon" aria-hidden="true">casino</span>
            <span>Tirer au sort</span>
          </button>
          <button id="ttRandomStudentForcedDraw" class="tt-widget-action-btn is-fake-draw${isForcedDrawPending ? " is-armed" : ""}" type="button" aria-pressed="${isForcedDrawPending ? "true" : "false"}" ${students.length ? "" : "disabled"}>
            <span class="dashboard-material-icon" aria-hidden="true">ads_click</span>
            <span>Tirage truqué</span>
          </button>
          <button id="ttRandomStudentReset" class="tt-widget-action-btn" type="button">
            <span class="dashboard-material-icon" aria-hidden="true">restart_alt</span>
            <span>Réinitialiser la liste</span>
          </button>
          <label class="tt-widget-action-toggle">
            <input id="ttRandomStudentAvoidRepeats" type="checkbox" ${state.avoidRepeats ? "checked" : ""}>
            <span class="tt-widget-action-toggle-track" aria-hidden="true"></span>
            <span>${state.avoidRepeats ? "Sans remise" : "Avec remise"}</span>
          </label>
          <button id="ttRandomStudentNameSmaller" class="tt-widget-action-btn" type="button" title="Diminuer la taille du prénom" aria-label="Diminuer la taille du prénom" ${isNameScaleMin ? "disabled" : ""}>
            <span class="dashboard-material-icon" aria-hidden="true">text_decrease</span>
            <span>Prénom -</span>
          </button>
          <button id="ttRandomStudentNameLarger" class="tt-widget-action-btn" type="button" title="Augmenter la taille du prénom" aria-label="Augmenter la taille du prénom" ${isNameScaleMax ? "disabled" : ""}>
            <span class="dashboard-material-icon" aria-hidden="true">text_increase</span>
            <span>Prénom +</span>
          </button>
        </div>

        <section class="tt-random-student-list-panel${isForcedDrawPending ? " is-force-draw-pending" : ""}" aria-labelledby="ttRandomStudentListTitle">
          <h4 id="ttRandomStudentListTitle">Liste des élèves : ${state.remainingCount} disponibles sur la liste de ${state.totalCount}.</h4>
          <p>Cliquez sur un élève pour l'inclure/l'exclure de la liste.</p>
          ${renderStudentTiles(students, state)}
        </section>

        <div class="tt-random-student-result-line" aria-live="polite">
          <span class="tt-random-student-result-label">Élève tiré au sort :</span>
          <strong class="tt-random-student-current-name">${escapeHtml(currentName)}</strong>
          ${renderInlineHistory(state.history, state.currentStudent)}
        </div>
      </section>
    `;

    host.querySelector("#ttRandomStudentAvoidRepeats")?.addEventListener("change", (event) => {
      runAction("set-avoid-repeats", {
        avoidRepeats: event.currentTarget.checked === true
      });
    });

    host.querySelectorAll("[data-random-student-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        if (isForcedDrawPending) {
          forceDrawStudent(button.dataset.randomStudentToggle);
          return;
        }
        toggleStudentInclusion(button.dataset.randomStudentToggle, button.getAttribute("aria-pressed") !== "true");
      });
    });

    host.querySelector("#ttRandomStudentDraw")?.addEventListener("click", drawStudent);
    host.querySelector("#ttRandomStudentForcedDraw")?.addEventListener("click", toggleForcedDrawPending);
    host.querySelector("#ttRandomStudentReset")?.addEventListener("click", resetDraw);
    host.querySelector("#ttRandomStudentNameSmaller")?.addEventListener("click", () => {
      adjustNameScale(-NAME_SCALE_STEP);
    });
    host.querySelector("#ttRandomStudentNameLarger")?.addEventListener("click", () => {
      adjustNameScale(NAME_SCALE_STEP);
    });
  }

  render();

  return {
    render,
    destroy(){
      if (host) host.innerHTML = "";
    }
  };
}
