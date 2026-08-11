/*
  Clavier alphabétique commun.

  Disposition par défaut :
  - a à m sur la première ligne ;
  - n à z sur la deuxième ligne ;
  - une troisième ligne de lettres françaises avec diacritiques, optionnelle.

  La brique ne stocke pas la réponse. Elle envoie les touches à un contrôle
  compatible avec createAlphabetAnswerControl (ou à un callback onKey).
  Elle peut aussi mettre en évidence un ensemble de touches sans les filtrer.
*/

import { ensureToolUiStyles } from "./tool-ui.js";
import { renderMaterialIconSvg } from "../material-icons-svg.js";

export const DEFAULT_ALPHABET_KEYS = Object.freeze([
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
  "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"
]);

export const DEFAULT_DIACRITIC_KEYS = Object.freeze([
  "à", "â", "ç", "é", "è", "ê", "ë", "î", "ï", "ô", "ù", "û", "ü", "œ"
]);

const VOWEL_KEYS = Object.freeze(["a", "e", "i", "o", "u"]);
const ACCENTED_FORMS_BY_VOWEL = Object.freeze({
  a: ["à", "â"],
  e: ["é", "è", "ê", "ë"],
  i: ["î", "ï"],
  o: ["ô"],
  u: ["ù", "û", "ü"]
});

export function renderAlphabetKeyboard(options = {}) {
  ensureToolUiStyles();

  const {
    hidden = false,
    disabled = false,
    showDiacritics = false,
    showBackspace = true,
    showClear = false,
    showSpace = false,
    showApostrophe = false,
    showHyphen = false,
    alphabetKeys = DEFAULT_ALPHABET_KEYS,
    diacriticKeys = DEFAULT_DIACRITIC_KEYS,
    allowedKeys = null,
    highlightedKeys = null,
    rootClassName = "",
    buttonClassName = "",
    dataAttribute = "data-tool-alphabet-key",
    ariaLabel = "Clavier alphabétique"
  } = options;

  const safeDataAttribute = normalizeDataAttribute(dataAttribute);
  const allowed = normalizeAllowedKeys(allowedKeys);
  const highlighted = normalizeAllowedKeys(highlightedKeys);
  const alphabet = normalizeCharacterKeys(alphabetKeys).filter((key) => !allowed || allowed.has(key));
  const diacritics = showDiacritics
    ? normalizeCharacterKeys(diacriticKeys).filter((key) => !allowed || allowed.has(key))
    : [];
  const vowels = VOWEL_KEYS.filter((key) => alphabet.includes(key));
  const consonants = alphabet.filter((key) => !VOWEL_KEYS.includes(key));
  if (diacritics.includes("ç")) {
    const cIndex = consonants.indexOf("c");
    if (cIndex >= 0) consonants.splice(cIndex + 1, 0, "ç");
  }
  const hasLigature = diacritics.includes("œ");
  const rootClasses = normalizeClassName(`tool-alphabet-keyboard ${rootClassName} ${hidden ? "tool-alphabet-keyboard--hidden" : ""}`);
  const attrs = hidden
    ? ' aria-hidden="true" inert'
    : ` role="group" aria-label="${escapeHtml(ariaLabel)}"`;
  const buttonsDisabled = hidden || disabled;

  const vowelButtons = vowels.map((key) => renderVowelButton({
    key,
    diacritics,
    showDiacritics,
    dataAttribute: safeDataAttribute,
    buttonClassName,
    disabled: buttonsDisabled,
    highlighted: highlighted?.has(key) === true,
    highlightedAccents: highlighted
  }));
  if (hasLigature) vowelButtons.push(renderCharacterButton("œ", safeDataAttribute, buttonClassName, buttonsDisabled, "", highlighted?.has("œ") === true));
  if (showBackspace) vowelButtons.push(renderBackspaceButton(safeDataAttribute, buttonClassName, buttonsDisabled));

  const utilityButtons = [];
  if (showApostrophe && (!allowed || allowed.has("'"))) {
    utilityButtons.push(renderCharacterButton("'", safeDataAttribute, buttonClassName, buttonsDisabled, "apostrophe", highlighted?.has("'") === true));
  }
  if (showHyphen && (!allowed || allowed.has("-"))) {
    utilityButtons.push(renderCharacterButton("-", safeDataAttribute, buttonClassName, buttonsDisabled, "tiret", highlighted?.has("-") === true));
  }
  if (showSpace && (!allowed || allowed.has(" "))) {
    utilityButtons.push(renderActionButton({
      action: "space",
      label: "espace",
      ariaLabel: "Espace",
      dataAttribute: safeDataAttribute,
      buttonClassName: normalizeClassName(`${buttonClassName} tool-alphabet-keyboard__button--wide`),
      disabled: buttonsDisabled
    }));
  }
  if (showClear) {
    utilityButtons.push(renderActionButton({
      action: "clear",
      label: "effacer",
      ariaLabel: "Effacer toute la réponse",
      dataAttribute: safeDataAttribute,
      buttonClassName: normalizeClassName(`${buttonClassName} tool-alphabet-keyboard__button--wide`),
      disabled: buttonsDisabled
    }));
  }

  return `
    <div class="${escapeHtml(rootClasses)}"${attrs}>
      ${vowelButtons.length ? renderRow(vowelButtons, "vowels") : ""}
      ${consonants.length ? renderRow(consonants.map((key) => renderCharacterButton(key, safeDataAttribute, buttonClassName, buttonsDisabled, "", highlighted?.has(key) === true)), "consonants") : ""}
      ${utilityButtons.length ? renderRow(utilityButtons, "utilities") : ""}
    </div>
  `;
}

