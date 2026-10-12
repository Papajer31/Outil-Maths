const CHARACTER_URLS = Object.freeze({
  "images-comparaison-minibille": new URL("../../../shared/tool-assets/personnages/Minibille.webp", import.meta.url).href,
  "images-comparaison-maxibille": new URL("../../../shared/tool-assets/personnages/Maxibille.webp", import.meta.url).href,
  "images-personnages-mathieu": new URL("../../../shared/tool-assets/personnages/Mathieu.webp", import.meta.url).href,
  "images-personnages-mathilde": new URL("../../../shared/tool-assets/personnages/Mathilde.webp", import.meta.url).href
});

const RUNTIME_BACKGROUND = "#0c0e13";
const TOKEN_FILL = "#4b82df";
const TOKEN_STROKE = "#1f4ec7";
const TRACE_COLOR = "#f59e0b";

const embeddedAssetCache = new Map();

export async function createCollectionTracePreviewUrl(rawPreview = {}) {
  const preview = normalizePreview(rawPreview);
  if (!preview) return "";
  const embeddedAssets = await loadPreviewCharacterAssets(preview);
  const svg = renderPreviewSvg(preview, embeddedAssets);
  if (!svg) return "";
  return URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
}

async function loadPreviewCharacterAssets(preview) {
  const result = {};
  await Promise.all(["small", "big"].map(async (role) => {
    const assetId = preview[`${role}AssetId`];
    const url = CHARACTER_URLS[assetId] || "";
    if (!url) return;
    result[role] = await loadAssetAsDataUrl(url);
  }));
  return result;
}

async function loadAssetAsDataUrl(url) {
  if (!url) return "";
  if (!embeddedAssetCache.has(url)) {
    embeddedAssetCache.set(url, (async () => {
      try {
        const response = await fetch(url, { credentials: "same-origin" });
        if (!response.ok) return "";
        const blob = await response.blob();
        return await blobToDataUrl(blob);
      } catch {
        return "";
      }
    })());
  }
  return embeddedAssetCache.get(url);
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => resolve("");
    reader.readAsDataURL(blob);
  });
}

function normalizePreview(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (String(value.type || "").trim().toLowerCase() !== "collection-trace") return null;
  const aspect = clamp(Number(value.aspect) || 2.2, .8, 4);
  const characters = value.characters && typeof value.characters === "object" ? value.characters : {};
  const tokens = value.tokens && typeof value.tokens === "object" ? value.tokens : {};
  return {
    aspect,
    smallAssetId: String(value.smallAssetId || ""),
    bigAssetId: String(value.bigAssetId || ""),
    smallCount: clampInt(value.smallCount, 0, 10),
    bigCount: clampInt(value.bigCount, 0, 10),
    characters: {
      small: normalizeRect(characters.small),
      big: normalizeRect(characters.big)
    },
    tokens: {
      small: normalizeTokens(tokens.small),
      big: normalizeTokens(tokens.big)
    },
    strokes: normalizeStrokes(value.strokes),
    links: normalizeLinks(value.links)
  };
}

