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
const TOOLBAR_HEIGHT_PX = 58;
const SAFE_TOP_PX = 34;
const PAPER_TOP_PX = TOOLBAR_HEIGHT_PX + SAFE_TOP_PX;
const SAFE_LEFT_PX = 22;
const UNDERLINE_GRID_NUDGE_PX = 0;
const STRIKE_VERTICAL_NUDGE_PX = 4;
const CONTENT_SYNC_DELAY_MS = 180;
const pendingTimers = new WeakMap();
const savedSelections = new WeakMap();
const paperExtentObservers = new WeakMap();
const baselineOffsetCache = new Map();
const DECORATION_FORMATS = Object.freeze({
  underline: { label:"Souligner", icon:"format_underlined", colorKey:"underlineColor", thicknessKey:"underlineThickness" },
  strike: { label:"Barrer", icon:"format_strikethrough", colorKey:"strikeColor", thicknessKey:"strikeThickness" },
  circle: { label:"Entourer", icon:"format_text_circle", colorKey:"circleColor", thicknessKey:"circleThickness" }
});

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
function colorWithAlpha(value, alpha = .6){
  const safe = String(value || "").trim();
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(safe);
  if (hex) return `rgba(${Number.parseInt(hex[1], 16)},${Number.parseInt(hex[2], 16)},${Number.parseInt(hex[3], 16)},${alpha})`;
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(safe);
  if (rgb) return `rgba(${Math.min(255, Number(rgb[1]))},${Math.min(255, Number(rgb[2]))},${Math.min(255, Number(rgb[3]))},${alpha})`;
  return `rgba(255,192,0,${alpha})`;
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
  const fontWeight = String(source.fontWeight || "").trim();
  const fontStyle = String(source.fontStyle || "").trim();
  const textAlign = String(source.textAlign || "").trim();
  const decorationVariableColor = String(source.getPropertyValue?.("--seyes-decoration-color") || "").trim();
  const decorationVariableThickness = String(source.getPropertyValue?.("--seyes-decoration-thickness") || "").trim();
  const decorationVariableHalfThickness = String(source.getPropertyValue?.("--seyes-decoration-half-thickness") || "").trim();
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
  if (/^(bold|[6-9]00)$/.test(fontWeight)) styles.push("font-weight:700");
  if (fontStyle === "italic") styles.push("font-style:italic");
  if (SEYES_ALIGNMENTS.includes(textAlign)) styles.push(`text-align:${textAlign}`);
  if (isSafeColor(decorationVariableColor)) styles.push(`--seyes-decoration-color:${decorationVariableColor}`);
  if (/^\d+(\.\d+)?px$/.test(decorationVariableThickness)) styles.push(`--seyes-decoration-thickness:${decorationVariableThickness}`);
  if (/^\d+(\.\d+)?px$/.test(decorationVariableHalfThickness)) styles.push(`--seyes-decoration-half-thickness:${decorationVariableHalfThickness}`);
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
    else if (["SPAN","B","STRONG","I","EM","U","S","STRIKE","FONT"].includes(tag)) wrapper = document.createElement("span");
    const target = wrapper || targetParent;
    if (wrapper) {
      if (tag === "B" || tag === "STRONG") wrapper.style.fontWeight = "700";
      if (tag === "I" || tag === "EM") wrapper.style.fontStyle = "italic";
      const safeStyle = sanitizeStyle(sourceNode.style);
      if (safeStyle) wrapper.style.cssText = `${wrapper.style.cssText};${safeStyle}`;
      const sourceDecoration = String(sourceNode.style?.textDecorationLine || sourceNode.style?.textDecoration || "");
      const sourceFontWeight = String(sourceNode.style?.fontWeight || "").trim();
      const sourceBackground = String(sourceNode.style?.backgroundColor || "").replace(/\s+/g, "").toLowerCase();
      const sourceTextColor = String(sourceNode.style?.color || sourceNode.getAttribute("color") || "").trim();
      const sourceTextColorMode = String(sourceNode.dataset?.seyesTextColor || "").trim();
      const hasBold = tag === "B" || tag === "STRONG" || /^(bold|[6-9]00)$/.test(sourceFontWeight) || sourceNode.dataset?.seyesBold === "true";
      const hasHighlight = sourceNode.dataset?.seyesHighlight === "true" || Boolean(sourceBackground && sourceBackground !== "transparent" && sourceBackground !== "rgba(0,0,0,0)");
      const hasUnderline = tag === "U" || sourceDecoration.includes("underline") || sourceNode.dataset?.seyesUnderline === "true";
      const hasStrike = tag === "S" || tag === "STRIKE" || sourceDecoration.includes("line-through") || sourceNode.dataset?.seyesStrike === "true";
      if (hasBold) {
        wrapper.dataset.seyesBold = "true";
        wrapper.style.removeProperty("font-weight");
      }
      if (sourceTextColorMode === "false") wrapper.dataset.seyesTextColor = "false";
      else if (sourceTextColorMode === "true" || isSafeColor(sourceTextColor)) wrapper.dataset.seyesTextColor = "true";
      if (isSafeColor(sourceTextColor)) wrapper.style.color = sourceTextColor;
      if ((tag === "DIV" || tag === "P") && !SEYES_ALIGNMENTS.includes(wrapper.style.textAlign)) {
        const legacyAlignment = String(sourceNode.getAttribute("align") || "").trim().toLowerCase();
        if (SEYES_ALIGNMENTS.includes(legacyAlignment)) wrapper.style.textAlign = legacyAlignment;
      }
      if (hasHighlight) {
        wrapper.dataset.seyesHighlight = "true";
        wrapper.style.backgroundColor = colorWithAlpha(sourceNode.style?.backgroundColor, .6);
      }
      if (hasUnderline) wrapper.dataset.seyesUnderline = "true";
      if (hasStrike) wrapper.dataset.seyesStrike = "true";
      if (hasUnderline || hasStrike) {
        const decorationColor = String(sourceNode.style?.getPropertyValue?.("--seyes-decoration-color") || sourceNode.style?.textDecorationColor || sourceNode.style?.color || "").trim();
        const decorationThickness = String(sourceNode.style?.getPropertyValue?.("--seyes-decoration-thickness") || sourceNode.style?.textDecorationThickness || "").trim();
        if (isSafeColor(decorationColor)) wrapper.style.setProperty("--seyes-decoration-color", decorationColor);
        if (/^\d+(\.\d+)?px$/.test(decorationThickness)) {
          wrapper.style.setProperty("--seyes-decoration-thickness", decorationThickness);
          wrapper.style.setProperty("--seyes-decoration-half-thickness", `${Number.parseFloat(decorationThickness) / 2}px`);
        }
        ["text-decoration", "text-decoration-line", "text-decoration-color", "text-decoration-thickness"].forEach((property) => wrapper.style.removeProperty(property));
      }
      if (sourceNode.dataset?.seyesCircle === "true") {
        wrapper.dataset.seyesCircle = "true";
        const circleColor = String(sourceNode.style?.getPropertyValue?.("--seyes-decoration-color") || sourceNode.style?.borderColor || "").trim();
        const circleThickness = String(sourceNode.style?.getPropertyValue?.("--seyes-decoration-thickness") || sourceNode.style?.borderWidth || "").trim();
        if (isSafeColor(circleColor)) wrapper.style.setProperty("--seyes-decoration-color", circleColor);
        if (/^\d+(\.\d+)?px$/.test(circleThickness)) wrapper.style.setProperty("--seyes-decoration-thickness", circleThickness);
        ["border", "border-color", "border-width", "border-style", "border-radius", "padding"].forEach((property) => wrapper.style.removeProperty(property));
      }
      targetParent.appendChild(wrapper);
    }
    Array.from(sourceNode.childNodes).forEach((child) => walk(child, target));
  };
  Array.from(template.content.childNodes).forEach((node) => walk(node, output));
  return output.innerHTML;
}

