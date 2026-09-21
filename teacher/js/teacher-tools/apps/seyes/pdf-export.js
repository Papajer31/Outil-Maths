import { getSeyesFont, normalizeSeyesState } from "./model.js";

const DPI = 180;
const MM_TO_PX = DPI / 25.4;
const MM_TO_PT = 72 / 25.4;
const PAGE_FORMATS = Object.freeze({
  a4: { label: "A4 (210 × 297 mm)", width: 210, height: 297 },
  a5: { label: "A5 (148 × 210 mm)", width: 148, height: 210 }
});

const PALETTE = Object.freeze([
  "#427ebe", "#c00000", "#70ad47", "#ed7d31", "#ffc000", "#7030a0", "#ff66cc", "#000000"
]);

function clamp(value, min, max){
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}
function escapeHtml(value){
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function cleanFileName(value){
  const safe = String(value || "document-seyes").trim().replace(/[\\/:*?"<>|]+/g, "-") || "document-seyes";
  return safe.toLowerCase().endsWith(".pdf") ? safe : `${safe}.pdf`;
}
function cssColor(value, fallback = "#427ebe"){
  const safe = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(safe) || /^rgba?\(/i.test(safe) ? safe : fallback;
}
function px(mm){ return mm * MM_TO_PX; }

function inheritedStyle(node, parent = {}){
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return { ...parent };
  const style = node.style || {};
  const decoration = String(style.textDecorationLine || style.textDecoration || parent.decoration || "");
  const customColor = cssColor(style.getPropertyValue?.("--seyes-decoration-color"), "");
  const customThickness = Math.max(1, Number.parseFloat(style.getPropertyValue?.("--seyes-decoration-thickness")) || 0);
  const isCustomUnderline = node.dataset?.seyesUnderline === "true";
  const isCustomStrike = node.dataset?.seyesStrike === "true";
  const isCustomCircle = node.dataset?.seyesCircle === "true";
  const requestedAlignment = String(style.textAlign || parent.alignment || "left").toLowerCase();
  const alignment = ["left", "center", "right"].includes(requestedAlignment) ? requestedAlignment : "left";
  return {
    color: cssColor(style.color, parent.color || "#427ebe"),
    background: style.backgroundColor ? cssColor(style.backgroundColor, "") : (parent.background || ""),
    bold: node.dataset?.seyesBold === "true" || /^(bold|[6-9]00)$/.test(String(style.fontWeight || "")) || parent.bold === true,
    underline: isCustomUnderline || decoration.includes("underline") || parent.underline === true,
    underlineColor: isCustomUnderline ? customColor : cssColor(style.textDecorationColor, parent.underlineColor || style.color || parent.color || "#427ebe"),
    underlineThickness: isCustomUnderline ? customThickness : Math.max(1, Number.parseFloat(style.textDecorationThickness) || Number(parent.underlineThickness) || 2),
    strike: isCustomStrike || decoration.includes("line-through") || parent.strike === true,
    strikeColor: isCustomStrike ? customColor : cssColor(style.textDecorationColor, parent.strikeColor || style.color || parent.color || "#427ebe"),
    strikeThickness: isCustomStrike ? customThickness : Math.max(1, Number.parseFloat(style.textDecorationThickness) || Number(parent.strikeThickness) || 2),
    circled: isCustomCircle || parent.circled === true,
    circleColor: isCustomCircle ? customColor : cssColor(style.borderColor, parent.circleColor || parent.color || "#427ebe"),
    circleThickness: isCustomCircle ? customThickness : Math.max(1, Number.parseFloat(style.borderWidth) || Number(parent.circleThickness) || 2),
    alignment
  };
}

function htmlToParagraphs(html, defaultColor, defaultAlignment = "left"){
  const host = document.createElement("div");
  host.innerHTML = String(html || "");
  const normalizeAlignment = (value) => ["left", "center", "right"].includes(String(value || "").toLowerCase()) ? String(value).toLowerCase() : "left";
  const makeParagraph = (alignment) => Object.assign([], { alignment:normalizeAlignment(alignment) });
  const paragraphs = [makeParagraph(defaultAlignment)];
  const pushNewParagraph = (alignment = defaultAlignment) => {
    if (paragraphs[paragraphs.length - 1]?.length || paragraphs.length === 1) paragraphs.push(makeParagraph(alignment));
    else paragraphs[paragraphs.length - 1].alignment = normalizeAlignment(alignment);
  };
  const walk = (node, style) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = String(node.nodeValue || "").replace(/\u00a0/g, " ");
      if (text) paragraphs[paragraphs.length - 1].push({ text, style });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName.toUpperCase();
    if (tag === "BR") { pushNewParagraph(style.alignment); return; }
    const nextStyle = inheritedStyle(node, style);
    const block = tag === "DIV" || tag === "P";
    if (block && paragraphs[paragraphs.length - 1].length) pushNewParagraph(nextStyle.alignment);
    if (block) paragraphs[paragraphs.length - 1].alignment = nextStyle.alignment;
    Array.from(node.childNodes).forEach((child) => walk(child, nextStyle));
    if (block) pushNewParagraph(style.alignment);
  };
  const base = { color: defaultColor, background: "", bold:false, underline:false, underlineColor:defaultColor, underlineThickness:2, strike:false, strikeColor:defaultColor, strikeThickness:2, circled:false, circleColor:defaultColor, circleThickness:2, alignment:normalizeAlignment(defaultAlignment) };
  Array.from(host.childNodes).forEach((node) => walk(node, base));
  while (paragraphs.length > 1 && !paragraphs[paragraphs.length - 1].length) paragraphs.pop();
  return paragraphs.length ? paragraphs : [[]];
}

function fontCss(state, fontSize, style = {}){
  const font = getSeyesFont(state.fontId);
  return `${style.bold ? "700" : "400"} ${fontSize}px "${font.family}", sans-serif`;
}

function measureStyledText(ctx, text, state, fontSize, style = {}){
  ctx.font = fontCss(state, fontSize, style);
  const letter = fontSize * state.letterSpacing;
  const word = fontSize * state.wordSpacing;
  let width = 0;
  const chars = Array.from(String(text || ""));
  chars.forEach((char, index) => {
    width += ctx.measureText(char).width;
    if (index < chars.length - 1) width += letter;
    if (char === " ") width += word;
  });
  return width;
}

function splitRunTokens(run){
  const parts = String(run.text || "").split(/(\s+)/).filter((part) => part !== "");
  return parts.map((text) => ({ text, style: run.style }));
}

function wrapParagraph(ctx, runs, state, fontSize, maxWidth){
  const alignment = ["left", "center", "right"].includes(runs.alignment) ? runs.alignment : state.alignment;
  const alignedLine = (items = []) => Object.assign(items, { alignment });
  const tokens = runs.flatMap(splitRunTokens);
  if (!tokens.length) return [alignedLine()];
  const lines = [];
  let current = [];
  let width = 0;
  for (const token of tokens) {
    const tokenWidth = measureStyledText(ctx, token.text, state, fontSize, token.style);
    const isWhitespace = /^\s+$/.test(token.text);
    if (!isWhitespace && current.length && width + tokenWidth > maxWidth) {
      while (current.length && /^\s+$/.test(current[current.length - 1].text)) current.pop();
      lines.push(alignedLine(current));
      current = [];
      width = 0;
    }
    if (!current.length && isWhitespace) continue;
    current.push({ ...token, width: tokenWidth });
    width += tokenWidth;
  }
  if (current.length) lines.push(alignedLine(current));
  return lines.length ? lines : [alignedLine()];
}

function drawRuling(ctx, state, options, width, height){
  const outer = px(options.marginMm);
  const minor = px(options.interlineMm);
  const major = minor * 4;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(outer, outer);
  const w = width - outer * 2;
  const h = height - outer * 2;
  const blue = "rgba(143,187,246,.78)";
  const blueStrong = "rgba(96,158,238,.95)";
  const red = "rgba(239,102,111,.92)";

  if (state.ruling === "earth") {
    for (let y = 0; y < h + major * 2; y += major * 2) {
      ctx.fillStyle = "rgba(128,205,255,.42)"; ctx.fillRect(0, y + minor, w, minor * 2);
      ctx.fillStyle = "rgba(40,238,84,.78)"; ctx.fillRect(0, y + minor * 3, w, minor);
      ctx.fillStyle = "rgba(240,185,113,.48)"; ctx.fillRect(0, y + major, w, minor * 2);
    }
  }

  if (state.ruling === "single") {
    ctx.strokeStyle = blueStrong; ctx.lineWidth = 1;
    for (let y = major; y < h; y += major) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  } else {
    for (let step = 1; step * minor < h; step += 1) {
      const phase = step % 4;
      if (state.ruling === "double" && phase === 2) continue;
      const y = step * minor;
      const isMajor = phase === 0;
      ctx.strokeStyle = isMajor ? blueStrong : blue;
      ctx.lineWidth = isMajor ? 1 : .55;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  }

  if (state.ruling === "seyes" || state.ruling === "earth") {
    ctx.strokeStyle = blue; ctx.lineWidth = .55;
    for (let x = 0; x < w; x += major) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  }
  ctx.strokeStyle = red; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(px(16), 0); ctx.lineTo(px(16), h); ctx.stroke();
  ctx.restore();
}

function roundedRect(ctx, x, y, w, h, r){
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawTextRun(ctx, run, x, baseline, state, fontSize, lineHeight){
  const style = run.style || {};
  const text = String(run.text || "");
  ctx.font = fontCss(state, fontSize, style);
  const width = run.width ?? measureStyledText(ctx, text, state, fontSize, style);
  const top = baseline - fontSize * .83;
  const height = fontSize * 1.05;
  if (style.background) {
    ctx.fillStyle = style.background;
    ctx.fillRect(x - 1, top, width + 2, height);
  }
  if (style.circled) {
    ctx.save();
    ctx.strokeStyle = style.circleColor || style.color || state.formatColor;
    ctx.lineWidth = Math.max(1, style.circleThickness || 2) * (DPI / 96);
    roundedRect(ctx, x - 3, top - 2, width + 6, height + 4, height / 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = style.color || state.formatColor;
  const letter = fontSize * state.letterSpacing;
  const word = fontSize * state.wordSpacing;
  let cursor = x;
  const chars = Array.from(text);
  chars.forEach((char, index) => {
    ctx.fillText(char, cursor, baseline);
    cursor += ctx.measureText(char).width;
    if (index < chars.length - 1) cursor += letter;
    if (char === " ") cursor += word;
  });
  if (style.underline) {
    ctx.strokeStyle = style.underlineColor || style.color || state.underlineColor;
    ctx.lineWidth = Math.max(1, Number(style.underlineThickness) || 2) * (DPI / 96);
    ctx.beginPath(); ctx.moveTo(x, baseline + lineHeight * .25); ctx.lineTo(x + width, baseline + lineHeight * .25); ctx.stroke();
  }
  if (style.strike) {
    ctx.strokeStyle = style.strikeColor || style.color || state.strikeColor;
    ctx.lineWidth = Math.max(1, Number(style.strikeThickness) || 2) * (DPI / 96);
    ctx.beginPath(); ctx.moveTo(x, baseline - fontSize * .30 + fontSize * (4 / 38)); ctx.lineTo(x + width, baseline - fontSize * .30 + fontSize * (4 / 38)); ctx.stroke();
  }
  return width;
}

async function renderPdfPages(rawState, options){
  const state = normalizeSeyesState(rawState);
  const format = PAGE_FORMATS[options.paper] || PAGE_FORMATS.a4;
  const portrait = options.orientation !== "landscape";
  const widthMm = portrait ? format.width : format.height;
  const heightMm = portrait ? format.height : format.width;
  const width = Math.round(px(widthMm));
  const height = Math.round(px(heightMm));
  const outer = px(options.marginMm);
  const major = px(options.interlineMm * 4);
  const fontSize = major * (state.fontId.startsWith("belle") ? .58 : .50);
  const leftExtra = px(20);
  const maxWidth = width - outer * 2 - leftExtra - px(4);
  const usableHeight = height - outer * 2 - major * .7;
  const maxLines = Math.max(1, Math.floor(usableHeight / major));

  try { await document.fonts?.load?.(`400 ${Math.max(12, fontSize)}px "${getSeyesFont(state.fontId).family}"`); } catch {}

  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d");
  mctx.font = fontCss(state, fontSize);
  const paragraphs = htmlToParagraphs(state.contentHtml, state.formatColor, state.alignment);
  const lines = [];
  paragraphs.forEach((paragraph, index) => {
    const wrapped = wrapParagraph(mctx, paragraph, state, fontSize, maxWidth);
    lines.push(...wrapped);
    if (index < paragraphs.length - 1 && wrapped.length === 0) lines.push([]);
  });
  if (!lines.length) lines.push([]);

  const pageCount = Math.max(1, Math.ceil(lines.length / maxLines));
  const pages = [];
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    drawRuling(ctx, state, options, width, height);
    ctx.font = fontCss(state, fontSize);
    ctx.textBaseline = "alphabetic";
    const pageLines = lines.slice(pageIndex * maxLines, (pageIndex + 1) * maxLines);
    pageLines.forEach((line, lineIndex) => {
      const total = line.reduce((sum, run) => sum + (run.width ?? measureStyledText(ctx, run.text, state, fontSize, run.style)), 0);
      let x = outer + leftExtra;
      const alignment = ["left", "center", "right"].includes(line.alignment) ? line.alignment : state.alignment;
      if (alignment === "center") x = outer + leftExtra + Math.max(0, (maxWidth - total) / 2);
      if (alignment === "right") x = outer + leftExtra + Math.max(0, maxWidth - total);
      const baseline = outer + major * (lineIndex + .78);
      line.forEach((run) => { x += drawTextRun(ctx, run, x, baseline, state, fontSize, major); });
    });
    const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Rendu PDF impossible.")), "image/jpeg", .97));
    pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), width, height, widthMm, heightMm });
  }
  return pages;
}

function ascii(value){ return new TextEncoder().encode(String(value)); }
function concatBytes(chunks){
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(size); let offset = 0;
  chunks.forEach((chunk) => { out.set(chunk, offset); offset += chunk.length; });
  return out;
}
function pdfObject(id, bodyParts){
  const body = Array.isArray(bodyParts) ? bodyParts : [ascii(bodyParts)];
  return concatBytes([ascii(`${id} 0 obj\n`), ...body, ascii(`\nendobj\n`)]);
}

function buildImagePdf(pages){
  const objectCount = 2 + pages.length * 3;
  const pageObjectIds = pages.map((_, index) => 5 + index * 3);
  const objects = new Array(objectCount + 1);
  objects[1] = pdfObject(1, `<< /Type /Catalog /Pages 2 0 R >>`);
  objects[2] = pdfObject(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>`);
  pages.forEach((page, index) => {
    const imageId = 3 + index * 3;
    const contentId = 4 + index * 3;
    const pageId = 5 + index * 3;
    const widthPt = page.widthMm * MM_TO_PT;
    const heightPt = page.heightMm * MM_TO_PT;
    objects[imageId] = pdfObject(imageId, [
      ascii(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`),
      page.jpeg,
      ascii(`\nendstream`)
    ]);
    const commands = `q\n${widthPt.toFixed(3)} 0 0 ${heightPt.toFixed(3)} 0 0 cm\n/Im${index + 1} Do\nQ`;
    const commandBytes = ascii(commands);
    objects[contentId] = pdfObject(contentId, [ascii(`<< /Length ${commandBytes.length} >>\nstream\n`), commandBytes, ascii(`\nendstream`)]);
    objects[pageId] = pdfObject(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt.toFixed(3)} ${heightPt.toFixed(3)}] /Resources << /XObject << /Im${index + 1} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
  });

  const header = ascii("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const chunks = [header];
  const offsets = new Array(objectCount + 1).fill(0);
  let offset = header.length;
  for (let id = 1; id <= objectCount; id += 1) {
    offsets[id] = offset;
    chunks.push(objects[id]);
    offset += objects[id].length;
  }
  const xrefOffset = offset;
  let xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= objectCount; id += 1) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(ascii(xref));
  return new Blob(chunks, { type: "application/pdf" });
}

