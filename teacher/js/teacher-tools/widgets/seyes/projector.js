import {
  SEYES_ALIGNMENTS,
  SEYES_DEFAULT_TEXT_COLOR,
  SEYES_FONTS,
  SEYES_RULINGS,
  SEYES_SCALE_MAX,
  SEYES_SCALE_MIN,
  SEYES_SCALE_STEP,
  getSeyesFont,
  normalizeSeyesState
} from "./model.js";
import {
  downloadSeyesDocument,
  plainTextToSeyesHtml,
  readSeyesDocumentFile
} from "./document.js";
import { openSeyesPdfExportDialog, SEYES_FORMAT_PALETTE } from "./pdf-export.js";

const BASE_LINE_PX = 62;
const BASE_FONT_PX = 38;
const SAFE_TOP_PX = 34;
const SAFE_LEFT_PX = 22;
const CONTENT_SYNC_DELAY_MS = 180;
const pendingTimers = new WeakMap();
const savedSelections = new WeakMap();
const localUiState = new WeakMap();

function escapeHtml(value){
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function escapeAttr(value){ return escapeHtml(value); }
function clamp(value, min, max){ const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min; }
function formatScale(value){ return `${Math.round((Number(value) || 1) * 100)} %`; }
function alignmentMeta(value){
  const safe = SEYES_ALIGNMENTS.includes(value) ? value : "left";
  if (safe === "center") return { id: safe, icon: "format_align_center", label: "Centré", next: "right" };
  if (safe === "right") return { id: safe, icon: "format_align_right", label: "À droite", next: "left" };
  return { id: "left", icon: "format_align_left", label: "À gauche", next: "center" };
}
function isSafeColor(value){
  const safe = String(value || "").trim();
  try { return Boolean(safe && CSS.supports("color", safe)); } catch { return /^#[0-9a-f]{3,8}$/i.test(safe); }
}
function sanitizeStyle(source){
  if (!source) return "";
  const styles = [];
  const color = String(source.color || "").trim();
  const background = String(source.backgroundColor || "").trim();
  const decorationLine = String(source.textDecorationLine || "").trim();
  const decorationColor = String(source.textDecorationColor || "").trim();
  const decorationThickness = String(source.textDecorationThickness || "").trim();
  const borderColor = String(source.borderColor || "").trim();
  const borderWidth = String(source.borderWidth || "").trim();
  const borderStyle = String(source.borderStyle || "").trim();
  const borderRadius = String(source.borderRadius || "").trim();
  const padding = String(source.padding || "").trim();
  if (isSafeColor(color)) styles.push(`color:${color}`);
  if (isSafeColor(background)) styles.push(`background-color:${background}`);
  if (/^(underline|line-through|underline line-through|line-through underline)$/.test(decorationLine)) styles.push(`text-decoration-line:${decorationLine}`);
  if (isSafeColor(decorationColor)) styles.push(`text-decoration-color:${decorationColor}`);
  if (/^\d+(\.\d+)?px$/.test(decorationThickness)) styles.push(`text-decoration-thickness:${decorationThickness}`);
  if (isSafeColor(borderColor)) styles.push(`border-color:${borderColor}`);
  if (/^\d+(\.\d+)?px$/.test(borderWidth)) styles.push(`border-width:${borderWidth}`);
  if (borderStyle === "solid") styles.push("border-style:solid");
  if (/^\d+(\.\d+)?(px|em|%)$/.test(borderRadius)) styles.push(`border-radius:${borderRadius}`);
  if (/^0\s+\.\d+em$/.test(padding)) styles.push(`padding:${padding}`);
  return styles.join(";");
}
function sanitizeContentHtml(rawHtml){
  const template = document.createElement("template");
  template.innerHTML = String(rawHtml || "");
  const output = document.createElement("div");
  const walk = (sourceNode, targetParent) => {
    if (sourceNode.nodeType === Node.TEXT_NODE) { targetParent.appendChild(document.createTextNode(sourceNode.nodeValue || "")); return; }
    if (sourceNode.nodeType !== Node.ELEMENT_NODE) return;
    const tag = sourceNode.tagName.toUpperCase();
    if (tag === "BR") { targetParent.appendChild(document.createElement("br")); return; }
    let wrapper = null;
    if (tag === "DIV" || tag === "P") wrapper = document.createElement("div");
    else if (["SPAN","B","STRONG","I","EM","U","S","STRIKE"].includes(tag)) wrapper = document.createElement("span");
    const target = wrapper || targetParent;
    if (wrapper) {
      if (tag === "B" || tag === "STRONG") wrapper.style.fontWeight = "700";
      if (tag === "I" || tag === "EM") wrapper.style.fontStyle = "italic";
      if (tag === "U") wrapper.style.textDecorationLine = "underline";
      if (tag === "S" || tag === "STRIKE") wrapper.style.textDecorationLine = "line-through";
      const safeStyle = sanitizeStyle(sourceNode.style);
      if (safeStyle) wrapper.setAttribute("style", safeStyle);
      if (sourceNode.dataset?.seyesCircle === "true") wrapper.dataset.seyesCircle = "true";
      targetParent.appendChild(wrapper);
    }
    Array.from(sourceNode.childNodes).forEach((child) => walk(child, target));
  };
  Array.from(template.content.childNodes).forEach((node) => walk(node, output));
  return output.innerHTML;
}

function renderPaperSvg(){
  const uid = `seyes-${Math.random().toString(36).slice(2,8)}`;
  return `<svg class="ttp-seyes-paper-svg" data-seyes-paper aria-hidden="true" focusable="false"><defs><pattern id="${uid}" data-paper-pattern width="60" height="60" patternUnits="userSpaceOnUse"></pattern></defs><rect data-paper-fill width="100%" height="100%" fill="url(#${uid})"></rect><line data-paper-margin class="ttp-seyes-margin-line" x1="0" x2="0" y1="0" y2="100%"></line></svg>`;
}

function updatePaper(root, state){
  const svg = root.querySelector("[data-seyes-paper]");
  const pattern = root.querySelector("[data-paper-pattern]");
  const margin = root.querySelector("[data-paper-margin]");
  if (!svg || !pattern || !margin) return;
  const line = BASE_LINE_PX * state.scale;
  const quarter = line / 4;
  const origin = SAFE_TOP_PX + line;
  pattern.setAttribute("width", String(line));
  pattern.setAttribute("height", String(line));
  pattern.setAttribute("x", String(SAFE_LEFT_PX));
  pattern.setAttribute("y", String(origin - line));
  let markup = `<rect width="${line}" height="${line}" fill="#fff"></rect>`;
  if (state.ruling === "single") {
    markup += `<line class="ttp-seyes-grid-major" x1="0" x2="${line}" y1="${line - .5}" y2="${line - .5}"></line>`;
  } else if (state.ruling === "double") {
    markup += `<line class="ttp-seyes-grid-minor" x1="0" x2="${line}" y1="${line * .45}" y2="${line * .45}"></line><line class="ttp-seyes-grid-major" x1="0" x2="${line}" y1="${line - .5}" y2="${line - .5}"></line>`;
  } else if (state.ruling === "large") {
    markup += [1/3,2/3].map((part) => `<line class="ttp-seyes-grid-minor" x1="0" x2="${line}" y1="${line*part}" y2="${line*part}"></line>`).join("");
    markup += `<line class="ttp-seyes-grid-major" x1="0" x2="${line}" y1="${line - .5}" y2="${line - .5}"></line>`;
  } else if (state.ruling === "earth") {
    markup += `<rect x="0" y="0" width="${line}" height="${line/3}" fill="rgba(125,205,255,.20)"></rect><rect x="0" y="${line/3}" width="${line}" height="${line/3}" fill="rgba(122,210,115,.20)"></rect><rect x="0" y="${line*2/3}" width="${line}" height="${line/3}" fill="rgba(239,183,103,.23)"></rect><line class="ttp-seyes-grid-major" x1="0" x2="${line}" y1="${line*2/3}" y2="${line*2/3}"></line>`;
  } else {
    for (let y = quarter; y < line; y += quarter) markup += `<line class="${Math.abs(y-line)<1 ? "ttp-seyes-grid-major" : "ttp-seyes-grid-minor"}" x1="0" x2="${line}" y1="${y}" y2="${y}"></line>`;
    markup += `<line class="ttp-seyes-grid-major" x1="0" x2="${line}" y1="${line - .5}" y2="${line - .5}"></line><line class="ttp-seyes-grid-vertical" x1="0" x2="0" y1="0" y2="${line}"></line>`;
  }
  pattern.innerHTML = markup;
  const showMargin = state.ruling === "seyes";
  margin.hidden = !showMargin;
  const x = SAFE_LEFT_PX + line;
  margin.setAttribute("x1", String(x)); margin.setAttribute("x2", String(x));
}

function saveSelection(editor){
  const selection = window.getSelection?.();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return;
  savedSelections.set(editor, range.cloneRange());
}
function restoreSelection(editor){
  const range = savedSelections.get(editor); if (!range) return false;
  const selection = window.getSelection?.(); if (!selection) return false;
  try { selection.removeAllRanges(); selection.addRange(range); editor.focus({ preventScroll:true }); return true; } catch { return false; }
}
function syncEditor(editor, sendAction){
  const contentHtml = sanitizeContentHtml(editor.innerHTML);
  editor.dataset.lastSentHtml = contentHtml;
  sendAction?.("set-content", { contentHtml });
}
function scheduleSync(editor, sendAction){
  const previous = pendingTimers.get(editor); if (previous) clearTimeout(previous);
  pendingTimers.set(editor, window.setTimeout(() => { pendingTimers.delete(editor); syncEditor(editor, sendAction); }, CONTENT_SYNC_DELAY_MS));
}

function wrapSelection(editor, style = {}, dataset = {}){
  restoreSelection(editor);
  const selection = window.getSelection?.();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer) || range.collapsed) return false;
  const wrapper = document.createElement("span");
  Object.assign(wrapper.style, style);
  Object.entries(dataset).forEach(([key,value]) => { wrapper.dataset[key] = value; });
  const fragment = range.extractContents(); wrapper.appendChild(fragment); range.insertNode(wrapper);
  range.selectNodeContents(wrapper); selection.removeAllRanges(); selection.addRange(range); saveSelection(editor);
  editor.dispatchEvent(new Event("input", { bubbles:true }));
  return true;
}
function execCommand(editor, command, value = null){
  restoreSelection(editor) || editor.focus({ preventScroll:true });
  try { document.execCommand(command, false, value); } catch {}
  saveSelection(editor); editor.dispatchEvent(new Event("input", { bubbles:true }));
}
function clearSelectionFormatting(editor){
  restoreSelection(editor) || editor.focus({ preventScroll:true });
  try { document.execCommand("removeFormat", false, null); } catch {}
  const selection = window.getSelection?.();
  if (selection?.rangeCount) {
    const range = selection.getRangeAt(0);
    editor.querySelectorAll("span").forEach((span) => {
      let intersects = false;
      try { intersects = range.intersectsNode(span); } catch {}
      if (!intersects) return;
      span.removeAttribute("data-seyes-circle");
      [
        "color", "background-color", "text-decoration-line", "text-decoration-color",
        "text-decoration-thickness", "border-color", "border-width", "border-style",
        "border-radius", "padding", "font-weight", "font-style"
      ].forEach((property) => span.style.removeProperty(property));
      if (!String(span.getAttribute("style") || "").trim()) span.removeAttribute("style");
    });
  }
  saveSelection(editor);
  editor.dispatchEvent(new Event("input", { bubbles:true }));
}
function applyDecoration(editor, state, kind){
  const color = state.formatColor;
  const thickness = `${state.formatThickness}px`;
  if (kind === "underline") {
    if (!wrapSelection(editor, { textDecorationLine:"underline", textDecorationColor:color, textDecorationThickness:thickness })) execCommand(editor, "underline");
  } else if (kind === "strike") {
    if (!wrapSelection(editor, { textDecorationLine:"line-through", textDecorationColor:color, textDecorationThickness:thickness })) execCommand(editor, "strikeThrough");
  } else if (kind === "circle") {
    wrapSelection(editor, { border:`${state.formatThickness}px solid ${color}`, borderRadius:"999px", padding:"0 .12em" }, { seyesCircle:"true" });
  }
}

