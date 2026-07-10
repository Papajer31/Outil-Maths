import { escapeAttr, escapeHtml } from "../../../dashboard/text-utils.js";
import {
  GEOMETRY_INSTRUMENT_RULER_CLASSIC,
  GEOMETRY_INSTRUMENT_RULER_SIMPLE,
  GEOMETRY_INSTRUMENT_RULER_GRID,
  GEOMETRY_INSTRUMENT_SET_SQUARE_METAL,
  GEOMETRY_INSTRUMENT_SET_SQUARE_PLASTIC,
  RULER_LENGTH_UNITS_MAX,
  RULER_LENGTH_UNITS_MIN,
  RULER_UNIT_SIZE_MAX,
  RULER_UNIT_SIZE_MIN,
  SET_SQUARE_SIDE_MAX,
  SET_SQUARE_SIDE_MIN,
  applyGeometryInstrumentsAction,
  normalizeGeometryInstrumentsState
} from "./model.js";

function getRangeField({ id, label, value, min, max, step = 1, suffix = "" } = {}){
  return `
    <label class="tt-geometry-field tt-geometry-range-field" for="${escapeAttr(id)}">
      <span>${escapeHtml(label)}</span>
      <div class="tt-geometry-range-row">
        <input id="${escapeAttr(id)}" class="tt-geometry-range" type="range" min="${min}" max="${max}" step="${escapeAttr(step)}" value="${escapeAttr(value)}">
        <strong>${escapeHtml(value)}${escapeHtml(suffix)}</strong>
      </div>
    </label>
  `;
}

