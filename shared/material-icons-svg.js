const MATERIAL_ICON_DEFINITIONS = {
  arrow_back: {
    viewBox: "0 0 24 24",
    paths: ["M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20v-2z"]
  },
  arrow_forward: {
    viewBox: "0 0 24 24",
    paths: ["M12 4l-1.42 1.41L16.17 11H4v2h12.17l-5.59 5.59L12 20l8-8-8-8z"]
  },
  pause: {
    viewBox: "0 0 24 24",
    paths: ["M6 19h4V5H6v14zm8-14v14h4V5h-4z"]
  },
  play_arrow: {
    viewBox: "0 0 24 24",
    paths: ["M8 5v14l11-7z"]
  },
  skip_previous: {
    viewBox: "0 0 24 24",
    paths: ["M6 6h2v12H6V6zm3.5 6 8.5 6V6l-8.5 6z"]
  },
  skip_next: {
    viewBox: "0 0 24 24",
    paths: ["M16 6h2v12h-2V6zM6 18l8.5-6L6 6v12z"]
  },
  sync: {
    viewBox: "0 0 24 24",
    paths: ["M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.96-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zM6.7 9.2 5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3c-3.31 0-6-2.69-6-6 0-1.01.25-1.96.7-2.8z"]
  },
  sync_alt: {
    viewBox: "0 0 24 24",
    paths: ["M18 12l4-4-4-4v3H3v2h15v3zM6 12l-4 4 4 4v-3h15v-2H6v-3z"]
  },
  visibility: {
    viewBox: "0 0 24 24",
    paths: ["M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"]
  },
  task_alt: {
    viewBox: "0 0 24 24",
    paths: ["M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"]
  }
};

export function renderMaterialIcon(name, { className = "student-icon", id = "" } = {}) {
  const safeClassName = String(className || "").trim();
  const idAttr = String(id || "").trim() ? ` id="${escapeHtml(id)}"` : "";
  return `
    <span${idAttr} class="${escapeHtml(safeClassName)}" aria-hidden="true">
      ${renderMaterialIconSvg(name)}
    </span>
  `;
}

export function renderMaterialIconSvg(name) {
  const { definition, resolvedName } = getMaterialIconDefinition(name);
  const paths = definition.paths
    .map((path) => `<path d="${escapeHtml(path)}"></path>`)
    .join("");

  return `
    <svg
      class="material-icon-svg"
      viewBox="${escapeHtml(definition.viewBox)}"
      focusable="false"
      aria-hidden="true"
      data-material-icon="${escapeHtml(resolvedName)}"
    >${paths}</svg>
  `;
}

export function setMaterialIcon(element, name) {
  if (!element) return "";
  const { resolvedName } = getMaterialIconDefinition(name);
  element.innerHTML = renderMaterialIconSvg(resolvedName);
  return resolvedName;
}

function getMaterialIconDefinition(name) {
  const safeName = String(name || "").trim();
  const resolvedName = MATERIAL_ICON_DEFINITIONS[safeName] ? safeName : "sync";
  return {
    definition: MATERIAL_ICON_DEFINITIONS[resolvedName],
    resolvedName
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
