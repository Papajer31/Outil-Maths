import {
  VALUE_CONSTRAINT_MODES,
  normalizeNumericConstraint,
  formatConstraintPreview,
  normalizeValueList
} from "./value-constraints.js";

export function renderSection(title, innerHtml, { collapsible = false, expanded = true, idPrefix = "" } = {}){
  if (!collapsible) {
    return `
      <div class="tv-group">
        <div class="tv-group-title">${escapeHtml(title)}</div>
        ${innerHtml}
      </div>
    `;
  }

  const safeId = String(idPrefix || title || "section")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-") || "section";

  return `
    <div class="tv-group tv-group-collapsible" data-tv-collapsible="${escapeHtml(safeId)}">
      <button
        class="tv-group-toggle"
        type="button"
        id="${escapeHtml(safeId)}_toggle"
        aria-expanded="${expanded ? "true" : "false"}"
        aria-controls="${escapeHtml(safeId)}_content"
      >
        <span class="tv-group-title">${escapeHtml(title)}</span>
        <span class="tv-stepper-icon" aria-hidden="true">expand_more</span>
      </button>
      <div class="tv-group-content${expanded ? " is-open" : ""}" id="${escapeHtml(safeId)}_content" ${expanded ? "" : "hidden"}>
        ${innerHtml}
      </div>
    </div>
  `;
}

export function bindCollapsibleSection(container, idPrefix) {
  const safeId = String(idPrefix || "").trim();
  if (!safeId) return;

  const toggle = container.querySelector(`#${cssEscape(safeId)}_toggle`);
  const content = container.querySelector(`#${cssEscape(safeId)}_content`);
  if (!toggle || !content) return;

  const setExpanded = (expanded) => {
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    content.classList.toggle("is-open", expanded);
    content.hidden = !expanded;
  };

  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    setExpanded(!expanded);
  });
}

export function renderToolSettingsStack(...blocks){
  const items = blocks
    .flat()
    .filter(Boolean)
    .join("");

  return `
    <div class="tv-settings-stack">
      ${items}
    </div>
  `;
}

export function renderMinMax({
  idPrefix,
  title = "",
  minLabel = "Minimum",
  maxLabel = "Maximum",
  minValue = 0,
  maxValue = 10,
  inputMin = 0,
  inputMax = 99,
  step = 1,
  mode = VALUE_CONSTRAINT_MODES.SIMPLE,
  startValue = minValue,
  stepValue = step,
  values = []
}){
  const constraint = normalizeNumericConstraint({
    min: minValue,
    max: maxValue,
    mode,
    start: startValue,
    step: stepValue,
    values
  }, {
    inputMin,
    inputMax,
    defaultMin: minValue,
    defaultMax: maxValue,
    defaultStart: minValue,
    defaultStep: step,
    defaultValues: Array.isArray(values) ? values : normalizeValueList(values, { inputMin, inputMax })
  });

  const isExpanded = constraint.mode !== VALUE_CONSTRAINT_MODES.SIMPLE;
  const preview = formatConstraintPreview(constraint.allowedValues);
  const listValue = constraint.values.join(", ");

  const block = `
    <div class="tv-minmax" data-tv-minmax="${idPrefix}" data-tv-expanded="${isExpanded ? "true" : "false"}">
      <div class="tv-minmax-inline">
        ${title ? `<div class="tv-group-title tv-minmax-title">${escapeHtml(title)}</div>` : ""}

        <div class="tv-minmax-header-actions">
          <div class="tv-minmax-controls">
            ${renderStepperControl({
              id: `${idPrefix}_min`,
              label: minLabel,
              value: constraint.min,
              inputMin,
              inputMax,
              step
            })}

            ${renderStepperControl({
              id: `${idPrefix}_max`,
              label: maxLabel,
              value: constraint.max,
              inputMin,
              inputMax,
              step
            })}
          </div>

          <button
            class="tv-minmax-toggle"
            type="button"
            id="${idPrefix}_toggle"
            aria-expanded="${isExpanded ? "true" : "false"}"
            aria-controls="${idPrefix}_advanced"
            aria-label="Afficher les options avancées"
          >
            <span class="tv-stepper-icon" aria-hidden="true">expand_more</span>
          </button>
        </div>
      </div>

      <div class="tv-minmax-advanced${isExpanded ? " is-open" : ""}" id="${idPrefix}_advanced" ${isExpanded ? "" : "hidden"}>
        <div class="tv-minmax-mode-row">
          <label class="tv-minmax-radio-row">
            <input class="tv-minmax-radio" type="radio" name="${idPrefix}_mode" id="${idPrefix}_mode_simple" value="${VALUE_CONSTRAINT_MODES.SIMPLE}" ${constraint.mode === VALUE_CONSTRAINT_MODES.SIMPLE ? "checked" : ""}>
            <span>Intervalle simple</span>
          </label>
        </div>

        <div class="tv-minmax-mode-row tv-minmax-mode-row-advanced">
          <label class="tv-minmax-radio-row">
            <input class="tv-minmax-radio" type="radio" name="${idPrefix}_mode" id="${idPrefix}_mode_advanced" value="${VALUE_CONSTRAINT_MODES.ADVANCED}" ${constraint.mode === VALUE_CONSTRAINT_MODES.ADVANCED ? "checked" : ""}>
            <span>Avancé</span>
          </label>

          <div class="tv-minmax-advanced-fields">
            ${renderStepperControl({
              id: `${idPrefix}_start`,
              label: "Départ",
              value: constraint.start,
              inputMin,
              inputMax,
              step
            })}

            ${renderStepperControl({
              id: `${idPrefix}_step`,
              label: "Pas",
              value: constraint.step,
              inputMin: 1,
              inputMax: Math.max(1, inputMax - inputMin),
              step: 1
            })}
          </div>
        </div>

        <div class="tv-minmax-mode-row tv-minmax-mode-row-list">
          <label class="tv-minmax-radio-row">
            <input class="tv-minmax-radio" type="radio" name="${idPrefix}_mode" id="${idPrefix}_mode_list" value="${VALUE_CONSTRAINT_MODES.LIST}" ${constraint.mode === VALUE_CONSTRAINT_MODES.LIST ? "checked" : ""}>
            <span>Liste de valeurs</span>
          </label>

          <textarea class="tv-input tv-minmax-textarea" id="${idPrefix}_values" rows="3" placeholder="Ex. : 10, 20, 30">${escapeHtml(listValue)}</textarea>
        </div>

        <div class="tv-minmax-preview-row">
          <span class="tv-minmax-preview-label">Aperçu :</span>
          <span class="tv-minmax-preview" id="${idPrefix}_preview">${escapeHtml(preview)}</span>
        </div>
      </div>
    </div>
  `;

  return title ? `<div class="tv-group tv-group-inline">${block}</div>` : block;
}

