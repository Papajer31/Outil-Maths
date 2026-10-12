const SVG_WIDTH = 1400;
const SVG_HEIGHT = 240;
const LINE_START_X = 70;
const LINE_END_X = 1330;
const LINE_Y = 142;
const COMPLETE_CONTINUATION_TICKS = 4;

export async function createNumberLineHistoryPreviewUrl(rawPreview = {}) {
  const preview = normalizePreview(rawPreview);
  if (!preview) return "";
  const svg = renderNumberLinePreviewSvg(preview);
  if (!svg) return "";
  return URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
}

function normalizePreview(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (String(value.type || "").trim().toLowerCase() !== "number-line") return null;

  const lineType = String(value.lineType || "").trim().toLowerCase() === "complete" ? "complete" : "simple";
  const questionType = String(value.questionType || "").trim() === "graduationToNumber"
    ? "graduationToNumber"
    : "numberToGraduation";
  const tickCount = clampInt(value.tickCount, 2, 160, lineType === "complete" ? 121 : 15);
  const markerIndices = (Array.isArray(value.markerIndices) ? value.markerIndices : [])
    .slice(0, 2)
    .map((item) => Number(item))
    .filter(Number.isInteger);
  const targetIndexRaw = Number(value.targetIndex);

  return {
    lineType,
    questionType,
    tickCount,
    markerIndices,
    targetIndex: Number.isInteger(targetIndexRaw) ? targetIndexRaw : null,
    targetValue: formatNumericLabel(value.targetValue),
    referenceA: formatNumericLabel(value.referenceA),
    referenceB: formatNumericLabel(value.referenceB)
  };
}

function renderNumberLinePreviewSvg(preview) {
  const lastIndex = Math.max(1, preview.tickCount - 1);
  const stepX = (LINE_END_X - LINE_START_X) / lastIndex;
  const extraTicks = preview.lineType === "complete" ? COMPLETE_CONTINUATION_TICKS : 0;
  const firstIndex = -extraTicks;
  const finalIndex = lastIndex + extraTicks;
  const ticks = [];
  for (let index = firstIndex; index <= finalIndex; index += 1) {
    ticks.push({
      index,
      x: LINE_START_X + (stepX * index),
      role: getTickRole(preview.lineType, index, lastIndex)
    });
  }

  const tickXs = ticks.map((tick) => tick.x);
  const baselineExtension = preview.lineType === "complete" ? 14 : 40;
  const baselineStartX = Math.max(0, Math.min(...tickXs) - baselineExtension);
  const baselineEndX = Math.min(SVG_WIDTH, Math.max(...tickXs) + baselineExtension);
  const targetVisible = preview.questionType === "graduationToNumber" && Number.isInteger(preview.targetIndex);

  const tickMarkup = ticks.map((tick) => {
    const markerOrder = preview.markerIndices.indexOf(tick.index);
    const isMarker = markerOrder >= 0;
    const shape = getTickShape(preview.lineType, tick.role, isMarker, false);
    const color = markerOrder === 0 ? "#0070c0" : markerOrder === 1 ? "#c00000" : "#4f5968";
    const regular = `<line x1="${round(tick.x)}" y1="${shape.y1}" x2="${round(tick.x)}" y2="${shape.y2}" stroke="${color}" stroke-width="${shape.width}"/>`;
    if (!targetVisible || tick.index !== preview.targetIndex) return regular;
    const targetShape = getTickShape(preview.lineType, tick.role, isMarker, true);
    return `${regular}<line x1="${round(tick.x)}" y1="${targetShape.y1}" x2="${round(tick.x)}" y2="${targetShape.y2}" stroke="#ff9f0a" stroke-width="6"/>`;
  }).join("");

  const labels = preview.markerIndices.slice(0, 2).map((index, order) => {
    const tick = ticks.find((item) => item.index === index);
    if (!tick) return "";
    const text = order === 0 ? preview.referenceA : preview.referenceB;
    const color = order === 0 ? "#0070c0" : "#c00000";
    return `<text x="${round(tick.x)}" y="58" text-anchor="middle" dominant-baseline="middle" font-family="Andika, system-ui, sans-serif" font-size="54" font-weight="700" fill="${color}">${escapeXml(text)}</text>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}"><rect width="100%" height="100%" fill="#fff"/>${labels}<line x1="${round(baselineStartX)}" y1="${LINE_Y}" x2="${round(baselineEndX)}" y2="${LINE_Y}" stroke="#4f5968" stroke-width="6"/>${tickMarkup}</svg>`;
}

function getTickRole(lineType, index, lastIndex) {
  if (lineType !== "complete") return "regular";
  if (index < 0 || index > lastIndex) return "minor";
  if (index % 10 === 0) return "major";
  if (index % 5 === 0) return "medium";
  return "minor";
}

function getTickShape(lineType, role, isMarker, isTarget) {
  if (lineType === "complete") {
    const base = role === "major" || isMarker
      ? { y1: 92, y2: 192, width: 4.5 }
      : role === "medium"
        ? { y1: 112, y2: 172, width: 3.2 }
        : { y1: 124, y2: 160, width: 1.8 };
    return isTarget ? { ...base, width: 6 } : base;
  }
  if (isTarget) return { y1: 94, y2: 190, width: 6 };
  return { y1: 102, y2: 182, width: isMarker ? 4 : 3 };
}

function formatNumericLabel(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : "";
}

function round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.trunc(number))) : fallback;
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}


