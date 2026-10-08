import {
  getWorksheetLayout,
  computeWordSearchLayout,
  paginateWorksheetItems,
  PENTOMINO_SHAPES,
  PENTOMINO_NAMES
} from "./worksheet-generator-core.js";

const MM_TO_PT = 72 / 25.4;
const BLACK = [0.07, 0.07, 0.07];
const MID_GRAY = [0.52, 0.52, 0.52];
const CUT_GRAY = [0.66, 0.66, 0.66];
const GREEN = [0.09, 0.47, 0.25];
const GREEN_FILL = [0.91, 0.96, 0.93];
const PENTOMINO_CORRECTION_COLORS = Object.freeze([
  [0.874, 0.898, 0.945], [0.949, 0.875, 0.835], [0.863, 0.918, 0.851], [0.945, 0.902, 0.722],
  [0.894, 0.859, 0.949], [0.843, 0.925, 0.922], [0.953, 0.843, 0.871], [0.906, 0.906, 0.906]
]);

const FONT_URLS = Object.freeze({
  regular:new URL("../../../shared/ui-assets/fonts/AndikaTT-Regular.ttf", import.meta.url),
  semibold:new URL("../../../shared/ui-assets/fonts/AndikaTT-SemiBold.ttf", import.meta.url)
});

let fontBytesPromise = null;

function mm(value){
  return Number(value) * MM_TO_PT;
}

function num(value){
  const rounded = Math.abs(Number(value)) < 0.000001 ? 0 : Number(value);
  return Number(rounded.toFixed(3)).toString();
}

function ascii(value){
  return new TextEncoder().encode(String(value));
}

function concatBytes(parts){
  const normalized = parts.map((part) => typeof part === "string" ? ascii(part) : part);
  const total = normalized.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of normalized) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

class PdfObjectStore {
  constructor(){
    this.objects = [];
  }

  reserve(){
    this.objects.push(null);
    return this.objects.length;
  }

  set(id, body){
    this.objects[id - 1] = Array.isArray(body) ? concatBytes(body) : (typeof body === "string" ? ascii(body) : body);
  }

  add(body){
    const id = this.reserve();
    this.set(id, body);
    return id;
  }

  addStream(dictEntries, bytes){
    const body = concatBytes([
      `<< ${dictEntries} /Length ${bytes.length} >>\nstream\n`,
      bytes,
      "\nendstream"
    ]);
    return this.add(body);
  }

  build(rootId, infoId = null){
    const header = concatBytes([
      ascii("%PDF-1.7\n%"),
      new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3]),
      ascii("\n")
    ]);
    const chunks = [header];
    const offsets = [0];
    let cursor = header.length;

    this.objects.forEach((body, index) => {
      if (!body) throw new Error(`Objet PDF ${index + 1} non défini.`);
      offsets[index + 1] = cursor;
      const chunk = concatBytes([`${index + 1} 0 obj\n`, body, "\nendobj\n"]);
      chunks.push(chunk);
      cursor += chunk.length;
    });

    const xrefOffset = cursor;
    let xref = `xref\n0 ${this.objects.length + 1}\n`;
    xref += "0000000000 65535 f \n";
    for (let id = 1; id <= this.objects.length; id += 1) {
      xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    }
    xref += `trailer\n<< /Size ${this.objects.length + 1} /Root ${rootId} 0 R${infoId ? ` /Info ${infoId} 0 R` : ""} >>\n`;
    xref += `startxref\n${xrefOffset}\n%%EOF\n`;
    chunks.push(ascii(xref));
    return concatBytes(chunks);
  }
}

function readTag(view, offset){
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

function parseTrueType(bytes){
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = new Map();
  const tableCount = view.getUint16(4, false);
  for (let index = 0; index < tableCount; index += 1) {
    const entry = 12 + (index * 16);
    tables.set(readTag(view, entry), {
      offset:view.getUint32(entry + 8, false),
      length:view.getUint32(entry + 12, false)
    });
  }

  const table = (tag) => {
    const found = tables.get(tag);
    if (!found) throw new Error(`Police TrueType invalide : table ${tag} absente.`);
    return found;
  };

  const head = table("head");
  const hhea = table("hhea");
  const maxp = table("maxp");
  const hmtx = table("hmtx");
  const cmap = table("cmap");

  const unitsPerEm = view.getUint16(head.offset + 18, false);
  const bbox = [
    view.getInt16(head.offset + 36, false),
    view.getInt16(head.offset + 38, false),
    view.getInt16(head.offset + 40, false),
    view.getInt16(head.offset + 42, false)
  ];
  const ascent = view.getInt16(hhea.offset + 4, false);
  const descent = view.getInt16(hhea.offset + 6, false);
  const numberOfHMetrics = view.getUint16(hhea.offset + 34, false);
  const numGlyphs = view.getUint16(maxp.offset + 4, false);

  const advanceWidths = new Uint16Array(numGlyphs);
  let lastAdvance = 0;
  for (let gid = 0; gid < numGlyphs; gid += 1) {
    if (gid < numberOfHMetrics) {
      lastAdvance = view.getUint16(hmtx.offset + (gid * 4), false);
    }
    advanceWidths[gid] = lastAdvance;
  }

  const cmapCount = view.getUint16(cmap.offset + 2, false);
  let selected = null;
  for (let index = 0; index < cmapCount; index += 1) {
    const record = cmap.offset + 4 + (index * 8);
    const platform = view.getUint16(record, false);
    const encoding = view.getUint16(record + 2, false);
    const subtableOffset = cmap.offset + view.getUint32(record + 4, false);
    const format = view.getUint16(subtableOffset, false);
    const rank = format === 12 ? 3 : format === 4 ? 2 : 0;
    const platformRank = platform === 3 && encoding === 10 ? 3 : platform === 3 ? 2 : platform === 0 ? 1 : 0;
    const score = (rank * 10) + platformRank;
    if (rank && (!selected || score > selected.score)) selected = { offset:subtableOffset, format, score };
  }
  if (!selected) throw new Error("Police TrueType invalide : cmap Unicode absent.");

  let mapCodePoint;
  if (selected.format === 12) {
    const groupCount = view.getUint32(selected.offset + 12, false);
    const groups = [];
    for (let index = 0; index < groupCount; index += 1) {
      const base = selected.offset + 16 + (index * 12);
      groups.push({
        start:view.getUint32(base, false),
        end:view.getUint32(base + 4, false),
        gid:view.getUint32(base + 8, false)
      });
    }
    mapCodePoint = (codePoint) => {
      let low = 0;
      let high = groups.length - 1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        const group = groups[mid];
        if (codePoint < group.start) high = mid - 1;
        else if (codePoint > group.end) low = mid + 1;
        else return group.gid + (codePoint - group.start);
      }
      return 0;
    };
  } else {
    const segCount = view.getUint16(selected.offset + 6, false) / 2;
    const endCodeOffset = selected.offset + 14;
    const startCodeOffset = endCodeOffset + (segCount * 2) + 2;
    const idDeltaOffset = startCodeOffset + (segCount * 2);
    const idRangeOffsetOffset = idDeltaOffset + (segCount * 2);
    mapCodePoint = (codePoint) => {
      if (codePoint > 0xffff) return 0;
      for (let index = 0; index < segCount; index += 1) {
        const end = view.getUint16(endCodeOffset + (index * 2), false);
        if (codePoint > end) continue;
        const start = view.getUint16(startCodeOffset + (index * 2), false);
        if (codePoint < start) return 0;
        const delta = view.getInt16(idDeltaOffset + (index * 2), false);
        const rangeOffsetAddress = idRangeOffsetOffset + (index * 2);
        const rangeOffset = view.getUint16(rangeOffsetAddress, false);
        if (rangeOffset === 0) return (codePoint + delta) & 0xffff;
        const glyphAddress = rangeOffsetAddress + rangeOffset + ((codePoint - start) * 2);
        if (glyphAddress + 1 >= view.byteLength) return 0;
        const glyph = view.getUint16(glyphAddress, false);
        return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
      }
      return 0;
    };
  }

  const scale = (metric) => Math.round((metric * 1000) / unitsPerEm);
  return {
    bytes,
    unitsPerEm,
    bbox:bbox.map(scale),
    ascent:scale(ascent),
    descent:scale(descent),
    glyphForCodePoint:mapCodePoint,
    widthForCodePoint(codePoint){
      const gid = mapCodePoint(codePoint);
      const raw = advanceWidths[Math.min(gid, advanceWidths.length - 1)] || advanceWidths[0] || unitsPerEm;
      return (raw * 1000) / unitsPerEm;
    }
  };
}

