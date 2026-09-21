const PDFJS_VERSION = "4.10.38";
const PDFJS_BASE_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}`;
const PDFJS_MODULE_URL = `${PDFJS_BASE_URL}/legacy/build/pdf.min.mjs`;
const PDFJS_WORKER_URL = `${PDFJS_BASE_URL}/legacy/build/pdf.worker.min.mjs`;
const PDFJS_CMAP_URL = `${PDFJS_BASE_URL}/cmaps/`;
const PDFJS_STANDARD_FONTS_URL = `${PDFJS_BASE_URL}/standard_fonts/`;

let pdfJsPromise = null;
const documentCache = new Map();

export async function loadPdfJs(){
  if (!pdfJsPromise) {
    pdfJsPromise = import(PDFJS_MODULE_URL).then((pdfjs) => {
      if (pdfjs?.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      return pdfjs;
    });
  }
  return pdfJsPromise;
}

async function fetchPdfBytes(source){
  const safeSource = String(source || "").trim();
  if (!safeSource) throw new Error("Aucun PDF à charger.");
  const response = await fetch(safeSource);
  if (!response.ok) throw new Error(`Impossible de charger le PDF (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function getPdfDocument(source){
  const safeSource = String(source || "").trim();
  if (!safeSource) throw new Error("Aucun PDF à charger.");
  if (documentCache.has(safeSource)) return documentCache.get(safeSource);

  const promise = (async () => {
    const pdfjs = await loadPdfJs();
    const data = await fetchPdfBytes(safeSource);
    const loadingTask = pdfjs.getDocument({
      data,
      cMapUrl: PDFJS_CMAP_URL,
      cMapPacked: true,
      standardFontDataUrl: PDFJS_STANDARD_FONTS_URL
    });
    return loadingTask.promise;
  })();

  documentCache.set(safeSource, promise);
  try {
    return await promise;
  } catch (error) {
    documentCache.delete(safeSource);
    throw error;
  }
}

export function forgetPdfDocument(source){
  documentCache.delete(String(source || "").trim());
}

export async function inspectPdfDocument(source){
  const document = await getPdfDocument(source);
  let title = "";
  try {
    const metadata = await document.getMetadata();
    title = String(metadata?.info?.Title || "").trim();
  } catch {}
  return {
    pageCount: Math.max(1, Number(document.numPages) || 1),
    title
  };
}

export async function getPdfPageInfo(document, pageNumber){
  const safePage = Math.max(1, Math.min(Number(document?.numPages) || 1, Math.trunc(Number(pageNumber) || 1)));
  const page = await document.getPage(safePage);
  const viewport = page.getViewport({ scale: 1 });
  return {
    page,
    pageNumber: safePage,
    width: Math.max(1, Number(viewport.width) || 1),
    height: Math.max(1, Number(viewport.height) || 1)
  };
}

export async function renderPdfPage({ page, canvas, cssWidth, cssHeight, signalToken } = {}){
  if (!page || !canvas) return null;
  const baseViewport = page.getViewport({ scale: 1 });
  const dpr = Math.max(1, Math.min(3, Number(window.devicePixelRatio) || 1));
  const targetWidth = Math.max(1, Number(cssWidth) || baseViewport.width);
  const targetHeight = Math.max(1, Number(cssHeight) || baseViewport.height);
  const scale = Math.max(
    (targetWidth * dpr) / Math.max(1, baseViewport.width),
    (targetHeight * dpr) / Math.max(1, baseViewport.height),
    0.1
  );
  const viewport = page.getViewport({ scale });
  const width = Math.max(1, Math.ceil(viewport.width));
  const height = Math.max(1, Math.ceil(viewport.height));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  canvas.style.width = "100%";
  canvas.style.height = "100%";

  const context = canvas.getContext("2d", { alpha: true });
  context.clearRect(0, 0, width, height);
  const renderTask = page.render({ canvasContext: context, viewport });
  if (signalToken) signalToken.renderTask = renderTask;
  await renderTask.promise;
  return { width, height };
}