/**
 * Rend la correction directement dans la cellule d'historique.
 * Les couleurs bleu/rouge restent exclusivement celles des repères de la
 * droite ; la correction utilise vert/rouge, et la cible à lire reste jaune.
 */
export function renderNumberLineHistoryCorrectionSvg(rawCell = {}) {
  const preview = normalizePreview({ ...rawCell, type: "number-line" });
  if (!preview) return "";

  // Version compacte pour l'historique : aucune carte/fond blanc. La droite
  // est dessinée directement sur le fond du tableau. Les couleurs bleu/rouge
  // restent celles des repères pédagogiques ; jaune = cible ; rouge/vert = correction.
  const width = 1400;
  const height = 150;
  const startX = 120;
  const endX = 1340;
  const lineY = 66;

  const studentIndexRaw = Number(rawCell.studentIndex);
  const studentIndex = Number.isInteger(studentIndexRaw) ? studentIndexRaw : null;
  const studentValue = String(rawCell.studentValue ?? "").trim();
  const correct = rawCell.correct === true;

  const lastIndex = Math.max(1, preview.tickCount - 1);
  const stepX = (endX - startX) / lastIndex;
  const extraTicks = preview.lineType === "complete" ? COMPLETE_CONTINUATION_TICKS : 0;
  const ticks = [];
  for (let index = -extraTicks; index <= lastIndex + extraTicks; index += 1) {
    ticks.push({
      index,
      x: startX + (stepX * index),
      role: getTickRole(preview.lineType, index, lastIndex)
    });
  }

  const tickXs = ticks.map((tick) => tick.x);
  const baselineExtension = preview.lineType === "complete" ? 10 : 26;
  const baselineStartX = Math.max(0, Math.min(...tickXs) - baselineExtension);
  const baselineEndX = Math.min(width, Math.max(...tickXs) + baselineExtension);
  const isReadMode = preview.questionType === "graduationToNumber";

  const inlineTickShape = (role, isMarker, isTarget) => {
    if (preview.lineType === "complete") {
      const base = role === "major" || isMarker
        ? { y1: 42, y2: 91, width: 3.2 }
        : role === "medium"
          ? { y1: 50, y2: 83, width: 2.4 }
          : { y1: 56, y2: 77, width: 1.6 };
      return isTarget ? { ...base, width: 4.8 } : base;
    }
    if (isTarget) return { y1: 44, y2: 90, width: 4.8 };
    return { y1: 49, y2: 84, width: isMarker ? 3 : 2.2 };
  };

  const tickMarkup = ticks.map((tick) => {
    const markerOrder = preview.markerIndices.indexOf(tick.index);
    const isMarker = markerOrder >= 0;
    const shape = inlineTickShape(tick.role, isMarker, false);
    const color = markerOrder === 0 ? "#2d9cff" : markerOrder === 1 ? "#ff5252" : "#f1f4f8";
    let markup = `<line x1="${round(tick.x)}" y1="${shape.y1}" x2="${round(tick.x)}" y2="${shape.y2}" stroke="${color}" stroke-width="${shape.width}"/>`;
    if (isReadMode && tick.index === preview.targetIndex) {
      const targetShape = inlineTickShape(tick.role, isMarker, true);
      markup += `<line x1="${round(tick.x)}" y1="${targetShape.y1}" x2="${round(tick.x)}" y2="${targetShape.y2}" stroke="#f6b800" stroke-width="${targetShape.width}" stroke-linecap="round"/>`;
    }
    return markup;
  }).join("");

  const labels = preview.markerIndices.slice(0, 2).map((index, order) => {
    const tick = ticks.find((item) => item.index === index);
    if (!tick) return "";
    const text = order === 0 ? preview.referenceA : preview.referenceB;
    const color = order === 0 ? "#2d9cff" : "#ff5252";
    return `<text x="${round(tick.x)}" y="26" text-anchor="middle" dominant-baseline="middle" font-family="Andika, system-ui, sans-serif" font-size="27" font-weight="700" fill="${color}">${escapeXml(text)}</text>`;
  }).join("");

  let correctionMarkup = "";
  if (isReadMode) {
    const targetTick = ticks.find((tick) => tick.index === preview.targetIndex);
    if (targetTick) {
      const centerX = Math.max(170, Math.min(width - 170, targetTick.x));
      if (correct) {
        correctionMarkup = renderInlineValueLabel(centerX, 118, `${studentValue || preview.targetValue} ✓`, "#55c878", "middle");
      } else {
        correctionMarkup = [
          renderInlineValueLabel(centerX - 25, 112, `Élève : ${studentValue || "—"}`, "#ff6b6b", "end"),
          renderInlineValueLabel(centerX + 25, 112, `Attendu : ${preview.targetValue}`, "#55c878", "start")
        ].join("");
      }
    }
  } else {
    const expectedTick = ticks.find((tick) => tick.index === preview.targetIndex);
    const studentTick = ticks.find((tick) => tick.index === studentIndex);
    if (correct && expectedTick) {
      correctionMarkup = renderInlinePointer(expectedTick.x, "#55c878", "✓", 0, false);
    } else {
      if (studentTick) correctionMarkup += renderInlinePointer(studentTick.x, "#ff6b6b", "Élève", -1, false);
      if (expectedTick) {
        const close = studentTick && Math.abs(studentTick.x - expectedTick.x) < 125;
        correctionMarkup += renderInlinePointer(expectedTick.x, "#55c878", "Attendu", close ? 1 : 0, true);
      }
    }
  }

  return `<svg class="dashboard-history-number-line-inline-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Correction sur droite numérique" style="display:block;width:100%;max-width:920px;min-width:420px;height:auto;overflow:visible;background:transparent">${labels}<line x1="${round(baselineStartX)}" y1="${lineY}" x2="${round(baselineEndX)}" y2="${lineY}" stroke="#f1f4f8" stroke-width="3"/>${tickMarkup}${correctionMarkup}</svg>`;
}

