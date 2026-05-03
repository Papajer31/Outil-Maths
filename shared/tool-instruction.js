const TOOL_INSTRUCTION_STYLE_DATASET = "toolInstructionStyle";

export const TOOL_INSTRUCTION_CLASS = "tool-instruction";

export function ensureToolInstructionStyles() {
  if (typeof document === "undefined") return;

  const href = new URL("./tool-instruction.css", import.meta.url).href;
  if (document.querySelector(`link[data-${toKebabCase(TOOL_INSTRUCTION_STYLE_DATASET)}="${href}"]`)) {
    return;
  }

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset[TOOL_INSTRUCTION_STYLE_DATASET] = href;
  document.head.appendChild(link);
}

export function renderToolInstruction({ id = "", className = "" } = {}) {
  const classes = [TOOL_INSTRUCTION_CLASS, String(className || "").trim()]
    .filter(Boolean)
    .join(" ");
  const idAttr = String(id || "").trim() ? ` id="${escapeHtml(id)}"` : "";
  return `<div${idAttr} class="${escapeHtml(classes)}" aria-live="polite"></div>`;
}

export function setToolInstructionText(element, text = "") {
  if (!element) return "";

  const normalizedText = String(text ?? "").trim();
  element.textContent = normalizedText;
  element.hidden = !normalizedText;
  element.classList.toggle("is-empty", !normalizedText);
  return normalizedText;
}

export function resolveToolInstructionText(context = {}, fallbackText = "") {
  const defaultInstruction = String(context?.defaultInstruction ?? fallbackText ?? "").trim();
  const custom = getCustomInstructionState(context);
  return custom.enabled && custom.text ? custom.text : defaultInstruction;
}

export function resolveQuestionInstructionText(context = {}, questionText = "", fallbackText = "") {
  const custom = getCustomInstructionState(context);
  if (custom.enabled && custom.text) {
    return custom.text;
  }

  return String(questionText || context?.defaultInstruction || fallbackText || "").trim();
}

export function getCustomInstructionState(context = {}) {
  const supportsCustomInstruction = context?.supportsCustomInstruction !== false;
  const common = getCommonSettings(context?.settings);
  const instruction = common && typeof common.instruction === "object" && !Array.isArray(common.instruction)
    ? common.instruction
    : null;
  const text = instruction && instruction.enabled === true
    ? String(instruction.text ?? "").trim()
    : "";

  return {
    enabled: supportsCustomInstruction && instruction?.enabled === true && !!text,
    text
  };
}

function getCommonSettings(settings) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return {};
  }

  if (settings.common && typeof settings.common === "object" && !Array.isArray(settings.common)) {
    return settings.common;
  }

  return settings;
}

function toKebabCase(value) {
  return String(value || "")
    .replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)
    .replace(/^-/, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
