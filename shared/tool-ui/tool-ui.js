const TOOL_UI_STYLE_DATASET = "toolUiStyle";

export function ensureToolUiStyles() {
  if (typeof document === "undefined") return;

  const href = new URL("./tool-ui.css", import.meta.url).href;
  if (document.querySelector(`link[data-${toKebabCase(TOOL_UI_STYLE_DATASET)}="${href}"]`)) {
    return;
  }

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset[TOOL_UI_STYLE_DATASET] = href;
  document.head.appendChild(link);
}

function toKebabCase(value) {
  return String(value || "")
    .replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)
    .replace(/^-/, "");
}
