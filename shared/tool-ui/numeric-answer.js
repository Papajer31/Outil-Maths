/*
  Brique commune de réponse numérique pour les outils de calcul.

  Objectifs :
  - affichage visuel maîtrisé, indépendant des métriques natives de l'input ;
  - saisie verrouillée aux chiffres ;
  - compatibilité avec un futur clavier numérique custom via l'API appendDigit/backspace/clear ;
  - capture clavier globale optionnelle pour éviter le "ça n'écrit pas" en classe.
*/

import { countIntegerDigits, formatIntegerForDisplay } from "./number-format.js";

const DIGIT_RE = /^\d$/;
const EDITABLE_SELECTOR = "input, textarea, select, [contenteditable='true'], [contenteditable='']";

export function createNumericAnswerControl(options = {}) {
  const {
    id = "",
    className = "",
    ariaLabel = "Réponse",
    value = "",
    maxLength = null,
    readOnly = false,
    captureKeyboard = true,
    captureRoot = null,
    onInput = null,
    onSubmit = null
  } = options;

  const root = document.createElement("div");
  root.className = normalizeClassName(`tool-answer-box tool-answer-input tool-numeric-answer ${className}`);
  root.setAttribute("role", "textbox");
  root.setAttribute("aria-label", ariaLabel || "Réponse");
  root.dataset.numericAnswer = "true";

  const input = document.createElement("input");
  input.className = "tool-numeric-answer__native";
  if (id) input.id = id;
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.autocapitalize = "off";
  input.spellcheck = false;
  input.setAttribute("aria-hidden", "true");
  input.tabIndex = readOnly ? -1 : 0;
  input.readOnly = Boolean(readOnly);

  const display = document.createElement("span");
  display.className = "tool-numeric-answer__display";
  display.setAttribute("aria-hidden", "true");

  root.append(input, display);

  const controller = new AbortController();
  const signal = controller.signal;
  let internalValue = "";
  let lastEmittedValue = "";

  // Dans les outils de calcul, maxLength représente la longueur de la réponse
  // attendue. On autorise un chiffre de plus pour laisser l'élève se tromper
  // naturellement, tout en gardant une boîte dimensionnée à réponse + 2.
  const expectedLength = normalizeMaxLength(maxLength);
  const inputMaxLength = expectedLength ? expectedLength + 1 : null;
  const visualCharacterCount = expectedLength ? Math.max(4, expectedLength + 2) : 4;
  root.style.setProperty("--tool-numeric-answer-chars", String(visualCharacterCount));
  root.dataset.expectedLength = String(expectedLength || "");
  root.dataset.inputMaxLength = String(inputMaxLength || "");

  function sanitize(valueToSanitize) {
    return sanitizeNumericAnswer(valueToSanitize, { maxLength: inputMaxLength });
  }

  function syncDisplay() {
    const visibleValue = internalValue ? formatIntegerForDisplay(internalValue) : "\u00a0";
    display.textContent = visibleValue;
    root.classList.toggle("is-empty", !internalValue);
    root.setAttribute("aria-valuetext", internalValue || "vide");
    input.value = internalValue;
  }

  function emitInput() {
    if (internalValue === lastEmittedValue) return;
    lastEmittedValue = internalValue;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    if (typeof onInput === "function") onInput(internalValue);
  }

  function setValue(nextValue, { emit = true } = {}) {
    const sanitized = sanitize(nextValue);
    if (sanitized === internalValue) {
      syncDisplay();
      return internalValue;
    }
    internalValue = sanitized;
    syncDisplay();
    if (emit) emitInput();
    return internalValue;
  }

  function appendDigit(digit) {
    if (readOnly || !DIGIT_RE.test(String(digit))) return internalValue;
    return setValue(`${internalValue}${digit}`);
  }

  function backspace() {
    if (readOnly || !internalValue) return internalValue;
    return setValue(internalValue.slice(0, -1));
  }

  function clear() {
    if (readOnly) return internalValue;
    return setValue("");
  }

  function submit() {
    if (readOnly) return;
    if (typeof onSubmit === "function") onSubmit(internalValue);
  }

  function focus() {
    if (readOnly) return;
    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus?.();
    }
  }

  function handleKeydown(event, { global = false } = {}) {
    if (readOnly || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return false;

    if (global && shouldIgnoreGlobalKey(event, root, captureRoot)) return false;

    const key = event.key;
    if (DIGIT_RE.test(key)) {
      event.preventDefault();
      event.stopImmediatePropagation?.();
      event.stopPropagation();
      appendDigit(key);
      focus();
      return true;
    }

    if (key === "Backspace") {
      event.preventDefault();
      event.stopImmediatePropagation?.();
      event.stopPropagation();
      backspace();
      focus();
      return true;
    }

    if (key === "Delete") {
      event.preventDefault();
      event.stopImmediatePropagation?.();
      event.stopPropagation();
      clear();
      focus();
      return true;
    }

    if (key === "Enter") {
      event.preventDefault();
      event.stopImmediatePropagation?.();
      event.stopPropagation();
      submit();
      focus();
      return true;
    }

    if (isAllowedNavigationKey(key)) return false;

    event.preventDefault();
    event.stopImmediatePropagation?.();
      event.stopPropagation();
    focus();
    return true;
  }

  root.addEventListener("pointerdown", (event) => {
    if (readOnly) return;
    event.preventDefault();
    focus();
  }, { signal });

  root.addEventListener("dragstart", preventDefault, { signal });
  root.addEventListener("dragover", preventDefault, { signal });
  root.addEventListener("drop", preventDefault, { signal });
  input.addEventListener("drop", preventDefault, { signal });

  input.addEventListener("keydown", (event) => {
    handleKeydown(event, { global: false });
  }, { signal });

  input.addEventListener("beforeinput", (event) => {
    if (readOnly) return;
    const type = String(event.inputType || "");
    const data = String(event.data || "");
    if (type.startsWith("delete")) return;
    if (data && !/^\d+$/.test(data)) {
      event.preventDefault();
      focus();
    }
  }, { signal });

  input.addEventListener("input", () => {
    if (readOnly) return;
    const sanitized = sanitize(input.value);
    if (sanitized !== internalValue) {
      internalValue = sanitized;
      syncDisplay();
      emitInput();
    } else {
      syncDisplay();
    }
  }, { signal });

  input.addEventListener("paste", (event) => {
    if (readOnly) return;
    event.preventDefault();
    const pasted = event.clipboardData?.getData("text") ?? "";
    setValue(`${internalValue}${pasted}`);
    focus();
  }, { signal });

  if (captureKeyboard && !readOnly) {
    document.addEventListener("keydown", (event) => {
      handleKeydown(event, { global: true });
    }, { capture: true, signal });
  }

  setValue(value, { emit: false });
  lastEmittedValue = internalValue;

  return {
    element: root,
    root,
    input,
    display,
    getValue: () => internalValue,
    setValue,
    appendDigit,
    backspace,
    clear,
    submit,
    focus,
    destroy() {
      controller.abort();
    }
  };
}