function openPasteDialog(sendAction){
  const dialog = document.createElement("dialog");
  dialog.className = "tt-seyes-dialog";
  dialog.innerHTML = `<form method="dialog" class="tt-seyes-dialog-card"><div class="tt-seyes-dialog-head"><strong>Coller du texte brut</strong><button type="button" data-close>×</button></div><textarea class="tt-seyes-paste-text" rows="11" spellcheck="false" placeholder="Colle le texte ici…"></textarea><div class="tt-seyes-dialog-actions"><button type="button" data-close>Annuler</button><button type="button" class="is-primary" data-insert>Insérer</button></div></form>`;
  document.body.appendChild(dialog);
  dialog.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  dialog.querySelector("[data-insert]")?.addEventListener("click", () => { const text = dialog.querySelector("textarea")?.value || ""; sendAction?.("set-content", { contentHtml: plainTextToSeyesHtml(text) }); dialog.close(); });
  dialog.addEventListener("close", () => dialog.remove(), { once:true });
  dialog.showModal?.(); dialog.querySelector("textarea")?.focus();
}

function renderRulingTiles(state){
  return SEYES_RULINGS.map((item) => `<button class="ttp-seyes-ruling-tile${state.ruling === item.id ? " is-selected" : ""}" type="button" data-seyes-ruling="${item.id}" aria-pressed="${state.ruling === item.id}"><span class="ttp-seyes-ruling-preview is-${item.id}" aria-hidden="true"></span><span>${escapeHtml(item.label)}</span></button>`).join("");
}
function renderColors(attribute, current){
  return SEYES_FORMAT_PALETTE.map((color) => `<button class="ttp-seyes-swatch${String(current).toLowerCase() === color.toLowerCase() ? " is-selected" : ""}" type="button" ${attribute}="${color}" style="--seyes-swatch:${color}" aria-label="Couleur ${color}"></button>`).join("");
}