function renderPaperSvg(){
  const uid = `seyes-${Math.random().toString(36).slice(2,8)}`;
  const verticalUid = `${uid}-vertical`;
  const colorUid = `${uid}-color`;
  return `<svg class="ttp-seyes-paper-svg" data-seyes-paper aria-hidden="true" focusable="false"><defs><pattern id="${uid}" data-paper-pattern width="60" height="60" patternUnits="userSpaceOnUse"></pattern><pattern id="${verticalUid}" data-paper-vertical-pattern width="60" height="60" patternUnits="userSpaceOnUse"></pattern><pattern id="${colorUid}" data-paper-color-pattern width="60" height="120" patternUnits="userSpaceOnUse"></pattern></defs><rect width="100%" height="100%" fill="#fff"></rect><rect data-paper-color-fill width="100%" height="100%" fill="url(#${colorUid})"></rect><rect data-paper-fill width="100%" height="100%" fill="url(#${uid})"></rect><rect data-paper-vertical-fill width="100%" height="100%" fill="url(#${verticalUid})"></rect><line data-paper-margin class="ttp-seyes-margin-line" x1="0" x2="0" y1="0" y2="100%"></line></svg>`;
}

function updatePaper(root, state){
  const svg = root.querySelector("[data-seyes-paper]");
  const pattern = root.querySelector("[data-paper-pattern]");
  const verticalPattern = root.querySelector("[data-paper-vertical-pattern]");
  const colorPattern = root.querySelector("[data-paper-color-pattern]");
  const fill = root.querySelector("[data-paper-fill]");
  const verticalFill = root.querySelector("[data-paper-vertical-fill]");
  const colorFill = root.querySelector("[data-paper-color-fill]");
  const margin = root.querySelector("[data-paper-margin]");
  if (!svg || !pattern || !verticalPattern || !colorPattern || !fill || !verticalFill || !colorFill || !margin) return;
  const line = BASE_LINE_PX * state.scale;
  const quarter = line / 4;
  const origin = PAPER_TOP_PX + line;
  [pattern, verticalPattern].forEach((item) => {
    item.setAttribute("width", String(line));
    item.setAttribute("height", String(line));
    item.setAttribute("x", String(SAFE_LEFT_PX));
    item.setAttribute("y", String(origin - line));
  });
  const minorLines = state.ruling === "single"
    ? []
    : (state.ruling === "double" ? [quarter, quarter * 3] : [quarter, quarter * 2, quarter * 3]);
  const markup = `${minorLines.map((y) => `<line class="ttp-seyes-grid-minor" x1="0" x2="${line}" y1="${y}" y2="${y}"></line>`).join("")}<line class="ttp-seyes-grid-major" x1="0" x2="${line}" y1="${line - .5}" y2="${line - .5}"></line>`;
  pattern.innerHTML = markup;
  const showVerticals = state.ruling === "seyes" || state.ruling === "earth";
  const showMargin = true;
  const showColors = state.ruling === "earth";
  verticalPattern.innerHTML = showVerticals ? `<line class="ttp-seyes-grid-vertical" x1="0" x2="0" y1="0" y2="${line}"></line>` : "";
  colorPattern.setAttribute("width", String(line));
  colorPattern.setAttribute("height", String(line * 2));
  colorPattern.setAttribute("x", String(SAFE_LEFT_PX));
  colorPattern.setAttribute("y", String(PAPER_TOP_PX));
  colorPattern.innerHTML = showColors ? `<rect x="0" y="${quarter}" width="${line}" height="${quarter * 2}" fill="rgba(128,205,255,.42)"></rect><rect x="0" y="${quarter * 3}" width="${line}" height="${quarter}" fill="rgba(40,238,84,.78)"></rect><rect x="0" y="${line}" width="${line}" height="${quarter * 2}" fill="rgba(240,185,113,.48)"></rect>` : "";
  colorFill.hidden = !showColors;
  colorFill.setAttribute("y", String(PAPER_TOP_PX + quarter));
  colorFill.setAttribute("height", "100%");
  fill.setAttribute("y", String(PAPER_TOP_PX + 1));
  fill.setAttribute("height", "100%");
  verticalFill.hidden = !showVerticals;
  verticalFill.style.display = showVerticals ? "" : "none";
  verticalFill.setAttribute("x", String(SAFE_LEFT_PX + line - 1));
  verticalFill.setAttribute("width", "100%");
  margin.hidden = !showMargin;
  margin.style.display = showMargin ? "" : "none";
  const x = SAFE_LEFT_PX + line;
  margin.setAttribute("x1", String(x)); margin.setAttribute("x2", String(x));
}

function syncPaperExtent(root){
  const sheet = root?.querySelector(".ttp-seyes-sheet");
  const editor = root?.querySelector("[data-seyes-editor]");
  const svg = root?.querySelector("[data-seyes-paper]");
  if (!sheet || !editor || !svg) return;
  const height = Math.ceil(Math.max(sheet.clientHeight, editor.offsetHeight, editor.scrollHeight));
  svg.style.height = `${height}px`;
}

function bindPaperExtent(root){
  if (!root || paperExtentObservers.has(root)) return;
  const sheet = root.querySelector(".ttp-seyes-sheet");
  const editor = root.querySelector("[data-seyes-editor]");
  if (!sheet || !editor) return;
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(() => syncPaperExtent(root));
    observer.observe(sheet);
    observer.observe(editor);
    paperExtentObservers.set(root, observer);
  } else {
    paperExtentObservers.set(root, true);
  }
  syncPaperExtent(root);
}