export function renderBasicMinMax({
  idPrefix,
  title = "",
  minLabel = "Minimum",
  maxLabel = "Maximum",
  minValue = 0,
  maxValue = 10,
  inputMin = 0,
  inputMax = 99,
  step = 1
}){
  const safeMin = clampInt(minValue, inputMin, inputMax);
  const safeMax = clampInt(maxValue, inputMin, inputMax);
  const block = `
    <div class="tv-minmax tv-minmax-basic" data-tv-basic-minmax="${idPrefix}">
      <div class="tv-minmax-inline">
        ${title ? `<div class="tv-group-title tv-minmax-title">${escapeHtml(title)}</div>` : ""}

        <div class="tv-minmax-header-actions">
          <div class="tv-minmax-controls">
            ${renderStepperControl({
              id: `${idPrefix}_min`,
              label: minLabel,
              value: Math.min(safeMin, safeMax),
              inputMin,
              inputMax,
              step
            })}

            ${renderStepperControl({
              id: `${idPrefix}_max`,
              label: maxLabel,
              value: Math.max(safeMin, safeMax),
              inputMin,
              inputMax,
              step
            })}
          </div>
        </div>
      </div>
    </div>
  `;

  return title ? `<div class="tv-group tv-group-inline">${block}</div>` : block;
}