function renderInlinePointer(x, color, label, lane = 0, dashed = false) {
  const safeX = Math.max(48, Math.min(1352, Number(x) || 0));
  const baseY = 96 + (lane * 15);
  const dash = dashed ? ' stroke-dasharray="5 4"' : "";
  const textY = baseY + 26;
  return `<g><path d="M ${round(safeX)} ${baseY - 13} L ${round(safeX - 7)} ${baseY - 2} L ${round(safeX + 7)} ${baseY - 2} Z" fill="${color}"/><line x1="${round(safeX)}" y1="${baseY - 2}" x2="${round(safeX)}" y2="${baseY + 7}" stroke="${color}" stroke-width="2.4"${dash}/><text x="${round(safeX)}" y="${textY}" text-anchor="middle" font-family="Andika, system-ui, sans-serif" font-size="17" font-weight="700" fill="${color}">${escapeXml(label)}</text></g>`;
}

function renderInlineValueLabel(x, y, text, color, anchor = "middle") {
  return `<text x="${round(x)}" y="${y}" text-anchor="${anchor}" dominant-baseline="middle" font-family="Andika, system-ui, sans-serif" font-size="18" font-weight="700" fill="${color}">${escapeXml(text)}</text>`;
}


/**
 * Frise Picbille compacte pour l'historique.
 * La structure reprend le runtime : boîtes de 10, séparation forte au 5,
 * croix aux positions 3 et 8. Bleu = cible à lire ; vert/rouge = correction.
 */
