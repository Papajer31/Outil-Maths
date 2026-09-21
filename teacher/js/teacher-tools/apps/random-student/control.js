import {
  RESULT_SCALE_MAX,
  RESULT_SCALE_MIN,
  RESULT_SCALE_STEP,
  applyRandomDrawAction,
  createRandomDrawProjectorState,
  normalizeRandomDrawState,
  parseRandomDrawItems
} from "./model.js";
import { escapeHtml } from "../../../dashboard/text-utils.js";

function getStudentFirstNames(students){
  return (Array.isArray(students) ? students : [])
    .slice()
    .sort((a, b) => (Number(a?.display_order) || 0) - (Number(b?.display_order) || 0))
    .map((student) => String(student?.first_name || student?.firstName || "").trim())
    .filter(Boolean);
}

function renderInlineHistory(history = [], currentItem){
  const currentId = String(currentItem?.id || "").trim();
  const items = (Array.isArray(history) ? history : [])
    .filter((entry) => String(entry?.id || "").trim() !== currentId)
    .slice(0, 6);

  const historyItems = items.length
    ? items.map((entry) => `<span class="tt-random-draw-history-chip">${escapeHtml(entry.label)}</span>`).join("")
    : `<span class="tt-random-draw-history-empty-inline">Aucun tirage</span>`;

  return `
    <div class="tt-random-draw-inline-history" aria-label="Derniers tirages">
      <span class="tt-random-draw-inline-label">Derniers tirages :</span>
      ${historyItems}
      <span class="tt-random-draw-history-more" aria-hidden="true">...</span>
    </div>`;
}

function renderItemTiles(state, isForcedDrawPending){
  if (!state.items.length) {
    return `<div class="tt-random-draw-list-empty">Ajoute des éléments dans la liste ci-dessus.</div>`;
  }

  const excluded = new Set(state.excludedItemIds);
  const drawn = new Set(state.drawnIds);

  return `
    <div class="tt-random-draw-tile-grid">
      ${state.items.map((item) => {
        const isIncluded = !excluded.has(item.id);
        const isDrawn = isIncluded && state.avoidRepeats && drawn.has(item.id);
        const disabled = isForcedDrawPending && !isIncluded;
        return `
          <button
            class="tt-random-draw-tile${isIncluded ? " is-included" : " is-excluded"}${isDrawn ? " is-drawn" : ""}"
            type="button"
            data-random-draw-item="${escapeHtml(item.id)}"
            aria-pressed="${isIncluded ? "true" : "false"}"
            ${disabled ? "disabled" : ""}
          >
            <span class="tt-random-draw-tile-main"><strong>${escapeHtml(item.label)}</strong></span>
          </button>`;
      }).join("")}
    </div>`;
}