export function bindMinMax(container, idPrefix, {
  inputMin = 0,
  inputMax = 99
} = {}){
  const root = container.querySelector(`[data-tv-minmax="${cssEscape(idPrefix)}"]`);
  const minEl = container.querySelector(`#${cssEscape(idPrefix)}_min`);
  const maxEl = container.querySelector(`#${cssEscape(idPrefix)}_max`);
  const startEl = container.querySelector(`#${cssEscape(idPrefix)}_start`);
  const stepEl = container.querySelector(`#${cssEscape(idPrefix)}_step`);
  const valuesEl = container.querySelector(`#${cssEscape(idPrefix)}_values`);
  const toggleEl = container.querySelector(`#${cssEscape(idPrefix)}_toggle`);
  const advancedEl = container.querySelector(`#${cssEscape(idPrefix)}_advanced`);
  const modeEls = Array.from(container.querySelectorAll(`input[name="${cssEscape(idPrefix)}_mode"]`));
  if (!root || !minEl || !maxEl || !startEl || !stepEl || !valuesEl || !toggleEl || !advancedEl || modeEls.length === 0) return;

  bindStepper(minEl, { inputMin, inputMax });
  bindStepper(maxEl, { inputMin, inputMax });
  bindStepper(startEl, { inputMin, inputMax });
  bindStepper(stepEl, { inputMin: 1, inputMax: Math.max(1, inputMax - inputMin) });

  const syncPair = (source = null) => {
    const minBounds = resolveStepperBounds(minEl, { inputMin, inputMax });
    const maxBounds = resolveStepperBounds(maxEl, { inputMin, inputMax });

    let min = clampInt(minEl.value, minBounds.min, minBounds.max);
    let max = clampInt(maxEl.value, maxBounds.min, maxBounds.max);

    if (min > max) {
      if (source === minEl) {
        max = min;
      } else {
        min = max;
      }
    }

    min = clampInt(min, minBounds.min, minBounds.max);
    max = clampInt(max, maxBounds.min, maxBounds.max);

    minEl.value = String(min);
    maxEl.value = String(max);

    syncStepperUI(minEl, { inputMin, inputMax });
    syncStepperUI(maxEl, { inputMin, inputMax });
  };

  const setExpanded = (expanded) => {
    root.dataset.tvExpanded = expanded ? "true" : "false";
    toggleEl.setAttribute("aria-expanded", expanded ? "true" : "false");
    advancedEl.classList.toggle("is-open", expanded);
    if (expanded) {
      advancedEl.hidden = false;
    } else {
      advancedEl.hidden = true;
    }
  };

  const updateModeState = () => {
    const mode = getCheckedMinMaxMode(modeEls);
    const isAdvanced = mode === VALUE_CONSTRAINT_MODES.ADVANCED;
    const isList = mode === VALUE_CONSTRAINT_MODES.LIST;

    setStepperDisabled(minEl, isList, { inputMin, inputMax });
    setStepperDisabled(maxEl, isList, { inputMin, inputMax });
    setStepperDisabled(startEl, !isAdvanced, { inputMin, inputMax });
    setStepperDisabled(stepEl, !isAdvanced, { inputMin: 1, inputMax: Math.max(1, inputMax - inputMin) });
    valuesEl.disabled = !isList;

    root.querySelector('.tv-minmax-mode-row-advanced')?.classList.toggle('is-active', isAdvanced);
    root.querySelector('.tv-minmax-mode-row-list')?.classList.toggle('is-active', isList);

    updateMinMaxPreview(container, idPrefix, { inputMin, inputMax });
  };

  const onMinInput = () => {
    syncPair(minEl);
    updateMinMaxPreview(container, idPrefix, { inputMin, inputMax });
  };
  const onMaxInput = () => {
    syncPair(maxEl);
    updateMinMaxPreview(container, idPrefix, { inputMin, inputMax });
  };

  minEl.addEventListener("input", onMinInput);
  minEl.addEventListener("change", onMinInput);

  maxEl.addEventListener("input", onMaxInput);
  maxEl.addEventListener("change", onMaxInput);

  startEl.addEventListener("input", () => updateMinMaxPreview(container, idPrefix, { inputMin, inputMax }));
  startEl.addEventListener("change", () => updateMinMaxPreview(container, idPrefix, { inputMin, inputMax }));
  stepEl.addEventListener("input", () => updateMinMaxPreview(container, idPrefix, { inputMin, inputMax }));
  stepEl.addEventListener("change", () => updateMinMaxPreview(container, idPrefix, { inputMin, inputMax }));
  valuesEl.addEventListener("input", () => updateMinMaxPreview(container, idPrefix, { inputMin, inputMax }));
  valuesEl.addEventListener("change", () => updateMinMaxPreview(container, idPrefix, { inputMin, inputMax }));

  modeEls.forEach((modeEl) => {
    modeEl.addEventListener("change", updateModeState);
  });

  toggleEl.addEventListener("click", () => {
    setExpanded(root.dataset.tvExpanded !== "true");
  });

  syncPair();
  updateModeState();
}