export function renderPicbilleHistoryCorrectionSvg(rawCell = {}) {
  const boxCount = clampInt(rawCell.boxCount, 2, 5, 5);
  const startValue = clampInt(rawCell.startValue, 0, 100, 1);
  const maxIndex = (boxCount * 10) - 1;
  const targetIndexRaw = Number(rawCell.targetIndex);
  const studentIndexRaw = Number(rawCell.studentIndex);
  const targetIndex = Number.isInteger(targetIndexRaw)
    ? Math.max(0, Math.min(maxIndex, targetIndexRaw))
    : null;
  const studentIndex = Number.isInteger(studentIndexRaw)
    ? Math.max(0, Math.min(maxIndex, studentIndexRaw))
    : null;
  const questionType = String(rawCell.questionType || "") === "graduationToNumber"
    ? "graduationToNumber"
    : "numberToGraduation";
  const targetValue = formatNumericLabel(rawCell.targetValue);
  const studentValue = String(rawCell.studentValue ?? "").trim();
  const correct = rawCell.correct === true;

  const cellWidth = 20;
  const cellHeight = 28;
  const boxGap = 10;
  const left = 14;
  const top = 22;
  const boxWidth = cellWidth * 10;
  const stripWidth = (boxCount * boxWidth) + ((boxCount - 1) * boxGap);
  const width = stripWidth + (left * 2);
  const height = 108;

  const boxX = (boxIndex) => left + (boxIndex * (boxWidth + boxGap));
  const cellCenterX = (index) => {
    const safeIndex = Math.max(0, Math.min(maxIndex, Number(index) || 0));
    const boxIndex = Math.floor(safeIndex / 10);
    const cellIndex = safeIndex % 10;
    return boxX(boxIndex) + (cellIndex * cellWidth) + (cellWidth / 2);
  };

  let strip = "";
  for (let boxIndex = 0; boxIndex < boxCount; boxIndex += 1) {
    const x0 = boxX(boxIndex);
    strip += `<rect x="${x0}" y="${top}" width="${boxWidth}" height="${cellHeight}" fill="#bda77a" fill-opacity=".16" stroke="#d9c79e" stroke-width="1.3"/>`;

    const targetBelongsHere = questionType === "graduationToNumber"
      && targetIndex != null
      && Math.floor(targetIndex / 10) === boxIndex;
    if (targetBelongsHere) {
      strip += `<circle cx="${round(cellCenterX(targetIndex))}" cy="${round(top + (cellHeight / 2))}" r="8.4" fill="#2d9cff" fill-opacity=".9"/>`;
    }

    for (let cell = 1; cell < 10; cell += 1) {
      const x = x0 + (cell * cellWidth);
      strip += `<line x1="${x}" y1="${top}" x2="${x}" y2="${top + cellHeight}" stroke="#e6dcc4" stroke-width="${cell === 5 ? 2.2 : 1}"/>`;
    }

    // Repères Picbille : croix sur les 3e et 8e cases de chaque boîte.
    [2, 7].forEach((cellIndex) => {
      const absoluteIndex = (boxIndex * 10) + cellIndex;
      const cx = cellCenterX(absoluteIndex);
      const cy = top + (cellHeight / 2);
      const d = 4.1;
      const stroke = targetBelongsHere && absoluteIndex === targetIndex ? "#f6efdf" : "#bfae88";
      strip += `<line x1="${round(cx - d)}" y1="${round(cy - d)}" x2="${round(cx + d)}" y2="${round(cy + d)}" stroke="${stroke}" stroke-width="1.2"/>`;
      strip += `<line x1="${round(cx + d)}" y1="${round(cy - d)}" x2="${round(cx - d)}" y2="${round(cy + d)}" stroke="${stroke}" stroke-width="1.2"/>`;
    });
  }

  // Le runtime n'affiche le nombre que dans la première case visible.
  const startColor = questionType === "graduationToNumber" && targetIndex === 0 ? "#fff" : "#f1f4f8";
  strip += `<text x="${round(cellCenterX(0))}" y="${top + 19}" text-anchor="middle" font-family="Andika, system-ui, sans-serif" font-size="13.5" font-weight="700" fill="${startColor}">${escapeXml(startValue)}</text>`;

  let correction = "";
  if (questionType === "numberToGraduation") {
    if (correct && targetIndex != null) {
      correction += renderPicbilleInlinePointer(cellCenterX(targetIndex), top + cellHeight, "#55c878", "✓", false, 0);
    } else {
      if (studentIndex != null) {
        correction += renderPicbilleInlinePointer(cellCenterX(studentIndex), top + cellHeight, "#ff6b6b", "Élève", false, 0);
      }
      if (targetIndex != null) {
        const close = studentIndex != null && Math.abs(studentIndex - targetIndex) <= 3;
        correction += renderPicbilleInlinePointer(cellCenterX(targetIndex), top + cellHeight, "#55c878", "Attendu", true, close ? 1 : 0);
      }
    }
  } else if (targetIndex != null) {
    const centerX = Math.max(80, Math.min(width - 80, cellCenterX(targetIndex)));
    if (correct) {
      correction += `<text x="${round(centerX)}" y="82" text-anchor="middle" font-family="Andika, system-ui, sans-serif" font-size="13.5" font-weight="700" fill="#55c878">${escapeXml(studentValue || targetValue)} ✓</text>`;
    } else {
      correction += `<text x="${round(centerX - 9)}" y="82" text-anchor="end" font-family="Andika, system-ui, sans-serif" font-size="13" font-weight="700" fill="#ff6b6b">${escapeXml(studentValue || "—")}</text>`;
      correction += `<text x="${round(centerX)}" y="82" text-anchor="middle" font-family="Andika, system-ui, sans-serif" font-size="13.5" font-weight="700" fill="#9aa3af">→</text>`;
      correction += `<text x="${round(centerX + 9)}" y="82" text-anchor="start" font-family="Andika, system-ui, sans-serif" font-size="13" font-weight="700" fill="#55c878">${escapeXml(targetValue || "—")}</text>`;
    }
  }

  const maxWidth = Math.min(920, Math.round(width * 1.2));
  const minWidth = Math.min(360, Math.max(210, Math.round(width * .68)));
  return `<svg class="dashboard-history-picbille-inline-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Correction sur frise Picbille" style="display:block;width:100%;max-width:${maxWidth}px;min-width:${minWidth}px;height:auto;overflow:visible;background:transparent">${strip}${correction}</svg>`;
}

function renderPicbilleInlinePointer(x, stripBottom, color, label, dashed = false, lane = 0) {
  const apexY = stripBottom + 4 + (lane * 12);
  const dash = dashed ? ' stroke-dasharray="4 3"' : "";
  return `<g><path d="M ${round(x)} ${apexY} L ${round(x - 4.8)} ${apexY + 7.5} L ${round(x + 4.8)} ${apexY + 7.5} Z" fill="${color}"/><line x1="${round(x)}" y1="${apexY + 7.5}" x2="${round(x)}" y2="${apexY + 14}" stroke="${color}" stroke-width="1.7"${dash}/><text x="${round(x)}" y="${apexY + 27}" text-anchor="middle" font-family="Andika, system-ui, sans-serif" font-size="11.5" font-weight="700" fill="${color}">${escapeXml(label)}</text></g>`;
}