function hex4(value){
  return Number(value).toString(16).toUpperCase().padStart(4, "0");
}

function sanitizeText(value){
  return String(value ?? "").replace(/\u00a0/g, " ");
}

function encodeTextHex(value){
  const text = sanitizeText(value);
  let output = "";
  for (const char of text) {
    const cp = char.codePointAt(0);
    output += hex4(cp <= 0xffff ? cp : 0xfffd);
  }
  return output;
}

function collectCodePoints(texts){
  const points = new Set([32]);
  for (const text of texts) {
    for (const char of sanitizeText(text)) {
      const cp = char.codePointAt(0);
      if (cp <= 0xffff) points.add(cp);
    }
  }
  return [...points].sort((a, b) => a - b);
}

function buildToUnicodeCMap(codePoints, cmapName){
  const lines = [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
    `/CMapName /${cmapName} def`,
    "/CMapType 2 def",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange"
  ];
  for (let index = 0; index < codePoints.length; index += 100) {
    const chunk = codePoints.slice(index, index + 100);
    lines.push(`${chunk.length} beginbfchar`);
    for (const cp of chunk) lines.push(`<${hex4(cp)}> <${hex4(cp)}>`);
    lines.push("endbfchar");
  }
  lines.push("endcmap", "CMapName currentdict /CMap defineresource pop", "end", "end");
  return ascii(lines.join("\n"));
}

function embedTrueTypeFont(store, parsedFont, codePoints, baseName){
  const used = codePoints.filter((cp) => parsedFont.glyphForCodePoint(cp) !== 0 || cp === 32);
  const maxCid = Math.max(32, ...used);
  const cidToGid = new Uint8Array((maxCid + 1) * 2);
  for (const cp of used) {
    const gid = parsedFont.glyphForCodePoint(cp);
    cidToGid[cp * 2] = (gid >> 8) & 0xff;
    cidToGid[(cp * 2) + 1] = gid & 0xff;
  }

  const fontFileId = store.addStream(`/Length1 ${parsedFont.bytes.length}`, parsedFont.bytes);
  const cidMapId = store.addStream("", cidToGid);
  const toUnicodeId = store.addStream("", buildToUnicodeCMap(used, `${baseName}-UCS`));
  const descriptorId = store.add(
    `<< /Type /FontDescriptor /FontName /${baseName} /Flags 32 `
    + `/FontBBox [${parsedFont.bbox.join(" ")}] /ItalicAngle 0 /Ascent ${parsedFont.ascent} `
    + `/Descent ${parsedFont.descent} /CapHeight ${parsedFont.ascent} /StemV 80 /FontFile2 ${fontFileId} 0 R >>`
  );

  const widths = used.map((cp) => `${cp} [${num(parsedFont.widthForCodePoint(cp))}]`).join(" ");
  const cidFontId = store.add(
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${baseName} `
    + `/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> `
    + `/FontDescriptor ${descriptorId} 0 R /DW 1000 /W [${widths}] /CIDToGIDMap ${cidMapId} 0 R >>`
  );
  const type0Id = store.add(
    `<< /Type /Font /Subtype /Type0 /BaseFont /${baseName} /Encoding /Identity-H `
    + `/DescendantFonts [${cidFontId} 0 R] /ToUnicode ${toUnicodeId} 0 R >>`
  );

  return {
    objectId:type0Id,
    parsed:parsedFont,
    width(text, fontSizePt){
      let units = 0;
      for (const char of sanitizeText(text)) units += parsedFont.widthForCodePoint(char.codePointAt(0));
      return (units / 1000) * fontSizePt;
    }
  };
}

async function loadFontBytes(){
  if (!fontBytesPromise) {
    fontBytesPromise = Promise.all(Object.entries(FONT_URLS).map(async ([key, url]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Impossible de charger la police ${key}.`);
      return [key, new Uint8Array(await response.arrayBuffer())];
    })).then((entries) => Object.fromEntries(entries));
  }
  return fontBytesPromise;
}

function rgbStroke(color){
  return `${num(color[0])} ${num(color[1])} ${num(color[2])} RG`;
}

function rgbFill(color){
  return `${num(color[0])} ${num(color[1])} ${num(color[2])} rg`;
}

class PagePainter {
  constructor(widthMm, heightMm, fonts){
    this.widthMm = widthMm;
    this.heightMm = heightMm;
    this.widthPt = mm(widthMm);
    this.heightPt = mm(heightMm);
    this.fonts = fonts;
    this.commands = [];
  }

  line(x1Mm, y1Mm, x2Mm, y2Mm, { color = BLACK, widthPt = 0.75, dash = null } = {}){
    this.commands.push("q", rgbStroke(color), `${num(widthPt)} w`);
    if (dash) this.commands.push(`[${dash.map(num).join(" ")}] 0 d`);
    this.commands.push(
      `${num(mm(x1Mm))} ${num(this.heightPt - mm(y1Mm))} m`,
      `${num(mm(x2Mm))} ${num(this.heightPt - mm(y2Mm))} l`,
      "S",
      "Q"
    );
  }

  rect(xMm, yMm, wMm, hMm, { stroke = BLACK, fill = null, widthPt = 0.75 } = {}){
    const x = mm(xMm);
    const y = this.heightPt - mm(yMm + hMm);
    const w = mm(wMm);
    const h = mm(hMm);
    this.commands.push("q");
    if (fill) this.commands.push(rgbFill(fill));
    if (stroke) this.commands.push(rgbStroke(stroke), `${num(widthPt)} w`);
    this.commands.push(`${num(x)} ${num(y)} ${num(w)} ${num(h)} re`);
    this.commands.push(fill && stroke ? "B" : fill ? "f" : "S", "Q");
  }

  capsule(x1Mm, y1Mm, x2Mm, y2Mm, { radiusMm = 1, color = GREEN, widthPt = 0.75 } = {}){
    const deltaX = x2Mm - x1Mm;
    const deltaY = y2Mm - y1Mm;
    const length = Math.hypot(deltaX, deltaY) || 1;
    const unitX = deltaX / length;
    const unitY = deltaY / length;
    const normalX = -unitY;
    const normalY = unitX;
    const halfHeight = Math.max(0.01, radiusMm);
    const halfLength = (length / 2) + halfHeight;
    const corner = Math.min(halfHeight * 0.38, halfLength, halfHeight);
    const curve = corner * 0.55228475;
    const centerX = (x1Mm + x2Mm) / 2;
    const centerY = (y1Mm + y2Mm) / 2;
    const localPoint = (along, across) => [
      centerX + (unitX * along) + (normalX * across),
      centerY + (unitY * along) + (normalY * across)
    ];
    const point = (along, across) => {
      const [x, y] = localPoint(along, across);
      return `${num(mm(x))} ${num(this.heightPt - mm(y))}`;
    };

    this.commands.push(
      "q",
      rgbStroke(color),
      `${num(widthPt)} w`,
      `${point(-halfLength + corner, halfHeight)} m`,
      `${point(halfLength - corner, halfHeight)} l`,
      `${point(halfLength - corner + curve, halfHeight)} ${point(halfLength, halfHeight - corner + curve)} ${point(halfLength, halfHeight - corner)} c`,
      `${point(halfLength, -halfHeight + corner)} l`,
      `${point(halfLength, -halfHeight + corner - curve)} ${point(halfLength - corner + curve, -halfHeight)} ${point(halfLength - corner, -halfHeight)} c`,
      `${point(-halfLength + corner, -halfHeight)} l`,
      `${point(-halfLength + corner - curve, -halfHeight)} ${point(-halfLength, -halfHeight + corner - curve)} ${point(-halfLength, -halfHeight + corner)} c`,
      `${point(-halfLength, halfHeight - corner)} l`,
      `${point(-halfLength, halfHeight - corner + curve)} ${point(-halfLength + corner - curve, halfHeight)} ${point(-halfLength + corner, halfHeight)} c`,
      "S",
      "Q"
    );
  }