export function bindBasicMinMax(container, idPrefix, {
  inputMin = 0,
  inputMax = 99
} = {}){
  const root = container.querySelector(`[data-tv-basic-minmax="${cssEscape(idPrefix)}"]`);
  const minEl = container.querySelector(`#${cssEscape(idPrefix)}_min`);
  const maxEl = container.querySelector(`#${cssEscape(idPrefix)}_max`);
  if (!root || !minEl || !maxEl) return;

  bindStepper(minEl, { inputMin, inputMax });
  bindStepper(maxEl, { inputMin, inputMax });

  const syncPair = (source = null) => {
    const minBounds = resolveStepperBounds(minEl, { inputMin, inputMax });
    const maxBounds = resolveStepperBounds(maxEl, { inputMin, inputMax });

    let min = clampInt(minEl.value, minBounds.min, minBounds.max);
    let max = clampInt(maxEl.value, maxBounds.min, maxBounds.max);

    if (min > max) {
      if (source === minEl) {
        max = min;
      } else {
        min = max;
      }
    }

    minEl.value = String(clampInt(min, minBounds.min, minBounds.max));
    maxEl.value = String(clampInt(max, maxBounds.min, maxBounds.max));

    syncStepperUI(minEl, { inputMin, inputMax });
    syncStepperUI(maxEl, { inputMin, inputMax });
  };

  const onMinInput = () => syncPair(minEl);
  const onMaxInput = () => syncPair(maxEl);

  minEl.addEventListener("input", onMinInput);
  minEl.addEventListener("change", onMinInput);
  maxEl.addEventListener("input", onMaxInput);
  maxEl.addEventListener("change", onMaxInput);

  syncPair();
}

export function readMinMax(container, idPrefix, {
  inputMin = 0,
  inputMax = 99,
  errorLabel = "Les bornes"
} = {}){
  const constraint = getMinMaxConstraintState(container, idPrefix, { inputMin, inputMax });

  if (constraint.min > constraint.max){
    throw new Error(`${errorLabel} sont invalides.`);
  }

  if (constraint.mode === VALUE_CONSTRAINT_MODES.ADVANCED && constraint.allowedValues.length === 0) {
    throw new Error(`${errorLabel} avancées ne produisent aucune valeur.`);
  }

  if (constraint.mode === VALUE_CONSTRAINT_MODES.LIST && constraint.allowedValues.length === 0) {
    throw new Error("La liste de valeurs ne contient aucune valeur valide.");
  }

  return constraint;
}

export function readBasicMinMax(container, idPrefix, {
  inputMin = 0,
  inputMax = 99,
  errorLabel = "Les bornes"
} = {}){
  const minEl = container.querySelector(`#${cssEscape(idPrefix)}_min`);
  const maxEl = container.querySelector(`#${cssEscape(idPrefix)}_max`);

  const min = clampInt(minEl?.value, inputMin, inputMax);
  const max = clampInt(maxEl?.value, inputMin, inputMax);

  if (min > max) {
    throw new Error(`${errorLabel} sont invalides.`);
  }

  return normalizeNumericConstraint({
    min,
    max,
    mode: VALUE_CONSTRAINT_MODES.SIMPLE,
    start: min,
    step: 1,
    values: []
  }, {
    inputMin,
    inputMax,
    defaultMin: min,
    defaultMax: max,
    defaultStart: min,
    defaultStep: 1,
    defaultValues: []
  });
}

export function setMinMaxBounds(container, idPrefix, {
  inputMin = 0,
  inputMax = 99
} = {}) {
  const minEl = container.querySelector(`#${cssEscape(idPrefix)}_min`);
  const maxEl = container.querySelector(`#${cssEscape(idPrefix)}_max`);
  const startEl = container.querySelector(`#${cssEscape(idPrefix)}_start`);
  const stepEl = container.querySelector(`#${cssEscape(idPrefix)}_step`);
  if (!minEl || !maxEl || !startEl || !stepEl) return;

  const safeMin = Math.floor(Number(inputMin));
  const safeMax = Math.max(safeMin, Math.floor(Number(inputMax)));
  const stepMax = Math.max(1, safeMax - safeMin);

  [minEl, maxEl, startEl].forEach((el) => {
    el.setAttribute("min", String(safeMin));
    el.setAttribute("max", String(safeMax));
  });

  stepEl.setAttribute("min", "1");
  stepEl.setAttribute("max", String(stepMax));

  let minValue = clampInt(minEl.value, safeMin, safeMax);
  let maxValue = clampInt(maxEl.value, safeMin, safeMax);
  if (minValue > maxValue) {
    maxValue = minValue;
  }

  minEl.value = String(minValue);
  maxEl.value = String(maxValue);
  startEl.value = String(clampInt(startEl.value, safeMin, safeMax));
  stepEl.value = String(clampInt(stepEl.value, 1, stepMax));

  refreshStepper(container, `${idPrefix}_min`, { inputMin: safeMin, inputMax: safeMax });
  refreshStepper(container, `${idPrefix}_max`, { inputMin: safeMin, inputMax: safeMax });
  refreshStepper(container, `${idPrefix}_start`, { inputMin: safeMin, inputMax: safeMax });
  refreshStepper(container, `${idPrefix}_step`, { inputMin: 1, inputMax: stepMax });

  updateMinMaxPreview(container, idPrefix, { inputMin: safeMin, inputMax: safeMax });
}

