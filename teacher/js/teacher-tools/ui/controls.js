import { escapeAttr, escapeHtml } from "../../dashboard/text-utils.js";

export function renderSelectControl({ id, label, value = "", options = [], groups = [], hint = "", disabled = false } = {}){
  const renderOptions = (items = []) => items.map((option) => `
    <option value="${escapeAttr(option.value)}" ${String(option.value) === String(value) ? "selected" : ""}>${escapeHtml(option.label)}</option>
  `).join("");
  const grouped = groups.length
    ? groups.map((group) => `<optgroup label="${escapeAttr(group.label)}">${renderOptions(group.options)}</optgroup>`).join("")
    : renderOptions(options);
  return `
    <label class="tt-ui-field" for="${escapeAttr(id)}">
      <span class="tt-ui-field-label">${escapeHtml(label)}</span>
      <select id="${escapeAttr(id)}" class="tt-ui-select" ${disabled ? "disabled" : ""}>${grouped}</select>
      ${hint ? `<span class="tt-ui-field-hint">${escapeHtml(hint)}</span>` : ""}
    </label>
  `;
}

export function renderActionButton({ id = "", label, icon = "", className = "", disabled = false, attrs = "" } = {}){
  return `
    <button ${id ? `id="${escapeAttr(id)}"` : ""} class="tt-ui-button ${escapeAttr(className)}" type="button" ${disabled ? "disabled" : ""} ${attrs}>
      ${icon ? `<span class="dashboard-material-icon" aria-hidden="true">${escapeHtml(icon)}</span>` : ""}
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

export function renderIconButton({ id = "", label, icon, className = "", disabled = false, attrs = "" } = {}){
  return `
    <button ${id ? `id="${escapeAttr(id)}"` : ""} class="tt-ui-icon-button ${escapeAttr(className)}" type="button" aria-label="${escapeAttr(label)}" title="${escapeAttr(label)}" ${disabled ? "disabled" : ""} ${attrs}>
      <span class="dashboard-material-icon" aria-hidden="true">${escapeHtml(icon)}</span>
    </button>
  `;
}