function renderChrome(chromeHost, state){
  if (!chromeHost) return;
  const ui = localUiState.get(chromeHost) || { letterOpen:false, wordOpen:false, formatColorOpen:false, textColorOpen:false, highlightOpen:false, resetArmed:false };
  localUiState.set(chromeHost, ui);
  const align = alignmentMeta(state.alignment);
  chromeHost.innerHTML = `
    <div class="ttp-seyes-chrome">
      <section class="ttp-seyes-chrome-section"><strong>Document</strong><div class="ttp-seyes-action-row">
        <button type="button" data-seyes-reset class="${ui.resetArmed ? "is-danger" : ""}"><span class="ttp-material-icon">restart_alt</span><span>${ui.resetArmed ? "Confirmer" : "Nouveau"}</span></button>
        <button type="button" data-seyes-save-local><span class="ttp-material-icon">download</span><span>.seyes</span></button>
        <label class="ttp-seyes-file-button"><span class="ttp-material-icon">folder_open</span><span>Ouvrir</span><input type="file" data-seyes-open accept=".seyes,.txt,text/plain,application/vnd.site-outils.seyes+json"></label>
        <button type="button" data-seyes-paste><span class="ttp-material-icon">content_paste</span><span>Coller</span></button>
        <button type="button" data-seyes-pdf><span class="ttp-material-icon">text_snippet</span><span>PDF</span></button>
      </div></section>
      <section class="ttp-seyes-chrome-section"><strong>Écriture</strong>
        <label class="ttp-seyes-field"><span>Police</span><select data-seyes-font>${SEYES_FONTS.map((font) => `<option value="${font.id}" ${font.id === state.fontId ? "selected" : ""}>${escapeHtml(font.label)}</option>`).join("")}</select></label>
        <label class="ttp-seyes-field"><span>Échelle</span><div class="ttp-seyes-range-row"><input type="range" data-seyes-scale min="${SEYES_SCALE_MIN}" max="${SEYES_SCALE_MAX}" step="${SEYES_SCALE_STEP}" value="${state.scale}"><b>${formatScale(state.scale)}</b></div></label>
        <div class="ttp-seyes-ruling-grid">${renderRulingTiles(state)}</div>
        <div class="ttp-seyes-action-row">
          <button type="button" data-seyes-align title="Alignement : ${align.label}"><span class="ttp-material-icon">${align.icon}</span><span>${align.label}</span></button>
          <div class="ttp-seyes-popover-anchor"><button type="button" data-toggle-letter class="${ui.letterOpen ? "is-active" : ""}">Espacement lettres</button>${ui.letterOpen ? `<div class="ttp-seyes-mini-popover"><input type="range" data-letter-spacing min="-0.04" max="0.24" step="0.01" value="${state.letterSpacing}"><b>${Math.round(state.letterSpacing*100)} %</b></div>` : ""}</div>
          <div class="ttp-seyes-popover-anchor"><button type="button" data-toggle-word class="${ui.wordOpen ? "is-active" : ""}">Espacement mots</button>${ui.wordOpen ? `<div class="ttp-seyes-mini-popover"><input type="range" data-word-spacing min="-0.04" max="0.7" step="0.02" value="${state.wordSpacing}"><b>${Math.round(state.wordSpacing*100)} %</b></div>` : ""}</div>
        </div>
      </section>
      <section class="ttp-seyes-chrome-section"><strong>Mise en forme de la sélection</strong>
        <div class="ttp-seyes-action-row ttp-seyes-format-actions">
          <button type="button" data-format="underline" title="Souligner"><span class="ttp-material-icon">format_underlined</span></button>
          <button type="button" data-format="strike" title="Barrer"><span class="ttp-material-icon">horizontal_rule</span></button>
          <button type="button" data-format="circle" title="Entourer"><span class="ttp-material-icon">radio_button_unchecked</span></button>
          <button type="button" data-toggle-text-color title="Couleur du texte"><span class="ttp-material-icon">palette</span><span>Texte</span></button>
          <button type="button" data-toggle-highlight title="Surligner"><span class="ttp-material-icon">border_color</span><span>Surligner</span></button>
          <button type="button" data-format="clear" title="Supprimer le formatage"><span class="ttp-material-icon">ink_eraser</span></button>
        </div>
        ${ui.textColorOpen ? `<div class="ttp-seyes-swatches">${renderColors("data-text-color", state.formatColor)}</div>` : ""}
        ${ui.highlightOpen ? `<div class="ttp-seyes-swatches">${renderColors("data-highlight-color", state.highlightColor)}</div>` : ""}
        <div class="ttp-seyes-format-settings"><span>Trait</span><div class="ttp-seyes-swatches is-inline">${renderColors("data-format-color", state.formatColor)}</div><label><span>Épaisseur</span><input type="range" data-format-thickness min="1" max="5" step="1" value="${state.formatThickness}"><b>${state.formatThickness}</b></label></div>
      </section>
    </div>`;
}