export function renderStepperField({
  id,
  label,
  value = 0,
  inputMin = 0,
  inputMax = 99,
  step = 1,
  fieldClassName = ""
}){
  const safeValue = clampInt(value, inputMin, inputMax);
  const safeClassName = String(fieldClassName || "").trim();
  const fieldLabelId = `${id}_field_label`;

  return `
    <div class="tv-stepper-field ${safeClassName}">
      <div class="tv-stepper-field-label" id="${fieldLabelId}">${escapeHtml(label)}</div>
      <div class="tv-stepper-field-control">
        ${renderStepperControl({
          id,
          label,
          value: safeValue,
          inputMin,
          inputMax,
          step,
          showInlineLabel: false,
          labelId: fieldLabelId
        })}
      </div>
    </div>
  `;
}

export function bindStepperField(container, id, {
  inputMin = 0,
  inputMax = 99,
  onChange = null
} = {}){
  const input = container.querySelector(`#${cssEscape(id)}`);
  if (!input) return;

  bindStepper(input, {
    inputMin,
    inputMax,
    onChange
  });
}

export function readStepper(container, id, {
  inputMin = 0,
  inputMax = 99
} = {}){
  return clampInt(container.querySelector(`#${cssEscape(id)}`)?.value, inputMin, inputMax);
}

export function refreshStepper(container, id, {
  inputMin = 0,
  inputMax = 99
} = {}){
  const input = container.querySelector(`#${cssEscape(id)}`);
  if (!input) return;

  syncStepperUI(input, { inputMin, inputMax });
}

export function renderCheckbox({
  id,
  label,
  checked = false
}){
  return `
    <label class="tv-checkbox-row">
      <input
        class="tv-checkbox"
        type="checkbox"
        id="${id}"
        ${checked ? "checked" : ""}
      >
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

export function readCheckbox(container, id){
  return !!container.querySelector(`#${id}`)?.checked;
}

export function renderRadioGroup({
  title = "",
  id,
  value = "",
  options = [],
  inline = true
}){
  const safeOptions = Array.isArray(options) ? options : [];
  const rowsHtml = safeOptions.map((opt, index) => {
    const optionValue = String(opt?.value ?? "");
    const optionLabel = String(opt?.label ?? optionValue);
    const optionId = `${id}_${index}`;
    const checked = optionValue === String(value);

    return `
      <label class="tv-radio-row">
        <input
          class="tv-radio"
          type="radio"
          name="${escapeHtml(id)}"
          id="${escapeHtml(optionId)}"
          value="${escapeHtml(optionValue)}"
          ${checked ? "checked" : ""}
        >
        <span>${escapeHtml(optionLabel)}</span>
      </label>
    `;
  }).join("");

  return `
    <div class="tv-group tv-group-inline">
      <div class="tv-radio-group ${inline ? "tv-radio-group-inline" : ""}" data-tv-radio-group="${escapeHtml(id)}">
        ${title ? `<div class="tv-group-title tv-radio-group-title">${escapeHtml(title)}</div>` : ""}
        <div class="tv-radio-options">${rowsHtml}</div>
      </div>
    </div>
  `;
}

export function bindRadio(container, id, {
  onChange = null
} = {}){
  const inputs = Array.from(container.querySelectorAll(`input[name="${cssEscape(id)}"]`));
  if (!inputs.length) return;

  inputs.forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      onChange?.(input.value);
    });
  });
}

export function readRadio(container, id, fallback = ""){
  const checked = container.querySelector(`input[name="${cssEscape(id)}"]:checked`);
  return String(checked?.value ?? fallback);
}

export function renderSelect({
  id,
  label,
  value,
  options = [],
  disabled = false
}){
  return `
    <div class="tv-row">
      <label class="tv-label" for="${id}_trigger">${escapeHtml(label)}</label>
      ${renderSelectControl({ id, value, options, disabled })}
    </div>
  `;
}

export function renderSelectGroup({
  title,
  id,
  value,
  options = [],
  disabled = false
}){
  return `
    <div class="tv-group tv-group-inline">
      <div class="tv-select-inline">
        <div class="tv-group-title tv-select-inline-title">${escapeHtml(title)}</div>

        <div class="tv-select-inline-control">
          ${renderSelectControl({
            id,
            value,
            options,
            disabled,
            rootClassName: "tv-select-inline-input"
          })}
        </div>
      </div>
    </div>
  `;
}

