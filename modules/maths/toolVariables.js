export function renderSection(title, innerHtml){
  return `
    <div class="tv-group">
      <div class="tv-group-title">${escapeHtml(title)}</div>
      ${innerHtml}
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
  const block = `
    <div class="tv-row-minmax">
      <div class="tv-minmax-pair">
        <label class="tv-label" for="${idPrefix}_min">${escapeHtml(minLabel)}</label>
        <input
          class="tv-input tv-input-minmax"
          type="number"
          id="${idPrefix}_min"
          min="${inputMin}"
          max="${inputMax}"
          step="${step}"
          value="${minValue}"
        >
      </div>

      <div class="tv-minmax-pair">
        <label class="tv-label" for="${idPrefix}_max">${escapeHtml(maxLabel)}</label>
        <input
          class="tv-input tv-input-minmax"
          type="number"
          id="${idPrefix}_max"
          min="${inputMin}"
          max="${inputMax}"
          step="${step}"
          value="${maxValue}"
        >
      </div>
    </div>
  `;

  return title ? renderSection(title, block) : block;
}

export function bindMinMax(container, idPrefix, {
  inputMin = 0,
  inputMax = 99
} = {}){
  const minEl = container.querySelector(`#${idPrefix}_min`);
  const maxEl = container.querySelector(`#${idPrefix}_max`);
  if (!minEl || !maxEl) return;

  const sync = () => {
    minEl.value = String(clampInt(minEl.value, inputMin, inputMax));
    maxEl.value = String(clampInt(maxEl.value, inputMin, inputMax));

    if (Number(minEl.value) > Number(maxEl.value)){
      minEl.value = maxEl.value;
    }
  };

  minEl.addEventListener("input", sync);
  maxEl.addEventListener("input", sync);
  minEl.addEventListener("change", sync);
  maxEl.addEventListener("change", sync);

  sync();
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
  options = []
}){
  const optionsHtml = options.map(opt => {
    const v = String(opt.value);
    const selected = String(value) === v ? "selected" : "";
    return `<option value="${escapeHtml(v)}" ${selected}>${escapeHtml(opt.label)}</option>`;
  }).join("");

  return `
    <div class="tv-row">
      <label class="tv-label" for="${id}">${escapeHtml(label)}</label>
      <select class="tv-input tv-select" id="${id}">
        ${optionsHtml}
      </select>
    </div>
  `;
}

export function readSelect(container, id, {
  parse = (v) => v
} = {}){
  const el = container.querySelector(`#${id}`);
  return parse(el?.value ?? "");
}

export function clampInt(v, min, max){
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}