export function bindAlphabetKeyboardEvents(options = {}) {
  const {
    root,
    control = null,
    onKey = null,
    signal = undefined,
    dataAttribute = "data-tool-alphabet-key",
    onAfterInput = null,
    disabled = false
  } = options;

  if (!root || disabled) return;
  const safeDataAttribute = normalizeDataAttribute(dataAttribute);
  const selector = `[${cssEscape(safeDataAttribute)}]`;

  root.querySelectorAll(selector).forEach((button) => {
    button.addEventListener("click", () => {
      const key = String(button.getAttribute(safeDataAttribute) || "");
      dispatchKey(key, { control, onKey });
      closeAccentDrawers(root);
      control?.focus?.();
      onAfterInput?.(key);
    }, signal ? { signal } : undefined);
  });

  root.addEventListener("click", (event) => {
    const trigger = event.target instanceof Element ? event.target.closest("[data-tool-alphabet-drawer-toggle]") : null;
    if (!(trigger instanceof HTMLButtonElement)) {
      if (root.classList.contains("has-open-accent-drawer")) closeAccentDrawers(root);
      return;
    }
    const drawerId = String(trigger.getAttribute("aria-controls") || "");
    const drawer = drawerId ? root.querySelector(`#${cssEscape(drawerId)}`) : null;
    if (!(drawer instanceof HTMLElement)) return;
    const willOpen = !drawer.classList.contains("is-open");
    closeAccentDrawers(root);
    const owner = trigger.closest(".tool-alphabet-keyboard__vowel-key");
    if (willOpen && owner instanceof HTMLElement) {
      const mainButton = owner.querySelector(":scope > .tool-alphabet-keyboard__button");
      if (mainButton instanceof HTMLElement) {
        owner.style.setProperty("--tool-alphabet-vowel-button-width", `${mainButton.offsetWidth}px`);
        owner.style.setProperty("--tool-alphabet-vowel-font-size", getComputedStyle(mainButton).fontSize);
      }
      // offsetWidth reste exprimé dans le repère local du runtime, même quand
      // celui-ci est mis à l’échelle par le projecteur ou la fenêtre.
      const drawerWidth = Math.ceil(drawer.offsetWidth || 0);
      owner.style.setProperty("--tool-alphabet-accent-drawer-width", `${drawerWidth}px`);
      owner.classList.add("is-open");
      root.classList.add("has-open-accent-drawer");
    }
    drawer.classList.toggle("is-open", willOpen);
    drawer.toggleAttribute("inert", !willOpen);
    drawer.setAttribute("aria-hidden", String(!willOpen));
    trigger.setAttribute("aria-expanded", String(willOpen));
  }, signal ? { signal } : undefined);
}

function dispatchKey(key, { control, onKey }) {
  if (typeof onKey === "function") {
    onKey(key);
    return;
  }

  if (!control) return;
  if (key === "backspace") control.backspace?.();
  else if (key === "clear") control.clear?.();
  else if (key === "space") control.appendCharacter?.(" ");
  else control.appendCharacter?.(key);
}

function renderRow(buttons, kind) {
  if (!buttons.length) return "";
  return `<div class="tool-alphabet-keyboard__row tool-alphabet-keyboard__row--${escapeHtml(kind)}" style="--tool-alphabet-key-count:${buttons.length}">${buttons.join("")}</div>`;
}

