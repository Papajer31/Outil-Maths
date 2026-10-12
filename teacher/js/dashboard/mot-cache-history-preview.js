/** Aperçu de Mot caché, construit avec le même repère de cases que le runtime. */
export function getMotCacheHistoryDialogSize(preview = {}, { maxWidth = 1100, maxHeight = 620 } = {}) {
  const cols = clampInt(preview.columnCount, 1, 32, 8);
  const rows = clampInt(preview.rowCount, 1, 5, 3);
  const contentWidth = cols * 64 + (cols - 1) * 6 + 36;
  const contentHeight = rows * 64 + (rows - 1) * 6 + 36;
  const scale = Math.min(1, Math.max(0.1, maxWidth / contentWidth), Math.max(0.1, maxHeight / contentHeight));
  return { width: Math.round(contentWidth * scale), height: Math.round(contentHeight * scale) };
}

export function createMotCacheHistoryPreviewUrl(raw = {}) {
  return URL.createObjectURL(new Blob([renderMotCacheHistoryPreviewSvg(raw)], {
    type: "image/svg+xml;charset=utf-8"
  }));
}

export function renderMotCacheHistoryPreviewSvg(raw = {}) {
  const rows = clampInt(raw.rowCount, 1, 5, 3);
  const cols = clampInt(raw.columnCount, 1, 32, 8);
  const cellSize = 64;
  const gap = 6;
  const padding = 18;
  const width = 2 * padding + cols * cellSize + (cols - 1) * gap;
  const height = 2 * padding + rows * cellSize + (rows - 1) * gap;
  const letters = Array.isArray(raw.letters) ? raw.letters : [];
  const selectionMode = raw.view === "selection";
  const selected = new Set(selectionMode && Array.isArray(raw.selectedIndices) ? raw.selectedIndices.map(Number) : []);
  const expected = new Set(selectionMode && Array.isArray(raw.expectedIndices) ? raw.expectedIndices.map(Number) : []);
  const cells = [];

  for (let index = 0; index < rows * cols; index += 1) {
    const x = padding + (index % cols) * (cellSize + gap);
    const y = padding + Math.floor(index / cols) * (cellSize + gap);
    const isSelected = selected.has(index);
    const isExpected = expected.has(index);
    let border = "#cbd5e1";
    let background = "#ffffff";
    let color = "#111827";
    let dash = "";
    if (selectionMode && isSelected && isExpected) {
      border = "#22a753"; background = "#dff7e6"; color = "#14532d";
    } else if (selectionMode && isSelected) {
      border = "#e34855"; background = "#fde5e7"; color = "#7f1d1d";
    } else if (selectionMode && isExpected) {
      border = "#22a753"; background = "#f0fdf4"; color = "#14532d"; dash = ' stroke-dasharray="7 5"';
    }
    const letter = escapeSvg(String(letters[index] ?? ""));
    cells.push(`<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="11" fill="${background}" stroke="${border}" stroke-width="${selectionMode && (isSelected || isExpected) ? 3 : 2}"${dash}/>`);
    cells.push(`<text x="${x + cellSize / 2}" y="${y + cellSize / 2 + 1}" fill="${color}" font-family="Andika,system-ui,sans-serif" font-size="35" font-weight="800" text-anchor="middle" dominant-baseline="central">${letter}</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${selectionMode ? "Sélection de l’élève et correction" : "Grille proposée à l’élève"}"><rect width="${width}" height="${height}" fill="#f8fafc"/>${cells.join("")}</svg>`;
}

function clampInt(raw, min, max, fallback) {
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}
function escapeSvg(raw) {
  return String(raw).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}