export function createRandomStudentControlPanel({ host, getWidget, updateWidget, getStudents, showToast } = {}){
  let isForcedDrawPending = false;

  function getCurrentState(){
    return normalizeRandomDrawState(getWidget?.()?.state);
  }

  function runAction(action, payload = {}, { renderAfter = true } = {}){
    const result = applyRandomDrawAction({ action, payload, state: getCurrentState() });
    if (!result) return null;
    if (result.error) {
      showToast?.(result.error, { isError: true });
      if (renderAfter) render();
      return result;
    }
    if (result.patch) updateWidget?.(result.patch, { renderPanel: false, sync: true });
    if (result.message) showToast?.(result.message, { isError: result.isError === true });
    if (renderAfter) render();
    return result;
  }

  function fillWithStudents(){
    const names = getStudentFirstNames(getStudents?.());
    if (!names.length) {
      showToast?.("Aucun élève n’est disponible dans la classe.", { isError: true });
      return;
    }
    isForcedDrawPending = false;
    runAction("set-items-text", { text: names.join("\n") });
  }

  function draw(){
    isForcedDrawPending = false;
    runAction("draw");
  }

  function reset(){
    isForcedDrawPending = false;
    runAction("reset");
  }

  function toggleForcedDraw(){
    isForcedDrawPending = !isForcedDrawPending;
    render();
  }

  function forceDraw(itemId){
    isForcedDrawPending = false;
    runAction("force-draw", { itemId });
  }

  function toggleItem(itemId, included){
    runAction("set-item-included", { itemId, included });
  }

  function render(){
    if (!host) return;
    const state = createRandomDrawProjectorState({ state: getCurrentState() });
    const studentNames = getStudentFirstNames(getStudents?.());
    const canDraw = state.totalCount > 0;
    const currentLabel = state.currentItem?.label || "—";
    const isScaleMin = state.resultScale <= RESULT_SCALE_MIN;
    const isScaleMax = state.resultScale >= RESULT_SCALE_MAX;

    host.innerHTML = `
      <section class="tt-control-panel tt-control-panel-compact tt-random-draw-control" aria-label="Tirage au sort">
        <div class="tt-control-panel-head">
          <div><h3>Tirage au sort</h3></div>
        </div>

        <div class="tt-widget-action-bar" aria-label="Actions du tirage au sort">
          <button id="ttRandomDrawNow" class="tt-widget-action-btn is-primary" type="button" ${canDraw ? "" : "disabled"}>
            <span class="dashboard-material-icon" aria-hidden="true">casino</span><span>Tirer au sort</span>
          </button>
          <button id="ttRandomDrawForced" class="tt-widget-action-btn is-fake-draw${isForcedDrawPending ? " is-armed" : ""}" type="button" aria-pressed="${isForcedDrawPending ? "true" : "false"}" ${canDraw ? "" : "disabled"}>
            <span class="dashboard-material-icon" aria-hidden="true">ads_click</span><span>Tirage truqué</span>
          </button>
          <button id="ttRandomDrawReset" class="tt-widget-action-btn" type="button" ${state.sourceCount ? "" : "disabled"}>
            <span class="dashboard-material-icon" aria-hidden="true">restart_alt</span><span>Réinitialiser</span>
          </button>
          <label class="tt-widget-action-toggle">
            <input id="ttRandomDrawAvoidRepeats" type="checkbox" ${state.avoidRepeats ? "checked" : ""}>
            <span class="tt-widget-action-toggle-track" aria-hidden="true"></span>
            <span>${state.avoidRepeats ? "Sans remise" : "Avec remise"}</span>
          </label>
          <button id="ttRandomDrawTextSmaller" class="tt-widget-action-btn" type="button" title="Diminuer la taille du texte" aria-label="Diminuer la taille du texte" ${isScaleMin ? "disabled" : ""}>
            <span class="dashboard-material-icon" aria-hidden="true">text_decrease</span><span>Texte −</span>
          </button>
          <button id="ttRandomDrawTextLarger" class="tt-widget-action-btn" type="button" title="Augmenter la taille du texte" aria-label="Augmenter la taille du texte" ${isScaleMax ? "disabled" : ""}>
            <span class="dashboard-material-icon" aria-hidden="true">text_increase</span><span>Texte +</span>
          </button>
        </div>

        <section class="tt-random-draw-source-panel" aria-labelledby="ttRandomDrawSourceTitle">
          <div class="tt-random-draw-source-head">
            <div>
              <h4 id="ttRandomDrawSourceTitle">Liste à tirer</h4>
              <p>Une ligne correspond à un élément.</p>
            </div>
            <button id="ttRandomDrawStudents" class="tt-widget-action-btn" type="button" ${studentNames.length ? "" : "disabled"}>
              <span class="dashboard-material-icon" aria-hidden="true">format_list_bulleted</span><span>Mes élèves</span>
            </button>
          </div>
          <textarea id="ttRandomDrawItems" rows="5" spellcheck="false" placeholder="Un élément par ligne…">${escapeHtml(state.itemsText)}</textarea>
        </section>

        <section class="tt-random-draw-list-panel${isForcedDrawPending ? " is-force-draw-pending" : ""}" aria-labelledby="ttRandomDrawListTitle">
          <h4 id="ttRandomDrawListTitle">Liste : ${state.remainingCount} disponible${state.remainingCount > 1 ? "s" : ""} sur ${state.totalCount} actif${state.totalCount > 1 ? "s" : ""}.</h4>
          <p>${isForcedDrawPending ? "Tirage truqué : clique sur l’élément qui doit sortir." : "Clique sur un élément pour l’activer ou le désactiver."}</p>
          ${renderItemTiles(state, isForcedDrawPending)}
        </section>

        <div class="tt-random-draw-result-line" aria-live="polite">
          <span class="tt-random-draw-result-label">Élément tiré :</span>
          <strong class="tt-random-draw-current-name">${escapeHtml(currentLabel)}</strong>
          ${renderInlineHistory(state.history, state.currentItem)}
        </div>
      </section>`;

    const textarea = host.querySelector("#ttRandomDrawItems");
    textarea?.addEventListener("input", () => {
      const count = parseRandomDrawItems(textarea.value).length;
      const drawButton = host.querySelector("#ttRandomDrawNow");
      const forcedButton = host.querySelector("#ttRandomDrawForced");
      const resetButton = host.querySelector("#ttRandomDrawReset");
      if (drawButton) drawButton.disabled = count === 0;
      if (forcedButton) forcedButton.disabled = count === 0;
      if (resetButton) resetButton.disabled = count === 0;
    });
    textarea?.addEventListener("change", () => runAction("set-items-text", { text: textarea.value }));
    textarea?.addEventListener("blur", () => {
      if (textarea.value !== getCurrentState().itemsText) runAction("set-items-text", { text: textarea.value });
    });

    host.querySelector("#ttRandomDrawStudents")?.addEventListener("click", fillWithStudents);
    host.querySelector("#ttRandomDrawNow")?.addEventListener("click", draw);
    host.querySelector("#ttRandomDrawForced")?.addEventListener("click", toggleForcedDraw);
    host.querySelector("#ttRandomDrawReset")?.addEventListener("click", reset);
    host.querySelector("#ttRandomDrawAvoidRepeats")?.addEventListener("change", (event) => {
      isForcedDrawPending = false;
      runAction("set-avoid-repeats", { avoidRepeats: event.currentTarget.checked === true });
    });
    host.querySelector("#ttRandomDrawTextSmaller")?.addEventListener("click", () => runAction("adjust-result-scale", { delta: -RESULT_SCALE_STEP }));
    host.querySelector("#ttRandomDrawTextLarger")?.addEventListener("click", () => runAction("adjust-result-scale", { delta: RESULT_SCALE_STEP }));

    host.querySelectorAll("[data-random-draw-item]").forEach((button) => {
      button.addEventListener("click", () => {
        const itemId = button.dataset.randomDrawItem;
        const isIncluded = button.getAttribute("aria-pressed") === "true";
        if (isForcedDrawPending) {
          if (!isIncluded) return;
          forceDraw(itemId);
          return;
        }
        toggleItem(itemId, !isIncluded);
      });
    });
  }

  render();
  return {
    render,
    destroy(){ if (host) host.innerHTML = ""; }
  };
}