function bindChrome({ root, editor, chromeHost, state, sendAction, showToast } = {}){
  if (!chromeHost) return;
  const ui = localUiState.get(chromeHost) || {};
  chromeHost.querySelectorAll("button,label,select,input").forEach((control) => control.addEventListener("pointerdown", (event) => { saveSelection(editor); if (control.tagName === "BUTTON") event.preventDefault(); }, { passive:false }));
  const rerenderChrome = () => { renderChrome(chromeHost, root.__seyesState); bindChrome({ root, editor, chromeHost, state:root.__seyesState, sendAction, showToast }); };

  chromeHost.querySelector("[data-seyes-reset]")?.addEventListener("click", () => {
    if (!ui.resetArmed) { ui.resetArmed = true; rerenderChrome(); window.setTimeout(() => { if (ui.resetArmed) { ui.resetArmed = false; rerenderChrome(); } }, 3500); return; }
    ui.resetArmed = false; sendAction?.("reset-document");
  });
  chromeHost.querySelector("[data-seyes-save-local]")?.addEventListener("click", () => downloadSeyesDocument(root.__seyesState));
  chromeHost.querySelector("[data-seyes-open]")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0]; if (!file) return;
    try { sendAction?.("load-document", { state: await readSeyesDocumentFile(file) }); }
    catch (error) { showToast?.(error?.message || "Ouverture impossible.", { isError:true }); }
    event.currentTarget.value = "";
  });
  chromeHost.querySelector("[data-seyes-paste]")?.addEventListener("click", () => openPasteDialog(sendAction));
  chromeHost.querySelector("[data-seyes-pdf]")?.addEventListener("click", () => openSeyesPdfExportDialog({ state:root.__seyesState, showToast }));
  chromeHost.querySelector("[data-seyes-font]")?.addEventListener("change", (event) => sendAction?.("set-settings", { fontId:event.currentTarget.value }));
  const scale = chromeHost.querySelector("[data-seyes-scale]");
  scale?.addEventListener("input", () => { const b = scale.parentElement?.querySelector("b"); if (b) b.textContent = formatScale(scale.value); });
  scale?.addEventListener("change", () => sendAction?.("set-settings", { scale:Number(scale.value) }));
  chromeHost.querySelectorAll("[data-seyes-ruling]").forEach((button) => button.addEventListener("click", () => sendAction?.("set-settings", { ruling:button.dataset.seyesRuling })));
  chromeHost.querySelector("[data-seyes-align]")?.addEventListener("click", () => sendAction?.("set-settings", { alignment:alignmentMeta(root.__seyesState.alignment).next }));
  chromeHost.querySelector("[data-toggle-letter]")?.addEventListener("click", () => { ui.letterOpen = !ui.letterOpen; ui.wordOpen = false; rerenderChrome(); });
  chromeHost.querySelector("[data-toggle-word]")?.addEventListener("click", () => { ui.wordOpen = !ui.wordOpen; ui.letterOpen = false; rerenderChrome(); });
  const letter = chromeHost.querySelector("[data-letter-spacing]");
  letter?.addEventListener("input", () => { const b = letter.parentElement?.querySelector("b"); if (b) b.textContent = `${Math.round(Number(letter.value)*100)} %`; });
  letter?.addEventListener("change", () => sendAction?.("set-settings", { letterSpacing:Number(letter.value) }));
  const word = chromeHost.querySelector("[data-word-spacing]");
  word?.addEventListener("input", () => { const b = word.parentElement?.querySelector("b"); if (b) b.textContent = `${Math.round(Number(word.value)*100)} %`; });
  word?.addEventListener("change", () => sendAction?.("set-settings", { wordSpacing:Number(word.value) }));
  chromeHost.querySelectorAll("[data-format]").forEach((button) => button.addEventListener("click", () => {
    const kind = button.dataset.format;
    if (kind === "clear") clearSelectionFormatting(editor); else applyDecoration(editor, root.__seyesState, kind);
  }));
  chromeHost.querySelector("[data-toggle-text-color]")?.addEventListener("click", () => { ui.textColorOpen = !ui.textColorOpen; ui.highlightOpen = false; rerenderChrome(); });
  chromeHost.querySelector("[data-toggle-highlight]")?.addEventListener("click", () => { ui.highlightOpen = !ui.highlightOpen; ui.textColorOpen = false; rerenderChrome(); });
  chromeHost.querySelectorAll("[data-text-color]").forEach((button) => button.addEventListener("click", () => { sendAction?.("set-settings", { formatColor:button.dataset.textColor }); execCommand(editor, "foreColor", button.dataset.textColor); ui.textColorOpen=false; }));
  chromeHost.querySelectorAll("[data-highlight-color]").forEach((button) => button.addEventListener("click", () => { sendAction?.("set-settings", { highlightColor:button.dataset.highlightColor }); execCommand(editor, "hiliteColor", button.dataset.highlightColor); ui.highlightOpen=false; }));
  chromeHost.querySelectorAll("[data-format-color]").forEach((button) => button.addEventListener("click", () => sendAction?.("set-settings", { formatColor:button.dataset.formatColor })));
  const thickness = chromeHost.querySelector("[data-format-thickness]");
  thickness?.addEventListener("input", () => { const b = thickness.parentElement?.querySelector("b"); if (b) b.textContent = thickness.value; });
  thickness?.addEventListener("change", () => sendAction?.("set-settings", { formatThickness:Number(thickness.value) }));
}

