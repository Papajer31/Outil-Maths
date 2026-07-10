/*
  Clavier numérique commun pour les outils qui utilisent createNumericAnswerControl.

  La brique ne stocke pas la réponse : elle se contente d'envoyer les touches
  au contrôle numérique fourni. Les outils gardent donc leur logique de
  validation et leur style propre.
*/

export function renderNumericKeypad(options = {}) {
  const {
    hidden = false,
    rootClassName = "",
    buttonClassName = "",
    clearButtonClassName = "",
    dataAttribute = "data-tool-numeric-key",
    ariaLabel = "Clavier numérique"
  } = options;

  const safeDataAttribute = normalizeDataAttribute(dataAttribute);
  const rootClasses = normalizeClassName(`tool-numeric-keypad ${rootClassName} ${hidden ? "tool-numeric-keypad--hidden" : ""}`);
  const attrs = hidden
    ? ' aria-hidden="true" inert'
    : ` role="group" aria-label="${escapeHtml(ariaLabel)}"`;

  return `
    <div class="${escapeHtml(rootClasses)}"${attrs}>
      ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => renderNumericKeypadButton({
        action: String(digit),
        label: String(digit),
        dataAttribute: safeDataAttribute,
        buttonClassName,
        disabled: hidden
      })).join("")}
      ${renderNumericKeypadButton({
        action: "clear",
        label: renderTrashIcon(),
        ariaLabel: "Effacer la réponse",
        dataAttribute: safeDataAttribute,
        buttonClassName: normalizeClassName(`${buttonClassName} ${clearButtonClassName}`),
        disabled: hidden
      })}
    </div>
  `;
}

export function bindNumericKeypadEvents(options = {}) {
  const {
    root,
    control,
    signal = undefined,
    dataAttribute = "data-tool-numeric-key",
    onAfterInput = null,
    disabled = false
  } = options;

  if (!root || !control || disabled) return;
  const safeDataAttribute = normalizeDataAttribute(dataAttribute);
  const selector = `[${cssEscape(safeDataAttribute)}]`;

  root.querySelectorAll(selector).forEach((button) => {
    button.addEventListener("click", () => {
      const key = String(button.getAttribute(safeDataAttribute) || "");
      if (/^\d$/.test(key)) {
        control.appendDigit?.(key);
      } else if (key === "clear") {
        control.clear?.();
      } else if (key === "backspace") {
        control.backspace?.();
      }
      control.focus?.();
      onAfterInput?.(key);
    }, signal ? { signal } : undefined);
  });
}

function renderNumericKeypadButton({
  action,
  label,
  ariaLabel = "",
  dataAttribute,
  buttonClassName = "",
  disabled = false
} = {}) {
  const classes = normalizeClassName(`tool-choice-button tool-numeric-keypad-button ${buttonClassName}`);
  return `
    <button class="${escapeHtml(classes)}" type="button" ${dataAttribute}="${escapeHtml(action)}" aria-label="${escapeHtml(ariaLabel || label)}" ${disabled ? 'disabled tabindex="-1"' : ""}>
      ${label}
    </button>
  `;
}

function renderTrashIcon() {
  return `
    <svg viewBox="0 -960 960 960" aria-hidden="true" focusable="false">
      <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z" fill="currentColor"/>
    </svg>
  `;
}

function normalizeDataAttribute(value) {
  const raw = String(value || "").trim();
  if (/^data-[a-z0-9_-]+$/i.test(raw)) return raw;
  return "data-tool-numeric-key";
}

function normalizeClassName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function cssEscape(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
