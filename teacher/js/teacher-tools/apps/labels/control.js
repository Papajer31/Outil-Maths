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


function renderLabelsList(state){
  const selected = new Set(Array.isArray(state?.selectedIds) ? state.selectedIds : []);
  const items = Array.isArray(state?.items) ? state.items : [];
  if (!items.length) {
    return `<div class="tt-labels-list-empty">Aucune étiquette dans la projection.</div>`;
  }
  return `
    <div class="tt-labels-object-list" role="list" aria-label="Étiquettes de la projection">
      ${items.map((item, index) => {
        const isSelected = selected.has(item.id);
        const isVisible = item.visible !== false;
        return `
          <div class="tt-labels-object-row${isSelected ? " is-selected" : ""}${isVisible ? "" : " is-hidden"}" role="listitem" data-label-row-id="${escapeAttr(item.id)}">
            <button class="tt-labels-object-select" type="button" data-labels-select-id="${escapeAttr(item.id)}" aria-pressed="${isSelected ? "true" : "false"}" title="${isSelected ? "Retirer de la sélection" : "Ajouter à la sélection"}">
              <span class="dashboard-material-icon" aria-hidden="true">${isSelected ? "done" : "crop_square"}</span>
              <span class="tt-labels-object-index">${index + 1}</span>
              <span class="tt-labels-object-text">${escapeHtml(item.text)}</span>
            </button>
            <button class="tt-labels-object-visibility" type="button" data-labels-visibility-id="${escapeAttr(item.id)}" aria-pressed="${isVisible ? "true" : "false"}" title="${isVisible ? "Masquer" : "Afficher"}">
              <span class="dashboard-material-icon" aria-hidden="true">${isVisible ? "visibility" : "visibility_off"}</span>
            </button>
          </div>`;
      }).join("")}
    </div>`;
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
    if (!result) return null;
    if (result.error) {
      showToast?.(String(result.error), { isError: true });
      return result;
    }
    const patch = result.patch && typeof result.patch === "object" ? result.patch : null;
    if (patch) updateWidget?.(patch, { renderPanel: renderAfter, sync: true });
    if (result.message) showToast?.(String(result.message), { isError: result.isError === true });
    return result;
  }

  function syncObjectUi(rawState){
    const state = normalizeLabelsState(rawState);
    const visibleIds = state.items.filter((item) => item.visible !== false).map((item) => item.id);
    const selected = new Set(state.selectedIds.filter((id) => visibleIds.includes(id)));
    const targetCount = selected.size || visibleIds.length;
    host?.querySelectorAll?.("[data-label-row-id]").forEach((row) => {
      const id = String(row.dataset.labelRowId || "");
      const item = state.items.find((entry) => entry.id === id);
      if (!item) return;
      const isSelected = selected.has(id);
      const isVisible = item.visible !== false;
      row.classList.toggle("is-selected", isSelected);
      row.classList.toggle("is-hidden", !isVisible);
      const select = row.querySelector("[data-labels-select-id]");
      select?.setAttribute("aria-pressed", isSelected ? "true" : "false");
      const selectIcon = select?.querySelector(".dashboard-material-icon");
      if (selectIcon) selectIcon.textContent = isSelected ? "done" : "crop_square";
      const visibility = row.querySelector("[data-labels-visibility-id]");
      visibility?.setAttribute("aria-pressed", isVisible ? "true" : "false");
      visibility?.setAttribute("title", isVisible ? "Masquer" : "Afficher");
      const visibilityIcon = visibility?.querySelector(".dashboard-material-icon");
      if (visibilityIcon) visibilityIcon.textContent = isVisible ? "visibility" : "visibility_off";
    });
    const target = host?.querySelector?.(".tt-labels-layout-target");
    if (target) target.textContent = selected.size
      ? `${selected.size} sélectionnée${selected.size > 1 ? "s" : ""}`
      : `${visibleIds.length} visible${visibleIds.length > 1 ? "s" : ""}`;
    host?.querySelectorAll?.("[data-labels-layout]").forEach((button) => {
      const minimum = String(button.dataset.labelsLayout || "").startsWith("distribute-") ? 3 : 2;
      button.disabled = targetCount < minimum;
    });
    const stats = host?.querySelector?.("[data-labels-object-stats]");
    if (stats) stats.textContent = `${visibleIds.length} visible${visibleIds.length > 1 ? "s" : ""} · ${selected.size} sélectionnée${selected.size > 1 ? "s" : ""}`;
    const selectAll = host?.querySelector?.("[data-labels-select-all]");
    if (selectAll) selectAll.disabled = visibleIds.length === 0;
    const clear = host?.querySelector?.("[data-labels-clear-selection]");
    if (clear) clear.disabled = selected.size === 0;
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
    const visibleItems = state.items.filter((item) => item.visible !== false);
    const visibleIds = visibleItems.map((item) => item.id);
    const selectedIds = state.selectedIds.filter((id) => visibleIds.includes(id));
    const layoutTargetIds = selectedIds.length ? selectedIds : visibleIds;
    const layoutTargetCount = layoutTargetIds.length;

    host.innerHTML = `
      <section class="tt-control-panel tt-control-panel-compact tt-labels-control" aria-label="Contrôles du widget Étiquettes Texte">
        <div class="tt-control-panel-head">
          <div class="tt-labels-heading-row">
            <h3>Étiquettes Texte</h3>
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

        <div class="tt-labels-layout-bar" aria-label="Disposition des étiquettes">
          <label class="tt-widget-action-toggle tt-labels-snap-toggle" title="Magnétisme d’alignement entre étiquettes">
            <input id="ttLabelsSnapEnabled" type="checkbox" ${state.snapEnabled ? "checked" : ""}>
            <span class="tt-widget-action-toggle-track" aria-hidden="true"></span>
            <span>Magnétisme</span>
          </label>
          <span class="tt-labels-layout-separator" aria-hidden="true"></span>
          <span class="tt-labels-layout-target" title="Les commandes s’appliquent à la sélection active, ou à toutes les étiquettes visibles s’il n’y a aucune sélection.">${selectedIds.length ? `${selectedIds.length} sélectionnée${selectedIds.length > 1 ? "s" : ""}` : `${visibleItems.length} visible${visibleItems.length > 1 ? "s" : ""}`}</span>
          <span class="tt-labels-layout-separator" aria-hidden="true"></span>
          <button class="tt-labels-layout-btn" type="button" data-labels-layout="align-left" title="Aligner les bords gauches" aria-label="Aligner les bords gauches" ${layoutTargetCount >= 2 ? "" : "disabled"}><span class="dashboard-material-icon" aria-hidden="true">align_horizontal_left</span></button>
          <button class="tt-labels-layout-btn" type="button" data-labels-layout="align-center-x" title="Aligner les centres horizontalement" aria-label="Aligner les centres horizontalement" ${layoutTargetCount >= 2 ? "" : "disabled"}><span class="dashboard-material-icon" aria-hidden="true">align_horizontal_center</span></button>
          <button class="tt-labels-layout-btn" type="button" data-labels-layout="align-right" title="Aligner les bords droits" aria-label="Aligner les bords droits" ${layoutTargetCount >= 2 ? "" : "disabled"}><span class="dashboard-material-icon" aria-hidden="true">align_horizontal_right</span></button>
          <span class="tt-labels-layout-separator" aria-hidden="true"></span>
          <button class="tt-labels-layout-btn" type="button" data-labels-layout="align-top" title="Aligner les bords supérieurs" aria-label="Aligner les bords supérieurs" ${layoutTargetCount >= 2 ? "" : "disabled"}><span class="dashboard-material-icon" aria-hidden="true">align_vertical_top</span></button>
          <button class="tt-labels-layout-btn" type="button" data-labels-layout="align-center-y" title="Aligner les centres verticalement" aria-label="Aligner les centres verticalement" ${layoutTargetCount >= 2 ? "" : "disabled"}><span class="dashboard-material-icon" aria-hidden="true">align_vertical_center</span></button>
          <button class="tt-labels-layout-btn" type="button" data-labels-layout="align-bottom" title="Aligner les bords inférieurs" aria-label="Aligner les bords inférieurs" ${layoutTargetCount >= 2 ? "" : "disabled"}><span class="dashboard-material-icon" aria-hidden="true">align_vertical_bottom</span></button>
          <span class="tt-labels-layout-separator" aria-hidden="true"></span>
          <button class="tt-labels-layout-btn" type="button" data-labels-layout="distribute-x" title="Répartir horizontalement" aria-label="Répartir horizontalement" ${layoutTargetCount >= 3 ? "" : "disabled"}><span class="dashboard-material-icon" aria-hidden="true">horizontal_distribute</span></button>
          <button class="tt-labels-layout-btn" type="button" data-labels-layout="distribute-y" title="Répartir verticalement" aria-label="Répartir verticalement" ${layoutTargetCount >= 3 ? "" : "disabled"}><span class="dashboard-material-icon" aria-hidden="true">vertical_distribute</span></button>
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

        <section class="tt-labels-section tt-labels-objects-section" aria-label="Étiquettes dans la projection">
          <div class="tt-labels-objects-head">
            <div class="tt-labels-section-title">
              <span class="dashboard-material-icon" aria-hidden="true">view_list</span>
              <span>Étiquettes dans la projection</span>
              <small data-labels-object-stats>${visibleItems.length} visible${visibleItems.length > 1 ? "s" : ""} · ${selectedIds.length} sélectionnée${selectedIds.length > 1 ? "s" : ""}</small>
            </div>
            <div class="tt-labels-objects-actions">
              <button type="button" class="tt-labels-mini-action" data-labels-select-all ${visibleItems.length ? "" : "disabled"} title="Sélectionner toutes les étiquettes visibles">
                <span class="dashboard-material-icon" aria-hidden="true">select_all</span><span>Tout sélectionner</span>
              </button>
              <button type="button" class="tt-labels-mini-action" data-labels-clear-selection ${selectedIds.length ? "" : "disabled"} title="Effacer la sélection">
                <span class="dashboard-material-icon" aria-hidden="true">close</span><span>Désélectionner</span>
              </button>
            </div>
          </div>
          ${renderLabelsList(state)}
        </section>
      </section>
    `;

    host.querySelector("#ttLabelsApplyText")?.addEventListener("click", commitLines);
    host.querySelector("#ttLabelsDemoText")?.addEventListener("click", () => commitAction("load-demo-labels"));
    host.querySelector("#ttLabelsShuffleContent")?.addEventListener("click", () => commitAction("shuffle-label-content"));
    host.querySelector("#ttLabelsAlign")?.addEventListener("click", () => commitAction("align-labels"));
    host.querySelector("#ttLabelsRandomPositions")?.addEventListener("click", () => commitAction("randomize-label-positions"));
    host.querySelector("#ttLabelsClearAll")?.addEventListener("click", () => commitAction("clear-labels"));
    host.querySelector("#ttLabelsSnapEnabled")?.addEventListener("change", (event) => {
      commitAction("set-snap-enabled", { enabled:event.currentTarget.checked === true });
    });
    host.querySelectorAll("[data-labels-layout]").forEach((button) => {
      button.addEventListener("click", () => {
        commitAction("layout-labels", {
          command:String(button.dataset.labelsLayout || ""),
          labelIds:layoutTargetIds
        });
      });
    });
    host.querySelectorAll("[data-labels-select-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = String(button.dataset.labelsSelectId || "").trim();
        if (!id) return;
        const current = getCurrentState();
        const next = new Set(current.selectedIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        const result = commitAction("set-selection", { labelIds:[...next] }, { renderAfter:false });
        if (result?.patch?.state) syncObjectUi(result.patch.state);
      });
    });
    host.querySelectorAll("[data-labels-visibility-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = String(button.dataset.labelsVisibilityId || "").trim();
        const item = getCurrentState().items.find((entry) => entry.id === id);
        if (!item) return;
        const result = commitAction("set-label-visible", { labelId:id, visible:item.visible === false }, { renderAfter:false });
        if (result?.patch?.state) syncObjectUi(result.patch.state);
      });
    });
    host.querySelector("[data-labels-select-all]")?.addEventListener("click", () => {
      const result = commitAction("set-selection", { labelIds:getCurrentState().items.filter((item) => item.visible !== false).map((item) => item.id) }, { renderAfter:false });
      if (result?.patch?.state) syncObjectUi(result.patch.state);
    });
    host.querySelector("[data-labels-clear-selection]")?.addEventListener("click", () => {
      const result = commitAction("set-selection", { labelIds:[] }, { renderAfter:false });
      if (result?.patch?.state) syncObjectUi(result.patch.state);
    });
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
