export function renderSection(title, innerHtml){
  return `
    <div class="tv-group">
      <div class="tv-group-title">${escapeHtml(title)}</div>
      ${innerHtml}
    </div>
  `;
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
  step = 1
}){
  const minSafe = clampInt(minValue, inputMin, inputMax);
  const maxSafe = clampInt(maxValue, inputMin, inputMax);

  const block = `
    <div class="tv-minmax-inline">
      ${title ? `<div class="tv-group-title tv-minmax-title">${escapeHtml(title)}</div>` : ""}

      <div class="tv-minmax-controls">
        ${renderStepperControl({
          id: `${idPrefix}_min`,
          label: minLabel,
          value: minSafe,
          inputMin,
          inputMax,
          step
        })}

        ${renderStepperControl({
          id: `${idPrefix}_max`,
          label: maxLabel,
          value: maxSafe,
          inputMin,
          inputMax,
          step
        })}
      </div>
    </div>
  `;

  return title ? `<div class="tv-group tv-group-inline">${block}</div>` : block;
}

export function bindMinMax(container, idPrefix, {
  inputMin = 0,
  inputMax = 99
} = {}){
  const minEl = container.querySelector(`#${idPrefix}_min`);
  const maxEl = container.querySelector(`#${idPrefix}_max`);
  if (!minEl || !maxEl) return;

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

    min = clampInt(min, minBounds.min, minBounds.max);
    max = clampInt(max, maxBounds.min, maxBounds.max);

    minEl.value = String(min);
    maxEl.value = String(max);

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
  const min = clampInt(container.querySelector(`#${idPrefix}_min`)?.value, inputMin, inputMax);
  const max = clampInt(container.querySelector(`#${idPrefix}_max`)?.value, inputMin, inputMax);

  if (min > max){
    throw new Error(`${errorLabel} sont invalides.`);
  }

  return { min, max };
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

  minusBtn?.addEventListener("click", () => {
    const bounds = resolveStepperBounds(input, { inputMin, inputMax });
    const next = clampInt(Number(input.value) - stepValue, bounds.min, bounds.max);
    input.value = String(next);
    syncStepperUI(input, { inputMin, inputMax });
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  plusBtn?.addEventListener("click", () => {
    const bounds = resolveStepperBounds(input, { inputMin, inputMax });
    const next = clampInt(Number(input.value) + stepValue, bounds.min, bounds.max);
    input.value = String(next);
    syncStepperUI(input, { inputMin, inputMax });
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

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
