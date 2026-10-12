/** Aperçu SVG autonome, bâti sur les couleurs et géométries du runtime Points alignés. */
export function createPointsAlignedHistoryPreviewUrl(raw = {}) {
  const svg = renderPointsAlignedHistoryPreviewSvg(raw);
  return URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
}

export function renderPointsAlignedHistoryPreviewSvg(raw = {}) {
  const preview = raw && typeof raw === "object" ? raw : {};
  const width = validSize(preview.width, 1180);
  const height = validSize(preview.height, 650);
  const points = Array.isArray(preview.points) ? preview.points.slice(0, 48) : [];
  if (!points.length) return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#fff"/><text x="${width/2}" y="${height/2}" text-anchor="middle" fill="#334155" font-family="system-ui,sans-serif" font-size="22">Figure non enregistrée pour cette question.</text></svg>`;
  const isSelection = preview.view === "selection";
  const selected = new Set(isSelection && Array.isArray(preview.selectedIds) ? preview.selectedIds.map(String) : []);
  const expected = new Set(isSelection && Array.isArray(preview.expectedIds) ? preview.expectedIds.map(String) : []);

  const studentLines = isSelection ? renderLines(preview.helperLines, width, height, "#334155", 3, .76) : "";
  const solutionLines = isSelection ? renderLines(preview.solutionLines, width, height, "#22c55e", 5, .80) : "";
  const pointMarkup = points.map((rawPoint) => {
    if (!rawPoint || !Number.isFinite(Number(rawPoint.x)) || !Number.isFinite(Number(rawPoint.y))) return "";
    const id = String(rawPoint.id || "");
    const isReference = rawPoint.selectable === false;
    let cross = isReference ? "#2563eb" : "#18212f";
    let haloStroke = "none", haloFill = "none", haloDash = "";
    if (isSelection && !isReference) {
      const good = expected.has(id), picked = selected.has(id);
      if (good && picked) {
        cross = "#15803d"; haloStroke = "#22c55e"; haloFill = "#dcfce7";
      } else if (good) {
        haloStroke = "#22c55e"; haloFill = "#f0fdf4"; haloDash = 'stroke-dasharray="6 5"';
      } else if (picked) {
        cross = "#b91c1c"; haloStroke = "#ef4444"; haloFill = "#fee2e2";
      }
    }
    const label = String(rawPoint.label || "");
    const labelMarkup = label ? `<text x="18" y="-16" fill="#2563eb" font-family="Andika, system-ui, sans-serif" font-size="28" font-weight="800" paint-order="stroke" stroke="#fff" stroke-width="5" stroke-linejoin="round">${escapeXml(label)}</text>` : "";
    return `<g transform="translate(${bounded(rawPoint.x,0,width)} ${bounded(rawPoint.y,0,height)})">
      <circle cx="0" cy="0" r="20" stroke="${haloStroke}" fill="${haloFill}" stroke-width="4" ${haloDash}/>
      <path d="M-10 0H10M0-10V10" fill="none" stroke="${cross}" stroke-width="${isReference ? 5 : 4.2}" stroke-linecap="round"/>
      ${labelMarkup}
    </g>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${isSelection ? "Sélection et correction des points alignés" : "Figure initiale des points alignés"}">
    <rect x="0" y="0" width="${width}" height="${height}" fill="#fff"/>
    ${studentLines}${solutionLines}${pointMarkup}
  </svg>`;
}

function renderLines(lines, width, height, color, strokeWidth, opacity) {
  return (Array.isArray(lines) ? lines : []).slice(0, 10).map((line) => {
    if (!line) return "";
    const x1 = validLineUnit(line.x1) * width;
    const y1 = validLineUnit(line.y1) * height;
    const x2 = validLineUnit(line.x2) * width;
    const y2 = validLineUnit(line.y2) * height;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" opacity="${opacity}"/>`;
  }).join("");
}

function validLineUnit(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(-0.2, Math.min(1.2, n)) : 0;
}

function validSize(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 100 && n <= 2400 ? n : fallback;
}
function bounded(value, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
}
function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}