function measureLineMetrics({ line, fontSize, family }){
  const cacheKey = `${family}|${fontSize}|${line}`;
  if (baselineOffsetCache.has(cacheKey)) return baselineOffsetCache.get(cacheKey);
  const probe = document.createElement("div");
  const glyph = document.createElement("span");
  const marker = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  Object.assign(probe.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "max-content",
    height: `${line}px`,
    margin: "0",
    padding: "0",
    border: "0",
    visibility: "hidden",
    pointerEvents: "none",
    fontFamily: `"${family}", sans-serif`,
    fontSize: `${fontSize}px`,
    fontWeight: "400",
    fontStyle: "normal",
    lineHeight: `${line}px`
  });
  Object.assign(marker.style, {
    display: "inline-block",
    width: "0",
    height: "0",
    margin: "0",
    padding: "0",
    border: "0",
    verticalAlign: "baseline"
  });
  glyph.textContent = "Hg";
  probe.append(glyph, marker);
  document.body.appendChild(probe);
  const markerTop = marker.getBoundingClientRect().top;
  const offset = markerTop - probe.getBoundingClientRect().top;
  const descent = glyph.getBoundingClientRect().bottom - markerTop;
  probe.remove();
  const metrics = {
    baselineOffset: Number.isFinite(offset) ? offset : line * .82,
    descent: Number.isFinite(descent) && descent >= 0 ? descent : fontSize * .2
  };
  const fontSpec = `400 ${Math.max(12, fontSize)}px "${family}"`;
  if (document.fonts?.check?.(fontSpec) !== false) baselineOffsetCache.set(cacheKey, metrics);
  return metrics;
}

function updateEditorTop(root, { line, fontSize, family }){
  const { baselineOffset, descent } = measureLineMetrics({ line, fontSize, family });
  const firstMajorLine = PAPER_TOP_PX + line - .5;
  const firstMinorLineBelow = line / 4 + .5 + UNDERLINE_GRID_NUDGE_PX;
  const strikeLine = fontSize * -.3 + STRIKE_VERTICAL_NUDGE_PX;
  root.style.setProperty("--seyes-editor-top", `${Math.max(0, firstMajorLine - baselineOffset)}px`);
  root.style.setProperty("--seyes-font-descent", `${Math.max(0, descent)}px`);
  root.style.setProperty("--seyes-underline-inset", `${descent - firstMinorLineBelow}px`);
  root.style.setProperty("--seyes-strike-inset", `${descent - strikeLine}px`);
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
function flushEditor(editor, sendAction){
  const previous = pendingTimers.get(editor);
  if (previous) clearTimeout(previous);
  pendingTimers.delete(editor);
  syncEditor(editor, sendAction);
}
function liveSeyesState(root, editor){
  return normalizeSeyesState({
    ...root?.__seyesState,
    contentHtml:sanitizeContentHtml(editor?.innerHTML || root?.__seyesState?.contentHtml || "")
  });
}

function wrapSelection(editor, style = {}, dataset = {}){
  restoreSelection(editor);
  const selection = window.getSelection?.();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer) || range.collapsed) return false;
  const wrapper = document.createElement("span");
  Object.entries(style).forEach(([property, value]) => {
    if (property.startsWith("--")) wrapper.style.setProperty(property, value);
    else wrapper.style[property] = value;
  });
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
      span.removeAttribute("data-seyes-bold");
      span.removeAttribute("data-seyes-highlight");
      span.removeAttribute("data-seyes-text-color");
      span.removeAttribute("data-seyes-underline");
      span.removeAttribute("data-seyes-strike");
      [
        "color", "background-color", "text-decoration-line", "text-decoration-color",
        "text-decoration-thickness", "border-color", "border-width", "border-style",
        "border-radius", "padding", "font-weight", "font-style",
        "--seyes-decoration-color", "--seyes-decoration-thickness", "--seyes-decoration-half-thickness"
      ].forEach((property) => span.style.removeProperty(property));
      if (!String(span.getAttribute("style") || "").trim()) span.removeAttribute("style");
    });
  }
  saveSelection(editor);
  editor.dispatchEvent(new Event("input", { bubbles:true }));
}

function queryFormatCommandState(command){
  try { return document.queryCommandState(command) === true; }
  catch { return false; }
}

function selectedFormatSpans(editor, kind){
  const selection = window.getSelection?.();
  if (!selection?.rangeCount) return [];
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return [];
  const selector = `[data-seyes-${kind}="true"]`;
  if (range.collapsed) {
    const element = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    const span = element?.closest?.(selector);
    return span && editor.contains(span) ? [span] : [];
  }
  return Array.from(editor.querySelectorAll(selector)).filter((span) => {
    try { return range.intersectsNode(span); }
    catch { return false; }
  });
}

function canonicalCssColor(value){
  const probe = document.createElement("span");
  probe.style.color = String(value || "");
  return String(probe.style.color || "").replace(/\s+/g, "").toLowerCase();
}

function rangeTextNodes(editor, range){
  const nodes = [];
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node.data && (() => { try { return range.intersectsNode(node); } catch { return false; } })()) nodes.push(node);
    node = walker.nextNode();
  }
  if (!nodes.length && range.commonAncestorContainer.nodeType === Node.TEXT_NODE) nodes.push(range.commonAncestorContainer);
  return nodes;
}

function selectionHasTextColor(editor, color){
  const selection = window.getSelection?.();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return false;
  const targetColor = canonicalCssColor(color);
  return rangeTextNodes(editor, range).some((node) => {
    const marker = node.parentElement?.closest?.("[data-seyes-text-color]");
    if (!marker || !editor.contains(marker) || marker.dataset.seyesTextColor !== "true") return false;
    const effectiveColor = canonicalCssColor(getComputedStyle(node.parentElement || marker).color);
    return effectiveColor === targetColor;
  });
}

function applyTextColor(editor, state){
  restoreSelection(editor) || editor.focus({ preventScroll:true });
  const selection = window.getSelection?.();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  if (!range || range.collapsed || !editor.contains(range.commonAncestorContainer)) return;
  const disable = selectionHasTextColor(editor, state.textColor);
  const targetColor = disable ? SEYES_DEFAULT_TEXT_COLOR : state.textColor;
  try { document.execCommand("styleWithCSS", false, true); } catch {}
  try { document.execCommand("foreColor", false, targetColor); } catch {}
  const activeRange = selection?.rangeCount ? selection.getRangeAt(0) : range;
  rangeTextNodes(editor, activeRange).forEach((node) => {
    let element = node.parentElement;
    while (element && element !== editor && !element.style.color && !element.getAttribute("color")) element = element.parentElement;
    if (!element || element === editor) return;
    element.style.color = targetColor;
    element.removeAttribute("color");
    element.dataset.seyesTextColor = disable ? "false" : "true";
  });
  saveSelection(editor);
  editor.dispatchEvent(new Event("input", { bubbles:true }));
}