function renderPreviewSvg(preview, embeddedAssets = {}) {
  const width = 1200;
  const height = width / preview.aspect;
  const geometry = buildGeometry(preview, width, height);
  const crop = computeCrop(geometry, width, height);

  const characterMarkup = ["small", "big"].map((role) => {
    const rect = geometry.characters[role];
    if (!rect) return "";
    const href = String(embeddedAssets[role] || "");
    if (!href) return renderCharacterPlaceholder(rect, role === "small" ? "P" : "G");
    return `<image href="${escapeXml(href)}" x="${round(rect.x)}" y="${round(rect.y)}" width="${round(rect.w)}" height="${round(rect.h)}" preserveAspectRatio="xMidYMid meet"/>`;
  }).join("");

  const tokenMarkup = ["small", "big"].flatMap((role) => geometry.tokens[role].map((token) => (
    `<circle cx="${round(token.x)}" cy="${round(token.y)}" r="${round(token.r)}" fill="${TOKEN_FILL}" stroke="${TOKEN_STROKE}" stroke-width="${round(Math.max(2.2, token.r * .14))}"/>`
  ))).join("");

  const linkMarkup = geometry.links.map((link) => (
    `<line x1="${round(link.a.x)}" y1="${round(link.a.y)}" x2="${round(link.b.x)}" y2="${round(link.b.y)}" stroke="${TRACE_COLOR}" stroke-opacity=".82" stroke-width="${round(Math.max(6, width * .0055))}" stroke-linecap="round"/>`
  )).join("");

  const strokeMarkup = geometry.strokes.map((stroke) => {
    if (stroke.length < 2) return "";
    const d = buildSmoothPath(stroke);
    return `<path d="${d}" fill="none" stroke="${TRACE_COLOR}" stroke-opacity=".78" stroke-width="${round(Math.max(6, width * .006))}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${round(crop.x)} ${round(crop.y)} ${round(crop.w)} ${round(crop.h)}" preserveAspectRatio="xMidYMid meet"><rect x="${round(crop.x)}" y="${round(crop.y)}" width="${round(crop.w)}" height="${round(crop.h)}" fill="${RUNTIME_BACKGROUND}"/>${characterMarkup}${tokenMarkup}${linkMarkup}${strokeMarkup}</svg>`;
}

function buildGeometry(preview, width, height) {
  const characters = {};
  ["small", "big"].forEach((role) => {
    const rect = preview.characters[role];
    if (rect) {
      characters[role] = {
        x: rect.x * width,
        y: rect.y * height,
        w: rect.w * width,
        h: rect.h * height
      };
    }
  });

  const fallbackCharacterSize = Math.min(height * .28, width * .16);
  if (!characters.big) characters.big = { x: width * .16, y: height * .18, w: fallbackCharacterSize, h: fallbackCharacterSize };
  if (!characters.small) characters.small = { x: width * .16, y: height * .58, w: fallbackCharacterSize, h: fallbackCharacterSize };

  const tokens = {};
  ["small", "big"].forEach((role) => {
    tokens[role] = preview.tokens[role].map((token) => ({
      x: token.x * width,
      y: token.y * height,
      r: token.r * Math.min(width, height)
    }));
  });
  if (!tokens.big.length) tokens.big = fallbackTokens(preview.bigCount, width * .47, height * .31, width, height);
  if (!tokens.small.length) tokens.small = fallbackTokens(preview.smallCount, width * .47, height * .70, width, height);

  const strokes = preview.strokes.map((stroke) => stroke.map((point) => ({ x: point.x * width, y: point.y * height })));
  const links = preview.links.map((link) => ({
    a: { x: link.a.x * width, y: link.a.y * height },
    b: { x: link.b.x * width, y: link.b.y * height }
  }));
  return { characters, tokens, strokes, links };
}

function fallbackTokens(count, startX, y, width, height) {
  const radius = Math.min(width, height) * .026;
  const gap = radius * .42;
  const groupGap = radius * 1.15;
  const items = [];
  let x = startX;
  for (let index = 0; index < count; index += 1) {
    items.push({ x, y, r: radius });
    x += radius * 2 + gap + ((index + 1) % 5 === 0 && index + 1 < count ? groupGap : 0);
  }
  return items;
}

function computeCrop(geometry, width, height) {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  const includePoint = (x, y, pad = 0) => {
    left = Math.min(left, x - pad);
    top = Math.min(top, y - pad);
    right = Math.max(right, x + pad);
    bottom = Math.max(bottom, y + pad);
  };

  Object.values(geometry.characters).forEach((rect) => {
    if (!rect) return;
    includePoint(rect.x, rect.y);
    includePoint(rect.x + rect.w, rect.y + rect.h);
  });
  Object.values(geometry.tokens).flat().forEach((token) => includePoint(token.x, token.y, token.r));
  geometry.strokes.flat().forEach((point) => includePoint(point.x, point.y, 8));
  geometry.links.forEach((link) => { includePoint(link.a.x, link.a.y, 8); includePoint(link.b.x, link.b.y, 8); });

  if (!Number.isFinite(left)) return { x: 0, y: 0, w: width, h: height };
  const margin = Math.max(22, Math.min(width, height) * .045);
  left = clamp(left - margin, 0, width);
  top = clamp(top - margin, 0, height);
  right = clamp(right + margin, 0, width);
  bottom = clamp(bottom + margin, 0, height);
  return { x: left, y: top, w: Math.max(1, right - left), h: Math.max(1, bottom - top) };
}

function buildSmoothPath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${round(points[0].x)} ${round(points[0].y)}`;
  let d = `M ${round(points[0].x)} ${round(points[0].y)}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const midX = (previous.x + current.x) / 2;
    const midY = (previous.y + current.y) / 2;
    d += ` Q ${round(previous.x)} ${round(previous.y)} ${round(midX)} ${round(midY)}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${round(last.x)} ${round(last.y)}`;
}

function renderCharacterPlaceholder(rect, label) {
  const radius = Math.min(rect.w, rect.h) / 2;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(radius)}" fill="rgba(255,255,255,.16)" stroke="rgba(255,255,255,.55)" stroke-width="3"/><text x="${round(cx)}" y="${round(cy)}" dominant-baseline="middle" text-anchor="middle" fill="#fff" font-family="Andika,system-ui,sans-serif" font-size="${round(radius * .62)}" font-weight="800">${escapeXml(label)}</text>`;
}

function normalizeRect(value) {
  if (!value || typeof value !== "object") return null;
  return { x: unit(value.x), y: unit(value.y), w: Math.max(0, unit(value.w)), h: Math.max(0, unit(value.h)) };
}

function normalizeTokens(value) {
  return (Array.isArray(value) ? value : []).slice(0, 10).map((token) => ({
    x: unit(token?.x),
    y: unit(token?.y),
    r: clamp(Math.abs(Number(token?.r) || .02), .001, .08)
  }));
}

function normalizeStrokes(value) {
  return (Array.isArray(value) ? value : []).slice(0, 14).map((stroke) => (
    (Array.isArray(stroke) ? stroke : []).slice(0, 64).map((point) => ({ x: unit(point?.x), y: unit(point?.y) }))
  )).filter((stroke) => stroke.length > 1);
}

function normalizeLinks(value) {
  return (Array.isArray(value) ? value : []).slice(0, 20).map((link) => {
    if (!link?.a || !link?.b) return null;
    return { a: { x: unit(link.a.x), y: unit(link.a.y) }, b: { x: unit(link.b.x), y: unit(link.b.y) } };
  }).filter(Boolean);
}

function unit(value) {
  return clamp(Number(value) || 0, -.05, 1.05);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.trunc(number))) : min;
}

function round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
