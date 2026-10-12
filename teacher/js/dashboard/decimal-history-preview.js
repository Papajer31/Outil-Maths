const MODEL_LOADERS = Object.freeze({
  picbille: () => import("../../../tools/representation-picbille/model.js"),
  dede: () => import("../../../tools/representation-dede/model.js"),
  blocs_bleus_base10: () => import("../../../tools/representation-carres/model.js"),
  blocs_textuels: () => import("../../../tools/representation-tuiles/model.js")
});

export async function createDecimalHistoryPreviewUrl(rawPreview = {}) {
  const preview = normalizePreview(rawPreview);
  if (!preview) return "";
  const loader = MODEL_LOADERS[preview.themeId];
  if (!loader) return "";

  const model = await loader();
  let svg = "";
  if (preview.mode === "pieces" && preview.items.length) {
    svg = renderPiecesPreviewSvg(model, preview);
  } else if (typeof model.renderRepresentationSvg === "function") {
    svg = model.renderRepresentationSvg(preview.themeId, preview.value, {
      labelMode: preview.labelMode,
      displayBuild: preview.displayBuild,
      allowLooseTens: preview.allowLooseTens
    });
  }
  if (!String(svg || "").trim()) return "";
  return URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
}

function normalizePreview(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (String(value.type || "").trim().toLowerCase() !== "decimal-representation") return null;
  const themeId = String(value.themeId || "").trim();
  if (!MODEL_LOADERS[themeId]) return null;
  const viewport = value.viewport && typeof value.viewport === "object" ? value.viewport : {};
  return {
    type: "decimal-representation",
    mode: String(value.mode || "ordered").trim().toLowerCase() === "pieces" ? "pieces" : "ordered",
    themeId,
    value: Number.isFinite(Number(value.value)) ? Number(value.value) : 0,
    labelMode: String(value.labelMode || "").trim(),
    allowLooseTens: value.allowLooseTens === true,
    displayBuild: value.displayBuild && typeof value.displayBuild === "object" ? value.displayBuild : {},
    viewport: {
      width: clamp(Number(viewport.width) || 720, 80, 2400),
      height: clamp(Number(viewport.height) || 420, 80, 1600)
    },
    items: (Array.isArray(value.items) ? value.items : []).map((item) => ({
      kind: String(item?.kind || "").trim(),
      x: Number(item?.x) || 0,
      y: Number(item?.y) || 0,
      width: Math.max(4, Number(item?.width) || 40),
      height: Math.max(4, Number(item?.height) || 40),
      zIndex: Number(item?.zIndex) || 1
    })).filter((item) => ["hundreds", "tens", "ones"].includes(item.kind))
  };
}

function renderPiecesPreviewSvg(model, preview) {
  if (typeof model.renderRepresentationPieceSvg !== "function") return "";
  const bounds = getPiecesPreviewBounds(preview.items, preview.viewport);
  const pieces = [...preview.items].sort((a, b) => a.zIndex - b.zIndex).map((item) => {
    const markup = model.renderRepresentationPieceSvg(preview.themeId, item.kind, {
      labelMode: preview.labelMode
    });
    return placeSvgMarkup(markup, item);
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${round(bounds.width)}" height="${round(bounds.height)}" viewBox="${round(bounds.x)} ${round(bounds.y)} ${round(bounds.width)} ${round(bounds.height)}"><rect x="${round(bounds.x)}" y="${round(bounds.y)}" width="${round(bounds.width)}" height="${round(bounds.height)}" fill="#fff"/>${pieces}</svg>`;
}

function getPiecesPreviewBounds(items, viewport = {}) {
  const safeItems = Array.isArray(items) ? items : [];
  const viewportWidth = clamp(Number(viewport.width) || 720, 80, 2400);
  const viewportHeight = clamp(Number(viewport.height) || 420, 80, 1600);
  if (!safeItems.length) {
    return { x: 0, y: 0, width: viewportWidth, height: viewportHeight };
  }

  const minX = Math.min(...safeItems.map((item) => Number(item.x) || 0));
  const minY = Math.min(...safeItems.map((item) => Number(item.y) || 0));
  const maxX = Math.max(...safeItems.map((item) => (Number(item.x) || 0) + Math.max(4, Number(item.width) || 40)));
  const maxY = Math.max(...safeItems.map((item) => (Number(item.y) || 0) + Math.max(4, Number(item.height) || 40)));
  const contentWidth = Math.max(1, maxX - minX);
  const contentHeight = Math.max(1, maxY - minY);

  // L'historique doit montrer la construction, pas tout le grand espace de travail.
  // Une marge proportionnelle conserve la respiration visuelle sans rapetisser les pièces.
  const padding = clamp(Math.max(contentWidth, contentHeight) * 0.10, 18, 54);
  let x = minX - padding;
  let y = minY - padding;
  let width = contentWidth + padding * 2;
  let height = contentHeight + padding * 2;

  // Évite qu'une seule petite pièce soit grossie de façon démesurée.
  const minViewWidth = 150;
  const minViewHeight = 150;
  if (width < minViewWidth) {
    x -= (minViewWidth - width) / 2;
    width = minViewWidth;
  }
  if (height < minViewHeight) {
    y -= (minViewHeight - height) / 2;
    height = minViewHeight;
  }

  return { x, y, width, height };
}

function placeSvgMarkup(markup, item) {
  const source = String(markup || "").trim();
  const match = source.match(/^<svg\b([^>]*)>([\s\S]*)<\/svg>$/i);
  if (!match) return "";
  const attrs = match[1] || "";
  const inner = match[2] || "";
  const viewBoxMatch = attrs.match(/\bviewBox\s*=\s*["']([^"']+)["']/i);
  const viewBox = viewBoxMatch ? viewBoxMatch[1] : `0 0 ${Math.max(1, item.width)} ${Math.max(1, item.height)}`;
  return `<svg x="${round(item.x)}" y="${round(item.y)}" width="${round(item.width)}" height="${round(item.height)}" viewBox="${escapeXmlAttr(viewBox)}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
}

function round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeXmlAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