  text(text, xMm, yBaselineMm, {
    font = "regular",
    sizeMm = 4,
    color = BLACK,
    align = "left"
  } = {}){
    const safe = sanitizeText(text);
    const face = this.fonts[font] || this.fonts.regular;
    const sizePt = mm(sizeMm);
    let xPt = mm(xMm);
    const widthPt = face.width(safe, sizePt);
    if (align === "center") xPt -= widthPt / 2;
    else if (align === "right") xPt -= widthPt;
    const yPt = this.heightPt - mm(yBaselineMm);
    this.commands.push(
      "BT",
      rgbFill(color),
      `/${font === "semibold" ? "F2" : "F1"} ${num(sizePt)} Tf`,
      `1 0 0 1 ${num(xPt)} ${num(yPt)} Tm`,
      `<${encodeTextHex(safe)}> Tj`,
      "ET"
    );
  }

  textBox(text, xMm, yMm, wMm, hMm, options = {}){
    const fontKey = options.font || "regular";
    const face = this.fonts[fontKey] || this.fonts.regular;
    const sizeMm = Number(options.sizeMm || 4);
    const sizePt = mm(sizeMm);
    const ascentPt = (face.parsed.ascent / 1000) * sizePt;
    const descentPt = (face.parsed.descent / 1000) * sizePt;
    const boxBottomPt = this.heightPt - mm(yMm + hMm);
    const baselinePt = boxBottomPt + ((mm(hMm) - (ascentPt - descentPt)) / 2) - descentPt;
    const baselineMmFromTop = (this.heightPt - baselinePt) / MM_TO_PT;
    const align = options.align || "center";
    const x = align === "left" ? xMm : align === "right" ? xMm + wMm : xMm + (wMm / 2);
    this.text(text, x, baselineMmFromTop, { ...options, font:fontKey, align });
  }

  arrow(x1, y1, x2, y2, { color = BLACK, widthPt = 0.85, headMm = 1.7 } = {}){
    this.line(x1, y1, x2, y2, { color, widthPt });
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const spread = Math.PI / 7;
    this.line(x2, y2, x2 - (Math.cos(angle - spread) * headMm), y2 - (Math.sin(angle - spread) * headMm), { color, widthPt });
    this.line(x2, y2, x2 - (Math.cos(angle + spread) * headMm), y2 - (Math.sin(angle + spread) * headMm), { color, widthPt });
  }

  segmentedCentered(segments, xMm, yMm, wMm, hMm, { font = "regular", sizeMm = 4, gapMm = 0.8 } = {}){
    const face = this.fonts[font] || this.fonts.regular;
    const sizePt = mm(sizeMm);
    const normalized = segments.map((segment) => {
      const text = sanitizeText(segment.text);
      const natural = face.width(text, sizePt);
      const minWidthPt = segment.minWidthEm ? sizePt * segment.minWidthEm : 0;
      return { ...segment, text, widthPt:Math.max(natural, minWidthPt) };
    });
    const gapPt = mm(gapMm);
    const totalPt = normalized.reduce((sum, segment) => sum + segment.widthPt, 0) + (gapPt * Math.max(0, normalized.length - 1));
    let cursorPt = mm(xMm + (wMm / 2)) - (totalPt / 2);

    const ascentPt = (face.parsed.ascent / 1000) * sizePt;
    const descentPt = (face.parsed.descent / 1000) * sizePt;
    const boxBottomPt = this.heightPt - mm(yMm + hMm);
    const baselinePt = boxBottomPt + ((mm(hMm) - (ascentPt - descentPt)) / 2) - descentPt;
    const baselineMm = (this.heightPt - baselinePt) / MM_TO_PT;

    for (let index = 0; index < normalized.length; index += 1) {
      const segment = normalized[index];
      const naturalWidthPt = face.width(segment.text, sizePt);
      const textXPt = cursorPt + ((segment.widthPt - naturalWidthPt) / 2);
      this.text(segment.text, textXPt / MM_TO_PT, baselineMm, {
        font,
        sizeMm,
        color:segment.color || BLACK,
        align:"left"
      });
      cursorPt += segment.widthPt + (index < normalized.length - 1 ? gapPt : 0);
    }
  }

  toBytes(){
    return ascii(this.commands.join("\n") + "\n");
  }
}

function operationSymbol(kind){
  if (kind === "sub") return "−";
  if (kind === "mul") return "×";
  if (kind === "div") return "÷";
  return "+";
}

function drawMagicSquare(painter, exercise, slot, { showSolutions, showSums }){
  const side = Math.min(slot.w, slot.h);
  const cardX = slot.x + ((slot.w - side) / 2);
  const cardY = slot.y + ((slot.h - side) / 2);
  const pad = side * 0.048;
  const innerX = cardX + pad;
  const innerY = cardY + pad;
  const innerW = side - (pad * 2);
  const titleSize = side * 0.0432;
  const baseSize = side * 0.046;
  const titleH = Math.max(titleSize * 1.55, side * 0.07);

  painter.textBox("Complète ce carré magique", innerX, innerY, innerW, titleH, {
    font:"semibold",
    sizeMm:titleSize,
    align:"center"
  });

  let cursorY = innerY + titleH + (baseSize * 0.45);
  if (!showSums) {
    const sumH = baseSize * 1.15;
    painter.textBox(`Somme = ${exercise.sum}`, innerX, cursorY, innerW, sumH, {
      font:"semibold",
      sizeMm:baseSize * 0.76,
      align:"center"
    });
    cursorY += sumH + (baseSize * 0.45);
  }

  const boardSide = Math.min(innerW * 0.59, side * 0.55);
  const boardX = innerX + (innerW * 0.20);
  const availableBottom = cardY + side - pad;
  const bottomReserve = showSums ? baseSize * 2.8 : baseSize * 0.55;
  const boardY = Math.max(cursorY, cursorY + Math.max(0, ((availableBottom - cursorY - bottomReserve) - boardSide) / 2));
  const cell = boardSide / 3;

  painter.rect(boardX, boardY, boardSide, boardSide, { stroke:BLACK, widthPt:0.95 });
  for (let index = 1; index < 3; index += 1) {
    painter.line(boardX + (cell * index), boardY, boardX + (cell * index), boardY + boardSide, { color:[0.33, 0.33, 0.33], widthPt:0.72 });
    painter.line(boardX, boardY + (cell * index), boardX + boardSide, boardY + (cell * index), { color:[0.33, 0.33, 0.33], widthPt:0.72 });
  }

  const given = new Set(exercise.givenIndexes || []);
  const values = exercise.values || [];
  for (let index = 0; index < 9; index += 1) {
    const isVisible = showSolutions || given.has(index);
    if (!isVisible) continue;
    const row = Math.floor(index / 3);
    const col = index % 3;
    const isCorrection = showSolutions && !given.has(index);
    painter.textBox(String(values[index]), boardX + (col * cell), boardY + (row * cell), cell, cell, {
      font:"semibold",
      sizeMm:baseSize * 1.30,
      color:isCorrection ? GREEN : BLACK,
      align:"center"
    });
  }

  if (!showSums) return;
  const sumSize = baseSize * 0.78;
  const arrowStartX = boardX + boardSide + (baseSize * 0.25);
  const arrowEndX = arrowStartX + (baseSize * 0.95);
  for (let row = 0; row < 3; row += 1) {
    const cy = boardY + ((row + 0.5) * cell);
    painter.arrow(arrowStartX, cy, arrowEndX, cy, { headMm:baseSize * 0.36 });
    painter.textBox(String(exercise.sum), arrowEndX + (baseSize * 0.18), cy - (sumSize * 0.7), baseSize * 2.1, sumSize * 1.4, {
      font:"semibold",
      sizeMm:sumSize,
      align:"left"
    });
  }

  const arrowTop = boardY + boardSide + (baseSize * 0.2);
  const arrowBottom = arrowTop + (baseSize * 0.95);
  const bottomValueY = arrowBottom + (baseSize * 0.05);
  for (let col = 0; col < 3; col += 1) {
    const cx = boardX + ((col + 0.5) * cell);
    painter.arrow(cx, arrowTop, cx, arrowBottom, { headMm:baseSize * 0.36 });
    painter.textBox(String(exercise.sum), cx - baseSize, bottomValueY, baseSize * 2, sumSize * 1.5, {
      font:"semibold",
      sizeMm:sumSize,
      align:"center"
    });
  }

  const leftStartX = boardX + (baseSize * 0.2);
  const leftStartY = boardY + boardSide + (baseSize * 0.12);
  const leftEndX = leftStartX - (baseSize * 0.8);
  const leftEndY = leftStartY + (baseSize * 0.8);
  painter.arrow(leftStartX, leftStartY, leftEndX, leftEndY, { headMm:baseSize * 0.36 });
  painter.textBox(String(exercise.sum), innerX, bottomValueY, innerW * 0.19, sumSize * 1.5, {
    font:"semibold",
    sizeMm:sumSize,
    align:"center"
  });

  const rightStartX = boardX + boardSide - (baseSize * 0.2);
  const rightStartY = leftStartY;
  const rightEndX = rightStartX + (baseSize * 0.8);
  const rightEndY = leftEndY;
  painter.arrow(rightStartX, rightStartY, rightEndX, rightEndY, { headMm:baseSize * 0.36 });
  painter.textBox(String(exercise.sum), innerX + (innerW * 0.81), bottomValueY, innerW * 0.19, sumSize * 1.5, {
    font:"semibold",
    sizeMm:sumSize,
    align:"center"
  });
}

