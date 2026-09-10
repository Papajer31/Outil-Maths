import {
  SEYES_DEFAULT_COLOR,
  SEYES_FONT_CM,
  SEYES_FONT_GS,
  SEYES_ZOOM_MAX,
  SEYES_ZOOM_MIN,
  SEYES_ZOOM_STEP,
  normalizeSeyesState
} from "./model.js";

const MM_TO_PX = 96 / 25.4;
const LINE_MM = 16;
const SUBLINE_MM = 4;
const MARGIN_MM = 16;
const GRID_TOP_OFFSET_MM = 14.7;
const FONT_SIZE_PX = 38;
const CONTENT_SYNC_DELAY_MS = 220;
const PALETTE = Object.freeze([
  ["#427ebe", "Bleu"],
  ["#c00000", "Rouge"],
  ["#70ad47", "Vert"],
  ["#ed7d31", "Orange"],
  ["#ffc000", "Jaune"],
  ["#7030a0", "Violet"],
  ["#ff66cc", "Rose"],
  ["#000000", "Noir"]
]);

const pendingContentTimers = new WeakMap();
const savedSelections = new WeakMap();

function clamp(value, min, max){
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function formatZoom(value){
  return `${Math.round((Number(value) || 1) * 100)} %`;
}

function getFontFamily(fontSet){
  return fontSet === SEYES_FONT_CM ? "SeyesBelleAllureCM" : "SeyesBelleAllureGS";
}

function isSafeCssColor(value){
  const safeValue = String(value || "").trim();
  if (!safeValue || safeValue.length > 48) return false;
  try {
    return CSS.supports("color", safeValue);
  } catch {
    return /^#[0-9a-f]{3,8}$/i.test(safeValue) || /^rgba?\([^)]+\)$/i.test(safeValue);
  }
}

function sanitizeStyle(source){
  if (!source) return "";
  const styles = [];
  const color = String(source.color || "").trim();
  const fontWeight = String(source.fontWeight || "").trim();
  const fontStyle = String(source.fontStyle || "").trim();

  if (isSafeCssColor(color)) styles.push(`color:${color}`);
  if (fontWeight === "bold" || Number(fontWeight) >= 600) styles.push("font-weight:700");
  if (fontStyle === "italic" || fontStyle === "oblique") styles.push("font-style:italic");
  return styles.join(";");
}

function sanitizeContentHtml(rawHtml){
  const template = document.createElement("template");
  template.innerHTML = String(rawHtml ?? "");
  const output = document.createElement("div");

  const appendNode = (sourceNode, targetParent) => {
    if (sourceNode.nodeType === Node.TEXT_NODE) {
      targetParent.appendChild(document.createTextNode(sourceNode.nodeValue || ""));
      return;
    }
    if (sourceNode.nodeType !== Node.ELEMENT_NODE) return;

    const tag = sourceNode.tagName.toUpperCase();
    if (tag === "BR") {
      targetParent.appendChild(document.createElement("br"));
      return;
    }

    let target = targetParent;
    let wrapper = null;

    if (tag === "DIV" || tag === "P") {
      wrapper = document.createElement("div");
    } else if (tag === "B" || tag === "STRONG") {
      wrapper = document.createElement("b");
    } else if (tag === "I" || tag === "EM") {
      wrapper = document.createElement("i");
    } else if (tag === "FONT") {
      wrapper = document.createElement("span");
      const color = String(sourceNode.getAttribute("color") || "").trim();
      if (isSafeCssColor(color)) wrapper.style.color = color;
    } else if (tag === "SPAN") {
      wrapper = document.createElement("span");
      const safeStyle = sanitizeStyle(sourceNode.style);
      if (safeStyle) wrapper.setAttribute("style", safeStyle);
    }

    if (wrapper) {
      targetParent.appendChild(wrapper);
      target = wrapper;
    }

    Array.from(sourceNode.childNodes).forEach((child) => appendNode(child, target));
  };

  Array.from(template.content.childNodes).forEach((node) => appendNode(node, output));
  return output.innerHTML;
}

function normalizeEditorMarkup(editor){
  const safeHtml = sanitizeContentHtml(editor?.innerHTML || "");
  if (editor && editor.innerHTML !== safeHtml) editor.innerHTML = safeHtml;
  return safeHtml;
}

function renderPalette(){
  return PALETTE.map(([color, label]) => `
    <button
      class="ttp-seyes-color-swatch"
      type="button"
      data-widget-action
      data-seyes-color="${color}"
      style="--ttp-seyes-swatch:${color}"
      aria-label="Texte ${label.toLowerCase()}"
      title="${label}"
    ></button>
  `).join("");
}

function renderSeyesGridSvg(){
  const uid = `ttpSeyesGrid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const verticalId = `${uid}-vertical`;
  const horizontalId = `${uid}-horizontal`;
  return `
    <svg class="ttp-seyes-grid" data-seyes-grid-svg aria-hidden="true" focusable="false">
      <defs>
        <pattern id="${verticalId}" data-seyes-vertical-pattern width="1" height="1" patternUnits="userSpaceOnUse" overflow="visible">
          <line class="ttp-seyes-paper-line is-minor" x1="0" y1="0" x2="0" y2="1"></line>
        </pattern>
        <pattern id="${horizontalId}" data-seyes-horizontal-pattern width="1" height="1" patternUnits="userSpaceOnUse" overflow="visible">
          <line class="ttp-seyes-paper-line is-minor" data-seyes-horizontal-line="0" x1="0" y1="0" x2="1" y2="0"></line>
          <line class="ttp-seyes-paper-line is-minor" data-seyes-horizontal-line="1" x1="0" y1="0" x2="1" y2="0"></line>
          <line class="ttp-seyes-paper-line is-minor" data-seyes-horizontal-line="2" x1="0" y1="0" x2="1" y2="0"></line>
          <line class="ttp-seyes-paper-line is-major" data-seyes-horizontal-line="3" x1="0" y1="0" x2="1" y2="0"></line>
        </pattern>
      </defs>
      <rect data-seyes-vertical-fill x="0" y="0" width="100%" height="100%" fill="url(#${verticalId})"></rect>
      <g data-seyes-horizontal-group>
        <rect x="0" y="0" width="100%" height="100%" fill="url(#${horizontalId})"></rect>
      </g>
      <line class="ttp-seyes-paper-line is-margin" data-seyes-margin-line x1="0" y1="0" x2="0" y2="100%"></line>
    </svg>
  `;
}

function renderShell(state){
  return `
    <div class="ttp-seyes-root" data-seyes-font-set="${state.fontSet}">
      <div class="ttp-seyes-viewport" data-no-widget-drag>
        <div class="ttp-seyes-sheet">
          ${renderSeyesGridSvg()}
          <div class="ttp-seyes-font-status" data-seyes-font-status aria-live="polite">Chargement de Belle Allure…</div>
          <div
            class="ttp-seyes-editor"
            data-seyes-editor
            data-widget-action
            data-no-widget-drag
            contenteditable="true"
            role="textbox"
            aria-multiline="true"
            aria-label="Texte sur cahier Seyès"
            spellcheck="false"
          ></div>
          <div class="ttp-seyes-baseline-probe" data-seyes-baseline-probe aria-hidden="true">Hg<span data-seyes-baseline-marker></span></div>
        </div>
      </div>

      <div class="ttp-seyes-toolbar" data-widget-action data-no-widget-drag aria-label="Mise en forme du cahier Seyès">
        <div class="ttp-seyes-tool-group ttp-seyes-font-group" aria-label="Police Belle Allure">
          <button class="ttp-seyes-tool-btn" type="button" data-widget-action data-seyes-font="${SEYES_FONT_GS}" aria-pressed="${state.fontSet === SEYES_FONT_GS}">GS</button>
          <button class="ttp-seyes-tool-btn" type="button" data-widget-action data-seyes-font="${SEYES_FONT_CM}" aria-pressed="${state.fontSet === SEYES_FONT_CM}">CM</button>
        </div>

        <div class="ttp-seyes-tool-group ttp-seyes-format-group" aria-label="Style du texte">
          <button class="ttp-seyes-tool-btn is-format" type="button" data-widget-action data-seyes-command="bold" aria-pressed="false" title="Gras"><strong>B</strong></button>
          <button class="ttp-seyes-tool-btn is-format" type="button" data-widget-action data-seyes-command="italic" aria-pressed="false" title="Italique"><em>I</em></button>
        </div>

        <div class="ttp-seyes-tool-group ttp-seyes-colors" aria-label="Couleur du texte">
          ${renderPalette()}
          <label class="ttp-seyes-custom-color" data-widget-action title="Couleur personnalisée">
            <input type="color" value="${SEYES_DEFAULT_COLOR}" data-seyes-custom-color aria-label="Couleur personnalisée du texte">
            <span class="ttp-material-icon" aria-hidden="true">palette</span>
          </label>
        </div>

        <div class="ttp-seyes-tool-group ttp-seyes-zoom" aria-label="Zoom">
          <button class="ttp-seyes-tool-btn ttp-material-icon" type="button" data-widget-action data-seyes-zoom="-1" aria-label="Dézoomer">remove</button>
          <span class="ttp-seyes-zoom-value" data-seyes-zoom-value>${formatZoom(state.zoom)}</span>
          <button class="ttp-seyes-tool-btn ttp-material-icon" type="button" data-widget-action data-seyes-zoom="1" aria-label="Zoomer">add</button>
        </div>
      </div>
    </div>
  `;
}

function applyScaleVariables(root, state){
  if (!root) return;
  const zoom = state.zoom;
  const line = LINE_MM * MM_TO_PX * zoom;
  const subline = SUBLINE_MM * MM_TO_PX * zoom;
  const margin = MARGIN_MM * MM_TO_PX * zoom;
  const firstFine = GRID_TOP_OFFSET_MM * MM_TO_PX * zoom;
  const firstMain = (GRID_TOP_OFFSET_MM + (3 * SUBLINE_MM)) * MM_TO_PX * zoom;
  const fontSize = FONT_SIZE_PX * zoom;

  root.style.setProperty("--ttp-seyes-line", `${line}px`);
  root.style.setProperty("--ttp-seyes-subline", `${subline}px`);
  root.style.setProperty("--ttp-seyes-margin", `${margin}px`);
  root.style.setProperty("--ttp-seyes-first-fine", `${firstFine}px`);
  root.style.setProperty("--ttp-seyes-first-main", `${firstMain}px`);
  root.style.setProperty("--ttp-seyes-font-size", `${fontSize}px`);
  const safeLeft = 16;
  const safeTop = 58;
  const safeBottom = 58;

  root.style.setProperty("--ttp-seyes-safe-left", `${safeLeft}px`);
  root.style.setProperty("--ttp-seyes-safe-top", `${safeTop}px`);
  root.style.setProperty("--ttp-seyes-safe-bottom", `${safeBottom}px`);
  root.style.setProperty("--ttp-seyes-editor-left", `${safeLeft + margin}px`);
  root.style.setProperty("--ttp-seyes-editor-bottom", `${safeBottom + Math.max(line, 74)}px`);
  root.style.setProperty("--ttp-seyes-font-family", `"${getFontFamily(state.fontSet)}"`);
  root.dataset.seyesFontSet = state.fontSet;

  const verticalPattern = root.querySelector("[data-seyes-vertical-pattern]");
  const horizontalPattern = root.querySelector("[data-seyes-horizontal-pattern]");
  const horizontalGroup = root.querySelector("[data-seyes-horizontal-group]");
  const marginLine = root.querySelector("[data-seyes-margin-line]");

  if (verticalPattern) {
    verticalPattern.setAttribute("x", String(safeLeft));
    verticalPattern.setAttribute("width", String(line));
    verticalPattern.setAttribute("height", "1");
  }
  if (horizontalPattern) {
    horizontalPattern.setAttribute("y", String(safeTop + firstFine));
    horizontalPattern.setAttribute("width", "1");
    horizontalPattern.setAttribute("height", String(line));
  }
  root.querySelectorAll("[data-seyes-horizontal-line]").forEach((gridLine) => {
    const index = Number(gridLine.dataset.seyesHorizontalLine) || 0;
    const y = index * subline;
    gridLine.setAttribute("y1", String(y));
    gridLine.setAttribute("y2", String(y));
  });
  horizontalGroup?.removeAttribute("transform");
  if (marginLine) {
    marginLine.setAttribute("x1", String(safeLeft + margin));
    marginLine.setAttribute("x2", String(safeLeft + margin));
  }
}

function getLocalTransformScale(element){
  const rect = element?.getBoundingClientRect?.();
  const width = Number(element?.offsetWidth) || 0;
  if (!rect?.width || !width) return 1;
  return rect.width / width;
}

function calibrateBaseline(root){
  const probe = root?.querySelector?.("[data-seyes-baseline-probe]");
  const marker = root?.querySelector?.("[data-seyes-baseline-marker]");
  if (!probe || !marker) return;

  const probeRect = probe.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();
  const outerScale = Math.max(0.01, getLocalTransformScale(root));
  const baselineOffset = (markerRect.top - probeRect.top) / outerScale;
  const styles = getComputedStyle(root);
  const firstMain = Number.parseFloat(styles.getPropertyValue("--ttp-seyes-first-main")) || 0;
  const safeTop = Number.parseFloat(styles.getPropertyValue("--ttp-seyes-safe-top")) || 0;
  const topPadding = Math.max(0, safeTop + firstMain - baselineOffset);
  root.style.setProperty("--ttp-seyes-editor-top", `${topPadding}px`);
}

async function ensureFontsAndCalibration(root, state){
  if (!root || !document.fonts) {
    root?.classList?.add("is-font-ready");
    calibrateBaseline(root);
    return;
  }

  const family = getFontFamily(state.fontSet);
  if (root.dataset.seyesLoadedFontFamily === family && root.classList.contains("is-font-ready")) {
    requestAnimationFrame(() => calibrateBaseline(root));
    return;
  }

  const token = `${family}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  root.dataset.seyesFontLoadToken = token;
  root.classList.remove("is-font-ready", "is-font-error");
  root.classList.add("is-font-loading");

  try {
    const size = Math.max(12, FONT_SIZE_PX * state.zoom);
    const [regularFaces, boldFaces] = await Promise.all([
      document.fonts.load(`400 ${size}px "${family}"`),
      document.fonts.load(`700 ${size}px "${family}"`)
    ]);
    if (root.dataset.seyesFontLoadToken !== token) return;
    const loaded = (regularFaces?.length || 0) > 0 && (boldFaces?.length || 0) > 0;
    root.classList.toggle("is-font-error", !loaded);
    root.classList.toggle("is-font-ready", loaded);
    root.classList.remove("is-font-loading");
    if (!loaded) return;
    root.dataset.seyesLoadedFontFamily = family;
    requestAnimationFrame(() => calibrateBaseline(root));
  } catch {
    if (root.dataset.seyesFontLoadToken !== token) return;
    root.classList.remove("is-font-loading", "is-font-ready");
    root.classList.add("is-font-error");
  }
}

function saveSelection(editor){
  const selection = window.getSelection?.();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return;
  savedSelections.set(editor, range.cloneRange());
}

function restoreSelection(editor){
  const range = savedSelections.get(editor);
  if (!range) return false;
  const selection = window.getSelection?.();
  if (!selection) return false;
  try {
    selection.removeAllRanges();
    selection.addRange(range);
    editor.focus({ preventScroll: true });
    return true;
  } catch {
    return false;
  }
}

function updateFormatButtonStates(root, editor){
  if (!root || !editor) return;
  const activeElement = document.activeElement;
  if (activeElement !== editor && !editor.contains(activeElement)) return;

  root.querySelectorAll("[data-seyes-command]").forEach((button) => {
    const command = String(button.dataset.seyesCommand || "");
    let active = false;
    try { active = document.queryCommandState(command); } catch {}
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function execFormattingCommand(root, editor, command, value = null){
  if (!editor) return;
  restoreSelection(editor);
  editor.focus({ preventScroll: true });
  try {
    document.execCommand(command, false, value);
  } catch {}
  saveSelection(editor);
  updateFormatButtonStates(root, editor);
  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

function scheduleContentSync(editor, sendAction){
  const previous = pendingContentTimers.get(editor);
  if (previous) clearTimeout(previous);
  const timer = window.setTimeout(() => {
    pendingContentTimers.delete(editor);
    const contentHtml = normalizeEditorMarkup(editor);
    editor.dataset.seyesLastSentHtml = contentHtml;
    sendAction?.("set-content", { contentHtml });
  }, CONTENT_SYNC_DELAY_MS);
  pendingContentTimers.set(editor, timer);
}

function bindEditorEvents(root, editor, sendAction){
  if (!root || !editor || editor.dataset.seyesBound === "true") return;
  editor.dataset.seyesBound = "true";

  editor.addEventListener("input", () => {
    saveSelection(editor);
    scheduleContentSync(editor, sendAction);
    updateFormatButtonStates(root, editor);
  });
  editor.addEventListener("keyup", () => {
    saveSelection(editor);
    updateFormatButtonStates(root, editor);
  });
  editor.addEventListener("pointerup", () => {
    saveSelection(editor);
    updateFormatButtonStates(root, editor);
  });
  editor.addEventListener("focus", () => {
    saveSelection(editor);
    updateFormatButtonStates(root, editor);
  });
  editor.addEventListener("blur", () => {
    const timer = pendingContentTimers.get(editor);
    if (timer) clearTimeout(timer);
    pendingContentTimers.delete(editor);
    const contentHtml = normalizeEditorMarkup(editor);
    editor.dataset.seyesLastSentHtml = contentHtml;
    sendAction?.("set-content", { contentHtml });
  });
  editor.addEventListener("paste", (event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") || "";
    restoreSelection(editor);
    try {
      document.execCommand("insertText", false, text);
    } catch {
      const selection = window.getSelection?.();
      if (selection?.rangeCount) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
      }
    }
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function bindToolbarEvents(root, editor, sendAction, getState){
  if (!root || root.dataset.seyesToolbarBound === "true") return;
  root.dataset.seyesToolbarBound = "true";

  root.querySelectorAll(".ttp-seyes-toolbar button, .ttp-seyes-toolbar label").forEach((control) => {
    control.addEventListener("pointerdown", (event) => {
      saveSelection(editor);
      // Un bouton de mise en forme ne doit jamais devenir l'élément actif :
      // la frappe peut ainsi reprendre immédiatement dans l'éditeur.
      if (control.tagName === "BUTTON") event.preventDefault();
    });
  });

  root.querySelectorAll("[data-seyes-font]").forEach((button) => {
    button.addEventListener("click", () => {
      const fontSet = button.dataset.seyesFont === SEYES_FONT_CM ? SEYES_FONT_CM : SEYES_FONT_GS;
      sendAction?.("set-settings", { fontSet });
      restoreSelection(editor) || editor.focus({ preventScroll: true });
    });
  });

  root.querySelectorAll("[data-seyes-command]").forEach((button) => {
    button.addEventListener("click", () => {
      execFormattingCommand(root, editor, button.dataset.seyesCommand);
    });
  });

  root.querySelectorAll("[data-seyes-color]").forEach((button) => {
    button.addEventListener("click", () => {
      execFormattingCommand(root, editor, "foreColor", button.dataset.seyesColor);
    });
  });

  const customColor = root.querySelector("[data-seyes-custom-color]");
  customColor?.addEventListener("pointerdown", () => saveSelection(editor));
  customColor?.addEventListener("change", () => {
    execFormattingCommand(root, editor, "foreColor", customColor.value);
    requestAnimationFrame(() => {
      restoreSelection(editor) || editor.focus({ preventScroll: true });
    });
  });

  root.querySelectorAll("[data-seyes-zoom]").forEach((button) => {
    button.addEventListener("click", () => {
      const delta = Number(button.dataset.seyesZoom) || 0;
      const state = normalizeSeyesState(getState?.());
      const nextZoom = clamp(
        Math.round((state.zoom + (delta * SEYES_ZOOM_STEP)) * 10) / 10,
        SEYES_ZOOM_MIN,
        SEYES_ZOOM_MAX
      );
      sendAction?.("set-settings", { zoom: nextZoom });
      restoreSelection(editor) || editor.focus({ preventScroll: true });
    });
  });
}

function syncRootFromState(root, state){
  const editor = root?.querySelector?.("[data-seyes-editor]");
  if (!root || !editor) return;

  applyScaleVariables(root, state);

  const safeStateHtml = sanitizeContentHtml(state.contentHtml);
  const focused = document.activeElement === editor || editor.contains(document.activeElement);
  const localHtml = sanitizeContentHtml(editor.innerHTML);
  if (!focused && safeStateHtml !== localHtml) {
    editor.innerHTML = safeStateHtml;
  }

  root.querySelectorAll("[data-seyes-font]").forEach((button) => {
    const active = button.dataset.seyesFont === state.fontSet;
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  const zoomValue = root.querySelector("[data-seyes-zoom-value]");
  if (zoomValue) zoomValue.textContent = formatZoom(state.zoom);
  root.querySelector('[data-seyes-zoom="-1"]')?.toggleAttribute("disabled", state.zoom <= SEYES_ZOOM_MIN + 0.001);
  root.querySelector('[data-seyes-zoom="1"]')?.toggleAttribute("disabled", state.zoom >= SEYES_ZOOM_MAX - 0.001);

  ensureFontsAndCalibration(root, state);
}

export function renderSeyesProjector({ host, widgetInfoHost, state, sendAction } = {}){
  if (!host) return;
  const safeState = normalizeSeyesState(state);

  if (widgetInfoHost) {
    widgetInfoHost.textContent = `Belle Allure ${safeState.fontSet} · ${formatZoom(safeState.zoom)}`;
  }

  let root = host.querySelector(":scope > .ttp-seyes-root");
  if (!root) {
    host.innerHTML = renderShell(safeState);
    root = host.querySelector(":scope > .ttp-seyes-root");
    const editor = root?.querySelector?.("[data-seyes-editor]");
    if (editor) {
      editor.innerHTML = sanitizeContentHtml(safeState.contentHtml);
      editor.dataset.seyesLastSentHtml = sanitizeContentHtml(safeState.contentHtml);
      root.__seyesCurrentState = safeState;
      bindEditorEvents(root, editor, sendAction);
      bindToolbarEvents(root, editor, sendAction, () => root?.__seyesCurrentState || safeState);
    }
  }

  const editor = root?.querySelector?.("[data-seyes-editor]");
  if (root) root.__seyesCurrentState = safeState;
  if (editor) {
    bindEditorEvents(root, editor, sendAction);
    bindToolbarEvents(root, editor, sendAction, () => root?.__seyesCurrentState || safeState);
  }
  syncRootFromState(root, safeState);
}