function getComingSoonToggle({ icon, label } = {}){
  return `
    <button class="tt-widget-action-btn tt-geometry-disabled-tool" type="button" disabled title="Prévu plus tard">
      <span class="dashboard-material-icon" aria-hidden="true">${escapeHtml(icon)}</span>
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function getGeometryOptionButton({ label, active, dataName, title } = {}){
  return `
    <button
      class="tt-widget-action-btn tt-geometry-option-btn${active ? " is-active" : ""}"
      type="button"
      ${escapeAttr(dataName)}="true"
      aria-pressed="${active ? "true" : "false"}"
      title="${escapeAttr(title || label)}"
    >${escapeHtml(label)}</button>
  `;
}

function getGeometryTypeButton({ type, label, active, dataName } = {}){
  return `
    <button
      class="tt-widget-action-btn tt-geometry-type-btn${active ? " is-active" : ""}"
      type="button"
      ${escapeAttr(dataName)}="${escapeAttr(type)}"
      aria-pressed="${active ? "true" : "false"}"
    >${escapeHtml(label)}</button>
  `;
}

export function createGeometryInstrumentsControlPanel({ host, getWidget, updateWidget, showToast } = {}){
  function getCurrentWidget(){
    return getWidget?.() || null;
  }

  function getCurrentState(){
    return normalizeGeometryInstrumentsState(getCurrentWidget()?.state);
  }

  function commit(action, payload = {}, { renderAfter = true } = {}){
    const result = applyGeometryInstrumentsAction({
      action,
      payload,
      state: getCurrentState()
    });
    if (!result) return;
    if (result.error) {
      showToast?.(String(result.error), { isError: true });
      return;
    }
    if (result.patch) updateWidget?.(result.patch, { renderPanel: renderAfter, sync: true });
  }

  function render(){
    if (!host) return;
    const state = getCurrentState();
    const ruler = state.ruler;
    const setSquare = state.setSquare;

    host.innerHTML = `
      <section class="tt-control-panel tt-control-panel-compact tt-geometry-control" aria-label="Contrôles des instruments de géométrie">
        <div class="tt-control-panel-head">
          <div>
            <h3>Instruments de géométrie</h3>
          </div>
        </div>

        <div class="tt-geometry-form">
          <section class="tt-geometry-section">
            <div class="tt-geometry-section-title">
              <span class="dashboard-material-icon" aria-hidden="true">architecture</span>
              <span>Instruments</span>
            </div>
            <div class="tt-geometry-tool-row">
              <label class="tt-widget-action-toggle tt-geometry-ruler-toggle">
                <input id="ttGeometryRulerEnabled" type="checkbox" ${ruler.enabled ? "checked" : ""}>
                <span class="tt-widget-action-toggle-track" aria-hidden="true"></span>
                <span>Règle</span>
              </label>
              <label class="tt-widget-action-toggle tt-geometry-set-square-toggle">
                <input id="ttGeometrySetSquareEnabled" type="checkbox" ${setSquare.enabled ? "checked" : ""}>
                <span class="tt-widget-action-toggle-track" aria-hidden="true"></span>
                <span>Équerre</span>
              </label>
              ${getComingSoonToggle({ icon: "radio_button_unchecked", label: "Compas" })}
              ${getComingSoonToggle({ icon: "motion_photos_on", label: "Rapporteur" })}
            </div>
          </section>

          <section class="tt-geometry-section${ruler.enabled ? "" : " is-disabled"}">
            <div class="tt-geometry-section-title">
              <span class="dashboard-material-icon" aria-hidden="true">straighten</span>
              <span>Règle</span>
            </div>
            <div class="tt-widget-action-bar tt-geometry-style-row tt-geometry-ruler-types" aria-label="Options et type de règle">
              ${getGeometryOptionButton({ label: "Angle", active: ruler.showAnglePill, dataName: "data-ruler-angle-pill-toggle", title: "Afficher la pastille d’angle de la règle" })}
              <span class="tt-geometry-style-divider" aria-hidden="true"></span>
              ${getGeometryTypeButton({ type: GEOMETRY_INSTRUMENT_RULER_CLASSIC, label: "Classique", active: ruler.type === GEOMETRY_INSTRUMENT_RULER_CLASSIC, dataName: "data-ruler-type" })}
              ${getGeometryTypeButton({ type: GEOMETRY_INSTRUMENT_RULER_SIMPLE, label: "Simple", active: ruler.type === GEOMETRY_INSTRUMENT_RULER_SIMPLE, dataName: "data-ruler-type" })}
              ${getGeometryTypeButton({ type: GEOMETRY_INSTRUMENT_RULER_GRID, label: "Quadrillée", active: ruler.type === GEOMETRY_INSTRUMENT_RULER_GRID, dataName: "data-ruler-type" })}
            </div>
            <div class="tt-geometry-range-grid">
              ${getRangeField({
                id: "ttGeometryRulerUnitSize",
                label: "Écart 0 → 1",
                value: ruler.unitSize,
                min: RULER_UNIT_SIZE_MIN,
                max: RULER_UNIT_SIZE_MAX,
                step: 1,
                suffix: " px"
              })}
              ${getRangeField({
                id: "ttGeometryRulerLength",
                label: "Longueur",
                value: ruler.lengthUnits,
                min: RULER_LENGTH_UNITS_MIN,
                max: RULER_LENGTH_UNITS_MAX,
                step: 0.25,
                suffix: " u"
              })}
            </div>
          </section>

          <section class="tt-geometry-section${setSquare.enabled ? "" : " is-disabled"}">
            <div class="tt-geometry-section-title">
              <span class="dashboard-material-icon" aria-hidden="true">change_history</span>
              <span>Équerre</span>
            </div>
            <div class="tt-widget-action-bar tt-geometry-style-row tt-geometry-set-square-types" aria-label="Options et type d’équerre">
              ${getGeometryOptionButton({ label: "Angle", active: setSquare.showAnglePill, dataName: "data-set-square-angle-pill-toggle", title: "Afficher la pastille d’angle de l’équerre" })}
              ${getGeometryOptionButton({ label: "90°", active: setSquare.showRightAngleMark, dataName: "data-set-square-angle-mark-toggle", title: "Afficher le marquage de l’angle droit" })}
              <span class="tt-geometry-style-divider" aria-hidden="true"></span>
              ${getGeometryTypeButton({ type: GEOMETRY_INSTRUMENT_SET_SQUARE_PLASTIC, label: "Plastique", active: setSquare.type === GEOMETRY_INSTRUMENT_SET_SQUARE_PLASTIC, dataName: "data-set-square-type" })}
              ${getGeometryTypeButton({ type: GEOMETRY_INSTRUMENT_SET_SQUARE_METAL, label: "Métal", active: setSquare.type === GEOMETRY_INSTRUMENT_SET_SQUARE_METAL, dataName: "data-set-square-type" })}
            </div>
            <div class="tt-geometry-range-grid">
              ${getRangeField({
                id: "ttGeometrySetSquareHorizontal",
                label: "Côté horizontal",
                value: setSquare.horizontalLength,
                min: SET_SQUARE_SIDE_MIN,
                max: SET_SQUARE_SIDE_MAX,
                step: 1,
                suffix: " px"
              })}
              ${getRangeField({
                id: "ttGeometrySetSquareVertical",
                label: "Côté vertical",
                value: setSquare.verticalLength,
                min: SET_SQUARE_SIDE_MIN,
                max: SET_SQUARE_SIDE_MAX,
                step: 1,
                suffix: " px"
              })}
            </div>
          </section>
        </div>
      </section>
    `;

    host.querySelector("#ttGeometryRulerEnabled")?.addEventListener("change", (event) => {
      commit("set-ruler", { enabled: event.currentTarget.checked });
    });

    host.querySelector("#ttGeometrySetSquareEnabled")?.addEventListener("change", (event) => {
      commit("set-set-square", { enabled: event.currentTarget.checked });
    });

    host.querySelectorAll("[data-ruler-type]").forEach((button) => {
      button.addEventListener("click", () => {
        commit("set-ruler", { type: button.dataset.rulerType });
      });
    });

    host.querySelector("[data-ruler-angle-pill-toggle]")?.addEventListener("click", () => {
      commit("set-ruler", { showAnglePill: !getCurrentState().ruler.showAnglePill });
    });

    host.querySelectorAll("[data-set-square-type]").forEach((button) => {
      button.addEventListener("click", () => {
        commit("set-set-square", { type: button.dataset.setSquareType });
      });
    });

    host.querySelector("[data-set-square-angle-pill-toggle]")?.addEventListener("click", () => {
      commit("set-set-square", { showAnglePill: !getCurrentState().setSquare.showAnglePill });
    });

    host.querySelector("[data-set-square-angle-mark-toggle]")?.addEventListener("click", () => {
      commit("set-set-square", { showRightAngleMark: !getCurrentState().setSquare.showRightAngleMark });
    });

    host.querySelector("#ttGeometryRulerUnitSize")?.addEventListener("input", (event) => {
      commit("set-ruler-unit-size", { unitSize: event.currentTarget.value }, { renderAfter: false });
      const value = event.currentTarget.parentElement?.querySelector?.("strong");
      if (value) value.textContent = `${event.currentTarget.value} px`;
      const lengthInput = host.querySelector("#ttGeometryRulerLength");
      const lengthValue = lengthInput?.parentElement?.querySelector?.("strong");
      const nextLengthUnits = getCurrentState().ruler.lengthUnits;
      if (lengthInput) lengthInput.value = String(nextLengthUnits);
      if (lengthValue) lengthValue.textContent = `${nextLengthUnits} u`;
    });

    host.querySelector("#ttGeometryRulerLength")?.addEventListener("input", (event) => {
      commit("resize-ruler", { lengthUnits: event.currentTarget.value }, { renderAfter: false });
      const value = event.currentTarget.parentElement?.querySelector?.("strong");
      if (value) value.textContent = `${event.currentTarget.value} u`;
    });

    const commitSetSquareSize = () => {
      const horizontal = host.querySelector("#ttGeometrySetSquareHorizontal")?.value;
      const vertical = host.querySelector("#ttGeometrySetSquareVertical")?.value;
      commit("resize-set-square", { horizontalLength: horizontal, verticalLength: vertical }, { renderAfter: false });
    };

    host.querySelector("#ttGeometrySetSquareHorizontal")?.addEventListener("input", (event) => {
      commitSetSquareSize();
      const value = event.currentTarget.parentElement?.querySelector?.("strong");
      if (value) value.textContent = `${event.currentTarget.value} px`;
    });

    host.querySelector("#ttGeometrySetSquareVertical")?.addEventListener("input", (event) => {
      commitSetSquareSize();
      const value = event.currentTarget.parentElement?.querySelector?.("strong");
      if (value) value.textContent = `${event.currentTarget.value} px`;
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