export function renderNumericAnswerDisplayMarkup(value, options = {}) {
  const {
    className = "",
    ariaLabel = "Réponse affichée"
  } = options;
  const safeValue = sanitizeNumericAnswer(value);
  const displayValue = safeValue ? formatIntegerForDisplay(safeValue) : "\u00a0";
  const visualCharacterCount = Math.max(4, countIntegerDigits(safeValue) + 2);
  return `
    <div class="${escapeHtml(normalizeClassName(`tool-answer-box tool-answer-input tool-answer-display tool-numeric-answer tool-numeric-answer--readonly ${className}`))}"
         role="textbox"
         aria-label="${escapeHtml(ariaLabel)}"
         aria-readonly="true"
         data-numeric-answer="true"
         style="--tool-numeric-answer-chars:${visualCharacterCount}">
      <span class="tool-numeric-answer__display" aria-hidden="true">${escapeHtml(displayValue)}</span>
    </div>
  `;
}

export function sanitizeNumericAnswer(value, { maxLength = null } = {}) {
  const digits = String(value ?? "").replace(/\D+/g, "");
  const max = normalizeMaxLength(maxLength);
  return max ? digits.slice(0, max) : digits;
}

function shouldIgnoreGlobalKey(event, root, captureRoot) {
  const target = event.target;
  if (!target || !(target instanceof Element)) return false;
  if (root.contains(target)) return false;

  // On capte aussi les chiffres si le focus est sur un bouton ou un élément
  // décoratif du runtime. En revanche, on respecte les vrais champs éditables
  // extérieurs à la brique pour ne pas polluer l'éditeur enseignant.
  const editable = target.closest?.(EDITABLE_SELECTOR);
  if (!editable) return false;

  // Les champs internes de la brique numérique sont gérés par la brique elle-même.
  if (root.contains(editable)) return false;

  return true;
}

function isAllowedNavigationKey(key) {
  return key === "Tab" || key === "Shift" || key === "Escape" || key.startsWith("Arrow") || key === "Home" || key === "End";
}

function preventDefault(event) {
  event.preventDefault();
}

function normalizeMaxLength(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeClassName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