function trimSelectionTrailingSpaces(editor){
  restoreSelection(editor);
  const selection = window.getSelection?.();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0).cloneRange();
  if (!editor.contains(range.commonAncestorContainer) || range.collapsed) return false;
  const lastTextBoundary = (node) => {
    if (node?.nodeType === Node.TEXT_NODE && node.data.length) return { container:node, offset:node.data.length - 1 };
    for (let index = (node?.childNodes?.length || 0) - 1; index >= 0; index -= 1) {
      const boundary = lastTextBoundary(node.childNodes[index]);
      if (boundary) return boundary;
    }
    return null;
  };
  const previousTextBoundary = (container, offset) => {
    if (container.nodeType === Node.TEXT_NODE && offset > 0) return { container, offset:offset - 1 };
    if (container.nodeType === Node.ELEMENT_NODE && offset > 0) {
      for (let index = offset - 1; index >= 0; index -= 1) {
        const boundary = lastTextBoundary(container.childNodes[index]);
        if (boundary) return boundary;
      }
    }
    let node = container;
    while (node && node !== editor) {
      const parent = node.parentNode;
      if (!parent) return null;
      const index = Array.prototype.indexOf.call(parent.childNodes, node);
      if (index > 0) return previousTextBoundary(parent, index);
      node = parent;
    }
    return null;
  };
  let changed = false;
  while (/[ \t\u00a0]$/.test(range.toString())) {
    const previous = previousTextBoundary(range.endContainer, range.endOffset);
    if (!previous) break;
    range.setEnd(previous.container, previous.offset);
    changed = true;
  }
  if (range.collapsed) return false;
  if (changed) {
    selection.removeAllRanges();
    selection.addRange(range);
    saveSelection(editor);
  }
  return true;
}

function currentParagraphAlignment(editor, fallback = "left"){
  const selection = window.getSelection?.();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  if (!range || !editor?.contains(range.commonAncestorContainer)) return SEYES_ALIGNMENTS.includes(fallback) ? fallback : "left";
  const element = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
  const paragraph = element?.closest?.("div,p") || editor;
  const computed = String(getComputedStyle(paragraph).textAlign || "").toLowerCase();
  if (computed === "center") return "center";
  if (computed === "right" || computed === "end") return "right";
  return "left";
}

function updateToolbarAlignmentState(root, editor, fallback = "left"){
  const align = alignmentMeta(currentParagraphAlignment(editor, fallback));
  const button = root?.querySelector("[data-toolbar-align]");
  button?.setAttribute("title", `Alignement : ${align.label}`);
  button?.setAttribute("aria-label", `Alignement : ${align.label}`);
  const icon = button?.querySelector(".ttp-material-icon");
  if (icon && icon.dataset.materialIconName !== align.icon && icon.textContent.trim() !== align.icon) icon.textContent = align.icon;
}

function updateToolbarFormatState(root, editor){
  const selection = window.getSelection?.();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const hasEditorRange = Boolean(range && editor?.contains(range.commonAncestorContainer));
  const isEditorCaret = hasEditorRange && range.collapsed;
  const states = {
    bold: selectedFormatSpans(editor, "bold").length > 0 || (isEditorCaret && queryFormatCommandState("bold")),
    underline: selectedFormatSpans(editor, "underline").length > 0 || (isEditorCaret && queryFormatCommandState("underline")),
    strike: selectedFormatSpans(editor, "strike").length > 0 || (isEditorCaret && queryFormatCommandState("strikeThrough")),
    circle: selectedFormatSpans(editor, "circle").length > 0,
    highlight: selectedFormatSpans(editor, "highlight").length > 0,
    "text-color": selectionHasTextColor(editor, root?.__seyesState?.textColor)
  };
  root?.querySelectorAll("[data-toolbar-format]").forEach((button) => {
    const active = states[button.dataset.toolbarFormat] === true;
    button.classList.toggle("is-pressed", active);
    button.setAttribute("aria-pressed", String(active));
  });
  updateToolbarAlignmentState(root, editor, root?.__seyesState?.alignment);
}

function removeCustomFormatting(editor, spans, kind){
  spans.forEach((span) => {
    span.removeAttribute(`data-seyes-${kind}`);
    ["--seyes-decoration-color", "--seyes-decoration-thickness", "--seyes-decoration-half-thickness"].forEach((property) => span.style.removeProperty(property));
    if (kind === "highlight") span.style.removeProperty("background-color");
    if (!String(span.getAttribute("style") || "").trim()) span.removeAttribute("style");
  });
  saveSelection(editor);
  editor.dispatchEvent(new Event("input", { bubbles:true }));
}

