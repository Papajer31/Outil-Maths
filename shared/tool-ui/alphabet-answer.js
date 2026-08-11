/*
  Brique commune de réponse alphabétique.

  Objectifs :
  - ne jamais déclencher le clavier virtuel du système sur tablette ;
  - accepter le clavier physique sur PC ;
  - exposer une petite API compatible avec le clavier alphabétique commun ;
  - laisser chaque outil décider des caractères autorisés et de la validation.
*/

import { ensureToolUiStyles } from "./tool-ui.js";

const LETTER_RE = /^\p{L}$/u;
const EDITABLE_SELECTOR = "input, textarea, select, [contenteditable='true'], [contenteditable='']";

export function createAlphabetAnswerControl(options = {}) {
  ensureToolUiStyles();

  const {
    className = "",
    ariaLabel = "Réponse",
    value = "",
    placeholder = "",
    maxLength = null,
    readOnly = false,
    lowercase = true,
    allowSpace = false,
    allowApostrophe = false,
    allowHyphen = false,
    allowedCharacters = null,
    captureKeyboard = true,
    captureRoot = null,
    onInput = null,
    onSubmit = null
  } = options;

  const root = document.createElement("div");
  root.className = normalizeClassName(`tool-answer-box tool-answer-input tool-alphabet-answer ${className}`);
  root.setAttribute("role", "textbox");
  root.setAttribute("aria-label", ariaLabel || "Réponse");
  root.setAttribute("aria-readonly", readOnly ? "true" : "false");
  root.dataset.alphabetAnswer = "true";
  root.tabIndex = readOnly ? -1 : 0;

  const display = document.createElement("span");
  display.className = "tool-alphabet-answer__display";
  display.setAttribute("aria-hidden", "true");
  root.append(display);

  const controller = new AbortController();
  const signal = controller.signal;
  const max = normalizeMaxLength(maxLength);
  const allowed = normalizeAllowedCharacters(allowedCharacters, { lowercase });
  let internalValue = "";
  let lastEmittedValue = "";
  let pendingDeadAccent = "";

  function normalizeCharacter(valueToNormalize) {
    let character = String(valueToNormalize ?? "").normalize("NFC");
    if (lowercase) character = character.toLocaleLowerCase("fr-FR");
    if (character === "’") character = "'";
    return character;
  }

  function isAllowedCharacter(character) {
    const normalized = normalizeCharacter(character);
    if (!normalized) return false;
    if (normalized === " ") return allowSpace;
    if (normalized === "'") return allowApostrophe;
    if (normalized === "-") return allowHyphen;
    if (!LETTER_RE.test(normalized)) return false;
    return !allowed || allowed.has(normalized);
  }

  function sanitize(rawValue) {
    const source = String(rawValue ?? "").normalize("NFC");
    const output = [];
    for (const rawCharacter of Array.from(source)) {
      const character = normalizeCharacter(rawCharacter);
      if (!isAllowedCharacter(character)) continue;
      output.push(character);
      if (max && output.length >= max) break;
    }
    return output.join("");
  }

  function syncDisplay() {
    const visibleValue = internalValue || placeholder || "\u00a0";
    display.textContent = visibleValue;
    root.classList.toggle("is-empty", !internalValue);
    root.classList.toggle("has-placeholder", !internalValue && Boolean(placeholder));
    root.setAttribute("aria-valuetext", internalValue || placeholder || "vide");
  }

  function emitInput() {
    if (internalValue === lastEmittedValue) return;
    lastEmittedValue = internalValue;
    root.dispatchEvent(new Event("input", { bubbles: true }));
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

  function appendCharacter(character) {
    if (readOnly) return internalValue;
    const normalized = normalizeCharacter(character);
    if (!isAllowedCharacter(normalized)) return internalValue;
    if (max && Array.from(internalValue).length >= max) return internalValue;
    return setValue(`${internalValue}${normalized}`);
  }

  function backspace() {
    if (readOnly || !internalValue) return internalValue;
    const characters = Array.from(internalValue);
    characters.pop();
    return setValue(characters.join(""));
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
      root.focus({ preventScroll: true });
    } catch {
      root.focus?.();
    }
  }

  function handleKeydown(event, { global = false } = {}) {
    if (readOnly || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return false;
    if (global && shouldIgnoreGlobalKey(event, root, captureRoot)) return false;

    const key = String(event.key || "");

    if (key === "Dead") {
      stopKeyEvent(event);
      pendingDeadAccent = resolveFrenchDeadAccent(event);
      focus();
      return true;
    }

    if (pendingDeadAccent && Array.from(key).length === 1) {
      const composed = composeDeadAccent(pendingDeadAccent, key);
      pendingDeadAccent = "";
      if (composed && isAllowedCharacter(composed)) {
        stopKeyEvent(event);
        appendCharacter(composed);
        focus();
        return true;
      }
    }

    if (key === "Backspace") {
      stopKeyEvent(event);
      backspace();
      focus();
      return true;
    }
    if (key === "Delete") {
      stopKeyEvent(event);
      clear();
      focus();
      return true;
    }
    if (key === "Enter") {
      stopKeyEvent(event);
      submit();
      focus();
      return true;
    }

    if (Array.from(key).length === 1 && isAllowedCharacter(key)) {
      stopKeyEvent(event);
      appendCharacter(key);
      focus();
      return true;
    }

    if (isAllowedNavigationKey(key)) return false;
    return false;
  }

  root.addEventListener("pointerdown", (event) => {
    if (readOnly) return;
    event.preventDefault();
    focus();
  }, { signal });

  root.addEventListener("keydown", (event) => {
    handleKeydown(event, { global: false });
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
    display,
    getValue: () => internalValue,
    setValue,
    appendCharacter,
    backspace,
    clear,
    submit,
    focus,
    isAllowedCharacter,
    destroy() {
      controller.abort();
    }
  };
}

function normalizeAllowedCharacters(values, { lowercase = true } = {}) {
  if (!Array.isArray(values) || !values.length) return null;
  const normalized = values
    .flatMap((value) => Array.from(String(value ?? "").normalize("NFC")))
    .map((character) => lowercase ? character.toLocaleLowerCase("fr-FR") : character)
    .filter((character) => LETTER_RE.test(character));
  return new Set(normalized);
}

function resolveFrenchDeadAccent(event) {
  // Sur un clavier AZERTY français, la touche ^/¨ est une touche morte :
  // `KeyboardEvent.key` vaut "Dead". On conserve donc l’accent en attente
  // pour reconstruire ê, ë, î, ï… sans dépendre d’un input natif.
  if (String(event?.code || "") === "BracketLeft") {
    return event?.shiftKey ? "¨" : "^";
  }
  return event?.shiftKey ? "¨" : "^";
}

function composeDeadAccent(accent, rawCharacter) {
  const character = String(rawCharacter || "").toLocaleLowerCase("fr-FR");
  const maps = {
    "^": { a: "â", e: "ê", i: "î", o: "ô", u: "û" },
    "¨": { a: "ä", e: "ë", i: "ï", o: "ö", u: "ü", y: "ÿ" }
  };
  return maps[accent]?.[character] || "";
}

function shouldIgnoreGlobalKey(event, root, captureRoot) {
  const target = event.target;
  if (!target || !(target instanceof Element)) return false;
  if (root.contains(target)) return false;
  if (captureRoot instanceof Element && !captureRoot.contains(target)) return true;

  const editable = target.closest?.(EDITABLE_SELECTOR);
  return Boolean(editable && !root.contains(editable));
}

function isAllowedNavigationKey(key) {
  return key === "Tab" || key === "Shift" || key === "Escape" || key.startsWith("Arrow") || key === "Home" || key === "End";
}

function stopKeyEvent(event) {
  event.preventDefault();
  event.stopImmediatePropagation?.();
  event.stopPropagation();
}

function normalizeMaxLength(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeClassName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}