export function renderSelectControl({
  id,
  value,
  options = [],
  rootClassName = "",
  disabled = false
}){
  return renderCustomSelectControl({
    id,
    value,
    options,
    rootClassName,
    disabled
  });
}

export function bindSelect(container, id, {
  onChange = null
} = {}){
  const root = container.querySelector(`[data-tv-select="${cssEscape(id)}"]`);
  const input = container.querySelector(`#${cssEscape(id)}`);
  if (!root || !input) return;

  const trigger = root.querySelector(`#${cssEscape(id)}_trigger`);
  const textEl = root.querySelector(".tv-custom-select-text");
  const menu = root.querySelector(".tv-custom-select-menu");
  const options = Array.from(root.querySelectorAll(".tv-custom-select-option"));
  if (!trigger || !textEl || !menu || options.length === 0) return;

  const optionMap = new Map(options.map((btn) => [String(btn.dataset.value ?? ""), btn]));

  const closeMenu = ({ restoreFocus = false } = {}) => {
    root.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) trigger.focus();
  };

  const openMenu = () => {
    root.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");

    const current = optionMap.get(String(input.value ?? "")) || options[0];
    current?.focus();
  };

  const setValue = (nextValue, { emit = false } = {}) => {
    const safeValue = optionMap.has(String(nextValue))
      ? String(nextValue)
      : String(options[0]?.dataset.value ?? "");

    input.value = safeValue;

    options.forEach((btn) => {
      const isActive = String(btn.dataset.value ?? "") === safeValue;
      btn.classList.toggle("is-selected", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
      if (isActive) {
        textEl.textContent = btn.dataset.label ?? btn.textContent ?? "";
      }
    });

    if (emit) {
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      if (typeof onChange === "function") {
        onChange(safeValue);
      }
    }
  };

  trigger.addEventListener("click", () => {
    if (root.classList.contains("is-open")) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  trigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMenu();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    }
  });

  options.forEach((btn, index) => {
    btn.addEventListener("click", () => {
      setValue(btn.dataset.value ?? "", { emit: true });
      closeMenu({ restoreFocus: true });
    });

    btn.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu({ restoreFocus: true });
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        options[Math.min(index + 1, options.length - 1)]?.focus();
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        options[Math.max(index - 1, 0)]?.focus();
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        options[0]?.focus();
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        options[options.length - 1]?.focus();
      }
    });
  });

  const onDocumentPointerDown = (event) => {
    if (!root.isConnected) {
      document.removeEventListener("pointerdown", onDocumentPointerDown, true);
      return;
    }

    if (!root.contains(event.target)) {
      closeMenu();
    }
  };

  document.addEventListener("pointerdown", onDocumentPointerDown, true);

  setValue(input.value, { emit: false });
}

export function readSelect(container, id, {
  parse = (v) => v
} = {}){
  const el = container.querySelector(`#${cssEscape(id)}`);
  return parse(el?.value ?? "");
}

function getCheckedMinMaxMode(modeEls) {
  const checked = modeEls.find((el) => el.checked);
  return checked?.value || VALUE_CONSTRAINT_MODES.SIMPLE;
}

function setStepperDisabled(input, disabled, bounds) {
  if (!input) return;

  input.disabled = !!disabled;
  const wrap = input.closest(".tv-stepper");
  if (!wrap) return;

  wrap.classList.toggle("is-disabled", !!disabled);
  wrap.querySelectorAll(".tv-stepper-btn").forEach((btn) => {
    btn.disabled = !!disabled;
  });

  if (!disabled) {
    syncStepperUI(input, bounds);
  }
}

function getMinMaxConstraintState(container, idPrefix, {
  inputMin = 0,
  inputMax = 99
} = {}) {
  const bounds = resolveMinMaxConstraintBounds(container, idPrefix, { inputMin, inputMax });
  const min = clampInt(container.querySelector(`#${cssEscape(idPrefix)}_min`)?.value, bounds.inputMin, bounds.inputMax);
  const max = clampInt(container.querySelector(`#${cssEscape(idPrefix)}_max`)?.value, bounds.inputMin, bounds.inputMax);
  const start = clampInt(container.querySelector(`#${cssEscape(idPrefix)}_start`)?.value, bounds.inputMin, bounds.inputMax);
  const step = clampInt(container.querySelector(`#${cssEscape(idPrefix)}_step`)?.value, 1, Math.max(1, bounds.inputMax - bounds.inputMin));
  const valuesRaw = container.querySelector(`#${cssEscape(idPrefix)}_values`)?.value ?? "";
  const modeEls = Array.from(container.querySelectorAll(`input[name="${cssEscape(idPrefix)}_mode"]`));
  const mode = getCheckedMinMaxMode(modeEls);

  return normalizeNumericConstraint({
    min,
    max,
    mode,
    start,
    step,
    values: valuesRaw
  }, {
    inputMin: bounds.inputMin,
    inputMax: bounds.inputMax,
    defaultMin: min,
    defaultMax: max,
    defaultStart: min,
    defaultStep: 1,
    defaultValues: []
  });
}