function applyDecoration(editor, state, kind){
  if (kind === "text-color") {
    applyTextColor(editor, state);
  } else if (kind === "bold") {
    restoreSelection(editor) || editor.focus({ preventScroll:true });
    const selection = window.getSelection?.();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || !editor.contains(range.commonAncestorContainer)) return;
    if (range.collapsed) {
      execCommand(editor, "bold");
      return;
    }
    const spans = selectedFormatSpans(editor, "bold");
    if (spans.length) removeCustomFormatting(editor, spans, "bold");
    else wrapSelection(editor, {}, { seyesBold:"true" });
  } else if (kind === "highlight") {
    restoreSelection(editor) || editor.focus({ preventScroll:true });
    if (!trimSelectionTrailingSpaces(editor)) return;
    const highlights = selectedFormatSpans(editor, "highlight");
    if (highlights.length) removeCustomFormatting(editor, highlights, "highlight");
    else wrapSelection(editor, { backgroundColor:colorWithAlpha(state.highlightColor, .6) }, { seyesHighlight:"true" });
  } else if (kind === "underline" || kind === "strike") {
    restoreSelection(editor) || editor.focus({ preventScroll:true });
    if (!trimSelectionTrailingSpaces(editor)) return;
    const spans = selectedFormatSpans(editor, kind);
    if (spans.length) {
      removeCustomFormatting(editor, spans, kind);
      return;
    }
    const command = kind === "underline" ? "underline" : "strikeThrough";
    if (queryFormatCommandState(command)) {
      execCommand(editor, command);
      return;
    }
    const color = state[`${kind}Color`];
    const thickness = `${state[`${kind}Thickness`]}px`;
    wrapSelection(editor, {
      "--seyes-decoration-color":color,
      "--seyes-decoration-thickness":thickness,
      "--seyes-decoration-half-thickness":`${state[`${kind}Thickness`] / 2}px`
    }, { [`seyes${kind[0].toUpperCase()}${kind.slice(1)}`]:"true" });
  } else if (kind === "circle") {
    restoreSelection(editor) || editor.focus({ preventScroll:true });
    if (!trimSelectionTrailingSpaces(editor)) return;
    const circles = selectedFormatSpans(editor, "circle");
    if (circles.length) removeCustomFormatting(editor, circles, "circle");
    else wrapSelection(editor, {
      "--seyes-decoration-color":state.circleColor,
      "--seyes-decoration-thickness":`${state.circleThickness}px`
    }, { seyesCircle:"true" });
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
  return SEYES_RULINGS.map((item) => `<button class="ttp-seyes-ruling-tile${state.ruling === item.id ? " is-selected" : ""}" type="button" data-toolbar-ruling="${item.id}" aria-pressed="${state.ruling === item.id}"><span class="ttp-seyes-ruling-preview is-${item.id}" aria-hidden="true"></span><span>${escapeHtml(item.label)}</span></button>`).join("");
}
function renderColors(attribute, current){
  return SEYES_FORMAT_PALETTE.map((color) => `<button class="ttp-seyes-swatch${String(current).toLowerCase() === color.toLowerCase() ? " is-selected" : ""}" type="button" ${attribute}="${color}" style="--seyes-swatch:${color}" aria-label="Couleur ${color}"></button>`).join("");
}
function renderDecorationControl(kind, state){
  const format = DECORATION_FORMATS[kind];
  const color = state[format.colorKey];
  const thickness = state[format.thicknessKey];
  const swatches = SEYES_FORMAT_PALETTE.map((item) => `<button class="ttp-seyes-swatch${String(color).toLowerCase() === item.toLowerCase() ? " is-selected" : ""}" type="button" data-toolbar-decoration-color="${item}" data-toolbar-decoration-kind="${kind}" style="--seyes-swatch:${item}" aria-label="Couleur ${item}"></button>`).join("");
  return `<div class="ttp-seyes-toolbar-control ttp-seyes-toolbar-format-group">
    <button type="button" class="is-compact is-icon-only is-format-main" data-toolbar-format="${kind}" aria-pressed="false" title="${format.label}" aria-label="${format.label}"><span class="ttp-material-icon">${format.icon}</span></button>
    <button type="button" class="is-compact is-format-options" data-toolbar-format-options-toggle="${kind}" data-toolbar-popover-toggle="format-${kind}" aria-expanded="false" title="Options : ${format.label.toLowerCase()}" aria-label="Options : ${format.label.toLowerCase()}"><span class="ttp-material-icon">expand_more</span></button>
    <div class="ttp-seyes-toolbar-tooltip is-format-options" data-toolbar-format-options-popover="${kind}" data-toolbar-popover="format-${kind}" hidden>
      <div class="ttp-seyes-toolbar-color-row"><span>Couleur</span><div class="ttp-seyes-swatches is-inline">${swatches}</div></div>
      <label class="ttp-seyes-toolbar-thickness-row"><span>Épaisseur</span><input type="range" data-toolbar-decoration-thickness="${kind}" min="1" max="5" step="1" value="${thickness}" aria-label="Épaisseur : ${format.label.toLowerCase()}"><b data-toolbar-decoration-thickness-output="${kind}">${thickness}</b></label>
    </div>
  </div>`;
}
function renderHighlightControl(state){
  const swatches = SEYES_FORMAT_PALETTE.map((color) => `<button class="ttp-seyes-swatch${String(state.highlightColor).toLowerCase() === color.toLowerCase() ? " is-selected" : ""}" type="button" data-toolbar-highlight-color="${color}" style="--seyes-swatch:${colorWithAlpha(color, .6)}" aria-label="Couleur de surlignage ${color}"></button>`).join("");
  return `<div class="ttp-seyes-toolbar-control ttp-seyes-toolbar-format-group">
    <button type="button" class="is-compact is-icon-only is-format-main" data-toolbar-format="highlight" aria-pressed="false" title="Surligner" aria-label="Surligner"><span class="ttp-material-icon">border_color</span></button>
    <button type="button" class="is-compact is-format-options" data-toolbar-highlight-options-toggle data-toolbar-popover-toggle="highlight-options" aria-expanded="false" title="Couleur du surlignage" aria-label="Couleur du surlignage"><span class="ttp-material-icon">expand_more</span></button>
    <div class="ttp-seyes-toolbar-tooltip is-highlight-options" data-toolbar-highlight-options-popover data-toolbar-popover="highlight-options" hidden>
      <div class="ttp-seyes-toolbar-color-row"><span>Couleur</span><div class="ttp-seyes-swatches is-inline">${swatches}</div></div>
    </div>
  </div>`;
}

function renderTextColorControl(state){
  return `<div class="ttp-seyes-toolbar-control ttp-seyes-toolbar-format-group">
    <button type="button" class="is-compact is-icon-only is-format-main" data-toolbar-format="text-color" aria-pressed="false" title="Couleur du texte" aria-label="Couleur du texte" style="--seyes-text-color:${escapeAttr(state.textColor)}"><span class="ttp-material-icon">format_color_text</span></button>
    <button type="button" class="is-compact is-format-options" data-toolbar-text-color-options-toggle data-toolbar-popover-toggle="colors" aria-expanded="false" title="Choisir la couleur du texte" aria-label="Choisir la couleur du texte"><span class="ttp-material-icon">expand_more</span></button>
    <div class="ttp-seyes-toolbar-tooltip is-colors" data-toolbar-colors-popover data-toolbar-popover="colors" hidden>
      <div class="ttp-seyes-toolbar-color-row"><span>Texte</span><div class="ttp-seyes-swatches is-inline">${renderColors("data-toolbar-text-color", state.textColor)}</div></div>
    </div>
  </div>`;
}