function operationSegments(operation, showSolutions){
  const a = String(operation.a);
  const b = String(operation.b);
  const result = String(operation.result);
  const blank = String(operation.blank || "result");
  const blankSegment = { text:"…", color:MID_GRAY, minWidthEm:1.7 };
  const value = (text, target) => showSolutions && blank === target
    ? { text, color:GREEN, minWidthEm:target === "result" ? 1.2 : 0 }
    : blank === target
      ? blankSegment
      : { text, color:BLACK };
  return [
    value(a, "a"),
    { text:operationSymbol(operation.kind), color:BLACK },
    value(b, "b"),
    { text:"=", color:BLACK },
    value(result, "result")
  ];
}

function drawNumberMystery(painter, exercise, slot, { showSolutions }){
  const minSide = Math.min(slot.w, slot.h);
  const pad = minSide * 0.05;
  const gap = minSide * 0.022;
  const x = slot.x + pad;
  const y = slot.y + pad;
  const w = slot.w - (pad * 2);
  const h = slot.h - (pad * 2);
  const titleSize = minSide * 0.047;
  const cellSize = minSide * 0.056;
  const operationSize = minSide * 0.04;
  const answerSize = minSide * 0.038;
  const titleH = titleSize * 1.55;

  painter.textBox("Quel est le nombre mystérieux ?", x, y, w, titleH, {
    font:"semibold",
    sizeMm:titleSize,
    align:"center"
  });

  const boardSide = Math.min(slot.w * 0.44, slot.h * 0.38);
  const boardX = slot.x + ((slot.w - boardSide) / 2);
  const boardY = y + titleH + gap;
  const gridCell = boardSide / 3;
  const mystery = Number(exercise.mystery);
  const numbers = Array.isArray(exercise.gridNumbers) ? exercise.gridNumbers : [];

  for (let index = 0; index < 9; index += 1) {
    const row = Math.floor(index / 3);
    const col = index % 3;
    const cellX = boardX + (col * gridCell);
    const cellY = boardY + (row * gridCell);
    const isMystery = showSolutions && Number(numbers[index]) === mystery;
    painter.rect(cellX, cellY, gridCell, gridCell, {
      stroke:[0.33, 0.33, 0.33],
      fill:isMystery ? GREEN_FILL : null,
      widthPt:0.72
    });
    painter.textBox(String(numbers[index] ?? ""), cellX, cellY, gridCell, gridCell, {
      font:"semibold",
      sizeMm:cellSize,
      color:isMystery ? GREEN : BLACK,
      align:"center"
    });
  }

  const answerH = answerSize * 1.7;
  const answerY = slot.y + slot.h - pad - answerH;
  const operationsTop = boardY + boardSide + gap;
  const operationsBottom = answerY - gap;
  const operationsH = Math.max(operationSize * 5.1, operationsBottom - operationsTop);
  const columnGap = minSide * 0.05;
  const operationsPadding = minSide * 0.02;
  const contentX = x + operationsPadding;
  const contentW = w - (operationsPadding * 2);
  const colW = (contentW - columnGap) / 2;
  const rowH = operationsH / 4;
  const operations = Array.isArray(exercise.operations) ? exercise.operations.slice(0, 8) : [];

  operations.forEach((operation, index) => {
    const col = index >= 4 ? 1 : 0;
    const row = index % 4;
    const boxX = contentX + (col * (colW + columnGap));
    const boxY = operationsTop + (row * rowH);
    painter.segmentedCentered(operationSegments(operation, showSolutions), boxX, boxY, colW, rowH, {
      font:"semibold",
      sizeMm:operationSize,
      gapMm:operationSize * 0.22
    });
  });

  const answerLabel = "Nombre mystérieux :";
  const answerValue = showSolutions ? String(mystery) : "…………";
  const font = painter.fonts.semibold;
  const sizePt = mm(answerSize);
  const labelWidth = font.width(answerLabel, sizePt);
  const valueWidth = font.width(answerValue, sizePt);
  const answerGapPt = mm(answerSize * 0.45);
  const totalPt = labelWidth + answerGapPt + valueWidth;
  const leftPt = mm(slot.x + (slot.w / 2)) - (totalPt / 2);
  const leftMm = leftPt / MM_TO_PT;
  painter.textBox(answerLabel, leftMm, answerY, labelWidth / MM_TO_PT, answerH, {
    font:"semibold",
    sizeMm:answerSize,
    color:BLACK,
    align:"left"
  });
  painter.textBox(answerValue, leftMm + ((labelWidth + answerGapPt) / MM_TO_PT), answerY, valueWidth / MM_TO_PT, answerH, {
    font:"semibold",
    sizeMm:answerSize,
    color:showSolutions ? GREEN : MID_GRAY,
    align:"left"
  });
}