function updateMinMaxPreview(container, idPrefix, {
  inputMin = 0,
  inputMax = 99
} = {}) {
  const previewEl = container.querySelector(`#${cssEscape(idPrefix)}_preview`);
  if (!previewEl) return;

  const constraint = getMinMaxConstraintState(container, idPrefix, { inputMin, inputMax });
  previewEl.textContent = formatConstraintPreview(constraint.allowedValues);
}

function resolveMinMaxConstraintBounds(container, idPrefix, {
  inputMin = 0,
  inputMax = 99
} = {}) {
  const minEl = container.querySelector(`#${cssEscape(idPrefix)}_min`);
  const rawMin = Number(minEl?.getAttribute("min"));
  const rawMax = Number(minEl?.getAttribute("max"));

  return {
    inputMin: Number.isFinite(rawMin) ? rawMin : inputMin,
    inputMax: Number.isFinite(rawMax) ? Math.max(Number.isFinite(rawMin) ? rawMin : inputMin, rawMax) : inputMax
  };
}

export function clampInt(v, min, max){
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function renderStepperControl({
  id,
  label,
  value,
  inputMin,
  inputMax,
  step = 1,
  showInlineLabel = true,
  labelId = null
}){
  const effectiveLabelId = labelId || `${id}_label`;

  return `
    <div class="tv-stepper${showInlineLabel ? "" : " tv-stepper-no-inline-label"}" role="group" aria-label="${escapeHtml(label)}">
      ${showInlineLabel ? `<span class="tv-label tv-stepper-label" id="${effectiveLabelId}">${escapeHtml(label)} :</span>` : ""}

      <button
        class="tv-stepper-btn"
        type="button"
        data-stepper-target="${id}"
        data-stepper-direction="-1"
        aria-label="Diminuer ${escapeHtml(label)}"
      >
        <span class="tv-stepper-icon" aria-hidden="true">remove</span>
      </button>

      <input
        class="tv-input tv-input-stepper"
        type="number"
        id="${id}"
        min="${inputMin}"
        max="${inputMax}"
        step="${step}"
        value="${value}"
        inputmode="numeric"
        aria-labelledby="${effectiveLabelId}"
      >

      <button
        class="tv-stepper-btn"
        type="button"
        data-stepper-target="${id}"
        data-stepper-direction="1"
        aria-label="Augmenter ${escapeHtml(label)}"
      >
        <span class="tv-stepper-icon" aria-hidden="true">add</span>
      </button>
    </div>
  `;
}

function bindStepper(input, {
  inputMin = 0,
  inputMax = 99,
  onChange = null
} = {}){
  const wrap = input.closest(".tv-stepper");
  if (!wrap) return;

  const minusBtn = wrap.querySelector('[data-stepper-direction="-1"]');
  const plusBtn = wrap.querySelector('[data-stepper-direction="1"]');
  const stepValue = Math.max(1, Number(input.step) || 1);
  const holdDelayMs = 350;
  const holdIntervalMs = 60;

  function applyStep(direction){
    const bounds = resolveStepperBounds(input, { inputMin, inputMax });
    const current = clampInt(Number(input.value), bounds.min, bounds.max);
    const next = clampInt(current + (direction * stepValue), bounds.min, bounds.max);

    if (next === current){
      syncStepperUI(input, { inputMin, inputMax });
      return false;
    }

    input.value = String(next);
    syncStepperUI(input, { inputMin, inputMax });
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  function bindStepperButtonHold(button, direction){
    if (!button) return;

    let holdTimeoutId = null;
    let holdIntervalId = null;
    let pointerId = null;
    let suppressNextClick = false;

    const stopHold = () => {
      if (holdTimeoutId !== null) {
        window.clearTimeout(holdTimeoutId);
        holdTimeoutId = null;
      }
      if (holdIntervalId !== null) {
        window.clearInterval(holdIntervalId);
        holdIntervalId = null;
      }
      pointerId = null;
    };

    button.addEventListener("pointerdown", (event) => {
      if (button.disabled || event.button !== 0) return;

      suppressNextClick = true;
      pointerId = event.pointerId;
      button.setPointerCapture?.(event.pointerId);
      event.preventDefault();

      if (!applyStep(direction)) {
        stopHold();
        return;
      }

      holdTimeoutId = window.setTimeout(() => {
        holdTimeoutId = null;
        holdIntervalId = window.setInterval(() => {
          if (!applyStep(direction)) {
            stopHold();
          }
        }, holdIntervalMs);
      }, holdDelayMs);
    });

    button.addEventListener("pointerup", stopHold);
    button.addEventListener("pointercancel", stopHold);
    button.addEventListener("lostpointercapture", stopHold);

    button.addEventListener("click", (event) => {
      if (suppressNextClick) {
        suppressNextClick = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      applyStep(direction);
    });
  }

  bindStepperButtonHold(minusBtn, -1);
  bindStepperButtonHold(plusBtn, 1);

  input.addEventListener("input", () => {
    const bounds = resolveStepperBounds(input, { inputMin, inputMax });
    syncStepperUI(input, { inputMin, inputMax });
    onChange?.(clampInt(input.value, bounds.min, bounds.max));
  });

  input.addEventListener("change", () => {
    const bounds = resolveStepperBounds(input, { inputMin, inputMax });
    input.value = String(clampInt(input.value, bounds.min, bounds.max));
    syncStepperUI(input, { inputMin, inputMax });
    onChange?.(clampInt(input.value, bounds.min, bounds.max));
  });

  syncStepperUI(input, { inputMin, inputMax });
}

function syncStepperUI(input, {
  inputMin = 0,
  inputMax = 99
} = {}){
  const wrap = input.closest(".tv-stepper");
  if (!wrap) return;

  const bounds = resolveStepperBounds(input, { inputMin, inputMax });
  const value = clampInt(input.value, bounds.min, bounds.max);
  const minusBtn = wrap.querySelector('[data-stepper-direction="-1"]');
  const plusBtn = wrap.querySelector('[data-stepper-direction="1"]');

  if (input.disabled) {
    if (minusBtn) minusBtn.disabled = true;
    if (plusBtn) plusBtn.disabled = true;
    return;
  }

  if (minusBtn) minusBtn.disabled = value <= bounds.min;
  if (plusBtn) plusBtn.disabled = value >= bounds.max;
}

function resolveStepperBounds(input, {
  inputMin = 0,
  inputMax = 99
} = {}){
  const rawMin = input?.getAttribute("min");
  const rawMax = input?.getAttribute("max");

  const parsedMin = rawMin !== null && rawMin !== "" ? Number(rawMin) : NaN;
  const parsedMax = rawMax !== null && rawMax !== "" ? Number(rawMax) : NaN;

  const min = Number.isFinite(parsedMin) ? parsedMin : inputMin;
  const max = Number.isFinite(parsedMax) ? parsedMax : inputMax;

  return {
    min,
    max: Math.max(min, max)
  };
}

function renderCustomSelectControl({
  id,
  value,
  options = [],
  rootClassName = "",
  disabled = false
}){
  const safeOptions = Array.isArray(options) ? options : [];
  const normalized = safeOptions.map((opt) => ({
    value: String(opt?.value ?? ""),
    label: String(opt?.label ?? opt?.value ?? "")
  }));

  const selectedOption = normalized.find((opt) => opt.value === String(value)) || normalized[0] || { value: "", label: "" };

  const optionsHtml = normalized.map((opt) => {
    const isSelected = opt.value === selectedOption.value;
    return `
      <button
        class="tv-custom-select-option ${isSelected ? "is-selected" : ""}"
        type="button"
        role="option"
        data-value="${escapeHtml(opt.value)}"
        data-label="${escapeHtml(opt.label)}"
        aria-selected="${isSelected ? "true" : "false"}"
      >
        ${escapeHtml(opt.label)}
      </button>
    `;
  }).join("");

  return `
    <div class="tv-custom-select ${rootClassName}" data-tv-select="${escapeHtml(id)}">
      <input type="hidden" id="${id}" value="${escapeHtml(selectedOption.value)}">

      <button
        class="tv-input tv-custom-select-trigger"
        type="button"
        id="${id}_trigger"
        aria-haspopup="listbox"
        aria-expanded="false"
        ${disabled ? "disabled" : ""}
      >
        <span class="tv-custom-select-text">${escapeHtml(selectedOption.label)}</span>
        <span class="tv-stepper-icon tv-custom-select-chevron" aria-hidden="true">expand_more</span>
      </button>

      <div class="tv-custom-select-menu" role="listbox" aria-labelledby="${id}_trigger">
        ${optionsHtml}
      </div>
    </div>
  `;
}

function cssEscape(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
