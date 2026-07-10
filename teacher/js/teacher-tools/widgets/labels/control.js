import {
  LABELS_BORDER_RADIUS_MAX,
  LABELS_BORDER_RADIUS_MIN,
  LABELS_BORDER_WIDTH_MAX,
  LABELS_BORDER_WIDTH_MIN,
  LABELS_FONT_ANDIKA,
  LABELS_FONT_BELLEALLURE,
  LABELS_FONT_SIZE_MAX,
  LABELS_FONT_SIZE_MIN,
  LABELS_FONT_SYSTEM,
  LABELS_MAX_LABELS,
  applyLabelsAction,
  getLabelsFontFamilyCss,
  normalizeLabelsState
} from "./model.js";
import { escapeAttr, escapeHtml } from "../../../dashboard/text-utils.js";
import { createColorPicker } from "../../../../../shared/color-picker.js";

function renderNumberStepper({ id, target, label, value, min, max } = {}){
  const safeValue = Number(value);
  const isMin = Number.isFinite(safeValue) && safeValue <= min;
  const isMax = Number.isFinite(safeValue) && safeValue >= max;

  return `
    <div class="tt-labels-stepper-field">
      <span class="tt-labels-stepper-label">${escapeHtml(label)}</span>
      <div class="tv-stepper tv-stepper-no-inline-label tt-labels-stepper">
        <button
          class="tv-stepper-btn"
          type="button"
          data-labels-step-target="${escapeAttr(target)}"
          data-labels-step-delta="-1"
          aria-label="Diminuer ${escapeAttr(label)}"
          ${isMin ? "disabled" : ""}
        >
          <span class="tv-stepper-icon" aria-hidden="true">remove</span>
        </button>
        <input
          id="${escapeAttr(id)}"
          class="tv-input tv-input-stepper"
          type="number"
          min="${min}"
          max="${max}"
          step="1"
          inputmode="numeric"
          value="${escapeAttr(value)}"
          aria-label="${escapeAttr(label)}"
          data-labels-number-target="${escapeAttr(target)}"
        >
        <button
          class="tv-stepper-btn"
          type="button"
          data-labels-step-target="${escapeAttr(target)}"
          data-labels-step-delta="1"
          aria-label="Augmenter ${escapeAttr(label)}"
          ${isMax ? "disabled" : ""}
        >
          <span class="tv-stepper-icon" aria-hidden="true">add</span>
        </button>
      </div>
    </div>
  `;
}

function renderColorPickerSlot({ id } = {}){
  return `
    <div class="tt-labels-color-control">
      <div id="${escapeAttr(id)}" class="tt-labels-color-picker-slot"></div>
    </div>
  `;
}

function renderLabelStyle(style){
  const isBelleAllure = style.fontFamily === LABELS_FONT_BELLEALLURE;
  const paddingX = Math.max(0, Number(style.paddingX) || 0) + (isBelleAllure ? 8 : 0);
  const paddingY = Math.max(0, Number(style.paddingY) || 0) + (isBelleAllure ? 7 : 0);
  const lineHeight = isBelleAllure ? 2 : 1.1;
  return [
    `font-family:${getLabelsFontFamilyCss(style.fontFamily)}`,
    `font-size:${Math.max(1, Number(style.fontSize) || 34)}px`,
    `color:${style.textColor}`,
    `--tt-labels-colored-text-color:${style.coloredTextColor}`,
    `background:${style.backgroundColor}`,
    `border:${Math.max(0, Number(style.borderWidth) || 0)}px solid ${style.borderColor}`,
    `border-radius:${Math.max(0, Number(style.borderRadius) || 0)}px`,
    `padding:${paddingY}px ${paddingX}px`,
    `line-height:${lineHeight}`,
    style.shadow ? "box-shadow:4px 5px 8px rgba(15,23,42,.28)" : "box-shadow:none"
  ].join(";");
}

