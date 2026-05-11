const TOOL_INSTRUCTION_STYLE_DATASET = "toolInstructionStyle";

export const TOOL_INSTRUCTION_CLASS = "tool-instruction";
const TOOL_INSTRUCTION_RESERVED_SPACE_PREFIX = "\uE000tool-instruction-reserved-space:";

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

  const rawText = String(text ?? "");
  if (rawText.startsWith(TOOL_INSTRUCTION_RESERVED_SPACE_PREFIX)) {
    const reservedText = rawText.slice(TOOL_INSTRUCTION_RESERVED_SPACE_PREFIX.length).trim();
    element.textContent = reservedText || "\u00A0";
    element.hidden = false;
    element.classList.remove("is-empty");
    element.classList.add("is-reserved-space");
    element.setAttribute("aria-hidden", "true");
    return "";
  }

  const normalizedText = rawText.trim();
  element.classList.remove("is-reserved-space");
  element.removeAttribute("aria-hidden");
  element.textContent = normalizedText;
  element.hidden = !normalizedText;
  element.classList.toggle("is-empty", !normalizedText);
  return normalizedText;
}

export function resolveToolInstructionText(context = {}, fallbackText = "") {
  const resolvedText = resolveToolInstructionDisplayText(context, fallbackText);
  if (shouldReserveInstructionSpace(context)) {
    return reserveInstructionSpace(resolvedText);
  }

  return resolvedText;
}

export function resolveQuestionInstructionText(context = {}, questionText = "", fallbackText = "") {
  const resolvedText = resolveQuestionInstructionDisplayText(context, questionText, fallbackText);
  if (shouldReserveInstructionSpace(context)) {
    return reserveInstructionSpace(resolvedText);
  }

  return resolvedText;
}

function resolveToolInstructionDisplayText(context = {}, fallbackText = "") {
  const defaultInstruction = String(context?.defaultInstruction ?? fallbackText ?? "").trim();
  const custom = getCustomInstructionState(context);
  return custom.enabled && custom.text ? custom.text : defaultInstruction;
}

function resolveQuestionInstructionDisplayText(context = {}, questionText = "", fallbackText = "") {
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

export function shouldReserveInstructionSpace(context = {}) {
  const supportsCustomInstruction = context?.supportsCustomInstruction !== false;
  const common = getCommonSettings(context?.settings);
  const instruction = common && typeof common.instruction === "object" && !Array.isArray(common.instruction)
    ? common.instruction
    : null;

  return supportsCustomInstruction && instruction?.hidden === true;
}

function reserveInstructionSpace(text = "") {
  return `${TOOL_INSTRUCTION_RESERVED_SPACE_PREFIX}${String(text ?? "").trim()}`;
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