function bindEditor(editor, sendAction){
  if (!editor || editor.dataset.seyesBound === "true") return;
  editor.dataset.seyesBound = "true";
  editor.addEventListener("input", () => { saveSelection(editor); scheduleSync(editor, sendAction); });
  ["keyup","pointerup","focus"].forEach((type) => editor.addEventListener(type, () => saveSelection(editor)));
  editor.addEventListener("blur", () => { const timer = pendingTimers.get(editor); if (timer) clearTimeout(timer); pendingTimers.delete(editor); syncEditor(editor, sendAction); });
  editor.addEventListener("paste", (event) => {
    event.preventDefault(); const text = event.clipboardData?.getData("text/plain") || "";
    restoreSelection(editor) || editor.focus({ preventScroll:true });
    try { document.execCommand("insertText", false, text); } catch {}
    editor.dispatchEvent(new Event("input", { bubbles:true }));
  });
}

function applyState(root, state){
  root.__seyesState = state;
  const editor = root.querySelector("[data-seyes-editor]");
  const line = BASE_LINE_PX * state.scale;
  const fontSize = BASE_FONT_PX * state.scale;
  const family = getSeyesFont(state.fontId).family;
  root.style.setProperty("--seyes-line", `${line}px`);
  root.style.setProperty("--seyes-font-size", `${fontSize}px`);
  root.style.setProperty("--seyes-font-family", `"${family}"`);
  root.style.setProperty("--seyes-letter-spacing", `${state.letterSpacing}em`);
  root.style.setProperty("--seyes-word-spacing", `${state.wordSpacing}em`);
  root.style.setProperty("--seyes-editor-left", `${SAFE_LEFT_PX + (state.ruling === "seyes" ? line + 10 : 22)}px`);
  root.style.setProperty("--seyes-editor-top", `${SAFE_TOP_PX + line * 0.18}px`);
  root.dataset.ruling = state.ruling;
  editor.style.textAlign = state.alignment;
  const safeHtml = sanitizeContentHtml(state.contentHtml);
  const focused = document.activeElement === editor || editor.contains(document.activeElement);
  if (!focused && sanitizeContentHtml(editor.innerHTML) !== safeHtml) editor.innerHTML = safeHtml;
  updatePaper(root, state);
  try { document.fonts?.load?.(`400 ${Math.max(12,fontSize)}px "${family}"`).then(() => root.classList.add("is-font-ready")); } catch { root.classList.add("is-font-ready"); }
}