export function createLabelsControlPanel({ host, getWidget, updateWidget, showToast } = {}){
  let markupHelpPointerHandler = null;
  let markupHelpKeyHandler = null;

  function getCurrentState(){
    return normalizeLabelsState(getWidget?.()?.state);
  }

  function commitAction(action, payload = {}, { renderAfter = true } = {}){
    const result = applyLabelsAction({
      action,
      payload,
      state: getCurrentState()
    });
    if (!result) return;
    if (result.error) {
      showToast?.(String(result.error), { isError: true });
      return;
    }
    const patch = result.patch && typeof result.patch === "object" ? result.patch : null;
    if (patch) updateWidget?.(patch, { renderPanel: renderAfter, sync: true });
    if (result.message) showToast?.(String(result.message), { isError: result.isError === true });
  }

  function commitLines(){
    commitAction("set-lines", {
      text: host?.querySelector("#ttLabelsText")?.value || ""
    });
  }

  function syncPreview(style = getCurrentState().style){
    const preview = host?.querySelector("#ttLabelsPreview");
    if (!preview) return;
    preview.setAttribute("style", renderLabelStyle(style));
  }

  function commitStylePatch(partialStyle = {}, { renderAfter = true } = {}){
    const nextStyle = {
      ...getCurrentState().style,
      ...(partialStyle && typeof partialStyle === "object" ? partialStyle : {})
    };
    syncPreview(nextStyle);
    commitAction("set-style", partialStyle, { renderAfter });
  }

  function closeMarkupHelpPopup(){
    const popup = host?.querySelector("#ttLabelsMarkupHelpPopup");
    const button = host?.querySelector("#ttLabelsMarkupHelp");
    if (!popup || !button) return;
    popup.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  function cleanupMarkupHelpListeners(){
    if (markupHelpPointerHandler) {
      document.removeEventListener("pointerdown", markupHelpPointerHandler);
      markupHelpPointerHandler = null;
    }
    if (markupHelpKeyHandler) {
      document.removeEventListener("keydown", markupHelpKeyHandler);
      markupHelpKeyHandler = null;
    }
  }

  function bindMarkupHelpPopup(){
    cleanupMarkupHelpListeners();
    const wrapper = host?.querySelector(".tt-labels-markup-help-wrap");
    const popup = host?.querySelector("#ttLabelsMarkupHelpPopup");
    const button = host?.querySelector("#ttLabelsMarkupHelp");
    if (!wrapper || !popup || !button) return;

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const nextOpen = popup.hidden;
      popup.hidden = !nextOpen;
      button.setAttribute("aria-expanded", String(nextOpen));
    });

    markupHelpPointerHandler = (event) => {
      const target = event.target;
      if (target instanceof Node && !wrapper.contains(target)) closeMarkupHelpPopup();
    };
    markupHelpKeyHandler = (event) => {
      if (event.key === "Escape") closeMarkupHelpPopup();
    };
    document.addEventListener("pointerdown", markupHelpPointerHandler);
    document.addEventListener("keydown", markupHelpKeyHandler);
  }

  function render(){
    if (!host) return;
    const state = getCurrentState();
    const style = state.style;
    const count = state.items.length;

    host.innerHTML = `
      <section class="tt-control-panel tt-control-panel-compact tt-labels-control" aria-label="Contrôles du widget Étiquettes">
        <div class="tt-control-panel-head">
          <div class="tt-labels-heading-row">
            <h3>Étiquettes</h3>
            <span class="tt-labels-count">${count} / ${LABELS_MAX_LABELS} étiquette${count > 1 ? "s" : ""} sur la scène</span>
          </div>
        </div>

        <div class="tt-widget-action-bar tt-labels-action-bar" aria-label="Actions du widget">
          <button id="ttLabelsApplyText" class="tt-widget-action-btn is-primary" type="button">
            <span class="dashboard-material-icon" aria-hidden="true">check</span>
            <span>Mettre à jour</span>
          </button>
          <button id="ttLabelsDemoText" class="tt-widget-action-btn" type="button">
            <span class="dashboard-material-icon" aria-hidden="true">text_snippet</span>
            <span>Mots de démo</span>
          </button>
          <button id="ttLabelsShuffleContent" class="tt-widget-action-btn" type="button" ${count > 1 ? "" : "disabled"}>
            <span class="dashboard-material-icon" aria-hidden="true">shuffle</span>
            <span>Mélanger</span>
          </button>
          <button id="ttLabelsAlign" class="tt-widget-action-btn" type="button" ${count ? "" : "disabled"}>
            <span class="dashboard-material-icon" aria-hidden="true">format_align_left</span>
            <span>Aligner</span>
          </button>
          <button id="ttLabelsRandomPositions" class="tt-widget-action-btn" type="button" ${count ? "" : "disabled"}>
            <span class="dashboard-material-icon" aria-hidden="true">scatter_plot</span>
            <span>Positions aléatoires</span>
          </button>
          <button id="ttLabelsClearAll" class="tt-widget-action-btn is-danger" type="button" ${count ? "" : "disabled"}>
            <span class="dashboard-material-icon" aria-hidden="true">delete</span>
            <span>Tout supprimer</span>
          </button>
        </div>

        <div class="tt-labels-panel-grid">
          <section class="tt-labels-section tt-labels-text-section" aria-label="Texte des étiquettes">
            <div class="tt-labels-section-head">
              <div class="tt-labels-section-title">
                <span class="dashboard-material-icon" aria-hidden="true">format_list_bulleted</span>
                <span>Texte</span>
                <div class="tt-labels-markup-help-wrap">
                  <button
                    id="ttLabelsMarkupHelp"
                    class="tt-labels-markup-help-btn"
                    type="button"
                    aria-label="Aide mini-langage"
                    aria-expanded="false"
                  >?</button>
                  <div id="ttLabelsMarkupHelpPopup" class="tt-labels-markup-help-popup" role="dialog" aria-label="Mini-langage" hidden>
                    <div class="tt-labels-markup-help-title">Mini-langage</div>
                    <div class="tt-labels-markup-help-list">
                      <div><code>Ligne</code><span>une ligne = une étiquette</span></div>
                      <div><code>§</code><span>retour ligne</span></div>
                      <div><code>*mot*</code><span>gras</span></div>
                      <div><code>_mot_</code><span>italique</span></div>
                      <div><code>[mot]</code><span>couleur</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <textarea id="ttLabelsText" class="tt-labels-textarea" rows="8" spellcheck="false" placeholder="Saisir les étiquettes">${escapeHtml(state.text)}</textarea>
          </section>

          <section class="tt-labels-section tt-labels-style-section" aria-label="Apparence des étiquettes">
            <div class="tt-labels-section-title">
              <span class="dashboard-material-icon" aria-hidden="true">palette</span>
              <span>Style des étiquettes</span>
            </div>
            <div class="tt-labels-preview-row">
              <span id="ttLabelsPreview" class="tt-labels-preview" style="${escapeAttr(renderLabelStyle(style))}" aria-label="Aperçu du style">Aperçu</span>
            </div>
            <div class="tt-labels-style-controls-row">
              <label class="tt-labels-field tt-labels-font-field">
                <span>Police</span>
                <select id="ttLabelsFontFamily" class="tv-input tt-labels-font-select">
                  <option value="${LABELS_FONT_ANDIKA}" ${style.fontFamily === LABELS_FONT_ANDIKA ? "selected" : ""}>Andika</option>
                  <option value="${LABELS_FONT_BELLEALLURE}" ${style.fontFamily === LABELS_FONT_BELLEALLURE ? "selected" : ""}>BelleAllure</option>
                  <option value="${LABELS_FONT_SYSTEM}" ${style.fontFamily === LABELS_FONT_SYSTEM ? "selected" : ""}>Système</option>
                </select>
              </label>
              <label class="tt-widget-action-toggle tt-labels-shadow-toggle">
                <input id="ttLabelsShadow" type="checkbox" ${style.shadow ? "checked" : ""}>
                <span class="tt-widget-action-toggle-track" aria-hidden="true"></span>
                <span>Ombre</span>
              </label>
              ${renderNumberStepper({ id: "ttLabelsFontSize", target: "fontSize", label: "Taille", value: style.fontSize, min: LABELS_FONT_SIZE_MIN, max: LABELS_FONT_SIZE_MAX })}
              ${renderNumberStepper({ id: "ttLabelsBorderWidth", target: "borderWidth", label: "Bordure", value: style.borderWidth, min: LABELS_BORDER_WIDTH_MIN, max: LABELS_BORDER_WIDTH_MAX })}
              ${renderNumberStepper({ id: "ttLabelsBorderRadius", target: "borderRadius", label: "Arrondi", value: style.borderRadius, min: LABELS_BORDER_RADIUS_MIN, max: LABELS_BORDER_RADIUS_MAX })}
            </div>
            <div class="tt-labels-color-grid">
              ${renderColorPickerSlot({ id: "ttLabelsTextColorPicker" })}
              ${renderColorPickerSlot({ id: "ttLabelsColoredTextColorPicker" })}
              ${renderColorPickerSlot({ id: "ttLabelsBackgroundColorPicker" })}
              ${renderColorPickerSlot({ id: "ttLabelsBorderColorPicker" })}
            </div>
          </section>
        </div>
      </section>
    `;

    host.querySelector("#ttLabelsApplyText")?.addEventListener("click", commitLines);
    host.querySelector("#ttLabelsDemoText")?.addEventListener("click", () => commitAction("load-demo-labels"));
    host.querySelector("#ttLabelsShuffleContent")?.addEventListener("click", () => commitAction("shuffle-label-content"));
    host.querySelector("#ttLabelsAlign")?.addEventListener("click", () => commitAction("align-labels"));
    host.querySelector("#ttLabelsRandomPositions")?.addEventListener("click", () => commitAction("randomize-label-positions"));
    host.querySelector("#ttLabelsClearAll")?.addEventListener("click", () => commitAction("clear-labels"));
    bindMarkupHelpPopup();
    host.querySelector("#ttLabelsFontFamily")?.addEventListener("change", (event) => {
      commitStylePatch({ fontFamily: event.currentTarget.value });
    });
    host.querySelector("#ttLabelsShadow")?.addEventListener("change", (event) => {
      commitStylePatch({ shadow: event.currentTarget.checked === true });
    });
    host.querySelectorAll("[data-labels-number-target]").forEach((input) => {
      input.addEventListener("change", () => {
        const target = String(input.dataset.labelsNumberTarget || "").trim();
        if (!target) return;
        commitStylePatch({ [target]: input.value });
      });
    });
    host.querySelectorAll("[data-labels-step-target]").forEach((button) => {
      button.addEventListener("click", () => {
        const target = String(button.dataset.labelsStepTarget || "").trim();
        const delta = Number(button.dataset.labelsStepDelta) || 0;
        const style = getCurrentState().style;
        if (!Object.prototype.hasOwnProperty.call(style, target)) return;
        commitStylePatch({ [target]: Number(style[target]) + delta });
      });
    });

    createColorPicker({
      host: host.querySelector("#ttLabelsTextColorPicker"),
      value: style.textColor,
      label: "Texte",
      headerLabel: "",
      popup: true,
      onChange(value){
        commitStylePatch({ textColor: value }, { renderAfter: false });
      }
    });
    createColorPicker({
      host: host.querySelector("#ttLabelsColoredTextColorPicker"),
      value: style.coloredTextColor,
      label: "Texte coloré",
      headerLabel: "",
      popup: true,
      onChange(value){
        commitStylePatch({ coloredTextColor: value }, { renderAfter: false });
      }
    });
    createColorPicker({
      host: host.querySelector("#ttLabelsBackgroundColorPicker"),
      value: style.backgroundColor,
      label: "Fond",
      headerLabel: "",
      popup: true,
      onChange(value){
        commitStylePatch({ backgroundColor: value }, { renderAfter: false });
      }
    });
    createColorPicker({
      host: host.querySelector("#ttLabelsBorderColorPicker"),
      value: style.borderColor,
      label: "Bordure",
      headerLabel: "",
      popup: true,
      onChange(value){
        commitStylePatch({ borderColor: value }, { renderAfter: false });
      }
    });
  }

  render();

  return {
    render,
    destroy(){
      cleanupMarkupHelpListeners();
      if (host) host.innerHTML = "";
    }
  };
}