function renderDocumentToolbar(state){
  const align = alignmentMeta(state.alignment);
  return `<div class="ttp-seyes-toolbar ttp-app-overlay-controls" data-seyes-toolbar role="toolbar" aria-label="Document">
    <button type="button" class="is-compact is-icon-only" data-toolbar-reset title="Nouveau" aria-label="Nouveau"><span class="ttp-material-icon">restart_alt</span></button>
    <label class="ttp-seyes-toolbar-file is-compact is-icon-only" title="Ouvrir"><span class="ttp-material-icon">folder_open</span><input type="file" data-toolbar-open aria-label="Ouvrir" accept=".seyes,.txt,text/plain,application/vnd.site-outils.seyes+json"></label>
    <button type="button" class="is-compact is-icon-only" data-toolbar-paste title="Coller" aria-label="Coller"><span class="ttp-material-icon">content_paste</span></button>
    <span class="ttp-seyes-toolbar-separator" aria-hidden="true"></span>
    <select class="ttp-seyes-toolbar-select" data-toolbar-font aria-label="Police">${SEYES_FONTS.map((font) => `<option value="${font.id}" ${font.id === state.fontId ? "selected" : ""}>${escapeHtml(font.label)}</option>`).join("")}</select>
    <div class="ttp-seyes-toolbar-control">
      <button type="button" class="is-compact" data-toolbar-scale-toggle data-toolbar-popover-toggle="scale" aria-expanded="false" title="Échelle"><span class="ttp-material-icon">format_size</span><span data-toolbar-scale-value>${formatScale(state.scale)}</span></button>
      <div class="ttp-seyes-toolbar-tooltip is-scale" data-toolbar-scale-popover data-toolbar-popover="scale" hidden><input type="range" data-toolbar-scale min="${SEYES_SCALE_MIN}" max="${SEYES_SCALE_MAX}" step="${SEYES_SCALE_STEP}" value="${state.scale}" aria-label="Échelle"><b data-toolbar-scale-output>${formatScale(state.scale)}</b></div>
    </div>
    <div class="ttp-seyes-toolbar-control">
      <button type="button" class="is-compact is-ruling" data-toolbar-ruling-toggle data-toolbar-popover-toggle="ruling" aria-expanded="false" title="Lignage : ${escapeAttr(SEYES_RULINGS.find((item) => item.id === state.ruling)?.label || "Seyès")}"><span class="ttp-seyes-toolbar-ruling-preview ttp-seyes-ruling-preview is-${state.ruling}" data-toolbar-ruling-preview aria-hidden="true"></span></button>
      <div class="ttp-seyes-toolbar-tooltip is-ruling" data-toolbar-ruling-popover data-toolbar-popover="ruling" hidden><div class="ttp-seyes-ruling-grid">${renderRulingTiles(state)}</div></div>
    </div>
    <button type="button" class="is-compact is-icon-only" data-toolbar-align title="Alignement : ${align.label}" aria-label="Alignement : ${align.label}"><span class="ttp-material-icon">${align.icon}</span></button>
    <span class="ttp-seyes-toolbar-separator" aria-hidden="true"></span>
    <button type="button" class="is-compact is-icon-only" data-toolbar-format="bold" aria-pressed="false" title="Gras" aria-label="Gras"><span class="ttp-material-icon">format_bold</span></button>
    ${renderDecorationControl("underline", state)}
    ${renderDecorationControl("strike", state)}
    ${renderDecorationControl("circle", state)}
    ${renderHighlightControl(state)}
    ${renderTextColorControl(state)}
    <button type="button" class="is-compact is-icon-only" data-toolbar-clear-format title="Supprimer le formatage" aria-label="Supprimer le formatage"><span class="ttp-material-icon">ink_eraser</span></button>
    <button type="button" class="is-compact is-icon-only is-toolbar-visibility" data-toolbar-visibility aria-expanded="true" title="Masquer la barre d’outils" aria-label="Masquer la barre d’outils"><span class="ttp-material-icon">keyboard_arrow_up</span></button>
  </div>`;
}