function drawWordSearch(painter, exercise, slot, { showSolutions, showWordList = true, perPage = 6 }){
  const size = Math.max(2, Number(exercise?.gridSize) || 10);
  const words = Array.isArray(exercise?.words) ? exercise.words : [];
  const layout = computeWordSearchLayout({
    width:slot.w,
    height:slot.h,
    perPage,
    wordCount:words.length,
    gridSize:size,
    showWordList
  });
  const boardX = slot.x + layout.boardX;
  const boardY = slot.y + layout.boardY;
  const cell = layout.cell;
  const cellFont = layout.cellFont;
  const grid = Array.isArray(exercise?.grid) ? exercise.grid : [];

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const cx = boardX + (col * cell);
      const cy = boardY + (row * cell);
      painter.rect(cx, cy, cell, cell, {
        stroke:[0.46,0.46,0.46],
        fill:null,
        widthPt:0.35
      });
      painter.textBox(String(grid[row]?.[col] ?? ""), cx, cy, cell, cell, {
        font:"semibold",
        sizeMm:cellFont,
        color:BLACK,
        align:"center"
      });
    }
  }

  if (showSolutions) {
    for (const placement of exercise?.placements || []) {
      const cells = Array.isArray(placement?.cells) ? placement.cells : [];
      const first = cells[0];
      const last = cells[cells.length - 1];
      if (!Array.isArray(first) || !Array.isArray(last)) continue;
      painter.capsule(
        boardX + ((Number(first[1]) + 0.5) * cell),
        boardY + ((Number(first[0]) + 0.5) * cell),
        boardX + ((Number(last[1]) + 0.5) * cell),
        boardY + ((Number(last[0]) + 0.5) * cell),
        { radiusMm:cell * 0.42, color:GREEN, widthPt:mm(cell * 0.075) }
      );
    }
  }

  if (!showWordList) return;
  const listX = slot.x + layout.listX;
  const listY = slot.y + layout.listY;
  words.forEach((word, index) => {
    const col = Math.min(2, Math.floor(index / layout.listRows));
    const row = index % layout.listRows;
    painter.textBox(
      String(word),
      listX + (col * layout.colW),
      listY + (row * layout.rowStep),
      layout.colW,
      layout.listLineH,
      {
        font:"regular",
        sizeMm:layout.listFont,
        align:"center"
      }
    );
  });
}


function pentominoBounds(cells){
  return {
    width:Math.max(1, ...(cells || []).map(([x]) => Number(x) + 1)),
    height:Math.max(1, ...(cells || []).map(([,y]) => Number(y) + 1))
  };
}

function normalizePentominoCells(cells){
  const source = (cells || []).map(([x,y]) => [Number(x), Number(y)]);
  const minX = Math.min(...source.map(([x]) => x));
  const minY = Math.min(...source.map(([,y]) => y));
  return source.map(([x,y]) => [x - minX, y - minY]);
}

function rotatePentominoCells(cells){
  return normalizePentominoCells((cells || []).map(([x,y]) => [y, -x]));
}

function compactPentominoCells(cells){
  const source = normalizePentominoCells(cells);
  const rotated = rotatePentominoCells(source);
  const a = pentominoBounds(source);
  const b = pentominoBounds(rotated);
  if (b.height < a.height || (b.height === a.height && b.width < a.width)) return rotated;
  return source;
}

function getPentominoShapeMetrics(name, cells = null){
  const shape = normalizePentominoCells(cells || PENTOMINO_SHAPES[name] || []);
  const bounds = pentominoBounds(shape);
  return { name, cells:shape, width:bounds.width, height:bounds.height };
}

