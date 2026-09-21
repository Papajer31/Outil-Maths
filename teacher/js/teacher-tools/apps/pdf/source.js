export function formatPdfZoom(value){
  return `${Math.round((Number(value) || 1) * 100)} %`;
}

export function normalizePdfUrl(value){
  const source = String(value || "").trim();
  if (!source) return "";
  try {
    const url = new URL(source, location.href);
    if (!["http:", "https:", "blob:"].includes(url.protocol)) return "";
    return url.href;
  } catch {
    return "";
  }
}

export async function preparePdfFilePayload(file){
  if (!file) throw new Error("Aucun fichier sélectionné.");
  const name = String(file.name || "Document.pdf");
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(name);
  if (!isPdf) throw new Error("Choisis un fichier PDF.");
  return { blob: file, sourceKind: "file", pdfName: name };
}

export async function preparePdfUrlPayload(value){
  const source = normalizePdfUrl(value);
  if (!source) throw new Error("Entre une URL de PDF valide.");
  return { source, sourceKind: "url", pdfName: "PDF" };
}
