import { buildGraduationPath, getSegmentsBounds } from "../../../tools/m-millimetre/drawing.js";

// Le cadrage suit le tracé, et non la grande zone de travail du runtime.
// 14 px gardent visibles les graduations (2,5 px), sans bordure excessive.
const TRACE_MARGIN = 14;

function getTraceFrame(raw) {
  if (raw?.type !== "millimetre" || !Array.isArray(raw.segments)) return null;
  const segments = raw.segments.slice(0, 120).filter(validSegment);
  if (!segments.length) return null;
  return { segments, ...getSegmentsBounds(segments, { padding: TRACE_MARGIN }) };
}

/** Dimensions du dialog commun, dans les deux vues d'historique. */
export function getMillimetreHistoryDialogSize(raw, { maxWidth = 1100, maxHeight = 620 } = {}) {
  const availableWidth = Math.max(1, Math.min(1100, Number(maxWidth) || 1100));
  const availableHeight = Math.max(1, Math.min(620, Number(maxHeight) || 620));
  const frame = getTraceFrame(raw);
  if (!frame) return {
    width: Math.min(560, availableWidth), height: Math.min(260, availableHeight)
  };

  // On conserve le rapport largeur/hauteur du dessin et on évite d'agrandir
  // indéfiniment une minuscule longueur (notamment les unités).
  const longestSide = Math.max(frame.width, frame.height);
  const desiredLongestSide = Math.min(1000, Math.max(320, longestSide * 1.25));
  const scale = Math.min(3, desiredLongestSide / longestSide,
    availableWidth / frame.width, availableHeight / frame.height);
  return {
    width: Math.min(availableWidth, Math.max(Math.min(96, availableWidth), Math.ceil(frame.width * scale))),
    height: Math.min(availableHeight, Math.max(Math.min(72, availableHeight), Math.ceil(frame.height * scale)))
  };
}

/**
 * URL d'aperçu compatible avec les autres aperçus de l'historique
 * (droite numérique, collection, représentation décimale).
 * L'appelant révoque l'URL à la fermeture du dialog.
 */
export async function createMillimetreHistoryPreviewUrl(raw = {}) {
  // Le dialog doit rester ouvrable même pour une ancienne réponse dont le
  // tracé n'a pas été sauvegardé : jamais de clic sans effet.
  const svg = renderMillimetreHistoryPreviewSvg(raw) || `<svg xmlns="http://www.w3.org/2000/svg" width="980" height="430" viewBox="0 0 980 430"><rect width="980" height="430" fill="#fff"/><text x="490" y="215" fill="#202124" font-family="system-ui, sans-serif" font-size="24" text-anchor="middle">Aucun tracé enregistré pour cette question.</text></svg>`;
  return URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
}

export function renderMillimetreHistoryPreviewSvg(raw = {}) {
  const frame = getTraceFrame(raw);
  if (!frame) return "";
  const { segments, x, y, width, height } = frame;

  const markup = segments.map((segment) => {
    const x1 = segment.start.x, y1 = segment.start.y;
    const x2 = segment.end.x, y2 = segment.end.y;
    return `<g><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#202124" stroke-width="1.8" stroke-linecap="round"/><path d="${buildGraduationPath(segment)}" stroke="#202124" stroke-width="1.2" fill="none" stroke-linecap="round"/></g>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${raw.mode === "build" ? "Construction de l'élève" : "Mesure proposée"}" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:100%;background:#fff"><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#fff"/>${markup}</svg>`;
}

function validSegment(s) {
  return [s?.mm, s?.start?.x, s?.start?.y, s?.end?.x, s?.end?.y]
    .every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 100000)
    && s.mm > 0 && s.mm <= 100;
}
