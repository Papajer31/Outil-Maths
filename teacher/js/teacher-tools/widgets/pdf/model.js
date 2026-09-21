import { normalizeAnnotationState } from "../../surface/annotations.js";
import { normalizeSurfaceState } from "../../surface/state.js";

export const PDF_ZOOM_MIN = 0.25;
export const PDF_ZOOM_MAX = 4;
export const PDF_ZOOM_STEP = 0.15;

const ownedPdfObjectUrls = new Map();

function clamp(value, min, max){
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function round(value, digits = 4){
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

export function normalizePdfZoom(value){
  const number = Number(value);
  return round(clamp(Number.isFinite(number) ? number : 1, PDF_ZOOM_MIN, PDF_ZOOM_MAX), 2);
}

export function normalizePdfPosition(value){
  const number = Number(value);
  return round(clamp(Number.isFinite(number) ? number : 0, -1, 1), 4);
}

function normalizePdfSource(value){
  return String(value || "").trim();
}

function isPdfBlob(value){
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function createPdfObjectUrl(blob){
  if (!isPdfBlob(blob) || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return "";
  const source = URL.createObjectURL(blob);
  ownedPdfObjectUrls.set(source, 1);
  return source;
}

function retainPdfObjectUrl(source){
  if (!source || !ownedPdfObjectUrls.has(source)) return;
  ownedPdfObjectUrls.set(source, ownedPdfObjectUrls.get(source) + 1);
}

function releasePdfObjectUrl(source){
  if (!source || !ownedPdfObjectUrls.has(source)) return;
  const count = Math.max(0, ownedPdfObjectUrls.get(source) - 1);
  if (count > 0) {
    ownedPdfObjectUrls.set(source, count);
    return;
  }
  ownedPdfObjectUrls.delete(source);
  try { URL.revokeObjectURL(source); } catch {}
}

function normalizePageView(raw = {}){
  const zoom = normalizePdfZoom(raw.zoom);
  return {
    zoom,
    positionX: zoom === 1 ? 0 : normalizePdfPosition(raw.positionX),
    positionY: zoom === 1 ? 0 : normalizePdfPosition(raw.positionY)
  };
}

function normalizePageViews(raw = {}){
  const result = {};
  if (!raw || typeof raw !== "object") return result;
  Object.entries(raw).forEach(([key, value]) => {
    const pageNumber = Math.max(1, Math.trunc(Number(key) || 0));
    if (!pageNumber) return;
    result[String(pageNumber)] = normalizePageView(value);
  });
  return result;
}

function normalizeAnnotationSnapshot(raw = {}){
  const annotations = normalizeAnnotationState(raw);
  return { strokes: annotations.strokes, history: annotations.history };
}

function normalizePageAnnotations(raw = {}){
  const result = {};
  if (!raw || typeof raw !== "object") return result;
  Object.entries(raw).forEach(([key, value]) => {
    const pageNumber = Math.max(1, Math.trunc(Number(key) || 0));
    if (!pageNumber) return;
    result[String(pageNumber)] = normalizeAnnotationSnapshot(value);
  });
  return result;
}

export function normalizePdfState(rawState = {}){
  const source = normalizePdfSource(rawState.source);
  const pageCount = Math.max(0, Math.trunc(Number(rawState.pageCount) || 0));
  const maxPage = Math.max(1, pageCount || 1);
  const currentPage = clamp(Math.trunc(Number(rawState.currentPage) || 1), 1, maxPage);
  return {
    source,
    sourceKind: ["file", "url"].includes(String(rawState.sourceKind || "").trim()) ? String(rawState.sourceKind).trim() : "",
    pdfName: String(rawState.pdfName || "").trim(),
    title: String(rawState.title || "").trim(),
    pageCount,
    currentPage,
    pageViews: normalizePageViews(rawState.pageViews),
    pageAnnotations: normalizePageAnnotations(rawState.pageAnnotations),
    loadError: String(rawState.loadError || "").trim(),
    updatedAt: Math.max(0, Math.trunc(Number(rawState.updatedAt) || 0))
  };
}

export function createInitialPdfState(){
  return normalizePdfState();
}

export function createPdfProjectorState({ state } = {}){
  return normalizePdfState(state);
}

export function clonePdfState(rawState = {}){
  const state = normalizePdfState(rawState);
  retainPdfObjectUrl(state.source);
  return state;
}

export function disposePdfState(rawState = {}){
  const state = normalizePdfState(rawState);
  releasePdfObjectUrl(state.source);
}

export function getCurrentPdfView(rawState = {}){
  const state = normalizePdfState(rawState);
  return normalizePageView(state.pageViews[String(state.currentPage)] || {});
}

function patchCurrentView(state, patch = {}){
  const pageKey = String(state.currentPage);
  const current = getCurrentPdfView(state);
  const next = normalizePageView({ ...current, ...patch });
  return { ...state, pageViews: { ...state.pageViews, [pageKey]: next } };
}

function snapshotCurrentAnnotations(state, surface){
  const safeSurface = normalizeSurfaceState(surface);
  return {
    ...state,
    pageAnnotations: {
      ...state.pageAnnotations,
      [String(state.currentPage)]: normalizeAnnotationSnapshot(safeSurface.annotations)
    }
  };
}

function surfaceForPage(surface, state, targetPage){
  const safeSurface = normalizeSurfaceState(surface);
  const snapshot = state.pageAnnotations[String(targetPage)] || { strokes: [], history: [] };
  return normalizeSurfaceState({
    ...safeSurface,
    annotations: {
      ...safeSurface.annotations,
      strokes: snapshot.strokes || [],
      history: snapshot.history || []
    }
  });
}

export function applyPdfAction({ action, payload = {}, state, page } = {}){
  const safeAction = String(action || "").trim();
  let current = normalizePdfState(state);

  if (safeAction === "set-pdf") {
    const localBlob = isPdfBlob(payload?.blob);
    const source = localBlob ? createPdfObjectUrl(payload.blob) : normalizePdfSource(payload?.source);
    if (!source) return { error: "Aucun PDF à charger." };
    releasePdfObjectUrl(current.source);
    return {
      patch: {
        state: normalizePdfState({
          source,
          sourceKind: localBlob ? "file" : (["file", "url"].includes(String(payload?.sourceKind || "")) ? payload.sourceKind : "url"),
          pdfName: String(payload?.pdfName || "Document.pdf").trim(),
          pageCount: 0,
          currentPage: 1,
          pageViews: {},
          pageAnnotations: {},
          loadError: "",
          updatedAt: Date.now()
        }),
        surface: page?.surface ? surfaceForPage(page.surface, createInitialPdfState(), 1) : undefined
      }
    };
  }

  if (safeAction === "clear-pdf") {
    releasePdfObjectUrl(current.source);
    return {
      patch: {
        state: createInitialPdfState(),
        surface: page?.surface ? surfaceForPage(page.surface, createInitialPdfState(), 1) : undefined
      }
    };
  }

  if (safeAction === "set-load-error") {
    return { patch: { state: normalizePdfState({ ...current, loadError: String(payload?.message || "Impossible de charger le PDF."), updatedAt: Date.now() }) } };
  }

  if (safeAction === "set-document-info") {
    return {
      patch: {
        state: normalizePdfState({
          ...current,
          pageCount: Math.max(1, Math.trunc(Number(payload?.pageCount) || 1)),
          title: String(payload?.title || current.title || "").trim(),
          loadError: "",
          updatedAt: Date.now()
        })
      }
    };
  }

  if (!current.source) return null;

  if (safeAction === "adjust-zoom") {
    const view = getCurrentPdfView(current);
    const nextZoom = normalizePdfZoom(view.zoom + (Number(payload?.delta) || 0));
    current = patchCurrentView(current, {
      zoom: nextZoom,
      positionX: nextZoom === 1 ? 0 : view.positionX,
      positionY: nextZoom === 1 ? 0 : view.positionY
    });
    return { patch: { state: normalizePdfState({ ...current, updatedAt: Date.now() }) } };
  }

  if (safeAction === "center") {
    current = patchCurrentView(current, { zoom: 1, positionX: 0, positionY: 0 });
    return { patch: { state: normalizePdfState({ ...current, loadError: "", updatedAt: Date.now() }) } };
  }

  if (safeAction === "set-position") {
    const view = getCurrentPdfView(current);
    current = patchCurrentView(current, {
      positionX: view.zoom === 1 ? 0 : normalizePdfPosition(payload?.positionX),
      positionY: view.zoom === 1 ? 0 : normalizePdfPosition(payload?.positionY)
    });
    return { patch: { state: normalizePdfState({ ...current, updatedAt: Date.now() }) } };
  }

  if (["previous-page", "next-page", "set-page"].includes(safeAction)) {
    const pageCount = Math.max(1, current.pageCount || 1);
    let target = current.currentPage;
    if (safeAction === "previous-page") target -= 1;
    if (safeAction === "next-page") target += 1;
    if (safeAction === "set-page") target = Math.trunc(Number(payload?.pageNumber) || current.currentPage);
    target = clamp(target, 1, pageCount);
    if (target === current.currentPage) return null;

    if (page?.surface) current = snapshotCurrentAnnotations(current, page.surface);
    const nextState = normalizePdfState({ ...current, currentPage: target, updatedAt: Date.now() });
    return {
      patch: {
        state: nextState,
        surface: page?.surface ? surfaceForPage(page.surface, nextState, target) : undefined
      }
    };
  }

  return null;
}

export function onPdfSurfaceAction({ state, surface } = {}){
  const current = normalizePdfState(state);
  if (!current.source) return null;
  const nextState = snapshotCurrentAnnotations(current, surface);
  return { state: normalizePdfState(nextState) };
}