export async function exportSeyesPdf(rawState, options){
  const pages = await renderPdfPages(rawState, options);
  const blob = buildImagePdf(pages);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = cleanFileName(options.filename);
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function renderPreviewStyle(state, options){
  const minor = Math.max(3, Number(options.interlineMm) * 2.4);
  const major = minor * 4;
  const margin = "linear-gradient(to right,transparent 0,transparent 16%,rgba(239,102,111,.92) 16%,rgba(239,102,111,.92) 16.4%,transparent 16.4%)";
  if (state.ruling === "single") return `${margin},repeating-linear-gradient(to bottom,#fff 0,#fff ${major - 1}px,#78aefa ${major}px)`;
  if (state.ruling === "double") return `${margin},repeating-linear-gradient(to bottom,transparent 0,transparent ${minor - 1}px,#b7d2fa ${minor}px,transparent ${minor}px,transparent ${minor * 3 - 1}px,#b7d2fa ${minor * 3}px,transparent ${minor * 3}px,transparent ${major - 1}px,#78aefa ${major}px)`;
  if (state.ruling === "earth") return `linear-gradient(to right,transparent 0,transparent 16%,rgba(239,102,111,.92) 16%,rgba(239,102,111,.92) 16.4%,transparent 16.4%),repeating-linear-gradient(to right,transparent 0,transparent ${major - 1}px,rgba(96,158,238,.7) ${major}px),repeating-linear-gradient(to bottom,transparent 0,transparent ${minor - 1}px,#b7d2fa ${minor}px),repeating-linear-gradient(to bottom,transparent 0,transparent ${minor}px,rgba(128,205,255,.42) ${minor}px,rgba(128,205,255,.42) ${minor * 3}px,rgba(40,238,84,.78) ${minor * 3}px,rgba(40,238,84,.78) ${major}px,rgba(240,185,113,.48) ${major}px,rgba(240,185,113,.48) ${major + minor * 2}px,transparent ${major + minor * 2}px,transparent ${major * 2}px)`;
  if (state.ruling === "large") return `${margin},repeating-linear-gradient(to bottom,transparent 0,transparent ${minor - 1}px,#b7d2fa ${minor}px)`;
  return `${margin},repeating-linear-gradient(to bottom,#fff 0,#fff ${minor - 1}px,#b7d2fa ${minor}px)`;
}

export function openSeyesPdfExportDialog({ state: rawState, showToast } = {}){
  const state = normalizeSeyesState(rawState);
  const dialog = document.createElement("dialog");
  dialog.className = "tt-seyes-dialog tt-seyes-pdf-dialog";
  const defaultName = `seyes-${new Date().toISOString().slice(0,10)}`;
  dialog.innerHTML = `
    <form method="dialog" class="tt-seyes-dialog-card">
      <div class="tt-seyes-dialog-head"><strong>Exporter en PDF</strong><button type="button" class="tt-seyes-dialog-close" data-close aria-label="Fermer">×</button></div>
      <div class="tt-seyes-pdf-layout">
        <div class="tt-seyes-pdf-preview"><div data-preview-paper><span>${escapeHtml(state.title)}</span></div></div>
        <div class="tt-seyes-pdf-fields">
          <label>Hauteur de l’interligne<select name="interline"><option value="2">2 mm — Seyès standard</option><option value="2.5">2,5 mm</option><option value="3">3 mm</option></select></label>
          <label>Format du papier<select name="paper">${Object.entries(PAGE_FORMATS).map(([id,item]) => `<option value="${id}">${escapeHtml(item.label)}</option>`).join("")}</select></label>
          <label>Orientation<select name="orientation"><option value="portrait">Portrait</option><option value="landscape">Paysage</option></select></label>
          <label>Marges<select name="margin"><option value="10">10 mm</option><option value="15">15 mm</option><option value="20" selected>20 mm</option><option value="25">25 mm</option></select></label>
          <label>Nom du fichier<input name="filename" value="${escapeHtml(defaultName)}" autocomplete="off"></label>
        </div>
      </div>
      <div class="tt-seyes-dialog-actions"><button type="button" data-close>Annuler</button><button type="button" class="is-primary" data-export>Exporter PDF</button></div>
    </form>`;
  document.body.appendChild(dialog);
  const form = dialog.querySelector("form");
  const preview = dialog.querySelector("[data-preview-paper]");
  const readOptions = () => ({
    interlineMm: clamp(Number(form.elements.interline.value) || 2, 1.5, 4),
    paper: form.elements.paper.value,
    orientation: form.elements.orientation.value,
    marginMm: clamp(Number(form.elements.margin.value) || 20, 5, 35),
    filename: form.elements.filename.value || defaultName
  });
  const updatePreview = () => {
    const options = readOptions();
    const format = PAGE_FORMATS[options.paper] || PAGE_FORMATS.a4;
    const landscape = options.orientation === "landscape";
    preview.style.aspectRatio = `${landscape ? format.height : format.width} / ${landscape ? format.width : format.height}`;
    preview.style.backgroundImage = renderPreviewStyle(state, options);
  };
  form.addEventListener("change", updatePreview);
  dialog.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  dialog.querySelector("[data-export]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true; button.textContent = "Export…";
    try { await exportSeyesPdf(state, readOptions()); dialog.close(); showToast?.("PDF exporté."); }
    catch (error) { showToast?.(error?.message || "Export PDF impossible.", { isError: true }); button.disabled = false; button.textContent = "Exporter PDF"; }
  });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  updatePreview();
  if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
}

export { PALETTE as SEYES_FORMAT_PALETTE };