function setToolbarPopover(root, name, open){
  root.querySelectorAll("[data-toolbar-popover]").forEach((popover) => {
    const isOpen = popover.dataset.toolbarPopover === name && open === true;
    popover.hidden = !isOpen;
  });
  root.querySelectorAll("[data-toolbar-popover-toggle]").forEach((toggle) => {
    const isOpen = toggle.dataset.toolbarPopoverToggle === name && open === true;
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
}

function updateToolbarState(root, state){
  const font = root.querySelector("[data-toolbar-font]");
  if (font && font.value !== state.fontId) font.value = state.fontId;
  const scale = root.querySelector("[data-toolbar-scale]");
  if (scale) scale.value = String(state.scale);
  root.querySelectorAll("[data-toolbar-scale-value],[data-toolbar-scale-output]").forEach((node) => { node.textContent = formatScale(state.scale); });
  const activeRuling = SEYES_RULINGS.find((item) => item.id === state.ruling) || SEYES_RULINGS[0];
  const rulingToggle = root.querySelector("[data-toolbar-ruling-toggle]");
  rulingToggle?.setAttribute("title", `Lignage : ${activeRuling.label}`);
  const preview = root.querySelector("[data-toolbar-ruling-preview]");
  if (preview) preview.className = `ttp-seyes-toolbar-ruling-preview ttp-seyes-ruling-preview is-${state.ruling}`;
  root.querySelectorAll("[data-toolbar-ruling]").forEach((button) => {
    const selected = button.dataset.toolbarRuling === state.ruling;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  updateToolbarAlignmentState(root, root.querySelector("[data-seyes-editor]"), state.alignment);
  root.querySelectorAll("[data-toolbar-text-color]").forEach((button) => {
    button.classList.toggle("is-selected", String(button.dataset.toolbarTextColor).toLowerCase() === String(state.textColor).toLowerCase());
  });
  root.querySelector('[data-toolbar-format="text-color"]')?.style.setProperty("--seyes-text-color", state.textColor);
  root.querySelectorAll("[data-toolbar-highlight-color]").forEach((button) => {
    button.classList.toggle("is-selected", String(button.dataset.toolbarHighlightColor).toLowerCase() === String(state.highlightColor).toLowerCase());
  });
  Object.entries(DECORATION_FORMATS).forEach(([kind, format]) => {
    const thickness = state[format.thicknessKey];
    const input = root.querySelector(`[data-toolbar-decoration-thickness="${kind}"]`);
    const output = root.querySelector(`[data-toolbar-decoration-thickness-output="${kind}"]`);
    if (input) input.value = String(thickness);
    if (output) output.textContent = String(thickness);
    root.querySelectorAll(`[data-toolbar-decoration-kind="${kind}"]`).forEach((button) => {
      button.classList.toggle("is-selected", String(button.dataset.toolbarDecorationColor).toLowerCase() === String(state[format.colorKey]).toLowerCase());
    });
  });
  updateToolbarFormatState(root, root.querySelector("[data-seyes-editor]"));
}

function bindDocumentToolbar({ root, editor, sendAction, showToast } = {}){
  const toolbar = root?.querySelector("[data-seyes-toolbar]");
  if (!toolbar || toolbar.dataset.bound === "true") return;
  toolbar.dataset.bound = "true";
  const setLocalSetting = (patch) => {
    root.__seyesState = normalizeSeyesState({ ...root.__seyesState, ...patch });
    updateToolbarState(root, root.__seyesState);
  };
  toolbar.querySelectorAll("button,label,input,select").forEach((control) => control.addEventListener("pointerdown", (event) => {
    saveSelection(editor);
    if (control.tagName === "BUTTON") event.preventDefault();
  }, { passive:false }));
  toolbar.querySelector("[data-toolbar-reset]")?.addEventListener("click", () => {
    const contentTimer = pendingTimers.get(editor);
    if (contentTimer) clearTimeout(contentTimer);
    pendingTimers.delete(editor);
    savedSelections.delete(editor);
    editor.innerHTML = "";
    editor.dataset.lastSentHtml = "";
    root.__seyesState = normalizeSeyesState({ ...root.__seyesState, contentHtml:"" });
    updateToolbarFormatState(root, editor);
    sendAction?.("reset-document");
  });
  toolbar.querySelector("[data-toolbar-open]")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try { sendAction?.("load-document", { state:await readSeyesDocumentFile(file) }); }
    catch (error) { showToast?.(error?.message || "Ouverture impossible.", { isError:true }); }
    event.currentTarget.value = "";
  });
  toolbar.querySelector("[data-toolbar-paste]")?.addEventListener("click", () => openPasteDialog(sendAction));
  toolbar.querySelector("[data-toolbar-font]")?.addEventListener("change", (event) => sendAction?.("set-settings", { fontId:event.currentTarget.value }));
  toolbar.querySelector("[data-toolbar-scale-toggle]")?.addEventListener("click", (event) => {
    setToolbarPopover(root, "scale", event.currentTarget.getAttribute("aria-expanded") !== "true");
  });
  const scale = toolbar.querySelector("[data-toolbar-scale]");
  scale?.addEventListener("input", () => applyState(root, normalizeSeyesState({ ...root.__seyesState, scale:Number(scale.value) })));
  scale?.addEventListener("change", () => sendAction?.("set-settings", { scale:Number(scale.value) }));
  toolbar.querySelector("[data-toolbar-ruling-toggle]")?.addEventListener("click", (event) => {
    setToolbarPopover(root, "ruling", event.currentTarget.getAttribute("aria-expanded") !== "true");
  });
  toolbar.querySelectorAll("[data-toolbar-ruling]").forEach((button) => button.addEventListener("click", () => {
    setToolbarPopover(root, "ruling", false);
    sendAction?.("set-settings", { ruling:button.dataset.toolbarRuling });
  }));
  toolbar.querySelector("[data-toolbar-align]")?.addEventListener("click", () => {
    setToolbarPopover(root, "", false);
    restoreSelection(editor) || editor.focus({ preventScroll:true });
    const next = alignmentMeta(currentParagraphAlignment(editor, root.__seyesState.alignment)).next;
    const command = next === "center" ? "justifyCenter" : (next === "right" ? "justifyRight" : "justifyLeft");
    try { document.execCommand("styleWithCSS", false, true); } catch {}
    const selection = window.getSelection?.();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const startElement = range?.startContainer?.nodeType === Node.ELEMENT_NODE ? range.startContainer : range?.startContainer?.parentElement;
    if ((startElement?.closest?.("div,p") || editor) === editor) {
      try { document.execCommand("formatBlock", false, "div"); } catch {}
    }
    execCommand(editor, command);
    updateToolbarAlignmentState(root, editor, next);
  });
  toolbar.querySelectorAll("[data-toolbar-format]").forEach((button) => button.addEventListener("click", () => {
    setToolbarPopover(root, "", false);
    applyDecoration(editor, root.__seyesState, button.dataset.toolbarFormat);
    updateToolbarFormatState(root, editor);
  }));
  toolbar.querySelectorAll("[data-toolbar-format-options-toggle]").forEach((button) => button.addEventListener("click", () => {
    const name = `format-${button.dataset.toolbarFormatOptionsToggle}`;
    setToolbarPopover(root, name, button.getAttribute("aria-expanded") !== "true");
  }));
  toolbar.querySelector("[data-toolbar-highlight-options-toggle]")?.addEventListener("click", (event) => {
    setToolbarPopover(root, "highlight-options", event.currentTarget.getAttribute("aria-expanded") !== "true");
  });
  toolbar.querySelector("[data-toolbar-text-color-options-toggle]")?.addEventListener("click", (event) => {
    setToolbarPopover(root, "colors", event.currentTarget.getAttribute("aria-expanded") !== "true");
  });
  toolbar.querySelectorAll("[data-toolbar-text-color]").forEach((button) => button.addEventListener("click", () => {
    const color = button.dataset.toolbarTextColor;
    setLocalSetting({ textColor:color });
    sendAction?.("set-settings", { textColor:color });
    setToolbarPopover(root, "", false);
  }));
  toolbar.querySelectorAll("[data-toolbar-highlight-color]").forEach((button) => button.addEventListener("click", () => {
    const patch = { highlightColor:button.dataset.toolbarHighlightColor };
    setLocalSetting(patch);
    sendAction?.("set-settings", patch);
  }));
  toolbar.querySelectorAll("[data-toolbar-decoration-color]").forEach((button) => button.addEventListener("click", () => {
    const format = DECORATION_FORMATS[button.dataset.toolbarDecorationKind];
    if (!format) return;
    const patch = { [format.colorKey]:button.dataset.toolbarDecorationColor };
    setLocalSetting(patch);
    sendAction?.("set-settings", patch);
  }));
  toolbar.querySelectorAll("[data-toolbar-decoration-thickness]").forEach((input) => {
    const format = DECORATION_FORMATS[input.dataset.toolbarDecorationThickness];
    if (!format) return;
    input.addEventListener("input", () => setLocalSetting({ [format.thicknessKey]:Number(input.value) }));
    input.addEventListener("change", () => sendAction?.("set-settings", { [format.thicknessKey]:Number(input.value) }));
  });
  toolbar.querySelector("[data-toolbar-clear-format]")?.addEventListener("click", () => {
    clearSelectionFormatting(editor);
    updateToolbarFormatState(root, editor);
  });
  toolbar.querySelector("[data-toolbar-visibility]")?.addEventListener("click", (event) => {
    setToolbarPopover(root, "", false);
    const collapsed = toolbar.classList.toggle("is-collapsed");
    const button = event.currentTarget;
    const label = collapsed ? "Afficher la barre d’outils" : "Masquer la barre d’outils";
    button.setAttribute("aria-expanded", String(!collapsed));
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    const icon = button.querySelector(".ttp-material-icon");
    if (icon) icon.textContent = collapsed ? "keyboard_arrow_down" : "keyboard_arrow_up";
  });
}

function renderChrome(chromeHost, state){
  if (!chromeHost) return;
  chromeHost.innerHTML = `
    <div class="ttp-seyes-chrome">
      <section class="ttp-seyes-chrome-section">
        <div class="ttp-seyes-export-row">
          <button type="button" data-save-seyes><span class="ttp-material-icon">download</span><span>Enregistrer en fichier .seyes</span></button>
          <button type="button" data-export-pdf><span class="ttp-material-icon">text_snippet</span><span>Exporter en PDF</span></button>
        </div>
        <div class="ttp-seyes-spacing-list">
          <label class="ttp-seyes-spacing-row"><span>Espacement mots</span><input type="range" data-word-spacing min="-0.1" max="1.5" step="0.05" value="${state.wordSpacing}"><b>${Math.round(state.wordSpacing*100)} %</b></label>
          <label class="ttp-seyes-spacing-row"><span>Espacement lettres</span><input type="range" data-letter-spacing min="-0.05" max="0.4" step="0.01" value="${state.letterSpacing}"><b>${Math.round(state.letterSpacing*100)} %</b></label>
        </div>
      </section>
    </div>`;
}

function bindChrome({ root, editor, chromeHost, sendAction, showToast } = {}){
  if (!chromeHost) return;
  chromeHost.querySelectorAll("button,label,select,input").forEach((control) => control.addEventListener("pointerdown", (event) => { saveSelection(editor); if (control.tagName === "BUTTON") event.preventDefault(); }, { passive:false }));
  const letter = chromeHost.querySelector("[data-letter-spacing]");
  letter?.addEventListener("input", () => {
    const b = letter.parentElement?.querySelector("b");
    if (b) b.textContent = `${Math.round(Number(letter.value)*100)} %`;
    root.__seyesState = normalizeSeyesState({ ...root.__seyesState, letterSpacing:Number(letter.value) });
    root.style.setProperty("--seyes-letter-spacing", `${root.__seyesState.letterSpacing}em`);
  });
  letter?.addEventListener("change", () => sendAction?.("set-settings", { letterSpacing:Number(letter.value) }));
  const word = chromeHost.querySelector("[data-word-spacing]");
  word?.addEventListener("input", () => {
    const b = word.parentElement?.querySelector("b");
    if (b) b.textContent = `${Math.round(Number(word.value)*100)} %`;
    root.__seyesState = normalizeSeyesState({ ...root.__seyesState, wordSpacing:Number(word.value) });
    root.style.setProperty("--seyes-word-spacing", `${root.__seyesState.wordSpacing}em`);
  });
  word?.addEventListener("change", () => sendAction?.("set-settings", { wordSpacing:Number(word.value) }));
  chromeHost.querySelector("[data-save-seyes]")?.addEventListener("click", () => { flushEditor(editor, sendAction); downloadSeyesDocument(liveSeyesState(root, editor)); });
  chromeHost.querySelector("[data-export-pdf]")?.addEventListener("click", () => { flushEditor(editor, sendAction); openSeyesPdfExportDialog({ state:liveSeyesState(root, editor), showToast }); });
}

function bindEditor(editor, sendAction){
  if (!editor || editor.dataset.seyesBound === "true") return;
  editor.dataset.seyesBound = "true";
  const refreshFormatState = () => updateToolbarFormatState(editor.closest(".ttp-seyes-app"), editor);
  editor.addEventListener("input", (event) => {
    saveSelection(editor);
    // La frappe peut rester temporisée. Les actions de formatage déclenchées
    // par nos boutons utilisent un Event programmatique : on les synchronise
    // immédiatement afin qu’un Save/Open juste après ne perde aucune propriété.
    if (event.isTrusted) scheduleSync(editor, sendAction);
    else flushEditor(editor, sendAction);
    refreshFormatState();
  });
  ["keyup","pointerup","focus"].forEach((type) => editor.addEventListener(type, () => { saveSelection(editor); refreshFormatState(); }));
  editor.addEventListener("blur", () => flushEditor(editor, sendAction));
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
  root.style.setProperty("--seyes-editor-left", `${SAFE_LEFT_PX + line + 10}px`);
  updateEditorTop(root, { line, fontSize, family });
  root.dataset.ruling = state.ruling;
  updateToolbarState(root, state);
  editor.style.textAlign = state.alignment;
  const safeHtml = sanitizeContentHtml(state.contentHtml);
  const focused = document.activeElement === editor || editor.contains(document.activeElement);
  if (!focused && sanitizeContentHtml(editor.innerHTML) !== safeHtml) editor.innerHTML = safeHtml;
  updatePaper(root, state);
  try {
    document.fonts?.load?.(`400 ${Math.max(12,fontSize)}px "${family}"`).then(() => {
      const current = root.__seyesState;
      if (!root.isConnected || current?.fontId !== state.fontId || current?.ruling !== state.ruling || current?.scale !== state.scale) return;
      updateEditorTop(root, { line, fontSize, family });
      root.classList.add("is-font-ready");
    });
  } catch { root.classList.add("is-font-ready"); }
}

export function renderSeyesProjector({ host, chromeHost, state, sendAction } = {}){
  if (!host) return;
  const safeState = normalizeSeyesState(state);
  let root = host.querySelector(":scope > .ttp-seyes-app");
  if (!root) {
    host.innerHTML = `<div class="ttp-seyes-app" data-ruling="${safeState.ruling}">${renderDocumentToolbar(safeState)}<div class="ttp-seyes-sheet">${renderPaperSvg()}<div class="ttp-seyes-editor" data-seyes-editor contenteditable="true" role="textbox" aria-multiline="true" aria-label="Document Seyès" spellcheck="false"></div></div></div>`;
    root = host.querySelector(":scope > .ttp-seyes-app");
    const editor = root.querySelector("[data-seyes-editor]");
    editor.innerHTML = sanitizeContentHtml(safeState.contentHtml);
    bindEditor(editor, sendAction);
  }
  const editor = root.querySelector("[data-seyes-editor]");
  bindEditor(editor, sendAction);
  applyState(root, safeState);
  bindPaperExtent(root);
  const showToast = (message, options={}) => {
    const event = new CustomEvent("ttp-toast", { detail:{ message, ...options } });
    window.dispatchEvent(event);
  };
  bindDocumentToolbar({ root, editor, sendAction, showToast });
  if (chromeHost) {
    renderChrome(chromeHost, safeState);
    bindChrome({ root, editor, chromeHost, sendAction, showToast });
  }
}
