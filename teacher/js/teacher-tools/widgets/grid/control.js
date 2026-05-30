import {
  GRID_BACKGROUND_COLOR,
  GRID_BACKGROUND_TRANSPARENT,
  GRID_COLUMNS_MAX,
  GRID_COLUMNS_MIN,
  GRID_LINE_WIDTH_MAX,
  GRID_LINE_WIDTH_MIN,
  GRID_ROWS_MAX,
  GRID_ROWS_MIN,
  applyGridAction,
  normalizeGridState
} from "./model.js";
import { escapeAttr, escapeHtml } from "../../../dashboard/text-utils.js";
import { createColorPicker } from "../../../../../shared/color-picker.js";

function renderNumberStepper({ id, label, value, min, max } = {}){
  const safeId = String(id || "").trim();
  const safeValue = Number(value);
  const isMin = Number.isFinite(safeValue) && safeValue <= min;
  const isMax = Number.isFinite(safeValue) && safeValue >= max;
  const inputId = `ttGrid${safeId.charAt(0).toUpperCase()}${safeId.slice(1)}`;

  return `
    <div class="tt-grid-stepper-field">
      <span class="tt-grid-stepper-label">${escapeHtml(label)}</span>
      <div class="tv-stepper tv-stepper-no-inline-label tt-grid-stepper">
        <button
          class="tv-stepper-btn"
          type="button"
          data-grid-step-target="${escapeAttr(safeId)}"
          data-grid-step-delta="-1"
          aria-label="Diminuer ${escapeAttr(label)}"
          ${isMin ? "disabled" : ""}
        >
          <span class="tv-stepper-icon" aria-hidden="true">remove</span>
        </button>
        <input
          id="${escapeAttr(inputId)}"
          class="tv-input tv-input-stepper"
          type="number"
          min="${min}"
          max="${max}"
          step="1"
          value="${escapeAttr(value)}"
          inputmode="numeric"
          aria-label="${escapeAttr(label)}"
        >
        <button
          class="tv-stepper-btn"
          type="button"
          data-grid-step-target="${escapeAttr(safeId)}"
          data-grid-step-delta="1"
          aria-label="Augmenter ${escapeAttr(label)}"
          ${isMax ? "disabled" : ""}
        >
          <span class="tv-stepper-icon" aria-hidden="true">add</span>
        </button>
      </div>
    </div>
  `;
}

function renderColorPickerSlot({ id, label } = {}){
  return `
    <div class="tt-grid-color-control">
      <div id="${escapeAttr(id)}" class="tt-grid-color-picker-slot"></div>
    </div>
  `;
}

function getBackgroundPickerValue(state){
  return state.background === GRID_BACKGROUND_TRANSPARENT
    ? "rgba(255, 255, 255, 0)"
    : state.backgroundColor;
}

export function createGridControlPanel({ host, getWidget, updateWidget, showToast } = {}){
  function getCurrentWidget(){
    return getWidget?.() || null;
  }

  function getCurrentState(){
    return normalizeGridState(getCurrentWidget()?.state);
  }

  function commitGridPatch(partialState = {}, { renderAfter = true } = {}){
    const result = applyGridAction({
      action: "set-grid",
      payload: partialState,
      state: getCurrentState()
    });
    if (!result) return;
    if (result.error) {
      showToast?.(String(result.error), { isError: true });
      return;
    }
    const patch = result.patch && typeof result.patch === "object" ? result.patch : null;
    if (patch) updateWidget?.(patch, { renderPanel: renderAfter, sync: true });
  }

  function render(){
    if (!host) return;
    const state = getCurrentState();

    host.innerHTML = `
      <section class="tt-control-panel tt-control-panel-compact tt-grid-control" aria-label="Contrôles du widget Grille">
        <div class="tt-control-panel-head">
          <div>
            <h3>Grille</h3>
          </div>
        </div>

        <div class="tt-grid-form">
          <section class="tt-grid-settings-section tt-grid-structure-section" aria-label="Structure de la grille">
            <div class="tt-grid-section-title">
              <span class="dashboard-material-icon" aria-hidden="true">grid_view</span>
              <span>Structure</span>
            </div>
            <div class="tt-grid-number-grid">
              ${renderNumberStepper({
                id: "rows",
                label: "Lignes",
                value: state.rows,
                min: GRID_ROWS_MIN,
                max: GRID_ROWS_MAX
              })}
              ${renderNumberStepper({
                id: "columns",
                label: "Colonnes",
                value: state.columns,
                min: GRID_COLUMNS_MIN,
                max: GRID_COLUMNS_MAX
              })}
              ${renderNumberStepper({
                id: "lineWidth",
                label: "Épaisseur",
                value: state.lineWidth,
                min: GRID_LINE_WIDTH_MIN,
                max: GRID_LINE_WIDTH_MAX
              })}
            </div>
          </section>

          <section class="tt-grid-settings-section tt-grid-appearance-section" aria-label="Apparence de la grille">
            <div class="tt-grid-section-title">
              <span class="dashboard-material-icon" aria-hidden="true">palette</span>
              <span>Apparence</span>
            </div>
            <div class="tt-grid-color-grid">
              ${renderColorPickerSlot({ id: "ttGridLineColorPicker", label: "Lignes" })}
              ${renderColorPickerSlot({ id: "ttGridBackgroundColorPicker", label: "Fond" })}
            </div>
          </section>

        </div>
      </section>
    `;

    const commitNumberInputs = () => {
      commitGridPatch({
        rows: host.querySelector("#ttGridRows")?.value,
        columns: host.querySelector("#ttGridColumns")?.value,
        lineWidth: host.querySelector("#ttGridLineWidth")?.value
      });
    };

    host.querySelector("#ttGridRows")?.addEventListener("change", commitNumberInputs);
    host.querySelector("#ttGridColumns")?.addEventListener("change", commitNumberInputs);
    host.querySelector("#ttGridLineWidth")?.addEventListener("change", commitNumberInputs);
    host.querySelectorAll("[data-grid-step-target]").forEach((button) => {
      button.addEventListener("click", () => {
        const target = String(button.dataset.gridStepTarget || "").trim();
        const delta = Number(button.dataset.gridStepDelta) || 0;
        const currentState = getCurrentState();
        if (!Object.prototype.hasOwnProperty.call(currentState, target)) return;
        commitGridPatch({ [target]: Number(currentState[target]) + delta });
      });
    });
    createColorPicker({
      host: host.querySelector("#ttGridLineColorPicker"),
      value: state.lineColor,
      label: "Lignes",
      headerLabel: "",
      popup: true,
      onChange(value){
        commitGridPatch({ lineColor: value }, { renderAfter: false });
      }
    });
    createColorPicker({
      host: host.querySelector("#ttGridBackgroundColorPicker"),
      value: getBackgroundPickerValue(state),
      label: "Fond",
      headerLabel: "",
      popup: true,
      onChange(value){
        commitGridPatch({
          background: GRID_BACKGROUND_COLOR,
          backgroundColor: value
        }, { renderAfter: false });
      }
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