function renderVowelButton({ key, diacritics, showDiacritics, dataAttribute, buttonClassName, disabled, highlighted, highlightedAccents }) {
  const accents = showDiacritics
    ? (ACCENTED_FORMS_BY_VOWEL[key] || []).filter((value) => diacritics.includes(value))
    : [];
  const mainButton = renderCharacterButton(key, dataAttribute, buttonClassName, disabled, "", highlighted);
  if (!accents.length) return mainButton;
  const hasHighlightedAccent = accents.some((accent) => highlightedAccents?.has(accent));

  const drawerId = `tool_alphabet_drawer_${key}`;
  return `
    <span class="tool-alphabet-keyboard__vowel-key">
      ${mainButton}
      <button
        class="tool-choice-button tool-alphabet-keyboard__drawer-toggle${hasHighlightedAccent ? " is-highlighted" : ""}"
        type="button"
        data-tool-alphabet-drawer-toggle
        aria-label="Variantes accentuées de ${escapeHtml(key)}"
        aria-controls="${drawerId}"
        aria-expanded="false"
        ${disabled ? "disabled" : ""}
      >+</button>
      <span class="tool-alphabet-keyboard__accent-drawer" id="${drawerId}" aria-hidden="true" inert>
        ${accents.map((accent) => renderCharacterButton(accent, dataAttribute, `${buttonClassName} tool-alphabet-keyboard__accent-button`, disabled, "", highlightedAccents?.has(accent) === true)).join("")}
      </span>
    </span>
  `;
}

function renderBackspaceButton(dataAttribute, buttonClassName, disabled) {
  return renderActionButton({
    action: "backspace",
    label: renderMaterialIconSvg("keyboard_backspace"),
    ariaLabel: "Effacer le dernier caractère",
    dataAttribute,
    buttonClassName: normalizeClassName(`${buttonClassName} tool-alphabet-keyboard__button--backspace`),
    disabled
  });
}

function closeAccentDrawers(root) {
  root?.classList?.remove("has-open-accent-drawer");
  root?.querySelectorAll?.(".tool-alphabet-keyboard__vowel-key.is-open").forEach((owner) => {
    owner.classList.remove("is-open");
    owner.style.removeProperty("--tool-alphabet-accent-drawer-width");
    owner.style.removeProperty("--tool-alphabet-vowel-button-width");
    owner.style.removeProperty("--tool-alphabet-vowel-font-size");
  });
  root?.querySelectorAll?.("[data-tool-alphabet-drawer-toggle]").forEach((trigger) => trigger.setAttribute("aria-expanded", "false"));
  root?.querySelectorAll?.(".tool-alphabet-keyboard__accent-drawer").forEach((drawer) => {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    drawer.setAttribute("inert", "");
  });
}

function renderCharacterButton(key, dataAttribute, buttonClassName, disabled, ariaLabel = "", highlighted = false) {
  return renderActionButton({
    action: key,
    label: `<span class="tool-alphabet-keyboard__glyph">${escapeHtml(key)}</span>`,
    ariaLabel: ariaLabel || `Lettre ${key}`,
    dataAttribute,
    buttonClassName: normalizeClassName(`${buttonClassName} ${highlighted ? "is-highlighted" : ""}`),
    disabled
  });
}

function renderActionButton({ action, label, ariaLabel, dataAttribute, buttonClassName = "", disabled = false }) {
  const classes = normalizeClassName(`tool-choice-button tool-alphabet-keyboard__button ${buttonClassName}`);
  return `
    <button class="${escapeHtml(classes)}" type="button" ${dataAttribute}="${escapeHtml(action)}" aria-label="${escapeHtml(ariaLabel || action)}" ${disabled ? 'disabled tabindex="-1"' : ""}>
      ${label}
    </button>
  `;
}

function normalizeCharacterKeys(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value ?? "").trim().normalize("NFC").toLocaleLowerCase("fr-FR"))
    .filter((value) => Array.from(value).length === 1 && /^\p{L}$/u.test(value))));
}

function normalizeAllowedKeys(values) {
  if (!Array.isArray(values) || !values.length) return null;
  return new Set(values.map((value) => String(value ?? "").normalize("NFC").toLocaleLowerCase("fr-FR")));
}

function normalizeDataAttribute(value) {
  const raw = String(value || "").trim();
  if (/^data-[a-z0-9_-]+$/i.test(raw)) return raw;
  return "data-tool-alphabet-key";
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