export function renderSeyesProjector({ host, chromeHost, state, sendAction } = {}){
  if (!host) return;
  const safeState = normalizeSeyesState(state);
  let root = host.querySelector(":scope > .ttp-seyes-app");
  if (!root) {
    host.innerHTML = `<div class="ttp-seyes-app" data-ruling="${safeState.ruling}"><div class="ttp-seyes-sheet">${renderPaperSvg()}<div class="ttp-seyes-editor" data-seyes-editor contenteditable="true" role="textbox" aria-multiline="true" aria-label="Document Seyès" spellcheck="false"></div></div></div>`;
    root = host.querySelector(":scope > .ttp-seyes-app");
    const editor = root.querySelector("[data-seyes-editor]");
    editor.innerHTML = sanitizeContentHtml(safeState.contentHtml);
    bindEditor(editor, sendAction);
  }
  const editor = root.querySelector("[data-seyes-editor]");
  bindEditor(editor, sendAction);
  applyState(root, safeState);
  if (chromeHost) {
    renderChrome(chromeHost, safeState);
    bindChrome({ root, editor, chromeHost, state:safeState, sendAction, showToast:(message, options={}) => {
      const event = new CustomEvent("ttp-toast", { detail:{ message, ...options } }); window.dispatchEvent(event);
    }});
  }
}