function sumNumbers(values){
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function buildPentominoChallengeLayout(pieces, slot){
  const minSide = Math.min(slot.w, slot.h);
  const pad = minSide * 0.055;
  const titleSize = minSide * 0.043;
  const titleH = titleSize * 1.55;
  const contentGap = minSide * 0.018;
  const contentX = slot.x + pad;
  const contentY = slot.y + pad + titleH + contentGap;
  const contentW = Math.max(1, slot.w - (pad * 2));
  const contentH = Math.max(1, slot.h - (pad * 2) - titleH - contentGap);
  const first = pieces.slice(0, 4).map((name) => getPentominoShapeMetrics(name));
  const added = pieces.slice(4, 8).map((name) => getPentominoShapeMetrics(name));
  const pieceGapUnits = 0.8;
  const rowGapUnits = 0.75;
  const plusWidthUnits = 0.95;
  const plusGapUnits = 0.5;
  const rows = [];

  if (first.length) {
    rows.push({
      type:"first",
      pieces:first,
      widthUnits:sumNumbers(first.map((piece) => piece.width)) + (pieceGapUnits * Math.max(0, first.length - 1)),
      heightUnits:Math.max(...first.map((piece) => piece.height), 1)
    });
  }

  added.forEach((piece) => {
    rows.push({
      type:"added",
      piece,
      widthUnits:plusWidthUnits + plusGapUnits + piece.width,
      heightUnits:Math.max(piece.height, 1)
    });
  });

  const maxRowWidthUnits = Math.max(...rows.map((row) => row.widthUnits), 1);
  const totalHeightUnits = sumNumbers(rows.map((row) => row.heightUnits)) + (rowGapUnits * Math.max(0, rows.length - 1));
  const cell = Math.min(contentW / maxRowWidthUnits, contentH / Math.max(totalHeightUnits, 1));
  const blockH = totalHeightUnits * cell;
  let cursorY = contentY + ((contentH - blockH) / 2);

  const layoutRows = rows.map((row) => {
    const rowW = row.widthUnits * cell;
    const rowH = row.heightUnits * cell;
    const rowX = contentX + ((contentW - rowW) / 2);
    const entry = { ...row, x:rowX, y:cursorY, w:rowW, h:rowH };
    cursorY += rowH + (rowGapUnits * cell);
    return entry;
  });

  return {
    title:{ x:slot.x + pad, y:slot.y + pad, w:slot.w - (pad * 2), h:titleH, size:titleSize },
    cell,
    pieceGap:pieceGapUnits * cell,
    plusWidth:plusWidthUnits * cell,
    plusGap:plusGapUnits * cell,
    plusSize:minSide * 0.047,
    rows:layoutRows
  };
}

function drawPentominoShape(painter, name, box, {
  cells = null,
  fixedCellMm = null,
  fill = [0.86,0.88,0.92],
  stroke = BLACK,
  lineWidthPt = 0.9
} = {}){
  const shape = normalizePentominoCells(cells || PENTOMINO_SHAPES[name] || []);
  if (!shape.length) return;
  const bounds = pentominoBounds(shape);
  const cell = fixedCellMm || Math.min(box.w / bounds.width, box.h / bounds.height);
  const shapeW = bounds.width * cell;
  const shapeH = bounds.height * cell;
  const originX = box.x + ((box.w - shapeW) / 2);
  const originY = box.y + ((box.h - shapeH) / 2);
  const set = new Set(shape.map(([x,y]) => `${x},${y}`));

  for (const [x,y] of shape) {
    painter.rect(originX + (x * cell), originY + (y * cell), cell, cell, { stroke:null, fill });
  }
  for (const [x,y] of shape) {
    const left = originX + (x * cell);
    const top = originY + (y * cell);
    if (!set.has(`${x},${y - 1}`)) painter.line(left, top, left + cell, top, { color:stroke, widthPt:lineWidthPt });
    if (!set.has(`${x + 1},${y}`)) painter.line(left + cell, top, left + cell, top + cell, { color:stroke, widthPt:lineWidthPt });
    if (!set.has(`${x},${y + 1}`)) painter.line(left + cell, top + cell, left, top + cell, { color:stroke, widthPt:lineWidthPt });
    if (!set.has(`${x - 1},${y}`)) painter.line(left, top + cell, left, top, { color:stroke, widthPt:lineWidthPt });
  }
}

function getPentominoColorMap(pieces){
  const names = Array.isArray(pieces) ? pieces : [];
  return new Map(names.map((name, index) => [name, PENTOMINO_CORRECTION_COLORS[index % PENTOMINO_CORRECTION_COLORS.length]]));
}

function buildPentominoCorrectionLayout(exercise, slot){
  const minSide = Math.min(slot.w, slot.h);
  const pad = minSide * 0.055;
  const titleSize = minSide * 0.040;
  const titleH = titleSize * 1.55;
  const contentGap = minSide * 0.02;
  const contentX = slot.x + pad;
  const contentY = slot.y + pad + titleH + contentGap;
  const contentW = Math.max(1, slot.w - (pad * 2));
  const contentH = Math.max(1, slot.h - (pad * 2) - titleH - contentGap);
  const stages = (Array.isArray(exercise?.stages) ? exercise.stages : []).slice(0, 5);
  const labelUnits = 3.3;
  const boardGapUnits = 0.8;
  const rowGapUnits = 0.65;
  const boardMaxWUnits = 8;
  const boardHUnits = 5;
  const cell = Math.min(
    contentW / (labelUnits + boardGapUnits + boardMaxWUnits),
    contentH / ((stages.length * boardHUnits) + (Math.max(0, stages.length - 1) * rowGapUnits))
  );
  const rowH = boardHUnits * cell;
  const totalH = (stages.length * rowH) + (Math.max(0, stages.length - 1) * rowGapUnits * cell);
  let cursorY = contentY + ((contentH - totalH) / 2);
  const rows = stages.map((stage) => {
    const boardW = Number(stage?.width || 0) * cell;
    const row = {
      stage,
      label:`${stage?.width || ""}×${stage?.height || ""}`,
      labelX:contentX,
      labelY:cursorY,
      labelW:labelUnits * cell,
      rowH,
      boardX:contentX + (labelUnits * cell) + (boardGapUnits * cell),
      boardY:cursorY,
      boardW,
      boardH:rowH
    };
    cursorY += rowH + (rowGapUnits * cell);
    return row;
  });
  return {
    title:{ x:slot.x + pad, y:slot.y + pad, w:slot.w - (pad * 2), h:titleH, size:titleSize },
    cell,
    rows
  };
}

function drawPentominoStageBoard(painter, stage, colorMap, x, y, cell){
  const width = Number(stage?.width || 0);
  const height = Number(stage?.height || 0);
  painter.rect(x, y, width * cell, height * cell, { stroke:[0.33, 0.33, 0.33], fill:null, widthPt:0.72 });
  const placements = Array.isArray(stage?.solution) ? stage.solution : [];
  placements.forEach((placement) => {
    const color = colorMap.get(placement?.name) || PENTOMINO_CORRECTION_COLORS[0];
    const cells = Array.isArray(placement?.cells) ? placement.cells : [];
    const cellSet = new Set(cells.map(([cx,cy]) => `${cx},${cy}`));
    cells.forEach(([cx,cy]) => {
      painter.rect(x + (cx * cell), y + (cy * cell), cell, cell, { stroke:null, fill:color });
    });
    cells.forEach(([cx,cy]) => {
      const left = x + (cx * cell);
      const top = y + (cy * cell);
      if (!cellSet.has(`${cx},${cy - 1}`)) painter.line(left, top, left + cell, top, { color:BLACK, widthPt:0.65 });
      if (!cellSet.has(`${cx + 1},${cy}`)) painter.line(left + cell, top, left + cell, top + cell, { color:BLACK, widthPt:0.65 });
      if (!cellSet.has(`${cx},${cy + 1}`)) painter.line(left + cell, top + cell, left, top + cell, { color:BLACK, widthPt:0.65 });
      if (!cellSet.has(`${cx - 1},${cy}`)) painter.line(left, top + cell, left, top, { color:BLACK, widthPt:0.65 });
    });
  });
}

function drawPentominoCorrection(painter, exercise, slot){
  const pieces = Array.isArray(exercise?.pieces) ? exercise.pieces : [];
  const layout = buildPentominoCorrectionLayout(exercise, slot);
  const colorMap = getPentominoColorMap(pieces);
  painter.textBox("Correction", layout.title.x, layout.title.y, layout.title.w, layout.title.h, {
    font:"semibold",
    sizeMm:layout.title.size,
    align:"center"
  });
  layout.rows.forEach((row) => {
    painter.textBox(row.label, row.labelX, row.labelY, row.labelW, row.rowH, {
      font:"semibold",
      sizeMm:Math.max(2.7, layout.cell * 0.88),
      align:"right"
    });
    drawPentominoStageBoard(painter, row.stage, colorMap, row.boardX, row.boardY, layout.cell);
  });
}

function drawPentominoChallenge(painter, exercise, slot, { showSolutions = false } = {}){
  if (showSolutions) {
    drawPentominoCorrection(painter, exercise, slot);
    return;
  }

  const pieces = Array.isArray(exercise?.pieces) ? exercise.pieces : [];
  const layout = buildPentominoChallengeLayout(pieces, slot);
  painter.textBox("Défi pentaminos", layout.title.x, layout.title.y, layout.title.w, layout.title.h, {
    font:"semibold",
    sizeMm:layout.title.size,
    align:"center"
  });

  layout.rows.forEach((row) => {
    if (row.type === "first") {
      let cursorX = row.x;
      row.pieces.forEach((piece) => {
        const pieceW = piece.width * layout.cell;
        const pieceH = piece.height * layout.cell;
        drawPentominoShape(painter, piece.name, {
          x:cursorX,
          y:row.y + ((row.h - pieceH) / 2),
          w:pieceW,
          h:pieceH
        }, {
          cells:piece.cells,
          fixedCellMm:layout.cell,
          lineWidthPt:0.78
        });
        cursorX += pieceW + layout.pieceGap;
      });
      return;
    }

    const piece = row.piece;
    const pieceW = piece.width * layout.cell;
    const pieceH = piece.height * layout.cell;
    const pieceX = row.x + layout.plusWidth + layout.plusGap;
    painter.textBox("+", row.x, row.y, layout.plusWidth, row.h, {
      font:"semibold",
      sizeMm:layout.plusSize,
      align:"center"
    });
    drawPentominoShape(painter, piece.name, {
      x:pieceX,
      y:row.y + ((row.h - pieceH) / 2),
      w:pieceW,
      h:pieceH
    }, {
      cells:piece.cells,
      fixedCellMm:layout.cell,
      lineWidthPt:0.78
    });
  });
}

function drawCutLines(painter, layout, widthMm, heightMm){
  const slotW = widthMm / layout.columns;
  const slotH = heightMm / layout.rows;
  for (let column = 1; column < layout.columns; column += 1) {
    painter.line(slotW * column, 0, slotW * column, heightMm, {
      color:CUT_GRAY,
      widthPt:0.55,
      dash:[2.5, 2.5]
    });
  }
  for (let row = 1; row < layout.rows; row += 1) {
    painter.line(0, slotH * row, widthMm, slotH * row, {
      color:CUT_GRAY,
      widthPt:0.55,
      dash:[2.5, 2.5]
    });
  }
}

function collectWorksheetTexts(generatorId, exercises, { showSolutions, showSums }){
  const texts = [
    "0123456789",
    "+−×÷=…",
    "Complète ce carré magique",
    "Somme =",
    "Quel est le nombre mystérieux ?",
    "Nombre mystérieux :",
    "…………"
  ];
  for (const exercise of exercises || []) {
    if (generatorId === "magic-square") {
      texts.push(String(exercise.sum));
      (exercise.values || []).forEach((value) => texts.push(String(value)));
    } else if (generatorId === "word-search") {
      (exercise.grid || []).forEach((row) => (row || []).forEach((value) => texts.push(String(value))));
      (exercise.words || []).forEach((word) => texts.push(String(word)));
    } else if (generatorId === "pentomino") {
      texts.push("Défi pentaminos", "+", "Correction", "4×5", "5×5", "6×5", "7×5", "8×5");
    } else {
      texts.push(String(exercise.mystery));
      (exercise.gridNumbers || []).forEach((value) => texts.push(String(value)));
      (exercise.operations || []).forEach((operation) => {
        texts.push(String(operation.a), String(operation.b), String(operation.result), operationSymbol(operation.kind));
      });
    }
  }
  if (showSolutions) texts.push("Correction");
  if (!showSums) texts.push("Somme");
  return texts;
}

function pdfLiteralString(value){
  return `(${String(value).replace(/([\\()])/g, "\\$1")})`;
}

function pdfUnicodeString(value){
  let hex = "FEFF";
  for (const char of String(value)) {
    const cp = char.codePointAt(0);
    if (cp <= 0xffff) {
      hex += hex4(cp);
      continue;
    }
    const adjusted = cp - 0x10000;
    hex += hex4(0xd800 + (adjusted >> 10));
    hex += hex4(0xdc00 + (adjusted & 0x3ff));
  }
  return `<${hex}>`;
}

export async function buildWorksheetPdfBytes({
  generatorId,
  exercises,
  perPage,
  showSolutions = false,
  showSums = true,
  showWordList = true,
  cutLines = false,
  landscape = false,
  fontBytes = null
} = {}){
  const source = Array.isArray(exercises) ? exercises : [];
  if (!source.length) throw new Error("Aucun exercice à exporter.");

  const pageWidthMm = landscape ? 297 : 210;
  const pageHeightMm = landscape ? 210 : 297;
  const layout = getWorksheetLayout(Number(perPage) || 6, landscape);
  const pages = paginateWorksheetItems(source, Number(perPage) || 6);
  const store = new PdfObjectStore();
  const catalogId = store.reserve();
  const pagesRootId = store.reserve();

  const loadedFonts = fontBytes || await loadFontBytes();
  const texts = collectWorksheetTexts(generatorId, source, { showSolutions, showSums });
  const codePoints = collectCodePoints(texts);
  const regular = embedTrueTypeFont(store, parseTrueType(loadedFonts.regular), codePoints, "AndikaRegular");
  const semibold = embedTrueTypeFont(store, parseTrueType(loadedFonts.semibold), codePoints, "AndikaSemiBold");
  const fonts = { regular, semibold };

  const pageIds = [];
  for (const pageExercises of pages) {
    const painter = new PagePainter(pageWidthMm, pageHeightMm, fonts);
    const slotW = pageWidthMm / layout.columns;
    const slotH = pageHeightMm / layout.rows;

    pageExercises.forEach((exercise, index) => {
      const column = index % layout.columns;
      const row = Math.floor(index / layout.columns);
      const slot = { x:column * slotW, y:row * slotH, w:slotW, h:slotH };
      if (generatorId === "pentomino") {
        drawPentominoChallenge(painter, exercise, slot, { showSolutions });
      } else if (generatorId === "word-search") {
        drawWordSearch(painter, exercise, slot, { showSolutions, showWordList, perPage:Number(perPage) || 6 });
      } else if (generatorId === "number-mystery") {
        drawNumberMystery(painter, exercise, slot, { showSolutions });
      } else {
        drawMagicSquare(painter, exercise, slot, { showSolutions, showSums });
      }
    });

    if (cutLines) drawCutLines(painter, layout, pageWidthMm, pageHeightMm);

    const contentId = store.addStream("", painter.toBytes());
    const pageId = store.add(
      `<< /Type /Page /Parent ${pagesRootId} 0 R `
      + `/MediaBox [0 0 ${num(mm(pageWidthMm))} ${num(mm(pageHeightMm))}] `
      + `/Resources << /Font << /F1 ${regular.objectId} 0 R /F2 ${semibold.objectId} 0 R >> >> `
      + `/Contents ${contentId} 0 R >>`
    );
    pageIds.push(pageId);
  }

  store.set(pagesRootId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  store.set(catalogId, `<< /Type /Catalog /Pages ${pagesRootId} 0 R >>`);
  const title = generatorId === "pentomino" ? "Défis pentaminos" : (generatorId === "word-search" ? "Mots mêlés" : (generatorId === "number-mystery" ? "Nombre mystérieux" : "Carré magique"));
  const infoId = store.add(`<< /Title ${pdfUnicodeString(title)} /Creator ${pdfLiteralString("Tujer")} >>`);
  return store.build(catalogId, infoId);
}

function makeFilename(generatorId, showSolutions){
  const base = generatorId === "pentomino" ? "defis-pentaminos" : (generatorId === "word-search" ? "mots-meles" : (generatorId === "number-mystery" ? "nombre-mysterieux" : "carre-magique"));
  return `${base}${showSolutions ? "-correction" : ""}.pdf`;
}

export async function downloadWorksheetPdf(options = {}){
  const bytes = await buildWorksheetPdfBytes(options);
  const blob = new Blob([bytes], { type:"application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = makeFilename(options.generatorId, options.showSolutions === true);
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}


function drawPentominoGrid(painter, columns, rows, cellSizeMm, centerX, topY, label){
  const width = columns * cellSizeMm;
  const height = rows * cellSizeMm;
  const x = centerX - (width / 2);
  painter.textBox(label, x, topY - 8, width, 6, { font:"semibold", sizeMm:4.2, align:"center" });
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      painter.rect(x + (col * cellSizeMm), topY + (row * cellSizeMm), cellSizeMm, cellSizeMm, {
        stroke:[0.12,0.12,0.12],
        fill:null,
        widthPt:0.6
      });
    }
  }
}

async function buildPentominoGridsPdf(cellSizeMm, fontBytes){
  const loadedFonts = fontBytes || await loadFontBytes();
  const store = new PdfObjectStore();
  const catalogId = store.reserve();
  const pagesRootId = store.reserve();
  const texts = ["4 pièces","5 pièces","6 pièces","7 pièces","8 pièces"];
  const codePoints = collectCodePoints(texts);
  const regular = embedTrueTypeFont(store, parseTrueType(loadedFonts.regular), codePoints, "AndikaRegular");
  const semibold = embedTrueTypeFont(store, parseTrueType(loadedFonts.semibold), codePoints, "AndikaSemiBold");
  const fonts = { regular, semibold };
  const pageIds = [];

  const makePage = (draw) => {
    const painter = new PagePainter(210, 297, fonts);
    draw(painter);
    const contentId = store.addStream("", painter.toBytes());
    const pageId = store.add(`<< /Type /Page /Parent ${pagesRootId} 0 R /MediaBox [0 0 ${num(mm(210))} ${num(mm(297))}] /Resources << /Font << /F1 ${regular.objectId} 0 R /F2 ${semibold.objectId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  };

  makePage((painter) => {
    const gap = Math.max(8, 210 - 20 - ((4 + 5) * cellSizeMm));
    const pairWidth = (4 * cellSizeMm) + gap + (5 * cellSizeMm);
    const pairLeft = (210 - pairWidth) / 2;
    drawPentominoGrid(painter, 4, 5, cellSizeMm, pairLeft + (2 * cellSizeMm), 28, "4 pièces");
    drawPentominoGrid(painter, 5, 5, cellSizeMm, pairLeft + (4 * cellSizeMm) + gap + (2.5 * cellSizeMm), 28, "5 pièces");
    drawPentominoGrid(painter, 6, 5, cellSizeMm, 105, 170, "6 pièces");
  });
  makePage((painter) => {
    drawPentominoGrid(painter, 7, 5, cellSizeMm, 105, 30, "7 pièces");
    drawPentominoGrid(painter, 8, 5, cellSizeMm, 105, 172, "8 pièces");
  });

  store.set(pagesRootId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  store.set(catalogId, `<< /Type /Catalog /Pages ${pagesRootId} 0 R >>`);
  const infoId = store.add(`<< /Title ${pdfUnicodeString("Grilles pentaminos")} /Creator ${pdfLiteralString("Tujer")} >>`);
  return store.build(catalogId, infoId);
}

function mirrorPentominoCellsHorizontally(cells){
  const normalized = normalizePentominoCells(cells || []);
  if (!normalized.length) return [];
  const bounds = pentominoBounds(normalized);
  return normalized.map(([x,y]) => [(bounds.width - 1) - x, y]);
}

function drawPentominoCutPiece(painter, name, box, {
  cells = null,
  cellSizeMm,
  duplexStyle = false,
  mirrored = false
} = {}){
  const source = normalizePentominoCells(cells || PENTOMINO_SHAPES[name] || []);
  const shape = mirrored ? mirrorPentominoCellsHorizontally(source) : source;
  if (!shape.length) return;
  const bounds = pentominoBounds(shape);
  const cell = Number(cellSizeMm) || 20;
  const shapeW = bounds.width * cell;
  const shapeH = bounds.height * cell;
  const originX = box.x + ((box.w - shapeW) / 2);
  const originY = box.y + ((box.h - shapeH) / 2);
  const set = new Set(shape.map(([x,y]) => `${x},${y}`));
  const fill = duplexStyle ? [0.95,0.95,0.95] : [0.93,0.93,0.93];

  for (const [x,y] of shape) {
    painter.rect(originX + (x * cell), originY + (y * cell), cell, cell, { stroke:null, fill });
  }

  if (duplexStyle) {
    const innerWidthPt = 0.48;
    for (const [x,y] of shape) {
      const left = originX + (x * cell);
      const top = originY + (y * cell);
      if (set.has(`${x + 1},${y}`)) {
        painter.line(left + cell, top, left + cell, top + cell, { color:[0.40,0.40,0.40], widthPt:innerWidthPt });
      }
      if (set.has(`${x},${y + 1}`)) {
        painter.line(left, top + cell, left + cell, top + cell, { color:[0.40,0.40,0.40], widthPt:innerWidthPt });
      }
    }
  }

  const outerWidthPt = duplexStyle ? 2.2 : 1.0;
  for (const [x,y] of shape) {
    const left = originX + (x * cell);
    const top = originY + (y * cell);
    if (!set.has(`${x},${y - 1}`)) painter.line(left, top, left + cell, top, { color:BLACK, widthPt:outerWidthPt });
    if (!set.has(`${x + 1},${y}`)) painter.line(left + cell, top, left + cell, top + cell, { color:BLACK, widthPt:outerWidthPt });
    if (!set.has(`${x},${y + 1}`)) painter.line(left + cell, top + cell, left, top + cell, { color:BLACK, widthPt:outerWidthPt });
    if (!set.has(`${x - 1},${y}`)) painter.line(left, top + cell, left, top, { color:BLACK, widthPt:outerWidthPt });
  }
}

function preparePentominoPieceRows(cellSizeMm){
  const rows = [
    ["F", "T", "V"],
    ["W", "X", "Z"],
    ["L", "N"],
    ["Y", "I"],
    ["P", "U"]
  ];
  const horizontalGapMm = 5;
  const verticalGapMm = 8;

  const preparedRows = rows.map((names) => {
    const pieces = names.map((name) => {
      const cells = compactPentominoCells(PENTOMINO_SHAPES[name] || []);
      const bounds = pentominoBounds(cells);
      return {
        name,
        cells,
        widthMm:bounds.width * cellSizeMm,
        heightMm:bounds.height * cellSizeMm
      };
    });
    return {
      pieces,
      widthMm:pieces.reduce((sum, piece) => sum + piece.widthMm, 0) + (horizontalGapMm * Math.max(0, pieces.length - 1)),
      heightMm:Math.max(...pieces.map((piece) => piece.heightMm), 0)
    };
  });

  return { preparedRows, horizontalGapMm, verticalGapMm };
}

async function buildPentominoPiecesPdf(cellSizeMm, fontBytes, { rectoVerso = false, versoOffsetXmm = 0, versoOffsetYmm = 0 } = {}){
  const loadedFonts = fontBytes || await loadFontBytes();
  const store = new PdfObjectStore();
  const catalogId = store.reserve();
  const pagesRootId = store.reserve();
  const codePoints = collectCodePoints(["Pentaminos à découper"]);
  const regular = embedTrueTypeFont(store, parseTrueType(loadedFonts.regular), codePoints, "AndikaRegular");
  const semibold = embedTrueTypeFont(store, parseTrueType(loadedFonts.semibold), codePoints, "AndikaSemiBold");
  const fonts = { regular, semibold };
  const pageWidthMm = 210;
  const pageHeightMm = 297;
  const safeVersoOffsetXmm = Math.min(20, Math.max(-20, Math.round(Number(versoOffsetXmm) || 0)));
  const safeVersoOffsetYmm = Math.min(20, Math.max(-20, Math.round(Number(versoOffsetYmm) || 0)));
  const { preparedRows, horizontalGapMm, verticalGapMm } = preparePentominoPieceRows(cellSizeMm);
  const totalHeightMm = preparedRows.reduce((sum, row) => sum + row.heightMm, 0)
    + (verticalGapMm * Math.max(0, preparedRows.length - 1));
  const pageIds = [];

  const drawPage = (mirrored = false) => {
    const painter = new PagePainter(pageWidthMm, pageHeightMm, fonts);
    let cursorY = (pageHeightMm - totalHeightMm) / 2;

    preparedRows.forEach((row) => {
      let cursorX = (pageWidthMm - row.widthMm) / 2;
      row.pieces.forEach((piece) => {
        const originalX = cursorX;
        const drawX = mirrored
          ? (pageWidthMm - originalX - piece.widthMm) + safeVersoOffsetXmm
          : originalX;
        const drawY = cursorY + ((row.heightMm - piece.heightMm) / 2) + (mirrored ? safeVersoOffsetYmm : 0);
        drawPentominoCutPiece(painter, piece.name, {
          x:drawX,
          y:drawY,
          w:piece.widthMm,
          h:piece.heightMm
        }, {
          cells:piece.cells,
          cellSizeMm,
          duplexStyle:rectoVerso,
          mirrored
        });
        cursorX += piece.widthMm + horizontalGapMm;
      });
      cursorY += row.heightMm + verticalGapMm;
    });

    const contentId = store.addStream("", painter.toBytes());
    const pageId = store.add(`<< /Type /Page /Parent ${pagesRootId} 0 R /MediaBox [0 0 ${num(mm(pageWidthMm))} ${num(mm(pageHeightMm))}] /Resources << /Font << /F1 ${regular.objectId} 0 R /F2 ${semibold.objectId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  };

  drawPage(false);
  if (rectoVerso) drawPage(true);

  store.set(pagesRootId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  store.set(catalogId, `<< /Type /Catalog /Pages ${pagesRootId} 0 R >>`);
  const title = rectoVerso ? "Pentaminos à découper — recto-verso" : "Pentaminos à découper";
  const infoId = store.add(`<< /Title ${pdfUnicodeString(title)} /Creator ${pdfLiteralString("Tujer")} >>`);
  return store.build(catalogId, infoId);
}

export async function buildPentominoMaterialPdfBytes({ type = "grids", cellSizeMm = 20, rectoVerso = false, versoOffsetXmm = 0, versoOffsetYmm = 0, fontBytes = null } = {}){
  const size = Math.min(20, Math.max(10, Math.round(Number(cellSizeMm) || 20)));
  return type === "pieces"
    ? buildPentominoPiecesPdf(size, fontBytes, {
        rectoVerso:rectoVerso === true,
        versoOffsetXmm,
        versoOffsetYmm
      })
    : buildPentominoGridsPdf(size, fontBytes);
}

export async function downloadPentominoMaterialPdf({ type = "grids", cellSizeMm = 20, rectoVerso = false, versoOffsetXmm = 0, versoOffsetYmm = 0 } = {}){
  const size = Math.min(20, Math.max(10, Math.round(Number(cellSizeMm) || 20)));
  const duplex = type === "pieces" && rectoVerso === true;
  const bytes = await buildPentominoMaterialPdfBytes({
    type,
    cellSizeMm:size,
    rectoVerso:duplex,
    versoOffsetXmm:duplex ? versoOffsetXmm : 0,
    versoOffsetYmm:duplex ? versoOffsetYmm : 0
  });
  const blob = new Blob([bytes], { type:"application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = type === "pieces"
    ? `pentaminos-a-decouper-${size}mm${duplex ? "-recto-verso" : ""}.pdf`
    : `grilles-pentaminos-${size}mm.pdf`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
